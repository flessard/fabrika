// Mini-carte : la carte entière à 2 pixels par case, les bâtiments, et le cadre de la caméra.
import { TILE } from '../config.js';
import { PALETTE as P } from '../data/palette.js';
import { game, view } from '../state.js';
import { drawOn, rect } from './pen.js';
import { bakeMinimapBase } from './terrainImage.js';

const SCALE = 2;
const COLOR_BY_KIND = { belt: P.silver, splitter: P.silver, hub: P.rose };

let base = null;

/** À appeler quand la carte change. */
export function rebuildMinimapBase() {
  base = bakeMinimapBase(game.map);
}

export function renderMinimap(ctx) {
  drawOn(ctx);
  ctx.drawImage(base, 0, 0);
  for (const b of game.buildings) {
    rect(b.x * SCALE, b.y * SCALE, b.w * SCALE, b.h * SCALE, COLOR_BY_KIND[b.kind] ?? P.amber);
  }
  ctx.strokeStyle = P.white;
  ctx.lineWidth = 1;
  ctx.strokeRect(
    Math.round((view.camX / TILE) * SCALE) + 0.5,
    Math.round((view.camY / TILE) * SCALE) + 0.5,
    Math.round((view.width / TILE) * SCALE) - 1,
    Math.round((view.height / TILE) * SCALE) - 1,
  );
}
