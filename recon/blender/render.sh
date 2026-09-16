#!/usr/bin/env bash
# LAPTOP (or anywhere with a Blender Foundation build, 5.2 — the snap — + CPU). Rebuild the model from the script and render.
#
#   bash recon/blender/render.sh                 # .blend + 13 stills (1280x720, 128 samples)
#   bash recon/blender/render.sh turntable       # 48-frame turntable only (960x540) → data/blender/turntable.mp4
#   bash recon/blender/render.sh quick           # 960x540, 24 samples — for iterating on the script
#   bash recon/blender/render.sh web             # bake + export the model the website loads → public/models/dakshineswar.glb
#                                                #   (BLENDER=path/to/blender if not on the PATH — the Ubuntu package's Cycles cannot bake)
#   bash recon/blender/render.sh blend           # just build + audit + save data/blender/dakshineswar.blend (to edit by hand)
#   bash recon/blender/render.sh web --blend F   # export a hand-edited .blend instead of rebuilding (README, "Edit the model by hand")
#   bash recon/blender/render.sh diff F          # what a hand-edited .blend changed against the script, to port back (--keep-added, --json)
#
# Output: recon/data/blender/  (git-ignored; everything is reproducible from build_dakshineswar.py)
# Textures: data/blender/textures/ — the albedo/normal/height maps are generated on first run by
# blender/textures.py; the skybox is a CC0 Poly Haven HDRI fetched once here (pinned by sha1).
set -euo pipefail
R="$(cd "$(dirname "$0")/.." && pwd)"     # recon/ — no cd, so a path you pass (--blend, diff FILE, --json) is taken from where you run this
OUT=$R/data/blender
MODE=${1:-stills}
BLENDER=${BLENDER:-blender}

SKY_URL=https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloofendal_38d_partly_cloudy_puresky_2k.hdr
SKY_SHA1=e0ecd267d63708bccd89dd64f5397c9eb49f692c
mkdir -p "$OUT/textures"
if [ ! -f "$OUT/textures/sky.hdr" ] || ! echo "$SKY_SHA1  $OUT/textures/sky.hdr" | sha1sum -c --quiet 2>/dev/null; then
  echo "fetching skybox HDRI (Poly Haven, CC0) …"
  curl -sfL -o "$OUT/textures/sky.hdr.part" "$SKY_URL"
  echo "$SKY_SHA1  $OUT/textures/sky.hdr.part" | sha1sum -c --quiet
  mv "$OUT/textures/sky.hdr.part" "$OUT/textures/sky.hdr"
fi

case "$MODE" in
  web)       "$BLENDER" -b -P "$R/blender/export_web.py" -- "${@:2}"
             case " ${*:2} " in *" --dry "*|*" --landmarks-only "*|*" --only "*|*" --out "*) exit 0 ;; esac   # no full glb written
             # geometry → EXT_meshopt_compression (three.js decodes it with its bundled decoder, no extra files to host)
             (cd "$R/.." && npx gltf-transform meshopt recon/data/web/dakshineswar.glb public/models/dakshineswar.glb --level medium)
             ls -la "$R/../public/models/dakshineswar.glb"; exit 0 ;;
  blend)     "$BLENDER" -b -P "$R/blender/build_dakshineswar.py" -- --out "$OUT" --render none ;;
  diff)      "$BLENDER" -b -P "$R/blender/diff_blend.py" -- "${@:2}"; exit 0 ;;
  quick)     "$BLENDER" -b -P "$R/blender/build_dakshineswar.py" -- --out "$OUT" --render stills --res 960x540 --samples 24 ;;
  stills)    "$BLENDER" -b -P "$R/blender/build_dakshineswar.py" -- --out "$OUT" --render stills --res 1280x720 --samples 128 ;;
  turntable) "$BLENDER" -b -P "$R/blender/build_dakshineswar.py" -- --out "$OUT" --render turntable --res 960x540 --samples 48 --frames 48
             ffmpeg -loglevel error -y -framerate 12 -i "$OUT/turntable/frame_%04d.png" -c:v libx264 -pix_fmt yuv420p -crf 20 "$OUT/turntable.mp4"
             echo "→ $OUT/turntable.mp4" ;;
  *) echo "usage: $0 [quick|stills|turntable|blend|diff FILE|web]"; exit 1 ;;
esac
ls -la "$OUT"/*.png "$OUT"/*.blend 2>/dev/null | sed 's|^.* data/|data/|'
