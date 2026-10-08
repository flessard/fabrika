// Recherche, côté simulation : ce qui est débloqué (game.unlocked) et les items livrés
// qu'on peut encore dépenser (game.credits). Ça fait partie de l'état de la partie :
// sauvegardé, et commun à tous les joueurs d'une partie à plusieurs.
import { BUILDINGS, baseType } from '../data/buildings.js';
import { RESEARCH, researchNode } from '../data/research.js';
import { buildingName, itemPlural, t, toolName } from '../i18n/index.js';
import { game } from '../state.js';
import { isStockItem, stockOf } from '../world/inventory.js';

/** L'outil est-il débloqué ? (Ceux qui ne sont pas dans l'arbre le sont toujours.) */
export const toolUnlocked = (toolId) => !researchNode(toolId) || game.unlocked.includes(toolId);

/** L'outil qui pose ce type de bâtiment (ex. tapis souterrain → Tapis, entrée de tunnel → Tunnel). */
export const toolOfType = (type) => (BUILDINGS[type].tunnel ? 'tunnel' : baseType(type));

/** Pourquoi on ne peut pas encore poser ce type de bâtiment, ou null. */
export function lockedProblem(type) {
  return toolUnlocked(toolOfType(type)) ? null : t('problem.locked', { name: buildingName(baseType(type)) });
}

export const creditOf = (item) => game.credits[item] ?? 0;

export const addCredit = (item) => { game.credits[item] = creditOf(item) + 1; };

/**
 * Ce qu'on peut dépenser d'un item pour la recherche : les objets de construction
 * (plaques de fer…) se prennent dans l'inventaire ; les autres, dans les items livrés
 * au dépôt, puis dans l'inventaire (ce qu'on a pris dans un conteneur, par exemple).
 */
export const fundsOf = (item) => (isStockItem(item) ? stockOf(item) : creditOf(item) + stockOf(item));

function spendFunds(item, n) {
  if (isStockItem(item)) {
    game.inventory[item] = stockOf(item) - n;
    return;
  }
  const fromCredits = Math.min(n, creditOf(item));
  game.credits[item] = creditOf(item) - fromCredits;
  if (n > fromCredits) game.inventory[item] = stockOf(item) - (n - fromCredits);
}

/** Les nœuds qu'il manque avant celui-ci. */
export const missingRequirements = (node) => (node.requires ?? []).filter((id) => !game.unlocked.includes(id));

export const canAfford = (node) => Object.entries(node.cost ?? {}).every(([item, n]) => fundsOf(item) >= n);

/**
 * Pourquoi on ne peut pas débloquer ce nœud, ou null : déjà fait, il en manque un
 * avant, ou pas assez d'items livrés.
 */
export function researchProblem(id) {
  const node = researchNode(id);
  if (!node || game.unlocked.includes(id)) return t('research.problem.done');
  const missing = missingRequirements(node);
  if (missing.length) return t('research.problem.requires', { names: missing.map(toolName).join(', ') });
  for (const [item, n] of Object.entries(node.cost ?? {})) {
    if (fundsOf(item) < n) return t('research.problem.cost', { n: n - fundsOf(item), item: itemPlural(item) });
  }
  return null;
}

/** Dépense le coût et débloque. À n'appeler que si researchProblem(id) est null. */
export function unlock(id) {
  const node = researchNode(id);
  for (const [item, n] of Object.entries(node.cost ?? {})) spendFunds(item, n);
  // Dans l'ordre de l'arbre : la même liste chez tous les joueurs.
  game.unlocked = RESEARCH.map((r) => r.id).filter((r) => r === id || game.unlocked.includes(r));
}

/** Les nœuds qu'on pourrait débloquer tout de suite. */
export const researchReady = () => RESEARCH.filter((node) => !researchProblem(node.id));
