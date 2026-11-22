import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Button, Card, Failed, Icon, Row, Screen, Section, Skeleton, Spark, dayLabel, num, t, useAspect,
} from '@/aspects/kit';
import { call, invalidate, useGet } from '@/lib/mod';
import { C } from '@/theme';
import type { Drill, SpeakView, TakeLite, TakeSpec } from './types';
import { ScoreRow, Sym, secsWords, useLast, usePoll } from './ui';

export const SPEAK = '/mod/mind/speak';

/** A take's state in a few words, for lists. */
export function takeWord(t: TakeLite) {
  if (t.status === 'reviewed' && t.overall != null) return String(t.overall);
  if (t.status === 'transcribing') return 'Writing down';
  if (t.status === 'reviewing') return 'Reviewing';
  if (t.status === 'short') return 'Too short';
  return 'Try again';
}

export function TakeRow({ take, onPress }: { take: TakeLite; onPress: () => void }) {
  const a = useAspect();
  const word = takeWord(take);
  const scored = take.status === 'reviewed' && take.overall != null;
  return (
    <Row title={take.topic} sub={`${dayLabel(take.day)}${take.secs ? `, ${secsWords(take.secs)}` : ''}`} onPress={onPress} chevron
      label={`${take.topic}, ${scored ? `scored ${word}` : word}`}
      right={<Text style={[scored ? t.strong : t.label, t.num, take.status === 'failed' && { color: C.danger }, scored && { color: a.color }]}>{word}</Text>} />
  );
}

export function SpeakScreen({ open, onClose, onTake, onReview, onDrill }: {
  open: boolean; onClose: () => void; onTake: (spec: TakeSpec) => void; onReview: (id: string) => void; onDrill: (id: string) => void;
}) {
  const a = useAspect();
  const g = useGet<SpeakView>(open ? SPEAK : null);
  const v = g.data;
  const [another, setAnother] = useState(false);
  usePoll(() => { void g.refresh(); }, 4000, open && !!v?.pending.length);
  const next = async () => {
    setAnother(true);
    try { await call(`/mod/mind/topics/next`); invalidate('/mod/mind/'); } catch (e) { a.notice((e as Error).message); } finally { setAnother(false); }
  };
  return (
    <Screen open={open} onClose={onClose} title="Speak">
      {!v ? (g.error ? <Failed message={g.error} onRetry={g.refresh} /> : <SpeakSkeleton />) : (
        <>
          <Card>
            <View style={s.gap12}>
              <Text style={[t.label, { color: a.color }]}>{`Today's topic, ${v.topic.label.toLowerCase()}`}</Text>
              <Text style={t.title2}>{v.topic.text}</Text>
              {v.topic.from ? <Text style={t.small}>{`Made from ${v.topic.from.title}`}</Text> : null}
              <View style={s.buttons}>
                <Button label="Start" kind="accent" onPress={() => onTake({ kind: 'impromptu', topic: v.topic.text, label: v.topic.label, topicId: v.topic.id, topicKind: v.topic.kind })}
                  icon={<Icon name="mic" size={18} color="#14161C" />} wrap={s.flex} />
                <Button label="Another" kind="quiet" onPress={next} busy={another} icon={<Sym name="again" size={16} />} />
              </View>
            </View>
          </Card>

          {v.learned.length ? (
            <Section title="Say what you learned">
              <View>
                {v.learned.map((l) => (
                  <Row key={l.source.id} title={l.text} sub={l.line ? `You wrote: ${l.line}` : 'From a lesson you finished'}
                    onPress={() => onTake({ kind: 'learned', topic: l.text, label: 'Say what you learned', source: l.source })}
                    right={<Icon name="mic" size={18} color={a.color} />} />
                ))}
              </View>
            </Section>
          ) : null}

          <Section title="Drills">
            <View>
              {v.drills.map((d) => (
                <Row key={d.id} title={d.name} sub={d.lines[0]} onPress={() => onDrill(d.id)} chevron
                  right={d.done ? <Text style={[t.label, t.num]}>{d.done === 1 ? 'Once' : `${d.done} times`}</Text> : undefined} />
              ))}
            </View>
          </Section>

          <Progress v={v} />

          <Section title="Your takes">
            {v.takes.length ? (
              <View>{v.takes.map((tk) => <TakeRow key={tk.id} take={tk} onPress={() => onReview(tk.id)} />)}</View>
            ) : <Text style={t.small}>Each take you record lands here with its review.</Text>}
          </Section>
        </>
      )}
    </Screen>
  );
}

function Progress({ v }: { v: SpeakView }) {
  const a = useAspect();
  const p = v.progress;
  const fpm = p.trend.map((x) => x.fpm);
  return (
    <Section title="Progress">
      {p.reviewed === 0 ? (
        <Text style={t.small}>Scores show after your first review. Each one is on the same fixed rubric, so the numbers compare over time.</Text>
      ) : (
        <View style={s.gap16}>
          <Text style={t.small}>{`Your last ${Math.min(5, p.reviewed)} reviewed takes${p.reviewed > 5 ? `, against the ${p.reviewed >= 10 ? 'five' : p.reviewed === 6 ? 'one' : String(p.reviewed - 5)} before` : ''}.`}</Text>
          {p.dims.map((d) => <ScoreRow key={d.key} name={d.name} value={d.now} before={d.before} />)}
          {fpm.length >= 2 ? (
            <Card>
              <View style={s.gap8}>
                <View style={s.between}>
                  <Text style={t.strong}>Fillers a minute</Text>
                  <Text style={[t.strong, t.num, { color: a.color }]}>{num(fpm[fpm.length - 1])}</Text>
                </View>
                <Spark values={fpm} width={a.width - 64} height={56} />
                <Text style={t.caption}>{`From ${num(fpm[0])} to ${num(fpm[fpm.length - 1])} over your last ${fpm.length} takes`}</Text>
              </View>
            </Card>
          ) : null}
        </View>
      )}
      <Text style={[t.small, t.num]}>{p.days_this_week ? `Practised ${p.days_this_week === 1 ? 'one day' : `${p.days_this_week} days`} this week` : 'Not practised yet this week'}</Text>
    </Section>
  );
}

/** One drill: the pattern, a prompt, Start. */
export function DrillScreen({ id, onClose, onStart }: { id: string | null; onClose: () => void; onStart: (spec: TakeSpec, steps: string[]) => void }) {
  const a = useAspect();
  const g = useGet<SpeakView>(id ? SPEAK : null);
  const d = useLast<Drill>(g.data?.drills.find((x) => x.id === id) ?? null);
  const [i, setI] = useState(0);
  const prompts = d?.prompts ?? [];
  const at = prompts.length ? (prompts.indexOf(d!.prompt) + i) % prompts.length : 0;
  const prompt = prompts[at] ?? d?.prompt ?? '';
  return (
    <Screen open={!!id} onClose={onClose} title={d?.name ?? ''}>
      {d ? (
        <>
          <View style={s.gap16}>
            {d.steps.map((st, n) => (
              <View key={`${st}${n}`} style={s.step}>
                <View style={[s.stepN, { borderColor: a.color }]}><Text style={[t.label, t.num, { color: a.color }]}>{n + 1}</Text></View>
                <Text style={t.lead}>{st}</Text>
              </View>
            ))}
          </View>
          <View style={s.gap8}>
            <Text style={t.body}>{d.lines[0]}</Text>
            <Text style={t.body}>{d.lines[1]}</Text>
          </View>
          <Card>
            <View style={s.gap12}>
              <Text style={[t.label, { color: a.color }]}>Your prompt</Text>
              <Text style={t.title2}>{prompt}</Text>
              <View style={s.buttons}>
                <Button label="Start" kind="accent" icon={<Icon name="mic" size={18} color="#14161C" />} wrap={s.flex}
                  onPress={() => onStart({ kind: 'drill', topic: prompt, label: d.name, drill: d.id }, d.steps)} />
                {prompts.length > 1 ? <Button label="Another" kind="quiet" icon={<Sym name="again" size={16} />} onPress={() => setI((x) => x + 1)} /> : null}
              </View>
            </View>
          </Card>
          <Text style={t.small}>The review scores the six usual parts and how well you followed these steps.</Text>
        </>
      ) : null}
    </Screen>
  );
}

function SpeakSkeleton() {
  return (
    <View style={s.gap24}>
      <Skeleton height={196} radius={24} />
      <Skeleton height={20} width={120} />
      <Skeleton height={56} /><Skeleton height={56} /><Skeleton height={56} />
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  gap16: { gap: 16 },
  gap24: { gap: 24 },
  buttons: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepN: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
