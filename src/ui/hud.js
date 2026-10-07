// HUD : objectif du tableau, numéro de carte, coordonnées, messages.
import { MAP_H, MAP_W } from '../config.js';
import { ITEMS } from '../data/items.js';
import { game } from '../state.js';
import { GOAL, goalProgress } from '../sim/goal.js';
import { itemSprite } from '../render/sprites/items.js';

const $ = (id) => document.getElementById(id);

export function initHud({ onNewMap }) {
  $('reroll').addEventListener('click', onNewMap);
  $('goalIcon').getContext('2d').drawImage(itemSprite(GOAL.item), 0, 0);
  $('goalLabel').textContent = `Livrer ${GOAL.count} ${ITEMS[GOAL.item].plural}`;
}

export function showMapInfo() {
  $('seedLbl').textContent = `Carte #${String(game.seed % 100000).padStart(5, '0')}`;
}

export function updateGoalDisplay() {
  const done = goalProgress();
  $('goalNum').textContent = `${done}/${GOAL.count}`;
  $('goalFill').style.width = `${(done / GOAL.count) * 100}%`;
}

export function showCursorCell(cell) {
  $('coords').textContent = cell ? `x ${cell.x} · y ${cell.y}` : `${MAP_W} × ${MAP_H} cases`;
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
