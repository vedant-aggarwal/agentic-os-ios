import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, Glyph, haptic, Icon, Press, SURF, t, tint } from '@/aspects/kit';
import { clock } from '@/lib/nora';
import { callerOf, categoryOf, formatNumber, line, PHASE, type LineCall, type QuickReply } from '@/lib/line';
import { lineAudio, useLineAudio } from '@/lib/lineAudio';
import { lineLive, useLineLive } from '@/lib/lineLive';
import { NGlyph } from '@/nora/parts';
import { C, F } from '@/theme';
import { callerShort, Turns } from './Transcript';
import { CategoryMark, Dots, END_RED, LineScreen, LineTop, NORA, NORA_TEXT, ONCALL, StatusDot, useNow, useToast } from './parts';

// A call on Nora's line while it happens: who it is, what Nora is doing, and every word as it's said. He can listen,
// tap a reply for Nora to say, type her a note, take the call himself (his mic to the caller, Nora goes quiet; on the
// phone it's a CallKit call) and hand it back, or hang up. When it ends, the call's page takes over (CallRoute).

const NOT_OPEN = 'Not connected to your PC yet. Try again in a moment.';
const KEEP = "He can't take this call now. Carry on, take a message, and say he'll call back if it's needed.";
const HEADPHONES_D = 'M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2zM20 15a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z';
const BACK_D = 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11';

let repliesCache: QuickReply[] | null = null;

export function LiveCall({ call, start, onEnded }: { call: LineCall; start?: 'take' | 'listen' | null; onEnded: () => void }) {
  const insets = useSafeAreaInsets();
  const toast = useToast('top');
  const tell = toast.say; // stable, so the effects below run once per error
  const live = useLineLive(call.id);
  const audio = useLineAudio();
  // what was said before the screen opened
  useEffect(() => { if (call.transcript.length) lineLive.seed(call.id, call.transcript); }, [call.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const c = live.call ?? call;
  const phase = c.phase;
  const caller = callerOf(c);
  const ended = live.ended || (live.seen && !live.call);
  const mine = audio.callId === call.id;
  const taken = mine && audio.takenOver;
  const listening = mine && audio.listening;
  const step = live.step ?? live.call?.action ?? null;
  // the timer stops where the call ended
  const now = useNow(1000, !ended);
  const secs = Math.max(0, Math.floor((now - Date.parse(c.startedAt)) / 1000));

  const [replies, setReplies] = useState<QuickReply[]>(repliesCache ?? []);
  useEffect(() => { line.quickReplies().then((r) => { repliesCache = r; setReplies(r); }).catch(() => {}); }, []);
  const chips = useMemo(() => replies.filter((r) => r.categories.includes(c.category)), [replies, c.category]);

  // which control is waiting on the PC, for its spinner
  const [pending, setPending] = useState<'listen' | 'take' | null>(null);
  const waiting = audio.connecting ? pending : null;
  useEffect(() => { if (audio.error) { tell(audio.error); lineAudio.clearError(); } }, [audio.error, tell]);
  useEffect(() => { if (live.error) tell(live.error); }, [live.error, tell]);

  const takeOver = () => {
    if (!lineAudio.canTakeOver) { toast.say("This build can't take calls over. Get the newest one from TestFlight."); return; }
    setPending('take');
    void lineAudio.takeOver(call.id, caller);
  };
  const toggleListen = () => {
    if (!lineAudio.canListen) { toast.say("This build can't play the call. Get the newest one from TestFlight."); return; }
    if (!listening) setPending('listen');
    void lineAudio.listen(call.id, !listening);
  };
  const hangUp = () => { if (!lineAudio.hangUp() && !lineLive.hangup()) toast.say(NOT_OPEN); };

  // a link or a notification's button asked to take over or listen: do it once the PC says the call is on
  const begun = useRef(false);
  useEffect(() => {
    if (begun.current || !start || !live.seen) return;
    begun.current = true;
    if (ended) { toast.say('That call has ended.'); return; }
    const id = setTimeout(() => { if (start === 'take') takeOver(); else if (!listening) toggleListen(); }, 0);
    return () => clearTimeout(id);
  }, [start, live.seen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ended: stop any audio of it, show "Call ended" a moment, then the call's page
  useEffect(() => {
    if (!ended) return;
    if (audio.callId === call.id && (audio.listening || audio.takenOver || audio.connecting)) lineAudio.stop();
    const id = setTimeout(onEnded, 1500);
    return () => clearTimeout(id);
  }, [ended]); // eslint-disable-line react-hooks/exhaustive-deps
  // the browser's player and mic ride this screen's socket, so they stop with it; the phone's run on natively
  useEffect(() => () => { if (Platform.OS === 'web') lineAudio.stop(); }, []);

  const [kept, setKept] = useState<string | null>(null);
  const transfer = !ended && !taken && phase !== 'you' && live.transfer && live.transfer !== kept ? live.transfer : null;
  const keep = () => {
    if (!lineLive.instruct(KEEP)) { toast.say(NOT_OPEN); return; }
    setKept(live.transfer);
    toast.say('Nora keeps the call');
  };
  const say = (r: QuickReply) => {
    if (!lineLive.say(r.say)) { toast.say(NOT_OPEN); return; }
    toast.say('Nora says it next');
  };
  const [note, setNote] = useState('');
  const [typing, setTyping] = useState(false);
  const sendNote = () => {
    const text = note.trim();
    if (!text) return;
    if (!lineLive.instruct(text)) { toast.say(NOT_OPEN); return; }
    setNote('');
    haptic.light();
    toast.say('Nora has your note');
  };

  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [pinned, setPinned] = useState(true); // follows the newest words unless he scrolled up to read

  const statusColor = ended ? C.muted : phase === 'you' ? ONCALL : phase === 'ringing' ? C.textSoft : NORA_TEXT;
  const sub = [categoryOf(c.category).label, c.name?.trim() ? formatNumber(c.number) : null].filter(Boolean).join(' · ');

  return (
    <LineScreen overlay={toast.node}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.fill}>
        <View style={[st.fill, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          <View style={st.pad}><LineTop backLabel="Calls" /></View>

          <View style={st.head}>
            <CategoryMark category={c.category} live={!ended} size={56} />
            <Text accessibilityRole="header" numberOfLines={1} style={[t.title2, st.centre]}>{caller}</Text>
            <Text numberOfLines={1} style={[t.small, t.num, st.centre]}>{sub}</Text>
            <View style={st.status}>
              {ended ? <StatusDot color={C.faint} /> : phase === 'you' ? <StatusDot color={ONCALL} /> : <Dots color={phase === 'ringing' ? C.muted : NORA} />}
              <Text style={[st.statusText, { color: statusColor }]}>{ended ? 'Call ended' : PHASE[phase]}</Text>
              <Text style={[st.statusText, t.num, { color: C.muted }]}>{clock(secs)}</Text>
            </View>
            {!ended && step && phase !== 'you' ? <Text numberOfLines={2} style={[t.body, st.centre, st.step]}>{step}</Text> : null}
            {!ended && live.socket !== 'open' ? <Text style={[t.caption, st.centre]}>Connecting to your PC</Text> : null}
          </View>

          {transfer ? (
            <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={st.transfer}>
              <Text style={st.transferHead}>Nora wants you on this call</Text>
              <Text style={[t.body, { color: C.text }]}>{transfer}</Text>
              <View style={st.row}>
                <Button label="Take over" kind="accent" color={ONCALL} onPress={takeOver} busy={waiting === 'take'} wrap={st.flex} />
                <Button label="Nora keeps it" kind="quiet" onPress={keep} wrap={st.flex} />
              </View>
            </Animated.View>
          ) : null}

          <View style={st.words}>
            {live.lines.length ? (
              <ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={st.wordsList}
                onContentSizeChange={() => { if (pinned) scroll.current?.scrollToEnd({ animated: true }); }}
                onLayout={() => { if (pinned) scroll.current?.scrollToEnd({ animated: false }); }}
                onScroll={(e) => { const n = e.nativeEvent; setPinned(n.contentOffset.y + n.layoutMeasurement.height >= n.contentSize.height - 40); }}
                scrollEventThrottle={100} accessibilityLabel="What's being said">
                <Turns lines={live.lines} caller={callerShort(c.name)} />
              </ScrollView>
            ) : (
              <View style={st.wait}><Text style={[t.small, st.centre]}>{ended ? '' : phase === 'ringing' ? 'Nora is picking up' : 'Waiting for the first words'}</Text></View>
            )}
          </View>

          {!ended && !taken ? (
            <View style={st.tell}>
              {chips.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={st.chips}>
                  {chips.map((r) => <Chip key={r.id} label={r.label} onPress={() => say(r)} />)}
                </ScrollView>
              ) : null}
              <View style={[st.pad, st.noteBar]}>
                <TextInput value={note} onChangeText={setNote} placeholder="Tell Nora what to do" placeholderTextColor={C.faint}
                  onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} onSubmitEditing={sendNote} returnKeyType="send"
                  keyboardAppearance="dark" selectionColor={NORA} accessibilityLabel="A note for Nora. She acts on it and doesn't read it out"
                  style={st.input} maxLength={300} />
                <Press label="Send the note to Nora" onPress={sendNote} disabled={!note.trim()} scale={0.9} style={st.send}>
                  <Icon name="arrowUp" size={18} color={C.scene} />
                </Press>
              </View>
            </View>
          ) : null}

          {!ended && !typing ? (
            <View style={st.controls}>
              {taken ? (
                <>
                  <Control label="Mute" on={audio.muted} onPress={() => lineAudio.setMuted(!audio.muted)}>
                    <NGlyph name={audio.muted ? 'micOff' : 'mic'} size={24} color={audio.muted ? C.scene : C.text} />
                  </Control>
                  {Platform.OS !== 'web' ? (
                    <Control label="Speaker" on={audio.speaker} onPress={() => lineAudio.setSpeaker(!audio.speaker)}>
                      <NGlyph name="speaker" size={24} color={audio.speaker ? C.scene : C.text} />
                    </Control>
                  ) : null}
                  <Control label="Hand back" onPress={() => { lineAudio.release(); toast.say('Nora has the call again'); }}>
                    <Glyph sf="arrow.uturn.backward" d={BACK_D} size={24} color={C.text} />
                  </Control>
                  <Control label="Hang up" big tone={END_RED} onPress={hangUp}><NGlyph name="hangup" size={30} color="#fff" /></Control>
                </>
              ) : (
                <>
                  <Control label={listening ? 'Listening' : 'Listen'} on={listening} busy={waiting === 'listen'} onPress={toggleListen}>
                    <Glyph sf="headphones" d={HEADPHONES_D} size={24} color={listening ? C.scene : C.text} />
                  </Control>
                  <Control label="Take over" big tone={ONCALL} busy={waiting === 'take'} onPress={takeOver}>
                    <NGlyph name="phone" size={28} color="#fff" />
                  </Control>
                  <Control label="Hang up" big tone={END_RED} onPress={hangUp}><NGlyph name="hangup" size={30} color="#fff" /></Control>
                </>
              )}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </LineScreen>
  );
}

/** A round call control with its name under it. `big` for the call's main actions (Take over, Hang up). */
function Control({ label, on, onPress, big, tone, busy, children }: {
  label: string; on?: boolean; onPress: () => void; big?: boolean; tone?: string; busy?: boolean; children: ReactNode;
}) {
  const size = big ? 72 : 64;
  return (
    <View style={st.ctl}>
      <View style={st.slot}>
        <Press label={label} onPress={onPress} scale={0.92} feel={big ? 'medium' : 'light'} disabled={busy}
          state={on != null ? { selected: on } : undefined}
          style={[st.round, { width: size, height: size, borderRadius: size / 2 }, on && st.roundOn, tone ? { backgroundColor: tone } : null]}>
          {busy ? <ActivityIndicator color={tone ? '#fff' : C.text} /> : children}
        </Press>
      </View>
      <Text numberOfLines={1} style={t.caption}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  pad: { paddingHorizontal: 16 },
  centre: { textAlign: 'center' },
  head: { alignItems: 'center', gap: 4, paddingHorizontal: 24, paddingTop: 4 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  statusText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20 },
  step: { color: C.text, marginTop: 4 },
  transfer: {
    marginHorizontal: 16, marginTop: 16, padding: 16, gap: 10, borderRadius: 20, borderCurve: 'continuous',
    backgroundColor: tint(ONCALL, 0.1), borderWidth: StyleSheet.hairlineWidth, borderColor: tint(ONCALL, 0.4),
  },
  transferHead: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: ONCALL },
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  words: { flex: 1, marginTop: 16 },
  wordsList: { paddingHorizontal: 20, paddingVertical: 8 },
  wait: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  tell: { gap: 10, paddingTop: 8 },
  chips: { gap: 8, paddingHorizontal: 16 },
  noteBar: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  input: {
    flex: 1, minHeight: 48, borderRadius: 24, paddingHorizontal: 16, backgroundColor: SURF.card, color: C.text,
    fontFamily: F.regular, fontSize: 16, lineHeight: 22, outlineStyle: 'solid', outlineWidth: 0,
  },
  send: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: C.text },
  controls: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start', paddingHorizontal: 8, paddingTop: 16 },
  ctl: { width: 80, alignItems: 'center', gap: 6 },
  slot: { height: 72, alignItems: 'center', justifyContent: 'center' },
  round: { alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.raised },
  roundOn: { backgroundColor: C.text },
});
