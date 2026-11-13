import * as THREE from 'three';
import { CONFIG } from '../config';
import { runtime } from '../core/runtime';
import { effects } from './Effects';

// Anything that can take damage registers itself here with its collider
// handle:  runtime.damageables.set(collider.handle, { hit(damage, point, dir, source) })
// (NPCs, the player, breakable props...). Dynamic rigid bodies are pushed.

const _v = new THREE.Vector3();
// IMPORTANT: inside a Rapier query callback you may only read collider.handle.
// Calling another Rapier method there crashes the WASM ("recursive use of an
// object"). So we filter with plain JS sets and act after the query.
const hittable = (c) => !runtime.ignoreColliders.has(c.handle);

/** Ray from the camera through the crosshair: returns the world point aimed at. */
export function computeAimPoint(world, rapier, camera, exclude, maxDist = 300) {
  const o = camera.position;
  const d = runtime.aimDir;
  const ray = new rapier.Ray({ x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z });
  const hit = world.castRay(ray, maxDist, true, undefined, undefined, undefined, exclude, hittable);
  const toi = hit ? hit.timeOfImpact : maxDist;
  runtime.aimPoint.copy(o).addScaledVector(d, toi);
  return runtime.aimPoint;
}

/**
 * Fires one bullet from `origin` toward `target`.
 * exclude: rigid body to ignore (the shooter).
 */
export function fireBullet(world, rapier, origin, target, weapon, exclude, source = 'player') {
  const dir = _v.subVectors(target, origin).normalize();
  const s = weapon.spread ?? 0;
  dir.x += (Math.random() - 0.5) * s * 2;
  dir.y += (Math.random() - 0.5) * s * 2;
  dir.z += (Math.random() - 0.5) * s * 2;
  dir.normalize();
  const ray = new rapier.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z });
  const hit = world.castRayAndGetNormal(ray, weapon.range, true, undefined, undefined, undefined, exclude, hittable);
  const end = origin.clone().addScaledVector(dir, hit ? hit.timeOfImpact : weapon.range);
  effects.tracer(origin, end);
  effects.muzzle(origin);
  if (!hit) return null;
  const target2 = runtime.damageables.get(hit.collider.handle);
  if (target2) {
    target2.hit(weapon.damage, end, dir.clone(), source);
    effects.impact(end, '#b0102a', 10);
  } else {
    effects.impact(end, '#ffd27a', 6);
  }
  const body = hit.collider.parent();
  if (body && body.isDynamic()) {
    body.applyImpulseAtPoint({ x: dir.x * CONFIG.combat.bulletImpulse, y: dir.y * CONFIG.combat.bulletImpulse, z: dir.z * CONFIG.combat.bulletImpulse }, end, true);
  }
  return hit;
}

/** Punch / kick: hits everything in a small sphere in front of `origin`. */
export function meleeHit(world, rapier, origin, forward, damage, exclude, source = 'player') {
  const center = origin.clone().addScaledVector(forward, CONFIG.combat.punchRange * 0.6);
  const shape = new rapier.Ball(0.55);
  let touched = false;
  const found = [];
  world.intersectionsWithShape(center, { x: 0, y: 0, z: 0, w: 1 }, shape, (collider) => { found.push(collider); return true; });
  for (const collider of found) {
    if (!hittable(collider)) continue;
    const body = collider.parent();
    if (exclude && body && body.handle === exclude.handle) continue;
    const t = runtime.damageables.get(collider.handle);
    if (t) { t.hit(damage, center, forward.clone(), source); touched = true; continue; }
    if (collider.isSensor()) continue;
    if (body && body.isDynamic()) {
      const k = CONFIG.combat.meleeImpulse * Math.max(1, body.mass() * 0.2);
      body.applyImpulse({ x: forward.x * k, y: 0.3 * k, z: forward.z * k }, true);
      touched = true;
    }
  }
  if (touched) effects.impact(center, '#ffffff', 5);
  return touched;
}
