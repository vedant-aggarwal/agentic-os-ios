import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { haptic, t, tint } from '@/aspects/kit';
import { C } from '@/theme';
import type { Pattern } from './words';

type Phase = { k: 'in' | 'hold' | 'out' | 'rest'; s: number };
const WORD: Record<Phase['k'], string> = { in: 'Breathe in', hold: 'Hold', out: 'Breathe out', rest: 'Hold' };
const phasesOf = (p: Pattern): Phase[] => ([{ k: 'in', s: p.inhale }, { k: 'hold', s: p.hold }, { k: 'out', s: p.exhale }, { k: 'rest', s: p.rest }] as Phase[]).filter((x) => x.s > 0);
const ease = Easing.inOut(Easing.sin);

/**
 * The breathing pacer: a disc that fills as he breathes in and empties as he breathes out, with the word and the
 * seconds left. Haptics pace it for closed eyes: a soft tap each second while breathing in, a single tick when the
 * breath turns, quiet while breathing out. Under Reduce Motion the disc stays still and only its light changes.
 * It stops (and its haptics with it) when `running` is false.
 */
export function Breath({ pattern, running, color, size = 240, haptics = true, compact = false, onCycle }: {
  pattern: Pattern; running: boolean; color: string; size?: number; haptics?: boolean; compact?: boolean; onCycle?: (n: number) => void;
}) {
  const reduce = useReducedMotion();
  const v = useSharedValue(0.35);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [left, setLeft] = useState(0);
  const cycles = useRef(0);
  const cb = useRef(onCycle);
  useEffect(() => { cb.current = onCycle; }, [onCycle]);

  useEffect(() => {
    if (!running) {
      v.set(withTiming(0.35, { duration: 600, easing: ease, reduceMotion: ReduceMotion.Never }));
      return;
    }
    const phases = phasesOf(pattern);
    let i = 0, stopped = false;
    let phaseTimer: ReturnType<typeof setTimeout> | null = null, secTimer: ReturnType<typeof setInterval> | null = null;
    const run = () => {
      if (stopped) return;
      const ph = phases[i];
      setPhase(ph); setLeft(ph.s);
      const target = ph.k === 'in' ? 1 : ph.k === 'out' ? 0 : null;
      if (target != null) v.set(withTiming(target, { duration: ph.s * 1000, easing: ease, reduceMotion: ReduceMotion.Never }));
      if (haptics) { if (ph.k === 'in') haptic.medium(); else haptic.tick(); }
      let s = ph.s;
      if (secTimer) clearInterval(secTimer);
      secTimer = setInterval(() => {
        s -= 1;
        if (s <= 0) return;
        setLeft(s);
        if (haptics && ph.k === 'in') haptic.light();
      }, 1000);
      phaseTimer = setTimeout(() => {
        i = (i + 1) % phases.length;
        if (i === 0) { cycles.current += 1; cb.current?.(cycles.current); }
        run();
      }, ph.s * 1000);
    };
    run();
    return () => { stopped = true; if (phaseTimer) clearTimeout(phaseTimer); if (secTimer) clearInterval(secTimer); };
  }, [running, pattern, haptics, v]);

  const disc = useAnimatedStyle(() => (reduce
    ? { opacity: 0.35 + v.value * 0.65, transform: [{ scale: 0.86 }] }
    : { opacity: 1, transform: [{ scale: 0.42 + v.value * 0.58 }] }));
  const ph = running ? phase : null;
  const word = ph ? WORD[ph.k] : running ? '' : 'Ready';
  return (
    <View accessibilityRole="timer" accessibilityLabel={ph ? `${word}, ${left}` : 'Breathing pacer'} style={[s.wrap, { width: size, height: size }]}>
      <View style={[s.ring, { width: size, height: size, borderRadius: size / 2, borderColor: tint(color, 0.22) }]} />
      <Animated.View style={[s.disc, { width: size, height: size, borderRadius: size / 2, backgroundColor: tint(color, 0.14), borderColor: tint(color, 0.55) }, disc]} />
      <View style={s.label} pointerEvents="none">
        <Text style={[compact ? t.callout : t.title3, { color: C.text }]}>{word}</Text>
        {ph ? <Text style={[compact ? t.footnote : t.subhead, t.num]}>{left}</Text> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 1 },
  disc: { position: 'absolute', borderWidth: 1.5 },
  label: { alignItems: 'center', gap: 4 },
});
