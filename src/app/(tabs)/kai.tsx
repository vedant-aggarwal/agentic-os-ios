import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chevron, Plus, SparkIcon } from '@/components/Icons';
import { Press } from '@/components/Press';
import { VoiceField } from '@/components/VoiceField';
import { currentKaiChat, detachFromKai, listKaiChats, newKaiChat, openKaiChat, sendToKai, setKaiDraft, useKai, type KaiChatSummary } from '@/lib/kai';
import { C, F } from '@/theme';

const STARTERS = [
  'Which channel needs a post today?',
  'Draft 5 concepts for Kyren',
  'What is in production right now?',
];

/** Kai: the AI that runs Content OS with you. Talk or type; Kai reads your channels, drafts, creates reels and opens screens. */
export default function KaiScreen() {
  const insets = useSafeAreaInsets();
  const { messages, busy, attachments, draft } = useKai();
  const [kb, setKb] = useState(false);
  const [history, setHistory] = useState(false);
  const list = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    const a = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKb(true));
    const b = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);

  const last = messages[messages.length - 1];
  useEffect(() => {
    const t = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages.length, last?.text, last?.tools.length]);

  const send = () => {
    if (!draft.trim() || busy) return;
    sendToKai(draft, { context: { screen: 'kai' } });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
        <View style={styles.mark}>
          <SparkIcon size={18} color="#fff" />
        </View>
        <Text style={styles.title}>Kai</Text>
        <Press style={styles.newChat} scale={0.94} onPress={() => setHistory(true)} accessibilityLabel="Past chats">
          <Text style={styles.newText}>Chats</Text>
        </Press>
        {messages.length ? (
          <Press style={styles.newChat} scale={0.94} onPress={newKaiChat} accessibilityLabel="New chat">
            <Plus size={16} />
            <Text style={styles.newText}>New</Text>
          </Press>
        ) : null}
      </View>
      {history ? <History onClose={() => setHistory(false)} /> : null}

      <ScrollView ref={list} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        {!messages.length ? (
          <View style={styles.empty}>
            <Text style={styles.hello}>Hi Vedant. What are we making?</Text>
            <Text style={styles.helloSub}>Hold the + button anywhere to talk to me. I can read your channels, draft concepts, start reels and open any screen.</Text>
            <View style={{ gap: 8, marginTop: 16 }}>
              {STARTERS.map((s) => (
                <Press key={s} style={styles.starter} scale={0.98} onPress={() => sendToKai(s, { context: { screen: 'kai' } })}>
                  <Text style={styles.starterText}>{s}</Text>
                  <Chevron size={14} color={C.faint} dir="right" />
                </Press>
              ))}
            </View>
          </View>
        ) : (
          messages.map((m) =>
            m.role === 'user' ? (
              <View key={m.id} style={[styles.bubble, styles.mine]}>
                <Text style={[styles.text, { color: '#fff' }]}>{m.text}</Text>
                {m.voice ? <Text style={styles.voiceTag}>Said by voice</Text> : null}
              </View>
            ) : (
              <View key={m.id} style={{ gap: 6 }}>
                {m.tools.length ? (
                  <View style={styles.tools}>
                    {m.tools.map((t, i) => (
                      <View key={i} style={styles.tool}>
                        {!m.done && i === m.tools.length - 1 ? <ActivityIndicator size="small" color={C.muted} style={{ transform: [{ scale: 0.7 }] }} /> : <View style={styles.toolDot} />}
                        <Text style={styles.toolText}>{t}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {m.text.trim() || m.error ? (
                  <View style={[styles.bubble, styles.theirs]}>
                    <Text style={[styles.text, m.error && { color: '#B4232F' }]}>{m.error || m.text.trim()}</Text>
                  </View>
                ) : !m.done && !m.tools.length ? (
                  <View style={[styles.bubble, styles.theirs]}>
                    <ActivityIndicator size="small" color={C.muted} />
                  </View>
                ) : null}
              </View>
            ),
          )
        )}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: kb ? 8 : Math.max(insets.bottom, 16) + 86 }]}>
        {attachments.length ? (
          <View style={styles.chips}>
            {attachments.map((a) => (
              <Press key={a.kind + a.id} style={styles.chip} scale={0.95} onPress={() => detachFromKai(a)} accessibilityLabel={`Remove ${a.label}`}>
                <Text style={styles.chipText}>{a.label}</Text>
                <View style={{ transform: [{ rotate: '45deg' }] }}>
                  <Plus size={12} color={C.muted} />
                </View>
              </Press>
            ))}
          </View>
        ) : null}
        <VoiceField
          value={draft}
          onChangeText={setKaiDraft}
          placeholder="Ask Kai anything"
          minHeight={52}
          right={
            <Press style={[styles.send, (!draft.trim() || busy) && { opacity: 0.35 }]} disabled={!draft.trim() || busy} onPress={send} scale={0.9} accessibilityLabel="Send">
              <Chevron size={18} color="#fff" dir="right" />
            </Press>
          }
        />
      </View>
    </KeyboardAvoidingView>
  );
}

/** Every past chat with Kai, newest first. Tap one to carry on where it left off. */
function History({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState<KaiChatSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = currentKaiChat();
  useEffect(() => {
    listKaiChats().then(setChats, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  const open = async (id: string) => {
    try {
      await openKaiChat(id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>Chats</Text>
          <Press
            style={styles.newChat}
            scale={0.94}
            onPress={() => {
              newKaiChat();
              onClose();
            }}
            accessibilityLabel="New chat"
          >
            <Plus size={16} />
            <Text style={styles.newText}>New chat</Text>
          </Press>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8 }}>
          {error ? <Text style={[styles.helloSub, { color: '#B4232F' }]}>{error}</Text> : null}
          {!chats && !error ? <ActivityIndicator color={C.muted} style={{ marginTop: 24 }} /> : null}
          {chats && !chats.length ? <Text style={styles.helloSub}>No chats yet. Everything you say to Kai is kept here.</Text> : null}
          {chats?.map((c) => (
            <Press key={c.id} style={[styles.chatRow, c.id === current && { borderColor: C.ink }]} scale={0.98} onPress={() => open(c.id)} accessibilityLabel={`Open chat: ${c.title}`}>
              <Text numberOfLines={1} style={styles.chatTitle}>{c.title}</Text>
              {c.last ? <Text numberOfLines={2} style={styles.chatLast}>{c.last}</Text> : null}
              <Text style={styles.chatWhen}>{when(c.updated)} · {Math.ceil(c.count / 2)} {c.count > 2 ? 'messages' : 'message'}</Text>
            </Press>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function when(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,20,20,0.4)' },
  sheet: { maxHeight: '80%', backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  sheetTitle: { flex: 1, fontFamily: F.b, fontSize: 22, color: C.ink },
  chatRow: { padding: 14, borderRadius: 18, backgroundColor: C.card, borderWidth: 2, borderColor: 'transparent', gap: 3 },
  chatTitle: { fontFamily: F.s, fontSize: 15, lineHeight: 20, color: C.ink },
  chatLast: { fontFamily: F.r, fontSize: 13, lineHeight: 18, color: C.muted },
  chatWhen: { marginTop: 2, fontFamily: F.m, fontSize: 12, color: C.faint },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  mark: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: F.b, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: C.ink },
  newChat: { height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', gap: 6 },
  newText: { fontFamily: F.s, fontSize: 13, color: C.ink },
  empty: { flex: 1, justifyContent: 'center' },
  hello: { fontFamily: F.b, fontSize: 24, lineHeight: 30, color: C.ink },
  helloSub: { marginTop: 8, fontFamily: F.r, fontSize: 15, lineHeight: 22, color: C.muted },
  starter: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderRadius: 16, backgroundColor: C.card },
  starterText: { flex: 1, fontFamily: F.m, fontSize: 15, color: C.ink },
  bubble: { maxWidth: '88%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  mine: { alignSelf: 'flex-end', backgroundColor: C.ink, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: C.card, borderBottomLeftRadius: 6 },
  text: { fontFamily: F.r, fontSize: 16, lineHeight: 23, color: C.ink },
  voiceTag: { marginTop: 4, fontFamily: F.m, fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  tools: { gap: 4 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 22 },
  toolDot: { width: 6, height: 6, borderRadius: 3, marginHorizontal: 5, backgroundColor: C.growInk },
  toolText: { fontFamily: F.m, fontSize: 13, color: C.muted },
  composer: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: C.bg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontFamily: F.s, fontSize: 13, color: C.ink },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
});
