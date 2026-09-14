#!/usr/bin/env python3
"""Prune a 3DGS .ply: drop near-transparent and oversized Gaussians, optionally crop to a box.

  python scripts/cluster/prune_ply.py in.ply out.ply [--opacity 0.05] [--max-scale 2.0] [--crop x0,y0,z0,x1,y1,z1]
"""
from __future__ import annotations

import argparse

import numpy as np
from plyfile import PlyData, PlyElement


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("inp"); ap.add_argument("out")
    ap.add_argument("--opacity", type=float, default=0.05, help="min opacity after sigmoid")
    ap.add_argument("--max-scale", type=float, default=2.0, help="drop splats whose largest axis (world units) exceeds this")
    ap.add_argument("--crop", help="x0,y0,z0,x1,y1,z1 axis-aligned box to keep")
    a = ap.parse_args()

    ply = PlyData.read(a.inp)
    v = ply["vertex"].data
    keep = np.ones(len(v), bool)
    op = 1 / (1 + np.exp(-v["opacity"]))
    keep &= op >= a.opacity
    scale = np.exp(np.stack([v["scale_0"], v["scale_1"], v["scale_2"]], 1)).max(1)
    keep &= scale <= a.max_scale
    if a.crop:
        x0, y0, z0, x1, y1, z1 = map(float, a.crop.split(","))
        keep &= (v["x"] >= x0) & (v["x"] <= x1) & (v["y"] >= y0) & (v["y"] <= y1) & (v["z"] >= z0) & (v["z"] <= z1)
    el = PlyElement.describe(v[keep], "vertex")
    PlyData([el], text=False).write(a.out)
    print(f"{len(v)} → {keep.sum()} splats ({100 * keep.mean():.1f}% kept) → {a.out}")


if __name__ == "__main__":
    main()
