// The creature's proportions, in body units: the body is about 2 wide and 1.9 tall, its centre at the origin,
// sitting on the ground at y = GROUND. The face features are placed on the body's real surface here (the same
// body SDF the shader marches), so the shader gets them as constants.

export const GROUND = -0.86;
export const EYE_R = 0.232;
export const HEAD_C = [0, -0.12, 0]; // the head turns about this point
export const BREATH_C = [0, -0.2, 0];

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const norm = (v) => { const l = len3(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

function sdEllipsoid(x, y, z, rx, ry, rz) {
  const k0 = len3(x / rx, y / ry, z / rz), k1 = len3(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return (k0 * (k0 - 1)) / k1;
}
function smax(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }

// Must match sdBody() in shader.js.
export function sdBody(x, y, z) {
  const t = clamp01(0.5 - 0.55 * y);
  const sx = 0.97 + 0.085 * t, sz = 0.93 + 0.07 * t;
  const d = sdEllipsoid(x / sx, y, z / sz, 1.0, 0.93, 1.0) * 0.96;
  return smax(d, GROUND - y, 0.24);
}
function grad(x, y, z) {
  const e = 1e-4;
  return norm([
    sdBody(x + e, y, z) - sdBody(x - e, y, z),
    sdBody(x, y + e, z) - sdBody(x, y - e, z),
    sdBody(x, y, z + e) - sdBody(x, y, z - e),
  ]);
}
/** The body's front surface at (x, y): the z where the SDF crosses zero. */
function front(x, y) {
  let lo = 0, hi = 1.5;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (sdBody(x, y, m) > 0) hi = m; else lo = m; }
  return [x, y, (lo + hi) / 2];
}
/** The surface along a direction from the centre. */
function along(dir) {
  const d = norm(dir);
  let lo = 0, hi = 2;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (sdBody(d[0] * m, d[1] * m, d[2] * m) > 0) hi = m; else lo = m; }
  const t = (lo + hi) / 2;
  return [d[0] * t, d[1] * t, d[2] * t];
}

// eyes: big, set low and wide (the baby look), bulging a little out of the face
const eyeS = front(0.335, 0.06);
const eyeN = grad(...eyeS);
const EYE_PROTRUDE = 0.072;
export const EYE_C = add(eyeS, eyeN, EYE_PROTRUDE - EYE_R);
export const EYE_F = norm([0.24, 0.04, 1.0]); // the lids' frame: mostly forward, a touch outward
export const EYE_X = norm(cross([0, 1, 0], EYE_F));
export const EYE_Y = cross(EYE_F, EYE_X);

export const MOUTH_C = front(0, -0.335);
export const MOUTH_Z = norm([0, -0.34, 1]);
export const MOUTH_Y = cross(MOUTH_Z, [1, 0, 0]);
export const NOSE_C = add(front(0, -0.17), grad(...front(0, -0.17)), -0.006);

const cheekS = front(0.5, -0.2);
export const CHEEK_C = add(cheekS, grad(...cheekS), -0.115);

// ears: on top, a little out to the sides
const earS = along([0.5, 0.84, -0.04]);
const earN = grad(...earS);
export const EAR_P = add(earS, earN, -0.05); // the right ear's pivot (the left one mirrors x)
export const EAR_UP = norm(add(earN, [0.12, 0, 0])); // rest direction, tipped out a bit
export const EAR_FRONT = norm(cross(cross(EAR_UP, [0, 0, 1]), EAR_UP)); // facing forward
export const FOOT_C = [0.34, GROUND + 0.075, 0.5];

/** Where a tear runs: from the outer corner under the eye down the cheek, s = 0..1. */
export function tearPath(side, s) {
  const c = EYE_C;
  const x0 = c[0] + EYE_R * 0.55, y0 = c[1] - EYE_R * 0.78;
  const x = x0 + 0.05 * s - 0.03 * s * s, y = y0 - 0.5 * s; // down the cheek, curving in under the jaw
  const p = front(x, y);
  const n = grad(...p);
  return { p: [p[0] * side, p[1], p[2]], n: [n[0] * side, n[1], n[2]] };
}
/** A point on the face at (x, y), for the rub's contact. */
export function facePoint(x, y) { return front(x, y); }

export const K = { GROUND, EYE_R, EYE_C, EYE_F, EYE_X, EYE_Y, MOUTH_C, MOUTH_Z, MOUTH_Y, NOSE_C, CHEEK_C, EAR_P, EAR_UP, EAR_FRONT, FOOT_C, HEAD_C, BREATH_C };
