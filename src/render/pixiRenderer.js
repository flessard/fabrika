// Rendu PixiJS : la carte graphique dessine des sprites (WebGPU si disponible, sinon WebGL).
//
// Le pixel art est toujours dessiné par le code de render/sprites/, mais une seule fois
// par image d'animation : chaque résultat devient une texture gardée en mémoire.
// À chaque image du jeu, on ne fait que placer des sprites qui réutilisent ces textures.
//
// Calques, du fond vers l'avant :
//   terrain → eau et grille → tapis → items → machines → effets
//   → (vue du sous-sol : voile sombre, tapis souterrains et tunnels, leurs items) → curseur
import { Application, CanvasSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { MAP_PADDING, TILE } from '../config.js';
import { BUILDINGS, isUnderground, outputCapacity } from '../data/buildings.js';
import { PALETTE as P } from '../data/palette.js';
import { game, ui, view } from '../state.js';
import { beltArms } from '../sim/belt.js';
import { isConveyor } from '../sim/transfer.js';
import { makeCanvas } from './pen.js';
import { bakeTerrain } from './terrainImage.js';
import { bakeFog } from './fogImage.js';
import { fogVersion } from '../world/fog.js';
import { cameraOrigin, carriedItemPosition, conveyorFrame, machinePorts, selectionOutline, selectionOverlay, cursorPreview, isVisible, visibleCells, waterSparkles } from './scene.js';
import {
  beltColors, beltFrame, drawBelt, drawFilter, drawMerger, drawMergerBase, drawMergerLid, drawSmartSplitter, drawSplitter, filterKey,
  drawTunnel, drawTunnelBase, drawTunnelLid, drawUnderBelt,
} from './sprites/belts.js';
import { ITEM_SIZE, itemSprite } from './sprites/items.js';
import { animationState, drawMachineBody } from './sprites/machines.js';
import { HIGHLIGHT_MARGIN, groupOutline, highlightFrame, selectionHighlight } from './sprites/highlight.js';
import { DOCK_SIZE, PORT_SIZE, drawDock, drawPort } from './sprites/ports.js';

/** Marge autour des textures de machines, pour l'ombre et la goulotte qui dépassent. */
const MACHINE_MARGIN = 4;
/** Pixels de l'image du brouillard par case : le grain de sa bordure tramée. */
const FOG_PIXELS_PER_CELL = 4;

export async function createPixiRenderer(canvas) {
  const app = new Application();
  await app.init({
    canvas,
    width: Math.max(1, view.width),
    height: Math.max(1, view.height),
    background: P.black,
    antialias: false,
    roundPixels: true,
    resolution: 1,
    autoDensity: false, // le zoom est géré par le CSS du canevas (voir input/camera.js)
    autoStart: false,   // c'est notre boucle (main.js) qui demande chaque image
    preference: 'webgpu',
  });

  const textures = createTextureCache();

  // ---------- Calques ----------
  const world = new Container();
  app.stage.addChild(world);

  const terrain = new Sprite();
  terrain.position.set(-MAP_PADDING, -MAP_PADDING);
  const overlay = new Graphics();        // reflets de l'eau, grille
  const belts = new SpritePool();
  const itemShadows = new SpritePool();
  const items = new SpritePool();
  const lids = new SpritePool();         // couvercles des groupeurs, par-dessus les items
  const machines = new SpritePool();
  const ports = new SpritePool();        // flèches d'entrée et de sortie des machines
  const effects = new Graphics();        // barres de progression, fumée, étincelles
  const icons = new SpritePool();
  const underShade = new Graphics();     // voile sombre sur la surface, en vue du sous-sol
  const underBelts = new SpritePool();
  const underItems = new SpritePool();
  const underLids = new SpritePool();    // portails des tunnels, par-dessus les items
  const fog = new Sprite();              // brouillard : ce qui reste à découvrir
  fog.scale.set(TILE / FOG_PIXELS_PER_CELL);
  let fogDrawn = -1;
  const highlights = new SpritePool();   // bâtiments sélectionnés, teintés de cyan
  const highlightOutline = new Sprite(); // contour du groupe sélectionné
  let highlightOutlineKey = null;
  const ghosts = new SpritePool();       // aperçus transparents sous le curseur
  const cursor = new Graphics();

  world.addChild(
    terrain, overlay, belts.layer, itemShadows.layer, items.layer, lids.layer,
    machines.layer, ports.layer, effects, icons.layer,
    underShade, underBelts.layer, underItems.layer, underLids.layer, fog, highlights.layer, highlightOutline, ghosts.layer, cursor,
  );

  const shadowTexture = textures.get('item-shadow', ITEM_SIZE, 6, (ctx) => {
    ctx.fillStyle = P.black;
    ctx.fillRect(0, 0, ITEM_SIZE, 6);
  });

  // ---------- Textures fabriquées à la demande ----------
  const beltTexture = (dir, arms, frame) =>
    textures.get(`belt|${dir}|${[...arms].sort().join('')}|${frame}`, TILE, TILE, () => drawBelt(0, 0, dir, arms, frame));

  // `under` : version souterraine (rails couleur terre).
  const splitterTexture = (dir, shape, frame, under = false) =>
    textures.get(`splitter|${dir}|${shape}|${frame}|${under}`, TILE, TILE, () => drawSplitter(0, 0, dir, shape, frame, beltColors(under)));

  const smartSplitterTexture = (dir, shape, priority, frame, under = false) =>
    textures.get(`smart|${dir}|${shape}|${priority.join('')}|${frame}|${under}`, TILE, TILE,
      () => drawSmartSplitter(0, 0, dir, shape, priority, frame, beltColors(under)));

  const filterTexture = (dir, shape, filters, frame, under = false) =>
    textures.get(`filter|${dir}|${shape}|${filterKey(filters)}|${frame}|${under}`, TILE, TILE,
      () => drawFilter(0, 0, dir, shape, filters, frame, beltColors(under)));

  const mergerTexture = (dir, shape, frame, under = false) =>
    textures.get(`merger|${dir}|${shape}|${frame}|${under}`, TILE, TILE, () => drawMergerBase(0, 0, dir, shape, frame, beltColors(under)));

  const mergerLidTexture = (dir, shape) =>
    textures.get(`merger-lid|${dir}|${shape}`, TILE, TILE, () => drawMergerLid(0, 0, dir, shape));

  const mergerGhostTexture = (dir, shape, frame, under = false) =>
    textures.get(`merger-ghost|${dir}|${shape}|${frame}|${under}`, TILE, TILE, () => drawMerger(0, 0, dir, shape, frame, beltColors(under)));

  const underBeltTexture = (dir, arms, frame) =>
    textures.get(`under|${dir}|${[...arms].sort().join('')}|${frame}`, TILE, TILE, () => drawUnderBelt(0, 0, dir, arms, frame));

  const tunnelBaseTexture = (dir, frame) =>
    textures.get(`tunnel|${dir}|${frame}`, TILE, TILE, () => drawTunnelBase(0, 0, dir, frame));

  const tunnelLidTexture = (dir, end) =>
    textures.get(`tunnel-lid|${dir}|${end}`, TILE, TILE, () => drawTunnelLid(0, 0, dir, end));

  const tunnelGhostTexture = (dir, end, frame) =>
    textures.get(`tunnel-ghost|${dir}|${end}|${frame}`, TILE, TILE, () => drawTunnel(0, 0, dir, end, frame));

  const portTexture = (dir, kind) =>
    textures.get(`port|${dir}|${kind}`, PORT_SIZE, PORT_SIZE, () => drawPort(0, 0, dir, kind));

  const dockTexture = (dir, kind) =>
    textures.get(`dock|${dir}|${kind}`, DOCK_SIZE, DOCK_SIZE, () => drawDock(0, 0, dir, kind));

  const itemTexture = (type) => textures.get(`item|${type}`, ITEM_SIZE, ITEM_SIZE, (ctx) => ctx.drawImage(itemSprite(type), 0, 0));

  const machineTexture = (b, state, shadow) => {
    const key = `machine|${b.type}|${b.dir}|${shadow ? 1 : 0}|${Object.values(state).join(',')}`;
    const m = MACHINE_MARGIN;
    return textures.get(key, b.w * TILE + m * 2, b.h * TILE + m * 2, () => drawMachineBody(b, state, m, m, { shadow }));
  };

  // ---------- Morceaux de l'image ----------
  function drawOverlay(cells, time) {
    overlay.clear();
    for (const [x, y] of waterSparkles(cells, time)) overlay.rect(x, y, 2, 1);
    overlay.fill(P.white);

    if (ui.tool === 'hand') return;
    const { x0, y0, x1, y1 } = cells;
    for (let x = x0; x <= x1 + 1; x++) overlay.rect(x * TILE, y0 * TILE, 1, (y1 - y0 + 1) * TILE);
    for (let y = y0; y <= y1 + 1; y++) overlay.rect(x0 * TILE, y * TILE, (x1 - x0 + 1) * TILE, 1);
    overlay.fill({ color: P.black, alpha: 0.12 });
  }

  function drawProgressBars(b, time) {
    const blocked = b.outputs.length >= outputCapacity(b);
    const busy = b.kind === 'drill' ? b.working : !!b.current;
    if (!busy && !blocked) return;

    const w = b.w * TILE - 8, x = b.x * TILE + 4, y = b.y * TILE - 5;
    effects.rect(x - 1, y - 1, w + 2, 5).fill(P.black);
    effects.rect(x, y, w, 3).fill(P.night);
    if (blocked && !busy) {
      if (Math.floor(time * 3) % 2) effects.rect(x, y, w, 3).fill(P.amber);
      return;
    }
    const filled = Math.round(w * Math.min(1, b.progress));
    if (filled > 0) {
      effects.rect(x, y, filled, 3).fill(P.lime);
      effects.rect(x, y, filled, 1).fill(P.glint);
    }
  }

  function drawParticles() {
    for (const p of game.particles) {
      const fade = 1 - p.life / p.max;
      const x = Math.round(p.x), y = Math.round(p.y);
      if (p.kind === 'smoke') {
        const size = 1 + Math.floor(p.life * 3);
        effects.rect(x - size, y - size, size * 2, size * 2).fill({ color: p.life < 0.4 ? P.mist : P.silver, alpha: fade * 0.7 });
      } else if (p.kind === 'spark') {
        effects.rect(x, y, 1, 1).fill({ color: p.color, alpha: fade });
      } else if (p.kind === 'icon') {
        icons.next(itemTexture(p.itemType), x - 3, y - 3, Math.min(1, fade * 2));
      }
    }
  }

  function drawCursor(preview, time) {
    cursor.clear();
    ghosts.begin();
    const selected = selectionOutline();
    if (selected) strokeOutline(selected);

    const group = selectionOverlay(ui.hover, time);
    highlights.begin();
    const shine = highlightFrame(time), pulse = 0.8 + 0.2 * Math.sin(time * 5);
    for (const b of group.highlighted) {
      const { key, canvas } = selectionHighlight(b, shine);
      const texture = textures.get(key, canvas.width, canvas.height, (ctx) => ctx.drawImage(canvas, 0, 0));
      highlights.next(texture, b.x * TILE - HIGHLIGHT_MARGIN, b.y * TILE - HIGHLIGHT_MARGIN, pulse);
    }
    highlights.end();
    drawGroupOutline(groupOutline(group.highlighted), pulse);
    for (const f of group.fills) cursor.rect(f.x * TILE, f.y * TILE, f.w * TILE, f.h * TILE).fill({ color: f.color, alpha: f.alpha });
    for (const g of group.ghosts) drawGhost(g, time);
    for (const outline of group.outlines) strokeOutline(outline);

    if (preview) {
      for (const g of preview.ghosts ?? []) drawGhost(g, time);
      for (const outline of preview.outlines) strokeOutline(outline);
    }
    ghosts.end();
  }

  /** Le contour change avec le groupe : sa texture est remplacée, l'ancienne libérée. */
  function drawGroupOutline(outline, alpha) {
    highlightOutline.visible = !!outline;
    if (!outline) return;
    if (outline.key !== highlightOutlineKey) {
      const old = highlightOutline.texture;
      highlightOutline.texture = textures.fromCanvas(outline.canvas);
      if (highlightOutlineKey !== null) old.destroy(true);
      highlightOutlineKey = outline.key;
    }
    highlightOutline.position.set(outline.x, outline.y);
    highlightOutline.alpha = alpha;
  }

  function drawGhost(g, time) {
    const frame = beltFrame(time);
    if (g.kind === 'belt') ghosts.next(beltTexture(g.dir, g.arms, frame), g.x * TILE, g.y * TILE, 0.6);
    else if (g.kind === 'underBelt') ghosts.next(underBeltTexture(g.dir, g.arms, frame), g.x * TILE, g.y * TILE, 0.6);
    else if (g.kind === 'tunnel') ghosts.next(tunnelGhostTexture(g.dir, g.end, frame), g.x * TILE, g.y * TILE, 0.6);
    else if (g.kind === 'splitter' && g.filters) ghosts.next(filterTexture(g.dir, g.shape, g.filters, frame, g.under), g.x * TILE, g.y * TILE, 0.6);
    else if (g.kind === 'splitter' && g.priority) ghosts.next(smartSplitterTexture(g.dir, g.shape, g.priority, frame, g.under), g.x * TILE, g.y * TILE, 0.6);
    else if (g.kind === 'splitter') ghosts.next(splitterTexture(g.dir, g.shape, frame, g.under), g.x * TILE, g.y * TILE, 0.6);
    else if (g.kind === 'merger') ghosts.next(mergerGhostTexture(g.dir, g.shape, frame, g.under), g.x * TILE, g.y * TILE, 0.6);
    else {
      const b = g.building;
      ghosts.next(machineTexture(b, animationState(b, time), false), b.x * TILE - MACHINE_MARGIN, b.y * TILE - MACHINE_MARGIN, 0.6);
    }
  }

  function strokeOutline(outline) {
    cursor
      .rect(outline.x * TILE + 0.5, outline.y * TILE + 0.5, outline.w * TILE - 1, outline.h * TILE - 1)
      .stroke({ width: 1, color: outline.color });
  }

  // ---------- Interface commune avec le rendu Canvas 2D ----------
  return {
    name: app.renderer.name === 'webgpu' ? 'PixiJS · WebGPU' : `PixiJS · ${app.renderer.name === 'webgl' ? 'WebGL' : app.renderer.name}`,

    resize(width, height) {
      app.renderer.resize(width, height);
    },

    rebuildTerrain() {
      const old = terrain.texture;
      terrain.texture = textures.fromCanvas(bakeTerrain(game.map, game.seed));
      if (old && old !== Texture.EMPTY) old.destroy(true);
    },

    render(time) {
      const { ox, oy } = cameraOrigin();
      world.position.set(-ox, -oy);
      const frame = beltFrame(time);
      const cells = visibleCells(ox, oy);

      drawOverlay(cells, time);
      const allPools = [belts, itemShadows, items, lids, machines, ports, icons, underBelts, underItems, underLids];
      for (const pool of allPools) pool.begin();
      effects.clear();
      underShade.clear();

      // Aperçu calculé d'abord : il peut changer la forme des tapis voisins.
      const preview = cursorPreview(ui.hover, time);
      const armsOf = (b) => preview?.affected?.get(b) ?? beltArms(b);

      /** Tapis, splitter, groupeur ou tunnel, avec l'item qu'il porte, dans les calques donnés. */
      const drawConveyor = (b, pools) => {
        const x = b.x * TILE, y = b.y * TILE, f = conveyorFrame(b, frame);
        const end = BUILDINGS[b.type].tunnel, under = isUnderground(b);
        if (end) {
          pools.base.next(tunnelBaseTexture(b.dir, f), x, y);
          pools.lids.next(tunnelLidTexture(b.dir, end), x, y);
        } else if (b.type === 'underBelt') pools.base.next(underBeltTexture(b.dir, armsOf(b), f), x, y);
        else if (b.kind === 'belt') pools.base.next(beltTexture(b.dir, armsOf(b), f), x, y);
        else if (b.kind === 'splitter' && b.filters) pools.base.next(filterTexture(b.dir, b.shape, b.filters, f, under), x, y);
        else if (b.kind === 'splitter' && b.priority) pools.base.next(smartSplitterTexture(b.dir, b.shape, b.priority, f, under), x, y);
        else if (b.kind === 'splitter') pools.base.next(splitterTexture(b.dir, b.shape, f, under), x, y);
        else {
          pools.base.next(mergerTexture(b.dir, b.shape, f, under), x, y);
          pools.lids.next(mergerLidTexture(b.dir, b.shape), x, y);
        }
        if (b.item) {
          const [px, py] = carriedItemPosition(b);
          const sx = Math.round(px - 3), sy = Math.round(py - 3);
          pools.shadows?.next(shadowTexture, sx + 1, sy + 2, 0.3);
          pools.items.next(itemTexture(b.item.type), sx, sy - 1);
        }
      };

      // Tapis, splitters et groupeurs souterrains : seulement en vue du sous-sol.
      // Les tunnels sont aux deux étages.
      const underView = ui.layer === 'under';
      const below = [];
      const visible = game.buildings.filter((b) => isVisible(b, ox, oy));
      for (const b of visible) {
        if (!isConveyor(b)) continue;
        if (isUnderground(b)) {
          if (underView) below.push(b);
          continue;
        }
        drawConveyor(b, { base: belts, shadows: itemShadows, items, lids });
        if (underView && BUILDINGS[b.type].tunnel) below.push(b);
      }

      // Les machines du haut d'abord, pour que celles du bas passent devant.
      const sorted = visible.filter((b) => !isConveyor(b)).sort((a, b) => a.y - b.y);
      for (const b of sorted) {
        machines.next(machineTexture(b, animationState(b, time), true), b.x * TILE - MACHINE_MARGIN, b.y * TILE - MACHINE_MARGIN);
        if (b.kind === 'hub') {
          if (b.flash > 0) effects.rect(b.x * TILE + 17, b.y * TILE + 8, 14, 12).fill({ color: P.yellow, alpha: (b.flash / 0.3) * 0.8 });
        } else if (b.kind !== 'storage') {
          drawProgressBars(b, time);
        }
      }

      for (const p of machinePorts(sorted)) {
        if (p.connected) ports.next(dockTexture(p.dir, p.kind), p.x - DOCK_SIZE / 2, p.y - DOCK_SIZE / 2);
        else ports.next(portTexture(p.dir, p.kind), p.x - PORT_SIZE / 2, p.y - PORT_SIZE / 2, p.faint ? 0.6 : 1);
      }

      drawParticles();

      if (underView) {
        underShade.rect(ox, oy, view.width, view.height).fill({ color: P.soot, alpha: 0.8 });
        for (const b of below) drawConveyor(b, { base: underBelts, items: underItems, lids: underLids });
      }

      for (const pool of allPools) pool.end();
      // Le brouillard n'est redessiné que quand la zone découverte change.
      if (fogDrawn !== fogVersion) {
        const old = fog.texture;
        fog.texture = textures.fromCanvas(bakeFog(FOG_PIXELS_PER_CELL));
        if (fogDrawn !== -1 && old !== Texture.EMPTY) old.destroy(true);
        fogDrawn = fogVersion;
      }
      drawCursor(preview, time);

      app.renderer.render(app.stage);
    },
  };
}

/** Textures fabriquées à partir de canevas dessinés par le code, gardées par clé. */
function createTextureCache() {
  const cache = new Map();
  const fromCanvas = (canvas) => new Texture({ source: new CanvasSource({ resource: canvas, scaleMode: 'nearest' }) });
  return {
    fromCanvas,
    get(key, width, height, draw) {
      let texture = cache.get(key);
      if (!texture) {
        texture = fromCanvas(makeCanvas(width, height, draw));
        cache.set(key, texture);
      }
      return texture;
    },
  };
}

/**
 * Réserve de sprites réutilisés d'une image à l'autre (au lieu d'en créer et d'en
 * détruire des centaines à chaque image). begin() → next()… → end() cache le surplus.
 */
class SpritePool {
  constructor() {
    this.layer = new Container();
    this.sprites = [];
    this.used = 0;
  }

  begin() {
    this.used = 0;
  }

  next(texture, x, y, alpha = 1) {
    let sprite = this.sprites[this.used];
    if (!sprite) {
      sprite = new Sprite();
      this.sprites.push(sprite);
      this.layer.addChild(sprite);
    }
    sprite.texture = texture;
    sprite.position.set(x, y);
    sprite.alpha = alpha;
    sprite.visible = true;
    this.used++;
    return sprite;
  }

  end() {
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i].visible = false;
  }
}
