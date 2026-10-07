// Tapis : transportent un item à la fois, dans leur direction.
import { BELT_SPEED } from '../config.js';
import { DIRS, inBounds, opposite } from '../core/grid.js';
import { game } from '../state.js';
import { splitterOutputs } from '../data/splitterShapes.js';
import { buildingAt, outputCell } from '../world/buildings.js';
import { pushItem } from './transfer.js';

/**
 * Un item veut entrer sur le tapis en se déplaçant vers `dir`.
 *
 * Jonctions : quand plusieurs côtés alimentent le même tapis, ils passent chacun
 * leur tour. Chaque côté qui essaie d'entrer laisse une « demande » ; le côté qui
 * vient de passer cède sa place tant qu'un autre côté attend.
 */
export function insertIntoBelt(belt, itemType, dir) {
  if (dir === opposite(belt.dir)) return false; // on n'entre pas à contre-sens

  belt.requests[dir] = game.tick;
  if (belt.item) return false;

  const otherSideWaiting = belt.requests.some((tick, side) => side !== dir && tick >= game.tick - 1);
  if (dir === belt.lastInput && otherSideWaiting) return false;

  belt.lastInput = dir;
  belt.item = { type: itemType, progress: 0, enterDir: dir };
  return true;
}

/** Avance l'item ; au bout du tapis, essaie de le passer à la case suivante. */
export function stepBelt(belt, dt) {
  const item = belt.item;
  if (!item) return;
  item.progress = Math.min(1, item.progress + dt * BELT_SPEED);
  if (item.progress < 1) return;

  const [dx, dy] = DIRS[belt.dir];
  if (pushItem(belt.x + dx, belt.y + dy, item.type, belt.dir)) belt.item = null;
}

/**
 * Côtés du tapis à dessiner (ses « bras ») : sa sortie, chaque côté par où un autre
 * tapis, splitter ou machine l'alimente, et l'arrière quand rien ne l'alimente.
 * C'est ce qui donne les formes droit, coin, T et croix.
 */
export function beltArms(belt) {
  const arms = [belt.dir];
  let fed = false;

  for (let side = 0; side < 4; side++) {
    if (side === belt.dir) continue;
    const [dx, dy] = DIRS[side];
    const nx = belt.x + dx, ny = belt.y + dy;
    if (!inBounds(nx, ny)) continue;

    const neighbor = buildingAt(nx, ny);
    const towardUs = opposite(side);
    if (!neighbor || neighbor.kind === 'hub') continue;

    let feedsUs;
    if (neighbor.kind === 'splitter') {
      feedsUs = splitterOutputs(neighbor.dir, neighbor.shape).includes(towardUs);
    } else if (neighbor.kind === 'belt') {
      feedsUs = neighbor.dir === towardUs;
    } else {
      const [ox, oy] = outputCell(neighbor);
      feedsUs = neighbor.dir === towardUs && ox === belt.x && oy === belt.y;
    }

    if (feedsUs) {
      arms.push(side);
      fed = true;
    }
  }

  if (!fed) arms.push(opposite(belt.dir));
  return arms;
}
