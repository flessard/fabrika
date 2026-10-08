// Signal « item refusé » : un convoyeur bute sur une machine qui ne prend pas son item
// (ex. des résidus devant un four). Une bulle au-dessus du convoyeur montre l'item barré
// de rouge, et une croix rouge marque le bord où il bute. Les deux clignotent
// (`bright`) : voir refusalMarks dans render/scene.js.
import { PALETTE as P } from '../../data/palette.js';
import { currentCtx, rect } from '../pen.js';
import { itemSprite } from './items.js';

export const BUBBLE_W = 13;
export const BUBBLE_H = 14;
export const CROSS_SIZE = 7;

/** Bulle 13 × 14, (x, y) = coin haut-gauche. Sa pointe (en bas, au milieu) vise le convoyeur. */
export function drawRefusalBubble(x, y, itemType, bright) {
  const edge = bright ? P.red : P.wine;
  rect(x, y, 13, 11, P.black);
  rect(x + 1, y + 1, 11, 9, edge);
  rect(x + 2, y + 2, 9, 7, P.night);
  currentCtx().drawImage(itemSprite(itemType), x + 3, y + 2);
  // Barre rouge en travers de l'item
  for (let i = 0; i < 7; i++) rect(x + 3 + i, y + 8 - i, 1, 1, P.red);
  for (let i = 0; i < 6; i++) rect(x + 4 + i, y + 8 - i, 1, 1, P.red);
  // Pointe
  rect(x + 4, y + 11, 5, 1, P.black);
  rect(x + 5, y + 11, 3, 1, edge);
  rect(x + 5, y + 12, 3, 1, P.black);
  rect(x + 6, y + 12, 1, 1, edge);
  rect(x + 6, y + 13, 1, 1, P.black);
}

/** Croix 7 × 7, (x, y) = coin haut-gauche. */
export function drawRefusalCross(x, y, bright) {
  const color = bright ? P.red : P.wine;
  for (let i = 0; i < 7; i++) {
    rect(x + i, y + i, 1, 1, P.black);
    rect(x + 6 - i, y + i, 1, 1, P.black);
  }
  for (let i = 1; i < 6; i++) {
    rect(x + i, y + i, 1, 1, color);
    rect(x + 6 - i, y + i, 1, 1, color);
  }
  rect(x + 3, y + 3, 1, 1, P.white);
}
