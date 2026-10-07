// Formes du splitter. L'entrée est toujours à l'arrière : l'item arrive dans la
// direction du splitter. La forme choisit les sorties parmi gauche, tout droit et droite.
import { turnLeft, turnRight } from '../core/grid.js';

export const SPLITTER_SHAPES = [
  { id: 'T',  name: 'T',        outputs: (dir) => [turnLeft(dir), turnRight(dir)] },
  { id: 'YR', name: 'Y droite', outputs: (dir) => [dir, turnRight(dir)] },
  { id: 'YL', name: 'Y gauche', outputs: (dir) => [dir, turnLeft(dir)] },
  { id: '+',  name: 'Croix',    outputs: (dir) => [turnLeft(dir), dir, turnRight(dir)] },
];

export const shapeById = (id) => SPLITTER_SHAPES.find((s) => s.id === id) ?? SPLITTER_SHAPES[0];

/** Directions de sortie d'un splitter, dans l'ordre où il les alterne. */
export const splitterOutputs = (dir, shapeId) => shapeById(shapeId).outputs(dir);

export function nextShapeId(id) {
  const i = SPLITTER_SHAPES.findIndex((s) => s.id === id);
  return SPLITTER_SHAPES[(i + 1) % SPLITTER_SHAPES.length].id;
}

// ---------- Splitter prioritaire ----------
//
// Ses priorités sont gardées par rapport au sens du flux : 'F' tout droit, 'L' gauche,
// 'R' droite. Elles restent donc justes quand on tourne le splitter ou change sa forme.

const RELATIVE = { F: (dir) => dir, L: turnLeft, R: turnRight };
export const DEFAULT_PRIORITY = ['F', 'L', 'R'];

/** Sorties du splitter rangées de la plus prioritaire à la moins prioritaire. */
export function priorityOrder(dir, shapeId, priority) {
  const outputs = splitterOutputs(dir, shapeId);
  return priority.map((rel) => RELATIVE[rel](dir)).filter((side) => outputs.includes(side));
}

/** Fait monter d'un rang la sortie `side` (parmi les sorties de la forme actuelle). */
export function raisePriority(priority, dir, shapeId, side) {
  const order = priorityOrder(dir, shapeId, priority);
  const rank = order.indexOf(side);
  if (rank <= 0) return priority;
  const rel = (s) => Object.keys(RELATIVE).find((r) => RELATIVE[r](dir) === s);
  const a = priority.indexOf(rel(order[rank])), b = priority.indexOf(rel(order[rank - 1]));
  const next = [...priority];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/** Tourne les priorités : la sortie n° 1 passe en dernier (touche P). */
export function rotatePriority(priority, dir, shapeId) {
  const order = priorityOrder(dir, shapeId, priority);
  if (order.length < 2) return priority;
  let next = priority;
  for (let i = 1; i < order.length; i++) next = raisePriority(next, dir, shapeId, order[i]);
  return next;
}
