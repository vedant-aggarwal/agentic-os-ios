import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { dayLabel, Failed, Icon, IconButton, myDay, R, Skeleton, t, TabbedPage, TabPanel, useAspect, useEntry, useOnReturn } from '@/aspects/kit';
import { useHome } from './data';
import { EarnTab, MoneyInSheet, TargetSheet } from './Earn';
import { NavContext, TABS, type MoneyNav, type SheetKind, type Tab } from './nav';
import { SpendPad } from './pad';
import { JarSheet, SaveTab } from './Save';
import { AddBillSheet, SpendTab } from './Spend';
import { StatementScreen } from './Statement';
import { TodayTab } from './Today';

// Money: the calm spending and saving page. Today leads with the one number for the month (left to spend against his
// plan, or what has gone out) and one button to log a spend. Spend is where it went, by category and by day, with the
// bills. Save is the jars and what he has. Earn is the money in against his target. The page records only: it never
// moves money. Every figure is computed on the PC (GET /mod/money/home).

export default function Money() {
  const a = useAspect();
  const home = useHome();
  const [tab, setTab] = useState<Tab>('today');
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [statement, setStatement] = useState<{ id: string | null } | null>(null);
  const { refresh } = home;
  // fresh figures when he comes back to the app (the page stays mounted while closed)
  useOnReturn(() => void refresh());
  // figures from a day before his day ("Today" would be yesterday's): fetch again. Before 4 AM his day is still
  // yesterday while the PC's date has moved on, so only an older date counts as stale (no refetch loop)
  const date = home.data?.date;
  useEffect(() => { if (a.open && date && date < myDay()) void refresh(); }, [a.open, date]); // eslint-disable-line react-hooks/exhaustive-deps
  // money/<part>: earn, spend (money/flow, the weekly and repeat charge pushes), save (also money/jars),
  // statement[/<id>] (an import to review), log (the spend keys, for a shortcut).
  useEntry((e) => {
    const [p, id] = e.parts;
    setTab(p === 'earn' ? 'earn' : p === 'spend' || p === 'flow' || p === 'statement' ? 'spend' : p === 'save' || p === 'jars' ? 'save' : 'today');
    setStatement(p === 'statement' ? { id: id ?? null } : null);
    setSheet(p === 'log' ? { kind: 'spend' } : null);
  });
  const openStatement = useCallback((id: string | null) => setStatement({ id }), []);
  const closeStatement = useCallback(() => setStatement(null), []);
  const close = useCallback(() => setSheet(null), []);
  const nav = useMemo<MoneyNav>(() => ({ tab, openTab: setTab, sheet, openSheet: setSheet, openStatement }), [tab, sheet, openStatement]);
  const d = home.data;

  const right = !d ? undefined
    : tab === 'spend' ? <IconButton label="Log a spend" size={40} onPress={() => setSheet({ kind: 'spend' })}><Icon name="plus" size={18} /></IconButton>
      : tab === 'earn' ? <IconButton label="Money in" size={40} onPress={() => setSheet({ kind: 'moneyIn' })}><Icon name="plus" size={18} /></IconButton>
        : undefined;

  return (
    <NavContext value={nav}>
      <TabbedPage tabs={TABS} tab={tab} onTab={setTab} right={right} onRefresh={() => void refresh()} refreshing={home.busy && !!d}
        footer={d ? (
          <>
            <StatementScreen open={!!statement} onClose={closeStatement} home={d} id={statement?.id ?? null} setId={(id) => setStatement({ id })} />
            <SpendPad open={sheet?.kind === 'spend'} onClose={close} home={d} />
            <MoneyInSheet open={sheet?.kind === 'moneyIn'} onClose={close} home={d} />
            <TargetSheet open={sheet?.kind === 'target'} onClose={close} home={d} />
            <JarSheet open={sheet?.kind === 'jar'} jar={null} onClose={close} />
            <AddBillSheet open={sheet?.kind === 'bill'} onClose={close} />
          </>
        ) : undefined}>
        {!d ? (home.error ? <Failed message={home.error} onRetry={() => void refresh()} /> : <MoneySkeleton />) : (
          <>
            {home.error ? <Text style={[t.footnote, s.stale]}>{`${loadedFrom(d.date)} ${home.error}`}</Text> : null}
            <TabPanel active={tab === 'today'}><TodayTab home={d} /></TabPanel>
            <TabPanel active={tab === 'spend'}><SpendTab home={d} /></TabPanel>
            <TabPanel active={tab === 'save'}><SaveTab home={d} /></TabPanel>
            <TabPanel active={tab === 'earn'}><EarnTab home={d} /></TabPanel>
          </>
        )}
      </TabbedPage>
    </NavContext>
  );
}

/** When the PC can't be reached: which day the figures shown are from. */
function loadedFrom(date: string) {
  const when = dayLabel(date);
  return when === 'Today' ? 'Showing what loaded earlier today.' : `Showing figures from ${when === 'Yesterday' ? 'yesterday' : when}.`;
}

function MoneySkeleton() {
  return (
    <View style={s.skel} accessibilityLabel="Loading Money">
      <Skeleton height={264} radius={R.card} />
      <Skeleton height={20} width={120} radius={8} />
      <Skeleton height={104} radius={R.group} />
      <Skeleton height={20} width={140} radius={8} />
      <Skeleton height={176} radius={R.group} />
    </View>
  );
}

const s = StyleSheet.create({
  skel: { gap: 16 },
  stale: { marginBottom: 12 },
});
