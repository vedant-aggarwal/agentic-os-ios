import { Image } from 'expo-image';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass } from '@/components/Glass';
import { Sym } from '@/components/Sym';
import { closeFile, type OpenFile, useOpenFile } from '@/lib/fileViewer';
import { type PcFileRead, pcImageSource, readPcFile, sendPathToPhone } from '@/lib/files';
import { C, F } from '@/theme';
import { IcClose, IcCopy, MONO, Press, useCopied } from '@/work/thread/ui';

// The sheet a tapped file link opens: the file on the PC. Text and code in a scrollable monospace view (jumps to the
// :line the link named, with Copy), images previewed, anything else shows its name and size with a button that brings
// it onto the phone through the PC-to-phone transfer. The PC refuses secret-looking files; the sheet says so.

const LINE_H = 18;
const CHAR_W = 7.23; // Menlo 12
const GUTTER = 44;
const MAX_COLS = 400; // a longer line is cut on screen; Copy still has all of it

const base = (p: string) => p.split(String.fromCharCode(92)).join('/').split('/').pop() ?? p;
const size = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

type State = { s: 'loading' } | { s: 'error'; msg: string } | { s: 'ok'; file: PcFileRead };

const Row = memo(function Row({ n, text, hit }: { n: number; text: string; hit: boolean }) {
  return (
    <View style={[st.line, hit && st.hit]}>
      <Text style={st.num}>{n}</Text>
      <Text style={st.code} numberOfLines={1}>{text.slice(0, MAX_COLS) || ' '}</Text>
    </View>
  );
});

function TextBody({ text, line, truncated }: { text: string; line?: number; truncated: boolean }) {
  const lines = useMemo(() => text.replace(/\r\n/g, '\n').split('\n'), [text]);
  const cols = useMemo(() => Math.min(MAX_COLS, lines.reduce((m, l) => Math.max(m, l.length), 20)), [lines]);
  const [h, setH] = useState(0);
  const ref = useRef<FlatList<string>>(null);
  const target = line ? Math.min(Math.max(line, 1), lines.length) : 0;
  const render = useCallback(({ item, index }: { item: string; index: number }) => <Row n={index + 1} text={item} hit={index + 1 === line} />, [line]);
  useEffect(() => {
    if (!target || !h) return;
    const t = setTimeout(() => ref.current?.scrollToOffset({ offset: Math.max(0, (target - 4) * LINE_H), animated: false }), 30);
    return () => clearTimeout(t);
  }, [target, h]);
  return (
    <View style={st.flex} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      {h ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} alwaysBounceHorizontal={false} style={{ height: h }}>
          <FlatList ref={ref} data={lines} renderItem={render} keyExtractor={(_, i) => String(i)} style={{ height: h, width: GUTTER + cols * CHAR_W + 24 }}
            getItemLayout={(_, i) => ({ length: LINE_H, offset: LINE_H * i, index: i })} initialNumToRender={60} windowSize={11}
            ListFooterComponent={truncated ? <Text style={st.note}>Showing the first 1 MB.</Text> : <View style={{ height: 24 }} />} />
        </ScrollView>
      ) : null}
    </View>
  );
}

function Other({ file }: { file: PcFileRead }) {
  const [got, setGot] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const get = async () => {
    setErr(null); setGot(0);
    try { await sendPathToPhone(file.path, (p) => setGot(p.size ? Math.round((p.got / p.size) * 100) : 0)); setGot(null); }
    catch (e) { setErr((e as Error).message || "Couldn't get the file."); setGot(null); }
  };
  return (
    <View style={st.center}>
      <Text style={st.bigName}>{file.name}</Text>
      <Text style={st.meta}>{size(file.size)}</Text>
      <Press accessibilityLabel="Get the file on this phone" disabled={got !== null} onPress={get} style={st.btn}>
        <Text style={st.btnText}>{got === null ? 'Get on this phone' : `Getting it, ${got}%`}</Text>
      </Press>
      {err ? <Text style={st.err}>{err}</Text> : null}
    </View>
  );
}

function Picture({ path }: { path: string }) {
  const [src, setSrc] = useState<{ uri: string; headers: Record<string, string> } | null>(null);
  useEffect(() => { void pcImageSource(path).then(setSrc); }, [path]);
  if (!src) return <View style={st.center}><ActivityIndicator color={C.muted} /></View>;
  return <Image source={src} contentFit="contain" style={st.flex} accessibilityLabel={base(path)} />;
}

function Sheet({ open }: { open: OpenFile }) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const key = `${open.path}|${open.at}`;
  const [got, setGot] = useState<{ key: string; r: State } | null>(null);
  const state: State = got?.key === key ? got.r : { s: 'loading' };
  const [copied, copy] = useCopied();
  useEffect(() => {
    let alive = true;
    readPcFile(open.path).then((file) => { if (alive) setGot({ key, r: { s: 'ok', file } }); })
      .catch((e: Error) => { if (alive) setGot({ key, r: { s: 'error', msg: e.message || "Couldn't open that file." } }); });
    return () => { alive = false; };
  }, [open.path, key]);
  const file = state.s === 'ok' ? state.file : null;
  return (
    <Modal visible animationType={reduce ? 'fade' : 'slide'} presentationStyle="fullScreen" onRequestClose={closeFile} statusBarTranslucent>
      <View style={[st.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={st.head}>
          <Press accessibilityLabel="Close the file" onPress={closeFile} style={st.round} scale={0.92}>
            <Glass radius={22} />
            <View><Sym name="xmark" size={15} color={C.text} fallback={<IcClose size={15} />} /></View>
          </Press>
          <View style={st.titles}>
            <Text style={st.name} numberOfLines={1}>{base(open.path)}</Text>
            <Text style={st.meta} numberOfLines={1}>{open.line ? `Line ${open.line}, ` : ''}{open.path}</Text>
          </View>
          <Press accessibilityLabel={file?.kind === 'text' ? 'Copy the file' : 'Copy the path'} onPress={() => { void copy(file?.kind === 'text' ? file.text : open.path); }} style={st.copyBtn}>
            <Sym name={copied ? 'checkmark' : 'doc.on.doc'} size={13} color={C.muted} fallback={<IcCopy size={13} color={C.muted} />} />
            <Text style={st.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
          </Press>
        </View>
        {state.s === 'loading' ? <View style={st.center}><ActivityIndicator color={C.muted} /></View>
          : state.s === 'error' ? <View style={st.center}><Text style={st.err}>{state.msg}</Text></View>
          : state.file.kind === 'text' ? <TextBody text={state.file.text} line={open.line} truncated={state.file.truncated} />
          : state.file.kind === 'image' ? <Picture path={open.path} />
          : <Other file={state.file} />}
      </View>
    </Modal>
  );
}

/** Mounted once, at the root: shows whichever file link was last tapped. */
export function FileViewer() {
  const open = useOpenFile();
  return open ? <Sheet open={open} /> : null;
}

const st = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: C.scene },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24, color: C.text },
  meta: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.faint },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, paddingHorizontal: 8 },
  copyText: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.muted },
  line: { flexDirection: 'row', height: LINE_H, alignItems: 'center' },
  hit: { backgroundColor: 'rgba(255,255,255,0.10)' },
  num: { width: GUTTER, paddingRight: 10, textAlign: 'right', fontFamily: MONO, fontSize: 12, lineHeight: LINE_H, color: C.faint },
  code: { fontFamily: MONO, fontSize: 12, lineHeight: LINE_H, color: C.textSoft },
  note: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.faint, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  bigName: { fontFamily: F.semibold, fontSize: 18, lineHeight: 26, color: C.text, textAlign: 'center' },
  err: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.muted, textAlign: 'center' },
  btn: { height: 48, paddingHorizontal: 24, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.text },
});
