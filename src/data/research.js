// Arbre de recherche : les outils de construction qu'il faut débloquer.
//
// On part avec de quoi faire des lingots (tapis, foreuse, four), trier les résidus des
// foreuses (filtre) et les jeter (décharge) : c'est la première commande. Le reste se débloque en dépensant des items livrés au dépôt (game.credits) :
// chaque item livré compte, qu'il serve à la commande en cours ou non.
//
// Chaque nœud : l'outil (id de data/buildings.js, TOOLS), ce qu'il coûte, les nœuds
// qu'il faut avoir avant, et sa place dans le dessin de l'arbre (colonne, rangée).
// Déplacer, Gomme et Sélection ne sont pas dans l'arbre : toujours disponibles.
export const RESEARCH = [
  { id: 'belt',          col: 0, row: 0, start: true },
  { id: 'dump',          col: 0, row: 1, start: true },
  { id: 'filter',        col: 0, row: 2, start: true },
  { id: 'drill',         col: 0, row: 3, start: true },
  { id: 'furnace',       col: 0, row: 4, start: true },

  { id: 'splitter',      col: 1, row: 0, requires: ['belt'],     cost: { fe_ingot: 8 } },
  { id: 'merger',        col: 1, row: 2, requires: ['belt'],     cost: { fe_ingot: 8 } },
  { id: 'press',         col: 1, row: 4, requires: ['furnace'],  cost: { fe_ingot: 10 } },

  { id: 'smartSplitter', col: 2, row: 0, requires: ['splitter'], cost: { fe_plate: 20, cu_wire: 15 } },
  { id: 'tunnel',        col: 2, row: 2, requires: ['merger'],   cost: { fe_plate: 15 } },
  { id: 'container',     col: 2, row: 3, requires: ['press'],    cost: { fe_plate: 15 } },
  { id: 'assembler',     col: 2, row: 4, requires: ['press'],    cost: { fe_plate: 10, cu_wire: 10 } },
];

export const researchNode = (id) => RESEARCH.find((node) => node.id === id) ?? null;

/** Ce qui est débloqué au début d'une partie. */
export const START_UNLOCKED = RESEARCH.filter((node) => node.start).map((node) => node.id);

/** Tout l'arbre (l'usine de démonstration, et les sauvegardes d'avant l'arbre). */
export const ALL_UNLOCKED = RESEARCH.map((node) => node.id);
