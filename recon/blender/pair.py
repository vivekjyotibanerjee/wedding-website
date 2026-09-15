"""Side-by-side sheets of the reference model and ours from the same cameras (Blender's Python,
for its numpy):  blender -b -P recon/blender/pair.py -- <ref_dir> <web_dir> <out_dir> name...
Reads <ref_dir>/<name>.png and <web_dir>/web_<name>.png, writes <out_dir>/<name>.png (reference left)."""
import sys
from pathlib import Path

import bpy
import numpy as np

ref_dir, web_dir, out_dir, *names = sys.argv[sys.argv.index("--") + 1:]
Path(out_dir).mkdir(parents=True, exist_ok=True)
for name in names:
    ims = []
    for f in (Path(ref_dir) / f"{name}.png", Path(web_dir) / f"web_{name}.png"):
        im = bpy.data.images.load(str(f))
        w, h = im.size
        ims.append(np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4))
    h = min(i.shape[0] for i in ims)
    sheet = np.concatenate([i[:h] for i in ims], axis=1)
    out = bpy.data.images.new(name, sheet.shape[1], sheet.shape[0], alpha=True)
    out.pixels = sheet.ravel()
    out.filepath_raw = str(Path(out_dir) / f"{name}.png")
    out.file_format = "PNG"
    out.save()
    print(f"  wrote {out.filepath_raw}")
