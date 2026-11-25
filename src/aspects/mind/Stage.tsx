import { BlurView } from 'expo-blur';
import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Block, Button, Chip, Field, Group, Icon, IconButton, Item, Lead, Press, R, Ring, Sheet, dayLabel, haptic, myDay, t, timer, useAspect, useKeepAwake,
} from '@/aspects/kit';
import { call, invalidate, newId, useGet } from '@/lib/mod';
import { noraUi } from '@/nora/state';
import { C } from '@/theme';
import { Dictate } from './Dictate';
import { useNav } from './nav';
import { StageCam, camAvailable, type Cam, type CamEvent } from './StageCam';
import type { GeminiState, OpenRec, Rolled, StageMode, StageSpec, StageView, TakeSpec, Topic, TopicKind, VideoLite } from './types';
import { Sym, secsWords, useNow } from './ui';
import { thumbSource } from './Video';

// Stage: impromptu speaking on camera (agentos idea i43). Two dice (a topic, or a line someone says to him), no
// prompt, or one he says himself; fifteen seconds to think with the prompt floating over the camera, then up to two
// minutes on camera. The video goes to the PC while he talks (StageCam), so a crash loses nothing: an unfinished
// one waits on the Speak tab to be picked up or saved. Once saved it is reviewed like any take, and Claude and
// Gemini add how he looked and how he sounded (server/modules/mind-stage.ts). With Nora, she calls and plays the
// other person instead.

export const STAGE = '/mod/mind/stage';
const LIMIT = 120;
const PREP = 15;
const NO_PROMPT = 'Anything you want to talk about';

/** Ask before something that can't be undone (web has no native alert with buttons). */
function confirm(title: string, body: string, yes: string, act: () => void) {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n\n${body}`)) act(); return; }
  Alert.alert(title, body, [{ text: 'Cancel', style: 'cancel' }, { text: yes, style: 'destructive', onPress: act }]);
}
const promptOf = (mode: StageMode, topic: string) => (mode === 'none' ? 'No prompt. Talk about anything you like.' : topic);

// ── the Speak tab's lead: pick a prompt, then start ─────────────────────────────────────────────────────────────
type Pick = { mode: StageMode; text: string; label: string; id: string | null; kind: TopicKind | null };

/** What Nora is asked to do on the call (the server keeps 200 characters of it). */
function briefFor(p: Pick) {
  const head = p.mode === 'talk' ? 'Speaking practice. Play the other person: ' : p.mode === 'none' ? 'Speaking practice. Ask me something to talk about for two minutes' : 'Speaking practice. Ask me this and listen: ';
  const tail = '. Push back once, then give one tip at the end.';
  const q = p.mode === 'none' ? '' : p.text.replace(/[.?!]+$/, '');
  return `${head}${q.slice(0, Math.max(0, 200 - head.length - tail.length))}${tail}`.slice(0, 200);
}

export function StageLead({ topic }: { topic: Topic }) {
  const a = useAspect();
  const nav = useNav();
  const [mine, setMine] = useState<Pick | null>(null);   // a roll or his own prompt; until then, today's topic
  const pick: Pick = mine ?? { mode: 'topic', text: topic.text, label: topic.label, id: topic.id, kind: topic.kind };
  const [rolling, setRolling] = useState<'topic' | 'talk' | null>(null);
  const seen = useRef<string[]>([]);
  const roll = async (die: 'topic' | 'talk') => {
    if (rolling) return;
    setRolling(die);
    try {
      const r = await call<{ topic: Rolled }>(`${STAGE}/roll`, { die, not: [...seen.current.slice(-20), ...(pick.id ? [pick.id] : [])] });
      seen.current.push(r.topic.id);
      haptic.light();
      setMine({ mode: die === 'talk' ? 'talk' : 'topic', text: r.topic.text, label: r.topic.label, id: r.topic.id, kind: r.topic.kind });
    } catch (e) { a.notice((e as Error).message); } finally { setRolling(null); }
  };
  const icon = (name: 'dice' | 'talk', on: boolean) => <Sym name={name} size={16} color={on ? a.color : C.textSoft} />;
  const spec: StageSpec = { mode: pick.mode, topic: pick.text, label: pick.label, topicKind: pick.kind, topicId: pick.id };
  const voice: TakeSpec = { kind: 'impromptu', topic: pick.text, label: pick.label, topicId: pick.id ?? undefined, topicKind: pick.kind ?? undefined };
  return (
    <Lead>
      <Text style={[t.footnote, { color: a.color }]}>{mine ? pick.label : `Today's topic, ${pick.label.toLowerCase()}`}</Text>
      <View style={s.gap4}>
        <Text style={t.title3}>{promptOf(pick.mode, pick.text)}</Text>
        {!mine && topic.from ? <Text style={t.footnote}>{`Made from ${topic.from.title}`}</Text> : null}
      </View>
      <View style={s.chips}>
        <Chip label="Topic" selected={pick.mode === 'topic' && !!mine} onPress={() => { void roll('topic'); }}
          icon={rolling === 'topic' ? <ActivityIndicator size="small" color={a.color} /> : icon('dice', pick.mode === 'topic' && !!mine)} />
        <Chip label="Conversation" selected={pick.mode === 'talk'} onPress={() => { void roll('talk'); }}
          icon={rolling === 'talk' ? <ActivityIndicator size="small" color={a.color} /> : icon('talk', pick.mode === 'talk')} />
        <Chip label="No prompt" selected={pick.mode === 'none'} onPress={() => setMine({ mode: 'none', text: NO_PROMPT, label: 'No prompt', id: null, kind: null })} />
        <Dictate chip="Say your own" selected={pick.mode === 'own'} what="your own prompt"
          onText={(text) => setMine({ mode: 'own', text: text.slice(0, 300), label: 'Your own prompt', id: null, kind: null })} />
      </View>
      <Text style={t.footnote}>{`${pick.mode === 'talk' ? 'Answer as if they were in front of you. ' : ''}Fifteen seconds to think, then talk to the camera. It stops at two minutes.`}</Text>
      <View style={s.gap8}>
        <Button label="Start on camera" kind="accent" icon={<Sym name="video" size={18} color="#14161C" />} onPress={() => (camAvailable ? nav.stage(spec) : nav.take(voice))} />
        <View style={s.row}>
          <Button label="With Nora" kind="quiet" small wrap={s.flex} icon={<Sym name="phone" size={16} />} onPress={() => noraUi.call({ reason: briefFor(pick) })} />
          <Button label="Voice only" kind="quiet" small wrap={s.flex} icon={<Icon name="mic" size={16} />} onPress={() => nav.take(voice)} />
        </View>
      </View>
    </Lead>
  );
}

// ── unfinished recordings: pick up, save, or throw away ─────────────────────────────────────────────────────────
export function OpenRecordings({ open }: { open: OpenRec[] }) {
  const a = useAspect();
  const nav = useNav();
  const [busy, setBusy] = useState<string | null>(null);
  if (!open.length) return null;
  const save = async (o: OpenRec) => {
    setBusy(o.id);
    try { await call(`${STAGE}/${o.id}/finish`); invalidate('/mod/mind/'); nav.openReview(o.id); } catch (e) { a.notice((e as Error).message); } finally { setBusy(null); }
  };
  const drop = (o: OpenRec) => confirm('Throw this video away?', 'What reached your PC is deleted.', 'Throw away', () => {
    void call(`${STAGE}/${o.id}/discard`).then(() => invalidate(STAGE), (e) => a.notice((e as Error).message));
  });
  return (
    <>
      {open.map((o) => (
        <Group key={o.id} pad>
          <Text style={[t.footnote, { color: a.color }]}>Unfinished video</Text>
          <Text style={t.headline} numberOfLines={3}>{promptOf(o.mode, o.topic)}</Text>
          <Text style={[t.footnote, t.num]}>{`${timer(o.secs)} reached your PC, ${dayLabel(myDay(o.updated_at)).toLowerCase()}, before the app closed.`}</Text>
          <View style={s.row}>
            {o.secs < LIMIT - 5 && camAvailable ? (
              <Button label={`Pick up from ${timer(o.secs)}`} kind="accent" small wrap={s.flex}
                onPress={() => nav.stage({ mode: o.mode, topic: o.topic, label: o.label, topicKind: o.topic_kind, topicId: o.topic_id, resume: o })} />
            ) : null}
            <Button label="Save it" kind="quiet" small busy={busy === o.id} onPress={() => { void save(o); }} wrap={o.secs < LIMIT - 5 && camAvailable ? undefined : s.flex} />
            <IconButton label="Throw this video away" onPress={() => drop(o)}><Sym name="trash" size={18} color={C.danger} /></IconButton>
          </View>
        </Group>
      ))}
    </>
  );
}

// ── the diary ───────────────────────────────────────────────────────────────────────────────────────────────────
/** A video's state in a word, for the diary: its score, or where it is. */
function takeWord(v: VideoLite) {
  if (v.status === 'reviewed' && v.overall != null) return String(v.overall);
  return { saving: 'Saving', transcribing: 'Writing down', reviewing: 'Reviewing', short: 'Too short', reviewed: 'Reviewed', failed: 'Try again' }[v.status];
}
const working = (v: VideoLite) => v.status === 'saving' || v.status === 'transcribing' || v.status === 'reviewing' || v.look === 'running' || v.voice === 'running';

export function Videos({ v }: { v: StageView }) {
  const a = useAspect();
  const nav = useNav();
  const [all, setAll] = useState(false);
  const list = all ? v.videos : v.videos.slice(0, 4);
  return (
    <Block title="Your videos" sub={v.total ? null : 'Each video lands here with its review: what you said, how you looked and how you sounded.'}>
      {v.videos.length ? (
        <Group inset={72}>
          {list.map((x) => {
            const busy = working(x);
            const word = takeWord(x);
            const scored = x.status === 'reviewed' && x.overall != null;
            return (
              <Item key={x.id} title={promptOf(x.mode, x.topic)} onPress={() => nav.openReview(x.id)} chevron
                sub={`${dayLabel(x.day)}${x.secs ? `, ${secsWords(x.secs)}` : ''}${x.notes ? ', with notes' : ''}`}
                label={`${promptOf(x.mode, x.topic)}, ${scored ? `scored ${word}` : word}`}
                left={(
                  <View style={s.thumb}>
                    {x.thumb ? <Image source={thumbSource(x.id)} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : <Sym name="video" size={18} color={C.faint} />}
                  </View>
                )}
                right={busy ? <ActivityIndicator size="small" color={a.color} />
                  : <Text style={[scored ? t.headline : t.footnote, t.num, x.status === 'failed' && { color: C.danger }]}>{word}</Text>} />
            );
          })}
          {v.videos.length > 4 && !all ? <Item title={`Show all ${v.total}`} onPress={() => setAll(true)} chevron /> : null}
        </Group>
      ) : null}
      <Group>
        <Item title="Voice feedback" chevron onPress={nav.openKey} value={v.gemini.set ? 'On' : 'Off'}
          sub={v.gemini.set ? 'Gemini listens to each video' : 'Add a Gemini key to hear how your voice comes across'} />
      </Group>
    </Block>
  );
}

// ── the Gemini key ──────────────────────────────────────────────────────────────────────────────────────────────
export function VoiceKeySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAspect();
  const g = useGet<GeminiState>(open ? `${STAGE}/gemini` : null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const send = async (k: string) => {
    setBusy(k ? 'save' : 'remove');
    try {
      await call(`${STAGE}/gemini`, { key: k });
      setKey('');
      invalidate(STAGE);
      await g.refresh();
      haptic.success();
      if (k) { a.notice('Saved. Your videos get voice feedback now.'); onClose(); }
    } catch (e) { a.notice((e as Error).message); } finally { setBusy(null); }
  };
  const d = g.data;
  return (
    <Sheet open={open} onClose={onClose} title="Voice feedback">
      <Text style={t.subhead}>Gemini listens to each video and says how your voice comes across: energy, pitch, pace and pauses. The key stays on your PC.</Text>
      {d?.set ? (
        <Group pad>
          <Text style={t.callout}>{`Key ending in ${d.tail ?? ''}`}</Text>
          <Text style={t.footnote}>{`${d.from === 'config' ? "From your PC's settings. " : ''}Using ${d.model ?? 'the newest Flash model'}.`}</Text>
          {d.from === 'app' ? <Button label="Remove the key" kind="danger" small busy={busy === 'remove'} onPress={() => { void send(''); }} wrap={s.start} /> : null}
        </Group>
      ) : null}
      <Field label={d?.set ? 'Replace the key' : 'Gemini API key'} value={key} onChangeText={setKey} placeholder="Paste it here" />
      <Button label="Save" kind="accent" busy={busy === 'save'} disabled={key.trim().length < 20} onPress={() => { void send(key.trim()); }} />
      <Button label="Get a free key from Google" kind="quiet" small wrap={s.start}
        onPress={() => { Linking.openURL('https://aistudio.google.com/app/apikey').catch(() => {}); }} />
    </Sheet>
  );
}

// ── the recording, full screen ──────────────────────────────────────────────────────────────────────────────────
export type StageRun = { spec: StageSpec; n: number };
type Phase = 'opening' | 'prep' | 'rec' | 'ending' | 'paused' | 'finishing' | 'error';
type Fail = 'camera' | 'start' | 'recording' | 'finish';

export function StageFlow({ run, onClose, onDone, onVoice }: {
  run: StageRun | null; onClose: () => void; onDone: (id: string) => void; onVoice: (spec: TakeSpec) => void;
}) {
  return (
    <Modal visible={!!run} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {run ? <Flow key={run.n} spec={run.spec} onClose={onClose} onDone={onDone} onVoice={onVoice} /> : null}
    </Modal>
  );
}

function Flow({ spec, onClose, onDone, onVoice }: { spec: StageSpec; onClose: () => void; onDone: (id: string) => void; onVoice: (spec: TakeSpec) => void }) {
  const a = useAspect();
  const insets = useSafeAreaInsets();
  const cam = useRef<Cam>(null);
  const [id] = useState(() => spec.resume?.id ?? newId('st'));
  const [camKey, setCamKey] = useState(0);
  const [phase, setPhase] = useState<Phase>('opening');
  const [fail, setFail] = useState<{ kind: Fail; msg: string } | null>(null);
  const ready = useRef(false);                 // the camera shows him
  const made = useRef(!!spec.resume);          // the PC has the recording open
  const phaseNow = useRef<Phase>('opening');
  const [seg, setSeg] = useState(spec.resume?.next ?? 0);
  const [offset, setOffset] = useState(spec.resume?.secs ?? 0);   // where this part starts
  const [saved, setSaved] = useState(spec.resume?.secs ?? 0);     // seconds on the PC
  const [waiting, setWaiting] = useState(0);
  const [lagging, setLagging] = useState(false);
  const [prepFrom, setPrepFrom] = useState(0);
  const [recFrom, setRecFrom] = useState(0);
  const after = useRef<'finish' | 'pause' | null>(null);   // what to do once the recorder has stopped
  const gone = useRef(false);
  useEffect(() => { phaseNow.current = phase; });
  // the think time starts once the camera shows him and the PC has the recording open, whichever comes last
  const toPrep = () => {
    if (phaseNow.current !== 'opening' || !ready.current || !made.current) return;
    phaseNow.current = 'prep';
    setPhase('prep');
    setPrepFrom(Date.now());
  };
  const toPrepRef = useRef(toPrep);
  useEffect(() => { toPrepRef.current = toPrep; });
  const now = useNow(250, phase === 'prep' || phase === 'rec');
  useKeepAwake(phase !== 'error', 'stage');
  const firstSeg = spec.resume?.next ?? 0;
  const prepLen = spec.resume || seg > firstSeg ? 5 : PREP;   // picking up: five seconds to get ready

  // the PC opens the recording while the camera starts
  useEffect(() => {
    if (spec.resume) return;
    let live = true;
    call(`${STAGE}/start`, { id, mode: spec.mode, topic: spec.topic, topic_kind: spec.topicKind ?? null, topic_id: spec.topicId ?? null })
      .then(() => { if (live) { made.current = true; toPrepRef.current(); } })
      .catch((e) => { if (live) { setFail({ kind: 'start', msg: (e as Error).message }); setPhase('error'); } });
    return () => { live = false; };
  }, [id, spec]);

  const finish = async () => {
    setPhase('finishing');
    try {
      await call(`${STAGE}/${id}/finish`);
      invalidate('/mod/mind/');
      haptic.success();
      onDone(id);
    } catch (e) { setFail({ kind: 'finish', msg: (e as Error).message }); setPhase('error'); }
  };
  const begin = () => {
    if (phase !== 'prep' && phase !== 'paused') return;
    haptic.medium();
    cam.current?.start({ id, seg, offset });
  };
  const end = (then: 'finish' | 'pause') => {
    if (phase !== 'rec') return;
    after.current = then;
    haptic.medium();
    setPhase('ending');
    cam.current?.stop();
  };
  const discard = () => {
    gone.current = true;
    void call(`${STAGE}/${id}/discard`).then(() => invalidate(STAGE), () => {});
    onClose();
  };
  const onEvent = (e: CamEvent) => {
    if (gone.current) return;
    if (e.type === 'ready') { ready.current = true; toPrep(); }
    else if (e.type === 'recording') { setRecFrom(Date.now()); setPhase('rec'); }
    else if (e.type === 'sent') { setSaved(e.t / 1000); setWaiting(e.waiting); setLagging(false); }
    else if (e.type === 'lag') { setWaiting(e.waiting); setLagging(true); }
    else if (e.type === 'stopped') {
      const at = Math.max(saved, e.t / 1000);
      setSaved(at); setWaiting(0); setLagging(false);
      if (after.current === 'pause') { setSeg((n) => n + 1); setOffset(at); setPhase('paused'); }
      else void finish();
      after.current = null;
    } else if (e.type === 'error') {
      setFail({ kind: phase === 'opening' || phase === 'prep' ? 'camera' : 'recording', msg: e.error });
      setPhase('error');
    }
  };

  // the think time runs out: the recording starts; two minutes in, it stops and saves
  const latest = useRef({ begin, end });
  useEffect(() => { latest.current = { begin, end }; });
  useEffect(() => {
    if (phase !== 'prep' || !prepFrom) return;
    const t0 = setTimeout(() => latest.current.begin(), Math.max(0, prepLen * 1000 - (Date.now() - prepFrom)));
    return () => clearTimeout(t0);
  }, [phase, prepFrom, prepLen]);
  useEffect(() => {
    if (phase !== 'rec' || !recFrom) return;
    const t0 = setTimeout(() => latest.current.end('finish'), Math.max(0, (LIMIT - offset) * 1000 - (Date.now() - recFrom)));
    return () => clearTimeout(t0);
  }, [phase, recFrom, offset]);
  // leaving the app mid-take pauses it (iOS stops the camera in the background); back, he picks up or saves
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'background') latest.current.end('pause'); });
    return () => sub.remove();
  }, []);

  const close = () => {
    if (phase === 'rec') {
      confirm('Stop recording?', 'Save keeps what you said so far. Throw away deletes it.', 'Throw away', discard);
      return;
    }
    if (phase === 'ending' && waiting) {
      confirm('Still sending', `About ${waiting * 2} seconds haven't reached your PC yet. Leave anyway?`, 'Leave', () => { gone.current = true; onClose(); });
      return;
    }
    // nothing recorded in this flow: an empty recording goes; one with something on the PC waits on the Speak tab
    if (!spec.resume && saved === 0 && (phase === 'opening' || phase === 'prep' || phase === 'error')) { if (made.current) discard(); else onClose(); return; }
    gone.current = true;
    invalidate(STAGE);
    onClose();
  };

  const total = phase === 'rec' && recFrom ? offset + Math.max(0, (now - recFrom) / 1000) : saved;
  const prepLeft = prepFrom ? Math.max(0, prepLen - (now - prepFrom) / 1000) : prepLen;
  const hint = total < 20 ? (spec.mode === 'talk' ? 'Answer them as if they were here.' : 'Aim for a minute.') : total < 55 ? 'Make your point, then give an example.'
    : total < 100 ? 'Past a minute. Land your point.' : 'Wrap up. It stops at two minutes.';
  const white = { color: '#fff' };

  return (
    <View style={s.root}>
      <StageCam key={camKey} ref={cam} onEvent={onEvent} style={StyleSheet.absoluteFill} />

      <View style={[s.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={s.topRow}>
          <View style={s.round}><IconButton label={phase === 'rec' ? 'Stop recording' : 'Close'} size={40} onPress={close}><Icon name="close" size={16} color="#fff" /></IconButton></View>
          {phase === 'rec' ? (
            <View style={s.badge} accessibilityLabel={`Recording, ${Math.floor(total)} seconds of two minutes`}>
              <View style={s.dot} />
              <Text style={[t.footnote, t.num, white]}>{`${timer(total)} / 2:00`}</Text>
            </View>
          ) : saved > 0 ? <View style={s.badge}><Text style={[t.footnote, t.num, white]}>{`${timer(saved)} on your PC`}</Text></View> : null}
        </View>
        <BlurView intensity={40} tint="dark" style={s.topic}>
          <Text style={[t.footnote, { color: a.color }]}>{spec.label}</Text>
          <Text style={[phase === 'rec' ? t.headline : t.title3, white]} accessibilityRole="header">{promptOf(spec.mode, spec.topic)}</Text>
        </BlurView>
      </View>

      {phase === 'opening' ? (
        <View style={[StyleSheet.absoluteFill, s.centre]} pointerEvents="none">
          <ActivityIndicator color="#fff" />
          <Text style={[t.footnote, s.soft]}>Starting the camera</Text>
        </View>
      ) : null}

      {phase === 'prep' ? (
        <View style={[StyleSheet.absoluteFill, s.centre]} pointerEvents="none">
          <Ring size={150} progress={prepLeft / prepLen} stroke={6} color="#fff" track="rgba(255,255,255,0.22)">
            <Text style={[t.large, t.num, white]} accessibilityLabel={`${Math.ceil(prepLeft)} seconds to think`}>{Math.ceil(prepLeft)}</Text>
          </Ring>
          <Text style={[t.subhead, white, s.centred, s.shadow]}>{offset > 0 ? `Picking up from ${timer(offset)}.` : 'Think it through. Recording starts on its own.'}</Text>
        </View>
      ) : null}

      {phase === 'ending' || phase === 'finishing' ? (
        <View style={[StyleSheet.absoluteFill, s.centre, s.scrim]}>
          <ActivityIndicator color="#fff" />
          <Text style={[t.headline, white, s.centred]}>{phase === 'ending' && waiting ? 'Sending the last seconds to your PC' : 'Saving on your PC'}</Text>
          {lagging ? <Text style={[t.footnote, s.soft, s.centred]}>Waiting for a connection. Keep the app open.</Text> : null}
        </View>
      ) : null}

      {phase === 'paused' ? (
        <View style={[StyleSheet.absoluteFill, s.centre, s.scrim]}>
          <Text style={[t.headline, white, s.centred]}>{`Paused at ${timer(offset)}`}</Text>
          <Text style={[t.footnote, s.soft, s.centred]}>What you said so far is on your PC.</Text>
          <View style={s.stack}>
            {offset < LIMIT - 5 ? <Button label="Pick up" kind="accent" onPress={() => { setPrepFrom(Date.now()); setPhase('prep'); }} /> : null}
            <Button label="Save it" kind="quiet" onPress={() => { void finish(); }} />
            <Button label="Throw away" kind="danger" small wrap={s.selfCentre} onPress={() => confirm('Throw this video away?', 'What reached your PC is deleted.', 'Throw away', discard)} />
          </View>
        </View>
      ) : null}

      {phase === 'error' && fail ? (
        <View style={[StyleSheet.absoluteFill, s.centre, s.scrim]}>
          <Text style={[t.headline, white, s.centred]}>{fail.msg}</Text>
          {fail.kind === 'recording' && saved > 0 ? <Text style={[t.footnote, s.soft, s.centred]}>{`${timer(saved)} reached your PC.`}</Text> : null}
          <View style={s.stack}>
            {fail.kind === 'camera' ? <Button label="Try again" kind="accent" onPress={() => { setFail(null); ready.current = false; phaseNow.current = 'opening'; setPhase('opening'); setCamKey((k) => k + 1); }} /> : null}
            {fail.kind === 'finish' ? <Button label="Try again" kind="accent" onPress={() => { void finish(); }} /> : null}
            {fail.kind === 'recording' && saved > 0 ? <Button label="Save what's there" kind="accent" onPress={() => { void finish(); }} /> : null}
            {fail.kind === 'camera' || fail.kind === 'start' ? (
              <Button label="Voice only instead" kind="quiet" onPress={() => {
                if (made.current && !spec.resume && saved === 0) void call(`${STAGE}/${id}/discard`).catch(() => {});
                gone.current = true;
                onVoice({ kind: 'impromptu', topic: spec.topic, label: spec.label, topicId: spec.topicId ?? undefined, topicKind: spec.topicKind ?? undefined });
              }} />
            ) : null}
            <Button label="Close" kind="quiet" small wrap={s.selfCentre} onPress={close} />
          </View>
        </View>
      ) : null}

      <View style={[s.bottom, { paddingBottom: insets.bottom + 20 }]} pointerEvents="box-none">
        {phase === 'rec' ? (
          <Text style={[t.footnote, s.status, lagging && { color: '#FFD27A' }]}>
            {lagging ? `Waiting for a connection. ${waiting * 2} seconds are on the phone.` : hint}
          </Text>
        ) : null}
        <View style={s.controls}>
          <View style={s.side}>
            {phase === 'rec' ? (
              <Press label="Throw away this recording" onPress={() => confirm('Throw this recording away?', 'What reached your PC is deleted.', 'Throw away', discard)} style={s.textBtn}>
                <Text style={[t.callout, white]}>Discard</Text>
              </Press>
            ) : null}
          </View>
          {phase === 'prep' ? (
            <Press label="Start recording now" onPress={begin} feel="none" style={s.shutter}><View style={s.recDot} /></Press>
          ) : phase === 'rec' ? (
            <Press label="Stop and save" onPress={() => end('finish')} feel="none" style={s.shutter}><View style={s.recStop} /></Press>
          ) : <View style={s.shutterSpace} />}
          <View style={s.side} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  start: { alignSelf: 'flex-start' },
  selfCentre: { alignSelf: 'center' },
  thumb: { width: 44, height: 56, borderRadius: R.inner, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: C.scene, alignItems: 'center', justifyContent: 'center' },

  root: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 16, gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  round: { borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF453A' },
  topic: { borderRadius: R.group, borderCurve: 'continuous', overflow: 'hidden', padding: 16, gap: 4, backgroundColor: 'rgba(20,22,28,0.35)' },
  centre: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  centred: { textAlign: 'center', maxWidth: 320 },
  shadow: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } },
  soft: { color: 'rgba(255,255,255,0.7)' },
  scrim: { backgroundColor: 'rgba(0,0,0,0.62)' },
  stack: { alignSelf: 'stretch', gap: 12, paddingTop: 8 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 16, paddingHorizontal: 16 },
  status: { color: '#fff', textAlign: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.45)' },
  controls: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  side: { flex: 1, alignItems: 'center' },
  textBtn: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterSpace: { width: 78, height: 78 },
  recDot: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#FF453A' },
  recStop: { width: 30, height: 30, borderRadius: 7, backgroundColor: '#FF453A' },
});
