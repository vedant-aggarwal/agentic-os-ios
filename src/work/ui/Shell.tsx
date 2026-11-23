import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Backdrop } from '@/components/Backdrop';
import { EdgeBlur } from '@/components/EdgeBlur';
import { Glass } from '@/components/Glass';
import { Notice } from '@/components/Notice';
import { C } from '@/theme';
import { useDesktop } from '@/desk/store';
import { work, useWorkNotice } from '../store';
import { BackIcon } from './icons';
import { goBack } from './nav';
import { Press } from './Press';
import { QUICK_H, QuickBar, type QuickAction } from './QuickBar';

const BTN = 44;
const BTN_GAP = 8;

/** Space the floating chrome takes, for a list's padding: content starts under the back button and ends above the bar. */
export function useShellInsets() {
  const insets = useSafeAreaInsets();
  const lift = Math.max(insets.bottom, 12) + 12; // the dock's lift, so the bar sits where the dock did
  return { top: insets.top + BTN_GAP + BTN + 16, bottom: lift + QUICK_H + 32, lift, safeTop: insets.top };
}

/**
 * A full hub page: the app background, the list (passed in), a floating back button with an optional right
 * button, the quick bar, edge blurs where content runs under the chrome, and the hub's notice line.
 * Back is the chevron or a swipe from the left edge. On iOS that swipe is the native stack's own, which tracks
 * the finger and shows the page underneath; elsewhere (web preview, Android) the page follows the finger here.
 */
export function Shell({ children, right, actions, overlay }: {
  children: React.ReactNode;
  right?: { label: string; icon: React.ReactNode; onPress: () => void };
  actions?: QuickAction[];
  overlay?: React.ReactNode;
}) {
  const { lift, safeTop } = useShellInsets();
  const notice = useWorkNotice();
  const desktop = useDesktop(); // a readable column in the middle of a desktop window
  return (
    <View style={s.screen}>
      <Backdrop />
      <EdgeBack>{desktop ? <View style={s.column}>{children}</View> : children}</EdgeBack>
      <EdgeBlur edge="top" height={safeTop + BTN_GAP + BTN + 24} strength={30} curve={2} />
      <EdgeBlur height={lift + QUICK_H + 48} strength={35} curve={2.6} />
      <View pointerEvents="box-none" style={[s.top, { top: safeTop + BTN_GAP }]}>
        <RoundButton label="Back" onPress={goBack}><BackIcon /></RoundButton>
        {right ? <RoundButton label={right.label} onPress={right.onPress}>{right.icon}</RoundButton> : null}
      </View>
      {actions ? <QuickBar bottom={lift} actions={actions} /> : null}
      <Notice text={notice} bottom={lift + QUICK_H + 16} onClear={work.clearNotice} />
      {overlay}
    </View>
  );
}

/** The top bar's round glass button, at the iOS 44 pt size. */
function RoundButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Press accessibilityLabel={label} onPress={onPress} haptic hitSlop={8}>
      {(pressed) => (
        <View style={s.round}>
          <Glass radius={BTN / 2} />
          {pressed ? <View style={[StyleSheet.absoluteFill, s.roundPressed]} /> : null}
          <View>{children}</View>
        </View>
      )}
    </Press>
  );
}

// Decide with where the swipe is headed, not where it stopped: a quick flick from the edge counts.
const project = (v: number) => (v / 1000) * 0.99 / (1 - 0.99);
const SETTLE = { duration: 400, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;

function EdgeBack({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'ios') return <View style={s.fill}>{children}</View>;
  return <EdgeBackPan>{children}</EdgeBackPan>;
}

function EdgeBackPan({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const pan = usePanGesture({
    activeOffsetX: 12, // rightward only
    failOffsetY: [-16, 16],
    runOnJS: true,
    onUpdate: (e) => { x.set(Math.max(0, e.translationX)); },
    onDeactivate: (e) => {
      const done = !e.canceled && e.translationX + project(e.velocityX) > width * 0.4 && e.velocityX > -100;
      if (done) { goBack(); setTimeout(() => x.set(0), 400); } // the page unmounts; reset if it didn't
      else x.set(withSpring(0, { ...SETTLE, velocity: e.velocityX }));
    },
  });
  const follow = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Animated.View style={[s.fill, follow]}>
      {children}
      <GestureDetector gesture={pan}>
        <View style={s.edge} accessible={false} />
      </GestureDetector>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  column: { flex: 1, width: '100%', maxWidth: 880, alignSelf: 'center' },
  screen: { flex: 1, backgroundColor: C.scene, overflow: 'hidden' },
  fill: { flex: 1 },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 20 },
  top: { position: 'absolute', left: 16, right: 16, height: BTN, flexDirection: 'row', justifyContent: 'space-between' },
  round: {
    width: BTN, height: BTN, borderRadius: BTN / 2, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 12px 28px rgba(0,0,0,0.4)',
  },
  roundPressed: { borderRadius: BTN / 2, backgroundColor: 'rgba(255,255,255,0.12)' },
});
