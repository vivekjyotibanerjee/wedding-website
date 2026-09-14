#!/usr/bin/env python3
"""LAPTOP. Turn configs/sources.yaml into configs/manifest.json (the lock file).

  python scripts/laptop/discover.py                 # walk Commons categories + pin listed YouTube IDs
  python scripts/laptop/discover.py --commons       # only Commons
  python scripts/laptop/discover.py --youtube       # only YouTube
  python scripts/laptop/discover.py --yt-search "dakshineswar temple walk" --yt-max 25
                                                    # print candidate vlogs; paste IDs into sources.yaml

Re-running never changes an existing manifest entry — it only appends new ones — so the laptop
and the cluster resolve exactly the same media from the committed manifest.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import reconlib as R  # noqa: E402

API = "https://commons.wikimedia.org/w/api.php"
UA = "dakshineswar-recon/1.0 (https://github.com/vivekjyotibanerjee/wedding-website)"
SESSION = requests.Session()
SESSION.headers["User-Agent"] = UA


def api(params: dict) -> dict:
    params = {"format": "json", "formatversion": "2", **params}
    for attempt in range(8):
        r = SESSION.get(API, params=params, timeout=60)
        time.sleep(0.6)  # be polite: Commons 429s on bursts from anonymous clients
        if r.status_code == 200:
            return r.json()
        wait = float(r.headers.get("Retry-After") or 0) or 5 * (attempt + 1)
        print(f"  HTTP {r.status_code}, retrying in {wait:.0f}s", flush=True)
        time.sleep(wait)
    r.raise_for_status()
    return {}


def category_members(cat: str, cmtype: str):
    """Yield categorymembers (files or subcats) for 'Category:<cat>' with continuation."""
    params = {
        "action": "query", "list": "categorymembers", "cmtitle": f"Category:{cat}",
        "cmtype": cmtype, "cmlimit": "500", "cmprop": "ids|title",
    }
    while True:
        j = api(params)
        for m in j.get("query", {}).get("categorymembers", []):
            yield m
        if "continue" not in j:
            break
        params.update(j["continue"])


def walk_categories(roots: list[str], depth: int) -> dict[str, list[str]]:
    """Return {category: [pageids...]} for every category reached within `depth` levels."""
    seen, frontier, out = set(), [(c, 0) for c in roots], {}
    while frontier:
        cat, d = frontier.pop(0)
        if cat in seen:
            continue
        seen.add(cat)
        files = [str(m["pageid"]) for m in category_members(cat, "file")]
        out[cat] = files
        print(f"  {'  ' * d}{cat}: {len(files)} files", flush=True)
        if d < depth:
            for sub in category_members(cat, "subcat"):
                frontier.append((sub["title"].removeprefix("Category:"), d + 1))
    return out


def image_info(pageids: list[str]) -> dict[str, dict]:
    """Batch imageinfo lookups (50 per call). Returns {pageid: info}."""
    out = {}
    for i in range(0, len(pageids), 50):
        batch = pageids[i:i + 50]
        j = api({
            "action": "query", "pageids": "|".join(batch), "prop": "imageinfo",
            "iiprop": "url|sha1|size|mime|extmetadata",
            "iiextmetadatafilter": "LicenseShortName|License|Artist|Credit|DateTimeOriginal|ImageDescription|Attribution",
        })
        for p in j.get("query", {}).get("pages", []):
            ii = (p.get("imageinfo") or [None])[0]
            if not ii:
                continue
            md = ii.get("extmetadata") or {}
            g = lambda k: (md.get(k) or {}).get("value")  # noqa: E731
            out[str(p["pageid"])] = {
                "title": p["title"], "url": ii["url"].split("?", 1)[0], "page": ii.get("descriptionurl"),
                "sha1": ii.get("sha1"), "bytes": ii.get("size"), "width": ii.get("width"),
                "height": ii.get("height"), "mime": ii.get("mime"),
                "license": g("LicenseShortName") or g("License"),
                "artist": _strip_html(g("Artist") or g("Credit") or g("Attribution")),
                "date": g("DateTimeOriginal"),
            }
        time.sleep(0.2)
    return out


def _strip_html(s):
    if not s:
        return None
    import re
    return re.sub(r"<[^>]+>", "", s).strip()[:200]


def discover_commons(manifest: dict, cfg: dict) -> int:
    cats = walk_categories(cfg["categories"], int(cfg.get("depth", 1)))
    # pageid -> list of categories it was found in (for grouping in the audit sheet)
    where: dict[str, list[str]] = {}
    for cat, ids in cats.items():
        for pid in ids:
            where.setdefault(pid, []).append(cat)
    new_ids = [pid for pid in where if f"M{pid}" not in manifest["commons"]]
    print(f"{len(where)} files found, {len(new_ids)} not yet in manifest")
    infos = image_info(new_ids)
    min_edge = int(cfg.get("min_long_edge", 0))
    mimes = set(cfg.get("mime") or [])
    excl = [s.lower() for s in cfg.get("title_exclude") or []]
    added = skipped = 0
    for pid, info in infos.items():
        title_l = info["title"].lower()
        if (mimes and info["mime"] not in mimes) \
                or max(info["width"] or 0, info["height"] or 0) < min_edge \
                or any(s in title_l for s in excl):
            skipped += 1
            continue
        manifest["commons"][f"M{pid}"] = {"id": f"M{pid}", "source": "commons",
                                           **info, "categories": sorted(where[pid])}
        added += 1
    print(f"commons: +{added} added, {skipped} filtered out (size/mime/title)")
    return added


def discover_youtube(manifest: dict, cfg: dict) -> int:
    import yt_dlp
    ids = [str(i) for i in cfg.get("ids") or []]
    fmt = cfg.get("format") or "bestvideo[ext=mp4][height<=1080]"
    added = 0
    opts = {"quiet": True, "no_warnings": True, "skip_download": True, "format": fmt}
    with yt_dlp.YoutubeDL(opts) as ydl:
        for vid in ids:
            if vid in manifest["youtube"]:
                continue
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)
            chosen = (info.get("requested_formats") or [info])[0]
            manifest["youtube"][vid] = {
                "id": vid, "source": "youtube", "title": info.get("title"),
                "uploader": info.get("uploader"), "upload_date": info.get("upload_date"),
                "duration": info.get("duration"), "webpage_url": info.get("webpage_url"),
                "format_id": chosen.get("format_id"), "format_selector": fmt,
                "ext": chosen.get("ext", "mp4"), "width": chosen.get("width"),
                "height": chosen.get("height"), "fps": chosen.get("fps"),
                "yt_dlp_version": yt_dlp.version.__version__,
            }
            print(f"  {vid}  {info.get('duration')}s  {chosen.get('height')}p  {info.get('title')}")
            added += 1
    print(f"youtube: +{added} added")
    return added


def yt_search(query: str, n: int) -> None:
    import yt_dlp
    opts = {"quiet": True, "no_warnings": True, "extract_flat": True, "skip_download": True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        res = ydl.extract_info(f"ytsearch{n}:{query}", download=False)
    print(f"# candidates for {query!r} — paste the good IDs into configs/sources.yaml → youtube.ids")
    for e in res.get("entries") or []:
        d = e.get("duration") or 0
        print(f"  - {e['id']}   # {int(d // 60)}:{int(d % 60):02d}  {e.get('title')}  https://youtu.be/{e['id']}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--commons", action="store_true", help="only discover Commons")
    ap.add_argument("--youtube", action="store_true", help="only pin YouTube IDs")
    ap.add_argument("--yt-search", metavar="QUERY", help="print candidate vlogs; does not touch the manifest")
    ap.add_argument("--yt-max", type=int, default=20)
    a = ap.parse_args()

    if a.yt_search:
        yt_search(a.yt_search, a.yt_max)
        return

    src = R.load_sources()
    manifest = R.load_manifest()
    do_all = not (a.commons or a.youtube)
    if do_all or a.commons:
        discover_commons(manifest, src.get("commons") or {})
    if do_all or a.youtube:
        discover_youtube(manifest, src.get("youtube") or {})
    R.save_manifest(manifest)
    print(f"manifest: {len(manifest['commons'])} commons, {len(manifest['youtube'])} youtube → {R.MANIFEST_PATH.relative_to(R.ROOT)}")


if __name__ == "__main__":
    main()
