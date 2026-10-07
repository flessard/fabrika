// Surbrillance des bâtiments sélectionnés : toute la silhouette de chaque bâtiment se
// teinte de cyan, avec un reflet qui la balaie en diagonale, et un seul contour fait
// le tour du groupe entier (pas de trait entre deux tapis voisins).
//
// Chaque image est fabriquée une fois à partir de la forme du bâtiment (son « masque »)
// puis gardée : le rendu PixiJS en fait une texture, le rendu Canvas 2D la dessine.
import { TILE } from '../../config.js';
import { PALETTE_RGB } from '../../data/palette.js';
import { beltArms } from '../../sim/belt.js';
import { makeCanvas } from '../pen.js';
import { BUILDINGS, isUnderground } from '../../data/buildings.js';
import { beltColors, drawBelt, drawFilter, drawMerger, drawSmartSplitter, drawSplitter, drawTunnel, drawUnderBelt, filterKey } from './belts.js';
import { animationState, drawMachineBody } from './machines.js';

/** Marge autour du bâtiment : la goulotte de sortie (4 px) et le contour (1 px). */
export const HIGHLIGHT_MARGIN = 5;
const FRAMES = 8;
/** Écart entre deux reflets, en pixels (mesuré en diagonale). */
const SHINE_PERIOD = 32;

const [CR, CG, CB] = PALETTE_RGB.cyan;
const masks = new Map();
const frames = new Map();

/** Image du reflet à un instant donné. */
export const highlightFrame = (time) => Math.floor(time * 10) % FRAMES;

/** Teinte et reflet d'un bâtiment : { key, canvas }, à dessiner en (x − marge, y − marge). */
export function selectionHighlight(b, frame) {
  const look = lookOf(b);
  const key = `hl|${look.key}|${frame}`;
  let canvas = frames.get(key);
  if (!canvas) {
    canvas = bakeTint(maskOf(look, b), b, frame);
    frames.set(key, canvas);
  }
  return { key, canvas };
}

/** Ce qui donne sa forme au bâtiment (sans l'animation, qui ne change pas la silhouette). */
function lookOf(b) {
  const m = HIGHLIGHT_MARGIN;
  switch (b.kind) {
    case 'belt': {
      const end = BUILDINGS[b.type].tunnel;
      if (end) return { key: `tunnel|${b.dir}|${end}`, draw: () => drawTunnel(m, m, b.dir, end, 0) };
      const arms = beltArms(b);
      const draw = b.type === 'underBelt' ? drawUnderBelt : drawBelt;
      return { key: `${b.type}|${b.dir}|${[...arms].sort().join('')}`, draw: () => draw(m, m, b.dir, arms, 0) };
    }
    case 'splitter': {
      const colors = beltColors(isUnderground(b));
      if (b.filters) {
        return { key: `${b.type}|${b.dir}|${b.shape}|${filterKey(b.filters)}`, draw: () => drawFilter(m, m, b.dir, b.shape, b.filters, 0, colors) };
      }
      return b.priority
        ? { key: `${b.type}|${b.dir}|${b.shape}|${b.priority.join('')}`, draw: () => drawSmartSplitter(m, m, b.dir, b.shape, b.priority, 0, colors) }
        : { key: `${b.type}|${b.dir}|${b.shape}`, draw: () => drawSplitter(m, m, b.dir, b.shape, 0, colors) };
    }
    case 'merger':
      return { key: `${b.type}|${b.dir}|${b.shape}`, draw: () => drawMerger(m, m, b.dir, b.shape, 0, beltColors(isUnderground(b))) };
    default:
      return { key: `${b.type}|${b.dir}|${b.outputOpen ? 1 : 0}`, draw: () => drawMachineBody(b, animationState(b, 0), m, m, { shadow: false }) };
  }
}

/** Pixels couverts par le bâtiment (1) ou non (0). */
function maskOf(look, b) {
  let mask = masks.get(look.key);
  if (mask) return mask;
  const w = b.w * TILE + HIGHLIGHT_MARGIN * 2, h = b.h * TILE + HIGHLIGHT_MARGIN * 2;
  const canvas = makeCanvas(w, h, look.draw);
  const { data } = canvas.getContext('2d').getImageData(0, 0, w, h);
  mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  masks.set(look.key, mask);
  return mask;
}

/** Teinte cyan sur la silhouette, et une bande claire qui glisse en diagonale. */
function bakeTint(mask, b, frame) {
  const w = b.w * TILE + HIGHLIGHT_MARGIN * 2, h = b.h * TILE + HIGHLIGHT_MARGIN * 2;
  const shift = (frame * SHINE_PERIOD) / FRAMES;

  return makeCanvas(w, h, (ctx) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        const shine = (((x + y - shift) % SHINE_PERIOD) + SHINE_PERIOD) % SHINE_PERIOD < 3;
        img.data.set(shine ? [255, 255, 255, 120] : [CR, CG, CB, 80], i * 4);
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

// ---------- Contour du groupe ----------

let lastOutline = null;

/**
 * Contour d'un pixel autour de la forme réunie de tous les bâtiments :
 * { key, canvas, x, y } avec (x, y) le coin du canevas en pixels de la carte, ou null.
 * Refait seulement quand le groupe change (la clé décrit chaque bâtiment et sa place).
 */
export function groupOutline(buildings) {
  if (!buildings.length) return null;
  const parts = buildings.map((b) => ({ b, look: lookOf(b) }));
  const key = parts.map(({ b, look }) => `${look.key}@${b.x},${b.y}`).join(';');
  if (lastOutline?.key === key) return lastOutline;

  const m = HIGHLIGHT_MARGIN;
  const x0 = Math.min(...buildings.map((b) => b.x * TILE - m));
  const y0 = Math.min(...buildings.map((b) => b.y * TILE - m));
  const w = Math.max(...buildings.map((b) => (b.x + b.w) * TILE + m)) - x0;
  const h = Math.max(...buildings.map((b) => (b.y + b.h) * TILE + m)) - y0;

  // Forme réunie : chaque masque recopié à la place de son bâtiment.
  const union = new Uint8Array(w * h);
  for (const { b, look } of parts) {
    const mask = maskOf(look, b);
    const mw = b.w * TILE + m * 2, mh = b.h * TILE + m * 2;
    const ox = b.x * TILE - m - x0, oy = b.y * TILE - m - y0;
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) if (mask[y * mw + x]) union[(oy + y) * w + ox + x] = 1;
    }
  }

  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && union[y * w + x] === 1;
  const canvas = makeCanvas(w, h, (ctx) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (inside(x, y)) continue;
        if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) {
          img.data.set([CR, CG, CB, 255], (y * w + x) * 4);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  });
  lastOutline = { key, canvas, x: x0, y: y0 };
  return lastOutline;
}
