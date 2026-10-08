// Conteneur : garde des items dans ses emplacements (6 pour l'instant).
//
// Chaque emplacement contient une seule sorte d'item, jusqu'à la taille de son paquet
// (data/items.js, stack : 20 tapis, 50 plaques…). Les tapis et machines qui arrivent sur
// ses côtés y déposent leurs items tant qu'il y a de la place.
//
// Sa sortie (devant) se règle dans sa fiche : fermée, il garde tout ; ouverte, il renvoie
// ses items un par un sur ce qui est devant lui (une réserve tampon sur une ligne).
import { ITEMS } from '../data/items.js';
import { outputCell } from '../world/buildings.js';
import { pushItem } from './transfer.js';
import { recordFlow } from './flow.js';

export const stackSize = (item) => ITEMS[item]?.stack ?? 50;

/** L'emplacement où ranger un item : un paquet de la même sorte pas encore plein, sinon un vide. */
function slotFor(b, item) {
  const partial = b.slots.findIndex((s) => s?.item === item && s.count < stackSize(item));
  return partial >= 0 ? partial : b.slots.indexOf(null);
}

export const storageCouldAccept = (b, item) => slotFor(b, item) >= 0;

export function insertIntoStorage(b, item) {
  const i = slotFor(b, item);
  if (i < 0) return false;
  b.slots[i] ??= { item, count: 0 };
  b.slots[i].count++;
  return true;
}

function takeOne(b, i) {
  const slot = b.slots[i];
  if (--slot.count === 0) b.slots[i] = null;
}

/** Sortie ouverte : le premier item rangé part sur ce qui est devant, s'il y a de la place. */
export function stepStorage(b) {
  if (!b.outputOpen) return;
  const i = b.slots.findIndex(Boolean);
  if (i < 0) return;
  const [x, y] = outputCell(b);
  const { item } = b.slots[i];
  if (pushItem(x, y, item, b.dir, b)) {
    takeOne(b, i);
    recordFlow(b, item);
  }
}

/**
 * Vide des emplacements du conteneur (un seul, `index`, ou tous) et retourne ce qu'ils
 * contenaient : [item, item…]. N'importe quel item : il va dans l'inventaire.
 */
export function takeSlots(b, index = null) {
  const taken = [];
  b.slots.forEach((slot, i) => {
    if (!slot || (index !== null && i !== index)) return;
    for (let n = 0; n < slot.count; n++) taken.push(slot.item);
    b.slots[i] = null;
  });
  return taken;
}
