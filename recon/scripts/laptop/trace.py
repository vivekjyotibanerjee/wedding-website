#!/usr/bin/env python3
"""LAPTOP. Trace the inner layout of the complex from a satellite screenshot → configs/layout.inner.yaml

  python scripts/laptop/trace.py [data/reference/satellite.png]      # → data/layout/trace.html

Open the page: the OSM footprint (configs/layout.geojson, metres) is drawn underneath; the screenshot
is overlaid with drag / scale / rotate / opacity controls so you can fit it to the complex outline.
Calibrate scale by clicking two points a known distance apart (e.g. two 100 ft ticks of the Google
measure tool). Then pick a landmark from the list and click it on the image. "Copy YAML" gives
configs/layout.inner.yaml — every landmark in metres, x east / y north, same origin as
layout.geojson. Choices persist in localStorage between reloads.
"""
from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import reconlib as R  # noqa: E402

OUT = R.DATA / "layout" / "trace.html"

# Landmarks the rest of the pipeline reads. Points unless noted; "poly" = click several, double-click to close.
LANDMARKS = [
    ("mandir_center", "point", "Centre of the navaratna (main) temple"),
    ("mandir_footprint", "poly", "Outline of the main temple's platform"),
    ("natmandir_center", "point", "Centre of the nat-mandir (pillared hall)"),
    ("natmandir_footprint", "poly", "Outline of the nat-mandir"),
    ("mandap", "point", "Where the wedding mandap goes (courtyard, in front of the stairs)"),
    ("stairs_bottom", "point", "Foot of the main stair up to the temple"),
    ("temple_door", "point", "Sanctum doorway (top of the stairs)"),
    ("shiva_row_north", "point", "Northernmost Shiva temple"),
    ("shiva_row_south", "point", "Southernmost Shiva temple"),
    ("courtyard", "poly", "Courtyard / platform outline (the Google measure loop)"),
    ("gate", "point", "Main entrance gate (context only)"),
    ("ghat", "point", "Chandni ghat steps (context only)"),
    ("walk_start", "point", "Where the scroll-walk should begin"),
]

PAGE = r"""<!doctype html><meta charset="utf-8"><title>Layout trace</title>
<style>
 body{margin:0;font:13px system-ui,sans-serif;display:grid;grid-template-columns:1fr 320px;height:100vh}
 #stage{position:relative;overflow:hidden;background:#f4f2ee;cursor:crosshair}
 canvas{position:absolute;inset:0}
 aside{border-left:1px solid #ddd;padding:12px;overflow:auto;background:#fff}
 aside h3{margin:12px 0 6px;font-size:13px}
 label{display:block;margin:4px 0}
 input[type=range]{width:100%}
 .lm{display:flex;gap:6px;align-items:center;padding:3px 4px;border-radius:4px;cursor:pointer}
 .lm.active{background:#dfe}
 .lm b{min-width:140px;font-weight:600}
 .lm small{color:#666}
 .lm .n{margin-left:auto;color:#2a5}
 button{padding:5px 10px;margin:2px 0}
 pre{background:#222;color:#eee;padding:8px;font-size:11px;max-height:200px;overflow:auto}
 .hint{color:#666}
</style>
<div id="stage"><canvas id="c"></canvas></div>
<aside>
 <h3>Image fit</h3>
 <label>opacity <input type="range" id="op" min="0" max="1" step="0.05" value="0.7"></label>
 <label>rotation ° <input type="number" id="rot" step="0.5" value="0" style="width:80px"></label>
 <label>scale (px per m) <input type="number" id="ppm" step="0.01" value="3" style="width:80px"></label>
 <div class="hint">Drag with the right mouse button (or Shift+drag) to move the image. Mouse wheel zooms the view.</div>
 <button id="cal">Calibrate: click 2 points…</button> <input id="caldist" type="text" placeholder="30.48 m or 100 ft" style="width:100px">
 <h3>Landmarks <small class="hint">(click one, then click on the image; poly: double-click to finish)</small></h3>
 <div id="lms"></div>
 <button id="undo">Undo last point</button> <button id="clear">Clear active</button>
 <h3>Output</h3>
 <button id="copy">Copy YAML</button> <button id="dl">Download layout.inner.yaml</button>
 <pre id="out"></pre>
</aside>
<script>
const GJ = __GEOJSON__, LM = __LANDMARKS__, IMG = "__IMG__", KEY = 'dak-trace-v1';
const c = document.getElementById('c'), ctx = c.getContext('2d'), stage = document.getElementById('stage');
const img = new Image(); img.src = IMG;
let st = { view: { ppm: 3, cx: 0, cy: 0 }, img: { x: 0, y: 0, ppm: 3, rot: 0, op: 0.7 }, pts: {}, active: LM[0][0] };
try { const s = localStorage.getItem(KEY); if (s) Object.assign(st, JSON.parse(s)); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
const ui = id => document.getElementById(id);
ui('op').value = st.img.op; ui('rot').value = st.img.rot; ui('ppm').value = st.img.ppm;

function resize() { c.width = stage.clientWidth; c.height = stage.clientHeight; draw(); }
window.addEventListener('resize', resize);
// world (m, x east, y north) <-> screen
const w2s = (x, y) => [c.width / 2 + (x - st.view.cx) * st.view.ppm, c.height / 2 - (y - st.view.cy) * st.view.ppm];
const s2w = (sx, sy) => [(sx - c.width / 2) / st.view.ppm + st.view.cx, -(sy - c.height / 2) / st.view.ppm + st.view.cy];

function draw() {
  ctx.clearRect(0, 0, c.width, c.height);
  // image: its centre sits at world (img.x, img.y), img.ppm pixels per metre, rotated img.rot degrees
  if (img.complete && img.naturalWidth) {
    ctx.save(); ctx.globalAlpha = st.img.op;
    const [sx, sy] = w2s(st.img.x, st.img.y); const k = st.view.ppm / st.img.ppm;
    ctx.translate(sx, sy); ctx.rotate(st.img.rot * Math.PI / 180); ctx.scale(k, k);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2); ctx.restore();
  }
  for (const f of GJ.features) {
    const k = f.properties.kind, poly = f.geometry.type === 'Polygon';
    const co = poly ? f.geometry.coordinates[0] : f.geometry.coordinates;
    ctx.beginPath(); co.forEach(([x, y], i) => { const [sx, sy] = w2s(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
    ctx.lineWidth = k === 'main-temple' ? 2.5 : 1; ctx.strokeStyle = k === 'main-temple' ? '#c0392b' : k === 'road' ? '#aaa' : '#8d6e63';
    ctx.setLineDash(k === 'main-temple' ? [] : [4, 3]); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const [name, type] of LM) {
    const pts = st.pts[name] || []; if (!pts.length) continue;
    const act = name === st.active; ctx.strokeStyle = ctx.fillStyle = act ? '#0a0' : '#06c';
    if (type === 'poly') { ctx.beginPath(); pts.forEach(([x, y], i) => { const [sx, sy] = w2s(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }); if (pts.closed) ctx.closePath(); ctx.lineWidth = 2; ctx.stroke(); }
    for (const [x, y] of pts) { const [sx, sy] = w2s(x, y); ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.fill(); }
    const [lx, ly] = w2s(...pts[0]); ctx.fillText(name, lx + 6, ly - 6);
  }
  // scale bar
  const [ax, ay] = [20, c.height - 20]; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + 20 * st.view.ppm, ay); ctx.stroke(); ctx.fillStyle = '#000'; ctx.fillText('20 m', ax, ay - 6);
  ui('out').textContent = toYaml(); renderList(); save();
}
img.onload = draw;

// --- interaction
let drag = null, cal = null;
stage.addEventListener('contextmenu', e => e.preventDefault());
stage.addEventListener('mousedown', e => {
  if (e.button === 2 || e.shiftKey) { drag = { sx: e.offsetX, sy: e.offsetY, ix: st.img.x, iy: st.img.y }; return; }
  if (e.button === 1) { drag = { sx: e.offsetX, sy: e.offsetY, vx: st.view.cx, vy: st.view.cy, view: true }; e.preventDefault(); }
});
stage.addEventListener('mousemove', e => {
  if (!drag) return; const dx = (e.offsetX - drag.sx) / st.view.ppm, dy = -(e.offsetY - drag.sy) / st.view.ppm;
  if (drag.view) { st.view.cx = drag.vx - dx; st.view.cy = drag.vy - dy; } else { st.img.x = drag.ix + dx; st.img.y = drag.iy + dy; }
  draw();
});
window.addEventListener('mouseup', () => { drag = null; });
stage.addEventListener('wheel', e => { e.preventDefault(); const [wx, wy] = s2w(e.offsetX, e.offsetY); st.view.ppm *= e.deltaY < 0 ? 1.1 : 1 / 1.1; const [nx, ny] = s2w(e.offsetX, e.offsetY); st.view.cx += wx - nx; st.view.cy += wy - ny; draw(); }, { passive: false });
stage.addEventListener('click', e => {
  if (e.shiftKey) return; const p = s2w(e.offsetX, e.offsetY);
  if (cal) { cal.push(p); if (cal.length === 2) { finishCal(); } return; }
  const type = LM.find(l => l[0] === st.active)[1];
  const pts = st.pts[st.active] || (st.pts[st.active] = []);
  if (type === 'point') pts.splice(0, pts.length, p); else if (!pts.closed) pts.push(p);
  draw();
});
stage.addEventListener('dblclick', () => { const pts = st.pts[st.active]; if (pts && pts.length > 2) { pts.closed = true; pts.pop(); draw(); } });
ui('cal').onclick = () => { cal = []; ui('cal').textContent = 'click point 1…'; };
function finishCal() {
  const t = ui('caldist').value.trim(); let m = parseFloat(t); if (/ft/.test(t)) m *= 0.3048;
  if (!(m > 0)) { alert('enter the real distance first, e.g. "100 ft" or "30.48 m"'); cal = null; ui('cal').textContent = 'Calibrate: click 2 points…'; return; }
  const d = Math.hypot(cal[0][0] - cal[1][0], cal[0][1] - cal[1][1]);   // metres at current image scale
  const f = d / m;                                                       // image is f× too large
  // rescale the image about its centre so that distance becomes m; keep the clicked midpoint where it is
  const mid = [(cal[0][0] + cal[1][0]) / 2, (cal[0][1] + cal[1][1]) / 2];
  st.img.ppm *= f; st.img.x = mid[0] + (st.img.x - mid[0]) / f; st.img.y = mid[1] + (st.img.y - mid[1]) / f;
  ui('ppm').value = st.img.ppm.toFixed(3); cal = null; ui('cal').textContent = 'Calibrate: click 2 points…'; draw();
}
ui('op').oninput = e => { st.img.op = +e.target.value; draw(); };
ui('rot').oninput = e => { st.img.rot = +e.target.value; draw(); };
ui('ppm').oninput = e => { st.img.ppm = +e.target.value || st.img.ppm; draw(); };
ui('undo').onclick = () => { const p = st.pts[st.active]; if (p) { p.closed = false; p.pop(); } draw(); };
ui('clear').onclick = () => { delete st.pts[st.active]; draw(); };

function renderList() {
  const el = ui('lms'); el.innerHTML = '';
  for (const [name, type, desc] of LM) {
    const d = document.createElement('div'); d.className = 'lm' + (name === st.active ? ' active' : '');
    const n = (st.pts[name] || []).length;
    d.innerHTML = `<b>${name}</b><small>${type === 'poly' ? 'poly · ' : ''}${desc}</small><span class="n">${n ? (type === 'poly' ? n + ' pts' : '✓') : ''}</span>`;
    d.onclick = () => { st.active = name; draw(); }; el.appendChild(d);
  }
}
function toYaml() {
  const r = v => Math.round(v * 10) / 10;
  let s = `# Traced by scripts/laptop/trace.py from ${'data/reference/satellite.png'}\n# metres, x = east, y = north, origin = configs/layout.geojson origin (${GJ.properties.origin_latlon.map(v => v.toFixed(6)).join(', ')})\nimage_fit: { center: [${r(st.img.x)}, ${r(st.img.y)}], px_per_m: ${st.img.ppm.toFixed(3)}, rotation_deg: ${st.img.rot} }\nlandmarks:\n`;
  for (const [name, type] of LM) { const p = st.pts[name]; if (!p || !p.length) continue;
    s += type === 'point' ? `  ${name}: [${r(p[0][0])}, ${r(p[0][1])}]\n` : `  ${name}: [${p.map(q => `[${r(q[0])}, ${r(q[1])}]`).join(', ')}]\n`; }
  return s;
}
ui('copy').onclick = async () => { await navigator.clipboard.writeText(toYaml()); ui('copy').textContent = 'Copied!'; setTimeout(() => ui('copy').textContent = 'Copy YAML', 1500); };
ui('dl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([toYaml()], { type: 'text/yaml' })); a.download = 'layout.inner.yaml'; a.click(); };
resize();
</script>"""


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else R.DATA / "reference" / "satellite.png"
    if not src.exists():
        raise SystemExit(f"screenshot not found: {src}")
    gj = json.loads((R.CONFIGS / "layout.geojson").read_text())
    mime = "image/png" if src.suffix.lower() == ".png" else "image/jpeg"
    data = f"data:{mime};base64," + base64.b64encode(src.read_bytes()).decode()
    page = (PAGE.replace("__GEOJSON__", json.dumps(gj)).replace("__LANDMARKS__", json.dumps(LANDMARKS))
            .replace("__IMG__", data))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page, encoding="utf-8")
    print(f"→ {OUT}  ({len(gj['features'])} OSM features, image {src.name})")


if __name__ == "__main__":
    main()
