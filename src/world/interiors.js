// Intérieur des usines : chaque bâtiment « Usine » (4 × 4 cases sur la carte) contient sa
// propre grille de 32 × 32 cases, où l'on bâtit comme dehors, en plus compact.
//
// L'intérieur est une couche de plus, à côté de la surface et du sous-sol : son nom est
// « in:<id de l'usine> ». Les bâtiments posés dedans le disent dans leur champ `layer`.
//
// Portes : chaque case du contour de l'usine (4 par côté) a une porte dans le mur intérieur.
//   - un tapis du dehors qui entre dans l'usine par cette case fait apparaître ses items
//     juste derrière la porte, à l'intérieur (entrée) ;
//   - un tapis de l'intérieur qui va vers la porte fait sortir ses items devant la case,
//     dehors (sortie).
// Une porte devient donc une entrée ou une sortie selon ce qui y arrive : rien à régler.
//
//            dehors           │ mur │        intérieur (32 × 32)
//   tapis → [case du contour] │porte│ → [case derrière la porte] → …
import { MAP_H, MAP_W } from '../config.js';
import { DOWN, LEFT, RIGHT, UP, opposite } from '../core/grid.js';
import { game } from '../state.js';

export const INTERIOR_SIZE = 32;
export const FACTORY_SIZE = 4;
/** Taille du mur, en cases, sur chaque bord de l'intérieur. */
const SPAN = INTERIOR_SIZE / FACTORY_SIZE;

export const interiorLayer = (factory) => `in:${factory.id}`;
export const isInteriorLayer = (layer) => typeof layer === 'string' && layer.startsWith('in:');
/** Identifiant de l'usine dont c'est l'intérieur (ou null). */
export const factoryIdOf = (layer) => (isInteriorLayer(layer) ? Number(layer.slice(3)) : null);

/** Largeur et hauteur d'une couche, en cases. */
export const layerSize = (layer) =>
  (isInteriorLayer(layer) ? { w: INTERIOR_SIZE, h: INTERIOR_SIZE } : { w: MAP_W, h: MAP_H });

export function layerInBounds(layer, x, y) {
  const { w, h } = layerSize(layer);
  return x >= 0 && y >= 0 && x < w && y < h;
}

export const layerIndex = (layer, x, y) => y * layerSize(layer).w + x;

/** La grille d'une usine (créée à la pose de l'usine, voir world/buildings.js). */
export function interiorCells(factoryId) {
  if (!game.interiors.has(factoryId)) game.interiors.set(factoryId, new Array(INTERIOR_SIZE * INTERIOR_SIZE).fill(null));
  return game.interiors.get(factoryId);
}

/** Le mur : le bord de l'intérieur, où l'on ne bâtit pas (sauf les portes, posées d'office). */
export const isWall = (x, y) => x === 0 || y === 0 || x === INTERIOR_SIZE - 1 || y === INTERIOR_SIZE - 1;

// ---------- Les portes ----------
//
// Une porte est repérée par le côté de l'usine (`side` : RIGHT, DOWN, LEFT ou UP, vers le
// dehors) et son rang `k` sur ce côté (0 à 3, de gauche à droite ou de haut en bas).

/** Position du milieu du k-ième morceau de mur, le long d'un côté. */
const along = (k) => SPAN * k + SPAN / 2;

/** Case de la porte dans le mur intérieur. */
export function doorCell(side, k) {
  const p = along(k);
  if (side === RIGHT) return [INTERIOR_SIZE - 1, p];
  if (side === LEFT) return [0, p];
  if (side === DOWN) return [p, INTERIOR_SIZE - 1];
  return [p, 0];
}

/** Case juste derrière la porte, à l'intérieur (là où arrivent les items qui entrent). */
export function insideCell(side, k) {
  const [x, y] = doorCell(side, k);
  if (side === RIGHT) return [x - 1, y];
  if (side === LEFT) return [x + 1, y];
  if (side === DOWN) return [x, y - 1];
  return [x, y + 1];
}

/** Case du contour de l'usine (sur la carte) qui correspond à cette porte. */
export function edgeCell(factory, side, k) {
  const { x, y, w, h } = factory;
  if (side === RIGHT) return [x + w - 1, y + k];
  if (side === LEFT) return [x, y + k];
  if (side === DOWN) return [x + k, y + h - 1];
  return [x + k, y];
}

/** Case du dehors juste devant cette porte (là où sortent les items). */
export function outsideCell(factory, side, k) {
  const [x, y] = edgeCell(factory, side, k);
  if (side === RIGHT) return [x + 1, y];
  if (side === LEFT) return [x - 1, y];
  if (side === DOWN) return [x, y + 1];
  return [x, y - 1];
}

/**
 * Un item entre dans l'usine par la case (x, y) de son contour, en allant vers `dir`.
 * Retourne la porte qu'il prend ({ side, k }), ou null s'il ne vient pas du dehors
 * par ce côté.
 */
export function doorEntered(factory, x, y, dir) {
  const side = opposite(dir); // il entre par le côté opposé à son mouvement
  for (let k = 0; k < FACTORY_SIZE; k++) {
    const [ex, ey] = edgeCell(factory, side, k);
    if (ex === x && ey === y) return { side, k };
  }
  return null;
}

/** Toutes les portes d'une usine : [{ side, k }…]. */
export const ALL_DOORS = [RIGHT, DOWN, LEFT, UP].flatMap((side) => [0, 1, 2, 3].map((k) => ({ side, k })));
