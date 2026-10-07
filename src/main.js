// Point d'entrée : branche les modules ensemble et lance la boucle de jeu.
//
// Boucle : à chaque image, la simulation avance par pas fixes de 1/60 s
// (même vitesse sur tous les écrans), puis on dessine.
//
// Options dans l'adresse :
//   ?renderer=canvas  utilise l'ancien rendu Canvas 2D au lieu de PixiJS (pour comparer)
//   ?stress           remplit la carte de boucles de tapis pour mesurer la vitesse
import { SIM_DT } from './config.js';
import { on } from './core/events.js';
import { game } from './state.js';
import { randomSeed, startNewMap } from './world/map.js';
import { fillWithBeltLoops } from './world/stressTest.js';
import { stepSimulation } from './sim/simulation.js';
import { checkGoalJustReached, resetGoal } from './sim/goal.js';
import { createCanvasRenderer } from './render/canvasRenderer.js';
import { createPixiRenderer } from './render/pixiRenderer.js';
import { rebuildMinimapBase, renderMinimap } from './render/minimap.js';
import { centerOn, initCamera, resizeView, setResizeHandler } from './input/camera.js';
import { applyKeyboardPan, initControls } from './input/controls.js';
import { initHud, showMapInfo, showToast, updateGoalDisplay } from './ui/hud.js';
import { updateHint } from './ui/hint.js';
import { createPerfMeter } from './ui/perf.js';
import { buildToolbar, setTool } from './ui/toolbar.js';
import { playSound } from './audio/sounds.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const minimapCanvas = document.getElementById('mini');
const minimapCtx = minimapCanvas.getContext('2d');

initCamera(canvas);
const renderer = params.get('renderer') === 'canvas'
  ? createCanvasRenderer(canvas)
  : await createPixiRenderer(canvas);
setResizeHandler(renderer.resize);

// ---------- Réactions aux événements du jeu ----------

on('map:new', () => {
  if (params.has('stress')) fillWithBeltLoops();
  renderer.rebuildTerrain();
  rebuildMinimapBase();
  resetGoal();
  showMapInfo();
  updateGoalDisplay();
  centerOn(game.spawn.x, game.spawn.y);
});

on('item:delivered', () => {
  updateGoalDisplay();
  if (checkGoalJustReached()) {
    playSound('goal');
    showToast('Commande livrée !', 'Le tableau 2 arrive dans la prochaine version.');
  } else {
    playSound('deliver');
  }
});

// ---------- Démarrage ----------

initHud({ onNewMap: () => startNewMap(randomSeed()) });
buildToolbar(canvas);
initControls(canvas, minimapCanvas);
addEventListener('resize', resizeView);

resizeView();
startNewMap(randomSeed());
setTool('hand');

// ---------- Boucle ----------

const perf = createPerfMeter(renderer.name);
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

  const renderStart = performance.now();
  renderer.render(elapsed);
  perf.record(dt, performance.now() - renderStart, game.buildings.length);

  if (frameCount++ % 4 === 0) renderMinimap(minimapCtx);
  updateHint();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
