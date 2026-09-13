import * as THREE from 'three';

// Procedural textures — no image assets needed.

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function rand(seed) {
  // small deterministic PRNG so textures look the same every load
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 1m × 1m of terracotta brick. */
export function brickTexture({ size = 512, cols = 5, rows = 12, seed = 7, base = [170, 92, 62] } = {}) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const r = rand(seed);
  g.fillStyle = 'rgb(112, 74, 56)'; // mortar
  g.fillRect(0, 0, size, size);
  const bw = size / cols;
  const bh = size / rows;
  const gap = Math.max(1.5, size * 0.006);
  for (let y = 0; y < rows; y++) {
    const offset = (y % 2) * bw * 0.5;
    for (let x = -1; x <= cols; x++) {
      const v = (r() - 0.5) * 34;
      const rr = Math.round(base[0] + v), gg = Math.round(base[1] + v * 0.6), bb = Math.round(base[2] + v * 0.4);
      g.fillStyle = `rgb(${rr},${gg},${bb})`;
      const px = x * bw + offset + gap / 2, py = y * bh + gap / 2;
      g.fillRect(px, py, bw - gap, bh - gap);
      // subtle weathering
      g.fillStyle = `rgba(30,12,8,${0.05 + r() * 0.12})`;
      g.fillRect(px, py + (bh - gap) * 0.7, bw - gap, (bh - gap) * 0.3);
      g.fillStyle = `rgba(255,220,180,${r() * 0.07})`;
      g.fillRect(px, py, bw - gap, (bh - gap) * 0.25);
    }
  }
  // grime
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(20,8,4,${r() * 0.08})`;
    g.beginPath();
    g.arc(r() * size, r() * size, r() * 12, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function rosette(g, cx, cy, rad, petals, fill, shade) {
  g.save();
  g.translate(cx, cy);
  for (let i = 0; i < petals; i++) {
    g.rotate((Math.PI * 2) / petals);
    g.fillStyle = fill;
    g.beginPath();
    g.ellipse(rad * 0.55, 0, rad * 0.5, rad * 0.22, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = shade;
    g.beginPath();
    g.ellipse(rad * 0.55, rad * 0.06, rad * 0.45, rad * 0.1, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = shade;
  g.beginPath();
  g.arc(0, 0, rad * 0.22, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function diamond(g, cx, cy, s, fill, shade) {
  g.fillStyle = shade;
  g.beginPath();
  g.moveTo(cx, cy - s);
  g.lineTo(cx + s, cy);
  g.lineTo(cx, cy + s);
  g.lineTo(cx - s, cy);
  g.closePath();
  g.fill();
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(cx, cy - s * 0.7);
  g.lineTo(cx + s * 0.7, cy);
  g.lineTo(cx, cy + s * 0.7);
  g.lineTo(cx - s * 0.7, cy);
  g.closePath();
  g.fill();
  g.fillStyle = shade;
  g.beginPath();
  g.arc(cx, cy, s * 0.22, 0, Math.PI * 2);
  g.fill();
}

/** 2m × 2m of terracotta relief panels (4 × 4 panels). */
export function panelTexture({ size = 1024, seed = 3 } = {}) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const r = rand(seed);
  // draw brick underneath
  const brick = brickTexture({ size: 512, cols: 5, rows: 12, seed: seed + 11 });
  g.drawImage(brick.image, 0, 0, size / 2, size / 2);
  g.drawImage(brick.image, size / 2, 0, size / 2, size / 2);
  g.drawImage(brick.image, 0, size / 2, size / 2, size / 2);
  g.drawImage(brick.image, size / 2, size / 2, size / 2, size / 2);

  const n = 4;
  const cell = size / n;
  const fill = 'rgb(172, 96, 66)';
  const shade = 'rgb(128, 66, 44)';
  const light = 'rgb(198, 124, 92)';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const px = x * cell, py = y * cell;
      const inset = cell * 0.09;
      // frame
      g.fillStyle = shade;
      g.fillRect(px + inset, py + inset, cell - inset * 2, cell - inset * 2);
      g.fillStyle = fill;
      g.fillRect(px + inset * 1.35, py + inset * 1.35, cell - inset * 2.7, cell - inset * 2.7);
      g.fillStyle = light;
      g.fillRect(px + inset * 1.35, py + inset * 1.35, cell - inset * 2.7, inset * 0.35);
      const cx = px + cell / 2, cy = py + cell / 2;
      const kind = (x + y * 3 + Math.floor(r() * 2)) % 3;
      if (kind === 0) rosette(g, cx, cy, cell * 0.34, 8, light, shade);
      else if (kind === 1) diamond(g, cx, cy, cell * 0.3, light, shade);
      else {
        // small lotus + two side buds
        rosette(g, cx, cy, cell * 0.24, 6, light, shade);
        rosette(g, cx - cell * 0.3, cy + cell * 0.18, cell * 0.11, 5, light, shade);
        rosette(g, cx + cell * 0.3, cy + cell * 0.18, cell * 0.11, 5, light, shade);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 1m × 1m of brick paving (flat, darker). */
export function pavingTexture({ size = 512, seed = 21 } = {}) {
  const t = brickTexture({ size, cols: 6, rows: 6, seed, base: [158, 96, 72] });
  return t;
}

/** Sandy earth with subtle noise. */
export function earthTexture({ size = 512, seed = 5 } = {}) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const r = rand(seed);
  g.fillStyle = 'rgb(138, 108, 74)';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 6000; i++) {
    const v = r();
    g.fillStyle = v > 0.5 ? `rgba(150,120,80,${r() * 0.25})` : `rgba(70,50,32,${r() * 0.25})`;
    g.beginPath();
    g.arc(r() * size, r() * size, 1 + r() * 4, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft radial sprite for fireflies / lamp glows. */
export function glowTexture(size = 64) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Shared material set. */
export function createMaterials() {
  const brick = brickTexture();
  const panel = panelTexture();
  const paving = pavingTexture();
  const earth = earthTexture();
  paving.repeat.set(1, 1);
  earth.repeat.set(1, 1);

  const brickColumn = brick.clone();
  brickColumn.repeat.set(2.5, 3.5);
  brickColumn.needsUpdate = true;

  const mats = {
    brick: new THREE.MeshStandardMaterial({ map: brick, roughness: 0.92, metalness: 0 }),
    brickColumn: new THREE.MeshStandardMaterial({ map: brickColumn, roughness: 0.92, metalness: 0 }),
    brickDark: new THREE.MeshStandardMaterial({ map: brickColumn, color: 0xc9a996, roughness: 0.95 }),
    panel: new THREE.MeshStandardMaterial({ map: panel, roughness: 0.9 }),
    paving: new THREE.MeshStandardMaterial({ map: paving, roughness: 0.95 }),
    earth: new THREE.MeshStandardMaterial({ map: earth, roughness: 1 }),
    plaster: new THREE.MeshStandardMaterial({ color: 0xc98a68, roughness: 0.9 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x6f5d52, roughness: 0.85 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x8c3b25, roughness: 0.85 }),
    roofEdge: new THREE.MeshStandardMaterial({ color: 0x5e3222, roughness: 0.85 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4630, roughness: 0.8 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd4a24c, roughness: 0.35, metalness: 0.8 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8863a, roughness: 0.4, metalness: 0.7 }),
    marigold: new THREE.MeshStandardMaterial({ color: 0xf28c1c, roughness: 0.9 }),
    marigoldY: new THREE.MeshStandardMaterial({ color: 0xf5c02a, roughness: 0.9 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x3f6b2a, emissive: 0x16300e, emissiveIntensity: 0.7, roughness: 0.9, side: THREE.DoubleSide }),
    leafLight: new THREE.MeshStandardMaterial({ color: 0x5b8a34, emissive: 0x1d3a12, emissiveIntensity: 0.7, roughness: 0.9, side: THREE.DoubleSide }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.95 }),
    water: new THREE.MeshStandardMaterial({ color: 0x3f6b66, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffd27a }),
    clay: new THREE.MeshStandardMaterial({ color: 0xa5582f, roughness: 0.95 }),
    red: new THREE.MeshStandardMaterial({ color: 0x7a1e1c, roughness: 0.85 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf1e6d2, roughness: 0.9 }),
  };
  return mats;
}
