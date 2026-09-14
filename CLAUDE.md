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
npm run shoot -- http://localhost:5173/ shots 0 0,0.47,1     # headless screenshots (day; 1 = night)
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
- `src/scene/walk.js` builds the camera path and card anchors from the landmarks;
  `src/scene/life.js` builds everything that moves or glows (diyas, string lights, doorway
  light, lamp posts, fireflies, birds, flag, drape wind, river ripples, alpona decals) from
  the same landmarks. Anything animated, emissive or repeated many times goes here, not in the glb.
- `src/scene/scene.js`: renderer, sky shader (clouds), IBL from the sky, sun/moon, day↔night,
  floods, bloom (night only — day renders straight to the canvas), camera along the path.
- `src/cards.js` + `src/ornament.js`: the cards (vine + alpona frame generated at runtime)
  pinned to anchors and projected every frame. One generic template (`cardHTML`) renders every
  card from its `content.json` entry; `ANCHORS` in `walk.js` says where and when, keyed by the
  same ids, and `src/sections.js` renders the same entries as the no-WebGL page. All guest-facing
  text is in `content.json` at the repo root (loaded by `src/content.js`, which fills in `labels`
  defaults; `vite.config.js` bakes `site.title`/`site.description` into `index.html`). New
  strings go in the JSON, not in the templates. A card's anchor must stay in front of the
  camera for its whole range (a point behind the camera can't be projected).
- The sanctum: `build_dakshineswar.SANCTUM` hollows a shrine chamber out of the navaratna's
  ground-storey core behind the central south arch (closed boxes + a pierced wall, no boolean);
  `landmarks.sanctum` locates it. The deity is a runtime picture plane in `life.js` reading
  `public/images/bhavatarini.jpg` (owner-supplied, not in the repo) — never a modelled figure.

## Judging changes

The owner judges this from pictures, so look before reporting. `npm run shoot` drives the site
in a software-rendered headless Chromium (needs a Chromium: Playwright's cache is found
automatically, else `CHROME=/path/to/chrome`). It is slow: the camera eases toward the scroll
target, so give it `WAIT=8000`+ when anything else (a bake) is using the CPU, and check both
day and night and a phone portrait (`VW=390 VH=844`). Card ranges and anchors are in
`walk.js`; a card that "disappears" is usually the anchor behind the camera, or the camera
simply not converged yet in the slow loop. `#debug` in the URL exposes `window.templeScene`
(`.debug.scene`, `.debug.life`, `.debug.bloom`) for poking from the console. The dev server
logs a harmless 404 for `/favicon.ico`.

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
