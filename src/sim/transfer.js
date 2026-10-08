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
//
// Usines : un item poussé dans le contour d'une usine passe par la porte et arrive dans la
// case derrière, à l'intérieur ; un item poussé dans une porte, de l'intérieur, ressort
// devant l'usine, dehors (voir world/interiors.js). La porte ne garde rien : c'est la case
// d'arrivée qui accepte ou refuse.
import { buildingAt, buildingById } from '../world/buildings.js';
import { doorEntered, insideCell, interiorLayer, outsideCell } from '../world/interiors.js';
import { game } from '../state.js';
import { inputLayer, outputLayer } from '../data/buildings.js';
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
export function pushItem(x, y, itemType, dir, from, layer = outputLayer(from)) {
  const target = receiverAt(x, y, layer);
  if (!target) return false;
  const through = passage(target, x, y, dir);
  if (through) return !!through.layer && pushItem(through.x, through.y, itemType, dir, from, through.layer);
  switch (target.kind) {
    case 'belt': return insertIntoBelt(target, itemType, dir, from);
    case 'splitter': return insertIntoSplitter(target, itemType, dir, from);
    case 'merger': return insertIntoMerger(target, itemType, dir, from);
    default: return insertIntoMachine(target, itemType);
  }
}

/** La case (x, y) accepterait-elle l'item maintenant ? (Laisse une demande sur les jonctions.) */
export function canEnter(x, y, itemType, dir, from, layer = outputLayer(from)) {
  const target = receiverAt(x, y, layer);
  if (!target) return false;
  const through = passage(target, x, y, dir);
  if (through) return !!through.layer && canEnter(through.x, through.y, itemType, dir, from, through.layer);
  switch (target.kind) {
    case 'belt': return beltAccepts(target, dir, from);
    case 'splitter': return splitterAccepts(target, dir, from);
    case 'merger': return mergerAccepts(target, dir, from);
    default: return machineCouldAccept(target, itemType);
  }
}

/** Réserve un tapis, un splitter ou un groupeur pour l'item que `from` va y envoyer en allant vers `dir`. */
export function reserveEntry(x, y, from, dir, layer = outputLayer(from)) {
  const target = receiverAt(x, y, layer);
  if (!target) return;
  const through = passage(target, x, y, dir);
  if (through) {
    if (through.layer) reserveEntry(through.x, through.y, from, dir, through.layer);
    return;
  }
  if (isConveyor(target)) target.incoming = { from: from.id, tick: game.tick };
}

/** Le bâtiment qui recevrait en (x, y) ce qui arrive sur la couche `layer`, ou null. */
function receiverAt(x, y, layer) {
  const target = buildingAt(x, y, layer);
  return target && inputLayer(target) === layer ? target : null;
}

/**
 * Si `target` est une usine ou une porte, où l'item continue vraiment :
 * { x, y, layer } de la case d'arrivée, ou { layer: null } s'il ne peut pas passer
 * (il ne vient pas du bon côté). Pour un autre bâtiment : null.
 */
function passage(target, x, y, dir) {
  if (target.kind === 'factory') {
    const door = doorEntered(target, x, y, dir);
    if (!door) return { layer: null };
    const [ix, iy] = insideCell(door.side, door.k);
    return { x: ix, y: iy, layer: interiorLayer(target) };
  }
  if (target.kind === 'door') {
    const factory = buildingById(target.factory);
    if (!factory || dir !== target.side) return { layer: null }; // on sort seulement vers le dehors
    const [ox, oy] = outsideCell(factory, target.side, target.k);
    return { x: ox, y: oy, layer: outputLayer(factory) };
  }
  return null;
}

/** Tapis, splitter et groupeur : les bâtiments qui transportent un item à la fois. */
export const isConveyor = (b) => b.kind === 'belt' || b.kind === 'splitter' || b.kind === 'merger';

/**
 * Une réservation (`incoming.from` : l'identifiant de celui qui arrive) compte tant
 * que celui qui l'a faite est en route.
 * Elle expire d'elle-même (ex. si le bâtiment qui arrivait a été enlevé).
 */
const RESERVATION_TICKS = 30;
export function reservedForSomeoneElse(target, from) {
  const r = target.incoming;
  if (!r || r.from === from.id) return false;
  return game.tick - r.tick < RESERVATION_TICKS;
}
