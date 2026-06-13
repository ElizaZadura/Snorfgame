/* ── fog.js ── the breathing sky ───────────────────────────────────
   Full-screen WebGL fragment shader: domain-warped nebula, region
   color fields with wavy topo contours, the Snorf vortex, edge fog,
   stars, grain. Driven per-frame by world state uniforms.
─────────────────────────────────────────────────────────────────── */
(function () {
  const VERT = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  const FRAG = `
    precision highp float;

    uniform vec2  u_res;
    uniform float u_time;
    uniform vec2  u_cam;
    uniform float u_zoom;

    uniform int   u_regCount;
    uniform vec2  u_regPos[10];
    uniform vec3  u_regCol[10];
    uniform float u_regRad[10];
    uniform float u_regVis[10];

    uniform float u_swirl;      // snorf event 0..1
    uniform float u_contra;     // contradiction palette flip 0..1
    uniform float u_tempo;      // temporal gold-shift 0..1
    uniform float u_flash;      // rejection flash 0..1
    uniform vec3  u_flashCol;
    uniform float u_recog;      // recognition glow 0..1
    uniform vec2  u_denPos;
    uniform float u_denFog;     // den proximity fog 0..1

    float hash(vec2 p) {
      p = fract(p * vec2(234.34, 435.345));
      p += dot(p, p + 34.23);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y);
    }

    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
      for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = rot * p * 2.03;
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec2 screen = gl_FragCoord.xy - 0.5 * u_res;

      // snorf-event swirl: the whole view rotates and drinks inward
      float sl = length(screen) / (0.4 * max(u_res.x, u_res.y));
      float sa = u_swirl * 5.0 * exp(-sl * 2.0);
      float cs = cos(sa), sn = sin(sa);
      screen = mat2(cs, -sn, sn, cs) * screen;
      screen *= 1.0 - u_swirl * 0.45;

      // screen → world (canvas y grows down)
      vec2 world = vec2(screen.x, -screen.y) / u_zoom + u_cam;

      float t = u_time * 0.05;

      // ── base nebula ──
      vec2 q = world * 0.0016;
      vec2 warp = vec2(fbm(q + t * 0.6), fbm(q + vec2(5.2, 1.3) - t * 0.5));
      float neb = fbm(q * 1.7 + warp * 1.3);
      vec3 col = vec3(0.012, 0.018, 0.042);
      col += vec3(0.045, 0.06, 0.115) * neb;
      col += vec3(0.02, 0.012, 0.05) * fbm(q * 3.1 - warp * 0.8 + t * 0.3);

      // ── stars (fixed in world, twinkle with world time) ──
      vec2 g = world * 0.055;
      vec2 id = floor(g);
      float rn = hash(id);
      vec2 sp = vec2(hash(id + 1.7), hash(id + 3.1));
      float sd = length(fract(g) - sp);
      float tw = 0.5 + 0.5 * sin(u_time * (0.8 + rn * 2.2) + rn * 60.0);
      float star = smoothstep(0.05, 0.0, sd) * step(0.84, rn) * tw;
      col += star * vec3(0.75, 0.82, 1.0) * 0.65;

      // ── region fields + topo contours ──
      for (int i = 0; i < 10; i++) {
        if (i >= u_regCount) break;
        vec2 d = world - u_regPos[i];
        float dist = length(d);
        float wob = (fbm(d * 0.0035 + float(i) * 3.7 + t * 0.4) - 0.5);
        float r = u_regRad[i] * (1.0 + wob * 0.6);
        float vis = u_regVis[i];
        if (vis <= 0.001) continue;

        float field = smoothstep(r * 1.35, r * 0.1, dist);
        vec3 rc = u_regCol[i];
        col += rc * field * (0.10 + 0.16 * fbm(world * 0.005 + rc.xy * 9.0 + t)) * vis;

        // wavy contour rings, drifting slowly outward
        float dw = dist + (fbm(world * 0.0028 + float(i) * 7.1) - 0.5) * 150.0;
        float rings = abs(fract(dw / (r * 0.21) - u_time * 0.012) - 0.5);
        float ring = smoothstep(0.055, 0.0, rings) * smoothstep(r * 1.7, r * 0.35, dist);
        col += rc * ring * 0.085 * vis;
      }

      // ── the Snorf: vortex, spiral arms, spectral eye ──
      float r0 = length(world) + 1.0;
      float th = atan(world.y, world.x);
      float core = smoothstep(750.0, 70.0, r0);
      col = mix(col, vec3(0.0, 0.006, 0.02), core * 0.85);

      float spiral = sin(th * 3.0 - log(r0) * 6.5 + u_time * 0.45);
      float arms = smoothstep(0.7, 1.0, spiral) * core;
      col += vec3(0.42, 0.95, 0.88) * arms * (0.18 + 0.45 * core) * (0.7 + 0.8 * u_recog);

      float coreRings = abs(fract(r0 / 95.0 + u_time * 0.02) - 0.5);
      col += vec3(0.3, 0.8, 0.75) * smoothstep(0.05, 0.0, coreRings)
             * smoothstep(900.0, 150.0, r0) * 0.08;

      float eye = smoothstep(95.0, 8.0, r0);
      col += vec3(0.65, 1.0, 0.93) * eye * (0.5 + 0.8 * u_recog);

      // ── edge fog ──
      float rad = length(world);
      float fog = smoothstep(1550.0, 2750.0, rad);
      float fogTex = fbm(world * 0.002 + t);
      col = mix(col, vec3(0.05, 0.065, 0.085) * (0.7 + 0.6 * fogTex), fog * 0.92);

      // den fog — opacity intentional
      float dden = length(world - u_denPos);
      col = mix(col, vec3(0.03, 0.04, 0.055) * (0.8 + 0.4 * fogTex), u_denFog * smoothstep(620.0, 90.0, dden) * 0.85);

      // ── transforms ──
      col = mix(col, col.brg * 1.18 + 0.015, u_contra * 0.85);            // contradictions
      float lum = dot(col, vec3(0.4, 0.5, 0.2));                          // temporal gold
      col = mix(col, vec3(lum) * vec3(1.25, 1.02, 0.6) + vec3(0.02, 0.012, 0.0), u_tempo * 0.65);

      // rejection flash
      col += u_flashCol * u_flash * 0.45 * (0.6 + 0.4 * sin(u_time * 28.0));

      // swirl whiteout at peak
      col += vec3(0.5, 0.95, 0.9) * u_swirl * u_swirl * 0.35;

      // ── vignette + grain ──
      vec2 vuv = gl_FragCoord.xy / u_res - 0.5;
      col *= 1.0 - dot(vuv, vuv) * 0.85;
      col += (hash(gl_FragCoord.xy + fract(u_time) * 100.0) - 0.5) * 0.035;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const canvas = document.getElementById('fog');
  const gl = canvas.getContext('webgl', { antialias: false, depth: false });

  let program = null, uni = {}, ok = false;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('snorf shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function init() {
    if (!gl) return;
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('snorf link:', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    ['u_res', 'u_time', 'u_cam', 'u_zoom', 'u_regCount', 'u_regPos', 'u_regCol',
     'u_regRad', 'u_regVis', 'u_swirl', 'u_contra', 'u_tempo', 'u_flash',
     'u_flashCol', 'u_recog', 'u_denPos', 'u_denFog']
      .forEach(n => uni[n] = gl.getUniformLocation(program, n));
    ok = true;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
  }

  /* state: { time, cam, zoom, regions:[{pos,color,radius,vis}], fx:{...} } */
  function render(st) {
    if (!ok) return;
    gl.useProgram(program);
    const dpr = canvas.width / innerWidth;

    gl.uniform2f(uni.u_res, canvas.width, canvas.height);
    gl.uniform1f(uni.u_time, st.time);
    gl.uniform2f(uni.u_cam, st.cam.x, st.cam.y);
    gl.uniform1f(uni.u_zoom, st.zoom * dpr);

    const n = Math.min(st.regions.length, 10);
    const pos = new Float32Array(20), col = new Float32Array(30),
          rad = new Float32Array(10), vis = new Float32Array(10);
    for (let i = 0; i < n; i++) {
      const r = st.regions[i];
      pos[i * 2] = r.pos.x; pos[i * 2 + 1] = r.pos.y;
      col[i * 3] = r.color[0]; col[i * 3 + 1] = r.color[1]; col[i * 3 + 2] = r.color[2];
      rad[i] = r.radius; vis[i] = r.vis;
    }
    gl.uniform1i(uni.u_regCount, n);
    gl.uniform2fv(uni.u_regPos, pos);
    gl.uniform3fv(uni.u_regCol, col);
    gl.uniform1fv(uni.u_regRad, rad);
    gl.uniform1fv(uni.u_regVis, vis);

    const fx = st.fx;
    gl.uniform1f(uni.u_swirl, fx.swirl);
    gl.uniform1f(uni.u_contra, fx.contra);
    gl.uniform1f(uni.u_tempo, fx.tempo);
    gl.uniform1f(uni.u_flash, fx.flash);
    gl.uniform3f(uni.u_flashCol, fx.flashCol[0], fx.flashCol[1], fx.flashCol[2]);
    gl.uniform1f(uni.u_recog, fx.recog);
    gl.uniform2f(uni.u_denPos, SNORF.DEN.pos.x, SNORF.DEN.pos.y);
    gl.uniform1f(uni.u_denFog, fx.denFog);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  window.addEventListener('resize', resize);
  resize();
  init();

  SNORF.fog = { render, resize };
})();
