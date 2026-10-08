// Réglage automatique d'un filtre qu'on pose (surtout par-dessus un tapis existant).
//
// 1. Ce qui arrive : les items vus récemment sur le tapis remplacé et sur la ligne en
//    amont (tapis, groupeurs…), jusqu'aux machines qui les produisent.
// 2. Où mène chaque sortie : on suit les tapis depuis la sortie jusqu'à la première
//    machine qui reçoit (four, presse, assembleur, dépôt, décharge), en passant par les
//    portes des usines.
// 3. Chaque item qui arrive est listé sur les sorties dont la destination en veut
//    (une recette active, la commande du dépôt, un résidu pour la décharge).
//    Une sortie sans destination précise garde une liste vide : elle prend « le reste ».
//
// Sans rien de branché, le filtre reste vide (tout passe, comme un splitter).
// Le calcul est fait au moment de poser, et voyage avec la commande : chez tous les
// joueurs, le filtre est posé avec les mêmes réglages.
import { DIRS, opposite } from '../core/grid.js';
import { ITEMS } from '../data/items.js';
import { emptyFilters, relativeSide, splitterOutputs } from '../data/splitterShapes.js';
import { activeRecipes } from '../data/recipes.js';
import { inputLayer, outputLayer } from '../data/buildings.js';
import { buildingAt, buildingById } from '../world/buildings.js';
import { doorEntered, insideCell, interiorLayer, outsideCell } from '../world/interiors.js';
import { feederSides } from './belt.js';
import { hubWants } from './machines.js';
import { recipeUsing } from '../data/recipes.js';

const MAX_STEPS = 80;

/**
 * Réglages d'un filtre posé en (x, y) sur la couche `layer`, avec un flux vers `dir` et
 * la forme `shape` : { F: [...], L: [...], R: [...] } (côtés relatifs au flux).
 */
export function autoFilters(x, y, dir, shape, layer = 'surface') {
  const filters = emptyFilters();
  const incoming = itemsArriving(x, y, dir, layer);
  if (!incoming.size) return filters;

  for (const side of splitterOutputs(dir, shape)) {
    const [dx, dy] = DIRS[side];
    const dest = destination(x + dx, y + dy, side, layer);
    if (!dest) continue;
    const wanted = [...incoming].filter((item) => wants(dest, item));
    if (wanted.length) filters[relativeSide(dir, side)] = wanted;
  }
  return filters;
}

// ---------- Ce qui arrive ----------

/** Items qui passent (ou passeront) par la case du filtre. */
function itemsArriving(x, y, dir, layer) {
  const items = new Set();
  const seen = new Set();
  const queue = [];

  // Le tapis qu'on remplace : ce qu'il porte et ce qu'il a transporté récemment.
  const under = buildingAt(x, y, layer);
  if (under) queue.push(under);
  else {
    // Posé sur une case vide : ce qui arrive par l'arrière.
    const [dx, dy] = DIRS[opposite(dir)];
    const behind = buildingAt(x + dx, y + dy, layer);
    if (behind) queue.push(behind);
  }

  while (queue.length && seen.size < MAX_STEPS) {
    const b = queue.shift();
    if (seen.has(b)) continue;
    seen.add(b);
    for (const item of producedBy(b)) items.add(item);
    // On remonte la ligne : les tapis, groupeurs et splitters qui alimentent celui-ci.
    if (b.kind === 'belt' || b.kind === 'merger' || b.kind === 'splitter') {
      const from = inputLayer(b);
      for (const side of feederSides(b)) {
        const [dx, dy] = DIRS[side];
        const feeder = buildingAt(b.x + dx, b.y + dy, from);
        if (feeder) queue.push(feeder);
      }
    }
  }
  // Un résidu ou un objet de construction peut passer ; tout compte.
  return items;
}

/** Ce qu'un bâtiment fait passer ou fabrique. */
function producedBy(b) {
  const items = new Set();
  if (b.item) items.add(b.item.type);
  for (const entry of b.flow ?? []) items.add(entry.itemType);
  if (b.kind === 'drill') {
    if (b.ore) items.add(b.ore);
    items.add('rubble'); // une foreuse donne aussi des résidus
  }
  if (b.kind === 'crafter') for (const { recipe } of activeRecipes(b)) items.add(recipe.out);
  if (b.kind === 'storage') for (const slot of b.slots) if (slot) items.add(slot.item);
  return [...items].filter((item) => ITEMS[item]);
}

// ---------- Où mène une sortie ----------

/**
 * La machine où finissent les items qui entrent en (x, y) en allant vers `dir`, en
 * suivant les tapis (et les portes d'usine). Null si la ligne finit dans le vide,
 * ou passe par un splitter (on ne sait plus où va chaque item).
 */
function destination(x, y, dir, layer) {
  for (let step = 0; step < MAX_STEPS; step++) {
    const b = buildingAt(x, y, layer);
    if (!b) return null;
    if (b.kind === 'belt' || b.kind === 'merger') {
      layer = outputLayer(b);
      dir = b.dir;
      x = b.x + DIRS[dir][0];
      y = b.y + DIRS[dir][1];
      continue;
    }
    if (b.kind === 'factory') {
      const door = doorEntered(b, x, y, dir);
      if (!door) return null;
      [x, y] = insideCell(door.side, door.k);
      layer = interiorLayer(b);
      continue;
    }
    if (b.kind === 'door') {
      const factory = buildingById(b.factory);
      if (!factory || dir !== b.side) return null;
      [x, y] = outsideCell(factory, b.side, b.k);
      layer = outputLayer(factory);
      continue;
    }
    if (b.kind === 'splitter') return null;
    return b;
  }
  return null;
}

/** La destination veut-elle précisément cet item ? (Un conteneur prend tout : pas de préférence.) */
function wants(dest, item) {
  switch (dest.kind) {
    case 'crafter': return !!recipeUsing(dest, item);
    case 'hub': return hubWants(item);
    case 'dump': return !!ITEMS[item]?.waste;
    default: return false;
  }
}
