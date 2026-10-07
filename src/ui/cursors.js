// Curseurs de souris en pixel art, à la place de ceux du système.
//
// Chaque curseur est un petit dessin en caractères (comme les chiffres du splitter
// prioritaire) : 'w' crème, 'a' ambre, 's' peau (sable). Seule la silhouette est
// dessinée : le contour noir est ajouté tout seul autour, et les espaces d'un pixel
// entre les doigts deviennent ainsi des traits noirs. Le curseur est agrandi ×2
// (×4 sur les écrans haute densité) et donné au CSS par des variables
// (--cursor-arrow, etc. ; voir styles/main.css).
import { PALETTE as P } from '../data/palette.js';
import { makeCanvas, rect } from '../render/pen.js';

const COLORS = { w: P.cream, a: P.amber, s: P.sand };

/**
 * name : variable CSS (--cursor-<name>), hot : point actif [x, y] dans le dessin,
 * fallback : curseur du système si l'image ne peut pas être utilisée.
 */
const CURSORS = [
  {
    // Flèche : l'interface et la carte avec l'outil Déplacer au repos.
    name: 'arrow', hot: [0, 0], fallback: 'default',
    art: [
      'w',
      'ww',
      'waw',
      'waaw',
      'waaaw',
      'waaaaw',
      'waaaaaw',
      'waaaaaaw',
      'waaawwww',
      'waww',
      'ww waw',
      'w  waw',
      '    waw',
      '    ww',
    ],
  },
  {
    // Main qui pointe du doigt : boutons et mini-carte.
    name: 'pointer', hot: [4, 0], fallback: 'pointer',
    art: [
      '    ws',
      '    ss',
      '    ss',
      '    ss ss',
      '    ss ss ss',
      'ss  ss ss ss',
      'sss ssssssss',
      ' sssssssssss',
      '  ssssssssss',
      '  sssssssss',
      '   ssssssss',
      '   sssssss',
    ],
  },
  {
    // Main ouverte : outil Déplacer.
    name: 'grab', hot: [6, 5], fallback: 'grab',
    art: [
      '     ss ss',
      '  ss ss ss ss',
      '  ss ss ss ss',
      '  ss ss ss ss',
      '  sssssssssss',
      'ss sssssssssss',
      'sssssssssssss',
      ' ssssssssssss',
      '  ssssssssss',
      '   ssssssss',
      '   ssssssss',
    ],
  },
  {
    // Main fermée : pendant qu'on fait glisser la carte.
    name: 'grabbing', hot: [6, 5], fallback: 'grabbing',
    art: [
      '',
      '',
      '',
      '  ss ss ss ss',
      ' ssssssssssss',
      'sssssssssssss',
      'sssssssssssss',
      ' ssssssssssss',
      '  ssssssssss',
      '   ssssssss',
    ],
  },
  {
    // Viseur : outils qui posent un bâtiment, Gomme, Sélection.
    name: 'crosshair', hot: [6, 6], fallback: 'crosshair',
    art: [
      '      w',
      '      w',
      '      w',
      '',
      '',
      '',
      'www   a   www',
      '',
      '',
      '',
      '      w',
      '      w',
      '      w',
    ],
  },
];

/** Image du curseur agrandie `scale` fois, avec son contour noir. `colors` remplace la palette. */
function cursorImage(art, scale, colors = COLORS) {
  const h = art.length + 2, w = Math.max(...art.map((row) => row.length)) + 2;
  const at = (x, y) => art[y - 1]?.[x - 1];
  const filled = (x, y) => { const c = at(x, y); return c !== undefined && c !== ' '; };
  return makeCanvas(w * scale, h * scale, () => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let color = null;
        if (filled(x, y)) color = colors[at(x, y)] ?? P.black;
        else if ([[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]].some(([dx, dy]) => filled(x + dx, y + dy))) color = P.black;
        if (color) rect(x * scale, y * scale, scale, scale, color);
      }
    }
  }).toDataURL();
}

/** Point actif de la flèche dans son image agrandie ×2 (le contour la décale d'un pixel). */
export const ARROW_HOTSPOT = 2;

/**
 * La flèche d'un autre joueur, à sa couleur : bord blanc, intérieur de sa couleur.
 * Image agrandie ×2 (data URL), pour le dessiner là où est sa souris.
 */
export function playerArrow(color) {
  const arrow = CURSORS.find((c) => c.name === 'arrow');
  return cursorImage(arrow.art, 2, { w: P.white, a: color });
}

/** Crée les curseurs et les donne au CSS. À appeler une fois au démarrage. */
export function installCursors() {
  const root = document.documentElement.style;
  for (const { name, art, hot, fallback } of CURSORS) {
    // +1 : le contour ajouté autour du dessin décale le point actif.
    const [hx, hy] = [(hot[0] + 1) * 2, (hot[1] + 1) * 2];
    const x1 = cursorImage(art, 2), x2 = cursorImage(art, 4);
    const sharp = `image-set(url("${x1}") 1x, url("${x2}") 2x) ${hx} ${hy}, ${fallback}`;
    const plain = `url("${x1}") ${hx} ${hy}, ${fallback}`;
    root.setProperty(`--cursor-${name}`, CSS.supports('cursor', sharp) ? sharp : plain);
  }
}
