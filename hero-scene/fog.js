// Volumetric fog round the foot of the stone. After the scene is drawn, a ray is marched through the fog for every
// pixel of a buffer a quarter of the screen's size, stopping where the scene's depth says something solid is: the
// stone, a crystal, a plant. Density comes from a tiling 3D noise, shaped into a layer over the floor that the
// turning stone drags round, whirls up into a column as the spin builds, and at a wild spin is thrown up and out
// of the cave. Each sample is lit by the shaft of daylight (with the stone's shadow cut out of it and the fog's own
// shadow toward the sun) and a dim cave ambient. A second pass lays it over the scene at full size, taking each
// pixel's fog from the nearby samples at its own depth, so edges stay sharp.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// ── a tiling 3D noise, built once ───────────────────────────────────────────────────────────────────────────
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function grad(h, x, y, z) {
  const k = h & 15, u = k < 8 ? x : y, v = k < 4 ? y : k === 12 || k === 14 ? x : z;
  return ((k & 1) ? -u : u) + ((k & 2) ? -v : v);
}
function noiseVolume(N) {
  let a = 2027;
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  // gradient noise whose lattice wraps every P cells, so the texture tiles
  const pn = (x, y, z, P) => {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    const fx = x - X, fy = y - Y, fz = z - Z, u = fade(fx), v = fade(fy), w = fade(fz);
    const h = (i, j, k) => perm[(perm[(perm[(X + i) % P] + (Y + j) % P) & 255] + (Z + k) % P) & 255];
    const l = (p, q, s) => p + (q - p) * s;
    return l(
      l(l(grad(h(0, 0, 0), fx, fy, fz), grad(h(1, 0, 0), fx - 1, fy, fz), u), l(grad(h(0, 1, 0), fx, fy - 1, fz), grad(h(1, 1, 0), fx - 1, fy - 1, fz), u), v),
      l(l(grad(h(0, 0, 1), fx, fy, fz - 1), grad(h(1, 0, 1), fx - 1, fy, fz - 1), u), l(grad(h(0, 1, 1), fx, fy - 1, fz - 1), grad(h(1, 1, 1), fx - 1, fy - 1, fz - 1), u), v),
      w,
    );
  };
  const data = new Uint8Array(N * N * N);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const s = 1 / N;
    // billowy low octave (puffs), finer octaves for the torn edges
    const b = 1 - Math.abs(pn(x * s * 4, y * s * 4, z * s * 4, 4)) * 1.6;
    const f = pn(x * s * 8, y * s * 8, z * s * 8, 8) * 0.5 + pn(x * s * 16, y * s * 16, z * s * 16, 16) * 0.25;
    const v = Math.min(1, Math.max(0, 0.5 * b + 0.42 + f * 0.75));
    data[(z * N + y) * N + x] = Math.round(v * 255);
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RedFormat; tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1; tex.needsUpdate = true;
  return tex;
}

const MARCH = /* glsl */ `
  uniform sampler3D tNoise; uniform sampler2D tFloor; uniform sampler2D tDepth; uniform float uNear; uniform float uFar;
  uniform mat4 uProjInv; uniform mat4 uCamWorld; uniform vec3 uCamPos;
  uniform float uTime; uniform float uSwirl; uniform float uShear; uniform float uE; uniform float uLift; uniform float uRise;
  uniform float uDens; uniform float uTop; uniform float uRockY; uniform vec3 uAmb; uniform float uShaft;
  uniform vec3 uKeyPos; uniform vec3 uKeyDir; uniform vec3 uKeyCol; uniform float uCosO; uniform float uCosI;
  varying vec2 vUv;
  const vec3 ROCK = vec3(1.08, 0.56, 1.0); // the stone as an ellipsoid: its flat top sits near y = 0
  const float ROCK_DY = -0.08;
  const float R = 3.6;

  vec2 rock(vec3 ro, vec3 rd, float s) {
    vec3 o = (ro - vec3(0.0, uRockY + ROCK_DY, 0.0))/(ROCK*s), d = rd/(ROCK*s);
    float a = dot(d, d), b = dot(o, d), c = dot(o, o) - 1.0, h = b*b - a*c;
    if (h < 0.0) return vec2(1e5, -1e5);
    h = sqrt(h);
    return vec2(-b - h, -b + h)/a;
  }

  float dens(vec3 p, bool fine) {
    vec3 q = p;
    q.y -= uLift*3.2;                                     // thrown up and out at a wild spin
    float r = length(q.xz);
    float h = q.y + 1.1;                                  // height over the floor
    if (h < -0.15) return 0.0;
    // dragged round by the stone, faster close to it, and twisted with height as it whirls
    float an = uSwirl + uShear*(1.6/(r + 0.5) - 0.8) + h*uE*1.3;
    float ca = cos(an), sa = sin(an);
    vec2 sp = vec2(ca*q.x - sa*q.z, sa*q.x + ca*q.z);
    vec3 np = vec3(sp.x*0.36, h*mix(0.45, 0.2, uE) - uRise, sp.y*0.36) + vec3(uTime*0.008, 0.0, uTime*0.005);
    float n = texture(tNoise, np).r;
    if (fine) n = n*0.62 + texture(tNoise, np*2.7 + vec3(0.37, 0.11, 0.73)).r*0.38;
    // a dense layer over the floor with a billowing top; the whirl thins it as it draws it up
    float hh = h - (n - 0.5)*0.8;
    float layer = exp(-max(hh - 0.7, 0.0)*6.0)*smoothstep(-0.15, 0.08, h)*smoothstep(R, 1.9, r)*(1.0 - 0.55*uE);
    // ...into two streamers spiralling up round the stone, turning with it, with clear air between them
    float arm = 0.5 + 0.5*sin(atan(sp.y, sp.x)*2.0 - h*2.6 + n*4.0);
    float wall = exp(-pow((r - 1.2 - 0.18*h)/(0.32 + 0.14*h), 2.0))*exp(-max(h - 0.2, 0.0)*0.9)*smoothstep(-0.1, 0.25, h);
    float base = max(layer, wall*smoothstep(0.5, 0.9, arm)*uE*0.9);
    float d = base*clamp(0.3 + (n - 0.5)*2.4 + base*0.45, 0.0, 1.0);
    float left = 1.0 - uLift;                             // what is still here as it goes up
    return d*left*left*left;
  }

  void main(){
    vec4 v = uProjInv*vec4(vUv*2.0 - 1.0, 1.0, 1.0);
    vec3 rd = normalize(mat3(uCamWorld)*(v.xyz/v.w));
    vec3 ro = uCamPos;
    // bounds: a cylinder round the stone, from under the floor to the top of the fog
    float ta = 0.0, tb = 1e5;
    if (abs(rd.y) > 1e-5) {
      float t0 = (-1.55 - ro.y)/rd.y, t1 = (uTop - ro.y)/rd.y;
      ta = min(t0, t1); tb = max(t0, t1);
    }
    float A = dot(rd.xz, rd.xz), B = dot(ro.xz, rd.xz), C = dot(ro.xz, ro.xz) - R*R, D = B*B - A*C;
    if (D < 0.0) { gl_FragColor = vec4(0.0); return; }
    D = sqrt(D);
    ta = max(max(ta, (-B - D)/A), 0.0); tb = min(tb, (-B + D)/A);
    // stop at whatever solid thing this pixel sees
    float z = texture(tDepth, vUv).x;
    if (z < 1.0) {
      float viewZ = (uNear*uFar)/((uFar - uNear)*z - uFar);
      tb = min(tb, -viewZ/dot(rd, -normalize(uCamWorld[2].xyz)));
    }
    if (tb <= ta) { gl_FragColor = vec4(0.0); return; }

    const int STEPS = 26;
    float dl = (tb - ta)/float(STEPS);
    float jit = fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float t = ta + dl*jit;
    // light scattered toward the eye: a little forward-peaked, as fine water droplets scatter it
    float cosT = dot(-rd, uKeyDir), g = 0.3;
    float ph = (1.0 - g*g)/pow(1.0 + g*g - 2.0*g*cosT, 1.5);
    vec3 S = vec3(0.0); float T = 1.0;
    for (int i = 0; i < STEPS; i++) {
      vec3 p = ro + rd*t;
      float fl = texture(tFloor, p.xz/6.4 + 0.5).r*1.2 - 1.7;
      float d = dens(p, true)*smoothstep(fl - 0.02, fl + 0.1, p.y);
      if (d > 0.002) {
        vec3 L = normalize(uKeyPos - p);
        float cone = smoothstep(uCosO - 0.05, uCosI, dot(-L, uKeyDir));
        float lit = 0.0;
        if (cone > 0.002) {
          float sh = rock(p, L, 0.93).y > 0.0 ? 0.06 : 1.0;   // the stone's shadow in the shaft
          lit = cone*sh*exp(-dens(p + L*0.22, false)*2.6);
        }
        vec3 col = uAmb*(0.55 + 0.45*clamp(p.y + 1.15, 0.0, 1.0)) + uKeyCol*lit*ph*uShaft;
        float a = 1.0 - exp(-d*uDens*dl);
        S += T*a*col;
        T *= 1.0 - a;
        if (T < 0.03) break;
      }
      t += dl;
    }
    gl_FragColor = vec4(S, 1.0 - T);
  }`;

export function createFog({ renderer, camera, light, floorTex, rockY }) {
  const SCALE = 0.25;
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false });
  rt.texture.minFilter = rt.texture.magFilter = THREE.NearestFilter;
  rt.texture.generateMipmaps = false;

  const u = {
    ...light,
    tNoise: { value: noiseVolume(32) }, tFloor: { value: floorTex }, tDepth: { value: null },
    uNear: { value: camera.near }, uFar: { value: camera.far },
    uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
    uTime: { value: 0 }, uSwirl: { value: 0 }, uShear: { value: 0 }, uE: { value: 0 }, uLift: { value: 0 }, uRise: { value: 0 },
    uDens: { value: 3.4 }, uTop: { value: 0 }, uRockY: { value: rockY }, uShaft: { value: 1.15 },
    uAmb: { value: new THREE.Color(0.026, 0.03, 0.04) },
  };
  const marchQuad = new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms: u, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: MARCH,
  }));

  // fog over the scene: each pixel blends the four nearest fog samples, weighted toward those whose depth is
  // close to its own, so a crystal's edge doesn't pick up the fog from the cave behind it
  const cu = {
    tDiffuse: { value: null }, tDepth: { value: null }, tFog: { value: rt.texture },
    uFogRes: { value: new THREE.Vector2(1, 1) }, uNear: u.uNear, uFar: u.uFar,
  };
  const compQuad = new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms: cu, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform sampler2D tFog; uniform vec2 uFogRes;
      uniform float uNear; uniform float uFar; varying vec2 vUv;
      float dist(float z){ return z >= 1.0 ? uFar : -(uNear*uFar)/((uFar - uNear)*z - uFar); }
      void main(){
        vec4 sc = texture2D(tDiffuse, vUv);
        float d0 = dist(texture2D(tDepth, vUv).x);
        vec2 p = vUv*uFogRes - 0.5, i0 = floor(p), f = p - i0;
        vec4 acc = vec4(0.0); float ws = 0.0;
        for (int k = 0; k < 4; k++) {
          vec2 o = vec2(float(k - (k/2)*2), float(k/2));
          vec2 uv = (i0 + o + 0.5)/uFogRes;
          float wb = mix(1.0 - f.x, f.x, o.x)*mix(1.0 - f.y, f.y, o.y);
          float dd = abs(dist(texture2D(tDepth, uv).x) - d0)/max(d0, 0.1);
          float w = wb/(1.0 + dd*dd*900.0) + 1e-4*wb;
          acc += texture2D(tFog, uv)*w; ws += w;
        }
        vec4 fg = acc/max(ws, 1e-5);
        gl_FragColor = vec4(sc.rgb*(1.0 - fg.a) + fg.rgb, sc.a);
      }`,
  }));

  class MarchPass extends Pass {
    constructor() { super(); this.needsSwap = false; }
    render(r, writeBuffer, readBuffer) {
      u.tDepth.value = readBuffer.depthTexture;
      u.uProjInv.value.copy(camera.projectionMatrixInverse);
      u.uCamWorld.value.copy(camera.matrixWorld);
      u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
      r.setRenderTarget(rt);
      marchQuad.render(r);
    }
  }
  class CompositePass extends Pass {
    constructor() { super(); this.needsSwap = true; }
    render(r, writeBuffer, readBuffer) {
      cu.tDiffuse.value = readBuffer.texture;
      cu.tDepth.value = readBuffer.depthTexture;
      r.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      compQuad.render(r);
    }
  }

  return {
    u, rt,
    march: new MarchPass(),
    composite: new CompositePass(),
    resize(w, h, dpr) {
      const fw = Math.max(80, Math.round(w * dpr * SCALE)), fh = Math.max(80, Math.round(h * dpr * SCALE));
      rt.setSize(fw, fh);
      cu.uFogRes.value.set(fw, fh);
    },
  };
}
