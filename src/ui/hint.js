// Bulle d'aide au-dessus de la palette : infos sur la machine survolée,
// formes possibles du splitter qu'on s'apprête à poser, et surtout, quand une pose
// est impossible, la raison (en rouge) : eau, arbre, case déjà occupée…
import { on } from '../core/events.js';
import { BUILDINGS, isBuildTool, outputCapacity } from '../data/buildings.js';
import { ITEMS } from '../data/items.js';
import { ui } from '../state.js';
import { anchorFor, buildingAt, placementProblem } from '../world/buildings.js';
import { hasShapes, shapeChoice, shapeName } from '../input/shapePicker.js';
import { placementAt, placementProblems } from '../input/selection.js';
import { toolType } from '../input/actions.js';

const hintEl = document.getElementById('hint');
let shown = '';

/** Bulle rouge : la pose est impossible ici, et la bulle dit pourquoi. */
const warning = (html) => ({ html, warn: true });

export function updateHint() {
  const result = hintText();
  const { html, warn } = typeof result === 'string' ? { html: result, warn: false } : result;
  const key = `${warn}|${html}`;
  if (key === shown) return;
  shown = key;
  hintEl.innerHTML = html;
  hintEl.hidden = !html;
  hintEl.classList.toggle('warn', warn);
}

// Un clic refusé fait trembler la bulle, pour qu'on lise la raison.
on('placement:denied', () => {
  hintEl.classList.remove('shake');
  void hintEl.offsetWidth; // relance l'animation même si elle vient de jouer
  hintEl.classList.add('shake');
});

function hintText() {
  if (ui.placing) return placingHint(ui.placing);
  if (ui.beltPlan) return beltPlanHint(ui.beltPlan);
  const problem = buildProblemHint();
  if (problem) return problem;
  if (ui.tool === 'select' && !ui.selection.length) return 'Glisse pour encadrer des bâtiments à déplacer, copier ou effacer';
  if (ui.tool === 'tunnel') return tunnelHint();
  if (ui.layer === 'under') return undergroundHint();
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

function placingHint({ mode, parts }) {
  const what = `${parts.length} élément${parts.length > 1 ? 's' : ''}`;
  const keys = `<b>R</b> tourner · <b>Échap</b> ${mode === 'move' ? 'annuler' : 'terminer'}`;
  const problems = ui.hover ? placementProblems(placementAt(ui.hover).spots) : [];
  if (problems.length) return warning(`Impossible de poser ici : ${problemList(problems)} · ${keys}`);
  const verb = mode === 'move' ? `<b>Déplacer</b> ${what} · clic pour poser` : `<b>Copier</b> ${what} · clic pour poser une copie`;
  return `${verb} · ${keys}`;
}

/** Ex. « Foreuse : pas de gisement dessous ×2 · Tapis : eau » (les 3 raisons les plus fréquentes). */
function problemList(problems) {
  const shown = problems.slice(0, 3).map(({ name, problem, count }) =>
    `<b>${name}</b> : ${problem}${count > 1 ? ` ×${count}` : ''}`);
  if (problems.length > 3) shown.push(`et ${problems.length - 3} autre${problems.length > 4 ? 's' : ''}`);
  return shown.join(' · ');
}

/** Tracé de tapis : les cases où un tapis ne pourra pas être posé, et pourquoi. */
function beltPlanHint({ type, cells }) {
  const spots = cells.map(({ x, y }) => ({ part: { type }, problem: placementProblem(type, x, y) }));
  const problems = placementProblems(spots);
  const blocked = spots.filter((s) => s.problem).length;
  if (!problems.length) return `<b>${cells.length}</b> tapis · relâche pour poser · <b>Échap</b> annuler`;
  return warning(`${blocked} case${blocked > 1 ? 's' : ''} sans tapis : ${problemList(problems)} · relâche pour poser le reste · <b>Échap</b> annuler`);
}

/** Bâtiment seul sous le curseur (pas un splitter ni un groupeur) qui ne peut pas être posé. */
function buildProblemHint() {
  if (!ui.hover || !isBuildTool(ui.tool) || hasShapes(ui.tool)) return null;
  const type = toolType();
  if (!type) return null; // l'outil ne sert pas ici : la bulle du sous-sol le dit déjà
  const { x, y } = anchorFor(type, ui.hover);
  const problem = placementProblem(type, x, y);
  return problem && warning(`Impossible de poser ${BUILDINGS[type].name.toLowerCase()} ici : ${problem}`);
}

function tunnelHint() {
  const end = ui.tunnelEnd === 'in'
    ? '<b>Entrée</b> : les items descendent au sous-sol'
    : '<b>Sortie</b> : les items remontent en surface';
  return `Tunnel · ${end} · <b>F</b> entrée / sortie · <b>R</b> tourner · <b>U</b> ${ui.layer === 'under' ? 'remonter' : 'voir le sous-sol'}`;
}

function undergroundHint() {
  if (ui.tool === 'belt') {
    return '<b>Tapis souterrain</b> · passe sous les machines et les tapis, mais jamais par-dessus un autre tapis souterrain · <b>U</b> remonter';
  }
  if (hasShapes(ui.tool) && ui.hover) return shapeHint(ui.tool, shapeChoice(ui.tool, ui.hover)) + ' · sous-sol';
  return '<b>Sous-sol</b> · tapis, splitters, groupeurs et tunnels seulement · <b>U</b> remonter';
}

const TOOL_NAMES = { splitter: 'Splitter', smartSplitter: 'Prioritaire', filter: 'Filtre', merger: 'Groupeur' };

function shapeHint(toolId, choice) {
  let label = `${TOOL_NAMES[toolId]} <b>${shapeName(toolId, choice.shape)}</b>`;
  if (toolId === 'smartSplitter') label += ' · <b>P</b> priorités';
  if (toolId === 'filter') label += ' · items de chaque sortie dans sa fiche';
  if (!choice.onBelt) {
    return `${label} · <b>F</b> forme · <b>R</b> tourner · pose-le sur un tapis pour des suggestions`;
  }
  if (!choice.ok) return 'Aucune forme ne rentre ici : la sortie est bloquée';
  const count = choice.options.length;
  return `${label} · forme ${choice.index + 1}/${count} possible${count > 1 ? 's' : ''} ici · <b>R</b> pour changer`;
}
