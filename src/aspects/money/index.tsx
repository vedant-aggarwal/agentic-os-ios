import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, dayLabel, Failed, Icon, myDay, Page, R, Row, rupees, shortDay, Skeleton, SP, t, useAspect, useEntry, useOnReturn } from '@/aspects/kit';
import { useHome } from './data';
import { EarnLead, EarnScreen, MoneyInSheet, OwedRow, TargetSheet } from './Earn';
import { LogLine } from './log';
import { JarMini, JarSheet, netNote, SaveScreen } from './Save';
import { AddBillSheet, SpendScreen, todayLine } from './Spend';
import { StatementScreen } from './Statement';
import type { Home } from './types';
import { Band, Group, Line } from './ui';
import { Linked } from '@/aspects/_linked/Linked';

// Money: is the work paying, and where does it go? One screen with three parts. Earn leads: this month's earned money
// against his target on one line, with what is still owed to him right under it. Then where it went, with the one line
// log. Then what he has put aside. Each part's title opens it. The page records only: it never moves money.

type Part = 'earn' | 'spend' | 'save' | null;

export default function Money() {
  const a = useAspect();
  const home = useHome();
  const [part, setPart] = useState<Part>(null);
  const [statement, setStatement] = useState<{ id: string | null } | null>(null);
  const [moneyIn, setMoneyIn] = useState(false);
  const [target, setTarget] = useState(false);
  const [newJar, setNewJar] = useState(false);
  const [addBill, setAddBill] = useState(false);
  const { refresh } = home;
  // fresh figures each time the page opens again (it stays mounted while closed) and when the app comes back
  useOnReturn(() => void refresh());
  // figures from a day before his day ("Today" would be yesterday's): fetch again. Before 4 AM his day is still
  // yesterday while the PC's date has moved on, so only an older date counts as stale (no refetch loop)
  const date = home.data?.date;
  useEffect(() => { if (a.open && date && date < myDay()) void refresh(); }, [a.open, date]); // eslint-disable-line react-hooks/exhaustive-deps
  // money/<part>: earn, spend (money/flow, the weekly and repeat charge pushes), save (also money/jars),
  // statement[/<id>] (an import to review).
  useEntry((e) => {
    const [p, id] = e.parts;
    setPart(p === 'earn' ? 'earn' : p === 'spend' || p === 'flow' ? 'spend' : p === 'save' || p === 'jars' ? 'save' : null);
    setStatement(p === 'statement' ? { id: id ?? null } : null);
    setMoneyIn(false); setTarget(false); setNewJar(false); setAddBill(false);
  });
  const closePart = useCallback(() => setPart(null), []);
  const closeStatement = useCallback(() => setStatement(null), []);
  const d = home.data;

  if (!d) {
    return (
      <Page>
        {home.error ? <Failed message={home.error} onRetry={() => void refresh()} /> : <HomeSkeleton />}
      </Page>
    );
  }
  const left = d.month.daysToGo;
  return (
    <Page subtitle={left <= 1 ? `Last day of ${d.month.name}` : `${d.month.name}, ${left} days to go`} onRefresh={() => void refresh()} refreshing={home.busy}
      footer={
        <>
          <EarnScreen open={part === 'earn'} onClose={closePart} home={d} onMoneyIn={() => setMoneyIn(true)} onTarget={() => setTarget(true)} />
          <SpendScreen open={part === 'spend'} onClose={closePart} home={d} onStatement={(id) => setStatement({ id: id ?? null })} />
          <SaveScreen open={part === 'save'} onClose={closePart} home={d} onNewJar={() => setNewJar(true)} />
          <StatementScreen open={!!statement} onClose={closeStatement} home={d} id={statement?.id ?? null} setId={(id) => setStatement({ id })} />
          <MoneyInSheet open={moneyIn} onClose={() => setMoneyIn(false)} home={d} />
          <TargetSheet open={target} onClose={() => setTarget(false)} home={d} />
          <JarSheet open={newJar} jar={null} onClose={() => setNewJar(false)} />
          <AddBillSheet open={addBill} onClose={() => setAddBill(false)} />
        </>
      }>
      {home.error ? <Text style={t.small}>{loadedFrom(d.date)} {home.error}</Text> : null}
      <Band title="Earn" onOpen={() => setPart('earn')}>
        <EarnLead home={d} onMoneyIn={() => setMoneyIn(true)} onTarget={() => setTarget(true)} />
        {d.earn.pending && d.earn.pending.items.length ? (
          <View style={s.sub}>
            <Text style={t.section}>Still to come in</Text>
            <Group>
              {d.earn.pending.items.slice(0, 3).map((o) => <OwedRow key={o.id} o={o} onPress={() => setPart('earn')} />)}
            </Group>
            {d.earn.pending.items.length > 3 ? <Text style={t.small}>{d.earn.pending.items.length - 3} more under Earn</Text> : null}
          </View>
        ) : null}
      </Band>

      <Band title="Spend" onOpen={() => setPart('spend')}>
        <LogLine home={d} />
        <Group>
          <Line label="Today" value={rupees(d.spend.today.spent)} sub={todayLine(d)} />
          <Line label={d.month.name} value={rupees(d.spend.month.spent)} sub={monthSub(d)} />
          {d.spend.recurring.count ? (
            <Line label="Subscriptions" value={rupees(d.spend.recurring.monthly)} sub={subsSub(d)} onPress={() => setPart('spend')}
              a11y={`Subscriptions, ${rupees(d.spend.recurring.monthly)} a month. ${subsSub(d).replace('\n', ' ')}`} />
          ) : (
            <Row title="Add your AI tools" sub="And other subscriptions, so you see what they cost each month" left={<Icon name="plus" size={18} color={a.color} />}
              onPress={() => setAddBill(true)} chevron />
          )}
        </Group>
        {d.spend.imports.review.length ? (
          <Group>
            <Row title="A statement is waiting for you" sub={d.spend.imports.review[0].bank ?? 'Review what the PC read'} left={<Icon name="clock" size={18} color={a.color} />}
              onPress={() => setStatement({ id: d.spend.imports.review[0].id })} chevron />
          </Group>
        ) : null}
      </Band>

      <Band title="Save" onOpen={() => setPart('save')} right={d.save.jars.length ? `${rupees(d.save.total.saved)} put aside` : null}>
        {d.save.jars.length ? (
          <Group>{d.save.jars.slice(0, 2).map((j) => <JarMini key={j.id} jar={j} />)}</Group>
        ) : (
          <View style={s.empty}>
            <Text style={[t.body, s.fill]}>Saving for something? Give it a jar with a target and a date.</Text>
            <Button label="New jar" kind="soft" small onPress={() => setNewJar(true)} icon={<Icon name="plus" size={14} color={a.color} />} />
          </View>
        )}
        {d.save.net != null ? (
          <Group>
            <Line label="What I have" value={d.save.net < 0 ? `${rupees(-d.save.net)} owed` : rupees(d.save.net)} sub={netNote(d)} />
          </Group>
        ) : null}
      </Band>

      <Linked />
    </Page>
  );
}

function monthSub(d: Home) {
  const parts: string[] = [];
  if (d.spend.month.bills > 0) parts.push(`plus ${rupees(d.spend.month.bills)} in bills`);
  else if (d.spend.recurring.count) parts.push(`bills come to ${rupees(d.spend.recurring.monthly)} a month`);
  if (d.spend.imports.lastFiled?.period) parts.push(`statement filed to ${shortDay(d.spend.imports.lastFiled.period.to)}`);
  if (!parts.length) return d.spend.month.count === 0 ? 'Nothing logged yet' : null;
  const out = parts.join(', ');
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** "A month, AI tools ₹1,000" and, under it, the next charge: "Next: Claude ₹1,000 on 3 Dec". */
function subsSub(d: Home) {
  const rec = d.spend.recurring, from = myDay();
  const head = rec.ai <= 0 ? 'A month. No AI tools added yet' : rec.ai >= rec.monthly ? 'A month, all AI tools' : `A month, AI tools ${rupees(rec.ai)}`;
  const next = rec.items.filter((b) => b.next >= from).sort((x, y) => x.next.localeCompare(y.next) || y.amount - x.amount)[0];
  if (!next) return head;
  const when = dayLabel(next.next);
  return `${head}\nNext: ${next.name} ${rupees(next.amount)} ${when === 'Today' || when === 'Tomorrow' ? when.toLowerCase() : `on ${shortDay(next.next)}`}`;
}

/** When the PC can't be reached: which day the figures shown are from. */
function loadedFrom(date: string) {
  const when = dayLabel(date);
  return when === 'Today' ? 'Showing what loaded earlier today.' : `Showing figures from ${when === 'Yesterday' ? 'yesterday' : when}.`;
}

function HomeSkeleton() {
  return (
    <View style={s.skel} accessibilityLabel="Loading Money">
      <Skeleton height={28} width={80} radius={8} />
      <Skeleton height={48} width="55%" radius={12} />
      <Skeleton height={12} radius={6} />
      <Skeleton height={20} width="70%" radius={8} />
      <Skeleton height={52} radius={R.row} />
      <Skeleton height={112} radius={R.card} />
      <Skeleton height={72} radius={R.card} />
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  sub: { gap: SP[8], marginTop: SP[8] },
  empty: { flexDirection: 'row', alignItems: 'center', gap: SP[12] },
  skel: { gap: SP[16] },
});
