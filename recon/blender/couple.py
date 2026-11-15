"""The bride and groom for the site: `public/models/couple.glb`.

Two rigged, textured characters (free_assets/boy-character.blend, girl-character.blend — Rigify
rigs, one 8k PBR atlas each) posed and given an in-place walk cycle, decimated, their maps shrunk,
and exported as one skinned glb that `src/scene/couple.js` loads and walks round the agni. They
are a runtime model like the deity's picture: never part of scene.blend or its bake.

    blender -b -P recon/blender/couple.py -- [--out recon/data/web/couple.glb] [--shots DIR] [--pose-only]

Then (render.sh couple):  npx gltf-transform resize --width 2048 --height 2048 … ; webp ; meshopt.
"""
import argparse
import math
import os
import sys
import time

import bmesh
import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))   # the repo
ASSETS = os.path.join(ROOT, "free_assets")

FPS = 24
CYCLE = 40                     # frames per walk cycle (two steps): 1.667 s
STRIDE = 0.42                  # metres a step: the cycle covers 0.84 m, couple.js matches its speed to that
LIFT = 0.07

CHARS = {
    # name: (file, rig, meshes to keep, decimate ratio per mesh, hair mesh without weights → head)
    "groom": ("boy-character.blend", "indian_groom_rig", ["indian_groom", "suit", "turban", "def_hairstyle"],
              {"indian_groom": 0.6, "suit": 0.7, "turban": 0.6, "def_hairstyle": 0.8}, None),
    "bride": ("girl-character.blend", "indian_bride_rig", ["indian_bride", "def_outfit", "veil", "def_hair"],
              {"indian_bride": 0.6, "def_outfit": 0.7, "veil": 0.5, "def_hair": 0.25}, "def_hair"),
}
HEAD_BONE = "DEF-spine.006"


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def clean(keep, rig_name):
    """Drop everything but the character: widget meshes, control frames, alternates, hidden extras."""
    keep = set(keep) | {rig_name}
    for ob in list(bpy.data.objects):
        if ob.name not in keep:
            bpy.data.objects.remove(ob)
    for coll in list(bpy.data.collections):
        if not coll.objects and not coll.children:
            bpy.data.collections.remove(coll)
    bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)


def set_bone(rig, name, offset=None, rot=None, frame=None):
    """Move a control bone by `offset` (armature space, from its rest place) and/or rotate it
    (`rot`: euler degrees about its own axes), and key it."""
    pb = rig.pose.bones[name]
    if offset is None:
        # a rotation only is set in the bone's local channels, so the bone keeps following its
        # parent: an armature-space matrix would pin a child (hips under torso, the head under
        # the neck) at its rest place while the torso bobs, and the spine and neck would stretch
        # between them every step (the head, turban and hair squashing in the glb)
        q = Euler([math.radians(r) for r in rot], "ZYX").to_quaternion()
        pb.location = (0, 0, 0)
        if pb.rotation_mode == "QUATERNION":
            pb.rotation_quaternion = q
        else:
            pb.rotation_euler = q.to_euler(pb.rotation_mode)
        if frame is not None:
            pb.keyframe_insert("rotation_quaternion" if pb.rotation_mode == "QUATERNION" else "rotation_euler", frame=frame)
        return
    m = pb.bone.matrix_local.copy()
    if rot is not None:
        m = m @ Matrix.Rotation(math.radians(rot[0]), 4, "X") @ Matrix.Rotation(math.radians(rot[1]), 4, "Y") @ Matrix.Rotation(math.radians(rot[2]), 4, "Z")
    if offset is not None:
        m = Matrix.Translation(Vector(offset)) @ m
    pb.matrix = m
    bpy.context.view_layer.update()
    if frame is not None:
        pb.keyframe_insert("location", frame=frame)
        pb.keyframe_insert("rotation_quaternion" if pb.rotation_mode == "QUATERNION" else "rotation_euler", frame=frame)


def walk_cycle(rig, who):
    """An in-place walk: the stance foot slides back under the body, the swing foot lifts and comes
    forward; the torso bobs down at each contact; the arms hang relaxed and swing
    opposite the legs (`arm_swing`). The character faces -Y."""
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, CYCLE
    sc.render.fps = FPS
    if rig.animation_data:          # the action only: animation_data_clear() would also drop the rig's drivers (its IK/FK switches)
        rig.animation_data.action = None
    q = CYCLE // 4
    fwd = Vector((0, -STRIDE / 2, 0))
    # feet: contact (front) → toe-off (back) linearly, then a lifted pass through the middle
    for side, phase in (("L", 0), ("R", 2 * q)):
        name = f"foot_ik.{side}"
        keys = [(0, fwd), (2 * q, -fwd), (3 * q, Vector((0, 0, LIFT))), (4 * q, fwd)]
        for k, off in keys:
            f = (k + phase) % CYCLE
            set_bone(rig, name, off, frame=f + 1)
            if f == 0:
                set_bone(rig, name, off, frame=CYCLE + 1)     # the loop closes on the same key (frame CYCLE+1 = frame 1; the export stops at CYCLE)
    # torso: down at each contact, up at each passing; hips yaw with the leading leg
    for k, dz, yaw in ((0, -0.02, 4), (q, 0.01, 0), (2 * q, -0.02, -4), (3 * q, 0.01, 0), (4 * q, -0.02, 4)):
        set_bone(rig, "torso", (0, 0, dz), frame=k + 1)
        set_bone(rig, "hips", None, rot=(0, 0, yaw), frame=k + 1)
    arm_swing(rig, who)
    relax_hands(rig)
    set_bone(rig, "head", None, rot=(-4, 0, 0) if who == "groom" else (10, 0, 0), frame=1)   # the bride's a little bowed
    # the stance (front contact → toe-off) is linear so the foot's speed over the ground is
    # constant; the swing keeps its bezier ease
    act = rig.animation_data.action
    contact = {"L": {1, CYCLE + 1}, "R": {2 * q + 1}}
    fcurves = [fc for layer in act.layers for strip in layer.strips for cb in strip.channelbags for fc in cb.fcurves]   # 5.x layered actions
    for fc in fcurves:
        for kp in fc.keyframe_points:
            kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
            for side, frames in contact.items():
                if fc.data_path.startswith(f'pose.bones["foot_ik.{side}"]') and round(kp.co.x) in frames:
                    kp.interpolation = "LINEAR"
    act.name = "walk"


# arms: (outward lean of the hanging upper arm, its swing either way in degrees, elbow bend at the
# back and front of the swing in degrees, on top of the rest pose's ~15° once the arm hangs: the elbow
# ends at ~8° behind, ~25° in front) — the bride's held a little wider of the lehenga and calmer
ARMS = {"groom": (0.17, 16, (-7, 10)), "bride": (0.30, 11, (-5, 12))}
TWIST = 35                     # degrees the forearm turns about its length: the T-pose's palms-forward → palms to the thighs
WRIST = 4                      # degrees the hand flexes toward its palm off the forearm's line (the rest pose has ~15–17°, which
                               # with the arm hanging reads as a hand cocked forward and in: a crooked wrist)


def arm_swing(rig, who):
    """Relaxed arms on the FK chain: the upper arm hangs just off the body and swings opposite
    its leg (forward as the other foot lands), the elbow bending more on the forward swing; the
    hand held near the forearm's line (palm to the thigh, `WRIST`). Keyed as local rotations on the FK controls,
    worked out from the rest pose (the rig rests in a T, palms down)."""
    out, swing, (bend_back, bend_front) = ARMS[who]
    q = CYCLE // 4
    for side, sgn, phase in (("L", 1, 2 * q), ("R", -1, 0)):      # the left arm is forward when the right foot is (frame 2q+1)
        rig.pose.bones[f"upper_arm_parent.{side}"]["IK_FK"] = 1.0   # FK: the hand_ik targets no longer pull
        up = rig.pose.bones[f"upper_arm_fk.{side}"]
        fore = rig.pose.bones[f"forearm_fk.{side}"]
        U = up.bone.matrix_local.to_3x3()
        F = fore.bone.matrix_local.to_3x3()
        hand = rig.pose.bones[f"hand_fk.{side}"]
        H = hand.bone.matrix_local.to_3x3()
        t = (H.inverted() @ F.col[1]).normalized()                  # the forearm's line in the hand's rest frame
        n = Vector((sgn, 0, 0)); n = (n - n.project(t)).normalized()   # the palm's side (+X on the left hand, −X on the right)
        w = math.radians(WRIST)
        hand.rotation_quaternion = Vector((0, 1, 0)).rotation_difference(t * math.cos(w) + n * math.sin(w))
        hand.keyframe_insert("rotation_quaternion", frame=1)        # held: the wrist near straight all cycle
        for k in range(0, CYCLE + 1, q):
            f = (k + phase) % CYCLE
            a = math.cos(2 * math.pi * k / CYCLE)                    # +1 forward … −1 back
            ang = math.radians(swing * a)
            d = Vector((sgn * out, -math.sin(ang), -math.cos(ang))).normalized()   # forward is −Y
            qu = Vector((0, 1, 0)).rotation_difference(U.inverted() @ d)
            # the elbow: about the forearm's X, signed so the hand comes forward
            Fp = U @ qu.to_matrix() @ U.inverted() @ F
            s = 1 if Fp.col[2].y < 0 else -1
            bend = bend_back + (bend_front - bend_back) * (a + 1) / 2
            qf = Quaternion((1, 0, 0), s * math.radians(bend)) @ Quaternion((0, 1, 0), -sgn * math.radians(TWIST))
            for frame in ((f + 1, CYCLE + 1) if f == 0 else (f + 1,)):
                up.rotation_quaternion = qu
                fore.rotation_quaternion = qf
                up.keyframe_insert("rotation_quaternion", frame=frame)
                fore.keyframe_insert("rotation_quaternion", frame=frame)


# relaxed fingers: degrees each joint (.01 knuckle, .02, .03) curls toward the palm — the asset rests with the
# hand flat and spread, which on a hanging arm reads as a stiff, crooked hand; more curl toward the pinky
CURL = {"f_index": (12, 26, 16), "f_middle": (16, 30, 18), "f_ring": (20, 34, 20), "f_pinky": (24, 38, 20), "thumb": (0, 14, 18)}


def relax_hands(rig):
    """Curl the fingers a little toward the palm, held all cycle. The palm's side comes from the
    hand's line and the thumb (left hand: line × thumb), and the curl's sign is found by trying it
    on each finger, so the rig's bone rolls don't matter."""
    P = rig.pose.bones
    vl = bpy.context.view_layer
    for side, sgn in (("L", 1), ("R", -1)):
        vl.update()
        h = P[f"DEF-hand.{side}"]
        y = (h.tail - h.head).normalized()
        t = P[f"DEF-thumb.02.{side}"].head - h.head
        palm = sgn * y.cross(t - t.project(y)).normalized()
        for finger, angles in CURL.items():
            tip = P[f"DEF-{finger}.03.{side}"]
            joints = [(P[f"{finger}.{j}.{side}"], math.radians(deg)) for j, deg in zip(("01", "02", "03"), angles)]
            before = tip.tail.copy()
            for pb, _ in joints:                                    # probe: the whole finger 30° about +X
                pb.rotation_quaternion = Quaternion((1, 0, 0), math.radians(30))
            vl.update()
            s = 1 if (tip.tail - before).dot(palm) > 0 else -1     # −1: +X opens the hand on this rig
            for pb, ang in joints:
                pb.rotation_quaternion = Quaternion((1, 0, 0), s * ang)
                pb.keyframe_insert("rotation_quaternion", frame=1)
            vl.update()


# the gathbandhan: each dupatta's free end is laid on a chain of bones of its own (`DEF-tie.1` …,
# all on the hips), each at the middle of a band of the cloth, the bands spaced evenly from where
# the free end starts (u 0) to its tip (u 1); every vertex is shared between the two bones either
# side of its u, the first band blending back into the character's own skin, so moving and turning
# the bones bends the cloth along any curve. couple.js gathers the bride's veil edge into a rope
# that runs through the knot and hangs on as one tail, and wraps the groom's stole end once round
# it — the loop of the knot — its tip hanging as the other tail: the characters' own uttariya and
# veil tied, no extra cloth. Rest space (the characters face −y, so +x is their left, the side out
# of the circle the guest watches): the groom's stole's left end, in front of him from the waist to
# its tip at z 0.68, and an 8 cm strip along the veil's left edge (it widens to the hem: x max ≈
# 0.507 − 0.27 z).
def _smooth(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


TIE = {
    # name: (mesh, height the free end starts at (u 0), its tip's (u 1), how much of a vertex is on
    #        it across the cloth (0 not at all … 1 wholly), the bones' places along it (u), cuts to
    #        subdivide the free end by)
    # groom: the stole's left end, in front of him from the waist to its tip at z 0.68 — the
    # knot's straight core; its base cage has rows ~10 cm apart, too coarse to bend, hence the cuts
    "groom": ("suit", 1.15, 0.68, lambda p: 1.0 if p.x > 0.0 and p.y < 0.02 else 0.0,
              [k / 6 for k in range(1, 7)], 3),
    # bride: a strip along the veil's front left edge (x max ≈ 0.507 − 0.27 z), VEIL_STRIP wide, slit
    # from the rest of the veil from its hem up to z 0.92 so it hangs free from there (couple.js
    # draws it across to him); five bones on the run across, eight close together for the turn
    # round his stole (a loop needs that many: skinning cuts the chords), two on the tail
    "bride": ("veil", 0.92, 0.14, None,
              [0.1, 0.2, 0.3, 0.4, 0.5] + [0.57 + 0.04 * j for j in range(8)] + [0.92, 1.0], 0),
}
VEIL_STRIP = 0.08
TIE_KEEP = "tie_keep"                                # the free end, kept out of the decimation


def stole_parts(ob):
    """The groom's stole: the suit's loose parts that hang below the waist but aren't the kurta or
    the trousers (the two biggest)."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    seen, parts = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, comp = [v], []
        seen.add(v.index)
        while stack:
            x = stack.pop()
            comp.append(x.index)
            for e in x.link_edges:
                o = e.other_vert(x)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        parts.append(comp)
    bm.free()
    parts.sort(key=len, reverse=True)
    co = ob.data.vertices
    return {i for c in parts[2:] if len(c) > 300 and min(co[j].co.z for j in c) < 0.6 for i in c}


def veil_strip(ob, z0):
    """Slit the veil's tie strip from the rest of it (the edges between its faces and their neighbours
    across, not those along its top, where it stays on), and return the strip's vertices."""
    M = ob.matrix_world
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    inside = lambda c: c.x > 0 and c.z < z0 and 0.507 - 0.27 * c.z - c.x < VEIL_STRIP
    strip = {f.index for f in bm.faces if inside(M @ f.calc_center_median())}
    cut = []
    for e in bm.edges:
        fs = e.link_faces
        if len(fs) != 2 or (fs[0].index in strip) == (fs[1].index in strip):
            continue
        out = fs[1] if fs[0].index in strip else fs[0]
        if (M @ out.calc_center_median()).z < z0:          # beside the strip, not above it
            cut.append(e)
    bmesh.ops.split_edges(bm, edges=cut)
    bm.verts.index_update()
    verts = {v.index for v in bm.verts if v.link_faces and all(f.index in strip for f in v.link_faces)}
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    log(f"bride: veil strip of {len(strip)} faces slit along {len(cut)} edges")
    return verts


def add_tie(name, rig):
    mname, z0, z1, side, knots, cuts = TIE[name]
    nb = len(knots)
    ob = bpy.data.objects[mname]
    M = ob.matrix_world
    allowed = stole_parts(ob) if name == "groom" else None   # found once: subdividing changes the parts' sizes
    strip = veil_strip(ob, z0) if name == "bride" else None
    if strip is not None:
        side = lambda p, _v=None: 1.0

    def region():
        for v in ob.data.vertices:
            if allowed is not None and v.index not in allowed:
                continue
            if strip is not None and v.index not in strip:
                continue
            p = M @ v.co
            u = (z0 - p.z) / (z0 - z1)
            lat = side(p)
            if u > -0.1 and lat > 0:
                yield v, u, lat, p

    if cuts:                                         # bmesh carries the vertex groups (the deform layer) over
        sel = {v.index for v, *_ in region()}
        n_before = len(ob.data.vertices)
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.verts.ensure_lookup_table()
        edges = [e for e in bm.edges if e.verts[0].index in sel and e.verts[1].index in sel]
        bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True)
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
        if allowed is not None:                      # the new vertices are appended, all on the stole's edges
            allowed |= set(range(n_before, len(ob.data.vertices)))
    on = [(v, min(u, 1.0), lat, p) for v, u, lat, p in region() if u > 0]
    keep = ob.vertex_groups.new(name=TIE_KEEP)
    keep.add([v.index for v, *_ in region()], 1.0, "REPLACE")
    # each bone's head at the middle of the cloth it carries (the band of u around it), so moving
    # the bone moves that cloth to where the bone goes, not to one side of it; its tail along the
    # cloth toward the next, so the bone's Y is the cloth's run (couple.js gathers across it only)
    heads = []
    for k, uk in enumerate(knots):
        r, band = 0.5 * (uk - (knots[k - 1] if k else 0.0)), []
        while not band:
            band = [p for _, u, lat, p in on if lat > 0.5 and abs(u - uk) <= r]
            r *= 1.5
        heads.append(sum(band, Vector()) / len(band))
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for k, h in enumerate(heads, 1):
        d = (heads[k] - h) if k < nb else (h - heads[k - 2])
        eb = rig.data.edit_bones.new(f"DEF-tie.{k}")
        eb.head = h
        eb.tail = h + d.normalized() * 0.05
        eb.parent = rig.data.edit_bones["DEF-spine"]
        eb.use_deform = True
    bpy.ops.object.mode_set(mode="OBJECT")
    groups = {k: ob.vertex_groups.new(name=f"DEF-tie.{k}") for k in range(1, nb + 1)}
    for v, u, lat, _ in on:
        k0 = sum(1 for uk in knots if uk <= u)       # between bone k0 (0: the own skin) and k0 + 1
        if k0 >= nb:
            k0, a = nb - 1, 1.0
        else:
            lo = knots[k0 - 1] if k0 else 0.0
            a = (u - lo) / (knots[k0] - lo)
        tie = lat * (a if k0 == 0 else 1.0)          # how much of the vertex leaves the own skin
        for g in v.groups:
            if g.group != keep.index:
                g.weight *= 1 - tie
        if k0 >= 1:
            groups[k0].add([v.index], lat * (1 - a), "REPLACE")
        groups[k0 + 1].add([v.index], lat * a, "REPLACE")
    log(f"{name}: {len(on)} vertices of {mname} on DEF-tie.1–{nb}, heads " +
        " ".join(f"({h.x:.2f},{h.y:.2f},{h.z:.2f})" for h in heads))


def prep_meshes(name, rig, meshes, ratios, loose_hair):
    for mname in meshes:
        ob = bpy.data.objects[mname]
        ob.hide_render = ob.hide_viewport = False
        for m in list(ob.modifiers):
            if m.type in ("SUBSURF", "CORRECTIVE_SMOOTH"):      # the web mesh is the base cage
                ob.modifiers.remove(m)
        if mname == loose_hair:                                  # ride the head
            assert HEAD_BONE in rig.data.bones, f"{rig.name} has no {HEAD_BONE}"
            vg = ob.vertex_groups.new(name=HEAD_BONE)
            vg.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
            arm = ob.modifiers.new("Armature", "ARMATURE")
            arm.object = rig
        if ob.parent is None:
            ob.parent = rig
        dec = ob.modifiers.new("Decimate", "DECIMATE")
        dec.ratio = ratios.get(mname, 1.0)
        dec.use_collapse_triangulate = True
        if TIE_KEEP in ob.vertex_groups:                         # the tied end keeps its density to bend
            dec.vertex_group = TIE_KEEP
            dec.invert_vertex_group = True
            dec.vertex_group_factor = 100.0
        # after the masks (no budget on hidden skin) and before the armature, so the export
        # (which applies every modifier but the armature's) skins the reduced mesh
        arm_i = next(i for i, m in enumerate(ob.modifiers) if m.type == "ARMATURE")
        with bpy.context.temp_override(object=ob):
            bpy.ops.object.modifier_move_to_index(modifier=dec.name, index=arm_i)
        ob.name = ob.data.name = f"{name}_{mname}"


def prep_material(name, size_col=2048, size_other=1024):
    """One Principled material from the atlas: colour (× nothing — the AO stays out), normal,
    roughness, metalness; the height/AO/transmission maps dropped, the rest shrunk."""
    mats = [m for m in bpy.data.materials if m.users and m.node_tree and any(n.type == "TEX_IMAGE" for n in m.node_tree.nodes)]
    m = mats[0]
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    imgs = {n.name: n for n in nt.nodes if n.type == "TEX_IMAGE"}
    keep = {}
    for key, sock in (("Albedo", "Base Color"), ("Roughness", "Roughness"), ("Metalness", "Metallic")):
        n = imgs[key]
        for l in list(p.inputs[sock].links):
            nt.links.remove(l)
        nt.links.new(n.outputs["Color"], p.inputs[sock])
        keep[key] = n
    nm = next(n for n in nt.nodes if n.type == "NORMAL_MAP")
    keep["Normal Map"] = imgs["Normal Map"]
    for l in list(p.inputs["Transmission Weight"].links):
        nt.links.remove(l)
    p.inputs["Transmission Weight"].default_value = 0.0
    for n in list(nt.nodes):
        if n.type == "TEX_IMAGE" and n not in keep.values():
            nt.nodes.remove(n)
        elif n.type == "DISPLACEMENT":
            nt.nodes.remove(n)
    for key, n in keep.items():
        im = n.image
        s = size_col if key == "Albedo" else size_other
        if im.size[0] > s:
            im.scale(s, s)
        im.name = f"{name}_{key.lower().replace(' ', '_')}"
        im.pack()
    nt.nodes.active = keep["Albedo"]          # what a workbench shot paints with
    m.name = f"{name}_atlas"
    m.blend_method = "OPAQUE"
    return m


def shots(rig_objects, out_dir, tag):
    """Workbench stills (textured) at four frames of the cycle, to judge the pose."""
    sc = bpy.context.scene
    os.makedirs(out_dir, exist_ok=True)
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "TEXTURE"
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 600, 900, 100
    cam = bpy.data.objects.new("shot_cam", bpy.data.cameras.new("shot_cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    for view, eye in (("front", (0.6, -4.0, 1.0)), ("side", (3.6, -1.2, 1.0))):
        cam.location = eye
        cam.rotation_euler = (Vector((0, 0, 0.85)) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = 60
        for f in (1, 11, 21):
            sc.frame_set(f)
            sc.render.filepath = os.path.join(out_dir, f"{tag}_{view}_{f:02d}.png")
            bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)


def build(name, a):
    fname, rig_name, meshes, ratios, loose_hair = CHARS[name]
    bpy.ops.wm.open_mainfile(filepath=os.path.join(ASSETS, fname))
    clean(meshes, rig_name)
    rig = bpy.data.objects[rig_name]
    rig.name = f"{name}_rig"
    walk_cycle(rig, name)
    add_tie(name, rig)
    prep_meshes(name, rig, meshes, ratios, loose_hair)
    prep_material(name)
    bpy.context.scene.frame_set(1)
    tris = sum(len(bpy.data.objects[f"{name}_{m}"].data.polygons) * ratios.get(m, 1.0) for m in meshes)
    log(f"{name}: ~{tris:.0f} faces after decimation")
    if a.shots:
        shots([rig], a.shots, name)
    out = os.path.join(os.path.dirname(a.out), f"{name}.glb")
    if not a.pose_only:
        bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_apply=True, export_def_bones=True,
                                  export_animations=True, export_skins=True, export_materials="EXPORT",
                                  export_image_format="AUTO", export_yup=True, export_texcoords=True, export_normals=True,
                                  export_frame_range=True, export_anim_single_armature=True, export_optimize_animation_size=True,
                                  export_hierarchy_flatten_bones=False, export_extras=False, export_cameras=False, export_lights=False)
        log(f"{name} → {out} ({os.path.getsize(out) / 1e6:.1f} MB)")
    return out


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "recon/data/web/couple.glb"))
    ap.add_argument("--shots", default=None)
    ap.add_argument("--pose-only", action="store_true")
    ap.add_argument("--only", default=None, choices=list(CHARS))
    a = ap.parse_args(argv)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    for name in CHARS:
        if a.only in (None, name):
            build(name, a)
    log("EXIT")


if __name__ == "__main__":
    main()
