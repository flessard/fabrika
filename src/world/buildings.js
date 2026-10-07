// Poser, retrouver et enlever des bâtiments sur la grille.
import { BUILDINGS } from '../data/buildings.js';
import { DOWN, LEFT, RIGHT, cellIndex, inBounds } from '../core/grid.js';
import { TILE } from '../config.js';
import { game } from '../state.js';
import { ORE_ITEM, isBuildable } from './terrain.js';
import { spawnPuff } from '../sim/particles.js';

/** Bâtiment qui occupe la case (x, y), ou null. */
export const buildingAt = (x, y) => (inBounds(x, y) ? game.grid[cellIndex(x, y)] : null);

/** Toutes les cases couvertes par un bâtiment de taille w × h posé en (x, y). */
function* footprint(x, y, w, h) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) yield [x + i, y + j];
}

/** Coin haut-gauche d'un bâtiment centré sous le curseur (utile pour les machines 2 × 2). */
export function anchorFor(type, cell) {
  const { w, h } = BUILDINGS[type];
  return { x: cell.x - Math.floor((w - 1) / 2), y: cell.y - Math.floor((h - 1) / 2) };
}

/** Vrai si un bâtiment de ce type peut être posé avec son coin haut-gauche en (x, y). */
export function canPlace(type, x, y) {
  const { w, h, kind } = BUILDINGS[type];
  let onOre = false;
  for (const [cx, cy] of footprint(x, y, w, h)) {
    if (!inBounds(cx, cy)) return false;
    const i = cellIndex(cx, cy);
    if (!isBuildable(game.map, i) || game.grid[i]) return false;
    if (game.map.ore[i]) onOre = true;
  }
  // Une foreuse doit toucher au moins une case de gisement.
  return kind === 'drill' ? onOre : true;
}

/** Type de minerai le plus présent sous une zone. */
function majorityOre(x, y, w, h) {
  const counts = {};
  for (const [cx, cy] of footprint(x, y, w, h)) {
    const ore = game.map.ore[cellIndex(cx, cy)];
    if (ore) counts[ore] = (counts[ore] ?? 0) + 1;
  }
  const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  return ORE_ITEM[best];
}

/** Crée l'objet bâtiment avec les champs propres à sa famille. */
function createBuilding(type, x, y, dir) {
  const def = BUILDINGS[type];
  const b = { type, kind: def.kind, x, y, w: def.w, h: def.h, dir };
  b.flow = [];              // items sortis récemment (voir sim/flow.js)
  b.placedAt = game.tick;
  switch (def.kind) {
    case 'belt':
      b.item = null;          // item transporté : { type, progress, enterDir }
      b.lastInput = -1;       // direction du dernier item accepté (jonctions)
      b.requests = [-9, -9, -9, -9]; // dernier tick où chaque côté a voulu entrer
      break;
    case 'merger':
      b.item = null;
      b.shape = 'T';
      b.next = 0;             // index de l'entrée dont c'est le tour
      b.requests = [-9, -9, -9, -9]; // dernier tick où chaque côté a voulu entrer
      break;
    case 'splitter':
      b.item = null;          // { type, progress, enterDir, outDir, outIndex }
      b.shape = 'T';
      b.priority = def.priority ? ['F', 'L', 'R'] : null; // ordre des sorties (prioritaire)
      b.next = 0;             // index de la prochaine sortie dans la rotation
      break;
    case 'drill':
      b.ore = majorityOre(x, y, def.w, def.h);
      b.outputs = [];
      b.progress = 0;
      b.working = false;
      b.anim = 0;
      break;
    case 'crafter':
      b.inputs = [];
      b.outputs = [];
      b.current = null;       // item en fabrication
      b.currentInput = null;  // item reçu qui est en train d'être transformé
      b.progress = 0;
      b.working = false;
      b.anim = 0;
      break;
    case 'hub':
      b.flash = 0;
      b.anim = 0;
      break;
  }
  return b;
}

/** Pose un bâtiment (sans vérifier la place : appeler canPlace avant). */
export function placeBuilding(type, x, y, dir = RIGHT, props = {}) {
  const b = Object.assign(createBuilding(type, x, y, dir), props);
  game.buildings.push(b);
  for (const [cx, cy] of footprint(x, y, b.w, b.h)) game.grid[cellIndex(cx, cy)] = b;
  return b;
}

/** Enlève un bâtiment. Le dépôt ne peut pas être enlevé. */
export function removeBuilding(b) {
  if (!b || b.kind === 'hub') return;
  game.buildings.splice(game.buildings.indexOf(b), 1);
  for (const [cx, cy] of footprint(b.x, b.y, b.w, b.h)) game.grid[cellIndex(cx, cy)] = null;
  spawnPuff((b.x + b.w / 2) * TILE, (b.y + b.h / 2) * TILE, 6);
}

/**
 * Case juste devant la sortie d'une machine. La sortie est sur le côté qui fait face
 * à `dir`, décalée d'une façon qui reste cohérente quand on tourne la machine.
 */
export function outputCell(b) {
  const { x, y, w, h, dir } = b;
  if (dir === RIGHT) return [x + w, y + h - 1];
  if (dir === DOWN) return [x, y + h];
  if (dir === LEFT) return [x - 1, y];
  return [x + w - 1, y - 1];
}
