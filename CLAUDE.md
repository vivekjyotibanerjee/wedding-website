# Wedding website — notes for working in this repo

A Vite + three.js site: a scroll-driven walk through a model of the Dakshineswar temple
complex, with the wedding details pinned to places along the walk. `README.md` explains the
site, `recon/README.md` and `recon/PLAN.md` the model and the (separate, cluster-side) Gaussian
splat effort. Read those first; this file is the working checklist.

## Commands

```bash
npm run dev                         # http://localhost:5173 (add --host for the LAN)
npm run build && npm run preview    # production build on :4173
npm run model                       # rebuild + bake + export the model (official Blender, ~17 min, see below)
npm run shoot -- http://localhost:5173/ shots 0 0,0.34,1     # headless screenshots (day; 1 = night)
npm run profile -- http://localhost:5173/                    # draw calls / triangles / programs at every PATH node
```

The model export needs `BLENDER=~/opt/blender-4.0.2-linux-x64/blender` in the environment: the
Ubuntu `blender` package silently bakes black (every pass but NORMAL) and lacks Draco. Partial
runs while iterating: `bash recon/blender/render.sh web --landmarks-only` (positions only, no
bake) and `--only '<regex>'` with `--out` for a test glb the site loads via `?model=…`
(README, "Update the model").

## How the pieces fit

- `public/models/dakshineswar.glb` is a bake of `recon/blender/build_dakshineswar.py`
  (`export_web.py`: albedo + normal + occlusion per mesh, tiling maps for brick/paving, leaf
  cards shipped with alpha). Static things belong in Blender.
- `src/scene/landmarks.json` is written by the export (buildings, stairs, arches, lamps, bells)
  in the site's frame: metres, x east, y up, z south = Blender (x, z, −y). Never hand-edit it.
- `src/scene/walk.js` builds the camera path and card anchors from the landmarks, and the
  *walking surface* (`surfaceY`: courtyard, ghat, plinths, every flight as a ramp; `floorY`: the
  same with treads). The camera's height comes from it (`eyeAt`), so PATH nodes only say where
  on the ground the guest stands (`on(x, z)`) and the camera climbs a flight where there is one.
  Put a node on a plinth without a flight under the segment and the camera walks up its face.
  `src/scene/life.js` builds everything that moves or glows (diyas, string lights, doorway
  light, lamp posts, fireflies, birds, flag, bells, drape and tree wind, river ripples, alpona
  decals), `src/scene/decor.js` the wedding decoration (garlands, torans, the gate, the
  mandap's wraps and strands, carpets) and `src/scene/fx.js` the atmosphere (petals, the agni,
  incense), all from the same landmarks. Anything animated, emissive or repeated many times
  goes in one of these, not in the glb. The carpets are not drawn from their own point lists:
  each is a stretch of the camera's curve (`posCurve` between PATH nodes) laid on `floorY`, so
  they are under the walk by construction, tread by tread up the flights and through the doors
  (`stairSnap` pulls them onto a flight's axis however the spline comes at it; `onLedge` narrows
  them on the plinth ledges), and stop either side of the alpona before the mandap. When the
  walk changes, check the spline with the surface: it bulges at sharp turns, and a bulge past a
  plinth edge drops the eye to the courtyard (surfaceY allows the eye half a metre of overhang,
  the carpets none).
- `src/scene/stage.js` is the wedding's timeline: `SCHEDULE` maps each transition (gate, prep,
  flowers, lights, mandap, ceremony, dusk, full, finale) to a span of PATH nodes, and
  `createStage()` turns the eased walk progress into 0→1 values with a little hysteresis. The
  layers read those, never the raw scroll. Reveals are done in the vertex shader
  (`util.attachReveal`: per-instance `aOrder`/`aGroup` attributes, scale-in + a 15 cm drop), so
  a decoration costs no JS per frame; ordering within a transition is spatial (walk order for
  what is set out, distance from the mandap for what lights).
- `src/scene/scene.js`: renderer, sky shader (clouds, golden hour), IBL from the sky, sun/moon,
  day↔night, floods, bloom (night only — day renders straight to the canvas), camera along the
  path, a device-tier `quality` for the effects budget. Day/night is still the guest's toggle;
  the walk only drifts the day toward golden hour (`stage.dusk`, the sun sinking from 38° to
  11°). The toggle lights everything at once (`lit = max(stage.lights, night)`).
- `src/cards.js` + `src/ornament.js`: the cards (vine + alpona frame generated at runtime)
  pinned to anchors and projected every frame. One generic template (`cardHTML`) renders every
  card from its `content.json` entry; `ANCHORS` in `walk.js` says where and when, keyed by the
  same ids, and `src/sections.js` renders the same entries as the no-WebGL page. All guest-facing
  text is in `content.json` at the repo root (loaded by `src/content.js`, which fills in `labels`
  defaults; `vite.config.js` bakes `site.title`/`site.description` into `index.html`). New
  strings go in the JSON, not in the templates. A card's anchor must stay in front of the
  camera for its whole range (a point behind the camera can't be projected).
- The Radhakanta has single-bay flights up to its northmost and southmost west doors
  (`hall_block(door_stairs=…)`, `landmarks.radhakanta.door_stairs`) because the walk goes in and
  out there; the nat-mandir's flight is central and the walk uses it. The temple stair's foot is
  inside the nat-mandir's plinth (its lowest treads are buried, it meets the plinth's north ledge
  at ledge height), so the walk leaves the nat-mandir's north door along the west and north
  ledges and steps onto the stair from there — no drop to the courtyard.
- The sanctum: `build_dakshineswar.SANCTUM` hollows a shrine chamber out of the navaratna's
  ground-storey core behind the central south arch (closed boxes + a pierced wall, no boolean);
  `landmarks.sanctum` locates it. The deity is a runtime picture plane in `life.js` reading
  `public/images/bhavatarini.png|jpg|webp` (owner-supplied) — never a modelled figure.

## Frame budget (what keeps a phone smooth)

- Never flip a light's `visible` mid-walk: three.js recompiles every lit shader when the light
  count changes (a second-long stall — this was the hitch at the first petals, when the agni's
  light came on). Lights that come and go with the walk are always in the scene and driven by
  intensity; the night-only floods and lamps flip with the toggle, the one moment that is fine.
- No `PMREMGenerator` at runtime: the sky's environment maps are made once behind the veil
  (`ENV_KEYS` in scene.js: afternoon, steps of golden hour, night) and switched between.
- The shadow map renders on demand (`renderer.shadowMap.autoUpdate = false`): once the model is
  in, when the toggle moves the sun, and every ~½° as the sun sinks. Anything new that must cast
  a moving shadow has to ask (`debug.relightShadows()`); a caster that appears with the walk
  should not cast (its shadow would be there before it is).
- Repeated things are instanced in spatial chunks (`util.chunkBy` / `boundChunk` /
  `cullChunks`: ~20 m cells with a bounding sphere, so the renderer culls what is behind the
  guest, and a chunk nothing of which has appeared yet is skipped). One InstancedMesh for the
  whole complex means every vertex every frame wherever the camera looks — `IcosahedronGeometry`
  is non-indexed, detail 1 is 240 vertices per bloom, so the medium/low tiers use detail 0.
- The model's 460 objects have `matrixAutoUpdate = false` (model.js); anything that moves inside
  it (the bells' pivots) keeps its own auto-update, which pushes down to its children.
- The `#debug` panel shows fps, draw calls, triangles and programs; the programs count must not
  change while walking.

## Judging changes

The owner judges this from pictures, so look before reporting. `npm run shoot` drives the site
in a software-rendered headless Chromium (needs a Chromium: Playwright's cache is found
automatically, else `CHROME=/path/to/chrome`). It is slow: the camera eases toward the scroll
target, so give it `WAIT=8000`+ when anything else (a bake) is using the CPU, and check both
day and night and a phone portrait (`VW=390 VH=844`). Card ranges and anchors are in
`walk.js`; a card that "disappears" is usually the anchor behind the camera, or the camera
simply not converged yet in the slow loop. `#debug` in the URL exposes `window.templeScene`
(`.debug.scene`, `.debug.life`, `.debug.decor`, `.debug.fx`, `.debug.bloom`, `.stage`) for
poking from the console and mounts a panel (`src/debug.js`) with the stage and its transitions,
draw calls and jump-to-stage buttons. Shoot at PATH-node fractions (`at(i)` = i/34) rather than
round numbers when checking a transition. The dev server logs a harmless 404 for `/favicon.ico`.

Time-based transitions must use wall-clock dt (the headless frame loop runs at a few fps).

## Decisions already made (don't relitigate)

- No human figures in the scene ("trying to add human meshes is going to look ugly"); Ma Kali
  in the sanctum is a picture, not a mesh.
- The walk's order: ghat → left (north) into the Radhakanta at its northmost door → mandap →
  nat-mandir by its west stair, out of its northmost door → temple stair → the sanctum door.
- No mixing polygon fallbacks into the future splat scene; when splats arrive they replace the
  glb in `scene.js` wholesale, and the walk/life layers keep reading `landmarks.json`.
- Geometry only for silhouette-level detail; fine relief lives in maps/shaders. Closed,
  non-overlapping solids; no booleans.
- The watercolour look, if ever, comes last.
- `BeautificationPlan.md` (untracked) was written blind to this repo: its React/R3F/GSAP stack,
  Blender asset library, `ANCHOR_*`/`CAM_*` empties and per-zone GLBs were not adopted —
  `landmarks.json` + the runtime layers already are the anchor system. What it asked for that
  mattered (progressive decoration, the lighting wave, agni, petals, bells, incense) is in
  `stage.js`/`decor.js`/`fx.js`.

## Gotchas learned the hard way

- Cycles AO bakes come back black wherever a UV island is thinner than a texel (arch soffits,
  reveals); `export_web.py` whitens exactly-zero texels after the bake. `use_clear=False` and
  `generated_color` do **not** keep a prefilled image.
- The glTF exporter's occlusion needs a node group literally named `glTF Material Output`
  with an `Occlusion` input (`export_web.gltf_output_group`).
- The exporter's Draco was dropped on purpose; `gltf-transform meshopt` does the compression.
- A background bake started from a Claude session dies with that session — check
  `recon/data/web/export.log` for the `EXIT` line before trusting the glb's timestamp.
- The committed glb is ~12 MB and regrows on every export; Git LFS has been suggested, not set up.
- `IcosahedronGeometry` (any `PolyhedronGeometry`) is non-indexed: detail 1 is 80 faces = 240
  vertices per instance, not 42.
- `pkill -f` on a pattern that appears in your own shell's command line kills your shell.
- GLSL `smoothstep(a, b, x)` with `a > b` is undefined by the spec (it happens to work on most
  GPUs); write `1.0 - smoothstep(b, a, x)`. The glb's positions are quantised (int16 + node
  scale), so vertex displacement of model meshes must be done in world space after
  `modelMatrix` (see the tree sway in life.js), not on `transformed`.
