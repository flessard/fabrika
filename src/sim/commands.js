// Commandes : la seule façon de modifier l'usine pendant la partie.
//
// L'interface ne touche jamais l'usine directement. Elle émet une commande (des données
// simples, qui pourront un jour passer par le réseau), mise en file puis appliquée au
// début du pas de simulation suivant (voir sim/simulation.js). Le handler revérifie
// tout : c'est lui qui décide, pas l'aperçu sous le curseur. Deux joueurs qui
// appliquent les mêmes commandes dans le même ordre obtiennent donc la même usine.
//
// Après chaque commande, l'événement 'command:done' { command, ok, result, problem, at }
// permet à l'interface de réagir : son, bulle qui tremble, fiche qui s'ouvre…
//
// Chaque commande est { type, …paramètres } ; `building` est un type de bâtiment.
//   place        { building, x, y, dir, props? }    poser un bâtiment (un splitter, filtre ou
//                                                   groupeur posé sur un tapis le remplace)
//   placeBelts   { building, cells: [{ x, y, dir }] }  tracé de tapis : posés là où il y a la place
//   erase        { x, y, layer }                    effacer ce qui occupe la case
//   eraseGroup   { ids }
//   placeGroup   { parts: [{ building, x, y, dir, props? }] }  copie : tout ou rien
//   moveGroup    { moves: [{ id, x, y, dir }] }     déplacement : tout ou rien, bâtiments vidés
//   rotate       { id }                             quart de tour
//   setShape     { id, shape }                      forme d'un splitter, filtre ou groupeur
//   setPriority  { id, priority }                   ex. ['L', 'F', 'R']
//   toggleFilter { id, side, item }                 side relatif au flux : 'F', 'L' ou 'R'
//   takeOutput   { id }                             met les objets de construction (tapis…) d'une machine
//                                                   dans l'inventaire, ou tout le contenu d'un conteneur
//   takeSlot     { id, slot }                       met un emplacement d'un conteneur dans l'inventaire
//   research     { id }                             débloque un outil de l'arbre de recherche
//                                                   (dépense des items livrés au dépôt)
//   clearItem    { id }                             retire l'item d'un tapis, splitter ou groupeur
//                                                   (un objet de construction retourne dans l'inventaire)
//   setStorageOutput { id, open }                   ouvre ou ferme la sortie d'un conteneur
//   setEnabled   { ids, enabled }                   met des machines en marche ou les arrête
//   setRecipe    { id, index, on }                  allume ou éteint une recette d'une machine
//                                                   (en allumer une éteint celles qui partagent un ingrédient)
//
// Les bâtiments qui ont un coût (data/buildings.js) le dépensent dans l'inventaire
// à la pose, et le rendent quand on les efface (world/inventory.js).
//
// Aucune commande ne peut créer de jonction : un tapis n'a qu'une entrée, et deux
// lignes se réunissent par un groupeur (voir mergeProblem dans sim/belt.js).
import { TILE } from '../config.js';
import { emit } from '../core/events.js';
import { turnRight } from '../core/grid.js';
import { BUILDINGS, canBePowered, isTunnel, layersOf } from '../data/buildings.js';
import { game } from '../state.js';
import {
  buildingAt, buildingById, buildingsInside, emptyBuilding, liftBuilding, placeBuilding, placementProblem, putBackBuilding, removeBuilding,
} from '../world/buildings.js';
import { t } from '../i18n/index.js';
import { spawnPuff } from './particles.js';
import { mergeProblem } from './belt.js';
import { activeRecipeIndices, withRecipe } from '../data/recipes.js';
import { takeSlots } from './storage.js';
import { addToStock, isStockItem, refund, spend, stockProblem } from '../world/inventory.js';
import { lockedProblem, researchProblem, unlock } from './research.js';

/** Le joueur de ce poste : 0 en solo, son numéro (1 à 4) dans une partie à plusieurs. */
let localPlayer = 0;
export const localPlayerId = () => localPlayer;
export const setLocalPlayer = (id) => { localPlayer = id; };

const queue = [];

/**
 * En multijoueur, les commandes ne vont pas dans la file : elles partent au serveur,
 * qui les renvoie à tous les joueurs dans le même ordre (voir net/client.js).
 */
let sink = null;
export const setCommandSink = (send) => { sink = send; };

/** Donne une commande : appliquée au prochain pas en solo, ou envoyée au serveur. */
export function issue(command) {
  if (sink) sink(command);
  else queue.push({ ...command, tick: game.tick + 1, player: localPlayer });
}

/** Commandes reçues du serveur, à appliquer au tick `at` (déjà numérotées par joueur). */
export function schedule(at, commands) {
  for (const command of commands) queue.push({ ...command, tick: at });
}

/** Applique, dans l'ordre, les commandes dont le tour est venu. Appelé à chaque pas. */
export function applyDueCommands() {
  while (queue.length && queue[0].tick <= game.tick) {
    const command = queue.shift();
    const handler = HANDLERS[command.type];
    const outcome = handler ? handler(command) : { ok: false };
    emit('command:done', { command, ...outcome });
  }
}

/** Oublie les commandes en attente (nouvelle carte, partie chargée). */
export function clearCommands() {
  queue.length = 0;
}

// ---------- Ce que fait chaque commande ----------

const center = (b) => ({ x: (b.x + b.w / 2) * TILE, y: (b.y + b.h / 2) * TILE });

/** Un bâtiment tel qu'il serait posé, pour vérifier les jonctions avant de le poser. */
const virtualOf = (type, x, y, dir, props = {}) => {
  const { kind, w, h } = BUILDINGS[type];
  return { type, kind, x, y, w, h, dir, ...props };
};
const fail = (problem = null) => ({ ok: false, problem });

/** Copie des réglages d'un bâtiment (forme, priorités, filtres), sans partager les tableaux. */
const cloneProps = (props = {}) => structuredClone(props);

/**
 * Les commandes de pose portent `layer` quand on bâtit dans une usine (« in:<id> ») :
 * le bâtiment le garde dans son champ `layer` (voir world/interiors.js).
 */
const withLayer = (props, layer) => (layer ? { ...props, layer } : props);

/** Pourquoi on ne peut pas effacer ce bâtiment, ou null. Une usine doit d'abord être vidée. */
function eraseProblem(b) {
  if (!b || b.kind === 'hub' || b.kind === 'door') return '';
  if (b.kind === 'factory' && buildingsInside(b).some((inside) => inside.kind !== 'door')) return t('problem.factoryNotEmpty');
  return null;
}

const HANDLERS = {
  place({ building: type, x, y, dir, props, layer = null }) {
    const def = BUILDINGS[type];
    if (!def) return fail();
    props = withLayer(props, layer);
    // Splitter, filtre ou groupeur posé sur un tapis : il le remplace et garde son item.
    const under = buildingAt(x, y, layer ?? layersOf(type)[0]);
    const replaces = (def.kind === 'splitter' || def.kind === 'merger') && under?.kind === 'belt' && !isTunnel(under);
    const ignore = replaces ? new Set([under]) : null;
    const problem = lockedProblem(type) ?? placementProblem(type, x, y, ignore, layer) ?? stockProblem(type)
      ?? mergeProblem([virtualOf(type, x, y, dir, props)], ignore);
    if (problem) return fail(problem);

    const carried = replaces ? under.item : null;
    if (replaces) {
      removeBuilding(under);
      refund(under.type); // le tapis remplacé retourne dans l'inventaire
    }
    spend(type);
    const placed = placeBuilding(type, x, y, dir, cloneProps(props));
    if (carried) {
      // L'item arrivait par l'arrière du tapis : il garde sa place, sans dépasser le centre.
      const progress = Math.min(0.5, carried.progress);
      placed.item = placed.kind === 'splitter'
        ? { type: carried.type, progress, enterDir: dir, outDir: null, outIndex: 0 }
        : { type: carried.type, progress, enterDir: carried.enterDir, committed: false };
    }
    const at = center(placed);
    spawnPuff(at.x, at.y, 3);
    return { ok: true, result: placed, at };
  },

  placeBelts({ building: type, cells, layer = null }) {
    if (lockedProblem(type)) return fail(lockedProblem(type));
    const placed = [];
    for (const { x, y, dir } of cells) {
      const props = withLayer({}, layer);
      if (placementProblem(type, x, y, null, layer) || stockProblem(type) || mergeProblem([virtualOf(type, x, y, dir, props)])) continue;
      spend(type);
      const b = placeBuilding(type, x, y, dir, props);
      spawnPuff((x + 0.5) * TILE, (y + 0.5) * TILE, 1);
      placed.push(b);
    }
    return placed.length ? { ok: true, result: placed, at: center(placed[0]) } : fail();
  },

  erase({ x, y, layer }) {
    const target = buildingAt(x, y, layer);
    const problem = eraseProblem(target);
    if (problem !== null) return fail(problem || null);
    const at = center(target);
    removeBuilding(target);
    refund(target.type);
    return { ok: true, result: target, at };
  },

  eraseGroup({ ids }) {
    const targets = ids.map(buildingById).filter((b) => eraseProblem(b) === null);
    if (!targets.length) return fail();
    const at = center(targets[0]);
    for (const b of targets) {
      removeBuilding(b);
      refund(b.type);
    }
    return { ok: true, result: targets, at };
  },

  placeGroup({ parts, layer = null }) {
    for (const { building, x, y } of parts) {
      const problem = lockedProblem(building) ?? placementProblem(building, x, y, null, layer);
      if (problem) return fail(problem);
    }
    parts = parts.map((part) => ({ ...part, props: withLayer(part.props, layer) }));
    // Une copie se paie d'un coup : il faut assez de stock pour tout le groupe.
    const counts = {};
    for (const { building } of parts) counts[building] = (counts[building] ?? 0) + 1;
    for (const [building, n] of Object.entries(counts)) {
      const problem = stockProblem(building, n);
      if (problem) return fail(problem);
    }
    const merge = mergeProblem(parts.map(({ building, x, y, dir, props }) => virtualOf(building, x, y, dir, props)));
    if (merge) return fail(merge);
    for (const [building, n] of Object.entries(counts)) spend(building, n);
    const placed = parts.map(({ building: type, x, y, dir, props }) => {
      const b = placeBuilding(type, x, y, dir, cloneProps(props));
      const c = center(b);
      spawnPuff(c.x, c.y, 2);
      return b;
    });
    return { ok: true, result: placed, at: center(placed[0]) };
  },

  moveGroup({ moves }) {
    const group = moves.map(({ id }) => buildingById(id));
    if (group.some((b) => !b || b.kind === 'hub' || b.kind === 'door')) return fail();
    // On retire le groupe : les cases qu'il quitte sont libres pour lui-même.
    for (const b of group) liftBuilding(b);
    const virtuals = moves.map(({ x, y, dir }, i) => virtualOf(group[i].type, x, y, dir, withLayer({ shape: group[i].shape, outputOpen: group[i].outputOpen }, group[i].layer)));
    const problem = moves.map(({ x, y }, i) => placementProblem(group[i].type, x, y, null, group[i].layer)).find(Boolean) ?? mergeProblem(virtuals);
    if (problem) {
      for (const b of group) putBackBuilding(b); // rien ne bouge
      return fail(problem);
    }
    moves.forEach(({ x, y, dir }, i) => {
      const b = group[i];
      Object.assign(b, { x, y, dir });
      emptyBuilding(b); // un groupe déplacé repart vide
      putBackBuilding(b);
      const c = center(b);
      spawnPuff(c.x, c.y, 2);
    });
    return { ok: true, result: group, at: center(group[0]) };
  },

  rotate({ id }) {
    const b = buildingById(id);
    if (!b || b.kind === 'hub') return fail();
    const problem = mergeProblem([{ ...b, dir: turnRight(b.dir) }], new Set([b]));
    if (problem) return fail(problem);
    b.dir = turnRight(b.dir);
    return { ok: true, result: b, at: center(b) };
  },

  setShape({ id, shape }) {
    const b = buildingById(id);
    if (!b?.shape) return fail();
    const problem = mergeProblem([{ ...b, shape }], new Set([b]));
    if (problem) return fail(problem);
    b.shape = shape;
    b.next = 0;
    return { ok: true, result: b, at: center(b) };
  },

  setPriority({ id, priority }) {
    const b = buildingById(id);
    if (!b?.priority) return fail();
    b.priority = [...priority];
    return { ok: true, result: b, at: center(b) };
  },

  research({ id }) {
    const problem = researchProblem(id);
    if (problem) return fail(problem);
    unlock(id);
    emit('research:done', { id });
    return { ok: true, result: id, at: null };
  },

  clearItem({ id }) {
    const b = buildingById(id);
    if (!b?.item) return fail();
    const { type } = b.item;
    b.item = null;
    b.stalled = false;
    if (isStockItem(type)) addToStock(type);
    const at = center(b);
    spawnPuff(at.x, at.y, 1);
    return { ok: true, result: type, at };
  },

  takeOutput({ id }) {
    const b = buildingById(id);
    if (!b) return fail();
    let taken;
    if (b.slots) taken = takeSlots(b); // un conteneur : tout son contenu, quel que soit l'item
    else {
      taken = b.outputs?.filter(isStockItem) ?? [];
      b.outputs = b.outputs?.filter((item) => !isStockItem(item));
    }
    if (!taken.length) return fail();
    for (const item of taken) addToStock(item);
    return { ok: true, result: taken.length, at: center(b) };
  },

  takeSlot({ id, slot }) {
    const b = buildingById(id);
    if (!b?.slots?.[slot]) return fail();
    const taken = takeSlots(b, slot);
    for (const item of taken) addToStock(item);
    return { ok: true, result: taken.length, at: center(b) };
  },

  setRecipe({ id, index, on }) {
    const b = buildingById(id);
    if (b?.kind !== 'crafter') return fail();
    b.recipes = withRecipe(b.type, activeRecipeIndices(b), index, !!on);
    return { ok: true, result: b, at: center(b) };
  },

  setEnabled({ ids, enabled }) {
    const machines = ids.map(buildingById).filter((b) => b && canBePowered(b));
    if (!machines.length) return fail();
    for (const b of machines) b.enabled = !!enabled;
    return { ok: true, result: machines, at: center(machines[0]) };
  },

  setStorageOutput({ id, open }) {
    const b = buildingById(id);
    if (b?.kind !== 'storage') return fail();
    const problem = open ? mergeProblem([{ ...b, outputOpen: true }], new Set([b])) : null;
    if (problem) return fail(problem);
    b.outputOpen = !!open;
    return { ok: true, result: b, at: center(b) };
  },

  toggleFilter({ id, side, item }) {
    const b = buildingById(id);
    if (!b?.filters?.[side]) return fail();
    const list = b.filters[side];
    b.filters[side] = list.includes(item) ? list.filter((t) => t !== item) : [...list, item];
    return { ok: true, result: b, at: center(b) };
  },
};
