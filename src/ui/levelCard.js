// Carte de niveau : la commande à livrer, en grand, avec l'icône et la quantité de chaque
// ressource. Elle s'affiche au début d'une partie, et après chaque niveau réussi (avec
// la commande suivante). Elle ne met pas le jeu en pause : en multijoueur, l'usine
// continue chez tout le monde.
import { on } from '../core/events.js';
import { LEVELS } from '../data/levels.js';
import { itemName, t } from '../i18n/index.js';
import { itemIconUrl } from '../render/sprites/items.js';
import { currentLevel } from '../sim/levels.js';
import { game, ui } from '../state.js';
import { playSound } from '../audio/sounds.js';

const card = document.getElementById('levelCard');

export function initLevelCard() {
  card.addEventListener('pointerdown', (e) => e.stopPropagation());
  // Comme la fiche d'un bâtiment : un clic n'importe où ailleurs la referme.
  addEventListener('pointerdown', (e) => { if (!card.hidden && !card.contains(e.target)) closeLevelCard(); }, true);
  card.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeLevelCard(); });
  on('level:complete', ({ level }) => {
    if (ui.screen === 'title') return; // l'usine de démonstration du menu ne fête rien
    playSound('goal');
    showLevelCard({ completed: level });
  });
  on('map:new', closeLevelCard);
}

export function closeLevelCard() {
  card.hidden = true;
}

export const isLevelCardOpen = () => !card.hidden;

/**
 * Montre la commande du niveau en cours. `completed` : le numéro (0 = premier) du niveau
 * qui vient d'être réussi, pour le féliciter avant d'annoncer la suite.
 */
export function showLevelCard({ completed = null } = {}) {
  const level = currentLevel();
  const n = game.level + 1;
  const parts = [];
  if (completed !== null) parts.push(`<div class="lc-done">${t('levelCard.done', { n: completed + 1 })}</div>`);

  if (level) {
    parts.push(`
      <div class="lc-kicker">${completed !== null ? t('levelCard.next') : t('levelCard.order')}</div>
      <div class="lc-title">${t('levelCard.level', { n, total: LEVELS.length })}<b>${t(`level.${n}`)}</b></div>
      <div class="lc-goals">${level.goals.map((goal) => `
        <div class="lc-goal">
          <img src="${itemIconUrl(goal.item)}" alt="">
          <b>× ${goal.count}</b>
          <span>${itemName(goal.item)}</span>
        </div>`).join('')}
      </div>
      <p class="lc-hint">${t('levelCard.hint')}</p>`);
  } else {
    parts.push(`
      <div class="lc-title"><b>${t('levelCard.allDone')}</b></div>
      <p class="lc-hint">${t('levelCard.allDone.detail')}</p>`);
  }
  parts.push(`<button type="button" class="title-btn primary lc-go" data-close>${t(completed !== null ? 'levelCard.continue' : 'levelCard.go')}</button>`);
  card.innerHTML = parts.join('');
  card.hidden = false;
  card.querySelector('.lc-go').focus();
}
