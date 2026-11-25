import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  Block, Button, Chip, Failed, Field, Group, IconButton, Icon, Item, Screen, SegTabs, Skeleton, dayLabel, haptic, timer, t, undoable, useAspect,
} from '@/aspects/kit';
import { call, fileSource, invalidate, useGet } from '@/lib/mod';
import { C } from '@/theme';
import { useNav } from './nav';
import { usePlayer } from './recorder';
import type { DimKey, Moment, StageSpec, Take, TakeSpec } from './types';
import { Quote, ScoreRow, Steps, Sym, secsWords, useLast, usePoll } from './ui';
import { VideoPlayer, VideoPoster } from './Video';

const DIM_NAME: Record<DimKey, string> = { structure: 'Structure', clarity: 'Clarity', focus: 'On topic', words: 'Word choice', economy: 'Economy', fillers: 'Fillers' };
const ORDER: DimKey[] = ['structure', 'clarity', 'focus', 'words', 'economy', 'fillers'];
const busy = (s?: string) => s === 'saving' || s === 'transcribing' || s === 'reviewing';
const PACE = { slow: 'Slow', steady: 'Steady', fast: 'Fast', uneven: 'Uneven' } as const;

/** The same topic again, as a new take. */
export function specOf(take: Take): TakeSpec {
  return { kind: take.kind, topic: take.topic, label: take.topic_label, topicKind: take.topic_kind ?? undefined, drill: take.drill ?? undefined, source: take.source ?? undefined };
}
/** The same prompt again, on camera. */
const stageSpecOf = (take: Take): StageSpec => ({ mode: take.mode ?? 'topic', topic: take.topic, label: take.topic_label, topicKind: take.topic_kind, topicId: null });

/** Where a take is: the wait, a failure with Try again, too short, or the review itself. */
export function TakeState({ take, onRetry, retrying }: { take: Take; onRetry: () => void; retrying?: boolean }) {
  if (take.status === 'reviewed' && take.review) return null;
  if (take.status === 'short') {
    return (
      <Group pad>
        <Text style={t.headline}>Too short to review</Text>
        <Text style={t.subhead}>{`That was ${take.secs ? `${take.secs} seconds` : 'a few words'}. A review needs a few sentences, so aim for a minute.`}</Text>
        {take.transcript ? <Text style={[t.callout, s.read]} selectable>{take.transcript}</Text> : null}
      </Group>
    );
  }
  const failed = take.status === 'failed';
  const saving = take.status === 'saving' || take.failed_step === 'save';
  const heard = !saving && (!!take.transcript || take.status === 'reviewing' || take.failed_step === 'review');
  return (
    <Group pad>
      <View style={s.gap16}>
        <Steps items={[
          take.video
            ? { label: 'Putting the video together on your PC', state: take.status === 'saving' ? 'now' : take.failed_step === 'save' ? 'failed' : 'done', note: take.failed_step === 'save' ? take.error : null }
            : { label: 'Saved on your PC', state: 'done' },
          { label: 'Writing down what you said', state: heard ? 'done' : saving ? 'next' : failed ? 'failed' : 'now', note: !heard && failed && !saving ? take.error : null },
          { label: 'Reviewing', state: take.failed_step === 'review' ? 'failed' : take.status === 'reviewing' ? 'now' : 'next', note: take.failed_step === 'review' ? take.error : null },
        ]} />
        {failed ? <Button label={take.failed_step === 'save' ? 'Save it again' : take.failed_step === 'review' ? 'Review it again' : 'Write it down again'} kind="quiet" small onPress={onRetry} busy={retrying} wrap={s.start} />
          : <Text style={t.footnote}>{take.video ? 'Usually a minute or two. You can leave, it will be on Speak when it’s ready.' : 'Usually under a minute. You can leave, the review will be on Mind when it’s ready.'}</Text>}
      </View>
    </Group>
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
        <Text style={[t.hero, t.num, { color: a.color }]}>{r.overall}</Text>
        <View style={s.overallText}>
          <Text style={t.headline}>Overall</Text>
          <Text style={t.footnote}>Out of 100, scored the same way every take</Text>
        </View>
      </View>

      <Group pad tone={a.color}>
        <Text style={[t.footnote, { color: a.color }]}>Fix next time</Text>
        <Text style={t.headline}>{r.fix}</Text>
      </Group>

      <Block title="Your strongest line">
        <Quote>{r.strongest}</Quote>
      </Block>

      <Block title="Said tighter">
        <SegTabs tabs={[{ key: 'tight', label: 'Tighter' }, { key: 'said', label: 'What you said' }] as const} value={view} onChange={setView} />
        <Group pad>
          <Text style={[t.callout, s.read]} selectable>{view === 'tight' ? r.rewrite : take.transcript}</Text>
          <Text style={t.footnote}>{view === 'tight' ? 'Your ideas, fewer words. Nothing added.' : `${take.words ? `${take.words} words in ` : ''}${take.secs ? secsWords(take.secs) : 'this take'}`}</Text>
        </Group>
      </Block>

      <Block title="How it scored">
        <Group pad>
          {ORDER.map((k) => <ScoreRow key={k} name={DIM_NAME[k]} value={r.scores[k]} note={r.notes[k]} />)}
        </Group>
      </Block>

      {extra.length ? (
        <Block title="Checked against">
          <Group pad>{extra.map((x) => <ScoreRow key={x.name} name={x.name} value={x.c.score} note={x.c.note} />)}</Group>
        </Block>
      ) : null}

      <Block title="Fillers" sub={`${r.fpm} a minute`}>
        <Group pad>
          {r.fillers.length ? (
            <View style={s.chips}>{r.fillers.map((f) => <Chip key={f.word} label={`${f.word} ${f.count}`} />)}</View>
          ) : <Text style={t.subhead}>None heard in this take.</Text>}
          <Text style={t.footnote}>Counted from the written take. Some little sounds are left out when it is written down.</Text>
        </Group>
      </Block>

      {take.video ? null : <Player take={take} />}
    </View>
  );
}

/** Moments in the video, each one tap from playing there. */
function Moments({ items, label, onSeek }: { items?: Moment[]; label: string; onSeek: (at: number) => void }) {
  const a = useAspect();
  if (!items?.length) return null;
  return (
    <>
      <Text style={t.footnote}>{label}</Text>
      <Group inset={72}>
        {items.map((m, i) => (
          <Item key={`${m.at}-${i}`} title={m.note} lines={3} onPress={() => onSeek(m.at)} chevron label={`Play from ${timer(m.at)}. ${m.note}`}
            left={<View style={s.at}><Text style={[t.subhead, t.num, { color: a.color }]}>{timer(m.at)}</Text></View>} />
        ))}
      </Group>
    </>
  );
}

function Waiting({ title, line }: { title: string; line: string }) {
  const a = useAspect();
  return (
    <Block title={title}>
      <Group pad><View style={s.wait}><ActivityIndicator color={a.color} /><Text style={[t.subhead, s.flex]}>{line}</Text></View></Group>
    </Block>
  );
}

/** How he looked: Claude Opus on frames from the video. */
function Look({ take, onRetry, retrying, onSeek }: { take: Take; onRetry: () => void; retrying: boolean; onSeek: (at: number) => void }) {
  const a = useAspect();
  const p = take.presence;
  if (!take.video || take.status === 'saving' || take.failed_step === 'save') return null;
  if (!p || p.state === 'running') return <Waiting title="How you looked" line={p ? 'Claude is watching your video.' : 'Claude watches your video once it is written down.'} />;
  if (p.state === 'failed') {
    return (
      <Block title="How you looked">
        <Group pad>
          <Text style={t.subhead}>{p.error ?? "The look at your video didn't finish."}</Text>
          <Button label="Look again" kind="quiet" small onPress={onRetry} busy={retrying} wrap={s.start} />
        </Group>
      </Block>
    );
  }
  const parts = ([['Eyes', p.eyes], ['Posture', p.posture], ['Hands', p.hands], ['Face', p.face]] as const).filter(([, v]) => !!v);
  return (
    <Block title="How you looked" sub="Claude watched frames from your video.">
      <Group pad><ScoreRow name="Confidence on camera" value={p.confidence ?? null} note={p.summary} /></Group>
      {p.fix ? (
        <Group pad tone={a.color}>
          <Text style={[t.footnote, { color: a.color }]}>On camera next time</Text>
          <Text style={t.headline}>{p.fix}</Text>
        </Group>
      ) : null}
      {parts.length ? <Group>{parts.map(([k, v]) => <Item key={k} title={k} sub={v} lines={4} />)}</Group> : null}
      <Moments items={p.stuck} label="Where you got stuck. Tap one to watch it." onSeek={onSeek} />
    </Block>
  );
}

/** How he sounded: Gemini on the audio, once a key is saved. */
function Voice({ take, onRetry, retrying, onSeek }: { take: Take; onRetry: () => void; retrying: boolean; onSeek: (at: number) => void }) {
  const a = useAspect();
  const nav = useNav();
  const d = take.delivery;
  if (!take.video || take.status === 'saving' || take.failed_step === 'save') return null;
  if (d?.state === 'off') {
    return (
      <Block title="How you sounded">
        <Group pad>
          <Text style={t.subhead}>Add a Gemini key and Gemini listens to your videos: energy, pitch, pace and pauses.</Text>
          <Button label="Add a key" kind="soft" small onPress={nav.openKey} wrap={s.start} />
        </Group>
      </Block>
    );
  }
  if (!d || d.state === 'running') return <Waiting title="How you sounded" line={d ? 'Gemini is listening to your video.' : 'Gemini listens once the video is written down.'} />;
  if (d.state === 'failed') {
    return (
      <Block title="How you sounded">
        <Group pad>
          <Text style={t.subhead}>{d.error ?? "Gemini's listen didn't finish."}</Text>
          <Button label="Listen again" kind="quiet" small onPress={onRetry} busy={retrying} wrap={s.start} />
        </Group>
      </Block>
    );
  }
  return (
    <Block title="How you sounded" sub="Gemini listened to your video.">
      <Group pad>
        <ScoreRow name="Energy" value={d.energy ?? null} note={d.tone} />
        <ScoreRow name="Pitch and pace that move" value={d.variety ?? null} note={d.pitch} />
        <ScoreRow name="Clear words" value={d.clarity ?? null} />
        <View style={s.gap4}>
          <View style={s.between}>
            <Text style={t.callout}>Pace</Text>
            <Text style={[t.headline, t.num]}>{`${PACE[d.pace ?? 'steady']}${d.wpm ? `, ${d.wpm} words a minute` : ''}`}</Text>
          </View>
          {d.pace_note ? <Text style={t.footnote}>{d.pace_note}</Text> : null}
        </View>
        {d.pauses ? (
          <View style={s.gap4}>
            <Text style={t.callout}>Pauses</Text>
            <Text style={t.footnote}>{d.pauses}</Text>
          </View>
        ) : null}
      </Group>
      {d.fix ? (
        <Group pad tone={a.color}>
          <Text style={[t.footnote, { color: a.color }]}>Your voice next time</Text>
          <Text style={t.headline}>{d.fix}</Text>
        </Group>
      ) : null}
      <Moments items={d.stuck} label="Where your voice faltered. Tap one to watch it." onSeek={onSeek} />
    </Block>
  );
}

/** His own notes on a video, kept with it. */
function Notes({ take, onSaved }: { take: Take; onSaved: () => void }) {
  const a = useAspect();
  const [text, setText] = useState(take.notes ?? '');
  const [saving, setSaving] = useState(false);
  const dirty = text.trim() !== (take.notes ?? '').trim();
  const save = async () => {
    setSaving(true);
    try { await call(`/mod/mind/stage/${take.id}/notes`, { text }); invalidate('/mod/mind/stage'); haptic.light(); onSaved(); }
    catch (e) { a.notice((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Block title="Your notes">
      <Field multiline value={text} onChangeText={setText} placeholder="What to remember for the next one" />
      {dirty ? <Button label="Save notes" kind="soft" small busy={saving} onPress={() => { void save(); }} wrap={s.start} /> : null}
    </Block>
  );
}

function Player({ take }: { take: Take }) {
  const src = take.file ? fileSource(`/mod/mind/takes/${take.id}/audio`) : null;
  const p = usePlayer(src);
  if (!p.available || !src) return null;
  const total = p.duration || take.secs || 0;
  return (
    <Group pad>
      <View style={s.player}>
        <IconButton label={p.playing ? 'Pause the take' : 'Play the take'} onPress={p.toggle}>
          <Icon name={p.playing ? 'pause' : 'play'} size={18} />
        </IconButton>
        <View style={s.flex}>
          <Text style={t.callout}>Your take</Text>
          <Text style={[t.footnote, t.num]}>{p.playing || p.at > 0 ? `${timer(p.at)} of ${timer(total)}` : timer(total)}</Text>
        </View>
      </View>
    </Group>
  );
}

/** One take, on its own screen: from the Speak list or from Mind home. */
export function ReviewScreen({ id, onClose, onAgain, onStage }: { id: string | null; onClose: () => void; onAgain: (spec: TakeSpec) => void; onStage?: (spec: StageSpec) => void }) {
  const a = useAspect();
  const shown = useLast(id);
  const g = useGet<{ item: Take }>(shown ? `/mod/mind/takes/${shown}` : null);
  const take = g.data?.item?.id === shown ? g.data.item : null;
  const [retrying, setRetrying] = useState(false);
  const [looking, setLooking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [play, setPlay] = useState<number | null>(null);
  // a video keeps filling in after its review: the look and the listen land on their own
  const parts = !!take?.video && take.failed_step !== 'save'
    && (!take.presence || !take.delivery || take.presence.state === 'running' || take.delivery.state === 'running');
  usePoll(() => { void g.refresh().then(() => invalidate(take?.video ? '/mod/mind/stage' : '/mod/mind/speak')); }, 2500, a.open && !!id && (busy(take?.status) || parts));
  const retry = async () => {
    if (!take) return;
    setRetrying(true);
    try { await call(`/mod/mind/takes/${take.id}/retry`); await g.refresh(); } catch (e) { a.notice((e as Error).message); } finally { setRetrying(false); }
  };
  const analyse = async () => {
    if (!take) return;
    setLooking(true);
    try { await call(`/mod/mind/stage/${take.id}/analyse`); await g.refresh(); } catch (e) { a.notice((e as Error).message); } finally { setLooking(false); }
  };
  const remove = async () => {
    if (!take) return;
    setDeleting(true);
    const id = take.id;
    try {
      await call(`/mod/mind/takes/${id}`, undefined, 'DELETE');
      invalidate('/mod/mind/');
      onClose();
      // the PC keeps the record and the recording for a day, so Undo puts both back
      undoable(take.video ? 'Video deleted' : 'Take deleted', async () => {
        try { await call(`/mod/mind/takes/${id}/restore`); invalidate('/mod/mind/'); } catch (e) { a.notice((e as Error).message); }
      });
    } catch (e) { a.notice((e as Error).message); } finally { setDeleting(false); }
  };
  return (
    <Screen open={!!id} onClose={onClose} title="Review">
      {!take ? (g.error ? <Failed message={g.error} onRetry={g.refresh} /> : <View style={s.gap16}><Skeleton height={28} width="70%" /><Skeleton height={88} /><Skeleton height={160} /></View>) : (
        <>
          <View style={s.gap4}>
            <Text style={[t.footnote, { color: a.color }]}>{take.topic_label}</Text>
            <Text style={t.title3}>{take.topic}</Text>
            <Text style={[t.footnote, t.num]}>{`${dayLabel(take.day)}${take.secs ? `, ${secsWords(take.secs)}` : ''}`}</Text>
          </View>
          {take.video ? <VideoPoster id={take.id} thumb={!!take.thumb && !!take.file} secs={take.secs} onPlay={() => setPlay(0)} /> : null}
          {take.video ? <Notes key={take.id} take={take} onSaved={() => { void g.refresh(); }} /> : null}
          <TakeState take={take} onRetry={retry} retrying={retrying} />
          {take.status === 'reviewed' && take.review ? <ReviewBody take={take} /> : null}
          <Look take={take} onRetry={analyse} retrying={looking} onSeek={setPlay} />
          <Voice take={take} onRetry={analyse} retrying={looking} onSeek={setPlay} />
          <View style={s.gap12}>
            {take.video && onStage ? (
              <Button label="Film this prompt again" kind="accent" icon={<Sym name="video" size={18} color="#14161C" />} onPress={() => onStage(stageSpecOf(take))} />
            ) : (
              <Button label="Try this topic again" kind="accent" icon={<Icon name="mic" size={18} color="#14161C" />} onPress={() => onAgain(specOf(take))} />
            )}
            <Button label={take.video ? 'Delete this video' : 'Delete this take'} kind="danger" small onPress={remove} busy={deleting} icon={<Sym name="trash" size={16} color={C.danger} />} wrap={s.start} />
          </View>
          {take.video ? <VideoPlayer id={play != null ? take.id : null} at={play ?? 0} onClose={() => setPlay(null)} /> : null}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  gap4: { gap: 4 },
  gap12: { gap: 12 },
  gap16: { gap: 16 },
  gap24: { gap: 24 },
  start: { alignSelf: 'flex-start' },
  overall: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  overallText: { paddingBottom: 4, gap: 2 },
  read: { color: C.textSoft },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wait: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  at: { width: 44 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
});
