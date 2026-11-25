import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { dayLabel, Failed, Icon, IconButton, myDay, R, Skeleton, t, TabbedPage, TabPanel, useAspect, useEntry, useOnReturn } from '@/aspects/kit';
import { collection, useGet } from '@/lib/mod';
import { ASPECT_KEYS } from '@/lib/aspectLinks';
import type { AspectKey } from '@/theme';
import { HOME, refreshGrowth } from './data';
import { NavContext, TABS, type Flow, type GrowthNav, type Tab } from './nav';
import { NowTab } from './Now';
import { OverTime } from './OverTime';
import { Review } from './Review';
import { PastScreen, ReviewTab } from './Reviews';
import { RuleSheet, RulesTab } from './Rules';
import { ScoreScreen } from './ScoreScreen';
import type { Home, Rule } from './types';
import { WheelTab } from './WheelTab';

// Growth: am I getting better? Now leads with the one thing the page needs from him (this week's review, or the
// wheel when it is due for a score), the rules to tick this week and a line each on the wheel. Review is this week's
// review and every week he closed. Wheel is his own score against what the data shows, read honestly. Rules are the
// ones he lives by. No streak, no score to chase.

/** Everything the page reads, fetched again: the computed routes and the two collections. */
function refreshAll() {
  refreshGrowth();
  void collection('growth', 'rules').refresh();
  void collection('growth', 'reviews').refresh();
}

export default function Growth() {
  const a = useAspect();
  const home = useGet<Home>(HOME);
  const [tab, setTab] = useState<Tab>('now');
  const [flow, setFlow] = useState<Flow | null>(null);
  const [pick, setPick] = useState<AspectKey | null>(null);
  const [rule, setRule] = useState<Rule | 'new' | null>(null);
  const { refresh } = home;
  // back from another app or the lock screen: the week may have moved on
  useOnReturn(refreshAll);
  // an answer from a day before his day ("this week" may be last week's): fetch again
  const date = home.data?.today;
  useEffect(() => { if (a.open && date && date < myDay()) void refresh(); }, [a.open, date]); // eslint-disable-line react-hooks/exhaustive-deps
  // growth/<part>: score, review, reviews, rules, time[/<aspect>] (over time, on one section), wheel[/<aspect>] (that
  // section picked on the wheel). growth/journal goes to Soul's journal (src/lib/aspectLinks.ts).
  useEntry((e) => {
    const [p, k] = e.parts;
    const key = ASPECT_KEYS.find((x) => x === k) ?? null;
    setRule(null);
    setPick(p === 'wheel' ? key : null);
    setFlow(p === 'score' ? { kind: 'score' } : p === 'review' ? { kind: 'review' } : p === 'time' ? { kind: 'time', section: key } : null);
    setTab(p === 'review' || p === 'reviews' ? 'review' : p === 'rules' ? 'rules' : p === 'wheel' || p === 'time' || p === 'score' ? 'wheel' : 'now');
  });
  const closeFlow = useCallback(() => setFlow(null), []);
  const closeRule = useCallback(() => setRule(null), []);
  const nav = useMemo<GrowthNav>(() => ({
    tab, openTab: setTab, flow, openFlow: setFlow, pick, setPick, openRule: setRule,
  }), [tab, flow, pick]);
  const d = home.data;

  const right = d && tab === 'rules'
    ? <IconButton label="Write a new rule" size={40} onPress={() => setRule('new')}><Icon name="plus" size={18} /></IconButton>
    : undefined;

  return (
    <NavContext value={nav}>
      <TabbedPage tabs={TABS} tab={tab} onTab={setTab} right={right} onRefresh={() => { refreshAll(); void refresh(); }} refreshing={home.busy && !!d}
        footer={d ? (
          <>
            <Review open={flow?.kind === 'review'} onClose={closeFlow} />
            <ScoreScreen open={flow?.kind === 'score'} onClose={closeFlow} />
            <OverTime open={flow?.kind === 'time'} start={flow?.kind === 'time' ? flow.section : null} onClose={closeFlow} />
            <PastScreen open={flow?.kind === 'past'} id={flow?.kind === 'past' ? flow.id : null} onClose={closeFlow} />
            <RuleSheet open={!!rule} rule={rule === 'new' ? null : rule} week={d.week.key} onClose={closeRule} />
          </>
        ) : undefined}>
        {!d ? (home.error ? <Failed message={home.error} onRetry={() => void refresh()} /> : <GrowthSkeleton />) : (
          <>
            {home.error ? <Text style={[t.footnote, s.stale]}>{`${loadedFrom(d.today)} ${home.error}`}</Text> : null}
            <TabPanel active={tab === 'now'}><NowTab home={d} /></TabPanel>
            <TabPanel active={tab === 'review'}><ReviewTab home={d} /></TabPanel>
            <TabPanel active={tab === 'wheel'}><WheelTab home={d} /></TabPanel>
            <TabPanel active={tab === 'rules'}><RulesTab week={d.week.key} /></TabPanel>
          </>
        )}
      </TabbedPage>
    </NavContext>
  );
}

/** When the PC can't be reached: which day the page shown is from. */
function loadedFrom(date: string) {
  const when = dayLabel(date);
  return when === 'Today' ? 'Showing what loaded earlier today.' : `Showing what loaded ${when === 'Yesterday' ? 'yesterday' : `on ${when}`}.`;
}

function GrowthSkeleton() {
  return (
    <View style={s.skel} accessibilityLabel="Loading Growth">
      <Skeleton height={208} radius={R.card} />
      <Skeleton height={20} width={160} radius={8} />
      <Skeleton height={184} radius={R.group} />
      <Skeleton height={20} width={120} radius={8} />
      <Skeleton height={152} radius={R.group} />
    </View>
  );
}

const s = StyleSheet.create({
  skel: { gap: 16 },
  stale: { marginBottom: 12 },
});
