"""Render the exported web model (the uncompressed .glb written by export_web.py) from the same
camera positions as the Cycles stills, to check that the baked materials survived the export.

  blender -b -P recon/blender/preview_web.py -- --glb recon/data/web/dakshineswar.glb \
          [--out recon/data/web/preview] [--only courtyard,mandap_close] [--res 960x540] [--samples 24]
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_dakshineswar as B  # noqa: E402


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--glb", default=str(B.ROOT / "data" / "web" / "dakshineswar.glb"))
    ap.add_argument("--out", default=str(B.ROOT / "data" / "web" / "preview"))
    ap.add_argument("--only", default="courtyard,mandap_close,natmandir,shiva_door")
    ap.add_argument("--res", default="960x540")
    ap.add_argument("--samples", type=int, default=24)
    a = ap.parse_args(argv)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    res = tuple(int(v) for v in a.res.lower().split("x"))

    B.reset_scene()
    bpy.ops.import_scene.gltf(filepath=a.glb)
    B.TEX = {}                       # the sky needs no generated maps
    B.setup_world_and_light()
    B.configure_render(res, a.samples)
    sc = bpy.context.scene
    sc.cycles.feature_set = "SUPPORTED"
    for name in a.only.split(","):
        loc, tgt, lens = B.STILLS[name]
        cam = B.add_camera("cam_" + name, loc, tgt, lens)
        sc.camera = cam
        sc.render.filepath = str(out / f"web_{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"  rendered {sc.render.filepath}")


if __name__ == "__main__":
    main()
