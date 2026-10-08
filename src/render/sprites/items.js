// Sprites des items (7 × 7 pixels), fabriqués à partir de petites grilles de caractères.
//   k = contour noir · a = couleur claire · b = couleur de base · c = accent · . = vide
import { ITEMS } from '../../data/items.js';
import { PALETTE as P } from '../../data/palette.js';
import { makeCanvas, rect } from '../pen.js';

const SHAPES = {
  rubble: [
    '.......',
    '..kkk..',
    '.kabck.',
    'kkbbbkk',
    'kabkcbk',
    'kbbcbbk',
    'kkkkkkk',
  ],
  ore: [
    '.kkkk..',
    'kaabbk.',
    'kabbcbk',
    'kbcbbbk',
    'kbbbcbk',
    '.kbbbk.',
    '..kkk..',
  ],
  ingot: [
    '.......',
    '..kkkkk',
    '.kaaaak',
    'kabbbbk',
    'kbccck.',
    'kkkkk..',
    '.......',
  ],
  plate: [
    'kkkkkkk',
    'kaaaabk',
    'kabbbck',
    'kbbcbck',
    'kbbbbck',
    'kbcccck',
    'kkkkkkk',
  ],
  wire: [
    '.kkkkk.',
    'kaabaak',
    'kbbabbk',
    'kaabaak',
    'kbbabbk',
    'kaabaak',
    '.kkkkk.',
  ],
};

SHAPES.gear = [
  '..k.k..',
  '.kakak.',
  'kabbbak',
  'kab.bak',
  'kabbbak',
  '.kcbck.',
  '..k.k..',
];

SHAPES.belt = [
  '.......',
  'kkkkkkk',
  'kaaaaak',
  'kbcbcbk',
  'kaaaaak',
  'kkkkkkk',
  '.......',
];

export const ITEM_SIZE = 7;

const cache = {};

const urlCache = {};

/** Image de l'item pour l'interface HTML (une balise <img>). */
export function itemIconUrl(itemType) {
  urlCache[itemType] ??= itemSprite(itemType).toDataURL();
  return urlCache[itemType];
}

/** Sprite (canevas) d'un type d'item. Fabriqué une seule fois, puis réutilisé. */
export function itemSprite(itemType) {
  if (cache[itemType]) return cache[itemType];
  const item = ITEMS[itemType];
  const colors = { k: P.black, a: item.light, b: item.base, c: item.accent };
  cache[itemType] = makeCanvas(ITEM_SIZE, ITEM_SIZE, () => {
    SHAPES[item.shape].forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch !== '.') rect(x, y, 1, 1, colors[ch]);
      });
    });
  });
  return cache[itemType];
}
