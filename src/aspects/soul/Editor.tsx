import { requireOptionalNativeModule } from 'expo';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  addDays, Button, Card, Chip, dayLabel, Field, haptic, Icon, IconButton, Press, Screen, SURF, t, tint, today, useAspect,
} from '@/aspects/kit';
import { gptAvailable, useGptRecorder } from '@/lib/gpt';
import { call, fileSource, newId, upload, useCollection } from '@/lib/mod';
import { C, F } from '@/theme';
import { errText, refreshJournal, type Asked, type Entry, type Photo } from './data';
import { Gl } from './parts';
import { MOODS } from './words';

type Picker = typeof import('expo-image-picker');
/* eslint-disable @typescript-eslint/no-require-imports */
const picker: Picker | null = Platform.OS === 'web' || requireOptionalNativeModule('ExponentImagePicker') ? require('expo-image-picker') : null;
/* eslint-enable @typescript-eslint/no-require-imports */

export type Seed = { prompt?: string | null; date?: string; speak?: boolean };
const wordsIn = (x: string) => (x.trim() ? x.trim().split(/\s+/).length : 0);

/**
 * Writing one entry. Typed or spoken (his raw words are kept; a tidied version is offered, never forced), a mood in
 * one tap, photos, up to three follow-up questions, Today or Yesterday, a bookmark. It saves as he goes.
 */
export function Editor({ open, onClose, entry, seed }: { open: boolean; onClose: () => void; entry: Entry | null; seed: Seed | null }) {
  const { color, notice } = useAspect();
  const journal = useCollection<Entry>('growth', 'journal');
  const rec = useGptRecorder();
  const [id, setId] = useState('');
  const [date, setDate] = useState(today());
  const [p, setP] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [prompt, setPrompt] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [asked, setAsked] = useState<Asked[]>([]);
  const [answer, setAnswer] = useState('');
  const [bookmark, setBookmark] = useState(false);
  const [raw, setRaw] = useState<string | null>(null);
  const [tidy, setTidy] = useState<Entry['tidy']>(null);
  const [offer, setOffer] = useState<string | null>(null); // a tidy version waiting for his yes
  const [kind, setKind] = useState('typed');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [busy, setBusy] = useState<null | 'ask' | 'tidy' | 'photo' | 'listen'>(null);
  const [sure, setSure] = useState(false);
  const dirty = useRef(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const at = useRef('');

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      const e = entry;
      setId(e?.id ?? newId('jr')); setDate(e?.date ?? seed?.date ?? today()); setP(e?.p ?? null); setText(e?.text ?? '');
      setPrompt(e?.prompt ?? seed?.prompt ?? null); setPhotos(e?.photos ?? []); setAsked(e?.asked ?? []); setAnswer('');
      setBookmark(!!e?.bookmark); setRaw(e?.raw ?? null); setTidy(e?.tidy ?? null); setOffer(null); setKind(e?.kind ?? 'typed');
      setState(e ? 'saved' : 'idle'); setSure(false); dirty.current = false; at.current = e?.at ?? new Date().toISOString();
      if (seed?.speak) setTimeout(() => { void listen(); }, 350);
      // focus once the screen has slid in: focusing it off screen makes the web preview scroll the page sideways
      else if (!e) setTimeout(() => input.current?.focus(), 480);
    }
    wasOpen.current = open;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const doc = useCallback((): Entry => ({
    id, date, at: date === today() || at.current.slice(0, 10) === date ? at.current : new Date(`${date}T21:00:00+05:30`).toISOString(),
    text, kind, p, photos, prompt, asked, bookmark, raw, tidy, by: 'me', source: 'app',
  }), [id, date, text, kind, p, photos, prompt, asked, bookmark, raw, tidy]);

  const save = useCallback(async () => {
    if (!id || !dirty.current) return;
    const d = doc();
    if (!d.text.trim() && !d.photos?.length) return;
    dirty.current = false;
    setState('saving');
    try { await journal.put(d); setState('saved'); refreshJournal(); } catch (e) { setState('failed'); dirty.current = true; notice(errText(e)); }
  }, [id, doc, journal, notice]);

  // save a moment after he stops typing
  useEffect(() => {
    if (!open || !dirty.current) return;
    const tm = setTimeout(() => { void save(); }, 1200);
    return () => clearTimeout(tm);
  }, [open, text, p, photos, asked, bookmark, date, raw, tidy, prompt, save]);
  const touch = () => { dirty.current = true; setState('idle'); };

  const close = () => { void save(); if (rec.recording()) rec.cancel(); onClose(); };

  async function listen() {
    if (!gptAvailable) return notice('Speaking needs the phone app. Type here, or use the keyboard mic.');
    try { setBusy('listen'); await rec.start(); haptic.medium(); } catch (e) { setBusy(null); notice(errText(e)); }
  }
  const stopListening = async () => {
    try {
      const r = await rec.finish('none');
      haptic.light();
      if (r.text.trim()) {
        setText((x) => (x.trim() ? `${x.trim()}\n\n${r.text.trim()}` : r.text.trim()));
        setRaw((x) => (x ? `${x}\n\n${r.text.trim()}` : r.text.trim()));
        setKind('voice'); setTidy(null); touch();
      }
    } catch (e) { notice(errText(e)); } finally { setBusy(null); }
  };

  const askTidy = async () => {
    setBusy('tidy');
    try { const r = await call<{ text: string; v: string; at: string }>('/mod/soul/journal/tidy', { text: raw ?? text }); setOffer(r.text); setTidy({ text: r.text, v: r.v, at: r.at }); touch(); }
    catch (e) { notice(errText(e)); } finally { setBusy(null); }
  };
  const ask = async () => {
    setBusy('ask');
    try {
      const r = await call<{ q: string; v: string; at: string }>('/mod/soul/journal/ask', { text, prompt, asked: asked.map((x) => x.q) });
      setAsked((xs) => [...xs, { q: r.q, at: r.at, v: r.v }]); setAnswer(''); touch();
    } catch (e) { notice(errText(e)); } finally { setBusy(null); }
  };
  const addAnswer = () => {
    const a = answer.trim();
    if (!a) return;
    setAsked((xs) => xs.map((x, i) => (i === xs.length - 1 ? { ...x, a } : x)));
    setText((x) => `${x.trim()}\n\n${a}`);
    setAnswer(''); touch();
  };
  const addPhoto = async () => {
    if (!picker) return notice('Photos arrive with the next app build.');
    if (photos.length >= 6) return notice('Six photos is the most for one entry.');
    const res = await picker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, exif: false });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setBusy('photo');
    try {
      const r = await upload<{ item: { id: string }; path: string }>(`/mod/soul/photos?entry=${encodeURIComponent(id)}`, a.uri, a.mimeType ?? 'image/jpeg');
      setPhotos((xs) => [...xs, { file: r.item.id, path: r.path }]); touch();
    } catch (e) { notice(errText(e)); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!sure) { setSure(true); return; }
    try { if (entry) await journal.remove(entry.id); refreshJournal(); onClose(); } catch (e) { notice(errText(e)); }
  };

  const n = wordsIn(text);
  const last = asked.at(-1);
  const status = state === 'saving' ? 'Saving' : state === 'saved' ? 'Saved' : state === 'failed' ? 'Not saved' : n ? `${n} ${n === 1 ? 'word' : 'words'}` : '';
  return (
    <Screen open={open} onClose={close} immersive title={dayLabel(date)}
      right={<IconButton label={bookmark ? 'Remove bookmark' : 'Bookmark'} size={36} onPress={() => { setBookmark(!bookmark); touch(); }}>
        <Gl k={bookmark ? 'bookmarkOn' : 'bookmark'} size={16} color={bookmark ? color : C.text} />
      </IconButton>}>
      <View style={s.row}>
        {!entry || entry.date >= addDays(today(), -1) ? (
          <>
            <Chip label="Today" selected={date === today()} onPress={() => { setDate(today()); touch(); }} />
            <Chip label="Yesterday" selected={date === addDays(today(), -1)} onPress={() => { setDate(addDays(today(), -1)); touch(); }} />
          </>
        ) : null}
        <Text style={[t.caption, s.status]}>{status}</Text>
      </View>

      <View style={s.moods} accessibilityRole="radiogroup" accessibilityLabel="Mood">
        {MOODS.map((m) => (
          <Chip key={m.p} label={m.label} selected={p === m.p} onPress={() => { setP(p === m.p ? null : m.p); touch(); }} />
        ))}
      </View>

      {prompt ? (
        <View style={[s.prompt, { borderColor: tint(color, 0.35) }]}>
          <Text style={[t.strong, s.flex]}>{prompt}</Text>
          <IconButton label="Clear prompt" size={28} plain onPress={() => { setPrompt(null); touch(); }}><Icon name="close" size={12} color={C.muted} /></IconButton>
        </View>
      ) : null}

      <TextInput ref={input} value={text} onChangeText={(v) => { setText(v); touch(); }} multiline
        placeholder={prompt ? 'Write as much or as little as you like' : 'What happened today?'} placeholderTextColor={C.faint}
        selectionColor={color} keyboardAppearance="dark" textAlignVertical="top" accessibilityLabel="Entry" style={s.input} />

      {busy === 'listen' ? (
        <Card tone={color}>
          <Text style={t.caption}>Listening</Text>
          <Text style={[t.body, s.gap4]}>{rec.live || 'Speak freely. Hinglish is fine.'}</Text>
          {rec.offline ? <Text style={[t.caption, s.gap4]}>The PC isn&apos;t getting the audio right now. It&apos;s kept on this phone.</Text> : null}
          <Button label="Done speaking" kind="accent" small onPress={stopListening} wrap={[s.self, s.gap8]} icon={<Gl k="stop" size={14} color="#14161C" />} />
        </Card>
      ) : null}

      <View style={s.tools}>
        <Tool label="Speak" onPress={listen} disabled={!!busy}><Icon name="mic" size={18} /></Tool>
        <Tool label="Photo" onPress={addPhoto} disabled={!!busy}><Icon name="camera" size={18} /></Tool>
        <Tool label={asked.length ? 'Another question' : 'Ask me'} onPress={ask} disabled={!!busy || n < 8 || asked.length >= 3 || (last != null && last.a === undefined)}>
          <Gl k="sparkles" size={18} />
        </Tool>
      </View>
      {busy === 'ask' ? <Text style={t.caption}>Thinking of a question…</Text> : null}
      {busy === 'photo' ? <Text style={t.caption}>Sending the photo…</Text> : null}
      {n > 0 && n < 8 && !asked.length ? <Text style={t.caption}>After a few more words, Ask me offers one question about what you wrote.</Text> : null}

      {asked.map((x, i) => (
        <View key={x.at} style={s.ask}>
          <Text style={[t.strong, { color }]}>{x.q}</Text>
          {x.a ? <Text style={t.small}>Your answer is in the entry.</Text> : x.a === '' ? <Text style={t.small}>Skipped.</Text> : i === asked.length - 1 ? (
            <>
              <Field value={answer} onChangeText={setAnswer} placeholder="Answer, or leave it" multiline />
              <View style={s.row}>
                <Button label="Add to entry" kind="soft" small onPress={addAnswer} disabled={!answer.trim()} />
                <Button label="Skip" kind="quiet" small onPress={() => { setAsked((xs) => xs.map((y, j) => (j === i ? { ...y, a: '' } : y))); touch(); }} />
              </View>
            </>
          ) : null}
        </View>
      ))}

      {raw && !offer && !tidy ? (
        <Button label={busy === 'tidy' ? 'Tidying' : 'Tidy what I said'} kind="quiet" small onPress={askTidy} busy={busy === 'tidy'} wrap={s.self} />
      ) : null}
      {offer ? (
        <Card>
          <Text style={t.caption}>Tidied version</Text>
          <Text style={[t.body, s.gap4]}>{offer}</Text>
          <View style={[s.row, s.gap8]}>
            <Button label="Use this" kind="soft" small onPress={() => { setText(offer); setOffer(null); touch(); }} />
            <Button label="Keep mine" kind="quiet" small onPress={() => { setOffer(null); }} />
          </View>
        </Card>
      ) : null}
      {raw && tidy && text !== raw && !offer ? (
        <Press label="Show my spoken words" onPress={() => { setText(raw); touch(); }} style={s.self}>
          <Text style={t.label}>Back to my spoken words</Text>
        </Press>
      ) : null}

      {photos.length ? (
        <View style={s.photos}>
          {photos.map((ph) => (
            <View key={ph.file} style={s.photo}>
              <Image source={fileSource(ph.path)} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Photo" />
              <IconButton label="Remove photo" size={28} wrap={s.photoX} onPress={() => { setPhotos((xs) => xs.filter((y) => y.file !== ph.file)); touch(); }}>
                <Icon name="close" size={12} />
              </IconButton>
            </View>
          ))}
        </View>
      ) : null}

      {entry ? <Button label={sure ? 'Tap again to delete' : 'Delete entry'} kind="danger" small onPress={remove} wrap={s.self} /> : null}
    </Screen>
  );
}

function Tool({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Press label={label} onPress={onPress} disabled={disabled} style={s.tool}>
      {children}
      <Text style={s.toolText}>{label}</Text>
    </Press>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  status: { marginLeft: 'auto' },
  moods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  prompt: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingLeft: 16, borderRadius: 16, borderWidth: 1, borderCurve: 'continuous' },
  flex: { flex: 1 },
  input: { minHeight: 200, color: C.text, fontFamily: F.regular, fontSize: 18, lineHeight: 28, padding: 0, outlineWidth: 0, outlineStyle: 'none' } as never,
  tools: { flexDirection: 'row', gap: 8 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: SURF.card },
  toolText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.textSoft },
  ask: { gap: 8, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: SURF.line },
  self: { alignSelf: 'flex-start' },
  gap4: { marginTop: 4 },
  gap8: { marginTop: 8 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 104, height: 104, borderRadius: 16, overflow: 'hidden', backgroundColor: SURF.card },
  photoX: { position: 'absolute', top: 4, right: 4 },
});
