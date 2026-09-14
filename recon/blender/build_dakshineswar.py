"""Build the Dakshineswar complex (navaratna, courtyard, 12 Shiva temples, nat-mandir, Radhakanta
temple, boundary arcades, ghat) in Blender 4.0 headlessly, save a .blend and render previews.

  blender -b -P recon/blender/build_dakshineswar.py -- --out recon/data/blender \
          [--mode massing|full] [--render none|stills|turntable|both] [--res 1280x720] \
          [--samples 64] [--frames 48] [--only still,still]

Frame: metres, +X east, +Y north, +Z up, origin at the navaratna's centre — the same frame as
configs/layout.geojson and the landmarks traced with scripts/laptop/trace.py. If
configs/layout.inner.yaml exists, its point landmarks override the LAYOUT defaults below.

Look: the real temple (cream stucco, maroon bands, red-plastered chala roofs, ribbed spires) — the CG
videos only settle how the buildings sit. Geometry rules:
  * everything is analytic geometry via from_pydata; repeats share meshes (instances);
  * no booleans — arches are pierced walls (piers + spandrels + reveals) built by `sheet()`, so every
    opening goes through into a real room/corridor;
  * rings, stairs and mouldings are single closed solids (no overlapping boxes → no z-fighting);
  * high-frequency relief (stucco grain, brick joints, spire stripes, dentils, dado bands) lives in
    the shaders: generated albedo/normal/height maps (blender/textures.py) through a per-face
    cube-projection UV layer, plus procedural stripes. The only true displacement is the courtyard
    paving, diced at render time by Cycles adaptive subdivision (nothing dense is stored).
Sky is an HDRI (data/blender/textures/sky.hdr, fetched by render.sh) with a matched sun lamp.
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import textures  # noqa: E402

# ------------------------------------------------------------------------------------------------
# Layout (metres). Read off data/reference/satellite.png de-rotated onto a 10 m grid centred on the
# navaratna: the walled complex is ≈ 58 × 107 m, the navaratna sits 10 m east of its centreline,
# and the nat-mandir (south) and Radhakanta block (north) are ≈ 18 m wide blocks that nearly abut
# the navaratna platform, a colonnade's width short of the east range. The "courtyard" is therefore
# the ≈ 18 m strip between those blocks and the Shiva row on the west, plus the aprons. 12 aat-chala
# Shiva temples ≈ 6 m square at ≈ 7.9 m pitch along the west edge, two groups of six with the ghat
# opening between them.
# ------------------------------------------------------------------------------------------------
LAYOUT = {
    "courtyard_w": 58.0, "courtyard_l": 107.0, "courtyard_cx": -9.5, "courtyard_cy": 3.0,
    "courtyard_h": 1.2,                  # raised platform above the river-side ground
    "mandir_center": (0.0, 0.0), "mandir_size": 14.0, "mandir_platform": 22.0, "mandir_platform_h": 2.6,
    # nat-mandir: 7 arched bays on the long (E/W) faces, 3 on the short ones (M36537551, M36512944)
    "natmandir_center": (1.5, -27.0), "natmandir_size": (18.0, 24.5), "natmandir_h": 7.4,
    "vishnu_center": (1.5, 29.5), "vishnu_size": (18.0, 30.0), "vishnu_h": 10.4,
    "shiva_x": -32.0, "shiva_size": 6.2, "shiva_gap": 7.9, "shiva_ghat_gap": 9.0,
    # boundary ranges are single-storey colonnades (M69552267 inside, M69552273/4 outside)
    "arcade_depth": 6.5, "arcade_h": 5.2,
    "river_x": -41.0,
}
ROOT = Path(__file__).resolve().parents[1]
TEX_DIR = ROOT / "data" / "blender" / "textures"
SUN_BEARING = 205.0          # compass bearing the sun shines FROM (SSW afternoon at 22°N)


def load_trace() -> None:
    p = ROOT / "configs" / "layout.inner.yaml"
    if not p.exists():
        return
    try:
        import yaml  # not bundled with Blender; only used if available
    except ImportError:
        print("  layout.inner.yaml present but PyYAML missing in Blender's python — using defaults")
        return
    lm = (yaml.safe_load(p.read_text()) or {}).get("landmarks") or {}
    for k in ("mandir_center", "natmandir_center"):
        if k in lm and len(lm[k]) == 2:
            LAYOUT[k] = tuple(lm[k])
    if "shiva_row_north" in lm and "shiva_row_south" in lm:
        LAYOUT["shiva_x"] = (lm["shiva_row_north"][0] + lm["shiva_row_south"][0]) / 2
    print(f"  layout.inner.yaml applied: {sorted(k for k in lm)}")


# ------------------------------------------------------------------------------------------------
# Scene helpers
# ------------------------------------------------------------------------------------------------
COL = None
MATS: dict[str, bpy.types.Material] = {}
TEX: dict[str, dict] = {}


def reset_scene() -> None:
    global COL
    bpy.ops.wm.read_factory_settings(use_empty=True)
    COL = bpy.data.collections.new("Dakshineswar")
    bpy.context.scene.collection.children.link(COL)


def _image(path: Path, data: bool) -> bpy.types.Image:
    img = bpy.data.images.load(str(path), check_existing=True)
    img.colorspace_settings.name = "Non-Color" if data else "sRGB"
    return img


def mat(name: str, rgb, rough=0.7, metal=0.0, bump=0.0, bump_scale=40.0) -> bpy.types.Material:
    """Plain material (optionally with a procedural bump) for things that never get close to camera."""
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*rgb, 1.0)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if bump > 0:
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = bump_scale
        noise.inputs["Detail"].default_value = 6
        b = nt.nodes.new("ShaderNodeBump")
        b.inputs["Strength"].default_value = bump
        nt.links.new(noise.outputs["Fac"], b.inputs["Height"])
        nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
    MATS[name] = m
    return m


def _math(nt, op, a, b=None):
    """Math node: `a` is a socket, `b` a socket or a constant (None for unary ops). Returns the result."""
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    nt.links.new(a, n.inputs[0])
    if b is None:
        pass
    elif hasattr(b, "is_output"):
        nt.links.new(b, n.inputs[1])
    else:
        n.inputs[1].default_value = b
    return n.outputs[0]


def _stripe_mask(nt, coord, period, duty, offset=0.0, zmax=None):
    """0/1 mask that is 1 inside bands of width duty·period repeating every `period` along a scalar
    coordinate socket (optionally only below zmax). Painted stripes instead of ring geometry."""
    t = _math(nt, "SUBTRACT", coord, offset)
    t = _math(nt, "DIVIDE", t, period)
    t = _math(nt, "FRACT", t)
    m = _math(nt, "LESS_THAN", t, duty)
    if zmax is not None:
        m = _math(nt, "MULTIPLY", m, _math(nt, "LESS_THAN", coord, zmax))
    return m


def pbr(name: str, tex_set: str, tint=(1.0, 1.0, 1.0), rough=0.8, normal=1.0, displace=False,
        disp_scale=None, grime=0.35, period=None, stripes=None, checker=None) -> bpy.types.Material:
    """Textured material: generated albedo × tint, tangent normal map, height → bump (or true
    displacement when displace=True — pair it with an adaptive-subdivision object). grime darkens
    occluded corners (AO-driven dirt under cornices, inside arches, along plinths).
    stripes = dict(colour, coord, period, duty, offset, zmax, bump): paint bands over the albedo,
    coord = "object_z" | "generated_z" | "uv_u".
    checker = dict(period, n, bump, tex): relief on a body of revolution — `n` beads around the
    axis (generated coords), chequered with rows every `period` of normalised height when given,
    added to the bump height; `tex` scales the texture's own height down so the relief dominates."""
    if name in MATS:
        return MATS[name]
    t = TEX[tex_set]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    out = nt.nodes["Material Output"]
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "cube"
    mp = nt.nodes.new("ShaderNodeMapping")
    s = 1.0 / (period or t["period"])
    mp.inputs["Scale"].default_value = (s, s, s)
    nt.links.new(uv.outputs["UV"], mp.inputs["Vector"])
    alb = nt.nodes.new("ShaderNodeTexImage")
    alb.image = _image(t["albedo"], False)
    nrm = nt.nodes.new("ShaderNodeTexImage")
    nrm.image = _image(t["normal"], True)
    hgt = nt.nodes.new("ShaderNodeTexImage")
    hgt.image = _image(t["height"], True)
    for n in (alb, nrm, hgt):
        n.projection = "FLAT"
        n.extension = "REPEAT"
        nt.links.new(mp.outputs["Vector"], n.inputs["Vector"])
    tintn = nt.nodes.new("ShaderNodeMixRGB")
    tintn.blend_type = "MULTIPLY"
    tintn.inputs["Fac"].default_value = 1.0
    tintn.inputs["Color2"].default_value = (*tint, 1.0)
    nt.links.new(alb.outputs["Color"], tintn.inputs["Color1"])
    colour = tintn.outputs["Color"]
    height = hgt.outputs["Color"]
    if stripes:
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        if stripes["coord"] == "uv_u":
            nt.links.new(uv.outputs["UV"], sep.inputs["Vector"])
            coord = sep.outputs["X"]
        else:
            tc = nt.nodes.new("ShaderNodeTexCoord")
            nt.links.new(tc.outputs["Object" if stripes["coord"] == "object_z" else "Generated"], sep.inputs["Vector"])
            coord = sep.outputs["Z"]
        mask = _stripe_mask(nt, coord, stripes["period"], stripes["duty"], stripes.get("offset", 0.0), stripes.get("zmax"))
        paint = nt.nodes.new("ShaderNodeMixRGB")
        paint.inputs["Color2"].default_value = (*stripes["colour"], 1.0)
        nt.links.new(colour, paint.inputs["Color1"])
        nt.links.new(mask, paint.inputs["Fac"])
        colour = paint.outputs["Color"]
        if stripes.get("bump"):                      # bands also read as a small relief
            height = _math(nt, "ADD", hgt.outputs["Color"], _math(nt, "MULTIPLY", mask, stripes["bump"]))
    if checker:
        tc = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
        ang = _math(nt, "ARCTAN2", _math(nt, "SUBTRACT", sep.outputs["Y"], 0.5),
                    _math(nt, "SUBTRACT", sep.outputs["X"], 0.5))
        cells = _math(nt, "LESS_THAN", _math(nt, "FRACT", _math(nt, "MULTIPLY", ang, checker["n"] / (2 * math.pi))), 0.5)
        if checker.get("period"):                     # rows too → chequerboard (xor)
            rows = _stripe_mask(nt, sep.outputs["Z"], checker["period"], 0.5)
            cells = _math(nt, "MODULO", _math(nt, "ADD", rows, cells), 2.0)
        height = _math(nt, "ADD", _math(nt, "MULTIPLY", height, checker.get("tex", 0.3)),
                       _math(nt, "MULTIPLY", cells, checker["bump"]))
    if grime > 0:
        ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
        ao.samples = 6
        ao.inputs["Distance"].default_value = 1.6
        ao.inputs["Color"].default_value = (1, 1, 1, 1)
        mr = nt.nodes.new("ShaderNodeMapRange")           # AO 0..1 → 1-grime .. 1
        mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = 0.0, 1.0
        mr.inputs["To Min"].default_value, mr.inputs["To Max"].default_value = 1.0 - grime, 1.0
        nt.links.new(ao.outputs["AO"], mr.inputs["Value"])
        dirt = nt.nodes.new("ShaderNodeMixRGB")
        dirt.blend_type = "MULTIPLY"
        dirt.inputs["Fac"].default_value = 1.0
        nt.links.new(colour, dirt.inputs["Color1"])
        nt.links.new(mr.outputs["Result"], dirt.inputs["Color2"])
        colour = dirt.outputs["Color"]
    nt.links.new(colour, p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = rough
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.space = "TANGENT"
    nm.uv_map = "cube"
    nm.inputs["Strength"].default_value = normal
    nt.links.new(nrm.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], p.inputs["Normal"])
    disp = nt.nodes.new("ShaderNodeDisplacement")
    disp.inputs["Midlevel"].default_value = 0.5
    disp.inputs["Scale"].default_value = disp_scale if disp_scale is not None else t["disp"]
    nt.links.new(height, disp.inputs["Height"])
    nt.links.new(disp.outputs["Displacement"], out.inputs["Displacement"])
    m.cycles.displacement_method = "BOTH" if displace else "BUMP"
    MATS[name] = m
    return m


def drape_material() -> bpy.types.Material:
    """Thin white voile: a third translucent so the sunlit side glows through into the shade under
    the canopy; marigold hem painted along u > 0.92 of the sheet's own UVs; fine crease bump."""
    m = bpy.data.materials.new("drape")
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    out = nt.nodes["Material Output"]
    p.inputs["Roughness"].default_value = 0.9
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "cube"
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(uv.outputs["UV"], sep.inputs["Vector"])
    hem = _stripe_mask(nt, sep.outputs["X"], 1.0, 0.08, 0.92)
    colour = nt.nodes.new("ShaderNodeMixRGB")
    colour.inputs["Color1"].default_value = (1.0, 1.0, 0.98, 1.0)
    colour.inputs["Color2"].default_value = (*MARIGOLD, 1.0)
    nt.links.new(hem, colour.inputs["Fac"])
    nt.links.new(colour.outputs["Color"], p.inputs["Base Color"])
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value, noise.inputs["Detail"].default_value = 12.0, 4.0
    nt.links.new(uv.outputs["UV"], noise.inputs["Vector"])
    b = nt.nodes.new("ShaderNodeBump")
    b.inputs["Strength"].default_value = 0.25
    nt.links.new(_math(nt, "ADD", noise.outputs["Fac"], _math(nt, "MULTIPLY", hem, 0.6)), b.inputs["Height"])
    nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
    tr = nt.nodes.new("ShaderNodeBsdfTranslucent")
    nt.links.new(colour.outputs["Color"], tr.inputs["Color"])
    nt.links.new(b.outputs["Normal"], tr.inputs["Normal"])
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs["Fac"].default_value = 0.35
    nt.links.new(p.outputs["BSDF"], mix.inputs[1])
    nt.links.new(tr.outputs["BSDF"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    MATS["drape"] = m
    return m


def garland_material() -> bpy.types.Material:
    """Rose garland: red and white blooms as thresholded noise over dark foliage, bumpy."""
    m = bpy.data.materials.new("garland")
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Roughness"].default_value = 0.9
    tc = nt.nodes.new("ShaderNodeTexCoord")
    blooms = nt.nodes.new("ShaderNodeTexNoise")
    blooms.inputs["Scale"].default_value, blooms.inputs["Detail"].default_value = 9.0, 3.0
    nt.links.new(tc.outputs["Object"], blooms.inputs["Vector"])
    leaf = nt.nodes.new("ShaderNodeTexNoise")
    leaf.inputs["Scale"].default_value, leaf.inputs["Detail"].default_value = 60.0, 5.0
    nt.links.new(tc.outputs["Object"], leaf.inputs["Vector"])
    colour = None
    for thresh, rgb in ((0.54, (0.55, 0.02, 0.08)), (0.64, (0.9, 0.86, 0.8))):
        mask = _math(nt, "GREATER_THAN", blooms.outputs["Fac"], thresh)
        mix = nt.nodes.new("ShaderNodeMixRGB")
        mix.inputs["Color1"].default_value = (0.07, 0.18, 0.05, 1.0)
        if colour is not None:
            nt.links.new(colour, mix.inputs["Color1"])
        mix.inputs["Color2"].default_value = (*rgb, 1.0)
        nt.links.new(mask, mix.inputs["Fac"])
        colour = mix.outputs["Color"]
    nt.links.new(colour, p.inputs["Base Color"])
    b = nt.nodes.new("ShaderNodeBump")
    b.inputs["Strength"].default_value = 0.7
    nt.links.new(_math(nt, "ADD", leaf.outputs["Fac"], blooms.outputs["Fac"]), b.inputs["Height"])
    nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
    MATS["garland"] = m
    return m


def water_material() -> bpy.types.Material:
    m = mat("water", (0.13, 0.17, 0.14), 0.08)
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.35, 0.08, 1.0)          # streaks along the river (N-S)
    n1 = nt.nodes.new("ShaderNodeTexNoise")
    n1.inputs["Scale"].default_value = 1.0
    n1.inputs["Detail"].default_value = 8
    b = nt.nodes.new("ShaderNodeBump")
    b.inputs["Strength"].default_value = 0.08
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], n1.inputs["Vector"])
    nt.links.new(n1.outputs["Fac"], b.inputs["Height"])
    nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
    return m


ROSE = (0.42, 0.06, 0.07)
MARIGOLD = (0.95, 0.45, 0.05)


def make_materials() -> None:
    global TEX
    TEX = textures.ensure_textures(TEX_DIR)
    pbr("stucco", "stucco", rough=0.85, normal=1.0)
    pbr("stucco_fine", "stucco", rough=0.85, normal=0.6, period=1.5, grime=0.25)   # columns, drums
    pbr("rose", "stucco", tint=ROSE, rough=0.75, normal=0.5, period=1.5, grime=0.2)
    # aat-chala roofs are red-painted plaster (refs M131868947, M130391230), not tiles: bump only
    pbr("red_plaster", "stucco", tint=(0.62, 0.16, 0.10), rough=0.8, normal=0.7, period=2.0, grime=0.25)
    pbr("stone", "brick", tint=(0.85, 0.85, 0.85), rough=0.9, normal=1.0)
    pbr("laterite", "brick", tint=(0.9, 0.75, 0.7), rough=0.95, normal=1.0)
    pbr("paving", "paving", rough=0.85, normal=1.0, displace=True)      # adaptive-subdivision objects only
    pbr("path", "stucco", tint=(0.78, 0.74, 0.66), rough=0.9, normal=0.4, period=2.0, grime=0.25)
    pbr("white", "stucco", tint=(0.95, 0.94, 0.9), rough=0.6, normal=0.4, period=1.0, grime=0.2)
    # painted detail instead of geometry:
    #   spire   – maroon bands on the ribbed ratnas (normalised height → same look on every size)
    #   striped – maroon/cream banded corner pilasters of the navaratna (object z, origin at the base)
    #   dado    – Shiva temple walls with the maroon skirting band along the bottom 0.9 m
    #   dentil  – white cornice course with alternating blocks along the face (u stripes + bump)
    #   colonette – the bundled red/cream shafts flanking every arch (u stripes, refs M36537551)
    #   column  – colonnade columns of the boundary ranges, red-painted lower 1.6 m (M69552267)
    # The ratnas are stepped rings in geometry; the beading along each ring is a bump.
    pbr("spire", "stucco", rough=0.85, normal=0.6, period=1.5, grime=0.25, disp_scale=0.02,
        stripes=dict(colour=ROSE, coord="generated_z", period=0.11, duty=0.18, offset=0.05, zmax=0.72, bump=0.3),
        checker=dict(n=48, bump=-0.8, tex=0.3))
    pbr("colonette", "stucco", rough=0.8, normal=0.5, period=1.5, grime=0.2,
        stripes=dict(colour=ROSE, coord="uv_u", period=0.14, duty=0.5, bump=0.5))
    pbr("column", "stucco", tint=(0.95, 0.94, 0.9), rough=0.75, normal=0.4, period=1.0, grime=0.2,
        stripes=dict(colour=ROSE, coord="object_z", period=1000.0, duty=0.0016))
    pbr("striped", "stucco", rough=0.8, normal=0.6, period=1.5, grime=0.25,
        stripes=dict(colour=ROSE, coord="object_z", period=0.9, duty=0.5))
    pbr("dado", "stucco", rough=0.85, normal=1.0,
        stripes=dict(colour=ROSE, coord="object_z", period=1000.0, duty=0.0009))
    pbr("dentil", "stucco", tint=(0.95, 0.94, 0.9), rough=0.6, normal=0.4, period=1.0, grime=0.2,
        stripes=dict(colour=(0.30, 0.22, 0.18), coord="uv_u", period=0.6, duty=0.5, bump=-0.6))
    mat("gold", (1.0, 0.72, 0.22), 0.3, metal=0.9)
    # wedding mandap (refs data/reference/mandap/mandap1-4.png): white satin over the stage and canopy, turned sandstone
    # columns, marigold-hemmed drapes, rose garland, red velvet runners, copper havan kund
    mat("cloth", (0.92, 0.91, 0.87), 0.9, bump=0.2, bump_scale=5)
    mat("red_cloth", (0.55, 0.03, 0.06), 0.85, bump=0.2, bump_scale=6)
    mat("carpet", (0.36, 0.02, 0.05), 0.95, bump=0.15, bump_scale=60)
    mat("marigold", MARIGOLD, 0.9, bump=0.8, bump_scale=120)
    mat("copper", (0.75, 0.42, 0.25), 0.35, metal=0.9)
    pbr("mandap_stone", "stucco", tint=(0.84, 0.76, 0.62), rough=0.7, normal=0.5, period=1.0, grime=0.3)
    drape_material()
    garland_material()
    mat("dark", (0.20, 0.14, 0.10), 0.8)
    water_material()
    mat("earth", (0.30, 0.25, 0.17), 0.95, bump=0.25, bump_scale=8)
    mat("green", (0.12, 0.26, 0.08), 0.9)
    mat("bank", (0.22, 0.30, 0.14), 0.95, bump=0.3, bump_scale=3)


def cube_uv(me: bpy.types.Mesh) -> None:
    """Per-face planar projection in metres, axis chosen by the face normal, handedness kept so a
    tangent-space normal map reads the same on every face (u × v == n)."""
    n = len(me.loops)
    if n == 0:
        return
    li = np.empty(n, dtype=np.int32)
    me.loops.foreach_get("vertex_index", li)
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)[li]
    pn = np.empty(len(me.polygons) * 3, dtype=np.float32)
    me.polygons.foreach_get("normal", pn)
    lt = np.empty(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get("loop_total", lt)
    N = np.repeat(pn.reshape(-1, 3), lt, axis=0)
    ax = np.abs(N).argmax(1)
    sgn = np.sign(N[np.arange(n), ax])
    sgn[sgn == 0] = 1
    x, y, z = co.T
    u = np.where(ax == 0, y * sgn, np.where(ax == 1, -x * sgn, x * sgn))
    v = np.where(ax == 2, y, z)
    uv = me.uv_layers.new(name="cube")
    uv.data.foreach_set("uv", np.stack([u, v], 1).astype(np.float32).ravel())


def new_object(name: str, verts, faces, material: str | None = None, smooth=False,
               bevel: float = 0.0, auto_smooth=40.0, adaptive=False, loc=None, rot_z=0.0,
               uvs=None) -> bpy.types.Object:
    """uvs: optional per-vertex (u, v) written to the "cube" layer instead of the cube projection —
    for sheets whose shader paints along their own parametrisation (the mandap drapes)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate(clean_customdata=False)
    me.update()
    if uvs is None:
        cube_uv(me)
    else:
        li = np.empty(len(me.loops), dtype=np.int32)
        me.loops.foreach_get("vertex_index", li)
        me.uv_layers.new(name="cube").data.foreach_set("uv", np.asarray(uvs, dtype=np.float32)[li].ravel())
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
        me.use_auto_smooth = True
        me.auto_smooth_angle = math.radians(auto_smooth)
    if material:
        me.materials.append(MATS[material])
    ob = bpy.data.objects.new(name, me)
    COL.objects.link(ob)
    if loc is not None:
        ob.location = loc
    ob.rotation_euler = (0, 0, rot_z)
    if bevel > 0:
        b = ob.modifiers.new("bevel", "BEVEL")
        b.width, b.segments, b.limit_method, b.angle_limit = bevel, 2, "ANGLE", math.radians(50)
    if adaptive:
        # Cycles dices this at render time (feature_set EXPERIMENTAL, see configure_render); the
        # stored mesh stays coarse. The subsurf must be the last modifier.
        s = ob.modifiers.new("subdiv", "SUBSURF")
        s.subdivision_type = "SIMPLE"
        s.levels, s.render_levels = 0, 0
        ob.cycles.use_adaptive_subdivision = True
    return ob


MOD_ATTRS = ("width", "segments", "limit_method", "angle_limit", "subdivision_type", "levels", "render_levels")


def instance(name: str, src: bpy.types.Object, loc, rot_z=0.0, scale=(1, 1, 1)) -> bpy.types.Object:
    ob = bpy.data.objects.new(name, src.data)
    ob.location = loc
    ob.rotation_euler = (0, 0, rot_z)
    ob.scale = scale
    for m in src.modifiers:  # copy bevel/subdiv modifiers so instances match
        n = ob.modifiers.new(m.name, m.type)
        for attr in MOD_ATTRS:
            if hasattr(m, attr):
                setattr(n, attr, getattr(m, attr))
    ob.cycles.use_adaptive_subdivision = src.cycles.use_adaptive_subdivision
    COL.objects.link(ob)
    return ob


# ------------------------------------------------------------------------------------------------
# Geometry generators (all return (verts, faces))
# ------------------------------------------------------------------------------------------------
def merge(*parts):
    verts, faces = [], []
    for v, f in parts:
        off = len(verts)
        verts.extend(v)
        faces.extend(tuple(i + off for i in face) for face in f)
    return verts, faces


def place(vf, loc=(0.0, 0.0, 0.0), rot_z=0.0):
    """Rotate a (verts, faces) part about Z then translate."""
    v, f = vf
    c, s = math.cos(rot_z), math.sin(rot_z)
    return [(c * x - s * y + loc[0], s * x + c * y + loc[1], z + loc[2]) for (x, y, z) in v], f


def box(w, d, h, cx=0.0, cy=0.0, z0=0.0):
    x0, x1, y0, y1, z1 = cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2, z0 + h
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return v, f


def _newell(pts3):
    n = Vector((0.0, 0.0, 0.0))
    for (a, b) in zip(pts3, pts3[1:] + pts3[:1]):
        n.x += (a[1] - b[1]) * (a[2] + b[2])
        n.y += (a[2] - b[2]) * (a[0] + b[0])
        n.z += (a[0] - b[0]) * (a[1] + b[1])
    return n


def sheet(polys, t, axis="y"):
    """Extrude a planar sheet of polygons (which share vertex positions along common edges) by
    thickness t into ONE closed solid: front faces, back faces and a side quad along every
    boundary edge — the outer outline and any holes (arch reveals). Polygon coordinates are (x, z)
    for axis 'y' (front at y=0, solid extends to +y), (x, y) for 'z' (front at z=0, extends +z) and
    (y, z) for 'x' (front at x=0, extends +x). Winding is normalised so the front faces away from
    the solid. Neighbouring polygons must share identical vertex chains (no T-junctions)."""
    to3 = {"y": lambda a, b, w: (a, w, b), "z": lambda a, b, w: (a, b, w), "x": lambda a, b, w: (w, a, b)}[axis]
    ext = {"y": Vector((0, 1, 0)), "z": Vector((0, 0, 1)), "x": Vector((1, 0, 0))}[axis]
    idx, pts = {}, []

    def vid(p):
        k = (round(p[0], 5), round(p[1], 5))
        if k not in idx:
            idx[k] = len(pts)
            pts.append(k)
        return idx[k]
    loops = [[vid(p) for p in poly] for poly in polys]
    if _newell([to3(*pts[i], 0.0) for i in loops[0]]).dot(ext) > 0:
        loops = [lp[::-1] for lp in loops]
    n = len(pts)
    edges = set()
    for lp in loops:
        for a, b in zip(lp, lp[1:] + lp[:1]):
            edges.add((a, b))
    verts = [to3(a, b, 0.0) for (a, b) in pts] + [to3(a, b, t) for (a, b) in pts]
    faces = [tuple(lp) for lp in loops] + [tuple(i + n for i in lp[::-1]) for lp in loops]
    for (a, b) in edges:
        if (b, a) not in edges:          # used by one polygon only → outline or hole → side wall
            faces.append((a, a + n, b + n, b))
    return verts, faces


def rect_ring(w, d, t, h, cx=0.0, cy=0.0, z0=0.0):
    """Closed rectangular ring (w × d outside, wall t, height h): one 16-vertex solid, no corner
    overlaps (the old four-box version z-fought at every corner)."""
    ox, oy, ix, iy = w / 2, d / 2, w / 2 - t, d / 2 - t
    O = [(-ox, -oy), (ox, -oy), (ox, oy), (-ox, oy)]
    I = [(-ix, -iy), (ix, -iy), (ix, iy), (-ix, iy)]
    polys = [[O[k], O[(k + 1) % 4], I[(k + 1) % 4], I[k]] for k in range(4)]
    return place(sheet(polys, h, "z"), (cx, cy, z0))


def moulding(w, d, cx, cy, z0, steps):
    """Stacked rings: steps = [(outset, height), …] from the bottom up (plinth/cornice profiles)."""
    return merge(*[rect_ring(w + 2 * o, d + 2 * o, 0.3 + o, h, cx, cy, z0 + sum(hh for _, hh in steps[:i]))
                   for i, (o, h) in enumerate(steps)])


def frame_ring(w, h, t, depth, cx=0.0, cz=0.0, y0=0.0):
    """Rectangular frame standing in the XZ plane (portal surrounds), extruded along +Y."""
    O = [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, h), (-w / 2, h)]
    I = [(-w / 2 + t, t), (w / 2 - t, t), (w / 2 - t, h - t), (-w / 2 + t, h - t)]
    polys = [[O[k], O[(k + 1) % 4], I[(k + 1) % 4], I[k]] for k in range(4)]
    return place(sheet(polys, depth, "y"), (cx, y0, cz))


def stairs(n, width, tread, rise, axis="x"):
    """Staircase as one profile prism, rising along the profile's first axis. axis='x': profile in
    (y, z), steps climb toward +Y, extruded along +X by `width`. axis='y': profile in (x, z), steps
    climb toward +X, extruded along +Y."""
    poly = [(0.0, 0.0), (n * tread, 0.0), (n * tread, n * rise)]
    for i in range(n - 1, -1, -1):
        poly.append((i * tread, (i + 1) * rise))
        if i > 0:
            poly.append((i * tread, i * rise))
    return sheet([poly], width, axis)


def grid(w, d, cx=0.0, cy=0.0, z=0.0, step=2.0):
    """Coarse flat grid; the render-time adaptive subdivision does the dicing."""
    nx, ny = max(1, int(round(w / step))), max(1, int(round(d / step)))
    xs = np.linspace(cx - w / 2, cx + w / 2, nx + 1)
    ys = np.linspace(cy - d / 2, cy + d / 2, ny + 1)
    X, Y = np.meshgrid(xs, ys)
    verts = np.stack([X.ravel(), Y.ravel(), np.full(X.size, z)], 1).tolist()
    i = np.arange(ny)[:, None] * (nx + 1) + np.arange(nx)[None, :]
    faces = np.stack([i, i + 1, i + nx + 2, i + nx + 1], -1).reshape(-1, 4).tolist()
    return verts, faces


def lathe(profile, segments=48, cx=0.0, cy=0.0, z0=0.0, rib=0, rib_amp=0.0, rib_phase=0.0):
    """Revolve a (r, z) profile. rib>0 modulates radius by (1 + rib_amp*cos(rib*theta)) — the fluted
    spires. Profile points with r == 0 become a single apex vertex (closed caps, no degenerate ring)."""
    verts, faces = [], []
    rings = []
    for (r, z) in profile:
        if r == 0:
            rings.append(len(verts))
            verts.append((cx, cy, z0 + z))
            continue
        ring = []
        for i in range(segments):
            t = 2 * math.pi * i / segments
            rr = r * (1 + rib_amp * math.cos(rib * t + rib_phase)) if rib else r
            ring.append(len(verts))
            verts.append((cx + rr * math.cos(t), cy + rr * math.sin(t), z0 + z))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        if isinstance(a, int) and isinstance(b, int):
            continue
        for i in range(segments):
            j = (i + 1) % segments
            if isinstance(a, int):
                faces.append((a, b[j], b[i]))
            elif isinstance(b, int):
                faces.append((a[i], a[j], b))
            else:
                faces.append((a[i], a[j], b[j], b[i]))
    return verts, faces


def ring_prism(outer, inner, depth, axis="y", cx=0.0, cz=0.0, y0=0.0):
    """Extruded ring between two same-length outlines (arch surrounds that leave the opening open)."""
    n = len(outer)
    assert len(inner) == n

    def P(u, v, y):
        return (cx + u, y, cz + v) if axis == "y" else (y, cx + u, cz + v)
    verts = [P(u, v, y0) for (u, v) in outer] + [P(u, v, y0) for (u, v) in inner] + \
            [P(u, v, y0 + depth) for (u, v) in outer] + [P(u, v, y0 + depth) for (u, v) in inner]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, n + i, n + j, j))                          # front ring (y0 side)
        faces.append((2 * n + i, 2 * n + j, 3 * n + j, 3 * n + i))  # back ring
        faces.append((i, j, 2 * n + j, 2 * n + i))                  # outer wall
        faces.append((n + i, 3 * n + i, 3 * n + j, n + j))          # inner wall
    return verts, faces


def cusped_arch_poly(width, height, cusps=5, sag=0.55, steps=6):
    """Bengal 'multifoil' arch outline: vertical jambs then `cusps` shallow arcs across the top.
    Returns [(−hw, 0), (−hw, spring), arc…, (hw, spring), (hw, 0)]."""
    hw = width / 2
    spring = height - hw * 0.85     # springing line
    pts = [(-hw, 0.0), (-hw, spring)]
    n = cusps
    arc = []
    for i in range(n + 1):
        t = math.pi - math.pi * i / n
        arc.append((hw * math.cos(t), spring + (height - spring) * math.sin(t)))
    for (ax, az), (bx, bz) in zip(arc, arc[1:]):
        L = math.hypot(bx - ax, bz - az)
        nx, nz = -(bz - az) / L, (bx - ax) / L      # outward normal of the chord
        for s in range(1, steps):
            u = s / steps
            bulge = math.sin(u * math.pi) * L * sag * 0.5
            pts.append((ax + (bx - ax) * u + nx * bulge, az + (bz - az) * u + nz * bulge))
        pts.append((bx, bz))
    pts.append((hw, 0.0))
    return pts


def round_arch_poly(width, height, steps=14):
    hw = width / 2
    spring = height - hw
    pts = [(-hw, 0.0), (-hw, spring)]
    for i in range(1, steps):
        t = math.pi - math.pi * i / steps
        pts.append((hw * math.cos(t), spring + hw * math.sin(t)))
    pts += [(hw, spring), (hw, 0.0)]
    return pts


def pierced_wall(length, height, t, openings):
    """Wall (local: x along the length, front face at y=0 looking −Y, thickness t toward +Y) with
    through-openings. openings = [(xc, sill_z, arch_poly), …], non-overlapping in x. Built as
    piers + sills + spandrels sharing vertex chains, so the result is a single closed solid whose
    reveals are real faces — no boolean."""
    polys = []
    H = height
    xl, left_chain = -length / 2, []
    for xc, zb, poly in sorted(openings, key=lambda o: o[0]):
        hw = -poly[0][0]
        spring = zb + poly[1][1]
        x0, x1 = xc - hw, xc + hw
        chain = [z for z in (zb, spring) if 0 < z < H]
        polys.append([(xl, 0.0), (x0, 0.0)] + [(x0, z) for z in chain] + [(x0, H), (xl, H)] +
                     [(xl, z) for z in reversed(left_chain)])
        if zb > 0:
            polys.append([(x0, 0.0), (x1, 0.0), (x1, zb), (x0, zb)])
        polys.append([(xc + u, zb + v) for (u, v) in poly[1:-1]] + [(x1, H), (x0, H)])
        xl, left_chain = x1, chain
    polys.append([(xl, 0.0), (length / 2, 0.0), (length / 2, H), (xl, H)] + [(xl, z) for z in reversed(left_chain)])
    return sheet(polys, t, "y")


def chala_roof(w, d, h, overhang=0.6, rise=0.35, n=8, m=8, z0=0.0, cx=0.0, cy=0.0):
    """Curved hipped 'chala' roof. Bengal eaves are ARCHED — highest at mid-face, drooping to the
    corners (refs M21000008, M131868947) — and the faces bulge outward. n rows, m segments/side."""
    hw, hd = w / 2 + overhang, d / 2 + overhang
    verts, faces = [], []
    rows = []
    for i in range(n):
        u = i / n                                  # 0 = eave; the apex is a single vertex
        ring = []
        rx, ry = hw * (1 - u), hd * (1 - u)
        z = z0 + h * (1 - (1 - u) ** 1.9)            # convex profile
        for side in range(4):
            for k in range(m):
                t = k / m
                if side == 0:
                    x, y = -rx + 2 * rx * t, -ry
                elif side == 1:
                    x, y = rx, -ry + 2 * ry * t
                elif side == 2:
                    x, y = rx - 2 * rx * t, ry
                else:
                    x, y = -rx, ry - 2 * ry * t
                arch = rise * h * (1 - u) * math.sin(t * math.pi)      # eave arches up mid-face
                ring.append(len(verts))
                verts.append((cx + x, cy + y, z + arch))
        rows.append(ring)
    apex = len(verts)
    verts.append((cx, cy, z0 + h))
    for a, b in zip(rows, rows[1:]):
        L = len(a)
        for i in range(L):
            j = (i + 1) % L
            faces.append((a[i], a[j], b[j], b[i]))
    top = rows[-1]
    for i in range(len(top)):
        faces.append((top[i], top[(i + 1) % len(top)], apex))
    # soffit: flat inner ring just inside the wall line, quads out to the arched eave, flat cap
    inner = []
    for side in range(4):
        for k in range(m):
            t = k / m
            rx, ry = w / 2 - 0.05, d / 2 - 0.05
            x, y = ((-rx + 2 * rx * t, -ry), (rx, -ry + 2 * ry * t), (rx - 2 * rx * t, ry), (-rx, ry - 2 * ry * t))[side]
            inner.append(len(verts))
            verts.append((cx + x, cy + y, z0))
    eave = rows[0]
    for i in range(len(eave)):
        j = (i + 1) % len(eave)
        faces.append((inner[i], inner[j], eave[j], eave[i]))
    faces.append(tuple(inner[::-1]))                # closes the roof over the room (dark interior)
    return verts, faces


def spire_profile(r, h):
    """Fluted bulbous spire (ratna) profile: drum, swelling body, taper to a point."""
    return [(0, 0), (r * 0.92, 0), (r * 0.98, h * 0.08), (r * 1.06, h * 0.22), (r * 1.06, h * 0.36),
            (r * 0.96, h * 0.50), (r * 0.78, h * 0.63), (r * 0.56, h * 0.75), (r * 0.34, h * 0.86),
            (r * 0.14, h * 0.95), (0, h)]


def stepped_profile(profile, courses):
    """Turn a smooth (r, z) profile into a stair of horizontal courses (ref M69552277 / the user's
    spire photo: every ratna is a stack of corbelled rings, the silhouette is a staircase, not a
    curve). Each course is a vertical outer face and a flat ledge to the next radius."""
    zs = [z for _, z in profile]
    h = zs[-1]

    def r_at(z):
        for (r0, z0), (r1, z1) in zip(profile, profile[1:]):
            if z0 <= z <= z1:
                return r0 if z1 == z0 else r0 + (r1 - r0) * (z - z0) / (z1 - z0)
        return profile[-1][0]
    pts = [(0.0, 0.0)]
    for i in range(courses):
        z0, z1 = h * i / courses, h * (i + 1) / courses
        r = r_at((z0 + z1) / 2)
        pts += [(r, z0), (r, z1)]
    pts.append((0.0, h))
    return pts


def finial(r, h, cx, cy, z0):
    return lathe([(0, 0), (r * 0.8, 0), (r, h * 0.15), (r * 0.5, h * 0.3), (r * 0.9, h * 0.5),
                  (r * 0.35, h * 0.7), (r * 0.35, h * 0.85), (0, h)], 16, cx, cy, z0)


def grid_plane(w, d, cx=0.0, cy=0.0, z=0.0):
    x0, x1, y0, y1 = cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2
    return [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [(0, 1, 2, 3)]


def column(r, h, cx, cy, z0, segs=20):
    """Plastered column: base, shaft, capital."""
    return lathe([(0, 0), (r * 1.3, 0), (r * 1.3, 0.35), (r * 1.05, 0.5), (r, 0.6), (r, h - 1.1),
                  (r * 1.15, h - 0.9), (r * 1.4, h - 0.5), (r * 1.4, h), (0, h)], segs, cx, cy, z0)


def pilasters(w, d, h, t=0.55, proud=0.14, z0=0.0):
    """Four corner pilasters standing `proud` of a w × d footprint (local frame)."""
    parts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box(t, t, h, sx * (w / 2 - t / 2 + proud), sy * (d / 2 - t / 2 + proud), z0))
    return merge(*parts)


def arched_parapet(length, full, z_low, amp, t, samples=16):
    """Bengal curved cornice band for one face: a prism `length` long whose top edge follows the arch
    z_low + amp·(1 − (a / (full/2))²) — highest mid-face, dropping to the corners of the `full`
    face (local frame: along x, front at y=0). Shorter E/W bands still meet the N/S ones at the
    same height because the curve is normalised by `full`."""
    s2, l2 = full / 2, length / 2
    poly = [(-l2, 0.0), (l2, 0.0)]
    for i in range(samples, -1, -1):
        a = -l2 + length * i / samples
        poly.append((a, z_low + amp * (1 - (a / s2) ** 2)))
    return sheet([poly], t, "y")


def four_faces(part, size, z0=0.0, cx=0.0, cy=0.0):
    """Place a part built in the local frame of a face (along x, front at y=0 looking −Y) on the
    four faces of a square of `size` (S, N, E, W)."""
    s2 = size / 2
    return merge(place(part, (cx, cy - s2, z0), 0.0), place(part, (cx, cy + s2, z0), math.pi),
                 place(part, (cx + s2, cy, z0), math.pi / 2), place(part, (cx - s2, cy, z0), -math.pi / 2))


def rect_faces(w, d):
    """Face frames of a w × d rectangle: name → (length, (x, y) of the face centre, rot_z) for
    parts built in the face-local frame (along x, front at y=0 looking −Y)."""
    return {"S": (w, (0.0, -d / 2), 0.0), "N": (w, (0.0, d / 2), math.pi),
            "E": (d, (w / 2, 0.0), math.pi / 2), "W": (d, (-w / 2, 0.0), -math.pi / 2)}


def disc(r, depth, cx, cz, segs=16):
    """Flat rosette standing in the XZ plane, proud of the wall (y=0) toward −Y — the medallions
    over the hall arches. Built as a lathe about Z, then rotated onto the wall."""
    v, f = lathe([(0, 0), (r, 0), (r, depth * 0.6), (r * 0.7, depth), (0, depth)], segs)
    return [(cx + x, -z, cz + y) for (x, y, z) in v], f


def jambs(xs, hw, spring, z0=0.0, proud=0.2, wj=0.42):
    """Bundled-shaft jambs either side of each arch (a proud box each, the shafts are painted by
    the 'colonette' stripes) with a slightly wider capital block under the springing line."""
    parts = []
    for xc in xs:
        for s in (-1, 1):
            x = xc + s * (hw + wj / 2)
            parts.append(box(wj, proud, spring - 0.25, x, -proud / 2, z0))
            parts.append(box(wj + 0.14, proud + 0.04, 0.25, x, -(proud + 0.04) / 2, z0 + spring - 0.25))
    return merge(*parts)


def split_x(x0, x1, blocked):
    """Sub-intervals of [x0, x1] that avoid the blocked [a, b] intervals (non-overlapping path slabs)."""
    out, cur = [], x0
    for a, b in sorted(blocked):
        if a > cur:
            out.append((cur, min(a, x1)))
        cur = max(cur, b)
    if cur < x1:
        out.append((cur, x1))
    return [(a, b) for a, b in out if b - a > 0.05]


# ------------------------------------------------------------------------------------------------
# Buildings
# ------------------------------------------------------------------------------------------------
def strip_extent(L):
    """The courtyard strip between the foot of the Shiva plinth steps and the hall block line:
    (east foot x, block line x, centre x). The long walk and the mandap both sit on its centre."""
    sx_e = L["shiva_x"] + L["shiva_size"] / 2 + 2.0 + 3.0      # east foot of the Shiva plinth steps
    bx_w = L["vishnu_center"][0] - L["vishnu_size"][0] / 2 - 1.5  # west face of the block line
    return sx_e, bx_w, (sx_e + bx_w) / 2


def build_ground(L):
    cw, cl, cx, cy, ch = L["courtyard_w"], L["courtyard_l"], L["courtyard_cx"], L["courtyard_cy"], L["courtyard_h"]
    rx = L["river_x"]
    new_object("ground", *grid_plane(3000, 3000, rx + 1500, 0, -0.05), "earth")
    # river (~250 m wide here), bank slope down to it, and the far (Bally) bank
    new_object("river", *grid_plane(250, 3000, rx - 125, 0, -1.6), "water")
    bank = [(rx - 6, -1500, -1.7), (rx, -1500, -0.05), (rx, 1500, -0.05), (rx - 6, 1500, -1.7)]
    new_object("bank", bank, [(0, 1, 2, 3)], "earth")
    new_object("far_bank", *grid_plane(1500, 3000, rx - 250 - 750, 0, 0.3), "bank")
    # ghat: one flight from the courtyard edge down into the river in front of the Shiva-row gap
    gw = L["shiva_ghat_gap"] + 16
    wx = cx - cw / 2
    n_st, tread = 9, 1.0
    new_object("ghat_steps", *stairs(n_st, gw, tread, (ch + 2.0) / n_st, "y"), "laterite",
               loc=(wx - n_st * tread, cy - gw / 2, -2.0))
    # courtyard platform with terracotta paving on top: a coarse grid diced adaptively at render time
    new_object("courtyard", *box(cw, cl, ch, cx, cy, 0.0), "laterite")
    new_object("paving", *grid(cw - 0.4, cl - 0.4, cx, cy, ch + 0.01, 2.0), "paving", adaptive=True)
    # pale stone paths, as in the satellite: two long walks down the strip (centre + along the foot
    # of the Shiva steps) and cross walks split around them so no two slabs overlap
    d = L["arcade_depth"]
    sx_e, bx_w, strip_cx = strip_extent(L)
    long_walks = [(strip_cx - 1.2, strip_cx + 1.2), (sx_e + 0.1, sx_e + 1.7)]
    zp = ch + 0.01
    parts = [box(b - a, cl - 2 * d - 1, 0.03, (a + b) / 2, cy, zp) for a, b in long_walks]
    cross = [(sx_e - 0.5, bx_w + 0.5, cy), (cx - cw / 2 + d + 0.5, cx + cw / 2 - d - 0.5, cy + cl / 2 - d - 2.0),
             (cx - cw / 2 + d + 0.5, cx + cw / 2 - d - 0.5, cy - cl / 2 + d + 2.0)]
    for x0, x1, yc in cross:
        for a, b in split_x(x0, x1, long_walks):
            parts.append(box(b - a, 2.4, 0.03, (a + b) / 2, yc, zp))
    new_object("paths", *merge(*parts), "path")


def colonnade_block(name, length, depth, height, bays, cx, cy, z0, rot_z, walk=3.4, cap=0):
    """Single-storey boundary range (refs M69552267 inside, M69552273/M69552274 outside): a
    colonnade of round columns under a flat slab along the courtyard, shop rooms behind it entered
    through round-arched doorways (real openings), a plain outer wall carrying the red band of
    blind arched niches (blind in the real building, so those are faces), cornice and parapet.
    Local: courtyard side looks −Y; placed at (cx, cy, z0)/rot_z. cap = ±1 closes the walkway at
    that local-x end (the ends against the Shiva plinth; the other ends run into the east range)."""
    pitch = length / bays
    t = 0.4
    xs = [-length / 2 + pitch * (i + 0.5) for i in range(bays)]
    xb = [-length / 2 + pitch * i for i in range(bays + 1)]           # bay boundaries / columns
    ys = depth / 2 - t                                                 # inner face of the outer wall
    yf = -depth / 2 + walk                                             # front of the shop wall
    door = round_arch_poly(1.3, 2.5, steps=10)
    shop = pierced_wall(length - 2 * t, height, t, [(x, 0.0, door) for x in xs])
    body = merge(place(shop, (0, yf, 0)),
                 box(length, t, height, 0, depth / 2 - t / 2, 0),                          # outer wall
                 box(t, ys - yf, height, -length / 2 + t / 2, (yf + ys) / 2, 0),          # shop end walls
                 box(t, ys - yf, height, length / 2 - t / 2, (yf + ys) / 2, 0),
                 box(length + 0.2, depth + 0.2, 0.35, 0, 0, height),                       # roof slab
                 box(length, walk, 0.12, 0, -depth / 2 + walk / 2, 0))                     # walkway floor
    if cap:
        body = merge(body, box(t, walk, height - 0.12, cap * (length / 2 - t / 2), -depth / 2 + walk / 2, 0.12))
    new_object(name, *body, "stucco", loc=(cx, cy, z0), rot_z=rot_z)
    cols = merge(*[column(0.26, height - 0.12, x, -depth / 2 + 0.5, 0.0, segs=12) for x in xb])
    new_object(name + "_columns", *cols, "column", smooth=True, auto_smooth=30, loc=(cx, cy, z0 + 0.12), rot_z=rot_z)
    trim = merge(rect_ring(length + 0.6, depth + 0.6, 0.45, 0.3, 0, 0, height + 0.35),
                 rect_ring(length + 0.4, depth + 0.4, 0.4, 0.12, 0, 0, height + 1.55))
    new_object(name + "_trim", *trim, "rose", loc=(cx, cy, z0), rot_z=rot_z)
    new_object(name + "_parapet", *rect_ring(length + 0.3, depth + 0.3, 0.3, 0.9, 0, 0, height + 0.65), "stucco",
               loc=(cx, cy, z0), rot_z=rot_z)
    # outer face: continuous red band, cream pilaster strips at the bays, cream arch frames
    yo = depth / 2
    band = box(length, 0.04, 2.8, 0, yo + 0.02, 0.8)
    new_object(name + "_band", *band, "rose", loc=(cx, cy, z0), rot_z=rot_z)
    strips = [box(0.35, 0.10, 2.8, x, yo + 0.05, 0.8) for x in xb]
    frames = [ring_prism(round_arch_poly(1.7, 2.3, steps=10), round_arch_poly(1.35, 2.05, steps=10), 0.08, "y", x, 1.05, yo + 0.04)
              for x in xs]
    new_object(name + "_niches", *merge(*strips, *frames), "stucco", loc=(cx, cy, z0), rot_z=rot_z)


def build_boundary(L):
    cw, cl, cx, cy, ch = L["courtyard_w"], L["courtyard_l"], L["courtyard_cx"], L["courtyard_cy"], L["courtyard_h"]
    d, h = L["arcade_depth"], L["arcade_h"]
    # Single-storey colonnaded ranges along the east, north and south edges, columns toward the
    # courtyard (local -Y → rotated toward the centre). North/south ones run from the Shiva plinth
    # to the east range so the Shiva row can reach the corners as it does in the satellite.
    xe = cx + cw / 2 - d / 2
    colonnade_block("arcade_E", cl, d, h, 26, xe, cy, ch, -math.pi / 2)
    x0 = L["shiva_x"] + L["shiva_size"] / 2 + 2.0
    ln = (cx + cw / 2 - d) - x0
    colonnade_block("arcade_N", ln, d, h, 10, x0 + ln / 2, cy + cl / 2 - d / 2, ch, 0.0, cap=-1)
    colonnade_block("arcade_S", ln, d, h, 10, x0 + ln / 2, cy - cl / 2 + d / 2, ch, math.pi, cap=1)
    # west parapet wall between the Shiva temples and the river, with the ghat opening
    wx = cx - cw / 2 + 0.4
    for sgn in (1, -1):
        seg = cl / 2 - L["shiva_ghat_gap"] / 2
        new_object(f"west_wall_{'N' if sgn > 0 else 'S'}", *box(0.6, seg, 1.5, wx, cy + sgn * (L["shiva_ghat_gap"] / 2 + seg / 2), ch), "stucco", bevel=0.03)


def shiva_temple_mesh():
    """One aat-chala Shiva temple (shared mesh set). Origin at the centre of its base, z=0 on the
    plinth. Four pierced walls (cusped door E, small arched window N/S/W) enclosing a dark room,
    red-plastered curved roofs, maroon dado/bands, door portal."""
    s = LAYOUT["shiva_size"]
    wall_h, t = 5.2, 0.6
    door = cusped_arch_poly(1.6, 3.2, cusps=5)
    win = cusped_arch_poly(0.9, 1.5, cusps=3)
    inner = s - 2 * t
    east = pierced_wall(inner, wall_h, t, [(0.0, 0.0, door)])
    side = pierced_wall(inner, wall_h, t, [(0.0, 2.4, win)])
    full = pierced_wall(s, wall_h, t, [(0.0, 2.4, win)])
    body = merge(place(full, (0, -s / 2, 0), 0.0), place(full, (0, s / 2, 0), math.pi),       # S, N
                 place(east, (s / 2, 0, 0), math.pi / 2), place(side, (-s / 2, 0, 0), -math.pi / 2),  # E, W
                 box(s * 0.55, s * 0.55, 1.1, 0, 0, wall_h + 2.2),                             # upper storey base
                 pilasters(s, s, wall_h - 0.9))
    ob = new_object("shiva_body", *body, "dado")
    # curved red-plaster roofs (smooth-shaded, coarse; grain comes from the normal map)
    lower = chala_roof(s, s, 2.4, overhang=0.55, rise=0.32, n=8, m=8, z0=wall_h)
    upper = chala_roof(s * 0.55, s * 0.55, 1.9, overhang=0.45, rise=0.32, n=6, m=6, z0=wall_h + 3.3)
    roof = new_object("shiva_roof", *merge(lower, upper), "red_plaster", smooth=True, auto_smooth=60)
    roof.parent = ob
    fv, ff = finial(0.35, 1.6, 0, 0, wall_h + 3.3 + 1.9 - 0.1)
    fin = new_object("shiva_finial", fv, ff, "gold", smooth=True)
    fin.parent = ob
    # rose surrounds on the door and the three windows, wall bands; white portal frame round the door
    dsur = ring_prism(cusped_arch_poly(2.3, 3.75, cusps=5), door, 0.12, "y", 0.0, 0.0, -0.12)
    wsur = ring_prism(cusped_arch_poly(1.4, 1.85, cusps=3), win, 0.08, "y", 0.0, 2.4, -0.08)
    trim = merge(place(dsur, (s / 2, 0, 0), math.pi / 2),
                 place(wsur, (0, -s / 2, 0), 0.0), place(wsur, (0, s / 2, 0), math.pi), place(wsur, (-s / 2, 0, 0), -math.pi / 2),
                 rect_ring(s + 0.12, s + 0.12, 0.25, 0.35, 0, 0, wall_h - 0.8),
                 rect_ring(s + 0.3, s + 0.3, 0.35, 0.25, 0, 0, wall_h - 0.05),
                 rect_ring(s * 0.55 + 0.2, s * 0.55 + 0.2, 0.25, 0.2, 0, 0, wall_h + 3.1))
    tr = new_object("shiva_trim", *trim, "rose")
    tr.parent = ob
    portal = place(frame_ring(3.2, 4.4, 0.3, 0.18, 0.0, 0.0, -0.18), (s / 2, 0, 0), math.pi / 2)
    po = new_object("shiva_portal", *portal, "white")
    po.parent = ob
    return ob


def build_shiva_row(L):
    proto = shiva_temple_mesh()
    proto.location = (0, 0, -100)          # keep the prototype out of frame; instances are used
    for ob in (proto, *proto.children):
        ob.hide_render = True
    cx, cy, ch = L["courtyard_cx"], L["courtyard_cy"], L["courtyard_h"]
    gap, half = L["shiva_gap"], L["shiva_ghat_gap"] / 2
    plinth_h = 1.0
    ys = []
    for i in range(6):
        y = half + gap * (i + 0.5)
        ys += [cy + y, cy - y]
    # shared raised plinth with a 3-step flight toward the courtyard along its whole length
    for sgn in (1, -1):
        seg = 6 * gap + 1.0
        yc = cy + sgn * (half + seg / 2 - 0.5)
        pw = L["shiva_size"] + 4.0
        new_object(f"shiva_plinth_{sgn}", *box(pw, seg, plinth_h, L["shiva_x"], yc, ch), "laterite", bevel=0.04)
        new_object(f"shiva_steps_{sgn}", *stairs(3, seg, 1.0, plinth_h / 3, "y"), "laterite",
                   loc=(L["shiva_x"] + pw / 2 + 3.0, yc + seg / 2, ch), rot_z=math.pi)
    for i, y in enumerate(ys):
        inst = instance(f"shiva_{i:02d}", proto, (L["shiva_x"], y, ch + plinth_h))
        for child in proto.children:
            c = instance(f"shiva_{i:02d}_{child.name}", child, (0, 0, 0))
            c.parent = inst


def storey(name, size, h, z, n, arch_w, arch_h, core_inset, cx=0.0, cy=0.0, amp=1.0):
    """One square storey of the navaratna: four pierced walls + corner posts around an open
    verandah corridor (you can see through the corner arches), a solid core, a roof slab that is
    the terrace of the storey above, striped corner pilasters, rose surrounds, cornice rings, a
    dentil course and the arched Bengal parapet. Returns the terrace level."""
    t = 0.5
    wl = size - 2 * t
    pitch = wl / n
    poly = cusped_arch_poly(arch_w, arch_h, cusps=9, steps=3)
    xs = [-wl / 2 + pitch * (i + 0.5) for i in range(n)]
    wall = pierced_wall(wl, h, t, [(x, 0.0, poly) for x in xs])
    posts = merge(*[box(t, t, h, sx * (size - t) / 2, sy * (size - t) / 2, 0) for sx in (-1, 1) for sy in (-1, 1)])
    body = merge(four_faces(wall, size), posts,
                 box(size - 2 * core_inset, size - 2 * core_inset, h, 0, 0, 0),      # core (sanctum)
                 box(size + 0.2, size + 0.2, 0.4, 0, 0, h))                            # roof slab / terrace
    new_object(name, *body, "stucco", loc=(cx, cy, z))
    new_object(name + "_pilasters", *pilasters(size, size, h - 1.4, t=0.7, proud=0.16), "striped", loc=(cx, cy, z))
    sw = min(arch_w + 0.5, pitch - 0.08)          # never touch the next bay's surround
    sur = merge(*[ring_prism(cusped_arch_poly(sw, arch_h + 0.3, cusps=9, steps=3), poly, 0.08, "y", x, 0.0, -0.08) for x in xs])
    new_object(name + "_surrounds", *four_faces(sur, size), "rose", loc=(cx, cy, z))
    wj = min(0.42, (pitch - arch_w) / 2 - 0.04)       # bundled shafts either side of every bay
    new_object(name + "_jambs", *four_faces(jambs(xs, arch_w / 2, poly[1][1], wj=wj), size), "colonette", loc=(cx, cy, z))
    rings = merge(rect_ring(size + 0.3, size + 0.3, 0.2, 0.45, 0, 0, h - 1.4),
                  rect_ring(size + 0.6, size + 0.6, 0.35, 0.4, 0, 0, h - 0.4))
    new_object(name + "_cornice", *rings, "rose", loc=(cx, cy, z))
    new_object(name + "_dentil", *rect_ring(size + 0.5, size + 0.5, 0.25, 0.3, 0, 0, h - 0.85), "dentil", loc=(cx, cy, z))
    full, tp = size + 0.2, 0.35
    ns = arched_parapet(full, full, 0.45, amp, tp)
    ew = arched_parapet(full - 2 * tp, full, 0.45, amp, tp)         # ends hide behind the N/S bands
    par = merge(place(ns, (0, -full / 2, 0), 0.0), place(ns, (0, full / 2, 0), math.pi),
                place(ew, (full / 2, 0, 0), math.pi / 2), place(ew, (-full / 2, 0, 0), -math.pi / 2))
    new_object(name + "_parapet", *par, "stucco", loc=(cx, cy, z + h + 0.4))
    return z + h + 0.4


def ratna(name, r, h):
    """Stepped bulbous spire (a stair of corbelled rings) on an octagonal drum with a cornice; the
    beading along the rings and the maroon bands are painted by the 'spire' material (normalised
    height), the finial is gold. Returns the body object (drum and finial are
    its children) — instance it with place_ratna."""
    drum = lathe([(0, 0), (r * 1.15, 0), (r * 1.15, h * 0.19), (r * 1.28, h * 0.19), (r * 1.28, h * 0.22),
                  (r * 1.0, h * 0.22), (0, h * 0.22)], 8)
    dob = new_object(name + "_drum", *drum, "stucco_fine", bevel=0.03)
    courses = max(14, int(round(h * 0.78 / 0.2)))                       # ≈ 20 cm corbelled rings
    body = lathe(stepped_profile(spire_profile(r, h * 0.78), courses), 32, 0, 0, h * 0.22)
    bob = new_object(name, *body, "spire", smooth=True, auto_smooth=40)
    fv, ff = finial(r * 0.35, h * 0.16, 0, 0, h * 0.99)
    fob = new_object(name + "_finial", fv, ff, "gold", smooth=True)
    dob.parent = fob.parent = bob
    return bob


def place_ratna(name, proto, x, y, z):
    ob = instance(name, proto, (x, y, z))
    for child in proto.children:
        c = instance(f"{name}_{child.name.split('_')[-1]}", child, (0, 0, 0))
        c.parent = ob
    return ob


def build_navaratna(L):
    cx, cy = L["mandir_center"]
    S, ph, P = L["mandir_size"], L["mandir_platform_h"], L["mandir_platform"]
    ch = L["courtyard_h"]
    z0 = ch
    # platform with a broad stair on the south face, toward the nat-mandir
    new_object("mandir_platform", *box(P, P, ph, cx, cy, z0), "laterite", bevel=0.06)
    new_object("mandir_platform_trim", *moulding(P, P, cx, cy, z0 + ph - 0.45, [(0.15, 0.25), (0.3, 0.2)]), "white")
    n_st, tread = 9, 0.4
    new_object("mandir_stairs", *stairs(n_st, S * 0.7, tread, ph / n_st, "x"), "stone",
               loc=(cx - S * 0.35, cy - P / 2 - n_st * tread, z0))
    # balustrade on the platform edge (pieces meet end-to-face, never overlapping)
    sw = P / 2 - 0.15 - S * 0.35                         # south pieces either side of the stair
    rail = merge(box(P + 0.4, 0.3, 1.0, cx, cy + P / 2, z0 + ph),
                 box(0.3, P + 0.05, 1.0, cx - P / 2, cy - 0.175, z0 + ph),
                 box(0.3, P + 0.05, 1.0, cx + P / 2, cy - 0.175, z0 + ph),
                 box(sw, 0.3, 1.0, cx - S * 0.35 - sw / 2, cy - P / 2, z0 + ph),
                 box(sw, 0.3, 1.0, cx + S * 0.35 + sw / 2, cy - P / 2, z0 + ph))
    new_object("mandir_rail", *rail, "white")
    # three storeys: a dominant ground storey, two much shorter set-back storeys (refs M28784710,
    # M131870345); 5 / 3 / 3 cusped bays per face, corridors open at the corners
    zb = z0 + ph
    h1, S2, h2, S3, h3 = 10.0, S * 0.6, 5.2, S * 0.36, 4.4
    z2 = storey("mandir_s1", S, h1, zb, 5, 1.7, 5.6, 3.0, cx, cy, amp=1.2)
    z3 = storey("mandir_s2", S2, h2, z2, 3, 1.5, 3.4, 2.0, cx, cy, amp=0.8)
    zt = storey("mandir_s3", S3, h3, z3, 3, 0.9, 2.8, 1.3, cx, cy, amp=0.55)
    # spires: 4 on the s1 terrace corners, 4 on the s2 terrace corners, 1 central on top
    pa = ratna("ratna_a", 1.35, 6.5)
    pb = ratna("ratna_b", 1.05, 5.4)
    for p in (pa, pb):
        p.location = (0, 0, -100)
        p.hide_render = True
        for c in p.children:
            c.hide_render = True
    c1 = S / 2 - 1.7
    for i, (dx, dy) in enumerate(((1, 1), (1, -1), (-1, 1), (-1, -1))):
        place_ratna(f"ratna_a{i}", pa, cx + dx * c1, cy + dy * c1, z2)
    c2 = S2 / 2 - 1.3
    for i, (dx, dy) in enumerate(((1, 1), (1, -1), (-1, 1), (-1, -1))):
        place_ratna(f"ratna_b{i}", pb, cx + dx * c2, cy + dy * c2, z3)
    ratna("ratna_c", 2.0, 9.0).location = (cx, cy, zt)


def hall_block(name, w, d, h, bays_x, bays_y, pitch, cx, cy, z0, storeys=1, pediments=("W", "E"),
               stair_faces=("W",), sills=None, plinth_h=1.2, plinth_out=1.5, arch=(2.0, 4.3), rosettes=True):
    """Closed pilastered hall on a plinth — the nat-mandir (refs M36537551, M36512944, M27969301)
    and, with storeys=2, the Radhakanta block (M69552273). Every face is a pierced wall of 9-foil
    arches (real openings into one room) with striped bundled jambs, a rosette over each arch, red
    pilaster strips between the bays and a panelled corner pilaster; above: dentil course, roof
    slab, stepped cornice, panelled parapet and a pediment with rosette and finial on the
    `pediments` faces. Plinth with framed dado panels and a stair on the `stair_faces`.
    bays_x = arches on the N/S faces, bays_y on the E/W faces; sills = {face: sill height} for
    faces whose arches are windows rather than doorways."""
    t = 0.5
    hs = h / storeys
    aw, ah = arch
    hw = aw / 2
    poly = cusped_arch_poly(aw, ah, cusps=9, steps=3)
    sur = cusped_arch_poly(aw + 0.5, ah + 0.3, cusps=9, steps=3)
    spring = poly[1][1]
    up, upsur = round_arch_poly(1.5, 2.8, steps=10), round_arch_poly(1.9, 3.05, steps=10)
    sills = sills or {}
    zb = z0 + plinth_h
    zpar = h + 0.77                                   # parapet base (slab 0.35 + two cornice steps)
    walls, rose, colon, white, stone = [], [], [], [], []
    for face, (Lf, (fx, fy), rz) in rect_faces(w, d).items():
        n = bays_x if face in "NS" else bays_y
        wl = Lf - 2 * t
        c = (wl - n * pitch) / 2                      # corner panel width
        assert c >= 0.6, f"{name}/{face}: {n} bays of {pitch} m do not fit in {wl:.1f} m"
        xs = [(i - (n - 1) / 2) * pitch for i in range(n)]
        xb = [xs[0] - pitch / 2 + pitch * i for i in range(n + 1)]
        sill = sills.get(face, 0.0)

        def P(part, dz=0.0):
            return place(part, (fx, fy, dz), rz)
        rows = [pierced_wall(wl, hs, t, [(x, sill, poly) for x in xs])]
        for k in range(1, storeys):
            rows.append(place(pierced_wall(wl, hs, t, [(x, 1.0, up) for x in xs]), (0, 0, k * hs)))
        walls.append(P(merge(*rows)))
        rose.append(P(merge(*[ring_prism(sur, poly, 0.12, "y", x, sill, -0.12) for x in xs])))
        if rosettes:
            rose.append(P(merge(*[disc(0.42, 0.14, x, sill + ah + 0.75) for x in xs])))
        colon.append(P(jambs(xs, hw, spring, sill)))
        for k in range(1, storeys):
            rose.append(P(merge(*[ring_prism(upsur, up, 0.1, "y", x, 1.0, -0.1) for x in xs]), k * hs))
        rose.append(P(merge(*[box(0.16, 0.06, h - 0.05, x, -0.03, 0.0) for x in xb])))
        if c > 1.8:
            rose.append(P(merge(*[frame_ring(c - 0.6, hs - 1.9, 0.12, 0.06, s * (wl / 2 - c / 2), 0.5, -0.06) for s in (-1, 1)])))
        # parapet panels (one per bay + corners) and dado panels on the plinth (two per bay)
        pan = [box(pitch - 0.7, 0.03, 0.55, x, -0.65 - 0.015, zpar + 0.3) for x in xs]
        if c > 1.4:
            pan += [box(c - 0.6, 0.03, 0.55, s * (wl / 2 - c / 2), -0.65 - 0.015, zpar + 0.3) for s in (-1, 1)]
        dado = [box(pitch / 2 - 0.45, 0.03, plinth_h - 0.55, x + s * pitch / 4, -plinth_out - 0.015, -plinth_h + 0.28)
                for x in xs for s in (-1, 1)]
        if c > 1.4:
            dado += [box(c - 0.5, 0.03, plinth_h - 0.55, s * (wl / 2 - c / 2), -plinth_out - 0.015, -plinth_h + 0.28) for s in (-1, 1)]
        rose.append(P(merge(*pan, *dado)))
        if face in pediments:
            white.append(P(merge(box(4.4, 0.5, 0.3, 0, -0.5, zpar + 1.22), box(3.4, 0.5, 1.3, 0, -0.5, zpar + 1.52))))
            rose.append(P(place(disc(0.45, 0.12, 0, zpar + 2.15), (0, -0.75, 0))))
            rose.append(P(finial(0.22, 0.9, 0, -0.5, zpar + 2.82)))
        if face in stair_faces:
            ns, width = 6, pitch * min(3, n) - 0.4
            stone.append(P(place(stairs(ns, width, 0.36, plinth_h / ns, "x"), (-width / 2, -plinth_out - ns * 0.36, -plinth_h))))
    posts = merge(*[box(t, t, h, sx * (w - t) / 2, sy * (d - t) / 2, 0) for sx in (-1, 1) for sy in (-1, 1)])
    body = merge(*walls, posts, box(w + 0.4, d + 0.4, 0.35, 0, 0, h))
    for k in range(1, storeys):
        body = merge(body, box(w - 2 * t - 0.1, d - 2 * t - 0.1, 0.3, 0, 0, k * hs - 0.3))     # upper floor
    new_object(name, *body, "stucco", loc=(cx, cy, zb))
    new_object(name + "_rose", *merge(*rose), "rose", loc=(cx, cy, zb))
    new_object(name + "_jambs", *merge(*colon), "colonette", loc=(cx, cy, zb))
    new_object(name + "_dentil", *rect_ring(w + 0.3, d + 0.3, 0.15, 0.3, 0, 0, h - 0.8), "dentil", loc=(cx, cy, zb))
    bands = [rect_ring(w + 0.24, d + 0.24, 0.12, 0.35, 0, 0, h - 0.4),
             rect_ring(w + 1.4, d + 1.4, 0.4, 0.12, 0, 0, zpar + 1.1)]
    for k in range(1, storeys):
        bands.append(rect_ring(w + 0.3, d + 0.3, 0.15, 0.3, 0, 0, k * hs - 0.15))              # string course
    new_object(name + "_bands", *merge(*bands), "rose", loc=(cx, cy, zb))
    white.append(moulding(w + 0.4, d + 0.4, 0, 0, h + 0.35, [(0.2, 0.22), (0.45, 0.2)]))
    new_object(name + "_cornice", *merge(*white), "white", loc=(cx, cy, zb))
    new_object(name + "_parapet", *rect_ring(w + 1.3, d + 1.3, 0.35, 1.1, 0, 0, zpar), "stucco", loc=(cx, cy, zb))
    pw, pd = w + 2 * plinth_out, d + 2 * plinth_out
    lip = plinth_h - 0.14                             # proud top course (lip 5 cm out, flush on top)
    new_object(name + "_plinth", *merge(box(pw, pd, lip, 0, 0, 0), rect_ring(pw + 0.1, pd + 0.1, 0.4, 0.14, 0, 0, lip),
                                        box(pw - 0.7, pd - 0.7, 0.14, 0, 0, lip)), "stucco", loc=(cx, cy, z0))
    if stone:
        new_object(name + "_stairs", *merge(*stone), "stone", loc=(cx, cy, zb))
    new_object(name + "_floor", *grid_plane(w - 2 * t - 0.2, d - 2 * t - 0.2, 0, 0, 0.01), "paving", loc=(cx, cy, zb))
    return zb + h + 0.35


def build_halls(L):
    ch = L["courtyard_h"]
    # nat-mandir: closed arcaded hall south of the navaratna, its north (short) side across a
    # narrow gap from the temple stair; the pedimented 7-bay fronts face the courtyard and the east
    (nx, ny), (nw, nd), nh = L["natmandir_center"], L["natmandir_size"], L["natmandir_h"]
    hall_block("nat", nw, nd, nh, 3, 7, 3.0, nx, ny, ch, pediments=("W", "E"), stair_faces=("W",),
               sills={"N": 0.9, "S": 0.9})
    # Radhakanta (Vishnu) temple: two-storey block with the shrine's spire on the roof
    (vx, vy), (vw, vd), vh = L["vishnu_center"], L["vishnu_size"], L["vishnu_h"]
    top = hall_block("vishnu", vw, vd, vh, 5, 8, 3.0, vx, vy, ch, storeys=2, pediments=("W",), stair_faces=("W",),
                     sills={"N": 0.9, "S": 0.9, "E": 0.9}, arch=(1.9, 3.8), rosettes=False)
    sx, sy = vx, vy - vd / 2 + 6.0
    new_object("vishnu_spire_base", *box(5.0, 5.0, 0.6, 0, 0, 0), "stucco", bevel=0.04, loc=(sx, sy, top))
    ratna("vishnu_spire", 1.8, 6.5).location = (sx, sy, top + 0.6)


def sphere(r, cx, cy, cz, segs=12, rows=6):
    prof = [(0.0 if k in (0, rows) else r * math.sin(math.pi * k / rows), -r * math.cos(math.pi * k / rows))
            for k in range(rows + 1)]
    return lathe(prof, segs, cx, cy, cz)


def set_gores(ob, alt, n, cx=0.0, cy=0.0):
    """Alternate the faces of a body of revolution about (cx, cy) between its own material and `alt`
    by the sector their centroid falls in — the umbrella dome's red/cream gores."""
    me = ob.data
    me.materials.append(MATS[alt])
    for poly in me.polygons:
        c = poly.center
        k = int(((math.atan2(c.y - cy, c.x - cx) + 2 * math.pi) % (2 * math.pi)) / (2 * math.pi) * n)
        poly.material_index = k % 2


def drape_sheet(h, nu=16, nv=24, top=1.5, tie=0.42, vt=0.55, foot=0.95, r=0.2):
    """One tied-back curtain as a (verts, faces, uvs) grid in a local frame: hangs in the x–z plane
    from the beam at z = h to the floor beside a column of radius r at the origin, the free edge
    (u = 1, marigold hem in the shader) swinging out along +x, +y toward the room. Spread `top`
    along the beam, its edge swags (quarter ellipse) into the tie at the column at height vt, then
    the skirt flares to `foot` on the floor; the loop bulges into the room, folds deepen downward."""
    verts, uvs = [], []
    for j in range(nv + 1):
        v = j / nv
        if v <= vt:
            t = v / vt
            xo = tie + (top - tie) * math.sqrt(max(0.0, 1 - t * t))
            xi = r + 0.02 - 0.06 * t
            bulge = 0.25 * math.sin(math.pi * t)
        else:
            t = (v - vt) / (1 - vt)
            xo = tie + (foot - tie) * t * t
            xi = r - 0.04 - 0.06 * t
            bulge = 0.0
        for i in range(nu + 1):
            u = i / nu
            x = xi + (xo - xi) * u
            y = 0.16 + bulge * u + 0.06 * (0.3 + 0.7 * v) * math.sin(2 * math.pi * 3 * u + 4 * v)
            verts.append((x, y, h * (1 - v) + 0.01))
            uvs.append((u, v * h))
    faces = [(j * (nu + 1) + i, j * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i)
             for j in range(nv) for i in range(nu)]
    return verts, faces, uvs


def build_mandap(L):
    """Wedding mandap (refs data/reference/mandap/mandap1-4.png) centred on the cross walk that leads to the navaratna,
    midway across the courtyard strip: a white-clad stage with carpeted steps on three sides (the
    front faces west, toward the ghat walk), four turned sandstone columns, a white canopy hung
    with a rose garland and marigold valance, tied-back drapes at every column, an eight-gored
    red/cream umbrella dome on the roof and the havan kund in the middle."""
    ch = L["courtyard_h"]
    _, _, mx = strip_extent(L)
    my = L["courtyard_cy"]
    W, H = 5.8, 0.62                                  # stage footprint and height
    ztop = ch + H
    new_object("mandap_stage", *box(W, W, H, mx, my, ch), "cloth", bevel=0.03)
    # steps: white flights with a red runner 2 cm proud on both tread and riser
    n, tread, rise = 3, 0.33, H / 3
    run = n * tread
    e = W / 2
    steps, runners = [], []
    steps.append(place(stairs(n, 2.6, tread, rise, "y"), (mx - e - run, my - 1.3, ch)))
    runners.append(place(stairs(n, 2.0, tread, rise, "y"), (mx - e - run - 0.02, my - 1.0, ch + 0.02)))
    steps.append(place(stairs(n, 1.8, tread, rise, "x"), (mx - 0.9, my - e - run, ch)))
    runners.append(place(stairs(n, 1.3, tread, rise, "x"), (mx - 0.65, my - e - run - 0.02, ch + 0.02)))
    steps.append(place(stairs(n, 1.8, tread, rise, "x"), (mx + 0.9, my + e + run, ch), math.pi))
    runners.append(place(stairs(n, 1.3, tread, rise, "x"), (mx + 0.65, my + e + run + 0.02, ch + 0.02), math.pi))
    new_object("mandap_steps", *merge(*steps), "cloth")
    new_object("mandap_runners", *merge(*runners), "carpet")
    # four turned columns on square blocks; the canopy rests on their capitals
    c, hc = 2.3, 3.0
    prof = [(0, 0), (0.27, 0), (0.27, 0.05), (0.21, 0.08), (0.18, 0.11), (0.24, 0.28), (0.26, 0.45), (0.23, 0.6),
            (0.17, 0.7), (0.14, 0.76), (0.14, 1.22), (0.175, 1.26), (0.175, 1.34), (0.14, 1.38), (0.14, 1.92),
            (0.175, 1.96), (0.175, 2.04), (0.14, 2.08), (0.14, 2.55), (0.17, 2.62), (0.23, 2.78), (0.26, 2.9),
            (0.26, hc), (0, hc)]
    corners = [(sx, sy) for sx in (-1, 1) for sy in (-1, 1)]
    blk = new_object("mandap_col_block", *box(0.56, 0.56, 0.11, 0, 0, 0), "mandap_stone", bevel=0.02,
                     loc=(mx - c, my - c, ztop - 0.01))
    col = new_object("mandap_column", *lathe(prof, 24, rib=8, rib_amp=0.04), "mandap_stone", smooth=True,
                     loc=(mx - c, my - c, ztop + 0.09))
    for k, (sx, sy) in enumerate(corners[1:]):
        instance(f"mandap_col_block_{k}", blk, (mx + sx * c, my + sy * c, ztop - 0.01))
        instance(f"mandap_column_{k}", col, (mx + sx * c, my + sy * c, ztop + 0.09))
    zc = ztop + 0.09 + hc - 0.01                       # canopy underside (columns sink 1 cm into it)
    new_object("mandap_canopy", *box(W - 0.2, W - 0.2, 0.16, mx, my, zc), "cloth", bevel=0.02)
    new_object("mandap_garland", *rect_ring(W + 0.4, W + 0.4, 0.35, 0.34, mx, my, zc - 0.09), "garland", bevel=0.08)
    new_object("mandap_valance", *rect_ring(W + 0.2, W + 0.2, 0.04, 0.22, mx, my, zc - 0.31), "marigold")
    urn = [(0, 0), (0.17, 0), (0.17, 0.04), (0.09, 0.07), (0.11, 0.14), (0.2, 0.28), (0.2, 0.4), (0.13, 0.48),
           (0.07, 0.53), (0.1, 0.58), (0.04, 0.64), (0, 0.7)]
    zt = zc + 0.16                                     # canopy top
    cu = W / 2 - 0.45
    u0 = new_object("mandap_urn", *lathe(urn, 16), "mandap_stone", smooth=True, loc=(mx - cu, my - cu, zt - 0.01))
    for k, (sx, sy) in enumerate(corners[1:]):
        instance(f"mandap_urn_{k}", u0, (mx + sx * cu, my + sy * cu, zt - 0.01))
    # umbrella dome on the roof: red valance skirt, cream drum, gold plate, eight-gored dome
    new_object("mandap_skirt", *lathe([(0, -0.01), (1.75, -0.01), (1.35, 0.5), (0, 0.5)], 8, mx, my, zt), "red_cloth")
    new_object("mandap_drum", *lathe([(0, 0.45), (1.3, 0.45), (1.3, 0.9), (0, 0.9)], 8, mx, my, zt), "cloth")
    new_object("mandap_plate", *lathe([(0, 0.9), (1.5, 0.9), (1.5, 1.0), (0, 1.0)], 8, mx, my, zt), "gold")
    dome = new_object("mandap_dome", *lathe([(0, 1.0), (1.28, 1.0), (1.27, 1.2), (1.18, 1.42), (1.0, 1.62),
                                             (0.72, 1.78), (0.38, 1.88), (0, 1.92)], 8, mx, my, zt), "cloth")
    set_gores(dome, "red_cloth", 8, mx, my)
    post = [(0, 0), (0.065, 0), (0.065, 0.04), (0.035, 0.06), (0.055, 0.14), (0.035, 0.22), (0.045, 0.26), (0, 0.32)]
    p0 = new_object("mandap_post", *lathe(post, 8), "mandap_stone", loc=(mx + 1.4, my, zt + 0.99))
    for k in range(1, 8):
        t = 2 * math.pi * k / 8
        instance(f"mandap_post_{k}", p0, (mx + 1.4 * math.cos(t), my + 1.4 * math.sin(t), zt + 0.99))
    new_object("mandap_top", *finial(0.2, 0.55, mx, my, zt + 1.86), "mandap_stone", smooth=True)
    # drapes: two per column, spread along each beam and tied back to the shaft
    dv, df, duv = drape_sheet(hc + 0.09)
    for (sx, sy) in corners:
        along_x = [(mx + sx * c - sx * x, my + sy * c - sy * y, ztop + z) for (x, y, z) in dv]
        along_y = [(mx + sx * c - sx * y, my + sy * c - sy * x, ztop + z) for (x, y, z) in dv]
        new_object(f"mandap_drape_{sx}{sy}x_sheet", along_x, df, "drape", smooth=True, auto_smooth=80, uvs=duv)
        new_object(f"mandap_drape_{sx}{sy}y_sheet", along_y, df, "drape", smooth=True, auto_smooth=80, uvs=duv)
    # havan kund on a marigold-ringed round, two brass lamps
    new_object("mandap_round", *lathe([(0, -0.01), (0.95, -0.01), (0.95, 0.08), (0, 0.08)], 24, mx, my, ztop), "marigold")
    new_object("mandap_round_top", *lathe([(0, 0.02), (0.72, 0.02), (0.72, 0.11), (0, 0.11)], 24, mx, my, ztop), "cloth")
    new_object("mandap_kund", *box(0.55, 0.55, 0.3, mx, my, ztop + 0.10), "copper")
    new_object("mandap_kund_rim", *rect_ring(0.68, 0.68, 0.08, 0.05, mx, my, ztop + 0.39), "copper")
    new_object("mandap_kund_ash", *box(0.5, 0.5, 0.02, mx, my, ztop + 0.39), "dark")
    new_object("mandap_lamps", *merge(finial(0.07, 0.4, mx - 0.5, my + 0.45, ztop + 0.10),
                                      finial(0.07, 0.4, mx + 0.5, my + 0.45, ztop + 0.10)), "gold", smooth=True)
    # flower clusters at the foot of the stage and flanking the front steps
    zf = ch + 0.03
    balls = []
    for (sx, sy) in corners:
        bx, by = mx + sx * (e + 0.15), my + sy * (e + 0.15)
        balls += [sphere(0.38, bx, by, zf + 0.30), sphere(0.30, bx + sx * 0.4, by, zf + 0.24),
                  sphere(0.28, bx, by + sy * 0.4, zf + 0.22)]
    for sy in (-1, 1):
        balls += [sphere(0.34, mx - e - 0.35, my + sy * 1.6, zf + 0.27), sphere(0.27, mx - e - 0.85, my + sy * 1.5, zf + 0.21)]
    new_object("mandap_flowers", *merge(*balls), "garland", smooth=True)


def build_trees(L):
    """A few stylised palms on the far bank and behind the east arcade — silhouettes only."""
    trunk = lathe([(0, 0), (0.25, 0), (0.18, 9), (0, 9)], 8)
    fronds = []
    for k in range(9):
        t = 2 * math.pi * k / 9
        cx_, cy_ = math.cos(t), math.sin(t)
        pts = []
        for j in range(6):          # droop curve
            u = j / 5
            pts.append((cx_ * 3.2 * u, cy_ * 3.2 * u, 9.0 + 1.2 * math.sin(u * 2.2) - 1.6 * u * u))
        verts, faces = [], []
        for j, (px, py, pz) in enumerate(pts):
            w = 0.55 * math.sin(math.pi * min(1, 0.15 + j / 5))
            verts += [(px - cy_ * w, py + cx_ * w, pz), (px + cy_ * w, py - cx_ * w, pz)]
            if j:
                a = 2 * (j - 1)
                faces.append((a, a + 1, a + 3, a + 2))
        fronds.append((verts, faces))
    crown = merge(*fronds)
    t = new_object("palm_trunk", *trunk, "dark")
    c = new_object("palm_crown", *crown, "green", smooth=True)
    c.parent = t
    t.location = (0, 0, -100)
    t.hide_render = c.hide_render = True
    # the river is directly west of the complex, so near trees only stand east, north and south of it
    spots = [(34, 74), (40, 44), (38, -34), (44, -72), (6, 78), (-14, -82), (-30, 84), (24, -90)]
    rx = L["river_x"] - 250
    import random
    rnd = random.Random(7)
    spots += [(rx - 8 - rnd.random() * 30, -600 + k * 23 + rnd.random() * 10) for k in range(52)]
    blob = merge(*[lathe([(0, 0), (r, 0), (r * 1.1, hh * 0.35), (r * 0.8, hh * 0.75), (0, hh)], 10, ox, oy, 5 + oz)
                   for (r, hh, ox, oy, oz) in ((4.5, 6, 0, 0, 0), (3.5, 5, 3, 1, 1), (3.2, 4.5, -2.5, -2, 0.5), (2.8, 4, 0.5, 3, 1.5))])
    b = new_object("canopy", *blob, "green", smooth=True, auto_smooth=80)
    b.location = (0, 0, -100)
    b.hide_render = True
    for k in range(70):
        instance(f"canopy_{k}", b, (rx - 20 - rnd.random() * 120, -700 + k * 20 + rnd.random() * 15, 0),
                 rot_z=rnd.random() * 6, scale=(1 + rnd.random() * 0.8,) * 3)
    for k, (x, y) in enumerate([(34, 62), (40, 18), (36, -22), (44, -60), (18, 82), (-24, 80), (-20, -84), (30, -84), (8, 90), (-4, -96)]):
        instance(f"canopy_n{k}", b, (x, y, 0), rot_z=k * 1.3, scale=(1.1 + (k % 3) * 0.3,) * 3)
    for i, (x, y) in enumerate(spots):
        p = instance(f"palm_{i}", t, (x, y, 0), rot_z=i * 0.7, scale=(1, 1, 0.9 + 0.1 * (i % 3)))
        cc = instance(f"palm_{i}_crown", c, (0, 0, 0))
        cc.parent = p


# ------------------------------------------------------------------------------------------------
# Lighting, cameras, render
# ------------------------------------------------------------------------------------------------
def hdri_sun_direction(img: bpy.types.Image) -> Vector:
    """World-space direction of the brightest texel of an equirectangular HDRI (Cycles convention:
    u = 0.5 - atan2(y, x) / 2π, v = 0.5 + elevation / π; verified with a shadow probe)."""
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    lum = px.reshape(h, w, 4)[..., :3].sum(-1)
    iy, ix = np.unravel_index(lum.argmax(), lum.shape)
    u, v = (ix + 0.5) / w, (iy + 0.5) / h
    phi, el = (0.5 - u) * 2 * math.pi, (v - 0.5) * math.pi
    return Vector((math.cos(phi) * math.cos(el), math.sin(phi) * math.cos(el), math.sin(el)))


def setup_world_and_light():
    sc = bpy.context.scene
    w = bpy.data.worlds.new("World")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    sky_path = TEX_DIR / "sky.hdr"
    target = Vector((math.sin(math.radians(SUN_BEARING)), math.cos(math.radians(SUN_BEARING)), 0.0))
    if sky_path.exists():
        img = bpy.data.images.load(str(sky_path), check_existing=True)
        d0 = hdri_sun_direction(img)
        # Mapping rotation about Z so the HDRI's sun ends up at SUN_BEARING; the Mapping node
        # rotates the lookup vector, so the environment turns the other way.
        theta = math.atan2(d0.y, d0.x) - math.atan2(target.y, target.x)
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Rotation"].default_value = (0.0, 0.0, theta)
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = img
        clamp = nt.nodes.new("ShaderNodeVectorMath")       # tame the sun disc: the lamp does direct light
        clamp.operation = "MINIMUM"
        clamp.inputs[1].default_value = (12.0, 12.0, 12.0)
        nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], env.inputs["Vector"])
        nt.links.new(env.outputs["Color"], clamp.inputs[0])
        nt.links.new(clamp.outputs["Vector"], bg.inputs["Color"])
        bg.inputs[1].default_value = 1.0
        el = math.asin(d0.z)
        print(f"  sky.hdr: sun elevation {math.degrees(el):.1f}°, rotated {math.degrees(theta):.1f}° to bearing {SUN_BEARING}°")
    else:
        print("  sky.hdr missing (run render.sh to fetch it) — falling back to the Hosek-Wilkie sky")
        sky = nt.nodes.new("ShaderNodeTexSky")
        sky.sky_type = "HOSEK_WILKIE"
        sky.turbidity = 5.0
        sky.ground_albedo = 0.35
        el = math.radians(38)
        sky.sun_direction = (target.x * math.cos(el), target.y * math.cos(el), math.sin(el))
        nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
        bg.inputs[1].default_value = 0.6
    sun_dir = Vector((target.x * math.cos(el), target.y * math.cos(el), math.sin(el)))
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 4.0
    sun_data.angle = math.radians(0.9)
    sun_data.color = (1.0, 0.95, 0.86)
    sun = bpy.data.objects.new("sun", sun_data)
    sun.rotation_euler = sun_dir.to_track_quat("Z", "Y").to_euler()   # lamp shines down its -Z
    COL.objects.link(sun)


def look_at(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def add_camera(name, loc, target, lens=35):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.clip_end = 2000
    cam = bpy.data.objects.new(name, cd)
    cam.location = loc
    COL.objects.link(cam)
    look_at(cam, target)
    return cam


def configure_render(res, samples):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.view_layers[0].cycles.use_denoising = False
    # adaptive subdivision: render-time dicing of the displaced paving (nothing dense is stored)
    sc.cycles.feature_set = "EXPERIMENTAL"
    sc.cycles.dicing_rate = 1.5
    sc.cycles.max_subdivisions = 6              # 2 m base quads → ≈3 cm micro-polygons at most
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.view_settings.exposure = 0.0


STILLS = {
    # name: (location, target, lens) — matched to the references
    "overview_SE": ((96, -112, 72), (-6, 0, 18), 32),      # the video's elevated angle
    "river_W": ((-115, -25, 6), (-6, 0, 14), 40),         # from the Hooghly, spires over the Shiva row
    "courtyard": ((-25, -13, 3.0), (-1, 2, 12), 26),      # eye level in the courtyard strip, mandap at left
    "spires": ((28, -28, 24), (0, 0, 20), 50),            # the three storeys and the nine ratnas
    "shiva": ((-14, -26, 2.6), (-32, -8, 7), 35),         # along the Shiva row toward the ghat
    "shiva_door": ((-16, -24, 3.0), (-32, -12.85, 5.0), 35),  # one temple: door face + side window
    "verandah": ((-15, -19, 4.8), (-4, -4, 7.5), 32),     # navaratna SW corner: see-through corridor
    "natmandir": ((-22, -43.5, 2.6), (-2, -25, 8), 24),  # M27969301: the hall's 7-bay front + end, navaratna behind
    "arcade": ((-17, 52.0, 1.7), (26, 51.8, 3.0), 30),    # M69552267: along the (sunlit) north colonnade walkway
    "radhakanta": ((-22, 47.5, 2.6), (-2, 30, 8), 24),    # M69552273: the two-storey block's pedimented W front
    "mandap": ((-31.0, 0.5, 2.9), (-16.4, 3.0, 4.6), 28),   # mandap1-4.png: up the walk from the ghat gap, navaratna behind
    "mandap_close": ((-22.5, -4.5, 5.0), (-16.5, 3.0, 4.0), 35),  # columns, drapes, dome and kund up close
    "top": ((-9.5, 3, 335), (-9.5, 3, 0), 50),            # plan view to compare with the satellite
}


def render_stills(out: Path, res, samples):
    sc = bpy.context.scene
    configure_render(res, samples)
    for name, (loc, tgt, lens) in STILLS.items():
        cam = add_camera("cam_" + name, loc, tgt, lens)
        sc.camera = cam
        sc.render.filepath = str(out / f"still_{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"  rendered {sc.render.filepath}")


def render_turntable(out: Path, res, samples, frames):
    sc = bpy.context.scene
    configure_render(res, samples)
    pivot = bpy.data.objects.new("turntable", None)
    COL.objects.link(pivot)
    pivot.location = (-6, 0, 8)
    cam = add_camera("cam_turntable", (-6, -150, 55), (-6, 0, 8), 35)
    cam.parent = pivot
    sc.frame_start, sc.frame_end = 1, frames
    pivot.rotation_euler = (0, 0, 0)
    pivot.keyframe_insert("rotation_euler", frame=1)
    pivot.rotation_euler = (0, 0, math.radians(360))
    pivot.keyframe_insert("rotation_euler", frame=frames + 1)
    for fc in pivot.animation_data.action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
    sc.camera = cam
    sc.render.filepath = str(out / "turntable" / "frame_")
    bpy.ops.render.render(animation=True)
    print(f"  turntable frames → {out / 'turntable'}")


def mesh_audit() -> None:
    """Every solid must be closed: report boundary (open) edges per mesh, skipping the intentional
    sheets (ground planes, water, palm fronds). Printed in the build log so a regression is visible."""
    import bmesh
    open_sheets = {"ground", "river", "bank", "far_bank", "paving", "palm_crown"}
    bad, faces = [], 0
    for me in bpy.data.meshes:
        if me.users == 0:
            continue
        faces += len(me.polygons) * me.users
        if me.name in open_sheets or me.name.endswith(("_floor", "_sheet")):
            continue
        bm = bmesh.new()
        bm.from_mesh(me)
        n = sum(1 for e in bm.edges if e.is_boundary)
        bm.free()
        if n:
            bad.append(f"{me.name}:{n}")
    print(f"  mesh audit: {faces} stored faces across instances; open edges: {', '.join(bad) or 'none'}")


# ------------------------------------------------------------------------------------------------
def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "data" / "blender"))
    ap.add_argument("--mode", choices=["massing", "full"], default="full")
    ap.add_argument("--render", choices=["none", "stills", "turntable", "both"], default="stills")
    ap.add_argument("--res", default="1280x720")
    ap.add_argument("--samples", type=int, default=64)
    ap.add_argument("--frames", type=int, default=48)
    ap.add_argument("--only", help="comma list of stills to render (names from STILLS)")
    a = ap.parse_args(argv)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    res = tuple(int(v) for v in a.res.lower().split("x"))

    reset_scene()
    make_materials()
    load_trace()
    L = LAYOUT
    build_ground(L)
    build_boundary(L)
    build_shiva_row(L)
    build_navaratna(L)
    build_halls(L)
    build_mandap(L)
    if a.mode == "full":
        build_trees(L)
    setup_world_and_light()
    configure_render(res, a.samples)
    mesh_audit()
    print(f"  built {len(COL.objects)} objects")
    blend = out / "dakshineswar.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    print(f"  saved {blend}")
    if a.only:
        keep = set(a.only.split(","))
        for k in list(STILLS):
            if k not in keep:
                del STILLS[k]
    if a.render in ("stills", "both"):
        render_stills(out, res, a.samples)
    if a.render in ("turntable", "both"):
        render_turntable(out, res, a.samples, a.frames)


if __name__ == "__main__":
    main()
