import * as THREE from 'three';
import { useMemo, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ASSET } from '../config';

export const ANIMATIONS_URL = 'models/characters/animations.glb';

/**
 * Loads a Mixamo character (bones renamed by scripts/build-player.mjs) and
 * binds the shared animation library to it.
 * Returns { model, mixer, actions, bones }.
 */
export function useCharacterModel(url) {
  const { scene } = useGLTF(ASSET(url));
  const { animations } = useGLTF(ASSET(ANIMATIONS_URL));

  const data = useMemo(() => {
    const model = cloneSkinned(scene);
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false; // skinned meshes have wrong bounds when animated
      }
    });
    const bones = {};
    model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    const restY = bones.Hips ? bones.Hips.position.y : 1;
    // Library clips store the hips height normalized (1 = rest height): rescale
    // it for this character so the feet touch the ground.
    const clips = animations.map((c) => {
      const clip = c.clone();
      for (const t of clip.tracks) {
        if (t.name === 'Hips.position') {
          t.values = t.values.slice();
          for (let i = 0; i < t.values.length; i++) t.values[i] *= restY;
        }
      }
      return clip;
    });
    const mixer = new THREE.AnimationMixer(model);
    const actions = Object.fromEntries(clips.map((c) => [c.name, mixer.clipAction(c)]));
    return { model, mixer, actions, bones };
  }, [scene, animations]);

  useEffect(() => () => data.mixer.stopAllAction(), [data]);
  return data;
}

/** Small helper that cross-fades between named clips. */
export class Animator {
  constructor(actions) {
    this.actions = actions;
    this.current = null;
    this.name = '';
  }

  play(name, { fade = 0.2, once = false, timeScale = 1, clamp = true, restart = false } = {}) {
    const next = this.actions[name];
    if (!next) return null;
    next.timeScale = timeScale;
    if (this.name === name && !restart) return next;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once && clamp;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (this.current && this.current !== next) next.crossFadeFrom(this.current, fade, false);
    next.play();
    this.current = next;
    this.name = name;
    return next;
  }

  /** 0..1 progress of the current clip */
  progress() {
    if (!this.current) return 0;
    return this.current.time / this.current.getClip().duration;
  }
}

// ---------- procedural bone helpers (aim, punch) ----------
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _pq = new THREE.Quaternion();

/** Rotates `bone` so that the segment bone -> child points to `dirWorld`. */
export function aimBoneAt(bone, child, dirWorld, weight = 1) {
  if (!bone || !child || weight <= 0) return;
  bone.getWorldPosition(_a);
  child.getWorldPosition(_b);
  _b.sub(_a).normalize();
  _q.setFromUnitVectors(_b, dirWorld);
  bone.getWorldQuaternion(_wq);
  bone.parent.getWorldQuaternion(_pq);
  _q.multiply(_wq); // new world rotation
  _pq.invert().multiply(_q); // back to local
  bone.quaternion.slerp(_pq, weight);
  bone.updateMatrixWorld(true);
}

/** Adds a world-space rotation to a bone (used to bend the spine). */
export function rotateBoneWorld(bone, axisWorld, angle, weight = 1) {
  if (!bone || weight <= 0) return;
  _q.setFromAxisAngle(axisWorld, angle * weight);
  bone.getWorldQuaternion(_wq);
  bone.parent.getWorldQuaternion(_pq);
  _q.multiply(_wq);
  _pq.invert().multiply(_q);
  bone.quaternion.copy(_pq);
  bone.updateMatrixWorld(true);
}

useGLTF.preload(ASSET(ANIMATIONS_URL));
