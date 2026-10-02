/* 3D fly-through.
   The page scrolls normally; a camera flies through a 3D world in sync with it.
   Station 0 is an interactive model of the SwarmSight rescue rover. */
(function () {
  if (!window.THREE) return;
  const T = THREE;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;
  const canvas = document.getElementById("scene");

  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch (e) {
    canvas.remove();
    return;
  }
  document.body.classList.add("webgl");
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  const scene = new T.Scene();
  scene.fog = new T.Fog(0xf6f3ec, 9, 28);
  const camera = new T.PerspectiveCamera(42, 1, 0.1, 200);

  /* ---------- Palette + materials ---------- */
  const C = {
    emerald: 0x1d5c48, gold: 0xb08a4e, graphite: 0x2b2e34, rubber: 0x1b1c1f,
    ivory: 0xf4efe6, board: 0x2f6b4f, stone: [0xd8cfc0, 0xc9bfae, 0xbdb2a0, 0xe4dccf, 0xcfc4b2],
  };
  const M = {
    body: new T.MeshStandardMaterial({ color: C.graphite, roughness: 0.45, metalness: 0.55 }),
    deck: new T.MeshStandardMaterial({ color: C.emerald, roughness: 0.35, metalness: 0.3 }),
    gold: new T.MeshStandardMaterial({ color: C.gold, roughness: 0.3, metalness: 0.85 }),
    rubber: new T.MeshStandardMaterial({ color: C.rubber, roughness: 0.9 }),
    board: new T.MeshStandardMaterial({ color: C.board, roughness: 0.6 }),
    ivory: new T.MeshStandardMaterial({ color: C.ivory, roughness: 0.5 }),
    lens: new T.MeshStandardMaterial({ color: 0x0c0d10, emissive: 0x2fd3a0, emissiveIntensity: 1.4, roughness: 0.1 }),
    glow: new T.MeshStandardMaterial({ color: C.gold, emissive: 0xffc56b, emissiveIntensity: 1.2 }),
    led: new T.MeshStandardMaterial({ color: 0x111111, emissive: 0x2fd3a0, emissiveIntensity: 2 }),
  };

  /* ---------- Helpers ---------- */
  const v3 = (x, y, z) => new T.Vector3(x, y, z);
  function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function bar(a, b, r, mat, parent) {
    const d = new T.Vector3().subVectors(b, a);
    const m = mesh(new T.BoxGeometry(r, d.length(), r), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(v3(0, 1, 0), d.normalize());
    if (parent) parent.add(m);
    return m;
  }
  function textSprite(text, color = "#1d5c48") {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = color;
    g.beginPath();
    if (g.roundRect) g.roundRect(8, 24, 496, 80, 18); else g.rect(8, 24, 496, 80);
    g.fill();
    g.fillStyle = "#fff";
    g.font = "500 44px JetBrains Mono, monospace";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, 256, 66);
    const tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding;
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(1.2, 0.3, 1);
    s.renderOrder = 10;
    return s;
  }

  /* ---------- Lights + ground ---------- */
  const hemi = new T.HemisphereLight(0xffffff, 0xd9cfbf, 0.95);
  scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff1dc, 1.35);
  sun.position.set(6, 10, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const groundMat = new T.MeshStandardMaterial({ color: 0xefeadf, roughness: 1 });
  const ground = mesh(new T.PlaneGeometry(300, 300), groundMat, 0, 0, -40);
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  scene.add(ground);
  const grid = new T.GridHelper(300, 150, C.gold, C.gold);
  grid.material.transparent = true;
  grid.material.opacity = 0.08;
  grid.position.set(0, 0.002, -40);
  scene.add(grid);

  /* ---------- Station layout ---------- */
  const GAP = 16;
  const isSmall = () => innerWidth < 960;
  const stations = [];
  function station(name, y = 1.4) {
    const g = new T.Group();
    g.userData = { name, y };
    stations.push(g);
    scene.add(g);
    return g;
  }
  function layoutStations() {
    const x = isSmall() ? 0 : 2.7;
    stations.forEach((g, i) => g.position.set(i === 0 ? (isSmall() ? 0 : 2.3) : x, i === 0 ? 0 : g.userData.y, -i * GAP));
  }

  /* ================= Station 0: SwarmSight rover ================= */
  const s0 = station("SwarmSight rover", 0);
  const rover = new T.Group();
  s0.add(rover);
  const tag = (m, p) => { m.userData.part = p; return m; };

  // Chassis
  mesh(new T.BoxGeometry(1.5, 0.3, 0.8), M.body, 0, 0.78, 0, rover);
  mesh(new T.BoxGeometry(1.42, 0.04, 0.72), M.deck, 0, 0.95, 0, rover);
  mesh(new T.BoxGeometry(0.42, 0.04, 0.3), M.board, -0.2, 0.99, 0.05, rover);
  mesh(new T.BoxGeometry(0.12, 0.05, 0.12), M.gold, -0.26, 1.03, 0.08, rover);
  mesh(new T.BoxGeometry(0.08, 0.04, 0.16), M.ivory, -0.08, 1.02, 0.0, rover);
  // ToF sensors on the nose
  [-0.25, 0, 0.25].forEach((z) => {
    mesh(new T.BoxGeometry(0.05, 0.07, 0.09), M.body, 0.77, 0.78, z, rover);
    mesh(new T.SphereGeometry(0.018, 8, 8), M.led, 0.8, 0.79, z, rover);
  });

  // Rocker-bogie suspension + wheels
  const wheels = [];
  const WX = [0.72, 0.05, -0.68], WY = 0.27, WR = 0.27;
  [-1, 1].forEach((side) => {
    const z = 0.5 * side, wz = 0.64 * side;
    const P = v3(-0.05, 0.72, z), R = v3(-0.68, WY, z), B = v3(0.38, 0.5, z);
    const F = v3(0.72, WY, z), Mi = v3(0.05, WY, z);
    [[P, R], [P, B], [B, F], [B, Mi]].forEach(([a, b]) => tag(bar(a, b, 0.07, M.gold, rover), "drive"));
    [P, B].forEach((p) => (tag(mesh(new T.CylinderGeometry(0.06, 0.06, 0.1, 16), M.body, p.x, p.y, p.z, rover), "drive").rotation.x = Math.PI / 2));
    WX.forEach((x) => {
      tag(bar(v3(x, WY, z), v3(x, WY, wz), 0.05, M.body, rover), "drive");
      const w = new T.Group();
      w.position.set(x, WY, wz);
      const tire = tag(mesh(new T.CylinderGeometry(WR, WR, 0.2, 28), M.rubber, 0, 0, 0, w), "drive");
      tire.rotation.x = Math.PI / 2;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const lug = tag(mesh(new T.BoxGeometry(0.06, 0.03, 0.21), M.rubber, Math.cos(a) * WR, Math.sin(a) * WR, 0, w), "drive");
        lug.rotation.z = a + Math.PI / 2;
      }
      const hub = tag(mesh(new T.CylinderGeometry(0.11, 0.11, 0.22, 20), M.gold, 0, 0, 0, w), "drive");
      hub.rotation.x = Math.PI / 2;
      for (let k = 0; k < 3; k++) {
        const sp = tag(mesh(new T.BoxGeometry(0.03, 0.2, 0.225), M.body, 0, 0, 0, w), "drive");
        sp.rotation.z = (k / 3) * Math.PI;
      }
      rover.add(w);
      wheels.push(w);
    });
  });

  // Camera mast + head
  tag(bar(v3(0.55, 0.95, 0), v3(0.55, 1.55, 0), 0.06, M.body, rover), "vision");
  const head = new T.Group();
  head.position.set(0.55, 1.62, 0);
  rover.add(head);
  const headTilt = new T.Group();
  headTilt.rotation.z = -0.28; // look slightly down at the rubble
  head.add(headTilt);
  tag(mesh(new T.BoxGeometry(0.22, 0.16, 0.32), M.body, 0, 0, 0, headTilt), "vision");
  tag(mesh(new T.BoxGeometry(0.02, 0.12, 0.26), M.deck, 0.115, 0, 0, headTilt), "vision");
  const lens = tag(mesh(new T.CylinderGeometry(0.055, 0.065, 0.06, 24), M.lens, 0.14, 0, 0, headTilt), "vision");
  lens.rotation.z = Math.PI / 2;
  const cone = new T.Mesh(
    new T.ConeGeometry(0.9, 3, 32, 1, true),
    new T.MeshBasicMaterial({ color: 0x2fd3a0, transparent: true, opacity: 0.09, depthWrite: false, side: T.DoubleSide })
  );
  cone.rotation.z = Math.PI / 2;
  cone.position.set(1.65, 0, 0);
  headTilt.add(cone);

  // Antenna
  tag(bar(v3(-0.6, 0.95, 0.24), v3(-0.6, 1.75, 0.24), 0.025, M.body, rover), "comms");
  tag(mesh(new T.SphereGeometry(0.05, 16, 16), M.glow, -0.6, 1.78, 0.24, rover), "comms");
  tag(mesh(new T.BoxGeometry(0.18, 0.1, 0.14), M.body, -0.6, 1.0, 0.24, rover), "comms");

  // Detection hologram: a "hand" found under rubble
  const det = new T.Group();
  det.position.set(2.3, 0.28, 0.55);
  rover.add(det);
  const handMat = new T.MeshStandardMaterial({ color: 0xc89a7c, roughness: 0.7 });
  mesh(new T.CylinderGeometry(0.06, 0.06, 0.3, 10), handMat, 0, 0.08, 0, det).rotation.z = 0.9;
  mesh(new T.DodecahedronGeometry(0.28), new T.MeshStandardMaterial({ color: C.stone[1], flatShading: true, roughness: 1 }), -0.15, 0.02, 0.1, det);
  const boxEdges = new T.LineSegments(
    new T.EdgesGeometry(new T.BoxGeometry(0.62, 0.46, 0.5)),
    new T.LineBasicMaterial({ color: 0x1d5c48, transparent: true, opacity: 0 })
  );
  boxEdges.position.y = 0.12;
  det.add(boxEdges);
  const detLabel = textSprite("hand · 0.93");
  detLabel.position.set(0, 0.58, 0);
  detLabel.material.opacity = 0;
  det.add(detLabel);
  const detAngle = Math.atan2(-(det.position.z - head.position.z), det.position.x - head.position.x);

  // Rubble field around the rover
  const rubble = new T.Group();
  s0.add(rubble);
  for (let i = 0; i < 46; i++) {
    const r = 1.6 + Math.random() * 4.2, a = Math.random() * Math.PI * 2;
    const size = 0.08 + Math.random() * 0.38;
    const mat = new T.MeshStandardMaterial({ color: C.stone[i % C.stone.length], flatShading: true, roughness: 1 });
    const geo = i % 4 === 0 ? new T.BoxGeometry(size * 2.4, size * 0.35, size * 1.4) : new T.DodecahedronGeometry(size, 0);
    const m = mesh(geo, mat, Math.cos(a) * r, size * 0.45, Math.sin(a) * r, rubble);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  }
  rover.rotation.y = -0.55;

  /* ================= Station 1: framed portrait ================= */
  const s1 = station("Portrait", 1.5);
  const portrait = new T.Group();
  s1.add(portrait);
  mesh(new T.BoxGeometry(1.78, 2.3, 0.08), M.gold, 0, 0, -0.03, portrait);
  mesh(new T.BoxGeometry(1.64, 2.16, 0.09), M.deck, 0, 0, -0.02, portrait);
  const photoMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  new T.TextureLoader().load("assets/photo.jpg", (tex) => {
    tex.encoding = T.sRGBEncoding;
    tex.anisotropy = 4;
    photoMat.map = tex;
    photoMat.needsUpdate = true;
  });
  const photo = mesh(new T.PlaneGeometry(1.5, 2), photoMat, 0, 0, 0.031, portrait);
  photo.castShadow = false;
  const orbitRings = [];
  [2.0, 2.4].forEach((r, i) => {
    const ring = new T.Mesh(new T.TorusGeometry(r, 0.012, 8, 120), M.gold);
    ring.rotation.set(Math.PI / 2.3, i * 0.6, 0);
    s1.add(ring);
    orbitRings.push(ring);
  });
  const cgpa = textSprite("CGPA 8.18", "#b08a4e");
  cgpa.position.set(0.95, 1.25, 0.3);
  s1.add(cgpa);

  /* ================= Station 2: skills cluster ================= */
  const s2 = station("Skills", 1.5);
  const core = mesh(new T.IcosahedronGeometry(0.75, 0), new T.MeshStandardMaterial({ color: C.emerald, roughness: 0.25, metalness: 0.35, flatShading: true }), 0, 0, 0, s2);
  const orbiters = [
    { geo: new T.TorusGeometry(0.26, 0.09, 16, 40), mat: M.gold, label: "ML & AI" },
    { geo: new T.OctahedronGeometry(0.3), mat: M.body, label: "Optimisation" },
    { geo: new T.BoxGeometry(0.4, 0.4, 0.4), mat: M.ivory, label: "Python & Data" },
    { geo: new T.TorusKnotGeometry(0.18, 0.06, 64, 8), mat: M.deck, label: "Networks" },
  ].map((o, i) => {
    const pivot = new T.Group();
    pivot.rotation.set(0.3 + i * 0.35, i * 1.4, 0);
    s2.add(pivot);
    const holder = new T.Group();
    holder.position.set(1.55, 0, 0);
    pivot.add(holder);
    const m = mesh(o.geo, o.mat, 0, 0, 0, holder);
    const l = textSprite(o.label, i % 2 ? "#2b2e34" : "#1d5c48");
    l.scale.set(0.9, 0.225, 1);
    l.position.set(0, 0.45, 0);
    holder.add(l);
    return { pivot, m, speed: 0.35 + i * 0.12 };
  });

  /* ================= Station 3: protein helix ================= */
  const s3 = station("Protein helix", 1.6);
  const helix = new T.Group();
  s3.add(helix);
  const ballGeo = new T.SphereGeometry(0.1, 16, 16);
  const nH = 28;
  for (let i = 0; i < nH; i++) {
    const t = i / (nH - 1), y = (t - 0.5) * 4.2, a = t * Math.PI * 5;
    const p1 = v3(Math.cos(a) * 0.9, y, Math.sin(a) * 0.9);
    const p2 = v3(Math.cos(a + Math.PI) * 0.9, y, Math.sin(a + Math.PI) * 0.9);
    mesh(ballGeo, M.deck, p1.x, p1.y, p1.z, helix);
    mesh(ballGeo, M.gold, p2.x, p2.y, p2.z, helix);
    if (i % 2 === 0) bar(p1, p2, 0.035, M.ivory, helix);
  }

  /* ================= Station 4: graduation cap + books ================= */
  const s4 = station("Education", 1.5);
  const cap = new T.Group();
  s4.add(cap);
  const board = mesh(new T.BoxGeometry(1.5, 0.06, 1.5), M.body, 0, 0.35, 0, cap);
  board.rotation.y = Math.PI / 4;
  mesh(new T.CylinderGeometry(0.5, 0.55, 0.38, 32), M.body, 0, 0.13, 0, cap);
  mesh(new T.CylinderGeometry(0.06, 0.06, 0.04, 16), M.gold, 0, 0.4, 0, cap);
  bar(v3(0, 0.4, 0), v3(0.75, 0.38, 0), 0.025, M.gold, cap);
  const tassel = new T.Group();
  tassel.position.set(0.75, 0.38, 0);
  cap.add(tassel);
  bar(v3(0, 0, 0), v3(0, -0.48, 0), 0.025, M.gold, tassel);
  mesh(new T.CylinderGeometry(0.05, 0.08, 0.2, 12), M.gold, 0, -0.55, 0, tassel);
  const books = new T.Group();
  books.position.y = -0.9;
  s4.add(books);
  [[C.emerald, 0.1], [C.gold, -0.15], [C.graphite, 0.05]].forEach(([col, rot], i) => {
    const b = mesh(new T.BoxGeometry(1.3, 0.2, 0.9), new T.MeshStandardMaterial({ color: col, roughness: 0.6 }), 0, i * 0.21, 0, books);
    b.rotation.y = rot;
    mesh(new T.BoxGeometry(1.24, 0.16, 0.86), M.ivory, 0.04, 0, 0, b);
  });

  /* ================= Station 5: signal tower ================= */
  const s5 = station("Signal", 0.2);
  mesh(new T.CylinderGeometry(0.05, 0.08, 2.6, 12), M.body, 0, 1.3, 0, s5);
  [0.6, 1.2, 1.8].forEach((y) => {
    bar(v3(-0.35, y - 0.4, 0), v3(0, y, 0), 0.03, M.gold, s5);
    bar(v3(0.35, y - 0.4, 0), v3(0, y, 0), 0.03, M.gold, s5);
  });
  const dish = mesh(new T.CylinderGeometry(0.55, 0.08, 0.28, 32, 1, true), new T.MeshStandardMaterial({ color: C.ivory, roughness: 0.3, metalness: 0.4, side: T.DoubleSide }), 0, 2.2, 0.2, s5);
  dish.rotation.x = Math.PI / 2.4;
  const beaconMat = M.glow.clone();
  mesh(new T.SphereGeometry(0.08, 16, 16), beaconMat, 0, 2.7, 0, s5);
  const waves = [0, 1, 2, 3].map((i) => {
    const w = new T.Mesh(new T.TorusGeometry(0.3, 0.012, 8, 80), new T.MeshBasicMaterial({ color: C.emerald, transparent: true }));
    w.position.set(0, 2.7, 0);
    s5.add(w);
    return { w, off: i / 4 };
  });

  /* ---------- Route decoration: rings you fly through + dust ---------- */
  const ringMat = new T.MeshBasicMaterial({ color: C.gold, transparent: true, opacity: 0.35 });
  for (let z = -GAP / 2; z > -GAP * (stations.length - 1); z -= GAP / 2) {
    const r = new T.Mesh(new T.TorusGeometry(4.2, 0.012, 6, 140), ringMat);
    r.position.set(0, 2, z);
    scene.add(r);
  }
  const dustN = 900, dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 24;
    dustPos[i * 3 + 1] = Math.random() * 7;
    dustPos[i * 3 + 2] = 8 - Math.random() * (GAP * stations.length + 10);
  }
  const dustGeo = new T.BufferGeometry();
  dustGeo.setAttribute("position", new T.BufferAttribute(dustPos, 3));
  const dust = new T.Points(dustGeo, new T.PointsMaterial({ color: C.gold, size: 0.035, transparent: true, opacity: 0.6, depthWrite: false }));
  scene.add(dust);

  /* ---------- Theme ---------- */
  function applyTheme() {
    const cs = getComputedStyle(root);
    const bg = new T.Color(cs.getPropertyValue("--bg").trim() || "#f6f3ec");
    const alt = new T.Color(cs.getPropertyValue("--bg-alt").trim() || "#efeadf");
    const dark = root.dataset.theme === "dark";
    scene.background = bg;
    scene.fog.color = bg;
    groundMat.color = alt;
    hemi.intensity = dark ? 0.45 : 0.95;
    hemi.groundColor.set(dark ? 0x1a1f1c : 0xd9cfbf);
    sun.intensity = dark ? 0.9 : 1.35;
    grid.material.opacity = dark ? 0.12 : 0.08;
  }
  applyTheme();
  new MutationObserver(applyTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---------- Resize ---------- */
  function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    layoutStations();
  }
  resize();
  addEventListener("resize", resize);

  /* ---------- Scroll → camera path ---------- */
  const sections = [...document.querySelectorAll("main > section")];
  function progress() {
    const mid = scrollY + innerHeight * 0.5;
    const anchors = sections.map((s) => s.offsetTop + Math.min(s.offsetHeight, innerHeight) * 0.5);
    let i = 0;
    while (i < anchors.length - 1 && mid > anchors[i + 1]) i++;
    if (i >= stations.length - 1) return { i: stations.length - 1, t: 0 };
    let t = (mid - anchors[i]) / (anchors[i + 1] - anchors[i]);
    t = Math.max(0, Math.min(1, t));
    t = t < 0.2 ? 0 : t > 0.8 ? 1 : (t - 0.2) / 0.6;
    return { i, t: t * t * (3 - 2 * t) };
  }
  function camFor(i) {
    const small = isSmall();
    const z = -i * GAP;
    if (i === 0) return { pos: v3(0, small ? 2.4 : 2.0, small ? 7.8 : 6.4), look: v3(small ? 0 : 0.7, small ? -0.2 : 0.8, 0) };
    return { pos: v3(0, 1.8, z + (small ? 8.5 : 6.8)), look: v3(0, 1.4, z) };
  }

  /* ---------- Input ---------- */
  const clock = new T.Clock();
  const mouse = new T.Vector2();
  addEventListener("pointermove", (e) => mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));

  const stage = document.querySelector(".rover-stage");
  let yawTarget = rover.rotation.y, yawVel = 0, dragging = false, lastX = 0, downX = 0, downY = 0, lastInteract = -10;
  const ray = new T.Raycaster();
  const partOf = (o) => { while (o && !o.userData.part) o = o.parent; return o && o.userData.part; };
  if (stage) {
    stage.addEventListener("pointerdown", (e) => {
      dragging = true; lastX = downX = e.clientX; downY = e.clientY;
      stage.setPointerCapture(e.pointerId);
      stage.classList.add("dragging");
    });
    stage.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      yawTarget += dx * 0.012;
      yawVel = dx * 0.012;
      lastInteract = clock.elapsedTime;
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove("dragging");
      if (Math.hypot(e.clientX - downX, e.clientY - downY) < 6) {
        const m = new T.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
        ray.setFromCamera(m, camera);
        const hit = ray.intersectObjects(rover.children, true).find((h) => partOf(h.object));
        if (hit) openPart(partOf(hit.object));
      }
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
  }

  /* ---------- Rover hotspots + info card ---------- */
  const INFO = {
    vision: { kicker: "Vision · YOLO11n", title: "SwarmSight", text: "The camera runs a fine-tuned YOLO11n model on the Pi 5 that detects people and individual body parts, so a survivor buried under rubble can be found from a single visible hand.", href: "#p-swarmsight", anchor: v3(0.7, 1.62, 0) },
    drive: { kicker: "Navigation · Swarm PSO", title: "Adaptive PSO path planning", text: "Rocker-bogie wheels handle the rubble, and adaptive particle swarm optimisation plans collision-free paths so a team of rescue robots reaches victims faster.", href: "#p-pso", anchor: v3(0.05, 0.27, 0.78) },
    comms: { kicker: "Comms · SDR", title: "Mission-aware emergency network", text: "A continual-learning packet scheduler for GNU Radio scores every message by mission criticality, so an SOS is never stuck behind routine telemetry.", href: "#p-sdr", anchor: v3(-0.6, 1.8, 0.24) },
  };
  const hotspots = [...document.querySelectorAll(".hotspot")];
  const pop = document.querySelector(".part-pop");
  let activePart = null;
  function openPart(p) {
    const d = INFO[p];
    if (!d || !pop) return;
    activePart = p;
    pop.querySelector(".pop-kicker").textContent = d.kicker;
    pop.querySelector(".pop-title").textContent = d.title;
    pop.querySelector(".pop-text").textContent = d.text;
    pop.querySelector(".pop-link").setAttribute("href", d.href);
    pop.hidden = false;
    requestAnimationFrame(() => pop.classList.add("open"));
    hotspots.forEach((h) => h.classList.toggle("active", h.dataset.part === p));
    lastInteract = clock.elapsedTime;
  }
  function closePart() {
    if (!activePart) return;
    activePart = null;
    pop.classList.remove("open");
    hotspots.forEach((h) => h.classList.remove("active"));
    setTimeout(() => { if (!activePart) pop.hidden = true; }, 300);
  }
  hotspots.forEach((h) => h.addEventListener("click", () => (activePart === h.dataset.part ? closePart() : openPart(h.dataset.part))));
  if (pop) {
    pop.querySelector(".pop-close").addEventListener("click", closePart);
    pop.querySelector(".pop-link").addEventListener("click", closePart);
  }

  const hud = document.querySelector(".hud-text");
  let hudName = "";

  /* ---------- Loop ---------- */
  const start = camFor(0);
  const camPos = start.pos.clone(), camLook = start.look.clone();
  const tmp = new T.Vector3();

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    const time = clock.elapsedTime;
    const k = 1 - Math.pow(0.92, dt * 60);

    // Camera target from scroll, with a swooping arc between stations
    const { i, t } = progress();
    const A = camFor(i), B = camFor(Math.min(i + 1, stations.length - 1));
    const arc = Math.sin(Math.PI * t);
    const tp = A.pos.clone().lerp(B.pos, t).add(v3(-1.6 * arc, 1.4 * arc, 0));
    const tl = A.look.clone().lerp(B.look, t);
    tp.x += mouse.x * 0.45; tp.y += mouse.y * 0.25;
    camPos.lerp(tp, reduce ? 1 : k);
    camLook.lerp(tl, reduce ? 1 : k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    sun.position.set(camLook.x + 6, 10, camLook.z + 7);
    sun.target.position.copy(camLook);

    const name = stations[t < 0.5 ? i : Math.min(i + 1, stations.length - 1)].userData.name;
    if (hud && name !== hudName) { hud.textContent = name; hudName = name; }

    const anim = reduce ? 0 : 1;

    // Rover: drag with inertia, slow auto-spin when idle
    if (!dragging) {
      yawVel *= 0.94;
      yawTarget += yawVel * anim;
      if (time - lastInteract > 4 && !activePart) yawTarget += dt * 0.18 * anim;
    }
    rover.rotation.y += (yawTarget - rover.rotation.y) * (1 - Math.pow(0.85, dt * 60));
    wheels.forEach((w) => (w.rotation.z -= dt * 1.4 * anim));
    const yaw = Math.sin(time * 0.7) * 0.75 * anim;
    head.rotation.y = yaw;
    M.lens.emissiveIntensity = 1.1 + Math.sin(time * 4) * 0.4;
    M.glow.emissiveIntensity = 0.6 + (Math.sin(time * 3) > 0.6 ? 1.4 : 0);
    const seen = Math.max(0, 1 - Math.abs(yaw - detAngle) / 0.22);
    const detOpacity = Math.min(1, seen * 2);
    boxEdges.material.opacity += (detOpacity - boxEdges.material.opacity) * 0.2;
    detLabel.material.opacity = boxEdges.material.opacity;
    cone.material.opacity = 0.07 + seen * 0.08;

    // Hotspot positions (only around the rover station)
    const nearRover = i === 0 && t < 0.35;
    hotspots.forEach((h) => {
      tmp.copy(INFO[h.dataset.part].anchor);
      rover.localToWorld(tmp);
      tmp.project(camera);
      const visible = nearRover && tmp.z < 1;
      h.classList.toggle("show", visible);
      if (visible) h.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * innerWidth}px, ${(-tmp.y * 0.5 + 0.5) * innerHeight}px)`;
    });
    if (!nearRover) closePart();

    // Other stations
    portrait.rotation.y = Math.sin(time * 0.5) * 0.18 * anim - mouse.x * 0.25;
    portrait.rotation.x = Math.sin(time * 0.4) * 0.05 * anim + mouse.y * 0.12;
    portrait.position.y = Math.sin(time * 0.8) * 0.06 * anim;
    orbitRings.forEach((r, n) => (r.rotation.z += dt * (n ? -0.25 : 0.35) * anim));
    core.rotation.x += dt * 0.25 * anim; core.rotation.y += dt * 0.35 * anim;
    orbiters.forEach((o) => { o.pivot.rotation.y += dt * o.speed * anim; o.m.rotation.x += dt * anim; o.m.rotation.y += dt * 0.7 * anim; });
    helix.rotation.y += dt * 0.4 * anim;
    cap.rotation.y = Math.sin(time * 0.6) * 0.5 * anim;
    cap.position.y = 0.5 + Math.sin(time * 0.9) * 0.08 * anim;
    tassel.rotation.z = Math.sin(time * 2) * 0.12 * anim;
    books.rotation.y = -Math.sin(time * 0.4) * 0.2 * anim;
    waves.forEach((w) => {
      const p = (time * 0.35 * anim + w.off) % 1;
      w.w.scale.setScalar(1 + p * 9);
      w.w.material.opacity = (1 - p) * 0.6;
    });
    beaconMat.emissiveIntensity = 0.6 + Math.sin(time * 5) * 0.5;
    dust.rotation.y = Math.sin(time * 0.05) * 0.05;

    renderer.render(scene, camera);
  }
  frame();
})();
