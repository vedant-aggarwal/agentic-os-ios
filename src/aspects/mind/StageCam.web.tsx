import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { t } from '@/aspects/kit';
import type { Cam, CamEvent } from './StageCam';

export type { Cam, CamEvent } from './StageCam';

// The web preview (dev only) has no phone camera: this stands in for it, so the Stage flow can be walked through.
// It "records" a piece every two seconds and reports each one as reaching the PC. Nothing is filmed or sent.
export const camAvailable = true;

export function StageCam({ ref, onEvent, style }: { ref: Ref<Cam>; onEvent: (e: CamEvent) => void; style?: StyleProp<ViewStyle> }) {
  const latest = useRef(onEvent);
  useEffect(() => { latest.current = onEvent; });
  const run = useRef<{ timer: ReturnType<typeof setInterval> | null; t0: number; offset: number; pieces: number }>({ timer: null, t0: 0, offset: 0, pieces: 0 });
  useEffect(() => {
    const id = setTimeout(() => latest.current({ type: 'ready' }), 300);
    const r = run.current;
    return () => { clearTimeout(id); if (r.timer) clearInterval(r.timer); };
  }, []);
  useImperativeHandle(ref, () => ({
    start: ({ offset }) => {
      const r = run.current;
      Object.assign(r, { t0: Date.now(), offset, pieces: 0 });
      latest.current({ type: 'recording' });
      r.timer = setInterval(() => {
        r.pieces += 1;
        latest.current({ type: 'sent', pieces: r.pieces, waiting: 0, t: Math.round((r.offset + (Date.now() - r.t0) / 1000) * 1000) });
      }, 2000);
    },
    stop: () => {
      const r = run.current;
      if (r.timer) clearInterval(r.timer);
      r.timer = null;
      setTimeout(() => latest.current({ type: 'stopped', pieces: r.pieces + 1, t: Math.round((r.offset + (Date.now() - r.t0) / 1000) * 1000) }), 400);
    },
  }), []);
  return (
    <View style={[s.fill, style]}>
      <Text style={[t.footnote, s.note]}>The camera runs on the iPhone. This preview stands in for it.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#101216', alignItems: 'center' },
  // above the countdown ring, under the topic card
  note: { position: 'absolute', top: '27%', color: 'rgba(255,255,255,0.45)', textAlign: 'center', maxWidth: 240 },
});
