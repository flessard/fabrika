// Les items qui circulent dans l'usine. Leurs noms (singulier et pluriel) sont dans
// les dictionnaires (src/i18n/) : 'item.<id>' et 'item.<id>.plural'.
//   shape  : silhouette du sprite (voir render/sprites/items.js)
//   light, base, accent : les 3 couleurs de la silhouette
import { PALETTE as P } from './palette.js';

export const ITEMS = {
  fe_ore:   { shape: 'ore',   light: P.mist,   base: P.steel,  accent: P.clay },
  cu_ore:   { shape: 'ore',   light: P.sand,   base: P.clay,   accent: P.lime },
  coal:     { shape: 'ore',   light: P.steel,  base: P.night,  accent: P.slate },
  fe_ingot: { shape: 'ingot', light: P.white,  base: P.mist,   accent: P.silver },
  cu_ingot: { shape: 'ingot', light: P.yellow, base: P.orange, accent: P.rust },
  fe_plate: { shape: 'plate', light: P.white,  base: P.mist,   accent: P.silver },
  cu_wire:  { shape: 'wire',  light: P.amber,  base: P.copper, accent: P.copper },
};
