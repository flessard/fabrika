// Le plancher d'une usine (32 × 32 cases) : dalles de béton, et un mur de briques tout
// autour, où sont les portes (dessinées par-dessus, ce sont des bâtiments).
// Tous les intérieurs se ressemblent : l'image est fabriquée une seule fois.
import { TILE } from '../config.js';
import { hash2 } from '../core/random.js';
import { PALETTE as P } from '../data/palette.js';
import { INTERIOR_SIZE, isWall } from '../world/interiors.js';
import { makeCanvas, rect } from './pen.js';

let image = null;

export function interiorImage() {
  image ??= makeCanvas(INTERIOR_SIZE * TILE, INTERIOR_SIZE * TILE, () => {
    for (let cy = 0; cy < INTERIOR_SIZE; cy++) {
      for (let cx = 0; cx < INTERIOR_SIZE; cx++) {
        const x = cx * TILE, y = cy * TILE;
        if (isWall(cx, cy)) {
          for (let py = 0; py < TILE; py++) {
            for (let px = 0; px < TILE; px++) {
              const row = (y + py) >> 2;
              const mortar = (y + py) % 4 === 3 || ((x + px) + (row & 1) * 4) % 8 === 7;
              rect(x + px, y + py, 1, 1, mortar ? P.soot : hash2(x + px, y + py) % 9 === 0 ? P.clay : P.bark);
            }
          }
          continue;
        }
        // Dalle de béton (2 × 2 cases), avec un joint sombre et quelques taches
        rect(x, y, TILE, TILE, P.slate);
        if (cx % 2 === 0) rect(x, y, 1, TILE, P.night);
        if (cy % 2 === 0) rect(x, y, TILE, 1, P.night);
        const h = hash2(cx, cy);
        if (h % 4 === 0) rect(x + 3 + (h % 8), y + 4 + ((h >> 4) % 7), 2, 1, P.night);
        if (h % 7 === 0) rect(x + 2 + ((h >> 3) % 10), y + 2 + ((h >> 7) % 10), 1, 1, P.steel);
      }
    }
  });
  return image;
}
