import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass } from '@/components/Glass';
import { Sym } from '@/components/Sym';
import { Glyph } from '@/aspects/kit/controls';
import { closeSealed, guardSwitcher, useSealed, type Sealed, type SealedPhoto } from '@/lib/seal';
import { C, F } from '@/theme';
import { IcClose, Press } from '@/work/thread/ui';

// The sealed viewer, mounted once at the root over everything: the one look right after a body or face photo is
// taken, and the photo again after Face ID. It closes itself when the app goes to the background, and while it is
// open the app switcher's snapshot is blurred (src/lib/seal.ts). Every other place shows a SealedTile.

/** A padlock on the 24 grid, for where SF Symbols don't draw (the web preview, Android). */
export const LOCK = 'M8 10.5V8a4 4 0 0 1 8 0v2.5M7 10.5h10a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19v-7A1.5 1.5 0 0 1 7 10.5z';

/** Where a sealed photo sits in a list: a lock, never the picture. Tap asks for Face ID, then opens it. Without
 *  `onPress` it only marks the picture's place, inside something that opens it. */
export function SealedTile({ width, height, radius = 10, label, onPress }: { width: number; height: number; radius?: number; label?: string; onPress?: () => void }) {
  const lock = <Glyph sf="lock.fill" d={LOCK} size={Math.min(20, Math.round(width / 3.2))} color={C.faint} />;
  if (!onPress) return <View style={[st.tile, { width, height, borderRadius: radius }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>{lock}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label ?? 'Photo'}, sealed`} accessibilityHint="Opens with Face ID" onPress={onPress}
      style={({ pressed }) => [st.tile, { width, height, borderRadius: radius }, pressed && st.tilePressed]}>
      {lock}
    </Pressable>
  );
}

function Photo({ p, width, height, fill }: { p: SealedPhoto; width?: number; height?: number; fill?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={fill ? st.flex : { width, height }}>
      <View style={[StyleSheet.absoluteFill, st.wait]}>
        {failed || !p.source ? <Text style={st.waitText}>{"Couldn't load it from your PC."}</Text> : <ActivityIndicator color={C.faint} />}
      </View>
      {p.source && !failed ? (
        <Image source={p.source} style={StyleSheet.absoluteFill} contentFit={fill ? 'contain' : 'cover'} transition={120} onError={() => setFailed(true)}
          accessibilityLabel={p.label ?? p.caption ?? 'Sealed photo'} accessibilityIgnoresInvertColors />
      ) : null}
    </View>
  );
}

function Viewer({ open }: { open: Sealed }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // blur the app switcher's snapshot while a photo is up; close when the app goes to the background
  useEffect(() => {
    guardSwitcher(true);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'background') closeSealed(); });
    return () => { sub.remove(); guardSwitcher(false); };
  }, []);
  const preview = open.mode === 'preview';
  const one = open.photos.length === 1 ? open.photos[0] : null;
  const pad = 16, gap = 8;
  const half = (width - pad * 2 - gap) / 2;
  const full = width - pad * 2;
  const act = open.action;
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, st.screen]} accessibilityViewIsModal>
      <View style={[st.head, { paddingTop: insets.top + 6 }]}>
        <Press accessibilityLabel={preview ? 'Done, seal it' : 'Close'} onPress={closeSealed} style={st.round} scale={0.92}>
          <Glass radius={22} />
          <View><Sym name="xmark" size={15} color={C.text} fallback={<IcClose size={15} />} /></View>
        </Press>
        <View style={st.titles}>
          <Text style={st.title} numberOfLines={1}>{open.title}</Text>
          <Text style={st.meta} numberOfLines={1}>{preview ? 'Sealed when you close it' : 'Sealed, opened with Face ID'}</Text>
        </View>
      </View>
      {one ? (
        <View style={[st.flex, { paddingHorizontal: pad }]}><Photo p={one} fill /></View>
      ) : (
        <ScrollView style={st.flex} contentContainerStyle={{ padding: pad, gap: 20 }}>
          {open.pairs ? pairsOf(open.photos).map(([a, b], i) => (
            <View key={i} style={st.pair}>
              {[a, b].map((p, k) => (p ? (
                <View key={k} style={{ width: half, gap: 6 }}>
                  <Photo p={p} width={half} height={half * 1.25} />
                  {p.caption ? <Text style={st.caption}>{p.caption}</Text> : null}
                </View>
              ) : null))}
            </View>
          )) : open.photos.map((p, i) => (
            <View key={i} style={{ gap: 6 }}>
              <Photo p={p} width={full} height={full * 1.25} />
              {p.caption ? <Text style={st.caption}>{p.caption}</Text> : null}
            </View>
          ))}
        </ScrollView>
      )}
      <View style={[st.foot, { paddingBottom: insets.bottom + 12 }]}>
        {preview ? <Text style={st.note}>After this it stays sealed. To see it again, tap it and use Face ID.</Text> : null}
        {act || preview ? (
          <View style={st.btns}>
            {act ? (
              <Press accessibilityLabel={act.label} onPress={() => { closeSealed(); act.run(); }} style={st.btn} outer={st.flex}>
                <Text style={st.btnText}>{act.label}</Text>
              </Press>
            ) : null}
            {preview ? (
              <Press accessibilityLabel="Done, seal it" onPress={closeSealed} style={[st.btn, st.btnMain]} outer={st.flex}>
                <Text style={[st.btnText, st.btnMainText]}>Done</Text>
              </Press>
            ) : null}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const pairsOf = (ps: SealedPhoto[]) => {
  const out: [SealedPhoto, SealedPhoto | undefined][] = [];
  for (let i = 0; i < ps.length; i += 2) out.push([ps[i], ps[i + 1]]);
  return out;
};

/** Mounted once, at the root, after everything else so it sits on top. */
export function SealHost() {
  const open = useSealed();
  return open ? <Viewer open={open} /> : null;
}

const st = StyleSheet.create({
  flex: { flex: 1 },
  screen: { backgroundColor: C.scene, zIndex: 1000 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: F.semibold, fontSize: 17, lineHeight: 22, color: C.text },
  meta: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.faint },
  wait: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12 },
  pair: { flexDirection: 'row', gap: 8 },
  caption: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.muted },
  waitText: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.faint, textAlign: 'center', paddingHorizontal: 12 },
  foot: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  note: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.faint, textAlign: 'center' },
  btns: { flexDirection: 'row', gap: 10 },
  btn: { height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: F.semibold, fontSize: 16, lineHeight: 21, color: C.text },
  btnMain: { backgroundColor: C.text },
  btnMainText: { color: C.scene },
  tile: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)' },
  tilePressed: { backgroundColor: 'rgba(255,255,255,0.12)' },
});
