// Dessin des tapis et des splitters (16 × 16, animés).
import { BELT_SPEED, TILE } from '../../config.js';
import { DIRS, opposite } from '../../core/grid.js';
import { PALETTE as P } from '../../data/palette.js';
import { priorityOrder, splitterOutputs } from '../../data/splitterShapes.js';
import { mergerInputs } from '../../data/mergerShapes.js';
import { rect, rotatedRect, withAlpha } from '../pen.js';

/**
 * Un tapis = une plaque centrale + un « bras » par côté branché (voir beltArms).
 * Les rails sont dessinés d'abord, puis le fond du tapis par-dessus : les bras
 * se fondent ainsi proprement en L, en T ou en croix.
 *
 * `outputs` : côtés où les lamelles s'éloignent du centre (la sortie, ou les
 * sorties d'un splitter). Sur les autres bras, elles avancent vers le centre.
 * `frame` (0 à 3) : position des lamelles, voir beltFrame().
 */
export function drawBelt(sx, sy, dir, arms, frame, outputs = [dir]) {
  const arm = (side, x, y, w, h, color) => rotatedRect(sx, sy, side, x, y, w, h, color);

  // Contour
  rect(sx + 1, sy + 1, 14, 14, P.black);
  for (const side of arms) arm(side, 8, 1, 8, 14, P.black);
  // Rails
  for (const side of arms) {
    arm(side, 2, 2, 14, 2, P.steel);
    arm(side, 2, 12, 14, 2, P.steel);
  }
  // Fond du tapis
  rect(sx + 4, sy + 4, 8, 8, P.night);
  for (const side of arms) arm(side, 4, 4, 12, 8, P.night);

  // Lamelles qui défilent
  for (const side of arms) drawSlats(sx, sy, side, outputs.includes(side), frame);

  // Petite flèche de direction (seulement pour un tapis simple)
  if (outputs.length === 1) {
    withAlpha(0.55, () => {
      arm(dir, 7, 6, 1, 1, P.amber);
      arm(dir, 8, 7, 1, 2, P.amber);
      arm(dir, 7, 9, 1, 1, P.amber);
    });
  }
}

function drawSlats(sx, sy, side, isOutput, offset) {
  // Une sortie couvre aussi le centre ; une entrée seulement le bout de son bras.
  const start = isOutput ? 4 : 12;
  const [ax, ay] = DIRS[side];
  const vx = isOutput ? ax : -ax;
  const vy = isOutput ? ay : -ay;

  let x0, x1, y0, y1;
  if (side === 0) { x0 = start; x1 = 15; y0 = 4; y1 = 11; }
  else if (side === 2) { x0 = 0; x1 = 15 - start; y0 = 4; y1 = 11; }
  else if (side === 1) { x0 = 4; x1 = 11; y0 = start; y1 = 15; }
  else { x0 = 4; x1 = 11; y0 = 0; y1 = 15 - start; }

  const onSlat = (v, velocity) => (((v - velocity * offset) % 4) + 4) % 4 === 0;
  if (vx) {
    for (let x = x0; x <= x1; x++) if (onSlat(x, vx)) rect(sx + x, sy + y0, 1, y1 - y0 + 1, P.slate);
  } else {
    for (let y = y0; y <= y1; y++) if (onSlat(y, vy)) rect(sx + x0, sy + y, x1 - x0 + 1, 1, P.slate);
  }
}

/** Les lamelles se répètent tous les 4 pixels : l'animation d'un tapis a 4 images. */
export const BELT_FRAMES = 4;
export const beltFrame = (time) => Math.floor((time * BELT_SPEED * TILE) % BELT_FRAMES);

/** Splitter : un tapis avec un bras par sortie + l'entrée, et un boîtier orange au centre. */
export function drawSplitter(sx, sy, dir, shapeId, frame) {
  const outputs = splitterOutputs(dir, shapeId);
  drawBelt(sx, sy, dir, [...outputs, opposite(dir)], frame, outputs);

  rect(sx + 4, sy + 4, 8, 8, P.black);
  rect(sx + 5, sy + 5, 6, 6, P.orange);
  rect(sx + 5, sy + 5, 6, 1, P.amber);
  rect(sx + 5, sy + 10, 6, 1, P.rust);
  rect(sx + 7, sy + 7, 2, 2, P.black);

  // Une flèche jaune vers chaque sortie
  for (const side of outputs) {
    rotatedRect(sx, sy, side, 12, 6, 1, 4, P.yellow);
    rotatedRect(sx, sy, side, 13, 7, 1, 2, P.yellow);
  }
}

/**
 * Groupeur, partie du dessous : un bras de tapis par entrée (lamelles vers le centre)
 * et un bras de sortie devant.
 */
export function drawMergerBase(sx, sy, dir, shapeId, frame) {
  const inputs = mergerInputs(dir, shapeId);
  drawBelt(sx, sy, dir, [...inputs, dir], frame, [dir]);
}

/**
 * Groupeur, couvercle : un boîtier fermé dessiné par-dessus les items, qui
 * disparaissent dessous en le traversant. Flèches cyan qui rentrent, flèche jaune qui sort.
 */
export function drawMergerLid(sx, sy, dir, shapeId) {
  rect(sx + 2, sy + 2, 12, 12, P.black);
  rect(sx + 3, sy + 3, 10, 10, P.ocean);
  rect(sx + 3, sy + 3, 10, 1, P.sky);
  rect(sx + 3, sy + 12, 10, 1, P.night);
  for (const [x, y] of [[4, 4], [11, 4], [4, 11], [11, 11]]) rect(sx + x, sy + y, 1, 1, P.cyan);
  // Fente centrale
  rect(sx + 6, sy + 6, 4, 4, P.night);
  rect(sx + 7, sy + 7, 2, 2, P.black);

  for (const side of mergerInputs(dir, shapeId)) {
    rotatedRect(sx, sy, side, 12, 7, 1, 2, P.cyan);
    rotatedRect(sx, sy, side, 13, 6, 1, 4, P.cyan);
  }
  rotatedRect(sx, sy, dir, 13, 6, 1, 4, P.yellow);
  rotatedRect(sx, sy, dir, 14, 7, 1, 2, P.yellow);
}

/** Groupeur complet (icônes, aperçu sous le curseur). */
export function drawMerger(sx, sy, dir, shapeId, frame) {
  drawMergerBase(sx, sy, dir, shapeId, frame);
  drawMergerLid(sx, sy, dir, shapeId);
}

// ---------- Splitter prioritaire ----------

/** Petits chiffres 3 × 5 pour numéroter les sorties. */
const DIGITS = {
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'],
};
const RANK_COLORS = [P.yellow, P.cream, P.silver];
/** Coin du chiffre sur le bras de chaque côté (droite, bas, gauche, haut), toujours à l'endroit. */
const DIGIT_SPOT = [[12, 5], [6, 11], [1, 5], [6, 0]];

function drawDigit(sx, sy, n, color) {
  DIGITS[n].forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') rect(sx + x, sy + y, 1, 1, color); }));
}

/**
 * Splitter prioritaire : boîtier violet, et chaque sortie porte son numéro
 * de priorité (1 en jaune, 2 en crème, 3 en gris).
 */
export function drawSmartSplitter(sx, sy, dir, shapeId, priority, frame) {
  const outputs = splitterOutputs(dir, shapeId);
  drawBelt(sx, sy, dir, [...outputs, opposite(dir)], frame, outputs);

  rect(sx + 4, sy + 4, 8, 8, P.black);
  rect(sx + 5, sy + 5, 6, 6, P.plum);
  rect(sx + 5, sy + 5, 6, 1, P.rose);
  rect(sx + 5, sy + 10, 6, 1, P.night);
  rect(sx + 7, sy + 7, 2, 2, P.yellow);

  priorityOrder(dir, shapeId, priority).forEach((side, rank) => {
    const [x, y] = DIGIT_SPOT[side];
    rect(sx + x - 1, sy + y - 1, 5, 7, P.black);
    drawDigit(sx + x, sy + y, rank + 1, RANK_COLORS[rank]);
  });
}
