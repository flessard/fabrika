// Rendu Canvas 2D : tout est redessiné rectangle par rectangle à chaque image.
// Simple et sans dépendance ; gardé pour comparer avec PixiJS (?renderer=canvas).
//
// Ordre : terrain → eau → grille → tapis → items → machines → particules → curseur.
import { MAP_PADDING, TILE } from '../config.js';
import { PALETTE as P } from '../data/palette.js';
import { game, ui, view } from '../state.js';
import { beltArms } from '../sim/belt.js';
import { isConveyor } from '../sim/transfer.js';
import { currentCtx, drawOn, rect, withAlpha } from './pen.js';
import { bakeTerrain } from './terrainImage.js';
import { cameraOrigin, carriedItemPosition, conveyorFrame, selectionOutline, cursorPreview, isVisible, visibleCells, waterSparkles } from './scene.js';
import { beltFrame, drawBelt, drawMerger, drawMergerBase, drawMergerLid, drawSmartSplitter, drawSplitter } from './sprites/belts.js';
import { ITEM_SIZE, itemSprite } from './sprites/items.js';
import { drawMachine } from './sprites/machines.js';

export function createCanvasRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let terrainImage = null;

  return {
    name: 'Canvas 2D',

    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
      ctx.imageSmoothingEnabled = false;
    },

    rebuildTerrain() {
      terrainImage = bakeTerrain(game.map, game.seed);
    },

    render(time) {
      drawOn(ctx);
      const { ox, oy } = cameraOrigin();
      const frame = beltFrame(time);

      rect(0, 0, view.width, view.height, P.black);
      ctx.drawImage(terrainImage, -ox - MAP_PADDING, -oy - MAP_PADDING);

      const cells = visibleCells(ox, oy);
      for (const [x, y] of waterSparkles(cells, time)) rect(x - ox, y - oy, 2, 1, P.white);
      if (ui.tool !== 'hand') drawGrid(cells, ox, oy);

      // Aperçu calculé d'abord : il peut changer la forme des tapis voisins.
      const preview = cursorPreview(ui.hover, time);
      const armsOf = (b) => preview?.affected?.get(b) ?? beltArms(b);

      const visible = game.buildings.filter((b) => isVisible(b, ox, oy));
      for (const b of visible) {
        if (b.kind === 'belt') drawBelt(b.x * TILE - ox, b.y * TILE - oy, b.dir, armsOf(b), conveyorFrame(b, frame));
        else if (b.kind === 'splitter' && b.priority) drawSmartSplitter(b.x * TILE - ox, b.y * TILE - oy, b.dir, b.shape, b.priority, conveyorFrame(b, frame));
        else if (b.kind === 'splitter') drawSplitter(b.x * TILE - ox, b.y * TILE - oy, b.dir, b.shape, conveyorFrame(b, frame));
        else if (b.kind === 'merger') drawMergerBase(b.x * TILE - ox, b.y * TILE - oy, b.dir, b.shape, conveyorFrame(b, frame));
      }
      for (const b of visible) if (b.item) drawCarriedItem(b, ox, oy);
      // Le couvercle des groupeurs passe par-dessus les items, qui disparaissent dessous.
      for (const b of visible) if (b.kind === 'merger') drawMergerLid(b.x * TILE - ox, b.y * TILE - oy, b.dir, b.shape);

      // Les machines du haut d'abord, pour que celles du bas passent devant.
      const machines = visible.filter((b) => !isConveyor(b)).sort((a, b) => a.y - b.y);
      for (const b of machines) drawMachine(b, b.x * TILE - ox, b.y * TILE - oy, time);

      drawParticles(ox, oy);
      const selected = selectionOutline();
      if (selected) strokeOutline(selected, ox, oy);
      drawCursor(preview, ox, oy, time);
    },
  };
}

function drawGrid({ x0, y0, x1, y1 }, ox, oy) {
  withAlpha(0.12, () => {
    for (let x = x0; x <= x1 + 1; x++) rect(x * TILE - ox, y0 * TILE - oy, 1, (y1 - y0 + 1) * TILE, P.black);
    for (let y = y0; y <= y1 + 1; y++) rect(x0 * TILE - ox, y * TILE - oy, (x1 - x0 + 1) * TILE, 1, P.black);
  });
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

function drawCursor(preview, ox, oy, time) {
  if (!preview) return;
  const { ghost, outline } = preview;
  if (ghost) {
    const sx = ghost.x * TILE - ox, sy = ghost.y * TILE - oy;
    withAlpha(0.6, () => {
      if (ghost.kind === 'belt') drawBelt(sx, sy, ghost.dir, ghost.arms, beltFrame(time));
      else if (ghost.kind === 'splitter' && ghost.priority) drawSmartSplitter(sx, sy, ghost.dir, ghost.shape, ghost.priority, beltFrame(time));
      else if (ghost.kind === 'splitter') drawSplitter(sx, sy, ghost.dir, ghost.shape, beltFrame(time));
      else if (ghost.kind === 'merger') drawMerger(sx, sy, ghost.dir, ghost.shape, beltFrame(time));
      else drawMachine(ghost.building, ghost.building.x * TILE - ox, ghost.building.y * TILE - oy, time, { ghost: true });
    });
  }
  strokeOutline(outline, ox, oy);
}

function strokeOutline(outline, ox, oy) {
  const ctx = currentCtx();
  ctx.strokeStyle = outline.color;
  ctx.lineWidth = 1;
  ctx.strokeRect(outline.x * TILE - ox + 0.5, outline.y * TILE - oy + 0.5, outline.w * TILE - 1, outline.h * TILE - 1);
}
