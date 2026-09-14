# Reconstruction plan

Goal: replace the procedurally modelled temple in the wedding site with a photo-reconstructed
Dakshineswar rendered in the browser as real-time Gaussian splats — **no mixing of splats with
polygon geometry**. Anything the photos do not cover gets *generated* as splats. The watercolor look
is a later, optional pass.

## Decisions

- Sources: Wikimedia Commons (CC metadata captured per file) + hand-listed YouTube walkthroughs.
  No Flickr, no image-search scraping.
- Human audit before any training (laptop, `audit.py`); YouTube audited on youtube.com and selected
  as video id + time ranges.
- Laptop (8GB RTX 4070): discover / fetch / audit only. Cluster (24/48GB): everything GPU-heavy.
- Representation: 3DGS — the only one with both mature in-the-wild trainers and production browser
  renderers. (Powerfoam and similar: out of scope, tooling too thin.)
- Method: Nerfstudio `splatfacto-w` (per-image appearance embedding = **appearance control**;
  learned transient masks on top of our Grounding-DINO/SAM2 priors). Alternative: WildGaussians.
- Delivery: `@sparkjsdev/spark` `SplatMesh` inside the existing Three.js scene; cards, camera path,
  `project()`, day/night toggle and music stay as they are.

## Scope

What gets reconstructed: the **main navaratna mandir**, the **courtyard** in front of it (where the
mandap goes) and the **row of 12 Shiva temples**. The lion gate, the ghat and the river are context
only — their photos still help SfM register cameras, but they are not a quality target and get
cropped or left rough.

Blueprint: `scripts/laptop/layout.py` pulls OpenStreetMap footprints into `configs/layout.geojson`
(metres, origin = centroid of the complex polygon, x east / y north). OSM maps the complex as a single
~70×130 m polygon, so it fixes boundary, scale and orientation; the placement of the mandir,
nat-mandir and Shiva row inside it is traced by hand from a Google satellite screenshot
(`data/reference/satellite.png`, not scripted — Google's ToS) with `scripts/laptop/trace.py`: the
screenshot is overlaid on the OSM outline, calibrated on the measure-tool ticks, and named landmarks
(mandir centre/footprint, nat-mandir, mandap spot, stairs, door, Shiva row ends, courtyard, gate,
ghat, walk start) are clicked and saved as `configs/layout.inner.yaml` in the same metre frame. That
frame is what the splat crop box, the mandap placement and the camera path are expressed in.

## Coverage → pilot gate

Buckets: gate · courtyard · facade · stairs · shiva-row · natmandir · ghat · river · aerial · night.
Rule of thumb: ≥40 usable images per bucket is comfortable; <15 means that segment is a *gap*.
Photography is restricted inside the complex, so expect courtyard / stairs to be thin and vlog-only.

Pilot = facade + courtyard buckets only → stages 5–11 → view the `.sog` in a local Spark viewer on
the laptop → go/no-go on the whole approach before spending time on the full scene.

## Pipeline

1. `00_fetch.sh` — audited subset only.
2. `01_frames.py` — 2 fps inside selected ranges, Laplacian sharpness filter, pHash de-dupe.
3. `02_mask.py` — Grounding DINO + SAM 2: people, vehicles, animals, umbrellas, banners; dilated.
4. `03_sfm.sh` — COLMAP OPENCV per-image intrinsics, masks on, sequential + vocab-tree matching,
   GLOMAP mapper. If <60% register: bootstrap poses with VGGT / MASt3R-SfM, refine in COLMAP.
5. `04_train.sh` — splatfacto-w, full-res, ~1–2 h on 48GB.
6. `05_export.sh` — bake one appearance embedding per export: overcast-day reference → `day.ply`;
   floodlit-night reference → `night.ply` if night photos registered (else night = shader grading).
7. `06_compress.sh` — prune (opacity/scale/crop) → SOGS. Targets: ≤1.5M splats, ≤30MB per appearance.

## Gap filling (generative, all outputs are splats)

Ordered by maturity; each is gated behind the pilot so the plain exterior splat is judged first.

- **Thin exterior regions / floaters**: diffusion-guided repair that distils back into the splats
  (Difix3D+-style), or sparse-view generation for whole missing buckets (GenWildSplat-style).
- **Mandap** (does not exist at the site): concept image (SDXL/Flux img2img seeded from the current
  procedural render) → TRELLIS image-to-3D (emits Gaussians natively) → placed in the courtyard splat.
  Placement and proportions follow the Blender mandap (`build_mandap`: on the cross walk to the
  navaratna, midway across the courtyard strip, 5.8 m stage, ~7.5 m to the dome finial).
  A night variant is generated the same way from a re-lit concept image.
- **Sanctum interior** (no imagery): generative scene extension seeded from the doorway view
  (WonderWorld / WorldGen-class tools, or a hosted image→world service that exports splats).
  If quality isn't there: the walk ends at the doorway and the RSVP card lands on the stairs.

## Browser integration (site repo, after the pilot)

- New `src/scene/splat.js`: loads `day.sog` (+ `night.sog`), applies one fixed transform solved from
  three landmarks (gate centre, temple centre, ghat) against the current `LAYOUT` so card anchors and
  the camera path keep their coordinates; `setNight(t)` crossfades the two splat sets.
- `buildComplex()` and the rest of `dakshineswar.js` are retired; flames/fireflies stay as
  sprite/particle effects, and if even those jar they get baked into the generated mandap.
- Watercolor: optional screen-space pass (abstraction, depth-edge darkening, granulation, wobble,
  paper) applied to the final colour+depth buffer. Only after the splat walk is accepted.

## Reference material (never in the manifest / training set)

- CG model flythrough by Tapas Pal (Titli Studio): https://youtu.be/YYBOqdyjoxw and
  https://youtu.be/nlccTsb9hDM. Hand-modelled, so not reconstruction input — used only as a visual
  reference for the unphotographed sides/upper storeys, as conditioning images for generative gap
  filling, and to sanity-check the traced layout.
- CG model of the whole complex by Banti Kumar (BKFilms): https://youtu.be/uSJzyjEBWfc (from ~0:32).
  Covers courtyard + Shiva row + interior, but flat-shaded, watermarked on every frame, fast sweeps,
  and the Shiva-temple placement disagrees with the satellite view — layout/relationship reference and
  gap-fill conditioning only. If a CG look were ever wanted instead, license the model file, don't
  reconstruct the video.
- `data/reference/satellite.png` — Google satellite screenshot with the measure-tool loop (1080 ft).

## Status / log

- 2026-09-14 — **Site now renders the Blender model** (`blender/export_web.py` → bake → glTF →
  meshopt → `public/models/dakshineswar.glb`; `src/scene/{walk,model,scene}.js`). The hand-coded
  Three.js complex (`dakshineswar.js`, `geo.js`, `materials.js`, `nature.js`) is retired. Walk
  redesigned for the model's layout (no lion gate, solid navaratna core): river → ghat → Shiva
  row → mandap → nat-mandir front and plinth → temple stair → south verandah arch. The splat
  plan below is unchanged; when splats land they replace the glb in `scene.js`, and the card
  anchors / camera path already live in the layout frame (`landmarks.json`).
- 2026-09-14 — **Life layer.** Against "the temple looks barren": the export now bakes
  ambient occlusion (`occlusionTexture`, also over the tiling ground/plinths) and weathering
  (streaks under ledges, damp band at courtyard level); the model gains card-based trees and
  palms (RGBA atlases from `textures.ensure_foliage`), a grove north/south of the walls, kola
  gach pairs at the ghat top and both hall stairs, potted shrubs, cast-iron lamp posts and two
  hung bells (positions exported in `landmarks.json`). Everything that moves or glows lives in
  the site instead (`src/scene/life.js`, no re-bake needed): diyas, string lights + bloom,
  doorway light and lit lamps at night, fireflies, birds, the flag, wind in the drapes, river
  ripples, alpona decals; the cards get a vine and an alpona frame (`src/ornament.js`). No
  human figures by decision. When splats replace the glb, the life layer stays as is — it only
  reads landmarks.

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
  the generated splat mandap below.

- 2026-09-13 — repo scaffolded; laptop scripts written and smoke-tested: Commons discovery
  (180 usable images across 9 categories: 85 navaratna, 49 general, 11 illuminated/night,
  11 interior, 8 Shiva temples, 4 gate, …), full fetch with sha1 verification, audit page,
  YouTube pinning, OSM layout. Cluster scripts written but not yet executed anywhere.
- Coverage note from the first pass: the 12 Shiva temples have only 8 stills on Commons — that
  bucket will depend on vlog frames. Attribution: map data © OpenStreetMap contributors (ODbL).
