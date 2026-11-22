import { use, useEffect, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { C } from '@/theme';
import { AspectContext } from '../context';
import { Button } from './controls';
import { SURF, t } from './tokens';

// Every part of a page that loads shows four states: loading (Skeleton in the shape of what is coming), empty
// (Empty: what goes here and the one action that starts it), failed (Failed with Try again), and the real thing.

/** Nothing here yet. Say what will appear and give the one action that makes the first one. No sample content. */
export function Empty({ title, body, action, onAction, icon }: {
  title: string; body?: string; action?: string; onAction?: () => void; icon?: ReactNode;
}) {
  return (
    <View style={s.box}>
      {icon}
      <Text style={[t.lead, s.centre]}>{title}</Text>
      {body ? <Text style={[t.small, s.centre]}>{body}</Text> : null}
      {action && onAction ? <Button label={action} onPress={onAction} kind="soft" small wrap={s.action} /> : null}
    </View>
  );
}

/** A load that failed with nothing to show in its place. `message` is the error as the PC or the phone worded it. */
export function Failed({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={s.box}>
      <Text style={[t.lead, s.centre]}>Couldn&apos;t load this</Text>
      <Text style={[t.small, s.centre]}>{message}</Text>
      {onRetry ? <Button label="Try again" onPress={onRetry} kind="quiet" small wrap={s.action} /> : null}
    </View>
  );
}

/** A grey block the size of what is loading. It breathes; under Reduce Motion it holds still. */
export function Skeleton({ height, width = '100%', radius = 12 }: { height: number; width?: DimensionValue; radius?: number }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(0.5);
  useEffect(() => {
    if (reduce) return;
    o.set(withRepeat(withTiming(1, { duration: 900 }), -1, true));
  }, [reduce, o]);
  const pulse = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: SURF.card }, pulse]} />;
}

/** A centred spinner in the aspect's colour, for a wait with no shape to sketch (an AI read, an upload). */
export function Loading({ label }: { label?: string }) {
  const color = use(AspectContext)?.color ?? C.muted;
  return (
    <View style={s.box}>
      <ActivityIndicator color={color} />
      {label ? <Text style={[t.small, s.centre]}>{label}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 16 },
  centre: { textAlign: 'center' },
  action: { marginTop: 8 },
});
