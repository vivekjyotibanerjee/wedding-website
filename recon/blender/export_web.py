"""Export the Blender model for the website: build the complex with build_dakshineswar.py, bake
every procedural Cycles material down to per-mesh albedo + tangent-normal + occlusion maps, and
write a WebP-textured .glb the Three.js scene loads, plus a landmarks JSON in the site's frame so
the camera path, the cards and the runtime props (diyas, string lights, lamps) are pinned to
computed positions rather than guesses.

  blender -b -P recon/blender/export_web.py -- [--out recon/data/web] [--landmarks src/scene/landmarks.json]
          [--texel-hi 0.015] [--texel-lo 0.04] [--max-res 2048] [--samples 8] [--ao-samples 24] [--ao-distance 2]
          [--quality 82] [--only REGEX] [--landmarks-only] [--dry]

The .glb written here is uncompressed; `bash recon/blender/render.sh web` runs this and then
gltf-transform (meshopt) into public/models/dakshineswar.glb, which is what the site loads.
Needs a Blender whose Cycles can bake: the Ubuntu/Debian `blender` package silently bakes black
(and lacks Draco/OIDN) — use the official build, e.g. BLENDER=~/opt/blender-4.0.2-linux-x64/blender.

Why bake: the glTF exporter only carries "Image Texture → Base Color" and "Image → Normal Map";
every pbr() material here multiplies in tint, stripes, beading and AO grime, and drape / garland
are fully procedural. Baking makes the export independent of how the shaders are built, so the
model can keep changing without touching the site.

Frame: the glb is exported Y-up, i.e. Three.js (x, y, z) = Blender (x, z, -y): east stays +x,
up is +y, and walking north is walking toward -z.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_dakshineswar as B  # noqa: E402

ROOT = B.ROOT                     # recon/
SITE = ROOT.parent                # the website repo

# Materials built by mat(): a flat colour (+ a noise bump that is dropped). Exported as factors.
PLAIN = {"gold", "cloth", "red_cloth", "carpet", "marigold", "copper", "dark", "earth", "green", "bank", "water",
         "bark", "palm_bark", "banana_stem", "terracotta", "soil", "iron", "lamp_glass"}
# Big flat surfaces whose look is the tiling map itself (brick joints, paving): not baked — the
# tinted source maps ship once and the mesh's metre-scaled cube UVs tile them at full resolution.
TILE = {"laterite", "stone", "paving", "path"}
# Painted stripes / beading that need ~2 cm texels to stay crisp; everything else is smooth stucco
# whose relief is barely visible at walking distance (5 cm texels, half-res normal map).
HI = {"spire", "dentil", "colonette", "striped", "dado", "column", "garland", "drape"}
# Leaf cards: the RGBA atlas ships as is (alpha-clipped), over the card's own UVs.
FOLIAGE = {"leaves", "frond", "banana"}
# Open sheets (drapes, leaf cards) and the garland: single-sided would vanish from behind.
DOUBLE_SIDED = {"drape", "garland", "green"} | FOLIAGE
# Ambient occlusion is baked for everything but the plain-colour props and shipped as the glTF
# occlusionTexture: for baked meshes over the same UVs, for the tiling ground/plinth meshes over a
# second, smart-projected layer. Metres per texel for the tiling class (the courtyard is 58 × 107 m).
AO_TEXEL = 0.10


def log(msg: str) -> None:
    print(f"  {msg}", flush=True)


# ------------------------------------------------------------------------------------------------
def build_scene() -> None:
    B.reset_scene()
    B.make_materials()
    B.load_trace()
    L = B.LAYOUT
    B.build_ground(L)
    B.build_boundary(L)
    B.build_shiva_row(L)
    B.build_navaratna(L)
    B.build_halls(L)
    B.build_mandap(L)
    B.build_trees(L)
    B.build_furniture(L)
    B.setup_world_and_light()
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.feature_set = "SUPPORTED"          # no render-time dicing: the web mesh is what is stored
    for m in bpy.data.materials:
        m.cycles.displacement_method = "BUMP"    # height maps become bump → baked into the normal map


def drop_prototypes() -> None:
    """Prototype objects parked at z = -100 (shiva temple, ratnas) never render; their mesh data
    lives on in the instances."""
    gone = [ob for ob in bpy.data.objects if ob.hide_render]
    for ob in gone:
        bpy.data.objects.remove(ob)
    log(f"dropped {len(gone)} prototype objects")


def apply_modifiers() -> None:
    """Freeze bevels (and the paving's no-op subsurf) into the mesh data once per unique mesh so the
    bake and the export see the same geometry; instances keep sharing one mesh."""
    dg = bpy.context.evaluated_depsgraph_get()
    done: dict[str, bpy.types.Mesh] = {}
    for ob in list(bpy.data.objects):
        if ob.type != "MESH":
            continue
        key = ob.data.name
        if key not in done:
            if ob.modifiers:
                ev = ob.evaluated_get(dg)
                me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
                me.name = key + "_web"
                done[key] = me
            else:
                done[key] = ob.data
        if ob.data is not done[key]:
            ob.data = done[key]
        ob.modifiers.clear()
        ob.cycles.use_adaptive_subdivision = False
    # orphaned originals
    for me in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(me)


def unique_meshes() -> list[tuple[bpy.types.Mesh, bpy.types.Object]]:
    seen, out = set(), []
    for ob in bpy.data.objects:
        if ob.type == "MESH" and ob.data.name not in seen:
            seen.add(ob.data.name)
            out.append((ob.data, ob))
    return out


def mesh_area(me: bpy.types.Mesh) -> float:
    return sum(p.area for p in me.polygons)


def pick_res(area: float, texel: float, max_res: int, min_res: int = 256) -> int:
    """Texture side for ~`texel` metres per texel at ~60 % packing efficiency, clamped to powers of 2."""
    side = math.sqrt(area / 0.6) / texel
    return int(min(max_res, max(min_res, 2 ** round(math.log2(max(side, 1))))))


def mesh_class(me: bpy.types.Mesh) -> str:
    names = {m.name for m in me.materials if m}
    if names <= PLAIN:
        return "plain"
    if names <= FOLIAGE:
        return "foliage"
    if names <= TILE:
        return "tile"
    return "hi" if names & HI else "lo"


def tile_spec(m: bpy.types.Material) -> dict:
    """Read a pbr() material back: which source maps it samples, the tint it multiplies in, the
    metres per tile of its Mapping node, roughness."""
    nt = m.node_tree
    spec = {"rough": nt.nodes["Principled BSDF"].inputs["Roughness"].default_value, "tint": (1.0, 1.0, 1.0)}
    for n in nt.nodes:
        if n.type == "MAPPING":
            spec["period"] = 1.0 / n.inputs["Scale"].default_value[0]
        elif n.type == "MIX_RGB" and n.blend_type == "MULTIPLY" and n.inputs["Color2"].is_linked is False \
                and n.inputs["Color1"].is_linked and n.inputs["Color1"].links[0].from_node.type == "TEX_IMAGE":
            spec["tint"] = tuple(n.inputs["Color2"].default_value[:3])
            spec["albedo"] = Path(bpy.path.abspath(n.inputs["Color1"].links[0].from_node.image.filepath))
        elif n.type == "NORMAL_MAP" and n.inputs["Color"].is_linked:
            spec["normal"] = Path(bpy.path.abspath(n.inputs["Color"].links[0].from_node.image.filepath))
    return spec


def tinted_copy(src: Path, tint, out_dir: Path) -> Path:
    """albedo × tint done in linear light, like the shader, saved once per (map, tint)."""
    import numpy as np
    key = "_".join(f"{c:.2f}" for c in tint)
    dst = out_dir / f"{src.stem}_{key}.png"
    if dst.exists():
        return dst
    img = bpy.data.images.load(str(src), check_existing=True)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    rgb = px[:, :3]
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4) * np.asarray(tint, dtype=np.float32)
    rgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    px[:, :3] = np.clip(rgb, 0, 1)
    o = bpy.data.images.new(dst.stem, w, h, alpha=False)
    o.colorspace_settings.name = "sRGB"
    o.pixels.foreach_set(px.ravel())
    o.filepath_raw = str(dst)
    o.file_format = "PNG"
    o.save()
    bpy.data.images.remove(o)
    return dst


def scale_cube_uv(me: bpy.types.Mesh, period: float) -> None:
    """'bake' UVs = the metre-scaled cube projection / period, so the source map tiles as in Cycles."""
    import numpy as np
    src = me.uv_layers["cube"]
    if "bake" in me.uv_layers:
        me.uv_layers.remove(me.uv_layers["bake"])
    dst = me.uv_layers.new(name="bake")
    uv = np.empty(len(me.loops) * 2, dtype=np.float32)
    src.data.foreach_get("uv", uv)
    dst.data.foreach_set("uv", uv / period)
    me.uv_layers.active = dst


# ------------------------------------------------------------------------------------------------
def unwrap(ob: bpy.types.Object, layer: str = "bake") -> None:
    """Second UV layer for the bake: the 'cube' layer overlaps by construction (per-face planar
    projection), so it can be sampled from but not baked into."""
    me = ob.data
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    if layer in me.uv_layers:
        me.uv_layers.remove(me.uv_layers[layer])
    uv = me.uv_layers.new(name=layer)
    me.uv_layers.active = uv
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    ob.select_set(False)


def bake_mesh(ob: bpy.types.Object, res: int, bake_dir: Path, samples: int, normal_res: int | None = None) -> dict[str, Path]:
    """Bake DIFFUSE (colour only — no lighting; the AO-grime node is part of the colour) and the
    tangent-space NORMAL of every material on this mesh into two images over the 'bake' UVs."""
    me = ob.data
    sc = bpy.context.scene
    sc.cycles.samples = samples
    bk = sc.render.bake
    bk.use_selected_to_active = False
    bk.margin = max(2, res // 256)
    bk.margin_type = "EXTEND"
    bk.use_pass_direct = bk.use_pass_indirect = False
    bk.use_pass_color = True
    bk.normal_space = "TANGENT"
    bk.target = "IMAGE_TEXTURES"

    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    me.uv_layers.active = me.uv_layers["bake"]
    me.uv_layers["bake"].active_render = True

    out: dict[str, Path] = {}
    for kind, btype in (("albedo", "DIFFUSE"), ("normal", "NORMAL")):
        r = res if kind == "albedo" else (normal_res or res)
        bk.margin = max(2, r // 256)
        img = bpy.data.images.new(f"{me.name}_{kind}", r, r, alpha=False)
        img.colorspace_settings.name = "sRGB" if kind == "albedo" else "Non-Color"
        nodes = []
        for m in me.materials:
            if m is None:
                continue
            nt = m.node_tree
            n = nt.nodes.new("ShaderNodeTexImage")
            n.image = img
            n.select = True
            nt.nodes.active = n
            nodes.append((nt, n))
        bpy.ops.object.bake(type=btype, pass_filter={"COLOR"} if btype == "DIFFUSE" else set(), margin=bk.margin, use_clear=True)
        path = bake_dir / f"{me.name}_{kind}.png"
        img.filepath_raw = str(path)
        img.file_format = "PNG"
        img.save()
        for nt, n in nodes:
            nt.nodes.remove(n)
        bpy.data.images.remove(img)
        out[kind] = path
    ob.select_set(False)
    return out


def bake_ao(ob: bpy.types.Object, res: int, bake_dir: Path, samples: int, layer: str, distance: float) -> Path:
    """Bake Cycles ambient occlusion (rays up to `distance` metres) over UV `layer` into one map."""
    me = ob.data
    sc = bpy.context.scene
    sc.cycles.samples = samples
    sc.world.light_settings.distance = distance
    bk = sc.render.bake
    bk.use_selected_to_active = False
    bk.margin = max(2, res // 256)
    bk.margin_type = "EXTEND"
    bk.target = "IMAGE_TEXTURES"
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    me.uv_layers.active = me.uv_layers[layer]
    me.uv_layers[layer].active_render = True
    img = bpy.data.images.new(f"{me.name}_ao", res, res, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    nodes = []
    for m in me.materials:
        if m is None:
            continue
        nt = m.node_tree
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        n.select = True
        nt.nodes.active = n
        nodes.append((nt, n))
    bpy.ops.object.bake(type="AO", margin=max(bk.margin, 6), use_clear=True)
    # slivers thinner than a texel (arch soffits, reveals) would sample the black background:
    # every texel the bake left at exactly 0 becomes "unoccluded" instead (real occlusion is
    # never exactly 0 outside a sealed cavity, which nobody sees anyway)
    import numpy as np
    px = np.empty(res * res * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    px[px[:, :3].max(1) < 0.5 / 255, :3] = 1.0
    img.pixels.foreach_set(px.ravel())
    path = bake_dir / f"{me.name}_ao.png"
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    for nt, n in nodes:
        nt.nodes.remove(n)
    bpy.data.images.remove(img)
    ob.select_set(False)
    return path


def gltf_output_group() -> bpy.types.NodeTree:
    """The exporter's special node group: an 'Occlusion' input on a group named 'glTF Material
    Output' becomes the material's occlusionTexture."""
    ng = bpy.data.node_groups.get("glTF Material Output")
    if ng is None:
        ng = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        ng.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return ng


def web_material(name: str, base, rough: float, metal: float, albedo: Path | None = None, normal: Path | None = None,
                 double_sided=False, alpha: float | None = None, ao: tuple[Path, str] | None = None,
                 albedo_alpha=False, uv_layer: str = "bake") -> bpy.types.Material:
    """A Principled material the glTF exporter carries verbatim: image (or constant) base colour,
    tangent normal map, constant roughness / metallic, optional occlusion map (`ao` = path, UV
    layer). albedo_alpha: the image's alpha drives the material alpha, clipped (leaf cards)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    p.inputs["Base Color"].default_value = (*base[:3], 1.0)
    if albedo is not None:
        img = bpy.data.images.load(str(albedo), check_existing=albedo_alpha)
        img.colorspace_settings.name = "sRGB"
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        uv = nt.nodes.new("ShaderNodeUVMap")
        uv.uv_map = uv_layer
        nt.links.new(uv.outputs["UV"], t.inputs["Vector"])
        nt.links.new(t.outputs["Color"], p.inputs["Base Color"])
        if albedo_alpha:
            img.alpha_mode = "STRAIGHT"
            nt.links.new(t.outputs["Alpha"], p.inputs["Alpha"])
            m.blend_method = "CLIP"
            m.alpha_threshold = 0.5
    if ao is not None:
        path, layer = ao
        img = bpy.data.images.load(str(path))
        img.colorspace_settings.name = "Non-Color"
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        uv = nt.nodes.new("ShaderNodeUVMap")
        uv.uv_map = layer
        nt.links.new(uv.outputs["UV"], t.inputs["Vector"])
        g = nt.nodes.new("ShaderNodeGroup")
        g.node_tree = gltf_output_group()
        nt.links.new(t.outputs["Color"], g.inputs["Occlusion"])
    if normal is not None:
        img = bpy.data.images.load(str(normal))
        img.colorspace_settings.name = "Non-Color"
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        uv = nt.nodes.new("ShaderNodeUVMap")
        uv.uv_map = uv_layer
        nt.links.new(uv.outputs["UV"], t.inputs["Vector"])
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.space = "TANGENT"
        nm.uv_map = uv_layer
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], p.inputs["Normal"])
    if alpha is not None:
        p.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND"
    m.use_backface_culling = not double_sided
    return m


def principled_of(m: bpy.types.Material):
    p = m.node_tree.nodes.get("Principled BSDF")
    base = p.inputs["Base Color"].default_value[:3]
    return base, p.inputs["Roughness"].default_value, p.inputs["Metallic"].default_value


# ------------------------------------------------------------------------------------------------
def landmarks() -> dict:
    """Key positions in the site's frame (Three.js: x east, y up, z south = -north)."""
    L = B.LAYOUT
    ch = L["courtyard_h"]
    sx_e, bx_w, mx = B.strip_extent(L)
    cx, cy = L["mandir_center"]
    S, ph, P = L["mandir_size"], L["mandir_platform_h"], L["mandir_platform"]
    (nx, ny), (nw, nd), nh = L["natmandir_center"], L["natmandir_size"], L["natmandir_h"]
    (vx, vy), (vw, vd), vh = L["vishnu_center"], L["vishnu_size"], L["vishnu_h"]
    ccx, ccy, cw, cl = L["courtyard_cx"], L["courtyard_cy"], L["courtyard_w"], L["courtyard_l"]
    wx = ccx - cw / 2                                    # west edge of the courtyard platform
    gap, half = L["shiva_gap"], L["shiva_ghat_gap"] / 2
    s1_arch_h, nat_arch = 5.6, (2.0, 4.3)                # build_navaratna / build_halls arch sizes

    def T(x, y, z):                                      # Blender (x, y, z) → Three (x, z, -y)
        return [round(x, 3), round(z, 3), round(-y, 3)]

    def spring(w, h):                                    # cusped_arch_poly's springing line
        return round(h - w / 2 * 0.85, 3)

    return {
        "frame": "three.js: x east, y up, z south; metres; origin = navaratna centre at ground",
        "ground": round(ch, 3),                          # courtyard platform top (y in three.js)
        "courtyard": {"center": T(ccx, ccy, ch), "size": [cw, cl]},
        "river_x": L["river_x"],
        "ghat": {"foot": T(wx - 9.0, ccy, -2.0), "top": T(wx, ccy, ch), "width": L["shiva_ghat_gap"] + 16},
        "shiva": {"x": L["shiva_x"], "plinth_top": round(ch + 1.0, 3), "size": L["shiva_size"], "pitch": gap, "count": 6,
                  "first_north": T(L["shiva_x"], ccy + half + gap * 0.5, ch + 1.0),
                  "first_south": T(L["shiva_x"], ccy - half - gap * 0.5, ch + 1.0),
                  "steps_foot_x": round(sx_e, 3)},
        "strip": {"west_x": round(sx_e, 3), "east_x": round(bx_w, 3), "center_x": round(mx, 3)},
        "mandap": {"center": T(mx, ccy, ch), "width": 5.8, "stage_top": round(ch + 0.62, 3), "canopy": round(ch + 0.62 + 0.09 + 3.0, 3),
                   "finial": round(ch + 0.62 + 0.09 + 3.0 + 0.16 + 1.92 + 0.55, 3)},
        "navaratna": {"center": T(cx, cy, ch), "size": S, "platform": P, "platform_top": round(ch + ph, 3),
                      "stair_foot": T(cx, cy - P / 2 - 9 * 0.4, ch), "stair_top": T(cx, cy - P / 2, ch + ph),
                      "wall_x": round(S / 2, 3), "core_x": round(S / 2 - 3.0, 3), "bay_pitch": round((S - 1.0) / 5, 3),
                      "stair_width": round(S * 0.7, 3), "stair_steps": 9, "stair_tread": 0.4,
                      "s1_h": 10.0, "arch": [1.7, s1_arch_h], "arch_spring": spring(1.7, s1_arch_h),
                      "top": round(ch + ph + 10.4 + 5.6 + 4.8 + 9.0, 3)},
        "natmandir": {"center": T(nx, ny, ch), "size": [nw, nd], "height": nh, "west_face_x": round(nx - nw / 2, 3),
                      "plinth_top": round(ch + 1.2, 3), "plinth_out": 1.5, "bays_west": 7, "bay_pitch": 3.0,
                      "arch": list(nat_arch), "arch_spring": spring(*nat_arch),
                      "stair_width": round(3 * 3.0 - 0.4, 3), "stair_steps": 6, "stair_tread": 0.36},
        "radhakanta": {"center": T(vx, vy, ch), "size": [vw, vd], "height": vh, "west_face_x": round(vx - vw / 2, 3)},
        "arcade": {"east_x": round(ccx + cw / 2 - L["arcade_depth"], 3), "height": L["arcade_h"]},
        "lamps": [T(*p) for p in B.PROPS["lamps"]],      # lantern centres
        "bells": [T(*p) for p in B.PROPS["bells"]],
        "sun": {"bearing": B.SUN_BEARING},
    }


# ------------------------------------------------------------------------------------------------
def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "data" / "web"))
    ap.add_argument("--landmarks", default=str(SITE / "src" / "scene" / "landmarks.json"))
    ap.add_argument("--bake-dir", default=str(ROOT / "data" / "web" / "bake"))
    ap.add_argument("--texel-hi", type=float, default=0.015, help="metres per texel for striped/beaded materials")
    ap.add_argument("--texel-lo", type=float, default=0.04, help="metres per texel for plain stucco")
    ap.add_argument("--max-res", type=int, default=2048)
    ap.add_argument("--samples", type=int, default=8, help="bake samples (the AO grime needs a few)")
    ap.add_argument("--ao-samples", type=int, default=32, help="samples for the occlusion maps")
    ap.add_argument("--ao-distance", type=float, default=2.0, help="occlusion ray length, metres")
    ap.add_argument("--quality", type=int, default=82, help="WebP quality")
    ap.add_argument("--only", default=None, help="regex: bake only the meshes whose name matches (a quick test glb)")
    ap.add_argument("--landmarks-only", action="store_true", help="build, write landmarks.json and stop")
    ap.add_argument("--dry", action="store_true", help="build and list the bake plan only")
    a = ap.parse_args(argv)
    out, bake_dir = Path(a.out), Path(a.bake_dir)
    out.mkdir(parents=True, exist_ok=True)
    bake_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    build_scene()
    drop_prototypes()
    apply_modifiers()

    plan = []
    for me, ob in unique_meshes():
        users = sum(1 for o in bpy.data.objects if o.type == "MESH" and o.data is me)
        area = mesh_area(me)
        cls = mesh_class(me)
        res = pick_res(area, a.texel_hi if cls == "hi" else a.texel_lo, a.max_res, 512 if cls == "hi" else 256) if cls in ("hi", "lo") else None
        plan.append((me, ob, users, area, cls, res))
    plan.sort(key=lambda r: -(r[3]))
    texels = 0
    n_tile = sum(1 for p in plan if p[4] == "tile")
    log(f"{'mesh':30s} {'users':>5s} {'faces':>6s} {'area m²':>9s} {'class':>5s} {'bake':>5s}  materials")
    for me, ob, users, area, cls, res in plan:
        log(f"{me.name:30s} {users:5d} {len(me.polygons):6d} {area:9.1f} {cls:>5s} {res or '-':>5}  {', '.join(m.name for m in me.materials if m)}")
        if res:
            texels += res * res * (2 if cls == "hi" else 1.25)
    log(f"{len(plan)} unique meshes, {sum(1 for p in plan if p[5])} baked (+ occlusion for those and {n_tile} tiling), {texels / 1e6:.0f} Mtexel incl. normal maps")
    if a.dry:
        return
    Path(a.landmarks).parent.mkdir(parents=True, exist_ok=True)
    Path(a.landmarks).write_text(json.dumps(landmarks(), indent=2) + "\n")
    log(f"landmarks → {a.landmarks}")
    if a.landmarks_only:
        return
    import re
    only = re.compile(a.only) if a.only else None

    # bake, then swap every mesh's materials for export-clean ones
    n_baked = 0
    tile_mats: dict[str, bpy.types.Material] = {}
    for me, ob, users, area, cls, res in plan:
        base, rough, metal = principled_of(me.materials[0]) if me.materials and me.materials[0] else ((0.8, 0.8, 0.8), 0.8, 0.0)
        names = {m.name for m in me.materials if m}
        if cls == "foliage":
            m0 = next(m for m in me.materials if m)
            tex = next(n for n in m0.node_tree.nodes if n.type == "TEX_IMAGE")
            me.uv_layers["cube"].name = "bake"
            me.materials.clear()
            me.materials.append(bpy.data.materials.get("web_" + m0.name) or web_material(
                "web_" + m0.name, (1, 1, 1), 0.75, 0.0, Path(bpy.path.abspath(tex.image.filepath)), double_sided=True, albedo_alpha=True))
            continue
        if cls == "tile":
            m0 = next(m for m in me.materials if m)
            spec = tile_spec(m0)
            scale_cube_uv(me, spec["period"])
            ao = None
            if only is None or only.search(me.name):
                t1 = time.time()
                unwrap(ob, "ao")
                ao_res = pick_res(area, AO_TEXEL, 1024, 128)
                ao = (bake_ao(ob, ao_res, bake_dir, a.ao_samples, "ao", a.ao_distance), "ao")
                me.uv_layers.active = me.uv_layers["bake"]
                log(f"occlusion {me.name} @ {ao_res} ({time.time() - t1:.0f} s)")
            # the tiling look is shared, the occlusion map is per mesh
            wm = web_material(f"web_{m0.name}_{me.name}" if ao else "web_" + m0.name, (1, 1, 1), spec["rough"], 0.0,
                              tinted_copy(spec["albedo"], spec["tint"], bake_dir), spec["normal"], ao=ao) \
                if ao or m0.name not in tile_mats else tile_mats[m0.name]
            if not ao:
                tile_mats[m0.name] = wm
            me.materials.clear()
            me.materials.append(wm)
            me.uv_layers.remove(me.uv_layers["cube"])
            continue
        if res is None or (only is not None and not only.search(me.name)):
            mats = {}
            for i, m in enumerate(me.materials):
                if m is None:
                    continue
                if m.name not in mats:
                    b, r, mt = principled_of(m)
                    mats[m.name] = bpy.data.materials.get("web_" + m.name) or web_material(
                        "web_" + m.name, b, r, mt, double_sided=m.name in DOUBLE_SIDED)
                me.materials[i] = mats[m.name]
            continue
        t1 = time.time()
        unwrap(ob)
        maps = bake_mesh(ob, res, bake_dir, a.samples, normal_res=res if cls == "hi" else max(256, res // 2))
        ao = bake_ao(ob, max(128, res // 2), bake_dir, a.ao_samples, "bake", a.ao_distance)
        n_baked += 1
        log(f"baked {me.name} @ {res} ({time.time() - t1:.0f} s, {n_baked} done)")
        wm = web_material("web_" + me.name, (1, 1, 1), rough, metal, maps["albedo"], maps["normal"],
                          double_sided=bool(names & DOUBLE_SIDED), alpha=0.7 if "drape" in names else None, ao=(ao, "bake"))
        me.materials.clear()
        me.materials.append(wm)
        me.uv_layers.remove(me.uv_layers["cube"])       # only the bake UVs ship

    # the water gets a hint of reflection in the browser; the exporter carries these as factors
    for m in bpy.data.materials:
        if m.name == "web_water":
            p = m.node_tree.nodes["Principled BSDF"]
            p.inputs["Roughness"].default_value = 0.15
            p.inputs["Metallic"].default_value = 0.3

    glb = out / "dakshineswar.glb"
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(glb), export_format="GLB", export_yup=True, export_apply=True,
        use_renderable=True, use_visible=True, export_materials="EXPORT", export_texcoords=True,
        export_normals=True, export_tangents=False, export_extras=False, export_cameras=False, export_lights=False,
        export_image_format="WEBP", export_image_quality=a.quality,
        export_draco_mesh_compression_enable=False,   # geometry is compressed afterwards (render.sh web → meshopt)
    )
    log(f"→ {glb} ({glb.stat().st_size / 1e6:.1f} MB) in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
