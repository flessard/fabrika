// Machines : foreuse (produit), transformateurs comme le four et la presse, Assembleur
// (recette à plusieurs ingrédients), dépôt (reçoit).
import { TILE } from '../config.js';
import { emit } from '../core/events.js';
import { game } from '../state.js';
import { BUILDINGS, isOn, outputCapacity } from '../data/buildings.js';
import { ITEMS } from '../data/items.js';
import { activeRecipes, ingredientsOf, recipeUsing, yieldOf } from '../data/recipes.js';
import { outputCell } from '../world/buildings.js';
import { spawnDust, spawnItemIcon, spawnSmoke, spawnSparks } from './particles.js';
import { pushItem } from './transfer.js';
import { flowSummary, recordFlow } from './flow.js';
import { recordDelivery } from './levels.js';
import { addCredit } from './research.js';
import { addToStock, isStockItem } from '../world/inventory.js';
import { insertIntoStorage, storageCouldAccept } from './storage.js';
import { currentLevel } from './levels.js';

/**
 * Ce que le dépôt accepte :
 *  - les items de la commande en cours (même une ressource déjà complète) ;
 *  - les objets de construction (tapis, plaques de fer), qui vont dans l'inventaire ;
 *  - tout, une fois toutes les commandes livrées (partie libre).
 * Jamais les résidus. Le reste reste sur le tapis, qui affiche le refus.
 */
export function hubWants(itemType) {
  if (ITEMS[itemType]?.waste) return false;
  if (isStockItem(itemType)) return true;
  const level = currentLevel();
  return !level || level.goals.some((goal) => goal.item === itemType);
}

/** Une machine reçoit un item. Retourne vrai s'il est accepté. */
export function insertIntoMachine(machine, itemType) {
  if (machine.kind === 'hub') {
    if (!hubWants(itemType)) return false;
    deliver(machine, itemType);
    return true;
  }
  if (machine.kind === 'dump') {
    if (dumpFull(machine)) return false;
    destroy(machine, itemType);
    return true;
  }
  if (machine.kind === 'storage') return insertIntoStorage(machine, itemType);
  if (!machineCouldAccept(machine, itemType)) return false;
  machine.inputs.push(itemType);
  return true;
}

/**
 * Comme insertIntoMachine, mais sans rien changer. Une machine n'accepte que les
 * ingrédients de ses recettes actives, avec une réserve par ingrédient : un flot de
 * plaques ne bloque pas l'arrivée des fils.
 */
/**
 * La machine refuse-t-elle cet item tel qu'elle est réglée ? (Pas « pleine pour
 * l'instant » : elle ne le prendra jamais.) Le dépôt refuse ce que la commande ne
 * demande pas (voir hubWants), une machine les items sans recette active, une foreuse tout.
 */
export function machineRefuses(machine, itemType) {
  if (machine.kind === 'hub') return !hubWants(itemType);
  if (machine.kind === 'crafter') return !recipeUsing(machine, itemType);
  if (machine.kind === 'dump') return dumpFull(machine); // pleine : rien n'entre avant la vidange
  return machine.kind === 'drill';
}

export function machineCouldAccept(machine, itemType) {
  if (machine.kind === 'hub') return hubWants(itemType);
  if (machine.kind === 'dump') return !dumpFull(machine);
  if (machine.kind === 'storage') return storageCouldAccept(machine, itemType);
  if (machine.kind !== 'crafter') return false;
  if (!recipeUsing(machine, itemType)) return false;
  return machine.inputs.filter((t) => t === itemType).length < BUILDINGS[machine.type].storage.input;
}

/** Débris accumulés dans une décharge, et sa capacité. */
export const dumpFill = (dump) => dump.stored ?? 0;
export const dumpCapacity = (dump) => BUILDINGS[dump.type].capacity ?? Infinity;
export const dumpFull = (dump) => dumpFill(dump) >= dumpCapacity(dump);

/** La décharge détruit l'item : il s'ajoute à ses débris, avec un peu de poussière. */
function destroy(dump, itemType) {
  dump.destroyed++;
  dump.stored = dumpFill(dump) + 1;
  dump.flash = 0.25;
  spawnDust(dump.x * TILE + 4 + Math.random() * 8, dump.y * TILE + 6);
}

export function stepDump(dump, dt) {
  dump.flash = Math.max(0, dump.flash - dt);
}

function deliver(hub, itemType) {
  game.delivered[itemType] = (game.delivered[itemType] ?? 0) + 1;
  recordDelivery(itemType);
  // Un objet de construction (un tapis…) livré au dépôt va dans l'inventaire ; le reste
  // peut se dépenser dans l'arbre de recherche.
  if (isStockItem(itemType)) addToStock(itemType);
  else addCredit(itemType);
  hub.flash = 0.3;
  spawnItemIcon(itemType, (hub.x + 1.5) * TILE, (hub.y + 0.6) * TILE);
  emit('item:delivered', { itemType, x: (hub.x + 1.5) * TILE, y: (hub.y + 1.5) * TILE });
}

/** Cadence d'une machine : réelle (mesurée) et maximale, en items par minute. */
export function productionRate(machine) {
  const def = BUILDINGS[machine.type];
  const most = machine.kind === 'crafter' ? Math.max(1, ...activeRecipes(machine).map(({ recipe }) => yieldOf(recipe))) : 1;
  return { actual: flowSummary(machine).perMinute, max: (60 / def.time) * most };
}

/** Pousse le premier item fini vers la case de sortie. */
function emitOutput(machine) {
  if (!machine.outputs.length) return;
  const [x, y] = outputCell(machine);
  if (pushItem(x, y, machine.outputs[0], machine.dir, machine)) machine.outputs.shift();
}

export function stepDrill(drill, dt) {
  const { time, residue } = BUILDINGS[drill.type];
  // Arrêtée : elle ne creuse plus et ne sort plus rien (sa progression reste où elle était).
  drill.working = isOn(drill) && drill.outputs.length < outputCapacity(drill);
  if (!isOn(drill)) return;
  if (drill.working) {
    drill.progress += dt / time;
    drill.anim += dt * 9;
    if (drill.progress >= 1) {
      drill.progress = 0;
      drill.outputs.push(drill.ore);
      recordFlow(drill, drill.ore);
      // Tous les `every` minerais, un résidu sort aussi, sur le même tapis : il faudra le trier.
      drill.dug = (drill.dug ?? 0) + 1;
      if (residue && drill.dug % residue.every === 0) {
        drill.outputs.push(residue.item);
        recordFlow(drill, residue.item);
      }
    }
    // Le hasard ne sert qu'aux effets visuels : l'usine, elle, reste identique chez tous.
    if (Math.random() < dt * 3) spawnDust(drill.x * TILE + 8 + Math.random() * 16, drill.y * TILE + 15);
  }
  emitOutput(drill);
}

/** Transformateur générique : quand il a les ingrédients d'une recette active, il la fabrique. */
export function stepCrafter(machine, dt) {
  const { time } = BUILDINGS[machine.type];
  // Arrêtée : elle garde son stock (et en accepte encore), mais ne fabrique ni ne sort rien.
  if (!isOn(machine)) {
    machine.working = false;
    return;
  }

  if (!machine.current) startRecipe(machine);
  machine.working = !!machine.current;

  if (machine.current) {
    machine.progress += dt / time;
    machine.anim += dt;
    if (machine.progress >= 1) {
      const count = machine.currentCount ?? 1;
      for (let i = 0; i < count; i++) {
        recordFlow(machine, machine.current);
        machine.outputs.push(machine.current);
      }
      machine.current = null;
    }
  }
  if (machine.working) WORK_EFFECTS[machine.type]?.(machine, dt);
  emitOutput(machine);
}

/**
 * Démarre une recette active dont tous les ingrédients sont là, s'il y a la place de
 * ranger ce qu'elle donne. On regarde les items dans l'ordre d'arrivée : le plus ancien
 * passe en premier (pas de recette oubliée).
 */
function startRecipe(machine) {
  const have = (item) => machine.inputs.filter((t) => t === item).length;
  for (const item of new Set(machine.inputs)) {
    const found = recipeUsing(machine, item);
    if (!found) continue; // recette éteinte depuis : l'item attend qu'on la rallume
    const { index, recipe } = found;
    if (!Object.entries(recipe.in).every(([need, n]) => have(need) >= n)) continue;
    if (machine.outputs.length + yieldOf(recipe) > outputCapacity(machine)) return;
    for (const [need, n] of Object.entries(recipe.in)) {
      for (let i = 0; i < n; i++) machine.inputs.splice(machine.inputs.indexOf(need), 1);
    }
    machine.currentRecipe = index;
    machine.currentInput = ingredientsOf(recipe).length === 1 ? item : null;
    machine.current = recipe.out;
    machine.currentCount = yieldOf(recipe);
    machine.progress = 0;
    return;
  }
}

export function stepHub(hub, dt) {
  hub.flash = Math.max(0, hub.flash - dt);
  hub.anim += dt;
}

/** Hauteur (0 à 3 px) du piston de la presse. Partagé avec le dessin de la presse. */
export const pressPistonOffset = (press) =>
  press.working ? Math.round(Math.abs(Math.sin(press.anim * 7)) * 3) : 0;

/** Effets visuels (et coups de presse) pendant qu'une machine travaille. */
const WORK_EFFECTS = {
  assembler(machine, dt) {
    if (Math.random() < dt * 3) spawnSparks(machine.x * TILE + 16, machine.y * TILE + 10, 1);
  },
  furnace(machine, dt) {
    if (Math.random() < dt * 4) spawnSmoke(machine.x * TILE + 24.5, machine.y * TILE + 3);
  },
  press(machine) {
    // Le piston vient de toucher le bas : étincelles et « boum ».
    const piston = pressPistonOffset(machine);
    if (piston === 3 && machine.lastPiston !== 3) {
      spawnSparks(machine.x * TILE + 16, machine.y * TILE + 14, 3);
      emit('press:hit', { x: (machine.x + 1) * TILE, y: (machine.y + 1) * TILE });
    }
    machine.lastPiston = piston;
  },
};
