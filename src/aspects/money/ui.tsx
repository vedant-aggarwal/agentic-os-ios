import { Children, isValidElement, useEffect, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { C, F } from '@/theme';
import { Chip, Divider, MOTION, Press, R, Ring, rupees, Sheet, SP, SURF, t, tint, useAspect } from '@/aspects/kit';

// Money's own pieces: the month line, the hero number, grouped rows for the statement screen, the amount input.

const clamp01 = (v: number) => Math.min(Math.max(Number.isFinite(v) ? v : 0, 0), 1);

/** "₹20,000", "about ₹20,000", or the row's own words when no amount is known yet. */
export function owedText(o: { amount: number | null; approx: boolean; label: string }) {
  if (o.amount == null) return 'Amount not set';
  return o.approx ? `about ${rupees(o.amount)}` : rupees(o.amount);
}

/**
 * The month on one line: money earned fills it solid, money still owed sits after it softer, and the target is its
 * end. Without a target there is nothing to measure against, so the caller shows a prompt instead.
 */
export function MonthLine({ earned, owed, target, height = 12 }: { earned: number; owed: number; target: number; height?: number }) {
  const a = useAspect();
  const e = clamp01(earned / target);
  const o = clamp01(Math.min(owed, Math.max(0, target - earned)) / target);
  const pe = useSharedValue(0), po = useSharedValue(0);
  useEffect(() => { pe.set(withSpring(e, MOTION.slow)); po.set(withSpring(o, MOTION.slow)); }, [e, o, pe, po]);
  const solid = useAnimatedStyle(() => ({ width: `${pe.value * 100}%` }));
  const soft = useAnimatedStyle(() => ({ width: `${po.value * 100}%` }));
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={`Earned ${rupees(earned)} of ${rupees(target)}${owed > 0 ? `, ${rupees(owed)} owed to you` : ''}`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(e * 100) }}
      style={[s.line, { height, borderRadius: height / 2 }]}>
      <Animated.View style={[{ height, backgroundColor: a.color }, solid]} />
      {o > 0 ? <Animated.View style={[{ height, marginLeft: e > 0 ? 2 : 0, backgroundColor: tint(a.color, 0.34) }, soft]} /> : null}
    </View>
  );
}

/** Rows that belong together on one surface, with hairlines between them (the statement screen's lists). */
export function Group({ children }: { children: ReactNode }) {
  const kids = Children.toArray(children).filter(isValidElement);
  return (
    <View style={s.group}>
      {kids.map((k, i) => (
        <View key={k.key ?? i}>
          {i > 0 ? <Divider /> : null}
          {k}
        </View>
      ))}
    </View>
  );
}

/** A heading inside a screen, with an optional figure or action on the right. */
export function Head({ title, right, action, onAction }: { title: string; right?: string | null; action?: string; onAction?: () => void }) {
  const a = useAspect();
  return (
    <View style={s.head}>
      <Text accessibilityRole="header" style={t.headline}>{title}</Text>
      <View style={s.fill} />
      {right ? <Text style={[t.subhead, t.num, { color: C.muted }]}>{right}</Text> : null}
      {action && onAction ? (
        <Press label={`${action}, ${title}`} onPress={onAction} hitSlop={12} feel="light">
          <Text style={[t.subhead, { color: a.color }]}>{action}</Text>
        </Press>
      ) : null}
    </View>
  );
}

/** The screen's one big number: as large as fits, smaller for long amounts so it never clips. */
export function HeroNumber({ value, color, label }: { value: string; color?: string; label?: string }) {
  const size = value.length <= 7 ? 64 : value.length <= 9 ? 52 : 44;
  return (
    <Text accessibilityLabel={label} numberOfLines={1}
      style={[t.hero, t.num, { fontSize: size, lineHeight: size + 4, letterSpacing: size >= 64 ? -2.6 : -1.8 }, color ? { color } : null]}>
      {value}
    </Text>
  );
}

/** A small ring for a row: how far along something is. */
export function MiniRing({ progress, size = 36 }: { progress: number; size?: number }) {
  const a = useAspect();
  return <Ring size={size} progress={progress} stroke={3.5} color={a.color} />;
}

/** The rupee amount being typed, large, with the keypad up. */
export function AmountInput({ value, onChange, label, autoFocus = true, onSubmit }: {
  value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean; onSubmit?: () => void;
}) {
  const a = useAspect();
  return (
    <View style={s.amount}>
      <Text style={[t.title, { color: value ? C.text : C.faint }]}>₹</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={(v) => onChange(v.replace(/[^\d]/g, '').slice(0, 9))}
        placeholder="0" placeholderTextColor={C.faint} keyboardType="number-pad" keyboardAppearance="dark" autoFocus={autoFocus}
        selectionColor={a.color} returnKeyType="done" onSubmitEditing={onSubmit} style={[s.amountInput, t.num]} />
    </View>
  );
}

/** A row of chips that scrolls sideways when it is longer than the screen. */
export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.chipRow} style={s.bleed}>
      {children}
    </ScrollView>
  );
}

/** Chips that wrap onto more lines. */
export const ChipWrap = ({ children }: { children: ReactNode }) => <View style={s.wrap}>{children}</View>;

/** Pick a spending category. */
export function CategorySheet({ open, onClose, cats, value, onPick, title = 'Category' }: {
  open: boolean; onClose: () => void; cats: { id: string; name: string }[]; value: string | null; onPick: (id: string) => void; title?: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <ChipWrap>
        {cats.map((c) => <Chip key={c.id} label={c.name} selected={c.id === value} onPress={() => { onPick(c.id); onClose(); }} />)}
      </ChipWrap>
    </Sheet>
  );
}

export const s = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  line: { flexDirection: 'row', overflow: 'hidden', backgroundColor: SURF.track },
  group: { borderRadius: R.group, borderCurve: 'continuous', backgroundColor: SURF.group, paddingHorizontal: SP[16], borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.hair },
  head: { flexDirection: 'row', alignItems: 'center', gap: SP[8], minHeight: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SP[12] },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP[12] },
  gap4: { gap: SP[4] },
  gap8: { gap: SP[8] },
  gap12: { gap: SP[12] },
  amount: { flexDirection: 'row', alignItems: 'center', gap: SP[8], minHeight: 56 },
  amountInput: { flex: 1, minWidth: 0, width: '100%', padding: 0, fontFamily: F.semibold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, color: C.text, outlineWidth: 0 },
  chipRow: { gap: SP[8], paddingHorizontal: SP[16] },
  bleed: { marginHorizontal: -SP[16], flexGrow: 0 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SP[8] },
});
