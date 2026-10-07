// Ce qu'on entend d'un son selon où il se trouve sur la carte.
// L'oreille du joueur est au centre de l'écran.
import { TILE } from '../config.js';
import { view } from '../state.js';

/** Distance (px) à laquelle un son est deux fois moins fort. */
const HALF_VOLUME_DISTANCE = 4 * TILE;
/** Au-delà de cette force, on ne prend pas la peine de jouer le son. */
export const INAUDIBLE = 0.02;

/**
 * Force (0 à 1) et côté (-1 gauche, +1 droite) d'un son placé en (x, y), en pixels de la carte.
 */
export function hearing(x, y) {
  const dx = x - (view.camX + view.width / 2);
  const dy = y - (view.camY + view.height / 2);
  const distance = Math.hypot(dx, dy);
  const gain = 1 / (1 + (distance / HALF_VOLUME_DISTANCE) ** 2);
  const pan = Math.max(-1, Math.min(1, dx / (view.width / 2))) * 0.7;
  return { gain, pan };
}
