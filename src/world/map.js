// Démarrer une nouvelle carte : générer le terrain, vider l'usine, poser l'usine de départ.
import { MAP_W, MAP_H, TILE } from '../config.js';
import { emit } from '../core/events.js';
import { game } from '../state.js';
import { generateTerrain } from './terrain.js';
import { buildStarterFactory, starterFocus, starterTerrain } from './starterFactory.js';

export function startNewMap(seed) {
  const cx = MAP_W >> 1, cy = MAP_H >> 1;

  game.seed = seed;
  game.map = generateTerrain(seed, starterTerrain(cx, cy));
  game.buildings = [];
  game.grid = new Array(MAP_W * MAP_H).fill(null);
  game.particles = [];
  game.delivered = {};
  game.tick = 0;

  buildStarterFactory(cx, cy);
  const focus = starterFocus(cx, cy);
  game.spawn = { x: focus.x * TILE, y: focus.y * TILE };

  emit('map:new');
}

export const randomSeed = () => Math.floor(Math.random() * 1e9);
