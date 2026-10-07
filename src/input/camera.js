// Caméra : quelle partie de la carte est visible, et à quel zoom.
// La caméra s'arrête aux bords de la carte (plus une petite marge).
import { CAMERA_MARGIN, CLIFF_HEIGHT, MAP_H, MAP_W, TILE, TOOLBAR_HEIGHT, ZOOM_MAX, ZOOM_MIN } from '../config.js';
import { view } from '../state.js';

let canvas = null;

export function initCamera(gameCanvas) {
  canvas = gameCanvas;
  view.zoom = innerWidth >= 900 ? 3 : 2;
}

/**
 * Le canevas a la taille de l'écran divisée par le zoom ; le navigateur l'agrandit
 * ensuite sans lissage, ce qui garde les pixels nets.
 */
export function resizeView() {
  view.width = Math.ceil(innerWidth / view.zoom);
  view.height = Math.ceil(innerHeight / view.zoom);
  canvas.width = view.width;
  canvas.height = view.height;
  canvas.style.width = `${view.width * view.zoom}px`;
  canvas.style.height = `${view.height * view.zoom}px`;
  canvas.getContext('2d').imageSmoothingEnabled = false;
  clampCamera();
}

export function clampCamera() {
  const bottomUi = Math.ceil(TOOLBAR_HEIGHT / view.zoom);
  const minX = -CAMERA_MARGIN;
  const maxX = MAP_W * TILE + CAMERA_MARGIN - view.width;
  const minY = -CAMERA_MARGIN;
  const maxY = MAP_H * TILE + CAMERA_MARGIN + CLIFF_HEIGHT + 2 + bottomUi - view.height;
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

/** Case de la carte sous un événement souris ou tactile. */
export function cellFromEvent(event) {
  const r = canvas.getBoundingClientRect();
  const worldX = (event.clientX - r.left) / view.zoom + view.camX;
  const worldY = (event.clientY - r.top) / view.zoom + view.camY;
  return { x: Math.floor(worldX / TILE), y: Math.floor(worldY / TILE) };
}
