import * as THREE from 'three';
import {
  worldBox, chalaRoof, chalaRoofUnder, ratnaTower, amalaka, kalasha,
  archedWallGeometry, column, garlandPoints,
} from './geo.js';

// World layout (metres). The walk runs along -Z.
//   approach path  z 85 → 40
//   toran gate     z 40
//   nat-mandir     z 29 → 19
//   shrine         z 0 → -12  (front face at z=0)

const flameGeo = new THREE.SphereGeometry(0.06, 8, 8);
const diyaGeo = new THREE.LatheGeometry(
  [new THREE.Vector2(0, 0), new THREE.Vector2(0.09, 0), new THREE.Vector2(0.13, 0.05), new THREE.Vector2(0.11, 0.08), new THREE.Vector2(0.07, 0.07), new THREE.Vector2(0, 0.06)],
  12,
);
const marigoldGeo = new THREE.SphereGeometry(0.075, 7, 6);
const bellGeo = new THREE.ConeGeometry(0.11, 0.2, 12, 1, true);
const bellClapper = new THREE.SphereGeometry(0.035, 8, 8);

export function buildTemple(mats) {
  const root = new THREE.Group();
  const flames = [];   // { mesh, seed }
  const lights = [];

  const shadow = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const add = (parent, geo, mat, x, y, z, castShadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.castShadow = castShadow;
    parent.add(m);
    return m;
  };

  function diya(parent, x, y, z) {
    const g = new THREE.Group();
    const bowl = new THREE.Mesh(diyaGeo, mats.clay);
    const flame = new THREE.Mesh(flameGeo, mats.flame);
    flame.position.y = 0.11;
    flame.scale.set(0.55, 1.25, 0.55);
    g.add(bowl, flame);
    g.position.set(x, y, z);
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

  function bell(parent, x, y, z) {
    const g = new THREE.Group();
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), mats.wood);
    string.position.y = 0.25;
    const b = new THREE.Mesh(bellGeo, mats.brass);
    b.position.y = -0.1;
    const c = new THREE.Mesh(bellClapper, mats.brass);
    c.position.y = -0.2;
    g.add(string, b, c);
    g.position.set(x, y, z);
    parent.add(g);
  }

  function pointLight(x, y, z, intensity, distance, color = 0xffa24a) {
    const l = new THREE.PointLight(color, intensity, distance, 2);
    l.position.set(x, y, z);
    root.add(l);
    lights.push(l);
    return l;
  }

  function finial(parent, x, y, z, r, h) {
    add(parent, amalaka(r), mats.stone, x, y, z);
    add(parent, kalasha(r * 0.55, h), mats.gold, x, y + 0.16, z);
  }

  // ── Ground, path, courtyard paving ─────────────────────────
  {
    const earthMat = mats.earth.clone();
    earthMat.map = mats.earth.map.clone();
    earthMat.map.repeat.set(160, 160);
    earthMat.map.needsUpdate = true;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), earthMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    root.add(ground);

    const pathMat = mats.paving.clone();
    pathMat.map = mats.paving.map.clone();
    pathMat.map.repeat.set(4, 50);
    pathMat.map.needsUpdate = true;
    const path = new THREE.Mesh(new THREE.PlaneGeometry(4, 50), pathMat);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.012, 65);
    path.receiveShadow = true;
    root.add(path);

    const yardMat = mats.paving.clone();
    yardMat.map = mats.paving.map.clone();
    yardMat.map.repeat.set(40, 56);
    yardMat.map.needsUpdate = true;
    yardMat.color = new THREE.Color(0xd8c2ad);
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(40, 56), yardMat);
    yard.rotation.x = -Math.PI / 2;
    yard.position.set(0, 0.01, 12);
    yard.receiveShadow = true;
    root.add(yard);
  }

  // ── Boundary walls ─────────────────────────────────────────
  {
    const h = 1.8, t = 0.5;
    const seg = (w, d, x, z) => add(root, worldBox(w, h, d), mats.brick, x, h / 2, z);
    seg(15.6, t, -12.2, 40); seg(15.6, t, 12.2, 40);      // front wall either side of gate
    seg(t, 56, -20, 12); seg(t, 56, 20, 12);              // sides
    seg(40, t, 0, -16);                                    // back
    // coping
    const cop = (w, d, x, z) => add(root, worldBox(w + 0.2, 0.12, d + 0.2), mats.plaster, x, h + 0.06, z);
    cop(15.6, t, -12.2, 40); cop(15.6, t, 12.2, 40); cop(t, 56, -20, 12); cop(t, 56, 20, 12); cop(40, t, 0, -16);
  }

  // ── Toran gate ─────────────────────────────────────────────
  {
    const gate = new THREE.Group();
    gate.position.z = 40;
    add(gate, worldBox(1.4, 5, 1.4), mats.brick, -3.6, 2.5, 0);
    add(gate, worldBox(1.4, 5, 1.4), mats.brick, 3.6, 2.5, 0);
    add(gate, worldBox(8.8, 0.7, 1.6), mats.panel, 0, 5.35, 0);
    add(gate, worldBox(9.4, 0.25, 2.0), mats.plaster, 0, 5.82, 0);
    const roof = add(gate, chalaRoof(9.2, 1.8, 1.5, 0.6, 0.6), mats.roof, 0, 5.95, 0);
    roof.receiveShadow = true;
    add(gate, chalaRoofUnder(9.2, 1.8, 1.5, 0.6, 0.6), mats.roofEdge, 0, 5.95, 0, false);
    finial(gate, 0, 7.45, 0, 0.32, 0.7);
    // garlands
    garland(gate, new THREE.Vector3(-3.0, 4.9, 0.85), new THREE.Vector3(3.0, 4.9, 0.85), 0.9);
    garland(gate, new THREE.Vector3(-3.0, 4.9, 0.85), new THREE.Vector3(-3.0, 2.2, 0.85), 0.25);
    garland(gate, new THREE.Vector3(3.0, 4.9, 0.85), new THREE.Vector3(3.0, 2.2, 0.85), 0.25);
    // lamp posts
    for (const sx of [-1, 1]) {
      const post = new THREE.Group();
      post.position.set(sx * 5.6, 0, 1.4);
      add(post, new THREE.CylinderGeometry(0.08, 0.12, 2.6, 8), mats.wood, 0, 1.3, 0);
      add(post, new THREE.BoxGeometry(0.5, 0.08, 0.5), mats.wood, 0, 2.62, 0);
      diya(post, 0, 2.66, 0);
      gate.add(post);
    }
    // diyas along the pillar bases
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) diya(gate, sx * (2.6 + i * 0.35), 0, 1.0);
    root.add(gate);
    pointLight(0, 4.6, 41.2, 18, 14);
  }

  // ── Nat-mandir (open pillared pavilion, aat-chala roof) ────
  {
    const nm = new THREE.Group();
    nm.position.z = 24;
    const plinthH = 0.6;
    add(nm, worldBox(14, plinthH, 10), mats.brick, 0, plinthH / 2, 0);
    add(nm, worldBox(14.3, 0.08, 10.3), mats.plaster, 0, plinthH + 0.04, 0);
    // steps front and back
    for (const sz of [-1, 1]) {
      add(nm, worldBox(6, 0.3, 0.7), mats.brick, 0, 0.15, sz * 5.35);
      add(nm, worldBox(6, 0.3, 0.7), mats.brick, 0, 0.45, sz * 4.85);
    }
    const colH = 3.6;
    for (const x of [-5, -2, 2, 5]) {
      for (const z of [-4, 0, 4]) {
        const c = column(colH);
        c.children.forEach((m) => { m.material = mats.plaster; m.castShadow = true; m.receiveShadow = true; });
        c.children[0].material = mats.brickColumn;
        c.position.set(x, plinthH, z);
        nm.add(c);
      }
    }
    // beams
    const beamY = plinthH + colH + 0.2;
    for (const z of [-4, 0, 4]) add(nm, worldBox(11, 0.4, 0.5), mats.wood, 0, beamY, z);
    for (const x of [-5, -2, 2, 5]) add(nm, worldBox(0.5, 0.4, 9), mats.wood, x, beamY, 0);
    // ceiling + lower roof
    const roofY = beamY + 0.2;
    add(nm, worldBox(14, 0.15, 10), mats.wood, 0, roofY, 0, false);
    add(nm, worldBox(14.6, 0.3, 10.6), mats.plaster, 0, roofY + 0.15, 0);
    add(nm, chalaRoof(14, 10, 1.7, 0.8, 0.9), mats.roof, 0, roofY + 0.3, 0);
    add(nm, chalaRoofUnder(14, 10, 1.7, 0.8, 0.9), mats.roofEdge, 0, roofY + 0.3, 0, false);
    // upper tier
    add(nm, worldBox(7, 0.9, 5), mats.panel, 0, roofY + 1.5, 0);
    add(nm, worldBox(7.4, 0.25, 5.4), mats.plaster, 0, roofY + 2.05, 0);
    add(nm, chalaRoof(7, 5, 1.4, 0.35, 0.6), mats.roof, 0, roofY + 2.15, 0);
    add(nm, chalaRoofUnder(7, 5, 1.4, 0.35, 0.6), mats.roofEdge, 0, roofY + 2.15, 0, false);
    finial(nm, 0, roofY + 3.55, 0, 0.36, 0.8);
    // garlands between front columns and bells
    garland(nm, new THREE.Vector3(-5, plinthH + colH - 0.4, 4.2), new THREE.Vector3(-2, plinthH + colH - 0.4, 4.2), 0.5);
    garland(nm, new THREE.Vector3(2, plinthH + colH - 0.4, 4.2), new THREE.Vector3(5, plinthH + colH - 0.4, 4.2), 0.5);
    garland(nm, new THREE.Vector3(-2, plinthH + colH - 0.4, 4.2), new THREE.Vector3(2, plinthH + colH - 0.4, 4.2), 0.7);
    for (const x of [-1, 1]) bell(nm, x * 1.2, plinthH + colH - 0.25, 0);
    // diyas along plinth edges
    for (let i = -6; i <= 6; i++) { diya(nm, i * 1.05 + 0.5, plinthH + 0.08, 5.0); diya(nm, i * 1.05 + 0.5, plinthH + 0.08, -5.0); }
    root.add(nm);
    pointLight(0, 3.4, 24, 22, 18);
  }

  // ── Main shrine: pancha-ratna, Bishnupur style ────────────
  {
    const sh = new THREE.Group();
    const plinthH = 1.0, W = 12, D = 12, wallH = 5.6, wallT = 0.7;
    const wallY = plinthH;
    add(sh, worldBox(W + 2, plinthH, D + 2), mats.brick, 0, plinthH / 2, -D / 2);
    add(sh, worldBox(W + 2.3, 0.1, D + 2.3), mats.plaster, 0, plinthH + 0.05, -D / 2);
    // front steps
    for (let i = 0; i < 4; i++) add(sh, worldBox(8, 0.25, 0.45), mats.brick, 0, 0.125 + i * 0.25, 1.0 + (3 - i) * 0.45 + 0.225);

    // front wall with three cusped arches
    const front = new THREE.Mesh(archedWallGeometry(W, wallH, wallT, [
      { x: 0, w: 2.6, h: 3.9, foils: 7 },
      { x: -3.7, w: 1.9, h: 3.2, foils: 5 },
      { x: 3.7, w: 1.9, h: 3.2, foils: 5 },
    ]), mats.panel);
    front.position.set(0, wallY, 0);
    shadow(front);
    sh.add(front);
    // inner wall between portico and sanctum
    const inner = new THREE.Mesh(archedWallGeometry(W - 1.4, wallH, 0.6, [{ x: 0, w: 2.3, h: 3.5, foils: 5 }]), mats.brick);
    inner.position.set(0, wallY, -3.6);
    shadow(inner);
    sh.add(inner);
    // side + back walls
    add(sh, worldBox(wallT, wallH, D), mats.panel, -W / 2 + wallT / 2, wallY + wallH / 2, -D / 2);
    add(sh, worldBox(wallT, wallH, D), mats.panel, W / 2 - wallT / 2, wallY + wallH / 2, -D / 2);
    add(sh, worldBox(W, wallH, wallT), mats.panel, 0, wallY + wallH / 2, -D + wallT / 2);
    // interior floor + ceiling
    add(sh, worldBox(W - 1.4, 0.04, D - 1.4), mats.stone, 0, plinthH + 0.02, -D / 2, false);
    add(sh, worldBox(W, 0.2, D), mats.roofEdge, 0, wallY + wallH - 0.1, -D / 2, false);
    for (let i = 0; i < 7; i++) add(sh, worldBox(W - 1.2, 0.3, 0.3), mats.wood, 0, wallY + wallH - 0.35, -0.9 - i * 1.6, false);
    // cornice + roof
    const roofY = wallY + wallH;
    add(sh, worldBox(W + 0.8, 0.35, D + 0.8), mats.plaster, 0, roofY + 0.17, -D / 2);
    add(sh, chalaRoof(W, D, 2.4, 0.95, 0.9), mats.roof, 0, roofY + 0.35, -D / 2);
    add(sh, chalaRoofUnder(W, D, 2.4, 0.95, 0.9), mats.roofEdge, 0, roofY + 0.35, -D / 2, false);

    // central ratna
    const cz = -D / 2;
    add(sh, worldBox(3.6, 1.4, 3.6), mats.panel, 0, roofY + 2.0, cz);
    add(sh, worldBox(3.9, 0.2, 3.9), mats.plaster, 0, roofY + 2.8, cz);
    add(sh, ratnaTower(1.55, 3.4), mats.brick, 0, roofY + 2.9, cz);
    finial(sh, 0, roofY + 6.3, cz, 0.7, 1.1);
    // corner ratnas
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * 4.3, z = cz + sz * 4.3;
      add(sh, worldBox(2.2, 1.2, 2.2), mats.panel, x, roofY + 0.9, z);
      add(sh, worldBox(2.4, 0.15, 2.4), mats.plaster, x, roofY + 1.55, z);
      add(sh, ratnaTower(0.95, 2.1), mats.brick, x, roofY + 1.6, z);
      finial(sh, x, roofY + 3.7, z, 0.42, 0.7);
    }

    // decorations on the facade
    garland(sh, new THREE.Vector3(-5.2, wallY + wallH - 0.4, 0.3), new THREE.Vector3(-1.6, wallY + wallH - 0.4, 0.3), 0.55);
    garland(sh, new THREE.Vector3(-1.6, wallY + wallH - 0.4, 0.3), new THREE.Vector3(1.6, wallY + wallH - 0.4, 0.3), 0.55);
    garland(sh, new THREE.Vector3(1.6, wallY + wallH - 0.4, 0.3), new THREE.Vector3(5.2, wallY + wallH - 0.4, 0.3), 0.55);
    bell(sh, -0.9, wallY + 3.85, 0.1); bell(sh, 0.9, wallY + 3.85, 0.1);
    bell(sh, -3.7, wallY + 3.15, 0.1); bell(sh, 3.7, wallY + 3.15, 0.1);
    for (let i = -6; i <= 6; i++) diya(sh, i * 0.95 + 0.4, plinthH + 0.1, 0.65);
    // portico diyas
    for (let i = 0; i < 6; i++) { diya(sh, -4.6, plinthH + 0.1, -0.5 - i * 0.5); diya(sh, 4.6, plinthH + 0.1, -0.5 - i * 0.5); }

    // sanctum: dais, lamp tree, niche, garlands, diyas
    const dz = -D + 2.6;
    add(sh, worldBox(4.4, 0.5, 2.0), mats.stone, 0, plinthH + 0.25, dz);
    add(sh, worldBox(4.7, 0.08, 2.3), mats.red, 0, plinthH + 0.54, dz);
    add(sh, worldBox(3.4, 3.6, 0.25), mats.roofEdge, 0, plinthH + 0.5 + 1.8, -D + wallT + 0.15);
    add(sh, worldBox(2.9, 3.1, 0.2), mats.red, 0, plinthH + 0.5 + 1.75, -D + wallT + 0.28);
    // a simple gold arch outline on the niche
    add(sh, new THREE.TorusGeometry(1.3, 0.05, 8, 24, Math.PI), mats.gold, 0, plinthH + 2.1, -D + wallT + 0.42);
    add(sh, new THREE.BoxGeometry(0.1, 1.6, 0.1), mats.gold, -1.3, plinthH + 1.3, -D + wallT + 0.42);
    add(sh, new THREE.BoxGeometry(0.1, 1.6, 0.1), mats.gold, 1.3, plinthH + 1.3, -D + wallT + 0.42);
    // lotus emblem in the niche
    const lotus = new THREE.Group();
    lotus.position.set(0, plinthH + 2.35, -D + wallT + 0.36);
    for (let i = 0; i < 12; i++) {
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), mats.gold);
      const a = (i / 12) * Math.PI * 2;
      petal.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0);
      petal.scale.set(1.9, 0.6, 0.35);
      petal.rotation.z = a;
      lotus.add(petal);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), mats.gold);
    core.scale.z = 0.4;
    lotus.add(core);
    sh.add(lotus);
    // lamp tree (pradip stand)
    const stand = new THREE.Group();
    stand.position.set(0, plinthH + 0.58, dz);
    add(stand, new THREE.CylinderGeometry(0.06, 0.09, 2.2, 10), mats.brass, 0, 1.1, 0);
    add(stand, new THREE.CylinderGeometry(0.45, 0.5, 0.08, 16), mats.brass, 0, 0.04, 0);
    for (let tier = 0; tier < 4; tier++) {
      const r = 0.55 - tier * 0.12, y = 0.6 + tier * 0.45;
      add(stand, new THREE.TorusGeometry(r, 0.03, 6, 20), mats.brass, 0, y, 0).rotation.x = Math.PI / 2;
      const n = 8 - tier * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        diya(stand, Math.cos(a) * r, y, Math.sin(a) * r);
      }
    }
    diya(stand, 0, 2.2, 0);
    sh.add(stand);
    // large brass diyas on the dais corners
    for (const sx of [-1, 1]) {
      const bd = new THREE.Group();
      bd.position.set(sx * 1.7, plinthH + 0.58, dz + 0.5);
      add(bd, new THREE.CylinderGeometry(0.28, 0.35, 0.1, 14), mats.brass, 0, 0.05, 0);
      add(bd, new THREE.CylinderGeometry(0.06, 0.08, 0.5, 8), mats.brass, 0, 0.3, 0);
      const d = diya(bd, 0, 0.55, 0);
      d.scale.setScalar(2.2);
      sh.add(bd);
    }
    // garlands across the niche and side walls
    garland(sh, new THREE.Vector3(-1.9, plinthH + 3.9, -D + 1.0), new THREE.Vector3(1.9, plinthH + 3.9, -D + 1.0), 0.6);
    garland(sh, new THREE.Vector3(-W / 2 + 0.9, plinthH + 3.6, -4.2), new THREE.Vector3(-W / 2 + 0.9, plinthH + 3.6, -D + 1.0), 0.5);
    garland(sh, new THREE.Vector3(W / 2 - 0.9, plinthH + 3.6, -4.2), new THREE.Vector3(W / 2 - 0.9, plinthH + 3.6, -D + 1.0), 0.5);
    // rows of floor diyas leading to the dais
    for (let i = 0; i < 8; i++) { diya(sh, -1.6, plinthH + 0.06, -4.4 - i * 0.55); diya(sh, 1.6, plinthH + 0.06, -4.4 - i * 0.55); }
    // scatter of petals (flat discs) on the sanctum floor
    const petalGeo = new THREE.CircleGeometry(0.06, 6);
    const petals = new THREE.InstancedMesh(petalGeo, mats.marigold, 260);
    const m4 = new THREE.Matrix4();
    const e = new THREE.Euler(-Math.PI / 2, 0, 0);
    const q = new THREE.Quaternion();
    for (let i = 0; i < 260; i++) {
      e.z = Math.random() * Math.PI;
      q.setFromEuler(e);
      const r = Math.random() * 3.6, a = Math.random() * Math.PI * 2;
      m4.compose(new THREE.Vector3(Math.cos(a) * r, plinthH + 0.045, dz + 1.4 + Math.sin(a) * r * 0.9), q, new THREE.Vector3(1, 1, 1));
      petals.setMatrixAt(i, m4);
    }
    sh.add(petals);
    root.add(sh);

    pointLight(0, 4.2, -1.6, 30, 14);
    pointLight(0, 2.8, dz + 0.3, 36, 16, 0xffb45a);
    pointLight(0, 4.8, -5.5, 10, 10);
  }

  return { group: root, flames, lights };
}
