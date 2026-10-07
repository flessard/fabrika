// Multijoueur, côté jeu : connexion au serveur relais (server/relay.js) en lockstep.
//
// Chaque joueur fait tourner la même usine. Les commandes (sim/commands.js) partent au
// serveur, qui les renvoie à tous dans des « tours » : un tour autorise quelques pas de
// simulation de plus (net.maxTick) et dit à quel tick appliquer ses commandes. Comme la
// simulation est déterministe, toutes les usines restent identiques sans jamais envoyer
// la position d'un item.
//
// Pour rejoindre, on reçoit l'état complet de l'usine d'un autre joueur (une sauvegarde,
// world/save.js) et les tours qui ont suivi. Toutes les 3 secondes, on envoie l'empreinte
// de l'usine : si elle diffère, le serveur nous renvoie l'état d'un autre joueur.
import { emit } from '../core/events.js';
import { game, ui } from '../state.js';
import { schedule, setCommandSink, setLocalPlayer, clearCommands } from '../sim/commands.js';
import { fingerprint, loadGame, serializeGame } from '../world/save.js';

/** Toutes les combien de ticks on envoie l'empreinte de l'usine (3 secondes). */
const HASH_EVERY = 180;
/** Couleur de chaque joueur (numéros 1 à 4). */
export const PLAYER_COLORS = { 1: '#feae34', 2: '#2ce8f5', 3: '#f6757a', 4: '#63c74d' };

export const net = {
  /** 'off' | 'connecting' | 'online' */
  status: 'off',
  code: null,
  you: 0,
  players: [],
  /** Souris des autres joueurs, en pixels de la carte : id → { x, y, layer, at }. */
  cursors: new Map(),
};

let ws = null;
/** Dernier tick que le serveur nous autorise à simuler. */
let allowedTick = Infinity;
/** En attente de l'état de l'usine (on rejoint, ou on a divergé) : les tours reçus sont gardés. */
let waitingState = false;
let bufferedTurns = [];

/** Adresse du serveur : ?server=… dans l'adresse, sinon le port 3002 de la même machine. */
export function serverUrl() {
  const fromAddress = new URLSearchParams(location.search).get('server');
  return fromAddress ?? `ws://${location.hostname}:3002`;
}

/** Jusqu'où la simulation peut avancer (sans limite en solo). */
export const maxTick = () => allowedTick;

/** Héberge une partie avec l'usine actuelle. */
export const hostGame = () => connect((socket) => socket.send(JSON.stringify({ t: 'host', tick: game.tick })));

/** Rejoint la partie qui a ce code. */
export function joinGame(code) {
  waitingState = true;
  bufferedTurns = [];
  return connect((socket) => socket.send(JSON.stringify({ t: 'join', code: code.trim().toUpperCase() })));
}

export function leaveGame() {
  if (!ws) return;
  closeReason = 'left';
  send({ t: 'leave' });
  ws.close();
}

/** Pourquoi la connexion se ferme : 'left', 'notFound', 'full'… (sinon déduit à la fermeture). */
let closeReason = null;

function connect(onOpen) {
  if (ws) return;
  // L'usine ne bouge plus le temps de la connexion : le serveur repartira de ce tick.
  allowedTick = game.tick;
  closeReason = null;
  net.status = 'connecting';
  emit('net:changed');
  const socket = new WebSocket(serverUrl());
  ws = socket;
  socket.addEventListener('open', () => onOpen(socket));
  socket.addEventListener('message', (e) => onMessage(JSON.parse(e.data)));
  socket.addEventListener('close', () => goOffline(closeReason ?? (net.status === 'online' ? 'closed' : 'unreachable')));
  socket.addEventListener('error', () => {}); // « close » suit toujours
}

function send(message) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function goOnline({ code, you, players }) {
  Object.assign(net, { status: 'online', code, you, players });
  setLocalPlayer(you);
  setCommandSink((command) => send({ t: 'cmd', command }));
}

/** Retour au solo : l'usine continue telle quelle, sans limite de tick. */
function goOffline(reason) {
  ws = null;
  allowedTick = Infinity;
  waitingState = false;
  setCommandSink(null);
  setLocalPlayer(0);
  Object.assign(net, { status: 'off', code: null, you: 0, players: [] });
  net.cursors.clear();
  emit('net:changed', { reason });
}

// ---------- Messages du serveur ----------

function onMessage(msg) {
  switch (msg.t) {
    case 'hosted':
      clearCommands();
      allowedTick = msg.tick;
      goOnline(msg);
      emit('net:changed', { event: 'hosted' });
      return;

    case 'joined':
    case 'resync':
      // L'usine d'un autre joueur, et les tours qui ont suivi.
      clearCommands();
      loadGame(msg.state);
      allowedTick = game.tick;
      waitingState = false;
      for (const turn of [...msg.turns, ...bufferedTurns]) applyTurn(turn);
      bufferedTurns = [];
      if (msg.t === 'joined') goOnline(msg);
      emit('net:changed', { event: msg.t });
      return;

    case 'turn':
      if (waitingState) bufferedTurns.push(msg);
      else applyTurn(msg);
      return;

    case 'players': {
      net.players = msg.players;
      if (msg.left) net.cursors.delete(msg.left);
      emit('net:changed', { event: msg.joined ? 'playerJoined' : 'playerLeft', player: msg.joined ?? msg.left });
      return;
    }

    case 'stateRequest':
      // Un joueur arrive (ou a divergé) : on envoie notre usine telle qu'elle est maintenant.
      send({ t: 'state', id: msg.id, state: serializeGame() });
      return;

    case 'desync':
      waitingState = true;
      bufferedTurns = [];
      emit('net:changed', { event: 'desync' });
      return;

    case 'cursor':
      net.cursors.set(msg.id, { x: msg.x, y: msg.y, layer: msg.layer, at: performance.now() });
      return;

    case 'error':
      closeReason = msg.reason; // 'notFound' ou 'full'
      ws?.close();
      return;
  }
}

/**
 * Un tour : ses commandes sont prévues à leur tick, et la simulation peut aller jusqu'à
 * `until`. Un tour déjà commencé dans l'état reçu (at ≤ tick actuel) a déjà ses
 * commandes dans cet état : on ne les rejoue pas.
 */
function applyTurn(turn) {
  if (turn.until <= game.tick) return;
  if (turn.at > game.tick) schedule(turn.at, turn.commands);
  allowedTick = Math.max(allowedTick, turn.until);
}

// ---------- Appelé par la boucle du jeu ----------

/** Après chaque pas de simulation : de temps en temps, l'empreinte de l'usine part au serveur. */
export function afterStep() {
  if (net.status === 'online' && !waitingState && game.tick % HASH_EVERY === 0) {
    send({ t: 'hash', tick: game.tick, hash: fingerprint() });
  }
}

let lastCursor = '';
let lastCursorAt = 0;
/**
 * À chaque image : la position de notre souris sur la carte (en pixels de jeu) part
 * aux autres, 20 fois par seconde au plus, et seulement si elle a bougé.
 */
export function shareCursor(now) {
  if (net.status !== 'online' || !ui.pointer || now - lastCursorAt < 50) return;
  const x = Math.round(ui.pointer.x), y = Math.round(ui.pointer.y);
  const key = `${x},${y},${ui.layer}`;
  if (key === lastCursor) return;
  lastCursor = key;
  lastCursorAt = now;
  send({ t: 'cursor', x, y, layer: ui.layer });
}
