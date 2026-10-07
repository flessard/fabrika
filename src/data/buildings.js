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
// layers  : couches occupées, 'surface' (par défaut) et/ou 'under' (le sous-sol).
//           inputLayer / outputLayer : la couche d'où arrivent ses items et celle où il
//           les envoie (par défaut, sa seule couche). Le tunnel passe de l'une à l'autre.
// time    : secondes pour fabriquer un item
// recipes : item reçu → item fabriqué
// storage : nombre d'items que la machine garde en stock, à l'entrée et à la sortie.
//           Quand la sortie est bloquée, la machine continue tant que son stock n'est pas plein.
//
// Les noms affichés sont dans les dictionnaires (src/i18n/) : 'building.<type>' et 'tool.<id>'.
//
// Pour ajouter une machine qui transforme des items, il suffit d'ajouter une
// entrée de kind 'crafter' ici, son nom dans src/i18n/, puis son sprite dans render/sprites/machines.js.
// Sa fiche (clic avec l'outil Déplacer) apparaît automatiquement.

export const BUILDINGS = {
  belt:     { kind: 'belt',     w: 1, h: 1 },
  // Tunnel : l'entrée fait descendre les items au sous-sol, la sortie les fait remonter.
  // Chacune occupe sa case en surface et la case du sous-sol en dessous. Entre les deux,
  // des tapis souterrains, qui passent sous tout mais ne se croisent jamais entre eux.
  underBelt: { kind: 'belt', w: 1, h: 1, layers: ['under'] },
  tunnelIn:  { kind: 'belt', w: 1, h: 1, tunnel: 'in',
               layers: ['surface', 'under'], inputLayer: 'surface', outputLayer: 'under' },
  tunnelOut: { kind: 'belt', w: 1, h: 1, tunnel: 'out',
               layers: ['surface', 'under'], inputLayer: 'under', outputLayer: 'surface' },
  splitter: { kind: 'splitter', w: 1, h: 1 },
  // Même famille que le splitter, mais remplit ses sorties par ordre de priorité.
  smartSplitter: { kind: 'splitter', w: 1, h: 1, priority: true },
  // Même famille encore, mais chaque sortie a sa liste d'items (réglée dans sa fiche).
  filter:   { kind: 'splitter', w: 1, h: 1, filter: true },
  merger:   { kind: 'merger',   w: 1, h: 1 },
  drill:    { kind: 'drill',    w: 2, h: 2, time: 1.6, storage: { output: 10 } },
  furnace:  { kind: 'crafter',  w: 2, h: 2, time: 1.3, storage: { input: 10, output: 10 },
              recipes: { fe_ore: 'fe_ingot', cu_ore: 'cu_ingot' } },
  press:    { kind: 'crafter',  w: 2, h: 2, time: 1.1, storage: { input: 10, output: 10 },
              recipes: { fe_ingot: 'fe_plate', cu_ingot: 'cu_wire' } },
  hub:      { kind: 'hub',      w: 3, h: 3 },
};

/** Ce que posent les outils au sous-sol, à la place de leur bâtiment de surface. */
export const UNDER_VARIANT = {
  belt: 'underBelt', splitter: 'underSplitter', smartSplitter: 'underSmartSplitter', filter: 'underFilter', merger: 'underMerger',
};

// Variantes souterraines des splitters et du groupeur : même comportement, posées au
// sous-sol. `base` : le bâtiment de surface dont elles sont la copie (formes, outil).
for (const type of ['splitter', 'smartSplitter', 'filter', 'merger']) {
  BUILDINGS[UNDER_VARIANT[type]] = { ...BUILDINGS[type], base: type, layers: ['under'] };
}
BUILDINGS.underBelt.base = 'belt';

/** Taille des stocks d'une machine (0 si elle n'en a pas). */
export const inputCapacity = (b) => BUILDINGS[b.type].storage?.input ?? 0;
export const outputCapacity = (b) => BUILDINGS[b.type].storage?.output ?? 0;

/** Type de bâtiment de surface dont un bâtiment souterrain est la copie (sinon, lui-même). */
export const baseType = (type) => BUILDINGS[type].base ?? type;
/** Bâtiment qui vit seulement au sous-sol (tapis, splitters et groupeurs souterrains). */
export const isUnderground = (b) => !!BUILDINGS[b.type].base;

/** Couches occupées par un type de bâtiment. */
export const layersOf = (type) => BUILDINGS[type].layers ?? ['surface'];
export const onLayer = (b, layer) => layersOf(b.type).includes(layer);
/** Couche d'où arrivent les items du bâtiment, et couche où il les envoie. */
export const inputLayer = (b) => BUILDINGS[b.type].inputLayer ?? layersOf(b.type)[0];
export const outputLayer = (b) => BUILDINGS[b.type].outputLayer ?? layersOf(b.type)[0];
/** Entrée ou sortie de tunnel. */
export const isTunnel = (b) => !!BUILDINGS[b.type].tunnel;

/** Les bâtiments qu'on peut ouvrir d'un clic pour voir leur fiche (tout sauf le dépôt). */
export const hasInfoPanel = (b) => b.kind !== 'hub';

/**
 * Outils de la palette, dans l'ordre des touches 1, 2, 3… (le 10e prend la touche 0).
 * Un outil avec `key` a sa propre lettre et ne prend pas de numéro.
 * `under` : l'outil sert aussi au sous-sol (les autres ne servent qu'en surface).
 */
export const TOOLS = [
  { id: 'hand', under: true },
  { id: 'belt', under: true },
  { id: 'tunnel', key: 'T', under: true },
  { id: 'splitter', under: true },
  { id: 'smartSplitter', under: true },
  { id: 'filter', key: 'I', under: true },
  { id: 'merger', under: true },
  { id: 'drill' },
  { id: 'furnace' },
  { id: 'press' },
  { id: 'erase', separatorBefore: true, under: true },
  { id: 'select', under: true },
];

/** Vrai si l'outil pose un bâtiment (et n'est pas Déplacer, Gomme ou Sélection). */
export const isBuildTool = (toolId) => toolId in BUILDINGS || toolId === 'tunnel';

/** Type posé par un outil de bâtiment sur une couche (ex. Splitter au sous-sol → splitter souterrain), ou null. */
export function typeForTool(toolId, layer) {
  if (!toolWorksOn(toolId, layer)) return null;
  if (layer === 'under' && UNDER_VARIANT[toolId]) return UNDER_VARIANT[toolId];
  return toolId in BUILDINGS ? toolId : null;
}

/** L'outil sert-il sur cette couche ? */
export const toolWorksOn = (toolId, layer) => layer === 'surface' || !!TOOLS.find((t) => t.id === toolId)?.under;
