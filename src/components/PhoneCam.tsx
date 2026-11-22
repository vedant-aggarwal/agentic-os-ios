import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, TurboModuleRegistry, View } from 'react-native';
import { Sym } from '@/components/Sym';
import { api, API, currentToken } from '@/lib/api';
import { C, F } from '@/theme';

// The phone as the PC's webcam (server/pc-camera.ts). The camera runs in a WebView (WKWebView has getUserMedia and
// WebRTC with hardware H.264), sends to the PC over WebRTC, and the PC shows it as "Agentic OS Phone Camera" in any
// app. The preview is live while this tab is open; Start sends it to the PC. The phone stays awake while sending.
type WebViewT = typeof import('react-native-webview').WebView;
const WebView: WebViewT | null = TurboModuleRegistry?.get?.('RNCWebViewModule') ? require('react-native-webview').WebView : null;

type CamStatus = { installed: boolean; ready: boolean; live: boolean; error?: string };
type State = 'off' | 'connecting' | 'live' | 'error';

function keepAwake(on: boolean) {
  try {
    const k = require('expo-keep-awake') as typeof import('expo-keep-awake');
    if (on) k.activateKeepAwakeAsync('phonecam').catch(() => {}); else k.deactivateKeepAwake('phonecam').catch(() => {});
  } catch { /* older build without the module */ }
}
const tap = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

const PAGE = String.raw`<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}video{width:100%;height:100%;object-fit:cover}.m{transform:scaleX(-1)}</style>
</head><body><video id="v" autoplay playsinline muted class="m"></video><script>
(function(){
var A = window.AOS || {}, H = { Authorization: 'Bearer ' + A.token, 'Content-Type': 'application/json' };
var post = function(m){ try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch(e){} };
var v = document.getElementById('v'), stream = null, pc = null, facing = 'user', gen = 0;
async function open(){
  if (stream) stream.getTracks().forEach(function(t){ t.stop(); });
  stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
  v.srcObject = stream; v.className = facing === 'user' ? 'm' : ''; v.play().catch(function(){});
  if (pc) { var s = pc.getSenders()[0]; if (s) await s.replaceTrack(stream.getVideoTracks()[0]); }
}
function gathered(p, ms){ return new Promise(function(r){
  if (p.iceGatheringState === 'complete') return r();
  p.addEventListener('icegatheringstatechange', function(){ if (p.iceGatheringState === 'complete') r(); });
  setTimeout(r, ms);
}); }
async function start(){
  var my = ++gen; stop(true);
  post({ type: 'state', state: 'connecting' });
  try {
    if (!stream) await open();
    var ice = await (await fetch(A.api + '/pc/screen', { headers: H })).json();
    var p = pc = new RTCPeerConnection({ iceServers: ice.iceServers || [] });
    var tr = p.addTransceiver(stream.getVideoTracks()[0], { direction: 'sendonly' });
    try { // the PC decodes H.264 cheapest
      var caps = RTCRtpSender.getCapabilities('video').codecs.filter(function(c){ return /h264/i.test(c.mimeType); });
      if (caps.length && tr.setCodecPreferences) tr.setCodecPreferences(caps);
    } catch(e){}
    try { var prm = tr.sender.getParameters(); prm.encodings = prm.encodings && prm.encodings.length ? prm.encodings : [{}]; prm.encodings[0].maxBitrate = 4000000; await tr.sender.setParameters(prm); } catch(e){}
    await p.setLocalDescription(await p.createOffer());
    await gathered(p, 2500);
    if (my !== gen) return;
    var r = await fetch(A.api + '/pc/camera/offer', { method: 'POST', headers: H, body: JSON.stringify({ sdp: p.localDescription.sdp }) });
    var j = await r.json();
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    if (my !== gen) return;
    await p.setRemoteDescription({ type: 'answer', sdp: j.sdp });
    p.onconnectionstatechange = function(){
      if (p !== pc) return;
      if (p.connectionState === 'connected') post({ type: 'state', state: 'live' });
      if (p.connectionState === 'failed') post({ type: 'state', state: 'error', error: 'Lost the connection to the PC.' });
    };
  } catch(e) { if (my === gen) { stop(true); post({ type: 'state', state: 'error', error: String(e && e.message || e) }); } }
}
function stop(quiet){
  if (pc) { try { pc.onconnectionstatechange = null; pc.close(); } catch(e){} pc = null; }
  if (!quiet) { gen++; post({ type: 'state', state: 'off' }); }
}
window.camStart = start;
window.camStop = function(){ stop(false); };
window.camFlip = function(){ facing = facing === 'user' ? 'environment' : 'user'; open().then(function(){ post({ type: 'facing', facing: facing }); }).catch(function(e){ post({ type: 'state', state: 'error', error: String(e.message || e) }); }); };
open().then(function(){ post({ type: 'preview' }); }).catch(function(e){ post({ type: 'state', state: 'error', error: 'Camera: ' + (e && e.message || e) }); });
})();
</script></body></html>`;

export function CameraPanel({ open }: { open: boolean }) {
  const web = useRef<ComponentRef<WebViewT>>(null);
  const [status, setStatus] = useState<CamStatus | null>(null);
  const [state, setState] = useState<State>('off');
  const [err, setErr] = useState('');
  const [inject] = useState(() => `window.AOS = ${JSON.stringify({ api: API, token: currentToken() ?? '' })}; true;`);

  useEffect(() => {
    if (!open) return;
    let live = true;
    api<CamStatus>('/pc/camera').then((s) => { if (live) setStatus(s); }).catch(() => {});
    return () => { live = false; };
  }, [open]);
  useEffect(() => {
    keepAwake(state === 'live' || state === 'connecting');
  }, [state]);
  useEffect(() => () => { keepAwake(false); api('/pc/camera', { method: 'POST', body: {} }).catch(() => {}); }, []);

  const run = (js: string) => web.current?.injectJavaScript(`${js}; true;`);
  const toggle = () => {
    tap();
    if (state === 'off' || state === 'error') { setErr(''); run('window.camStart()'); }
    else { run('window.camStop()'); api('/pc/camera', { method: 'POST', body: {} }).catch(() => {}); }
  };
  const onMessage = (e: { nativeEvent: { data: string } }) => {
    let m: { type: string; state?: State; error?: string };
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.type === 'state' && m.state) { setState(m.state); if (m.error) setErr(m.error); }
  };

  const notSetUp = status && !status.installed;
  const label = state === 'live' ? 'On your PC' : state === 'connecting' ? 'Connecting…' : 'Preview';
  return (
    <View style={{ gap: 12 }}>
      <View style={s.preview}>
        {WebView && open ? (
          <WebView ref={web} source={{ html: PAGE, baseUrl: 'https://agentic.norrita.com' }} originWhitelist={['*']}
            injectedJavaScriptBeforeContentLoaded={inject} onMessage={onMessage}
            allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} mediaCapturePermissionGrantType="grant"
            scrollEnabled={false} bounces={false} style={s.web} containerStyle={s.web} />
        ) : (
          <View style={s.missing}><Text style={s.note}>Update the app from TestFlight to use the phone camera.</Text></View>
        )}
        <View style={[s.badge, state === 'live' && { backgroundColor: '#E5484D' }]}>
          {state === 'live' ? <View style={s.dot} /> : null}
          <Text style={s.badgeText}>{label}</Text>
        </View>
      </View>

      {notSetUp ? (
        <Text style={s.note}>One-time setup on the PC: run vcam\aos-vcamctl.exe --install as administrator. Then the camera shows up in Zoom, Meet, Teams and the Camera app.</Text>
      ) : err ? <Text style={[s.note, { color: C.danger }]}>{err}</Text> : (
        <Text style={s.note}>{state === 'live' ? 'Pick “Agentic OS Phone Camera” in your video app. Keep this sheet open.' : 'Start sends this camera to your PC as a webcam.'}</Text>
      )}

      <View style={s.row}>
        <Pressable accessibilityRole="button" accessibilityLabel="Switch camera" onPress={() => { tap(); run('window.camFlip()'); }} style={s.round}>
          <Sym name="arrow.triangle.2.circlepath.camera" size={20} color="#fff" fallback={<Text style={s.btnText}>⟲</Text>} />
        </Pressable>
        <Pressable accessibilityRole="button" disabled={!!notSetUp} onPress={toggle}
          style={[s.main, state === 'live' || state === 'connecting' ? { backgroundColor: '#E5484D' } : null, notSetUp && { opacity: 0.4 }]}>
          <Sym name={state === 'off' || state === 'error' ? 'video.fill' : 'stop.fill'} size={16} color={state === 'off' || state === 'error' ? '#111' : '#fff'} fallback={null} />
          <Text style={[s.mainText, (state === 'live' || state === 'connecting') && { color: '#fff' }]}>
            {state === 'off' || state === 'error' ? 'Start webcam' : 'Stop'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  preview: { height: 260, borderRadius: 22, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: '#000' },
  web: { flex: 1, backgroundColor: '#000' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  badge: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.55)' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  badgeText: { fontFamily: F.semibold, fontSize: 12, lineHeight: 16, color: '#fff' },
  note: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.muted, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  round: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  btnText: { fontFamily: F.semibold, fontSize: 18, color: '#fff' },
  main: { flex: 1, height: 52, borderRadius: 26, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.text },
  mainText: { fontFamily: F.semibold, fontSize: 16, lineHeight: 20, color: '#111' },
});
