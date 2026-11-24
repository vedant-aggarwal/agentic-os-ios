import { StyleSheet, Text, View } from 'react-native';
import { C, F } from '@/theme';
import { PlusIcon } from './icons';
import { Press } from './Press';
import { T } from './tokens';

/** A section's label, its count, and an optional add button on the right (Today's group heading). `extra` sits
 *  beside the label (the projects' Active | Ideas switch) and replaces the count. */
export function SectionHeader({ title, count, add, extra }: {
  title: string; count?: number; add?: { label: string; onPress: () => void }; extra?: React.ReactNode;
}) {
  return (
    <View style={s.head} accessibilityRole="header">
      <View style={s.left}>
        <Text style={T.label}>{title}</Text>
        {extra}
      </View>
      <View style={s.right}>
        {count && !extra ? <Text style={T.meta}>{count}</Text> : null}
        {add ? (
          <Press accessibilityLabel={add.label} onPress={add.onPress} haptic hitSlop={8} style={s.add}>
            {(pressed) => (
              <View style={[s.addFill, pressed && s.addPressed]}><PlusIcon size={16} color={C.textSoft} /></View>
            )}
          </Press>
        ) : null}
      </View>
    </View>
  );
}

/** The one line an empty Ideas or Tasks section shows, with its add button. */
export function EmptyLine({ text, add }: { text: string; add?: { label: string; onPress: () => void } }) {
  return (
    <View style={s.empty}>
      <Text style={[T.sub, s.emptyText]}>{text}</Text>
      {add ? (
        <Press accessibilityLabel={add.label} onPress={add.onPress} haptic style={s.emptyBtn}>
          {(pressed) => (
            <View style={[s.emptyFill, pressed && s.addPressed]}>
              <PlusIcon size={14} color={C.textSoft} />
              <Text style={s.emptyBtnText}>{add.label}</Text>
            </View>
          )}
        </Press>
      ) : null}
    </View>
  );
}

/** "Show all 61" under a cut list. */
export function MoreLine({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} style={s.more}>
      <Text style={s.moreText}>{label}</Text>
    </Press>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32, paddingBottom: 4 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  add: { width: 32, height: 32 },
  addFill: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  addPressed: { backgroundColor: 'rgba(255,255,255,0.16)' },
  empty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 56 },
  emptyText: { flex: 1 },
  emptyBtn: { borderRadius: 16 },
  emptyFill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 32, paddingHorizontal: 12, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  emptyBtnText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.textSoft },
  more: { minHeight: 44, justifyContent: 'center' },
  moreText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.textSoft },
});
