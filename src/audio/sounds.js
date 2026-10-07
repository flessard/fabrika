// Effets sonores rétro (style 8 bits), fabriqués par le code avec la Web Audio API.
// Aucun fichier audio : chaque son est un petit mélange de tons et de bruit.
//
// Les navigateurs bloquent le son tant que le joueur n'a pas cliqué ou appuyé
// sur une touche : unlockAudio() est appelé à la première interaction.

const STORAGE_KEY = 'fabrika:muted';

let ctx = null;
let master = null;
let muted = readMuted();

function readMuted() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export const isMuted = () => muted;

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch { /* préférence non gardée */ }
  return muted;
}

const ready = () => !muted && ctx && ctx.state === 'running';

/** Un ton qui glisse de `from` à `to` Hz et s'éteint en `duration` secondes. */
function tone({ wave = 'square', from, to = from, duration, volume, delay = 0 }) {
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + duration);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Un souffle de bruit filtré, du clair vers le sourd (impacts, nuages de fumée). */
function noise({ duration, volume, brightFrom, brightTo, delay = 0 }) {
  const start = ctx.currentTime + delay;
  const length = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(brightFrom, start);
  filter.frequency.exponentialRampToValueAtTime(brightTo, start + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(master);
  source.start(start);
}

const SOUNDS = {
  /** Poser un bâtiment : un petit « tchonk » métallique. */
  place() {
    tone({ from: 220, to: 110, duration: 0.08, volume: 0.16 });
    noise({ duration: 0.06, volume: 0.12, brightFrom: 2500, brightTo: 400 });
  },
  /** Poser un tapis en glissant : plus léger, pour ne pas fatiguer l'oreille. */
  belt() {
    tone({ from: 330, to: 220, duration: 0.04, volume: 0.07 });
  },
  /** Enlever un bâtiment : un « pouf ». */
  remove() {
    noise({ duration: 0.2, volume: 0.16, brightFrom: 3000, brightTo: 150 });
    tone({ wave: 'triangle', from: 300, to: 80, duration: 0.15, volume: 0.1 });
  },
  /** Tourner, changer d'outil ou de forme : un clic. */
  click() {
    tone({ from: 660, duration: 0.03, volume: 0.05 });
  },
  /** Livraison au dépôt : une petite pièce. */
  deliver() {
    tone({ from: 988, duration: 0.05, volume: 0.06 });
    tone({ from: 1319, duration: 0.1, volume: 0.06, delay: 0.05 });
  },
  /** Objectif atteint : une courte fanfare. */
  goal() {
    [523, 659, 784, 1047].forEach((f, i) => tone({ from: f, duration: 0.14, volume: 0.1, delay: i * 0.11 }));
    tone({ wave: 'triangle', from: 1047, duration: 0.5, volume: 0.12, delay: 0.44 });
  },
};

// Pour ne pas empiler le même son quand il se répète très vite (ex. livraisons en rafale).
const MIN_GAP = { deliver: 0.12, belt: 0.03 };
const lastPlayed = {};

export function playSound(name) {
  if (!ready()) return;
  const now = ctx.currentTime;
  if (now - (lastPlayed[name] ?? -1) < (MIN_GAP[name] ?? 0)) return;
  lastPlayed[name] = now;
  SOUNDS[name]();
}
