import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useRapier } from '@react-three/rapier';
import { Ecctrl } from 'ecctrl';
import { ASSET, CONFIG, WEAPONS } from '../config';
import { input } from '../core/input';
import { runtime, nearestVehicle } from '../core/runtime';
import { useGame } from '../core/store';
import { sfx } from '../core/audio';
import { computeAimPoint, fireBullet, meleeHit } from '../combat/combat';
import { aimBoneAt, Animator, useCharacterModel } from './character';

const P = CONFIG.player;
const FEET = -(P.capsuleHalfHeight + P.capsuleRadius + P.floatHeight);
const EMOTES = ['Salute', 'Taunt', 'HipHopDancing', 'Victory'];

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const flatDir = new THREE.Vector3();
const localVel = new THREE.Vector3();
const invQ = new THREE.Quaternion();

/** One gun model per weapon, cloned so it can be shown in the hand. */
function useWeaponModels() {
  const urls = WEAPONS.filter((w) => w.model).map((w) => ASSET(w.model));
  const gltfs = useGLTF(urls);
  return useMemo(() => {
    const map = {};
    let i = 0;
    for (const w of WEAPONS) {
      if (!w.model) continue;
      const obj = gltfs[i++].scene.clone();
      obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const holder = new THREE.Group();
      // grip ~ 30% from the back of the gun, slightly below the center
      obj.position.set(-center.x, -center.y - size.y * 0.15, -box.min.z - size.z * 0.3);
      holder.add(obj);
      // rescale to the real length (the pistol file is 3 m long!)
      const longest = Math.max(size.x, size.y, size.z);
      const k = (w.length ?? 0.5) / longest;
      holder.scale.setScalar(k);
      holder.userData.length = size.z * k;
      map[w.id] = holder;
    }
    return map;
  }, [gltfs]);
}

export function Player() {
  const modelUrl = useGame((s) => s.playerModel);
  return <PlayerBody key={modelUrl} modelUrl={modelUrl} />;
}

function PlayerBody({ modelUrl }) {
  const handle = useRef(null);
  const follow = useRef(null);
  const gunSlot = useRef(null);
  const { world, rapier } = useRapier();
  const { camera } = useThree();
  const spawn = useMemo(() => useGame.getState().exitPosition ?? (runtime.player ? runtime.player.currPos.toArray() : P.spawn), []);
  const { model, mixer, actions, bones } = useCharacterModel(modelUrl);
  const animator = useMemo(() => new Animator(actions), [actions]);
  const guns = useWeaponModels();
  const s = useRef({ action: null, punchSide: 0, combo: 0, lastPunch: 0, kickSide: 0, guard: false, emote: -1, cooldown: 0, combatT: 0, reloadT: 0, deadT: 0, aimW: 0, airT: 0, lastHealth: P.maxHealth });

  // Register the player in the shared runtime + as a damage target
  useEffect(() => {
    let colliderHandle = null;
    const id = setInterval(() => {
      if (!handle.current?.collider) return;
      clearInterval(id);
      runtime.player = handle.current;
      runtime.playerObject = follow.current;
      colliderHandle = handle.current.collider.handle;
      runtime.damageables.set(colliderHandle, {
        hit: (damage, _p, dir) => {
          useGame.getState().damage(s.current.guard ? damage * 0.25 : damage);
          handle.current?.body.applyImpulse({ x: dir.x * 2, y: 1, z: dir.z * 2 }, true);
        },
      });
    }, 16);
    return () => {
      clearInterval(id);
      runtime.player = null;
      runtime.playerObject = null;
      if (colliderHandle !== null) runtime.damageables.delete(colliderHandle);
    };
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const h = handle.current;
    if (!h?.body) return;
    const st = s.current;
    const game = useGame.getState();
    const playing = game.phase === 'playing' && !game.dead;
    const weapon = WEAPONS[game.weaponIndex];
    const armed = weapon.id !== 'fists';
    const act = st.action; // current one-shot move (punch, kick, roll, emote, hit)
    const busy = !!act && act.lockMove;

    // ---------- movement (ecctrl does the physics) ----------
    const stick = input.stick;
    const canMove = playing && !busy;
    h.setMovement({
      forward: canMove && !stick.touch && input.held('forward'),
      backward: canMove && !stick.touch && input.held('backward'),
      leftward: canMove && !stick.touch && input.held('left'),
      rightward: canMove && !stick.touch && input.held('right'),
      joystick: canMove && stick.touch ? { x: stick.x, y: stick.y } : { x: 0, y: 0 },
      run: canMove && input.held('run') && !game.aiming,
      jump: canMove && input.held('jump'),
    });

    // ---------- aiming: the character faces the camera direction ----------
    const aimHeld = playing && armed && input.held('aim');
    const faceCamera = playing && armed && (aimHeld || input.held('fire'));
    if (aimHeld !== game.aiming) useGame.setState({ aiming: aimHeld });
    h.setLockForward(faceCamera);
    flatDir.set(runtime.aimDir.x, 0, runtime.aimDir.z).normalize();

    // ---------- weapons and moves ----------
    st.cooldown -= dt;
    st.reloadT -= dt;
    st.combatT -= dt;
    const startAction = (name, opts) => {
      const a = animator.play(name, { once: true, fade: 0.08, timeScale: opts.timeScale ?? 1, restart: true });
      if (!a) return;
      st.action = { name, t: 0, dur: a.getClip().duration / (opts.timeScale ?? 1), hit: false, ...opts };
    };
    if (playing && !game.dead) {
      if (input.pressed('nextWeapon')) game.setWeapon(game.weaponIndex + 1);
      for (let i = 0; i < 3; i++) if (input.pressed('weapon' + (i + 1)) && WEAPONS[i]) game.setWeapon(i);
      if (input.pressed('reload') && armed && game.reload(weapon.id)) { st.reloadT = 1.1; sfx.door(); }

      const trigger = weapon.auto ? input.held('fire') : input.pressed('fire');
      const free = !act || act.cancelable;
      const guarding = !armed && input.held('aim') && h.isOnGround && !act;
      st.guard = guarding;
      if (!armed && trigger && free && h.isOnGround) {
        // combo with the Drive clips: jab -> jab-cross -> fist-fight finisher
        const now = performance.now() / 1000;
        st.combo = now - st.lastPunch < 1.1 ? (st.combo + 1) % 3 : 0;
        st.lastPunch = now;
        const C = CONFIG.combat;
        if (st.combo === 0) startAction('LeadJab', { timeScale: 1.7, hits: [0.28], damage: C.punchDamage, maxT: 0.7 });
        else if (st.combo === 1) startAction('JabCross', { timeScale: 1.7, hits: [0.25, 0.45], damage: C.punchDamage, maxT: 0.8 });
        else startAction('FistFightA', { timeScale: 1.8, hits: [0.35, 0.7, 1.1], damage: C.punchDamage * 1.4, maxT: 1.5, lockMove: true });
        st.combatT = 4;
            } else if (armed && trigger && st.cooldown <= 0 && st.reloadT <= 0 && st.aimW > 0.5) {
        st.cooldown = 1 / weapon.fireRate;
        if (game.useAmmo(weapon.id)) {
          const gun = guns[weapon.id];
          const muzzle = gun.localToWorld(v1.set(0, 0.02, gun.userData.length * 0.72 / gun.scale.x));
          const target = computeAimPoint(world, rapier, camera, h.body);
          fireBullet(world, rapier, muzzle, target, weapon, h.body);
          sfx.shot(weapon.id === 'rifle');
          runtime.camera.pitch += 0.008; // recoil
        } else if (game.reload(weapon.id)) {
          st.reloadT = 1.1; sfx.door();
        } else sfx.empty();
      }
      if (input.pressed('kick') && h.isOnGround && free) {
        st.kickSide ^= 1;
        if (st.kickSide) startAction('MmaKick', { timeScale: 1.5, hits: [0.42], damage: CONFIG.combat.kickDamage, lockMove: true, low: true });
        else startAction('KickToTheGroin', { timeScale: 1.8, hits: [0.55], damage: CONFIG.combat.kickDamage, lockMove: true, low: true, maxT: 1.2 });
        st.combatT = 4;
      }
      if (input.pressed('roll') && h.isOnGround && free) {
        const speed = Math.hypot(h.currLinVel.x, h.currLinVel.z);
        if (speed > 2) startAction('RunToRolling', { timeScale: 1.3, lockMove: false, from: 0.35 });
        else startAction('DodgingRight', { timeScale: 1.4, lockMove: true });
      }
      if (input.pressed('emote') && !act) {
        st.emote = (st.emote + 1) % EMOTES.length;
        startAction(EMOTES[st.emote], { lockMove: true, cancelOnMove: true });
      }
    }

    const forward = v2.copy(h.bodyZAxis).setY(0).normalize();
    const chest = v3.copy(h.currPos).add(v1.set(0, 0.35, 0));
    if (act) {
      act.t += dt;
      if (act.from && act.t === dt && animator.current) animator.current.time = act.from * animator.current.getClip().duration;
      const hits = act.hits ?? (act.hitAt ? [act.hitAt] : []);
      if (act.hitIndex === undefined) act.hitIndex = 0;
      if (act.hitIndex < hits.length && act.t >= hits[act.hitIndex]) {
        act.hitIndex++;
        const origin = act.low ? chest.add(v1.set(0, -0.3, 0)) : chest;
        if (meleeHit(world, rapier, origin, forward, act.damage, h.body)) sfx.punch();
      }
      const moving = input.stick.x !== 0 || input.stick.y !== 0;
      if (act.t >= (act.maxT ?? act.dur) || (act.cancelOnMove && moving && act.t > 0.3) || game.dead) st.action = null;
      else if (act.t > act.dur * 0.6) act.cancelable = true;
    }

    // ---------- get in a vehicle ----------
    if (playing && !game.dead) {
      const near = nearestVehicle(h.currPos, P.enterVehicleDistance);
      const free = near && !near.driver;
      game.setPrompt(free ? `F : conduire ${near.def.name}` : null);
      if (free && input.pressed('enter')) {
        near.driver = 'player';
        game.enterVehicle(near.id);
        sfx.door();
        return;
      }
    }

    // ---------- hit reaction / death / respawn / fell off the map ----------
    if (game.health < st.lastHealth && !game.dead && (!st.action || st.action.cancelable !== false)) {
      startAction(Math.random() < 0.5 ? 'HeadHit' : 'BigKidneyHit', { timeScale: 1.6, lockMove: true, maxT: 0.7, cancelable: true });
    }
    st.lastHealth = game.health;
    if (game.dead) {
      if (st.deadT === 0) animator.play('Dying', { once: true, fade: 0.15, timeScale: 1.3 });
      st.deadT += dt;
      if (st.deadT > P.respawnDelay) {
        st.deadT = 0;
        h.body.setTranslation({ x: P.spawn[0], y: P.spawn[1], z: P.spawn[2] }, true);
        h.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        game.heal();
        game.showToast('De retour en ville');
      }
    } else if (h.currPos.y < -30) {
      h.body.setTranslation({ x: P.spawn[0], y: P.spawn[1], z: P.spawn[2] }, true);
      h.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }

    // ---------- animation state (locomotion when no one-shot move plays) ----------
    if (!game.dead) {
      const speed = Math.hypot(h.currLinVel.x, h.currLinVel.z);
      const wasAir = st.airT;
      st.airT = h.isOnGround ? 0 : st.airT + dt;
      if (st.action) {
        // a one-shot move is playing
      } else if (st.airT > 0.12) {
        if (st.airT < 0.9) {
          // Mixamo "Jump": skip the crouch, hold the top of the jump
          const a = animator.play('Jump', { once: true, fade: 0.12, timeScale: 1.2 });
          if (a && a.time < 0.75) a.time = 0.75;
          if (a && a.time > 1.55) a.time = 1.55;
        } else animator.play('Falling', { fade: 0.4 });
      } else if (wasAir > 0.9) {
        startAction('JumpDown', { timeScale: 1.2, lockMove: false, maxT: 0.35, from: 0.5, cancelable: true });
      } else if (speed > 0.4) {
        if (faceCamera) {
          // strafe set while aiming
          invQ.copy(follow.current.getWorldQuaternion(new THREE.Quaternion())).invert();
          localVel.set(h.currLinVel.x, 0, h.currLinVel.z).applyQuaternion(invQ);
          let clip = 'Jog';
          if (Math.abs(localVel.x) > Math.abs(localVel.z)) clip = localVel.x > 0 ? 'StrafeLeft' : 'StrafeRight';
          else if (localVel.z < 0) clip = 'JogBack';
          animator.play(clip, { fade: 0.2, timeScale: THREE.MathUtils.clamp(speed / 3.2, 0.6, 1.4) });
        } else if (speed > (P.maxWalkVel + P.maxRunVel) / 2) {
          animator.play('Running', { fade: 0.25, timeScale: THREE.MathUtils.clamp(speed / 6, 0.7, 1.3) });
        } else {
          animator.play('Walk', { fade: 0.25, timeScale: THREE.MathUtils.clamp(speed / 1.6, 0.6, 1.6) });
        }
      } else if (st.guard) {
        const a = animator.play('LeftBlock', { once: true, fade: 0.1, timeScale: 1.5 });
        if (a && a.time > 0.45) a.time = 0.45; // hold the guard
      } else if (armed && weapon.twoHands && faceCamera) {
        animator.play('RifleAimingIdle', { fade: 0.25 });
      } else {
        animator.play(st.combatT > 0 && !armed ? 'Boxing' : 'Idle', { fade: 0.3 });
      }
    }
    mixer.update(dt);
    model.updateMatrixWorld(true);

    // ---------- procedural layer: arms follow the crosshair ----------
    st.aimW = THREE.MathUtils.lerp(st.aimW, faceCamera && !game.dead && st.reloadT <= 0 && !busy ? 1 : 0, 1 - Math.exp(-14 * dt));
    if (armed && st.aimW > 0.01 && bones.RightArm) {
      const target = computeAimPoint(world, rapier, camera, h.body);
      const dir = v1.subVectors(target, bones.RightArm.getWorldPosition(v2)).normalize();
      aimBoneAt(bones.RightArm, bones.RightForeArm, dir, st.aimW);
      aimBoneAt(bones.RightForeArm, bones.RightHand, dir, st.aimW);
      if (weapon.twoHands) {
        const front = bones.RightHand.getWorldPosition(v3).addScaledVector(dir, 0.32);
        aimBoneAt(bones.LeftArm, bones.LeftForeArm, v2.subVectors(front, bones.LeftArm.getWorldPosition(v2)).normalize(), st.aimW);
        aimBoneAt(bones.LeftForeArm, bones.LeftHand, v2.subVectors(front, bones.LeftForeArm.getWorldPosition(v2)).normalize(), st.aimW);
      }
    }

    // ---------- gun in the hand ----------
    const slot = gunSlot.current;
    for (const [id, g] of Object.entries(guns)) g.visible = id === weapon.id && !game.dead;
    if (slot && bones.RightHand) {
      bones.RightHand.getWorldPosition(slot.position);
      const handDir = v2.subVectors(slot.position, bones.RightForeArm.getWorldPosition(v3)).normalize();
      const aimDir = v3.subVectors(runtime.aimPoint, slot.position).normalize();
      const d = handDir.lerp(aimDir, st.aimW > 0.5 ? 1 : 0).normalize();
      slot.lookAt(v1.copy(slot.position).add(d));
    }
  });

  return (
    <>
      <Ecctrl
        ref={handle}
        position={spawn}
        capsuleHalfHeight={P.capsuleHalfHeight}
        capsuleRadius={P.capsuleRadius}
        floatHeight={P.floatHeight}
        maxWalkVel={P.maxWalkVel}
        maxRunVel={P.maxRunVel}
        jumpVel={P.jumpVel}
        enableToggleRun={false}
        userData={{ type: 'player' }}
      >
        <group ref={follow}>
          <primitive object={model} position={[0, FEET, 0]} />
        </group>
      </Ecctrl>
      <group ref={gunSlot}>
        {Object.entries(guns).map(([id, g]) => <primitive key={id} object={g} />)}
      </group>
    </>
  );
}

useGLTF.preload(ASSET(P.model));
for (const w of WEAPONS) if (w.model) useGLTF.preload(ASSET(w.model));
