const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

/* ---------- Theme ---------- */
const root = document.documentElement;
try {
  const saved = localStorage.getItem("theme");
  if (saved) root.dataset.theme = saved;
} catch {}
$(".theme-toggle").addEventListener("click", () => {
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch {}
});

/* ---------- Preloader ---------- */
document.body.classList.add("loading");
window.addEventListener("load", () => {
  setTimeout(() => {
    document.body.classList.remove("loading");
    document.body.classList.add("ready");
  }, reduceMotion ? 0 : 1200);
});

/* ---------- Nav ---------- */
const nav = $(".nav");
const toggle = $(".nav-toggle");
const links = $(".nav-links");
toggle.addEventListener("click", () => {
  const open = links.classList.toggle("open");
  toggle.setAttribute("aria-expanded", open);
});
$$("a", links).forEach((a) => a.addEventListener("click", () => {
  links.classList.remove("open");
  toggle.setAttribute("aria-expanded", "false");
}));

// Scroll progress, nav background, active link
const progress = $(".progress");
const sections = $$("main section[id]");
function onScroll() {
  const y = scrollY;
  const max = document.documentElement.scrollHeight - innerHeight;
  progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
  nav.classList.toggle("scrolled", y > 20);
  let current = "";
  sections.forEach((s) => { if (y >= s.offsetTop - 200) current = s.id; });
  $$("a", links).forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + current));
}
addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ---------- Reveal on scroll ---------- */
const io = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (!e.isIntersecting) return;
  e.target.classList.add("visible");
  $$(".count", e.target).forEach(countUp);
  io.unobserve(e.target);
}), { threshold: 0.15 });
$$(".reveal").forEach((el, i) => {
  el.style.transitionDelay = `${(i % 3) * 0.08}s`;
  io.observe(el);
});

function countUp(el) {
  const to = parseFloat(el.dataset.to);
  const dec = +(el.dataset.dec || 0);
  if (reduceMotion) { el.textContent = to.toFixed(dec); return; }
  const start = performance.now();
  const dur = 1600;
  (function tick(now) {
    const t = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - t, 4);
    el.textContent = (to * eased).toFixed(dec);
    if (t < 1) requestAnimationFrame(tick);
  })(start);
}

/* ---------- Rotating role text ---------- */
const rot = $(".rotator");
if (rot && !reduceMotion) {
  const words = JSON.parse(rot.dataset.words);
  let wi = 0, ci = words[0].length, deleting = true;
  setTimeout(function type() {
    const w = words[wi];
    if (deleting) {
      ci--;
      if (ci === 0) { deleting = false; wi = (wi + 1) % words.length; }
    } else {
      ci++;
      if (ci === words[wi].length) { deleting = true; rot.textContent = words[wi]; return setTimeout(type, 2200); }
    }
    rot.textContent = words[wi].slice(0, ci) || " ";
    setTimeout(type, deleting ? 28 : 55);
  }, 3500);
}

/* ---------- Custom cursor + magnetic buttons ---------- */
if (finePointer && !reduceMotion) {
  const dot = $(".cursor-dot"), ring = $(".cursor-ring");
  let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
  addEventListener("mousemove", (e) => {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = `translate(${mx}px, ${my}px)`;
  });
  (function loop() {
    rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16;
    ring.style.transform = `translate(${rx}px, ${ry}px)`;
    requestAnimationFrame(loop);
  })();
  $$("a, button, .tilt").forEach((el) => {
    el.addEventListener("mouseenter", () => ring.classList.add("hover"));
    el.addEventListener("mouseleave", () => ring.classList.remove("hover"));
  });

  $$(".magnetic").forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      el.style.transform = `translate(${x * 0.25}px, ${y * 0.35}px)`;
    });
    el.addEventListener("mouseleave", () => (el.style.transform = ""));
  });
} else {
  $$(".cursor-dot, .cursor-ring").forEach((el) => el.remove());
}

/* ---------- 3D tilt cards ---------- */
if (finePointer && !reduceMotion) {
  $$(".tilt").forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      const max = el.classList.contains("featured") ? 4 : 8;
      el.style.transform = `perspective(900px) rotateX(${(0.5 - py) * max}deg) rotateY(${(px - 0.5) * max}deg) translateZ(0)`;
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);
    });
    el.addEventListener("mouseleave", () => {
      el.style.transition = "transform .6s cubic-bezier(.2,.8,.2,1), box-shadow .5s, border-color .5s";
      el.style.transform = "";
      setTimeout(() => (el.style.transition = ""), 600);
    });
  });
}

/* ---------- 3D portrait ---------- */
const portrait = $("#portrait");
if (portrait && !reduceMotion) {
  const inner = $(".portrait-inner", portrait);
  const img = $(".photo img", portrait);
  const area = $(".hero");
  area.addEventListener("mousemove", (e) => {
    const r = portrait.getBoundingClientRect();
    const px = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width)));
    const py = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height)));
    portrait.classList.add("active");
    inner.style.transform = `rotateY(${px * 18}deg) rotateX(${-py * 14}deg)`;
    img.style.transform = `scale(1.12) translate(${-px * 10}px, ${-py * 10}px)`;
    inner.style.setProperty("--gx", `${50 + px * 40}%`);
    inner.style.setProperty("--gy", `${50 + py * 40}%`);
  });
  area.addEventListener("mouseleave", () => {
    portrait.classList.remove("active");
    inner.style.transform = "";
    img.style.transform = "";
  });
  // Gyroscope tilt on phones
  addEventListener("deviceorientation", (e) => {
    if (e.gamma == null) return;
    portrait.classList.add("active");
    const px = Math.max(-1, Math.min(1, e.gamma / 30));
    const py = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    inner.style.transform = `rotateY(${px * 14}deg) rotateX(${-py * 10}deg)`;
  });
}

/* ---------- Project filters ---------- */
$$(".filters button").forEach((b) => b.addEventListener("click", () => {
  $$(".filters button").forEach((x) => x.classList.toggle("active", x === b));
  const f = b.dataset.filter;
  $$(".project").forEach((p) => p.classList.toggle("dim", f !== "all" && p.dataset.tags !== f));
}));

/* ---------- 3D swarm (hero background) ---------- */
(function swarm() {
  const canvas = $("#swarm");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let w, h, dpr;
  const N = innerWidth < 700 ? 70 : 140;
  const pts = [];
  for (let i = 0; i < N; i++) {
    // Points on a softly noisy sphere shell
    const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2;
    const r = 1 + (Math.random() - 0.5) * 0.35;
    const s = Math.sqrt(1 - u * u);
    pts.push({ x: s * Math.cos(t) * r, y: u * r, z: s * Math.sin(t) * r, ph: Math.random() * 6.28 });
  }
  let rotY = 0, rotX = 0.3, tgtX = 0.3, tgtY = 0, mouseInfluence = 0;

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  addEventListener("resize", resize);
  addEventListener("mousemove", (e) => {
    tgtY = (e.clientX / innerWidth - 0.5) * 1.2;
    tgtX = 0.3 + (e.clientY / innerHeight - 0.5) * 0.6;
    mouseInfluence = 1;
  });

  function color() {
    return getComputedStyle(root).getPropertyValue("--accent-rgb").trim() || "29,92,72";
  }
  let rgb = color();
  new MutationObserver(() => (rgb = color())).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);

  function frame(time) {
    requestAnimationFrame(frame);
    if (!visible) return;
    const t = time * 0.001;
    rotY += reduceMotion ? 0 : 0.0016;
    rotX += (tgtX - rotX) * 0.03;
    const ry = rotY + tgtY * mouseInfluence;
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rotX), sx = Math.sin(rotX);
    const scale = Math.min(w, h) * (w < 700 ? 0.55 : 0.6);
    const cxp = w < 960 ? w / 2 : w * 0.6, cyp = h / 2;

    const proj = pts.map((p) => {
      const breathe = 1 + Math.sin(t * 0.8 + p.ph) * 0.04;
      let x = p.x * breathe, y = p.y * breathe, z = p.z * breathe;
      let x1 = x * cy - z * sy, z1 = x * sy + z * cy;
      let y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
      const f = 3 / (3 + z2);
      return { x: cxp + x1 * scale * f, y: cyp + y1 * scale * f, z: z2, f, wx: x1, wy: y1 };
    });

    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 0.6;
    for (let i = 0; i < N; i++) {
      const a = proj[i];
      for (let j = i + 1; j < N; j++) {
        const b = proj[j];
        const dx = a.wx - b.wx, dy = a.wy - b.wy, dz = a.z - b.z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < 0.16) {
          const alpha = (1 - d / 0.16) * 0.28 * ((a.f + b.f) / 2 - 0.4);
          ctx.strokeStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    proj.sort((a, b) => b.z - a.z).forEach((p) => {
      const r = 1.6 * p.f * p.f;
      ctx.fillStyle = `rgba(${rgb},${(0.25 + (p.f - 0.75) * 1.2).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill();
    });
  }
  requestAnimationFrame(frame);
})();

$("#year").textContent = new Date().getFullYear();
