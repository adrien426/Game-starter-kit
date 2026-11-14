import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { CapsuleCollider, RigidBody } from '@react-three/rapier';
import { ASSET, CONFIG } from '../config';
import { runtime } from '../core/runtime';
import { useGame } from '../core/store';
import { sfx } from '../core/audio';
import { effects } from '../combat/Effects';
import { Animator, useCharacterModel } from '../player/character';
import { LAYOUT, rng } from '../world/cityLayout';

const N = CONFIG.npc;
const Y = CONFIG.city.sidewalkHeight;
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();

// ---------- wounds: blood spots stuck to the bone that was hit ----------
const WOUND_GEO = new THREE.SphereGeometry(1, 8, 6);
// bright, slightly glossy red so it reads on dark clothes too
const WOUND_MATS = ['#b01010', '#8f0909', '#c41a12'].map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: '#3a0000', roughness: 0.25, metalness: 0.05 }));
const POOL_GEO = new THREE.CircleGeometry(1, 20);
const POOL_MAT = new THREE.MeshStandardMaterial({ color: '#4a0303', roughness: 0.2, metalness: 0.15, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const WOUND_BONES = ['Head', 'Neck', 'Spine2', 'Spine1', 'Spine', 'Hips', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];

/** Adds 1-3 blood spots on the bone closest to the hit point. */
function addWound(bones, hitPoint, wounds, big) {
  const point = hitPoint.clone();
  let best = null;
  let bestD = Infinity;
  for (const name of WOUND_BONES) {
    const b = bones[name];
    if (!b) continue;
    const d = b.getWorldPosition(v2).distanceToSquared(point);
    if (d < bestD) { bestD = d; best = b; }
  }
  if (!best) return;
  const n = big ? 4 : 2 + Math.floor(Math.random() * 2);
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(WOUND_GEO, WOUND_MATS[Math.floor(Math.random() * WOUND_MATS.length)]);
    const local = best.worldToLocal(v2.copy(point));
    // keep the spot on the surface, around the bone (~body radius)
    if (local.length() > 0.11) local.setLength(0.11);
    local.add(v1.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12));
    m.position.copy(local);
    const r = (big ? 0.09 : 0.065) + Math.random() * 0.04;
    m.scale.set(r, r * (0.6 + Math.random() * 0.6), r * 0.45);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    best.add(m);
    wounds.push(m);
  }
}

/** Sidewalk loop around a block: 4 corners, walked clockwise. */
function blockLoop(block) {
  const h = CONFIG.city.blockSize / 2 - 1.8;
  return [
    new THREE.Vector3(block.x - h, Y, block.z - h),
    new THREE.Vector3(block.x + h, Y, block.z - h),
    new THREE.Vector3(block.x + h, Y, block.z + h),
    new THREE.Vector3(block.x - h, Y, block.z + h),
  ];
}

export function Pedestrians() {
  const list = useMemo(() => {
    const r = rng(42);
    const blocks = LAYOUT.filter((b) => b.kind !== 'test');
    return Array.from({ length: N.count }, (_, i) => ({
      id: i,
      url: N.models[i % N.models.length],
      loop: blockLoop(blocks[Math.floor(r() * blocks.length)]),
      start: r() * 4,
      dir: r() < 0.5 ? 1 : -1,
    }));
  }, []);
  return list.map((p) => <Pedestrian key={p.id} {...p} />);
}

/**
 * A pedestrian: walks along a loop, runs away when attacked, dies (Dive
 * clip) and respawns later. The collider is a sensor (vehicles do not
 * bounce on it) but bullets and punches find it through runtime.damageables.
 */
function Pedestrian({ url, loop, start, dir }) {
  const body = useRef();
  const collider = useRef();
  const group = useRef();
  const { model, mixer, actions, bones } = useCharacterModel(url);
  const wounds = useRef([]);
  const pool = useRef();
  const animator = useMemo(() => new Animator(actions), [actions]);
  const s = useRef({ t: start, dir, health: N.health, state: 'walk', timer: 0, pos: new THREE.Vector3(), yaw: 0, pushed: new THREE.Vector3() });

  const pointAt = (t, out) => {
    const n = loop.length;
    const k = ((Math.floor(t) % n) + n) % n;
    const a = loop[k];
    const b = loop[(k + 1) % n];
    return out.lerpVectors(a, b, t - Math.floor(t));
  };

  useEffect(() => {
    let handle = null;
    const id = setInterval(() => {
      if (!collider.current) return;
      clearInterval(id);
      handle = collider.current.handle;
      runtime.damageables.set(handle, {
        npc: true,
        pos: s.current.pos, // feet position, read by tools / aim assist
        hit: (damage, point, hitDir, source) => {
          const st = s.current;
          if (st.state === 'dead') return;
          st.health -= damage;
          addWound(bones, point, wounds.current, damage >= 30);
          sfx.hit();
          if (st.health <= 0) {
            st.state = 'dead';
            st.timer = 0;
            st.pushed.copy(hitDir).setY(0).normalize().multiplyScalar(2.5);
            animator.play('Dying', { once: true, fade: 0.1, timeScale: 1.4 });
            if (source === 'player') { useGame.getState().addKill(); useGame.getState().addMoney(20 + Math.floor(Math.random() * 60)); }
          } else {
            st.state = 'hurt';
            st.timer = 0.6;
            animator.play(Math.random() < 0.5 ? 'HeadHit' : 'TakingPunch', { once: true, fade: 0.08, timeScale: 1.6, restart: true });
            // run away from the attacker
            const ahead = pointAt(st.t + 0.05 * st.dir, v1).sub(st.pos);
            if (ahead.dot(hitDir) < 0) st.dir *= -1;
          }
        },
      });
    }, 30);
    return () => { clearInterval(id); if (handle !== null) runtime.damageables.delete(handle); };
  }, [animator, bones]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const st = s.current;
    const perimeter = (CONFIG.city.blockSize - 3.6) ; // length of one side
    if (st.state === 'dead') {
      st.timer += dt;
      st.pos.addScaledVector(st.pushed, dt);
      st.pushed.multiplyScalar(Math.exp(-4 * dt));
      if (st.timer > N.respawnDelay) {
        st.state = 'walk'; st.health = N.health; st.t = Math.random() * 4;
        for (const w of wounds.current) w.parent?.remove(w);
        wounds.current.length = 0;
      }
    } else if (st.state === 'hurt') {
      st.timer -= dt;
      if (st.timer <= 0) { st.state = 'flee'; st.timer = 6; }
    } else {
      const speed = st.state === 'flee' ? N.fleeSpeed : N.walkSpeed;
      st.t += (st.dir * speed * dt) / perimeter;
      pointAt(st.t, st.pos);
      const ahead = pointAt(st.t + 0.02 * st.dir, v1);
      const targetYaw = Math.atan2(ahead.x - st.pos.x, ahead.z - st.pos.z);
      let d = targetYaw - st.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      st.yaw += d * Math.min(1, dt * 8);
      if (st.state === 'flee') {
        st.timer -= dt;
        if (st.timer <= 0) st.state = 'walk';
        animator.play('Running', { fade: 0.2, timeScale: 0.9 });
      } else {
        animator.play('Walk', { fade: 0.3, timeScale: 0.85 });
      }
      // run over by a vehicle?
      for (const v of runtime.vehicles.values()) {
        if (!v.handle?.body) continue;
        const lv = v.handle.body.linvel(); // read the body: a sleeping vehicle has stale ecctrl values
        const sp = Math.hypot(lv.x, lv.y, lv.z);
        if (sp < 5) continue;
        if (v.handle.currPos.distanceTo(v1.copy(st.pos).setY(v.handle.currPos.y)) < v.def.size[0] * 0.5 + 0.7 && Math.abs(v.handle.currPos.y - st.pos.y) < 2.5) {
          st.state = 'dead'; st.timer = 0; st.health = 0;
          st.pushed.copy(v.handle.currLinVel).setY(0).multiplyScalar(0.6);
          animator.play('FallFlat', { once: true, fade: 0.05, timeScale: 1.5 });
          addWound(bones, v2.copy(st.pos).setY(st.pos.y + 1.1), wounds.current, true);
          addWound(bones, v2.copy(st.pos).setY(st.pos.y + 0.5), wounds.current, true);
          effects.impact(v1.copy(st.pos).setY(st.pos.y + 1), '#b0102a', 14);
          sfx.punch();
          if (v.driver === 'player') { useGame.getState().addKill(); }
        }
      }
    }
    body.current?.setNextKinematicTranslation({ x: st.pos.x, y: st.pos.y + 0.9, z: st.pos.z });
    if (group.current) {
      group.current.position.copy(st.pos);
      group.current.rotation.y = st.yaw;
    }
    // animate only when close enough (cheap LOD)
    // blood pool growing under a dead body
    if (pool.current) {
      const grow = st.state === 'dead' ? Math.min(1, st.timer / 4) : 0;
      pool.current.visible = grow > 0;
      pool.current.position.set(st.pos.x, st.pos.y + 0.02, st.pos.z);
      pool.current.scale.setScalar(0.15 + grow * 0.75);
    }
    // animate (and draw) only near the player: lets the city hold more NPCs
    const d2 = runtime.focus.distanceToSquared(st.pos);
    if (d2 < N.animDistance * N.animDistance) mixer.update(dt);
    if (group.current) group.current.visible = d2 < 160 * 160;
  });

  return (
    <>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[loop[0].x, loop[0].y + 0.9, loop[0].z]} userData={{ type: 'npc', ecctrl: { excludeRay: true } }}>
        <CapsuleCollider ref={collider} args={[0.55, 0.3]} sensor />
      </RigidBody>
      <mesh ref={pool} geometry={POOL_GEO} material={POOL_MAT} rotation-x={-Math.PI / 2} visible={false} />
      <group ref={group}>
        <primitive object={model} />
      </group>
    </>
  );
}

for (const u of N.models) useGLTF.preload(ASSET(u));
