# Wedding website — notes for working in this repo

A Vite + three.js site: a scroll-driven walk through a model of the Dakshineswar temple
complex, with the wedding details pinned to places along the walk. `README.md` explains the
site, `recon/README.md` the model and `recon/PLAN.md` its log (`recon/` is named for the
photo-reconstruction plan it began as; that was dropped). Read those first; this file is the
working checklist.

## Commands

```bash
npm run dev                         # http://localhost:5173 (add --host for the LAN)
npm run build && npm run preview    # production build on :4173
npm run model                       # bake + export recon/blender/scene.blend (official Blender, ~17 min, see below)
bash recon/blender/render.sh couple # the bride and groom: free_assets/*.blend → public/models/couple.glb (~2 min)
npm run shoot -- http://localhost:5173/ shots 0 0,0.34,1     # headless screenshots (day; 1 = night)
npm run profile -- http://localhost:5173/                    # draw calls / triangles / programs at every PATH node
```

The scene is a Blender 5.2 file (15 Sep 2026: rebuilt from the script under 5.2.2, the snap —
`render.sh` finds `blender` on the PATH, or `BLENDER=…`). The scripts carry a few
`bpy.app.version` guards (`BL41` in `build_dakshineswar.py`: auto-smooth as the `sharp_edge`
attribute, `Material.displacement_method`, adaptive subdivision on the Subsurf modifier, the glTF
alpha clip as a node) so the 4.0 branch still runs, but a file saved by 5.2 is not for 4.0. The
Ubuntu `blender` package silently bakes black (every pass but NORMAL); the snap bakes fine. Partial
runs while iterating: `bash recon/blender/render.sh web --blend recon/blender/scene.blend
--landmarks-only` (positions only, no bake) and `--only '<regex>'` with `--out` for a test glb
the site loads via `?model=…` (README, "Update the model"). `render.sh web` *without* `--blend`
(and `render.sh blend`) rebuilds from the script — a reset that discards the scene's edits; only
for regenerating the textures on a new machine or starting the scene over.

## How the pieces fit

- The scene is `recon/blender/scene.blend` (committed; Sep 2026). It is edited in Blender —
  by the owner, or by Claude through the Blender MCP tool (section below) — never by
  changing `build_dakshineswar.py`, which generated it and is now the reset. `npm run model`
  (`export_web.py --blend`: albedo + normal + occlusion per mesh, tiling maps for brick/paving,
  leaf cards shipped with alpha) bakes the file into `public/models/dakshineswar.glb`. Static
  things belong in the scene; the export gives a new object UVs (`adopt_hand_edits`) and reads
  `lamp_*`/`bell_*` positions back from it (`props_from_scene`), so their light and swing follow
  a move. **The limit**: `landmarks.json` is still computed from the script's constants
  (`export_web.landmarks()` reads `build_dakshineswar.py`'s module constants, not the file), so
  anything the walk stands on — stairs, plinths, doors, arches, columns, the sanctum, the halls'
  sizes and positions — moved in the scene must have its constant changed to match, or the walk
  desyncs. The follow-up that closes this is `landmarks()` reading those from the scene's objects.
  `render.sh diff FILE` (`diff_blend.py`) still reports what a file differs from the script by;
  `recon/blender/assets/` + `ASSETS` (`--keep-added`) were the script-era way to keep hand-made
  props and are moot with the file as the scene.
- `src/scene/landmarks.json` is written by the export (buildings, stairs, arches, lamps, bells)
  in the site's frame: metres, x east, y up, z south = Blender (x, z, −y). Never hand-edit it.
- `src/scene/walk.js` builds the camera path and card anchors from the landmarks, and the
  *walking surface* (`surfaceY`: courtyard, ghat, plinths, every flight as a ramp; `floorY`: the
  same with treads). The camera's height comes from it (`eyeAt`), so PATH nodes only say where
  on the ground the guest stands (`on(x, z)`) and the camera climbs a flight where there is one.
  Put a node on a plinth without a flight under the segment and the camera walks up its face.
  Nodes anything refers to are named (`n: 'rIn'`) and indexed by `NODE`, so the schedule, the
  carpets, the bells and the cards say `at(NODE.rIn + 0.5)`, never a number — inserting a node
  shifts nothing. `TABLES` (walk.js) places the wedding tables along each hall's back wall, one
  per card; the walk inside a hall goes past them with an approach and an abreast node per
  table (the short segment between them is the pause), and the card pins over its table — a U
  in the Radhakanta (in and out by its west end doors), an L in the nat-mandir (in by its west
  stair, out through its open north front).
  `src/scene/tables.js` builds the tables: a prop kit of low-poly lathes/boxes/cones merged into
  one mesh per table with per-vertex colour, reveal order (props set out one by one, each from its
  own spot: `attachReveal`'s `pivot`) and `shine` (brass on the same material); its marigold work
  goes to decor's bloom instancing (`tableBlooms`), the lamp table's diyas and the aarti flames to
  life.js (`tableDiyaSpots`, lit by the celebration transition — flame `aOrder` ≥ 1), the dhunuchi
  smoke to fx.js (`tableSmokeSources`). `src/scene/life.js` builds everything that moves or glows (diyas, string lights, doorway
  light, lamp posts, fireflies, birds, flag, bells, drape and tree wind, river ripples, alpona
  decals), `src/scene/decor.js` the wedding decoration (garlands, torans, the gate, the
  mandap's wraps and strands, carpets) and `src/scene/fx.js` the atmosphere (petals, the agni,
  incense), all from the same landmarks. Anything animated, emissive or repeated many times
  goes in one of these, not in the glb. The carpets are not drawn from their own point lists:
  each is a stretch of the camera's curve (`posCurve` between PATH nodes) laid on `floorY`, so
  they are under the walk by construction, through the doors and up the flights: `stairSnap`
  pulls the line onto a flight's axis however the spline comes at it (a smoothstep over the last
  2.5 m, so it arrives level with the axis), the line is resampled every 10 cm and its bends
  eased out to a 1.2 m radius (`RADIUS` in decor's `runner`: a corner becomes an elbow, never a
  fold — points on a flight are pinned, so the elbow finishes at the foot), and every riser gets
  two points (`treadOf`/`riserAt`), a pile's thickness out from the step's edge, so the ribbon
  folds down each step rather than cutting the nosing. `landmarks.*.stair_gap` is the 5 cm the
  hall flights stand off the plinth's lip — the walk's flights include it, so the risers match
  the mesh. A carpet's roll is `keys` on its stage transition ([value, PATH node] pairs: where
  the front has reached), so the first one is out to the corner as the guest tops the ghat and
  up the strip ahead of them. They stop either side of the alpona before the mandap. When the
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
  out there; the nat-mandir's flight is central and the walk uses it. The nat-mandir's north
  front is open — round columns under an entablature (`hall_block(open=("N",))`,
  `NAT_COLONNADE`, `landmarks.natmandir.north_columns`: the columns' x, an odd count so an
  opening sits on the temple stair's axis), like the real hall, which opens toward the temple.
  The navaratna has a flight on every face (`NAV_STAIR`, `landmarks.navaratna.flights`; the
  aerial photo) but the walk climbs the south one (`stair_*`), whose foot is inside the
  nat-mandir's plinth (its lowest treads are buried, it meets the plinth's north ledge at ledge
  height), so the walk leaves the nat-mandir between the columns astride x = 0 (`nGapX`) and
  steps from the north ledge straight onto the stair — no drop to the courtyard. The numbers the walk reads (stairs, plinths, arches) are module constants at the top
  of `build_dakshineswar.py` that `export_web.landmarks()` reads — never retype them there.
- The SketchUp reference (`recon/data/reference/skp/`, from the owner's `skp_911.zip`; git-ignored)
  is photo-textured and accurate on layout and relief but flat: use it to *see* detail, never copy
  its geometry or paste its maps. `recon/blender/ref_views.py --site --view …`, the same `--view`
  on `build_dakshineswar.py` / `preview_web.py`, and `pair.py` give side-by-sides from one camera
  string (recon/README, "The SketchUp reference"). Relief goes in as geometry or as bump/normal in
  the materials (baked to normal maps by the export), never as a painted flat texture.
- The bride and groom (`src/scene/couple.js`) are the other runtime model: `public/models/couple.glb`,
  made by `recon/blender/couple.py` from the two rigged Rigify characters in `free_assets/`
  (untracked; the 8k atlases live in `free_assets/textures/`) — posed, given an in-place walk cycle,
  decimated to ~62k triangles, maps shrunk to 2k/1k, exported skinned, then `gltf-transform` merge →
  prune → webp → meshopt (`render.sh couple`). couple.js walks them round the agni on the mandap's
  stage during the ceremony transition (the groom ahead, clockwise, r 1.25, the clip's speed matched
  to the orbit: `CYCLE_M` = the two strides couple.py keys), scales them in from their feet, parks
  them under the courtyard before that (frustum-culled), compiles their two programs when the glb
  arrives and again as the ceremony starts, and never lets them cast a shadow. They are not in
  `scene.blend` and never go through the bake.
- The flowers: the 14 plants of `free_assets/flowers/Flowers.3ds` are scene objects (`flower_*`,
  imported once with `recon/blender/import_3ds.py` — Blender 5.2 ships no 3DS importer — their jpg
  textures packed and a `flower` UV layer their `flower_<name>` materials sample explicitly), in
  terracotta pots (the `pot` mesh) at the toran, along the Radhakanta's west foot between its
  flights and at the ends of the nat-mandir's row, and in four brick-edged beds (`flower_bed_edge`
  / `flower_bed_soil`) at the mandap's corners, between the diya ring (r 5) and the walk. Their
  petals are open sheets, so the audit lists their open edges (expected, like the leaf cards) and
  `export_web.two_sided()` makes `flower_*` double-sided. Linked duplicates share a mesh, so the
  bake is once per species.
- The sanctum: `build_dakshineswar.SANCTUM` hollows a shrine chamber out of the navaratna's
  ground-storey core behind the central south arch (closed boxes + a pierced wall, no boolean);
  `landmarks.sanctum` locates it. The deity is a runtime picture plane in `life.js` reading
  `public/images/bhavatarini.png|jpg|webp` (owner-supplied) — never a modelled figure.

## Editing the scene through the Blender MCP tool

The `blender` MCP server (`.mcp.json`: `uvx blender-mcp==1.9.4`) talks to the add-on in a
running Blender that has `recon/blender/scene.blend` open (README, "Edit the scene with Claude
Code"). If the server shows as failed, `uvx` is usually not on the PATH Claude Code was launched
with (`~/.local/bin`); if the tools answer "Not connected", Blender or its add-on server is not
running — say so, don't fall back to editing the script.

- Start with `get_scene_info` and `get_addon_status` (Blender version, protocol). The owner's
  GUI Blender is the same 5.2 that exports (a save from a newer major is a one-way step).
- Edit with `execute_blender_code` (`bpy` on the live file), look with
  `get_viewport_screenshot` after every change (the owner judges from pictures), confirm with
  `get_scene_info`. Keep the script's conventions so the export and the audit still read the
  scene: objects in the `Dakshineswar` collection, names as the script gives them (`lamp_N`,
  `bell_N`, `nat_*`, `vishnu_*`, `mandir_*`, `shiva_*` — a duplicate's `.001` suffix is fine),
  closed non-overlapping solids, no booleans, parts touching not biting, one material per
  surface kind (the bake plan groups by material).
- Never call `bpy.ops.wm.read_factory_settings`, `read_homefile` or `open_mainfile` from the
  tool: they reload preferences and unload the add-on, dropping the connection mid-call (this
  is why the script's `reset_scene()` can't run in a live Blender). Anything that takes more
  than a few seconds (an audit, a bake, a big rebuild) runs on a `bpy.app.timers` tick writing
  to a log file, and the log is tailed from a shell: the call blocks Blender's main thread, the
  add-on drains commands on that same thread, and the client times out.
- `mesh_audit` works on the live file: `sys.path.insert(0, 'recon/blender'); import
  build_dakshineswar as B; B.mesh_audit()` (it walks `bpy.data.meshes`, not the script's
  collection). Run it on a timer, after any geometry edit.
- The file carries the hash of the script that built it (`scene["script_sha1"]`) and the
  export warns when the script has changed since. After changing a constant in
  `build_dakshineswar.py` to match a scene edit, re-stamp from the tool (`import
  build_dakshineswar as B; B.stamp_scene()`) and save, so the warning stays meaningful.
- `--view` on `build_dakshineswar.py` renders the *script's* model, not `scene.blend`; a
  side-by-side of the current scene is `preview_web.py --glb` on the export.
- Save when the owner says so, or when a step is done: `bpy.ops.wm.save_mainfile()` writes
  `scene.blend` in place (`relative_remap` keeps the `//../data/blender/textures/…` paths).
  Then `npm run model` from a shell — never a bake through the tool — and `npm run shoot`.
- Do not use the tool's asset downloaders (Poly Haven, Sketchfab, Hyper3D) for this scene: the
  model is closed hand-built solids at silhouette level, and a downloaded mesh breaks the bake
  budget and the audit. Assets the owner puts in `free_assets/` are the exception, each weighed
  against the budget (the flowers: the light species instanced, ~68k triangles in all); a rigged
  character never goes in the scene — it is a runtime glb (the couple).

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
- The build's `mesh_audit` prints open edges, the heaviest meshes, z-fights (same-facing coplanar
  faces of different objects) and embedded solids; only the buried temple stair and bevel-deep
  contacts are expected. `AUDIT_VERBOSE=1` lists every pair. Parts touch (end-to-face, coplanar
  with opposite normals), never bite into each other; rings around a solid get `bite=0`.

## Judging changes

The owner judges this from pictures, so look before reporting. `npm run shoot` drives the site
in a software-rendered headless Chromium (needs a Chromium: Playwright's cache is found
automatically, else `CHROME=/path/to/chrome`). It is slow: the camera eases toward the scroll
target, so give it `WAIT=8000`+ when anything else (a bake) is using the CPU, and check both
day and night and a phone portrait (`VW=390 VH=844`). Card ranges and anchors are in
`walk.js`; a card that "disappears" is usually the anchor behind the camera, or the camera
simply not converged yet in the slow loop. `SNAP=1` makes `shoot` jump the walk to each position
instead (`debug.snap(t)`: the stage and every reveal land at once), and `LOOK=x,y,z/tx,ty,tz`
pins the camera anywhere (`debug.look(p, l)`) — the way to check a carpet on a flight or an
elbow from above at a given stage. `#debug` in the URL exposes `window.templeScene`
(`.debug.scene`, `.debug.life`, `.debug.decor`, `.debug.fx`, `.debug.bloom`, `.stage`) for
poking from the console and mounts a panel (`src/debug.js`) with the stage and its transitions,
draw calls and jump-to-stage buttons. Shoot at PATH-node fractions (`at(i)` = i/44, `NODE.end` is the
last; `window.templeScene.debug.nodes`) rather than
round numbers when checking a transition. The dev server logs a harmless 404 for `/favicon.ico`.

Time-based transitions must use wall-clock dt (the headless frame loop runs at a few fps).

## Decisions already made (don't relitigate)

- No modelled human figures in the scene — with one exception, decided 16 Sep 2026: the bride
  and groom walking round the agni, and only as the owner's rigged characters from `free_assets/`
  loaded at runtime (`couple.glb`, above). Prop-kit or primitive-built people were tried and
  rejected ("roblox like characters"); don't offer them again. Ma Kali in the sanctum is a picture,
  not a mesh.
- The walk's order: ghat → left (north) into the Radhakanta at its northmost door, a U past
  the four tables along its east wall, out of its southmost door → mandap → nat-mandir by its
  west stair, across to its south-east corner and north past the five tables along its east
  wall, out through its open north front (an L, not a U — decided Sep 2026 with the colonnade:
  the real hall is open toward the temple on columns) → temple stair → the sanctum door.
- Carpet turns are rounded elbows; the carpet is out ahead of the guest from the top of the
  ghat; on a flight it hugs the treads (Sep 2026).
- Sep 2026, against the aerial photo and the SketchUp reference: four flights on the navaratna,
  short doorways under a tall panelled wall with a deep Bengal curve, plastered arcaded platform,
  bulbous ribbed ratnas (gold finials kept), the courtyard 64 m wide to fit the flights, the mandap's
  bushes are urn bouquets. Untextured parts of the reference are ignored; where the reference and
  the photo disagree, the photo wins. Every card stop is a table (decided Sep 2026: tables, not booths or
  signboards, each different — welcome, puja, bhog, shringar; malakar, music, lamps, tattva,
  paan & mishti); the pairing with the cards is loose, by walk order.
- 15 Sep 2026: the scene moved from the script to `recon/blender/scene.blend`, edited in Blender
  (by hand or through the MCP tool). The script is the generator it came from and the reset,
  not the way to change the model; don't propose porting scene edits back into it.
- The Gaussian-splat reconstruction was dropped (Sep 2026: no dense capture of the site exists);
  the Blender model is the scene, and its pipeline was removed from `recon/`. Don't reintroduce a
  splat path or plan around one.
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
- `read_factory_settings` in a live Blender reloads factory preferences: the MCP add-on is
  disabled and the connection drops. A long `execute_blender_code` call times out on the client
  while Blender keeps working — run it on a timer and log to a file (section above).
- `bpy.ops.wm.save_as_mainfile` to a new folder needs `relative_remap=True` (the default) or the
  `//` texture paths break; the textures are git-ignored and regenerated by `render.sh blend`.
- Headless Blender does not evaluate `matrix_world` until `view_layer.update()`; `BVHTree.FromObject`
  is in the object's local space; ray-parity inside tests miscount on the seams of touching parts
  (use the winding number, as `mesh_audit` does).
- `ring_prism` on an outline that starts and ends on its base line must leave the base open
  (foot caps): the closed version laid a face across every threshold, z-fighting the floor.
- GLSL `smoothstep(a, b, x)` with `a > b` is undefined by the spec (it happens to work on most
  GPUs); write `1.0 - smoothstep(b, a, x)`. The glb's positions are quantised (int16 + node
  scale), so vertex displacement of model meshes must be done in world space after
  `modelMatrix` (see the tree sway in life.js), not on `transformed`.
