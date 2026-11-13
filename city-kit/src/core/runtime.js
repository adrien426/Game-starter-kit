import * as THREE from 'three';

// Non-reactive shared state, read and written every frame.
// (Like a static class in C#: one instance, no re-render when it changes.)
export const runtime = {
  player: null, // EcctrlHandle of the character (null while driving)
  playerObject: null, // THREE.Object3D following the character (interpolated)
  focus: new THREE.Vector3(), // what the camera looks at
  focusVelocity: new THREE.Vector3(),
  vehicles: new Map(), // id -> { id, type, def, handle, object, driver }
  npcs: new Map(), // collider handle -> npc api { hit(damage, dir) }
  damageables: new Map(), // collider handle -> { hit(damage, point, dir) }
  ignoreColliders: new Set(), // collider handles bullets / camera go through
  camera: { yaw: Math.PI, pitch: -0.18, lastInput: 0, aimBlend: 0 },
  aimPoint: new THREE.Vector3(), // where the crosshair points in the world
  aimDir: new THREE.Vector3(0, 0, 1),
};

export function nearestVehicle(position, maxDistance) {
  let best = null;
  let bestD = maxDistance;
  for (const v of runtime.vehicles.values()) {
    if (!v.object) continue;
    const p = v.object.getWorldPosition(tmp);
    const d = p.distanceTo(position) - (v.def.size[2] * 0.35);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}
const tmp = new THREE.Vector3();
