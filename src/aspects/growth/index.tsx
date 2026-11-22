import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Button, Card, Chip, dayLabel, Empty, Failed, Field, Icon, num, Page, Press, R, Row, Section, Sheet, shortDay, Skeleton, SP, t, useAspect, useEntry,
} from '@/aspects/kit';
import { useGet } from '@/lib/mod';
import { ASPECT_KEYS } from '@/lib/aspectLinks';
import { C, type AspectKey } from '@/theme';
import { answerRead, HOME } from './data';
import { OverTime } from './OverTime';
import { Review } from './Review';
import { ReviewsScreen } from './Reviews';
import { RuleSheet, RulesScreen } from './Rules';
import { ScoreScreen } from './ScoreScreen';
import type { Home, MorningRead, Section as Sec } from './types';
import { feltLine, NAME, range, ruleSub, TREND_WORD, whenSaid } from './ui';
import { Wheel, WheelKey } from './Wheel';
import { Linked } from '@/aspects/_linked/Linked';

// Growth: am I getting better? The wheel read honestly (his score against what the data shows), the one thing this
// page needs from him, the overnight read in the morning, and the rules he lives by. No streak, no score to chase.

type Open = 'score' | 'time' | 'review' | 'rules' | 'reviews' | null;

export default function Growth() {
  const a = useAspect();
  const home = useGet<Home>(HOME);
  const [sel, setSel] = useState<AspectKey | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [timeSec, setTimeSec] = useState<AspectKey | null>(null);
  const [newRule, setNewRule] = useState(false);
  const d = home.data;
  const size = Math.min(a.width - SP[32], 360);
  const close = () => setOpen(null);
  // growth/<part>: score, review, rules, reviews, time[/<aspect>] (over time, on one section), wheel/<aspect> (that
  // section picked on the wheel). growth/journal goes to Soul's journal (src/lib/aspectLinks.ts).
  useEntry((e) => {
    const [p, k] = e.parts;
    const key = ASPECT_KEYS.find((x) => x === k) ?? null;
    setOpen(p === 'score' || p === 'review' || p === 'rules' || p === 'reviews' || p === 'time' ? p : null);
    if (p === 'time') setTimeSec(key);
    setSel(p === 'wheel' ? key : null);
    setNewRule(false);
  });

  const footer = (
    <>
      <ScoreScreen open={open === 'score'} onClose={close} />
      <OverTime open={open === 'time'} start={timeSec} onClose={close} />
      <Review open={open === 'review'} onClose={close} />
      <RulesScreen open={open === 'rules'} onClose={close} />
      <ReviewsScreen open={open === 'reviews'} onClose={close} />
      <RuleSheet open={newRule} rule={null} onClose={() => setNewRule(false)} />
    </>
  );

  if (!d) {
    return (
      <Page footer={footer}>
        {home.error ? <Failed message={home.error} onRetry={home.refresh} /> : (
          <View style={s.gap24}>
            <View style={s.centre}><Skeleton height={size} width={size} radius={size / 2} /></View>
            <Skeleton height={120} radius={R.card} />
            <Skeleton height={56} radius={R.row} />
            <Skeleton height={56} radius={R.row} />
          </View>
        )}
      </Page>
    );
  }

  const w = d.wheel;
  const sec = sel ? w.sections.find((x) => x.key === sel) ?? null : null;
  return (
    <Page subtitle={range(d.week.label)} onRefresh={home.refresh} refreshing={home.busy} footer={footer}>
      <View style={s.wheelBlock}>
        <View style={s.centre}>
          <Wheel sections={w.sections} size={size} selected={sel} onSelect={(k) => setSel(sel === k ? null : k)} />
        </View>
        <WheelKey />
        {sec ? (
          <SectionCard sec={sec} onOpen={() => a.openAspect(sec.key)} onTime={() => { setTimeSec(sec.key); setOpen('time'); }} onClose={() => setSel(null)} />
        ) : (
          <Summary home={d} onPick={setSel} onScore={() => setOpen('score')} />
        )}
      </View>

      <Next home={d} onReview={() => setOpen('review')} onScore={() => setOpen('score')} onMission={() => a.openAspect('mission')} />

      {d.read && !d.read.answered ? <ReadCard read={d.read} /> : null}

      <Section title="Your rules" action={d.rules.active ? 'All' : undefined} onAction={() => setOpen('rules')}>
        {d.rules.top.length ? (
          <View style={s.rows}>
            {d.rules.top.map((r) => (
              <Row key={r.id} title={r.text} sub={ruleSub(r, d.week.key)} onPress={() => setOpen('rules')} label={`${r.text} ${ruleSub(r, d.week.key)}`} chevron />
            ))}
          </View>
        ) : (
          <Card>
            <Empty title="Rules you live by" body="Each one comes from a miss in a Sunday review: when this happens, I do that. A later review asks whether it held." action="Write one now" onAction={() => setNewRule(true)} />
          </Card>
        )}
      </Section>

      <View style={s.rows}>
        <Row title="Over time" sub={overTimeLine(d)} onPress={() => { setTimeSec(null); setOpen('time'); }} chevron
          left={<View style={s.rowIcon}><Icon name="clock" size={18} color={C.muted} /></View>} />
        <Row title="Past reviews" sub={d.reviews ? `${d.reviews} closed ${d.reviews === 1 ? 'week' : 'weeks'}, with what you learned` : 'Your first closes this Sunday'} onPress={() => setOpen('reviews')} chevron
          left={<View style={s.rowIcon}><Icon name="calendar" size={18} color={C.muted} /></View>} />
      </View>

      <Linked />
    </Page>
  );
}

function overTimeLine(d: Home) {
  const w = d.wheel;
  if (w.early) return 'Each section across weeks. A trend needs six weeks of data.';
  const parts: string[] = [];
  if (w.riser) parts.push(`${NAME[w.riser]} is rising`);
  if (w.sliding) parts.push(`${NAME[w.sliding]} is sliding`);
  if (!parts.length) return 'Nothing has moved beyond the noise lately.';
  return `${parts.join(' and ')}. The rest holds steady.`;
}

/** Under the wheel when nothing is picked: how old the scores are, what moved, where score and data part most. */
function Summary({ home, onPick, onScore }: { home: Home; onPick: (k: AspectKey) => void; onScore: () => void }) {
  const a = useAspect();
  const w = home.wheel, sc = w.scoring;
  const moved = w.sections.filter((x) => x.moved && x.change != null);
  const line1 = sc.scored && sc.last ? `Scored ${whenSaid(sc.last)}.` : 'Not scored yet.';
  const line2 = !sc.scored ? 'Score it once and the wheel fills in.'
    : !sc.previous ? 'One scoring so far. The next shows what moved.'
    : moved.length ? `Since ${shortDay(sc.previous)}: ${moved.map((x) => `${x.name} ${x.change! > 0 ? 'up' : 'down'} ${Math.abs(x.change!)}`).join(', ')}.`
    : 'Nothing moved more than a point since the scoring before.';
  const gaps = w.sections.filter((x) => x.agree && x.agree !== 'agree' && x.felt != null && x.measured != null)
    .sort((x, y) => Math.abs(y.felt! - y.measured!) - Math.abs(x.felt! - x.measured!));
  const g = gaps[0];
  return (
    <View style={s.summary}>
      <Text style={[t.small, s.centreText]}>{line1} {line2}</Text>
      {home.lead !== 'score' && sc.days !== 0 ? (
        <Press label="Score your wheel now" onPress={onScore} wrap={s.selfCentre} style={s.scoreLink}>
          <Text style={[t.label, { color: a.color }]}>Score now</Text>
        </Press>
      ) : null}
      {g ? (
        <Card onPress={() => onPick(g.key)} label={`Where they part most: ${g.name}, you scored ${num(g.felt!, 1)}, the data reads ${num(g.measured!, 1)}`} style={s.gapCard}>
          <View style={s.gapText}>
            <Text style={t.label}>Where they part most</Text>
            <Text style={t.strong}>{g.name}: you scored {num(g.felt!, 1)}, the data reads {num(g.measured!, 1)}</Text>
          </View>
          <Icon name="right" size={16} color={C.faint} />
        </Card>
      ) : null}
    </View>
  );
}

function SectionCard({ sec, onOpen, onTime, onClose }: { sec: Sec; onOpen: () => void; onTime: () => void; onClose: () => void }) {
  const f = feltLine(sec);
  const old = sec.feltDate ? whenSaid(sec.feltDate) : null;
  return (
    <Card style={s.secCard}>
      <View style={s.secHead}>
        <Text accessibilityRole="header" style={[t.heading, s.flex]}>{sec.name}</Text>
        <Press label={`Close ${sec.name}`} onPress={onClose} hitSlop={8} style={s.x}><Icon name="close" size={14} color={C.muted} /></Press>
      </View>
      <Text style={t.body}>{f.head} {f.data}</Text>
      {old && /months/.test(old) ? <Text style={t.caption}>That score is {old.split(', ')[1]} old now.</Text> : null}
      {f.verdict ? <Text style={t.strong}>{f.verdict}</Text> : null}
      {sec.evidence.length ? (
        <View style={s.evidence}>
          {sec.evidence.map((e) => (
            <View key={e} style={s.evRow}><View style={s.evBar} /><Text style={[t.small, s.flex]}>{e}</Text></View>
          ))}
        </View>
      ) : null}
      <Text style={t.caption}>{sec.trend.state === 'early' ? 'Too early to call a trend.' : `Over the last month: ${TREND_WORD[sec.trend.state].toLowerCase()}.`}</Text>
      <View style={s.secActions}>
        <Button label={`Open ${sec.name}`} kind="soft" small onPress={onOpen} />
        <Button label="Over time" kind="quiet" small onPress={onTime} />
      </View>
    </Card>
  );
}

/** The one thing this page needs from him now, or a quiet line when nothing is due. */
function Next({ home, onReview, onScore, onMission }: { home: Home; onReview: () => void; onScore: () => void; onMission: () => void }) {
  const { color } = useAspect();
  const r = home.review, sc = home.wheel.scoring;
  if (home.lead === 'review') {
    const last = r.week !== home.week.key;
    return (
      <Card tone={color} style={s.lead}>
        <Text style={t.heading}>{last ? 'Close last week' : 'Your Sunday review'}</Text>
        <Text style={t.body}>
          {range(r.label)}. About five minutes, mostly drafted from your week.{sc.due ? ' Scoring your wheel is one step of it.' : ''}
        </Text>
        <Button label="Start the review" kind="accent" onPress={onReview} wrap={s.leadBtn} />
      </Card>
    );
  }
  if (home.lead === 'score') {
    return (
      <Card tone={color} style={s.lead}>
        <Text style={t.heading}>Time to score your wheel</Text>
        <Text style={t.body}>{sc.scored && sc.last ? `Last scored ${whenSaid(sc.last)}.` : 'Your first scoring.'} Nine sections, under a minute.</Text>
        <Button label="Score the wheel" kind="accent" onPress={onScore} wrap={s.leadBtn} />
      </Card>
    );
  }
  const waiting = home.mission.waiting;
  return (
    <View style={s.rows}>
      {waiting ? (
        <Row title={`${waiting} ${waiting === 1 ? 'move is' : 'moves are'} waiting in Mission`} sub="Take them into this week there" onPress={onMission} chevron />
      ) : null}
      <Text style={[t.small, s.quiet]}>
        {r.sealed ? 'This week is closed. ' : 'Nothing due here. '}
        {r.nextOpen ? `The next review opens ${dayLabel(r.nextOpen)}.` : ''}
      </Text>
    </View>
  );
}

const OFF = ['Wrong facts', 'Reads too much into it', 'Not important', 'Something else'];

/** Last night's read on a short morning card: agree, say what's off, or keep it as a move for Sunday. */
function ReadCard({ read }: { read: MorningRead }) {
  const a = useAspect();
  const [busy, setBusy] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const open = read.connections.filter((c) => !c.verdict);
  const c = open[0] ?? null;
  const send = async (connection: string, answer: 'agree' | 'wrong' | 'move', extra?: { reason?: string; note?: string }) => {
    setBusy(answer);
    try {
      await answerRead({ date: read.date, connection, answer, ...extra });
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
  return (
    <Card style={s.read}>
      <View style={s.readHead}>
        <Text style={t.section}>Overnight read</Text>
        <Text style={t.caption}>{read.ran ? `Nora’s reading of yesterday, made at ${read.ran}` : 'Nora’s reading of yesterday'}</Text>
      </View>
      <Text style={t.lead}>{read.headline}</Text>
      {c ? <Text style={t.strong}>{c.title}</Text> : null}
      {c ? <Text style={t.body}>{c.text}</Text> : null}
      {c ? (
        <View style={s.readActions}>
          <Button label="Agree" kind="soft" small busy={busy === 'agree'} onPress={() => send(c.id, 'agree')} />
          <Button label="Not quite" kind="quiet" small onPress={() => setWrong(c.id)} />
          {c.move ? <Button label="Keep as a move" kind="quiet" small busy={busy === 'move'} onPress={() => send(c.id, 'move')} /> : null}
        </View>
      ) : null}
      {open.length > 1 ? <Text style={t.caption}>{open.length - 1} more {open.length - 1 === 1 ? 'thread' : 'threads'} after this one</Text> : null}
      <Sheet open={!!wrong} onClose={() => setWrong(null)} title="What's off?">
        <View style={s.sheetBody}>
          <View style={s.chips}>
            {OFF.map((o) => <Chip key={o} label={o} selected={reason === o} onPress={() => setReason(reason === o ? null : o)} />)}
          </View>
          <Field label="Say more, if you like" value={note} onChangeText={setNote} placeholder="What it got wrong" multiline maxLength={400} />
          <Button label="Save" onPress={save} />
        </View>
      </Sheet>
    </Card>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  gap24: { gap: SP[24] },
  centre: { alignItems: 'center' },
  selfCentre: { alignSelf: 'center' },
  centreText: { textAlign: 'center' },
  wheelBlock: { gap: SP[16] },
  summary: { gap: SP[12] },
  scoreLink: { minHeight: 44, paddingHorizontal: SP[16], justifyContent: 'center' },
  gapCard: { flexDirection: 'row', alignItems: 'center', gap: SP[12], paddingVertical: SP[12] },
  gapText: { flex: 1, gap: SP[2] },
  secCard: { gap: SP[8] },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: SP[8] },
  x: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  evidence: { gap: SP[4], marginTop: SP[4] },
  evRow: { flexDirection: 'row', alignItems: 'center', gap: SP[8] },
  evBar: { width: 2, height: 16, borderRadius: 1, backgroundColor: C.faint },
  secActions: { flexDirection: 'row', gap: SP[8], marginTop: SP[8], flexWrap: 'wrap' },
  lead: { gap: SP[8] },
  leadBtn: { alignSelf: 'flex-start', marginTop: SP[8] },
  rows: { gap: SP[8] },
  quiet: { paddingHorizontal: SP[4] },
  rowIcon: { width: 32, alignItems: 'center' },
  read: { gap: SP[8] },
  readHead: { gap: SP[2] },
  readActions: { flexDirection: 'row', gap: SP[8], flexWrap: 'wrap', marginTop: SP[8] },
  sheetBody: { gap: SP[16] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SP[8] },
});
