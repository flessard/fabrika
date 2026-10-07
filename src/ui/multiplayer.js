// Multijoueur, côté interface : la ligne « Multijoueur » du HUD (héberger, rejoindre,
// joueurs connectés, quitter), les messages, et la flèche de souris des autres joueurs,
// à leur couleur, là où ils pointent sur la carte.
import { on } from '../core/events.js';
import { t } from '../i18n/index.js';
import { PLAYER_COLORS, hostGame, joinGame, leaveGame, net, serverUrl } from '../net/client.js';
import { ui, view } from '../state.js';
import { showToast } from './hud.js';
import { ARROW_HOTSPOT, playerArrow } from './cursors.js';

const $ = (id) => document.getElementById(id);
/** Un curseur dont on n'a plus de nouvelles depuis 5 s disparaît. */
const CURSOR_TIMEOUT = 5000;

export function initMultiplayer() {
  $('mpHost').addEventListener('click', hostGame);
  $('mpJoin').addEventListener('click', join);
  $('mpCode').addEventListener('keydown', (e) => {
    e.stopPropagation(); // taper un code ne doit pas changer d'outil ni déplacer la carte
    if (e.key === 'Enter') join();
  });
  $('mpLeave').addEventListener('click', leaveGame);
  on('net:changed', onNetChange);
  on('lang:changed', showState);
  showState();
}

function join() {
  const code = $('mpCode').value.trim();
  if (code.length === 4) joinGame(code);
  else $('mpCode').focus();
}

const playerName = (id) => t('mp.player', { n: id });

function onNetChange(change = {}) {
  showState();
  const { event, reason, player } = change;
  if (event === 'hosted') showToast(t('mp.hosted'), t('mp.hosted.detail', { code: net.code }));
  if (event === 'joined') showToast(t('mp.joined', { code: net.code }), t('mp.joined.detail', { name: playerName(net.you) }));
  if (event === 'playerJoined') showToast(t('mp.playerJoined', { name: playerName(player) }), '');
  if (event === 'playerLeft') showToast(t('mp.playerLeft', { name: playerName(player) }), '');
  if (event === 'desync') showToast(t('mp.desync'), t('mp.desync.detail'));
  if (reason === 'unreachable') showToast(t('mp.unreachable'), t('mp.unreachable.detail', { url: serverUrl() }));
  if (reason === 'notFound') showToast(t('mp.notFound'), t('mp.notFound.detail'));
  if (reason === 'full') showToast(t('mp.full'), t('mp.full.detail'));
  if (reason === 'closed') showToast(t('mp.closed'), t('mp.closed.detail'));
  if (reason === 'left') showToast(t('mp.left'), t('mp.left.detail'));
}

/** La ligne du HUD selon l'état : hors ligne (héberger / rejoindre) ou en partie (code, joueurs). */
function showState() {
  const online = net.status === 'online';
  $('mpOff').hidden = online;
  $('mpOn').hidden = !online;
  $('hudOnline').hidden = !online;
  for (const id of ['mpHost', 'mpJoin', 'mpCode']) $(id).disabled = net.status === 'connecting';
  if (!online) return;

  $('mpCodeLbl').textContent = net.code;
  $('mpCodeLbl').title = t('mp.code.title');
  $('mpPlayers').replaceChildren(...playerChips());
  // Dans le HUD, une petite pastille : le code de la partie et les joueurs connectés.
  const code = document.createElement('b');
  code.textContent = net.code;
  code.title = t('mp.code.title');
  $('hudOnline').replaceChildren(code, ...playerChips());
}

function playerChips() {
  return net.players.map(({ id }) => {
    const chip = document.createElement('span');
    chip.className = 'mp-player';
    chip.style.setProperty('--player', PLAYER_COLORS[id]);
    chip.textContent = id;
    chip.title = id === net.you ? t('mp.you', { name: playerName(id) }) : playerName(id);
    if (id === net.you) chip.classList.add('you');
    return chip;
  });
}

// ---------- Curseurs des autres joueurs ----------

const layer = document.getElementById('presence');
/** id → { el, x, y } : le curseur affiché, et où il est dessiné (il glisse vers la vraie position). */
const markers = new Map();
/** Part du chemin restant parcourue à chaque image : le curseur glisse au lieu de sauter. */
const SMOOTHING = 0.35;

/** À chaque image : la flèche de chaque autre joueur, à sa couleur, là où est sa souris. */
export function updatePresence() {
  const now = performance.now();
  for (const [id, cursor] of net.cursors) {
    let marker = markers.get(id);
    if (!marker) {
      const el = document.createElement('div');
      el.className = 'presence';
      el.style.setProperty('--player', PLAYER_COLORS[id]);
      const arrow = new Image();
      arrow.src = playerArrow(PLAYER_COLORS[id]);
      el.append(arrow, document.createElement('span'));
      layer.append(el);
      marker = { el, x: cursor.x, y: cursor.y };
      markers.set(id, marker);
    }
    marker.x += (cursor.x - marker.x) * SMOOTHING;
    marker.y += (cursor.y - marker.y) * SMOOTHING;
    const { el } = marker;
    el.hidden = now - cursor.at > CURSOR_TIMEOUT;
    // La pointe de la flèche tombe exactement sur le point de la carte que vise le joueur.
    el.style.transform = `translate(${Math.round((marker.x - view.camX) * view.zoom) - ARROW_HOTSPOT}px, ${Math.round((marker.y - view.camY) * view.zoom) - ARROW_HOTSPOT}px)`;
    // Un joueur qui regarde l'autre couche (surface / sous-sol) est estompé.
    el.classList.toggle('elsewhere', cursor.layer !== ui.layer);
    el.lastChild.textContent = playerName(id);
  }
  for (const [id, marker] of markers) {
    if (net.cursors.has(id)) continue;
    marker.el.remove();
    markers.delete(id);
  }
}
