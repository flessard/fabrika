// Splitter : une entrée à l'arrière, 2 ou 3 sorties selon sa forme.
// Les items partent dans les sorties à tour de rôle (ex. gauche, tout droit, droite, gauche…).
import { BELT_SPEED, SPLITTER_JAM_TIMEOUT } from '../config.js';
import { DIRS, cellIndex, inBounds, opposite } from '../core/grid.js';
import { game } from '../state.js';
import { SPLITTER_SHAPES, splitterOutputs } from '../data/splitterShapes.js';
import { buildingAt } from '../world/buildings.js';
import { isBuildable } from '../world/terrain.js';
import { pushItem } from './transfer.js';

/** L'item doit arriver par l'arrière, donc en se déplaçant dans la direction du splitter. */
export function insertIntoSplitter(splitter, itemType, dir) {
  if (splitter.item || dir !== splitter.dir) return false;
  splitter.item = { type: itemType, progress: 0, enterDir: dir, outDir: null, outIndex: 0, wait: 0 };
  return true;
}

export function stepSplitter(splitter, dt) {
  const item = splitter.item;
  if (!item) return;
  item.progress = Math.min(1, item.progress + dt * BELT_SPEED);

  const outputs = splitterOutputs(splitter.dir, splitter.shape);
  const n = outputs.length;

  // Au centre, l'item choisit sa sortie : la prochaine dans la rotation,
  // en sautant celles où rien n'est branché.
  if (item.progress >= 0.5 && item.outDir === null) {
    let index = splitter.next % n;
    for (let k = 0; k < n && outputScore(splitter.x, splitter.y, outputs[index]) < 1; k++) index = (index + 1) % n;
    item.outDir = outputs[index];
    item.outIndex = index;
    item.wait = 0;
  }
  if (item.progress < 1) return;

  const [dx, dy] = DIRS[item.outDir];
  if (pushItem(splitter.x + dx, splitter.y + dy, item.type, item.outDir)) {
    splitter.item = null;
    splitter.next = (item.outIndex + 1) % n;
  } else if ((item.wait += dt) > SPLITTER_JAM_TIMEOUT) {
    // Sortie bloquée trop longtemps : l'item revient au centre et passe à la suivante.
    splitter.next = (item.outIndex + 1) % n;
    item.outDir = null;
    item.progress = 0.5;
  }
}

/**
 * Ce qu'il y a à côté de (x, y), du côté `side`, comme sortie possible :
 *   -1 bloqué (eau, arbre, bord, foreuse, tapis qui arrive vers nous)
 *    0 terrain libre
 *    1 déjà branché à quelque chose qui peut recevoir
 */
export function outputScore(x, y, side) {
  const [dx, dy] = DIRS[side];
  const nx = x + dx, ny = y + dy;
  if (!inBounds(nx, ny)) return -1;

  const neighbor = buildingAt(nx, ny);
  if (neighbor) {
    if (neighbor.kind === 'belt') return neighbor.dir === opposite(side) ? -1 : 1;
    if (neighbor.kind === 'splitter') return neighbor.dir === side ? 1 : -1;
    return neighbor.kind === 'drill' ? -1 : 1;
  }
  return isBuildable(game.map, cellIndex(nx, ny)) ? 0 : -1;
}

/**
 * Formes de splitter qui rentrent en (x, y) avec un flux vers `dir`, de la meilleure à la pire.
 * Les formes qui réutilisent des tapis déjà là passent en premier ; à égalité,
 * la forme préférée du joueur passe devant.
 */
export function splitterOptions(x, y, dir, preferredShape) {
  const options = [];
  for (const shape of SPLITTER_SHAPES) {
    const scores = shape.outputs(dir).map((side) => outputScore(x, y, side));
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
