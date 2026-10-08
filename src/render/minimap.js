// Mini-carte : la carte entière, les bâtiments, le brouillard, et le cadre de la caméra.
import { MINIMAP_SCALE, TILE } from '../config.js';
import { PALETTE as P } from '../data/palette.js';
import { game, ui, view } from '../state.js';
import { isUnderground } from '../data/buildings.js';
import { drawOn, rect } from './pen.js';
import { bakeMinimapBase } from './terrainImage.js';
import { bakeFog } from './fogImage.js';
import { fogVersion } from '../world/fog.js';

const SCALE = MINIMAP_SCALE;
let fogImage = null, fogDrawn = -1;
const COLOR_BY_KIND = { belt: P.silver, splitter: P.silver, merger: P.silver, hub: P.rose, storage: P.clay };

let base = null;

/** À appeler quand la carte change. */
export function rebuildMinimapBase() {
  base = bakeMinimapBase(game.map);
}

export function renderMinimap(ctx) {
  drawOn(ctx);
  ctx.drawImage(base, 0, 0);
  for (const b of game.buildings) {
    // Ce qui est souterrain n'apparaît qu'en vue du sous-sol ; ce qui est dans une usine, jamais.
    if (b.layer) continue;
    if (isUnderground(b) && ui.layer !== 'under') continue;
    const color = isUnderground(b) ? P.clay : COLOR_BY_KIND[b.kind] ?? P.amber;
    rect(b.x * SCALE, b.y * SCALE, b.w * SCALE, b.h * SCALE, color);
  }
  if (fogDrawn !== fogVersion) {
    fogImage = bakeFog(SCALE);
    fogDrawn = fogVersion;
  }
  ctx.drawImage(fogImage, 0, 0);
  ctx.strokeStyle = P.white;
  ctx.lineWidth = 1;
  ctx.strokeRect(
    Math.round((view.camX / TILE) * SCALE) + 0.5,
    Math.round((view.camY / TILE) * SCALE) + 0.5,
    Math.round((view.width / TILE) * SCALE) - 1,
    Math.round((view.height / TILE) * SCALE) - 1,
  );
}
