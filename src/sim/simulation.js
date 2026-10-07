// Un pas de simulation : d'abord les commandes des joueurs (poser, effacer…),
// puis chaque bâtiment avance selon sa famille.
import { game } from '../state.js';
import { stepBelt } from './belt.js';
import { stepSplitter } from './splitter.js';
import { stepCrafter, stepDrill, stepHub } from './machines.js';
import { updateParticles } from './particles.js';
import { applyDueCommands } from './commands.js';
import { stepStorage } from './storage.js';

const STEP_BY_KIND = {
  belt: stepBelt,
  splitter: stepSplitter,
  merger: stepBelt, // une fois entré, l'item avance comme sur un tapis
  drill: stepDrill,
  crafter: stepCrafter,
  hub: stepHub,
  storage: stepStorage,
};

export function stepSimulation(dt) {
  game.tick++;
  applyDueCommands();
  for (const building of game.buildings) STEP_BY_KIND[building.kind](building, dt);
  updateParticles(dt);
}
