import * as THREE from 'three';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, Sky, Stars } from '@react-three/drei';
import { CONFIG } from '../config';
import { runtime } from '../core/runtime';
import { useGame } from '../core/store';

const SUN_DIR = new THREE.Vector3(-0.55, 0.62, -0.42).normalize(); // late afternoon
const MOON_DIR = new THREE.Vector3(0.4, 0.75, 0.3).normalize();

/**
 * Sky + sun with soft shadows that follow the player + hemisphere fill +
 * an environment map made of light panels (nice reflections on the cars,
 * nothing to download). N toggles day / night.
 */
export function Lighting() {
  const sun = useRef();
  const hemi = useRef();
  const night = useGame((s) => s.night);
  const { scene } = useThree();
  const G = CONFIG.graphics;

  useEffect(() => {
    const color = night ? '#0b1020' : '#c9d6e3';
    scene.fog = new THREE.Fog(color, night ? 30 : G.fog[0], night ? 260 : G.fog[1]);
    scene.background = new THREE.Color(color);
  }, [night, scene, G.fog]);

  useFrame(() => {
    const l = sun.current;
    if (!l) return;
    const dir = night ? MOON_DIR : SUN_DIR;
    // snap to the shadow texel grid so shadows do not shimmer when moving
    const texel = G.shadowArea / G.shadowMapSize;
    const fx = Math.round(runtime.focus.x / texel) * texel;
    const fz = Math.round(runtime.focus.z / texel) * texel;
    l.target.position.set(fx, 0, fz);
    l.position.set(fx + dir.x * 120, dir.y * 120, fz + dir.z * 120);
    l.target.updateMatrixWorld();
  });

  const half = G.shadowArea / 2;
  return (
    <>
      {!night && <Sky distance={4500} sunPosition={SUN_DIR.clone().multiplyScalar(100).toArray()} turbidity={6} rayleigh={1.4} mieCoefficient={0.006} mieDirectionalG={0.86} />}
      {night && <Stars radius={300} depth={60} count={4000} factor={5} fade speed={0.5} />}
      <hemisphereLight ref={hemi} args={[night ? '#3a4a78' : '#cfe3ff', night ? '#0d0d14' : '#6b5a45', night ? 0.25 : 0.85]} />
      <ambientLight intensity={night ? 0.05 : 0.12} />
      <directionalLight
        ref={sun}
        color={night ? '#9fb6ff' : '#ffe2b8'}
        intensity={night ? 0.35 : 2.6}
        castShadow={G.shadows}
        shadow-mapSize={[G.shadowMapSize, G.shadowMapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={1}
        shadow-camera-far={400}
      />
      <Environment resolution={256} frames={1} environmentIntensity={night ? 0.15 : 0.6}>
        <Lightformer intensity={2} rotation-x={Math.PI / 2} position={[0, 5, -9]} scale={[10, 10, 1]} />
        <Lightformer intensity={2} rotation-x={Math.PI / 2} position={[0, 5, -3]} scale={[10, 2, 1]} />
        <Lightformer intensity={1.5} rotation-y={Math.PI / 2} position={[-5, 1, -1]} scale={[20, 0.5, 1]} />
        <Lightformer intensity={1.5} rotation-y={-Math.PI / 2} position={[10, 1, 0]} scale={[20, 1, 1]} />
        <Lightformer form="ring" color="#ffd7a8" intensity={4} scale={6} position={[-15, 6, -18]} target={[0, 0, 0]} />
        <mesh scale={100}>
          <sphereGeometry args={[1, 32, 16]} />
          <meshBasicMaterial color={night ? '#05070d' : '#8fa6bf'} side={THREE.BackSide} />
        </mesh>
      </Environment>
    </>
  );
}
