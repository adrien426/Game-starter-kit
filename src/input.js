// Keyboard + touch input, merged into one simple state.
// event.code is layout-independent: KeyW is "Z" on an AZERTY keyboard.
export class Input {
  constructor(touchRoot) {
    this.keys = new Set();
    this.stick = { x: 0, y: 0 };
    this.touchKick = false;
    this.touchSprint = false;
    this.onPause = null;

    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPause?.();
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear()); // avoids "stuck key" bugs

    if (touchRoot) this.setupTouch(touchRoot);
  }

  get move() {
    let x = 0, z = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) z -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) z += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    x += this.stick.x;
    z += this.stick.y;
    const len = Math.hypot(x, z);
    return len > 1 ? { x: x / len, z: z / len } : { x, z };
  }

  get sprint() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchSprint; }
  get kick() { return this.keys.has('Space') || this.touchKick; }

  setupTouch(root) {
    const base = root.querySelector('.stick');
    const knob = root.querySelector('.knob');
    let id = null;

    const moveStick = (t) => {
      const r = base.getBoundingClientRect();
      const max = r.width / 2;
      let dx = t.clientX - (r.left + max);
      let dy = t.clientY - (r.top + max);
      const len = Math.hypot(dx, dy);
      if (len > max) { dx *= max / len; dy *= max / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.stick = { x: dx / max, y: dy / max };
    };
    const release = () => {
      id = null;
      this.stick = { x: 0, y: 0 };
      knob.style.transform = '';
    };

    base.addEventListener('touchstart', (e) => { e.preventDefault(); id = e.changedTouches[0].identifier; moveStick(e.changedTouches[0]); }, { passive: false });
    base.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === id) moveStick(t);
    }, { passive: false });
    base.addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === id) release(); });
    base.addEventListener('touchcancel', release);

    const hold = (el, prop) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); this[prop] = true; el.classList.add('down'); }, { passive: false });
      const up = () => { this[prop] = false; el.classList.remove('down'); };
      el.addEventListener('touchend', up);
      el.addEventListener('touchcancel', up);
    };
    hold(root.querySelector('.btn-kick'), 'touchKick');
    hold(root.querySelector('.btn-sprint'), 'touchSprint');
  }
}
