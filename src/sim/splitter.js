// Splitter : une entrée à l'arrière, 2 ou 3 sorties selon sa forme.
// Les items partent dans les sorties à tour de rôle (ex. gauche, tout droit, droite, gauche…).
import { BELT_SPEED } from '../config.js';
import { DIRS, cellIndex, inBounds, opposite } from '../core/grid.js';
import { game } from '../state.js';
import { SPLITTER_SHAPES, filterOutputs, priorityOrder, splitterOutputs } from '../data/splitterShapes.js';
import { mergerInputs } from '../data/mergerShapes.js';
import { inputLayer, isTunnel } from '../data/buildings.js';
import { buildingAt } from '../world/buildings.js';
import { isBuildable } from '../world/terrain.js';
import { canEnter, pushItem, reservedForSomeoneElse, reserveEntry } from './transfer.js';
import { recordFlow } from './flow.js';

/**
 * Le splitter reçoit un item par l'arrière seulement, donc en se déplaçant dans sa
 * direction. Comme un tapis, il peut garder un item au centre quand tout est plein.
 */
export function splitterAccepts(splitter, dir, from) {
  if (splitter.item || dir !== splitter.dir) return false;
  return splitter.incoming?.from === from.id || !reservedForSomeoneElse(splitter, from);
}

export function insertIntoSplitter(splitter, itemType, dir, from) {
  if (!splitterAccepts(splitter, dir, from)) return false;
  splitter.incoming = null;
  splitter.item = { type: itemType, progress: 0, enterDir: dir, outDir: null, outIndex: 0 };
  return true;
}

/**
 * Splitter prioritaire (`priority` défini) : l'item part dans la sortie n° 1 si elle a
 * de la place, sinon la n° 2, sinon la n° 3.
 *
 * Filtre (`filters` défini) : comme un splitter normal, mais seulement vers les sorties
 * qui listent cet item (sinon vers « le reste », voir filterOutputs).
 *
 * Splitter normal : l'item avance jusqu'au centre, puis part vers la prochaine sortie de la rotation
 * qui peut le recevoir (les sorties pleines ou sans rien de branché sont sautées).
 * Tant que toutes les branches coulent, l'alternance est donc stricte ; quand une
 * branche est pleine, les items continuent dans les autres. Si tout est plein,
 * l'item attend au centre du splitter.
 */
export function stepSplitter(splitter, dt) {
  const item = splitter.item;
  splitter.stalled = false;
  if (!item) return;

  const outputs = splitterOutputs(splitter.dir, splitter.shape);
  const n = outputs.length;

  if (item.outDir === null) {
    item.progress = Math.min(0.5, item.progress + dt * BELT_SPEED);
    if (item.progress < 0.5) return;

    // Ordre d'essai des sorties : par priorité (splitter prioritaire),
    // sinon à tour de rôle en partant de la prochaine.
    const tryOrder = splitter.priority
      ? priorityOrder(splitter.dir, splitter.shape, splitter.priority).map((side) => outputs.indexOf(side))
      : outputs.map((_, k) => (splitter.next + k) % n);

    const allowed = splitter.filters ? filterOutputs(splitter.dir, splitter.shape, splitter.filters, item.type) : outputs;
    let chosen = -1;
    for (const i of tryOrder) {
      if (chosen >= 0) break;
      if (!allowed.includes(outputs[i])) continue;
      if (outputScore(splitter.x, splitter.y, outputs[i], inputLayer(splitter)) < 1) continue;
      const [dx, dy] = DIRS[outputs[i]];
      if (canEnter(splitter.x + dx, splitter.y + dy, item.type, outputs[i], splitter)) chosen = i;
    }
    if (chosen < 0) {
      splitter.stalled = true;
      return;
    }
    const [dx, dy] = DIRS[outputs[chosen]];
    reserveEntry(splitter.x + dx, splitter.y + dy, splitter);
    item.outDir = outputs[chosen];
    item.outIndex = chosen;
  }

  item.progress = Math.min(1, item.progress + dt * BELT_SPEED);
  if (item.progress < 1) return;

  const [dx, dy] = DIRS[item.outDir];
  if (pushItem(splitter.x + dx, splitter.y + dy, item.type, item.outDir, splitter)) {
    splitter.item = null;
    splitter.next = (item.outIndex + 1) % n;
    recordFlow(splitter, item.type, item.outDir);
  } else {
    splitter.stalled = true;
  }
}

/**
 * Ce qu'il y a à côté de (x, y), du côté `side`, comme sortie possible :
 *   -1 bloqué (eau, arbre, bord, foreuse, tapis qui arrive vers nous)
 *    0 terrain libre
 *    1 déjà branché à quelque chose qui peut recevoir
 */
export function outputScore(x, y, side, layer = 'surface') {
  const [dx, dy] = DIRS[side];
  const nx = x + dx, ny = y + dy;
  if (!inBounds(nx, ny)) return -1;

  const neighbor = buildingAt(nx, ny, layer);
  if (neighbor) {
    // Un tunnel ne prend que par l'arrière, et seulement sur la couche d'où il reçoit
    // (l'entrée en surface, la sortie au sous-sol).
    if (isTunnel(neighbor)) return inputLayer(neighbor) === layer && neighbor.dir === side ? 1 : -1;
    if (neighbor.kind === 'belt') return neighbor.dir === opposite(side) ? -1 : 1;
    if (neighbor.kind === 'splitter') return neighbor.dir === side ? 1 : -1;
    if (neighbor.kind === 'merger') return mergerInputs(neighbor.dir, neighbor.shape).includes(opposite(side)) ? 1 : -1;
    return neighbor.kind === 'drill' ? -1 : 1;
  }
  // Au sous-sol, toute case libre peut recevoir un tapis (même sous l'eau).
  return layer === 'under' || isBuildable(game.map, cellIndex(nx, ny)) ? 0 : -1;
}

/**
 * Formes de splitter qui rentrent en (x, y) avec un flux vers `dir`, de la meilleure à la pire.
 * Les formes qui réutilisent des tapis déjà là passent en premier ; à égalité,
 * la forme préférée du joueur passe devant.
 */
export function splitterOptions(x, y, dir, preferredShape, layer = 'surface') {
  const options = [];
  for (const shape of SPLITTER_SHAPES) {
    const scores = shape.outputs(dir).map((side) => outputScore(x, y, side, layer));
    if (scores.every((s) => s >= 0)) {
      options.push({ id: shape.id, name: shape.name, score: scores.reduce((a, b) => a + b, 0) });
    }
  }
  options.sort((a, b) => b.score - a.score);

  const preferred = options.findIndex((o) => o.id === preferredShape);
  if (preferred > 0 && options[preferred].score === options[0].score) {
    options.unshift(options.splice(preferred, 1)[0]);
  }
  return options;
}
