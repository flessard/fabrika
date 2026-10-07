// Le terrain ne change pas pendant une partie : on le dessine une seule fois dans une
// grande image, qu'on recopie ensuite à chaque image affichée.
import { CLIFF_HEIGHT, MAP_H, MAP_PADDING, MAP_W, MINIMAP_SCALE, TILE } from '../config.js';
import { cellIndex, inBounds } from '../core/grid.js';
import { createRng, hash2 } from '../core/random.js';
import { PALETTE as P, PALETTE_RGB } from '../data/palette.js';
import { DECO, GROUND, ORE } from '../world/terrain.js';
import { makeCanvas, rect, withAlpha } from './pen.js';

/** Couleurs des petits cailloux de chaque gisement : [reflet, base, détail]. */
const ORE_CHUNK_COLORS = {
  [ORE.IRON]: [P.mist, P.silver, P.clay],
  [ORE.COPPER]: [P.yellow, P.copper, P.lime],
  [ORE.COAL]: [P.steel, P.night, P.slate],
};

/** Image complète du terrain, avec une bordure de MAP_PADDING pixels tout autour. */
export function bakeTerrain(map, seed) {
  const width = MAP_W * TILE + MAP_PADDING * 2;
  const height = MAP_H * TILE + MAP_PADDING * 2 + CLIFF_HEIGHT + 2;

  return makeCanvas(width, height, (ctx) => {
    // Fond : vide sombre avec quelques étoiles
    rect(0, 0, width, height, P.black);
    for (let i = 0; i < 70; i++) rect(hash2(i, 7) % width, hash2(i, 13) % height, 1, 1, i % 5 ? P.night : P.slate);

    paintGround(ctx, map, seed);

    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const i = cellIndex(tx, ty);
        const wx = MAP_PADDING + tx * TILE, wy = MAP_PADDING + ty * TILE;
        if (map.ore[i]) drawOreChunks(wx, wy, map.ore[i], hash2(tx, ty));
        DRAW_DECO[map.deco[i]]?.(wx, wy, hash2(tx, ty));
      }
    }

    drawMapEdge(ctx);
  });
}

/** Sol pixel par pixel (herbe, sable, eau), écrit directement dans les pixels de l'image. */
function paintGround(ctx, map, seed) {
  const image = ctx.createImageData(MAP_W * TILE, MAP_H * TILE);
  const data = image.data;
  const rng = createRng(seed ^ 0x9e3779b9);

  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const i = cellIndex(tx, ty);
      const ground = map.ground[i];
      const neighbor = (dx, dy) => (inBounds(tx + dx, ty + dy) ? map.ground[cellIndex(tx + dx, ty + dy)] : ground);

      for (let py = 0; py < TILE; py++) {
        for (let px = 0; px < TILE; px++) {
          const v = rng();
          let color = groundPixel(ground, v, tx, px, py);

          if (ground >= GROUND.WATER) {
            // Écume là où l'eau touche la terre, eau plus claire au bord de l'eau profonde
            const touchesLand =
              (px === 0 && neighbor(-1, 0) <= GROUND.SAND) || (px === 15 && neighbor(1, 0) <= GROUND.SAND) ||
              (py === 0 && neighbor(0, -1) <= GROUND.SAND) || (py === 15 && neighbor(0, 1) <= GROUND.SAND);
            const nearShallow =
              (px < 2 && neighbor(-1, 0) === GROUND.WATER) || (px > 13 && neighbor(1, 0) === GROUND.WATER) ||
              (py < 2 && neighbor(0, -1) === GROUND.WATER) || (py > 13 && neighbor(0, 1) === GROUND.WATER);
            if (touchesLand) color = 'mist';
            else if (ground === GROUND.DEEP_WATER && nearShallow && v < 0.5) color = 'sky';
          }
          // Terre retournée sous les gisements
          if (map.ore[i] && v < 0.3) color = v < 0.12 ? 'soot' : 'bark';

          const o = ((ty * TILE + py) * MAP_W * TILE + (tx * TILE + px)) * 4;
          const [r, g, b] = PALETTE_RGB[color];
          data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(image, MAP_PADDING, MAP_PADDING);
}

/** Nom de couleur d'un pixel de sol, avec un peu de variation aléatoire (v). */
function groundPixel(ground, v, tx, px, py) {
  switch (ground) {
    case GROUND.GRASS: return v < 0.05 ? 'lime' : v < 0.11 ? 'forest' : 'leaf';
    case GROUND.DARK_GRASS: return v < 0.07 ? 'leaf' : v < 0.11 ? 'pine' : 'forest';
    case GROUND.SAND: return v < 0.1 ? 'cream' : v < 0.15 ? 'clay' : 'sand';
    case GROUND.WATER: return v < 0.03 || ((py + (tx * 5 + (px >> 2))) % 7 === 0 && v < 0.35) ? 'cyan' : 'sky';
    default: return v < 0.06 ? 'sky' : 'ocean';
  }
}

/** 3 à 5 petits cailloux de minerai sur une case de gisement. */
function drawOreChunks(wx, wy, ore, h) {
  const [light, base, detail] = ORE_CHUNK_COLORS[ore];
  const spots = [[2, 2], [9, 3], [4, 9], [10, 10], [6, 5]];
  spots.forEach(([x, y], k) => {
    if (k > 1 && (h >> k) & 1) return;
    const sx = wx + x, sy = wy + y;
    rect(sx + 1, sy, 3, 1, P.black);
    rect(sx, sy + 1, 1, 3, P.black);
    rect(sx + 4, sy + 1, 1, 3, P.black);
    rect(sx + 1, sy + 4, 3, 1, P.black);
    rect(sx + 1, sy + 1, 3, 3, base);
    rect(sx + 1, sy + 1, 2, 1, light);
    rect(sx + 3, sy + 3, 1, 1, detail);
  });
}

const DRAW_DECO = {
  [DECO.TREE](wx, wy) {
    withAlpha(0.35, () => rect(wx + 3, wy + 13, 10, 2, P.black));
    rect(wx + 7, wy + 10, 2, 4, P.bark);
    const cx = wx + 8, cy = wy + 6;
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const d = dx * dx + dy * dy;
        if (d > 40) continue;
        let color = hash2(cx + dx, cy + dy) % 9 === 0 ? P.lime : P.leaf;
        if (d > 28) color = P.black;
        else if (dx + dy < -4) color = P.lime;
        else if (dx + dy > 3) color = P.forest;
        rect(cx + dx, cy + dy, 1, 1, color);
      }
    }
  },
  [DECO.ROCK](wx, wy) {
    withAlpha(0.3, () => rect(wx + 4, wy + 12, 9, 2, P.black));
    rect(wx + 5, wy + 6, 6, 1, P.black);
    rect(wx + 4, wy + 7, 1, 5, P.black);
    rect(wx + 11, wy + 7, 1, 5, P.black);
    rect(wx + 5, wy + 12, 6, 1, P.black);
    rect(wx + 5, wy + 7, 6, 5, P.silver);
    rect(wx + 5, wy + 7, 3, 1, P.mist);
    rect(wx + 8, wy + 10, 3, 2, P.steel);
  },
  [DECO.BUSH](wx, wy) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if ((dx * dx) / 16 + (dy * dy) / 9 > 1) continue;
        rect(wx + 8 + dx, wy + 10 + dy, 1, 1, dy < 0 && dx < 0 ? P.lime : dy > 1 ? P.forest : P.leaf);
      }
    }
    rect(wx + 6, wy + 9, 1, 1, P.salmon);
  },
  [DECO.FLOWER](wx, wy, h) {
    const colors = [P.salmon, P.yellow, P.cream, P.rose];
    for (let k = 0; k < 3; k++) {
      rect(wx + 2 + ((h >> (k * 3)) % 12), wy + 2 + ((h >> (k * 3 + 9)) % 12), 1, 1, colors[(h >> k) % 4]);
    }
  },
};

/** Contour sombre autour de la carte et falaise sous le bord du bas. */
function drawMapEdge(ctx) {
  ctx.strokeStyle = P.black;
  ctx.lineWidth = 2;
  ctx.strokeRect(MAP_PADDING - 1, MAP_PADDING - 1, MAP_W * TILE + 2, MAP_H * TILE + 2);

  const top = MAP_PADDING + MAP_H * TILE + 1;
  const width = MAP_W * TILE;
  rect(MAP_PADDING, top, width, CLIFF_HEIGHT, P.bark);
  for (let x = 0; x < width; x++) {
    if (hash2(x, 3) % 5 === 0) rect(MAP_PADDING + x, top, 1, CLIFF_HEIGHT, P.soot);
    if (hash2(x, 9) % 11 === 0) rect(MAP_PADDING + x, top + 2, 1, 3, P.clay);
  }
  rect(MAP_PADDING, top, width, 1, P.clay);
  rect(MAP_PADDING, top + CLIFF_HEIGHT, width, 1, P.soot);
}

/** Petite image de la carte (2 pixels par case) pour la mini-carte. */
export function bakeMinimapBase(map) {
  const GROUND_COLORS = [P.leaf, P.forest, P.sand, P.sky, P.ocean];
  const ORE_COLORS = { [ORE.IRON]: P.mist, [ORE.COPPER]: P.orange, [ORE.COAL]: P.night };
  const s = MINIMAP_SCALE;
  return makeCanvas(MAP_W * s, MAP_H * s, () => {
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = cellIndex(x, y);
        let color = GROUND_COLORS[map.ground[i]];
        if (map.deco[i] === DECO.TREE) color = P.pine;
        else if (map.deco[i] === DECO.ROCK) color = P.silver;
        if (map.ore[i]) color = ORE_COLORS[map.ore[i]];
        rect(x * s, y * s, s, s, color);
      }
    }
  });
}

