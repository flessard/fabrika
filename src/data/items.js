// Les items qui circulent dans l'usine.
//   shape  : silhouette du sprite (voir render/sprites/items.js)
//   light, base, accent : les 3 couleurs de la silhouette
import { PALETTE as P } from './palette.js';

export const ITEMS = {
  fe_ore:   { name: 'Minerai de fer',    plural: 'minerais de fer',    shape: 'ore',   light: P.mist,   base: P.steel,  accent: P.clay },
  cu_ore:   { name: 'Minerai de cuivre', plural: 'minerais de cuivre', shape: 'ore',   light: P.sand,   base: P.clay,   accent: P.lime },
  coal:     { name: 'Charbon',           plural: 'charbons',           shape: 'ore',   light: P.steel,  base: P.night,  accent: P.slate },
  fe_ingot: { name: 'Lingot de fer',     plural: 'lingots de fer',     shape: 'ingot', light: P.white,  base: P.mist,   accent: P.silver },
  cu_ingot: { name: 'Lingot de cuivre',  plural: 'lingots de cuivre',  shape: 'ingot', light: P.yellow, base: P.orange, accent: P.rust },
  fe_plate: { name: 'Plaque de fer',     plural: 'plaques de fer',     shape: 'plate', light: P.white,  base: P.mist,   accent: P.silver },
  cu_wire:  { name: 'Fil de cuivre',     plural: 'fils de cuivre',     shape: 'wire',  light: P.amber,  base: P.copper, accent: P.copper },
};
