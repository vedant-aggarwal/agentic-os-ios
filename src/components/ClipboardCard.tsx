import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { lightTap } from '@/components/Glass';
import { Sym } from '@/components/Sym';
import { api, ApiError } from '@/lib/api';
import { C, F } from '@/theme';

// Clipboard, inside the Files sheet. Only while the sheet is open (no always-on sync):
// "Send to PC" puts this phone's copied text on the PC clipboard; "Get from PC" copies the PC's onto this phone.
// Below, the PC's recent copies (the server keeps the last 30 in memory); tap one to copy it here.
type Clip = typeof import('expo-clipboard');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const clip: Clip | null = requireOptionalNativeModule('ExpoClipboard') ? require('expo-clipboard') : null;

type Item = { id: number; text: string; at: string; from: 'pc' | 'phone' };
type State = { text: string; history: Item[] };
const POLL_MS = 3000;
const SHOWN = 8;

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
};
const errText = (e: unknown) => (e instanceof ApiError ? e.message : String((e as Error)?.message ?? "Couldn't reach your PC."));

export function ClipboardCard({ open }: { open: boolean }) {
  const [st, setSt] = useState<State | null>(null);
  const [busy, setBusy] = useState<'send' | 'get' | null>(null);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const load = () => api<State>('/pc/clipboard').then((s) => { if (live) setSt(s); }).catch(() => {});
    const first = setTimeout(load, 0);
    const id = setInterval(load, POLL_MS);
    return () => { live = false; clearTimeout(first); clearInterval(id); };
  }, [open]);
  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), 2600);
    return () => clearTimeout(id);
  }, [note]);

  const send = async () => {
    if (!clip) return setNote({ text: 'Clipboard arrives with the next app build.', bad: true });
    lightTap(); setBusy('send');
    try {
      const text = await clip.getStringAsync();
      if (!text) { setNote({ text: 'Nothing copied on this phone.', bad: true }); return; }
      await api('/pc/clipboard', { method: 'POST', body: { text } });
      setNote({ text: `Sent to the PC clipboard · ${text.length} characters` });
      setSt(await api<State>('/pc/clipboard'));
    } catch (e) { setNote({ text: errText(e), bad: true }); } finally { setBusy(null); }
  };
  const copyHere = async (text: string, label: string) => {
    if (!clip) return setNote({ text: 'Clipboard arrives with the next app build.', bad: true });
    lightTap();
    await clip.setStringAsync(text);
    setNote({ text: label });
  };
  const get = async () => {
    setBusy('get');
    try {
      const s = await api<State>('/pc/clipboard');
      setSt(s);
      if (!s.text) setNote({ text: 'The PC clipboard has no text right now.', bad: true });
      else await copyHere(s.text, 'Copied the PC clipboard to this phone');
    } catch (e) { setNote({ text: errText(e), bad: true }); } finally { setBusy(null); }
  };

  const items = st?.history ?? [];
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.section}>Clipboard</Text>
      <View style={s.row}>
        <Btn icon="arrow.up.doc.on.clipboard" label="Send to PC" busy={busy === 'send'} onPress={() => void send()} />
        <Btn icon="doc.on.clipboard" label="Get from PC" busy={busy === 'get'} onPress={() => void get()} />
      </View>
      {note ? <Text style={[s.note, note.bad && { color: C.danger }]}>{note.text}</Text> : null}
      {st === null ? null : items.length === 0 ? (
        <Text style={s.faint}>Nothing copied on the PC since the server started.</Text>
      ) : (
        <>
          <Text style={s.sub}>On the PC, newest first · tap to copy here</Text>
          {shown.map((c) => (
            <Animated.View key={c.id} entering={FadeIn.duration(160)} layout={LinearTransition.duration(180)}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Copy: ${c.text.slice(0, 60)}`}
                onPress={() => void copyHere(c.text, 'Copied to this phone')}
                style={({ pressed }) => [s.item, pressed && { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                <Text style={s.itemText} numberOfLines={3}>{c.text.trim()}</Text>
                <Text style={s.itemMeta}>{c.from === 'phone' ? 'From this phone' : 'Copied on PC'} · {ago(c.at)} · {c.text.length} chars</Text>
              </Pressable>
            </Animated.View>
          ))}
          {items.length > SHOWN ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { lightTap(); setAll(!all); }}>
              <Text style={s.link}>{all ? 'Show fewer' : `Show all ${items.length}`}</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

function Btn({ icon, label, busy, onPress }: { icon: string; label: string; busy: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy} onPress={onPress}
      style={({ pressed }) => [s.btn, pressed && { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
      {busy ? <ActivityIndicator color={C.text} /> : <Sym name={icon as never} size={18} color={C.text} fallback={null} />}
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  section: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.muted, marginTop: 10, paddingHorizontal: 4 },
  row: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, height: 48, borderRadius: 16, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  btnText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 18, color: C.text },
  note: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: '#3DDC97', paddingHorizontal: 4 },
  faint: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.faint, paddingHorizontal: 4 },
  sub: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint, paddingHorizontal: 4 },
  item: { padding: 12, gap: 4, borderRadius: 14, borderCurve: 'continuous', backgroundColor: 'rgba(255,255,255,0.04)' },
  itemText: { fontFamily: F.medium, fontSize: 14, lineHeight: 19, color: C.text },
  itemMeta: { fontFamily: F.medium, fontSize: 11, lineHeight: 14, color: C.faint },
  link: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: '#9A90FF', paddingHorizontal: 4 },
});
