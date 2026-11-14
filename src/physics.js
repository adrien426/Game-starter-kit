import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG } from './config.js';

// Fixed-timestep wrapper around a Rapier world.
// Fixed steps make the simulation identical at 30, 60 or 144 FPS.
export class Physics {
  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  constructor() {
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: CONFIG.physics.gravity, z: 0 });
    this.world.timestep = CONFIG.physics.timestep;
    this.accumulator = 0;
  }

  // Calls onStep(dt) before each physics step, returns the number of steps done.
  update(frameDt, onStep) {
    const dt = CONFIG.physics.timestep;
    // Clamp to avoid the "spiral of death" after a tab switch
    this.accumulator += Math.min(frameDt, 0.1);
    let steps = 0;
    while (this.accumulator >= dt) {
      onStep(dt);
      this.world.step();
      this.accumulator -= dt;
      steps++;
    }
    return steps;
  }

  fixedBox(x, y, z, hx, hy, hz, collisionGroups) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.6).setRestitution(0.4);
    if (collisionGroups !== undefined) desc.setCollisionGroups(collisionGroups);
    this.world.createCollider(desc, body);
    return body;
  }
}
