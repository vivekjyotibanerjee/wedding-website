#!/usr/bin/env python3
"""CLUSTER. Build data/images/ — the SfM/training image set — from the selected media.

  python scripts/cluster/01_frames.py [--fps 2] [--blur 60] [--phash 6]

* Commons stills: copied as-is (EXIF-rotated, re-encoded to JPEG q95, long edge capped at --max-edge).
* YouTube: frames extracted with ffmpeg at a fixed --fps inside each selected time range, so the
  same manifest + selection always yields the same timestamps.
* Sharpness filter: variance of Laplacian below --blur is dropped (motion blur, pans).
* Near-duplicate filter: perceptual hash Hamming distance <= --phash to the previous kept frame
  of the same video is dropped (standing still / talking-head segments).
Output names: data/images/<id>__<index:05d>.jpg (zero-padded so sequential matching sorts correctly), plus data/images/frames.csv (source, timestamp, score).
"""
from __future__ import annotations

import argparse
import csv
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import reconlib as R  # noqa: E402

IMAGES = R.DATA / "images"
TMP = R.DATA / "tmp_frames"


def sharpness(path: Path) -> float:
    import cv2
    im = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if im is None:
        return 0.0
    return float(cv2.Laplacian(im, cv2.CV_64F).var())


def phash(path: Path):
    import imagehash
    from PIL import Image
    with Image.open(path) as im:
        return imagehash.phash(im)


def process_still(e: dict, max_edge: int, rows: list) -> bool:
    from PIL import Image, ImageOps
    src = R.commons_local_path(e)
    if not src.exists():
        print(f"  missing {e['id']} — run 00_fetch.sh", file=sys.stderr)
        return False
    dst = IMAGES / f"{e['id']}__00000.jpg"
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((max_edge, max_edge))
        im.save(dst, "JPEG", quality=95)
    rows.append([dst.name, e["id"], "", f"{sharpness(dst):.1f}"])
    return True


def process_video(e: dict, ranges, fps: float, blur: float, ph: int, max_edge: int, rows: list) -> int:
    src = R.youtube_local_path(e)
    if not src.exists():
        print(f"  missing {e['id']} — run 00_fetch.sh", file=sys.stderr)
        return 0
    kept, last_hash, idx = 0, None, 0
    for (t0, t1) in ranges:
        TMP.mkdir(parents=True, exist_ok=True)
        for f in TMP.glob("*.jpg"):
            f.unlink()
        # -ss before -i seeks to the nearest keyframe then decodes accurately with -accurate_seek (default).
        subprocess.run([
            "ffmpeg", "-loglevel", "error", "-y", "-ss", f"{t0:.3f}", "-to", f"{t1:.3f}", "-i", str(src),
            "-vf", f"fps={fps},scale='min({max_edge},iw)':-2", "-q:v", "2", str(TMP / "f_%06d.jpg"),
        ], check=True)
        for f in sorted(TMP.glob("*.jpg")):
            n = int(f.stem.split("_")[1]) - 1
            ts = t0 + n / fps
            s = sharpness(f)
            if s < blur:
                continue
            h = phash(f)
            if last_hash is not None and (h - last_hash) <= ph:
                continue
            last_hash = h
            dst = IMAGES / f"{e['id']}__{idx:05d}.jpg"
            shutil.move(str(f), dst)
            rows.append([dst.name, e["id"], f"{ts:.3f}", f"{s:.1f}"])
            idx += 1
            kept += 1
    return kept


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fps", type=float, default=2.0)
    ap.add_argument("--blur", type=float, default=60.0, help="min variance-of-Laplacian to keep a frame")
    ap.add_argument("--phash", type=int, default=6, help="max hamming distance to previous frame to count as duplicate")
    ap.add_argument("--max-edge", type=int, default=1920)
    ap.add_argument("--selection", type=Path, default=R.SELECTION_PATH)
    a = ap.parse_args()

    manifest = R.load_manifest()
    sel = R.load_selection(a.selection)
    if sel is None:
        raise SystemExit("configs/selection.yaml missing — run the audit on the laptop first")
    IMAGES.mkdir(parents=True, exist_ok=True)
    rows = []
    stills = R.selected_commons(manifest, sel)
    ok = sum(process_still(e, a.max_edge, rows) for e in stills)
    print(f"stills: {ok}/{len(stills)}")
    for e in R.selected_youtube(manifest, sel):
        n = process_video(e, R.youtube_ranges(sel, e), a.fps, a.blur, a.phash, a.max_edge, rows)
        print(f"video {e['id']}: {n} frames kept")
    with open(IMAGES / "frames.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["file", "source_id", "timestamp_s", "sharpness"])
        w.writerows(rows)
    shutil.rmtree(TMP, ignore_errors=True)
    print(f"{len(rows)} images → {IMAGES}")


if __name__ == "__main__":
    main()
