import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Chip, Press, Ring, SURF, Screen, haptic, timer, t, useAspect } from '@/aspects/kit';
import { call, invalidate, newId, upload, useGet } from '@/lib/mod';
import { C } from '@/theme';
import { canPickFile, pickAudioFile, useRecorder, type Recorded } from './recorder';
import { ReviewBody, TakeState } from './Review';
import type { Take, TakeSpec } from './types';
import { Sym, useNow, usePoll } from './ui';

const THINK = 15;      // seconds to think before the recording starts on its own
const LIMIT = 120;     // a take stops itself at two minutes
type Phase = 'think' | 'rec' | 'sending' | 'unsent' | 'sent' | 'mic';

/**
 * One take, full screen: think, talk, send, then the review in place. `run` changes for every new take (its key
 * resets the flow); null closes it. The recording goes to the PC as soon as he stops.
 */
export type Run = { spec: TakeSpec; n: number; steps?: string[] };
export function TakeFlow({ run, onClose }: { run: Run | null; onClose: () => void }) {
  const [last, setLast] = useState(run);
  if (run && run !== last) setLast(run);
  const shown = run ?? last;
  return (
    <Screen open={!!run} onClose={onClose} immersive scroll={false} title={shown?.spec.label ?? ''}>
      {shown ? <Flow key={shown.n} spec={shown.spec} steps={shown.steps} open={!!run} onClose={onClose} /> : null}
    </Screen>
  );
}

function Flow({ spec, steps, open, onClose }: { spec: TakeSpec; steps?: string[]; open: boolean; onClose: () => void }) {
  const a = useAspect();
  const mic = useRecorder();
  const [phase, setPhase] = useState<Phase>('think');
  const [thinkFrom] = useState(() => Date.now());
  const [recFrom, setRecFrom] = useState(0);
  const [id] = useState(() => newId('tk'));
  const [made, setMade] = useState<Recorded | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const starting = useRef(false);
  const stopping = useRef(false);
  const now = useNow(250, open && (phase === 'think' || phase === 'rec'));

  const g = useGet<{ item: Take }>(phase === 'sent' ? `/mod/mind/takes/${id}` : null);
  const take = g.data?.item?.id === id ? g.data.item : null;
  const working = !take || take.status === 'transcribing' || take.status === 'reviewing';
  usePoll(() => { void g.refresh(); }, 2500, open && phase === 'sent' && working);
  const settled = phase === 'sent' && !working;
  useEffect(() => { if (settled) invalidate('/mod/mind/'); }, [settled]);
  useEffect(() => { if (settled && take?.status === 'reviewed') haptic.success(); }, [settled, take?.status]);

  const begin = async () => {
    if (starting.current) return;
    starting.current = true;
    const ok = await mic.start();
    starting.current = false;
    if (!ok) { setPhase('mic'); return; }
    haptic.medium();
    setRecFrom(Date.now());
    setPhase('rec');
  };
  const send = async (r: Recorded) => {
    setMade(r);
    setPhase('sending');
    setSendError(null);
    const q = new URLSearchParams({ id, kind: spec.kind, topic: spec.topic });
    if (spec.topicKind) q.set('topic_kind', spec.topicKind);
    if (spec.topicId) q.set('topic_id', spec.topicId);
    if (spec.drill) q.set('drill', spec.drill);
    if (spec.source) { q.set('src_kind', spec.source.kind); q.set('src_id', spec.source.id); }
    if (r.secs) q.set('secs', String(r.secs));
    try {
      await upload(`/mod/mind/speak/take?${q.toString()}`, r.uri, r.type);
      invalidate('/mod/mind/');
      setPhase('sent');
    } catch (e) {
      setSendError((e as Error).message);
      setPhase('unsent');
    }
  };
  const finish = async () => {
    if (stopping.current) return;
    stopping.current = true;
    const r = await mic.stop();
    haptic.medium();
    if (r) await send(r); else setPhase('mic');
  };
  const useFile = async () => { const f = await pickAudioFile(); if (f) await send(f); };
  const retry = async () => {
    setRetrying(true);
    try { await call(`/mod/mind/takes/${id}/retry`); await g.refresh(); } catch (e) { a.notice((e as Error).message); } finally { setRetrying(false); }
  };
  const cancel = () => { void mic.discard(); onClose(); };

  const thinkLeft = Math.max(0, THINK - (now - thinkFrom) / 1000);
  const recSecs = recFrom ? Math.max(0, (now - recFrom) / 1000) : 0;
  // the think time runs out: the recording starts on its own; two minutes in, it stops and sends
  const latest = useRef({ begin, finish });
  useEffect(() => { latest.current = { begin, finish }; });
  useEffect(() => {
    if (phase !== 'think' || !open) return;
    const id = setTimeout(() => { void latest.current.begin(); }, Math.max(0, THINK * 1000 - (Date.now() - thinkFrom)));
    return () => clearTimeout(id);
  }, [phase, open, thinkFrom]);
  useEffect(() => {
    if (phase !== 'rec' || !recFrom) return;
    const id = setTimeout(() => { void latest.current.finish(); }, Math.max(0, LIMIT * 1000 - (Date.now() - recFrom)));
    return () => clearTimeout(id);
  }, [phase, recFrom]);
  // leaving mid-take throws the recording away
  useEffect(() => { if (!open && phase === 'rec') void mic.discard(); }, [open, phase, mic]);

  const topic = (
    <View style={s.topic}>
      <Text style={[t.label, { color: a.color }]}>{spec.label}</Text>
      <Text style={phase === 'think' ? t.title : t.heading} accessibilityRole="header">{spec.topic}</Text>
      {spec.source ? <Text style={t.small}>{spec.source.kind === 'lesson' ? `From the lesson ${spec.source.title}` : `From ${spec.source.title}`}</Text> : null}
      {steps?.length ? <View style={s.chips}>{steps.map((st, i) => <Chip key={`${st}${i}`} label={`${i + 1} ${st}`} />)}</View> : null}
    </View>
  );

  if (phase === 'think') {
    return (
      <View style={s.fill}>
        {topic}
        <View style={s.centre}>
          <Ring size={168} progress={thinkLeft / THINK} stroke={6}>
            <Text style={[t.big, t.num]} accessibilityLabel={`${Math.ceil(thinkLeft)} seconds to think`}>{Math.ceil(thinkLeft)}</Text>
          </Ring>
          <Text style={[t.body, s.centred]}>Think it through. The recording starts on its own.</Text>
        </View>
        <View style={s.actions}>
          <Button label="Start now" kind="accent" onPress={begin} icon={<Sym name="wave" size={18} color="#14161C" />} />
          {canPickFile ? <Button label="Use a file" kind="quiet" small onPress={useFile} wrap={s.selfCentre} /> : null}
          <Button label="Cancel" kind="quiet" small onPress={cancel} wrap={s.selfCentre} />
        </View>
      </View>
    );
  }

  if (phase === 'rec') {
    const hint = recSecs < 20 ? 'Aim for a minute.' : recSecs < 55 ? 'Make your point, then give an example.' : recSecs < 100 ? 'Past a minute. Land your point.' : 'Wrap up. It stops at two minutes.';
    return (
      <View style={s.fill}>
        {topic}
        <View style={s.centre}>
          <View>
            <Ring size={220} progress={recSecs / LIMIT} stroke={6}>
              <Text style={[t.display, t.num]} accessibilityLabel={`Recording, ${Math.floor(recSecs)} seconds`}>{timer(recSecs)}</Text>
              <Text style={t.caption}>of 2:00</Text>
            </Ring>
            <View style={[s.minuteMark, { backgroundColor: recSecs >= 60 ? a.color : C.faint }]} />
          </View>
          <View style={s.level}><View style={[s.levelFill, { width: `${Math.round(mic.level * 100)}%`, backgroundColor: a.color }]} /></View>
          <Text style={[t.body, s.centred]}>{hint}</Text>
        </View>
        <View style={s.actions}>
          <Press label="Stop and send" onPress={finish} feel="none" wrap={s.selfCentre} style={s.stop}>
            <Sym name="stop" size={26} color={C.scene} filled />
          </Press>
          <Button label="Discard" kind="quiet" small onPress={cancel} wrap={s.selfCentre} />
        </View>
      </View>
    );
  }

  if (phase === 'mic') {
    return (
      <View style={s.fill}>
        {topic}
        <View style={s.centre}>
          <Text style={[t.lead, s.centred]}>{mic.error ?? "The microphone didn't start."}</Text>
        </View>
        <View style={s.actions}>
          <Button label="Try again" kind="primary" onPress={() => { mic.setError(null); void begin(); }} />
          {canPickFile ? <Button label="Use a file" kind="quiet" small onPress={useFile} wrap={s.selfCentre} /> : null}
          <Button label="Close" kind="quiet" small onPress={onClose} wrap={s.selfCentre} />
        </View>
      </View>
    );
  }

  if (phase === 'sending' || phase === 'unsent') {
    return (
      <View style={s.fill}>
        {topic}
        <View style={s.centre}>
          <Text style={[t.lead, s.centred]}>{phase === 'sending' ? 'Sending your take to your PC' : "Couldn't send it"}</Text>
          {phase === 'unsent' ? <Text style={[t.small, s.centred]}>{`${sendError ?? ''} Your take is still on this phone.`.trim()}</Text> : null}
        </View>
        <View style={s.actions}>
          {phase === 'unsent' && made ? <Button label="Send again" kind="primary" onPress={() => send(made)} /> : <Button label="Sending" kind="quiet" busy onPress={() => {}} />}
          {phase === 'unsent' ? <Button label="Discard" kind="quiet" small onPress={onClose} wrap={s.selfCentre} /> : null}
        </View>
      </View>
    );
  }

  // sent: the wait, then the review in place
  return (
    <ScrollView style={s.fill} contentContainerStyle={s.sent} showsVerticalScrollIndicator={false}>
      {topic}
      {take ? <TakeState take={take} onRetry={retry} retrying={retrying} /> : (
        <TakeState take={{ id, status: 'transcribing', transcript: null, failed_step: null, error: null } as unknown as Take} onRetry={retry} />
      )}
      {take?.status === 'reviewed' && take.review ? <ReviewBody take={take} /> : null}
      <Button label={settled ? 'Done' : 'Leave it running'} kind={settled ? 'primary' : 'quiet'} onPress={onClose} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  topic: { gap: 8, paddingTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  centred: { textAlign: 'center', maxWidth: 300 },
  actions: { gap: 12, paddingBottom: 8 },
  selfCentre: { alignSelf: 'center' },
  stop: { width: 76, height: 76, borderRadius: 38, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  minuteMark: { position: 'absolute', bottom: -2, left: 109, width: 2, height: 12, borderRadius: 1 },
  level: { width: 120, height: 4, borderRadius: 2, backgroundColor: SURF.track, overflow: 'hidden' },
  levelFill: { height: 4, borderRadius: 2 },
  sent: { gap: 24, paddingBottom: 24 },
});
