import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { C } from '@/theme';
import { FAILED, LIVE, NEEDS } from './tokens';

export type Tone = 'live' | 'needs' | 'failed' | 'idle' | 'quiet';
const COLOR: Record<Tone, string> = { live: LIVE, needs: NEEDS, failed: FAILED, idle: C.muted, quiet: 'rgba(255,255,255,0.22)' };

/**
 * An 8 pt state dot. Only `live` (an agent working) and `needs` (waiting on him) glow; `pulse` adds a slow
 * ring for a job that is running right now. Reduce Motion keeps the glow and drops the ring.
 */
export function LiveDot({ tone, pulse = false, size = 8 }: { tone: Tone; pulse?: boolean; size?: number }) {
  const reduce = useReducedMotion();
  const color = COLOR[tone];
  const glows = tone === 'live' || tone === 'needs';
  const t = useSharedValue(0);
  const ring = pulse && glows && !reduce;
  useEffect(() => {
    if (!ring) { t.set(0); return; }
    t.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false));
  }, [ring, t]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - t.value), transform: [{ scale: 1 + 1.6 * t.value }] }));
  const r = size / 2;
  return (
    <View style={{ width: size, height: size }}>
      {ring ? <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: r, backgroundColor: color }, halo]} /> : null}
      <View style={[StyleSheet.absoluteFill, { borderRadius: r, backgroundColor: color }, glows && { boxShadow: `0 0 8px ${color}` }]} />
    </View>
  );
}
