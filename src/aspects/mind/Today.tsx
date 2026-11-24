import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  Bar, Block, Button, CheckRing, Failed, Group, Icon, Item, Lead, Metric, Metrics, Press, Skeleton, Spark, Tag, WeekStrip,
  dayLabel, haptic, num, t, tint, undoable, useAspect, type DayMark,
} from '@/aspects/kit';
import { call, invalidate, type Read } from '@/lib/mod';
import { C } from '@/theme';
import { Linked } from '@/aspects/_linked/Linked';
import { useOpenLink } from './Courses';
import { useNav } from './nav';
import { Cover, Elapsed, startReading } from './Read';
import { takeWord } from './Speak';
import type { HomeView, TakeSpec } from './types';
import { Sym, durWords, minutes as minWords } from './ui';

/**
 * Mind today: learn it, then say it. The lead is the next step of today's loop (the book in hand or the next lesson,
 * then saying what went in), the rest of today is one list of rows each doable from here, then the week and whether
 * the speaking is getting sharper.
 */
export function TodayTab({ read }: { read: Read<HomeView> }) {
  const { data: v, error, refresh } = read;
  if (!v) return error ? <Failed message={error} onRetry={() => { void refresh(); }} /> : <TodaySkeleton />;
  return (
    <>
      <LeadCard v={v} />
      <Rest v={v} />
      <Week v={v} />
      <Sharper v={v} />
      <Linked />
    </>
  );
}

function TodaySkeleton() {
  return (
    <View style={s.gap16}>
      <Skeleton height={248} radius={28} />
      <Skeleton height={120} radius={22} />
      <Skeleton height={180} radius={22} />
    </View>
  );
}

// What today's loop holds so far, and what the say half should ask.
function loopOf(v: HomeView, plain: boolean) {
  const { today } = v.learn;
  const learned = today.lessons > 0 || today.read > 0 || !!today.ticked;
  const last = v.say.today[0] ?? null;
  const said = !!last || !!v.say.ticked;
  const prompt = learned && v.say.learned && !plain ? v.say.learned : null;
  const topic = v.say.topic;
  const spec: TakeSpec = prompt
    ? { kind: 'learned', topic: prompt.text, label: 'Say what you learned', source: prompt.source }
    : { kind: 'impromptu', topic: topic.text, label: topic.label, topicId: topic.id, topicKind: topic.kind };
  return { learned, said, last, prompt, topic, spec };
}

/** Mark the next lesson done in one tap, with Undo. */
function useLessonDone() {
  const a = useAspect();
  return async (id: string, title: string) => {
    try {
      await call(`/mod/mind/lesson/${id}/done`, { made: null });
      invalidate('/mod/mind/');
      haptic.success();
      undoable(`${title} done`, async () => {
        try { await call(`/mod/mind/lesson/${id}/undo`); invalidate('/mod/mind/'); } catch (e) { a.notice((e as Error).message); }
      });
    } catch (e) { a.notice((e as Error).message); }
  };
}

/** The two halves of the loop, ticked as they happen. */
function LoopSteps({ learned, said }: { learned: boolean; said: boolean }) {
  const a = useAspect();
  const step = (on: boolean, label: string) => (
    <View style={s.step}>
      {on ? <CheckRing done size={18} color={a.color} /> : <View style={[s.stepDot, { borderColor: tint(a.color, 0.5) }]} />}
      <Text style={[t.footnote, on && { color: a.color }]}>{label}</Text>
    </View>
  );
  return (
    <View style={s.steps} accessibilityLabel={`Today: ${learned ? 'learned' : 'not learned yet'}, ${said ? 'said' : 'not said yet'}`}>
      {step(learned, learned ? 'Learned' : 'Learn')}
      <View style={[s.stepLine, { backgroundColor: learned ? tint(a.color, 0.5) : 'rgba(255,255,255,0.12)' }]} />
      {step(said, said ? 'Said' : 'Say')}
    </View>
  );
}

// ── the lead ──
function LeadCard({ v }: { v: HomeView }) {
  const a = useAspect();
  const nav = useNav();
  const open1 = useOpenLink();
  const lessonDone = useLessonDone();
  const [plain, setPlain] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const L = loopOf(v, plain);
  const { book, course } = v.learn;
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); } catch (e) { a.notice((e as Error).message); } finally { setBusy(null); }
  };

  // a sitting is running: the timer and Done reading
  if (book?.sitting_since) {
    return (
      <Lead>
        <LoopSteps learned={L.learned} said={L.said} />
        <View style={s.bookRow}>
          <Cover book={book} w={56} />
          <View style={[s.flex, s.gap2]}>
            <Text style={[t.footnote, { color: a.color }]}>Reading now</Text>
            <Text style={t.headline} numberOfLines={2}>{book.title}</Text>
            <Elapsed since={book.sitting_since} />
          </View>
        </View>
        <View style={s.buttons}>
          <Button label="Done reading" kind="accent" onPress={() => nav.logSitting(book.id)} wrap={s.flex} />
          <Button label="Cancel" kind="quiet" busy={busy === 'cancel'}
            onPress={() => { void run('cancel', async () => { await call('/mod/mind/read/cancel', { book: book.id }); invalidate('/mod/mind/'); a.notice('Timer stopped, nothing logged'); }); }} />
        </View>
      </Lead>
    );
  }

  // nothing went in yet today: the book in hand, else the next lesson
  if (!L.learned && book) {
    const idle = book.idle;
    return (
      <Lead>
        <LoopSteps learned={false} said={L.said} />
        <View style={s.bookRow}>
          <Cover book={book} w={72} />
          <View style={[s.flex, s.gap4]}>
            <Text style={[t.footnote, { color: a.color }]}>Continue reading</Text>
            <Text style={t.title3} numberOfLines={3}>{book.title}</Text>
            {book.author ? <Text style={t.footnote} numberOfLines={1}>{book.author}</Text> : null}
          </View>
        </View>
        <View style={s.gap8}>
          <View style={s.between}>
            <Text style={[t.subhead, t.num]}>{book.pages ? `Page ${book.page} of ${book.pages}` : `Page ${book.page}`}</Text>
            {idle != null && idle > 0 ? <Text style={[t.footnote, t.num]}>{idle === 1 ? 'Last read yesterday' : `Last read ${idle} days ago`}</Text> : null}
          </View>
          {book.pages ? <Bar progress={book.page / book.pages} height={6} color={a.color} /> : null}
        </View>
        <View style={s.buttons}>
          <Button label="Start reading" kind="accent" busy={busy === 'start'} wrap={s.flex} icon={<Icon name="clock" size={18} color="#14161C" />}
            onPress={() => { haptic.medium(); void run('start', () => startReading(book.id)); }} />
          <Button label="Log pages" kind="quiet" onPress={() => nav.logSitting(book.id)} />
        </View>
      </Lead>
    );
  }
  if (!L.learned && course?.next) {
    const n = course.next;
    return (
      <Lead>
        <LoopSteps learned={false} said={L.said} />
        <View style={s.gap4}>
          <Text style={[t.footnote, t.num, { color: a.color }]}>{`Lesson ${n.n} of ${course.lessons}${n.duration ? `, ${durWords(n.duration)}` : ''}`}</Text>
          <Text style={t.title3}>{n.title}</Text>
          <Text style={t.footnote}>{course.title}</Text>
        </View>
        <Bar progress={course.lessons ? course.done / course.lessons : 0} height={6} color={a.color} />
        <View style={s.buttons}>
          {n.url ? (
            <>
              <Button label="Open lesson" kind="accent" onPress={() => open1(n.url)} icon={<Sym name="open" size={16} color="#14161C" />} wrap={s.flex} />
              <Button label="Mark done" kind="quiet" onPress={() => { void lessonDone(n.id, n.title); }} />
            </>
          ) : <Button label="Mark done" kind="accent" onPress={() => { void lessonDone(n.id, n.title); }} icon={<Icon name="check" size={18} color="#14161C" />} wrap={s.flex} />}
        </View>
      </Lead>
    );
  }
  if (!L.learned) {
    return (
      <Lead>
        <LoopSteps learned={false} said={L.said} />
        <View style={s.gap4}>
          <Text style={t.title3}>Pick a book or a course</Text>
          <Text style={t.subhead}>Something to learn from today. Then you say it back in a minute.</Text>
        </View>
        <View style={s.buttons}>
          <Button label="Add a book" kind="accent" onPress={() => nav.openTab('read')} wrap={s.flex} />
          <Button label="Courses" kind="quiet" onPress={() => nav.openTab('learn')} />
        </View>
      </Lead>
    );
  }

  // something went in: say it
  if (!L.said) {
    return (
      <Lead>
        <LoopSteps learned said={false} />
        <View style={s.gap4}>
          <Text style={[t.footnote, { color: a.color }]}>{L.prompt ? 'Say what you learned' : `Say it, ${L.topic.label.toLowerCase()}`}</Text>
          <Text style={t.title3}>{L.prompt ? L.prompt.text : L.topic.text}</Text>
          {L.prompt?.line ? <Text style={t.footnote} numberOfLines={2}>{`You wrote: ${L.prompt.line}`}</Text> : null}
        </View>
        <View style={s.buttons}>
          <Button label="Start" kind="accent" onPress={() => nav.take(L.spec)} icon={<Icon name="mic" size={18} color="#14161C" />} wrap={s.flex} />
          {v.say.learned ? <Button label={plain ? 'What I learned' : "Today's topic"} kind="quiet" onPress={() => setPlain((x) => !x)} /> : null}
        </View>
      </Lead>
    );
  }

  // both halves done: questions to bring back, else a quiet done
  if (v.recall.due) {
    return (
      <Lead>
        <LoopSteps learned said />
        <View style={s.gap4}>
          <Text style={[t.footnote, { color: a.color }]}>Bring it back</Text>
          <Text style={t.title3}>{v.recall.due === 1 ? 'One question from your reading' : `${v.recall.due} questions from your reading`}</Text>
          <Text style={t.subhead}>Made from your own lines. A minute or two.</Text>
        </View>
        <Button label="Start review" kind="accent" onPress={nav.openRecall} />
      </Lead>
    );
  }
  const what = [v.learn.today.lessons ? (v.learn.today.lessons === 1 ? 'a lesson' : `${v.learn.today.lessons} lessons`) : null,
    v.learn.today.read ? `${minWords(v.learn.today.read)} of reading` : null].filter(Boolean).join(' and ');
  return (
    <Lead>
      <LoopSteps learned said />
      <View style={s.gap4}>
        <Text style={t.title3}>Learned and said today</Text>
        <Text style={t.subhead}>
          {`${what ? `In: ${what}. ` : ''}${L.last?.status === 'reviewed' && L.last.overall != null ? `Out: a take scored ${L.last.overall}.` : L.last ? 'Out: a take, being reviewed.' : 'Out: ticked on Today.'}`}
        </Text>
      </View>
      <View style={s.buttons}>
        {L.last ? <Button label="See the review" kind="soft" onPress={() => nav.openReview(L.last!.id)} wrap={s.flex} /> : null}
        <Button label="Another take" kind="quiet" onPress={() => nav.take(L.spec)} icon={<Icon name="mic" size={16} />} />
      </View>
    </Lead>
  );
}

// ── the rest of today ──
function Rest({ v }: { v: HomeView }) {
  const a = useAspect();
  const nav = useNav();
  const lessonDone = useLessonDone();
  const [busy, setBusy] = useState<string | null>(null);
  const L = loopOf(v, false);
  const { book, course, today } = v.learn;
  // which part the lead already is, so it is not listed twice
  const lead = book?.sitting_since ? 'sitting' : !L.learned ? (book ? 'book' : course?.next ? 'lesson' : 'pick') : !L.said ? 'say' : v.recall.due ? 'recall' : 'done';
  const done = <View style={s.mark}><CheckRing done size={28} color={a.color} /></View>;
  const rows: React.ReactNode[] = [];
  for (const p of v.pending) {
    rows.push(<Item key={p.id} title={p.status === 'transcribing' ? 'Writing down your take' : 'Reviewing your take'} sub={p.topic} onPress={() => nav.openReview(p.id)}
      left={<View style={s.disc}><ActivityIndicator size="small" color={a.color} /></View>} chevron />);
  }
  if (v.recall.due && lead !== 'recall') {
    rows.push(<Item key="recall" title={v.recall.due === 1 ? 'One question to bring back' : `${v.recall.due} questions to bring back`} sub="From your own lines"
      onPress={nav.openRecall} left={<View style={s.disc}><Sym name="bulb" size={18} color={a.color} /></View>}
      action={<Button label="Start review" kind="soft" small onPress={nav.openRecall} />} />);
  }
  if (course && lead !== 'lesson') {
    const n = course.next;
    if (today.lessons > 0) {
      rows.push(<Item key="lesson" done title={today.lessons === 1 ? 'A lesson done' : `${today.lessons} lessons done`} sub={n ? `Next: ${n.title}` : course.title}
        left={done} onPress={() => nav.openTab('learn')} />);
    } else if (n) {
      rows.push(<Item key="lesson" title={n.title} sub={`Lesson ${n.n} of ${course.lessons}`} onPress={() => nav.openTab('learn')}
        left={<View style={s.disc}><Sym name="course" size={18} color={C.textSoft} /></View>}
        action={<Button label="Mark done" kind="soft" small onPress={() => { void lessonDone(n.id, n.title); }} />} />);
    }
  }
  if (book && !book.sitting_since && lead !== 'book') {
    if (today.read > 0) {
      rows.push(<Item key="book" done title={book.title} sub={`Read ${minWords(today.read)} today, now on page ${book.page}`} left={done} onPress={() => nav.openTab('read')} />);
    } else {
      rows.push(<Item key="book" title={book.title} sub={book.pages ? `Page ${book.page} of ${book.pages}` : `Page ${book.page}`} onPress={() => nav.openTab('read')}
        left={<View style={s.mark}><Cover book={book} w={28} /></View>}
        action={<Button label="Start reading" kind="soft" small busy={busy === 'book'} onPress={() => {
          setBusy('book');
          void startReading(book.id).catch((e) => a.notice((e as Error).message)).finally(() => setBusy(null));
        }} />} />);
    }
  }
  if (lead !== 'say' && lead !== 'done') {
    const said = v.say.today.find((x) => x.status !== 'transcribing' && x.status !== 'reviewing');
    if (said) {
      rows.push(<Item key="take" done title="Said today" sub={said.topic} onPress={() => nav.openReview(said.id)} left={done} chevron
        right={<Text style={[t.headline, t.num, said.status === 'reviewed' && { color: a.color }]}>{takeWord(said)}</Text>} />);
    } else if (L.said) {
      rows.push(<Item key="take" done title="Said today" sub="Ticked on Today" left={done} />);
    } else {
      rows.push(<Item key="say" title={L.topic.text} sub={`Say it, ${L.topic.label.toLowerCase()}`} onPress={() => nav.openTab('speak')}
        left={<View style={s.disc}><Icon name="mic" size={16} color={C.textSoft} /></View>}
        action={<Button label="Record" kind="soft" small onPress={() => nav.take(L.spec)} />} />);
    }
  }
  if (!rows.length) return null;
  return (
    <Block title="Also today">
      <Group inset={64}>{rows}</Group>
    </Block>
  );
}

// ── this week ──
function Week({ v }: { v: HomeView }) {
  const w = v.week;
  const mark = (d: HomeView['week']['days'][number]): DayMark => (d.learned && d.said > 0 ? 'done' : d.learned || d.said > 0 ? 'part' : 'none');
  const reading = w.days.reduce((n, d) => n + d.read, 0);
  const lessons = w.days.reduce((n, d) => n + d.lessons, 0);
  const takes = w.days.reduce((n, d) => n + d.said, 0);
  const line = w.learned || w.said
    ? `Learned on ${w.learned === 1 ? 'one day' : `${w.learned} days`}, said something on ${w.said === 1 ? 'one' : w.said}.`
    : 'A fresh week. One thing in and one thing said makes a day.';
  return (
    <Block title="This week" sub={line}>
      <Group pad>
        <WeekStrip days={w.days.map((d) => ({
          day: d.date, today: d.date === v.day, mark: mark(d),
          label: `${dayLabel(d.date, v.day)}, ${d.learned && d.said ? 'learned and said' : d.learned ? 'learned' : d.said ? 'said' : d.future ? 'still to come' : 'nothing logged'}`,
        }))} />
        <Text style={t.micro}>Full: learned and said. Soft: one of the two.</Text>
        <Metrics>
          <Metric size="s" label="Reading" value={reading ? minWords(reading) : 'None'} />
          <Metric size="s" label="Lessons" value={String(lessons)} />
          <Metric size="s" label="Takes" value={String(takes)} />
        </Metrics>
      </Group>
    </Block>
  );
}

// ── is the speaking getting sharper ──
function Sharper({ v }: { v: HomeView }) {
  const a = useAspect();
  const nav = useNav();
  const tr = v.sharper.trend;
  if (tr.length < 2) {
    return (
      <Block title="Getting sharper">
        <Group pad>
          <Text style={t.footnote}>{tr.length === 1 ? `One review so far, scored ${tr[0].overall}. Your line starts with the second.` : 'After two reviewed takes, your score line starts here. Every take is scored on the same rubric, so it compares.'}</Text>
        </Group>
      </Block>
    );
  }
  const first = tr[0], last = tr[tr.length - 1];
  const d = last.overall - first.overall;
  const fd = Math.round((last.fpm - first.fpm) * 10) / 10;
  return (
    <Block title="Getting sharper" action="Speak" onAction={() => nav.openTab('speak')}>
      <Group>
        <ProofRow label="Speaking score" value={String(last.overall)} values={tr.map((x) => x.overall)} minSpan={20}
          note={`Over your last ${tr.length} takes`} delta={d ? `${d > 0 ? 'Up' : 'Down'} ${Math.abs(d)}` : 'Level'} good={d > 0} onPress={() => nav.openTab('speak')} />
        <ProofRow label="Fillers a minute" value={num(last.fpm)} values={tr.map((x) => x.fpm)} minSpan={2}
          note={`${num(first.fpm)} at the start`} delta={fd ? `${fd < 0 ? 'Down' : 'Up'} ${num(Math.abs(fd))}` : 'Level'} good={fd < 0} onPress={() => nav.openTab('speak')} />
      </Group>
    </Block>
  );
}

function ProofRow({ label, value, values, note, delta, good, range, minSpan, onPress }: {
  label: string; value: string; values: number[]; note: string; delta: string; good: boolean; range?: [number, number]; minSpan?: number; onPress: () => void;
}) {
  const a = useAspect();
  return (
    <Press label={`${label} ${value}, ${delta}. ${note}`} onPress={onPress} scale={0.99} style={s.proof}>
      <View style={s.proofLeft}>
        <Text style={t.footnote}>{label}</Text>
        <View style={s.proofValue}>
          <Text style={[t.title3, t.num]}>{value}</Text>
          <Tag label={delta} tone={good ? 'aspect' : 'neutral'} color={a.color} />
        </View>
        <Text style={t.footnote} numberOfLines={1}>{note}</Text>
      </View>
      <View style={s.spark}><Spark values={values} width={112} height={40} range={range} minSpan={minSpan} stroke={2} color={a.color} /></View>
    </Press>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap2: { gap: 2 },
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  gap16: { gap: 16 },
  buttons: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  bookRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  steps: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5 },
  stepLine: { width: 24, height: 2, borderRadius: 1 },
  disc: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  mark: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  proof: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 84, paddingHorizontal: 16, paddingVertical: 12 },
  proofLeft: { flex: 1, minWidth: 0, gap: 4 },
  proofValue: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spark: { width: 112, height: 40 },
});
