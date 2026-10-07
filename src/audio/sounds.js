// Sons ponctuels rétro (style 8 bits), fabriqués par le code : aucun fichier audio.
//
// playSound('place')             → son d'interface, même volume partout
// playSound('thump', { x, y })   → son placé sur la carte, plus fort quand on est proche
import { audioContext, masterOutput, whiteNoise } from './engine.js';
import { INAUDIBLE, hearing } from './hearing.js';

/** Un ton qui glisse de `from` à `to` Hz et s'éteint en `duration` secondes. */
function tone(ctx, out, { wave = 'square', from, to = from, duration, volume, delay = 0 }) {
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + duration);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Un souffle de bruit filtré, du clair vers le sourd (impacts, nuages de fumée). */
function noise(ctx, out, { duration, volume, brightFrom, brightTo, delay = 0 }) {
  const start = ctx.currentTime + delay;
  const source = ctx.createBufferSource();
  source.buffer = whiteNoise();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(brightFrom, start);
  filter.frequency.exponentialRampToValueAtTime(brightTo, start + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(out);
  source.start(start, Math.random(), duration + 0.05);
}

const SOUNDS = {
  /** Poser un bâtiment : un petit « tchonk » métallique. */
  place(ctx, out) {
    tone(ctx, out, { from: 220, to: 110, duration: 0.08, volume: 0.16 });
    noise(ctx, out, { duration: 0.06, volume: 0.12, brightFrom: 2500, brightTo: 400 });
  },
  /** Poser un tapis en glissant : plus léger, pour ne pas fatiguer l'oreille. */
  belt(ctx, out) {
    tone(ctx, out, { from: 330, to: 220, duration: 0.04, volume: 0.07 });
  },
  /** Enlever un bâtiment : un « pouf ». */
  remove(ctx, out) {
    noise(ctx, out, { duration: 0.2, volume: 0.16, brightFrom: 3000, brightTo: 150 });
    tone(ctx, out, { wave: 'triangle', from: 300, to: 80, duration: 0.15, volume: 0.1 });
  },
  /** Tourner, changer d'outil ou de forme : un clic. */
  click(ctx, out) {
    tone(ctx, out, { from: 660, duration: 0.03, volume: 0.05 });
  },
  /** Pose impossible : un bourdonnement grave. */
  deny(ctx, out) {
    tone(ctx, out, { wave: 'square', from: 130, to: 110, duration: 0.12, volume: 0.05 });
  },
  /** Livraison au dépôt : une petite pièce. */
  deliver(ctx, out) {
    tone(ctx, out, { from: 988, duration: 0.05, volume: 0.06 });
    tone(ctx, out, { from: 1319, duration: 0.1, volume: 0.06, delay: 0.05 });
  },
  /** Coup de piston de la presse : un « boum » sourd. */
  thump(ctx, out) {
    tone(ctx, out, { wave: 'sine', from: 140, to: 45, duration: 0.14, volume: 0.25 });
    noise(ctx, out, { duration: 0.08, volume: 0.1, brightFrom: 1200, brightTo: 200 });
  },
  /** Objectif atteint : une courte fanfare. */
  goal(ctx, out) {
    [523, 659, 784, 1047].forEach((f, i) => tone(ctx, out, { from: f, duration: 0.14, volume: 0.1, delay: i * 0.11 }));
    tone(ctx, out, { wave: 'triangle', from: 1047, duration: 0.5, volume: 0.12, delay: 0.44 });
  },
};

// Pour ne pas empiler le même son quand il se répète très vite (ex. livraisons en rafale).
const MIN_GAP = { deliver: 0.12, belt: 0.03, thump: 0.05 };
const lastPlayed = {};

/** Joue un son. Avec `at` ({ x, y } en pixels de la carte), le son vient de cet endroit. */
export function playSound(name, at = null) {
  const ctx = audioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (now - (lastPlayed[name] ?? -1) < (MIN_GAP[name] ?? 0)) return;

  let out = masterOutput();
  if (at) {
    const { gain, pan } = hearing(at.x, at.y);
    if (gain < INAUDIBLE) return;
    const volume = ctx.createGain();
    volume.gain.value = gain;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    volume.connect(panner).connect(out);
    out = volume;
  }

  lastPlayed[name] = now;
  SOUNDS[name](ctx, out);
}
