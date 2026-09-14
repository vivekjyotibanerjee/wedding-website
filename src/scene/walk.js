import L from './landmarks.json';

// ─────────────────────────────────────────────────────────────────────────────
// The walk through the complex, in the model's frame (metres; x east, y up, z south — so
// walking north is walking toward −z). Positions come from landmarks.json, which
// recon/blender/export_web.py writes from the same LAYOUT the model is built from.
//
//   the river, west of the complex      wide shot: the twelve Shiva temples with the spires behind
//   up the ghat                         the invitation; at the top the view swings left (north)
//   up the strip                        along the north Shiva group to the Radhakanta's 8-bay front
//   the Radhakanta                      in at its northmost door, the length of the hall southward:
//                                         how to get here and the day before (train, air, hotels, haldi)
//   out to the mandap                   the ceremony itself, then round the mandap's west side
//   the nat-mandir                      up its west stair, north through the hall: the wedding day
//   out of its northmost door           along the plinth ledge to the navaratna's stair
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
/** z of the Radhakanta's west doorways, north (0) to south. */
const rDoor = (i) => rz + (i - (R.bays_west - 1) / 2) * R.bay_pitch;
const N = L.natmandir;
const nx = N.west_face_x;                             // nat-mandir west wall
const nz = N.center[2];                               // nat-mandir centre, z
const nP = N.plinth_top;
const nLedge = nx - N.plinth_out / 2;
const nNorth = nz - N.size[1] / 2 - N.plinth_out;     // north edge of its plinth
const nDoor = (i) => nz + (i - (N.bays_west - 1) / 2) * N.bay_pitch;
const pt = L.navaratna.platform_top;
const P = L.navaratna.platform;
const { stair_foot, stair_tread, stair_steps } = L.navaratna;
const wall = L.navaratna.wall_x;                      // south verandah wall at z = +wall
const [, , doorZ] = L.sanctum.door;                   // the shrine door in the core's south face
const doorMid = pt + L.sanctum.arch[1] / 2;

/** Height of the ghat at x (its flight climbs east from the river to the courtyard edge). */
function ghatY(x) {
  const [x0, y0] = L.ghat.foot;
  const [x1, y1] = L.ghat.top;
  const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
  return y0 + (y1 - y0) * t;
}
/** Height of the navaratna stair's tread at z (the flight climbs north from its foot). */
function stairY(z) {
  const k = Math.min(stair_steps, Math.max(1, Math.ceil((stair_foot[2] - z) / stair_tread)));
  return g + (pt - g) * (k / stair_steps);
}
const gz = L.ghat.top[2];

// Camera path: position + look target. Each Catmull-Rom segment spans an equal slice of the
// scroll, so short segments (doorways, the stairs) are walked slowly on purpose; the long
// courtyard legs get few nodes. Doorways get a node either side on the door's axis so the
// spline passes straight through the opening.
export const PATH = [
  { p: [-88, 7.5, gz + 6], l: [-8, 10, gz - 4] },                          // 0 over the river: the whole west front
  { p: [-60, 3.0, gz], l: [-30, 6, gz - 2] },                              // 1 toward the ghat
  { p: [-46.5, ghatY(-46.5) + EYE, gz], l: [-30, 5, gz - 4] },             // 2 foot of the ghat
  { p: [-40.5, ghatY(-40.5) + EYE, gz], l: [-27, 5.5, gz - 9] },           // 3 near the top: the invitation
  { p: [-37, g + EYE, gz], l: [-24, 5, gz - 11] },                         // 4 top of the ghat, the view swinging left
  { p: [-28, g + EYE, gz - 0.5], l: [-19, 5.5, gz - 25] },                 // 5 through the gap: the north Shiva group's flank, the Radhakanta's front
  { p: [-22, g + EYE, gz - 13], l: [-10, 6, rDoor(0) + 2] },               // 6 up the strip
  { p: [-15, g + EYE, -27], l: [rx, 5, rDoor(0)] },                        // 7 its 8-bay front sliding by on the right
  { p: [-11.2, g + EYE, rDoor(0) + 2.5], l: [rx + 1.5, 4.6, rDoor(0) - 0.5] }, // 8 at the plinth foot before the northmost door
  { p: [rLedge, rP + EYE, rDoor(0)], l: [rx + 6, rP + 2.2, rDoor(0)] },    // 9 up on the ledge, on the door's axis, looking in
  { p: [rx + 1.3, rP + EYE, rDoor(0)], l: [rx + 8, rP + 2.2, rDoor(0) + 4] }, // 10 just inside
  { p: [rx + 3.3, rP + EYE, rDoor(0) + 3], l: [rx + 7.5, rP + 2.2, rDoor(7) - 1] }, // 11 turned south: the length of the hall (train)
  { p: [rx + 4.1, rP + EYE, rDoor(0) + 8], l: [rx + 8, rP + 2.2, rDoor(7) + 3] },   // 12 (air)
  { p: [rx + 4.1, rP + EYE, rDoor(0) + 13], l: [rx + 7.5, rP + 2.2, rDoor(7) + 6] }, // 13 (hotels)
  { p: [rx + 2.9, rP + EYE, rDoor(7) - 3.5], l: [rx - 0.5, rP + 2.0, rDoor(7) + 1] }, // 14 turning to the southmost door (haldi)
  { p: [rx + 1.3, rP + EYE, rDoor(7)], l: [rx - 7, rP + 1.6, rDoor(7) + 9] },        // 15 inside that door, on its axis
  { p: [rLedge, rP + EYE, rDoor(7)], l: [mx, L.mandap.canopy - 0.4, mz] }, // 16 in the doorway: the mandap ahead, south-west
  { p: [-12, g + EYE, -14.5], l: [mx, L.mandap.canopy - 0.6, mz] },        // 17 down on the courtyard
  { p: [-13.5, g + EYE, -11.5], l: [mx, L.mandap.canopy - 1.2, mz] },      // 18 the mandap, from the north-east (the ceremony)
  { p: [-22.5, g + EYE, -9.5], l: [mx + 1, L.mandap.canopy - 1.5, mz + 1] }, // 19 round its north-west corner, outside the ring of diyas
  { p: [-23.5, g + EYE, gz + 4.5], l: [mx + 2, 4.3, mz + 3] },             // 20 past its west side
  { p: [-16, g + EYE, 12], l: [nx + 2, 6.5, nz - 4] },                     // 21 south-east toward the nat-mandir front
  { p: [nx - 4.6, g + EYE, nz], l: [nx + 3, 5.5, nz] },                    // 22 the foot of its west stair, looking into the hall
  { p: [nx + 0.5, nP + EYE, nz], l: [nx + 8, nP + 2.8, nz - 3] },          // 23 top of the stair, in the doorway
  { p: [nx + 4, nP + EYE, nDoor(3) + 2.5], l: [nx + 13, nP + 2.6, nDoor(0) - 1] }, // 24 inside, turning north (breakfast)
  { p: [nx + 6, nP + EYE, nDoor(2)], l: [nx + 10, nP + 2.6, nDoor(0) - 6] },       // 25 (baraat)
  { p: [nx + 6, nP + EYE, nDoor(1) + 1], l: [nx + 8, nP + 2.6, nDoor(0) - 8] },    // 26 (the ceremony)
  { p: [nx + 4, nP + EYE, nDoor(0) + 2.5], l: [nx - 1, nP + 2.2, nDoor(0) - 1] },  // 27 turning to the northmost door (cocktails)
  { p: [nx + 1.3, nP + EYE, nDoor(0)], l: [nx - 8, nP + 2.2, nDoor(0) - 3] },      // 28 inside that door, on its axis (reception)
  { p: [nx - N.plinth_out - 0.4, nP + EYE - 0.3, nDoor(0) - 0.4], l: [-6, 7, 8] }, // 29 stepping off the ledge: the navaratna ahead, to the right
  { p: [-9.6, g + EYE, nNorth + 1.05], l: [0, 8.5, 4] },                   // 30 down off the plinth, the temple stair ahead
  { p: [-4, stairY(12.7) + EYE, 12.7], l: [0, pt + 3, 3.5] },              // 31 across onto the stair
  { p: [-1.2, pt + EYE - 0.3, 11.2], l: [0, pt + 2.8, doorZ] },            // 32 near its top
  { p: [0, pt + EYE, 9.6], l: [0, doorMid + 0.9, doorZ] },                 // 33 the central arch framing the shrine door
  { p: [0, pt + EYE, wall + 0.6], l: [0, doorMid + 0.25, doorZ - 0.4] },   // 34 in the central arch, looking into the sanctum
];
const last = PATH.length - 1;
/** Walk progress of PATH node i. */
export const at = (i) => i / last;

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
  reception: { anchor: [-P / 2 - 0.3, pt + 1.6, P / 2 - 0.5], range: span(28, 30.2), side: 'left' },      // the navaratna platform's SW rail
  rsvp: { anchor: [L.navaratna.bay_pitch * 0.9, doorMid + 1.2, doorZ], range: [at(32.6), at(33.3), 2, 2], side: 'right' }, // beside the shrine door
};
