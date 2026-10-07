// Moteur audio : le contexte Web Audio, le volume général et la sourdine.
//
// Les navigateurs bloquent le son tant que le joueur n'a pas cliqué ou appuyé
// sur une touche : unlockAudio() est appelé à la première interaction.

const STORAGE_KEY = 'fabrika:muted';
const MASTER_VOLUME = 0.35;

let ctx = null;
let master = null;
let noiseBuffer = null;
let muted = readMuted();

function readMuted() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOLUME;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

/** Le contexte audio, ou null tant que le son n'est pas débloqué. */
export const audioContext = () => (ctx && ctx.state === 'running' ? ctx : null);

/** Sortie générale : tous les sons s'y branchent. */
export const masterOutput = () => master;

export const isMuted = () => muted;

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch { /* préférence non gardée */ }
  if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, ctx.currentTime, 0.05);
  return muted;
}

/** Deux secondes de bruit blanc, partagées par tous les sons qui en ont besoin. */
export function whiteNoise() {
  if (!noiseBuffer) {
    const length = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}
