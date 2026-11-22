import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bar, Card, Chip, Divider, Icon, Press, R, Row, rupees, Section, shortDay, Skeleton, SP, SURF, t, useAspect } from '@/aspects/kit';
import { C } from '@/theme';
import { dayShort, inDays, names, whenDay, yearsWords } from './data';
import type { CalItem, Card as PersonCardData, Chip as ChipData, DateItem, Goal, Home, Jar, MomentBrief } from './types';
import { DateTile, G, LinkRow, MemoryTile, Monogram, Photo, ThingRow, whyOf } from './ui';

// The parts of Family's home, top to bottom: the people, time together today, what is coming, memories, and what
// he is building for them. Each part gets its data and callbacks from index.tsx.

/** One person: their latest photo (or initial), the last time together, this week's small thing. */
export function PersonCard({ c, onOpen, onToggle, onSwap, onAddPhoto, onAddLine }: {
  c: PersonCardData; onOpen: () => void; onToggle: () => void; onSwap: () => void; onAddPhoto: () => void; onAddLine: () => void;
}) {
  const { width, color } = useAspect();
  const photoW = width - 32;
  const last = c.last ? `${c.last.title ?? 'Time together'}, ${whenDay(c.last.date)}` : null;
  return (
    <View style={s.card}>
      <Press label={`${c.name}. ${last ? `Last together: ${last}` : 'Nothing saved yet'}. Open`} onPress={onOpen} scale={0.98} style={s.cardTop}>
        {c.photo ? <Photo id={c.photo.id} style={{ width: photoW, height: Math.round(photoW * 0.42) }} label={c.photo.title ?? `A photo with ${c.name}`} /> : null}
        <View style={s.who}>
          {c.photo ? null : <Monogram name={c.name} />}
          <View style={s.whoText}>
            <View style={s.nameLine}>
              <Text numberOfLines={1} style={[t.heading, s.flex]}>{c.name}</Text>
              <Icon name="right" size={16} color={C.faint} />
            </View>
            {last ? (
              <Text numberOfLines={2} style={t.small}><Text style={{ color: C.textSoft }}>{c.last!.title ?? 'Time together'}</Text>{`, ${whenDay(c.last!.date)}`}</Text>
            ) : (
              <Text style={t.small}>{c.role ? `${c.role}. ` : ''}Nothing saved yet</Text>
            )}
            {c.quiet && c.last ? <Text style={t.small}>A quiet week so far</Text> : null}
          </View>
        </View>
      </Press>
      <View style={s.week}>
        <Divider />
        <Text style={[t.label, s.weekLabel]}>This week</Text>
        <ThingRow pick={c.week.pick} done={c.week.done} onToggle={onToggle} onSwap={c.week.options.length ? onSwap : undefined} sub={whyOf(c.week.pick, true)} />
        {c.week.done ? (
          <View style={s.after}>
            <LinkRow icon={<G name="photo" size={16} color={color} />} label="Add a photo" color={color} onPress={onAddPhoto} />
            <LinkRow icon={<G name="line" size={16} color={color} />} label="Add a line" color={color} onPress={onAddLine} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Time together counts on its own: one tap chips from his routines; a lit one tapped again takes it back. */
export function Together({ chips, onToggle, onOther }: { chips: ChipData[]; onToggle: (c: ChipData) => void; onOther: () => void }) {
  const { color } = useAspect();
  return (
    <Section title="Together today">
      <View style={s.chips}>
        {chips.map((c) => (
          <Chip key={c.key} label={c.label} selected={!!c.moment} onPress={() => onToggle(c)}
            icon={c.moment ? <Icon name="check" size={14} color={color} /> : null} />
        ))}
        <Chip label="Something else" onPress={onOther} icon={<Icon name="plus" size={14} color={C.textSoft} />} />
      </View>
    </Section>
  );
}

/** Dates within two months, planned ahead; unknown birthdays as one quiet line each; a day just gone asks for a memory. */
export function ComingUp({ home, cal, nameOf, onOpen, onAdd, onBirthday, onMemory }: {
  home: Home; cal: CalItem[]; nameOf: (id: string) => string; onOpen: (id: string) => void; onAdd: () => void;
  onBirthday: (person: string) => void; onMemory: (p: { people: string[]; date: string; title: string }) => void;
}) {
  const { color } = useAspect();
  const { soon, next, passed, unknown } = home.dates;
  const shown = soon.length ? soon : next ? [next] : [];
  const nothing = !shown.length && !passed.length && !cal.length;
  return (
    <Section title="Coming up" action="Add" onAction={onAdd} gap={4}>
      {passed.map((d) => (
        <Row key={`p-${d.id}`} title={`${d.title} was ${d.ago === 1 ? 'yesterday' : `${d.ago} days ago`}`} sub="Add a memory of it"
          left={<DateTile day={d.on} />} onPress={() => onMemory({ people: d.people, date: d.on, title: d.title })} chevron
          label={`${d.title}. Add a memory of it`} />
      ))}
      {shown.map((d) => <DateRow key={d.id} d={d} onPress={() => onOpen(d.id)} live={d.days <= 21} color={color} />)}
      {cal.map((e) => (
        <Row key={`c-${e.id}`} title={e.title} sub={`On your calendar, ${inDays(daysTo(e.date, home.today)).toLowerCase()}`} left={<DateTile day={e.date} />} />
      ))}
      {nothing ? <Text style={[t.small, s.pad]}>No dates in the next two months.</Text> : null}
      {unknown.map((u) => (
        <LinkRow key={`u-${u.id}`} icon={<Icon name="plus" size={16} color={C.muted} />} label={`Add ${nameOf(u.id)}'s birthday`} onPress={() => onBirthday(u.id)} />
      ))}
    </Section>
  );
}
const daysTo = (day: string, today: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);

/** "nothing planned yet", "1 of 4 ready", "ready". */
export function planWords(plan: DateItem['plan']) {
  if (!plan || (!plan.total && !plan.idea)) return 'nothing planned yet';
  if (plan.total && plan.done === plan.total) return 'ready';
  if (plan.total) return `${plan.done} of ${plan.total} ready`;
  return 'an idea picked';
}

function DateRow({ d, onPress, live, color }: { d: DateItem; onPress: () => void; live: boolean; color: string }) {
  const plan = planWords(d.plan);
  const more = yearsWords(d);
  const title = more ? `${d.title}, ${more}` : d.title;
  // the second line carries two facts in two tones: when, and how ready
  return (
    <Press label={`${title}, ${inDays(d.days)}, ${plan}. Open the plan`} onPress={onPress} style={s.dateRow} scale={0.98}>
      <DateTile day={d.on} live={live} />
      <View style={s.flex}>
        <Text numberOfLines={2} style={t.strong}>{title}</Text>
        <Text numberOfLines={1} style={t.small}>
          <Text style={live ? { color } : null}>{inDays(d.days)}</Text>
          <Text>{`, ${plan}`}</Text>
        </Text>
      </View>
      <Icon name="right" size={16} color={C.faint} />
    </Press>
  );
}

/** The strip of recent memories, with on this day from other years above it once there is history. */
export function MemoryStrip({ home, onSeeAll, onOpen, onAdd, nameOf }: {
  home: Home; onSeeAll: () => void; onOpen: (m: MomentBrief) => void; onAdd: () => void; nameOf: (id: string) => string;
}) {
  const { recent, onThisDay, count } = home.memories;
  const w = 140;
  return (
    <Section title="Memories" action={count ? 'See all' : undefined} onAction={onSeeAll}>
      {onThisDay.map((m) => (
        <Card key={`otd-${m.id}`} onPress={() => onOpen(m)} label={`On this day in ${m.date.slice(0, 4)}: ${m.note ?? m.title ?? 'a memory'}`} style={s.otd}>
          {m.photo ? <Photo id={m.photo} style={s.otdPhoto} /> : null}
          <View style={s.flex}>
            <Text style={t.label}>On this day in {m.date.slice(0, 4)}</Text>
            <Text numberOfLines={2} style={t.strong}>{m.note ?? m.title}</Text>
          </View>
        </Card>
      ))}
      {recent.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip} style={s.bleed}>
          {recent.map((m) => (
            <MemoryTile key={m.id} m={m} width={w} onPress={() => onOpen(m)} caption={`${names(m.people.map(nameOf))}, ${dayShort(m.date)}`} />
          ))}
          <Press label="Add a memory" onPress={onAdd} wrap={{ width: w }} style={[s.addTile, { height: Math.round(w * 1.25) }]}>
            <Icon name="plus" size={20} color={C.textSoft} />
            <Text style={[t.label, { color: C.textSoft }]}>Add a memory</Text>
          </Press>
        </ScrollView>
      ) : (
        <Card>
          <View style={s.emptyMem}>
            <Text style={t.strong}>A photo and a line when something good happens</Text>
            <Text style={t.small}>They collect here, by person, and come back on the same day next year.</Text>
            <LinkRow icon={<G name="photo" size={16} color={C.textSoft} />} label="Add a memory" onPress={onAdd} />
          </View>
        </Card>
      )}
    </Section>
  );
}

/** What he is building for them, read from Mission and Money. Nothing shows when there is nothing. */
export function ForThem({ goals, jars, onMission, onMoney }: { goals: Goal[]; jars: Jar[]; onMission: () => void; onMoney: () => void }) {
  if (!goals.length && !jars.length) return null;
  return (
    <Section title="For them">
      <Card style={s.forThem}>
        {goals.map((g, i) => (
          <View key={g.id} style={s.forItem}>
            {i > 0 ? <Divider /> : null}
            <Press label={`${g.title}. Open in Mission`} onPress={onMission} style={s.forPress}>
              <View style={s.forHead}>
                <Text numberOfLines={2} style={[t.strong, s.flex]}>{g.title}</Text>
                <Text style={t.caption}>Mission</Text>
              </View>
              {g.progress != null && g.progress > 0 ? <Bar progress={g.progress / 100} height={4} /> : null}
              {g.due ? <Text style={t.small}>By {shortDay(g.due)}</Text> : null}
            </Press>
          </View>
        ))}
        {jars.map((j, i) => (
          <View key={j.id} style={s.forItem}>
            {i > 0 || goals.length ? <Divider /> : null}
            <Press label={`${j.name}. Open in Money`} onPress={onMoney} style={s.forPress}>
              <View style={s.forHead}>
                <Text numberOfLines={2} style={[t.strong, s.flex]}>{j.name}</Text>
                <Text style={t.caption}>Money</Text>
              </View>
              {j.pct != null ? <Bar progress={j.pct} height={4} /> : null}
              <Text style={[t.small, t.num]}>
                {j.saved != null && j.target ? `${rupees(j.saved)} of ${rupees(j.target)}` : j.target ? `Target ${rupees(j.target)}` : j.saved != null ? `${rupees(j.saved)} put aside` : 'A jar in Money'}
              </Text>
            </Press>
          </View>
        ))}
      </Card>
    </Section>
  );
}

/** The home while it loads: the shape of two people, the chips and a date. */
export function HomeSkeleton() {
  return (
    <View style={s.skel}>
      {[0, 1].map((i) => (
        <View key={i} style={[s.card, s.skelCard]}>
          <View style={s.skelWho}><Skeleton width={44} height={44} radius={22} /><View style={[s.flex, s.skelLines]}><Skeleton height={20} width="40%" /><Skeleton height={14} width="70%" /></View></View>
          <Skeleton height={14} width="25%" />
          <Skeleton height={24} width="80%" />
        </View>
      ))}
      <Skeleton height={20} width="35%" />
      <View style={s.chips}>{[96, 88, 120].map((w) => <Skeleton key={w} height={36} width={w} radius={18} />)}</View>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pad: { paddingVertical: SP[8] },
  card: { borderRadius: R.card, borderCurve: 'continuous', backgroundColor: SURF.card, borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.line, overflow: 'hidden' },
  cardTop: { gap: 0 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  whoText: { flex: 1, minWidth: 0, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  week: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 0 },
  weekLabel: { marginTop: 12 },
  after: { flexDirection: 'row', gap: 24, marginTop: -8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8 },
  otd: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  otdPhoto: { width: 56, height: 56, borderRadius: R.inner },
  bleed: { marginHorizontal: -16 },
  strip: { paddingHorizontal: 16, gap: 12 },
  addTile: { borderRadius: R.row, backgroundColor: SURF.row, borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.line, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyMem: { gap: 4 },
  forThem: { paddingVertical: 4 },
  forItem: { gap: 0 },
  forPress: { gap: 8, paddingVertical: 12 },
  forHead: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  skel: { gap: 24 },
  skelCard: { padding: 16, gap: 12 },
  skelWho: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skelLines: { gap: 8 },
});
