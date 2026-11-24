import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Bar, Button, Card, Chip, dayLabel, Empty, Failed, Field, haptic, Icon, IconButton, Loading, Press, Row, Screen, Skeleton, SP, t, useAspect,
} from '@/aspects/kit';
import { keep, kept, useGet } from '@/lib/mod';
import { C, type AspectKey } from '@/theme';
import { draftWithAI, landInMission, REVIEW, saveScores, sealReview, type SealBody } from './data';
import { Scorer } from './Score';
import type { Commitment, DraftItem, DraftMove, ReviewDraft, Verdict } from './types';
import { NAME, range, ruleSub, weekWords } from './ui';

// The Sunday review: one question a screen, mostly drafted by the PC, about five minutes. It closes the week's
// goals, keeps what moved and what missed (with why), checks the rules, offers one new rule, scores the wheel when
// it's due, and picks up to three moves. Closing the week lands the moves in Mission, whose route makes each one a
// week goal (HANDOFFS.md); Growth itself makes no goals.

type StepKey = 'week' | 'moved' | 'missed' | 'rules' | 'rule' | 'score' | 'moves' | 'close';
const VERDICTS: { key: Verdict; label: string }[] = [{ key: 'done', label: 'Done' }, { key: 'partly', label: 'Partly' }, { key: 'missed', label: 'Not done' }];
const HELD: [string, boolean | null][] = [['Held', true], ['Broke it', false], ['Didn’t come up', null]];
const MAX_MOVES = 3;

type Landed = { landed: number; held: number; week: string | null };
type Sealed = { moves: string[]; rule: string | null; landed: Landed | null };
type Handoff = { reviewed: string | null; moves: { week: string | null; items: { id: string; text: string; state: string }[] } };
const STATE_WORD: Record<string, string> = { offered: 'Waiting in Mission', accepted: 'In Mission’s week', declined: 'Let go' };

export function Review({ open, onClose }: { open: boolean; onClose: () => void }) {
  const g = useGet<ReviewDraft>(open ? REVIEW : null);
  const [just, setJust] = useState<Sealed | null>(null); // what this sitting closed, kept while the route reloads
  const d = g.data;
  const close = () => { setJust(null); onClose(); };
  return (
    <Screen open={open} onClose={close} title="Sunday review" immersive scroll={!d || d.status !== 'open' || !!just}>
      {!d ? (
        g.error ? <Failed message={g.error} onRetry={g.refresh} /> : (
          <View style={s.list}>
            <Skeleton height={8} radius={4} />
            <Skeleton height={36} width="70%" />
            <Skeleton height={20} />
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} height={88} radius={24} />)}
          </View>
        )
      ) : just ? (
        <Done d={d} moves={just.moves} rule={just.rule} landed={just.landed} onClose={close} />
      ) : d.status === 'closed' ? (
        <Card>
          <Empty title="The review opens on Saturday" body={`A week can be closed from Saturday to Tuesday.${d.window.nextOpen ? ` The next one opens ${dayLabel(d.window.nextOpen)}.` : ''}`} />
        </Card>
      ) : d.status === 'sealed' ? (
        <Done d={d} moves={null} rule={null} landed={null} onClose={close} />
      ) : (
        // keyed on the week and who drafted it: a reload of the same draft keeps every answer; a new AI draft
        // starts the drafted items over but keeps what he set himself (see restore)
        <Resume key={`${d.week}:${d.drafted_by}`} d={d} onSealed={setJust} redraft={g.refresh} />
      )}
    </Screen>
  );
}

type Miss = DraftItem & { keep: boolean; why: string | null; why2: string | null };
type Moved = { id: string; text: string; aspect: AspectKey; keep: boolean; mine?: boolean };
type Move = DraftMove & { mine?: boolean };
type RuleIdea = { id: string; when: string; then: string; why: string; from: { text: string; aspect: AspectKey; why: string | null } | null };

// ── answers that outlive a reload, a close, or the phone locking halfway ────────────────────────────────────────
/** Everything he has answered so far, for one week. Kept in memory and on the device until the week is closed. */
type Answers = {
  week: string; by: ReviewDraft['drafted_by']; i: number;
  verdicts: Record<string, { verdict: Verdict | null; carry: boolean }>;
  moved: Moved[]; missed: Miss[]; checks: Record<string, boolean | null>;
  ruleId: string | null; own: { when: string; then: string };
  scores: Partial<Record<AspectKey, number>>; scoreSkip: boolean;
  extra: Move[]; picks: string[]; serves: Record<string, string | null>; feel: string;
};
const ANSWERS = 'growth-review'; // one entry on the device; it names its week, so an old week's answers never apply
let inMemory: Answers | null = null; // the device write waits a moment; this copy is current at once

function saveAnswers(v: Answers | null) {
  inMemory = v;
  keep(ANSWERS, v);
}
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * The flow's starting state: the draft, with his saved answers laid back on it. Answers on drafted items come back
 * only when the item is the same one (same id and words, same drafter); what he wrote himself always comes back.
 */
function restore(d: ReviewDraft, saved: Answers | null, steps: number): Answers {
  const a = saved && saved.week === d.week ? saved : null;
  const same = !!a && a.by === d.drafted_by;
  const match = <T extends { id: string; text: string }>(list: T[] | undefined, x: { id: string; text: string }) =>
    same ? list?.find((y) => y.id === x.id && y.text === x.text && !(y as { mine?: boolean }).mine) ?? null : null;
  const verdicts = Object.fromEntries(d.commitments.map((c) => [c.id, a?.verdicts[c.id] ?? { verdict: c.suggested, carry: false }]));
  const moved: Moved[] = [
    ...d.moved.map((m) => ({ id: m.id, text: m.text, aspect: m.aspect, keep: match(a?.moved, m)?.keep ?? true })),
    ...(a?.moved.filter((m) => m.mine) ?? []),
  ];
  const missed: Miss[] = [
    ...d.missed.map((m) => { const o = match(a?.missed, m); return { ...m, keep: o?.keep ?? true, why: o?.why ?? null, why2: o?.why2 ?? null }; }),
    ...(a?.missed.filter((m) => m.source === 'you') ?? []),
  ];
  const ruleIds = new Set(d.rules.filter((r) => r.status === 'active').map((r) => r.id));
  const extra = a?.extra ?? [];
  const moveIds = new Set([...d.moves.map((m) => m.id), ...extra.map((m) => m.id)]);
  return {
    week: d.week, by: d.drafted_by, i: Math.min(a?.i ?? 0, steps - 1),
    verdicts, moved, missed,
    checks: Object.fromEntries(Object.entries(a?.checks ?? {}).filter(([id]) => ruleIds.has(id))),
    ruleId: a?.ruleId === 'own' || (same && a?.ruleId) ? a!.ruleId : null,
    own: a?.own ?? { when: '', then: '' },
    scores: a?.scores ?? Object.fromEntries(d.wheel.sections.filter((x) => x.felt != null).map((x) => [x.key, x.felt!])),
    scoreSkip: a?.scoreSkip ?? false,
    extra,
    picks: same ? a!.picks.filter((id) => moveIds.has(id)) : [...d.moves.slice(0, MAX_MOVES).map((m) => m.id), ...extra.map((m) => m.id)].slice(0, MAX_MOVES),
    serves: { ...Object.fromEntries(d.moves.map((m) => [m.id, m.serves])), ...(a?.serves ?? {}) },
    feel: a?.feel ?? '',
  };
}

/** Reads his saved answers (memory first, then the device) before the flow starts. */
function Resume(props: { d: ReviewDraft; onSealed: (s: Sealed) => void; redraft: () => Promise<unknown> }) {
  const week = props.d.week;
  const [saved, setSaved] = useState<Answers | null | undefined>(() => (inMemory?.week === week ? inMemory : undefined));
  useEffect(() => {
    if (saved !== undefined) return;
    let live = true;
    kept<Answers>(ANSWERS).then((x) => { if (live) setSaved(x && x.week === week ? x : null); }, () => { if (live) setSaved(null); });
    return () => { live = false; };
  }, [saved, week]);
  if (saved === undefined) return null; // the device answers in a few milliseconds
  return <Flow {...props} saved={saved} />;
}

function Flow({ d, saved, onSealed, redraft }: { d: ReviewDraft; saved: Answers | null; onSealed: (s: Sealed) => void; redraft: () => Promise<unknown> }) {
  const a = useAspect();
  const active = d.rules.filter((r) => r.status === 'active');
  const steps: StepKey[] = [
    ...(d.commitments.length ? ['week' as const] : []), 'moved', 'missed', ...(active.length ? ['rules' as const] : []),
    'rule', ...(d.wheel.due ? ['score' as const] : []), 'moves', 'close',
  ];
  const [init] = useState(() => restore(d, saved, steps.length));
  const [i, setI] = useState(init.i);
  const step = steps[Math.min(i, steps.length - 1)];

  const [verdicts, setVerdicts] = useState(init.verdicts);
  const [moved, setMoved] = useState<Moved[]>(init.moved);
  const [missed, setMissed] = useState<Miss[]>(init.missed);
  const [checks, setChecks] = useState<Record<string, boolean | null>>(init.checks);
  const [ruleId, setRuleId] = useState<string | null>(init.ruleId); // an idea's id, or 'own'
  const [own, setOwn] = useState(init.own);
  const [scores, setScores] = useState<Partial<Record<AspectKey, number>>>(init.scores);
  const [scoreSkip, setScoreSkip] = useState(init.scoreSkip);
  const [extra, setExtra] = useState<Move[]>(init.extra);
  const [picks, setPicks] = useState<string[]>(init.picks);
  const [serves, setServes] = useState<Record<string, string | null>>(init.serves);
  const [feel, setFeel] = useState(init.feel);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(false);
  const [sealed, setSealed] = useState(false);

  // every answer is saved as he gives it, so a reload, a close or a locked phone picks up where he was
  useEffect(() => {
    if (sealed) return;
    saveAnswers({ week: d.week, by: d.drafted_by, i, verdicts, moved, missed, checks, ruleId, own, scores, scoreSkip, extra, picks, serves, feel });
  }, [d.week, d.drafted_by, i, verdicts, moved, missed, checks, ruleId, own, scores, scoreSkip, extra, picks, serves, feel, sealed]);

  const carried: Move[] = d.commitments.filter((c) => verdicts[c.id]?.carry && verdicts[c.id]?.verdict !== 'done')
    .map((c) => ({ id: `carry:${c.id}`, text: c.text, aspect: c.aspect, serves: c.parent, carry: c.id, from: null, source: 'carry' }));
  const offered: Move[] = [...d.moves, ...extra];
  const room = Math.max(MAX_MOVES - carried.length, 0);
  const chosen: Move[] = [...carried, ...offered.filter((m) => picks.includes(m.id)).slice(0, room)];

  const ideas: RuleIdea[] = [];
  const seen = new Set<string>(active.map((r) => r.when.trim().toLowerCase().replace(/^when\s+/, '')));
  for (const r of d.ruleIdeas) {
    if (seen.has(r.when.toLowerCase())) continue;
    seen.add(r.when.toLowerCase());
    ideas.push({ id: r.id, when: r.when, then: r.then, why: r.why, from: null });
  }
  for (const m of missed) {
    if (!m.keep || !m.why) continue;
    const b = [m.why2, m.why].map((k) => (k ? d.ruleBank[k] : null)).find((x) => x && !seen.has(x.when.toLowerCase()));
    if (!b) continue;
    seen.add(b.when.toLowerCase());
    ideas.push({ id: `b:${m.id}`, when: b.when, then: b.then, why: m.text, from: { text: m.text, aspect: m.aspect, why: m.why2 ?? m.why } });
  }
  const pickedRule = ruleId === 'own'
    ? (own.when.trim() && own.then.trim() ? { when: own.when.trim(), then: own.then.trim(), from: null } : null)
    : ideas.find((x) => x.id === ruleId) ?? null;
  const ruleLine = pickedRule ? `When ${pickedRule.when.replace(/^when\s+/i, '')}, ${pickedRule.then.replace(/\.$/, '')}.` : null;

  const next = () => { haptic.light(); setDraft(''); setI(Math.min(i + 1, steps.length - 1)); };
  const back = () => { setDraft(''); if (i > 0) setI(i - 1); };

  const seal = async () => {
    setBusy(true);
    try {
      const scored = steps.includes('score') && !scoreSkip && Object.keys(scores).length > 0;
      if (scored) await saveScores(scores);
      const body: SealBody = {
        week: d.week, headline: d.headline, feel: feel.trim(), scored,
        closed: d.commitments.filter((c) => verdicts[c.id]?.verdict).map((c) => ({
          id: c.id, kind: c.kind, goal: c.goal, text: c.text, aspect: c.aspect, verdict: verdicts[c.id].verdict!,
          carry: verdicts[c.id].carry && verdicts[c.id].verdict !== 'done',
        })),
        moved: moved.filter((m) => m.keep).map((m) => ({ text: m.text, aspect: m.aspect })),
        missed: missed.filter((m) => m.keep).map((m) => ({ text: m.text, aspect: m.aspect, why: m.why, why2: m.why2, detail: m.detail || undefined })),
        checks: Object.entries(checks).map(([rule, held]) => ({ rule, held })),
        rule: pickedRule ? { when: pickedRule.when, then: pickedRule.then, from: pickedRule.from } : null,
        moves: chosen.map((m) => ({ text: m.text, aspect: m.aspect, serves: serves[m.id] ?? m.serves ?? null, carry: m.carry, from: m.from })),
      };
      const res = await sealReview(body);
      const landed = res.already ? null : await landInMission(res.item); // never throws: what Mission can't take stays offered
      haptic.success();
      setSealed(true);
      saveAnswers(null); // the week is closed: nothing to resume
      onSealed({ moves: chosen.map((m) => m.text), rule: ruleLine, landed });
    } catch (e) {
      a.notice((e as Error).message);
    } finally { setBusy(false); }
  };

  const askModel = async () => {
    setAi(true);
    try {
      await draftWithAI();
      await redraft();
    } catch (e) {
      a.notice((e as Error).message);
    } finally { setAi(false); }
  };

  if (ai) return <Loading label="Nora is reading your week. About twenty seconds." />;

  const head = (title: string, sub?: string) => (
    <View style={s.head}>
      <Text accessibilityRole="header" style={t.title2}>{title}</Text>
      {sub ? <Text style={t.small}>{sub}</Text> : null}
    </View>
  );

  let body: ReactNode = null;
  let nextLabel = 'Next';
  if (step === 'week') {
    body = (
      <>
        {head('The week you set', `What you meant to do in ${range(d.label)}. Anything not done can carry into next week.`)}
        {d.commitments.map((c) => (
          <CommitCard key={c.id} c={c} v={verdicts[c.id]} onChange={(v) => setVerdicts({ ...verdicts, [c.id]: v })} />
        ))}
      </>
    );
  } else if (step === 'moved') {
    body = (
      <>
        {head('What moved', moved.length ? 'Drafted from your data. Untick anything that doesn’t feel like progress; add what the data missed.' : 'Nothing stood out in the data. Add anything that went well, even small.')}
        {moved.length ? (
          <View style={s.rows}>
            {moved.map((m) => (
              <Row key={m.id} title={m.text} sub={m.mine ? 'Added by you' : NAME[m.aspect]} done={m.keep}
                onToggle={() => setMoved(moved.map((x) => (x.id === m.id ? { ...x, keep: !x.keep } : x)))} />
            ))}
          </View>
        ) : null}
        <AddLine placeholder="Something that went well" value={draft} onChange={setDraft}
          onAdd={() => { setMoved([...moved, { id: uid('u'), text: draft.trim(), aspect: 'growth', keep: true, mine: true }]); setDraft(''); }} />
        {d.drafted_by === 'code' ? (
          <View style={s.aiRow}>
            <Text style={[t.caption, s.flex]}>Drafted from your numbers. Nora can draft it from your journal and tasks too.</Text>
            <Button label="Ask Nora" kind="quiet" small onPress={askModel} />
          </View>
        ) : <Text style={t.caption}>Drafted by Nora from your week. Change anything.</Text>}
      </>
    );
  } else if (step === 'missed') {
    body = (
      <>
        {head('What missed, and why', missed.length ? 'Pick the nearest reason; a second tap narrows it. Reasons turn into rule ideas next.' : 'Nothing slipped in the data this week.')}
        {missed.map((m) => (
          <MissCard key={m.id} m={m} whys={m.task ? d.taskWhys : (m.whys?.length ? m.whys : d.whys)} tree={d.whyTree}
            onChange={(x) => setMissed(missed.map((y) => (y.id === m.id ? x : y)))} />
        ))}
        <AddLine placeholder="Something else that slipped" value={draft} onChange={setDraft}
          onAdd={() => { setMissed([...missed, { id: uid('u'), text: draft.trim(), aspect: 'growth', source: 'you', keep: true, why: null, why2: null }]); setDraft(''); }} />
      </>
    );
  } else if (step === 'rules') {
    body = (
      <>
        {head('Did your rules hold?', 'Only the times it came up count.')}
        {active.map((r) => (
          <Card key={r.id} style={s.card}>
            <Text style={t.strong}>{r.text}</Text>
            <Text style={t.caption}>{ruleSub(r, d.week)}</Text>
            <View style={s.chips}>
              {HELD.map(([label, v]) => (
                <Chip key={label} label={label} selected={r.id in checks && checks[r.id] === v} onPress={() => setChecks({ ...checks, [r.id]: v })} />
              ))}
            </View>
          </Card>
        ))}
      </>
    );
  } else if (step === 'rule') {
    nextLabel = ruleId ? 'Next' : 'Skip for this week';
    body = (
      <>
        {head('One rule from this week', 'When this happens, I do that. One is plenty; none is fine.')}
        {ideas.map((r) => (
          <Card key={r.id} onPress={() => setRuleId(ruleId === r.id ? null : r.id)} label={`When ${r.when}, ${r.then}`} style={[s.card, ruleId === r.id && { borderColor: a.color }]}>
            <View style={s.pickRow}>
              <Text style={[t.strong, s.flex]}>When {r.when}, {r.then}.</Text>
              <Radio on={ruleId === r.id} />
            </View>
            <Text style={t.caption}>{r.from ? `From: ${r.from.text}` : r.why}</Text>
          </Card>
        ))}
        {!ideas.length ? (
          <Text style={t.small}>
            {missed.some((m) => m.keep && m.why) ? 'Your rules already cover the reasons you picked. Write a new one if something else is going on.' : 'Pick reasons on the misses screen and ideas show up here. Or write your own.'}
          </Text>
        ) : null}
        <Card onPress={() => setRuleId(ruleId === 'own' ? null : 'own')} label="Write my own rule" style={[s.card, ruleId === 'own' && { borderColor: a.color }]}>
          <View style={s.pickRow}>
            <Text style={[t.strong, s.flex]}>Write my own</Text>
            <Radio on={ruleId === 'own'} />
          </View>
        </Card>
        {ruleId === 'own' ? (
          <View style={s.list}>
            <Field label="When" value={own.when} onChangeText={(v) => setOwn({ ...own, when: v })} placeholder="the evening gets away from me" maxLength={140} />
            <Field label="I do" value={own.then} onChangeText={(v) => setOwn({ ...own, then: v })} placeholder="write tomorrow's first step before bed" maxLength={140} />
          </View>
        ) : null}
      </>
    );
  } else if (step === 'score') {
    nextLabel = 'Save scores';
    body = (
      <>
        {head('Score your wheel', `${d.wheel.last ? `Last scored ${dayLabel(d.wheel.last)}.` : 'Your first scoring.'} Each starts at your last score; move only what changed.`)}
        <Scorer sections={d.wheel.sections} values={scores} onChange={(k, v) => setScores({ ...scores, [k]: v })} />
        <Press label="Skip scoring this week" onPress={() => { setScoreSkip(true); next(); }} style={s.skip}>
          <Text style={t.label}>Skip scoring this week</Text>
        </Press>
      </>
    );
  } else if (step === 'moves') {
    body = (
      <>
        {head('Up to three moves', `For ${range(d.nextLabel)}. When you close the week they go straight into that week in Mission. Fewer is fine if it is already full.`)}
        {carried.map((m) => (
          <MoveCard key={m.id} m={m} on note="Carried from this week" goals={d.goals} serves={serves[m.id] ?? m.serves}
            onServe={(gId) => setServes({ ...serves, [m.id]: gId })}
            onToggle={() => setVerdicts({ ...verdicts, [m.carry!]: { ...verdicts[m.carry!], carry: false } })} />
        ))}
        {offered.map((m) => {
          const on = chosen.some((x) => x.id === m.id);
          const full = !on && chosen.length >= MAX_MOVES;
          return (
            <MoveCard key={m.id} m={m} on={on} disabled={full} note={m.mine ? 'Added by you' : NAME[m.aspect]} goals={d.goals}
              serves={serves[m.id] ?? m.serves} onServe={(gId) => setServes({ ...serves, [m.id]: gId })}
              onToggle={() => setPicks(on ? picks.filter((x) => x !== m.id) : [...picks.filter((x) => chosen.some((c) => c.id === x)), m.id])} />
          );
        })}
        <AddLine placeholder="A move of your own" value={draft} onChange={setDraft}
          onAdd={() => {
            const id = uid('own');
            setExtra([...extra, { id, text: draft.trim(), aspect: 'mission', serves: null, carry: null, from: null, source: 'you', mine: true }]);
            if (chosen.length < MAX_MOVES) setPicks([...picks, id]);
            setDraft('');
          }} />
        <Text style={t.caption}>{chosen.length} of {MAX_MOVES} picked. Each one becomes a goal for that week in Mission.</Text>
      </>
    );
  } else {
    nextLabel = 'Close the week';
    const kept = moved.filter((m) => m.keep).length, missN = missed.filter((m) => m.keep).length, why = missed.filter((m) => m.keep && m.why).length;
    const done = Object.values(verdicts).filter((v) => v.verdict === 'done').length;
    body = (
      <>
        {head('Close the week', range(d.label))}
        {d.headline ? <Text style={t.lead}>{d.headline}</Text> : null}
        <Field label="One line on how it felt, if you like" value={feel} onChangeText={setFeel} placeholder="Slow start, good finish" maxLength={200} multiline />
        <View style={s.sum}>
          {d.commitments.length ? <SumLine text={`${done} of ${d.commitments.length} done from the week you set`} /> : null}
          <SumLine text={`${kept ? `${kept} ${kept === 1 ? 'thing' : 'things'} moved` : 'Nothing marked as moved'}, ${missN} missed${why ? `, ${why} with a reason` : ''}`} />
          <SumLine text={ruleLine ? `New rule: ${ruleLine}` : 'No new rule this week'} />
          {steps.includes('score') ? <SumLine text={scoreSkip ? 'Wheel not scored' : 'Wheel scored'} /> : null}
          <SumLine text={chosen.length ? `${chosen.length} ${chosen.length === 1 ? 'move' : 'moves'} for Mission: ${chosen.map((m) => m.text).join('; ')}` : 'No moves for next week'} />
        </View>
      </>
    );
  }

  return (
    <View style={s.flow}>
      <View style={s.progress} accessible accessibilityLabel={`Step ${i + 1} of ${steps.length}`}>
        <View style={s.flex}><Bar progress={(i + 1) / steps.length} height={4} /></View>
        <Text style={[t.caption, t.num]}>{i + 1} of {steps.length}</Text>
      </View>
      <ScrollView style={s.flex} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {body}
      </ScrollView>
      <View style={s.foot}>
        {i > 0 ? <IconButton label="Back a step" onPress={back}><Icon name="left" size={16} /></IconButton> : null}
        <Button label={nextLabel} kind={step === 'close' ? 'accent' : 'primary'} busy={busy}
          disabled={step === 'rule' && ruleId === 'own' && !pickedRule}
          onPress={step === 'close' ? seal : next} wrap={s.flex} />
      </View>
    </View>
  );
}

function SumLine({ text }: { text: string }) {
  return <View style={s.sumRow}><View style={s.sumBar} /><Text style={[t.small, s.flex]}>{text}</Text></View>;
}

function Radio({ on }: { on: boolean }) {
  const { color } = useAspect();
  return <View style={[s.radio, { borderColor: on ? color : C.faint }]}>{on ? <View style={[s.radioIn, { backgroundColor: color }]} /> : null}</View>;
}

function AddLine({ placeholder, value, onChange, onAdd }: { placeholder: string; value: string; onChange: (v: string) => void; onAdd: () => void }) {
  return (
    <View style={s.addRow}>
      <View style={s.flex}><Field label={placeholder} value={value} onChangeText={onChange} placeholder="Type and add" maxLength={140} onSubmit={() => { if (value.trim()) onAdd(); }} /></View>
      <IconButton label={`Add ${placeholder.toLowerCase()}`} onPress={onAdd} disabled={!value.trim()}><Icon name="plus" size={18} /></IconButton>
    </View>
  );
}

function CommitCard({ c, v, onChange }: {
  c: Commitment; v: { verdict: Verdict | null; carry: boolean }; onChange: (v: { verdict: Verdict | null; carry: boolean }) => void;
}) {
  const meta = [NAME[c.aspect], c.kind === 'move' ? 'a move from last review' : null,
    c.progress ? `${Math.round(c.progress)} percent along` : null, c.tasks ? `${c.tasks} ${c.tasks === 1 ? 'task' : 'tasks'}` : null].filter(Boolean).join(', ');
  return (
    <Card style={s.card}>
      <Text style={t.strong}>{c.text}</Text>
      <Text style={t.caption}>{meta}</Text>
      <View style={s.chips}>
        {VERDICTS.map((x) => <Chip key={x.key} label={x.label} selected={v.verdict === x.key} onPress={() => onChange({ ...v, verdict: x.key })} />)}
      </View>
      {v.verdict && v.verdict !== 'done' ? (
        <Row title="Carry it into next week" done={v.carry} onToggle={() => onChange({ ...v, carry: !v.carry })} />
      ) : null}
    </Card>
  );
}

function MissCard({ m, whys, tree, onChange }: { m: Miss; whys: string[]; tree: Record<string, string[]>; onChange: (m: Miss) => void }) {
  const sub = m.why ? tree[m.why] ?? [] : [];
  return (
    <Card style={[s.card, !m.keep && s.off]}>
      <Text style={t.strong}>{m.text}</Text>
      <View style={s.missMeta}>
        <Text style={[t.caption, s.flex]}>{m.detail ? `${NAME[m.aspect]}: ${m.detail.charAt(0).toUpperCase()}${m.detail.slice(1)}` : NAME[m.aspect]}</Text>
        <Press label={m.keep ? `Not a miss: ${m.text}` : `Count it again: ${m.text}`} onPress={() => onChange({ ...m, keep: !m.keep })} style={s.notMiss}>
          <Text style={t.label}>{m.keep ? 'Not a miss' : 'Count it'}</Text>
        </Press>
      </View>
      {m.keep ? (
        <>
          <View style={s.chips}>
            {whys.map((w) => <Chip key={w} label={w} selected={m.why === w} onPress={() => onChange({ ...m, why: m.why === w ? null : w, why2: null })} />)}
          </View>
          {sub.length ? (
            <View style={[s.chips, s.sub]}>
              {sub.map((w) => <Chip key={w} label={w} selected={m.why2 === w} onPress={() => onChange({ ...m, why2: m.why2 === w ? null : w })} />)}
            </View>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function MoveCard({ m, on, disabled, note, goals, serves, onServe, onToggle }: {
  m: Move; on: boolean; disabled?: boolean; note: string; goals: ReviewDraft['goals']; serves: string | null;
  onServe: (g: string | null) => void; onToggle: () => void;
}) {
  const { color } = useAspect();
  return (
    <Card style={[s.card, on && { borderColor: color }, disabled && s.off]}>
      <Press label={`${on ? 'Drop' : 'Pick'}: ${m.text}`} onPress={onToggle} disabled={disabled} state={{ selected: on, disabled }} style={s.pickRow}>
        <View style={s.flex}>
          <Text style={t.strong}>{m.text}</Text>
          <Text style={t.caption}>{note}</Text>
        </View>
        <Radio on={on} />
      </Press>
      {on && goals.length && (m.aspect === 'mission' || serves) ? (
        <View style={s.serve}>
          <Text style={t.caption}>Serves</Text>
          <View style={s.chips}>
            {goals.slice(0, 3).map((g) => (
              <Chip key={g.id} label={g.title.length > 34 ? `${g.title.slice(0, 33).replace(/\s+\S*$/, '')}…` : g.title}
                selected={serves === g.id} onPress={() => onServe(serves === g.id ? null : g.id)} />
            ))}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

/** After the seal: what went where, and the way to Mission. */
function Done({ d, moves, rule, landed, onClose }: { d: ReviewDraft; moves: string[] | null; rule: string | null; landed: Landed | null; onClose: () => void }) {
  const a = useAspect();
  const h = useGet<Handoff>(moves ? null : '/mod/growth/handoff');
  const kept = h.data?.reviewed === d.week ? h.data.moves.items : null;
  const wk = landed?.week ? `the week of ${weekWords(landed.week)}` : 'that week';
  const where = !landed ? 'They wait in Mission.'
    : !landed.held ? `${landed.landed === 1 ? 'It is' : 'They are'} in Mission for ${wk}.`
    : !landed.landed ? `${landed.held === 1 ? 'It waits' : 'They wait'} at the top of Mission’s week, for you to keep or let go.`
    : `${landed.landed} in Mission for ${wk}. ${landed.held} ${landed.held === 1 ? 'waits' : 'wait'} at the top of Mission’s week, for you to keep or let go.`;
  return (
    <View style={s.done}>
      <View style={[s.doneMark, { borderColor: a.color }]}><Icon name="check" size={28} color={a.color} /></View>
      <Text accessibilityRole="header" style={[t.title2, s.centreText]}>Week closed</Text>
      <Text style={[t.body, s.centreText]}>{range(d.label)}</Text>
      {moves?.length ? (
        <View style={s.sum}>
          {moves.map((m) => <SumLine key={m} text={m} />)}
          <Text style={t.caption}>{where}</Text>
        </View>
      ) : moves ? <Text style={[t.small, s.centreText]}>No moves for next week.</Text> : kept?.length ? (
        <View style={s.sum}>
          {kept.map((m) => <SumLine key={m.id} text={`${m.text}. ${STATE_WORD[m.state] ?? ''}`} />)}
        </View>
      ) : kept ? <Text style={[t.small, s.centreText]}>No moves for next week.</Text> : null}
      {rule ? <Text style={[t.small, s.centreText]}>New rule: {rule}</Text> : null}
      <View style={s.doneBtns}>
        <Button label="Open Mission" kind="accent" onPress={() => { onClose(); a.openAspect('mission'); }} />
        <Button label="Back to Growth" kind="quiet" onPress={onClose} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: SP[16] },
  rows: { gap: SP[8] },
  flow: { flex: 1, gap: SP[16] },
  progress: { flexDirection: 'row', alignItems: 'center', gap: SP[12] },
  scroll: { gap: SP[16], paddingBottom: SP[24] },
  head: { gap: SP[8], marginBottom: SP[4] },
  foot: { flexDirection: 'row', alignItems: 'center', gap: SP[12], paddingTop: SP[8] },
  card: { gap: SP[8] },
  off: { opacity: 0.55 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SP[8] },
  sub: { paddingLeft: SP[12], borderLeftWidth: 2, borderLeftColor: 'rgba(255,255,255,0.12)' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: SP[12], minHeight: 44 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioIn: { width: 10, height: 10, borderRadius: 5 },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SP[8] },
  aiRow: { flexDirection: 'row', alignItems: 'center', gap: SP[12] },
  missMeta: { flexDirection: 'row', alignItems: 'center', gap: SP[8], marginTop: -SP[8] },
  notMiss: { minHeight: 44, justifyContent: 'center', paddingLeft: SP[8] },
  skip: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  serve: { gap: SP[4] },
  sum: { alignSelf: 'stretch', gap: SP[8] },
  sumRow: { flexDirection: 'row', gap: SP[8], alignItems: 'flex-start' },
  sumBar: { width: 2, alignSelf: 'stretch', minHeight: 16, borderRadius: 1, backgroundColor: C.faint },
  done: { alignItems: 'center', gap: SP[16], paddingTop: SP[32] },
  doneMark: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  centreText: { textAlign: 'center' },
  doneBtns: { alignSelf: 'stretch', gap: SP[8], marginTop: SP[16] },
});
