"""Shared helpers for the laptop and cluster scripts.

Everything here is pure-Python + PyYAML so it imports on both machines.
Paths are resolved relative to the repo root regardless of the cwd.
"""
from __future__ import annotations

import fnmatch
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIGS = ROOT / "configs"
DATA = ROOT / "data"
RAW_COMMONS = DATA / "raw" / "commons"
RAW_YOUTUBE = DATA / "raw" / "youtube"

SOURCES_PATH = CONFIGS / "sources.yaml"
MANIFEST_PATH = CONFIGS / "manifest.json"
SELECTION_PATH = CONFIGS / "selection.yaml"

MANIFEST_VERSION = 1

# Audit buckets — where along the walk an image belongs. Used by audit.py and selection.yaml.
BUCKETS = [
    "gate", "courtyard", "facade", "stairs", "shiva-row", "natmandir",
    "ghat", "river", "aerial", "night", "other",
]


def load_yaml(path: Path) -> dict:
    import yaml
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def load_sources() -> dict:
    return load_yaml(SOURCES_PATH)


def load_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        return {"version": MANIFEST_VERSION, "generated": None, "commons": {}, "youtube": {}}
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        m = json.load(f)
    if m.get("version") != MANIFEST_VERSION:
        raise SystemExit(f"manifest version {m.get('version')} != {MANIFEST_VERSION}; regenerate")
    return m


def save_manifest(m: dict) -> None:
    m["version"] = MANIFEST_VERSION
    # Only bump the timestamp when the entries actually changed, so a no-op re-run leaves git clean.
    old = load_manifest() if MANIFEST_PATH.exists() else None
    if old is None or (old["commons"], old["youtube"]) != (m["commons"], m["youtube"]):
        m["generated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    else:
        m["generated"] = old["generated"]
    # Sorted keys + fixed indent so re-runs produce byte-identical files when nothing changed.
    m["commons"] = dict(sorted(m["commons"].items()))
    m["youtube"] = dict(sorted(m["youtube"].items()))
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(m, f, indent=2, ensure_ascii=False, sort_keys=False)
        f.write("\n")


def load_selection(path: Path | None = None) -> dict | None:
    path = path or SELECTION_PATH
    if not path.exists():
        return None
    sel = load_yaml(path)
    sel.setdefault("commons", {})
    sel.setdefault("youtube", {})
    return sel


def sha1_of(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def safe_name(s: str, max_len: int = 80) -> str:
    s = _SAFE.sub("_", s).strip("_")
    return s[:max_len]


def commons_local_path(entry: dict) -> Path:
    ext = entry["url"].split("?", 1)[0].rsplit(".", 1)[-1].lower()
    return RAW_COMMONS / f"{entry['id']}_{safe_name(entry['title'].removeprefix('File:').rsplit('.', 1)[0])}.{ext}"


def youtube_local_path(entry: dict) -> Path:
    return RAW_YOUTUBE / f"{entry['id']}.{entry.get('ext', 'mp4')}"


# ---------------------------------------------------------------------------------------------
# Selection semantics (configs/selection.yaml)
#
# commons:
#   include: ["all"]                # or a list of ids / globs, e.g. ["M12345", "M67*"]
#   exclude: ["M99999"]             # ids / globs removed after include
#   buckets: {M12345: facade, ...}  # optional labels; audit.py writes these
# youtube:
#   VIDEO_ID: [["01:20", "02:45"], ["05:00", "05:30"]]   # ranges to extract frames from
#   OTHER_ID: all                                         # whole video
# ---------------------------------------------------------------------------------------------

def _match_any(id_: str, patterns) -> bool:
    for p in patterns or []:
        if p == "all" or fnmatch.fnmatchcase(id_, str(p)):
            return True
    return False


def selected_commons(manifest: dict, selection: dict | None) -> list[dict]:
    entries = list(manifest["commons"].values())
    if selection is None:
        return entries
    c = selection.get("commons") or {}
    inc, exc = c.get("include") or [], c.get("exclude") or []
    return [e for e in entries if _match_any(e["id"], inc) and not _match_any(e["id"], exc)]


def selected_youtube(manifest: dict, selection: dict | None) -> list[dict]:
    entries = list(manifest["youtube"].values())
    if selection is None:
        return entries
    y = selection.get("youtube") or {}
    return [e for e in entries if e["id"] in y]


def parse_ts(s: str | int | float) -> float:
    """'mm:ss', 'hh:mm:ss', or seconds -> seconds."""
    if isinstance(s, (int, float)):
        return float(s)
    parts = [float(p) for p in str(s).split(":")]
    t = 0.0
    for p in parts:
        t = t * 60 + p
    return t


def youtube_ranges(selection: dict | None, entry: dict) -> list[tuple[float, float]]:
    """Time ranges (seconds) to extract for a video; whole video if 'all'/unlisted."""
    dur = float(entry.get("duration") or 0)
    spec = None if selection is None else (selection.get("youtube") or {}).get(entry["id"])
    if spec in (None, "all", []):
        return [(0.0, dur)]
    out = []
    for a, b in spec:
        out.append((parse_ts(a), min(parse_ts(b), dur) if dur else parse_ts(b)))
    return out
