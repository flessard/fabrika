// Formes du groupeur (l'inverse du splitter). La sortie est toujours devant :
// l'item repart dans la direction du groupeur. La forme choisit les entrées
// parmi gauche, arrière et droite.
import { opposite, turnLeft, turnRight } from '../core/grid.js';

export const MERGER_SHAPES = [
  { id: 'T',  inputs: (dir) => [turnLeft(dir), turnRight(dir)] },
  { id: 'YR', inputs: (dir) => [opposite(dir), turnRight(dir)] },
  { id: 'YL', inputs: (dir) => [opposite(dir), turnLeft(dir)] },
  { id: '+',  inputs: (dir) => [turnLeft(dir), opposite(dir), turnRight(dir)] },
];

export const mergerShapeById = (id) => MERGER_SHAPES.find((s) => s.id === id) ?? MERGER_SHAPES[0];

/** Côtés d'où le groupeur reçoit des items, dans l'ordre où il les fait passer. */
export const mergerInputs = (dir, shapeId) => mergerShapeById(shapeId).inputs(dir);

export function nextMergerShapeId(id) {
  const i = MERGER_SHAPES.findIndex((s) => s.id === id);
  return MERGER_SHAPES[(i + 1) % MERGER_SHAPES.length].id;
}
