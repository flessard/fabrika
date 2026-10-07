// Hasard reproductible : une même graine donne toujours la même carte.
import { MAP_W, MAP_H } from '../config.js';

/** Générateur pseudo-aléatoire (mulberry32). Retourne une fonction () => nombre dans [0, 1). */
export function createRng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nombre entier pseudo-aléatoire stable pour un couple (x, y). Sert aux petits détails visuels. */
export function hash2(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Bruit de valeur lissé : des valeurs aléatoires sur une grille grossière
 * (une tous les `cellSize` cases), interpolées en douceur entre elles.
 * Retourne une fonction (x, y) => nombre dans [0, 1].
 */
export function createValueNoise(rng, cellSize, width = MAP_W, height = MAP_H) {
  const gw = Math.ceil(width / cellSize) + 2;
  const gh = Math.ceil(height / cellSize) + 2;
  const values = new Float32Array(gw * gh).map(() => rng());
  const smooth = (t) => t * t * (3 - 2 * t);

  return (x, y) => {
    const fx = x / cellSize, fy = y / cellSize;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const sx = smooth(fx - x0), sy = smooth(fy - y0);
    const a = values[y0 * gw + x0], b = values[y0 * gw + x0 + 1];
    const c = values[(y0 + 1) * gw + x0], d = values[(y0 + 1) * gw + x0 + 1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
