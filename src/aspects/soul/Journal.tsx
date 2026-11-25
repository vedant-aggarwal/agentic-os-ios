import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import {
  addDays, ago, Block, Button, Chip, Failed, Group, Icon, IconButton, Item, Lead, Loading, Metric, Metrics, myDay, Press, Segmented, Sheet, Skeleton,
  SURF, t, tint, useAspect, weekday,
} from '@/aspects/kit';
import { call, useCollection } from '@/lib/mod';
import { C, F } from '@/theme';
import { errText, nightLabel, refreshJournal, useEntries, useJournalDay, type Entry, type JournalDay, type JournalOut, type Reading, type Settings } from './data';
import { useNav } from './nav';
import { Gl, plural } from './parts';
import { moodWord } from './words';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FILTERS = ['All', 'Bookmarked', 'Photos', 'Spoken'] as const;
const REMIND = ['21:00', '21:30', '22:00', '22:30', '23:00'];
const wordsOf = (e: Entry) => e.words ?? (e.text?.trim() ? e.text.trim().split(/\s+/).length : 0);

/**
 * Journal: tonight's entry on top (write or speak), then things from his day and prompts to start from, the entries
 * as a list or a month, his numbers, Nora's reading and the reminder. The list never shows what he wrote: only the
 * day, the length and the mood, until he opens one.
 */
export function JournalTab() {
  const nav = useNav();
  const day = useJournalDay();
  const journal = useEntries();
  const [view, setView] = useState<'list' | 'month'>('list');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [pick, setPick] = useState<string | null>(null);
  const [shown, setShown] = useState(8);
  const [reading, setReading] = useState(false);
  const all = useMemo(() => (journal.items ?? []).filter((e) => !e.deleted_at && (e.text?.trim() || e.photos?.length))
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.at).localeCompare(String(a.at))), [journal.items]);
  const list = view === 'month' ? all.filter((e) => e.date === pick) : all.filter((e) =>
    (filter === 'All' || (filter === 'Bookmarked' && e.bookmark) || (filter === 'Photos' && e.photos?.length) || (filter === 'Spoken' && e.kind === 'voice'))
    && (!q.trim() || `${e.title ?? ''} ${e.text}`.toLowerCase().includes(q.trim().toLowerCase())));
  const d = day.data;
  const mine = all.filter((e) => e.date === myDay());
  const days = (n: number) => (n === 1 ? 'day' : 'days');

  return (
    <>
      <TonightLead mine={mine} d={d} />

      {!d && day.error ? <Failed message={day.error} onRetry={() => { void day.refresh(); }} /> : null}
      {!d && !day.error ? <Skeleton height={168} radius={22} /> : null}
      {d ? <Ideas d={d} /> : null}

      <Block title="Entries" sub="Only the day and length show here. Open one to read it.">
        {journal.items == null && journal.error ? <Failed message={journal.error} onRetry={() => { void journal.refresh(); }} /> : null}
        {journal.items == null && !journal.error ? <Skeleton height={168} radius={22} /> : null}
        {journal.items && all.length === 0 ? (
          <Group pad>
            <Text style={t.callout}>No entries yet</Text>
            <Text style={t.footnote}>Two lines are enough. Start from something in your day above, or just start.</Text>
            <View style={s.self}><Button label="Write the first one" kind="soft" small onPress={() => nav.write({})} /></View>
          </Group>
        ) : null}
        {all.length ? (
          <Segmented options={[{ key: 'list', label: 'List' }, { key: 'month', label: 'Month' }]} value={view}
            onChange={(v) => { setView(v); setPick(null); setShown(8); }} />
        ) : null}
        {all.length && view === 'list' ? (
          <>
            <Search value={q} onChange={setQ} />
            <View style={s.wrap}>
              {FILTERS.map((f) => <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />)}
            </View>
            {!list.length ? <Text style={t.footnote}>Nothing matches.</Text> : null}
          </>
        ) : null}
        {all.length && view === 'month' ? (
          <>
            <Month entries={all} pick={pick} onPick={setPick} />
            {pick && !list.length ? <Text style={t.footnote}>{`${nightLabel(pick)}: nothing written.`}</Text> : null}
          </>
        ) : null}
        {list.length ? (
          <Group>
            {list.slice(0, shown).map((e) => <EntryRow key={e.id} e={e} onPress={() => nav.openEntry(e)} />)}
          </Group>
        ) : null}
        {list.length > shown ? <View style={s.self}><Button label="Show more" kind="quiet" small onPress={() => setShown((n) => n + 20)} /></View> : null}
      </Block>

      {d && d.stats.entries ? (
        <Block title="Your journal">
          <Group pad>
            <Metrics>
              <Metric size="s" label="Written" value={String(d.stats.days)} unit={days(d.stats.days)} />
              <Metric size="s" label="This week" value={String(d.stats.week)} unit={days(d.stats.week)} />
              <Metric size="s" label="In a row" value={String(d.stats.streak.current)} unit={days(d.stats.streak.current)} />
            </Metrics>
            <Text style={[t.micro, t.num]}>{`${plural(d.stats.words, 'word')} this year. Longest run ${plural(d.stats.streak.best, 'day')}.`}</Text>
          </Group>
        </Block>
      ) : null}

      <Block title="Nora's reading">
        <Group>
          <Item title="The last four weeks" chevron onPress={() => setReading(true)}
            sub={d?.reading ? `Read ${ago(d.reading.at).toLowerCase()} from ${plural(d.reading.n ?? 0, 'entry', 'entries')}. Open to see it.` : 'What went well, what keeps coming back, lines worth keeping.'}
            left={<View style={s.glyph}><Gl k="sparkles" size={16} color={C.textSoft} /></View>} lines={3} />
        </Group>
      </Block>
      <Reminder />
      <ReadingSheet open={reading} onClose={() => setReading(false)} reading={d?.reading ?? null} />
    </>
  );
}

// ── tonight ──
function TonightLead({ mine, d }: { mine: Entry[]; d: JournalDay | null }) {
  const a = useAspect();
  const nav = useNav();
  const words = mine.reduce((n, e) => n + wordsOf(e), 0);
  const mood = mine.map((e) => moodWord(e.p)).find(Boolean) ?? null;
  const streak = d?.stats.streak.current ?? 0;
  return (
    <Lead>
      <View style={s.gap4}>
        <Text style={[t.footnote, { color: a.color }]}>{"Tonight's entry"}</Text>
        <Text style={t.title3}>{mine.length ? 'Written today' : 'Two lines about today'}</Text>
        <Text style={[t.footnote, t.num]}>
          {mine.length ? `${plural(words, 'word')}${mood ? `, feeling ${mood.toLowerCase()}` : ''}${streak > 1 ? `. ${streak} days in a row` : ''}.` : streak ? `${plural(streak, 'day')} in a row so far.` : 'Typed or spoken. It saves as you go.'}
        </Text>
      </View>
      <View style={s.row}>
        {mine.length ? (
          <Button label="Open it" kind="accent" onPress={() => nav.openEntry(mine[0])} wrap={s.flex} icon={<Gl k="book" size={16} color="#14161C" />} />
        ) : (
          <Button label="Write" kind="accent" onPress={() => nav.write({})} wrap={s.flex} icon={<Icon name="pencil" size={16} color="#14161C" />} />
        )}
        <Button label={mine.length ? 'Another' : 'Speak'} kind="quiet" onPress={() => nav.write(mine.length ? {} : { speak: true })}
          icon={mine.length ? <Icon name="plus" size={16} /> : <Icon name="mic" size={16} />} />
      </View>
    </Lead>
  );
}

// ── things from today: his day, then prompts ──
function Ideas({ d }: { d: JournalDay }) {
  const { color, notice } = useAspect();
  const nav = useNav();
  const [at, setAt] = useState(0);
  const [ai, setAi] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const bank = d.prompts.length ? [0, 1, 2].map((i) => d.prompts[(at + i) % d.prompts.length]).filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i) : [];
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
        <Block title="From your day">
          <Group inset={60}>
            {d.suggestions.map((x) => (
              <Item key={x.id} title={x.title} sub={x.kind === 'yesterday' ? null : x.detail} chevron onPress={() => nav.write({ prompt: x.prompt })}
                left={<View style={[s.glyph, { backgroundColor: tint(color, 0.14) }]}><Gl k={x.kind === 'yesterday' ? 'book' : 'leaf'} size={16} color={color} /></View>} />
            ))}
          </Group>
        </Block>
      ) : null}
      <Block title="Prompts" action="Shuffle" onAction={() => setAt((n) => n + 3)}>
        <Group>
          {bank.map((p) => <Item key={p.id} title={p.text} lines={3} chevron onPress={() => nav.write({ prompt: p.text })} />)}
          {ai.map((p) => <Item key={p} title={p} lines={3} chevron onPress={() => nav.write({ prompt: p })} left={<Gl k="sparkles" size={16} color={color} />} />)}
        </Group>
        {!ai.length ? (
          <View style={s.self}>
            <Button label={busy ? 'Thinking' : 'Prompts from my entries'} kind="soft" small busy={busy} onPress={() => { void more(); }} icon={<Gl k="sparkles" size={14} color={color} />} />
          </View>
        ) : null}
      </Block>
    </>
  );
}

function EntryRow({ e, onPress }: { e: Entry; onPress: () => void }) {
  const { color } = useAspect();
  const mood = moodWord(e.p);
  const n = wordsOf(e);
  return (
    <Item title={nightLabel(e.date)} label={`Entry, ${nightLabel(e.date)}. Open`} onPress={onPress} chevron
      sub={[n ? plural(n, 'word') : e.photos?.length ? 'A photo' : null, mood ? mood.toLowerCase() : null].filter(Boolean).join(', ') || null}
      right={(
        <View style={s.icons}>
          {e.kind === 'voice' ? <Gl k="wave" size={14} color={C.muted} /> : null}
          {e.photos?.length ? <Gl k="photo" size={14} color={C.muted} /> : null}
          {e.bookmark ? <Gl k="bookmarkOn" size={14} color={color} /> : null}
        </View>
      )} />
  );
}

function Search({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { color } = useAspect();
  return (
    <View style={s.search}>
      <Gl k="search" size={16} color={C.muted} />
      <TextInput value={value} onChangeText={onChange} placeholder="Search entries" placeholderTextColor={C.faint} selectionColor={color}
        keyboardAppearance="dark" returnKeyType="search" accessibilityLabel="Search entries" style={s.searchInput} />
      {value ? <IconButton label="Clear search" size={44} plain onPress={() => onChange('')}><Icon name="close" size={12} color={C.muted} /></IconButton> : null}
    </View>
  );
}

// ── the month: written days filled, brighter for a better mood ──
function Month({ entries, pick, onPick }: { entries: Entry[]; pick: string | null; onPick: (d: string | null) => void }) {
  const { color } = useAspect();
  const [month, setMonth] = useState(() => myDay().slice(0, 7));
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
  const now = myDay();
  const count = cells.filter((c) => c && written.has(c)).length;
  return (
    <Group pad>
      <View style={s.monthHead}>
        <IconButton label="Previous month" size={44} plain onPress={() => step(-1)}><Icon name="left" size={14} /></IconButton>
        <Text style={[t.headline, s.flexC]}>{`${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`}</Text>
        <IconButton label="Next month" size={44} plain onPress={() => step(1)} disabled={month >= now.slice(0, 7)}><Icon name="right" size={14} /></IconButton>
      </View>
      <View>
        <View style={s.weekHead}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => <Text key={i} style={[t.micro, s.cellText]}>{l}</Text>)}</View>
        <View style={s.grid}>
          {cells.map((c, i) => {
            if (!c) return <View key={i} style={s.cell} />;
            const has = written.has(c), on = pick === c, future = c > now;
            return (
              <Press key={c} label={`${nightLabel(c)}${has ? ', written' : ''}`} onPress={() => onPick(on ? null : c)} disabled={future} feel="tick" scale={0.9} wrap={s.cell}
                style={[s.dayBox, has && { backgroundColor: tint(color, 0.22 + 0.1 * ((written.get(c) ?? 3) - 1)) }, on && { borderColor: color }, c === now && !has && s.todayBox]}>
                <Text style={[s.dayNum, has && { color: C.text }]}>{Number(c.slice(8))}</Text>
              </Press>
            );
          })}
        </View>
      </View>
      <Text style={t.micro}>{`${plural(count, 'day')} written this month. Brighter days had a better mood. Tap a day to see its entries.`}</Text>
    </Group>
  );
}

// ── the periodic AI reading, behind a tap ──
function ReadingSheet({ open, onClose, reading }: { open: boolean; onClose: () => void; reading: Reading<JournalOut> | null }) {
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
    <Sheet open={open} onClose={onClose} title="Nora's reading">
      {busy ? <Loading label="Nora is reading your entries" /> : null}
      {!busy && r ? (
        <>
          <Text style={t.headline}>{r.out.headline}</Text>
          {r.out.good ? <Text style={t.subhead}>{r.out.good}</Text> : null}
          {r.out.returning.length ? <View style={s.wrap}>{r.out.returning.map((x) => <Chip key={x} label={x} />)}</View> : null}
          {r.out.noticed ? <Text style={t.subhead}>{r.out.noticed}</Text> : null}
          {r.out.quotes.map((x) => (
            <View key={x.date + x.text} style={[s.quote, { borderLeftColor: tint(color, 0.5) }]}>
              <Text style={t.subhead}>{x.text}</Text>
              <Text style={t.micro}>{nightLabel(x.date)}</Text>
            </View>
          ))}
          <Text style={t.footnote}>{`Read ${ago(r.at).toLowerCase()} from ${plural(r.n ?? 0, 'entry', 'entries')}.`}</Text>
          <Button label="Read again" kind="quiet" onPress={() => { void read(true); }} />
        </>
      ) : null}
      {!busy && !r ? (
        <>
          <Text style={t.subhead}>
            {need != null ? `Write ${plural(need, 'more entry', 'more entries')} in these four weeks first.`
              : 'Nora reads your last four weeks: what went well, what keeps coming back, and lines worth keeping. It stays here until the next one.'}
          </Text>
          <Button label="Read my entries" kind="soft" onPress={() => { void read(false); }} icon={<Gl k="sparkles" size={14} color={color} />} />
        </>
      ) : null}
      {err ? <Text style={[t.footnote, { color: C.danger }]}>{err}</Text> : null}
    </Sheet>
  );
}

// ── the evening reminder ──
function Reminder() {
  const settings = useCollection<Settings>('soul', 'settings');
  const { notice } = useAspect();
  const cur = (settings.items ?? []).find((x) => x.id === 'journal');
  const value = cur ? cur.remind ?? null : '21:30';
  const set = async (v: string | null) => {
    try { await settings.put({ id: 'journal', remind: v }); } catch (e) { notice(errText(e)); }
  };
  return (
    <Block title="Evening reminder" sub="One quiet notification, skipped on days you have already written.">
      <View style={s.wrap}>
        {REMIND.map((r) => <Chip key={r} label={r} selected={value === r} onPress={() => { void set(r); }} icon={value === r ? <Gl k="bell" size={12} /> : undefined} />)}
        <Chip label="Off" selected={value == null} onPress={() => { void set(null); }} />
      </View>
    </Block>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  flexC: { flex: 1, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  self: { alignSelf: 'flex-start' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gap4: { gap: 4 },
  glyph: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.raised },
  icons: { flexDirection: 'row', gap: 8 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderRadius: 22, paddingLeft: 14,
    backgroundColor: SURF.group, borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.hair,
  },
  searchInput: { flex: 1, minHeight: 40, color: C.text, fontFamily: F.regular, fontSize: 16, outlineWidth: 0 },
  monthHead: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -8, marginTop: -8 },
  weekHead: { flexDirection: 'row', marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  cellText: { width: `${100 / 7}%`, textAlign: 'center' },
  dayBox: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  todayBox: { borderColor: SURF.edge },
  dayNum: { fontFamily: F.medium, fontSize: 13, lineHeight: 16, color: C.muted, fontVariant: ['tabular-nums'] },
  quote: { borderLeftWidth: 2, paddingLeft: 12, gap: 2 },
});
