import RAPIER from '@dimforge/rapier3d-compat';

// Safety net: one NaN impulse makes the whole Rapier world crash ("unreachable"),
// which freezes the game. This drops any non-finite value sent to a rigid body
// and logs it once, so a bad frame never kills the session.
const finite = (v) => !v || typeof v !== 'object' || (Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z) && (v.w === undefined || Number.isFinite(v.w)));
let warned = false;
export const guardStats = { ignored: 0 };
if (typeof window !== 'undefined') window.__physicsGuard = guardStats;
for (const name of ['applyImpulseAtPoint', 'applyImpulse', 'applyTorqueImpulse', 'addForce', 'addForceAtPoint', 'addTorque', 'setTranslation', 'setRotation', 'setLinvel', 'setAngvel', 'setNextKinematicTranslation', 'setNextKinematicRotation']) {
  const original = RAPIER.RigidBody.prototype[name];
  if (!original) continue;
  RAPIER.RigidBody.prototype[name] = function guarded(...args) {
    if (!args.every(finite)) {
      guardStats.ignored++;
      if (!warned) { warned = true; console.warn(`[physicsGuard] ignored non-finite ${name}`); }
      return undefined;
    }
    return original.apply(this, args);
  };
}
