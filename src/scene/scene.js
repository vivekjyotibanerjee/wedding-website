import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { loadModel } from './model.js';
import { buildLife } from './life.js';
import { buildDecor } from './decor.js';
import { buildFx } from './fx.js';
import { buildTables } from './tables.js';
import { buildCouple } from './couple.js';
import { createStage, STAGES } from './stage.js';
import { posCurve, lookCurve, eyeAt, NODE } from './walk.js';
import L from './landmarks.json';

// `?model=…` swaps the glb in for checking a test export without touching the committed one.
const MODEL_URL = new URLSearchParams(location.search).get('model') || `${import.meta.env.BASE_URL}models/dakshineswar.glb`;

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
  uniform float dusk;
  uniform float time;
  uniform vec3 sunDir;
  uniform vec3 moonDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }
  void main() {
    float h = clamp(vDir.y, -0.1, 1.0);
    // ── day: hazy Bengal sky
    vec3 dTop = vec3(0.36, 0.56, 0.84), dMid = vec3(0.68, 0.79, 0.92), dHor = vec3(0.90, 0.88, 0.83);
    vec3 day = mix(dHor, dMid, smoothstep(0.0, 0.22, h));
    day = mix(day, dTop, smoothstep(0.18, 0.85, h));
    // golden hour (dusk): the horizon warms toward the sun, the zenith deepens, the sun swells and reddens
    vec3 warm = vec3(1.0, 0.64, 0.34);
    float lowH = 1.0 - smoothstep(0.0, 0.42, h);
    float toward = 0.5 + 0.5 * dot(normalize(vec3(vDir.x, 0.0, vDir.z) + 1e-4), normalize(vec3(sunDir.x, 0.0, sunDir.z)));
    day = mix(day, warm, dusk * lowH * (0.3 + 0.5 * toward));
    day = mix(day, vec3(0.22, 0.38, 0.7), dusk * smoothstep(0.3, 0.9, h) * 0.4);
    float sd = max(0.0, dot(vDir, sunDir));
    vec3 sunCol = mix(vec3(1.0, 0.96, 0.86), vec3(1.0, 0.66, 0.36), dusk);
    day += sunCol * (pow(sd, mix(600.0, 220.0, dusk)) * 2.0 + pow(sd, 6.0) * (0.22 + 0.55 * dusk));
    // ── clouds: a thin sheet of fair-weather cumulus projected onto a high plane, drifting east
    vec2 cp = vDir.xz / (vDir.y + 0.08) * 1.2 + vec2(time * 0.006, time * 0.0015);
    float cov = fbm(cp * 0.4) + 0.06 * fbm(cp * 2.5) - 0.03;
    float cloud = smoothstep(0.56, 0.72, cov) * smoothstep(0.03, 0.2, h);
    float lit = 0.72 + 0.28 * smoothstep(0.5, 0.85, cov);
    vec3 cloudCol = mix(vec3(0.78, 0.8, 0.86), vec3(1.0, 0.99, 0.96), lit) * (1.0 + 0.5 * pow(sd, 3.0)) * mix(vec3(1.0), vec3(1.0, 0.78, 0.6), dusk);
    day = mix(day, cloudCol, cloud * 0.85);
    // ── night: indigo with a warm haze low on the horizon, stars, moon
    vec3 nTop = vec3(0.04, 0.04, 0.13), nMid = vec3(0.14, 0.11, 0.28), nHor = vec3(0.36, 0.20, 0.30);
    vec3 nite = mix(nHor, nMid, smoothstep(0.0, 0.25, h));
    nite = mix(nite, nTop, smoothstep(0.2, 0.9, h));
    vec2 p = vDir.xz / (vDir.y + 0.15);
    float star = step(0.9985, hash(floor(p * 90.0)));
    nite += star * smoothstep(0.3, 0.8, h) * 0.6;
    float md = max(0.0, dot(vDir, moonDir));
    nite += vec3(0.95, 0.95, 1.0) * (pow(md, 1500.0) * 1.6 + pow(md, 12.0) * 0.12);
    nite = mix(nite, vec3(0.16, 0.14, 0.22), cloud * 0.25);
    vec3 c = mix(day, nite, night);
    gl_FragColor = vec4(c, 1.0);
  }
`;

/** Direction toward the sun from a compass bearing (where it shines from) and an elevation. */
function sunFromBearing(bearingDeg, elevationDeg) {
  const b = THREE.MathUtils.degToRad(bearingDeg);
  const e = THREE.MathUtils.degToRad(elevationDeg);
  // bearing is clockwise from north; north is −z, east is +x
  return new THREE.Vector3(Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e)).normalize();
}

/** A rough device tier for the effects budget (petal counts, fire layers, shadow map). */
export function detectQuality() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (coarse && (cores <= 4 || mem <= 3)) return 'low';
  if (coarse || cores <= 4) return 'medium';
  return 'high';
}

export function createScene(canvas, { reducedMotion = false, onProgress = null, onBell = null, quality = detectQuality() } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1.25 : 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  // The shadow map is rendered on demand (the whole complex is a caster: it is the cost of a second
  // scene pass every frame otherwise): once the model is in, when the night toggles, and as the sun
  // sinks through golden hour — see applyLighting().
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.info.autoReset = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xd8dfe6, 0.0026);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 900);

  // The same afternoon sun the Blender stills use (SSW, ~38° up) — it sinks toward golden hour as
  // the wedding approaches (stage.dusk); the moon is roughly opposite.
  const SUN_HIGH = 38, SUN_LOW = 11;
  const sunDir = sunFromBearing(L.sun.bearing, SUN_HIGH);
  const moonDir = new THREE.Vector3(0.45, 0.5, -0.6).normalize();
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { night: { value: 0 }, dusk: { value: 0 }, time: { value: 0 }, sunDir: { value: sunDir }, moonDir: { value: moonDir } },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), skyMat);
  scene.add(sky);
  // Image-based lighting comes from that same sky, so the gold finials, the brass and the river
  // pick up the right colours in both day and night. Filtering a sky into an environment map is a
  // stall of a good fraction of a second on a phone, so the few the walk needs — afternoon, three
  // steps of golden hour, night — are made once, behind the loading veil, and switched between.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(sky.geometry, skyMat));
  const ENV_KEYS = quality === 'low' ? [0, 0.5, 1] : [0, 0.17, 0.34, 0.5, 1];   // key = night + (1 − night) · dusk / 2
  const envMaps = new Map();
  function bakeEnvironments() {
    const n0 = skyMat.uniforms.night.value, d0 = skyMat.uniforms.dusk.value;
    for (const key of ENV_KEYS) {
      skyMat.uniforms.night.value = key >= 1 ? 1 : 0;
      skyMat.uniforms.dusk.value = key >= 1 ? 0 : key * 2;
      envMaps.set(key, pmrem.fromScene(envScene, 0.04, 1, 2000).texture);
    }
    skyMat.uniforms.night.value = n0;
    skyMat.uniforms.dusk.value = d0;
  }
  let envKey = -1;
  function refreshEnvironment(key) {
    if (!envMaps.size) return;
    let best = ENV_KEYS[0];
    for (const k of ENV_KEYS) if (Math.abs(k - key) < Math.abs(best - key)) best = k;
    if (best === envKey) return;
    envKey = best;
    scene.environment = envMaps.get(best);
  }

  // Lights
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x8a7a5a, 0.45);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sun.position.copy(sunDir).multiplyScalar(160);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality === 'low' ? 1024 : 2048, quality === 'low' ? 1024 : 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 400;
  // one shadow map over the walled complex (courtyard 58 × 107 m plus the ghat)
  const [ccx, , ccz] = L.courtyard.center;
  sun.target.position.set(ccx - 6, 0, ccz);
  sun.position.add(sun.target.position);
  const r = 78;
  sun.shadow.camera.left = -r; sun.shadow.camera.right = r; sun.shadow.camera.top = r; sun.shadow.camera.bottom = -r;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  // Night: floodlights on the temple, the halls and the Shiva row, a warm glow inside the mandap.
  // They exist only at night: a light that is in the scene is evaluated by every lit fragment
  // whatever its intensity, and six spots would be a real cost on a phone by day. Their visibility
  // flips with the toggle (which recompiles the lit shaders once — the one moment that is fine).
  const floods = [];
  function flood(from, to, intensity, angle = 0.4, color = 0xffd8a8) {
    const s = new THREE.SpotLight(color, 0, 140, angle, 0.6, 1.2);
    s.position.set(...from);
    s.target.position.set(...to);
    s.userData.night = intensity;
    s.visible = false;
    scene.add(s, s.target);
    floods.push(s);
    return s;
  }
  const [mx, , mz] = L.mandap.center;
  const nz = L.natmandir.center[2];
  flood([-24, 2.6, 6], [0, 13, 0], 300, 0.42);                        // navaratna, from the courtyard strip
  flood([14, 2.6, 18], [0, 13, 0], 230, 0.42);                        // navaratna, from the south-east
  flood([-22, 2.6, nz], [L.natmandir.west_face_x, 5.5, nz], 170, 0.5);   // nat-mandir front
  flood([-18, 2.4, mz - 2], [L.shiva.x, 5, mz - 24], 150, 0.55);      // the Shiva row, north group
  flood([-18, 2.4, mz + 2], [L.shiva.x, 5, mz + 24], 150, 0.55);      // the Shiva row, south group
  flood([mx, 9, mz + 11], [mx, 2, mz], 110, 0.35, 0xffe2c0);           // the mandap
  const glow = new THREE.PointLight(0xffb060, 0, 22, 1.6);
  glow.position.set(mx, L.mandap.canopy - 0.9, mz);
  glow.userData.night = 6;
  glow.visible = false;
  scene.add(glow);

  // Bloom for the diyas and string lights, only at night: by day the scene renders straight to the
  // canvas; at night it goes through a multisampled HDR target so the edges stay antialiased.
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.0, 0.5, 1.5);
  bloom.enabled = false;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // The model (async). The sky renders while it downloads. The life layer (diyas, lights, wind…)
  // is built over it once it is in.
  let model = null;
  let life = null, decor = null, fx = null, tables = null, couple = null;
  const stageCtl = createStage();
  const ready = loadModel(MODEL_URL, renderer, onProgress).then((root) => {
    model = root;
    scene.add(root);
    life = buildLife(scene, root, { reducedMotion, onBell, quality });
    decor = buildDecor(scene, { reducedMotion, quality });
    fx = buildFx(scene, { reducedMotion, quality, sunDir });
    tables = buildTables(scene, { quality });
    couple = buildCouple(scene, { reducedMotion, renderer, camera });
    const h = canvas.clientHeight || window.innerHeight;
    life.resize(h);
    fx.resize(h);
    const st = stageCtl.update(state.progress);
    life.update(0, st, state.night);
    decor.update(0, st);
    fx.update(0, st, state.night);
    tables.update(0, st);
    couple.update(0, st);
    bakeEnvironments();
    applyLighting(state.night, state.dusk);
    renderer.shadowMap.needsUpdate = true;
    renderer.compile(scene, camera);
    return root;
  });

  let view = null;   // debug: { p, l } pins the camera somewhere off the walk
  const state = {
    target: 0, progress: 0, velocity: 0, walkPhase: 0,
    pointer: new THREE.Vector2(), pointerSmooth: new THREE.Vector2(),
    running: false, time: 0, last: performance.now(),
    nightTarget: 0, night: 0, dusk: 0, shadowSun: -1,
  };

  const DAY = { sunColor: new THREE.Color(0xfff1dc), sunI: 3.2, hemiSky: new THREE.Color(0xcfe3ff), hemiGround: new THREE.Color(0x8a7a5a), hemiI: 0.45, fog: new THREE.Color(0xd8dfe6), fogD: 0.0026, env: 0.55 };
  const DUSK = { sunColor: new THREE.Color(0xffb56a), sunI: 2.7, hemiSky: new THREE.Color(0xdcb89c), hemiGround: new THREE.Color(0x7a5236), hemiI: 0.42, fog: new THREE.Color(0xe6c9ad), fogD: 0.003, env: 0.6 };
  const NIGHT = { sunColor: new THREE.Color(0x7f8fc8), sunI: 0.3, hemiSky: new THREE.Color(0x303a6a), hemiGround: new THREE.Color(0x1b1210), hemiI: 0.22, fog: new THREE.Color(0x241a30), fogD: 0.0055, env: 0.9 };
  const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
  const lerp3 = (k, n, d) => THREE.MathUtils.lerp(THREE.MathUtils.lerp(DAY[k], DUSK[k], d), NIGHT[k], n);
  const lerpC = (k, n, d) => tmpC.copy(DAY[k]).lerp(tmpC2.copy(DUSK[k]), d).lerp(NIGHT[k], n);

  /** Day → golden hour by `d` (the walk's dusk transition), then → night by `n` (the toggle). */
  function applyLighting(n, d) {
    skyMat.uniforms.night.value = n;
    skyMat.uniforms.dusk.value = d;
    sunDir.copy(sunFromBearing(L.sun.bearing, THREE.MathUtils.lerp(SUN_HIGH, SUN_LOW, d)));
    sun.color.copy(lerpC('sunColor', n, d));
    sun.intensity = lerp3('sunI', n, d);
    sun.position.copy(n < 0.5 ? sunDir : moonDir).multiplyScalar(160).add(sun.target.position);
    hemi.color.copy(lerpC('hemiSky', n, d));
    hemi.groundColor.copy(lerpC('hemiGround', n, d));
    hemi.intensity = lerp3('hemiI', n, d);
    scene.fog.color.copy(lerpC('fog', n, d));
    scene.fog.density = lerp3('fogD', n, d);
    scene.environmentIntensity = lerp3('env', n, d);
    for (const s of floods) { s.intensity = s.userData.night * n; s.visible = n > 0.01; }
    glow.intensity = glow.userData.night * n;
    glow.visible = n > 0.01;
    bloom.strength = 0.55 * n;
    bloom.enabled = n > 0.02;
    refreshEnvironment(n + (1 - n) * d * 0.5);
    // the shadows follow the sun in steps of about half a degree; at night it is the moon, once
    const sunKey = n >= 0.5 ? 2 : d;
    if (Math.abs(sunKey - state.shadowSun) > 0.018) { state.shadowSun = sunKey; renderer.shadowMap.needsUpdate = true; }
  }
  applyLighting(0, 0);

  const tmpPos = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    if (life) life.resize(h);
    if (fx) fx.resize(h);
    camera.aspect = w / h;
    camera.fov = w < h ? 70 : 58;
    camera.updateProjectionMatrix();
  }

  /** Advance the walk by dt seconds (clamped, for stable easing) and place the camera; the render
   *  itself is separate. `wallDt` is the real elapsed time, so the day/night crossfade takes the same
   *  second on a slow device as on a fast one. */
  function step(dt, wallDt = dt) {
    state.time += dt;

    const k = reducedMotion ? 1 : 1 - Math.pow(0.001, dt);
    const prev = state.progress;
    state.progress += (state.target - state.progress) * k;
    state.velocity = (state.progress - prev) / Math.max(dt, 1e-3);
    state.walkPhase += Math.abs(state.velocity) * 110 * dt;

    const stage = stageCtl.update(THREE.MathUtils.clamp(state.progress, 0, 1));
    let relight = false;
    if (Math.abs(state.nightTarget - state.night) > 0.0005) {
      state.night += (state.nightTarget - state.night) * (reducedMotion ? 1 : Math.min(1, wallDt * 2.2));
      if (Math.abs(state.nightTarget - state.night) <= 0.0005) state.night = state.nightTarget;
      relight = true;
    }
    if (Math.abs(stage.dusk - state.dusk) > 0.002) { state.dusk = stage.dusk; relight = true; }
    if (relight) applyLighting(state.night, state.dusk);

    const t = THREE.MathUtils.clamp(state.progress, 0, 1);
    eyeAt(t, tmpPos);
    lookCurve.getPoint(t, tmpLook);
    if (!reducedMotion) {
      const bobAmt = THREE.MathUtils.clamp(Math.abs(state.velocity) * 14, 0, 1);
      tmpPos.y += Math.sin(state.walkPhase) * 0.035 * bobAmt + Math.sin(state.time * 0.9) * 0.01;
      tmpPos.x += Math.sin(state.walkPhase * 0.5) * 0.03 * bobAmt;
    }
    state.pointerSmooth.lerp(state.pointer, reducedMotion ? 1 : 0.06);
    tmpLook.x += state.pointerSmooth.x * 1.2;
    tmpLook.y += state.pointerSmooth.y * 0.7;
    if (view) { tmpPos.set(...view.p); tmpLook.set(...view.l); }   // a debug camera, off the walk
    camera.position.copy(tmpPos);
    camera.lookAt(tmpLook);
    sky.position.copy(camera.position);
    skyMat.uniforms.time.value = state.time;
    if (life) life.update(dt, stage, state.night, camera.position);
    if (decor) decor.update(dt, stage, camera.position);
    if (fx) fx.update(dt, stage, state.night);
    if (tables) tables.update(dt, stage, camera.position);
    if (couple) couple.update(dt, stage);
  }

  function frame(now) {
    if (!state.running) return;
    const wallDt = (now - state.last) / 1000;
    state.last = now;
    step(Math.min(0.05, wallDt), wallDt);
    renderer.info.reset();   // counted over the whole frame (the night goes through several passes)
    if (bloom.enabled) composer.render(); else renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  const projected = new THREE.Vector3();
  return {
    ok: true,
    camera,
    ready,
    resize,
    setProgress(v) { state.target = THREE.MathUtils.clamp(v, 0, 1); },
    get progress() { return state.progress; },
    get night() { return state.night; },
    get stage() { return stageCtl.value; },
    get quality() { return quality; },
    get loaded() { return model !== null; },
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
    /** For poking at the scene from the console (`#debug` in the URL exposes this as window.templeScene). */
    debug: {
      renderer, scene, camera, sun, hemi, floods, sky, bloom, stages: STAGES, nodes: NODE.end,
      get life() { return life; }, get decor() { return decor; }, get fx() { return fx; }, get tables() { return tables; }, get couple() { return couple; },
      get calls() { return renderer.info.render.calls; },
      get triangles() { return renderer.info.render.triangles; },
      get programs() { return renderer.info.programs.length; },
      relightShadows() { renderer.shadowMap.needsUpdate = true; },
      /** Jump the walk to progress t at once (no easing) — for screenshots. */
      snap(t) { state.target = state.progress = THREE.MathUtils.clamp(t, 0, 1); },
      /** Pin the camera at p looking at l (world), or null to follow the walk again. */
      look(p = null, l = null) { view = p ? { p, l } : null; },
    },
    renderOnce() { resize(); step(0); if (bloom.enabled) composer.render(); else renderer.render(scene, camera); },
    dispose() { state.running = false; for (const l of [life, decor, fx, tables, couple]) if (l) l.dispose(); for (const t of envMaps.values()) t.dispose(); composer.dispose(); pmrem.dispose(); renderer.dispose(); },
  };
}
