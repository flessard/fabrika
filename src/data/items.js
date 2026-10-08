// Les items qui circulent dans l'usine. Leurs noms (singulier et pluriel) sont dans
// les dictionnaires (src/i18n/) : 'item.<id>' et 'item.<id>.plural'.
//   stock : un objet de construction, qui va dans l'inventaire (livré au dépôt, ou pris
//           dans la machine qui l'a fabriqué) et qu'on dépense pour bâtir.
//   stack : combien en tient un emplacement de conteneur (un « paquet »).
//   shape  : silhouette du sprite (voir render/sprites/items.js)
//   light, base, accent : les 3 couleurs de la silhouette
import { PALETTE as P } from './palette.js';

export const ITEMS = {
  fe_ore:   { shape: 'ore',   light: P.mist,   base: P.steel,  accent: P.clay, stack: 50 },
  cu_ore:   { shape: 'ore',   light: P.sand,   base: P.clay,   accent: P.lime, stack: 50 },
  // Résidus de forage : ni le dépôt ni les machines n'en veulent, il faut les jeter (Décharge).
  rubble:   { shape: 'rubble', light: P.clay,  base: P.bark,   accent: P.soot, stack: 50, waste: true },
  coal:     { shape: 'ore',   light: P.steel,  base: P.night,  accent: P.slate, stack: 50 },
  fe_ingot: { shape: 'ingot', light: P.white,  base: P.mist,   accent: P.silver, stack: 50 },
  cu_ingot: { shape: 'ingot', light: P.yellow, base: P.orange, accent: P.rust, stack: 50 },
  // La plaque de fer sert aussi à bâtir (data/buildings.js, cost) : elle va dans l'inventaire.
  fe_plate: { shape: 'plate', light: P.white,  base: P.mist,   accent: P.silver, stock: true, stack: 50 },
  belt:     { shape: 'belt',  light: P.silver, base: P.night,  accent: P.amber, stock: true, stack: 20 },
  fe_gear:  { shape: 'gear',  light: P.mist,   base: P.steel,  accent: P.silver, stack: 50 },
  cu_wire:  { shape: 'wire',  light: P.amber,  base: P.copper, accent: P.copper, stack: 100 },
};
