// Faire passer un item d'une case à la suivante.
// C'est le bâtiment qui reçoit qui décide s'il l'accepte.
//
// Sur les tapis et les splitters, un item avance jusqu'au centre de sa case, puis :
//   1. canEnter()    : la case suivante peut-elle le recevoir ?
//   2. reserveEntry(): si oui, il la réserve (personne d'autre ne la prend),
//   3. pushItem()    : arrivé au bord, il y entre.
// Sinon, il attend au centre de sa case. Les files d'attente restent ainsi bien
// alignées, un item par case.
//
// Surface et sous-sol : un item part sur la couche où `from` envoie ses items, et n'est
// reçu que par un bâtiment qui prend ses items sur cette couche. C'est ainsi qu'une entrée
// de tunnel envoie au sous-sol, et qu'une sortie ne reçoit rien des tapis de surface.
import { game } from '../state.js';
import { inputLayer, outputLayer } from '../data/buildings.js';
import { buildingAt } from '../world/buildings.js';
import { beltAccepts, insertIntoBelt } from './belt.js';
import { insertIntoSplitter, splitterAccepts } from './splitter.js';
import { insertIntoMerger, mergerAccepts } from './merger.js';
import { insertIntoMachine, machineCouldAccept } from './machines.js';

/**
 * Essaie de pousser un item dans la case (x, y).
 * `dir` : direction du mouvement (l'item entre dans la case en allant vers `dir`).
 * `from` : le bâtiment qui pousse (sert aux réservations et au partage des jonctions).
 * Retourne vrai si l'item a été accepté.
 */
export function pushItem(x, y, itemType, dir, from) {
  const target = receiverAt(x, y, from);
  if (!target) return false;
  switch (target.kind) {
    case 'belt': return insertIntoBelt(target, itemType, dir, from);
    case 'splitter': return insertIntoSplitter(target, itemType, dir, from);
    case 'merger': return insertIntoMerger(target, itemType, dir, from);
    default: return insertIntoMachine(target, itemType);
  }
}

/** La case (x, y) accepterait-elle l'item maintenant ? (Laisse une demande sur les jonctions.) */
export function canEnter(x, y, itemType, dir, from) {
  const target = receiverAt(x, y, from);
  if (!target) return false;
  switch (target.kind) {
    case 'belt': return beltAccepts(target, dir, from);
    case 'splitter': return splitterAccepts(target, dir, from);
    case 'merger': return mergerAccepts(target, dir, from);
    default: return machineCouldAccept(target, itemType);
  }
}

/** Réserve un tapis, un splitter ou un groupeur pour l'item que `from` va y envoyer. */
export function reserveEntry(x, y, from) {
  const target = receiverAt(x, y, from);
  if (target && isConveyor(target)) target.incoming = { from, tick: game.tick };
}

/** Le bâtiment qui recevrait en (x, y) ce que `from` envoie, ou null. */
function receiverAt(x, y, from) {
  const layer = outputLayer(from);
  const target = buildingAt(x, y, layer);
  return target && inputLayer(target) === layer ? target : null;
}

/** Tapis, splitter et groupeur : les bâtiments qui transportent un item à la fois. */
export const isConveyor = (b) => b.kind === 'belt' || b.kind === 'splitter' || b.kind === 'merger';

/**
 * Une réservation compte tant que celui qui l'a faite est en route.
 * Elle expire d'elle-même (ex. si le bâtiment qui arrivait a été enlevé).
 */
const RESERVATION_TICKS = 30;
export function reservedForSomeoneElse(target, from) {
  const r = target.incoming;
  if (!r || r.from === from) return false;
  return game.tick - r.tick < RESERVATION_TICKS;
}
