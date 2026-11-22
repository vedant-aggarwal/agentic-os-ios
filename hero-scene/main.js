// Today hero: nine quartz crystals, one per life aspect, growing as one cluster out of a mossy boulder in a dark
// cave, lit by a shaft of daylight through a crack in the roof. Each crystal fills from the root with a glowing
// essence, a dense coloured fog, up to that aspect's share of today done.
// A sideways drag turns the whole boulder; it settles with one crystal facing you, which the app names.
// Runs in a WebView (phone) or an iframe (web build). Messages: see recv() and toApp().
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ── bridge ──────────────────────────────────────────────────────────────────────────────────────────────────
const RN = window.ReactNativeWebView;
const FRAMED = window.parent !== window;
const STANDALONE = !RN && !FRAMED;
function toApp(m) {
  if (RN) RN.postMessage(JSON.stringify(m));
  else if (FRAMED) window.parent.postMessage({ hero: m }, '*');
}
window.addEventListener('error', (e) => toApp({ t: 'error', msg: String(e.message || e) }));

// ── small helpers ───────────────────────────────────────────────────────────────────────────────────────────
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const perm = (() => {
  const r = rng(1337), p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const out = new Uint8Array(512);
  for (let i = 0; i < 512; i++) out[i] = p[i & 255];
  return out;
})();
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function grad(h, x, y, z) {
  const k = h & 15, u = k < 8 ? x : y, v = k < 4 ? y : k === 12 || k === 14 ? x : z;
  return ((k & 1) ? -u : u) + ((k & 2) ? -v : v);
}
function noise3(x, y, z) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z), P = perm;
  const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
  return lerp(
    lerp(lerp(grad(P[AA], x, y, z), grad(P[BA], x - 1, y, z), u), lerp(grad(P[AB], x, y - 1, z), grad(P[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(P[AA + 1], x, y, z - 1), grad(P[BA + 1], x - 1, y, z - 1), u), lerp(grad(P[AB + 1], x, y - 1, z - 1), grad(P[BB + 1], x - 1, y - 1, z - 1), u), v),
    w,
  );
}
function fbm(x, y, z, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); f *= 2.03; a *= 0.5; }
  return s;
}
const hex = (c) => new THREE.Color(c); // sRGB hex in, linear working colour out
const UP = new THREE.Vector3(0, 1, 0);

// Ashima simplex noise (MIT), shared by every shader that needs texture.
const NOISE = /* glsl */ `
vec3 n_mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 n_mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 n_perm(vec4 x){return n_mod289(((x*34.0)+1.0)*x);}
vec4 n_tis(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=n_mod289(i);
  vec4 p=n_perm(n_perm(n_perm(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 nm=n_tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=nm.x; p1*=nm.y; p2*=nm.z; p3*=nm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

// ── state from the app ──────────────────────────────────────────────────────────────────────────────────────
// Aspects in turning order, grouped by family: Self, Work, People.
const ASPECTS = ['body', 'mind', 'soul', 'mission', 'money', 'growth', 'family', 'romance', 'friends'];
const DEFAULT_COLORS = ['#FF8A5B', '#FFB547', '#FFD27A', '#3DDC97', '#62D96B', '#2EC4B6', '#FF7AB6', '#F472D0', '#B79CFF'];
const state = {
  aspects: ASPECTS.map((key, i) => ({ key, color: DEFAULT_COLORS[i], done: [1, 2, 0, 3, 1, 0, 1, 0, 2][i], total: [2, 2, 1, 4, 3, 0, 1, 2, 2][i] })),
  bg: '#1A1C26', bgTop: '#11141C', bgStop: 0.86,
  topFrac: 0.24,
  reduce: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  paused: false,
  gotData: false,
};

// ── renderer ────────────────────────────────────────────────────────────────────────────────────────────────
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
} catch (e) {
  toApp({ t: 'error', msg: 'WebGL unavailable' });
  throw e;
}
const DPR = Math.min(window.devicePixelRatio || 1, 2);
// point sizes are in device pixels; ?px=2 lets a 2x-sized dev frame show them as a phone would
const PX = DPR * (Number(new URLSearchParams(location.search).get("px")) || 1);
renderer.setPixelRatio(DPR);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = 0.6;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color();
scene.fog = new THREE.FogExp2(0x000000, 0.085);
const HAZE = hex('#4A4C55'); // the cave air: distance turns to a faint grey haze, not to black
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 60);

// ── light: one shaft of daylight through a crack above, a cool glow from deeper in the cave behind ──────────
const SUN_COLOR = hex('#FFD7AE');
const sunFrom = new THREE.Vector3(-1.9, 5.4, 1.1);
const sunTo = new THREE.Vector3(0.05, 0.45, 0.05);
const SPOT_ANGLE = 0.27, SPOT_PENUMBRA = 0.75;
const spot = new THREE.SpotLight(SUN_COLOR, 30, 0, SPOT_ANGLE, SPOT_PENUMBRA, 0);
spot.position.copy(sunFrom); spot.target.position.copy(sunTo);
spot.castShadow = true;
spot.shadow.mapSize.set(1024, 1024);
spot.shadow.bias = -0.0005; spot.shadow.normalBias = 0.02; spot.shadow.radius = 4;
spot.shadow.camera.near = 2.5; spot.shadow.camera.far = 9;
if ('intensity' in spot.shadow) spot.shadow.intensity = 0.8;
scene.add(spot, spot.target);
const RIM_COLOR = hex('#A8BBFF');
const rimLight = new THREE.DirectionalLight(RIM_COLOR, 0.9);
rimLight.position.set(2.6, 2.4, -4);
scene.add(rimLight);
scene.add(new THREE.HemisphereLight(hex('#2B3448'), hex('#0A0A0B'), 0.38));
// the same daylight scattered by the dust: a faint wide wash that shows the cave around the stone
const scatter = new THREE.SpotLight(SUN_COLOR, 1.3, 0, 0.85, 1, 0);
scatter.position.copy(sunFrom); scatter.target.position.set(0.2, -0.6, -0.8);
scene.add(scatter, scatter.target);
// sunlight bouncing off the floor back up into the stone's front
const bounce = new THREE.PointLight(hex('#C9A27E'), 0.6, 3.2, 2);
bounce.position.set(0.1, -0.7, 1.4);
scene.add(bounce);

const keyDir = sunTo.clone().sub(sunFrom).normalize();
const LIGHT_UNIFORMS = {
  uKeyPos: { value: sunFrom.clone() }, uKeyDir: { value: keyDir },
  uKeyCol: { value: SUN_COLOR.clone().multiplyScalar(1.15) },
  uCosO: { value: Math.cos(SPOT_ANGLE) }, uCosI: { value: Math.cos(SPOT_ANGLE * (1 - SPOT_PENUMBRA)) },
  uRimDir: { value: rimLight.position.clone().normalize() }, uRimCol: { value: RIM_COLOR.clone() },
};

// ── environment: what the facets reflect. Near-black, a soft skylight above, thin cool strips at the sides ──
{
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.SphereGeometry(10, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 vD;
        void main(){ gl_FragColor = vec4(mix(vec3(0.004,0.004,0.005), vec3(0.016,0.019,0.026), smoothstep(-0.3, 1.0, vD.y)), 1.0); }`,
    }),
  ));
  const panel = (w, h, col, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(0, 0, 0); env.add(m);
  };
  panel(5, 5, new THREE.Color(2.4, 2.2, 1.9), new THREE.Vector3(0, 9, 0.5)); // skylight
  panel(1.4, 1.4, new THREE.Color(14, 11, 8), sunFrom.clone().normalize().multiplyScalar(9)); // the crack
  panel(0.4, 7, new THREE.Color(3.2, 3.6, 4.6), new THREE.Vector3(-7, 1.5, -4.5)); // strips
  panel(0.4, 7, new THREE.Color(2.6, 2.9, 3.8), new THREE.Vector3(7, 1.0, -3.5));
  panel(0.3, 6, new THREE.Color(1.6, 1.8, 2.3), new THREE.Vector3(2, 1.0, 9));
  panel(0.3, 6, new THREE.Color(1.4, 1.5, 1.9), new THREE.Vector3(-4, 0.5, 8));
  panel(8, 2, new THREE.Color(0.05, 0.04, 0.035), new THREE.Vector3(0, -8, 2)); // floor bounce
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.02).texture;
  pm.dispose();
}

// ── stone ───────────────────────────────────────────────────────────────────────────────────────────────────
// Noise-displaced, then cut by a few planes so it breaks into flat fractured faces like real rock.
function rockGeometry({ detail = 40, scale = [1, 1, 1], amp = 0.28, freq = 1.1, seed = 0, flatTop = null, sharp = 0.35, cuts = 0 }) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const r = rng(Math.floor(seed * 1000) + 3);
  const planes = Array.from({ length: cuts }, () => ({
    n: new THREE.Vector3(r() * 2 - 1, r() * 1.6 - 0.5, r() * 2 - 1).normalize(),
    o: 0.78 + r() * 0.17,
  }));
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let d = fbm(v.x * freq + seed, v.y * freq + seed * 0.7, v.z * freq - seed, 5);
    d += sharp * (0.5 - Math.abs(noise3(v.x * freq * 2.1 + seed * 3, v.y * freq * 2.1, v.z * freq * 2.1)));
    v.multiplyScalar(1 + amp * d);
    for (const pl of planes) {
      const k = v.dot(pl.n) - pl.o;
      if (k > 0) v.addScaledVector(pl.n, -k * 0.86);
    }
    v.set(v.x * scale[0], v.y * scale[1], v.z * scale[2]);
    if (flatTop !== null && v.y > flatTop) v.y = flatTop + (v.y - flatTop) * 0.14;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Per vertex: x = moss, y = algae, z = exposure (0 deep in a crevice, 0.5 flat, 1 on a worn ridge).
// Moss takes the hollows and the upward faces; algae the damp low band and streaks where water runs down.
function addGrowth(g, { moss = 0, algae = 0, seed = 0, lowY = -Infinity, band = 0.4, streaks = 0, near = null }) {
  const p = g.attributes.position, n = g.attributes.normal, idx = g.index.array, N = p.count;
  const P = p.array, S = new Float32Array(N * 3), cnt = new Float32Array(N), len = new Float32Array(N);
  const edge = (fn) => {
    for (let t = 0; t < idx.length; t += 3) {
      for (let e = 0; e < 3; e++) { const a = idx[t + e], b = idx[t + ((e + 1) % 3)]; fn(a, b); fn(b, a); }
    }
  };
  edge((i, j) => {
    S[i * 3] += P[j * 3]; S[i * 3 + 1] += P[j * 3 + 1]; S[i * 3 + 2] += P[j * 3 + 2]; cnt[i]++;
    len[i] += Math.hypot(P[j * 3] - P[i * 3], P[j * 3 + 1] - P[i * 3 + 1], P[j * 3 + 2] - P[i * 3 + 2]);
  });
  let cav = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const c = cnt[i] || 1, Lx = S[i * 3] / c - P[i * 3], Ly = S[i * 3 + 1] / c - P[i * 3 + 1], Lz = S[i * 3 + 2] / c - P[i * 3 + 2];
    cav[i] = (Lx * n.getX(i) + Ly * n.getY(i) + Lz * n.getZ(i)) / ((len[i] / c) || 1);
  }
  for (let pass = 0; pass < 2; pass++) {
    const acc = new Float32Array(N), k = new Float32Array(N);
    edge((i, j) => { acc[i] += cav[j]; k[i]++; });
    const next = new Float32Array(N);
    for (let i = 0; i < N; i++) next[i] = (cav[i] + acc[i]) / (1 + k[i]);
    cav = next;
  }
  let sd = 0;
  for (let i = 0; i < N; i++) sd += cav[i] * cav[i];
  sd = Math.sqrt(sd / N) || 1;
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ny = n.getY(i);
    const expo = clamp01(0.5 - cav[i] / (2.4 * sd));
    const crev = 1 - expo;
    const patch = fbm(x * 1.2 + seed, y * 1.2 + 3.1, z * 1.2 - seed, 4);
    let m = (patch * 1.5 + 0.42) * (0.3 + 0.7 * sstep(-0.35, 0.75, ny)) + crev * 0.5;
    let a = sstep(lowY + band, lowY, y) * (0.55 + patch) + crev * 0.25;
    if (streaks) a += streaks * Math.max(0, fbm(x * 2.6 + seed, y * 0.32, z * 2.6, 3) * 2.2 - 0.05) * sstep(0.2, -0.2, ny);
    if (near) {
      const d = Math.hypot(x - near.x, z - near.z);
      const k = sstep(near.r1, near.r0, d);
      m *= k; a *= 0.35 + 0.65 * k;
    }
    out[i * 3] = clamp01(m) * moss;
    out[i * 3 + 1] = clamp01(a) * algae;
    out[i * 3 + 2] = expo;
  }
  g.setAttribute('aGrow', new THREE.BufferAttribute(out, 3));
  return g;
}

// Photo-scanned rock (Poly Haven, CC0), streamed from their CDN and mapped from three sides since the stones
// have no UVs. Until the scans arrive, or if they never do, a procedural stone stands in.
const TEX_BASE = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/';
const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin('anonymous');
const scans = {}, scanLoads = [];
function scan(id) {
  if (scans[id]) return scans[id];
  const load = (suffix, srgb) => new Promise((res) => {
    texLoader.load(`${TEX_BASE}${id}/${id}_${suffix}_1k.jpg`, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 4; res(t);
    }, undefined, () => res(null));
  });
  const sc = { diff: { value: null }, nor: { value: null }, arm: { value: null }, on: { value: 0 } };
  scanLoads.push(Promise.all([load('diff', true), load('nor_gl', false), load('arm', false)]).then(([d, n, a]) => {
    if (d && n && a) { sc.diff.value = d; sc.nor.value = n; sc.arm.value = a; sc.on.value = 1; }
  }));
  return (scans[id] = sc);
}

function rockMaterial({ color = '#4A4844', bump = 1.8, freq = 3.0, env = 0.2, rough = 0.9, wet = 0, id = 'dark_rock_02', scale = 0.5, tint = 1, moss = 1 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: hex(color), roughness: rough, metalness: 0, envMapIntensity: env });
  const sc = scan(id);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uBump: { value: bump }, uFreq: { value: freq }, uWet: { value: wet }, uScale: { value: scale }, uTint: { value: tint },
      uMoss: { value: moss }, tDiff: sc.diff, tNor: sc.nor, tArm: sc.arm, uScan: sc.on,
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aGrow; varying vec3 vGrow; varying vec3 vRockP; varying vec3 vObjN; varying mat3 vO2V;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGrow = aGrow; vRockP = transformed; vObjN = objectNormal;
        mat3 o2v = normalMatrix;
        #ifdef USE_INSTANCING
          o2v = normalMatrix * mat3(instanceMatrix);
        #endif
        vO2V = o2v;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGrow; varying vec3 vRockP; varying vec3 vObjN; varying mat3 vO2V;
        uniform float uBump; uniform float uFreq; uniform float uWet; uniform float uScale; uniform float uTint; uniform float uMoss;
        uniform float uScan; uniform sampler2D tDiff; uniform sampler2D tNor; uniform sampler2D tArm;
        ${NOISE}
        vec4 tri(sampler2D t, vec3 p, vec3 w){ return texture2D(t, p.zy)*w.x + texture2D(t, p.xz)*w.y + texture2D(t, p.xy)*w.z; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 rp = vRockP;
        vec3 on = normalize(vObjN);
        vec3 tw = pow(abs(on), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
        vec3 sp = rp*uScale;
        float expo = vGrow.z;
        float hh = snoise(rp*uFreq)*0.55 + snoise(rp*uFreq*2.17)*0.27 + snoise(rp*uFreq*4.6)*0.13;
        float grain = snoise(rp*34.0);
        float fiber = snoise(rp*58.0)*0.5 + 0.5;
        float clump = snoise(rp*12.0)*0.5 + 0.5;
        float aoT = 1.0, sRough = -1.0;
        vec3 rc;
        if (uScan > 0.5) {
          vec3 alb = tri(tDiff, sp, tw).rgb;
          vec3 arm = tri(tArm, sp, tw).rgb;
          float tone = snoise(rp*0.6)*0.5 + 0.5;
          rc = alb*uTint*mix(0.8, 1.15, tone);
          aoT = arm.r; sRough = arm.g;
          rc *= mix(0.55, 1.0, aoT);
        } else {
          float tone = snoise(rp*0.7)*0.5 + 0.5;
          rc = diffuseColor.rgb * mix(0.72, 1.2, tone) * mix(0.6, 1.05, smoothstep(-0.5, 0.35, hh));
          rc = mix(rc, rc*1.6 + 0.01, smoothstep(0.62, 0.95, expo)*0.7);
          rc *= 0.9 + 0.12*grain;
        }
        rc *= mix(0.4, 1.0, smoothstep(0.05, 0.5, expo));                   // dirt and shade in the crevices
        float mBreak = snoise(rp*5.0)*0.16 + snoise(rp*17.0)*0.07;
        float gMoss = smoothstep(0.45, 0.68, vGrow.x + mBreak)*uMoss;
        float gAlg = smoothstep(0.42, 0.72, vGrow.y + snoise(rp*vec3(4.0, 1.4, 4.0))*0.2 + mBreak*0.5);
        vec3 mossC = mix(vec3(0.014, 0.024, 0.007), vec3(0.07, 0.1, 0.02), fiber*clump);
        mossC = mix(mossC, vec3(0.12, 0.15, 0.035), smoothstep(0.72, 1.0, clump)*fiber*0.6);
        vec3 algC = mix(vec3(0.006, 0.014, 0.009), vec3(0.02, 0.04, 0.022), fiber);
        rc = mix(rc, algC, gAlg*0.75);
        rc = mix(rc, mossC, gMoss);
        diffuseColor.rgb = rc;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        if (sRough >= 0.0) roughnessFactor = sRough;
        float wetM = clamp(uWet*(snoise(rp*1.3)*0.5 + 0.5)*1.5 - 0.25, 0.0, 1.0) * (1.0 - gMoss);
        roughnessFactor = mix(roughnessFactor, 1.0, gMoss);
        roughnessFactor = mix(roughnessFactor, 0.32, max(gAlg*0.7, wetM));
        diffuseColor.rgb *= 1.0 - 0.45*wetM;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uScan > 0.5) {
          // three normal maps, whiteout-blended in object space, then into view space
          vec3 tx = texture2D(tNor, sp.zy).xyz*2.0 - 1.0;
          vec3 ty = texture2D(tNor, sp.xz).xyz*2.0 - 1.0;
          vec3 tz = texture2D(tNor, sp.xy).xyz*2.0 - 1.0;
          tx = vec3(tx.xy + on.zy, abs(tx.z)*on.x);
          ty = vec3(ty.xy + on.xz, abs(ty.z)*on.y);
          tz = vec3(tz.xy + on.xy, abs(tz.z)*on.z);
          vec3 nObj = normalize(tx.zyx*tw.x + ty.xzy*tw.y + tz.xyz*tw.z);
          normal = normalize(vO2V*nObj) * faceDirection;
        }
        {
          float H = uScan > 0.5 ? 0.0 : (hh + grain*0.1)*uBump;
          H = mix(H, (fiber*0.5 + clump*0.9)*uBump*0.8, gMoss);
          vec2 dH = vec2(dFdx(H), dFdy(H));
          vec3 sp2 = -vViewPosition; vec3 sx = normalize(dFdx(sp2)); vec3 sy = normalize(dFdy(sp2));
          vec3 r1 = cross(sy, normal); vec3 r2 = cross(normal, sx);
          float det = dot(sx, r1) * faceDirection;
          vec3 gr = sign(det) * (dH.x * r1 + dH.y * r2);
          normal = normalize(abs(det) * normal - gr);
        }`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= aoT;
        reflectedLight.indirectSpecular *= aoT;`);
  };
  return m;
}

function rockMesh(geo, mat, pos, rot = [0, 0, 0], { cast = false, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos); m.rotation.set(...rot);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}

// everything that turns: the boulder, its moss and the crystals
const table = new THREE.Group();
scene.add(table);

const ROCK_Y = -0.42;
const boulderGeo = addGrowth(
  rockGeometry({ detail: 60, scale: [1.06, 0.62, 0.94], amp: 0.2, freq: 1.3, seed: 4.2, flatTop: 0.4, sharp: 0.4, cuts: 7 }),
  { moss: 1, algae: 0.9, seed: 2.2, lowY: -0.55, band: 0.45 },
);
const boulder = rockMesh(boulderGeo, rockMaterial({ color: '#3A3835', bump: 2.1, freq: 3.4, env: 0.22, id: 'mossy_rock', scale: 0.75, tint: 0.8, moss: 0.3 }), [0, ROCK_Y, 0], [0, 0.3, 0], { cast: true });
table.add(boulder);

// moss up close is a fuzz of tiny fronds: a few thousand specks over the mossiest parts
function mossFuzz(geo, count, seed) {
  const p = geo.attributes.position, n = geo.attributes.normal, gr = geo.attributes.aGrow, r = rng(seed);
  const cand = [];
  for (let i = 0; i < p.count; i++) if (gr.getX(i) > 0.6) cand.push(i);
  if (!cand.length) return null;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), sd = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    const i = cand[Math.floor(r() * cand.length)];
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i), off = 0.003 + r() * 0.012;
    pos[k * 3] = p.getX(i) + nx * off + (r() - 0.5) * 0.03;
    pos[k * 3 + 1] = p.getY(i) + ny * off + (r() - 0.5) * 0.03;
    pos[k * 3 + 2] = p.getZ(i) + nz * off + (r() - 0.5) * 0.03;
    nor.set([nx, ny, nz], k * 3);
    sd[k] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { ...LIGHT_UNIFORMS, uDpr: { value: PX } },
    vertexShader: `attribute float aSeed; uniform float uDpr; varying vec3 vN; varying vec3 vW; varying float vS;
      void main(){
        vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); vS = aSeed;
        vec4 mv = viewMatrix*w;
        gl_PointSize = (0.6 + aSeed*1.1) * uDpr * (6.0 / -mv.z);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `uniform vec3 uKeyPos; uniform vec3 uKeyDir; uniform vec3 uKeyCol; uniform float uCosO; uniform float uCosI;
      uniform vec3 uRimDir; uniform vec3 uRimCol; varying vec3 vN; varying vec3 vW; varying float vS;
      void main(){
        vec2 q = gl_PointCoord - 0.5; if (dot(q,q) > 0.25) discard;
        vec3 L = normalize(uKeyPos - vW);
        float cone = smoothstep(uCosO, uCosI, dot(-L, uKeyDir));
        float lit = max(dot(vN, L), 0.0)*cone;
        vec3 c = mix(vec3(0.05, 0.075, 0.016), vec3(0.2, 0.26, 0.06), vS);
        c *= 0.22 + 1.0*lit*uKeyCol + 0.3*max(dot(vN, uRimDir), 0.0)*uRimCol;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return new THREE.Points(g, m);
}
{
  const fuzz = mossFuzz(boulderGeo, 2500, 31);
  if (fuzz) { fuzz.position.copy(boulder.position); fuzz.rotation.copy(boulder.rotation); table.add(fuzz); }
}

// cave floor, damp, mossy where it meets the boulder
{
  const g = new THREE.PlaneGeometry(30, 30, 160, 160);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, fbm(x * 0.25, 0.5, z * 0.25, 5) * 0.7 + fbm(x * 1.4, 2.0, z * 1.4, 3) * 0.1);
  }
  g.computeVertexNormals();
  addGrowth(g, { moss: 0.9, algae: 0.8, seed: 5.5, lowY: -0.2, band: 0.35, near: { x: 0, z: 0, r0: 1.25, r1: 2.3 } });
  const floor = rockMesh(g, rockMaterial({ color: '#3A3936', bump: 1.6, freq: 2.6, env: 0.25, wet: 0.85, id: 'gray_rocks', scale: 0.5, tint: 0.55 }), [0, -1.12, 0]);
  scene.add(floor);
}

// rubble: stones fallen from the roof over the years, some mossy
const floorH = (x, z) => -1.12 + fbm(x * 0.25, 0.5, z * 0.25, 5) * 0.7 + fbm(x * 1.4, 2.0, z * 1.4, 3) * 0.1;
{
  const mat = rockMaterial({ color: '#3C3A37', bump: 2.4, freq: 7, env: 0.2, id: 'dark_rock_02', scale: 1.8, tint: 0.85 });
  const r = rng(808), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  [0, 1, 2].forEach((k) => {
    const g = addGrowth(rockGeometry({ detail: 8, scale: [1, 0.62, 0.85], amp: 0.35, freq: 1.6, seed: 20 + k * 3.3, sharp: 0.5, cuts: 4 }),
      { moss: 0.8, algae: 0.6, seed: k, lowY: -0.4, band: 0.5 });
    const per = 34, im = new THREE.InstancedMesh(g, mat, per);
    for (let i = 0; i < per; i++) {
      const a = r() * Math.PI * 2, d = 1.1 + Math.pow(r(), 1.6) * 2.6;
      const x = Math.sin(a) * d * 1.1, z = Math.cos(a) * d * 0.9;
      const sz = (0.025 + Math.pow(r(), 2.2) * 0.17) * (d < 1.7 ? 1 : 0.8);
      ps.set(x, floorH(x, z) + sz * 0.22, z);
      q.setFromEuler(e.set(r() * 0.6 - 0.3, r() * 6.28, r() * 0.6 - 0.3));
      sc.set(sz, sz * (0.7 + r() * 0.5), sz * (0.8 + r() * 0.4));
      im.setMatrixAt(i, m4.compose(ps, q, sc));
    }
    im.castShadow = true; im.receiveShadow = true;
    scene.add(im);
  });
}

// the cave around it: walls close on both sides, a back wall, the roof with the crack the sun comes through
{
  const wall = rockMaterial({ color: '#3D3D3E', bump: 2.3, freq: 1.8, env: 0.12, wet: 0.35, id: 'lichen_rock', scale: 0.38, tint: 0.85 });
  const W = (o, pos, rot) => {
    const g = addGrowth(rockGeometry(o), { moss: 0.45, algae: 1, seed: o.seed, lowY: -1.1 - pos[1], band: 0.9, streaks: 0.8 });
    scene.add(rockMesh(g, wall, pos, rot));
  };
  W({ detail: 48, scale: [1.5, 4.2, 2.8], amp: 0.4, freq: 1.0, seed: 1.3, cuts: 7, sharp: 0.6 }, [-3.1, 1.4, -1.4], [0, 0.25, 0.06]);
  W({ detail: 48, scale: [1.6, 4.0, 2.8], amp: 0.4, freq: 1.05, seed: 5.6, cuts: 7, sharp: 0.6 }, [3.2, 1.2, -1.8], [0, -0.3, -0.08]);
  W({ detail: 44, scale: [4.6, 3.8, 1.6], amp: 0.38, freq: 1.1, seed: 8.8, cuts: 6, sharp: 0.6 }, [0.3, 0.9, -5.4], [0, 0.1, 0]);
  W({ detail: 32, scale: [0.9, 1.5, 0.8], amp: 0.36, freq: 1.4, seed: 21.5, cuts: 5, sharp: 0.6 }, [-2.0, -0.4, -2.2], [0, 0.6, 0.1]);
  W({ detail: 32, scale: [0.7, 1.1, 0.7], amp: 0.36, freq: 1.4, seed: 26.1, cuts: 5, sharp: 0.6 }, [2.3, -0.6, -3.4], [0, -0.2, -0.1]);
  W({ detail: 28, scale: [1.9, 1.1, 1.3], amp: 0.34, freq: 1.3, seed: 14.9, cuts: 3 }, [-1.6, -0.75, -3.2], [0, 0.5, 0]);
  W({ detail: 28, scale: [1.5, 0.8, 1.1], amp: 0.34, freq: 1.3, seed: 12.4, cuts: 3 }, [1.9, -0.85, -2.7], [0, -0.4, 0]);
  W({ detail: 36, scale: [5.0, 1.4, 3.6], amp: 0.36, freq: 0.85, seed: 7.7, cuts: 3 }, [0.8, 4.9, -2.4], [0.12, 0.2, -0.12]);
}

// rock reaching into the top corners, close to the camera, framing the view like the inside of a cave mouth
const corners = [];
{
  const mat = rockMaterial({ color: '#36363A', bump: 2.3, freq: 1.8, env: 0.12, wet: 0.3, id: 'dark_rock_02', scale: 0.45, tint: 0.7, moss: 0.6 });
  for (const side of [-1, 1]) {
    const g = addGrowth(rockGeometry({ detail: 40, scale: [0.62, 0.36, 0.42], amp: 0.42, freq: 1.2, seed: side > 0 ? 31.7 : 37.2, cuts: 6, sharp: 0.6 }),
      { moss: 0.5, algae: 0.8, seed: 9 + side, lowY: -0.55, band: 0.35, streaks: 0.6 });
    const m = rockMesh(g, mat, [0, 0, 0], [0.35, side * 0.5, side * -0.55]);
    m.userData.side = side;
    scene.add(m); corners.push(m);
  }
}

// the shaft of light you can see in the dust
const beamUniforms = { uTime: { value: 0 }, uColor: { value: hex('#FFD9B0') }, uStrength: { value: 0.26 } };
{
  const dir = sunTo.clone().sub(sunFrom), len = dir.length() * 1.1;
  const g = new THREE.CylinderGeometry(0.3, 1.1, len, 48, 1, true);
  g.translate(0, -len / 2, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: beamUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vV = -mv.xyz; vN = normalMatrix*normal; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uTime; uniform vec3 uColor; uniform float uStrength;
      ${NOISE}
      void main(){
        float soft = pow(abs(dot(normalize(vN), normalize(vV))), 3.0);
        float along = vUv.y; // 1 at the crack, 0 at the floor
        float fall = smoothstep(0.0, 0.5, along) * mix(0.5, 1.0, along);
        float n = snoise(vec3(vUv.x*7.0, along*2.5 + uTime*0.03, uTime*0.05))*0.5 + 0.5;
        gl_FragColor = vec4(uColor * soft * fall * (0.4 + 0.6*n) * uStrength, 1.0);
      }`,
  });
  const beam = new THREE.Mesh(g, m);
  beam.position.copy(sunFrom);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
  beam.renderOrder = 2;
  scene.add(beam);
}

// dust drifting through the shaft
const dustUniforms = { uTime: { value: 0 }, uDpr: { value: PX } };
{
  const N = 140, r = rng(42), pos = new Float32Array(N * 3), seed = new Float32Array(N);
  const dir = sunTo.clone().sub(sunFrom), len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const t = 0.3 + r() * 0.75, rad = lerp(0.26, 0.95, t) * Math.sqrt(r()) * 0.85, a = r() * Math.PI * 2;
    v.set(Math.cos(a) * rad, -t * len, Math.sin(a) * rad).applyQuaternion(q).add(sunFrom);
    pos.set([v.x, v.y, v.z], i * 3);
    seed[i] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: dustUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute float aSeed; uniform float uTime; uniform float uDpr; varying float vA;
      void main(){
        vec3 p = position;
        float t = uTime*0.1 + aSeed*40.0;
        p += vec3(sin(t*0.9)*0.06, sin(t*0.6 + 1.3)*0.08 - 0.02*sin(t*0.2), cos(t*0.7)*0.06);
        vec4 mv = modelViewMatrix*vec4(p,1.0);
        gl_PointSize = (0.8 + aSeed*1.4) * uDpr * (8.0 / -mv.z);
        vA = (0.3 + 0.7*(0.5+0.5*sin(uTime*(0.5+aSeed*1.5) + aSeed*31.0))) * (0.4 + aSeed*0.6);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.25, 0.0, dot(c,c)) * vA;
        gl_FragColor = vec4(vec3(1.0,0.88,0.7) * a * 0.9, 1.0); }`,
  });
  const dust = new THREE.Points(g, m);
  dust.renderOrder = 3;
  scene.add(dust);
}

// low mist drifting over the floor, warm where the shaft falls on it
const mistTime = { value: 0 };
{
  [[-0.98, 9, 1], [-0.86, 7.5, 0.8], [-0.74, 6, 0.55]].forEach(([y, size, amt], k) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...LIGHT_UNIFORMS, uTime: mistTime, uAmt: { value: amt }, uSeed: { value: k * 7.3 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: 'varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: `${NOISE}
        uniform float uTime; uniform float uAmt; uniform float uSeed;
        uniform vec3 uKeyPos; uniform vec3 uKeyDir; uniform vec3 uKeyCol; uniform float uCosO; uniform float uCosI;
        varying vec3 vW; varying vec2 vUv;
        void main(){
          float n = snoise(vec3(vW.xz*0.55 + vec2(uTime*0.03, uTime*0.012), uSeed))*0.5 + 0.5;
          n = n*0.65 + (snoise(vec3(vW.xz*1.5 - vec2(uTime*0.04, 0.0), uSeed + 3.0))*0.5 + 0.5)*0.35;
          float d = smoothstep(0.3, 0.85, n)*smoothstep(0.5, 0.18, length(vUv - 0.5));
          vec3 L = normalize(uKeyPos - vW);
          float cone = smoothstep(uCosO - 0.1, uCosI, dot(-L, uKeyDir));
          vec3 col = mix(vec3(0.03, 0.035, 0.048), uKeyCol*0.4, cone);
          gl_FragColor = vec4(col*d*uAmt, 1.0);
        }`,
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
    p.rotation.x = -Math.PI / 2; p.position.set(0, y, -0.4);
    p.renderOrder = 1;
    scene.add(p);
  });
}
// soft haze hanging in the air: a few large faint clouds, brighter inside the shaft
const hazeSprites = [];
{
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d'), img = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / N - 0.5, v = j / N - 0.5, rr = Math.hypot(u, v) * 2;
    const a = Math.max(0, 1 - rr) ** 1.6 * clamp01(0.55 + fbm(i / 22, j / 22, 1.7, 4) * 1.4);
    const o = (j * N + i) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = Math.round(a * 255);
  }
  x.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  const r = rng(404);
  const spots = [[-0.9, 2.6, 0.5, 2.6, 1], [-0.4, 1.6, 0.3, 2.2, 1], [0.2, 0.9, 0.1, 2.0, 0.8], [1.6, 1.2, -1.6, 3.2, 0.35],
    [-1.8, 0.4, -1.8, 3.0, 0.35], [0.6, 2.6, -2.6, 3.6, 0.3], [1.4, -0.4, 0.6, 2.4, 0.4], [-1.4, -0.5, 0.9, 2.2, 0.4]];
  for (const [px, py, pz, sz, warm] of spots) {
    const m = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true });
    m.color.copy(hex('#5B6070')).lerp(SUN_COLOR, warm);
    m.opacity = 0.018 + warm * 0.02;
    m.rotation = r() * 6.28;
    const sp = new THREE.Sprite(m);
    sp.position.set(px, py, pz); sp.scale.set(sz, sz * 0.8, 1);
    sp.userData = { base: sp.position.clone(), ph: r() * 6.28, spin: (r() - 0.5) * 0.04 };
    sp.renderOrder = 2;
    scene.add(sp); hazeSprites.push(sp);
  }
}

// ── crystals ────────────────────────────────────────────────────────────────────────────────────────────────
const BASE = -0.3; // crystals start below the stone's surface
function crystalGeometry({ r, h, tip, seed }) {
  const rand = rng(seed), N = 6, base = [], top = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + (rand() - 0.5) * 0.42;
    const rr = r * (0.8 + rand() * 0.36);
    base.push(new THREE.Vector3(Math.cos(a) * rr * 0.92, BASE, Math.sin(a) * rr * 0.92));
    top.push(new THREE.Vector3(Math.cos(a) * rr, h + (rand() - 0.5) * 0.14 * r / 0.2, Math.sin(a) * rr));
  }
  const apex = new THREE.Vector3((rand() - 0.5) * r * 0.5, h + tip * (0.88 + rand() * 0.24), (rand() - 0.5) * r * 0.5);
  const span = h + tip - BASE;
  const pos = [], uv = [];
  const tri = (a, b, c, out) => {
    // wind every triangle to face away from `out` (a point inside the crystal)
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const cen = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    if (n.dot(cen.sub(out)) < 0) [b, c] = [c, b];
    for (const p of [a, b, c]) {
      pos.push(p.x, p.y, p.z);
      uv.push((Math.atan2(p.z, p.x) / (Math.PI * 2) + 1) % 1, (p.y - BASE) / span);
    }
  };
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const midIn = new THREE.Vector3(0, (top[i].y + BASE) / 2, 0);
    tri(base[i], top[i], top[j], midIn);
    tri(base[i], top[j], base[j], midIn);
    tri(top[i], apex, top[j], new THREE.Vector3(0, h - 0.1, 0));
    tri(base[i], base[j], new THREE.Vector3(0, BASE, 0), new THREE.Vector3(0, BASE + 0.1, 0));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); // non-indexed: flat facets
  return g;
}

// fine growth lines across the prism faces, milky at the root, clear toward the tip
function striationTexture() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 512;
  const x = c.getContext('2d'), r = rng(9);
  for (let y = 0; y < 512; y++) {
    const v = 1 - y / 512;
    let rough = 0.04 + (r() < 0.14 ? r() * 0.1 : 0) + Math.max(0, 0.3 - v) * 1.7;
    rough = Math.min(1, rough);
    const g = Math.round(rough * 255);
    x.fillStyle = `rgb(${g},${g},${g})`; x.fillRect(0, y, 16, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

const glass = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, metalness: 0, roughness: 1, roughnessMap: striationTexture(),
  transmission: 1, thickness: 0.3, ior: 1.544, dispersion: 0.45,
  attenuationColor: hex('#EEF1F6'), attenuationDistance: 2.2,
  specularIntensity: 1, specularColor: new THREE.Color(1.6, 1.6, 1.6), envMapIntensity: 2.6, side: THREE.DoubleSide,
});

// What quartz shows in the dark: light caught inside it where the sun reaches, a milky root, faint veils,
// and a cool line along the edges from the cave behind. Drawn over the glass, additive.
const quartzLight = new THREE.ShaderMaterial({
  uniforms: { ...LIGHT_UNIFORMS },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  vertexShader: `varying vec3 vN; varying vec3 vW; varying vec3 vO; varying float vV;
    void main(){
      vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal);
      vO = position; vV = uv.y;
      gl_Position = projectionMatrix*viewMatrix*w;
    }`,
  fragmentShader: `${NOISE}
    uniform vec3 uKeyPos; uniform vec3 uKeyDir; uniform vec3 uKeyCol; uniform float uCosO; uniform float uCosI;
    uniform vec3 uRimDir; uniform vec3 uRimCol;
    varying vec3 vN; varying vec3 vW; varying vec3 vO; varying float vV;
    void main(){
      vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
      vec3 V = normalize(cameraPosition - vW);
      vec3 L = normalize(uKeyPos - vW);
      float cone = smoothstep(uCosO, uCosI, dot(-L, uKeyDir));
      float facing = abs(dot(N, V));
      float lit = (0.3 + 0.7*max(dot(N, L), 0.0))*cone;
      float veil = smoothstep(0.8, 1.0, snoise(vO*vec3(16.0, 1.1, 16.0))*0.5 + 0.5)*0.5;
      float milk = smoothstep(0.34, 0.06, vV);
      float edge = pow(1.0 - facing, 4.0)*(0.25 + 0.75*max(dot(N, uRimDir), 0.0));
      vec3 c = uKeyCol*lit*(0.07 + 0.3*veil + 0.55*milk) + uRimCol*edge*0.3 + uRimCol*0.012;
      gl_FragColor = vec4(c*(gl_FrontFacing ? 0.7 : 1.0), 1.0);
    }`,
});

// The essence: a dense glowing fog filling the crystal from the root, edge to edge, up to its share. Drawn on
// the crystal's own faces: each pixel follows the view ray through the crystal (its faces as planes) and gathers
// fog along the part of the ray below the surface, brightest just under the surface so the level reads.
const ESS_MIN = 0.06; // a thin layer when something is planned and nothing is done yet
function essenceMaterial(geo) {
  const p = geo.attributes.position, planes = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    planes.push(new THREE.Vector4(n.x, n.y, n.z, n.dot(a)));
  }
  return new THREE.ShaderMaterial({
    uniforms: {
      ...LIGHT_UNIFORMS, uTime: mistTime, uPl: { value: planes }, uCamL: { value: new THREE.Vector3() },
      uLevel: { value: -1 }, uCol: { value: new THREE.Color() }, uR: { value: 0.2 },
    },
    transparent: true, depthWrite: false, premultipliedAlpha: true, side: THREE.FrontSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    vertexShader: `varying vec3 vP; varying vec3 vW;
      void main(){ vP = position; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `${NOISE}
      uniform vec4 uPl[${planes.length}]; uniform vec3 uCamL; uniform float uLevel; uniform vec3 uCol; uniform float uTime; uniform float uR;
      uniform vec3 uKeyPos; uniform vec3 uKeyDir; uniform vec3 uKeyCol; uniform float uCosO; uniform float uCosI;
      varying vec3 vP; varying vec3 vW;
      void main(){
        vec3 d = normalize(vP - uCamL);
        float tx = 4.0;
        for (int i = 0; i < ${planes.length}; i++) {
          float dn = dot(uPl[i].xyz, d);
          if (dn > 1e-4) tx = min(tx, (uPl[i].w - dot(uPl[i].xyz, vP))/dn);
        }
        float lv = uLevel + 0.01*sin(uTime*0.8 + vP.x*14.0 + vP.z*11.0);
        float t0 = 0.0, t1 = max(tx, 0.0);
        if (abs(d.y) < 1e-4) { if (vP.y > lv) discard; }
        else { float tl = (lv - vP.y)/d.y; if (d.y > 0.0) t1 = min(t1, tl); else t0 = max(t0, tl); }
        if (t1 <= t0) discard;
        vec3 L = normalize(uKeyPos - vW);
        float cone = smoothstep(uCosO, uCosI, dot(-L, uKeyDir));
        float sun = cone*dot(uKeyCol, vec3(0.333));
        vec3 col = vec3(0.0); float T = 1.0;
        float dt = (t1 - t0)/8.0;
        for (int i = 0; i < 8; i++) {
          vec3 q = vP + d*(t0 + (float(i) + 0.5)*dt);
          float n = snoise(q*vec3(6.0, 3.5, 6.0) + vec3(0.0, -uTime*0.1, uTime*0.04))*0.5 + 0.5;
          float w = snoise(q*vec3(15.0, 6.0, 15.0) + vec3(uTime*0.06, -uTime*0.16, 0.0))*0.5 + 0.5;
          float under = lv - q.y;
          float core = 1.0 - clamp(length(q.xz)/uR, 0.0, 1.0);
          float dens = (0.25 + 7.0*n*n*n + 3.0*w*w*w)*mix(0.4, 1.0, clamp(under*5.0, 0.0, 1.0));
          float surf = exp(-abs(under)*26.0);
          vec3 e = uCol*(0.45 + 1.6*n*w + 0.6*sun)*(0.3 + 1.5*core) + mix(uCol, vec3(1.0), 0.6)*surf*1.6;
          float a = 1.0 - exp(-dens*dt);
          col += T*a*e;
          T *= 1.0 - a;
        }
        gl_FragColor = vec4(col, 1.0 - T);
      }`,
  });
}

// azimuth (deg), distance from the centre, outward lean, radius, prism height, tip, seed
// Families sit together: 36° apart within one, 48° between families. The middle of each is the tallest.
const LAYOUT = [
  [-36, 0.36, 0.42, 0.19, 0.7, 0.3, 11], [0, 0.24, 0.28, 0.24, 1.05, 0.38, 7], [36, 0.38, 0.48, 0.18, 0.62, 0.28, 23],
  [84, 0.34, 0.38, 0.2, 0.86, 0.34, 31], [120, 0.22, 0.24, 0.25, 1.18, 0.4, 43], [156, 0.36, 0.42, 0.19, 0.72, 0.3, 57],
  [204, 0.36, 0.4, 0.2, 0.78, 0.32, 61], [240, 0.24, 0.28, 0.23, 1.0, 0.37, 73], [276, 0.38, 0.46, 0.18, 0.66, 0.29, 89],
];
const ray = new THREE.Raycaster();
table.updateMatrixWorld(true);
function surfaceY(x, z) {
  ray.set(new THREE.Vector3(x, 4, z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(boulder, false)[0];
  return hit ? hit.point.y : 0;
}

class Crystal {
  constructor(i, L) {
    const [az, dist, lean, r, h, tip, seed] = L;
    this.i = i; this.key = ASPECTS[i]; this.az = THREE.MathUtils.degToRad(az);
    this.c = { r, h, tip, seed };
    const x = Math.sin(this.az) * dist * 0.86, z = Math.cos(this.az) * dist * 0.86;
    this.group = new THREE.Group();
    this.group.position.set(x, surfaceY(x, z) + 0.02, z);
    const axis = new THREE.Vector3(Math.sin(this.az) * Math.sin(lean), Math.cos(lean), Math.cos(this.az) * Math.sin(lean));
    this.group.quaternion.setFromUnitVectors(UP, axis);
    const spin = new THREE.Group();
    spin.rotation.y = rng(seed * 7)() * Math.PI * 2;
    this.group.add(spin);
    const g = crystalGeometry(this.c);
    this.glass = new THREE.Mesh(g, glass);
    this.glass.castShadow = true; this.glass.receiveShadow = true;
    this.mat = essenceMaterial(g);
    this.mat.uniforms.uR.value = r;
    this.essence = new THREE.Mesh(g, this.mat);
    this.essence.renderOrder = 3;
    this.essence.visible = false;
    this.shine = new THREE.Mesh(g, quartzLight);
    this.shine.renderOrder = 4;
    spin.add(this.glass, this.essence, this.shine);
    table.add(this.group);
    this.top = h + tip; this.lean = lean;
    this.fill = 0; this.fillVel = 0; this.target = 0;
  }
  setData(a) {
    this.mat.uniforms.uCol.value.copy(hex(a.color));
    this.target = a.total > 0 ? ESS_MIN + (1 - ESS_MIN) * clamp01(a.done / a.total) : 0;
    if (state.reduce || !this.started) { this.fill = this.target; this.fillVel = 0; }
    this.started = true;
  }
  update(dt) {
    // rises toward its share with a soft settle; falls back if a task is undone
    this.fillVel += ((this.target - this.fill) * 26 - this.fillVel * 8.5) * dt;
    this.fill += this.fillVel * dt;
    const f = clamp01(this.fill);
    this.essence.visible = f > 0.004;
    this.mat.uniforms.uLevel.value = -0.03 + (this.top + 0.05) * f;
    this.glass.worldToLocal(this.mat.uniforms.uCamL.value.copy(camera.position));
  }
}
const crystals = LAYOUT.map((L, i) => new Crystal(i, L));

// many small clear crystals packed between and around the nine, merged into one mesh; no essence, no meaning
{
  const r = rng(5150), parts = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qs = new THREE.Quaternion();
  const bases = crystals.map((c) => ({ x: c.group.position.x, z: c.group.position.z, r: c.c.r }));
  let tries = 0;
  while (parts.length < 48 && tries++ < 800) {
    const az = r() * Math.PI * 2, dist = Math.sqrt(r()) * 0.64;
    const x = Math.sin(az) * dist, z = Math.cos(az) * dist;
    const big = r() < 0.22;
    const sr = big ? 0.07 + r() * 0.035 : 0.022 + r() * 0.045;
    if (bases.some((b) => Math.hypot(b.x - x, b.z - z) < b.r * 0.7 + sr * 0.5)) continue;
    const g = crystalGeometry({ r: sr, h: sr * (big ? 3 + r() * 2.5 : 1.4 + r() * 3), tip: sr * (1.1 + r() * 0.7), seed: 900 + parts.length * 17 });
    const lean = 0.15 + dist * 1.15 + (r() - 0.5) * 0.3;
    q.setFromUnitVectors(UP, new THREE.Vector3(Math.sin(az) * Math.sin(lean), Math.cos(lean), Math.cos(az) * Math.sin(lean)));
    qs.setFromAxisAngle(UP, r() * 6.28);
    m4.compose(new THREE.Vector3(x, surfaceY(x, z) + 0.01, z), q.multiply(qs), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m4);
    parts.push(g);
  }
  const geo = mergeGeometries(parts);
  const druse = new THREE.Mesh(geo, glass);
  druse.castShadow = true; druse.receiveShadow = true;
  const shine = new THREE.Mesh(geo, quartzLight); shine.renderOrder = 4;
  table.add(druse, shine);
}

// ── post: a little bloom on real highlights, ACES, vignette, and the fade into the app ──────────────────────
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.5, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uBg: { value: new THREE.Vector3() }, uBgTop: { value: new THREE.Vector3() }, uBgStop: { value: 1 },
    uFade: { value: 0 }, uFadeStart: { value: 0.7 }, uAspect: { value: 1 }, uTop: { value: 0.24 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 uBg; uniform vec3 uBgTop; uniform float uBgStop; uniform float uFade;
    uniform float uFadeStart; uniform float uAspect; uniform float uTop; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float y = 1.0 - vUv.y; // 0 at the top
      vec3 bg = mix(uBgTop, uBg, clamp(y/uBgStop, 0.0, 1.0)); // the app background behind this row
      vec2 q = vUv - vec2(0.5, 0.5); q.x *= uAspect;
      c *= mix(0.5, 1.0, smoothstep(0.95, 0.22, length(q)));
      c = mix(bg, c, uFade);
      c = mix(c, bg, smoothstep(uFadeStart, 1.0, y));
      c = mix(bg, c, smoothstep(uTop*0.35, uTop + 0.05, y));     // melts away under the status bar and top bar
      c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
composer.addPass(grade);
function setBg() {
  const lin = (h) => new THREE.Color().setStyle(h, THREE.SRGBColorSpace);
  const c = lin(state.bg), top = lin(state.bgTop);
  scene.background.copy(c).multiplyScalar(0.8);
  scene.fog.color.copy(c).lerp(HAZE, 0.5);
  const s = c.clone().convertLinearToSRGB(), t = top.clone().convertLinearToSRGB();
  grade.uniforms.uBg.value.set(s.r, s.g, s.b);
  grade.uniforms.uBgTop.value.set(t.r, t.g, t.b);
  grade.uniforms.uBgStop.value = state.bgStop;
}
setBg();

// ── framing: the tallest tip just under the app's top bar, the stone's top about two thirds down ────────────
const PITCH = 0.17;
const TIP_Y = Math.max(...crystals.map((c) => c.group.position.y + c.top * Math.cos(c.lean)));
let camBase = new THREE.Vector3(), camLook = new THREE.Vector3();
function frame() {
  const W = window.innerWidth, H = window.innerHeight;
  renderer.setSize(W, H, false);
  composer.setSize(W, H);
  bloom.resolution.set(W / 2, H / 2);
  grade.uniforms.uAspect.value = W / H;
  camera.aspect = W / H;
  grade.uniforms.uTop.value = state.topFrac;
  const fTop = state.topFrac + 0.06, fBase = 0.76, yTop = TIP_Y + 0.05, yBase = 0.02;
  const V = (yTop - yBase) / (fBase - fTop);
  const d = V / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const cy = yTop - (0.5 - fTop) * V;
  camLook.set(0, cy, 0);
  camBase.set(0, cy + d * Math.sin(PITCH), d * Math.cos(PITCH));
  camera.position.copy(camBase); camera.lookAt(camLook);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  // corner rocks: just inside the frame's top corners, about three units in front of the camera
  const D = 3.0, hh = D * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), hw = hh * camera.aspect;
  for (const m of corners) {
    const side = m.userData.side;
    m.position.set(side * (hw + 0.08), hh * 0.78, -D).applyMatrix4(camera.matrixWorld);
  }
}

// ── turning: a drag turns the boulder; let go and it coasts, then eases one crystal round to face you ───────
const turn = { angle: 0, vel: 0, dragging: false, last: 0, moved: false, front: -1 };
const R_TURN = 1.0; // a drag of this many world units turns it one radian
function frontIndex() {
  let best = 0, bd = Infinity;
  crystals.forEach((c, i) => { const d = Math.abs(wrap(c.az + turn.angle)); if (d < bd) { bd = d; best = i; } });
  return best;
}
function worldPerScreenX() {
  const d = camera.position.distanceTo(camLook);
  return 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect;
}
function down() {
  turn.dragging = true; turn.moved = true; turn.vel = 0; turn.last = performance.now();
  toApp({ t: 'grab' });
}
function move(dx) {
  if (!turn.dragging) return;
  const now = performance.now(), dt = Math.max(1, now - turn.last) / 1000;
  const dA = (dx * worldPerScreenX()) / R_TURN;
  turn.angle += dA;
  turn.vel = lerp(turn.vel, dA / dt, 0.5);
  turn.last = now;
}
function up(vx) {
  if (!turn.dragging) return;
  const since = performance.now() - turn.last;
  if (typeof vx === 'number' && since < 80) turn.vel = (vx * worldPerScreenX()) / R_TURN;
  else if (since > 80) turn.vel = 0;
  turn.vel = THREE.MathUtils.clamp(turn.vel, -14, 14);
  turn.dragging = false;
}
function updateTurn(dt) {
  if (!turn.dragging) {
    if (Math.abs(turn.vel) > 1.1) {
      turn.angle += turn.vel * dt;
      turn.vel *= Math.exp(-dt * 2.4);
    } else {
      const diff = wrap(-crystals[frontIndex()].az - turn.angle);
      turn.vel += (diff * 20 - turn.vel * 8) * dt;
      turn.angle += turn.vel * dt;
      if (Math.abs(diff) < 0.002 && Math.abs(turn.vel) < 0.02) {
        turn.vel = 0;
        if (turn.moved) { turn.moved = false; toApp({ t: 'settled' }); }
      }
    }
  }
  table.rotation.y = turn.angle;
  const f = frontIndex();
  if (f !== turn.front) {
    turn.front = f;
    toApp({ t: 'facing', key: ASPECTS[f], tick: turn.moved });
  }
}

function applyData() {
  crystals.forEach((c, i) => c.setData(state.aspects[i]));
}
function recv(m) {
  if (!m || !m.t) return;
  if (m.t === 'data') {
    if (typeof m.reduce === 'boolean') state.reduce = m.reduce;
    if (Array.isArray(m.aspects)) {
      const by = Object.fromEntries(m.aspects.map((a) => [a.key, a]));
      state.aspects = ASPECTS.map((k, i) => ({ ...state.aspects[i], ...(by[k] || {}) }));
      if (!state.gotData) {
        // open on the first aspect with something planned today
        state.gotData = true;
        const first = state.aspects.findIndex((a) => a.total > 0);
        turn.angle = -crystals[first < 0 ? 1 : first].az; turn.vel = 0;
      }
      applyData();
    }
    if (m.bg) { state.bg = m.bg; if (m.bgTop) state.bgTop = m.bgTop; if (typeof m.bgStop === 'number') state.bgStop = m.bgStop; setBg(); }
    if (typeof m.topFrac === 'number' && m.topFrac !== state.topFrac) { state.topFrac = m.topFrac; frame(); }
  } else if (m.t === 'down') down();
  else if (m.t === 'move') move(m.dx);
  else if (m.t === 'up') up(m.vx);
  else if (m.t === 'pause') state.paused = true;
  else if (m.t === 'resume') { if (state.paused) { state.paused = false; last = performance.now(); requestAnimationFrame(loop); } }
}
window.hero = { recv };
window.addEventListener('message', (e) => {
  let m = e.data;
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch { return; } }
  recv(m);
});
document.addEventListener('message', (e) => { try { recv(JSON.parse(e.data)); } catch { /* not ours */ } });

if (STANDALONE) {
  // opened on its own (dev): drive it with the mouse or a finger directly
  let lx = null, lt = 0, v = 0;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => { lx = e.clientX; lt = performance.now(); v = 0; down(); el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (lx === null) return;
    const now = performance.now(), dx = (e.clientX - lx) / innerWidth;
    v = dx / Math.max(1, now - lt) * 1000; lx = e.clientX; lt = now; move(dx);
  });
  const end = () => { if (lx !== null) { up(v); lx = null; } };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  applyData();
}

// ── loop ────────────────────────────────────────────────────────────────────────────────────────────────────
window.addEventListener('resize', frame);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !state.paused) { last = performance.now(); requestAnimationFrame(loop); }
});
frame();
applyData();
renderer.compile(scene, camera);

let scansIn = false;
Promise.all(scanLoads).then(() => { scansIn = true; });
setTimeout(() => { scansIn = true; }, 6000);
let last = performance.now(), t0 = last, reveal = 0, readySent = false;
function loop(now) {
  if (state.paused || document.hidden) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = (now - t0) / 1000;
  if (scansIn) reveal = Math.min(1, reveal + dt / (state.reduce ? 0.3 : 1.4));
  const e = 1 - Math.pow(1 - reveal, 3);
  grade.uniforms.uFade.value = e;
  // a slow push-in on load, then the faintest drift, as if the camera is held by hand
  const drift = state.reduce ? 0 : 1;
  camera.position.copy(camBase).addScaledVector(camBase.clone().sub(camLook).normalize(), (1 - e) * 0.6 * drift);
  camera.position.x += Math.sin(t * 0.21) * 0.03 * drift;
  camera.position.y += Math.sin(t * 0.17 + 1.0) * 0.02 * drift;
  camera.lookAt(camLook);
  beamUniforms.uTime.value = t;
  dustUniforms.uTime.value = drift ? t : 0;
  mistTime.value = t;
  for (const sp of hazeSprites) {
    const u = sp.userData, k = drift ? t : 0;
    sp.position.set(u.base.x + Math.sin(k * 0.05 + u.ph) * 0.25, u.base.y + Math.sin(k * 0.04 + u.ph * 2) * 0.1, u.base.z);
    sp.material.rotation += u.spin * dt * drift;
  }
  updateTurn(dt);
  camera.updateMatrixWorld();
  table.updateMatrixWorld(true);
  for (const c of crystals) c.update(dt);
  composer.render(dt);
  if (!readySent && scansIn) { readySent = true; toApp({ t: 'ready' }); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
