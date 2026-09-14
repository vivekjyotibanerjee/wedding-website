#!/usr/bin/env python3
"""LAPTOP. Build a contact sheet of the fetched Commons images for manual auditing.

  python scripts/laptop/audit.py            # → data/audit/index.html (open it in a browser)
  python scripts/laptop/audit.py --thumb 360

  python scripts/laptop/audit.py --serve    # → http://localhost:8765/  (embedded YouTube player works here)

In the page: click a thumbnail to include/exclude it, pick a bucket (gate / facade / ...). For videos
press Load, scrub to a walking segment, Mark start / Mark end (or type ranges by hand). Then
"Copy selection.yaml" (or "Download") and save it as configs/selection.yaml. Choices persist in the browser's localStorage between reloads, and an
existing configs/selection.yaml is pre-loaded so you can resume an audit after committing.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import reconlib as R  # noqa: E402

AUDIT_DIR = R.DATA / "audit"
THUMBS = AUDIT_DIR / "thumbs"


def make_thumbs(entries: list[dict], size: int) -> dict[str, tuple[str, bool]]:
    """Returns {id: (relative thumb path, exists)} — thumbs are generated once and cached."""
    from PIL import Image, ImageOps
    from tqdm import tqdm
    THUMBS.mkdir(parents=True, exist_ok=True)
    out = {}
    for e in tqdm(entries, desc="thumbs", unit="img"):
        src = R.commons_local_path(e)
        dst = THUMBS / f"{e['id']}.jpg"
        if not src.exists():
            out[e["id"]] = ("", False)
            continue
        if not dst.exists():
            try:
                with Image.open(src) as im:
                    im = ImageOps.exif_transpose(im).convert("RGB")
                    im.thumbnail((size, size))
                    im.save(dst, "JPEG", quality=82)
            except Exception as ex:  # corrupt / unsupported file — still list it
                print(f"  thumb failed for {e['id']}: {ex}", file=sys.stderr)
                out[e["id"]] = ("", False)
                continue
        out[e["id"]] = (f"thumbs/{dst.name}", True)
    return out


PAGE = """<!doctype html>
<meta charset="utf-8">
<title>Dakshineswar recon — media audit</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font: 14px/1.4 system-ui, sans-serif; background: #f4f2ee; color: #222; }
  header { position: sticky; top: 0; z-index: 5; background: #fff; border-bottom: 1px solid #ddd;
           padding: 10px 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  header b { font-size: 16px; }
  button { padding: 6px 12px; border: 1px solid #999; background: #fff; border-radius: 6px; cursor: pointer; }
  button.primary { background: #2a5; color: #fff; border-color: #2a5; }
  input[type=search] { padding: 6px 10px; border: 1px solid #bbb; border-radius: 6px; min-width: 220px; }
  .stats { margin-left: auto; color: #555; }
  .stats span { margin-left: 10px; }
  section { padding: 12px 16px; }
  h2 { font-size: 15px; margin: 18px 0 8px; display: flex; gap: 10px; align-items: baseline; }
  h2 small { color: #777; font-weight: normal; }
  h2 button { font-size: 12px; padding: 2px 8px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--w), 1fr)); gap: 10px; }
  .card { background: #fff; border: 2px solid #ddd; border-radius: 8px; overflow: hidden; }
  .card.sel { border-color: #2a5; }
  .card.rej { opacity: .45; }
  .card img { display: block; width: 100%; aspect-ratio: 4/3; object-fit: cover; cursor: pointer; background: #eee; }
  .card .noimg { aspect-ratio: 4/3; display: grid; place-items: center; color: #a33; background: #fee; }
  .meta { padding: 6px 8px; font-size: 12px; }
  .meta .t { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta .d { color: #666; }
  .meta select { width: 100%; margin-top: 4px; }
  .hide { display: none !important; }
  table { border-collapse: collapse; width: 100%; background: #fff; }
  td, th { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
  td input[type=text] { width: 100%; box-sizing: border-box; padding: 4px 6px; }
  pre#out { background: #222; color: #eee; padding: 12px; border-radius: 8px; max-height: 40vh; overflow: auto; }
  .hint { color: #666; font-size: 12px; }
</style>
<header>
  <b>Media audit</b>
  <input type="search" id="q" placeholder="filter title / category / id">
  <label><input type="checkbox" id="onlysel"> selected only</label>
  <label><input type="checkbox" id="hiderej"> hide rejected</label>
  <button id="copy" class="primary">Copy selection.yaml</button>
  <button id="dl">Download</button>
  <button id="reset">Reset</button>
  <div class="stats"><span id="n-sel">0 selected</span><span id="n-tot"></span></div>
</header>
<section>
  <p class="hint">Click a thumbnail to toggle selection. Bucket = where along the walk this view belongs (used for the pilot and coverage counts).
  Missing thumbnails mean the file has not been fetched yet — run <code>fetch.py --commons</code>.</p>
  <div id="groups"></div>
  <h2>YouTube <small>press <b>Load</b>, scrub the player to the start of a walking segment → <b>Mark start</b>, to its end → <b>Mark end</b>. Or type ranges as <code>1:20-2:45, 5:00-5:30</code> / <code>all</code>; blank = not selected</small></h2>
  <div id="player-wrap" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-bottom:10px">
    <div id="player" style="width:640px;max-width:100%;aspect-ratio:16/9;background:#000"></div>
    <div>
      <div id="now" class="hint">no video loaded</div>
      <p><button id="mark-in">Mark start</button> <button id="mark-out">Mark end</button> <button id="drop-last">Drop last range</button></p>
      <p class="hint" id="player-note"></p>
    </div>
  </div>
  <table id="yt"><thead><tr><th></th><th>id</th><th>title</th><th>len</th><th>fmt</th><th style="width:40%">ranges</th></tr></thead><tbody></tbody></table>
  <h2>selection.yaml preview</h2>
  <pre id="out"></pre>
</section>
<script>
const DATA = __DATA__;
const BUCKETS = __BUCKETS__;
const KEY = 'dak-audit-v1';
document.documentElement.style.setProperty('--w', DATA.thumb + 'px');

let state = { commons: {}, youtube: {} };   // commons: {id: {sel: bool, bucket: str}} ; youtube: {id: "ranges"}
try { const s = localStorage.getItem(KEY); if (s) state = JSON.parse(s); } catch (e) {}
// pre-load an existing selection.yaml (only for ids not touched in this browser yet)
for (const [id, b] of Object.entries(DATA.preset.commons)) if (!(id in state.commons)) state.commons[id] = { sel: true, bucket: b || '' };
for (const [id, r] of Object.entries(DATA.preset.youtube)) if (!(id in state.youtube)) state.youtube[id] = r;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };

const groups = document.getElementById('groups');
const byCat = {};
for (const e of DATA.commons) (byCat[e.categories[0] || 'uncategorised'] ||= []).push(e);
for (const [cat, list] of Object.entries(byCat).sort()) {
  const h = document.createElement('h2');
  h.innerHTML = `${esc(cat)} <small>${list.length}</small> <button data-all="${esc(cat)}">select all</button> <button data-none="${esc(cat)}">clear</button>`;
  groups.appendChild(h);
  const g = document.createElement('div'); g.className = 'grid'; g.dataset.cat = cat;
  for (const e of list) {
    const c = document.createElement('div'); c.className = 'card'; c.dataset.id = e.id;
    c.dataset.text = `${e.id} ${e.title} ${e.categories.join(' ')}`.toLowerCase();
    const opts = ['<option value="">— bucket —</option>'].concat(BUCKETS.map(b => `<option>${b}</option>`)).join('');
    c.innerHTML = (e.thumb ? `<img loading="lazy" src="${e.thumb}" title="${esc(e.title)}">` : `<div class="noimg">not fetched</div>`) +
      `<div class="meta"><div class="t" title="${esc(e.title)}">${esc(e.title.replace(/^File:/, ''))}</div>` +
      `<div class="d">${e.id} · ${e.width}×${e.height} · ${esc(e.license || '?')} · <a href="${e.page}" target="_blank">page</a></div>` +
      `<select>${opts}</select></div>`;
    g.appendChild(c);
  }
  groups.appendChild(g);
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function render() {
  let n = 0;
  const q = document.getElementById('q').value.toLowerCase();
  const onlySel = document.getElementById('onlysel').checked, hideRej = document.getElementById('hiderej').checked;
  for (const c of document.querySelectorAll('.card')) {
    const st = state.commons[c.dataset.id] || {};
    c.classList.toggle('sel', !!st.sel);
    c.classList.toggle('rej', st.sel === false);
    c.querySelector('select').value = st.bucket || '';
    const show = (!q || c.dataset.text.includes(q)) && (!onlySel || st.sel) && !(hideRej && st.sel === false);
    c.classList.toggle('hide', !show);
    if (st.sel) n++;
  }
  document.getElementById('n-sel').textContent = n + ' selected';
  document.getElementById('n-tot').textContent = DATA.commons.length + ' images · ' + DATA.youtube.length + ' videos';
  document.getElementById('out').textContent = toYaml();
  save();
}
groups.addEventListener('click', ev => {
  const img = ev.target.closest('img, .noimg');
  if (img) { const id = img.closest('.card').dataset.id; const st = state.commons[id] ||= {};
    st.sel = st.sel === true ? false : (st.sel === false ? undefined : true); if (st.sel === undefined) delete st.sel; render(); return; }
  const b = ev.target.closest('button');
  if (b?.dataset.all !== undefined || b?.dataset.none !== undefined) {
    const cat = b.dataset.all ?? b.dataset.none, on = b.dataset.all !== undefined;
    for (const c of document.querySelector(`.grid[data-cat="${CSS.escape(cat)}"]`).querySelectorAll('.card:not(.hide)'))
      (state.commons[c.dataset.id] ||= {}).sel = on ? true : undefined;
    render();
  }
});
groups.addEventListener('change', ev => {
  if (ev.target.tagName === 'SELECT') { const id = ev.target.closest('.card').dataset.id;
    (state.commons[id] ||= {}).bucket = ev.target.value; if (ev.target.value && state.commons[id].sel === undefined) state.commons[id].sel = true; render(); }
});
for (const id of ['q', 'onlysel', 'hiderej']) document.getElementById(id).addEventListener('input', render);

const tb = document.querySelector('#yt tbody');
for (const v of DATA.youtube) {
  const tr = document.createElement('tr');
  const d = v.duration || 0;
  tr.innerHTML = `<td><button data-load="${v.id}">Load</button></td><td><a href="${v.webpage_url}" target="_blank">${v.id}</a></td><td>${esc(v.title)}</td>` +
    `<td>${Math.floor(d / 60)}:${String(Math.floor(d % 60)).padStart(2, '0')}</td><td>${v.height || '?'}p ${v.fps || ''}</td>` +
    `<td><input type="text" data-yt="${v.id}" value="${esc(state.youtube[v.id] || '')}" placeholder="1:20-2:45, 5:00-5:30  or  all"></td>`;
  tb.appendChild(tr);
}
tb.addEventListener('input', ev => { if (ev.target.dataset.yt) { state.youtube[ev.target.dataset.yt] = ev.target.value.trim(); render(); } });

// --- embedded player (YouTube IFrame API). Needs an http(s) origin: run `audit.py --serve`.
let player = null, current = null, pendingStart = null;
const note = document.getElementById('player-note');
if (location.protocol === 'file:') note.textContent = 'Opened as a file — the embedded player is blocked by YouTube on file:// pages. Run  python scripts/laptop/audit.py --serve  and use the localhost URL; the links in the table still work.';
const tag = document.createElement('script'); tag.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(tag);
window.onYouTubeIframeAPIReady = () => { player = new YT.Player('player', { width: 640, height: 360, playerVars: { rel: 0, modestbranding: 1 } }); };
tb.addEventListener('click', ev => { const b = ev.target.closest('button[data-load]'); if (!b || !player) return;
  current = b.dataset.load; pendingStart = null; player.loadVideoById(current); player.pauseVideo(); });
const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
setInterval(() => { if (player && current && player.getCurrentTime) { const t = player.getCurrentTime() || 0;
  document.getElementById('now').textContent = `${current} @ ${fmt(t)}` + (pendingStart != null ? `   (start marked at ${fmt(pendingStart)})` : ''); } }, 250);
document.getElementById('mark-in').onclick = () => { if (player && current) pendingStart = player.getCurrentTime(); };
document.getElementById('mark-out').onclick = () => { if (!player || !current || pendingStart == null) return;
  const end = player.getCurrentTime(); if (end <= pendingStart) return;
  const inp = tb.querySelector(`input[data-yt="${current}"]`); const cur = (inp.value.trim() === 'all' ? '' : inp.value.trim());
  inp.value = (cur ? cur + ', ' : '') + `${fmt(pendingStart)}-${fmt(end)}`; state.youtube[current] = inp.value; pendingStart = null; render(); };
document.getElementById('drop-last').onclick = () => { if (!current) return; const inp = tb.querySelector(`input[data-yt="${current}"]`);
  const parts = inp.value.split(',').map(s => s.trim()).filter(Boolean); parts.pop(); inp.value = parts.join(', '); state.youtube[current] = inp.value; render(); };

function toYaml() {
  const inc = [], buckets = [], counts = {};
  for (const e of DATA.commons) { const st = state.commons[e.id]; if (!st?.sel) continue;
    inc.push(`    - ${e.id}${st.bucket ? '   # ' + st.bucket : ''}`);
    if (st.bucket) { buckets.push(`    ${e.id}: ${st.bucket}`); counts[st.bucket] = (counts[st.bucket] || 0) + 1; } }
  const yt = [];
  for (const v of DATA.youtube) { const r = (state.youtube[v.id] || '').trim(); if (!r) continue;
    if (r === 'all') { yt.push(`  ${v.id}: all   # ${v.title}`); continue; }
    const ranges = r.split(',').map(s => s.trim()).filter(Boolean).map(s => { const [a, b] = s.split('-').map(x => x.trim()); return `["${a}", "${b}"]`; });
    yt.push(`  ${v.id}: [${ranges.join(', ')}]   # ${v.title}`); }
  const cov = Object.entries(counts).sort().map(([b, n]) => `#   ${b}: ${n}`).join('\\n');
  return `# Generated by the audit page — commit as configs/selection.yaml\\n# coverage by bucket:\\n${cov || '#   (no buckets assigned)'}\\ncommons:\\n  include:\\n${inc.join('\\n') || '    []'}\\n  exclude: []\\n  buckets:\\n${buckets.join('\\n') || '    {}'}\\nyoutube:\\n${yt.join('\\n') || '  {}'}\\n`;
}
document.getElementById('copy').onclick = async () => { await navigator.clipboard.writeText(toYaml()); document.getElementById('copy').textContent = 'Copied!'; setTimeout(() => document.getElementById('copy').textContent = 'Copy selection.yaml', 1500); };
document.getElementById('dl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([toYaml()], { type: 'text/yaml' })); a.download = 'selection.yaml'; a.click(); };
document.getElementById('reset').onclick = () => { if (confirm('Clear all audit choices in this browser?')) { state = { commons: {}, youtube: {} }; render(); } };
render();
</script>
"""


def preset_from_selection() -> dict:
    """Existing configs/selection.yaml → {commons: {id: bucket}, youtube: {id: 'ranges text'}}."""
    sel = R.load_selection()
    if not sel:
        return {"commons": {}, "youtube": {}}
    manifest = R.load_manifest()
    commons = {e["id"]: (sel["commons"].get("buckets") or {}).get(e["id"], "")
               for e in R.selected_commons(manifest, sel)}
    youtube = {}
    for vid, spec in (sel.get("youtube") or {}).items():
        youtube[vid] = "all" if spec in ("all", None, []) else ", ".join(f"{a}-{b}" for a, b in spec)
    return {"commons": commons, "youtube": youtube}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--thumb", type=int, default=300, help="thumbnail long edge in px")
    ap.add_argument("--serve", nargs="?", const=8765, type=int, metavar="PORT",
                    help="after building, serve data/audit on http://localhost:PORT (needed for the embedded YouTube player)")
    a = ap.parse_args()
    manifest = R.load_manifest()
    entries = sorted(manifest["commons"].values(), key=lambda e: (e["categories"][0] if e["categories"] else "", e["title"]))
    thumbs = make_thumbs(entries, a.thumb)
    commons = [{k: e.get(k) for k in ("id", "title", "width", "height", "license", "page", "categories")} | {"thumb": thumbs[e["id"]][0]}
               for e in entries]
    data = {"thumb": a.thumb, "commons": commons, "youtube": list(manifest["youtube"].values()), "preset": preset_from_selection()}
    page = PAGE.replace("__DATA__", json.dumps(data, ensure_ascii=False)).replace("__BUCKETS__", json.dumps(R.BUCKETS))
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    (AUDIT_DIR / "index.html").write_text(page, encoding="utf-8")
    missing = sum(1 for t in thumbs.values() if not t[1])
    print(f"{len(entries)} images ({missing} not fetched), {len(data['youtube'])} videos → {AUDIT_DIR / 'index.html'}")
    if a.serve:
        serve(a.serve)


def serve(port: int) -> None:
    import functools
    from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(AUDIT_DIR))
    handler.log_message = lambda *args, **kw: None  # quiet
    url = f"http://localhost:{port}/"
    print(f"serving {AUDIT_DIR} at {url}  (Ctrl+C to stop)")
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
