// Faire passer un item d'une case à la suivante.
// C'est le bâtiment qui reçoit qui décide s'il l'accepte.
import { buildingAt } from '../world/buildings.js';
import { insertIntoBelt } from './belt.js';
import { insertIntoSplitter } from './splitter.js';
import { insertIntoMachine } from './machines.js';

/**
 * Essaie de pousser un item dans la case (x, y).
 * `dir` est la direction du mouvement (l'item entre dans la case en allant vers `dir`).
 * Retourne vrai si l'item a été accepté.
 */
export function pushItem(x, y, itemType, dir) {
  const target = buildingAt(x, y);
  if (!target) return false;
  switch (target.kind) {
    case 'belt': return insertIntoBelt(target, itemType, dir);
    case 'splitter': return insertIntoSplitter(target, itemType, dir);
    default: return insertIntoMachine(target, itemType);
  }
}
