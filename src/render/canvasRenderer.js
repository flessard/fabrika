// Rendu Canvas 2D : tout est redessiné rectangle par rectangle à chaque image.
// Simple et sans dépendance ; gardé pour comparer avec PixiJS (?renderer=canvas).
//
// Ordre : terrain → eau → grille → tapis → items → machines → particules
//   → (vue du sous-sol : voile sombre, tapis souterrains et tunnels, leurs items) → curseur.
import { MAP_PADDING, TILE } from '../config.js';
import { BUILDINGS, isUnderground } from '../data/buildings.js';
import { PALETTE as P } from '../data/palette.js';
import { game, ui, view } from '../state.js';
import { beltArms } from '../sim/belt.js';
import { isConveyor } from '../sim/transfer.js';
import { currentCtx, drawOn, rect, withAlpha } from './pen.js';
import { bakeTerrain } from './terrainImage.js';
import { cameraOrigin, carriedItemPosition, conveyorFrame, machinePorts, selectionOutline, selectionOverlay, cursorPreview, isVisible, visibleCells, waterSparkles } from './scene.js';
import {
  beltColors, beltFrame, drawBelt, drawFilter, drawMerger, drawMergerBase, drawMergerLid, drawSmartSplitter, drawSplitter,
  drawTunnel, drawTunnelBase, drawTunnelLid, drawUnderBelt,
} from './sprites/belts.js';
import { ITEM_SIZE, itemSprite } from './sprites/items.js';
import { drawMachine } from './sprites/machines.js';
import { HIGHLIGHT_MARGIN, groupOutline, highlightFrame, selectionHighlight } from './sprites/highlight.js';
import { DOCK_SIZE, PORT_SIZE, drawDock, drawPort } from './sprites/ports.js';

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

      /** Tapis, splitters, groupeurs et tunnels, puis leurs items, puis les couvercles par-dessus. */
      const drawConveyors = (list) => {
        for (const b of list) {
          const sx = b.x * TILE - ox, sy = b.y * TILE - oy, f = conveyorFrame(b, frame);
          const colors = beltColors(isUnderground(b));
          if (BUILDINGS[b.type].tunnel) drawTunnelBase(sx, sy, b.dir, f);
          else if (b.type === 'underBelt') drawUnderBelt(sx, sy, b.dir, armsOf(b), f);
          else if (b.kind === 'belt') drawBelt(sx, sy, b.dir, armsOf(b), f);
          else if (b.kind === 'splitter' && b.filters) drawFilter(sx, sy, b.dir, b.shape, b.filters, f, colors);
          else if (b.kind === 'splitter' && b.priority) drawSmartSplitter(sx, sy, b.dir, b.shape, b.priority, f, colors);
          else if (b.kind === 'splitter') drawSplitter(sx, sy, b.dir, b.shape, f, colors);
          else drawMergerBase(sx, sy, b.dir, b.shape, f, colors);
        }
        for (const b of list) if (b.item) drawCarriedItem(b, ox, oy);
        // Les items disparaissent sous le couvercle des groupeurs et le portail des tunnels.
        for (const b of list) {
          const end = BUILDINGS[b.type].tunnel;
          if (end) drawTunnelLid(b.x * TILE - ox, b.y * TILE - oy, b.dir, end);
          else if (b.kind === 'merger') drawMergerLid(b.x * TILE - ox, b.y * TILE - oy, b.dir, b.shape);
        }
      };

      // Tapis, splitters et groupeurs souterrains : seulement en vue du sous-sol.
      // Les tunnels sont aux deux étages.
      const visible = game.buildings.filter((b) => isVisible(b, ox, oy));
      const conveyors = visible.filter(isConveyor);
      drawConveyors(conveyors.filter((b) => !isUnderground(b)));

      // Les machines du haut d'abord, pour que celles du bas passent devant.
      const machines = visible.filter((b) => !isConveyor(b)).sort((a, b) => a.y - b.y);
      for (const b of machines) drawMachine(b, b.x * TILE - ox, b.y * TILE - oy, time);
      for (const p of machinePorts(machines)) {
        if (p.connected) drawDock(Math.round(p.x - DOCK_SIZE / 2 - ox), Math.round(p.y - DOCK_SIZE / 2 - oy), p.dir, p.kind);
        else withAlpha(p.faint ? 0.6 : 1, () => drawPort(Math.round(p.x - PORT_SIZE / 2 - ox), Math.round(p.y - PORT_SIZE / 2 - oy), p.dir, p.kind));
      }

      drawParticles(ox, oy);

      if (ui.layer === 'under') {
        withAlpha(0.8, () => rect(0, 0, view.width, view.height, P.soot));
        drawConveyors(conveyors.filter((b) => isUnderground(b) || BUILDINGS[b.type].tunnel));
      }

      const selected = selectionOutline();
      if (selected) strokeOutline(selected, ox, oy);
      drawSelection(selectionOverlay(ui.hover, time), ox, oy, time);
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
  for (const g of preview.ghosts ?? []) drawGhost(g, ox, oy, time);
  for (const outline of preview.outlines) strokeOutline(outline, ox, oy);
}

function drawSelection({ highlighted, fills, outlines, ghosts }, ox, oy, time) {
  const shine = highlightFrame(time), pulse = 0.8 + 0.2 * Math.sin(time * 5);
  withAlpha(pulse, () => {
    for (const b of highlighted) {
      const { canvas } = selectionHighlight(b, shine);
      currentCtx().drawImage(canvas, b.x * TILE - ox - HIGHLIGHT_MARGIN, b.y * TILE - oy - HIGHLIGHT_MARGIN);
    }
    const outline = groupOutline(highlighted);
    if (outline) currentCtx().drawImage(outline.canvas, outline.x - ox, outline.y - oy);
  });
  for (const f of fills) withAlpha(f.alpha, () => rect(f.x * TILE - ox, f.y * TILE - oy, f.w * TILE, f.h * TILE, f.color));
  for (const g of ghosts) drawGhost(g, ox, oy, time);
  for (const outline of outlines) strokeOutline(outline, ox, oy);
}

function drawGhost(ghost, ox, oy, time) {
  const sx = ghost.x * TILE - ox, sy = ghost.y * TILE - oy;
  withAlpha(0.6, () => {
    if (ghost.kind === 'belt') drawBelt(sx, sy, ghost.dir, ghost.arms, beltFrame(time));
    else if (ghost.kind === 'underBelt') drawUnderBelt(sx, sy, ghost.dir, ghost.arms, beltFrame(time));
    else if (ghost.kind === 'tunnel') drawTunnel(sx, sy, ghost.dir, ghost.end, beltFrame(time));
    else if (ghost.kind === 'splitter' && ghost.filters) drawFilter(sx, sy, ghost.dir, ghost.shape, ghost.filters, beltFrame(time), beltColors(ghost.under));
    else if (ghost.kind === 'splitter' && ghost.priority) drawSmartSplitter(sx, sy, ghost.dir, ghost.shape, ghost.priority, beltFrame(time), beltColors(ghost.under));
    else if (ghost.kind === 'splitter') drawSplitter(sx, sy, ghost.dir, ghost.shape, beltFrame(time), beltColors(ghost.under));
    else if (ghost.kind === 'merger') drawMerger(sx, sy, ghost.dir, ghost.shape, beltFrame(time), beltColors(ghost.under));
    else drawMachine(ghost.building, ghost.building.x * TILE - ox, ghost.building.y * TILE - oy, time, { ghost: true });
  });
}

function strokeOutline(outline, ox, oy) {
  const ctx = currentCtx();
  ctx.strokeStyle = outline.color;
  ctx.lineWidth = 1;
  ctx.strokeRect(outline.x * TILE - ox + 0.5, outline.y * TILE - oy + 0.5, outline.w * TILE - 1, outline.h * TILE - 1);
}
