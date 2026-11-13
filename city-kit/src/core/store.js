import { create } from 'zustand';
import { CONFIG, WEAPONS } from '../config';

// Reactive game state (what the UI shows). Things that change every frame
// (positions, velocities) are NOT here: see runtime.js.
export const useGame = create((set, get) => ({
  phase: 'menu', // 'menu' | 'playing' | 'paused'
  night: false,
  // What the player controls: null = on foot, otherwise a vehicle id
  vehicleId: null,
  playerModel: CONFIG.player.model,
  exitPosition: null, // where to respawn the character when leaving a vehicle
  health: CONFIG.player.maxHealth,
  dead: false,
  money: 0,
  weaponIndex: 0,
  ammo: Object.fromEntries(WEAPONS.map((w) => [w.id, { mag: w.mag ?? Infinity, reserve: w.ammo }])),
  aiming: false,
  prompt: null, // text shown at the bottom ("F : monter")
  toast: null,
  speedKmh: 0,
  nitro: 1, // 0..1 gauge of the driven car / bike
  wheelOpen: false, // weapon wheel
  phoneOpen: false,
  kills: 0,

  setPhase: (phase) => set({ phase }),
  toggleNight: () => set({ night: !get().night }),
  setPrompt: (prompt) => get().prompt !== prompt && set({ prompt }),
  showToast: (text) => {
    set({ toast: { text, id: Math.random() } });
  },
  enterVehicle: (id) => set({ vehicleId: id, aiming: false, prompt: null }),
  exitVehicle: (position) => set({ vehicleId: null, exitPosition: position }),
  setWeapon: (i) => set({ weaponIndex: (i + WEAPONS.length) % WEAPONS.length }),
  damage: (amount) => {
    const health = Math.max(0, get().health - amount);
    set({ health, dead: health <= 0 });
  },
  heal: () => set({ health: CONFIG.player.maxHealth, dead: false }),
  addMoney: (n) => set({ money: get().money + n }),
  addKill: () => set({ kills: get().kills + 1 }),
  useAmmo: (id) => {
    const a = get().ammo[id];
    if (!a || a.mag <= 0) return false;
    set({ ammo: { ...get().ammo, [id]: { ...a, mag: a.mag - 1 } } });
    return true;
  },
  reload: (id) => {
    const w = WEAPONS.find((x) => x.id === id);
    const a = get().ammo[id];
    if (!w?.mag || !a) return false;
    const need = Math.min(w.mag - a.mag, a.reserve);
    if (need <= 0) return false;
    set({ ammo: { ...get().ammo, [id]: { mag: a.mag + need, reserve: a.reserve - need } } });
    return true;
  },
}));
