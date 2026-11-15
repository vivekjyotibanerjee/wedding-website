import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import L from './landmarks.json';
import { smooth } from './util.js';

// ─────────────────────────────────────────────────────────────────────────────
// The bride and groom at the agni: once the fire is lit (the ceremony transition) the two walk
// round the havan kund on the mandap's stage, one leading and the other following — the rounds of
// the fire. Who leads is a coin toss on every load (customs differ, and the rounds change leader).
// They are tied together (the gathbandhan): the end of the groom's own stole and of the bride's
// own veil are drawn to one knot between them every frame (`buildTie`: a bone at each end, added
// by couple.py). They are the one human presence in the scene
// and the one runtime model besides the temple: `public/models/couple.glb`, two rigged stylised
// characters from `free_assets/` (posed, decimated and exported by recon/blender/couple.py) with
// an in-place walk cycle that this file plays at the speed of the orbit. Nothing here touches the
// Blender scene or its bake. The figures scale in from their feet like the props do, on wall-clock
// time; they cast no shadow (the shadow map is rendered on demand, a shadow would be there before
// them). The glb's materials compile once when it arrives (renderer.compile), not mid-walk.
// ─────────────────────────────────────────────────────────────────────────────

const COUPLE_URL = `${import.meta.env.BASE_URL}models/couple.glb`;
const [mx, , mz] = L.mandap.center;
const FLOOR = L.mandap.stage_top;
const RADIUS = 1.25;                      // clear of the kund's round dais (r 0.95) and the drapes at the columns (2 m)
const GAP = 0.85;                         // the leader this far ahead along the circle
const PERIOD = 16;                        // seconds a round takes
const CYCLE_M = 0.84;                     // metres the glb's walk cycle covers (two strides of 0.42, couple.py)
const LEAD = (/[?&]lead=(groom|bride)/.exec(location.search) || [])[1] || (Math.random() < 0.5 ? 'groom' : 'bride');   // the coin toss, once per load (?lead= pins it, for checking)
const ORDER = LEAD === 'groom' ? { bride: 0.32, groom: 0.38 } : { groom: 0.32, bride: 0.38 };   // where in the ceremony transition each appears (the agni is up by then); the leader second
const REVEAL = 0.14;                      // how much of the transition the scale-in takes
const PARK = -50;                         // below the courtyard until revealed: frustum-culled, never drawn

export function buildCouple(scene, { reducedMotion = false, renderer = null, camera = null } = {}) {
  const root = new THREE.Group();
  root.name = 'couple';
  scene.add(root);
  const figures = [];        // { name, obj, mixer, action, order, phase, s }
  let tie = null;
  const counts = { triangles: 0 };
  let theta = Math.PI * 0.75;        // start on the north-west, where the guest first sees the mandap from
  let lastStage = null;
  let warm = false;                  // compiled again as the ceremony begins (a cache hit if the lighting is unchanged since the load)

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(COUPLE_URL, (gltf) => {
    for (const [name, order, phase] of [['bride', ORDER.bride, 0], ['groom', ORDER.groom, 0.5]]) {
      const obj = gltf.scene.getObjectByName(`${name}_rig`);
      if (!obj) continue;
      // each rig carries its own "walk" clip: the one whose tracks bind to this rig's bones
      const clip = gltf.animations.find((a) => a.tracks.every((t) => THREE.PropertyBinding.findNode(obj, THREE.PropertyBinding.parseTrackName(t.name).nodeName)));
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false;
        o.receiveShadow = true;
        o.frustumCulled = true;
        counts.triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
        const m = o.material;
        m.envMapIntensity = 0.6;
        if (m.map) m.map.anisotropy = 4;
      });
      const mixer = new THREE.AnimationMixer(obj);
      const action = clip ? mixer.clipAction(clip) : null;
      if (action) {
        action.play();
        action.time = phase * clip.duration;      // the groom half a cycle out of step with the bride
        // the clip walks CYCLE_M metres per loop: play it at the orbit's speed
        action.timeScale = reducedMotion ? 0 : ((2 * Math.PI * RADIUS) / PERIOD) * (clip.duration / CYCLE_M);
      }
      obj.position.set(mx, PARK, mz);
      root.add(obj);
      figures.push({ name, obj, mixer, action, order, phase, s: 0 });
    }
    if (figures.length === 2) tie = buildTie(figures);
    // the skinned materials are new programs: compile them now (only them — compiling the whole
    // scene under a lighting state the walk then leaves would keep every material's spare
    // program around), behind the veil or before the ceremony, never on the frame they first appear
    if (renderer && camera) renderer.compile(root, camera, scene);
    if (lastStage) update(0, lastStage);
  }, undefined, (err) => console.warn('couple.glb', err));

  /** Put a figure on the circle at angle `a` (clockwise seen from above — the fire kept on the right), facing along it. */
  function place(f, a, s) {
    f.obj.position.set(mx + RADIUS * Math.cos(a), FLOOR - (1 - s) * 0.15, mz + RADIUS * Math.sin(a));
    f.obj.rotation.set(0, Math.atan2(-Math.sin(a), Math.cos(a)), 0);
    f.obj.scale.setScalar(Math.max(s, 1e-3));
  }
  function update(dt, stage) {
    lastStage = stage;
    if (!figures.length) return;
    const on = stage.ceremony;
    if (on > 0.02 && !warm && renderer && camera) { renderer.compile(root, camera, scene); warm = true; }
    if (on <= 0.02) warm = false;
    if (!reducedMotion) theta += (2 * Math.PI / PERIOD) * dt;
    const delta = GAP / RADIUS;
    for (const f of figures) {
      const s = f.s = smooth(f.order, f.order + REVEAL, on);
      if (s <= 0) { f.obj.position.y = PARK; continue; }
      place(f, theta + (f.name === LEAD ? delta : 0), s);
      if (f.mixer && dt > 0) f.mixer.update(dt);
    }
    if (tie) tie.update(theta, delta);
  }
  return {
    update, counts, lead: LEAD, get tie() { return tie; },
    dispose() {
      scene.remove(root);
      root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (o.material[k]) o.material[k].dispose(); o.material.dispose(); } });
    },
  };
}

// ── the gathbandhan ──────────────────────────────────────────────────────────
// The characters' own cloth is tied, as at a Bengali wedding: the free end of the groom's uttariya
// (his stole's left end: `DEF-tie.1`–`.6`) and a strip of the bride's veil along its front left edge,
// slit from the rest of it from the hem up (`.1`–`.15`), each lie on a chain of bones on the hips
// (recon/blender/couple.py, `TIE`: each bone at the middle of a band of the cloth and pointing along
// it). Every frame both chains are laid out afresh: the stole comes down from his side into the knot
// and on through it, gathered — the knot's core; the veil strip sags across from her side, gathered
// to a rope (B_RUN bones), wraps once round the stole (B_WRAP bones close together on a ring whose
// turn is as long as the cloth they carry, the band flat round the core) and hangs beside the
// stole's tip. Each bone is placed and turned — the cloth's run and its width — so it bends along
// the curve; the gathering squeezes across the cloth only. The run across stretches when the groom
// leads (his stole is in front of him, her veil behind her: ~1.1 m between them for ~0.9 m of cloth
// — the owner's call, Nov 2026, over lengthening his stole or walking closer). The knot is out of the
// circle (their left, the side the guest watches), at hand height.
const KNOT_Y = 0.85;                      // the knot's height over the stage (×scale)
const KNOT_OUT = 0.1;                     // how far out of the circle from the line between them
const G_KNOT = 4;                         // the stole's bone at the knot (one more below: its tip)
const G_WIDTH = [1, 0.85, 0.65, 0.5, 0.4, 0.5];
const B_RUN = 5, B_WRAP = 8, B_TAIL = 2;  // couple.py's knots for the veil: [0.1 … 0.5], 8 × 0.04, [0.92, 1]
const B_WIDTH = [1, 0.85, 0.72, 0.62, 0.55, ...Array(B_WRAP).fill(0.5), 0.6, 0.75];

function buildTie(figures) {
  const fig = Object.fromEntries(figures.map((f) => [f.name, f]));
  // GLTFLoader drops the '.' from a bone's name and suffixes the second rig's duplicates (`_1`)
  const bone = (f, n) => {
    const want = THREE.PropertyBinding.sanitizeNodeName(n);
    let hit = null;
    f.obj.traverse((o) => { if (!hit && o.isBone && (o.name === want || new RegExp(`^${want}_\\d+$`).test(o.name))) hit = o; });
    return hit;
  };
  const V = () => new THREE.Vector3();
  const chain = (name, n) => {
    const bones = Array.from({ length: n }, (_, k) => bone(fig[name], `DEF-tie.${k + 1}`));
    if (bones.some((b) => !b)) return null;
    return {
      f: fig[name], bones, rest: bones.map((b) => b.position.clone()), restQ: bones.map((b) => b.quaternion.clone()),
      at: bones.map(V), goal: bones.map(V), wid: bones.map(V), len: bones.map(() => 0),
    };
  };
  const g = chain('groom', G_WIDTH.length), b = chain('bride', B_WIDTH.length);
  if (!g || !b) { console.warn('couple.glb has no DEF-tie chains: the gathbandhan is off'); return null; }
  const W0 = B_RUN, T0 = B_RUN + B_WRAP;                 // the veil's first bone on the ring, on the tail
  const up = new THREE.Vector3(0, 1, 0);
  const out = V(), knot = V(), c = V(), t = V(), n = V(), ax = V(), e1 = V(), e2 = V(), left = V(), dir = V(), end = V();
  const tR = V(), wR = V(), tG = V(), m = new THREE.Matrix4(), qR = new THREE.Quaternion(), qG = new THREE.Quaternion();
  const turn = new THREE.Quaternion(), qw = new THREE.Quaternion(), qp = new THREE.Quaternion(), I = new THREE.Quaternion();
  const bez = (a, b2, d, u, o) => o.set(0, 0, 0).addScaledVector(a, (1 - u) * (1 - u)).addScaledVector(b2, 2 * u * (1 - u)).addScaledVector(d, u * u);
  const ortho = (w, tan) => w.addScaledVector(tan, -w.dot(tan)).normalize();
  const tangent = (pts, i, o) => (i < pts.length - 1 ? o.subVectors(pts[i + 1], pts[i]) : o.subVectors(pts[i], pts[i - 1])).normalize();
  // the level direction across a run (the cloth's width as it hangs), or `fallback` where the run is vertical
  const level = (tan, fallback, o) => { o.crossVectors(up, tan); if (o.lengthSq() < 1e-4) o.copy(fallback); ortho(o, tan); if (o.dot(fallback) < 0) o.negate(); return o; };
  const frame = (tan, w, q) => { n.crossVectors(tan, w); m.makeBasis(tan, w, n); return q.setFromRotationMatrix(m); };
  // bones from..to on a quadratic from `a` through `ctrl` to `d`, spaced as the cloth's bones are at rest
  const run = (e, from, to, a, ctrl, d) => {
    let L = 0; for (let i = from + 1; i <= to; i++) L += e.len[i];
    let s = 0;
    for (let i = from; i <= to; i++) { if (i > from) s += e.len[i]; bez(a, ctrl, d, L ? s / L : 0, e.goal[i]); }
  };
  const lenSum = (e, from, to) => { let L = 0; for (let i = from + 1; i <= to; i++) L += e.len[i]; return L; };
  const pose = (e, widths, k) => {
    e.f.obj.getWorldQuaternion(qw);
    left.set(1, 0, 0).applyQuaternion(qw);
    e.bones.forEach((bn, i) => {
      tangent(e.at, i, tR); level(tR, left, wR);
      tangent(e.goal, i, tG);
      frame(tR, wR, qR); frame(tG, e.wid[i], qG);
      turn.copy(qG).multiply(qR.invert()).slerp(I, 1 - k);
      bn.getWorldQuaternion(qw); qw.premultiply(turn);
      bn.parent.getWorldQuaternion(qp);
      bn.quaternion.copy(qp.invert().multiply(qw));
      if (i > 0) { t.lerpVectors(e.at[i], e.goal[i], k); bn.parent.worldToLocal(t); bn.position.copy(t); }
      const w = 1 + (widths[i] - 1) * k;
      bn.scale.set(w, 1, w);                      // across the cloth; its run (the bone's Y) keeps its length
    });
  };
  const levelWidths = (e, from, to, prev) => { for (let i = from; i <= to; i++) { tangent(e.goal, i, tG); prev = level(tG, prev, e.wid[i]); } return prev; };
  const figLeft = (e) => left.set(1, 0, 0).applyQuaternion(e.f.obj.getWorldQuaternion(qw)).clone();
  const api = {
    stretch: [0, 0], g, b, knot,   // goal ÷ rest length of each chain (groom, bride), for checking
    update(theta, delta) {
      const s = Math.min(fig.groom.s, fig.bride.s);
      const k = smooth(0.6, 1, s);                         // drawn together once both are in
      for (const e of [g, b]) e.bones.forEach((bn, i) => { bn.position.copy(e.rest[i]); bn.quaternion.copy(e.restQ[i]); bn.scale.setScalar(1); });
      if (k <= 0) return;
      for (const e of [g, b]) {
        e.f.obj.updateMatrixWorld(true);
        e.bones.forEach((bn, i) => { bn.getWorldPosition(e.at[i]); e.len[i] = i ? e.at[i].distanceTo(e.at[i - 1]) : 0; });
      }
      const mid = theta + delta / 2;
      out.set(Math.cos(mid), 0, Math.sin(mid));
      // the knot: on the line between the two roots where his stole's length and the veil's run meet,
      // out of the circle a little, no higher than hand height
      const gL = lenSum(g, 0, G_KNOT), bL = lenSum(b, 0, W0);
      dir.subVectors(b.at[0], g.at[0]);
      knot.copy(g.at[0]).addScaledVector(dir, gL / (gL + bL)).addScaledVector(out, KNOT_OUT * s);
      knot.y = Math.min(FLOOR + KNOT_Y * s, knot.y - 0.08 * s);

      // the stole: down and across into the knot, easing in from above, then its tip on through
      c.lerpVectors(g.at[0], knot, 0.5); c.y = Math.max(c.y, knot.y + g.len[G_KNOT] * 0.5);
      run(g, 0, G_KNOT, g.at[0], c, knot);
      ax.subVectors(knot, g.goal[G_KNOT - 1]).normalize();          // the core's run at the knot
      for (let i = G_KNOT + 1; i < g.bones.length; i++) g.goal[i].copy(g.goal[i - 1]).addScaledVector(ax, g.len[i] * 0.95);
      levelWidths(g, 0, g.bones.length - 1, figLeft(g));

      // the veil: one turn round the core (a slight helix down it), the run across sagging into it,
      // and the tail hanging from where the turn ends
      const C = lenSum(b, W0, T0 - 1) * B_WRAP / (B_WRAP - 1);       // the turn's length
      const R = THREE.MathUtils.clamp(C / (2 * Math.PI), 0.03, 0.06) * 1;
      e1.subVectors(b.at[0], knot); ortho(e1, ax);                  // the turn starts on her side of the core
      e2.crossVectors(ax, e1);
      const ring = (j, o) => {
        const phi = (j / B_WRAP) * 2 * Math.PI;
        return o.copy(knot).addScaledVector(e1, R * Math.cos(phi)).addScaledVector(e2, R * Math.sin(phi)).addScaledVector(ax, (j / B_WRAP - 0.5) * 0.04 * s);
      };
      for (let j = 0; j < B_WRAP; j++) ring(j, b.goal[W0 + j]);
      end.copy(b.goal[W0]);
      c.addVectors(b.at[0], end).multiplyScalar(0.5);
      c.y = Math.min(b.at[0].y, end.y) - 0.1 * s;                  // the run sags
      run(b, 0, W0, b.at[0], c, end);
      ring(B_WRAP, t);
      for (let i = T0; i < b.bones.length; i++) {
        const from = i === T0 ? t : b.goal[i - 1];
        b.goal[i].copy(from).addScaledVector(up, -b.len[i] * 0.95).addScaledVector(e1, 0.01 * s);
      }
      let w = levelWidths(b, 0, W0 - 1, figLeft(b));
      for (let i = W0; i < T0; i++) { tangent(b.goal, i, tG); b.wid[i].copy(ax); ortho(b.wid[i], tG); if (b.wid[i].dot(w) < 0) b.wid[i].negate(); w = b.wid[i]; }
      levelWidths(b, T0, b.bones.length - 1, w);

      [g, b].forEach((e, i) => {
        let L = 0;
        for (let j = 1; j < e.goal.length; j++) L += e.goal[j].distanceTo(e.goal[j - 1]);
        api.stretch[i] = L / lenSum(e, 0, e.goal.length - 1);
      });
      pose(b, B_WIDTH, k);
      pose(g, G_WIDTH, k);
    },
  };
  return api;
}
