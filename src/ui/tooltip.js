// Infobulle partagée : une petite fenêtre qui suit le curseur et explique ce qu'on survole
// (un item de l'inventaire, une recette dans la fiche d'une machine…).
//
// Le contenu est du HTML fourni par l'appelant ; l'infobulle se place près du curseur
// sans jamais sortir de l'écran, et ne bloque pas la souris (pointer-events: none).
import { itemName, t } from '../i18n/index.js';
import { itemIconUrl } from '../render/sprites/items.js';
import { placeScaled, screenSize } from './uiScale.js';

const tip = document.getElementById('tooltip');

export function showTooltip(html, x, y) {
  if (tip.innerHTML !== html) tip.innerHTML = html;
  tip.hidden = false;
  // Elle suit la taille de l'interface : position et taille comptées en pixels d'écran.
  const { w, h } = screenSize(tip);
  placeScaled(tip, Math.max(8, Math.min(innerWidth - w - 8, x + 14)), Math.max(8, Math.min(innerHeight - h - 8, y + 14)));
}

export function hideTooltip() {
  tip.hidden = true;
}

/**
 * Branche l'infobulle sur un conteneur : au survol d'un élément qui correspond à
 * `selector`, `html(élément)` donne le contenu (ou rien pour ne pas l'afficher).
 */
export function attachTooltip(container, selector, html) {
  container.addEventListener('pointermove', (e) => {
    const target = e.target.closest(selector);
    const content = target && html(target);
    if (content) showTooltip(content, e.clientX, e.clientY);
    else hideTooltip();
  });
  container.addEventListener('pointerleave', hideTooltip);
}

// ---------- Petits morceaux réutilisés ----------

/** Description d'un item (« item.<id>.desc » dans les dictionnaires), ou '' s'il n'en a pas. */
export function itemDescription(item) {
  const key = `item.${item}.desc`;
  const text = t(key);
  return text === key ? '' : text;
}

/** En-tête : icône et nom de l'item, avec un détail facultatif à droite (ex. « ×2 »). */
export const tipHead = (item, extra = '') =>
  `<div class="tip-head"><img src="${itemIconUrl(item)}" alt=""><b>${itemName(item)}</b>${extra ? `<span>${extra}</span>` : ''}</div>`;

/** « 2 × [icône] Fil de cuivre » */
export const tipAmount = (item, n) =>
  `<span class="tip-amount">${n} × <img src="${itemIconUrl(item)}" alt="">${itemName(item)}</span>`;
