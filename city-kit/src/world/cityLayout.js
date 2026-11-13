import { CONFIG } from '../config';

// Pure data: where the blocks, roads and buildings are. No three.js here,
// so the same layout can feed the 3D city, the minimap and the NPCs.

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const { blocks, blockSize, roadWidth, seed } = CONFIG.city;
export const CELL = blockSize + roadWidth;
export const HALF_BLOCKS = Math.floor(blocks / 2);
export const CITY_HALF = (HALF_BLOCKS + 0.5) * CELL + roadWidth / 2; // edge of the outer road

// Special blocks (grid coordinates). Everything else gets buildings.
export const SPECIAL = {
  '0,0': 'plaza', // spawn, parked vehicles, helipad
  '0,1': 'test', // test level: platforms, ramps, stairs
  '1,0': 'park',
  '-1,-1': 'park',
  '2,-2': 'park',
};

function makeLayout() {
  const r = rng(seed);
  const list = [];
  for (let i = -HALF_BLOCKS; i <= HALF_BLOCKS; i++) {
    for (let j = -HALF_BLOCKS; j <= HALF_BLOCKS; j++) {
      const kind = SPECIAL[`${i},${j}`] ?? 'buildings';
      const block = { i, j, x: i * CELL, z: j * CELL, kind, buildings: [] };
      if (kind === 'buildings') {
        const centerDist = Math.hypot(i, j);
        if (r() < 0.25) {
          // one big tower
          const w = 26 + r() * 12;
          const d = 26 + r() * 12;
          block.buildings.push({ x: block.x, z: block.z, w, d, h: 45 + r() * 55 / (1 + centerDist * 0.2), style: Math.floor(r() * 4) });
        } else {
          for (const ox of [-1, 1]) for (const oz of [-1, 1]) {
            const w = 13 + r() * 7;
            const d = 13 + r() * 7;
            const h = (8 + r() * 30) * (centerDist < 1.5 ? 1.5 : 1);
            block.buildings.push({ x: block.x + ox * 11.5, z: block.z + oz * 11.5, w, d, h, style: Math.floor(r() * 4) });
          }
        }
      }
      list.push(block);
    }
  }
  return list;
}

export const LAYOUT = makeLayout();

/** Road center lines (for markings and the minimap). */
export function roadLines() {
  const lines = [];
  for (let k = -HALF_BLOCKS - 1; k <= HALF_BLOCKS; k++) {
    const c = (k + 0.5) * CELL;
    lines.push({ axis: 'x', c, from: -CITY_HALF, to: CITY_HALF }); // road along X at z = c
    lines.push({ axis: 'z', c, from: -CITY_HALF, to: CITY_HALF }); // road along Z at x = c
  }
  return lines;
}
