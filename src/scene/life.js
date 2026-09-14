import * as THREE from 'three';
import L from './landmarks.json';
import { alponaCanvas } from '../ornament.js';

// ─────────────────────────────────────────────────────────────────────────────
// Everything that moves or glows, layered over the baked model at runtime so the glb stays a
// static bake: diyas with flickering flames, string lights swagged between the arches, warm
// light in the halls' doorways and inside them, the lamp posts, fireflies, birds over the spires,
// the flag on the central ratna, wind in the mandap drapes, ripples on the river, alpona painted
// on the ground, and the shrine in the navaratna's sanctum — the deity as a lit picture (a photo
// or painting the owner drops in as public/images/bhavatarini.jpg; without it the chamber is
// simply lit). Positions come from landmarks.json like the camera path does.
// ─────────────────────────────────────────────────────────────────────────────

const g = L.ground;
const [mx, , mz] = L.mandap.center;
const nx = L.natmandir.west_face_x;
const [ncx, , nz] = L.natmandir.center;
const [nw, nd] = L.natmandir.size;
const nPlinth = L.natmandir.plinth_top;
const rx = L.radhakanta.west_face_x;
const [rcx, , rz] = L.radhakanta.center;
const [, rd] = L.radhakanta.size;
const rPlinth = L.radhakanta.plinth_top;
const pt = L.navaratna.platform_top;
const wall = L.navaratna.wall_x;
const P = L.navaratna.platform;
const DEITY_URL = `${import.meta.env.BASE_URL}images/bhavatarini.jpg`;

// ── shaders ──────────────────────────────────────────────────────────────────
// Flames: camera-facing quads, each with its own flicker phase; drawn additive and bright so they
// bloom at night.
const FLAME_VERT = /* glsl */ `
  uniform float time;
  attribute float phase;
  varying vec2 vUv;
  varying float vFlick;
  void main() {
    vUv = uv;
    float f = 0.8 + 0.2 * sin(time * 9.0 + phase * 6.2832) * sin(time * 4.3 + phase * 12.0) + 0.1 * sin(time * 17.0 + phase * 40.0);
    vFlick = f;
    vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float lean = 0.15 * sin(time * 2.1 + phase * 9.0);
    vec2 p = position.xy * vec2(0.85 + 0.15 * f, 0.9 + 0.35 * f);
    p.x += lean * position.y;
    gl_Position = projectionMatrix * (c + vec4(p, 0.0, 0.0));
  }
`;
const FLAME_FRAG = /* glsl */ `
  uniform float bright;
  varying vec2 vUv;
  varying float vFlick;
  void main() {
    vec2 p = vUv - vec2(0.5, 0.0);
    float y = clamp(vUv.y, 0.0, 1.0);
    float w = 0.34 * sqrt(1.0 - y) * (1.0 - 0.4 * y) + 0.02;    // teardrop
    float d = abs(p.x) / w;
    float body = smoothstep(1.0, 0.55, d) * smoothstep(1.0, 0.85, y);
    float core = smoothstep(0.7, 0.0, d) * smoothstep(0.75, 0.15, y) * smoothstep(0.0, 0.12, y);
    vec3 col = mix(vec3(1.0, 0.42, 0.06), vec3(1.0, 0.9, 0.55), core);
    float a = body * (0.7 + 0.3 * vFlick);
    gl_FragColor = vec4(col * bright * a, a);
  }
`;
// Bulbs on the strings: a tiny glowing sphere, unlit (toneMapped off so the HDR value survives
// into the bloom threshold), dimmed to a dull glass when the sun is up.
const BULB_VERT = /* glsl */ `
  varying vec3 vN;
  void main() {
    vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const BULB_FRAG = /* glsl */ `
  uniform float night;
  varying vec3 vN;
  void main() {
    float rim = 0.6 + 0.4 * max(0.0, vN.z);
    vec3 off = vec3(0.72, 0.64, 0.5) * rim;
    vec3 on = vec3(1.0, 0.72, 0.36) * 4.5;
    gl_FragColor = vec4(mix(off, on, night), 1.0);
  }
`;
// Fireflies: soft points that blink, drifting slowly; only at night.
const FLY_VERT = /* glsl */ `
  uniform float time;
  uniform float night;
  uniform float scale;
  attribute float phase;
  varying float vA;
  void main() {
    vec3 p = position;
    p.x += sin(time * 0.35 + phase * 7.0) * 0.8;
    p.z += cos(time * 0.29 + phase * 5.0) * 0.8;
    p.y += sin(time * 0.6 + phase * 11.0) * 0.35;
    float blink = smoothstep(0.35, 0.9, sin(time * 1.7 + phase * 25.0));
    vA = blink * night;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = scale * (0.14 + 0.05 * blink) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const FLY_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.2, d) * vA;
    gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * 2.5 * a, a);
  }
`;
// Birds: a four-vertex silhouette whose wing tips flap; each instance carries its own phase.
const BIRD_VERT = /* glsl */ `
  uniform float time;
  attribute float phase;
  attribute float wing;     // 1 on the wing tips, 0 on the body
  void main() {
    vec3 p = position;
    p.y += wing * sin(time * 9.0 + phase * 6.2832) * 0.22;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  }
`;
const BIRD_FRAG = /* glsl */ `
  uniform float night;
  void main() { gl_FragColor = vec4(vec3(0.08, 0.07, 0.07), 1.0 - night); }
`;
// The pennant on the main spire: a plane that ripples away from its pole.
const FLAG_VERT = /* glsl */ `
  uniform float time;
  varying vec2 vUv;
  varying float vShade;
  void main() {
    vUv = uv;
    vec3 p = position;
    float k = uv.x;
    p.z += sin(uv.x * 7.0 - time * 5.0) * 0.12 * k + sin(uv.x * 3.0 - time * 2.4 + uv.y * 2.0) * 0.06 * k;
    p.y -= 0.06 * k * k;
    vShade = 0.75 + 0.25 * cos(uv.x * 7.0 - time * 5.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const FLAG_FRAG = /* glsl */ `
  uniform float night;
  varying vec2 vUv;
  varying float vShade;
  void main() {
    vec3 c = mix(vec3(0.72, 0.08, 0.06), vec3(0.95, 0.72, 0.2), step(0.86, vUv.x)) * vShade;   // red with a gold tip
    gl_FragColor = vec4(mix(c, c * 0.25, night), 1.0);
  }
`;

// ── helpers ──────────────────────────────────────────────────────────────────
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);

/** Points along a catenary-ish swag from a to b (both [x,y,z]), sagging `sag` metres. */
function swag(a, b, sag, step) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const n = Math.max(2, Math.round(len / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = A.clone().lerp(B, t);
    p.y -= sag * 4 * t * (1 - t);
    out.push(p);
  }
  return out;
}

function ghatY(x) {
  const [x0, y0] = L.ghat.foot, [x1, y1] = L.ghat.top;
  const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
  return y0 + (y1 - y0) * t;
}

// ─────────────────────────────────────────────────────────────────────────────
export function buildLife(scene, model, { reducedMotion = false } = {}) {
  const root = new THREE.Group();
  root.name = 'life';
  const uniforms = { time: { value: 0 }, night: { value: 0 } };
  const lights = [];          // PointLights on at night: { light, intensity }
  const disposables = [];

  // ── diyas ──────────────────────────────────────────────────────────────────
  const diyaSpots = [];
  {
    // the temple stair: one either side of every tread, then along the rail tops beside it
    const { stair_foot, stair_top, stair_width: sw, stair_steps: ns, stair_tread: tr } = L.navaratna;
    const rise = (pt - g) / ns;
    for (let k = 0; k < ns; k++) {
      const z = stair_foot[2] - tr * (k + 0.5);
      for (const s of [-1, 1]) diyaSpots.push([s * (sw / 2 - 0.35), g + rise * (k + 1), z]);
    }
    const zs = stair_top[2];                                   // platform south edge
    for (let x = sw / 2 + 0.6; x < P / 2 - 0.3; x += 0.7) for (const s of [-1, 1]) diyaSpots.push([s * x, pt + 1.0, zs]);
    // along the verandah, both sides of the central arch
    for (let x = -wall + 0.6; x <= wall - 0.5; x += 0.75) if (Math.abs(x) > 1.4) diyaSpots.push([x, pt, wall + 0.35]);
    // the halls' west stairs and plinth ledges, leaving the doorways the walk uses clear
    for (const [H, hx, hz, hd, top, clear] of [
      [L.natmandir, nx, nz, nd, nPlinth, (z) => z < nz - 3 * L.natmandir.bay_pitch + 1.5],              // the northmost door and the ledge north of it
      [L.radhakanta, rx, rz, rd, rPlinth, (z) => Math.abs(Math.abs(z - rz) - (L.radhakanta.bays_west - 1) / 2 * L.radhakanta.bay_pitch) < 1.6], // its northmost and southmost doors
    ]) {
      const { stair_width: hw, stair_steps: hn, stair_tread: ht, plinth_out } = H;
      const hr = (top - g) / hn;
      const x0 = hx - plinth_out - hn * ht;
      for (let k = 0; k < hn; k++) for (const s of [-1, 1]) diyaSpots.push([x0 + ht * (k + 0.5), g + hr * (k + 1), hz + s * (hw / 2 - 0.3)]);
      for (let z = hz - hd / 2 - plinth_out + 0.5; z < hz + hd / 2 + plinth_out - 0.4; z += 0.8) {
        if (Math.abs(z - hz) < hw / 2 + 0.4 || clear(z)) continue;                // skip the stair and the walk
        diyaSpots.push([hx - plinth_out + 0.3, top, z]);
      }
    }
    // the shrine: a row along the front of the dais and a pair either side of its door
    {
      const [dx, , dz] = L.sanctum.door;
      const front = dz - L.sanctum.depth + L.sanctum.dais_depth + 0.12;
      for (let x = -1.0; x <= 1.0; x += 0.5) diyaSpots.push([dx + x, L.sanctum.dais_top, front]);
      for (const s of [-1, 1]) diyaSpots.push([dx + s * (L.sanctum.arch[0] / 2 + 0.55), pt, dz + 0.45]);
    }
    // a ring round the mandap on the paving
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      diyaSpots.push([mx + Math.cos(a) * 5.0, g, mz + Math.sin(a) * 5.0]);
    }
    // the ghat's top edge, leaving the walk through the middle clear
    const gz = L.ghat.top[2], gw = L.ghat.width;
    for (let z = gz - gw / 2 + 0.8; z <= gz + gw / 2 - 0.8; z += 1.0) if (Math.abs(z - gz) > 2.6) diyaSpots.push([L.ghat.top[0] + 0.25, g, z]);
  }
  {
    const n = diyaSpots.length;
    const bowlGeo = new THREE.LatheGeometry(
      [new THREE.Vector2(0, 0), new THREE.Vector2(0.07, 0), new THREE.Vector2(0.1, 0.045), new THREE.Vector2(0.075, 0.05), new THREE.Vector2(0.06, 0.03), new THREE.Vector2(0, 0.03)], 10);
    const bowlMat = new THREE.MeshStandardMaterial({ color: 0x7a3d24, roughness: 0.9 });
    const bowls = new THREE.InstancedMesh(bowlGeo, bowlMat, n);
    bowls.castShadow = false;
    const flameGeo = new THREE.PlaneGeometry(0.08, 0.15);
    flameGeo.translate(0, 0.075 + 0.03, 0);
    const phases = new Float32Array(n);
    for (let i = 0; i < n; i++) phases[i] = Math.random();
    flameGeo.setAttribute('phase', new THREE.InstancedBufferAttribute(phases, 1));
    const flameMat = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, uniforms: { time: uniforms.time, bright: { value: 1.6 } },
    });
    const flames = new THREE.InstancedMesh(flameGeo, flameMat, n);
    flames.frustumCulled = false;
    diyaSpots.forEach((p, i) => {
      _m.compose(_p.set(p[0], p[1], p[2]), _q.identity(), _s.set(1, 1, 1));
      bowls.setMatrixAt(i, _m);
      flames.setMatrixAt(i, _m);
    });
    root.add(bowls, flames);
    disposables.push(bowlGeo, bowlMat, flameGeo, flameMat);
    uniforms.flameBright = flameMat.uniforms.bright;
  }

  // ── string lights ──────────────────────────────────────────────────────────
  const bulbPts = [];
  const wirePts = [];
  const addString = (pts, sag = 0.45) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const seg = swag(pts[i], pts[i + 1], sag, 0.32);
      for (let k = 0; k < seg.length; k++) {
        if (k) wirePts.push(seg[k - 1], seg[k]);
        if (k && k < seg.length - 1) bulbPts.push(seg[k]);
      }
    }
  };
  {
    // the nat-mandir's west face, bay to bay at the springing of the arches
    const y = nPlinth + L.natmandir.arch_spring + 0.35;
    const pitch = L.natmandir.bay_pitch, bays = L.natmandir.bays_west;
    const line = [];
    for (let i = 0; i <= bays; i++) line.push([nx - 0.12, y, nz + (i - bays / 2) * pitch]);
    addString(line);
    // its north face, seen from the plinth walk
    const zN = nz - nd / 2;
    addString([-1.5, 0, 1.5].map((k) => [ncx + k * 3.0, y, zN - 0.12]));
    // the Radhakanta's west face the same way
    const yr = rPlinth + L.radhakanta.arch_spring + 0.35;
    const rl = [];
    for (let i = 0; i <= L.radhakanta.bays_west; i++) rl.push([rx - 0.12, yr, rz + (i - L.radhakanta.bays_west / 2) * L.radhakanta.bay_pitch]);
    addString(rl);
    // and inside both halls, the walk goes through them: along the long walls, bay to bay
    for (const [H, hx, hz, top] of [[L.natmandir, nx, nz, nPlinth], [L.radhakanta, rx, rz, rPlinth]]) {
      const yi = Math.min(top + 0.9 + H.arch[1] + 0.5, top + (H.storey_h || H.height) - 0.55);   // above the windows, under the ceiling
      for (const x of [hx + 0.62, hx + H.size[0] - 0.62]) {
        const line = [];
        for (let i = 0; i <= H.bays_west; i++) line.push([x, yi, hz + (i - H.bays_west / 2) * H.bay_pitch]);
        addString(line, 0.4);
      }
    }
    // the navaratna's south and west arcades
    const yv = pt + L.navaratna.arch_spring + 0.3;
    const bp = L.navaratna.bay_pitch;
    const s = [], w = [];
    for (let i = 0; i <= 5; i++) { s.push([-wall + 0.5 + i * bp, yv, wall + 0.15]); w.push([-wall - 0.15, yv, wall - 0.5 - i * bp]); }
    addString(s, 0.35);
    addString(w, 0.35);
    // round the mandap canopy
    const h = L.mandap.width / 2 + 0.5, yc = L.mandap.canopy - 0.2;   // hung just under the garland
    addString([[mx - h, yc, mz - h], [mx + h, yc, mz - h], [mx + h, yc, mz + h], [mx - h, yc, mz + h], [mx - h, yc, mz - h]], 0.3);
    // the Shiva row: corner to corner along the temple fronts, both groups
    const xs = L.shiva.x + L.shiva.size / 2 + 0.2, ys = L.shiva.plinth_top + 5.2, hs = L.shiva.size / 2;
    for (const [first, dir] of [[L.shiva.first_north[2], -1], [L.shiva.first_south[2], 1]]) {
      const line = [];
      for (let i = 0; i < L.shiva.count; i++) {
        const zc = first + dir * i * L.shiva.pitch;
        line.push([xs, ys, zc - dir * hs], [xs, ys, zc + dir * hs]);
      }
      addString(line, 0.3);
    }
  }
  {
    const n = bulbPts.length;
    const geo = new THREE.SphereGeometry(0.04, 6, 5);
    const mat = new THREE.ShaderMaterial({ vertexShader: BULB_VERT, fragmentShader: BULB_FRAG, uniforms: { night: uniforms.night } });
    const bulbs = new THREE.InstancedMesh(geo, mat, n);
    bulbPts.forEach((p, i) => { _m.compose(p, _q.identity(), _s.set(1, 1, 1)); bulbs.setMatrixAt(i, _m); });
    bulbs.frustumCulled = false;
    const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePts);
    const wire = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x1a1410 }));
    wire.frustumCulled = false;
    root.add(bulbs, wire);
    disposables.push(geo, mat, wireGeo, wire.material);
  }

  // ── warm light in the doorways, inside the halls, the lamp posts ───────────
  // A glowing plane in every west doorway of both halls reads as lamplight inside; the walk goes
  // through three of them, so each plane fades out as the camera comes near (see update()).
  const spillColor = new THREE.Color(1.0, 0.66, 0.34).multiplyScalar(1.15);
  const spills = [];
  for (const [H, hx, hz, top] of [[L.natmandir, nx, nz, nPlinth], [L.radhakanta, rx, rz, rPlinth]]) {
    const [aw, ah] = H.arch;
    const geo = new THREE.PlaneGeometry(aw + 0.1, ah - 0.1);
    geo.rotateY(-Math.PI / 2);
    for (let i = 0; i < H.bays_west; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: spillColor, toneMapped: false, transparent: true, opacity: 0, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(hx + 0.25, top + ah / 2, hz + (i - (H.bays_west - 1) / 2) * H.bay_pitch);
      root.add(m);
      spills.push(m);
      disposables.push(mat);
    }
    disposables.push(geo);
    // and, for when the walk is inside, lamplight under the ceiling
    for (const k of [-0.25, 0.25]) {
      const light = new THREE.PointLight(0xffc27a, 0, 22, 1.6);
      light.position.set(hx + H.size[0] / 2, top + Math.min(H.height, H.storey_h || H.height) - 2.2, hz + k * H.size[1]);
      light.visible = false;
      root.add(light);
      lights.push({ light, intensity: 14 });
    }
  }
  for (const p of L.lamps) {
    const light = new THREE.PointLight(0xffc27a, 0, 16, 1.8);
    light.position.set(p[0], p[1], p[2]);
    light.visible = false;
    root.add(light);
    lights.push({ light, intensity: 28 });
  }
  const lampGlass = [];
  if (model) model.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material?.name || '';
    if (name === 'web_lamp_glass') {
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color(0xffb862);
      o.material.emissiveIntensity = 0;
      lampGlass.push(o.material);
    }
  });

  // ── the shrine ─────────────────────────────────────────────────────────────
  // Ma Kali in the sanctum: a picture on a plane over the dais, a soft halo behind it, and a
  // lamp in the chamber that is lit day and night. The picture is the owner's (DEITY_URL); if it
  // is not there the plane stays hidden and the chamber is just lit.
  const shrineLamp = new THREE.PointLight(0xffb070, 12, 9, 1.7);
  {
    const [dx, , dz] = L.sanctum.door;
    const back = dz - L.sanctum.depth;                              // the chamber's back wall
    const h = L.sanctum.height - (L.sanctum.dais_top - pt) - 0.4, w = h * 0.7;   // portrait, dais to ceiling
    const y = L.sanctum.dais_top + h / 2 + 0.05;
    const zp = back + 0.1;
    const haloCanvas = document.createElement('canvas');                // a soft radial glow
    haloCanvas.width = haloCanvas.height = 128;
    const hc = haloCanvas.getContext('2d');
    const grad = hc.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 200, 120, 0.9)');
    grad.addColorStop(0.5, 'rgba(255, 150, 70, 0.35)');
    grad.addColorStop(1, 'rgba(255, 120, 40, 0)');
    hc.fillStyle = grad;
    hc.fillRect(0, 0, 128, 128);
    const haloTex = new THREE.CanvasTexture(haloCanvas);
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 2.2, w * 2.2),
      new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    halo.position.set(dx, y + h * 0.1, zp - 0.02);
    halo.visible = false;                                               // shown with the picture
    root.add(halo);
    disposables.push(halo.geometry, halo.material, haloTex);
    const picMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true });
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), picMat);
    pic.position.set(dx, y, zp);
    pic.visible = false;
    root.add(pic);
    disposables.push(pic.geometry, picMat);
    new THREE.TextureLoader().load(DEITY_URL, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const a = tex.image.width / tex.image.height;                  // keep the picture's own proportions
      pic.scale.set(a > w / h ? 1 : (a * h) / w, a > w / h ? w / (a * h) : 1, 1);
      picMat.map = tex;
      picMat.needsUpdate = true;
      pic.visible = halo.visible = true;
      disposables.push(tex);
    }, undefined, () => { /* no picture yet: the chamber is lit, the dais bare */ });
    shrineLamp.position.set(dx, pt + L.sanctum.height * 0.6, dz - 1.6);
    root.add(shrineLamp);
  }

  // ── fireflies ──────────────────────────────────────────────────────────────
  {
    const zones = [
      [mx, mz, 7, 2.2], [L.shiva.x + 6, L.shiva.first_north[2] - 12, 4, 3.0], [L.shiva.x + 6, L.shiva.first_south[2] + 12, 4, 3.0],
      [L.ghat.top[0] + 4, L.ghat.top[2], 6, 2.5], [nx - 5, nz - 8, 4, 2.5], [nx - 5, nz + 8, 4, 2.5], [-6, nz - nd / 2 - 5, 5, 2.5],
    ];
    const n = zones.length * 26;
    const pos = new Float32Array(n * 3), phase = new Float32Array(n);
    let i = 0;
    for (const [zx, zz, r, h] of zones) for (let k = 0; k < 26; k++, i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r;
      pos[i * 3] = zx + Math.cos(a) * rr; pos[i * 3 + 1] = g + 0.3 + Math.random() * Math.min(h, 1.6); pos[i * 3 + 2] = zz + Math.sin(a) * rr;
      phase[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: FLY_VERT, fragmentShader: FLY_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { time: uniforms.time, night: uniforms.night, scale: { value: 300 } },
    });
    const flies = new THREE.Points(geo, mat);
    flies.frustumCulled = false;
    root.add(flies);
    disposables.push(geo, mat);
    uniforms.flyScale = mat.uniforms.scale;
  }

  // ── birds over the spires ──────────────────────────────────────────────────
  const birds = { mesh: null, n: 14, t0: [] };
  {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.32, 0, 0, -0.18, 0.55, 0.06, 0.02, -0.55, 0.06, 0.02], 3));
    geo.setAttribute('wing', new THREE.Float32BufferAttribute([0, 0, 1, 1], 1));
    geo.setIndex([0, 1, 2, 0, 3, 1]);
    const phase = new Float32Array(birds.n);
    for (let i = 0; i < birds.n; i++) { phase[i] = Math.random(); birds.t0.push(Math.random() * Math.PI * 2); }
    geo.setAttribute('phase', new THREE.InstancedBufferAttribute(phase, 1));
    const mat = new THREE.ShaderMaterial({ vertexShader: BIRD_VERT, fragmentShader: BIRD_FRAG, side: THREE.DoubleSide, transparent: true, uniforms: { time: uniforms.time, night: uniforms.night } });
    birds.mesh = new THREE.InstancedMesh(geo, mat, birds.n);
    birds.mesh.frustumCulled = false;
    root.add(birds.mesh);
    disposables.push(geo, mat);
  }
  const placeBirds = (t) => {
    const top = L.navaratna.top;
    for (let i = 0; i < birds.n; i++) {
      const flock = i < 8 ? 0 : 1;
      const a = birds.t0[i] + t * (flock ? -0.11 : 0.09);
      const r = (flock ? 34 : 22) + 4 * Math.sin(t * 0.13 + i);
      const cx = flock ? -14 : 2, cz = flock ? 8 : -4;
      _p.set(cx + Math.cos(a) * r, top + 4 + (flock ? 9 : 3) + 2.5 * Math.sin(t * 0.21 + i * 1.7), cz + Math.sin(a) * r);
      // heading along the circle
      const heading = a + (flock ? -1 : 1) * Math.PI / 2;
      _q.setFromEuler(new THREE.Euler(0, -heading + Math.PI / 2, 0));
      _m.compose(_p, _q, _s.set(1, 1, 1));
      birds.mesh.setMatrixAt(i, _m);
    }
    birds.mesh.instanceMatrix.needsUpdate = true;
  };
  placeBirds(0);

  // ── the flag on the central ratna ──────────────────────────────────────────
  {
    const top = L.navaratna.top;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.8, roughness: 0.35 }));
    pole.position.set(0, top + 1.0, 0);
    const geo = new THREE.PlaneGeometry(1.5, 0.6, 12, 2);
    geo.translate(0.75, 0, 0);
    const mat = new THREE.ShaderMaterial({ vertexShader: FLAG_VERT, fragmentShader: FLAG_FRAG, side: THREE.DoubleSide, uniforms: { time: uniforms.time, night: uniforms.night } });
    const flag = new THREE.Mesh(geo, mat);
    flag.position.set(0.03, top + 1.75, 0);
    flag.rotation.y = -Math.PI / 4;          // streaming away from the afternoon wind (from the river side)
    root.add(pole, flag);
    disposables.push(geo, mat, pole.geometry, pole.material);
  }

  // ── alpona on the ground ───────────────────────────────────────────────────
  {
    const canvas = alponaCanvas(1024, { ground: true });   // on a washed-geru disc, as on a courtyard floor
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const place = (x, y, z, r, rot = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), mat);
      m.rotation.set(-Math.PI / 2, 0, rot);
      m.position.set(x, y + 0.045, z);   // clear of the 3 cm path slabs
      m.receiveShadow = true;
      root.add(m);
      disposables.push(m.geometry);
    };
    // in front of the mandap's west stair, where the guests approach
    place(mx - L.mandap.width / 2 - 1.0 - 2.6, g, mz, 2.3);
    // on the nat-mandir's threshold ledge, before the central door
    place(nx - L.natmandir.plinth_out / 2 - 0.05, nPlinth, nz, 0.68);
    // the middle of each hall's floor
    place(ncx, nPlinth, nz, 2.6);
    place(rcx, rPlinth, rz, 2.6, Math.PI / 8);
    // the sanctum's threshold, in the corridor before its door
    place(L.sanctum.door[0], pt, L.sanctum.door[2] + (wall - 0.5 - L.sanctum.door[2]) / 2, 1.1);
    disposables.push(tex, mat);
  }

  // ── wind in the drapes, ripples on the river ───────────────────────────────
  const shaders = [];
  if (model) model.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.name || '';
    if (/drape.*sheet/.test(name)) {
      o.frustumCulled = false;
      o.material.onBeforeCompile = (sh) => {
        sh.uniforms.time = uniforms.time;
        sh.uniforms.drapeTop = { value: L.mandap.canopy };
        sh.uniforms.drapeH = { value: L.mandap.canopy - L.mandap.stage_top };
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float time; uniform float drapeTop; uniform float drapeH;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
            float hang = pow(clamp((drapeTop - wp.y) / drapeH, 0.0, 1.0), 1.4);
            float gust = 0.6 + 0.4 * sin(time * 0.37 + wp.x * 0.2);
            transformed.x += sin(time * 1.4 + wp.z * 1.3 + wp.y * 0.8) * 0.09 * hang * gust;
            transformed.z += sin(time * 1.1 + wp.x * 1.1 + wp.y * 0.6 + 1.7) * 0.09 * hang * gust;`);
        shaders.push(sh);
      };
      o.material.needsUpdate = true;
    } else if (name === 'river') {
      o.material.onBeforeCompile = (sh) => {
        sh.uniforms.time = uniforms.time;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float time; varying vec3 vWp;')
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            {
              vec2 p = vWp.xz;  // world x, z
              float t = time;
              float dx = 0.0, dz = 0.0;
              // a few crossing wave trains, long ones along the river (z) and short chop
              float w1 = cos(p.x * 0.9 + p.y * 0.35 + t * 1.1);
              float w2 = cos(p.x * 0.25 - p.y * 0.5 - t * 0.6 + 2.0 * sin(p.y * 0.05));
              float w3 = cos(p.x * 1.9 + p.y * 1.3 + t * 2.1 + 1.5 * w1);
              float w4 = cos(-p.x * 1.4 + p.y * 2.2 - t * 1.7 + 1.2 * w2);
              dx += w1 * 0.9 * 0.5 + w2 * 0.25 * 0.25 + w3 * 1.9 * 0.5 - w4 * 1.4 * 0.4;
              dz += w1 * 0.35 * 0.5 - w2 * 0.5 * 0.25 + w3 * 1.3 * 0.5 + w4 * 2.2 * 0.4;
              vec3 wn = normalize(vec3(-dx * 0.018, 1.0, -dz * 0.018));
              normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
            }`);
        shaders.push(sh);
      };
      o.material.needsUpdate = true;
    }
  });

  scene.add(root);

  // ── per-frame ──────────────────────────────────────────────────────────────
  let time = 0;
  function update(dt, night, eye = null) {
    if (!reducedMotion) time += dt;
    uniforms.time.value = time;
    uniforms.night.value = night;
    uniforms.flameBright.value = 1.2 + 1.6 * night;
    for (const m of spills) {
      const d = eye ? eye.distanceTo(m.position) : 99;
      m.material.opacity = 0.85 * night * THREE.MathUtils.smoothstep(d, 1.5, 4.5);   // gone by the time the walk reaches the doorway
    }
    shrineLamp.intensity = 12 + 10 * night;
    birds.mesh.visible = night < 0.6;
    for (const { light, intensity } of lights) { light.intensity = intensity * night; light.visible = night > 0.01; }   // off the shader by day
    for (const m of lampGlass) m.emissiveIntensity = 3.0 * night;
    if (!reducedMotion) placeBirds(time);
  }
  function resize(height) { uniforms.flyScale.value = height * 0.45; }

  return {
    update, resize,
    dispose() { scene.remove(root); for (const d of disposables) d.dispose(); },
  };
}
