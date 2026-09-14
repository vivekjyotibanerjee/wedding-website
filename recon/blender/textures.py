"""Generate the tileable PBR maps used by build_dakshineswar.py (albedo PNG, tangent-space normal
PNG, 32-bit height EXR for displacement) with numpy only, so the .blend is self-contained and the
maps are reproducible (fixed seeds). Run from inside Blender; images are written through bpy.

Sets (period = metres covered by one tile):
  stucco   lime plaster, trowel unevenness + pitting + a few hairline cracks     period 3 m
  tiles    half-round terracotta pantiles in overlapping courses (chala roofs)  period 1 m
  brick    laterite/brick courses with recessed mortar (plinths, ghat)          period 1 m
  paving   45 × 22 cm brick paving, per-brick tilt and colour                   period 1.8 m
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

SETS = {
    "stucco": {"period": 3.0}, "tiles": {"period": 1.0}, "brick": {"period": 1.0}, "paving": {"period": 1.8},
}
N = 1024


def _fbm(rng, n, base=4.0, octaves=5, gain=0.5, lac=2.0):
    """Periodic fractal noise via inverse FFT of shaped white noise (tileable by construction)."""
    fy = np.fft.fftfreq(n, 1.0 / n)[:, None]
    fx = np.fft.fftfreq(n, 1.0 / n)[None, :]
    f = np.hypot(fx, fy)
    out = np.zeros((n, n))
    amp, freq = 1.0, base
    for _ in range(octaves):
        spec = (rng.standard_normal((n, n)) + 1j * rng.standard_normal((n, n)))
        band = np.exp(-((np.log2(np.maximum(f, 1e-3) / freq)) ** 2) * 2.0)   # log-Gaussian band
        out += amp * np.real(np.fft.ifft2(spec * band))
        amp *= gain
        freq *= lac
    out -= out.min()
    out /= max(out.max(), 1e-9)
    return out


def _cells(u, v, cw, ch, offset_alt=0.5):
    """Running-bond cell ids and in-cell coords for a brick pattern (u, v in [0,1) tile units)."""
    row = np.floor(v / ch)
    uu = u + (row % 2) * cw * offset_alt
    col = np.floor(uu / cw)
    fu = (uu - col * cw) / cw
    fv = (v - row * ch) / ch
    return row.astype(int), col.astype(int), fu, fv


def _hash(a, b, seed=0):
    h = (a * 73856093) ^ (b * 19349663) ^ (seed * 83492791)
    return ((h & 0x7FFFFFFF) % 1000) / 999.0


def _normal_map(height, disp, period, boost=1.0):
    """Tangent-space normal (OpenGL +Y up) from a periodic height field. Slopes are physical:
    height spans `disp` metres over a tile of `period` metres; `boost` exaggerates for readability."""
    px = period / N
    gx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5 * disp / px
    gy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5 * disp / px
    nx, ny, nz = -gx * boost, -gy * boost, np.ones_like(height)
    L = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / L * 0.5 + 0.5, ny / L * 0.5 + 0.5, nz / L * 0.5 + 0.5], axis=-1)


def gen_stucco(rng):
    v, u = np.mgrid[0:N, 0:N] / N
    h = 0.55 * _fbm(rng, N, 3, 6) + 0.25 * _fbm(rng, N, 24, 4, 0.6) + 0.20 * _fbm(rng, N, 90, 3, 0.7)
    pits = _fbm(rng, N, 60, 3)
    h -= 0.35 * np.clip((0.86 - pits) * 6, 0, 1) * (pits < 0.86)      # small pits
    cracks = np.abs(_fbm(rng, N, 5, 4) - 0.5)
    h -= 0.5 * np.clip((0.012 - cracks) / 0.012, 0, 1)                  # hairline cracks
    h = (h - h.min()) / (h.max() - h.min())
    tone = 0.92 + 0.18 * (_fbm(rng, N, 2, 4) - 0.5) + 0.08 * (_fbm(rng, N, 30, 3) - 0.5)
    base = np.array([0.92, 0.85, 0.64])
    alb = base[None, None, :] * tone[..., None]
    alb[..., 2] *= 0.9 + 0.2 * _fbm(rng, N, 6, 3)                       # slight yellow drift
    return alb, h, 0.006


def gen_tiles(rng):
    v, u = np.mgrid[0:N, 0:N] / N
    ncol, nrow = 4, 3                                  # 25 cm tiles, 33 cm courses per metre
    row = np.floor(v * nrow)
    fv = v * nrow - row                                # 0 = top of course … 1 = bottom (overlap edge)
    uu = u + (row % 2) * 0.5 / ncol
    col = np.floor(uu * ncol)
    fu = uu * ncol - col
    barrel = 0.5 * (1 + np.cos(2 * np.pi * (fu - 0.5)))                  # half-round profile
    step = 0.35 * fv                                   # each course rides up over the one below
    lip = np.clip((fv - 0.9) / 0.1, 0, 1) * 0.35       # lower edge drop (overlap shadow line)
    h = 0.55 * barrel + step - lip + 0.06 * _fbm(rng, N, 40, 3)
    chip = _hash(col.astype(int), row.astype(int), 3)
    h -= 0.08 * (chip > 0.85) * barrel
    h = (h - h.min()) / (h.max() - h.min())
    t = _hash(col.astype(int), row.astype(int), 1)
    tone = 0.8 + 0.4 * t[..., None] * np.array([1.0, 0.85, 0.8])[None, None, :]
    base = np.array([0.62, 0.24, 0.16])
    alb = base[None, None, :] * tone * (0.85 + 0.3 * _fbm(rng, N, 12, 4)[..., None])
    alb *= (0.7 + 0.3 * barrel)[..., None]              # grime in the valleys
    return alb, h, 0.045


def gen_brick(rng):
    v, u = np.mgrid[0:N, 0:N] / N
    row, col, fu, fv = _cells(u, v, 0.25, 0.075)
    m = 0.012 / 0.25, 0.012 / 0.075
    mortar = (fu < m[0]) | (fu > 1 - m[0]) | (fv < m[1]) | (fv > 1 - m[1])
    edge = np.minimum(np.minimum(fu, 1 - fu) / m[0], np.minimum(fv, 1 - fv) / m[1])
    h = np.clip(edge, 0, 1.5) / 1.5
    h = np.where(mortar, 0.0, 0.4 + 0.6 * h)
    h += 0.10 * _fbm(rng, N, 50, 3) + 0.05 * _hash(col, row, 7)[..., None][..., 0]
    h = (h - h.min()) / (h.max() - h.min())
    t = _hash(col, row, 2)
    base = np.array([0.46, 0.22, 0.15])
    alb = base[None, None, :] * (0.7 + 0.6 * t)[..., None] * (0.85 + 0.3 * _fbm(rng, N, 8, 4))[..., None]
    alb = np.where(mortar[..., None], np.array([0.55, 0.48, 0.40])[None, None, :] * (0.8 + 0.4 * _fbm(rng, N, 30, 3))[..., None], alb)
    return alb, h, 0.02


def gen_paving(rng):
    v, u = np.mgrid[0:N, 0:N] / N
    row, col, fu, fv = _cells(u, v, 0.45 / 1.8, 0.22 / 1.8)
    m = 0.015 / 0.45, 0.015 / 0.22
    joint = (fu < m[0]) | (fu > 1 - m[0]) | (fv < m[1]) | (fv > 1 - m[1])
    tilt = (0.5 - _hash(col, row, 11)) * (fu - 0.5) + (0.5 - _hash(col, row, 12)) * (fv - 0.5)
    h = 0.7 + 0.25 * tilt + 0.05 * _hash(col, row, 13) + 0.06 * _fbm(rng, N, 60, 3)
    h = np.where(joint, 0.1 + 0.1 * _fbm(rng, N, 80, 2), h)
    h = (h - h.min()) / (h.max() - h.min())
    t = _hash(col, row, 4)
    base = np.array([0.55, 0.28, 0.19])
    alb = base[None, None, :] * (0.75 + 0.5 * t)[..., None] * (0.8 + 0.4 * _fbm(rng, N, 5, 4))[..., None]
    alb *= (0.9 + 0.2 * _fbm(rng, N, 40, 3))[..., None]
    alb = np.where(joint[..., None], np.array([0.58, 0.50, 0.40])[None, None, :] * (0.9 + 0.2 * t)[..., None], alb)
    return alb, h, 0.012


BOOST = {"stucco": 3.0, "tiles": 1.0, "brick": 1.5, "paving": 1.5}
GEN = {"stucco": gen_stucco, "tiles": gen_tiles, "brick": gen_brick, "paving": gen_paving}


def _save(path: Path, arr, is_data: bool, exr: bool):
    import bpy
    h, w = arr.shape[:2]
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = arr[::-1] if arr.ndim == 3 else arr[::-1, :, None]   # Blender rows start at the bottom
    img = bpy.data.images.new(path.name, w, h, float_buffer=exr, is_data=is_data)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = str(path)
    img.file_format = "OPEN_EXR" if exr else "PNG"
    img.save()
    bpy.data.images.remove(img)


def ensure_textures(out_dir: Path, force=False) -> dict[str, dict]:
    """Write <set>_albedo.png, <set>_normal.png, <set>_height.exr into out_dir; return per-set info."""
    out_dir.mkdir(parents=True, exist_ok=True)
    info = {}
    for i, (name, gen) in enumerate(GEN.items()):
        paths = {k: out_dir / f"{name}_{k}.{'exr' if k == 'height' else 'png'}" for k in ("albedo", "normal", "height")}
        if force or not all(p.exists() for p in paths.values()):
            alb, h, disp = gen(np.random.default_rng(100 + i))
            _save(paths["albedo"], np.clip(alb, 0, 1), False, False)
            _save(paths["normal"], _normal_map(h, disp, SETS[name]["period"], BOOST[name]), True, False)
            _save(paths["height"], h.astype(np.float32), True, True)
            print(f"  textures: wrote {name} ({N}²)")
        info[name] = {"period": SETS[name]["period"], "disp": {"stucco": 0.006, "tiles": 0.045, "brick": 0.02, "paving": 0.012}[name], **paths}
    return info


# ------------------------------------------------------------------------------------------------
# Foliage cards (RGBA, straight alpha): a leaf clump for broadleaf trees and potted shrubs, a
# palm frond and a banana leaf. Painted leaf by leaf into a float canvas so the site's alpha-test
# edge stays crisp; the colour under transparent pixels is filled with the mean leaf colour so
# bilinear filtering never bleeds black into the edges.
# ------------------------------------------------------------------------------------------------
def _paint_leaf(rgba, cx, cy, length, width, angle, colour, rib=0.35, taper=0.6, soft=1.2):
    """A pointed leaf (lens outline, darker midrib) at pixel (cx, cy), `length` px long along
    `angle`, painted over the canvas with normal alpha compositing."""
    h, w = rgba.shape[:2]
    r = int(length * 0.55 + 3)
    x0, x1, y0, y1 = max(0, int(cx) - r), min(w, int(cx) + r + 1), max(0, int(cy) - r), min(h, int(cy) + r + 1)
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1]
    dx, dy = xx - cx, yy - cy
    c, s = np.cos(angle), np.sin(angle)
    u = (dx * c + dy * s) / (length / 2)                       # -1 … 1 along the leaf
    v = (-dx * s + dy * c)                                     # px across
    half = (width / 2) * np.clip(1 - np.abs(u) ** 2, 0, 1) ** taper
    d = np.abs(v) - half                                       # signed distance to the edge (approx)
    a = np.clip(0.5 - d / soft, 0, 1) * (np.abs(u) < 1)
    if not a.any():
        return
    shade = 1.0 - 0.35 * np.clip(np.abs(v) / np.maximum(half, 1e-3), 0, 1) ** 2   # darker toward the edge
    shade *= 1.0 - rib * np.exp(-(v / max(1.0, width * 0.04)) ** 2)            # midrib
    shade *= 0.85 + 0.15 * (u + 1) / 2                                          # lighter toward the tip
    col = np.asarray(colour)[None, None, :] * shade[..., None]
    dst = rgba[y0:y1, x0:x1]
    a3 = a[..., None]
    dst[..., :3] = col * a3 + dst[..., :3] * (1 - a3)
    dst[..., 3] = a + dst[..., 3] * (1 - a)


def _fill_transparent(rgba):
    a = rgba[..., 3]
    if (a > 0.05).any():
        mean = (rgba[..., :3] * a[..., None]).sum((0, 1)) / max(a.sum(), 1e-6)
    else:
        mean = np.array([0.2, 0.35, 0.1])
    k = np.clip(a / 0.05, 0, 1)[..., None]
    rgba[..., :3] = rgba[..., :3] * k + mean[None, None, :] * (1 - k)
    return rgba


def gen_leaves(rng, n=1024):
    """A round clump of ~400 broadleaf leaves, dense in the middle and ragged at the edge; back
    leaves darker so the card reads as a volume."""
    rgba = np.zeros((n, n, 4), dtype=np.float32)
    dark, light = np.array([0.08, 0.20, 0.05]), np.array([0.34, 0.52, 0.16])
    for i in range(420):
        t = i / 419
        rr = 0.44 * n * np.sqrt(rng.random()) * (0.85 + 0.3 * rng.random())
        ang = rng.random() * 2 * np.pi
        cx, cy = n / 2 + rr * np.cos(ang), n / 2 + rr * np.sin(ang) * 0.92
        length = n * (0.10 + 0.07 * rng.random())
        colour = dark + (light - dark) * (0.25 + 0.75 * t) * (0.8 + 0.3 * rng.random())
        colour[0] *= 0.9 + 0.5 * rng.random() ** 3                  # a few yellowing leaves
        _paint_leaf(rgba, cx, cy, length, length * 0.45, rng.random() * 2 * np.pi, colour, taper=0.55)
    lit = (0.7 + 0.45 * (1 - np.arange(n) / n))[:, None, None]      # sky-lit from the top of the card
    rgba[..., :3] *= lit
    return _fill_transparent(rgba)


def gen_frond(rng, w=1024, h=512):
    """A palm frond, rachis along the middle of a 2:1 card (tip at the right), leaflets alternating
    above and below and shortening toward the tip."""
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    green = np.array([0.24, 0.42, 0.12])
    x0, x1 = 0.02 * w, 0.985 * w
    n_leaf = 46
    for i in range(n_leaf):
        t = i / (n_leaf - 1)
        x = x0 + (x1 - x0) * t
        length = h * 0.46 * (1 - 0.55 * t ** 2) * (0.92 + 0.16 * rng.random())
        for side in (-1, 1):
            ang = side * np.radians(62 - 30 * t) + rng.normal(0, 0.06)
            col = green * (0.8 + 0.4 * rng.random()) * np.array([1.0 + 0.4 * t, 1.0, 1.0 - 0.2 * t])
            _paint_leaf(rgba, x + np.cos(ang) * length / 2, h / 2 + np.sin(ang) * length / 2, length, 0.030 * h,
                        ang, col, rib=0.2, taper=0.4, soft=1.0)
    # rachis: a tapered stem over the leaflets
    yy, xx = np.mgrid[0:h, 0:w]
    rad = 0.012 * h * (1 - 0.8 * (xx - x0) / (x1 - x0))
    a = np.clip(0.5 - (np.abs(yy - h / 2) - rad), 0, 1) * (xx >= x0) * (xx <= x1)
    col = np.array([0.42, 0.36, 0.14])[None, None, :] * (0.8 + 0.4 * (1 - np.abs(yy - h / 2) / np.maximum(rad, 1))[..., None])
    rgba[..., :3] = col * a[..., None] + rgba[..., :3] * (1 - a[..., None])
    rgba[..., 3] = a + rgba[..., 3] * (1 - a)
    return _fill_transparent(rgba)


def gen_banana(rng, w=512, h=1024):
    """One banana leaf on a 1:2 card (stalk at the bottom): long blade with a pale midrib, parallel
    veins running out and up from it, and a few wind tears along the veins."""
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    v = (h - 1 - yy) / (h - 1)                                  # 0 at the stalk, 1 at the tip
    u = (xx - w / 2) / (w / 2)
    t = np.clip((v - 0.10) / 0.90, 0, 1)
    half = 0.80 * np.clip(np.sin(np.pi * t) ** 0.35, 0, 1) * (1 - 0.25 * t)      # long, blunt-ended blade
    half = np.where(v < 0.10, 0.025, half)
    half += 0.012 * np.sin(v * 90) * (v > 0.12) * (v < 0.95)
    a = np.clip((half - np.abs(u)) * (w / 2) / 1.2 + 0.5, 0, 1)
    slope = 0.55                                                # veins climb toward the tip as they leave the rib
    along = v - slope * np.abs(u)
    vein = np.abs(np.sin(along * np.pi * 48))
    tone = 1.0 - 0.12 * (vein ** 10)
    tone *= 1.0 - 0.22 * np.clip(np.abs(u) / np.maximum(half, 1e-3), 0, 1) ** 3
    base = np.array([0.28, 0.55, 0.15])[None, None, :] * (0.9 + 0.2 * np.clip(u, 0, 1)[..., None])
    base = base * tone[..., None]
    rib = np.exp(-(u * w / 2 / (4.0 + 7.0 * (1 - v))) ** 2)
    base = base * (1 - rib[..., None]) + np.array([0.78, 0.82, 0.42])[None, None, :] * rib[..., None]
    for _ in range(10):                                         # tears: slits from the edge in, along a vein
        tv = 0.18 + 0.72 * rng.random()                         # where the tear meets the edge (v)
        side = 1 if rng.random() < 0.5 else -1
        depth = 0.3 + 0.55 * rng.random()
        edge_half = 0.80 * np.sin(np.pi * np.clip((tv - 0.10) / 0.90, 0, 1)) ** 0.35 * (1 - 0.25 * np.clip((tv - 0.10) / 0.90, 0, 1))
        slit = (np.abs(along - (tv - slope * edge_half)) < 0.0035) & (side * u > (1 - depth) * half) & (side * u > 0.05)
        a = np.where(slit, 0, a)
    rgba[..., :3] = base
    rgba[..., 3] = a
    return _fill_transparent(rgba)


FOLIAGE = {"leaves": gen_leaves, "frond": gen_frond, "banana": gen_banana}


def _save_rgba(path: Path, rgba):
    import bpy
    h, w = rgba.shape[:2]
    img = bpy.data.images.new(path.name, w, h, alpha=True)
    img.alpha_mode = "STRAIGHT"
    img.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).astype(np.float32).ravel())
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def ensure_foliage(out_dir: Path, force=False) -> dict[str, Path]:
    """Write <name>.png (RGBA) for every foliage card into out_dir; return name → path."""
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = {}
    for i, (name, gen) in enumerate(FOLIAGE.items()):
        p = out_dir / f"foliage_{name}.png"
        if force or not p.exists():
            _save_rgba(p, np.clip(gen(np.random.default_rng(300 + i)), 0, 1))
            print(f"  textures: wrote foliage {name}")
        paths[name] = p
    return paths
