import * as THREE from 'three';
import L from './landmarks.json';

// ─────────────────────────────────────────────────────────────────────────────
// The walk through the complex, in the model's frame (metres; x east, y up, z south — so
// walking north is walking toward −z). Positions come from landmarks.json, which
// recon/blender/export_web.py writes from the same LAYOUT the model is built from.
//
//   the river, west of the complex      wide shot: the twelve Shiva temples with the spires behind
//   up the ghat                         the invitation; at the top the view swings left (north)
//   up the strip                        along the north Shiva group to the Radhakanta's 8-bay front
//   the Radhakanta                      up the flight to its northmost door, the length of the hall
//                                         southward: how to get here and the day before (train, air,
//                                         hotels, haldi), out and down the flight at its southmost door
//   out to the mandap                   the ceremony itself, then round the mandap's west side
//   the nat-mandir                      up its west stair, north through the hall: the wedding day
//   out of its northmost door           along the plinth's west and north ledges to the temple stair,
//                                         which meets the north ledge (its foot is inside the plinth)
//   up onto the temple platform         and into the central arch: the sanctum door, Ma Kali, the RSVP
// ─────────────────────────────────────────────────────────────────────────────

const EYE = 1.65;
const g = L.ground;                                   // courtyard platform, y
const [mx, , mz] = L.mandap.center;                   // mandap centre
const R = L.radhakanta;
const rx = R.west_face_x;                             // Radhakanta west wall
const rz = R.center[2];
const rP = R.plinth_top;
const rLedge = rx - R.plinth_out / 2;                 // walking on its plinth ledge
const rFoot = rx - R.plinth_out - R.stair_steps * R.stair_tread;   // the foot of its west flights
/** z of the Radhakanta's west doorways, north (0) to south. */
const rDoor = (i) => rz + (i - (R.bays_west - 1) / 2) * R.bay_pitch;
const N = L.natmandir;
const nx = N.west_face_x;                             // nat-mandir west wall
const nz = N.center[2];                               // nat-mandir centre, z
const nP = N.plinth_top;
const nLedge = nx - N.plinth_out / 2 + 0.2;           // its ledge (the spline bulges toward the lip at the corner)
const nFoot = nx - N.plinth_out - N.stair_steps * N.stair_tread;
const nNorth = nz - N.size[1] / 2 - N.plinth_out;     // north edge of its plinth
const nDoor = (i) => nz + (i - (N.bays_west - 1) / 2) * N.bay_pitch;
const pt = L.navaratna.platform_top;
const P = L.navaratna.platform;
const { stair_foot, stair_steps, stair_width } = L.navaratna;
const wall = L.navaratna.wall_x;                      // south verandah wall at z = +wall
const [, , doorZ] = L.sanctum.door;                   // the shrine door in the core's south face
const doorMid = pt + L.sanctum.arch[1] / 2;

const gz = L.ghat.top[2];

// ── the walking surface ──────────────────────────────────────────────────────
// Everything the guest walks on, from the landmarks: the courtyard, the ghat's flight, the halls'
// plinths and the stairs up to them, the navaratna's platform and its stair. `surfaceY` is the
// height of the highest of those under (x, z) — a stair as a smooth ramp, which is what a walking
// eye follows — or null over the river. `floorY` is the same with the stairs as treads, for things
// laid on the ground (the carpets). The camera path takes its heights from this, so the camera
// climbs where there is a stair and never steps up a plinth face; the carpets sample the same
// curve, so they lie exactly under the walk.
const STAIRS = [];   // { x0, x1, z0, z1, y0, y1, along: 'x' | 'z', dir: +1 | -1, n } — rises from y0 at the foot to y1
const FLATS = [];    // { x0, x1, z0, z1, y }
FLATS.push({ x0: -1e4, x1: L.river_x, z0: -1e4, z1: 1e4, y: -1.6 });   // the river (build_ground: water at −1.6): the ghat's foot is under it
FLATS.push({ x0: L.courtyard.center[0] - L.courtyard.size[0] / 2, x1: L.courtyard.center[0] + L.courtyard.size[0] / 2, z0: L.courtyard.center[2] - L.courtyard.size[1] / 2, z1: L.courtyard.center[2] + L.courtyard.size[1] / 2, y: g });
STAIRS.push({ x0: L.ghat.foot[0], x1: L.ghat.top[0], z0: gz - L.ghat.width / 2, z1: gz + L.ghat.width / 2, y0: L.ghat.foot[1], y1: L.ghat.top[1], along: 'x', dir: 1, n: 9 });
for (const H of [R, N]) {
  const [cx, , cz] = H.center, [w, d] = H.size, o = H.plinth_out;
  FLATS.push({ x0: cx - w / 2 - o, x1: cx + w / 2 + o, z0: cz - d / 2 - o, z1: cz + d / 2 + o, y: H.plinth_top });
  const foot = H.west_face_x - o - H.stair_steps * H.stair_tread, top = H.west_face_x - o;
  const flight = (zc, width) => STAIRS.push({ x0: foot, x1: top, z0: zc - width / 2, z1: zc + width / 2, y0: g, y1: H.plinth_top, along: 'x', dir: 1, n: H.stair_steps });
  flight(cz, H.stair_width);                                                               // the broad central flight
  for (const i of H.door_stairs || []) flight(cz + (i - (H.bays_west - 1) / 2) * H.bay_pitch, H.door_stair_width);   // and one up to each end door
}
FLATS.push({ x0: -P / 2, x1: P / 2, z0: -P / 2, z1: P / 2, y: pt });
STAIRS.push({ x0: -stair_width / 2, x1: stair_width / 2, z0: L.navaratna.stair_top[2], z1: stair_foot[2], y0: g, y1: pt, along: 'z', dir: -1, n: stair_steps });
const inside = (s, x, z, m = 0) => x >= s.x0 - m && x <= s.x1 + m && z >= s.z0 - m && z <= s.z1 + m;

/**
 * The walking surface under (x, z), stairs as ramps; null over the river. The eye is allowed half
 * a metre past a platform's edge (the spline bulges a little at corners); things laid on the
 * floor (`stepped`) are not.
 */
export function surfaceY(x, z, stepped = false) {
  let y = null;
  for (const f of FLATS) if (inside(f, x, z, stepped ? 0 : 0.5) && (y === null || f.y > y)) y = f.y;
  for (const s of STAIRS) {
    if (!inside(s, x, z)) continue;
    const u = s.along === 'x' ? (s.dir > 0 ? (x - s.x0) / (s.x1 - s.x0) : (s.x1 - x) / (s.x1 - s.x0)) : (s.dir > 0 ? (z - s.z0) / (s.z1 - s.z0) : (s.z1 - z) / (s.z1 - s.z0));
    const k = stepped ? Math.min(s.n, Math.max(1, Math.ceil(u * s.n - 1e-6))) / s.n : u;
    const sy = s.y0 + (s.y1 - s.y0) * k;
    if (y === null || sy > y) y = sy;
  }
  return y;
}
/** The floor under (x, z) with the stairs as treads (for things laid on it); null over the river. */
export const floorY = (x, z) => surfaceY(x, z, true);
/** Is (x, z) on a stair? (the carpets are sampled finely there) */
export function onStair(x, z) { return STAIRS.some((s) => inside(s, x, z)); }
/**
 * Pull (x, z) onto the axis of the flight it is on or about to reach (within a metre), for things
 * that should run straight up a stair however the walk approaches it (the carpets).
 */
export function stairSnap(x, z, out = [0, 0]) {
  out[0] = x; out[1] = z;
  for (const s of STAIRS) {
    if (s.n > 6) continue;   // the ghat and the temple stair are broad: the walk goes up them as it likes
    const dx = Math.max(s.x0 - x, 0, x - s.x1), dz = Math.max(s.z0 - z, 0, z - s.z1);
    const k = 1 - Math.min(1, Math.hypot(dx, dz) / 1.0);
    if (k <= 0) continue;
    if (s.along === 'x') out[1] = z + ((s.z0 + s.z1) / 2 - z) * k; else out[0] = x + ((s.x0 + s.x1) / 2 - x) * k;
    return out;
  }
  return out;
}
/** Is (x, z) on a hall's plinth ledge (outside its walls, not on a flight)? The carpet is narrower there. */
export function onLedge(x, z) {
  if (onStair(x, z)) return false;
  for (const H of [R, N]) {
    const [cx, , cz] = H.center, [w, d] = H.size, o = H.plinth_out;
    if (x >= cx - w / 2 - o && x <= cx + w / 2 + o && z >= cz - d / 2 - o && z <= cz + d / 2 + o && !(x > cx - w / 2 && x < cx + w / 2 && z > cz - d / 2 && z < cz + d / 2)) return true;
  }
  return false;
}
/** A path node standing on the surface at (x, z), eye height up. */
const on = (x, z) => [x, surfaceY(x, z) + EYE, z];

// Camera path: position + look target. Each Catmull-Rom segment spans an equal slice of the
// scroll, so short segments (doorways, the stairs) are walked slowly on purpose; the long
// courtyard legs get few nodes. Doorways get a node either side on the door's axis so the
// spline passes straight through the opening.
export const PATH = [
  { p: [-88, 7.5, gz + 6], l: [-8, 10, gz - 4] },                          // 0 over the river: the whole west front
  { p: [-60, 3.0, gz], l: [-30, 6, gz - 2] },                              // 1 toward the ghat
  { p: on(-46.5, gz), l: [-30, 5, gz - 4] },                              // 2 foot of the ghat
  { p: on(-40.5, gz), l: [-27, 5.5, gz - 9] },                            // 3 near the top: the invitation
  { p: on(-37, gz), l: [-24, 5, gz - 11] },                               // 4 top of the ghat, the view swinging left
  { p: on(-28, gz - 0.5), l: [-19, 5.5, gz - 25] },                       // 5 through the gap: the north Shiva group's flank, the Radhakanta's front
  { p: on(-22, gz - 13), l: [-10, 6, rDoor(0) + 2] },                     // 6 up the strip
  { p: on(-20, -31), l: [rx, 5, rDoor(0)] },                              // 7 its 8-bay front sliding by on the right (west of the lamp post at z −22)
  { p: on(rFoot - 1.6, rDoor(0) + 0.35), l: [rx + 3, rP + 2.0, rDoor(0)] }, // 8 at the foot of the flight up to the northmost door (a touch south: the spline bends north here)
  { p: on(rLedge, rDoor(0)), l: [rx + 6, rP + 2.2, rDoor(0)] },           // 9 up on the ledge, in the doorway, looking in
  { p: on(rx + 1.3, rDoor(0)), l: [rx + 8, rP + 2.2, rDoor(0) + 4] },     // 10 just inside
  { p: on(rx + 3.3, rDoor(0) + 3), l: [rx + 7.5, rP + 2.2, rDoor(7) - 1] }, // 11 turned south: the length of the hall (train)
  { p: on(rx + 4.1, rDoor(0) + 8), l: [rx + 8, rP + 2.2, rDoor(7) + 3] },   // 12 (air)
  { p: on(rx + 4.1, rDoor(0) + 13), l: [rx + 7.5, rP + 2.2, rDoor(7) + 6] }, // 13 (hotels)
  { p: on(rx + 2.9, rDoor(7) - 3.5), l: [rx - 0.5, rP + 2.0, rDoor(7) + 1] }, // 14 turning to the southmost door (haldi)
  { p: on(rx + 1.3, rDoor(7)), l: [rx - 7, rP + 1.6, rDoor(7) + 9] },        // 15 inside that door, on its axis
  { p: on(rLedge, rDoor(7)), l: [mx, L.mandap.canopy - 0.4, mz] },        // 16 in the doorway: the mandap ahead, south-west
  { p: on(rFoot - 1.2, rDoor(7)), l: [mx - 1, L.mandap.canopy - 0.6, mz - 4] }, // 17 down its flight to the courtyard
  { p: on(-16.5, -15), l: [mx, L.mandap.canopy - 1.2, mz] },              // 18 straight across toward the mandap, from the north-east (the ceremony)
  { p: on(-22.5, -9.5), l: [mx + 1, L.mandap.canopy - 1.5, mz + 1] },     // 19 round its north-west corner, outside the ring of diyas
  { p: on(-23.5, gz + 4.5), l: [mx + 2, 4.3, mz + 3] },                   // 20 past its west side
  { p: on(-16, 12), l: [nx + 2, 6.5, nz - 4] },                           // 21 south-east toward the nat-mandir front
  { p: on(nFoot - 1.0, nz), l: [nx + 3, 5.5, nz] },                       // 22 the foot of its west stair, looking into the hall
  { p: on(nx + 0.5, nz), l: [nx + 8, nP + 2.8, nz - 3] },                 // 23 top of the stair, in the doorway
  { p: on(nx + 4, nDoor(3) + 2.5), l: [nx + 13, nP + 2.6, nDoor(0) - 1] }, // 24 inside, turning north (breakfast)
  { p: on(nx + 4.9, nDoor(2)), l: [nx + 10, nP + 2.6, nDoor(0) - 6] },     // 25 (baraat) — west of the ring of diyas round the alpona
  { p: on(nx + 4.9, nDoor(1) + 1), l: [nx + 8, nP + 2.6, nDoor(0) - 8] },  // 26 (the ceremony)
  { p: on(nx + 4, nDoor(0) + 2.5), l: [nx - 1, nP + 2.2, nDoor(0) - 1] },  // 27 turning to the northmost door (cocktails)
  { p: on(nx + 1.3, nDoor(0)), l: [nx - 8, nP + 2.2, nDoor(0) - 3] },      // 28 inside that door, on its axis (reception)
  { p: on(nLedge, nDoor(0) - 2.2), l: [-7, pt + 4, 4] },                   // 29 out on the ledge, turning north: the navaratna's platform ahead
  { p: on(nLedge, nNorth + 0.7), l: [-1, pt + 3, 6] },                     // 30 the plinth's north-west corner
  { p: on(-2.2, nNorth + 0.5), l: [0, pt + 2.8, doorZ] },                  // 31 along the north ledge to the temple stair, which meets it here
  { p: on(0, 11.9), l: [0, pt + 2.8, doorZ] },                             // 32 up the stair on its axis
  { p: on(0, 9.6), l: [0, doorMid + 0.9, doorZ] },                         // 33 the central arch framing the shrine door
  { p: on(0, wall + 0.6), l: [0, doorMid + 0.25, doorZ - 0.4] },           // 34 in the central arch, looking into the sanctum
];
const last = PATH.length - 1;
/** Walk progress of PATH node i. */
export const at = (i) => i / last;
/** The camera's curve through PATH (and the one its look target follows); the carpets sample it. */
export const posCurve = new THREE.CatmullRomCurve3(PATH.map((n) => new THREE.Vector3(...n.p)), false, 'catmullrom', 0.5);
export const lookCurve = new THREE.CatmullRomCurve3(PATH.map((n) => new THREE.Vector3(...n.l)), false, 'catmullrom', 0.5);
/**
 * Where the camera stands at walk progress t: the curve's point, with its height taken from the
 * walking surface (so it climbs a flight where there is one, never a plinth face) wherever there is
 * one under it — over the river the curve's own height stands.
 */
export function eyeAt(t, out) {
  posCurve.getPoint(t, out);
  const y = surfaceY(out.x, out.z);
  // the opening is a high shot over the river that comes down to the ghat's foot by node 2
  if (y !== null) out.y = THREE.MathUtils.lerp(out.y, y + EYE, THREE.MathUtils.smoothstep(t, at(1), at(2)));
  return out;
}

// Where the cards pin (world points) and when they show: [fadeInStart, fadeInEnd, fadeOutStart,
// fadeOutEnd] in walk progress, node i of PATH being at at(i). Ranges never overlap, so at most
// one card is up; `side` alternates so consecutive cards come from opposite edges.
// A card's anchor must stay in front of the camera for the whole of its range (a point behind the
// camera cannot be projected and the card vanishes), so cards pin to what the walk is heading for.
const span = (from, to) => [at(from), at(from + 0.5), at(to - 0.5), at(to)];
const rEast = (i) => [rx + R.size[0] - 0.7, rP + 0.9 + R.arch[1] / 2, rDoor(i)];          // a window in the Radhakanta's east wall
const rSouth = (x) => [R.center[0] + x, rP + 0.9 + R.arch[1] / 2, rz + R.size[1] / 2 - 0.5]; // a window in its south wall
const nEast = (i) => [nx + N.size[0] - 0.7, nP + N.arch[1] / 2, nDoor(i)];               // a doorway in the nat-mandir's east wall
const nNorthWin = (x) => [N.center[0] + x, nP + 0.9 + N.arch[1] / 2, nz - N.size[1] / 2 + 0.5]; // a window in its north wall
export const ANCHORS = {
  gate: { anchor: [L.ghat.top[0] + 0.5, g + 2.2, gz - 7], range: span(3, 4.3), side: 'left' },           // the ghat's top edge
  story: { anchor: [L.shiva.x + L.shiva.size / 2 + 0.2, L.shiva.plinth_top + 4.3, L.shiva.first_north[2] - 2 * L.shiva.pitch], range: span(5, 6.3), side: 'right' }, // the third north Shiva temple
  train: { anchor: rEast(5), range: span(10.6, 12), side: 'left' },
  air: { anchor: rEast(7), range: span(12, 13.2), side: 'right' },
  hotels: { anchor: rSouth(0), range: span(13.2, 14.2), side: 'left' },
  haldi: { anchor: [rx - 0.3, rP + R.arch[1] + 0.8, rDoor(7)], range: span(14.2, 15.3), side: 'right' }, // over the southmost door
  ceremony: { anchor: [mx, L.mandap.canopy + 0.3, mz], range: span(17.2, 20.2), side: 'right' },         // the mandap
  breakfast: { anchor: nEast(2), range: span(23.6, 24.8), side: 'left' },
  baraat: { anchor: nNorthWin(3), range: span(24.8, 25.8), side: 'right' },
  vows: { anchor: nNorthWin(-3), range: span(25.8, 26.8), side: 'left' },
  cocktails: { anchor: [nx - 0.3, nP + N.arch[1] + 0.8, nDoor(0)], range: span(26.8, 27.9), side: 'right' }, // over the northmost door
  reception: { anchor: [-P / 2 - 0.3, pt + 1.6, 7], range: span(28, 29.9), side: 'left' },               // the navaratna platform's west rail
  rsvp: { anchor: [L.navaratna.bay_pitch * 0.9, doorMid + 1.2, doorZ], range: [at(32.6), at(33.3), 2, 2], side: 'right' }, // beside the shrine door
};
