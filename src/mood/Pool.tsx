import { type ComponentRef, type Ref, useImperativeHandle, useRef } from 'react';
import { StyleSheet, TurboModuleRegistry, View } from 'react-native';
import { POOL_HTML } from './poolHtml';

// The pool (mood-scene/scene.js) runs in a WebView: WebGL water, its ripples simulated in the page. Touches on the
// water go straight to the page, so a ripple starts under the finger with no trip through the app; the page tells
// the app where the finger is (`touch`) for the pet, the haptics and the words.
export type PoolMsg = { t: string; [k: string]: unknown };
export type PoolHandle = { send: (m: PoolMsg) => void };

type WebViewT = typeof import('react-native-webview').WebView;
// react-native-webview needs its native part the moment it loads: only on a build that has it
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WebView: WebViewT | null = TurboModuleRegistry?.get?.('RNCWebViewModule') ? require('react-native-webview').WebView : null;

export const POOL_OK = !!WebView;

export function PoolSurface({ ref, onMessage }: { ref: Ref<PoolHandle>; onMessage: (m: PoolMsg) => void }) {
  const web = useRef<ComponentRef<WebViewT>>(null);
  useImperativeHandle(ref, () => ({
    send: (m) => web.current?.injectJavaScript(`window.pool&&window.pool.recv(${JSON.stringify(m)});true;`),
  }), []);
  if (!WebView) return null;
  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={web}
        source={{ html: POOL_HTML }}
        originWhitelist={['*']}
        style={s.web}
        containerStyle={s.web}
        scrollEnabled={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        allowsLinkPreview={false}
        textInteractionEnabled={false}
        onMessage={(e) => { try { onMessage(JSON.parse(e.nativeEvent.data)); } catch { /* not ours */ } }}
        onContentProcessDidTerminate={() => web.current?.reload()}
        webviewDebuggingEnabled={__DEV__}
      />
    </View>
  );
}

const s = StyleSheet.create({ web: { flex: 1, backgroundColor: 'transparent' } });
