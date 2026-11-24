import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, F } from '@/theme';
import { Press } from '../ui/Press';
import { DESIGNS } from './registry';
import { setWorkDesign } from './useDesign';

// While he picks a Work design: one chip per design at the top of the page. Goes once a design is chosen.

export function DesignSwitcher({ active }: { active: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.scroll} contentContainerStyle={s.row}
      accessibilityRole="tablist" accessibilityLabel="Work page design">
      <Text style={s.label}>Design</Text>
      {DESIGNS.map((d) => {
        const on = d.key === active;
        return (
          <Press key={d.key} onPress={() => setWorkDesign(d.key)} haptic accessibilityRole="tab" accessibilityState={{ selected: on }}
            accessibilityLabel={`${d.name} design`}>
            <View style={[s.chip, on && s.chipOn]}>
              <Text style={[s.text, on && s.textOn]}>{d.name}</Text>
            </View>
          </Press>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { marginHorizontal: -16, marginBottom: 16, flexGrow: 0 },
  row: { paddingHorizontal: 16, gap: 6, alignItems: 'center' },
  label: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint, marginRight: 4 },
  chip: { height: 30, paddingHorizontal: 12, borderRadius: 15, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  chipOn: { backgroundColor: C.text },
  text: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.muted },
  textOn: { color: '#0B0C10' },
});
