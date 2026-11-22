import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, type ListRenderItem, Modal, ScrollView, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass } from '@/components/Glass';
import { Sym } from '@/components/Sym';
import { DEMO } from '@/lib/demo';
import { C, F } from '@/theme';
import { workApi } from '../api';
import { demoPatch } from './demoThread';
import { type DiffLine, type ParsedDiff, parsePatch, pickPatch } from './diff';
import type { ChangeFile } from './model';
import { ADD, DEL, IcBack, IcChevron, IcClose, MONO, Press } from './ui';

// Full screen diff for one turn: a page per file, swipe or use the arrows to move between them. Each file's patch is
// fetched when its page comes near (and kept for the session), drawn as a unified diff in monospace. Long lines scroll
// sideways; when a file has none, a sideways swipe moves to the next file.

export type DiffTarget = { turn: number; files: ChangeFile[]; index: number };

const LINE_H = 18;
const CHAR_W = 7.23; // Menlo 12
const loaded = new Map<string, ParsedDiff>();

const base = (p: string) => p.replace(/\\/g, '/').split('/').pop() ?? p;
const dir = (p: string) => { const n = p.replace(/\\/g, '/'); const i = n.lastIndexOf('/'); return i > 0 ? n.slice(0, i) : ''; };

const Line = memo(function Line({ line, gutter }: { line: DiffLine; gutter: number }) {
  const st = line.t === 'add' ? s.lAdd : line.t === 'del' ? s.lDel : line.t === 'hunk' ? s.lHunk : null;
  const tx = line.t === 'add' ? s.tAdd : line.t === 'del' ? s.tDel : line.t === 'hunk' || line.t === 'meta' ? s.tHunk : s.tCtx;
  return (
    <View style={[s.line, st]}>
      <Text style={[s.num, { width: gutter }]}>{line.num ?? ''}</Text>
      <Text style={[s.code, tx]} numberOfLines={1}>{line.text}</Text>
    </View>
  );
});

// `height` is the pager's measured height: flex: 1 inside a horizontal list cell came out 0 tall on web.
function FilePage({ jobId, turn, file, width, height }: { jobId: string; turn: number; file: ChangeFile; width: number; height: number }) {
  const key = `${jobId}:${turn}:${file.path}`;
  const [diff, setDiff] = useState<ParsedDiff | null>(() => loaded.get(key) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (loaded.has(key)) return;
    let alive = true;
    (async () => {
      try {
        const patch = DEMO ? demoPatch(file.path) : pickPatch(await workApi.diff(jobId, turn, file.path), file.path);
        const parsed = parsePatch(patch);
        loaded.set(key, parsed);
        if (alive) { setDiff(parsed); setError(null); }
      } catch (e) {
        if (alive) setError((e as Error).message || "Couldn't load this file.");
      }
    })();
    return () => { alive = false; };
  }, [key, jobId, turn, file.path, nonce]);

  const maxNum = diff ? diff.lines.reduce((m, l) => Math.max(m, l.num ?? 0), 0) : 0;
  const gutter = Math.max(2, String(maxNum).length) * CHAR_W + 16;
  const contentW = diff ? Math.max(width, gutter + diff.width * CHAR_W + 24) : width;
  const render = useCallback<ListRenderItem<DiffLine>>(({ item }) => <Line line={item} gutter={gutter} />, [gutter]);

  let body: React.ReactNode;
  if (error) {
    body = (
      <View style={s.center}>
        <Text style={s.stateTitle}>This file didn&apos;t load</Text>
        <Text style={s.stateBody}>{error}</Text>
        <Press accessibilityLabel="Try again" onPress={() => { setError(null); setNonce((n) => n + 1); }} style={s.retry}>
          <Text style={s.retryText}>Try again</Text>
        </Press>
      </View>
    );
  } else if (!diff) {
    body = <View style={s.center}><ActivityIndicator color={C.muted} /><Text style={s.stateBody}>Loading the diff</Text></View>;
  } else if (!diff.lines.length) {
    body = (
      <View style={s.center}>
        <Text style={s.stateTitle}>No text changes to show</Text>
        <Text style={s.stateBody}>{diff.notes.length ? diff.notes.join('\n') : 'It may be a binary file, or only its name or mode changed.'}</Text>
      </View>
    );
  } else if (height > 0) {
    body = (
      <ScrollView horizontal scrollEnabled={contentW > width} nestedScrollEnabled directionalLockEnabled
        alwaysBounceHorizontal={false} showsHorizontalScrollIndicator={contentW > width}>
        <FlatList
          data={diff.lines}
          renderItem={render}
          keyExtractor={(_, i) => String(i)}
          getItemLayout={(_, i) => ({ length: LINE_H, offset: LINE_H * i, index: i })}
          initialNumToRender={60}
          maxToRenderPerBatch={80}
          windowSize={9}
          style={{ width: contentW, height }}
          contentContainerStyle={s.lines}
          ListHeaderComponent={diff.notes.length ? <Text style={s.notes}>{diff.notes.join('\n')}</Text> : undefined}
        />
      </ScrollView>
    );
  }
  return (
    <View style={{ width, height }}>
      {body}
    </View>
  );
}

export function DiffViewer({ jobId, target, onClose }: { jobId: string; target: DiffTarget; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const pager = useRef<FlatList<ChangeFile>>(null);
  const [index, setIndex] = useState(target.index);
  const [pageH, setPageH] = useState(0);
  const { files } = target;
  const file = files[index] ?? files[0];
  const go = (i: number) => {
    const n = Math.max(0, Math.min(files.length - 1, i));
    setIndex(n);
    pager.current?.scrollToIndex({ index: n, animated: true });
  };
  const render = useCallback<ListRenderItem<ChangeFile>>(
    ({ item }) => <FilePage jobId={jobId} turn={target.turn} file={item} width={width} height={pageH} />, [jobId, target.turn, width, pageH]);

  return (
    <Modal visible animationType={reduce ? 'fade' : 'slide'} presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
      <View style={[s.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={s.head}>
          <Press accessibilityLabel="Close the diff" onPress={onClose} style={s.round} scale={0.92}>
            <Glass radius={22} />
            <View><Sym name="xmark" size={15} color={C.text} fallback={<IcClose size={15} />} /></View>
          </Press>
          <View style={s.titles} accessibilityLiveRegion="polite">
            <Text style={s.name} numberOfLines={1}>{file ? base(file.path) : 'No files'}</Text>
            <View style={s.metaRow}>
              {file ? <Text style={[s.count, { color: ADD }]}>+{file.add}</Text> : null}
              {file ? <Text style={[s.count, { color: DEL }]}>−{file.del}</Text> : null}
              {files.length > 1 ? <Text style={s.meta}>{index + 1} of {files.length}</Text> : null}
              {file && dir(file.path) ? <Text style={[s.meta, s.flex]} numberOfLines={1} ellipsizeMode="head">{dir(file.path)}</Text> : null}
            </View>
          </View>
          {files.length > 1 ? (
            <View style={s.arrows}>
              <Press accessibilityLabel="Previous file" disabled={index === 0} onPress={() => go(index - 1)} style={[s.round, index === 0 && s.off]} scale={0.92}>
                <Glass radius={22} />
                <View><Sym name="chevron.left" size={15} color={C.text} fallback={<IcBack size={15} />} /></View>
              </Press>
              <Press accessibilityLabel="Next file" disabled={index === files.length - 1} onPress={() => go(index + 1)}
                style={[s.round, index === files.length - 1 && s.off]} scale={0.92}>
                <Glass radius={22} />
                <View><Sym name="chevron.right" size={15} color={C.text} fallback={<IcChevron size={15} />} /></View>
              </Press>
            </View>
          ) : null}
        </View>
        <FlatList
          ref={pager}
          data={files}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(f) => f.path}
          renderItem={render}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          initialScrollIndex={target.index}
          initialNumToRender={1}
          windowSize={3}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            if (i !== index && i >= 0 && i < files.length) setIndex(i);
          }}
          onLayout={(e) => setPageH(e.nativeEvent.layout.height)}
          extraData={pageH}
          style={s.flex}
        />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: C.scene },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.35 },
  titles: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24, color: C.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint },
  count: { fontFamily: MONO, fontSize: 12, lineHeight: 16 },
  arrows: { flexDirection: 'row', gap: 8 },
  lines: { paddingVertical: 8 },
  line: { height: LINE_H, flexDirection: 'row', alignItems: 'center', paddingRight: 12 },
  lAdd: { backgroundColor: 'rgba(61,220,151,0.12)' },
  lDel: { backgroundColor: 'rgba(248,113,113,0.12)' },
  lHunk: { backgroundColor: 'rgba(255,255,255,0.04)' },
  num: { fontFamily: MONO, fontSize: 12, lineHeight: LINE_H, color: C.faint, textAlign: 'right', paddingRight: 12 },
  code: { fontFamily: MONO, fontSize: 12, lineHeight: LINE_H },
  tAdd: { color: '#BDF4D8' },
  tDel: { color: '#FFC9C9' },
  tHunk: { color: C.faint },
  tCtx: { color: C.textSoft },
  notes: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.muted, paddingHorizontal: 16, paddingBottom: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  stateTitle: { fontFamily: F.semibold, fontSize: 18, lineHeight: 28, color: C.text, textAlign: 'center' },
  stateBody: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.muted, textAlign: 'center' },
  retry: { height: 48, paddingHorizontal: 24, borderRadius: 24, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24, color: C.scene },
});
