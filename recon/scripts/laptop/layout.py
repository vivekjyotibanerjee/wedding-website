#!/usr/bin/env python3
"""LAPTOP. Pull the temple complex's footprints from OpenStreetMap → a metre-scaled blueprint.

  python scripts/laptop/layout.py [--radius 220] [--svg]

Writes configs/layout.geojson (committed; coordinates in local metres, x = east, y = north, origin =
centroid of the main Kali temple footprint) and data/layout/layout.svg for a quick look. Used for:
the splat crop box (06_compress.sh --crop), placing the generated mandap, the camera path, and the
one-off alignment of the splat to the site's world frame. OSM data is ODbL — attribution in PLAN.md.

What OSM actually has here: the complex is ONE polygon ("Dakshineswar Kali Hindu Temple", ~70×130 m)
plus the surrounding streets and buildings — the navaratna, nat-mandir and the 12 Shiva temples are
not mapped individually. So this gives boundary, scale and north; the inner arrangement comes from a
Google satellite screenshot taken by hand (its imagery cannot be scripted under Google's ToS) dropped
into data/reference/ and scaled to the SVG's 50 m bar.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import reconlib as R  # noqa: E402

UA = "dakshineswar-recon/1.0 (https://github.com/vivekjyotibanerjee/wedding-website)"
OVERPASS = "https://overpass-api.de/api/interpreter"
MAIN_TEMPLE_WAY = 291865633          # OSM way tagged "Dakshineswar Kali Hindu Temple"
CENTER = (22.6551, 88.3575)          # rough centre used only for the search radius
OUT_GEOJSON = R.CONFIGS / "layout.geojson"
OUT_SVG = R.DATA / "layout" / "layout.svg"


def query(radius: int) -> dict:
    lat, lon = CENTER
    q = f"""[out:json][timeout:90];
(
  way["building"](around:{radius},{lat},{lon});
  way["amenity"="place_of_worship"](around:{radius},{lat},{lon});
  way["historic"](around:{radius},{lat},{lon});
  way["waterway"](around:{radius + 100},{lat},{lon});
  way["highway"](around:{radius},{lat},{lon});
  way["barrier"="wall"](around:{radius},{lat},{lon});
);
out body geom;"""
    # The big river relations are deliberately not requested — they time the API out.
    last = None
    for url in (OVERPASS, "https://overpass.kumi.systems/api/interpreter"):
        for _ in range(2):
            r = requests.post(url, data={"data": q}, headers={"User-Agent": UA}, timeout=180)
            if r.status_code == 200:
                return r.json()
            last = r
            print(f"  {url}: HTTP {r.status_code}, retrying", file=sys.stderr)
    last.raise_for_status()
    return {}


def to_local(lat: float, lon: float, lat0: float, lon0: float) -> tuple[float, float]:
    """Equirectangular projection in metres; fine for a 500 m site."""
    k = 111_320.0
    return ((lon - lon0) * k * math.cos(math.radians(lat0)), (lat - lat0) * k)


def centroid(pts: list[tuple[float, float]]) -> tuple[float, float]:
    xs, ys = zip(*pts)
    return sum(xs) / len(xs), sum(ys) / len(ys)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--radius", type=int, default=220, help="search radius in metres around the temple")
    ap.add_argument("--svg", action="store_true", default=True)
    a = ap.parse_args()

    j = query(a.radius)
    ways = [e for e in j["elements"] if e["type"] == "way" and e.get("geometry")]
    main = next((w for w in ways if w["id"] == MAIN_TEMPLE_WAY), None)
    if main is None:
        raise SystemExit("main temple way not returned — OSM id changed? check MAIN_TEMPLE_WAY")
    lat0, lon0 = centroid([(g["lat"], g["lon"]) for g in main["geometry"]])

    feats = []
    for w in ways:
        pts = [to_local(g["lat"], g["lon"], lat0, lon0) for g in w["geometry"]]
        closed = w["geometry"][0] == w["geometry"][-1] and len(pts) > 3
        t = w.get("tags", {})
        kind = ("main-temple" if w["id"] == MAIN_TEMPLE_WAY else
                "water" if t.get("natural") == "water" or "waterway" in t else
                "road" if "highway" in t else
                "wall" if t.get("barrier") == "wall" else
                "building")
        feats.append({
            "type": "Feature",
            "properties": {"osm_id": w["id"], "kind": kind, "name": t.get("name"), "tags": t,
                           "centroid": centroid(pts) if closed else None},
            "geometry": {"type": "Polygon" if closed else "LineString",
                         "coordinates": [[list(p) for p in pts]] if closed else [list(p) for p in pts]},
        })
    gj = {"type": "FeatureCollection",
          "properties": {"origin_latlon": [lat0, lon0], "units": "metres", "x": "east", "y": "north",
                         "source": "OpenStreetMap contributors, ODbL", "osm_main_temple_way": MAIN_TEMPLE_WAY},
          "features": feats}
    OUT_GEOJSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_GEOJSON.write_text(json.dumps(gj, indent=1))
    n_b = sum(f["properties"]["kind"] == "building" for f in feats)
    print(f"{len(feats)} features ({n_b} buildings) → {OUT_GEOJSON.relative_to(R.ROOT)}; origin {lat0:.6f},{lon0:.6f}")

    if a.svg:
        write_svg(feats, a.radius)


def write_svg(feats: list[dict], radius: int) -> None:
    S = 3.0  # px per metre
    W = H = int(2 * radius * S)
    col = {"main-temple": "#c0392b", "building": "#8d6e63", "water": "#7fb3d5", "road": "#bbb", "wall": "#555"}
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" style="background:#f4f2ee;font:11px sans-serif">']
    tx = lambda x, y: (W / 2 + x * S, H / 2 - y * S)  # noqa: E731  y up = north
    for f in sorted(feats, key=lambda f: ["water", "road", "wall", "building", "main-temple"].index(f["properties"]["kind"])):
        k = f["properties"]["kind"]
        coords = f["geometry"]["coordinates"][0] if f["geometry"]["type"] == "Polygon" else f["geometry"]["coordinates"]
        d = " ".join(f"{'M' if i == 0 else 'L'}{tx(x, y)[0]:.1f},{tx(x, y)[1]:.1f}" for i, (x, y) in enumerate(coords))
        if f["geometry"]["type"] == "Polygon":
            parts.append(f'<path d="{d}Z" fill="{col[k]}" fill-opacity="{0.9 if k == "main-temple" else 0.55}" stroke="#333" stroke-width="0.6"><title>{f["properties"]["osm_id"]} {f["properties"]["name"] or ""}</title></path>')
        else:
            parts.append(f'<path d="{d}" fill="none" stroke="{col[k]}" stroke-width="{4 if k == "water" else 1.5}"/>')
        if f["properties"]["name"] and f["properties"]["centroid"]:
            cx, cy = tx(*f["properties"]["centroid"])
            parts.append(f'<text x="{cx:.0f}" y="{cy:.0f}" text-anchor="middle">{f["properties"]["name"]}</text>')
    # 50 m scale bar + north arrow
    parts.append(f'<line x1="20" y1="{H - 20}" x2="{20 + 50 * S}" y2="{H - 20}" stroke="#000" stroke-width="2"/><text x="20" y="{H - 26}">50 m</text>')
    parts.append(f'<text x="{W - 30}" y="24" font-size="16">N ↑</text>')
    parts.append("</svg>")
    OUT_SVG.parent.mkdir(parents=True, exist_ok=True)
    OUT_SVG.write_text("\n".join(parts))
    print(f"svg → {OUT_SVG.relative_to(R.ROOT)}")


if __name__ == "__main__":
    main()
