import { BlurView } from 'expo-blur';
import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, clock, Empty, Failed, Glyph, IconButton, Press, Skeleton, SURF, t, tint } from '@/aspects/kit';
import { useReveal } from '@/components/Reveal';
import { callLength, type NoraMessage } from '@/lib/nora';
import { C } from '@/theme';
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
          <ChatBody open={ui.chat} mic={ui.mic} replyTo={ui.replyTo} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

function ChatBody({ open, mic, replyTo }: { open: boolean; mic: number; replyTo: { id: string; from: string } | null }) {
  const insets = useSafeAreaInsets();
  const th = useThread(open);
  const dict = useDictate();
  const [draft, setDraft] = useState('');
  const [rowError, setRowError] = useState<{ id: number; text: string } | null>(null);
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

  const send = (text: string) => {
    if (replyTo) {
      const to = replyTo;
      noraUi.clearReply();
      void th.answer(to.id, text).then((e) => { if (e) setDraft(text); });
      return;
    }
    void th.send(text);
  };
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
        <TopRow title={th.name} onClose={noraUi.closeChat}>
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
          <Empty title={`Talk to ${th.name}`} body="Ask her to plan, move or remember anything. Type, or tap the mic and talk."
            icon={<NGlyph name="sparkle" size={28} color={NORA} />} />
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
            <Text style={[t.small, s.flex]} numberOfLines={1}>Answering {replyTo.from}</Text>
            <Press label="Stop answering" onPress={noraUi.clearReply} hitSlop={8} style={s.replyX}><Text style={t.label}>Cancel</Text></Press>
          </View>
        ) : null}
        <Composer draft={draft} setDraft={setDraft} onSend={send} dict={dict}
          placeholder={replyTo ? `Your answer for ${replyTo.from}` : `Message ${th.name}`} />
      </Animated.View>
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

function Message({ m, name, error, onRetry, onUndo, onUndoDid, onAnswer }: {
  m: NoraMessage; name: string; error: string | null; onRetry: () => void;
  onUndo: (change: number) => void; onUndoDid: (id: string) => void; onAnswer: (id: string, from: string) => void;
}) {
  if (m.role === 'user') {
    return (
      <View style={s.mine}>
        <View style={[s.bubble, m.pending && s.pending]}><Text selectable style={t.body}>{m.text}</Text></View>
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
        ) : <Text selectable style={t.body}>{m.text}</Text>}
        {(m.meta?.actions ?? []).map((a) => <Change key={a} label={a} undone={false} />)}
      </View>
    );
  }
  const ask = m.meta?.askState;
  const askOpen = ask && ['asked', 'calling', 'scheduled'].includes(ask.status);
  return (
    <View style={s.hers}>
      <Text selectable style={t.body}>{m.text}</Text>
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
  hers: { gap: 8, paddingRight: 32 },
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
