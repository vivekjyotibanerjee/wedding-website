import { content } from './content.js';
import { createScene } from './scene/scene.js';
import { createAmbience, createPlaylist, hasPlaylist } from './audio.js';
import { mountCards } from './cards.js';
import { at } from './scene/walk.js';
import { renderSections } from './sections.js';
import { mountDebug } from './debug.js';

document.title = content.site.title; // also baked into index.html at build time (vite.config.js)

const canvas = document.getElementById('scene');
const veil = document.getElementById('veil');
const veilNote = document.getElementById('veil-note');
const walk = document.getElementById('walk');
const cardsEl = document.getElementById('cards');
const hint = document.getElementById('scroll-hint');
const audioBtn = document.getElementById('audio-toggle');
const nightBtn = document.getElementById('night-toggle');
const details = document.getElementById('details');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Whatever happens, never leave guests stuck behind the loading veil: if the model download makes
// no progress for a while (or fails), show the details as a plain page instead.
let veilFailsafe = 0;
function armFailsafe(ms) {
  clearTimeout(veilFailsafe);
  veilFailsafe = setTimeout(() => { console.warn('Model load stalled; showing details only'); fallbackToDetails(); }, ms);
}
function onProgress(f) {
  veilNote.textContent = f >= 0 && f < 1 ? `${Math.round(f * 100)} %` : '';
  armFailsafe(25000);
}

let sceneApi = null;
let sound = null;
try {
  sceneApi = createScene(canvas, { reducedMotion, onProgress, onBell: () => sound && sound.ring() });
} catch (e) {
  console.error('WebGL scene failed to start', e);
  sceneApi = null;
}

function fallbackToDetails() {
  clearTimeout(veilFailsafe);
  if (document.body.classList.contains('no-webgl')) return;
  if (sceneApi) { try { sceneApi.stop(); sceneApi.dispose(); } catch (_) { /* ignore */ } }
  document.body.classList.add('no-webgl');
  details.hidden = false;
  renderSections(details);
  veil.classList.add('is-done');
}

if (!sceneApi) {
  // No WebGL — the wedding info is what matters; show it as a plain page.
  fallbackToDetails();
} else try {
  if (location.hash.includes('debug')) { window.templeScene = sceneApi; mountDebug(sceneApi); }
  armFailsafe(25000);
  const cards = mountCards(cardsEl, sceneApi);
  sound = hasPlaylist() ? createPlaylist() : createAmbience();

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
    document.documentElement.style.setProperty('--vignette', fade.toFixed(3));
    const nowPast = fade <= 0;
    if (nowPast !== pastWalk) {
      pastWalk = nowPast;
      if (pastWalk) sceneApi.stop(); else sceneApi.start();
    }
    hint.classList.toggle('is-hidden', y > 40);
    sound.setDepth(Math.min(1, Math.max(0, (progressTarget - at(30)) / (at(34) - at(30)))));   // deeper as the temple stair is climbed
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

  // ── Boot: the veil lifts once the model is in ────────────
  sceneApi.resize();
  onScroll();
  sceneApi.ready.then(() => {
    if (document.body.classList.contains('no-webgl')) return; // the failsafe already gave up on us
    clearTimeout(veilFailsafe);
    sceneApi.renderOnce(); // compile shaders before lifting the veil
    requestAnimationFrame(() => {
      if (!pastWalk) sceneApi.start();
      syncCards();
      veil.classList.add('is-done');
    });
  }).catch((e) => {
    console.error('Model failed to load; showing details only', e);
    fallbackToDetails();
  });
} catch (e) {
  console.error('Temple walk failed to start; showing details only', e);
  fallbackToDetails();
}
