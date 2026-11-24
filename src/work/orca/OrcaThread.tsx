import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Backdrop } from '@/components/Backdrop';
import { EdgeBlur } from '@/components/EdgeBlur';
import { Glass } from '@/components/Glass';
import { Notice } from '@/components/Notice';
import { ApiError } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { C, F } from '@/theme';
import { newKey, workApi } from '../api';
import { useFanProjects, useOrca, useWorkNotice, work } from '../store';
import { Markdown } from '../thread/Markdown';
import { Confirm } from '../thread/Overlay';
import { IcUp, Press } from '../thread/ui';
import type { OrcaAgent, OrcaEntry } from '../types';
import { CacheChip } from '../ui/CacheChip';
import { ago } from '../ui/format';
import { BackIcon } from '../ui/icons';
import { LiveDot } from '../ui/LiveDot';
import { goBack } from '../ui/nav';
import { engineName, orcaStateWord, orcaTone, orcaWorking } from '../ui/orca';
import { NEEDS } from '../ui/tokens';

// One Orca agent on the phone: what it said (Orca's own record of the chat, newest last) and, for a terminal agent,
// a reply box. A reply to a cold cache stops at "Send anyway?" first. Chat tabs take replies only in Orca itself.

const BAR = 56;

const DEMO_ENTRIES: OrcaEntry[] = [
  { kind: 'message', role: 'user', text: 'Wire the Orca agents into the Work tab.', name: null, state: null },
  { kind: 'tool', role: null, text: null, name: 'Read', state: 'completed' },
  { kind: 'tool', role: null, text: null, name: 'Edit', state: 'completed' },
  { kind: 'message', role: 'assistant', text: 'Done. **Live** now lists Orca agents next to app jobs, and the usage tiles read Orca’s limits.', name: null, state: null },
];

export function OrcaThread({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const orca = useOrca();
  const projects = useFanProjects();
  const notice = useWorkNotice();
  const listed = orca.data?.agents.find((a) => a.id === id) ?? null;
  const [read, setRead] = useState<OrcaAgent | null>(null);
  const [entries, setEntries] = useState<OrcaEntry[] | null>(DEMO ? DEMO_ENTRIES : null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [cold, setCold] = useState<{ text: string; message: string } | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const kb = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({ paddingBottom: Math.max(insets.bottom, kb.height.value) }));

  // Read the chat at first, again whenever Orca reports this agent moved (the feed pushes Orca changes), and after a send.
  const [nonce, setNonce] = useState(0);
  const stamp = listed ? `${listed.state}|${listed.updatedAt}` : '';
  useEffect(() => {
    if (DEMO) return;
    let alive = true;
    workApi.orcaRead(id, 40)
      .then((r) => { if (alive) { setRead(r.agent); setEntries(r.entries); setError(null); } })
      .catch((e) => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [id, stamp, nonce]);
  const load = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => { if (entries?.length) setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 0); }, [entries]);

  const send = useCallback(async (text: string, force = false) => {
    if (DEMO) {
      // The preview has no PC: show the cold-cache question, then say where a real reply would go.
      if (!force && listed?.cache.state === 'cold') setCold({ text, message: 'The prompt cache went cold 2 hours ago. This message makes Claude re-read the whole chat at full price.' });
      else { setCold(null); work.notify('Demo: replies go to Orca on the real PC.'); }
      return;
    }
    setSending(true);
    try {
      await workApi.orcaPrompt(id, text, newKey(), force);
      setDraft('');
      setCold(null);
      work.notify('Sent to Orca.');
      work.loadOrca();
      setTimeout(load, 2500);
    } catch (e) {
      if (e instanceof ApiError && e.status === 428 && !force) setCold({ text, message: e.message });
      else work.notify((e as Error).message);
    } finally { setSending(false); }
  }, [id, load, listed?.cache.state]);

  // The live list is fresher than the last read; the read covers an agent the list no longer shows.
  const a = listed ?? read;
  const working = !!a && orcaWorking(a);
  const chat = a?.kind === 'chat';
  // On a permission prompt typed text could answer it, so the reply box waits (the PC refuses it too).
  const blocked = a?.state === 'blocked';
  const locked = working || blocked;
  const where = !a ? null
    : a.project ? projects?.find((p) => p.slug === a.project)?.name ?? a.project
    : a.workspace && a.workspace !== '~' ? a.workspace : null;
  const canSend = !!draft.trim() && !sending && !locked;

  return (
    <View style={s.screen}>
      <Backdrop />
      <ScrollView ref={scroll} style={s.flex} contentContainerStyle={[s.body, { paddingTop: insets.top + BAR + 24 }]} keyboardShouldPersistTaps="handled">
        {a?.last && !entries?.length ? <Text style={s.lastLine}>{a.last}</Text> : null}
        {error ? <Text style={s.error}>{error}</Text> : null}
        {!entries && !error ? <ActivityIndicator color={C.muted} style={{ marginTop: 40 }} /> : null}
        {entries?.map((e, i) => <Entry key={i} e={e} />)}
        {entries && !entries.length ? <Text style={s.lastLine}>Nothing said yet.</Text> : null}
      </ScrollView>

      <Animated.View style={[s.bottom, lift]}>
        <View pointerEvents="none" style={s.noticeAnchor}>
          <Notice text={notice} bottom={8} onClear={work.clearNotice} />
        </View>
        {a ? <CacheChip cache={a.cache} working={working} /> : null}
        {chat ? (
          <View style={s.note}>
            <Text style={s.noteText}>This is an Orca chat tab. Reply to it in Orca on your PC. Jobs you start from here run as Orca terminals, which take replies from the phone.</Text>
          </View>
        ) : (
          <View style={s.composer}>
            <Glass radius={24} />
            <View style={s.flex}>
              <TextInput value={draft} onChangeText={setDraft} multiline keyboardAppearance="dark" style={s.input} placeholderTextColor={C.faint}
                placeholder={blocked ? 'Permission prompt: answer in Orca' : working ? 'It’s working. Send when it stops.' : `Reply to ${a ? engineName(a) : 'the agent'} in Orca`}
                editable={!sending && !blocked} accessibilityLabel="Reply" />
            </View>
            <Press accessibilityLabel="Send" disabled={!canSend} onPress={() => send(draft.trim())} style={[s.send, !canSend && s.sendOff]}>
              {sending ? <ActivityIndicator color={C.scene} size="small" /> : <IcUp size={18} color={C.scene} />}
            </Press>
          </View>
        )}
      </Animated.View>

      <EdgeBlur edge="top" height={insets.top + BAR + 28} strength={30} curve={2} />
      <View style={[s.bar, { top: insets.top + 6 }]}>
        <Press accessibilityLabel="Back" onPress={goBack} style={s.back}>
          <Glass radius={22} />
          <View><BackIcon /></View>
        </Press>
        <View style={s.titleBox}>
          <Text numberOfLines={1} style={s.title}>{a?.title ?? 'Orca agent'}</Text>
          <View style={s.subRow}>
            {a ? <LiveDot tone={orcaTone(a)} pulse={working} size={7} /> : null}
            <Text numberOfLines={1} style={[s.sub, a && orcaTone(a) === 'needs' && { color: NEEDS }]}>
              {a ? [engineName(a), 'Orca', where, orcaStateWord(a), working ? null : ago(a.updatedAt)].filter(Boolean).join(' · ') : 'Loading…'}
            </Text>
          </View>
        </View>
      </View>

      {cold ? (
        <Confirm title="Send anyway?" body={cold.message} action="Send anyway"
          onCancel={() => setCold(null)} onConfirm={() => send(cold.text, true)} />
      ) : null}
    </View>
  );
}

function Entry({ e }: { e: OrcaEntry }) {
  if (e.kind === 'tool') {
    return <Text style={s.tool} numberOfLines={1}>{`${e.name ?? 'Tool'}${e.state && e.state !== 'completed' ? ` · ${e.state}` : ''}`}</Text>;
  }
  if (!e.text) return null;
  if (e.role === 'user') {
    return (
      <View style={s.userWrap}>
        <View style={s.user}><Text style={s.userText}>{e.text}</Text></View>
      </View>
    );
  }
  return <View style={s.assistant}><Markdown text={e.text} /></View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.scene },
  flex: { flex: 1 },
  body: { paddingHorizontal: 16, paddingBottom: 180, gap: 10 },
  bar: { position: 'absolute', left: 16, right: 16, height: BAR - 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  titleBox: { flex: 1, minWidth: 0 },
  title: { fontFamily: F.semibold, fontSize: 17, lineHeight: 22, color: C.text },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sub: { flexShrink: 1, fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint },
  lastLine: { fontFamily: F.regular, fontSize: 15, lineHeight: 22, color: C.muted },
  error: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.danger },
  tool: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint, paddingLeft: 4 },
  userWrap: { alignItems: 'flex-end' },
  user: { maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderBottomRightRadius: 6, backgroundColor: 'rgba(255,255,255,0.1)' },
  userText: { fontFamily: F.regular, fontSize: 15, lineHeight: 22, color: C.text },
  assistant: { paddingRight: 8 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 8 },
  noticeAnchor: { position: 'absolute', left: 0, right: 0, bottom: '100%', height: 0, alignItems: 'center' },
  note: { marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.05)' },
  noteText: { fontFamily: F.regular, fontSize: 13, lineHeight: 19, color: C.muted },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginHorizontal: 16, marginBottom: 12, padding: 6, paddingLeft: 16, borderRadius: 24, minHeight: 48 },
  input: { maxHeight: 140, paddingVertical: 8, fontFamily: F.regular, fontSize: 16, lineHeight: 22, color: C.text },
  send: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.35 },
});
