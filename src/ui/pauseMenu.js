// Menu Échap : tout ce qui n'a pas besoin d'être à l'écran pendant qu'on joue.
// Reprendre, sauvegarder et charger, le son, la langue, le multijoueur, l'aide, et le
// retour à l'écran titre. (Les boutons eux-mêmes sont branchés par ui/hud.js et
// ui/multiplayer.js ; ce module ouvre, ferme et change de page.)
//
// Échap ouvre ce menu quand il n'y a plus rien à annuler en jeu (voir input/controls.js),
// et le referme. En solo, le jeu est en pause pendant qu'il est ouvert ; en multijoueur,
// l'usine continue : elle est commune.
import { on } from '../core/events.js';
import { ui } from '../state.js';
import { playSound } from '../audio/sounds.js';
import { closeLevelCard } from './levelCard.js';
import { closeResearch } from './research.js';
import { openTitle } from './title.js';

const $ = (id) => document.getElementById(id);

export function initPauseMenu() {
  $('menuButton').addEventListener('click', openPause);
  $('pResume').addEventListener('click', closePause);
  $('pHelp').addEventListener('click', () => showPage('help'));
  $('pBack').addEventListener('click', () => showPage('main'));
  $('pTitle').addEventListener('click', () => {
    closePause();
    openTitle();
  });
  // Un clic à côté du menu le referme.
  $('pause').addEventListener('pointerdown', (e) => { if (e.target === $('pause')) closePause(); });
  addEventListener('keydown', (e) => {
    // L'appui sur Échap qui vient d'ouvrir le menu ne doit pas le refermer.
    if (ui.screen !== 'pause' || e.key !== 'Escape' || e === openingEvent) return;
    e.preventDefault(); // déjà traitée : les contrôles du jeu ne doivent pas la reprendre
    if (!$('pauseHelp').hidden) showPage('main');
    else closePause();
  });
  // Une partie chargée depuis le menu : on y retourne tout de suite.
  on('map:new', () => { if (ui.screen === 'pause') closePause(); });
}

/** L'événement clavier qui a ouvert le menu, s'il y en a un. */
let openingEvent = null;

export function openPause(event = null) {
  if (ui.screen !== 'game') return;
  openingEvent = event;
  playSound('click');
  closeLevelCard();
  closeResearch();
  ui.screen = 'pause';
  ui.hover = null;
  document.body.classList.add('paused');
  $('pause').hidden = false;
  showPage('main');
}

export function closePause() {
  if (ui.screen !== 'pause') return;
  ui.screen = 'game';
  document.body.classList.remove('paused');
  $('pause').hidden = true;
}

function showPage(page) {
  $('pauseMain').hidden = page !== 'main';
  $('pauseHelp').hidden = page !== 'help';
  (page === 'main' ? $('pResume') : $('pBack')).focus();
}
