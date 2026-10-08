// Bulle d'aide au-dessus de la palette : infos sur la machine survolée,
// formes possibles du splitter qu'on s'apprête à poser, et surtout, quand une pose
// est impossible, la raison (en rouge) : eau, arbre, case déjà occupée…
import { on } from '../core/events.js';
import { BUILDINGS, isBuildTool, isOn, outputCapacity } from '../data/buildings.js';
import { buildingName, decimal, itemName, itemPlural, t, tn, toolName } from '../i18n/index.js';
import { ui } from '../state.js';
import { anchorFor, buildingAt, placementProblem } from '../world/buildings.js';
import { hasShapes, shapeChoice, shapeName } from '../input/shapePicker.js';
import { placementAt, placementProblems } from '../input/selection.js';
import { toolType } from '../input/actions.js';
import { affordable, stockProblem } from '../world/inventory.js';
import { mergeProblem } from '../sim/belt.js';
import { activeRecipes, ingredientsOf, yieldOf } from '../data/recipes.js';
import { ITEMS } from '../data/items.js';
import { refusal } from '../render/scene.js';

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

/** Raison d'un refus venu d'une commande (ex. une rotation qui créerait une jonction), montrée 2 s. */
let denied = null;

// Un clic refusé fait trembler la bulle, pour qu'on lise la raison.
on('placement:denied', ({ problem } = {}) => {
  if (problem) denied = { problem, until: performance.now() + 2000 };
  hintEl.classList.remove('shake');
  void hintEl.offsetWidth; // relance l'animation même si elle vient de jouer
  hintEl.classList.add('shake');
});

function hintText() {
  if (denied && performance.now() < denied.until) return warning(t('hint.denied', { problem: denied.problem }));
  if (ui.placing) return placingHint(ui.placing);
  if (ui.beltPlan) return beltPlanHint(ui.beltPlan);
  const problem = buildProblemHint();
  if (problem) return problem;
  if (ui.tool === 'select' && !ui.selection.length) return t('hint.select');
  if (ui.tool === 'tunnel') return tunnelHint();
  if (ui.layer === 'under') return undergroundHint();
  if (!ui.hover) return '';
  if (ui.tool === 'hand') {
    const hovered = buildingAt(ui.hover.x, ui.hover.y);
    const refused = hovered && refusal(hovered);
    return refused ? warning(refusalText(refused)) : machineHint(hovered);
  }
  if (hasShapes(ui.tool)) {
    const choice = shapeChoice(ui.tool, ui.hover);
    const type = toolType();
    const merge = choice.ok && type && mergeProblem([virtualOf(type, ui.hover.x, ui.hover.y, choice.dir, { shape: choice.shape })]);
    if (merge) return warning(t('hint.cannotPlace', { name: toolName(ui.tool).toLowerCase(), problem: merge }));
    return shapeHint(ui.tool, choice);
  }
  return '';
}

/**
 * Pourquoi une machine refuse l'item d'un convoyeur, et quoi faire. Ex. « Four ne prend
 * pas les résidus : triez-les avec un filtre (I) vers une décharge (G) ».
 */
export function refusalText({ item, target }) {
  const params = { machine: buildingName(target.type), item: itemName(item), items: itemPlural(item) };
  if (ITEMS[item]?.waste) return t('refused.waste', params);
  if (target.kind === 'crafter') return t('refused.recipe', params);
  return t('refused.other', params);
}

/** Ex. « Four · 1,3 s par item · Minerai de fer → Lingot de fer · 62 % » (selon la langue). */
function machineHint(b) {
  if (b?.kind === 'dump') return t('hint.dump', { name: buildingName(b.type), n: b.destroyed });
  if (b?.kind === 'storage') {
    return t('hint.storage', { name: buildingName(b.type), n: b.slots.filter(Boolean).length, total: b.slots.length });
  }
  const def = b && BUILDINGS[b.type];
  if (!def?.time) return '';

  const makes = b.kind === 'drill' ? itemName(b.ore)
    : activeRecipes(b).map(({ recipe }) => recipeText(recipe)).join(' · ') || t('panel.recipes.none');

  const busy = b.kind === 'drill' ? b.working : !!b.current;
  let state = t('hint.machine.waiting');
  if (!isOn(b)) state = t('hint.machine.off');
  else if (busy) state = `${Math.floor(b.progress * 100)} %`;
  else if (b.outputs.length >= outputCapacity(b)) state = t('hint.machine.blocked');

  return t('hint.machine', { name: buildingName(b.type), s: decimal(def.time), makes, state });
}

/** Un bâtiment tel qu'il serait posé (pour vérifier les jonctions). */
const virtualOf = (type, x, y, dir, props = {}) => ({ type, kind: BUILDINGS[type].kind, x, y, w: BUILDINGS[type].w, h: BUILDINGS[type].h, dir, ...props });

/** Ex. « Plaque de fer + Fil de cuivre → 2 Tapis », « Lingot de fer → Plaque de fer » */
const recipeText = (recipe) =>
  `${ingredientsOf(recipe).map(itemName).join(' + ')} → ${yieldOf(recipe) > 1 ? `${yieldOf(recipe)} ` : ''}${itemName(recipe.out)}`;

function placingHint({ mode, parts }) {
  const what = tn('selection.count', parts.length);
  const keys = t(`hint.place.keys.${mode}`);
  const problems = ui.hover ? placementProblems(placementAt(ui.hover).spots) : [];
  // Une copie se paie : il faut assez de stock pour tout le groupe.
  if (mode === 'copy' && !problems.length) {
    const counts = {};
    for (const { type } of parts) counts[type] = (counts[type] ?? 0) + 1;
    for (const [type, n] of Object.entries(counts)) {
      const problem = stockProblem(type, n);
      if (problem) problems.push({ name: buildingName(type), problem, count: n });
    }
  }
  const merge = ui.hover && !problems.length ? placementAt(ui.hover).merge : null;
  if (merge) problems.push({ name: buildingName('belt'), problem: merge, count: 1 });
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
  // Le stock s'épuise le long du chemin : au-delà, la raison est « plus de tapis en stock ».
  let left = affordable(type);
  const placed = [];
  const spots = cells.map(({ x, y, dir }) => {
    const v = virtualOf(type, x, y, dir);
    const problem = placementProblem(type, x, y) ?? (left > 0 ? null : stockProblem(type)) ?? mergeProblem([...placed, v]);
    if (!problem) {
      left--;
      placed.push(v);
    }
    return { part: { type }, problem };
  });
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
  const problem = placementProblem(type, x, y) ?? stockProblem(type) ?? mergeProblem([virtualOf(type, x, y, ui.dir)]);
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
