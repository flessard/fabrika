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
  /** byId.get(id) → bâtiment. Chaque bâtiment a un identifiant stable (b.id). */
  byId: new Map(),
  /** Prochain identifiant de bâtiment. */
  nextId: 1,
  /** Cases découvertes (1) ou encore dans le brouillard (0) : voir world/fog.js. */
  explored: null,
  /** grid[cellIndex(x, y)] → bâtiment qui occupe la case en surface, ou null. */
  grid: [],
  /** Même chose pour le sous-sol (tapis souterrains et tunnels). */
  under: [],
  /** Effets visuels (fumée, étincelles, icônes de livraison). */
  particles: [],
  /** Nombre d'items livrés au dépôt depuis le début, par type d'item. */
  delivered: {},
  /** Inventaire de l'équipe : objets de construction en stock (voir world/inventory.js). */
  inventory: {},
  /** Outils débloqués dans l'arbre de recherche (voir data/research.js). */
  unlocked: [],
  /** Items livrés au dépôt pas encore dépensés en recherche, par type d'item. */
  credits: {},
  /** Niveau en cours (0 = le premier ; voir data/levels.js et sim/levels.js). */
  level: 0,
  /** Ce qui a été livré pour la commande du niveau en cours, par type d'item. */
  levelDelivered: {},
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
  /** Écran affiché : 'title' (menu de démarrage) ou 'game'. */
  screen: 'title',
  /** Outil actif (id d'un outil de data/buildings.js). */
  tool: 'hand',
  /** Couche regardée et modifiée : 'surface' ou 'under' (vue du sous-sol, touche U). */
  layer: 'surface',
  /** Ce que pose l'outil Tunnel : 'in' (entrée) ou 'out' (sortie). */
  tunnelEnd: 'in',
  /** Direction des prochains bâtiments posés (voir core/grid.js). */
  dir: 0,
  /** Forme du prochain splitter posé (voir data/splitterShapes.js). */
  splitterShape: 'T',
  /** Forme et priorités du prochain splitter prioritaire posé. */
  smartSplitterShape: 'YR',
  smartPriority: ['F', 'L', 'R'],
  /** Forme du prochain filtre posé. */
  filterShape: 'T',
  /** Forme du prochain groupeur posé (voir data/mergerShapes.js). */
  mergerShape: 'T',
  /** Case sous le curseur, ou null. */
  hover: null,
  /** Point exact de la souris sur la carte (pixels de jeu), ou null : montré aux autres joueurs. */
  pointer: null,
  /** Bâtiment dont la fiche est ouverte, ou null. */
  selected: null,
  /** Zone en train d'être encadrée avec l'outil Sélection : { from, to } (cases), ou null. */
  selectBox: null,
  /** Bâtiments sélectionnés (outil Sélection), sur lesquels agit le menu. */
  selection: [],
  /** Chemin de tapis en train d'être tracé (rien n'est posé avant de relâcher) : { type, cells: [{ x, y, dir }] }, ou null. */
  beltPlan: null,
  /** Groupe qui suit le curseur pour être déplacé ou copié (voir input/selection.js), ou null. */
  placing: null,
};
