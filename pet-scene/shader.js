// The pet, raymarched in one fragment shader: a soft golden furball with a cream muzzle, big wet eyes that refract,
// fur lids that close over them, ears that glow when light comes through them, a mouth cut into the face, and glossy
// candy hearts. Every shape is a signed distance field, so the face can take any expression and squash and stretch
// without seams. Constants come from rig.js (features placed on the body's surface).

const v3 = (a) => `vec3(${a.map((x) => x.toFixed(5)).join(',')})`;

export const VERT = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

export function frag(K, small) {
  return `#version 300 es
precision highp float;
#define SMALL ${small ? 1 : 0}
out vec4 fragColor;

uniform vec2 uRes;
uniform vec3 uView;      // xy: the pet's origin in device px (from bottom left), z: device px per body unit
uniform float uTime;
uniform vec4 uRoot;      // x sway, y hop height, z shadow opacity, w unused
uniform vec4 uShape;     // x stretch (y scale), y lean x, z lean toward camera, w breath/puff
uniform mat3 uHeadInv;   // world -> head rotation
uniform vec4 uLidA;      // right eye (+x): upper open, lower open, closed-line arc, tilt
uniform vec4 uLidB;      // left eye
uniform vec4 uGaze;      // xy look dir (head space, x right, y up), z pupil, w wetness
uniform vec4 uMouth;     // width, open, curve (+ smile), cat
uniform vec4 uMouth2;    // pucker, side shift, quiver, tongue
uniform mat3 uEarMA;     // head -> ear local
uniform mat3 uEarMB;
uniform vec3 uEarPA;
uniform vec3 uEarPB;
uniform vec4 uSkin;      // flush, cheek puff, fluff, bristle
uniform vec4 uDent;      // xyz centre of the finger's dent sphere (head space), w amount
uniform vec4 uTearA;     // xyz drop (head space), w radius
uniform vec4 uTearB;
uniform vec4 uStreakA;   // xy start (head space), zw current end
uniform vec4 uStreakB;
uniform vec4 uWet;       // x streak A wetness, y streak B wetness
uniform vec4 uLight;     // x warmth, y exposure, z gloom (sad), w anger tint
uniform vec4 uBrow;      // x,y brow raise inner (A,B), z knit, w unused
uniform vec3 uTint;      // light bounced up from below (the mood colour)
uniform vec4 uHeart[6];  // xy device px, z radius px (0 off), w spin
uniform vec4 uHeartB[6]; // x alpha, y tilt, z pop
uniform vec4 uSpark[4];  // xy device px, z size px, w intensity
uniform ivec4 uSteps;    // loop counts: march, shadow, ao, heart march (uniform so they stay loops)
uniform ivec2 uCount;    // hearts, sparkles live

const float GROUND = ${K.GROUND.toFixed(5)};
const float EYE_R = ${K.EYE_R.toFixed(5)};
const vec3 EYE_C = ${v3(K.EYE_C)};
const vec3 EYE_F = ${v3(K.EYE_F)};
const vec3 EYE_X = ${v3(K.EYE_X)};
const vec3 EYE_Y = ${v3(K.EYE_Y)};
const vec3 MOUTH_C = ${v3(K.MOUTH_C)};
const vec3 MOUTH_Z = ${v3(K.MOUTH_Z)};
const vec3 MOUTH_Y = ${v3(K.MOUTH_Y)};
const vec3 NOSE_C = ${v3(K.NOSE_C)};
const vec3 CHEEK_C = ${v3(K.CHEEK_C)};
const vec3 FOOT_C = ${v3(K.FOOT_C)};
const vec3 HEAD_C = ${v3(K.HEAD_C)};
const vec3 BREATH_C = ${v3(K.BREATH_C)};
const vec3 CAM = vec3(0.0, 0.8, 7.0);
const float LID_T = 0.019;
const float LID_GAP = 0.004;

const vec3 L1 = vec3(-0.4472, 0.7826, 0.4332);   // key: high, left, in front
const vec3 L2 = vec3(0.6623, 0.4415, -0.6052);   // rim: behind, right

// materials
#define M_FUR 0
#define M_EYE 1
#define M_LID 2
#define M_MOUTH 3
#define M_TONGUE 4
#define M_NOSE 5
#define M_EAR 6
#define M_EARIN 7
#define M_TEAR 8

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────────
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float smax(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return max(a, b) + h * h * k * 0.25; }
float intRound(float a, float b, float r) { vec2 u = max(vec2(r + a, r + b), vec2(0.0)); return min(-r, max(a, b)) + length(u); }
float dot2(vec2 v) { return dot(v, v); }

// ── the body ────────────────────────────────────────────────────────────────────────────────────────
float sdBody(vec3 p) {
  float t = clamp(0.5 - 0.55 * p.y, 0.0, 1.0);
  float sx = 0.97 + 0.085 * t, sz = 0.93 + 0.07 * t;
  float d = sdEllipsoid(vec3(p.x / sx, p.y, p.z / sz), vec3(1.0, 0.93, 1.0)) * 0.96;
  return smax(d, GROUND - p.y, 0.24);
}

// world -> head space; pf: before the lean and the turn (the feet), ds: distance scale back to world
vec3 toHead(vec3 pw, out vec3 pf, out float ds) {
  vec3 p = pw - vec3(uRoot.xy, 0.0);
  float sy = uShape.x, sq = sqrt(sy);
  p = vec3(p.x * sq, (p.y - GROUND) / sy + GROUND, p.z * sq);
  ds = min(sy, 1.0 / sq) * 0.92;
  pf = p;
  float h = clamp((p.y - GROUND) / 1.8, 0.0, 1.3);
  p.xz -= uShape.yz * h * h;
  p = (p - BREATH_C) / (1.0 + uShape.w * vec3(0.012, 0.02, 0.012)) + BREATH_C;
  return uHeadInv * (p - HEAD_C) + HEAD_C;
}

// the lid curves in eye units: upper and lower edge heights at x (x outward), and their slopes
vec4 lidCurves(float x, vec4 lid, float brow) {
  float S = -0.3 + 0.25 * max(-lid.z, 0.0) + lid.z * x * x;
  float tilt = lid.w - brow * 0.55;
  float Uo = 0.8 - 0.42 * x * x + tilt * x + brow * 0.18 * (1.0 - x);
  float Lo = -0.8 + 0.34 * x * x + 0.12 * lid.w * x;
  float U = mix(S, Uo, lid.x), L = mix(S, Lo, lid.y);
  float dU = mix(2.0 * lid.z * x, -0.84 * x + tilt - brow * 0.18, lid.x);
  float dL = mix(2.0 * lid.z * x, 0.68 * x + 0.12 * lid.w, lid.y);
  return vec4(U, L, dU, dL);
}

// one eye (pm already mirrored onto the +x side): the eyeball, the lids, and how near the lids' edge it is
void eyeParts(vec3 pm, vec4 lid, float brow, out float ball, out float lids, out float rim) {
  vec3 e = pm - EYE_C;
  float r = length(e);
  ball = r - EYE_R;
  rim = 1.0;
  if (r > EYE_R + 0.15) { lids = r - (EYE_R + LID_GAP + LID_T); return; }
  vec2 q = vec2(dot(e, EYE_X), dot(e, EYE_Y)) / EYE_R;
  vec4 c = lidCurves(clamp(q.x, -1.35, 1.35), lid, brow);
  float regU = (c.x - q.y) * inversesqrt(1.0 + c.z * c.z) * EYE_R;
  float regL = (q.y - c.y) * inversesqrt(1.0 + c.w * c.w) * EYE_R;
  float shell = abs(r - (EYE_R + LID_GAP + 0.5 * LID_T)) - 0.5 * LID_T;
  float up = intRound(shell, regU, 0.5 * LID_T);
  float lo = intRound(shell, regL, 0.5 * LID_T);
  lids = smin(up, lo, 0.008);
  rim = min(abs(regU), abs(regL) + 0.03 * smoothstep(0.6, 0.95, lid.y));
}

// the mouth's outline in the mouth plane: <0 inside the open part. line: distance to the closed mouth's line.
float mouth2D(vec2 q, out float line) {
  float w = uMouth.x * (1.0 - 0.45 * uMouth2.x), open = uMouth.y, curve = uMouth.z, cat = uMouth.w;
  float x = q.x - uMouth2.y * 0.09;
  float xn = clamp(x / w, -1.0, 1.0);
  float yc = curve * w * 0.5 * xn * xn + cat * 0.026 * (cos(6.2832 * xn) - 1.0) * smoothstep(0.0, 0.3, w)
           + uMouth2.z * 0.011 * sin(xn * 7.0 + uTime * 41.0) * (1.0 - xn * xn);
  float bow = max(1.0 - xn * xn, 0.0);
  float pk = uMouth2.x;
  float yu = yc + open * w * mix(0.22, 0.7, pk) * pow(bow, mix(1.0, 0.5, pk));
  float yl = yc - open * w * mix(1.15, 0.7, pk) * pow(bow, mix(0.7, 0.5, pk));
  float slope = curve * xn + cat * 0.08;
  float dy = max(q.y - yu, yl - q.y) * inversesqrt(1.0 + slope * slope);
  line = length(vec2(x - clamp(x, -w, w), (q.y - yc) * inversesqrt(1.0 + slope * slope)));
  return smax(abs(x) - w, dy, 0.02);
}

float sdHeart2(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}
float sdHeart3(vec3 p) {
  float d2 = sdHeart2(vec2(p.x, p.y + 0.58) * 1.0);
  float inside = max(-d2, 0.0);
  float zext = 0.1 + 0.62 * sqrt(inside);
  vec2 w = vec2(d2 + 0.08, abs(p.z) - zext + 0.08);
  return (min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 0.08) * 0.62;
}

// ── the whole creature ──────────────────────────────────────────────────────────────────────────────
float earPart(vec3 e, out float inner) {
  float taper = 1.0 - 0.4 * smoothstep(0.02, 0.44, e.y);
  vec3 q = vec3(e.x / taper, e.y - 0.17, e.z);
  float outer = sdEllipsoid(q, vec3(0.175, 0.25, 0.08)) * taper;
  vec3 qi = vec3(e.x / taper, e.y - 0.2, e.z - 0.052);
  inner = sdEllipsoid(qi, vec3(0.118, 0.185, 0.05)) * taper;
  return smax(outer, -inner, 0.025) * 0.8;
}

float map(vec3 pw) {
  vec3 pf; float ds;
  vec3 p = toHead(pw, pf, ds);
  float d = sdBody(p);
  vec3 pc = vec3(abs(p.x), p.y, p.z);
  // cheeks, lifted by a smile
  vec3 cc = CHEEK_C + vec3(0.0, 0.03 * max(uMouth.z, 0.0), 0.0);
  
  // the finger's dent
  if (uDent.w > 0.001) d = smax(d, -(length(p - uDent.xyz) - 0.16), 0.07);
  // mouth: an opening cut in down to a depth under the face, and a crease for the closed line
  vec3 qm = p - MOUTH_C;
  if (abs(qm.x) < 0.45 && abs(qm.y) < 0.32 && qm.z > -0.4) {
    float line;
    float o = mouth2D(vec2(qm.x, dot(qm, MOUTH_Y)), line);
    float cav = max(o, -d - (0.09 + 0.22 * uMouth.y));
    float crease = length(vec2(line, d + 0.004)) - 0.0075;
    d = smax(d, -min(cav, crease), 0.018);
    // tongue
    if ((uMouth.y > 0.05 && (uMouth.z > 0.05 || uMouth.y > 0.3)) || uMouth2.w > 0.02) {
      float w = uMouth.x;
      vec3 tc = MOUTH_C + MOUTH_Y * (-uMouth.y * w * 0.85 + 0.01) - MOUTH_Z * (0.075 - 0.07 * uMouth2.w);
      d = min(d, sdEllipsoid(p - tc, vec3(w * 0.62, 0.05, 0.1)));
    }
  }
  // nose: a small rounded triangle, wider on top
  vec3 qn = p - NOSE_C;
  d = smin(d, sdEllipsoid(vec3(qn.x / (1.0 + 4.0 * clamp(qn.y, -0.04, 0.05)), qn.y, qn.z), vec3(0.06, 0.04, 0.04)), 0.02);
  // eyes
  float ball, lids, rim;
  float side = sign(p.x);
  eyeParts(pc, side > 0.0 ? uLidA : uLidB, side > 0.0 ? uBrow.x : uBrow.y, ball, lids, rim);
  d = smin(d, lids, 0.022);
  d = min(d, ball);
  // ears
  float inA, inB;
  vec3 ea = uEarMA * (p - uEarPA);
  float earA = length(ea - vec3(0.0, 0.18, 0.0)) > 0.42 ? length(ea - vec3(0.0, 0.18, 0.0)) - 0.3 : earPart(ea, inA);
  vec3 eb = uEarMB * (p - uEarPB);
  float earB = length(eb - vec3(0.0, 0.18, 0.0)) > 0.42 ? length(eb - vec3(0.0, 0.18, 0.0)) - 0.3 : earPart(eb, inB);
  d = smin(d, min(earA, earB), 0.07);
  // feet
  vec3 qf = vec3(abs(pf.x), pf.y, pf.z) - FOOT_C;
  d = smin(d, sdEllipsoid(qf, vec3(0.17, 0.085, 0.19)), 0.05);
  // tears
  if (uTearA.w > 0.0) d = min(d, length(p - uTearA.xyz) - uTearA.w);
  if (uTearB.w > 0.0) d = min(d, length(p - uTearB.xyz) - uTearB.w);
  return d * ds;
}

// which material the surface is at a hit point, plus extra: the lid's edge distance, the eye side
int material(vec3 pw, out float aux, out float side, out vec3 ph) {
  vec3 pf; float ds;
  vec3 p = toHead(pw, pf, ds);
  ph = p;
  side = p.x >= 0.0 ? 1.0 : -1.0;
  aux = 1.0;
  vec3 pc = vec3(abs(p.x), p.y, p.z);
  float body = sdBody(p);
  vec3 cc = CHEEK_C + vec3(0.0, 0.03 * max(uMouth.z, 0.0), 0.0);
  float skin = body;
  float best = skin; int id = M_FUR;
  vec3 qm = p - MOUTH_C;
  if (abs(qm.x) < 0.45 && abs(qm.y) < 0.32 && qm.z > -0.4) {
    float line;
    float o = mouth2D(vec2(qm.x, dot(qm, MOUTH_Y)), line);
    float cav = max(o, -skin - (0.09 + 0.22 * uMouth.y));
    float crease = length(vec2(line, skin + 0.004)) - 0.0075;
    float cut = -min(cav, crease);
    if (cut > skin - 0.004) { id = M_MOUTH; aux = line; }
    best = smax(skin, cut, 0.018);
    if ((uMouth.y > 0.05 && (uMouth.z > 0.05 || uMouth.y > 0.3)) || uMouth2.w > 0.02) {
      float w = uMouth.x;
      vec3 tc = MOUTH_C + MOUTH_Y * (-uMouth.y * w * 0.85 + 0.01) - MOUTH_Z * (0.075 - 0.07 * uMouth2.w);
      float tg = sdEllipsoid(p - tc, vec3(w * 0.62, 0.05, 0.1));
      if (tg < best + 0.002) { best = tg; id = M_TONGUE; }
    }
  }
  vec3 qn = p - NOSE_C;
  float nose = sdEllipsoid(vec3(qn.x / (1.0 + 4.0 * clamp(qn.y, -0.04, 0.05)), qn.y, qn.z), vec3(0.06, 0.04, 0.04));
  if (nose < best + 0.004) { id = M_NOSE; }
  best = smin(best, nose, 0.02);
  float ball, lids, rim;
  eyeParts(pc, side > 0.0 ? uLidA : uLidB, side > 0.0 ? uBrow.x : uBrow.y, ball, lids, rim);
  if (lids < best + 0.003) { id = M_LID; aux = rim; }
  best = smin(best, lids, 0.022);
  if (ball < best + 0.0015) { id = M_EYE; best = ball; }
  float inA = 1.0, inB = 1.0;
  vec3 ea = uEarMA * (p - uEarPA);
  float earA = earPart(ea, inA);
  vec3 eb = uEarMB * (p - uEarPB);
  float earB = earPart(eb, inB);
  float ear = min(earA, earB);
  if (ear < best - 0.002) { id = M_EAR; float inn = earA < earB ? inA : inB; if (inn < 0.02) id = M_EARIN; aux = inn; }
  if (uTearA.w > 0.0 && length(p - uTearA.xyz) - uTearA.w < 0.003) id = M_TEAR;
  if (uTearB.w > 0.0 && length(p - uTearB.xyz) - uTearB.w < 0.003) id = M_TEAR;
  return id;
}

// ── lighting tools ──────────────────────────────────────────────────────────────────────────────────
vec3 calcNormal(vec3 p, float e) {
  const vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}
float softShadow(vec3 ro, vec3 rd, float k) {
  float res = 1.0, t = 0.015, ph = 1e10;
  for (int i = 0; i < uSteps.y; i++) {
    float h = map(ro + rd * t);
    float y = h * h / (2.0 * ph), dd = sqrt(max(h * h - y * y, 0.0));
    res = min(res, k * dd / max(0.0, t - y));
    ph = h; t += clamp(h, 0.012, 0.18);
    if (res < 0.003 || t > 2.6) break;
  }
  res = clamp(res, 0.0, 1.0);
  return res * res * (3.0 - 2.0 * res);
}
float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  float nm = float(max(uSteps.z - 1, 1));
  for (int i = 0; i < uSteps.z; i++) {
    float h = 0.01 + 0.13 * float(i) / nm;
    occ += (h - map(p + h * n)) * sca; sca *= 0.85;
  }
  return clamp(1.0 - 1.9 * occ, 0.0, 1.0);
}
vec3 keyCol() { return mix(mix(vec3(1.0, 0.94, 0.86), vec3(1.0, 0.84, 0.66), uLight.x), vec3(0.84, 0.9, 1.0), uLight.z * 0.55) * 1.95 * mix(1.0, 0.78, uLight.z); }
vec3 rimCol() { return mix(vec3(0.72, 0.8, 1.0), vec3(0.6, 0.7, 1.0), uLight.z) * 1.35; }

vec3 envMap(vec3 d) {
  vec3 c = mix(vec3(0.012, 0.012, 0.016), vec3(0.09, 0.1, 0.125), smoothstep(-0.45, 0.9, d.y));
  float k = dot(d, L1);
  if (k > 0.0) {
    vec3 a = normalize(cross(L1, vec3(0.0, 0.0, 1.0)));
    vec3 b = cross(a, L1);
    vec2 uv = vec2(dot(d, a), dot(d, b)) / k;
    float box = (1.0 - smoothstep(0.2, 0.27, abs(uv.x))) * (1.0 - smoothstep(0.28, 0.36, abs(uv.y)));
    c += keyCol() * 1.6 * box;
    c += keyCol() * 0.05 * exp(-dot(uv, uv) * 2.0);
  }
  c += rimCol() * 0.45 * smoothstep(0.93, 0.995, dot(d, L2));
  return c;
}

// ── fur ─────────────────────────────────────────────────────────────────────────────────────────────
float furDetail(vec3 p) {
  float a = vnoise(vec3(p.x * 95.0, p.y * 30.0, p.z * 95.0));
  float b = vnoise(vec3(p.x * 190.0 + 7.0, p.y * 60.0, p.z * 190.0));
  return a * 0.65 + b * 0.35;
}
float creamMask(vec3 p, float fn) {
  float m = length((p.xy - vec2(0.0, -0.34)) * vec2(1.0, 1.22));
  float k = smoothstep(0.42, 0.27, m) * smoothstep(0.3, 0.62, p.z);
  float b = length((p.xy - vec2(0.0, -0.78)) * vec2(0.95, 1.35));
  k = max(k, smoothstep(0.62, 0.4, b) * smoothstep(0.25, 0.6, p.z));
  return smoothstep(0.3, 0.7, k + (fn - 0.5) * 0.35);
}

vec3 FUR = vec3(0.74, 0.27, 0.045);
vec3 CREAM = vec3(0.78, 0.6, 0.4);

vec3 shadeSurface(vec3 pw, vec3 n, vec3 rd, int id, float aux, float side, vec3 ph, mat3 headRot) {
  vec3 v = -rd;
  float occ = calcAO(pw, n);
  // thin ears would shadow themselves in bands; their shape and the light through them read without it
  float sh = id == M_EAR || id == M_EARIN ? 1.0 : softShadow(pw + n * 0.008, L1, 6.5);
  vec3 C1 = keyCol(), C2 = rimCol();
  vec3 nh = normalize(transpose(headRot) * n);   // normal in head space
  float detail = SMALL == 1 ? 0.0 : clamp((uView.z / 95.0 - 0.9) / 1.3, 0.0, 1.0);
  float fn = mix(0.5, furDetail(ph), detail);
  float fluff = uSkin.z;

  // albedo
  vec3 alb = FUR;
  float rough = 1.0, gloss = 0.0, sss = 0.35;
  if (id == M_FUR || id == M_LID || id == M_EAR) {
    alb = mix(FUR, CREAM, id == M_EAR ? 0.0 : creamMask(ph, fn));
    alb *= 0.84 + 0.32 * fn;
    // the fur dips into shadow where it meets the eye
    float eyeD = length(vec3(abs(ph.x), ph.y, ph.z) - EYE_C) - EYE_R;
    alb *= mix(0.5, 1.0, smoothstep(0.0, 0.045, eyeD));
    // feet: the body's colour, not the chest's (in the body's frame: the head's turn doesn't move the feet)
    vec3 pfe; float dse;
    vec3 phe = toHead(pw, pfe, dse);
    alb = mix(alb, FUR * (0.84 + 0.32 * fn), smoothstep(GROUND + 0.19, GROUND + 0.08, pfe.y) * smoothstep(0.12, 0.2, abs(pfe.x)));
    // ear tips a little darker, like a fox kit's
    if (id == M_EAR) alb *= 1.0 - 0.28 * smoothstep(0.95, 1.25, ph.y);
    // brows: soft cream marks above the eyes that move with the brow
    vec3 pb = vec3(abs(ph.x), ph.y, ph.z);
    float browUp = side > 0.0 ? uBrow.x : uBrow.y;
    vec2 bc = vec2(EYE_C.x - 0.03 + 0.02 * uBrow.z, EYE_C.y + EYE_R + 0.11 + 0.05 * browUp - 0.04 * uBrow.z);
    vec2 bq = pb.xy - bc;
    float ang = 0.35 * browUp - 0.45 * uBrow.z;   // inner end up when worried, down when cross
    bq = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * bq;
    float brow = smoothstep(1.0, 0.55, length(bq * vec2(1.0 / 0.085, 1.0 / 0.036))) * smoothstep(0.4, 0.7, pb.z);
    alb = mix(alb, CREAM * 1.03, brow * 0.28);
    // cheeks flush with blood under the fur
    float cheek = smoothstep(0.26, 0.04, length(pb.xy - vec2(0.5, -0.2))) * smoothstep(0.4, 0.7, pb.z);
    alb = mix(alb, mix(alb, vec3(0.86, 0.36, 0.3), 0.7), clamp(uSkin.x * cheek * 0.7, 0.0, 1.0)); // rosy, not orange
    // cross: the whole face reddens a touch
    alb = mix(alb, alb * vec3(1.15, 0.7, 0.6), uLight.w * 0.6 * smoothstep(0.2, 0.8, pb.z));
    // a sad pet looks duller: flatter fur, less colour
    float g = dot(alb, vec3(0.3, 0.59, 0.11));
    alb = mix(alb, vec3(g) * vec3(0.95, 0.97, 1.05), uLight.z * 0.13);
    // wet streaks where tears ran
    vec2 sa = uStreakA.zw - uStreakA.xy, sb = uStreakB.zw - uStreakB.xy;
    vec2 pa = ph.xy - uStreakA.xy, pb2 = ph.xy - uStreakB.xy;
    float ta = clamp(dot(pa, sa) / max(dot(sa, sa), 1e-5), 0.0, 1.0), tb = clamp(dot(pb2, sb) / max(dot(sb, sb), 1e-5), 0.0, 1.0);
    float wa = uWet.x * smoothstep(0.024, 0.008, length(pa - sa * ta)) * step(0.0, ph.x);
    float wb = uWet.y * smoothstep(0.024, 0.008, length(pb2 - sb * tb)) * step(ph.x, 0.0);
    float wet = clamp(wa + wb, 0.0, 1.0) * step(0.3, ph.z);
    alb *= 1.0 - 0.24 * wet;
    gloss = wet * 0.9; rough = mix(rough, 0.3, wet);
    // lid edges: a dark line of lashes along the margin
    if (id == M_LID) {
      float lash = smoothstep(0.02, 0.003, aux);
      alb = mix(alb, vec3(0.1, 0.05, 0.03), lash * 0.8);
    }
  } else if (id == M_EARIN) {
    alb = vec3(0.72, 0.24, 0.2); sss = 1.0;
    alb *= 0.9 + 0.2 * fn;
  } else if (id == M_NOSE) {
    alb = vec3(0.32, 0.12, 0.1); gloss = 0.7; rough = 0.35;
  } else if (id == M_MOUTH) {
    alb = vec3(0.1, 0.018, 0.014);
    alb = mix(alb, vec3(0.08, 0.035, 0.022), smoothstep(0.02, 0.0, aux) * step(uMouth.y, 0.04));
    gloss = 0.25; rough = 0.5;
  } else if (id == M_TONGUE) {
    alb = vec3(0.85, 0.28, 0.27); gloss = 0.55; rough = 0.4; sss = 0.8;
  } else if (id == M_TEAR) {
    // a drop of water: you see the fur through it, darker, and the light it catches
    alb = FUR * 0.5 + vec3(0.05, 0.04, 0.03); gloss = 1.0; rough = 0.2; sss = 0.0;
  }

  float ndl = dot(n, L1);
  float wrap = clamp((ndl + 0.42) / 1.42, 0.0, 1.0);
  vec3 col = alb * C1 * wrap * mix(1.0, sh, 0.88);
  // light scattering under the fur: the edge of the shadow goes warm, not grey
  float term = smoothstep(-0.4, 0.05, ndl) * (1.0 - smoothstep(0.05, 0.6, ndl));
  col += alb * C1 * vec3(1.0, 0.45, 0.25) * term * 0.26 * (id == M_EARIN || id == M_TONGUE ? 1.25 : 1.0) * mix(0.45, 1.0, sh);
  // a soft fill from the front right keeps the shadow side clean
  vec3 LF = normalize(vec3(0.75, 0.15, 0.65));
  col += alb * vec3(0.55, 0.6, 0.72) * 0.32 * clamp((dot(n, LF) + 0.3) / 1.3, 0.0, 1.0) * mix(0.5, 1.0, occ);
  // sky and floor
  vec3 amb = mix(vec3(0.07, 0.05, 0.04), vec3(0.15, 0.17, 0.23), 0.5 + 0.5 * n.y) + uTint * max(0.0, -n.y) * 0.45;
  col += alb * amb * occ;
  // fur catching the back light along the silhouette
  float fv = 1.0 - max(dot(n, v), 0.0);
  float rimK = pow(fv, 2.2) * (0.35 + 0.65 * smoothstep(-0.35, 0.5, dot(n, L2)));
  if (id == M_FUR || id == M_LID || id == M_EAR) {
    col += alb * C2 * rimK * (0.4 + 0.45 * fluff) * mix(0.6, 1.0, occ);
    // velvet sheen toward the key
    col += C1 * alb * pow(fv, 4.0) * wrap * 0.3 * fluff;
  } else {
    col += alb * C2 * rimK * 0.4;
  }
  // light through the thin ears
  if (id == M_EAR || id == M_EARIN) {
    // a thin plate: light from behind comes through, reddened by the blood in it; thinner toward the tip
    vec3 tr = vec3(1.0, 0.36, 0.2);
    float tip = smoothstep(0.75, 1.25, ph.y);
    float thin = (id == M_EARIN ? 0.55 : 0.22) * (0.6 + 0.6 * tip);
    col += tr * (C2 * max(dot(-n, L2), 0.0) + C1 * 0.35 * max(dot(-n, L1), 0.0)) * thin;
  }
  // wet and glossy things: a sharp highlight and a reflection
  if (gloss > 0.0) {
    vec3 h = normalize(L1 + v);
    float a2 = rough * rough * rough * rough;
    float nh2 = max(dot(n, h), 0.0);
    float dd = nh2 * nh2 * (a2 - 1.0) + 1.0;
    float spec = a2 / (3.1416 * dd * dd);
    float F = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    col += C1 * spec * F * gloss * sh * 0.6;
    col += envMap(reflect(rd, n)) * F * gloss * mix(0.4, 1.0, occ);
  }
  if (id == M_TEAR) {
    col += C1 * pow(max(dot(reflect(rd, n), L1), 0.0), 50.0) * 1.6;              // the catchlight
    col += C1 * vec3(1.0, 0.8, 0.5) * 0.3 * smoothstep(0.1, -0.7, dot(n, L1));     // light focused through it, on its far side
  }
  col *= mix(0.7, 1.0, occ);
  return col;
}

// ── the eye: a cornea that reflects the room, an iris behind it seen through refraction ──────────────────
vec3 shadeEye(vec3 pw, vec3 n, vec3 rd, vec3 ph, float side, mat3 headRot) {
  vec3 C1 = keyCol(), C2 = rimCol();
  float occ = calcAO(pw, n);
  float sh = softShadow(pw + n * 0.006, L1, 12.0);
  // to the right eye's mirrored head space
  mat3 toH = transpose(headRot);
  vec3 m = vec3(side, 1.0, 1.0);
  vec3 pm = ph * m;
  vec3 vm = normalize(toH * (-rd)) * m;
  vec3 l1 = normalize(toH * L1) * m;
  vec3 nm = normalize(pm - EYE_C);
  // where it looks (both eyes on the same point, a hair outward)
  vec3 g = normalize(vec3(uGaze.x * side + 0.05, uGaze.y, 1.0));
  vec3 rr = refract(-vm, nm, 1.0 / 1.336);
  vec3 pc = pm - EYE_C;
  float DI = EYE_R * 0.52, IR = EYE_R * 0.8;
  float pg = dot(pc, g), den = dot(rr, g);
  vec3 base;
  // the lid shades the top of the eye a little; the eye is wet so it stays bright
  float lit = mix(0.25, 1.0, sh);
  if (pg > DI - 0.002 && den < -0.02) {
    vec3 ip = pc + rr * ((DI - pg) / den);
    vec3 ipl = ip - g * DI;
    float rad = length(ipl) / IR;
    vec3 gx = normalize(cross(vec3(0.0, 1.0, 0.0), g)), gy = cross(g, gx);
    float ang = atan(dot(ipl, gy), dot(ipl, gx));
    float fib = vnoise(vec3(cos(ang) * 6.0, sin(ang) * 6.0, rad * 2.5)) * 0.55 + vnoise(vec3(cos(ang) * 17.0, sin(ang) * 17.0, rad * 6.0 + 4.0)) * 0.45;
    vec3 inner = vec3(0.2, 0.085, 0.03), outer = vec3(0.028, 0.013, 0.008);
    vec3 ic = mix(inner, outer, smoothstep(0.2, 1.0, rad)) * (0.55 + 0.9 * fib);
    ic *= mix(1.0, 0.3, smoothstep(0.78, 1.0, rad));
    float pupil = uGaze.z;
    ic = mix(vec3(0.003), ic, smoothstep(pupil, pupil + 0.05, rad));
    // the cornea gathers the key light into a bright crescent on the far side of the iris
    vec3 cd = -l1 - g * dot(-l1, g);
    float cdl = length(cd);
    float caus = cdl > 1e-3 ? smoothstep(-0.1, 0.9, dot(normalize(ipl), cd / cdl)) : 0.0;
    caus *= smoothstep(pupil, pupil + 0.25, rad) * smoothstep(1.02, 0.7, rad);
    vec3 irisLight = C1 * (0.12 + 0.2 * max(dot(g, l1), 0.0)) * lit + vec3(0.12, 0.13, 0.16);
    base = ic * irisLight + ic * vec3(1.0, 0.6, 0.25) * C1 * caus * 0.9 * lit;
    // limbus: iris fades into the white
    float sclera = smoothstep(0.98, 1.08, rad);
    vec3 scl = vec3(0.86, 0.82, 0.78) * (C1 * 0.3 * clamp(dot(nm, l1) * 0.5 + 0.6, 0.0, 1.0) * lit + vec3(0.16, 0.17, 0.2));
    base = mix(base, scl, sclera);
  } else {
    base = vec3(0.86, 0.82, 0.78) * (C1 * 0.3 * clamp(dot(nm, l1) * 0.5 + 0.6, 0.0, 1.0) * lit + vec3(0.16, 0.17, 0.2));
  }
  // shade where the eye meets the lids and the face
  float ball, lids, rim;
  eyeParts(pm, side > 0.0 ? uLidA : uLidB, side > 0.0 ? uBrow.x : uBrow.y, ball, lids, rim);
  float edge = smoothstep(0.0, 0.035, lids);
  float face = smoothstep(-0.01, 0.04, sdBody(ph));
  base *= mix(0.15, 1.0, edge) * mix(0.35, 1.0, face) * mix(0.5, 1.0, occ);
  // the wet cornea
  vec3 R = reflect(rd, n);
  float F = 0.03 + 0.97 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
  float wet = 1.0 + uGaze.w * 0.8;
  vec3 col = base * (1.0 - F) + envMap(R) * mix(0.08, 0.16, uGaze.w) * wet * mix(0.5, 1.0, sh) * edge;
  col += envMap(R) * F * 0.6 * edge;
  // a pin highlight from the key, and a weaker one from the rim
  float spec = pow(max(dot(R, L1), 0.0), 900.0) * 2.5 + pow(max(dot(R, L2), 0.0), 300.0) * 0.5;
  col += C1 * spec * edge * mix(0.35, 1.0, sh);
  // tears welling along the lower lid
  if (uGaze.w > 0.01) {
    vec2 q = vec2(dot(pc, EYE_X), dot(pc, EYE_Y)) / EYE_R;
    vec4 c = lidCurves(q.x, side > 0.0 ? uLidA : uLidB, 0.0);
    float band = smoothstep(0.16, 0.0, q.y - c.y) * step(c.y - 0.02, q.y);
    col += envMap(R) * band * uGaze.w * 0.9 + C1 * band * uGaze.w * 0.08;
  }
  return col;
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 toDisplay(vec3 c) { return pow(aces(c * uLight.y), vec3(1.0 / 2.2)); }

vec2 sphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd), c = dot(ro, ro) - r * r, h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 w = (fc - uView.xy) / uView.z;
  vec3 ro = CAM;
  vec3 rd = normalize(vec3(w, 0.0) - CAM);
  vec4 acc = vec4(0.0);

  // a soft contact shadow under it on an unseen floor, lifting and fading as it hops
  if (uRoot.z > 0.0 && rd.y < 0.0) {
    float tg = (GROUND - ro.y) / rd.y;
    vec3 gp = ro + rd * tg;
    vec2 r = vec2(gp.x - uRoot.x, gp.z - 0.08);
    float hop = max(uRoot.y, 0.0), spread = 1.0 + hop * 0.9;
    vec2 a = r * vec2(1.25, 1.9) / spread, b = r * vec2(0.8, 1.15) / spread;
    float s = (0.6 * exp(-dot(a, a) * 2.6) + 0.3 * exp(-dot(b, b) * 1.4)) / (1.0 + hop * 2.2);
    acc = vec4(0.0, 0.0, 0.0, clamp(s, 0.0, 1.0) * uRoot.z);
  }

  vec2 bs = sphere(ro - vec3(uRoot.x, uRoot.y + 0.12 + 0.3 * (uShape.x - 1.0), 0.0), rd, 1.62 + 0.5 * abs(uShape.x - 1.0));
  if (bs.y > 0.0) {
    float t = max(bs.x, 0.0), tEnd = bs.y;
    float eps = 0.32 / uView.z;
    float dmin = 1e9, tmin = t;
    bool hit = false;
    for (int i = 0; i < uSteps.x; i++) {
      vec3 p = ro + rd * t;
      float d = map(p);
      if (d < dmin) { dmin = d; tmin = t; }
      if (d < eps) { hit = true; break; }
      t += d * 0.92;
      if (t > tEnd) break;
    }
    mat3 headRot = transpose(uHeadInv);
    float fuzz = max(0.016 + 0.02 * uSkin.z + 0.024 * uSkin.w, 1.3 / uView.z);
    // one shading path for both the solid hit and the fur's soft edge (the shading code is big; emit it once)
    if (hit || dmin < fuzz) {
      vec3 p = ro + rd * (hit ? t : tmin);
      vec3 n = calcNormal(p, hit ? max(0.0012, 0.6 / uView.z) : max(0.002, 0.8 / uView.z));
      float a = 1.0;
      vec3 pm = p;
      if (!hit) {
        // the fur's soft edge: strands standing out past the surface
        vec3 nh = uHeadInv * n;
        float strand = vnoise(nh * 70.0 + 3.0) * 0.6 + vnoise(nh * 160.0) * 0.4;
        strand = mix(strand, smoothstep(0.42, 0.62, vnoise(nh * 48.0)) * 0.9 + 0.1 * strand, 0.75 * uSkin.w); // bristling: tufts stand up
        float reach = fuzz * mix(0.35, 1.0, strand);
        a = smoothstep(reach, 0.0, dmin) * mix(0.55, 1.0, strand);
        if (SMALL == 1) a = smoothstep(fuzz, 0.0, dmin);
        pm = p - n * dmin;
      }
      float aux, side; vec3 ph;
      int id = material(pm, aux, side, ph);
      if (!hit) {
        if (id == M_EYE) id = M_LID;
        vec3 pf; float ds;
        ph = toHead(p, pf, ds);
      }
      vec3 col = id == M_EYE ? shadeEye(p, n, rd, ph, side, headRot) : shadeSurface(p, n, rd, id, aux, side, ph, headRot);
      acc = mix(acc, vec4(toDisplay(col), 1.0), a);
    }
  }

  // hearts: little glossy candy hearts that pop out and float up
  for (int i = 0; i < uCount.x; i++) {
    vec4 H = uHeart[i];
    if (H.z <= 0.0) continue;
    vec2 lp = (fc - H.xy) / H.z;
    if (dot(lp, lp) > 1.7) continue;
    float cs = cos(H.w), sn = sin(H.w), ct = cos(uHeartB[i].y), st = sin(uHeartB[i].y);
    vec3 hro = vec3(lp, 2.0), hrd = vec3(0.0, 0.0, -1.0);
    // spin about y, tilt about z
    hro.xy = mat2(ct, st, -st, ct) * hro.xy;
    hro.xz = mat2(cs, sn, -sn, cs) * hro.xz; hrd.xz = mat2(cs, sn, -sn, cs) * hrd.xz;
    float th = 0.0; bool hh = false;
    for (int j = 0; j < uSteps.w; j++) {
      float d = sdHeart3(hro + hrd * th);
      if (d < 0.002) { hh = true; break; }
      th += d;
      if (th > 4.0) break;
    }
    if (hh) {
      vec3 hp = hro + hrd * th;
      vec2 e = vec2(0.003, 0.0);
      vec3 hn = normalize(vec3(sdHeart3(hp + e.xyy) - sdHeart3(hp - e.xyy), sdHeart3(hp + e.yxy) - sdHeart3(hp - e.yxy), sdHeart3(hp + e.yyx) - sdHeart3(hp - e.yyx)));
      // back to screen space for lighting
      hn.xz = mat2(cs, -sn, sn, cs) * hn.xz;
      hn.xy = mat2(ct, -st, st, ct) * hn.xy;
      vec3 C1 = keyCol();
      vec3 hc = vec3(0.95, 0.09, 0.18);
      float ndl = dot(hn, L1);
      vec3 col = hc * C1 * clamp((ndl + 0.3) / 1.3, 0.0, 1.0) * 0.55;
      col += hc * vec3(1.0, 0.35, 0.45) * 0.55 * pow(1.0 - abs(hn.z), 1.5);   // light glowing through the candy
      col += hc * vec3(0.18, 0.12, 0.16);
      vec3 R = reflect(vec3(0.0, 0.0, -1.0), hn);
      float F = 0.04 + 0.96 * pow(1.0 - max(hn.z, 0.0), 5.0);
      col += envMap(R) * (0.15 + F) * 1.1;
      col += C1 * pow(max(dot(R, L1), 0.0), 120.0) * 1.5;
      float a = uHeartB[i].x;
      acc = mix(acc, vec4(toDisplay(col), 1.0), a);
    }
  }

  // sparkles: a glint of light, four short rays
  for (int i = 0; i < uCount.y; i++) {
    vec4 S = uSpark[i];
    if (S.w <= 0.0) continue;
    vec2 q = (fc - S.xy) / S.z;
    if (dot(q, q) > 4.0) continue;
    float g = exp(-dot(q, q) * 9.0) + 0.6 * exp(-abs(q.x) * 14.0) * exp(-abs(q.y) * 2.2) + 0.6 * exp(-abs(q.y) * 14.0) * exp(-abs(q.x) * 2.2);
    g *= S.w;
    vec3 c = vec3(1.0, 0.93, 0.78) * g;
    acc.rgb += c * (1.0 - acc.a * 0.3);
    acc.a = clamp(acc.a + g * 0.85, 0.0, 1.0);
  }

  // acc is premultiplied already
  fragColor = vec4(min(acc.rgb, vec3(acc.a)), acc.a);
}
`;
}
