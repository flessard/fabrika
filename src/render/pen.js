// Outils de dessin pixel par pixel.
//
// On dessine toujours sur un « canevas courant », choisi avec drawOn(ctx).
// Ça garde le code des sprites très court : rect(x, y, w, h, couleur).
// makeCanvas() change temporairement de canevas pour fabriquer un sprite.
import { TILE } from '../config.js';

let ctx = null;

export const drawOn = (context) => { ctx = context; };
export const currentCtx = () => ctx;

export function rect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Disque plein en pixels, centré sur (cx, cy). */
export function disc(cx, cy, r, color) {
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r + r * 0.8 - dy * dy));
    rect(cx - half, cy + dy, half * 2 + 1, 1, color);
  }
}

/** Dessine avec une transparence (multipliée par celle déjà active). */
export function withAlpha(alpha, draw) {
  const previous = ctx.globalAlpha;
  ctx.globalAlpha = previous * alpha;
  draw();
  ctx.globalAlpha = previous;
}

/**
 * Rectangle décrit dans une case orientée vers la droite, puis tourné pour faire face
 * au côté `side`. Permet de dessiner une seule fois un bras de tapis ou une flèche,
 * et de l'utiliser dans les 4 directions.
 */
export function rotatedRect(sx, sy, side, x, y, w, h, color) {
  let nx, ny, nw = w, nh = h;
  if (side === 0) { nx = x; ny = y; }
  else if (side === 1) { nx = TILE - y - h; ny = x; nw = h; nh = w; }
  else if (side === 2) { nx = TILE - x - w; ny = TILE - y - h; }
  else { nx = y; ny = TILE - x - w; nw = h; nh = w; }
  rect(sx + nx, sy + ny, nw, nh, color);
}

/** Crée un canevas hors écran de w × h et dessine dedans avec draw(). */
export function makeCanvas(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const previous = ctx;
  ctx = canvas.getContext('2d');
  draw(ctx);
  ctx = previous;
  return canvas;
}
