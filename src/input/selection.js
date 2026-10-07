// Sélection de plusieurs bâtiments : on encadre une zone, puis le menu propose
// de déplacer, copier ou effacer le groupe.
//
// Déplacer et copier font suivre le groupe au curseur (ui.placing) :
//   - déplacer retire les bâtiments de la carte et les repose au clic, vidés
//     (plus d'items, de stock ni de fabrication en cours) ; Échap les remet à leur
//     place tels quels ;
//   - copier pose un nouveau groupe, vide lui aussi, à chaque clic, jusqu'à Échap.
// R tourne le groupe d'un quart de tour pendant qu'il suit le curseur.
import { TILE } from '../config.js';
import { turnRight } from '../core/grid.js';
import { onLayer } from '../data/buildings.js';
import { game, ui } from '../state.js';
import { emit } from '../core/events.js';
import { buildingName } from '../i18n/index.js';
import { emptyBuilding, liftBuilding, placementProblem, placeBuilding, putBackBuilding, removeBuilding } from '../world/buildings.js';
import { spawnPuff } from '../sim/particles.js';
import { playSound } from '../audio/sounds.js';

// ---------- Encadrer ----------

export function startSelectBox(cell) {
  ui.selection = [];
  ui.selectBox = { from: cell, to: cell };
}

export function extendSelectBox(cell) {
  ui.selectBox.to = cell;
}

/** Zone encadrée, en cases : { x, y, w, h }, ou null. */
export function selectBoxArea() {
  if (!ui.selectBox) return null;
  const { from, to } = ui.selectBox;
  const x = Math.min(from.x, to.x), y = Math.min(from.y, to.y);
  return { x, y, w: Math.abs(to.x - from.x) + 1, h: Math.abs(to.y - from.y) + 1 };
}

/** Tout ce qui touche la zone encadrée sur la couche regardée (sauf le dépôt). */
function buildingsIn(area) {
  return game.buildings.filter((b) => b.kind !== 'hub' && onLayer(b, ui.layer) &&
    b.x < area.x + area.w && b.x + b.w > area.x && b.y < area.y + area.h && b.y + b.h > area.y);
}

export function finishSelectBox() {
  ui.selection = buildingsIn(selectBoxArea());
  ui.selectBox = null;
  if (ui.selection.length) playSound('click');
}

/** Bâtiments à mettre en surbrillance : la sélection, ou ce que la zone encadre déjà. */
export function highlightedBuildings() {
  const area = selectBoxArea();
  return area ? buildingsIn(area) : ui.selection;
}

export function clearSelection() {
  ui.selection = [];
  ui.selectBox = null;
}

/** Oublie la sélection et le groupe en cours, sans rien remettre (nouvelle carte). */
export function resetSelection() {
  clearSelection();
  ui.placing = null;
}

// ---------- Actions du menu ----------

export function eraseSelection() {
  if (!ui.selection.length) return;
  for (const b of ui.selection) removeBuilding(b);
  if (ui.selected && ui.selection.includes(ui.selected)) ui.selected = null;
  clearSelection();
  playSound('remove');
}

export const startMove = () => startPlacing('move');
export const startCopy = () => startPlacing('copy');

/**
 * Prépare le groupe qui suit le curseur. Chaque pièce est décrite par rapport
 * au coin haut-gauche du groupe ; `b` est le bâtiment lui-même quand on le déplace.
 */
function startPlacing(mode) {
  const group = ui.selection;
  if (!group.length) return;
  playSound('click');

  const x0 = Math.min(...group.map((b) => b.x)), y0 = Math.min(...group.map((b) => b.y));
  const x1 = Math.max(...group.map((b) => b.x + b.w)), y1 = Math.max(...group.map((b) => b.y + b.h));
  const parts = group.map((b) => ({
    type: b.type, kind: b.kind, w: b.w, h: b.h, dx: b.x - x0, dy: b.y - y0, dir: b.dir,
    shape: b.shape, priority: b.priority && [...b.priority], filters: b.filters && structuredClone(b.filters),
    b: mode === 'move' ? b : null,
  }));

  if (mode === 'move') {
    for (const b of group) liftBuilding(b);
    if (ui.selected && group.includes(ui.selected)) ui.selected = null;
  }
  ui.placing = { mode, w: x1 - x0, h: y1 - y0, parts };
  clearSelection();
}

/** R : tourne le groupe d'un quart de tour dans le sens horaire. */
export function rotatePlacing() {
  const p = ui.placing;
  for (const part of p.parts) {
    [part.dx, part.dy] = [p.h - part.dy - part.h, part.dx];
    [part.w, part.h] = [part.h, part.w];
    part.dir = turnRight(part.dir);
  }
  [p.w, p.h] = [p.h, p.w];
  playSound('click');
}

/**
 * Où chaque pièce du groupe serait posée avec le curseur sur `cell`, et si elle rentre.
 * (x0, y0) : coin haut-gauche du groupe. `problem` : pourquoi une pièce ne rentre pas.
 */
export function placementAt(cell) {
  const p = ui.placing;
  const x0 = cell.x - Math.floor((p.w - 1) / 2), y0 = cell.y - Math.floor((p.h - 1) / 2);
  const spots = p.parts.map((part) => {
    const x = x0 + part.dx, y = y0 + part.dy;
    const problem = placementProblem(part.type, x, y);
    return { part, x, y, ok: !problem, problem };
  });
  return { x0, y0, spots, ok: spots.every((s) => s.ok) };
}

/** Clic : pose le groupe sous le curseur, si toutes les pièces rentrent. */
export function placeGroupAt(cell) {
  const { spots, ok } = placementAt(cell);
  if (!ok) {
    playSound('deny');
    emit('placement:denied');
    return;
  }
  const p = ui.placing;
  const placed = spots.map(({ part, x, y }) => {
    const b = p.mode === 'move' ? moveTo(part.b, x, y, part.dir)
      : placeBuilding(part.type, x, y, part.dir, copiedProps(part));
    spawnPuff((x + part.w / 2) * TILE, (y + part.h / 2) * TILE, 2);
    return b;
  });
  playSound('place');

  // Un groupe déplacé reste sélectionné ; une copie continue de suivre le curseur.
  if (p.mode === 'move') {
    ui.placing = null;
    ui.selection = placed;
  }
}

/** Échap ou clic droit : abandonne le groupe. Un déplacement remet tout à sa place. */
export function cancelPlacing() {
  const p = ui.placing;
  if (!p) return;
  ui.placing = null;
  if (p.mode === 'move') {
    for (const part of p.parts) putBackBuilding(part.b);
    ui.selection = p.parts.map((part) => part.b);
  }
  playSound('click');
}

/**
 * Les raisons qui empêchent de poser le groupe, regroupées :
 * [{ name: 'Foreuse', problem: 'pas de gisement dessous', count: 2 }, …], les plus fréquentes d'abord.
 */
export function placementProblems(spots) {
  const groups = new Map();
  for (const { part, problem } of spots) {
    if (!problem) continue;
    const name = buildingName(part.type);
    const key = `${name}|${problem}`;
    if (!groups.has(key)) groups.set(key, { name, problem, count: 0 });
    groups.get(key).count++;
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

function copiedProps(part) {
  const props = {};
  if (part.shape) props.shape = part.shape;
  if (part.priority) props.priority = [...part.priority];
  if (part.filters) props.filters = structuredClone(part.filters);
  return props;
}

/** Repose un bâtiment déplacé, vidé : plus d'item, de stock ni de fabrication en cours. */
function moveTo(b, x, y, dir) {
  b.x = x;
  b.y = y;
  b.dir = dir;
  emptyBuilding(b);
  return putBackBuilding(b);
}
