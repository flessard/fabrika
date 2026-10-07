// Choix de la forme d'un splitter avant de le poser.
//
// Sur un tapis, la direction est imposée par le tapis : R et F passent d'une forme
// possible à l'autre, en commençant par la meilleure suggestion.
// Sur une case vide, F change la forme et R tourne le splitter.
import { ui } from '../state.js';
import { nextShapeId } from '../data/splitterShapes.js';
import { buildingAt, canPlace } from '../world/buildings.js';
import { splitterOptions } from '../sim/splitter.js';

// Position dans la liste des suggestions, remise à zéro quand le curseur change de case.
let pick = { key: '', index: 0 };

/**
 * Ce qu'on poserait en (cell.x, cell.y) : { dir, shape, ok, onBelt, options, index }.
 * `options` et `index` servent à afficher « forme 2/3 » dans la bulle d'aide.
 */
export function splitterChoice(cell) {
  const under = buildingAt(cell.x, cell.y);
  if (under?.kind === 'belt') {
    const dir = under.dir;
    const options = splitterOptions(cell.x, cell.y, dir, ui.splitterShape);
    const key = `${cell.x},${cell.y},${dir}`;
    if (pick.key !== key) pick = { key, index: 0 };
    const index = options.length ? pick.index % options.length : 0;
    const option = options[index];
    return { dir, shape: option ? option.id : ui.splitterShape, ok: !!option, onBelt: true, options, index };
  }
  return { dir: ui.dir, shape: ui.splitterShape, ok: canPlace('splitter', cell.x, cell.y), onBelt: false, options: [], index: 0 };
}

export function cycleSplitterShape() {
  const hovered = ui.hover && buildingAt(ui.hover.x, ui.hover.y);
  if (hovered?.kind === 'belt') pick.index++;
  else ui.splitterShape = nextShapeId(ui.splitterShape);
}
