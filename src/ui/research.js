// Fenêtre de l'arbre de recherche (touche K, ou le bouton « Recherche » du HUD, ou un
// outil encore verrouillé de la palette).
//
// L'arbre se lit de gauche à droite : chaque bâtiment, avec ce qu'il coûte en items
// livrés au dépôt, et des traits vers ce qu'il permet de débloquer ensuite. Cliquer sur
// un bâtiment prêt envoie la commande `research` (voir sim/commands.js). La fenêtre ne
// met pas le jeu en pause : l'usine continue de livrer pendant qu'on choisit.
import { on } from '../core/events.js';
import { RESEARCH } from '../data/research.js';
import { itemName, t, toolName } from '../i18n/index.js';
import { itemIconUrl } from '../render/sprites/items.js';
import { issue } from '../sim/commands.js';
import { creditOf, missingRequirements, researchProblem, researchReady } from '../sim/research.js';
import { game, ui } from '../state.js';
import { playSound } from '../audio/sounds.js';
import { showToast } from './hud.js';
import { toolIconUrl } from './toolbar.js';

const $ = (id) => document.getElementById(id);
const overlay = $('research');
const tree = $('rsTree');

/** Nœuds déjà annoncés comme prêts (un message par nœud et par partie). */
let announced = new Set();
let dirty = false;

export function initResearch() {
  $('researchButton').addEventListener('click', () => openResearch());
  $('rsClose').addEventListener('click', closeResearch);
  overlay.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.target === overlay) return closeResearch(); // un clic à côté referme
    const node = e.target.closest('[data-research]');
    if (!node) return;
    const problem = researchProblem(node.dataset.research);
    if (problem) {
      playSound('deny');
      node.classList.remove('shake');
      void node.offsetWidth; // relance l'animation
      node.classList.add('shake');
      return;
    }
    issue({ type: 'research', id: node.dataset.research });
  });
  overlay.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

  on('item:delivered', () => { dirty = true; });
  on('research:done', ({ id }) => {
    dirty = true;
    if (ui.screen === 'game') showToast(t('research.done', { name: toolName(id) }), t('research.done.detail'));
  });
  on('map:new', () => {
    // Une partie chargée ne réannonce pas ce qui était déjà prêt.
    announced = new Set(researchReady().map((node) => node.id));
    dirty = true;
  });
  on('lang:changed', () => { dirty = true; });
  dirty = true;
}

export const isResearchOpen = () => !overlay.hidden;

/** Ouvre la fenêtre ; `focus` : un outil à mettre en évidence (ex. celui qu'on vient d'essayer). */
export function openResearch(focus = null) {
  if (ui.screen !== 'game') return;
  playSound('click');
  overlay.hidden = false;
  render();
  if (focus) tree.querySelector(`[data-research="${focus}"]`)?.classList.add('focus');
}

export function closeResearch() {
  overlay.hidden = true;
}

export function toggleResearch() {
  if (isResearchOpen()) closeResearch();
  else openResearch();
}

/** À chaque image : le badge du bouton, les annonces, et la fenêtre si elle est ouverte. */
export function updateResearch() {
  if (!dirty || ui.screen === 'title') return;
  dirty = false;
  const ready = researchReady();
  const badge = $('researchBadge');
  badge.textContent = ready.length;
  badge.hidden = !ready.length;
  for (const node of ready) {
    if (announced.has(node.id)) continue;
    announced.add(node.id);
    showToast(t('research.ready', { name: toolName(node.id) }), t('research.ready.detail'));
  }
  if (isResearchOpen()) render();
}

// ---------- Dessin de l'arbre ----------

function render() {
  const focused = tree.querySelector('.focus')?.dataset.research;
  $('rsBank').innerHTML = bankHtml();
  tree.innerHTML = `<svg class="rs-links" aria-hidden="true"></svg>${RESEARCH.map(nodeHtml).join('')}`;
  if (focused) tree.querySelector(`[data-research="${focused}"]`)?.classList.add('focus');
  drawLinks();
}

/** Les items livrés qu'on peut dépenser. */
function bankHtml() {
  const items = Object.keys(game.credits).filter((item) => creditOf(item) > 0);
  const chips = items.map((item) => `<span class="rs-cost" title="${itemName(item)}"><img src="${itemIconUrl(item)}" alt="">${creditOf(item)}</span>`);
  return `<span class="ip-muted">${t('research.bank')}</span>${chips.join('') || `<span class="ip-muted">${t('research.bank.empty')}</span>`}`;
}

function stateOf(node) {
  if (game.unlocked.includes(node.id)) return 'done';
  if (missingRequirements(node).length) return 'blocked';
  return researchProblem(node.id) ? 'waiting' : 'ready';
}

function nodeHtml(node) {
  const state = stateOf(node);
  let detail;
  if (state === 'done') detail = `<span class="rs-state">${t(node.start ? 'research.start' : 'research.unlocked')}</span>`;
  else if (state === 'blocked') detail = `<span class="rs-state">${t('research.requires', { names: missingRequirements(node).map(toolName).join(', ') })}</span>`;
  else {
    detail = Object.entries(node.cost).map(([item, n]) => {
      const have = Math.min(n, creditOf(item));
      return `<span class="rs-cost ${have >= n ? 'ok' : ''}" title="${itemName(item)}"><img src="${itemIconUrl(item)}" alt="">${have}/${n}</span>`;
    }).join('');
  }
  const action = state === 'ready' ? `<span class="rs-go">${t('research.unlock')}</span>` : '';
  return `
    <button type="button" class="rs-node ${state}" data-research="${node.id}" style="grid-column:${node.col + 1};grid-row:${node.row + 1}"
      title="${researchProblem(node.id) && state !== 'done' ? researchProblem(node.id) : ''}">
      <img class="rs-icon" src="${toolIconUrl(node.id)}" alt="">
      <span class="rs-text">
        <b>${toolName(node.id)}</b>
        <span class="rs-detail">${detail}</span>
        ${action}
      </span>
    </button>`;
}

/** Un trait de chaque nœud vers ceux qu'il débloque : du bord droit au bord gauche, en coude. */
function drawLinks() {
  const svg = tree.querySelector('.rs-links');
  const box = (id) => tree.querySelector(`[data-research="${id}"]`);
  svg.setAttribute('width', tree.scrollWidth);
  svg.setAttribute('height', tree.scrollHeight);
  const paths = [];
  for (const node of RESEARCH) {
    for (const parentId of node.requires ?? []) {
      const from = box(parentId), to = box(node.id);
      const x1 = from.offsetLeft + from.offsetWidth, y1 = from.offsetTop + from.offsetHeight / 2;
      const x2 = to.offsetLeft, y2 = to.offsetTop + to.offsetHeight / 2;
      const mid = Math.round((x1 + x2) / 2);
      const lit = game.unlocked.includes(parentId);
      paths.push(`<path class="${lit ? 'lit' : ''} ${game.unlocked.includes(node.id) ? 'done' : ''}" d="M${x1} ${y1} H${mid} V${y2} H${x2}"/>`);
    }
  }
  svg.innerHTML = paths.join('');
}
