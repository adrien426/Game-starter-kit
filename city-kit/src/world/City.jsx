import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import { useGLTF, useTexture } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { ASSET, CONFIG } from '../config';
import { useGame } from '../core/store';
import { CELL, CITY_HALF, LAYOUT, roadLines, rng } from './cityLayout';

const { blockSize, roadWidth, sidewalkHeight } = CONFIG.city;

// ---------- procedural facade textures (windows) ----------
const STYLES = [
  { wall: '#c9b8a6', frame: '#8a7a6b', glass: '#2c3e50', lit: '#ffd58a' },
  { wall: '#9aa7b4', frame: '#5f6b77', glass: '#1d2b3a', lit: '#fff1c1' },
  { wall: '#d9d4cc', frame: '#b0a89c', glass: '#304860', lit: '#ffe0a0' },
  { wall: '#6d7f8f', frame: '#3e4a56', glass: '#5d8fb8', lit: '#cfe8ff' },
];
const CELLS = 8; // windows per texture side

function facadeTextures(style, seed) {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const e = document.createElement('canvas');
  e.width = e.height = s;
  const ge = e.getContext('2d');
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, s, s);
  g.fillStyle = style.wall;
  g.fillRect(0, 0, s, s);
  const r = rng(seed);
  const cell = s / CELLS;
  for (let y = 0; y < CELLS; y++) {
    for (let x = 0; x < CELLS; x++) {
      const px = x * cell + cell * 0.16;
      const py = y * cell + cell * 0.2;
      const w = cell * 0.68;
      const h = cell * 0.58;
      g.fillStyle = style.frame;
      g.fillRect(px - 3, py - 3, w + 6, h + 6);
      const shade = 0.75 + r() * 0.35;
      const col = new THREE.Color(style.glass).multiplyScalar(shade);
      g.fillStyle = `#${col.getHexString()}`;
      g.fillRect(px, py, w, h);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(px, py, w * 0.35, h);
      if (r() < 0.38) {
        ge.fillStyle = style.lit;
        ge.globalAlpha = 0.6 + r() * 0.4;
        ge.fillRect(px, py, w, h);
      }
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  const emissive = new THREE.CanvasTexture(e);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
  return { map, emissive };
}

/** Box geometry whose UVs are in "windows": 3 m wide x 3.5 m per floor. */
function buildingGeometry(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = sizes[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * su) / 3 / CELLS, (uv.getY(i) * sv) / 3.5 / CELLS);
    }
  }
  return geo;
}

function useCityMaterials() {
  const tex = useTexture({
    asphalt: ASSET('textures/asphalt.jpg'),
    pave: ASSET('textures/pave.jpg'),
    grass: ASSET('textures/grass.jpg'),
    conc: ASSET('textures/conc.jpg'),
  });
  return useMemo(() => {
    const rep = (t, n) => { const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(n, n); c.colorSpace = THREE.SRGBColorSpace; c.anisotropy = 8; c.needsUpdate = true; return c; };
    const facades = STYLES.map((st, i) => {
      const { map, emissive } = facadeTextures(st, 100 + i);
      return new THREE.MeshStandardMaterial({ map, emissiveMap: emissive, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.75, metalness: 0.05 });
    });
    return {
      facades,
      roof: new THREE.MeshStandardMaterial({ map: rep(tex.conc, 4), color: '#8d8d8d', roughness: 0.95 }),
      road: new THREE.MeshStandardMaterial({ map: rep(tex.asphalt, (CITY_HALF * 2) / 8), color: '#9a9a9a', roughness: 0.9 }),
      sidewalk: new THREE.MeshStandardMaterial({ map: rep(tex.pave, blockSize / 4), roughness: 0.85 }),
      grass: new THREE.MeshStandardMaterial({ map: rep(tex.grass, 120), color: '#a8c08a', roughness: 1 }),
      parkGrass: new THREE.MeshStandardMaterial({ map: rep(tex.grass, 10), color: '#9ccf7a', roughness: 1 }),
      line: new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.6 }),
      yellow: new THREE.MeshStandardMaterial({ color: '#f5c542', roughness: 0.6 }),
      pole: new THREE.MeshStandardMaterial({ color: '#3a3f44', metalness: 0.6, roughness: 0.4 }),
      lamp: new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffd590', emissiveIntensity: 0.2, toneMapped: false }),
    };
  }, [tex]);
}

export function City() {
  const M = useCityMaterials();
  const night = useGame((s) => s.night);

  useEffect(() => {
    for (const m of M.facades) m.emissiveIntensity = night ? 1.6 : 0;
    M.lamp.emissiveIntensity = night ? 6 : 0.2;
  }, [night, M]);

  const buildings = useMemo(() => LAYOUT.flatMap((b) => b.buildings).map((b) => ({ ...b, geo: buildingGeometry(b.w, b.h, b.d) })), []);
  const blocks = LAYOUT;

  // dashed road markings + lamp posts (instanced)
  const { dashes, lamps } = useMemo(() => {
    const d = [];
    const l = [];
    for (const line of roadLines()) {
      for (let t = line.from + 2; t < line.to - 2; t += 6) {
        // skip intersections
        const k = Math.round(t / CELL - 0.5);
        const crossing = Math.abs(t - (k + 0.5) * CELL) < roadWidth / 2 + 1;
        if (crossing) continue;
        d.push(line.axis === 'x' ? [t, line.c] : [line.c, t, true]);
      }
    }
    for (const b of LAYOUT) {
      const h = blockSize / 2 - 0.8;
      for (const s of [-1, 1]) for (const t of [-0.66, 0, 0.66]) {
        l.push([b.x + s * h, b.z + t * h]);
        l.push([b.x + t * h, b.z + s * h]);
      }
    }
    return { dashes: d, lamps: l };
  }, []);

  return (
    <group>
      {/* ---------- physics: ground, sidewalks, buildings, lamp posts ---------- */}
      <RigidBody type="fixed" colliders={false} userData={{ type: 'world' }} friction={1}>
        <CuboidCollider args={[600, 1, 600]} position={[0, -1, 0]} />
        {blocks.map((b) => (
          <CuboidCollider key={`${b.i},${b.j}`} args={[blockSize / 2, sidewalkHeight / 2, blockSize / 2]} position={[b.x, sidewalkHeight / 2, b.z]} />
        ))}
        {buildings.map((b, i) => (
          <CuboidCollider key={i} args={[b.w / 2, b.h / 2, b.d / 2]} position={[b.x, b.h / 2 + sidewalkHeight, b.z]} />
        ))}
        {lamps.map(([x, z], i) => (
          <CuboidCollider key={'l' + i} args={[0.12, 3, 0.12]} position={[x, 3, z]} />
        ))}
      </RigidBody>

      {/* ---------- visuals ---------- */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow material={M.grass}>
        <planeGeometry args={[1200, 1200]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.001, 0]} receiveShadow material={M.road}>
        <planeGeometry args={[CITY_HALF * 2, CITY_HALF * 2]} />
      </mesh>
      {blocks.map((b) => (
        <group key={`${b.i},${b.j}`} position={[b.x, 0, b.z]}>
          <mesh position={[0, sidewalkHeight / 2, 0]} receiveShadow castShadow material={b.kind === 'park' ? M.parkGrass : M.sidewalk}>
            <boxGeometry args={[blockSize, sidewalkHeight, blockSize]} />
          </mesh>
          {b.kind === 'park' && <Park seed={b.i * 31 + b.j * 7} />}
        </group>
      ))}
      {buildings.map((b, i) => (
        <mesh
          key={i}
          geometry={b.geo}
          position={[b.x, b.h / 2 + sidewalkHeight, b.z]}
          castShadow
          receiveShadow
          material={[M.facades[b.style], M.facades[b.style], M.roof, M.roof, M.facades[b.style], M.facades[b.style]]}
        />
      ))}
      <Instanced items={dashes} material={M.line} build={(o, [x, z, alongZ]) => { o.position.set(x, 0.02, z); o.rotation.set(-Math.PI / 2, 0, alongZ ? Math.PI / 2 : 0); o.scale.set(3, 0.25, 1); }}>
        <planeGeometry args={[1, 1]} />
      </Instanced>
      <Instanced items={lamps} material={M.pole} castShadow build={(o, [x, z]) => { o.position.set(x, 3, z); o.scale.set(1, 1, 1); }}>
        <cylinderGeometry args={[0.08, 0.12, 6, 8]} />
      </Instanced>
      <Instanced items={lamps} material={M.lamp} build={(o, [x, z]) => { o.position.set(x, 6.05, z); }}>
        <boxGeometry args={[0.5, 0.18, 0.5]} />
      </Instanced>
    </group>
  );
}

/** Generic instanced mesh from a list of items. */
function Instanced({ items, material, build, children, castShadow }) {
  const ref = useMemo(() => ({ current: null }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      dummy.position.set(0, 0, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      build(dummy, it);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, build, dummy, ref]);
  return (
    <instancedMesh ref={(m) => { ref.current = m; }} args={[null, material, items.length]} castShadow={castShadow} receiveShadow>
      {children}
    </instancedMesh>
  );
}

/** Trees and palms (models from the GTA5 project / Drive). */
function Park({ seed }) {
  const tree = useGLTF(ASSET('models/props/tree.glb'));
  const palm = useGLTF(ASSET('models/props/palm.glb'));
  const items = useMemo(() => {
    const r = rng(seed + 999);
    const list = [];
    for (let k = 0; k < 14; k++) {
      const src = r() < 0.3 ? palm.scene : tree.scene;
      const obj = src.clone(true);
      const box = new THREE.Box3().setFromObject(obj);
      const h = box.max.y - box.min.y || 1;
      const s = (6 + r() * 4) / h;
      obj.scale.setScalar(s);
      obj.position.set((r() - 0.5) * (blockSize - 8), sidewalkHeight - box.min.y * s, (r() - 0.5) * (blockSize - 8));
      obj.rotation.y = r() * Math.PI * 2;
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      list.push(obj);
    }
    return list;
  }, [seed, tree, palm]);
  return items.map((o, i) => <primitive key={i} object={o} />);
}

useGLTF.preload(ASSET('models/props/tree.glb'));
useGLTF.preload(ASSET('models/props/palm.glb'));
