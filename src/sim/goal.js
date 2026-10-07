// Objectif du tableau : livrer un certain nombre d'un item au dépôt.
import { game } from '../state.js';

export const GOAL = { item: 'fe_plate', count: 20 };

let reached = false;

export const goalProgress = () => Math.min(GOAL.count, game.delivered[GOAL.item] ?? 0);

export function resetGoal() {
  reached = false;
}

/** Vrai une seule fois : au moment où l'objectif vient d'être atteint. */
export function checkGoalJustReached() {
  if (reached || goalProgress() < GOAL.count) return false;
  reached = true;
  return true;
}
