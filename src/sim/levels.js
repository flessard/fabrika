// Progression d'une partie : le niveau en cours et ce qui a déjà été livré pour lui.
//
// Tout se passe dans la simulation (game.level, game.levelDelivered) : le niveau fait
// partie de l'état de l'usine. Il est donc sauvegardé, et identique chez tous les
// joueurs d'une partie à plusieurs.
import { emit } from '../core/events.js';
import { LEVELS } from '../data/levels.js';
import { game } from '../state.js';

/** La commande en cours, ou null quand toutes ont été livrées (partie libre). */
export const currentLevel = () => LEVELS[game.level] ?? null;

/** Combien d'items de cette ressource ont été livrés pour la commande en cours (au plus le compte demandé). */
export const goalProgress = (goal) => Math.min(goal.count, game.levelDelivered[goal.item] ?? 0);

export const goalDone = (goal) => goalProgress(goal) >= goal.count;

/**
 * Un item vient d'arriver au dépôt. S'il manque à la commande, il compte ; si la
 * commande est complète, on passe au niveau suivant (événement 'level:complete').
 */
export function recordDelivery(itemType) {
  const level = currentLevel();
  const goal = level?.goals.find((g) => g.item === itemType);
  if (!goal || goalDone(goal)) return;
  game.levelDelivered[itemType] = (game.levelDelivered[itemType] ?? 0) + 1;
  if (!level.goals.every(goalDone)) return;

  const finished = game.level;
  game.level++;
  game.levelDelivered = {};
  emit('level:complete', { level: finished });
}
