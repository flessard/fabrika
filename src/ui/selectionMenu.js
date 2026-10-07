// Menu au-dessus des bâtiments sélectionnés : déplacer, copier, effacer.
import { TILE } from '../config.js';
import { ui, view } from '../state.js';
import { buildingAt } from '../world/buildings.js';
import { clearSelection, eraseSelection, startCopy, startMove } from '../input/selection.js';

const GAP = 8;
const menu = document.getElementById('selMenu');
let shownCount = -1;

export function initSelectionMenu() {
  menu.addEventListener('click', (e) => {
    const action = e.target.closest('button')?.dataset.action;
    if (action === 'move') startMove();
    else if (action === 'copy') startCopy();
    else if (action === 'erase') eraseSelection();
    else if (action === 'close') clearSelection();
  });
}

/** À appeler à chaque image : montre le menu tant qu'il y a une sélection. */
export function updateSelectionMenu() {
  // Un bâtiment sélectionné peut avoir été effacé entre-temps (clic droit, Gomme).
  if (ui.selection.some((b) => buildingAt(b.x, b.y) !== b)) {
    ui.selection = ui.selection.filter((b) => buildingAt(b.x, b.y) === b);
  }
  const group = ui.selection;
  if (!group.length || ui.placing) {
    menu.hidden = true;
    shownCount = -1;
    return;
  }
  if (group.length !== shownCount) {
    shownCount = group.length;
    menu.querySelector('.sm-count').textContent = `${group.length} élément${group.length > 1 ? 's' : ''}`;
  }
  menu.hidden = false;
  place(group);
}

/** Place le menu au-dessus du groupe (ou en dessous s'il n'y a pas la place). */
function place(group) {
  const z = view.zoom;
  const x0 = Math.min(...group.map((b) => b.x)), x1 = Math.max(...group.map((b) => b.x + b.w));
  const y0 = Math.min(...group.map((b) => b.y)), y1 = Math.max(...group.map((b) => b.y + b.h));
  const centerX = (((x0 + x1) / 2) * TILE - view.camX) * z;
  const top = (y0 * TILE - 6 - view.camY) * z; // au-dessus des barres de progression
  const bottom = (y1 * TILE - view.camY) * z;

  const w = menu.offsetWidth, h = menu.offsetHeight;
  const below = top - h - GAP < 8;
  const y = below ? Math.min(bottom + GAP, innerHeight - h - 112) : top - h - GAP;
  menu.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, centerX - w / 2))}px`;
  menu.style.top = `${Math.max(8, y)}px`;
}
