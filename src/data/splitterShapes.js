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
