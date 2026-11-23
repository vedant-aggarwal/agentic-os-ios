// Ivy trailing from the cave roof at the top corners of the frame. Each strand is a rope of nodes (verlet, a few
// constraint passes and a little stiffness), so it sways in the cave air, swings when you drag it and blows about
// when the spinning stone throws the fog up. Pull or swing one too hard and it snaps at a joint: the piece you
// tore off flies on, tumbling, and fades, a few leaves shake loose, and two to three seconds later the stub grows
// it back, leaves unfurling as it goes. Plants sit nearer the camera than the fog is laid, so they stay in front.
import * as THREE from 'three';

const G = 9.8, H = 1 / 120, ITER = 7, RAD = 5, DEBRIS = 12;
const STRANDS = [
  // screen x, length as a share of the frame's height, distance from the camera, nodes, leaf size, seed
  { sx: 0.06, len: 0.47, d: 2.5, n: 13, leaf: 1.0, seed: 3 },
  { sx: 0.17, len: 0.33, d: 2.75, n: 11, leaf: 0.85, seed: 7 },
  { sx: 0.26, len: 0.2, d: 2.95, n: 8, leaf: 0.72, seed: 11 },
  { sx: 0.8, len: 0.27, d: 2.85, n: 9, leaf: 0.8, seed: 17 },
  { sx: 0.92, len: 0.44, d: 2.55, n: 12, leaf: 1.0, seed: 23 },
];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeBack = (t) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// screen-door fade: stays opaque (no sorting, writes depth so the fog stays behind), dissolves as alpha drops.
// Leaves also get a pale midrib and darken toward the stalk.
function dissolve(m, key, leaf = false) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aA; varying float vA; varying vec2 vLeaf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = aA; vLeaf = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vA; varying vec2 vLeaf;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vA < 0.995 && fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) > vA) discard;`)
      .replace('#include <color_fragment>', leaf ? `#include <color_fragment>
        float rib = 1.0 - smoothstep(0.0, 0.02 + 0.015*(1.0 - vLeaf.y), abs(vLeaf.x));
        diffuseColor.rgb *= 0.7 + 0.45*smoothstep(0.0, 0.7, vLeaf.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*1.9 + vec3(0.012, 0.016, 0.004), rib*0.55*(1.0 - vLeaf.y*0.7));` : '#include <color_fragment>');
  };
  m.customProgramCacheKey = () => key;
  return m;
}

function leafGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.42, 0.08, 0.5, 0.6, 0, 1);
  s.bezierCurveTo(-0.5, 0.6, -0.42, 0.08, 0, 0);
  const g = new THREE.ShapeGeometry(s, 5);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, -0.35 * x * x + 0.14 * y * (1 - y) - 0.08 * y * y); // cupped along the midrib, tip curling back
  }
  g.computeVertexNormals();
  return g;
}

export function createPlants({ scene, camera, haptic, reduce }) {
  const strands = STRANDS.map((c) => {
    const n = c.n, r = rng(c.seed * 977);
    const leaves = [];
    for (let i = 1; i < n; i++) {
      const tip = i / (n - 1);
      leaves.push({ node: i, side: i % 2 ? 1 : -1, size: c.leaf * (0.072 - 0.03 * tip) * (0.8 + r() * 0.4), twist: (r() - 0.5) * 1.6, tilt: (r() - 0.5) * 0.8, ph: r() * 6.28 });
      if (i < n - 1 && r() < 0.75) leaves.push({ node: i, side: i % 2 ? -1 : 1, size: c.leaf * (0.05 - 0.02 * tip) * (0.75 + r() * 0.5), twist: (r() - 0.5) * 1.6, tilt: (r() - 0.5) * 0.8, ph: r() * 6.28 });
    }
    return {
      c, n, leaves,
      P: new Float32Array(n * 3), Q: new Float32Array(n * 3),
      rest: new Float32Array(n - 1), cur: new Float32Array(n - 1), alpha: new Float32Array(n).fill(1),
      grow: new Float32Array(n).fill(1), // per node: how far the leaves on it have unfurled
      anchor: new THREE.Vector3(), r0: 0.0045 * c.leaf + 0.0022,
      cut: -1, fall: 0, wait: 0, regrow: -1,
      grab: -1, stress: 0, plane: new THREE.Vector3(),
    };
  });

  // stems: one dynamic mesh, every strand a run of tube segments (each with its own pair of rings so a broken
  // link simply closes up)
  let segs = 0;
  for (const s of strands) segs += s.n - 1;
  const VPS = RAD * 2, vCount = segs * VPS;
  const sPos = new Float32Array(vCount * 3), sNor = new Float32Array(vCount * 3), sA = new Float32Array(vCount).fill(1);
  const idx = [];
  for (let k = 0; k < segs; k++) {
    const b = k * VPS;
    for (let j = 0; j < RAD; j++) {
      const a0 = b + j, a1 = b + (j + 1) % RAD, c0 = b + RAD + j, c1 = b + RAD + (j + 1) % RAD;
      idx.push(a0, a1, c0, a1, c1, c0);
    }
  }
  const stemGeo = new THREE.BufferGeometry();
  stemGeo.setIndex(idx);
  stemGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  stemGeo.setAttribute('normal', new THREE.BufferAttribute(sNor, 3).setUsage(THREE.DynamicDrawUsage));
  stemGeo.setAttribute('aA', new THREE.BufferAttribute(sA, 1).setUsage(THREE.DynamicDrawUsage));
  const stemMat = dissolve(new THREE.MeshStandardMaterial({ color: new THREE.Color('#2A2818'), roughness: 0.85, metalness: 0, envMapIntensity: 0.4 }), 'stem');
  const stems = new THREE.Mesh(stemGeo, stemMat);
  stems.frustumCulled = false;
  scene.add(stems);

  // leaves: one instanced mesh for every strand, plus a few loose ones that shake off when a strand snaps
  let nLeaves = 0;
  for (const s of strands) nLeaves += s.leaves.length;
  const LCOUNT = nLeaves + DEBRIS;
  const leafGeo = leafGeometry();
  const lA = new Float32Array(LCOUNT).fill(1);
  leafGeo.setAttribute('aA', new THREE.InstancedBufferAttribute(lA, 1).setUsage(THREE.DynamicDrawUsage));
  const leafMat = dissolve(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 1.1 }), 'leaf', true);
  const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, LCOUNT);
  leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  leafMesh.frustumCulled = false;
  {
    const r = rng(4242), col = new THREE.Color();
    for (let i = 0; i < LCOUNT; i++) {
      col.setHSL(0.21 + r() * 0.09, 0.5 + r() * 0.25, 0.16 + r() * 0.14);
      leafMesh.setColorAt(i, col);
    }
  }
  scene.add(leafMesh);
  const debris = Array.from({ length: DEBRIS }, () => ({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), age: 0, life: 1, size: 0.05, spin: 0, ax: new THREE.Vector3(1, 0, 0), ang: 0 }));
  let debrisNext = 0;

  // scratch, so a frame allocates nothing
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), tng = new THREE.Vector3(), nA = new THREE.Vector3(), nB = new THREE.Vector3();
  const view = new THREE.Vector3(), fwd = new THREE.Vector3(), camPos = new THREE.Vector3(), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion();
  const ndc = new THREE.Vector3(), tgt = new THREE.Vector3(), tgtRaw = new THREE.Vector3(), tgtPrev = new THREE.Vector3(), off = new THREE.Vector3();
  const zoneOut = strands.map((s) => new Array((s.n - 1) * 2).fill(0));
  let held = null, speed = 0, heldVel = new THREE.Vector3(), acc = 0, W = 1, Hh = 1, pinT = 1;

  function nodeAt(s, i, out) { return out.set(s.P[i * 3], s.P[i * 3 + 1], s.P[i * 3 + 2]); }
  function resetStrand(s) {
    const L = s.c.len * 2 * s.c.d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const r = rng(s.c.seed * 31);
    for (let i = 0; i < s.n - 1; i++) s.rest[i] = s.cur[i] = L / (s.n - 1) * (0.9 + 0.2 * r());
    let y = 0;
    for (let i = 0; i < s.n; i++) {
      const k = i * 3;
      s.P[k] = s.anchor.x + Math.sin(i * 0.7 + s.c.seed) * 0.01; s.P[k + 1] = s.anchor.y - y; s.P[k + 2] = s.anchor.z;
      s.Q[k] = s.P[k]; s.Q[k + 1] = s.P[k + 1]; s.Q[k + 2] = s.P[k + 2];
      if (i < s.n - 1) y += s.rest[i];
    }
    s.alpha.fill(1); s.grow.fill(1); s.cut = -1; s.regrow = -1; s.grab = -1; s.stress = 0;
  }

  // world point on the ray through a screen point (0..1 from the top left), where it meets the plane through
  // `through` facing the camera
  function onPlane(x, y, through, out) {
    ndc.set(x * 2 - 1, 1 - y * 2, 0.5).unproject(camera);
    camPos.setFromMatrixPosition(camera.matrixWorld);
    ndc.sub(camPos).normalize();
    camera.getWorldDirection(fwd);
    const t = v3.copy(through).sub(camPos).dot(fwd) / Math.max(1e-4, ndc.dot(fwd));
    return out.copy(camPos).addScaledVector(ndc, t);
  }
  function toScreen(p, out) {
    ndc.copy(p).project(camera);
    out[0] = (ndc.x + 1) / 2; out[1] = (1 - ndc.y) / 2;
    return out;
  }
  const scr = [0, 0];

  function snap(s, k, fly) {
    s.cut = k; s.fall = 0; s.wait = 2.1 + Math.random() * 0.7; s.grab = -1; s.stress = 0;
    if (held && held.s === s) held = null;
    if (fly) {
      // the torn piece keeps the finger's speed
      for (let i = k + 1; i < s.n; i++) {
        const j = i * 3;
        s.Q[j] = s.P[j] - fly.x * H; s.Q[j + 1] = s.P[j + 1] - fly.y * H; s.Q[j + 2] = s.P[j + 2] - fly.z * H;
      }
    }
    // a sideways kick at its far end, so it tumbles as it falls
    const e2 = (s.n - 1) * 3, kick = (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 0.8);
    s.Q[e2] -= kick * H; s.Q[e2 + 2] -= kick * 0.5 * H;
    // a few leaves shake loose at the break
    nodeAt(s, k + 1, v1);
    for (let i = 0; i < 4; i++) {
      const d = debris[debrisNext]; debrisNext = (debrisNext + 1) % DEBRIS;
      d.on = true; d.age = 0; d.life = 1.1 + Math.random() * 0.6; d.size = s.c.leaf * (0.04 + Math.random() * 0.025);
      d.p.copy(v1);
      d.v.set((Math.random() - 0.5) * 1.6, 0.4 + Math.random() * 0.9, (Math.random() - 0.5) * 0.8);
      if (fly) d.v.addScaledVector(fly, 0.35);
      d.ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      d.spin = (Math.random() - 0.5) * 18; d.ang = Math.random() * 6.28;
    }
    haptic('rigid');
  }

  function step(t, wind) {
    const draft = reduce() ? 0 : 1;
    for (const s of strands) {
      const n = s.n, P = s.P, Q = s.Q, seed = s.c.seed;
      P[0] = Q[0] = s.anchor.x; P[1] = Q[1] = s.anchor.y; P[2] = Q[2] = s.anchor.z;
      for (let i = 1; i < n; i++) {
        if (s.cut >= 0 && i > s.cut && s.alpha[i] <= 0) continue;
        const k = i * 3, along = i / (n - 1);
        const vx = (P[k] - Q[k]) * 0.994, vy = (P[k + 1] - Q[k + 1]) * 0.994, vz = (P[k + 2] - Q[k + 2]) * 0.994;
        Q[k] = P[k]; Q[k + 1] = P[k + 1]; Q[k + 2] = P[k + 2];
        // the cave's draft, and the stone's whirl and updraft when it spins
        const gust = Math.sin(t * 0.63 + seed) * 0.5 + Math.sin(t * 1.71 + seed * 2.3 + i * 0.4) * 0.3;
        const flutter = Math.sin(t * 9.0 + i * 1.7 + seed) * (wind.e * 1.0 + wind.lift * 2.5);
        const bend = Math.sin(i * 0.8 + seed) * 0.9; // a strand's own lie: never quite plumb
        const fx = (gust * 0.35 * draft + wind.side * along + flutter + bend) * along;
        const fy = -G + wind.up * along;
        const fz = (Math.sin(t * 0.9 + seed * 1.7) * 0.2 * draft + flutter * 0.6) * along;
        P[k] += vx + fx * H * H; P[k + 1] += vy + fy * H * H; P[k + 2] += vz + fz * H * H;
      }
      if (s.grab >= 0) {
        // pinned to the finger, moved along its path across the substeps of this frame
        const k = s.grab * 3;
        P[k] = tgtPrev.x + (tgt.x - tgtPrev.x) * pinT + off.x;
        P[k + 1] = tgtPrev.y + (tgt.y - tgtPrev.y) * pinT + off.y;
        P[k + 2] = tgtPrev.z + (tgt.z - tgtPrev.z) * pinT + off.z;
      }
      for (let it = 0; it < ITER; it++) {
        for (let i = 0; i < n - 1; i++) {
          if (i === s.cut) continue;
          const a = i * 3, b = a + 3;
          const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d < 1e-7) continue;
          const wa = i === 0 || i === s.grab ? 0 : 1, wb = i + 1 === s.grab ? 0 : 1, ws = wa + wb;
          if (!ws) continue;
          const f = (d - s.cur[i]) / (d * ws);
          P[a] += dx * f * wa; P[a + 1] += dy * f * wa; P[a + 2] += dz * f * wa;
          P[b] -= dx * f * wb; P[b + 1] -= dy * f * wb; P[b + 2] -= dz * f * wb;
        }
        // a little stiffness: each node keeps some distance from the one two along, so it bends, never folds
        for (let i = 0; i < n - 2; i++) {
          if (i === s.cut || i + 1 === s.cut) continue;
          const a = i * 3, b = a + 6;
          const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz), L = (s.cur[i] + s.cur[i + 1]) * 0.94;
          if (d >= L || d < 1e-7) continue;
          const wa = i === 0 || i === s.grab ? 0 : 1, wb = i + 2 === s.grab ? 0 : 1, ws = wa + wb;
          if (!ws) continue;
          const f = ((d - L) / (d * ws)) * 0.2;
          P[a] += dx * f * wa; P[a + 1] += dy * f * wa; P[a + 2] += dz * f * wa;
          P[b] -= dx * f * wb; P[b + 1] -= dy * f * wb; P[b + 2] -= dz * f * wb;
        }
      }
    }
  }

  function update(dt, t, wind) {
    // the finger: smoothed toward the latest touch, which arrives in uneven bursts over the bridge
    if (held) {
      const k = 1 - Math.exp(-dt * 38);
      tgtPrev.copy(tgt);
      tgt.lerp(tgtRaw, k);
      off.multiplyScalar(Math.exp(-dt * 7));
      const inst = tgtPrev.distanceTo(tgt) / Math.max(dt, 1e-3);
      speed += (inst - speed) * (1 - Math.exp(-dt * 14));
      heldVel.copy(tgt).sub(tgtPrev).divideScalar(Math.max(dt, 1e-3));
      // too hard: pulled well past its reach, or swung fast. Strain builds up and leaks away.
      const s = held.s;
      if (s.cut < 0 && s.regrow < 0) {
        let reach = 0;
        for (let i = 0; i < s.grab; i++) reach += s.cur[i];
        const over = v1.copy(tgt).sub(s.anchor).length() / Math.max(reach, 1e-3);
        s.stress += dt * (Math.max(0, over - 1.08) * 10 + Math.max(0, speed - 2.6) * 1.8);
        s.stress *= Math.exp(-dt * 2.4);
        if (s.stress > 1 || over > 1.3) {
          const k2 = Math.max(1, Math.min(s.n - 3, Math.round(s.grab * 0.5 + Math.random() * 1.5)));
          snap(s, k2, heldVel.clone().multiplyScalar(0.45).clampLength(0, 3.5));
        }
      }
    }
    acc = Math.min(acc + dt, H * 5);
    const nSub = Math.floor(acc / H);
    for (let j = 0; j < nSub; j++) { pinT = (j + 1) / nSub; step(t, wind); }
    acc -= nSub * H;

    for (const s of strands) {
      // the torn piece fades as it falls; then, after a wait, the stub grows it back
      if (s.cut >= 0) {
        s.fall += dt;
        const a = reduce() ? clamp01(1 - s.fall / 0.3) : clamp01(1 - (s.fall - 0.35) / 0.9);
        for (let i = s.cut + 1; i < s.n; i++) s.alpha[i] = a;
        if (s.fall > s.wait) {
          const k = s.cut;
          for (let i = k + 1; i < s.n; i++) {
            const j = i * 3;
            s.P[j] = s.P[k * 3]; s.P[j + 1] = s.P[k * 3 + 1] - 0.001 * (i - k); s.P[j + 2] = s.P[k * 3 + 2];
            s.Q[j] = s.P[j]; s.Q[j + 1] = s.P[j + 1]; s.Q[j + 2] = s.P[j + 2];
            s.alpha[i] = 1; s.grow[i] = 0;
          }
          for (let i = k; i < s.n - 1; i++) s.cur[i] = 0.0005;
          s.regrowFrom = k; s.regrow = 0; s.cut = -1;
        }
      } else if (s.regrow >= 0) {
        s.regrow += dt;
        const k = s.regrowFrom, rate = reduce() ? 30 : 7.5;
        let done = true;
        for (let i = k; i < s.n - 1; i++) {
          const p = clamp01(s.regrow * rate - (i - k) * 0.62);
          s.cur[i] = Math.max(0.0005, s.rest[i] * easeOut(p));
          s.grow[i + 1] = clamp01((s.regrow * rate - (i - k) * 0.62 - 0.5) / 1.4);
          if (s.grow[i + 1] < 1) done = false;
        }
        if (done) s.regrow = -1;
      }
    }
    draw(dt, t, wind);
  }

  function draw(dt, t, wind) {
    camPos.setFromMatrixPosition(camera.matrixWorld);
    let seg = 0, li = 0;
    for (const s of strands) {
      const n = s.n;
      // ring frame at each node: the tangent, and a side vector across the view, so the tube faces the camera
      for (let k = 0; k < n - 1; k++, seg++) {
        for (let e = 0; e < 2; e++) {
          const i = k + e;
          nodeAt(s, i, v1);
          const ia = Math.max(0, i - 1), ib = Math.min(n - 1, i + 1);
          // across a break, the piece's own neighbour
          const a2 = s.cut >= 0 && i === s.cut + 1 ? i : ia, b2 = s.cut >= 0 && i === s.cut ? i : ib;
          nodeAt(s, b2, tng); nodeAt(s, a2, v2); tng.sub(v2);
          if (tng.lengthSq() < 1e-12) tng.set(0, -1, 0); else tng.normalize();
          view.copy(camPos).sub(v1).normalize();
          nA.crossVectors(tng, view); if (nA.lengthSq() < 1e-8) nA.set(1, 0, 0); else nA.normalize();
          nB.crossVectors(tng, nA);
          let r = s.r0 * (1 - 0.62 * (i / (n - 1)));
          if (k === s.cut) r = 0;
          if (s.cur[k] < 0.001) r *= s.cur[k] / 0.001;
          if (s.regrow >= 0 && k >= s.regrowFrom) r *= 0.4 + 0.6 * clamp01(s.cur[k] / s.rest[k]);
          const base = (seg * VPS + e * RAD) * 3, al = s.alpha[i];
          for (let j = 0; j < RAD; j++) {
            const an = (j / RAD) * Math.PI * 2, ca = Math.cos(an), sa = Math.sin(an);
            const nx = nA.x * ca + nB.x * sa, ny = nA.y * ca + nB.y * sa, nz = nA.z * ca + nB.z * sa;
            const o = base + j * 3;
            sPos[o] = v1.x + nx * r; sPos[o + 1] = v1.y + ny * r; sPos[o + 2] = v1.z + nz * r;
            sNor[o] = nx; sNor[o + 1] = ny; sNor[o + 2] = nz;
            sA[o / 3] = al;
          }
        }
      }
      // leaves: out to alternate sides across the view, drooping, turned a little toward the camera
      for (const L of s.leaves) {
        const i = L.node;
        nodeAt(s, i, v1);
        const ia = s.cut >= 0 && i === s.cut + 1 ? i : i - 1, ib = Math.min(n - 1, i + 1);
        nodeAt(s, ib, tng); nodeAt(s, ia, v2); tng.sub(v2);
        if (tng.lengthSq() < 1e-12) tng.set(0, -1, 0); else tng.normalize();
        view.copy(camPos).sub(v1).normalize();
        nA.crossVectors(tng, view); if (nA.lengthSq() < 1e-8) nA.set(1, 0, 0); else nA.normalize();
        const flut = Math.sin(t * (2.2 + wind.e * 9) + L.ph) * (0.12 + wind.e * 0.35 + wind.lift * 0.5);
        // blade direction (local +Y)
        v2.copy(nA).multiplyScalar(L.side * (0.78 + flut)).addScaledVector(tng, 0.5).addScaledVector(view, 0.3).normalize();
        // face (local +Z): toward the camera, square to the blade, tipped and twisted a little
        v3.copy(view).addScaledVector(tng, L.tilt);
        v3.addScaledVector(v2, -v3.dot(v2)).normalize();
        q4.setFromAxisAngle(v2, L.twist + flut * 0.6);
        v3.applyQuaternion(q4);
        nB.crossVectors(v2, v3);
        const g = s.grow[i], sz = L.size * (g >= 1 ? 1 : easeBack(g) * (g > 0 ? 1 : 0));
        m4.makeBasis(nB.multiplyScalar(sz), v2.multiplyScalar(sz), v3.multiplyScalar(sz));
        m4.setPosition(v1);
        leafMesh.setMatrixAt(li, m4);
        lA[li] = s.alpha[i];
        li++;
      }
    }
    // loose leaves: tumbling, drifting down slower than they would fall, fading out
    for (const d of debris) {
      if (!d.on) { m4.makeScale(0, 0, 0); leafMesh.setMatrixAt(li, m4); lA[li] = 0; li++; continue; }
      d.age += dt;
      d.v.y -= G * 0.28 * dt;
      d.v.multiplyScalar(Math.exp(-dt * 2.2));
      d.v.x += Math.sin(d.age * 7 + d.spin) * 1.2 * dt;
      d.p.addScaledVector(d.v, dt);
      d.ang += d.spin * dt;
      const a = clamp01(1 - (d.age - d.life * 0.5) / (d.life * 0.5));
      if (d.age > d.life) d.on = false;
      q4.setFromAxisAngle(d.ax, d.ang);
      m4.compose(d.p, q4, v1.set(d.size, d.size, d.size));
      leafMesh.setMatrixAt(li, m4);
      lA[li] = a;
      li++;
    }
    stemGeo.attributes.position.needsUpdate = true;
    stemGeo.attributes.normal.needsUpdate = true;
    stemGeo.attributes.aA.needsUpdate = true;
    leafMesh.instanceMatrix.needsUpdate = true;
    leafGeo.attributes.aA.needsUpdate = true;
  }

  // the node under a screen point (0..1), within `rad` CSS pixels of a strand still on the roof
  function pick(x, y, rad) {
    let best = null, bd = rad * rad;
    for (const s of strands) {
      const last = s.cut >= 0 ? s.cut : s.n - 1;
      for (let i = 1; i <= last; i++) {
        nodeAt(s, i, v1); toScreen(v1, scr);
        const dx = (scr[0] - x) * W, dy = (scr[1] - y) * Hh, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = { s, i }; }
      }
    }
    return best;
  }

  return {
    // anchor every strand on the roof just under the app's top bar, at its distance in front of the camera
    place(topFrac, w, h) {
      W = w; Hh = h;
      for (const s of strands) {
        onPlane(s.c.sx, topFrac * 0.5, v1.copy(fwd.set(0, 0, -s.c.d)).applyMatrix4(camera.matrixWorld), s.anchor);
        resetStrand(s);
      }
    },
    update,
    hit(x, y) { return !!pick(x, y, 30); },
    grab(x, y) {
      const p = pick(x, y, 34);
      if (!p) return false;
      held = p; p.s.grab = p.i; p.s.stress = 0;
      nodeAt(p.s, p.i, v1);
      onPlane(x, y, v1, tgtRaw);
      tgt.copy(tgtRaw); tgtPrev.copy(tgt);
      off.copy(v1).sub(tgt);
      speed = 0; heldVel.set(0, 0, 0);
      haptic('soft');
      return true;
    },
    move(x, y) {
      if (!held) return;
      nodeAt(held.s, held.i, v1);
      onPlane(x, y, v1, tgtRaw);
    },
    release(vx, vy) {
      if (!held) return;
      const s = held.s, i = held.i;
      held = null; s.grab = -1;
      // hand the swing over: the finger's speed (per screen per second) as the node's speed in the world
      if (typeof vx === 'number' && typeof vy === 'number' && (vx || vy)) {
        nodeAt(s, i, v1);
        const dist = v2.setFromMatrixPosition(camera.matrixWorld).distanceTo(v1);
        const hw = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        v2.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(vx * hw * camera.aspect);
        v3.set(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(-vy * hw);
        v2.add(v3).clampLength(0, 12);
        // a whip of a release snaps it too
        if (s.cut < 0 && s.regrow < 0 && v2.length() > 6.5) {
          snap(s, Math.max(1, Math.min(s.n - 3, Math.round(i * 0.5 + Math.random() * 1.5))), v2.clone().multiplyScalar(0.45).clampLength(0, 3.5));
          return;
        }
        const k = i * 3;
        s.Q[k] = s.P[k] - v2.x * H; s.Q[k + 1] = s.P[k + 1] - v2.y * H; s.Q[k + 2] = s.P[k + 2] - v2.z * H;
      }
      s.stress = 0;
    },
    holding() { return !!held; },
    meshes: { stems, leafMesh },
    // where the strands are on screen, for the app to decide whether a touch grabs a plant
    zones() {
      return strands.map((s, si) => {
        const out = zoneOut[si], last = s.cut >= 0 ? s.cut : s.n - 1;
        let m = 0;
        for (let i = 1; i <= last; i++) {
          nodeAt(s, i, v1); toScreen(v1, scr);
          out[m++] = Math.round(scr[0] * 1000) / 1000; out[m++] = Math.round(scr[1] * 1000) / 1000;
        }
        return out.slice(0, m);
      });
    },
  };
}
