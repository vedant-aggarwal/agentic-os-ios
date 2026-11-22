import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import {
  addDays, ago, Button, Card, Chip, dayLabel, Empty, Failed, Icon, IconButton, Loading, Press, Row, Screen, Section, Skeleton,
  SURF, t, tint, today, useAspect, weekday,
} from '@/aspects/kit';
import { call, useCollection, type Read } from '@/lib/mod';
import { C, F } from '@/theme';
import { errText, refreshJournal, type Entry, type JournalDay, type JournalOut, type Reading, type Settings } from './data';
import type { Seed } from './Editor';
import { Fig, Gl, plural } from './parts';
import { moodWord } from './words';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FILTERS = ['All', 'Bookmarked', 'Photos', 'Spoken'] as const;
const REMIND = ['21:00', '21:30', '22:00', '22:30', '23:00'];

/** Journal: write or speak, things from his day, prompts, his numbers, a month calendar, search, the entries, the AI reading. */
export function Journal({ open, onClose, day, onWrite, onOpen }: {
  open: boolean; onClose: () => void; day: Read<JournalDay>; onWrite: (seed: Seed) => void; onOpen: (e: Entry) => void;
}) {
  const journal = useCollection<Entry>('growth', 'journal');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [pick, setPick] = useState<string | null>(null);
  const [shown, setShown] = useState(12);
  const all = useMemo(() => (journal.items ?? []).filter((e) => !e.deleted_at && (e.text?.trim() || e.photos?.length))
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.at).localeCompare(String(a.at))), [journal.items]);
  const list = all.filter((e) => (!pick || e.date === pick)
    && (filter === 'All' || (filter === 'Bookmarked' && e.bookmark) || (filter === 'Photos' && e.photos?.length) || (filter === 'Spoken' && e.kind === 'voice'))
    && (!q.trim() || `${e.title ?? ''} ${e.text}`.toLowerCase().includes(q.trim().toLowerCase())));
  const d = day.data;

  return (
    <Screen open={open} onClose={onClose} title="Journal">
      <View style={s.two}>
        <Button label="Write" onPress={() => onWrite({})} wrap={s.flex} icon={<Icon name="pencil" size={16} color={C.scene} />} />
        <Button label="Speak" kind="quiet" onPress={() => onWrite({ speak: true })} wrap={s.flex} icon={<Icon name="mic" size={16} />} />
      </View>

      {!d && day.error ? <Failed message={day.error} onRetry={day.refresh} /> : null}
      {!d && !day.error ? <View style={{ gap: 12 }}><Skeleton height={56} radius={16} /><Skeleton height={56} radius={16} /><Skeleton height={88} radius={24} /></View> : null}
      {d ? <Today d={d} onWrite={onWrite} /> : null}

      <Section title="Your journal">
        {d ? (
          <View style={s.figs}>
            <Fig value={`${d.stats.days}`} label="days written" />
            <Fig value={`${d.stats.week}`} label="this week" />
            <Fig value={`${d.stats.streak.current}`} label="days in a row" />
            <Fig value={d.stats.words >= 10_000 ? `${Math.round(d.stats.words / 1000)}k` : `${d.stats.words}`} label="words this year" />
          </View>
        ) : null}
        <Month entries={all} pick={pick} onPick={(x) => { setPick(x); setShown(12); }} />
      </Section>

      <Section title={pick ? dayLabel(pick) : 'Entries'} action={pick ? 'Show all' : undefined} onAction={() => setPick(null)}>
        <Search value={q} onChange={setQ} />
        <View style={s.wrap}>
          {FILTERS.map((f) => <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />)}
        </View>
        {journal.items == null && journal.error ? <Failed message={journal.error} onRetry={journal.refresh} /> : null}
        {journal.items == null && !journal.error ? <Skeleton height={96} radius={24} /> : null}
        {journal.items && all.length === 0 ? (
          <Empty title="Your entries will be here" body="Two lines are enough. Pick something from your day above, or just start." action="Write the first one" onAction={() => onWrite({})} />
        ) : null}
        {journal.items && all.length > 0 && list.length === 0 ? <Text style={t.small}>Nothing matches.</Text> : null}
        {list.slice(0, shown).map((e) => <EntryCard key={e.id} e={e} onPress={() => onOpen(e)} />)}
        {list.length > shown ? <Button label="Show more" kind="quiet" small onPress={() => setShown((n) => n + 20)} wrap={s.self} /> : null}
      </Section>

      <JournalRead reading={d?.reading ?? null} />
      <Reminder />
    </Screen>
  );
}

// ── things from today: suggestions from his day and prompts ────────────────────────────────────────────────────
function Today({ d, onWrite }: { d: JournalDay; onWrite: (seed: Seed) => void }) {
  const { color, notice } = useAspect();
  const [at, setAt] = useState(0);
  const [ai, setAi] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const bank = d.prompts.length ? [0, 1, 2].map((i) => d.prompts[(at + i) % d.prompts.length]).filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i) : [];
  const more = async () => {
    setBusy(true);
    try {
      const r = await call<{ ready: boolean; need?: number; item: Reading<{ prompts: string[] }> | null }>('/mod/soul/journal/prompts', {});
      if (!r.ready) notice(`Write ${plural(r.need ?? 1, 'more entry', 'more entries')} first, then prompts can come from what you wrote.`);
      else setAi(r.item?.out.prompts ?? []);
    } catch (e) { notice(errText(e)); } finally { setBusy(false); }
  };
  return (
    <>
      {d.suggestions.length ? (
        <Section title="From your day">
          {d.suggestions.map((x) => (
            <Row key={x.id} title={x.title} sub={x.detail} chevron onPress={() => onWrite({ prompt: x.prompt })}
              left={<View style={[s.sug, { backgroundColor: tint(color, 0.14) }]}><Gl k={x.kind === 'yesterday' ? 'book' : 'leaf'} size={16} color={color} /></View>} />
          ))}
        </Section>
      ) : null}
      <Section title="Prompts" action="Shuffle" onAction={() => setAt((n) => n + 3)}>
        {bank.map((p) => (
          <Press key={p.id} label={p.text} onPress={() => onWrite({ prompt: p.text })} style={s.prompt}><Text style={t.strong}>{p.text}</Text></Press>
        ))}
        {ai.map((p) => (
          <Press key={p} label={p} onPress={() => onWrite({ prompt: p })} style={[s.prompt, { borderColor: tint(color, 0.3), borderWidth: 1 }]}>
            <Text style={t.strong}>{p}</Text>
          </Press>
        ))}
        {!ai.length ? (
          <Button label={busy ? 'Thinking' : 'Prompts from my entries'} kind="soft" small busy={busy} onPress={more} wrap={s.self}
            icon={<Gl k="sparkles" size={14} color={color} />} />
        ) : null}
      </Section>
    </>
  );
}

function EntryCard({ e, onPress }: { e: Entry; onPress: () => void }) {
  const { color } = useAspect();
  const mood = moodWord(e.p);
  return (
    <Card onPress={onPress} label={`Entry, ${dayLabel(e.date)}`}>
      <View style={s.cardHead}>
        <Text style={t.label}>{dayLabel(e.date)}{mood ? ` · ${mood}` : ''}</Text>
        <View style={s.icons}>
          {e.kind === 'voice' ? <Gl k="wave" size={14} color={C.muted} /> : null}
          {e.photos?.length ? <Gl k="photo" size={14} color={C.muted} /> : null}
          {e.bookmark ? <Gl k="bookmarkOn" size={14} color={color} /> : null}
        </View>
      </View>
      <Text numberOfLines={3} style={[t.body, s.gap4]}>{e.text?.trim() || 'A photo'}</Text>
    </Card>
  );
}

function Search({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { color } = useAspect();
  return (
    <View style={s.search}>
      <Gl k="search" size={16} color={C.muted} />
      <TextInput value={value} onChangeText={onChange} placeholder="Search entries" placeholderTextColor={C.faint} selectionColor={color}
        keyboardAppearance="dark" returnKeyType="search" accessibilityLabel="Search entries" style={s.searchInput} />
      {value ? <IconButton label="Clear search" size={28} plain onPress={() => onChange('')}><Icon name="close" size={12} color={C.muted} /></IconButton> : null}
    </View>
  );
}

// ── the month calendar ──────────────────────────────────────────────────────────────────────────────────────────
function Month({ entries, pick, onPick }: { entries: Entry[]; pick: string | null; onPick: (d: string | null) => void }) {
  const { color } = useAspect();
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const written = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const e of entries) if (!m.has(e.date) || (e.p != null && m.get(e.date) == null)) m.set(e.date, e.p ?? null);
    return m;
  }, [entries]);
  const first = `${month}-01`;
  const lead = (weekday(first) + 6) % 7; // Monday first
  const len = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: len }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  const step = (n: number) => { const d = addDays(first, n > 0 ? 32 : -1); setMonth(d.slice(0, 7)); };
  const now = today();
  const count = cells.filter((c) => c && written.has(c)).length;
  return (
    <Card>
      <View style={s.monthHead}>
        <IconButton label="Previous month" size={32} plain onPress={() => step(-1)}><Icon name="left" size={14} /></IconButton>
        <Text style={[t.strong, s.flexC]}>{MONTHS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}</Text>
        <IconButton label="Next month" size={32} plain onPress={() => step(1)} disabled={month >= now.slice(0, 7)}><Icon name="right" size={14} /></IconButton>
      </View>
      <View style={s.weekHead}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => <Text key={i} style={[t.caption, s.cellText]}>{l}</Text>)}</View>
      <View style={s.grid}>
        {cells.map((c, i) => {
          if (!c) return <View key={i} style={s.cell} />;
          const has = written.has(c), on = pick === c, future = c > now;
          return (
            <Press key={c} label={`${dayLabel(c)}${has ? ', written' : ''}`} onPress={() => onPick(on ? null : c)} disabled={future} feel="tick" scale={0.9} wrap={s.cell}
              style={[s.dayBox, has && { backgroundColor: tint(color, 0.22 + 0.1 * ((written.get(c) ?? 3) - 1)) }, on && { borderColor: color, borderWidth: 1.5 }, c === now && !has && s.todayBox]}>
              <Text style={[s.dayNum, has && { color: C.text }]}>{Number(c.slice(8))}</Text>
            </Press>
          );
        })}
      </View>
      <Text style={[t.caption, s.gap8]}>{plural(count, 'day')} written this month. Brighter days had a better mood.</Text>
    </Card>
  );
}

// ── the periodic AI reading ─────────────────────────────────────────────────────────────────────────────────────
function JournalRead({ reading }: { reading: Reading<JournalOut> | null }) {
  const { color } = useAspect();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [need, setNeed] = useState<number | null>(null);
  const r = reading;
  const read = async (force: boolean) => {
    setBusy(true); setErr(null);
    try {
      const res = await call<{ ready: boolean; need?: number }>('/mod/soul/journal/read', { force });
      if (!res.ready) setNeed(res.need ?? null); else { setNeed(null); refreshJournal(); }
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Section title="Reading of the last four weeks" action={r && !busy ? 'Read again' : undefined} onAction={() => read(true)}>
      {busy ? <Loading label="Reading your entries" /> : null}
      {!busy && r ? (
        <Card>
          <Text style={t.lead}>{r.out.headline}</Text>
          {r.out.good ? <Text style={[t.body, s.gap8]}>{r.out.good}</Text> : null}
          {r.out.returning.length ? (
            <View style={[s.wrap, s.gap8]}>{r.out.returning.map((x) => <Chip key={x} label={x} />)}</View>
          ) : null}
          {r.out.noticed ? <Text style={[t.body, s.gap8]}>{r.out.noticed}</Text> : null}
          {r.out.quotes.map((x) => (
            <View key={x.date + x.text} style={[s.quote, { borderLeftColor: tint(color, 0.5) }]}>
              <Text style={t.body}>{x.text}</Text>
              <Text style={t.caption}>{dayLabel(x.date)}</Text>
            </View>
          ))}
          <Text style={[t.caption, s.gap8]}>Read {ago(r.at)} from {plural(r.n ?? 0, 'entry', 'entries')}.</Text>
        </Card>
      ) : null}
      {!busy && !r ? (
        <Card>
          <Text style={t.body}>
            {need != null ? `Write ${plural(need, 'more entry', 'more entries')} in these four weeks first.`
              : 'An AI reading of your last four weeks: what went well, what keeps coming back, and lines worth keeping. Saved here until the next one.'}
          </Text>
          <Button label="Read my entries" kind="soft" small onPress={() => read(false)} wrap={[s.self, s.gap8]} icon={<Gl k="sparkles" size={14} color={color} />} />
        </Card>
      ) : null}
      {err ? <Text style={[t.small, { color: C.danger }]}>{err}</Text> : null}
    </Section>
  );
}

// ── the evening reminder ────────────────────────────────────────────────────────────────────────────────────────
function Reminder() {
  const settings = useCollection<Settings>('soul', 'settings');
  const { notice } = useAspect();
  const cur = (settings.items ?? []).find((x) => x.id === 'journal');
  const value = cur ? cur.remind ?? null : '21:30';
  const set = async (v: string | null) => {
    try { await settings.put({ id: 'journal', remind: v }); } catch (e) { notice(errText(e)); }
  };
  return (
    <Section title="Evening reminder">
      <View style={s.wrap}>
        {REMIND.map((r) => <Chip key={r} label={r} selected={value === r} onPress={() => set(r)} icon={value === r ? <Gl k="bell" size={12} /> : undefined} />)}
        <Chip label="Off" selected={value == null} onPress={() => set(null)} />
      </View>
      <Text style={t.caption}>One quiet notification, skipped on days you have already written.</Text>
    </Section>
  );
}

const s = StyleSheet.create({
  two: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  flexC: { flex: 1, textAlign: 'center' },
  self: { alignSelf: 'flex-start' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  figs: { flexDirection: 'row', gap: 8 },
  gap4: { marginTop: 4 },
  gap8: { marginTop: 8 },
  sug: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  prompt: { padding: 16, borderRadius: 16, backgroundColor: SURF.row, borderCurve: 'continuous' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icons: { flexDirection: 'row', gap: 8 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderRadius: 22, paddingLeft: 14, paddingRight: 6, backgroundColor: SURF.card },
  searchInput: { flex: 1, minHeight: 40, color: C.text, fontFamily: F.regular, fontSize: 16, outlineWidth: 0 },
  monthHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  weekHead: { flexDirection: 'row', marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  cellText: { width: `${100 / 7}%`, textAlign: 'center' },
  dayBox: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  todayBox: { borderColor: SURF.line },
  dayNum: { fontFamily: F.medium, fontSize: 13, lineHeight: 16, color: C.muted, fontVariant: ['tabular-nums'] },
  quote: { borderLeftWidth: 2, paddingLeft: 12, marginTop: 12, gap: 2 },
});
