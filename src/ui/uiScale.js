// Taille de l'interface : agrandit ou réduit les panneaux (HUD, mini-carte, palette,
// fiches, menus…) sans toucher à la carte ni à son zoom.
//
// Elle passe par la variable CSS --ui-scale (la propriété CSS zoom des panneaux, voir
// styles/main.css). Un panneau agrandi ainsi a sa position (left, top) multipliée par
// l'échelle : ceux qu'on place nous-mêmes divisent donc leur position par uiScale().
// Le choix est retenu dans le navigateur.
import { emit } from '../core/events.js';

export const UI_SCALES = [0.75, 0.9, 1, 1.15, 1.3, 1.5];
const STORAGE_KEY = 'fabrika.uiScale';

let scale = loadScale();

function loadScale() {
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (UI_SCALES.includes(saved)) return saved;
  } catch { /* stockage indisponible */ }
  return 1;
}

export const uiScale = () => scale;

export function setUiScale(next) {
  if (!UI_SCALES.includes(next) || next === scale) return;
  scale = next;
  try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* pas grave */ }
  apply();
  emit('ui:scale', next);
}

function apply() {
  document.documentElement.style.setProperty('--ui-scale', String(scale));
}

/** Place un panneau agrandi en (left, top), donnés en pixels d'écran. */
export function placeScaled(el, left, top) {
  el.style.left = `${left / scale}px`;
  el.style.top = `${top / scale}px`;
}

/** Taille d'un panneau telle qu'on la voit à l'écran (avec l'échelle de l'interface). */
export function screenSize(el) {
  const r = el.getBoundingClientRect();
  return { w: r.width, h: r.height };
}

/** Le menu de la taille de l'interface (dans le menu Échap). */
export function initUiScale() {
  apply();
  const select = document.getElementById('uiScale');
  for (const s of UI_SCALES) select.append(new Option(`${Math.round(s * 100)} %`, String(s)));
  select.value = String(scale);
  select.addEventListener('change', () => setUiScale(Number(select.value)));
}
