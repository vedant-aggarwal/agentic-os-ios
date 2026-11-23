// The mood pet, in a WebView (phone) or an iframe (web build). One canvas, one fragment shader (shader.js) that
// raymarches the creature; sim.js moves it. The app sends its mood and the finger; see recv(). The scene sends
// `ready`, `error` and `haptic`.
import { VERT, frag } from './shader.js';
import { K } from './rig.js';
import { createSim } from './sim.js';

const RN = window.ReactNativeWebView;
const FRAMED = window.parent !== window;
const STANDALONE = !RN && !FRAMED;
function toApp(m) {
  if (RN) RN.postMessage(JSON.stringify(m));
  else if (FRAMED) window.parent.postMessage({ pet: m }, '*');
}
window.addEventListener('error', (e) => toApp({ t: 'error', msg: String(e.message || e) }));

const Q = new URLSearchParams(location.search);
const qBox = (Q.get('box') || '').split(',').map(Number);
const CFG = Object.assign(
  {
    size: Number(Q.get('size')) || 0, small: Q.has('small'), dpr: Number(Q.get('dpr')) || 0, shadow: Q.has('noshadow') ? 0 : 1,
    box: qBox.length === 3 && qBox.every(Number.isFinite) ? { x: qBox[0], y: qBox[1], s: qBox[2] } : null, state: null,
  },
  window.PET_CFG || {},
);
const SMALL = !!CFG.small;
let DPR = Math.min(CFG.dpr || window.devicePixelRatio || 1, SMALL ? 3 : 2);
let scale = 1;

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: STANDALONE, powerPreference: SMALL ? 'low-power' : 'high-performance' });
if (!gl) { toApp({ t: 'error', msg: 'WebGL2 unavailable' }); throw new Error('WebGL2 unavailable'); }

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}
let prog = null, U = {};
function build() {
  const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, frag(K, SMALL));
  const p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const msg = gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(p);
    console.error(msg);
    toApp({ t: 'error', msg: String(msg).slice(0, 400) });
    throw new Error(msg);
  }
  prog = p;
  gl.useProgram(p);
  U = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    U[name] = { loc: gl.getUniformLocation(p, info.name), type: info.type };
  }
}
build();
gl.disable(gl.BLEND);

const sim = createSim({ big: !SMALL });
sim.haptic = (k) => toApp({ t: 'haptic', k });
sim.setState({ shadow: CFG.shadow });
// the app's mood at boot, settled before the first frame, so the pet doesn't start from a blank face
if (CFG.state) sim.setState(CFG.state);
for (let i = 0; i < 15; i++) sim.advance(0.1);

// ── framing: where the pet's box sits in the canvas ──────────────────────────────────────────────────────
let W = 0, H = 0;
const view = { ox: 0, oy: 0, ppu: 1, dpr: DPR, ptPerUnit: 1, small: SMALL };
function frame() {
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.max(1, Math.round(W * DPR * scale));
  canvas.height = Math.max(1, Math.round(H * DPR * scale));
  const k = canvas.width / W; // device px per css px
  let box = CFG.box;
  if (!box) {
    const s = CFG.size || Math.min(W, H) * 0.5;
    box = { x: (W - s) / 2, y: (H - s) / 2 + s * 0.12, s };
  }
  view.ptPerUnit = box.s / 2;
  view.ppu = view.ptPerUnit * k;
  view.ox = (box.x + box.s / 2) * k;
  view.oy = canvas.height - (box.y + box.s / 2) * k;
  view.dpr = k;
  gl.viewport(0, 0, canvas.width, canvas.height);
  dirty = true;
}
let dirty = true;
window.addEventListener('resize', frame);

function upload(vals) {
  for (const name in vals) {
    const u = U[name];
    if (!u) continue;
    const v = vals[name];
    switch (u.type) {
      case gl.FLOAT: gl.uniform1f(u.loc, v); break;
      case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
      case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, v); break;
      case gl.FLOAT_MAT3: gl.uniformMatrix3fv(u.loc, false, v); break;
      case gl.INT_VEC4: gl.uniform4iv(u.loc, v); break;
      case gl.INT_VEC2: gl.uniform2iv(u.loc, v); break;
      default: break;
    }
  }
}

let tint = [0, 0, 0];
function render() {
  const vals = sim.out(view);
  vals.uRes = [canvas.width, canvas.height];
  vals.uView = [view.ox, view.oy, view.ppu];
  vals.uTime = sim.t;
  vals.uTint = tint;
  vals.uSteps = SMALL ? [72, 14, 3, 24] : [110, 26, 5, 30];
  upload(vals);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ── the loop: 60 fps while anything moves fast, 30 when it only breathes and blinks ─────────────────────
let paused = false, last = performance.now(), odd = false, readySent = false, manual = false;
const times = [];
function loop(now) {
  if (paused || manual) return;
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  sim.advance(dt);
  odd = !odd;
  if (!sim.busy() && odd && !dirty && readySent) return;
  dirty = false;
  render();
  if (!readySent) { readySent = true; requestAnimationFrame(() => toApp({ t: 'ready' })); }
  // keep the frame on time: if the GPU can't keep up, draw fewer pixels
  if (!SMALL) {
    times.push(dt);
    if (times.length > 45) {
      times.shift();
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      if (avg > 0.021 && scale > 0.6) { scale = Math.max(0.6, scale * 0.85); times.length = 0; frame(); }
    }
  }
}

// ── messages from the app ───────────────────────────────────────────────────────────────────────────────
function recv(m) {
  if (!m || !m.t) return;
  if (m.t === 'batch' && Array.isArray(m.m)) { for (const x of m.m) recv(x); return; }
  if (m.t === 'state') sim.setState(m);
  else if (m.t === 'gaze') sim.setGaze(m.x, m.y, !!m.on);
  else if (m.t === 'rub') sim.setRub(!!m.on, m.fx, m.fy, !!m.strong, m.dx || 0);
  else if (m.t === 'react') sim.react(m.face);
  else if (m.t === 'heart') sim.heart();
  else if (m.t === 'tint' && Array.isArray(m.c)) tint = m.c;
  else if (m.t === 'box') { CFG.box = m.box; frame(); }
  else if (m.t === 'pause') paused = true;
  else if (m.t === 'resume') { if (paused) { paused = false; last = performance.now(); dirty = true; requestAnimationFrame(loop); } }
}
window.pet = { recv };
window.addEventListener('message', (e) => {
  let m = e.data;
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch { return; } }
  recv(m);
});
document.addEventListener('message', (e) => { try { recv(JSON.parse(e.data)); } catch { /* not ours */ } });
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); paused = true; });
canvas.addEventListener('webglcontextrestored', () => { build(); paused = false; last = performance.now(); requestAnimationFrame(loop); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !paused && !manual) { last = performance.now(); requestAnimationFrame(loop); } });

frame();
requestAnimationFrame(loop);

// ── on its own (dev): sliders, and the mouse as the finger ──────────────────────────────────────────────
if (STANDALONE) {
  const init = {};
  for (const k of ['sad', 'drive', 'val', 'nrg', 'joy', 'worry', 'anger', 'think']) if (Q.has(k)) init[k] = Number(Q.get(k));
  if (Object.keys(init).length) sim.setState(init);
  if (Q.has('reduce')) sim.setState({ reduce: true });
  if (Q.has('still')) sim.setState({ still: true });
  const bg = Q.get('bg') || 'room';
  document.body.style.background = bg === 'none' ? 'transparent'
    : bg === 'glass' ? 'radial-gradient(circle at 50% 50%, #2a2f3a 0, #1b1f28 60%, #11141c 100%)'
    : bg === 'checker' ? 'repeating-conic-gradient(#333 0 25%, #444 0 50%) 0 0/24px 24px'
    : 'radial-gradient(ellipse 60% 55% at 50% 38%, #2b2620 0, #15131a 55%, #07080c 100%)';
  window.petDev = {
    sim, view, render,
    set: (o) => sim.setState(o),
    react: (f) => sim.react(f),
    heart: (n = 1) => { for (let i = 0; i < n; i++) sim.heart(); },
    rub: (on, fx = 0, fy = 0, strong = true, dx = 0) => sim.setRub(on, fx, fy, strong, dx),
    gaze: (x, y, on = true) => sim.setGaze(x, y, on),
    tint: (c) => { tint = c; },
    manual: () => { manual = true; },
    auto: () => { manual = false; last = performance.now(); requestAnimationFrame(loop); },
    tick: (ms) => { sim.advance(ms / 1000); render(); },
    // step in small pieces so the fixed-step sim sees every frame
    run: (ms, step = 1000 / 60) => { for (let a = 0; a < ms; a += step) sim.advance(step / 1000); render(); },
    grab: () => canvas.toDataURL('image/png'),
    frame,
  };
  if (!Q.has('nopanel')) {
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;left:8px;top:8px;font:12px system-ui;color:#ddd;background:rgba(0,0,0,.55);padding:8px;border-radius:8px;z-index:2;max-width:240px';
    const s = sim.inp;
    for (const k of ['sad', 'drive', 'val', 'nrg', 'joy', 'worry', 'anger', 'think']) {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;gap:6px;align-items:center';
      const min = k === 'val' || k === 'nrg' ? -1 : 0;
      row.innerHTML = `<span style="width:44px">${k}</span><input type=range min=${min} max=1 step=0.01 value=${s[k]}>`;
      row.querySelector('input').oninput = (e) => sim.setState({ [k]: Number(e.target.value) });
      panel.appendChild(row);
    }
    for (const f of ['happy', 'excited', 'calm', 'proud', 'concerned', 'sad', 'tired', 'angry']) {
      const b = document.createElement('button');
      b.textContent = f; b.style.cssText = 'margin:2px;font:11px system-ui';
      b.onclick = () => sim.react(f);
      panel.appendChild(b);
    }
    const hb = document.createElement('button'); hb.textContent = 'hearts'; hb.style.cssText = 'margin:2px;font:11px system-ui';
    hb.onclick = () => { for (let i = 0; i < 4; i++) setTimeout(() => sim.heart(), i * 180); };
    panel.appendChild(hb);
    document.body.appendChild(panel);
  }
  // the mouse: hover is the finger watching; press on the pet and move to rub it
  let down = false, lx = 0, energy = 0;
  canvas.addEventListener('pointermove', (e) => {
    const k = view.dpr;
    const cx = view.ox / k, cy = (canvas.height - view.oy) / k;
    const r = view.ptPerUnit;
    if (down) {
      const fx = (e.clientX - cx) / r, fy = (e.clientY - cy) / r;
      energy += Math.abs(e.clientX - lx);
      sim.setRub(true, fx, fy, false, e.clientX - lx);
      if (Math.random() < 0.08) sim.heart();
      lx = e.clientX;
    } else sim.setGaze(e.clientX - cx, e.clientY - cy, true);
  });
  canvas.addEventListener('pointerdown', (e) => { down = true; lx = e.clientX; energy = 0; });
  window.addEventListener('pointerup', () => { if (down) { down = false; sim.setRub(false, 0, 0, energy > 40); } });
  canvas.addEventListener('pointerleave', () => sim.setGaze(0, 0, false));
}
