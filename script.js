const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Nav ---------- */
const nav = $(".nav");
const toggle = $(".nav-toggle");
const links = $(".nav-links");
function setMenu(open) {
  links.classList.toggle("open", open);
  toggle.setAttribute("aria-expanded", open);
  toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
}
toggle.addEventListener("click", () => setMenu(!links.classList.contains("open")));
$$("a", links).forEach((a) => a.addEventListener("click", () => setMenu(false)));
addEventListener("keydown", (e) => { if (e.key === "Escape" && links.classList.contains("open")) { setMenu(false); toggle.focus(); } });

// Scroll progress, nav background, active section
const bar = $(".progress i");
const sections = $$("main section[id]");
let ticking = false;
function onScroll() {
  ticking = false;
  const y = scrollY;
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
  nav.classList.toggle("scrolled", y > 20);
  let current = "";
  sections.forEach((s) => { if (y >= s.offsetTop - innerHeight * 0.4) current = s.id; });
  $$("a", links).forEach((a) => {
    const on = a.getAttribute("href") === "#" + current;
    a.classList.toggle("active", on);
    on ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current");
  });
}
addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
onScroll();

/* ---------- UTC clock ---------- */
const utc = $("#utc");
if (utc) {
  const tick = () => { utc.textContent = new Date().toISOString().slice(11, 19); };
  tick(); setInterval(tick, 1000);
}

/* ---------- Reveal on scroll + counters ---------- */
const io = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (!e.isIntersecting) return;
  e.target.classList.add("visible");
  $$(".count", e.target).concat(e.target.matches(".count") ? [e.target] : []).forEach(countUp);
  io.unobserve(e.target);
}), { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
$$(".reveal").forEach((el) => {
  const sib = [...el.parentElement.children].filter((c) => c.classList.contains("reveal"));
  el.style.transitionDelay = `${Math.min(sib.indexOf(el), 4) * 0.07}s`;
  io.observe(el);
});

function countUp(el) {
  const to = parseFloat(el.dataset.to);
  const dec = +(el.dataset.dec || 0);
  if (reduceMotion) { el.textContent = to.toFixed(dec); return; }
  const start = performance.now();
  const dur = 1400;
  (function tick(now) {
    const t = Math.min((now - start) / dur, 1);
    el.textContent = (to * (1 - Math.pow(1 - t, 4))).toFixed(dec);
    if (t < 1) requestAnimationFrame(tick);
  })(start);
}

/* ---------- Typed role line ---------- */
const rot = $(".rotator");
if (rot && !reduceMotion) {
  const words = JSON.parse(rot.dataset.words);
  let wi = 0, ci = words[0].length, deleting = true;
  setTimeout(function type() {
    if (deleting) {
      ci--;
      if (ci === 0) { deleting = false; wi = (wi + 1) % words.length; }
    } else {
      ci++;
      if (ci === words[wi].length) { deleting = true; rot.textContent = words[wi]; return setTimeout(type, 2400); }
    }
    rot.textContent = words[wi].slice(0, ci) || " ";
    setTimeout(type, deleting ? 26 : 50);
  }, 4000);
}

/* ---------- Mission filters ---------- */
const filterBtns = $$(".filters button");
filterBtns.forEach((b) => b.addEventListener("click", () => {
  filterBtns.forEach((x) => x.setAttribute("aria-pressed", x === b));
  const f = b.dataset.filter;
  $$(".mission").forEach((m) => {
    const show = f === "all" || m.dataset.tags === f;
    m.classList.toggle("hide", !show);
    if (show) m.classList.add("visible");
  });
}));

/* ---------- Copy email ---------- */
$$("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(b.dataset.copy);
    b.textContent = "Copied ✓";
  } catch {
    b.textContent = "Press ⌘/Ctrl+C";
  }
  setTimeout(() => (b.textContent = "Copy"), 1800);
}));

/* ---------- Systems panel scopes (small live signal traces) ---------- */
(() => {
  const scopes = $$(".scope");
  if (!scopes.length) return;
  const state = scopes.map((c) => ({ c, ctx: c.getContext("2d"), seed: +c.dataset.seed, on: false }));
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    state.forEach((s) => {
      const r = s.c.getBoundingClientRect();
      s.w = r.width; s.h = r.height;
      s.c.width = r.width * dpr; s.c.height = r.height * dpr;
      s.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  }
  function drawScope(s, t) {
    const { ctx, w, h, seed } = s;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(31,79,216,.15)";
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.strokeStyle = "#1f4fd8"; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const u = x / w;
      const y = h / 2
        + Math.sin(u * (8 + seed * 3) + t * (1.2 + seed * 0.2)) * h * 0.18
        + Math.sin(u * (21 + seed) - t * 2.3) * h * 0.08
        + Math.sin(u * 3 + t * 0.6 + seed) * h * 0.08;
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    const px = ((t * 0.18 + seed * 0.21) % 1) * w;
    ctx.fillStyle = "#ff5a1f";
    ctx.fillRect(px, 4, 2, h - 8);
  }
  size();
  addEventListener("resize", size);
  if (reduceMotion) { state.forEach((s) => drawScope(s, s.seed)); return; }
  const vis = new IntersectionObserver((es) => es.forEach((e) => {
    state.find((s) => s.c === e.target).on = e.isIntersecting;
  }));
  scopes.forEach((c) => vis.observe(c));
  (function loop(now) {
    requestAnimationFrame(loop);
    const t = now / 1000;
    state.forEach((s) => s.on && drawScope(s, t));
  })(performance.now());
})();

$("#year").textContent = new Date().getFullYear();
