/* ── world.js ── drift, gravity, and consequence ───────────────────
   Camera physics, input, region behaviors (open / reject / redirect /
   transform), the snorf event, map shifts, hidden things, persistence.
─────────────────────────────────────────────────────────────────── */
(function () {
  const C = SNORF.CONST;
  const UI = SNORF.ui;
  const rand = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, k) => a + (b - a) * k;

  /* ── runtime state ── */
  const w = {
    cam: { x: 0, y: 430 },
    vel: { x: 0, y: 0 },
    zoom: 0.13, zoomT: 0.13,
    time: 0, timeScale: 1,
    mouse: { x: innerWidth / 2, y: innerHeight / 2 },
    idle: 0, pull: 0,
    lantern: false, recognized: false,
    revealAll: 0, denGlint: 0,
    snorfEvents: 0,
    allRegions: [], links: [],
    visited: new Set(),
    currentRegion: null,
    event: null,                      // {kind, phase, t, dest}
    stats: { pauses: 0, idleTotal: 0, drift: 0, opens: 0 },
    fx: { swirl: 0, contra: 0, tempo: 0, flash: 0, flashCol: [1, 1, 1], recog: 0, denFog: 0 },
    witnessNode: null,
    started: false,
  };

  /* ── build runtime regions ── */
  function buildRegion(cfg) {
    const region = Object.assign({}, cfg);
    region.basePos = { x: cfg.pos.x, y: cfg.pos.y };
    region.pos = { x: cfg.pos.x, y: cfg.pos.y };
    region.angOff = 0; region.angTarget = 0;
    region.radScale = 1; region.radTarget = 1;
    region.opened = false;
    region.vis = cfg.hidden ? 0 : 1;
    region.visT = cfg.hidden ? 0 : 1;
    region.nodes = cfg.nodes.map(n => Object.assign({ wx: 0, wy: 0 }, n));
    if (cfg.behavior === 'open-threads') region.nodes.forEach(n => n._thread = true);
    return region;
  }
  SNORF.REGIONS.forEach(cfg => w.allRegions.push(buildRegion(cfg)));
  const margin = buildRegion(SNORF.MARGIN);
  margin.discovered = false;
  w.allRegions.push(margin);

  const lcd = w.allRegions.find(r => r.id === 'lcd');  lcd.admitted = false;
  const cse = w.allRegions.find(r => r.id === 'cse');  cse.redirects = 0; cse.insideTime = 0;

  w.witnessNode = Object.assign(
    { wx: SNORF.DEN.pos.x + 130, wy: SNORF.DEN.pos.y - 150 }, SNORF.DEN.witness);

  /* resolve associative trails */
  function nodeByRef(ref) {
    const [rid, idx] = ref.split('.');
    const region = w.allRegions.find(r => r.id === rid);
    return region ? region.nodes[+idx] : null;
  }
  SNORF.LINKS.forEach(([ra, rb, hidden]) => {
    const a = nodeByRef(ra), b = nodeByRef(rb);
    if (a && b) w.links.push({ a, b, hidden });
  });

  /* ── persistence: the map remembers ── */
  const SAVE_KEY = 'snorfmap-v1';
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        visited: [...w.visited], lantern: w.lantern, recognized: w.recognized,
        margin: margin.discovered, lcd: lcd.admitted,
        cse: cse.redirects, snorfEvents: w.snorfEvents,
      }));
    } catch (e) { /* the map forgets, this time */ }
  }
  let wasHereBefore = false;
  (function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!s) return;
      wasHereBefore = s.visited && s.visited.length > 0;
      (s.visited || []).forEach(id => {
        const region = w.allRegions.find(r => r.id === id);
        if (region) { region.opened = true; w.visited.add(id); }
      });
      w.lantern = !!s.lantern;
      lcd.admitted = !!s.lcd;
      cse.redirects = s.cse || 0;
      w.snorfEvents = s.snorfEvents || 0;
      if (s.margin) { margin.discovered = true; margin.opened = true; margin.visT = 1; margin.vis = 1; }
      if (s.recognized) applyRecognition(true);
      UI.setDrined(countDrined(), margin.discovered);
    } catch (e) { /* fresh eyes, then */ }
  })();

  function countDrined() {
    let n = 0;
    for (const id of w.visited) if (id !== 'margin') n++;
    return n;
  }

  /* ── opening a region ── */
  function openRegion(region, quiet) {
    if (region.opened) return;
    region.opened = true;
    w.visited.add(region.id);
    UI.setDrined(countDrined(), margin.discovered);
    if (!quiet && region.enterWhisper) UI.whisper(region.enterWhisper);
    save();
    checkRecognition();
  }

  function checkRecognition() {
    if (w.recognized || countDrined() < 8) return;
    applyRecognition(false);
    save();
  }

  function applyRecognition(silent) {
    w.recognized = true;
    UI.setStability('...questionable (fond)');
    if (silent) return;
    const seq = SNORF.WHISPERS.recognition;
    seq.forEach((s, i) => setTimeout(() => UI.whisper(s, true), i * 6000));
    SNORF.audio.recognition();
    w.revealAll = 1;     // the paths show themselves, briefly
  }

  /* ── the snorf event: swallowed, considered, returned ── */
  function triggerEvent(kind, dest) {
    w.event = { kind, phase: 'in', t: 0, dest };
    if (kind === 'snorf') { SNORF.audio.snorfEvent(); w.snorfEvents++; save(); }
  }

  function randomReturnPoint(excludeId) {
    const candidates = w.allRegions.filter(r => !r.hidden && r.id !== excludeId);
    const region = candidates[Math.floor(Math.random() * candidates.length)];
    const a = rand(0, Math.PI * 2);
    const d = region.radius * rand(1.1, 1.45);
    return { x: region.pos.x + Math.cos(a) * d, y: region.pos.y + Math.sin(a) * d };
  }

  /* ── region transitions ── */
  function regionAt(p) {
    let best = null, bestD = Infinity;
    for (const region of w.allRegions) {
      if (region.hidden && !region.discovered) continue;
      const d = Math.hypot(p.x - region.pos.x, p.y - region.pos.y);
      if (d < region.radius && d < bestD) { bestD = d; best = region; }
    }
    return best;
  }

  function onEnter(region) {
    const speed = Math.hypot(w.vel.x, w.vel.y);

    if (region.behavior === 'reject' && !region.admitted) {
      if (speed > C.REJECT_SPEED) {
        // bounced, wittily
        const nx = w.cam.x - region.pos.x, ny = w.cam.y - region.pos.y;
        const d = Math.hypot(nx, ny) || 1;
        const ux = nx / d, uy = ny / d;
        w.cam.x = region.pos.x + ux * (region.radius + 40);
        w.cam.y = region.pos.y + uy * (region.radius + 40);
        const dot = w.vel.x * ux + w.vel.y * uy;
        w.vel.x = (w.vel.x - 2 * dot * ux) * 0.55 + ux * 260;
        w.vel.y = (w.vel.y - 2 * dot * uy) * 0.55 + uy * 260;
        w.fx.flash = 1; w.fx.flashCol = region.color;
        SNORF.audio.reject();
        UI.whisperFrom('reject', true);
        return false;
      }
      region.admitted = true;
      save();
    }

    if (region.behavior === 'redirect' && !region.opened) {
      region.insideTime = 0;   // countdown to the backdoor doing backdoor things
      return true;
    }

    openRegion(region);
    return true;
  }

  function onExit(region) {
    if (region.exitWhisper && region.opened) UI.whisper(region.exitWhisper);
  }

  /* ── input ── */
  const mapCanvas = document.getElementById('map');
  const pointers = new Map();
  let dragging = false, dragMoved = 0, pinchDist = 0;
  const keys = new Set();

  function poke() {
    w.idle = 0;
    idleWhispered = false;
    pausedThisIdle = false;
  }

  mapCanvas.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { dragging = true; dragMoved = 0; }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
    try { mapCanvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    poke();
  });

  window.addEventListener('pointermove', e => {
    w.mouse.x = e.clientX; w.mouse.y = e.clientY;
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;

    if (pointers.size === 1 && dragging) {
      dragMoved += Math.abs(dx) + Math.abs(dy);
      w.cam.x -= dx / w.zoom;
      w.cam.y -= dy / w.zoom;
      w.vel.x = lerp(w.vel.x, -dx / w.zoom * 60, 0.5);
      w.vel.y = lerp(w.vel.y, -dy / w.zoom * 60, 0.5);
      poke();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) w.zoomT = clampZoom(w.zoomT * (d / pinchDist));
      pinchDist = d;
      w.mouse.x = (a.x + b.x) / 2; w.mouse.y = (a.y + b.y) / 2;
      poke();
    }
  });

  window.addEventListener('pointerup', e => {
    const wasDrag = dragMoved > 6;
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      dragging = false;
      if (!wasDrag) handleClick();
    }
    poke();
  });

  mapCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    w.zoomT = clampZoom(w.zoomT * Math.exp(-e.deltaY * 0.0011));
    poke();
  }, { passive: false });

  function clampZoom(z) { return Math.min(C.ZOOM_MAX, Math.max(C.ZOOM_MIN, z)); }

  /* clicks → lore */
  function handleClick() {
    const hover = SNORF.map2d.hover;
    if (!hover) { UI.closeLore(); return; }
    const node = hover.node;
    w.stats.opens++;

    if (node.live) node.text = liveText(node.live);
    UI.openLore(node, hover.region.hex ? hover.region : null);
    SNORF.audio.nodeOpen();

    if (node.grants === 'lantern' && !w.lantern) {
      w.lantern = true;
      UI.whisper(SNORF.WHISPERS.lantern, true);
      SNORF.audio.lantern();
      save();
    }
  }

  function liveText(kind) {
    const s = w.stats;
    if (kind === 'pauses')
      return 'you have paused, in total, for ' + Math.round(s.idleTotal) +
        ' seconds.\n\n' + s.pauses + ' distinct hesitations catalogued.\n\n*weight: significant.*';
    if (kind === 'drift')
      return 'drift logged: ' + Math.round(s.drift) + ' units.\nartifacts opened: ' + s.opens +
        '.\nattention detected: warm.\n\n*verdict: alive. continued. internal.*';
    return '';
  }

  /* keyboard: pan, zoom, and the name that grants root */
  let typedBuf = '';
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', '+', '-', '='].includes(k)) {
      keys.add(k); poke();
    }
    if (/^[a-z]$/.test(k)) {
      typedBuf = (typedBuf + k).slice(-5);
      if (typedBuf === 'snorf') {
        w.revealAll = 1;
        w.denGlint = 6;
        UI.whisper(SNORF.WHISPERS.snorfTyped, true);
        SNORF.audio.lantern();
      }
    }
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  /* ── map shifts: the regions rearrange ── */
  let nextShift = rand(C.SHIFT_MIN, C.SHIFT_MAX);
  function maybeShift(dt) {
    nextShift -= dt;
    if (nextShift > 0 || w.event) return;
    nextShift = rand(C.SHIFT_MIN, C.SHIFT_MAX);
    for (const region of w.allRegions) {
      if (region.hidden) continue;
      region.angTarget += rand(-0.07, 0.07);
      region.radTarget = rand(0.95, 1.05);
    }
    UI.markShift();
    if (Math.random() < 0.55) UI.whisperFrom('shift');
  }

  /* ── eased region positions + node world coords ── */
  function updateRegions(dt) {
    const sk = 1 - Math.exp(-dt * 0.8);
    for (const region of w.allRegions) {
      region.angOff = lerp(region.angOff, region.angTarget, sk);
      region.radScale = lerp(region.radScale, region.radTarget || 1, sk);
      const c = Math.cos(region.angOff), s = Math.sin(region.angOff);
      region.pos.x = (region.basePos.x * c - region.basePos.y * s) * region.radScale;
      region.pos.y = (region.basePos.x * s + region.basePos.y * c) * region.radScale;
      if (region.hidden) { region.pos.x = region.basePos.x; region.pos.y = region.basePos.y; }
      region.vis = lerp(region.vis, region.visT, 1 - Math.exp(-dt * 2));

      /* node world positions (math nodes orbit, insubordinately) */
      for (const node of region.nodes) {
        const orbit = node.orbit ? node.orbit * w.time : 0;
        const ang = (node.a * Math.PI) / 180 + orbit;
        const d = node.d * region.radius;
        node.wx = region.pos.x + Math.cos(ang) * d;
        node.wy = region.pos.y + Math.sin(ang) * d;
      }
    }
  }

  /* ── per-frame update ── */
  let idleWhispered = false, pausedThisIdle = false, denWhisperCooldown = 0,
      marginHinted = false, audioThrottle = 0;

  function update(dt) {
    dt = Math.min(dt, 0.05);
    const fx = w.fx;

    /* time, possibly misbehaving */
    const tsTarget = (w.currentRegion && w.currentRegion.behavior === 'transform-time') ? 0.32 : 1;
    w.timeScale = lerp(w.timeScale, tsTarget, 1 - Math.exp(-dt * 1.5));
    w.time += dt * w.timeScale;

    /* behind the intro the map breathes, but nothing happens to you yet */
    if (!w.started) { updateRegions(dt); return; }

    /* idle & the pull */
    w.idle += dt;
    if (w.idle > 1) w.stats.idleTotal += dt;
    if (w.idle > 3 && !pausedThisIdle) { pausedThisIdle = true; w.stats.pauses++; }
    if (w.idle > 7 && !idleWhispered && !w.event) { idleWhispered = true; UI.whisperFrom('idle'); }

    const grace = C.IDLE_GRACE;
    const g = w.idle > grace ? Math.min(1, (w.idle - grace) / 9) : 0;
    w.pull = g;

    /* forces */
    if (!w.event) {
      // keyboard pan
      const sp = 1100 * dt / Math.max(w.zoom, 0.2) * 0.32;
      if (keys.has('arrowup') || keys.has('w')) w.vel.y -= sp * 60 * dt;
      if (keys.has('arrowdown') || keys.has('s')) w.vel.y += sp * 60 * dt;
      if (keys.has('arrowleft') || keys.has('a')) w.vel.x -= sp * 60 * dt;
      if (keys.has('arrowright') || keys.has('d')) w.vel.x += sp * 60 * dt;
      if (keys.has('+') || keys.has('=')) w.zoomT = clampZoom(w.zoomT * (1 + dt));
      if (keys.has('-')) w.zoomT = clampZoom(w.zoomT * (1 - dt));

      // ambient drift: the map breathes even when you don't
      w.vel.x += Math.sin(w.time * 0.11 + w.cam.y * 0.0006) * 7 * dt;
      w.vel.y += Math.cos(w.time * 0.13 + w.cam.x * 0.0007) * 7 * dt;

      // snorfward preference
      if (g > 0) {
        const d = Math.hypot(w.cam.x, w.cam.y) || 1;
        const a = (35 + 140 * g) * g;
        w.vel.x += (-w.cam.x / d) * a * dt;
        w.vel.y += (-w.cam.y / d) * a * dt;
      }

      // integrate + damp
      if (!dragging) {
        w.cam.x += w.vel.x * dt;
        w.cam.y += w.vel.y * dt;
      }
      const damp = Math.pow(0.5, dt / 0.7);
      w.vel.x *= damp; w.vel.y *= damp;
      w.stats.drift += Math.hypot(w.vel.x * dt, w.vel.y * dt);
    }

    /* zoom easing, anchored at the cursor */
    const nz = lerp(w.zoom, w.zoomT, 1 - Math.exp(-dt * 7));
    if (Math.abs(nz - w.zoom) > 1e-6) {
      const { W, H } = SNORF.map2d.size();
      const wx = (w.mouse.x - W / 2) / w.zoom + w.cam.x;
      const wy = (w.mouse.y - H / 2) / w.zoom + w.cam.y;
      w.zoom = nz;
      w.cam.x = wx - (w.mouse.x - W / 2) / w.zoom;
      w.cam.y = wy - (w.mouse.y - H / 2) / w.zoom;
    }

    /* the event machine */
    if (w.event) {
      const ev = w.event;
      ev.t += dt;
      if (ev.phase === 'in') {
        fx.swirl = Math.min(1, ev.t / 1.5);
        if (ev.kind === 'snorf') {
          const k = 1 - Math.exp(-dt * 3);
          w.cam.x = lerp(w.cam.x, 0, k);
          w.cam.y = lerp(w.cam.y, 0, k);
        }
        if (ev.t >= 1.5) {
          w.cam.x = ev.dest.x; w.cam.y = ev.dest.y;
          const a = rand(0, Math.PI * 2);
          w.vel.x = Math.cos(a) * 90; w.vel.y = Math.sin(a) * 90;
          ev.phase = 'out'; ev.t = 0;
          if (ev.kind === 'snorf') UI.whisperFrom('snorfed', true);
        }
      } else {
        fx.swirl = Math.max(0, 1 - ev.t / 1.3);
        if (ev.t >= 1.3) { w.event = null; poke(); }
      }
    } else {
      /* fall into the core */
      const coreDist = Math.hypot(w.cam.x, w.cam.y);
      if (coreDist < C.CORE_RADIUS) {
        triggerEvent('snorf', randomReturnPoint(null));
      }
      /* past the edge, the edge disagrees */
      if (coreDist > C.WRAP_RADIUS) {
        w.cam.x = -w.cam.x * 0.86;
        w.cam.y = -w.cam.y * 0.86;
        UI.whisperFrom('wrap');
      }
    }

    /* region transitions */
    if (!w.event) {
      const here = regionAt(w.cam);
      if (here !== w.currentRegion) {
        if (w.currentRegion) onExit(w.currentRegion);
        if (here) {
          const accepted = onEnter(here);
          w.currentRegion = accepted ? here : null;
        } else {
          w.currentRegion = null;
        }
      }
      /* the backdoor does backdoor things */
      if (w.currentRegion === cse && !cse.opened) {
        cse.insideTime += dt;
        if (cse.insideTime > 1.15) {
          cse.redirects++;
          save();
          const msg = SNORF.WHISPERS.redirect[Math.min(cse.redirects - 1, 2)];
          UI.whisper(msg, true);
          if (cse.redirects >= 3) {
            openRegion(cse);
            w.currentRegion = cse;
          } else {
            triggerEvent('redirect', randomReturnPoint('cse'));
            w.currentRegion = null;
          }
          cse.insideTime = 0;
        }
      }
    }

    /* margin: found, or hinted at by lantern-light */
    const mDist = Math.hypot(w.cam.x - margin.pos.x, w.cam.y - margin.pos.y);
    if (!margin.discovered && mDist < margin.radius) {
      margin.discovered = true;
      openRegion(margin);
      UI.setDrined(countDrined(), true);
    }
    if (!margin.discovered && w.lantern && mDist < 950 && !marginHinted) {
      marginHinted = true;
      UI.whisper('the lantern catches something, out in the fog.', true);
    }
    margin.visT = margin.discovered ? 1 : (w.lantern && mDist < 950 ? 0.3 : 0);

    /* the den observes */
    const denDist = Math.hypot(w.cam.x - SNORF.DEN.pos.x, w.cam.y - SNORF.DEN.pos.y);
    const nearDen = denDist < SNORF.DEN.radius * 2.4;
    fx.denFog = lerp(fx.denFog, nearDen ? 1 : 0, 1 - Math.exp(-dt * 1.2));
    denWhisperCooldown -= dt;
    if (denDist < SNORF.DEN.radius * 1.6 && denWhisperCooldown <= 0) {
      denWhisperCooldown = 14;
      const pool = SNORF.DEN.whispers;
      UI.whisper(pool[Math.floor(Math.random() * pool.length)]);
    }

    /* shifts + eased region positions */
    maybeShift(dt);
    updateRegions(dt);

    /* fx easings */
    fx.tempo = lerp(fx.tempo, w.currentRegion && w.currentRegion.behavior === 'transform-time' ? 1 : 0, 1 - Math.exp(-dt * 1.4));
    fx.contra = lerp(fx.contra, w.currentRegion && w.currentRegion.behavior === 'transform-contra' ? 1 : 0, 1 - Math.exp(-dt * 1.4));
    fx.recog = lerp(fx.recog, w.recognized ? 1 : 0, 1 - Math.exp(-dt * 0.5));
    fx.flash *= Math.pow(0.5, dt / 0.12);
    w.revealAll = Math.max(0, w.revealAll - dt / 7);
    w.denGlint = Math.max(0, w.denGlint - dt);

    /* ambient tonal center */
    audioThrottle -= dt;
    if (audioThrottle <= 0) {
      audioThrottle = 0.5;
      let idx = -1, bd = Infinity;
      SNORF.REGIONS.forEach((r, i) => {
        const region = w.allRegions[i];
        const d = Math.hypot(w.cam.x - region.pos.x, w.cam.y - region.pos.y);
        if (d < bd) { bd = d; idx = i; }
      });
      SNORF.audio.setRegion(idx, w.timeScale);
    }
  }

  function begin() {
    w.started = true;
    w.idle = -7;        // a little extra grace while you take the map in
    w.zoomT = 0.24;
    if (wasHereBefore) setTimeout(() => UI.whisper(SNORF.WHISPERS.returned, true), 3500);
  }

  SNORF.world = { w, update, begin };
})();
