import * as THREE from 'three';
import { glowTexture } from './materials.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Coconut palm: leaning trunk + fan of curved fronds. */
function palm(mats, h, rnd) {
  const g = new THREE.Group();
  const segs = 6;
  const lean = (rnd() - 0.5) * 0.35;
  const dir = rnd() * Math.PI * 2;
  let x = 0, z = 0;
  for (let i = 0; i < segs; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - i * 0.012, 0.19 - i * 0.012, h / segs + 0.05, 7), mats.trunk);
    const y = (i + 0.5) * (h / segs);
    x = Math.sin(lean) * y * Math.cos(dir) * 0.6;
    z = Math.sin(lean) * y * Math.sin(dir) * 0.6;
    seg.position.set(x, y, z);
    seg.rotation.z = -lean * Math.cos(dir) * 0.6;
    seg.rotation.x = lean * Math.sin(dir) * 0.6;
    seg.castShadow = true;
    g.add(seg);
  }
  const crown = new THREE.Group();
  crown.position.set(x, h, z);
  const n = 8 + Math.floor(rnd() * 3);
  const frondGeo = new THREE.PlaneGeometry(0.7, 3.2, 1, 6);
  // bend the frond downward along its length
  const pos = frondGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + 1.6) / 3.2;
    pos.setZ(i, -Math.pow(t, 2) * 1.4);
    pos.setX(i, pos.getX(i) * (1 - t * 0.6));
  }
  frondGeo.computeVertexNormals();
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(frondGeo, i % 2 ? mats.leaf : mats.leafLight);
    f.rotation.order = 'YXZ';
    f.rotation.y = (i / n) * Math.PI * 2 + rnd() * 0.3;
    f.rotation.x = -Math.PI / 2 + 0.55 + rnd() * 0.25;
    f.position.y = 0.1;
    f.translateY(1.5);
    f.castShadow = true;
    crown.add(f);
  }
  const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), mats.trunk);
  nuts.position.y = -0.1;
  crown.add(nuts);
  g.add(crown);
  return g;
}

/** Banana plant: short trunk + big upward leaves. */
function banana(mats, rnd) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 2.2, 8), mats.leafLight);
  trunk.position.y = 1.1;
  trunk.castShadow = true;
  g.add(trunk);
  const leafGeo = new THREE.PlaneGeometry(0.9, 2.6, 1, 5);
  const pos = leafGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + 1.3) / 2.6;
    pos.setZ(i, Math.sin(t * Math.PI) * 0.5);
    pos.setX(i, pos.getX(i) * Math.sin(t * Math.PI * 0.9 + 0.1));
  }
  leafGeo.computeVertexNormals();
  const n = 6;
  for (let i = 0; i < n; i++) {
    const l = new THREE.Mesh(leafGeo, i % 2 ? mats.leaf : mats.leafLight);
    l.rotation.order = 'YXZ';
    l.rotation.y = (i / n) * Math.PI * 2 + rnd() * 0.5;
    l.rotation.x = -0.9 - rnd() * 0.4;
    l.position.y = 2.1;
    l.translateY(1.1);
    l.castShadow = true;
    g.add(l);
  }
  return g;
}

/** Broadleaf tree: trunk + a clump of spheres. */
function broadleaf(mats, h, rnd) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, h, 8), mats.trunk);
  trunk.position.y = h / 2;
  trunk.castShadow = true;
  g.add(trunk);
  const n = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const r = 1.6 + rnd() * 1.6;
    const c = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), i % 2 ? mats.foliage : mats.foliageDark);
    c.position.set((rnd() - 0.5) * 3.2, h + (rnd() - 0.3) * 2.2, (rnd() - 0.5) * 3.2);
    c.castShadow = true;
    g.add(c);
  }
  return g;
}

export function buildNature(mats) {
  const root = new THREE.Group();
  const rnd = seeded(42);

  // Palms along the approach and river bank
  const palmSpots = [
    [-13, 98], [13, 96], [-14, 88], [14, 86], [-13, 76], [14, 74], [-13, 68], [13, 66],
    [-23, 58], [-23, 44], [-23, 14], [-23, 2], [-23, -10], [-23, -22],
    [-20, 70], [-16, 72], [20, 70], [16, 72],
    [24, 58], [26, 46], [24, 34], [26, 22], [24, 8], [26, -6], [24, -18],
    [-28, 62], [-30, 50], [-30, 36], [-29, 20], [-30, 8], [-29, -8],
    [-8, -30], [8, -30], [-18, -28], [18, -28],
  ];
  for (const [x, z] of palmSpots) {
    const p = palm(mats, 8 + rnd() * 5, rnd);
    p.position.set(x + (rnd() - 0.5), 0, z + (rnd() - 0.5));
    p.rotation.y = rnd() * Math.PI * 2;
    root.add(p);
  }

  // Broadleaf trees: outside the walls, and a thick line on the far bank
  const treeSpots = [[-20, 104], [22, 104], [-26, 90], [28, 84], [-30, 74], [30, 66], [30, 40], [30, 16], [30, -8], [-14, -38], [10, -40], [26, -34]];
  for (const [x, z] of treeSpots) {
    const t = broadleaf(mats, 5 + rnd() * 3, rnd);
    t.position.set(x, 0, z);
    root.add(t);
  }
  for (let z = -80; z <= 140; z += 7) {
    const t = broadleaf(mats, 6 + rnd() * 5, rnd);
    t.position.set(-120 + (rnd() - 0.5) * 10, -0.5, z);
    t.scale.setScalar(1.6);
    root.add(t);
  }

  // Banana clumps by the mandap posts (a Bengali wedding tradition) and near the ghat
  const bananaSpots = [[-3.8, 11.8], [3.8, 11.8], [-3.8, 4.2], [-21, 32], [-21, 25], [-12, 100], [12, 100]];
  for (const [x, z] of bananaSpots) {
    for (let i = 0; i < 2; i++) {
      const b = banana(mats, rnd);
      b.position.set(x + (rnd() - 0.5) * 0.8, 0, z + (rnd() - 0.5) * 0.8);
      b.rotation.y = rnd() * Math.PI * 2;
      b.scale.setScalar(0.75 + rnd() * 0.35);
      root.add(b);
    }
  }

  // Fireflies (night only)
  const count = 220;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (rnd() - 0.5) * 44;
    positions[i * 3 + 1] = 0.5 + rnd() * 5;
    positions[i * 3 + 2] = -20 + rnd() * 110;
    seeds[i] = rnd() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.16, map: glowTexture(), color: 0xffd47a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const fireflies = new THREE.Points(geo, mat);
  root.add(fireflies);

  const base = positions.slice();
  function update(t, night) {
    fireflies.visible = night > 0.02;
    if (!fireflies.visible) return;
    const p = fireflies.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      p[i * 3] = base[i * 3] + Math.sin(t * 0.4 + s) * 0.8;
      p[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.7 + s * 1.3) * 0.4;
      p[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.3 + s * 0.7) * 0.8;
    }
    fireflies.geometry.attributes.position.needsUpdate = true;
    mat.opacity = (0.5 + Math.sin(t * 2) * 0.2) * night;
  }

  return { group: root, update };
}
