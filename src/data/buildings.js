// Les bâtiments et les outils de la palette.
//
// kind : la famille de comportement, qui choisit le code de simulation et de dessin.
//   belt     → tapis (sim/belt.js)
//   splitter → répartiteur : 1 entrée, plusieurs sorties (sim/splitter.js)
//   merger   → groupeur : plusieurs entrées, 1 sortie (sim/merger.js)
//   drill    → produit du minerai sur un gisement (sim/machines.js)
//   crafter  → transforme un item selon `recipes` (sim/machines.js)
//   hub      → dépôt qui reçoit les livraisons (sim/machines.js)
//
// time    : secondes pour fabriquer un item
// recipes : item reçu → item fabriqué
// storage : nombre d'items que la machine garde en stock, à l'entrée et à la sortie.
//           Quand la sortie est bloquée, la machine continue tant que son stock n'est pas plein.
//
// Pour ajouter une machine qui transforme des items, il suffit d'ajouter une
// entrée de kind 'crafter' ici, puis son sprite dans render/sprites/machines.js.
// Sa fiche (clic avec l'outil Déplacer) apparaît automatiquement.

export const BUILDINGS = {
  belt:     { name: 'Tapis',    kind: 'belt',     w: 1, h: 1 },
  splitter: { name: 'Splitter', kind: 'splitter', w: 1, h: 1 },
  // Même famille que le splitter, mais remplit ses sorties par ordre de priorité.
  smartSplitter: { name: 'Splitter prioritaire', kind: 'splitter', w: 1, h: 1, priority: true },
  merger:   { name: 'Groupeur', kind: 'merger',   w: 1, h: 1 },
  drill:    { name: 'Foreuse',  kind: 'drill',    w: 2, h: 2, time: 1.6, storage: { output: 10 } },
  furnace:  { name: 'Four',     kind: 'crafter',  w: 2, h: 2, time: 1.3, storage: { input: 10, output: 10 },
              recipes: { fe_ore: 'fe_ingot', cu_ore: 'cu_ingot' } },
  press:    { name: 'Presse',   kind: 'crafter',  w: 2, h: 2, time: 1.1, storage: { input: 10, output: 10 },
              recipes: { fe_ingot: 'fe_plate', cu_ingot: 'cu_wire' } },
  hub:      { name: 'Dépôt',    kind: 'hub',      w: 3, h: 3 },
};

/** Taille des stocks d'une machine (0 si elle n'en a pas). */
export const inputCapacity = (b) => BUILDINGS[b.type].storage?.input ?? 0;
export const outputCapacity = (b) => BUILDINGS[b.type].storage?.output ?? 0;

/** Les bâtiments qu'on peut ouvrir d'un clic pour voir leur fiche (tout sauf le dépôt). */
export const hasInfoPanel = (b) => b.kind !== 'hub';

/** Outils de la palette, dans l'ordre des touches 1, 2, 3… (le 10e prend la touche 0). */
export const TOOLS = [
  { id: 'hand', name: 'Déplacer' },
  { id: 'belt', name: 'Tapis' },
  { id: 'splitter', name: 'Splitter' },
  { id: 'smartSplitter', name: 'Prioritaire' },
  { id: 'merger', name: 'Groupeur' },
  { id: 'drill', name: 'Foreuse' },
  { id: 'furnace', name: 'Four' },
  { id: 'press', name: 'Presse' },
  { id: 'erase', name: 'Gomme', separatorBefore: true },
  { id: 'select', name: 'Sélection' },
];

/** Vrai si l'outil pose un bâtiment (et n'est pas Déplacer, Gomme ou Sélection). */
export const isBuildTool = (toolId) => toolId in BUILDINGS;
