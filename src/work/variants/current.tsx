import { StyleSheet, Text, View } from 'react-native';
import { OrcaPill } from '../ui/orca';
import { T } from '../ui/tokens';
import { UsageStrip } from '../ui/UsageStrip';
import type { WorkDesign } from './types';

// The Work page as it was before the design round: title with the Orca pill, then the two usage tiles.

export const design: WorkDesign = {
  key: 'current',
  name: 'Now',
  Header: ({ orca, onOrcaPress }) => (
    <View style={s.header}>
      <View style={s.titleRow}>
        <Text accessibilityRole="header" style={T.title}>Work</Text>
        <OrcaPill state={orca} onPress={onOrcaPress} />
      </View>
      <UsageStrip usage={orca?.usage ?? null} up={orca ? orca.up : null} />
    </View>
  ),
};

const s = StyleSheet.create({
  header: { paddingBottom: 24, gap: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});
