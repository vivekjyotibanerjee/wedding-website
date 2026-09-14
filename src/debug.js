import { STAGES } from './scene/stage.js';

// A small panel for tuning the walk (open the site with #debug): the stage and its transitions,
// draw calls and frame time, the camera, and a button per stage to jump the scroll there. The
// scene itself is on window.templeScene (main.js).
export function mountDebug(sceneApi) {
  const el = document.createElement('div');
  el.id = 'debug';
  const keys = Object.keys(sceneApi.stage).filter((k) => !['progress', 'effective', 'name'].includes(k));
  el.innerHTML = `
    <div class="dbg-row"><b id="dbg-stage"></b><span id="dbg-progress"></span></div>
    <div class="dbg-bars">${keys.map((k) => `<label>${k}<i><b id="dbg-${k}"></b></i></label>`).join('')}</div>
    <div class="dbg-row"><span id="dbg-perf"></span><span id="dbg-cam"></span></div>
    <div class="dbg-jumps">${STAGES.map((s) => `<button type="button" data-t="${s.start}">${s.name}</button>`).join('')}</div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-t]');
    if (!b) return;
    const walk = document.getElementById('walk');
    window.scrollTo({ top: (+b.dataset.t) * Math.max(1, walk.offsetHeight - window.innerHeight) + 2 });
  });
  const $ = (id) => el.querySelector(`#dbg-${id}`);
  let frames = 0, t0 = performance.now(), fps = 0;
  function tick() {
    frames++;
    const now = performance.now();
    if (now - t0 > 500) { fps = (frames * 1000) / (now - t0); frames = 0; t0 = now; }
    const st = sceneApi.stage;
    $('stage').textContent = st.name;
    $('progress').textContent = `${st.progress.toFixed(3)} (mark ${st.effective.toFixed(3)})`;
    for (const k of keys) $(k).style.width = `${(st[k] * 100).toFixed(0)}%`;
    $('perf').textContent = `${fps.toFixed(0)} fps · ${sceneApi.debug.calls} calls · ${sceneApi.debug.programs} programs · ${sceneApi.debug.decor ? sceneApi.debug.decor.counts.blooms + ' blooms · ' : ''}${sceneApi.quality}${sceneApi.night ? ' · night' : ''}`;
    const c = sceneApi.camera.position;
    $('cam').textContent = `cam ${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)}`;
    requestAnimationFrame(tick);
  }
  tick();
}
