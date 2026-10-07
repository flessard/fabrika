// Machines : foreuse (produit), transformateurs comme le four et la presse, Assembleur
// (recette à plusieurs ingrédients), dépôt (reçoit).
import { TILE } from '../config.js';
import { emit } from '../core/events.js';
import { game } from '../state.js';
import { BUILDINGS, inputCapacity, outputCapacity } from '../data/buildings.js';
import { outputCell } from '../world/buildings.js';
import { spawnDust, spawnItemIcon, spawnSmoke, spawnSparks } from './particles.js';
import { pushItem } from './transfer.js';
import { flowSummary, recordFlow } from './flow.js';
import { recordDelivery } from './levels.js';
import { addToStock, isStockItem } from '../world/inventory.js';
import { insertIntoStorage, storageCouldAccept } from './storage.js';

/** Une machine reçoit un item. Retourne vrai s'il est accepté. */
export function insertIntoMachine(machine, itemType) {
  if (machine.kind === 'hub') {
    deliver(machine, itemType);
    return true;
  }
  if (machine.kind === 'storage') return insertIntoStorage(machine, itemType);
  if (!machineCouldAccept(machine, itemType)) return false;
  machine.inputs.push(itemType);
  return true;
}

/**
 * Comme insertIntoMachine, mais sans rien changer. L'Assembleur garde une réserve par
 * ingrédient : un flot de plaques ne bloque pas l'arrivée des fils.
 */
export function machineCouldAccept(machine, itemType) {
  if (machine.kind === 'hub') return true;
  if (machine.kind === 'storage') return storageCouldAccept(machine, itemType);
  if (machine.kind !== 'crafter') return false;
  const def = BUILDINGS[machine.type];
  if (def.assembly) {
    if (!def.assembly.inputs[itemType]) return false;
    return machine.inputs.filter((t) => t === itemType).length < def.storage.input;
  }
  return !!def.recipes[itemType] && machine.inputs.length < inputCapacity(machine);
}

function deliver(hub, itemType) {
  game.delivered[itemType] = (game.delivered[itemType] ?? 0) + 1;
  recordDelivery(itemType);
  // Un objet de construction (un tapis…) livré au dépôt va dans l'inventaire.
  if (isStockItem(itemType)) addToStock(itemType);
  hub.flash = 0.3;
  spawnItemIcon(itemType, (hub.x + 1.5) * TILE, (hub.y + 0.6) * TILE);
  emit('item:delivered', { itemType, x: (hub.x + 1.5) * TILE, y: (hub.y + 1.5) * TILE });
}

/** Cadence d'une machine : réelle (mesurée) et maximale, en items par minute. */
export function productionRate(machine) {
  const def = BUILDINGS[machine.type];
  return { actual: flowSummary(machine).perMinute, max: (60 / def.time) * (def.assembly?.count ?? 1) };
}

/** Pousse le premier item fini vers la case de sortie. */
function emitOutput(machine) {
  if (!machine.outputs.length) return;
  const [x, y] = outputCell(machine);
  if (pushItem(x, y, machine.outputs[0], machine.dir, machine)) machine.outputs.shift();
}

export function stepDrill(drill, dt) {
  const { time } = BUILDINGS[drill.type];
  drill.working = drill.outputs.length < outputCapacity(drill);
  if (drill.working) {
    drill.progress += dt / time;
    drill.anim += dt * 9;
    if (drill.progress >= 1) {
      drill.progress = 0;
      drill.outputs.push(drill.ore);
      recordFlow(drill, drill.ore);
    }
    // Le hasard ne sert qu'aux effets visuels : l'usine, elle, reste identique chez tous.
    if (Math.random() < dt * 3) spawnDust(drill.x * TILE + 8 + Math.random() * 16, drill.y * TILE + 15);
  }
  emitOutput(drill);
}

/** Transformateur générique : prend un item en entrée, le transforme selon sa recette. */
export function stepCrafter(machine, dt) {
  const { time, recipes, assembly } = BUILDINGS[machine.type];

  if (!machine.current) {
    if (assembly) startAssembly(machine, assembly);
    else if (machine.inputs.length && machine.outputs.length < outputCapacity(machine)) {
      machine.currentInput = machine.inputs.shift();
      machine.current = recipes[machine.currentInput];
      machine.progress = 0;
    }
  }
  machine.working = !!machine.current;

  if (machine.current) {
    machine.progress += dt / time;
    machine.anim += dt;
    if (machine.progress >= 1) {
      const count = assembly?.count ?? 1;
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

/** L'Assembleur démarre quand il a tous ses ingrédients et la place de ranger ce qu'il fabrique. */
function startAssembly(machine, { inputs, output, count }) {
  const have = (item) => machine.inputs.filter((t) => t === item).length;
  if (!Object.entries(inputs).every(([item, n]) => have(item) >= n)) return;
  if (machine.outputs.length + count > outputCapacity(machine)) return;
  for (const [item, n] of Object.entries(inputs)) {
    for (let i = 0; i < n; i++) machine.inputs.splice(machine.inputs.indexOf(item), 1);
  }
  machine.currentInput = null;
  machine.current = output;
  machine.progress = 0;
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
