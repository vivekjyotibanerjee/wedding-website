import * as THREE from 'three';
import L from './landmarks.json';
import { GROUP, attachReveal, revealAttributes, revealMesh, revealUniforms, setReveal, swag, chunkBy, boundChunk, cullChunks, roomOf } from './util.js';
import { posCurve, at, NODE, floorY, stairAt, riserAt, stairSnap } from './walk.js';
import { tableBlooms } from './tables.js';

// ─────────────────────────────────────────────────────────────────────────────
// The wedding decoration — everything that is hung, wrapped or rolled out as the guest walks
// (plan: layer B). It is all built here at runtime from the landmarks rather than baked into the
// glb, because every piece has to appear on cue: marigold garlands swagged along the Shiva fronts,
// the halls' faces and inside them and the navaratna's arcades; mango-leaf torans over the doors
// the walk uses; a toran gate at the top of the ghat; the mandap's columns wrapped in jasmine and
// marigold with strands hanging from its canopy; and red carpets that roll out along the route.
// The blooms are InstancedMeshes in spatial chunks (util.chunkBy: culled when behind the camera
// or not yet begun), the leaves likewise; the reveal is in the vertex shader (util.attachReveal),
// keyed to the stage transitions. The carpets are sampled from the camera's own curve (walk.js)
// on the walking surface, so they lie exactly where the guest walks — rounded at the turns like
// a runner laid by hand, straight up the flights tread by tread with a fold down every riser,
// through the doors — and stop at the alpona before the mandap.
// ─────────────────────────────────────────────────────────────────────────────

const g = L.ground;
const [mx, , mz] = L.mandap.center;
const N = L.natmandir, R = L.radhakanta;
const nx = N.west_face_x, nz = N.center[2], nP = N.plinth_top;
const rx = R.west_face_x, rz = R.center[2], rP = R.plinth_top;
const pt = L.navaratna.platform_top;
const wall = L.navaratna.wall_x;
const gz = L.ghat.top[2];
const rDoor = (i) => rz + (i - (R.bays_west - 1) / 2) * R.bay_pitch;
const nDoor = (i) => nz + (i - (N.bays_west - 1) / 2) * N.bay_pitch;

// Marigold palette: saffron and turmeric in runs, a rose every so often, a leaf between runs —
// deliberate, symmetrical, the way a garland is actually strung.
const SAFFRON = new THREE.Color(1.0, 0.42, 0.04);
const TURMERIC = new THREE.Color(1.0, 0.7, 0.08);
const DEEP = new THREE.Color(0.9, 0.3, 0.03);
const ROSE = new THREE.Color(0.62, 0.04, 0.07);
const JASMINE = new THREE.Color(0.98, 0.96, 0.88);
const LEAF = new THREE.Color(0.12, 0.36, 0.09);
const LEAF2 = new THREE.Color(0.2, 0.46, 0.12);
const PALETTES = {
  marigold: (i) => (i % 14 === 6 ? ROSE : i % 7 === 3 ? LEAF : (Math.floor(i / 2) % 2 ? SAFFRON : TURMERIC)),
  saffron: (i) => (i % 9 === 4 ? DEEP : SAFFRON),
  jasmine: (i) => (i % 11 === 5 ? ROSE : JASMINE),
  mixed: (i) => (i % 4 === 0 ? JASMINE : i % 4 === 2 ? ROSE : TURMERIC),
  rose: () => ROSE,
};

export function buildDecor(scene, { reducedMotion = false, quality = 'high' } = {}) {
  const root = new THREE.Group();
  root.name = 'decor';
  const time = { value: 0 };
  const uniforms = revealUniforms(time);
  const disposables = [];
  const carpets = [];   // { u, group, keys: [[transition value, fraction of the length]] }
  const chunks = [];    // util.chunkBy chunks, each with its mesh (and `lod`, the near version, on the fast tier)
  const CELL = 14, LOD_NEAR = 5;

  // ── blooms ─────────────────────────────────────────────────────────────────
  const blooms = [];    // { p, c, s, order, group, hang, phase }
  const leaves = [];    // { p, rot, order, group, hang, c? }
  let count = 0;
  /**
   * A string of blooms along `pts` (already swagged/shaped), coloured by `palette`, radius `s`,
   * revealing from t = 0 to t = 1 between order o0 and o1 of `group`'s transition.
   */
  function bead(pts, { palette = 'marigold', s = 0.045, group, o0, o1, hang = (t) => 0, phase = Math.random() }) {
    const pick = PALETTES[palette];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      blooms.push({ p: pts[i], c: pick(count++), s: s * (0.9 + 0.2 * Math.random()), rx: Math.random() * 3, ry: Math.random() * 3, order: o0 < 0 ? -1 : o0 + (o1 - o0) * t, group, hang: hang(t), phase });
    }
  }
  /** Points along a swag between anchors a → b, spaced `step`. */
  const along = (a, b, sag, step = 0.07) => swag(a, b, sag, step);
  /** A strand hanging straight down from `top` for `len` metres. */
  const strand = (top, len, step = 0.07) => {
    const out = [];
    const T = top.isVector3 ? top : new THREE.Vector3(...top);
    for (let y = 0; y <= len + 1e-6; y += step) out.push(new THREE.Vector3(T.x, T.y - y, T.z));
    return out;
  };
  /** A helix round a vertical column: centre (cx, cz), radius r, from y0 up h, `turns`. */
  const helix = (cx, cz, r, y0, h, turns, step = 0.07) => {
    const len = Math.hypot(h, turns * 2 * Math.PI * r);
    const n = Math.round(len / step);
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = t * turns * 2 * Math.PI;
      out.push(new THREE.Vector3(cx + Math.cos(a) * r, y0 + h * t, cz + Math.sin(a) * r));
    }
    return out;
  };
  /**
   * A toran over a doorway: a marigold string across the arch with mango leaves hanging from it and
   * a short strand at each end. `axis` is the wall's direction: 'z' for a wall along z at x = face
   * (the halls' west faces, hung on the −x side), 'x' for one along x at z = face, hung on the +z side.
   */
  function toran(axis, face, center, ytop, width, { group, o0, o1 }) {
    const off = axis === 'z' ? -0.3 : 0.3;
    const at = (u) => (axis === 'z' ? new THREE.Vector3(face + off, ytop, center + u) : new THREE.Vector3(center + u, ytop, face + off));
    const a = at(-width / 2), b = at(width / 2);
    bead(along(a, b, 0.14, 0.06), { palette: 'saffron', s: 0.04, group, o0, o1, hang: (t) => 0.5 * 4 * t * (1 - t) });
    for (const e of [a, b]) bead(strand(e, 0.45), { palette: 'marigold', s: 0.04, group, o0: o0 < 0 ? -1 : o0 + (o1 - o0) * 0.7, o1, hang: (t) => t });
    const pend = swag(a, b, 0.14, 0.2);
    for (let i = 1; i < pend.length - 1; i++) leaves.push({ p: pend[i].clone().add(new THREE.Vector3(0, -0.08, 0)), rot: (axis === 'z' ? 0 : Math.PI / 2) + (Math.random() - 0.5) * 0.5, order: o0 < 0 ? -1 : o0 + (o1 - o0) * (i / pend.length), group, hang: 0.8 });
  }
  /** Bay-to-bay swags along a line of anchor points. */
  function swags(points, { sag = 0.32, group, o0, o1, palette = 'marigold', s = 0.045 }) {
    const n = points.length - 1;
    for (let i = 0; i < n; i++) {
      const t0 = o0 + (o1 - o0) * (i / n), t1 = o0 + (o1 - o0) * ((i + 1) / n);
      bead(along(points[i], points[i + 1], sag), { palette, s, group, o0: t0, o1: t1, hang: (t) => 0.4 * 4 * t * (1 - t) });
    }
  }

  // ── the toran gate at the top of the ghat ──────────────────────────────────
  // Two bamboo poles either side of the walk with a double swag and hanging strands: the first
  // thing dressed for the wedding, seen from the river.
  {
    const gx = L.ghat.top[0] + 1.2, h = 3.3, half = 2.6;
    const poleGeo = new THREE.CylinderGeometry(0.045, 0.06, h, 8);
    poleGeo.translate(0, h / 2, 0);
    revealMesh(poleGeo, 0.0, GROUP.gate);
    const poleMat = attachReveal(new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.8 }), uniforms);
    for (const s of [-1, 1]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(gx, g, gz + s * half);
      pole.castShadow = false;     // the shadow map is rendered on demand: a pole's shadow before the pole would show
      root.add(pole);
    }
    disposables.push(poleGeo, poleMat);
    const a = new THREE.Vector3(gx, g + h - 0.1, gz - half), b = new THREE.Vector3(gx, g + h - 0.1, gz + half);
    bead(along(a, b, 0.5), { palette: 'marigold', s: 0.05, group: GROUP.gate, o0: 0.15, o1: 0.6, hang: (t) => 0.5 * 4 * t * (1 - t) });
    bead(along(a.clone().setY(a.y - 0.25), b.clone().setY(b.y - 0.25), 0.75), { palette: 'jasmine', s: 0.03, group: GROUP.gate, o0: 0.3, o1: 0.75, hang: (t) => 0.6 * 4 * t * (1 - t) });
    for (const e of [a, b]) bead(strand(e, 1.1), { palette: 'marigold', s: 0.045, group: GROUP.gate, o0: 0.55, o1: 0.88, hang: (t) => t });
    const pend = swag(a, b, 0.5, 0.22);
    for (let i = 1; i < pend.length - 1; i++) leaves.push({ p: pend[i].clone().add(new THREE.Vector3(0, -0.09, 0)), rot: (Math.random() - 0.5) * 0.5, order: 0.2 + 0.4 * (i / pend.length), group: GROUP.gate, hang: 0.8 });
  }

  // ── the Shiva fronts ───────────────────────────────────────────────────────
  // Corner to corner along the temple fronts under the string lights, both groups; the north group
  // draws in first (the walk goes that way), the south is seen from the ghat top.
  {
    const xs = L.shiva.x + L.shiva.size / 2 + 0.25, ys = L.shiva.plinth_top + 4.7, hs = L.shiva.size / 2;
    for (const [first, dir, o0, o1] of [[L.shiva.first_north[2], -1, 0.0, 0.3], [L.shiva.first_south[2], 1, 0.08, 0.34]]) {
      for (let i = 0; i < L.shiva.count; i++) {
        const zc = first + dir * i * L.shiva.pitch;
        const o = o0 + (o1 - o0) * (i / L.shiva.count);
        swags([[xs, ys, zc - hs + 0.15], [xs, ys, zc], [xs, ys, zc + hs - 0.15]], { sag: 0.4, group: GROUP.flowers, o0: o, o1: o + (o1 - o0) / L.shiva.count });
      }
    }
  }

  // ── the halls: faces, doors and inside ─────────────────────────────────────
  for (const [H, hx, hz, top, dGroup, dO, fGroup, fO, iGroup, iO, doorOf] of [
    [R, rx, rz, rP, GROUP.prep, [0.2, 0.9], GROUP.flowers, [0.28, 0.5], GROUP.flowers, [0.48, 0.9], rDoor],
    [N, nx, nz, nP, GROUP.mandap, [0.5, 1.0], GROUP.full, [0.0, 0.3], GROUP.full, [0.28, 0.8], nDoor],
  ]) {
    const [aw, ah] = H.arch;
    const bays = H.bays_west;
    // torans over every west door, in walk order
    for (let i = 0; i < bays; i++) {
      const k = H === R ? i : bays - 1 - i;    // the Radhakanta is walked north→south, the nat-mandir south→north
      const o = dO[0] + (dO[1] - dO[0]) * (k / bays);
      toran('z', hx, doorOf(i), top + ah + 0.12, aw + 0.5, { group: dGroup, o0: o, o1: o + (dO[1] - dO[0]) / bays });
    }
    // a garland under the string lights along the west face, bay to bay
    const y = top + H.arch_spring + 0.15;
    const line = [];
    for (let i = 0; i <= bays; i++) line.push([hx - 0.2, y, hz + (i - bays / 2) * H.bay_pitch]);
    if (H === N) line.reverse();
    swags(line, { sag: 0.5, group: fGroup, o0: fO[0], o1: fO[1] });
    // inside: along both long walls above the windows, and strands hanging over every window
    const yi = Math.min(top + 0.9 + ah + 0.35, top + (H.storey_h || H.height) - 0.7);
    for (const [x, dir] of [[hx + 0.7, 1], [hx + H.size[0] - 0.7, -1]]) {
      const l = [];
      for (let i = 0; i <= bays; i++) l.push([x, yi, hz + (i - bays / 2) * H.bay_pitch]);
      if (H === N) l.reverse();
      swags(l, { sag: 0.45, group: iGroup, o0: iO[0], o1: iO[1], palette: 'mixed' });
      // and across the end walls, three bays each
      const zEnd = hz + (dir > 0 ? -1 : 1) * (H.size[1] / 2 - 0.7);
      const e = [];
      for (let i = 0; i <= 3; i++) e.push([hx + 0.7 + (H.size[0] - 1.4) * (i / 3), yi, zEnd]);
      swags(e, { sag: 0.5, group: iGroup, o0: dir > 0 ? iO[0] : iO[1] - 0.12, o1: dir > 0 ? iO[0] + 0.12 : iO[1], palette: 'mixed' });
      // and strands hung from the ceiling down the length of the hall, a row a third of the way in from each wall
      const xr = hx + H.size[0] * (dir > 0 ? 0.3 : 0.7), yTop = top + (H.storey_h || H.height) - 0.15;
      for (let i = 0; i < bays; i++) {
        const k = H === R ? i : bays - 1 - i;
        const o = iO[0] + (iO[1] - iO[0]) * (k / bays);
        bead(strand([xr, yTop, doorOf(i)], 1.3 + 0.3 * (i % 2)), { palette: i % 2 ? 'marigold' : 'jasmine', s: i % 2 ? 0.045 : 0.03, group: iGroup, o0: o, o1: o + (iO[1] - iO[0]) / bays, hang: (t) => t });
      }
      for (let i = 0; i < bays; i++) {
        const k = H === R ? i : bays - 1 - i;
        const o = iO[0] + (iO[1] - iO[0]) * (k / bays);
        bead(strand([x + dir * 0.1, yi, doorOf(i)], 0.9), { palette: 'jasmine', s: 0.03, group: iGroup, o0: o, o1: o + (iO[1] - iO[0]) / bays, hang: (t) => t });
      }
    }
  }

  // ── the navaratna's south and west arcades ─────────────────────────────────
  {
    const yv = pt + L.navaratna.arch_spring + 0.1, bp = L.navaratna.bay_pitch;
    const s = [], w = [];
    for (let i = 0; i <= 5; i++) { s.push([-wall + 0.5 + i * bp, yv, wall + 0.3]); w.push([-wall - 0.3, yv, wall - 0.5 - i * bp]); }
    swags(w, { sag: 0.4, group: GROUP.full, o0: 0.55, o1: 0.8 });
    swags(s, { sag: 0.4, group: GROUP.full, o0: 0.6, o1: 0.88 });
    // the central south arch and the shrine door get their own torans
    const [dx, , dz] = L.sanctum.door;
    toran('x', wall, dx, pt + L.navaratna.arch[1] * 0.8, L.navaratna.arch[0] + 0.6, { group: GROUP.full, o0: 0.75, o1: 0.88 });
    toran('x', dz, dx, pt + L.sanctum.arch[1] + 0.12, L.sanctum.arch[0] + 0.4, { group: GROUP.full, o0: -1, o1: -1 });
  }

  // ── the mandap ─────────────────────────────────────────────────────────────
  // Columns wrapped in jasmine and marigold helixes; strands hanging from the canopy edge between
  // them; a garland along the stage edge.
  {
    const c = 2.3, y0 = L.mandap.stage_top + 0.15, h = L.mandap.canopy - L.mandap.stage_top - 0.5;
    for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const cx = mx + sx * c, cz = mz + sz * c;
      const o = 0.2 + (sx < 0 ? 0 : 0.2) + (sz < 0 ? 0 : 0.1);
      bead(helix(cx, cz, 0.3, y0, h, 5), { palette: 'saffron', s: 0.045, group: GROUP.mandap, o0: o, o1: o + 0.35 });
      bead(helix(cx, cz, 0.3, y0 + 0.08, h, 5), { palette: 'jasmine', s: 0.028, group: GROUP.mandap, o0: o + 0.05, o1: o + 0.4 });
    }
    const e = L.mandap.width / 2 + 0.05, yc = L.mandap.canopy - 0.35;
    for (let i = 0; i < 12; i++) {
      const t = (i + 0.5) / 12, side = i % 4;
      const u = (i % 3 + 1) / 4;      // three strands per side
      const p = side === 0 ? [mx - e + u * 2 * e, yc, mz - e] : side === 1 ? [mx + e, yc, mz - e + u * 2 * e] : side === 2 ? [mx + e - u * 2 * e, yc, mz + e] : [mx - e, yc, mz + e - u * 2 * e];
      bead(strand(p, 0.9 + 0.4 * (u === 0.5 ? 1 : 0)), { palette: i % 2 ? 'jasmine' : 'marigold', s: i % 2 ? 0.03 : 0.045, group: GROUP.mandap, o0: 0.0 + 0.3 * t, o1: 0.3 + 0.3 * t, hang: (t) => t });
    }
    const se = L.mandap.width / 2 + 0.02, ys = L.mandap.stage_top + 0.02;
    swags([[mx - se, ys, mz - se], [mx + se, ys, mz - se], [mx + se, ys, mz + se], [mx - se, ys, mz + se], [mx - se, ys, mz - se]], { sag: 0.0, group: GROUP.mandap, o0: 0.0, o1: 0.4 });
  }

  // ── on the tables ──────────────────────────────────────────────────────────
  // The rolled malas and heaps of loose blooms on the halls' tables, the mango leaves in the ghot,
  // the dhak's plumes (tables.js lays them out; they are instanced here with everything else).
  tableBlooms({ bead, leaf: (p, rot, order, group, hang, c) => leaves.push({ p, rot, order, group, hang, c }) });

  // ── build the instanced meshes, a chunk at a time ──────────────────────────
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  {
    // A bloom is a faceted bead (an icosahedron, 20 faces); near the guest, on the fast tier, a
    // knobbly marigold head (80 faces) stands in for it — each chunk carries both and update()
    // shows one by distance. Beyond LOD_NEAR a 4 cm bloom is a couple of pixels anyway.
    const lo = new THREE.IcosahedronGeometry(1, 0), hi = quality === 'high' ? new THREE.IcosahedronGeometry(1, 1) : null;
    const mat = attachReveal(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }), uniforms);
    for (const c of chunkBy(blooms, CELL)) {
      const build = (base) => {
        const geo = base.clone();
        revealAttributes(geo, c.items);
        const mesh = new THREE.InstancedMesh(geo, mat, c.items.length);
        c.items.forEach((b, i) => {
          _q.setFromEuler(new THREE.Euler(b.rx, b.ry, 0));
          _m.compose(_p.copy(b.p), _q, _s.set(b.s, b.s * 0.85, b.s));
          mesh.setMatrixAt(i, _m);
          mesh.setColorAt(i, b.c);
        });
        mesh.receiveShadow = true;
        boundChunk(mesh);
        root.add(mesh);
        disposables.push(geo);
        return mesh;
      };
      c.mesh = build(lo);
      if (hi) c.lod = build(hi);
      chunks.push(c);
    }
    disposables.push(lo, mat);
    if (hi) disposables.push(hi);
  }
  {
    const base = new THREE.PlaneGeometry(0.085, 0.2);
    base.translate(0, -0.1, 0);         // hangs from its top edge
    const mat = attachReveal(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide }), uniforms, { sway: 0.02, leaf: true });
    for (const c of chunkBy(leaves, CELL)) {
      const geo = base.clone();
      revealAttributes(geo, c.items);
      const mesh = new THREE.InstancedMesh(geo, mat, c.items.length);
      c.items.forEach((l, i) => {
        _q.setFromEuler(new THREE.Euler(0, Math.PI / 2 + l.rot, 0.1 * (Math.random() - 0.5)));
        _m.compose(_p.copy(l.p), _q, _s.set(1, 1, 1));
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, l.c || (i % 3 ? LEAF : LEAF2));
      });
      boundChunk(mesh);
      c.mesh = mesh;
      chunks.push(c);
      root.add(mesh);
      disposables.push(geo);
    }
    disposables.push(base, mat);
  }

  // ── carpets ────────────────────────────────────────────────────────────────
  // Red runners rolled out along their length as the stage advances, each a stretch of the walk
  // itself (the camera's curve between two PATH nodes, on the floor: up the flights tread by tread
  // and through the doors): from the toran gate up the strip and the flight to the Radhakanta's
  // north door; through the hall, down the flight at its south door and to the mandap's alpona;
  // from beyond the alpona to the nat-mandir's stair; and up that stair, through the hall, out
  // between the columns of its north front and up the temple stair to the central arch.
  {
    const tex = carpetTexture();
    disposables.push(tex);
    const WIDTH = 1.4, STEP = 0.1, RADIUS = 1.2, LIFT = 0.045;   // width; sample spacing; the tightest bend of the centre line; the pile's thickness
    /**
     * A runner from walk progress `from` to `to` (`start`/`stop` trim it where a predicate on the
     * raw curve point first holds). `keys` say how far along its length the roll has reached at
     * given values of the `group` transition: [[value, PATH node]] — the front is at that node when
     * the transition is there (0 → the runner's start, 1 → its end are implied).
     */
    const runner = ({ from, to, start = null, stop = null, group, keys = [] }) => {
      // 1. the walk between the node fractions, every 10 cm, snapped onto a flight's axis wherever
      //    it comes at one; each sample keeps its walk progress `t`
      const raw = [];
      const p = new THREE.Vector3(), snap = [0, 0];
      const n = Math.ceil((to - from) * NODE.end * 100);
      let begun = !start;
      for (let i = 0; i <= n; i++) {
        const t = from + (to - from) * (i / n);
        posCurve.getPoint(t, p);
        if (!begun) { if (!start(p)) continue; begun = true; }
        if (stop && stop(p)) break;
        stairSnap(p.x, p.z, snap);
        raw.push({ x: snap[0], z: snap[1], t });
      }
      // 2. resampled every STEP along it, then the bends eased out to RADIUS: a point turning
      //    faster than that is drawn toward its neighbours' midpoint, pass after pass, so a corner
      //    becomes an elbow; the ends and every point on a flight stay put (a flight is straight
      //    and the elbow into it finishes at its foot)
      const pts = [];
      let acc = 0;
      pts.push({ ...raw[0] });
      for (let i = 1; i < raw.length; i++) {
        const a = raw[i - 1], b = raw[i], d = Math.hypot(b.x - a.x, b.z - a.z);
        while (acc + d >= STEP) {
          const k = (STEP - acc) / d;
          pts.push({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, t: a.t + (b.t - a.t) * k });
          acc -= STEP;
        }
        acc += d;
      }
      pts.push({ ...raw[raw.length - 1] });
      const pinned = pts.map((q, i) => i === 0 || i === pts.length - 1 || stairAt(q.x, q.z) !== null);
      const maxTurn = STEP / RADIUS;
      for (let pass = 0; pass < 120; pass++) {
        let moved = 0;
        for (let i = 1; i < pts.length - 1; i++) {
          if (pinned[i]) continue;
          const a = pts[i - 1], q = pts[i], b = pts[i + 1];
          const turn = Math.abs(Math.atan2((q.x - a.x) * (b.z - q.z) - (q.z - a.z) * (b.x - q.x), (q.x - a.x) * (b.x - q.x) + (q.z - a.z) * (b.z - q.z)));
          if (turn <= maxTurn) continue;
          const mx_ = (a.x + b.x) / 2, mz_ = (a.z + b.z) / 2;
          moved += Math.hypot(mx_ - q.x, mz_ - q.z);
          q.x += (mx_ - q.x) * 0.5; q.z += (mz_ - q.z) * 0.5;
        }
        if (moved < 1e-4) break;
      }
      // 3. onto the floor, with a fold at every riser: where a segment crosses a riser's plane
      //    (moved a pile's thickness toward the foot, so the fold wraps the step's nose) it gets a
      //    point at the riser's foot and one at its top; a riser under a flat (the temple stair's
      //    buried treads under the nat-mandir's ledge) is no riser, and a shallow dip in the floor
      //    (that stair's top buried tread, just under the ledge) is bridged
      const out = [];
      const lay = (x, z, t, y = null) => out.push({ x, z, t, y: (y ?? floorY(x, z) ?? g) + LIFT });
      lay(pts[0].x, pts[0].z, pts[0].t);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const s = stairAt(b.x, b.z) || stairAt(a.x, a.z);
        if (s) {
          const alongX = s.along === 'x', toFoot = s.dir > 0 ? -1 : 1;
          const ca = alongX ? a.x : a.z, cb = alongX ? b.x : b.z;
          const crossed = [];
          for (let k = 1; k <= s.n; k++) {
            const r = riserAt(s, k) + toFoot * LIFT;
            if ((r > ca && r <= cb) || (r < ca && r >= cb)) crossed.push(r);
          }
          crossed.sort((p_, q_) => Math.abs(p_ - ca) - Math.abs(q_ - ca));
          for (const r of crossed) {
            const f = (r - ca) / (cb - ca);
            const x = alongX ? r : a.x + (b.x - a.x) * f, z = alongX ? a.z + (b.z - a.z) * f : r, t = a.t + (b.t - a.t) * f;
            const d = toFoot * 0.01;                                        // just below and just above the riser
            const lo = floorY(alongX ? x + d : x, alongX ? z : z + d), hi = floorY(alongX ? x - d : x, alongX ? z : z - d);
            if (hi - lo < 0.02) continue;
            if (cb - ca > 0 ? s.dir > 0 : s.dir < 0) { lay(x, z, t, lo); lay(x, z, t, hi); } else { lay(x, z, t, hi); lay(x, z, t, lo); }
          }
        }
        lay(b.x, b.z, b.t);
      }
      for (let i = 1; i < out.length - 1; i++) {
        let j = i;
        while (j < out.length - 1 && Math.abs(out[j].y - out[i].y) < 1e-3) j++;
        const drop = Math.min(out[i - 1].y, out[j].y) - out[i].y;
        if (drop > 1e-3 && drop < 0.1) for (let k = i; k < j; k++) out[k].y += drop;
        i = j - 1;
      }
      const geo = ribbon(out, WIDTH);
      const len = geo.userData.length;
      // the roll: transition value → fraction of the length reached, through the keys
      const alongAt = (node) => { const q = out.find((o) => o.t >= at(node)) || out[out.length - 1]; return q.along / len; };
      const k = [[0, 0], ...keys.map(([v, node]) => [v, alongAt(node)]), [1, 1]];
      const map = tex.clone();
      map.repeat.set(len / 2.2, 1);
      map.needsUpdate = true;
      const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      const u = { reveal: { value: 0 } };
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.reveal = u.reveal;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vAlong;')
          .replace('#include <uv_vertex>', '#include <uv_vertex>\nvAlong = uv.x;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float reveal; varying float vAlong;')
          .replace('#include <map_fragment>', 'if (vAlong > reveal) discard;\n#include <map_fragment>');
      };
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      root.add(m);
      carpets.push({ u, group, keys: k });
      disposables.push(geo, mat, map);
    };
    const ax = mx - L.mandap.width / 2 - 1.0 - 1.9, ar = 1.6;   // the alpona before the mandap's west steps (life.js)
    // from under the gate: out to the corner by the time the guest tops the ghat, up the strip
    // ahead of them, and at the Radhakanta's flight before they are (stage.js: prep runs from
    // node 3.4 to 7.2, so the values are where prep stands as the guest reaches each node)
    runner({ from: at(NODE.ghatTop - 0.2), to: at(NODE.rLedgeN), group: 'prep', keys: [[0.06, NODE.ghatTop + 1.5], [0.2, NODE.strip], [0.38, NODE.strip + 1], [0.85, NODE.rFoot]] });
    runner({ from: at(NODE.rLedgeN), to: at(NODE.mandapW), stop: (p) => p.z > mz - ar - 1.6 && Math.abs(p.x - ax) < ar + 1.5, group: 'flowers', keys: [[0.42, NODE.rLedgeN]] });
    runner({ from: at(NODE.mandapNW), to: at(NODE.nFoot), start: (p) => p.z > mz + ar + 0.9, group: 'ceremony', keys: [[0.5, NODE.mandapNW]] });
    // up the nat-mandir's stair and ahead through the hall as the guest comes in (full runs from natFront to nPaanb)
    runner({ from: at(NODE.nFoot), to: at(NODE.end), stop: (p) => p.z < wall + 0.4, group: 'full', keys: [[0.06, NODE.nMalakar], [0.14, NODE.nMusic], [0.3, NODE.nTattva], [0.6, NODE.end]] });
  }

  scene.add(root);

  function update(dt, stage, eye = null) {
    if (!reducedMotion) time.value += dt;
    setReveal(uniforms, stage);
    cullChunks(chunks, uniforms.reveal.value, eye ? roomOf(eye.x, eye.z) : null);
    if (eye) for (const c of chunks) {
      if (!c.lod) continue;
      const on = c.mesh.visible, sph = c.mesh.boundingSphere;
      const near = sph.center.distanceTo(eye) < sph.radius + LOD_NEAR;
      c.mesh.visible = on && !near;
      c.lod.visible = on && near;
    }
    for (const c of carpets) {
      const v = stage[c.group], k = c.keys;
      let i = 1;
      while (i < k.length - 1 && k[i][0] < v) i++;
      const f = Math.min(1, Math.max(0, (v - k[i - 1][0]) / Math.max(1e-6, k[i][0] - k[i - 1][0])));
      c.u.reveal.value = k[i - 1][1] + (k[i][1] - k[i - 1][1]) * f;
    }
  }

  return {
    update,
    counts: { blooms: blooms.length, leaves: leaves.length, chunks: chunks.length },
    dispose() { scene.remove(root); for (const d of disposables) d.dispose(); },
  };
}

/**
 * A ribbon `width` wide through a run of points ({ x, y, z }), flat on the floor and folded down
 * a riser wherever two points share a place at different heights: uv.x runs 0 → 1 along it (by
 * length; each point gets its `along`), uv.y across; the normals follow the surface.
 */
function ribbon(pts, width) {
  const pos = [], nrm = [], uv = [], idx = [];
  const n = pts.length;
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), dir = new THREE.Vector3(), t3 = new THREE.Vector3(), nv = new THREE.Vector3();
  let len = 0;
  for (let i = 0; i < n; i++) { if (i) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z); pts[i].along = len; }
  len = len || 1;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    // the direction across the floor from the nearest points not at this place (a fold shares its place)
    let a = i, b = i;
    while (a > 0 && Math.hypot(pts[a].x - p.x, pts[a].z - p.z) < 1e-4) a--;
    while (b < n - 1 && Math.hypot(pts[b].x - p.x, pts[b].z - p.z) < 1e-4) b++;
    dir.set(pts[b].x - pts[a].x, 0, pts[b].z - pts[a].z).normalize();
    side.crossVectors(up, dir).multiplyScalar(width / 2);
    t3.set(pts[Math.min(i + 1, n - 1)].x - pts[Math.max(i - 1, 0)].x, pts[Math.min(i + 1, n - 1)].y - pts[Math.max(i - 1, 0)].y, pts[Math.min(i + 1, n - 1)].z - pts[Math.max(i - 1, 0)].z);
    nv.crossVectors(side, t3).normalize();
    if (nv.y < 0) nv.negate();
    pos.push(p.x - side.x, p.y, p.z - side.z, p.x + side.x, p.y, p.z + side.z);
    nrm.push(nv.x, nv.y, nv.z, nv.x, nv.y, nv.z);
    uv.push(p.along / len, 0, p.along / len, 1);
    if (i) { const c = i * 2; idx.push(c - 2, c, c - 1, c - 1, c, c + 1); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.userData.length = len;
  return geo;
}

/** Crimson runner with a gold border and a faint lozenge trellis, tiled along its length. */
function carpetTexture() {
  const w = 512, h = 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#6e0c14';
  x.fillRect(0, 0, w, h);
  // pile: a soft mottle
  for (let i = 0; i < 1400; i++) {
    x.fillStyle = `rgba(${90 + Math.random() * 60}, ${8 + Math.random() * 12}, ${14 + Math.random() * 12}, 0.35)`;
    x.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 6, 2 + Math.random() * 3);
  }
  // trellis
  x.strokeStyle = 'rgba(214, 160, 70, 0.28)';
  x.lineWidth = 1.2;
  const d = 32;
  for (let i = -h; i < w + h; i += d) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + h, h); x.stroke();
    x.beginPath(); x.moveTo(i, h); x.lineTo(i + h, 0); x.stroke();
  }
  // gold border, double
  x.strokeStyle = '#d9a64a';
  x.lineWidth = 4;
  x.strokeRect(0, 8, w, h - 16);
  x.lineWidth = 1.5;
  x.strokeRect(0, 15, w, h - 30);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}
