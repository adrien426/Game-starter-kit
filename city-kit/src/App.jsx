import { Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { TimeControl } from 'ecctrl/time';
import { Loader } from '@react-three/drei';
import { Bloom, EffectComposer, SMAA, Vignette } from '@react-three/postprocessing';
import { CONFIG } from './config';
import { installInput, input, isTouchDevice } from './core/input';
import { FollowCamera, InputUpdater } from './core/FollowCamera';
import { useGame } from './core/store';
import { Player } from './player/Player';
import { Vehicles } from './vehicles/Vehicles';
import { City } from './world/City';
import { TestLevel } from './world/TestLevel';
import { Lighting } from './world/Lighting';
import { Pedestrians } from './npc/Pedestrians';
import { Effects } from './combat/Effects';
import { HUD, toggleOverlay } from './ui/HUD';

const POST = CONFIG.graphics.postprocessing && !isTouchDevice();
const DEBUG = new URLSearchParams(location.search).has('debug');
// ?no=npc,vehicles,test,city : disable parts of the world (debugging / slow PCs)
const NO = (new URLSearchParams(location.search).get('no') || '').split(',');

function InputInstaller() {
  const gl = useThree((s) => s.gl);
  useEffect(() => installInput(gl.domElement), [gl]);
  return null;
}

/** Global keys (pause, day/night) */
function GlobalKeys() {
  useEffect(() => {
    const onKey = (e) => {
      const g = useGame.getState();
      if (e.code === 'KeyN' && g.phase === 'playing') g.toggleNight();
      if ((e.code === 'KeyP') && g.phase === 'playing') { document.exitPointerLock?.(); g.setPhase('paused'); }
      if (g.phase === 'playing' && !e.repeat && (e.code === 'Tab' || e.code === 'KeyQ') && g.vehicleId === null) { e.preventDefault(); toggleOverlay('wheelOpen'); }
      if (g.phase === 'playing' && !e.repeat && e.code === 'KeyT') toggleOverlay('phoneOpen');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return null;
}

export default function App() {
  const vehicleId = useGame((s) => s.vehicleId);
  const phase = useGame((s) => s.phase);
  const overlay = useGame((s) => s.wheelOpen || s.phoneOpen);
  useEffect(() => { input.enabled = phase === 'playing' && !overlay; }, [phase, overlay]);

  return (
    <>
      <Canvas
        shadows={CONFIG.graphics.shadows ? 'soft' : false}
        dpr={CONFIG.graphics.dpr}
        camera={{ fov: CONFIG.camera.fov, near: 0.1, far: 1500, position: [0, 5, 12] }}
        gl={{ antialias: !POST, powerPreference: 'high-performance' }}
      >
        <InputInstaller />
        <InputUpdater />
        <Suspense fallback={null}>
          <Lighting />
          {/* One physics step per rendered frame (ecctrl applies its impulses once per
              frame: several fixed steps per frame would make the cars sink under 60 FPS).
              TimeControl clamps the step to 1/30 s: below 30 FPS the game slows down
              instead of exploding. It also freezes the world on the pause screen. */}
          <Physics paused timeStep="vary" debug={DEBUG}>
            <TimeControl paused={phase === 'paused'} maxDelta={1 / 30} />
            {!NO.includes('city') && <City />}
            {!NO.includes('test') && <TestLevel />}
            {!NO.includes('vehicles') && <Vehicles />}
            {!NO.includes('npc') && <Pedestrians />}
            {vehicleId === null && !NO.includes('player') && <Player key="player" />}
            <FollowCamera renderHere={!POST} />
          </Physics>
          <Effects />
          {POST && (
            <EffectComposer renderPriority={2} multisampling={0}>
              <Bloom intensity={0.6} luminanceThreshold={1.0} luminanceSmoothing={0.2} mipmapBlur />
              <Vignette offset={0.3} darkness={0.55} />
              <SMAA />
            </EffectComposer>
          )}
        </Suspense>
      </Canvas>
      <Loader containerStyles={{ background: '#0d1117' }} dataInterpolation={(p) => `Chargement de la ville… ${p.toFixed(0)} %`} />
      <GlobalKeys />
      <HUD />
    </>
  );
}
