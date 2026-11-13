import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { ASSET, CONFIG } from '../config';
import { ANIMATIONS_URL, Animator, useCharacterModel } from '../player/character';

/**
 * Animation viewer: open the game with ?viewer (and optionally &anim=Walk&model=...)
 * to look at every clip of animations.glb on a character. Handy to pick clips.
 */
function Character({ url, clip, time }) {
  const { model, mixer, actions } = useCharacterModel(url);
  const animator = useMemo(() => new Animator(actions), [actions]);
  useEffect(() => { animator.play(clip, { fade: 0.15 }); }, [animator, clip]);
  useFrame((_, dt) => {
    if (time !== null && animator.current) { animator.current.time = time * animator.current.getClip().duration; mixer.update(0); }
    else mixer.update(Math.min(dt, 0.05));
  });
  return <primitive object={model} />;
}

export default function AnimViewer() {
  const params = new URLSearchParams(location.search);
  const { animations } = useGLTF(ASSET(ANIMATIONS_URL));
  const names = animations.map((a) => a.name).sort();
  const [clip, setClip] = useState(params.get('anim') || 'Idle');
  const url = params.get('model') || CONFIG.player.model;
  const t = params.get('t');
  const side = params.has('side');
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', background: '#1b2230' }}>
      <div style={{ width: 190, overflowY: 'auto', padding: 8, fontFamily: 'sans-serif' }}>
        {names.map((n) => (
          <button key={n} onClick={() => setClip(n)} style={{ display: 'block', width: '100%', margin: '2px 0', padding: 6, background: n === clip ? '#ffd23f' : '#2d3748', color: n === clip ? '#111' : '#eee', border: 0, borderRadius: 4, textAlign: 'left' }}>{n}</button>
        ))}
      </div>
      <Canvas camera={{ position: side ? [3.2, 1.1, 0] : params.has('back') ? [0, 1.3, -3.2] : [1.8, 1.4, 3.2], fov: 40 }} shadows>
        <color attach="background" args={['#2a3446']} />
        <hemisphereLight args={['#ffffff', '#445', 1.2]} />
        <directionalLight position={[3, 5, 2]} intensity={2} castShadow />
        <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[10, 10]} /><meshStandardMaterial color="#556" /></mesh>
        <gridHelper args={[10, 20, '#889', '#667']} />
        <Suspense fallback={null}><Character url={url} clip={clip} time={t === null ? null : +t} /></Suspense>
        <OrbitControls target={[0, 0.9, 0]} />
      </Canvas>
    </div>
  );
}
