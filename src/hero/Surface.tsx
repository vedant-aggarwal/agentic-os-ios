import { type ComponentRef, type Ref, useImperativeHandle, useRef } from 'react';
import { StyleSheet, TurboModuleRegistry, View } from 'react-native';
import { SCENE_HTML } from './sceneHtml';
import type { SceneMsg, SurfaceHandle } from './types';

// The 3D scene runs in a WebView (WebGL). react-native-webview needs its native part the moment it loads, so it is
// loaded only when the installed build has it; older builds keep the drawn crystals.
type WebViewT = typeof import('react-native-webview').WebView;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WebView: WebViewT | null = TurboModuleRegistry?.get?.('RNCWebViewModule') ? require('react-native-webview').WebView : null;

export const SURFACE_OK = !!WebView;

/** Touch goes to the view laid over it (Hero), so the page underneath still scrolls. */
export function Surface({ ref, onMessage }: { ref: Ref<SurfaceHandle>; onMessage: (m: SceneMsg) => void }) {
  const web = useRef<ComponentRef<WebViewT>>(null);
  useImperativeHandle(ref, () => ({
    send: (m) => web.current?.injectJavaScript(`window.hero&&window.hero.recv(${JSON.stringify(m)});true;`),
  }), []);
  if (!WebView) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <WebView
        ref={web}
        source={{ html: SCENE_HTML }}
        originWhitelist={['*']}
        style={s.web}
        containerStyle={s.web}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onMessage={(e) => { try { onMessage(JSON.parse(e.nativeEvent.data)); } catch { /* not ours */ } }}
        onContentProcessDidTerminate={() => web.current?.reload()}
        webviewDebuggingEnabled={__DEV__}
      />
    </View>
  );
}

const s = StyleSheet.create({ web: { flex: 1, backgroundColor: 'transparent' } });
