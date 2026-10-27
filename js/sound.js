// Sons synthétisés (Web Audio). Ce sont des imitations originales des
// instruments du bloc musical, pas les enregistrements du jeu.

import { INSTRUMENTS } from './data.js?v=0.2.4';

let ctx = null, master = null, noiseBuf = null;
const ksCache = new Map();

export function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setVolume(v) { audio(); master.gain.value = v; }

const hz = m => 440 * Math.pow(2, (m - 69) / 12);

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}

function tone(type, f, t, dec, peak, dest, a = 0.004) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  const g = ctx.createGain(); env(g, t, a, peak, dec);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + dec + 0.05);
  return o;
}

function noise(t, dec, peak, dest, ftype, freq, q = 1) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); env(g, t, 0.002, peak, dec);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t, Math.random() * 0.5); s.stop(t + dec + 0.05);
}

// Corde pincée (Karplus-Strong). Le playbackRate corrige l'accord exact.
function pluck(f, t, dest, { dur = 1.4, damp = 0.996, bright = 0.5, peak = 0.7 } = {}) {
  const sr = ctx.sampleRate;
  const p = Math.max(8, Math.round(sr / f));
  const key = p + ':' + damp + ':' + bright + ':' + dur;
  let buf = ksCache.get(key);
  if (!buf) {
    const n = Math.floor(sr * dur);
    buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const ring = new Float32Array(p);
    for (let i = 0; i < p; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const a = ring[idx], b = ring[(idx + 1) % p];
      d[i] = a;
      const avg = 0.5 * (a + b);
      ring[idx] = damp * (bright * a + (1 - bright) * avg);
      idx = (idx + 1) % p;
    }
    ksCache.set(key, buf);
  }
  const s = ctx.createBufferSource(); s.buffer = buf;
  s.playbackRate.value = (f * p) / sr;
  const g = ctx.createGain(); g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.98);
  s.connect(g); g.connect(dest); s.start(t); s.stop(t + dur);
}

function partials(f, t, dest, list, dec, peak) {
  for (const [mul, amp, dmul = 1] of list) tone('sine', f * mul, t, dec * dmul, peak * amp, dest, 0.002);
}

const PLAY = {
  harp(f, t, o) {
    tone('triangle', f, t, 1.1, 0.45, o, 0.003);
    tone('sine', f * 2, t, 0.5, 0.12, o, 0.003);
    noise(t, 0.015, 0.05, o, 'highpass', 3000);
  },
  bass(f, t, o) { pluck(f, t, o, { dur: 1.2, damp: 0.994, bright: 0.2, peak: 0.9 }); tone('sine', f, t, 0.6, 0.35, o); },
  guitar(f, t, o) { pluck(f, t, o, { dur: 1.6, damp: 0.997, bright: 0.35, peak: 0.7 }); },
  banjo(f, t, o) { pluck(f, t, o, { dur: 0.8, damp: 0.99, bright: 0.75, peak: 0.6 }); },
  flute(f, t, o) {
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = f;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2;
    const lg = ctx.createGain(); lg.gain.value = f * 0.006; lfo.connect(lg); lg.connect(osc.frequency);
    const g = ctx.createGain(); env(g, t, 0.05, 0.45, 0.75);
    osc.connect(g); g.connect(o); osc.start(t); lfo.start(t); osc.stop(t + 0.9); lfo.stop(t + 0.9);
    tone('triangle', f * 2, t, 0.5, 0.05, o, 0.05);
    noise(t, 0.12, 0.03, o, 'bandpass', f * 2, 2);
  },
  bell(f, t, o) { partials(f, t, o, [[1, 1, 1], [2, 0.5, 0.7], [2.76, 0.35, 0.5], [5.4, 0.15, 0.3]], 2.2, 0.35); },
  chime(f, t, o) { partials(f, t, o, [[1, 1, 1], [2.76, 0.4, 0.6], [5.4, 0.25, 0.4], [8.9, 0.1, 0.25]], 2.4, 0.28); },
  xylophone(f, t, o) { partials(f, t, o, [[1, 1, 1], [3.93, 0.3, 0.5], [9.2, 0.08, 0.3]], 0.38, 0.5); noise(t, 0.01, 0.06, o, 'highpass', 4000); },
  iron_xylophone(f, t, o) {
    const g = ctx.createGain(); g.connect(o);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5;
    const lg = ctx.createGain(); lg.gain.value = 0.3; lfo.connect(lg); lg.connect(g.gain); g.gain.value = 0.7;
    lfo.start(t); lfo.stop(t + 1.5);
    partials(f, t, g, [[1, 1, 1], [4, 0.25, 0.5]], 1.3, 0.5);
  },
  cow_bell(f, t, o) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 3; bp.connect(o);
    tone('square', f, t, 0.3, 0.35, bp); tone('square', f * 1.48, t, 0.3, 0.3, bp);
  },
  didgeridoo(f, t, o) {
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6; lp.frequency.value = 500;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 3; const lg = ctx.createGain(); lg.gain.value = 300;
    lfo.connect(lg); lg.connect(lp.frequency);
    const g = ctx.createGain(); env(g, t, 0.04, 0.5, 0.9);
    osc.connect(lp); lp.connect(g); g.connect(o);
    osc.start(t); lfo.start(t); osc.stop(t + 1.0); lfo.stop(t + 1.0);
  },
  bit(f, t, o) { tone('square', f, t, 0.35, 0.22, o, 0.002); },
  pling(f, t, o) {
    const car = ctx.createOscillator(); car.frequency.value = f;
    const mod = ctx.createOscillator(); mod.frequency.value = f * 2;
    const mg = ctx.createGain(); mg.gain.setValueAtTime(f * 1.5, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.8);
    mod.connect(mg); mg.connect(car.frequency);
    const g = ctx.createGain(); env(g, t, 0.003, 0.45, 1.4);
    car.connect(g); g.connect(o); car.start(t); mod.start(t); car.stop(t + 1.5); mod.stop(t + 1.5);
  },
  // Percussions : la hauteur change la « vitesse » du son, comme dans le jeu
  basedrum(f, t, o, r) {
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(160 * r, t); osc.frequency.exponentialRampToValueAtTime(42 * r, t + 0.12);
    const g = ctx.createGain(); env(g, t, 0.002, 0.95, 0.28);
    osc.connect(g); g.connect(o); osc.start(t); osc.stop(t + 0.35);
    noise(t, 0.03, 0.25, o, 'lowpass', 900 * r);
  },
  snare(f, t, o, r) {
    noise(t, 0.17, 0.55, o, 'bandpass', 2000 * r, 0.7);
    tone('triangle', 190 * r, t, 0.07, 0.35, o, 0.001);
  },
  hat(f, t, o, r) { noise(t, 0.045, 0.6, o, 'bandpass', 3200 * r, 2.5); },
};

export function playNote(instr, midi, when = 0) {
  audio();
  const t = Math.max(ctx.currentTime, when || ctx.currentTime) + 0.005;
  const inf = INSTRUMENTS[instr] || INSTRUMENTS.harp;
  const rate = Math.pow(2, (midi - inf.base - 12) / 12); // 12 clics = hauteur normale
  try { (PLAY[instr] || PLAY.harp)(hz(midi), t, master, rate); } catch (e) { console.warn(e); }
}
