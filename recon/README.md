# dakshineswar-recon

Reconstruction of the Dakshineswar Kali Temple complex as 3D Gaussian Splats from internet imagery
(Wikimedia Commons stills + frames from YouTube walkthroughs). Self-contained package inside the
wedding-website repo (`recon/`); nothing here imports from the site and the site only ever consumes
the exported `.sog` files. Plan and status: [PLAN.md](PLAN.md).

## Where things run

| Stage | Machine | Command | Needs |
|---|---|---|---|
| 1. Discover media → lock file | **laptop** | `python scripts/laptop/discover.py` | network |
| 2. Fetch everything for review | **laptop** | `python scripts/fetch.py --commons` | network, ~GBs of disk |
| 3. Audit → `configs/selection.yaml` | **laptop** (browser) | `python scripts/laptop/audit.py --serve` → http://localhost:8765/ (embedded YouTube player, Mark start/end) | network for the player |
| 3b. Site blueprint from OSM | laptop | `python scripts/laptop/layout.py` → `configs/layout.geojson`, `data/layout/layout.svg` | network |
| 3c. Trace inner layout from your satellite screenshot | laptop (browser) | `python scripts/laptop/trace.py` → open `data/layout/trace.html`, save as `configs/layout.inner.yaml` | `data/reference/satellite.png` |
| 4. Commit `configs/` | laptop → git → cluster | `git add configs && git commit && git push` | — |
| 5. Fetch the selected subset | **cluster** | `bash scripts/cluster/00_fetch.sh` | network |
| 6. Frames + filters | cluster | `python scripts/cluster/01_frames.py` | ffmpeg, opencv |
| 7. Transient masks | cluster (GPU) | `python scripts/cluster/02_mask.py` | Grounding DINO + SAM 2 |
| 8. Camera poses | cluster (GPU) | `bash scripts/cluster/03_sfm.sh` | COLMAP (+GLOMAP) |
| 9. Train splats | cluster (24/48GB) | `bash scripts/cluster/04_train.sh` | nerfstudio + splatfacto-w |
| 10. Export day/night `.ply` | cluster | `bash scripts/cluster/05_export.sh dakshineswar day` | nerfstudio |
| 11. Prune + compress to `.sog` | cluster or laptop | `bash scripts/cluster/06_compress.sh <in.ply> <out.sog>` | splat-transform |

The only state that crosses machines is `configs/` (via git). `data/` is git-ignored and fully
re-creatable from `configs/` on any machine.

## Determinism

`configs/manifest.json` is a lock file. `discover.py` only ever appends to it; `fetch.py` downloads
what it lists and verifies Commons files by sha1, so the laptop and the cluster resolve byte-identical
inputs. YouTube streams cannot be pre-hashed; the format id and yt-dlp version are pinned instead and
frames are cut at fixed timestamps (`fetch.py --lock-hashes` records the sha1 actually observed).
`configs/selection.yaml` is the audited subset — the cluster never trains on anything outside it.

## Laptop setup

```bash
conda create -n dak-laptop python=3.12 pip && conda activate dak-laptop   # (python3-venv is not installed on this WSL)
pip install -r requirements-laptop.txt      # ffmpeg is only needed on the cluster
python scripts/laptop/discover.py           # Commons categories from configs/sources.yaml
python scripts/laptop/discover.py --yt-search "dakshineswar temple walk" --yt-max 25
#   → paste the vlog IDs worth auditing into configs/sources.yaml (youtube.ids), then:
python scripts/laptop/discover.py --youtube
python scripts/fetch.py --commons
python scripts/laptop/audit.py --serve      # open http://localhost:8765/ in your browser
```

Audit the videos in the page's embedded player: Load, scrub to a walking segment, Mark start / Mark end. Save the
generated YAML as `configs/selection.yaml`, commit, push.

## Cluster setup

```bash
git clone git@github.com:vivekjyotibanerjee/wedding-website.git && cd wedding-website/recon
conda env create -f envs/cluster.yml && conda activate dak-recon
pip install git+https://github.com/nerfstudio-project/nerfstudio.git
pip install git+https://github.com/KevinXu02/splatfactoW        # adds `splatfacto-w` to ns-train
pip install git+https://github.com/facebookresearch/sam2
npm i -g @playcanvas/splat-transform
bash scripts/cluster/00_fetch.sh && python scripts/cluster/01_frames.py && python scripts/cluster/02_mask.py
bash scripts/cluster/03_sfm.sh && bash scripts/cluster/04_train.sh pilot
```

The cluster scripts have been written against the documented CLIs of COLMAP 3.9+, Nerfstudio 1.1+,
splatfacto-w, SAM 2.1 and splat-transform but have **not been executed** in this repo yet (the laptop
cannot run them). Expect to adjust flags on first run — `03_sfm.sh` and `04_train.sh` are the ones
most likely to need it. Known things to verify first:
`ns-process-data --colmap-model-path` may resolve relative to `--output-dir` (use an absolute path if
so) and `--skip-image-processing` may leave `file_path`s pointing outside `data/ns/`; the conda
`colmap` build may lack CUDA (`--SiftExtraction.use_gpu 0`); `ns-export gaussian-splat` needs the
appearance-embedding flag of the installed splatfacto-w build (`05_export.sh`). Record what changed
in PLAN.md.

## Blender model (parallel track)

`blender/build_dakshineswar.py` rebuilds the complex — navaratna, courtyard, 12 Shiva temples,
nat-mandir, Radhakanta temple, boundary arcades, ghat — as parametric geometry in Blender 4.0,
headless, in the same metre frame as `configs/layout.geojson` (origin = navaratna centre, x east,
y north). Look is the real temple (cream stucco, rose bands, salmon chala roofs, fluted spires); the
CG reference videos only settled the arrangement, the footprint comes from
`data/reference/satellite.png` (58 × 107 m walled complex — built 64 m wide since the sixth pass,
see below; the halls are ≈ 18 m blocks on the east side, nearly touching the navaratna platform
and a colonnade's width short of the east range, so the "courtyard" is the ~18 m strip west of
them).
`configs/layout.inner.yaml` (from `trace.py`) overrides the default positions when present and
PyYAML is importable from Blender's python.

Geometry rules (third pass): no booleans — every arch is a pierced wall (piers + spandrels +
reveals, one closed solid via `sheet()`) so openings go through into real rooms and the navaratna
verandahs are corridors you can see through at the corners, and the ground-storey core holds a
shrine chamber behind the central south arch (`SANCTUM`: a pierced wall + touching boxes, the
deity herself is a picture the site adds at runtime); rings, stairs and mouldings are single
closed solids (the old overlapping boxes z-fought at every corner); the build prints a mesh audit
(open edges must be "none"). The whole scene is ≈60 k faces. High-frequency detail lives in the
shaders, not in vertices: `blender/textures.py` generates tileable albedo / tangent normal / 32-bit
height maps (stucco, brick, paving; the pantile set is kept but unused — the aat-chala roofs are
red-painted plaster) with numpy on first run into `data/blender/textures/`; meshes get a per-face
cube-projection UV layer so the normal maps read correctly; spire bands, the navaratna's striped
pilasters, the Shiva dado and the dentil courses are painted procedurally. The only true
displacement is the courtyard paving, diced at render time by Cycles adaptive subdivision (the
stored mesh is a 2 m grid). Fourth pass: the nat-mandir and Radhakanta block are `hall_block`
(closed 7 × 3 / 8 × 5-bay halls of 9-foil arches with striped bundled jambs, rosettes, panelled
parapet, pediment, dado and stair — refs M36537551, M36512944, M27969301), the boundary is
`colonnade_block` (single-storey shop colonnade inside, red niche band outside — M69552267,
M69552273) and the ratnas are `stepped_profile` stairs of corbelled rings with painted beading
(M69552277). Fifth pass: `build_mandap` adds the wedding mandap (refs `data/reference/mandap/mandap1-4.png` —
screenshots of a scanned mandap): white-clad stage with carpeted steps on three sides
(front toward the ghat walk), four turned sandstone columns, white canopy with a rose garland and
marigold valance, tied-back translucent drapes (parametric sheets carrying their own UVs so the
hem is painted, not modelled), an eight-gored red/cream umbrella dome and the havan kund, centred
on the cross walk that leads to the navaratna, midway across the courtyard strip; ≈ 95 k faces.
Skybox: a CC0 Poly Haven HDRI (`kloofendal_38d_partly_cloudy_puresky`,
pinned by sha1 in `render.sh`) with a sun lamp aligned to its sun and rotated to an SSW afternoon
bearing.

Sixth pass (Sep 2026), against the owner's aerial photograph and a photo-textured SketchUp model
of the complex (3D Warehouse; the `.skp` is only readable as its Collada export, see below): the
navaratna's ground-storey doorways are short against a tall panelled wall (`S1_ARCH`, rosette and
framed panel per bay) and the wall's top follows a deep Bengal curve with a rose cornice, a dentil
course and a string riding it (`curved_band`); the platform is plastered, a blind arcade of
round-headed niches between pilaster strips runs round it and a flight climbs every face
(`NAV_STAIR`: south and west broad, north and east narrower — the walk still climbs the south
one), with the balustrade and the trim broken at the flights; the ratnas are octagonal drums with
a blind niche per face under a smooth ribbed bulbous dome (`ratna`, gold finials kept), each on a
pedestal that fills its terrace ledge so nothing stands inside the storey above (the set-backs
`S2`/`S3` are sized for that); the halls get thin framed panels over the piers; the mandap's flower
bushes are brass-urn bouquets (`bouquet` material, the blooms as relief). To fit the four flights
the courtyard is 64 m wide (4 m more on the east, 2 m on the west with the Shiva row, ghat and
river), the Radhakanta 2.5 m further north and the mandap 0.8 m west of the strip's centre
(`mandap_dx`). The build's `mesh_audit` now also lists the heaviest meshes, same-facing coplanar
faces of different objects (z-fights, after discounting faces glued to a third object) and solids
with a vertex inside another (generalized winding number — ray parity trips on the seams of
touching parts); `AUDIT_VERBOSE=1` prints every pair. What remains is the temple stair's foot
buried in the nat-mandir plinth (the walk depends on it) and bevel-deep contacts. `ring_prism`
leaves an arch outline open at its base (a horseshoe with foot caps) — walling the base edge laid
a stray face across every threshold, coplanar with the floor.

The SketchUp reference: `data/reference/skp/` (git-ignored) holds the `.dae` + textures exported
from the `.skp` (SketchUp Free reads the model but not its materials; the zip of Blender 4.2's
Collada export has both) and `ref.blend`, imported once by `blender/ref_views.py --dae … --save`.
Then any camera: `blender -b -P blender/ref_views.py -- --site --view name=x,y,z/tx,ty,tz/lens …`
(`--site` takes cameras in this model's frame and maps them into the reference's, yawed 8.7°
with its navaratna at 7.98, 8.46); `--elev south|…`, `--plan`, `--orbit N`, `--bounds`.
`build_dakshineswar.py --view …` and `preview_web.py --view …` take the same camera strings, and
`blender/pair.py` stitches reference/ours sheets — `data/reference/skp/pairs/`. Its untextured
faces (the upper storey's west and south, half of each dome) are the model's, not ours to copy.

```bash
bash blender/render.sh quick       # iterate: 960x540, 24 samples (~20 s on 22 cores)
bash blender/render.sh             # .blend + 13 stills at 1280x720, 128 samples (~25 min CPU)
bash blender/render.sh turntable   # 48-frame turntable only (960x540, keeps the stills) → data/blender/turntable.mp4
```

Outputs land in `data/blender/` (git-ignored — the `.blend` is reproducible from the script).

**This model is what the website renders.** `blender/export_web.py` rebuilds it, bakes every
procedural material (tint, stripes, beading, AO grime, the weathering streaks and damp band, the
drapes' hem, the garland) to per-mesh albedo + tangent-normal maps over a smart-projected UV
layer — striped/beaded materials at 2 cm texels, plain stucco at 5 cm with half-res normals,
while the brick/paving/path surfaces keep the tiling source maps through metre-scaled UVs — bakes
a Cycles ambient-occlusion map for each of those (over the same UVs, or a second layer for the
tiling meshes; 2 m rays) that ships as the glTF `occlusionTexture`, ships the RGBA leaf-card
atlases (`textures.ensure_foliage`) alpha-clipped, swaps in plain Principled materials the glTF
exporter carries verbatim, and writes an uncompressed `.glb` plus `src/scene/landmarks.json`
(key positions converted to the site's Y-up frame: three (x, y, z) = Blender (x, z, −y) — the
buildings, the stairs and arches, the lamp posts and bells). `render.sh web` runs that and then
`gltf-transform meshopt` into `public/models/dakshineswar.glb`. The site's camera path, card
anchors and runtime props (`src/scene/walk.js`, `life.js`) read the landmarks, so moving a
building in `LAYOUT` moves the walk with it.

```bash
BLENDER=~/opt/blender-4.0.2-linux-x64/blender bash blender/render.sh web        # ~17 min CPU → 11.7 MB glb
bash blender/render.sh web --landmarks-only                                     # rebuild + landmarks.json, no bake
blender -b -P blender/export_web.py -- --dry                                    # print the bake plan only
blender -b -P blender/export_web.py -- --only '^(paving_web|nat)$' --out /tmp/t --bake-dir /tmp/t/bake   # a few meshes only;
#   npx gltf-transform meshopt /tmp/t/dakshineswar.glb ../public/models/preview.glb  → site with ?model=/models/preview.glb
blender -b -P blender/preview_web.py -- --glb data/web/dakshineswar.glb          # re-import + render stills to check the bake
blender -b -P blender/build_dakshineswar.py -- --out data/blender/work --mode massing --render stills \
        --view front=-34,0,2.9/0,0,10/28                                          # a camera of your own on the Blender scene (~4 s a view)
```

The Ubuntu/Debian `blender` package (4.0.2+dfsg) renders fine but its Cycles **bakes black** for
every pass except NORMAL, and it lacks Draco and OIDN — hence the official build for the export
(`~/opt/blender-4.0.2-linux-x64`, sha256-verified from a blender.org mirror). Same 4.0.2 API, so
the build script needs no change.

## Layout

```
configs/    sources.yaml (seeds) · manifest.json (lock) · selection.yaml (audit) · selection.example.yaml · layout.geojson (OSM) · layout.inner.yaml (traced landmarks)
blender/    build_dakshineswar.py · textures.py · render.sh · export_web.py (bake + glTF for the site) · preview_web.py
scripts/    reconlib.py + fetch.py (both machines) · laptop/{discover,audit,layout,trace}.py · cluster/00…06 + prune_ply.py
envs/       cluster.yml
data/       git-ignored: raw/ images/ masks/ colmap/ ns/ outputs/ audit/ layout/ reference/ blender/ web/ (bakes, uncompressed glb)
```
