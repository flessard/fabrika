// Dessin des machines (foreuse, four, presse) et du dépôt.
// Chaque machine = un sprite fixe (fabriqué une fois) + des parties animées par-dessus.
import { MACHINE_OUTPUT_SLOTS, TILE } from '../../config.js';
import { DOWN, LEFT, RIGHT } from '../../core/grid.js';
import { hash2 } from '../../core/random.js';
import { PALETTE as P } from '../../data/palette.js';
import { outputCell } from '../../world/buildings.js';
import { pressPistonOffset } from '../../sim/machines.js';
import { currentCtx, disc, makeCanvas, rect, withAlpha } from '../pen.js';

// ---------- Sprites fixes ----------

/** Bande de rayures jaunes et noires. */
function hazardStripes(x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) rect(x, y, 1, 1, ((x + y) >> 1) & 2 ? P.black : P.amber);
  }
}

const STATIC_SPRITES = {
  drill: () => makeCanvas(32, 32, () => {
    rect(0, 0, 32, 32, P.black);
    // Toit jaune avec le puits de forage
    rect(1, 1, 30, 17, P.amber);
    rect(1, 1, 30, 1, P.yellow);
    rect(1, 17, 30, 1, P.orange);
    disc(16, 9, 7, P.black);
    disc(16, 9, 6, P.night);
    for (const [x, y] of [[3, 3], [28, 3], [3, 15], [28, 15]]) rect(x, y, 1, 1, P.bark);
    // Façade : grilles d'aération, petite fenêtre, rayures
    rect(1, 18, 30, 12, P.steel);
    rect(1, 18, 30, 1, P.silver);
    for (let i = 0; i < 3; i++) rect(4, 20 + i * 2, 9, 1, P.slate);
    rect(19, 20, 8, 4, P.black);
    rect(20, 21, 6, 2, P.sky);
    rect(20, 21, 2, 1, P.cyan);
    hazardStripes(1, 26, 30, 4);
    rect(1, 30, 30, 1, P.soot);
  }),

  furnace: () => makeCanvas(32, 32, () => {
    rect(0, 0, 32, 32, P.black);
    // Toit en ardoise et cheminée
    rect(1, 1, 30, 17, P.slate);
    rect(1, 1, 30, 1, P.steel);
    for (const y of [5, 9, 13]) rect(1, y, 30, 1, P.night);
    rect(20, 1, 8, 10, P.black);
    rect(21, 2, 6, 8, P.rust);
    rect(21, 2, 6, 1, P.copper);
    rect(22, 3, 4, 2, P.black);
    // Façade en briques
    for (let y = 18; y < 30; y++) {
      for (let x = 1; x < 31; x++) {
        const row = (y - 18) >> 2;
        const mortar = (y - 18) % 4 === 3 || (x + (row & 1) * 4) % 8 === 7;
        rect(x, y, 1, 1, mortar ? P.bark : hash2(x, y) % 7 === 0 ? P.copper : P.rust);
      }
    }
    // Bouche du four (le feu est animé)
    rect(10, 20, 12, 10, P.black);
    rect(11, 19, 10, 1, P.black);
    rect(1, 30, 30, 1, P.soot);
  }),

  press: () => makeCanvas(32, 32, () => {
    rect(0, 0, 32, 32, P.black);
    // Dessus en acier avec 4 colonnes
    rect(1, 1, 30, 17, P.silver);
    rect(1, 1, 30, 1, P.mist);
    rect(1, 17, 30, 1, P.steel);
    for (const [x, y] of [[2, 2], [25, 2], [2, 12], [25, 12]]) {
      rect(x, y, 5, 5, P.black);
      rect(x + 1, y + 1, 3, 3, P.mist);
      rect(x + 1, y + 1, 3, 1, P.white);
    }
    rect(8, 2, 16, 15, P.slate);
    // Façade
    rect(1, 18, 30, 12, P.steel);
    rect(1, 18, 30, 1, P.silver);
    rect(4, 20, 8, 4, P.black);
    rect(18, 20, 10, 1, P.slate);
    rect(18, 22, 10, 1, P.slate);
    hazardStripes(1, 26, 30, 4);
    rect(1, 30, 30, 1, P.soot);
  }),

  hub: () => makeCanvas(48, 48, () => {
    rect(0, 0, 48, 48, P.black);
    // Toit rose rayé et trappe de livraison
    rect(1, 1, 46, 27, P.rose);
    rect(1, 1, 46, 1, P.salmon);
    for (let x = 3; x < 46; x += 6) rect(x, 2, 2, 25, P.plum);
    rect(14, 5, 20, 18, P.black);
    rect(15, 6, 18, 16, P.yellow);
    rect(17, 8, 14, 12, P.night);
    // Façade et porte de garage
    rect(1, 28, 46, 18, P.plum);
    rect(1, 28, 46, 1, P.rose);
    rect(15, 31, 18, 15, P.black);
    for (let y = 33; y < 46; y += 2) rect(16, y, 16, 1, P.slate);
    rect(16, 32, 16, 1, P.night);
    rect(1, 46, 46, 1, P.soot);
    // Mât du drapeau (le drapeau est animé)
    rect(3, 4, 1, 14, P.silver);
  }),
};

const spriteCache = {};
export function machineSprite(type) {
  spriteCache[type] ??= STATIC_SPRITES[type]();
  return spriteCache[type];
}

// ---------- Parties animées ----------
//
// L'animation d'une machine est décrite par un petit « état » fait de nombres entiers
// (numéro d'image, allumé ou non…). Un même état donne toujours le même dessin :
// le rendu PixiJS peut donc fabriquer une texture par état et la réutiliser.

const BLADE_FRAMES = 12;           // images pour un tiers de tour des lames
const BLADE_PERIOD = (Math.PI * 2) / 3;
const FLAG_FRAMES = 8;             // images pour une ondulation du drapeau
const FLAG_SPEED = 5;              // radians par seconde

/** État d'animation d'une machine à un instant donné. */
export function animationState(b, time) {
  switch (b.type) {
    case 'drill':
      return { blade: Math.floor(((b.anim % BLADE_PERIOD) / BLADE_PERIOD) * BLADE_FRAMES) };
    case 'furnace':
      return { lit: b.working ? 1 : 0, flicker: b.working ? Math.floor(time * 12) % 8 : 0 };
    case 'press':
      return { lit: b.working ? 1 : 0, piston: pressPistonOffset(b) };
    case 'hub':
      return {
        flag: Math.floor(((time * FLAG_SPEED) / (Math.PI * 2)) * FLAG_FRAMES) % FLAG_FRAMES,
        blink: Math.floor(time * 2) % 2,
      };
    default:
      return {};
  }
}

const ANIMATE = {
  drill({ blade }, sx, sy) {
    // Trois lames qui tournent dans le puits
    const base = (blade / BLADE_FRAMES) * BLADE_PERIOD;
    for (let k = 0; k < 3; k++) {
      const angle = base + k * BLADE_PERIOD;
      for (let l = 1; l <= 5; l++) {
        rect(Math.round(sx + 16 + Math.cos(angle) * l), Math.round(sy + 9 + Math.sin(angle) * l), 1, 1, l > 4 ? P.silver : P.mist);
      }
    }
    rect(sx + 15, sy + 8, 3, 3, P.yellow);
  },

  furnace({ lit, flicker }, sx, sy) {
    if (lit) {
      rect(sx + 11, sy + 21, 10, 9, P.orange);
      for (let k = 0; k < 7; k++) {
        const h = hash2(k, flicker);
        rect(sx + 11 + (h % 10), sy + 22 + ((h >> 4) % 8), 1, 1, (h >> 8) & 1 ? P.yellow : P.amber);
      }
      rect(sx + 11, sy + 21, 10, 1, P.yellow);
    } else {
      rect(sx + 11, sy + 21, 10, 9, P.soot);
      rect(sx + 13, sy + 28, 2, 1, P.rust);
      rect(sx + 17, sy + 27, 1, 1, P.bark);
    }
  },

  press({ lit, piston }, sx, sy) {
    rect(sx + 9, sy + 3 + piston, 14, 11, P.black);
    rect(sx + 10, sy + 4 + piston, 12, 9, P.mist);
    rect(sx + 10, sy + 4 + piston, 12, 1, P.white);
    rect(sx + 10, sy + 12 + piston, 12, 1, P.silver);
    rect(sx + 5, sy + 21, 6, 2, lit ? P.lime : P.forest);
  },

  hub({ flag, blink }, sx, sy) {
    // Drapeau qui ondule
    const phase = (flag / FLAG_FRAMES) * Math.PI * 2;
    for (let c = 0; c < 8; c++) {
      const wave = Math.round(Math.sin(phase - c * 0.8));
      rect(sx + 4 + c, sy + 4 + wave, 1, 5, c === 0 ? P.wine : P.red);
    }
    rect(sx + 6, sy + 33, 3, 3, blink ? P.lime : P.forest);
    rect(sx + 39, sy + 33, 3, 3, blink ? P.forest : P.lime);
  },
};

/** La trappe du dépôt s'illumine à chaque livraison (dessinée par-dessus, elle s'estompe). */
export function drawHubFlash(b, sx, sy) {
  if (b.flash > 0) withAlpha((b.flash / 0.3) * 0.8, () => rect(sx + 17, sy + 8, 14, 12, P.yellow));
}

// ---------- Indicateurs ----------

/** Petite goulotte sur le bord de la machine, du côté de sa sortie. */
function drawOutputChute(b, sx, sy) {
  const { x, y, w, h, dir } = b;
  const [ox, oy] = outputCell(b);
  // Point d'ancrage, relatif au coin haut-gauche de la machine
  let ax, ay;
  if (dir === RIGHT) { ax = w * TILE; ay = (oy - y) * TILE + 8; }
  else if (dir === DOWN) { ax = (ox - x) * TILE + 8; ay = h * TILE; }
  else if (dir === LEFT) { ax = 0; ay = (oy - y) * TILE + 8; }
  else { ax = (ox - x) * TILE + 8; ay = 0; }

  const ctx = currentCtx();
  ctx.save();
  ctx.translate(sx + ax, sy + ay);
  ctx.rotate((dir * Math.PI) / 2);
  rect(-2, -4, 5, 8, P.black);
  rect(-1, -3, 3, 6, P.steel);
  rect(0, -1, 2, 2, P.amber);
  ctx.restore();
}

/**
 * Barre au-dessus de la machine : verte pendant la fabrication,
 * jaune clignotante quand les items finis ne peuvent pas sortir.
 */
export function drawProgressBar(b, sx, sy, time) {
  const blocked = b.outputs.length >= MACHINE_OUTPUT_SLOTS;
  const busy = b.kind === 'drill' ? b.working : !!b.current;
  if (!busy && !blocked) return;

  const w = b.w * TILE - 8, x = sx + 4, y = sy - 5;
  rect(x - 1, y - 1, w + 2, 5, P.black);
  rect(x, y, w, 3, P.night);
  if (blocked && !busy) {
    if (Math.floor(time * 3) % 2) rect(x, y, w, 3, P.amber);
    return;
  }
  const filled = Math.round(w * Math.min(1, b.progress));
  rect(x, y, filled, 3, P.lime);
  rect(x, y, filled, 1, P.glint);
}

/**
 * Corps d'une machine pour un état d'animation donné : ombre, sprite fixe,
 * parties animées et goulotte de sortie. Ne dépend pas du temps : c'est ce que
 * le rendu PixiJS transforme en texture.
 */
export function drawMachineBody(b, state, sx, sy, { shadow = true } = {}) {
  if (shadow) withAlpha(0.35, () => rect(sx + 3, sy + 4, b.w * TILE, b.h * TILE, P.black));
  currentCtx().drawImage(machineSprite(b.type), sx, sy);
  ANIMATE[b.type]?.(state, sx, sy);
  if (b.kind !== 'hub') drawOutputChute(b, sx, sy);
}

/** Dessine une machine complète à l'écran en (sx, sy). `ghost` = aperçu avant de poser. */
export function drawMachine(b, sx, sy, time, { ghost = false } = {}) {
  drawMachineBody(b, animationState(b, time), sx, sy, { shadow: !ghost });
  if (b.kind === 'hub') drawHubFlash(b, sx, sy);
  else if (!ghost) drawProgressBar(b, sx, sy, time);
}
