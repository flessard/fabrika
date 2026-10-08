// Sauvegarde : tout l'état de la partie en données simples (JSON).
//
// Le terrain n'est pas sauvegardé : il se regénère à partir de la graine. On garde la
// liste des bâtiments dans l'ordre (c'est l'ordre dans lequel la simulation les fait
// avancer), avec tout leur état : items sur les tapis, stocks, fabrication en cours…
// Les débits mesurés (flow) et les particules ne changent rien à l'usine : ils repartent
// de zéro. Une partie chargée continue donc exactement comme elle se serait poursuivie.
import { emit } from '../core/events.js';
import { game, view } from '../state.js';
import { restoreBuilding } from './buildings.js';
import { prepareMap } from './map.js';
import { restoreFog, serializeFog } from './fog.js';
import { START_INVENTORY } from './inventory.js';
import { ALL_UNLOCKED } from '../data/research.js';

/** Version 2 : carte de 128 × 96 et brouillard. Les sauvegardes plus anciennes sont ignorées. */
const VERSION = 2;
const STORAGE_KEY = 'fabrika.save';

/** L'état de la partie, prêt pour JSON.stringify. */
export function serializeGame() {
  return {
    version: VERSION,
    seed: game.seed,
    tick: game.tick,
    nextId: game.nextId,
    delivered: { ...game.delivered },
    level: game.level,
    levelDelivered: { ...game.levelDelivered },
    inventory: { ...game.inventory },
    unlocked: [...game.unlocked],
    credits: { ...game.credits },
    explored: serializeFog(),
    // Où regardait la caméra : on y revient au chargement.
    camera: { x: view.camX + view.width / 2, y: view.camY + view.height / 2 },
    buildings: game.buildings.map(({ flow, stalled, ...state }) => structuredClone(state)),
  };
}

/** Remplace la partie en cours par une partie sauvegardée. */
export function loadGame(save) {
  if (save?.version !== VERSION) throw new Error(`Sauvegarde de version inconnue : ${save?.version}`);
  prepareMap(save.seed);
  game.tick = save.tick;
  game.nextId = save.nextId;
  game.delivered = { ...save.delivered };
  game.level = save.level ?? 0;
  game.levelDelivered = { ...save.levelDelivered };
  game.inventory = { ...(save.inventory ?? START_INVENTORY) }; // sauvegarde d'avant l'inventaire
  game.unlocked = [...(save.unlocked ?? ALL_UNLOCKED)]; // sauvegarde d'avant l'arbre : tout est débloqué
  game.credits = { ...save.credits };
  for (const saved of save.buildings) restoreBuilding({ ...structuredClone(saved), flow: [], stalled: false });
  restoreFog(save.explored);
  game.spawn = { ...save.camera };
  emit('map:new', { loaded: true });
}

/**
 * Empreinte de l'usine : deux parties qui ont la même empreinte sont identiques.
 * Servira à vérifier que des joueurs en réseau ont bien la même usine.
 */
export function fingerprint() {
  const { camera, ...state } = serializeGame();
  const text = JSON.stringify(state);
  let hash = 0x811c9dc5; // FNV-1a, 32 bits
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ---------- Emplacement de sauvegarde dans le navigateur ----------

/** Sauvegarde la partie dans le navigateur. Retourne vrai si c'est fait. */
export function saveToBrowser() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), game: serializeGame() }));
    emit('save:changed');
    return true;
  } catch {
    return false; // stockage plein ou indisponible (navigation privée…)
  }
}

/** La sauvegarde du navigateur : { savedAt, game }, ou null s'il n'y en a pas (ou si elle est trop ancienne). */
export function savedInBrowser() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved?.game?.version === VERSION ? saved : null;
  } catch {
    return null;
  }
}

/** Charge la sauvegarde du navigateur. Retourne vrai si c'est fait. */
export function loadFromBrowser() {
  const saved = savedInBrowser();
  if (!saved) return false;
  try {
    loadGame(saved.game);
    return true;
  } catch {
    return false;
  }
}
