// Compteur de passage : chaque bâtiment note les items qui le quittent
// (fabriqués par une machine, ou transportés par un tapis ou un splitter).
// Sert à afficher les cadences « items par minute » dans les fiches.
import { SIM_DT } from '../config.js';
import { game } from '../state.js';

const MINUTE_TICKS = 60 / SIM_DT;
/**
 * On mesure sur les 30 dernières secondes : assez long pour lisser, assez court pour
 * revenir vite à la vraie cadence après un à-coup (ex. une foreuse qui vide son stock
 * quand on la branche enfin à un tapis).
 */
const WINDOW_TICKS = 30 / SIM_DT;
/** Moins de 10 secondes de mesure : le chiffre serait trompeur, on ne l'affiche pas encore. */
const MIN_WINDOW_TICKS = 10 / SIM_DT;

/** Note qu'un item vient de quitter le bâtiment (`output` : par quelle sortie, pour un splitter). */
export function recordFlow(b, itemType, output = null) {
  b.flow.push({ tick: game.tick, itemType, output });
  while (b.flow[0].tick < game.tick - WINDOW_TICKS) b.flow.shift();
}

/**
 * Débit mesuré sur les 30 dernières secondes (ou depuis la pose, si c'est plus récent),
 * ramené à la minute :
 *   perMinute : items par minute, ou null pendant les 10 premières secondes
 *   byItem    : [{ itemType, perMinute }]
 *   byOutput  : Map sortie → items par minute
 */
export function flowSummary(b) {
  const windowTicks = Math.min(WINDOW_TICKS, game.tick - b.placedAt);
  if (windowTicks < MIN_WINDOW_TICKS) return { perMinute: null, byItem: [], byOutput: new Map() };

  const scale = MINUTE_TICKS / windowTicks;
  const recent = b.flow.filter((e) => e.tick >= game.tick - windowTicks);
  const byItem = new Map(), byOutput = new Map();
  for (const e of recent) {
    byItem.set(e.itemType, (byItem.get(e.itemType) ?? 0) + scale);
    if (e.output !== null) byOutput.set(e.output, (byOutput.get(e.output) ?? 0) + scale);
  }
  return {
    perMinute: recent.length * scale,
    byItem: [...byItem].map(([itemType, perMinute]) => ({ itemType, perMinute })),
    byOutput,
  };
}
