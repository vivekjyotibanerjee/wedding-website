// Generated ornament shared by the 3D scene and the cards: an alpona (the Bengali rice-paste
// floor painting — white lotus rosettes, dotted rings and paisley vines) drawn on a canvas, and a
// mango-leaf vine as SVG. Both are seeded so every visit draws the same pattern.

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * Draw an alpona rosette into a square canvas. `ink` is the paste colour; the background stays
 * transparent so the same drawing works as a ground decal and over the cards.
 */
export function alponaCanvas(size = 1024, { ink = 'rgba(255, 250, 238, 1)', seed = 3, rings = 4, ground = false } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const R = size / 2;
  const rnd = seeded(seed);
  g.translate(R, R);
  if (ground) {
    // the floor washed with geru (red earth) before the paste goes on; soft, uneven edge
    const gr = g.createRadialGradient(0, 0, R * 0.7, 0, 0, R);
    gr.addColorStop(0, 'rgba(146, 58, 34, 0.92)');
    gr.addColorStop(0.9, 'rgba(146, 58, 34, 0.88)');
    gr.addColorStop(1, 'rgba(146, 58, 34, 0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const wob = (a, k = 0.012) => a * (1 + (rnd() - 0.5) * k); // a hand-drawn tremor

  const petal = (r0, r1, w, a, fill) => {
    // one lotus petal: a lens from radius r0 to r1, `w` radians wide, pointing outward at angle a
    g.save();
    g.rotate(a);
    g.beginPath();
    g.moveTo(r0, 0);
    g.quadraticCurveTo(wob((r0 + r1) / 2), wob(-w * (r0 + r1) / 2), r1, 0);
    g.quadraticCurveTo(wob((r0 + r1) / 2), wob(w * (r0 + r1) / 2), r0, 0);
    g.closePath();
    if (fill) g.fill(); else g.stroke();
    // a vein down the middle
    g.beginPath();
    g.moveTo(r0 + (r1 - r0) * 0.12, 0);
    g.lineTo(r1 - (r1 - r0) * 0.18, 0);
    g.stroke();
    g.restore();
  };
  const dots = (r, n, rad) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.beginPath();
      g.arc(wob(r) * Math.cos(a), wob(r) * Math.sin(a), rad, 0, Math.PI * 2);
      g.fill();
    }
  };
  const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  const paisley = (r, a, s) => {
    // a teardrop curl with an inner curl, the vine motif between the outer petals
    g.save();
    g.rotate(a);
    g.translate(r, 0);
    g.lineWidth = s * 0.06;
    g.beginPath();
    g.moveTo(0, -s * 0.5);
    g.bezierCurveTo(s * 0.7, -s * 0.5, s * 0.75, s * 0.35, s * 0.1, s * 0.55);
    g.bezierCurveTo(-s * 0.4, s * 0.6, -s * 0.45, -s * 0.1, 0, -s * 0.5);
    g.stroke();
    g.beginPath();
    g.moveTo(s * 0.08, -s * 0.15);
    g.bezierCurveTo(s * 0.4, -s * 0.2, s * 0.4, s * 0.25, s * 0.08, s * 0.25);
    g.stroke();
    g.beginPath();
    g.arc(s * 0.02, s * 0.03, s * 0.05, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };

  // centre: a small filled lotus
  g.lineWidth = size * 0.005;
  for (let i = 0; i < 8; i++) petal(R * 0.03, R * 0.16, 0.55, (i / 8) * Math.PI * 2, true);
  g.beginPath(); g.arc(0, 0, R * 0.035, 0, Math.PI * 2); g.fill();
  ring(R * 0.2, size * 0.004);
  dots(R * 0.245, 24, size * 0.006);
  // middle band: open petals with paisleys between
  g.lineWidth = size * 0.0045;
  for (let i = 0; i < 12; i++) petal(R * 0.29, R * 0.52, 0.42, (i / 12) * Math.PI * 2, false);
  for (let i = 0; i < 12; i++) paisley(R * 0.42, ((i + 0.5) / 12) * Math.PI * 2, R * 0.115);
  ring(R * 0.56, size * 0.004);
  dots(R * 0.6, 40, size * 0.005);
  if (rings >= 4) {
    // outer band: large lotus petals, a scalloped edge and a final dotted ring
    g.lineWidth = size * 0.005;
    for (let i = 0; i < 16; i++) petal(R * 0.64, R * 0.9, 0.36, (i / 16) * Math.PI * 2, false);
    for (let i = 0; i < 16; i++) petal(R * 0.66, R * 0.78, 0.16, ((i + 0.5) / 16) * Math.PI * 2, true);
    g.lineWidth = size * 0.004;
    g.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const r = R * (0.925 + 0.02 * Math.cos(a * 32));
      if (i === 0) g.moveTo(r * Math.cos(a), r * Math.sin(a)); else g.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    g.closePath();
    g.stroke();
    dots(R * 0.975, 56, size * 0.006);
  }
  return c;
}

/**
 * A corner motif for the card frames: a quarter of a lotus fan with a dotted arc, drawn in the
 * top-left corner of a square canvas; rotate it with CSS for the other corners.
 */
export function alponaCornerCanvas(size = 160, { ink = 'rgba(255, 250, 238, 0.92)' } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.014;
  const n = 5;
  const span = (lo, hi, t) => lo + (hi - lo) * t;           // keep the fan clear of the canvas edges
  for (let i = 0; i < n; i++) {
    const a = span(0.14, Math.PI / 2 - 0.14, i / (n - 1));
    const r0 = size * 0.18, r1 = size * 0.62;
    g.save();
    g.rotate(a);
    g.beginPath();
    g.moveTo(r0, 0);
    g.quadraticCurveTo((r0 + r1) / 2, -size * 0.07, r1, 0);
    g.quadraticCurveTo((r0 + r1) / 2, size * 0.07, r0, 0);
    g.closePath();
    g.stroke();
    g.beginPath(); g.moveTo(r0 + size * 0.05, 0); g.lineTo(r1 - size * 0.08, 0); g.stroke();
    g.restore();
  }
  g.beginPath(); g.arc(0, 0, size * 0.1, 0.1, Math.PI / 2 - 0.1); g.stroke();
  for (let i = 0; i <= 8; i++) {
    const a = span(0.1, Math.PI / 2 - 0.1, i / 8);
    g.beginPath(); g.arc(size * 0.72 * Math.cos(a), size * 0.72 * Math.sin(a), size * 0.016, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < n - 1; i++) {
    const a = span(0.14, Math.PI / 2 - 0.14, (i + 0.5) / (n - 1));
    g.beginPath(); g.arc(size * 0.5 * Math.cos(a), size * 0.5 * Math.sin(a), size * 0.018, 0, Math.PI * 2); g.fill();
  }
  return c;
}

/**
 * A mango-leaf vine as an SVG string, `w × h` px, growing from the left along a drooping curve —
 * laid over the top edge of a card so the greenery of the courtyard spills onto the page.
 */
export function vineSVG(w = 420, h = 110, seed = 11) {
  const rnd = seeded(seed);
  const parts = [];
  const leaf = (x, y, len, ang, tone) => {
    const wd = len * 0.32;
    const c1 = `${len * 0.35} ${-wd}`, c2 = `${len * 0.75} ${-wd * 0.7}`;
    const c3 = `${len * 0.75} ${wd * 0.7}`, c4 = `${len * 0.35} ${wd}`;
    parts.push(`<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${ang.toFixed(1)})">` +
      `<path d="M0 0 C${c1} ${c2} ${len} 0 C${c3} ${c4} 0 0Z" fill="${tone}"/>` +
      `<path d="M${len * 0.08} 0 L${len * 0.9} 0" stroke="rgba(230,240,190,0.55)" stroke-width="${(len * 0.035).toFixed(2)}" stroke-linecap="round"/></g>`);
  };
  // the stem: a cubic from the top-left, sagging, with a curl at the end
  const x0 = -8, y0 = 6, x1 = w * 0.92, y1 = 18 + rnd() * 10;
  const cx1 = w * 0.3, cy1 = 44 + rnd() * 20, cx2 = w * 0.65, cy2 = 2 + rnd() * 14;
  const pt = (t) => {
    const u = 1 - t;
    return [u * u * u * x0 + 3 * u * u * t * cx1 + 3 * u * t * t * cx2 + t * t * t * x1,
            u * u * u * y0 + 3 * u * u * t * cy1 + 3 * u * t * t * cy2 + t * t * t * y1];
  };
  parts.push(`<path d="M${x0} ${y0} C${cx1} ${cy1} ${cx2} ${cy2} ${x1} ${y1}" fill="none" stroke="#4a5a26" stroke-width="2.4" stroke-linecap="round"/>`);
  const greens = ['#2f5a1f', '#3f7228', '#4c8a2f', '#2a4d1c', '#5c9a3a'];
  const n = 16 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const t = 0.03 + (i / n) * 0.95;
    const [x, y] = pt(t);
    const [xa, ya] = pt(Math.min(1, t + 0.02));
    const tangent = Math.atan2(ya - y, xa - x) * 180 / Math.PI;
    const side = i % 2 ? 1 : -1;
    const ang = tangent + side * (48 + rnd() * 30) + (side > 0 ? 8 : -8);
    const len = 30 + rnd() * 26;
    leaf(x, y, len, ang, greens[Math.floor(rnd() * greens.length)]);
    if (rnd() < 0.28) {
      // a marigold bud on a short stalk
      const bx = x + Math.cos((ang + 40) * Math.PI / 180) * 10, by = y + Math.sin((ang + 40) * Math.PI / 180) * 10;
      parts.push(`<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${(3 + rnd() * 2).toFixed(1)}" fill="#e9a12c"/>` +
                 `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${(1.4 + rnd()).toFixed(1)}" fill="#c9661b"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${parts.join('')}</svg>`;
}
