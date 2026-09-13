import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { buildTemple } from './temple.js';
import { buildNature } from './nature.js';

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 glow;
  void main() {
    float h = clamp(vDir.y, -0.1, 1.0);
    vec3 c = mix(horizon, mid, smoothstep(0.0, 0.25, h));
    c = mix(c, top, smoothstep(0.2, 0.9, h));
    // warm glow behind the viewer (+z), fading around the horizon
    float az = max(0.0, vDir.z);
    c += glow * pow(az, 3.0) * (1.0 - smoothstep(0.0, 0.35, h)) * 0.9;
    // subtle stars up top
    vec2 p = vDir.xz / (vDir.y + 0.15);
    float star = step(0.9985, fract(sin(dot(floor(p * 90.0), vec2(12.9898, 78.233))) * 43758.5453));
    c += star * smoothstep(0.35, 0.8, h) * 0.55;
    gl_FragColor = vec4(c, 1.0);
  }
`;

// Camera path through the temple. Each segment of the Catmull-Rom spans an equal slice of t,
// so shorter segments (inside the shrine) move slower — that is intentional.
const PATH = [
  { p: [0.8, 1.75, 82], l: [0, 3.0, 40] },
  { p: [0.4, 1.75, 62], l: [0, 3.2, 40] },
  { p: [0.0, 1.8, 42], l: [0, 2.4, 24] },
  { p: [0.0, 2.35, 30], l: [0, 2.6, 14] },
  { p: [0.0, 2.35, 19.5], l: [0, 4.6, 0] },
  { p: [0.0, 1.95, 8], l: [0, 3.4, -1] },
  { p: [0.0, 2.75, 1.0], l: [0, 2.9, -8] },
  { p: [0.0, 2.7, -3.6], l: [0, 2.5, -9] },
  { p: [0.0, 2.55, -5.4], l: [0, 2.1, -9.4] },
];

export function createScene(canvas, { reducedMotion = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const fogColor = new THREE.Color(0x4a2c40);
  scene.fog = new THREE.FogExp2(fogColor, 0.0075);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);

  // Sky dome
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(320, 32, 16),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x120f2a) },
        mid: { value: new THREE.Color(0x3a2652) },
        horizon: { value: new THREE.Color(0x8a4a58) },
        glow: { value: new THREE.Color(0xff8a3c) },
      },
    }),
  );
  scene.add(sky);

  // Lights
  const hemi = new THREE.HemisphereLight(0x7a6aa0, 0x6a4a36, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc48e, 2.0);
  sun.position.set(28, 22, 60);
  sun.target.position.set(0, 0, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 160;
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // World
  const mats = createMaterials();
  mats.panel.map.repeat.set(0.5, 0.5);
  const temple = buildTemple(mats);
  const nature = buildNature(mats);
  scene.add(temple.group, nature.group);

  // Path curves
  const posCurve = new THREE.CatmullRomCurve3(PATH.map((n) => new THREE.Vector3(...n.p)), false, 'catmullrom', 0.5);
  const lookCurve = new THREE.CatmullRomCurve3(PATH.map((n) => new THREE.Vector3(...n.l)), false, 'catmullrom', 0.5);

  const state = {
    target: 0,       // progress requested by scroll
    progress: 0,     // smoothed
    velocity: 0,
    pointer: new THREE.Vector2(),
    pointerSmooth: new THREE.Vector2(),
    running: false,
    time: 0,
    last: performance.now(),
    walkPhase: 0,
  };

  const tmpPos = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();
  const tmpUp = new THREE.Vector3(0, 1, 0);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 68 : 58;
    camera.updateProjectionMatrix();
  }

  function frame(now) {
    if (!state.running) return;
    const dt = Math.min(0.05, (now - state.last) / 1000);
    state.last = now;
    state.time += dt;

    // Smooth progress toward scroll target
    const k = reducedMotion ? 1 : 1 - Math.pow(0.001, dt); // ~exponential ease
    const prev = state.progress;
    state.progress += (state.target - state.progress) * k;
    state.velocity = (state.progress - prev) / Math.max(dt, 1e-3);
    state.walkPhase += Math.abs(state.velocity) * 90 * dt;

    // Camera
    const t = THREE.MathUtils.clamp(state.progress, 0, 1);
    posCurve.getPoint(t, tmpPos);
    lookCurve.getPoint(t, tmpLook);
    if (!reducedMotion) {
      const bobAmt = THREE.MathUtils.clamp(Math.abs(state.velocity) * 12, 0, 1);
      tmpPos.y += Math.sin(state.walkPhase) * 0.035 * bobAmt + Math.sin(state.time * 0.9) * 0.01;
      tmpPos.x += Math.sin(state.walkPhase * 0.5) * 0.03 * bobAmt;
    }
    state.pointerSmooth.lerp(state.pointer, reducedMotion ? 1 : 0.06);
    tmpLook.x += state.pointerSmooth.x * 1.2;
    tmpLook.y += state.pointerSmooth.y * 0.7;
    camera.position.copy(tmpPos);
    camera.up.copy(tmpUp);
    camera.lookAt(tmpLook);

    // Flames flicker
    const fl = temple.flames;
    for (let i = 0; i < fl.length; i++) {
      const f = fl[i];
      const s = 0.85 + Math.sin(state.time * 11 + f.seed) * 0.1 + Math.sin(state.time * 23 + f.seed * 2) * 0.06;
      f.mesh.scale.set(0.55 * s, 1.25 * s, 0.55 * s);
    }
    for (let i = 0; i < temple.lights.length; i++) {
      const l = temple.lights[i];
      l.intensity = l.userData.base * (0.92 + Math.sin(state.time * 9 + i * 1.7) * 0.05 + Math.sin(state.time * 17 + i) * 0.03);
    }
    nature.update(state.time);

    sky.position.copy(camera.position);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  temple.lights.forEach((l) => (l.userData.base = l.intensity));

  return {
    ok: true,
    resize,
    setProgress(v) { state.target = THREE.MathUtils.clamp(v, 0, 1); },
    get progress() { return state.progress; },
    setPointer(x, y) { state.pointer.set(x, y); },
    start() {
      if (state.running) return;
      state.running = true;
      state.last = performance.now();
      requestAnimationFrame(frame);
    },
    stop() { state.running = false; },
    renderOnce() { resize(); renderer.render(scene, camera); },
    dispose() { state.running = false; renderer.dispose(); },
  };
}
