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
