/* ── main.js ── the loop ───────────────────────────────────────────
   Wires world → fog shader + 2D layer. Pauses politely when hidden.
─────────────────────────────────────────────────────────────────── */
(function () {
  const world = SNORF.world;
  const w = world.w;
  let last = performance.now();
  let running = true;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!running) { last = now; return; }
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    world.update(dt);

    SNORF.fog.render({
      time: w.time,
      cam: w.cam,
      zoom: w.zoom,
      regions: w.allRegions,
      fx: w.fx,
    });
    SNORF.map2d.render(w);
  }

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    last = performance.now();
  });

  requestAnimationFrame(frame);
})();
