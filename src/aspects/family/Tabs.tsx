import { StyleSheet, Text, View } from 'react-native';
import { Bar, Block, Button, Group, Icon, Item, Lead, Skeleton, SURF, t, undoable, useAspect } from '@/aspects/kit';
import { useCollection } from '@/lib/mod';
import { errText, inDays, names, refresh, whenDay } from './data';
import { dateTitle, planWords } from './Home';
import type { CalItem, Card, DateItem, Home, IdeaDoc } from './types';
import { CheckRow, DateTile, Face } from './ui';

// The People and Dates tabs. Each person opens their screen; each date its plan.

const MENTION: Record<string, string> = { gift: 'wants it', plan: 'to do together', showup: 'to do for them' };

/** "Birthday in 6 days", "Anniversary tomorrow", "Lohri at home in 7 weeks". */
function comingWords(d: DateItem) {
  const when = inDays(d.days).toLowerCase();
  if (d.kind === 'birthday' && d.people.length === 1) return `Birthday ${when}`;
  if (d.kind === 'anniversary') return `Anniversary ${when}`;
  return `${d.title} ${when}`;
}

/** Everyone in the family with the last time together and what is coming for them, then the things they mentioned. */
export function PeopleTab({ cards, soon, onOpen, onAdd, onMention, onBirthday }: {
  cards: Card[]; soon: DateItem[]; onOpen: (id: string) => void; onAdd: () => void; onMention: () => void; onBirthday: (id: string) => void;
}) {
  const a = useAspect();
  const ideas = useCollection<IdeaDoc>('people', 'ideas');
  const ids = new Set(cards.map((c) => c.id));
  const nameOf = (id: string) => cards.find((c) => c.id === id)?.name ?? '';
  const open = (ideas.items ?? []).filter((i) => ids.has(i.person) && i.kind !== 'showup' && !i.done)
    .sort((x, y) => String(y.created_at ?? '').localeCompare(String(x.created_at ?? '')));
  const given = (ideas.items ?? []).filter((i) => ids.has(i.person) && i.kind !== 'showup' && i.done).length;
  const unknown = cards.filter((c) => c.birthday !== 'known');
  const toggle = (i: IdeaDoc) => {
    const done = !i.done;
    ideas.patch(i.id, { done, done_on: done ? new Date().toISOString().slice(0, 10) : null }).then(() => refresh()).catch((e) => a.notice(`Couldn't save that: ${errText(e)}`));
    if (done) undoable(`${i.title}, done`, () => { void ideas.patch(i.id, { done: false, done_on: null }).then(() => refresh()); });
  };
  return (
    <>
      <Block title="Your family" action="Add someone" onAction={onAdd}>
        <Group inset={76}>
          {cards.map((c) => {
            const together = c.last ? `together ${whenDay(c.last.date)}` : 'nothing saved yet';
            const first = c.role ? `${c.role}, ${together}` : together.replace(/^./, (x) => x.toUpperCase());
            const next = soon.find((d) => d.people.includes(c.id));
            const coming = next ? comingWords(next) : null;
            return (
              <Item key={c.id} title={c.name} sub={coming ? `${first}\n${coming}` : first} lines={2} onPress={() => onOpen(c.id)} chevron
                label={`${c.name}. ${first}.${coming ? ` ${coming}.` : ''} Open`}
                left={<Face name={c.name} photo={c.photo?.id} size={44} />} />
            );
          })}
        </Group>
      </Block>

      <Block title="Gift and plan ideas" sub={given ? `What they mentioned. ${given} done so far.` : 'What they mentioned wanting or liking.'} action="Add" onAction={onMention}>
        {ideas.items == null && !ideas.error ? <Skeleton height={112} radius={22} /> : open.length ? (
          <Group inset={52}>
            {open.slice(0, 8).map((i) => (
              <CheckRow key={i.id} title={i.title} done={false} onPress={() => toggle(i)} label={`${i.title}, for ${nameOf(i.person)}. Mark as given or done`}
                sub={`${nameOf(i.person)}, ${i.likes ? 'likes it' : MENTION[i.kind] ?? 'mentioned it'}`} />
            ))}
          </Group>
        ) : (
          <Group pad>
            <Text style={t.callout}>Nothing saved yet</Text>
            <Text style={t.footnote}>When someone mentions wanting or liking something, save it here. Gifts and plans get easy later.</Text>
          </Group>
        )}
      </Block>

      {unknown.length ? (
        <Block title="Birthdays to add" sub="So the day never comes as a surprise.">
          <Group inset={64}>
            {unknown.map((c) => (
              <Item key={c.id} title={`Add ${c.name}'s birthday`} onPress={() => onBirthday(c.id)} chevron
                left={<View style={s.plus}><Icon name="plus" size={16} color={a.color} /></View>} />
            ))}
          </Group>
        </Block>
      ) : null}
    </>
  );
}

/** Every date coming, planned ahead; a day just gone asks for a memory; unknown birthdays are one tap to add. */
export function DatesTab({ home, cal, nameOf, onOpen, onAdd, onBirthday, onMemory }: {
  home: Home; cal: CalItem[]; nameOf: (id: string) => string; onOpen: (id: string) => void; onAdd: () => void;
  onBirthday: (person: string) => void; onMemory: (p: { people: string[]; date: string; title: string }) => void;
}) {
  const a = useAspect();
  const { soon, next, passed, unknown } = home.dates;
  const all = soon.length ? soon : next ? [next] : [];
  const lead = all.find((d) => d.days <= 21) ?? null;
  const rest = all.filter((d) => d !== lead);
  return (
    <>
      {lead ? (
        <Lead>
          <View style={s.between}>
            <Text style={[t.footnote, { color: a.color }]}>{inDays(lead.days)}</Text>
            <Text style={t.footnote}>{names(lead.people.map(nameOf))}</Text>
          </View>
          <View style={s.row}>
            <DateTile day={lead.on} live />
            <View style={s.flex}>
              <Text style={t.title3}>{dateTitle(lead)}</Text>
              <Text style={t.subhead}>{lead.plan?.idea ?? 'Nothing planned yet'}</Text>
            </View>
          </View>
          {lead.plan && lead.plan.total ? (
            <View style={s.gap8}>
              <Bar progress={lead.plan.done / lead.plan.total} height={6} color={a.color} />
              <Text style={[t.footnote, t.num]}>{`${lead.plan.done} of ${lead.plan.total} things ready`}</Text>
            </View>
          ) : null}
          <Button label={lead.plan?.idea ? 'Open the plan' : 'Plan it'} kind="accent" onPress={() => onOpen(lead.id)} />
        </Lead>
      ) : null}

      {passed.length ? (
        <Block title="Just gone" sub="A memory of the day, while it is fresh.">
          <Group inset={72}>
            {passed.map((d) => (
              <Item key={d.id} title={`${d.title} was ${d.ago === 1 ? 'yesterday' : `${d.ago} days ago`}`} sub="Add a memory of it" left={<DateTile day={d.on} />}
                onPress={() => onMemory({ people: d.people, date: d.on, title: d.title })} chevron />
            ))}
          </Group>
        </Block>
      ) : null}

      <Block title={lead ? 'After that' : 'Coming up'} action="Add a date" onAction={onAdd}>
        {rest.length || cal.length ? (
          <Group inset={72}>
            {rest.map((d) => (
              <Item key={d.id} title={dateTitle(d)} sub={`${inDays(d.days)}, ${planWords(d.plan)}`} left={<DateTile day={d.on} live={d.days <= 21} />}
                onPress={() => onOpen(d.id)} chevron label={`${dateTitle(d)}, ${inDays(d.days)}, ${planWords(d.plan)}. Open the plan`} />
            ))}
            {cal.map((e) => (
              <Item key={`c-${e.id}`} title={e.title} sub={`On your calendar, ${inDays(daysTo(e.date, home.today)).toLowerCase()}`} left={<DateTile day={e.date} />} />
            ))}
          </Group>
        ) : (
          <Group pad>
            <Text style={t.callout}>{lead ? 'Nothing else in the next two months' : 'No dates in the next two months'}</Text>
            <Text style={t.footnote}>Birthdays, the anniversary and festivals you add come round here with a plan for each.</Text>
          </Group>
        )}
      </Block>

      {unknown.length ? (
        <Block title="Birthdays to add">
          <Group inset={64}>
            {unknown.map((u) => (
              <Item key={u.id} title={`Add ${nameOf(u.id)}'s birthday`} onPress={() => onBirthday(u.id)} chevron
                left={<View style={s.plus}><Icon name="plus" size={16} color={a.color} /></View>} />
            ))}
          </Group>
        </Block>
      ) : null}
    </>
  );
}
const daysTo = (day: string, today: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap8: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  plus: { width: 32, height: 32, borderRadius: 16, backgroundColor: SURF.raised, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 },
});

