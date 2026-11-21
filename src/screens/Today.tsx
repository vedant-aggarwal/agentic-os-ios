import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Polygon, Stop } from 'react-native-svg';
import { Backdrop, EdgeBlur, EdgeGlow } from '@/components/Backdrop';
import { Crystals } from '@/components/Crystals';
import { Dock, orbFromBottom } from '@/components/Dock';
import { Lock, Mood, PcMic, Remote, ToPc, Voices } from '@/components/Icons';
import { Notice } from '@/components/Notice';
import { NowCard } from '@/components/NowCard';
import { SignIn } from '@/components/SignIn';
import { TaskGroup } from '@/components/TaskRow';
import { signOut } from '@/lib/api';
import { useToday } from '@/lib/useToday';
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

function Action({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={s.action}>
      {({ pressed }) => (
        <>
          <View style={[s.actionCircle, pressed && { backgroundColor: 'rgba(255,255,255,0.12)', transform: [{ scale: 0.94 }] }]}>{children}</View>
          <Text style={s.actionLabel}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4}
      style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}>{children}</Pressable>
  );
}

export default function Today() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const t = useToday();
  const [local, setLocal] = useState<string | null>(null);
  const [allCarried, setAllCarried] = useState(false);
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
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 4 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={t.refreshing} onRefresh={t.refresh} tintColor={C.muted} />}>
        <View style={s.top}>
          <Pressable accessibilityRole="button" onPress={() => notBuilt('Your board')} style={s.handle}>
            <View style={s.handleBar} />
            <Text style={s.handleText}>Your board</Text>
          </Pressable>

          <View style={s.dateRow}>
            <Text style={s.date}>{v.dateLabel}</Text>
            <View style={s.dateIcons}>
              <IconButton label="Log mood" onPress={() => notBuilt('Mood')}><Mood /></IconButton>
              <IconButton label="Your reason, sealed" onPress={() => notBuilt('Sealed reason')}><Lock /></IconButton>
            </View>
          </View>

          <View style={s.actions}>
            <Action label="To PC" onPress={() => notBuilt('To PC')}><ToPc /></Action>
            <Action label="PC mic" onPress={() => notBuilt('PC mic')}><PcMic /></Action>
            <Action label="Remote" onPress={() => notBuilt('Remote PC')}><Remote /></Action>
            <Action label="Voices" onPress={() => notBuilt('Voices')}><Voices /></Action>
          </View>

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

      <EdgeBlur height={insets.bottom + 180} />
      <EdgeGlow height={insets.bottom + 240} orb={orb} />
      <Notice text={local ?? t.notice} bottom={insets.bottom + 112} onClear={clear} />
      <Dock bottom={insets.bottom} width={width} aspects={v.aspects} onNotBuilt={notBuilt} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.scene },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  top: { paddingHorizontal: 16, gap: 12 },
  handle: { alignItems: 'center', gap: 4, minHeight: 44, justifyContent: 'center' },
  handleBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#33363B' },
  handleText: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.faint },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontFamily: F.medium, fontSize: 16, lineHeight: 24, color: C.textSoft },
  dateIcons: { flexDirection: 'row', marginRight: -10 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row' },
  action: { flex: 1, alignItems: 'center', gap: 6 },
  actionCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.glass, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  actionLabel: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.muted },
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
