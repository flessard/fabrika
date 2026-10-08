// Fiche d'un bâtiment : s'ouvre quand on clique dessus avec l'outil Déplacer.
// Une flèche relie la fiche au bâtiment, et la fiche suit la caméra.
//
// Elle est générique : describe() transforme n'importe quel bâtiment en une liste
// de sections (titre + contenu), et l'affichage ne fait que les dessiner.
// Une nouvelle machine de kind 'crafter' (data/buildings.js) a donc sa fiche sans rien ajouter.
import { BELT_SPEED, TILE } from '../config.js';
import { DOWN, LEFT, RIGHT, UP, turnLeft, turnRight } from '../core/grid.js';
import { doorRoles } from '../sim/factory.js';
import { buildingsInside } from '../world/buildings.js';
import { enterFactory, factoryNumber } from './factoryView.js';
import { BUILDINGS, inputCapacity, isOn, isUnderground, outputCapacity } from '../data/buildings.js';
import { ITEMS } from '../data/items.js';
import { filterFor, priorityOrder, raisePriority, relativeSide, splitterOutputs } from '../data/splitterShapes.js';
import { mergerInputs } from '../data/mergerShapes.js';
import { on } from '../core/events.js';
import { buildingName, decimal, itemName, itemPlural, shapeLabel, t } from '../i18n/index.js';
import { isConveyor } from '../sim/transfer.js';
import { game, ui, view } from '../state.js';
import { flowSummary } from '../sim/flow.js';
import { productionRate } from '../sim/machines.js';
import { makeCanvas } from '../render/pen.js';
import { issue } from '../sim/commands.js';
import { placeScaled, screenSize, uiScale } from './uiScale.js';
import { isStockItem } from '../world/inventory.js';
import { stackSize } from '../sim/storage.js';
import { refusal } from '../render/scene.js';
import { refusalText } from './hint.js';
import { activeRecipeIndices, activeRecipes, ingredientsOf, recipesOf, yieldOf } from '../data/recipes.js';
import { hideTooltip, itemDescription, showTooltip, tipAmount, tipHead } from './tooltip.js';
import { beltColors, drawBelt, drawFilter, drawMerger, drawSmartSplitter, drawSplitter, drawTunnel, drawUnderBelt, filterKey } from '../render/sprites/belts.js';
import { itemIconUrl } from '../render/sprites/items.js';
import { machineSprite } from '../render/sprites/machines.js';

const panel = document.getElementById('infoPanel');
const GAP = 14; // espace entre le bâtiment et la fiche (la flèche est dedans)
const BELT_MAX_PER_MINUTE = BELT_SPEED * 60;

let shownFor = null;
let parts = null;

export function initInfoPanel() {
  // Boutons des priorités (▲) et des filtres (icônes d'items) : un seul écouteur pour
  // toute la fiche, car son contenu est redessiné. On réagit dès l'appui : les débits
  // changent sans cesse et le bouton peut être redessiné avant le relâchement.
  panel.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const b = shownFor;
    const raise = e.target.closest('[data-raise]');
    if (e.target.closest('[data-take]') && b) issue({ type: 'takeOutput', id: b.id });
    const slot = e.target.closest('[data-take-slot]');
    if (slot && b?.slots) issue({ type: 'takeSlot', id: b.id, slot: Number(slot.dataset.takeSlot) });
    if (e.target.closest('[data-enter]') && b?.kind === 'factory') return enterFactory(b);
    if (e.target.closest('[data-clear]') && b?.item) issue({ type: 'clearItem', id: b.id });
    if (e.target.closest('[data-power]') && b) issue({ type: 'setEnabled', ids: [b.id], enabled: !isOn(b) });
    const recipe = e.target.closest('[data-recipe]');
    if (recipe && b?.kind === 'crafter') {
      const index = Number(recipe.dataset.recipe);
      issue({ type: 'setRecipe', id: b.id, index, on: !activeRecipeIndices(b).includes(index) });
    }
    if (e.target.closest('[data-output]') && b?.kind === 'storage') issue({ type: 'setStorageOutput', id: b.id, open: !b.outputOpen });
    if (raise && b?.priority) {
      issue({ type: 'setPriority', id: b.id, priority: raisePriority(b.priority, b.dir, b.shape, Number(raise.dataset.raise)) });
    }
    const chip = e.target.closest('[data-filter-side]');
    if (chip && b?.filters) {
      issue({ type: 'toggleFilter', id: b.id, side: relativeSide(b.dir, Number(chip.dataset.filterSide)), item: chip.dataset.item });
    }
  });
  // Info-bulle des icônes d'items du filtre : tout de suite, et elle reste même si la
  // fiche se redessine sous la souris (elle vit en dehors de la fiche).
  panel.addEventListener('pointermove', (e) => {
    const chip = e.target.closest('[data-filter-side]');
    if (chip) showChipTooltip(chip);
    else tooltip.hidden = true;
    // Détail d'une recette : au survol des boutons de recette et de la recette en cours.
    const recipe = e.target.closest('[data-recipe], [data-recipe-tip]');
    const index = recipe && Number(recipe.dataset.recipe ?? recipe.dataset.recipeTip);
    if (recipe && shownFor?.kind === 'crafter') showTooltip(recipeTipHtml(shownFor, index), e.clientX, e.clientY);
    else hideTooltip();
  });
  panel.addEventListener('pointerleave', () => {
    tooltip.hidden = true;
    tipFor = null;
    hideTooltip();
  });
  // Nouvelle langue : la fiche ouverte est reconstruite (bouton de fermeture compris).
  on('lang:changed', () => { shownFor = null; });
}

const tooltip = Object.assign(document.createElement('div'), { id: 'chipTooltip', className: 'panel', hidden: true });
document.body.append(tooltip);

/** Familles d'items, d'après leur forme (voir data/items.js). */
const FAMILY = { ore: 'family.ore', ingot: 'family.ingot', plate: 'family.product', wire: 'family.product', belt: 'family.part', rubble: 'family.waste' };
/** « l'envoyer à gauche », « tout droit », « à droite ». */
const toward = (dir, side) => t(`toward.${sideKey(dir, side)}`);

/** Icône d'item survolée : { item, side, rect }. Gardée pour réécrire l'info-bulle après un clic. */
let tipFor = null;

function showChipTooltip(chip) {
  tipFor = { item: chip.dataset.item, side: Number(chip.dataset.filterSide), rect: chip.getBoundingClientRect() };
  renderChipTooltip();
}

/** Nom de l'item, sa famille, et ce que fera le clic, au-dessus de l'icône survolée. */
function renderChipTooltip() {
  const b = shownFor;
  if (!b?.filters || !tipFor) return;
  const { item: type, side } = tipFor;
  const chosen = filterFor(b.filters, b.dir, side).includes(type);
  const family = FAMILY[ITEMS[type].shape];
  tooltip.innerHTML = `<b>${itemName(type)}</b>${family ? ` <span class="ip-muted">· ${t(family)}</span>` : ''}<br>`
    + `<small>${t(chosen ? 'panel.filter.stop' : 'panel.filter.send', { toward: toward(b.dir, side) })}</small>`;
  tooltip.hidden = false;
  const r = tipFor.rect;
  const { w, h } = screenSize(tooltip);
  placeScaled(tooltip, Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)), r.top - h - 6 < 8 ? r.bottom + 6 : r.top - h - 6);
}

export function closeInfoPanel() {
  ui.selected = null;
  tooltip.hidden = true;
  hideTooltip();
}

/** À appeler à chaque image. */
export function updateInfoPanel() {
  const b = ui.selected;
  if (!b || !game.buildings.includes(b)) {
    if (ui.selected) ui.selected = null;
    panel.hidden = true;
    tooltip.hidden = true;
    shownFor = null;
    return;
  }
  const info = describe(b);
  if (shownFor !== b) build(b);
  fill(info);
  place(b);
  // Le réglage vient de changer (la commande est appliquée un pas plus tard) : on suit.
  if (!tooltip.hidden) renderChipTooltip();
}

// ---------- Ce qu'on montre ----------

/**
 * Fiche d'un bâtiment, indépendante de l'affichage :
 *   { title, subtitle?, status: { label, tone: 'ok' | 'warn' | 'idle' }, sections: [{ label, aside?, html }] }
 */
function describe(b) {
  if (b.kind === 'factory') return describeFactory(b);
  if (isConveyor(b)) return describeConveyor(b);
  if (b.kind === 'storage') return describeStorage(b);
  if (b.kind === 'dump') return describeDump(b);
  return describeMachine(b);
}

/** Conteneur : ses emplacements (icône, nombre / taille du paquet), sa sortie, et « Prendre ». */
function describeStorage(b) {
  const used = b.slots.filter(Boolean).length;
  const status = used === b.slots.length
    ? { label: t('panel.storage.full'), tone: 'warn' }
    : { label: t('panel.storage.used', { n: used, total: b.slots.length }), tone: used ? 'ok' : 'idle' };
  // Chaque emplacement plein est un bouton : un clic le met dans l'inventaire.
  const slots = b.slots.map((slot, i) => (slot
    ? `<button type="button" class="ip-slot" data-take-slot="${i}" title="${t('panel.storage.takeSlot', { n: slot.count, item: slot.count > 1 ? itemPlural(slot.item) : itemName(slot.item) })}">
         <img class="ip-item" src="${itemIconUrl(slot.item)}" alt="${itemName(slot.item)}">
         <b${slot.count >= stackSize(slot.item) ? ' class="full"' : ''}>${slot.count}</b><span>/${stackSize(slot.item)}</span></button>`
    : '<div class="ip-slot empty"></div>')).join('');
  const takeable = b.slots.reduce((n, s) => n + (s ? s.count : 0), 0);
  const take = takeable
    ? `<button type="button" class="ip-take" data-take title="${t('panel.storage.takeAll.title')}">${t('panel.storage.takeAll', { n: takeable })}</button>` : '';
  return {
    title: buildingName(b.type),
    status,
    sections: [
      { label: t('panel.storage.contents'), html: `<div class="ip-slots">${slots}</div>${take}` },
      { label: t('panel.storage.output'), aside: t('panel.storage.output.aside'), html: `
        <button type="button" class="ip-toggle" data-output aria-pressed="${b.outputOpen}">
          ${t(b.outputOpen ? 'panel.storage.open' : 'panel.storage.closed')}
        </button>` },
    ],
  };
}

/**
 * Usine : ses portes (lesquelles sont des entrées, lesquelles des sorties), ce qu'il y a
 * dedans, et le bouton pour y entrer.
 */
function describeFactory(b) {
  const roles = doorRoles(b);
  const ins = roles.filter((d) => d.role === 'in').length;
  const outs = roles.filter((d) => d.role === 'out').length;
  const inside = buildingsInside(b).filter((x) => x.kind !== 'door').length;
  // Plan des 16 portes : un carré par porte, autour d'un carré qui figure l'usine.
  const square = (side, k) => {
    const role = roles.find((d) => d.side === side && d.k === k).role;
    return `<i class="door ${role ?? 'none'}" title="${t(role ? `door.${role}` : 'door.none')}"></i>`;
  };
  const row = (side) => [0, 1, 2, 3].map((k) => square(side, k)).join('');
  const plan = `<div class="ip-doors">
      <span></span><span class="h">${row(UP)}</span><span></span>
      <span class="v">${row(LEFT)}</span><span class="core">${inside}</span><span class="v">${row(RIGHT)}</span>
      <span></span><span class="h">${row(DOWN)}</span><span></span>
    </div>`;
  return {
    title: buildingName(b.type),
    subtitle: t('inside.number', { n: factoryNumber(b) }),
    status: { label: t('panel.factory.doors', { ins, outs }), tone: ins || outs ? 'ok' : 'idle' },
    sections: [
      { label: t('panel.factory.doorsLabel'), aside: t('panel.factory.doorsAside'), html: plan },
      { label: t('panel.factory.inside'), html: `
        <div class="ip-row">${t('panel.factory.count', { n: inside })}</div>
        <button type="button" class="ip-take" data-enter>${t('panel.factory.enter')}</button>` },
    ],
  };
}

/** Décharge : ce qu'elle a jeté depuis sa pose. */
function describeDump(b) {
  return {
    title: buildingName(b.type),
    status: { label: t('panel.dump.status'), tone: b.flash > 0 ? 'ok' : 'idle' },
    sections: [
      { label: t('panel.dump.destroyed'), aside: t('panel.dump.aside'), html: `<div class="ip-row">${b.destroyed}</div>` },
    ],
  };
}

function describeMachine(b) {
  const def = BUILDINGS[b.type];
  const outFull = b.outputs.length >= outputCapacity(b);

  let status = { label: t('panel.status.waiting'), tone: 'idle' };
  if (b.kind === 'drill') status = b.working ? { label: t('panel.status.running'), tone: 'ok' } : { label: t('panel.status.outputFull'), tone: 'warn' };
  else if (b.current) status = { label: t('panel.status.running'), tone: 'ok' };
  else if (outFull) status = { label: t('panel.status.outputFull'), tone: 'warn' };
  if (!isOn(b)) status = { label: t('panel.status.off'), tone: 'off' };

  const busy = b.kind === 'drill' ? b.working : !!b.current;
  let making;
  if (b.kind === 'drill') {
    making = recipeHtml(null, b.ore);
  } else if (busy && b.currentRecipe != null) {
    making = `<span class="ip-row" data-recipe-tip="${b.currentRecipe}">${recipeRowHtml(recipesOf(b.type)[b.currentRecipe])}</span>`;
  } else {
    const active = activeRecipes(b);
    making = active.length
      ? active.map(({ recipe }) => recipeRowHtml(recipe)).join('<span class="ip-sep">·</span>')
      : `<span class="ip-muted">${t('panel.recipes.none')}</span>`;
  }
  const most = b.kind === 'crafter' ? Math.max(1, ...activeRecipes(b).map(({ recipe }) => yieldOf(recipe))) : 1;

  const stocks = [];
  if (inputCapacity(b)) stocks.push(stockHtml(t('panel.input'), b.inputs, inputCapacity(b)));
  if (outputCapacity(b)) stocks.push(stockHtml(t('panel.output'), b.outputs, outputCapacity(b)));
  // Ce qu'elle a fabriqué pour l'inventaire (des tapis…) : un bouton pour le prendre.
  const takeable = b.outputs.filter(isStockItem).length;
  if (takeable) {
    stocks.push(`<button type="button" class="ip-take" data-take title="${t('panel.take.title')}">${t('panel.take', { n: takeable })}</button>`);
  }

  const { actual, max } = productionRate(b);
  return {
    title: buildingName(b.type),
    status,
    sections: [
      { label: t('panel.production'),
        aside: most > 1 ? t('panel.perCraft', { s: decimal(def.time), n: most }) : t('panel.perItem', { s: decimal(def.time) }),
        html: `<div class="ip-row">${making}</div>${bar(busy ? b.progress : 0)}` },
      ...(b.kind === 'crafter' ? [recipeSection(b)] : []),
      { label: t('panel.stock'), aside: def.residue ? t('panel.residue.aside', { n: def.residue.every }) : '', html: stocks.join('') },
      { label: t('panel.rate'), html: rateHtml(actual, max) },
      // Marche / arrêt (touche O en survolant la machine)
      { label: t('panel.power'), aside: t('panel.power.aside'), html: `
        <button type="button" class="ip-power${isOn(b) ? '' : ' off'}" data-power>
          ${t(isOn(b) ? 'panel.power.turnOff' : 'panel.power.turnOn')}
        </button>` },
    ],
  };
}

function describeConveyor(b) {
  const flow = flowSummary(b);
  let status = { label: t('panel.status.empty'), tone: 'idle' };
  const refused = refusal(b);
  if (refused) status = { label: t('panel.status.refused', { machine: buildingName(refused.target.type) }), tone: 'warn' };
  else if (b.stalled) status = { label: t('panel.status.blocked'), tone: 'warn' };
  else if (b.item) status = { label: t('panel.status.moving'), tone: 'ok' };

  const sections = [
    { label: t('panel.carrying'), html: `<div class="ip-row">${b.item
      ? `${icon(b.item.type)} ${itemName(b.item.type)}
        <button type="button" class="ip-clear" data-clear title="${t(isStockItem(b.item.type) ? 'panel.clear.title.stock' : 'panel.clear.title')}">${t('panel.clear')}</button>`
      : `<span class="ip-muted">${t('panel.nothing')}</span>`}</div>` },
    { label: t('panel.throughput'), html: rateHtml(flow.perMinute, BELT_MAX_PER_MINUTE) + gauge((flow.perMinute ?? 0) / BELT_MAX_PER_MINUTE) },
  ];
  // Bloqué par une machine qui refuse l'item : pourquoi, et quoi faire.
  if (refused) sections.unshift({ label: t('panel.refused'), html: `<div class="ip-refused">${refusalText(refused)}</div>` });
  if (flow.byItem.length > 1 || (flow.byItem.length === 1 && b.kind === 'belt')) {
    sections.push({ label: t('panel.byItem'), html: `<div class="ip-row ip-wrap">${flow.byItem
      .map((f) => `${icon(f.itemType)}<span>${rate(f.perMinute)}</span>`).join('<span class="ip-sep">·</span>')}</div>` });
  }
  if (b.priority) {
    // Splitter prioritaire : les sorties dans l'ordre, avec un bouton pour en faire monter une.
    const order = priorityOrder(b.dir, b.shape, b.priority);
    sections.push({ label: t('panel.priorities'), aside: t('panel.priorities.aside'), html: order.map((side, rank) => `
      <div class="ip-prio">
        <b class="rank-${rank + 1}">${rank + 1}</b>
        <span>${sideName(b.dir, side)}</span>
        <span class="ip-muted">${rate(flow.byOutput.get(side) ?? 0)}</span>
        ${rank > 0 ? `<button type="button" data-raise="${side}" title="${t('panel.priorities.raise', { rank })}">▲</button>` : '<span></span>'}
      </div>`).join('') });
  } else if (b.filters) {
    // Filtre : une rangée par sortie, avec une icône par item à allumer ou éteindre.
    const sides = splitterOutputs(b.dir, b.shape);
    sections.push({ label: t('panel.filter'), aside: t('panel.filter.aside'), html: sides.map((side) => {
      const chosen = filterFor(b.filters, b.dir, side);
      // Le nom de chaque item s'affiche au survol (voir showChipTooltip).
      const chips = Object.keys(ITEMS).map((type) => `
        <button type="button" class="ip-chip" data-filter-side="${side}" data-item="${type}"
          aria-pressed="${chosen.includes(type)}" aria-label="${itemName(type)}"><img class="ip-item" src="${itemIconUrl(type)}" alt=""></button>`).join('');
      const names = chosen.length
        ? chosen.map((type) => itemName(type)).join(' · ')
        : `<span class="ip-muted">${t('panel.filter.rest')}</span>`;
      return `
        <div class="ip-filter">
          <div class="ip-filter-head">
            <span>${sideName(b.dir, side)}</span>
            <span class="ip-muted">${rate(flow.byOutput.get(side) ?? 0)}</span>
          </div>
          <div class="ip-chips">${chips}</div>
          <div class="ip-chosen">${names}</div>
        </div>`;
    }).join('') });
  } else if (b.kind === 'splitter') {
    const sides = splitterOutputs(b.dir, b.shape);
    sections.push({ label: t('panel.byOutput'), html: `<div class="ip-row ip-wrap">${sides
      .map((side) => `<span class="ip-muted">${sideName(b.dir, side)}</span> <span>${rate(flow.byOutput.get(side) ?? 0)}</span>`)
      .join('<span class="ip-sep">·</span>')}</div>` });
  }

  if (b.kind === 'merger') {
    const sides = mergerInputs(b.dir, b.shape);
    sections.push({ label: t('panel.byInput'), html: `<div class="ip-row ip-wrap">${sides
      .map((side) => `<span class="ip-muted">${sideName(b.dir, side)}</span> <span>${rate(flow.byOutput.get(side) ?? 0)}</span>`)
      .join('<span class="ip-sep">·</span>')}</div>` });
  }

  let subtitle = null;
  if (b.kind === 'splitter') subtitle = t('panel.shape', { shape: shapeLabel(b.shape) });
  if (b.kind === 'merger') subtitle = t('panel.mergerShape', { shape: shapeLabel(b.shape), n: mergerInputs(b.dir, b.shape).length });
  return {
    title: buildingName(b.type),
    subtitle,
    status,
    sections,
  };
}

/** Un côté par rapport au sens du flux (dir) : 'straight', 'left', 'right' ou 'back'. */
function sideKey(dir, side) {
  if (side === dir) return 'straight';
  if (side === turnLeft(dir)) return 'left';
  if (side === turnRight(dir)) return 'right';
  return 'back';
}

/** Nom d'un côté par rapport au sens du flux (dir) : « Tout droit », « Gauche »… */
const sideName = (dir, side) => t(`side.${sideKey(dir, side)}`);

// ---------- Petits morceaux de HTML ----------

const perMinute = (n) => (n < 10 ? decimal(n) : String(Math.round(n)));
/** « 12 / min » */
const rate = (n) => t('panel.perMinute', { n: perMinute(n) });
const icon = (type) => `<img class="ip-item" src="${itemIconUrl(type)}" alt="${itemName(type)}" title="${itemName(type)}">`;
/** Ex. [plaque] + [fil] → [tapis] ×2 */
const recipeRowHtml = (recipe) =>
  `${ingredientsOf(recipe).map(icon).join('<span class="ip-sep">+</span>')}<span class="ip-sep">→</span>${icon(recipe.out)}${yieldOf(recipe) > 1 ? `<span>×${yieldOf(recipe)}</span>` : ''}`;

/**
 * Les recettes possibles de la machine, chacune à allumer ou éteindre. Une seule active
 * par ingrédient : en allumer une éteint celle qui utilise le même.
 */
function recipeSection(b) {
  const active = new Set(activeRecipeIndices(b));
  return {
    label: t('panel.recipeChoice'),
    aside: t('panel.recipeChoice.aside'),
    html: `<div class="ip-recipes">${recipesOf(b.type).map((recipe, i) => `
      <button type="button" class="ip-recipe" data-recipe="${i}" aria-pressed="${active.has(i)}">
        ${recipeRowHtml(recipe)}
      </button>`).join('')}</div>`,
  };
}
/**
 * Infobulle d'une recette : ce qui entre et ce qui sort, en quelle quantité, la durée,
 * le débit à plein régime, et ce que fera le clic (activer, désactiver, et quelle autre
 * recette sera désactivée parce qu'elle utilise le même ingrédient).
 */
function recipeTipHtml(b, index) {
  const recipe = recipesOf(b.type)[index];
  if (!recipe) return '';
  const time = BUILDINGS[b.type].time;
  const perMin = 60 / time;
  const out = yieldOf(recipe);
  const ins = Object.entries(recipe.in);
  const active = activeRecipeIndices(b).includes(index);

  const rates = [
    ...ins.map(([item, n]) => t('recipe.tip.consumes', { n: decimal(n * perMin), item: itemPlural(item) })),
    t('recipe.tip.produces', { n: decimal(out * perMin), item: itemPlural(recipe.out) }),
  ];
  // Les recettes actives qui partagent un ingrédient : elles s'éteindront si on allume celle-ci.
  const conflicts = active ? [] : activeRecipes(b)
    .filter(({ recipe: other }) => ingredientsOf(other).some((item) => recipe.in[item]))
    .map(({ recipe: other }) => itemName(other.out));
  const desc = itemDescription(recipe.out);

  return `
    ${tipHead(recipe.out, out > 1 ? `×${out}` : '')}
    <div class="tip-recipe">${ins.map(([item, n]) => tipAmount(item, n)).join('<span class="ip-sep">+</span>')}
      <span class="ip-sep">→</span>${tipAmount(recipe.out, out)}</div>
    <div><span class="ip-muted">${t('recipe.tip.time')}</span> ${t('recipe.tip.seconds', { n: decimal(time) })}</div>
    <div><span class="ip-muted">${t('recipe.tip.fullSpeed')}</span> ${rates.join(' · ')}</div>
    ${desc ? `<p>${desc}</p>` : ''}
    <div class="${active ? 'tip-on' : 'tip-off'}">${t(active ? 'recipe.tip.active' : 'recipe.tip.inactive')}</div>
    ${conflicts.length ? `<div class="tip-warn">${t('recipe.tip.replaces', { names: conflicts.join(', ') })}</div>` : ''}`;
}

const recipeHtml = (from, to) => `${from ? `${icon(from)}<span class="ip-sep">→</span>` : ''}${icon(to)}`;
const bar = (fraction) => `<div class="ip-bar"><i style="width:${Math.round(fraction * 100)}%"></i></div>`;
const gauge = (fraction) => `<div class="ip-gauge"><i style="width:${Math.round(Math.min(1, fraction) * 100)}%"></i></div>`;

function rateHtml(actual, max) {
  const value = actual === null ? `<span class="ip-muted">${t('panel.measuring')}</span>` : rate(actual);
  return `<div class="ip-rate"><b>${value}</b><span class="ip-muted">${t('panel.max', { n: perMinute(max) })}</span></div>`;
}

/** Une ligne de stock : les items regroupés par type, le compte et une jauge. */
function stockHtml(label, list, capacity) {
  const counts = new Map();
  for (const type of list) counts.set(type, (counts.get(type) ?? 0) + 1);
  const items = counts.size
    ? [...counts].map(([type, n]) => `${icon(type)}<span>×${n}</span>`).join('')
    : `<span class="ip-muted">${t('panel.empty')}</span>`;
  return `<div class="ip-stock">
    <span class="ip-muted">${label}</span>
    <span class="ip-row">${items}</span>
    <span class="ip-count${list.length >= capacity ? ' full' : ''}">${list.length}/${capacity}</span>
    ${gauge(list.length / capacity)}
  </div>`;
}

/** Petite image du bâtiment pour l'en-tête de la fiche. */
const buildingIcons = new Map();
function buildingIconUrl(b) {
  let key = b.type;
  if (b.kind === 'splitter' || b.kind === 'merger') {
    key = `${b.type}|${b.shape}|${b.priority?.join('') ?? ''}|${b.filters ? filterKey(b.filters) : ''}|${b.dir}`;
  }
  if (!buildingIcons.has(key)) {
    let canvas;
    if (BUILDINGS[b.type].tunnel) canvas = makeCanvas(16, 16, () => drawTunnel(0, 0, RIGHT, BUILDINGS[b.type].tunnel, 0));
    else if (b.type === 'underBelt') canvas = makeCanvas(16, 16, () => drawUnderBelt(0, 0, RIGHT, [RIGHT, LEFT], 0));
    else if (b.kind === 'belt') canvas = makeCanvas(16, 16, () => drawBelt(0, 0, RIGHT, [RIGHT, LEFT], 0));
    else if (b.filters) canvas = makeCanvas(16, 16, () => drawFilter(0, 0, b.dir, b.shape, b.filters, 0, beltColors(isUnderground(b))));
    else if (b.priority) canvas = makeCanvas(16, 16, () => drawSmartSplitter(0, 0, b.dir, b.shape, b.priority, 0, beltColors(isUnderground(b))));
    else if (b.kind === 'splitter') canvas = makeCanvas(16, 16, () => drawSplitter(0, 0, RIGHT, b.shape, 0, beltColors(isUnderground(b))));
    else if (b.kind === 'merger') canvas = makeCanvas(16, 16, () => drawMerger(0, 0, RIGHT, b.shape, 0, beltColors(isUnderground(b))));
    else canvas = machineSprite(b.type);
    buildingIcons.set(key, canvas.toDataURL());
  }
  return buildingIcons.get(key);
}

// ---------- Construction et mise à jour ----------

function build(b) {
  shownFor = b;
  panel.innerHTML = `
    <div class="ip-head">
      <img class="ip-building" alt="">
      <div class="ip-title"><b></b><span class="ip-status"></span></div>
      <button type="button" class="ip-close" aria-label="${t('panel.close')}">×</button>
    </div>
    <div class="ip-sections"></div>`;
  panel.querySelector('.ip-close').addEventListener('click', closeInfoPanel);
  parts = {
    icon: panel.querySelector('.ip-building'),
    title: panel.querySelector('.ip-title b'),
    status: panel.querySelector('.ip-status'),
    sections: panel.querySelector('.ip-sections'),
  };
  panel.hidden = false;
}

/** Remplace le HTML seulement s'il a changé (évite de tout redessiner à chaque image). */
function setHtml(el, html) {
  if (el.innerHTML !== html) el.innerHTML = html;
}

function fill(info) {
  const b = shownFor;
  const iconUrl = buildingIconUrl(b);
  if (parts.icon.getAttribute('src') !== iconUrl) parts.icon.src = iconUrl;
  parts.title.textContent = info.subtitle ? `${info.title} · ${info.subtitle}` : info.title;
  parts.status.className = `ip-status ${info.status.tone}`;
  parts.status.textContent = info.status.label;
  setHtml(parts.sections, info.sections.map((s) => `
    <div class="ip-section">
      <div class="ip-label">${s.label}${s.aside ? `<span class="ip-aside">${s.aside}</span>` : ''}</div>
      ${s.html}
    </div>`).join(''));
}

/** Place la fiche au-dessus du bâtiment (ou en dessous s'il n'y a pas la place). */
function place(b) {
  const z = view.zoom;
  const centerX = (b.x * TILE + (b.w * TILE) / 2 - view.camX) * z;
  const top = (b.y * TILE - 6 - view.camY) * z; // au-dessus de la barre de progression
  const bottom = ((b.y + b.h) * TILE - view.camY) * z;

  const offscreen = centerX < 0 || centerX > innerWidth || bottom < 0 || top > innerHeight;
  panel.hidden = offscreen;
  if (offscreen) return;

  const { w, h } = screenSize(panel);
  const below = top - h - GAP < 8;
  const left = Math.max(8, Math.min(innerWidth - w - 8, centerX - w / 2));
  placeScaled(panel, left, below ? bottom + GAP : top - h - GAP);
  panel.classList.toggle('below', below);
  panel.style.setProperty('--arrow-x', `${Math.max(16, Math.min(w - 16, centerX - left)) / uiScale()}px`);
}
