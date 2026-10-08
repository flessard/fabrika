// Caméra : quelle partie de la carte est visible, et à quel zoom.
// La caméra s'arrête aux bords de la carte (plus une petite marge).
import { CAMERA_MARGIN, CLIFF_HEIGHT, MAP_H, MAP_W, TILE, TOOLBAR_HEIGHT, ZOOM_MAX, ZOOM_MIN } from '../config.js';
import { view, ui } from '../state.js';
import { isInteriorLayer, layerSize } from '../world/interiors.js';
import { uiScale } from '../ui/uiScale.js';

let canvas = null;
/** Fonction du rendu actif qui redimensionne sa surface de dessin (voir main.js). */
let onResize = () => {};

export function initCamera(gameCanvas) {
  canvas = gameCanvas;
  view.zoom = innerWidth >= 900 ? 3 : 2;
}

export function setResizeHandler(handler) {
  onResize = handler;
}

/**
 * Le canevas a la taille de l'écran divisée par le zoom ; le navigateur l'agrandit
 * ensuite sans lissage, ce qui garde les pixels nets. Un pixel de jeu de plus dans
 * chaque sens : le canevas peut être décalé d'une fraction de pixel (voir plus bas).
 */
export function resizeView() {
  const width = Math.ceil(innerWidth / view.zoom) + 1;
  const height = Math.ceil(innerHeight / view.zoom) + 1;
  // Pendant un zoom progressif, la surface de dessin ne change que si sa taille change.
  if (width !== view.width || height !== view.height) {
    view.width = width;
    view.height = height;
    onResize(width, height);
  }
  canvas.style.width = `${view.width * view.zoom}px`;
  canvas.style.height = `${view.height * view.zoom}px`;
  clampCamera();
}

export function clampCamera() {
  // La palette du bas grandit avec la taille de l'interface.
  const bottomUi = Math.ceil((TOOLBAR_HEIGHT * uiScale()) / view.zoom);
  // Dans une usine, la caméra s'arrête aux murs de son intérieur (32 × 32), sans falaise.
  const inside = isInteriorLayer(ui.layer);
  const { w, h } = layerSize(ui.layer);
  const minX = -CAMERA_MARGIN;
  const maxX = w * TILE + CAMERA_MARGIN - view.width;
  const minY = -CAMERA_MARGIN;
  const maxY = h * TILE + CAMERA_MARGIN + (inside ? 0 : CLIFF_HEIGHT + 2) + bottomUi - view.height;
  // Si l'écran est plus grand que la carte, on la centre.
  view.camX = maxX < minX ? (minX + maxX) / 2 : Math.max(minX, Math.min(maxX, view.camX));
  view.camY = maxY < minY ? (minY + maxY) / 2 : Math.max(minY, Math.min(maxY, view.camY));
}

export function panBy(dx, dy) {
  view.camX += dx;
  view.camY += dy;
  clampCamera();
}

/** Centre la caméra sur un point de la carte, en pixels de jeu. */
export function centerOn(px, py) {
  view.camX = px - view.width / 2;
  view.camY = py - view.height / 2;
  clampCamera();
}

/** Change le zoom en gardant fixe le point de la carte sous (screenX, screenY). */
export function setZoom(zoom, screenX = innerWidth / 2, screenY = innerHeight / 2) {
  zoomTarget = null; // un zoom direct (clavier) arrête un zoom progressif en cours
  applyZoom(zoom, screenX, screenY);
}

// ---------- Zoom progressif (molette, pincement au trackpad) ----------
//
// Le zoom peut prendre n'importe quelle valeur entre ZOOM_MIN et ZOOM_MAX. La molette
// déplace une cible, et le zoom glisse vers elle en douceur, ancré sous la souris.

/** Vitesse de la molette : un cran de souris (environ 100) rapproche d'environ 8 %. */
const WHEEL_ZOOM_SPEED = 0.0008;
/** Vitesse à laquelle le zoom rejoint sa cible (plus grand = plus vif). */
const ZOOM_EASING = 12;
let zoomTarget = null;
let zoomAnchor = null;

/** Molette : rapproche (deltaY < 0) ou éloigne, autour du point (screenX, screenY). */
export function zoomByWheel(deltaY, screenX, screenY) {
  const from = zoomTarget ?? view.zoom;
  zoomTarget = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, from * Math.exp(-deltaY * WHEEL_ZOOM_SPEED)));
  zoomAnchor = { x: screenX, y: screenY };
}

/** À chaque image : le zoom avance vers sa cible. */
export function updateZoom(dt) {
  if (zoomTarget === null) return;
  const next = view.zoom + (zoomTarget - view.zoom) * (1 - Math.exp(-dt * ZOOM_EASING));
  const done = Math.abs(zoomTarget - next) < 0.002;
  applyZoom(done ? zoomTarget : next, zoomAnchor.x, zoomAnchor.y);
  if (done) zoomTarget = null;
}

/** Change le zoom en gardant fixe le point de la carte sous (screenX, screenY). */
function applyZoom(zoom, screenX, screenY) {
  zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
  if (zoom === view.zoom) return;
  const worldX = view.camX + screenX / view.zoom;
  const worldY = view.camY + screenY / view.zoom;
  view.zoom = zoom;
  resizeView();
  view.camX = worldX - screenX / view.zoom;
  view.camY = worldY - screenY / view.zoom;
  clampCamera();
}

/**
 * Défilement fluide : le rendu arrondit la caméra au pixel de jeu (pour la netteté),
 * et on décale le canevas de la fraction qui reste, au pixel d'écran près. Sans ça,
 * à un zoom de 3, la caméra avancerait par marches de 3 pixels d'écran.
 */
export function applySubpixelOffset() {
  const step = 1 / devicePixelRatio; // le plus petit déplacement visible à l'écran
  const shift = (v) => Math.round(((v - Math.floor(v)) * view.zoom) / step) * step;
  canvas.style.transform = `translate(${-shift(view.camX)}px, ${-shift(view.camY)}px)`;
}

/** Point de la carte (en pixels de jeu) sous un événement souris ou tactile. */
export function worldFromEvent(event) {
  // Le canevas commence au pixel de jeu arrondi ; son décalage est déjà dans son rectangle.
  const r = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - r.left) / view.zoom + Math.floor(view.camX),
    y: (event.clientY - r.top) / view.zoom + Math.floor(view.camY),
  };
}

/** Case de la carte sous un événement souris ou tactile. */
export function cellFromEvent(event) {
  const { x, y } = worldFromEvent(event);
  return { x: Math.floor(x / TILE), y: Math.floor(y / TILE) };
}
