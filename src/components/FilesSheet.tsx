import { requireOptionalNativeModule } from 'expo';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClipboardCard } from '@/components/ClipboardCard';
import { lightTap, useScale } from '@/components/Glass';
import { useReveal } from '@/components/Reveal';
import { Sym } from '@/components/Sym';
import { ApiError } from '@/lib/api';
import { fetchFromPc, filesAvailable, openDownloaded, type PcFile, type RouteKind, sendFile, showOnPc, watchFolders } from '@/lib/files';
import { C, F } from '@/theme';

// To PC (the top bar's first button): send photos, videos or files from this phone to the PC (they land in
// Downloads\From Phone), and pick up whatever is in the PC's Downloads\To Phone. Each transfer goes the nearest way:
// the same Wi-Fi, else Tailscale, else the internet. The badge says which.
// Live while open: the PC answers the moment either folder changes. A file dropped into To Phone while the sheet is
// open shows at once ("Arriving on the PC" while it is still being copied there) and then downloads by itself, with
// a progress bar; tap it when it is done to open it.
type FS = typeof import('expo-file-system');
type Picker = typeof import('expo-image-picker');
/* eslint-disable @typescript-eslint/no-require-imports */
const fs: FS | null = requireOptionalNativeModule('FileSystem') ? require('expo-file-system') : null;
const picker: Picker | null = requireOptionalNativeModule('ExponentImagePicker') ? require('expo-image-picker') : null;
/* eslint-enable @typescript-eslint/no-require-imports */

const ROUTE: Record<RouteKind, { label: string; color: string }> = {
  wifi: { label: 'Wi-Fi', color: '#3DDC97' }, tailscale: { label: 'Tailscale', color: '#62A8FF' }, internet: { label: 'Internet', color: '#FFB547' },
};
type Job = { key: string; name: string; dir: 'up' | 'down'; size: number; sent: number; route?: RouteKind; state: 'going' | 'done' | 'failed'; note?: string; uri?: string };

const size = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : b < 1073741824 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1073741824).toFixed(2)} GB`;
const when = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};
let seq = 0;
const nextKey = () => `j${++seq}-${Date.now()}`;
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const AUTO_MAX = 500 * 1024 * 1024; // bigger new files wait for a tap
const saved = new Map<string, string>(); // name|size -> where it is on this phone (this app run)
const savedKey = (f: PcFile) => `${f.name}|${f.size}`;
let known: Set<string> | null = null; // To Phone files already seen, so only new arrivals download by themselves
function markSaved(f: PcFile, uri: string | null) { if (uri === null) saved.delete(savedKey(f)); else saved.set(savedKey(f), uri); }
function noteSeen(ready: PcFile[]) { known = new Set([...(known ?? []), ...ready.map(savedKey)]); }
const errText = (e: unknown) => (e instanceof ApiError ? e.message : String((e as Error)?.message ?? "Couldn't reach your PC."));

export function FilesSheet({ open, origin, onClose }: { open: boolean; origin: { x: number; y: number }; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const r = useReveal(open, origin);
  const [route, setRoute] = useState<RouteKind | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [outbox, setOutbox] = useState<PcFile[] | null>(null);
  const [inbox, setInbox] = useState<PcFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [arrived, setArrived] = useState<PcFile[]>([]); // new in To Phone while open: download them
  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    void watchFolders(ctl.signal, (c, rt) => {
      setRoute(rt); setOutbox(c.outbox); setInbox(c.inbox.slice(0, 12)); setError(null);
      const ready = c.outbox.filter((f) => !f.growing);
      const seen = known;
      if (seen) {
        const fresh = ready.filter((f) => !seen.has(savedKey(f)) && f.size <= AUTO_MAX && !saved.has(savedKey(f)));
        if (fresh.length) setArrived(fresh);
      }
      noteSeen(ready);
    }, (e) => setError(errText(e)));
    return () => ctl.abort();
  }, [open]);

  const update = (key: string, j: Partial<Job>) => setJobs((list) => list.map((x) => (x.key === key ? { ...x, ...j } : x)));
  const send = async (items: { uri: string; name: string; size: number }[]) => {
    const fresh = items.map<Job>((it, n) => ({ key: `${nextKey()}-${n}`, name: it.name, dir: 'up', size: it.size, sent: 0, state: 'going', uri: it.uri }));
    setJobs((list) => [...fresh, ...list].slice(0, 30));
    for (const j of fresh) await sendOne(j);
  };
  const sendOne = async (j: Job) => {
    update(j.key, { state: 'going', note: undefined, sent: 0 });
    try {
      const name = await sendFile(j.uri!, j.name, (p) => { update(j.key, { sent: p.sent, size: p.size, route: p.route }); setRoute(p.route); });
      update(j.key, { state: 'done', sent: j.size, note: `In From Phone as ${name}` });
    } catch (e) { update(j.key, { state: 'failed', note: errText(e) }); }
  };
  const pickPhotos = async () => {
    if (!picker) return setError('Photos arrive with the next app build. Use Files for now.');
    const res = await picker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 1, exif: false,
      preferredAssetRepresentationMode: picker.UIImagePickerPreferredAssetRepresentationMode.Current,
    });
    if (res.canceled) return;
    void send(res.assets.map((a, n) => ({ uri: a.uri, name: a.fileName ?? `photo-${stamp()}-${n}.${a.type === 'video' ? 'mov' : 'jpg'}`, size: a.fileSize ?? 0 })));
  };
  const pickFiles = async () => {
    if (!fs) return setError('File sharing arrives with the next app build.');
    try {
      const res = await fs.File.pickFileAsync({ multipleFiles: true });
      if (res.canceled) return;
      void send(res.result.map((f) => ({ uri: f.uri, name: f.name, size: f.size ?? 0 })));
    } catch (e) { setError(errText(e)); }
  };
  const download = async (f: PcFile, openIt = true) => {
    const have = saved.get(savedKey(f));
    if (have) { openDownloaded(have).catch((e) => setError(errText(e))); return; }
    if (have === '') return; // already coming
    const key = nextKey();
    markSaved(f, ''); // taken: no second download of the same file
    setJobs((list) => [{ key, name: f.name, dir: 'down' as const, size: f.size, sent: 0, state: 'going' as const }, ...list].slice(0, 30));
    try {
      const res = await fetchFromPc(f.name, f.size, (p) => { update(key, { sent: p.got, size: p.size, route: p.route }); setRoute(p.route); }, openIt);
      markSaved(f, res.uri);
      update(key, { state: 'done', sent: f.size, uri: res.uri, note: openIt ? 'Saved on this phone' : 'Saved on this phone · tap to open' });
    } catch (e) { markSaved(f, null); update(key, { state: 'failed', note: errText(e) }); }
  };

  useEffect(() => {
    if (!arrived.length) return;
    const id = setTimeout(() => { setArrived([]); for (const f of arrived) void download(f, false); }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrived]);

  if (!r.ever) return null;
  const badge = route ? ROUTE[route] : null;
  return (
    <Animated.View style={[r.shell, !r.mounted && s.hidden]} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={r.stage}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, s.tint]} />
        <Animated.View style={[s.content, { width: r.width, height: r.height, paddingTop: insets.top + 12 }, r.content]}>
          <View style={s.header}>
            <Text style={s.title}>Files</Text>
            {badge ? (
              <View style={s.badge}><View style={[s.dot, { backgroundColor: badge.color }]} /><Text style={s.badgeText}>{badge.label}</Text></View>
            ) : null}
            <View style={{ flex: 1 }} />
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={() => { lightTap(); onClose(); }} style={s.close}>
              <Sym name="xmark" size={16} fallback={<Text style={s.closeX}>×</Text>} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: insets.bottom + 24 }}>
            <View style={s.sendRow}>
              <BigButton icon="photo.on.rectangle" label="Photos" sub="to PC" onPress={pickPhotos} />
              <BigButton icon="folder" label="Files" sub="to PC" onPress={pickFiles} />
            </View>
            {!filesAvailable ? <Text style={s.note}>File sharing arrives with the next app build.</Text> : null}
            {error ? <Text style={s.error}>{error}</Text> : null}

            <ClipboardCard open={open} />

            {jobs.length ? <Text style={s.section}>Transfers</Text> : null}
            {jobs.map((j) => <JobRow key={j.key} job={j} onRetry={() => void sendOne(j)}
              onOpen={() => { if (j.uri) { lightTap(); openDownloaded(j.uri).catch((e) => setError(errText(e))); } }} />)}

            <View style={s.sectionRow}>
              <Text style={s.section}>On the PC · To Phone</Text>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { lightTap(); showOnPc('outbox').catch((e) => setError(errText(e))); }}>
                <Text style={s.link}>Open folder on PC</Text>
              </Pressable>
            </View>
            {outbox === null ? <ActivityIndicator color={C.muted} /> : outbox.length === 0 ? (
              <Text style={s.note}>Put files in Downloads\To Phone on the PC and they show up here.</Text>
            ) : outbox.map((f) => (
              <FileRow key={f.name} file={f} icon={saved.get(savedKey(f)) ? 'checkmark.circle' : 'arrow.down.circle'}
                onPress={() => { if (f.growing) return; lightTap(); void download(f); }} />
            ))}

            {inbox && inbox.length ? <Text style={s.section}>Sent to the PC</Text> : null}
            {inbox?.map((f) => (
              <FileRow key={f.name} file={f} icon="magnifyingglass" onPress={() => { lightTap(); showOnPc('inbox', f.name).catch((e) => setError(errText(e))); }} />
            ))}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

function BigButton({ icon, label, sub, onPress }: { icon: 'photo.on.rectangle' | 'folder'; label: string; sub: string; onPress: () => void }) {
  const p = useScale(0.95);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${sub}`} style={{ flex: 1 }}
      onPressIn={() => p.set(p.to)} onPressOut={() => p.set(1)} onPress={() => { lightTap(); onPress(); }}>
      <Animated.View style={[s.big, p.style]}>
        <Sym name={icon} size={26} color={C.text} fallback={null} />
        <Text style={s.bigLabel}>{label}</Text>
        <Text style={s.bigSub}>{sub}</Text>
      </Animated.View>
    </Pressable>
  );
}

function JobRow({ job, onRetry, onOpen }: { job: Job; onRetry: () => void; onOpen: () => void }) {
  const f = job.size ? Math.min(job.sent / job.size, 1) : job.state === 'done' ? 1 : 0;
  const pct = Math.round(f * 100);
  return (
    <Pressable accessibilityRole="button" disabled={!(job.state === 'done' && job.uri)} onPress={onOpen}>
    <Animated.View entering={FadeIn.duration(160)} layout={LinearTransition.duration(180)} style={s.job}>
      <Sym name={job.dir === 'up' ? 'arrow.up.circle.fill' : 'arrow.down.circle.fill'} size={22}
        color={job.state === 'failed' ? C.danger : job.state === 'done' ? '#3DDC97' : C.muted} fallback={null} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={s.fileName} numberOfLines={1}>{job.name}</Text>
        {job.state === 'going' ? (
          <View style={s.bar}><View style={[s.barFill, { width: `${f * 100}%` }]} /></View>
        ) : null}
        <Text style={[s.fileMeta, job.state === 'failed' && { color: C.danger }]} numberOfLines={2}>
          {job.state === 'going' ? `${size(job.sent)} of ${size(job.size)}${job.route ? ` · ${ROUTE[job.route].label}` : ''}` : job.note}
        </Text>
      </View>
      {job.state === 'going' ? <Text style={s.pct}>{pct}%</Text> : null}
      {job.state === 'failed' && job.dir === 'up' ? (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { lightTap(); onRetry(); }}><Text style={s.link}>Retry</Text></Pressable>
      ) : null}
    </Animated.View>
    </Pressable>
  );
}

function FileRow({ file, icon, onPress }: { file: PcFile; icon: 'arrow.down.circle' | 'checkmark.circle' | 'magnifyingglass'; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.job, pressed && { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
      <Sym name="doc" size={20} color={C.muted} fallback={null} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.fileName} numberOfLines={1}>{file.name}</Text>
        <Text style={s.fileMeta}>{file.growing ? `Arriving on the PC · ${size(file.size)}` : `${size(file.size)} · ${when(file.modified)}`}</Text>
      </View>
      {file.growing ? <ActivityIndicator color={C.muted} /> : <Sym name={icon} size={20} color={C.text} fallback={null} />}
    </Pressable>
  );
}

const s = StyleSheet.create({
  hidden: { display: 'none' },
  tint: { backgroundColor: 'rgba(9,10,14,0.94)' },
  content: { position: 'absolute', left: 0, top: 0, paddingHorizontal: 16, gap: 10 },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  title: { fontFamily: F.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.5, color: C.text },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontFamily: F.semibold, fontSize: 12, lineHeight: 16, color: C.text },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  closeX: { fontFamily: F.medium, fontSize: 22, lineHeight: 24, color: C.text },
  sendRow: { flexDirection: 'row', gap: 10 },
  big: {
    height: 112, borderRadius: 22, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  bigLabel: { fontFamily: F.semibold, fontSize: 16, lineHeight: 20, color: C.text, marginTop: 4 },
  bigSub: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint },
  section: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.muted, marginTop: 10, paddingHorizontal: 4 },
  sectionRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  link: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: '#9A90FF', paddingHorizontal: 4 },
  note: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.faint, paddingHorizontal: 4 },
  error: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.danger, paddingHorizontal: 4 },
  job: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderCurve: 'continuous', backgroundColor: 'rgba(255,255,255,0.04)' },
  fileName: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.text },
  fileMeta: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint, fontVariant: ['tabular-nums'] },
  bar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  barFill: { height: 4, backgroundColor: '#766BE6' },
  pct: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.text, fontVariant: ['tabular-nums'], minWidth: 40, textAlign: 'right' },
});
