// Dessine une image complète du jeu, dans cet ordre :
// terrain → eau scintillante → grille → tapis → items → machines → particules → curseur.
import { MAP_H, MAP_PADDING, MAP_W, TILE } from '../config.js';
import { DIRS, cellIndex, opposite } from '../core/grid.js';
import { hash2 } from '../core/random.js';
import { BUILDINGS, isBuildTool } from '../data/buildings.js';
import { PALETTE as P } from '../data/palette.js';
import { game, ui, view } from '../state.js';
import { GROUND } from '../world/terrain.js';
import { anchorFor, buildingAt, canPlace } from '../world/buildings.js';
import { beltArms } from '../sim/belt.js';
import { splitterChoice } from '../input/splitterPicker.js';
import { currentCtx, drawOn, rect, withAlpha } from './pen.js';
import { bakeTerrain } from './terrainImage.js';
import { drawBelt, drawSplitter } from './sprites/belts.js';
import { ITEM_SIZE, itemSprite } from './sprites/items.js';
import { drawMachine } from './sprites/machines.js';

let terrainImage = null;

/** À appeler quand la carte change. */
export function rebuildTerrainImage() {
  terrainImage = bakeTerrain(game.map, game.seed);
}

export function renderFrame(ctx, time) {
  drawOn(ctx);
  const ox = Math.round(view.camX), oy = Math.round(view.camY);

  rect(0, 0, view.width, view.height, P.black);
  ctx.drawImage(terrainImage, -ox - MAP_PADDING, -oy - MAP_PADDING);

  const cells = visibleCells(ox, oy);
  drawWaterSparkles(cells, ox, oy, time);
  if (ui.tool !== 'hand') drawGrid(cells, ox, oy);

  const visible = game.buildings.filter((b) => isVisible(b, ox, oy));
  for (const b of visible) {
    if (b.kind === 'belt') drawBelt(b.x * TILE - ox, b.y * TILE - oy, b.dir, beltArms(b), time);
    else if (b.kind === 'splitter') drawSplitter(b.x * TILE - ox, b.y * TILE - oy, b.dir, b.shape, time);
  }
  for (const b of visible) if (b.item) drawCarriedItem(b, ox, oy);

  // Les machines du haut d'abord, pour que celles du bas passent devant.
  const machines = visible.filter((b) => b.kind !== 'belt' && b.kind !== 'splitter').sort((a, b) => a.y - b.y);
  for (const b of machines) drawMachine(b, b.x * TILE - ox, b.y * TILE - oy, time);

  drawParticles(ox, oy);
  if (ui.hover) drawCursor(ui.hover, ox, oy, time);
}

// ---------- Morceaux ----------

function visibleCells(ox, oy) {
  return {
    x0: Math.max(0, Math.floor(ox / TILE)),
    y0: Math.max(0, Math.floor(oy / TILE)),
    x1: Math.min(MAP_W - 1, Math.ceil((ox + view.width) / TILE)),
    y1: Math.min(MAP_H - 1, Math.ceil((oy + view.height) / TILE)),
  };
}

const isVisible = (b, ox, oy) =>
  b.x * TILE + b.w * TILE > ox - 8 && b.x * TILE < ox + view.width + 8 &&
  b.y * TILE + b.h * TILE > oy - 8 && b.y * TILE < oy + view.height + 8;

/** Quelques reflets blancs qui changent 3 fois par seconde sur l'eau visible. */
function drawWaterSparkles({ x0, y0, x1, y1 }, ox, oy, time) {
  const tick = Math.floor(time * 3);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (game.map.ground[cellIndex(x, y)] < GROUND.WATER) continue;
      const h = hash2(x, y + tick * 31);
      if (h % 9 === 0) rect(x * TILE + 2 + ((h >> 5) % 11) - ox, y * TILE + 2 + ((h >> 9) % 11) - oy, 2, 1, P.white);
    }
  }
}

/** Grille discrète, affichée seulement quand on construit. */
function drawGrid({ x0, y0, x1, y1 }, ox, oy) {
  withAlpha(0.12, () => {
    for (let x = x0; x <= x1 + 1; x++) rect(x * TILE - ox, y0 * TILE - oy, 1, (y1 - y0 + 1) * TILE, P.black);
    for (let y = y0; y <= y1 + 1; y++) rect(x0 * TILE - ox, y * TILE - oy, (x1 - x0 + 1) * TILE, 1, P.black);
  });
}

/**
 * Position d'un item sur un tapis ou un splitter : de son côté d'entrée jusqu'au
 * centre (progress 0 → 0,5), puis du centre vers la sortie (0,5 → 1).
 */
function carriedItemPosition(b) {
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

function drawCarriedItem(b, ox, oy) {
  const [px, py] = carriedItemPosition(b);
  const sx = Math.round(px - 3 - ox), sy = Math.round(py - 3 - oy);
  withAlpha(0.3, () => rect(sx + 1, sy + 2, ITEM_SIZE, 6, P.black)); // ombre
  currentCtx().drawImage(itemSprite(b.item.type), sx, sy - 1);
}

function drawParticles(ox, oy) {
  for (const p of game.particles) {
    const fade = 1 - p.life / p.max;
    const sx = Math.round(p.x - ox), sy = Math.round(p.y - oy);
    if (p.kind === 'smoke') {
      const size = 1 + Math.floor(p.life * 3);
      withAlpha(fade * 0.7, () => rect(sx - size, sy - size, size * 2, size * 2, p.life < 0.4 ? P.mist : P.silver));
    } else if (p.kind === 'spark') {
      withAlpha(fade, () => rect(sx, sy, 1, 1, p.color));
    } else if (p.kind === 'icon') {
      withAlpha(Math.min(1, fade * 2), () => currentCtx().drawImage(itemSprite(p.itemType), sx - 3, sy - 3));
    }
  }
}

/** Cadre de survol, ou aperçu transparent (vert = possible, rouge = impossible). */
function drawCursor(cell, ox, oy, time) {
  if (!isBuildTool(ui.tool)) {
    const target = buildingAt(cell.x, cell.y);
    const color = ui.tool === 'erase' ? P.red : P.yellow;
    if (target) strokeCells(target.x, target.y, target.w, target.h, color, ox, oy);
    else if (ui.tool === 'erase') strokeCells(cell.x, cell.y, 1, 1, color, ox, oy);
    return;
  }

  const def = BUILDINGS[ui.tool];
  const { x, y } = anchorFor(ui.tool, cell);
  const sx = x * TILE - ox, sy = y * TILE - oy;
  let ok;

  withAlpha(0.6, () => {
    if (ui.tool === 'splitter') {
      const choice = splitterChoice(cell);
      ok = choice.ok;
      drawSplitter(sx, sy, choice.dir, choice.shape, time);
    } else if (ui.tool === 'belt') {
      ok = canPlace('belt', x, y);
      drawBelt(sx, sy, ui.dir, [ui.dir, opposite(ui.dir)], time);
    } else {
      ok = canPlace(ui.tool, x, y);
      const preview = { type: ui.tool, kind: def.kind, x, y, w: def.w, h: def.h, dir: ui.dir, anim: time * 4, working: false };
      drawMachine(preview, sx, sy, time, { ghost: true });
    }
  });
  strokeCells(x, y, def.w, def.h, ok ? P.lime : P.red, ox, oy);
}

function strokeCells(x, y, w, h, color, ox, oy) {
  const ctx = currentCtx();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x * TILE - ox + 0.5, y * TILE - oy + 0.5, w * TILE - 1, h * TILE - 1);
}
