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

export function buildNature(mats) {
  const root = new THREE.Group();
  const rnd = seeded(42);

  // Palms: lining the approach and around the courtyard walls
  const palmSpots = [
    [-4.5, 70], [4.8, 74], [-5.5, 58], [6, 62], [-4.2, 48], [5, 46],
    [-16, 36], [16, 34], [-17, 22], [17, 18], [-16, 6], [16, 2], [-15, -10], [15, -12],
    [-24, 44], [24, 40], [-28, 30], [28, 22], [-26, 6], [26, -4], [-22, -22], [22, -20], [0, -26], [-10, -24], [10, -26],
    [12, 84], [-13, 86], [10, 92], [-14, 96],
  ];
  for (const [x, z] of palmSpots) {
    const p = palm(mats, 7 + rnd() * 4, rnd);
    p.position.set(x + (rnd() - 0.5), 0, z + (rnd() - 0.5));
    p.rotation.y = rnd() * Math.PI * 2;
    root.add(p);
  }

  // Banana clumps by the pond and courtyard corners
  const bananaSpots = [[-18, 64], [-15, 60], [-21, 58], [-9, 78], [8, 80], [-18, 38], [18, 36], [-18, -14], [18, -14], [-9, 88], [7, 56]];
  for (const [x, z] of bananaSpots) {
    for (let i = 0; i < 3; i++) {
      const b = banana(mats, rnd);
      b.position.set(x + (rnd() - 0.5) * 2, 0, z + (rnd() - 0.5) * 2);
      b.rotation.y = rnd() * Math.PI * 2;
      b.scale.setScalar(0.8 + rnd() * 0.5);
      root.add(b);
    }
  }

  // Pond (pukur) with ghat steps on the left of the approach
  {
    const pond = new THREE.Group();
    pond.position.set(-24, 0, 62);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(20, 16), mats.water);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.03;
    pond.add(water);
    const rim = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), mats.brick);
      m.position.set(x, 0.15, z);
      m.receiveShadow = true;
      pond.add(m);
    };
    rim(21, 0.6, 0, 8.3); rim(21, 0.6, 0, -8.3); rim(0.6, 16, -10.3, 0);
    // ghat steps on the path side
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 8), mats.brick);
      s.position.set(10.3 + i * 0.8, 0.15 + i * 0.3, 0);
      s.receiveShadow = true;
      s.castShadow = true;
      pond.add(s);
    }
    root.add(pond);
  }

  // Fireflies
  const count = 260;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (rnd() - 0.5) * 44;
    positions[i * 3 + 1] = 0.5 + rnd() * 5;
    positions[i * 3 + 2] = -14 + rnd() * 100;
    seeds[i] = rnd() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.16, map: glowTexture(), color: 0xffd47a, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const fireflies = new THREE.Points(geo, mat);
  root.add(fireflies);

  const base = positions.slice();
  function update(t) {
    const p = fireflies.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      p[i * 3] = base[i * 3] + Math.sin(t * 0.4 + s) * 0.8;
      p[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.7 + s * 1.3) * 0.4;
      p[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.3 + s * 0.7) * 0.8;
    }
    fireflies.geometry.attributes.position.needsUpdate = true;
    mat.opacity = 0.5 + Math.sin(t * 2) * 0.2;
  }

  return { group: root, update };
}
