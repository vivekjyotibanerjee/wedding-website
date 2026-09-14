import L from './landmarks.json';

// ─────────────────────────────────────────────────────────────────────────────
// The walk through the complex, in the model's frame (metres; x east, y up, z south — so
// walking north is walking toward −z). Positions come from landmarks.json, which
// recon/blender/export_web.py writes from the same LAYOUT the model is built from.
//
//   the river, west of the complex      wide shot: the twelve Shiva temples with the spires behind
//   up the ghat                         between the two groups of six Shiva temples
//   the cross walk                      east across the courtyard strip to the mandap
//   round the mandap                    then south-east toward the nat-mandir's arcaded front
//   north past the nat-mandir           up onto its plinth and along it to the navaratna's stair
//   up onto the temple platform         and in through the central arch into the south verandah
// ─────────────────────────────────────────────────────────────────────────────

const EYE = 1.65;
const g = L.ground;                                   // courtyard platform, y
const [mx, , mz] = L.mandap.center;                   // mandap centre
const nx = L.natmandir.west_face_x;                   // nat-mandir west wall
const nz = L.natmandir.center[2];                     // nat-mandir centre, z
const nPlinth = g + 1.2;                              // its plinth top
const nLedgeX = nx - 1.5 + 0.7;                       // walking on the plinth ledge, 0.7 m off its edge
const nNorth = nz - L.natmandir.size[1] / 2 - 1.5;    // north edge of that plinth
const pt = L.navaratna.platform_top;
const [, , sfz] = L.navaratna.stair_foot;
const [, , stz] = L.navaratna.stair_top;
const wall = L.navaratna.wall_x;                      // south verandah wall at z = +wall
const core = L.navaratna.core_x;

/** Height of the ghat at x (its flight climbs east from the river to the courtyard edge). */
function ghatY(x) {
  const [x0, y0] = L.ghat.foot;
  const [x1, y1] = L.ghat.top;
  const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
  return y0 + (y1 - y0) * t;
}
const gz = L.ghat.top[2];

// Camera path: position + look target. Each Catmull-Rom segment spans an equal slice of the
// scroll, so short segments (the stairs, the arch) are walked slowly on purpose.
export const PATH = [
  { p: [-88, 7.5, gz + 6], l: [-8, 10, gz - 4] },                        // 0 over the river: the whole west front
  { p: [-60, 3.0, gz], l: [-30, 6, gz - 2] },                            // 1 toward the ghat
  { p: [-46.5, ghatY(-46.5) + EYE, gz], l: [-30, 5, gz - 4] },           // 2 foot of the ghat
  { p: [-40.5, ghatY(-40.5) + EYE, gz], l: [-27, 5.5, gz - 9] },         // 3 near the top
  { p: [-35.5, g + EYE, gz - 0.5], l: [-29, 6, gz - 30] },               // 4 the gap: north along the Shiva row
  { p: [-30, g + EYE, gz], l: [-17, 4.5, gz] },                          // 5 the cross walk, mandap ahead
  { p: [-25, g + EYE, gz + 1], l: [mx, L.mandap.canopy - 0.6, mz] },     // 6 the mandap
  { p: [-20.5, g + EYE, gz + 5.3], l: [mx + 1.5, 4.5, mz] },             // 7 round its south side
  { p: [-14.5, g + EYE, gz + 9], l: [nx + 2, 6.5, nz - 4] },             // 8 toward the nat-mandir front
  { p: [nx - 4.6, g + EYE, nz], l: [nx + 3, 5.5, nz] },                  // 9 the foot of its west stair, looking into the hall
  { p: [nx - 5, g + EYE, nNorth + 4.5], l: [-2, 8, 4] },                 // 10 north past the hall, the navaratna ahead
  { p: [nx - 3.2, nPlinth + EYE, nNorth + 0.7], l: [0, 11, 1] },         // 11 up onto the plinth corner
  { p: [-3, nPlinth + EYE, nNorth + 0.4], l: [0, 9, 2] },                // 12 along the plinth to the temple stair
  { p: [-1.5, pt + EYE, stz - 0.7], l: [6, pt + 3.6, wall] },            // 13 top of the stair: the south arcade receding east
  { p: [0, pt + EYE, wall + 1.6], l: [0.6, pt + 2.3, wall - 2] },        // 14 the central arch, looking in
  { p: [0.2, pt + EYE, wall - 1.7], l: [core + 5, pt + 2.1, wall - 1.8] }, // 15 in the verandah corridor, looking east along it
];

// Where the cards pin (world points) and when they show: [fadeInStart, fadeInEnd, fadeOutStart,
// fadeOutEnd] in walk progress, where node i of PATH is at i / 15.
export const ANCHORS = {
  gate: { anchor: [L.ghat.top[0], g + 2.2, gz - 5.5], range: [0.12, 0.16, 0.21, 0.235] },                 // the ghat
  story: { anchor: [L.shiva.x + 0.8, L.shiva.plinth_top + 3.3, L.shiva.first_north[2] + L.shiva.size / 2], range: [0.24, 0.27, 0.315, 0.335] }, // the first Shiva temple's south window
  ceremony: { anchor: [mx, L.mandap.canopy + 0.3, mz], range: [0.41, 0.44, 0.50, 0.53] },                 // the mandap
  events: { anchor: [nx - 1.5, g + 1.2 + L.natmandir.height + 1.0, nz], range: [0.54, 0.57, 0.64, 0.67] }, // the nat-mandir pediment
  travel: { anchor: [5.6, pt + 1.1, stz], range: [0.72, 0.76, 0.85, 0.88] },                              // the temple stair
  rsvp: { anchor: [L.navaratna.bay_pitch, pt + 4.6, wall - 0.3], range: [0.90, 0.95, 2, 2] },             // the next arch along the corridor
};
