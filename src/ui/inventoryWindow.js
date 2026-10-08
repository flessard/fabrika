// Fenêtre de l'inventaire : s'ouvre en cliquant sur l'inventaire du HUD.
//
// En haut, une grille de cases : chaque objet de construction en stock, rangé en paquets
// (comme dans un conteneur, data/items.js, stack). En bas, ce que coûte chaque bâtiment
// débloqué, et combien on peut encore en poser avec le stock actuel.
// La fenêtre ne met pas le jeu en pause : l'usine continue pendant qu'on regarde.
import { on } from '../core/events.js';
import { BUILDINGS, TOOLS } from '../data/buildings.js';
import { ITEMS } from '../data/items.js';
import { buildingName, itemName, t, toolName } from '../i18n/index.js';
import { itemIconUrl } from '../render/sprites/items.js';
import { toolUnlocked } from '../sim/research.js';
import { game, ui } from '../state.js';
import { playSound } from '../audio/sounds.js';
import { affordable, costOf, stockOf } from '../world/inventory.js';
import { toolIconUrl } from './toolbar.js';
import { attachTooltip, hideTooltip, itemDescription, tipHead } from './tooltip.js';

const $ = (id) => document.getElementById(id);
const overlay = $('inventoryWindow');

/** Au moins autant de cases, pour que la grille ait l'air d'un vrai inventaire. */
const MIN_SLOTS = 24;

let shown = '';

export function initInventoryWindow() {
  $('inventory').addEventListener('click', () => openInventory());
  $('inventory').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openInventory(); }
  });
  $('invClose').addEventListener('click', closeInventory);
  overlay.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.target === overlay) closeInventory(); // un clic à côté referme
  });
  overlay.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  // Infobulle : au survol de tout ce qui porte data-item (cases, totaux, coûts).
  attachTooltip(overlay, '[data-item]', (el) => itemTipHtml(el.dataset.item));
  on('lang:changed', () => { shown = ''; });
}

export const isInventoryOpen = () => !overlay.hidden;

export function openInventory() {
  if (ui.screen !== 'game') return;
  playSound('click');
  overlay.hidden = false;
  shown = '';
  updateInventoryWindow();
}

export function closeInventory() {
  overlay.hidden = true;
  hideTooltip();
}

/** À chaque image, si la fenêtre est ouverte : redessinée seulement si le stock a changé. */
export function updateInventoryWindow() {
  if (overlay.hidden) return;
  const key = JSON.stringify(game.inventory) + game.unlocked.join(',');
  if (key === shown) return;
  shown = key;
  $('invSlots').innerHTML = slotsHtml();
  $('invCosts').innerHTML = costsHtml();
}

// ---------- Les cases ----------

/** Chaque objet en stock, découpé en paquets de la taille d'un emplacement. */
function stacks() {
  const list = [];
  for (const [item, def] of Object.entries(ITEMS)) {
    let left = stockOf(item);
    while (left > 0) {
      const n = Math.min(left, def.stack);
      list.push({ item, n });
      left -= n;
    }
  }
  return list;
}

function slotsHtml() {
  const filled = stacks();
  const total = Math.max(MIN_SLOTS, Math.ceil(filled.length / 6) * 6);
  const cells = [];
  for (let i = 0; i < total; i++) {
    const s = filled[i];
    cells.push(s
      ? `<div class="inv-slot" data-item="${s.item}"><img src="${itemIconUrl(s.item)}" alt="${itemName(s.item)}"><b>${s.n}</b></div>`
      : '<div class="inv-slot empty"></div>');
  }
  // Les matériaux de construction toujours (même à zéro), les autres items s'il y en a.
  const totals = Object.keys(ITEMS).filter((id) => ITEMS[id].stock || stockOf(id) > 0)
    .map((id) => `<span class="inv-total${stockOf(id) ? '' : ' none'}" data-item="${id}"><img src="${itemIconUrl(id)}" alt="">${itemName(id)} <b>${stockOf(id)}</b></span>`);
  return `<div class="inv-grid">${cells.join('')}</div><div class="inv-totals">${totals.join('')}</div>`;
}

// ---------- Ce que coûtent les bâtiments ----------

function costsHtml() {
  const rows = TOOLS
    .filter((tool) => BUILDINGS[tool.id]?.cost && toolUnlocked(tool.id))
    .map((tool) => {
      const left = affordable(tool.id);
      const cost = costOf(tool.id).map(([item, n]) =>
        `<span class="inv-cost${stockOf(item) >= n ? '' : ' short'}" data-item="${item}"><img src="${itemIconUrl(item)}" alt="">${n}</span>`).join('');
      return `<div class="inv-row">
        <img class="inv-tool" src="${toolIconUrl(tool.id)}" alt="">
        <span>${toolName(tool.id)}</span>
        <span class="inv-row-cost">${cost}</span>
        <span class="inv-left${left ? '' : ' none'}">${t('inventory.left', { n: left })}</span>
      </div>`;
    });
  return `<div class="inv-label">${t('inventory.costs')}</div>${rows.join('')}`;
}

// ---------- Infobulle ----------

/** Les bâtiments qui fabriquent cet item (d'après leurs recettes). */
const producersOf = (item) => Object.entries(BUILDINGS)
  .filter(([, def]) => !def.base && def.recipes?.some((r) => r.out === item))
  .map(([type]) => buildingName(type));

/** Les bâtiments qui coûtent cet item à poser. */
const usersOf = (item) => TOOLS
  .filter((tool) => BUILDINGS[tool.id]?.cost?.[item])
  .map((tool) => toolName(tool.id));

function itemTipHtml(item) {
  const made = producersOf(item);
  const used = usersOf(item);
  const desc = itemDescription(item);
  return `
    ${tipHead(item)}
    <div class="ip-muted">${t('inventory.tip.stock', { n: stockOf(item) })}</div>
    ${desc ? `<p>${desc}</p>` : ''}
    ${made.length ? `<div><span class="ip-muted">${t('inventory.tip.madeBy')}</span> ${made.join(', ')}</div>` : ''}
    ${used.length ? `<div><span class="ip-muted">${t('inventory.tip.usedFor')}</span> ${used.join(', ')}</div>` : ''}`;
}
