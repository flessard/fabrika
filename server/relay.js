// Serveur relais du multijoueur (lockstep).
//
// Il ne fait PAS tourner l'usine : chaque joueur la fait tourner chez lui. Le serveur
//   - ouvre des parties (un code de 4 lettres, 4 joueurs au plus) ;
//   - sert d'horloge : toutes les 50 ms, il envoie un « tour » qui autorise 3 pas de
//     simulation de plus et contient les commandes reçues entre-temps, dans l'ordre ;
//   - fait rejoindre un joueur : il demande l'état de l'usine à un joueur déjà là,
//     puis l'envoie au nouveau avec les tours qui ont suivi ;
//   - compare les empreintes de l'usine que les joueurs envoient : celui qui diverge
//     est recopié sur un autre ;
//   - relaie la position des curseurs.
//
// Lancer : node server/relay.js (port 3002, ou la variable PORT).
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 3002);
const MAX_PLAYERS = 4;
const TURN_MS = 50;
const TICKS_PER_TURN = 3;
/** Tours gardés pour qu'un joueur qui arrive rattrape les autres (2 minutes). */
const HISTORY_TURNS = (2 * 60 * 1000) / TURN_MS;
/** Taille maximale d'un message (une sauvegarde d'usine reste bien en dessous). */
const MAX_MESSAGE = 4 * 1024 * 1024;

const rooms = new Map();

// ---------- Parties ----------

function newCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I ni O, faciles à confondre
  let code;
  do code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  while (rooms.has(code));
  return code;
}

function openRoom(startTick) {
  const room = {
    code: newCode(),
    players: new Map(),   // id → { id, ws }
    tick: startTick,      // dernier tick autorisé
    pending: [],          // commandes reçues depuis le dernier tour
    history: [],          // derniers tours envoyés
    waiting: new Map(),   // demande d'état → { ws, kind: 'join' | 'resync' }
    hashes: new Map(),    // tick → Map(id → empreinte)
    nextRequest: 1,
    checks: 0,            // empreintes comparées
    desyncs: 0,           // divergences trouvées
  };
  room.timer = setInterval(() => playTurn(room), TURN_MS);
  rooms.set(room.code, room);
  return room;
}

function closeRoom(room) {
  clearInterval(room.timer);
  rooms.delete(room.code);
}

function playTurn(room) {
  room.tick += TICKS_PER_TURN;
  const turn = { until: room.tick, at: room.tick - TICKS_PER_TURN + 1, commands: room.pending };
  room.pending = [];
  room.history.push(turn);
  if (room.history.length > HISTORY_TURNS) room.history.shift();
  broadcast(room, { t: 'turn', ...turn });
}

const playerList = (room) => [...room.players.keys()].map((id) => ({ id }));

function freeId(room) {
  for (let id = 1; id <= MAX_PLAYERS; id++) if (!room.players.has(id)) return id;
  return null;
}

/** Le joueur qui sert de référence (état de l'usine, empreinte) : le plus petit numéro. */
const reference = (room, except = null) => [...room.players.values()].filter((p) => p.ws !== except).sort((a, b) => a.id - b.id)[0];

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function broadcast(room, message, except = null) {
  const text = JSON.stringify(message);
  for (const { ws } of room.players.values()) if (ws !== except && ws.readyState === ws.OPEN) ws.send(text);
}

/** Demande l'état de l'usine à un joueur de référence, pour un joueur qui arrive ou qui a divergé. */
function requestState(room, ws, kind) {
  const ref = reference(room, ws);
  if (!ref) return false;
  const id = room.nextRequest++;
  room.waiting.set(id, { ws, kind });
  send(ref.ws, { t: 'stateRequest', id });
  return true;
}

// ---------- Messages des joueurs ----------

function onMessage(ws, data) {
  let msg;
  try { msg = JSON.parse(data); } catch { return; }
  const room = ws.room;

  switch (msg.t) {
    case 'host': {
      if (room) return;
      const created = openRoom(Number(msg.tick) || 0);
      created.players.set(1, { id: 1, ws });
      Object.assign(ws, { room: created, playerId: 1 });
      send(ws, { t: 'hosted', code: created.code, you: 1, players: playerList(created), tick: created.tick });
      return;
    }
    case 'join': {
      if (room) return;
      const target = rooms.get(String(msg.code ?? '').toUpperCase());
      if (!target) return send(ws, { t: 'error', reason: 'notFound' });
      const id = freeId(target);
      if (!id) return send(ws, { t: 'error', reason: 'full' });
      target.players.set(id, { id, ws });
      Object.assign(ws, { room: target, playerId: id });
      broadcast(target, { t: 'players', players: playerList(target), joined: id }, ws);
      requestState(target, ws, 'join');
      return;
    }
    case 'state': {
      // Réponse à une demande d'état : on l'envoie à celui qui attend, avec les tours qui ont suivi.
      const wait = room?.waiting.get(msg.id);
      if (!wait) return;
      room.waiting.delete(msg.id);
      const turns = room.history.filter((turn) => turn.until > msg.state.tick);
      send(wait.ws, {
        t: wait.kind === 'join' ? 'joined' : 'resync',
        code: room.code, you: wait.ws.playerId, players: playerList(room), state: msg.state, turns,
      });
      return;
    }
    case 'cmd':
      if (room && msg.command) room.pending.push({ ...msg.command, player: ws.playerId });
      return;
    case 'cursor':
      if (room) broadcast(room, { t: 'cursor', id: ws.playerId, x: msg.x, y: msg.y, layer: msg.layer }, ws);
      return;
    case 'hash':
      if (room) checkHash(room, ws, msg.tick, msg.hash);
      return;
    case 'leave':
      leave(ws);
      return;
  }
}

/** Compare l'empreinte d'un joueur à celle du joueur de référence, au même tick. */
function checkHash(room, ws, tick, hash) {
  let byPlayer = room.hashes.get(tick);
  if (!byPlayer) room.hashes.set(tick, (byPlayer = new Map()));
  byPlayer.set(ws.playerId, hash);
  for (const old of room.hashes.keys()) if (old < tick - 600) room.hashes.delete(old);

  const ref = reference(room);
  const refHash = byPlayer.get(ref.id);
  if (refHash === undefined) return;
  for (const [id, h] of byPlayer) {
    if (id === ref.id || byPlayer.checked?.has(id)) continue;
    (byPlayer.checked ??= new Set()).add(id);
    room.checks++;
    if (h === refHash) continue;
    room.desyncs++;
    const player = room.players.get(id);
    if (!player) continue;
    console.log(`[${room.code}] joueur ${id} a divergé au tick ${tick} : resynchronisation`);
    send(player.ws, { t: 'desync', tick });
    requestState(room, player.ws, 'resync');
  }
}

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  room.players.delete(ws.playerId);
  ws.room = null;
  if (!room.players.size) return closeRoom(room);
  broadcast(room, { t: 'players', players: playerList(room), left: ws.playerId });
  // Un joueur qui attendait l'état de celui qui part le redemande à un autre.
  for (const [id, wait] of room.waiting) {
    room.waiting.delete(id);
    if (wait.ws.readyState === wait.ws.OPEN) requestState(room, wait.ws, wait.kind);
  }
}

// ---------- Serveur ----------

// Une réponse HTTP simple, pour vérifier que le serveur tourne et suivre les parties.
const http = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  const lines = [...rooms.values()].map((room) =>
    `${room.code} · joueurs ${[...room.players.keys()].join(', ')} · tick ${room.tick} · empreintes comparées ${room.checks} · divergences ${room.desyncs}`);
  res.end([`Fabrika relay · ${rooms.size} partie(s)`, ...lines].join('\n') + '\n');
});

const wss = new WebSocketServer({ server: http, maxPayload: MAX_MESSAGE });
wss.on('connection', (ws) => {
  ws.on('message', (data) => onMessage(ws, data));
  ws.on('close', () => leave(ws));
});

http.listen(PORT, () => console.log(`Fabrika relay : ws://localhost:${PORT}`));
