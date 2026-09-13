import { content } from './content.js';
import { createScene } from './scene/scene.js';
import { createAmbience } from './audio.js';
import { mountStages } from './stages.js';
import { renderSections } from './sections.js';

document.title = `${content.couple.partner1} & ${content.couple.partner2} — Wedding`;

const canvas = document.getElementById('scene');
const veil = document.getElementById('veil');
const walk = document.getElementById('walk');
const stagesEl = document.getElementById('stages');
const hint = document.getElementById('scroll-hint');
const audioBtn = document.getElementById('audio-toggle');

renderSections(document.getElementById('details'));

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let sceneApi = null;
try {
  sceneApi = createScene(canvas, { reducedMotion });
} catch (e) {
  console.error('WebGL scene failed to start', e);
  sceneApi = null;
}

// Whatever happens, never leave guests stuck behind the loading veil.
const veilFailsafe = setTimeout(() => veil.classList.add('is-done'), 6000);

function fallbackToDetails() {
  document.body.classList.add('no-webgl');
  veil.classList.add('is-done');
  clearTimeout(veilFailsafe);
}

if (!sceneApi) {
  // No WebGL — drop straight to the details; the wedding info is what matters.
  fallbackToDetails();
} else try {
  const stages = mountStages(stagesEl);
  const ambience = createAmbience();

  // ── Scroll → progress ────────────────────────────────────
  let progressTarget = 0;
  let over = 0; // viewport-heights scrolled past the end of the walk
  let pastWalk = false;
  const walkLength = () => Math.max(1, walk.offsetHeight - window.innerHeight);

  function onScroll() {
    const y = window.scrollY || window.pageYOffset;
    const len = walkLength();
    progressTarget = Math.min(1, Math.max(0, y / len));
    over = Math.max(0, (y - len) / window.innerHeight);
    sceneApi.setProgress(progressTarget);
    // Fade the scene as the details section slides up over it; stop rendering once it is covered.
    const fade = 1 - Math.min(1, over);
    canvas.style.opacity = fade.toFixed(3);
    const nowPast = fade <= 0;
    if (nowPast !== pastWalk) {
      pastWalk = nowPast;
      if (pastWalk) sceneApi.stop(); else sceneApi.start();
    }
    hint.classList.toggle('is-hidden', y > 40);
    ambience.setDepth(Math.min(1, Math.max(0, (progressTarget - 0.55) / 0.35)));
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  function onResize() { sceneApi.resize(); onScroll(); }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  // ── Pointer parallax (desktop only) ──────────────────────
  if (window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('pointermove', (e) => {
      sceneApi.setPointer((e.clientX / window.innerWidth - 0.5) * 2, -(e.clientY / window.innerHeight - 0.5) * 2);
    }, { passive: true });
  }

  // ── Overlay sync ─────────────────────────────────────────
  function syncOverlays() {
    stages.update(sceneApi.progress, over);
    requestAnimationFrame(syncOverlays);
  }

  // ── Audio ────────────────────────────────────────────────
  audioBtn.addEventListener('click', async () => {
    const on = await ambience.toggle();
    audioBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    audioBtn.setAttribute('aria-label', on ? 'Turn ambient sound off' : 'Turn ambient sound on');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { ambience.suspend(); sceneApi.stop(); }
    else { ambience.resume(); if (!pastWalk) sceneApi.start(); }
  });

  // ── Boot ─────────────────────────────────────────────────
  sceneApi.resize();
  onScroll();
  sceneApi.renderOnce(); // compile shaders before lifting the veil
  requestAnimationFrame(() => {
    sceneApi.start();
    syncOverlays();
    veil.classList.add('is-done');
    clearTimeout(veilFailsafe);
  });
} catch (e) {
  console.error('Temple walk failed to start; showing details only', e);
  try { sceneApi.dispose(); } catch (_) { /* ignore */ }
  fallbackToDetails();
}
