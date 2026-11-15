"""A small 3DS reader for the live Blender (5.2 ships no 3DS importer): meshes with their UVs and
per-object textured materials. This is how free_assets/flowers/Flowers.3ds came into scene.blend
(the `flower_*` objects, CLAUDE.md). From the MCP tool or the Python console, with the scene open:

    import sys; sys.path.insert(0, "recon/blender")
    import import_3ds; import_3ds.build("free_assets/flowers/Flowers.3ds", prefix="flower_", collection="Dakshineswar")

Objects land at the origin, one per 3DS object, named prefix + object name; each material is
prefix + material name with the texture packed and sampled through a UV Map node ("flower" for
the flowers) — an explicit layer, so the bake's smart-projected "bake" UVs never replace it.
"""
import os
import struct


def _cstr(b, p):
    e = b.index(b"\0", p)
    return b[p:e].decode("latin-1"), e + 1


def read3ds(path):
    """→ (objects, materials): objects = [{name, verts, faces, uv, fmat}], materials = {name: {diffuse, texture}}."""
    b = open(path, "rb").read()
    objs, mats = [], {}

    def chunks(p, end):
        while p + 6 <= end:
            cid, ln = struct.unpack_from("<HI", b, p)
            if ln < 6:
                break
            yield cid, p + 6, p + ln
            p += ln

    def color(p, end):
        for cid, s, e in chunks(p, end):
            if cid in (0x0011, 0x0012):
                return tuple(x / 255 for x in b[s:s + 3])
            if cid in (0x0010, 0x0013):
                return struct.unpack_from("<3f", b, s)
        return None

    def material(p, end):
        m = {"name": "", "diffuse": (0.8, 0.8, 0.8), "texture": None}
        for cid, s, e in chunks(p, end):
            if cid == 0xA000:
                m["name"], _ = _cstr(b, s)
            elif cid == 0xA020:
                m["diffuse"] = color(s, e) or m["diffuse"]
            elif cid == 0xA200:
                for c2, s2, e2 in chunks(s, e):
                    if c2 == 0xA300:
                        m["texture"], _ = _cstr(b, s2)
        mats[m["name"]] = m

    def trimesh(name, p, end):
        o = {"name": name, "verts": [], "faces": [], "uv": [], "fmat": {}}
        for cid, s, e in chunks(p, end):
            if cid == 0x4110:
                n, = struct.unpack_from("<H", b, s)
                o["verts"] = list(struct.iter_unpack("<3f", b[s + 2:s + 2 + 12 * n]))
            elif cid == 0x4140:
                n, = struct.unpack_from("<H", b, s)
                o["uv"] = list(struct.iter_unpack("<2f", b[s + 2:s + 2 + 8 * n]))
            elif cid == 0x4120:
                n, = struct.unpack_from("<H", b, s)
                o["faces"] = [f[:3] for f in struct.iter_unpack("<4H", b[s + 2:s + 2 + 8 * n])]
                for c2, s2, e2 in chunks(s + 2 + 8 * n, e):
                    if c2 == 0x4130:
                        mn, q = _cstr(b, s2)
                        k, = struct.unpack_from("<H", b, q)
                        for fi in struct.unpack_from(f"<{k}H", b, q + 2):
                            o["fmat"][fi] = mn
        objs.append(o)

    def walk(p, end):
        for cid, s, e in chunks(p, end):
            if cid in (0x4D4D, 0x3D3D):
                walk(s, e)
            elif cid == 0xAFFF:
                material(s, e)
            elif cid == 0x4000:
                name, q = _cstr(b, s)
                for c2, s2, e2 in chunks(q, e):
                    if c2 == 0x4100:
                        trimesh(name, s2, e2)

    walk(0, len(b))
    return objs, mats


def build(path, prefix="", collection=None, uv_layer="flower", roughness=0.75, names=None):
    """Make Blender meshes/objects/materials from a 3DS file (call inside Blender). `names` maps a
    3DS object name to the name used here (default: the 3DS name, lower-cased)."""
    import bpy
    import numpy as np
    objs, mats = read3ds(path)
    folder = os.path.dirname(os.path.abspath(path))
    coll = bpy.data.collections[collection] if collection else bpy.context.scene.collection
    made = []
    for o in objs:
        key = (names or {}).get(o["name"], o["name"].lower())
        src = mats[next(iter(set(o["fmat"].values())))] if o["fmat"] else None
        mname = prefix + (src["name"] if src else key)
        mat = bpy.data.materials.get(mname)
        if mat is None:
            mat = bpy.data.materials.new(mname)
            mat.use_nodes = True
            nt = mat.node_tree
            p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
            p.inputs["Roughness"].default_value = roughness
            if src and src["texture"] and os.path.exists(os.path.join(folder, src["texture"])):
                uv = nt.nodes.new("ShaderNodeUVMap")
                uv.uv_map = uv_layer
                ti = nt.nodes.new("ShaderNodeTexImage")
                ti.image = bpy.data.images.load(os.path.join(folder, src["texture"]), check_existing=True)
                ti.image.pack()
                nt.links.new(uv.outputs["UV"], ti.inputs["Vector"])
                nt.links.new(ti.outputs["Color"], p.inputs["Base Color"])
            elif src:
                p.inputs["Base Color"].default_value = (*src["diffuse"], 1.0)
        me = bpy.data.meshes.new(prefix + key)
        me.from_pydata(o["verts"], [], o["faces"])
        me.validate()
        me.update()
        if o["uv"]:
            layer = me.uv_layers.new(name=uv_layer)
            li = np.zeros(len(me.loops), dtype=np.int32)
            me.loops.foreach_get("vertex_index", li)
            layer.data.foreach_set("uv", np.array(o["uv"], dtype=np.float32)[li].ravel())
        me.materials.append(mat)
        me.shade_smooth()
        ob = bpy.data.objects.new(prefix + key, me)
        coll.objects.link(ob)
        made.append(ob)
    return made


if __name__ == "__main__":
    import sys
    objs, mats = read3ds(sys.argv[1])
    for m in mats.values():
        print("material", m)
    for o in objs:
        print(f"{o['name']:20} verts={len(o['verts'])} faces={len(o['faces'])} uv={len(o['uv'])} materials={sorted(set(o['fmat'].values()))}")
