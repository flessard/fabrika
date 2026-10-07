// Entrées et sorties sur le bord des machines.
//   - Pas encore branchée : une flèche (8 × 8), verte vers la machine pour une entrée,
//     orange vers l'extérieur pour la sortie. Elle montre où brancher un tapis.
//   - Branchée : un raccord (12 × 12). Le tapis passe dans une bouche sombre percée dans
//     la paroi, tenu par deux pinces de couleur (vertes : entrée, orange : sortie).
//     Les items disparaissent dans la bouche ou en sortent.
import { PALETTE as P } from '../../data/palette.js';
import { currentCtx, rect } from '../pen.js';

export const PORT_SIZE = 8;
export const DOCK_SIZE = 12;

const COLORS = {
  in: { fill: P.lime, light: P.glint },
  out: { fill: P.orange, light: P.amber },
};

/** Dessine `draw` tourné vers `dir`, dans un carré de `size` dont le coin est (sx, sy). */
function rotated(sx, sy, size, dir, draw) {
  const ctx = currentCtx();
  ctx.save();
  ctx.translate(sx + size / 2, sy + size / 2);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.translate(-size / 2, -size / 2);
  draw();
  ctx.restore();
}

/** Flèche pointée vers `dir`, dessinée dans une case de 8 × 8 dont le coin est (sx, sy). */
export function drawPort(sx, sy, dir, kind) {
  rotated(sx, sy, PORT_SIZE, dir, () => {
    // Pointe vers la droite : un triangle cerné de noir.
    for (let c = 0; c < 4; c++) rect(1 + c, c, 2, PORT_SIZE - c * 2, P.black);
    const { fill, light } = COLORS[kind];
    for (let c = 0; c < 3; c++) rect(2 + c, 1 + c, 1, PORT_SIZE - 2 - c * 2, fill);
    rect(2, 1, 1, 1, light);
    rect(3, 2, 1, 1, light);
  });
}

/**
 * Raccord d'un tapis branché, centré sur le bord de la machine (12 × 12, coin en (sx, sy)).
 * `dir` : sens du flux. Dessiné avec le flux vers la droite : le bord de la machine est
 * au milieu (x = 6) ; une entrée a la machine à droite, une sortie à gauche.
 */
export function drawDock(sx, sy, dir, kind) {
  const { fill, light } = COLORS[kind];
  rotated(sx, sy, DOCK_SIZE, dir, () => {
    // Bouche sombre dans la paroi, côté machine
    const mouth = kind === 'in' ? 6 : 3;
    rect(mouth, 2, 3, 8, P.black);
    rect(kind === 'in' ? 6 : 5, 3, 1, 6, P.night);
    // Pinces sur les rails du tapis, de part et d'autre de la bouche
    for (const y of [0, 9]) {
      rect(2, y, 8, 3, P.black);
      rect(3, y + (y ? 1 : 0), 6, 2, fill);
      rect(3, y + (y ? 1 : 0), 6, 1, light);
    }
  });
}
