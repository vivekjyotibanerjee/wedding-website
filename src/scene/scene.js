import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { buildComplex } from './dakshineswar.js';
import { buildNature } from './nature.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform float night;
  uniform vec3 sunDir;
  uniform vec3 moonDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    float h = clamp(vDir.y, -0.1, 1.0);
    // ── day: hazy Bengal sky
    vec3 dTop = vec3(0.36, 0.56, 0.84), dMid = vec3(0.68, 0.79, 0.92), dHor = vec3(0.90, 0.88, 0.83);
    vec3 day = mix(dHor, dMid, smoothstep(0.0, 0.22, h));
    day = mix(day, dTop, smoothstep(0.18, 0.85, h));
    float sd = max(0.0, dot(vDir, sunDir));
    day += vec3(1.0, 0.96, 0.86) * (pow(sd, 600.0) * 2.0 + pow(sd, 6.0) * 0.22);
    // ── night: indigo with a warm haze low on the horizon, stars, moon
    vec3 nTop = vec3(0.04, 0.04, 0.13), nMid = vec3(0.14, 0.11, 0.28), nHor = vec3(0.36, 0.20, 0.30);
    vec3 nite = mix(nHor, nMid, smoothstep(0.0, 0.25, h));
    nite = mix(nite, nTop, smoothstep(0.2, 0.9, h));
    vec2 p = vDir.xz / (vDir.y + 0.15);
    float star = step(0.9985, hash(floor(p * 90.0)));
    nite += star * smoothstep(0.3, 0.8, h) * 0.6;
    float md = max(0.0, dot(vDir, moonDir));
    nite += vec3(0.95, 0.95, 1.0) * (pow(md, 1500.0) * 1.6 + pow(md, 12.0) * 0.12);
    vec3 c = mix(day, nite, night);
    gl_FragColor = vec4(c, 1.0);
  }
`;

// Camera path through the complex (position + look target). Each Catmull-Rom segment spans an
// equal slice of t, so short segments (stairs, sanctum) are walked slowly on purpose.
export const PATH = [
  { p: [0.6, 1.7, 100], l: [0, 6.0, 62] },
  { p: [0.3, 1.7, 80], l: [0, 7.0, 62] },
  { p: [0.0, 1.7, 65], l: [0, 3.5, 40] },
  { p: [2.5, 1.7, 50], l: [-14, 6.0, 40] },
  { p: [1.5, 1.7, 36], l: [-6, 5.0, 22] },
  { p: [0.0, 2.7, 22], l: [0, 3.0, 6] },
  { p: [6.0, 1.7, 13.5], l: [0, 2.4, 8] },
  { p: [6.5, 1.7, 6.5], l: [0, 2.6, 8] },
  { p: [0.5, 1.7, 2.8], l: [0, 14.0, -14] },
  { p: [0.0, 4.3, -3.5], l: [0, 4.5, -14] },
  { p: [0.0, 4.3, -8.5], l: [0, 4.2, -18] },
  { p: [0.0, 4.2, -13.0], l: [0, 3.6, -17.3] },
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
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xd8dfe6, 0.004);
  // soft reflections for the brass, silver and gold
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 500);

  const sunDir = new THREE.Vector3(0.55, 0.62, 0.55).normalize();
  const moonDir = new THREE.Vector3(-0.45, 0.5, -0.6).normalize();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { night: { value: 0 }, sunDir: { value: sunDir }, moonDir: { value: moonDir } },
    }),
  );
  scene.add(sky);

  // Lights
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x8a7a5a, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
  sun.position.copy(sunDir).multiplyScalar(90);
  sun.target.position.set(0, 0, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 260;
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // World
  const mats = createMaterials();
  const complex = buildComplex(mats);
  const nature = buildNature(mats);
  scene.add(complex.group, nature.group);

  const posCurve = new THREE.CatmullRomCurve3(PATH.map((n) => new THREE.Vector3(...n.p)), false, 'catmullrom', 0.5);
  const lookCurve = new THREE.CatmullRomCurve3(PATH.map((n) => new THREE.Vector3(...n.l)), false, 'catmullrom', 0.5);

  const state = {
    target: 0, progress: 0, velocity: 0, walkPhase: 0,
    pointer: new THREE.Vector2(), pointerSmooth: new THREE.Vector2(),
    running: false, time: 0, last: performance.now(),
    nightTarget: 0, night: 0,
  };

  const DAY = { sunColor: new THREE.Color(0xfff1dc), sunI: 3.0, hemiSky: new THREE.Color(0xcfe3ff), hemiGround: new THREE.Color(0x8a7a5a), hemiI: 1.4, fog: new THREE.Color(0xd8dfe6), fogD: 0.004, exposure: 1.0 };
  const NIGHT = { sunColor: new THREE.Color(0x7f8fc8), sunI: 0.35, hemiSky: new THREE.Color(0x303a6a), hemiGround: new THREE.Color(0x1b1210), hemiI: 0.4, fog: new THREE.Color(0x241a30), fogD: 0.007, exposure: 1.0 };
  const tmpC = new THREE.Color();

  function applyNight(n) {
    sky.material.uniforms.night.value = n;
    sun.color.copy(tmpC.copy(DAY.sunColor).lerp(NIGHT.sunColor, n));
    sun.intensity = THREE.MathUtils.lerp(DAY.sunI, NIGHT.sunI, n);
    sun.position.copy(n < 0.5 ? sunDir : moonDir).multiplyScalar(90);
    hemi.color.copy(tmpC.copy(DAY.hemiSky).lerp(NIGHT.hemiSky, n));
    hemi.groundColor.copy(tmpC.copy(DAY.hemiGround).lerp(NIGHT.hemiGround, n));
    hemi.intensity = THREE.MathUtils.lerp(DAY.hemiI, NIGHT.hemiI, n);
    scene.fog.color.copy(tmpC.copy(DAY.fog).lerp(NIGHT.fog, n));
    scene.fog.density = THREE.MathUtils.lerp(DAY.fogD, NIGHT.fogD, n);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(DAY.exposure, NIGHT.exposure, n);
    scene.environmentIntensity = THREE.MathUtils.lerp(0.35, 0.08, n);
    for (const l of complex.pointLights) l.userData.level = l.userData.night * (0.18 + 0.82 * n);
    for (const s of complex.spots) s.intensity = s.userData.night * n;
    mats.lampGlass.emissiveIntensity = 1.8 * n;
    mats.roseBand.emissiveIntensity = 1.3 * n;
  }
  applyNight(0);

  const tmpPos = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 70 : 58;
    camera.updateProjectionMatrix();
  }

  function frame(now) {
    if (!state.running) return;
    const dt = Math.min(0.05, (now - state.last) / 1000);
    state.last = now;
    state.time += dt;

    const k = reducedMotion ? 1 : 1 - Math.pow(0.001, dt);
    const prev = state.progress;
    state.progress += (state.target - state.progress) * k;
    state.velocity = (state.progress - prev) / Math.max(dt, 1e-3);
    state.walkPhase += Math.abs(state.velocity) * 110 * dt;

    if (Math.abs(state.nightTarget - state.night) > 0.0005) {
      state.night += (state.nightTarget - state.night) * (reducedMotion ? 1 : Math.min(1, dt * 2.2));
      applyNight(state.night);
    }

    const t = THREE.MathUtils.clamp(state.progress, 0, 1);
    posCurve.getPoint(t, tmpPos);
    lookCurve.getPoint(t, tmpLook);
    if (!reducedMotion) {
      const bobAmt = THREE.MathUtils.clamp(Math.abs(state.velocity) * 14, 0, 1);
      tmpPos.y += Math.sin(state.walkPhase) * 0.035 * bobAmt + Math.sin(state.time * 0.9) * 0.01;
      tmpPos.x += Math.sin(state.walkPhase * 0.5) * 0.03 * bobAmt;
    }
    state.pointerSmooth.lerp(state.pointer, reducedMotion ? 1 : 0.06);
    tmpLook.x += state.pointerSmooth.x * 1.2;
    tmpLook.y += state.pointerSmooth.y * 0.7;
    camera.position.copy(tmpPos);
    camera.lookAt(tmpLook);

    const fl = complex.flames;
    for (let i = 0; i < fl.length; i++) {
      const f = fl[i];
      const s = 0.85 + Math.sin(state.time * 11 + f.seed) * 0.1 + Math.sin(state.time * 23 + f.seed * 2) * 0.06;
      if (f.big) f.mesh.scale.set(1.6 * s, 3.2 * s, 1.6 * s); else f.mesh.scale.set(0.55 * s, 1.25 * s, 0.55 * s);
    }
    for (let i = 0; i < complex.pointLights.length; i++) {
      const l = complex.pointLights[i];
      l.intensity = l.userData.level * (0.94 + Math.sin(state.time * 9 + i * 1.7) * 0.04 + Math.sin(state.time * 17 + i) * 0.02);
    }
    nature.update(state.time, state.night);

    sky.position.copy(camera.position);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  const projected = new THREE.Vector3();
  return {
    ok: true,
    camera,
    resize,
    setProgress(v) { state.target = THREE.MathUtils.clamp(v, 0, 1); },
    get progress() { return state.progress; },
    get night() { return state.night; },
    setNight(on) { state.nightTarget = on ? 1 : 0; },
    setPointer(x, y) { state.pointer.set(x, y); },
    /** Project a world point to normalised screen coords; returns null when behind the camera. */
    project(v3) {
      projected.copy(v3).project(camera);
      if (projected.z > 1) return null;
      return { x: (projected.x + 1) / 2, y: (1 - projected.y) / 2 };
    },
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
