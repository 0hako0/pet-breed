// 効果音はすべて Web Audio API でその場で合成（外部音声ファイル不要）
let ctx = null;
let master = null;
let muted = false;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export function setMuted(v) { muted = v; if (master) master.gain.value = v ? 0 : 0.5; }
export function isMuted() { return muted; }

function tone({ type = 'sine', f0, f1 = f0, dur = 0.2, vol = 0.3, delay = 0, curve = 'exp' }) {
  if (muted) return;
  const c = ac();
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  else o.frequency.linearRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ dur = 0.1, vol = 0.2, delay = 0, freq = 2000, q = 1 }) {
  if (muted) return;
  const c = ac();
  const t = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  bark(small = false) {
    const p = small ? 1.6 : 1;
    tone({ type: 'sawtooth', f0: 520 * p, f1: 260 * p, dur: 0.13, vol: 0.18 });
    noise({ dur: 0.09, vol: 0.25, freq: 900 * p, q: 2 });
    tone({ type: 'sawtooth', f0: 480 * p, f1: 240 * p, dur: 0.12, vol: 0.15, delay: 0.2 });
    noise({ dur: 0.08, vol: 0.2, freq: 900 * p, q: 2, delay: 0.2 });
  },
  meow() {
    tone({ type: 'triangle', f0: 600, f1: 950, dur: 0.18, vol: 0.2, curve: 'lin' });
    tone({ type: 'triangle', f0: 950, f1: 520, dur: 0.35, vol: 0.2, delay: 0.17, curve: 'lin' });
    tone({ type: 'sine', f0: 1200, f1: 1900, dur: 0.18, vol: 0.06, curve: 'lin' });
  },
  purr() {
    for (let i = 0; i < 8; i++) noise({ dur: 0.07, vol: 0.12, freq: 120, q: 0.8, delay: i * 0.09 });
  },
  hiss() { noise({ dur: 0.6, vol: 0.18, freq: 4000, q: 0.5 }); },
  eat() {
    for (let i = 0; i < 6; i++) noise({ dur: 0.05, vol: 0.25, freq: 1500 + Math.random() * 1500, q: 3, delay: i * 0.18 + Math.random() * 0.05 });
  },
  happy() {
    [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.18, vol: 0.18, delay: i * 0.08 }));
  },
  success() {
    [784, 988, 1175, 1568].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.22, vol: 0.18, delay: i * 0.09 }));
  },
  fail() {
    tone({ type: 'triangle', f0: 400, f1: 250, dur: 0.35, vol: 0.18 });
  },
  coin() {
    tone({ type: 'square', f0: 988, dur: 0.08, vol: 0.08 });
    tone({ type: 'square', f0: 1319, dur: 0.25, vol: 0.08, delay: 0.08 });
  },
  pop() { tone({ type: 'sine', f0: 900, f1: 200, dur: 0.12, vol: 0.2 }); },
  splash() {
    for (let i = 0; i < 4; i++) noise({ dur: 0.25, vol: 0.12, freq: 800 + i * 500, q: 0.7, delay: i * 0.12 });
  },
  brush() {
    for (let i = 0; i < 5; i++) noise({ dur: 0.18, vol: 0.08, freq: 3000, q: 0.6, delay: i * 0.3 });
  },
  levelup() {
    [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.2, vol: 0.2, delay: i * 0.1 }));
  },
  click() { tone({ type: 'sine', f0: 700, f1: 500, dur: 0.05, vol: 0.08 }); },
  throw() { noise({ dur: 0.25, vol: 0.12, freq: 600, q: 0.6 }); },
  snore() { tone({ type: 'sine', f0: 110, f1: 90, dur: 0.9, vol: 0.06, curve: 'lin' }); },
  camera() { noise({ dur: 0.06, vol: 0.3, freq: 3000, q: 0.5 }); noise({ dur: 0.08, vol: 0.25, freq: 2000, q: 0.5, delay: 0.09 }); },
};

export function voice(isCat, smallDog) {
  if (isCat) sfx.meow(); else sfx.bark(smallDog);
}
