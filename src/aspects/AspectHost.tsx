import { Component, Suspense, useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { lightTap } from '@/components/Glass';
import { useReveal } from '@/components/Reveal';
import { ASPECT_COLOR, C, F, type AspectKey } from '@/theme';
import { ASPECT_NAME, AspectContext, type AspectCtx, type AspectEntry } from './context';
import { PAGES } from './registry';
import { UndoToast } from './kit/undo';

/** Space an aspect page keeps clear at the bottom while the dock shows: the bar, the raised orb and its ring. */
export const dockClearance = (bottom: number) => Math.max(bottom, 12) + 12 + 64 + 40;

/** Dev-only, web-only: `?aspect=body` opens that page on load, so a page can be previewed and screenshot directly. */
export const initialAspect: AspectKey | null = (() => {
  if (!__DEV__ || Platform.OS !== 'web' || typeof location === 'undefined') return null;
  const k = new URLSearchParams(location.search).get('aspect');
  return k && k in ASPECT_COLOR ? (k as AspectKey) : null;
})();

/** Dev-only, web-only: `?link=soul/journal` opens that link on load, the way a notification tap would. */
export const initialLink: string | null = (() => {
  if (!__DEV__ || Platform.OS !== 'web' || typeof location === 'undefined') return null;
  return new URLSearchParams(location.search).get('link') || null;
})();

/** A link on its way to an aspect page (src/lib/aspectLinks.ts makes it from agenticos://<aspect>/<part>). */
export type HostEntry = AspectEntry & { aspect: AspectKey };

/**
 * The one place aspect pages live. The page grows out of the orb as a widening circle (the same motion as the top
 * bar's pages) and closes back into it. The dock stays above it, so the orb's dial can jump straight to another
 * aspect and Home returns to Today. The last page opened stays mounted, hidden, so it comes back as it was left.
 */
export function AspectHost({ aspect, origin, dock, entry, onEntryDone, onClose, onOpen, onNotice, onImmersive }: {
  aspect: AspectKey | null; origin: { x: number; y: number }; dock: number;
  /** The link to hand the page once it shows; `onEntryDone` clears it when the page has opened what it names. */
  entry: HostEntry | null; onEntryDone: (stamp: number) => void;
  onClose: () => void; onOpen: (key: AspectKey) => void; onNotice: (text: string, undo?: () => void) => void; onImmersive: (on: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const r = useReveal(aspect != null, origin);
  // the page on screen: kept while the circle closes, swapped the moment another aspect is chosen
  const [shown, setShown] = useState<AspectKey | null>(aspect);
  if (aspect && aspect !== shown) setShown(aspect);
  // Back: a drag in from the left edge, as everywhere on iOS. Whatever the page has open on top (a Screen) goes
  // first; with nothing open it is the page itself that closes.
  const backs = useRef<(() => void)[]>([]);
  const onBack = useCallback((handler: () => void) => {
    backs.current.push(handler);
    return () => { backs.current = backs.current.filter((h) => h !== handler); };
  }, []);
  const back = usePanGesture({
    activeOffsetX: [-10000, 12],
    failOffsetY: [-16, 16],
    runOnJS: true,
    onDeactivate: (e) => {
      if (e.canceled || !(e.translationX > 64 || e.velocityX > 600)) return;
      lightTap();
      const top = backs.current.at(-1);
      if (top) top(); else onClose();
    },
  });
  if (!r.ever || !shown) return null;

  const Page = PAGES[shown];
  const color = ASPECT_COLOR[shown];
  const ctx: AspectCtx = {
    aspect: shown, color, open: aspect === shown, close: onClose, insets, width, height, dock,
    notice: onNotice, setImmersive: onImmersive, openAspect: onOpen, onBack,
    entry: entry && entry.aspect === shown ? entry : null, doneEntry: onEntryDone,
  };
  return (
    <Animated.View style={[r.shell, !r.mounted && s.hidden]} pointerEvents={aspect ? 'auto' : 'none'}>
      <Animated.View style={r.stage}>
        <View style={[StyleSheet.absoluteFill, s.base]} />
        <Light color={color} width={width} />
        <Animated.View style={[s.content, { width: r.width, height: r.height }, r.content]}>
          <AspectContext value={ctx}>
            <Boundary key={shown} name={ASPECT_NAME[shown]} top={insets.top} onClose={onClose}>
              <Suspense fallback={<View style={s.center}><ActivityIndicator color={color} /></View>}>
                <Page />
              </Suspense>
            </Boundary>
          </AspectContext>
          <GestureDetector gesture={back}><View style={s.edge} /></GestureDetector>
          <UndoToast bottom={dock + 12} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/** The aspect's own light, falling from the top of its page. It is the only colour the bare page carries. */
function Light({ color, width }: { color: string; width: number }) {
  const h = 360;
  return (
    <Svg pointerEvents="none" width={width} height={h} style={s.light}>
      <Defs>
        <RadialGradient id="aspectLight" cx="0.5" cy="0" r="1" gradientUnits="objectBoundingBox">
          <Stop offset="0" stopColor={color} stopOpacity={0.2} />
          <Stop offset="0.35" stopColor={color} stopOpacity={0.08} />
          <Stop offset="0.7" stopColor={color} stopOpacity={0.02} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={h} fill="url(#aspectLight)" />
    </Svg>
  );
}

/** A page that throws shows this instead of taking the app down; closing and reopening tries again. */
class Boundary extends Component<{ name: string; top: number; onClose: () => void; children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { message: e instanceof Error ? e.message : String(e) }; }
  componentDidCatch(e: unknown) { console.error(`[aspect] ${this.props.name} page crashed`, e); }
  render() {
    if (this.state.message == null) return this.props.children;
    return (
      <View style={[s.center, { paddingTop: this.props.top }]}>
        <Text style={s.failTitle}>{this.props.name} hit a problem</Text>
        <Text style={s.failBody} numberOfLines={4}>{this.state.message}</Text>
        <Pressable accessibilityRole="button" onPress={this.props.onClose} style={({ pressed }) => [s.failBtn, pressed && { opacity: 0.8 }]}>
          <Text style={s.failBtnText}>Back to Today</Text>
        </Pressable>
      </View>
    );
  }
}

const s = StyleSheet.create({
  hidden: { display: 'none' },
  base: { backgroundColor: C.scene },
  light: { position: 'absolute', left: 0, top: 0 },
  content: { position: 'absolute', left: 0, top: 0 },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  failTitle: { fontFamily: F.semibold, fontSize: 24, lineHeight: 32, letterSpacing: -0.5, color: C.text, textAlign: 'center' },
  failBody: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.muted, textAlign: 'center' },
  failBtn: { marginTop: 12, height: 48, paddingHorizontal: 24, borderRadius: 24, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  failBtnText: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24, color: C.scene },
});
