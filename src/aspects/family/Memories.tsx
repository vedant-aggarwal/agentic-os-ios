import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Block, Button, Chip, Failed, Group, Item, Press, R, shortDay, Skeleton, SURF, t, useAspect } from '@/aspects/kit';
import { useGet } from '@/lib/mod';
import { C, F } from '@/theme';
import { names } from './data';
import type { Memories, MomentBrief } from './types';
import { G, MemoryTile, Photo } from './ui';

// Memories: the family album as a tab. A person filter, on this day in other years, the year in a handful of
// moments, then month by month: photos large, lines quoted, plain time together as compact rows.

export function MemoriesTab({ active, person, onPerson, onOpen, onAdd }: {
  active: boolean; person: string | null; onPerson: (id: string | null) => void; onOpen: (m: MomentBrief) => void; onAdd: () => void;
}) {
  const { width } = useAspect();
  const [seen, setSeen] = useState(active);
  if (active && !seen) setSeen(true);
  const r = useGet<Memories>(seen ? `/mod/family/memories${person ? `?person=${encodeURIComponent(person)}` : ''}` : null);
  const [shown, setShown] = useState(4); // months on screen; more as he asks
  const d = r.data && (r.data.person ?? null) === person ? r.data : null;
  const nameOf = (id: string) => d?.people.find((p) => p.id === id)?.name ?? '';
  const big = width - 32;
  return (
    <>
      <View style={s.top}>
        {d && d.people.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.filters}>
            <Chip label="Everyone" selected={!person} onPress={() => onPerson(null)} />
            {d.people.map((p) => <Chip key={p.id} label={p.name} selected={person === p.id} onPress={() => onPerson(p.id)} />)}
          </ScrollView>
        ) : null}
        <Button label="Add a memory" kind="soft" icon={<G name="photo" size={18} />} onPress={onAdd} />
      </View>
      {!d && r.error ? <Failed message={r.error} onRetry={r.refresh} /> : null}
      {!d && !r.error ? <View style={s.skel}><Skeleton height={Math.round(big * 0.6)} radius={R.tile} /><Skeleton height={56} /><Skeleton height={56} /></View> : null}
      {d && !d.count ? (
        <Group pad>
          <Text style={t.callout}>{person ? `Nothing with ${nameOf(person)} yet` : 'Your family album starts here'}</Text>
          <Text style={t.footnote}>A photo and a line when something good happens. Time together you tap on Home shows here too.</Text>
        </Group>
      ) : null}
      {d && d.onThisDay.length ? (
        <Block title="On this day">
          <Group>
            {d.onThisDay.map((m) => (
              <Item key={m.id} title={m.note ?? m.title ?? 'A memory'} sub={`${m.date.slice(0, 4)}, ${names(m.people.map(nameOf))}`} lines={3} onPress={() => onOpen(m)}
                left={m.photo ? <Photo id={m.photo} style={s.otdPhoto} /> : <View style={s.otdIcon}><G name="heart" size={18} color={C.textSoft} /></View>} />
            ))}
          </Group>
        </Block>
      ) : null}
      {d && d.year.length ? (
        <Block title="Your year in a few moments">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.strip}>
            {d.year.map((m) => <MemoryTile key={m.id} m={m} width={136} onPress={() => onOpen(m)} caption={shortDay(m.date)} />)}
          </ScrollView>
        </Block>
      ) : null}
      {d ? d.months.slice(0, shown).map((g) => (
        <Block key={g.month} title={g.label} gap={12}>
          {g.items.map((m) => <Entry key={m.id} m={m} big={big} who={names(m.people.map(nameOf))} onOpen={() => onOpen(m)} />)}
        </Block>
      )) : null}
      {d && d.months.length > shown ? <Button label="Show earlier months" kind="quiet" onPress={() => setShown((n) => n + 6)} /> : null}
    </>
  );
}

/** One moment in the timeline, as large as what it holds. */
function Entry({ m, big, who, onOpen }: { m: MomentBrief; big: number; who: string; onOpen: () => void }) {
  const day = shortDay(m.date);
  if (m.photo) {
    return (
      <Press label={`${m.note ?? m.title ?? 'A photo'}, ${who}, ${day}`} onPress={onOpen} style={s.entry} scale={0.98}>
        <Photo id={m.photo} style={{ width: big, height: Math.round(big * 0.75), borderRadius: R.tile }} />
        {m.note || m.title ? <Text style={t.callout}>{m.note ?? m.title}</Text> : null}
        <Text style={t.footnote}>{`${who}, ${day}`}</Text>
      </Press>
    );
  }
  if (m.note) {
    return (
      <Press label={`${m.note}, ${who}, ${day}`} onPress={onOpen} style={s.quote} scale={0.98}>
        <Text style={[t.headline, s.quoteText]}>{m.note}</Text>
        <Text style={t.footnote}>{[m.title, who, day].filter(Boolean).join(', ')}</Text>
      </Press>
    );
  }
  return (
    <Press label={`${m.title ?? 'Time together'}, ${who}, ${day}`} onPress={onOpen} style={s.plain} scale={0.98}>
      <G name="heart" size={16} color={C.faint} />
      <Text numberOfLines={1} style={[t.subhead, s.flex]}>{m.title ?? 'Time together'}</Text>
      <Text style={[t.footnote, t.num]}>{day}</Text>
    </Press>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  top: { gap: 12 },
  bleed: { marginHorizontal: -16 },
  filters: { paddingHorizontal: 16, gap: 8 },
  strip: { paddingHorizontal: 16, gap: 12 },
  skel: { gap: 16 },
  otdPhoto: { width: 48, height: 48, borderRadius: 12 },
  otdIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: SURF.raised, alignItems: 'center', justifyContent: 'center' },
  entry: { gap: 8 },
  quote: {
    gap: 8, padding: 16, borderRadius: R.tile, borderCurve: 'continuous', backgroundColor: SURF.group,
    borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.hair,
  },
  quoteText: { fontFamily: F.medium, color: C.text },
  plain: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 4 },
});
