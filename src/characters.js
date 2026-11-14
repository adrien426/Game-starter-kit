import * as THREE from 'three';
import { CONFIG, GROUP, groups } from './config.js';
import { instantiate, fallbackCharacter } from './assets.js';

const P = CONFIG.player;
const FOOT_OFFSET = P.capsuleHalfHeight + P.capsuleRadius; // capsule center -> feet

// Kinematic character driven by Rapier's character controller.
// The controller slides along walls and snaps to the ground instead of jittering.
class Character {
  constructor(physics, scene, { x, z, tint, color, collisionGroups, moveFilter }) {
    const R = physics.RAPIER;
    this.physics = physics;
    this.moveFilter = moveFilter;

    this.body = physics.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, FOOT_OFFSET + 0.01, z)
    );
    this.collider = physics.world.createCollider(
      R.ColliderDesc.capsule(P.capsuleHalfHeight, P.capsuleRadius).setCollisionGroups(collisionGroups),
      this.body
    );
    this.controller = physics.world.createCharacterController(0.02);
    this.controller.enableSnapToGround(0.3);
    this.controller.setSlideEnabled(true);

    this.velocity = new THREE.Vector3();
    this.verticalSpeed = 0;
    this.facing = 0; // radians, 0 = looking toward +Z

    this.root = new THREE.Group();
    const model = instantiate('player', tint);
    if (model) {
      model.object.rotation.y = P.modelYawOffset;
      this.root.add(model.object);
      this.mixer = new THREE.AnimationMixer(model.object);
      this.actions = {};
      for (const clip of model.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
      this.current = null;
      this.play('Idle');
    } else {
      this.root.add(fallbackCharacter(color));
    }
    scene?.add(this.root);
  }

  get position() { return this.body.translation(); }

  get forward() { return { x: Math.sin(this.facing), z: Math.cos(this.facing) }; }

  teleport(x, z, facing = Math.PI) {
    this.body.setTranslation({ x, y: FOOT_OFFSET + 0.01, z }, true);
    this.body.setNextKinematicTranslation({ x, y: FOOT_OFFSET + 0.01, z });
    this.velocity.set(0, 0, 0);
    this.facing = facing;
  }

  // Physics step: move toward the desired horizontal velocity.
  step(dt, vx, vz) {
    this.verticalSpeed = this.controller.computedGrounded() ? -1 : this.verticalSpeed + CONFIG.physics.gravity * dt;
    const desired = { x: vx * dt, y: this.verticalSpeed * dt, z: vz * dt };
    this.controller.computeColliderMovement(this.collider, desired, undefined, this.moveFilter);
    const m = this.controller.computedMovement();
    const p = this.body.translation();
    this.body.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z });
    this.velocity.set(m.x / dt, 0, m.z / dt);

    if (Math.hypot(vx, vz) > 0.1) this.turnToward(Math.atan2(vx, vz), dt);
  }

  turnToward(target, dt) {
    let diff = target - this.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // shortest way around
    this.facing += diff * Math.min(1, P.turnSpeed * dt);
  }

  play(name) {
    if (!this.actions || this.current === name || !this.actions[name]) return;
    const next = this.actions[name];
    next.reset().play();
    if (this.current) this.actions[this.current].crossFadeTo(next, 0.25, false);
    this.current = name;
  }

  // Render step: copy physics to visuals and pick the animation from the real speed.
  sync(dt) {
    const p = this.body.translation();
    this.root.position.set(p.x, p.y - FOOT_OFFSET, p.z);
    this.root.rotation.y = this.facing;
    const speed = this.velocity.length();
    this.play(speed > 6 ? 'Run' : speed > 0.5 ? 'Walk' : 'Idle');
    if (this.actions?.Walk) this.actions.Walk.timeScale = THREE.MathUtils.clamp(speed / 2.5, 0.8, 2);
    this.mixer?.update(dt);
  }
}

export class Player extends Character {
  constructor(physics, scene) {
    super(physics, scene, {
      x: 0, z: 6, tint: 0xff9a9a, color: 0xe23b3b,
      collisionGroups: groups(GROUP.PLAYER, GROUP.WORLD), // walks through the ball, never trips on it
      moveFilter: groups(GROUP.PLAYER, GROUP.WORLD),
    });
    this.charge = 0;
    this.wasKicking = false;
  }

  // Returns true on the frame a shot is taken.
  step(dt, input, ball) {
    const mv = input.move;
    const speed = input.sprint ? P.sprintSpeed : P.walkSpeed;
    super.step(dt, mv.x * speed, mv.z * speed);

    const p = this.position;
    const b = ball.position;
    const dx = b.x - p.x, dz = b.z - p.z;
    const dist = Math.hypot(dx, dz);
    let shot = false;

    if (input.kick) {
      this.charge = Math.min(this.charge + dt, P.chargeTime);
    } else if (this.wasKicking) {
      if (dist < P.kickRange && b.y < 1.2) {
        const t = this.charge / P.chargeTime;
        const f = this.forward;
        ball.kick(f.x, f.z, THREE.MathUtils.lerp(P.kickMin, P.kickMax, t), 1 + t * 7);
        shot = true;
      }
      this.charge = 0;
    }
    this.wasKicking = input.kick;

    // Dribble: keep the ball just in front of the feet while running or charging a shot.
    const moving = this.velocity.lengthSq() > 0.5;
    if ((moving || input.kick) && !shot && dist < P.dribbleRange && b.y < ball.radius + 0.3) {
      const f = this.forward;
      const tx = p.x + f.x * 0.75, tz = p.z + f.z * 0.75;
      ball.steer(this.velocity.x + (tx - b.x) * 6, this.velocity.z + (tz - b.z) * 6, 0.3);
    }
    return shot;
  }
}

export class Keeper extends Character {
  constructor(physics, scene, side) {
    const z = side * (CONFIG.field.length / 2 - 1);
    super(physics, scene, {
      x: 0, z, tint: 0x9affb0, color: 0x2fbf5a,
      collisionGroups: groups(GROUP.WORLD, 0xffff), // solid for the ball: the keeper can save shots
      moveFilter: groups(GROUP.WORLD, GROUP.WORLD),
    });
    this.side = side;
    this.homeZ = z;
    this.cooldown = 0;
  }

  step(dt, ball) {
    const p = this.position;
    const b = ball.position;
    const K = CONFIG.keeper;
    const inBox = Math.abs(b.z - this.homeZ) < 12;

    // Follow the ball sideways on the goal line, step out a little when it is close
    const targetX = THREE.MathUtils.clamp(b.x * 0.7, -K.reach, K.reach);
    const targetZ = this.homeZ - this.side * (inBox ? 1.5 : 0);
    let vx = THREE.MathUtils.clamp((targetX - p.x) * 4, -K.speed, K.speed);
    let vz = THREE.MathUtils.clamp((targetZ - p.z) * 4, -K.speed, K.speed);
    super.step(dt, vx, vz);
    this.turnToward(Math.atan2(b.x - p.x, b.z - p.z), dt);

    // Clear the ball upfield
    this.cooldown -= dt;
    if (this.cooldown <= 0 && Math.hypot(b.x - p.x, b.z - p.z) < 1.4 && b.y < 1.8) {
      ball.kick((Math.random() - 0.5) * 0.8, -this.side, 16, 6);
      this.cooldown = 1;
    }
  }
}
