// The mood logger's field: a stone basin of water in a dark cave, seen from above. He touches the water where he is:
// across is how pleasant (left bad, right good), up is energy (bottom drained, top wired). The whole pool turns into
// that weather: rain and an ember light top left, sun glitter on choppy water top right, cold mist on still black water
// bottom left, a golden calm with fireflies bottom right. The ripples are a real height field (simulated here on the
// CPU, uploaded every frame); the floor, caustics, refraction, glints, lamps and mist are one full-screen shader.
// Runs in a WebView (phone) or an iframe (web build). Messages: recv() in, toApp() out. Opened on its own (dev) it
// drives itself: `?p=0.6&e=-0.4` sets a mood, `&stage=context` a stage.

const RN = window.ReactNativeWebView;
const FRAMED = !RN && window.parent !== window;
const STANDALONE = !RN && !FRAMED;
function toApp(m) {
  if (RN) RN.postMessage(JSON.stringify(m));
  else if (FRAMED) window.parent.postMessage({ pool: m }, '*');
}
window.addEventListener('error', (e) => toApp({ t: 'error', msg: String(e.message || e) }));

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, k) => a + (b - a) * k;
const smooth01 = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const lin = (c) => Math.pow(c / 255, 2.2);
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);

const cv = document.getElementById('c');
const gl = cv.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
if (!gl) { toApp({ t: 'error', msg: 'webgl2' }); throw new Error('webgl2 unavailable'); }

// ── weather ─────────────────────────────────────────────────────────────────────────────────────────────────
// One preset per corner; the pool blends them by where his finger is. Colours are sRGB 0-255.
// light: the key light from above and its strength (li); deep: the colour murky water scatters; clar: how clear;
// chop: wind on the surface; mist over it; spark: how much the light glitters; rain, storm (lightning), drip (cave
// drips), motes (fireflies); amb: what little light the cave has of its own; lamp: the underwater lamp's colour.
const PRESET = {
  tl: { light: [255, 104, 62], li: 1.6, deep: [30, 24, 26], clar: 0.42, chop: 0.32, mist: 0.06, mistCol: [96, 70, 64], spark: 0.4, rain: 1.0, storm: 1, drip: 0, motes: 0, amb: [26, 16, 15], lamp: [255, 120, 80] },
  tr: { light: [255, 232, 184], li: 2.3, deep: [8, 104, 140], clar: 1.0, chop: 0.85, mist: 0, mistCol: [220, 216, 200], spark: 1.0, rain: 0, storm: 0, drip: 0, motes: 0.1, amb: [30, 38, 46], lamp: [255, 236, 190] },
  bl: { light: [112, 146, 255], li: 0.78, deep: [8, 18, 40], clar: 0.42, chop: 0.0, mist: 0.8, mistCol: [130, 146, 186], spark: 0.2, rain: 0, storm: 0, drip: 1, motes: 0, amb: [10, 14, 28], lamp: [150, 180, 255] },
  br: { light: [255, 186, 112], li: 1.8, deep: [22, 78, 64], clar: 0.94, chop: 0.05, mist: 0.4, mistCol: [255, 214, 170], spark: 0.45, rain: 0, storm: 0, drip: 0.15, motes: 1, amb: [30, 24, 18], lamp: [255, 200, 130] },
  rest: { light: [176, 198, 236], li: 1.15, deep: [12, 36, 50], clar: 0.72, chop: 0.05, mist: 0.3, mistCol: [170, 184, 210], spark: 0.35, rain: 0, storm: 0, drip: 0.35, motes: 0.3, amb: [14, 17, 24], lamp: [210, 222, 255] },
};
const KEYS = Object.keys(PRESET.rest);
// effects that should stay in their corner, not bleed across the middle
const CURVE = { rain: 2.2, storm: 3, drip: 1.6, motes: 1.6, mist: 1.4 };

function weatherAt(p, e) {
  const a = smooth01((p + 1) / 2), b = smooth01((e + 1) / 2);
  const w = {};
  for (const k of KEYS) {
    const tl = PRESET.tl[k], tr = PRESET.tr[k], bl = PRESET.bl[k], br = PRESET.br[k];
    if (Array.isArray(tl)) w[k] = tl.map((_, i) => mix(mix(bl[i], br[i], a), mix(tl[i], tr[i], a), b));
    else { const v = mix(mix(bl, br, a), mix(tl, tr, a), b); w[k] = CURVE[k] ? Math.pow(v, CURVE[k]) : v; }
  }
  return w;
}
function blendW(x, y, k) {
  const w = {};
  for (const key of KEYS) w[key] = Array.isArray(x[key]) ? x[key].map((v, i) => mix(v, y[key][i], k)) : mix(x[key], y[key], k);
  return w;
}

// ── state ───────────────────────────────────────────────────────────────────────────────────────────────────
const S = {
  W: innerWidth, H: innerHeight, dpr: Math.min(window.devicePixelRatio || 1, 2), scale: 1,
  pool: { x: 14, y: Math.round(innerHeight * 0.31), w: innerWidth - 28, h: Math.round(innerHeight * 0.55), r: 30 },
  stage: 'field', reduce: false, paused: false,
  touched: false, tp: 0, te: 0, restK: 1,
  w: JSON.parse(JSON.stringify(PRESET.rest)),
  marker: { x: 0, y: 0, k: 0, to: 0 },
  lights: [],
  reveal: { x: 0, y: 0, r: 0, mode: 0 }, // 0 dark, 1 spreading, 2 lit
  fade: 1, closing: false,
  think: false, thinkT: 0,
  calm: 0, calmTo: 0,
  labK: 0, labTo: 1,
  flash: 0, bolts: [], nextBolt: 2.5, nextDrip: 2.5, rainAcc: 0,
  finger: null, moved: false,
  time: 0, frames: 0, slow: 0,
  labels: { top: 'Wired', bottom: 'Drained', left: 'Bad', right: 'Good' },
};

// ── gl helpers ──────────────────────────────────────────────────────────────────────────────────────────────
function shader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
  return s;
}
function program(fs, vs = VS) {
  const p = gl.createProgram();
  gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'a');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}
function texture(filter, wrap) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return t;
}

const VS = `#version 300 es
in vec2 a; void main() { gl_Position = vec4(a, 0., 1.); }`;

const COMMON = `
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
`;

// The basin's floor, drawn once per size into a texture: dark basalt with faint veins, and smooth river pebbles
// that gathered along the walls and in the corners, never over the inlaid words. rgb colour (sRGB), a height.
const FLOOR_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uSize, uTex;
uniform vec4 uAvoid[4];
${COMMON}
vec3 pal(float k) {
  if (k < .24) return vec3(.42, .43, .44);
  if (k < .42) return vec3(.28, .285, .29);
  if (k < .60) return vec3(.52, .49, .45);
  if (k < .74) return vec3(.60, .54, .45);
  if (k < .84) return vec3(.50, .38, .31);
  if (k < .94) return vec3(.66, .65, .62);
  return vec3(.36, .40, .38);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uTex;
  vec2 p = uv * uSize;
  float n = fbm(p * .011) * .55 + fbm(p * .043 + 7.) * .3 + vn(p * .33) * .15;
  vec3 col = mix(vec3(.26, .265, .27), vec3(.40, .39, .37), n);
  float v = abs(fbm(p * .0055 + vec2(3.1, 9.2)) - .5);
  col = mix(col, vec3(.44, .43, .4), smoothstep(.006, .0, v) * .18);
  col *= .92 + .16 * h12(floor(p * 1.7));
  float hgt = .22 + n * .14;
  vec2 g = p / 21.;
  vec2 ip = floor(g);
  float best = 9., aoN = 9.;
  vec3 pc = vec3(0.);
  float pid = 0.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 cell = ip + vec2(float(i), float(j));
    vec2 hh = h22(cell);
    vec2 ctr = (cell + .2 + .6 * hh) * 21.;
    vec2 cu = ctr / uSize;
    float edge = 1. - smoothstep(.0, .2, min(min(cu.x, 1. - cu.x), min(cu.y, 1. - cu.y)));
    float corner = 1. - smoothstep(.0, .3, length(min(cu, 1. - cu)));
    float dens = .05 + .12 * edge + .3 * corner + .62 * smoothstep(.5, .7, fbm(ctr * .0075 + 4.));
    for (int k = 0; k < 4; k++) { vec2 a = (ctr - uAvoid[k].xy) / uAvoid[k].zw; dens *= smoothstep(.85, 1.35, length(a)); }
    if (h12(cell + 11.3) > dens) continue;
    float ang = h12(cell + 3.7) * 6.2831;
    float sz = 4.5 + 9. * pow(h12(cell + 5.1), 1.6);
    float asp = .6 + .4 * h12(cell + 9.9);
    vec2 q = p - ctr;
    q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * q;
    q.y /= asp;
    float dd = length(q) / sz;
    aoN = min(aoN, dd);
    if (dd < best) { best = dd; pc = pal(h12(cell + 21.7)) * (.82 + .3 * h12(cell + 2.2)); pid = h12(cell + 41.1); }
  }
  if (best < 1.) {
    float dome = sqrt(max(0., 1. - best * best));
    vec3 pcol = pc * (.86 + .28 * vn(p * .5 + pid * 50.)) * (.9 + .2 * h12(floor(p * 2.3)));
    col = mix(col * mix(.72, 1., smoothstep(.95, 1.9, aoN)), pcol, smoothstep(1., .9, best));
    hgt = max(hgt, .3 + .7 * dome);
  } else {
    col *= mix(.72, 1., smoothstep(.95, 1.9, aoN));
  }
  o = vec4(col, hgt);
}`;

// The wind on the water, shared by the surface and the caustics: three octaves of noise slope scrolling with the
// wind, the longest always there a little (the water is never dead), the rest only when he is wired.
const CHOP = `
vec2 chopAt(vec2 px, float t, float chop) {
  vec2 c1 = textureLod(uNoise, px * vec2(.00165, .00215) + vec2(t * .010, t * .006), 0.).rg - .5;
  vec2 c2 = textureLod(uNoise, px * vec2(.0042, .0051) + vec2(-t * .017, t * .013), 0.).rg - .5;
  vec2 c3 = textureLod(uNoise, px * vec2(.0102, .0118) + vec2(t * .031, -t * .024), 0.).rg - .5;
  return c1 * (.025 + .13 * chop) + c2 * .09 * chop + c3 * .05 * chop;
}
vec2 chopSoft(vec2 px, float t, float chop) {
  vec2 c1 = textureLod(uNoise, px * vec2(.00165, .00215) + vec2(t * .010, t * .006), 2.6).rg - .5;
  vec2 c2 = textureLod(uNoise, px * vec2(.0042, .0051) + vec2(-t * .017, t * .013), 1.8).rg - .5;
  return c1 * (.006 + .14 * chop) + c2 * .1 * chop;
}
vec2 shimmerAt(vec2 px, float t) {
  return textureLod(uNoise, px * vec2(.0036, .0043) + vec2(t * .016, -t * .012), 0.).rg - .5;
}`;

// Caustics, for real: every cell of the water surface refracts the light from above onto the floor; where the waves
// focus it, the cell's patch of floor shrinks and gets brighter (Evan Wallace's area trick). Additive, into a texture
// the floor reads. The depth used here is deeper than the floor looks, so gentle water still throws a network.
const CAUST_VS = `#version 300 es
precision highp float;
in vec2 a;
uniform vec4 uPool;
uniform float uT, uNS, uChop, uCW, uCD;
uniform vec3 uLd;
uniform sampler2D uSim, uNoise;
out vec2 vOld, vNew;
${CHOP}
void main() {
  vec2 px = uPool.xy + a * uPool.zw;
  vec2 ns = textureLod(uSim, a, 0.).xy * uNS + chopAt(px, uT, uChop) * 1.4 + shimmerAt(px, uT) * uCW;
  vec3 I = -uLd;
  vec3 T = refract(I, normalize(vec3(ns, 1.)), .7519);
  vec3 T0 = refract(I, vec3(0., 0., 1.), .7519);
  vec2 off = T.xy * (uCD / -T.z) - T0.xy * (uCD / -T0.z);
  vOld = px;
  vNew = px + off;
  vec2 uv = (vNew - uPool.xy) / uPool.zw;
  gl_Position = vec4(uv * 2. - 1., 0., 1.);
}`;
const CAUST_FS = `#version 300 es
precision highp float;
in vec2 vOld, vNew;
out vec4 o;
void main() {
  float a0 = length(dFdx(vOld)) * length(dFdy(vOld));
  float a1 = length(dFdx(vNew)) * length(dFdy(vNew));
  o = vec4(vec3(min(a0 / max(a1, 1e-6), 6.) * .16), 1.);
}`;

const MAIN_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform float uDpr, uT;
uniform vec4 uPool;
uniform float uRad;
uniform sampler2D uSim, uFloor, uNoise, uLab, uCaus;
uniform float uNS;
uniform vec3 uLight, uDeep, uMistCol, uAmb, uLamp, uLd;
uniform float uLI, uClar, uChop, uMist, uSpark, uFlash, uLabK, uFade;
uniform vec4 uReveal;
uniform vec4 uL[9];
uniform int uLN;
uniform vec4 uM[14];
uniform int uMN;
uniform int uDebug;
${COMMON}
${CHOP}
const float PI = 3.14159265;
const float LIP = 11.;
float sdRR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
vec2 gradRR(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r; vec2 s = sign(p);
  if (q.x > 0. && q.y > 0.) return normalize(q) * s;
  return q.x > q.y ? vec2(s.x, 0.) : vec2(0., s.y);
}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
vec3 basalt(vec2 p) {
  float n = texture(uNoise, p * .0021).b * .6 + texture(uNoise, p * .011).a * .3 + texture(uNoise, p * .03).b * .1;
  return vec3(.016, .017, .019) * (.55 + .9 * n);
}
// light thrown off the water onto nearby stone: soft moving veins
float wallShimmer(vec2 px, float t) {
  float n = texture(uNoise, px * .0045 + vec2(t * .02, -t * .013)).b;
  float m = texture(uNoise, px * .0071 + vec2(-t * .017, t * .019)).a;
  return pow(max(0., 1. - abs(n - m) * 2.2), 6.);
}
void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 C = uPool.xy + uPool.zw * .5, B = uPool.zw * .5;
  float d = sdRR(px - C, B, uRad);
  float t = uT;
  float rv = uReveal.w > 1.5 ? 1. : uReveal.w > .5 ? smoothstep(uReveal.z, uReveal.z - 170., length(px - uReveal.xy)) : 0.;
  vec3 Lc = uLight * uLI * mix(.05, 1., rv) * uFade;
  vec3 amb = uAmb * mix(.45, 1., rv) * uFade;
  vec3 lamp = uLamp * uFade;
  vec3 Ld = uLd;
  vec3 col;
  vec2 ns = vec2(0.);
  float caus = 1.;

  if (d < 0.) {
    vec2 uv = (px - uPool.xy) / uPool.zw;
    vec4 sm = texture(uSim, uv);
    ns = sm.xy * uNS + chopAt(px, t, uChop);
    vec3 N = normalize(vec3(ns, 1.));
    float wall = smoothstep(0., 80., -d);
    float depth = 15. + 24. * wall;
    vec2 fp = px + ns * depth * .8;
    vec2 fuv = clamp((fp - uPool.xy) / uPool.zw, .001, .999);
    vec4 fl = texture(uFloor, fuv);
    vec3 alb = pow(fl.rgb, vec3(2.2));
    vec2 fT = 1. / vec2(textureSize(uFloor, 0));
    float hx = texture(uFloor, fuv + vec2(fT.x, 0.)).a - texture(uFloor, fuv - vec2(fT.x, 0.)).a;
    float hy = texture(uFloor, fuv + vec2(0., fT.y)).a - texture(uFloor, fuv - vec2(0., fT.y)).a;
    vec3 fN = normalize(vec3(-hx * 4., -hy * 4., 1.));
    float lab = texture(uLab, fuv).a * uLabK;
    alb = mix(alb, vec3(.78, .55, .22), lab);
    caus = texture(uCaus, fuv).r / .16;
    float ce = mix(1., caus, .35 + .65 * uClar);
    vec2 sd = (px - vec2(C.x - .06 * uPool.z, uPool.y + .22 * uPool.w)) / uPool.zw;
    float spot = .55 + .6 * exp(-dot(sd, sd) * 2.);
    float lam = max(dot(fN, Ld), 0.);
    vec3 light = amb * .9 + Lc * spot * lam * ce;
    vec3 glowUp = vec3(0.);
    for (int i = 0; i < 9; i++) {
      if (i >= uLN) break;
      vec4 L = uL[i];
      vec2 dv = fp - L.xy;
      float r2 = dot(dv, dv) / (L.w * L.w);
      light += lamp * L.z * (1. / (1. + r2 * 1.6)) * (.6 + .4 * ce) * max(dot(fN, normalize(vec3(-dv, 26.))), 0.) * 1.5;
      vec2 dp = px - L.xy;
      glowUp += lamp * L.z * (exp(-dot(dp, dp) / (L.w * L.w * .02)) * .3 + exp(-dot(dp, dp) / (L.w * L.w * .4)) * .025);
    }
    light *= mix(.32, 1., smoothstep(0., 24., -d));
    vec3 floorCol = alb * light + vec3(.95, .66, .26) * lab * (.03 + .9 * dot(amb, vec3(.33)) + .04 * dot(Lc, vec3(.33)));
    float path = depth * (1. + (1. - uClar) * 2.6);
    vec3 sig = vec3(.034, .013, .010) * (1. + (1. - uClar) * 3.4);
    vec3 T = exp(-sig * path);
    vec3 scat = uDeep * (amb * 2.2 + Lc * .42);
    vec3 water = floorCol * T + scat * (1. - T);
    vec3 eye = vec3(C.x, uPool.y + uPool.w * 1.6, uPool.w * 2.6);
    vec3 V = normalize(vec3(px, 0.) - eye);
    vec3 Nm = normalize(vec3(sm.xy * uNS + chopSoft(px, t, uChop), 1.));
    vec3 R = reflect(V, Nm);
    float ct = clamp(-dot(V, N), 0., 1.);
    float F = .02 + .98 * pow(1. - ct, 5.);
    float rl = max(dot(R, Ld), 0.);
    vec3 env = amb * .4;
    vec2 c4 = textureLod(uNoise, px * vec2(.0208, .024) + vec2(t * .06, t * .043), 0.).rg - .5;
    vec3 Rg = reflect(V, normalize(vec3(ns + c4 * (.03 + .16 * uChop), 1.)));
    float rg = max(dot(Rg, Ld), 0.);
    vec3 spec = Lc * (pow(rg, 5000.) * 34. * uSpark * smoothstep(.45, .85, uChop) + pow(rl, 260.) * .075 + pow(rl, 40.) * .012);
    col = mix(water, env, F) + (uDebug == 4 ? vec3(0.) : spec) + glowUp;
    if (uDebug == 3) col = spec;
    if (uDebug == 5) col = water;
    col += Lc * .07 * exp(-pow((d + 1.2) / 1., 2.));
  } else if (d < LIP) {
    float tt = d / LIP;
    vec2 g = gradRR(px - C, B, uRad);
    vec3 nL = normalize(vec3(-g * cos(tt * PI) * 1.5, 1.));
    vec3 stone = basalt(px) * 4.;
    float poolFace = max(dot(nL, normalize(vec3(-g, .4))), 0.);
    vec3 Lk = normalize(vec3(-.3, -.8, .6));
    float key = max(dot(nL, Lk), 0.);
    float sh = wallShimmer(px, t);
    col = stone * (amb * 2.6 + Lc * (.06 + .5 * poolFace * (.6 + .6 * sh)) + vec3(.05) * key * rv * uFade);
    col *= mix(.5, 1., smoothstep(0., .28, tt));
    col += (Lc * .06 + vec3(.012) * rv * uFade) * pow(max(dot(reflect(-Lk, nL), vec3(0., .25, .97)), 0.), 24.);
  } else {
    float gd = d - LIP;
    vec3 alb = basalt(px);
    float spill = exp(-gd / 90.);
    col = alb * (amb * 1.6 + Lc * spill * .5);
    float top = smoothstep(uPool.y - 30., 30., px.y);
    col *= mix(.55, 1., 1. - top * (1. - smoothstep(uPool.y - 160., uPool.y, px.y)));
  }

  float mn = texture(uNoise, px * .0019 + vec2(t * .0045, t * .0017)).b * .62 + texture(uNoise, px * .0046 + vec2(-t * .0068, t * .0033)).a * .38;
  float mist = smoothstep(.4, .95, mn) * uMist * (d < 0. ? smoothstep(0., 18., -d) : 0.);
  col = mix(col, uMistCol * (amb * 3. + Lc * .7), mist * .36);

  for (int i = 0; i < 14; i++) {
    if (i >= uMN) break;
    vec4 m = uM[i];
    vec2 dv = px - m.xy;
    float r2 = dot(dv, dv);
    vec3 fc = vec3(1., .84, .42) * m.z * uFade;
    col += fc * (exp(-r2 / (m.w * m.w)) * 1.5 + exp(-r2 / (m.w * m.w * 22.)) * .07);
    if (d < -2.) {
      vec2 rr = px - m.xy - vec2(0., -11.) - ns * 22.;
      col += fc * exp(-dot(rr, rr) / (m.w * m.w * 2.2)) * .35;
    }
  }

  if (uDebug == 1 && d < 0.) col = pow(texture(uFloor, (px - uPool.xy) / uPool.zw).rgb, vec3(2.2)) * 1.6;
  if (uDebug == 2 && d < 0.) col = vec3(texture(uCaus, (px - uPool.xy) / uPool.zw).r / .16 * .25);
  col += vec3(.72, .8, 1.) * uFlash * (d < 0. ? .3 + caus * .12 : .07);
  col = aces(col * 1.15);
  col = pow(col, vec3(1. / 2.2));
  col += (h12(gl_FragCoord.xy + fract(t * 7.) * 91.) - .5) * (1.8 / 255.);
  o = vec4(col, 1.);
}`;

// ── noise texture: periodic value noise and its slope (rg), two smooth fields for mist and stone (b, a) ──────
function noiseTexture() {
  const N = 256;
  const lattice = (period, seed) => {
    const g = new Float32Array(period * period);
    let s = seed >>> 0;
    for (let i = 0; i < g.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; g[i] = s / 4294967296; }
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
      const X0 = ((xi % period) + period) % period, Y0 = ((yi % period) + period) % period;
      const X1 = (X0 + 1) % period, Y1 = (Y0 + 1) % period;
      const a = g[Y0 * period + X0], b = g[Y0 * period + X1], c = g[Y1 * period + X0], d = g[Y1 * period + X1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  };
  const fbmOf = (base, seed) => {
    const oct = [0, 1, 2, 3].map((o) => ({ per: base << o, f: lattice(base << o, seed + o * 101) }));
    return (x, y) => { let s = 0, a = 0.5, t = 0; for (const o of oct) { s += a * o.f((x / N) * o.per, (y / N) * o.per); t += a; a *= 0.5; } return s / t; };
  };
  const fa = fbmOf(8, 7), fb = fbmOf(4, 33), fc = fbmOf(6, 71);
  const A = new Float32Array(N * N), Bv = new Float32Array(N * N), Cv = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; A[i] = fa(x, y); Bv[i] = fb(x, y); Cv[i] = fc(x, y); }
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const l = A[y * N + ((x + N - 1) % N)], r = A[y * N + ((x + 1) % N)], u = A[((y + N - 1) % N) * N + x], d = A[((y + 1) % N) * N + x];
    data[i * 4] = clamp(128 + (r - l) * 1400, 0, 255);
    data[i * 4 + 1] = clamp(128 + (d - u) * 1400, 0, 255);
    data[i * 4 + 2] = clamp(Bv[i] * 255, 0, 255);
    data[i * 4 + 3] = clamp(Cv[i] * 255, 0, 255);
  }
  const t = texture(gl.LINEAR, gl.REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  return t;
}

// ── the ripples: a height field over the pool, about 2.4 pt a cell, walls that reflect ─────────────────────
const CELL = 2.4, DAMP = 0.9935, VISC = 0.045, STEP = 1 / 120, NS = 0.42;
let NX = 0, NY = 0, Hh = null, Vv = null, Lp = null, Dm = null, TX = null, simTex = null;
function simInit() {
  NX = clamp(Math.round(S.pool.w / CELL), 48, 240);
  NY = clamp(Math.round(S.pool.h / CELL), 48, 280);
  Hh = new Float32Array(NX * NY); Vv = new Float32Array(NX * NY); Lp = new Float32Array(NX * NY); TX = new Float32Array(NX * NY * 4);
  Dm = new Float32Array(NX * NY);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const e = Math.min(i, j, NX - 1 - i, NY - 1 - j);
    Dm[j * NX + i] = DAMP * (e < 5 ? 0.955 + 0.045 * (e / 5) : 1);
  }
  if (simTex) gl.deleteTexture(simTex);
  simTex = texture(gl.LINEAR, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, NX, NY, 0, gl.RGBA, gl.FLOAT, TX);
}
/** A disturbance at window point (x, y): a dip of strength s and radius rad (pt). */
function drop(x, y, rad, s) {
  if (!Hh) return;
  const gx = ((x - S.pool.x) / S.pool.w) * NX, gy = ((y - S.pool.y) / S.pool.h) * NY;
  const r = Math.max(1.3, rad / CELL);
  const x0 = Math.max(0, Math.floor(gx - r)), x1 = Math.min(NX - 1, Math.ceil(gx + r));
  const y0 = Math.max(0, Math.floor(gy - r)), y1 = Math.min(NY - 1, Math.ceil(gy + r));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const d = Math.hypot(i - gx, j - gy) / r;
    if (d < 1) Hh[j * NX + i] -= s * 0.5 * (1 + Math.cos(Math.PI * d));
  }
}
function simStep() {
  const H = Hh, V = Vv, Lk = Lp, nx = NX, ny = NY; // eslint-disable-line no-unused-vars
  for (let j = 0; j < ny; j++) {
    const jr = j * nx, jm = (j > 0 ? j - 1 : 0) * nx, jp = (j < ny - 1 ? j + 1 : ny - 1) * nx;
    for (let i = 0; i < nx; i++) {
      const im = i > 0 ? i - 1 : 0, ip = i < nx - 1 ? i + 1 : nx - 1, k = jr + i;
      const lap = (H[jr + im] + H[jr + ip] + H[jm + i] + H[jp + i]) * 0.25 - H[k];
      Lk[k] = lap;
      V[k] = (V[k] + lap * 1.7) * Dm[k];
    }
  }
  for (let k = 0, n = H.length; k < n; k++) H[k] += V[k] + Lk[k] * VISC;
}
function simUpload() {
  const H = Hh, T = TX, nx = NX, ny = NY;
  for (let j = 0; j < ny; j++) {
    const jr = j * nx, jm = (j > 0 ? j - 1 : 0) * nx, jp = (j < ny - 1 ? j + 1 : ny - 1) * nx;
    for (let i = 0; i < nx; i++) {
      const im = i > 0 ? i - 1 : 0, ip = i < nx - 1 ? i + 1 : nx - 1, k = jr + i, o = k * 4;
      const l = H[jr + im], r = H[jr + ip], u = H[jm + i], d = H[jp + i], c = H[k];
      T[o] = l - r; T[o + 1] = u - d; T[o + 2] = c; T[o + 3] = l + r + u + d - 4 * c;
    }
  }
  gl.bindTexture(gl.TEXTURE_2D, simTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, NX, NY, gl.RGBA, gl.FLOAT, TX);
}

// ── floor and words, redrawn when the pool changes size ─────────────────────────────────────────────────────
let floorTex = null, labTex = null, floorKey = '';
const fsTri = gl.createVertexArray();
gl.bindVertexArray(fsTri);
const vbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

let floorProg, mainProg, caustProg, noiseTex;

// the caustics: a grid over the water, one vertex per sim cell, refracted onto a texture the size of the floor
let causTex = null, causFb = null, causW = 0, causH = 0, meshVao = null, meshCount = 0;
function causInit() {
  const gx = NX, gy = NY;
  const verts = new Float32Array(gx * gy * 2);
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) { const k = (j * gx + i) * 2; verts[k] = i / (gx - 1); verts[k + 1] = j / (gy - 1); }
  const idx = new Uint32Array((gx - 1) * (gy - 1) * 6);
  let n = 0;
  for (let j = 0; j < gy - 1; j++) for (let i = 0; i < gx - 1; i++) {
    const a = j * gx + i, b = a + 1, c = a + gx, d = c + 1;
    idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = d;
  }
  meshCount = n;
  if (meshVao) gl.deleteVertexArray(meshVao);
  meshVao = gl.createVertexArray();
  gl.bindVertexArray(meshVao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  causW = Math.max(2, Math.round(S.pool.w * 0.8));
  causH = Math.max(2, Math.round(S.pool.h * 0.8));
  if (causTex) gl.deleteTexture(causTex);
  if (causFb) gl.deleteFramebuffer(causFb);
  causTex = texture(gl.LINEAR, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, causW, causH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  causFb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, causFb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, causTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
const LD = (() => { const v = [-0.05, -0.5, 1], n = Math.hypot(...v); return v.map((c) => c / n); })();
function renderCaustics(chop, cw) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, causFb);
  gl.viewport(0, 0, causW, causH);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(caustProg.p);
  const u = caustProg.u;
  gl.uniform4f(u.uPool, S.pool.x, S.pool.y, S.pool.w, S.pool.h);
  gl.uniform1f(u.uT, S.time);
  gl.uniform1f(u.uNS, NS);
  gl.uniform1f(u.uChop, chop);
  gl.uniform1f(u.uCW, cw);
  gl.uniform1f(u.uCD, 105);
  gl.uniform3f(u.uLd, LD[0], LD[1], LD[2]);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, simTex); gl.uniform1i(u.uSim, 0);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, noiseTex); gl.uniform1i(u.uNoise, 2);
  gl.bindVertexArray(meshVao);
  gl.drawElements(gl.TRIANGLES, meshCount, gl.UNSIGNED_INT, 0);
  gl.disable(gl.BLEND);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function labelAnchors() {
  const { w, h } = S.pool;
  return [[w / 2, 26, 58, 20], [w / 2, h - 26, 64, 20], [30, h / 2, 36, 40], [w - 30, h / 2, 40, 40]];
}

function drawLabels() {
  const k = 2, w = Math.max(2, Math.round(S.pool.w * k)), h = Math.max(2, Math.round(S.pool.h * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.scale(k, k);
  x.fillStyle = '#fff';
  x.textBaseline = 'middle';
  x.font = '600 12px -apple-system, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif';
  const spaced = (s, cx, cy, align) => {
    const gap = 1.6;
    const ws = [...s].map((ch) => x.measureText(ch).width);
    const total = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1);
    let px = align === 'left' ? cx : align === 'right' ? cx - total : cx - total / 2;
    [...s].forEach((ch, i) => { x.fillText(ch, px, cy); px += ws[i] + gap; });
  };
  const a = labelAnchors(), L = S.labels;
  spaced(L.top, a[0][0], a[0][1], 'center');
  spaced(L.bottom, a[1][0], a[1][1], 'center');
  spaced(L.left, 18, a[2][1], 'left');
  spaced(L.right, S.pool.w - 18, a[3][1], 'right');
  // a small tick beside each word, like the marks on an instrument
  x.fillRect(a[0][0] - 0.5, 8, 1, 6); x.fillRect(a[1][0] - 0.5, S.pool.h - 14, 1, 6);
  if (labTex) gl.deleteTexture(labTex);
  labTex = texture(gl.LINEAR, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
}

function drawFloor() {
  const k = 1.5, w = Math.max(2, Math.round(S.pool.w * k)), h = Math.max(2, Math.round(S.pool.h * k));
  if (floorTex) gl.deleteTexture(floorTex);
  floorTex = texture(gl.LINEAR, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, floorTex, 0);
  gl.viewport(0, 0, w, h);
  gl.useProgram(floorProg.p);
  gl.uniform2f(floorProg.u.uSize, S.pool.w, S.pool.h);
  gl.uniform2f(floorProg.u.uTex, w, h);
  gl.uniform4fv(floorProg.u.uAvoid, labelAnchors().flat());
  gl.bindVertexArray(fsTri);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fb);
}

function relayout() {
  const key = `${Math.round(S.pool.w)}x${Math.round(S.pool.h)}|${S.labels.top}|${S.labels.bottom}|${S.labels.left}|${S.labels.right}`;
  if (key !== floorKey) {
    const sizeChanged = floorKey.split('|')[0] !== key.split('|')[0];
    floorKey = key;
    if (sizeChanged) { simInit(); causInit(); drawFloor(); }
    drawLabels();
  }
}

function resize() {
  S.W = innerWidth; S.H = innerHeight;
  S.dpr = Math.min(window.devicePixelRatio || 1, 2);
  const k = S.dpr * S.scale;
  cv.width = Math.max(1, Math.round(S.W * k));
  cv.height = Math.max(1, Math.round(S.H * k));
}

// ── fireflies (bottom right) ────────────────────────────────────────────────────────────────────────────────
const MOTES = Array.from({ length: 14 }, (_, i) => ({ hx: Math.random(), hy: Math.random(), ph: Math.random() * 100, sp: 0.6 + Math.random() * 0.8, blink: Math.random() * 10, i }));
function moteUniforms(out) {
  const P = S.pool, n = Math.round(S.w.motes * 14);
  let c = 0;
  for (let i = 0; i < n && i < MOTES.length; i++) {
    const m = MOTES[i], t = S.time * m.sp * 0.18 + m.ph;
    // home over the pool's lower right, wandering
    const x = P.x + P.w * (0.15 + 0.8 * m.hx) + Math.sin(t * 1.3) * 26 + Math.sin(t * 0.47 + 2) * 40;
    const y = P.y + P.h * (0.25 + 0.72 * m.hy) + Math.cos(t * 1.1) * 20 + Math.sin(t * 0.39 + 1) * 34 - P.h * 0.08;
    const b = 0.5 + 0.5 * Math.sin(S.time * (0.9 + m.sp) + m.blink);
    const k = Math.pow(b, 3) * clamp(S.w.motes * 14 - i, 0, 1);
    out[c * 4] = x; out[c * 4 + 1] = y; out[c * 4 + 2] = k * 0.9; out[c * 4 + 3] = 2.1 + m.sp * 0.7;
    c++;
  }
  return c;
}

// ── frame ───────────────────────────────────────────────────────────────────────────────────────────────────
const DEBUG = STANDALONE ? ({ floor: 1, caustic: 2, spec: 3, nospec: 4, water: 5 })[new URLSearchParams(location.search).get('debug')] || 0 : 0;
const LBUF = new Float32Array(9 * 4), MBUF = new Float32Array(14 * 4);
// hello: the page is up and wants its layout; ready: it has drawn that layout for a few frames, its new floor and
// first-use shader work behind it, so the app can show it and start moving
let target = PRESET.rest, last = performance.now(), acc = 0, sentHello = false, sentReady = false, readyIn = 0, raf = 0;

function update(dt) {
  S.time += dt;
  // where the pool is going: his mood, or the rest look before he touches it; later stages hush the wind
  S.restK = mix(S.restK, S.touched ? 0 : 1, ease(dt, 0.45));
  S.calm = mix(S.calm, S.calmTo, ease(dt, 0.6));
  target = blendW(weatherAt(S.tp, S.te), PRESET.rest, S.restK);
  const tau = S.finger ? 0.28 : 0.45;
  S.w = blendW(S.w, target, ease(dt, tau));
  S.labK = mix(S.labK, S.labTo * (S.reveal.mode === 2 ? 1 : S.reveal.mode === 1 ? clamp(S.reveal.r / 500, 0, 1) : 0), ease(dt, 0.5));
  if (S.closing) S.fade = Math.max(0, S.fade - dt / 0.45);

  // the light spreading out from the opening drop
  if (S.reveal.mode === 1) {
    S.reveal.r += dt * (S.reduce ? 2400 : 760);
    if (S.reveal.r > Math.hypot(S.W, S.H) + 200) S.reveal.mode = 2;
  }

  const w = S.w, calm = S.calm, still = S.reduce ? 0.35 : 1;
  // rain on the stormy side
  const rain = w.rain * (1 - 0.88 * calm) * still;
  S.rainAcc += dt * rain * 42;
  while (S.rainAcc >= 1) {
    S.rainAcc -= 1;
    const P = S.pool;
    drop(P.x + Math.random() * P.w, P.y + Math.random() * P.h, 2.6 + Math.random() * 2.2, 0.3 + Math.random() * 0.35);
  }
  // cave drips now and then, more often when he is low
  S.nextDrip -= dt;
  if (S.nextDrip <= 0 && S.reveal.mode === 2) {
    const P = S.pool;
    drop(P.x + P.w * (0.12 + Math.random() * 0.76), P.y + P.h * (0.12 + Math.random() * 0.76), 3.2, 0.75 * still);
    S.nextDrip = mix(7, 2.2, w.drip) * (0.6 + Math.random() * 0.8);
  }
  // lightning, rarely, in a storm
  if (w.storm * (1 - calm) > 0.4 && !S.reduce && S.reveal.mode === 2) {
    S.nextBolt -= dt;
    if (S.nextBolt <= 0) {
      const k = 0.55 + 0.45 * Math.random();
      S.bolts.push([S.time, k], [S.time + 0.08, k * 0.35], [S.time + 0.15, k * 0.9]);
      toApp({ t: 'haptic', k: 'heavy' });
      setTimeout(() => toApp({ t: 'haptic', k: 'soft' }), 380);
      S.nextBolt = 4 + Math.random() * 5;
    }
  }
  S.flash *= Math.exp(-dt * 13);
  S.bolts = S.bolts.filter(([at, k]) => { if (S.time >= at) { S.flash = Math.max(S.flash, k); return false; } return true; });

  // the lamp under his finger, and the ones under the words he picked
  const m = S.marker;
  m.k = mix(m.k, m.to * (S.closing ? 0 : 1), ease(dt, 0.22));
  for (const l of S.lights) l.k = mix(l.k, l.to, ease(dt, 0.25));
  S.lights = S.lights.filter((l) => l.to > 0 || l.k > 0.01);

  // waiting for the AI: slow rings breathe out from the lamp
  if (S.think && !S.closing) {
    S.thinkT -= dt;
    if (S.thinkT <= 0) {
      const x = m.k > 0.1 ? m.x : S.pool.x + S.pool.w / 2, y = m.k > 0.1 ? m.y : S.pool.y + S.pool.h / 2;
      drop(x, y, 20, 0.5 * still + 0.1);
      toApp({ t: 'haptic', k: 'tick' });
      S.thinkT = 1.3;
    }
  }

  // a finger resting in the water still trembles a little
  const f = S.finger;
  if (f && performance.now() - f.at > 260) { drop(f.x, f.y, 7, 0.12); f.at = performance.now(); }
}

function render() {
  const P = S.pool, w = S.w;
  const chop = w.chop * (1 - 0.55 * S.calm) * (S.reduce ? 0.5 : 1);
  // gentle light shimmer on the floor whenever the light is good, even on still water
  renderCaustics(chop, 0.03 + 0.07 * w.clar);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, cv.width, cv.height);
  gl.useProgram(mainProg.p);
  const u = mainProg.u;
  gl.uniform2f(u.uRes, cv.width, cv.height);
  gl.uniform1f(u.uDpr, S.dpr * S.scale);
  gl.uniform1f(u.uT, S.time);
  gl.uniform4f(u.uPool, P.x, P.y, P.w, P.h);
  gl.uniform1f(u.uRad, P.r);
  gl.uniform1f(u.uNS, NS);
  gl.uniform3f(u.uLd, LD[0], LD[1], LD[2]);
  gl.uniform3f(u.uLight, lin(w.light[0]), lin(w.light[1]), lin(w.light[2]));
  gl.uniform1f(u.uLI, w.li);
  gl.uniform3f(u.uDeep, lin(w.deep[0]), lin(w.deep[1]), lin(w.deep[2]));
  gl.uniform3f(u.uMistCol, lin(w.mistCol[0]), lin(w.mistCol[1]), lin(w.mistCol[2]));
  gl.uniform3f(u.uAmb, lin(w.amb[0]), lin(w.amb[1]), lin(w.amb[2]));
  gl.uniform3f(u.uLamp, lin(w.lamp[0]) * 1.4, lin(w.lamp[1]) * 1.4, lin(w.lamp[2]) * 1.4);
  gl.uniform1f(u.uClar, w.clar);
  gl.uniform1f(u.uChop, chop);
  gl.uniform1f(u.uMist, w.mist * (1 - 0.35 * S.calm));
  gl.uniform1f(u.uSpark, w.spark);
  gl.uniform1f(u.uFlash, S.flash);
  gl.uniform1f(u.uLabK, S.labK);
  gl.uniform1f(u.uFade, S.fade);
  gl.uniform4f(u.uReveal, S.reveal.x, S.reveal.y, S.reveal.r, S.reveal.mode);
  // lamps: the marker first, then the words
  let n = 0;
  const mk = S.marker;
  const pulse = S.think ? 0.75 + 0.25 * Math.sin(S.time * 4.8) : 0.92 + 0.08 * Math.sin(S.time * 2.1);
  if (mk.k > 0.005) { LBUF.set([mk.x, mk.y, mk.k * pulse, 58], 0); n = 1; }
  for (const l of S.lights) { if (n >= 9) break; LBUF.set([l.x, l.y, l.k * 1.05, 46], n * 4); n++; }
  gl.uniform4fv(u.uL, LBUF);
  gl.uniform1i(u.uLN, n);
  const mn = moteUniforms(MBUF);
  gl.uniform4fv(u.uM, MBUF);
  gl.uniform1i(u.uMN, mn);
  gl.uniform1i(u.uDebug, DEBUG);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, simTex); gl.uniform1i(u.uSim, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, floorTex); gl.uniform1i(u.uFloor, 1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, noiseTex); gl.uniform1i(u.uNoise, 2);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, labTex); gl.uniform1i(u.uLab, 3);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, causTex); gl.uniform1i(u.uCaus, 4);
  gl.bindVertexArray(fsTri);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function loop(now) {
  raf = 0;
  if (S.paused) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 4) { simStep(); acc -= STEP; steps++; }
  if (acc > STEP) acc = 0;
  if (steps) simUpload();
  render();
  if (S.finger && S.moved) { S.moved = false; post('move'); }
  // a phone that can't keep up draws fewer pixels
  S.frames++;
  if (S.frames > 30) { S.slow = mix(S.slow, dt > 0.024 ? 1 : 0, 0.05); if (S.slow > 0.6 && S.scale > 0.62) { S.scale *= 0.85; S.slow = 0; resize(); } }
  if (!sentHello) { sentHello = true; toApp({ t: 'hello' }); }
  if (readyIn > 0 && --readyIn === 0 && !sentReady) { sentReady = true; toApp({ t: 'ready', scale: S.scale }); }
  raf = requestAnimationFrame(loop);
}

// ── his finger ──────────────────────────────────────────────────────────────────────────────────────────────
function moodAt(x, y) {
  const P = S.pool;
  return { p: clamp(((x - P.x) / P.w - 0.5) / 0.44, -1, 1), e: clamp((0.5 - (y - P.y) / P.h) / 0.44, -1, 1) };
}
function inside(x, y, slop) {
  const P = S.pool;
  return x > P.x - slop && x < P.x + P.w + slop && y > P.y - slop && y < P.y + P.h + slop;
}
function clampIn(x, y) {
  const P = S.pool;
  return [clamp(x, P.x + 3, P.x + P.w - 3), clamp(y, P.y + 3, P.y + P.h - 3)];
}
function post(ph) {
  const f = S.finger;
  if (!f) return;
  toApp({ t: 'touch', ph, x: f.x, y: f.y, p: S.tp, e: S.te });
}
function setMood(x, y) {
  const m = moodAt(x, y);
  S.tp = m.p; S.te = m.e; S.touched = true;
  S.marker.x = x; S.marker.y = y; S.marker.to = 1;
}
cv.addEventListener('pointerdown', (e) => {
  if (S.closing || S.reveal.mode === 0 || S.finger) return;
  if (!inside(e.clientX, e.clientY, 6)) return;
  e.preventDefault();
  try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
  const [x, y] = clampIn(e.clientX, e.clientY);
  S.finger = { id: e.pointerId, x, y, lx: x, ly: y, at: performance.now(), field: S.stage === 'field' };
  drop(x, y, 9, 1.1);
  if (S.finger.field) { setMood(x, y); post('down'); } else toApp({ t: 'splash', x, y });
});
cv.addEventListener('pointermove', (e) => {
  const f = S.finger;
  if (!f || e.pointerId !== f.id) return;
  const [x, y] = clampIn(e.clientX, e.clientY);
  const dist = Math.hypot(x - f.lx, y - f.ly);
  if (dist >= 5) {
    // a wake behind the finger: small dips along the way, deeper when it moves fast
    const n = Math.min(12, Math.floor(dist / 5));
    const s = Math.min(0.5, 0.1 + dist * 0.012);
    for (let i = 1; i <= n; i++) drop(mix(f.lx, x, i / n), mix(f.ly, y, i / n), 7, s);
    f.lx = x; f.ly = y; f.at = performance.now();
  }
  f.x = x; f.y = y;
  if (f.field) { setMood(x, y); S.moved = true; }
});
function lift(e) {
  const f = S.finger;
  if (!f || e.pointerId !== f.id) return;
  if (f.field) post('up');
  S.finger = null;
}
cv.addEventListener('pointerup', lift);
cv.addEventListener('pointercancel', lift);

// ── messages from the app ───────────────────────────────────────────────────────────────────────────────────
function recv(m) {
  if (!m || !m.t) return;
  if (m.t === 'layout') {
    if (m.pool) S.pool = { x: m.pool.x, y: m.pool.y, w: m.pool.w, h: m.pool.h, r: m.pool.r ?? 30 };
    if (typeof m.reduce === 'boolean') S.reduce = m.reduce;
    if (m.labels) S.labels = { ...S.labels, ...m.labels };
    relayout();
    if (!sentReady && !readyIn) readyIn = 3;
  } else if (m.t === 'stage') {
    S.stage = m.s;
    S.labTo = m.s === 'field' ? 1 : 0;
    S.calmTo = m.s === 'field' ? 0 : m.s === 'done' ? 0.85 : 0.6;
    if (m.s !== 'field') S.finger = null;
  } else if (m.t === 'mood') {
    S.tp = clamp(m.p, -1, 1); S.te = clamp(m.e, -1, 1); S.touched = true;
    if (typeof m.x === 'number') { S.marker.x = m.x; S.marker.y = m.y; S.marker.to = 1; }
  } else if (m.t === 'drop') drop(m.x, m.y, m.r ?? 8, m.s ?? 0.8);
  else if (m.t === 'ignite') {
    S.reveal = { x: m.x, y: m.y, r: 0, mode: 1 };
    drop(m.x, m.y, 15, S.reduce ? 1 : 2.6);
  } else if (m.t === 'lit') S.reveal = { x: 0, y: 0, r: 0, mode: 2 };
  else if (m.t === 'lights') {
    const next = (m.l || []).slice(0, 8);
    for (const l of S.lights) l.to = 0;
    for (const n of next) {
      const same = S.lights.find((l) => Math.hypot(l.x - n.x, l.y - n.y) < 4);
      if (same) same.to = 1; else S.lights.push({ x: n.x, y: n.y, k: 0, to: 1 });
    }
  } else if (m.t === 'marker') { S.marker.x = m.x; S.marker.y = m.y; S.marker.to = m.on === false ? 0 : 1; }
  else if (m.t === 'think') { S.think = !!m.on; S.thinkT = 0.2; }
  else if (m.t === 'close') S.closing = true;
  else if (m.t === 'pause') { S.paused = true; }
  else if (m.t === 'resume') { if (S.paused) { S.paused = false; last = performance.now(); if (!raf) raf = requestAnimationFrame(loop); } }
}
window.pool = { recv };
window.addEventListener('message', (e) => {
  let m = e.data;
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch { return; } }
  // the app's messages are {t, ...} (a layout carries a pool rect, so that is no test of whose it is)
  if (m && typeof m.t === 'string') recv(m);
});
document.addEventListener('message', (e) => { try { recv(JSON.parse(e.data)); } catch { /* not ours */ } });
document.addEventListener('visibilitychange', () => recv({ t: document.hidden ? 'pause' : 'resume' }));
window.addEventListener('resize', resize);

// ── start ───────────────────────────────────────────────────────────────────────────────────────────────────
try {
  floorProg = program(FLOOR_FS);
  mainProg = program(MAIN_FS);
  caustProg = program(CAUST_FS, CAUST_VS);
  noiseTex = noiseTexture();
  resize();
  relayout();
  raf = requestAnimationFrame(loop);
} catch (err) {
  toApp({ t: 'error', msg: String(err && err.message ? err.message : err) });
  throw err;
}

if (STANDALONE) {
  // dev: a phone-shaped layout, the opening drop, then `?p=&e=` and `&stage=` if given
  const q = new URLSearchParams(location.search);
  const top = 47, bottom = 34, side = 14;
  const petSize = 90, poolTop = top + 8 + petSize + 14 + 96 + 8, barTop = innerHeight - bottom - 14 - 52;
  recv({ t: 'layout', pool: { x: side, y: poolTop, w: innerWidth - side * 2, h: barTop - 16 - poolTop, r: 30 } });
  setTimeout(() => recv({ t: 'ignite', x: innerWidth / 2, y: poolTop + (barTop - 16 - poolTop) / 2 }), q.has('now') ? 0 : 500);
  if (q.has('p')) {
    const p = Number(q.get('p')), e = Number(q.get('e') || 0), P = S.pool;
    recv({ t: 'mood', p, e, x: P.x + P.w * (0.5 + p * 0.44), y: P.y + P.h * (0.5 - e * 0.44) });
  }
  if (q.has('stage')) recv({ t: 'stage', s: q.get('stage') });
  window.poolDev = { S, recv, drop };
}
