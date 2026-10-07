// Dessin des tapis et des splitters (16 × 16, animés).
import { BELT_SPEED, TILE } from '../../config.js';
import { DIRS, opposite } from '../../core/grid.js';
import { PALETTE as P } from '../../data/palette.js';
import { filterFor, priorityOrder, splitterOutputs } from '../../data/splitterShapes.js';
import { ITEMS } from '../../data/items.js';
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
 * `colors` : couleurs des rails, du fond, des lamelles et de la flèche.
 */
export const SURFACE_COLORS = { rail: P.steel, floor: P.night, slat: P.slate, arrow: P.amber };
/** Sous-sol : rails couleur terre et flèche cyan, pour reconnaître les tapis souterrains d'un coup d'œil. */
export const UNDER_COLORS = { rail: P.clay, floor: P.soot, slat: P.bark, arrow: P.cyan };
/** Couleurs du tapis sous un bâtiment : de la terre s'il est souterrain. */
export const beltColors = (underground) => (underground ? UNDER_COLORS : SURFACE_COLORS);

export function drawBelt(sx, sy, dir, arms, frame, outputs = [dir], colors = SURFACE_COLORS) {
  const arm = (side, x, y, w, h, color) => rotatedRect(sx, sy, side, x, y, w, h, color);

  // Contour
  rect(sx + 1, sy + 1, 14, 14, P.black);
  for (const side of arms) arm(side, 8, 1, 8, 14, P.black);
  // Rails
  for (const side of arms) {
    arm(side, 2, 2, 14, 2, colors.rail);
    arm(side, 2, 12, 14, 2, colors.rail);
  }
  // Fond du tapis
  rect(sx + 4, sy + 4, 8, 8, colors.floor);
  for (const side of arms) arm(side, 4, 4, 12, 8, colors.floor);

  // Lamelles qui défilent
  for (const side of arms) drawSlats(sx, sy, side, outputs.includes(side), frame, colors.slat);

  // Petite flèche de direction (seulement pour un tapis simple)
  if (outputs.length === 1) {
    withAlpha(0.55, () => {
      arm(dir, 7, 6, 1, 1, colors.arrow);
      arm(dir, 8, 7, 1, 2, colors.arrow);
      arm(dir, 7, 9, 1, 1, colors.arrow);
    });
  }
}

/** Tapis souterrain : même forme qu'un tapis, couleurs de la terre. */
export function drawUnderBelt(sx, sy, dir, arms, frame) {
  drawBelt(sx, sy, dir, arms, frame, [dir], UNDER_COLORS);
}

// ---------- Tunnel ----------
//
// Un bout de tapis droit, et un portail par-dessus : les items y disparaissent
// (entrée) ou en sortent (sortie). Le portail est dessiné après les items, comme
// le couvercle du groupeur.

/** Dessous du tunnel : un tapis droit. */
export function drawTunnelBase(sx, sy, dir, frame) {
  drawBelt(sx, sy, dir, [dir, opposite(dir)], frame);
}

/**
 * Portail du tunnel. Dessiné tourné vers la droite (le sens du flux), puis tourné
 * vers `dir`. Entrée : le portail couvre l'avant et sa bouche regarde l'arrière.
 * Sortie : il couvre l'arrière et sa bouche regarde l'avant.
 */
export function drawTunnelLid(sx, sy, dir, end) {
  const part = (x, y, w, h, color) => rotatedRect(sx, sy, dir, end === 'in' ? x : 16 - x - w, y, w, h, color);
  // Boîtier
  part(7, 1, 9, 14, P.black);
  part(8, 2, 7, 12, P.steel);
  part(8, 2, 7, 1, P.silver);
  part(8, 13, 7, 1, P.slate);
  // Bouche sombre où le tapis plonge
  part(8, 4, 3, 8, P.black);
  part(11, 4, 1, 8, P.night);
  // Rayures de danger
  for (let i = 0; i < 5; i++) part(13, 3 + i * 2, 1, 2, i % 2 ? P.black : P.amber);
  // Voyant : cyan pour l'entrée (ça descend), vert pour la sortie (ça remonte)
  part(12, 7, 1, 2, end === 'in' ? P.cyan : P.lime);
}

/** Tunnel complet (icônes, aperçu sous le curseur). */
export function drawTunnel(sx, sy, dir, end, frame) {
  drawTunnelBase(sx, sy, dir, frame);
  drawTunnelLid(sx, sy, dir, end);
}

function drawSlats(sx, sy, side, isOutput, offset, color) {
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
    for (let x = x0; x <= x1; x++) if (onSlat(x, vx)) rect(sx + x, sy + y0, 1, y1 - y0 + 1, color);
  } else {
    for (let y = y0; y <= y1; y++) if (onSlat(y, vy)) rect(sx + x0, sy + y, x1 - x0 + 1, 1, color);
  }
}

/** Les lamelles se répètent tous les 4 pixels : l'animation d'un tapis a 4 images. */
export const BELT_FRAMES = 4;
export const beltFrame = (time) => Math.floor((time * BELT_SPEED * TILE) % BELT_FRAMES);

/**
 * Splitter : un tapis avec un bras par sortie + l'entrée, et un boîtier orange au centre.
 * `colors` : couleurs du tapis (UNDER_COLORS pour la version souterraine).
 */
export function drawSplitter(sx, sy, dir, shapeId, frame, colors = SURFACE_COLORS) {
  const outputs = splitterOutputs(dir, shapeId);
  drawBelt(sx, sy, dir, [...outputs, opposite(dir)], frame, outputs, colors);

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
export function drawMergerBase(sx, sy, dir, shapeId, frame, colors = SURFACE_COLORS) {
  const inputs = mergerInputs(dir, shapeId);
  drawBelt(sx, sy, dir, [...inputs, dir], frame, [dir], colors);
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
export function drawMerger(sx, sy, dir, shapeId, frame, colors = SURFACE_COLORS) {
  drawMergerBase(sx, sy, dir, shapeId, frame, colors);
  drawMergerLid(sx, sy, dir, shapeId);
}

// ---------- Filtre ----------

/** Clé courte des réglages d'un filtre, pour les textures en cache. */
export const filterKey = (filters) => `${filters.F.join(',')}/${filters.L.join(',')}/${filters.R.join(',')}`;

/**
 * Filtre : boîtier vert en entonnoir. Chaque sortie montre la couleur des items qu'elle
 * prend (2 pastilles au plus, et un point blanc s'il y en a d'autres) ; une sortie sans
 * liste (« le reste ») garde sa flèche jaune.
 */
export function drawFilter(sx, sy, dir, shapeId, filters, frame, colors = SURFACE_COLORS) {
  const outputs = splitterOutputs(dir, shapeId);
  drawBelt(sx, sy, dir, [...outputs, opposite(dir)], frame, outputs, colors);

  rect(sx + 4, sy + 4, 8, 8, P.black);
  rect(sx + 5, sy + 5, 6, 6, P.forest);
  rect(sx + 5, sy + 5, 6, 1, P.leaf);
  rect(sx + 5, sy + 10, 6, 1, P.pine);
  // Entonnoir
  rect(sx + 6, sy + 6, 4, 1, P.mist);
  rect(sx + 7, sy + 7, 2, 1, P.mist);
  rect(sx + 7, sy + 8, 2, 2, P.white);

  for (const side of outputs) {
    const items = filterFor(filters, dir, side);
    if (!items.length) {
      rotatedRect(sx, sy, side, 12, 6, 1, 4, P.yellow);
      rotatedRect(sx, sy, side, 13, 7, 1, 2, P.yellow);
      continue;
    }
    // Support noir, puis une pastille de 3 × 3 par item : sa couleur claire (lisible même
    // pour le charbon, presque noir), avec sa couleur de base en ombre.
    rotatedRect(sx, sy, side, 11, 3, 5, 10, P.black);
    items.slice(0, 2).forEach((type, k) => {
      rotatedRect(sx, sy, side, 12, 4 + k * 4, 3, 3, ITEMS[type].light);
      rotatedRect(sx, sy, side, 13, 5 + k * 4, 2, 2, ITEMS[type].base);
    });
    if (items.length > 2) rotatedRect(sx, sy, side, 13, 12, 1, 1, P.white);
  }
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
export function drawSmartSplitter(sx, sy, dir, shapeId, priority, frame, colors = SURFACE_COLORS) {
  const outputs = splitterOutputs(dir, shapeId);
  drawBelt(sx, sy, dir, [...outputs, opposite(dir)], frame, outputs, colors);

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
