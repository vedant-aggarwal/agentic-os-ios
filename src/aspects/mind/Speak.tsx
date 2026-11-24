import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  Block, Button, Failed, Group, Icon, IconButton, Item, Lead, Screen, Skeleton, Spark, Tag, dayLabel, num, t, useAspect,
} from '@/aspects/kit';
import { call, invalidate, useGet } from '@/lib/mod';
import { C } from '@/theme';
import { useNav } from './nav';
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

/** One take in a list: the topic, when, how long, and its score or where it is. */
export function TakeRow({ take, onPress }: { take: TakeLite; onPress: () => void }) {
  const a = useAspect();
  const word = takeWord(take);
  const scored = take.status === 'reviewed' && take.overall != null;
  const working = take.status === 'transcribing' || take.status === 'reviewing';
  return (
    <Item title={take.topic} sub={`${dayLabel(take.day)}${take.secs ? `, ${secsWords(take.secs)}` : ''}`} onPress={onPress} chevron
      label={`${take.topic}, ${scored ? `scored ${word}` : word}`}
      right={working ? <ActivityIndicator size="small" color={a.color} />
        : <Text style={[scored ? t.headline : t.footnote, t.num, take.status === 'failed' && { color: C.danger }]}>{word}</Text>} />
  );
}

/**
 * Speak: today's topic is one tap from a take (think, talk, review). What he learned is there to say back, the drills
 * teach one pattern each, and every take is scored on the same rubric so the numbers compare.
 */
export function SpeakTab({ active }: { active: boolean }) {
  const a = useAspect();
  const nav = useNav();
  const [seen, setSeen] = useState(active);
  if (active && !seen) setSeen(true);
  const g = useGet<SpeakView>(a.open && seen ? SPEAK : null);
  const v = g.data;
  const [another, setAnother] = useState(false);
  usePoll(() => { void g.refresh(); }, 4000, a.open && active && !!v?.pending.length);
  const next = async () => {
    setAnother(true);
    try { await call(`/mod/mind/topics/next`); invalidate('/mod/mind/'); } catch (e) { a.notice((e as Error).message); } finally { setAnother(false); }
  };
  if (!v) return g.error ? <Failed message={g.error} onRetry={g.refresh} /> : <SpeakSkeleton />;
  return (
    <>
      <Lead>
        <Text style={[t.footnote, { color: a.color }]}>{`Today's topic, ${v.topic.label.toLowerCase()}`}</Text>
        <View style={s.gap4}>
          <Text style={t.title3}>{v.topic.text}</Text>
          {v.topic.from ? <Text style={t.footnote}>{`Made from ${v.topic.from.title}`}</Text> : null}
        </View>
        <Text style={t.footnote}>Fifteen seconds to think, then about a minute. It stops at two.</Text>
        <View style={s.buttons}>
          <Button label="Start" kind="accent" wrap={s.flex} icon={<Icon name="mic" size={18} color="#14161C" />}
            onPress={() => nav.take({ kind: 'impromptu', topic: v.topic.text, label: v.topic.label, topicId: v.topic.id, topicKind: v.topic.kind })} />
          <Button label="Another" kind="quiet" onPress={() => { void next(); }} busy={another} icon={<Sym name="again" size={16} />} />
        </View>
      </Lead>

      {v.pending.length ? (
        <Group>
          {v.pending.map((p) => (
            <Item key={p.id} title={p.status === 'transcribing' ? 'Writing down your take' : 'Reviewing your take'} sub={p.topic} onPress={() => nav.openReview(p.id)}
              left={<ActivityIndicator color={a.color} />} chevron />
          ))}
        </Group>
      ) : null}

      {v.learned.length ? (
        <Block title="Say what you learned" sub="Explaining it back is how it sticks.">
          <Group>
            {v.learned.map((l) => (
              <Item key={l.source.id} title={l.text} lines={3} sub={l.line ? `You wrote: ${l.line}` : `From ${l.source.title}`}
                action={(
                  <IconButton label={`Say it: ${l.text}`} size={40} onPress={() => nav.take({ kind: 'learned', topic: l.text, label: 'Say what you learned', source: l.source })}>
                    <Icon name="mic" size={18} color={a.color} />
                  </IconButton>
                )} />
            ))}
          </Group>
        </Block>
      ) : null}

      <Block title="Drills" sub="One pattern each, with a prompt to try it on.">
        <Group>
          {v.drills.map((d) => (
            <Item key={d.id} title={d.name} sub={d.lines[0]} onPress={() => nav.openDrill(d.id)} chevron
              value={d.done ? (d.done === 1 ? 'Once' : `${d.done} times`) : undefined} />
          ))}
        </Group>
      </Block>

      <Scores v={v} />

      <Block title="Your takes" sub={v.takes.length ? null : 'Each take you record lands here with its review.'}>
        {v.takes.length ? <Group>{v.takes.map((tk) => <TakeRow key={tk.id} take={tk} onPress={() => nav.openReview(tk.id)} />)}</Group> : null}
      </Block>
    </>
  );
}

/** How the speaking scores: each part now against before, fillers over time, the days practised this week. */
function Scores({ v }: { v: SpeakView }) {
  const a = useAspect();
  const p = v.progress;
  const fpm = p.trend.map((x) => x.fpm);
  const overall = p.trend.map((x) => x.overall);
  const practised = p.days_this_week ? `Practised ${p.days_this_week === 1 ? 'one day' : `${p.days_this_week} days`} this week` : 'Not practised yet this week';
  if (p.reviewed === 0) {
    return (
      <Block title="How you score" sub={practised}>
        <Group pad>
          <Text style={t.footnote}>Scores show after your first review. Each take is scored on the same fixed rubric, so the numbers compare over time.</Text>
        </Group>
      </Block>
    );
  }
  const last = overall.at(-1) ?? null;
  const d = overall.length >= 2 ? overall[overall.length - 1] - overall[0] : null;
  return (
    <Block title="How you score" sub={practised}>
      <Group pad>
        <View style={s.between}>
          <View style={s.gap2}>
            <Text style={t.footnote}>Overall, latest take</Text>
            <Text style={[t.large, t.num]}>{last ?? 'None'}</Text>
          </View>
          {d != null ? <Tag label={d === 0 ? `Level over ${overall.length}` : `${d > 0 ? 'Up' : 'Down'} ${Math.abs(d)} over ${overall.length}`} tone={d > 0 ? 'aspect' : 'neutral'} /> : null}
        </View>
        {overall.length >= 2 ? <Spark values={overall} width={a.width - 64} height={48} minSpan={20} color={a.color} /> : null}
        <Text style={t.footnote}>{`Your last ${Math.min(5, p.reviewed)} reviewed takes${p.reviewed > 5 ? ', against the ones before' : ''}.`}</Text>
        {p.dims.map((dm) => <ScoreRow key={dm.key} name={dm.name} value={dm.now} before={dm.before} />)}
      </Group>
      {fpm.length >= 2 ? (
        <Group pad>
          <View style={s.between}>
            <Text style={t.callout}>Fillers a minute</Text>
            <Text style={[t.headline, t.num]}>{num(fpm[fpm.length - 1])}</Text>
          </View>
          <Spark values={fpm} width={a.width - 64} height={48} minSpan={2} color={a.color} />
          <Text style={[t.footnote, t.num]}>{`From ${num(fpm[0])} to ${num(fpm[fpm.length - 1])} over your last ${fpm.length} takes`}</Text>
        </Group>
      ) : null}
    </Block>
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
          <Block title="The pattern">
            <Group inset={56}>
              {d.steps.map((st, n) => (
                <Item key={`${st}${n}`} title={st} left={<View style={[s.stepN, { borderColor: a.color }]}><Text style={[t.footnote, t.num, { color: a.color }]}>{n + 1}</Text></View>} />
              ))}
            </Group>
            <Text style={t.subhead}>{`${d.lines[0]} ${d.lines[1]}`}</Text>
          </Block>
          <Lead>
            <Text style={[t.footnote, { color: a.color }]}>Your prompt</Text>
            <Text style={t.title3}>{prompt}</Text>
            <View style={s.buttons}>
              <Button label="Start" kind="accent" icon={<Icon name="mic" size={18} color="#14161C" />} wrap={s.flex}
                onPress={() => onStart({ kind: 'drill', topic: prompt, label: d.name, drill: d.id }, d.steps)} />
              {prompts.length > 1 ? <Button label="Another" kind="quiet" icon={<Sym name="again" size={16} />} onPress={() => setI((x) => x + 1)} /> : null}
            </View>
          </Lead>
          <Text style={t.footnote}>The review scores the six usual parts and how well you followed these steps.</Text>
        </>
      ) : null}
    </Screen>
  );
}

function SpeakSkeleton() {
  return (
    <View style={s.gap16}>
      <Skeleton height={220} radius={28} />
      <Skeleton height={180} radius={22} />
      <Skeleton height={240} radius={22} />
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap2: { gap: 2 },
  gap4: { gap: 4 },
  gap16: { gap: 16 },
  buttons: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  stepN: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
