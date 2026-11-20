import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import type { Slot } from '@/lib/lineup';
import { C, F, IG_RING } from '@/theme';

type Props = { slot: Slot; size: number; live: boolean; ringBg?: string };

/** Profile picture with a platform ring: red for YouTube, the gradient for Instagram, grey when not live. */
export function Avatar({ slot, size, live, ringBg = '#fff' }: Props) {
  const ring = size >= 56 ? 3 : 2;
  const gap = 2;
  const inner = size - ring * 2 - gap * 2;

  if (!slot.image && !slot.initials) {
    return (
      <View style={[styles.dashed, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={{ fontFamily: F.m, fontSize: 24, color: C.muted }}>+</Text>
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={'r' + slot.channelId} x1="0" y1="1" x2="1" y2="0">
            {IG_RING.map((c, i) => (
              <Stop key={c} offset={i / (IG_RING.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2}
          fill={!live ? C.empty : slot.platform === 'youtube' ? C.yt : `url(#r${slot.channelId})`}
        />
        <Circle cx={size / 2} cy={size / 2} r={size / 2 - ring} fill={ringBg} />
      </Svg>
      <View style={[styles.center, { margin: ring + gap, width: inner, height: inner, borderRadius: inner / 2 }]}>
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

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  dashed: { borderWidth: 2, borderStyle: 'dashed', borderColor: '#C4C6CC', alignItems: 'center', justifyContent: 'center' },
});
