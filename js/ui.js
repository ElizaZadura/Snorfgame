/* ── ui.js ── whispers, lore cards, status panel, intro ──────────── */
(function () {
  const $ = id => document.getElementById(id);

  /* ── whispers: snorf's voice, one at a time, unhurried ── */
  const whisperEl = $('whisper');
  let whisperQueue = [], whisperBusy = false, lastWhisper = '';

  function whisper(text, priority) {
    if (!text || text === lastWhisper) return;
    if (priority) whisperQueue.unshift(text); else whisperQueue.push(text);
    if (whisperQueue.length > 3) whisperQueue.length = 3;
    pump();
  }

  function pump() {
    if (whisperBusy || whisperQueue.length === 0) return;
    whisperBusy = true;
    const text = whisperQueue.shift();
    lastWhisper = text;
    whisperEl.textContent = text;
    whisperEl.classList.add('on');
    SNORF.audio.whispered();
    setTimeout(() => {
      whisperEl.classList.remove('on');
      setTimeout(() => { whisperBusy = false; pump(); }, 1600);
    }, 4200);
  }

  function whisperFrom(pool, priority) {
    const arr = SNORF.WHISPERS[pool];
    whisper(arr[Math.floor(Math.random() * arr.length)], priority);
  }

  /* ── lore card with typewriter reveal ── */
  const lore = $('lore'), loreTitle = $('lore-title'), loreBody = $('lore-body'),
        loreGlyph = $('lore-glyph'), loreFoot = $('lore-foot');
  let typeTimer = null, openedNode = null;

  function openLore(node, region) {
    openedNode = node;
    lore.hidden = false;
    lore.style.borderLeftColor = region ? region.hex : '#5fe3c8';
    loreGlyph.textContent = node.glyph || '◌';
    loreTitle.textContent = node.title;
    loreFoot.textContent = region
      ? region.name.toLowerCase() + ' · ' + region.sub
      : 'unindexed';

    // typewriter: reveal plain text, then swap in markup (for *em* and links)
    const raw = node.text.replace(/<[^>]+>/g, '').replace(/\*/g, '');
    const html = node.text
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
    clearInterval(typeTimer);
    let i = 0;
    loreBody.textContent = '';
    typeTimer = setInterval(() => {
      i += 2 + Math.floor(Math.random() * 3);
      if (i >= raw.length) {
        clearInterval(typeTimer);
        loreBody.innerHTML = html;
      } else {
        loreBody.textContent = raw.slice(0, i);
      }
    }, 16);
  }

  function closeLore() {
    if (lore.hidden) return;
    lore.hidden = true;
    clearInterval(typeTimer);
    // threads refuse to die
    if (openedNode && openedNode._thread) {
      whisper(SNORF.WHISPERS.threadClosed);
      openedNode._ember = true;
    }
    openedNode = null;
  }

  $('lore-close').addEventListener('click', closeLore);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLore(); });

  /* ── status panel ── */
  const stShift = $('st-shift'), stDrined = $('st-drined'), stStab = $('st-stab');
  let shiftAt = null;

  function markShift() { shiftAt = performance.now(); }

  setInterval(() => {
    if (shiftAt === null) return;
    const s = Math.round((performance.now() - shiftAt) / 1000);
    stShift.textContent =
      s < 4 ? 'just now' :
      s < 60 ? s + 's ago' :
      Math.floor(s / 60) + 'm ago';
  }, 1000);

  function setDrined(n, marginFound) {
    stDrined.textContent = n + ' / 8' + (marginFound ? ' + margin' : '');
  }

  function setStability(text) { stStab.textContent = text; }

  /* ── audio toggle ── */
  const audioBtn = $('audio-toggle');
  function syncAudioBtn() {
    audioBtn.textContent = SNORF.audio.on ? '♪ on' : '♪ off';
    audioBtn.classList.toggle('on', SNORF.audio.on);
  }
  audioBtn.addEventListener('click', () => {
    SNORF.audio.setOn(!SNORF.audio.on);
    syncAudioBtn();
  });

  /* ── intro ── */
  const intro = $('intro');
  function dismissIntro(withSound) {
    if (withSound) { SNORF.audio.setOn(true); syncAudioBtn(); }
    intro.classList.add('gone');
    setTimeout(() => intro.remove(), 2400);
    SNORF.world && SNORF.world.begin();
    setTimeout(() => { $('hints').style.opacity = 0; }, 14000);
  }
  $('enter').addEventListener('click', () => dismissIntro(false));
  $('enter-sound').addEventListener('click', () => dismissIntro(true));

  SNORF.ui = {
    whisper, whisperFrom, openLore, closeLore,
    markShift, setDrined, setStability,
    get loreOpen() { return !lore.hidden; },
  };
})();
