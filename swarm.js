/* ==========================================================
   Hero swarm: drone agents that flock, assemble into the name
   shown in #swarm-text, scatter around the cursor and re-form.
   Canvas 2D, no dependencies.
   ========================================================== */
(() => {
  const canvas = document.getElementById("swarm");
  const textEl = document.getElementById("swarm-text");
  if (!canvas || !textEl || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const hero = canvas.parentElement;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const COBALT = "#1f4fd8";
  const INK = "#0f1a2e";
  const SIGNAL = "#ff5a1f";

  const hud = {
    agents: document.getElementById("hud-agents"),
    mode: document.getElementById("hud-mode"),
    lock: document.getElementById("hud-lock"),
    fps: document.getElementById("hud-fps"),
    cursor: document.getElementById("hud-cursor"),
  };

  let W = 0, H = 0, DPR = 1;
  let agents = [];
  let size = 9;               // drone span in CSS px
  let gap = 11;               // formation grid step
  let sprites = {};           // pre-rendered drone glyphs
  let mode = "launch";        // launch | form | hold | scatter
  let modeT = 0;
  let running = false, visible = true, raf = 0;
  const mouse = { x: -1e4, y: -1e4, active: false };

  /* ---------- Drone sprite ---------- */
  // A quad-drone seen from above: X-frame, 4 rotor rings, body, signal nose.
  function makeSprite(px, body, rotor, nose) {
    const s = Math.ceil(px * DPR * 1.25) + 4;
    const c = document.createElement("canvas");
    c.width = c.height = s;
    const g = c.getContext("2d");
    const m = s / 2, r = px * DPR * 0.5, rr = r * 0.42, arm = r - rr * 0.55;
    g.translate(m, m);
    g.lineCap = "round";
    g.strokeStyle = body;
    g.lineWidth = Math.max(1, r * 0.2);
    g.beginPath();
    for (const a of [0.785, 2.356, 3.927, 5.498]) { g.moveTo(0, 0); g.lineTo(Math.cos(a) * arm, Math.sin(a) * arm); }
    g.stroke();
    g.strokeStyle = rotor;
    g.lineWidth = Math.max(0.8, r * 0.13);
    for (const a of [0.785, 2.356, 3.927, 5.498]) {
      g.beginPath(); g.arc(Math.cos(a) * arm, Math.sin(a) * arm, rr, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = body;
    g.fillRect(-r * 0.3, -r * 0.22, r * 0.6, r * 0.44);
    g.fillStyle = nose;              // heading marker points along +x
    g.beginPath(); g.arc(r * 0.42, 0, Math.max(1, r * 0.15), 0, Math.PI * 2); g.fill();
    return c;
  }
  function buildSprites() {
    sprites.drone = makeSprite(size, COBALT, COBALT, SIGNAL);
    sprites.lead = makeSprite(size * 1.5, INK, COBALT, SIGNAL);
  }

  /* ---------- Formation targets from the DOM text ---------- */
  function sampleTargets() {
    const heroRect = hero.getBoundingClientRect();
    const cs = getComputedStyle(textEl);
    const fontSize = parseFloat(cs.fontSize);
    const off = document.createElement("canvas");
    off.width = Math.ceil(W); off.height = Math.ceil(H);
    const o = off.getContext("2d");
    o.font = `${cs.fontWeight} ${fontSize}px ${cs.fontFamily}`;
    o.textBaseline = "alphabetic";
    o.fillStyle = "#000";
    // letter-spacing: canvas supports it in modern browsers; ignore otherwise
    if ("letterSpacing" in o) o.letterSpacing = cs.letterSpacing;
    const m = o.measureText("Hg");
    const asc = m.fontBoundingBoxAscent || fontSize * 0.8;
    const desc = m.fontBoundingBoxDescent || fontSize * 0.2;
    for (const span of textEl.querySelectorAll("span")) {
      const r = span.getBoundingClientRect();
      const x = r.left - heroRect.left;
      const y = r.top - heroRect.top + (r.height - (asc + desc)) / 2 + asc;
      o.fillText(span.textContent, x, y);
    }
    const img = o.getImageData(0, 0, off.width, off.height).data;

    // Pick a grid step so the agent count fits the device budget.
    let filled = 0;
    for (let i = 3; i < img.length; i += 16) if (img[i] > 128) filled++;
    const area = filled * 4;
    const budget = W < 640 ? 520 : W < 1100 ? 850 : 1150;
    const step = Math.max(fontSize / 22, Math.sqrt(area / budget), W < 640 ? 7.2 : 6.5);
    gap = step;
    size = Math.min(12, Math.max(6.5, step * 0.8));

    const pts = [];
    for (let y = step / 2; y < off.height; y += step) {
      const row = Math.round(y / step);
      for (let x = (row % 2 ? step / 2 : 0) + step / 4; x < off.width; x += step) {
        const i = ((y | 0) * off.width + (x | 0)) * 4 + 3;
        if (img[i] > 128) pts.push({ x, y });
      }
    }
    return pts;
  }

  /* ---------- Agents ---------- */
  function spawn(tx, ty, lead) {
    // Launch from the bottom-right "base" corner, fanned out
    const a = -Math.PI * (0.55 + Math.random() * 0.4);
    const sx = W * (0.05 + Math.random() * 0.95), sy = H + 20 + Math.random() * 160;
    return {
      x: sx, y: sy, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3,
      h: a, tx, ty, lead, free: tx == null,
      ph: Math.random() * Math.PI * 2,
    };
  }

  function setup() {
    const rect = hero.getBoundingClientRect();
    W = rect.width; H = rect.height;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);

    const pts = sampleTargets();
    buildSprites();
    // Shuffle so assignment isn't scan-ordered, then sort by x so drones
    // coming from the right fill the right-most letters first.
    for (let i = pts.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pts[i], pts[j]] = [pts[j], pts[i]]; }

    const old = agents;
    agents = pts.map((p, i) => {
      const a = old[i];
      if (a && !a.free) { a.tx = p.x; a.ty = p.y; return a; }
      return spawn(p.x, p.y, i % 37 === 0);
    });
    // A handful of free scouts that patrol and never join the formation
    const scouts = Math.round(agents.length * 0.06);
    for (let i = 0; i < scouts; i++) {
      const s = spawn(null, null, i % 3 === 0);
      s.x = Math.random() * W; s.y = Math.random() * H;
      agents.push(s);
    }
    if (hud.agents) hud.agents.textContent = String(agents.length).padStart(4, "0");
    if (reduceMotion) {
      for (const a of agents) {
        if (a.free) continue;
        a.x = a.tx; a.y = a.ty; a.vx = 0; a.vy = 0; a.h = -Math.PI / 2;
      }
      agents = agents.filter((a) => !a.free);
      setMode("hold");
      draw();
    }
  }

  function setMode(m) {
    mode = m; modeT = 0;
    if (hud.mode) hud.mode.textContent = { launch: "Launch", form: "Forming", hold: "Formation", scatter: "Scatter" }[m];
  }

  /* ---------- Spatial hash for neighbour queries ---------- */
  const CELL = 28;
  let grid = new Map();
  function rebuildGrid() {
    grid.clear();
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      const k = ((a.x / CELL) | 0) * 4096 + ((a.y / CELL) | 0);
      let b = grid.get(k); if (!b) grid.set(k, (b = [])); b.push(a);
    }
  }

  /* ---------- Simulation ---------- */
  function step(dt) {
    modeT += dt;
    if (mode === "launch" && modeT > 1.1) setMode("form");
    else if (mode === "form" && modeT > 2.6) setMode("hold");
    else if (mode === "hold" && modeT > 7) setMode("scatter");
    else if (mode === "scatter" && modeT > 3.2) setMode("form");

    rebuildGrid();
    const flocking = mode === "launch" || mode === "scatter";
    const sepR = Math.max(size * 1.3, 10), sepR2 = sepR * sepR, nR2 = (CELL * 1.6) ** 2;
    const fsepR = gap * 0.7, fsepR2 = fsepR * fsepR;
    const repelR = W < 640 ? 70 : 110, repelR2 = repelR * repelR;
    const t = performance.now() / 1000;
    let locked = 0, formers = 0;

    for (const a of agents) {
      let ax = 0, ay = 0;
      let sx = 0, sy = 0, cx = 0, cy = 0, alx = 0, aly = 0, n = 0;
      const gx = (a.x / CELL) | 0, gy = (a.y / CELL) | 0;
      for (let ix = gx - 1; ix <= gx + 1; ix++) for (let iy = gy - 1; iy <= gy + 1; iy++) {
        const b = grid.get(ix * 4096 + iy); if (!b) continue;
        for (const o of b) {
          if (o === a) continue;
          const dx = a.x - o.x, dy = a.y - o.y, d2 = dx * dx + dy * dy;
          if (d2 > nR2) continue;
          if (d2 < sepR2 && d2 > 0.01) {
            const d = Math.sqrt(d2), r = flocking || a.free ? sepR : fsepR;
            if (d < r) { sx += dx / d * (r - d); sy += dy / d * (r - d); }
          }
          cx += o.x; cy += o.y; alx += o.vx; aly += o.vy; n++;
        }
      }

      if (flocking || a.free) {
        // Classic boids: separation, alignment, cohesion, plus wander
        ax += sx * 0.09; ay += sy * 0.09;
        if (n) {
          ax += (alx / n - a.vx) * 0.045; ay += (aly / n - a.vy) * 0.045;
          ax += (cx / n - a.x) * 0.0016; ay += (cy / n - a.y) * 0.0016;
        }
        ax += Math.cos(t * 0.7 + a.ph) * 0.05; ay += Math.sin(t * 0.9 + a.ph * 1.3) * 0.05;
        // soft walls
        const m = 60;
        if (a.x < m) ax += (m - a.x) * 0.004; else if (a.x > W - m) ax -= (a.x - W + m) * 0.004;
        if (a.y < m + 60) ay += (m + 60 - a.y) * 0.004; else if (a.y > H - m) ay -= (a.y - H + m) * 0.004;
        if (mode === "launch" && !a.free) { ax += (a.tx - a.x) * 0.0012; ay += (a.ty - a.y) * 0.0012; }
      } else {
        // Arrive at formation slot, with a small hover bob
        const tx = a.tx + Math.cos(t * 2 + a.ph) * 0.6, ty = a.ty + Math.sin(t * 2.4 + a.ph) * 0.6;
        const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
        const desired = Math.min(d * 0.09, mode === "form" ? 7 : 5);
        if (d > 0.01) { ax += (dx / d * desired - a.vx) * 0.16; ay += (dy / d * desired - a.vy) * 0.16; }
        ax += sx * 0.03; ay += sy * 0.03;
        formers++; if (d < 2.5) locked++;
      }

      // Cursor: drones treat it as an obstacle and veer away
      if (mouse.active) {
        const dx = a.x - mouse.x, dy = a.y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < repelR2 && d2 > 1) {
          const d = Math.sqrt(d2), f = (1 - d / repelR) ** 1.5 * 4.5;
          ax += dx / d * f; ay += dy / d * f;
        }
      }

      a.vx += ax * dt * 60; a.vy += ay * dt * 60;
      const sp = Math.hypot(a.vx, a.vy), max = flocking || a.free ? 3.4 : 8;
      if (sp > max) { a.vx *= max / sp; a.vy *= max / sp; }
      if (flocking || a.free) { if (sp < 1.4 && sp > 0) { a.vx *= 1.4 / sp; a.vy *= 1.4 / sp; } }
      else { a.vx *= 0.94; a.vy *= 0.94; }
      a.x += a.vx * dt * 60; a.y += a.vy * dt * 60;

      // Heading follows velocity when moving; settles "nose up" when hovering
      const want = sp > 0.35 ? Math.atan2(a.vy, a.vx) : -Math.PI / 2;
      let dh = want - a.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      a.h += dh * Math.min(1, (sp > 0.35 ? 0.25 : 0.06) * dt * 60);
    }
    return formers ? locked / formers : 0;
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Trails: one batched stroke of short velocity-aligned segments
    if (!reduceMotion) {
      ctx.beginPath();
      for (const a of agents) {
        const sp = a.vx * a.vx + a.vy * a.vy;
        if (sp < 0.6) continue;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x - a.vx * 5, a.y - a.vy * 5);
      }
      ctx.strokeStyle = "rgba(31,79,216,.18)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Cursor sensor ring
    if (mouse.active && !reduceMotion) {
      const r = W < 640 ? 70 : 110;
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = "rgba(255,90,31,.7)";
      ctx.beginPath(); ctx.arc(mouse.x, mouse.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const a of agents) {
      const s = a.lead ? sprites.lead : sprites.drone;
      const c = Math.cos(a.h), sn = Math.sin(a.h);
      ctx.setTransform(c * DPR, sn * DPR, -sn * DPR, c * DPR, a.x * DPR, a.y * DPR);
      ctx.drawImage(s, -s.width / 2 / DPR, -s.height / 2 / DPR, s.width / DPR, s.height / DPR);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ---------- Loop ---------- */
  let last = 0, fpsAcc = 0, fpsN = 0, hudT = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000 || 1 / 60, 1 / 30);
    last = now;
    const lock = step(dt);
    draw();
    fpsAcc += dt; fpsN++; hudT += dt;
    if (hudT > 0.25) {
      if (hud.fps) hud.fps.textContent = String(Math.round(fpsN / fpsAcc)).padStart(2, "0");
      if (hud.lock) hud.lock.textContent = String(Math.round(lock * 100)).padStart(3, "0") + "%";
      fpsAcc = fpsN = hudT = 0;
    }
  }
  function start() {
    if (running || reduceMotion || !visible || document.hidden) return;
    running = true; last = performance.now(); raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  /* ---------- Events ---------- */
  function localPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  hero.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const p = localPoint(e); mouse.x = p.x; mouse.y = p.y; mouse.active = true;
    if (hud.cursor) hud.cursor.textContent = `${String(Math.round(p.x)).padStart(4, "0")}, ${String(Math.round(p.y)).padStart(4, "0")}`;
  });
  hero.addEventListener("pointerleave", () => { mouse.active = false; if (hud.cursor) hud.cursor.textContent = "----, ----"; });
  // Touch: drag to push drones around
  canvas.addEventListener("touchmove", (e) => {
    const t = e.touches[0]; if (!t) return;
    const p = localPoint(t); mouse.x = p.x; mouse.y = p.y; mouse.active = true;
  }, { passive: true });
  canvas.addEventListener("touchend", () => { mouse.active = false; });
  canvas.addEventListener("click", (e) => {
    if (reduceMotion) return;
    const p = localPoint(e);
    // Burst outward from the click, then the swarm flocks and re-forms
    for (const a of agents) {
      const dx = a.x - p.x, dy = a.y - p.y, d = Math.hypot(dx, dy) || 1;
      const f = Math.max(0, 1 - d / 500) * 9 + 1.5;
      a.vx += dx / d * f; a.vy += dy / d * f;
    }
    setMode("scatter");
  });

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    visible ? start() : stop();
  }, { threshold: 0 }).observe(hero);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));

  let rt = 0, lastW = 0, ready = false;
  function boot() {
    const r = hero.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    if (!ready) {
      ready = true; lastW = r.width;
      setup();
      document.documentElement.classList.add("swarm-on");
      setMode(reduceMotion ? "hold" : "launch");
      if (reduceMotion) {
        if (hud.mode) hud.mode.textContent = "Static";
        if (hud.lock) hud.lock.textContent = "100%";
        if (hud.fps) hud.fps.textContent = "Off";
      }
      start();
      return;
    }
    // Ignore height-only changes from mobile browser chrome showing/hiding
    if (Math.abs(r.width - lastW) < 2 && Math.abs(r.height - H) < 120) return;
    lastW = r.width; setup(); if (!running) draw();
  }
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  fontsReady.then(() => {
    boot();
    new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(boot, 150); }).observe(hero);
  });
})();
