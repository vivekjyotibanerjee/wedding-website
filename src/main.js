import { content } from './content.js';
import { createScene } from './scene/scene.js';
import { createAmbience, createPlaylist, hasPlaylist } from './audio.js';
import { mountCards } from './cards.js';
import { renderSections } from './sections.js';

document.title = `${content.couple.partner1} & ${content.couple.partner2} — Wedding`;

const canvas = document.getElementById('scene');
const veil = document.getElementById('veil');
const walk = document.getElementById('walk');
const cardsEl = document.getElementById('cards');
const hint = document.getElementById('scroll-hint');
const audioBtn = document.getElementById('audio-toggle');
const nightBtn = document.getElementById('night-toggle');
const details = document.getElementById('details');

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
  details.hidden = false;
  renderSections(details);
  veil.classList.add('is-done');
  clearTimeout(veilFailsafe);
}

if (!sceneApi) {
  // No WebGL — the wedding info is what matters; show it as a plain page.
  fallbackToDetails();
} else try {
  const cards = mountCards(cardsEl, sceneApi);
  const sound = hasPlaylist() ? createPlaylist() : createAmbience();

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
    const fade = 1 - Math.min(1, over);
    canvas.style.opacity = fade.toFixed(3);
    const nowPast = fade <= 0;
    if (nowPast !== pastWalk) {
      pastWalk = nowPast;
      if (pastWalk) sceneApi.stop(); else sceneApi.start();
    }
    hint.classList.toggle('is-hidden', y > 40);
    sound.setDepth(Math.min(1, Math.max(0, (progressTarget - 0.7) / 0.25)));
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

  // ── Card sync ────────────────────────────────────────────
  function syncCards() {
    cards.update(sceneApi.progress, over);
    requestAnimationFrame(syncCards);
  }

  // ── Day / night ──────────────────────────────────────────
  let night = false;
  try { night = localStorage.getItem('temple-night') === '1'; } catch (_) { /* ignore */ }
  function applyNight(on, persist = true) {
    night = on;
    sceneApi.setNight(on);
    document.body.classList.toggle('is-night', on);
    nightBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    nightBtn.setAttribute('aria-label', on ? 'Switch to day' : 'Switch to night');
    nightBtn.querySelector('.label').textContent = on ? 'Day' : 'Night';
    if (persist) { try { localStorage.setItem('temple-night', on ? '1' : '0'); } catch (_) { /* ignore */ } }
  }
  applyNight(night, false);
  nightBtn.addEventListener('click', () => applyNight(!night));

  // ── Sound ────────────────────────────────────────────────
  audioBtn.addEventListener('click', async () => {
    const on = await sound.toggle();
    audioBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    audioBtn.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { sound.suspend(); sceneApi.stop(); }
    else { sound.resume(); if (!pastWalk) sceneApi.start(); }
  });

  // ── Boot ─────────────────────────────────────────────────
  sceneApi.resize();
  onScroll();
  sceneApi.renderOnce(); // compile shaders before lifting the veil
  requestAnimationFrame(() => {
    sceneApi.start();
    syncCards();
    veil.classList.add('is-done');
    clearTimeout(veilFailsafe);
  });
} catch (e) {
  console.error('Temple walk failed to start; showing details only', e);
  try { sceneApi.dispose(); } catch (_) { /* ignore */ }
  fallbackToDetails();
}
