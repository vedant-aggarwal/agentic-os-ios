import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Bar, Block, Button, dayOf, Failed, Field, Group, Item, Lead, Press, Screen, shortDay, Skeleton, t, undoable, useAspect } from '@/aspects/kit';
import { openLink } from '@/lib/links';
import { newId, useCollection, useGet } from '@/lib/mod';
import { C } from '@/theme';
import { askNora, errText, goalWords, inDays, jarWords, longDay, names, refresh, useAi, whenDay, yearsWords } from './data';
import type { DateView, Goal, Jar, MomentBrief, NoraPlan, PlanDoc, Step } from './types';
import { CheckRow, G, Photo } from './ui';

// One date, planned ahead: the idea, a short checklist, Nora's proposals, and for the anniversary its Mission goal
// and Money jar. After the day it asks for a memory of it.

const KIND_WORD: Record<Step['kind'], string> = { book: 'To book', buy: 'To buy', involve: 'Who to involve', do: 'To do' };

export function DateScreen({ open, onClose, id, goals, jars, goalsAt, jarsAt, onMemory, onOpenMemory, notice }: {
  open: boolean; onClose: () => void; id: string | null; goals: Goal[]; jars: Jar[]; goalsAt: number; jarsAt: number;
  onMemory: (p: { people: string[]; date: string; title: string }) => void; onOpenMemory: (m: MomentBrief) => void;
  notice: (t: string) => void;
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
  const dropStep = (sid: string) => {
    const at = steps.findIndex((x) => x.id === sid);
    const gone = steps[at];
    if (!gone) return;
    save({ steps: steps.filter((x) => x.id !== sid) });
    undoable(`Removed: ${gone.title}`, () => { const now = plan?.steps ?? []; save({ steps: [...now.slice(0, at), gone, ...now.slice(at)].filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i) }); });
  };
  const pickNora = (n: NoraPlan) => {
    const have = new Set(steps.map((x) => x.title.toLowerCase()));
    save({ idea: n.title, idea_from: 'nora', steps: [...steps, ...n.steps.filter((x) => !have.has(x.title.toLowerCase())).map((x) => ({ id: newId('st'), title: x.title, kind: x.kind, done: false }))] });
  };
  const anniversary = data?.date.kind === 'anniversary';
  const linkedGoals = anniversary ? goals.filter((g) => /anniversary/i.test(g.title)) : [];
  const linkedJars = jars.filter((j) => linkedGoals.some((g) => g.id === j.goal));
  const ready = steps.filter((x) => x.done).length;

  return (
    <Screen open={open} onClose={onClose} title={data?.date.title ?? 'A date'}>
      {!data && v.error ? <Failed message={v.error} onRetry={v.refresh} /> : null}
      {!data && !v.error ? (
        <View style={s.skel}><Skeleton height={32} width="60%" /><Skeleton height={20} width="30%" /><Skeleton height={112} radius={22} /><Skeleton height={160} radius={22} /></View>
      ) : null}
      {data ? (
        <>
          <View style={s.hero}>
            {data.date.days != null ? <Text style={[t.footnote, data.date.days <= 21 ? { color } : null]}>{inDays(data.date.days)}</Text> : null}
            <Text style={t.large}>{data.date.on ? longDay(data.date.on) : data.lastOn ? longDay(data.lastOn) : 'Passed'}</Text>
            <Text style={t.subhead}>{[names(data.date.people.map((p) => p.name)), yearsWords(data.date)].filter(Boolean).join(', ')}</Text>
          </View>

          {data.after && data.lastOn ? (
            <Lead>
              <Text style={[t.footnote, { color }]}>{data.after === 1 ? 'Yesterday' : `${data.after} days ago`}</Text>
              <Text style={t.title3}>How was it?</Text>
              <Text style={t.subhead}>A photo and a line now, while it is fresh. It comes back on the same day next year.</Text>
              <Button label="Add a memory of it" kind="accent" icon={<G name="photo" size={18} color="#14161C" />}
                onPress={() => onMemory({ people: data.date.people.map((p) => p.id), date: data.lastOn!, title: data.date.title })} />
            </Lead>
          ) : null}

          {data.date.on ? (
            <Block title="The plan" sub={plan?.idea ? null : 'Pick an idea, then a few things to get ready.'}>
              {plan?.idea ? (
                <Group pad>
                  <Text style={t.footnote}>The idea</Text>
                  <Text style={t.title3}>{plan.idea}</Text>
                  {steps.length ? (
                    <View style={s.gap8}>
                      <Bar progress={ready / steps.length} height={6} color={color} />
                      <Text style={[t.footnote, t.num]}>{`${ready} of ${steps.length} things ready`}</Text>
                    </View>
                  ) : null}
                  <Button label="Change the idea" kind="quiet" small wrap={s.start} icon={<G name="swap" size={16} color={C.textSoft} />}
                    onPress={() => save({ idea: null, idea_from: null })} />
                </Group>
              ) : (
                <>
                  {data.ideas.length ? (
                    <Group>
                      {data.ideas.map((i) => (
                        <Item key={i.id} title={i.title} sub={i.kind === 'gift' ? 'Something they mentioned' : 'One of your ideas'} onPress={() => save({ idea: i.title, idea_from: 'idea' })}
                          right={<Text style={[t.subhead, { color }]}>Pick</Text>} label={`Pick: ${i.title}`} />
                      ))}
                    </Group>
                  ) : null}
                  <Field label="Or your own" value={own} onChangeText={setOwn} placeholder="Dinner at home with a cake" maxLength={80}
                    onSubmit={() => { if (own.trim()) { save({ idea: own.trim(), idea_from: 'own' }); setOwn(''); } }} />
                  {own.trim() ? <Button label="Use this idea" kind="soft" small wrap={s.start} onPress={() => { save({ idea: own.trim(), idea_from: 'own' }); setOwn(''); }} /> : null}
                </>
              )}
            </Block>
          ) : null}

          {data.date.on ? (
            <Block title="Get ready" sub={steps.length ? 'Tap when ready. Hold to remove.' : null}>
              {steps.length ? (
                <Group inset={52}>
                  {steps.map((x) => (
                    <CheckRow key={x.id} title={x.title} sub={KIND_WORD[x.kind] ?? 'To do'} done={x.done} onPress={() => toggle(x.id)} onLongPress={() => dropStep(x.id)}
                      label={`${x.title}. ${x.done ? 'Ready, tap to undo' : 'Tap when ready'}. Hold to remove`} />
                  ))}
                </Group>
              ) : (
                <Group pad><Text style={t.footnote}>What to book, what to buy, who else to bring in.</Text></Group>
              )}
              <Field value={step} onChangeText={setStep} placeholder="Add a step" maxLength={80} onSubmit={addStep} />
            </Block>
          ) : null}

          {data.date.on ? (
            <Block title="Ideas from Nora" sub={data.nora && !nora.busy ? `From ${shortDay(dayOf(Date.parse(data.nora.made_at)))}` : null}>
              {nora.busy ? (
                <Group pad>
                  <View style={s.busy} accessibilityLiveRegion="polite">
                    <ActivityIndicator color={color} />
                    <Text style={[t.footnote, s.flex]}>Nora is thinking. It takes up to a minute, and you can leave this page.</Text>
                  </View>
                </Group>
              ) : null}
              {!nora.busy && data.nora ? data.nora.ideas.map((n) => {
                const chosen = plan?.idea === n.title;
                return (
                  <Group key={n.title} pad tone={chosen ? color : undefined}>
                    <Text style={t.headline}>{n.title}</Text>
                    {n.why ? <Text style={t.subhead}>{n.why}</Text> : null}
                    <View style={s.noraSteps}>{n.steps.map((x) => <Text key={x.title} style={t.footnote}>{`${KIND_WORD[x.kind] ?? 'To do'}: ${x.title}`}</Text>)}</View>
                    {chosen ? <Text style={[t.subhead, { color }]}>In your plan</Text> : <Button label="Use this" kind="soft" small wrap={s.start} onPress={() => pickNora(n)} />}
                  </Group>
                );
              }) : null}
              {!nora.busy && !data.nora ? (
                <Group pad><Text style={t.footnote}>Nora can propose plans and a checklist from what they mentioned and what you did last time. You decide.</Text></Group>
              ) : null}
              {nora.error ? <Text style={[t.footnote, { color: C.danger }]}>{nora.error}</Text> : null}
              {!nora.busy ? (
                <Button label={data.nora ? 'Ask again' : 'Ask Nora'} kind={data.nora ? 'quiet' : 'soft'} small wrap={s.start} icon={<G name="sparkle" size={16} color={data.nora ? C.text : color} />}
                  onPress={() => void askNora(`date:${data.date.id}`, `/mod/family/date/${encodeURIComponent(data.date.id)}/ideas`)} />
              ) : null}
            </Block>
          ) : null}

          {linkedGoals.length || linkedJars.length ? (
            <Block title="Building up to it" sub="From Mission and Money.">
              <Group>
                {linkedGoals.map((g) => (
                  <Press key={g.id} label={`${g.title}. Open in Mission`} onPress={() => openLink(`mission/goal/${encodeURIComponent(g.id)}`)} style={s.linkItem} scale={0.99}>
                    <Text style={t.callout}>{g.title}</Text>
                    {g.progress != null && g.progress >= 1 ? <Bar progress={Math.min(1, g.progress / 100)} height={4} /> : null}
                    <Text style={[t.footnote, t.num]}>{[goalWords(g, goalsAt), 'Mission'].filter(Boolean).join(', ')}</Text>
                  </Press>
                ))}
                {linkedJars.map((j) => (
                  <Press key={j.id} label={`${j.name}. Open in Money`} onPress={() => openLink('money/save')} style={s.linkItem} scale={0.99}>
                    <Text style={t.callout}>{j.name}</Text>
                    {j.pct != null ? <Bar progress={j.pct} height={4} /> : null}
                    <Text style={[t.footnote, t.num]}>{`${jarWords(j, jarsAt)}, Money`}</Text>
                  </Press>
                ))}
              </Group>
            </Block>
          ) : null}

          {data.past.length ? (
            <Block title="Last time">
              <Group inset={data.past.some((m) => m.photo) ? 76 : 16}>
                {data.past.map((m) => (
                  <Item key={m.id} title={m.note ?? m.title ?? 'A memory'} sub={`${shortDay(m.date)} ${m.date.slice(0, 4)}`} onPress={() => onOpenMemory(m)}
                    label={`${m.note ?? m.title ?? 'A memory'}, ${whenDay(m.date)}`} left={m.photo ? <Photo id={m.photo} style={s.thumb} /> : undefined} />
                ))}
              </Group>
            </Block>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap8: { gap: 8 },
  skel: { gap: 16 },
  hero: { gap: 4 },
  start: { alignSelf: 'flex-start' },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  noraSteps: { gap: 4 },
  linkItem: { gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  thumb: { width: 48, height: 48, borderRadius: 12 },
});
