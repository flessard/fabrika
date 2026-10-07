// HUD : objectif du tableau, numéro de carte, coordonnées, messages, langue.
import { MAP_H, MAP_W } from '../config.js';
import { on } from '../core/events.js';
import { LANGS, getLang, itemPlural, setLang, t } from '../i18n/index.js';
import { game } from '../state.js';
import { GOAL, goalProgress } from '../sim/goal.js';
import { itemSprite } from '../render/sprites/items.js';
import { isMuted, toggleMute } from '../audio/engine.js';

const $ = (id) => document.getElementById(id);

export function initHud({ onNewMap }) {
  $('reroll').addEventListener('click', onNewMap);
  $('sound').addEventListener('click', toggleSound);
  $('goalIcon').getContext('2d').drawImage(itemSprite(GOAL.item), 0, 0);

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
  $('boardLbl').textContent = t('hud.board', { n: 1 });
  $('goalLabel').textContent = t('hud.goal', { count: GOAL.count, items: itemPlural(GOAL.item) });
  $('sound').title = t('hud.sound.title');
  $('lang').value = getLang();
  showSoundState();
  showCursorCell(null);
  if (game.map) showMapInfo();
}

/** Textes fixes de la page : data-i18n (texte), data-i18n-html, data-i18n-title, data-i18n-aria. */
function applyPageTexts() {
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}

export function showMapInfo() {
  $('seedLbl').textContent = t('hud.map', { seed: String(game.seed % 100000).padStart(5, '0') });
}

export function updateGoalDisplay() {
  const done = goalProgress();
  $('goalNum').textContent = `${done}/${GOAL.count}`;
  $('goalFill').style.width = `${(done / GOAL.count) * 100}%`;
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
  const small = document.createElement('small');
  small.textContent = detail;
  toast.append(small);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}
