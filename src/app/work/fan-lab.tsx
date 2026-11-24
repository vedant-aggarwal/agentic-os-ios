import { useCallback, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Backdrop } from '@/components/Backdrop';
import { Glass } from '@/components/Glass';
import { Work } from '@/components/Icons';
import { Sym } from '@/components/Sym';
import { C, F } from '@/theme';
import { type MicEvent, useMicEvents, useSheetRequest } from '@/work/bus';
import { dockWorkOrb } from '@/work/ProjectFan';
import { useWorkOrb } from '@/work/useWorkOrb';

// Dev page for the projects fan: a stand-in Work orb exactly where the dock draws it, driven by useWorkOrb, so the
// fan can be tried in the web preview (`/work/fan-lab?demo`) without touching Dock.tsx. Sheets have no host here,
// so the page prints what the fan asked for instead.
const ORB = 64;

export default function FanLab() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [last, setLast] = useState('Nothing yet');
  const sheet = useSheetRequest();
  const onMic = useCallback((e: MicEvent) => setLast(e.type === 'start' ? `Mic start in ${e.project}` : `Mic ${e.type}`), []);
  useMicEvents(onMic);
  const onTap = useCallback(() => setLast('Tap opens the hub'), []);
  const { handlers, overlay, orbStyle } = useWorkOrb({ onTap });
  const orb = dockWorkOrb(width, height, insets.bottom);
  const asked = !sheet ? null
    : sheet.kind === 'project' ? 'Sheet: new project'
    : sheet.kind === 'projectSettings' ? `Sheet: settings for ${sheet.project}`
    : sheet.kind === 'editIdea' ? `Sheet: idea ${sheet.idea.id}`
    : sheet.kind === 'editTask' ? `Sheet: task ${sheet.task.id}`
    : `Sheet: new ${sheet.kind}${sheet.project ? ` in ${sheet.project}` : ''}`;
  return (
    <View style={s.screen}>
      <Backdrop />
      <View style={[s.head, { paddingTop: insets.top + 16 }]}>
        <Text style={s.title}>Fan lab: hold the orb</Text>
        <Text style={s.line}>{last}</Text>
        {asked ? <Text style={s.line}>{asked}</Text> : null}
      </View>
      <View {...handlers} style={[s.orb, { left: orb.cx - ORB / 2, top: orb.cy - ORB / 2 }]}>
        <Animated.View pointerEvents="none" style={[s.orbBody, orbStyle]}>
          <Glass radius={ORB / 2} />
          <View><Sym name="briefcase.fill" size={22} fallback={<Work />} /></View>
        </Animated.View>
      </View>
      {overlay}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.scene },
  head: { paddingHorizontal: 16, gap: 4 },
  title: { fontFamily: F.semibold, fontSize: 20, lineHeight: 28, color: C.text },
  line: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.muted },
  orb: { position: 'absolute', width: ORB, height: ORB },
  orbBody: {
    width: ORB, height: ORB, borderRadius: ORB / 2, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
  },
});
