"""Render the SketchUp reference model (the 3D Warehouse Dakshineswar, exported to Collada with
its textures) from any camera, to study its detail against build_dakshineswar.py.

  # once: import the .dae + textures (unzipped side by side) and save a .blend
  blender -b -P recon/blender/ref_views.py -- --dae recon/data/reference/skp/skp_911.dae --save

  # then: any number of views in one run (metres, Blender frame: x east, y north, z up)
  blender -b -P recon/blender/ref_views.py -- \
      --view front=8,-40,6/8,8,10/35 --view dome=30,-20,30/8,8,20/85 \
      --elev south --plan --orbit 8 [--res 1280x720] [--samples 32] [--out recon/data/reference/skp/views]

  --view  name=cam_x,cam_y,cam_z/target_x,target_y,target_z[/lens_mm]   perspective still
  --site  --view cameras are in our model's Blender frame (navaratna at 0,0, ground z 1.2, as
          preview_web.py --view takes them) and are mapped into the reference's, so the same
          --view strings give side-by-side pairs
  --elev  south|north|east|west   orthographic elevation of the temple block
  --plan                          orthographic plan from above
  --orbit N                       N stills around the temple block at 30° elevation
  --bounds                        print every object's world bounds and quit
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BLEND = ROOT / "data" / "reference" / "skp" / "ref.blend"

# The temple block (everything but the Google Earth ground) as imported: bounds of the massing.
BLOCK_LO = Vector((-10.1, -33.5, 0.0))
BLOCK_HI = Vector((21.8, 48.3, 26.1))


# Our model's Blender frame → the reference's: the reference is yawed 8.7° (its walls' normals),
# its navaratna core is centred at (7.98, 8.46) and its ground is at z 0 (ours 1.2).
SITE_YAW = math.radians(8.7)
SITE_ORIGIN = Vector((7.98, 8.46, -1.2))


def site_to_ref(p) -> Vector:
    x, y, z = p
    c, s = math.cos(SITE_YAW), math.sin(SITE_YAW)
    return Vector((c * x - s * y, s * x + c * y, z)) + SITE_ORIGIN


def block_center() -> Vector:
    return (BLOCK_LO + BLOCK_HI) / 2


def fix_images(folder: Path) -> None:
    """Point every texture at the file of that name in `folder` (the Collada importer stores bare
    relative names, which a save-as then remaps wrongly); absolute paths, no remapping."""
    for im in bpy.data.images:
        if im.source != "FILE":
            continue
        cand = folder / Path(im.filepath).name
        if cand.exists():
            im.filepath = str(cand)
            im.reload()
        else:
            print(f"  texture missing: {im.filepath}")


def import_dae(dae: Path) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.collada_import(filepath=str(dae))
    fix_images(dae.parent)                          # textures were unzipped next to the .dae
    for m in bpy.data.materials:                    # SketchUp maps are plain colour: no gloss
        if m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED":
                    n.inputs["Roughness"].default_value = 0.9
                    n.inputs["Specular IOR Level"].default_value = 0.2


def setup_light() -> None:
    sc = bpy.context.scene
    w = bpy.data.worlds.new("World")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.55, 0.7, 0.95, 1)
    bg.inputs["Strength"].default_value = 0.8
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.5
    sun.angle = math.radians(1.5)
    ob = bpy.data.objects.new("sun", sun)
    d = Vector((-0.4, -0.5, 0.75)).normalized()     # from the south-west, high
    ob.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    sc.collection.objects.link(ob)


def configure_render(res, samples) -> None:
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "Standard"


def camera(name, loc, target, lens=35.0, ortho_scale=None):
    cd = bpy.data.cameras.new(name)
    cd.clip_end = 3000
    if ortho_scale:
        cd.type = "ORTHO"
        cd.ortho_scale = ortho_scale
    else:
        cd.lens = lens
    cam = bpy.data.objects.new(name, cd)
    cam.location = Vector(loc)
    bpy.context.scene.collection.objects.link(cam)
    d = Vector(target) - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return cam


def fit(w, h, res, margin=1.1):
    """Orthographic scale (frame width) that fits w x h metres in a res-shaped frame."""
    return max(w, h * res[0] / res[1]) * margin


def render(cam, path: Path) -> None:
    sc = bpy.context.scene
    sc.camera = cam
    sc.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print(f"  rendered {path}")


def print_bounds() -> None:
    rows = []
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        lo = Vector(map(min, *bb))
        hi = Vector(map(max, *bb))
        mats = ",".join(m.name for m in o.data.materials if m)
        rows.append((-(hi - lo).length, o.name, tuple(round(v, 2) for v in lo), tuple(round(v, 2) for v in hi), len(o.data.polygons), mats))
    for r in sorted(rows):
        print(f"{r[1]:36s} lo={r[2]} hi={r[3]} faces={r[4]} mats={r[5][:70]}")


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--dae")
    ap.add_argument("--blend", default=str(DEFAULT_BLEND))
    ap.add_argument("--save", action="store_true", help="save the imported .dae as --blend")
    ap.add_argument("--out", default=str(DEFAULT_BLEND.parent / "views"))
    ap.add_argument("--res", default="1280x720")
    ap.add_argument("--samples", type=int, default=32)
    ap.add_argument("--view", action="append", default=[])
    ap.add_argument("--elev", action="append", default=[])
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--orbit", type=int, default=0)
    ap.add_argument("--bounds", action="store_true")
    ap.add_argument("--site", action="store_true")
    a = ap.parse_args(argv)

    if a.dae:
        import_dae(Path(a.dae))
        if a.save:
            bpy.ops.wm.save_as_mainfile(filepath=a.blend, relative_remap=False)
            print(f"  saved {a.blend}")
    else:
        bpy.ops.wm.open_mainfile(filepath=a.blend)
        fix_images(Path(a.blend).parent)
    if a.bounds:
        print_bounds()
        return

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    res = tuple(int(v) for v in a.res.lower().split("x"))
    setup_light()
    configure_render(res, a.samples)
    c = block_center()
    size = BLOCK_HI - BLOCK_LO

    for spec in a.view:
        name, rest = spec.split("=", 1)
        parts = rest.split("/")
        loc = tuple(float(v) for v in parts[0].split(","))
        tgt = tuple(float(v) for v in parts[1].split(","))
        lens = float(parts[2]) if len(parts) > 2 else 35.0
        if a.site:
            loc, tgt = site_to_ref(loc), site_to_ref(tgt)
        render(camera("cam_" + name, loc, tgt, lens), out / f"{name}.png")

    for side in a.elev:
        far = 400
        off = {"south": (0, -far, 0), "north": (0, far, 0), "east": (far, 0, 0), "west": (-far, 0, 0)}[side]
        tgt = Vector((c.x, c.y, size.z / 2))
        extent = (size.x if side in ("south", "north") else size.y)
        cam = camera("cam_elev_" + side, tgt + Vector(off), tgt, ortho_scale=fit(extent, size.z, res))
        render(cam, out / f"elev_{side}.png")

    if a.plan:
        cam = camera("cam_plan", (c.x, c.y, 400), (c.x, c.y, 0), ortho_scale=fit(size.x, size.y, res))
        cam.rotation_euler = (0, 0, 0)              # straight down, north up, east right
        render(cam, out / "plan.png")

    for i in range(a.orbit):
        th = 2 * math.pi * i / a.orbit
        r = max(size.x, size.y) * 1.2
        loc = (c.x + r * math.cos(th), c.y + r * math.sin(th), size.z * 0.6 + r * math.tan(math.radians(30)) * 0.5)
        render(camera(f"cam_orbit_{i}", loc, (c.x, c.y, size.z * 0.35), 35), out / f"orbit_{i:02d}.png")


if __name__ == "__main__":
    main()
