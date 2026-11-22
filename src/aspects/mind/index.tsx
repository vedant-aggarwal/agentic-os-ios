import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  Button, Card, CheckRing, Failed, Icon, Page, Press, Row, Section, Skeleton, Spark, SURF, num, t, tint, useAspect, weekLetter,
} from '@/aspects/kit';
import { useGet } from '@/lib/mod';
import { C } from '@/theme';
import { CoursesScreen } from './Courses';
import { ReadScreen } from './Read';
import { RecallScreen } from './Recall';
import { ReviewScreen } from './Review';
import { DrillScreen, SpeakScreen, takeWord } from './Speak';
import { TakeFlow, type Run } from './Take';
import type { Day, HomeView, TakeSpec } from './types';
import { Sym, usePoll } from './ui';

// The Mind page: learn it, then say it. Home holds today's loop (one thing in, one thing said), this week, and
// whether the speaking is getting sharper. Speak, Read and Courses open as screens over it.

const HOME = '/mod/mind/home';
type Place = 'speak' | 'read' | 'courses' | null;

export default function Mind() {
  const a = useAspect();
  const g = useGet<HomeView>(a.open ? HOME : null);
  const v = g.data;
  const [place, setPlace] = useState<Place>(null);
  const [recall, setRecall] = useState(false);
  const [drill, setDrill] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const n = useRef(0);
  const take = (spec: TakeSpec, steps?: string[]) => { n.current += 1; setRun({ spec, n: n.current, steps }); };
  usePoll(() => { void g.refresh(); }, 4000, a.open && !!v?.pending.length);

  return (
    <Page subtitle="Learn it, then say it" onRefresh={() => { void g.refresh(); }} refreshing={g.busy && !!v}
      footer={(
        <>
          <SpeakScreen open={place === 'speak'} onClose={() => setPlace(null)} onTake={take} onReview={setReview} onDrill={setDrill} />
          <ReadScreen open={place === 'read'} onClose={() => setPlace(null)} onRecall={() => setRecall(true)} onSay={take} />
          <CoursesScreen open={place === 'courses'} onClose={() => setPlace(null)} onSay={take} />
          <RecallScreen open={recall} onClose={() => setRecall(false)} />
          <DrillScreen id={drill} onClose={() => setDrill(null)} onStart={(spec, steps) => take(spec, steps)} />
          <ReviewScreen id={review} onClose={() => setReview(null)} onAgain={(spec) => take(spec)} />
          <TakeFlow run={run} onClose={() => setRun(null)} />
        </>
      )}>
      {!v ? (g.error ? <Failed message={g.error} onRetry={g.refresh} /> : <HomeSkeleton />) : (
        <>
          <Loop v={v} onTake={take} onPlace={setPlace} onReview={setReview} />
          {v.pending.length ? <Pending v={v} onOpen={setReview} /> : null}
          {v.recall.due ? (
            <Card tone={a.color} onPress={() => setRecall(true)} label={`${v.recall.due} recall questions due`}>
              <View style={s.line}>
                <Sym name="bulb" size={20} color={a.color} />
                <Text style={[t.strong, s.flex]}>{v.recall.due === 1 ? 'One reading question to bring back' : `${v.recall.due} reading questions to bring back`}</Text>
                <Icon name="right" size={16} color={a.color} />
              </View>
            </Card>
          ) : null}
          <Week v={v} />
          <Sharper v={v} onOpen={() => setPlace('speak')} />
          <Section title="Open">
            <View>
              <Row title="Speak" left={<Door><Icon name="mic" size={18} /></Door>} chevron onPress={() => setPlace('speak')}
                sub={v.sharper.takes ? `${v.sharper.takes === 1 ? 'One take' : `${v.sharper.takes} takes`}, topics and drills` : 'Topics, drills and your scores'} />
              <Row title="Read" left={<Door><Sym name="book" size={18} /></Door>} chevron onPress={() => setPlace('read')}
                sub={v.learn.book ? v.learn.book.title : v.learn.books ? 'Pick your next book' : 'Add the book you are reading'} />
              <Row title="Courses" left={<Door><Sym name="course" size={18} /></Door>} chevron onPress={() => setPlace('courses')}
                sub={v.learn.course ? `${v.learn.course.title}, ${v.learn.course.done} of ${v.learn.course.lessons}` : v.learn.courses ? 'Pick a course to work on' : 'Add a course'} />
            </View>
          </Section>
        </>
      )}
    </Page>
  );
}

function Door({ children }: { children: ReactNode }) {
  return <View style={s.door}>{children}</View>;
}

/**
 * Today's loop: the one thing to learn joined to the one thing to say. Once something went in today, the say half
 * asks him to explain that; today's plain topic stays one tap away.
 */
function Loop({ v, onTake, onPlace, onReview }: { v: HomeView; onTake: (s: TakeSpec) => void; onPlace: (p: Place) => void; onReview: (id: string) => void }) {
  const a = useAspect();
  const [plain, setPlain] = useState(false);
  const { course, book, today } = v.learn;
  const learned = today.lessons > 0 || today.read > 0;
  const said = v.say.today.length > 0;
  const last = v.say.today[0] ?? null;
  const prompt = learned && v.say.learned && !plain ? v.say.learned : null;
  const topic = v.say.topic;
  const spec: TakeSpec = prompt
    ? { kind: 'learned', topic: prompt.text, label: 'Say what you learned', source: prompt.source }
    : { kind: 'impromptu', topic: topic.text, label: topic.label, topicId: topic.id, topicKind: topic.kind };

  let learnTitle: string, learnSub: string | null, learnGo: Place;
  if (learned) {
    learnTitle = [today.lessons ? (today.lessons === 1 ? 'A lesson done' : `${today.lessons} lessons done`) : null, today.read ? `${today.read} min of reading` : null].filter(Boolean).join(' and ');
    learnSub = course?.next ? `Next: ${course.next.title}` : book ? `${book.title}, page ${book.page}` : null;
    learnGo = today.lessons ? 'courses' : 'read';
  } else if (course?.next) {
    learnTitle = course.next.title;
    learnSub = `Lesson ${course.next.n} of ${course.lessons}${course.next.duration ? `, ${course.next.duration}` : ''}`;
    learnGo = 'courses';
  } else if (book) {
    learnTitle = book.title;
    learnSub = book.sitting_since ? 'Reading now' : book.idle != null && book.idle > 2 ? `Page ${book.page}, last read ${book.idle} days ago` : `Page ${book.page}${book.pages ? ` of ${book.pages}` : ''}`;
    learnGo = 'read';
  } else {
    learnTitle = 'Pick a course or a book';
    learnSub = 'Something to learn from today';
    learnGo = v.learn.courses ? 'courses' : 'read';
  }

  return (
    <Card>
      <Press label={`Learn: ${learnTitle}`} onPress={() => onPlace(learnGo)} scale={0.98} style={s.half}>
        <View style={s.rail}>
          {learned ? <CheckRing done size={28} /> : <View style={[s.node, { borderColor: tint(a.color, 0.5) }]}><Sym name={learnGo === 'read' ? 'book' : 'course'} size={14} color={a.color} /></View>}
        </View>
        <View style={s.halfText}>
          <Text style={[t.label, learned && { color: a.color }]}>{learned ? 'Learned today' : 'Learn'}</Text>
          <Text style={t.strong} numberOfLines={2}>{learnTitle}</Text>
          {learnSub ? <Text style={t.small} numberOfLines={1}>{learnSub}</Text> : null}
        </View>
        <Icon name="right" size={16} color={C.faint} />
      </Press>

      <View style={s.joint}><View style={[s.jointLine, { backgroundColor: learned ? a.color : SURF.line }]} /></View>

      <View style={s.half}>
        <View style={s.rail}>
          {said ? <CheckRing done size={28} /> : <View style={[s.node, { borderColor: tint(a.color, 0.5) }]}><Icon name="mic" size={14} color={a.color} /></View>}
        </View>
        <View style={[s.halfText, s.gap12]}>
          <View style={s.gap4}>
            <Text style={[t.label, said && { color: a.color }]}>{said ? 'Said today' : prompt ? 'Say what you learned' : `Say it, ${topic.label.toLowerCase()}`}</Text>
            <Text style={t.heading}>{prompt ? prompt.text : topic.text}</Text>
          </View>
          {last ? (
            <Press label={`Your take today, ${takeWord(last)}`} onPress={() => onReview(last.id)} style={s.lastTake}>
              {last.status === 'transcribing' || last.status === 'reviewing' ? <ActivityIndicator size="small" color={a.color} /> : null}
              <Text style={[t.label, t.num, last.status === 'reviewed' && { color: a.color }]}>{last.status === 'reviewed' ? `Scored ${last.overall}` : takeWord(last)}</Text>
              <Text style={[t.small, s.flex]} numberOfLines={1}>{last.topic}</Text>
              <Icon name="right" size={14} color={C.faint} />
            </Press>
          ) : null}
          <View style={s.buttons}>
            <Button label={said ? 'Another take' : 'Start'} kind={said ? 'soft' : 'accent'} onPress={() => onTake(spec)}
              icon={<Icon name="mic" size={18} color={said ? a.color : '#14161C'} />} />
            {learned && v.say.learned ? (
              <Button label={plain ? 'Say what I learned' : "Today's topic"} kind="quiet" small onPress={() => setPlain((x) => !x)} />
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

function Pending({ v, onOpen }: { v: HomeView; onOpen: (id: string) => void }) {
  const a = useAspect();
  const p = v.pending[0];
  return (
    <Card onPress={() => onOpen(p.id)} label="Your take is being reviewed. Open">
      <View style={s.line}>
        <ActivityIndicator color={a.color} />
        <View style={s.flex}>
          <Text style={t.strong}>{p.status === 'transcribing' ? 'Writing down your take' : 'Reviewing your take'}</Text>
          <Text style={t.small} numberOfLines={1}>{p.topic}</Text>
        </View>
      </View>
    </Card>
  );
}

/** This week as two rows of dots: a day he learned something, a day he said something. */
function Week({ v }: { v: HomeView }) {
  const a = useAspect();
  const w = v.week;
  const dot = (d: Day, on: boolean) => (
    <View key={d.date} style={s.dayCol}>
      <View style={[s.dot, on ? { backgroundColor: a.color, borderColor: a.color } : d.future ? s.dotFuture : null, d.date === v.day && !on && { borderColor: C.muted }]} />
    </View>
  );
  const line = w.learned || w.said
    ? `Learned on ${w.learned === 1 ? 'one day' : `${w.learned} days`}, said something on ${w.said === 1 ? 'one' : w.said}${w.both ? `. Both on ${w.both === 1 ? 'one day' : `${w.both} days`}.` : '.'}`
    : 'A fresh week. One lesson and one take makes a day.';
  return (
    <Section title="This week">
      <View style={s.gap8} accessibilityLabel={line}>
        <View style={s.weekRow}><Text style={[t.label, s.weekName]}>Learned</Text>{w.days.map((d) => dot(d, d.learned))}</View>
        <View style={s.weekRow}><Text style={[t.label, s.weekName]}>Said</Text>{w.days.map((d) => dot(d, d.said > 0))}</View>
        <View style={s.weekRow}>
          <View style={s.weekName} />
          {w.days.map((d) => <View key={d.date} style={s.dayCol}><Text style={[t.caption, d.date === v.day && { color: C.text }]}>{weekLetter(d.date)}</Text></View>)}
        </View>
      </View>
      <Text style={[t.small, t.num]}>{line}</Text>
    </Section>
  );
}

/** Is the speaking getting better: the overall score over recent reviewed takes, and fillers then and now. */
function Sharper({ v, onOpen }: { v: HomeView; onOpen: () => void }) {
  const a = useAspect();
  const tr = v.sharper.trend;
  if (tr.length < 2) {
    return (
      <Section title="Getting sharper?">
        <Text style={t.small}>{tr.length === 1 ? `One review so far, scored ${tr[0].overall}. Your line starts with the second.` : 'After two reviewed takes, your score line starts here. Every take is scored on the same rubric, so it compares.'}</Text>
      </Section>
    );
  }
  const first = tr[0], lastT = tr[tr.length - 1];
  const d = lastT.overall - first.overall;
  return (
    <Section title="Getting sharper?">
      <Card onPress={onOpen} label={`Overall ${lastT.overall}, ${d >= 0 ? 'up' : 'down'} ${Math.abs(d)} over ${tr.length} takes. Open Speak`}>
        <View style={s.gap12}>
          <View style={s.sharpHead}>
            <Text style={[t.big, t.num, { color: a.color }]}>{lastT.overall}</Text>
            <Text style={[t.small, t.num, s.flex]}>{d === 0 ? `Level with your first of the last ${tr.length}` : `${d > 0 ? 'Up' : 'Down'} ${Math.abs(d)} from ${first.overall} over your last ${tr.length} takes`}</Text>
          </View>
          <Spark values={tr.map((x) => x.overall)} width={a.width - 64} height={56} />
          <Text style={[t.small, t.num]}>{`Fillers a minute: ${num(first.fpm)} then, ${num(lastT.fpm)} now`}</Text>
        </View>
      </Card>
    </Section>
  );
}

function HomeSkeleton() {
  return (
    <View style={s.gap24}>
      <Skeleton height={248} radius={24} />
      <View style={s.gap8}><Skeleton height={20} width={100} /><Skeleton height={64} /></View>
      <View style={s.gap8}><Skeleton height={20} width={140} /><Skeleton height={120} radius={24} /></View>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  gap24: { gap: 24 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  half: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  halfText: { flex: 1, gap: 2 },
  rail: { width: 28, alignItems: 'center' },
  node: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  joint: { width: 28, alignItems: 'center', paddingVertical: 4 },
  jointLine: { width: 2, height: 24, borderRadius: 1 },
  lastTake: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: SURF.row },
  door: { width: 36, height: 36, borderRadius: 18, backgroundColor: SURF.card, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row', alignItems: 'center' },
  weekName: { width: 84 },
  dayCol: { flex: 1, alignItems: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: SURF.line },
  dotFuture: { borderColor: SURF.track, borderStyle: 'dashed' },
  sharpHead: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
});
