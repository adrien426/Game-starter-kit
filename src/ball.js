import * as THREE from 'three';
import { CONFIG, GROUP, groups } from './config.js';

export class Ball {
  constructor(physics, scene) {
    const R = physics.RAPIER;
    const c = CONFIG.ball;
    this.radius = c.radius;

    this.body = physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(0, 2, 0)
        .setLinearDamping(c.linearDamping)
        .setAngularDamping(c.angularDamping)
        .setCcdEnabled(true) // prevents tunneling through posts on hard shots
    );
    physics.world.createCollider(
      R.ColliderDesc.ball(c.radius)
        .setDensity(c.density)
        .setRestitution(c.restitution)
        .setFriction(c.friction)
        .setCollisionGroups(groups(GROUP.BALL, GROUP.WORLD | GROUP.BALL)),
      this.body
    );

    this.mesh = new THREE.Mesh(Ball.geometry(c.radius), new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.5,
    }));
    this.mesh.castShadow = true;
    scene?.add(this.mesh);
  }

  // Flat-shaded icosahedron with dark panels: looks like a ball without any texture file
  static geometry(radius) {
    const geo = new THREE.IcosahedronGeometry(radius, 1); // non-indexed: 3 vertices per face
    const colors = [];
    const faces = geo.attributes.position.count / 3;
    for (let i = 0; i < faces; i++) {
      const c = i % 4 === 0 ? 0.08 : 0.95;
      for (let k = 0; k < 3; k++) colors.push(c, c, c);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }

  get position() { return this.body.translation(); }
  get velocity() { return this.body.linvel(); }

  reset(x = 0, z = 0) {
    this.body.setTranslation({ x, y: this.radius + 0.02, z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  // Setting velocity directly (instead of impulses) makes kicks independent of ball mass
  kick(dirX, dirZ, speed, lift) {
    this.body.setLinvel({ x: dirX * speed, y: lift, z: dirZ * speed }, true);
  }

  // Smoothly steer the ball's horizontal velocity toward a target velocity
  steer(targetVx, targetVz, strength) {
    const v = this.body.linvel();
    this.body.setLinvel({ x: v.x + (targetVx - v.x) * strength, y: v.y, z: v.z + (targetVz - v.z) * strength }, true);
  }

  sync() {
    const p = this.body.translation();
    const q = this.body.rotation();
    this.mesh.position.set(p.x, p.y, p.z);
    this.mesh.quaternion.set(q.x, q.y, q.z, q.w);
  }
}

