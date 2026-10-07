// Inventaire : les objets de construction que l'équipe a en stock (pour l'instant, des tapis).
//
// On part avec un petit stock. Poser un bâtiment qui a un coût (data/buildings.js, cost)
// le dépense ; l'effacer le rend. Le stock se refait avec l'Assembleur : on prend ce qu'il
// a fabriqué (bouton « Prendre » de sa fiche), ou on le livre au dépôt par un tapis.
//
// game.inventory fait partie de l'état de la partie : sauvegardé, et commun à tous les
// joueurs d'une partie à plusieurs.
import { BUILDINGS } from '../data/buildings.js';
import { ITEMS } from '../data/items.js';
import { itemPlural, t } from '../i18n/index.js';
import { game } from '../state.js';

/** Ce qu'on a au début d'une partie. */
export const START_INVENTORY = { belt: 50 };

export const stockOf = (item) => game.inventory[item] ?? 0;

/** Un objet qui va dans l'inventaire (et pas un item qui sert à fabriquer). */
export const isStockItem = (item) => !!ITEMS[item]?.stock;

/** Ce que coûte un bâtiment de ce type, `times` fois : [[item, nombre]…]. */
const costOf = (type, times = 1) => Object.entries(BUILDINGS[type].cost ?? {}).map(([item, n]) => [item, n * times]);

/** Pourquoi on ne peut pas se payer `times` bâtiments de ce type (« plus de tapis en stock »), ou null. */
export function stockProblem(type, times = 1) {
  for (const [item, n] of costOf(type, times)) {
    if (stockOf(item) < n) return t('problem.noStock', { item: itemPlural(item) });
  }
  return null;
}

/** Combien de bâtiments de ce type on peut encore se payer (Infinity s'il est gratuit). */
export function affordable(type) {
  return Math.min(Infinity, ...costOf(type).map(([item, n]) => Math.floor(stockOf(item) / n)));
}

export function spend(type, times = 1) {
  for (const [item, n] of costOf(type, times)) game.inventory[item] = stockOf(item) - n;
}

/** Un bâtiment effacé rend ce qu'il avait coûté. */
export function refund(type) {
  for (const [item, n] of costOf(type)) game.inventory[item] = stockOf(item) + n;
}

export function addToStock(item, n = 1) {
  game.inventory[item] = stockOf(item) + n;
}
