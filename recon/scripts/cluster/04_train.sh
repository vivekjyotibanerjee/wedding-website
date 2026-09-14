#!/usr/bin/env bash
# CLUSTER (GPU, 24/48GB). Train in-the-wild Gaussian splats with Nerfstudio.
#
#   bash scripts/cluster/04_train.sh [experiment-name] [extra ns-train args...]
#
# Method: splatfacto-w (per-image appearance embeddings + learned transient masks), the in-the-wild
# variant of splatfacto.  Install:  pip install git+https://github.com/KevinXu02/splatfactoW
# then `ns-train --help` should list `splatfacto-w`.  Fallback: `splatfacto` (no appearance handling).
set -euo pipefail
cd "$(dirname "$0")/../.."
NAME=${1:-dakshineswar}; shift || true
NS=data/ns
SPARSE=$(ls -d data/colmap/sparse/*/ | head -1)

# transforms.json from the COLMAP model (no re-running COLMAP), then attach the masks.
ns-process-data images --data data/images --output-dir "$NS" \
  --skip-colmap --colmap-model-path "$SPARSE" --skip-image-processing
python - <<'PY'
import json, pathlib
ns = pathlib.Path("data/ns"); t = json.loads((ns / "transforms.json").read_text())
masks = pathlib.Path("data/masks").resolve()
n = 0
for f in t["frames"]:
    m = masks / (pathlib.Path(f["file_path"]).name + ".png")
    if m.exists():
        f["mask_path"] = str(m); n += 1
(ns / "transforms.json").write_text(json.dumps(t, indent=2))
print(f"attached {n}/{len(t['frames'])} masks")
PY

ns-train splatfacto-w \
  --experiment-name "$NAME" --output-dir data/outputs \
  --max-num-iterations 30000 \
  --pipeline.model.cull-alpha-thresh 0.005 \
  --viewer.quit-on-train-completion True \
  "$@" \
  nerfstudio-data --data "$NS" --downscale-factor 1 --train-split-fraction 0.95
