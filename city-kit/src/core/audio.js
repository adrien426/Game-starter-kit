// Tiny synthesized sound effects (no audio file to download).
// Replace with real samples later: keep the same function names.
let ctx = null;
let master = null;
let noiseBuffer = null;

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuffer.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function noise(duration, freq, gain, type = 'lowpass') {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5, duration);
}

export const sfx = {
  shot: (heavy = false) => { noise(heavy ? 0.35 : 0.22, heavy ? 1800 : 2600, 0.9); noise(0.08, 6000, 0.4, 'highpass'); },
  punch: () => noise(0.12, 500, 0.8),
  hit: () => noise(0.1, 900, 0.5),
  empty: () => noise(0.04, 4000, 0.2, 'highpass'),
  door: () => noise(0.15, 300, 0.5),
  horn: () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const fr of [392, 494]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = fr;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.setValueAtTime(0.12, t + 0.35);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 0.5);
    }
  },
};

// Continuous engine sound, pitch follows the vehicle speed.
let engine = null;
export function setEngine(active, rpm01 = 0, kind = 'car') {
  if (!ctx) return;
  if (!engine) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g).connect(master);
    o.start(); o2.start();
    engine = { o, o2, f, g };
  }
  const t = ctx.currentTime;
  const base = kind === 'heli' ? 18 : kind === 'bike' ? 70 : 45;
  const span = kind === 'heli' ? 10 : kind === 'bike' ? 190 : 120;
  engine.o.frequency.setTargetAtTime(base + rpm01 * span, t, 0.08);
  engine.o2.frequency.setTargetAtTime((base + rpm01 * span) * 0.5, t, 0.08);
  engine.f.frequency.setTargetAtTime(kind === 'heli' ? 300 : 500 + rpm01 * 900, t, 0.1);
  engine.g.gain.setTargetAtTime(active ? (kind === 'heli' ? 0.22 : 0.08 + rpm01 * 0.06) : 0, t, 0.15);
}
