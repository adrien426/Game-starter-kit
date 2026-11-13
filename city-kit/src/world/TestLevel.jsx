import * as THREE from 'three';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { Text } from '@react-three/drei';
import { CONFIG } from '../config';
import { CELL } from './cityLayout';

const Y = CONFIG.city.sidewalkHeight;

// Colorful "grey-box" materials
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });
const M = {
  white: mat('#e8e4dc'),
  orange: mat('#ff8a3d'),
  teal: mat('#2bb3a3'),
  purple: mat('#7b5cff'),
  yellow: mat('#ffd23f'),
  red: mat('#ef476f'),
  dark: mat('#2d3142'),
  crate: mat('#b07b46', { roughness: 0.8 }),
};

/** A fixed box with its collider. rotation in radians. */
function Block({ position, size, rotation = [0, 0, 0], material = M.white }) {
  // 'YXZ' = turn (yaw) first, then tilt: what we want for ramps
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2], 'YXZ'));
  return (
    <RigidBody type="fixed" colliders={false} position={position} quaternion={quaternion} friction={1}>
      <CuboidCollider args={size.map((s) => s / 2)} />
      <mesh castShadow receiveShadow material={material}>
        <boxGeometry args={size} />
      </mesh>
    </RigidBody>
  );
}

/** Ramp: a tilted box whose top starts at ground level. */
function Ramp({ x, z, length, width, angle, yaw = 0, material }) {
  const t = 0.4;
  const h = Math.sin(angle) * length;
  const cy = Y + h / 2 - Math.cos(angle) * t / 2;
  const dz = (Math.cos(angle) * length) / 2;
  const pos = [x + Math.sin(yaw) * dz, cy, z + Math.cos(yaw) * dz];
  return <Block position={pos} size={[width, t, length]} rotation={[-angle, yaw, 0]} material={material} />;
}

function MovingPlatform({ from, to, speed = 0.4, size = [4, 0.4, 4], material = M.purple }) {
  const body = useRef();
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const p = new THREE.Vector3();
  useFrame(({ clock }) => {
    const t = (Math.sin(clock.elapsedTime * speed) + 1) / 2;
    p.lerpVectors(a, b, t);
    body.current?.setNextKinematicTranslation(p);
  });
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={from}>
      <CuboidCollider args={size.map((s) => s / 2)} />
      <mesh castShadow receiveShadow material={material}><boxGeometry args={size} /></mesh>
    </RigidBody>
  );
}

function Spinner({ position }) {
  const body = useRef();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  useFrame(({ clock }) => {
    q.setFromAxisAngle(up, clock.elapsedTime * 0.6);
    body.current?.setNextKinematicRotation(q);
  });
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={position}>
      <CylinderCollider args={[0.2, 4]} />
      <mesh castShadow receiveShadow material={M.teal}><cylinderGeometry args={[4, 4, 0.4, 40]} /></mesh>
      <mesh position={[0, 0.5, 3]} castShadow material={M.yellow}><boxGeometry args={[0.6, 0.6, 0.6]} /></mesh>
    </RigidBody>
  );
}

function Crates({ origin }) {
  const crates = [];
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3 - x; y++)
    crates.push([origin[0] + x * 1.05 + y * 0.52, origin[1] + 0.5 + y * 1.0, origin[2]]);
  return crates.map((p, i) => (
    <RigidBody key={i} position={p} colliders="cuboid" mass={0.6} friction={0.8}>
      <mesh castShadow receiveShadow material={M.crate}><boxGeometry args={[1, 1, 1]} /></mesh>
    </RigidBody>
  ));
}

/**
 * Test level (block north of the spawn): stairs, jump platforms, ramps of
 * several slopes, a car jump, a moving lift, a spinning disk and crates.
 */
export function TestLevel() {
  const cx = 0;
  const cz = CELL; // block (0, 1)
  const stairs = [];
  for (let i = 0; i < 10; i++) stairs[i] = <Block key={i} position={[cx - 18, Y + (i + 1) * 0.125, cz - 16 + i * 0.6]} size={[4, (i + 1) * 0.25, 0.6]} material={i % 2 ? M.white : M.orange} />;

  return (
    <group>
      <Text position={[cx, Y + 6, cz - 23]} fontSize={2.2} color="#ffffff" outlineColor="#000" outlineWidth={0.06} anchorX="center">TERRAIN D'ESSAI</Text>

      {/* stairs + landing */}
      {stairs}
      <Block position={[cx - 18, Y + 1.25, cz - 8.6]} size={[4, 2.5, 3]} material={M.white} />

      {/* jump course */}
      <Block position={[cx - 10, Y + 0.5, cz - 14]} size={[3, 1, 3]} material={M.teal} />
      <Block position={[cx - 6, Y + 1.0, cz - 14]} size={[3, 2, 3]} material={M.purple} />
      <Block position={[cx - 2, Y + 1.6, cz - 14]} size={[3, 3.2, 3]} material={M.red} />
      <Block position={[cx + 2.5, Y + 2.2, cz - 14]} size={[3, 4.4, 3]} material={M.yellow} />

      {/* walking ramps 10°, 20°, 30°, 45° */}
      <Ramp x={cx - 12} z={cz - 4} length={8} width={3} angle={THREE.MathUtils.degToRad(10)} material={M.teal} />
      <Ramp x={cx - 8} z={cz - 4} length={8} width={3} angle={THREE.MathUtils.degToRad(20)} material={M.purple} />
      <Ramp x={cx - 4} z={cz - 4} length={8} width={3} angle={THREE.MathUtils.degToRad(30)} material={M.orange} />
      <Ramp x={cx + 0} z={cz - 4} length={6} width={3} angle={THREE.MathUtils.degToRad(45)} material={M.red} />

      {/* car jump: long ramp + landing ramp */}
      <Ramp x={cx + 14} z={cz - 20} length={14} width={7} angle={THREE.MathUtils.degToRad(13)} material={M.yellow} />
      <Ramp x={cx + 14} z={cz + 22} length={10} width={7} angle={THREE.MathUtils.degToRad(12)} yaw={Math.PI} material={M.yellow} />

      {/* lift and spinner */}
      <MovingPlatform from={[cx - 18, Y + 0.3, cz + 4]} to={[cx - 18, Y + 6, cz + 4]} />
      <MovingPlatform from={[cx - 12, Y + 6, cz + 4]} to={[cx - 2, Y + 6, cz + 4]} speed={0.5} material={M.teal} />
      <Block position={[cx + 3, Y + 3, cz + 4]} size={[4, 6, 4]} material={M.dark} />
      <Spinner position={[cx - 8, Y + 0.2, cz + 15]} />

      {/* physics toys */}
      <Crates origin={[cx + 2, Y, cz + 14]} />
      {[0, 1, 2, 3].map((i) => (
        <RigidBody key={'b' + i} colliders="ball" position={[cx + 6 + i * 1.5, Y + 1, cz + 18]} mass={0.3} restitution={0.6}>
          <mesh castShadow material={i % 2 ? M.red : M.yellow}><sphereGeometry args={[0.5, 24, 16]} /></mesh>
        </RigidBody>
      ))}
    </group>
  );
}
