import { BlurView } from 'expo-blur';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { C } from '@/theme';

// The original prototype bottom bar: quick add, the Nora orb in its nine-aspect ring, type to Nora.
const RING = [
  ['#FF8A5B', -1.54], ['#FFB547', -32.26], ['#FFD27A', -62.98], ['#3DDC97', -93.7], ['#2EC4B6', -124.42],
  ['#7EE787', -155.14], ['#FF7AB6', -185.86], ['#F472D0', -216.58], ['#B79CFF', -247.3],
] as const;

function Round({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [s.round, pressed && { transform: [{ scale: 0.94 }], backgroundColor: 'rgba(255,255,255,0.1)' }]}>
      {children}
    </Pressable>
  );
}

export function Dock({ bottom, onNotBuilt }: { bottom: number; onNotBuilt: (what: string) => void }) {
  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: Math.max(bottom, 12) + 12 }]}>
      {/* faint light under the orb: its only source */}
      <Svg pointerEvents="none" width={200} height={140} style={s.under}>
        <Defs>
          <RadialGradient id="under" cx="0.5" cy="1" r="0.6">
            <Stop offset="0" stopColor="#FF8A4C" stopOpacity={0.16} /><Stop offset="1" stopColor="#FF8A4C" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={200} height={140} fill="url(#under)" />
      </Svg>
      <View style={s.bar}>
        <View style={s.material}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(36,35,32,0.72)' }]} />
        </View>
        <Round label="Quick add" onPress={() => onNotBuilt('Quick add')}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth={2} strokeLinecap="round"><Path d="M12 5v14M5 12h14" /></Svg>
        </Round>
        <View style={{ width: 96 }} />
        <Round label="Type to Nora" onPress={() => onNotBuilt('Typing to Nora')}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M4.5 5.5h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM6.5 9.5h.01M10 9.5h.01M14 9.5h.01M17.5 9.5h.01M8 14.5h8" />
          </Svg>
        </Round>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Nora" onPress={() => onNotBuilt('Talking to Nora')}
        style={({ pressed }) => [s.orbWrap, pressed && { transform: [{ scale: 0.96 }] }]}>
        <Svg width={96} height={96} viewBox="0 0 96 96">
          <Defs>
            <RadialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#FF8A4C" stopOpacity={0.5} /><Stop offset="0.45" stopColor="#F0457A" stopOpacity={0.18} />
              <Stop offset="0.7" stopColor="#F0457A" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="orb" cx="0.34" cy="0.28" r="0.8" fx="0.34" fy="0.28">
              <Stop offset="0" stopColor="#FFE3B0" /><Stop offset="0.28" stopColor="#FFA15C" />
              <Stop offset="0.62" stopColor="#F0457A" /><Stop offset="1" stopColor="#6E1A55" />
            </RadialGradient>
            <RadialGradient id="orbShade" cx="0.7" cy="0.8" r="0.6">
              <Stop offset="0" stopColor="#6E1A55" stopOpacity={0.55} /><Stop offset="1" stopColor="#6E1A55" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={48} cy={48} r={44} fill="url(#halo)" />
          <G transform="rotate(-90 48 48)">
            {RING.map(([c, o]) => (
              <Circle key={c} cx={48} cy={48} r={44} fill="none" stroke={c} strokeWidth={3} strokeDasharray="27.65 248.81" strokeDashoffset={o} />
            ))}
          </G>
          <Circle cx={48} cy={48} r={34} fill="url(#orb)" />
          <Circle cx={48} cy={48} r={34} fill="url(#orbShade)" />
        </Svg>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, height: 64, alignItems: 'center' },
  under: { position: 'absolute', bottom: -24, alignSelf: 'center' },
  bar: {
    position: 'absolute', left: 0, right: 0, top: 0, height: 64, borderRadius: 32,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8,
    boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
  },
  material: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 32, overflow: 'hidden' },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: C.glass },
  orbWrap: { position: 'absolute', top: -30, width: 96, height: 96, alignSelf: 'center' },
});
