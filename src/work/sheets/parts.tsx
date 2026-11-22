import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { lightTap } from '@/components/Glass';
import { ApiError } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { C, F } from '@/theme';
import { workApi } from '../api';
import { useFanProjects } from '../store';
import type { Folder, FolderSuggestion, ProjectCard } from '../types';
import type { Dictation } from '../voice';
import { Chip, Glyph, Press, REC, AMBER, SectionLabel, sheetStyles } from './Sheet';

// Parts the capture sheets share: the project chip with its picker, the dictate-and-append mic, the folder editor.

/** `C:\Users\<name>\x` as `~\x`, the way the hub shows folders. */
export const shortPath = (p: string) => p.replace(/^[A-Za-z]:\\Users\\[^\\]+/, '~');
const lastPart = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;
export const nameOf = (projects: ProjectCard[] | null, slug: string | null) =>
  slug ? projects?.find((p) => p.slug === slug)?.name ?? slug : 'Inbox';
/** The folder a job starts in by default: the one marked start, else the first. */
export const startFolder = (p: ProjectCard | null | undefined) => p?.folders.find((f) => f.start) ?? p?.folders[0] ?? null;

// ---- project chip ----
/** The chip in a sheet's footer. Tap to open the picker row (rendered by the sheet above its footer). */
export function ProjectChip({ slug, open, onToggle }: { slug: string | null; open: boolean; onToggle: () => void }) {
  const projects = useFanProjects();
  return (
    <Chip label={nameOf(projects, slug)} selected={open} onPress={onToggle} a11y={`Project: ${nameOf(projects, slug)}. Change`}
      trailing={<Glyph name={open ? 'chevron.down' : 'chevron.up'} size={12} color={open ? '#0B0C10' : C.muted} alt={open ? '⌄' : '⌃'} />} />
  );
}

/** Inbox and every project, pinned first, in one scrolling row. */
export function ProjectPicker({ slug, onPick, allowInbox = true }: { slug: string | null; onPick: (slug: string | null) => void; allowInbox?: boolean }) {
  const projects = useFanProjects();
  return (
    <Animated.View entering={FadeIn.duration(160)} style={s.pickerWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.picker}>
        {allowInbox ? <Chip label="Inbox" selected={slug === null} onPress={() => onPick(null)} /> : null}
        {projects === null ? (
          <View style={s.pickerLoading}><ActivityIndicator size="small" color={C.muted} /><Text style={sheetStyles.note}>Loading projects</Text></View>
        ) : projects.length === 0 ? (
          <Text style={[sheetStyles.note, { alignSelf: 'center' }]}>No projects yet</Text>
        ) : projects.map((p) => (
          <Chip key={p.slug} label={p.name} selected={p.slug === slug} onPress={() => onPick(p.slug)} />
        ))}
      </ScrollView>
    </Animated.View>
  );
}

// ---- dictate and append ----
/** The round mic: tap to talk, tap again to add the words. Red while it records. */
export function MicButton({ d, size = 40 }: { d: Dictation; size?: number }) {
  const on = d.state === 'recording';
  const busy = d.state === 'finishing';
  return (
    <Press label={on ? 'Stop and add the words' : busy ? 'Adding the words' : 'Dictate'} onPress={d.toggle} disabled={busy}
      hint={on ? undefined : 'Talk, then tap again. The words are added after what is typed.'}
      style={[s.mic, { width: size, height: size, borderRadius: size / 2 }, on && { backgroundColor: REC }]}>
      {busy ? <ActivityIndicator size="small" color={C.text} />
        : on ? <View style={s.stop} />
        : <Glyph name="mic.fill" size={18} alt="●" />}
    </Press>
  );
}

/** Under a field while dictating: the words as the PC hears them, the time, and anything wrong. */
export function DictationLine({ d }: { d: Dictation }) {
  if (d.state === 'idle' && !d.error) return null;
  return (
    <Animated.View entering={FadeIn.duration(160)} style={s.dictation} accessibilityLiveRegion="polite">
      {d.state !== 'idle' ? (
        <View style={s.dictHead}>
          {d.state === 'recording' ? <View style={s.recDot} /> : null}
          <Text style={s.dictLabel}>{d.state === 'recording' ? 'Listening' : 'Adding the words'}</Text>
          {d.since ? <Elapsed since={d.since} style={s.dictTime} /> : null}
        </View>
      ) : null}
      {d.live ? <Text style={s.dictLive} numberOfLines={3}>{d.live}</Text> : null}
      {d.offline ? <Text style={[sheetStyles.note, { color: AMBER }]}>PC not reached. Still saving on this phone.</Text> : null}
      {d.error ? <Text style={sheetStyles.error}>{d.error}</Text> : null}
    </Animated.View>
  );
}

/** m:ss since `since`, ticking twice a second. */
export function Elapsed({ since, style }: { since: number; style?: object }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const tick = () => setSec(Math.max(0, Math.floor((Date.now() - since) / 1000)));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 500);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [since]);
  return <Text style={[s.elapsed, style]}>{`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`}</Text>;
}

// ---- folders ----
const ago = (iso: string | null) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};
const samePath = (a: string, b: string) => a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase();
const ABSOLUTE = /^([A-Za-z]:[\\/]|\\\\|\/)/;

function demoSuggestions(): FolderSuggestion[] {
  const U = 'C:\\Users\\VEDANT';
  return [
    { name: 'agentic-os-mobile', path: `${U}\\agentic-os-mobile`, at: new Date(Date.now() - 6 * 60_000).toISOString() },
    { name: 'agentic-os-ios-ai', path: `${U}\\agentic-os-ios-ai`, at: new Date(Date.now() - 50 * 60_000).toISOString() },
    { name: 'content-os', path: `${U}\\content-os`, at: new Date(Date.now() - 300 * 60_000).toISOString() },
    { name: 'norrita-os', path: `${U}\\norrita-os`, at: new Date(Date.now() - 2000 * 60_000).toISOString() },
  ];
}

/** Recent Claude and Codex session folders from the PC, for one tap adding. */
function useSuggestions() {
  const [state, setState] = useState<{ list: FolderSuggestion[] | null; error: string | null }>({ list: null, error: null });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    const run = DEMO ? Promise.resolve({ folders: demoSuggestions() }) : workApi.folderSuggestions();
    run.then((r) => { if (alive) setState({ list: r.folders, error: null }); })
      .catch((e) => { if (alive) setState({ list: null, error: e instanceof ApiError ? e.message : 'Couldn’t load recent folders.' }); });
    return () => { alive = false; };
  }, [nonce]);
  return { ...state, retry: () => { setState({ list: null, error: null }); setNonce((n) => n + 1); } };
}

/** The project's folders in order: the first is where jobs start. Rename the label, move up, remove, add. */
export function FolderEditor({ folders, onChange }: { folders: Folder[]; onChange: (f: Folder[]) => void }) {
  const sug = useSuggestions();
  const [path, setPath] = useState('');
  const [pathError, setPathError] = useState<string | null>(null);
  const has = (p: string) => folders.some((f) => samePath(f.path, p));
  const add = (p: string, label?: string) => {
    const clean = p.trim().replace(/^"|"$/g, '');
    if (!ABSOLUTE.test(clean)) { setPathError('Use the full path, for example C:\\Users\\you\\project.'); return false; }
    if (has(clean)) { setPathError('That folder is already in the list.'); return false; }
    setPathError(null);
    onChange([...folders, { path: clean, label: label ?? lastPart(clean) }]);
    return true;
  };
  const move = (i: number) => { const n = [...folders]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); };
  const remove = (i: number) => onChange(folders.filter((_, j) => j !== i));
  const rename = (i: number, label: string) => onChange(folders.map((f, j) => (j === i ? { ...f, label } : f)));
  const fresh = sug.list?.filter((x) => !has(x.path)) ?? null;

  return (
    <View style={{ gap: 8 }}>
      <SectionLabel>Folders</SectionLabel>
      {folders.length === 0 ? (
        <Text style={sheetStyles.note}>No folders yet. Ideas and tasks work without one; a job needs one to run in.</Text>
      ) : (
        <View style={[sheetStyles.box, { paddingVertical: 4 }]}>
          {folders.map((f, i) => (
            <View key={f.path} style={[s.folder, i > 0 && s.folderLine]}>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={s.folderTop}>
                  <TextInput value={f.label} onChangeText={(t) => rename(i, t)} placeholder="Label" placeholderTextColor={C.faint}
                    accessibilityLabel={`Label for ${shortPath(f.path)}`} style={s.folderLabel} maxLength={24} />
                  {i === 0 ? <Text style={s.startTag}>Jobs start here</Text> : null}
                </View>
                <Text style={s.folderPath} numberOfLines={1} ellipsizeMode="middle">{shortPath(f.path)}</Text>
              </View>
              {i > 0 ? (
                <Press label={`Move ${f.label || 'folder'} up`} onPress={() => move(i)} style={s.iconBtn}>
                  <Glyph name="arrow.up" size={14} color={C.muted} alt="↑" />
                </Press>
              ) : null}
              <Press label={`Remove ${f.label || 'folder'}`} onPress={() => remove(i)} style={s.iconBtn}>
                <Glyph name="xmark" size={14} color={C.muted} alt="×" />
              </Press>
            </View>
          ))}
        </View>
      )}

      <View style={s.addRow}>
        <TextInput value={path} onChangeText={(t) => { setPath(t); setPathError(null); }} placeholder="Paste a folder path"
          placeholderTextColor={C.faint} autoCapitalize="none" autoCorrect={false} returnKeyType="done"
          onSubmitEditing={() => { if (path.trim() && add(path)) setPath(''); }}
          accessibilityLabel="Folder path" style={[sheetStyles.box, s.addField]} />
        <Press label="Add folder" onPress={() => { if (add(path)) setPath(''); }} disabled={!path.trim()} style={s.addBtn}>
          <Text style={s.addText}>Add</Text>
        </Press>
      </View>
      {pathError ? <Text style={sheetStyles.error}>{pathError}</Text> : null}

      <Text style={[s.sugLabel]}>Recent folders</Text>
      {sug.error ? (
        <View style={s.sugState}>
          <Text style={[sheetStyles.note, { flex: 1 }]}>{sug.error}</Text>
          <Pressable accessibilityRole="button" onPress={() => { lightTap(); sug.retry(); }} hitSlop={8}><Text style={s.link}>Retry</Text></Pressable>
        </View>
      ) : fresh === null ? (
        <View style={s.sugState}><ActivityIndicator size="small" color={C.muted} /><Text style={sheetStyles.note}>Finding folders you worked in</Text></View>
      ) : fresh.length === 0 ? (
        <Text style={sheetStyles.note}>{sug.list?.length ? 'All of them are added.' : 'No recent folders. Paste a path above.'}</Text>
      ) : (
        fresh.slice(0, 8).map((x) => (
          <Press key={x.path} label={`Add ${x.name}`} onPress={() => add(x.path, x.name)} style={s.sug}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.sugName} numberOfLines={1}>{x.name}</Text>
              <Text style={s.folderPath} numberOfLines={1} ellipsizeMode="middle">{shortPath(x.path)}</Text>
            </View>
            <Text style={s.sugAt}>{ago(x.at)}</Text>
            <Glyph name="plus" size={14} color={C.muted} alt="+" />
          </Press>
        ))
      )}
    </View>
  );
}

/** Labels left empty fall back to the folder's name; the first folder is marked as the start. */
export function finalFolders(folders: Folder[]): Folder[] {
  return folders.map((f, i) => ({ path: f.path, label: f.label.trim() || lastPart(f.path), ...(i === 0 ? { start: true } : {}) }));
}

const s = StyleSheet.create({
  pickerWrap: { paddingTop: 12 },
  picker: { gap: 8, paddingHorizontal: 16 },
  pickerLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 32 },
  mic: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  stop: { width: 12, height: 12, borderRadius: 2, backgroundColor: '#fff' },
  dictation: { gap: 4, paddingTop: 4 },
  dictHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: REC },
  dictLabel: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
  dictTime: { color: C.muted },
  dictLive: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.muted },
  elapsed: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.text, fontVariant: ['tabular-nums'] },
  folder: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 12, paddingRight: 4, paddingVertical: 8 },
  folderLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.10)' },
  folderTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  folderLabel: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24, color: C.text, paddingVertical: 0, minWidth: 48, maxWidth: 160 },
  startTag: {
    fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.muted, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden',
  },
  folderPath: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.faint },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addField: { flex: 1, height: 40, paddingHorizontal: 12, fontFamily: F.regular, fontSize: 14, color: C.text },
  addBtn: { height: 40, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  addText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
  sugLabel: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted, paddingTop: 8 },
  sugState: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  sug: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)' },
  sugName: { fontFamily: F.medium, fontSize: 16, lineHeight: 24, color: C.text },
  sugAt: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint },
  link: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
});
