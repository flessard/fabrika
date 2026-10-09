// Poser, retrouver et enlever des bâtiments sur la grille.
import { BUILDINGS, layersOf, layersOfBuilding } from '../data/buildings.js';
import { emptyFilters } from '../data/splitterShapes.js';
import { buildingName, t } from '../i18n/index.js';
import { revealAround } from './fog.js';
import { DOWN, LEFT, RIGHT, cellIndex, inBounds } from '../core/grid.js';
import { TILE } from '../config.js';
import { game } from '../state.js';
import { ORE_ITEM, terrainProblem } from './terrain.js';
import { spawnPuff } from '../sim/particles.js';
import {
  ALL_DOORS, doorCell, factoryIdOf, interiorCells, interiorLayer, isInteriorLayer, isWall, layerInBounds, layerIndex,
} from './interiors.js';

/** La grille d'une couche : la carte, le sous-sol, ou l'intérieur d'une usine (« in:<id> »). */
const gridOf = (layer) => {
  if (layer === 'under') return game.under;
  if (isInteriorLayer(layer)) return interiorCells(factoryIdOf(layer));
  return game.grid;
};

/** Bâtiment qui occupe la case (x, y) sur la couche donnée (surface, sous-sol ou intérieur), ou null. */
export const buildingAt = (x, y, layer = 'surface') =>
  (layerInBounds(layer, x, y) ? gridOf(layer)[layerIndex(layer, x, y)] ?? null : null);

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
 * `layer` : l'intérieur d'une usine où on le pose (« in:<id> »), sinon les couches de son type.
 */
export function placementProblem(type, x, y, ignore = null, layer = null) {
  if (isInteriorLayer(layer)) return interiorProblem(type, x, y, ignore, layer);
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

/**
 * Dans une usine : pas de terrain ni de brouillard, mais un mur tout autour (où sont les
 * portes), et seulement des bâtiments de transformation (voir TOOLS, inside).
 */
function interiorProblem(type, x, y, ignore, layer) {
  const { w, h, kind } = BUILDINGS[type];
  if (kind === 'drill' || kind === 'factory' || kind === 'hub' || BUILDINGS[type].base || BUILDINGS[type].tunnel) {
    return t('problem.notInside', { name: buildingName(type) });
  }
  const grid = gridOf(layer);
  for (const [cx, cy] of footprint(x, y, w, h)) {
    if (!layerInBounds(layer, cx, cy) || isWall(cx, cy)) return t('problem.wall');
    const other = grid[layerIndex(layer, cx, cy)];
    if (other && !ignore?.has(other)) return t('problem.taken', { name: buildingName(other.type) });
  }
  return null;
}

/** Vrai si un bâtiment de ce type peut être posé avec son coin haut-gauche en (x, y). */
export const canPlace = (type, x, y, ignore = null, layer = null) => placementProblem(type, x, y, ignore, layer) === null;

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
      b.enabled = true;       // en marche (la touche O ou sa fiche l'arrêtent)
      b.ore = majorityOre(x, y, def.w, def.h);
      b.dug = 0;              // minerais extraits (un résidu tous les `residue.every`)
      b.outputs = [];
      b.progress = 0;
      b.working = false;
      b.anim = 0;
      break;
    case 'crafter':
      b.enabled = true;
      b.recipes = [...(def.defaultRecipes ?? [])]; // recettes actives (choisies dans sa fiche)
      b.currentCount = 1;     // combien d'items donne la recette en cours
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
    case 'dump':
      b.destroyed = 0;        // items jetés depuis la pose
      b.stored = 0;           // débris accumulés depuis la dernière vidange (voir capacity)
      b.flash = 0;
      break;
    case 'storage':
      b.slots = Array(def.slots).fill(null); // chaque emplacement : { item, count } ou null
      b.outputOpen = false;                   // fermé : il garde tout ; ouvert : il ressort par l'avant
      break;
  }
  return b;
}

/**
 * Pose un bâtiment (sans vérifier la place : appeler canPlace avant). Une usine est posée
 * avec son intérieur vide et ses 16 portes.
 */
export function placeBuilding(type, x, y, dir = RIGHT, props = {}) {
  const b = occupy(Object.assign(createBuilding(type, x, y, dir), props));
  if (b.kind === 'factory') {
    for (const { side, k } of ALL_DOORS) {
      const [dx, dy] = doorCell(side, k);
      occupy(Object.assign(createBuilding('door', dx, dy, side), { layer: interiorLayer(b), factory: b.id, side, k }));
    }
  }
  return b;
}

function occupy(b) {
  game.buildings.push(b);
  game.byId.set(b.id, b);
  if (b.kind === 'factory') interiorCells(b.id); // sa grille intérieure existe dès la pose
  if (!b.layer) revealAround(b); // chaque bâtiment éclaire autour de lui (pas ceux des usines)
  for (const layer of layersOfBuilding(b)) {
    for (const [cx, cy] of footprint(b.x, b.y, b.w, b.h)) gridOf(layer)[layerIndex(layer, cx, cy)] = b;
  }
  return b;
}

/** Retire un bâtiment de la carte sans le détruire (pour le déplacer). */
export function liftBuilding(b) {
  game.buildings.splice(game.buildings.indexOf(b), 1);
  game.byId.delete(b.id);
  for (const layer of layersOfBuilding(b)) {
    for (const [cx, cy] of footprint(b.x, b.y, b.w, b.h)) gridOf(layer)[layerIndex(layer, cx, cy)] = null;
  }
}

/** Les bâtiments posés dans une usine (portes comprises). */
export const buildingsInside = (factory) => game.buildings.filter((b) => b.layer === interiorLayer(factory));

/**
 * Vide un bâtiment : plus d'item, de stock ni de fabrication en cours, comme s'il
 * venait d'être posé. Il garde sa place, sa direction, sa forme, ses priorités et ses filtres.
 */
export function emptyBuilding(b) {
  const keep = { shape: b.shape, priority: b.priority, filters: b.filters, outputOpen: b.outputOpen, enabled: b.enabled, recipes: b.recipes };
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

/**
 * Enlève un bâtiment. Le dépôt et les portes ne peuvent pas être enlevés. Une usine part
 * avec ses portes et son intérieur (il doit être vide : voir sim/commands.js).
 */
export function removeBuilding(b) {
  if (!b || b.kind === 'hub' || b.kind === 'door') return;
  liftBuilding(b);
  if (b.kind === 'factory') {
    for (const inside of buildingsInside(b)) liftBuilding(inside);
    game.interiors.delete(b.id);
  }
  if (!b.layer) spawnPuff((b.x + b.w / 2) * TILE, (b.y + b.h / 2) * TILE, 6);
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
