import { useEffect, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { Joystick, VirtualButton } from 'ecctrl/input';
import { CONFIG, VEHICLE_TYPES, WEAPONS } from '../config';
import { isTouchDevice } from '../core/input';
import { runtime } from '../core/runtime';
import { useGame } from '../core/store';
import { initAudio } from '../core/audio';
import { CITY_HALF, LAYOUT, roadLines } from '../world/cityLayout';

export function HUD() {
  const phase = useGame((s) => s.phase);
  return (
    <div className="ui">
      {phase === 'menu' && <Menu />}
      {phase === 'paused' && <Pause />}
      {phase === 'playing' && <InGame />}
    </div>
  );
}

/** Opens / closes the weapon wheel or the phone (frees the mouse while open). */
export function toggleOverlay(key) {
  const g = useGame.getState();
  const open = !g[key];
  useGame.setState({ wheelOpen: false, phoneOpen: false, [key]: open });
  if (open) document.exitPointerLock?.();
  else if (!isTouchDevice()) document.querySelector('canvas')?.requestPointerLock?.();
}

function requestPlay() {
  initAudio();
  if (useGame.getState().phase === 'menu') { runtime.camera.pitch = -0.18; runtime.camera.yaw = Math.PI; }
  useGame.getState().setPhase('playing');
  const canvas = document.querySelector('canvas');
  if (!isTouchDevice()) canvas?.requestPointerLock?.();
}

function Menu() {
  const [help, setHelp] = useState(false);
  return (
    <section className="screen">
      <h1 className="title">City Starter Kit</h1>
      <p className="tagline">Marcher, courir, sauter, se battre, tirer, conduire voitures, motos et hélicoptère.</p>
      {help ? <Controls /> : null}
      <div className="buttons">
        <button className="primary" onClick={requestPlay}>Jouer</button>
        <button onClick={() => setHelp(!help)}>{help ? 'Masquer' : 'Commandes'}</button>
      </div>
    </section>
  );
}

function Pause() {
  return (
    <section className="screen">
      <h2>Pause</h2>
      <Controls />
      <div className="buttons">
        <button className="primary" onClick={requestPlay}>Reprendre</button>
      </div>
    </section>
  );
}

function Controls() {
  return (
    <dl className="keys">
      <dt>ZQSD / WASD</dt><dd>Se déplacer / conduire</dd>
      <dt>Maj</dt><dd>Courir</dd>
      <dt>Espace</dt><dd>Sauter / frein à main</dd>
      <dt>Clic gauche</dt><dd>Tirer / frapper (3 clics = enchaînement)</dd>
      <dt>Clic droit</dt><dd>Viser (arme) / se mettre en garde (poings)</dd>
      <dt>C</dt><dd>Coup de pied</dd>
      <dt>V</dt><dd>Roulade / esquive</dd>
      <dt>B</dt><dd>Emote (salut, provoc, danse)</dd>
      <dt>Tab / 1 2 3 / X</dt><dd>Roue des armes / changer d'arme</dd>
      <dt>T</dt><dd>Téléphone (faire venir un véhicule, jour/nuit…)</dd>
      <dt>Maj (en voiture)</dt><dd>Nitro</dd>
      <dt>R</dt><dd>Recharger</dd>
      <dt>F</dt><dd>Monter / descendre d'un véhicule</dd>
      <dt>Hélico</dt><dd>Espace monter, Maj/Ctrl descendre, ZS avancer, QD tourner, flèches glisser</dd>
      <dt>H</dt><dd>Klaxon</dd>
      <dt>N</dt><dd>Jour / nuit</dd>
      <dt>Échap</dt><dd>Pause</dd>
    </dl>
  );
}

function InGame() {
  const g = useGame();
  const weapon = WEAPONS[g.weaponIndex];
  const ammo = g.ammo[weapon.id];
  const vehicle = g.vehicleId ? runtime.vehicles.get(g.vehicleId) : null;
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!g.toast) return;
    setToast(g.toast.text);
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [g.toast]);

  useEffect(() => {
    const onLock = () => {
      const st = useGame.getState();
      if (!document.pointerLockElement && !isTouchDevice() && st.phase === 'playing' && !st.wheelOpen && !st.phoneOpen) st.setPhase('paused');
    };
    document.addEventListener('pointerlockchange', onLock);
    return () => document.removeEventListener('pointerlockchange', onLock);
  }, []);

  return (
    <>
      <div className="top-left">
        <div className="bar"><div className="fill health" style={{ width: `${(g.health / CONFIG.player.maxHealth) * 100}%` }} /></div>
        <div className="money">$ {g.money.toLocaleString('fr-FR')}</div>
      </div>
      <div className="top-right">
        <div className="weapon">{weapon.name}</div>
        {weapon.id !== 'fists' && <div className="ammo">{ammo.mag} <span>/ {ammo.reserve}</span></div>}
        <div className="kills">K.O. : {g.kills}</div>
      </div>
      {!vehicle && weapon.id !== 'fists' && <div className={`crosshair ${g.aiming ? 'aim' : ''}`} />}
      {vehicle && (
        <div className={`speedo ${isTouchDevice() ? "speedo-touch" : ""}`}>
          <span className="n">{g.speedKmh}</span> km/h
          <div className="vname">{VEHICLE_TYPES[vehicle.type].name}</div>
          {vehicle.def.kind !== 'heli' && <div className="bar nitro"><div className="fill" style={{ width: `${g.nitro * 100}%` }} /></div>}
        </div>
      )}
      {g.prompt && <div className="prompt">{g.prompt}</div>}
      {toast && <div className="toast">{toast}</div>}
      {g.dead && <div className="wasted">K.O.</div>}
      <Minimap />
      <button className="pause-btn" onClick={() => { document.exitPointerLock?.(); g.setPhase('paused'); }}>II</button>
      {isTouchDevice() && <TouchControls vehicle={vehicle} armed={weapon.id !== 'fists'} canEnter={!!g.prompt} />}
      {!isTouchDevice() && !vehicle && <div className="hint-keys">Tab : armes · T : téléphone</div>}
      {g.wheelOpen && <WeaponWheel />}
      {g.phoneOpen && <Phone />}
    </>
  );
}

/** Phone layout: joystick on the left, buttons on the right that change
 *  with the situation (on foot / car or bike / helicopter). */
const BTN_WRAP = { position: 'relative', width: 68, height: 68, background: 'rgba(0,0,0,0.35)', border: '2px solid rgba(255,255,255,0.55)' };
const BTN_CAP = { width: 60, height: 60, background: 'rgba(255,255,255,0.14)', fontSize: 13, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' };
const Btn = (props) => <VirtualButton buttonWrapperStyle={BTN_WRAP} buttonCapStyle={BTN_CAP} {...props} />;

function TouchControls({ vehicle, armed, canEnter }) {
  const kind = vehicle?.def.kind;
  return (
    <div className="touch">
      <Joystick joystickWrapperStyle={{ left: 28, bottom: 28, top: 'auto', width: 170, height: 170, background: 'rgba(0,0,0,0.18)' }} />
      <div className="touch-top">
        {!vehicle && <button onClick={() => toggleOverlay('wheelOpen')}>Armes</button>}
        <button onClick={() => toggleOverlay('phoneOpen')}>Tél.</button>
      </div>
      <div className="touch-buttons">
        {!vehicle && (
          <>
            <Btn id="jump" label="Saut" />
            <Btn id="fire" label={armed ? 'Tir' : 'Frapper'} />
            <Btn id="aim" label={armed ? 'Viser' : 'Garde'} />
            {!armed && <Btn id="kick" label="Pied" />}
            <Btn id="run" label="Courir" />
            <Btn id="roll" label="Roulade" />
            {canEnter && <Btn id="enter" label="Monter" />}
          </>
        )}
        {(kind === 'car' || kind === 'bike') && (
          <>
            <Btn id="nitro" label="Nitro" />
            <Btn id="brake" label="Frein" />
            <Btn id="horn" label="Klaxon" />
            <Btn id="enter" label="Sortir" />
          </>
        )}
        {kind === 'heli' && (
          <>
            <Btn id="up" label="▲ Monter" />
            <Btn id="down" label="▼ Descendre" />
            <Btn id="enter" label="Sortir" />
          </>
        )}
      </div>
    </div>
  );
}

/** GTA-like weapon wheel (Tab / button "Armes"). */
function WeaponWheel() {
  const current = useGame((s) => s.weaponIndex);
  const ammo = useGame((s) => s.ammo);
  const n = WEAPONS.length;
  return (
    <div className="overlay" onClick={() => toggleOverlay('wheelOpen')}>
      <div className="wheel" onClick={(e) => e.stopPropagation()}>
        {WEAPONS.map((w, i) => {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2;
          const a2 = ammo[w.id];
          return (
            <button key={w.id} className={`slot ${i === current ? 'on' : ''}`} style={{ left: `${50 + Math.cos(a) * 34}%`, top: `${50 + Math.sin(a) * 34}%` }}
              onClick={() => { useGame.getState().setWeapon(i); toggleOverlay('wheelOpen'); }}>
              <span>{w.name}</span>
              {w.id !== 'fists' && <small>{a2.mag} / {a2.reserve}</small>}
            </button>
          );
        })}
        <div className="wheel-center">{WEAPONS[current].name}</div>
      </div>
    </div>
  );
}

/** In-game phone: small apps that call the game (bring a vehicle, day/night...). */
function Phone() {
  const bring = (kind) => {
    const p = runtime.player?.currPos;
    if (!p) return useGame.getState().showToast('Sors du véhicule d\'abord');
    let best = null;
    let bestD = Infinity;
    for (const v of runtime.vehicles.values()) {
      if (v.def.kind !== kind || v.driver || !v.handle?.body) continue;
      const d = v.object.getWorldPosition(tmpV).distanceTo(p);
      if (d < bestD) { bestD = d; best = v; }
    }
    if (!best) return;
    const yaw = runtime.camera.yaw;
    const off = kind === 'heli' ? 12 : 5;
    const b = best.handle.body;
    b.setTranslation({ x: p.x + Math.sin(yaw + Math.PI / 2) * off, y: p.y + 0.5, z: p.z + Math.cos(yaw + Math.PI / 2) * off }, true);
    b.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    useGame.getState().showToast(`${best.def.name} livrée !`);
    toggleOverlay('phoneOpen');
  };
  const apps = [
    { label: 'Voiture', icon: '🚗', run: () => bring('car') },
    { label: 'Moto', icon: '🏍️', run: () => bring('bike') },
    { label: 'Hélico', icon: '🚁', run: () => bring('heli') },
    { label: 'Perso', icon: '🧍', run: () => {
      const list = CONFIG.player.characters;
      const cur = list.findIndex(([, u]) => u === useGame.getState().playerModel);
      const [name, url] = list[(cur + 1) % list.length];
      if (runtime.player) useGame.setState({ exitPosition: runtime.player.currPos.toArray() });
      useGame.setState({ playerModel: url });
      useGame.getState().showToast(name);
    } },
    { label: 'Jour / nuit', icon: '🌙', run: () => useGame.getState().toggleNight() },
    { label: 'Soins', icon: '❤️', run: () => useGame.getState().heal() },
    { label: 'Munitions', icon: '🔫', run: () => useGame.setState({ ammo: Object.fromEntries(WEAPONS.map((w) => [w.id, { mag: w.mag ?? Infinity, reserve: w.ammo }])) }) },
  ];
  return (
    <div className="overlay" onClick={() => toggleOverlay('phoneOpen')}>
      <div className="phone" onClick={(e) => e.stopPropagation()}>
        <div className="phone-bar">{new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
        <div className="apps">
          {apps.map((a) => (
            <button key={a.label} className="app" onClick={a.run}><span className="icon">{a.icon}</span>{a.label}</button>
          ))}
        </div>
        <button className="phone-close" onClick={() => toggleOverlay('phoneOpen')}>Fermer</button>
      </div>
    </div>
  );
}

const tmpV = new Vector3();

/** Top-down map, redrawn 10 times per second. */
function Minimap() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const S = canvas.width;
    const range = 120; // meters shown around the player
    const lines = roadLines();
    const draw = () => {
      const f = runtime.focus;
      const yaw = runtime.camera.yaw;
      ctx.clearRect(0, 0, S, S);
      ctx.save();
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#5d7a4c';
      ctx.fillRect(0, 0, S, S);
      ctx.translate(S / 2, S / 2);
      ctx.rotate(yaw + Math.PI);
      const k = S / 2 / range;
      ctx.scale(k, k);
      ctx.translate(-f.x, -f.z);
      ctx.fillStyle = '#3b3f45';
      ctx.fillRect(-CITY_HALF, -CITY_HALF, CITY_HALF * 2, CITY_HALF * 2);
      for (const b of LAYOUT) {
        ctx.fillStyle = b.kind === 'park' ? '#6f9a52' : b.kind === 'test' ? '#c9a45c' : '#9aa0a6';
        ctx.fillRect(b.x - CONFIG.city.blockSize / 2, b.z - CONFIG.city.blockSize / 2, CONFIG.city.blockSize, CONFIG.city.blockSize);
        ctx.fillStyle = '#6b727a';
        for (const bd of b.buildings) ctx.fillRect(bd.x - bd.w / 2, bd.z - bd.d / 2, bd.w, bd.d);
      }
      void lines;
      for (const v of runtime.vehicles.values()) {
        if (!v.object) continue;
        const p = v.object.getWorldPosition(tmpV);
        ctx.fillStyle = v.def.kind === 'heli' ? '#4cc9f0' : '#ffd23f';
        ctx.beginPath();
        ctx.arc(p.x, p.z, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // player arrow (always pointing up = camera direction)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(S / 2, S / 2 - 8);
      ctx.lineTo(S / 2 + 6, S / 2 + 6);
      ctx.lineTo(S / 2 - 6, S / 2 + 6);
      ctx.closePath();
      ctx.fill();
    };
    const id = setInterval(draw, 100);
    draw();
    return () => clearInterval(id);
  }, []);
  return <canvas ref={ref} className={`minimap ${isTouchDevice() ? "mm-touch" : ""}`} width={180} height={180} />;
}
