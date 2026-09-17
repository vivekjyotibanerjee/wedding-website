import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GROUP, attachReveal, revealUniforms, setReveal, roomOf } from './util.js';
import { TABLES } from './walk.js';

// ─────────────────────────────────────────────────────────────────────────────
// The tables laid out along the halls' back walls (walk.js TABLES): what a temple hall holds the
// day before a Bengali wedding — the welcome tray and mangal ghot, the puja things, the bhog, the
// bride's shringar, the garland-maker's baskets, the musicians' corner, the lamps, the tattva trays,
// the paan and sweets. Every table is one mesh: a low-poly prop kit (lathes, boxes, cones, tori)
// composed on the cloth and merged, with per-vertex colour, a per-prop reveal order (the props are
// set out one after another, each growing from its own spot — util.attachReveal's `pivot`) and a
// per-vertex `shine` that turns the one shared material to brass where it should be. Nothing here
// casts a shadow (the shadow map is rendered on demand, and these appear with the walk) and nothing
// moves per frame. The marigold parts (rolled malas, heaps of loose blooms) go to decor.js's bloom
// instancing through `tableBlooms`, the lamp table's diyas and flames to life.js through
// `tableDiyaSpots`, the dhunuchi smoke to fx.js through `tableSmokeSources` — so those layers keep
// owning what glows, swings and smokes.
// ─────────────────────────────────────────────────────────────────────────────

// ── palette (sRGB) ───────────────────────────────────────────────────────────
const WOOD = 0x5a3a1e, CREAM = 0xf1e6c8, MAROON = 0x8e1a1a, GOLD = 0xc9a24a, BRASS = 0xd0a040, COPPER = 0xb5602a;
const CLAY = 0x8a4a2a, SHOLA = 0xf4f0e6, POLA = 0xb0121a, LOHA = 0x2a2a2e, SANDAL = 0xd9c39a, LADDOO = 0xe9a028;
const SAMOSA = 0xd9a35a, PURI = 0xe4b866, DAAL = 0xd8a020, ROSOGOLLA = 0xf6f2ea, SARI = 0xb3121f, RIBBON = 0xe8a0b8;
const DHAK = 0xc8b48e, HARMONIUM = 0x3a2414, WICKER = 0xb89058, LEAF = 0x2e6a1c, SINDOOR = 0xd41a12, COCONUT = 0x5f8a3a;
const BAMBOO = 0xc9b27a, WHITE = 0xf8f6f0, SILVER = 0xd8dade, BROWN = 0x6b4426, PINK = 0xe8a0b8, LIME = 0xf4f4ec;

// ── the prop kit ─────────────────────────────────────────────────────────────
// Every builder returns an indexed geometry standing on y = 0 with its base centred on the origin
// (mergeGeometries needs every piece indexed alike — no polyhedra, which are not).
const V2 = (r, y) => new THREE.Vector2(r, y);
const lathe = (pts, segs = 12) => new THREE.LatheGeometry(pts.map(([r, y]) => V2(r, y)), segs);
/** A pot: belly, a waist and a lip. */
const pot = (r, h) => lathe([[0, 0], [0.7 * r, 0], [r, 0.35 * h], [0.92 * r, 0.65 * h], [0.62 * r, 0.82 * h], [0.7 * r, h], [0.55 * r, h], [0.5 * r, 0.9 * h], [0, 0.9 * h]]);
/** An open bowl (the inside is modelled, it is looked into). */
const bowl = (r, h = 0.45 * r) => lathe([[0, 0], [0.5 * r, 0], [0.95 * r, 0.75 * h], [r, h], [0.9 * r, h], [0.86 * r, 0.9 * h], [0.4 * r, 0.2 * h], [0, 0.2 * h]]);
const plate = (r) => lathe([[0, 0], [0.6 * r, 0], [r, 0.02], [0.95 * r, 0.025], [0.5 * r, 0.01], [0, 0.01]]);
/** A closed cup (a fill is a disc laid on top). */
const cup = (r, h) => lathe([[0, 0], [0.8 * r, 0], [r, h], [0, h]], 10);
const cone = (r, h, segs = 8) => { const g = new THREE.ConeGeometry(r, h, segs); g.translate(0, h / 2, 0); return g; };
const box = (w, h, d) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return g; };
/** A cylinder, `r0` at the top and `r1` at the bottom. */
const cyl = (r0, r1, h, segs = 8) => { const g = new THREE.CylinderGeometry(r0, r1, h, segs); g.translate(0, h / 2, 0); return g; };
const disc = (r, h = 0.004) => cyl(r, r, h, 12);
/** A ring: lying flat by default, standing (in the xy plane) with `flat = false`. */
const torus = (R, r, flat = true) => { const g = new THREE.TorusGeometry(R, r, 6, 12); if (flat) { g.rotateX(Math.PI / 2); g.translate(0, r, 0); } else g.translate(0, R + r, 0); return g; };
const ball = (r) => { const g = new THREE.SphereGeometry(r, 8, 5); g.translate(0, r, 0); return g; };
const merge = (list) => { const g = mergeGeometries(list); for (const l of list) l.dispose(); return g; };
const moved = (g, x, y, z) => { g.translate(x, y, z); return g; };
/** The kit and the composer, for couple.js (the bride and groom are props in the same idiom). */
export const KIT = { lathe, cone, box, cyl, disc, torus, ball, merge, moved };
export { composer };
/** `n` of `make()` stacked `dy` apart, each nudged a little. */
function stack(make, n, dy, jitter = 0.005) {
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(moved(make(), (Math.random() - 0.5) * jitter, i * dy, (Math.random() - 0.5) * jitter));
  return merge(parts);
}
/** Balls of radius `r` heaped in a square pyramid, `rows` deep. */
function pyramid(r, rows) {
  const parts = [], d = r * 1.9;
  for (let k = 0; k < rows; k++) {
    const m = rows - k, off = -(m - 1) * d / 2;
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) parts.push(moved(ball(r), off + i * d, k * r * 1.55, off + j * d));
  }
  return merge(parts);
}
/** A conch on its side, spire toward +x. */
function conch(r = 0.05, len = 0.16) {
  const g = lathe([[0, 0], [0.5, 0.12], [0.85, 0.32], [1, 0.52], [0.92, 0.72], [0.6, 0.9], [0.28, 1.05], [0.1, 1.18], [0, 1.28]].map(([a, b]) => [a * r, b * len / 1.28]), 10);
  g.rotateZ(-Math.PI / 2);      // the axis along +x
  g.translate(-len / 2, r, 0);
  return g;
}
/** A brass cha kettle: a pot with a spout and a loop handle. */
function kettle() {
  const spout = cyl(0.009, 0.018, 0.13, 6);
  spout.rotateZ(-0.95);
  spout.translate(0.07, 0.07, 0);
  return merge([pot(0.09, 0.15), spout, moved(torus(0.05, 0.008, false), 0, 0.1, 0), moved(ball(0.014), 0, 0.15, 0)]);
}
/** The big brass aarti lamp: a stand with three tiers of little cups; `flames` are where they burn. */
function aartiLamp() {
  const parts = [lathe([[0, 0], [0.12, 0], [0.12, 0.02], [0.05, 0.035], [0.035, 0.08], [0.05, 0.1], [0.022, 0.12], [0.022, 0.6], [0, 0.6]]), moved(ball(0.025), 0, 0.6, 0)];
  const flames = [];
  for (const [y, R, n] of [[0.24, 0.13, 5], [0.38, 0.09, 3]]) {
    parts.push(moved(disc(R + 0.02, 0.012), 0, y, 0));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (n === 3 ? 0.5 : 0), x = Math.cos(a) * R, z = Math.sin(a) * R;
      parts.push(moved(cup(0.016, 0.014), x, y + 0.012, z));
      flames.push([x, y + 0.026, z]);
    }
  }
  parts.push(moved(cup(0.016, 0.014), 0, 0.65, 0));
  flames.push([0, 0.664, 0]);
  return { geo: merge(parts), flames };
}
/** The panch-pradip: five little cups on a disc atop a stem. */
function panchPradip() {
  const parts = [disc(0.06, 0.01), cyl(0.012, 0.02, 0.22, 6), moved(disc(0.085, 0.008), 0, 0.22, 0)];
  const flames = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, x = Math.cos(a) * 0.06, z = Math.sin(a) * 0.06;
    parts.push(moved(cup(0.018, 0.014), x, 0.228, z));
    flames.push([x, 0.242, z]);
  }
  return { geo: merge(parts), flames };
}
/** The dhak: a barrel drum, lying on its side along +x. */
function dhak(r = 0.22, len = 0.65) {
  const g = lathe([[0, 0], [0.78 * r, 0], [r, 0.3 * len], [1.08 * r, 0.5 * len], [r, 0.7 * len], [0.78 * r, len], [0, len]], 12);
  g.rotateZ(-Math.PI / 2);
  g.translate(-len / 2, r, 0);
  return g;
}
/** A trestle table under a cloth that hangs 40 cm at every edge, a runner along it. */
function clothTable(add, { len, dep, h }, cloth) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(cyl(0.03, 0.035, h - 0.03), { at: [sx * (len / 2 - 0.1), sz * (dep / 2 - 0.1)], y: 0, color: WOOD, pivot: [0, 0, 0] });
  add(box(len, 0.03, dep), { y: h - 0.03, color: WOOD, pivot: [0, 0, 0] });
  add(box(len + 0.04, 0.015, dep + 0.04), { y: h, color: cloth, pivot: [0, 0, 0] });
  const skirt = Math.min(0.42, h - 0.08);
  for (const s of [-1, 1]) {
    add(box(len + 0.04, skirt, 0.012), { at: [0, s * (dep / 2 + 0.014)], y: h - skirt, color: cloth, pivot: [0, 0, 0] });
    add(box(0.012, skirt, dep + 0.04), { at: [s * (len / 2 + 0.014), 0], y: h - skirt, color: cloth, pivot: [0, 0, 0] });
  }
  add(box(len + 0.1, 0.005, 0.26), { y: h + 0.015, color: GOLD, pivot: [0, 0, 0] });
}

// ── composing a table ────────────────────────────────────────────────────────
// A table's frame: origin at its centre on the floor, +x along it (south, the tables face west),
// +z toward its front, y up. Each spec lays its props out with `far` = the end the guest reaches
// last (the walk goes south down the Radhakanta, north up the nat-mandir), tall things there so the
// near end, partly below the frame at the abreast node, holds the small flat ones.
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function composer(t) {
  const dir = t.hall === 'R' ? 1 : -1;
  const parts = [];   // { g, color, shine, pivot }
  /**
   * Put `geo` on the table: `at` = [along, front] on the cloth (`y` overrides the height), turned
   * `rot` about y and leaned `tilt` about x (or `tiltAxis`), scaled, coloured; `shine` for metal.
   * `pivot` (table frame) is what it grows from when set out; default its own base.
   */
  function add(geo, { at = [0, 0], y = t.h, rot = 0, tilt = 0, tiltAxis = 'x', scale = 1, color, shine = 0, pivot = null } = {}) {
    const g = geo.clone();
    _e.set(tiltAxis === 'x' ? tilt : 0, rot, tiltAxis === 'z' ? tilt : 0, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(at[0], y, at[1]), _q, Array.isArray(scale) ? _s.set(...scale) : _s.set(scale, scale, scale));
    g.applyMatrix4(_m);
    parts.push({ g, color: new THREE.Color(color), shine, pivot: pivot || [at[0], y, at[1]] });
    geo.dispose();
  }
  /** Along the table toward the far end. */
  const far = (x) => dir * x;
  /** A table-frame point in the world. */
  const world = (x, y, z) => {
    const c = Math.cos(t.rot), s = Math.sin(t.rot);
    return new THREE.Vector3(t.p[0] + x * c + z * s, t.p[1] + y, t.p[2] - x * s + z * c);
  };
  /** Merge everything added into one geometry with the colour, reveal and shine attributes. */
  function build(group, o0, o1) {
    const n = parts.length;
    for (let k = 0; k < n; k++) {
      const { g, color, shine, pivot } = parts[k];
      const m = g.attributes.position.count;
      const col = new Float32Array(m * 3), order = new Float32Array(m), grp = new Float32Array(m), zero = new Float32Array(m), piv = new Float32Array(m * 3), sh = new Float32Array(m);
      const o = o0 + (o1 - o0) * (k / Math.max(1, n - 1));
      for (let i = 0; i < m; i++) { col.set([color.r, color.g, color.b], i * 3); piv.set(pivot, i * 3); order[i] = o; grp[i] = group; sh[i] = shine; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aOrder', new THREE.BufferAttribute(order, 1));
      g.setAttribute('aGroup', new THREE.BufferAttribute(grp, 1));
      g.setAttribute('aHang', new THREE.BufferAttribute(zero, 1));
      g.setAttribute('aPhase', new THREE.BufferAttribute(zero, 1));
      g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
      g.setAttribute('aShine', new THREE.BufferAttribute(sh, 1));
    }
    const geo = mergeGeometries(parts.map((p) => p.g));
    for (const p of parts) p.g.dispose();
    if (!geo) throw new Error(`tables: merge failed for ${t.card}`);
    return geo;
  }
  return { add, far, world, build, dir };
}

// ── the tables ───────────────────────────────────────────────────────────────
// `o`: the window of the hall's transition in which the table is set out (stage.js), cloth first,
// the last prop landing before the guest's look reaches it. `props` lays out the merged mesh;
// `blooms` hands marigold work to decor.js; `flames` and `smoke` place life.js's diyas and fx.js's
// incense (all in the table frame: [along, up, front]).
const rand = (a, b) => a + Math.random() * (b - a);
const SPECS = {
  welcome: {
    group: 'flowers', o: [0.22, 0.36], cloth: CREAM,
    props(c) {
      const { add, far } = c;
      // the boron-dala, a brass tray with the welcome on it: a lamp, a conch, sindoor, rice, a mirror
      add(plate(0.3), { at: [far(-0.35), 0.05], color: BRASS, shine: 1 });
      const y = c.t.h + 0.025;
      add(lathe([[0, 0], [0.035, 0], [0.035, 0.01], [0.012, 0.02], [0.012, 0.07], [0.03, 0.08], [0.025, 0.1], [0, 0.1]], 8), { at: [far(-0.35), -0.05], y, color: BRASS, shine: 1 });
      add(conch(0.04, 0.13), { at: [far(-0.22), 0.14], y, rot: 0.6, color: WHITE });
      add(cup(0.028, 0.03), { at: [far(-0.48), 0.14], y, color: BRASS, shine: 1 });
      add(disc(0.024), { at: [far(-0.48), 0.14], y: y + 0.03, color: SINDOOR });
      add(ball(0.05), { at: [far(-0.5), -0.12], y: y - 0.03, scale: [1, 0.7, 1], color: CREAM });
      add(disc(0.045, 0.006), { at: [far(-0.2), -0.12], y, tilt: -0.5, color: SILVER, shine: 1 });
      // the mangal ghot: a brass pot with a green coconut on top (mango leaves in decor.js)
      add(pot(0.13, 0.28), { at: [far(0.45), -0.08], color: BRASS, shine: 1 });
      add(ball(0.075), { at: [far(0.45), -0.08], y: c.t.h + 0.27, scale: [1, 1.2, 1], color: COCONUT });
      // the kula, a bamboo winnowing fan, leaning on its edge
      add(box(0.36, 0.015, 0.3), { at: [far(0.12), 0.2], rot: 0.5, tilt: 0.25, color: BAMBOO });
      add(box(0.36, 0.03, 0.02), { at: [far(0.12), 0.2], y: c.t.h + 0.01, rot: 0.5, tilt: 0.25, color: BAMBOO });
      // dhaan and durba: a little heap of paddy in a bowl
      add(bowl(0.06), { at: [far(0.72), 0.2], color: BRASS, shine: 1 });
      add(ball(0.04), { at: [far(0.72), 0.2], y: c.t.h + 0.015, scale: [1, 0.6, 1], color: PURI });
    },
    blooms(c, { leaf }, group, o) {
      // mango leaves round the ghot's mouth
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, p = c.world(c.far(0.45) + Math.cos(a) * 0.075, c.t.h + 0.38, -0.08 + Math.sin(a) * 0.075);
        leaf(p, a + Math.PI / 2, o[1], group, 0.25, null);
      }
    },
  },
  puja: {
    group: 'flowers', o: [0.55, 0.68], cloth: MAROON,
    props(c) {
      const { add, far } = c;
      add(conch(0.05, 0.16), { at: [far(-0.6), 0.22], rot: 0.3, color: WHITE });
      add(conch(0.045, 0.14), { at: [far(-0.3), 0.26], rot: -0.4, color: WHITE });
      // incense: a brass holder bristling with sticks, and their packets
      add(box(0.05, 0.12, 0.05), { at: [far(0.0), -0.28], color: BRASS, shine: 1 });
      for (let i = 0; i < 8; i++) add(cyl(0.003, 0.003, 0.26, 4), { at: [far(0.0), -0.28], y: c.t.h + 0.08, tilt: rand(-0.25, 0.25), tiltAxis: i % 2 ? 'x' : 'z', color: BROWN });
      for (let i = 0; i < 3; i++) add(box(0.05, 0.03, 0.22), { at: [far(0.25 + 0.06 * i), -0.2], rot: 0.15 * i, color: i === 1 ? LEAF : i === 2 ? MAROON : GOLD });
      // kosha-kushi, copper; the ghee pradip; a bell; the sindoor box
      add(bowl(0.08), { at: [far(0.05), 0.12], color: COPPER, shine: 1 });
      add(cup(0.028, 0.06), { at: [far(0.05), 0.12], y: c.t.h + 0.02, tilt: 0.7, color: COPPER, shine: 1 });
      add(bowl(0.05, 0.025), { at: [far(-0.2), -0.1], color: BRASS, shine: 1 });
      add(lathe([[0, 0], [0.045, 0], [0.045, 0.02], [0.03, 0.07], [0.012, 0.1], [0.012, 0.13], [0, 0.13]], 10), { at: [far(0.35), 0.2], color: BRASS, shine: 1 });
      add(box(0.06, 0.035, 0.06), { at: [far(0.5), 0.02], rot: 0.3, color: SINDOOR });
      // two dhunuchi, clay burners on stems, at the far end — they smoke (fx.js)
      for (const [x, z] of [[0.6, 0.25], [0.78, -0.22]]) add(lathe([[0, 0], [0.06, 0], [0.06, 0.015], [0.025, 0.03], [0.025, 0.1], [0.05, 0.12], [0.085, 0.2], [0.075, 0.2], [0.05, 0.13], [0, 0.13]], 10), { at: [far(x), z], color: CLAY });
    },
    blooms(c, { bead }, group, o) {
      // three malas rolled up on the cloth: flat spirals of marigold
      for (const [x, z, k] of [[-0.5, -0.25, 0], [0.25, 0.28, 1], [-0.05, -0.02, 2]]) {
        const pts = [];
        for (let i = 0; i <= 52; i++) { const u = i / 52, a = u * Math.PI * 2 * 2.6, r = 0.028 + 0.075 * u; pts.push(c.world(c.far(x) + Math.cos(a) * r, c.t.h + 0.03, z + Math.sin(a) * r)); }
        const oo = o[0] + (o[1] - o[0]) * (0.3 + 0.25 * k);
        bead(pts, { palette: k === 1 ? 'saffron' : 'marigold', s: 0.03, group, o0: oo, o1: oo + 0.04, hang: () => 0 });
      }
    },
    smoke(c) {
      return [
        { o: c.world(c.far(0.6), c.t.h + 0.22, 0.25), n: 10, rise: 1.3, spread: 0.16, size: 0.24 },
        { o: c.world(c.far(0.78), c.t.h + 0.22, -0.22), n: 10, rise: 1.3, spread: 0.16, size: 0.24 },
        { o: c.world(c.far(0.0), c.t.h + 0.34, -0.28), n: 6, rise: 1.2, spread: 0.1, size: 0.18 },
      ];
    },
  },
  bhog: {
    group: 'flowers', o: [0.68, 0.8], cloth: CREAM,
    props(c) {
      const { add, far } = c, h = c.t.h;
      // laddoos in pyramids on plates
      for (const [x, z, rows] of [[-0.62, 0.18, 3], [-0.3, -0.2, 3], [0.02, 0.22, 2]]) {
        add(plate(0.15), { at: [far(x), z], color: SILVER, shine: 1 });
        add(pyramid(0.032, rows), { at: [far(x), z], y: h + 0.025, rot: rand(0, 1), color: LADDOO });
      }
      // samosas on a plate
      add(plate(0.16), { at: [far(-0.62), -0.22], color: SILVER, shine: 1 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(cone(0.045, 0.07, 3), { at: [far(-0.62) + Math.cos(a) * 0.085, -0.22 + Math.sin(a) * 0.085], y: h + 0.025, rot: a, tilt: 0.35, color: SAMOSA }); }
      // daal in clay bowls, puris in stacks
      for (const [x, z] of [[-0.3, 0.2], [0.05, -0.28]]) { add(bowl(0.09), { at: [far(x), z], color: CLAY }); add(disc(0.078), { at: [far(x), z], y: h + 0.032, color: DAAL }); }
      for (const [x, z] of [[0.3, 0.02], [-0.02, -0.05]]) add(stack(() => disc(0.062, 0.007), 8, 0.007, 0.01), { at: [far(x), z], color: PURI });
      // rosogolla in earthen handis, a red cloth tied at the neck; mishti doi in clay bhars
      for (const [x, z] of [[0.55, -0.2], [0.75, 0.1], [0.6, 0.28]]) { add(pot(0.1, 0.17), { at: [far(x), z], color: CLAY }); add(torus(0.072, 0.014), { at: [far(x), z], y: h + 0.13, color: MAROON }); }
      for (let i = 0; i < 4; i++) { const x = 0.28 + 0.1 * (i % 2), z = -0.3 + 0.1 * Math.floor(i / 2) - 0.02; add(cup(0.045, 0.07), { at: [far(x), z - 0.05], color: CLAY }); add(disc(0.04), { at: [far(x), z - 0.05], y: h + 0.07, color: ROSOGOLLA }); }
      // the cha: a brass kettle and clay cups stacked
      add(kettle(), { at: [far(0.35), 0.28], rot: 0.4, color: BRASS, shine: 1 });
      add(stack(() => cup(0.035, 0.05), 4, 0.022, 0.006), { at: [far(0.12), -0.25], color: CLAY });
    },
  },
  shringar: {
    group: 'flowers', o: [0.8, 0.87], cloth: MAROON,
    props(c) {
      const { add, far } = c, h = c.t.h;
      // the sholapith crowns: the groom's topor, the bride's mukut, at the far end
      add(cone(0.09, 0.4, 8), { at: [far(0.6), -0.1], color: SHOLA });
      for (const y of [0.1, 0.22, 0.32]) add(torus(0.09 * (1 - y / 0.4) + 0.008, 0.006), { at: [far(0.6), -0.1], y: h + y, color: SHOLA });
      add(torus(0.1, 0.02), { at: [far(0.3), 0.18], color: SHOLA });
      add(cone(0.1, 0.32, 8), { at: [far(0.3), 0.18], y: h + 0.02, color: SHOLA });
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(cone(0.012, 0.09, 4), { at: [far(0.3) + Math.cos(a) * 0.1, 0.18 + Math.sin(a) * 0.1], y: h + 0.02, tilt: -0.5, tiltAxis: 'x', rot: -a, color: SHOLA }); }
      // shankha-pola: white conch and red coral bangles, the iron loha
      for (let i = 0; i < 4; i++) add(torus(0.04, 0.012), { at: [far(-0.55 + 0.03 * i), 0.15 + 0.03 * i], y: h + 0.012 * i, rot: 0.3 * i, color: i % 2 ? POLA : WHITE });
      for (let i = 0; i < 4; i++) add(torus(0.04, 0.012), { at: [far(-0.25), -0.15], y: h, rot: 0.8 * i, tilt: 1.3, tiltAxis: 'x', color: i % 2 ? WHITE : POLA, pivot: [far(-0.25), h, -0.15] });
      add(torus(0.04, 0.01), { at: [far(-0.05), 0.22], color: LOHA, shine: 0.6 });
      // alta, chandan, the hand mirror, two paan leaves
      add(cyl(0.022, 0.025, 0.08), { at: [far(-0.6), -0.22], color: SINDOOR });
      add(cyl(0.008, 0.012, 0.03), { at: [far(-0.6), -0.22], y: h + 0.08, color: SINDOOR });
      add(bowl(0.06, 0.03), { at: [far(-0.35), 0.28], color: BRASS, shine: 1 });
      add(disc(0.048), { at: [far(-0.35), 0.28], y: h + 0.026, color: SANDAL });
      add(disc(0.07, 0.008), { at: [far(0.05), -0.25], tilt: -0.35, color: SILVER, shine: 1 });
      add(cyl(0.01, 0.012, 0.12, 6), { at: [far(0.05), -0.19], y: h + 0.02, tilt: Math.PI / 2 - 0.35, color: BRASS, shine: 1 });
      for (const [x, z, r] of [[-0.1, -0.02, 0.3], [0.0, 0.02, 2.4]]) add(cone(0.065, 0.006, 3), { at: [far(x), z], rot: r, color: LEAF });
      // the bridal Benarasi folded, gold-bordered; the haldi, a brass bowl of turmeric paste
      add(stack(() => box(0.34, 0.05, 0.24), 3, 0.05, 0.015), { at: [far(0.72), 0.12], rot: -0.25, color: SARI });
      add(box(0.35, 0.01, 0.25), { at: [far(0.72), 0.12], y: h + 0.15, rot: -0.25, color: GOLD, shine: 0.6 });
      add(bowl(0.08, 0.04), { at: [far(-0.7), 0.1], color: BRASS, shine: 1 });
      add(disc(0.066), { at: [far(-0.7), 0.1], y: h + 0.034, color: 0xe6b000 });
    },
  },
  malakar: {
    group: 'full', o: [0.0, 0.06], cloth: CREAM,
    props(c) {
      const { add, far } = c, h = c.t.h;
      // three wicker baskets (marigolds, rose petals — decor.js — and the lotus buds in a brass bowl)
      add(bowl(0.18, 0.09), { at: [far(-0.5), 0.05], color: WICKER });
      add(bowl(0.16, 0.08), { at: [far(-0.12), -0.16], color: WICKER });
      add(bowl(0.11, 0.06), { at: [far(0.22), 0.2], color: BRASS, shine: 1 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(cone(0.028, 0.09, 6), { at: [far(0.22) + Math.cos(a) * 0.06, 0.2 + Math.sin(a) * 0.06], y: h + 0.04, tilt: 0.35, rot: -a, color: PINK }); }
      // spools of thread and a needle case
      for (let i = 0; i < 4; i++) { add(cyl(0.028, 0.028, 0.06), { at: [far(0.55 + 0.07 * (i % 2)), -0.25 + 0.07 * Math.floor(i / 2)], color: i % 2 ? WHITE : GOLD }); add(cyl(0.032, 0.032, 0.006), { at: [far(0.55 + 0.07 * (i % 2)), -0.25 + 0.07 * Math.floor(i / 2)], y: h + 0.06, color: WOOD }); }
      add(box(0.12, 0.02, 0.05), { at: [far(0.7), 0.1], rot: 0.4, color: WOOD });
      // mango-leaf bundles: bunches of stems bound together (the leaves are cards, decor.js)
      for (const [x, z] of [[0.45, 0.3], [0.6, 0.3]]) add(cyl(0.02, 0.025, 0.05, 6), { at: [far(x), z], color: BROWN });
    },
    blooms(c, { bead, leaf }, group, o) {
      const h = c.t.h;
      const heap = (cx, cz, r, hh, n, palette, s, oo) => {
        const pts = [];
        for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r; pts.push(c.world(c.far(cx) + Math.cos(a) * d, h + 0.05 + hh * (1 - (d / r) ** 2) * Math.random(), cz + Math.sin(a) * d)); }
        bead(pts, { palette, s, group, o0: oo, o1: oo + 0.04, hang: () => 0 });
      };
      heap(-0.5, 0.05, 0.16, 0.13, 80, 'marigold', 0.034, o[0] + (o[1] - o[0]) * 0.5);
      heap(-0.12, -0.16, 0.14, 0.06, 60, 'rose', 0.018, o[0] + (o[1] - o[0]) * 0.7);
      // a jasmine string coiled loosely on the cloth
      const pts = [];
      for (let i = 0; i <= 60; i++) { const u = i / 60, a = u * Math.PI * 2 * 1.6; pts.push(c.world(c.far(0.05) + Math.cos(a) * (0.1 + 0.03 * Math.sin(u * 9)), h + 0.02, 0.28 + Math.sin(a) * 0.06)); }
      bead(pts, { palette: 'jasmine', s: 0.02, group, o0: o[1], o1: o[1] + 0.03, hang: () => 0 });
      // the mango-leaf bundles
      for (const [x, z] of [[0.45, 0.3], [0.6, 0.3]]) for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; leaf(c.world(c.far(x) + Math.cos(a) * 0.03, h + 0.22, z + Math.sin(a) * 0.03), a, o[1], group, 0.15, null); }
    },
  },
  music: {
    group: 'full', o: [0.18, 0.28], cloth: MAROON,
    props(c) {
      const { add, far } = c, h = c.t.h;
      // the harmonium on the low table, its bellows out; the kartal
      add(box(0.6, 0.26, 0.32), { at: [far(0.2), 0.0], color: HARMONIUM });
      add(box(0.54, 0.02, 0.05), { at: [far(0.2), 0.16], y: h + 0.26, color: WHITE });
      for (let i = 0; i < 9; i++) add(box(0.018, 0.012, 0.03), { at: [far(0.2) + (i - 4) * 0.058, 0.155], y: h + 0.28, color: LOHA });
      add(box(0.5, 0.2, 0.06), { at: [far(0.2), -0.2], y: h + 0.03, tilt: 0.5, color: BROWN });
      for (let i = 0; i < 2; i++) add(disc(0.075, 0.008), { at: [far(-0.42), 0.12 - 0.08 * i], y: h + 0.008 * i, color: BRASS, shine: 1 });
      // on the floor beside it, toward the far end (in frame as the guest comes up), a rug with the dhak and the dhol
      const rx = c.dir * (c.t.len / 2 + 0.8);
      add(box(1.3, 0.015, 1.0), { at: [rx, 0.05], y: 0, color: MAROON, pivot: [rx, 0, 0] });
      add(box(1.3, 0.004, 0.05), { at: [rx, 0.52], y: 0.015, color: GOLD, pivot: [rx, 0, 0] });
      add(box(1.3, 0.004, 0.05), { at: [rx, -0.42], y: 0.015, color: GOLD, pivot: [rx, 0, 0] });
      add(dhak(0.22, 0.65), { at: [rx - 0.05, -0.05], y: 0.015, rot: 0.35, tilt: 0.12, tiltAxis: 'z', color: DHAK, pivot: [rx, 0, 0] });
      for (const s of [-1, 1]) add(torus(0.2, 0.015, false), { at: [rx - 0.05 + s * 0.33 * Math.cos(0.35), -0.05 - s * 0.33 * Math.sin(0.35)], y: 0.03, rot: 0.35 + Math.PI / 2, color: WOOD, pivot: [rx, 0, 0] });
      add(dhak(0.14, 0.5), { at: [rx + 0.35, 0.3], y: 0.015, rot: -0.5, color: CLAY, pivot: [rx, 0, 0] });
      add(cyl(0.012, 0.012, 0.45, 5), { at: [rx + 0.1, 0.35], y: 0.02, rot: 0.9, tilt: Math.PI / 2, color: WOOD, pivot: [rx, 0, 0] });
    },
    blooms(c, { leaf }, group, o) {
      // the dhak's white plumes, fanning up from its rim
      const rx = c.dir * (c.t.len / 2 + 0.8), a0 = 0.35;
      for (let i = 0; i < 10; i++) {
        const u = (i - 4.5) / 4.5, x = rx - 0.05 - 0.33 * Math.cos(a0) + u * 0.1 * Math.sin(a0), z = -0.05 + 0.33 * Math.sin(a0) + u * 0.1 * Math.cos(a0);
        leaf(c.world(x, 0.44 + 0.22 + Math.abs(u) * 0.04, z), a0 + u * 0.6, o[1], group, 0.35, new THREE.Color(WHITE));
      }
    },
  },
  lamps: {
    group: 'full', o: [0.42, 0.52], cloth: CREAM,
    props(c) {
      const { add, far } = c, h = c.t.h;
      // the aarti lamp at the far end, the panch-pradip before it (their flames are life.js's)
      const aarti = aartiLamp();
      add(aarti.geo, { at: [far(0.62), -0.02], color: BRASS, shine: 1 });
      const pp = panchPradip();
      add(pp.geo, { at: [far(0.25), 0.18], color: BRASS, shine: 1 });
      // the oil pot and a ladle, camphor in a box, a matchbox
      add(pot(0.08, 0.16), { at: [far(-0.8), -0.22], color: BRASS, shine: 1 });
      add(cyl(0.004, 0.004, 0.16, 4), { at: [far(-0.72), -0.16], y: h + 0.1, tilt: 1.2, color: BRASS, shine: 1 });
      add(box(0.07, 0.03, 0.05), { at: [far(-0.5), 0.3], rot: 0.3, color: WHITE });
      add(box(0.06, 0.015, 0.04), { at: [far(-0.3), 0.3], rot: -0.2, color: SINDOOR });
      c.flameSpots = [...aarti.flames.map(([x, y, z]) => [far(0.62) + x, h + y, -0.02 + z]), ...pp.flames.map(([x, y, z]) => [far(0.25) + x, h + y, 0.18 + z])];
    },
    /** The diyas set out in rows on the cloth, and the flames on the stands: life.js's, lit as the guest reaches them. */
    diyas(c, group, o) {
      const out = [], h = c.t.h;
      const rows = [];
      for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) rows.push([c.far(-0.78 + 0.19 * i), h, -0.24 + 0.22 * j]);
      const n = rows.length + c.flameSpots.length;
      rows.forEach(([x, y, z], k) => out.push({ p: c.world(x, y, z).toArray(), group, order: o[0] + (o[1] - o[0]) * (k / n), lit: 1 + 0.64 + 0.08 * (k / n), bowl: true, s: 1 }));
      c.flameSpots.forEach(([x, y, z], k) => out.push({ p: c.world(x, y, z).toArray(), group, order: o[1], lit: 1 + 0.64 + 0.08 * ((rows.length + k) / n), bowl: false, s: 0.6 }));
      return out;
    },
  },
  tattva: {
    group: 'full', o: [0.6, 0.7], cloth: MAROON,
    props(c) {
      const { add, far } = c, h = c.t.h;
      // trays of gifts: saris folded in stacks (a red Benarasi on top), dhuti-panjabi, sweets
      const tray = (x, z) => add(plate(0.22), { at: [far(x), z], color: GOLD, shine: 0.8 });
      tray(-0.6, 0.05); tray(-0.15, -0.18); tray(0.28, 0.16); tray(0.68, -0.08);
      add(stack(() => box(0.3, 0.045, 0.2), 4, 0.045, 0.02), { at: [far(-0.6), 0.05], y: h + 0.025, rot: 0.2, color: 0x3a6fa8 });
      add(box(0.3, 0.05, 0.2), { at: [far(-0.6), 0.05], y: h + 0.205, rot: 0.2, color: SARI });
      add(torus(0.13, 0.008), { at: [far(-0.6), 0.05], y: h + 0.255, rot: 0.2, color: GOLD, shine: 1 });
      add(stack(() => box(0.28, 0.04, 0.2), 3, 0.04, 0.02), { at: [far(-0.15), -0.18], y: h + 0.025, rot: -0.3, color: WHITE });
      add(box(0.26, 0.04, 0.18), { at: [far(-0.15), -0.18], y: h + 0.145, rot: -0.3, color: CREAM });
      // sweets in a box and loose, a comb and a mirror, a coconut, paan
      add(box(0.2, 0.06, 0.14), { at: [far(0.25), 0.12], y: h + 0.025, rot: 0.4, color: MAROON });
      for (let i = 0; i < 5; i++) add(ball(0.022), { at: [far(0.25) + 0.08 * Math.cos(i * 1.3), 0.12 + 0.08 * Math.sin(i * 1.3)], y: h + 0.085, color: i % 2 ? LADDOO : ROSOGOLLA });
      add(box(0.1, 0.01, 0.03), { at: [far(0.4), 0.25], rot: 0.3, color: LOHA });
      add(disc(0.05, 0.006), { at: [far(0.55), 0.22], tilt: -0.25, color: SILVER, shine: 1 });
      add(ball(0.07), { at: [far(0.68), -0.08], y: h + 0.025, color: BROWN });
      for (let i = 0; i < 3; i++) add(cone(0.05, 0.005, 3), { at: [far(0.72) + 0.03 * i, -0.28], rot: 0.5 * i, color: LEAF });
      // pleated cloth and ribbon over the trays' edges
      add(box(0.5, 0.02, 0.1), { at: [far(0.05), 0.35], rot: 0.1, color: PINK });
      for (const [x, z] of [[-0.35, -0.3], [0.5, 0.35]]) add(torus(0.1, 0.008, false), { at: [far(x), z], rot: 0.7, color: RIBBON });
    },
  },
  paan: {
    group: 'full', o: [0.76, 0.85], cloth: CREAM,
    props(c) {
      const { add, far } = c, h = c.t.h;
      // paan leaves in stacks, the brass paan-daan with its domed lid, supari, lime
      for (const [x, z, r] of [[-0.62, 0.2, 0.2], [-0.4, -0.2, 1.2], [-0.15, 0.25, 2.3]]) add(stack(() => cone(0.075, 0.004, 3), 12, 0.004, 0.012), { at: [far(x), z], rot: r, color: LEAF });
      add(pot(0.11, 0.12), { at: [far(0.15), -0.1], color: BRASS, shine: 1 });
      add(ball(0.08), { at: [far(0.15), -0.1], y: h + 0.11, scale: [1, 0.55, 1], color: BRASS, shine: 1 });
      add(ball(0.015), { at: [far(0.15), -0.1], y: h + 0.155, color: BRASS, shine: 1 });
      add(bowl(0.06, 0.03), { at: [far(-0.1), -0.25], color: BRASS, shine: 1 });
      for (let i = 0; i < 7; i++) add(ball(0.013), { at: [far(-0.1) + 0.03 * Math.cos(i * 0.9), -0.25 + 0.03 * Math.sin(i * 0.9)], y: h + 0.02, color: BROWN });
      add(cup(0.028, 0.035), { at: [far(0.35), 0.25], color: BRASS, shine: 1 });
      add(disc(0.024), { at: [far(0.35), 0.25], y: h + 0.035, color: LIME });
      // boxes of sweets to take home, tied with string, and a stack of banana-leaf plates
      for (let i = 0; i < 2; i++) for (let k = 0; k < 3; k++) {
        const x = 0.48 + 0.24 * i, z = -0.12 + 0.02 * k;
        add(box(0.2, 0.08, 0.14), { at: [far(x), z], y: h + 0.08 * k, rot: 0.08 * k, color: (i + k) % 2 ? SINDOOR : CREAM });
        add(box(0.21, 0.005, 0.008), { at: [far(x), z], y: h + 0.08 * (k + 1), rot: 0.08 * k, color: BROWN });
      }
      add(stack(() => disc(0.13, 0.003), 10, 0.003, 0.012), { at: [far(0.55), 0.26], color: LEAF });
    },
  },
};

/** Compose every table once; the same layout feeds the mesh, the blooms, the diyas and the smoke. */
let composed = null;
function compose() {
  if (composed) return composed;
  composed = {};
  for (const [k, t] of Object.entries(TABLES)) {
    const spec = SPECS[k];
    const c = composer(t);
    c.t = t;
    clothTable(c.add, t, spec.cloth);
    spec.props(c);
    composed[k] = { t, spec, c };
  }
  return composed;
}

/** Marigold work for decor.js's instancing: rolled malas, heaps in baskets, leaf cards on the ghot and the dhak. */
export function tableBlooms({ bead, leaf }) {
  for (const { spec, c } of Object.values(compose())) if (spec.blooms) spec.blooms(c, { bead, leaf }, GROUP[spec.group], spec.o);
}
/** Diya spots for life.js: `{ p, group, order, lit, bowl, s }` — `lit` ≥ 1 means keyed to the celebration transition at lit − 1. */
export function tableDiyaSpots() {
  const out = [];
  for (const { spec, c } of Object.values(compose())) if (spec.diyas) out.push(...spec.diyas(c, GROUP[spec.group], spec.o));
  return out;
}
/** Smoke sources for fx.js (the puja table's dhunuchi and incense), with the transition they follow. */
export function tableSmokeSources() {
  const out = [];
  for (const { spec, c } of Object.values(compose())) if (spec.smoke) for (const s of spec.smoke(c)) out.push({ ...s, o: s.o.toArray(), group: spec.group, on: [spec.o[1], spec.o[1] + 0.12] });
  return out;
}

export function buildTables(scene, { quality = 'high' } = {}) {
  const root = new THREE.Group();
  root.name = 'tables';
  const time = { value: 0 };
  const uniforms = revealUniforms(time);
  const mat = attachReveal(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }), uniforms, { sway: 0, pivot: true, shine: true });
  const disposables = [mat];
  const meshes = [];   // { mesh, group, o0, room }
  const counts = { tables: 0, triangles: 0 };
  for (const [k, { t, spec, c }] of Object.entries(compose())) {
    const geo = c.build(GROUP[spec.group], spec.o[0], spec.o[1]);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `table_${k}`;
    mesh.position.set(...t.p);
    mesh.rotation.y = t.rot;
    mesh.castShadow = false;       // the shadow map is rendered on demand: a table's shadow before the table would show
    mesh.receiveShadow = true;
    geo.computeBoundingSphere();
    geo.boundingSphere.radius += 0.4;
    mesh.frustumCulled = true;
    mesh.visible = false;
    root.add(mesh);
    meshes.push({ mesh, group: spec.group, o0: spec.o[0], room: t.hall });
    disposables.push(geo);
    counts.tables++;
    counts.triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
  }
  scene.add(root);

  function update(dt, stage, eye = null) {
    time.value += dt;
    setReveal(uniforms, stage);
    // a table is drawn once its cloth begins to appear, and not from inside the other hall
    const camRoom = eye ? roomOf(eye.x, eye.z) : null;
    for (const m of meshes) m.mesh.visible = stage[m.group] > m.o0 && !(camRoom && camRoom !== m.room);
  }
  return {
    update, counts,
    dispose() { scene.remove(root); for (const d of disposables) d.dispose(); },
  };
}
