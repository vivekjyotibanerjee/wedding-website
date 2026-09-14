#!/usr/bin/env bash
# CLUSTER or LAPTOP. Prune floaters, crop to the complex, compress to SOGS for the browser.
#
#   bash scripts/cluster/06_compress.sh data/outputs/export/day/splat.ply public/day.sog [--crop x0,y0,z0,x1,y1,z1]
#
# Pruning is done in python (plyfile+numpy); SOGS compression uses PlayCanvas' splat-transform
# (npm i -g @playcanvas/splat-transform).  Targets for phones: <=1.5M splats, <=30MB per appearance.
set -euo pipefail
cd "$(dirname "$0")/../.."
IN=${1:?input .ply}; OUT=${2:?output .sog}; shift 2
PRUNED=${IN%.ply}.pruned.ply
python scripts/cluster/prune_ply.py "$IN" "$PRUNED" "$@"
splat-transform "$PRUNED" "$OUT"
ls -la "$OUT"
