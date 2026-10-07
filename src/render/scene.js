// Ce que les deux rendus (Canvas 2D et PixiJS) calculent de la même façon :
// la partie visible, la position des items, les reflets de l'eau, l'aperçu du curseur.
import { MAP_H, MAP_W, TILE } from '../config.js';
import { DIRS, cellIndex, opposite } from '../core/grid.js';
import { hash2 } from '../core/random.js';
import { BUILDINGS, isBuildTool, isTunnel, isUnderground, layersOf } from '../data/buildings.js';
import { PALETTE as P } from '../data/palette.js';
import { game, ui, view } from '../state.js';
import { GROUND } from '../world/terrain.js';
import { anchorFor, buildingAt, canPlace, outputCell } from '../world/buildings.js';
import { hasShapes, shapeChoice } from '../input/shapePicker.js';
import { highlightedBuildings, placementAt, selectBoxArea } from '../input/selection.js';
import { toolType } from '../input/actions.js';
import { beltArms, feedsInto } from '../sim/belt.js';
import { emptyFilters } from '../data/splitterShapes.js';
import { outputScore } from '../sim/splitter.js';

/** Coin haut-gauche de la caméra arrondi au pixel, pour un rendu net. */
export const cameraOrigin = () => ({ ox: Math.round(view.camX), oy: Math.round(view.camY) });

/** Cases visibles à l'écran. */
export function visibleCells(ox, oy) {
  return {
    x0: Math.max(0, Math.floor(ox / TILE)),
    y0: Math.max(0, Math.floor(oy / TILE)),
    x1: Math.min(MAP_W - 1, Math.ceil((ox + view.width) / TILE)),
    y1: Math.min(MAP_H - 1, Math.ceil((oy + view.height) / TILE)),
  };
}

export const isVisible = (b, ox, oy) =>
  b.x * TILE + b.w * TILE > ox - 8 && b.x * TILE < ox + view.width + 8 &&
  b.y * TILE + b.h * TILE > oy - 8 && b.y * TILE < oy + view.height + 8;

/**
 * Position (en pixels de la carte) d'un item sur un tapis ou un splitter : de son
 * côté d'entrée jusqu'au centre (progress 0 → 0,5), puis vers la sortie (0,5 → 1).
 */
export function carriedItemPosition(b) {
  const item = b.item;
  const cx = b.x * TILE + 8, cy = b.y * TILE + 8;
  if (item.progress < 0.5) {
    const k = item.progress * 2;
    const [ex, ey] = DIRS[item.enterDir];
    return [cx - ex * 8 * (1 - k), cy - ey * 8 * (1 - k)];
  }
  const outDir = b.kind === 'splitter' ? (item.outDir ?? b.dir) : b.dir; // tapis et groupeur : devant
  const [dx, dy] = DIRS[outDir];
  const k = (item.progress - 0.5) * 2;
  return [cx + dx * 8 * k, cy + dy * 8 * k];
}

/**
 * Image d'animation d'un tapis ou d'un splitter : celle de tout le monde quand il
 * roule, figée sur la dernière quand il est arrêté (item bloqué).
 */
const frozenFrames = new WeakMap();
export function conveyorFrame(b, frame) {
  if (!b.stalled) {
    frozenFrames.delete(b);
    return frame;
  }
  if (!frozenFrames.has(b)) frozenFrames.set(b, frame);
  return frozenFrames.get(b);
}

/** Cadre autour de la machine dont la fiche est ouverte (en cases), ou null. */
export function selectionOutline() {
  const b = ui.selected;
  if (!b || !game.buildings.includes(b)) return null;
  return { x: b.x, y: b.y, w: b.w, h: b.h, color: P.amber };
}

/** Outils qui posent des tapis ou en font partie : avec eux, toutes les entrées des machines s'affichent. */
const CONVEYOR_TOOLS = new Set(['belt', 'splitter', 'smartSplitter', 'merger', 'tunnel']);

/**
 * Entrées et sorties sur le bord des machines visibles :
 * [{ x, y (centre, en pixels de la carte), dir (sens du flux), kind: 'in' | 'out', connected, faint }]
 *
 *   - branchée (`connected`) : un tapis ou une machine y passe déjà ; on dessine un raccord ;
 *   - la sortie (foreuse, four, presse) pas encore branchée : une flèche, toujours montrée ;
 *   - les entrées pas encore branchées (four, presse, dépôt : n'importe quel côté sauf la
 *     sortie) : des flèches estompées (`faint`), seulement quand on survole la machine ou
 *     qu'on tient un outil de tapis, pour montrer où brancher.
 * Rien en vue du sous-sol : les machines y sont dans l'ombre.
 */
export function machinePorts(visible) {
  if (ui.layer === 'under') return [];
  const ports = [];
  const hovered = ui.hover && buildingAt(ui.hover.x, ui.hover.y);
  const showAll = CONVEYOR_TOOLS.has(ui.tool);

  for (const b of visible) {
    if (b.kind !== 'drill' && b.kind !== 'crafter' && b.kind !== 'hub') continue;
    const out = b.kind === 'hub' ? null : outputCell(b);
    if (out) {
      // Au milieu du bord, entre la dernière case de la machine et la case de sortie.
      const [dx, dy] = DIRS[b.dir];
      // Branchée si ce qui est devant la sortie peut recevoir (tapis dans le bon sens, machine…).
      const connected = outputScore(out[0] - dx, out[1] - dy, b.dir) === 1;
      ports.push({ x: (out[0] + 0.5 - dx / 2) * TILE, y: (out[1] + 0.5 - dy / 2) * TILE, dir: b.dir, kind: 'out', connected, faint: false });
    }
    if (b.kind === 'drill') continue; // une foreuse ne reçoit rien

    const all = showAll || hovered === b;
    for (let cy = b.y; cy < b.y + b.h; cy++) {
      for (let cx = b.x; cx < b.x + b.w; cx++) {
        for (let side = 0; side < 4; side++) {
          const [dx, dy] = DIRS[side];
          const nx = cx + dx, ny = cy + dy;
          if (nx >= b.x && nx < b.x + b.w && ny >= b.y && ny < b.y + b.h) continue; // case de la machine
          if (out && nx === out[0] && ny === out[1]) continue;
          const neighbor = buildingAt(nx, ny);
          const connected = !!neighbor && feedsInto(neighbor, cx, cy, opposite(side));
          if (!connected && !all) continue;
          ports.push({ x: (cx + 0.5 + dx / 2) * TILE, y: (cy + 0.5 + dy / 2) * TILE, dir: opposite(side), kind: 'in', connected, faint: !connected });
        }
      }
    }
  }
  return ports;
}

/** Reflets blancs (2 × 1 px) sur l'eau visible, qui changent 3 fois par seconde. */
export function waterSparkles({ x0, y0, x1, y1 }, time) {
  const tick = Math.floor(time * 3);
  const sparkles = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (game.map.ground[cellIndex(x, y)] < GROUND.WATER) continue;
      const h = hash2(x, y + tick * 31);
      if (h % 9 === 0) sparkles.push([x * TILE + 2 + ((h >> 5) % 11), y * TILE + 2 + ((h >> 9) % 11)]);
    }
  }
  return sparkles;
}

/**
 * Ce qu'il faut montrer sous le curseur :
 *   outlines : cadres { x, y, w, h (en cases), color }
 *   ghosts   : aperçus transparents des bâtiments à poser, chacun :
 *              { kind: 'belt' | 'underBelt', x, y, dir, arms } | { kind: 'tunnel', x, y, dir, end }
 *              | { kind: 'splitter' | 'merger', x, y, dir, shape, priority?, under } | { kind: 'machine', building }
 *              (`under` : version souterraine)
 *   affected : Map tapis voisin → bras qu'il aura une fois le bâtiment posé
 *              (ex. une ligne droite qui deviendra un T)
 */
export function cursorPreview(cell, time) {
  if (ui.beltPlan) return beltPlanPreview();
  if (!cell || ui.placing) return null;

  if (!isBuildTool(ui.tool)) {
    if (ui.tool === 'select') return null; // la sélection a sa propre surbrillance
    const color = ui.tool === 'erase' ? P.red : P.yellow;
    const target = buildingAt(cell.x, cell.y, ui.layer);
    if (target) return { outlines: [{ x: target.x, y: target.y, w: target.w, h: target.h, color }] };
    if (ui.tool === 'erase') return { outlines: [{ x: cell.x, y: cell.y, w: 1, h: 1, color }] };
    return null;
  }

  // L'outil ne sert pas sur cette couche (ex. une foreuse au sous-sol).
  const type = toolType();
  if (!type) return { outlines: [{ x: cell.x, y: cell.y, w: 1, h: 1, color: P.red }] };

  const def = BUILDINGS[type];
  const { x, y } = anchorFor(type, cell);
  // Le bâtiment tel qu'il serait posé, pour calculer les raccords.
  const virtual = { type, kind: def.kind, x, y, w: def.w, h: def.h, dir: ui.dir };
  let ghost, ok;
  if (hasShapes(ui.tool)) {
    const choice = shapeChoice(ui.tool, cell);
    ok = choice.ok;
    virtual.dir = choice.dir;
    virtual.shape = choice.shape;
    ghost = { kind: def.kind, x, y, dir: choice.dir, shape: choice.shape, under: isUnderground(virtual) };
    if (def.priority) ghost.priority = virtual.priority = ui.smartPriority;
    if (def.filter) ghost.filters = emptyFilters();
  } else if (def.tunnel) {
    ok = canPlace(type, x, y);
    ghost = { kind: 'tunnel', x, y, dir: ui.dir, end: def.tunnel };
  } else if (def.kind === 'belt') {
    ok = canPlace(type, x, y);
    ghost = { kind: type, x, y, dir: ui.dir, arms: ok ? beltArms(virtual, virtual) : [ui.dir, opposite(ui.dir)] };
  } else {
    ok = canPlace(type, x, y);
    ghost = { kind: 'machine', building: { ...virtual, anim: time * 4, working: false } };
  }
  const affected = ok ? reshapedNeighbors([virtual]) : new Map();
  return { ghosts: [ghost], affected, outlines: [{ x, y, w: def.w, h: def.h, color: ok ? P.lime : P.red }] };
}

/**
 * Chemin de tapis en train d'être tracé : un fantôme par case où il sera posé
 * (raccordé aux autres cases du chemin), un cadre rouge là où il ne peut pas l'être.
 */
function beltPlanPreview() {
  const { type, cells } = ui.beltPlan;
  const def = BUILDINGS[type];
  const virtuals = [], outlines = [];
  for (const { x, y, dir } of cells) {
    if (canPlace(type, x, y)) virtuals.push({ type, kind: def.kind, x, y, w: 1, h: 1, dir });
    else outlines.push({ x, y, w: 1, h: 1, color: P.red });
  }
  const ghosts = virtuals.map((v) => ({ kind: type, x: v.x, y: v.y, dir: v.dir, arms: beltArms(v, virtuals) }));
  return { ghosts, outlines, affected: reshapedNeighbors(virtuals) };
}

/** Tapis autour de bâtiments pas encore posés dont la forme changerait une fois posés (sur leurs couches). */
function reshapedNeighbors(virtuals) {
  const changes = new Map();
  for (const virtual of virtuals) {
    for (const layer of layersOf(virtual.type)) {
      for (let cy = virtual.y; cy < virtual.y + virtual.h; cy++) {
        for (let cx = virtual.x; cx < virtual.x + virtual.w; cx++) {
          for (const [dx, dy] of DIRS) {
            const neighbor = buildingAt(cx + dx, cy + dy, layer);
            if (neighbor?.kind !== 'belt' || isTunnel(neighbor) || changes.has(neighbor)) continue;
            const now = beltArms(neighbor), after = beltArms(neighbor, virtuals);
            if (!sameSides(now, after)) changes.set(neighbor, after);
          }
        }
      }
    }
  }
  return changes;
}

const sameSides = (a, b) => a.length === b.length && a.every((side) => b.includes(side));

/**
 * Ce que montre la sélection (voir input/selection.js) :
 *   highlighted : bâtiments sélectionnés (ou en train de l'être), teintés en entier
 *   fills       : zones colorées en transparence { x, y, w, h (en cases), color, alpha }
 *   outlines    : cadres { x, y, w, h, color }
 *   ghosts      : aperçus du groupe qui suit le curseur (même format que dans cursorPreview)
 */
export function selectionOverlay(cell, time) {
  const fills = [], outlines = [], ghosts = [];
  const highlighted = highlightedBuildings();

  const area = selectBoxArea();
  if (area) {
    fills.push({ ...area, color: P.cyan, alpha: 0.1 });
    outlines.push({ ...area, color: P.cyan });
  }

  if (ui.placing && cell) {
    const { x0, y0, spots, ok } = placementAt(cell);
    const virtuals = spots.map(({ part, x, y }) => ({
      type: part.type, kind: part.kind, x, y, w: part.w, h: part.h, dir: part.dir, shape: part.shape, priority: part.priority,
      filters: part.filters,
    }));
    for (const v of virtuals) ghosts.push(groupGhost(v, virtuals, time));
    for (const { part, x, y, ok: fits } of spots) if (!fits) fills.push({ x, y, w: part.w, h: part.h, color: P.red, alpha: 0.5 });
    outlines.push({ x: x0, y: y0, w: ui.placing.w, h: ui.placing.h, color: ok ? P.lime : P.red });
  }
  return { highlighted, fills, outlines, ghosts };
}

/** Aperçu d'une pièce du groupe ; les tapis se raccordent aux autres pièces du groupe. */
function groupGhost(v, group, time) {
  const tunnel = BUILDINGS[v.type].tunnel;
  if (tunnel) return { kind: 'tunnel', x: v.x, y: v.y, dir: v.dir, end: tunnel };
  if (v.kind === 'belt') return { kind: v.type, x: v.x, y: v.y, dir: v.dir, arms: beltArms(v, group) };
  if (v.kind === 'splitter' || v.kind === 'merger') {
    return {
      kind: v.kind, x: v.x, y: v.y, dir: v.dir, shape: v.shape,
      priority: v.priority ?? undefined, filters: v.filters ?? undefined, under: isUnderground(v),
    };
  }
  return { kind: 'machine', building: { ...v, anim: time * 4, working: false } };
}
