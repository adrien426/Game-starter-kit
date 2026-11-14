import * as THREE from 'three';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, useRapier } from '@react-three/rapier';
import { EcctrlVehicle, ShapeCastWheel, ThrustPropeller } from 'ecctrl/vehicle';
import { ASSET, CONFIG, VEHICLE_SPAWNS, VEHICLE_TYPES } from '../config';
import { Animator, useCharacterModel } from '../player/character';
import { LAYOUT } from '../world/cityLayout';
import { input } from '../core/input';
import { runtime } from '../core/runtime';
import { useGame } from '../core/store';
import { setEngine, sfx } from '../core/audio';

const v1 = new THREE.Vector3();
const q1 = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);

/** Height of the ground (sidewalk blocks are a bit higher than the road). */
function groundHeight(x, z) {
  const h = CONFIG.city.blockSize / 2;
  return LAYOUT.some((b) => Math.abs(x - b.x) < h && Math.abs(z - b.z) < h) ? CONFIG.city.sidewalkHeight : 0;
}

/** All the vehicles of VEHICLE_SPAWNS. */
export function Vehicles() {
  return VEHICLE_SPAWNS.map(([type, x, z, heading], i) => {
    const def = VEHICLE_TYPES[type];
    const props = { key: i, id: `${type}-${i}`, type, def, position: [x, groundHeight(x, z) + (def.kind === 'heli' ? 0.25 : 0), z], rotation: [0, heading, 0] };
    return def.kind === 'heli' ? <Helicopter {...props} /> : <WheeledVehicle {...props} />;
  });
}

/** Registers the vehicle in runtime.vehicles so the player can find it. */
function useRegister(id, type, def, handle, object) {
  useEffect(() => {
    const entry = { id, type, def, handle: null, object: null, driver: null };
    runtime.vehicles.set(id, entry);
    const t = setInterval(() => {
      if (handle.current && object.current) { entry.handle = handle.current; entry.object = object.current; clearInterval(t); }
    }, 16);
    return () => { clearInterval(t); runtime.vehicles.delete(id); };
  }, [id, type, def, handle, object]);
}

/** Common per-frame logic for the driven vehicle: exit, HUD speed, engine sound. */
function useDriving(id, def, handle, object, drive) {
  const hudT = useRef(0);
  useFrame((_, dt) => {
    const h = handle.current;
    if (!h?.body) return;
    const game = useGame.getState();
    const driven = game.vehicleId === id;
    const playing = game.phase === 'playing';
    drive(h, driven && playing, dt);

    if (!driven) return;
    const speed = h.currLinVel.length();
    hudT.current -= dt;
    if (hudT.current <= 0) { hudT.current = 0.1; useGame.setState({ speedKmh: Math.round(speed * 3.6) }); }
    setEngine(true, Math.min(1, speed / (def.topSpeedKmh ? def.topSpeedKmh / 3.6 : 25)), def.kind);
    if (playing && input.pressed('horn')) sfx.horn();

    if (playing && input.pressed('enter')) {
      // exit on the left side of the vehicle (+X in model space)
      const o = object.current;
      const side = (def.size[0] / 2 + 0.9);
      const p = o.localToWorld(v1.set(side, 0, 0.3));
      p.y = Math.max(p.y, h.currPos.y) + 1.0;
      const v = runtime.vehicles.get(id);
      if (v) v.driver = null;
      useGame.getState().exitVehicle([p.x, p.y, p.z]);
      setEngine(false);
      sfx.door();
    }
  });
}

/**
 * ecctrl wheels/propellers must start AFTER the vehicle body has run one frame:
 * on the very first frame they would divide by a gravity of 0 and keep a NaN
 * wheel speed forever (car stuck, Rapier crash). So we mount them 2 frames later.
 */
function useModulesReady() {
  const [ready, setReady] = useState(false);
  const frames = useRef(0);
  useFrame(() => { if (!ready && ++frames.current > 2) setReady(true); });
  return ready;
}

/** The player sitting in the vehicle ("Seated Idle" clip from the Drive). */
function Driver({ id, def }) {
  const driven = useGame((s) => s.vehicleId === id);
  if (!driven || !def.seat) return null;
  return <SeatedCharacter seat={def.seat} roof={def.roof} />;
}
const _head = new THREE.Vector3();
function SeatedCharacter({ seat, roof }) {
  const url = useGame((s) => s.playerModel);
  const firstPerson = useGame((s) => s.cameraMode === 'first');
  const { model, mixer, actions, bones } = useCharacterModel(url);
  const animator = useMemo(() => new Animator(actions), [actions]);
  const fitted = useRef(false);
  useEffect(() => { animator.play('SeatedIdle', { fade: 0 }); }, [animator]);
  useEffect(() => {
    runtime.driverHead = bones.Head ?? null;
    return () => { runtime.driverHead = null; };
  }, [bones]);
  useFrame((_, dt) => {
    mixer.update(Math.min(dt, 0.05));
    // First frame: lower the driver so the top of his head stays under the roof
    // (characters have different heights, seats are guessed).
    if (!fitted.current && roof && bones.Head && model.parent) {
      fitted.current = true;
      model.updateMatrixWorld(true);
      model.parent.worldToLocal(bones.Head.getWorldPosition(_head));
      const headTop = _head.y + 0.14;
      if (headTop > roof - 0.06) model.position.y -= headTop - (roof - 0.06);
    }
  });
  // first person: the body is hidden, the camera sits in its head
  return <primitive object={model} position={seat} visible={!firstPerson} />;
}

// Vehicle glb materials are named PAINT / GLASS / HEAD / TAIL (GTA5 project):
// the body paint is applied here, like in the GTA5 project.
const PAINTS = ['#c0392b', '#1f4e8c', '#f1c40f', '#2c3e50', '#ecf0f1', '#16a085', '#8e44ad', '#d35400', '#111111', '#7f8c8d'];
const ROLE_MATS = {
  glass: new THREE.MeshPhysicalMaterial({ color: '#10161f', metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.55, envMapIntensity: 1.5, side: THREE.DoubleSide }),
  head: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4d6', emissiveIntensity: 1.5 }),
  tail: new THREE.MeshStandardMaterial({ color: '#7a0000', emissive: '#ff1a1a', emissiveIntensity: 0.8 }),
};
const paintCache = {};
// DoubleSide: some car meshes have flipped faces (missing roof otherwise)
const paintMat = (c) => (paintCache[c] ??= new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide }));
let paintIndex = 0;

/** Splits a vehicle glb in body + wheel models. */
function useVehicleParts(def) {
  const { scene } = useGLTF(ASSET(def.model));
  return useMemo(() => {
    const body = scene.clone(true);
    const wheels = [];
    const color = def.color ?? (def.police ? '#f4f6f8' : PAINTS[paintIndex++ % PAINTS.length]);
    body.traverse((o) => {
      if (!o.isMesh) return;
      const role = o.userData.role ?? (Array.isArray(o.material) ? '' : (o.material?.name || '').toLowerCase());
      o.castShadow = role !== 'glass';
      o.receiveShadow = true;
      if (role === 'paint') o.material = paintMat(color);
      else if (ROLE_MATS[role]) o.material = ROLE_MATS[role];
      else if (o.material) { o.material = o.material.clone(); o.material.side = THREE.DoubleSide; }
    });
    for (const name of ['wheel', 'wheelF', 'wheelR', 'rotor', 'tail']) {
      const node = body.getObjectByName(name);
      if (node) { node.parent.remove(node); wheels.push(node); }
    }
    const parts = Object.fromEntries(wheels.map((w) => [w.name, w]));
    const makeWheel = (src, flip) => {
      const g = new THREE.Group();
      const w = src.clone(true);
      w.position.set(0, 0, 0);
      if (flip) w.rotation.y = Math.PI;
      g.add(w);
      return g;
    };
    return { body, parts, makeWheel };
  }, [scene, def]);
}

// ===================================================================
//  Cars and motorbikes (ecctrl ShapeCastWheel)
// ===================================================================
function WheeledVehicle({ id, type, def, position, rotation }) {
  const handle = useRef(null);
  const object = useRef(null);
  const lean = useRef(null);
  const { body, parts, makeWheel } = useVehicleParts(def);
  const isBike = def.kind === 'bike';
  const flipT = useRef(0);
  // Parked = kinematic body: perfectly still, no tyre physics, no React
  // re-render. It becomes a real (dynamic) car when someone drives it or when
  // a moving vehicle hits it, and is parked again once it stopped.
  const parked = useRef(true);
  const parkT = useRef(0);
  const { rapier } = useRapier();
  const nitroFx = useRef(0);
  const flame = useRef(null);
  const modulesReady = useModulesReady();
  useRegister(id, type, def, handle, object);

  const MASS = isBike ? 6 : 10;
  const RAY = 0.35;
  const springK = isBike ? 120 : 200;
  const R = def.wheelRadius;
  const originY = R + RAY - (MASS * 9.81) / 4 / springK;
  const chassisBottom = originY - R - 0.06;

  const wheels = useMemo(() => {
    const list = [];
    for (const z of [def.wheelZ, -def.wheelZ]) {
      for (const x of [def.wheelX, -def.wheelX]) {
        const front = z > 0;
        let model = null;
        if (isBike) {
          if (x > 0) model = makeWheel(front ? parts.wheelF : parts.wheelR, false); // one visible wheel per axle
        } else if (parts.wheel) model = makeWheel(parts.wheel, x < 0);
        list.push({ key: `${x}${z}`, pos: [x, originY, z], front, model });
      }
    }
    return list;
  }, [def, parts, makeWheel, isBike, originY]);

  // Bike wheels in the glb sit at their real place: put them back at x=0
  const carConfig = useMemo(() => ({
    engineHorsepower: def.horsepower, gearRatios: [def.gearRatio], finalDriveRatio: 1,
    maxSteerAngle: isBike ? Math.PI / 7 : Math.PI / 6.5,
  }), [def, isBike]);

  useDriving(id, def, handle, object, (h, active, dt) => {
    const st = input.stick;
    if (active) {
      h.setMovement({
        forward: st.touch ? st.y > 0.25 : input.held('forward'),
        backward: st.touch ? st.y < -0.25 : input.held('backward'),
        steerLeft: !st.touch && input.held('left'),
        steerRight: !st.touch && input.held('right'),
        joystickL: { x: st.touch ? st.x : 0, y: 0 },
        brake: input.held('jump'),
      });
    } else {
      h.setMovement({ forward: false, backward: false, steerLeft: false, steerRight: false, joystickL: { x: 0, y: 0 }, brake: false });
    }
    const body = h.body;
    const yAxis = h.bodyYAxis;
    const T = rapier.RigidBodyType;
    if (active) {
      parkT.current = 0;
      if (parked.current) { parked.current = false; body.setBodyType(T.Dynamic, true); }
    } else if (parked.current) {
      if (body.bodyType() !== T.KinematicPositionBased) {
        body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        body.setAngvel({ x: 0, y: 0, z: 0 }, false);
        body.setBodyType(T.KinematicPositionBased, false);
      }
      // a vehicle coming fast into it: become a real car so it gets pushed
      const p = body.translation();
      for (const v of runtime.vehicles.values()) {
        const ob = v.handle?.body;
        if (!ob || ob === body || ob.bodyType() !== T.Dynamic) continue;
        const lv = ob.linvel();
        if (Math.hypot(lv.x, lv.z) < 3) continue;
        const q = ob.translation();
        const dx = p.x - q.x;
        const dz = p.z - q.z;
        const coming = lv.x * dx + lv.z * dz > 0; // driving toward this car
        if (coming && Math.hypot(dx, dz) < (def.size[2] + v.def.size[2]) * 0.4 + 0.6) {
          parked.current = false;
          parkT.current = 0;
          body.setBodyType(T.Dynamic, true);
          break;
        }
      }
    } else {
      const lv = body.linvel();
      const av = body.angvel();
      const still = Math.hypot(lv.x, lv.y, lv.z) < 0.4 && Math.hypot(av.x, av.y, av.z) < 0.4 && h.bodyYAxis.y > 0.9;
      parkT.current = still ? parkT.current + dt : 0;
      if (parkT.current > 1) parked.current = true; // switched to kinematic next frame
    }
    // ---- nitro (Shift / touch button): extra push forward, gauge refills slowly
    if (active) {
      const g = useGame.getState();
      let gauge = g.nitro;
      const fwdSpeed = h.currLinVel.dot(h.bodyZAxis);
      if (input.held('nitro') && gauge > 0 && fwdSpeed > -1 && fwdSpeed < (def.topSpeedKmh / 3.6) * 1.4) {
        const k = MASS * 11 * dt;
        const f = h.bodyZAxis;
        body.applyImpulse({ x: f.x * k, y: 0, z: f.z * k }, true);
        gauge = Math.max(0, gauge - dt / 3);
        nitroFx.current = 1;
      } else {
        gauge = Math.min(1, gauge + dt / 10);
        nitroFx.current = Math.max(0, nitroFx.current - dt * 3);
      }
      if (Math.abs(gauge - g.nitro) > 0.01 || gauge === 0 || gauge === 1) { if (gauge !== g.nitro) useGame.setState({ nitro: gauge }); }
    }
    if (flame.current) { flame.current.visible = nitroFx.current > 0.05; flame.current.scale.setScalar(0.6 + nitroFx.current * (0.6 + Math.random() * 0.4)); }
    // keep motorbikes upright (ecctrl has no 2-wheel balance yet).
    // Velocity-level control (no torque): stable whatever the bike inertia.
    if (isBike && !parked.current) {
      const fwd = h.bodyZAxis;
      const roll = h.bodyXAxis.dot(up); // 0 when upright, >0 when leaning around +Z
      const av = h.currAngVel;
      const rollRate = av.x * fwd.x + av.y * fwd.y + av.z * fwd.z;
      const target = THREE.MathUtils.clamp(-roll * 10, -4, 4);
      const next = THREE.MathUtils.lerp(rollRate, target, 1 - Math.exp(-12 * dt));
      const d = next - rollRate;
      // pitch: damp the nose-up / nose-down rotation so the bike does not
      // wheelie or flip backwards when accelerating or braking
      const side = h.bodyXAxis;
      const pitchRate = (av.x + fwd.x * d) * side.x + (av.y + fwd.y * d) * side.y + (av.z + fwd.z * d) * side.z;
      const onGround = [...h.wheelsInfo.values()].some((w) => w.current.rayHit);
      const dp = onGround ? -pitchRate * (1 - Math.exp(-10 * dt)) : 0;
      if (Math.abs(d) > 1e-4 || Math.abs(dp) > 1e-4) body.setAngvel({ x: av.x + fwd.x * d + side.x * dp, y: av.y + fwd.y * d + side.y * dp, z: av.z + fwd.z * d + side.z * dp }, false);
      // visual lean in turns
      if (lean.current) {
        const speed = h.currLinVel.dot(fwd);
        const yawRate = h.currAngVel.dot(up);
        lean.current.rotation.z = THREE.MathUtils.lerp(lean.current.rotation.z, THREE.MathUtils.clamp(-yawRate * speed * 0.06, -0.6, 0.6), 1 - Math.exp(-6 * dt));
      }
    }
    // put a flipped vehicle back on its wheels
    if (yAxis.y < 0.3 && h.currLinVel.length() < 2) flipT.current += dt; else flipT.current = 0;
    if (flipT.current > 2) {
      flipT.current = 0;
      const p = h.currPos;
      q1.setFromAxisAngle(up, Math.atan2(h.bodyZAxis.x, h.bodyZAxis.z));
      body.setTranslation({ x: p.x, y: p.y + 1.2, z: p.z }, true);
      body.setRotation(q1, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  });

  const [w, hgt, len] = def.size;
  return (
    <EcctrlVehicle ref={handle} position={position} rotation={rotation} carConfig={carConfig} userData={{ type: 'vehicle', id }} linearDamping={0.05} angularDamping={0.4}>
      {/* chassis: its bottom (chassisBottom) is lower than a fully compressed
          wheel, so a hard landing hits the chassis, never pushes the wheel
          shape into the ground (that gives NaN in ecctrl) */}
      <CuboidCollider args={[w * 0.45, hgt * 0.22, len * 0.47]} position={[0, chassisBottom + hgt * 0.22, 0]} mass={MASS * 0.85} friction={0.4} />
      <CuboidCollider args={[w * 0.4, hgt * 0.17, len * 0.25]} position={[0, R * 0.9 + hgt * 0.6, -len * 0.05]} mass={MASS * 0.15} friction={0.4} />
      {modulesReady && wheels.map((wh) => (
        <ShapeCastWheel
          key={wh.key}
          position={wh.pos}
          rayShapeR={R}
          rayShapeH={isBike ? 0.08 : 0.1}
          rayLength={RAY}
          springK={springK}
          dampingC={isBike ? 12 : 18}
          driveWheel
          driveTorqueWeight={wh.front ? 0.8 : 1.2}
          steerWheel={wh.front}
          brakeWheel
          tireGripFactor={isBike ? 2.2 : 1.8}
          wheelModelRadius={R}
          showWheelModel={!!wh.model}
        >
          {wh.model && <primitive object={wh.model} position={[isBike ? -wh.pos[0] : 0, 0, 0]} />}
        </ShapeCastWheel>
      ))}
      <group ref={object}>
        <group ref={lean}>
          <primitive object={body} />
          <Driver id={id} def={def} />
          <group ref={flame} position={[isBike ? 0 : 0.35, R * 1.1, -len / 2 - 0.15]} visible={false}>
            <mesh rotation-x={-Math.PI / 2}><coneGeometry args={[0.12, 0.7, 10]} /><meshBasicMaterial color="#6ad7ff" transparent opacity={0.85} toneMapped={false} /></mesh>
          </group>
          {def.police && <PoliceLights id={id} y={hgt + 0.02} />}
        </group>
      </group>
    </EcctrlVehicle>
  );
}

function PoliceLights({ id, y }) {
  const red = useRef();
  const blue = useRef();
  useFrame(({ clock }) => {
    const on = useGame.getState().vehicleId === id;
    const t = Math.floor(clock.elapsedTime * 6) % 2;
    if (red.current) red.current.emissiveIntensity = on && t ? 8 : 0.4;
    if (blue.current) blue.current.emissiveIntensity = on && !t ? 8 : 0.4;
  });
  return (
    <group position={[0, y, -0.2]}>
      <mesh position={[0.3, 0, 0]}><boxGeometry args={[0.5, 0.1, 0.18]} /><meshStandardMaterial ref={red} color="#ff1a1a" emissive="#ff1a1a" /></mesh>
      <mesh position={[-0.3, 0, 0]}><boxGeometry args={[0.5, 0.1, 0.18]} /><meshStandardMaterial ref={blue} color="#1a4dff" emissive="#1a4dff" /></mesh>
    </group>
  );
}

// ===================================================================
//  Helicopter (ecctrl drone controller: 4 invisible thrust propellers)
// ===================================================================
function Helicopter({ id, type, def, position, rotation }) {
  const handle = useRef(null);
  const object = useRef(null);
  const { body, parts } = useVehicleParts(def);
  const rotor = useRef(0);
  const modulesReady = useModulesReady();
  useRegister(id, type, def, handle, object);
  const droneConfig = useMemo(() => ({
    controlMode: 'VELOCITY', maxHorizSpeed: def.maxHorizSpeed, maxVertSpeed: def.maxVertSpeed,
    maxTiltAngle: 0.32, maxYawRate: 1.3, airDragFactor: 0.35,
  }), [def]);

  useDriving(id, def, handle, object, (h, active, dt) => {
    const st = input.stick;
    if (active) {
      h.setMovement({
        throttleUp: input.held('up'),
        throttleDown: input.held('down'),
        yawLeft: !st.touch && input.held('yawLeft'),
        yawRight: !st.touch && input.held('yawRight'),
        pitchForward: !st.touch && input.held('pitchForward'),
        pitchBackward: !st.touch && input.held('pitchBackward'),
        rollLeft: input.held('rollLeft'),
        rollRight: input.held('rollRight'),
        joystickL: { x: st.touch ? st.x : 0, y: 0 },
        joystickR: { x: 0, y: st.touch ? st.y : 0 },
      });
    } else {
      // nobody inside: the helicopter slowly comes down and lands by itself
      h.setMovement({ throttleUp: false, throttleDown: true, yawLeft: false, yawRight: false, pitchForward: false, pitchBackward: false, rollLeft: false, rollRight: false, joystickL: { x: 0, y: 0 }, joystickR: { x: 0, y: 0 } });
    }
    rotor.current = THREE.MathUtils.lerp(rotor.current, active ? 1 : 0, 1 - Math.exp(-0.8 * dt));
    if (parts.rotor) parts.rotor.rotation.y += rotor.current * 28 * dt;
    if (parts.tail) parts.tail.rotation.x += rotor.current * 40 * dt;
  });

  const THRUST = 420;
  return (
    <EcctrlVehicle ref={handle} position={position} rotation={rotation} droneConfig={droneConfig} userData={{ type: 'vehicle', id }} angularDamping={1.5}>
      <CuboidCollider args={[1.15, 1.0, 2.6]} position={[0, 1.9, 0.2]} mass={40} friction={0.6} />
      <CuboidCollider args={[0.35, 0.45, 2.6]} position={[0, 2.7, -5.0]} mass={2} />
      <CuboidCollider args={[1.25, 0.12, 2.0]} position={[0, 0.12, 0]} mass={4} friction={1} />
      {modulesReady && [[1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6]].map(([x, z], i) => (
        <ThrustPropeller key={i} position={[x, 4.2, z]} maxThrust={THRUST} invertTorque={i === 1 || i === 2} showPropellerModel={false} debug={false} />
      ))}
      <group ref={object}>
        <primitive object={body} />
        <Driver id={id} def={def} />
        {parts.rotor && <primitive object={parts.rotor} />}
        {parts.tail && <primitive object={parts.tail} />}
      </group>
    </EcctrlVehicle>
  );
}

for (const d of Object.values(VEHICLE_TYPES)) useGLTF.preload(ASSET(d.model));
