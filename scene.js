/* Full-page WebGL particle world.
   One swarm of particles that morphs into a different 3D formation per section,
   reacts to the cursor, and sends out a shockwave on click. */
(function () {
  if (!window.THREE) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isSmall = () => innerWidth < 960;
  const root = document.documentElement;

  const canvas = document.getElementById("scene");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (e) {
    canvas.remove();
    return;
  }
  document.body.classList.add("webgl");
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 7.5);

  const N = innerWidth < 700 ? 2400 : 4200;
  const rand = Math.random;
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;

  /* ---------- Formations ---------- */
  function sphere() {
    const a = new Float32Array(N * 3), g = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), th = i * g;
      const R = 2.9 * (1 + gauss() * 0.05);
      a.set([Math.cos(th) * r * R, y * R, Math.sin(th) * r * R], i * 3);
    }
    return a;
  }
  function torusKnot() {
    const a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const t = rand() * Math.PI * 2, p = 2, q = 3;
      const r = Math.cos(q * t) + 2;
      const s = 0.82;
      a.set([
        r * Math.cos(p * t) * s + gauss() * 0.22,
        r * Math.sin(p * t) * s + gauss() * 0.22,
        -Math.sin(q * t) * s * 1.2 + gauss() * 0.22,
      ], i * 3);
    }
    return a;
  }
  function galaxy() {
    const a = new Float32Array(N * 3), arms = 4;
    for (let i = 0; i < N; i++) {
      const r = Math.pow(rand(), 0.7) * 3.6;
      const ang = r * 1.25 + ((i % arms) / arms) * Math.PI * 2;
      const spread = 0.35 * (1.2 - r / 3.6);
      a.set([
        Math.cos(ang) * r + gauss() * spread,
        gauss() * 0.18 * (1.3 - r / 3.6),
        Math.sin(ang) * r + gauss() * spread,
      ], i * 3);
    }
    return a;
  }
  function helix() {
    // Protein / DNA style double helix with rungs
    const a = new Float32Array(N * 3), H = 3.4, R = 1.05, turns = 3.2;
    for (let i = 0; i < N; i++) {
      if (rand() < 0.72) {
        const t = rand() * 2 - 1, ang = t * Math.PI * 2 * turns + (i % 2) * Math.PI;
        a.set([Math.cos(ang) * R + gauss() * 0.07, t * H + gauss() * 0.05, Math.sin(ang) * R + gauss() * 0.07], i * 3);
      } else {
        const k = Math.floor(rand() * 44), t = (k / 43) * 2 - 1;
        const ang = t * Math.PI * 2 * turns, s = rand() * 2 - 1;
        a.set([Math.cos(ang) * R * s, t * H + gauss() * 0.02, Math.sin(ang) * R * s], i * 3);
      }
    }
    return a;
  }
  function landscape() {
    const a = new Float32Array(N * 3), side = Math.ceil(Math.sqrt(N)), S = 8;
    for (let i = 0; i < N; i++) {
      const x = ((i % side) / side - 0.5) * S, z = (Math.floor(i / side) / side - 0.5) * S;
      const y = Math.sin(x * 1.1) * Math.cos(z * 0.9) * 0.55 + Math.sin(x * 0.4 + z * 0.6) * 0.35;
      a.set([x, y - 0.6, z], i * 3);
    }
    return a;
  }
  function ring() {
    const a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = rand() * Math.PI * 2, v = rand() * Math.PI * 2;
      const big = i % 3 === 0 ? 1.4 : 2.4, tube = i % 3 === 0 ? 0.12 : 0.28;
      a.set([(big + tube * Math.cos(v)) * Math.cos(u), (big + tube * Math.cos(v)) * Math.sin(u), tube * Math.sin(v)], i * 3);
    }
    return a;
  }

  const formations = [
    { name: "Swarm sphere", pts: sphere(), pos: [2.2, 0], rot: [0.2, 0] },
    { name: "Neural knot", pts: torusKnot(), pos: [-2.6, 0], rot: [0.3, 0] },
    { name: "Skill galaxy", pts: galaxy(), pos: [0, 0], rot: [0.55, 0] },
    { name: "Protein helix", pts: helix(), pos: [3.1, 0], rot: [0.15, 0] },
    { name: "Learning landscape", pts: landscape(), pos: [0, -0.4], rot: [0.45, 0] },
    { name: "Signal ring", pts: ring(), pos: [0, 0], rot: [0.1, 0] },
  ];

  /* ---------- Geometry + shader ---------- */
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(formations[0].pts);
  // Start scattered so the first frame explodes into the sphere
  for (let i = 0; i < pos.length; i++) pos[i] = gauss() * 12;
  const aRand = new Float32Array(N), aMix = new Float32Array(N);
  for (let i = 0; i < N; i++) { aRand[i] = rand(); aMix[i] = rand() < 0.22 ? 1 : rand() * 0.35; }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aRand", new THREE.BufferAttribute(aRand, 1));
  geo.setAttribute("aMix", new THREE.BufferAttribute(aMix, 1));

  const uniforms = {
    uTime: { value: 0 },
    uSize: { value: 30 },
    uPixel: { value: renderer.getPixelRatio() },
    uMouse: { value: new THREE.Vector3(99, 99, 0) },
    uShockT: { value: 99 },
    uShockO: { value: new THREE.Vector3() },
    uC1: { value: new THREE.Color() },
    uC2: { value: new THREE.Color() },
    uOpacity: { value: 0.7 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      uniform float uTime, uSize, uPixel, uShockT;
      uniform vec3 uMouse, uShockO;
      attribute float aRand, aMix;
      varying float vMix, vGlow, vDepth;
      void main() {
        vec3 p = position;
        p += 0.04 * vec3(sin(uTime * 0.9 + aRand * 40.0), cos(uTime * 0.7 + aRand * 30.0), sin(uTime * 0.5 + aRand * 20.0));
        vec4 world = modelMatrix * vec4(p, 1.0);

        // Cursor repel
        vec3 d = world.xyz - uMouse;
        float dist = length(d.xy);
        float f = smoothstep(1.4, 0.0, dist);
        world.xyz += normalize(d + vec3(0.0, 0.0, 0.001)) * f * 0.85;

        // Click shockwave
        vec3 sd = world.xyz - uShockO;
        float sl = length(sd);
        float wave = exp(-pow((sl - uShockT * 7.0) * 1.6, 2.0)) * exp(-uShockT * 1.4);
        world.xyz += normalize(sd + 0.0001) * wave * 1.4;

        vec4 mv = viewMatrix * world;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPixel * (0.45 + aRand * 0.9) * (1.0 + f * 0.8 + wave) / -mv.z;
        vMix = clamp(aMix + f * 0.6 + wave, 0.0, 1.0);
        vGlow = f + wave;
        vDepth = smoothstep(12.0, 4.0, -mv.z);
      }`,
    fragmentShader: `
      uniform vec3 uC1, uC2;
      uniform float uOpacity;
      varying float vMix, vGlow, vDepth;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.05, d);
        gl_FragColor = vec4(mix(uC1, uC2, vMix), a * uOpacity * (0.35 + 0.65 * vDepth) * (1.0 + vGlow * 0.6));
      }`,
  });

  const group = new THREE.Group();
  const points = new THREE.Points(geo, mat);
  group.add(points);
  scene.add(group);

  function themeColors() {
    const cs = getComputedStyle(root);
    uniforms.uC1.value.set(cs.getPropertyValue("--accent").trim() || "#1d5c48");
    uniforms.uC2.value.set(cs.getPropertyValue("--accent-2").trim() || "#b08a4e");
    uniforms.uOpacity.value = root.dataset.theme === "dark" ? 0.9 : 0.72;
    mat.blending = root.dataset.theme === "dark" ? THREE.AdditiveBlending : THREE.NormalBlending;
    mat.needsUpdate = true;
  }
  themeColors();
  new MutationObserver(themeColors).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---------- Sizing ---------- */
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w < 700 ? 10 : 7.5;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener("resize", resize);

  /* ---------- Input ---------- */
  const mouse = new THREE.Vector2(0, 0);
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  let hasMouse = false;
  addEventListener("pointermove", (e) => {
    mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    hasMouse = e.pointerType === "mouse";
  });
  document.addEventListener("mouseleave", () => (hasMouse = false));

  addEventListener("pointerdown", (e) => {
    if (e.target.closest("a, button, .card, input, .portrait")) return;
    const m = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(m, camera);
    ray.ray.intersectPlane(plane, uniforms.uShockO.value);
    uniforms.uShockT.value = 0;
  });

  /* ---------- Scroll → formation ---------- */
  const sections = [...document.querySelectorAll("main > section")];
  const hud = document.querySelector(".hud-text");
  let lastName = "";
  function scrollState() {
    const mid = scrollY + innerHeight * 0.5;
    const centers = sections.map((s) => s.offsetTop + Math.min(s.offsetHeight, innerHeight) * 0.5);
    let i = 0;
    while (i < centers.length - 1 && mid > centers[i + 1]) i++;
    if (i >= formations.length - 1) return { i: formations.length - 1, t: 0 };
    let t = (mid - centers[i]) / (centers[i + 1] - centers[i]);
    t = Math.max(0, Math.min(1, t));
    // Hold each formation, then morph quickly between them
    t = t < 0.35 ? 0 : t > 0.65 ? 1 : (t - 0.35) / 0.3;
    t = t * t * (3 - 2 * t);
    return { i, t };
  }

  const target = new Float32Array(N * 3);
  const gp = { x: 0, y: 0, rx: 0 };
  let spin = 0;
  const clock = new THREE.Clock();

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    uniforms.uTime.value += reduce ? 0 : dt;
    uniforms.uShockT.value += dt;

    const { i, t } = scrollState();
    const A = formations[i], B = formations[Math.min(i + 1, formations.length - 1)];
    for (let k = 0; k < target.length; k++) target[k] = A.pts[k] + (B.pts[k] - A.pts[k]) * t;
    const ease = reduce ? 1 : 1 - Math.pow(0.94, dt * 60);
    const follow = 1 - Math.pow(0.95, dt * 60);
    for (let k = 0; k < pos.length; k++) pos[k] += (target[k] - pos[k]) * ease;
    geo.attributes.position.needsUpdate = true;

    const name = t < 0.5 ? A.name : B.name;
    if (hud && name !== lastName) { hud.textContent = name; lastName = name; }

    const small = isSmall();
    const tx = small ? 0 : A.pos[0] + (B.pos[0] - A.pos[0]) * t;
    const ty = A.pos[1] + (B.pos[1] - A.pos[1]) * t;
    const trx = A.rot[0] + (B.rot[0] - A.rot[0]) * t;
    gp.x += (tx - gp.x) * follow; gp.y += (ty - gp.y) * follow; gp.rx += (trx - gp.rx) * follow;

    spin += reduce ? 0 : dt * 0.12;
    group.position.set(gp.x, gp.y, 0);
    group.rotation.x = gp.rx + mouse.y * 0.18;
    group.rotation.y = spin + mouse.x * 0.35;

    camera.position.x += (mouse.x * 0.4 - camera.position.x) * follow;
    camera.position.y += (mouse.y * 0.3 - camera.position.y) * follow;
    camera.lookAt(0, 0, 0);

    if (hasMouse) {
      ray.setFromCamera(mouse, camera);
      if (ray.ray.intersectPlane(plane, hit)) uniforms.uMouse.value.lerp(hit, 0.2);
    } else {
      uniforms.uMouse.value.set(99, 99, 0);
    }

    renderer.render(scene, camera);
  }
  frame();
})();
