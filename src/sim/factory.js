// Les portes d'une usine, vues de dehors : laquelle sert d'entrée, laquelle de sortie.
// (Le passage des items lui-même est dans sim/transfer.js.)
import { opposite } from '../core/grid.js';
import { buildingAt } from '../world/buildings.js';
import { ALL_DOORS, doorCell, edgeCell, insideCell, interiorLayer, outsideCell } from '../world/interiors.js';
import { feedsInto } from './belt.js';

/**
 * Rôle d'une porte : 'in' si un tapis (ou une machine) du dehors envoie ses items dans
 * l'usine par cette case, 'out' si quelque chose à l'intérieur envoie les siens vers la
 * porte, null si rien n'y est branché.
 */
export function doorRole(factory, side, k) {
  const [ox, oy] = outsideCell(factory, side, k);
  const [ex, ey] = edgeCell(factory, side, k);
  const outside = buildingAt(ox, oy, 'surface');
  if (outside && outside !== factory && feedsInto(outside, ex, ey, opposite(side), 'surface')) return 'in';
  const layer = interiorLayer(factory);
  const [dx, dy] = doorCell(side, k);
  const [ix, iy] = insideCell(side, k);
  const inside = buildingAt(ix, iy, layer);
  if (inside && feedsInto(inside, dx, dy, side, layer)) return 'out';
  return null;
}

/** Toutes les portes avec leur rôle : [{ side, k, role }…]. */
export const doorRoles = (factory) => ALL_DOORS.map(({ side, k }) => ({ side, k, role: doorRole(factory, side, k) }));
