import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bar, Block, Button, Chip, Group, Icon, Item, Lead, Press, R, Skeleton, SURF, t, useAspect } from '@/aspects/kit';
import { C } from '@/theme';
import { dayShort, goalWords, inDays, jarWords, names, whenDay, yearsWords } from './data';
import type { Card as PersonCardData, Chip as ChipData, DateItem, Goal, Home, Jar, MomentBrief } from './types';
import { CheckButton, DateTile, Face, G, MemoryTile, whyOf } from './ui';

// Family's Home tab, top to bottom: who to give time to now, this week's one small thing for each of them, time
// together today, the dates coming, memories, and what he is building for them. Data and callbacks come from index.tsx.

/** What the lead is about: a date today, a date close and not ready, someone's small thing this week, or all done. */
export type LeadPick =
  | { kind: 'today'; d: DateItem }
  | { kind: 'date'; d: DateItem }
  | { kind: 'thing'; c: PersonCardData }
  | { kind: 'done' }
  | { kind: 'ideas' };

const ready = (d: DateItem) => !!d.plan && d.plan.total > 0 && d.plan.done === d.plan.total;
/** The one thing that matters most now. A day itself first, then a close date with nothing ready, then the people. */
export function pickLead(home: Home, cards: PersonCardData[]): LeadPick {
  const big = (d: DateItem) => d.kind === 'birthday' || d.kind === 'anniversary';
  const today = home.dates.soon.find((d) => d.days === 0 && big(d));
  if (today) return { kind: 'today', d: today };
  // a festival or another day that is today: its plan is the thing
  const day = home.dates.soon.find((d) => d.days === 0);
  if (day) return { kind: 'date', d: day };
  const close = home.dates.soon.find((d) => d.days > 0 && d.days <= 3 && !ready(d));
  if (close) return { kind: 'date', d: close };
  const open = cards.filter((c) => c.week.pick && !c.week.done);
  const thing = open.find((c) => c.quiet) ?? open[0];
  if (thing) return { kind: 'thing', c: thing };
  const soon = home.dates.soon.find((d) => d.days > 0 && d.days <= 14 && !ready(d));
  if (soon) return { kind: 'date', d: soon };
  return cards.some((c) => c.week.done) ? { kind: 'done' } : { kind: 'ideas' };
}

/** "nothing planned yet", "1 of 4 ready", "ready". */
export function planWords(plan: DateItem['plan']) {
  if (!plan || (!plan.total && !plan.idea)) return 'nothing planned yet';
  if (plan.total && plan.done === plan.total) return 'ready';
  if (plan.total) return `${plan.done} of ${plan.total} ready`;
  return 'an idea picked';
}
export const dateTitle = (d: DateItem) => { const more = yearsWords(d); return more ? `${d.title}, ${more}` : d.title; };

/** The lead: one lit action, and it logs or opens in one tap. */
export function FamilyLead({ pick, cards, nameOf, wished, onDone, onSwap, onWished, onOpenDate, onOpenPerson, onAddMemory, onAskNora, asking }: {
  pick: LeadPick; cards: PersonCardData[]; nameOf: (id: string) => string; wished: boolean;
  onDone: (c: PersonCardData) => void; onSwap: (c: PersonCardData) => void; onWished: (d: DateItem) => void;
  onOpenDate: (id: string) => void; onOpenPerson: (id: string) => void; onAddMemory: (preset?: { people: string[]; title: string }) => void;
  onAskNora: () => void; asking: boolean;
}) {
  const { color } = useAspect();
  if (pick.kind === 'today') {
    const d = pick.d;
    const one = d.people.length === 1 ? cards.find((c) => c.id === d.people[0]) ?? null : null;
    const them = one ? (one.pronoun === 'he' ? 'him' : one.pronoun === 'she' ? 'her' : 'them') : 'them';
    return (
      <Lead>
        <Text style={[t.footnote, { color }]}>Today</Text>
        <View style={s.gap4}>
          <Text style={t.large}>{dateTitle(d)}</Text>
          <Text style={t.subhead}>{wished ? `You wished ${them} today. A photo or a line from the day keeps it.` : `The plan: ${planWords(d.plan)}.`}</Text>
        </View>
        <View style={s.row}>
          {wished
            ? <Button label="Add a memory" kind="accent" onPress={() => onAddMemory({ people: d.people, title: d.title })} wrap={s.flex} />
            : <Button label={`Wished ${them}`} kind="accent" onPress={() => onWished(d)} wrap={s.flex} />}
          <Button label="The plan" kind="quiet" onPress={() => onOpenDate(d.id)} />
        </View>
      </Lead>
    );
  }
  if (pick.kind === 'date') {
    const d = pick.d;
    return (
      <Lead>
        <View style={s.between}>
          <Text style={[t.footnote, { color }]}>{inDays(d.days)}</Text>
          <Text style={t.footnote}>{names(d.people.map(nameOf))}</Text>
        </View>
        <View style={s.gap4}>
          <Text style={t.title3}>{dateTitle(d)}</Text>
          <Text style={t.subhead}>{d.plan?.idea ? `${d.plan.idea}. ${planWords(d.plan).replace(/^./, (x) => x.toUpperCase())}.` : 'Nothing planned yet. A short plan now makes the day easy.'}</Text>
        </View>
        {d.plan && d.plan.total ? <Bar progress={d.plan.done / d.plan.total} height={6} color={color} /> : null}
        <Button label={d.plan?.idea ? 'Open the plan' : 'Plan it'} kind="accent" onPress={() => onOpenDate(d.id)} />
      </Lead>
    );
  }
  if (pick.kind === 'thing') {
    const c = pick.c;
    const p = c.week.pick!;
    const last = c.last ? `Last together: ${c.last.title ?? 'time together'}, ${whenDay(c.last.date)}.` : 'Nothing saved with them yet.';
    return (
      <Lead>
        <Press label={`${c.name}. Open`} onPress={() => onOpenPerson(c.id)} style={s.leadWho} scale={0.98}>
          <Face name={c.name} photo={c.photo?.id} size={44} />
          <View style={s.flex}>
            <Text style={[t.footnote, { color }]}>{`Time with ${c.name}`}</Text>
            <Text numberOfLines={1} style={t.footnote}>{c.quiet ? 'A quiet week so far' : c.role ?? 'This week'}</Text>
          </View>
          <Icon name="right" size={14} color={C.faint} />
        </Press>
        <View style={s.gap4}>
          <Text style={t.title3}>{p.title}</Text>
          <Text style={t.subhead}>{whyOf(p) ?? last}</Text>
          {whyOf(p) ? <Text style={t.footnote}>{last}</Text> : null}
        </View>
        <View style={s.row}>
          <Button label="Done" kind="accent" onPress={() => onDone(c)} wrap={s.flex} />
          {c.week.options.length ? <Button label="Another idea" kind="quiet" onPress={() => onSwap(c)} /> : null}
        </View>
      </Lead>
    );
  }
  if (pick.kind === 'done') {
    return (
      <Lead>
        <Text style={[t.footnote, { color }]}>This week</Text>
        <Text style={t.title3}>Each of them has had time with you this week.</Text>
        <Text style={t.subhead}>A photo or a line now keeps it for later.</Text>
        <Button label="Add a memory" kind="accent" onPress={() => onAddMemory()} />
      </Lead>
    );
  }
  return (
    <Lead>
      <Text style={[t.footnote, { color }]}>This week</Text>
      <Text style={t.title3}>One small thing for each of them</Text>
      <Text style={t.subhead}>Nora suggests something small for each person from what they mentioned and what you do together. You choose.</Text>
      <Button label={asking ? 'Nora is thinking' : 'Ask Nora for ideas'} kind="accent" busy={asking} onPress={onAskNora} />
    </Lead>
  );
}

/** This week's one small thing for each person: tick it from here, or open the person. The lead's person is up there. */
export function ThisWeek({ cards, except, onToggle, onOpen }: {
  cards: PersonCardData[]; except: string | null; onToggle: (c: PersonCardData) => void; onOpen: (id: string) => void;
}) {
  const all = cards.filter((c) => c.week.pick || c.week.done);
  const rows = all.filter((c) => c.id !== except);
  if (!rows.length) return null;
  const done = all.filter((c) => c.week.done).length;
  return (
    <Block title="This week" sub="One small thing for each of them." right={<Text style={[t.subhead, t.num, { color: C.muted }]}>{`${done} of ${all.length} done`}</Text>}>
      <Group inset={72}>
        {rows.map((c) => {
          const title = c.week.done ? c.week.done.title ?? c.week.pick?.done_title ?? '' : c.week.pick!.title;
          return (
            <Item key={c.id} title={title} sub={c.week.done ? `${c.name}, done` : `${c.name}${whyOf(c.week.pick, true) ? `, ${whyOf(c.week.pick, true)!.replace(/^./, (x) => x.toLowerCase())}` : ''}`}
              left={<Face name={c.name} photo={c.photo?.id} size={40} />} onPress={() => onOpen(c.id)} label={`${c.name}: ${title}. Open`}
              action={<CheckButton done={!!c.week.done} label={c.week.done ? `Done: ${title}. Tap to undo` : `Mark done: ${title}`} onPress={() => onToggle(c)} />} />
          );
        })}
      </Group>
    </Block>
  );
}

/** Time together counts on its own: one tap chips from his routines; a lit one tapped again takes it back. */
export function Together({ chips, onToggle, onOther }: { chips: ChipData[]; onToggle: (c: ChipData) => void; onOther: () => void }) {
  const { color } = useAspect();
  return (
    <Block title="Together today" sub="One tap saves it.">
      <View style={s.chips}>
        {chips.map((c) => (
          <Chip key={c.key} label={c.label} selected={!!c.moment} onPress={() => onToggle(c)}
            icon={c.moment ? <Icon name="check" size={14} color={color} /> : null} />
        ))}
        <Chip label="Something else" onPress={onOther} icon={<Icon name="plus" size={14} color={C.textSoft} />} />
      </View>
    </Block>
  );
}

/** The next few dates on Home; the Dates tab has them all. */
export function ComingUp({ home, nameOf, onOpen, onAll, onMemory }: {
  home: Home; nameOf: (id: string) => string; onOpen: (id: string) => void; onAll: () => void;
  onMemory: (p: { people: string[]; date: string; title: string }) => void;
}) {
  const { soon, next, passed } = home.dates;
  const shown = (soon.length ? soon : next ? [next] : []).slice(0, 3);
  if (!shown.length && !passed.length) return null;
  return (
    <Block title="Coming up" action="All dates" onAction={onAll}>
      <Group inset={72}>
        {passed.slice(0, 1).map((d) => (
          <Item key={`p-${d.id}`} title={`${d.title} was ${d.ago === 1 ? 'yesterday' : `${d.ago} days ago`}`} sub="Add a memory of it" left={<DateTile day={d.on} />}
            onPress={() => onMemory({ people: d.people, date: d.on, title: d.title })} chevron label={`${d.title}. Add a memory of it`} />
        ))}
        {shown.map((d) => (
          <Item key={d.id} title={dateTitle(d)} sub={`${inDays(d.days)}, ${planWords(d.plan)}`} left={<DateTile day={d.on} live={d.days <= 21} />}
            onPress={() => onOpen(d.id)} chevron label={`${dateTitle(d)}, ${inDays(d.days)}, ${planWords(d.plan)}, ${names(d.people.map(nameOf))}. Open the plan`} />
        ))}
      </Group>
    </Block>
  );
}

/** Recent memories as a strip, with on this day from other years above it once there is history. */
export function MemoryStrip({ home, onSeeAll, onOpen, onAdd, nameOf }: {
  home: Home; onSeeAll: () => void; onOpen: (m: MomentBrief) => void; onAdd: () => void; nameOf: (id: string) => string;
}) {
  const { recent, onThisDay, count } = home.memories;
  const w = 148;
  return (
    <Block title="Memories" action={count ? 'All memories' : undefined} onAction={onSeeAll}>
      {onThisDay.length ? (
        <Group>
          {onThisDay.map((m) => (
            <Item key={`otd-${m.id}`} title={m.note ?? m.title ?? 'A memory'} sub={`On this day in ${m.date.slice(0, 4)}, ${names(m.people.map(nameOf))}`} lines={3}
              left={<View style={s.otdIcon}><G name="heart" size={18} color={C.textSoft} /></View>} onPress={() => onOpen(m)} />
          ))}
        </Group>
      ) : null}
      {recent.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip} style={s.bleed}>
          {recent.map((m) => <MemoryTile key={m.id} m={m} width={w} onPress={() => onOpen(m)} caption={`${names(m.people.map(nameOf))}, ${dayShort(m.date)}`} />)}
          <Press label="Add a memory" onPress={onAdd} wrap={{ width: w }} style={[s.addTile, { height: Math.round(w * 1.25) }]}>
            <Icon name="plus" size={20} color={C.textSoft} />
            <Text style={[t.subhead, { color: C.textSoft }]}>Add a memory</Text>
          </Press>
        </ScrollView>
      ) : (
        <Group pad>
          <Text style={t.callout}>A photo and a line when something good happens</Text>
          <Text style={t.footnote}>They collect here and in Memories, by person, and come back on the same day next year.</Text>
          <View style={s.start}><Button label="Add a memory" kind="soft" small icon={<G name="photo" size={16} />} onPress={onAdd} /></View>
        </Group>
      )}
    </Block>
  );
}

/** What he is building for them, read from Mission and Money with the time each was read. */
export function ForThem({ goals, jars, goalsAt, jarsAt, onMission, onMoney }: {
  goals: Goal[]; jars: Jar[]; goalsAt: number; jarsAt: number; onMission: (goal: string) => void; onMoney: () => void;
}) {
  if (!goals.length && !jars.length) return null;
  return (
    <Block title="For them" sub="From Mission and Money.">
      <Group>
        {goals.map((g) => (
          <Press key={g.id} label={`${g.title}. Open in Mission`} onPress={() => onMission(g.id)} style={s.forRow} scale={0.99}>
            <View style={s.between}>
              <Text numberOfLines={2} style={[t.callout, s.flex]}>{g.title}</Text>
              <Text style={t.micro}>Mission</Text>
            </View>
            {g.progress != null && g.progress >= 1 ? <Bar progress={Math.min(1, g.progress / 100)} height={4} /> : null}
            {goalWords(g, goalsAt) ? <Text style={[t.footnote, t.num]}>{goalWords(g, goalsAt)}</Text> : null}
          </Press>
        ))}
        {jars.map((j) => (
          <Press key={j.id} label={`${j.name}. Open in Money`} onPress={onMoney} style={s.forRow} scale={0.99}>
            <View style={s.between}>
              <Text numberOfLines={2} style={[t.callout, s.flex]}>{j.name}</Text>
              <Text style={t.micro}>Money</Text>
            </View>
            {j.pct != null ? <Bar progress={j.pct} height={4} /> : null}
            <Text style={[t.footnote, t.num]}>{jarWords(j, jarsAt)}</Text>
          </Press>
        ))}
      </Group>
    </Block>
  );
}

/** The home while it loads: the lead, the week and the chips. */
export function HomeSkeleton() {
  return (
    <View style={s.skel}>
      <Skeleton height={232} radius={28} />
      <Skeleton height={20} width="35%" />
      <Skeleton height={200} radius={22} />
      <View style={s.chips}>{[112, 96, 120].map((w) => <Skeleton key={w} height={40} width={w} radius={20} />)}</View>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap4: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  leadWho: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  otdIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: SURF.raised, alignItems: 'center', justifyContent: 'center' },
  bleed: { marginHorizontal: -16 },
  strip: { paddingHorizontal: 16, gap: 12 },
  addTile: { borderRadius: R.tile, borderCurve: 'continuous', backgroundColor: SURF.group, borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.hair, alignItems: 'center', justifyContent: 'center', gap: 8 },
  start: { alignSelf: 'flex-start' },
  forRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  skel: { gap: 16 },
});
