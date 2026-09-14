#!/usr/bin/env bash
# CLUSTER. Export the trained model to a .ply of Gaussians.
#
#   bash scripts/cluster/05_export.sh [experiment-name] [label]
#
# Appearance control: splatfacto-w keeps a per-image appearance embedding; the exported .ply carries
# the colours as seen through ONE embedding.  Which one is a model option at export time — check
# `ns-export gaussian-splat --help` for the appearance/embedding flag of the installed splatfacto-w
# build and pass it via APPEARANCE_ARGS, e.g. the index of an overcast daytime training image for
# "day" and of a floodlit photo for "night".  Run twice with different labels to get day.ply/night.ply.
set -euo pipefail
cd "$(dirname "$0")/../.."
NAME=${1:-dakshineswar}; LABEL=${2:-day}
CONFIG=$(ls -t data/outputs/"$NAME"/splatfacto-w/*/config.yml 2>/dev/null | head -1)
[[ -n "$CONFIG" ]] || { echo "no trained config under data/outputs/$NAME"; exit 1; }
OUT=data/outputs/export/$LABEL
mkdir -p "$OUT"
ns-export gaussian-splat --load-config "$CONFIG" --output-dir "$OUT" ${APPEARANCE_ARGS:-}
ls -la "$OUT"
