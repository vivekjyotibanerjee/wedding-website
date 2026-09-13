import * as THREE from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';

/** BoxGeometry whose UVs are in metres so a 1m brick texture tiles consistently. */
export function worldBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    if (nx >= ny && nx >= nz) uv.setXY(i, z, y);
    else if (ny >= nx && ny >= nz) uv.setXY(i, x, z);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
  return g;
}

/**
 * Bengali chala roof: four curved slopes, eaves that droop toward the corners.
 * Sits with its eave-centre at y=0, spans [-w/2,w/2] × [-d/2,d/2].
 */
export function chalaRoof(w, d, peak, droop = 0.5, overhang = 0.5, segs = 28) {
  const hw = w / 2 + overhang, hd = d / 2 + overhang;
  const fn = (u, v, target) => {
    const a = u * 2 - 1, b = v * 2 - 1; // [-1,1]
    const m = Math.max(Math.abs(a), Math.abs(b));
    // convex bulge toward the peak, corners droop
    const y = peak * Math.pow(1 - m, 1.25) - droop * (a * a * b * b);
    target.set(a * hw, y, b * hd);
  };
  const g = new ParametricGeometry(fn, segs, segs);
  g.computeVertexNormals();
  return g;
}

/** Underside/thickness for a chala roof: same surface pushed down a little, flipped. */
export function chalaRoofUnder(w, d, peak, droop = 0.5, overhang = 0.5, thick = 0.22, segs = 20) {
  const g = chalaRoof(w, d, peak - thick, droop, overhang, segs);
  g.translate(0, -thick, 0);
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  g.computeVertexNormals();
  return g;
}

/** Curvilinear ratna tower (small rekha-style spire with amalaka + kalasha). */
export function ratnaTower(baseR, height, segs = 24) {
  const pts = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // slow taper then curve in sharply near the top
    const r = baseR * (1 - Math.pow(t, 2.6) * 0.72);
    pts.push(new THREE.Vector2(r, t * height));
  }
  const g = new THREE.LatheGeometry(pts, segs);
  return g;
}

export function amalaka(r, h = 0.16, segs = 24) {
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(r * 0.9, 0), new THREE.Vector2(r, h * 0.5), new THREE.Vector2(r * 0.9, h), new THREE.Vector2(0, h)];
  return new THREE.LatheGeometry(pts, segs);
}

export function kalasha(r, h, segs = 16) {
  const pts = [
    new THREE.Vector2(0, 0), new THREE.Vector2(r * 0.7, 0), new THREE.Vector2(r * 0.55, h * 0.12),
    new THREE.Vector2(r, h * 0.4), new THREE.Vector2(r * 0.9, h * 0.6), new THREE.Vector2(r * 0.35, h * 0.72),
    new THREE.Vector2(r * 0.45, h * 0.8), new THREE.Vector2(r * 0.12, h * 0.9), new THREE.Vector2(0, h),
  ];
  return new THREE.LatheGeometry(pts, segs);
}

/**
 * Multi-foil (cusped) pointed arch outline as a THREE.Path, opening centred at (cx, 0),
 * width w, total height h, `foils` cusps across the head. Returned path is closed, CCW.
 */
export function cuspedArchPath(cx, w, h, foils = 5, springRatio = 0.55) {
  const hw = w / 2;
  const spring = h * springRatio;
  // Sample a pointed arch head from left spring to right spring via two quadratic curves.
  const head = [];
  const N = foils * 2;
  const left = new THREE.Vector2(cx - hw, spring);
  const right = new THREE.Vector2(cx + hw, spring);
  const apex = new THREE.Vector2(cx, h);
  const cl = new THREE.Vector2(cx - hw, h * 0.95);
  const cr = new THREE.Vector2(cx + hw, h * 0.95);
  const qc = (p0, p1, p2, t) => new THREE.Vector2(
    (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x,
    (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y,
  );
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    head.push(t <= 0.5 ? qc(left, cl, apex, t * 2) : qc(apex, cr, right, (t - 0.5) * 2));
  }
  // Build outline: bottom-left → up left side → cusps over the head → down right side.
  const path = new THREE.Path();
  path.moveTo(cx - hw, 0);
  path.lineTo(left.x, left.y);
  const centre = new THREE.Vector2(cx, spring);
  for (let i = 0; i < N; i += 2) {
    const A = head[i], B = head[i + 2];
    const M = A.clone().add(B).multiplyScalar(0.5);
    const c = A.distanceTo(B) / 2;           // half chord
    const sag = c * 0.62;                     // bulge depth (< c → shallower than a semicircle)
    const R = (c * c + sag * sag) / (2 * sag);
    // outward normal = away from the opening centre
    const n = M.clone().sub(centre).normalize();
    const C = M.clone().sub(n.clone().multiplyScalar(R - sag)); // arc centre sits inside the opening
    const a0 = Math.atan2(A.y - C.y, A.x - C.x);
    let a1 = Math.atan2(B.y - C.y, B.x - C.x);
    let d = a1 - a0;
    while (d <= -Math.PI) d += Math.PI * 2;
    while (d > Math.PI) d -= Math.PI * 2;
    const steps = 6;
    for (let s = 1; s <= steps; s++) {
      const a = a0 + (d * s) / steps;
      path.lineTo(C.x + Math.cos(a) * R, C.y + Math.sin(a) * R);
    }
  }
  path.lineTo(cx + hw, 0);
  path.closePath();
  return path;
}

/** A wall (in the XY plane, extruded along -Z) with cusped arch openings. */
export function archedWallGeometry(width, height, depth, arches) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  shape.closePath();
  for (const a of arches) {
    const p = cuspedArchPath(a.x, a.w, a.h, a.foils ?? 5);
    shape.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 });
  g.translate(0, 0, -depth);
  return g;
}

/** A plain wall segment in the XY plane extruded along -Z, with world UVs (via ExtrudeGeometry). */
export function wallGeometry(width, height, depth) {
  return archedWallGeometry(width, height, depth, []);
}

/** Octagonal column with base and capital. */
export function column(h, r = 0.26) {
  const grp = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, h - 0.7, 8), null);
  shaft.position.y = 0.35 + (h - 0.7) / 2;
  const base = new THREE.Mesh(new THREE.BoxGeometry(r * 2.6, 0.35, r * 2.6), null);
  base.position.y = 0.175;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(r * 2.8, 0.35, r * 2.8), null);
  cap.position.y = h - 0.175;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.15, r * 0.85, 0.22, 8), null);
  neck.position.y = h - 0.35 - 0.11;
  grp.add(shaft, base, cap, neck);
  return grp;
}

/** Points along a sagging garland between two points. */
export function garlandPoints(a, b, sag, count) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  return pts;
}

/** Semicircular (Roman) arch outline as a closed path, opening centred at (cx, 0). */
export function roundArchPath(cx, w, h) {
  const r = w / 2;
  const spring = Math.max(0.01, h - r);
  const p = new THREE.Path();
  p.moveTo(cx - r, 0);
  p.lineTo(cx - r, spring);
  p.absarc(cx, spring, r, Math.PI, 0, true);
  p.lineTo(cx + r, 0);
  p.closePath();
  return p;
}

/** Wall in the XY plane, extruded along -Z, with round-arch openings. */
export function roundArchWall(width, height, depth, arches) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  shape.closePath();
  for (const a of arches) shape.holes.push(roundArchPath(a.x, a.w, a.h));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 });
  g.translate(0, 0, -depth);
  return g;
}

/**
 * Bengali "bow" parapet: a wall slab whose top edge arcs from h0 at the corners to h1 in the middle
 * (the curved cornice seen on every storey at Dakshineswar). XY plane, extruded along -Z.
 */
export function bowParapet(width, h0, h1, depth, band = 0) {
  const hw = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0);
  shape.lineTo(hw, 0);
  shape.lineTo(hw, h0);
  shape.quadraticCurveTo(0, h1 + (h1 - h0) * 0.9, -hw, h0);
  shape.closePath();
  if (band > 0) {
    // return only the band strip along the curve (for the coloured trim)
    const s2 = new THREE.Shape();
    s2.moveTo(hw, h0 - band);
    s2.quadraticCurveTo(0, h1 + (h1 - h0) * 0.9 - band, -hw, h0 - band);
    s2.lineTo(-hw, h0);
    s2.quadraticCurveTo(0, h1 + (h1 - h0) * 0.9, hw, h0);
    s2.closePath();
    const g = new THREE.ExtrudeGeometry(s2, { depth, bevelEnabled: false, curveSegments: 24 });
    g.translate(0, 0, -depth);
    return g;
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 });
  g.translate(0, 0, -depth);
  return g;
}

/**
 * Bulging four-sided dome (the char-chala roof of the Shiva temples): convex faces, four ridges.
 * Base at y=0 spanning [-w/2,w/2]², peak at `peak`.
 */
export function bulgeRoof(w, d, peak, overhang = 0.25, segs = 28) {
  const hw = w / 2 + overhang, hd = d / 2 + overhang;
  const fn = (u, v, target) => {
    const a = u * 2 - 1, b = v * 2 - 1;
    const m = Math.max(Math.abs(a), Math.abs(b));
    const y = peak * Math.sqrt(Math.max(0, 1 - m * m * m * m)) ;
    target.set(a * hw, y, b * hd);
  };
  const g = new ParametricGeometry(fn, segs, segs);
  g.computeVertexNormals();
  return g;
}

/**
 * Dakshineswar-style ratna: ribbed bulbous spire that tapers to a point.
 * Lathe profile from radius r at y=0 to a point at y=h, with `ribs` horizontal ridges.
 */
export function ribbedSpire(r, h, ribs = 14, segs = 24) {
  const pts = [];
  const n = ribs * 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // bulge slightly then taper: a squashed ogee
    const base = r * (1 + 0.08 * Math.sin(t * Math.PI)) * Math.pow(1 - t, 0.55);
    const rib = 1 + 0.07 * Math.sin(t * Math.PI * 2 * ribs);
    pts.push(new THREE.Vector2(Math.max(0.001, base * rib), t * h));
  }
  pts.push(new THREE.Vector2(0, h));
  return new THREE.LatheGeometry(pts, segs);
}

/** Smooth bulbous dome (for the Shiva temple upper tier). */
export function onionDome(r, h, segs = 24) {
  const pts = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const rr = r * (1 + 0.1 * Math.sin(t * Math.PI)) * Math.pow(1 - t, 0.5);
    pts.push(new THREE.Vector2(Math.max(0.001, rr), t * h));
  }
  pts.push(new THREE.Vector2(0, h));
  return new THREE.LatheGeometry(pts, segs);
}
