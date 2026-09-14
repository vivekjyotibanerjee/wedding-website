// The soundtrack and the bells.
// Vite resolves every audio file in ../music at build time and gives us its URL; the Sound
// button plays them in alphabetical order (one file loops). The only synthesized sound is the
// temple bell, struck as the walk crosses a hall's threshold under it (life.js → onBell).
const TRACKS = Object.entries(import.meta.glob('../music/*.{mp3,m4a,ogg,wav,MP3,M4A}', { eager: true, query: '?url', import: 'default' }))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

export function createSound() {
  let audio = null;
  let index = 0;
  let enabled = false;
  let ctx = null;
  let verb = null;   // the bells' feedback-delay "reverb", feeding the destination

  function ensure() {
    if (audio) return;
    audio = new Audio();
    audio.preload = 'auto';
    audio.volume = 0.8;
    if (TRACKS.length === 1) audio.loop = true;
    else audio.addEventListener('ended', () => { index = (index + 1) % TRACKS.length; audio.src = TRACKS[index]; audio.play().catch(() => {}); });
    if (TRACKS.length) audio.src = TRACKS[index];

    // the bell's context, made in the same gesture as audio.play() for the autoplay policy
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    verb = ctx.createGain();
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.23;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const verbLp = ctx.createBiquadFilter();
    verbLp.type = 'lowpass';
    verbLp.frequency.value = 2400;
    verb.connect(delay).connect(verbLp).connect(fb).connect(delay);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.35;
    verbLp.connect(verbOut).connect(ctx.destination);
    verb.connect(ctx.destination);
  }

  // one strike: five inharmonic partials, the higher ones dying first. `strength` is the level
  // over the music (the track plays at 0.8).
  function bell(strength = 1) {
    if (!ctx || !verb) return;
    const now = ctx.currentTime;
    const base = 520 + Math.random() * 180;
    const partials = [[1, 1], [2.0, 0.55], [2.76, 0.35], [3.6, 0.22], [5.4, 0.12]];
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(0.4 * strength, now + 0.012);
    out.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);
    partials.forEach(([ratio, amp]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(amp, now);
      g.gain.exponentialRampToValueAtTime(amp * 0.001, now + 3.5 / Math.sqrt(ratio));
      o.connect(g).connect(out);
      o.start(now);
      o.stop(now + 5);
    });
    out.connect(verb);
  }

  return {
    get enabled() { return enabled; },
    async toggle() {
      ensure();
      if (!enabled) {
        if (ctx) await ctx.resume();
        if (TRACKS.length) { try { await audio.play(); } catch (e) { /* blocked: the bells still ring */ } }
        enabled = true;
      } else {
        audio.pause();
        if (ctx) await ctx.suspend();
        enabled = false;
      }
      return enabled;
    },
    setDepth() { /* the soundtrack doesn't react to depth */ },
    /** One strike of the temple bell — the scene calls this as the guest crosses a hall's threshold. */
    ring() { if (enabled) bell(1.0); },
    async suspend() { if (!enabled) return; audio.pause(); if (ctx) await ctx.suspend(); },
    async resume() { if (!enabled) return; audio.play().catch(() => {}); if (ctx) await ctx.resume(); },
  };
}
