// Brouillard : la carte ne se voit pas d'un coup, elle se découvre.
//
// Au départ, seule une zone autour du dépôt est visible (avec les premiers gisements).
// Chaque bâtiment posé éclaire un rayon autour de lui : on explore en étirant des tapis
// vers l'inconnu. Ce qui a été découvert le reste. On ne construit pas dans le brouillard.
//
// La zone découverte (game.explored, une case = 1 si découverte) fait partie de l'état de
// la partie : elle est sauvegardée et identique pour tous les joueurs d'une partie à plusieurs.
import { MAP_H, MAP_W } from '../config.js';
import { cellIndex, inBounds } from '../core/grid.js';
import { game } from '../state.js';

/** Rayon éclairé autour d'un bâtiment, en cases, selon sa famille. */
const REVEAL = { hub: 16, drill: 6, crafter: 6 };
const DEFAULT_REVEAL = 4;

/** Change chaque fois que la zone découverte change : les dessins du brouillard se refont. */
export let fogVersion = 0;

export function resetFog() {
  game.explored = new Uint8Array(MAP_W * MAP_H);
  fogVersion++;
}

export const isExplored = (x, y) => inBounds(x, y) && game.explored[cellIndex(x, y)] === 1;

/** Découvre les cases autour d'un bâtiment (un disque centré sur lui). */
export function revealAround(b) {
  const r = REVEAL[b.kind] ?? DEFAULT_REVEAL;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  let changed = false;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (!inBounds(x, y)) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r * r) continue;
      const i = cellIndex(x, y);
      if (!game.explored[i]) {
        game.explored[i] = 1;
        changed = true;
      }
    }
  }
  if (changed) fogVersion++;
}

// ---------- Sauvegarde : un bit par case, en base64 ----------

export function serializeFog() {
  const bits = new Uint8Array(Math.ceil(game.explored.length / 8));
  game.explored.forEach((v, i) => { if (v) bits[i >> 3] |= 1 << (i & 7); });
  let text = '';
  for (const byte of bits) text += String.fromCharCode(byte);
  return btoa(text);
}

/** Ajoute à la zone découverte celle d'une sauvegarde. */
export function restoreFog(saved) {
  if (!saved) return;
  const text = atob(saved);
  for (let i = 0; i < game.explored.length; i++) {
    if (text.charCodeAt(i >> 3) & (1 << (i & 7))) game.explored[i] = 1;
  }
  fogVersion++;
}
