"""Report what a hand-edited snapshot changed against the script — how an edit made in Blender
gets back into build_dakshineswar.py, which stays the source of the model.

  blender -b -P recon/blender/diff_blend.py -- FILE [--json OUT] [--keep-added]
  bash recon/blender/render.sh diff FILE [--json OUT] [--keep-added]

Rebuilds the scene from the script, opens FILE (a snapshot saved by `render.sh blend`, edited in
Blender and saved under another name) and compares the two by object name — objects moved
(Δ location / rotation / scale in the Blender frame the script is written in), deleted, added,
whose mesh was edited (a mesh is compared once however many objects share it), whose material
slots were swapped, and materials whose Principled colour / roughness / metallic changed. The
report is what gets ported into the script (a moved lamp → its entry in build_furniture, a taller
column → the constant); after that the .blend is disposable.

The snapshot carries the sha1 of the script that built it (`stamp_scene`); when the script has
changed since, the report says so — script changes would otherwise read as edits.

--keep-added writes each added object, with its mesh and materials, to blender/assets/NAME.blend
and prints the `ASSETS` entry that makes every build append it: the path for geometry the script
cannot write (a sculpted or imported prop). Anything the walk stands on is not such a thing.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_dakshineswar as B  # noqa: E402

TOL_LOC, TOL_ROT, TOL_SCALE = 1e-3, 0.01, 1e-3      # metres, degrees, ratio
MOD_ATTRS = ("width", "segments", "angle_limit", "levels", "render_levels")


def principled(m):
    p = m.node_tree.nodes.get("Principled BSDF") if m.use_nodes and m.node_tree else None
    if p is None:
        return tuple(round(v, 3) for v in m.diffuse_color[:3]), round(m.roughness, 3), round(m.metallic, 3)
    return (tuple(round(v, 3) for v in p.inputs["Base Color"].default_value[:3]),
            round(p.inputs["Roughness"].default_value, 3), round(p.inputs["Metallic"].default_value, 3))


def snapshot() -> dict:
    """Everything the comparison looks at, as plain Python (open_mainfile wipes bpy.data)."""
    bpy.context.view_layer.update()                     # headless: matrix_world is stale until then
    meshes, objects = {}, {}
    for ob in bpy.data.objects:
        if ob.type != "MESH" or ob.hide_render:        # prototypes parked at z = -100 never render
            continue
        me = ob.data
        if me.name not in meshes:
            co = np.empty(len(me.vertices) * 3, dtype=np.float32)
            me.vertices.foreach_get("co", co)
            meshes[me.name] = {"verts": len(me.vertices), "faces": len(me.polygons),
                               "hash": hashlib.sha1(np.round(co, 4).tobytes()).hexdigest()[:12]}
        loc, rot, scale = ob.matrix_world.decompose()
        objects[ob.name] = {
            "loc": [round(v, 4) for v in loc], "rot": [round(math.degrees(v), 3) for v in rot.to_euler()],
            "scale": [round(v, 4) for v in scale], "mesh": me.name,
            "parent": ob.parent.name if ob.parent else None,
            "local": [round(v, 4) for row in ob.matrix_local for v in row],
            "materials": [m.name if m else None for m in me.materials],
            "modifiers": [(m.type, tuple(round(getattr(m, a), 4) if isinstance(getattr(m, a), float) else getattr(m, a)
                                         for a in MOD_ATTRS if hasattr(m, a))) for m in ob.modifiers],
        }
    materials = {m.name: principled(m) for m in bpy.data.materials if m.users}
    return {"objects": objects, "meshes": meshes, "materials": materials}


def delta(a, b, tol):
    d = [round(y - x, 4) for x, y in zip(a, b)]
    return d if any(abs(v) > tol for v in d) else None


def compare(built: dict, edited: dict) -> dict:
    bo, eo = built["objects"], edited["objects"]
    r = {"moved": [], "deleted": sorted(set(bo) - set(eo)), "added": [], "duplicated": [], "mesh_edited": [],
         "slots_changed": [], "modifiers_changed": [], "materials_changed": [], "unchanged": 0}
    script_meshes = {m["hash"]: name for name, m in built["meshes"].items()}
    seen_meshes = set()
    for name in sorted(eo):
        e = eo[name]
        if name not in bo:
            m = edited["meshes"][e["mesh"]]
            entry = {"object": name, "mesh": e["mesh"], "verts": m["verts"], "faces": m["faces"],
                     "materials": e["materials"], "loc": e["loc"], "rot": e["rot"], "parent": e["parent"]}
            if m["hash"] in script_meshes:                    # Shift+D of a script object: a call, not an asset
                entry["of"] = script_meshes[m["hash"]]
                r["duplicated"].append(entry)
            else:
                r["added"].append(entry)
            continue
        b = bo[name]
        changed = False
        move = {k: v for k, v in (("loc", delta(b["loc"], e["loc"], TOL_LOC)),
                                  ("rot", delta(b["rot"], e["rot"], TOL_ROT)),
                                  ("scale", delta(b["scale"], e["scale"], TOL_SCALE))) if v}
        if move and e["parent"] and e["parent"] == b["parent"] and e["local"] == b["local"]:
            move = {}                                         # carried by its parent (a lamp's glass)
        if move:
            r["moved"].append({"object": name, **move, "now": e["loc"]})
            changed = True
        bm, em = built["meshes"][b["mesh"]], edited["meshes"][e["mesh"]]
        if (bm["verts"], bm["faces"], bm["hash"]) != (em["verts"], em["faces"], em["hash"]) and e["mesh"] not in seen_meshes:
            seen_meshes.add(e["mesh"])
            users = sorted(n for n, o in eo.items() if o["mesh"] == e["mesh"] and n in bo)
            r["mesh_edited"].append({"mesh": e["mesh"], "objects": users, "was": [bm["verts"], bm["faces"]],
                                     "now": [em["verts"], em["faces"]]})
            changed = True
        if b["materials"] != e["materials"]:
            r["slots_changed"].append({"object": name, "was": b["materials"], "now": e["materials"]})
            changed = True
        if b["modifiers"] != e["modifiers"]:
            r["modifiers_changed"].append({"object": name, "was": b["modifiers"], "now": e["modifiers"]})
            changed = True
        r["unchanged"] += not changed
    for name, vals in sorted(edited["materials"].items()):
        if name in built["materials"] and built["materials"][name] != vals:
            r["materials_changed"].append({"material": name, "was": built["materials"][name], "now": vals})
    return r


def fmt3(v):
    return "(" + ", ".join(f"{x:+.3f}" if isinstance(x, float) and not x.is_integer() else f"{x:+g}" for x in v) + ")"


def report(r: dict, stamp_ok: bool | None) -> None:
    p = lambda s: print(f"  {s}")                                          # noqa: E731
    if stamp_ok is None:
        p("WARNING: the snapshot is unstamped (saved before `render.sh blend` stamped snapshots): the "
          "script may have changed since, and its changes would show below as edits")
    elif not stamp_ok:
        p("WARNING: build_dakshineswar.py has changed since this snapshot was saved: script changes "
          "show below as edits — re-snapshot and redo the edits, or read this with that in mind")
    if r["moved"]:
        p(f"moved ({len(r['moved'])}):")
        for m in r["moved"]:
            bits = [f"Δloc {fmt3(m['loc'])}" if "loc" in m else "", f"Δrot° {fmt3(m['rot'])}" if "rot" in m else "",
                    f"Δscale {fmt3(m['scale'])}" if "scale" in m else ""]
            p(f"    {m['object']:<28} {'  '.join(b for b in bits if b)}   → at ({', '.join(f'{v:.2f}' for v in m['now'])})")
    if r["deleted"]:
        p(f"deleted ({len(r['deleted'])}): {', '.join(r['deleted'])}")
    if r["added"]:
        p(f"added ({len(r['added'])}):")
        for a in r["added"]:
            p(f"    {a['object']:<28} mesh {a['mesh']} ({a['verts']} verts, {a['faces']} faces), "
              f"materials {a['materials']}, at ({', '.join(f'{v:.2f}' for v in a['loc'])}) rot z {a['rot'][2]:g}°")
    if r["duplicated"]:
        p(f"duplicated ({len(r['duplicated'])}):  copies of script objects — another call in the script, not an asset")
        for a in r["duplicated"]:
            p(f"    {a['object']:<28} the {a['of']} mesh, at ({', '.join(f'{v:.2f}' for v in a['loc'])}) rot z {a['rot'][2]:g}°"
              + (f", child of {a['parent']}" if a["parent"] else ""))
    if r["mesh_edited"]:
        p(f"mesh edited ({len(r['mesh_edited'])}):")
        for m in r["mesh_edited"]:
            who = ", ".join(m["objects"][:6]) + (" …" if len(m["objects"]) > 6 else "")
            p(f"    {m['mesh']:<28} {m['was'][0]} → {m['now'][0]} verts, {m['was'][1]} → {m['now'][1]} faces   ({who})")
    if r["slots_changed"]:
        p(f"material slots changed ({len(r['slots_changed'])}):")
        for s in r["slots_changed"]:
            p(f"    {s['object']:<28} {s['was']} → {s['now']}")
    if r["modifiers_changed"]:
        p(f"modifiers changed ({len(r['modifiers_changed'])}):")
        for s in r["modifiers_changed"]:
            p(f"    {s['object']:<28} {s['was']} → {s['now']}")
    if r["materials_changed"]:
        p(f"materials changed ({len(r['materials_changed'])}):  (base colour, roughness, metallic)")
        for s in r["materials_changed"]:
            p(f"    {s['material']:<28} {s['was']} → {s['now']}")
    n_changes = sum(len(r[k]) for k in ("moved", "deleted", "added", "duplicated", "mesh_edited", "slots_changed", "modifiers_changed", "materials_changed"))
    p(f"unchanged: {r['unchanged']} objects" + (" — the snapshot matches the script" if not n_changes and stamp_ok else ""))


def keep_added(r: dict, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for a in r["added"]:
        ob = bpy.data.objects[a["object"]]
        mw = ob.matrix_world.copy()
        ob.parent = None
        ob.matrix_world = mw
        stem = B.base_name(ob.name).replace(" ", "_")
        path = out_dir / f"{stem}.blend"
        bpy.data.libraries.write(str(path), {ob}, fake_user=True, compress=True)
        print(f"  wrote {path.relative_to(B.ROOT)} ({path.stat().st_size // 1024} KB)")
        print(f"    ASSETS entry:  (\"{stem}\", \"{ob.name}\", None, {math.radians(a['rot'][2]):.4f}),   # as placed in the file")


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("blend")
    ap.add_argument("--json", default=None, help="also write the report here")
    ap.add_argument("--keep-added", action="store_true", help="save each added object to blender/assets/NAME.blend")
    a = ap.parse_args(argv)
    blend = Path(a.blend).resolve()
    if not blend.is_file():
        raise SystemExit(f"no such file: {blend}")

    B.build_all(B.LAYOUT)
    built = snapshot()
    print(f"  built {len(built['objects'])} objects from the script")
    bpy.ops.wm.open_mainfile(filepath=str(blend), load_ui=False)
    edited = snapshot()
    stamp = bpy.context.scene.get("script_sha1")
    stamp_ok = None if stamp is None else stamp == B.script_sha1()
    print(f"  opened {blend.name}: {len(edited['objects'])} objects")
    r = compare(built, edited)
    report(r, stamp_ok)
    if a.keep_added and r["added"]:
        keep_added(r, B.ASSET_DIR)
    if a.json:
        Path(a.json).write_text(json.dumps({"blend": str(blend), "script_stamp_matches": stamp_ok, **r}, indent=1))
        print(f"  → {a.json}")


if __name__ == "__main__":
    main()
