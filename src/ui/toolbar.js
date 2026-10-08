// Palette d'outils en bas de l'écran.
import { RIGHT, turnRight } from '../core/grid.js';
import { TOOLS, isBuildTool, toolWorksOn } from '../data/buildings.js';
import { PALETTE as P } from '../data/palette.js';
import { ui } from '../state.js';
import { playSound } from '../audio/sounds.js';
import { currentCtx, makeCanvas, rect } from '../render/pen.js';
import { drawBelt, drawFilter, drawMerger, drawSmartSplitter, drawSplitter, drawTunnel, drawUnderBelt } from '../render/sprites/belts.js';
import { machineSprite } from '../render/sprites/machines.js';
import { cancelPlacing, clearSelection, rotatePlacing } from '../input/selection.js';
import { on } from '../core/events.js';
import { t, toolName } from '../i18n/index.js';
import { stockOf } from '../world/inventory.js';
import { toolUnlocked } from '../sim/research.js';
import { openResearch } from './research.js';

let gameCanvas = null;

/** Icônes 32 × 32 de la palette. */
const ICONS = {
  hand: () => {
    // Flèches dans les 4 directions
    rect(15, 6, 2, 20, P.cream);
    rect(6, 15, 20, 2, P.cream);
    for (let i = 0; i < 4; i++) {
      rect(15 - i, 6 + i, 2 + i * 2, 1, P.cream);
      rect(15 - i, 25 - i, 2 + i * 2, 1, P.cream);
      rect(6 + i, 15 - i, 1, 2 + i * 2, P.cream);
      rect(25 - i, 15 - i, 1, 2 + i * 2, P.cream);
    }
  },
  erase: () => {
    for (let i = 0; i < 10; i++) {
      rect(6 + i, 18 - i, 8, 1, P.black);
      rect(7 + i, 17 - i, 6, 1, i < 4 ? P.salmon : P.mist);
    }
    rect(6, 24, 20, 1, P.steel);
  },
  select: () => {
    // Cadre en pointillés et flèche de souris
    for (let i = 0; i < 20; i += 4) {
      rect(5 + i, 5, 2, 1, P.cream);
      rect(5 + i, 22, 2, 1, P.cream);
      rect(5, 5 + i, 1, 2, P.cream);
      rect(24, 5 + i, 1, 2, P.cream);
    }
    for (let i = 0; i < 8; i++) {
      rect(15, 13 + i, i + 2, 1, P.black);
      rect(16, 14 + i, i, 1, P.amber);
    }
    rect(18, 21, 3, 5, P.black);
    rect(19, 21, 1, 4, P.amber);
  },
  rotate: () => {
    for (let a = 0; a < 5.2; a += 0.12) rect(Math.round(16 + Math.cos(a) * 9), Math.round(16 + Math.sin(a) * 9), 2, 2, P.cream);
    rect(23, 8, 5, 2, P.cream);
    rect(26, 8, 2, 5, P.cream);
  },
  belt: () => scaled2(() => drawBelt(0, 0, RIGHT, [RIGHT, 2], 0)),
  dump: () => scaled2(() => currentCtx().drawImage(machineSprite('dump'), 0, 0)),
  splitter: () => scaled2(() => drawSplitter(0, 0, RIGHT, 'T', 0)),
  smartSplitter: () => scaled2(() => drawSmartSplitter(0, 0, RIGHT, 'YR', ['F', 'L', 'R'], 0)),
  merger: () => scaled2(() => drawMerger(0, 0, RIGHT, '+', 0)),
  filter: () => scaled2(() => drawFilter(0, 0, RIGHT, 'T', { F: [], L: ['coal'], R: ['fe_ore'] }, 0)),
  tunnel: () => scaled2(() => drawTunnel(0, 0, RIGHT, 'in', 0)),
  layer: () => {
    // Coupe du terrain : herbe, terre, et un tapis souterrain dedans
    rect(2, 6, 28, 22, P.black);
    rect(3, 7, 26, 4, P.leaf);
    rect(3, 7, 26, 1, P.lime);
    rect(3, 11, 26, 16, P.bark);
    for (const [x, y] of [[6, 14], [22, 13], [12, 24], [26, 23]]) rect(x, y, 2, 1, P.soot);
    scaled2(() => {
      currentCtx().translate(0.5, 4.5);
      drawUnderBelt(0, 0, RIGHT, [RIGHT, 2], 0);
    });
  },
};

/** Dessine un sprite de 16 px agrandi ×2 pour remplir l'icône. */
function scaled2(draw) {
  const ctx = currentCtx();
  ctx.save();
  ctx.scale(2, 2);
  draw();
  ctx.restore();
}

const iconFor = (id) => makeCanvas(32, 32, (ctx) => (ICONS[id] ? ICONS[id]() : ctx.drawImage(machineSprite(id), 0, 0)));

const iconUrls = new Map();
/** L'icône d'un outil en image (pour l'arbre de recherche). */
export function toolIconUrl(id) {
  if (!iconUrls.has(id)) iconUrls.set(id, iconFor(id).toDataURL());
  return iconUrls.get(id);
}

/** Petit cadenas 9 × 10, posé sur les outils pas encore débloqués. */
function lockIcon() {
  return makeCanvas(9, 10, () => {
    rect(1, 0, 7, 6, P.black);
    rect(2, 1, 5, 4, P.steel);
    rect(3, 2, 3, 3, P.black);
    rect(0, 4, 9, 6, P.black);
    rect(1, 5, 7, 4, P.amber);
    rect(1, 5, 7, 1, P.yellow);
    rect(4, 6, 1, 2, P.black);
  }).toDataURL();
}

// ---------- Organisation de la palette ----------
//
// La barre ne montre que l'essentiel : les trois modes (Déplacer, Sélection, Gomme), le
// Tapis (l'outil le plus utilisé, avec son stock), puis trois familles de bâtiments.
// Une famille est un seul bouton, qui montre son dernier outil choisi : un clic ouvre un
// petit plateau au-dessus avec tous ses bâtiments ; sa touche passe au suivant.
// Tourner n'apparaît que quand on tient un bâtiment ; Sous-sol reste au bout.

/** Boutons simples, avec leur chiffre. */
const SLOTS = [
  { id: 'hand', key: '1' },
  { id: 'select', key: '2' },
  { id: 'erase', key: '3' },
  { id: 'belt', key: '4', separatorBefore: true },
];

/** Familles de bâtiments (l'ordre du plateau est celui de la liste). */
const GROUPS = [
  { id: 'logistics', key: '5', tools: ['splitter', 'smartSplitter', 'filter', 'merger', 'tunnel'] },
  { id: 'production', key: '6', tools: ['drill', 'furnace', 'press', 'assembler'] },
  { id: 'storage', key: '7', tools: ['container', 'dump'] },
];

const groupOf = (toolId) => GROUPS.find((g) => g.tools.includes(toolId)) ?? null;
const letterOf = (toolId) => TOOLS.find((tool) => tool.id === toolId)?.key ?? '';
const usable = (toolId) => toolUnlocked(toolId) && toolWorksOn(toolId, ui.layer);

/** Dernier outil choisi dans chaque famille : c'est lui que montre son bouton. */
const lastInGroup = Object.fromEntries(GROUPS.map((g) => [g.id, g.tools[0]]));

function toolButton({ id, label, key, onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tool';
  button.id = `tool-${id}`;
  const kbd = document.createElement('kbd');
  kbd.textContent = key;
  const icon = new Image();
  icon.src = toolIconUrl(id);
  icon.alt = '';
  const name = document.createElement('span');
  name.className = 'tool-name';
  name.dataset.toolName = id;
  name.textContent = label;
  button.append(kbd, icon, name);
  button.addEventListener('click', onClick);
  return button;
}

const separator = () => Object.assign(document.createElement('div'), { className: 'sep' });

export function buildToolbar(canvas) {
  gameCanvas = canvas;
  const bar = document.getElementById('bar');

  for (const slot of SLOTS) {
    if (slot.separatorBefore) bar.append(separator());
    const button = toolButton({ id: slot.id, label: toolName(slot.id), key: slot.key, onClick: () => setTool(slot.id) });
    button.dataset.tool = slot.id;
    bar.append(button);
  }
  // Le bouton Tapis montre combien il en reste en stock.
  const count = document.createElement('i');
  count.className = 'tool-count';
  bar.querySelector('#tool-belt').append(count);

  for (const group of GROUPS) bar.append(groupButton(group));

  bar.append(separator());
  const rotate = toolButton({ id: 'rotate', label: toolName('rotate'), key: 'R', onClick: () => {
    if (ui.placing) rotatePlacing();
    else ui.dir = turnRight(ui.dir);
  } });
  // Seulement quand on tient un bâtiment (voir updateToolCounts). Sa place reste
  // réservée : la barre, centrée, ne bouge pas quand il apparaît.
  rotate.classList.add('idle');
  bar.append(rotate);
  const layerButton = toolButton({ id: 'layer', label: toolName('layer'), key: 'U', onClick: toggleLayer });
  layerButton.setAttribute('aria-pressed', 'false');
  bar.append(layerButton);

  // Un clic ailleurs referme le plateau ouvert.
  addEventListener('pointerdown', (e) => { if (!e.target.closest('.tool-group')) closeTray(); }, true);

  on('lang:changed', () => {
    for (const span of bar.querySelectorAll('[data-tool-name]')) span.textContent = toolName(span.dataset.toolName);
    for (const span of bar.querySelectorAll('[data-group-name]')) span.textContent = t(`group.${span.dataset.groupName}`);
  });

  bar.style.setProperty('--lock-icon', `url(${lockIcon()})`);
  on('map:new', showLocks);
  on('research:done', showLocks);
  showLocks();
}

/** Bouton d'une famille, avec son plateau (caché) au-dessus. */
function groupButton(group) {
  const wrap = document.createElement('div');
  wrap.className = 'tool-group';
  wrap.dataset.group = group.id;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tool group-btn';
  button.title = t('toolbar.group.title', { key: group.key });
  const kbd = document.createElement('kbd');
  kbd.textContent = group.key;
  const icon = new Image();
  icon.alt = '';
  icon.className = 'group-icon';
  const name = document.createElement('span');
  name.dataset.groupName = group.id;
  name.textContent = t(`group.${group.id}`);
  const caret = document.createElement('i');
  caret.className = 'group-caret';
  button.append(kbd, icon, name, caret);
  button.addEventListener('click', () => (openTray === group.id ? closeTray() : showTray(group.id)));

  const tray = document.createElement('div');
  tray.className = 'tray panel';
  tray.hidden = true;
  for (const toolId of group.tools) {
    const tile = toolButton({ id: toolId, label: toolName(toolId), key: letterOf(toolId), onClick: () => {
      setTool(toolId);
      closeTray();
    } });
    tile.dataset.tool = toolId;
    tray.append(tile);
  }

  wrap.append(tray, button);
  return wrap;
}

let openTray = null;
let trayTimer = null;

/** Ouvre le plateau d'une famille ; `briefly` : il se referme seul (choix au clavier). */
function showTray(groupId, { briefly = false } = {}) {
  clearTimeout(trayTimer);
  if (openTray !== groupId) playSound('click');
  openTray = groupId;
  for (const wrap of document.querySelectorAll('.tool-group')) {
    wrap.querySelector('.tray').hidden = wrap.dataset.group !== groupId;
    wrap.classList.toggle('open', wrap.dataset.group === groupId);
  }
  if (briefly) trayTimer = setTimeout(closeTray, 1400);
}

export function closeTray() {
  clearTimeout(trayTimer);
  openTray = null;
  for (const wrap of document.querySelectorAll('.tool-group')) {
    wrap.querySelector('.tray').hidden = true;
    wrap.classList.remove('open');
  }
}

export const isTrayOpen = () => openTray !== null;

/** Le bouton de chaque famille : l'icône de son dernier outil, enfoncé si on tient un de ses outils. */
function showGroups() {
  for (const group of GROUPS) {
    const wrap = document.querySelector(`.tool-group[data-group="${group.id}"]`);
    const button = wrap.querySelector('.group-btn');
    button.querySelector('.group-icon').src = toolIconUrl(lastInGroup[group.id]);
    button.setAttribute('aria-pressed', String(group.tools.includes(ui.tool)));
    button.classList.toggle('unavailable', !group.tools.some((id) => toolWorksOn(id, ui.layer)));
    button.classList.toggle('locked', !group.tools.some(toolUnlocked));
  }
}

/** Les outils pas encore débloqués sont grisés, avec un cadenas ; un clic ouvre l'arbre. */
function showLocks() {
  for (const button of document.querySelectorAll('.tool[data-tool]')) {
    const locked = !toolUnlocked(button.dataset.tool);
    button.classList.toggle('locked', locked);
    button.title = locked ? t('research.locked.title') : '';
  }
  // Une famille ne montre pas un outil verrouillé s'il y en a un autre de disponible.
  for (const group of GROUPS) {
    if (!toolUnlocked(lastInGroup[group.id])) lastInGroup[group.id] = group.tools.find(toolUnlocked) ?? group.tools[0];
  }
  if (!toolUnlocked(ui.tool)) setTool('hand');
  showGroups();
}

/**
 * U : passe de la surface au sous-sol et inversement. Au sous-sol, la surface
 * s'assombrit et seuls les outils qui y servent restent actifs.
 */
export function toggleLayer() {
  playSound('click');
  cancelPlacing();
  clearSelection();
  closeTray();
  ui.selected = null;
  ui.layer = ui.layer === 'surface' ? 'under' : 'surface';
  document.body.classList.toggle('underground', ui.layer === 'under');
  document.getElementById('tool-layer').setAttribute('aria-pressed', String(ui.layer === 'under'));
  for (const button of document.querySelectorAll('.tool[data-tool]')) {
    button.classList.toggle('unavailable', !toolWorksOn(button.dataset.tool, ui.layer));
  }
  if (!toolWorksOn(ui.tool, ui.layer)) setTool('hand');
  showGroups();
}

export function setTool(id) {
  if (!toolUnlocked(id)) {
    playSound('deny');
    openResearch(id);
    return;
  }
  if (!toolWorksOn(id, ui.layer)) {
    playSound('deny');
    return;
  }
  if (ui.tool !== id) {
    playSound('click');
    // Changer d'outil abandonne le groupe en cours ; seul Sélection garde la sélection.
    cancelPlacing();
    if (id !== 'select') clearSelection();
  }
  ui.tool = id;
  const group = groupOf(id);
  if (group) lastInGroup[group.id] = id;
  for (const button of document.querySelectorAll('.tool[data-tool]')) {
    button.setAttribute('aria-pressed', String(button.dataset.tool === id));
  }
  showGroups();
  gameCanvas.classList.toggle('build', id !== 'hand');
}

let shownCount = -1;
/** À chaque image : le stock de tapis sur le bouton Tapis, et Tourner seulement quand il sert. */
export function updateToolCounts() {
  document.getElementById('tool-rotate').classList.toggle('idle', !(ui.placing || isBuildTool(ui.tool)));
  const n = stockOf('belt');
  if (n === shownCount) return;
  shownCount = n;
  const badge = document.querySelector('#tool-belt .tool-count');
  badge.textContent = n;
  badge.classList.toggle('empty', n === 0);
}

/**
 * Chiffres : 1 à 4 les boutons simples ; 5 à 7 une famille. Une famille prend d'abord
 * son dernier outil ; rappuyer passe au suivant (en sautant ceux qu'on ne peut pas
 * utiliser), et son plateau s'affiche un instant pour montrer où on en est.
 */
export function selectToolByNumber(n) {
  const key = String(n);
  const slot = SLOTS.find((s) => s.key === key);
  if (slot) return setTool(slot.id);
  const group = GROUPS.find((g) => g.key === key);
  if (!group) return;
  const choices = group.tools.filter(usable);
  if (!choices.length) {
    playSound('deny');
    return showTray(group.id, { briefly: true });
  }
  const current = group.tools.includes(ui.tool) ? choices.indexOf(ui.tool) : -1;
  const next = current < 0
    ? (choices.includes(lastInGroup[group.id]) ? lastInGroup[group.id] : choices[0])
    : choices[(current + 1) % choices.length];
  setTool(next);
  showTray(group.id, { briefly: true });
}

/** Choisit un outil par sa lettre (ex. T pour Tunnel). Retourne vrai s'il y en a un. */
export function selectToolByKey(key) {
  const tool = TOOLS.find((t) => t.key?.toLowerCase() === key);
  if (!tool) return false;
  if (toolWorksOn(tool.id, ui.layer)) setTool(tool.id);
  return true;
}
