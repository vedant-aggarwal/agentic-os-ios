import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  Bar, Block, Button, Chip, Failed, Field, Group, Icon, IconButton, Item, Keypad, Lead, Metric, Metrics, Press, Sheet, Skeleton, SURF,
  WeekStrip, dayLabel, haptic, lastDays, myDay, shortDay, t, timer, tint, undoable, useAspect,
} from '@/aspects/kit';
import { call, collection, invalidate, useCollection, useGet, type Doc } from '@/lib/mod';
import { C } from '@/theme';
import { Dictate } from './Dictate';
import { useNav } from './nav';
import type { Book, Found, Pace, ReadView, TakeSpec } from './types';
import { Sym, useLast, useNow } from './ui';

export const READ = '/mod/mind/read';
/** A day inside a sentence: "today", "yesterday", "on Thu 19 Nov". */
export const when = (d: string) => { const w = dayLabel(d); return w === 'Today' || w === 'Yesterday' || w === 'Tomorrow' ? w.toLowerCase() : `on ${w}`; };
export const sayTakeaway = (id: string, text: string, title: string): TakeSpec =>
  ({ kind: 'learned', topic: `Say more about what stuck from ${title}.`, label: 'Say what you learned', source: { kind: 'takeaway', id, title } });

/** Start a timed sitting on a book; Done reading ends it. */
export async function startReading(book: string) {
  await call('/mod/mind/read/start', { book });
  invalidate('/mod/mind/');
}

/** A book's cover over a plain block with its first letter. */
export function Cover({ book, w = 56 }: { book: { title: string; cover: string | null }; w?: number }) {
  const h = Math.round(w * 1.5);
  // the first letter sits under the picture, so a cover that is slow or missing still shows something
  return (
    <View style={[s.cover, { width: w, height: h, borderRadius: Math.max(4, Math.round(w / 12)) }]}>
      <Text style={[w >= 48 ? t.title3 : t.headline, { color: C.muted }]}>{book.title.replace(/^the\s+/i, '').slice(0, 1).toUpperCase()}</Text>
      {book.cover ? <Image source={{ uri: book.cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessibilityIgnoresInvertColors /> : null}
    </View>
  );
}

/** Minutes and seconds since a sitting started, ticking only while the page is open. */
export function Elapsed({ since, style }: { since: string; style?: object }) {
  const a = useAspect();
  const now = useNow(1000, a.open);
  const secs = Math.max(0, (now - Date.parse(since)) / 1000);
  return <Text style={[t.title3, t.num, style]} accessibilityLabel={`Reading for ${Math.floor(secs / 60)} minutes`}>{timer(secs)}</Text>;
}

/**
 * Read: the book in hand first (where he is, the pace, one tap to log pages read, or the timer), his reading week,
 * the other books on the go, the questions made from his notes, the notes themselves, what is next and what is
 * finished.
 */
export function ReadTab({ active }: { active: boolean }) {
  const a = useAspect();
  const nav = useNav();
  const [seen, setSeen] = useState(active);
  if (active && !seen) setSeen(true);
  const g = useGet<ReadView>(a.open && seen ? READ : null);
  const v = g.data;
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState(false);
  const [editing, setEditing] = useState<Book | null>(null);

  if (!v) return g.error ? <Failed message={g.error} onRetry={g.refresh} /> : <ReadSkeleton />;
  if (v.total === 0) {
    return (
      <>
        <Group pad>
          <Sym name="book" size={28} color={C.muted} />
          <Text style={t.title3}>No books yet</Text>
          <Text style={t.subhead}>Add the book you are reading. After that, logging pages takes one tap and the lines that stick come back as questions.</Text>
          <Button label="Add a book" kind="accent" onPress={() => setAdding(true)} />
        </Group>
        <AddBookSheet open={adding} onClose={() => setAdding(false)} hasReading={false} />
      </>
    );
  }
  const due = v.recall.due.length;
  // the book with a sitting running leads; else the first in hand
  const lead = v.reading.find((b) => b.sitting_since) ?? v.reading[0] ?? null;
  const also = v.reading.filter((b) => b !== lead);
  return (
    <>
      {lead ? <NowReading book={lead} onEdit={() => setEditing(lead)} /> : (
        <Group pad>
          <Text style={t.callout}>Nothing on the go</Text>
          <Text style={t.footnote}>Pick one from next up below, or add the one in your hands.</Text>
          <Button label="Add a book" kind="soft" small onPress={() => setAdding(true)} wrap={s.start} />
        </Group>
      )}

      {lead ? <ReadingWeek book={lead} /> : null}

      {also.length ? (
        <Block title="Also reading" action="Add a book" onAction={() => setAdding(true)}>
          <Group inset={64}>
            {also.map((b) => (
              <Item key={b.id} title={b.title} onPress={() => setEditing(b)} label={`${b.title}: pages, on hold, finished or remove`} left={<Cover book={b} w={32} />}
                sub={b.sitting_since ? 'Reading now' : b.pages ? `Page ${b.page} of ${b.pages}` : `Page ${b.page}`}
                action={<Button label={b.sitting_since ? 'Done' : 'Log'} kind="quiet" small onPress={() => nav.logSitting(b.id)} />} />
            ))}
          </Group>
        </Block>
      ) : null}

      {due || v.recall.total ? (
        <Block title="Bring it back" sub="Questions made from your own lines. A miss only brings one back sooner.">
          <Group>
            {due ? (
              <Item title={due === 1 ? 'One question due' : `${due} questions due`} sub="A minute or two" onPress={nav.openRecall}
                left={<View style={[s.disc, { backgroundColor: tint(a.color, 0.16) }]}><Sym name="bulb" size={18} color={a.color} /></View>}
                action={<Button label="Start" kind="soft" small onPress={nav.openRecall} />} />
            ) : (
              <Item title="Nothing due today" sub={v.recall.next ? `Next question ${when(v.recall.next)}` : 'Questions come from the lines you save'}
                left={<View style={s.disc}><Sym name="bulb" size={18} color={C.muted} /></View>} />
            )}
          </Group>
        </Block>
      ) : null}

      <Block title="Your notes" sub={v.takeaways.length ? 'What stuck, in your words. Tap the microphone to say one in a minute.' : null} action={v.reading.length || v.done.length ? 'Add a note' : undefined} onAction={() => setNote(true)}>
        {v.takeaways.length ? (
          <Group>
            {v.takeaways.slice(0, 6).map((k) => (
              <Item key={k.id} title={k.text} lines={4} sub={`${k.title ?? 'A book'}${k.page ? `, page ${k.page}` : ''}, ${when(k.day)}`}
                action={(
                  <IconButton label={`Say it in a minute: ${k.text}`} size={40} onPress={() => nav.take(sayTakeaway(k.id, k.text, k.title ?? 'your book'))}>
                    <Icon name="mic" size={18} color={a.color} />
                  </IconButton>
                )} />
            ))}
          </Group>
        ) : (
          <Group pad>
            <Text style={t.footnote}>After a sitting, one line on what stuck lands here. Recall questions are made from your notes, two days later.</Text>
          </Group>
        )}
      </Block>

      {/* Add a book sits on Also reading when there is one, else here (with nothing on the go, it is the first card) */}
      {v.next.length || v.paused.length || (lead && !also.length)
        ? <NextUp books={[...v.paused, ...v.next]} onEdit={setEditing} onAdd={lead && !also.length ? () => setAdding(true) : undefined} /> : null}
      {v.done.length ? <FinishedShelf books={v.done} onEdit={setEditing} /> : null}

      <AddBookSheet open={adding} onClose={() => setAdding(false)} hasReading={!!v.reading.length} />
      <NoteSheet open={note} onClose={() => setNote(false)} books={[...v.reading, ...v.done.slice(0, 3)]} />
      <BookSheet book={editing} onClose={() => setEditing(null)} />
    </>
  );
}

/**
 * The book in hand: cover, where he is and how far through, then the sitting. Pages read log in one tap (+5 to +30,
 * or to the end), timed by the PC at his own pages a minute, with Undo; the timer and the exact page are there too.
 */
function NowReading({ book: b, onEdit }: { book: Book & { pace: Pace }; onEdit: () => void }) {
  const a = useAspect();
  const nav = useNav();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try { await fn(); if (done) a.notice(done); } catch (e) { a.notice((e as Error).message); } finally { setBusy(null); }
  };
  const left = b.pages ? Math.max(0, b.pages - b.page) : null;
  const pct = b.pages ? Math.min(100, Math.round((b.page / b.pages) * 100)) : null;
  const steps = [5, 10, 20, 30].filter((n) => left == null || n < left);
  const toEnd = left != null && left > 0 && left <= 30;
  /** n more pages (or the rest) as a sitting. The PC times it from his own pace and finishes the book at the end. */
  const log = (n: number | 'end') => run(`log${n}`, async () => {
    const was = b.page;
    const to = n === 'end' ? b.pages ?? was : Math.min(b.pages ?? Infinity, was + n);
    if (to <= was) return;
    const r = await call<{ session?: { id: string } }>('/mod/mind/read/sitting', { book: b.id, to_page: to });
    invalidate('/mod/mind/');
    void collection('mind', 'sessions').refresh();
    haptic.success();
    const sid = r.session?.id;
    undoable(n === 'end' ? `Finished ${b.title}` : `Page ${to}, ${to - was} pages`, async () => {
      try {
        if (sid) await collection('mind', 'sessions').remove(sid);
        await call('/mod/mind/read/edit', { book: b.id, page: was, status: 'reading' });
        invalidate('/mod/mind/');
      } catch (e) { a.notice((e as Error).message); }
    });
  });
  return (
    <Lead>
      <Press label={`${b.title}: pages, on hold, finished or remove`} onPress={onEdit} scale={0.98} feel="tick" style={s.bookHead}>
        <Cover book={b} w={72} />
        <View style={s.bookText}>
          <Text style={[t.footnote, { color: a.color }]}>{b.sitting_since ? 'Reading now' : 'Reading'}</Text>
          <Text style={t.title3} numberOfLines={3}>{b.title}</Text>
          {b.author ? <Text style={t.footnote} numberOfLines={1}>{b.author}</Text> : null}
        </View>
      </Press>
      <View style={s.gap8}>
        <View style={s.between}>
          <Text style={[t.headline, t.num]}>{b.pages ? `Page ${b.page} of ${b.pages}` : `Page ${b.page}`}</Text>
          {pct != null ? <Text style={[t.subhead, t.num, { color: a.color }]}>{`${pct}%`}</Text> : null}
        </View>
        {b.pages ? <Bar progress={b.page / b.pages} height={6} color={a.color} />
          : <Press label="Add the page count" onPress={onEdit} feel="tick"><Text style={[t.footnote, { color: a.color }]}>Add the page count for a finish date</Text></Press>}
      </View>
      {b.sitting_since ? (
        <>
          <View style={s.liveRow}>
            <View style={[s.liveDot, { backgroundColor: a.color }]} />
            <Text style={[t.subhead, { color: a.color }]}>Timer running</Text>
            <Elapsed since={b.sitting_since} style={s.liveTime} />
          </View>
          <View style={s.buttons}>
            <Button label="Done reading" kind="accent" onPress={() => nav.logSitting(b.id)} wrap={s.flex} />
            <Button label="Cancel" kind="quiet" busy={busy === 'cancel'}
              onPress={() => { void run('cancel', async () => { await call('/mod/mind/read/cancel', { book: b.id }); invalidate('/mod/mind/'); }, 'Timer stopped, nothing logged'); }} />
          </View>
        </>
      ) : (
        <>
          {steps.length || toEnd ? (
            <View style={s.gap8}>
              <Text style={t.footnote}>Read some? Log the pages in one tap.</Text>
              <View style={s.steps}>
                {steps.map((n) => <Step key={n} text={`+${n}`} label={`Log ${n} pages read`} busy={busy === `log${n}`} off={!!busy} onPress={() => { void log(n); }} />)}
                {toEnd ? <Step text="To the end" label={`Log the last ${left} pages and finish the book`} busy={busy === 'logend'} off={!!busy} wide onPress={() => { void log('end'); }} /> : null}
              </View>
            </View>
          ) : null}
          <View style={s.buttons}>
            <Button label="Start reading" kind="accent" busy={busy === 'start'} wrap={s.flex}
              icon={<Icon name="clock" size={18} color="#14161C" />}
              onPress={() => { haptic.medium(); void run('start', () => startReading(b.id)); }} />
            <Button label="Exact page" kind="quiet" onPress={() => nav.logSitting(b.id)} />
          </View>
        </>
      )}
    </Lead>
  );
}

/** One step of the page log: "+10" on a soft capsule, a spinner while it saves. */
function Step({ text, label, busy, off, wide, onPress }: { text: string; label: string; busy: boolean; off: boolean; wide?: boolean; onPress: () => void }) {
  const a = useAspect();
  return (
    <Press label={label} onPress={onPress} disabled={off} feel="tick" wrap={wide ? s.stepWide : s.flex} style={[s.step, { backgroundColor: tint(a.color, 0.16) }]}>
      {busy ? <ActivityIndicator color={a.color} /> : <Text numberOfLines={1} style={[t.headline, t.num, { color: a.color }]}>{text}</Text>}
    </Press>
  );
}

type ReadSession = Doc & { kind?: string; date?: string | null };

/** His reading week: pages left, pages a day and the finish date for the book in hand, and the last seven days read. */
function ReadingWeek({ book: b }: { book: Book & { pace: Pace } }) {
  const a = useAspect();
  const sessions = useCollection<ReadSession>('mind', 'sessions');
  const today = myDay();
  const week = lastDays(7, today);
  const read = new Set((sessions.items ?? []).filter((x) => x.kind === 'reading' && x.date && x.date >= week[0]).map((x) => x.date as string));
  const n = week.filter((d) => read.has(d)).length;
  const left = b.pages ? Math.max(0, b.pages - b.page) : null;
  const why = !b.pace.finish && b.pace.why ? b.pace.why : null;
  return (
    <Group pad>
      <Metrics>
        <Metric value={left != null ? String(left) : 'Not set'} label="Pages left" size="s" />
        <Metric value={b.pace.ppd ? String(Math.max(1, Math.round(b.pace.ppd))) : 'Not yet'} label="Pages a day" size="s" />
        <Metric value={b.pace.finish ? shortDay(b.pace.finish) : 'Not yet'} label="Done around" size="s" />
      </Metrics>
      {why ? <Text style={t.footnote}>{why}</Text> : null}
      <View style={s.gap8}>
        <WeekStrip size={32} color={a.color} days={week.map((d) => ({
          day: d, today: d === today, mark: read.has(d) ? 'done' : 'none',
          label: `${dayLabel(d, today)}, ${read.has(d) ? 'read' : d === today ? 'not yet' : 'no reading'}`,
        }))} />
        {sessions.items ? <Text style={[t.footnote, t.num]}>{n ? `Read on ${n === 1 ? 'one day' : `${n} days`} of the last seven.` : 'No reading in the last seven days.'}</Text> : null}
      </View>
    </Group>
  );
}

function NextUp({ books, onEdit, onAdd }: { books: Book[]; onEdit: (b: Book) => void; onAdd?: () => void }) {
  const a = useAspect();
  const [busy, setBusy] = useState<string | null>(null);
  const start = async (b: Book) => {
    setBusy(b.id);
    try {
      await call('/mod/mind/read/edit', { book: b.id, status: 'reading' });
      invalidate('/mod/mind/');
      haptic.medium();
      undoable(`${b.title} is on the go`, async () => {
        try { await call('/mod/mind/read/edit', { book: b.id, status: b.status }); invalidate('/mod/mind/'); } catch (e) { a.notice((e as Error).message); }
      });
    } catch (e) { a.notice((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <Block title="Next up" action={onAdd ? 'Add a book' : undefined} onAction={onAdd}>
      {books.length ? (
        <Group inset={64}>
          {books.slice(0, 6).map((b) => (
            <Item key={b.id} title={b.title} sub={b.status === 'paused' ? `On hold at page ${b.page}` : b.author} onPress={() => onEdit(b)}
              label={`${b.title}: pages, start or remove`} left={<Cover book={b} w={32} />}
              action={<Button label={b.status === 'paused' ? 'Pick up' : 'Start'} kind="quiet" small busy={busy === b.id} onPress={() => { void start(b); }} />} />
          ))}
        </Group>
      ) : (
        <Group pad>
          <Text style={t.footnote}>Nothing lined up. Add the next book you want to read, so it is here when this one ends.</Text>
        </Group>
      )}
    </Block>
  );
}

function FinishedShelf({ books, onEdit }: { books: Book[]; onEdit: (b: Book) => void }) {
  return (
    <Block title="Finished" sub={books.length > 1 ? `${books.length} books` : null}>
      <Group inset={72}>
        {books.slice(0, 6).map((b) => <Finished key={b.id} book={b} onOpen={() => onEdit(b)} />)}
      </Group>
    </Block>
  );
}

/** "Sum it up from my lines": his own takeaways put together into a short summary (on the PC). */
function useSummary(id: string) {
  const a = useAspect();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { await call('/mod/mind/read/summary', { book: id }); invalidate(READ); return true; }
    catch (e) { a.notice((e as Error).message); return false; } finally { setBusy(false); }
  };
  return { run, busy };
}

function Finished({ book, onOpen }: { book: Book; onOpen: () => void }) {
  const sum = useSummary(book.id);
  return (
    <View style={s.finished}>
      <Press label={`${book.title}: remove`} onPress={onOpen} feel="tick"><Cover book={book} w={40} /></Press>
      <View style={[s.flex, s.gap8]}>
        <Press label={`${book.title}: remove`} onPress={onOpen} feel="tick" scale={0.99} style={s.gap2}>
          <Text style={t.callout} numberOfLines={2}>{book.title}</Text>
          <Text style={t.footnote}>{book.finished ? `Finished ${shortDay(book.finished)}` : 'Finished'}</Text>
        </Press>
        {book.summary ? <Text style={t.subhead} selectable>{book.summary.text}</Text>
          : book.takeaways >= 2 ? <Button label="Sum it up from my lines" kind="soft" small onPress={() => { void sum.run(); }} busy={sum.busy} wrap={s.start} /> : null}
      </View>
    </View>
  );
}

/** A line on what stuck from a book, without a sitting. A recall question is made from it, as after a sitting. */
function NoteSheet({ open, onClose, books }: { open: boolean; onClose: () => void; books: Book[] }) {
  const a = useAspect();
  const [book, setBook] = useState<string | null>(books[0]?.id ?? null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [was, setWas] = useState(open);
  if (was !== open) { setWas(open); if (open) { setBook(books[0]?.id ?? null); setText(''); } }
  const b = books.find((x) => x.id === book) ?? null;
  const save = async () => {
    if (!b || !text.trim()) return;
    setSaving(true);
    try {
      const h = await collection<Doc & { book: string; kind: string; text: string }>('mind', 'highlights')
        .put({ book: b.id, kind: 'takeaway', text: text.trim().slice(0, 500), page: b.page || null, day: myDay() } as never);
      // the question is made on the PC a moment later; if that can't run now, the line is still saved
      void call('/mod/mind/recall/prepare', { takeaway: h.id }).catch(() => {});
      invalidate('/mod/mind/');
      haptic.success();
      onClose();
      undoable('Line saved', async () => {
        try { await collection('mind', 'highlights').remove(h.id); invalidate('/mod/mind/'); } catch (e) { a.notice((e as Error).message); }
      });
    } catch (e) { a.notice((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add a line">
      {books.length > 1 ? (
        <View style={s.chips}>{books.map((x) => <Chip key={x.id} label={x.title} selected={x.id === book} onPress={() => setBook(x.id)} />)}</View>
      ) : b ? <Text style={t.subhead}>{b.title}</Text> : null}
      <View style={s.lineRow}>
        <View style={s.flex}>
          <Field label="What stuck?" value={text} onChangeText={setText} placeholder="One line, in your words" maxLength={500} multiline autoFocus={open} />
        </View>
        <View style={s.dictate}><Dictate what="what stuck" onText={(x) => setText((cur) => (cur ? `${cur} ${x}` : x))} /></View>
      </View>
      <Text style={t.footnote}>A question made from it comes back in two days.</Text>
      <Button label="Save" kind="accent" onPress={() => { void save(); }} busy={saving} disabled={!b || !text.trim()} />
    </Sheet>
  );
}

/**
 * One book's sheet: the page count (so a finish date and "The end" can show), on hold, finished, remove. Each change
 * but the page count happens at once and offers Undo. After Finished it offers the summary when there are 2+ lines.
 */
function BookSheet({ book, onClose }: { book: Book | null; onClose: () => void }) {
  const a = useAspect();
  const b = useLast(book);
  const [keys, setKeys] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [prev, setPrev] = useState(book);
  if (prev !== book) { setPrev(book); if (book) setFinished(false); }
  const sum = useSummary(b?.id ?? '');
  if (!b) return <Sheet open={false} onClose={onClose}><View /></Sheet>;
  const send = async (key: string, path: string, body: object) => {
    setBusy(key);
    try { await call(path, { book: b.id, ...body }); invalidate('/mod/mind/'); return true; }
    catch (e) { a.notice((e as Error).message); return false; } finally { setBusy(null); }
  };
  const back = (body: object, path = '/mod/mind/read/edit') => async () => {
    try { await call(path, { book: b.id, ...body }); invalidate('/mod/mind/'); }
    catch (e) { a.notice((e as Error).message); }
  };
  const was = b.status === 'done' ? 'reading' : b.status;
  const savePages = async (n: number | null) => {
    setKeys(false);
    if (!n || n === b.pages) return;
    if (await send('pages', '/mod/mind/read/edit', { pages: n })) { haptic.success(); a.notice(`${n} pages`); }
  };
  const finish = async () => {
    if (!(await send('finish', '/mod/mind/read/finish', {}))) return;
    haptic.success();
    undoable(`Finished ${b.title}`, back({ status: was, page: b.page }));
    if (b.takeaways >= 2 && !b.summary) setFinished(true); else onClose();
  };
  const hold = async () => {
    if (!(await send('hold', '/mod/mind/read/edit', { status: 'paused' }))) return;
    undoable(`${b.title} on hold`, back({ status: b.status }));
    onClose();
  };
  const start = async () => {
    if (!(await send('start', '/mod/mind/read/edit', { status: 'reading' }))) return;
    haptic.medium();
    undoable(`${b.title} is on the go`, back({ status: b.status }));
    onClose();
  };
  const remove = async () => {
    if (!(await send('remove', '/mod/mind/read/remove', {}))) return;
    undoable(`Removed ${b.title}`, back({}, '/mod/mind/read/restore'));
    onClose();
  };

  return (
    <Sheet open={!!book} onClose={onClose} title={finished ? 'Finished' : b.title}>
      {finished ? (
        <>
          <Text style={t.subhead}>{`${b.title} is on your finished shelf. Your ${b.takeaways} lines can become your own short summary of it.`}</Text>
          <Button label="Sum it up from my lines" kind="accent" busy={sum.busy} onPress={() => { void sum.run().then((ok) => { if (ok) onClose(); }); }} />
          <Button label="Not now" kind="quiet" onPress={onClose} />
        </>
      ) : (
        <>
          <View style={s.sheetHead}>
            <Cover book={b} w={48} />
            <View style={[s.flex, s.gap2]}>
              {b.author ? <Text style={t.subhead}>{b.author}</Text> : null}
              <Text style={[t.footnote, t.num]}>{b.status === 'done' ? (b.finished ? `Finished ${shortDay(b.finished)}` : 'Finished') : b.pages ? `Page ${b.page} of ${b.pages}` : `Page ${b.page}`}</Text>
            </View>
          </View>
          {b.status !== 'done' ? (
            <Group>
              <Item title="Pages in the book" value={b.pages ? String(b.pages) : 'Not set'} chevron onPress={() => setKeys(true)} label="Set the pages in the book" />
            </Group>
          ) : null}
          {b.status === 'reading' ? (
            <View style={s.buttons}>
              <Button label="Finished" kind="accent" onPress={finish} busy={busy === 'finish'} icon={<Icon name="check" size={18} color="#14161C" />} wrap={s.flex} />
              <Button label="Put on hold" kind="quiet" onPress={hold} busy={busy === 'hold'} />
            </View>
          ) : b.status !== 'done' ? (
            <View style={s.buttons}>
              <Button label={b.status === 'paused' ? 'Pick it up' : 'Start reading'} kind="accent" onPress={start} busy={busy === 'start'} wrap={s.flex} />
              <Button label="Finished" kind="quiet" onPress={finish} busy={busy === 'finish'} />
            </View>
          ) : null}
          <Button label="Remove from my books" kind="danger" small onPress={remove} busy={busy === 'remove'}
            icon={<Sym name="trash" size={16} color={C.danger} />} wrap={s.start} />
          <Keypad open={keys} onClose={() => setKeys(false)} title="Pages in the book" sub="From the last numbered page. A finish date shows once it is set."
            fields={[{ key: 'pages', label: 'Pages', unit: 'pages', value: b.pages, step: 10, min: 1, max: 5000 }]}
            onDone={(v) => { void savePages(v.pages); }} />
        </>
      )}
    </Sheet>
  );
}

/** Find a book by title and add it in one tap, or add the title as typed. */
function AddBookSheet({ open, onClose, hasReading }: { open: boolean; onClose: () => void; hasReading: boolean }) {
  const a = useAspect();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [as, setAs] = useState<'reading' | 'next'>(hasReading ? 'next' : 'reading');
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => { const id = setTimeout(() => setDebounced(q.trim()), 400); return () => clearTimeout(id); }, [q]);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (open) { setQ(''); setDebounced(''); setAs(hasReading ? 'next' : 'reading'); } }
  const g = useGet<{ items: Found[]; error?: string }>(open && debounced.length >= 2 ? `/mod/mind/book-search?q=${encodeURIComponent(debounced)}` : null);
  const results = debounced.length >= 2 ? g.data?.items ?? null : null;
  const searchError = g.error ?? g.data?.error ?? null;
  const add = async (key: string, b: Partial<Found> & { title: string }) => {
    setSaving(key);
    try {
      const r = await call<{ book: Book; already: boolean }>('/mod/mind/read/add', { ...b, status: as });
      invalidate('/mod/mind/');
      haptic.medium();
      a.notice(r.already ? `${r.book.title} was already on your shelf` : `Added ${r.book.title}`);
      onClose();
    } catch (e) { a.notice((e as Error).message); } finally { setSaving(null); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add a book">
      <Field value={q} onChangeText={setQ} placeholder="Title or author" autoFocus={open} label="Find it" />
      <View style={s.chips}>
        <Chip label="Reading now" selected={as === 'reading'} onPress={() => setAs('reading')} />
        <Chip label="Next up" selected={as === 'next'} onPress={() => setAs('next')} />
      </View>
      {q.trim().length >= 2 ? (
        <Group>
          <Item title={`Add “${q.trim()}” as typed`} sub="Add the page count later for a finish date" onPress={() => { void add('typed', { title: q.trim() }); }}
            right={saving === 'typed' ? <Text style={t.footnote}>Adding</Text> : <Icon name="plus" size={18} color={a.color} />} />
        </Group>
      ) : <Text style={t.footnote}>Type two letters or more to search.</Text>}
      {results == null ? (debounced.length >= 2 && !searchError ? <View style={s.gap8}><Skeleton height={56} /><Skeleton height={56} /></View> : null)
        : results.length ? (
          <Group inset={64}>
            {results.slice(0, 8).map((r, i) => (
              <Item key={`${r.title}${i}`} title={r.title} left={<Cover book={r} w={32} />}
                sub={[r.author, r.pages ? `${r.pages} pages` : null, r.year ? String(r.year) : null].filter(Boolean).join(', ')}
                onPress={() => { void add(`r${i}`, { title: r.title, author: r.author, pages: r.pages, cover: r.cover, isbn: r.isbn }); }}
                right={saving === `r${i}` ? <Text style={t.footnote}>Adding</Text> : undefined} />
            ))}
          </Group>
        ) : searchError ? null : <Text style={t.footnote}>No matches online. Add it as typed above.</Text>}
      {searchError && debounced.length >= 2 ? <Text style={t.footnote}>{`${searchError} Add it as typed above.`}</Text> : null}
    </Sheet>
  );
}

/**
 * End of a sitting: where he stopped, how long, and one line on what stuck. Both numbers start from a good guess (the
 * timer, his usual pages), so Save is often the second tap. Big keys for an exact number. With a line, offer to say it.
 */
export function SittingSheet({ bookId, onClose, onSay }: { bookId: string | null; onClose: () => void; onSay: (spec: TakeSpec) => void }) {
  const a = useAspect();
  const g = useGet<ReadView>(bookId ? READ : null);
  const found = bookId ? g.data?.reading.find((x) => x.id === bookId) ?? [...(g.data?.paused ?? []), ...(g.data?.next ?? [])].find((x) => x.id === bookId) ?? null : null;
  const b = useLast(found);
  const [typed, setMinutes] = useState<number | null>(null);   // null: the timer's count, else 20
  const [page, setPage] = useState(0);
  const [line, setLine] = useState('');
  const [keys, setKeys] = useState<'page' | 'minutes' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id: string; text: string } | null>(null);
  const [prev, setPrev] = useState<string | null>(null);
  const key = bookId && found ? found.id : null;
  if (prev !== key) {
    setPrev(key);
    if (found) {
      const ppd = 'pace' in found ? (found as Book & { pace: Pace }).pace.ppd : 0;
      setMinutes(null); setLine(''); setSaved(null);
      setPage(Math.min(found.pages ?? Infinity, found.page + Math.max(5, Math.round(ppd || 10))));
    }
  }
  const timed = !!found?.sitting_since;
  const now = useNow(15000, !!bookId && timed && typed == null);
  const minutes = typed ?? (found?.sitting_since ? Math.max(1, Math.round((now - Date.parse(found.sitting_since)) / 60000)) : 20);
  const max = b?.pages ?? 5000;
  const save = async () => {
    if (!b) return;
    setSaving(true);
    const was = b.page;
    try {
      // left on the timer, the PC counts the minutes to the second it saves
      const r = await call<{ takeaway: { id: string; text: string } | null; session?: { id: string } }>('/mod/mind/read/sitting', { book: b.id, minutes: typed == null && timed ? undefined : minutes, to_page: page, takeaway: line.trim() || undefined });
      invalidate('/mod/mind/');
      haptic.success();
      if (r.takeaway) { setSaved(r.takeaway); return; }
      onClose();
      const sid = r.session?.id;
      undoable(`Page ${page}, ${minutes} min saved`, async () => {
        try {
          if (sid) await collection('mind', 'sessions').remove(sid);
          await call('/mod/mind/read/edit', { book: b.id, page: was });
          invalidate('/mod/mind/');
        } catch (e) { a.notice((e as Error).message); }
      });
    } catch (e) { a.notice((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Sheet open={!!bookId} onClose={onClose} title={saved ? 'Saved' : b?.title ?? 'Reading'}>
      {!b ? (bookId && g.error ? <Failed message={g.error} onRetry={g.refresh} /> : <Skeleton height={220} radius={22} />) : saved ? (
        <>
          <Text style={[t.subhead, t.num]}>{`Page ${page}${b.pages ? ` of ${b.pages}` : ''}, ${minutes} min. A recall question made from your line comes back in two days.`}</Text>
          <View style={[s.quote, { borderLeftColor: a.color }]}><Text style={[t.callout, s.quoteText]} selectable>{saved.text}</Text></View>
          <Button label="Say it in a minute" kind="accent" icon={<Icon name="mic" size={18} color="#14161C" />} onPress={() => onSay(sayTakeaway(saved.id, saved.text, b.title))} />
          <Button label="Done" kind="quiet" onPress={onClose} />
        </>
      ) : (
        <>
          <View style={s.tiles}>
            <Press label={`Stopped at page ${page}. Change`} onPress={() => setKeys('page')} feel="tick" wrap={s.flex} style={[s.tile, { borderColor: tint(a.color, 0.4) }]}>
              <Text style={[t.footnote, { color: a.color }]}>Stopped at page</Text>
              <Text style={[t.large, t.num]}>{page}</Text>
              <Text style={[t.micro, t.num]}>{b.pages ? `of ${b.pages}` : `was ${b.page}`}</Text>
            </Press>
            <Press label={`${minutes} minutes. Change`} onPress={() => setKeys('minutes')} feel="tick" wrap={s.flex} style={s.tile}>
              <Text style={t.footnote}>{timed ? 'Minutes, timed' : 'Minutes'}</Text>
              <Text style={[t.large, t.num]}>{minutes}</Text>
              <Text style={t.micro}>min</Text>
            </Press>
          </View>
          <View style={s.chips}>
            {[5, 10, 20].map((n) => <Chip key={n} label={`${n} more pages`} onPress={() => setPage((p) => Math.min(max, p + n))} />)}
            {b.pages ? <Chip label="The end" onPress={() => setPage(b.pages!)} /> : null}
          </View>
          <View style={s.lineRow}>
            <View style={s.flex}>
              <Field label="What stuck? Optional" value={line} onChangeText={setLine} placeholder="One line, in your words" maxLength={500} multiline />
            </View>
            <View style={s.dictate}><Dictate what="what stuck" onText={(x) => setLine((cur) => (cur ? `${cur} ${x}` : x))} /></View>
          </View>
          <Button label="Save" kind="accent" onPress={() => { void save(); }} busy={saving} />
          <Keypad open={keys === 'page'} onClose={() => setKeys(null)} title="Stopped at page" sub={b.pages ? `The book has ${b.pages} pages.` : `You were on page ${b.page}.`}
            fields={[{ key: 'page', label: 'Page', value: page, step: 1, min: 0, max }]}
            presets={[10, 20, 30].map((n) => ({ label: `${n} more`, values: { page: Math.min(max, b.page + n) } }))}
            onDone={(v) => { if (v.page != null) setPage(Math.min(max, Math.round(v.page))); setKeys(null); }} done="Done" />
          <Keypad open={keys === 'minutes'} onClose={() => setKeys(null)} title="Minutes read"
            fields={[{ key: 'm', label: 'Minutes', unit: 'min', value: minutes, step: 5, min: 1, max: 600 }]}
            presets={[10, 20, 30, 45].map((n) => ({ label: `${n} min`, values: { m: n } }))}
            onDone={(v) => { if (v.m != null) setMinutes(Math.max(1, Math.round(v.m))); setKeys(null); }} done="Done" />
        </>
      )}
    </Sheet>
  );
}

function ReadSkeleton() {
  return (
    <View style={s.gap16}>
      <Skeleton height={232} radius={22} />
      <Skeleton height={72} radius={22} />
      <Skeleton height={160} radius={22} />
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  start: { alignSelf: 'flex-start' },
  gap2: { gap: 2 },
  gap8: { gap: 8 },
  gap16: { gap: 16 },
  buttons: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  steps: { flexDirection: 'row', gap: 8 },
  step: { height: 44, borderRadius: 22, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  stepWide: { flex: 2, minWidth: 0 },
  cover: { backgroundColor: SURF.raised, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  bookHead: { flexDirection: 'row', gap: 16 },
  bookText: { flex: 1, gap: 6 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveTime: { marginLeft: 'auto' },
  disc: { width: 36, height: 36, borderRadius: 18, backgroundColor: SURF.raised, alignItems: 'center', justifyContent: 'center' },
  finished: { flexDirection: 'row', gap: 16, padding: 16 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lineRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  dictate: { paddingBottom: 6 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { padding: 16, gap: 2, borderRadius: 18, borderCurve: 'continuous', backgroundColor: SURF.raised, borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.hair },
  quote: { borderLeftWidth: 2, paddingLeft: 12 },
  quoteText: { color: C.text },
});
