import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';

// Pooled visual effects: bullet tracers, impact sparks, muzzle flash.
// Call effects.tracer(a, b) / effects.impact(p, color) from anywhere.
const TRACERS = 24;
const SPARKS = 160;

const queue = { tracers: [], impacts: [], flashes: [] };
export const effects = {
  tracer: (from, to) => queue.tracers.push([from.clone(), to.clone()]),
  impact: (point, color = '#ffd27a', count = 8) => queue.impacts.push({ point: point.clone(), color, count }),
  muzzle: (point) => queue.flashes.push(point.clone()),
};

export function Effects() {
  const tracerGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRACERS * 6), 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(TRACERS * 2), 1));
    return g;
  }, []);
  const tracerMat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(1.0, 0.85, 0.5, vA); }',
  }), []);
  const tracerLife = useRef(new Float32Array(TRACERS));
  const tracerNext = useRef(0);

  const sparks = useRef();
  const sparkData = useMemo(() => Array.from({ length: SPARKS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, color: new THREE.Color() })), []);
  const sparkNext = useRef(0);
  const flash = useRef();
  const flashLife = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, dt) => {
    // tracers
    const pos = tracerGeo.attributes.position.array;
    const alpha = tracerGeo.attributes.alpha.array;
    for (const [a, b] of queue.tracers) {
      const i = tracerNext.current++ % TRACERS;
      pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
      tracerLife.current[i] = 0.07;
    }
    for (let i = 0; i < TRACERS; i++) {
      tracerLife.current[i] = Math.max(0, tracerLife.current[i] - dt);
      alpha[i * 2] = alpha[i * 2 + 1] = tracerLife.current[i] / 0.07;
    }
    tracerGeo.attributes.position.needsUpdate = true;
    tracerGeo.attributes.alpha.needsUpdate = true;

    // sparks
    for (const imp of queue.impacts) {
      for (let k = 0; k < imp.count; k++) {
        const s = sparkData[sparkNext.current++ % SPARKS];
        s.p.copy(imp.point);
        s.v.set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).multiplyScalar(5);
        s.life = 0.25 + Math.random() * 0.3;
        s.color.set(imp.color);
      }
    }
    const mesh = sparks.current;
    if (mesh) {
      for (let i = 0; i < SPARKS; i++) {
        const s = sparkData[i];
        if (s.life > 0) {
          s.life -= dt;
          s.v.y -= 12 * dt;
          s.p.addScaledVector(s.v, dt);
        }
        dummy.position.copy(s.p);
        dummy.scale.setScalar(s.life > 0 ? 0.05 + s.life * 0.08 : 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, s.color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // muzzle flash
    if (queue.flashes.length && flash.current) {
      flash.current.position.copy(queue.flashes[queue.flashes.length - 1]);
      flashLife.current = 0.05;
    }
    flashLife.current = Math.max(0, flashLife.current - dt);
    if (flash.current) {
      flash.current.intensity = flashLife.current > 0 ? 40 : 0;
      flash.current.children[0].visible = flashLife.current > 0;
      flash.current.children[0].rotation.z = Math.random() * 6;
    }
    queue.tracers.length = queue.impacts.length = queue.flashes.length = 0;
  });

  return (
    <>
      <lineSegments geometry={tracerGeo} material={tracerMat} frustumCulled={false} />
      <instancedMesh ref={sparks} args={[null, null, SPARKS]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <pointLight ref={flash} color="#ffb347" distance={8} decay={2} intensity={0}>
        <mesh visible={false}>
          <planeGeometry args={[0.35, 0.35]} />
          <meshBasicMaterial color="#ffd27a" transparent opacity={0.9} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </pointLight>
    </>
  );
}
