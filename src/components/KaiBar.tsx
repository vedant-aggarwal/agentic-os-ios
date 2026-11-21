import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chevron, SparkIcon } from './Icons';
import { Press } from './Press';
import { VoiceField } from './VoiceField';
import { sendToKai, stopKai, useKai, type KaiContext } from '@/lib/kai';
import { C, F } from '@/theme';

type Props = {
  /** What is on screen, so "this" means the right thing to Kai. */
  context: KaiContext;
  placeholder?: string;
  /** One-tap asks shown before the first message on this screen. */
  suggestions?: string[];
  /** Called when a Kai turn finishes, so the screen can reload what Kai may have changed. */
  onDone?: () => void;
};

/**
 * Kai, floating at the bottom of a planning screen. Type, talk or tap a suggestion; Kai's replies open in a
 * panel above the bar. It is the same conversation as the Kai tab, with this screen as context.
 */
export function KaiBar({ context, placeholder = 'Ask Kai to change anything here', suggestions = [], onDone }: Props) {
  const insets = useSafeAreaInsets();
  const { messages, busy } = useKai();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [mine] = useState(() => messages.length); // messages from before this screen opened stay in the Kai tab
  const list = useRef<ComponentRef<typeof ScrollView>>(null);

  // When Kai finishes a turn, the screen reloads what it may have changed.
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (wasBusy.current && !busy) onDone?.();
    wasBusy.current = busy;
  }, [busy, onDone]);

  const shown = messages.length >= mine ? messages.slice(mine) : messages; // a New chat elsewhere empties the list
  const last = shown[shown.length - 1];
  useEffect(() => {
    const t = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [shown.length, last?.text, last?.tools.length]);

  const send = (t = text) => {
    const m = t.trim();
    if (!m) return;
    setText('');
    setOpen(true);
    Keyboard.dismiss();
    sendToKai(m, { context });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap} pointerEvents="box-none">
      {open && shown.length ? (
        <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={styles.panel}>
          <View style={styles.panelHead}>
            <View style={styles.mark}>
              <SparkIcon size={12} color="#fff" />
            </View>
            <Text style={styles.panelTitle}>Kai</Text>
            <Press style={styles.headBtn} scale={0.94} onPress={() => router.navigate('/kai')} accessibilityLabel="Open the full chat">
              <Text style={styles.headBtnText}>Full chat</Text>
            </Press>
            <Press style={styles.headIcon} scale={0.9} onPress={() => setOpen(false)} accessibilityLabel="Hide Kai's replies">
              <View style={{ transform: [{ rotate: '-90deg' }] }}>
                <Chevron size={16} color={C.muted} />
              </View>
            </Press>
          </View>
          <ScrollView ref={list} style={{ maxHeight: 230 }} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {shown.map((m) =>
              m.role === 'user' ? (
                <View key={m.id} style={[styles.bubble, styles.mineB]}>
                  <Text style={[styles.text, { color: '#fff' }]}>{m.text}</Text>
                </View>
              ) : (
                <View key={m.id} style={{ gap: 4 }}>
                  {m.tools.map((t, i) => (
                    <View key={i} style={styles.tool}>
                      {!m.done && i === m.tools.length - 1 ? <ActivityIndicator size="small" color={C.muted} style={{ transform: [{ scale: 0.6 }] }} /> : <View style={styles.toolDot} />}
                      <Text style={styles.toolText}>{t}</Text>
                    </View>
                  ))}
                  {m.text.trim() || m.error ? (
                    <View style={[styles.bubble, styles.theirs]}>
                      <Text style={[styles.text, m.error && !m.text.trim() && { color: C.muted }]}>{m.text.trim() || m.error}</Text>
                    </View>
                  ) : !m.done && !m.tools.length ? (
                    <View style={[styles.bubble, styles.theirs]}>
                      <ActivityIndicator size="small" color={C.muted} />
                    </View>
                  ) : null}
                </View>
              ),
            )}
          </ScrollView>
        </Animated.View>
      ) : null}

      {!shown.length && suggestions.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sugs} keyboardShouldPersistTaps="handled">
          {suggestions.map((s) => (
            <Press key={s} style={styles.sug} scale={0.96} onPress={() => send(s)} disabled={busy}>
              <Text style={styles.sugText}>{s}</Text>
            </Press>
          ))}
        </ScrollView>
      ) : null}

      <View style={[styles.bar, { marginBottom: Math.max(insets.bottom, 12) }]}>
        {shown.length && !open ? (
          <Press style={styles.reopen} scale={0.94} onPress={() => setOpen(true)} accessibilityLabel="Show Kai's replies">
            <SparkIcon size={14} color={C.ink} />
            <Text style={styles.reopenText}>{busy ? 'Kai is working…' : 'Show Kai'}</Text>
          </Press>
        ) : null}
        <VoiceField
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          minHeight={50}
          onFocus={() => shown.length && setOpen(true)}
          right={
            busy ? (
              <Press style={styles.send} onPress={stopKai} scale={0.9} accessibilityLabel="Stop Kai">
                <View style={styles.stopSq} />
              </Press>
            ) : (
              <Press style={[styles.send, !text.trim() && { opacity: 0.35 }]} disabled={!text.trim()} onPress={() => send()} scale={0.9} accessibilityLabel="Send to Kai">
                <Chevron size={18} color="#fff" dir="right" />
              </Press>
            )
          }
        />
      </View>
    </KeyboardAvoidingView>
  );
}

/** Space to leave under a screen's content so the floating bar never covers the last item. */
export const KAI_BAR_SPACE = 120;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12 },
  panel: {
    marginBottom: 8,
    padding: 12,
    borderRadius: 24,
    backgroundColor: C.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(20,20,20,0.1)',
    shadowColor: '#141414',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  mark: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  panelTitle: { flex: 1, fontFamily: F.b, fontSize: 15, color: C.ink },
  headBtn: { height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: C.card, justifyContent: 'center' },
  headBtnText: { fontFamily: F.s, fontSize: 12, color: C.ink },
  headIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '90%', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 16 },
  mineB: { alignSelf: 'flex-end', backgroundColor: C.ink, borderBottomRightRadius: 5 },
  theirs: { alignSelf: 'flex-start', backgroundColor: C.card, borderBottomLeftRadius: 5 },
  text: { fontFamily: F.r, fontSize: 15, lineHeight: 21, color: C.ink },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 20 },
  toolDot: { width: 6, height: 6, borderRadius: 3, marginHorizontal: 4, backgroundColor: C.growInk },
  toolText: { flex: 1, fontFamily: F.m, fontSize: 12, lineHeight: 16, color: C.muted },
  sugs: { gap: 8, paddingBottom: 8, paddingHorizontal: 2 },
  sug: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: C.bg, borderWidth: 1, borderColor: 'rgba(20,20,20,0.12)', justifyContent: 'center' },
  sugText: { fontFamily: F.s, fontSize: 13, color: C.ink },
  bar: {
    borderRadius: 22,
    shadowColor: '#141414',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  reopen: { position: 'absolute', top: -40, alignSelf: 'center', zIndex: 2, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: C.bg, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(20,20,20,0.12)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  reopenText: { fontFamily: F.s, fontSize: 12, color: C.ink },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  stopSq: { width: 13, height: 13, borderRadius: 3, backgroundColor: '#fff' },
});
