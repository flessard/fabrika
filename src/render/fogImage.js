// Image du brouillard : sombre sur ce qui reste à découvrir, avec une bordure tramée
// (un damier de pixels) qui adoucit la limite. Refaite seulement quand la zone
// découverte change (voir world/fog.js).
import { MAP_H, MAP_W } from '../config.js';
import { isExplored } from '../world/fog.js';
import { makeCanvas } from './pen.js';

/**
 * `pixelsPerCell` pixels par case. Avec 4 : la bordure tramée a le grain du pixel art
 * une fois agrandie à la taille des cases (16 pixels de jeu).
 */
export function bakeFog(pixelsPerCell = 4) {
  const p = pixelsPerCell;
  return makeCanvas(MAP_W * p, MAP_H * p, (ctx) => {
    const img = ctx.createImageData(MAP_W * p, MAP_H * p);
    const put = (x, y, alpha) => {
      const o = (y * MAP_W * p + x) * 4;
      img.data[o] = 24; img.data[o + 1] = 20; img.data[o + 2] = 37; img.data[o + 3] = alpha; // le noir de la palette
    };
    for (let cy = 0; cy < MAP_H; cy++) {
      for (let cx = 0; cx < MAP_W; cx++) {
        const explored = isExplored(cx, cy);
        // Une case touche-t-elle l'autre côté de la limite (8 voisines) ?
        let border = false;
        for (let dy = -1; dy <= 1 && !border; dy++) {
          for (let dx = -1; dx <= 1 && !border; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
            if (isExplored(nx, ny) !== explored) border = true;
          }
        }
        if (explored && !border) continue;
        for (let py = 0; py < p; py++) {
          for (let px = 0; px < p; px++) {
            const checker = (cx * p + px + cy * p + py) % 2 === 0;
            let alpha;
            if (!explored) alpha = border && !checker ? 205 : 242; // le brouillard, un peu tramé au bord
            else alpha = checker ? 110 : 0;                         // la lisière, du côté découvert
            put(cx * p + px, cy * p + py, alpha);
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}
