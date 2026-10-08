// Entrer dans une usine et en sortir.
//
// Entrer : bouton « Entrer » de la fiche de l'usine, ou double-clic sur l'usine avec
// l'outil Déplacer. La vue passe à son intérieur (une couche « in:<id> », voir
// world/interiors.js) et la caméra se cale sur ses 32 × 32 cases. Un bandeau en haut
// rappelle où l'on est et permet de ressortir (bouton, ou Échap).
//
// Sortir : on revient à la carte, là où regardait la caméra avant d'entrer.
import { INTERIOR_SIZE, factoryIdOf, interiorLayer, isInteriorLayer } from '../world/interiors.js';
import { buildingById } from '../world/buildings.js';
import { TILE } from '../config.js';
import { t } from '../i18n/index.js';
import { game, ui, view } from '../state.js';
import { centerOn } from '../input/camera.js';
import { switchLayer } from './toolbar.js';

const bar = document.getElementById('insideBar');

/** Où regardait la caméra avant d'entrer, pour y revenir en sortant. */
let before = null;

export function initFactoryView() {
  document.getElementById('insideExit').addEventListener('click', exitFactory);
}

export const isInsideFactory = () => isInteriorLayer(ui.layer);

/** L'usine dans laquelle on est, ou null. */
export const currentFactory = () => (isInsideFactory() ? buildingById(factoryIdOf(ui.layer)) : null);

export function enterFactory(factory) {
  if (factory?.kind !== 'factory' || isInsideFactory()) return;
  before = { camX: view.camX, camY: view.camY, layer: ui.layer };
  switchLayer(interiorLayer(factory));
  centerOn((INTERIOR_SIZE * TILE) / 2, (INTERIOR_SIZE * TILE) / 2);
  showBar(factory);
}

export function exitFactory() {
  if (!isInsideFactory()) return;
  switchLayer(before?.layer === 'under' ? 'under' : 'surface');
  if (before) {
    view.camX = before.camX;
    view.camY = before.camY;
  }
  before = null;
  bar.hidden = true;
}

function showBar(factory) {
  document.getElementById('insideTitle').textContent = t('inside.title', { n: factoryNumber(factory) });
  bar.hidden = false;
}

/** Numéro d'une usine (1, 2, 3…) dans l'ordre où elles ont été posées. */
export function factoryNumber(factory) {
  return game.buildings.filter((b) => b.kind === 'factory' && b.id <= factory.id).length;
}

/** À chaque image : si l'usine où l'on est a disparu (effacée par un autre joueur…), on ressort. */
export function updateFactoryView() {
  if (isInsideFactory() && !currentFactory()) exitFactory();
}
