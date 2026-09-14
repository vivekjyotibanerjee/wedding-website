#!/usr/bin/env python3
"""LAPTOP or CLUSTER (lives next to reconlib.py because both sides run it). Download media listed in configs/manifest.json into data/raw/.

  python scripts/fetch.py --commons                       # laptop: everything, for the audit
  python scripts/fetch.py --selection configs/selection.yaml   # cluster: only what was selected
  python scripts/fetch.py --dry-run --selection ...       # list what would be fetched
  python scripts/fetch.py --youtube --lock-hashes         # record observed sha1 of videos

Commons files are verified against the sha1 in the manifest; a mismatch is deleted and reported.
YouTube streams cannot be pre-hashed — format_id is pinned instead, and --lock-hashes writes the
observed sha1 back into the manifest so later runs can at least detect a re-encode.
Idempotent: files that exist and verify are skipped.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import reconlib as R  # noqa: E402

UA = "dakshineswar-recon/1.0 (https://github.com/vivekjyotibanerjee/wedding-website)"


def _get(s: requests.Session, url: str) -> requests.Response:
    """GET with Retry-After-aware backoff (Commons answers bursts with 429)."""
    for attempt in range(8):
        r = s.get(url, stream=True, timeout=120)
        if r.status_code == 200:
            return r
        wait = float(r.headers.get("Retry-After") or 0) or 5 * (attempt + 1)
        print(f"  HTTP {r.status_code} on {url.rsplit('/', 1)[-1][:60]} — retrying in {wait:.0f}s", flush=True)
        r.close()
        time.sleep(wait)
    r.raise_for_status()
    return r


def fetch_commons(entries: list[dict], dry: bool, limit: int | None) -> tuple[int, int, int]:
    from tqdm import tqdm
    R.RAW_COMMONS.mkdir(parents=True, exist_ok=True)
    s = requests.Session()
    s.headers["User-Agent"] = UA
    ok = skipped = bad = 0
    entries = entries[:limit] if limit else entries
    for e in tqdm(entries, desc="commons", unit="img", disable=dry):
        dst = R.commons_local_path(e)
        if dst.exists() and R.sha1_of(dst) == e["sha1"]:
            skipped += 1
            continue
        if dry:
            print(f"  would fetch {e['id']}  {e['title']}")
            continue
        tmp = dst.with_suffix(dst.suffix + ".part")
        with _get(s, e["url"]) as r:
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(1 << 16):
                    f.write(chunk)
        time.sleep(1.0)  # upload.wikimedia.org throttles anonymous bursts
        if R.sha1_of(tmp) != e["sha1"]:
            tmp.unlink(missing_ok=True)
            print(f"  sha1 MISMATCH {e['id']} {e['title']} — dropped", file=sys.stderr)
            bad += 1
            continue
        tmp.replace(dst)
        ok += 1
    return ok, skipped, bad


def fetch_youtube(entries: list[dict], dry: bool, lock: bool, manifest: dict) -> tuple[int, int]:
    import yt_dlp
    R.RAW_YOUTUBE.mkdir(parents=True, exist_ok=True)
    ok = skipped = 0
    for e in entries:
        dst = R.youtube_local_path(e)
        if dst.exists():
            skipped += 1
            if lock and not e.get("sha1"):
                e["sha1"] = R.sha1_of(dst)
            continue
        if dry:
            print(f"  would fetch {e['id']}  {e.get('title')}  ({e.get('format_id')})")
            continue
        # Exact pinned format first; fall back to the original selector if YouTube retired that id.
        fmt = f"{e['format_id']}/{e.get('format_selector') or 'bestvideo[ext=mp4][height<=1080]'}"
        opts = {"quiet": False, "format": fmt, "outtmpl": str(dst.with_suffix("")) + ".%(ext)s",
                "noplaylist": True, "retries": 5}
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(e["webpage_url"], download=True)
        got = (info.get("requested_formats") or [info])[0].get("format_id")
        if got != e["format_id"]:
            print(f"  WARNING {e['id']}: pinned format {e['format_id']} unavailable, got {got}", file=sys.stderr)
        if lock:
            e["sha1"] = R.sha1_of(dst)
        ok += 1
    if lock:
        R.save_manifest(manifest)
    return ok, skipped


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--commons", action="store_true")
    ap.add_argument("--youtube", action="store_true")
    ap.add_argument("--selection", type=Path, help="configs/selection.yaml — restrict to the audited subset")
    ap.add_argument("--limit", type=int, help="fetch at most N Commons files (smoke test)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--lock-hashes", action="store_true", help="write observed YouTube sha1 into the manifest")
    a = ap.parse_args()

    manifest = R.load_manifest()
    sel = R.load_selection(a.selection) if a.selection else None
    if a.selection and sel is None:
        raise SystemExit(f"selection file not found: {a.selection}")
    do_all = not (a.commons or a.youtube)

    if do_all or a.commons:
        entries = R.selected_commons(manifest, sel)
        ok, skipped, bad = fetch_commons(entries, a.dry_run, a.limit)
        print(f"commons: {len(entries)} selected — {ok} downloaded, {skipped} already present, {bad} failed")
    if do_all or a.youtube:
        entries = R.selected_youtube(manifest, sel)
        ok, skipped = fetch_youtube(entries, a.dry_run, a.lock_hashes, manifest)
        print(f"youtube: {len(entries)} selected — {ok} downloaded, {skipped} already present")


if __name__ == "__main__":
    main()
