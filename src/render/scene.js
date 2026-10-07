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
import { splitterChoice } from '../input/splitterPicker.js';

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
  const outDir = b.kind === 'splitter' ? (item.outDir ?? b.dir) : b.dir;
  const [dx, dy] = DIRS[outDir];
  const k = (item.progress - 0.5) * 2;
  return [cx + dx * 8 * k, cy + dy * 8 * k];
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
 *   outline : cadre { x, y, w, h (en cases), color }
 *   ghost   : aperçu transparent du bâtiment à poser
 *             { kind: 'belt', x, y, dir } | { kind: 'splitter', x, y, dir, shape }
 *             | { kind: 'machine', building }
 */
export function cursorPreview(cell, time) {
  if (!cell) return null;

  if (!isBuildTool(ui.tool)) {
    const color = ui.tool === 'erase' ? P.red : P.yellow;
    const target = buildingAt(cell.x, cell.y);
    if (target) return { outline: { x: target.x, y: target.y, w: target.w, h: target.h, color } };
    if (ui.tool === 'erase') return { outline: { x: cell.x, y: cell.y, w: 1, h: 1, color } };
    return null;
  }

  const def = BUILDINGS[ui.tool];
  const { x, y } = anchorFor(ui.tool, cell);
  let ghost, ok;
  if (ui.tool === 'splitter') {
    const choice = splitterChoice(cell);
    ok = choice.ok;
    ghost = { kind: 'splitter', x, y, dir: choice.dir, shape: choice.shape };
  } else if (ui.tool === 'belt') {
    ok = canPlace('belt', x, y);
    ghost = { kind: 'belt', x, y, dir: ui.dir, arms: [ui.dir, opposite(ui.dir)] };
  } else {
    ok = canPlace(ui.tool, x, y);
    const building = { type: ui.tool, kind: def.kind, x, y, w: def.w, h: def.h, dir: ui.dir, anim: time * 4, working: false };
    ghost = { kind: 'machine', building };
  }
  return { ghost, outline: { x, y, w: def.w, h: def.h, color: ok ? P.lime : P.red } };
}
