/* ── map2d.js ── the crisp layer ───────────────────────────────────
   Canvas-2D drawing over the shader sky: associative trails, nodes,
   region labels, the core glyph, the den, the you-reticle.
   Everything is projected to screen space for crispness.
─────────────────────────────────────────────────────────────────── */
(function () {
  const canvas = document.getElementById('map');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const MONO = "'Fragment Mono', monospace";
  let hover = null;   // { node, region, sx, sy }

  function project(w, wx, wy) {
    return [(wx - w.cam.x) * w.zoom + W / 2, (wy - w.cam.y) * w.zoom + H / 2];
  }

  function lanternNear(w, sx, sy) {
    if (!w.lantern) return 0;
    const d = Math.hypot(w.mouse.x - sx, w.mouse.y - sy);
    return Math.max(0, 1 - d / 280);
  }

  /* wrap long region names into balanced lines */
  const lineCache = {};
  function nameLines(name) {
    if (lineCache[name]) return lineCache[name];
    const words = name.split(' ');
    const lines = [];
    let cur = '';
    for (const word of words) {
      if ((cur + ' ' + word).trim().length > 14 && cur) { lines.push(cur); cur = word; }
      else cur = (cur + ' ' + word).trim();
    }
    if (cur) lines.push(cur);
    return (lineCache[name] = lines);
  }

  function spacedText(text, x, y, size, color, alpha, spacing) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.font = size + 'px ' + MONO;
    if ('letterSpacing' in ctx) ctx.letterSpacing = (spacing || 2.5) + 'px';
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawLink(w, t, a, b, hiddenLink) {
    const [ax, ay] = project(w, a.wx, a.wy);
    const [bx, by] = project(w, b.wx, b.wy);
    if (Math.max(ax, bx) < -80 || Math.min(ax, bx) > W + 80 ||
        Math.max(ay, by) < -80 || Math.min(ay, by) > H + 80) return;

    let alpha = 0.16;
    let color = 'rgba(160,180,215,1)';
    if (hiddenLink) {
      const ln = Math.max(lanternNear(w, ax, ay), lanternNear(w, bx, by),
                          lanternNear(w, (ax + bx) / 2, (ay + by) / 2));
      const reveal = Math.max(ln, w.revealAll, w.recognized ? 0.5 : 0);
      if (reveal <= 0.02) return;
      alpha = 0.45 * reveal;
      color = 'rgba(255,220,150,1)';
    }
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 7]);
    ctx.lineDashOffset = -t * 26;
    // a soft arc, not a ruler line — associations curve
    const mx = (ax + bx) / 2 + (ay - by) * 0.14;
    const my = (ay + by) / 2 + (bx - ax) * 0.14;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.stroke();
    ctx.restore();
  }

  function drawNode(w, t, node, region) {
    const [sx, sy] = project(w, node.wx, node.wy);
    if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) return;

    const opened = region.opened;
    const baseA = opened ? 0.95 : 0.35;
    const isHover = opened && hover && hover.node === node;
    const r = isHover ? 6 : 4;

    ctx.save();
    // glow
    ctx.beginPath();
    ctx.arc(sx, sy, r * 3.2, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3.2);
    g.addColorStop(0, region.hex + (opened ? '55' : '22'));
    g.addColorStop(1, region.hex + '00');
    ctx.fillStyle = g;
    ctx.fill();
    // ring + dot
    ctx.globalAlpha = baseA;
    ctx.strokeStyle = region.hex;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, r + 2.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = isHover ? '#ffffff' : region.hex;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.6 + (opened ? Math.sin(t * 2 + node.wx) * 0.6 : 0), 0, Math.PI * 2);
    ctx.fill();
    // ember: threads that refuse to die
    if (node._ember) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3.2);
      ctx.fillStyle = '#ffb35c';
      ctx.beginPath();
      ctx.arc(sx + 9, sy - 9, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // label on hover or when zoomed close inside an opened region
    const labelA = isHover ? 1 : (opened && w.zoom > 0.55 ? 0.6 : 0);
    if (labelA > 0.01) {
      spacedText(node.title.toLowerCase(), sx, sy - 18, 10.5, '#dfe7f4', labelA, 1.5);
    }
  }

  function drawRegionLabel(w, region) {
    if (region.vis < 0.05) return;
    const [sx, sy] = project(w, region.pos.x, region.pos.y);
    const sr = region.radius * w.zoom;
    if (sx < -sr || sx > W + sr || sy < -sr || sy > H + sr) return;

    // labels read best mid-zoom; fade at extremes
    const zoomA = Math.min(1, Math.max(0, (w.zoom - 0.09) / 0.08))
                * Math.min(1, Math.max(0.25, 1.6 - w.zoom));
    const a = zoomA * region.vis;
    if (a <= 0.02) return;

    const size = Math.max(10, Math.min(17, sr * 0.085));
    const lines = nameLines(region.name);
    const lh = size * 1.5;
    const y0 = sy - ((lines.length - 1) * lh) / 2 - (region.opened ? lh * 0.4 : 0);
    lines.forEach((ln, i) => spacedText(ln, sx, y0 + i * lh, size, region.hex, a * 0.95, 3));
    spacedText(region.sub, sx, y0 + lines.length * lh, size * 0.62, '#9aa6bc', a * 0.8, 1.6);
    if (region.glyph) spacedText(region.glyph, sx, y0 - lh * 1.1, size * 1.1, region.hex, a * 0.7, 0);
  }

  function drawCore(w, t) {
    const [cx, cy] = project(w, 0, 0);
    if (cx < -300 || cx > W + 300 || cy < -300 || cy > H + 300) return;
    ctx.save();
    ctx.strokeStyle = '#5fe3c8';
    ctx.shadowColor = '#5fe3c8';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    const turns = 3.2;
    for (let s = 0; s <= 1; s += 0.01) {
      const th = s * turns * Math.PI * 2 + t * 0.35;
      const rr = (4 + s * 56) * w.zoom;
      const x = cx + Math.cos(th) * rr, y = cy + Math.sin(th) * rr;
      s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    const a = Math.min(1, Math.max(0, (w.zoom - 0.12) / 0.1));
    spacedText('THE SNORF', cx, cy + 95 * w.zoom + 16, 13, '#bfeee4', a * 0.95, 4);
    spacedText('dense core of preferred nonsense', cx, cy + 95 * w.zoom + 34, 8.5, '#7d8aa0', a * 0.8, 1.8);
  }

  function drawDen(w, t) {
    const den = SNORF.DEN;
    const [dx, dy] = project(w, den.pos.x, den.pos.y);
    if (dx < -400 || dx > W + 400 || dy < -400 || dy > H + 400) return;
    const s = w.zoom;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.scale(s, s);

    // lantern glow (flickering)
    const fl = 0.85 + 0.15 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
    const lg = ctx.createRadialGradient(95, 0, 4, 95, 0, 230 * fl);
    lg.addColorStop(0, 'rgba(255,205,120,0.5)');
    lg.addColorStop(0.4, 'rgba(255,180,90,0.13)');
    lg.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(-180, -260, 520, 520);

    // ground
    ctx.fillStyle = '#070a12';
    ctx.beginPath();
    ctx.ellipse(10, 62, 160, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    // the silhouette: a small archivist, watching
    ctx.fillStyle = '#0b0e16';
    ctx.beginPath(); ctx.ellipse(0, 8, 62, 48, -0.12, 0, Math.PI * 2); ctx.fill();   // body
    ctx.beginPath(); ctx.arc(48, -28, 33, 0, Math.PI * 2); ctx.fill();               // head
    ctx.beginPath(); ctx.arc(30, -56, 16, 0, Math.PI * 2); ctx.fill();               // ear
    ctx.beginPath(); ctx.arc(58, -54, 13, 0, Math.PI * 2); ctx.fill();               // ear
    ctx.beginPath(); ctx.ellipse(76, -18, 14, 9, 0.3, 0, Math.PI * 2); ctx.fill();   // snout
    ctx.beginPath();                                                                  // tail
    ctx.moveTo(-58, 22);
    ctx.quadraticCurveTo(-118, 30, -128, -16);
    ctx.quadraticCurveTo(-132, -36, -116, -40);
    ctx.quadraticCurveTo(-122, -22, -110, -10);
    ctx.quadraticCurveTo(-100, 16, -56, 12);
    ctx.fill();

    // lantern arm + lantern
    ctx.strokeStyle = '#0b0e16';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(66, 0); ctx.lineTo(92, -10); ctx.lineTo(95, -2); ctx.stroke();
    ctx.fillStyle = '#0b0e16';
    ctx.fillRect(88, -4, 15, 22);
    ctx.fillStyle = `rgba(255,215,130,${0.85 * fl})`;
    ctx.fillRect(91, 0, 9, 14);

    // eye — glints when summoned
    const glint = w.denGlint > 0 ? 0.55 + 0.45 * Math.sin(t * 12) : 0.25;
    ctx.fillStyle = `rgba(255,230,170,${glint})`;
    ctx.beginPath(); ctx.arc(58, -32, 2.4, 0, Math.PI * 2); ctx.fill();

    ctx.restore();

    const a = Math.min(0.8, Math.max(0, (w.zoom - 0.1) / 0.1));
    spacedText("snorf's den", dx, dy + 95 * s + 14, 10, '#8b96ab', a, 2.5);
    spacedText('curation origin (opaque)', dx, dy + 95 * s + 30, 8, '#5a6478', a * 0.8, 1.5);

    // the witness node, once recognized
    if (w.recognized) {
      const wn = w.witnessNode;
      drawNode(w, t, wn, { hex: '#ffd479', opened: true });
    }
  }

  function drawReticle(w, t) {
    ctx.save();
    ctx.strokeStyle = 'rgba(207,216,227,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 9, 0, Math.PI * 2);
    ctx.stroke();
    // when the pull has you, the reticle leans toward the core
    if (w.pull > 0.02) {
      const [cx, cy] = project(w, 0, 0);
      const dx = cx - W / 2, dy = cy - H / 2;
      const d = Math.hypot(dx, dy) || 1;
      ctx.strokeStyle = `rgba(95,227,200,${0.35 * w.pull})`;
      ctx.setLineDash([2, 6]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath();
      ctx.moveTo(W / 2 + (dx / d) * 14, H / 2 + (dy / d) * 14);
      ctx.lineTo(W / 2 + (dx / d) * Math.min(64, d), H / 2 + (dy / d) * Math.min(64, d));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLanternCursor(w, t) {
    if (!w.lantern) return;
    const { x, y } = w.mouse;
    const g = ctx.createRadialGradient(x, y, 2, x, y, 130);
    g.addColorStop(0, 'rgba(255,210,130,0.10)');
    g.addColorStop(1, 'rgba(255,210,130,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 130, y - 130, 260, 260);
  }

  /* ── hover detection (screen space) ── */
  function findHover(w) {
    hover = null;
    if (SNORF.ui.loreOpen) { /* still allow re-hover */ }
    let best = 18;
    const consider = (node, region) => {
      const [sx, sy] = project(w, node.wx, node.wy);
      const d = Math.hypot(w.mouse.x - sx, w.mouse.y - sy);
      if (d < best) { best = d; hover = { node, region, sx, sy }; }
    };
    for (const region of w.allRegions) {
      if (!region.opened) continue;
      for (const node of region.nodes) consider(node, region);
    }
    if (w.recognized) consider(w.witnessNode, { hex: '#ffd479', opened: true, name: "SNORF'S DEN", sub: 'curation origin (opaque)' });
    canvas.style.cursor = hover ? 'pointer' : '';
  }

  /* ── main draw ── */
  function render(w) {
    ctx.clearRect(0, 0, W, H);
    const t = w.time;

    findHover(w);

    // trails
    for (const link of w.links) drawLink(w, t, link.a, link.b, link.hidden);

    // region labels
    for (const region of w.allRegions) drawRegionLabel(w, region);

    // nodes
    for (const region of w.allRegions) {
      if (region.vis < 0.05) continue;
      for (const node of region.nodes) drawNode(w, t, node, region);
    }

    drawCore(w, t);
    drawDen(w, t);
    drawLanternCursor(w, t);
    drawReticle(w, t);
  }

  SNORF.map2d = {
    render, resize,
    get hover() { return hover; },
    project: (w, x, y) => project(w, x, y),
    size: () => ({ W, H }),
  };
})();
