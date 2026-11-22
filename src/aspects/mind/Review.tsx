import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Button, Card, Chip, Divider, Failed, IconButton, Icon, Screen, Section, Segmented, Skeleton, ago, dayLabel, timer, t, useAspect,
} from '@/aspects/kit';
import { call, fileSource, invalidate, useGet } from '@/lib/mod';
import { C } from '@/theme';
import { usePlayer } from './recorder';
import type { DimKey, Take, TakeSpec } from './types';
import { Quote, ScoreRow, Steps, Sym, useLast, usePoll } from './ui';

const DIM_NAME: Record<DimKey, string> = { structure: 'Structure', clarity: 'Clarity', focus: 'On topic', words: 'Word choice', economy: 'Economy', fillers: 'Fillers' };
const ORDER: DimKey[] = ['structure', 'clarity', 'focus', 'words', 'economy', 'fillers'];
const busy = (s?: string) => s === 'transcribing' || s === 'reviewing';

/** The same topic again, as a new take. */
export function specOf(take: Take): TakeSpec {
  return { kind: take.kind, topic: take.topic, label: take.topic_label, topicKind: take.topic_kind ?? undefined, drill: take.drill ?? undefined, source: take.source ?? undefined };
}

/** Where a take is: the wait, a failure with Try again, too short, or the review itself. */
export function TakeState({ take, onRetry, retrying }: { take: Take; onRetry: () => void; retrying?: boolean }) {
  if (take.status === 'reviewed' && take.review) return null;
  if (take.status === 'short') {
    return (
      <Card>
        <View style={s.gap8}>
          <Text style={t.lead}>Too short to review</Text>
          <Text style={t.small}>{`That was ${take.secs ? `${take.secs} seconds` : 'a few words'}. A review needs a few sentences: aim for a minute.`}</Text>
          {take.transcript ? <Text style={t.body} selectable>{take.transcript}</Text> : null}
        </View>
      </Card>
    );
  }
  const failed = take.status === 'failed';
  const heard = !!take.transcript || take.status === 'reviewing' || take.failed_step === 'review';
  return (
    <Card>
      <View style={s.gap16}>
        <Steps items={[
          { label: 'Saved on your PC', state: 'done' },
          { label: 'Writing down what you said', state: heard ? 'done' : failed ? 'failed' : 'now', note: !heard && failed ? take.error : null },
          { label: 'Reviewing', state: take.failed_step === 'review' ? 'failed' : take.status === 'reviewing' ? 'now' : 'next', note: take.failed_step === 'review' ? take.error : null },
        ]} />
        {failed ? <Button label="Try again" kind="quiet" small onPress={onRetry} busy={retrying} wrap={s.start} />
          : <Text style={t.small}>Usually under a minute. You can leave: the review will be on Mind when it&apos;s ready.</Text>}
      </View>
    </Card>
  );
}

/** The review: overall, each dimension, his strongest line, one fix, the tighter version, fillers, the recording. */
export function ReviewBody({ take }: { take: Take }) {
  const a = useAspect();
  const r = take.review!;
  const [view, setView] = useState<'tight' | 'said'>('tight');
  const extra = [r.grasp ? { name: take.kind === 'learned' ? 'Grasp of what you learned' : 'Grasp', c: r.grasp } : null,
    r.pattern ? { name: 'The pattern', c: r.pattern } : null].filter(Boolean) as { name: string; c: { score: number; note: string } }[];
  return (
    <View style={s.gap24}>
      <View style={s.overall} accessibilityLabel={`Overall ${r.overall} out of 100`}>
        <Text style={[t.display, t.num, { color: a.color }]}>{r.overall}</Text>
        <View style={s.overallText}>
          <Text style={t.strong}>Overall</Text>
          <Text style={t.caption}>{`Out of 100 on rubric ${r.rubric}`}</Text>
        </View>
      </View>

      <Section title="Your strongest line">
        <Quote>{r.strongest}</Quote>
      </Section>

      <Card tone={a.color}>
        <View style={s.gap8}>
          <Text style={[t.label, { color: a.color }]}>Fix next time</Text>
          <Text style={t.lead}>{r.fix}</Text>
        </View>
      </Card>

      <Section title="Said tighter">
        <Segmented options={[{ key: 'tight', label: 'Tighter' }, { key: 'said', label: 'What you said' }] as const} value={view} onChange={setView} />
        <Text style={[t.body, s.read]} selectable>{view === 'tight' ? r.rewrite : take.transcript}</Text>
        <Text style={t.caption}>{view === 'tight' ? 'Your ideas, fewer words. Nothing added.' : `${take.words ?? ''} words in ${take.secs ? timer(take.secs) : 'this take'}`.trim()}</Text>
      </Section>

      <Section title="How it scored">
        <View style={s.gap16}>
          {ORDER.map((k) => <ScoreRow key={k} name={DIM_NAME[k]} value={r.scores[k]} note={r.notes[k]} />)}
        </View>
      </Section>

      {extra.length ? (
        <Section title="Checked against">
          <View style={s.gap16}>{extra.map((x) => <ScoreRow key={x.name} name={x.name} value={x.c.score} note={x.c.note} />)}</View>
        </Section>
      ) : null}

      <Section title="Fillers">
        {r.fillers.length ? (
          <View style={s.chips}>{r.fillers.map((f) => <Chip key={f.word} label={`${f.word} ${f.count}`} />)}</View>
        ) : <Text style={t.small}>None heard in this take.</Text>}
        <Text style={[t.small, t.num]}>{`${r.fpm} a minute`}</Text>
        <Text style={t.caption}>Counted from the written take. Some little sounds are left out when it is written down.</Text>
      </Section>

      <Player take={take} />
    </View>
  );
}

function Player({ take }: { take: Take }) {
  const src = take.file ? fileSource(`/mod/mind/takes/${take.id}/audio`) : null;
  const p = usePlayer(src);
  if (!p.available || !src) return null;
  const total = p.duration || take.secs || 0;
  return (
    <View style={s.player}>
      <IconButton label={p.playing ? 'Pause the take' : 'Play the take'} onPress={p.toggle}>
        <Icon name={p.playing ? 'pause' : 'play'} size={18} />
      </IconButton>
      <View style={s.flex}>
        <Text style={t.strong}>Your take</Text>
        <Text style={[t.caption, t.num]}>{p.playing || p.at > 0 ? `${timer(p.at)} of ${timer(total)}` : timer(total)}</Text>
      </View>
    </View>
  );
}

/** One take, on its own screen: from the Speak list or from Mind home. */
export function ReviewScreen({ id, onClose, onAgain }: { id: string | null; onClose: () => void; onAgain: (spec: TakeSpec) => void }) {
  const a = useAspect();
  const shown = useLast(id);
  const g = useGet<{ item: Take }>(shown ? `/mod/mind/takes/${shown}` : null);
  const take = g.data?.item?.id === shown ? g.data.item : null;
  const [retrying, setRetrying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  usePoll(() => { void g.refresh().then(() => invalidate('/mod/mind/speak')); }, 2500, a.open && !!id && busy(take?.status));
  const retry = async () => {
    if (!take) return;
    setRetrying(true);
    try { await call(`/mod/mind/takes/${take.id}/retry`); await g.refresh(); } catch (e) { a.notice((e as Error).message); } finally { setRetrying(false); }
  };
  const remove = async () => {
    if (!take) return;
    setDeleting(true);
    try { await call(`/mod/mind/takes/${take.id}`, undefined, 'DELETE'); invalidate('/mod/mind/'); a.notice('Take deleted'); onClose(); }
    catch (e) { a.notice((e as Error).message); } finally { setDeleting(false); }
  };
  return (
    <Screen open={!!id} onClose={onClose} title="Review">
      {!take ? (g.error ? <Failed message={g.error} onRetry={g.refresh} /> : <View style={s.gap16}><Skeleton height={28} width="70%" /><Skeleton height={88} /><Skeleton height={160} /></View>) : (
        <>
          <View style={s.gap8}>
            <Text style={t.label}>{take.topic_label}</Text>
            <Text style={t.title2}>{take.topic}</Text>
            <Text style={t.caption}>{`${dayLabel(take.day)}, ${ago(take.at)}${take.secs ? `, ${timer(take.secs)} long` : ''}`}</Text>
          </View>
          <TakeState take={take} onRetry={retry} retrying={retrying} />
          {take.status === 'reviewed' && take.review ? <ReviewBody take={take} /> : null}
          <View style={s.gap12}>
            <Button label="Try this topic again" kind="primary" icon={<Icon name="mic" size={18} color={C.scene} />} onPress={() => onAgain(specOf(take))} />
            <Divider />
            <Button label="Delete this take" kind="danger" small onPress={remove} busy={deleting} icon={<Sym name="trash" size={16} color={C.danger} />} wrap={s.start} />
          </View>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  gap16: { gap: 16 },
  gap24: { gap: 24 },
  start: { alignSelf: 'flex-start' },
  overall: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  overallText: { paddingBottom: 4, gap: 2 },
  read: { color: C.textSoft },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
