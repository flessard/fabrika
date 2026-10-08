// Le départ d'une partie, autour du centre de la carte (cx, cy).
//
// Une vraie partie part à neuf : seulement le dépôt, avec un gisement de fer tout près
// et de la place pour construire. L'usine complète ne sert que de démonstration, dans
// le décor de l'écran titre (muette : ni son ni message), avec trois lignes :
//
//   fer     : 2 foreuses → groupeur → four → presse → plaques ───┐
//   cuivre  : 2 foreuses → groupeur → four → presse → fil ────── dépôt
//   charbon : foreuse → tunnel (sous terre) → tapis ─────────────┘
//
// Les foreuses sortent aussi des résidus, mêlés au minerai : sur chaque ligne, un filtre
// les envoie de côté dans une décharge.
import { DOWN, LEFT, RIGHT, UP } from '../core/grid.js';
import { ORE } from './terrain.js';
import { placeBuilding } from './buildings.js';

/** Contraintes de terrain : de la place pour l'usine de démonstration, et ses gisements. */
export function starterTerrain(cx, cy) {
  return {
    clearArea: { x0: cx - 19, y0: cy - 9, x1: cx + 10, y1: cy + 8 },
    orePatches: [
      { x: cx - 14, y: cy + 1, radius: 2.3, ore: ORE.IRON },
      { x: cx + 7, y: cy - 8, radius: 2.4, ore: ORE.COPPER },
      { x: cx - 8, y: cy + 7, radius: 1.8, ore: ORE.COAL },
    ],
    forcedOre: [
      { x0: cx - 14, y0: cy - 1, x1: cx - 13, y1: cy + 2, ore: ORE.IRON },   // sous les foreuses de fer
      { x0: cx + 5, y0: cy - 8, x1: cx + 9, y1: cy - 7, ore: ORE.COPPER },   // sous les foreuses de cuivre
      { x0: cx - 8, y0: cy + 6, x1: cx - 7, y1: cy + 7, ore: ORE.COAL },     // sous la foreuse de charbon
      { x0: cx - 12, y0: cy, x1: cx + 5, y1: cy, ore: ORE.NONE },            // la ligne principale
    ],
  };
}

/** Le dépôt seul (une nouvelle partie), ou toute l'usine de démonstration (`demo`). */
export function buildStarterFactory(cx, cy, { demo = false } = {}) {
  placeBuilding('hub', cx - 1, cy - 1);
  if (!demo) return;

  // Fer → plaques, par la gauche du dépôt
  placeBuilding('drill', cx - 14, cy - 1, RIGHT);
  placeBuilding('drill', cx - 14, cy + 1, RIGHT);
  placeBuilding('belt', cx - 12, cy + 2, UP);
  placeBuilding('belt', cx - 12, cy + 1, UP);
  // Les deux foreuses se rejoignent : il faut un groupeur (entrées : arrière et dessous).
  placeBuilding('merger', cx - 12, cy, RIGHT, { shape: 'YR' });
  placeBuilding('filter', cx - 11, cy, RIGHT, { shape: 'YR', filters: { F: [], L: [], R: ['rubble'] } });
  placeBuilding('dump', cx - 11, cy + 1);
  placeBuilding('belt', cx - 10, cy, RIGHT);
  placeBuilding('furnace', cx - 9, cy - 1, RIGHT);
  placeBuilding('belt', cx - 7, cy, RIGHT);
  placeBuilding('belt', cx - 6, cy, RIGHT);
  placeBuilding('press', cx - 5, cy - 1, RIGHT);
  placeBuilding('belt', cx - 3, cy, RIGHT);
  placeBuilding('belt', cx - 2, cy, RIGHT);

  // Cuivre → fil, par le haut du dépôt : deux foreuses réunies par un groupeur
  placeBuilding('drill', cx + 5, cy - 8, DOWN);
  placeBuilding('drill', cx + 8, cy - 8, DOWN);
  for (let x = cx + 8; x >= cx + 6; x--) placeBuilding('belt', x, cy - 6, LEFT);
  placeBuilding('merger', cx + 5, cy - 6, DOWN, { shape: 'YL' });
  placeBuilding('filter', cx + 5, cy - 5, DOWN, { shape: 'YL', filters: { F: [], L: ['rubble'], R: [] } });
  placeBuilding('dump', cx + 6, cy - 5);
  placeBuilding('belt', cx + 5, cy - 4, DOWN);
  placeBuilding('furnace', cx + 4, cy - 3, LEFT);
  placeBuilding('belt', cx + 3, cy - 3, LEFT);
  placeBuilding('press', cx + 1, cy - 4, DOWN);
  placeBuilding('belt', cx + 1, cy - 2, DOWN);

  // Charbon, par le bas du dépôt, en passant par un tunnel
  placeBuilding('drill', cx - 8, cy + 6, RIGHT);
  placeBuilding('filter', cx - 6, cy + 7, RIGHT, { shape: 'YR', filters: { F: [], L: [], R: ['rubble'] } });
  placeBuilding('dump', cx - 6, cy + 8);
  placeBuilding('belt', cx - 5, cy + 7, RIGHT);
  placeBuilding('tunnelIn', cx - 4, cy + 7, RIGHT);
  placeBuilding('underBelt', cx - 3, cy + 7, RIGHT);
  placeBuilding('underBelt', cx - 2, cy + 7, RIGHT);
  placeBuilding('tunnelOut', cx - 1, cy + 7, RIGHT);
  placeBuilding('belt', cx, cy + 7, UP);
  for (let y = cy + 6; y >= cy + 2; y--) placeBuilding('belt', cx, y, UP);
}

/** Point (en cases) sur lequel centrer la caméra : l'usine de démonstration, ou le dépôt et le fer. */
export const starterFocus = (cx, cy, { demo = false } = {}) => (demo ? { x: cx - 2, y: cy } : { x: cx - 6, y: cy + 0.5 });
