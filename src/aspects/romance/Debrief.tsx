import { requireOptionalNativeModule } from 'expo';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import {
  Block, Button, Chip, dayLabel, dayOf, Empty, Failed, Field, Group, haptic, Icon, Item, Loading, Press, Screen, Skeleton, t, timer, tint, today, useAspect,
} from '@/aspects/kit';
import { ApiError, call, collection, newId, upload } from '@/lib/mod';
import { C } from '@/theme';
import { FEEL, PROMPTS, STUCK, TRIED, WELL } from './copy';
import { useDebriefs } from './data';
import { queueAudio, queuePut } from './local';
import { capital, placeName, useNow, whenIn } from './parts';
import type { Debrief, Outing, Review, TriedAnswer } from './types';

type Audio = typeof import('expo-audio');
/* eslint-disable @typescript-eslint/no-require-imports */
const audio: Audio | null = requireOptionalNativeModule('ExpoAudio') || Platform.OS === 'web' ? require('expo-audio') : null;
/* eslint-enable @typescript-eslint/no-require-imports */
const CAP = 120; // seconds: a minute is the aim, two is the most

// expo-audio's recorder when this build has it; a stand-in that says so when it doesn't. Chosen once, so the hook order never changes.
type Rec = { prepareToRecordAsync: () => Promise<void>; record: () => void; stop: () => Promise<void>; uri: string | null } | null;
const useRecorder: () => Rec = audio ? () => audio.useAudioRecorder(audio.RecordingPresets.HIGH_QUALITY) as unknown as Rec : () => null;

// ── the debrief screen ───────────────────────────────────────────────────────────────────────────────────────────
/**
 * A minute of talk (or a few chips) about an outing, a plan with someone, or anything. `about` names a plan when
 * there is no outing; `onMade` hears the id of the debrief this screen makes, so the page can tie it to the plan.
 */
export function DebriefScreen({ target, about, lastTry, onClose, onMade }: {
  target: { outing: Outing | null; view: string | null } | null; about?: string | null; lastTry: string | null; onClose: () => void;
  onMade?: (id: string) => void;
}) {
  const a = useAspect();
  const d = useDebriefs();
  const rec = useRecorder();
  const [mode, setMode] = useState<'talk' | 'tap'>('talk');
  const [phase, setPhase] = useState<'idle' | 'recording' | 'sending'>('idle');
  const [started, setStarted] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null); // the debrief this screen just made
  const [well, setWell] = useState<string[]>([]);
  const [stuck, setStuck] = useState<string[]>([]);
  const [feel, setFeel] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [tried, setTried] = useState<TriedAnswer | null>(null); // did he try the last thing to try
  const open = !!target;
  const now = useNow(500, phase === 'recording');
  const secs = phase === 'recording' ? Math.floor((now - started) / 1000) : 0;
  const stopRef = useRef<() => void>(() => {});

  // a fresh screen each time it opens
  const key = target ? `${target.outing?.id ?? 'none'}:${target.view ?? ''}:${about ?? ''}` : null;
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (key !== lastKey) {
    setLastKey(key);
    if (key) { setMode('talk'); setPhase('idle'); setMicError(null); setMade(null); setWell([]); setStuck([]); setFeel(null); setText(''); setTried(null); }
  }

  const viewId = made ?? target?.view ?? null;
  const shown = viewId ? d.items?.find((x) => x.id === viewId) ?? null : null;
  // one still on this phone (the PC is away) is not being read, so nothing waits on the PC for it
  const waiting = !!(shown as (Debrief & { waiting?: boolean }) | null)?.waiting;
  const working = !!shown && !waiting && (shown.status === 'transcribing' || shown.status === 'reviewing' || (shown.status === 'saved' && !shown.review));

  // while the PC works on it and this screen is open, look again every few seconds; slower each time the PC doesn't answer
  const pullError = useRef<string | null>(null);
  useEffect(() => { pullError.current = d.pullError; });
  useEffect(() => {
    if (!open || !working) return;
    let gap = 3000, stop = false;
    let id: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await collection('romance', 'debriefs').refresh();
      if (stop) return;
      gap = pullError.current ? Math.min(gap * 2, 60_000) : 3000;
      id = setTimeout(() => void tick(), gap);
    };
    id = setTimeout(() => void tick(), gap);
    return () => { stop = true; clearTimeout(id); };
  }, [open, working]);

  // two minutes is the most
  useEffect(() => { if (phase === 'recording' && secs >= CAP) stopRef.current(); }, [phase, secs]);

  const outing = target?.outing ?? null;
  const askTry = outing?.primer?.try ?? lastTry; // the thing to try he went out with
  const triedDoc = tried ? { answer: tried, try: askTry ?? null } : null;
  const done = (id: string) => { setMade(id); onMade?.(id); };
  const startRec = async () => {
    setMicError(null);
    if (!audio || !rec) { setMicError('This build has no microphone for this yet. Tap instead.'); return; }
    try {
      const perm = await audio.requestRecordingPermissionsAsync();
      if (!perm.granted) { setMicError('Allow the microphone for Agentic OS in Settings, or tap instead.'); return; }
      await audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await rec.prepareToRecordAsync();
      rec.record();
      haptic.medium();
      setStarted(Date.now());
      setPhase('recording');
    } catch {
      setMicError("Couldn't start the microphone here. Tap instead, or try on your phone.");
    }
  };
  const stopRec = async () => {
    if (!rec || !audio) return;
    const length = Math.max(1, Math.round((Date.now() - started) / 1000));
    setPhase('sending');
    haptic.light();
    try { await rec.stop(); } catch {}
    audio.setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    const uri = rec.uri;
    if (!uri) { setPhase('idle'); setMicError('Nothing was recorded. Try again.'); return; }
    const id = newId('db');
    const at = new Date().toISOString();
    const day = today();
    const type = Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4';
    const q = `id=${id}&secs=${length}&day=${day}&at=${encodeURIComponent(at)}${outing ? `&session=${encodeURIComponent(outing.id)}` : ''}${triedDoc ? `&tried=${triedDoc.answer}${triedDoc.try ? `&tried_try=${encodeURIComponent(triedDoc.try)}` : ''}` : ''}`;
    try {
      await upload(`/mod/romance/debriefs/audio?${q}`, uri, type);
      await collection('romance', 'debriefs').refresh();
    } catch (e) {
      // the PC is away: keep the recording on the phone and send it later
      if (!(e instanceof ApiError) || e.status === 0 || e.status >= 500) queueAudio({ id, uri, type, query: q, at, session: outing?.id ?? null, day, secs: length });
      else { setPhase('idle'); setMicError((e as Error).message); return; }
    }
    done(id);
    setPhase('idle');
  };
  useEffect(() => { stopRef.current = () => { void stopRec(); }; });

  const saveChips = () => {
    const id = newId('db');
    const doc = { id, day: today(), at: new Date().toISOString(), session: outing?.id ?? null, kind: 'chips', status: 'saved',
      chips: { well, stuck, feel }, text: text.trim() || null, tried: triedDoc, review: null };
    queuePut('debriefs', doc);
    haptic.medium();
    done(id);
  };
  const retry = async () => {
    if (!shown) return;
    try { await call(`/mod/romance/debriefs/${encodeURIComponent(shown.id)}/review`); await collection('romance', 'debriefs').refresh(); }
    catch (e) { a.notice((e as Error).message); }
  };
  const toggle = (list: string[], set: (v: string[]) => void, k: string) => set(list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
  const context = outing
    ? `${placeName(outing.place)} ${whenIn(outing.day)}, ${outing.reps.length} started`
    : about ?? (shown?.session ? null : shown ? capital(dayLabel(shown.day)) : 'Not tied to one outing');

  return (
    <Screen open={open} onClose={onClose} title="Debrief">
      {context ? <Text style={[t.footnote, t.num, s.centre]}>{context}</Text> : null}

      {!shown && askTry ? (
        <Group pad>
          <View style={s.gap4}>
            <Text style={t.footnote}>Last time&apos;s thing to try</Text>
            <Text style={t.callout}>{askTry}</Text>
          </View>
          <Text style={t.subhead}>Did you try it?</Text>
          <View style={s.chips}>
            {(Object.keys(TRIED) as TriedAnswer[]).map((k) => <Chip key={k} label={TRIED[k]} selected={tried === k} onPress={() => setTried(tried === k ? null : k)} />)}
          </View>
        </Group>
      ) : null}

      {shown ? (
        <Result d={shown} working={working} offline={!!d.pullError} onRetry={retry} />
      ) : mode === 'talk' ? (
        <View style={s.talk}>
          <Text style={[t.title3, s.centre]}>{phase === 'recording' ? PROMPTS[Math.min(PROMPTS.length - 1, Math.floor(secs / 20))] : 'Talk for a minute about how it went.'}</Text>
          <Mic recording={phase === 'recording'} busy={phase === 'sending'} color={a.color} onPress={phase === 'recording' ? () => void stopRec() : () => void startRec()} />
          <Text style={[t.subhead, t.num, s.centre]}>
            {phase === 'recording' ? `${timer(secs)} of ${timer(CAP)}. Tap to finish.` : phase === 'sending' ? 'Sending to your PC' : 'Tap to start. What happened, what went well, where it stalled.'}
          </Text>
          {micError ? <Text style={[t.subhead, s.centre, { color: C.danger }]}>{micError}</Text> : null}
          {phase === 'idle' ? <Button label="Tap instead" kind="soft" small onPress={() => setMode('tap')} wrap={s.selfCentre} /> : null}
          <Text style={[t.footnote, s.centre]}>The recording stays on your PC. Nora reads the words and gives back one thing to try.</Text>
        </View>
      ) : (
        <>
          <ChipGroup title="What went well" options={WELL} chosen={well} onToggle={(k) => toggle(well, setWell, k)} />
          <ChipGroup title="Where it stalled" options={STUCK} chosen={stuck} onToggle={(k) => toggle(stuck, setStuck, k)} />
          <ChipGroup title="How it felt" options={FEEL} chosen={feel ? [feel] : []} onToggle={(k) => setFeel(feel === k ? null : k)} />
          <Field label="Anything else" value={text} onChangeText={setText} placeholder="One line, if you like" maxLength={400} />
          <View style={s.row}>
            <Button label="Talk instead" kind="quiet" onPress={() => setMode('talk')} wrap={s.flex} />
            <Button label="Save" kind="accent" onPress={saveChips} disabled={!well.length && !stuck.length && !feel && !text.trim()} wrap={s.flex} />
          </View>
        </>
      )}
    </Screen>
  );
}

function ChipGroup({ title, options, chosen, onToggle }: { title: string; options: Record<string, string>; chosen: string[]; onToggle: (k: string) => void }) {
  return (
    <Block title={title}>
      <View style={s.chips}>
        {Object.entries(options).map(([k, label]) => <Chip key={k} label={label} selected={chosen.includes(k)} onPress={() => onToggle(k)} />)}
      </View>
    </Block>
  );
}

/** The big mic. A soft halo breathes only while it records (still under Reduce Motion). */
function Mic({ recording, busy, color, onPress }: { recording: boolean; busy: boolean; color: string; onPress: () => void }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (!recording || reduce) { p.set(0); return; }
    p.set(withRepeat(withTiming(1, { duration: 1100 }), -1, true));
  }, [recording, reduce, p]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.25 + p.value * 0.35, transform: [{ scale: 1 + p.value * 0.12 }] }));
  return (
    <View style={s.micWrap}>
      {recording ? <Animated.View style={[s.halo, { backgroundColor: tint(color, 0.3) }, halo]} /> : null}
      <Press label={recording ? 'Finish recording' : 'Start recording'} onPress={onPress} disabled={busy} feel="none" scale={0.95}
        style={[s.mic, { backgroundColor: recording ? color : tint(color, 0.16), borderColor: tint(color, 0.5) }]}>
        {busy ? <Loading /> : recording ? <View style={s.stopSquare} /> : <Icon name="mic" size={32} color={color} />}
      </Press>
    </View>
  );
}

// ── what came back ──────────────────────────────────────────────────────────────────────────────────────────────
function Result({ d, working, offline, onRetry }: { d: Debrief; working: boolean; offline: boolean; onRetry: () => void }) {
  const waiting = (d as Debrief & { waiting?: boolean }).waiting;
  if (waiting) return <Group pad><Text style={t.subhead}>Saved on this phone. It goes to your PC when it answers, and the reading comes back here.</Text></Group>;
  if (working && !d.review && offline) return <Group pad><Text style={t.subhead}>Your PC has it but isn&apos;t answering right now. The reading shows here once it&apos;s back.</Text></Group>;
  if (working && !d.review) {
    return <Loading label={d.status === 'transcribing' ? 'Writing down what you said. This takes up to a minute; you can leave and come back.' : 'Nora is reading it. Usually a few seconds; you can leave and come back.'} />;
  }
  return (
    <View style={s.gap24}>
      {d.status === 'failed' ? (
        <Group pad>
          <Text style={t.headline}>{d.failed_step === 'transcribe' ? "Your PC couldn't write this one down" : d.failed_step === 'short' ? 'That was too short to read' : "Nora couldn't read this one"}</Text>
          <Text style={t.subhead}>{d.review ? 'Your debrief is saved, and a plain reading is below.' : 'Your debrief is saved. Try again in a moment.'}</Text>
          {d.error ? <Text style={t.footnote}>{d.error}</Text> : null}
          {d.failed_step !== 'short' ? <Button label="Try again" kind="quiet" small onPress={onRetry} wrap={s.selfStart} /> : null}
        </Group>
      ) : null}
      {working ? <Text style={[t.subhead, s.centre]}>Reading it again</Text> : null}
      {d.review ? <ReviewCard review={d.review} kind={d.kind} /> : null}
      {d.transcript ? <Said text={d.transcript} /> : d.text ? <Said text={d.text} title="What you wrote" /> : null}
    </View>
  );
}

export function ReviewCard({ review, kind, compact }: { review: Review; kind?: Debrief['kind']; compact?: boolean }) {
  const a = useAspect();
  return (
    <Animated.View entering={FadeIn.duration(220).reduceMotion(ReduceMotion.System)} style={s.gap16}>
      <Block title="What you did well">
        <Group pad>
          {review.well.map((w) => <Text key={w} style={t.subhead}>{w}</Text>)}
        </Group>
      </Block>
      <Group pad tone={a.color}>
        <Text style={[t.footnote, { color: a.color }]}>One thing to try next time</Text>
        <Text style={t.headline}>{review.try.text}</Text>
        {review.try.why && !compact ? <Text style={t.subhead}>{review.try.why}</Text> : null}
        {!compact ? <Text style={t.footnote}>It is your primer for the next outing.</Text> : null}
      </Group>
      {review.pattern ? (
        <Block title="A pattern">
          <Group pad><Text style={t.subhead}>{review.pattern}</Text></Group>
        </Block>
      ) : null}
      <Text style={t.footnote}>{review.by === 'ai' ? `Read by Nora ${whenIn(dayOf(review.at))}` : kind === 'voice' ? 'A plain reading, made without Nora' : 'A plain reading from what you tapped, made without Nora'}</Text>
    </Animated.View>
  );
}

/** What he said or wrote, folded until he opens it. */
function Said({ text, title = 'What you said' }: { text: string; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={s.gap8}>
      <Press label={`${open ? 'Hide' : 'Show'} ${title.toLowerCase()}`} onPress={() => setOpen(!open)} style={s.fold}>
        <Text style={t.subhead}>{title}</Text>
        <Icon name={open ? 'up' : 'down'} size={16} color={C.muted} />
      </Press>
      {open ? <Group pad><Text selectable style={t.subhead}>{text}</Text></Group> : null}
    </View>
  );
}

// ── every debrief ───────────────────────────────────────────────────────────────────────────────────────────────
/** Every debrief by day; one opens in place with its reading, what was said, and delete. */
export function DebriefsScreen({ open, onClose, about }: { open: boolean; onClose: () => void; about: (d: Debrief) => string }) {
  const a = useAspect();
  const d = useDebriefs();
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const items = d.items?.filter((x) => !(x as Debrief & { waiting?: boolean }).waiting) ?? null;
  return (
    <Screen open={open} onClose={onClose} title="Debriefs">
      {items == null ? (
        d.error ? <Group><Failed message={d.error} onRetry={d.refresh} /></Group> : <View style={s.gap12}>{[0, 1, 2].map((i) => <Skeleton key={i} height={64} radius={22} />)}</View>
      ) : items.length === 0 ? (
        <Empty title="No debriefs yet" body="After an outing or a plan, talk for a minute or tap a few chips. Each one shows here with what went well and one thing to try." />
      ) : (
        <Group inset={16}>
          {items.map((x) => {
            const isOpen = openId === x.id;
            return (
              <View key={x.id}>
                <Item title={capital(dayLabel(x.day))} sub={isOpen ? null : statusWords(x) || about(x)} label={`Debrief, ${dayLabel(x.day)}. ${isOpen ? 'Close' : 'Open'}`}
                  right={<Icon name={isOpen ? 'up' : 'down'} size={16} color={C.muted} />} onPress={() => { setOpenId(isOpen ? null : x.id); setConfirm(null); }} />
                {isOpen ? (
                  <View style={s.opened}>
                    <Text style={t.footnote}>{about(x)}</Text>
                    {x.review ? <ReviewCard review={x.review} kind={x.kind} compact /> : <Text style={t.subhead}>{statusWords(x)}</Text>}
                    {x.transcript ? <Said text={x.transcript} /> : x.text ? <Said text={x.text} title="What you wrote" /> : null}
                    {confirm === x.id ? (
                      <View style={s.gap8}>
                        <Text style={t.subhead}>{`Delete this debrief${x.kind === 'voice' ? ' and its recording' : ''}? This can't be undone.`}</Text>
                        <View style={s.row}>
                          <Button label="Keep" kind="quiet" small onPress={() => setConfirm(null)} wrap={s.flex} />
                          <Button label="Delete" kind="danger" small wrap={s.flex} onPress={() => { setConfirm(null); setOpenId(null); d.remove(x.id).catch((e) => a.notice((e as Error).message)); }} />
                        </View>
                      </View>
                    ) : (
                      <Button label="Delete" kind="quiet" small icon={<Icon name="trash" size={14} color={C.muted} />} onPress={() => setConfirm(x.id)} wrap={s.selfEnd} />
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Group>
      )}
    </Screen>
  );
}

export function statusWords(d: Debrief) {
  if ((d as Debrief & { waiting?: boolean }).waiting) return 'Saved on this phone. It reaches your PC when it answers.';
  if (d.status === 'transcribing') return 'Being written down on your PC';
  if (d.status === 'reviewing' || (d.status === 'saved' && !d.review)) return 'Being read';
  if (d.status === 'failed') return 'Not read yet. Open it to try again.';
  return '';
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  gap16: { gap: 16 },
  gap24: { gap: 24 },
  centre: { textAlign: 'center' },
  selfCentre: { alignSelf: 'center' },
  selfStart: { alignSelf: 'flex-start' },
  selfEnd: { alignSelf: 'flex-end' },
  row: { flexDirection: 'row', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  talk: { alignItems: 'stretch', gap: 24, paddingTop: 16 },
  micWrap: { alignSelf: 'center', width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 160, height: 160, borderRadius: 80 },
  mic: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  stopSquare: { width: 28, height: 28, borderRadius: 6, backgroundColor: '#14161C' },
  fold: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  opened: { gap: 16, paddingHorizontal: 16, paddingBottom: 16 },
});
