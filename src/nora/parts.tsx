import type { SymbolViewProps } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Glyph, Icon, IconButton, Press, SURF, t } from '@/aspects/kit';
import { Glass } from '@/components/Glass';
import { C, F } from '@/theme';
import type { Attach } from './attach';
import type { useDictate } from './useDictate';

// Pieces shared by Nora's chat, Home and call screens.

/** Nora's colour: the rose of her orb. Only for what is hers and live (a take, a call, her ring). */
export const NORA = '#F0457A';

// SF Symbols with the 24 grid path the web preview draws
const G: Record<string, readonly [SymbolViewProps['name'], string, boolean?]> = {
  phone: ['phone.fill', 'M6.5 3.5h3l1.5 4.5-2 1.5a10 10 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5A16.5 16.5 0 0 1 5 5a1.5 1.5 0 0 1 1.5-1.5z', true],
  hangup: ['phone.down.fill', 'M2.5 13.5c5.2-4.6 13.8-4.6 19 0l-2.6 2.8-3.9-1.4v-2.6a12 12 0 0 0-6 0v2.6l-3.9 1.4z', true],
  speaker: ['speaker.wave.2.fill', 'M4 9h3.5L12 5v14l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11'],
  mic: ['mic.fill', 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3'],
  micOff: ['mic.slash.fill', 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16'],
  stop: ['stop.fill', 'M7 7h10v10H7z', true],
  sparkle: ['sparkle', 'M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7z', true],
  chat: ['bubble.left.fill', 'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'],
  image: ['photo', 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01'],
};
export function NGlyph({ name, size = 20, color = C.text }: { name: keyof typeof G; size?: number; color?: string }) {
  const [sf, d, filled] = G[name];
  return <Glyph sf={sf} d={d} size={size} color={color} filled={!!filled} />;
}

/** A full-screen surface's top: its title, any buttons, and Close in the same spot every time. */
export function TopRow({ title, sub, onClose, children }: { title: string; sub?: string | null; onClose: () => void; children?: React.ReactNode }) {
  return (
    <View style={s.top}>
      <View style={s.topText}>
        <Text accessibilityRole="header" numberOfLines={1} style={t.title2}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={t.small}>{sub}</Text> : null}
      </View>
      {children}
      <IconButton label="Close" onPress={onClose}><Icon name="close" size={16} /></IconButton>
    </View>
  );
}

/** Three dots that breathe in turn while she works. Still under Reduce Motion. */
export function Dots({ color = C.muted }: { color?: string }) {
  return (
    <View style={s.dots} accessibilityElementsHidden>
      {[0, 1, 2].map((i) => <Dot key={i} i={i} color={color} />)}
    </View>
  );
}
function Dot({ i, color }: { i: number; color: string }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(0.35);
  useEffect(() => {
    if (reduce) return;
    const id = setTimeout(() => o.set(withRepeat(withTiming(1, { duration: 520 }), -1, true)), i * 170);
    return () => clearTimeout(id);
  }, [reduce, o, i]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[s.dot, { backgroundColor: color }, st]} />;
}

/** m:ss since `since`, ticking once a second. */
export function useElapsed(since: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [since]);
  return since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
}

/**
 * The reply box: type, or tap the mic and talk. While a take runs its words fill in as the PC hears them; the send
 * button stops the take and sends what was said in one tap, the mic button stops it and leaves the words to edit.
 */
export function Composer({ draft, setDraft, onSend, dict, placeholder, sending = false, autoFocus, label = 'Message', inset = false, attach }: {
  draft: string; setDraft: (v: string) => void; onSend: (text: string) => void; dict: ReturnType<typeof useDictate>;
  placeholder: string; sending?: boolean; autoFocus?: boolean; label?: string;
  /** inside a card: a plain filled field, no glass or shadow on top of the card's own surface */
  inset?: boolean;
  /** pictures to go with the message (chat only): a picture button, and the picked ones above the field */
  attach?: Attach;
}) {
  const rec = dict.state !== 'idle';
  const pics = attach?.pics ?? [];
  const canSend = !sending && dict.state !== 'finishing' && (attach?.ready ?? true) && (rec || !!draft.trim() || !!attach?.ids.length);
  const join = (a: string, b: string) => (a.trim() ? `${a.trim()} ${b}` : b);
  const micTap = async () => {
    if (dict.state === 'idle') { void dict.start(); return; }
    if (dict.state !== 'recording') return;
    const { text: words, enter } = await dict.stopEnter();
    const text = words ? join(draft, words) : draft.trim();
    // ended with "press enter": send it, as the PC would have pressed Enter
    if (enter && text && !sending && (attach?.ready ?? true)) { setDraft(''); onSend(text); return; }
    if (words) setDraft(text);
  };
  const send = async () => {
    if (!canSend) return;
    if (dict.state === 'recording') {
      const words = await dict.stop();
      const text = words ? join(draft, words) : draft.trim();
      if (!text) return;
      setDraft('');
      onSend(text);
      return;
    }
    const text = draft.trim();
    setDraft('');
    onSend(text);
  };
  // a desktop keyboard: Enter sends, Shift+Enter starts a new line. The phone's Return sends too (it only ever added a
  // new line, so dictated words, from the mic here or a keyboard's, couldn't be sent with Enter); the field still wraps.
  const keys = Platform.OS === 'web' ? {
    onKeyPress: (e: { nativeEvent: { key: string; shiftKey?: boolean }; preventDefault?: () => void }) => {
      if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) { e.preventDefault?.(); void send(); }
    },
  } : { submitBehavior: 'submit' as const, returnKeyType: 'send' as const, onSubmitEditing: () => { void send(); } };
  return (
    <View style={s.composer}>
      {pics.length ? (
        <View style={s.pics}>
          {pics.map((p) => (
            <View key={p.key} style={[s.pic, p.error && { borderColor: C.danger }]}>
              <Image source={{ uri: p.uri }} style={s.picImg} accessibilityIgnoresInvertColors />
              {!p.id && !p.error ? <View style={s.picBusy}><ActivityIndicator size="small" color={C.text} /></View> : null}
              <Press label="Remove picture" onPress={() => attach!.remove(p.key)} hitSlop={6} style={s.picX}>
                <Icon name="close" size={10} color={C.text} />
              </Press>
            </View>
          ))}
          {pics.some((p) => p.error) ? <Text style={[t.caption, { color: C.danger, alignSelf: 'center' }]}>{pics.find((p) => p.error)!.error}</Text> : null}
        </View>
      ) : null}
      {dict.error ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={s.note}>
          <Text style={[t.small, s.flex]}>{dict.error}</Text>
          <Press label="Dismiss" onPress={dict.clearError} hitSlop={10} style={s.noteX}><Icon name="close" size={12} color={C.muted} /></Press>
        </Animated.View>
      ) : null}
      <View style={[s.bar, inset ? s.barInset : s.barFloat]}>
        {inset ? null : <Glass radius={26} />}
        {attach?.pick && !rec ? (
          <Press label="Add pictures" onPress={attach.pick} scale={0.9} style={s.round}>
            <NGlyph name="image" size={20} color={C.muted} />
          </Press>
        ) : null}
        <Press label={rec ? 'Stop talking and edit' : 'Talk instead of typing'} onPress={micTap} scale={0.9}
          style={[s.round, rec && { backgroundColor: NORA }]}>
          {dict.state === 'finishing' ? <ActivityIndicator size="small" color={C.text} />
            : rec ? <NGlyph name="stop" size={14} /> : <Icon name="mic" size={20} color={C.muted} />}
        </Press>
        {rec ? (
          <View style={s.live} accessibilityLiveRegion="polite">
            <Text style={[t.body, !dict.live && { color: C.faint }]} numberOfLines={4}>
              {draft.trim() ? `${draft.trim()} ` : ''}{dict.live || (dict.state === 'finishing' ? 'Getting the last words' : 'Listening')}
            </Text>
            {dict.offline ? <Text style={t.caption}>The PC isn&apos;t hearing this yet. It&apos;s saved on the phone.</Text> : null}
          </View>
        ) : (
          <TextInput value={draft} onChangeText={setDraft} placeholder={placeholder} placeholderTextColor={C.faint}
            multiline {...WEB_ONE_ROW} style={s.input} keyboardAppearance="dark" accessibilityLabel={label} autoFocus={autoFocus}
            submitBehavior="newline" {...keys} />
        )}
        <Press label="Send" onPress={send} disabled={!canSend} scale={0.9} style={[s.round, s.send]}>
          {sending ? <ActivityIndicator size="small" color={C.scene} /> : <Icon name="arrowUp" size={18} color={C.scene} />}
        </Press>
      </View>
    </View>
  );
}

// a web textarea starts two rows tall; the phone's field starts at one line and grows
const WEB_ONE_ROW = Platform.OS === 'web' ? { rows: 1 } : null;

const s = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  topText: { flex: 1, minWidth: 0 },
  dots: { flexDirection: 'row', gap: 4, alignItems: 'center', height: 20 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  composer: { gap: 8 },
  pics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 4 },
  pic: { width: 64, height: 64, borderRadius: 14, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.line, backgroundColor: SURF.track },
  picImg: { width: '100%', height: '100%' },
  picBusy: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  picX: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)' },
  note: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 4, minHeight: 44, borderRadius: 16,
    borderCurve: 'continuous', backgroundColor: 'rgba(30,31,35,0.96)', borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.line,
  },
  noteX: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, minHeight: 52, borderRadius: 26, padding: 4 },
  barFloat: { boxShadow: '0 12px 32px rgba(0,0,0,0.4)' },
  barInset: { backgroundColor: SURF.track },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  send: { backgroundColor: C.text },
  // web preview only: position keeps the textarea above the absolute Glass, a 0 wide solid outline drops the focus ring
  input: { flex: 1, position: 'relative', outlineStyle: 'solid', outlineWidth: 0, fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.text, maxHeight: 132, paddingTop: 10, paddingBottom: 10, paddingHorizontal: 4 },
  live: { flex: 1, minHeight: 44, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 4, gap: 2 },
});
