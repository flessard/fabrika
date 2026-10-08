// Actions du joueur sur la carte : poser, effacer, tourner, tracer des tapis.
// Ces fonctions ne savent rien de la souris ou du clavier (voir controls.js).
//
// Elles ne modifient jamais l'usine elles-mêmes : elles émettent des commandes
// (sim/commands.js), appliquées au pas de simulation suivant. Ce qui ne concerne que
// ce joueur (outil, direction du prochain bâtiment, forme choisie) reste ici, dans ui.
import { emit } from '../core/events.js';
import { DIRS, LEFT, RIGHT, DOWN, UP, turnLeft, turnRight } from '../core/grid.js';
import { BUILDINGS, baseType, canBePowered, isOn, toolWorksOn, typeForTool } from '../data/buildings.js';
import { ui } from '../state.js';
import { rotatePriority } from '../data/splitterShapes.js';
import { anchorFor, buildingAt, canPlace } from '../world/buildings.js';
import { stockProblem } from '../world/inventory.js';
import { mergeProblem } from '../sim/belt.js';
import { issue } from '../sim/commands.js';
import { playSound } from '../audio/sounds.js';
import { cycleShape, hasShapes, nextShapeFor, rememberShape, shapeChoice } from './shapePicker.js';

/**
 * Type de bâtiment que pose l'outil actif sur la couche regardée, ou null.
 * Au sous-sol, Tapis, Splitter, Prioritaire et Groupeur posent leur version
 * souterraine ; l'outil Tunnel pose une entrée ou une sortie selon ui.tunnelEnd.
 */
export function toolType(toolId = ui.tool) {
  if (toolId === 'tunnel') return toolWorksOn(toolId, ui.layer) ? (ui.tunnelEnd === 'in' ? 'tunnelIn' : 'tunnelOut') : null;
  return typeForTool(toolId, ui.layer);
}

/** F avec l'outil Tunnel : passe de l'entrée à la sortie. */
export function toggleTunnelEnd() {
  ui.tunnelEnd = ui.tunnelEnd === 'in' ? 'out' : 'in';
}

export function eraseAt(cell) {
  issue({ type: 'erase', x: cell.x, y: cell.y, layer: ui.layer });
}

/** Un bâtiment tel qu'il serait posé (pour vérifier les jonctions avant d'envoyer la commande). */
const virtualOf = (type, x, y, dir, props = {}) => ({ type, kind: BUILDINGS[type].kind, x, y, w: BUILDINGS[type].w, h: BUILDINGS[type].h, dir, ...props });

/** Refus immédiat, sans attendre la commande : son et bulle d'aide qui dit pourquoi. */
function deny() {
  playSound('deny');
  emit('placement:denied');
}

/** Pose le bâtiment de l'outil actif sur la case. */
export function buildAt(cell) {
  const type = toolType();
  if (!type) return playSound('deny');
  if (hasShapes(ui.tool)) return placeShaped(cell, type);

  const { x, y } = anchorFor(type, cell);
  if (!canPlace(type, x, y) || stockProblem(type) || mergeProblem([virtualOf(type, x, y, ui.dir)])) return deny();
  issue({ type: 'place', building: type, x, y, dir: ui.dir });
  // Après une entrée de tunnel, on pose le plus souvent sa sortie.
  if (ui.tool === 'tunnel') toggleTunnelEnd();
}

/**
 * Splitter, filtre ou groupeur. Posé sur un tapis, il le remplace, garde sa direction
 * et l'item qu'il portait (voir la commande 'place').
 */
function placeShaped(cell, type) {
  const choice = shapeChoice(ui.tool, cell);
  if (!choice.ok || mergeProblem([virtualOf(type, cell.x, cell.y, choice.dir, { shape: choice.shape })])) return deny();
  const props = { shape: choice.shape };
  if (ui.tool === 'smartSplitter') props.priority = [...ui.smartPriority];
  issue({ type: 'place', building: type, x: cell.x, y: cell.y, dir: choice.dir, props });
  rememberShape(ui.tool, choice.shape);
}

// ---------- Tracer des tapis en glissant ----------
//
// Pendant le glisser, le chemin n'est qu'un aperçu (ui.beltPlan) : rien n'est posé.
// Les tapis sont posés d'un coup quand on relâche le clic.

/** Début du tracé, sur la case où l'on a cliqué. */
export function startBeltPlan(cell) {
  ui.beltPlan = { type: toolType('belt'), cells: [{ x: cell.x, y: cell.y, dir: ui.dir }] };
}

/**
 * Prolonge le chemin case par case jusqu'à `to`. Chaque case prend la direction du
 * mouvement, et la case précédente est tournée pour pointer vers la nouvelle.
 * Revenir sur une case du chemin le raccourcit jusqu'à elle.
 */
export function extendBeltPlan(to) {
  const plan = ui.beltPlan;
  if (!plan) return;
  let last = plan.cells[plan.cells.length - 1];
  while (last.x !== to.x || last.y !== to.y) {
    const dx = to.x - last.x, dy = to.y - last.y;
    const dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : (dy > 0 ? DOWN : UP);
    const next = { x: last.x + DIRS[dir][0], y: last.y + DIRS[dir][1], dir };
    const back = plan.cells.findIndex((c) => c.x === next.x && c.y === next.y);
    if (back >= 0) {
      plan.cells.length = back + 1;
      last = plan.cells[back];
      ui.dir = last.dir;
      continue;
    }
    last.dir = dir;
    plan.cells.push(next);
    last = next;
    ui.dir = dir;
    playSound('belt');
  }
}

/** Relâchement du clic : pose les tapis du chemin là où il y a la place. */
export function commitBeltPlan() {
  const plan = ui.beltPlan;
  if (!plan) return;
  ui.beltPlan = null;
  issue({ type: 'placeBelts', building: plan.type, cells: plan.cells.map(({ x, y, dir }) => ({ x, y, dir })) });
}

/** Échap ou clic droit pendant le glisser : le chemin est abandonné. */
export function cancelBeltPlan() {
  if (!ui.beltPlan) return;
  ui.beltPlan = null;
  playSound('click');
}

// ---------- Touches R et F ----------

/**
 * R : avec Déplacer, tourne le bâtiment survolé ; avec le splitter ou le groupeur
 * sur un tapis, change de forme ; sinon tourne le prochain bâtiment (Maj : sens inverse).
 */
export function rotateAction(reverse = false) {
  const hovered = ui.hover && buildingAt(ui.hover.x, ui.hover.y, ui.layer);
  if (ui.tool === 'hand' && hovered && hovered.kind !== 'hub') return issue({ type: 'rotate', id: hovered.id });
  playSound('click');
  if (hasShapes(ui.tool) && hovered?.kind === 'belt') cycleShape(ui.tool);
  else ui.dir = reverse ? turnLeft(ui.dir) : turnRight(ui.dir);
}

/**
 * F : change la forme du splitter ou groupeur survolé (Déplacer), ou du prochain à poser.
 * Avec l'outil Tunnel, passe de l'entrée à la sortie.
 */
export function shapeAction() {
  const hovered = ui.hover && buildingAt(ui.hover.x, ui.hover.y, ui.layer);
  if (ui.tool === 'hand' && hovered && hasShapes(baseType(hovered.type))) {
    return issue({ type: 'setShape', id: hovered.id, shape: nextShapeFor(hovered) });
  }
  playSound('click');
  if (ui.tool === 'tunnel') toggleTunnelEnd();
  else if (hasShapes(ui.tool)) cycleShape(ui.tool);
}

/** O : met en marche ou arrête la machine survolée (avec l'outil Déplacer). */
export function powerAction() {
  const hovered = ui.hover && buildingAt(ui.hover.x, ui.hover.y, ui.layer);
  if (ui.tool !== 'hand' || !hovered || !canBePowered(hovered)) return;
  issue({ type: 'setEnabled', ids: [hovered.id], enabled: !isOn(hovered) });
}

/**
 * P : tourne les priorités d'un splitter prioritaire (la sortie n° 1 passe en dernier).
 * Avec Déplacer, sur celui qu'on survole ; avec l'outil Prioritaire, sur le prochain à poser.
 */
export function priorityAction() {
  const hovered = ui.hover && buildingAt(ui.hover.x, ui.hover.y, ui.layer);
  if (ui.tool === 'hand' && hovered?.priority) {
    issue({ type: 'setPriority', id: hovered.id, priority: rotatePriority(hovered.priority, hovered.dir, hovered.shape) });
  } else if (ui.tool === 'smartSplitter') {
    playSound('click');
    const choice = ui.hover ? shapeChoice(ui.tool, ui.hover) : { dir: ui.dir, shape: ui.smartSplitterShape };
    ui.smartPriority = rotatePriority(ui.smartPriority, choice.dir, choice.shape);
  }
}
