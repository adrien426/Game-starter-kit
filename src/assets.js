import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// Models are stored in the repo (assets/models) so the game never depends on a third-party URL.
// To use another character: drop a .glb with Idle / Walk / Run animations here and change the path.
const MODELS = {
  player: './assets/models/Soldier.glb',
};

const cache = {};

export async function loadModels(onProgress) {
  const loader = new GLTFLoader();
  const entries = Object.entries(MODELS);
  let done = 0;
  await Promise.all(entries.map(async ([key, url]) => {
    try {
      cache[key] = await loader.loadAsync(url);
    } catch (err) {
      console.warn(`Model "${key}" failed to load (${url}), using a fallback shape.`, err);
      cache[key] = null;
    }
    onProgress?.(++done / entries.length);
  }));
}

// Returns { object, animations } or null. Skinned meshes must be cloned with SkeletonUtils.
export function instantiate(key, tint) {
  const gltf = cache[key];
  if (!gltf) return null;
  const object = cloneSkinned(gltf.scene);
  object.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      if (tint) {
        o.material = o.material.clone();
        o.material.color.multiply(new THREE.Color(tint));
      }
    }
  });
  return { object, animations: gltf.animations };
}

// Simple capsule used when a model is missing, so the game still runs.
export function fallbackCharacter(color) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 1.0, 6, 12),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.position.y = 0.85;
  mesh.castShadow = true;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  nose.position.set(0, 1.4, 0.35); // points +Z
  const g = new THREE.Group();
  g.add(mesh, nose);
  return g;
}
