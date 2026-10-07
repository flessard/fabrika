// Rendu PixiJS : la carte graphique dessine des sprites (WebGPU si disponible, sinon WebGL).
//
// Le pixel art est toujours dessiné par le code de render/sprites/, mais une seule fois
// par image d'animation : chaque résultat devient une texture gardée en mémoire.
// À chaque image du jeu, on ne fait que placer des sprites qui réutilisent ces textures.
//
// Calques, du fond vers l'avant :
//   terrain → eau et grille → tapis → items → machines → effets → curseur
import { Application, CanvasSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { MACHINE_OUTPUT_SLOTS, MAP_PADDING, TILE } from '../config.js';
import { PALETTE as P } from '../data/palette.js';
import { game, ui, view } from '../state.js';
import { beltArms } from '../sim/belt.js';
import { makeCanvas } from './pen.js';
import { bakeTerrain } from './terrainImage.js';
import { cameraOrigin, carriedItemPosition, cursorPreview, isVisible, visibleCells, waterSparkles } from './scene.js';
import { beltFrame, drawBelt, drawSplitter } from './sprites/belts.js';
import { ITEM_SIZE, itemSprite } from './sprites/items.js';
import { animationState, drawMachineBody } from './sprites/machines.js';

/** Marge autour des textures de machines, pour l'ombre et la goulotte qui dépassent. */
const MACHINE_MARGIN = 4;

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
  const machines = new SpritePool();
  const effects = new Graphics();        // barres de progression, fumée, étincelles
  const icons = new SpritePool();
  const ghost = new Sprite();
  const cursor = new Graphics();

  world.addChild(
    terrain, overlay, belts.layer, itemShadows.layer, items.layer,
    machines.layer, effects, icons.layer, ghost, cursor,
  );

  const shadowTexture = textures.get('item-shadow', ITEM_SIZE, 6, (ctx) => {
    ctx.fillStyle = P.black;
    ctx.fillRect(0, 0, ITEM_SIZE, 6);
  });

  // ---------- Textures fabriquées à la demande ----------
  const beltTexture = (dir, arms, frame) =>
    textures.get(`belt|${dir}|${[...arms].sort().join('')}|${frame}`, TILE, TILE, () => drawBelt(0, 0, dir, arms, frame));

  const splitterTexture = (dir, shape, frame) =>
    textures.get(`splitter|${dir}|${shape}|${frame}`, TILE, TILE, () => drawSplitter(0, 0, dir, shape, frame));

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
    const blocked = b.outputs.length >= MACHINE_OUTPUT_SLOTS;
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
    ghost.visible = false;
    if (!preview) return;

    const { ghost: g, outline } = preview;
    if (g) {
      if (g.kind === 'belt') setGhost(beltTexture(g.dir, g.arms, beltFrame(time)), g.x * TILE, g.y * TILE);
      else if (g.kind === 'splitter') setGhost(splitterTexture(g.dir, g.shape, beltFrame(time)), g.x * TILE, g.y * TILE);
      else {
        const b = g.building;
        setGhost(machineTexture(b, animationState(b, time), false), b.x * TILE - MACHINE_MARGIN, b.y * TILE - MACHINE_MARGIN);
      }
    }
    cursor
      .rect(outline.x * TILE + 0.5, outline.y * TILE + 0.5, outline.w * TILE - 1, outline.h * TILE - 1)
      .stroke({ width: 1, color: outline.color });
  }

  function setGhost(texture, x, y) {
    ghost.texture = texture;
    ghost.position.set(x, y);
    ghost.alpha = 0.6;
    ghost.visible = true;
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
      for (const pool of [belts, itemShadows, items, machines, icons]) pool.begin();
      effects.clear();

      const visible = game.buildings.filter((b) => isVisible(b, ox, oy));
      for (const b of visible) {
        if (b.kind === 'belt') belts.next(beltTexture(b.dir, beltArms(b), frame), b.x * TILE, b.y * TILE);
        else if (b.kind === 'splitter') belts.next(splitterTexture(b.dir, b.shape, frame), b.x * TILE, b.y * TILE);
        else continue;
        if (b.item) {
          const [px, py] = carriedItemPosition(b);
          const sx = Math.round(px - 3), sy = Math.round(py - 3);
          itemShadows.next(shadowTexture, sx + 1, sy + 2, 0.3);
          items.next(itemTexture(b.item.type), sx, sy - 1);
        }
      }

      // Les machines du haut d'abord, pour que celles du bas passent devant.
      const sorted = visible.filter((b) => b.kind !== 'belt' && b.kind !== 'splitter').sort((a, b) => a.y - b.y);
      for (const b of sorted) {
        machines.next(machineTexture(b, animationState(b, time), true), b.x * TILE - MACHINE_MARGIN, b.y * TILE - MACHINE_MARGIN);
        if (b.kind === 'hub') {
          if (b.flash > 0) effects.rect(b.x * TILE + 17, b.y * TILE + 8, 14, 12).fill({ color: P.yellow, alpha: (b.flash / 0.3) * 0.8 });
        } else {
          drawProgressBars(b, time);
        }
      }

      drawParticles();
      for (const pool of [belts, itemShadows, items, machines, icons]) pool.end();
      drawCursor(cursorPreview(ui.hover, time), time);

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
