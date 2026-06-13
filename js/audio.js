/* ── audio.js ── the hum beneath the map ───────────────────────────
   Generated WebAudio ambience: a slow pad whose tonal center drifts
   with whichever region you're nearest, plus small event sounds.
   Entirely synthesized — no assets, opt-in only.
─────────────────────────────────────────────────────────────────── */
(function () {
  let ctx = null, master = null, oscA = null, oscB = null, sub = null,
      filt = null, lfo = null, enabled = false;

  // pentatonic-ish centers, one per region (index-matched to SNORF.REGIONS)
  const FREQS = [110, 123.47, 146.83, 164.81, 98, 130.81, 174.61, 220];
  let targetFreq = 110;

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 520;
    filt.Q.value = 0.6;
    filt.connect(master);

    const padGain = ctx.createGain();
    padGain.gain.value = 0.5;
    padGain.connect(filt);

    oscA = ctx.createOscillator(); oscA.type = 'sine';
    oscB = ctx.createOscillator(); oscB.type = 'triangle';
    sub  = ctx.createOscillator(); sub.type = 'sine';
    oscA.frequency.value = 110;
    oscB.frequency.value = 110 * 1.005;     // gentle beating
    sub.frequency.value = 55;
    oscA.connect(padGain); oscB.connect(padGain);
    const subGain = ctx.createGain(); subGain.gain.value = 0.35;
    sub.connect(subGain); subGain.connect(filt);

    // slow breathing
    lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.18;
    lfo.connect(lfoGain); lfoGain.connect(padGain.gain);

    oscA.start(); oscB.start(); sub.start(); lfo.start();
  }

  function setOn(on) {
    if (on && !ctx) build();
    if (!ctx) return;
    enabled = on;
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(on ? 0.10 : 0, ctx.currentTime + 1.5);
  }

  /* called per-frame-ish: glide tonal center toward nearest region */
  function setRegion(idx, timeScale) {
    if (!ctx || !enabled) return;
    const f = idx >= 0 && idx < FREQS.length ? FREQS[idx] : 110;
    if (f !== targetFreq) {
      targetFreq = f;
      const t = ctx.currentTime;
      oscA.frequency.linearRampToValueAtTime(f, t + 4);
      oscB.frequency.linearRampToValueAtTime(f * 1.005, t + 4);
      sub.frequency.linearRampToValueAtTime(f / 2, t + 4);
    }
    // temporal oddities drag the pitch down with time itself
    const det = 1 - (1 - timeScale) * 0.25;
    oscA.detune.setTargetAtTime((det - 1) * 1200, ctx.currentTime, 0.8);
  }

  function ping(freq, dur, vol, type) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  const api = {
    setOn, setRegion,
    get on() { return enabled; },
    nodeOpen()  { ping(523.25, 1.6, 0.16, 'sine'); ping(784, 2.2, 0.07, 'sine'); },
    reject()    { ping(82, 0.3, 0.22, 'square'); ping(740, 0.18, 0.06, 'sine'); },
    lantern()   { ping(659, 2.5, 0.12); ping(987, 3.2, 0.08); ping(1318, 3.8, 0.05); },
    whispered() { ping(1760, 0.8, 0.025); },
    snorfEvent() {
      if (!ctx || !enabled) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(440, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 1.6);   // the fall
      o.frequency.exponentialRampToValueAtTime(330, t + 3.0);  // the strange return
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.2, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 3.4);
    },
    recognition() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        setTimeout(() => ping(f, 4, 0.1), i * 700));
    },
  };

  SNORF.audio = api;
})();
