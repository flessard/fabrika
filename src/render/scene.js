// Ce que les deux rendus (Canvas 2D et PixiJS) calculent de la même façon :
// la partie visible, la position des items, les reflets de l'eau, l'aperçu du curseur.
import { MAP_H, MAP_W, TILE } from '../config.js';
import { DIRS, cellIndex, opposite } from '../core/grid.js';
import { hash2 } from '../core/random.js';
import { BUILDINGS, isBuildTool } from '../data/buildings.js';
import { PALETTE as P } from '../data/palette.js';
import { game, ui, view } from '../state.js';
import { GROUND } from '../world/terrain.js';
import { anchorFor, buildingAt, canPlace } from '../world/buildings.js';
import { hasShapes, shapeChoice } from '../input/shapePicker.js';
import { highlightedBuildings, placementAt, selectBoxArea } from '../input/selection.js';
import { beltArms } from '../sim/belt.js';

/** Coin haut-gauche de la caméra arrondi au pixel, pour un rendu net. */
export const cameraOrigin = () => ({ ox: Math.round(view.camX), oy: Math.round(view.camY) });

/** Cases visibles à l'écran. */
export function visibleCells(ox, oy) {
  return {
    x0: Math.max(0, Math.floor(ox / TILE)),
    y0: Math.max(0, Math.floor(oy / TILE)),
    x1: Math.min(MAP_W - 1, Math.ceil((ox + view.width) / TILE)),
    y1: Math.min(MAP_H - 1, Math.ceil((oy + view.height) / TILE)),
  };
}

export const isVisible = (b, ox, oy) =>
  b.x * TILE + b.w * TILE > ox - 8 && b.x * TILE < ox + view.width + 8 &&
  b.y * TILE + b.h * TILE > oy - 8 && b.y * TILE < oy + view.height + 8;

/**
 * Position (en pixels de la carte) d'un item sur un tapis ou un splitter : de son
 * côté d'entrée jusqu'au centre (progress 0 → 0,5), puis vers la sortie (0,5 → 1).
 */
export function carriedItemPosition(b) {
  const item = b.item;
  const cx = b.x * TILE + 8, cy = b.y * TILE + 8;
  if (item.progress < 0.5) {
    const k = item.progress * 2;
    const [ex, ey] = DIRS[item.enterDir];
    return [cx - ex * 8 * (1 - k), cy - ey * 8 * (1 - k)];
  }
  const outDir = b.kind === 'splitter' ? (item.outDir ?? b.dir) : b.dir; // tapis et groupeur : devant
  const [dx, dy] = DIRS[outDir];
  const k = (item.progress - 0.5) * 2;
  return [cx + dx * 8 * k, cy + dy * 8 * k];
}

/**
 * Image d'animation d'un tapis ou d'un splitter : celle de tout le monde quand il
 * roule, figée sur la dernière quand il est arrêté (item bloqué).
 */
const frozenFrames = new WeakMap();
export function conveyorFrame(b, frame) {
  if (!b.stalled) {
    frozenFrames.delete(b);
    return frame;
  }
  if (!frozenFrames.has(b)) frozenFrames.set(b, frame);
  return frozenFrames.get(b);
}

/** Cadre autour de la machine dont la fiche est ouverte (en cases), ou null. */
export function selectionOutline() {
  const b = ui.selected;
  if (!b || !game.buildings.includes(b)) return null;
  return { x: b.x, y: b.y, w: b.w, h: b.h, color: P.amber };
}

/** Reflets blancs (2 × 1 px) sur l'eau visible, qui changent 3 fois par seconde. */
export function waterSparkles({ x0, y0, x1, y1 }, time) {
  const tick = Math.floor(time * 3);
  const sparkles = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (game.map.ground[cellIndex(x, y)] < GROUND.WATER) continue;
      const h = hash2(x, y + tick * 31);
      if (h % 9 === 0) sparkles.push([x * TILE + 2 + ((h >> 5) % 11), y * TILE + 2 + ((h >> 9) % 11)]);
    }
  }
  return sparkles;
}

/**
 * Ce qu'il faut montrer sous le curseur :
 *   outline  : cadre { x, y, w, h (en cases), color }
 *   ghost    : aperçu transparent du bâtiment à poser
 *              { kind: 'belt', x, y, dir, arms } | { kind: 'splitter' | 'merger', x, y, dir, shape, priority? }
 *              | { kind: 'machine', building }
 *   affected : Map tapis voisin → bras qu'il aura une fois le bâtiment posé
 *              (ex. une ligne droite qui deviendra un T)
 */
export function cursorPreview(cell, time) {
  if (!cell || ui.placing) return null;

  if (!isBuildTool(ui.tool)) {
    if (ui.tool === 'select') return null; // la sélection a sa propre surbrillance
    const color = ui.tool === 'erase' ? P.red : P.yellow;
    const target = buildingAt(cell.x, cell.y);
    if (target) return { outline: { x: target.x, y: target.y, w: target.w, h: target.h, color } };
    if (ui.tool === 'erase') return { outline: { x: cell.x, y: cell.y, w: 1, h: 1, color } };
    return null;
  }

  const def = BUILDINGS[ui.tool];
  const { x, y } = anchorFor(ui.tool, cell);
  // Le bâtiment tel qu'il serait posé, pour calculer les raccords.
  const virtual = { type: ui.tool, kind: def.kind, x, y, w: def.w, h: def.h, dir: ui.dir };
  let ghost, ok;
  if (hasShapes(ui.tool)) {
    const choice = shapeChoice(ui.tool, cell);
    ok = choice.ok;
    virtual.dir = choice.dir;
    virtual.shape = choice.shape;
    ghost = { kind: def.kind, x, y, dir: choice.dir, shape: choice.shape };
    if (ui.tool === 'smartSplitter') ghost.priority = virtual.priority = ui.smartPriority;
  } else if (ui.tool === 'belt') {
    ok = canPlace('belt', x, y);
    ghost = { kind: 'belt', x, y, dir: ui.dir, arms: ok ? beltArms(virtual, virtual) : [ui.dir, opposite(ui.dir)] };
  } else {
    ok = canPlace(ui.tool, x, y);
    ghost = { kind: 'machine', building: { ...virtual, anim: time * 4, working: false } };
  }
  const affected = ok ? reshapedNeighbors(virtual) : new Map();
  return { ghost, affected, outline: { x, y, w: def.w, h: def.h, color: ok ? P.lime : P.red } };
}

/** Tapis autour d'un bâtiment pas encore posé dont la forme changerait une fois posé. */
function reshapedNeighbors(virtual) {
  const changes = new Map();
  for (let cy = virtual.y; cy < virtual.y + virtual.h; cy++) {
    for (let cx = virtual.x; cx < virtual.x + virtual.w; cx++) {
      for (const [dx, dy] of DIRS) {
        const neighbor = buildingAt(cx + dx, cy + dy);
        if (neighbor?.kind !== 'belt' || changes.has(neighbor)) continue;
        const now = beltArms(neighbor), after = beltArms(neighbor, virtual);
        if (!sameSides(now, after)) changes.set(neighbor, after);
      }
    }
  }
  return changes;
}

const sameSides = (a, b) => a.length === b.length && a.every((side) => b.includes(side));

/**
 * Ce que montre la sélection (voir input/selection.js) :
 *   highlighted : bâtiments sélectionnés (ou en train de l'être), teintés en entier
 *   fills       : zones colorées en transparence { x, y, w, h (en cases), color, alpha }
 *   outlines    : cadres { x, y, w, h, color }
 *   ghosts      : aperçus du groupe qui suit le curseur (même format que dans cursorPreview)
 */
export function selectionOverlay(cell, time) {
  const fills = [], outlines = [], ghosts = [];
  const highlighted = highlightedBuildings();

  const area = selectBoxArea();
  if (area) {
    fills.push({ ...area, color: P.cyan, alpha: 0.1 });
    outlines.push({ ...area, color: P.cyan });
  }

  if (ui.placing && cell) {
    const { x0, y0, spots, ok } = placementAt(cell);
    const virtuals = spots.map(({ part, x, y }) => ({
      type: part.type, kind: part.kind, x, y, w: part.w, h: part.h, dir: part.dir, shape: part.shape, priority: part.priority,
    }));
    for (const v of virtuals) ghosts.push(groupGhost(v, virtuals, time));
    for (const { part, x, y, ok: fits } of spots) if (!fits) fills.push({ x, y, w: part.w, h: part.h, color: P.red, alpha: 0.5 });
    outlines.push({ x: x0, y: y0, w: ui.placing.w, h: ui.placing.h, color: ok ? P.lime : P.red });
  }
  return { highlighted, fills, outlines, ghosts };
}

/** Aperçu d'une pièce du groupe ; les tapis se raccordent aux autres pièces du groupe. */
function groupGhost(v, group, time) {
  if (v.kind === 'belt') return { kind: 'belt', x: v.x, y: v.y, dir: v.dir, arms: beltArms(v, group) };
  if (v.kind === 'splitter' || v.kind === 'merger') {
    return { kind: v.kind, x: v.x, y: v.y, dir: v.dir, shape: v.shape, priority: v.priority ?? undefined };
  }
  return { kind: 'machine', building: { ...v, anim: time * 4, working: false } };
}
