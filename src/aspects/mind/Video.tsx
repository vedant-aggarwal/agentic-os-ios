import { useState } from 'react';
import { ActivityIndicator, Image, Modal, StatusBar, StyleSheet, Text, TurboModuleRegistry, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconButton, Press, R, t, timer } from '@/aspects/kit';
import { API, currentToken } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { fileSource } from '@/lib/mod';
import { C } from '@/theme';
import { Sym } from './ui';

// A Stage video: its poster on the review, and full screen playback. The video route needs his sign-in, which a
// <video> tag can't send, so the player page fetches the file with it (with progress) and plays it from memory,
// with the system's own controls (scrub, full screen, picture in picture). A moment in the review opens it there.

type WebViewT = typeof import('react-native-webview').WebView;
/* eslint-disable @typescript-eslint/no-require-imports */
const WebView: WebViewT | null = TurboModuleRegistry?.get?.('RNCWebViewModule') ? require('react-native-webview').WebView : null;
/* eslint-enable @typescript-eslint/no-require-imports */

const videoPath = (id: string) => `/mod/mind/stage/${id}/video`;
export const thumbSource = (id: string) => fileSource(`/mod/mind/stage/${id}/thumb`);

const PAGE = String.raw`<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}video{width:100%;height:100%;object-fit:contain;background:#000}</style>
</head><body><video id="v" controls playsinline></video><script>
(async function(){
var A = window.AOS || {};
var post = function(m){ try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch(e){} };
try {
  var r = await fetch(A.api + A.path, { headers: { Authorization: 'Bearer ' + A.token, 'X-Client': 'native' } });
  if (!r.ok) throw new Error(r.status === 404 ? "The video isn't on your PC any more." : "Your PC didn't send the video (" + r.status + ').');
  var total = Number(r.headers.get('content-length')) || 0, got = 0, last = 0, parts = [];
  var reader = r.body.getReader();
  for (;;) {
    var x = await reader.read();
    if (x.done) break;
    parts.push(x.value); got += x.value.length;
    if (total && got / total - last > 0.04) { last = got / total; post({ type: 'progress', p: last }); }
  }
  var v = document.getElementById('v');
  v.src = URL.createObjectURL(new Blob(parts, { type: 'video/mp4' }));
  v.addEventListener('loadedmetadata', function(){ if (A.at) v.currentTime = A.at; }, { once: true });
  v.play().catch(function(){});
  post({ type: 'ready' });
} catch (e) { post({ type: 'error', error: String(e && e.message || e) }); }
})();
</script></body></html>`;

/** The video full screen, from `at` seconds. */
export function VideoPlayer({ id, at, onClose }: { id: string | null; at: number; onClose: () => void }) {
  const [n, setN] = useState(0);
  return (
    <Modal visible={!!id} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <StatusBar hidden />
      {id ? <Playing key={`${id}-${at}-${n}`} id={id} at={at} onClose={onClose} onAgain={() => setN((x) => x + 1)} /> : null}
    </Modal>
  );
}

function Playing({ id, at, onClose, onAgain }: { id: string; at: number; onClose: () => void; onAgain: () => void }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<{ ready: boolean; p: number; error: string | null }>({ ready: false, p: 0, error: null });
  const [inject] = useState(() => `window.AOS = ${JSON.stringify({ api: API, token: currentToken() ?? '', path: videoPath(id), at })}; true;`);
  const why = !WebView ? (DEMO ? 'The sample preview has no video.' : 'Update the app from TestFlight to play videos.') : state.error;
  return (
    <View style={s.black}>
      {WebView && !state.error ? (
        <WebView source={{ html: PAGE, baseUrl: 'https://agentic.norrita.com' }} originWhitelist={['*']}
          injectedJavaScriptBeforeContentLoaded={inject} allowsInlineMediaPlayback allowsPictureInPictureMediaPlayback
          mediaPlaybackRequiresUserAction={false} scrollEnabled={false} bounces={false} style={s.black} containerStyle={s.black}
          onMessage={(e) => {
            let m: { type: string; p?: number; error?: string };
            try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
            if (m.type === 'progress') setState((x) => ({ ...x, p: m.p ?? x.p }));
            if (m.type === 'ready') setState((x) => ({ ...x, ready: true }));
            if (m.type === 'error') setState((x) => ({ ...x, error: m.error ?? "The video didn't load." }));
          }} />
      ) : null}
      {!state.ready || why ? (
        <View style={[StyleSheet.absoluteFill, s.centre]} pointerEvents={why ? 'auto' : 'none'}>
          {why ? (
            <>
              <Text style={[t.callout, s.white, s.centred]}>{why}</Text>
              {WebView ? <Press label="Try again" onPress={onAgain} style={s.again}><Text style={[t.callout, s.white]}>Try again</Text></Press> : null}
            </>
          ) : (
            <>
              <ActivityIndicator color="#fff" />
              <Text style={[t.footnote, s.dim, t.num]}>{state.p ? `Loading from your PC, ${Math.round(state.p * 100)}%` : 'Loading from your PC'}</Text>
            </>
          )}
        </View>
      ) : null}
      <View style={[s.close, { top: insets.top + 8 }]}>
        <IconButton label="Close the video" size={40} onPress={onClose}><Icon name="close" size={16} color="#fff" /></IconButton>
      </View>
    </View>
  );
}

/** The video's poster: its first frame, how long it is, and play. */
export function VideoPoster({ id, thumb, secs, onPlay }: { id: string; thumb: boolean; secs: number | null; onPlay: () => void }) {
  return (
    <Press label={`Play the video${secs ? `, ${timer(secs)}` : ''}`} onPress={onPlay} scale={0.98} style={s.poster}>
      {thumb ? <Image source={thumbSource(id)} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
      <View style={s.play}><Sym name="play" size={22} color="#14161C" filled /></View>
      {secs ? <View style={s.len}><Text style={[t.footnote, t.num, s.white]}>{timer(secs)}</Text></View> : null}
    </Press>
  );
}

const s = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  centre: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  centred: { textAlign: 'center', maxWidth: 300 },
  white: { color: '#fff' },
  dim: { color: 'rgba(255,255,255,0.6)' },
  again: { paddingHorizontal: 20, height: 44, borderRadius: 22, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  close: { position: 'absolute', left: 12, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)' },
  poster: {
    height: 240, borderRadius: R.group, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: C.scene,
    alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)',
  },
  play: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', paddingLeft: 3 },
  len: { position: 'absolute', right: 10, bottom: 10, paddingHorizontal: 8, height: 24, borderRadius: 12, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
});
