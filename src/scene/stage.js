import { at, NODE } from './walk.js';

// ─────────────────────────────────────────────────────────────────────────────
// The wedding's timeline along the walk. The temple starts bare and is dressed as the guest goes
// through it: everything that appears, lights or falls reads one of these transitions (0 → 1,
// smoothstepped) rather than the raw scroll, so the schedule is tuned in one place. The bounds are
// PATH nodes (walk.js), not fractions, so re-routing the walk keeps the choreography attached to
// the places it belongs to.
//
//   arrival        the river and the ghat: bare temple, afternoon light, the toran gate at the top
//   preparation    up the strip: the carpet rolls out, torans hang, the diya bowls are set out
//   flowers        the Shiva fronts, the Radhakanta's face and inside it: garlands draw in
//   illumination   out to the mandap: diyas ignite in a wave from the mandap, the strings come on
//   mandap         the canopy strands descend, the columns are wrapped, incense
//   ceremony       the agni is lit, petals fall
//   celebration    the nat-mandir: petals inside, more lights, golden hour deepens
//   finale         the temple stair and the sanctum: petals taper, everything glows
// ─────────────────────────────────────────────────────────────────────────────

const span = (a, b) => [at(a), at(b)];
const N = NODE;

/** [start, end] in walk progress for every transition. */
export const SCHEDULE = {
  gate: span(0.4, 1.8),                                  // the toran gate at the ghat top, seen from the river
  prep: span(3.4, 7.2),                                  // carpet along the strip, torans over the doors, diya bowls
  flowers: span(4.6, N.rPujab),                          // garlands: Shiva fronts first, then the Radhakanta, then inside; the tables laid
  lights: span(N.rPujab, N.mandapNW),                    // diyas and string lights: the Radhakanta's own first, then a wave out from the mandap
  mandap: span(N.rLedgeS + 0.2, N.mandapNE + 0.2),       // hanging strands, column wraps, incense at the mandap
  ceremony: span(N.rFlightS + 0.4, N.mandapNE + 0.6),    // the agni; petals
  dusk: span(N.rLedgeS, N.northLedge),                   // golden hour: the sun lowers and warms
  full: span(N.natFront, N.nPaanb),                      // the nat-mandir dressed, its tables laid; petals inside
  finale: span(N.plinthNW, N.arch + 0.5),                // the stair: petals thin out, the glow comes up
};

/** Named stages for the debug panel and for jumping about; each starts at a PATH node. */
export const STAGES = [
  ['arrival', 0], ['preparation', 3.4], ['flowers', 6], ['illumination', N.rPujab],
  ['mandap', N.rFlightS], ['ceremony', N.rFlightS + 0.8], ['celebration', N.natFront], ['finale', N.plinthNW],
].map(([name, node]) => ({ name, start: at(node) }));

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-6, b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Keeps the walk's high-water mark with a little hysteresis (plan: once the fire is lit a small
 * back-scroll must not put it out): the decorations follow forward scroll at once and only retreat
 * once the guest has come back more than `band` of the walk.
 */
export function createStage({ band = 0.05 } = {}) {
  let mark = 0;
  const out = { progress: 0, effective: 0, name: 'arrival' };
  for (const k of Object.keys(SCHEDULE)) out[k] = 0;
  return {
    /** Feed the eased walk progress; returns the stage object (reused, don't hold on to it). */
    update(progress) {
      mark = Math.min(Math.max(mark, progress), progress + band);
      out.progress = progress;
      out.effective = mark;
      for (const [k, [a, b]] of Object.entries(SCHEDULE)) out[k] = smooth(a, b, mark);
      out.name = 'arrival';
      for (const s of STAGES) if (mark >= s.start) out.name = s.name;
      return out;
    },
    get value() { return out; },
  };
}
