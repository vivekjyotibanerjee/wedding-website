#!/usr/bin/env python3
"""CLUSTER (GPU). Transient masks for every image in data/images/ → data/masks/<image>.png

  python scripts/cluster/02_mask.py [--prompts "person. car. ..."] [--dilate 8] [--box 0.35] [--text 0.25]

Detector: Grounding DINO (HF transformers), segmenter: SAM 2. White (255) = keep, black (0) = ignore,
which is the convention both COLMAP (--ImageReader.mask_path) and Nerfstudio (mask_path) expect.
Masks are only a prior: splatfacto-w also learns per-image transient masks, so misses are tolerable;
over-masking (chunks of the temple) is the thing to avoid — keep --box conservative.

Install (see envs/cluster.yml): pip install transformers accelerate git+https://github.com/facebookresearch/sam2
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import reconlib as R  # noqa: E402

IMAGES = R.DATA / "images"
MASKS = R.DATA / "masks"
DEFAULT_PROMPTS = "person. people. crowd. man. woman. child. car. bus. auto rickshaw. bicycle. motorbike. boat. dog. cow. goat. bird. pigeon. umbrella. banner. flag. tarpaulin. scaffolding."


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--prompts", default=DEFAULT_PROMPTS)
    ap.add_argument("--dilate", type=int, default=8, help="px to grow each mask (hides halos/shadows)")
    ap.add_argument("--box", type=float, default=0.35, help="Grounding DINO box threshold")
    ap.add_argument("--text", type=float, default=0.25, help="Grounding DINO text threshold")
    ap.add_argument("--dino", default="IDEA-Research/grounding-dino-base")
    ap.add_argument("--sam", default="facebook/sam2.1-hiera-large")
    ap.add_argument("--overwrite", action="store_true")
    a = ap.parse_args()

    import cv2
    import numpy as np
    import torch
    from PIL import Image
    from sam2.sam2_image_predictor import SAM2ImagePredictor
    from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    proc = AutoProcessor.from_pretrained(a.dino)
    dino = AutoModelForZeroShotObjectDetection.from_pretrained(a.dino).to(dev).eval()
    sam = SAM2ImagePredictor.from_pretrained(a.sam, device=dev)
    kernel = np.ones((a.dilate * 2 + 1, a.dilate * 2 + 1), np.uint8) if a.dilate > 0 else None

    MASKS.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in IMAGES.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    n_masked = 0
    for i, path in enumerate(files, 1):
        out = MASKS / f"{path.name}.png"
        if out.exists() and not a.overwrite:
            continue
        im = Image.open(path).convert("RGB")
        W, H = im.size
        with torch.no_grad():
            inputs = proc(images=im, text=a.prompts, return_tensors="pt").to(dev)
            res = proc.post_process_grounded_object_detection(
                dino(**inputs), inputs.input_ids, threshold=a.box, text_threshold=a.text, target_sizes=[(H, W)])[0]
        keep = np.full((H, W), 255, np.uint8)
        boxes = res["boxes"].cpu().numpy()
        if len(boxes):
            with torch.no_grad(), torch.autocast(dev, dtype=torch.bfloat16, enabled=dev == "cuda"):
                sam.set_image(np.asarray(im))
                masks, _, _ = sam.predict(box=boxes, multimask_output=False)
            m = masks.reshape(-1, H, W).any(0).astype(np.uint8) * 255
            if kernel is not None:
                m = cv2.dilate(m, kernel)
            keep[m > 0] = 0
            n_masked += 1
        cv2.imwrite(str(out), keep)
        if i % 50 == 0:
            print(f"  {i}/{len(files)}", flush=True)
    print(f"{len(files)} masks written ({n_masked} with transients) → {MASKS}")


if __name__ == "__main__":
    main()
