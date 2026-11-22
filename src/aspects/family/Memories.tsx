import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Chip, Empty, Failed, Icon, IconButton, Press, R, Screen, Section, shortDay, Skeleton, t, useAspect } from '@/aspects/kit';
import { useGet } from '@/lib/mod';
import { C } from '@/theme';
import { names } from './data';
import type { Memories, MomentBrief } from './types';
import { G, MemoryTile, Photo } from './ui';

// Memories: the family album. A person filter, on this day in other years, the year in a handful of moments, then
// month by month: photos large, lines quoted, plain time together as compact rows.

export function MemoriesScreen({ open, onClose, person, onPerson, onOpen, onAdd }: {
  open: boolean; onClose: () => void; person: string | null; onPerson: (id: string | null) => void;
  onOpen: (m: MomentBrief) => void; onAdd: () => void;
}) {
  const { width } = useAspect();
  const r = useGet<Memories>(open ? `/mod/family/memories${person ? `?person=${encodeURIComponent(person)}` : ''}` : null);
  const [shown, setShown] = useState(4); // months on screen; more as he asks
  const d = r.data && (r.data.person ?? null) === person ? r.data : null;
  const nameOf = (id: string) => d?.people.find((p) => p.id === id)?.name ?? '';
  const big = width - 32;
  return (
    <Screen open={open} onClose={onClose} title="Memories" right={
      <IconButton label="Add a memory" size={36} onPress={onAdd}><Icon name="plus" size={16} /></IconButton>
    }>
      {d && d.people.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.filters}>
          <Chip label="Everyone" selected={!person} onPress={() => onPerson(null)} />
          {d.people.map((p) => <Chip key={p.id} label={p.name} selected={person === p.id} onPress={() => onPerson(p.id)} />)}
        </ScrollView>
      ) : null}
      {!d && r.error ? <Failed message={r.error} onRetry={r.refresh} /> : null}
      {!d && !r.error ? <View style={s.skel}><Skeleton height={36} width="70%" radius={18} /><Skeleton height={Math.round(big * 0.75)} radius={R.row} /><Skeleton height={56} /></View> : null}
      {d && !d.count ? (
        <Empty title={person ? `Nothing with ${nameOf(person)} yet` : 'Your family album starts here'}
          body="A photo and a line when something good happens. Time together you tap on the home shows here too." action="Add a memory" onAction={onAdd} />
      ) : null}
      {d && d.onThisDay.length ? (
        <Section title="On this day">
          {d.onThisDay.map((m) => (
            <Card key={m.id} onPress={() => onOpen(m)} label={`${m.date.slice(0, 4)}: ${m.note ?? m.title}`} style={s.otd}>
              {m.photo ? <Photo id={m.photo} style={s.otdPhoto} /> : null}
              <View style={s.flex}><Text style={t.label}>{m.date.slice(0, 4)}</Text><Text numberOfLines={3} style={t.strong}>{m.note ?? m.title}</Text></View>
            </Card>
          ))}
        </Section>
      ) : null}
      {d && d.year.length ? (
        <Section title="Your year in a few moments">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.strip}>
            {d.year.map((m) => <MemoryTile key={m.id} m={m} width={132} onPress={() => onOpen(m)} caption={shortDay(m.date)} />)}
          </ScrollView>
        </Section>
      ) : null}
      {d ? d.months.slice(0, shown).map((g) => (
        <Section key={g.month} title={g.label} gap={12}>
          {g.items.map((m) => <Entry key={m.id} m={m} big={big} who={names(m.people.map(nameOf))} onOpen={() => onOpen(m)} />)}
        </Section>
      )) : null}
      {d && d.months.length > shown ? <Button label="Show earlier months" kind="quiet" onPress={() => setShown((n) => n + 6)} /> : null}
    </Screen>
  );
}

/** One moment in the timeline, as large as what it holds. */
function Entry({ m, big, who, onOpen }: { m: MomentBrief; big: number; who: string; onOpen: () => void }) {
  const day = shortDay(m.date);
  if (m.photo) {
    return (
      <Press label={`${m.note ?? m.title ?? 'A photo'}, ${who}, ${day}`} onPress={onOpen} style={s.entry} scale={0.98}>
        <Photo id={m.photo} style={{ width: big, height: Math.round(big * 0.75), borderRadius: R.row }} />
        {m.note || m.title ? <Text style={t.strong}>{m.note ?? m.title}</Text> : null}
        <Text style={t.small}>{`${who}, ${day}`}</Text>
      </Press>
    );
  }
  if (m.note) {
    return (
      <Press label={`${m.note}, ${who}, ${day}`} onPress={onOpen} style={s.quote} scale={0.98}>
        <Text style={[t.lead, { color: C.textSoft }]}>{m.note}</Text>
        <Text style={t.small}>{[m.title, who, day].filter(Boolean).join(', ')}</Text>
      </Press>
    );
  }
  return (
    <Press label={`${m.title ?? 'Time together'}, ${who}, ${day}`} onPress={onOpen} style={s.plain} scale={0.98}>
      <G name="heart" size={16} color={C.faint} />
      <Text numberOfLines={1} style={[t.body, s.flex]}>{m.title ?? 'Time together'}</Text>
      <Text style={[t.small, t.num]}>{day}</Text>
    </Press>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  bleed: { marginHorizontal: -16 },
  filters: { paddingHorizontal: 16, gap: 8 },
  strip: { paddingHorizontal: 16, gap: 12 },
  skel: { gap: 16 },
  otd: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  otdPhoto: { width: 64, height: 64, borderRadius: R.inner },
  entry: { gap: 8 },
  quote: { gap: 4, paddingVertical: 8, paddingLeft: 16, borderLeftWidth: 2, borderLeftColor: 'rgba(255,255,255,0.16)' },
  plain: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
});
