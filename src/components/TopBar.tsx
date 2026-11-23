import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { Glass, lightTap, useScale } from '@/components/Glass';
import { Account, PcMic, Remote, ToPc, Voices } from '@/components/Icons';
import { Smiley } from '@/components/Smiley';
import { Sym } from '@/components/Sym';
import { justRubbed, rubEnd, rubMove, rubStart } from '@/lib/pet';

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

/** Where the pill's button `i` (0 To PC, 1 PC mic, 2 Remote, 3 Voices) sits on screen: its page grows out of it. */
export function pillCenter(i: number, top: number, width: number) {
  const pill = width - 32 - 2 * (TOP_H + G);
  const gap = (pill - 4 * BTN) / 5; // the pill spaces its four buttons evenly
  return { x: 16 + (i + 1) * gap + (i + 0.5) * BTN, y: top + TOP_GAP + TOP_H / 2 };
}
export const micCenter = (top: number, width: number) => pillCenter(1, top, width);

function PillButton({ label, onPress, onLongPress, children }: { label: string; onPress: () => void; onLongPress?: () => void; children: React.ReactNode }) {
  const p = useScale(0.86);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      onPress={() => { lightTap(); onPress(); }} onPressIn={() => p.set(p.to)} onPressOut={() => p.set(1)}
      onLongPress={onLongPress ? () => { lightTap(); onLongPress(); } : undefined} delayLongPress={350}>
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

// The mood button: a tap logs a mood; a finger rubbing over it pets the smiley (lib/pet).
function MoodButton({ onPress }: { onPress: () => void }) {
  const rub = usePanGesture({
    minDistance: 3,
    runOnJS: true,
    onActivate: () => rubStart(),
    onUpdate: (e) => rubMove(e.changeX ?? 0, e.changeY ?? 0, e.x, e.y),
    onDeactivate: () => rubEnd(),
    onFinalize: () => rubEnd(),
  });
  return (
    <GestureDetector gesture={rub}>
      <View>
        <RoundButton label="Log mood (rub to pet)" onPress={() => { if (!justRubbed()) onPress(); }}><Smiley size={30} /></RoundButton>
      </View>
    </GestureDetector>
  );
}

export function TopBar({ top, width, live, onFiles, onMic, onRemote, onRemoteHold, onVoices, onAccount, onNotBuilt }: {
  top: number; width: number; live: boolean; onFiles: () => void; onMic: () => void; onRemote: () => void; onRemoteHold?: () => void; onVoices: () => void; onAccount: () => void; onNotBuilt: (what: string) => void;
}) {
  const pill = width - 32 - 2 * (TOP_H + G);
  return (
    <View pointerEvents="box-none" style={[s.row, { top: top + TOP_GAP }]}>
      <View style={[s.pill, { width: pill }]}>
        <Glass radius={TOP_H / 2} />
        <PillButton label="Files to and from the PC" onPress={onFiles}><Sym name="laptopcomputer.and.arrow.down" size={OPTICAL.laptop} fallback={<ToPc size={GLYPH} />} /></PillButton>
        <PillButton label="PC mic" onPress={onMic}>
          <Sym name="mic.fill" size={OPTICAL.mic} fallback={<PcMic size={GLYPH} />} />
          {live ? <View style={s.liveDot} /> : null}
        </PillButton>
        <PillButton label="Remote PC (hold for media remote and power)" onPress={onRemote} onLongPress={onRemoteHold}><Sym name="cursorarrow.rays" size={OPTICAL.cursor} fallback={<Remote size={GLYPH} />} /></PillButton>
        <PillButton label="Voices" onPress={onVoices}><Sym name="waveform" size={OPTICAL.wave} fallback={<Voices size={GLYPH} />} /></PillButton>
      </View>
      <MoodButton onPress={() => onNotBuilt('Mood')} />
      <RoundButton label="Your account" onPress={onAccount}><Sym name="person.fill" size={OPTICAL.person} fallback={<Account size={GLYPH + 2} />} /></RoundButton>
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
  // something is running on the PC page while it is closed
  liveDot: { position: 'absolute', top: 7, right: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: '#3DDC97' },
  round: {
    width: TOP_H, height: TOP_H, borderRadius: TOP_H / 2, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 12px 28px rgba(0,0,0,0.4)',
  },
  roundPressed: { borderRadius: TOP_H / 2, backgroundColor: 'rgba(255,255,255,0.12)' },
});
