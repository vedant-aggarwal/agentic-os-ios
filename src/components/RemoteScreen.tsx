import * as Haptics from 'expo-haptics';
import { type ComponentRef, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TurboModuleRegistry, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { lightTap } from '@/components/Glass';
import { ScrollWheel } from '@/components/ScrollWheel';
import { SCREEN_PAGE } from '@/components/screenPage';
import { Sym } from '@/components/Sym';
import { API, currentToken } from '@/lib/api';
import type { usePointer } from '@/lib/pointer';
import { C, F } from '@/theme';

// The remote screen: the PC's display, live (screenPage.ts plays it), steered by touch. The scroll wheel sits on the
// left, as on the trackpad. The badge says which route the video took: Direct, Relay (through the VPS), or Slow
// (still frames through the tunnel, when video can't connect).
// react-native-webview insists on its native part the moment it loads, so it is loaded only when the installed app
// build has it; older builds show a note here instead of crashing at launch.
type WebViewT = typeof import('react-native-webview').WebView;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WebView: WebViewT | null = TurboModuleRegistry?.get?.('RNCWebViewModule') ? require('react-native-webview').WebView : null;

type Route = 'connecting' | 'direct' | 'relay' | 'frames';
const BADGE: Record<Route, { label: string; color: string }> = {
  connecting: { label: 'Connecting', color: C.faint }, direct: { label: 'Direct', color: '#3DDC97' },
  relay: { label: 'Relay', color: '#FFB547' }, frames: { label: 'Slow', color: '#FF7A59' },
};

export function RemoteScreen({ pc }: { pc: ReturnType<typeof usePointer> }) {
  const [route, setRoute] = useState<Route>('connecting');
  const web = useRef<ComponentRef<WebViewT>>(null);
  const [inject] = useState(() => `window.AOS = ${JSON.stringify({ api: API, token: currentToken() ?? '' })}; true;`);

  const onMessage = (e: { nativeEvent: { data: string } }) => {
    let m: any; try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.type === 'route') setRoute(m.route);
    else if (m.type === 'a') pc.abs(m.x, m.y);
    else if (m.type === 'btn') {
      pc.button(m.op, m.which === 'r' ? 'r' : 'l');
      if (Platform.OS !== 'web') (m.op === 'd' ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) : Haptics.selectionAsync()).catch(() => {});
    }
  };

  const b = BADGE[route];
  return (
    <Animated.View entering={FadeIn.duration(200)} style={s.wrap}>
      <ScrollWheel onScroll={(dy) => pc.scroll(0, dy)} />
      <View style={s.card}>
        {WebView ? (
          <WebView ref={web} source={{ html: SCREEN_PAGE, baseUrl: 'https://agentic.norrita.com' }} originWhitelist={['*']}
            injectedJavaScriptBeforeContentLoaded={inject} onMessage={onMessage}
            allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} scrollEnabled={false} bounces={false}
            style={s.web} containerStyle={s.web} />
        ) : (
          <Text style={s.missing}>Update the app from TestFlight to see your PC screen here.</Text>
        )}
        <View pointerEvents="box-none" style={s.overlay}>
          <View pointerEvents="none" style={s.badge}>
            <View style={[s.dot, { backgroundColor: b.color }]} />
            <Text style={s.badgeText}>{b.label}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Fit the screen" hitSlop={8} style={s.icon}
            onPress={() => { lightTap(); web.current?.injectJavaScript('window.resetView && resetView(); true;'); }}>
            <Sym name="arrow.down.right.and.arrow.up.left" size={14} fallback={<Text style={s.badgeText}>Fit</Text>} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Reconnect" hitSlop={8} style={s.icon}
            onPress={() => { lightTap(); web.current?.injectJavaScript('window.start && start(); true;'); }}>
            <Sym name="arrow.clockwise" size={14} fallback={<Text style={s.badgeText}>↻</Text>} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, flexDirection: 'row', gap: 8 },
  card: {
    flex: 1, borderRadius: 24, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: '#000',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)', justifyContent: 'center',
  },
  web: { flex: 1, backgroundColor: '#000' },
  missing: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.faint, textAlign: 'center', padding: 24 },
  overlay: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 10, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontFamily: F.semibold, fontSize: 12, lineHeight: 16, color: C.text },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
});
