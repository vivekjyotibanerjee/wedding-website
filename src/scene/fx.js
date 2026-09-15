import * as THREE from 'three';
import L from './landmarks.json';
import { tableSmokeSources } from './tables.js';
import { smooth } from './util.js';

// ─────────────────────────────────────────────────────────────────────────────
// Atmosphere (plan: layer C) — the parts of the wedding that fall, burn and drift: petals showered
// over the mandap, inside the nat-mandir and over the temple stair; the agni in the havan kund
// (crossed noise-flame planes, sparks, smoke, an ember bed and a flickering light); incense at
// the mandap and the shrine door. Everything is driven from the vertex shaders by `time`, so a
// thousand petals cost one draw call and no JS per frame; density and intensity follow the stage.
// ─────────────────────────────────────────────────────────────────────────────

const g = L.ground;
const [mx, , mz] = L.mandap.center;
const N = L.natmandir;
const pt = L.navaratna.platform_top;

// ── petals ───────────────────────────────────────────────────────────────────
// Each instance: where it starts (aOrigin), a phase, a fall speed and a flutter amplitude
// (aSeed), which emitter it belongs to and its rank within it (aEmit: emitter, rank) so density
// thins a shower evenly, and a colour (aKind). Ground petals (aSeed.y = 0) lie still.
const PETAL_VERT = /* glsl */ `
  uniform float time;
  uniform float density[4];
  uniform float height[4];
  uniform vec3 sunDir;
  attribute vec3 aOrigin;
  attribute vec4 aSeed;     // phase, speed (m/s; 0 = lying on the ground), flutter, spin
  attribute vec2 aEmit;     // emitter index, rank 0 → 1
  attribute float aKind;
  varying vec2 vUv;
  varying float vKind;
  varying float vShade;
  mat3 rot(vec3 a) {
    float cx = cos(a.x), sx = sin(a.x), cy = cos(a.y), sy = sin(a.y), cz = cos(a.z), sz = sin(a.z);
    return mat3(cy * cz, cy * sz, -sy,
                sx * sy * cz - cx * sz, sx * sy * sz + cx * cz, sx * cy,
                cx * sy * cz + sx * sz, cx * sy * sz - sx * cz, cx * cy);
  }
  void main() {
    vUv = uv;
    vKind = aKind;
    int e = int(aEmit.x + 0.5);
    float on = smoothstep(aEmit.y, aEmit.y + 0.08, density[e]);   // rank below density: present
    vec3 p = aOrigin;
    float scale = on;
    mat3 R;
    if (aSeed.y > 0.0) {
      float H = height[e];
      float life = fract((time * aSeed.y) / H + aSeed.x);           // 0 at the top, 1 on the ground
      float ph = aSeed.x * 6.2832;
      p.y += H * (1.0 - life);
      p.x += sin(time * 1.3 + ph) * aSeed.z + life * 0.9;            // flutter, and a drift on the wind
      p.z += cos(time * 0.9 + ph) * aSeed.z * 0.8 + life * 0.35;
      scale *= smoothstep(0.0, 0.06, life) * smoothstep(1.0, 0.94, life);
      R = rot(vec3(time * aSeed.w + ph, ph * 2.0, time * aSeed.w * 0.7 + ph));
    } else {
      R = rot(vec3(-1.5708 + 0.25 * sin(aSeed.x * 40.0), 0.0, aSeed.x * 6.2832));
    }
    vec3 n = normalize(R * vec3(0.0, 0.0, 1.0));
    vShade = 0.62 + 0.38 * abs(dot(n, sunDir));
    vec3 v = R * (position * scale);
    gl_Position = projectionMatrix * viewMatrix * vec4(p + v, 1.0);
  }
`;
const PETAL_FRAG = /* glsl */ `
  uniform float night;
  varying vec2 vUv;
  varying float vKind;
  varying float vShade;
  void main() {
    vec2 q = vUv - 0.5;
    // a petal: an ellipse pinched to a point at its base
    float r = length(vec2(q.x / (0.42 + 0.18 * (vUv.y - 0.2)), q.y / 0.5));
    if (r > 1.0) discard;
    int k = int(vKind + 0.5);
    vec3 c = k == 0 ? vec3(0.78, 0.06, 0.1) : k == 1 ? vec3(0.95, 0.42, 0.55) : k == 2 ? vec3(1.0, 0.72, 0.1)
           : k == 3 ? vec3(1.0, 0.45, 0.05) : k == 4 ? vec3(0.98, 0.95, 0.88) : vec3(0.92, 0.55, 0.75);
    c *= 0.85 + 0.25 * (1.0 - r);                 // darker at the edge
    c *= mix(vShade, 0.45, night);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ── the agni ─────────────────────────────────────────────────────────────────
// Crossed flame planes with two octaves of value noise licking upward, colour by height and
// by distance from the core; the tip tapers and tears. Drawn additive, bright enough to bloom.
const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
`;
const FIRE_VERT = /* glsl */ `
  uniform float time;
  uniform float intensity;
  attribute float aPhase;
  varying vec2 vUv;
  varying float vPhase;
  void main() {
    vUv = uv;
    vPhase = aPhase;
    vec3 p = position;
    float h = uv.y;
    p.x += sin(time * 2.6 + aPhase * 6.2832 + h * 5.0) * 0.06 * h * h;
    p.y *= 0.75 + 0.25 * intensity + 0.06 * sin(time * 7.0 + aPhase * 9.0);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  }
`;
const FIRE_FRAG = /* glsl */ `
  uniform float time;
  uniform float intensity;
  varying vec2 vUv;
  varying float vPhase;
  ${NOISE}
  void main() {
    float y = vUv.y;
    float n1 = vnoise(vec2(vUv.x * 3.0 + vPhase * 7.0, y * 3.5 - time * 1.7));
    float n2 = vnoise(vec2(vUv.x * 7.0 - vPhase * 3.0, y * 8.0 - time * 2.8));
    float d = (n1 - 0.5) * 0.28 + (n2 - 0.5) * 0.1;
    float xc = vUv.x - 0.5 + d * (0.3 + y);
    float w = 0.3 * pow(1.0 - y, 0.55) + 0.015;
    float edge = abs(xc) / w;
    float body = smoothstep(1.0, 0.45, edge) * smoothstep(1.0, 0.55 - 0.3 * n1, y) * smoothstep(0.0, 0.06, y);
    float core = smoothstep(0.75, 0.0, edge) * smoothstep(0.85, 0.05, y);
    vec3 outer = vec3(1.0, 0.22, 0.02), mid = vec3(1.0, 0.62, 0.08), inner = vec3(1.0, 0.95, 0.72);
    vec3 col = mix(outer, mid, smoothstep(0.9, 0.3, edge));
    col = mix(col, inner, core * 0.9);
    float a = body * intensity * (0.85 + 0.15 * n2);
    gl_FragColor = vec4(col * 2.6 * a, a);
  }
`;
// Sparks: points that rise from the fire, drift, brighten then die; each lives 1–3 s.
const SPARK_VERT = /* glsl */ `
  uniform float time;
  uniform float intensity;
  uniform float scale;
  attribute vec4 aSeed;     // phase, life (s), drift x, drift z
  varying float vA;
  void main() {
    float t = fract(time / aSeed.y + aSeed.x);
    float ph = aSeed.x * 6.2832;
    vec3 p = position;
    p.y += t * (1.1 + 0.9 * fract(aSeed.x * 13.0)) + 0.4 * t * t;
    p.x += aSeed.z * t + sin(time * 5.0 + ph) * 0.05 * t;
    p.z += aSeed.w * t + cos(time * 4.1 + ph) * 0.05 * t;
    float birth = step(aSeed.x * 0.9, intensity);              // more sparks as the fire grows
    vA = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.55, 1.0, t)) * birth * intensity;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = scale * 0.022 * (1.0 - 0.5 * t) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const SPARK_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.3, d) * vA;
    gl_FragColor = vec4(vec3(1.0, 0.6, 0.15) * 3.0 * a, a);
  }
`;
// Smoke and incense: soft billboard puffs that rise, curl, expand and thin; one mesh, several
// sources, each with its own `on`.
const SMOKE_VERT = /* glsl */ `
  uniform float time;
  uniform float on[NSMOKE];
  attribute vec3 aOrigin;
  attribute vec4 aSeed;     // phase, rise (m), spread (m), size (m)
  attribute float aSrc;
  varying vec2 vUv;
  varying float vA;
  void main() {
    vUv = uv;
    int s = int(aSrc + 0.5);
    float life = fract(time * 0.11 / (aSeed.y / 2.5) + aSeed.x);
    float ph = aSeed.x * 6.2832;
    vec3 p = aOrigin;
    p.y += life * aSeed.y;
    p.x += sin(life * 3.0 + ph) * aSeed.z * life + sin(time * 0.5 + ph) * 0.05 * life;
    p.z += cos(life * 2.3 + ph) * aSeed.z * life;
    float sz = aSeed.w * (0.3 + 1.2 * life);
    vA = on[s] * smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.35, 1.0, life)) * 0.55;
    vec4 c = modelViewMatrix * vec4(p, 1.0);
    float a = ph + time * 0.15;
    vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy * sz;
    gl_Position = projectionMatrix * (c + vec4(q, 0.0, 0.0));
  }
`;
const SMOKE_FRAG = /* glsl */ `
  uniform float night;
  varying vec2 vUv;
  varying float vA;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.15, d) * vA;
    gl_FragColor = vec4(mix(vec3(0.66, 0.6, 0.56), vec3(0.3, 0.26, 0.28), night), a);
  }
`;
// The ember bed in the kund: a disc that pulses under the flames.
const EMBER_FRAG = /* glsl */ `
  uniform float time;
  uniform float intensity;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float n = vnoise(vUv * 9.0 + vec2(0.0, time * 0.3)) * 0.6 + vnoise(vUv * 23.0 - time * 0.2) * 0.4;
    float glow = smoothstep(1.0, 0.2, d) * (0.5 + 0.5 * n) * (0.85 + 0.15 * sin(time * 3.7 + n * 9.0));
    vec3 c = mix(vec3(0.4, 0.03, 0.0), vec3(1.0, 0.55, 0.1), glow) * (0.2 + 2.2 * glow) * intensity;
    gl_FragColor = vec4(c, intensity);
  }
`;

/** Smooth 1-D value noise in JS for the light flicker (not a sine: no visible pulse). */
function noise1(t) {
  const i = Math.floor(t), f = t - i;
  const h = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

export function buildFx(scene, { reducedMotion = false, quality = 'high', sunDir } = {}) {
  const root = new THREE.Group();
  root.name = 'fx';
  const disposables = [];
  const time = { value: 0 };
  const night = { value: 0 };
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);

  const counts = { high: [1000, 320, 12, 90, 10], medium: [420, 180, 10, 60, 8], low: [160, 90, 6, 30, 0] }[quality];
  const [nFall, nGround, nFlames, nSparks, nSmoke] = counts;

  // ── petals ─────────────────────────────────────────────────────────────────
  // Emitters: 0 over the mandap, 1 inside the nat-mandir, 2 over the temple stair, 3 the ground
  // scatter round the mandap (still).
  const petalU = { time, night, density: { value: [0, 0, 0, 0] }, height: { value: [7.5, 5.2, 7.0, 0] }, sunDir: { value: sunDir || new THREE.Vector3(0, 1, 0) } };
  {
    const boxes = [
      { n: Math.round(nFall * 0.5), x: [mx - 6.5, mx + 6.5], z: [mz - 6.5, mz + 6.5], y: g + 0.02 },
      { n: Math.round(nFall * 0.3), x: [N.west_face_x + 1.5, N.west_face_x + N.size[0] - 1.5], z: [N.center[2] - N.size[1] / 2 + 1.5, N.center[2] + N.size[1] / 2 - 1.5], y: N.plinth_top + 0.02 },
      { n: Math.round(nFall * 0.2), x: [-7, 7], z: [4, 16], y: pt - 1.5 },
    ];
    const items = [];
    boxes.forEach((b, e) => {
      for (let i = 0; i < b.n; i++) items.push({ o: [b.x[0] + Math.random() * (b.x[1] - b.x[0]), b.y, b.z[0] + Math.random() * (b.z[1] - b.z[0])], seed: [Math.random(), 0.35 + Math.random() * 0.4, 0.15 + Math.random() * 0.25, 0.8 + Math.random() * 1.6], emit: [e, i / b.n], kind: Math.floor(Math.random() * 6) });
    });
    for (let i = 0; i < nGround; i++) {
      // on the paving round the mandap, thicker near the steps, and on the stage top
      const onStage = i % 4 === 0;
      const a = Math.random() * Math.PI * 2, r = onStage ? Math.random() * 2.4 : 3.2 + Math.pow(Math.random(), 0.6) * 4.5;
      items.push({ o: [mx + Math.cos(a) * r, (onStage ? L.mandap.stage_top : g) + 0.015, mz + Math.sin(a) * r], seed: [Math.random(), 0, 0, 0], emit: [3, i / nGround], kind: Math.floor(Math.random() * 6) });
    }
    const n = items.length;
    const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(0.055, 0.08));
    const origin = new Float32Array(n * 3), seed = new Float32Array(n * 4), emit = new Float32Array(n * 2), kind = new Float32Array(n);
    items.forEach((it, i) => { origin.set(it.o, i * 3); seed.set(it.seed, i * 4); emit.set(it.emit, i * 2); kind[i] = it.kind; });
    geo.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origin, 3));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    geo.setAttribute('aEmit', new THREE.InstancedBufferAttribute(emit, 2));
    geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));
    geo.instanceCount = n;
    const mat = new THREE.ShaderMaterial({ vertexShader: PETAL_VERT, fragmentShader: PETAL_FRAG, uniforms: petalU, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    root.add(mesh);
    disposables.push(geo, mat);
  }

  // ── the agni ───────────────────────────────────────────────────────────────
  const fireU = { time, intensity: { value: 0 } };
  const fireLight = new THREE.PointLight(0xff8a30, 0, 10, 1.7);
  const fireAt = new THREE.Vector3(mx, L.mandap.stage_top + 0.42, mz);   // the kund's rim (build_mandap: stage + 0.39 + 0.05)
  {
    const geo = new THREE.PlaneGeometry(0.5, 0.85, 1, 6);
    geo.translate(0, 0.425, 0);
    const phase = new Float32Array(nFlames);
    for (let i = 0; i < nFlames; i++) phase[i] = Math.random();
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    const mat = new THREE.ShaderMaterial({ vertexShader: FIRE_VERT, fragmentShader: FIRE_FRAG, uniforms: fireU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const flames = new THREE.InstancedMesh(geo, mat, nFlames);
    for (let i = 0; i < nFlames; i++) {
      const a = (i / nFlames) * Math.PI, r = 0.06 + 0.08 * Math.random(), b = Math.random() * Math.PI * 2;
      _q.setFromEuler(new THREE.Euler(0, a, 0));
      const s = 0.8 + 0.4 * Math.random();
      _m.compose(_p.set(fireAt.x + Math.cos(b) * r, fireAt.y - 0.02, fireAt.z + Math.sin(b) * r), _q, _s.set(s, s * (0.85 + 0.5 * Math.random()), 1));
      flames.setMatrixAt(i, _m);
    }
    flames.frustumCulled = false;
    root.add(flames);
    disposables.push(geo, mat);
    // ember bed
    const eGeo = new THREE.CircleGeometry(0.24, 16);
    eGeo.rotateX(-Math.PI / 2);
    const eMat = new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: EMBER_FRAG, uniforms: fireU, transparent: true, depthWrite: false });
    const ember = new THREE.Mesh(eGeo, eMat);
    ember.position.set(fireAt.x, fireAt.y - 0.03, fireAt.z);
    root.add(ember);
    disposables.push(eGeo, eMat);
    // sparks
    const sGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(nSparks * 3), seed = new Float32Array(nSparks * 4);
    for (let i = 0; i < nSparks; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.12;
      pos.set([fireAt.x + Math.cos(a) * r, fireAt.y + 0.1, fireAt.z + Math.sin(a) * r], i * 3);
      seed.set([Math.random(), 1 + Math.random() * 2, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5], i * 4);
    }
    sGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const sMat = new THREE.ShaderMaterial({ vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, uniforms: { time, intensity: { value: 0 }, scale: { value: 300 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const sparks = new THREE.Points(sGeo, sMat);
    sparks.frustumCulled = false;
    root.add(sparks);
    disposables.push(sGeo, sMat);
    fireU.sparkScale = sMat.uniforms.scale;
    fireU.sparks = sMat.uniforms.intensity;
    fireLight.position.set(fireAt.x, fireAt.y + 0.5, fireAt.z);   // always visible (intensity 0 when out): no shader recompile when it lights
    if (quality !== 'low') root.add(fireLight);
  }

  // ── smoke and incense ──────────────────────────────────────────────────────
  // Sources: 0 the agni; 1–2 incense on the mandap stage's front corners; 3–4 incense either side of
  // the shrine door; 5 incense at the Radhakanta's north door (the first threshold the walk crosses);
  // then the tables' (tables.js: the puja table's dhunuchi and incense), each with the transition
  // and window it follows.
  const tableSmoke = tableSmokeSources();
  const [dx, , dz] = L.sanctum.door;
  const R = L.radhakanta;
  const rDoor0 = R.center[2] - (R.bays_west - 1) / 2 * R.bay_pitch;
  const sources = [
    { o: [fireAt.x, fireAt.y + 0.6, fireAt.z], n: nSmoke, rise: 2.6, spread: 0.35, size: 0.45 },
    { o: [mx - L.mandap.width / 2 + 0.35, L.mandap.stage_top + 0.5, mz - 1.9], n: 14, rise: 1.6, spread: 0.22, size: 0.3 },
    { o: [mx - L.mandap.width / 2 + 0.35, L.mandap.stage_top + 0.5, mz + 1.9], n: 14, rise: 1.6, spread: 0.22, size: 0.3 },
    { o: [dx - 1.35, pt + 0.5, dz + 0.55], n: 14, rise: 1.7, spread: 0.22, size: 0.3 },
    { o: [dx + 1.35, pt + 0.5, dz + 0.55], n: 14, rise: 1.7, spread: 0.22, size: 0.3 },
    { o: [R.west_face_x - R.plinth_out + 0.35, R.plinth_top + 0.5, rDoor0 + 1.5], n: 14, rise: 1.6, spread: 0.22, size: 0.3 },
    ...tableSmoke,
  ];
  const smokeU = { time, night, on: { value: new Array(sources.length).fill(0) } };
  {
    const items = [];
    sources.forEach((s, k) => { for (let i = 0; i < s.n; i++) items.push({ o: s.o, seed: [Math.random(), s.rise * (0.85 + 0.3 * Math.random()), s.spread * (0.7 + 0.6 * Math.random()), s.size * (0.7 + 0.6 * Math.random())], src: k }); });
    const n = items.length;
    const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
    const origin = new Float32Array(n * 3), seed = new Float32Array(n * 4), src = new Float32Array(n);
    items.forEach((it, i) => { origin.set(it.o, i * 3); seed.set(it.seed, i * 4); src[i] = it.src; });
    geo.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origin, 3));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    geo.setAttribute('aSrc', new THREE.InstancedBufferAttribute(src, 1));
    geo.instanceCount = n;
    const mat = new THREE.ShaderMaterial({ vertexShader: SMOKE_VERT.replace('NSMOKE', sources.length), fragmentShader: SMOKE_FRAG, uniforms: smokeU, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    root.add(mesh);
    disposables.push(geo, mat);
  }

  scene.add(root);

  function update(dt, stage, n) {
    if (!reducedMotion) time.value += dt;
    night.value = n;
    const t = time.value;
    // petals: the ceremony shower over the mandap, then inside the nat-mandir, thinning toward the
    // finale on the stair; none while motion is reduced (they would hang in the air)
    const d = petalU.density.value;
    const motion = reducedMotion ? 0 : 1;
    d[0] = stage.ceremony * (1 - 0.6 * stage.full) * motion;
    d[1] = stage.full * (1 - 0.5 * stage.finale) * motion;
    d[2] = stage.finale * 0.5 * (1 - 0.7 * Math.max(0, (stage.effective - 0.97) / 0.03)) * motion;
    d[3] = Math.min(1, stage.ceremony * 0.6 + stage.full * 0.4);
    // the agni: lit with the ceremony, flickering on smoothed noise
    const fire = stage.ceremony;
    fireU.intensity.value = fire;
    const flick = noise1(t * 6.0) * 0.6 + noise1(t * 17.0) * 0.4;
    fireLight.intensity = fire * (11 + 6 * flick);
    fireU.sparks.value = fire * motion;
    // smoke: the agni's with the fire, the mandap incense with the mandap, the shrine's always
    const on = smokeU.on.value;
    on[0] = fire * motion * (nSmoke ? 1 : 0);
    on[1] = on[2] = stage.mandap * motion;
    on[3] = on[4] = motion;
    on[5] = stage.prep * motion;
    tableSmoke.forEach((s, k) => { on[6 + k] = smooth(s.on[0], s.on[1], stage[s.group]) * motion; });
  }
  function resize(height) { fireU.sparkScale.value = height * 0.5; }

  return {
    update, resize,
    dispose() { scene.remove(root); for (const d of disposables) d.dispose(); },
  };
}
