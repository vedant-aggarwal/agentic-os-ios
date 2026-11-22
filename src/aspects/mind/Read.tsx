import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Bar, Button, Card, Chip, Empty, Failed, Field, Icon, IconButton, Row, Screen, Section, Sheet, Skeleton, Stepper, SURF,
  dayLabel, haptic, shortDay, t, timer, useAspect,
} from '@/aspects/kit';
import { call, invalidate, useGet } from '@/lib/mod';
import { C } from '@/theme';
import { Dictate } from './Dictate';
import type { Book, Found, Pace, ReadView, TakeSpec } from './types';
import { Sym, useLast, useNow } from './ui';

export const READ = '/mod/mind/read';
const sayTakeaway = (id: string, text: string, title: string): TakeSpec =>
  ({ kind: 'learned', topic: `Say more about what stuck from ${title}.`, label: 'Say what you learned', source: { kind: 'takeaway', id, title } });

/** A book's cover over a plain block with its first letter. */
export function Cover({ book, w = 56 }: { book: { title: string; cover: string | null }; w?: number }) {
  const h = Math.round(w * 1.5);
  // the first letter sits under the picture, so a cover that is slow or missing still shows something
  return (
    <View style={[s.cover, s.coverBlank, { width: w, height: h }]}>
      <Text style={[t.heading, { color: C.muted }]}>{book.title.slice(0, 1).toUpperCase()}</Text>
      {book.cover ? <Image source={{ uri: book.cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessibilityIgnoresInvertColors /> : null}
    </View>
  );
}

/** Pace in one line, honest about what it doesn't know yet. */
function paceLine(p: Pace) {
  if (p.finish) return `About ${Math.max(1, Math.round(p.ppd))} pages a day, done around ${shortDay(p.finish)}`;
  return p.why ?? '';
}

export function ReadScreen({ open, onClose, onRecall, onSay }: {
  open: boolean; onClose: () => void; onRecall: () => void; onSay: (spec: TakeSpec) => void;
}) {
  const a = useAspect();
  const g = useGet<ReadView>(open ? READ : null);
  const v = g.data;
  const [adding, setAdding] = useState(false);
  const [sitting, setSitting] = useState<Sitting | null>(null);
  // minutes so far, read when he taps, for a timed sitting
  const end = (b: Book & { pace: Pace }) => setSitting({ ...b, timed: b.sitting_since ? Math.max(1, Math.round((Date.now() - Date.parse(b.sitting_since)) / 60000)) : null });
  const [busy, setBusy] = useState<string | null>(null);
  const live = v?.reading.some((b) => b.sitting_since);
  const now = useNow(1000, open && !!live);

  const act = async (key: string, path: string, body: object, done?: string) => {
    setBusy(key);
    try { await call(path, body); invalidate('/mod/mind/'); if (done) a.notice(done); }
    catch (e) { a.notice((e as Error).message); } finally { setBusy(null); }
  };

  let body;
  if (!v) body = g.error ? <Failed message={g.error} onRetry={g.refresh} /> : <ReadSkeleton />;
  else if (v.total === 0) {
    body = <Empty title="No books yet" body="Add the book you're reading. After that, a sitting takes two taps." action="Add a book" onAction={() => setAdding(true)} icon={<Sym name="book" size={28} color={C.muted} />} />;
  } else {
    body = (
      <>
        {v.reading.length ? v.reading.map((b) => {
          const since = b.sitting_since ? Math.max(0, (now - Date.parse(b.sitting_since)) / 1000) : null;
          return (
            <Card key={b.id}>
              <View style={s.gap16}>
                <View style={s.bookHead}>
                  <Cover book={b} w={64} />
                  <View style={s.bookText}>
                    <Text style={t.heading} numberOfLines={3}>{b.title}</Text>
                    {b.author ? <Text style={t.small} numberOfLines={1}>{b.author}</Text> : null}
                    <View style={s.gap8}>
                      <Text style={[t.label, t.num]}>{b.pages ? `Page ${b.page} of ${b.pages}` : `Page ${b.page}`}</Text>
                      {b.pages ? <Bar progress={b.page / b.pages} height={6} /> : null}
                    </View>
                  </View>
                </View>
                {paceLine(b.pace) ? <Text style={[t.small, t.num]}>{paceLine(b.pace)}</Text> : null}
                {since != null ? (
                  <View style={s.gap12}>
                    <View style={s.liveRow}>
                      <View style={[s.liveDot, { backgroundColor: a.color }]} />
                      <Text style={[t.strong, t.num]} accessibilityLabel={`Reading for ${Math.floor(since / 60)} minutes`}>{`Reading for ${timer(since)}`}</Text>
                    </View>
                    <View style={s.buttons}>
                      <Button label="Done reading" kind="accent" onPress={() => end(b)} wrap={s.flex} />
                      <Button label="Cancel" kind="quiet" onPress={() => act(`c${b.id}`, '/mod/mind/read/cancel', { book: b.id }, 'Timer stopped, nothing logged')} busy={busy === `c${b.id}`} />
                    </View>
                  </View>
                ) : (
                  <View style={s.buttons}>
                    <Button label="Start reading" kind="accent" onPress={() => { haptic.medium(); void act(`s${b.id}`, '/mod/mind/read/start', { book: b.id }); }}
                      busy={busy === `s${b.id}`} icon={<Icon name="clock" size={18} color="#14161C" />} wrap={s.flex} />
                    <Button label="Log pages" kind="quiet" onPress={() => end(b)} />
                  </View>
                )}
              </View>
            </Card>
          );
        }) : (
          <Card>
            <View style={s.gap12}>
              <Text style={t.lead}>Nothing on the go</Text>
              <Text style={t.small}>Pick one from next up below, or add the one in your hands.</Text>
              <Button label="Add a book" kind="soft" small onPress={() => setAdding(true)} wrap={s.start} />
            </View>
          </Card>
        )}

        {v.recall.due.length ? (
          <Card tone={a.color} onPress={onRecall} label={`${v.recall.due.length} recall questions due. Start`}>
            <View style={s.recall}>
              <View style={s.flex}>
                <Text style={t.strong}>{v.recall.due.length === 1 ? 'One question to bring back' : `${v.recall.due.length} questions to bring back`}</Text>
                <Text style={t.small}>Made from your own takeaways. A minute or two.</Text>
              </View>
              <Icon name="right" size={18} color={a.color} />
            </View>
          </Card>
        ) : v.recall.total ? (
          <Text style={t.small}>{v.recall.next ? `Next recall question ${dayLabel(v.recall.next).toLowerCase()}.` : 'No recall questions waiting.'}</Text>
        ) : null}

        <Section title="What stuck">
          {v.takeaways.length ? (
            <View>
              {v.takeaways.slice(0, 5).map((k) => (
                <Row key={k.id} title={k.text} sub={`${k.title ?? 'A book'}${k.page ? `, page ${k.page}` : ''}`}
                  label={`${k.text}. Say it in a minute`} onPress={() => onSay(sayTakeaway(k.id, k.text, k.title ?? 'your book'))}
                  right={<Icon name="mic" size={18} color={a.color} />} />
              ))}
            </View>
          ) : <Text style={t.small}>After a sitting, one line on what stuck lands here. Recall questions are made from these.</Text>}
        </Section>

        {v.next.length || v.paused.length ? (
          <Section title="Next up">
            <View>
              {[...v.paused, ...v.next].slice(0, 6).map((b) => (
                <Row key={b.id} title={b.title} sub={b.status === 'paused' ? `On hold at page ${b.page}` : b.author}
                  left={<Cover book={b} w={32} />}
                  right={<Button label={b.status === 'paused' ? 'Pick up' : 'Start'} kind="quiet" small busy={busy === `n${b.id}`}
                    onPress={() => act(`n${b.id}`, '/mod/mind/read/add', { title: b.title, status: 'reading' }, `${b.title} is on the go`)} />} />
              ))}
            </View>
          </Section>
        ) : null}

        {v.done.length ? (
          <Section title="Finished">
            <View style={s.gap16}>
              {v.done.slice(0, 6).map((b) => <Finished key={b.id} book={b} />)}
            </View>
          </Section>
        ) : null}

        <Button label="Add a book" kind="quiet" onPress={() => setAdding(true)} icon={<Icon name="plus" size={18} />} />
      </>
    );
  }

  return (
    <Screen open={open} onClose={onClose} title="Read"
      right={v && v.total ? <IconButton label="Add a book" size={36} onPress={() => setAdding(true)}><Icon name="plus" size={16} /></IconButton> : undefined}>
      {body}
      <AddBookSheet open={adding} onClose={() => setAdding(false)} hasReading={!!v?.reading.length} />
      <SittingSheet book={sitting} onClose={() => setSitting(null)} onSay={(spec) => { setSitting(null); onSay(spec); }} />
    </Screen>
  );
}

function Finished({ book }: { book: Book }) {
  const a = useAspect();
  const [busy, setBusy] = useState(false);
  const sum = async () => {
    setBusy(true);
    try { await call('/mod/mind/read/summary', { book: book.id }); invalidate(READ); } catch (e) { a.notice((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <View style={s.finished}>
      <Cover book={book} w={40} />
      <View style={[s.flex, s.gap8]}>
        <View>
          <Text style={t.strong} numberOfLines={2}>{book.title}</Text>
          <Text style={t.caption}>{book.finished ? `Finished ${shortDay(book.finished)}` : 'Finished'}</Text>
        </View>
        {book.summary ? <Text style={t.small} selectable>{book.summary.text}</Text>
          : book.takeaways >= 2 ? <Button label="Sum it up from my takeaways" kind="soft" small onPress={sum} busy={busy} wrap={s.start} /> : null}
      </View>
    </View>
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
        <Row title={`Add “${q.trim()}” as typed`} sub="Add the page count later for a finish date" onPress={() => add('typed', { title: q.trim() })}
          right={saving === 'typed' ? <Text style={t.label}>Adding</Text> : <Icon name="plus" size={18} color={a.color} />} />
      ) : <Text style={t.small}>Type two letters or more to search.</Text>}
      {results == null ? (debounced.length >= 2 && !searchError ? <View style={s.gap8}><Skeleton height={56} /><Skeleton height={56} /></View> : null)
        : results.length ? (
          <View>
            {results.slice(0, 8).map((r, i) => (
              <Row key={`${r.title}${i}`} title={r.title} left={<Cover book={r} w={32} />}
                sub={[r.author, r.pages ? `${r.pages} pages` : null, r.year ? String(r.year) : null].filter(Boolean).join(', ')}
                onPress={() => add(`r${i}`, { title: r.title, author: r.author, pages: r.pages, cover: r.cover, isbn: r.isbn })}
                right={saving === `r${i}` ? <Text style={t.label}>Adding</Text> : undefined} />
            ))}
          </View>
        ) : searchError ? null : <Text style={t.small}>No matches online. Add it as typed above.</Text>}
      {searchError && debounced.length >= 2 ? <Text style={t.small}>{`${searchError} Add it as typed above.`}</Text> : null}
    </Sheet>
  );
}

/** End of a sitting: where he stopped, how long, and one line on what stuck. Then, if he wrote one, say it. */
type Sitting = Book & { pace: Pace; timed: number | null };
function SittingSheet({ book, onClose, onSay }: { book: Sitting | null; onClose: () => void; onSay: (spec: TakeSpec) => void }) {
  const a = useAspect();
  const b = useLast(book);
  const timed = b?.timed ?? null;
  const [minutes, setMinutes] = useState(20);
  const [page, setPage] = useState(0);
  const [line, setLine] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id: string; text: string } | null>(null);
  const [prev, setPrev] = useState(book);
  if (prev !== book) {
    setPrev(book);
    if (book) {
      setMinutes(book.timed ?? 20); setLine(''); setSaved(null);
      setPage(Math.min(book.pages ?? Infinity, book.page + Math.max(5, Math.round(book.pace.ppd || 10))));
    }
  }
  if (!b) return <Sheet open={false} onClose={onClose}><View /></Sheet>;
  const max = b.pages ?? 5000;
  const save = async () => {
    setSaving(true);
    try {
      const r = await call<{ takeaway: { id: string; text: string } | null }>('/mod/mind/read/sitting', { book: b.id, minutes, to_page: page, takeaway: line.trim() || undefined });
      invalidate('/mod/mind/');
      haptic.success();
      if (r.takeaway) setSaved(r.takeaway); else { a.notice(`Saved. Page ${page}.`); onClose(); }
    } catch (e) { a.notice((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Sheet open={!!book} onClose={onClose} title={saved ? 'Saved' : b.title}>
      {saved ? (
        <>
          <Text style={t.body}>{`Page ${page}${b.pages ? ` of ${b.pages}` : ''}, ${minutes} min. A recall question made from your line comes back in two days.`}</Text>
          <Text style={[t.lead, s.quote, { borderLeftColor: a.color }]}>{saved.text}</Text>
          <Button label="Say it in a minute" kind="accent" icon={<Icon name="mic" size={18} color="#14161C" />} onPress={() => onSay(sayTakeaway(saved.id, saved.text, b.title))} />
          <Button label="Done" kind="quiet" onPress={onClose} />
        </>
      ) : (
        <>
          <View style={s.gap8}>
            <Text style={t.label}>Stopped at page</Text>
            <Stepper value={page} onChange={setPage} min={0} max={max} label="page" />
            <View style={s.chips}>
              {[5, 10, 20].map((n) => <Chip key={n} label={`${n} more`} onPress={() => setPage((p) => Math.min(max, p + n))} />)}
              {b.pages ? <Chip label="The end" onPress={() => setPage(b.pages!)} /> : null}
            </View>
          </View>
          <View style={s.gap8}>
            <Text style={t.label}>{timed ? 'Minutes, timed' : 'Minutes'}</Text>
            <Stepper value={minutes} onChange={setMinutes} min={1} max={600} step={5} label="minutes" format={(m) => `${m} min`} />
          </View>
          <View style={s.lineRow}>
            <View style={s.flex}>
              <Field label="What stuck?" value={line} onChangeText={setLine} placeholder="One line, in your words" maxLength={500} multiline />
            </View>
            <View style={s.dictate}><Dictate what="what stuck" onText={(x) => setLine((cur) => (cur ? `${cur} ${x}` : x))} /></View>
          </View>
          <Button label="Save" kind="primary" onPress={save} busy={saving} />
        </>
      )}
    </Sheet>
  );
}

function ReadSkeleton() {
  return (
    <View style={s.gap24}>
      <Skeleton height={232} radius={24} />
      <Skeleton height={20} width={110} />
      <Skeleton height={56} /><Skeleton height={56} />
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  start: { alignSelf: 'flex-start' },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  gap16: { gap: 16 },
  gap24: { gap: 24 },
  buttons: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cover: { borderRadius: 6, backgroundColor: SURF.card, overflow: 'hidden' },
  coverBlank: { alignItems: 'center', justifyContent: 'center' },
  bookHead: { flexDirection: 'row', gap: 16 },
  bookText: { flex: 1, gap: 8 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  recall: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  finished: { flexDirection: 'row', gap: 12 },
  lineRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  dictate: { paddingBottom: 6 },
  quote: { borderLeftWidth: 2, paddingLeft: 12 },
});
