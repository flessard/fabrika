// Actions du joueur sur la carte : poser, effacer, tourner, tracer des tapis.
// Ces fonctions ne savent rien de la souris ou du clavier (voir controls.js).
import { TILE } from '../config.js';
import { DIRS, LEFT, RIGHT, DOWN, UP, turnLeft, turnRight } from '../core/grid.js';
import { BUILDINGS } from '../data/buildings.js';
import { nextShapeId } from '../data/splitterShapes.js';
import { ui } from '../state.js';
import { anchorFor, buildingAt, canPlace, placeBuilding, removeBuilding } from '../world/buildings.js';
import { spawnPuff } from '../sim/particles.js';
import { playSound } from '../audio/sounds.js';
import { cycleSplitterShape, splitterChoice } from './splitterPicker.js';

export function eraseAt(cell) {
  const target = buildingAt(cell.x, cell.y);
  if (!target || target.kind === 'hub') return;
  removeBuilding(target);
  playSound('remove');
}

/** Pose le bâtiment de l'outil actif sur la case. */
export function buildAt(cell) {
  if (ui.tool === 'splitter') return placeSplitter(cell);

  const { x, y } = anchorFor(ui.tool, cell);
  if (!canPlace(ui.tool, x, y)) return;
  const { w, h } = BUILDINGS[ui.tool];
  placeBuilding(ui.tool, x, y, ui.dir);
  spawnPuff((x + w / 2) * TILE, (y + h / 2) * TILE, 3);
  playSound('place');
}

/** Un splitter posé sur un tapis le remplace, garde sa direction et l'item qu'il portait. */
function placeSplitter(cell) {
  const choice = splitterChoice(cell);
  if (!choice.ok) return;

  const under = buildingAt(cell.x, cell.y);
  let carried = null;
  if (under?.kind === 'belt') {
    carried = under.item;
    removeBuilding(under);
  }

  const splitter = placeBuilding('splitter', cell.x, cell.y, choice.dir, { shape: choice.shape });
  ui.splitterShape = choice.shape;
  if (carried) {
    splitter.item = { type: carried.type, progress: carried.progress, enterDir: choice.dir, outDir: null, outIndex: 0, wait: 0 };
  }
  spawnPuff((cell.x + 0.5) * TILE, (cell.y + 0.5) * TILE, 3);
  playSound('place');
}

// ---------- Tracer des tapis en glissant ----------

/** Début du tracé : pose un tapis sur la case de départ. Retourne le tapis posé (ou null). */
export function startBeltPath(cell) {
  if (!canPlace('belt', cell.x, cell.y)) return null;
  playSound('place');
  return placeBuilding('belt', cell.x, cell.y, ui.dir);
}

/**
 * Prolonge le tracé case par case jusqu'à `to`. Chaque tapis prend la direction
 * du mouvement, et le tapis précédent est tourné pour pointer vers le nouveau.
 * Retourne le dernier tapis posé (ou null).
 */
export function extendBeltPath(from, to, lastBelt) {
  let { x, y } = from;
  while (x !== to.x || y !== to.y) {
    const dx = to.x - x, dy = to.y - y;
    const dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : (dy > 0 ? DOWN : UP);
    if (lastBelt) lastBelt.dir = dir;
    ui.dir = dir;
    x += DIRS[dir][0];
    y += DIRS[dir][1];
    lastBelt = canPlace('belt', x, y) ? placeBuilding('belt', x, y, dir) : null;
    if (lastBelt) playSound('belt');
  }
  return lastBelt;
}

// ---------- Touches R et F ----------

/**
 * R : avec Déplacer, tourne le bâtiment survolé ; avec le splitter sur un tapis,
 * change de forme ; sinon tourne le prochain bâtiment à poser (Maj : sens inverse).
 */
export function rotateAction(reverse = false) {
  playSound('click');
  const hovered = ui.hover && buildingAt(ui.hover.x, ui.hover.y);
  if (ui.tool === 'hand' && hovered && hovered.kind !== 'hub') hovered.dir = turnRight(hovered.dir);
  else if (ui.tool === 'splitter' && hovered?.kind === 'belt') cycleSplitterShape();
  else ui.dir = reverse ? turnLeft(ui.dir) : turnRight(ui.dir);
}

/** F : change la forme du splitter survolé (Déplacer) ou du prochain splitter. */
export function shapeAction() {
  playSound('click');
  const hovered = ui.hover && buildingAt(ui.hover.x, ui.hover.y);
  if (ui.tool === 'hand' && hovered?.kind === 'splitter') {
    hovered.shape = nextShapeId(hovered.shape);
    hovered.next = 0;
  } else if (ui.tool === 'splitter') {
    cycleSplitterShape();
  }
}
