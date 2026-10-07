// Tapis : transportent un item à la fois, dans leur direction.
//
// Un tapis n'a qu'une seule entrée : son arrière, ou un côté s'il fait un coin. Pour
// réunir deux lignes, il faut un groupeur ; pour en séparer une, un splitter (un tapis
// n'a qu'une sortie, devant). La pose d'une jonction est refusée (voir mergeProblem).
import { BELT_SPEED } from '../config.js';
import { DIRS, inBounds, opposite } from '../core/grid.js';
import { game } from '../state.js';
import { splitterOutputs } from '../data/splitterShapes.js';
import { inputLayer, isTunnel, layersOf, onLayer, outputLayer } from '../data/buildings.js';
import { t } from '../i18n/index.js';
import { buildingAt, outputCell } from '../world/buildings.js';
import { canEnter, pushItem, reservedForSomeoneElse, reserveEntry } from './transfer.js';
import { recordFlow } from './flow.js';

/**
 * Le tapis peut-il recevoir un item qui arrive en allant vers `dir`, envoyé par `from` ?
 * Seulement par son entrée (voir inputSide) : jamais deux lignes sur un même tapis.
 */
export function beltAccepts(belt, dir, from) {
  if (dir === opposite(belt.dir)) return false; // on n'entre pas à contre-sens
  if (isTunnel(belt) && dir !== belt.dir) return false; // un tunnel ne prend que par l'arrière
  if (!isTunnel(belt) && inputSide(belt) !== opposite(dir)) return false; // pas par son entrée

  belt.requests[dir] = game.tick;
  if (belt.item) return false;
  if (belt.incoming?.from === from.id) return true; // place déjà réservée par lui
  if (reservedForSomeoneElse(belt, from)) return false;

  const otherSideWaiting = belt.requests.some((tick, side) => side !== dir && tick >= game.tick - 1);
  return !(dir === belt.lastInput && otherSideWaiting);
}

export function insertIntoBelt(belt, itemType, dir, from) {
  if (!beltAccepts(belt, dir, from)) return false;
  belt.incoming = null;
  belt.lastInput = dir;
  belt.item = { type: itemType, progress: 0, enterDir: dir, committed: false };
  return true;
}

/**
 * Sert aussi au groupeur, dont la sortie est devant comme celle d'un tapis.
 *
 * L'item avance jusqu'au centre du tapis. Il ne va plus loin que si la case suivante
 * peut le recevoir (il la réserve alors) ; sinon il attend au centre et le tapis
 * s'arrête (`stalled`).
 */
export function stepBelt(belt, dt) {
  const item = belt.item;
  belt.stalled = false;
  if (!item) return;

  const [dx, dy] = DIRS[belt.dir];
  const nx = belt.x + dx, ny = belt.y + dy;

  if (!item.committed) {
    item.progress = Math.min(0.5, item.progress + dt * BELT_SPEED);
    if (item.progress < 0.5) return;
    if (!canEnter(nx, ny, item.type, belt.dir, belt)) {
      belt.stalled = true;
      return;
    }
    reserveEntry(nx, ny, belt);
    item.committed = true;
  }

  item.progress = Math.min(1, item.progress + dt * BELT_SPEED);
  if (item.progress < 1) return;
  if (pushItem(nx, ny, item.type, belt.dir, belt)) {
    belt.item = null;
    // Pour un groupeur, on note aussi par quelle entrée l'item était arrivé.
    recordFlow(belt, item.type, belt.kind === 'merger' ? opposite(item.enterDir) : null);
  } else {
    belt.stalled = true;
  }
}

/**
 * Côtés par où un tapis, splitter ou machine envoie ses items dans ce tapis.
 *
 * `virtual` : un bâtiment pas encore posé (l'aperçu sous le curseur), ou une liste
 * (un groupe déplacé ou copié), traité comme s'il était déjà sur la carte.
 * `ignore` : bâtiments qui ne comptent pas (ceux qu'on déplace, encore à leur ancienne place).
 * Seuls comptent les voisins de la couche où le tapis reçoit ses items.
 */
export function feederSides(belt, virtual = null, ignore = null) {
  const layer = inputLayer(belt);
  const extra = virtual ? [].concat(virtual).filter((v) => onLayer(v, layer)) : [];
  const at = (x, y) => {
    const found = extra.find((v) => covers(v, x, y)) ?? buildingAt(x, y, layer);
    return found && ignore?.has(found) ? null : found;
  };
  const sides = [];
  for (let side = 0; side < 4; side++) {
    if (side === belt.dir) continue;
    const [dx, dy] = DIRS[side];
    const nx = belt.x + dx, ny = belt.y + dy;
    if (!inBounds(nx, ny)) continue;
    const neighbor = at(nx, ny);
    if (neighbor && feedsInto(neighbor, belt.x, belt.y, opposite(side), layer)) sides.push(side);
  }
  return sides;
}

/**
 * L'entrée d'un tapis : son arrière s'il est alimenté par là, sinon son seul côté
 * alimenté (un coin). Avec deux côtés alimentés et rien derrière : aucune entrée
 * (une jonction sans groupeur, qui ne se pose plus mais peut venir d'une vieille partie).
 */
export function inputSide(belt) {
  const sides = feederSides(belt);
  const back = opposite(belt.dir);
  if (sides.includes(back)) return back;
  return sides.length === 1 ? sides[0] : null;
}

/**
 * Côtés du tapis à dessiner (ses « bras ») : sa sortie, et son entrée (l'arrière quand
 * rien ne l'alimente). C'est ce qui donne les formes droit et coin.
 */
export function beltArms(belt, virtual = null, ignore = null) {
  const sides = feederSides(belt, virtual, ignore);
  return [belt.dir, ...(sides.length ? sides : [opposite(belt.dir)])];
}

const isPlainBelt = (b) => b.kind === 'belt' && !isTunnel(b);

/**
 * Deux entrées sur un même tapis = une jonction, interdite sans groupeur. Vérifie les
 * tapis touchés par des bâtiments pas encore posés (`virtuals`) : les nouveaux tapis
 * eux-mêmes, et les tapis où ces bâtiments enverraient leurs items. Retourne la raison
 * à montrer au joueur, ou null. `ignore` : comme pour feederSides.
 */
export function mergeProblem(virtuals, ignore = null) {
  const toCheck = new Set();
  const at = (x, y, layer) => {
    const found = virtuals.find((v) => covers(v, x, y) && onLayer(v, layer)) ?? buildingAt(x, y, layer);
    return found && ignore?.has(found) ? null : found;
  };
  for (const v of virtuals) {
    if (isPlainBelt(v)) toCheck.add(v);
    // Les tapis voisins où v enverrait ses items
    for (const layer of layersOf(v.type)) {
      for (let cy = v.y; cy < v.y + v.h; cy++) {
        for (let cx = v.x; cx < v.x + v.w; cx++) {
          for (let side = 0; side < 4; side++) {
            const [dx, dy] = DIRS[side];
            const nx = cx + dx, ny = cy + dy;
            if (covers(v, nx, ny)) continue;
            const target = at(nx, ny, layer);
            if (target && isPlainBelt(target) && feedsInto(v, nx, ny, side, layer)) toCheck.add(target);
          }
        }
      }
    }
  }
  for (const belt of toCheck) {
    if (feederSides(belt, virtuals, ignore).length > 1) return t('problem.merge');
  }
  return null;
}

/**
 * Le bâtiment `b` envoie-t-il ses items dans la case (x, y) de la couche `layer` ?
 * `towardCell` : la direction qui va de `b` vers cette case.
 */
export function feedsInto(b, x, y, towardCell, layer = 'surface') {
  if (outputLayer(b) !== layer) return false;
  switch (b.kind) {
    case 'hub': return false;
    case 'splitter': return splitterOutputs(b.dir, b.shape).includes(towardCell);
    case 'belt':
    case 'merger': return b.dir === towardCell;
    case 'storage': if (!b.outputOpen) return false; // conteneur fermé : il ne renvoie rien
    // falls through : sinon, comme une machine
    default: {
      const [ox, oy] = outputCell(b);
      return b.dir === towardCell && ox === x && oy === y;
    }
  }
}

const covers = (b, x, y) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
