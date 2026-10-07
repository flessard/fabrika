// État partagé du jeu, regroupé en trois objets :
//  - game : la partie (carte, bâtiments, particules, livraisons)
//  - view : la caméra et la taille de l'écran
//  - ui   : ce que le joueur a sélectionné ou survole (et le groupe qu'il déplace)

export const game = {
  /** Graine de la carte actuelle (même graine = même carte). */
  seed: 0,
  /** Terrain : { ground, ore, deco }, voir world/terrain.js. */
  map: null,
  /** Tous les bâtiments posés. */
  buildings: [],
  /** grid[cellIndex(x, y)] → bâtiment qui occupe la case, ou null. */
  grid: [],
  /** Effets visuels (fumée, étincelles, icônes de livraison). */
  particles: [],
  /** Nombre d'items livrés au dépôt, par type d'item. */
  delivered: {},
  /** Nombre de pas de simulation depuis le début de la carte. */
  tick: 0,
  /** Point (en pixels) où centrer la caméra au départ. */
  spawn: { x: 0, y: 0 },
};

export const view = {
  /** Coin haut-gauche de la caméra, en pixels de jeu. */
  camX: 0,
  camY: 0,
  zoom: 2,
  /** Taille de l'écran, en pixels de jeu. */
  width: 0,
  height: 0,
};

export const ui = {
  /** Outil actif (id d'un outil de data/buildings.js). */
  tool: 'hand',
  /** Direction des prochains bâtiments posés (voir core/grid.js). */
  dir: 0,
  /** Forme du prochain splitter posé (voir data/splitterShapes.js). */
  splitterShape: 'T',
  /** Forme et priorités du prochain splitter prioritaire posé. */
  smartSplitterShape: 'YR',
  smartPriority: ['F', 'L', 'R'],
  /** Forme du prochain groupeur posé (voir data/mergerShapes.js). */
  mergerShape: 'T',
  /** Case sous le curseur, ou null. */
  hover: null,
  /** Bâtiment dont la fiche est ouverte, ou null. */
  selected: null,
  /** Zone en train d'être encadrée avec l'outil Sélection : { from, to } (cases), ou null. */
  selectBox: null,
  /** Bâtiments sélectionnés (outil Sélection), sur lesquels agit le menu. */
  selection: [],
  /** Groupe qui suit le curseur pour être déplacé ou copié (voir input/selection.js), ou null. */
  placing: null,
};
