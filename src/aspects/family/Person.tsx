import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Block, Button, dayOf, daysBetween, Group, Icon, Item, R, Screen, shortDay, Skeleton, SURF, t, today, undoable, useAspect } from '@/aspects/kit';
import { useCollection, useGet } from '@/lib/mod';
import { C } from '@/theme';
import { askNora, errText, inDays, longDay, nextOn, refresh, useAi, whenDay } from './data';
import type { Cand, Card, DateDoc, IdeaDoc, Memories, MomentBrief } from './types';
import { CheckRow, DateTile, Face, G, Photo, whyOf } from './ui';

// One person in Family: the last time together, this week's small thing and the other ideas, the things they
// mention, their dates, the time together with them, and (quietly, at the end) moving them to Friends or Romance.

export function PersonScreen({ open, onClose, card, noraMade, onToggle, onChoose, onOwn, onMention, onAddDate, onOpenDate, onMemories, onMemory, onAddPhoto, onAddLine, onMove }: {
  open: boolean; onClose: () => void; card: Card | null; noraMade: string | null;
  onToggle: () => void; onChoose: (c: Cand) => void; onOwn: () => void; onMention: () => void;
  onAddDate: (birthday: boolean) => void; onOpenDate: (id: string) => void; onMemories: () => void; onMemory: (m: MomentBrief) => void;
  onAddPhoto: () => void; onAddLine: () => void; onMove: (aspect: 'friends' | 'romance') => void;
}) {
  const a = useAspect();
  const { width, color } = a;
  const ideas = useCollection<IdeaDoc>('people', 'ideas');
  const dates = useCollection<DateDoc>('people', 'dates');
  const mem = useGet<Memories>(card && open ? `/mod/family/memories?person=${encodeURIComponent(card.id)}` : null);
  const nora = useAi('week');
  if (!card) return <Screen open={false} onClose={onClose}><View /></Screen>;
  const c = card;
  const mine = (ideas.items ?? []).filter((i) => i.person === c.id && i.kind !== 'showup').sort((x, y) => Number(x.done) - Number(y.done) || String(y.created_at).localeCompare(String(x.created_at)));
  const theirDates = (dates.items ?? []).filter((d) => d.people?.includes(c.id)).map((d) => ({ d, on: nextOn(d) })).filter((x): x is { d: DateDoc; on: string } => !!x.on).sort((x, y) => x.on.localeCompare(y.on));
  const photoW = width - 32;
  const items = (mem.data?.months ?? []).flatMap((g) => g.items).slice(0, 6);
  const last = c.last ? `Last together: ${c.last.title ?? 'time together'}, ${whenDay(c.last.date)}.` : 'Nothing saved with them yet.';
  const thing = c.week.done ? c.week.done.title ?? c.week.pick?.done_title ?? '' : c.week.pick?.title ?? '';
  const toggleIdea = (i: IdeaDoc) => {
    const done = !i.done;
    ideas.patch(i.id, { done, done_on: done ? today() : null }).then(() => refresh()).catch((e) => a.notice(`Couldn't save that: ${errText(e)}`));
    if (done) undoable(`${i.title}, done`, () => { void ideas.patch(i.id, { done: false, done_on: null }).then(() => refresh()); });
  };
  return (
    <Screen open={open} onClose={onClose} title={c.name}>
      {c.photo ? (
        <Photo id={c.photo.id} thumb={false} style={{ width: photoW, height: Math.round(photoW * 0.62), borderRadius: R.tile }} label={c.photo.title ?? `A photo with ${c.name}`} />
      ) : null}
      <View style={s.who}>
        {c.photo ? null : <Face name={c.name} size={64} />}
        <View style={s.flex}>
          {c.role ? <Text style={t.headline}>{c.role}</Text> : null}
          <Text style={t.subhead}>{last}</Text>
        </View>
      </View>

      <Block title="This week" sub={c.week.done ? 'Done. A photo or a line keeps it.' : 'One small thing for them.'}>
        {thing ? (
          <Group inset={52}>
            <CheckRow title={thing} sub={c.week.done ? 'Done this week' : whyOf(c.week.pick)} done={!!c.week.done} onPress={onToggle}
              label={c.week.done ? `Done: ${thing}. Tap to undo` : `Mark done: ${thing}`} />
            {c.week.done ? <Item title="Add a photo" left={<Ico><G name="photo" size={18} color={color} /></Ico>} onPress={onAddPhoto} chevron /> : null}
            {c.week.done ? <Item title="Add a line" left={<Ico><G name="line" size={18} color={color} /></Ico>} onPress={onAddLine} chevron /> : null}
          </Group>
        ) : (
          <Group pad>
            <Text style={t.callout}>Nothing picked this week</Text>
            <Text style={t.footnote}>Pick one of the ideas below, write your own, or ask Nora.</Text>
          </Group>
        )}
      </Block>

      {!c.week.done ? (
        <Block title="Or one of these">
          <Group inset={c.week.options.length ? 16 : 64}>
            {c.week.options.slice(0, 3).map((o) => (
              <Item key={o.key} title={o.title} sub={whyOf(o)} lines={3} onPress={() => onChoose(o)} label={`Make it this week's: ${o.title}`}
                right={<Text style={[t.subhead, { color }]}>Pick</Text>} />
            ))}
            <Item title="Write my own" left={<Ico><Icon name="pencil" size={16} color={C.textSoft} /></Ico>} onPress={onOwn} chevron />
          </Group>
        </Block>
      ) : null}

      <View style={s.nora}>
        {nora.busy ? (
          <View style={s.noraBusy} accessibilityLiveRegion="polite">
            <ActivityIndicator color={color} />
            <Text style={[t.footnote, s.flex]}>Nora is thinking of ideas for everyone. You can leave this page.</Text>
          </View>
        ) : (
          <>
            <Button label={noraMade ? 'Fresh ideas from Nora' : 'Ask Nora for ideas'} kind="soft" small onPress={() => void askNora('week', '/mod/family/suggest')}
              icon={<G name="sparkle" size={16} color={color} />} wrap={s.start} />
            {nora.error ? <Text style={[t.footnote, { color: C.danger }]}>{nora.error}</Text> : null}
            {noraMade && !nora.error ? <Text style={t.micro}>{`Nora's ideas from ${shortDay(dayOf(Date.parse(noraMade)))}`}</Text> : null}
          </>
        )}
      </View>

      <Block title="Things they mention" action="Add" onAction={onMention}>
        {ideas.items == null && !ideas.error ? <Skeleton height={112} radius={22} /> : mine.length ? (
          <Group inset={52}>
            {mine.map((i) => (
              <CheckRow key={i.id} title={i.title} done={i.done} onPress={() => toggleIdea(i)} label={`${i.title}. ${i.done ? 'Given, tap to undo' : 'Mark as given or done'}`}
                sub={i.done ? 'Done' : i.kind === 'plan' ? 'To do together' : i.likes ? 'They like it' : 'They want it'} />
            ))}
          </Group>
        ) : (
          <Group pad>
            <Text style={t.callout}>Nothing saved yet</Text>
            <Text style={t.footnote}>{`Anything ${c.name} mentions wanting or liking goes here. It makes gifts and plans easy later.`}</Text>
          </Group>
        )}
      </Block>

      <Block title="Dates" action="Add" onAction={() => onAddDate(false)}>
        {theirDates.length || c.birthday !== 'known' ? (
          <Group inset={72}>
            {theirDates.map(({ d, on }) => {
              const n = daysBetween(today(), on);
              return (
                <Item key={d.id} title={d.title} sub={`${longDay(on)}, ${inDays(n).toLowerCase()}`} left={<DateTile day={on} live={n <= 21} />}
                  onPress={() => onOpenDate(d.id)} chevron label={`${d.title}, ${inDays(n)}. Open the plan`} />
              );
            })}
            {c.birthday !== 'known' ? (
              <Item title={`Add ${c.name}'s birthday`} onPress={() => onAddDate(true)} chevron left={<View style={s.plus}><Icon name="plus" size={16} color={color} /></View>} />
            ) : null}
          </Group>
        ) : dates.items == null && !dates.error ? <Skeleton height={64} radius={22} /> : (
          <Group pad><Text style={t.footnote}>No dates coming up.</Text></Group>
        )}
      </Block>

      <Block title="Together" action={items.length ? 'See all' : undefined} onAction={onMemories}>
        {mem.data == null && !mem.error ? <Skeleton height={112} radius={22} /> : null}
        {mem.error && !mem.data ? <Group pad><Text style={t.footnote}>{mem.error}</Text></Group> : null}
        {items.length ? (
          <Group inset={76}>
            {items.map((m) => (
              <Item key={m.id} title={m.note ?? m.title ?? 'Time together'} lines={2} onPress={() => onMemory(m)}
                sub={m.note && m.title ? `${m.title}, ${whenDay(m.date)}` : whenDay(m.date).replace(/^\w/, (x) => x.toUpperCase())}
                left={m.photo ? <Photo id={m.photo} style={s.thumb} /> : <View style={s.thumbEmpty}><G name={m.note ? 'quote' : 'heart'} size={16} color={C.muted} /></View>} />
            ))}
          </Group>
        ) : mem.data ? (
          <Group pad><Text style={t.footnote}>{`Time together and memories with ${c.name} will be here.`}</Text></Group>
        ) : null}
      </Block>

      <View style={s.move}>
        <Text style={t.footnote}>In the wrong section?</Text>
        <View style={s.moveRow}>
          <Button label="Move to Friends" kind="quiet" small onPress={() => onMove('friends')} />
          <Button label="Move to Romance" kind="quiet" small onPress={() => onMove('romance')} />
        </View>
      </View>
    </Screen>
  );
}

/** A row's small round icon. */
function Ico({ children }: { children: ReactNode }) {
  return <View style={s.ico}>{children}</View>;
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  nora: { gap: 8, marginTop: -8 },
  noraBusy: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  start: { alignSelf: 'flex-start' },
  ico: { width: 36, height: 36, borderRadius: 18, backgroundColor: SURF.raised, alignItems: 'center', justifyContent: 'center' },
  plus: { width: 32, height: 32, borderRadius: 16, backgroundColor: SURF.raised, alignItems: 'center', justifyContent: 'center', marginHorizontal: 6 },
  thumb: { width: 48, height: 48, borderRadius: 12 },
  thumbEmpty: { width: 48, height: 48, borderRadius: 12, backgroundColor: SURF.raised, alignItems: 'center', justifyContent: 'center' },
  move: { gap: 8, alignItems: 'flex-start' },
  moveRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
