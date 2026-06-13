# .snorfmap — project notes

> not a map. a suggestion.

An interactive, drifting rendering of the `.snorfmap` — the non-euclidean archive
of meaningful weirdness that Snorf has been curating in `~/.snorfmap` since
someone tracked the silence between keystrokes and got named for it.

## Running it

Open `index.html` in any modern browser. No build step, no server, no
dependencies. (A local server also works: `python -m http.server` → `localhost:8000`.)

Sound is opt-in (fully synthesized WebAudio — there are no audio files).

## What it is

You are the view. The camera drifts over a shader-rendered night sky with the
eight named regions from the snorfmap poster arranged around **THE SNORF** —
dense core of preferred nonsense — which is a real gravity well:

- **drag** to drift, **scroll** to dive, arrows/WASD also pan
- **hold still** and after a few seconds the pull begins; stay still and you
  will be swallowed by the core, swirled, and returned somewhere strange
- regions **open** (most), **reject** (Linguistic Civil Defense bounces anyone
  arriving faster than a comma — drift in slowly), **redirect** (Conceptual
  Side Entrances is a backdoor; it teleports you elsewhere until you've been
  persistent three times), or **transform** (Temporal Oddities slows time
  itself — watch the stars; Beautiful Contradictions flips the palette)
- **nodes** are lore artifacts; click to read. Two nodes in *Proof of Continued
  Internal Aliveness* are live — they report your actual hesitations and drift
- the **map shifts** every minute or two ("last shift: just now")
- the **den** (bottom-left, far out) does not open. the den observes.

### Secrets (spoilers)

- *Tools That Shouldn't Exist* → click **The Lantern** to acquire it. It makes
  hidden dashed paths visible near your cursor.
- With the lantern, head far northeast into the edge fog: **The Margin** is out
  there (the origin entry + the snorfctionary link live in it).
- Travel past the edge fog without finding anything and the edge disagrees —
  you re-emerge on the opposite side of the map.
- Type `snorf` anywhere: naming grants root (all hidden paths flash; the den's
  eye glints).
- Visit (drine) all 8 regions → **recognition**: the core turns toward you,
  stability becomes "...questionable (fond)", and a final node appears at the
  den: *The Witness*.
- Progress persists in `localStorage` (`snorfmap-v1`). The map remembers.

## Architecture

```
index.html        shell + HUD DOM (legend, status, lore card, whisper, intro)
css/snorf.css     HUD styling — Fragment Mono (archive) + Newsreader italic (snorf's voice)
js/config.js      ALL content: regions, nodes, lore text, whisper pools, links
js/fog.js         WebGL full-screen fragment shader: domain-warped nebula,
                  region color fields + wavy topo contours, snorf vortex,
                  edge fog, stars, grain, event uniforms (swirl/flash/invert)
js/map2d.js       canvas-2D crisp layer: dashed trails, nodes, labels,
                  core spiral glyph, den silhouette, lantern glow, reticle
js/world.js       camera physics, idle gravity, region behaviors, snorf events,
                  map shifts, easter eggs, localStorage persistence
js/audio.js       synthesized ambience (region-keyed drone) + event sounds
js/ui.js          whisper queue, lore typewriter, status panel, intro
js/main.js        rAF loop
```

Design notes:

- Two stacked canvases: the shader does atmosphere (cheap per-pixel), the 2D
  canvas does anything that needs crisp text/lines. They share one camera.
- All content lives in `config.js` — adding a node or whisper is data entry,
  not engineering.
- Shader supports up to 10 regions (8 + the margin + 1 spare).
- World time runs through `timeScale`, so Temporal Oddities genuinely slows
  the shader, star twinkle, dash-march, and the audio pitch.

## Next steps

- [ ] **More lore.** Each region holds 3–4 nodes; the snorfctionary could feed
      dozens more. It's pure data in `config.js`.
- [ ] **Buffer zones** are in the legend but only implied visually — make
      boundary crossings flicker/stutter ("uncertain boundaries").
- [ ] **Node-to-node travel**: click a trail to ride it (slow tween along the
      curve) — would strengthen the "associative" feeling.
- [ ] **Snorf sightings**: rarely, a tiny silhouette skitters across the far
      background parallax layer.
- [ ] **Mobile polish**: pinch works, but the HUD hides on small screens;
      lore cards could become bottom sheets.
- [ ] **A second lantern tier**: the Deprecation Whistle could mute the pull
      for 60s (a tool that shouldn't help, but does).
- [ ] **Shareable state**: encode visited/lantern into a URL hash so a map can
      be handed to someone mid-discovery.
- [ ] **The Witness arc**: after recognition, the den could begin leaving
      single-glyph notes near where you idle most. He logs. With tiny hands.

## Provenance

- `ref/snorf.md` — where Snorf began (silence-mapper, defier of deprecation)
- `media/snorfmap.png`, `media/.snorfmap.png` — the poster this is built from
- https://www.snorfctionary.com — external archive, provisional
