import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Bar, Button, Card, CheckRing, Failed, Field, Press, R, Row, Screen, Section, shortDay, Skeleton, SP, t, useAspect } from '@/aspects/kit';
import { newId, useCollection, useGet } from '@/lib/mod';
import { C } from '@/theme';
import { askNora, errText, goalWords, inDays, jarWords, longDay, names, refresh, useAi, whenDay, yearsWords } from './data';
import type { DateView, Goal, Jar, MomentBrief, NoraPlan, PlanDoc, Step } from './types';
import { G, LinkRow, Photo } from './ui';

// One date, planned ahead: the idea, a short checklist, Nora's proposals, and for the anniversary its Mission goal
// and Money jar. After the day it asks for a memory of it.

const KIND_WORD: Record<Step['kind'], string> = { book: 'To book', buy: 'To buy', involve: 'Who to involve', do: 'To do' };

export function DateScreen({ open, onClose, id, goals, jars, goalsAt, jarsAt, onMemory, onOpenMemory, notice, openAspect }: {
  open: boolean; onClose: () => void; id: string | null; goals: Goal[]; jars: Jar[]; goalsAt: number; jarsAt: number;
  onMemory: (p: { people: string[]; date: string; title: string }) => void; onOpenMemory: (m: MomentBrief) => void;
  notice: (t: string) => void; openAspect: (k: 'mission' | 'money') => void;
}) {
  const { color } = useAspect();
  const v = useGet<DateView>(id && open ? `/mod/family/date/${encodeURIComponent(id)}` : null);
  const plans = useCollection<PlanDoc>('people', 'plans');
  const nora = useAi(`date:${id}`);
  const [local, setLocal] = useState<{ for: DateView | null; plan: PlanDoc | null }>({ for: null, plan: null });
  const [own, setOwn] = useState('');
  const [step, setStep] = useState('');
  const data = v.data && v.data.date.id === id ? v.data : null;
  if (data !== local.for) setLocal({ for: data, plan: null }); // a fresh answer from the PC replaces what was shown early
  const plan = local.plan ?? data?.plan ?? null;

  const save = (change: Partial<PlanDoc>) => {
    if (!data?.date.on) return;
    const on = data.date.on;
    const cur: PlanDoc = plan ?? {
      id: `plan-${data.date.id}-${on.slice(0, 4)}`, title: data.date.title, people: data.date.people.map((p) => p.id), aspect: 'family',
      date: on, for_date: data.date.id, year: Number(on.slice(0, 4)), state: 'tentative', idea: null, steps: [],
    };
    const { created_at: _c, updated_at: _u, deleted_at: _d, ...base } = cur;
    const next = { ...base, ...change, id: base.id };
    setLocal({ for: data, plan: next });
    void plans.put(next).then(() => refresh()).catch((e) => { setLocal({ for: data, plan: null }); notice(`Couldn't save the plan: ${errText(e)}`); });
  };
  const steps = plan?.steps ?? [];
  const toggle = (sid: string) => save({ steps: steps.map((x) => (x.id === sid ? { ...x, done: !x.done } : x)) });
  const addStep = () => { if (!step.trim()) return; save({ steps: [...steps, { id: newId('st'), title: step.trim(), kind: 'do', done: false }] }); setStep(''); };
  const dropStep = (sid: string) => { save({ steps: steps.filter((x) => x.id !== sid) }); notice('Step removed'); };
  const pickNora = (n: NoraPlan) => {
    const have = new Set(steps.map((x) => x.title.toLowerCase()));
    save({ idea: n.title, idea_from: 'nora', steps: [...steps, ...n.steps.filter((x) => !have.has(x.title.toLowerCase())).map((x) => ({ id: newId('st'), title: x.title, kind: x.kind, done: false }))] });
  };
  const anniversary = data?.date.kind === 'anniversary';
  const linkedGoals = anniversary ? goals.filter((g) => /anniversary/i.test(g.title)) : [];
  const linkedJars = jars.filter((j) => linkedGoals.some((g) => g.id === j.goal));

  return (
    <Screen open={open} onClose={onClose} title={data?.date.title ?? 'A date'}>
      {!data && v.error ? <Failed message={v.error} onRetry={v.refresh} /> : null}
      {!data && !v.error ? (
        <View style={s.skel}><Skeleton height={32} width="60%" /><Skeleton height={20} width="30%" /><Skeleton height={96} /><Skeleton height={56} /><Skeleton height={56} /></View>
      ) : null}
      {data ? (
        <>
          <View style={s.hero}>
            <Text style={t.title2}>{data.date.on ? longDay(data.date.on) : data.lastOn ? longDay(data.lastOn) : 'Passed'}</Text>
            {data.date.days != null ? <Text style={[t.lead, data.date.days <= 21 ? { color } : null]}>{inDays(data.date.days)}</Text> : null}
            <Text style={t.small}>{[names(data.date.people.map((p) => p.name)), yearsWords(data.date)].filter(Boolean).join(', ')}</Text>
          </View>

          {data.after && data.lastOn ? (
            <Card tone={color} style={s.after}>
              <Text style={t.strong}>{`It was ${data.after === 1 ? 'yesterday' : `${data.after} days ago`}. How was it?`}</Text>
              <Button label="Add a memory of it" kind="accent" small wrap={s.start} icon={<G name="photo" size={16} color="#14161C" />}
                onPress={() => onMemory({ people: data.date.people.map((p) => p.id), date: data.lastOn!, title: data.date.title })} />
            </Card>
          ) : null}

          {data.date.on ? (
            <Section title="The plan" gap={8}>
              {plan?.idea ? (
                <Card style={s.idea}>
                  <Text style={t.label}>The idea</Text>
                  <Text style={t.heading}>{plan.idea}</Text>
                  <LinkRow icon={<G name="swap" size={16} color={C.textSoft} />} label="Change the idea" onPress={() => save({ idea: null, idea_from: null })} />
                </Card>
              ) : (
                <>
                  <Text style={t.small}>Pick an idea, then a few things to get ready.</Text>
                  {data.ideas.map((i) => (
                    <Row key={i.id} title={i.title} sub={i.kind === 'gift' ? 'Something they mentioned' : 'One of your ideas'} onPress={() => save({ idea: i.title, idea_from: 'idea' })}
                      right={<Text style={[t.label, { color }]}>Pick</Text>} label={`Pick: ${i.title}`} />
                  ))}
                  <Field label="Or your own" value={own} onChangeText={setOwn} placeholder="Dinner at home with a cake" maxLength={80}
                    onSubmit={() => { if (own.trim()) { save({ idea: own.trim(), idea_from: 'own' }); setOwn(''); } }} />
                  {own.trim() ? <Button label="Use this idea" kind="soft" small wrap={s.start} onPress={() => { save({ idea: own.trim(), idea_from: 'own' }); setOwn(''); }} /> : null}
                </>
              )}
            </Section>
          ) : null}

          {data.date.on ? (
            <Section title="Get ready" gap={4}>
              {steps.map((x) => (
                <Press key={x.id} label={`${x.title}. ${x.done ? 'Ready, tap to undo' : 'Tap when ready'}. Hold to remove`} role="checkbox" state={{ checked: x.done }}
                  onPress={() => toggle(x.id)} onLongPress={() => dropStep(x.id)} feel={x.done ? 'light' : 'medium'} style={s.step} scale={0.98}>
                  <Row title={x.title} sub={KIND_WORD[x.kind] ?? 'To do'} onToggle={undefined} left={<CheckRing done={x.done} />} style={s.stepRow} />
                </Press>
              ))}
              {!steps.length ? <Text style={[t.small, s.pad]}>What to book, what to buy, who else to bring in.</Text> : null}
              <Field value={step} onChangeText={setStep} placeholder="Add a step" maxLength={80} onSubmit={addStep} />
            </Section>
          ) : null}

          {data.date.on ? (
            <Section title="Ideas from Nora" gap={12}>
              {nora.busy ? (
                <View style={s.busy} accessibilityLiveRegion="polite">
                  <ActivityIndicator color={color} />
                  <Text style={[t.small, s.flex]}>Nora is thinking. It takes up to a minute, and you can leave this page.</Text>
                </View>
              ) : null}
              {!nora.busy && data.nora ? data.nora.ideas.map((n) => {
                const chosen = plan?.idea === n.title;
                return (
                  <Card key={n.title} style={s.noraCard} tone={chosen ? color : undefined}>
                    <Text style={t.strong}>{n.title}</Text>
                    {n.why ? <Text style={t.small}>{n.why}</Text> : null}
                    <View style={s.noraSteps}>{n.steps.map((x) => <Text key={x.title} style={[t.small, { color: C.textSoft }]}>{x.title}</Text>)}</View>
                    {chosen ? <Text style={[t.label, { color }]}>In your plan</Text> : <Button label="Use this" kind="soft" small wrap={s.start} onPress={() => pickNora(n)} />}
                  </Card>
                );
              }) : null}
              {!nora.busy && !data.nora ? <Text style={t.small}>Nora can propose plans and a checklist from what they mentioned and what you did last time. You decide.</Text> : null}
              {nora.error ? <Text style={[t.small, { color: C.danger }]}>{nora.error}</Text> : null}
              {!nora.busy ? (
                <View style={s.noraFoot}>
                  <Button label={data.nora ? 'Ask again' : 'Ask Nora'} kind={data.nora ? 'quiet' : 'soft'} small icon={<G name="sparkle" size={16} color={data.nora ? C.text : color} />}
                    onPress={() => void askNora(`date:${data.date.id}`, `/mod/family/date/${encodeURIComponent(data.date.id)}/ideas`)} />
                  {data.nora ? <Text style={t.caption}>{`From ${shortDay(data.nora.made_at.slice(0, 10))}`}</Text> : null}
                </View>
              ) : null}
            </Section>
          ) : null}

          {linkedGoals.length || linkedJars.length ? (
            <Section title="Building up to it">
              <Card style={s.links}>
                {linkedGoals.map((g) => (
                  <Press key={g.id} label={`${g.title}. Open in Mission`} onPress={() => openAspect('mission')} style={s.linkItem}>
                    <Text style={t.strong}>{g.title}</Text>
                    {g.progress != null && g.progress > 0 ? <Bar progress={g.progress / 100} height={4} /> : null}
                    <Text style={[t.caption, t.num]}>{[goalWords(g, goalsAt), 'Mission'].filter(Boolean).join(', ')}</Text>
                  </Press>
                ))}
                {linkedJars.map((j) => (
                  <Press key={j.id} label={`${j.name}. Open in Money`} onPress={() => openAspect('money')} style={s.linkItem}>
                    <Text style={t.strong}>{j.name}</Text>
                    {j.pct != null ? <Bar progress={j.pct} height={4} /> : null}
                    <Text style={[t.caption, t.num]}>{`${jarWords(j, jarsAt)}, Money`}</Text>
                  </Press>
                ))}
              </Card>
            </Section>
          ) : null}

          {data.past.length ? (
            <Section title="Last time" gap={4}>
              {data.past.map((m) => (
                <Press key={m.id} label={`${m.note ?? m.title ?? 'A memory'}, ${whenDay(m.date)}`} onPress={() => onOpenMemory(m)} style={s.past}>
                  {m.photo ? <Photo id={m.photo} style={s.thumb} /> : null}
                  <View style={s.flex}>
                    <Text numberOfLines={2} style={t.strong}>{m.note ?? m.title}</Text>
                    <Text style={t.small}>{shortDay(m.date)} {m.date.slice(0, 4)}</Text>
                  </View>
                </Press>
              ))}
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pad: { paddingVertical: SP[8] },
  skel: { gap: 16 },
  hero: { gap: 4 },
  after: { gap: 12 },
  start: { alignSelf: 'flex-start' },
  idea: { gap: 4 },
  step: {},
  stepRow: { minHeight: 56 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  noraCard: { gap: 8 },
  noraSteps: { gap: 2 },
  noraFoot: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  links: { gap: 0, paddingVertical: 4 },
  linkItem: { gap: 8, paddingVertical: 12 },
  past: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  thumb: { width: 48, height: 48, borderRadius: R.inner + 4 },
});
