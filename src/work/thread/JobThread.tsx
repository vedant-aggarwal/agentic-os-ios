import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Backdrop } from '@/components/Backdrop';
import { EdgeBlur } from '@/components/EdgeBlur';
import { tap } from '@/components/Glass';
import { FolderContext } from '@/components/Linked';
import { Notice } from '@/components/Notice';
import { SignIn } from '@/components/SignIn';
import { ApiError } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { C, F } from '@/theme';
import { newKey, workApi } from '../api';
import { useWorkNotice, work } from '../store';
import type { JobEvent } from '../types';
import { busyStatus, Composer, type SendPhase } from './Composer';
import { demoRuns } from './demoThread';
import { type DiffTarget, DiffViewer } from './DiffViewer';
import { BAR_GAP, BAR_H, Header } from './Header';
import { buildRows, type ChangeFile, ENGINE, lastAnswer, revertTurns } from './model';
import { Confirm, JobMenu, type TurnChoice } from './Overlay';
import { CacheChip } from '../ui/CacheChip';
import { openJob } from '../ui/nav';
import { ThreadList } from './ThreadList';
import { copyText, Press } from './ui';
import { useJobStream } from './useJobStream';

// A job's page: the live thread, the bar with Stop and the menu, the reply box, and the diff viewer.
// Spec: PROJECTS-HUB-SPEC.md section 6.

type Held = { text: string; failed: boolean };
/** cold: Claude's prompt cache ran out (the PC answered 428), so sending re-reads the whole chat; he decides. */
type Ask = { kind: 'revert'; turn: TurnChoice } | { kind: 'done' } | { kind: 'cold'; text: string; message: string; summarising?: boolean };
type Sent = 'sent' | 'held' | 'cold' | 'failed';

const say = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : '') || "Couldn't reach your PC.";

export function JobThread({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const stream = useJobStream(id);
  const { job, events, apply } = stream;
  const status = job?.status;
  const engine = job?.engine;
  const notice = useWorkNotice();

  const rows = useMemo(() => buildRows(events, status && engine ? { status, engine } : null), [events, status, engine]);
  const turns = useMemo(() => revertTurns(events), [events]);
  const hasAnswer = useMemo(() => !!lastAnswer(rows), [rows]);

  const [phase, setPhase] = useState<SendPhase>('idle');
  const [held, setHeld] = useState<Held | null>(null);
  const [permBusy, setPermBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [diff, setDiff] = useState<DiffTarget | null>(null);
  const [composerH, setComposerH] = useState(0);

  // latest values for callbacks that shouldn't change identity every frame
  const latest = useRef({ events, status });
  useEffect(() => { latest.current = { events, status }; }, [events, status]);

  // ---- sending ----
  /** 'sent'; 'held' (a turn is running: it goes when the turn ends); 'cold' (the cache ran out: the Send anyway
   *  question is up and holds the text); or 'failed'. force: send even though the cache is cold. */
  const sendNow = useCallback(async (text: string, force = false): Promise<Sent> => {
    if (DEMO) { demoRuns.get(id)?.prompt(text); return 'sent'; }
    const st = latest.current.status;
    setPhase(st === 'stopped' || st === 'failed' ? 'resuming' : 'sending');
    try {
      const r = await workApi.prompt(id, text, newKey(), force);
      apply(r.job);
      return 'sent';
    } catch (e) {
      // 409 "still working": a turn is running on the PC that the phone hadn't seen yet. Any other 409 (the job never
      // started a session, the engine's sign-in is broken, the job is done) won't clear by waiting, so it is a failure.
      if (e instanceof ApiError && e.status === 409 && /still working/i.test(e.message)) return 'held';
      if (e instanceof ApiError && e.status === 428 && !force) { setAsk({ kind: 'cold', text, message: e.message }); return 'cold'; }
      work.notify(say(e));
      return 'failed';
    } finally {
      setPhase('idle');
    }
  }, [id, apply]);

  const send = useCallback(async (text: string) => {
    if (busyStatus(latest.current.status)) { setHeld({ text, failed: false }); return true; }
    const r = await sendNow(text);
    if (r === 'held') setHeld({ text, failed: false });
    return r !== 'failed';
  }, [sendNow]);

  // a held message goes as soon as the turn ends
  const draining = useRef(false);
  useEffect(() => {
    if (!held || held.failed || draining.current || busyStatus(status) || status === 'done') return;
    draining.current = true;
    const text = held.text;
    sendNow(text).then((r) => {
      if (r === 'sent' || r === 'cold') setHeld((h) => (h?.text === text ? null : h));
      else if (r === 'failed') setHeld((h) => (h?.text === text ? { text, failed: true } : h));
    }).finally(() => { draining.current = false; });
  }, [held, status, sendNow]);

  /** Send anyway after the cold-cache question; Cancel keeps the message as "Not sent" so it isn't lost. */
  const sendCold = useCallback(async (text: string) => {
    setAsk(null);
    const r = await sendNow(text, true);
    if (r === 'held') setHeld({ text, failed: false });
    else if (r === 'failed') setHeld({ text, failed: true });
  }, [sendNow]);

  /** New session with summary: the PC summarises this job and starts a new one with the message; then its thread opens.
   *  On an error the PC's reason shows and the message stays as "Not sent". */
  const sendFresh = useCallback(async (text: string) => {
    if (DEMO) { setAsk(null); work.notify('Not available in the demo.'); return; }
    setAsk((a) => (a?.kind === 'cold' ? { ...a, summarising: true } : a));
    try {
      const r = await workApi.fresh(id, text, newKey());
      setAsk(null);
      setHeld((h) => (h?.text === text ? null : h));
      openJob(r.job.id);
    } catch (e) {
      setAsk(null);
      setHeld({ text, failed: true });
      work.notify(say(e));
    }
  }, [id]);

  // ---- controls ----
  const stop = useCallback(async () => {
    tap(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
    if (DEMO) { demoRuns.get(id)?.control('cancel'); return; }
    try { apply((await workApi.control(id, 'cancel')).job); } catch (e) { work.notify(say(e)); }
  }, [id, apply]);

  const answer = useCallback(async (requestId: string, optionId: string, answers?: Record<string, string>) => {
    const ev = latest.current.events.find((e): e is Extract<JobEvent, { type: 'permission' }> => e.type === 'permission' && e.requestId === requestId);
    if (DEMO) { demoRuns.get(id)?.permission(requestId, optionId); return; }
    setPermBusy(optionId);
    try {
      const r = await workApi.permission(id, requestId, optionId, answers);
      apply(r.job, ev ? [{ ...ev, decided: optionId }] : []);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        apply(null, ev ? [{ ...ev, decided: 'gone' }] : []);
        work.notify('That request was already answered or cancelled.');
      } else work.notify(say(e));
    } finally {
      setPermBusy(null);
    }
  }, [id, apply]);

  const openDiff = useCallback((turn: number, files: ChangeFile[], index: number) => setDiff({ turn, files, index }), []);

  const copyLast = async () => {
    setMenu(false);
    const text = lastAnswer(rows);
    if (!text) return;
    work.notify((await copyText(text)) ? 'Copied the last answer' : 'Copy arrives with the next app build.');
  };
  const revert = async (turn: number) => {
    setAsk(null);
    if (DEMO) { demoRuns.get(id)?.revert(turn); return; }
    try { await workApi.revert(id, turn); work.notify(`Files put back to before turn ${turn}`); } catch (e) { work.notify(say(e)); }
  };
  const markDone = async () => {
    setAsk(null);
    if (DEMO) { demoRuns.get(id)?.control('done'); return; }
    try { apply((await workApi.control(id, 'done')).job); } catch (e) { work.notify(say(e)); }
  };

  // ---- layout ----
  const kb = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({ paddingBottom: Math.max(0, kb.height.value - insets.bottom) }));
  const headerRoom = insets.top + BAR_GAP + BAR_H + 16;
  const offline = stream.load === 'ready' && !!stream.error;

  if (stream.load === 'signedOut') return <SignIn onDone={stream.reload} />;

  let body: React.ReactNode;
  if (!job && stream.load === 'error') {
    body = (
      <View style={[s.center, { paddingTop: headerRoom }]}>
        <Text style={s.stateTitle}>This job didn&apos;t load</Text>
        <Text style={s.stateBody}>{stream.error}</Text>
        <Press accessibilityLabel="Try again" onPress={stream.reload} style={s.retry}><Text style={s.retryText}>Try again</Text></Press>
      </View>
    );
  } else if (!job) {
    body = (
      <View style={[s.center, { paddingTop: headerRoom }]}>
        <ActivityIndicator color={C.muted} />
        <Text style={s.stateBody}>Loading the thread</Text>
      </View>
    );
  } else if (!rows.length) {
    body = (
      <View style={[s.center, { paddingTop: headerRoom, paddingBottom: composerH }]}>
        <Text style={s.stateTitle}>{job.status === 'starting' ? `${ENGINE[job.engine]} is starting` : 'Nothing here yet'}</Text>
        <Text style={s.stateBody}>
          {job.status === 'starting' ? 'Its first steps show here in a few seconds.' : 'Send a message to get it going.'}
        </Text>
      </View>
    );
  } else {
    body = (
      <FolderContext.Provider value={job.folder}>
      <ThreadList rows={rows} job={job} top={headerRoom} bottom={composerH} more={stream.more} older={stream.older}
        onOlder={stream.loadOlder} permBusy={permBusy} onAnswer={answer} onOpenDiff={openDiff} />
      </FolderContext.Provider>
    );
  }

  return (
    <View style={s.screen}>
      <Backdrop />
      <Animated.View style={[s.flex, lift]}>
        {body}
        {job ? (
          <>
            <EdgeBlur height={composerH + 24} strength={30} curve={2} />
            <View style={[s.bottom, { paddingBottom: insets.bottom + 8 }]} onLayout={(e) => setComposerH(e.nativeEvent.layout.height)}>
              <View pointerEvents="none" style={s.noticeAnchor}>
                <Notice text={notice} bottom={8} onClear={work.clearNotice} />
              </View>
              <CacheChip cache={job.cache} working={busyStatus(job.status)} />
              <Composer job={job} phase={phase} queued={held?.failed ? null : held?.text ?? null} onSend={send} onStop={stop}
                onCancelQueued={() => setHeld(null)} onMic={() => work.notify('Not built yet')} />
              {held?.failed ? (
                <View style={s.failed}>
                  <Text style={[s.failedText, s.flex]} numberOfLines={1}>Not sent: {held.text}</Text>
                  <Press accessibilityLabel="Send again" onPress={() => setHeld({ text: held.text, failed: false })} style={s.failedBtn}>
                    <Text style={s.failedBtnText}>Send again</Text>
                  </Press>
                  <Press accessibilityLabel="Discard" onPress={() => setHeld(null)} style={s.failedBtn}>
                    <Text style={[s.failedBtnText, { color: C.muted }]}>Discard</Text>
                  </Press>
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </Animated.View>
      <EdgeBlur edge="top" height={insets.top + BAR_GAP + BAR_H + 24} strength={30} curve={2} />
      <Header top={insets.top} job={job} offline={offline} onStop={stop} onMenu={() => setMenu(true)} />
      {!job ? <View style={[s.noticeAnchor, { bottom: insets.bottom + 24 }]} pointerEvents="none"><Notice text={notice} bottom={0} onClear={work.clearNotice} /></View> : null}

      {menu && job ? (
        <JobMenu top={insets.top} job={job} turns={turns} hasAnswer={hasAnswer} busy={busyStatus(job.status)}
          onClose={() => setMenu(false)} onCopy={copyLast}
          onRevert={(t) => { setMenu(false); setAsk({ kind: 'revert', turn: t }); }}
          onDone={() => { setMenu(false); setAsk({ kind: 'done' }); }} />
      ) : null}
      {ask?.kind === 'revert' ? (
        <Confirm title={`Put files back to before turn ${ask.turn.turn}?`}
          body={`The ${ask.turn.files === 1 ? 'file' : `${ask.turn.files} files`} changed in turn ${ask.turn.turn}, and every change after it, go back to how they were. The conversation stays as it is.`}
          action="Revert" danger onCancel={() => setAsk(null)} onConfirm={() => revert(ask.turn.turn)} />
      ) : null}
      {ask?.kind === 'cold' ? (
        <Confirm title="Send anyway?" body={ask.message} action="Send anyway"
          alt={{ label: 'New session with summary', onPress: () => sendFresh(ask.text) }}
          working={ask.summarising ? 'Summarising this chat for a new session. This takes a few seconds.' : undefined}
          onCancel={() => { if (ask.summarising) return; setHeld({ text: ask.text, failed: true }); setAsk(null); }}
          onConfirm={() => sendCold(ask.text)} />
      ) : null}
      {ask?.kind === 'done' && job ? (
        <Confirm title="Mark this job done?" body={`${ENGINE[job.engine]} closes its session, and the job can't take messages after this.`}
          action="Mark done" onCancel={() => setAsk(null)} onConfirm={markDone} />
      ) : null}
      {diff ? <DiffViewer jobId={id} target={diff} onClose={() => setDiff(null)} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.scene },
  flex: { flex: 1 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  noticeAnchor: { position: 'absolute', left: 0, right: 0, bottom: '100%', height: 0, alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  stateTitle: { fontFamily: F.semibold, fontSize: 20, lineHeight: 28, color: C.text, textAlign: 'center' },
  stateBody: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.muted, textAlign: 'center' },
  retry: { height: 48, paddingHorizontal: 24, borderRadius: 24, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  retryText: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24, color: C.scene },
  failed: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 8, paddingLeft: 16, paddingRight: 4, minHeight: 44,
    borderRadius: 16, backgroundColor: 'rgba(248,113,113,0.10)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(248,113,113,0.4)',
  },
  failedText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.text },
  failedBtn: { height: 36, paddingHorizontal: 12, justifyContent: 'center' },
  failedBtnText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
});
