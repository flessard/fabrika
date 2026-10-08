// Écran titre : le menu de démarrage, par-dessus la vraie carte qui tourne en fond.
//
// Derrière le menu, une usine de démonstration travaille et la caméra dérive doucement.
// « Nouvelle partie » démarre sur cette même carte, à neuf (le dépôt seul), « Héberger » fait
// pareil puis ouvre une partie à plusieurs, « Rejoindre » demande un code, et
// « Continuer » (s'il y a une sauvegarde) reprend la partie sauvegardée.
//
// Le logo et le petit tapis animé sont dessinés par le code, comme le reste du pixel art.
import { TILE } from '../config.js';
import { on } from '../core/events.js';
import { PALETTE as P } from '../data/palette.js';
import { LANGS, formatDate, getLang, setLang, t } from '../i18n/index.js';
import { hostGame, joinGame, leaveGame, net } from '../net/client.js';
import { centerOn } from '../input/camera.js';
import { makeCanvas, rect, drawOn, currentCtx } from '../render/pen.js';
import { beltFrame, drawBelt } from '../render/sprites/belts.js';
import { itemSprite } from '../render/sprites/items.js';
import { animationState, drawMachineBody } from '../render/sprites/machines.js';
import { game, ui } from '../state.js';
import { startNewMap } from '../world/map.js';
import { loadFromBrowser, savedInBrowser } from '../world/save.js';
import { playSound } from '../audio/sounds.js';
import { closeLevelCard, showLevelCard } from './levelCard.js';
import { closeResearch } from './research.js';

const $ = (id) => document.getElementById(id);

/** Ce qu'on attend du serveur depuis le menu : 'host' | 'join' | null. */
let pending = null;

export function initTitle() {
  $('titleLogo').replaceWith(drawLogo());
  $('tNew').addEventListener('click', newGame);
  $('tContinue').addEventListener('click', continueGame);
  $('tHost').addEventListener('click', host);
  $('tJoin').addEventListener('click', () => showPage('join'));
  $('tBack').addEventListener('click', () => showPage('main'));
  $('tJoinGo').addEventListener('click', join);
  $('tCode').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') join();
    if (e.key === 'Escape') showPage('main');
  });

  const select = $('titleLang');
  for (const [code, { name }] of Object.entries(LANGS)) select.append(new Option(name, code));
  select.addEventListener('change', () => setLang(select.value));

  on('net:changed', onNetChange);
  on('lang:changed', showTexts);
  on('save:changed', showTexts);
  openTitle();
}

// ---------- Ouvrir, fermer ----------

export function openTitle() {
  // Revenir au menu pendant une partie à plusieurs, c'est la quitter.
  if (net.status !== 'off') leaveGame();
  ui.screen = 'title';
  ui.selected = null;
  closeLevelCard();
  closeResearch();
  document.body.classList.add('title');
  $('title').hidden = false;
  showPage('main');
  showTexts();
}

/** On entre dans la partie : la carte de niveau rappelle la commande à livrer. */
function closeTitle() {
  ui.screen = 'game';
  pending = null;
  document.body.classList.remove('title');
  $('title').hidden = true;
  centerOn(game.spawn.x, game.spawn.y);
  showLevelCard();
}

function showPage(page) {
  $('titleMain').hidden = page !== 'main';
  $('titleJoin').hidden = page !== 'join';
  setStatus('');
  if (page === 'join') $('tCode').focus();
  else $('tNew').focus();
}

function setStatus(text, error = false) {
  const status = $('titleStatus');
  status.textContent = text;
  status.classList.toggle('error', error);
}

function showTexts() {
  $('titleLang').value = getLang();
  const saved = savedInBrowser();
  $('tContinue').hidden = !saved;
  if (saved) $('tContinueDate').textContent = t('title.continue.detail', { date: formatDate(saved.savedAt) });
}

// ---------- Choix du menu ----------

/** Nouvelle partie : la carte du fond, à neuf, avec seulement le dépôt de livraison. */
function newGame() {
  playSound('place');
  startNewMap(game.seed);
  closeTitle();
}

function continueGame() {
  playSound('place');
  if (loadFromBrowser()) closeTitle();
  else setStatus(t('toast.loadFailed'), true);
}

function host() {
  playSound('click');
  startNewMap(game.seed);
  pending = 'host';
  setStatus(t('title.connecting'));
  hostGame();
}

function join() {
  const code = $('tCode').value.trim();
  if (code.length !== 4) return $('tCode').focus();
  playSound('click');
  pending = 'join';
  setStatus(t('title.connecting'));
  joinGame(code);
}

/** Réponse du serveur à « Héberger » ou « Rejoindre » : on entre dans la partie, ou on dit pourquoi pas. */
function onNetChange({ event, reason } = {}) {
  if (ui.screen !== 'title' || !pending) return;
  if (event === 'hosted' || event === 'joined') return closeTitle();
  if (reason && reason !== 'left') {
    pending = null;
    const key = { unreachable: 'mp.unreachable', notFound: 'mp.notFound', full: 'mp.full' }[reason] ?? 'mp.closed';
    setStatus(t(key), true);
  }
}

// ---------- À chaque image ----------

let beltCtx = null;

/** La caméra dérive sur la carte, et le petit tapis du menu avance. */
export function updateTitle(time) {
  if (ui.screen !== 'title') return;
  centerOn(game.spawn.x + Math.sin(time * 0.07) * 8 * TILE, game.spawn.y + Math.sin(time * 0.045) * 3 * TILE);
  drawBeltStrip(time);
}

// ---------- Dessins ----------

/** Lettres du logo, 5 × 7 (le I fait 3 de large). */
const LETTERS = {
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
};

/**
 * « FABRIKA » en blocs : chaque point de lettre est un bloc de 3 × 3 pixels, éclairé
 * en haut et ombré en bas, avec un contour noir et une ombre portée.
 */
function drawLogo() {
  const word = 'FABRIKA', B = 3, GAP = 1, PAD = 3;
  const cells = [];
  let cx = 0;
  for (const ch of word) {
    const rows = LETTERS[ch];
    rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') cells.push([cx + x, y]); }));
    cx += rows[0].length + GAP;
  }
  const filled = new Set(cells.map(([x, y]) => `${x},${y}`));
  const w = (cx - GAP) * B + PAD * 2 + 3, h = 7 * B + PAD * 2 + 3;
  const canvas = makeCanvas(w, h, () => {
    const at = (x, y) => [PAD + x * B, PAD + y * B];
    for (const [x, y] of cells) { const [px, py] = at(x, y); rect(px + 1, py + 2, B + 1, B + 1, P.plum); } // ombre portée
    for (const [x, y] of cells) { const [px, py] = at(x, y); rect(px - 1, py - 1, B + 2, B + 2, P.black); } // contour
    for (const [x, y] of cells) {
      const [px, py] = at(x, y);
      rect(px, py, B, B, P.amber);
      if (!filled.has(`${x},${y - 1}`)) rect(px, py, B, 1, P.yellow);
      if (!filled.has(`${x},${y + 1}`)) rect(px, py + B - 1, B, 1, P.orange);
    }
  });
  canvas.id = 'titleLogo';
  canvas.style.width = `${w * 3}px`; // agrandi ×3 exactement : pixels nets
  return canvas;
}

const STRIP_W = 176, STRIP_H = 40; // affiché ×2 (voir #titleBelt)
const FURNACE_X = (STRIP_W - 32) / 2;
const FURNACE = { type: 'furnace', kind: 'crafter', x: 0, y: 0, w: 2, h: 2, dir: 0, working: true };

/** Petit tapis sous le logo : le minerai entre dans un four allumé et ressort en lingots. */
function drawBeltStrip(time) {
  const canvas = $('titleBelt');
  if (!beltCtx) {
    canvas.width = STRIP_W;
    canvas.height = STRIP_H;
    beltCtx = canvas.getContext('2d');
  }
  const previous = currentCtx();
  drawOn(beltCtx);
  beltCtx.clearRect(0, 0, STRIP_W, STRIP_H);
  const frame = beltFrame(time);
  for (let x = 0; x < STRIP_W; x += TILE) drawBelt(x, STRIP_H - TILE - 2, 0, [0, 2], frame);

  // Un item tous les 28 px, qui avance avec le tapis ; il change en passant dans le four.
  const speed = 26, spacing = 28;
  const kinds = [['fe_ore', 'fe_ingot'], ['cu_ore', 'cu_ingot'], ['coal', 'coal']];
  for (let i = 0; i < STRIP_W / spacing + 1; i++) {
    const x = ((time * speed + i * spacing) % (STRIP_W + spacing)) - spacing;
    const inside = x > FURNACE_X + 2 && x < FURNACE_X + 23;
    if (inside) continue;
    const [before, after] = kinds[i % kinds.length];
    beltCtx.drawImage(itemSprite(x < FURNACE_X ? before : after), Math.round(x), STRIP_H - TILE + 2);
  }
  drawMachineBody(FURNACE, animationState(FURNACE, time), FURNACE_X, STRIP_H - 34, { shadow: false });
  drawOn(previous);
}
