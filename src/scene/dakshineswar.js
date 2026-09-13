import * as THREE from 'three';
import {
  worldBox, chalaRoof, kalasha, roundArchWall, bowParapet, bulgeRoof, ribbedSpire, onionDome,
  cuspedArchPath, garlandPoints,
} from './geo.js';

// ─────────────────────────────────────────────────────────────────────────────
// Dakshineswar Kali Temple complex, modelled from reference photographs.
// Units are metres. The visitor walks north, i.e. toward −Z.
//
//   z 100 → 64   approach road, flanked by the cream boundary buildings
//   z 62         the lion gate
//   z 60 → −2    courtyard: twelve Shiva temples + ghat on the west (−X),
//                boundary rooms on the east (+X)
//   z 24 → 14    nat-mandir (open pillared hall)
//   z 11 → 5     the wedding mandap
//   z 2 → −3     stairs up to the temple platform
//   z −3 → −25   the navaratna temple (centre z = −14), sanctum inside
// ─────────────────────────────────────────────────────────────────────────────

export const LAYOUT = {
  templeCenter: new THREE.Vector3(0, 0, -14),
  platformH: 2.6,
  natMandirZ: 19,
  natMandirPlinth: 1.0,
  mandapZ: 8,
  gateZ: 62,
  shivaRowX: -16.5,
  riverX: -26,
};

const flameGeo = new THREE.SphereGeometry(0.06, 8, 8);
const diyaGeo = new THREE.LatheGeometry(
  [new THREE.Vector2(0, 0), new THREE.Vector2(0.09, 0), new THREE.Vector2(0.13, 0.05), new THREE.Vector2(0.11, 0.08), new THREE.Vector2(0.07, 0.07), new THREE.Vector2(0, 0.06)],
  12,
);
const marigoldGeo = new THREE.SphereGeometry(0.075, 7, 6);

export function buildComplex(mats) {
  const root = new THREE.Group();
  const flames = [];
  const pointLights = [];
  const spots = [];
  const lampGlass = []; // emissive meshes switched on at night
  const shadow = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const add = (parent, geo, mat, x, y, z, castShadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.castShadow = castShadow;
    parent.add(m);
    return m;
  };

  function diya(parent, x, y, z, scale = 1) {
    const g = new THREE.Group();
    const bowl = new THREE.Mesh(diyaGeo, mats.clay);
    const flame = new THREE.Mesh(flameGeo, mats.flame);
    flame.position.y = 0.11;
    flame.scale.set(0.55, 1.25, 0.55);
    g.add(bowl, flame);
    g.position.set(x, y, z);
    g.scale.setScalar(scale);
    parent.add(g);
    flames.push({ mesh: flame, seed: Math.random() * 100 });
    return g;
  }

  function garland(parent, a, b, sag = 0.5) {
    const pts = garlandPoints(a, b, sag, Math.max(6, Math.round(a.distanceTo(b) * 5)));
    const inst = new THREE.InstancedMesh(marigoldGeo, mats.marigold, pts.length);
    const inst2 = new THREE.InstancedMesh(marigoldGeo, mats.marigoldY, pts.length);
    const m = new THREE.Matrix4();
    let i1 = 0, i2 = 0;
    pts.forEach((p, i) => {
      m.makeTranslation(p.x, p.y, p.z);
      if (i % 3 === 0) inst2.setMatrixAt(i2++, m); else inst.setMatrixAt(i1++, m);
    });
    inst.count = i1; inst2.count = i2;
    inst.castShadow = inst2.castShadow = true;
    parent.add(inst, inst2);
  }

  function pointLight(x, y, z, intensity, distance, color = 0xffb066) {
    const l = new THREE.PointLight(color, 0, distance, 2);
    l.position.set(x, y, z);
    l.userData.night = intensity;
    root.add(l);
    pointLights.push(l);
    return l;
  }

  /** Ornamental lamp post (gold, with a glass lamp that glows at night). */
  function lampPost(x, z, h = 4.2) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    add(g, new THREE.BoxGeometry(0.7, 0.5, 0.7), mats.roseDeep, 0, 0.25, 0);
    add(g, new THREE.CylinderGeometry(0.07, 0.11, h, 8), mats.brass, 0, 0.5 + h / 2, 0);
    add(g, new THREE.SphereGeometry(0.16, 10, 8), mats.brass, 0, h + 0.5, 0);
    const glass = add(g, new THREE.SphereGeometry(0.26, 12, 10), mats.lampGlass, 0, h + 0.85, 0, false);
    glass.scale.y = 1.35;
    lampGlass.push(glass);
    root.add(g);
  }

  function finial(parent, x, y, z, r, h) {
    add(parent, kalasha(r, h), mats.gold, x, y, z);
  }

  // ── Ground ────────────────────────────────────────────────────────────────
  {
    const earthMat = mats.earth.clone();
    earthMat.map = mats.earth.map.clone();
    earthMat.map.repeat.set(200, 200);
    earthMat.map.needsUpdate = true;
    earthMat.color = new THREE.Color(0x8f9a6a); // grassy
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), earthMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    root.add(ground);

    // flagstone road + courtyard
    const stoneMat = mats.flagstone.clone();
    stoneMat.map = mats.flagstone.map.clone();
    stoneMat.map.repeat.set(24, 70);
    stoneMat.map.needsUpdate = true;
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(48, 140), stoneMat);
    yard.rotation.x = -Math.PI / 2;
    yard.position.set(0, 0.01, 36);
    yard.receiveShadow = true;
    root.add(yard);
  }

  // ── Boundary buildings (cream, arcaded, red base band) ────────────────────
  function boundaryBlock(x, z, length, alongX, height = 4.6, depth = 5) {
    const g = new THREE.Group();
    const bays = Math.max(1, Math.floor(length / 3.2));
    const arches = [];
    for (let i = 0; i < bays; i++) arches.push({ x: -length / 2 + (i + 0.5) * (length / bays), w: 1.6, h: 3.0 });
    const front = new THREE.Mesh(roundArchWall(length, height, 0.5, arches), mats.cream);
    shadow(front);
    g.add(front);
    // dark interior behind the arches
    add(g, worldBox(length, height, depth - 0.5), mats.roofEdge, 0, height / 2, -0.5 - (depth - 0.5) / 2, false);
    add(g, worldBox(length + 0.4, 0.5, depth + 0.4), mats.roseDeep, 0, height + 0.25, -depth / 2);
    add(g, worldBox(length + 0.4, 0.35, 0.3), mats.rose, 0, 0.175, 0.15);
    add(g, worldBox(length + 0.6, 0.25, depth + 0.6), mats.creamPlain, 0, height + 0.62, -depth / 2);
    g.position.set(x, 0, z);
    if (!alongX) g.rotation.y = Math.PI / 2; // face +x → rotate so front faces −x... handled by caller
    root.add(g);
    return g;
  }
  // approach road flanks (front faces the road)
  const westRoad = boundaryBlock(0, 0, 36, true); westRoad.position.set(-15, 0, 82); westRoad.rotation.y = Math.PI / 2;  // faces +x
  const eastRoad = boundaryBlock(0, 0, 36, true); eastRoad.position.set(15, 0, 82); eastRoad.rotation.y = -Math.PI / 2; // faces −x
  // courtyard east side
  const eastYard = boundaryBlock(0, 0, 84, true); eastYard.position.set(22, 0, 20); eastYard.rotation.y = -Math.PI / 2;
  // courtyard south wall either side of the gate
  const southW = boundaryBlock(0, 0, 14, true); southW.position.set(-15, 0, 64); southW.rotation.y = Math.PI; // faces −z (into yard)
  const southE = boundaryBlock(0, 0, 14, true); southE.position.set(15, 0, 64); southE.rotation.y = Math.PI;
  // north wall behind the temple
  const northW = boundaryBlock(0, 0, 46, true); northW.position.set(0, 0, -34);

  // ── Lion gate ─────────────────────────────────────────────────────────────
  {
    const gate = new THREE.Group();
    gate.position.z = LAYOUT.gateZ;
    const wall = new THREE.Mesh(roundArchWall(18, 6.2, 1.6, [
      { x: 0, w: 5.2, h: 6.0 }, { x: -6.6, w: 2.6, h: 4.2 }, { x: 6.6, w: 2.6, h: 4.2 },
    ]), mats.cream);
    wall.position.set(0, 0, 0.8);
    shadow(wall);
    gate.add(wall);
    // central block rises higher
    add(gate, worldBox(9.6, 2.6, 1.9), mats.cream, 0, 7.5, 0);
    add(gate, worldBox(10, 0.4, 2.2), mats.rose, 0, 6.35, 0);
    add(gate, worldBox(10, 0.3, 2.2), mats.rose, 0, 8.9, 0);
    add(gate, worldBox(18.4, 0.3, 1.9), mats.rose, 0, 6.35, 0);
    // rose pillars with gold capitals
    for (const sx of [-1, 1]) for (const dx of [3.2, 4.2]) {
      const x = sx * dx;
      add(gate, new THREE.CylinderGeometry(0.42, 0.48, 6.2, 14), mats.rose, x, 3.1, 1.1);
      add(gate, new THREE.CylinderGeometry(0.55, 0.42, 0.5, 14), mats.gold, x, 6.05, 1.1);
      add(gate, new THREE.BoxGeometry(1.1, 0.5, 1.1), mats.roseDeep, x, 0.25, 1.1);
    }
    // domed turrets
    const turret = (x, y, r, h) => {
      add(gate, new THREE.CylinderGeometry(r * 0.95, r, 1.1, 8), mats.rose, x, y + 0.55, 0);
      add(gate, worldBox(r * 2.2, 0.2, r * 2.2), mats.cream, x, y + 1.15, 0);
      add(gate, onionDome(r * 1.05, h), mats.roseDeep, x, y + 1.25, 0);
      finial(gate, x, y + 1.25 + h - 0.05, 0, r * 0.35, r * 0.9);
    };
    turret(-4.2, 9.05, 1.1, 1.9); turret(4.2, 9.05, 1.1, 1.9);
    turret(-8.4, 6.5, 0.8, 1.4); turret(8.4, 6.5, 0.8, 1.4);
    // gold lion on a pedestal
    const lion = new THREE.Group();
    lion.position.set(0, 9.05, 0);
    add(lion, worldBox(3.4, 0.4, 1.5), mats.roseDeep, 0, 0.2, 0);
    const body = add(lion, new THREE.CapsuleGeometry(0.55, 1.4, 6, 12), mats.gold, 0.2, 1.35, 0);
    body.rotation.z = Math.PI / 2;
    const mane = add(lion, new THREE.SphereGeometry(0.78, 14, 12), mats.gold, -0.95, 1.55, 0);
    mane.scale.set(0.9, 1.0, 1.0);
    const head = add(lion, new THREE.SphereGeometry(0.42, 12, 10), mats.gold, -1.55, 1.7, 0);
    head.scale.set(1.2, 0.9, 0.85);
    add(lion, new THREE.BoxGeometry(0.4, 0.28, 0.5), mats.gold, -1.95, 1.55, 0);
    for (const [lx, lz] of [[-0.75, -0.32], [-0.75, 0.32], [0.95, -0.32], [0.95, 0.32]]) add(lion, new THREE.CylinderGeometry(0.15, 0.19, 0.95, 8), mats.gold, lx, 0.87, lz);
    const tail = add(lion, new THREE.CylinderGeometry(0.06, 0.1, 1.3, 6), mats.gold, 1.5, 1.35, 0);
    tail.rotation.z = -1.1;
    add(lion, new THREE.SphereGeometry(0.16, 8, 8), mats.gold, 2.05, 1.85, 0);
    gate.add(lion);
    // garlands + diyas for the wedding
    garland(gate, new THREE.Vector3(-2.6, 5.2, 1.5), new THREE.Vector3(2.6, 5.2, 1.5), 0.9);
    garland(gate, new THREE.Vector3(-2.6, 5.2, 1.5), new THREE.Vector3(-2.6, 1.6, 1.5), 0.25);
    garland(gate, new THREE.Vector3(2.6, 5.2, 1.5), new THREE.Vector3(2.6, 1.6, 1.5), 0.25);
    root.add(gate);
    pointLight(0, 6.4, LAYOUT.gateZ + 2.5, 40, 22);
  }
  for (const z of [96, 84, 72]) { lampPost(-6.2, z); lampPost(6.2, z); }
  for (const z of [54, 42, 30]) { lampPost(-8, z); lampPost(8, z); }
  lampPost(-8, 12); lampPost(8, 12); lampPost(-13, 1.5); lampPost(13, 1.5);

  // ── Twelve Shiva temples + platform along the river ───────────────────────
  {
    const X = LAYOUT.shivaRowX;
    const plat = new THREE.Group();
    // long platform, red panel base, white railing along the courtyard side
    add(plat, worldBox(6.5, 1.2, 56), mats.cream, X, 0.6, 28.5);
    add(plat, worldBox(6.7, 0.5, 56.2), mats.roseDeep, X, 0.35, 28.5);
    add(plat, worldBox(6.9, 0.14, 56.4), mats.creamPlain, X, 1.27, 28.5);
    const railGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6);
    const railInst = new THREE.InstancedMesh(railGeo, mats.railing, 190);
    const m4 = new THREE.Matrix4();
    let ri = 0;
    for (let z = 1; z <= 56; z += 0.3) { m4.makeTranslation(X + 3.3, 1.75, z); railInst.setMatrixAt(ri++, m4); }
    railInst.count = ri;
    plat.add(railInst);
    add(plat, worldBox(0.12, 0.08, 56), mats.railing, X + 3.3, 2.2, 28.5);
    // steps down to the courtyard at the middle and both ends
    for (const z of [8, 28.5, 49]) for (let i = 0; i < 4; i++) add(plat, worldBox(0.5, 0.3, 4), mats.cream, X + 3.6 + i * 0.5, 1.05 - i * 0.3, z);
    root.add(plat);

    // one Shiva temple, facing +x (east, into the courtyard)
    const shivaTemple = (z) => {
      const t = new THREE.Group();
      t.position.set(X, 1.34, z);
      const w = 3.6, h = 4.2;
      add(t, worldBox(w, h, w), mats.cream, 0, h / 2, 0);
      // red panels + pilasters
      for (const sz of [-1, 1]) add(t, worldBox(0.08, 2.4, 0.9), mats.rose, w / 2 + 0.04, 1.9, sz * 1.15);
      add(t, worldBox(w + 0.2, 0.3, w + 0.2), mats.rose, 0, 0.15, 0);
      // cusped-arch doorway on the east face
      const door = new THREE.Shape();
      const p = cuspedArchPath(0, 1.1, 2.1, 5);
      door.curves = p.curves; // reuse path as a solid shape
      const doorMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(door, { depth: 0.6, bevelEnabled: false }), mats.roofEdge);
      doorMesh.rotation.y = Math.PI / 2;
      doorMesh.position.set(w / 2 - 0.5, 0.05, 0);
      t.add(doorMesh);
      // door frame in rose
      const frame = add(t, worldBox(0.12, 2.6, 1.7), mats.rose, w / 2 + 0.02, 1.3, 0);
      frame.position.x = w / 2 + 0.02;
      add(t, worldBox(0.16, 2.35, 1.3), mats.creamPlain, w / 2 + 0.04, 1.2, 0);
      // lower bulging roof, upper drum + dome
      add(t, bulgeRoof(w, w, 1.9, 0.3), mats.salmon, 0, h, 0);
      add(t, new THREE.CylinderGeometry(0.95, 1.0, 1.3, 8), mats.cream, 0, h + 1.5, 0);
      add(t, new THREE.CylinderGeometry(1.1, 1.1, 0.16, 8), mats.rose, 0, h + 2.2, 0);
      add(t, onionDome(1.15, 1.7), mats.salmon, 0, h + 2.28, 0);
      finial(t, 0, h + 3.9, 0, 0.16, 0.55);
      root.add(t);
    };
    for (let i = 0; i < 12; i++) shivaTemple(54 - i * 4.6);
  }

  // ── River, bank, ghat ─────────────────────────────────────────────────────
  {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(160, 260), mats.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(LAYOUT.riverX - 80, -0.6, 30);
    root.add(water);
    // bank drop
    add(root, worldBox(0.6, 1.6, 260), mats.stone, LAYOUT.riverX + 0.3, -0.8, 30, false);
    // balustrade along the river edge
    add(root, worldBox(0.25, 0.9, 120), mats.railing, LAYOUT.riverX + 1.2, 0.45, 30, false);
    for (let z = -30; z <= 90; z += 4) add(root, worldBox(0.5, 1.1, 0.5), mats.rose, LAYOUT.riverX + 1.2, 0.55, z);
    // Chandni ghat: steps down to the water opposite the middle of the row
    for (let i = 0; i < 6; i++) add(root, worldBox(0.9, 0.35, 10), mats.stone, LAYOUT.riverX + 0.9 - i * 0.9, 0.2 - i * 0.35, 28.5);
    add(root, worldBox(9, 0.1, 10.6), mats.creamPlain, LAYOUT.riverX + 5.5, 0.05, 28.5, false);
    // small chandni pavilion (flat roof on columns) at the head of the ghat
    const ch = new THREE.Group();
    ch.position.set(LAYOUT.riverX + 5, 0, 28.5);
    for (const dx of [-2.4, 2.4]) for (const dz of [-3.6, 0, 3.6]) add(ch, new THREE.CylinderGeometry(0.22, 0.26, 3.6, 10), mats.cream, dx, 1.8, dz);
    add(ch, worldBox(6, 0.4, 9), mats.cream, 0, 3.8, 0);
    add(ch, worldBox(6.2, 0.2, 9.2), mats.rose, 0, 4.1, 0);
    root.add(ch);
  }

  // ── Nat-mandir ────────────────────────────────────────────────────────────
  {
    const nm = new THREE.Group();
    nm.position.z = LAYOUT.natMandirZ;
    const ph = LAYOUT.natMandirPlinth;
    add(nm, worldBox(22, ph, 11), mats.cream, 0, ph / 2, 0);
    add(nm, worldBox(22.3, 0.4, 11.3), mats.roseDeep, 0, 0.2, 0);
    for (const sz of [-1, 1]) for (let i = 0; i < 3; i++) add(nm, worldBox(8, 0.34, 0.6), mats.cream, 0, 0.17 + i * 0.33, sz * (5.5 + (2 - i) * 0.6 + 0.3));
    const colH = 6.6;
    const cols = [];
    for (const x of [-9, -6, -3, 3, 6, 9]) for (const z of [-4.4, 0, 4.4]) cols.push([x, z]);
    for (const x of [-9, 9]) for (const z of [-2.2, 2.2]) cols.push([x, z]);
    for (const [x, z] of cols) {
      add(nm, new THREE.CylinderGeometry(0.36, 0.42, colH, 16), mats.cream, x, ph + colH / 2, z);
      add(nm, worldBox(1.1, 0.3, 1.1), mats.cream, x, ph + 0.15, z);
      add(nm, worldBox(1.05, 0.35, 1.05), mats.cream, x, ph + colH - 0.17, z);
      add(nm, worldBox(0.9, 0.12, 0.9), mats.rose, x, ph + colH - 0.4, z);
    }
    add(nm, worldBox(22, 0.9, 11), mats.cream, 0, ph + colH + 0.45, 0);
    add(nm, worldBox(22.4, 0.25, 11.4), mats.rose, 0, ph + colH + 0.35, 0);
    add(nm, worldBox(22.6, 0.7, 11.6), mats.cream, 0, ph + colH + 1.25, 0);
    add(nm, worldBox(22.6, 0.2, 11.6), mats.rose, 0, ph + colH + 1.7, 0);
    // roof slab underside (ceiling)
    add(nm, worldBox(21, 0.1, 10), mats.creamPlain, 0, ph + colH + 0.05, 0, false);
    // wedding garlands between the front columns and a row of diyas
    for (const [a, b] of [[-9, -6], [-6, -3], [-3, 3], [3, 6], [6, 9]]) {
      garland(nm, new THREE.Vector3(a, ph + colH - 0.6, 4.7), new THREE.Vector3(b, ph + colH - 0.6, 4.7), 0.5);
      garland(nm, new THREE.Vector3(a, ph + colH - 0.6, -4.7), new THREE.Vector3(b, ph + colH - 0.6, -4.7), 0.5);
    }
    for (let x = -10; x <= 10; x += 1) { diya(nm, x + 0.5, ph + 0.05, 5.2); diya(nm, x + 0.5, ph + 0.05, -5.2); }
    root.add(nm);
    pointLight(0, ph + 5.5, LAYOUT.natMandirZ, 50, 26);
  }

  // ── The wedding mandap ────────────────────────────────────────────────────
  {
    const md = new THREE.Group();
    md.position.set(0, 0, LAYOUT.mandapZ);
    // rangoli on the floor: concentric rings
    const rings = [[3.6, 0xf5c02a], [3.1, 0xe4572e], [2.6, 0xf28c1c], [2.1, 0xffffff], [1.6, 0xe4572e]];
    for (const [r, col] of rings) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.35, r, 48), new THREE.MeshStandardMaterial({ color: col, roughness: 1 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      md.add(ring);
    }
    // bedi (raised platform) draped in red with gold edge
    add(md, worldBox(4.2, 0.4, 4.2), mats.cloth, 0, 0.2, 0);
    add(md, worldBox(4.4, 0.06, 4.4), mats.clothGold, 0, 0.42, 0);
    // posts wrapped in red cloth with gold bands
    const posts = [[-2.9, -2.9], [2.9, -2.9], [-2.9, 2.9], [2.9, 2.9]];
    for (const [x, z] of posts) {
      add(md, new THREE.CylinderGeometry(0.14, 0.14, 3.6, 10), mats.cloth, x, 1.8, z);
      for (let y = 0.4; y < 3.4; y += 0.6) add(md, new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10), mats.clothGold, x, y, z);
      add(md, new THREE.BoxGeometry(0.5, 0.2, 0.5), mats.brass, x, 0.1, z);
    }
    // canopy: red cloth with a gentle curve, gold fringe
    add(md, chalaRoof(6.2, 6.2, 0.9, 0.15, 0.3), mats.cloth, 0, 3.55, 0);
    add(md, worldBox(6.9, 0.18, 0.06), mats.clothGold, 0, 3.5, 3.4);
    add(md, worldBox(6.9, 0.18, 0.06), mats.clothGold, 0, 3.5, -3.4);
    add(md, worldBox(0.06, 0.18, 6.9), mats.clothGold, 3.4, 3.5, 0);
    add(md, worldBox(0.06, 0.18, 6.9), mats.clothGold, -3.4, 3.5, 0);
    finial(md, 0, 4.4, 0, 0.3, 0.7);
    // garlands: between posts, and hanging strands from the canopy edge
    const top = 3.35;
    garland(md, new THREE.Vector3(-2.9, top, 2.9), new THREE.Vector3(2.9, top, 2.9), 0.8);
    garland(md, new THREE.Vector3(-2.9, top, -2.9), new THREE.Vector3(2.9, top, -2.9), 0.8);
    garland(md, new THREE.Vector3(-2.9, top, -2.9), new THREE.Vector3(-2.9, top, 2.9), 0.8);
    garland(md, new THREE.Vector3(2.9, top, -2.9), new THREE.Vector3(2.9, top, 2.9), 0.8);
    for (let i = -2; i <= 2; i++) {
      for (const [x, z, dx, dz] of [[i * 1.2, 3.3, 0, 0], [i * 1.2, -3.3, 0, 0], [3.3, i * 1.2, 0, 0], [-3.3, i * 1.2, 0, 0]]) {
        garland(md, new THREE.Vector3(x, top + 0.1, z), new THREE.Vector3(x + dx, top - 0.9, z + dz), 0);
      }
    }
    // havan kund (sacred fire) in the middle, brass lamps, diyas around the bedi
    add(md, worldBox(0.9, 0.3, 0.9), mats.brick, 0, 0.57, 0);
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(flameGeo, mats.flame);
      f.position.set((Math.random() - 0.5) * 0.4, 0.85, (Math.random() - 0.5) * 0.4);
      f.scale.set(1.6, 3.2, 1.6);
      md.add(f);
      flames.push({ mesh: f, seed: Math.random() * 100, big: true });
    }
    for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5]]) {
      add(md, new THREE.CylinderGeometry(0.22, 0.28, 0.08, 12), mats.brass, x, 0.46, z);
      add(md, new THREE.CylinderGeometry(0.05, 0.07, 0.6, 8), mats.brass, x, 0.76, z);
      diya(md, x, 1.06, z, 1.8);
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      diya(md, Math.cos(a) * 2.6, 0.02, Math.sin(a) * 2.6);
    }
    root.add(md);
    pointLight(0, 2.4, LAYOUT.mandapZ, 30, 14, 0xffb45a);
  }

  // ── Main temple: navaratna ────────────────────────────────────────────────
  {
    const T = new THREE.Group();
    T.position.copy(LAYOUT.templeCenter);
    const PH = LAYOUT.platformH;
    // platform with red panel band
    add(T, worldBox(22, PH, 22), mats.cream, 0, PH / 2, 0);
    add(T, worldBox(22.2, PH * 0.45, 22.2), mats.roseDeep, 0, PH * 0.42, 0);
    add(T, worldBox(22.4, 0.16, 22.4), mats.creamPlain, 0, PH + 0.08, 0);
    // stairs on the south side, with cheek walls
    const steps = 12, rise = PH / steps, tread = 0.42;
    for (let i = 0; i < steps; i++) add(T, worldBox(8, rise, tread), mats.cream, 0, rise / 2 + i * rise, 11 + (steps - 1 - i) * tread + tread / 2);
    for (const sx of [-1, 1]) {
      const cheek = add(T, worldBox(0.5, PH + 0.6, steps * tread + 0.2), mats.cream, sx * 4.25, (PH + 0.6) / 2, 11 + (steps * tread) / 2);
      cheek.position.y = (PH + 0.6) / 2 - 0.3;
      add(T, worldBox(0.6, 0.2, steps * tread + 0.4), mats.rose, sx * 4.25, PH + 0.4, 11 + (steps * tread) / 2);
    }
    // platform railing (rose posts, cream rail) around the edge, gap at the stairs
    for (let i = -10; i <= 10; i++) {
      const p = i * 1.05;
      if (Math.abs(p) > 4.4) add(T, worldBox(0.3, 0.9, 0.3), mats.rose, p, PH + 0.6, 11);
      add(T, worldBox(0.3, 0.9, 0.3), mats.rose, p, PH + 0.6, -11);
      add(T, worldBox(0.3, 0.9, 0.3), mats.rose, -11, PH + 0.6, p);
      add(T, worldBox(0.3, 0.9, 0.3), mats.rose, 11, PH + 0.6, p);
    }
    add(T, worldBox(6.4, 0.12, 0.3), mats.creamPlain, -7.8, PH + 1.1, 11);
    add(T, worldBox(6.4, 0.12, 0.3), mats.creamPlain, 7.8, PH + 1.1, 11);
    add(T, worldBox(22, 0.12, 0.3), mats.creamPlain, 0, PH + 1.1, -11);
    add(T, worldBox(0.3, 0.12, 22), mats.creamPlain, -11, PH + 1.1, 0);
    add(T, worldBox(0.3, 0.12, 22), mats.creamPlain, 11, PH + 1.1, 0);

    // ground storey: 14 × 14 arcade on all four sides
    const G = 14, GH = 6.6;
    const gy = PH;
    const arcade = [];
    for (let i = -2; i <= 2; i++) arcade.push({ x: i * 2.7, w: 1.9, h: 4.3 });
    const side = (rotY, x, z) => {
      const w = new THREE.Mesh(roundArchWall(G, GH, 0.7, arcade), mats.cream);
      w.rotation.y = rotY;
      w.position.set(x, gy, z);
      shadow(w);
      T.add(w);
    };
    side(0, 0, G / 2); side(Math.PI, 0, -G / 2); side(Math.PI / 2, -G / 2, 0); side(-Math.PI / 2, G / 2, 0);
    // corner pilasters + dentil band + rose base band
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(T, worldBox(1.0, GH, 1.0), mats.cream, sx * (G / 2 - 0.3), gy + GH / 2, sz * (G / 2 - 0.3));
    for (const [w, d, x, z] of [[G + 0.3, 0.3, 0, G / 2], [G + 0.3, 0.3, 0, -G / 2], [0.3, G + 0.3, G / 2, 0], [0.3, G + 0.3, -G / 2, 0]]) add(T, worldBox(w, 0.5, d), mats.rose, x, gy + 0.25, z);
    const band = (w, y, size) => {
      for (const [rx, x, z] of [[0, 0, size / 2 + 0.05], [Math.PI, 0, -size / 2 - 0.05], [Math.PI / 2, -size / 2 - 0.05, 0], [-Math.PI / 2, size / 2 + 0.05, 0]]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size + 0.1, w), mats.dentil);
        m.material = mats.dentil;
        m.rotation.y = rx;
        m.position.set(x, y, z);
        T.add(m);
      }
    };
    band(0.5, gy + GH - 0.9, G + 0.02);
    // verandah floor + inner sanctum core (8 × 8) with a round-arched door on the south
    add(T, worldBox(G - 0.2, 0.06, G - 0.2), mats.flagstone, 0, gy + 0.03, 0, false);
    const C = 8;
    // sanctum skirting
    for (const [w, d, x, z] of [[C, 0.2, 0, C / 2 - 0.4], [C, 0.2, 0, -C / 2 + 0.4], [0.2, C, C / 2 - 0.4, 0], [0.2, C, -C / 2 + 0.4, 0]]) add(T, worldBox(w, 0.4, d), mats.roseDeep, x, gy + 0.2, z, false);
    const core = (rotY, x, z, arches) => {
      const w = new THREE.Mesh(roundArchWall(C, GH - 0.2, 0.6, arches), mats.creamPlain);
      w.rotation.y = rotY;
      w.position.set(x, gy, z);
      shadow(w);
      T.add(w);
    };
    core(0, 0, C / 2, [{ x: 0, w: 2.3, h: 3.6 }]);
    core(Math.PI, 0, -C / 2, []);
    core(Math.PI / 2, -C / 2, 0, []);
    core(-Math.PI / 2, C / 2, 0, []);
    add(T, worldBox(C, 0.3, C), mats.roofEdge, 0, gy + GH - 0.35, 0, false); // sanctum ceiling
    // roof slab + bow parapets with rose trim
    const RY = gy + GH;
    add(T, worldBox(G + 0.8, 0.4, G + 0.8), mats.cream, 0, RY + 0.2, 0);
    const parapet = (size, y, h0, h1, thick) => {
      for (const [rx, x, z] of [[0, 0, size / 2], [Math.PI, 0, -size / 2], [Math.PI / 2, -size / 2, 0], [-Math.PI / 2, size / 2, 0]]) {
        const p = new THREE.Mesh(bowParapet(size, h0, h1, thick), mats.cream);
        p.rotation.y = rx; p.position.set(x, y, z); shadow(p); T.add(p);
        const b = new THREE.Mesh(bowParapet(size, h0, h1, thick + 0.06, 0.32), mats.roseBand);
        b.rotation.y = rx; b.position.set(x, y + 0.001, z); b.translateZ(0.03); T.add(b);
      }
    };
    parapet(G + 0.8, RY + 0.4, 0.9, 2.1, 0.45);

    // second storey: 10 × 10, blind arches, window in the middle of each face
    const S2 = 10, S2H = 6, y2 = RY + 0.4;
    const blind = [{ x: -3, w: 1.6, h: 3.4 }, { x: 0, w: 1.9, h: 3.9 }, { x: 3, w: 1.6, h: 3.4 }];
    for (const [rx, x, z] of [[0, 0, S2 / 2], [Math.PI, 0, -S2 / 2], [Math.PI / 2, -S2 / 2, 0], [-Math.PI / 2, S2 / 2, 0]]) {
      const w = new THREE.Mesh(roundArchWall(S2, S2H, 0.5, blind), mats.cream);
      w.rotation.y = rx; w.position.set(x, y2, z); shadow(w); T.add(w);
    }
    add(T, worldBox(S2 - 1.0, S2H, S2 - 1.0), mats.roseDeep, 0, y2 + S2H / 2, 0, false); // recess colour behind blind arches
    band(0.5, y2 + S2H - 0.8, S2 + 0.02);
    add(T, worldBox(S2 + 0.6, 0.4, S2 + 0.6), mats.cream, 0, y2 + S2H + 0.2, 0);
    parapet(S2 + 0.6, y2 + S2H + 0.4, 0.8, 1.8, 0.4);

    // ratna spire: octagonal drum with niches + ribbed striped spire + gold kalasha
    const ratna = (x, y, z, r, drumH, spireH) => {
      const drum = add(T, new THREE.CylinderGeometry(r, r, drumH, 8), mats.cream, x, y + drumH / 2, z);
      drum.rotation.y = Math.PI / 8;
      add(T, new THREE.CylinderGeometry(r + 0.12, r + 0.12, 0.25, 8), mats.rose, x, y + 0.13, z).rotation.y = Math.PI / 8;
      add(T, new THREE.CylinderGeometry(r + 0.12, r + 0.12, 0.25, 8), mats.rose, x, y + drumH - 0.13, z).rotation.y = Math.PI / 8;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const n = add(T, new THREE.PlaneGeometry(r * 0.42, drumH * 0.5), mats.roseDeep, x + Math.cos(a) * (r + 0.01), y + drumH * 0.5, z + Math.sin(a) * (r + 0.01), false);
        n.rotation.y = -a + Math.PI / 2;
      }
      add(T, new THREE.CylinderGeometry(r + 0.25, r + 0.25, 0.3, 8), mats.cream, x, y + drumH + 0.15, z).rotation.y = Math.PI / 8;
      const sp = add(T, ribbedSpire(r + 0.18, spireH), mats.stripe, x, y + drumH + 0.3, z);
      sp.castShadow = true;
      finial(T, x, y + drumH + 0.3 + spireH - 0.1, z, r * 0.4, r * 1.1);
    };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) ratna(sx * 5.9, y2, sz * 5.9, 1.35, 3.6, 4.8);

    // third storey: 7 × 7 with an arched opening each face
    const S3 = 7, S3H = 4.6, y3 = y2 + S2H + 0.4;
    for (const [rx, x, z] of [[0, 0, S3 / 2], [Math.PI, 0, -S3 / 2], [Math.PI / 2, -S3 / 2, 0], [-Math.PI / 2, S3 / 2, 0]]) {
      const w = new THREE.Mesh(roundArchWall(S3, S3H, 0.5, [{ x: 0, w: 1.6, h: 3.2 }]), mats.cream);
      w.rotation.y = rx; w.position.set(x, y3, z); shadow(w); T.add(w);
    }
    add(T, worldBox(S3 - 1.0, S3H, S3 - 1.0), mats.roseDeep, 0, y3 + S3H / 2, 0, false);
    band(0.45, y3 + S3H - 0.7, S3 + 0.02);
    add(T, worldBox(S3 + 0.6, 0.4, S3 + 0.6), mats.cream, 0, y3 + S3H + 0.2, 0);
    parapet(S3 + 0.6, y3 + S3H + 0.4, 0.7, 1.5, 0.35);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) ratna(sx * 4.35, y3, sz * 4.35, 1.1, 3.0, 4.0);

    // central spire
    const yc = y3 + S3H + 0.4;
    ratna(0, yc, 0, 2.3, 4.2, 7.4);
    // flag on the top
    const flagY = yc + 4.2 + 0.3 + 7.4 + 1.2;
    add(T, new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), mats.brass, 0, flagY + 0.6, 0);
    const flag = add(T, new THREE.PlaneGeometry(1.1, 0.6), mats.red, 0.55, flagY + 1.1, 0);
    flag.material = mats.cloth;

    // sanctum interior: silver lotus throne alcove, garlands, lamps
    const sy = gy;
    const alc = -C / 2 + 0.3;
    add(T, worldBox(3.6, 4.2, 0.3), mats.roseDeep, 0, sy + 2.1, alc - 0.1);
    add(T, worldBox(3.0, 3.7, 0.2), mats.cloth, 0, sy + 1.95, alc + 0.1);
    add(T, new THREE.TorusGeometry(1.45, 0.06, 8, 28, Math.PI), mats.gold, 0, sy + 2.6, alc + 0.25);
    for (const sx of [-1, 1]) add(T, new THREE.BoxGeometry(0.12, 2.6, 0.12), mats.gold, sx * 1.45, sy + 1.3, alc + 0.25);
    // dais + silver thousand-petal lotus
    add(T, worldBox(3.2, 0.35, 1.6), mats.silver, 0, sy + 0.18, alc + 1.0);
    add(T, worldBox(2.6, 0.35, 1.2), mats.silver, 0, sy + 0.53, alc + 1.0);
    const lotus = new THREE.Group();
    lotus.position.set(0, sy + 0.72, alc + 1.0);
    for (let ring = 0; ring < 3; ring++) {
      const n = 14 + ring * 6, rr = 0.55 + ring * 0.28;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mats.silver);
        petal.position.set(Math.cos(a) * rr, 0.05 + ring * 0.02, Math.sin(a) * rr);
        petal.scale.set(1.7, 0.35, 0.6);
        petal.rotation.y = -a;
        petal.rotation.z = 0.35 - ring * 0.12;
        lotus.add(petal);
      }
    }
    add(lotus, new THREE.CylinderGeometry(0.6, 0.7, 0.3, 24), mats.silver, 0, 0.18, 0);
    add(lotus, new THREE.SphereGeometry(0.28, 14, 12), mats.gold, 0, 0.5, 0);
    T.add(lotus);
    garland(T, new THREE.Vector3(-1.6, sy + 3.4, alc + 0.5), new THREE.Vector3(1.6, sy + 3.4, alc + 0.5), 0.55);
    for (const sx of [-1, 1]) garland(T, new THREE.Vector3(sx * 3.6, sy + 3.6, -C / 2 + 0.6), new THREE.Vector3(sx * 3.6, sy + 3.6, C / 2 - 0.6), 0.5);
    for (let i = 0; i < 6; i++) { diya(T, -1.4, sy + 0.05, C / 2 - 1 - i * 0.5); diya(T, 1.4, sy + 0.05, C / 2 - 1 - i * 0.5); }
    for (let i = 0; i < 9; i++) diya(T, -1.6 + i * 0.4, sy + 0.9, alc + 1.9);
    for (const sx of [-1, 1]) {
      add(T, new THREE.CylinderGeometry(0.22, 0.28, 0.08, 12), mats.brass, sx * 2.2, sy + 0.04, alc + 1.2);
      add(T, new THREE.CylinderGeometry(0.05, 0.07, 1.0, 8), mats.brass, sx * 2.2, sy + 0.55, alc + 1.2);
      diya(T, sx * 2.2, sy + 1.05, alc + 1.2, 1.8);
    }
    // verandah diyas along the arcade base
    for (let i = -6; i <= 6; i++) diya(T, i * 1.0 + 0.5, gy + 0.08, G / 2 - 0.9);
    root.add(T);

    const tc = LAYOUT.templeCenter;
    pointLight(tc.x, PH + 3.0, tc.z + alc + 1.6, 28, 14, 0xffc070);   // sanctum
    pointLight(tc.x, PH + 4.5, tc.z + C / 2 + 2.2, 26, 12);            // verandah
    // night floodlights on the facade
    const flood = (x, z, targetY) => {
      const s = new THREE.SpotLight(0xffd9a0, 0, 70, Math.PI / 7, 0.6, 1.2);
      s.position.set(x, 1.2, z);
      s.target.position.set(tc.x, targetY, tc.z);
      s.userData.night = 220;
      root.add(s, s.target);
      spots.push(s);
    };
    flood(-15, 6, 14); flood(15, 6, 14); flood(-15, -30, 16); flood(15, -30, 16);
  }

  return { group: root, flames, pointLights, spots, lampGlass };
}
