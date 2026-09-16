# The model — plan and log

This directory began as a plan to rebuild Dakshineswar from internet photos as Gaussian splats.
**Dropped 2026-09-15**: there is no dense capture of the site (photography is restricted inside
the complex; Commons and vlog frames were thin on every bucket but the facade), so a photo
reconstruction could never have covered the walk. The Blender model (`blender/`, `README.md`) is
the site's scene, full stop; the fetch/audit/SfM/training scripts, the cluster environment and
the media lock files were removed with the decision (they are in git history before that date).

## Reference material

- CG model flythrough by Tapas Pal (Titli Studio): https://youtu.be/YYBOqdyjoxw and
  https://youtu.be/nlccTsb9hDM. Hand-modelled; a visual reference for the
  unphotographed sides/upper storeys and a sanity check on the layout.
- CG model of the whole complex by Banti Kumar (BKFilms): https://youtu.be/uSJzyjEBWfc (from ~0:32).
  Covers courtyard + Shiva row + interior, but flat-shaded, watermarked on every frame, fast sweeps,
  and the Shiva-temple placement disagrees with the satellite view — layout/relationship reference only.
- `data/reference/satellite.png` — Google satellite screenshot with the measure-tool loop (1080 ft).

## Status / log

- 2026-09-15 — **The scene is a file now.** `blender/scene.blend` (the script's current output,
  saved with relative texture paths) is committed and is what `render.sh web --blend` /
  `npm run model` exports; from here the model is edited in Blender — by hand, or by Claude
  Code through the Blender MCP tool (`.mcp.json`: `uvx blender-mcp==1.9.4`, add-on protocol 7)
  — and no longer by changing `build_dakshineswar.py`, which becomes the reset and the source
  of `landmarks.json`'s constants. Open: `export_web.landmarks()` reading the walk's positions
  (stairs, plinths, arches, doors, columns, sanctum) from the scene's objects instead, so a
  move in the file moves the walk. Learned: the script's `read_factory_settings` reset unloads
  the MCP add-on in a live Blender, and a long `execute_blender_code` call times out on the
  client — long work runs on a `bpy.app.timers` tick logging to a file.
- 2026-09-15 — **3DGS reconstruction dropped** (above). `recon/scripts/`, `recon/envs/`, the
  media/selection configs and the `layout.inner.yaml` hook are gone; `configs/layout.geojson` stays
  as the record of the frame. `export_web.py --blend` / `render.sh blend` added the same day so
  the model can be edited by hand in Blender, and `render.sh diff` (`diff_blend.py`) to report
  what an edited snapshot changed so the edits are ported into the script, which stays the
  source; hand-sculpted props can live in `blender/assets/` (`ASSETS`) — site README, "Edit the
  model by hand".
- 2026-09-15 — **Nat-mandir opened to the temple; carpets laid properly.** The hall's north
  front is a colonnade (`hall_block(open=…)`, `NAT_COLONNADE`), as the real hall is, and the walk
  leaves through it: in by the west stair, across to the south-east corner, north past the five
  tables, out between the columns astride the temple stair's axis and straight up the stair (an
  L; the U back to the northmost door is gone). The carpets round every turn (the centre line
  resampled and curvature-limited), hug the flights (a fold at every riser; the flights' 5 cm
  stand-off exported as `stair_gap`) and the first is rolled out to the corner and up the strip
  ahead of the guest from the top of the ghat (`keys` on the stage transition).
- 2026-09-14 — **Site now renders the Blender model** (`blender/export_web.py` → bake → glTF →
  meshopt → `public/models/dakshineswar.glb`; `src/scene/{walk,model,scene}.js`). The hand-coded
  Three.js complex (`dakshineswar.js`, `geo.js`, `materials.js`, `nature.js`) is retired. Walk
  redesigned for the model's layout (no lion gate, solid navaratna core): river → ghat → Shiva
  row → mandap → nat-mandir front and plinth → temple stair → south verandah arch. (The splat
  plan was still on at this point: the glb was to be swapped out for splats in `scene.js`, the
  card anchors / camera path already living in the layout frame, `landmarks.json`.)
- 2026-09-14 — **Life layer.** Against "the temple looks barren": the export now bakes
  ambient occlusion (`occlusionTexture`, also over the tiling ground/plinths) and weathering
  (streaks under ledges, damp band at courtyard level); the model gains card-based trees and
  palms (RGBA atlases from `textures.ensure_foliage`), a grove north/south of the walls, kola
  gach pairs at the ghat top and both hall stairs, potted shrubs, cast-iron lamp posts and two
  hung bells (positions exported in `landmarks.json`). Everything that moves or glows lives in
  the site instead (`src/scene/life.js`, no re-bake needed): diyas, string lights + bloom,
  doorway light and lit lamps at night, fireflies, birds, the flag, wind in the drapes, river
  ripples, alpona decals; the cards get a vine and an alpona frame (`src/ornament.js`). No
  human figures by decision. The life layer only reads landmarks, so it survives any change of
  model.

- 2026-09-14 — **Walk re-routed, sanctum opened.** The walk now goes ghat → left along the
  north Shiva group → through the Radhakanta (in at its northmost door) → mandap → through the
  nat-mandir (up its west stair, out of its northmost door) → temple stair → central arch. The
  navaratna core gains a shrine chamber behind that arch (`build_dakshineswar.SANCTUM`, exported
  as `landmarks.sanctum`); Ma Kali is `public/images/bhavatarini.png` on a lit plane in `life.js`.
- 2026-09-13 — Blender track: `blender/build_dakshineswar.py` builds the complex parametrically
  (Cycles CPU previews verified against the CG video's overview angle and the satellite plan view).
  Deliverable = `.blend` + stills + turntable in `data/blender/`. Not integrated with the site.
  Second pass the same day: layout re-read from the satellite (halls fill the east side, courtyard
  is the west strip), generated normal/displacement/albedo maps + cube UVs, relief geometry
  (pilasters, blind arches, arcaded upper storeys, two-storey boundary buildings), HDRI skybox.
  Third pass: cross-checked against the Commons photos — arches were boolean niches with a lit
  back wall, Shiva roofs were tiled (they are smooth red plaster), eave/cornice curves bent the
  wrong way, s2/s3 too tall, spire bands and dentils were geometry, ring/stair/path boxes overlapped
  (z-fighting). Rebuilt without booleans (pierced walls, closed rings, profile stairs), detail moved
  into shaders, paving displaced via adaptive subdivision; 429 k → 60 k faces, mesh audit clean.
  Fourth pass: the nat-mandir was an open column hall (the real one, M36537551 / M36512944 /
  M27969301, is a closed 7 × 3-bay hall of 9-foil arches with striped bundled jambs, rosettes,
  panelled parapet and pediment); the boundary was two-storey (it is a single-storey colonnade
  with shops, M69552267 / M69552273); the ratnas were fluted (they are stairs of corbelled rings,
  M69552277). Rebuilt those three families with `hall_block` / `colonnade_block` /
  `stepped_profile`; 87 k faces, audit clean.
  Fifth pass: wedding mandap added from the user's scanned-mandap screenshots
  (`data/reference/mandap/mandap1-4.png`): `build_mandap` — white-clad stage with carpeted steps on three sides, four
  turned columns, canopy with rose garland and marigold valance, tied-back translucent drapes
  (parametric sheets with their own UVs for the hem), eight-gored umbrella dome, havan kund —
  centred on the cross walk to the navaratna, midway across the courtyard strip. Two new stills
  (`mandap`, `mandap_close`); 95 k faces, audit clean. This is the layout/concept reference for
  the splat mandap the dropped plan would have generated.

- 2026-09-13 — repo scaffolded; laptop scripts written and smoke-tested: Commons discovery
  (180 usable images across 9 categories: 85 navaratna, 49 general, 11 illuminated/night,
  11 interior, 8 Shiva temples, 4 gate, …), full fetch with sha1 verification, audit page,
  YouTube pinning, OSM layout. Cluster scripts written but not yet executed anywhere.
- Coverage note from the first pass: the 12 Shiva temples have only 8 stills on Commons — that
  bucket will depend on vlog frames. Attribution: map data © OpenStreetMap contributors (ODbL).
