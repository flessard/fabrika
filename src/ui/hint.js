// Bulle d'aide au-dessus de la palette : infos sur la machine survolée,
// ou formes possibles du splitter qu'on s'apprête à poser.
import { BUILDINGS, outputCapacity } from '../data/buildings.js';
import { ITEMS } from '../data/items.js';
import { ui } from '../state.js';
import { buildingAt } from '../world/buildings.js';
import { hasShapes, shapeChoice, shapeName } from '../input/shapePicker.js';

const hintEl = document.getElementById('hint');
let shown = '';

export function updateHint() {
  const html = hintText();
  if (html === shown) return;
  shown = html;
  hintEl.innerHTML = html;
  hintEl.hidden = !html;
}

function hintText() {
  if (!ui.hover) return '';
  if (ui.tool === 'hand') return machineHint(buildingAt(ui.hover.x, ui.hover.y));
  if (hasShapes(ui.tool)) return shapeHint(ui.tool, shapeChoice(ui.tool, ui.hover));
  return '';
}

/** Ex. « Four · 1,3 s par item · Minerai de fer → Lingot de fer · 62 % » */
function machineHint(b) {
  const def = b && BUILDINGS[b.type];
  if (!def?.time) return '';

  const seconds = def.time.toFixed(1).replace('.', ',');
  const makes = b.kind === 'drill'
    ? ITEMS[b.ore].name
    : Object.entries(def.recipes).map(([from, to]) => `${ITEMS[from].name} → ${ITEMS[to].name}`).join(' · ');

  const busy = b.kind === 'drill' ? b.working : !!b.current;
  let state = 'en attente';
  if (busy) state = `${Math.floor(b.progress * 100)} %`;
  else if (b.outputs.length >= outputCapacity(b)) state = 'sortie bloquée';

  return `<b>${def.name}</b> · ${seconds} s par item · ${makes} · ${state}`;
}

const TOOL_NAMES = { splitter: 'Splitter', smartSplitter: 'Prioritaire', merger: 'Groupeur' };

function shapeHint(toolId, choice) {
  let label = `${TOOL_NAMES[toolId]} <b>${shapeName(toolId, choice.shape)}</b>`;
  if (toolId === 'smartSplitter') label += ' · <b>P</b> priorités';
  if (!choice.onBelt) {
    return `${label} · <b>F</b> forme · <b>R</b> tourner · pose-le sur un tapis pour des suggestions`;
  }
  if (!choice.ok) return 'Aucune forme ne rentre ici : la sortie est bloquée';
  const count = choice.options.length;
  return `${label} · forme ${choice.index + 1}/${count} possible${count > 1 ? 's' : ''} ici · <b>R</b> pour changer`;
}
