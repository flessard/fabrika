// Choix de la forme d'un splitter ou d'un groupeur avant de le poser.
//
// Sur un tapis, la direction est imposée par le tapis : R et F passent d'une forme
// possible à l'autre, en commençant par la meilleure suggestion.
// Sur une case vide, F change la forme et R tourne le bâtiment.
import { ui } from '../state.js';
import { nextShapeId } from '../data/splitterShapes.js';
import { nextMergerShapeId } from '../data/mergerShapes.js';
import { baseType, isTunnel, typeForTool } from '../data/buildings.js';
import { shapeLabel } from '../i18n/index.js';
import { buildingAt, canPlace } from '../world/buildings.js';
import { splitterOptions } from '../sim/splitter.js';
import { mergerOptions } from '../sim/merger.js';

/** Ce qui change d'un outil à l'autre. */
const TOOLS = {
  splitter: {
    options: splitterOptions,
    next: nextShapeId,
    get preferred() { return ui.splitterShape; },
    set preferred(id) { ui.splitterShape = id; },
  },
  smartSplitter: {
    options: splitterOptions,
    next: nextShapeId,
    get preferred() { return ui.smartSplitterShape; },
    set preferred(id) { ui.smartSplitterShape = id; },
  },
  filter: {
    options: splitterOptions,
    next: nextShapeId,
    get preferred() { return ui.filterShape; },
    set preferred(id) { ui.filterShape = id; },
  },
  merger: {
    options: mergerOptions,
    next: nextMergerShapeId,
    get preferred() { return ui.mergerShape; },
    set preferred(id) { ui.mergerShape = id; },
  },
};

export const hasShapes = (toolId) => toolId in TOOLS;
/** Nom d'une forme (les splitters et le groupeur ont les mêmes noms de formes). */
export const shapeName = (toolId, shapeId) => shapeLabel(shapeId);

// Position dans la liste des suggestions, remise à zéro quand le curseur change de case.
let pick = { key: '', index: 0 };

/**
 * Ce qu'on poserait en (cell.x, cell.y) avec l'outil `toolId` :
 * { dir, shape, ok, onBelt, options, index }.
 * `options` et `index` servent à afficher « forme 2/3 » dans la bulle d'aide.
 */
export function shapeChoice(toolId, cell) {
  const tool = TOOLS[toolId];
  const under = buildingAt(cell.x, cell.y, ui.layer);
  if (under?.kind === 'belt' && !isTunnel(under)) {
    const dir = under.dir;
    const options = tool.options(cell.x, cell.y, dir, tool.preferred, ui.layer);
    const key = `${toolId},${ui.layer},${cell.x},${cell.y},${dir}`;
    if (pick.key !== key) pick = { key, index: 0 };
    const index = options.length ? pick.index % options.length : 0;
    const option = options[index];
    return { dir, shape: option ? option.id : tool.preferred, ok: !!option, onBelt: true, options, index };
  }
  const type = typeForTool(toolId, ui.layer);
  return { dir: ui.dir, shape: tool.preferred, ok: !!type && canPlace(type, cell.x, cell.y), onBelt: false, options: [], index: 0 };
}

/** Retenir la forme choisie pour le prochain bâtiment du même type. */
export function rememberShape(toolId, shapeId) {
  TOOLS[toolId].preferred = shapeId;
}

export function cycleShape(toolId) {
  const hovered = ui.hover && buildingAt(ui.hover.x, ui.hover.y, ui.layer);
  if (hovered?.kind === 'belt' && !isTunnel(hovered)) pick.index++;
  else TOOLS[toolId].preferred = TOOLS[toolId].next(TOOLS[toolId].preferred);
}

/** Forme suivante pour un splitter ou un groupeur déjà posé. */
export function nextShapeFor(building) {
  return TOOLS[baseType(building.type)].next(building.shape);
}
