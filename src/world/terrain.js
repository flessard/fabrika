// Génération procédurale du terrain : sol, décor et gisements.
// Le terrain est stocké dans trois tableaux à plat de MAP_W × MAP_H cases.
import { MAP_W, MAP_H } from '../config.js';
import { cellIndex, inBounds } from '../core/grid.js';
import { createRng, createValueNoise } from '../core/random.js';

export const GROUND = { GRASS: 0, DARK_GRASS: 1, SAND: 2, WATER: 3, DEEP_WATER: 4 };
export const DECO = { NONE: 0, TREE: 1, ROCK: 2, BUSH: 3, FLOWER: 4 };
export const ORE = { NONE: 0, IRON: 1, COPPER: 2, COAL: 3 };

/** Item extrait par une foreuse posée sur chaque type de gisement. */
export const ORE_ITEM = { [ORE.IRON]: 'fe_ore', [ORE.COPPER]: 'cu_ore', [ORE.COAL]: 'coal' };

export const isLand = (map, i) => map.ground[i] <= GROUND.SAND;
/**
 * Ce qui empêche de construire sur la case, ou null : l'eau, les arbres et les roches.
 * Les buissons et les fleurs ne gênent pas.
 */
export function terrainProblem(map, i) {
  if (!isLand(map, i)) return 'eau';
  if (map.deco[i] === DECO.TREE) return 'arbre';
  if (map.deco[i] === DECO.ROCK) return 'rocher';
  return null;
}
export const isBuildable = (map, i) => terrainProblem(map, i) === null;

/**
 * Génère un terrain à partir d'une graine.
 * options.clearArea   : rectangle {x0, y0, x1, y1} gardé dégagé (terre ferme, sans décor)
 * options.orePatches  : gisements imposés [{x, y, radius, ore}]
 * options.forcedOre   : rectangles de minerai imposés [{x0, y0, x1, y1, ore}] (ORE.NONE efface)
 */
export function generateTerrain(seed, { clearArea = null, orePatches = [], forcedOre = [] } = {}) {
  const rng = createRng(seed);
  const height = createValueNoise(rng, 11);
  const heightDetail = createValueNoise(rng, 5);
  const vegetation = createValueNoise(rng, 7);
  const clumps = createValueNoise(rng, 3);

  const size = MAP_W * MAP_H;
  const map = { ground: new Uint8Array(size), ore: new Uint8Array(size), deco: new Uint8Array(size) };
  const inClearArea = (x, y) =>
    clearArea && x >= clearArea.x0 && x <= clearArea.x1 && y >= clearArea.y0 && y <= clearArea.y1;

  // 1. Sol et décor. La « hauteur » donne, du plus bas au plus haut :
  //    eau profonde, eau, sable, herbe.
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = cellIndex(x, y);
      let h = height(x, y) * 0.72 + heightDetail(x, y) * 0.28;
      if (inClearArea(x, y)) h = Math.max(h, 0.5);

      if (h < 0.27) map.ground[i] = GROUND.DEEP_WATER;
      else if (h < 0.33) map.ground[i] = GROUND.WATER;
      else if (h < 0.37) map.ground[i] = GROUND.SAND;
      else map.ground[i] = vegetation(x, y) > 0.6 ? GROUND.DARK_GRASS : GROUND.GRASS;

      if (!inClearArea(x, y) && map.ground[i] <= GROUND.DARK_GRASS) {
        const density = vegetation(x, y) * 0.6 + clumps(x, y) * 0.4;
        if (density > 0.6 && rng() < 0.6) map.deco[i] = DECO.TREE;
        else if (rng() < 0.018) map.deco[i] = DECO.ROCK;
        else if (rng() < 0.04) map.deco[i] = DECO.BUSH;
        else if (rng() < 0.07) map.deco[i] = DECO.FLOWER;
      }
    }
  }

  // 2. Gisements : des taches rondes aux bords irréguliers, seulement sur la terre ferme.
  const addPatch = (cx, cy, radius, ore) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (!inBounds(x, y)) continue;
        const i = cellIndex(x, y);
        const inside = dx * dx + dy * dy <= radius * radius + (rng() - 0.5) * radius * 1.5;
        if (inside && isLand(map, i)) {
          map.ore[i] = ore;
          if (map.deco[i] === DECO.TREE || map.deco[i] === DECO.ROCK) map.deco[i] = DECO.NONE;
        }
      }
    }
  };

  for (const p of orePatches) addPatch(p.x, p.y, p.radius, p.ore);
  for (const r of forcedOre) {
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) map.ore[cellIndex(x, y)] = r.ore;
  }

  // 3. Gisements au hasard ailleurs sur la carte, en alternant fer, cuivre et charbon.
  const randomOres = [ORE.IRON, ORE.COPPER, ORE.COAL];
  for (let k = 0; k < 14; k++) {
    let x, y, tries = 0;
    do {
      x = 2 + Math.floor(rng() * (MAP_W - 4));
      y = 2 + Math.floor(rng() * (MAP_H - 4));
    } while ((inClearArea(x, y) || !isLand(map, cellIndex(x, y))) && ++tries < 40);
    addPatch(x, y, 1.6 + rng() * 1.4, randomOres[k % 3]);
  }

  return map;
}
