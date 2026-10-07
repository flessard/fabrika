// Un pas de simulation : chaque bâtiment avance selon sa famille.
import { game } from '../state.js';
import { stepBelt } from './belt.js';
import { stepSplitter } from './splitter.js';
import { stepCrafter, stepDrill, stepHub } from './machines.js';
import { updateParticles } from './particles.js';

const STEP_BY_KIND = {
  belt: stepBelt,
  splitter: stepSplitter,
  merger: stepBelt, // une fois entré, l'item avance comme sur un tapis
  drill: stepDrill,
  crafter: stepCrafter,
  hub: stepHub,
};

export function stepSimulation(dt) {
  game.tick++;
  for (const building of game.buildings) STEP_BY_KIND[building.kind](building, dt);
  updateParticles(dt);
}
