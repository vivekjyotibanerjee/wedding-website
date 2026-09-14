import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Big ground sheets: they receive shadows but casting from a 3 km plane only wastes shadow-map
// resolution. Names are the Blender object names (see recon/blender/build_dakshineswar.py).
const NO_CAST = new Set(['ground', 'river', 'bank', 'far_bank', 'paving', 'courtyard']);

/**
 * Load the baked model written by `bash recon/blender/render.sh web` (public/models/dakshineswar.glb:
 * meshopt-compressed geometry, WebP textures, one baked material per mesh). Resolves to the root
 * group, ready to add to the scene; `onProgress(0–1)` reports the download (−1 when the server
 * sends no Content-Length, so the caller still knows bytes are arriving).
 */
export function loadModel(url, renderer, onProgress) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene;
        const textures = new Set();
        root.traverse((o) => {
          if (!o.isMesh) return;
          const base = o.name.replace(/\.\d+$/, '');
          o.castShadow = !NO_CAST.has(base);
          o.receiveShadow = true;
          const m = o.material;
          for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (m[k]) textures.add(m[k]);
          if (m.transparent) { m.depthWrite = false; m.side = THREE.DoubleSide; }  // the mandap drapes
          if (m.aoMap) m.aoMapIntensity = 0.8;   // baked occlusion (recon/blender/export_web.py); never fully black
          if (base === 'river') { m.envMapIntensity = 1.6; o.receiveShadow = false; }
        });
        for (const t of textures) t.anisotropy = aniso;  // the tiled paving is seen at grazing angles all walk long
        // ~460 static objects: compute their matrices once rather than every frame (the bells'
        // pivots, added later by life.js, keep their own auto-update and push it down to the bell)
        root.updateMatrixWorld(true);
        root.traverse((o) => { o.matrixAutoUpdate = false; });
        resolve(root);
      },
      (ev) => { if (onProgress) onProgress(ev.total ? Math.min(1, ev.loaded / ev.total) : -1); },
      reject,
    );
  });
}
