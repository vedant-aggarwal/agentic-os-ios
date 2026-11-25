import { useEffect, useImperativeHandle, useRef, useState, type ComponentRef, type Ref } from 'react';
import { StyleSheet, TurboModuleRegistry, View, type StyleProp, type ViewStyle } from 'react-native';
import { API, currentToken } from '@/lib/api';

// The Stage camera. It runs in a WebView (WKWebView has getUserMedia and MediaRecorder, so no new native module) and
// sends the recording to the PC while he talks: a piece every two seconds, POSTed straight from the page to
// /mod/mind/stage/<id>/chunk with his sign-in, in order, retried until the PC has it. Whatever reached the PC
// survives a crash or a closed app, and the Speak tab offers to pick it up. The preview is mirrored; the recording
// is not (it shows him as others see him).

type WebViewT = typeof import('react-native-webview').WebView;
/* eslint-disable @typescript-eslint/no-require-imports */
const WebView: WebViewT | null = TurboModuleRegistry?.get?.('RNCWebViewModule') ? require('react-native-webview').WebView : null;
/* eslint-enable @typescript-eslint/no-require-imports */

/** This build can film (it has the WebView). */
export const camAvailable = !!WebView;

export type CamEvent =
  | { type: 'ready' }
  | { type: 'error'; error: string }
  | { type: 'recording' }
  /** a piece reached the PC; `t` is where the whole recording is at its end, in ms */
  | { type: 'sent'; pieces: number; waiting: number; t: number }
  /** pieces are waiting on the phone for the connection */
  | { type: 'lag'; waiting: number; error: string }
  /** the recorder stopped and every piece is on the PC */
  | { type: 'stopped'; pieces: number; t: number };
export type Cam = {
  /** Record part `seg` of recording `id`, which already has `offset` seconds on the PC. */
  start: (o: { id: string; seg: number; offset: number }) => void;
  stop: () => void;
};

const PAGE = String.raw`<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}</style>
</head><body><video id="v" autoplay playsinline muted></video><script>
(function(){
var A = window.AOS || {};
var post = function(m){ try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch(e){} };
var v = document.getElementById('v'), stream = null, rec = null, queue = [], sending = false, job = null, pieces = 0, stopped = false, t0 = 0;
var pick = function(){
  var c = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (var i = 0; i < c.length; i++) { try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch(e){} }
  return '';
};
var elapsed = function(){ return Math.round(((job ? job.offset : 0) + (Date.now() - t0) / 1000) * 1000); };
async function open(){
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
  });
  v.srcObject = stream; v.play().catch(function(){});
  post({ type: 'ready' });
}
async function pump(){
  if (sending) return;
  sending = true;
  while (queue.length) {
    var p = queue[0];
    try {
      var r = await fetch(A.api + '/mod/mind/stage/' + encodeURIComponent(job.id) + '/chunk?seg=' + job.seg + '&i=' + p.i + '&t=' + p.t, {
        method: 'POST', headers: { Authorization: 'Bearer ' + A.token, 'Content-Type': p.type, 'X-Client': 'native' }, body: p.blob
      });
      var j = await r.json().catch(function(){ return {}; });
      if (r.ok) { queue.shift(); pieces++; post({ type: 'sent', pieces: pieces, waiting: queue.length, t: p.t }); continue; }
      if (r.status === 409 || r.status === 404 || r.status === 413 || r.status === 415) { queue = []; post({ type: 'error', error: j.error || ('The PC refused the recording (' + r.status + ').') }); break; }
      throw new Error(j.error || ('HTTP ' + r.status));
    } catch (e) {
      post({ type: 'lag', waiting: queue.length, error: String(e && e.message || e) });
      await new Promise(function(res){ setTimeout(res, 2000); });
    }
  }
  sending = false;
  if (stopped && !queue.length) { stopped = false; post({ type: 'stopped', pieces: pieces, t: elapsed() }); }
}
var ended = function(){ return !stream || stream.getTracks().some(function(t){ return t.readyState === 'ended'; }); };
// back from the background, iOS may have ended the camera: it opens again before the next part
document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'visible' && stream && ended()) open().catch(function(){}); });
window.camStart = async function(o){
  if (ended()) { try { await open(); } catch (e) { post({ type: 'error', error: "The camera didn't start again. " + (e && e.message || '') }); return; } }
  job = o; pieces = 0; queue = []; stopped = false;
  var mime = pick(), i = 0;
  try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 1500000, audioBitsPerSecond: 96000 } : undefined); }
  catch (e) { post({ type: 'error', error: "This phone can't record video here." }); return; }
  var type = String(rec.mimeType || mime || 'video/mp4').split(';')[0];
  rec.ondataavailable = function(e){ if (e.data && e.data.size) { queue.push({ i: i++, blob: e.data, type: type, t: elapsed() }); pump(); } };
  rec.onstop = function(){ stopped = true; pump(); };
  rec.onerror = function(e){ post({ type: 'error', error: 'The recording stopped. ' + (e && e.error && e.error.message || '') }); };
  t0 = Date.now();
  rec.start(2000);
  post({ type: 'recording' });
};
window.camStop = function(){ if (rec && rec.state !== 'inactive') rec.stop(); else { stopped = true; pump(); } };
open().catch(function(e){
  var denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
  post({ type: 'error', error: denied ? 'Camera or microphone access is off. Turn both on in Settings, Agentic OS.' : "The camera didn't start. " + (e && e.message || '') });
});
})();
</script></body></html>`;

export function StageCam({ ref, onEvent, style }: { ref: Ref<Cam>; onEvent: (e: CamEvent) => void; style?: StyleProp<ViewStyle> }) {
  const web = useRef<ComponentRef<WebViewT>>(null);
  const [inject] = useState(() => `window.AOS = ${JSON.stringify({ api: API, token: currentToken() ?? '' })}; true;`);
  const latest = useRef(onEvent);
  useEffect(() => { latest.current = onEvent; });
  useImperativeHandle(ref, () => ({
    start: (o) => web.current?.injectJavaScript(`window.camStart(${JSON.stringify(o)}); true;`),
    stop: () => web.current?.injectJavaScript('window.camStop(); true;'),
  }), []);
  if (!WebView) return <View style={[s.fill, style]} />;
  return (
    <WebView ref={web} source={{ html: PAGE, baseUrl: 'https://agentic.norrita.com' }} originWhitelist={['*']}
      injectedJavaScriptBeforeContentLoaded={inject}
      onMessage={(e) => { try { latest.current(JSON.parse(e.nativeEvent.data) as CamEvent); } catch { /* not ours */ } }}
      onContentProcessDidTerminate={() => { latest.current({ type: 'error', error: 'The camera stopped. What reached your PC is kept.' }); web.current?.reload(); }}
      allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} mediaCapturePermissionGrantType="grant"
      scrollEnabled={false} bounces={false} style={[s.fill, style]} containerStyle={[s.fill, style]} />
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
});
