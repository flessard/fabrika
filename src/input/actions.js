// Actions du joueur sur la carte : poser, effacer, tourner, tracer des tapis.
// Ces fonctions ne savent rien de la souris ou du clavier (voir controls.js).
import { TILE } from '../config.js';
import { DIRS, LEFT, RIGHT, DOWN, UP, turnLeft, turnRight } from '../core/grid.js';
import { BUILDINGS } from '../data/buildings.js';
import { ui } from '../state.js';
import { rotatePriority } from '../data/splitterShapes.js';
import { anchorFor, buildingAt, canPlace, placeBuilding, removeBuilding } from '../world/buildings.js';
import { spawnPuff } from '../sim/particles.js';
import { playSound } from '../audio/sounds.js';
import { cycleShape, hasShapes, nextShapeFor, rememberShape, shapeChoice } from './shapePicker.js';

export function eraseAt(cell) {
  const target = buildingAt(cell.x, cell.y);
  if (!target || target.kind === 'hub') return;
  removeBuilding(target);
  playSound('remove');
}

/** Pose le bâtiment de l'outil actif sur la case. */
export function buildAt(cell) {
  if (hasShapes(ui.tool)) return placeShaped(cell);

  const { x, y } = anchorFor(ui.tool, cell);
  if (!canPlace(ui.tool, x, y)) return;
  const { w, h } = BUILDINGS[ui.tool];
  placeBuilding(ui.tool, x, y, ui.dir);
  spawnPuff((x + w / 2) * TILE, (y + h / 2) * TILE, 3);
  playSound('place');
}

/**
 * Splitter ou groupeur. Posé sur un tapis, il le remplace, garde sa direction
 * et l'item qu'il portait.
 */
function placeShaped(cell) {
  const choice = shapeChoice(ui.tool, cell);
  if (!choice.ok) return;

  const under = buildingAt(cell.x, cell.y);
  let carried = null;
  if (under?.kind === 'belt') {
    carried = under.item;
    removeBuilding(under);
  }

  const props = { shape: choice.shape };
  if (ui.tool === 'smartSplitter') props.priority = [...ui.smartPriority];
  const placed = placeBuilding(ui.tool, cell.x, cell.y, choice.dir, props);
  rememberShape(ui.tool, choice.shape);
  if (carried) {
    // L'item arrivait par l'arrière du tapis : il garde sa place, sans dépasser le centre.
    const progress = Math.min(0.5, carried.progress);
    placed.item = placed.kind === 'splitter'
      ? { type: carried.type, progress, enterDir: choice.dir, outDir: null, outIndex: 0 }
      : { type: carried.type, progress, enterDir: carried.enterDir, committed: false };
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
 * R : avec Déplacer, tourne le bâtiment survolé ; avec le splitter ou le groupeur
 * sur un tapis, change de forme ; sinon tourne le prochain bâtiment (Maj : sens inverse).
 */
export function rotateAction(reverse = false) {
  playSound('click');
  const hovered = ui.hover && buildingAt(ui.hover.x, ui.hover.y);
  if (ui.tool === 'hand' && hovered && hovered.kind !== 'hub') hovered.dir = turnRight(hovered.dir);
  else if (hasShapes(ui.tool) && hovered?.kind === 'belt') cycleShape(ui.tool);
  else ui.dir = reverse ? turnLeft(ui.dir) : turnRight(ui.dir);
}

/** F : change la forme du splitter ou groupeur survolé (Déplacer), ou du prochain à poser. */
export function shapeAction() {
  playSound('click');
  const hovered = ui.hover && buildingAt(ui.hover.x, ui.hover.y);
  if (ui.tool === 'hand' && hasShapes(hovered?.type)) {
    hovered.shape = nextShapeFor(hovered);
    hovered.next = 0;
  } else if (hasShapes(ui.tool)) {
    cycleShape(ui.tool);
  }
}

/**
 * P : tourne les priorités d'un splitter prioritaire (la sortie n° 1 passe en dernier).
 * Avec Déplacer, sur celui qu'on survole ; avec l'outil Prioritaire, sur le prochain à poser.
 */
export function priorityAction() {
  const hovered = ui.hover && buildingAt(ui.hover.x, ui.hover.y);
  if (ui.tool === 'hand' && hovered?.priority) {
    playSound('click');
    hovered.priority = rotatePriority(hovered.priority, hovered.dir, hovered.shape);
  } else if (ui.tool === 'smartSplitter') {
    playSound('click');
    const choice = ui.hover ? shapeChoice(ui.tool, ui.hover) : { dir: ui.dir, shape: ui.smartSplitterShape };
    ui.smartPriority = rotatePriority(ui.smartPriority, choice.dir, choice.shape);
  }
}
