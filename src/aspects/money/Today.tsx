import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { C } from '@/theme';
import {
  addDays, Bar, Block, Button, dayLabel, Group, haptic, Icon, Item, Lead, myDay, Press, R, rupees, shortDay, SURF, t, tint, undoable, useAspect,
} from '@/aspects/kit';
import { Linked } from '@/aspects/_linked/Linked';
import { act, logAgain, useTx } from './data';
import { useNav } from './nav';
import { todayLine } from './Spend';
import type { Home, Repeat } from './types';
import { HeroNumber, MiniRing, s as u } from './ui';

/**
 * Money today: the one number for the month (what is left to spend against his plan, or what has gone out when
 * there is no plan), one button to log a spend, the spends he repeats one tap away, the bills coming up, and a line
 * each for what he earned, put aside and has. Every figure is the PC's.
 */
export function TodayTab({ home }: { home: Home }) {
  const d = home;
  return (
    <>
      <MonthLead d={d} />
      {d.spend.repeats.length ? <Again d={d} /> : null}
      <ComingUp d={d} />
      <ThisMonth d={d} />
      {d.spend.leaks.length || d.spend.imports.review.length ? <Waiting d={d} /> : null}
      <Linked />
    </>
  );
}

/** How fresh the balances are, short enough for a row. */
const netShort = (d: Home) => {
  const o = d.save.oldest;
  if (!o) return 'All your balances together';
  return o.ageDays <= 1 ? 'From balances true today' : `Oldest balance from ${shortDay(o.date)}`;
};

const whenLine = (d: Home) => (d.month.daysToGo <= 1 ? `Last day of ${d.month.name}` : `${d.month.name}, ${d.month.daysToGo} days to go`);

// ── the month ──
function MonthLead({ d }: { d: Home }) {
  const a = useAspect();
  const nav = useNav();
  const sp = d.spend;
  const put = d.save.total.month;
  const log = <Button label="Log a spend" kind="accent" icon={<Icon name="plus" size={18} color="#14161C" />} onPress={() => nav.openSheet({ kind: 'spend' })} wrap={u.fill} />;
  if (sp.budgeted && sp.month.budget != null && sp.month.left != null) {
    const over = sp.month.left < 0;
    return (
      <Lead>
        <Text style={[t.footnote, { color: a.color }]}>{whenLine(d)}</Text>
        <View style={u.gap4}>
          <HeroNumber value={rupees(Math.abs(sp.month.left))} label={`${rupees(Math.abs(sp.month.left))} ${over ? 'over the plan' : 'left to spend'} this month`} />
          <Text style={t.subhead}>{over ? 'over the plan this month' : 'left to spend this month'}</Text>
        </View>
        <View style={u.gap8}>
          <Bar progress={sp.month.budget > 0 ? sp.month.spent / sp.month.budget : 1} height={6} color={over ? C.muted : a.color} />
          <Text style={[t.footnote, t.num]}>
            {`${rupees(sp.month.spent)} spent of ${rupees(sp.month.budget)}${put > 0 ? `, after ${rupees(put)} put aside` : ''}. Bills are apart.`}
          </Text>
        </View>
        <View style={s.today}>
          <Text style={t.callout}>Today</Text>
          <Text style={[t.subhead, t.num, u.fill]} numberOfLines={2}>{`${rupees(sp.today.spent)} spent. ${todayLine(d)}.`}</Text>
        </View>
        <View style={u.row}>{log}</View>
      </Lead>
    );
  }
  return (
    <Lead>
      <Text style={[t.footnote, { color: a.color }]}>{whenLine(d)}</Text>
      <View style={u.gap4}>
        <HeroNumber value={rupees(sp.month.spent)} label={`${rupees(sp.month.spent)} spent this month`} />
        <Text style={t.subhead}>{sp.month.count ? 'spent this month so far' : 'spent this month, nothing logged yet'}</Text>
      </View>
      <Text style={[t.footnote, t.num]}>
        {`${[sp.month.bills > 0 ? `Plus ${rupees(sp.month.bills)} in bills` : null, `Today ${rupees(sp.today.spent)}`].filter(Boolean).join('. ')}. A plan by category turns this into what is left to spend.`}
      </Text>
      <View style={u.row}>
        {log}
        <Button label="Make a plan" kind="quiet" onPress={() => nav.openTab('spend')} />
      </View>
    </Lead>
  );
}

// ── spends he repeats ──
function Again({ d }: { d: Home }) {
  const a = useAspect();
  const tx = useTx();
  const [busy, setBusy] = useState<string | null>(null);
  const log = async (r: Repeat) => {
    const k = `${r.merchant}:${r.amount}`;
    if (busy) return;
    setBusy(k);
    const res = await act(logAgain(r), a.notice, "Couldn't log that");
    setBusy(null);
    if (!res) return;
    haptic.success();
    undoable(`${rupees(r.amount)} logged for ${r.merchant}`, () => void act(tx.remove(res.item.id), a.notice, "Couldn't undo that"));
  };
  return (
    <Block title="Again" sub="Spends you repeat. One tap logs one for today.">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.againRow} style={s.bleed}>
        {d.spend.repeats.map((r) => {
          const k = `${r.merchant}:${r.amount}`;
          return (
            <Press key={k} label={`Log ${rupees(r.amount)} for ${r.merchant}`} onPress={() => void log(r)} scale={0.96} style={[s.again, busy === k && s.dim]}>
              <View style={u.between}>
                <Text style={[t.title3, t.num, u.fill]} numberOfLines={1}>{rupees(r.amount)}</Text>
                <View style={[s.plus, { backgroundColor: tint(a.color, 0.16) }]}><Icon name="plus" size={14} color={a.color} /></View>
              </View>
              <Text style={t.callout} numberOfLines={2}>{r.merchant}</Text>
            </Press>
          );
        })}
      </ScrollView>
    </Block>
  );
}

// ── bills in the next two weeks ──
function ComingUp({ d }: { d: Home }) {
  const nav = useNav();
  const from = myDay();
  const until = addDays(from, 13);
  const items = d.spend.recurring.items.filter((b) => b.next >= from && b.next <= until).sort((x, y) => x.next.localeCompare(y.next) || y.amount - x.amount);
  if (!items.length) return null;
  const total = items.reduce((n, b) => n + b.amount, 0);
  return (
    <Block title="Coming up" sub={`${rupees(total)} leaves on its own in the next two weeks.`} action="All bills" onAction={() => nav.openTab('spend')}>
      <Group>
        {items.slice(0, 5).map((b) => (
          <Item key={b.id} title={b.name} sub={dayLabel(b.next, from)} right={<Text style={[t.headline, t.num]}>{rupees(b.amount)}</Text>}
            label={`${b.name}, ${rupees(b.amount)}, ${dayLabel(b.next, from)}`} />
        ))}
      </Group>
    </Block>
  );
}

// ── the rest of the month, a line each ──
function ThisMonth({ d }: { d: Home }) {
  const nav = useNav();
  const { earn, target, save, spend } = d;
  const owed = earn.pending?.total ?? 0;
  const rec = spend.recurring;
  const from = myDay();
  const next = rec.items.filter((b) => b.next >= from).sort((x, y) => x.next.localeCompare(y.next) || y.amount - x.amount)[0];
  const nextWhen = next ? dayLabel(next.next, from) : '';
  const money = (v: string) => <Text style={[t.headline, t.num]}>{v}</Text>;
  const jars = save.jars.length === 1 ? 'one jar' : `${save.jars.length} jars`;
  return (
    <Block title="This month">
      <Group inset={64}>
        <Item title="Earned" onPress={() => nav.openTab('earn')} chevron
          left={<MiniRing progress={target.amount ? earn.earned / target.amount : 0} />}
          sub={[target.amount ? `of ${rupees(target.amount)} target` : 'No target set', owed > 0 ? `${rupees(owed)} still to come in` : null].filter(Boolean).join(', ')}
          right={money(rupees(earn.earned))} label={`Earned ${rupees(earn.earned)}${target.amount ? ` of ${rupees(target.amount)}` : ''}. Open Earn`} />
        <Item title="Put aside" onPress={() => nav.openTab('save')} chevron
          left={<MiniRing progress={save.total.target ? save.total.saved / save.total.target : 0} />}
          sub={save.jars.length ? (save.total.month > 0 ? `${rupees(save.total.month)} this month, ${jars}` : `Nothing in this month, ${jars}`) : 'No jars yet'}
          right={money(rupees(save.total.saved))} label={`Put aside ${rupees(save.total.saved)}. Open Save`} />
        {rec.count ? (
          <Item title="Subscriptions and bills" onPress={() => nav.openTab('spend')} chevron left={<View style={s.glyph}><Icon name="calendar" size={18} color={C.textSoft} /></View>}
            sub={next ? `${rupees(rec.monthly)} a month. Next ${next.name}, ${nextWhen === 'Today' || nextWhen === 'Tomorrow' ? nextWhen.toLowerCase() : shortDay(next.next)}` : `${rupees(rec.monthly)} a month`}
            label={`Subscriptions and bills, ${rupees(rec.monthly)} a month. Open Spend`} lines={2} />
        ) : (
          <Item title="Add your subscriptions" sub="AI tools, phone plan, storage. Once each." onPress={() => nav.openSheet({ kind: 'bill' })} chevron
            left={<View style={s.glyph}><Icon name="plus" size={18} color={C.textSoft} /></View>} />
        )}
        {save.net != null ? (
          <Item title="What I have" onPress={() => nav.openTab('save')} chevron left={<View style={s.glyph}><Icon name="check" size={18} color={C.textSoft} /></View>}
            sub={netShort(d)} right={money(save.net < 0 ? `${rupees(-save.net)} owed` : rupees(save.net))} />
        ) : null}
      </Group>
    </Block>
  );
}

// ── things that need him ──
function Waiting({ d }: { d: Home }) {
  const nav = useNav();
  const leaks = d.spend.leaks;
  const review = d.spend.imports.review;
  return (
    <Block title="For you to look at">
      <Group inset={64}>
        {leaks.length ? (
          <Item title={leaks.length === 1 ? 'One thing to keep or cut' : `${leaks.length} things to keep or cut`} sub={leaks[0].title} onPress={() => nav.openTab('spend')} chevron
            left={<View style={s.glyph}><Icon name="more" size={18} color={C.textSoft} /></View>} />
        ) : null}
        {review.map((i) => (
          <Item key={i.id} title="A statement is waiting" sub={i.bank ?? 'Review what the PC read'} onPress={() => nav.openStatement(i.id)} chevron
            left={<View style={s.glyph}><Icon name="clock" size={18} color={C.textSoft} /></View>} />
        ))}
      </Group>
    </Block>
  );
}

const s = StyleSheet.create({
  today: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  bleed: { marginHorizontal: -16 },
  againRow: { paddingHorizontal: 16, gap: 8 },
  again: {
    width: 136, minHeight: 96, padding: 12, gap: 8, justifyContent: 'flex-start', borderRadius: R.tile, borderCurve: 'continuous',
    backgroundColor: SURF.group, borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.hair,
  },
  plus: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.5 },
  glyph: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.raised },
});
