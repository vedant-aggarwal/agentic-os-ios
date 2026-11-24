import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Backdrop } from '@/components/Backdrop';
import { EdgeBlur } from '@/components/EdgeBlur';
import { Glass } from '@/components/Glass';
import { Notice } from '@/components/Notice';
import { Sym } from '@/components/Sym';
import { ApiError } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { C, F } from '@/theme';
import { newKey, workApi } from '../api';
import { openSheet } from '../bus';
import { useFanProjects, useOrca, useWorkNotice, work } from '../store';
import { Markdown } from '../thread/Markdown';
import { Confirm, MenuHint, MenuInfo, MenuItem, PopMenu } from '../thread/Overlay';
import { IcMore, IcStop, IcUp, Press } from '../thread/ui';
import type { OrcaAgent, OrcaControl, OrcaEntry } from '../types';
import { CacheChip } from '../ui/CacheChip';
import { ago } from '../ui/format';
import { BackIcon } from '../ui/icons';
import { LiveDot } from '../ui/LiveDot';
import { goBack } from '../ui/nav';
import { engineName, orcaStateWord, orcaTone, orcaWorking } from '../ui/orca';
import { NEEDS } from '../ui/tokens';

// One Orca agent on the phone: what it said (Orca's own record of the chat, newest last) and, for a terminal agent,
// a reply box, Stop while it works, and Allow / Deny (with what its screen asks) on a permission prompt. A reply to a
// cold cache stops at "Send anyway?" first. The menu shows it on the PC, starts a new job in its project, or ends it.
// Chat tabs take replies only in Orca itself.

const BAR = 56;

const DEMO_ENTRIES: OrcaEntry[] = [
  { kind: 'message', role: 'user', text: 'Wire the Orca agents into the Work tab.', name: null, state: null },
  { kind: 'tool', role: null, text: null, name: 'Read', state: 'completed' },
  { kind: 'tool', role: null, text: null, name: 'Edit', state: 'completed' },
  { kind: 'message', role: 'assistant', text: 'Done. **Live** now lists Orca agents next to app jobs, and the usage tiles read Orca’s limits.', name: null, state: null },
];

const DEMO_SCREEN = [
  'Bash command',
  '',
  '  hermes cron list',
  '  List the scheduled heartbeat checks',
  '',
  'Do you want to proceed?',
  '❯ 1. Yes',
  '  2. Yes, and don’t ask again for hermes commands',
  '  3. No, and tell Claude what to do differently (esc)',
].join('\n');

const DONE: Record<OrcaControl, string> = {
  stop: 'Stopped its turn.',
  allow: 'Allowed. It carries on.',
  deny: 'Said no. It waits for your next message.',
  show: 'Showing it in Orca on your PC.',
  end: 'Ended. Its tab in Orca is closed.',
};

const shortPath = (p: string | null) => (p ? p.replace(/^[A-Za-z]:\\Users\\[^\\]+/, '~') : null);

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
  const [menu, setMenu] = useState(false);
  const [ending, setEnding] = useState(false);
  const [acting, setActing] = useState<OrcaControl | null>(null);
  const [screen, setScreen] = useState<{ stamp: string; text: string | null; error: string | null } | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const screenScroll = useRef<ComponentRef<typeof ScrollView>>(null);
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

  // The live list is fresher than the last read; the read covers an agent the list no longer shows.
  const a = listed ?? read;
  const working = !!a && orcaWorking(a);
  const chat = a?.kind === 'chat';
  // On a permission prompt typed text could answer it, so the reply box gives way to Allow / Deny.
  const blocked = a?.state === 'blocked';
  const locked = working || blocked;

  // On a permission prompt, read what the terminal shows, so he sees what it asks before he answers. A reading
  // belongs to the moment it was taken (the stamp): a newer prompt shows the spinner until its own reading lands.
  const asking = !DEMO && blocked && !chat;
  useEffect(() => {
    if (!asking) return;
    let alive = true;
    workApi.orcaScreen(id)
      .then((r) => { if (alive) setScreen({ stamp, text: r.text, error: null }); })
      .catch((e) => { if (alive) setScreen({ stamp, text: null, error: (e as Error).message }); });
    return () => { alive = false; };
  }, [id, asking, stamp]);
  const shown = DEMO ? { text: DEMO_SCREEN, error: null } : screen?.stamp === stamp ? screen : null;

  const act = useCallback(async (what: OrcaControl) => {
    setMenu(false);
    if (DEMO) { work.notify('Demo: this reaches Orca on the real PC.'); return; }
    setActing(what);
    try {
      await workApi.orcaControl(id, what);
      work.notify(DONE[what]);
      work.loadOrca();
      if (what === 'end') { goBack(); return; }
      setTimeout(load, 1500);
    } catch (e) {
      work.notify((e as Error).message);
    } finally { setActing(null); }
  }, [id, load]);
  const newJob = () => { setMenu(false); openSheet({ kind: 'job', project: a?.project ?? null }); };
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
            <Press accessibilityLabel="New job here" onPress={newJob} style={s.noteBtn}>
              <Text style={s.noteBtnText}>New job here</Text>
            </Press>
          </View>
        ) : blocked ? (
          <View style={s.ask}>
            <Glass radius={24} />
            <View style={s.askBody}>
              <View style={s.askHead}>
                <View style={s.askDot} />
                <Text style={s.askTitle} numberOfLines={1}>{a ? engineName(a) : 'It'} is asking for permission</Text>
              </View>
              <ScrollView ref={screenScroll} style={s.screenBox} contentContainerStyle={s.screenPad}
                onContentSizeChange={() => screenScroll.current?.scrollToEnd({ animated: false })}>
                {shown?.text ? <Text style={s.mono} selectable>{shown.text}</Text>
                  : shown?.error ? <Text style={s.screenError}>{shown.error}</Text>
                  : shown ? <Text style={s.screenError}>The terminal shows nothing yet.</Text>
                  : <ActivityIndicator color={C.muted} />}
              </ScrollView>
              <Text style={s.askNote}>Allow takes the highlighted choice, usually Yes. Deny says no, and it waits for your next message.</Text>
              <View style={s.askRow}>
                <Press accessibilityLabel="Deny" disabled={!!acting} onPress={() => act('deny')} outer={s.flex} style={[s.btn, s.btnSoft]}>
                  {acting === 'deny' ? <ActivityIndicator color={C.text} size="small" /> : <Text style={s.btnText}>Deny</Text>}
                </Press>
                <Press accessibilityLabel="Allow" disabled={!!acting} onPress={() => act('allow')} outer={s.flex} style={[s.btn, s.btnMain]}>
                  {acting === 'allow' ? <ActivityIndicator color={C.scene} size="small" /> : <Text style={[s.btnText, s.btnMainText]}>Allow</Text>}
                </Press>
              </View>
            </View>
          </View>
        ) : (
          <View style={s.composer}>
            <Glass radius={24} />
            <View style={s.flex}>
              <TextInput value={draft} onChangeText={setDraft} multiline keyboardAppearance="dark" style={s.input} placeholderTextColor={C.faint}
                placeholder={working ? 'It’s working. Send when it stops.' : `Reply to ${a ? engineName(a) : 'the agent'} in Orca`}
                editable={!sending} accessibilityLabel="Reply" />
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
        {working && !chat ? (
          <Press accessibilityLabel="Stop its turn" disabled={!!acting} onPress={() => act('stop')} style={s.stop}>
            {acting === 'stop' ? <ActivityIndicator color="#fff" size="small" /> : <Sym name="stop.fill" size={12} color="#fff" fallback={<IcStop size={11} />} />}
            <Text style={s.stopText}>Stop</Text>
          </Press>
        ) : null}
        <Press accessibilityLabel="More" disabled={!a} onPress={() => setMenu(true)} style={s.back}>
          <Glass radius={22} />
          <View><Sym name="ellipsis" size={18} color={C.text} fallback={<IcMore size={18} />} /></View>
        </Press>
      </View>

      {menu && a ? (
        <PopMenu top={insets.top + BAR + 2} onClose={() => setMenu(false)}>
          <MenuInfo title={`${engineName(a)} in Orca`} sub={shortPath(a.path) ?? where} />
          {!chat ? <MenuItem label="Show on PC" sub="Brings it up in Orca" disabled={!!acting} onPress={() => act('show')} /> : null}
          <MenuItem label="New job here" sub={where ? `In ${where}` : 'Pick a project'} onPress={newJob} />
          {!chat ? <MenuItem label="End agent" sub="Closes its tab in Orca" danger disabled={!!acting} onPress={() => { setMenu(false); setEnding(true); }} /> : null}
          {chat ? <MenuHint>Chat tabs are run from Orca on your PC.</MenuHint> : null}
        </PopMenu>
      ) : null}

      {ending ? (
        <Confirm title="End this agent?" body="Closes its terminal tab in Orca, which stops the agent. Files it changed stay as they are."
          action="End agent" danger working={acting === 'end' ? 'Ending…' : undefined}
          onCancel={() => setEnding(false)} onConfirm={() => { void act('end').then(() => setEnding(false)); }} />
      ) : null}

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
  noteBtn: { alignSelf: 'flex-start', marginTop: 10, height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  noteBtnText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
  stop: { height: 36, paddingHorizontal: 12, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E5484D' },
  stopText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: '#fff' },
  ask: { marginHorizontal: 16, marginBottom: 12, borderRadius: 24, borderCurve: 'continuous', boxShadow: `0 0 0 1px ${NEEDS}55, 0 16px 40px rgba(0,0,0,0.45)` },
  askBody: { padding: 14, gap: 10 },
  askHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  askDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: NEEDS, boxShadow: `0 0 8px ${NEEDS}` },
  askTitle: { flex: 1, fontFamily: F.semibold, fontSize: 15, lineHeight: 20, color: C.text },
  screenBox: { maxHeight: 200, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.45)' },
  screenPad: { padding: 12 },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.86)' },
  screenError: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.muted },
  askNote: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.faint },
  askRow: { flexDirection: 'row', gap: 8 },
  btn: { height: 48, borderRadius: 14, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  btnSoft: { backgroundColor: 'rgba(255,255,255,0.08)' },
  btnMain: { backgroundColor: C.text },
  btnText: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24, color: C.text },
  btnMainText: { color: C.scene },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginHorizontal: 16, marginBottom: 12, padding: 6, paddingLeft: 16, borderRadius: 24, minHeight: 48 },
  input: { maxHeight: 140, paddingVertical: 8, fontFamily: F.regular, fontSize: 16, lineHeight: 22, color: C.text },
  send: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.35 },
});
