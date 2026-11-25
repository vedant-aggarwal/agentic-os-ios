import { BlurView } from 'expo-blur';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, clock, Empty, Failed, Glyph, IconButton, Press, Skeleton, SURF, t, tint } from '@/aspects/kit';
import { Linked } from '@/components/Linked';
import { useReveal } from '@/components/Reveal';
import { callLength, type NoraMessage } from '@/lib/nora';
import { C } from '@/theme';
import { picSource, splitAttached, useAttach } from './attach';
import { Composer, Dots, NGlyph, NORA, TopRow } from './parts';
import { callTransport, noraUi, useNora } from './state';
import { useDictate } from './useDictate';
import { useThread } from './useThread';

// Chat with Nora (the dock's chat button): the one thread she keeps with him, everywhere she talks (app, WhatsApp,
// calls). It grows out of the button over everything. Type, or tap the mic and talk; what she changed rides on her
// reply with its own Undo. An agent's question she passed on gets an Answer button that the composer then answers.

type Row =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'msg'; key: string; m: NoraMessage }
  | { kind: 'busy'; key: string; status: string };

function dayLabel(iso: string) {
  const d = new Date(iso), now = new Date();
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}
const timeOf = (iso: string) => clock(iso); // "00:27", the app's one clock

export function NoraChat({ origin }: { origin: { x: number; y: number } }) {
  const ui = useNora();
  const r = useReveal(ui.chat, origin);
  if (!r.ever) return null;
  return (
    <Animated.View style={[r.shell, !r.mounted && s.hidden]} pointerEvents={ui.chat ? 'auto' : 'none'}>
      <Animated.View style={r.stage}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, s.tint]} />
        <Animated.View style={[{ width: r.width, height: r.height }, r.content]}>
          <ChatBody open={ui.chat} mic={ui.mic} micSend={ui.micSend} replyTo={ui.replyTo} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/** The chat itself: drawn full screen by NoraChat on the phone, and as the side panel of the desktop web layout. */
export function ChatBody({ open, mic, micSend = 0, replyTo, onClose = noraUi.closeChat }: {
  open: boolean; mic: number; micSend?: number; replyTo: { id: string; from: string } | null; onClose?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const th = useThread(open);
  const dict = useDictate();
  const [draft, setDraft] = useState('');
  const [rowError, setRowError] = useState<{ id: number; text: string } | null>(null);
  // an answer that didn't reach the PC: answer mode stays on, the words go back in the box, and this says why
  const [answerError, setAnswerError] = useState<string | null>(null);
  if (!replyTo && answerError) setAnswerError(null);
  const replyName = replyTo ? replyTo.from || th.messages.find((m) => m.meta?.askState?.id === replyTo.id)?.meta?.askState?.from || 'them' : '';
  const attach = useAttach(open);
  const kb = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({ paddingBottom: Math.max(kb.height.value + 8, insets.bottom + 8) }));

  // opened to talk (the orb on a build without calls, or a call link): the mic starts on its own
  const seen = useRef(0);
  const { start: startDictation, cancel: cancelDictation } = dict;
  useEffect(() => {
    if (!open || mic === seen.current) return;
    seen.current = mic;
    const id = setTimeout(() => void startDictation(), 350); // after the page has grown in
    return () => clearTimeout(id);
  }, [open, mic, startDictation]);
  useEffect(() => { if (!open) cancelDictation(); }, [open, cancelDictation]);
  // volume down let go: the voice note stops and is sent as it is (still recording? it waits for the take to start)
  const sentSeen = useRef(micSend);
  const sendRef = useRef<(t: string) => void>(() => {});
  const { stop: stopDictation } = dict;
  const dictState = useRef(dict.state);
  dictState.current = dict.state;
  useEffect(() => {
    if (micSend === sentSeen.current) return;
    sentSeen.current = micSend;
    let tries = 0;
    const go = () => {
      if (dictState.current === 'recording') { void stopDictation().then((text) => { if (text) sendRef.current(text); }); return; }
      if (tries++ < 10) setTimeout(go, 80); else cancelDictation(); // too short to have started: drop it
    };
    go();
  }, [micSend, stopDictation, cancelDictation]);

  const send = (text: string) => {
    if (replyTo) {
      const to = replyTo;
      setAnswerError(null);
      void th.answer(to.id, text).then((e) => {
        if (!e) { noraUi.answered(to.id); return; }
        setDraft(text);
        setAnswerError(e);
      });
      return;
    }
    void th.send(text, attach.ids.length ? { ids: attach.ids, uris: attach.pics.filter((p) => p.id).map((p) => p.uri) } : undefined);
    attach.clear();
  };
  sendRef.current = send;
  const undo = async (m: NoraMessage, run: () => Promise<string | null>) => {
    const e = await run();
    setRowError(e ? { id: m.id, text: e } : null);
  };

  const rows: Row[] = [];
  if (th.busy) rows.push({ kind: 'busy', key: 'busy', status: th.busy.status });
  for (let i = th.messages.length - 1; i >= 0; i--) {
    const m = th.messages[i];
    rows.push({ kind: 'msg', key: `m${m.id}`, m });
    const prev = th.messages[i - 1];
    const label = dayLabel(m.at);
    if (!prev || dayLabel(prev.at) !== label) rows.push({ kind: 'day', key: `d${m.id}`, label });
  }

  return (
    <View style={[s.fill, { paddingTop: insets.top + 8 }]}>
      <View style={s.pad}>
        <TopRow title={th.name} onClose={onClose}
          sub={th.busy ? th.busy.status : th.load.status === 'error' ? "Can't reach your PC" : 'Type, talk, or add a picture'}>
          {callTransport() !== 'none' ? (
            <IconButton label={`Call ${th.name}`} onPress={() => noraUi.call()}><NGlyph name="phone" size={18} /></IconButton>
          ) : null}
        </TopRow>
      </View>
      {th.incoming ? (
        <Animated.View entering={FadeIn.duration(200)} style={[s.pad, s.ringWrap]}>
          <View style={s.ring}>
            <View style={s.flex}>
              <Text style={[t.strong, { color: NORA }]}>{th.name} is calling</Text>
              <Text style={t.small} numberOfLines={2}>{th.incoming.reason}</Text>
            </View>
            <Button label="Later" kind="quiet" small onPress={() => void th.dropIncoming('later')} />
            <Button label="Answer" small color={NORA} kind="accent"
              onPress={() => { const inc = th.incoming!; noraUi.call({ incomingId: inc.id, reason: inc.reason }); }} />
          </View>
        </Animated.View>
      ) : null}

      {th.load.status === 'loading' && !th.messages.length ? (
        <View style={[s.pad, s.skel]}>
          <Skeleton height={64} width="78%" radius={20} />
          <View style={s.right}><Skeleton height={44} width="52%" radius={20} /></View>
          <Skeleton height={88} width="84%" radius={20} />
        </View>
      ) : th.load.status === 'error' && !th.messages.length ? (
        <View style={[s.fill, s.center]}><Failed message={th.load.error ?? ''} onRetry={th.reload} /></View>
      ) : !th.messages.length && !th.busy ? (
        <View style={[s.fill, s.center]}>
          <Empty title={`Talk to ${th.name}`} body="Ask her to plan, move or remember anything. Type, talk, or add a picture."
            icon={<NGlyph name="sparkle" size={28} color={NORA} />} />
          <View style={s.starts}>
            {STARTERS.map((x) => (
              <Press key={x} label={x} onPress={() => setDraft(x)} style={s.starter}><Text style={t.small}>{x}</Text></Press>
            ))}
          </View>
        </View>
      ) : (
        <FlatList inverted data={rows} keyExtractor={(x) => x.key} style={s.fill}
          contentContainerStyle={s.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => item.kind === 'day' ? <Text style={[t.caption, s.day]}>{item.label}</Text>
            : item.kind === 'busy' ? (
              <View style={s.busy} accessibilityLiveRegion="polite"><Dots color={NORA} /><Text style={t.small}>{item.status}</Text></View>
            ) : (
              <Message m={item.m} name={th.name} error={rowError?.id === item.m.id ? rowError.text : null}
                onRetry={() => th.retry(item.m)}
                onUndo={(c) => void undo(item.m, () => th.undo(c))}
                onUndoDid={(id) => void undo(item.m, () => th.undoDid(id))}
                onAnswer={(id, from) => noraUi.openChat({ replyTo: { id, from } })} />
            )} />
      )}
      {th.load.status === 'error' && th.messages.length ? <Text style={[t.caption, s.offline]}>{th.load.error}</Text> : null}

      <Animated.View style={[s.pad, lift]}>
        {replyTo ? (
          <View style={s.replying}>
            <Text style={[t.small, s.flex]} numberOfLines={1}>Answering {replyName}</Text>
            <Press label="Stop answering" onPress={noraUi.clearReply} hitSlop={8} style={s.replyX}><Text style={t.label}>Cancel</Text></Press>
          </View>
        ) : null}
        {replyTo && answerError ? (
          <View style={s.replying} accessibilityLiveRegion="polite">
            <Text style={[t.caption, s.flex, { color: C.danger }]} numberOfLines={2}>Not sent to {replyName}: {answerError}</Text>
            <Press label="Send the answer again" hitSlop={8} style={s.replyX}
              onPress={() => { const v = draft.trim(); if (v) { setDraft(''); send(v); } }}><Text style={t.label}>Retry</Text></Press>
          </View>
        ) : null}
        <Composer draft={draft} setDraft={setDraft} onSend={send} dict={dict} attach={replyTo ? undefined : attach}
          placeholder={replyTo ? `Your answer for ${replyName}` : `Message ${th.name}`} />
      </Animated.View>
      {attach.dragging ? (
        <View pointerEvents="none" style={s.drop}>
          <NGlyph name="image" size={28} color={NORA} />
          <Text style={t.strong}>Drop pictures for {th.name}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** A row of what she changed, with its Undo. */
function Change({ label, undone, onUndo }: { label: string; undone: boolean; onUndo?: () => void }) {
  return (
    <View style={s.change}>
      <Glyph sf="checkmark.circle.fill" d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM8 12.5l2.5 2.5L16 9.5" size={16} color={undone ? C.faint : C.muted} />
      <Text style={[t.small, s.flex, undone && s.struck]} numberOfLines={2}>{label}</Text>
      {undone ? <Text style={t.caption}>Undone</Text>
        : onUndo ? <Press label={`Undo ${label}`} onPress={onUndo} hitSlop={8} style={s.undo}><Text style={[t.label, { color: C.text }]}>Undo</Text></Press> : null}
    </View>
  );
}

const STARTERS = ['What is left for today?', 'Plan my evening', 'Remind me at 6 to call Papa'];

/** Pictures sent with a message: the PC's copies once they land, the local ones until then. */
function Pics({ m }: { m: NoraMessage }) {
  const { pics } = splitAttached(m.text);
  const sources = pics.length ? pics.map((p) => ({ key: p.id, src: picSource(p.id) })) : (m.att?.uris ?? []).map((uri) => ({ key: uri, src: { uri } }));
  if (!sources.length) return null;
  return (
    <View style={s.picRow}>
      {sources.map((x) => <Image key={x.key} source={x.src} style={[s.pic, sources.length === 1 && s.picOne]} resizeMode="cover" accessibilityLabel="Picture you sent" />)}
    </View>
  );
}

function Message({ m, name, error, onRetry, onUndo, onUndoDid, onAnswer }: {
  m: NoraMessage; name: string; error: string | null; onRetry: () => void;
  onUndo: (change: number) => void; onUndoDid: (id: string) => void; onAnswer: (id: string, from: string) => void;
}) {
  if (m.role === 'user') {
    return (
      <View style={s.mine}>
        <Pics m={m} />
        {splitAttached(m.text).text ? (
          <View style={[s.bubble, m.pending && s.pending]}><Text selectable style={t.body}><Linked text={splitAttached(m.text).text} /></Text></View>
        ) : null}
        {m.failed ? (
          <Press label="Send again" onPress={onRetry} style={s.failed}>
            <Text style={[t.caption, { color: C.danger }]}>Didn&apos;t send. Tap to try again.</Text>
          </Press>
        ) : null}
      </View>
    );
  }
  if (m.role === 'system') return <Text style={[t.caption, s.system]}>{m.text}</Text>;
  if (m.role === 'call') {
    const w = m.meta?.writeup;
    return (
      <View style={s.call}>
        <View style={s.callHead}>
          <NGlyph name="phone" size={14} color={C.muted} />
          <Text style={[t.label, s.flex]}>Call, {callLength(m.meta?.seconds)}</Text>
          <Text style={t.caption}>{timeOf(m.at)}</Text>
        </View>
        {w === 'running' ? (
          <View style={s.busyIn}><Dots /><Text style={t.small}>Writing up what you covered</Text></View>
        ) : <Text selectable style={t.body}><Linked text={m.text} /></Text>}
        {(m.meta?.actions ?? []).map((a) => <Change key={a} label={a} undone={false} />)}
      </View>
    );
  }
  const ask = m.meta?.askState;
  const askOpen = ask && ['asked', 'calling', 'scheduled'].includes(ask.status);
  return (
    <View style={s.hers}>
      <View style={s.herBubble}><Text selectable style={t.body}><Linked text={m.text} /></Text></View>
      {(m.meta?.changes ?? []).map((c) => <Change key={`c${c.id}`} label={c.label} undone={c.undone} onUndo={() => onUndo(c.id)} />)}
      {(m.meta?.did ?? []).map((x) => (
        <Change key={x.id} label={x.title} undone={x.undone} onUndo={x.undo ? () => onUndoDid(x.id) : undefined} />
      ))}
      {askOpen ? <Button label="Answer" kind="quiet" small onPress={() => onAnswer(ask.id, ask.from)} wrap={s.answer} /> : null}
      {ask && !askOpen && ask.answer ? <Text style={t.caption}>You answered {ask.from}</Text> : null}
      {error ? <Text style={[t.caption, { color: C.danger }]}>{error}</Text> : null}
      <Text style={[t.caption, s.when]} accessibilityLabel={`${name} at ${timeOf(m.at)}`}>{timeOf(m.at)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  hidden: { display: 'none' },
  tint: { backgroundColor: 'rgba(9,10,14,0.96)' },
  fill: { flex: 1 },
  flex: { flex: 1 },
  pad: { paddingHorizontal: 16 },
  center: { justifyContent: 'center', paddingBottom: 80 },
  right: { alignItems: 'flex-end' },
  skel: { gap: 16, paddingTop: 24 },
  list: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 16 },
  day: { textAlign: 'center', paddingTop: 8 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  busyIn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mine: { alignItems: 'flex-end', gap: 4, paddingLeft: 48 },
  bubble: { backgroundColor: SURF.raised, borderRadius: 20, borderCurve: 'continuous', paddingHorizontal: 16, paddingVertical: 8 },
  pending: { opacity: 0.6 },
  failed: { minHeight: 32, justifyContent: 'center' },
  hers: { gap: 8, paddingRight: 32, alignItems: 'flex-start' },
  herBubble: {
    backgroundColor: 'rgba(255,255,255,0.035)', borderRadius: 20, borderTopLeftRadius: 6, borderCurve: 'continuous',
    paddingHorizontal: 16, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.line,
  },
  picRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
  pic: { width: 112, height: 112, borderRadius: 16, backgroundColor: SURF.track },
  picOne: { width: 220, height: 220 },
  starts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingHorizontal: 24, marginTop: 16 },
  starter: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.line, backgroundColor: SURF.row },
  drop: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, margin: 12, borderRadius: 24, borderWidth: 2, borderStyle: 'dashed', borderColor: tint(NORA, 0.6),
    backgroundColor: 'rgba(9,10,14,0.85)', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  when: { marginTop: -4 },
  system: { textAlign: 'center', color: C.danger, paddingHorizontal: 24 },
  call: {
    gap: 8, padding: 16, borderRadius: 24, borderCurve: 'continuous', backgroundColor: SURF.row,
    borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.line,
  },
  callHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  change: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  struck: { textDecorationLine: 'line-through', color: C.faint },
  undo: { minHeight: 36, minWidth: 44, paddingHorizontal: 8, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.card },
  answer: { alignSelf: 'flex-start' },
  offline: { textAlign: 'center', paddingVertical: 4 },
  ringWrap: { paddingTop: 8 },
  ring: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingLeft: 16, borderRadius: 24, borderCurve: 'continuous',
    backgroundColor: tint(NORA, 0.1), borderWidth: StyleSheet.hairlineWidth, borderColor: tint(NORA, 0.3),
  },
  replying: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 4 },
  replyX: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 8 },
});
