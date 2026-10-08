// Bruit de fond des machines qui travaillent, qui suit la caméra.
//
// Une seule boucle sonore par type de machine (pas une par machine) : à chaque image,
// on additionne ce qu'on entend de chaque machine du même type pour régler son
// volume, et leur position moyenne pour régler le côté gauche/droite.
import { BELT_SPEED, TILE } from '../config.js';
import { game, ui } from '../state.js';
import { factoryIdOf, isInteriorLayer } from '../world/interiors.js';
import { buildingById } from '../world/buildings.js';
import { audioContext, masterOutput, whiteNoise } from './engine.js';
import { INAUDIBLE, hearing } from './hearing.js';
import { isConveyor } from '../sim/transfer.js';

const center = (b) => [(b.x + b.w / 2) * TILE, (b.y + b.h / 2) * TILE];

/**
 * D'où vient le son d'une machine, dans les coordonnées de ce qu'on regarde. Dehors, ce
 * qui tourne dans une usine s'entend depuis l'usine ; dans une usine, on n'entend que
 * ce qui est dedans. Null : on ne l'entend pas.
 */
function soundPosition(b) {
  if (isInteriorLayer(ui.layer)) return b.layer === ui.layer ? center(b) : null;
  if (!b.layer) return center(b);
  const factory = buildingById(factoryIdOf(b.layer));
  return factory ? center(factory) : null;
}

const LOOPS = {
  /** Foreuses : grondement grave qui grince par saccades. */
  drill: {
    volume: 0.12,
    isActive: (b) => b.kind === 'drill' && b.working,
    build(ctx, out) {
      const grind = ctx.createGain();
      grind.gain.value = 0.5;
      lfo(ctx, 'square', 9, 0.4, grind.gain);

      const motor = ctx.createOscillator();
      motor.type = 'sawtooth';
      motor.frequency.value = 48;
      const low = filter(ctx, 'lowpass', 220);
      motor.connect(low).connect(grind);
      motor.start();

      const scrape = filter(ctx, 'bandpass', 900, 1.2);
      const scrapeGain = ctx.createGain();
      scrapeGain.gain.value = 0.35;
      loopNoise(ctx).connect(scrape).connect(scrapeGain).connect(grind);

      grind.connect(out);
    },
  },

  /** Fours : souffle du feu qui respire lentement. */
  furnace: {
    volume: 0.16,
    isActive: (b) => b.type === 'furnace' && b.working,
    build(ctx, out) {
      const roar = filter(ctx, 'lowpass', 380);
      lfo(ctx, 'sine', 0.6, 120, roar.frequency);
      loopNoise(ctx).connect(roar).connect(out);
    },
  },

  /** Tapis chargés : petit cliquetis au rythme des lamelles. */
  belt: {
    volume: 0.035,
    isActive: (b) => isConveyor(b) && b.item && !b.stalled,
    build(ctx, out) {
      const rattle = ctx.createGain();
      rattle.gain.value = 0.5;
      lfo(ctx, 'square', (BELT_SPEED * TILE) / 4, 0.5, rattle.gain);
      loopNoise(ctx).connect(filter(ctx, 'bandpass', 2600, 4)).connect(rattle).connect(out);
    },
  },
};

/** Boucles créées (volume + côté), une fois le son débloqué. */
let channels = null;

function createChannels(ctx) {
  channels = {};
  for (const [name, loop] of Object.entries(LOOPS)) {
    const volume = ctx.createGain();
    volume.gain.value = 0;
    const panner = ctx.createStereoPanner();
    volume.connect(panner).connect(masterOutput());
    loop.build(ctx, volume);
    channels[name] = { volume, panner };
  }
}

/** À appeler à chaque image : règle le volume et le côté de chaque boucle. */
/** À chaque image. `muted` : tout se tait en douceur (écran titre). */
export function updateAmbience({ muted = false } = {}) {
  const ctx = audioContext();
  if (!ctx) return;
  if (!channels) createChannels(ctx);

  for (const [name, loop] of Object.entries(LOOPS)) {
    let loudness = 0, panSum = 0;
    for (const b of muted ? [] : game.buildings) {
      if (!loop.isActive(b)) continue;
      const at = soundPosition(b);
      if (!at) continue;
      const { gain, pan } = hearing(...at);
      if (gain < INAUDIBLE) continue;
      loudness += gain;
      panSum += gain * pan;
    }
    // Plusieurs machines proches sonnent plus fort qu'une seule, sans exploser le volume.
    const level = 1 - Math.exp(-loudness);
    const pan = loudness > 0 ? panSum / loudness : 0;
    const { volume, panner } = channels[name];
    volume.gain.setTargetAtTime(level * loop.volume, ctx.currentTime, 0.12);
    panner.pan.setTargetAtTime(pan, ctx.currentTime, 0.12);
  }
}

// ---------- Petites pièces pour fabriquer les boucles ----------

function loopNoise(ctx) {
  const source = ctx.createBufferSource();
  source.buffer = whiteNoise();
  source.loop = true;
  source.start(0, Math.random() * 2);
  return source;
}

function filter(ctx, type, frequency, q = 1) {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

/** Oscillateur lent qui fait varier un réglage (volume, filtre) de ± depth. */
function lfo(ctx, wave, rate, depth, target) {
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.value = rate;
  const amount = ctx.createGain();
  amount.gain.value = depth;
  osc.connect(amount).connect(target);
  osc.start();
}
