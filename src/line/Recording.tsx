import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { Glyph, Press, t } from '@/aspects/kit';
import { clock } from '@/lib/nora';
import type { LineRecording } from '@/lib/line';
import { C } from '@/theme';

// A call's recording: play, pause, and a track to scrub with a finger. While the PC is still saving it, or when it
// didn't save, a line says so instead. The source comes from line.recording(), which asks for the MP4 copy (the
// phone's player can't open the Ogg file the contract names; see "App deviations" in the contract).
// On the phone the file is downloaded once into the cache and played from there: streaming it, the player makes
// several range requests and each costs about a second through the tunnel, so it took many seconds to start.

type Audio = typeof import('expo-audio');
type FS = typeof import('expo-file-system');
/* eslint-disable @typescript-eslint/no-require-imports */
const audio: Audio | null = Platform.OS === 'web' || requireOptionalNativeModule('ExpoAudio') ? require('expo-audio') : null;
const fs: FS | null = Platform.OS !== 'web' && requireOptionalNativeModule('FileSystem') ? require('expo-file-system') : null;
/* eslint-enable @typescript-eslint/no-require-imports */

const cached = new Map<string, Promise<string>>();
/** A local copy of the recording (one download per call and state), or the URL itself on web or if it fails. */
function localCopy(uri: string, key: string): Promise<string> {
  if (!fs) return Promise.resolve(uri);
  const have = cached.get(key);
  if (have) return have;
  const job = (async () => {
    const dir = new fs.Directory(fs.Paths.cache, 'line-recordings');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const dest = new fs.File(dir, `${key.replace(/[^\w.-]/g, '_')}.m4a`);
    if (dest.exists && (dest.size ?? 0) > 0) return dest.uri;
    if (dest.exists) dest.delete();
    return (await fs.File.downloadFileAsync(uri, dest)).uri;
  })().catch(() => { cached.delete(key); return uri; });
  cached.set(key, job);
  return job;
}
function useLocal(src: { uri: string } | null, key: string): { uri: string } | null {
  const want = src ? `${key}|${src.uri}` : '';
  const [got, setGot] = useState<{ want: string; uri: string } | null>(null);
  useEffect(() => {
    if (!src || !fs) return;
    let live = true;
    void localCopy(src.uri, key).then((u) => { if (live) setGot({ want, uri: u }); });
    return () => { live = false; };
  }, [want]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!src) return null;
  if (!fs) return src;
  return got?.want === want ? { uri: got.uri } : null;
}

type PlayerLike = { play: () => void; pause: () => void; seekTo: (s: number) => Promise<void> };
type Status = { playing: boolean; currentTime: number; duration: number; isLoaded: boolean; isBuffering?: boolean };
const IDLE: Status = { playing: false, currentTime: 0, duration: 0, isLoaded: false };
// chosen once when the file loads, so a component's hooks never change between renders
const usePlayerHook: (src: { uri: string } | null) => PlayerLike | null = audio
  ? (src) => audio.useAudioPlayer(src as never, { updateInterval: 250 }) as unknown as PlayerLike : () => null;
const useStatusHook: (p: PlayerLike | null) => Status = audio
  ? (p) => audio.useAudioPlayerStatus(p as never) as unknown as Status : () => IDLE;

export function Recording({ rec, src }: { rec: LineRecording; src: { uri: string } | null }) {
  if (rec.status === 'none') return null;
  if (rec.status === 'recording' || rec.status === 'encoding') {
    return <Note text="Saving the recording. It plays here in a minute." busy />; // the call's page only shows calls that ended
  }
  if (rec.status === 'failed') return <Note text="This call's recording didn't save." />;
  return <Player src={src} seconds={rec.seconds} cacheKey={`${src?.uri.match(/calls\/([^/?]+)/)?.[1] ?? 'call'}-${rec.status}`} />;
}

function Note({ text, busy }: { text: string; busy?: boolean }) {
  return (
    <View style={s.note}>
      {busy ? <ActivityIndicator size="small" color={C.muted} /> : <Glyph sf="waveform.slash" d="M4 12h2M8 8v8M12 5v14M16 8v8M20 12h0M3 3l18 18" size={18} color={C.faint} />}
      <Text style={[t.small, s.flex]}>{text}</Text>
    </View>
  );
}

function Player({ src: remote, seconds, cacheKey }: { src: { uri: string } | null; seconds: number; cacheKey: string }) {
  const local = useLocal(remote, cacheKey);
  const src = remote ? local : null;
  const player = usePlayerHook(src);
  const st = useStatusHook(player);
  // a recording that never loads (the PC sent a format this player can't open) says so instead of spinning
  const [stuck, setStuck] = useState<string | null>(null);
  useEffect(() => {
    if (!src || st.isLoaded) return;
    const uri = src.uri;
    const id = setTimeout(() => setStuck(uri), 15_000);
    return () => clearTimeout(id);
  }, [src?.uri, st.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const failed = !!src && stuck === src.uri && !st.isLoaded;

  const total = st.duration > 0 ? st.duration : seconds;
  const at = Math.min(st.currentTime, total || st.currentTime);
  const ready = !!player && st.isLoaded;
  const toggle = () => {
    if (!player || !ready) return;
    if (st.playing) { player.pause(); return; }
    audio?.setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    if (total > 0 && at >= total - 0.25) void player.seekTo(0).then(() => player.play()); else player.play();
  };
  if (failed && !ready) return <Note text="This recording can't play on this device yet." />;
  return (
    <View style={s.player}>
      <Press label={st.playing ? 'Pause the recording' : 'Play the recording'} onPress={toggle} disabled={!src || (!!player && !ready)}
        scale={0.92} style={s.play}>
        {remote && !ready ? <ActivityIndicator size="small" color={C.scene} />
          : <Glyph sf={st.playing ? 'pause.fill' : 'play.fill'} d={st.playing ? 'M8 5v14M16 5v14' : 'M8 5.5v13l11-6.5z'} size={18} color={C.scene} filled={!st.playing} />}
      </Press>
      <View style={s.flex}>
        <Scrubber value={total ? at / total : 0} disabled={!ready} label="Recording position"
          valueText={`${clock(at)} of ${clock(total)}`} onSeek={(f) => { if (player && ready) void player.seekTo(f * total); }} />
        <View style={s.times}>
          <Text style={[t.caption, t.num]}>{clock(at)}</Text>
          <Text style={[t.caption, t.num]}>{src ? `-${clock(Math.max(0, total - at))}` : clock(total)}</Text>
        </View>
      </View>
    </View>
  );
}

/** A track: tap or drag anywhere on it; the knob follows the finger and the player seeks on release. */
function Scrubber({ value, onSeek, disabled, label, valueText }: {
  value: number; onSeek: (f: number) => void; disabled?: boolean; label: string; valueText: string;
}) {
  const [w, setW] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const v = drag ?? Math.min(Math.max(value, 0), 1);
  const at = (x: number) => (w ? Math.min(Math.max(x / w, 0), 1) : 0);
  return (
    <View style={s.track} onLayout={(e) => setW(e.nativeEvent.layout.width)}
      accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: valueText }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => { if (!disabled) onSeek(Math.min(1, Math.max(0, v + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)))); }}
      onStartShouldSetResponder={() => !disabled} onMoveShouldSetResponder={() => !disabled} onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => setDrag(at(e.nativeEvent.locationX))}
      onResponderMove={(e) => setDrag(at(e.nativeEvent.locationX))}
      onResponderRelease={(e) => { onSeek(at(e.nativeEvent.locationX)); setDrag(null); }}
      onResponderTerminate={() => setDrag(null)}>
      <View pointerEvents="none" style={s.rail}><View style={[s.fill, { width: `${v * 100}%` }]} /></View>
      <View pointerEvents="none" style={[s.knob, drag != null && s.knobDown, { left: v * w - (drag != null ? 9 : 7) }]} />
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  play: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: C.text },
  track: { height: 32, justifyContent: 'center' },
  rail: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.16)', overflow: 'hidden' },
  fill: { height: 4, backgroundColor: C.text },
  knob: { position: 'absolute', top: 9, width: 14, height: 14, borderRadius: 7, backgroundColor: C.text },
  knobDown: { top: 7, width: 18, height: 18, borderRadius: 9 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -2 },
});
