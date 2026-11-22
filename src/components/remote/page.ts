// The page inside the remote desktop's WebView. WKWebView has WebRTC with hardware H.264 decoding, so the PC's screen
// plays here with no native video module. Video comes through the PC server (pc-screen.ts):
//   1. WebRTC straight to the PC (Wi-Fi first, then Tailscale)
//   2. WebRTC through the TURN relay on the VPS when 1 can't connect (Auto quality drops to the 720p30 "lite" stream)
//   3. JPEG frames over the tunnel when video can't connect at all
// Two input modes, switched from the app (setMode):
//   mouse: a pointer drawn on the picture; drag anywhere to move it (faster drags go further), tap to click,
//          hold then drag to drag, two-finger tap to right-click, two fingers to scroll, pinch to zoom (the view
//          follows the pointer).
//   touch: the pointer goes where you touch; tap clicks there, hold and let go right-clicks, hold then move drags,
//          two-finger tap right-clicks, two fingers scroll (or pan when zoomed in), pinch to zoom.
// Three-finger tap: show or hide the keyboard. Input goes to the app (postMessage), which sends it to the PC.
export const REMOTE_PAGE = String.raw`<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<style>
html,body{margin:0;height:100%;background:#000;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
#stage{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:0 0;will-change:transform}
video,img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none}
img{display:none}
#cur{position:absolute;left:0;top:0;width:22px;height:22px;pointer-events:none;display:none;will-change:transform;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.7))}
#ring{position:absolute;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:2px solid rgba(255,255,255,.85);pointer-events:none;opacity:0;transform:scale(.4);transition:opacity .15s,transform .25s}
#ring.on{opacity:1;transform:scale(1)}
</style></head><body>
<div id="stage"><video id="v" autoplay playsinline muted></video><img id="i"></div>
<svg id="cur" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.2 14.2 L10 20.5 L12.8 19.3 L10.1 13.1 L15.8 13.1 Z" fill="#fff" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg>
<div id="ring"></div>
<script>
(function(){
var A = window.AOS || {}, H = { Authorization: 'Bearer ' + A.token, 'Content-Type': 'application/json' };
var post = function(m){ try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch(e){} };
var video = document.getElementById('v'), img = document.getElementById('i'), stage = document.getElementById('stage');
var curEl = document.getElementById('cur'), ring = document.getElementById('ring');
var pc = null, ws = null, gen = 0, mode = 'video', quality = A.quality || 'auto', input = A.input || 'mouse', fit = A.fit || 'fit';

// ---------------- connection ----------------
function cleanup(){
  if (pc) { try { pc.onconnectionstatechange = null; pc.close(); } catch(e){} pc = null; }
  if (ws) { try { ws.onclose = null; ws.close(); } catch(e){} ws = null; }
}
function gathered(p, ms){ return new Promise(function(r){
  if (p.iceGatheringState === 'complete') return r();
  p.addEventListener('icegatheringstatechange', function(){ if (p.iceGatheringState === 'complete') r(); });
  setTimeout(r, ms);
}); }
function connected(p, ms){ return new Promise(function(r){
  p.addEventListener('connectionstatechange', function(){
    if (p.connectionState === 'connected') r(true);
    if (p.connectionState === 'failed') r(false);
  });
  setTimeout(function(){ r(p.connectionState === 'connected'); }, ms);
}); }
async function routeOf(p){
  var st = await p.getStats(), pair = null, out = { type: 'direct', net: '' };
  st.forEach(function(s){ if (s.type === 'candidate-pair' && s.state === 'succeeded' && (s.nominated || !pair)) pair = s; });
  if (pair) {
    var c = st.get(pair.localCandidateId), rc = st.get(pair.remoteCandidateId);
    if ((c && c.candidateType === 'relay') || (rc && rc.candidateType === 'relay')) out.type = 'relay';
    var ip = rc && (rc.address || rc.ip) || '';
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) out.net = 'tailscale';
    else if (out.type === 'direct') out.net = 'wifi';
  }
  return out;
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
  var rt = await routeOf(p);
  if (rt.type === 'relay' && src === 'pc' && quality === 'auto') return connect('lite', my); // through the relay: less data
  video.style.display = 'block'; img.style.display = 'none';
  post({ type: 'route', route: rt.type, net: rt.net, stream: src });
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
    img.onload = function(){ if (last) URL.revokeObjectURL(last); last = u; layout(); };
    img.src = u; img.style.display = 'block'; video.style.display = 'none';
  };
  s.onclose = function(){ if (my === gen) setTimeout(start, 3000); };
  setTimeout(function(){ if (my === gen && mode === 'frames') start(); }, 45000); // keep trying for real video
}
async function start(){
  var my = ++gen;
  try { await connect(quality === 'lite' ? 'lite' : 'pc', my); }
  catch (e) { post({ type: 'log', m: String(e && e.message || e) }); if (my === gen) frames(my); }
}
window.start = start;
window.stop = function(){ gen++; cleanup(); };
window.setQuality = function(q){ quality = q; start(); };

// frame rate and round trip, for the session bar
setInterval(async function(){
  if (!pc || mode !== 'video') return;
  try {
    var st = await pc.getStats(), fps = 0, rtt = 0;
    st.forEach(function(s){
      if (s.type === 'inbound-rtp' && s.kind === 'video') fps = s.framesPerSecond || fps;
      if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.currentRoundTripTime) rtt = Math.round(s.currentRoundTripTime * 1000);
    });
    post({ type: 'stats', fps: Math.round(fps), rtt: rtt, w: video.videoWidth, h: video.videoHeight });
  } catch(e){}
}, 2000);

// ---------------- view: zoom and pan ----------------
var view = { s: 1, x: 0, y: 0 }, base = 1;
function size(){
  var vw = mode === 'frames' ? img.naturalWidth : video.videoWidth, vh = mode === 'frames' ? img.naturalHeight : video.videoHeight;
  return vw && vh ? { w: vw, h: vh } : null;
}
// where the picture sits at zoom 1 (object-fit: contain)
function box(){
  var z = size(), W = innerWidth, Hh = innerHeight;
  if (!z) return { x: 0, y: 0, w: W, h: Hh };
  var k = Math.min(W / z.w, Hh / z.h), cw = z.w * k, ch = z.h * k;
  return { x: (W - cw) / 2, y: (Hh - ch) / 2, w: cw, h: ch };
}
function apply(){ stage.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.s + ')'; drawCursor(); }
function clampView(){
  var W = innerWidth, Hh = innerHeight, b = box();
  view.s = Math.min(Math.max(view.s, 1), 8);
  // keep the picture covering the screen where it can; centre it where it is smaller than the screen
  var pw = b.w * view.s, ph = b.h * view.s, px = b.x * view.s, py = b.y * view.s;
  view.x = pw <= W ? (W - pw) / 2 - px : Math.min(-px, Math.max(W - px - pw, view.x));
  view.y = ph <= Hh ? (Hh - ph) / 2 - py : Math.min(-py, Math.max(Hh - py - ph, view.y));
}
function zoomTo(s, cx, cy){
  var k = s / view.s;
  view.x = cx - (cx - view.x) * k; view.y = cy - (cy - view.y) * k; view.s = s;
  clampView(); apply(); post({ type: 'zoom', s: Math.round(view.s / base * 100) / 100 });
}
function layout(){
  var b = box(), W = innerWidth, Hh = innerHeight;
  base = fit === 'fill' ? Math.max(W / b.w, Hh / b.h) : 1;
  view = { s: base, x: 0, y: 0 };
  if (fit === 'fill') { view.x = W / 2 - (b.x + b.w / 2) * base; view.y = Hh / 2 - (b.y + b.h / 2) * base; }
  clampView(); apply();
}
window.resetView = layout;
window.setFit = function(f){ fit = f; layout(); };
video.addEventListener('resize', layout);
video.addEventListener('loadedmetadata', layout);
addEventListener('resize', function(){ setTimeout(layout, 50); });

// screen point <-> 0..1 on the PC's display
function toPc(cx, cy){
  var b = box(), px = (cx - view.x) / view.s, py = (cy - view.y) / view.s;
  var nx = (px - b.x) / b.w, ny = (py - b.y) / b.h;
  return { x: Math.min(Math.max(nx, 0), 1), y: Math.min(Math.max(ny, 0), 1), inside: nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 };
}
function fromPc(x, y){ var b = box(); return { x: (b.x + x * b.w) * view.s + view.x, y: (b.y + y * b.h) * view.s + view.y }; }

// ---------------- the pointer ----------------
var cur = { x: 0.5, y: 0.5 };
function drawCursor(){
  if (input !== 'mouse') { curEl.style.display = 'none'; return; }
  var p = fromPc(cur.x, cur.y);
  curEl.style.display = 'block';
  curEl.style.transform = 'translate(' + (p.x - 3) + 'px,' + (p.y - 2) + 'px)';
}
function sendCur(){ post({ type: 'a', x: cur.x, y: cur.y }); drawCursor(); }
// zoomed in: slide the view so the pointer stays on screen
function follow(){
  if (view.s <= 1.01) return;
  var p = fromPc(cur.x, cur.y), m = 60, W = innerWidth, Hh = innerHeight, dx = 0, dy = 0;
  if (p.x < m) dx = m - p.x; else if (p.x > W - m) dx = W - m - p.x;
  if (p.y < m) dy = m - p.y; else if (p.y > Hh - m) dy = Hh - m - p.y;
  if (dx || dy) { view.x += dx; view.y += dy; clampView(); apply(); }
}
window.setMode = function(m){ input = m; drawCursor(); };
function showRing(x, y, on){ ring.style.left = x + 'px'; ring.style.top = y + 'px'; ring.className = on ? 'on' : ''; }

// ---------------- touch ----------------
var g = null, HOLD = 380, TAP = 9, LONG = 550;
function pts(t){ var a = []; for (var i = 0; i < t.length; i++) a.push({ x: t[i].clientX, y: t[i].clientY }); return a; }
function mid(a){ return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; }
function dist(a){ return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }

document.addEventListener('touchstart', function(e){
  e.preventDefault();
  var p = pts(e.touches), now = Date.now();
  if (p.length === 1 && !g) {
    g = { n: 1, maxN: 1, x0: p[0].x, y0: p[0].y, lx: p[0].x, ly: p[0].y, lt: now, t0: now, moved: false, held: false, drag: false };
    g.timer = setTimeout(function(){
      if (!g || g.n !== 1 || g.moved) return;
      g.held = true; post({ type: 'hold' });
      if (input === 'mouse') showRing(fromPc(cur.x, cur.y).x, fromPc(cur.x, cur.y).y, true);
      else { showRing(g.x0, g.y0, true); var q = toPc(g.x0, g.y0); if (q.inside) post({ type: 'a', x: q.x, y: q.y }); }
    }, input === 'mouse' ? HOLD : LONG);
  } else if (p.length >= 2) {
    if (!g) g = { t0: now, maxN: 1 };
    clearTimeout(g.timer);
    if (g.drag) { post({ type: 'btn', op: 'u' }); g.drag = false; }
    showRing(0, 0, false);
    g.n = 2; g.maxN = Math.max(g.maxN, p.length);
    g.m0 = mid(p); g.lm = g.m0; g.d0 = dist(p); g.s0 = view.s; g.kind = null; g.travel = 0;
  }
}, { passive: false });

document.addEventListener('touchmove', function(e){
  e.preventDefault();
  if (!g) return;
  var p = pts(e.touches), now = Date.now();
  if (g.n === 1 && p.length === 1) {
    var x = p[0].x, y = p[0].y;
    if (!g.moved && Math.hypot(x - g.x0, y - g.y0) > TAP) {
      g.moved = true;
      if (g.held) { // hold, then move: drag
        g.drag = true;
        if (input === 'touch') { var q0 = toPc(g.x0, g.y0); post({ type: 'a', x: q0.x, y: q0.y }); }
        post({ type: 'btn', op: 'd' });
      } else clearTimeout(g.timer);
    }
    if (input === 'mouse') {
      if (g.moved) {
        var dx = x - g.lx, dy = y - g.ly, dt = Math.max(now - g.lt, 8), v = Math.hypot(dx, dy) / dt; // px per ms
        var gain = 1.1 + Math.min(v * 1.6, 2.6); // slow is precise, fast goes far
        var b = box();
        cur.x = Math.min(Math.max(cur.x + dx * gain / (b.w * view.s), 0), 1);
        cur.y = Math.min(Math.max(cur.y + dy * gain / (b.h * view.s), 0), 1);
        sendCur(); follow();
        if (g.drag) showRing(fromPc(cur.x, cur.y).x, fromPc(cur.x, cur.y).y, true);
      }
    } else if (g.moved) {
      var q = toPc(x, y); post({ type: 'a', x: q.x, y: q.y });
      if (g.drag) showRing(x, y, true);
    }
    g.lx = x; g.ly = y; g.lt = now;
  } else if (g.n === 2 && p.length >= 2) {
    var m = mid(p), d = dist(p);
    g.travel = Math.max(g.travel, Math.hypot(m.x - g.m0.x, m.y - g.m0.y), Math.abs(d - g.d0));
    if (!g.kind && g.travel > 10) g.kind = Math.abs(d - g.d0) > Math.hypot(m.x - g.m0.x, m.y - g.m0.y) * 0.8 ? 'pinch' : 'scroll';
    if (g.kind === 'pinch') {
      var s = Math.min(Math.max(g.s0 * d / Math.max(g.d0, 1), 1), 8);
      zoomTo(s, m.x, m.y);
      view.x += m.x - g.lm.x; view.y += m.y - g.lm.y; clampView(); apply();
    } else if (g.kind === 'scroll') {
      var ddx = m.x - g.lm.x, ddy = m.y - g.lm.y;
      if (input === 'touch' && view.s > base * 1.02) { view.x += ddx; view.y += ddy; clampView(); apply(); }
      else post({ type: 'scroll', dx: -ddx, dy: ddy });
    }
    g.lm = m;
  }
}, { passive: false });

function end(e){
  e.preventDefault();
  if (!g) return;
  if (e.touches.length) return; // wait for every finger to lift
  clearTimeout(g.timer);
  showRing(0, 0, false);
  var quick = Date.now() - g.t0 < 320;
  if (g.drag) post({ type: 'btn', op: 'u' });
  else if (g.maxN >= 3) { if (quick && g.travel < 14) post({ type: 'kbd' }); }
  else if (g.maxN === 2) {
    if (quick && g.travel < TAP) {
      if (input === 'touch') { var q2 = toPc(g.m0.x, g.m0.y); if (q2.inside) post({ type: 'a', x: q2.x, y: q2.y }); }
      post({ type: 'btn', op: 'c', which: 'r' });
    }
  } else if (!g.moved) {
    if (input === 'mouse') post({ type: 'btn', op: 'c', which: g.held ? 'r' : 'l' });
    else { var q = toPc(g.x0, g.y0); if (q.inside) { post({ type: 'a', x: q.x, y: q.y }); post({ type: 'btn', op: 'c', which: g.held ? 'r' : 'l' }); } }
  }
  g = null;
}
document.addEventListener('touchend', end, { passive: false });
document.addEventListener('touchcancel', end, { passive: false });

drawCursor();
start();
})();
</script></body></html>`;
