// Walk the whole path headlessly and report, at every PATH node, what a frame costs: draw
// calls, triangles, and the number of compiled shader programs — which must not change while
// walking (a change means a light was toggled and every lit shader recompiled: a stall).
// Frame times in software GL mean nothing; the counts do.
//
//   node scripts/profile.mjs [url] [night 0|1] [step in nodes]
//
// Needs what scripts/shoot.mjs needs (puppeteer-core + a Chromium).
import puppeteer from 'puppeteer-core';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [url = 'http://localhost:5173/#debug', night = '0', stepArg = '1'] = process.argv.slice(2);
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = join(process.env.HOME, '.cache/ms-playwright');
  if (existsSync(cache)) {
    const dir = readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().pop();
    if (dir) return join(cache, dir, 'chrome-linux64/chrome');
  }
  throw new Error('set CHROME=/path/to/chrome (or install Playwright chromium)');
}
const browser = await puppeteer.launch({
  executablePath: findChrome(), headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: +(process.env.VW || 1280), height: +(process.env.VH || 720), deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.evaluateOnNewDocument((n) => { try { localStorage.setItem('temple-night', n); } catch (_) { /* ignore */ } }, night === '1' ? '1' : '0');
await page.goto(url.includes('#debug') ? url : `${url}#debug`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => document.getElementById('veil').classList.contains('is-ready'), { timeout: 180000 });
await page.evaluate(() => { const b = document.getElementById('enter'); if (b && !b.hidden) b.click(); });   // the Enter tap lifts the veil
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(1000);
const nodes = await page.evaluate(() => window.templeScene.debug.nodes), step = +stepArg;   // the last PATH node's index
console.log('node  progress  calls   ktris  programs  stage');
let lastPrograms = -1;
for (let i = 0; i <= nodes; i += step) {
  const t = i / nodes;
  const r = await page.evaluate(async (t) => {
    window.templeWalk.set(t);
    const api = window.templeScene;
    // let the camera converge (no easing in the count that matters, but the stage does)
    for (let k = 0; k < 400 && Math.abs(api.progress - t) > 0.002; k++) await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    return { p: api.progress, calls: api.debug.calls, tris: api.debug.triangles, programs: api.debug.programs, stage: api.stage.name };
  }, t);
  const flag = lastPrograms >= 0 && r.programs !== lastPrograms ? '  ← programs changed' : '';
  lastPrograms = r.programs;
  console.log(`${String(i).padStart(4)}  ${r.p.toFixed(3)}     ${String(r.calls).padStart(4)}  ${String((r.tris / 1000).toFixed(0)).padStart(6)}  ${String(r.programs).padStart(8)}  ${r.stage}${flag}`);
}
await browser.close();
