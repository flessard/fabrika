// Souris, trackpad, tactile et clavier → actions du jeu.
import { MAP_H, MAP_W, PAN_SPEED, TILE } from '../config.js';
import { inBounds } from '../core/grid.js';
import { isInteriorLayer, layerInBounds } from '../world/interiors.js';
import { hasInfoPanel } from '../data/buildings.js';
import { ui, view } from '../state.js';
import { buildingAt } from '../world/buildings.js';
import { showCursorCell } from '../ui/hud.js';
import { closeTray, isTrayOpen, selectToolByKey, selectToolByNumber, setTool, toggleLayer } from '../ui/toolbar.js';
import {
  buildAt, cancelBeltPlan, commitBeltPlan, eraseAt, extendBeltPlan, powerAction, priorityAction, rotateAction, shapeAction, startBeltPlan,
} from './actions.js';
import {
  cancelPlacing, clearSelection, eraseSelection, extendSelectBox, finishSelectBox, placeGroupAt,
  rotatePlacing, startCopy, startMove, startSelectBox, togglePowerSelection,
} from './selection.js';
import { cellFromEvent, clampCamera, panBy, setZoom, worldFromEvent, zoomByWheel } from './camera.js';
import { unlockAudio } from '../audio/engine.js';
import { toggleSound } from '../ui/hud.js';
import { openPause } from '../ui/pauseMenu.js';
import { closeLevelCard, isLevelCardOpen } from '../ui/levelCard.js';
import { closeResearch, isResearchOpen, toggleResearch } from '../ui/research.js';
import { closeInventory, isInventoryOpen } from '../ui/inventoryWindow.js';
import { enterFactory, exitFactory, isInsideFactory } from '../ui/factoryView.js';

/** Touches enfoncées en ce moment (en minuscules ; ' ' pour la barre d'espace). */
const keysDown = new Set();

/**
 * Glisser en cours :
 *   { mode: 'pan', x, y }            déplacer la carte
 *   { mode: 'erase' }                effacer en glissant (clic droit)
 *   { mode: 'build', last }          construire en glissant (tracé de tapis : voir ui.beltPlan)
 *   { mode: 'select' }               encadrer des bâtiments (outil Sélection, ou Maj + glisser)
 *   { mode: 'place' }                le groupe déplacé ou copié vient d'être posé
 */
let drag = null;

export function initControls(canvas, minimap) {
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => onPointerDown(e, canvas));
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', () => endDrag(canvas));
  canvas.addEventListener('pointercancel', () => {
    cancelBeltPlan();
    endDrag(canvas);
  });
  canvas.addEventListener('pointerleave', () => { if (!drag) ui.hover = null; });
  // Double-clic sur une usine, avec l'outil Déplacer : on entre dedans.
  canvas.addEventListener('dblclick', (e) => {
    if (ui.tool !== 'hand') return;
    const cell = cellFromEvent(e);
    const target = buildingAt(cell.x, cell.y, ui.layer);
    if (target?.kind === 'factory') enterFactory(target);
  });
  canvas.addEventListener('wheel', onWheel, { passive: false });

  addEventListener('keydown', onKeyDown);
  // Le navigateur n'autorise le son qu'après une première interaction.
  addEventListener('pointerdown', unlockAudio);
  addEventListener('keydown', unlockAudio);
  addEventListener('keyup', (e) => keysDown.delete(keyName(e)));
  addEventListener('blur', () => keysDown.clear());

  initMinimapControls(minimap);
}

// ---------- Souris / tactile ----------

function onPointerDown(e, canvas) {
  canvas.setPointerCapture(e.pointerId);
  const cell = cellFromEvent(e);

  if (e.button === 2 && ui.beltPlan) {
    cancelBeltPlan();
    drag = null;
  } else if (e.button === 2 && ui.placing) {
    cancelPlacing();
  } else if (e.button === 2) {
    eraseAt(cell);
    drag = { mode: 'erase' };
  } else if (e.button === 1 || keysDown.has(' ')) {
    drag = { mode: 'pan', x: e.clientX, y: e.clientY, moved: 0, cell, click: false };
    canvas.classList.add('drag');
  } else if (ui.placing) {
    placeGroupAt(cell);
    drag = { mode: 'place' };
  } else if (ui.tool === 'select' || (ui.tool === 'hand' && e.shiftKey)) {
    startSelectBox(clampToMap(cell));
    drag = { mode: 'select' };
  } else if (ui.tool === 'hand') {
    // Un clic sans glisser avec l'outil Déplacer ouvre la fiche d'une machine (voir endDrag).
    drag = { mode: 'pan', x: e.clientX, y: e.clientY, moved: 0, cell, click: true };
    canvas.classList.add('drag');
  } else if (ui.tool === 'belt') {
    startBeltPlan(cell);
    drag = { mode: 'build', last: cell };
  } else {
    drag = { mode: 'build', last: cell };
    if (ui.tool === 'erase') eraseAt(cell);
    else buildAt(cell);
  }
}

function onPointerMove(e) {
  const cell = cellFromEvent(e);
  ui.hover = layerInBounds(ui.layer, cell.x, cell.y) ? cell : null;
  ui.pointer = ui.hover ? worldFromEvent(e) : null;
  showCursorCell(ui.hover);
  if (!drag) return;

  if (drag.mode === 'pan') {
    drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
    panBy(-(e.clientX - drag.x) / view.zoom, -(e.clientY - drag.y) / view.zoom);
    drag.x = e.clientX;
    drag.y = e.clientY;
    return;
  }
  if (drag.mode === 'erase') {
    if (ui.hover) eraseAt(cell);
    return;
  }
  if (drag.mode === 'select') {
    extendSelectBox(clampToMap(cell));
    return;
  }
  if (drag.mode === 'place') return;
  if (cell.x === drag.last.x && cell.y === drag.last.y) return;
  if (ui.tool === 'belt') extendBeltPlan(cell);
  else if (ui.tool === 'erase') eraseAt(cell);
  drag.last = cell;
}

function endDrag(canvas) {
  if (drag?.mode === 'pan' && drag.click && drag.moved < 5) {
    const target = buildingAt(drag.cell.x, drag.cell.y, ui.layer);
    ui.selected = target && hasInfoPanel(target) ? target : null;
    clearSelection();
  }
  if (drag?.mode === 'select') finishSelectBox();
  if (drag?.mode === 'build') commitBeltPlan();
  drag = null;
  canvas.classList.remove('drag');
}

/**
 * Molette de souris (ou pincement au trackpad) → zoom progressif.
 * Défilement à deux doigts au trackpad → déplacement.
 */
const clampToMap = ({ x, y }) => ({
  x: Math.max(0, Math.min(MAP_W - 1, x)),
  y: Math.max(0, Math.min(MAP_H - 1, y)),
});

function onWheel(e) {
  e.preventDefault();
  const isMouseWheel = e.ctrlKey || e.deltaMode !== 0 ||
    (e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY));
  if (!isMouseWheel) {
    panBy(e.deltaX / view.zoom, e.deltaY / view.zoom);
    return;
  }
  // Molette ou pincement : un zoom progressif, vers le point sous la souris.
  const lines = e.deltaMode === 1 ? 33 : 1; // certaines souris comptent en lignes
  zoomByWheel(e.deltaY * lines, e.clientX, e.clientY);
}

// ---------- Clavier ----------

const keyName = (e) => (e.key === ' ' ? ' ' : e.key.toLowerCase());

function onKeyDown(e) {
  if (e.defaultPrevented) return; // déjà traitée (ex. Échap qui ferme le menu)
  // Les raccourcis avec Ctrl / ⌘ (ex. sauvegarder) ne sont pas des touches de jeu :
  // sans ça, Ctrl + S ferait aussi défiler la carte vers le bas (S de WASD).
  if (e.ctrlKey || e.metaKey) return;
  if (ui.screen !== 'game') return; // sur l'écran titre ou le menu Échap, le clavier sert au menu
  const key = keyName(e);
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) e.preventDefault();
  keysDown.add(key);

  if (ui.beltPlan && key === 'escape') return cancelBeltPlan();

  // Groupe qui suit le curseur : R le tourne, Échap l'abandonne.
  if (ui.placing && (key === 'r' || key === 'escape')) {
    if (key === 'r') rotatePlacing();
    else cancelPlacing();
    return;
  }
  // Menu de la sélection
  if (ui.selection.length) {
    if (key === 'x') return startMove();
    if (key === 'c') return startCopy();
    if (key === 'o') return togglePowerSelection();
    if (key === 'delete' || key === 'backspace') return eraseSelection();
    if (key === 'escape') return clearSelection();
  }

  if (key === 'r') rotateAction(e.shiftKey);
  else if (key === 'f') shapeAction();
  else if (key === 'p') priorityAction();
  else if (key === 'o') powerAction();
  else if (key === 'escape') {
    // Échap annule d'abord ce qui est en cours ; quand il n'y a plus rien, il ouvre le menu.
    if (isTrayOpen()) closeTray();
    else if (isResearchOpen()) closeResearch();
    else if (isInventoryOpen()) closeInventory();
    else if (isInsideFactory() && !ui.selected && ui.tool === 'hand') exitFactory();
    else if (isLevelCardOpen()) closeLevelCard();
    else if (ui.selected || ui.tool !== 'hand') {
      ui.selected = null;
      setTool('hand');
    } else openPause(e);
  }
  else if (key === 'm') toggleSound();
  else if (key === 'k') toggleResearch();
  else if (key === 'u') toggleLayer();
  // Au clavier, des crans entiers (les pixels restent parfaitement nets).
  else if (key === '+' || key === '=') setZoom(Math.floor(view.zoom + 1e-6) + 1);
  else if (key === '-' || key === '_') setZoom(Math.ceil(view.zoom - 1e-6) - 1);
  else if (/^[0-9]$/.test(key)) selectToolByNumber(Number(key));
  else selectToolByKey(key);
}

/** Déplacement continu tant que WASD ou les flèches sont enfoncées. À appeler à chaque image. */
export function applyKeyboardPan(dt) {
  const step = PAN_SPEED * dt;
  let dx = 0, dy = 0;
  if (keysDown.has('a') || keysDown.has('arrowleft')) dx -= step;
  if (keysDown.has('d') || keysDown.has('arrowright')) dx += step;
  if (keysDown.has('w') || keysDown.has('arrowup')) dy -= step;
  if (keysDown.has('s') || keysDown.has('arrowdown')) dy += step;
  if (dx || dy) panBy(dx, dy);
}

// ---------- Mini-carte ----------

function initMinimapControls(minimap) {
  let dragging = false;
  const jumpTo = (e) => {
    if (isInteriorLayer(ui.layer)) return; // dans une usine, la mini-carte montre la carte, pas l'intérieur
    const r = minimap.getBoundingClientRect();
    view.camX = ((e.clientX - r.left) / r.width) * MAP_W * TILE - view.width / 2;
    view.camY = ((e.clientY - r.top) / r.height) * MAP_H * TILE - view.height / 2;
    clampCamera();
  };
  minimap.addEventListener('pointerdown', (e) => {
    dragging = true;
    minimap.setPointerCapture(e.pointerId);
    jumpTo(e);
  });
  minimap.addEventListener('pointermove', (e) => { if (dragging) jumpTo(e); });
  minimap.addEventListener('pointerup', () => { dragging = false; });
}

