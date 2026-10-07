// Petit compteur sous la mini-carte : rendu utilisé, images par seconde,
// et temps passé à dessiner chaque image (moyenne sur une demi-seconde).

export function createPerfMeter(rendererName) {
  const el = document.getElementById('perf');
  let frames = 0, seconds = 0, renderMs = 0;

  return {
    record(dt, ms, buildingCount) {
      frames++;
      seconds += dt;
      renderMs += ms;
      if (seconds < 0.5) return;
      const fps = Math.round(frames / seconds);
      const avg = (renderMs / frames).toFixed(1).replace('.', ',');
      el.textContent = `${rendererName} · ${fps} i/s · ${avg} ms · ${buildingCount} bât.`;
      frames = 0; seconds = 0; renderMs = 0;
    },
  };
}
