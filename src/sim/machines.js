// Machines : foreuse (produit), transformateurs comme le four et la presse, dépôt (reçoit).
import { TILE } from '../config.js';
import { emit } from '../core/events.js';
import { game } from '../state.js';
import { BUILDINGS, inputCapacity, outputCapacity } from '../data/buildings.js';
import { outputCell } from '../world/buildings.js';
import { spawnDust, spawnItemIcon, spawnSmoke, spawnSparks } from './particles.js';
import { pushItem } from './transfer.js';
import { flowSummary, recordFlow } from './flow.js';

/** Une machine reçoit un item. Retourne vrai s'il est accepté. */
export function insertIntoMachine(machine, itemType) {
  if (machine.kind === 'hub') {
    deliver(machine, itemType);
    return true;
  }
  if (machine.kind !== 'crafter') return false;

  const recipes = BUILDINGS[machine.type].recipes;
  if (!recipes[itemType] || machine.inputs.length >= inputCapacity(machine)) return false;
  machine.inputs.push(itemType);
  return true;
}

/** Comme insertIntoMachine, mais sans rien changer. */
export function machineCouldAccept(machine, itemType) {
  if (machine.kind === 'hub') return true;
  if (machine.kind !== 'crafter') return false;
  return !!BUILDINGS[machine.type].recipes[itemType] && machine.inputs.length < inputCapacity(machine);
}

function deliver(hub, itemType) {
  game.delivered[itemType] = (game.delivered[itemType] ?? 0) + 1;
  hub.flash = 0.3;
  spawnItemIcon(itemType, (hub.x + 1.5) * TILE, (hub.y + 0.6) * TILE);
  emit('item:delivered', { itemType, x: (hub.x + 1.5) * TILE, y: (hub.y + 1.5) * TILE });
}

/** Cadence d'une machine : réelle (mesurée) et maximale, en items par minute. */
export function productionRate(machine) {
  return { actual: flowSummary(machine).perMinute, max: 60 / BUILDINGS[machine.type].time };
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
    if (Math.random() < dt * 3) spawnDust(drill.x * TILE + 8 + Math.random() * 16, drill.y * TILE + 15);
  }
  emitOutput(drill);
}

/** Transformateur générique : prend un item en entrée, le transforme selon sa recette. */
export function stepCrafter(machine, dt) {
  const { time, recipes } = BUILDINGS[machine.type];

  if (!machine.current && machine.inputs.length && machine.outputs.length < outputCapacity(machine)) {
    machine.currentInput = machine.inputs.shift();
    machine.current = recipes[machine.currentInput];
    machine.progress = 0;
  }
  machine.working = !!machine.current;

  if (machine.current) {
    machine.progress += dt / time;
    machine.anim += dt;
    if (machine.progress >= 1) {
      recordFlow(machine, machine.current);
      machine.outputs.push(machine.current);
      machine.current = null;
    }
  }
  if (machine.working) WORK_EFFECTS[machine.type]?.(machine, dt);
  emitOutput(machine);
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
