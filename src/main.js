// Point d'entrée : branche les modules ensemble et lance la boucle de jeu.
//
// Boucle : à chaque image, la simulation avance par pas fixes de 1/60 s
// (même vitesse sur tous les écrans), puis on dessine. En multijoueur, elle n'avance
// que jusqu'au tick que le serveur autorise (voir net/client.js).
//
// Options dans l'adresse :
//   ?renderer=canvas  utilise l'ancien rendu Canvas 2D au lieu de PixiJS (pour comparer)
//   ?stress           remplit la carte de boucles de tapis pour mesurer la vitesse
import { SIM_DT } from './config.js';
import { on } from './core/events.js';
import { game, ui } from './state.js';
import { randomSeed, startNewMap } from './world/map.js';
import { fillWithBeltLoops } from './world/stressTest.js';
import { stepSimulation } from './sim/simulation.js';
import { createCanvasRenderer } from './render/canvasRenderer.js';
import { createPixiRenderer } from './render/pixiRenderer.js';
import { rebuildMinimapBase, renderMinimap } from './render/minimap.js';
import { applySubpixelOffset, centerOn, clampCamera, initCamera, resizeView, setResizeHandler, updateZoom } from './input/camera.js';
import { applyKeyboardPan, initControls } from './input/controls.js';
import { resetSelection } from './input/selection.js';
import { initCommandFeedback } from './input/feedback.js';
import { clearCommands } from './sim/commands.js';
import { initHud, showMapInfo, showToast, updateInventory } from './ui/hud.js';
import { initLevelCard } from './ui/levelCard.js';
import { initPauseMenu } from './ui/pauseMenu.js';
import { initResearch, updateResearch } from './ui/research.js';
import { initInventoryWindow, updateInventoryWindow } from './ui/inventoryWindow.js';
import { initUiScale } from './ui/uiScale.js';
import { updateHint } from './ui/hint.js';
import { closeInfoPanel, initInfoPanel, updateInfoPanel } from './ui/infoPanel.js';
import { createPerfMeter } from './ui/perf.js';
import { afterStep, maxTick, net, shareCursor } from './net/client.js';
import { initMultiplayer, updatePresence } from './ui/multiplayer.js';
import { initTitle, updateTitle } from './ui/title.js';
import { initSelectionMenu, updateSelectionMenu } from './ui/selectionMenu.js';
import { buildToolbar, setTool, updateToolCounts } from './ui/toolbar.js';
import { exitFactory, initFactoryView, updateFactoryView } from './ui/factoryView.js';
import { installCursors } from './ui/cursors.js';
import { formatDate, t } from './i18n/index.js';
import { loadFromBrowser, saveToBrowser, savedInBrowser } from './world/save.js';
import { playSound } from './audio/sounds.js';
import { updateAmbience } from './audio/ambience.js';

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

on('map:new', ({ loaded }) => {
  exitFactory(); // une nouvelle carte (ou une partie chargée) commence dehors
  closeInfoPanel();
  resetSelection();
  clearCommands();
  if (params.has('stress') && !loaded) fillWithBeltLoops();
  renderer.rebuildTerrain();
  rebuildMinimapBase();
  showMapInfo();
  centerOn(game.spawn.x, game.spawn.y);
});

// Sur l'écran titre, l'usine du décor n'est qu'une démonstration : ni son, ni message.
const inGame = () => ui.screen !== 'title';

// Livraison : un petit son. Un niveau réussi a sa fanfare et sa carte (voir ui/levelCard.js).
on('item:delivered', (at) => {
  if (inGame()) playSound('deliver', at);
});

on('press:hit', (at) => { if (inGame()) playSound('thump', at); });

// ---------- Sauvegarde ----------

function saveGame() {
  if (saveToBrowser()) showToast(t('toast.saved'), t('toast.saved.detail', { date: formatDate(Date.now()) }));
  else showToast(t('toast.saveFailed'), t('toast.saveFailed.detail'));
  playSound('click');
}

function loadSavedGame() {
  const saved = savedInBrowser();
  if (!saved) return;
  if (loadFromBrowser()) showToast(t('toast.loaded'), t('toast.loaded.detail', { date: formatDate(saved.savedAt) }));
  else showToast(t('toast.loadFailed'), t('toast.loadFailed.detail'));
}

// ---------- Démarrage ----------

installCursors();
initHud({ onSave: saveGame, onLoad: loadSavedGame });
initLevelCard();
initPauseMenu();
initResearch();
initFactoryView();
initInventoryWindow();
initUiScale();
on('ui:scale', clampCamera);
addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && ui.screen !== 'title') {
    e.preventDefault(); // pas la fenêtre « Enregistrer la page » du navigateur
    saveGame();
  }
});
buildToolbar(canvas);
initInfoPanel();
initSelectionMenu();
initCommandFeedback();
initMultiplayer();
initControls(canvas, minimapCanvas);
addEventListener('resize', resizeView);

resizeView();
// Le décor de l'écran titre : une usine de démonstration qui travaille déjà.
startNewMap(randomSeed(), { demo: true });
setTool('hand');
initTitle();

// ---------- Boucle ----------

/** Retard (en ticks) à partir duquel on rattrape, et pas de plus au plus par image. */
const CATCH_UP_FROM = 9;
const CATCH_UP_STEPS = 60;

function step() {
  stepSimulation(SIM_DT);
  afterStep();
}

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
  updateZoom(dt);

  // Menu Échap en solo : le jeu est en pause. En multijoueur, l'usine est commune et continue.
  const paused = ui.screen === 'pause' && net.status === 'off';
  simBacklog = paused ? 0 : simBacklog + dt;
  const limit = maxTick();
  while (simBacklog >= SIM_DT && game.tick < limit) {
    step();
    simBacklog -= SIM_DT;
  }
  if (game.tick >= limit) simBacklog = Math.min(simBacklog, SIM_DT); // on attend le serveur
  // En retard sur les autres joueurs (onglet en arrière-plan, partie rejointe) : on rattrape.
  // En solo, il n'y a pas de limite (Infinity) : jamais de rattrapage.
  if (Number.isFinite(limit)) {
    for (let extra = 0; extra < CATCH_UP_STEPS && game.tick < limit - CATCH_UP_FROM; extra++) step();
  }
  shareCursor(now);
  updateTitle(elapsed);
  applySubpixelOffset();

  const renderStart = performance.now();
  renderer.render(elapsed);
  perf.record(dt, performance.now() - renderStart, game.buildings.length);

  if (frameCount++ % 4 === 0) renderMinimap(minimapCtx);
  updateHint();
  updateInfoPanel();
  updateSelectionMenu();
  updateInventory();
  updateInventoryWindow();
  updateFactoryView();
  updateToolCounts();
  updateResearch();
  updatePresence();
  updateAmbience({ muted: !inGame() });

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
