import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { CONFIG } from '../config';
import { consumeMouse, input, updateInput } from './input';
import { runtime } from './runtime';
import { useGame } from './store';

const C = CONFIG.camera;
const look = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const target = new THREE.Vector3();
const desired = new THREE.Vector3();
const pivot = new THREE.Vector3();
const fwd = new THREE.Vector3();
const lastFocus = new THREE.Vector3();
let zoom = C.distance;
const eye = new THREE.Vector3();
const tmpHead = new THREE.Vector3();
let eyeY = null;

const angleLerp = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/** Reads the input first (priority -10), so every system sees the same frame. */
export function InputUpdater() {
  useFrame(() => updateInput(), -10);
  return null;
}

/**
 * Third-person orbit camera: mouse / touch rotate, wheel zooms, right click
 * aims over the shoulder, goes back behind vehicles, never goes through walls.
 * Runs after the physics (priority 1) so it follows the interpolated meshes.
 */
export function FollowCamera({ renderHere }) {
  const { camera, gl, scene, clock } = useThree();
  const { world, rapier } = useRapier();
  const ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const cam = runtime.camera;
    const { vehicleId, aiming, phase, cameraMode, dead } = useGame.getState();
    const firstPerson = cameraMode === 'first' && !dead && phase !== 'menu';
    const playing = phase === 'playing';

    // ---- rotation
    const m = consumeMouse();
    if (playing) {
      const sens = input.stick.touch ? C.touchSensitivity * 0.4 : C.mouseSensitivity;
      if (m.dx || m.dy) cam.lastInput = clock.elapsedTime;
      cam.yaw -= m.dx * sens;
      cam.pitch = THREE.MathUtils.clamp(cam.pitch - m.dy * sens, -1.25, 0.75);
      if (!aiming) zoom = THREE.MathUtils.clamp(zoom + m.wheel * 0.6, C.minDistance, C.maxDistance);
    } else {
      cam.yaw += dt * 0.08; // slow turn on the menu
    }

    // ---- what do we follow?
    const vehicle = vehicleId ? runtime.vehicles.get(vehicleId) : null;
    let dist = zoom;
    if (vehicle?.object) {
      vehicle.object.getWorldPosition(target);
      target.y += vehicle.def.size[1] * 0.75;
      dist = Math.max(zoom, vehicle.def.size[2] * 0.8 + 3) * C.vehicleDistanceFactor;
      // auto align behind the vehicle when the player does not touch the mouse
      fwd.set(0, 0, 1).applyQuaternion(vehicle.object.getWorldQuaternion(new THREE.Quaternion()));
      const speed = vehicle.handle?.currLinVel?.length?.() ?? 0;
      if (clock.elapsedTime - cam.lastInput > (firstPerson ? 0.5 : C.autoAlignDelay) && speed > 2) {
        const heading = Math.atan2(fwd.x, fwd.z);
        cam.yaw = angleLerp(cam.yaw, heading, 1 - Math.exp(-2.5 * dt));
        cam.pitch = THREE.MathUtils.lerp(cam.pitch, vehicle.def.kind === 'heli' ? -0.3 : -0.16, 1 - Math.exp(-1.5 * dt));
      }
    } else if (runtime.playerObject) {
      runtime.playerObject.getWorldPosition(target);
      target.y += C.height;
    } else {
      target.copy(lastFocus);
    }
    runtime.focusVelocity.subVectors(target, lastFocus).divideScalar(Math.max(dt, 1e-4));
    lastFocus.copy(target);
    runtime.focus.lerp(target, vehicle ? 1 - Math.exp(-25 * dt) : 1);
    if (runtime.focus.distanceToSquared(target) > 400) runtime.focus.copy(target);

    // ---- aim blend
    cam.aimBlend = THREE.MathUtils.lerp(cam.aimBlend, aiming && !vehicle ? 1 : 0, 1 - Math.exp(-12 * dt));
    dist = THREE.MathUtils.lerp(dist, C.aimDistance, cam.aimBlend);

    look.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
    right.crossVectors(look, up).normalize();
    pivot.copy(runtime.focus).addScaledVector(right, C.shoulder * cam.aimBlend);
    desired.copy(pivot).addScaledVector(look, -dist);

    // ---- collision with static geometry (buildings, ground)
    const dir = desired.clone().sub(pivot);
    const len = dir.length();
    dir.divideScalar(len || 1);
    ray.origin = { x: pivot.x, y: pivot.y, z: pivot.z };
    ray.dir = { x: dir.x, y: dir.y, z: dir.z };
    // only static geometry blocks the camera (flags, no JS callback = fast and safe)
    const flags = rapier.QueryFilterFlags.EXCLUDE_DYNAMIC | rapier.QueryFilterFlags.EXCLUDE_KINEMATIC | rapier.QueryFilterFlags.EXCLUDE_SENSORS;
    const hit = world.castRay(ray, len, true, flags);
    if (hit) desired.copy(pivot).addScaledVector(dir, Math.max(0.3, hit.timeOfImpact - 0.25));

    // ---- first person: the eye replaces the orbit position
    if (firstPerson) {
      if (vehicle && runtime.driverHead) {
        runtime.driverHead.getWorldPosition(eye);
        eye.y += 0.06;
        eye.addScaledVector(look, C.eyeForward);
      } else if (!vehicle && runtime.playerObject) {
        // body position (stable) + head height (smoothed): no head-bob sickness
        runtime.playerObject.getWorldPosition(eye);
        const headY = runtime.playerHead ? runtime.playerHead.getWorldPosition(tmpHead).y + 0.08 : eye.y + 0.62;
        eyeY = eyeY === null ? headY : THREE.MathUtils.lerp(eyeY, headY, 1 - Math.exp(-10 * dt));
        eye.y = eyeY;
        eye.x += Math.sin(cam.yaw) * C.eyeForward;
        eye.z += Math.cos(cam.yaw) * C.eyeForward;
      } else if (vehicle?.object) {
        eye.copy(runtime.focus);
      }
      desired.copy(eye);
    }

    camera.position.copy(desired);
    camera.lookAt(desired.x + look.x, desired.y + look.y, desired.z + look.z);
    const fov = THREE.MathUtils.lerp(firstPerson ? C.fpFov : C.fov, C.aimFov, cam.aimBlend);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

    runtime.aimDir.copy(look);
    const vm = runtime.viewModel;
    if (vm && firstPerson && !vehicle) {
      vm.position.set(0.17, -0.17, -0.42).applyQuaternion(camera.quaternion).add(camera.position);
      vm.quaternion.copy(camera.quaternion);
      vm.rotateY(Math.PI); // gun models point to +Z, the camera looks to -Z
    }
    if (renderHere) gl.render(scene, camera);
  }, 1);

  return null;
}
