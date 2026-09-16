// Screenshot the walk headlessly at a few scroll positions — the way the scene is judged when
// no browser is at hand (see CLAUDE.md). Software GL, so it is slow: let the camera converge.
//
//   node scripts/shoot.mjs <url> <outdir> [night 0|1] [t1,t2,...]
//   VW=390 VH=844 node scripts/shoot.mjs http://localhost:5173/ shots 0 0.16,0.47   # phone portrait
//
// Needs `npm i -D puppeteer-core` and a Chromium: CHROME=/path/to/chrome (defaults to the
// Playwright cache). WAIT (ms) is the settle time per shot; raise it if anything else hogs the CPU.
// SNAP=1 jumps the walk to each position instead of easing there (the stage and the reveals land
// at once; needs #debug, added to the url); LOOK=x,y,z/tx,ty,tz pins the camera there (world
// metres) for every shot, so a detail can be checked from any angle at any stage.
import puppeteer from 'puppeteer-core';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [url = 'http://localhost:5173/', outdir = 'shots', night = '0', ts = '0,0.16,0.29,0.47,0.6,0.78,0.93,1'] = process.argv.slice(2);
const home = process.env.HOME;
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = join(home, '.cache/ms-playwright');
  if (existsSync(cache)) {
    const dir = readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().pop();
    if (dir) return join(cache, dir, 'chrome-linux64/chrome');
  }
  throw new Error('set CHROME=/path/to/chrome (or install Playwright chromium)');
}
mkdirSync(outdir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
const vw = +(process.env.VW || 1280), vh = +(process.env.VH || 720);
await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { const t = m.text(); if (!/useProgram|\[vite\]/.test(t)) logs.push(`${m.type()}: ${t}`); });
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.evaluateOnNewDocument((n) => { try { localStorage.setItem('temple-night', n); } catch (_) { /* ignore */ } }, night === '1' ? '1' : '0');
const snap = process.env.SNAP === '1', look = process.env.LOOK ? process.env.LOOK.split('/').map((v) => v.split(',').map(Number)) : null;
await page.goto(snap || look ? url.replace(/#.*$/, '') + '#debug' : url, { waitUntil: 'load', timeout: 120000 });
// wait for the veil to lift (model loaded) or the no-WebGL fallback
await page.waitForFunction(() => document.getElementById('veil').classList.contains('is-done') || document.body.classList.contains('no-webgl'), { timeout: 180000 });
console.log('fallback:', await page.evaluate(() => document.body.classList.contains('no-webgl')));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(1500);
for (const t of ts.split(',').map(Number)) {
  await page.evaluate((t, snap, look) => {
    const walk = document.getElementById('walk');
    window.scrollTo(0, t * Math.max(1, walk.offsetHeight - window.innerHeight));
    if (snap) window.templeScene.debug.snap(t);
    if (look) window.templeScene.debug.look(look[0], look[1]);
  }, t, snap, look);
  await wait(+(process.env.WAIT || 5000)); // the camera eases toward the target
  const file = `${outdir}/t${t.toFixed(2)}${night === '1' ? '_night' : ''}${vw < vh ? '_portrait' : ''}.png`;
  await page.screenshot({ path: file });
  console.log('shot', file);
}
if (logs.length) console.log(logs.join('\n'));
await browser.close();
