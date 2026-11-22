import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Sym } from '@/components/Sym';
import { api, API, ApiError, currentToken } from '@/lib/api';
import { C, F } from '@/theme';

// The media remote: what's playing on the PC (Spotify, a browser tab, any app that shows in Windows' media panel)
// with its cover, play/pause, next and previous, the speakers' volume, and a TV-remote pad for videos (arrows seek
// or move, OK, Space, Esc, F for full screen). Keys go through `onKey` (the trackpad socket).
type State = { vol: number | null; muted: boolean; title?: string; artist?: string; app?: string; playing?: boolean; pos?: number; len?: number; at?: string; error?: string };
const POLL_MS = 2000;
const errText = (e: unknown) => (e instanceof ApiError ? e.message : String((e as Error)?.message ?? "Couldn't reach your PC."));
const tick = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const appName = (id?: string) => {
  if (!id) return '';
  const known: [RegExp, string][] = [[/spotify/i, 'Spotify'], [/chrome/i, 'Chrome'], [/msedge/i, 'Edge'], [/dia/i, 'Dia'], [/firefox/i, 'Firefox'], [/vlc/i, 'VLC'], [/zune|music/i, 'Media Player']];
  return known.find(([r]) => r.test(id))?.[1] ?? id.replace(/\.exe$/i, '').split(/[!\\.]/).filter(Boolean).pop() ?? '';
};
const nowMs = () => Date.now();

export function MediaPanel({ open, onKey }: { open: boolean; onKey: (k: string) => void }) {
  const [st, setSt] = useState<State | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [vol, setVol] = useState<number | null>(null); // while dragging
  const [now, setNow] = useState(nowMs);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const load = () => api<State>('/pc/media').then((s) => { if (live) { setSt(s); setErr(null); } }).catch((e) => { if (live) setErr(errText(e)); });
    const first = setTimeout(load, 0);
    const id = setInterval(load, POLL_MS);
    const clock = setInterval(() => setNow(nowMs()), 1000);
    return () => { live = false; clearTimeout(first); clearInterval(id); clearInterval(clock); };
  }, [open]);

  const send = async (body: { cmd?: string; vol?: number }) => {
    try { setSt(await api<State>('/pc/media', { method: 'POST', body })); } catch (e) { setErr(errText(e)); }
  };
  const cmd = (c: string) => { tick(); void send({ cmd: c }); };

  const len = st?.len ?? 0;
  const pos = st?.pos != null ? Math.min(len || Infinity, st.pos + (st.playing && st.at ? Math.max(0, (now - new Date(st.at).getTime()) / 1000) : 0)) : 0;
  const shownVol = vol ?? st?.vol ?? 0;
  const token = currentToken();
  const artKey = `${st?.title ?? ''}|${st?.artist ?? ''}`;

  return (
    <View style={{ gap: 14 }}>
      <View style={s.now}>
        {st?.title ? (
          <Image key={artKey} source={{ uri: `${API}/pc/media/art?k=${encodeURIComponent(artKey)}`, headers: token ? { Authorization: `Bearer ${token}` } : {} }}
            style={s.art} resizeMode="cover" />
        ) : <View style={[s.art, s.artEmpty]}><Sym name="music.note" size={26} color={C.faint} fallback={null} /></View>}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.title} numberOfLines={2}>{st?.title || (st ? 'Nothing playing' : 'Looking…')}</Text>
          {st?.artist ? <Text style={s.artist} numberOfLines={1}>{st.artist}</Text> : null}
          {st?.app ? <Text style={s.app} numberOfLines={1}>{appName(st.app)}</Text> : null}
        </View>
      </View>
      {len > 0 ? (
        <View style={{ gap: 4 }}>
          <View style={s.bar}><View style={[s.barFill, { width: `${Math.min(100, (pos / len) * 100)}%` }]} /></View>
          <View style={s.times}><Text style={s.time}>{mmss(pos)}</Text><Text style={s.time}>{mmss(len)}</Text></View>
        </View>
      ) : null}
      <View style={s.transport}>
        <Round icon="backward.fill" label="Previous" onPress={() => cmd('prev')} />
        <Round icon={st?.playing ? 'pause.fill' : 'play.fill'} label={st?.playing ? 'Pause' : 'Play'} big onPress={() => cmd('play')} />
        <Round icon="forward.fill" label="Next" onPress={() => cmd('next')} />
      </View>
      <View style={s.volRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={st?.muted ? 'Unmute' : 'Mute'} hitSlop={8} onPress={() => cmd('mute')}>
          <Sym name={st?.muted ? 'speaker.slash.fill' : 'speaker.wave.1.fill'} size={18} color={st?.muted ? C.danger : C.muted} fallback={null} />
        </Pressable>
        <VolSlider value={shownVol} onChange={setVol} onDone={(v) => { setVol(null); void send({ vol: v }); }} onLive={(v) => void send({ vol: v })} />
        <Text style={s.volText}>{Math.round(shownVol * 100)}</Text>
      </View>

      <Text style={s.section}>Remote</Text>
      <View style={s.pad}>
        <View style={s.padRow}><PadKey icon="chevron.up" label="Up" onPress={() => onKey('up')} /></View>
        <View style={s.padRow}>
          <PadKey icon="chevron.left" label="Left (seek back)" onPress={() => onKey('left')} />
          <PadKey text="OK" label="Enter" ok onPress={() => onKey('enter')} />
          <PadKey icon="chevron.right" label="Right (seek on)" onPress={() => onKey('right')} />
        </View>
        <View style={s.padRow}><PadKey icon="chevron.down" label="Down" onPress={() => onKey('down')} /></View>
      </View>
      <View style={s.keysRow}>
        <Chip label="Esc" onPress={() => onKey('escape')} />
        <Chip label="Space" onPress={() => onKey('space')} />
        <Chip label="Full screen" onPress={() => onKey('f')} />
        <Chip label="Mute tab" onPress={() => onKey('m')} />
      </View>
      {err ? <Text style={s.err}>{err}</Text> : st?.error ? <Text style={s.err}>{st.error}</Text> : null}
    </View>
  );
}

function Round({ icon, label, big, onPress }: { icon: string; label: string; big?: boolean; onPress: () => void }) {
  const size = big ? 72 : 56;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [s.round, { width: size, height: size, borderRadius: size / 2 }, big && { backgroundColor: C.text }, pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] }]}>
      <Sym name={icon as never} size={big ? 28 : 22} color={big ? '#111' : C.text} fallback={<Text style={s.chipText}>{label[0]}</Text>} />
    </Pressable>
  );
}

function PadKey({ icon, text, label, ok, onPress }: { icon?: string; text?: string; label: string; ok?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { tick(); onPress(); }}
      style={({ pressed }) => [s.padKey, ok && s.padOk, pressed && { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
      {text ? <Text style={s.okText}>{text}</Text> : <Sym name={icon as never} size={22} color={C.text} fallback={<Text style={s.chipText}>{label[0]}</Text>} />}
    </Pressable>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={() => { tick(); onPress(); }} style={({ pressed }) => [s.chip, pressed && { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
      <Text style={s.chipText}>{label}</Text>
    </Pressable>
  );
}

function VolSlider({ value, onChange, onDone, onLive }: { value: number; onChange: (v: number) => void; onDone: (v: number) => void; onLive: (v: number) => void }) {
  const [w, setW] = useState(1);
  const [last, setLast] = useState(0);
  const at = (x: number) => Math.min(1, Math.max(0, x / w)); // the children ignore touches, so locationX is on the track
  type Ev = { nativeEvent: { locationX: number } };
  const handlers = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: Ev) => onChange(at(e.nativeEvent.locationX)),
    onResponderMove: (e: Ev) => {
      const v = at(e.nativeEvent.locationX);
      onChange(v);
      const t = nowMs();
      if (t - last > 180) { setLast(t); onLive(v); } // the PC follows while dragging, not on every pixel
    },
    onResponderRelease: (e: Ev) => onDone(at(e.nativeEvent.locationX)),
    onResponderTerminate: (e: Ev) => onDone(at(e.nativeEvent.locationX)),
  };
  return (
    <View {...handlers} style={s.volTrack} accessible accessibilityRole="adjustable" accessibilityLabel="PC volume"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onDone(Math.min(1, Math.max(0, value + (e.nativeEvent.actionName === 'increment' ? 0.05 : -0.05))))}
      onLayout={(e) => setW(Math.max(1, e.nativeEvent.layout.width))}>
      <View pointerEvents="none" style={s.volLine}><View style={[s.volFill, { width: `${value * 100}%` }]} /></View>
      <View pointerEvents="none" style={[s.volKnob, { left: `${value * 100}%` }]} />
    </View>
  );
}

const s = StyleSheet.create({
  now: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  art: { width: 84, height: 84, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)' },
  artEmpty: { alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.semibold, fontSize: 17, lineHeight: 22, color: C.text },
  artist: { fontFamily: F.medium, fontSize: 14, lineHeight: 18, color: C.muted },
  app: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint },
  bar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  barFill: { height: 4, backgroundColor: C.text },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontFamily: F.medium, fontSize: 11, lineHeight: 14, color: C.faint, fontVariant: ['tabular-nums'] },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
  round: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  volRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  volTrack: { flex: 1, height: 36, justifyContent: 'center' },
  volLine: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  volFill: { height: 6, backgroundColor: C.text },
  volKnob: { position: 'absolute', width: 22, height: 22, borderRadius: 11, marginLeft: -11, backgroundColor: '#fff', top: 7 },
  volText: { width: 32, textAlign: 'right', fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.muted, fontVariant: ['tabular-nums'] },
  section: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.muted, marginTop: 4 },
  pad: { alignSelf: 'center', gap: 6 },
  padRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  padKey: { width: 64, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  padOk: { borderRadius: 28, backgroundColor: 'rgba(118,107,230,0.5)' },
  okText: { fontFamily: F.semibold, fontSize: 16, lineHeight: 20, color: C.text },
  keysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  chip: { height: 38, paddingHorizontal: 14, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  chipText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 18, color: C.text },
  err: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.danger },
});
