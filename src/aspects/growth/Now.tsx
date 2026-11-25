import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Block, Button, Chip, Field, Group, Icon, Item, Lead, num, Sheet, shortDay, SURF, t, useAspect,
} from '@/aspects/kit';
import { Linked } from '@/aspects/_linked/Linked';
import { useCollection } from '@/lib/mod';
import { C } from '@/theme';
import { answerRead } from './data';
import { useNav } from './nav';
import { useReviewProgress } from './Review';
import { RulesThisWeek } from './Rules';
import type { Home, MorningRead, ReviewDoc } from './types';
import { NAME, opensOn, range, whenSaid } from './ui';

/**
 * Growth now: this week's review (due, part done, or closed) or the wheel when it is due for a score, as the one
 * lit card; last night's read in the morning; the rules to tick this week; a line each on the wheel.
 */
export function NowTab({ home }: { home: Home }) {
  return (
    <>
      <ReviewLead home={home} />
      {home.read && !home.read.answered && beforeReadEnds() ? <ReadCard key={home.read.id} read={home.read} /> : null}
      <RulesThisWeek ids={home.rules.top.map((r) => r.id)} week={home.week.key} />
      <WheelBrief home={home} />
      <Linked />
    </>
  );
}

/**
 * The one thing the page needs from him now: the review, the scoring, or when the next review opens. On the Review
 * tab (`reviewOnly`) a due scoring gives way to the week's own state.
 */
export function ReviewLead({ home, reviewOnly = false }: { home: Home; reviewOnly?: boolean }) {
  const a = useAspect();
  const nav = useNav();
  const r = home.review, sc = home.wheel.scoring;
  const step = useReviewProgress(home.lead === 'review' ? r.week : null, nav.flow?.kind === 'review');
  const reviews = useCollection<ReviewDoc>('growth', 'reviews');
  const glow = (words: string) => <Text style={[t.footnote, { color: a.color }]}>{words}</Text>;

  if (home.lead === 'review') {
    const last = r.week !== home.week.key; // Monday or Tuesday: last week can still be closed
    return (
      <Lead>
        {glow(last ? 'Last week is still open' : 'Sunday review')}
        <View style={s.gap4}>
          <Text style={t.title3}>{last ? `Close the week of ${range(r.label)}` : `Your week, ${range(r.label)}`}</Text>
          <Text style={t.subhead}>
            {step ? 'You stopped partway. Every answer so far is kept.' : `About five minutes, mostly drafted from your week.${sc.due ? ' Scoring your wheel is one step of it.' : ''}`}
          </Text>
        </View>
        <Button label={step ? 'Continue the review' : 'Start the review'} kind="accent" onPress={() => nav.openFlow({ kind: 'review' })} />
        {last ? <Text style={t.footnote}>A week can be closed until Tuesday. After that it is skipped, which is fine.</Text> : null}
      </Lead>
    );
  }
  if (home.lead === 'score' && !reviewOnly) {
    return (
      <Lead>
        {glow('Your wheel')}
        <View style={s.gap4}>
          <Text style={t.title3}>Time to score your wheel</Text>
          <Text style={t.subhead}>{sc.scored && sc.last ? `Last scored ${whenSaid(sc.last)}.` : 'Your first scoring.'} Nine sections, under a minute.</Text>
        </View>
        <Button label="Score the wheel" kind="accent" onPress={() => nav.openFlow({ kind: 'score' })} />
      </Lead>
    );
  }
  const when = r.nextOpen ? opensOn(r.nextOpen, home.today) : null;
  if (r.sealed) {
    const doc = (reviews.items ?? []).find((x) => x.week === r.week && x.status === 'sealed') ?? null;
    const waiting = home.mission.waiting;
    return (
      <Lead>
        {glow(`The week of ${range(r.label)}`)}
        <View style={s.gap4}>
          <Text style={t.title3}>Week closed</Text>
          {doc?.headline ? <Text style={t.subhead}>{doc.headline}</Text> : null}
        </View>
        {when ? <Text style={t.footnote}>{`The next review opens ${when}.`}</Text> : null}
        {waiting ? (
          <Button label={waiting === 1 ? 'One move waits in Mission' : `${waiting} moves wait in Mission`} kind="soft" onPress={() => a.openAspect('mission')} />
        ) : doc ? <Button label="See what you closed" kind="quiet" onPress={() => nav.openFlow({ kind: 'past', id: doc.id })} /> : null}
      </Lead>
    );
  }
  return (
    <Lead>
      {glow('Next review')}
      <View style={s.gap4}>
        <Text style={t.title3}>{when ? `Opens ${when}` : 'Opens on Saturday'}</Text>
        <Text style={t.subhead}>About five minutes on Saturday or Sunday, drafted from your week. Nothing is due here until then.</Text>
      </View>
      {sc.days !== 0 ? <Button label="Score the wheel now" kind="quiet" onPress={() => nav.openFlow({ kind: 'score' })} /> : null}
    </Lead>
  );
}

/** The wheel in three lines: how old the scores are and what moved, where score and data part most, the trend. */
function WheelBrief({ home }: { home: Home }) {
  const a = useAspect();
  const nav = useNav();
  const w = home.wheel, sc = w.scoring;
  const moved = w.sections.filter((x) => x.moved && x.change != null);
  const head = sc.scored && sc.last ? `Scored ${whenSaid(sc.last)}` : 'Not scored yet';
  const line = !sc.scored ? 'Score it once and the wheel fills in.'
    : !sc.previous ? 'One scoring so far. The next shows what moved.'
    : moved.length ? `Since ${shortDay(sc.previous)}: ${moved.map((x) => `${x.name} ${x.change! > 0 ? 'up' : 'down'} ${Math.abs(x.change!)}`).join(', ')}.`
    : 'Nothing moved more than a point since the scoring before.';
  const gaps = w.sections.filter((x) => x.agree && x.agree !== 'agree' && x.felt != null && x.measured != null)
    .sort((x, y) => Math.abs(y.felt! - y.measured!) - Math.abs(x.felt! - x.measured!));
  const g = gaps[0];
  return (
    <Block title="Your wheel" action="Open" onAction={() => nav.openTab('wheel')}>
      <Group inset={64}>
        <Item title={head} sub={line} left={<Glyph name="clock" />} onPress={() => nav.openTab('wheel')} chevron lines={3} />
        {g ? (
          <Item title={`${g.name}: you ${num(g.felt!, 1)}, the data ${num(g.measured!, 1)}`} sub="Where your score and the data part most" left={<Glyph name="more" />}
            onPress={() => { nav.setPick(g.key); nav.openTab('wheel'); }} chevron />
        ) : null}
        <Item title="Over time" sub={overTimeLine(home)} left={<Glyph name="calendar" />} onPress={() => nav.openFlow({ kind: 'time', section: null })} chevron lines={3} />
        {home.mission.waiting && !home.review.sealed ? (
          <Item title={home.mission.waiting === 1 ? 'One move waits in Mission' : `${home.mission.waiting} moves wait in Mission`} sub={home.mission.waiting === 1 ? 'From your last review. Take it into the week there.' : 'From your last review. Take them into the week there.'}
            left={<Glyph name="arrowUp" />} onPress={() => a.openAspect('mission')} chevron />
        ) : null}
      </Group>
    </Block>
  );
}

export function overTimeLine(d: Home) {
  const w = d.wheel;
  if (w.early) return 'Each section across weeks. A trend needs six weeks of data.';
  const parts: string[] = [];
  if (w.riser) parts.push(`${NAME[w.riser]} is rising`);
  if (w.sliding) parts.push(`${NAME[w.sliding]} is sliding`);
  if (!parts.length) return 'Nothing has moved beyond the usual wobble lately.';
  return `${parts.join(' and ')}. The rest holds steady.`;
}

function Glyph({ name }: { name: 'clock' | 'more' | 'calendar' | 'arrowUp' }) {
  return <View style={s.glyph}><Icon name={name} size={18} color={C.textSoft} /></View>;
}

/** The overnight read is a morning card: it stays until every thread is answered, or until 15:00 (IST). */
const READ_ENDS = 15;
const beforeReadEnds = (at = Date.now()) => new Date(at + 5.5 * 3_600_000).getUTCHours() < READ_ENDS;
const OFF = ['Wrong facts', 'Reads too much into it', 'Not important', 'Something else'];

/** Last night's read: agree, say what's off, or keep it as a move for Sunday. One thread at a time. */
function ReadCard({ read }: { read: MorningRead }) {
  const a = useAspect();
  const [busy, setBusy] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [done, setDone] = useState<string[]>([]); // answered here, before the reload brings the verdicts
  const open = read.connections.filter((c) => !c.verdict && !done.includes(c.id));
  const c = open[0] ?? null;
  const send = async (connection: string, answer: 'agree' | 'wrong' | 'move', extra?: { reason?: string; note?: string }) => {
    setBusy(answer);
    try {
      await answerRead({ date: read.date, connection, answer, ...extra });
      setDone((x) => [...x, connection]); // the next thread shows at once
      a.notice(answer === 'move' ? 'Kept for Sunday’s moves' : 'Noted');
    } catch (e) {
      a.notice((e as Error).message);
    } finally { setBusy(null); }
  };
  const save = () => {
    const id = wrong;
    setWrong(null);
    if (id) void send(id, 'wrong', { reason: reason ?? undefined, note: note.trim() || undefined });
    setReason(null);
    setNote('');
  };
  if (!c && !wrong) return null; // every thread answered here; the reload drops the card
  return (
    <Block title="Overnight read" sub={read.ran ? `Nora’s reading of yesterday, made at ${read.ran}` : 'Nora’s reading of yesterday'}>
      <Group pad>
        <Text style={t.headline}>{read.headline}</Text>
        {c ? <Text style={t.callout}>{c.title}</Text> : null}
        {c ? <Text style={t.subhead}>{c.text}</Text> : null}
        {c ? (
          <View style={s.actions}>
            <Button label="Agree" kind="soft" small busy={busy === 'agree'} onPress={() => send(c.id, 'agree')} />
            <Button label="Not quite" kind="quiet" small onPress={() => setWrong(c.id)} />
            {c.move ? <Button label="Keep as a move" kind="quiet" small busy={busy === 'move'} onPress={() => send(c.id, 'move')} /> : null}
          </View>
        ) : null}
        {open.length > 1 ? <Text style={t.footnote}>{open.length - 1 === 1 ? 'One more thread after this one' : `${open.length - 1} more threads after this one`}</Text> : null}
      </Group>
      <Sheet open={!!wrong} onClose={() => setWrong(null)} title="What's off?">
        <View style={s.chips}>
          {OFF.map((o) => <Chip key={o} label={o} selected={reason === o} onPress={() => setReason(reason === o ? null : o)} />)}
        </View>
        <Field label="Say more, if you like" value={note} onChangeText={setNote} placeholder="What it got wrong" multiline maxLength={400} />
        <Button label="Save" onPress={save} />
      </Sheet>
    </Block>
  );
}

const s = StyleSheet.create({
  gap4: { gap: 4 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  glyph: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.raised },
});
