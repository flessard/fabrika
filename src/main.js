// Point d'entrée : branche les modules ensemble et lance la boucle de jeu.
//
// Boucle : à chaque image, la simulation avance par pas fixes de 1/60 s
// (même vitesse sur tous les écrans), puis on dessine.
import { SIM_DT } from './config.js';
import { on } from './core/events.js';
import { game } from './state.js';
import { randomSeed, startNewMap } from './world/map.js';
import { stepSimulation } from './sim/simulation.js';
import { checkGoalJustReached, resetGoal } from './sim/goal.js';
import { rebuildTerrainImage, renderFrame } from './render/renderer.js';
import { rebuildMinimapBase, renderMinimap } from './render/minimap.js';
import { centerOn, initCamera, resizeView } from './input/camera.js';
import { applyKeyboardPan, initControls } from './input/controls.js';
import { initHud, showMapInfo, showToast, updateGoalDisplay } from './ui/hud.js';
import { updateHint } from './ui/hint.js';
import { buildToolbar, setTool } from './ui/toolbar.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.getElementById('mini');
const minimapCtx = minimapCanvas.getContext('2d');

// ---------- Réactions aux événements du jeu ----------

on('map:new', () => {
  rebuildTerrainImage();
  rebuildMinimapBase();
  resetGoal();
  showMapInfo();
  updateGoalDisplay();
  centerOn(game.spawn.x, game.spawn.y);
});

on('item:delivered', () => {
  updateGoalDisplay();
  if (checkGoalJustReached()) showToast('Commande livrée !', 'Le tableau 2 arrive dans la prochaine version.');
});

// ---------- Démarrage ----------

initCamera(canvas);
initHud({ onNewMap: () => startNewMap(randomSeed()) });
buildToolbar(canvas);
initControls(canvas, minimapCanvas);
addEventListener('resize', resizeView);

resizeView();
startNewMap(randomSeed());
setTool('hand');

// ---------- Boucle ----------

let lastFrame = performance.now();
let simBacklog = 0;
let elapsed = 0;
let frameCount = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  elapsed += dt;

  applyKeyboardPan(dt);

  simBacklog += dt;
  while (simBacklog >= SIM_DT) {
    stepSimulation(SIM_DT);
    simBacklog -= SIM_DT;
  }

  renderFrame(ctx, elapsed);
  if (frameCount++ % 4 === 0) renderMinimap(minimapCtx);
  updateHint();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
