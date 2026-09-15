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
const gx = L.ghat.top[0];                             // top of the ghat = the courtyard's west edge
const gFoot = L.ghat.foot[0];

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

// ── the tables ───────────────────────────────────────────────────────────────
// Each hall is laid out for the wedding along its back (east) wall: a table per stop, with what a
// temple hall would hold the day before a Bengali wedding (tables.js builds them from this). The
// walk inside each hall is a U — in at a west door, across to the east wall, along it past the
// tables, out at another west door — and every card pins to its table. `p` is the table's centre
// on the floor, its front facing west into the hall; `card` is the content.json id that stops here.
const rEastX = rx + R.size[0] - 0.5, nEastX = nx + N.size[0] - 0.5;   // the inner faces (walls 0.5 thick)
const TABLE = { len: 1.8, dep: 0.8, h: 0.78 };
/** @type {Record<string, { p: number[], rot: number, hall: 'R'|'N', card: string, len?: number, h?: number }>} */
export const TABLES = {
  // the Radhakanta, walked north → south; its east face is windows, the tables against the wall
  welcome: { p: [rEastX - 0.55, rP, rDoor(1.5)], rot: -Math.PI / 2, hall: 'R', card: 'train' },
  puja: { p: [rEastX - 0.55, rP, rDoor(3.2)], rot: -Math.PI / 2, hall: 'R', card: 'air' },
  bhog: { p: [rEastX - 0.55, rP, rDoor(4.9)], rot: -Math.PI / 2, hall: 'R', card: 'hotels' },
  shringar: { p: [rEastX - 0.55, rP, rDoor(6.6)], rot: -Math.PI / 2, hall: 'R', card: 'haldi' },
  // the nat-mandir, walked south → north; its east face is doorways, so the tables stand a little
  // in from the wall, in front of the arches
  malakar: { p: [nEastX - 0.9, nP, nDoor(5.4)], rot: -Math.PI / 2, hall: 'N', card: 'breakfast' },
  music: { p: [nEastX - 0.9, nP, nDoor(4.2)], rot: -Math.PI / 2, hall: 'N', card: 'baraat', len: 1.4, h: 0.45 },
  lamps: { p: [nEastX - 0.9, nP, nDoor(3.0)], rot: -Math.PI / 2, hall: 'N', card: 'vows' },
  tattva: { p: [nEastX - 0.9, nP, nDoor(1.8)], rot: -Math.PI / 2, hall: 'N', card: 'cocktails' },
  paan: { p: [nEastX - 0.9, nP, nDoor(0.6)], rot: -Math.PI / 2, hall: 'N', card: 'reception' },
};
for (const t of Object.values(TABLES)) { t.len ??= TABLE.len; t.dep ??= TABLE.dep; t.h ??= TABLE.h; }
/** A look target on a table: a little above the props (lower and the turns pitch the camera at the floor; higher and a phone's docked card hides the table), `oz` along the wall. */
const top = (k, oz = 0) => [TABLES[k].p[0], TABLES[k].p[1] + 0.85, TABLES[k].p[2] + oz];

// Camera path: position + look target. Each Catmull-Rom segment spans an equal slice of the
// scroll, so short segments (doorways, the stairs, the last step up to a table) are walked slowly
// on purpose; the long courtyard legs get few nodes. Doorways get a node either side on the door's
// axis so the spline passes straight through the opening. Inside the halls every table gets an
// approach node a few metres before it and an abreast node just before it — the short segment
// between them is the pause at the table. Nodes anything refers to carry a name (`n`), exported as
// NODE, so the schedule, the carpets and the cards say `NODE.rIn` rather than a number.
export const PATH = [
  { p: [gx - 49.5, 7.5, gz + 6], l: [-8, 10, gz - 4] },                    // 0 over the river: the whole west front
  { p: [gx - 21.5, 3.0, gz], l: [gx + 8.5, 6, gz - 2] },                   // 1 toward the ghat
  { p: on(gFoot + 1, gz), l: [gx + 8.5, 5, gz - 4] },                     // 2 foot of the ghat
  { p: on(gx - 2, gz), l: [gx + 11.5, 5.5, gz - 9] },                     // 3 near the top: the invitation
  { n: 'ghatTop', p: on(gx + 1.5, gz), l: [gx + 14.5, 5, gz - 11] },      // 4 top of the ghat, the view swinging left
  { p: on(gx + 10.5, gz - 0.5), l: [gx + 19.5, 5.5, gz - 25] },           // 5 through the gap: the north Shiva group's flank, the Radhakanta's front
  { n: 'strip', p: on(-22, gz - 13), l: [-10, 6, rDoor(0) + 2] },         // 6 up the strip
  { p: on(-20, -31), l: [rx, 5, rDoor(0)] },                              // 7 its 8-bay front sliding by on the right (west of the lamp post at z −22)
  { n: 'rFoot', p: on(rFoot - 1.6, rDoor(0) + 0.35), l: [rx + 3, rP + 2.0, rDoor(0)] }, // 8 at the foot of the flight up to the northmost door (a touch south: the spline bends north here)
  { n: 'rLedgeN', p: on(rLedge, rDoor(0)), l: [rx + 6, rP + 2.2, rDoor(0)] }, // 9 up on the ledge, in the doorway, looking in
  { n: 'rIn', p: on(rx + 1.3, rDoor(0)), l: [rx + 12, rP + 2.2, rDoor(0) + 3] }, // 10 just inside: across the hall to the east wall
  { n: 'rNE', p: on(rx + 13.6, rDoor(0) - 0.4), l: top('welcome') },     // 11 the north-east corner, turning south
  { n: 'rWelcome', p: on(rx + 14.8, rDoor(1.5) - 3.2), l: top('welcome') }, // 12 down the east wall: the welcome table (train)
  { n: 'rWelcomeb', p: on(rx + 14.8, rDoor(1.5) - 1.4), l: top('welcome', 0.8) }, // 13 abreast of it
  { n: 'rPuja', p: on(rx + 14.8, rDoor(3.2) - 3.2), l: top('puja') },     // 14 the puja table (air)
  { n: 'rPujab', p: on(rx + 14.8, rDoor(3.2) - 1.4), l: top('puja', 0.8) }, // 15
  { n: 'rBhog', p: on(rx + 14.8, rDoor(4.9) - 3.2), l: top('bhog') },     // 16 the bhog table (hotels)
  { n: 'rBhogb', p: on(rx + 14.8, rDoor(4.9) - 1.4), l: top('bhog', 0.8) }, // 17
  { n: 'rShringar', p: on(rx + 14.8, rDoor(6.6) - 3.2), l: top('shringar') }, // 18 the shringar table (haldi & sangeet)
  { n: 'rShringarb', p: on(rx + 14.4, rDoor(6.6) - 1.2), l: top('shringar', 0.8) }, // 19
  { n: 'rOut', p: on(rx + 1.3, rDoor(7)), l: [rx - 7, rP + 1.6, rDoor(7) + 9] }, // 20 back across to the southmost door, on its axis
  { n: 'rLedgeS', p: on(rLedge, rDoor(7)), l: [mx, L.mandap.canopy - 0.4, mz] }, // 21 in the doorway: the mandap ahead, south-west
  { n: 'rFlightS', p: on(rFoot - 1.2, rDoor(7)), l: [mx - 1, L.mandap.canopy - 0.6, mz - 4] }, // 22 down its flight to the courtyard
  { n: 'mandapNE', p: on(-16.5, -15), l: [mx, L.mandap.canopy - 1.2, mz] }, // 23 straight across toward the mandap, from the north-east (the ceremony)
  { n: 'mandapNW', p: on(-22.5, -9.5), l: [mx + 1, L.mandap.canopy - 1.5, mz + 1] }, // 24 round its north-west corner, outside the ring of diyas
  { n: 'mandapW', p: on(-23.5, gz + 4.5), l: [mx + 2, 4.3, mz + 3] },     // 25 past its west side
  { n: 'natFront', p: on(-16, 12), l: [nx + 2, 6.5, nz - 4] },            // 26 south-east toward the nat-mandir front
  { n: 'nFoot', p: on(nFoot - 1.0, nz), l: [nx + 3, 5.5, nz] },           // 27 the foot of its west stair, looking into the hall
  { n: 'nIn', p: on(nx + 0.5, nz), l: [nx + 12, nP + 2.4, nz + 7] },      // 28 top of the stair, in the doorway: into the hall, to the south-east
  { n: 'nSE', p: on(nx + 9.5, nDoor(5.4) + 1.9), l: top('malakar') },     // 29 across the hall, south of the alpona, to the east wall
  { n: 'nMalakar', p: on(nx + 14.5, nDoor(5.4) + 2.6), l: top('malakar') }, // 30 the south-east corner, turning north: the garland-maker's table (breakfast)
  { n: 'nMalakarb', p: on(nx + 14.5, nDoor(5.4) + 1.2), l: top('malakar', -0.7) }, // 31 abreast of it
  { n: 'nMusic', p: on(nx + 14.5, nDoor(4.2) + 2.6), l: top('music') },   // 32 the music corner (baraat)
  { n: 'nMusicb', p: on(nx + 14.5, nDoor(4.2) + 1.2), l: top('music', -0.7) }, // 33
  { n: 'nLamps', p: on(nx + 14.5, nDoor(3.0) + 2.6), l: top('lamps') },   // 34 the lamp table (the ceremony)
  { n: 'nLampsb', p: on(nx + 14.5, nDoor(3.0) + 1.2), l: top('lamps', -0.7) }, // 35
  { n: 'nTattva', p: on(nx + 14.5, nDoor(1.8) + 2.6), l: top('tattva') }, // 36 the tattva trays (cocktails)
  { n: 'nTattvab', p: on(nx + 14.5, nDoor(1.8) + 1.2), l: top('tattva', -0.7) }, // 37
  { n: 'nPaan', p: on(nx + 14.5, nDoor(0.6) + 2.6), l: top('paan') },     // 38 the paan & mishti table (reception)
  { n: 'nPaanb', p: on(nx + 14.2, nDoor(0.6) + 1.2), l: top('paan', -0.7) }, // 39
  { n: 'nOut', p: on(nx + 1.3, nDoor(0)), l: [nx - 8, nP + 2.2, nDoor(0) - 3] }, // 40 back along the north wall to the northmost door, on its axis
  { n: 'nLedge', p: on(nLedge, nDoor(0) - 2.2), l: [-7, pt + 4, 4] },     // 41 out on the ledge, turning north: the navaratna's platform ahead
  { n: 'plinthNW', p: on(nLedge, nNorth + 0.7), l: [-1, pt + 3, 6] },     // 42 the plinth's north-west corner
  { n: 'northLedge', p: on(-2.2, nNorth + 0.5), l: [0, pt + 2.8, doorZ] }, // 43 along the north ledge to the temple stair, which meets it here
  { n: 'stair', p: on(0, 11.9), l: [0, pt + 2.8, doorZ] },                // 44 up the stair on its axis
  { n: 'arch', p: on(0, 9.6), l: [0, doorMid + 0.9, doorZ] },             // 45 the central arch framing the shrine door
  { n: 'end', p: on(0, wall + 0.6), l: [0, doorMid + 0.25, doorZ - 0.4] }, // 46 in the central arch, looking into the sanctum
];
const last = PATH.length - 1;
/** Walk progress of PATH node i. */
export const at = (i) => i / last;
/** The index of every named PATH node: `at(NODE.rIn)` is the walk progress at the Radhakanta's north door. */
export const NODE = Object.fromEntries(PATH.map((x, i) => [x.n, i]).filter(([n]) => n));
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
// camera cannot be projected and the card vanishes), so cards pin to what the walk is heading for:
// inside the halls, the table the guest is walking up to (its range ends just past the abreast
// node, before the look moves on to the next).
const span = (from, to) => [at(from), at(from + 0.5), at(to - 0.5), at(to)];
/** Above a table's props, where its card pins. */
const over = (k) => [TABLES[k].p[0], TABLES[k].p[1] + 1.35, TABLES[k].p[2]];
const N_ = NODE;
export const ANCHORS = {
  gate: { anchor: [L.ghat.top[0] + 0.5, g + 2.2, gz - 7], range: span(3, 4.3), side: 'left' },           // the ghat's top edge
  story: { anchor: [L.shiva.x + L.shiva.size / 2 + 0.2, L.shiva.plinth_top + 4.3, L.shiva.first_north[2] - 2 * L.shiva.pitch], range: span(5, 6.3), side: 'right' }, // the third north Shiva temple
  train: { anchor: over('welcome'), range: span(N_.rNE + 0.3, N_.rWelcomeb + 0.15), side: 'left' },
  air: { anchor: over('puja'), range: span(N_.rWelcomeb + 0.6, N_.rPujab + 0.15), side: 'right' },
  hotels: { anchor: over('bhog'), range: span(N_.rPujab + 0.6, N_.rBhogb + 0.15), side: 'left' },
  haldi: { anchor: over('shringar'), range: span(N_.rBhogb + 0.6, N_.rShringarb + 0.15), side: 'right' },
  ceremony: { anchor: [mx, L.mandap.canopy + 0.3, mz], range: span(N_.rFlightS + 0.2, N_.mandapW + 0.2), side: 'right' }, // the mandap
  breakfast: { anchor: over('malakar'), range: span(N_.nIn + 0.5, N_.nMalakarb + 0.15), side: 'left' },
  baraat: { anchor: over('music'), range: span(N_.nMalakarb + 0.6, N_.nMusicb + 0.15), side: 'right' },
  vows: { anchor: over('lamps'), range: span(N_.nMusicb + 0.6, N_.nLampsb + 0.15), side: 'left' },
  cocktails: { anchor: over('tattva'), range: span(N_.nLampsb + 0.6, N_.nTattvab + 0.15), side: 'right' },
  reception: { anchor: over('paan'), range: span(N_.nTattvab + 0.6, N_.nPaanb + 0.15), side: 'left' },
  rsvp: { anchor: [L.navaratna.bay_pitch * 0.9, doorMid + 1.2, doorZ], range: [at(N_.stair + 0.6), at(N_.stair + 1.3), 2, 2], side: 'right' }, // beside the shrine door
};
