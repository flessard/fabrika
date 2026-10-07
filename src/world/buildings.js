// Poser, retrouver et enlever des bâtiments sur la grille.
import { BUILDINGS, layersOf } from '../data/buildings.js';
import { emptyFilters } from '../data/splitterShapes.js';
import { buildingName, t } from '../i18n/index.js';
import { revealAround } from './fog.js';
import { DOWN, LEFT, RIGHT, cellIndex, inBounds } from '../core/grid.js';
import { TILE } from '../config.js';
import { game } from '../state.js';
import { ORE_ITEM, terrainProblem } from './terrain.js';
import { spawnPuff } from '../sim/particles.js';

const gridOf = (layer) => (layer === 'under' ? game.under : game.grid);

/** Bâtiment qui occupe la case (x, y) sur la couche donnée (surface ou sous-sol), ou null. */
export const buildingAt = (x, y, layer = 'surface') => (inBounds(x, y) ? gridOf(layer)[cellIndex(x, y)] : null);

/** Toutes les cases couvertes par un bâtiment de taille w × h posé en (x, y). */
function* footprint(x, y, w, h) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) yield [x + i, y + j];
}

/** Coin haut-gauche d'un bâtiment centré sous le curseur (utile pour les machines 2 × 2). */
export function anchorFor(type, cell) {
  const { w, h } = BUILDINGS[type];
  return { x: cell.x - Math.floor((w - 1) / 2), y: cell.y - Math.floor((h - 1) / 2) };
}

/**
 * Pourquoi un bâtiment de ce type ne peut pas être posé avec son coin haut-gauche
 * en (x, y) : un court texte à montrer au joueur (« eau », « arbre »,
 * « déjà occupé (Four) »…), ou null si rien ne l'empêche. `ignore` : bâtiments qui ne
 * comptent pas comme des obstacles (ceux qu'on déplace, le tapis qu'un splitter remplace).
 * Chaque couche qu'il occupe doit être libre. Le sous-sol passe sous tout, même l'eau.
 */
export function placementProblem(type, x, y, ignore = null) {
  const { w, h, kind } = BUILDINGS[type];
  const layers = layersOf(type);
  let onOre = false;
  for (const [cx, cy] of footprint(x, y, w, h)) {
    if (!inBounds(cx, cy)) return t('problem.offMap');
    const i = cellIndex(cx, cy);
    if (!game.explored[i]) return t('problem.fog');
    for (const layer of layers) {
      const other = gridOf(layer)[i];
      if (other && !ignore?.has(other)) return t(layer === 'under' ? 'problem.takenUnder' : 'problem.taken', { name: buildingName(other.type) });
    }
    const terrain = layers.includes('surface') && terrainProblem(game.map, i);
    if (terrain) return terrain;
    if (game.map.ore[i]) onOre = true;
  }
  // Une foreuse doit toucher au moins une case de gisement.
  if (kind === 'drill' && !onOre) return t('problem.noOre');
  return null;
}

/** Vrai si un bâtiment de ce type peut être posé avec son coin haut-gauche en (x, y). */
export const canPlace = (type, x, y, ignore = null) => placementProblem(type, x, y, ignore) === null;

/** Le bâtiment qui a cet identifiant, s'il est toujours sur la carte. */
export const buildingById = (id) => game.byId.get(id) ?? null;

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
function createBuilding(type, x, y, dir, id = game.nextId++) {
  const def = BUILDINGS[type];
  const b = { id, type, kind: def.kind, x, y, w: def.w, h: def.h, dir };
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
      b.filters = def.filter ? emptyFilters() : null;     // items de chaque sortie (filtre)
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
    case 'storage':
      b.slots = Array(def.slots).fill(null); // chaque emplacement : { item, count } ou null
      b.outputOpen = false;                   // fermé : il garde tout ; ouvert : il ressort par l'avant
      break;
  }
  return b;
}

/** Pose un bâtiment (sans vérifier la place : appeler canPlace avant). */
export function placeBuilding(type, x, y, dir = RIGHT, props = {}) {
  return occupy(Object.assign(createBuilding(type, x, y, dir), props));
}

function occupy(b) {
  game.buildings.push(b);
  game.byId.set(b.id, b);
  revealAround(b); // chaque bâtiment éclaire autour de lui
  for (const layer of layersOf(b.type)) {
    for (const [cx, cy] of footprint(b.x, b.y, b.w, b.h)) gridOf(layer)[cellIndex(cx, cy)] = b;
  }
  return b;
}

/** Retire un bâtiment de la carte sans le détruire (pour le déplacer). */
export function liftBuilding(b) {
  game.buildings.splice(game.buildings.indexOf(b), 1);
  game.byId.delete(b.id);
  for (const layer of layersOf(b.type)) {
    for (const [cx, cy] of footprint(b.x, b.y, b.w, b.h)) gridOf(layer)[cellIndex(cx, cy)] = null;
  }
}

/**
 * Vide un bâtiment : plus d'item, de stock ni de fabrication en cours, comme s'il
 * venait d'être posé. Il garde sa place, sa direction, sa forme, ses priorités et ses filtres.
 */
export function emptyBuilding(b) {
  const keep = { shape: b.shape, priority: b.priority, filters: b.filters, outputOpen: b.outputOpen };
  Object.assign(b, createBuilding(b.type, b.x, b.y, b.dir, b.id));
  for (const [name, value] of Object.entries(keep)) if (value !== undefined) b[name] = value;
  b.stalled = false;
}

/** Remet sur la carte un bâtiment retiré par liftBuilding, à sa position (x, y) actuelle. */
export function putBackBuilding(b) {
  if (b.kind === 'drill') b.ore = majorityOre(b.x, b.y, b.w, b.h);
  return occupy(b);
}

/** Remet sur la carte un bâtiment lu dans une sauvegarde, tel quel (voir world/save.js). */
export const restoreBuilding = (saved) => occupy(saved);

/** Enlève un bâtiment. Le dépôt ne peut pas être enlevé. */
export function removeBuilding(b) {
  if (!b || b.kind === 'hub') return;
  liftBuilding(b);
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
