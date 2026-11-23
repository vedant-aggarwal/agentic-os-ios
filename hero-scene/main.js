// Today hero: nine quartz crystals, one per life aspect, growing as one cluster out of a mossy boulder in a dark
// cave, lit by a shaft of daylight through a crack in the roof. Each crystal holds a coloured liquid, levelled by
// gravity, up to that aspect's share done; a full one overflows and leaks down its side onto the stone.
// A sideways drag turns the whole boulder with real weight; flicks add up until it is a blur and the fog round its
// foot (fog.js) is thrown up out of the cave. It slows on its own and settles with one crystal facing you, which the
// app names. Pothos hangs from the roof (plants.js): touch it and its leaves fold shut, drag it to swing it, too
// hard and it snaps, then grows back. Fireflies drift about the cave and scatter from your finger and the spin.
// Runs in a WebView (phone) or an iframe (web build). Messages: see recv() and toApp().
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { createFog } from './fog.js';
import { createPlants } from './plants.js';

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
renderer.shadowMap.type = THREE.PCFShadowMap;
if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = 0.6;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color();
scene.fog = new THREE.FogExp2(0x000000, 0.085);
const HAZE = hex('#4A4C55');
const ENV_GAIN = 0.32, ENV_TURN = Math.PI * 0.5; // the cave mouth behind and to the left of the camera // the cave air: distance turns to a faint grey haze, not to black
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

{
  const ENV_URL = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/hikers_cave_1k.hdr';
  scanLoads.push(new Promise((res) => {
    new HDRLoader().load(ENV_URL, (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromEquirectangular(tex).texture;
      scene.environmentIntensity = ENV_GAIN;
      scene.environmentRotation.set(0, ENV_TURN, 0);
      tex.dispose(); pm.dispose();
      res();
    }, undefined, () => res());
  }));
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
const boulder = rockMesh(boulderGeo, rockMaterial({ color: '#3A3835', bump: 2.1, freq: 3.4, env: 0.22, id: 'mossy_rock', scale: 0.75, tint: 0.58, moss: 0.75, wet: 0.45 }), [0, ROCK_Y, 0], [0, 0.3, 0], { cast: true });
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
  const fuzz = mossFuzz(boulderGeo, 6500, 31);
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
  const mat = rockMaterial({ color: '#4A4946', bump: 2.3, freq: 1.8, env: 0.3, wet: 0.25, id: 'lichen_rock', scale: 0.55, tint: 1.0, moss: 0.15 });
  for (const side of [-1, 1]) {
    const g = addGrowth(rockGeometry({ detail: 40, scale: [0.62, 0.4, 0.38], amp: 0.36, freq: 1.2, seed: side > 0 ? 31.7 : 37.2, cuts: 6, sharp: 0.6 }),
      { moss: 0.2, algae: 0.35, seed: 9 + side, lowY: -0.6, band: 0.25, streaks: 0.7 });
    const m = rockMesh(g, mat, [0, 0, 0], [0.2, side * 0.5, side * -0.62]);
    m.userData.side = side;
    scene.add(m); corners.push(m);
  }
}
// daylight from the cave mouth behind the camera: it reaches the near rocks, and dies out before the stone
const mouth = new THREE.PointLight(hex('#C8CCD6'), 3.2, 3.9, 1.6);
scene.add(mouth);

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
  const N = 210, r = rng(42), pos = new Float32Array(N * 3), seed = new Float32Array(N);
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

// The fog round the foot of the stone (fog.js). Turning the stone drags it round; as the spin builds it is pulled
// up into a whirl round the stone, and a wild spin throws it up out of the cave. It settles back as the spin dies.
const fog = (() => {
  // the floor's height, so the fog lies on it and rays stop where they meet it
  const F = 64, S = 3.2, fd = new Uint8Array(F * F * 4);
  for (let j = 0; j < F; j++) for (let i = 0; i < F; i++) {
    const h = floorH(((i + 0.5) / F * 2 - 1) * S, ((j + 0.5) / F * 2 - 1) * S);
    fd[(j * F + i) * 4] = Math.round(clamp01((h + 1.7) / 1.2) * 255); fd[(j * F + i) * 4 + 3] = 255;
  }
  const floorTex = new THREE.DataTexture(fd, F, F, THREE.RGBAFormat);
  floorTex.magFilter = floorTex.minFilter = THREE.LinearFilter; floorTex.needsUpdate = true;
  return createFog({ renderer, camera, light: LIGHT_UNIFORMS, floorTex, rockY: ROCK_Y });
})();
const vortex = { swirl: 0, shear: 0, w: 0, e: 0, lift: 0, rise: 0, lifted: false };
function updateVortex(dt, t) {
  const u = fog.u;
  u.uTime.value = t;
  if (state.reduce) {
    vortex.e = vortex.lift = 0;
    u.uE.value = u.uLift.value = 0; u.uTop.value = 0.35;
    return;
  }
  const a = turn.speed, wT = turn.w;
  // how hard it is whirling builds over a second or so and dies away over a few; past a wild speed the fog goes
  // up and out, and comes back down slowly as the spin dies
  const eT = sstep(2.5, 22, a);
  vortex.e += (eT - vortex.e) * (1 - Math.exp(-dt * (eT > vortex.e ? 1.5 : 0.32)));
  const lT = sstep(25, 36, a);
  vortex.lift += (lT - vortex.lift) * (1 - Math.exp(-dt * (lT > vortex.lift ? 2.4 : 0.7)));
  if (!vortex.lifted && vortex.lift > 0.5) { vortex.lifted = true; toApp({ t: 'haptic', k: 'heavy' }); }
  else if (vortex.lifted && vortex.lift < 0.15) vortex.lifted = false;
  // the fog follows the stone round, slower than it, and keeps turning on its own while the whirl lasts
  const target = THREE.MathUtils.clamp(wT * 0.9, -9, 9) + Math.sign(vortex.w || wT) * vortex.e * 3.2;
  vortex.w += (target - vortex.w) * Math.min(1, dt * 1.6);
  vortex.swirl += vortex.w * dt;
  vortex.shear = THREE.MathUtils.clamp((vortex.shear + vortex.w * dt) * Math.exp(-dt / 2.5), -14, 14);
  vortex.rise += dt * (0.03 + 0.5 * vortex.e + 0.7 * vortex.lift);
  u.uSwirl.value = vortex.swirl; u.uShear.value = vortex.shear; u.uE.value = vortex.e;
  u.uLift.value = vortex.lift; u.uRise.value = vortex.rise;
  u.uTop.value = Math.min(5.5, 0.35 + 1.6 * vortex.e + 3.5 * vortex.lift);
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
  const pos = [], uv = [], bary = [];
  const tri = (a, b, c, out, skip = null) => {
    // wind every triangle to face away from `out` (a point inside the crystal)
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const cen = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    if (n.dot(cen.sub(out)) < 0) [b, c] = [c, b];
    // barycentrics for the edge lines: the edge opposite `skip` only splits a face in two, so it gets none
    const vs = [a, b, c], k = skip === 'all' ? -2 : vs.indexOf(skip);
    vs.forEach((p, m) => {
      pos.push(p.x, p.y, p.z);
      uv.push((Math.atan2(p.z, p.x) / (Math.PI * 2) + 1) % 1, (p.y - BASE) / span);
      const e = [0, 0, 0]; e[m] = 1;
      if (k >= 0) e[k] = 1; else if (k === -2) e[0] = e[1] = e[2] = 1;
      bary.push(...e);
    });
  };
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const midIn = new THREE.Vector3(0, (top[i].y + BASE) / 2, 0);
    tri(base[i], top[i], top[j], midIn, top[i]);
    tri(base[i], top[j], base[j], midIn, base[j]);
    tri(top[i], apex, top[j], new THREE.Vector3(0, h - 0.1, 0));
    tri(base[i], base[j], new THREE.Vector3(0, BASE, 0), new THREE.Vector3(0, BASE + 0.1, 0), 'all');
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aBary', new THREE.Float32BufferAttribute(bary, 3));
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

const STRIATION = striationTexture();
const GLASS = {
  color: 0xffffff, metalness: 0, roughness: 1, roughnessMap: STRIATION,
  transmission: 1, thickness: 0.3, ior: 1.544, dispersion: 0.45,
  attenuationColor: hex('#EEF1F6'), attenuationDistance: 2.2,
  specularIntensity: 1, specularColor: new THREE.Color(1.6, 1.6, 1.6), envMapIntensity: 2.6, side: THREE.DoubleSide,
};
const glass = new THREE.MeshPhysicalMaterial(GLASS);

// The nine are filled with a coloured liquid, levelled by gravity, up to the aspect's share. It lives in the
// glass's own shader: each pixel follows the view ray through the crystal (its 24 faces as planes), measures how
// far the ray runs under the liquid's surface, and absorbs the light seen through the glass along that length
// (Beer-Lambert), so a deep column reads dark and saturated and a thin one pale. The daylight that reaches the
// liquid scatters in it in its colour. A bright meniscus with a dark band under it marks the level on the faces.
const N_PL = 24;
function facePlanes(geo) {
  const p = geo.attributes.position, planes = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    planes.push(new THREE.Vector4(n.x, n.y, n.z, n.dot(a)));
  }
  if (planes.length !== N_PL) throw new Error('crystal faces: ' + planes.length);
  return planes;
}
const GEM_PARS = `
  varying vec3 vLP;
  uniform vec4 uPl[${N_PL}]; uniform vec3 uCamL; uniform vec3 uUpL; uniform float uLvl; uniform vec3 uCol; uniform vec3 uSigma;
  uniform vec3 uKeyPos; uniform vec3 uKeyDir; uniform vec3 uKeyCol; uniform float uCosO; uniform float uCosI;
  uniform vec3 uRimDir; uniform vec3 uRimCol;
  vec3 gemAbs = vec3(1.0); vec3 gemGlow = vec3(0.0); float gemLq = 0.0; float gemTop = 0.0; float gemCone = 0.0;`;
const GEM_MAIN = `
  if (uLvl > -8.0) {
    vec3 d = normalize(vLP - uCamL);
    float tIn = -4.0, tOut = 4.0;
    for (int i = 0; i < ${N_PL}; i++) {
      float dn = dot(uPl[i].xyz, d);
      float off = uPl[i].w - dot(uPl[i].xyz, vLP);
      if (dn > 1e-4) tOut = min(tOut, off/dn);
      else if (dn < -1e-4) tIn = max(tIn, off/dn);
    }
    float t0 = gl_FrontFacing ? 0.0 : min(tIn, 0.0);
    float t1 = gl_FrontFacing ? max(tOut, 0.0) : 0.0;
    float s0 = dot(vLP, uUpL), ds = dot(d, uUpL);
    float a = t0, b = t1;
    if (abs(ds) < 1e-5) { if (s0 >= uLvl) b = a; }
    else { float tl = (uLvl - s0)/ds; if (ds > 0.0) b = min(b, tl); else a = max(a, tl); }
    float Lq = max(b - a, 0.0);
    gemAbs = exp(-uSigma*Lq);
    gemLq = Lq;
    vec3 Lk = normalize(uKeyPos - vWorldPosition);
    float cone = smoothstep(uCosO, uCosI, dot(-Lk, uKeyDir));
    gemCone = cone;
    gemTop = exp(-max(uLvl - s0, 0.0)*7.0); // light comes in from above: brightest just under the surface
    // seen from above, through the glass, the surface catches a little light
    if (ds < 0.0 && a > t0 + 1e-4 && Lq > 0.0) gemGlow += mix(uCol, vec3(1.0), 0.6)*(0.01 + 0.07*cone);
    if (gl_FrontFacing) {
      float dl = s0 - uLvl;
      float w = fwidth(s0)*1.1 + 0.0012;
      float line = 1.0 - smoothstep(0.0, w, abs(dl - w*0.6));
      float band = 1.0 - smoothstep(0.0, w*1.8, abs(dl + w*2.0));
      gemGlow += mix(uCol, vec3(1.0), 0.5)*line*(0.06 + 0.55*cone);
      gemAbs *= 1.0 - 0.55*band;
    }
  }`;
const GEM_LIGHT = `
  if (gemLq > 0.0) {
    vec3 Lv = normalize((viewMatrix*vec4(uKeyPos - vWorldPosition, 0.0)).xyz);
    float ndl = max(dot(normal, Lv), 0.0);
    float dens = 1.0 - exp(-gemLq*4.5);
    gemGlow += uCol*dens*(uKeyCol*gemCone*(0.05 + 0.26*ndl)*(0.7 + 0.6*gemTop) + uRimCol*0.015 + vec3(0.01));
  }
  totalEmissiveRadiance += gemGlow;`;
function gemMaterial(geo) {
  const m = new THREE.MeshPhysicalMaterial(GLASS);
  const u = (m.userData.u = {
    ...LIGHT_UNIFORMS,
    uPl: { value: facePlanes(geo) }, uCamL: { value: new THREE.Vector3() }, uUpL: { value: new THREE.Vector3(0, 1, 0) },
    uLvl: { value: -9 }, uCol: { value: new THREE.Color() }, uSigma: { value: new THREE.Vector3() },
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GEM_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + GEM_MAIN)
      .replace('#include <transmission_fragment>', THREE.ShaderChunk.transmission_fragment.replace(
        'totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );',
        'transmitted.rgb *= gemAbs;\n\ttotalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );'))
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GEM_LIGHT);
  };
  m.customProgramCacheKey = () => 'gem';
  return m;
}

// What quartz shows in the dark: light caught inside it where the sun reaches, a milky root, faint veils,
// and a cool line along the edges from the cave behind. Drawn over the glass, additive. Under a crystal's
// liquid the light it catches takes the liquid's colour; a crystal with something open has a faintly tinted root.
const glintU = { value: 0 }; // 0 at rest, up to 1 as the spin gets wild: the light caught inside flashes harder
function quartzMat() {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...LIGHT_UNIFORMS, uUpL: { value: new THREE.Vector3(0, 1, 0) }, uLvl: { value: -9 },
      uCol: { value: new THREE.Color(1, 1, 1) }, uHas: { value: 0 }, uGlint: glintU,
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `attribute vec3 aBary; varying vec3 vN; varying vec3 vW; varying vec3 vO; varying float vV; varying vec3 vB; varying vec3 vNL;
      void main(){
        vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal);
        vO = position; vV = uv.y; vB = aBary; vNL = normal;
        gl_Position = projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: `${NOISE}
      uniform vec3 uKeyPos; uniform vec3 uKeyDir; uniform vec3 uKeyCol; uniform float uCosO; uniform float uCosI;
      uniform vec3 uRimDir; uniform vec3 uRimCol; uniform vec3 uUpL; uniform float uLvl; uniform vec3 uCol; uniform float uHas;
      uniform float uGlint;
      varying vec3 vN; varying vec3 vW; varying vec3 vO; varying float vV; varying vec3 vB; varying vec3 vNL;
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
        float inL = step(dot(vO, uUpL), uLvl);
        vec3 tint = mix(vec3(1.0), uCol*1.5, max(inL, uHas*0.5*milk));
        vec3 c = uKeyCol*lit*(0.07 + 0.3*veil + 0.55*milk*(1.0 - 0.7*inL))*tint + uRimCol*edge*0.3 + uRimCol*0.012;
        // the sharp edges between faces catch a thin line of light
        float e = min(min(vB.x, vB.y), vB.z);
        float ew = fwidth(e);
        float line = 1.0 - smoothstep(ew*0.35, ew*1.3, e);
        c += (uKeyCol*cone*(0.025 + 0.14*max(dot(N, L), 0.0))*(1.0 + 2.5*uGlint) + uRimCol*0.012)*line*tint;
        // fine growth steps across the prism faces, seen where the light grazes them
        float prism = 1.0 - smoothstep(0.2, 0.4, abs(normalize(vNL).y));
        float sy = vO.y*150.0 + snoise(vO*vec3(4.0, 0.6, 4.0))*3.0;
        float st = smoothstep(0.75, 1.0, sin(sy))*(1.0 - smoothstep(0.4, 1.2, fwidth(sy)));
        c += uKeyCol*lit*st*prism*0.025*tint;
        // light that got inside and bounced off a far face: glints that come and go as the stone turns
        if (!gl_FrontFacing) {
          float g = pow(max(dot(N, normalize(L + V)), 0.0), mix(90.0, 40.0, uGlint));
          c += uKeyCol*cone*g*(0.9 + 3.0*uGlint)*tint;
        }
        gl_FragColor = vec4(c*(gl_FrontFacing ? 0.7 : 1.0), 1.0);
      }`,
  });
}
const quartzLight = quartzMat();

// the liquid where it has run out of a full crystal: dark and glossy, a little light scattered inside it
function liquidMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.8,
    transparent: true, // kept out of what the glass refracts: a run seen through another crystal reads as a flaw in it
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
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

const probeMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
function stoneTris(keep) {
  const g = boulder.geometry, pos = g.attributes.position, idx = g.index;
  const out = [], a = new THREE.Vector3();
  const n = idx ? idx.count : pos.count;
  for (let i = 0; i < n; i += 3) {
    let near = false;
    for (let j = 0; j < 3 && !near; j++) { a.fromBufferAttribute(pos, idx ? idx.getX(i + j) : i + j); near = keep(a.x, a.z); }
    if (!near) continue;
    for (let j = 0; j < 3; j++) { a.fromBufferAttribute(pos, idx ? idx.getX(i + j) : i + j); out.push(a.x, a.y, a.z); }
  }
  if (!out.length) return null;
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  const m = new THREE.Mesh(pg, probeMat);
  m.matrixAutoUpdate = false;
  m.matrixWorld.copy(boulder.matrix); // casts happen in table space
  return m;
}
function stonePatch(centerT, rad) {
  boulder.updateMatrix();
  const c = centerT.clone().applyMatrix4(boulder.matrix.clone().invert()), r2 = rad * rad;
  return stoneTris((x, z) => (x - c.x) ** 2 + (z - c.z) ** 2 < r2);
}
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

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
    this.spin = new THREE.Group();
    this.spin.rotation.y = rng(seed * 7)() * Math.PI * 2;
    this.group.add(this.spin);
    const g = crystalGeometry(this.c);
    this.gem = gemMaterial(g); this.u = this.gem.userData.u;
    this.glass = new THREE.Mesh(g, this.gem);
    this.glass.castShadow = true; this.glass.receiveShadow = true;
    this.qm = quartzMat();
    this.shine = new THREE.Mesh(g, this.qm);
    this.shine.renderOrder = 4;
    this.spin.add(this.glass, this.shine);
    table.add(this.group);
    table.updateMatrixWorld(true);
    this.top = h + tip; this.lean = lean;

    // World up in the crystal's own frame. The table only turns about the vertical, so it never changes.
    this.spin.getWorldQuaternion(_q);
    const upL = UP.clone().applyQuaternion(_q.invert());
    this.u.uUpL.value.copy(upL); this.qm.uniforms.uUpL.value.copy(upL);
    // The level runs from the lowest point where the crystal leaves the stone to its highest point.
    const p = g.attributes.position;
    let hi = -Infinity, apexY = -Infinity;
    for (let k = 0; k < p.count; k++) { _v.fromBufferAttribute(p, k); hi = Math.max(hi, _v.dot(upL)); apexY = Math.max(apexY, _v.y); }
    for (let k = 0; k < p.count; k++) { _v.fromBufferAttribute(p, k); if (_v.y >= apexY - 1e-6) this.apexT = table.worldToLocal(this.spin.localToWorld(_v.clone())); }
    this.lo = -r * 0.95 * Math.hypot(upL.x, upL.z);
    this.hi = hi + 0.003;
    this.apexY = apexY;
    this.fill = 0; this.fillVel = 0; this.target = 0;
    this.done = 0; this.total = 0; this.leakK = 0; this.leak = null;
  }
  setData(a) {
    const col = hex(a.color);
    this.u.uCol.value.copy(col);
    // absorption per unit length: deep enough that a full column reads the aspect's colour, dark and clear
    this.u.uSigma.value.set(-Math.log(Math.max(col.r, 0.015)), -Math.log(Math.max(col.g, 0.015)), -Math.log(Math.max(col.b, 0.015))).multiplyScalar(5.5).addScalar(1.2);
    this.qm.uniforms.uCol.value.copy(col);
    this.qm.uniforms.uHas.value = a.total > 0 ? 1 : 0;
    this.done = a.done; this.total = a.total;
    this.target = a.total > 0 ? clamp01(a.done / a.total) : 0;
    if (state.reduce || !this.started) { this.fill = this.target; this.fillVel = 0; }
    this.started = true;
    if (this.leak) this.tintLeak();
  }
  tintLeak() {
    const col = this.u.uCol.value;
    // a run and drops: glossy, mostly seen by the light they catch; the pool: thin, the stone shows through it
    const { mat, pmat } = this.leak;
    mat.color.copy(col).multiplyScalar(0.65); mat.emissive.copy(col).multiplyScalar(0.03); mat.opacity = 0.88;
    if (pmat) { pmat.color.copy(col).multiplyScalar(0.42); pmat.emissive.copy(col).multiplyScalar(0.02); pmat.opacity = 0.74; pmat.envMapIntensity = 2.6; }
  }
  // A full crystal overflows: a thin run of liquid from the tip down its lowest face, drops sliding down it, and
  // a small pool on the stone at its foot.
  buildLeak() {
    const { r, seed } = this.c, upL = this.u.uUpL.value;
    const dd = new THREE.Vector3(-upL.x, 0, -upL.z);
    if (dd.lengthSq() < 1e-6) dd.set(0, 0, 1);
    dd.normalize();
    const side = new THREE.Vector3().crossVectors(UP, dd).normalize();
    const probe = new THREE.Mesh(this.glass.geometry, probeMat);
    probe.updateMatrixWorld(true);
    const rc = new THREE.Raycaster(), pts = [], wig = rng(seed * 13);
    const ph = wig() * 6.28, n = 26;
    for (let k = 0; k <= n; k++) {
      const y = this.apexY - 0.012 - (this.apexY + 0.01) * (k / n);
      const o = dd.clone().multiplyScalar(r * 3).addScaledVector(side, Math.sin(y * 5 + ph) * r * 0.07);
      o.y = y;
      rc.set(o, dd.clone().negate());
      const hit = rc.intersectObject(probe, false)[0];
      if (!hit) continue;
      pts.push(hit.point.addScaledVector(hit.face.normal, 0.0035));
    }
    if (pts.length < 4) { this.leak = false; return; }
    const curve = new THREE.CatmullRomCurve3(pts);
    const segs = 80, radial = 6;
    const tubeGeo = new THREE.TubeGeometry(curve, segs, 0.0075, radial, false);
    // thin at the tip, fuller where it has gathered lower down
    const tp = tubeGeo.attributes.position, c = new THREE.Vector3();
    for (let k = 0; k < tp.count; k++) {
      const ring = Math.floor(k / (radial + 1)), u = ring / segs;
      curve.getPointAt(u, c);
      _v.fromBufferAttribute(tp, k).sub(c).multiplyScalar(0.5 + 0.7 * u).add(c);
      tp.setXYZ(k, _v.x, _v.y, _v.z);
    }
    tubeGeo.computeVertexNormals();
    const mat = liquidMaterial();
    const tube = new THREE.Mesh(tubeGeo, mat);
    this.spin.add(tube);
    const beadGeo = new THREE.SphereGeometry(1, 14, 10);
    const beads = [0, 1, 2].map(() => { const b = new THREE.Mesh(beadGeo, mat); b.visible = false; this.spin.add(b); return b; });
    // the pool: where the run ends, spread over the stone in front of the crystal's foot
    table.updateMatrixWorld(true);
    const endL = pts[pts.length - 1];
    const end = table.worldToLocal(this.spin.localToWorld(endL.clone()));
    const away = table.worldToLocal(this.spin.localToWorld(endL.clone().addScaledVector(dd, 0.1))).sub(end);
    away.y = 0; away.normalize();
    const across = new THREE.Vector3(-away.z, 0, away.x);
    const c0 = end.clone().addScaledVector(away, 0.05);
    const R = 0.1 + r * 0.22;
    const stone = stonePatch(c0, R * 2.2);
    let puddle = null, pmat = null;
    if (stone) {
      const pg = new THREE.RingGeometry(0, 1, 36, 6);
      const pp = pg.attributes.position, grow = new Float32Array(pp.count), pr = rng(seed * 29), ph2 = pr() * 6.28;
      const P = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0), rc2 = new THREE.Raycaster();
      for (let k = 0; k < pp.count; k++) {
        const x = pp.getX(k), y = pp.getY(k), a = Math.atan2(y, x);
        const s = 0.74 + 0.2 * Math.sin(a * 3 + ph2) + 0.1 * Math.sin(a * 7 + ph2 * 2);
        // it runs further away from the crystal than back toward it
        P.copy(c0).addScaledVector(across, x * s * R).addScaledVector(away, y * s * R * (y > 0 ? 1.4 : 0.7));
        P.y = 3;
        rc2.set(P, down);
        const h = rc2.intersectObject(stone, false)[0];
        if (h) P.copy(h.point); else P.y = c0.y;
        pp.setXYZ(k, P.x, P.y + 0.004, P.z);
        grow[k] = Math.hypot(x, y);
      }
      pg.setAttribute('aR', new THREE.BufferAttribute(grow, 1));
      pg.computeVertexNormals();
      pmat = liquidMaterial();
      const g = (pmat.userData.grow = { value: 0 });
      pmat.onBeforeCompile = (sh) => {
        sh.uniforms.uGrow = g;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aR; varying float vR;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvR = aR;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uGrow; varying float vR;')
          .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vR > uGrow) discard;');
      };
      pmat.customProgramCacheKey = () => 'pool';
      puddle = new THREE.Mesh(pg, pmat);
      puddle.receiveShadow = true;
      puddle.visible = false;
      table.add(puddle);
    }
    this.leak = { curve, tube, segs, ringIdx: radial * 6, beads, puddle, mat, pmat };
    this.tintLeak();
  }
  update(dt, t) {
    // rises toward its share with a soft settle; falls back if a task is undone
    this.fillVel += ((this.target - this.fill) * 26 - this.fillVel * 8.5) * dt;
    this.fill += this.fillVel * dt;
    const f = clamp01(this.fill);
    const lvl = f > 0.0005 ? this.lo + (this.hi - this.lo) * f : -9;
    this.u.uLvl.value = lvl; this.qm.uniforms.uLvl.value = lvl;
    this.glass.worldToLocal(this.u.uCamL.value.copy(camera.position));

    const full = this.total > 0 && this.done >= this.total && f > 0.985;
    this.leakK = full ? Math.min(1, this.leakK + dt / (state.reduce ? 0.01 : 3.2)) : Math.max(0, this.leakK - dt / 0.6);
    if (this.leakK > 0 && this.leak === null) this.buildLeak();
    const L = this.leak;
    if (!L) return;
    const k = this.leakK;
    L.tube.visible = k > 0.001;
    L.tube.geometry.setDrawRange(0, Math.floor(clamp01(k * 1.6) * L.segs) * L.ringIdx);
    if (L.puddle) {
      const g = sstep(0.35, 1, k);
      L.puddle.visible = g > 0.001;
      L.pmat.userData.grow.value = g;
    }
    L.beads.forEach((b, j) => {
      if (k < 0.95 || state.reduce) { b.visible = false; return; }
      const ph = (t * 0.22 + j / L.beads.length) % 1;
      const u = ph * ph; // they gather slowly near the tip, then slide faster
      L.curve.getPointAt(u, b.position);
      L.curve.getTangentAt(u, _v);
      b.quaternion.setFromUnitVectors(UP, _v);
      const sz = (0.016 + 0.004 * Math.sin(j * 2.3 + 1)) * sstep(0, 0.08, u) * (1 - sstep(0.9, 1, u));
      b.visible = sz > 0.0003;
      b.scale.set(sz, sz * 1.5, sz);
    });
  }
}
const crystals = LAYOUT.map((L, i) => new Crystal(i, L));

// A star of light on a crystal's tip each time it swings through the angle where it throws the sun at you. A
// fast spin sweeps every tip past it several times a second, so the whole cluster sparkles.
const sparkle = (() => {
  const N = crystals.length, pos = new Float32Array(N * 3), amp = new Float32Array(N);
  crystals.forEach((c, i) => { _v.copy(c.apexT); _v.y += 0.015; pos.set([_v.x, _v.y, _v.z], i * 3); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aAmp', new THREE.BufferAttribute(amp, 1).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.ShaderMaterial({
    uniforms: { uDpr: { value: PX } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute float aAmp; uniform float uDpr; varying float vA;
      void main(){
        vA = aAmp;
        vec4 mv = modelViewMatrix*vec4(position, 1.0);
        gl_PointSize = aAmp > 0.003 ? (14.0 + 34.0*aAmp)*uDpr*(6.0/-mv.z) : 0.0;
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `varying float vA;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float ray = max(0.0, 1.0 - abs(c.x)*26.0)*max(0.0, 1.0 - abs(c.y)*2.0) + max(0.0, 1.0 - abs(c.y)*26.0)*max(0.0, 1.0 - abs(c.x)*2.0);
        float core = exp(-dot(c, c)*90.0);
        gl_FragColor = vec4(vec3(1.0, 0.9, 0.76)*(ray*0.8 + core*1.4)*vA, 1.0);
      }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false; pts.renderOrder = 5;
  table.add(pts);
  const prev = new Float32Array(N).fill(NaN), A = new Float32Array(N);
  const AT = -0.62; // where a tip catches the sun for you, round from the front
  return (dt, gain) => {
    for (let i = 0; i < N; i++) {
      const now = crystals[i].az + turn.angle, was = Number.isNaN(prev[i]) ? now : prev[i];
      prev[i] = now;
      // did it sweep through the angle this frame? then a full flash; else how near it came
      const lo = Math.min(now, was), hi = Math.max(now, was);
      const k = Math.ceil((lo - AT) / (Math.PI * 2)), at = AT + k * Math.PI * 2;
      const near = Math.pow(Math.max(0, Math.cos(Math.min(Math.abs(wrap(now - AT)), Math.abs(wrap(was - AT))))), 70);
      A[i] = Math.max(A[i] * Math.exp(-dt * 16), (at <= hi ? 1 : near) * gain);
      amp[i] = A[i];
    }
    g.attributes.aAmp.needsUpdate = true;
  };
})();

// Many small crystals packed between and around the nine, merged into one mesh. Each holds the liquid of the
// nearest of the nine, filled to the same share and levelled the same way, so every aspect's side of the stone
// echoes it; around an aspect with nothing open they stay clear.
const druseU = {
  uDCol: { value: ASPECTS.map(() => new THREE.Color()) },
  uDSig: { value: ASPECTS.map(() => new THREE.Vector3()) },
  uDFill: { value: ASPECTS.map(() => 0) },
};
const TRANSMISSION_ABS = THREE.ShaderChunk.transmission_fragment.replace(
  'totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );',
  'transmitted.rgb *= gemAbs;\n\ttotalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );');
function druseMaterial() {
  const m = new THREE.MeshPhysicalMaterial(GLASS);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, LIGHT_UNIFORMS, druseU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aAsp; attribute float aLo; attribute float aHi; attribute float aRad;
        uniform vec3 uDCol[${ASPECTS.length}]; uniform vec3 uDSig[${ASPECTS.length}]; uniform float uDFill[${ASPECTS.length}];
        varying float vS; varying float vFill; varying vec3 vDCol; varying vec3 vDSig; varying float vRad;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        int ai = int(aAsp + 0.5);
        vS = (transformed.y - aLo)/max(aHi - aLo, 1e-3);
        vFill = uDFill[ai]; vDCol = uDCol[ai]; vDSig = uDSig[ai]; vRad = aRad;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uKeyPos; uniform vec3 uKeyDir; uniform vec3 uKeyCol; uniform float uCosO; uniform float uCosI;
        varying float vS; varying float vFill; varying vec3 vDCol; varying vec3 vDSig; varying float vRad;
        vec3 gemAbs = vec3(1.0); vec3 gemGlow = vec3(0.0);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vFill > 0.0005) {
          float w = fwidth(vS) + 1e-4;
          float inL = 1.0 - smoothstep(-w, w, vS - vFill);
          gemAbs = mix(vec3(1.0), exp(-vDSig*vRad*1.8), inL);
          vec3 Lk = normalize(uKeyPos - vWorldPosition);
          float cone = smoothstep(uCosO, uCosI, dot(-Lk, uKeyDir));
          gemGlow = vDCol*inL*(uKeyCol*cone*0.12 + vec3(0.01));
          float line = 1.0 - smoothstep(0.0, w*1.4, abs(vS - vFill - w*0.7));
          gemGlow += mix(vDCol, vec3(1.0), 0.5)*line*(0.03 + 0.35*cone)*step(vFill, 0.995);
        }`)
      .replace('#include <transmission_fragment>', TRANSMISSION_ABS)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gemGlow;');
  };
  m.customProgramCacheKey = () => 'druse';
  return m;
}
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
    const at = new THREE.Vector3(x, surfaceY(x, z) + 0.01, z);
    m4.compose(at, q.multiply(qs), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m4);
    // which of the nine it sits by, and the heights its liquid runs between
    let asp = 0, bd = Infinity;
    bases.forEach((b, i) => { const d = Math.hypot(b.x - x, b.z - z) - b.r; if (d < bd) { bd = d; asp = i; } });
    const pa = g.attributes.position, n = pa.count;
    let hi = -Infinity;
    for (let k = 0; k < n; k++) hi = Math.max(hi, pa.getY(k));
    const fill = (v) => new THREE.Float32BufferAttribute(new Float32Array(n).fill(v), 1);
    g.setAttribute('aAsp', fill(asp)); g.setAttribute('aLo', fill(at.y - 0.004)); g.setAttribute('aHi', fill(hi)); g.setAttribute('aRad', fill(sr));
    parts.push(g);
  }
  const geo = mergeGeometries(parts);
  const druse = new THREE.Mesh(geo, druseMaterial());
  druse.castShadow = true; druse.receiveShadow = true;
  const shine = new THREE.Mesh(geo, quartzLight); shine.renderOrder = 4;
  table.add(druse, shine);
}
function updateDruse() {
  crystals.forEach((c, i) => {
    druseU.uDCol.value[i].copy(c.u.uCol.value);
    druseU.uDSig.value[i].copy(c.u.uSigma.value);
    druseU.uDFill.value[i] = c.total > 0 ? clamp01(c.fill) : 0;
  });
}

// Water seeps through the crack the light comes in by: now and then a drop falls through the shaft, catching
// the sun, and breaks on the stone.
const drip = { t: 0, next: 2.5, falling: false, y0: 2.2, land: new THREE.Vector3(), x: -0.6, z: 0.34 };
{
  const rho = Math.hypot(drip.x, drip.z);
  drip.ring = stoneTris((x, z) => Math.abs(Math.hypot(x, z) - rho) < 0.08);
  const mat = new THREE.MeshStandardMaterial({ color: hex('#D8E0E8'), roughness: 0.04, metalness: 0, envMapIntensity: 3, emissive: hex('#2A3038') });
  const g = new THREE.SphereGeometry(1, 10, 8);
  drip.drop = new THREE.Mesh(g, mat); drip.drop.visible = false; scene.add(drip.drop);
  drip.bits = [0, 1, 2, 3, 4].map(() => { const b = new THREE.Mesh(g, mat); b.visible = false; scene.add(b); return { m: b, v: new THREE.Vector3() }; });
}
function updateDrip(dt) {
  if (state.reduce) { drip.drop.visible = false; drip.bits.forEach((b) => (b.m.visible = false)); return; }
  drip.t += dt;
  if (!drip.falling && drip.t > drip.next) {
    // where it will land: the stone below, wherever it has turned to
    const a = -table.rotation.y, c = Math.cos(a), s = Math.sin(a);
    const lx = drip.x * c + drip.z * s, lz = -drip.x * s + drip.z * c;
    let y = -0.2;
    if (drip.ring) {
      ray.set(new THREE.Vector3(lx, 3, lz), new THREE.Vector3(0, -1, 0));
      const h = ray.intersectObject(drip.ring, false)[0];
      if (h) y = h.point.y;
    }
    drip.land.set(drip.x, y, drip.z);
    drip.falling = true; drip.t = 0; drip.v = 0;
    drip.drop.position.set(drip.x, drip.y0, drip.z); drip.drop.visible = true;
  }
  if (drip.falling) {
    drip.v += 9.8 * dt;
    drip.drop.position.y -= drip.v * dt;
    drip.drop.scale.set(0.009, 0.009 * (1.4 + drip.v * 0.35), 0.009);
    if (drip.drop.position.y <= drip.land.y) {
      drip.falling = false; drip.drop.visible = false; drip.t = 0; drip.next = 3.5 + Math.random() * 4.5;
      drip.bits.forEach((b) => {
        const a = Math.random() * 6.28, sp = 0.25 + Math.random() * 0.35;
        b.m.position.copy(drip.land).y += 0.01;
        b.v.set(Math.cos(a) * sp, 0.6 + Math.random() * 0.7, Math.sin(a) * sp);
        b.m.visible = true; b.life = 0.3 + Math.random() * 0.2; b.age = 0;
      });
    }
  }
  drip.bits.forEach((b) => {
    if (!b.m.visible) return;
    b.age += dt; b.v.y -= 9.8 * dt;
    b.m.position.addScaledVector(b.v, dt);
    const k = 1 - b.age / b.life;
    if (k <= 0) { b.m.visible = false; return; }
    b.m.scale.setScalar(0.0045 * k);
  });
}

// ── post: the fog, a little bloom on real highlights, ACES, vignette, and the fade into the app ──────────────────────
// the scene's depth is kept, for the fog to stop at
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(1, 1) });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(fog.march);
composer.addPass(fog.composite);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.5, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uBg: { value: new THREE.Vector3() }, uBgTop: { value: new THREE.Vector3() }, uBgStop: { value: 1 },
    uFade: { value: 0 }, uFadeStart: { value: 0.78 }, uAspect: { value: 1 }, uTop: { value: 0.24 },
    uBlur: { value: 0 }, uBlurC: { value: new THREE.Vector2(0.5, 0.6) }, uBlurR: { value: new THREE.Vector2(0.4, 0.3) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 uBg; uniform vec3 uBgTop; uniform float uBgStop; uniform float uFade;
    uniform float uFadeStart; uniform float uAspect; uniform float uTop; uniform float uBlur; uniform vec2 uBlurC; uniform vec2 uBlurR;
    varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // spinning fast, the stone and its crystals smear sideways, most down the middle where they move across
      // the view, least at the sides where they turn toward or away from you
      if (uBlur > 0.0005) {
        vec2 q = (vUv - uBlurC)/uBlurR;
        float L = uBlur*smoothstep(1.0, 0.45, length(q))*sqrt(max(0.0, 1.0 - q.x*q.x*0.8));
        if (L > 0.0008) {
          float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)))*43758.5453);
          vec3 acc = vec3(0.0);
          for (int i = 0; i < 9; i++) acc += texture2D(tDiffuse, vUv + vec2(((float(i) + j)/9.0 - 0.5)*L, 0.0)).rgb;
          c = acc/9.0;
        }
      }
      float y = 1.0 - vUv.y; // 0 at the top
      vec3 bg = mix(uBgTop, uBg, clamp(y/uBgStop, 0.0, 1.0)); // the app background behind this row
      vec2 q = vUv - vec2(0.5, 0.5); q.x *= uAspect;
      c *= mix(0.5, 1.0, smoothstep(0.95, 0.22, length(q)));
      c = mix(bg, c, uFade);
      c = mix(c, bg, smoothstep(uFadeStart, 1.0, y));
      c = mix(bg, c, smoothstep(uTop*0.3, uTop + 0.03, y));     // melts away under the status bar and top bar
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

const plants = createPlants({ scene, camera, haptic: (k) => toApp({ t: 'haptic', k }), reduce: () => state.reduce, sunFrom, sunColor: '#FFD7AE', px: PX });

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
  // Aim, then measure where every tip lands on screen with each crystal turned to the front (the near ones sit
  // higher than their height says), and pull back until the highest is clear of the top bar.
  const fTop = state.topFrac + 0.05, fBase = 0.79, yBase = 0.02, tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  let yTop = TIP_Y + 0.05;
  for (let k = 0; k < 4; k++) {
    const V = (yTop - yBase) / (fBase - fTop);
    const d = V / (2 * tan);
    const cy = yTop - (0.5 - fTop) * V;
    camLook.set(0, cy, 0);
    camBase.set(0, cy + d * Math.sin(PITCH), d * Math.cos(PITCH));
    camera.position.copy(camBase); camera.lookAt(camLook);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    let high = 1;
    for (const front of crystals) {
      for (const c of crystals) {
        const s = 0.5 - 0.5 * _v.copy(c.apexT).applyAxisAngle(UP, -front.az).project(camera).y;
        high = Math.min(high, s);
      }
    }
    if (high >= fTop - 0.003) break;
    yTop += (fTop - high) * V * 1.05;
  }
  // corner rocks: just inside the frame's top corners, about three units in front of the camera
  const D = 3.0, hh = D * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), hw = hh * camera.aspect;
  for (const m of corners) {
    const side = m.userData.side;
    m.position.set(side * (hw + 0.2), hh * 0.74, -D).applyMatrix4(camera.matrixWorld);
  }
  mouth.position.set(0, 0.3, 0.2).applyMatrix4(camera.matrixWorld);
  fog.resize(W, H, DPR);
  plants.place(state.topFrac, W, H);
  zonesSent = '';
  // where the stone and its crystals sit on screen, for the blur of a fast spin
  _v.set(0, -0.05, 0).project(camera);
  const wy = 2 * camera.position.distanceTo(camLook) * tan;
  grade.uniforms.uBlurC.value.set((_v.x + 1) / 2, (_v.y + 1) / 2);
  grade.uniforms.uBlurR.value.set(1.2 / (wy * camera.aspect), 0.95 / wy);
}

// ── turning: a drag turns the boulder with real weight; let go and it coasts, slowing as stone on stone would.
// Flick it again while it spins and the flicks add up, until it is a blur and the fog goes up and out of the cave.
// Once it has slowed it eases one crystal round to face you. While it spins fast the app hides the name and gets
// haptic ticks instead, quicker and harder as it speeds up.
const turn = { angle: 0, vel: 0, dragging: false, last: 0, moved: false, front: -1, free: 0, fv: 0, w: 0, speed: 0, prev: 0, fast: false, passF: -1, buzz: 0 };
const R_TURN = 1.0; // a drag of this many world units turns it one radian
const W_MAX = 48, W_FAST = 6, W_SLOW = 4.5;
function frontIndex() {
  let best = 0, bd = Infinity;
  crystals.forEach((c, i) => { const d = Math.abs(wrap(c.az + turn.angle)); if (d < bd) { bd = d; best = i; } });
  return best;
}
function setAngle(a) { turn.angle = turn.prev = a; turn.vel = turn.free = turn.w = turn.speed = 0; }
function worldPerScreenX() {
  const d = camera.position.distanceTo(camLook);
  return 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect;
}
function down() {
  // the finger lands on it: what it was doing carries on under the finger for a moment, so a flick adds to it
  turn.dragging = true; turn.moved = true; turn.free = turn.vel; turn.fv = 0; turn.last = performance.now();
  toApp({ t: 'grab' });
}
function move(dx) {
  if (!turn.dragging) return;
  const now = performance.now(), dt = Math.max(1, now - turn.last) / 1000;
  const dA = (dx * worldPerScreenX()) / R_TURN;
  turn.angle += dA;
  turn.fv = lerp(turn.fv, dA / dt, 0.5);
  turn.last = now;
}
function up(vx) {
  if (!turn.dragging) return;
  const since = performance.now() - turn.last;
  let vf = 0;
  if (since < 80) vf = typeof vx === 'number' ? (vx * worldPerScreenX()) / R_TURN : turn.fv;
  turn.vel = THREE.MathUtils.clamp(turn.free + vf, -W_MAX, W_MAX);
  turn.dragging = false;
}
function buzz() {
  const now = performance.now(), a = turn.speed;
  if (now - turn.buzz < 1000 / 14) return;
  turn.buzz = now;
  toApp({ t: 'haptic', k: a > 30 ? 'rigid' : a > 18 ? 'medium' : a > 10 ? 'light' : 'tick' });
}
function updateTurn(dt) {
  if (turn.dragging) {
    // held: the spin it had dies away under the finger, fast if the finger is still
    const still = performance.now() - turn.last > 70;
    if (still) turn.fv *= Math.exp(-dt * 12);
    turn.free *= Math.exp(-dt * (still ? 8 : 1.4));
    turn.angle += turn.free * dt;
  } else {
    const a = Math.abs(turn.vel);
    if (a > 1.3) {
      // friction: grippy when slow, so an ordinary flick settles in a couple of seconds; it runs freer when fast,
      // so a wild spin lasts
      const dec = (0.7 + lerp(0.7, 0.14, sstep(6, 30, a)) * a) * dt;
      turn.vel = Math.sign(turn.vel) * Math.max(0, a - dec);
      turn.angle += turn.vel * dt;
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
  // how fast it is really turning, held or free
  const dA = turn.angle - turn.prev;
  turn.prev = turn.angle;
  turn.w = dA / Math.max(dt, 1e-3);
  turn.speed += (Math.abs(turn.w) - turn.speed) * (1 - Math.exp(-dt * 12));
  if (!turn.fast && turn.speed > W_FAST) { turn.fast = true; turn.front = -1; toApp({ t: 'facing', key: null }); }
  else if (turn.fast && turn.speed < W_SLOW) turn.fast = false;
  const f = frontIndex();
  if (f !== turn.passF) { turn.passF = f; if (turn.fast) buzz(); }
  if (!turn.fast && f !== turn.front) {
    turn.front = f;
    toApp({ t: 'facing', key: ASPECTS[f], tick: turn.moved });
  }
}

// ── plants: who gets a touch. The app asks the scene where the strands are (`plants` messages) and decides at the
// touch itself: on a strand it grabs the plant, anywhere else a sideways drag turns the stone and an up/down one
// scrolls the page. Standalone, the scene decides the same way.
let zonesAt = 0, zonesSent = '';
function sendZones(t) {
  if (t - zonesAt < 0.12) return;
  zonesAt = t;
  const z = plants.zones(), key = JSON.stringify(z);
  if (key === zonesSent) return;
  zonesSent = key;
  toApp({ t: 'plants', s: z });
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
        setAngle(-crystals[first < 0 ? 1 : first].az);
      }
      applyData();
    }
    if (m.bg) { state.bg = m.bg; if (m.bgTop) state.bgTop = m.bgTop; if (typeof m.bgStop === 'number') state.bgStop = m.bgStop; setBg(); }
    if (typeof m.topFrac === 'number' && m.topFrac !== state.topFrac) { state.topFrac = m.topFrac; frame(); }
  } else if (m.t === 'down') down();
  else if (m.t === 'move') move(m.dx);
  else if (m.t === 'up') up(m.vx);
  else if (m.t === 'pgrab') plants.grab(m.x, m.y);
  else if (m.t === 'pmove') plants.move(m.x, m.y);
  else if (m.t === 'prel') plants.release(m.vx, m.vy);
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
  // opened on its own (dev): drive it with the mouse or a finger directly. A press on a strand grabs it; any
  // other press turns the stone.
  let lx = null, lt = 0, v = 0, plant = false, px = 0, py = 0, pvx = 0, pvy = 0;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => {
    const x = e.clientX / innerWidth, y = e.clientY / innerHeight;
    try { el.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
    lt = performance.now();
    if (plants.grab(x, y)) { plant = true; px = x; py = y; pvx = pvy = 0; return; }
    lx = e.clientX; v = 0; down();
  });
  el.addEventListener('pointermove', (e) => {
    const now = performance.now(), ms = Math.max(1, now - lt);
    if (plant) {
      const x = e.clientX / innerWidth, y = e.clientY / innerHeight;
      pvx = lerp(pvx, (x - px) / ms * 1000, 0.6); pvy = lerp(pvy, (y - py) / ms * 1000, 0.6);
      px = x; py = y; lt = now; plants.move(x, y);
      return;
    }
    if (lx === null) return;
    const dx = (e.clientX - lx) / innerWidth;
    v = dx / ms * 1000; lx = e.clientX; lt = now; move(dx);
  });
  const end = () => {
    if (plant) { plant = false; const fresh = performance.now() - lt < 80; plants.release(fresh ? pvx : 0, fresh ? pvy : 0); return; }
    if (lx !== null) { up(v); lx = null; }
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  applyData();
  // dev handle for previews and screenshots
  window.heroDev = {
    turn, vortex, fog, plants, renderer, composer, state, down, move, up,
    spin: (w) => { turn.vel = w; turn.moved = true; },
    // pause the loop and step it by hand (for captures): tick(ms) advances the scene by that many milliseconds
    manual: () => { state.paused = true; },
    tick: (ms) => { tick(last + ms); },
  };
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
let last = performance.now(), t0 = last, reveal = 0, readySent = false, dustT = 0;
const back = new THREE.Vector3(), wind = { side: 0, up: 0, e: 0, lift: 0 };
function loop(now) {
  if (state.paused || document.hidden) return;
  tick(now);
  requestAnimationFrame(loop);
}
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = (now - t0) / 1000;
  if (scansIn) reveal = Math.min(1, reveal + dt / (state.reduce ? 0.3 : 1.4));
  const e = 1 - Math.pow(1 - reveal, 3);
  grade.uniforms.uFade.value = e;
  updateTurn(dt);
  updateVortex(dt, t);
  // a slow push-in on load, then the faintest drift, as if the camera is held by hand; a wild spin shakes it
  const drift = state.reduce ? 0 : 1;
  back.copy(camBase).sub(camLook).normalize();
  camera.position.copy(camBase).addScaledVector(back, (1 - e) * 0.6 * drift);
  camera.position.x += Math.sin(t * 0.21) * 0.03 * drift;
  camera.position.y += Math.sin(t * 0.17 + 1.0) * 0.02 * drift;
  const shake = 0.006 * vortex.lift * sstep(20, 40, turn.speed) * drift;
  if (shake > 0) { camera.position.x += noise3(t * 31, 0.3, 0) * shake; camera.position.y += noise3(0.7, t * 29, 0) * shake; }
  camera.lookAt(camLook);
  beamUniforms.uTime.value = t;
  // the dust in the shaft stirs as the stone whirls
  dustT += dt * (1 + 5 * vortex.e + 6 * vortex.lift) * drift;
  dustUniforms.uTime.value = dustT;
  for (const sp of hazeSprites) {
    const u = sp.userData, k = drift ? t : 0;
    sp.position.set(u.base.x + Math.sin(k * 0.05 + u.ph) * 0.25, u.base.y + Math.sin(k * 0.04 + u.ph * 2) * 0.1, u.base.z);
    sp.material.rotation += u.spin * dt * drift;
  }
  camera.updateMatrixWorld();
  table.updateMatrixWorld(true);
  for (const c of crystals) c.update(dt, t);
  updateDruse();
  updateDrip(dt);
  // feedback as it speeds up: glints, sparkles on the tips, a stronger bloom, the stone smearing sideways
  const g = state.reduce ? 0 : sstep(1.5, 30, turn.speed);
  glintU.value = g;
  sparkle(dt, turn.speed > 0.8 && !state.reduce ? 0.25 + 0.75 * g : 0);
  bloom.strength = 0.32 + 0.32 * g;
  grade.uniforms.uBlur.value = state.reduce ? 0 : Math.min(0.09, sstep(6, 14, turn.speed) * turn.speed * (0.42 / 90) / worldPerScreenX());
  // the stone's whirl blows the plants about, and the fog rushing up lifts them
  wind.e = vortex.e; wind.lift = vortex.lift;
  wind.side = THREE.MathUtils.clamp(vortex.w, -9, 9) * 0.35 * drift;
  wind.up = vortex.lift * 6.5 * drift;
  plants.update(dt, t, wind);
  sendZones(t);
  if (!state.reduce) {
    const sunK = 1 + 0.13 * noise3(t * 0.05, 1.7, 4.2);
    spot.intensity = 30 * sunK; scatter.intensity = 1.3 * sunK; beamUniforms.uStrength.value = 0.26 * sunK * (1 + 0.35 * g);
    LIGHT_UNIFORMS.uKeyCol.value.copy(SUN_COLOR).multiplyScalar(1.15 * sunK);
  }
  composer.render(dt);
  if (!readySent && scansIn) { readySent = true; toApp({ t: 'ready' }); }
}
requestAnimationFrame(loop);
