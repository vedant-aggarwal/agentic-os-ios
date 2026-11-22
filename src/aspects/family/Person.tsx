import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button, daysBetween, Divider, Icon, Press, R, Row, Screen, Section, shortDay, Skeleton, SP, t, today, useAspect } from '@/aspects/kit';
import { useCollection, useGet } from '@/lib/mod';
import { C } from '@/theme';
import { askNora, inDays, longDay, nextOn, refresh, useAi, whenDay } from './data';
import type { Cand, Card, DateDoc, IdeaDoc, Memories, MomentBrief } from './types';
import { DateTile, G, LinkRow, Monogram, Photo, ThingRow, whyOf } from './ui';

// One person in Family: this week's small thing and the other ideas, the things they mention, their dates, the time
// together with them, and (quietly, at the end) moving them to Friends or Romance.

export function PersonScreen({ open, onClose, card, noraMade, onToggle, onChoose, onOwn, onMention, onAddDate, onOpenDate, onMemories, onMemory, onAddPhoto, onAddLine, onMove }: {
  open: boolean; onClose: () => void; card: Card | null; noraMade: string | null;
  onToggle: () => void; onChoose: (c: Cand) => void; onOwn: () => void; onMention: () => void;
  onAddDate: (birthday: boolean) => void; onOpenDate: (id: string) => void; onMemories: () => void; onMemory: (m: MomentBrief) => void;
  onAddPhoto: () => void; onAddLine: () => void; onMove: (aspect: 'friends' | 'romance') => void;
}) {
  const { width, color } = useAspect();
  const ideas = useCollection<IdeaDoc>('people', 'ideas');
  const dates = useCollection<DateDoc>('people', 'dates');
  const mem = useGet<Memories>(card && open ? `/mod/family/memories?person=${encodeURIComponent(card.id)}` : null);
  const nora = useAi('week');
  if (!card) return <Screen open={false} onClose={onClose}><View /></Screen>;
  const c = card;
  const mine = (ideas.items ?? []).filter((i) => i.person === c.id && i.kind !== 'showup').sort((a, b) => Number(a.done) - Number(b.done) || String(b.created_at).localeCompare(String(a.created_at)));
  const theirDates = (dates.items ?? []).filter((d) => d.people?.includes(c.id)).map((d) => ({ d, on: nextOn(d) })).filter((x): x is { d: DateDoc; on: string } => !!x.on).sort((a, b) => a.on.localeCompare(b.on));
  const photoW = width - 32;
  const items = (mem.data?.months ?? []).flatMap((g) => g.items).slice(0, 6);
  const toggleIdea = (i: IdeaDoc) => { void ideas.patch(i.id, { done: !i.done, done_on: i.done ? null : today() }).then(() => refresh()); };
  return (
    <Screen open={open} onClose={onClose} title={c.name}>
      <View style={s.head}>
        {c.photo ? <Photo id={c.photo.id} thumb={false} style={{ width: photoW, height: Math.round(photoW * 0.62), borderRadius: R.card }} label={c.photo.title ?? `A photo with ${c.name}`} /> : <Monogram name={c.name} size={64} />}
        <View style={s.headText}>
          {c.role ? <Text style={t.label}>{c.role}</Text> : null}
          <Text style={t.body}>{c.last ? `Last together: ${c.last.title ?? 'time together'}, ${whenDay(c.last.date)}` : 'Nothing saved with them yet.'}</Text>
        </View>
      </View>

      <Section title="This week" gap={4}>
        <ThingRow pick={c.week.pick} done={c.week.done} onToggle={onToggle} sub={whyOf(c.week.pick)} />
        {c.week.done ? (
          <View style={s.links}>
            <LinkRow icon={<G name="photo" size={16} color={color} />} label="Add a photo" color={color} onPress={onAddPhoto} />
            <LinkRow icon={<G name="line" size={16} color={color} />} label="Add a line" color={color} onPress={onAddLine} />
          </View>
        ) : (
          <>
            {c.week.options.length ? <Text style={[t.label, s.sub]}>Or one of these</Text> : null}
            {c.week.options.slice(0, 3).map((o) => (
              <Row key={o.key} title={o.title} sub={whyOf(o)} onPress={() => onChoose(o)} label={`Make it this week's: ${o.title}`}
                right={<Text style={[t.label, { color }]}>Pick</Text>} />
            ))}
            <LinkRow icon={<Icon name="pencil" size={16} color={C.textSoft} />} label="Write my own" onPress={onOwn} />
          </>
        )}
        <View style={s.nora}>
          {nora.busy ? (
            <View style={s.noraBusy} accessibilityLiveRegion="polite">
              <ActivityIndicator color={color} />
              <Text style={[t.small, s.flex]}>Nora is thinking of ideas for everyone. You can leave this page.</Text>
            </View>
          ) : (
            <>
              <Button label={noraMade ? 'Fresh ideas from Nora' : 'Ask Nora for ideas'} kind="soft" small onPress={() => void askNora('week', '/mod/family/suggest')}
                icon={<G name="sparkle" size={16} color={color} />} wrap={s.start} />
              {nora.error ? <Text style={[t.small, { color: C.danger }]}>{nora.error}</Text> : null}
              {noraMade && !nora.error ? <Text style={t.caption}>{`Nora's ideas from ${shortDay(noraMade.slice(0, 10))}`}</Text> : null}
            </>
          )}
        </View>
      </Section>

      <Section title="Things they mention" action="Add" onAction={onMention} gap={4}>
        {ideas.items == null && !ideas.error ? <Skeleton height={48} /> : null}
        {mine.map((i) => (
          <Row key={i.id} title={i.title} onToggle={() => toggleIdea(i)} done={i.done} label={`${i.title}. ${i.done ? 'Given, tap to undo' : 'Mark as given or done'}`}
            sub={i.done ? 'Done' : i.kind === 'plan' ? 'To do together' : i.likes ? 'They like it' : 'They want it'} />
        ))}
        {ideas.items && !mine.length ? (
          <Text style={[t.small, s.pad]}>Anything {c.name} mentions wanting or liking goes here. It makes gifts and plans easy later.</Text>
        ) : null}
      </Section>

      <Section title="Dates" action="Add" onAction={() => onAddDate(false)} gap={4}>
        {theirDates.map(({ d, on }) => (
          <Row key={d.id} title={d.title} sub={`${longDay(on)}, ${inDays(daysBetween(today(), on)).toLowerCase()}`} left={<DateTile day={on} />} onPress={() => onOpenDate(d.id)} chevron />
        ))}
        {c.birthday !== 'known' ? <LinkRow icon={<Icon name="plus" size={16} color={C.muted} />} label={`Add ${c.name}'s birthday`} onPress={() => onAddDate(true)} /> : null}
        {dates.items && !theirDates.length && c.birthday === 'known' ? <Text style={[t.small, s.pad]}>No dates coming up.</Text> : null}
      </Section>

      <Section title="Together" action={items.length ? 'See all' : undefined} onAction={onMemories} gap={4}>
        {mem.data == null && !mem.error ? <Skeleton height={56} /> : null}
        {mem.error && !mem.data ? <Text style={t.small}>{mem.error}</Text> : null}
        {items.map((m) => (
          <Press key={m.id} label={`${m.note ?? m.title ?? 'Time together'}, ${whenDay(m.date)}`} onPress={() => onMemory(m)} style={s.moment}>
            {m.photo ? <Photo id={m.photo} style={s.thumb} /> : <View style={s.thumbEmpty}><G name={m.note ? 'quote' : 'heart'} size={16} color={C.muted} /></View>}
            <View style={s.flex}>
              <Text numberOfLines={2} style={t.strong}>{m.note ?? m.title ?? 'Time together'}</Text>
              <Text style={t.small}>{m.note && m.title ? `${m.title}, ${whenDay(m.date)}` : whenDay(m.date).replace(/^\w/, (x) => x.toUpperCase())}</Text>
            </View>
          </Press>
        ))}
        {mem.data && !items.length ? <Text style={[t.small, s.pad]}>Time together and memories with {c.name} will be here.</Text> : null}
      </Section>

      <View style={s.move}>
        <Divider />
        <Text style={t.small}>In the wrong section?</Text>
        <View style={s.moveRow}>
          <Button label="Move to Friends" kind="quiet" small onPress={() => onMove('friends')} />
          <Button label="Move to Romance" kind="quiet" small onPress={() => onMove('romance')} />
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pad: { paddingVertical: SP[8] },
  head: { gap: 16 },
  headText: { gap: 4 },
  sub: { marginTop: 8 },
  links: { flexDirection: 'row', gap: 24 },
  nora: { gap: 8, marginTop: 12 },
  noraBusy: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 },
  start: { alignSelf: 'flex-start' },
  moment: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  thumb: { width: 48, height: 48, borderRadius: R.inner + 4 },
  thumbEmpty: { width: 48, height: 48, borderRadius: R.inner + 4, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  move: { gap: 12, marginTop: 8 },
  moveRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
