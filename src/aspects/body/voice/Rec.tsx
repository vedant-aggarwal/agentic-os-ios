import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { C } from '@/theme';
import { Bar, Button, Icon, Press, SP, t, timer, useAspect } from '@/aspects/kit';
import { canPickFile, canRecord, pickAudioFile, useRecorder, type Recorded } from './recorder';
import { s as u } from '../ui';

/**
 * One recording: a big record button, the time and a level meter while it runs, stop to send.
 * `min` greys out stop until that many seconds; `max` stops by itself. The web preview can choose a file instead.
 */
export function RecordButton({ label, min = 0, max = 0, busy, onDone }: {
  label: string; min?: number; max?: number; busy?: boolean; onDone: (r: Recorded) => void;
}) {
  const a = useAspect();
  const rec = useRecorder();
  const [stopping, setStopping] = useState(false);
  const secs = Math.floor(rec.ms / 1000);
  const stop = async () => {
    setStopping(true);
    const r = await rec.stop();
    setStopping(false);
    if (r) onDone(r);
  };
  // stops by itself at the limit
  useEffect(() => {
    if (!rec.recording || !max || secs < max || stopping) return;
    const id = setTimeout(() => { void stop(); }, 0);
    return () => clearTimeout(id);
  });
  const file = async () => { const r = await pickAudioFile(); if (r) onDone(r); };

  return (
    <View style={[u.gap12, { alignItems: 'center' }]}>
      <Press label={rec.recording ? 'Stop and send' : label} feel="medium" disabled={busy || stopping || (rec.recording && secs < min)}
        onPress={() => { if (rec.recording) void stop(); else void rec.start(); }} scale={0.94}
        style={{ width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: rec.recording ? C.text : a.color }}>
        {rec.recording ? <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: a.color }} /> : <Icon name="mic" size={32} color={C.scene} />}
      </Press>
      {rec.recording ? (
        <View style={[u.gap8, { alignSelf: 'stretch', alignItems: 'center' }]}>
          <Text style={[t.big, t.num]} accessibilityLiveRegion="polite">{timer(secs)}</Text>
          <View style={{ alignSelf: 'stretch', paddingHorizontal: SP[32] }}><Bar progress={rec.level} height={6} /></View>
          <Text style={t.small}>{secs < min ? `Keep going, at least ${min} s` : 'Tap to stop and send'}</Text>
        </View>
      ) : (
        <Text style={t.small}>{busy ? 'Sending' : canRecord ? label : 'Recording comes with the next app build.'}</Text>
      )}
      {rec.error ? <Text style={[t.small, { color: C.text, textAlign: 'center' }]}>{rec.error}</Text> : null}
      {!rec.recording && canPickFile ? <Button label="Choose an audio file" kind="quiet" small disabled={busy} onPress={() => { void file(); }} /> : null}
    </View>
  );
}
