import { StyleSheet, Text, View } from 'react-native';
import { Glass } from '@/components/Glass';
import { BackIcon } from './icons';
import { Press } from './Press';
import { T } from './tokens';

export const QUICK_H = 64;
const BTN = 48; // 24 pt corners inside the bar's 32 at an 8 pt inset: concentric

export type QuickAction = { key: string; label: string; a11y: string; icon: React.ReactNode; onPress: () => void; iconOnly?: boolean };

/** The bottom bar: the hub's add actions in the dock's glass, floating over the list, which scrolls under it. With
 *  onBack, a round Back button sits just left of it, where the thumb already is. */
export function QuickBar({ bottom, actions, onBack }: { bottom: number; actions: QuickAction[]; onBack?: () => void }) {
  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom }]}>
      {onBack ? (
        <Press accessibilityLabel="Back" onPress={onBack} haptic hitSlop={6}>
          {(pressed) => (
            <View style={s.back}>
              <Glass radius={QUICK_H / 2} />
              {pressed ? <View style={[StyleSheet.absoluteFill, s.backPressed]} /> : null}
              <View><BackIcon /></View>
            </View>
          )}
        </Press>
      ) : null}
      <View style={s.bar}>
        <Glass radius={QUICK_H / 2} />
        {actions.map((a) => (
          <Press key={a.key} accessibilityLabel={a.a11y} onPress={a.onPress} haptic hitSlop={4}>
            {(pressed) => (
              <View style={[s.btn, a.iconOnly && s.iconOnly, pressed && s.pressed]}>
                {a.icon}
                {a.iconOnly ? null : <Text style={T.button}>{a.label}</Text>}
              </View>
            )}
          </Press>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  back: {
    width: QUICK_H, height: QUICK_H, borderRadius: QUICK_H / 2, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
  },
  backPressed: { borderRadius: QUICK_H / 2, backgroundColor: 'rgba(255,255,255,0.12)' },
  bar: {
    height: QUICK_H, borderRadius: QUICK_H / 2, padding: 8, gap: 4, flexDirection: 'row', alignItems: 'center',
    boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
  },
  btn: { height: BTN, borderRadius: BTN / 2, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconOnly: { width: BTN, paddingHorizontal: 0, justifyContent: 'center' },
  pressed: { backgroundColor: 'rgba(255,255,255,0.1)' },
});
