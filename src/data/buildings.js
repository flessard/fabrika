// Les bâtiments et les outils de la palette.
//
// kind : la famille de comportement, qui choisit le code de simulation et de dessin.
//   belt     → tapis (sim/belt.js)
//   splitter → répartiteur (sim/splitter.js)
//   drill    → produit du minerai sur un gisement (sim/machines.js)
//   crafter  → transforme un item selon `recipes` (sim/machines.js)
//   hub      → dépôt qui reçoit les livraisons (sim/machines.js)
//
// Pour ajouter une machine qui transforme des items, il suffit d'ajouter une
// entrée de kind 'crafter' ici, puis son sprite dans render/sprites/machines.js.

export const BUILDINGS = {
  belt:     { name: 'Tapis',    kind: 'belt',     w: 1, h: 1 },
  splitter: { name: 'Splitter', kind: 'splitter', w: 1, h: 1 },
  drill:    { name: 'Foreuse',  kind: 'drill',    w: 2, h: 2, time: 1.6 },
  furnace:  { name: 'Four',     kind: 'crafter',  w: 2, h: 2, time: 1.3, recipes: { fe_ore: 'fe_ingot', cu_ore: 'cu_ingot' } },
  press:    { name: 'Presse',   kind: 'crafter',  w: 2, h: 2, time: 1.1, recipes: { fe_ingot: 'fe_plate', cu_ingot: 'cu_wire' } },
  hub:      { name: 'Dépôt',    kind: 'hub',      w: 3, h: 3 },
};

/** Outils de la palette, dans l'ordre des touches 1, 2, 3… */
export const TOOLS = [
  { id: 'hand', name: 'Déplacer' },
  { id: 'belt', name: 'Tapis' },
  { id: 'splitter', name: 'Splitter' },
  { id: 'drill', name: 'Foreuse' },
  { id: 'furnace', name: 'Four' },
  { id: 'press', name: 'Presse' },
  { id: 'erase', name: 'Gomme', separatorBefore: true },
];

/** Vrai si l'outil pose un bâtiment (et n'est pas Déplacer ou Gomme). */
export const isBuildTool = (toolId) => toolId in BUILDINGS;
