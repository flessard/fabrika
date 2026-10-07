// Palette d'outils en bas de l'écran.
import { RIGHT, turnRight } from '../core/grid.js';
import { TOOLS } from '../data/buildings.js';
import { PALETTE as P } from '../data/palette.js';
import { ui } from '../state.js';
import { currentCtx, makeCanvas, rect } from '../render/pen.js';
import { drawBelt, drawSplitter } from '../render/sprites/belts.js';
import { machineSprite } from '../render/sprites/machines.js';

let gameCanvas = null;

/** Icônes 32 × 32 de la palette. */
const ICONS = {
  hand: () => {
    // Flèches dans les 4 directions
    rect(15, 6, 2, 20, P.cream);
    rect(6, 15, 20, 2, P.cream);
    for (let i = 0; i < 4; i++) {
      rect(15 - i, 6 + i, 2 + i * 2, 1, P.cream);
      rect(15 - i, 25 - i, 2 + i * 2, 1, P.cream);
      rect(6 + i, 15 - i, 1, 2 + i * 2, P.cream);
      rect(25 - i, 15 - i, 1, 2 + i * 2, P.cream);
    }
  },
  erase: () => {
    for (let i = 0; i < 10; i++) {
      rect(6 + i, 18 - i, 8, 1, P.black);
      rect(7 + i, 17 - i, 6, 1, i < 4 ? P.salmon : P.mist);
    }
    rect(6, 24, 20, 1, P.steel);
  },
  rotate: () => {
    for (let a = 0; a < 5.2; a += 0.12) rect(Math.round(16 + Math.cos(a) * 9), Math.round(16 + Math.sin(a) * 9), 2, 2, P.cream);
    rect(23, 8, 5, 2, P.cream);
    rect(26, 8, 2, 5, P.cream);
  },
  belt: () => scaled2(() => drawBelt(0, 0, RIGHT, [RIGHT, 2], 0)),
  splitter: () => scaled2(() => drawSplitter(0, 0, RIGHT, 'T', 0)),
};

/** Dessine un sprite de 16 px agrandi ×2 pour remplir l'icône. */
function scaled2(draw) {
  const ctx = currentCtx();
  ctx.save();
  ctx.scale(2, 2);
  draw();
  ctx.restore();
}

const iconFor = (id) => makeCanvas(32, 32, (ctx) => (ICONS[id] ? ICONS[id]() : ctx.drawImage(machineSprite(id), 0, 0)));

function toolButton({ id, label, key, onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tool';
  button.id = `tool-${id}`;
  const kbd = document.createElement('kbd');
  kbd.textContent = key;
  const name = document.createElement('span');
  name.textContent = label;
  button.append(kbd, iconFor(id), name);
  button.addEventListener('click', onClick);
  return button;
}

const separator = () => Object.assign(document.createElement('div'), { className: 'sep' });

export function buildToolbar(canvas) {
  gameCanvas = canvas;
  const bar = document.getElementById('bar');

  TOOLS.forEach((tool, i) => {
    if (tool.separatorBefore) bar.append(separator());
    const button = toolButton({ id: tool.id, label: tool.name, key: i + 1, onClick: () => setTool(tool.id) });
    button.dataset.tool = tool.id;
    bar.append(button);
  });

  bar.append(separator());
  bar.append(toolButton({ id: 'rotate', label: 'Tourner', key: 'R', onClick: () => { ui.dir = turnRight(ui.dir); } }));
}

export function setTool(id) {
  ui.tool = id;
  for (const button of document.querySelectorAll('.tool[data-tool]')) {
    button.setAttribute('aria-pressed', String(button.dataset.tool === id));
  }
  gameCanvas.classList.toggle('build', id !== 'hand');
}

export const selectToolByNumber = (n) => { if (n >= 1 && n <= TOOLS.length) setTool(TOOLS[n - 1].id); };
