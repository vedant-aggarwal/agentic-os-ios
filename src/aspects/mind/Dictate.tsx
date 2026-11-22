import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Icon, IconButton, haptic, t, timer, useAspect } from '@/aspects/kit';
import { upload } from '@/lib/mod';
import { useRecorder } from './recorder';
import { Sym, useNow } from './ui';

const MAX = 60; // a spoken line stops itself at a minute

/**
 * Say one line instead of typing it (a takeaway, a recall answer). It records, sends the clip to the PC to be
 * written down, and hands back the text. The clip is deleted on the PC once it is written down.
 */
export function Dictate({ onText, what }: { onText: (text: string) => void; what: string }) {
  const a = useAspect();
  const mic = useRecorder();
  const [state, setState] = useState<'idle' | 'rec' | 'work'>('idle');
  const [from, setFrom] = useState(0);
  const now = useNow(250, state === 'rec' && a.open);
  const secs = from ? Math.max(0, (now - from) / 1000) : 0;

  const start = async () => {
    const ok = await mic.start();
    if (!ok) { a.notice(mic.error ?? "The microphone didn't start."); return; }
    haptic.medium();
    setFrom(Date.now());
    setState('rec');
  };
  const stop = async () => {
    setState('work');
    const r = await mic.stop();
    if (!r) { setState('idle'); a.notice("The recording didn't save."); return; }
    try {
      const got = await upload<{ text: string }>('/mod/mind/transcribe', r.uri, r.type);
      if (got?.text) { onText(got.text.trim()); haptic.light(); }
    } catch (e) {
      a.notice((e as Error).message);
    } finally {
      setState('idle');
      setFrom(0);
    }
  };
  const stopRef = useRef(stop);
  useEffect(() => { stopRef.current = stop; });
  useEffect(() => {
    if (state !== 'rec' || !from) return;
    const id = setTimeout(() => { void stopRef.current(); }, Math.max(0, MAX * 1000 - (Date.now() - from)));
    return () => clearTimeout(id);
  }, [state, from]);
  useEffect(() => { if (!a.open && state === 'rec') void mic.discard().then(() => setState('idle')); }, [a.open, state, mic]);

  if (state === 'work') {
    return <View style={s.box} accessibilityLabel="Writing down what you said"><ActivityIndicator color={a.color} /></View>;
  }
  if (state === 'rec') {
    return (
      <View style={s.rec}>
        <Text style={[t.label, t.num, { color: a.color }]}>{timer(secs)}</Text>
        <IconButton label={`Stop and write down ${what}`} onPress={stop}>
          <Sym name="stop" size={16} color={a.color} filled />
        </IconButton>
      </View>
    );
  }
  return (
    <IconButton label={`Say ${what} instead of typing`} onPress={start}>
      <Icon name="mic" size={18} />
    </IconButton>
  );
}

const s = StyleSheet.create({
  box: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  rec: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
