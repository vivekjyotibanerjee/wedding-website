#!/usr/bin/env bash
# LAPTOP (or anywhere with Blender 4.0 + CPU). Rebuild the model from the script and render.
#
#   bash recon/blender/render.sh                 # .blend + 13 stills (1280x720, 128 samples)
#   bash recon/blender/render.sh turntable       # 48-frame turntable only (960x540) → data/blender/turntable.mp4
#   bash recon/blender/render.sh quick           # 960x540, 24 samples — for iterating on the script
#
# Output: recon/data/blender/  (git-ignored; everything is reproducible from build_dakshineswar.py)
# Textures: data/blender/textures/ — the albedo/normal/height maps are generated on first run by
# blender/textures.py; the skybox is a CC0 Poly Haven HDRI fetched once here (pinned by sha1).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=data/blender
MODE=${1:-stills}

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
  quick)     blender -b -P blender/build_dakshineswar.py -- --out "$OUT" --render stills --res 960x540 --samples 24 ;;
  stills)    blender -b -P blender/build_dakshineswar.py -- --out "$OUT" --render stills --res 1280x720 --samples 128 ;;
  turntable) blender -b -P blender/build_dakshineswar.py -- --out "$OUT" --render turntable --res 960x540 --samples 48 --frames 48
             ffmpeg -loglevel error -y -framerate 12 -i "$OUT/turntable/frame_%04d.png" -c:v libx264 -pix_fmt yuv420p -crf 20 "$OUT/turntable.mp4"
             echo "→ $OUT/turntable.mp4" ;;
  *) echo "usage: $0 [quick|stills|turntable]"; exit 1 ;;
esac
ls -la "$OUT"/*.png "$OUT"/*.blend 2>/dev/null | sed 's|^.* data/|data/|'
