import { type ComponentRef, type Ref, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, TurboModuleRegistry, View } from 'react-native';
import { PET_HTML } from './sceneHtml';
import type { PetCfg, PetHandle, PetMsg } from './types';

// The pet's scene (pet-scene/) in a WebView: one WebGL canvas, transparent, that never takes a touch. Loaded only
// when the installed build has react-native-webview; without it the Smiley keeps its still.
type WebViewT = typeof import('react-native-webview').WebView;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WebView: WebViewT | null = TurboModuleRegistry?.get?.('RNCWebViewModule') ? require('react-native-webview').WebView : null;

export const PET_OK = !!WebView;

/** cfg is read once, when the page loads; later changes go through send(). */
export function PetView({ ref, cfg, onMessage }: { ref: Ref<PetHandle>; cfg: PetCfg; onMessage: (m: PetMsg) => void }) {
  const web = useRef<ComponentRef<WebViewT>>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => PET_HTML.replace('/*CFG*/null', () => JSON.stringify(cfg)), []);
  useImperativeHandle(ref, () => ({
    send: (m) => web.current?.injectJavaScript(`window.pet&&window.pet.recv(${JSON.stringify(m)});true;`),
  }), []);
  if (!WebView) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <WebView
        ref={web}
        source={{ html }}
        originWhitelist={['*']}
        style={s.web}
        containerStyle={s.web}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
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
