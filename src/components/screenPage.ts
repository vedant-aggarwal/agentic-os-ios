// The page inside the remote screen's WebView. WKWebView has WebRTC with hardware H.264 decoding, so the PC's
// screen plays here with no native video module. It connects through the PC server (pc-screen.ts):
//   1. WebRTC straight to the PC (Wi-Fi or Tailscale), 1080p60
//   2. WebRTC through the TURN relay on the VPS when 1 can't connect, switched to the 720p30 "lite" stream
//   3. JPEG frames over the tunnel when video can't connect at all
// Touch: one finger drives the cursor (it follows the finger; a tap clicks there; hold still, then move, to drag);
// two fingers pinch and pan the view; a two-finger tap right-clicks. Input goes to the app (postMessage), which sends
// it over the trackpad socket.
export const SCREEN_PAGE = String.raw`<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html,body{margin:0;height:100%;background:#000;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
#wrap{position:absolute;inset:0}
#stage{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:0 0}
video,img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none}
img{display:none}
</style></head><body>
<div id="wrap"><div id="stage"><video id="v" autoplay playsinline muted></video><img id="i"></div></div>
<script>
(function(){
var A = window.AOS || {}, H = { Authorization: 'Bearer ' + A.token, 'Content-Type': 'application/json' };
var post = function(m){ try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch(e){} };
var video = document.getElementById('v'), img = document.getElementById('i'), stage = document.getElementById('stage');
var pc = null, ws = null, gen = 0, mode = 'video';

function cleanup(){
  if (pc) { try { pc.onconnectionstatechange = null; pc.close(); } catch(e){} pc = null; }
  if (ws) { try { ws.onclose = null; ws.close(); } catch(e){} ws = null; }
}
function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function gathered(p, ms){ return new Promise(function(r){
  if (p.iceGatheringState === 'complete') return r();
  p.addEventListener('icegatheringstatechange', function(){ if (p.iceGatheringState === 'complete') r(); });
  setTimeout(r, ms);
}); }
function connected(p, ms){ return new Promise(function(r){
  var done = function(v){ r(v); };
  p.addEventListener('connectionstatechange', function(){
    if (p.connectionState === 'connected') done(true);
    if (p.connectionState === 'failed') done(false);
  });
  setTimeout(function(){ done(p.connectionState === 'connected'); }, ms);
}); }
async function routeType(p){
  var st = await p.getStats(), pair = null, type = 'host';
  st.forEach(function(s){ if (s.type === 'candidate-pair' && s.state === 'succeeded' && (s.nominated || !pair)) pair = s; });
  if (pair) { var c = st.get(pair.localCandidateId), rc = st.get(pair.remoteCandidateId);
    if ((c && c.candidateType === 'relay') || (rc && rc.candidateType === 'relay')) type = 'relay'; }
  return type;
}
async function connect(src, my){
  cleanup(); mode = 'video';
  post({ type: 'route', route: 'connecting' });
  var ice = await (await fetch(A.api + '/pc/screen', { headers: H })).json();
  if (my !== gen) return;
  var p = pc = new RTCPeerConnection({ iceServers: ice.iceServers || [] });
  p.addTransceiver('video', { direction: 'recvonly' });
  p.ontrack = function(e){ video.srcObject = e.streams[0] || new MediaStream([e.track]); video.play().catch(function(){}); };
  await p.setLocalDescription(await p.createOffer());
  await gathered(p, 2500);
  var r = await fetch(A.api + '/pc/screen/offer', { method: 'POST', headers: H, body: JSON.stringify({ sdp: p.localDescription.sdp, stream: src }) });
  var j = await r.json();
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  if (my !== gen) return;
  await p.setRemoteDescription({ type: 'answer', sdp: j.sdp });
  if (!(await connected(p, 9000))) throw new Error('No video route');
  var t = await routeType(p);
  if (t === 'relay' && src === 'pc') return connect('lite', my); // through the relay: less data
  video.style.display = 'block'; img.style.display = 'none';
  post({ type: 'route', route: t === 'relay' ? 'relay' : 'direct' });
  p.onconnectionstatechange = function(){
    if (p.connectionState === 'failed' || p.connectionState === 'disconnected') { post({ type: 'route', route: 'connecting' }); setTimeout(start, 800); }
  };
}
function frames(my){
  cleanup(); mode = 'frames';
  post({ type: 'route', route: 'frames' });
  var s = ws = new WebSocket(A.api.replace(/^http/, 'ws') + '/pc/screen/frames?token=' + encodeURIComponent(A.token));
  s.binaryType = 'blob';
  var last = null;
  s.onmessage = function(e){
    var u = URL.createObjectURL(e.data);
    img.onload = function(){ if (last) URL.revokeObjectURL(last); last = u; };
    img.src = u; img.style.display = 'block'; video.style.display = 'none';
  };
  s.onclose = function(){ if (my === gen) setTimeout(start, 3000); };
  // keep trying for real video now and then
  setTimeout(function(){ if (my === gen && mode === 'frames') start(); }, 45000);
}
async function start(){
  var my = ++gen;
  try { await connect('pc', my); }
  catch (e) { post({ type: 'log', m: String(e && e.message || e) }); if (my === gen) frames(my); }
}
window.start = start;
window.stop = function(){ gen++; cleanup(); };

// ---- view: pinch and pan ----
var view = { s: 1, x: 0, y: 0 };
function apply(){ stage.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.s + ')'; }
function clampView(){
  var W = innerWidth, Hh = innerHeight;
  view.s = Math.min(Math.max(view.s, 1), 6);
  view.x = Math.min(0, Math.max(W - W * view.s, view.x));
  view.y = Math.min(0, Math.max(Hh - Hh * view.s, view.y));
}
window.resetView = function(){ view = { s: 1, x: 0, y: 0 }; apply(); };

// screen point -> 0..1 on the PC's display (null outside the picture)
function toPc(cx, cy){
  var px = (cx - view.x) / view.s, py = (cy - view.y) / view.s;
  var vw = mode === 'frames' ? img.naturalWidth : video.videoWidth, vh = mode === 'frames' ? img.naturalHeight : video.videoHeight;
  if (!vw || !vh) return null;
  var W = innerWidth, Hh = innerHeight, k = Math.min(W / vw, Hh / vh), cw = vw * k, ch = vh * k;
  var nx = (px - (W - cw) / 2) / cw, ny = (py - (Hh - ch) / 2) / ch;
  return { x: Math.min(Math.max(nx, 0), 1), y: Math.min(Math.max(ny, 0), 1), inside: nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 };
}

// ---- touch ----
var g = null, HOLD = 420, TAP = 10;
function pts(t){ var a = []; for (var i = 0; i < t.length; i++) a.push({ x: t[i].clientX, y: t[i].clientY }); return a; }
function mid(a){ return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; }
function dist(a){ return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
document.addEventListener('touchstart', function(e){
  e.preventDefault();
  var p = pts(e.touches);
  if (p.length === 1 && !g) {
    g = { n: 1, x0: p[0].x, y0: p[0].y, t0: Date.now(), moved: false, drag: false, maxN: 1 };
    g.hold = setTimeout(function(){ if (g && g.n === 1 && !g.moved) { g.drag = true; var q = toPc(g.x0, g.y0); if (q) post({ type: 'a', x: q.x, y: q.y }); post({ type: 'btn', op: 'd' }); } }, HOLD);
  } else if (p.length >= 2) {
    if (!g) g = { t0: Date.now(), maxN: 2 };
    clearTimeout(g.hold);
    if (g.drag) { post({ type: 'btn', op: 'u' }); g.drag = false; }
    g.n = 2; g.maxN = Math.max(g.maxN, p.length); g.m0 = mid(p); g.d0 = dist(p); g.v0 = { s: view.s, x: view.x, y: view.y }; g.pan = 0;
  }
}, { passive: false });
document.addEventListener('touchmove', function(e){
  e.preventDefault();
  if (!g) return;
  var p = pts(e.touches);
  if (g.n === 1 && p.length === 1) {
    if (!g.moved && Math.hypot(p[0].x - g.x0, p[0].y - g.y0) > TAP) { g.moved = true; clearTimeout(g.hold); }
    if (g.moved || g.drag) { var q = toPc(p[0].x, p[0].y); if (q) post({ type: 'a', x: q.x, y: q.y }); }
  } else if (g.n === 2 && p.length >= 2) {
    var m = mid(p), d = dist(p), s = Math.min(Math.max(g.v0.s * d / Math.max(g.d0, 1), 1), 6);
    // zoom about the pinch centre, and follow it as it moves
    view.s = s;
    view.x = m.x - (g.m0.x - g.v0.x) * (s / g.v0.s);
    view.y = m.y - (g.m0.y - g.v0.y) * (s / g.v0.s);
    clampView(); apply();
    g.pan = Math.max(g.pan, Math.hypot(m.x - g.m0.x, m.y - g.m0.y), Math.abs(d - g.d0));
  }
}, { passive: false });
function end(e){
  e.preventDefault();
  if (!g) return;
  if (e.touches.length) return; // wait for every finger to lift
  clearTimeout(g.hold);
  var quick = Date.now() - g.t0 < 300;
  if (g.drag) post({ type: 'btn', op: 'u' });
  else if (g.maxN >= 2) { if (quick && g.pan < TAP) { var q2 = toPc(g.m0.x, g.m0.y); if (q2 && q2.inside) { post({ type: 'a', x: q2.x, y: q2.y }); post({ type: 'btn', op: 'c', which: 'r' }); } } }
  else if (!g.moved) { var q = toPc(g.x0, g.y0); if (q && q.inside) { post({ type: 'a', x: q.x, y: q.y }); post({ type: 'btn', op: 'c' }); } }
  g = null;
}
document.addEventListener('touchend', end, { passive: false });
document.addEventListener('touchcancel', end, { passive: false });

start();
})();
</script></body></html>`;
