/* Hero orb — nebula GPU particle system (raw WebGL).
   ~120k grains form a turbulent blue/white dust sphere: noise-clumped wisps
   inside, a patchy dust shell with a deep-blue silhouette rim, and a sparse
   soft-haze layer. Grains drift, rotate, and individually repel the cursor.
   Auto-cycles the same grains into clear, upright discipline icons — same
   particle material as the orb, but readable silhouettes (no spin / no repel). */
(function () {
  "use strict";

  var ICONS = [
    {
      id: "illustration",
      label: "Illustration",
      blurb: "Character, editorial, and visual storytelling.",
      src: "/assets/orb-icons/illustration.png"
    },
    {
      id: "brand",
      label: "Brand design",
      blurb: "Identities, systems, and visual language.",
      draw: function (ctx) {
        // 5-petal flower (site mark)
        ctx.save();
        ctx.translate(200, 200);
        for (var i = 0; i < 5; i++) {
          ctx.save();
          ctx.rotate((i * 2 * Math.PI) / 5);
          ctx.beginPath();
          ctx.ellipse(0, -78, 42, 66, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(0, 0, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },
    {
      id: "motion",
      label: "Motion",
      blurb: "Animation that gives brands energy.",
      src: "/assets/orb-icons/motion.png"
    },
    {
      id: "code",
      label: "Code",
      blurb: "Creative coding and design engineering.",
      src: "/assets/orb-icons/code.png"
    },
    {
      id: "ui",
      label: "UI",
      blurb: "Interfaces designed for clarity and delight.",
      src: "/assets/orb-icons/ui.png"
    }
  ];

  var wrap = document.getElementById("hero-orb");
  var canvas = document.getElementById("hero-orb-canvas");
  var defEl = document.getElementById("hero-orb-def");
  if (!wrap || !canvas || !defEl) return;

  var is404 = wrap.getAttribute("data-orb") === "404";
  if (is404) {
    ICONS = [{
      id: "four-oh-four",
      label: "404",
      blurb: "This page doesn’t exist.",
      draw: function (ctx) {
        var S = ctx.canvas.width;
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.letterSpacing = Math.round(S * 0.02) + "px";
        ctx.font = Math.round(S * 0.34) + 'px "Instrument Serif", Georgia, serif';
        ctx.fillText("404", S / 2, S / 2);
      }
    }];
  } else {
    ICONS.forEach(function (icon) {
      if (!icon.src) return;
      var img = new Image();
      img.decoding = "async";
      img.src = icon.src;
      icon.img = img;
    });
  }

  var isMobile = window.matchMedia("(max-width: 760px)").matches;
  if (isMobile && !is404) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COUNT = isMobile ? 48000 : 120000;
  var MAX_DPR = 1.5;
  var CAMERA_Z = 4.2;
  var VIEW_HALF = Math.tan((35 * Math.PI) / 360) * CAMERA_Z; // world units at z=0

  var gl = null;
  var program = null;
  var uniforms = {};
  var textBufferA = null;
  var textBufferB = null;
  var textArrA = null;
  var textArrB = null;
  var blendScratch = null;
  var textCache = {};
  var initialized = false;
  var visible = false;
  var rafId = 0;
  var lastT = 0;
  var autoTimer = 0;
  var AUTO_FIRST_MS = is404 ? 720 : 1800;
  var AUTO_HOLD_MS = is404 ? 4200 : 3200;

  var state = {
    activeIndex: -1, // -1 = orb
    hoverTarget: 0,
    hoverProgress: 0,
    morphTarget: 0,
    morphProgress: 0,
    wordTarget: 0,
    wordProgress: 0,
    spin: 0,
    time: 0, // always-on clock for continuous particle dispersion
    speed: 1,
    repProgress: 0, // repel strength trails hover with ~0.5s lag
    mouseTX: 0.5,
    mouseTY: 0.5,
    mouseX: 0.5,
    mouseY: 0.5
  };

  /* ---------- lazy init when near viewport ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      visible = e.isIntersecting;
      if (visible && !initialized) {
        initialized = true;
        init();
      }
      if (visible) start();
      else stop();
    });
  }, { rootMargin: "200px" });
  var startObserving = function () { io.observe(canvas); };
  if (is404 && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(startObserving);
  } else {
    startObserving();
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else if (visible) start();
  });

  /* ---------- shaders ---------- */
  var VERT = [
    "attribute vec3 aOrbPosition;",
    "attribute vec3 aScatterOffset;",
    "attribute vec3 aTextPositionA;",
    "attribute vec3 aTextPositionB;",
    "attribute float aBrightness;",
    "attribute float aSeed;",
    "uniform float uSpin;",
    "uniform float uTime;",
    "uniform float uRep;",
    "uniform float uMorph;",
    "uniform float uWordMix;",
    "uniform float uDrift;",
    "uniform float uPointScale;",
    "uniform vec2 uMouseW;",
    "uniform mat4 uProjection;",
    "uniform mat4 uModelView;",
    "varying float vBrightness;",
    "varying float vFade;",
    "varying float vRim;",
    "varying float vHaze;",
    "void main() {",
    "  vec3 p = aOrbPosition;",
    "  float m = smoothstep(0.0, 1.0, uMorph);",
    "  float haze = step(0.92, aSeed);", // soft haze layer stays on for orb AND icons
    "  float ph = aSeed * 50.265;",
    "  float t = uTime;",
    "  /* continuous multi-frequency dispersion (never freezes on icons) */",
    "  vec3 turb = aScatterOffset * (",
    "    sin(t * 1.7 + ph) * 0.55 +",
    "    sin(t * 3.4 + ph * 2.1) * 0.35 +",
    "    sin(t * 0.85 + ph * 0.6) * 0.45",
    "  );",
    "  p += turb * uDrift;",
    "  float c = cos(uSpin); float s = sin(uSpin);",
    "  p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);",
    "  /* grains flow away from the cursor (orb state only — no repel on icons) */",
    "  vec2 d = p.xy - uMouseW;",
    "  float dist2 = dot(d, d);",
    "  float depthW = 0.5 + 0.5 * smoothstep(-1.0, 1.0, p.z);",
    "  float grainW = 0.65 + 0.7 * fract(abs(aScatterOffset.x) * 7.31);",
    "  float rep = exp(-dist2 * 24.0) * uRep * depthW * grainW * (1.0 - m);",
    "  p.xy += (dist2 > 0.0001 ? normalize(d) : vec2(0.0)) * rep * 0.4;",
    "  p.z += rep * 0.4 * (0.4 + 0.6 * aScatterOffset.z);",
    "  p += aScatterOffset * rep * 0.25;",
    "  vec3 wordPosition = mix(aTextPositionA, aTextPositionB, smoothstep(0.0, 1.0, uWordMix));",
    "  /* icons: stay upright and readable — tiny local shimmer only, no spin/breath */",
    "  wordPosition += aScatterOffset * sin(t * 2.4 + ph) * uDrift * 0.12;",
    "  /* silhouette rim on the orb only */",
    "  vRim = smoothstep(0.87, 0.985, length(p.xy)) * (1.0 - m);",
    "  vec3 finalPosition = mix(p, wordPosition, m);",
    "  vec4 mv = uModelView * vec4(finalPosition, 1.0);",
    "  gl_Position = uProjection * mv;",
    "  float base = mix(1.1, 2.4, fract(aSeed * 13.73));",
    "  /* icons use crisp grains only — drop the soft haze sprites so the glyph stays sharp */",
    "  float iconHaze = haze * (1.0 - m);",
    "  gl_PointSize = mix(base, 24.0, iconHaze) * uPointScale;",
    "  vBrightness = aBrightness;",
    "  vHaze = iconHaze;",
    "  float depthFade = smoothstep(-1.3, 1.0, finalPosition.z);",
    "  vFade = mix(0.3 + 0.7 * depthFade, 0.85 + 0.35 * depthFade, m);",
    "}"
  ].join("\n");

  var FRAG = [
    "precision mediump float;",
    "varying float vBrightness;",
    "varying float vFade;",
    "varying float vRim;",
    "varying float vHaze;",
    "void main() {",
    "  float d = distance(gl_PointCoord, vec2(0.5));",
    "  float mask = smoothstep(0.5, mix(0.1, 0.0, vHaze), d);",
    "  vec3 keyBlue = vec3(0.125, 0.259, 0.910);",
    "  vec3 deepBlue = vec3(0.05, 0.14, 0.72);",
    "  vec3 pale = vec3(0.82, 0.88, 1.0);",
    "  vec3 color = mix(keyBlue, pale, vBrightness);",
    "  color = mix(color, deepBlue, vRim * 0.85);",
    "  float a = mask * vFade * mix(0.32 + 0.3 * vRim, 0.03, vHaze);",
    "  gl_FragColor = vec4(color * a, a);", // premultiplied
    "}"
  ].join("\n");

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("hero-orb shader:", gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  /* ---------- geometry ---------- */
  // cheap 3D value noise (CPU, build-time only) to clump grains into wisps
  function ihash(xi, yi, zi) {
    var n = xi + yi * 57 + zi * 113;
    n = (n << 13) ^ n;
    n = (Math.imul(n, Math.imul(Math.imul(n, n), 15731) + 789221) + 1376312589) & 0x7fffffff;
    return n / 2147483647;
  }
  function vnoise(x, y, z) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    var xf = x - xi, yf = y - yi, zf = z - zi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    var c000 = ihash(xi, yi, zi), c100 = ihash(xi + 1, yi, zi);
    var c010 = ihash(xi, yi + 1, zi), c110 = ihash(xi + 1, yi + 1, zi);
    var c001 = ihash(xi, yi, zi + 1), c101 = ihash(xi + 1, yi, zi + 1);
    var c011 = ihash(xi, yi + 1, zi + 1), c111 = ihash(xi + 1, yi + 1, zi + 1);
    var x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u;
    var x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
    var y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  }
  function fbm(x, y, z) {
    return 0.62 * vnoise(x * 1.5 + 11.3, y * 1.5 + 7.7, z * 1.5 + 3.1) +
           0.38 * vnoise(x * 3.4 + 31.2, y * 3.4 + 17.8, z * 3.4 + 23.4);
  }

  function buildOrb() {
    var orb = new Float32Array(COUNT * 3);
    var scatter = new Float32Array(COUNT * 3);
    var bright = new Float32Array(COUNT);
    var seed = new Float32Array(COUNT);
    var shellStart = Math.floor(COUNT * 0.78);
    var hazeStart = Math.floor(COUNT * 0.95);
    for (var i = 0; i < COUNT; i++) {
      var px = 0, py = 0, pz = 0, n = 0, tries = 0, b = 0;
      if (i < shellStart) {
        // interior wisps: rejection-sample against fbm so grains gather in filaments
        do {
          var u1 = Math.random() * 2 - 1;
          var t1 = Math.random() * Math.PI * 2;
          var rxy = Math.sqrt(Math.max(0, 1 - u1 * u1));
          var r1 = Math.pow(Math.random(), 0.5);
          px = Math.cos(t1) * rxy * r1;
          py = u1 * r1;
          pz = Math.sin(t1) * rxy * r1;
          n = fbm(px, py, pz);
          tries++;
        } while (tries < 10 && Math.random() > Math.pow(Math.max(0, n), 3.2) * 2.2);
        // tone comes from a second noise field: coherent pale vs deep-blue patches
        var n2 = fbm(px * 1.2 + 53.7, py * 1.2 + 91.1, pz * 1.2 + 27.9);
        b = 0.05 + n2 * 1.05 + (Math.random() - 0.5) * 0.2;
      } else if (i < hazeStart) {
        // dust shell: patchy skin just under the silhouette
        do {
          var u2 = Math.random() * 2 - 1;
          var t2 = Math.random() * Math.PI * 2;
          var rxy2 = Math.sqrt(Math.max(0, 1 - u2 * u2));
          px = Math.cos(t2) * rxy2;
          py = u2;
          pz = Math.sin(t2) * rxy2;
          n = fbm(px, py, pz);
          tries++;
        } while (tries < 6 && Math.random() > 0.15 + n * 1.0);
        // thin skin at the silhouette, with a feathered tail of stray dust outside
        var r2 = 0.965 + (Math.random() - 0.5) * 0.05 + Math.pow(Math.random(), 9) * 0.12;
        px *= r2; py *= r2; pz *= r2;
        b = 0.2 + n * 0.3 + Math.random() * 0.25;
      } else {
        // sparse big soft sprites: the atmospheric haze
        var u3 = Math.random() * 2 - 1;
        var t3 = Math.random() * Math.PI * 2;
        var rxy3 = Math.sqrt(Math.max(0, 1 - u3 * u3));
        var r3 = Math.pow(Math.random(), 0.4) * 1.02;
        px = Math.cos(t3) * rxy3 * r3;
        py = u3 * r3;
        pz = Math.sin(t3) * rxy3 * r3;
        b = 0.6 + Math.random() * 0.4;
      }
      orb[i * 3] = px;
      orb[i * 3 + 1] = py;
      orb[i * 3 + 2] = pz;
      // random unit-ish scatter direction (roughens repel flow + drives drift)
      var sx = Math.random() * 2 - 1, sy = Math.random() * 2 - 1, sz = Math.random() * 2 - 1;
      var sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
      scatter[i * 3] = sx / sl;
      scatter[i * 3 + 1] = sy / sl;
      scatter[i * 3 + 2] = (sz / sl) * 0.3;
      bright[i] = Math.max(0, Math.min(1, b));
      // seeds >= 0.92 mark the haze layer in the shader
      seed[i] = i < hazeStart ? Math.random() * 0.9199 : 0.92 + Math.random() * 0.08;
    }
    return { orb: orb, scatter: scatter, bright: bright, seed: seed };
  }

  /* ---------- icon sampling via offscreen canvas ---------- */
  // Clear, readable silhouettes filled with the orb's grain particles.
  // Dense shape sampling (not orb noise-math) so the icon stays recognizable.
  function createShapeParticlePositions(icon) {
    if (textCache[icon.id]) return textCache[icon.id];
    var S = 720;
    var off = document.createElement("canvas");
    off.width = S;
    off.height = S;
    var ctx = off.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#fff";

    if (icon.src) {
      var img = icon.img;
      if (!img || !img.complete || !img.naturalWidth) {
        // Image not ready yet — retry next click without caching empty
        return new Float32Array(COUNT * 3);
      }
      // Slight inset so strokes aren't clipped at the particle extent
      var pad = Math.round(S * 0.04);
      ctx.drawImage(img, pad, pad, S - pad * 2, S - pad * 2);
    } else if (icon.draw) {
      icon.draw(ctx);
    }

    var data = ctx.getImageData(0, 0, S, S).data;
    var mask = new Uint8Array(S * S);
    var pts = [];
    var minX = S, maxX = 0, minY = S, maxY = 0;
    // Ink = bright pixels (white fills OR blue line art on black)
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var i = (y * S + x) * 4;
        var r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a > 16 && r + g + b > 90) mask[y * S + x] = 1;
      }
    }
    // Light orthogonal dilate only — keeps strokes solid without soft mush
    if (icon.src) {
      var dilate = new Uint8Array(mask);
      for (var y2 = 1; y2 < S - 1; y2++) {
        for (var x2 = 1; x2 < S - 1; x2++) {
          var o = y2 * S + x2;
          if (mask[o]) continue;
          if (mask[o - 1] || mask[o + 1] || mask[o - S] || mask[o + S]) dilate[o] = 1;
        }
      }
      mask = dilate;
    }
    for (var y3 = 0; y3 < S; y3++) {
      for (var x3 = 0; x3 < S; x3++) {
        if (!mask[y3 * S + x3]) continue;
        pts.push(x3, y3);
        if (x3 < minX) minX = x3;
        if (x3 > maxX) maxX = x3;
        if (y3 < minY) minY = y3;
        if (y3 > maxY) maxY = y3;
      }
    }
    var out = new Float32Array(COUNT * 3);
    if (!pts.length) return out;
    var n = pts.length / 2;
    var cx = (minX + maxX) / 2;
    var cy = (minY + maxY) / 2;
    var extent = Math.max(maxX - minX, maxY - minY, 1);
    var k = (is404 ? 2.08 : 1.776) / extent;
    for (var i = 0; i < COUNT; i++) {
      var pi = ((i * 7919) % n) * 2;
      // minimal jitter — keeps particle texture without softening edges
      var px = pts[pi] + (Math.random() - 0.5) * 0.35;
      var py = pts[pi + 1] + (Math.random() - 0.5) * 0.35;
      out[i * 3] = (px - cx) * k;
      out[i * 3 + 1] = -(py - cy) * k;
      out[i * 3 + 2] = (Math.random() - 0.5) * 0.012;
    }
    textCache[icon.id] = out;
    return out;
  }

  function setTextBuffers(a, b) {
    textArrA = a;
    textArrB = b;
    gl.bindBuffer(gl.ARRAY_BUFFER, textBufferA);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, a);
    gl.bindBuffer(gl.ARRAY_BUFFER, textBufferB);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, b);
  }

  // snapshot of the in-flight word blend, so a mid-transition click stays continuous
  function blendCurrentWord() {
    var wp = Math.max(0, Math.min(1, state.wordProgress));
    var e = wp * wp * (3 - 2 * wp); // matches the shader's smoothstep
    for (var i = 0; i < COUNT * 3; i++) {
      blendScratch[i] = textArrA[i] + (textArrB[i] - textArrA[i]) * e;
    }
    return blendScratch;
  }

  /* ---------- matrices (fixed square viewport) ---------- */
  function perspective(fovDeg, near, far) {
    var f = 1 / Math.tan((fovDeg * Math.PI) / 360);
    var nf = 1 / (near - far);
    return new Float32Array([
      f, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }
  var MODELVIEW = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -CAMERA_Z, 1]);

  /* ---------- init ---------- */
  function init() {
    gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true });
    if (!gl) {
      wrap.classList.add("hero-orb--fallback");
      return;
    }

    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("hero-orb link:", gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    var geo = buildOrb();

    function attrib(name, data, size, dynamic) {
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      return buf;
    }

    attrib("aOrbPosition", geo.orb, 3, false);
    attrib("aScatterOffset", geo.scatter, 3, false);
    attrib("aBrightness", geo.bright, 1, false);
    attrib("aSeed", geo.seed, 1, false);
    // text buffers start as copies of the orb so uMorph is a no-op pre-click
    textArrA = new Float32Array(geo.orb);
    textArrB = new Float32Array(geo.orb);
    blendScratch = new Float32Array(COUNT * 3);
    textBufferA = attrib("aTextPositionA", textArrA, 3, true);
    textBufferB = attrib("aTextPositionB", textArrB, 3, true);

    ["uSpin", "uTime", "uRep", "uMorph", "uWordMix", "uDrift", "uPointScale", "uMouseW", "uProjection", "uModelView"].forEach(function (n) {
      uniforms[n] = gl.getUniformLocation(program, n);
    });
    gl.uniformMatrix4fv(uniforms.uProjection, false, perspective(35, 0.1, 100));
    gl.uniformMatrix4fv(uniforms.uModelView, false, MODELVIEW);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied-alpha over
    gl.clearColor(0, 0, 0, 0);

    resize();
    window.addEventListener("resize", resize);
    bindEvents();
    start();
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    var size = canvas.clientWidth || 480;
    var px = Math.round(size * dpr);
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(uniforms.uPointScale, canvas.height / 420);
  }

  /* ---------- interaction ---------- */
  function bindEvents() {
    wrap.addEventListener("pointerenter", function () { state.hoverTarget = 1; kick(); });
    wrap.addEventListener("pointerleave", function () { state.hoverTarget = 0; kick(); });
    canvas.addEventListener("pointermove", function (e) {
      var rect = canvas.getBoundingClientRect();
      state.mouseTX = (e.clientX - rect.left) / rect.width;
      state.mouseTY = 1 - (e.clientY - rect.top) / rect.height;
      kick();
    });
  }

  function clearAuto() {
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = 0;
    }
  }

  function scheduleAuto(delay) {
    clearAuto();
    if (!visible || document.hidden) return;
    autoTimer = setTimeout(function () {
      autoTimer = 0;
      var ready = advance();
      scheduleAuto(ready === false ? 400 : AUTO_HOLD_MS);
    }, delay == null ? AUTO_HOLD_MS : delay);
  }

  function advance() {
    state.activeIndex++;
    if (state.activeIndex >= ICONS.length) {
      state.activeIndex = -1;
      state.morphTarget = 0;
      updateDefinition(null);
    } else {
      var g = ICONS[state.activeIndex];
      // If image icon isn't ready yet, retry shortly without advancing caption
      if (g.src && (!g.img || !g.img.complete || !g.img.naturalWidth)) {
        state.activeIndex--;
        return false;
      }
      var next = createShapeParticlePositions(g);
      if (state.morphProgress > 0.05) {
        // already showing a word: interpolate straight from it to the next one
        setTextBuffers(blendCurrentWord(), next);
        state.wordProgress = 0;
        state.wordTarget = 1;
      } else {
        // coming from the orb: both slots hold the new word
        setTextBuffers(next, next);
        state.wordProgress = 0;
        state.wordTarget = 0;
      }
      state.morphTarget = 1;
      updateDefinition(g);
    }
    kick();
    return true;
  }

  function updateDefinition(g) {
    if (!g) {
      defEl.innerHTML = is404
        ? '<p class="hero-orb__hint">This page doesn’t exist</p>'
        : '<p class="hero-orb__hint">What I do</p>';
      return;
    }
    defEl.innerHTML =
      '<p class="hero-orb__entry"><span class="hero-orb__word">' + g.label + "</span></p>" +
      '<p class="hero-orb__meaning">' + g.blurb + "</p>";
  }

  /* ---------- render loop ---------- */
  function frame(t) {
    rafId = 0;
    var dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;

    var ease = reduceMotion ? 0.18 : 0.08;
    var easeMorph = reduceMotion ? 0.14 : 0.05;
    var easeWord = reduceMotion ? 0.16 : 0.06;
    state.hoverProgress += (state.hoverTarget - state.hoverProgress) * ease;
    state.morphProgress += (state.morphTarget - state.morphProgress) * easeMorph;
    state.wordProgress += (state.wordTarget - state.wordProgress) * easeWord;
    state.speed = 1 - state.hoverProgress * 0.79; // hover floor 0.21 (0.15 + 40%)
    if (!reduceMotion) {
      state.spin += dt * 0.35 * state.speed;
      // dispersion clock never slows — icons keep breathing even when hover pauses the spin
      state.time += dt;
    }
    // repel strength ramps in/out over ~0.5s; pocket center trails the cursor
    state.repProgress += (state.hoverTarget - state.repProgress) * (reduceMotion ? 0.18 : 0.04);
    state.mouseX += (state.mouseTX - state.mouseX) * 0.07;
    state.mouseY += (state.mouseTY - state.mouseY) * 0.07;

    gl.uniform1f(uniforms.uSpin, state.spin);
    gl.uniform1f(uniforms.uTime, state.time);
    gl.uniform1f(uniforms.uRep, state.repProgress);
    gl.uniform1f(uniforms.uMorph, state.morphProgress);
    gl.uniform1f(uniforms.uWordMix, state.wordProgress);
    // orb drift; icons only use a tiny fraction in the shader for shimmer
    gl.uniform1f(uniforms.uDrift, reduceMotion ? 0 : 0.05 * (1 + state.hoverProgress * 0.4));
    gl.uniform2f(
      uniforms.uMouseW,
      (state.mouseX - 0.5) * 2 * VIEW_HALF,
      (state.mouseY - 0.5) * 2 * VIEW_HALF
    );

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, COUNT);

    var settling =
      Math.abs(state.hoverTarget - state.hoverProgress) > 0.001 ||
      Math.abs(state.hoverTarget - state.repProgress) > 0.001 ||
      Math.abs(state.morphTarget - state.morphProgress) > 0.002 ||
      Math.abs(state.wordTarget - state.wordProgress) > 0.002;
    // reduced motion: only render while a transition is settling
    if (visible && !document.hidden && (!reduceMotion || settling)) {
      rafId = requestAnimationFrame(frame);
    }
  }

  function start() {
    if (!initialized || !gl || rafId) return;
    lastT = performance.now();
    rafId = requestAnimationFrame(frame);
    scheduleAuto(state.activeIndex < 0 ? AUTO_FIRST_MS : AUTO_HOLD_MS);
  }

  function stop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    clearAuto();
  }

  function kick() {
    // restart the loop for reduced-motion users so transitions can settle
    if (initialized && gl && !rafId && visible) start();
  }
})();
