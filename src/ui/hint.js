// Bulle d'aide au-dessus de la palette : infos sur la machine survolée,
// ou formes possibles du splitter qu'on s'apprête à poser.
import { BUILDINGS } from '../data/buildings.js';
import { ITEMS } from '../data/items.js';
import { MACHINE_OUTPUT_SLOTS } from '../config.js';
import { shapeById } from '../data/splitterShapes.js';
import { ui } from '../state.js';
import { buildingAt } from '../world/buildings.js';
import { splitterChoice } from '../input/splitterPicker.js';

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
  if (ui.tool === 'splitter') return splitterHint(splitterChoice(ui.hover));
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
  else if (b.outputs.length >= MACHINE_OUTPUT_SLOTS) state = 'sortie bloquée';

  return `<b>${def.name}</b> · ${seconds} s par item · ${makes} · ${state}`;
}

function splitterHint(choice) {
  const name = shapeById(choice.shape).name;
  if (!choice.onBelt) {
    return `Splitter <b>${name}</b> · <b>F</b> forme · <b>R</b> tourner · pose-le sur un tapis pour des suggestions`;
  }
  if (!choice.ok) return 'Aucune forme ne rentre ici : les sorties sont bloquées';
  const count = choice.options.length;
  return `Splitter <b>${name}</b> · forme ${choice.index + 1}/${count} possible${count > 1 ? 's' : ''} ici · <b>R</b> pour changer`;
}
