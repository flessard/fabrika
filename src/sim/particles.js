// Effets visuels éphémères : fumée, étincelles, icônes qui montent du dépôt.
// Chaque particule : { kind, x, y, vx, vy, life, max } (+ color ou itemType).
import { game } from '../state.js';
import { PALETTE as P } from '../data/palette.js';

const jitter = (amount) => (Math.random() - 0.5) * amount;

export function spawnSmoke(x, y) {
  game.particles.push({ kind: 'smoke', x, y, vx: jitter(3), vy: -9, life: 0, max: 1.6 });
}

/** Petit nuage quand on pose ou enlève un bâtiment. */
export function spawnPuff(x, y, count) {
  for (let k = 0; k < count; k++) {
    game.particles.push({ kind: 'smoke', x: x + jitter(12), y: y + jitter(12), vx: jitter(10), vy: -6, life: 0, max: 0.8 });
  }
}

export function spawnSparks(x, y, count, color = P.yellow) {
  for (let k = 0; k < count; k++) {
    game.particles.push({ kind: 'spark', color, x, y, vx: jitter(50), vy: -30 - Math.random() * 20, life: 0, max: 0.4 });
  }
}

/** Poussière qui saute d'une foreuse. */
export function spawnDust(x, y) {
  game.particles.push({ kind: 'spark', color: P.sand, x, y, vx: jitter(20), vy: -18, life: 0, max: 0.5 });
}

/** Icône d'item qui monte au-dessus du dépôt à chaque livraison. */
export function spawnItemIcon(itemType, x, y) {
  game.particles.push({ kind: 'icon', itemType, x, y, vx: 0, vy: -14, life: 0, max: 1 });
}

export function updateParticles(dt) {
  for (const p of game.particles) {
    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === 'spark') p.vy += 60 * dt; // gravité
  }
  game.particles = game.particles.filter((p) => p.life < p.max);
}
