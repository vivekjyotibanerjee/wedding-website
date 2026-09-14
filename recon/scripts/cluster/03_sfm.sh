#!/usr/bin/env bash
# CLUSTER (GPU). Camera poses with COLMAP (+ GLOMAP if installed) → data/colmap/sparse/0
#
#   bash scripts/cluster/03_sfm.sh [--no-masks]
#
# Notes
# * Every image gets its own intrinsics (internet photos / different phones) — OPENCV model.
# * Masks from 02_mask.py are applied at feature extraction so transients contribute no keypoints.
# * Matching: sequential (video frames, sorted by name = by video + timestamp) with loop detection,
#   then vocab-tree over everything so stills attach to the video tracks. Exhaustive would also
#   work up to ~1.5k images but is slower.
# * If <60% of images register, bootstrap poses with VGGT / MASt3R-SfM before coming back here.
set -euo pipefail
cd "$(dirname "$0")/../.."
IMAGES=data/images
WORK=data/colmap
DB=$WORK/database.db
MASK_ARGS=(--ImageReader.mask_path data/masks)
[[ "${1:-}" == "--no-masks" ]] && MASK_ARGS=()
mkdir -p "$WORK/sparse"

VOCAB=$WORK/vocab_tree_flickr100K_words256K.bin
[[ -f $VOCAB ]] || curl -L -o "$VOCAB" https://demuc.de/colmap/vocab_tree_flickr100K_words256K.bin

colmap feature_extractor \
  --database_path "$DB" --image_path "$IMAGES" "${MASK_ARGS[@]}" \
  --ImageReader.camera_model OPENCV --ImageReader.single_camera 0 \
  --SiftExtraction.use_gpu 1 --SiftExtraction.max_num_features 8192

colmap sequential_matcher \
  --database_path "$DB" --SequentialMatching.overlap 12 \
  --SequentialMatching.loop_detection 1 --SequentialMatching.vocab_tree_path "$VOCAB" \
  --SiftMatching.use_gpu 1

colmap vocab_tree_matcher \
  --database_path "$DB" --VocabTreeMatching.vocab_tree_path "$VOCAB" \
  --VocabTreeMatching.num_images 60 --SiftMatching.use_gpu 1

if command -v glomap >/dev/null; then
  glomap mapper --database_path "$DB" --image_path "$IMAGES" --output_path "$WORK/sparse"
else
  colmap mapper --database_path "$DB" --image_path "$IMAGES" --output_path "$WORK/sparse" \
    --Mapper.ba_global_function_tolerance 1e-6
fi

# Report registration rate for the largest model.
BEST=$(ls -d "$WORK"/sparse/*/ | head -1)
colmap model_analyzer --path "$BEST" 2>&1 | tail -n 8
TOTAL=$(ls "$IMAGES"/*.jpg | wc -l)
echo "images on disk: $TOTAL  (aim for >=60% registered; otherwise see notes above)"
