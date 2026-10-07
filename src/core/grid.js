// La grille : directions et conversions de coordonnées.
import { MAP_W, MAP_H } from '../config.js';

// Une direction est un index de 0 à 3, dans le sens horaire.
export const RIGHT = 0;
export const DOWN = 1;
export const LEFT = 2;
export const UP = 3;

/** Déplacement [dx, dy] pour chaque direction. */
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export const opposite = (dir) => (dir + 2) % 4;
export const turnRight = (dir) => (dir + 1) % 4;
export const turnLeft = (dir) => (dir + 3) % 4;

export const inBounds = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

/** Index d'une case dans les tableaux à plat (terrain, grille des bâtiments). */
export const cellIndex = (x, y) => y * MAP_W + x;
