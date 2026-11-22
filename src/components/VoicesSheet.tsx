import { requireOptionalNativeModule } from 'expo';
import { BlurView } from 'expo-blur';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lightTap, useScale } from '@/components/Glass';
import { useReveal } from '@/components/Reveal';
import { Sym } from '@/components/Sym';
import { api, API, ApiError, currentToken } from '@/lib/api';
import { gptAvailable, localTakes, localUri, useGptRecorder } from '@/lib/gpt';
import { plog } from '@/lib/log';
import { C, F } from '@/theme';

// Voices (the top bar's waveform button): every GPT dictation, newest first, the time on the left. Tap a row to open
// it: the full text (selectable), a player with a slider, Copy, and Transcribe, which runs it through Codex again
// with the words appearing as they come. Takes live on the PC (/pc/takes, pc-take.ts); a take the PC hasn't got yet
// still shows, from this phone's own copy. The record button at the bottom is voice mode: talk, the words appear as
// the PC hears them, stop, and the take is saved here (nothing is typed on the PC).
type Audio = typeof import('expo-audio');
type FS = typeof import('expo-file-system');
type Clip = typeof import('expo-clipboard');
/* eslint-disable @typescript-eslint/no-require-imports */
const audio: Audio | null = requireOptionalNativeModule('ExpoAudio') ? require('expo-audio') : null;
const fs: FS | null = requireOptionalNativeModule('FileSystem') ? require('expo-file-system') : null;
const clip: Clip | null = requireOptionalNativeModule('ExpoClipboard') ? require('expo-clipboard') : null;
/* eslint-enable @typescript-eslint/no-require-imports */

const ACCENT = '#766BE6';
type Take = {
  id: string; createdAt: string; status: 'recording' | 'finishing' | 'transcribing' | 'done' | 'failed';
  seconds: number; text: string; error?: string; v: number; phoneOnly?: boolean;
};
type Row = { kind: 'day'; key: string; label: string } | { kind: 'take'; key: string; take: Take };

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dur = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function dayLabel(iso: string) {
  const d = new Date(iso), now = new Date();
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() && { year: 'numeric' }) });
}

/** The takes: the PC's list, plus any this phone has that the PC hasn't got yet. Refreshes while one is in progress. */
function useTakes(open: boolean) {
  const [takes, setTakes] = useState<Take[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    let pc: Take[] = [];
    try { pc = (await api<{ takes: Take[] }>('/pc/takes')).takes; setError(null); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Couldn't reach your PC."); }
    const have = new Set(pc.map((t) => t.id));
    const mine = localTakes().filter((t) => !have.has(t.id) && !t.finished).map<Take>((t) => ({
      id: t.id, createdAt: t.createdAt, status: 'recording', seconds: 0, text: '', v: 0, phoneOnly: true,
    }));
    setTakes([...pc, ...mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, []);
  const busy = takes?.some((t) => t.status !== 'done' && t.status !== 'failed' && !t.phoneOnly) ?? false;
  useEffect(() => {
    if (!open) return;
    const first = setTimeout(load, 0); // on open, then every few seconds while a take is in progress
    const id = busy ? setInterval(load, 4000) : null;
    return () => { clearTimeout(first); if (id) clearInterval(id); };
  }, [open, busy, load]);
  const patch = useCallback((t: Partial<Take> & { id: string }) => setTakes((list) => list?.map((x) => (x.id === t.id ? { ...x, ...t } : x)) ?? list), []);
  return { takes, error, reload: load, patch };
}

export function VoicesSheet({ open, origin, onClose }: { open: boolean; origin: { x: number; y: number }; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const r = useReveal(open, origin);
  const { takes, error, reload, patch } = useTakes(open);
  const [openId, setOpenId] = useState<string | null>(null);
  const player = usePlayer();
  useEffect(() => { if (!open) player.pause(); }, [open, player]);
  const rec = useRecord(useCallback((id: string) => { void reload().then(() => setOpenId(id)); }, [reload]));
  const { stop: stopRec, phase: recPhase } = rec;
  useEffect(() => { if (!open && recPhase === 'recording') void stopRec(); }, [open, recPhase, stopRec]);
  if (!r.ever) return null;

  const rows: Row[] = [];
  let day = '';
  for (const t of takes ?? []) {
    const l = dayLabel(t.createdAt);
    if (l !== day) { day = l; rows.push({ kind: 'day', key: `d-${l}`, label: l }); }
    rows.push({ kind: 'take', key: t.id, take: t });
  }
  return (
    <Animated.View style={[r.shell, !r.mounted && s.hidden]} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={r.stage}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, s.tint]} />
        <Animated.View style={[s.content, { width: r.width, height: r.height, paddingTop: insets.top + 12 }, r.content]}>
          <View style={s.header}>
            <Text style={s.title}>Voices</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={() => { lightTap(); onClose(); }} style={s.close}>
              <Sym name="xmark" size={16} fallback={<Text style={s.closeX}>×</Text>} />
            </Pressable>
          </View>
          {error ? <Text style={s.note}>{error}</Text> : null}
          {rec.phase !== 'idle' || rec.error ? <RecordCard rec={rec} /> : null}
          {takes === null ? (
            <ActivityIndicator color={C.muted} style={{ marginTop: 40 }} />
          ) : takes.length === 0 ? (
            <Text style={[s.note, { marginTop: 24 }]}>Nothing yet. Tap the record button and talk; every take lands here.</Text>
          ) : (
            <FlatList data={rows} keyExtractor={(x) => x.key} onRefresh={reload} refreshing={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => item.kind === 'day'
                ? <Text style={s.day}>{item.label}</Text>
                : <TakeRow take={item.take} open={openId === item.take.id} player={player} patch={patch}
                    onToggle={() => setOpenId((cur) => (cur === item.take.id ? null : item.take.id))} />} />
          )}
          <RecordButton rec={rec} bottom={insets.bottom + 20} width={r.width} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

// ---- voice mode: record a take from this page ----
function useRecord(onSaved: (id: string) => void) {
  const g = useGptRecorder();
  const [phase, setPhase] = useState<'idle' | 'recording' | 'saving'>('idle');
  const [since, setSince] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);
  const { start: gStart, finish: gFinish, cancel: gCancel } = g;
  const start = useCallback(async () => {
    setError(null);
    const tid = newTakeId();
    try { await gStart({ id: tid }); setId(tid); setSince(nowMs()); setPhase('recording'); }
    catch (e) { plog('voices start', e); setError(String((e as Error)?.message ?? e)); }
  }, [gStart]);
  const stop = useCallback(async () => {
    setPhase('saving');
    try { await gFinish('none'); if (id) onSaved(id); }
    catch (e) { plog('voices finish', e); setError(String((e as Error)?.message ?? e)); }
    finally { setPhase('idle'); }
  }, [gFinish, id, onSaved]);
  const cancel = useCallback(() => { gCancel(); setPhase('idle'); }, [gCancel]);
  return { phase, since, error, live: g.live, offline: g.offline, start, stop, cancel };
}
type Rec = ReturnType<typeof useRecord>;
const nowMs = () => Date.now();
const newTakeId = () => `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function RecordCard({ rec }: { rec: Rec }) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const secs = useTicker(rec.phase === 'recording' ? rec.since : 0);
  const label = rec.phase === 'recording' ? `Listening ${dur(secs)}` : rec.phase === 'saving' ? 'Finishing…' : 'Couldn’t record';
  return (
    <Animated.View entering={FadeIn.duration(160)} style={s.recCard}>
      <View style={s.recHead}>
        {rec.phase === 'recording' ? <View style={s.recDot} /> : null}
        <Text style={s.recLabel}>{label}{rec.offline ? '  ·  saving on the phone' : ''}</Text>
      </View>
      {rec.live ? (
        <ScrollView ref={scroll} style={{ maxHeight: 140 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
          <Text selectable style={s.recLive}>{rec.live}</Text>
        </ScrollView>
      ) : rec.phase === 'recording' ? <Text style={s.note}>Talk. The words show here every few seconds.</Text> : null}
      {rec.error ? <Text style={[s.note, { color: '#FF7A7A' }]}>{rec.error}</Text> : null}
    </Animated.View>
  );
}

/** Seconds since `from` (0 when not running), ticking once a second. */
function useTicker(from: number) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!from) return;
    const tick = () => setNow(Math.floor((nowMs() - from) / 1000));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [from]);
  return from ? now : 0;
}

function RecordButton({ rec, bottom, width }: { rec: Rec; bottom: number; width: number }) {
  const p = useScale(0.92);
  const on = rec.phase === 'recording';
  const label = on ? 'Stop and save' : rec.phase === 'saving' ? 'Saving' : 'Record a voice note';
  return (
    <View pointerEvents="box-none" style={[s.recWrap, { bottom, width }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={10} disabled={!gptAvailable || rec.phase === 'saving'}
        onPress={() => { lightTap(); void (on ? rec.stop() : rec.start()); }}
        onPressIn={() => p.set(p.to)} onPressOut={() => p.set(1)}>
        <Animated.View style={[s.recBtn, on && s.recBtnOn, !gptAvailable && { opacity: 0.4 }, p.style]}>
          {rec.phase === 'saving' ? <ActivityIndicator color="#fff" />
            : on ? <View style={s.recStop} />
            : <Sym name="mic.fill" size={26} color="#fff" fallback={<View style={s.recIdleDot} />} />}
        </Animated.View>
      </Pressable>
      {!gptAvailable ? <Text style={s.note}>Recording arrives with the next app build.</Text> : null}
    </View>
  );
}

function TakeRow({ take, open, onToggle, player, patch }: {
  take: Take; open: boolean; onToggle: () => void; player: ReturnType<typeof usePlayer>; patch: (t: Partial<Take> & { id: string }) => void;
}) {
  const p = useScale(0.98);
  const working = take.status === 'transcribing' || take.status === 'finishing';
  const [copied, setCopied] = useState(false);
  const transcribe = async () => {
    lightTap();
    try {
      let t = await api<Take>(`/pc/take/${take.id}/transcribe`, { method: 'POST', body: {} });
      patch(t);
      while (t.status === 'transcribing') { // the words as Codex returns them
        t = await api<Take>(`/pc/take/${take.id}?v=${t.v}&wait=20`);
        patch(t);
      }
    } catch (e) { patch({ id: take.id, error: e instanceof ApiError ? e.message : "Couldn't reach your PC." }); }
  };
  const copy = () => {
    if (!clip || !take.text) return;
    lightTap();
    void clip.setStringAsync(take.text);
    setCopied(true); setTimeout(() => setCopied(false), 1400);
  };
  const status = take.phoneOnly ? 'On this phone. Goes to the PC when it can.'
    : take.status === 'recording' ? 'Recording…' : working ? 'Transcribing…' : !take.text ? (take.error ?? 'No words heard.') : null;
  return (
    <Animated.View layout={LinearTransition.duration(200)} style={[s.row, open && s.rowOpen]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => { lightTap(); onToggle(); }}
        onPressIn={() => p.set(p.to)} onPressOut={() => p.set(1)}>
        <Animated.View style={[s.rowHead, p.style]}>
          <Text style={s.time}>{clock(take.createdAt)}</Text>
          <View style={{ flex: 1, gap: 2 }}>
            {take.text && !open ? <Text style={s.preview} numberOfLines={2}>{take.text}</Text> : null}
            {status && !(open && take.text) ? <Text style={[s.status, working && { color: ACCENT }]} numberOfLines={2}>{status}</Text> : null}
            {open && take.text ? <Text style={s.preview} numberOfLines={1}>{dur(take.seconds)} · {take.text.split(/\s+/).length} words</Text> : null}
          </View>
          {take.seconds > 0 ? <Text style={s.len}>{dur(take.seconds)}</Text> : null}
        </Animated.View>
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn.duration(180)} style={s.body}>
          {take.text ? <Text selectable style={s.full}>{take.text}</Text> : null}
          {working ? <ActivityIndicator color={ACCENT} style={{ alignSelf: 'flex-start' }} /> : null}
          <Player take={take} player={player} />
          <View style={s.actions}>
            <Action icon={copied ? 'checkmark' : 'doc.on.doc'} label={copied ? 'Copied' : 'Copy'} onPress={copy} disabled={!take.text || !clip} />
            <Action icon="text.bubble" label={working ? 'Transcribing' : 'Transcribe'} onPress={transcribe} disabled={working || !!take.phoneOnly} />
          </View>
          {!clip ? <Text style={s.note}>Copy arrives with the next app build; long-press the text to copy it now.</Text> : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function Action({ icon, label, onPress, disabled }: { icon: 'doc.on.doc' | 'checkmark' | 'text.bubble'; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [s.action, pressed && { backgroundColor: 'rgba(255,255,255,0.16)' }, disabled && { opacity: 0.4 }]}>
      <Sym name={icon} size={15} color={C.text} fallback={null} />
      <Text style={s.actionText}>{label}</Text>
    </Pressable>
  );
}

// ---- playback: one player for the page, so starting a take stops the last ----
function usePlayer() {
  const player = audio ? audio.useAudioPlayer(null, { updateInterval: 200 }) : null;
  const status = audio && player ? audio.useAudioPlayerStatus(player) : null;
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const files = useRef(new Map<string, string>());
  /** A local file for the take: this phone's own copy, else downloaded from the PC once (players want a file). */
  const fileFor = async (id: string) => {
    const mine = localUri(id);
    if (mine) return mine;
    const have = files.current.get(id);
    if (have) return have;
    const dir = new fs!.Directory(fs!.Paths.cache, 'voices');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const dest = new fs!.File(dir, `${id}.wav`);
    if (dest.exists) dest.delete(); // re-fetch: the take may have grown
    const t = currentToken();
    const f = await fs!.File.downloadFileAsync(`${API}/pc/take/${id}/audio`, dest, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
    files.current.set(id, f.uri);
    return f.uri;
  };
  const toggle = async (id: string) => {
    if (!player || !audio) return;
    if (current === id && status?.isLoaded) {
      if (status.playing) player.pause();
      else { if (status.duration && status.currentTime >= status.duration - 0.05) await player.seekTo(0); player.play(); }
      return;
    }
    setLoading(true);
    try {
      const uri = await fileFor(id);
      await audio.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      player.replace({ uri });
      setCurrent(id);
      player.play();
    } finally { setLoading(false); }
  };
  const pause = useCallback(() => { try { player?.pause(); } catch {} }, [player]);
  const seek = (sec: number) => { void player?.seekTo(sec); };
  return { ok: !!player && !!fs, current, loading, status, toggle, pause, seek };
}

function Player({ take, player }: { take: Take; player: ReturnType<typeof usePlayer> }) {
  if (!player.ok) return <Text style={s.note}>Playback arrives with the next app build.</Text>;
  const mine = player.current === take.id && player.status;
  const total = (mine && mine.duration) || take.seconds || 0;
  const at = mine ? mine.currentTime : 0;
  const playing = !!(mine && mine.playing);
  return (
    <View style={s.player}>
      <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} hitSlop={6} style={s.play}
        onPress={() => { lightTap(); void player.toggle(take.id); }}>
        {player.loading && player.current !== take.id ? <ActivityIndicator color="#0B0C10" size="small" />
          : <Sym name={playing ? 'pause.fill' : 'play.fill'} size={16} color="#0B0C10" fallback={<Text style={{ color: '#0B0C10' }}>{playing ? '❚❚' : '▶'}</Text>} />}
      </Pressable>
      <Scrubber value={total ? at / total : 0} onSeek={(f) => { if (mine) player.seek(f * total); }} />
      <Text style={s.clock}>{dur(at)} / {dur(total)}</Text>
    </View>
  );
}

/** A slider: tap or drag anywhere on the track. */
function Scrubber({ value, onSeek }: { value: number; onSeek: (f: number) => void }) {
  const [w, setW] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const v = drag ?? Math.min(Math.max(value, 0), 1);
  const at = (x: number) => (w ? Math.min(Math.max(x / w, 0), 1) : 0);
  return (
    <View style={s.track} onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => setDrag(at(e.nativeEvent.locationX))}
      onResponderMove={(e) => setDrag(at(e.nativeEvent.locationX))}
      onResponderRelease={(e) => { onSeek(at(e.nativeEvent.locationX)); setDrag(null); }}
      onResponderTerminate={() => setDrag(null)}>
      <View pointerEvents="none" style={s.rail}><View style={[s.fill, { width: `${v * 100}%` }]} /></View>
      <View pointerEvents="none" style={[s.knob, { left: v * w - 7 }]} />
    </View>
  );
}

const s = StyleSheet.create({
  hidden: { display: 'none' },
  tint: { backgroundColor: 'rgba(9,10,14,0.94)' },
  content: { position: 'absolute', left: 0, top: 0, paddingHorizontal: 16, gap: 8 },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  title: { fontFamily: F.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.5, color: C.text },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  closeX: { fontFamily: F.medium, fontSize: 22, lineHeight: 24, color: C.text },
  note: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.faint, paddingHorizontal: 4 },
  day: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.muted, marginTop: 14, marginBottom: 6, paddingHorizontal: 4 },
  row: { borderRadius: 16, borderCurve: 'continuous', marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.04)' },
  rowOpen: { backgroundColor: 'rgba(255,255,255,0.08)' },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 12, paddingVertical: 12 },
  time: { width: 62, fontFamily: F.semibold, fontSize: 13, lineHeight: 20, color: C.muted, fontVariant: ['tabular-nums'] },
  preview: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.textSoft },
  status: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.faint },
  len: { fontFamily: F.medium, fontSize: 12, lineHeight: 20, color: C.faint, fontVariant: ['tabular-nums'] },
  body: { paddingHorizontal: 12, paddingBottom: 12, gap: 12 },
  full: { fontFamily: F.medium, fontSize: 16, lineHeight: 23, color: C.text },
  player: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  play: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.text },
  clock: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint, fontVariant: ['tabular-nums'] },
  track: { flex: 1, height: 32, justifyContent: 'center' },
  rail: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.16)', overflow: 'hidden' },
  fill: { height: 4, backgroundColor: ACCENT },
  knob: { position: 'absolute', top: 9, width: 14, height: 14, borderRadius: 7, backgroundColor: C.text },
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  actionText: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.text },
  recCard: { borderRadius: 16, borderCurve: 'continuous', padding: 12, gap: 8, backgroundColor: 'rgba(118,107,230,0.16)', borderWidth: 1, borderColor: 'rgba(118,107,230,0.4)' },
  recHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5A5F' },
  recLabel: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.text, fontVariant: ['tabular-nums'] },
  recLive: { fontFamily: F.medium, fontSize: 16, lineHeight: 23, color: C.text },
  recWrap: { position: 'absolute', left: 0, alignItems: 'center', gap: 6 },
  recBtn: {
    width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: ACCENT,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  recBtnOn: { backgroundColor: '#FF5A5F' },
  recStop: { width: 22, height: 22, borderRadius: 5, backgroundColor: '#fff' },
  recIdleDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
});
