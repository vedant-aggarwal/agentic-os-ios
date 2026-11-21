import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Glass, lightTap, useScale } from '@/components/Glass';
import { Account, PcMic, Remote, ToPc, Voices } from '@/components/Icons';
import { Smiley } from '@/components/Smiley';
import { Sym } from '@/components/Sym';

// The top bar mirrors the Nora bar: the same glass. A pill holding the four PC actions takes about
// two-thirds of the row; two floating round buttons (mood, account) share the rest. One gap G sets the row.
export const TOP_H = 52; // pill and round buttons, one height
const G = 8;
const BTN = 44; // tap target inside the pill
const GLYPH = 22; // the drawn fallback icons
// SF Symbols are fitted into a square box, so a wide one (the laptop) comes out short and a tall one (the
// mic) tall. Each gets its own box so all of them read about 22 pt tall, one optical size.
const OPTICAL = { laptop: 34, mic: 25, cursor: 27, wave: 27, person: 24 } as const;

/** Space the bar takes from the top of the screen, below the safe area. */
export const TOP_GAP = 6;

/** Where the PC mic button sits on screen: the PC mic screen grows out of it. */
export function micCenter(top: number, width: number) {
  const pill = width - 32 - 2 * (TOP_H + G);
  const gap = (pill - 4 * BTN) / 5; // the pill spaces its four buttons evenly
  return { x: 16 + 2 * gap + 1.5 * BTN, y: top + TOP_GAP + TOP_H / 2 };
}

function PillButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  const p = useScale(0.86);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      onPress={() => { lightTap(); onPress(); }} onPressIn={() => p.set(p.to)} onPressOut={() => p.set(1)}>
      {({ pressed }) => (
        <Animated.View style={[s.btn, p.style, pressed && s.btnPressed]}>{children}</Animated.View>
      )}
    </Pressable>
  );
}

function RoundButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  const p = useScale(0.9);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      onPress={() => { lightTap(); onPress(); }} onPressIn={() => p.set(p.to)} onPressOut={() => p.set(1)}>
      {({ pressed }) => (
        <Animated.View style={[s.round, p.style]}>
          <Glass radius={TOP_H / 2} />
          {pressed ? <View style={[StyleSheet.absoluteFill, s.roundPressed]} /> : null}
          <View>{children}</View>
        </Animated.View>
      )}
    </Pressable>
  );
}

export function TopBar({ top, width, onMic, onNotBuilt }: {
  top: number; width: number; onMic: () => void; onNotBuilt: (what: string) => void;
}) {
  const pill = width - 32 - 2 * (TOP_H + G);
  return (
    <View pointerEvents="box-none" style={[s.row, { top: top + TOP_GAP }]}>
      <View style={[s.pill, { width: pill }]}>
        <Glass radius={TOP_H / 2} />
        <PillButton label="Send to PC" onPress={() => onNotBuilt('To PC')}><Sym name="laptopcomputer.and.arrow.down" size={OPTICAL.laptop} fallback={<ToPc size={GLYPH} />} /></PillButton>
        <PillButton label="PC mic" onPress={onMic}><Sym name="mic.fill" size={OPTICAL.mic} fallback={<PcMic size={GLYPH} />} /></PillButton>
        <PillButton label="Remote PC" onPress={() => onNotBuilt('Remote PC')}><Sym name="cursorarrow.rays" size={OPTICAL.cursor} fallback={<Remote size={GLYPH} />} /></PillButton>
        <PillButton label="Voices" onPress={() => onNotBuilt('Voices')}><Sym name="waveform" size={OPTICAL.wave} fallback={<Voices size={GLYPH} />} /></PillButton>
      </View>
      <RoundButton label="Log mood" onPress={() => onNotBuilt('Mood')}><Smiley size={30} /></RoundButton>
      <RoundButton label="Your account" onPress={() => onNotBuilt('Account')}><Sym name="person.fill" size={OPTICAL.person} fallback={<Account size={GLYPH + 2} />} /></RoundButton>
    </View>
  );
}

const s = StyleSheet.create({
  row: { position: 'absolute', left: 16, right: 16, height: TOP_H, flexDirection: 'row', gap: G },
  pill: {
    height: TOP_H, borderRadius: TOP_H / 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly',
    boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
  },
  btn: { width: BTN, height: BTN, borderRadius: BTN / 2, alignItems: 'center', justifyContent: 'center' },
  btnPressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
  round: {
    width: TOP_H, height: TOP_H, borderRadius: TOP_H / 2, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 12px 28px rgba(0,0,0,0.4)',
  },
  roundPressed: { borderRadius: TOP_H / 2, backgroundColor: 'rgba(255,255,255,0.12)' },
});
