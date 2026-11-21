import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Polygon, Stop } from 'react-native-svg';
import { Backdrop, EdgeGlow } from '@/components/Backdrop';
import { EdgeBlur } from '@/components/EdgeBlur';
import { Crystals } from '@/components/Crystals';
import { Dock, orbFromBottom } from '@/components/Dock';
import { Notice } from '@/components/Notice';
import { NowCard } from '@/components/NowCard';
import { SignIn } from '@/components/SignIn';
import { TaskGroup } from '@/components/TaskRow';
import { PcMicSheet } from '@/components/PcMicSheet';
import { micCenter, TOP_GAP, TOP_H, TopBar } from '@/components/TopBar';
import { signOut } from '@/lib/api';
import { useToday } from '@/lib/useToday';
import { useWispr } from '@/lib/wispr';
import { C, F } from '@/theme';

/** One light falling from above onto the crystals, over the app background. */
function Scene({ width }: { width: number }) {
  const h = 640, cx = width / 2;
  return (
    <Svg pointerEvents="none" width={width} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#D6E2FF" stopOpacity={0.12} /><Stop offset="0.6" stopColor="#D6E2FF" stopOpacity={0.04} />
          <Stop offset="1" stopColor="#D6E2FF" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Polygon points={`${cx - 30},0 ${cx + 30},0 ${cx + 150},${h - 80} ${cx - 150},${h - 80}`} fill="url(#beam)" />
      <Polygon points={`${cx - 18},0 ${cx + 18},0 ${cx + 110},${h - 120} ${cx - 110},${h - 120}`} fill="url(#beam)" />
    </Svg>
  );
}

export default function Today() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const t = useToday();
  const [local, setLocal] = useState<string | null>(null);
  const [allCarried, setAllCarried] = useState(false);
  const [micOpen, setMicOpen] = useState(false); // opened by tapping the PC mic button
  // volume buttons drive Wispr on the PC while Today is up
  const mic = useWispr(!!t.view);
  const notBuilt = useCallback((what: string) => setLocal(`${what}: not built yet`), []);
  const { clearNotice } = t;
  const clear = useCallback(() => { setLocal(null); clearNotice(); }, [clearNotice]);

  if (t.state.status === 'loading') return <View style={s.screen} />;
  if (t.state.status === 'signedOut') return <SignIn onDone={t.reload} />;
  if (t.state.status === 'error' || !t.view) {
    return (
      <View style={[s.screen, s.center]}>
        <Backdrop />
        <Text style={s.errTitle}>Today didn&apos;t load</Text>
        <Text style={s.errBody}>{t.state.status === 'error' ? t.state.message : ''}</Text>
        <Pressable accessibilityRole="button" onPress={t.reload} style={s.retry}><Text style={s.retryText}>Try again</Text></Pressable>
      </View>
    );
  }

  const v = t.view;
  const orb = orbFromBottom(insets.bottom);
  const empty = !v.groups.length && !v.carried;
  return (
    <View style={s.screen}>
      <Backdrop orb={orb} />
      <Scene width={width} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + TOP_GAP + TOP_H + 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={t.refreshing} onRefresh={t.refresh} tintColor={C.muted} />}>
        <View style={s.top}>
          <View style={s.hero}>
            <Crystals families={v.families} />
            {v.total > 0 ? (
              <View style={s.totalRow}>
                <Text style={s.totalNum}>{v.done}</Text>
                <Text style={s.totalOf}>of {v.total} done today</Text>
              </View>
            ) : (
              <Text style={[s.totalOf, { marginTop: 8 }]}>Nothing due today</Text>
            )}
          </View>
        </View>

        <View style={[s.sheet, { paddingBottom: insets.bottom + 140 }]}>
          <NowCard moment={v.moment} onDone={t.toggle} />
          {v.groups.map((g) => <TaskGroup key={g.key} group={g} onToggle={t.toggle} />)}
          {v.carried ? (
            <View>
              <TaskGroup group={v.carried} onToggle={t.toggle} limit={allCarried ? undefined : 5} />
              {v.carried.rows.length > 5 ? (
                <Pressable accessibilityRole="button" onPress={() => setAllCarried((x) => !x)} style={s.more}>
                  <Text style={s.moreText}>{allCarried ? 'Show fewer' : `Show all ${v.carried.rows.length}`}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {empty ? <Text style={s.emptyText}>Nothing due today or carried over. Add tasks with agentos on the PC.</Text> : null}
          <Pressable accessibilityRole="button" onPress={async () => { await signOut(); t.reload(); }} style={s.more}>
            <Text style={[s.moreText, { color: C.faint }]}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* t^2.6 over the zone: about 1 pt where the navbar's top edge sits (40% down), then dense under the
          bar, 14 pt at the bottom edge */}
      {/* the same blur under the top bar, dense at the screen's top edge */}
      <EdgeBlur edge="top" height={insets.top + TOP_GAP + TOP_H + 28} strength={30} curve={2} />
      <TopBar top={insets.top} width={width} onMic={() => setMicOpen(true)} onNotBuilt={notBuilt} />
      <EdgeBlur height={insets.bottom + 150} strength={35} curve={2.6} />
      <EdgeGlow height={insets.bottom + 200} orb={orb} />
      <Notice text={local ?? t.notice} bottom={insets.bottom + 112} onClear={clear} />
      <Dock bottom={insets.bottom} width={width} aspects={v.aspects} onNotBuilt={notBuilt} />
      {/* opens by itself while a volume press has Wispr going, and closes once it has sent */}
      <PcMicSheet open={micOpen || mic.phase !== 'idle'} origin={micCenter(insets.top, width)} phase={mic.phase} since={mic.since}
        error={mic.error}
        onClose={() => { setMicOpen(false); if (mic.phase === 'handsfree') mic.toggleHandsFree(); }}
        onTalkIn={mic.startTalk} onTalkOut={mic.endTalk} onHandsFree={mic.toggleHandsFree} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.scene },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  top: { paddingHorizontal: 16, gap: 12 },
  hero: { alignItems: 'center', paddingBottom: 12 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  totalNum: { fontFamily: F.semibold, fontSize: 36, lineHeight: 40, letterSpacing: -1, color: C.text },
  totalOf: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.muted },
  sheet: {
    flexGrow: 1, backgroundColor: C.sheet, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 20, paddingHorizontal: 16, gap: 24, borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)',
  },
  more: { minHeight: 44, justifyContent: 'center' },
  moreText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.textSoft },
  emptyText: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.muted },
  errTitle: { fontFamily: F.semibold, fontSize: 24, lineHeight: 32, color: C.text },
  errBody: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.muted, textAlign: 'center' },
  retry: { height: 48, paddingHorizontal: 24, borderRadius: 24, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontFamily: F.semibold, fontSize: 16, color: C.scene },
});
