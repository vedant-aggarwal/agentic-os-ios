// Pothos trailing from the cave roof at the top corners of the frame, in two clumps that spill over the rock lip.
// Each strand is a rope of nodes (verlet, a few constraint passes and a little stiffness), drawn as a smooth curved
// stem through them. Leaves are painted, not flat: heart-shaped with a petiole, a pale midrib and side veins, some
// marbled gold, young lime ones at the tips, and the daylight through the crack glows through them from behind.
// It sways in the cave air, swings when you drag it and blows about when the spinning stone throws the fog up.
// Touch a strand and the leaves near your finger fold shut along the midrib (like a touch-me-not) and open again,
// a ripple runs down it and a few dew drops shake off. Pull or swing one too hard and it snaps at a joint: the
// piece you tore off flies on, tumbling, and fades, a few leaves shake loose, and two to three seconds later the
// stub grows it back, leaves unfurling as it goes. A few fireflies drift about the cave; they dart away from your
// finger and get blown about, and up and out, by the spinning stone, then wander back.
import * as THREE from 'three';

const G = 9.8, H = 1 / 120, ITER = 7, RAD = 6, SUB = 4, DEBRIS = 12, DROPS = 24;
const STRANDS = [
  // screen x, length as a share of the frame's height, distance from the camera, nodes, leaf size, seed
  { sx: 0.035, len: 0.5, d: 2.45, n: 14, leaf: 1.05, seed: 3 },
  { sx: 0.1, len: 0.36, d: 2.6, n: 11, leaf: 0.95, seed: 7 },
  { sx: 0.15, len: 0.23, d: 2.8, n: 8, leaf: 0.85, seed: 41 },
  { sx: 0.235, len: 0.15, d: 3.0, n: 6, leaf: 0.75, seed: 11 },
  { sx: 0.79, len: 0.2, d: 2.9, n: 7, leaf: 0.8, seed: 17 },
  { sx: 0.875, len: 0.33, d: 2.7, n: 10, leaf: 0.92, seed: 29 },
  { sx: 0.955, len: 0.46, d: 2.5, n: 13, leaf: 1.05, seed: 23 },
];
// where the fireflies like to be: screen x, screen y, distance from the camera
const FLY_HOMES = [[0.13, 0.56, 3.3], [0.24, 0.4, 3.0], [0.86, 0.52, 3.4], [0.74, 0.64, 4.0], [0.3, 0.72, 4.4], [0.64, 0.36, 3.8], [0.92, 0.7, 3.1]];
const FLIES = FLY_HOMES.length;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeBack = (t) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── the leaves, painted once into a 2x2 atlas ──────────────────────────────────────────────────────────────
// Cells: 0 deep green, 1 marbled gold, 2 young lime, 3 old and dark with a dry tip. In a cell, u runs across the
// leaf and v from the petiole's foot (0) to the tip (1); the blade starts at v = 0.3.
const CELL = 256;
function leafAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = CELL * 2;
  const x = c.getContext('2d');
  const r = rng(9091);
  const variants = [
    { base: '#2C5A1F', edge: '#163212', rib: '#7FA94A', vein: 'rgba(150,190,95,0.32)' },
    { base: '#3A6A24', edge: '#1D3B14', rib: '#E2D58A', vein: 'rgba(225,215,140,0.3)', gold: true },
    { base: '#6A9A2E', edge: '#3F6A1A', rib: '#B8D77A', vein: 'rgba(205,235,150,0.35)' },
    { base: '#24461A', edge: '#11250C', rib: '#5F8640', vein: 'rgba(120,160,80,0.28)', dry: true },
  ];
  variants.forEach((V, k) => {
    // canvas y runs down and the texture is flipped, so cells 0 and 1 (v 0..0.5) sit on the canvas's bottom row
    const ox = (k % 2) * CELL, oy = (1 - Math.floor(k / 2)) * CELL;
    // leaf space to canvas: u in -0.5..0.5, v in 0..1, inside a padded cell
    const P = 10, S = CELL - P * 2;
    const X = (u) => ox + P + (u + 0.5) * S, Y = (v) => oy + P + (1 - v) * S;
    const skew = (r() - 0.5) * 0.04;
    const blade = new Path2D();
    blade.moveTo(X(0), Y(0.31));
    blade.bezierCurveTo(X(-0.1), Y(0.2), X(-0.33), Y(0.22), X(-0.4), Y(0.42));
    blade.bezierCurveTo(X(-0.46), Y(0.6), X(-0.24), Y(0.8), X(-0.02 + skew), Y(0.985));
    blade.bezierCurveTo(X(0.22 + skew), Y(0.8), X(0.47), Y(0.6), X(0.41), Y(0.42));
    blade.bezierCurveTo(X(0.34), Y(0.22), X(0.1), Y(0.2), X(0), Y(0.31));
    // petiole: a thin stalk, a little thicker where it joins the stem
    x.strokeStyle = V.edge; x.lineCap = 'round';
    x.lineWidth = 6; x.beginPath(); x.moveTo(X(0), Y(0.0)); x.quadraticCurveTo(X(0.02), Y(0.16), X(0), Y(0.33)); x.stroke();
    x.strokeStyle = V.rib; x.globalAlpha = 0.55; x.lineWidth = 2.5; x.stroke(); x.globalAlpha = 1;
    x.save();
    x.clip(blade);
    // base colour, darker toward the rim
    const g = x.createRadialGradient(X(0), Y(0.5), S * 0.05, X(0), Y(0.5), S * 0.5);
    g.addColorStop(0, V.base); g.addColorStop(0.75, V.base); g.addColorStop(1, V.edge);
    x.fillStyle = g; x.fillRect(ox, oy, CELL, CELL);
    // marbling on the gold one: streaks that follow the side veins out from the midrib
    if (V.gold) {
      x.filter = 'blur(2.5px)';
      for (let i = 0; i < 9; i++) {
        const v0 = 0.36 + r() * 0.55, side = r() < 0.5 ? -1 : 1, len = 0.12 + r() * 0.25;
        x.strokeStyle = `rgba(226,212,128,${0.35 + r() * 0.45})`;
        x.lineWidth = 3 + r() * 9;
        x.beginPath(); x.moveTo(X(side * 0.02), Y(v0));
        x.quadraticCurveTo(X(side * len * 0.6), Y(v0 + 0.03), X(side * len), Y(v0 + 0.1 + r() * 0.06)); x.stroke();
      }
      x.filter = 'none';
    }
    // fine mottling, so it never reads as flat paint
    for (let i = 0; i < 900; i++) {
      const u = (r() - 0.5) * 0.9, v = 0.2 + r() * 0.8, a = r() * 0.07;
      x.fillStyle = r() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,220,${a * 0.7})`;
      x.fillRect(X(u), Y(v), 1 + r() * 2, 1 + r() * 2);
    }
    // side veins: pairs curving from the midrib up toward the rim
    x.strokeStyle = V.vein; x.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const v0 = 0.33 + i * 0.1, reach = 0.36 - i * 0.045;
      for (const side of [-1, 1]) {
        x.lineWidth = 2.2 - i * 0.22;
        x.beginPath(); x.moveTo(X(0), Y(v0));
        x.quadraticCurveTo(X(side * reach * 0.55), Y(v0 + 0.02), X(side * reach), Y(v0 + 0.14)); x.stroke();
      }
    }
    // the midrib, pale and tapering to the tip
    for (let i = 0; i < 24; i++) {
      const a = i / 24, b = (i + 1) / 24;
      x.strokeStyle = V.rib; x.lineWidth = 4.2 * (1 - a) + 0.6;
      x.beginPath(); x.moveTo(X(skew * a), Y(0.31 + a * 0.67)); x.lineTo(X(skew * b), Y(0.31 + b * 0.67)); x.stroke();
    }
    // an old leaf: the tip dried brown
    if (V.dry) {
      const dg = x.createLinearGradient(0, Y(0.72), 0, Y(1));
      dg.addColorStop(0, 'rgba(110,80,35,0)'); dg.addColorStop(0.5, 'rgba(110,80,35,0.6)'); dg.addColorStop(1, 'rgba(80,55,25,0.95)');
      x.fillStyle = dg; x.fillRect(ox, oy, CELL, CELL);
    }
    // a thin dark rim
    x.restore();
    x.strokeStyle = V.edge; x.lineWidth = 1.6; x.stroke(blade);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// a leaf: a bent strip, flat at the petiole, the blade cupped along its midrib and its tip curling back
function leafGeometry() {
  const g = new THREE.PlaneGeometry(1, 1, 6, 12);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), b = Math.max(0, y - 0.3);
    p.setZ(i, -0.55 * x * x * Math.min(1, b * 6) + 0.1 * b * (0.7 - b) - 0.25 * b * b * b + 0.04 * Math.sin(y * 7));
  }
  g.computeVertexNormals();
  return g;
}

// Screen-door fade: stays opaque (no sorting, writes depth so the fog stays behind), dissolves as alpha drops.
// Leaves also take their atlas cell from the instance, and the sun behind them shows through.
function patch(m, key, leaf, sun) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aA; varying float vA;${leaf ? ' attribute vec2 aCell;' : ''}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = aA;');
    if (leaf) sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = uv*0.5 + aCell;\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vA;${leaf ? ' uniform vec3 uSunV; uniform vec3 uSunCol;' : ''}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vA < 0.995 && fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) > vA) discard;`);
    if (leaf) {
      sh.uniforms.uSunV = sun.dir; sh.uniforms.uSunCol = sun.col;
      // light through the leaf: strongest when the sun is right behind it, a softer glow whenever it is on the
      // leaf's far side; it comes out yellow-green
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
        vec3 Vv = normalize(vViewPosition);
        float back = clamp(dot(-normal, uSunV), 0.0, 1.0);
        float through = pow(clamp(dot(-Vv, uSunV), 0.0, 1.0), 3.0);
        vec3 tint = diffuseColor.rgb*vec3(1.05, 1.25, 0.55) + vec3(0.004, 0.006, 0.0);
        outgoingLight += tint*uSunCol*(back*0.55 + through*1.1);
        // the underside is paler and duller than the waxy top
        if (!gl_FrontFacing) outgoingLight = mix(outgoingLight, vec3(dot(outgoingLight, vec3(0.3, 0.5, 0.2)))*vec3(0.95, 1.08, 0.85), 0.35)*1.25;
        #include <opaque_fragment>`);
    }
  };
  m.customProgramCacheKey = () => key;
  return m;
}

export function createPlants({ scene, camera, haptic, reduce, sunFrom, sunColor, px = 1 }) {
  const strands = STRANDS.map((c) => {
    const n = c.n, r = rng(c.seed * 977);
    const leaves = [];
    // a clump at the root, spilling over the rock lip so the strand comes out of foliage, not out of nowhere
    for (let j = 0; j < 2; j++) {
      leaves.push({ node: 0, clump: true, ang: 0.15 + r() * 0.75, side: j ? 1 : -1, size: c.leaf * (0.085 + r() * 0.035), twist: (r() - 0.5) * 2.0, tilt: (r() - 0.5) * 0.8, ph: r() * 6.28, cell: r() < 0.35 ? 1 : r() < 0.3 ? 3 : 0 });
    }
    // then one leaf a node, alternate sides, smaller toward the tip, and the last couple still young
    for (let i = 1; i < n; i++) {
      const tip = i / (n - 1);
      const cell = i >= n - 2 ? 2 : r() < 0.3 ? 1 : r() < 0.15 ? 3 : 0;
      if (i > 1 && i < n - 2 && r() < 0.18) continue; // a bare stretch here and there, where a leaf has dropped
      leaves.push({ node: i, side: i % 2 ? 1 : -1, size: c.leaf * (0.1 - 0.048 * tip) * (0.8 + r() * 0.4), twist: (r() - 0.5) * 2.4, tilt: (r() - 0.5) * 1.2, ph: r() * 6.28, cell });
      if (i < n - 3 && r() < 0.22) leaves.push({ node: i, side: i % 2 ? -1 : 1, size: c.leaf * (0.06 - 0.02 * tip) * (0.8 + r() * 0.4), twist: (r() - 0.5) * 1.4, tilt: (r() - 0.5) * 0.8, ph: r() * 6.28, cell: 2 });
    }
    for (const L of leaves) { L.fold = 0; L.foldAt = -10; L.tip = new THREE.Vector3(); }
    return {
      c, n, leaves,
      P: new Float32Array(n * 3), Q: new Float32Array(n * 3),
      rest: new Float32Array(n - 1), cur: new Float32Array(n - 1), alpha: new Float32Array(n).fill(1),
      grow: new Float32Array(n).fill(1), // per node: how far the leaves on it have unfurled
      anchor: new THREE.Vector3(), r0: 0.0042 * c.leaf + 0.0018,
      cut: -1, fall: 0, wait: 0, regrow: -1,
      grab: -1, stress: 0, plane: new THREE.Vector3(),
      ripAt: -10, ripFrom: 0, ripA: 0,
      lean: c.sx < 0.5 ? 1 : -1, // draped in over the lip, toward the middle
    };
  });

  // stems: one dynamic mesh; every link between two nodes is a short smooth tube of SUB pieces (its own rings, so
  // a broken link simply closes up), following a curve through the nodes either side
  let segs = 0;
  for (const s of strands) segs += s.n - 1;
  const RINGS = SUB + 1, VPS = RINGS * RAD, vCount = segs * VPS;
  const sPos = new Float32Array(vCount * 3), sNor = new Float32Array(vCount * 3), sA = new Float32Array(vCount).fill(1), sCol = new Float32Array(vCount * 3);
  const idx = [];
  for (let k = 0; k < segs; k++) {
    for (let q = 0; q < SUB; q++) {
      const b = k * VPS + q * RAD;
      for (let j = 0; j < RAD; j++) {
        const a0 = b + j, a1 = b + (j + 1) % RAD, c0 = b + RAD + j, c1 = b + RAD + (j + 1) % RAD;
        idx.push(a0, a1, c0, a1, c1, c0);
      }
    }
  }
  {
    // woody olive near the root, green toward the growing tip
    const old = new THREE.Color('#2B261A'), young = new THREE.Color('#3E5523'), col = new THREE.Color();
    let seg = 0;
    for (const s of strands) {
      for (let k = 0; k < s.n - 1; k++, seg++) {
        for (let q = 0; q < RINGS; q++) {
          col.copy(old).lerp(young, Math.min(1, ((k + q / SUB) / (s.n - 1)) ** 0.8 * 1.15));
          for (let j = 0; j < RAD; j++) { const o = (seg * VPS + q * RAD + j) * 3; sCol[o] = col.r; sCol[o + 1] = col.g; sCol[o + 2] = col.b; }
        }
      }
    }
  }
  const stemGeo = new THREE.BufferGeometry();
  stemGeo.setIndex(idx);
  stemGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  stemGeo.setAttribute('normal', new THREE.BufferAttribute(sNor, 3).setUsage(THREE.DynamicDrawUsage));
  stemGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  stemGeo.setAttribute('aA', new THREE.BufferAttribute(sA, 1).setUsage(THREE.DynamicDrawUsage));
  const stemMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, envMapIntensity: 0.6 }), 'stem2', false);
  const stems = new THREE.Mesh(stemGeo, stemMat);
  stems.frustumCulled = false;
  scene.add(stems);

  // leaves: one instanced mesh for every strand, plus a few loose ones that shake off when a strand snaps
  const sun = { dir: { value: new THREE.Vector3(0, 1, 0) }, col: { value: new THREE.Color(sunColor || '#FFD7AE').multiplyScalar(0.9) } };
  let nLeaves = 0;
  for (const s of strands) nLeaves += s.leaves.length;
  const LCOUNT = nLeaves + DEBRIS;
  const leafGeo = leafGeometry();
  const lA = new Float32Array(LCOUNT).fill(1), lCell = new Float32Array(LCOUNT * 2);
  leafGeo.setAttribute('aA', new THREE.InstancedBufferAttribute(lA, 1).setUsage(THREE.DynamicDrawUsage));
  leafGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(lCell, 2));
  const leafMat = patch(new THREE.MeshPhysicalMaterial({
    map: leafAtlas(), alphaTest: 0.5, alphaToCoverage: true, roughness: 0.48, metalness: 0, side: THREE.DoubleSide,
    clearcoat: 0.45, clearcoatRoughness: 0.32, envMapIntensity: 1.5,
  }), 'leaf2', true, sun);
  const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, LCOUNT);
  leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  leafMesh.frustumCulled = false;
  {
    const r = rng(4242), col = new THREE.Color();
    let li = 0;
    const setCell = (i, k) => { lCell[i * 2] = (k % 2) * 0.5; lCell[i * 2 + 1] = Math.floor(k / 2) * 0.5; };
    for (const s of strands) for (const L of s.leaves) setCell(li++, L.cell);
    for (let i = 0; i < DEBRIS; i++) setCell(li++, i % 3 === 0 ? 2 : 0);
    for (let i = 0; i < LCOUNT; i++) {
      col.setRGB(0.88 + r() * 0.24, 0.9 + r() * 0.2, 0.85 + r() * 0.2); // a near-white tint, so no two leaves match
      leafMesh.setColorAt(i, col);
    }
  }
  scene.add(leafMesh);
  const debris = Array.from({ length: DEBRIS }, () => ({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), age: 0, life: 1, size: 0.05, spin: 0, ax: new THREE.Vector3(1, 0, 0), ang: 0 }));
  let debrisNext = 0;

  // ── fireflies and dew drops: one set of glowing points ──
  const NP = FLIES + DROPS;
  const gPos = new Float32Array(NP * 3), gCol = new Float32Array(NP * 3), gSize = new Float32Array(NP);
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3).setUsage(THREE.DynamicDrawUsage));
  glowGeo.setAttribute('aCol', new THREE.BufferAttribute(gCol, 3).setUsage(THREE.DynamicDrawUsage));
  glowGeo.setAttribute('aSize', new THREE.BufferAttribute(gSize, 1).setUsage(THREE.DynamicDrawUsage));
  const glow = new THREE.Points(glowGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aCol; attribute float aSize; varying vec3 vC;
      void main(){ vC = aCol; vec4 mv = modelViewMatrix*vec4(position, 1.0); gl_PointSize = aSize*(3.0/max(0.5, -mv.z)); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC;
      void main(){ vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c)*4.0; float a = (exp(-r2*9.0) + exp(-r2*2.2)*0.18)*smoothstep(1.0, 0.55, r2);
        gl_FragColor = vec4(vC*a, 1.0); }`,
  }));
  glow.frustumCulled = false;
  glow.renderOrder = 4;
  scene.add(glow);
  const FLY_COL = new THREE.Color('#D6FF6A');
  const flies = FLY_HOMES.map((h, i) => {
    const r = rng(700 + i * 13);
    return { h, home: new THREE.Vector3(), p: new THREE.Vector3(), v: new THREE.Vector3(), ph: r() * 6.28, period: 2.4 + r() * 2.2, wob: r() * 100, scare: 0 };
  });
  const drops = Array.from({ length: DROPS }, () => ({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), age: 0, life: 1.3 }));
  let dropNext = 0;

  // scratch, so a frame allocates nothing
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), tng = new THREE.Vector3(), nA = new THREE.Vector3(), nB = new THREE.Vector3();
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), p3 = new THREE.Vector3(), cp = new THREE.Vector3();
  const view = new THREE.Vector3(), fwd = new THREE.Vector3(), camPos = new THREE.Vector3(), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion();
  const ndc = new THREE.Vector3(), tgt = new THREE.Vector3(), tgtRaw = new THREE.Vector3(), tgtPrev = new THREE.Vector3(), off = new THREE.Vector3();
  const zoneOut = strands.map((s) => new Array((s.n - 1) * 2).fill(0));
  let held = null, speed = 0, heldVel = new THREE.Vector3(), acc = 0, W = 1, Hh = 1, pinT = 1, now = 0;
  const sunPos = (sunFrom || new THREE.Vector3(-1.9, 5.4, 1.1)).clone();

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

  // the touch-me-not: leaves round node i fold shut, the nearest first; a ripple runs down the strand from there
  function startle(s, i, amp) {
    for (const L of s.leaves) {
      const d = Math.abs(L.node - i);
      if (d <= 3 && !L.clump) L.foldAt = now + d * 0.06;
    }
    s.ripAt = now; s.ripFrom = i; s.ripA = amp;
  }
  // dew shaken off the leaves near node i
  function shake(s, i, count, kick) {
    let made = 0;
    for (const L of s.leaves) {
      if (made >= count) break;
      if (Math.abs(L.node - i) > 3 || Math.random() < 0.35) continue;
      const d = drops[dropNext]; dropNext = (dropNext + 1) % DROPS;
      d.on = true; d.age = 0; d.life = 1.1 + Math.random() * 0.5;
      d.p.copy(L.tip);
      d.v.set((Math.random() - 0.5) * 0.5, 0.15 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3);
      if (kick) d.v.addScaledVector(kick, 0.25);
      made++;
    }
  }
  // fireflies within reach of a world point dart away from it
  function scatter(p, reach, force) {
    for (const f of flies) {
      v1.copy(f.p).sub(p);
      const d = v1.length();
      if (d > reach) continue;
      v1.multiplyScalar(1 / Math.max(d, 0.05));
      f.v.addScaledVector(v1, force * (1 - d / reach) + 0.4);
      f.scare = 1;
    }
  }

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
    // a few leaves shake loose at the break, and a spray of dew
    const brk = nodeAt(s, k + 1, new THREE.Vector3());
    for (let i = 0; i < 4; i++) {
      const d = debris[debrisNext]; debrisNext = (debrisNext + 1) % DEBRIS;
      d.on = true; d.age = 0; d.life = 1.1 + Math.random() * 0.6; d.size = s.c.leaf * (0.06 + Math.random() * 0.03);
      d.p.copy(brk);
      d.v.set((Math.random() - 0.5) * 1.6, 0.4 + Math.random() * 0.9, (Math.random() - 0.5) * 0.8);
      if (fly) d.v.addScaledVector(fly, 0.35);
      d.ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      d.spin = (Math.random() - 0.5) * 18; d.ang = Math.random() * 6.28;
    }
    shake(s, k, 5, fly);
    startle(s, k, 1.2);
    scatter(brk, 1.2, 2.2);
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
        const bend = Math.sin(i * 0.55 + seed) * 2.4 + s.lean * (1 - along) * 3.0; // a strand's own lie: never plumb
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
    now = t;
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
      // brushing past fireflies while you drag
      if (held && speed > 0.6) scatter(tgt, 0.5, 1.2);
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
      // folded leaves: shut fast, then open again slowly, overshooting a touch
      for (const L of s.leaves) {
        const age = t - L.foldAt;
        if (age < 0) continue;
        const shut = reduce() ? 0.4 : 1;
        L.fold = age < 0.16 ? shut * easeOut(age / 0.16) : shut * Math.exp(-(age - 0.16) * 1.5) * Math.cos(Math.min(age - 0.16, 2.2) * 1.1);
        if (age > 4) { L.fold = 0; L.foldAt = -10; }
      }
    }
    updateGlow(dt, t, wind);
    draw(dt, t, wind);
  }

  function updateGlow(dt, t, wind) {
    const calm = reduce();
    let gi = 0;
    for (const f of flies) {
      // wander round home on a slow loop; spring back to it; the whirl drags them round and the updraft up and out
      const w = calm ? 0 : 1;
      v1.set(Math.sin(t * 0.37 + f.wob) * 0.16 + Math.sin(t * 0.91 + f.wob * 2) * 0.05, Math.sin(t * 0.29 + f.wob * 1.3) * 0.1, Math.cos(t * 0.33 + f.wob) * 0.12).multiplyScalar(w);
      v1.add(f.home).sub(f.p);
      f.v.addScaledVector(v1, dt * (2.2 - 1.6 * f.scare));
      f.v.x += wind.side * 0.08 * dt * (1 + f.p.y);
      f.v.y += wind.up * 0.25 * dt;
      f.v.multiplyScalar(Math.exp(-dt * (calm ? 4 : 1.4)));
      f.p.addScaledVector(f.v, dt);
      f.scare = Math.max(0, f.scare - dt * 0.6);
      // a slow pulse with a short bright flash every few seconds; frightened, they flicker fast
      const flash = Math.max(0, Math.sin(t * 6.283 / f.period + f.ph)) ** 14;
      const flick = f.scare * (0.5 + 0.5 * Math.sin(t * 34 + f.ph)) * 0.9;
      const b = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.3 + f.ph)) + flash * 2.6 + flick;
      gPos[gi * 3] = f.p.x; gPos[gi * 3 + 1] = f.p.y; gPos[gi * 3 + 2] = f.p.z;
      gCol[gi * 3] = FLY_COL.r * b; gCol[gi * 3 + 1] = FLY_COL.g * b; gCol[gi * 3 + 2] = FLY_COL.b * b;
      gSize[gi] = (9 + flash * 6) * px;
      gi++;
    }
    for (const d of drops) {
      if (!d.on) { gSize[gi] = 0; gCol[gi * 3] = gCol[gi * 3 + 1] = gCol[gi * 3 + 2] = 0; gi++; continue; }
      d.age += dt;
      d.v.y -= G * 0.55 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.age > d.life) d.on = false;
      // a cold glint, brightest where a drop catches the light as it falls
      const a = clamp01(1 - d.age / d.life) * (0.7 + 0.6 * Math.max(0, Math.sin(d.age * 22 + d.p.x * 40)));
      gPos[gi * 3] = d.p.x; gPos[gi * 3 + 1] = d.p.y; gPos[gi * 3 + 2] = d.p.z;
      gCol[gi * 3] = 1.1 * a; gCol[gi * 3 + 1] = 1.24 * a; gCol[gi * 3 + 2] = 1.3 * a;
      gSize[gi] = 3.2 * px;
      gi++;
    }
    glowGeo.attributes.position.needsUpdate = true;
    glowGeo.attributes.aCol.needsUpdate = true;
    glowGeo.attributes.aSize.needsUpdate = true;
  }

  // a point on the curve through four nodes (p0..p3, between p1 and p2), and its direction
  function curve(t, out, dir) {
    const t2 = t * t, t3 = t2 * t;
    out.set(0, 0, 0)
      .addScaledVector(p1, 2)
      .addScaledVector(cp.copy(p2).sub(p0), t)
      .addScaledVector(cp.copy(p0).multiplyScalar(2).addScaledVector(p1, -5).addScaledVector(p2, 4).sub(p3), t2)
      .addScaledVector(cp.copy(p1).multiplyScalar(3).sub(p0).addScaledVector(p2, -3).add(p3), t3)
      .multiplyScalar(0.5);
    dir.copy(p2).sub(p0)
      .addScaledVector(cp.copy(p0).multiplyScalar(2).addScaledVector(p1, -5).addScaledVector(p2, 4).sub(p3), 2 * t)
      .addScaledVector(cp.copy(p1).multiplyScalar(3).sub(p0).addScaledVector(p2, -3).add(p3), 3 * t2);
    if (dir.lengthSq() < 1e-12) dir.set(0, -1, 0); else dir.normalize();
  }

  function draw(dt, t, wind) {
    camPos.setFromMatrixPosition(camera.matrixWorld);
    // the sun, seen from the plants, in view space, for the light through the leaves
    sun.dir.value.copy(sunPos).sub(v1.set(0, 1.4, 2.2)).normalize().transformDirection(camera.matrixWorldInverse);
    let seg = 0, li = 0;
    for (const s of strands) {
      const n = s.n;
      for (let k = 0; k < n - 1; k++, seg++) {
        // the four nodes the curve runs through; across a break each piece uses only its own
        nodeAt(s, k, p1); nodeAt(s, k + 1, p2);
        if (k === 0 || s.cut === k - 1) p0.copy(p1).multiplyScalar(2).sub(p2); else nodeAt(s, k - 1, p0);
        if (k + 2 > n - 1 || s.cut === k + 1) p3.copy(p2).multiplyScalar(2).sub(p1); else nodeAt(s, k + 2, p3);
        let rk = 1;
        if (k === s.cut) rk = 0;
        if (s.cur[k] < 0.001) rk *= s.cur[k] / 0.001;
        if (s.regrow >= 0 && k >= s.regrowFrom) rk *= 0.4 + 0.6 * clamp01(s.cur[k] / s.rest[k]);
        for (let q = 0; q < RINGS; q++) {
          const u = q / SUB;
          curve(u, v1, tng);
          view.copy(camPos).sub(v1).normalize();
          nA.crossVectors(tng, view); if (nA.lengthSq() < 1e-8) nA.set(1, 0, 0); else nA.normalize();
          nB.crossVectors(tng, nA);
          const along = (k + u) / (n - 1);
          // tapering, with a slight swelling at each node where a leaf comes off
          const knot = 1 + 0.22 * (Math.exp(-((u / 0.16) ** 2)) + Math.exp(-(((1 - u) / 0.16) ** 2)));
          const r = s.r0 * (1 - 0.6 * along) * knot * rk;
          const al = s.alpha[k] + (s.alpha[k + 1] - s.alpha[k]) * u;
          const base = (seg * VPS + q * RAD) * 3;
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
      // leaves: drooping out to alternate sides on their petioles, turned a little toward the camera
      const ripAge = t - s.ripAt;
      for (const L of s.leaves) {
        const i = L.node;
        nodeAt(s, i, v1);
        if (i === 0) { nodeAt(s, 1, tng); tng.sub(v1); }
        else {
          const ia = s.cut >= 0 && i === s.cut + 1 ? i : i - 1, ib = Math.min(n - 1, i + 1);
          nodeAt(s, ib, tng); nodeAt(s, ia, v2); tng.sub(v2);
        }
        if (tng.lengthSq() < 1e-12) tng.set(0, -1, 0); else tng.normalize();
        view.copy(camPos).sub(v1).normalize();
        nA.crossVectors(tng, view); if (nA.lengthSq() < 1e-8) nA.set(1, 0, 0); else nA.normalize();
        let flut = Math.sin(t * (2.2 + wind.e * 9) + L.ph) * (0.1 + wind.e * 0.35 + wind.lift * 0.5);
        // the ripple from a touch, travelling down the strand
        const rd = ripAge - Math.abs(i - s.ripFrom) * 0.045;
        if (rd > 0 && rd < 1.5) flut += s.ripA * Math.exp(-rd * 3.2) * Math.sin(rd * 26 + L.ph);
        const fold = L.fold;
        if (L.clump) {
          // fanned out round the root, mostly down and out over the lip
          v2.copy(nA).multiplyScalar(L.side * Math.cos(L.ang * Math.PI)).addScaledVector(tng, Math.sin(L.ang * Math.PI) + 0.2).addScaledVector(view, 0.35).normalize();
        } else {
          // blade direction (local +Y): out to its side and down; folding pulls it in against the stem
          v2.copy(nA).multiplyScalar(L.side * (0.7 + flut) * (1 - 0.7 * fold)).addScaledVector(tng, 0.62 + 0.5 * fold).addScaledVector(view, 0.28 * (1 - fold)).normalize();
        }
        // face (local +Z): toward the camera, square to the blade, tipped and twisted a little
        v3.copy(view).addScaledVector(tng, L.tilt);
        v3.addScaledVector(v2, -v3.dot(v2)).normalize();
        q4.setFromAxisAngle(v2, L.twist + flut * 0.6);
        v3.applyQuaternion(q4);
        nB.crossVectors(v2, v3);
        const g = s.grow[i], sz = L.size * (g >= 1 ? 1 : easeBack(g) * (g > 0 ? 1 : 0));
        L.tip.copy(v1).addScaledVector(v2, sz * 0.95);
        // folding closes the blade along its midrib
        m4.makeBasis(nB.multiplyScalar(sz * (1 - 0.72 * Math.max(0, fold))), v2.multiplyScalar(sz), v3.multiplyScalar(sz));
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
      for (const f of flies) {
        const [fx, fy, fd] = f.h;
        onPlane(fx, fy, v2.copy(fwd.set(0, 0, -fd)).applyMatrix4(camera.matrixWorld), f.home);
        f.p.copy(f.home); f.v.set(0, 0, 0);
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
      startle(p.s, p.i, 0.7);
      shake(p.s, p.i, 2, null);
      scatter(nodeAt(p.s, p.i, new THREE.Vector3()), 0.9, 1.6);
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
        if (v2.length() > 2.5) { s.ripAt = now; s.ripFrom = i; s.ripA = 0.6; shake(s, i, 2, v2.clone()); }
      }
      s.stress = 0;
    },
    holding() { return !!held; },
    meshes: { stems, leafMesh, glow },
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
