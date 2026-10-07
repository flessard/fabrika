// Tapis : transportent un item à la fois, dans leur direction.
import { BELT_SPEED } from '../config.js';
import { DIRS, inBounds, opposite } from '../core/grid.js';
import { game } from '../state.js';
import { splitterOutputs } from '../data/splitterShapes.js';
import { buildingAt, outputCell } from '../world/buildings.js';
import { canEnter, pushItem, reservedForSomeoneElse, reserveEntry } from './transfer.js';
import { recordFlow } from './flow.js';

/**
 * Le tapis peut-il recevoir un item qui arrive en allant vers `dir`, envoyé par `from` ?
 *
 * Jonctions : quand plusieurs côtés alimentent le même tapis, ils passent chacun
 * leur tour. Chaque côté qui demande laisse une trace ; le côté qui vient de passer
 * cède sa place tant qu'un autre côté attend.
 */
export function beltAccepts(belt, dir, from) {
  if (dir === opposite(belt.dir)) return false; // on n'entre pas à contre-sens

  belt.requests[dir] = game.tick;
  if (belt.item) return false;
  if (belt.incoming?.from === from) return true; // place déjà réservée par lui
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
 * Côtés du tapis à dessiner (ses « bras ») : sa sortie, chaque côté par où un autre
 * tapis, splitter ou machine l'alimente, et l'arrière quand rien ne l'alimente.
 * C'est ce qui donne les formes droit, coin, T et croix.
 *
 * `virtual` : un bâtiment pas encore posé (l'aperçu sous le curseur), traité comme
 * s'il était déjà sur la carte. Sert à montrer la forme qu'auront les tapis.
 */
export function beltArms(belt, virtual = null) {
  const at = (x, y) => (virtual && covers(virtual, x, y) ? virtual : buildingAt(x, y));
  const arms = [belt.dir];
  let fed = false;

  for (let side = 0; side < 4; side++) {
    if (side === belt.dir) continue;
    const [dx, dy] = DIRS[side];
    const nx = belt.x + dx, ny = belt.y + dy;
    if (!inBounds(nx, ny)) continue;

    const neighbor = at(nx, ny);
    if (neighbor && feedsInto(neighbor, belt.x, belt.y, opposite(side))) {
      arms.push(side);
      fed = true;
    }
  }

  if (!fed) arms.push(opposite(belt.dir));
  return arms;
}

/**
 * Le bâtiment `b` envoie-t-il ses items dans la case (x, y) ?
 * `towardCell` : la direction qui va de `b` vers cette case.
 */
export function feedsInto(b, x, y, towardCell) {
  switch (b.kind) {
    case 'hub': return false;
    case 'splitter': return splitterOutputs(b.dir, b.shape).includes(towardCell);
    case 'belt':
    case 'merger': return b.dir === towardCell;
    default: {
      const [ox, oy] = outputCell(b);
      return b.dir === towardCell && ox === x && oy === y;
    }
  }
}

const covers = (b, x, y) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
