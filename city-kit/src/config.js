// =====================================================================
//  ALL the game settings live here. Change a number, save, the game
//  reloads. Units: meters, seconds, km/h when written "Kmh".
// =====================================================================

export const ASSET = (path) => `${import.meta.env.BASE_URL}${path}`;

// ?quality=low in the URL = no shadows / no post-processing (slow PCs, tests)
const LOW = typeof location !== 'undefined' && new URLSearchParams(location.search).get('quality') === 'low';

export const CONFIG = {
  // ---------- Graphics ----------
  graphics: {
    low: LOW,
    shadows: !LOW,
    shadowMapSize: 2048,
    shadowArea: 90, // size (m) of the shadow box that follows the player
    postprocessing: !LOW, // bloom + vignette (auto-off on phones)
    dpr: LOW ? 1 : [1, 1.75],
    fog: [60, 420], // near, far
  },

  // ---------- Player (ecctrl character) ----------
  player: {
    model: 'models/characters/adam.glb',
    // characters the phone app "Perso" can switch to (all Mixamo, same animations)
    characters: [
      ['Adam', 'models/characters/adam.glb'],
      ['James', 'models/characters/james.glb'],
      ['Agent', 'models/characters/pnj_agent.glb'],
      ['Victoria', 'models/characters/pnj_femme.glb'],
      ['Soldat', 'models/characters/pnj_soldat.glb'],
    ],
    spawn: [0, 2, 6],
    capsuleHalfHeight: 0.5,
    capsuleRadius: 0.3,
    floatHeight: 0.2,
    maxWalkVel: 2.4,
    maxRunVel: 6.5,
    jumpVel: 5.5,
    maxHealth: 100,
    respawnDelay: 4,
    enterVehicleDistance: 3.2,
  },

  // ---------- Camera ----------
  camera: {
    distance: 5.2,
    minDistance: 2,
    maxDistance: 14,
    height: 1.55, // look-at height above the player feet
    shoulder: 0.55, // horizontal offset while aiming
    aimDistance: 2.4,
    fov: 62,
    firstPersonDefault: true, // the 'camera' button / V key switches to third person
    eyeForward: 0.12, // first person: eye a bit in front of the head bone
    fpFov: 75,
    aimFov: 48,
    mouseSensitivity: 0.0024,
    touchSensitivity: 0.006,
    vehicleDistanceFactor: 1.0, // multiplied by the vehicle size
    autoAlignDelay: 1.2, // seconds without mouse before the camera goes back behind the vehicle
  },

  // ---------- Combat ----------
  combat: {
    punchDamage: 25,
    kickDamage: 40,
    punchRange: 1.4,
    meleeImpulse: 6,
    bulletImpulse: 3,
  },

  // ---------- NPC ----------
  npc: {
    count: 14,
    models: [
      'models/characters/james.glb',
      'models/characters/pnj_agent.glb',
      'models/characters/pnj_femme.glb',
      'models/characters/pnj_soldat.glb',
    ],
    walkSpeed: 1.3,
    fleeSpeed: 5.5,
    health: 60,
    respawnDelay: 25,
  },

  // ---------- City ----------
  city: {
    blocks: 5, // blocks per side (odd number keeps the spawn plaza at the center)
    blockSize: 48,
    roadWidth: 14,
    sidewalkHeight: 0.15,
    seed: 7,
  },
};

// Weapons. "fists" is always available. Add one here and it shows in the HUD.
// length = real size in meters: the model is rescaled to it (source files have random sizes).
export const WEAPONS = [
  { id: 'fists', name: 'Poings', model: null, damage: 25, fireRate: 2.5, auto: false, ammo: Infinity, range: 1.4 },
  { id: 'pistol', name: 'Pistolet', model: 'models/weapons/deagle.glb', damage: 34, fireRate: 4, auto: false, ammo: 70, mag: 7, range: 120, spread: 0.004, length: 0.27, twoHands: false },
  { id: 'rifle', name: 'Fusil d\'assaut', model: 'models/weapons/ak.glb', damage: 22, fireRate: 10, auto: true, ammo: 300, mag: 30, range: 200, spread: 0.012, length: 0.88, twoHands: true },
];

// Vehicles. Wheel positions come from the .json files produced by the GTA5
// project (models from the Google Drive "3D" folder). Model forward = +Z.
export const VEHICLE_TYPES = {
  kia: {
    kind: 'car', name: 'Citadine', model: 'models/vehicles/kia.glb',
    size: [1.7, 1.3, 3.6], wheelRadius: 0.297, wheelX: 0.69, wheelZ: 1.19, wheelY: 0.297,
    horsepower: 9, gearRatio: 5.2, topSpeedKmh: 120,
    seat: [0.33, 0.12, -0.05], // where the seated driver's feet origin goes (model space)
    roof: 1.49, // inside height of the roof: the driver's head is lowered under it
  },
  nsx: {
    kind: 'car', name: 'Sportive', model: 'models/vehicles/nsx.glb',
    size: [1.95, 1.07, 4.45], wheelRadius: 0.329, wheelX: 0.8, wheelZ: 1.32, wheelY: 0.329,
    horsepower: 16, gearRatio: 3.8, topSpeedKmh: 190,
    seat: [-0.38, 0.0, -0.25],
    roof: 1.13,
  },
  volvo: {
    kind: 'car', name: 'Police', model: 'models/vehicles/volvo.glb', police: true,
    size: [1.8, 1.45, 4.5], wheelRadius: 0.353, wheelX: 0.85, wheelZ: 1.46, wheelY: 0.36,
    horsepower: 12, gearRatio: 4.4, topSpeedKmh: 160,
    seat: [0.42, 0.18, -0.1],
    roof: 1.6,
  },
  h2r: {
    kind: 'bike', name: 'Superbike', model: 'models/vehicles/h2r.glb',
    size: [0.6, 1.2, 2.4], wheelRadius: 0.39, wheelX: 0.22, wheelZ: 0.88, wheelY: 0.39,
    horsepower: 10, gearRatio: 3.6, topSpeedKmh: 200,
    seat: [0, 0.45, -0.25],
  },
  heli: {
    kind: 'heli', name: 'Hélicoptère', model: 'models/vehicles/heli.glb',
    size: [3.0, 3.2, 10.0], maxHorizSpeed: 32, maxVertSpeed: 9,
    seat: [0.45, 1.05, 2.1],
    roof: 3.15,
  },
};

// Where vehicles are parked at start: [type, x, z, headingRadians]
export const VEHICLE_SPAWNS = [
  ['kia', 9, -3, 0],
  ['nsx', 12.5, -3, 0],
  ['volvo', 16, -3, 0],
  ['h2r', 6, -3, 0],
  ['kia', -31, 40, Math.PI / 2],
  ['nsx', 31, -70, 0],
  ['volvo', -93, 0, 0],
  ['heli', -12, -12, Math.PI / 4],
];
