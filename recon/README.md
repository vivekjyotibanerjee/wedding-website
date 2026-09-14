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
`data/reference/satellite.png` (58 × 107 m walled complex; the halls are ≈ 18 m blocks on the
east side, nearly touching the navaratna platform and a colonnade's width short of the east range,
so the "courtyard" is the ~18 m strip west of them).
`configs/layout.inner.yaml` (from `trace.py`) overrides the default positions when present and
PyYAML is importable from Blender's python.

Geometry rules (third pass): no booleans — every arch is a pierced wall (piers + spandrels +
reveals, one closed solid via `sheet()`) so openings go through into real rooms and the navaratna
verandahs are corridors you can see through at the corners; rings, stairs and mouldings are single
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

```bash
bash blender/render.sh quick       # iterate: 960x540, 24 samples (~20 s on 22 cores)
bash blender/render.sh             # .blend + 13 stills at 1280x720, 128 samples (~25 min CPU)
bash blender/render.sh turntable   # 48-frame turntable only (960x540, keeps the stills) → data/blender/turntable.mp4
```

Outputs land in `data/blender/` (git-ignored — the `.blend` is reproducible from the script).
This is a *deliverable for review*, not part of the splat pipeline; site integration (glTF export)
was deliberately left out.

## Layout

```
configs/    sources.yaml (seeds) · manifest.json (lock) · selection.yaml (audit) · selection.example.yaml · layout.geojson (OSM) · layout.inner.yaml (traced landmarks)
blender/    build_dakshineswar.py · textures.py · render.sh
scripts/    reconlib.py + fetch.py (both machines) · laptop/{discover,audit,layout,trace}.py · cluster/00…06 + prune_ply.py
envs/       cluster.yml
data/       git-ignored: raw/ images/ masks/ colmap/ ns/ outputs/ audit/ layout/ reference/ blender/
```
