import { Children, isValidElement, useEffect, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { C, F } from '@/theme';
import { Chip, Divider, Icon, MOTION, Press, R, rupees, Sheet, SP, SURF, t, tint, useAspect } from '@/aspects/kit';

// Money's own pieces: the month line, the bands of the home screen, grouped rows, the amount input.

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

/** A part of the home screen. Its title opens that part. */
export function Band({ title, onOpen, right, children }: { title: string; onOpen: () => void; right?: string | null; children: ReactNode }) {
  return (
    <View style={s.band}>
      <Press label={`Open ${title}`} onPress={onOpen} scale={0.99} style={s.bandHead}>
        <Text accessibilityRole="header" style={t.heading}>{title}</Text>
        <View style={s.fill} />
        {right ? <Text style={[t.label, t.num]}>{right}</Text> : null}
        <Icon name="right" size={16} color={C.faint} />
      </Press>
      {children}
    </View>
  );
}

/** Rows that belong together on one surface, with hairlines between them. */
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

/** A small heading inside a screen, with an optional figure on the right. */
export function Head({ title, right, action, onAction }: { title: string; right?: string | null; action?: string; onAction?: () => void }) {
  const a = useAspect();
  return (
    <View style={s.head}>
      <Text accessibilityRole="header" style={t.section}>{title}</Text>
      <View style={s.fill} />
      {right ? <Text style={[t.label, t.num]}>{right}</Text> : null}
      {action && onAction ? (
        <Press label={`${action}, ${title}`} onPress={onAction} hitSlop={12} feel="light">
          <Text style={[t.label, { color: a.color }]}>{action}</Text>
        </Press>
      ) : null}
    </View>
  );
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

/** Two short words and a value, side by side: "Today ... ₹120". */
export function Line({ label, value, sub, onPress, a11y }: { label: string; value: string; sub?: string | null; onPress?: () => void; a11y?: string }) {
  const body = (
    <>
      <View style={s.fill}>
        <Text style={t.strong}>{label}</Text>
        {sub ? <Text style={t.small}>{sub}</Text> : null}
      </View>
      <Text style={[t.lead, t.num]}>{value}</Text>
      {onPress ? <Icon name="right" size={16} color={C.faint} /> : null}
    </>
  );
  if (!onPress) return <View style={s.lineRow}>{body}</View>;
  return <Press label={a11y ?? `${label}, ${value}`} onPress={onPress} scale={0.99} style={s.lineRow}>{body}</Press>;
}

export const s = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  line: { flexDirection: 'row', overflow: 'hidden', backgroundColor: SURF.track },
  band: { gap: SP[12] },
  bandHead: { flexDirection: 'row', alignItems: 'center', gap: SP[8], minHeight: 44 },
  group: { borderRadius: R.card, borderCurve: 'continuous', backgroundColor: SURF.card, paddingHorizontal: SP[16], borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.line },
  head: { flexDirection: 'row', alignItems: 'center', gap: SP[8], minHeight: 24 },
  amount: { flexDirection: 'row', alignItems: 'center', gap: SP[8], minHeight: 56 },
  amountInput: { flex: 1, minWidth: 0, width: '100%', padding: 0, fontFamily: F.semibold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, color: C.text, outlineWidth: 0 },
  chipRow: { gap: SP[8], paddingHorizontal: SP[16] },
  bleed: { marginHorizontal: -SP[16], flexGrow: 0 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SP[8] },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: SP[12], minHeight: 56, paddingVertical: SP[8] },
});
