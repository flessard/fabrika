// Groupeur : 2 ou 3 entrées, une seule sortie devant. L'inverse du splitter.
// Les entrées passent chacune leur tour (gauche, arrière, droite, gauche…) ;
// une entrée qui n'a rien à donner est sautée.
//
// Une fois l'item entré, il avance comme sur un tapis (voir stepBelt).
import { DIRS, cellIndex, inBounds, opposite } from '../core/grid.js';
import { game } from '../state.js';
import { MERGER_SHAPES, mergerInputs } from '../data/mergerShapes.js';
import { buildingAt } from '../world/buildings.js';
import { isBuildable } from '../world/terrain.js';
import { feedsInto } from './belt.js';
import { reservedForSomeoneElse } from './transfer.js';
import { outputScore } from './splitter.js';

/** Le groupeur peut-il recevoir un item qui arrive en allant vers `dir`, envoyé par `from` ? */
export function mergerAccepts(merger, dir, from) {
  const side = opposite(dir); // le côté d'où vient l'item
  const inputs = mergerInputs(merger.dir, merger.shape);
  if (!inputs.includes(side)) return false;

  merger.requests[side] = game.tick; // « j'attends » : sert au tour de rôle
  if (merger.item) return false;
  if (merger.incoming?.from === from.id) return true;
  if (reservedForSomeoneElse(merger, from)) return false;

  // L'entrée dont c'est le tour passe en priorité si elle attend ; sinon on la saute.
  const turn = inputs[merger.next % inputs.length];
  const turnIsWaiting = merger.requests[turn] >= game.tick - 1;
  return side === turn || !turnIsWaiting;
}

export function insertIntoMerger(merger, itemType, dir, from) {
  if (!mergerAccepts(merger, dir, from)) return false;
  const inputs = mergerInputs(merger.dir, merger.shape);
  merger.next = (inputs.indexOf(opposite(dir)) + 1) % inputs.length;
  merger.incoming = null;
  merger.item = { type: itemType, progress: 0, enterDir: dir, committed: false };
  return true;
}

/**
 * Formes de groupeur qui conviennent en (x, y) avec une sortie vers `dir`, de la
 * meilleure à la pire. On préfère les formes qui récupèrent tous les tapis (ou
 * machines) qui arrivent vers cette case, avec le moins d'entrées inutiles.
 * Une forme n'est possible que si la sortie n'est pas bloquée.
 */
export function mergerOptions(x, y, dir, preferredShape, layer = 'surface') {
  if (outputScore(x, y, dir, layer) < 0) return [];

  const feederSides = [0, 1, 2, 3].filter((side) => {
    if (side === dir) return false;
    const [dx, dy] = DIRS[side];
    const neighbor = buildingAt(x + dx, y + dy, layer);
    return neighbor && feedsInto(neighbor, x, y, opposite(side), layer);
  });

  const options = MERGER_SHAPES.map((shape) => {
    const inputs = shape.inputs(dir);
    const covered = feederSides.filter((s) => inputs.includes(s)).length;
    const missed = feederSides.length - covered;
    const unused = inputs.filter((s) => !feederSides.includes(s) && !openGround(x, y, s, layer)).length;
    return { id: shape.id, name: shape.name, inputs: inputs.length, score: covered * 10 - missed * 10 - unused - inputs.length * 0.1 };
  });
  options.sort((a, b) => b.score - a.score);

  const preferred = options.findIndex((o) => o.id === preferredShape);
  if (preferred > 0 && options[preferred].score === options[0].score) options.unshift(options.splice(preferred, 1)[0]);
  return options;
}

/** Case libre où l'on pourrait encore brancher quelque chose plus tard (au sous-sol, même sous l'eau). */
function openGround(x, y, side, layer) {
  const [dx, dy] = DIRS[side];
  const nx = x + dx, ny = y + dy;
  return inBounds(nx, ny) && !buildingAt(nx, ny, layer) && (layer === 'under' || isBuildable(game.map, cellIndex(nx, ny)));
}
