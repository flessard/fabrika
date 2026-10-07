// HUD : le niveau et la commande à livrer. Les réglages (son, langue, sauvegarde,
// multijoueur, aide) sont dans le menu Échap (voir ui/pauseMenu.js) ; ce module remplit
// encore leurs textes, et affiche coordonnées et messages.
import { MAP_H, MAP_W } from '../config.js';
import { on } from '../core/events.js';
import { LANGS, formatDate, getLang, itemName, setLang, t } from '../i18n/index.js';
import { savedInBrowser } from '../world/save.js';
import { net } from '../net/client.js';
import { game } from '../state.js';
import { LEVELS } from '../data/levels.js';
import { currentLevel, goalDone, goalProgress } from '../sim/levels.js';
import { itemIconUrl } from '../render/sprites/items.js';
import { ITEMS } from '../data/items.js';
import { stockOf } from '../world/inventory.js';
import { isMuted, toggleMute } from '../audio/engine.js';

const $ = (id) => document.getElementById(id);

export function initHud({ onSave, onLoad }) {
  $('saveGame').addEventListener('click', onSave);
  $('loadGame').addEventListener('click', onLoad);
  on('save:changed', showLoadState);
  on('net:changed', showLoadState);
  $('sound').addEventListener('click', toggleSound);
  for (const event of ['map:new', 'item:delivered', 'level:complete']) on(event, showOrder);

  const select = $('lang');
  for (const [code, { name }] of Object.entries(LANGS)) select.append(new Option(name, code));
  select.value = getLang();
  select.addEventListener('change', () => setLang(select.value));

  showTexts();
  on('lang:changed', showTexts);
}

/** Tous les textes du HUD et de la page, dans la langue actuelle. */
function showTexts() {
  applyPageTexts();
  showOrder();
  $('sound').title = t('hud.sound.title');
  $('lang').value = getLang();
  showSoundState();
  showLoadState();
  showCursorCell(null);
  if (game.map) showMapInfo();
}

/**
 * « Charger » n'est actif que s'il y a une partie sauvegardée, et dit de quand elle date.
 * Pendant une partie à plusieurs, pas de « Charger » : l'usine est commune.
 */
function showLoadState() {
  const saved = savedInBrowser();
  const online = net.status !== 'off';
  const load = $('loadGame');
  load.disabled = !saved || online;
  if (online) load.title = t('mp.notWhileOnline');
  else load.title = saved ? t('hud.load.title', { date: formatDate(saved.savedAt) }) : t('hud.load.none');
}

/** Textes fixes de la page : data-i18n (texte), data-i18n-html, data-i18n-title, data-i18n-aria. */
function applyPageTexts() {
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
}

export function showMapInfo() {
  $('seedLbl').textContent = t('hud.map', { seed: String(game.seed % 100000).padStart(5, '0') });
}

/**
 * La commande du niveau en cours : son nom, puis une ligne par ressource (icône, nom,
 * compte, barre), cochée quand elle est complète. Après le dernier niveau : partie libre.
 */
function showOrder() {
  const level = currentLevel();
  const n = Math.min(game.level + 1, LEVELS.length);
  $('boardLbl').textContent = level ? t('hud.board', { n }) : t('order.free.short');
  if (!level) {
    $('order').innerHTML = `<div class="order-done">${t('order.allDone')}</div>`;
    return;
  }
  const rows = level.goals.map((goal) => {
    const done = goalProgress(goal);
    return `
      <div class="order-row${goalDone(goal) ? ' done' : ''}">
        <img src="${itemIconUrl(goal.item)}" alt="">
        <span class="order-name">${itemName(goal.item)}</span>
        <b>${done}/${goal.count}</b>
        <div class="barbg"><i style="width:${(done / goal.count) * 100}%"></i></div>
      </div>`;
  });
  const complete = level.goals.filter(goalDone).length;
  $('order').innerHTML = `
    <div class="order-head"><span>${t(`level.${n}`)}</span><span>${complete}/${level.goals.length} ✓</span></div>
    ${rows.join('')}`;
}

let shownInventory = '';
/**
 * À chaque image : l'inventaire (icône et nombre de chaque objet de construction),
 * redessiné seulement s'il a changé. Un stock vide passe au rouge.
 */
export function updateInventory() {
  const items = Object.keys(ITEMS).filter((id) => ITEMS[id].stock);
  const key = `${items.map(stockOf).join(',')}|${t('hud.inventory')}`;
  if (key === shownInventory) return;
  shownInventory = key;
  $('inventory').innerHTML = `<span class="inv-label">${t('hud.inventory')}</span>${items.map((id) => `
    <span class="inv-item${stockOf(id) ? '' : ' empty'}" title="${itemName(id)}">
      <img src="${itemIconUrl(id)}" alt=""><b>${stockOf(id)}</b>
    </span>`).join('')}`;
}

export function showCursorCell(cell) {
  $('coords').textContent = cell ? `x ${cell.x} · y ${cell.y}` : t('hud.mapSize', { w: MAP_W, h: MAP_H });
}

export function toggleSound() {
  toggleMute();
  showSoundState();
}

function showSoundState() {
  const button = $('sound');
  button.textContent = t(isMuted() ? 'hud.sound.off' : 'hud.sound.on');
  button.setAttribute('aria-pressed', String(!isMuted()));
}

let toastTimer;
export function showToast(title, detail) {
  const toast = $('toast');
  toast.replaceChildren(title);
  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    toast.append(small);
  }
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}
