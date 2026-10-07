// Souris, trackpad, tactile et clavier → actions du jeu.
import { MAP_H, MAP_W, PAN_SPEED, TILE } from '../config.js';
import { inBounds } from '../core/grid.js';
import { hasInfoPanel } from '../data/buildings.js';
import { ui, view } from '../state.js';
import { buildingAt } from '../world/buildings.js';
import { showCursorCell } from '../ui/hud.js';
import { selectToolByNumber, setTool } from '../ui/toolbar.js';
import { buildAt, eraseAt, extendBeltPath, priorityAction, rotateAction, shapeAction, startBeltPath } from './actions.js';
import {
  cancelPlacing, clearSelection, eraseSelection, extendSelectBox, finishSelectBox, placeGroupAt,
  rotatePlacing, startCopy, startMove, startSelectBox,
} from './selection.js';
import { cellFromEvent, clampCamera, panBy, setZoom } from './camera.js';
import { unlockAudio } from '../audio/engine.js';
import { toggleSound } from '../ui/hud.js';

/** Touches enfoncées en ce moment (en minuscules ; ' ' pour la barre d'espace). */
const keysDown = new Set();

/**
 * Glisser en cours :
 *   { mode: 'pan', x, y }            déplacer la carte
 *   { mode: 'erase' }                effacer en glissant (clic droit)
 *   { mode: 'build', last, belt }    construire en glissant (tracé de tapis)
 *   { mode: 'select' }               encadrer des bâtiments (outil Sélection, ou Maj + glisser)
 *   { mode: 'place' }                le groupe déplacé ou copié vient d'être posé
 */
let drag = null;

export function initControls(canvas, minimap) {
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => onPointerDown(e, canvas));
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', () => endDrag(canvas));
  canvas.addEventListener('pointercancel', () => endDrag(canvas));
  canvas.addEventListener('pointerleave', () => { if (!drag) ui.hover = null; });
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

  if (e.button === 2 && ui.placing) {
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
    drag = { mode: 'build', last: cell, belt: startBeltPath(cell) };
  } else {
    drag = { mode: 'build', last: cell, belt: null };
    if (ui.tool === 'erase') eraseAt(cell);
    else buildAt(cell);
  }
}

function onPointerMove(e) {
  const cell = cellFromEvent(e);
  ui.hover = inBounds(cell.x, cell.y) ? cell : null;
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
  if (ui.tool === 'belt') drag.belt = extendBeltPath(drag.last, cell, drag.belt);
  else if (ui.tool === 'erase') eraseAt(cell);
  drag.last = cell;
}

function endDrag(canvas) {
  if (drag?.mode === 'pan' && drag.click && drag.moved < 5) {
    const target = buildingAt(drag.cell.x, drag.cell.y);
    ui.selected = target && hasInfoPanel(target) ? target : null;
    clearSelection();
  }
  if (drag?.mode === 'select') finishSelectBox();
  drag = null;
  canvas.classList.remove('drag');
}

/**
 * Molette de souris (ou pincement au trackpad) → zoom.
 * Défilement à deux doigts au trackpad → déplacement.
 */
let wheelTotal = 0;
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
  wheelTotal += e.deltaY;
  if (Math.abs(wheelTotal) < 40) return;
  setZoom(view.zoom + (wheelTotal < 0 ? 1 : -1), e.clientX, e.clientY);
  wheelTotal = 0;
}

// ---------- Clavier ----------

const keyName = (e) => (e.key === ' ' ? ' ' : e.key.toLowerCase());

function onKeyDown(e) {
  const key = keyName(e);
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) e.preventDefault();
  keysDown.add(key);

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
    if (key === 'delete' || key === 'backspace') return eraseSelection();
    if (key === 'escape') return clearSelection();
  }

  if (key === 'r') rotateAction(e.shiftKey);
  else if (key === 'f') shapeAction();
  else if (key === 'p') priorityAction();
  else if (key === 'escape') {
    ui.selected = null;
    setTool('hand');
  }
  else if (key === 'm') toggleSound();
  else if (key === '+' || key === '=') setZoom(view.zoom + 1);
  else if (key === '-' || key === '_') setZoom(view.zoom - 1);
  else if (/^[0-9]$/.test(key)) selectToolByNumber(Number(key));
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

