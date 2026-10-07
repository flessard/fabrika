// Mode « stress » (?stress dans l'adresse) : remplit la carte de boucles de tapis
// pleines d'items qui tournent sans fin, pour mesurer la vitesse du rendu.
import { MAP_H, MAP_W } from '../config.js';
import { DOWN, LEFT, RIGHT, UP } from '../core/grid.js';
import { game } from '../state.js';
import { canPlace, placeBuilding } from './buildings.js';
import { DECO, GROUND } from './terrain.js';

const LOOP_W = 6, LOOP_H = 4, GAP = 1;

/** Cases d'une boucle dans le sens horaire, avec la direction de chaque tapis. */
function loopCells(x0, y0) {
  const x1 = x0 + LOOP_W - 1, y1 = y0 + LOOP_H - 1;
  const cells = [];
  for (let x = x0; x < x1; x++) cells.push([x, y0, RIGHT]);
  for (let y = y0; y < y1; y++) cells.push([x1, y, DOWN]);
  for (let x = x1; x > x0; x--) cells.push([x, y1, LEFT]);
  for (let y = y1; y > y0; y--) cells.push([x0, y, UP]);
  return cells;
}

/**
 * Aplanit la carte (plus d'eau ni d'arbres) puis pose une boucle partout où elle
 * rentre en entier. À appeler avant de fabriquer l'image du terrain.
 * Retourne le nombre de tapis posés.
 */
export function fillWithBeltLoops() {
  const { ground, deco } = game.map;
  for (let i = 0; i < ground.length; i++) {
    if (ground[i] >= GROUND.WATER) ground[i] = GROUND.GRASS;
    deco[i] = DECO.NONE;
  }

  let count = 0;
  for (let y0 = 1; y0 + LOOP_H < MAP_H; y0 += LOOP_H + GAP) {
    for (let x0 = 1; x0 + LOOP_W < MAP_W; x0 += LOOP_W + GAP) {
      const cells = loopCells(x0, y0);
      if (!cells.every(([x, y]) => canPlace('belt', x, y))) continue;
      cells.forEach(([x, y, dir], i) => {
        const belt = placeBuilding('belt', x, y, dir);
        if (i % 2 === 0) belt.item = { type: i % 4 ? 'cu_ore' : 'fe_plate', progress: 0, enterDir: dir };
      });
      count += cells.length;
    }
  }
  return count;
}
