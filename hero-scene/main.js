// Today hero: three quartz crystals (Work, Self, People) growing out of a boulder in a cave, lit by a dawn sun
// through a gap in the rock. The liquid in each crystal is that family's share of today done; each third of a
// crystal's liquid is one aspect's colour, so turning a crystal shows its aspects one by one.
// Runs in a WebView (phone) or an iframe (web build). Messages: see recv() and toApp().
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

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
const KEYS = ['work', 'self', 'people'];
const state = {
  shares: { work: 0.5, self: 0.5, people: 0 },
  colors: {
    self: ['#FF8A5B', '#FFB547', '#FFD27A'],
    work: ['#3DDC97', '#62D96B', '#2EC4B6'],
    people: ['#FF7AB6', '#F472D0', '#B79CFF'],
  },
  bg: '#14161F',
  topFrac: 0.24,
  reduce: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  paused: false,
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
renderer.setPixelRatio(DPR);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = 0.6;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0b10, 0.035);
const camera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 0.1, 80);

// ── environment: what the crystal faces reflect. A dark cave with one warm opening. ─────────────────────────
const SUN_DIR = new THREE.Vector3(0.43, 0.89, 0.1).normalize();
{
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.SphereGeometry(10, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 vD;
        void main(){
          float up = vD.y;
          vec3 c = mix(vec3(0.010,0.012,0.016), vec3(0.030,0.040,0.060), smoothstep(-0.2, 0.9, up));
          c += vec3(0.05,0.03,0.02) * smoothstep(0.5, 1.0, dot(vD, normalize(vec3(0.0,0.2,-1.0))));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  ));
  const sun = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(18, 11, 6) }));
  sun.position.copy(SUN_DIR).multiplyScalar(9); sun.lookAt(0, 0, 0);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(12, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.55, 0.3) }));
  sky.position.set(0, 1.2, -9); sky.lookAt(0, 0, 0);
  const rim = new THREE.Mesh(new THREE.PlaneGeometry(2, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.1, 1.0) }));
  rim.position.set(-8, 2, 3); rim.lookAt(0, 0, 0);
  env.add(sun, sky, rim);
  const gr = rng(77);
  for (let i = 0; i < 14; i++) {
    const a = i < 6 ? Math.PI * (0.3 + gr() * 0.4) : gr() * Math.PI * 2, y = 0.25 + gr() * 0.8, k = 3 + gr() * 6;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.5 + gr(), 0.25 + gr() * 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k * 0.82, k * 0.66) }));
    panel.position.set(Math.cos(a) * 9, y * 9 - 2, Math.sin(a) * 9); panel.lookAt(0, 0, 0);
    env.add(panel);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.03).texture;
  pm.dispose();
}

// ── rock: displaced, then a procedural bump and colour in the shader so it reads as stone up close ─────────
function rockGeometry({ detail = 40, scale = [1, 1, 1], amp = 0.28, freq = 1.1, seed = 0, flatTop = null, sharp = 0.35 }) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let d = fbm(v.x * freq + seed, v.y * freq + seed * 0.7, v.z * freq - seed, 5);
    d += sharp * (0.5 - Math.abs(noise3(v.x * freq * 2.1 + seed * 3, v.y * freq * 2.1, v.z * freq * 2.1)));
    v.multiplyScalar(1 + amp * d);
    v.set(v.x * scale[0], v.y * scale[1], v.z * scale[2]);
    if (flatTop !== null && v.y > flatTop) v.y = flatTop + (v.y - flatTop) * 0.12;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function rockMaterial({ color = '#2B3036', bump = 0.9, freq = 3.2, env = 0.22, rough = 0.93 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: hex(color), roughness: rough, metalness: 0, envMapIntensity: env });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBump = { value: bump };
    sh.uniforms.uFreq = { value: freq };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockP;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvRockP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRockP; uniform float uBump; uniform float uFreq;
        ${NOISE}
        float rockH(vec3 p){
          float h = snoise(p)*0.55 + snoise(p*2.17)*0.27 + snoise(p*4.31)*0.12;
          return h;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float hh = rockH(vRockP*uFreq);
        float tone = snoise(vRockP*0.45)*0.5+0.5;
        float fine = snoise(vRockP*14.0)*0.5+0.5;
        diffuseColor.rgb *= mix(0.72, 1.12, tone) * mix(0.55, 1.05, smoothstep(-0.55, 0.35, hh)) * mix(0.92, 1.05, fine);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 dH = uBump * vec2(dFdx(hh), dFdy(hh));
          vec3 sp = -vViewPosition; vec3 sx = normalize(dFdx(sp)); vec3 sy = normalize(dFdy(sp));
          vec3 r1 = cross(sy, normal); vec3 r2 = cross(normal, sx);
          float det = dot(sx, r1) * faceDirection;
          vec3 gr = sign(det) * (dH.x * r1 + dH.y * r2);
          normal = normalize(abs(det) * normal - gr);
        }`);
  };
  return m;
}

function addRock(opts, mat, pos, rot = [0, 0, 0], { cast = false, receive = true } = {}) {
  const m = new THREE.Mesh(rockGeometry(opts), mat);
  m.position.set(...pos); m.rotation.set(...rot);
  m.castShadow = cast; m.receiveShadow = receive;
  scene.add(m);
  return m;
}

const stone = rockMaterial({ color: '#202429', bump: 2.2, freq: 4.6, rough: 0.88 });
const wallStone = rockMaterial({ color: '#2C3238', bump: 2.6, freq: 2.0, env: 0.15 });
const floorStone = rockMaterial({ color: '#22262C', bump: 2.0, freq: 2.8, env: 0.12 });

// the boulder the crystals grow out of: flat-ish on top
const ROCK_TOP = -0.12;
addRock({ detail: 56, scale: [1.5, 0.78, 1.15], amp: 0.22, freq: 1.25, seed: 4.2, flatTop: 0.6 }, stone, [0, ROCK_TOP - 0.6, 0], [0, 0.3, 0], { cast: true });
// a couple of loose stones beside it
addRock({ detail: 24, scale: [0.42, 0.26, 0.36], amp: 0.3, freq: 1.6, seed: 9.1 }, stone, [1.55, -1.05, 0.55], [0, 1.1, 0], { cast: true });
addRock({ detail: 20, scale: [0.26, 0.17, 0.24], amp: 0.3, freq: 1.8, seed: 2.7 }, stone, [-1.45, -1.12, 0.75], [0, 0.4, 0], { cast: true });

// cave floor
{
  const g = new THREE.PlaneGeometry(44, 44, 180, 180);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, fbm(x * 0.22, 0.5, z * 0.22, 5) * 0.9 + fbm(x * 1.3, 2.0, z * 1.3, 3) * 0.12);
  }
  g.computeVertexNormals();
  const floor = new THREE.Mesh(g, floorStone);
  floor.position.y = -1.25; floor.receiveShadow = true;
  scene.add(floor);
}

// the cave: near walls framing the boulder, an overhang, and the mouth behind it opening onto the dawn
addRock({ detail: 36, scale: [1.5, 4.4, 3.0], amp: 0.34, freq: 0.9, seed: 1.3 }, wallStone, [-3.3, 1.6, -0.6], [0, 0.25, 0.06]);
addRock({ detail: 36, scale: [1.6, 4.0, 3.0], amp: 0.34, freq: 0.95, seed: 5.6 }, wallStone, [3.4, 1.2, -1.2], [0, -0.3, -0.08]);
addRock({ detail: 32, scale: [2.2, 4.6, 2.4], amp: 0.36, freq: 1.0, seed: 8.8 }, wallStone, [-3.4, 1.4, -6.5], [0, 0.5, 0.1]);
addRock({ detail: 32, scale: [2.0, 3.4, 2.2], amp: 0.36, freq: 1.0, seed: 3.3 }, wallStone, [3.9, 0.6, -7.2], [0, -0.4, -0.1]);
addRock({ detail: 24, scale: [6.5, 1.1, 2.0], amp: 0.3, freq: 1.1, seed: 6.1 }, wallStone, [0.4, -1.2, -15.0]);
addRock({ detail: 32, scale: [2.6, 1.25, 1.4], amp: 0.34, freq: 1.2, seed: 12.4 }, wallStone, [-0.9, -0.55, -4.6], [0, 0.3, 0]);
addRock({ detail: 28, scale: [1.8, 0.9, 1.2], amp: 0.34, freq: 1.3, seed: 14.9 }, wallStone, [1.5, -0.75, -5.4], [0, -0.5, 0]);
addRock({ detail: 36, scale: [5.2, 1.6, 4.0], amp: 0.36, freq: 0.85, seed: 7.7 }, wallStone, [-1.8, 5.2, -3.2], [0.15, 0.2, -0.18]);

// sky beyond the cave mouth: dawn, the sun just over the horizon, right of centre
const SKY_SUN = new THREE.Vector2(0.6, 0.36);
{
  const m = new THREE.ShaderMaterial({
    fog: false, depthWrite: false,
    uniforms: { uSun: { value: SKY_SUN } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform vec2 uSun;
      void main(){
        vec3 top = vec3(0.02,0.035,0.075), mid = vec3(0.2,0.14,0.18), low = vec3(1.0,0.46,0.2);
        float y = vUv.y;
        vec3 c = mix(low, mid, smoothstep(0.26, 0.5, y));
        c = mix(c, top, smoothstep(0.45, 0.9, y));
        vec2 d = (vUv - uSun) * vec2(2.0, 1.0);
        float r = length(d);
        c += vec3(1.0,0.58,0.28) * (0.9*exp(-r*4.5));
        c += vec3(1.0,0.86,0.62) * (9.0*exp(-r*46.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(70, 34), m);
  sky.position.set(0, 3.5, -26);
  scene.add(sky);
}

// ── light ───────────────────────────────────────────────────────────────────────────────────────────────────
const SUN_COLOR = hex('#FFC992');
const sunFrom = new THREE.Vector3(2.5, 5.3, 0.9);
const sunTo = new THREE.Vector3(0.05, 0.75, 0.25);
const spot = new THREE.SpotLight(SUN_COLOR, 42, 0, 0.26, 0.85, 0);
spot.position.copy(sunFrom); spot.target.position.copy(sunTo);
spot.castShadow = true;
spot.shadow.mapSize.set(1024, 1024);
spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.02; spot.shadow.radius = 3;
spot.shadow.camera.near = 2; spot.shadow.camera.far = 14;
if ('intensity' in spot.shadow) spot.shadow.intensity = 0.75;
scene.add(spot, spot.target);
// cool skylight from the cave mouth, and a little bounce off the floor
scene.add(new THREE.HemisphereLight(hex('#3A4A66'), hex('#0B0C0F'), 0.35));
const rimLight = new THREE.DirectionalLight(hex('#E8B9A0'), 0.7);
rimLight.position.set(-1.5, 2.5, -6);
const fill = new THREE.DirectionalLight(hex('#8FA3C8'), 0.35);
fill.position.set(1, 2, 8);
scene.add(rimLight, fill);

// the shaft of light you can see in the dust
const beamUniforms = { uTime: { value: 0 }, uColor: { value: hex('#FFD3A0') }, uStrength: { value: 0.55 } };
{
  const dir = sunTo.clone().sub(sunFrom), len = dir.length() * 1.12;
  const g = new THREE.CylinderGeometry(0.38, 1.15, len, 48, 1, true);
  g.translate(0, -len / 2, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: beamUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vV = -mv.xyz; vN = normalMatrix*normal; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uTime; uniform vec3 uColor; uniform float uStrength;
      ${NOISE}
      void main(){
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float soft = pow(facing, 3.0);
        float along = vUv.y; // 1 at the opening, 0 at the floor
        float fall = smoothstep(0.0, 0.45, along) * mix(0.55, 1.0, along);
        float n = snoise(vec3(vUv.x*7.0, along*2.5 + uTime*0.04, uTime*0.06))*0.5 + 0.5;
        float streak = 0.45 + 0.55*n;
        gl_FragColor = vec4(uColor * soft * fall * streak * uStrength, 1.0);
      }`,
  });
  const beam = new THREE.Mesh(g, m);
  beam.position.copy(sunFrom);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
  beam.renderOrder = 2;
  scene.add(beam);
}

// dust drifting through the shaft
const dustUniforms = { uTime: { value: 0 }, uDpr: { value: DPR } };
{
  const N = 220, r = rng(42), pos = new Float32Array(N * 3), seed = new Float32Array(N);
  const dir = sunTo.clone().sub(sunFrom), len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const t = 0.25 + r() * 0.85, rad = lerp(0.38, 1.15, t) * Math.sqrt(r()) * 0.85, a = r() * Math.PI * 2;
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
        float t = uTime*0.12 + aSeed*40.0;
        p += vec3(sin(t*0.9)*0.06, sin(t*0.6 + 1.3)*0.08 - 0.02*sin(t*0.2), cos(t*0.7)*0.06);
        vec4 mv = modelViewMatrix*vec4(p,1.0);
        gl_PointSize = (1.0 + aSeed*1.8) * uDpr * (9.0 / -mv.z);
        vA = (0.35 + 0.65*(0.5+0.5*sin(uTime*(0.6+aSeed*1.7) + aSeed*31.0))) * (0.5 + aSeed*0.5);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c,c); float a = smoothstep(0.25, 0.0, d) * vA;
        gl_FragColor = vec4(vec3(1.0,0.86,0.66) * a * 1.6, 1.0); }`,
  });
  const dust = new THREE.Points(g, m);
  dust.renderOrder = 3;
  scene.add(dust);
}

// ── crystals ────────────────────────────────────────────────────────────────────────────────────────────────
const BASE = -0.28; // crystals start below the rock surface
function crystalGeometry({ r, h, tip, seed }) {
  const rand = rng(seed), N = 6, base = [], top = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + (rand() - 0.5) * 0.42;
    const rr = r * (0.82 + rand() * 0.34);
    base.push(new THREE.Vector3(Math.cos(a) * rr * 0.9, BASE, Math.sin(a) * rr * 0.9));
    top.push(new THREE.Vector3(Math.cos(a) * rr, h + (rand() - 0.5) * 0.16 * r / 0.3, Math.sin(a) * rr));
  }
  const apex = new THREE.Vector3((rand() - 0.5) * r * 0.6, h + tip * (0.85 + rand() * 0.3), (rand() - 0.5) * r * 0.6);
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

// fine growth lines across the prism faces, frosted near the root, clear at the tip
function striationTexture() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 512;
  const x = c.getContext('2d'), r = rng(9);
  for (let y = 0; y < 512; y++) {
    const v = 1 - y / 512;
    let rough = 0.05 + (r() < 0.12 ? r() * 0.12 : 0) + Math.max(0, 0.28 - v) * 1.6;
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
  transmission: 1, thickness: 0.45, ior: 1.54, dispersion: 1.2,
  attenuationColor: hex('#E6EEFF'), attenuationDistance: 3,
  specularIntensity: 1, specularColor: new THREE.Color(1.8, 1.8, 1.8), envMapIntensity: 2.4, side: THREE.DoubleSide,
});

function liquidMaterial(colors) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uC: { value: colors.map(hex) },
      uLevel: { value: -10 }, uTilt: { value: new THREE.Vector2() }, uCenter: { value: new THREE.Vector3() },
      uSwirl: { value: 0 }, uR2: { value: 0.03 }, uTime: { value: 0 }, uGlow: { value: 0.2 },
      uSun: { value: SUN_DIR.clone() }, uSunCol: { value: SUN_COLOR.clone() },
    },
    vertexShader: `varying vec3 vW; varying vec3 vN; varying float vAng;
      void main(){
        vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz;
        vN = normalize(mat3(modelMatrix)*normal);
        vAng = atan(position.z, position.x);
        gl_Position = projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: `${NOISE}
      uniform vec3 uC[3]; uniform float uLevel; uniform vec2 uTilt; uniform vec3 uCenter; uniform float uSwirl;
      uniform float uR2; uniform float uTime; uniform float uGlow; uniform vec3 uSun; uniform vec3 uSunCol;
      varying vec3 vW; varying vec3 vN; varying float vAng;
      vec3 pick(float i){ return i < 0.5 ? uC[0] : (i < 1.5 ? uC[1] : uC[2]); }
      // three sectors around the crystal, one per aspect; the borders swirl like liquids meeting
      vec3 aspect(float a, vec3 w){
        float s = mod(a + 6.2831853, 6.2831853) / 2.0943951 + snoise(w*2.6 + vec3(0.0, uTime*0.05, 0.0))*0.09;
        s = mod(s + 3.0, 3.0);
        float i = floor(s), f = fract(s);
        vec3 c0 = pick(i), c1 = pick(mod(i + 1.0, 3.0));
        return mix(c0, c1, smoothstep(0.72, 1.0, f));
      }
      void main(){
        vec2 d = vW.xz - uCenter.xz;
        float surf = uLevel + dot(d, uTilt) + uSwirl*(dot(d,d) - uR2) + 0.004*sin(uTime*1.7 + d.x*24.0 + d.y*17.0);
        if (vW.y > surf) discard;
        vec3 base = aspect(vAng, vW);
        vec3 V = normalize(cameraPosition - vW);
        vec3 col;
        if (gl_FrontFacing) {
          vec3 N = normalize(vN);
          float depth = clamp((surf - vW.y) / 1.1, 0.0, 1.0);
          float wrap = clamp(dot(N, uSun)*0.5 + 0.5, 0.0, 1.0);
          float fres = pow(1.0 - abs(dot(N, V)), 3.0);
          float thin = pow(1.0 - abs(dot(N, V)), 1.6);
          vec3 deep = base * 0.3, lite = mix(base, vec3(1.0), 0.12) * 1.05;
          float side = clamp(dot(N, normalize(vec3(0.75, 0.25, 0.6))), 0.0, 1.0);
          float caustic = snoise(vec3(vW.x*7.0, vW.y*5.0 - uTime*0.35, vW.z*7.0 + uTime*0.2))*0.5 + 0.5;
          col = mix(deep, lite, thin) * (0.3 + 0.55*side + 0.3*wrap) * mix(1.0, 0.32, depth);
          col *= 0.85 + 0.35*caustic*caustic;
          col += base * uGlow * mix(1.0, 0.45, depth);
          vec3 H = normalize(uSun + V);
          col += uSunCol * pow(max(dot(N, H), 0.0), 40.0) * 0.6;
          col += mix(base, vec3(1.0), 0.4) * fres * 0.45;
          col += base * smoothstep(0.03, 0.0, surf - vW.y) * 1.1; // meniscus
        } else {
          // the surface, seen through the near wall: lit from above, a soft sheen toward the sun
          float sheen = pow(clamp(dot(reflect(-V, vec3(0.0,1.0,0.0)), uSun), 0.0, 1.0), 12.0);
          col = mix(base, vec3(1.0), 0.22) * (0.95 + uGlow*1.5) + uSunCol * sheen * 0.8;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function bubbles(c, u) {
  const N = 22, r = rng(c.seed * 3 + 1), pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * c.r * 0.55;
    pos.set([Math.cos(a) * rad, r(), Math.sin(a) * rad], i * 3);
    seed[i] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: u.uTime, uLevel: u.uLevel, uH: { value: c.h + c.tip * 0.3 }, uDpr: { value: DPR } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute float aSeed; uniform float uTime; uniform float uH; uniform float uDpr; varying float vY; varying float vA;
      void main(){
        float speed = 0.06 + aSeed*0.1;
        float y = 0.06 + mod(position.y*uH + uTime*speed, uH);
        vec3 p = vec3(position.x + sin(uTime*1.3 + aSeed*20.0)*0.012, y, position.z + cos(uTime*1.1 + aSeed*13.0)*0.012);
        vec4 w = modelMatrix*vec4(p,1.0); vY = w.y;
        vec4 mv = viewMatrix*w;
        gl_PointSize = (0.9 + aSeed*1.6) * uDpr * (8.0 / -mv.z);
        vA = 0.5 + 0.5*aSeed;
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `uniform float uLevel; varying float vY; varying float vA;
      void main(){
        if (vY > uLevel - 0.015) discard;
        vec2 q = gl_PointCoord - 0.5; float d = length(q);
        float ring = smoothstep(0.5, 0.36, d) * smoothstep(0.16, 0.34, d);
        float glint = smoothstep(0.14, 0.0, length(q - vec2(-0.12, -0.12)));
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * (ring*0.45 + glint*0.9) * vA, 1.0);
      }`,
  });
  const pts = new THREE.Points(g, m);
  pts.renderOrder = 5;
  pts.frustumCulled = false;
  return pts;
}

const FAM = {
  work: { pos: [-0.66, ROCK_TOP, 0.18], lean: [0.1, 0, 0.3], r: 0.25, h: 1.02, tip: 0.42, seed: 11, spin: 0.35 },
  self: { pos: [0.02, ROCK_TOP, -0.08], lean: [-0.06, 0, -0.03], r: 0.31, h: 1.42, tip: 0.52, seed: 7, spin: 0 },
  people: { pos: [0.66, ROCK_TOP, 0.2], lean: [0.1, 0, -0.32], r: 0.24, h: 1.12, tip: 0.42, seed: 23, spin: -0.3 },
};
const SECTOR = (Math.PI * 2) / 3;
const tmp = new THREE.Vector3();

class Crystal {
  constructor(key, c) {
    this.key = key; this.c = c;
    this.group = new THREE.Group();
    this.group.position.set(...c.pos); this.group.rotation.set(...c.lean);
    this.spin = new THREE.Group();
    this.group.add(this.spin);
    const g = crystalGeometry(c);
    this.glass = new THREE.Mesh(g, glass);
    this.glass.castShadow = true;
    let lg = g.clone(); lg.scale(0.8, 0.97, 0.8);
    lg.deleteAttribute('normal'); lg.deleteAttribute('uv'); lg = mergeVertices(lg, 1e-4); lg.computeVertexNormals();
    this.mat = liquidMaterial(state.colors[key]);
    this.mat.uniforms.uR2.value = (c.r * 0.8) ** 2 / 2;
    this.liquid = new THREE.Mesh(lg, this.mat);
    this.liquid.renderOrder = -1;
    this.spin.add(this.liquid, this.glass);
    this.spin.add(bubbles(c, this.mat.uniforms));
    this.light = new THREE.PointLight(0xffffff, 0, 1.6, 2);
    this.light.position.set(0, c.h * 0.25, 0.05);
    this.group.add(this.light);
    scene.add(this.group);
    this.angle = c.spin; this.vel = 0; this.prevVel = 0; this.dragging = false; this.lastMove = 0;
    this.fill = 0; this.fillVel = 0; this.slosh = 0; this.sloshVel = 0;
    this.sector = this.frontSector(); this.moved = false;
    this.setColors(state.colors[key]);
  }
  setColors(cols) {
    cols.forEach((h, i) => this.mat.uniforms.uC.value[i].copy(hex(h)));
    const avg = new THREE.Color(0, 0, 0);
    cols.forEach((h) => avg.add(hex(h)));
    this.light.color.copy(avg.multiplyScalar(1 / 3));
  }
  frontSector() {
    const a = (((Math.PI / 2 + this.angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.min(2, Math.floor(a / SECTOR));
  }
  update(dt, t) {
    if (!this.dragging) {
      this.angle += this.vel * dt;
      this.vel *= Math.exp(-dt * 1.9);
      if (Math.abs(this.vel) < 0.02) this.vel = 0;
    }
    this.spin.rotation.y = this.angle;
    // the level eases to the share done, with a little overshoot so it sloshes as it settles
    const share = state.shares[this.key] ?? 0;
    this.fillVel += ((share - this.fill) * 26 - this.fillVel * 7.5) * dt;
    this.fill += this.fillVel * dt;
    const acc = (this.vel - this.prevVel) / Math.max(dt, 1e-3);
    this.prevVel = this.vel;
    this.sloshVel += (-this.slosh * 70 - this.sloshVel * 3.2 + acc * 0.0035 + this.fillVel * 0.4) * dt;
    this.slosh = THREE.MathUtils.clamp(this.slosh + this.sloshVel * dt, -0.35, 0.35);

    this.group.updateMatrixWorld(true);
    const m = this.spin.matrixWorld;
    const lo = tmp.set(0, -0.02, 0).applyMatrix4(m).y;
    const hi = tmp.set(0, this.c.h + this.c.tip * 0.4, 0).applyMatrix4(m).y;
    const f = THREE.MathUtils.clamp(this.fill, 0, 1);
    const u = this.mat.uniforms;
    u.uLevel.value = f <= 0.001 ? -10 : lo + (hi - lo) * f;
    u.uCenter.value.set(0, (this.c.h * f) / 2, 0).applyMatrix4(m);
    u.uTilt.value.set(this.slosh, 0);
    u.uSwirl.value = Math.min(1.2, this.vel * this.vel * 0.012);
    u.uTime.value = t;
    u.uGlow.value = 0.08 + 0.12 * f;
    this.light.intensity = f > 0.001 ? 0.35 + 0.9 * f : 0;

    const s = this.frontSector();
    if (s !== this.sector) {
      this.sector = s;
      if (this.moved) toApp({ t: 'facing', key: this.key, i: s });
    }
    if (this.moved && !this.dragging && this.vel === 0) {
      this.moved = false;
      toApp({ t: 'settled', key: this.key });
    }
  }
}
const crystals = Object.fromEntries(KEYS.map((k) => [k, new Crystal(k, FAM[k])]));
{
  const r = rng(5150);
  for (const k of KEYS) {
    const c = FAM[k];
    const n = k === 'self' ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.8;
      const dist = c.r * (1.15 + r() * 0.9);
      const sr = c.r * (0.18 + r() * 0.22);
      const g = crystalGeometry({ r: sr, h: sr * (1.6 + r() * 2.2), tip: sr * (1.2 + r() * 0.8), seed: 900 + i * 13 + c.seed });
      const m = new THREE.Mesh(g, glass);
      m.position.set(c.pos[0] + Math.cos(a) * dist, ROCK_TOP - 0.02, c.pos[2] + Math.sin(a) * dist * 0.8);
      m.rotation.set(Math.sin(a) * (0.35 + r() * 0.45), r() * 6.28, -Math.cos(a) * (0.35 + r() * 0.45));
      m.castShadow = true;
      scene.add(m);
    }
  }
}

// ── post: bloom on the sun and highlights, ACES, then vignette and the fade into the app ────────────────────
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uBg: { value: new THREE.Vector3() }, uFade: { value: 0 },
    uFadeStart: { value: 0.74 }, uAspect: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 uBg; uniform float uFade; uniform float uFadeStart; uniform float uAspect; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec2 q = vUv - vec2(0.5, 0.55); q.x *= uAspect;
      c *= mix(0.5, 1.0, smoothstep(0.95, 0.2, length(q)));
      c *= uFade;
      c = mix(c, uBg, smoothstep(uFadeStart, 1.0, 1.0 - vUv.y));
      c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
composer.addPass(grade);
function setBg(hexStr) {
  const c = new THREE.Color(); c.setStyle(hexStr, THREE.SRGBColorSpace);
  const s = c.clone().convertLinearToSRGB();
  grade.uniforms.uBg.value.set(s.r, s.g, s.b);
}
setBg(state.bg);

// ── framing: the crystals sit just under the app's top bar, the rock top about 70% down ─────────────────────
const PITCH = 0.13;
let camBase = new THREE.Vector3(), camLook = new THREE.Vector3();
function frame() {
  const W = window.innerWidth, H = window.innerHeight;
  renderer.setSize(W, H, false);
  composer.setSize(W, H);
  bloom.resolution.set(W / 2, H / 2);
  grade.uniforms.uAspect.value = W / H;
  camera.aspect = W / H;
  const fTop = state.topFrac + 0.07, fBase = 0.74, yTop = 1.95, yBase = ROCK_TOP;
  const V = (yTop - yBase) / (fBase - fTop);
  const d = V / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const cy = yTop - (0.5 - fTop) * V;
  camLook.set(0, cy, 0);
  camBase.set(0, cy + d * Math.sin(PITCH), d * Math.cos(PITCH));
  camera.position.copy(camBase); camera.lookAt(camLook);
  camera.updateProjectionMatrix();
  sendLayout();
}
function sendLayout() {
  camera.updateMatrixWorld();
  const labels = KEYS.map((k) => {
    const p = new THREE.Vector3(FAM[k].pos[0], ROCK_TOP - 0.1, FAM[k].pos[2] + 0.7).project(camera);
    return { key: k, x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
  });
  toApp({ t: 'layout', labels });
}

// ── input: a drag turns the crystal nearest the finger ─────────────────────────────────────────────────────
let held = null;
function pick(x) {
  let best = null, bd = Infinity;
  for (const k of KEYS) {
    const p = new THREE.Vector3(...FAM[k].pos).setY(ROCK_TOP + FAM[k].h * 0.5).project(camera);
    const d = Math.abs((p.x + 1) / 2 - x);
    if (d < bd) { bd = d; best = crystals[k]; }
  }
  return best;
}
function worldPerScreenX() {
  const d = camera.position.distanceTo(camLook);
  return 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect;
}
function down(x) {
  held = pick(x);
  if (!held) return;
  held.dragging = true; held.moved = true; held.vel = 0; held.lastMove = performance.now();
  toApp({ t: 'facing', key: held.key, i: held.sector, grab: true });
}
function move(dx) {
  if (!held) return;
  const now = performance.now(), dt = Math.max(1, now - held.lastMove) / 1000;
  const dA = (dx * worldPerScreenX()) / (held.c.r * 2.2);
  held.angle += dA;
  held.vel = lerp(held.vel, dA / dt, 0.5);
  held.lastMove = now;
}
function up(vx) {
  if (!held) return;
  if (typeof vx === 'number' && performance.now() - held.lastMove < 80) held.vel = (vx * worldPerScreenX()) / (held.c.r * 2.2);
  else if (performance.now() - held.lastMove > 80) held.vel = 0;
  held.vel = THREE.MathUtils.clamp(held.vel, -40, 40);
  held.dragging = false;
  held = null;
}

function recv(m) {
  if (!m || !m.t) return;
  if (m.t === 'data') {
    if (m.shares) Object.assign(state.shares, m.shares);
    if (m.colors) { Object.assign(state.colors, m.colors); KEYS.forEach((k) => state.colors[k] && crystals[k].setColors(state.colors[k])); }
    if (m.bg) setBg(m.bg);
    if (typeof m.reduce === 'boolean') state.reduce = m.reduce;
    if (typeof m.topFrac === 'number' && m.topFrac !== state.topFrac) { state.topFrac = m.topFrac; frame(); }
  } else if (m.t === 'down') down(m.x);
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
  el.addEventListener('pointerdown', (e) => { lx = e.clientX; lt = performance.now(); v = 0; down(e.clientX / innerWidth); el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (lx === null) return;
    const now = performance.now(), dx = (e.clientX - lx) / innerWidth;
    v = dx / Math.max(1, now - lt) * 1000; lx = e.clientX; lt = now; move(dx);
  });
  const end = () => { if (lx !== null) { up(v); lx = null; } };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}

// ── loop ────────────────────────────────────────────────────────────────────────────────────────────────────
window.addEventListener('resize', frame);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !state.paused) { last = performance.now(); requestAnimationFrame(loop); }
});
frame();
renderer.compile(scene, camera);

let last = performance.now(), t0 = last, reveal = 0, readySent = false;
function loop(now) {
  if (state.paused || document.hidden) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = (now - t0) / 1000;
  reveal = Math.min(1, reveal + dt / (state.reduce ? 0.3 : 1.6));
  const e = 1 - Math.pow(1 - reveal, 3);
  grade.uniforms.uFade.value = e;
  // a slow push-in on load, then the faintest drift, as if the camera is held by hand
  const drift = state.reduce ? 0 : 1;
  camera.position.copy(camBase).addScaledVector(camBase.clone().sub(camLook).normalize(), (1 - e) * 0.9 * drift);
  camera.position.x += Math.sin(t * 0.21) * 0.05 * drift;
  camera.position.y += Math.sin(t * 0.17 + 1.0) * 0.03 * drift;
  camera.lookAt(camLook);
  beamUniforms.uTime.value = t;
  dustUniforms.uTime.value = drift ? t : 0;
  for (const k of KEYS) crystals[k].update(dt, t);
  composer.render(dt);
  if (!readySent) { readySent = true; toApp({ t: 'ready' }); sendLayout(); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
