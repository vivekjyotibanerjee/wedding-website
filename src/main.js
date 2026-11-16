import { content } from './content.js';
import { createScene } from './scene/scene.js';
import { createSound } from './audio.js';
import { mountCards, cardStop } from './cards.js';
import { at, NODE, ANCHORS } from './scene/walk.js';
import { renderSections } from './sections.js';
import { mountDebug } from './debug.js';

document.title = content.site.title; // also baked into index.html at build time (vite.config.js)

const canvas = document.getElementById('scene');
const veil = document.getElementById('veil');
const veilNote = document.getElementById('veil-note');
const cardsEl = document.getElementById('cards');
const audioBtn = document.getElementById('audio-toggle');
const nightBtn = document.getElementById('night-toggle');
const details = document.getElementById('details');
const nav = document.getElementById('nav');
const fade = document.getElementById('fade');
const enterBtn = document.getElementById('enter');
enterBtn.textContent = content.labels.enter;

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
  document.documentElement.classList.remove('fixed-walk');
  veil.classList.add('is-done');
}

if (!sceneApi) {
  // No WebGL — the wedding info is what matters; show it as a plain page.
  fallbackToDetails();
} else try {
  if (location.hash.includes('debug')) { window.templeScene = sceneApi; mountDebug(sceneApi); }
  armFailsafe(25000);
  const cards = mountCards(cardsEl, sceneApi);
  sound = createSound();

  // ── The walk: moved only by the cards' buttons and the nav bar ──
  // The page doesn't scroll (html.fixed-walk); `progress` is the walk's own position, 0 → 1.
  let progress = 0;
  function setProgress(t) {
    progress = Math.min(1, Math.max(0, t));
    sceneApi.setProgress(progress);
    sound.setDepth(Math.min(1, Math.max(0, (progress - at(NODE.nNorth)) / (at(NODE.end) - at(NODE.nNorth)))));   // deeper as the temple stair is climbed
  }
  document.documentElement.classList.add('fixed-walk');
  window.templeWalk = { set: (t) => { stopAuto(); setProgress(t); }, get progress() { return progress; } };   // for scripts/shoot.mjs

  function onResize() { sceneApi.resize(); }
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
    cards.update(sceneApi.progress, 0);
    syncNav();
    requestAnimationFrame(syncCards);
  }

  // ── Day / night ──────────────────────────────────────────
  let night;
  night = true;   // night by default; a guest who switched to day is remembered
  try { night = localStorage.getItem('temple-night') !== '0'; } catch (_) { /* ignore */ }
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

  // ── Sound: on by default ─────────────────────────────────
  // Browsers only let a page start audio after the guest has interacted with it, so the
  // soundtrack is tried at once and, if refused, again on the first tap, click or key (scrolling
  // doesn't count). Turning it off with the button is final.
  let muted = false;
  function showSound(on) {
    audioBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    audioBtn.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
  }
  const GESTURES = ['pointerdown', 'keydown', 'touchend'];
  function onGesture(e) {
    if (audioBtn.contains(e.target)) return;   // the button's own click decides
    tryAutoplay();
  }
  function unlisten() { for (const ev of GESTURES) window.removeEventListener(ev, onGesture, true); }
  async function tryAutoplay() {
    if (muted || sound.enabled) { unlisten(); return; }
    const on = await sound.play();
    showSound(on);
    if (on) unlisten();
  }
  for (const ev of GESTURES) window.addEventListener(ev, onGesture, true);
  tryAutoplay();
  audioBtn.addEventListener('click', async () => {
    const on = await sound.toggle();
    muted = !on;
    if (on) unlisten();
    showSound(on);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { sound.suspend(); sceneApi.stop(); }
    else { sound.resume(); sceneApi.start(); }
  });

  // ── Continue walking: on to the next card's stop, then wait there ──
  // At a pace that would walk the whole complex in AUTO_SECONDS; a jump or the next card's stop
  // ends it. (The guest's own tap, so it runs under reduced motion too.)
  const AUTO_SECONDS = 180;
  const auto = { on: false, to: 0, last: 0 };
  function stopAuto() { auto.on = false; }
  function autoTick(now) {
    if (!auto.on) return;
    const dt = Math.min(0.1, (now - auto.last) / 1000);
    auto.last = now;
    setProgress(Math.min(auto.to, progress + dt / AUTO_SECONDS));
    if (progress >= auto.to) { auto.on = false; return; }
    requestAnimationFrame(autoTick);
  }
  function walkTo(t) {
    auto.to = t;
    if (auto.on) return;
    auto.on = true;
    auto.last = performance.now();
    requestAnimationFrame(autoTick);
  }
  const STOPS = Object.keys(ANCHORS).map(cardStop).sort((x, y) => x - y);
  const nextStop = (t) => STOPS.find((s) => s > t + 0.002) ?? 1;

  // ── Nav bar: a jump to each section, through a second of dark ──
  // Each item goes to the middle of its card's range (walk.js ANCHORS). The screen dims for 0.4 s,
  // the scroll and the camera jump there at once (the stage and every reveal land with it), a
  // 0.2 s hold lets the new view render, and it brightens over 0.4 s: one second in all.
  const navItems = content.nav.map((n) => ({ ...n, t: cardStop(n.card) }));
  nav.innerHTML = `<ul>${navItems.map((n, i) => `<li><button type="button" data-i="${i}">${n.label}</button></li>`).join('')}</ul>`;
  const navButtons = [...nav.querySelectorAll('button')];
  nav.hidden = !navItems.length;
  let jumping = false;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function jumpTo(t) {
    if (jumping) return;
    stopAuto();
    jumping = true;
    fade.classList.add('is-dark');
    await wait(400);
    setProgress(t);
    sceneApi.jump(t);
    await wait(200);
    fade.classList.remove('is-dark');
    await wait(400);
    jumping = false;
  }
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) jumpTo(navItems[+b.dataset.i].t);
  });
  // the buttons under every card: walk on by itself from here, or the same jump to the next card
  cardsEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-jump="end"]')) { e.preventDefault(); jumpTo(STOPS[STOPS.length - 1]); return; }
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    if (b.dataset.act === 'continue') walkTo(nextStop(progress));
    else jumpTo(cardStop(b.dataset.card));
  });
  let navActive = -1;
  function syncNav() {
    let i = -1;
    navItems.forEach((n, k) => { if (sceneApi.progress >= n.t - 0.012) i = k; });
    if (i === navActive) return;
    navActive = i;
    navButtons.forEach((b, k) => { if (k === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    if (i >= 0) {   // keep the current item in view on a narrow bar (not scrollIntoView: that can move the page)
      const ul = nav.firstElementChild, btn = navButtons[i].parentElement;
      ul.scrollTo({ left: btn.offsetLeft - (ul.clientWidth - btn.offsetWidth) / 2, behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }

  // ── Boot: once the model is in, an Enter button lifts the veil ──
  // Browsers only start sound after a tap, so the tap that enters is the one that starts the music.
  sceneApi.resize();
  setProgress(0);
  sceneApi.ready.then(() => {
    if (document.body.classList.contains('no-webgl')) return; // the failsafe already gave up on us
    clearTimeout(veilFailsafe);
    sceneApi.renderOnce(); // compile shaders before lifting the veil
    sceneApi.start();
    syncCards();
    veil.classList.add('is-ready');
    enterBtn.hidden = false;
    enterBtn.focus({ preventScroll: true });
  }).catch((e) => {
    console.error('Model failed to load; showing details only', e);
    fallbackToDetails();
  });
  enterBtn.addEventListener('click', () => {
    if (!muted) tryAutoplay();   // inside the tap, so the browser lets it play
    veil.classList.add('is-done');
  });
} catch (e) {
  console.error('Temple walk failed to start; showing details only', e);
  fallbackToDetails();
}
