import * as THREE from 'three';
import L from './landmarks.json';
import { PATH } from './walk.js';
import { SCHEDULE } from './stage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Bits shared by the runtime layers (life.js, decor.js, fx.js): the swag curve the strings and
// garlands hang on, a walk-order for "what the guest reaches first appears first", and the reveal
// hook that lets any lit three.js material scale its instances in on a stage transition without a
// draw call or a JS loop per frame.
// ─────────────────────────────────────────────────────────────────────────────

/** Points along a catenary-ish swag from a to b (both [x,y,z] or Vector3), sagging `sag` metres. */
export function swag(a, b, sag, step) {
  const A = a.isVector3 ? a.clone() : new THREE.Vector3(...a);
  const B = b.isVector3 ? b.clone() : new THREE.Vector3(...b);
  const n = Math.max(2, Math.round(A.distanceTo(B) / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = A.clone().lerp(B, t);
    p.y -= sag * 4 * t * (1 - t);
    out.push(p);
  }
  return out;
}

/** 0 → 1 along the walk: the PATH node nearest to a world point, as a fraction of the walk. */
const _nodes = PATH.map((n) => new THREE.Vector3(...n.p));
export function walkOrder(p) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < _nodes.length; i++) {
    const d = _nodes[i].distanceToSquared(p);
    if (d < bd) { bd = d; best = i; }
  }
  return best / (_nodes.length - 1);
}

// ── the reveal hook ──────────────────────────────────────────────────────────
// Materials get `attachReveal(material, uniforms)`; their geometry carries two attributes:
//   aOrder  when, within the transition, this instance/vertex appears (0 → 1; < 0 = always there)
//   aGroup  which transition drives it (GROUP[name])
// and the mesh scales in from nothing while dropping the last 15 cm into place. `aHang` (0 → 1,
// how free the bloom is to swing) and `aPhase` add wind to anything hung.
export const GROUP = Object.fromEntries(Object.keys(SCHEDULE).map((k, i) => [k, i]));
const NGROUP = Object.keys(SCHEDULE).length;
export const REVEAL_WIDTH = 0.12;

/** The uniforms one reveal set shares: `reveal` (one float per SCHEDULE key, in that order) and `time`. */
export function revealUniforms(time) {
  return { reveal: { value: new Array(NGROUP).fill(0) }, time };
}
/** Copy the stage transitions into a reveal uniform array. */
export function setReveal(uniforms, stage) {
  const r = uniforms.reveal.value;
  for (const [k, i] of Object.entries(GROUP)) r[i] = stage[k];
}

export function attachReveal(material, uniforms, { sway = 0.035, leaf = false } = {}) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.reveal = uniforms.reveal;
    sh.uniforms.time = uniforms.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float reveal[${NGROUP}]; uniform float time;
        attribute float aOrder; attribute float aGroup; attribute float aHang; attribute float aPhase;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float rT = reveal[int(aGroup + 0.5)];
        float rR = aOrder < 0.0 ? 1.0 : smoothstep(aOrder, aOrder + ${REVEAL_WIDTH.toFixed(3)}, rT);
        transformed *= rR;`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec4 rWp = modelMatrix * mvPosition;
        rWp.y += (1.0 - rR) * 0.15;
        rWp.x += sin(time * 1.1 + aPhase * 6.2832 + rWp.z * 0.7) * ${sway.toFixed(3)} * aHang;
        rWp.z += cos(time * 0.9 + aPhase * 6.2832 + rWp.x * 0.5) * ${sway.toFixed(3)} * aHang;
        mvPosition = viewMatrix * rWp;
        gl_Position = projectionMatrix * mvPosition;`);
    if (leaf) {
      // a mango leaf cut from the card: pointed at both ends, widest a third of the way down
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vLeaf;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLeaf = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vLeaf;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float lw = 0.5 * sin(pow(1.0 - vLeaf.y, 0.75) * 3.14159);
          if (abs(vLeaf.x - 0.5) > lw) discard;
          diffuseColor.rgb *= 0.8 + 0.4 * smoothstep(0.0, 0.05, abs(vLeaf.x - 0.5));   // a pale midrib`);
    }
  };
  material.customProgramCacheKey = () => `reveal${sway}${leaf}`;
  return material;
}

/** The four reveal attributes for `n` instances (or vertices), from per-item records. */
export function revealAttributes(geo, items, instanced = true) {
  const n = items.length;
  const order = new Float32Array(n), group = new Float32Array(n), hang = new Float32Array(n), phase = new Float32Array(n);
  items.forEach((it, i) => { order[i] = it.order; group[i] = it.group; hang[i] = it.hang || 0; phase[i] = it.phase ?? Math.random(); });
  const A = instanced ? THREE.InstancedBufferAttribute : THREE.BufferAttribute;
  geo.setAttribute('aOrder', new A(order, 1));
  geo.setAttribute('aGroup', new A(group, 1));
  geo.setAttribute('aHang', new A(hang, 1));
  geo.setAttribute('aPhase', new A(phase, 1));
}

/** Set the reveal attributes on a plain mesh's geometry (every vertex the same). */
export function revealMesh(geo, order, group) {
  const n = geo.attributes.position.count;
  revealAttributes(geo, Array.from({ length: n }, () => ({ order, group, hang: 0, phase: 0 })), false);
}

// ── spatial chunks ───────────────────────────────────────────────────────────
// The blooms, bowls, flames and bulbs are thousands of instances spread over the whole complex.
// One mesh each would be one draw call but every vertex of it every frame, wherever the camera
// looks; split into chunks of `cell` metres the renderer frustum-culls what is behind the guest,
// and `cullChunks` hides the chunks nothing of which has appeared yet. Each chunk gets its own copy
// of the geometry (the per-instance attributes live on it).
/** Which hall (x, z) is inside the walls of: 'R', 'N' or null. The halls occlude each other's insides. */
const ROOMS = [['R', L.radhakanta], ['N', L.natmandir]].map(([k, H]) => ({ k, x0: H.west_face_x, x1: H.west_face_x + H.size[0], z0: H.center[2] - H.size[1] / 2, z1: H.center[2] + H.size[1] / 2 }));
export function roomOf(x, z) {
  for (const r of ROOMS) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return r.k;
  return null;
}
export function chunkBy(items, cell = 20) {
  const map = new Map();
  for (const it of items) {
    const p = it.p;
    const x = p.isVector3 ? p.x : p[0], z = p.isVector3 ? p.z : p[2];
    const room = roomOf(x, z);
    const key = `${Math.floor(x / cell)},${Math.floor(z / cell)},${room}`;   // a chunk never straddles a wall
    let c = map.get(key);
    if (!c) map.set(key, (c = { items: [], min: new Array(NGROUP).fill(Infinity), always: false, mesh: null, room }));
    c.items.push(it);
    if (it.order < 0) c.always = true;
    else if (it.group !== undefined) c.min[it.group] = Math.min(c.min[it.group], it.order);
  }
  return [...map.values()];
}
/** Bound an instanced mesh by its instances (plus a margin for the reveal drop and the wind) so it frustum-culls. */
export function boundChunk(mesh, margin = 0.4) {
  mesh.computeBoundingSphere();
  mesh.boundingSphere.radius += margin;
  mesh.frustumCulled = true;
  return mesh;
}
/**
 * Hide the chunks none of whose instances has begun to appear (the reveal is smoothstep(order, …)),
 * and, with the room the camera is in, the inside of the other hall (walls between).
 */
export function cullChunks(chunks, reveal, camRoom = null) {
  for (const c of chunks) c.mesh.visible = (c.always || c.min.some((m, g) => reveal[g] > m)) && !(camRoom && c.room && c.room !== camRoom);
}

/** Smoothstep in JS. */
export function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-6, b - a)));
  return t * t * (3 - 2 * t);
}
