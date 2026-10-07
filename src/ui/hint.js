// Bulle d'aide au-dessus de la palette : infos sur la machine survolée,
// formes possibles du splitter qu'on s'apprête à poser, et surtout, quand une pose
// est impossible, la raison (en rouge) : eau, arbre, case déjà occupée…
import { on } from '../core/events.js';
import { BUILDINGS, isBuildTool, outputCapacity } from '../data/buildings.js';
import { buildingName, decimal, itemName, t, tn, toolName } from '../i18n/index.js';
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
  if (ui.tool === 'select' && !ui.selection.length) return t('hint.select');
  if (ui.tool === 'tunnel') return tunnelHint();
  if (ui.layer === 'under') return undergroundHint();
  if (!ui.hover) return '';
  if (ui.tool === 'hand') return machineHint(buildingAt(ui.hover.x, ui.hover.y));
  if (hasShapes(ui.tool)) return shapeHint(ui.tool, shapeChoice(ui.tool, ui.hover));
  return '';
}

/** Ex. « Four · 1,3 s par item · Minerai de fer → Lingot de fer · 62 % » (selon la langue). */
function machineHint(b) {
  const def = b && BUILDINGS[b.type];
  if (!def?.time) return '';

  const makes = b.kind === 'drill'
    ? itemName(b.ore)
    : Object.entries(def.recipes).map(([from, to]) => `${itemName(from)} → ${itemName(to)}`).join(' · ');

  const busy = b.kind === 'drill' ? b.working : !!b.current;
  let state = t('hint.machine.waiting');
  if (busy) state = `${Math.floor(b.progress * 100)} %`;
  else if (b.outputs.length >= outputCapacity(b)) state = t('hint.machine.blocked');

  return t('hint.machine', { name: buildingName(b.type), s: decimal(def.time), makes, state });
}

function placingHint({ mode, parts }) {
  const what = tn('selection.count', parts.length);
  const keys = t(`hint.place.keys.${mode}`);
  const problems = ui.hover ? placementProblems(placementAt(ui.hover).spots) : [];
  if (problems.length) return warning(`${t('hint.cannotPlaceHere', { problems: problemList(problems) })} · ${keys}`);
  return `${t(`hint.place.${mode}`, { what })} · ${keys}`;
}

/** Ex. « Foreuse : pas de gisement dessous ×2 · Tapis : eau » (les 3 raisons les plus fréquentes). */
function problemList(problems) {
  const shown = problems.slice(0, 3).map(({ name, problem, count }) =>
    t('hint.problem', { name, problem }) + (count > 1 ? ` ×${count}` : ''));
  if (problems.length > 3) shown.push(tn('hint.more', problems.length - 3));
  return shown.join(' · ');
}

/** Tracé de tapis : les cases où un tapis ne pourra pas être posé, et pourquoi. */
function beltPlanHint({ type, cells }) {
  const spots = cells.map(({ x, y }) => ({ part: { type }, problem: placementProblem(type, x, y) }));
  const problems = placementProblems(spots);
  const blocked = spots.filter((s) => s.problem).length;
  if (!problems.length) return t('hint.belts', { n: cells.length });
  return warning(tn('hint.belts.blocked', blocked, { problems: problemList(problems) }));
}

/** Bâtiment seul sous le curseur (pas un splitter ni un groupeur) qui ne peut pas être posé. */
function buildProblemHint() {
  if (!ui.hover || !isBuildTool(ui.tool) || hasShapes(ui.tool)) return null;
  const type = toolType();
  if (!type) return null; // l'outil ne sert pas ici : la bulle du sous-sol le dit déjà
  const { x, y } = anchorFor(type, ui.hover);
  const problem = placementProblem(type, x, y);
  return problem && warning(t('hint.cannotPlace', { name: buildingName(type).toLowerCase(), problem }));
}

function tunnelHint() {
  return t('hint.tunnel', {
    end: t(ui.tunnelEnd === 'in' ? 'hint.tunnel.in' : 'hint.tunnel.out'),
    u: t(ui.layer === 'under' ? 'hint.goUp' : 'hint.goDown'),
  });
}

function undergroundHint() {
  if (ui.tool === 'belt') return t('hint.under.belt');
  if (hasShapes(ui.tool) && ui.hover) return t('hint.under.shape', { hint: shapeHint(ui.tool, shapeChoice(ui.tool, ui.hover)) });
  return t('hint.under');
}

function shapeHint(toolId, choice) {
  let label = t('hint.shape', { tool: toolName(toolId), shape: shapeName(toolId, choice.shape) });
  if (toolId === 'smartSplitter') label += t('hint.shape.priorities');
  if (toolId === 'filter') label += t('hint.shape.filter');
  if (!choice.onBelt) return t('hint.shape.free', { label });
  if (!choice.ok) return t('hint.shape.none');
  return tn('hint.shape.options', choice.options.length, { label, i: choice.index + 1 });
}
