// Fiche d'un bâtiment : s'ouvre quand on clique dessus avec l'outil Déplacer.
// Une flèche relie la fiche au bâtiment, et la fiche suit la caméra.
//
// Elle est générique : describe() transforme n'importe quel bâtiment en une liste
// de sections (titre + contenu), et l'affichage ne fait que les dessiner.
// Une nouvelle machine de kind 'crafter' (data/buildings.js) a donc sa fiche sans rien ajouter.
import { BELT_SPEED, TILE } from '../config.js';
import { RIGHT, LEFT, opposite, turnLeft, turnRight } from '../core/grid.js';
import { BUILDINGS, inputCapacity, isUnderground, outputCapacity } from '../data/buildings.js';
import { ITEMS } from '../data/items.js';
import { filterFor, priorityOrder, raisePriority, shapeById, splitterOutputs, toggleFilter } from '../data/splitterShapes.js';
import { mergerInputs, mergerShapeById } from '../data/mergerShapes.js';
import { isConveyor } from '../sim/transfer.js';
import { game, ui, view } from '../state.js';
import { flowSummary } from '../sim/flow.js';
import { productionRate } from '../sim/machines.js';
import { makeCanvas } from '../render/pen.js';
import { playSound } from '../audio/sounds.js';
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
    if (raise && b?.priority) b.priority = raisePriority(b.priority, b.dir, b.shape, Number(raise.dataset.raise));
    const chip = e.target.closest('[data-filter-side]');
    if (chip && b?.filters) {
      toggleFilter(b.filters, b.dir, Number(chip.dataset.filterSide), chip.dataset.item);
      playSound('click');
      showChipTooltip(chip);
    }
  });
  // Info-bulle des icônes d'items du filtre : tout de suite, et elle reste même si la
  // fiche se redessine sous la souris (elle vit en dehors de la fiche).
  panel.addEventListener('pointermove', (e) => {
    const chip = e.target.closest('[data-filter-side]');
    if (chip) showChipTooltip(chip);
    else tooltip.hidden = true;
  });
  panel.addEventListener('pointerleave', () => { tooltip.hidden = true; });
}

const tooltip = Object.assign(document.createElement('div'), { id: 'chipTooltip', className: 'panel', hidden: true });
document.body.append(tooltip);

/** Familles d'items, d'après leur forme (voir data/items.js). */
const FAMILY = { ore: 'Minerai', ingot: 'Lingot', plate: 'Produit', wire: 'Produit' };
/** « l'envoyer à gauche », « tout droit », « à droite ». */
const toward = (dir, side) => ({ 'Tout droit': 'tout droit', Gauche: 'à gauche', Droite: 'à droite' })[sideName(dir, side)];

/** Nom de l'item, sa famille, et ce que fera le clic, au-dessus de l'icône survolée. */
function showChipTooltip(chip) {
  const b = shownFor;
  if (!b?.filters) return;
  const type = chip.dataset.item, side = Number(chip.dataset.filterSide);
  const chosen = filterFor(b.filters, b.dir, side).includes(type);
  const item = ITEMS[type];
  tooltip.innerHTML = `<b>${item.name}</b> <span class="ip-muted">· ${FAMILY[item.shape] ?? 'Item'}</span><br>`
    + `<small>clic : ${chosen ? 'ne plus l\'envoyer' : 'l\'envoyer'} ${toward(b.dir, side)}</small>`;
  tooltip.hidden = false;
  const r = chip.getBoundingClientRect();
  const w = tooltip.offsetWidth, h = tooltip.offsetHeight;
  tooltip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  tooltip.style.top = `${r.top - h - 6 < 8 ? r.bottom + 6 : r.top - h - 6}px`;
}

export function closeInfoPanel() {
  ui.selected = null;
  tooltip.hidden = true;
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
}

// ---------- Ce qu'on montre ----------

/**
 * Fiche d'un bâtiment, indépendante de l'affichage :
 *   { title, subtitle?, status: { label, tone: 'ok' | 'warn' | 'idle' }, sections: [{ label, aside?, html }] }
 */
function describe(b) {
  if (isConveyor(b)) return describeConveyor(b);
  return describeMachine(b);
}

function describeMachine(b) {
  const def = BUILDINGS[b.type];
  const outFull = b.outputs.length >= outputCapacity(b);

  let status = { label: 'En attente de matière', tone: 'idle' };
  if (b.kind === 'drill') status = b.working ? { label: 'En marche', tone: 'ok' } : { label: 'Sortie pleine', tone: 'warn' };
  else if (b.current) status = { label: 'En marche', tone: 'ok' };
  else if (outFull) status = { label: 'Sortie pleine', tone: 'warn' };

  const busy = b.kind === 'drill' ? b.working : !!b.current;
  const recipes = b.kind === 'drill' ? [[null, b.ore]] : Object.entries(def.recipes);
  const making = busy
    ? recipeHtml(b.kind === 'drill' ? null : b.currentInput, b.kind === 'drill' ? b.ore : b.current)
    : `<span class="ip-muted">Recettes : </span>${recipes.map(([f, t]) => recipeHtml(f, t)).join('<span class="ip-sep">·</span>')}`;

  const stocks = [];
  if (inputCapacity(b)) stocks.push(stockHtml('Entrée', b.inputs, inputCapacity(b)));
  if (outputCapacity(b)) stocks.push(stockHtml('Sortie', b.outputs, outputCapacity(b)));

  const { actual, max } = productionRate(b);
  return {
    title: def.name,
    status,
    sections: [
      { label: 'Fabrication', aside: `${decimal(def.time)} s par item`,
        html: `<div class="ip-row">${making}</div>${bar(busy ? b.progress : 0)}` },
      { label: 'Stock', html: stocks.join('') },
      { label: 'Cadence', html: rateHtml(actual, max) },
    ],
  };
}

function describeConveyor(b) {
  const flow = flowSummary(b);
  let status = { label: 'Vide', tone: 'idle' };
  if (b.stalled) status = { label: 'Bloqué', tone: 'warn' };
  else if (b.item) status = { label: 'En mouvement', tone: 'ok' };

  const sections = [
    { label: 'Dessus', html: `<div class="ip-row">${b.item ? `${icon(b.item.type)} ${ITEMS[b.item.type].name}` : '<span class="ip-muted">rien</span>'}</div>` },
    { label: 'Débit', html: rateHtml(flow.perMinute, BELT_MAX_PER_MINUTE) + gauge((flow.perMinute ?? 0) / BELT_MAX_PER_MINUTE) },
  ];
  if (flow.byItem.length > 1 || (flow.byItem.length === 1 && b.kind === 'belt')) {
    sections.push({ label: 'Par item', html: `<div class="ip-row ip-wrap">${flow.byItem
      .map((f) => `${icon(f.itemType)}<span>${perMinute(f.perMinute)} / min</span>`).join('<span class="ip-sep">·</span>')}</div>` });
  }
  if (b.priority) {
    // Splitter prioritaire : les sorties dans l'ordre, avec un bouton pour en faire monter une.
    const order = priorityOrder(b.dir, b.shape, b.priority);
    sections.push({ label: 'Priorités', aside: 'la n° 1 se remplit d\'abord', html: order.map((side, rank) => `
      <div class="ip-prio">
        <b class="rank-${rank + 1}">${rank + 1}</b>
        <span>${sideName(b.dir, side)}</span>
        <span class="ip-muted">${perMinute(flow.byOutput.get(side) ?? 0)} / min</span>
        ${rank > 0 ? `<button type="button" data-raise="${side}" title="Monter en priorité ${rank}">▲</button>` : '<span></span>'}
      </div>`).join('') });
  } else if (b.filters) {
    // Filtre : une rangée par sortie, avec une icône par item à allumer ou éteindre.
    const sides = splitterOutputs(b.dir, b.shape);
    sections.push({ label: 'Items par sortie', aside: 'sortie vide : le reste', html: sides.map((side) => {
      const chosen = filterFor(b.filters, b.dir, side);
      // Le nom de chaque item s'affiche au survol (voir showChipTooltip).
      const chips = Object.keys(ITEMS).map((type) => `
        <button type="button" class="ip-chip" data-filter-side="${side}" data-item="${type}"
          aria-pressed="${chosen.includes(type)}" aria-label="${ITEMS[type].name}"><img class="ip-item" src="${itemIconUrl(type)}" alt=""></button>`).join('');
      const names = chosen.length
        ? chosen.map((type) => ITEMS[type].name).join(' · ')
        : '<span class="ip-muted">Tout ce qui n\'est pas choisi ailleurs</span>';
      return `
        <div class="ip-filter">
          <div class="ip-filter-head">
            <span>${sideName(b.dir, side)}</span>
            <span class="ip-muted">${perMinute(flow.byOutput.get(side) ?? 0)} / min</span>
          </div>
          <div class="ip-chips">${chips}</div>
          <div class="ip-chosen">${names}</div>
        </div>`;
    }).join('') });
  } else if (b.kind === 'splitter') {
    const sides = splitterOutputs(b.dir, b.shape);
    sections.push({ label: 'Par sortie', html: `<div class="ip-row ip-wrap">${sides
      .map((side) => `<span class="ip-muted">${sideName(b.dir, side)}</span> <span>${perMinute(flow.byOutput.get(side) ?? 0)} / min</span>`)
      .join('<span class="ip-sep">·</span>')}</div>` });
  }

  if (b.kind === 'merger') {
    const sides = mergerInputs(b.dir, b.shape);
    sections.push({ label: 'Par entrée', html: `<div class="ip-row ip-wrap">${sides
      .map((side) => `<span class="ip-muted">${sideName(b.dir, side)}</span> <span>${perMinute(flow.byOutput.get(side) ?? 0)} / min</span>`)
      .join('<span class="ip-sep">·</span>')}</div>` });
  }

  let subtitle = null;
  if (b.kind === 'splitter') subtitle = `forme ${shapeById(b.shape).name}`;
  if (b.kind === 'merger') subtitle = `${mergerShapeById(b.shape).name} · ${mergerInputs(b.dir, b.shape).length} entrées`;
  return {
    title: BUILDINGS[b.type].name,
    subtitle,
    status,
    sections,
  };
}

/** Nom d'un côté par rapport au sens du flux (dir). */
function sideName(dir, side) {
  if (side === dir) return 'Tout droit';
  if (side === turnLeft(dir)) return 'Gauche';
  if (side === turnRight(dir)) return 'Droite';
  if (side === opposite(dir)) return 'Arrière';
  return '?';
}

// ---------- Petits morceaux de HTML ----------

const decimal = (n) => n.toFixed(1).replace('.', ',');
const perMinute = (n) => (n < 10 ? decimal(n) : String(Math.round(n)));
const icon = (type) => `<img class="ip-item" src="${itemIconUrl(type)}" alt="${ITEMS[type].name}" title="${ITEMS[type].name}">`;
const recipeHtml = (from, to) => `${from ? `${icon(from)}<span class="ip-sep">→</span>` : ''}${icon(to)}`;
const bar = (fraction) => `<div class="ip-bar"><i style="width:${Math.round(fraction * 100)}%"></i></div>`;
const gauge = (fraction) => `<div class="ip-gauge"><i style="width:${Math.round(Math.min(1, fraction) * 100)}%"></i></div>`;

function rateHtml(actual, max) {
  const value = actual === null ? '<span class="ip-muted">mesure…</span>' : `${perMinute(actual)} / min`;
  return `<div class="ip-rate"><b>${value}</b><span class="ip-muted">max ${perMinute(max)} / min</span></div>`;
}

/** Une ligne de stock : les items regroupés par type, le compte et une jauge. */
function stockHtml(label, list, capacity) {
  const counts = new Map();
  for (const type of list) counts.set(type, (counts.get(type) ?? 0) + 1);
  const items = counts.size
    ? [...counts].map(([type, n]) => `${icon(type)}<span>×${n}</span>`).join('')
    : '<span class="ip-muted">vide</span>';
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
      <button type="button" class="ip-close" aria-label="Fermer la fiche">×</button>
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

  const w = panel.offsetWidth, h = panel.offsetHeight;
  const below = top - h - GAP < 8;
  const left = Math.max(8, Math.min(innerWidth - w - 8, centerX - w / 2));
  panel.style.left = `${left}px`;
  panel.style.top = `${below ? bottom + GAP : top - h - GAP}px`;
  panel.classList.toggle('below', below);
  panel.style.setProperty('--arrow-x', `${Math.max(16, Math.min(w - 16, centerX - left))}px`);
}
