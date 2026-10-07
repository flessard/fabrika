// Palette du jeu (Endesga 32). Tout le pixel art utilise ces couleurs.

export const PALETTE = {
  black: '#181425',
  night: '#262b44',
  slate: '#3a4466',
  steel: '#5a6988',
  silver: '#8b9bb4',
  mist: '#c0cbdc',
  white: '#ffffff',

  wine: '#a22633',
  red: '#e43b44',
  orange: '#f77622',
  amber: '#feae34',
  yellow: '#fee761',

  soot: '#3e2731',
  bark: '#733e39',
  clay: '#b86f50',
  sand: '#e4a672',
  cream: '#ead4aa',
  rust: '#be4a2f',
  copper: '#d77643',

  pine: '#193c3e',
  forest: '#265c42',
  leaf: '#3e8948',
  lime: '#63c74d',

  ocean: '#124e89',
  sky: '#0099db',
  cyan: '#2ce8f5',

  plum: '#68386c',
  rose: '#b55088',
  salmon: '#f6757a',

  /** Reflet de la barre de progression (seule couleur hors palette). */
  glint: '#a7f070',
};

/** Mêmes couleurs en [r, g, b], pour écrire des pixels directement dans une image. */
export const PALETTE_RGB = Object.fromEntries(
  Object.entries(PALETTE).map(([name, hex]) => [name, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))]),
);
