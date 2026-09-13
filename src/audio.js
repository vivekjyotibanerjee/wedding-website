// Synthesized temple ambience — no audio files.
// drone (tanpura-ish) + wind + birds outside + temple bells + conch as you go deeper.

export function createAmbience() {
  let ctx = null;
  let master = null;
  let nodes = null;
  let timers = [];
  let depth = 0; // 0 = outside, 1 = inside the sanctum
  let enabled = false;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // ── Drone: two detuned saws through a soft lowpass with a slow wobble
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.09;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    lp.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
    const root = 65.41; // C2
    [[root, -4], [root * 1.5, 3], [root * 2, 6], [root * 3, -2]].forEach(([f, det]) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = f > 150 ? 0.35 : 0.6;
      o.connect(g).connect(lp);
      o.start();
    });
    lp.connect(droneGain).connect(master);

    // ── Wind: filtered noise with slow swells
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < data.length; i++) {
      // pink-ish noise
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + 0.029591 * w; b1 = 0.985 * b1 + 0.032534 * w; b2 = 0.95 * b2 + 0.048056 * w;
      data[i] = (b0 + b1 + b2 + w * 0.05) * 0.4;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.5;
    const windLfo = ctx.createOscillator();
    windLfo.frequency.value = 0.05;
    const windLfoGain = ctx.createGain();
    windLfoGain.gain.value = 220;
    windLfo.connect(windLfoGain).connect(windFilter.frequency);
    windLfo.start();
    const windGain = ctx.createGain();
    windGain.gain.value = 0.16;
    noise.connect(windFilter).connect(windGain).connect(master);
    noise.start();

    // ── Reverb-ish: simple feedback delay for the bells
    const verb = ctx.createGain();
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
    verbLp.connect(verbOut).connect(master);
    verb.connect(master);

    nodes = { droneGain, windGain, verb };
  }

  function bell(strength = 1) {
    if (!ctx || !nodes) return;
    const now = ctx.currentTime;
    const base = 520 + Math.random() * 180;
    const partials = [[1, 1], [2.0, 0.55], [2.76, 0.35], [3.6, 0.22], [5.4, 0.12]];
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(0.22 * strength, now + 0.012);
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
    out.connect(nodes.verb);
  }

  function bird() {
    if (!ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const g = ctx.createGain();
    const f0 = 2200 + Math.random() * 1200;
    const chirps = 2 + Math.floor(Math.random() * 3);
    g.gain.setValueAtTime(0.0001, now);
    for (let i = 0; i < chirps; i++) {
      const t = now + i * 0.16;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.5, t + 0.06);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.9, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.03 * (1 - depth), t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    }
    o.connect(g).connect(master);
    o.start(now);
    o.stop(now + chirps * 0.16 + 0.1);
  }

  function conch() {
    if (!ctx || !nodes) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(300, now);
    o.frequency.linearRampToValueAtTime(330, now + 1.2);
    o.frequency.linearRampToValueAtTime(312, now + 3.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.13 * depth, now + 0.5);
    g.gain.setValueAtTime(0.13 * depth, now + 2.4);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 3.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    o.connect(lp).connect(g).connect(nodes.verb);
    o.start(now);
    o.stop(now + 3.8);
  }

  function schedule() {
    clear();
    const loopBell = () => {
      const wait = 5000 + Math.random() * 9000 * (1.2 - depth * 0.7);
      timers.push(setTimeout(() => { bell(0.6 + depth * 0.6); loopBell(); }, wait));
    };
    const loopBird = () => {
      const wait = 2500 + Math.random() * 6000;
      timers.push(setTimeout(() => { if (depth < 0.7) bird(); loopBird(); }, wait));
    };
    const loopConch = () => {
      const wait = 16000 + Math.random() * 20000;
      timers.push(setTimeout(() => { if (depth > 0.5) conch(); loopConch(); }, wait));
    };
    loopBell(); loopBird(); loopConch();
    timers.push(setTimeout(() => bell(0.8), 700));
  }
  function clear() { timers.forEach(clearTimeout); timers = []; }

  function applyDepth() {
    if (!nodes || !ctx) return;
    const t = ctx.currentTime;
    nodes.windGain.gain.setTargetAtTime(0.16 * (1 - depth * 0.8), t, 0.8);
    nodes.droneGain.gain.setTargetAtTime(0.06 + depth * 0.09, t, 0.8);
  }

  return {
    get enabled() { return enabled; },
    async toggle() {
      ensure();
      if (!enabled) {
        await ctx.resume();
        master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.6);
        schedule();
        enabled = true;
      } else {
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
        clear();
        enabled = false;
        setTimeout(() => { if (!enabled && ctx) ctx.suspend(); }, 800);
      }
      return enabled;
    },
    setDepth(d) {
      depth = Math.max(0, Math.min(1, d));
      applyDepth();
    },
    async suspend() { if (ctx && enabled) await ctx.suspend(); },
    async resume() { if (ctx && enabled) await ctx.resume(); },
  };
}
