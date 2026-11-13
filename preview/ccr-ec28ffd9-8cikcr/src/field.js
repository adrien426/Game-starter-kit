import * as THREE from 'three';
import { CONFIG, GROUP, groups } from './config.js';

const WORLD_GROUPS = groups(GROUP.WORLD, 0xffff);

// Physics only (no DOM): ground, walls, goal frames and nets.
export function buildFieldPhysics(physics) {
  const { width: W, length: L, wallHeight: H } = CONFIG.field;
  const { width: gw, height: gh, depth: gd, post } = CONFIG.goal;
  const halfZ = L / 2 + gd + 2; // walls sit behind the goals

  physics.fixedBox(0, -0.5, 0, W / 2 + 2, 0.5, halfZ + 1, WORLD_GROUPS); // ground top at y = 0
  physics.fixedBox(-(W / 2 + 1.5), H / 2, 0, 0.5, H / 2, halfZ, WORLD_GROUPS);
  physics.fixedBox(W / 2 + 1.5, H / 2, 0, 0.5, H / 2, halfZ, WORLD_GROUPS);
  physics.fixedBox(0, H / 2, -halfZ, W / 2 + 2, H / 2, 0.5, WORLD_GROUPS);
  physics.fixedBox(0, H / 2, halfZ, W / 2 + 2, H / 2, 0.5, WORLD_GROUPS);

  for (const s of [-1, 1]) {
    const z0 = s * L / 2;
    const zMid = s * (L / 2 + gd / 2);
    for (const x of [-(gw / 2 + post / 2), gw / 2 + post / 2]) {
      physics.fixedBox(x, gh / 2, z0, post / 2, gh / 2, post / 2, WORLD_GROUPS);       // posts
      physics.fixedBox(x, gh / 2, zMid, 0.05, gh / 2, gd / 2, WORLD_GROUPS);           // side nets
    }
    physics.fixedBox(0, gh + post / 2, z0, gw / 2 + post, post / 2, post / 2, WORLD_GROUPS); // crossbar
    physics.fixedBox(0, gh / 2, s * (L / 2 + gd), gw / 2 + post, gh / 2, 0.05, WORLD_GROUPS); // back net
    physics.fixedBox(0, gh + 0.05, zMid, gw / 2 + post, 0.05, gd / 2, WORLD_GROUPS);    // roof net
  }
}

// Returns +1 / -1 when the ball is fully inside a goal, 0 otherwise.
export function goalSide(p, radius) {
  const { length: L } = CONFIG.field;
  const { width: gw, height: gh } = CONFIG.goal;
  if (Math.abs(p.x) > gw / 2 || p.y > gh) return 0;
  if (p.z < -(L / 2 + radius)) return -1;
  if (p.z > L / 2 + radius) return 1;
  return 0;
}

// True when the ball crossed an end line outside the goal.
export function isOutOfPlay(p, radius) {
  return Math.abs(p.z) > CONFIG.field.length / 2 + radius && goalSide(p, radius) === 0;
}

// Visuals (needs a browser for the canvas texture).
export function buildFieldVisuals(scene) {
  const { width: W, length: L } = CONFIG.field;
  const { width: gw, height: gh, depth: gd, post } = CONFIG.goal;

  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 30, L + 40),
    new THREE.MeshStandardMaterial({ color: 0x2c6e3b, roughness: 1 })
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.01;
  surround.receiveShadow = true;
  scene.add(surround);

  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(W, L),
    new THREE.MeshStandardMaterial({ map: pitchTexture(W, L), roughness: 0.95 })
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  scene.add(pitch);

  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const net = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.35 });

  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    const postGeo = new THREE.CylinderGeometry(post / 2, post / 2, gh, 12);
    for (const x of [-(gw / 2 + post / 2), gw / 2 + post / 2]) {
      const m = new THREE.Mesh(postGeo, white);
      m.position.set(x, gh / 2, 0);
      m.castShadow = true;
      g.add(m);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(post / 2, post / 2, gw + post * 2, 12), white);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = gh + post / 2;
    bar.castShadow = true;
    g.add(bar);

    const back = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh, 14, 6), net);
    back.position.set(0, gh / 2, s * gd);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd, 14, 4), net);
    roof.rotation.x = Math.PI / 2;
    roof.position.set(0, gh, s * gd / 2);
    g.add(back, roof);
    for (const x of [-gw / 2, gw / 2]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(gd, gh, 4, 6), net);
      side.rotation.y = Math.PI / 2;
      side.position.set(x, gh / 2, s * gd / 2);
      g.add(side);
    }
    g.position.z = s * L / 2;
    scene.add(g);
  }

  // Advertising boards along the touchlines
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x14375e, roughness: 0.6 });
  for (const x of [-(W / 2 + 1.5), W / 2 + 1.5]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, L + gd * 2), boardMat);
    b.position.set(x, 0.45, 0);
    b.receiveShadow = true;
    scene.add(b);
  }
}

function pitchTexture(W, L) {
  const ppm = 24; // pixels per meter
  const c = document.createElement('canvas');
  c.width = W * ppm;
  c.height = L * ppm;
  const g = c.getContext('2d');

  const stripes = 12;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? '#3a8a47' : '#347d40';
    g.fillRect(0, (i * c.height) / stripes, c.width, c.height / stripes + 1);
  }

  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 0.12 * ppm;
  const m = (v) => v * ppm;
  const line = 0.5;
  g.strokeRect(m(line), m(line), c.width - m(line * 2), c.height - m(line * 2));
  g.beginPath(); g.moveTo(m(line), c.height / 2); g.lineTo(c.width - m(line), c.height / 2); g.stroke();
  g.beginPath(); g.arc(c.width / 2, c.height / 2, m(5), 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'white';
  g.beginPath(); g.arc(c.width / 2, c.height / 2, m(0.25), 0, Math.PI * 2); g.fill();

  for (const top of [true, false]) {
    const y = top ? m(line) : c.height - m(line);
    const dir = top ? 1 : -1;
    const box = (w, d) => g.strokeRect(c.width / 2 - m(w / 2), top ? y : y - m(d), m(w), m(d));
    box(20, 9);  // penalty area
    box(10, 3.5); // six-yard box
    g.beginPath(); g.arc(c.width / 2, y + dir * m(7), m(0.2), 0, Math.PI * 2); g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
