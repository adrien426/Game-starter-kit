import { useButtonStore, useJoystickStore } from 'ecctrl/input';

// ---------------------------------------------------------------------
//  Input = keyboard + mouse + touch, merged into "actions".
//  Keys use event.code (physical position), so ZQSD on AZERTY and WASD
//  on QWERTY are the same keys. Add/rebind actions in BINDINGS.
// ---------------------------------------------------------------------
export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  run: ['ShiftLeft', 'ShiftRight'],
  enter: ['KeyF', 'KeyE'],
  kick: ['KeyC'],
  roll: ['KeyV', 'AltLeft'],
  emote: ['KeyB'],
  reload: ['KeyR'],
  nextWeapon: ['KeyX'],
  weaponWheel: ['Tab', 'KeyQ'],
  phone: ['KeyT'],
  nitro: ['ShiftLeft', 'ShiftRight'],
  weapon1: ['Digit1', 'Numpad1'],
  weapon2: ['Digit2', 'Numpad2'],
  weapon3: ['Digit3', 'Numpad3'],
  night: ['KeyN'],
  horn: ['KeyH'],
  pause: ['Escape', 'KeyP'],
  // helicopter
  up: ['Space'],
  down: ['ShiftLeft', 'ControlLeft'],
  yawLeft: ['KeyA'],
  yawRight: ['KeyD'],
  rollLeft: ['ArrowLeft'],
  rollRight: ['ArrowRight'],
  pitchForward: ['KeyW', 'ArrowUp'],
  pitchBackward: ['KeyS', 'ArrowDown'],
};

// Touch buttons (ids used by <VirtualButton id=...>) mapped to actions
const TOUCH_BUTTONS = { jump: ['jump'], run: ['run'], fire: ['fire'], aim: ['aim'], enter: ['enter'], kick: ['kick'], roll: ['roll'], up: ['up'], down: ['down'], nitro: ['nitro'], horn: ['horn'], brake: ['jump'] };

const keysDown = new Set();
// Keys / clicks pressed since the last frame, even if already released:
// a quick tap is never lost when the game runs at a low frame rate.
const tapped = new Set();
const mouse = { left: false, right: false, dx: 0, dy: 0, wheel: 0 };
let down = {}; // action -> boolean (this frame)
let prev = {};

export const input = {
  /** Is the action held? */
  held: (action) => !!down[action],
  /** Was the action pressed this frame? */
  pressed: (action) => !!down[action] && !prev[action],
  /** Movement stick in [-1, 1] (keyboard or touch joystick) */
  stick: { x: 0, y: 0, touch: false },
  mouse,
  locked: false,
  enabled: true,
};

function onKey(e, isDown) {
  if (e.repeat) return;
  if (isDown) { keysDown.add(e.code); tapped.add(e.code); } else keysDown.delete(e.code);
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
}

export function installInput(canvas) {
  const kd = (e) => onKey(e, true);
  const ku = (e) => onKey(e, false);
  const blur = () => { keysDown.clear(); mouse.left = mouse.right = false; };
  const md = (e) => { if (e.button === 0) { mouse.left = true; tapped.add('Mouse0'); } if (e.button === 2) { mouse.right = true; tapped.add('Mouse2'); } };
  const mu = (e) => { if (e.button === 0) mouse.left = false; if (e.button === 2) mouse.right = false; };
  let skip = 0;
  const mm = (e) => {
    const locked = document.pointerLockElement === canvas;
    if (!locked && !(e.buttons & 1 && e.pointerType === 'mouse')) return;
    // Browsers often send one huge jump right after the pointer gets locked: ignore it
    if (skip > 0) { skip--; return; }
    if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
    mouse.dx += e.movementX;
    mouse.dy += e.movementY;
  };
  const wheel = (e) => { mouse.wheel += Math.sign(e.deltaY); };
  const ctx = (e) => e.preventDefault();
  const lock = () => { input.locked = document.pointerLockElement === canvas; skip = 2; mouse.dx = mouse.dy = 0; };

  // Touch drag on the free part of the screen rotates the camera
  const touches = new Map();
  const ts = (e) => { for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY }); };
  const tm = (e) => {
    for (const t of e.changedTouches) {
      const p = touches.get(t.identifier);
      if (!p) continue;
      mouse.dx += (t.clientX - p.x) * 2.2;
      mouse.dy += (t.clientY - p.y) * 2.2;
      p.x = t.clientX; p.y = t.clientY;
    }
  };
  const te = (e) => { for (const t of e.changedTouches) touches.delete(t.identifier); };

  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('blur', blur);
  canvas.addEventListener('pointerdown', md);
  window.addEventListener('pointerup', mu);
  window.addEventListener('pointermove', mm);
  canvas.addEventListener('wheel', wheel, { passive: true });
  canvas.addEventListener('contextmenu', ctx);
  canvas.addEventListener('touchstart', ts, { passive: true });
  canvas.addEventListener('touchmove', tm, { passive: true });
  canvas.addEventListener('touchend', te);
  canvas.addEventListener('touchcancel', te);
  document.addEventListener('pointerlockchange', lock);
  return () => {
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    window.removeEventListener('blur', blur);
    canvas.removeEventListener('pointerdown', md);
    window.removeEventListener('pointerup', mu);
    window.removeEventListener('pointermove', mm);
    canvas.removeEventListener('wheel', wheel);
    canvas.removeEventListener('contextmenu', ctx);
    canvas.removeEventListener('touchstart', ts);
    canvas.removeEventListener('touchmove', tm);
    canvas.removeEventListener('touchend', te);
    canvas.removeEventListener('touchcancel', te);
    document.removeEventListener('pointerlockchange', lock);
  };
}

/** Called once per frame, before everything else (see <InputUpdater/>). */
export function updateInput() {
  prev = down;
  down = {};
  for (const [action, codes] of Object.entries(BINDINGS)) down[action] = codes.some((c) => keysDown.has(c) || tapped.has(c));
  down.fire = mouse.left || tapped.has('Mouse0');
  down.aim = mouse.right || tapped.has('Mouse2');
  tapped.clear();

  const buttons = useButtonStore.getState().buttons;
  for (const [id, actions] of Object.entries(TOUCH_BUTTONS)) if (buttons[id]) for (const a of actions) down[a] = true;

  const joy = useJoystickStore.getState().joysticks.default;
  const kx = (down.right ? 1 : 0) - (down.left ? 1 : 0);
  const ky = (down.forward ? 1 : 0) - (down.backward ? 1 : 0);
  if (joy?.active) {
    input.stick.x = joy.x; input.stick.y = joy.y; input.stick.touch = true;
  } else {
    input.stick.x = kx; input.stick.y = ky; input.stick.touch = false;
  }
  if (!input.enabled) { down = {}; input.stick.x = input.stick.y = 0; }
}

/** Read and reset the mouse movement accumulated since last frame. */
export function consumeMouse() {
  const r = { dx: mouse.dx, dy: mouse.dy, wheel: mouse.wheel };
  mouse.dx = mouse.dy = mouse.wheel = 0;
  return r;
}

export const isTouchDevice = () => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
