import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Physics } from './physics.js';
import { loadModels } from './assets.js';
import { buildFieldPhysics, buildFieldVisuals, goalSide, isOutOfPlay } from './field.js';
import { Ball } from './ball.js';
import { Player, Keeper } from './characters.js';
import { Input } from './input.js';
import { UI } from './ui.js';

// ---------- Rendering ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f2238);
scene.fog = new THREE.Fog(0x0f2238, 60, 140);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 300);
camera.position.set(0, 25, 45);

scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x2a4a22, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(15, 30, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 80 });
scene.add(sun, sun.target);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- World ----------
UI.show('loading');
const [physics] = await Promise.all([Physics.create(), loadModels(UI.loading)]);

buildFieldPhysics(physics);
buildFieldVisuals(scene);
const ball = new Ball(physics, scene);
const player = new Player(physics, scene);
const keeper = new Keeper(physics, scene, -1); // player attacks the goal at -Z
const input = new Input(document.getElementById('touch'));

// ---------- Game state ----------
// menu -> playing <-> paused, playing -> goal -> playing, playing -> ended
let state = 'menu';
let score = { home: 0, away: 0 };
let timeLeft = CONFIG.match.duration;
let pauseTimer = 0;

function kickoff() {
  ball.reset(0, 0);
  player.teleport(0, 3);
  keeper.teleport(0, keeper.homeZ, 0);
}

function startMatch() {
  score = { home: 0, away: 0 };
  timeLeft = CONFIG.match.duration;
  UI.score(0, 0);
  UI.clock(timeLeft);
  kickoff();
  state = 'playing';
  UI.show(null);
}

function setPaused(paused) {
  if (paused && state === 'playing') { state = 'paused'; UI.show('pause'); }
  else if (!paused && state === 'paused') { state = 'playing'; UI.show(null); }
}

input.onPause = () => setPaused(state === 'playing');
document.addEventListener('visibilitychange', () => document.hidden && setPaused(true));

UI.on('btn-play', startMatch);
UI.on('btn-help', () => UI.show('help'));
UI.on('btn-help-back', () => UI.show('menu'));
UI.on('btn-resume', () => setPaused(false));
UI.on('btn-restart', startMatch);
UI.on('btn-quit', () => { state = 'menu'; UI.show('menu'); });
UI.on('btn-again', startMatch);
UI.on('btn-menu', () => { state = 'menu'; UI.show('menu'); });
UI.on('btn-pause', () => setPaused(true));

function checkRules() {
  const p = ball.position;
  const side = goalSide(p, ball.radius);
  if (side) {
    if (side === -1) score.home++; else score.away++;
    UI.score(score.home, score.away);
    UI.banner(side === -1 ? 'But !' : 'Contre son camp !');
    state = 'goal';
    pauseTimer = CONFIG.match.goalPause;
    return;
  }
  if (isOutOfPlay(p, ball.radius)) {
    // Simple restart: ball back 6 m inside the field, where it went out
    const s = Math.sign(p.z);
    ball.reset(THREE.MathUtils.clamp(p.x, -8, 8), s * (CONFIG.field.length / 2 - 6));
  }
  if (p.y < -2) ball.reset(0, 0); // safety net, should never happen
}

// ---------- Main loop ----------
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
const camLook = new THREE.Vector3();
const camWanted = new THREE.Vector3();
let menuAngle = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);

  if (state === 'playing' || state === 'goal') {
    physics.update(dt, (step) => {
      if (state === 'playing') player.step(step, input, ball);
      keeper.step(step, ball);
    });

    if (state === 'playing') {
      checkRules();
      timeLeft -= dt;
      UI.clock(timeLeft);
      if (timeLeft <= 0) { state = 'ended'; UI.result(score.home, score.away); UI.show('ended'); }
    } else if ((pauseTimer -= dt) <= 0) {
      UI.banner('');
      kickoff();
      state = 'playing';
    }
  }
  UI.charge(player.charge / CONFIG.player.chargeTime);

  ball.sync();
  player.sync(dt);
  keeper.sync(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
});

function updateCamera(dt) {
  if (state === 'menu' || state === 'loading') {
    // Slow orbit around the stadium behind the menu
    menuAngle += dt * 0.08;
    camera.position.set(Math.sin(menuAngle) * 38, 16, Math.cos(menuAngle) * 38);
    camera.lookAt(0, 0, 0);
    return;
  }
  const p = player.position;
  const [ox, oy, oz] = CONFIG.camera.offset;
  // Stay a bit between the player and the ball so both are on screen
  const b = ball.position;
  camTarget.set((p.x * 2 + b.x) / 3, 0, (p.z * 2 + b.z) / 3 - CONFIG.camera.lookAhead);
  const k = 1 - Math.exp(-CONFIG.camera.smoothing * dt); // frame-rate independent smoothing
  camWanted.set(camTarget.x + ox, oy, camTarget.z + CONFIG.camera.lookAhead + oz);
  camera.position.lerp(camWanted, k);
  camLook.lerp(camTarget, k); // smoothed look target: no jerk when the ball is shot
  camera.lookAt(camLook);
  sun.position.set(p.x + 15, 30, p.z + 10);
  sun.target.position.set(p.x, 0, p.z);
}

kickoff();
window.game = { player, ball, keeper, physics }; // handy for debugging in the browser console
UI.show('menu');
