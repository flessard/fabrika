// L'usine de départ, autour du centre de la carte (cx, cy) :
//
//   foreuse ─┐
//            ├─ tapis → four → tapis → presse → tapis → dépôt
//   foreuse ─┘
import { RIGHT, UP } from '../core/grid.js';
import { ORE } from './terrain.js';
import { placeBuilding } from './buildings.js';

/** Contraintes de terrain pour que l'usine de départ ait sa place et son fer. */
export function starterTerrain(cx, cy) {
  return {
    clearArea: { x0: cx - 19, y0: cy - 6, x1: cx + 5, y1: cy + 6 },
    orePatches: [
      { x: cx - 14, y: cy + 1, radius: 2.3, ore: ORE.IRON },
      { x: cx + 10, y: cy - 9, radius: 2.2, ore: ORE.COPPER },
    ],
    forcedOre: [
      { x0: cx - 14, y0: cy - 1, x1: cx - 13, y1: cy + 2, ore: ORE.IRON }, // sous les deux foreuses
      { x0: cx - 12, y0: cy, x1: cx + 5, y1: cy, ore: ORE.NONE },          // la ligne principale
    ],
  };
}

export function buildStarterFactory(cx, cy) {
  placeBuilding('hub', cx - 1, cy - 1);

  placeBuilding('drill', cx - 14, cy - 1, RIGHT);
  placeBuilding('drill', cx - 14, cy + 1, RIGHT);
  placeBuilding('belt', cx - 12, cy + 2, UP);
  placeBuilding('belt', cx - 12, cy + 1, UP);

  for (let x = cx - 12; x <= cx - 10; x++) placeBuilding('belt', x, cy, RIGHT);
  placeBuilding('furnace', cx - 9, cy - 1, RIGHT);
  placeBuilding('belt', cx - 7, cy, RIGHT);
  placeBuilding('belt', cx - 6, cy, RIGHT);
  placeBuilding('press', cx - 5, cy - 1, RIGHT);
  placeBuilding('belt', cx - 3, cy, RIGHT);
  placeBuilding('belt', cx - 2, cy, RIGHT);
}

/** Point (en cases) sur lequel centrer la caméra : le milieu de la ligne. */
export const starterFocus = (cx, cy) => ({ x: cx - 6, y: cy + 0.5 });
