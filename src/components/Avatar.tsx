import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import type { Slot } from '@/lib/lineup';
import { C, F, IG_RING } from '@/theme';

/** One week day on the ring, Sunday first. `today` marks the current day. */
export type WeekDay = { state: 'full' | 'part' | 'none' | 'future'; today: boolean };

type Props = {
  slot: Slot;
  size: number;
  live: boolean;
  ringBg?: string;
  /** Seven days: the ring splits into day segments that fill as posts go out. */
  week?: WeekDay[];
  /** Pulse a halo behind the picture: this channel is waiting on Vedant. */
  glow?: boolean;
};

/** Profile picture with a platform ring: red for YouTube, the gradient for Instagram, grey when not live. */
export function Avatar({ slot, size, live, ringBg = '#fff', week, glow }: Props) {
  const ring = week ? 4 : size >= 56 ? 3 : 2;
  const gap = 2;
  const inner = size - ring * 2 - gap * 2;
  const color = slot.platform === 'youtube' ? C.yt : `url(#r${slot.channelId})`;

  if (!slot.image && !slot.initials) {
    return (
      <View style={[styles.dashed, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={{ fontFamily: F.m, fontSize: 24, color: C.muted }}>+</Text>
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size }}>
      {glow ? <Glow size={size} color={slot.platform === 'youtube' ? C.yt : C.ig} /> : null}
      <Svg width={size} height={size} style={[StyleSheet.absoluteFill, { zIndex: 1 }]}>
        <Defs>
          <LinearGradient id={'r' + slot.channelId} x1="0" y1="1" x2="1" y2="0">
            {IG_RING.map((c, i) => (
              <Stop key={c} offset={i / (IG_RING.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        {week ? (
          <WeekRing size={size} ring={ring} week={week} color={color} />
        ) : (
          <>
            <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={!live ? C.empty : color} />
            <Circle cx={size / 2} cy={size / 2} r={size / 2 - ring} fill={ringBg} />
          </>
        )}
      </Svg>
      <View style={[styles.center, { zIndex: 1, margin: ring + gap, width: inner, height: inner, borderRadius: inner / 2 }]}>
        {slot.image ? (
          <Image
            source={slot.image}
            style={{ width: inner, height: inner, borderRadius: inner / 2, opacity: live ? 1 : 0.55 }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={[styles.center, { width: inner, height: inner, borderRadius: inner / 2, backgroundColor: '#2B2C31' }]}>
            <Text style={{ fontFamily: F.b, fontSize: inner * 0.36, color: '#fff' }}>{slot.initials}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/** Seven arcs, Sunday at the top going clockwise. Posted days take the platform colour; today is ink until it's done. */
function WeekRing({ size, ring, week, color }: { size: number; ring: number; week: WeekDay[]; color: string }) {
  const r = size / 2 - ring / 2;
  const circ = 2 * Math.PI * r;
  const gapLen = 3.5;
  const seg = circ / week.length - gapLen;
  return (
    <>
      {week.map((d, i) => {
        const done = d.state === 'full' || d.state === 'part';
        const stroke = done ? color : d.today ? C.ink : C.empty;
        return (
          <Circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={stroke}
            strokeOpacity={d.state === 'part' ? 0.45 : 1}
            strokeWidth={ring}
            strokeLinecap="round"
            strokeDasharray={`${seg - ring} ${circ - seg + ring}`}
            // Start each arc at the top (−90°) and step clockwise; the round caps eat `ring` of length.
            strokeDashoffset={-(i * (seg + gapLen) + ring / 2) + circ / 4}
          />
        );
      })}
    </>
  );
}

/** A soft halo that breathes behind the picture. */
function Glow({ size, color }: { size: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.1 + t.value * 0.22,
    transform: [{ scale: 1.08 + t.value * 0.16 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { zIndex: 0, borderRadius: size / 2, backgroundColor: color }, style]}
    />
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  dashed: { borderWidth: 2, borderStyle: 'dashed', borderColor: '#C4C6CC', alignItems: 'center', justifyContent: 'center' },
});
