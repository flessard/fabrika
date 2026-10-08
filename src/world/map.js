// Démarrer une nouvelle carte : générer le terrain, vider l'usine, poser le dépôt
// (ou toute l'usine de démonstration, pour le décor de l'écran titre).
// (Une partie sauvegardée repart du même terrain vide : voir world/save.js.)
import { MAP_W, MAP_H, TILE } from '../config.js';
import { emit } from '../core/events.js';
import { game } from '../state.js';
import { generateTerrain } from './terrain.js';
import { resetFog } from './fog.js';
import { START_INVENTORY } from './inventory.js';
import { ALL_UNLOCKED, START_UNLOCKED } from '../data/research.js';
import { buildStarterFactory, starterFocus, starterTerrain } from './starterFactory.js';

export function startNewMap(seed, { demo = false } = {}) {
  const { cx, cy } = prepareMap(seed);
  // L'usine de démonstration du menu montre tout ; une vraie partie part du début de l'arbre.
  game.unlocked = [...(demo ? ALL_UNLOCKED : START_UNLOCKED)];
  buildStarterFactory(cx, cy, { demo });
  const focus = starterFocus(cx, cy, { demo });
  game.spawn = { x: focus.x * TILE, y: focus.y * TILE };
  emit('map:new', { loaded: false });
}

/**
 * Terrain de la graine, sans aucun bâtiment, au tick 0. Le terrain ne dépend que de
 * la graine : il n'a pas besoin d'être sauvegardé. Retourne le centre de la carte.
 */
export function prepareMap(seed) {
  const cx = MAP_W >> 1, cy = MAP_H >> 1;

  game.seed = seed;
  game.map = generateTerrain(seed, starterTerrain(cx, cy));
  game.buildings = [];
  game.byId = new Map();
  game.nextId = 1;
  game.grid = new Array(MAP_W * MAP_H).fill(null);
  game.under = new Array(MAP_W * MAP_H).fill(null);
  game.interiors = new Map(); // id d'une usine → sa grille intérieure (world/interiors.js)
  resetFog();
  game.particles = [];
  game.delivered = {};
  game.level = 0;
  game.levelDelivered = {};
  game.inventory = { ...START_INVENTORY };
  game.unlocked = [...START_UNLOCKED];
  game.credits = {};
  game.tick = 0;
  return { cx, cy };
}

export const randomSeed = () => Math.floor(Math.random() * 1e9);
