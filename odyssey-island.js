/* Odyssey 3D island for the main screen. Needs three.min.js (global THREE).
   mount(container, opts) returns a controller, or null if 3D is not available,
   in which case the flat map stays in place. */
(function () {
  "use strict";
  const RM = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches } catch (e) { return false } })();

  // deterministic pseudo-random, so the island looks the same on every visit
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

  const PEAK = [2.4, -2.2], CAVE = [0, -0.3];
  const STATIONS = [[-3.4, 2.2], [0, 1.45], [3.3, 2.4]];
  function height(x, z) {
    const r = Math.hypot(x, z);
    let h = 0.28 + 0.16 * Math.sin(x * 1.3) * Math.cos(z * 1.1);
    const dp = Math.hypot(x - PEAK[0], z - PEAK[1]); h += 3.3 * Math.exp(-dp * dp / 1.7);
    const d2 = Math.hypot(x + 2.9, z + 2.7); h += 1.7 * Math.exp(-d2 * d2 / 2.4);
    const d3 = Math.hypot(x + 0.2, z + 3.6); h += 1.2 * Math.exp(-d3 * d3 / 2.0);
    const dc = Math.hypot(x - CAVE[0], z - CAVE[1]); h += 1.05 * Math.exp(-dc * dc / 0.8);
    const edge = Math.max(0, Math.min(1, (6.1 - r) / 1.3));
    return h * edge * edge - (1 - edge) * 0.55;
  }
  const inSnow = (x, z) => x > 1.1 && z > -0.4;

  function mount(el, opts) {
    const THREE = window.THREE;
    if (!THREE || !el) return null;
    const canvas = el.querySelector("canvas"), ui = el.querySelector(".isle-ui");
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
    } catch (e) { return null }
    if (!renderer.getContext()) return null;
    renderer.setClearColor(0x000000, 0);
    let pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1.6, 0.1, 200);
    const world = new THREE.Group(); scene.add(world);
    const C = h => new THREE.Color(h);
    const lam = (hex, extra) => new THREE.MeshLambertMaterial(Object.assign({ color: hex, flatShading: true }, extra || {}));

    /* ---- lights: dusk until the lighthouse is lit, then day ---- */
    const hemi = new THREE.HemisphereLight(0xdfe6ff, 0x7c86a0, 1.6); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xdfe0ff, 1.4); sun.position.set(-6, 10, 7); scene.add(sun);

    /* ---- terrain ---- */
    const rand = rng(7);
    const RINGS = 10, SEGS = 30, R = 6.3, grid = [];
    for (let i = 0; i <= RINGS; i++) {
      const row = [], rr = R * Math.pow(i / RINGS, 0.9);
      for (let j = 0; j < SEGS; j++) {
        const a = (j / SEGS) * Math.PI * 2 + (i % 2 ? Math.PI / SEGS : 0);
        const jr = i === 0 || i === RINGS ? 0 : (rand() - 0.5) * 0.25;
        const x = Math.cos(a) * (rr + jr), z = Math.sin(a) * (rr + jr);
        row.push([x, height(x, z), z]);
      }
      grid.push(row);
    }
    const pos = [], col = [], base = [], reg = [];
    // which chapter's region a face belongs to: 0 forest, 1 cave, 2 snow valley, -1 shore and peak
    function region(cx, cz, cy) {
      if (Math.hypot(cx, cz) > 5.35 || cy > 2.3) return -1;
      if (inSnow(cx, cz)) return 2;
      if (cx < -1.3) return 0;
      if (Math.hypot(cx - PEAK[0], cz - PEAK[1]) < 1.9) return -1;
      return cx > 1.1 ? 2 : 1;
    }
    const cGrass = [C(0x7dbb86), C(0x6fb07c), C(0x8cc592)], cSnow = [C(0xf2f5fb), C(0xe6ebf5)], cRock = [C(0x9aa5bd), C(0x8a96b0)];
    const cSand = C(0xdcd3b2), cCave = [C(0x59627f), C(0x4c5574)], cTop = C(0xffffff);
    function faceColor(cx, cy, cz) {
      const r = Math.hypot(cx, cz), k = Math.floor(rand() * 3);
      if (cy > 2.3) return cTop;
      if (cy > 1.25) return cRock[k % 2];
      if (Math.hypot(cx - CAVE[0], cz - CAVE[1]) < 1.05 && cy > 0.55) return cCave[k % 2];
      if (r > 5.35) return cSand;
      if (inSnow(cx, cz)) return cSnow[k % 2];
      return cGrass[k];
    }
    function tri(a, b, c) {
      pos.push(...a, ...b, ...c);
      const mx = (a[0] + b[0] + c[0]) / 3, my = (a[1] + b[1] + c[1]) / 3, mz = (a[2] + b[2] + c[2]) / 3;
      const cc = faceColor(mx, my, mz), rg = region(mx, mz, my);
      for (let i = 0; i < 3; i++) { col.push(cc.r, cc.g, cc.b); base.push(cc.r, cc.g, cc.b); reg.push(rg) }
    }
    for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEGS; j++) {
      const a = grid[i][j], b = grid[i][(j + 1) % SEGS], c = grid[i + 1][j], d = grid[i + 1][(j + 1) % SEGS];
      if (i === 0) { tri(a, d, c); continue }
      if (i % 2) { tri(a, b, c); tri(b, d, c) } else { tri(a, b, d); tri(a, d, c) }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    tg.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    tg.computeVertexNormals();
    const greyOf = (r, g, b) => { const l = 0.3 * r + 0.59 * g + 0.11 * b; return [l * 0.8 + 0.1, l * 0.82 + 0.11, l * 0.86 + 0.15] };
    const grey = []; for (let i = 0; i < base.length; i += 3) grey.push(...greyOf(base[i], base[i + 1], base[i + 2]));
    const heal = [0, 0, 0], healGoal = [0, 0, 0];
    let neutralK = -1;
    function paintTerrain() {
      const arr = tg.attributes.color.array;
      for (let v = 0, i = 0; i < arr.length; i += 3, v++) {
        const r = reg[v], k = 0.22 + 0.78 * (r < 0 ? neutralK : heal[r]);
        arr[i] = grey[i] + (base[i] - grey[i]) * k; arr[i + 1] = grey[i + 1] + (base[i + 1] - grey[i + 1]) * k; arr[i + 2] = grey[i + 2] + (base[i + 2] - grey[i + 2]) * k;
      }
      tg.attributes.color.needsUpdate = true;
    }
    const terrain = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    world.add(terrain);
    const under = new THREE.Mesh(new THREE.CylinderGeometry(6.0, 4.4, 1.5, 15, 1), lam(0x7d86a0));
    under.position.y = -1.25; world.add(under);

    /* ---- sea ---- */
    const sea = new THREE.Mesh(new THREE.CircleGeometry(60, 40), new THREE.MeshLambertMaterial({ color: 0x8fc2ec }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.5; scene.add(sea);
    const foam = new THREE.Mesh(new THREE.RingGeometry(5.9, 6.5, 30), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    foam.rotation.x = -Math.PI / 2; foam.position.y = -0.47; world.add(foam);

    /* ---- trees ---- */
    const coneG = new THREE.ConeGeometry(0.3, 0.75, 6), trunkG = new THREE.CylinderGeometry(0.05, 0.07, 0.25, 5);
    const mGreen = [lam(0x2f7f52), lam(0x3b9060)], mTrunk = lam(0x5a4634), mPine = lam(0x6f88a6), mCap = lam(0xffffff);
    const tinted = [[mGreen[0], 0], [mGreen[1], 0], [mPine, 2]].map(([m, r]) => { const b = m.color.clone(), g = greyOf(b.r, b.g, b.b); return { m, r, b, g: new THREE.Color(g[0], g[1], g[2]) } });
    const sways = [];
    function tree(x, z, s, snowy) {
      const y = height(x, z); if (y < 0.12 || y > 1.3) return;
      for (const st of STATIONS) if (Math.hypot(x - st[0], z - st[1]) < 0.75) return;
      const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s);
      const tr = new THREE.Mesh(trunkG, mTrunk); tr.position.y = 0.12; g.add(tr);
      for (let k = 0; k < 2; k++) {
        const c = new THREE.Mesh(coneG, snowy ? (k ? mCap : mPine) : mGreen[k]);
        c.position.y = 0.55 + k * 0.38; c.scale.setScalar(1 - k * 0.3); g.add(c);
      }
      world.add(g); sways.push(g);
    }
    const tr = rng(21);
    for (let i = 0; i < 60; i++) { const x = -5.2 + tr() * 4.4, z = -1.4 + tr() * 5.6; if (i < 26) tree(x, z, 0.8 + tr() * 0.6, false) }
    for (let i = 0; i < 12; i++) tree(1.5 + tr() * 3.6, 0.4 + tr() * 3.8, 0.7 + tr() * 0.5, true);

    /* ---- what grows back: flowers in the forest, crystals in the cave, flowers through the snow ---- */
    const growth = [[], [], []], fr = rng(99);
    function scatter(r, n, pick, make) {
      let tries = 0;
      while (growth[r].length < n && tries++ < 600) {
        const [x, z] = pick(); const y = height(x, z);
        if (y < 0.15 || y > 1.4 || region(x, z, y) !== r) continue;
        if (STATIONS.some(st => Math.hypot(x - st[0], z - st[1]) < 0.6)) continue;
        const m = make(); m.position.set(x, y + 0.05, z); m.scale.setScalar(0.0001); world.add(m);
        growth[r].push({ m, delay: fr() * 0.55, s: 0.8 + fr() * 0.6 });
      }
    }
    const petal = new THREE.IcosahedronGeometry(0.06, 0), crystal = new THREE.OctahedronGeometry(0.11, 0);
    const pm = c => new THREE.MeshBasicMaterial({ color: c });
    const fCols = [pm(0xffd166), pm(0xff8fab), pm(0xffffff)], sCols = [pm(0xc9a0ff), pm(0xff9ecb), pm(0xfff1a8)];
    const cMat = new THREE.MeshBasicMaterial({ color: 0x8fe3ff });
    scatter(0, 22, () => [-5.2 + fr() * 4.0, -1.6 + fr() * 5.4], () => new THREE.Mesh(petal, fCols[Math.floor(fr() * 3)]));
    scatter(1, 12, () => { const a = Math.PI * (0.05 + fr() * 0.9), d = 0.55 + fr() * 1.0; return [CAVE[0] + Math.cos(a) * d * 1.4, CAVE[1] + Math.sin(a) * d] }, () => { const m = new THREE.Mesh(crystal, cMat); m.scale.y = 1.6; m.rotation.z = (fr() - 0.5) * 0.6; return m });
    scatter(2, 18, () => [1.4 + fr() * 3.8, 0.0 + fr() * 4.2], () => new THREE.Mesh(petal, sCols[Math.floor(fr() * 3)]));

    /* ---- cave mouth ---- */
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color: 0x161b2b }));
    mouth.scale.set(1, 1.05, 0.45); mouth.position.set(CAVE[0], height(CAVE[0], CAVE[1] + 0.85) + 0.12, CAVE[1] + 0.86); world.add(mouth);
    const caveGlow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27d }));
    caveGlow.position.copy(mouth.position); caveGlow.position.z += 0.16; caveGlow.position.y -= 0.05; world.add(caveGlow);

    /* ---- little bridge at the first stop ---- */
    const plankM = lam(0x9a7448);
    for (let i = 0; i < 7; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.5), plankM), u = i / 6 - 0.5;
      p.position.set(-4.35 + u * 1.25, height(-4.35, 2.9) + 0.32 - u * u * 0.7, 2.9); p.rotation.z = -u * 0.9; world.add(p);
    }

    /* ---- lighthouse ---- */
    const py = height(PEAK[0], PEAK[1]);
    const tower = new THREE.Group(); tower.position.set(PEAK[0], py - 0.1, PEAK[1]); world.add(tower);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.27, 1.35, 10), lam(0xf7f9fd)); body.position.y = 0.68; tower.add(body);
    [0.42, 0.9].forEach(y => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2 + (0.9 - y) * 0.09, 0.215 + (0.9 - y) * 0.09, 0.17, 10), lam(0xd0685c)); b.position.y = y; tower.add(b) });
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 10), lam(0x3c4a6a)); gallery.position.y = 1.37; tower.add(gallery);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0x8b9bb8 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.24, 10), lampMat); lamp.position.y = 1.52; tower.add(lamp);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.24, 10), lam(0x3c4a6a)); roof.position.y = 1.76; tower.add(roof);
    const lampWorld = new THREE.Vector3(PEAK[0], py - 0.1 + 1.52, PEAK[1]);
    const beams = new THREE.Group(); beams.position.y = 1.52; tower.add(beams); beams.visible = false;
    const bg = new THREE.ConeGeometry(0.75, 6.5, 24, 1, true); bg.translate(0, -3.25, 0); bg.rotateZ(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1bd, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide });
    const b1 = new THREE.Mesh(bg, beamMat), b2 = new THREE.Mesh(bg, beamMat); b2.rotation.y = Math.PI; beams.add(b1, b2);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.y = 1.52; tower.add(halo);
    const lampLight = new THREE.PointLight(0xffe2a0, 0, 14, 1.4); lampLight.position.y = 1.6; tower.add(lampLight);

    /* ---- path ---- */
    const curve = new THREE.CatmullRomCurve3([[-4.9, 3.3], [-3.4, 2.2], [-1.7, 2.1], [0, 1.45], [1.7, 2.2], [3.3, 2.4], [4.0, 0.7], [3.4, -1.0], [2.75, -1.75]].map(p => new THREE.Vector3(p[0], 0, p[1])));
    const dotG = new THREE.SphereGeometry(0.055, 6, 5), dotM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    curve.getSpacedPoints(46).forEach(p => { const d = new THREE.Mesh(dotG, dotM); d.position.set(p.x, height(p.x, p.z) + 0.07, p.z); world.add(d) });

    /* ---- stations ---- */
    const colors = [0x3f9d6b, 0x4b5677, 0xb5788c], GOLD = 0xf2b84a;
    const stations = STATIONS.map((s, i) => {
      const y = height(s[0], s[1]), g = new THREE.Group(); g.position.set(s[0], y, s[1]); world.add(g);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.055, 6, 20), lam(0xffffff)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; g.add(ring);
      const orbM = new THREE.MeshBasicMaterial({ color: colors[i] });
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), orbM); orb.position.y = 0.72; g.add(orb);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.y = 0.72; g.add(glow);
      return { g, orb, orbM, glow, base: new THREE.Vector3(s[0], y + 0.72, s[1]), done: false };
    });
    const flyers = stations.map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a })); m.visible = false; world.add(m); return m });

    /* ---- the traveller: heals as each chapter is finished ---- */
    const trav = new THREE.Group(); world.add(trav); trav.scale.setScalar(1.3);
    const tBody = new THREE.Group(); trav.add(tBody);
    const cloakM = lam(0x80889e), scarfM = lam(0x969cac);
    const cloakA = C(0x80889e), cloakB = C(0x26968a), scarfA = C(0x969cac), scarfB = C(0xf09c58);
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.46, 8), cloakM); cloak.position.y = 0.23; tBody.add(cloak);
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.03, 5, 12), scarfM); scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.43; tBody.add(scarf);
    const tHead = new THREE.Group(); tHead.position.y = 0.55; tBody.add(tHead);
    tHead.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), lam(0xf4e2d2, { flatShading: false })));
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.135, 0.2, 8), cloakM); hood.position.y = 0.12; tHead.add(hood);
    const eyeG = new THREE.SphereGeometry(0.017, 6, 4), eyeM = new THREE.MeshBasicMaterial({ color: 0x1d2333 });
    [-0.042, 0.042].forEach(x => { const e = new THREE.Mesh(eyeG, eyeM); e.position.set(x, 0.0, 0.108); tHead.add(e) });
    const lantern = new THREE.Group(); lantern.position.set(0.2, 0.24, 0.06); tBody.add(lantern);
    lantern.add(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.02, 0.075), lam(0x3a3f52)));
    const lampCoreM = new THREE.MeshBasicMaterial({ color: 0x9a9aa6 });
    const lampCore = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), lampCoreM); lampCore.position.y = -0.05; lantern.add(lampCore);
    const lampGlow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd27d, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
    lampGlow.position.y = -0.05; lantern.add(lampGlow);
    const cloud = new THREE.Group(); cloud.position.y = 1.0; trav.add(cloud);
    const cloudM = lam(0x8d93a6, { transparent: true, opacity: 1 });
    [[-0.1, 0, 0.09], [0.02, 0.04, 0.12], [0.14, 0, 0.08]].forEach(([x, y, r]) => { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), cloudM); c.position.set(x, y, 0); cloud.add(c) });
    const drops = [0, 1, 2, 3].map(i => { const d = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.008), new THREE.MeshBasicMaterial({ color: 0x9fb7e0, transparent: true })); d.position.x = -0.1 + i * 0.07; cloud.add(d); return d });
    const sparkG = new THREE.SphereGeometry(0.045, 6, 4);
    const sparks = []; // short-lived bursts
    function burst(at, n, color) { if (RM) return; for (let i = 0; i < n; i++) { const m = new THREE.Mesh(sparkG, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.position.copy(at); world.add(m);
      const a = Math.random() * 6.283, e = Math.random() * 1.2; sparks.push({ m, v: new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e) + 0.4, Math.sin(a) * Math.cos(e)).multiplyScalar(1.2 + Math.random()), life: 0, max: 0.8 + Math.random() * 0.5 }) } }

    // positions along the path
    const pathLen = curve.getLength();
    const samples = []; for (let i = 0; i <= 400; i++) samples.push(curve.getPointAt(i / 400));
    const stationU = STATIONS.map(st => { let best = 0, bd = 1e9; samples.forEach((p, i) => { const d = Math.hypot(p.x - st[0], p.z - st[1]); if (d < bd) { bd = d; best = i } }); return best / 400 });
    const restU = i => i < 0 ? 0.01 : i > 2.9 ? 0.995 : i > 2.1 ? 0.86 : Math.max(0.01, stationU[i] - 0.035);
    let travU = 0.01, walk = null, travHeal = 0, travHealGoal = 0, hop = 0, face = 0;
    const tp = new THREE.Vector3(), tp2 = new THREE.Vector3();
    const shoreP = curve.getPointAt(0.01);
    function stageLocal(i, out) {
      if (i === 0) return out.set(shoreP.x, height(shoreP.x, shoreP.z), shoreP.z);
      if (i === 4) return out.copy(lampWorld);
      return out.copy(stations[i - 1].base);
    }
    function placeTrav() { const p = curve.getPointAt(Math.max(0, Math.min(1, travU))); trav.position.set(p.x, height(p.x, p.z), p.z) }
    placeTrav();

    /* ---- labels: real links, positioned over the 3D scene ---- */
    ui.innerHTML = "";
    const MARKS = ["", "1", "2", "3", ""];
    const links = MARKS.map((m, i) => {
      const a = document.createElement("button"); a.type = "button"; a.className = "isle-st" + (i === 0 ? " shore" : i === 4 ? " tower" : "");
      a.innerHTML = '<span class="n"></span><span class="t"></span>'; a.querySelector(".n").textContent = m || (i === 0 ? "\u2693" : "\u2726");
      a.addEventListener("click", () => opts.onSelect && opts.onSelect(i));
      ui.appendChild(a); return a;
    });
    let selected = null;

    /* ---- state ---- */
    let lit = false, day = 0, dayGoal = 0, rotUser = 0, rotVel = 0, dragging = false, lastX = 0, running = false, visible = true, dirty = true;
    let seq = null, t0 = performance.now(), frames = 0, slow = 0, lastFrame = 0, disposed = false;
    let busy = false, fast = false, absorbing = null, healAnim = null;
    let camF = 0, camGoal = 0, camRate = 2, camTarget = null; const lastTgt = new THREE.Vector3(0, 0.75, 0), basePos = new THREE.Vector3(), baseLook = new THREE.Vector3(0, 0.75, 0);
    const v = new THREE.Vector3();
    const dusk = { hemi: C(0xc4cbf0), sunC: C(0xd2ccff), sea: C(0x8ea6d6) }, noon = { hemi: C(0xf2f8ff), sunC: C(0xffedc8), sea: C(0x66b4e0) };

    function size() {
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false);
      const aspect = w / h; camera.aspect = aspect;
      const d = Math.max(22, 7.6 / (Math.tan(16 * Math.PI / 180) * aspect));
      basePos.set(0, 0.75 + d * 0.5, d * 0.86); camera.position.copy(basePos); camera.lookAt(baseLook); camera.updateProjectionMatrix(); dirty = true;
    }
    function applyState() {
      stations.forEach(s => { s.orbM.color.set(s.done ? GOLD : colors[stations.indexOf(s)]) });
      links.forEach((a, i) => { a.classList.toggle("done", i >= 1 && i <= 3 && stations[i - 1].done); a.classList.toggle("sel", selected === i); a.setAttribute("aria-pressed", String(selected === i)) });
      el.classList.toggle("lit", lit);
      lampMat.color.set(lit ? 0xfff6d0 : (stations.every(s => s.done) ? 0xf4d68a : 0x8b9bb8));
      beams.visible = lit; dayGoal = lit ? 1 : 0; dirty = true;
    }
    function frame(now) {
      if (disposed) return;
      running = visible && !document.hidden;
      if (!running) return;
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016); lastFrame = now;
      const t = RM ? 0 : (now - t0) / 1000;
      if (RM && !dirty && !seq && !walk && !absorbing && Math.abs(day - dayGoal) < 0.001) return;      // reduced motion: draw only on change
      dirty = false;
      // adaptive quality for weaker phones
      if (frames < 90) { frames++; if (dt > 0.034) slow++; if (frames === 90 && slow > 45 && pr > 1) { pr = 1; renderer.setPixelRatio(1); size() } }

      if (!dragging) { rotUser += rotVel; rotVel *= 0.92 }
      rotUser = Math.max(-1.3, Math.min(1.3, rotUser));
      world.rotation.y = rotUser + (RM ? 0 : Math.sin(t * 0.16) * (busy ? 0.15 : 0.38));
      day += (dayGoal - day) * (RM ? 1 : Math.min(1, dt * 0.9));
      hemi.color.copy(dusk.hemi).lerp(noon.hemi, day); hemi.intensity = 1.6 + day * 0.3;
      sun.color.copy(dusk.sunC).lerp(noon.sunC, day); sun.intensity = 1.4 + day * 0.55;
      sea.material.color.copy(dusk.sea).lerp(noon.sea, day);
      foam.scale.setScalar(1 + 0.012 * Math.sin(t * 1.4)); foam.material.opacity = 0.45 + 0.12 * Math.sin(t * 1.4);
      sways.forEach((g, i) => { g.rotation.z = 0.03 * Math.sin(t * 1.1 + i) });
      caveGlow.scale.setScalar(1 + 0.25 * Math.sin(t * 2.2));
      stations.forEach((s, i) => {
        s.orb.position.y = 0.72 + 0.07 * Math.sin(t * 1.6 + i * 1.7); s.orb.rotation.y = t * 0.6 + i;
        s.glow.position.y = s.orb.position.y; s.glow.material.opacity = s.done ? 0.28 + 0.12 * Math.sin(t * 2 + i) : 0;
        const ring = s.g.children[0], on = selected === i + 1; ring.scale.setScalar(on ? 1.25 + 0.1 * Math.sin(t * 4) : 1);
      });
      // lighting sequence: orbs fly to the lamp, then the beam starts
      if (seq) {
        const e = (now - seq.t) / 1000; let all = true;
        flyers.forEach((m, i) => {
          const k = Math.max(0, Math.min(1, (e - i * 0.4) / 1.7)); if (k < 1) all = false;
          const s = k * k * (3 - 2 * k); m.visible = k > 0 && k < 1;
          lantern.getWorldPosition(tp); world.worldToLocal(tp);
          m.position.copy(tp).lerp(lampWorld, s); m.position.y += Math.sin(Math.PI * s) * 1.6;
        });
        if (all && !seq.fired) { seq.fired = true; seq.flash = now; lit = true; applyState(); seq.cb && seq.cb() }
        if (seq.fired) { const f = (now - seq.flash) / 1400; halo.scale.setScalar(1 + Math.sin(Math.min(1, f) * Math.PI) * 3); if (f >= 1) { seq = null; halo.scale.setScalar(1) } }
      }
      const glowK = lit ? 1 : 0;
      beamMat.opacity += ((lit ? 0.3 : 0) - beamMat.opacity) * 0.05;
      halo.material.opacity += ((lit ? 0.6 : 0) - halo.material.opacity) * 0.06;
      lampLight.intensity += ((lit ? 5 : 0) - lampLight.intensity) * 0.05;
      if (lit) beams.rotation.y = RM ? 0.6 : t * 0.55;

      // healing: regions regain colour, things grow back
      let painted = false;
      for (let r = 0; r < 3; r++) if (Math.abs(heal[r] - healGoal[r]) > 0.001) { heal[r] = RM || fast ? healGoal[r] : heal[r] + Math.sign(healGoal[r] - heal[r]) * Math.min(Math.abs(healGoal[r] - heal[r]), dt / 2.4); painted = true }
      const nk = Math.max((heal[0] + heal[1] + heal[2]) / 3, day); if (Math.abs(nk - neutralK) > 0.001) { neutralK = nk; painted = true }
      if (painted) {
        paintTerrain(); dirty = true;
        tinted.forEach(o => o.m.color.copy(o.g).lerp(o.b, 0.22 + 0.78 * heal[o.r]));
        growth.forEach((list, r) => list.forEach(g => { const k = Math.max(0, Math.min(1, (heal[r] * 1.6 - g.delay) / 0.45)); g.m.scale.setScalar(Math.max(0.0001, k * g.s)) }));
        if (healAnim && Math.abs(heal[healAnim.r] - healGoal[healAnim.r]) < 0.002) { const h = healAnim; healAnim = null; h.done() }
      }
      growth[1].forEach((g, i) => { g.m.rotation.y = t * 0.4 + i });
      caveGlow.material.color.setRGB(1, 0.82 + 0.1 * heal[1], 0.49 + 0.4 * heal[1]);
      caveGlow.scale.setScalar((1 + 0.25 * Math.sin(t * 2.2)) * (1 + heal[1] * 0.8));

      // traveller: walking, healing, posture
      travHeal += (travHealGoal - travHeal) * (RM || fast ? 1 : Math.min(1, dt * 1.2));
      const th = travHeal;
      if (walk) {
        const dir = Math.sign(walk.to - travU), step = (1.25 / pathLen) * dt;
        if (fast || RM || Math.abs(walk.to - travU) <= step) { travU = walk.to; const w = walk; walk = null; w.done() } else travU += dir * step;
        placeTrav();
        const a = curve.getPointAt(Math.max(0, Math.min(1, travU))), b = curve.getPointAt(Math.max(0, Math.min(1, travU + dir * 0.01)));
        face = Math.atan2(b.x - a.x, b.z - a.z);
      }
      const want = walk ? face : -world.rotation.y;                 // at rest, turn to face the viewer
      let dy = want - trav.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); trav.rotation.y += dy * Math.min(1, dt * 6);
      const walking = !!walk;
      tBody.position.y = walking ? Math.abs(Math.sin(t * 9)) * 0.05 : 0.008 * Math.sin(t * 2);
      if (hop > 0) { hop = Math.max(0, hop - dt); tBody.position.y += Math.abs(Math.sin((1.6 - hop) * Math.PI * 2.5)) * 0.22 }
      tBody.rotation.x = (1 - th) * 0.32; tHead.rotation.x = (1 - th) * 0.25;
      cloakM.color.copy(cloakA).lerp(cloakB, th); scarfM.color.copy(scarfA).lerp(scarfB, th);
      lampCoreM.color.setRGB(0.6 + 0.4 * th, 0.6 + 0.26 * th, 0.65 - 0.14 * th);
      const lg = (0.6 + th * 1.4) * (1 + 0.06 * Math.sin(t * 7));
      lampGlow.scale.setScalar(lg); lampGlow.material.opacity = 0.22 + th * 0.4;
      const cA = Math.max(0, 1 - th * 1.15);
      cloud.visible = cA > 0.02; cloudM.opacity = cA; cloud.scale.setScalar(0.6 + 0.4 * cA); cloud.position.y = 1.0 + 0.03 * Math.sin(t * 1.5);
      drops.forEach((d, i) => { const ph = (t * 1.6 + i * 0.27) % 1; d.position.y = -0.12 - ph * 0.35; d.material.opacity = th < 0.34 ? cA * (1 - ph) : 0 });
      cloud.rotation.y = -trav.rotation.y - world.rotation.y;
      if (walking || hop > 0 || healAnim || absorbing || sparks.length || camF !== camGoal) dirty = true;

      // a spark of light flies from a stop into the lantern
      if (absorbing) {
        const k = Math.min(1, (now - absorbing.t) / (RM || fast ? 1 : 1000)), e = k * k * (3 - 2 * k);
        lantern.getWorldPosition(tp); world.worldToLocal(tp);
        absorbing.m.position.copy(absorbing.from).lerp(tp, e); absorbing.m.position.y += Math.sin(Math.PI * e) * 1.2;
        if (k >= 1) { world.remove(absorbing.m); burst(tp.clone(), 12, 0xffe08a); const a = absorbing; absorbing = null; a.done() }
      }
      for (let i = sparks.length - 1; i >= 0; i--) { const sp = sparks[i]; sp.life += dt; if (sp.life > sp.max) { world.remove(sp.m); sparks.splice(i, 1); continue }
        sp.v.y -= dt * 2.2; sp.m.position.addScaledVector(sp.v, dt); sp.m.material.opacity = 1 - sp.life / sp.max }

      // camera: pull in towards the traveller, a stop or the tower during story scenes
      if (RM || fast) camF = camGoal; else camF += (camGoal - camF) * Math.min(1, dt * camRate);
      if (Math.abs(camF - camGoal) < 0.0005) camF = camGoal;
      if (camTarget === "trav") { trav.getWorldPosition(tp2); tp2.y += 0.55 } else if (camTarget === "tower") { tp2.copy(lampWorld); world.localToWorld(tp2) }
      else if (typeof camTarget === "number") { stageLocal(camTarget, tp2); if (camTarget === 4) tp2.y -= 1.8; world.localToWorld(tp2) }
      if (camTarget !== null) lastTgt.copy(tp2);
      const ef = camF * camF * (3 - 2 * camF);
      tp.copy(basePos).sub(baseLook).normalize().multiplyScalar(7).add(lastTgt);
      camera.position.copy(basePos).lerp(tp, ef); tp.copy(baseLook).lerp(lastTgt, ef); camera.lookAt(tp);
      renderer.render(scene, camera);
      // place the links over their stations
      const w = el.clientWidth, h = el.clientHeight;
      for (let i = 0; i < 5; i++) {
        stageLocal(i, v); v.y += i === 4 ? 0.45 : i === 0 ? 0.35 : 0.45; world.localToWorld(v); v.project(camera);
        links[i].style.transform = "translate(" + ((v.x * 0.5 + 0.5) * w).toFixed(1) + "px," + ((-v.y * 0.5 + 0.5) * h).toFixed(1) + "px) translate(-50%,-100%)";
      }
      void glowK;
    }
    function kick() { if (!running && !disposed) { running = true; lastFrame = performance.now(); requestAnimationFrame(frame) } }

    /* ---- input: drag sideways to turn the island (optional) ---- */
    let downX = 0, downY = 0, moved = 0;
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    canvas.addEventListener("pointerdown", e => { dragging = true; lastX = e.clientX; downX = e.clientX; downY = e.clientY; moved = 0; rotVel = 0; try { canvas.setPointerCapture(e.pointerId) } catch (x) { } });
    canvas.addEventListener("pointerup", e => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6 || !opts.onSelect) return;
      const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (ray.intersectObject(tower, true).length) { opts.onSelect(4); return }
      const hit = ray.intersectObject(terrain, false)[0]; if (!hit) return;
      const rg = reg[hit.faceIndex * 3], p = world.worldToLocal(hit.point.clone());
      if (rg >= 0) opts.onSelect(rg + 1);
      else opts.onSelect(Math.hypot(p.x - PEAK[0], p.z - PEAK[1]) < 2.2 ? 4 : 0);
    });
    canvas.addEventListener("pointermove", e => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; rotUser += dx * 0.006; rotVel = dx * 0.006; dirty = true; kick() });
    ["pointerup", "pointercancel"].forEach(n => canvas.addEventListener(n, () => { dragging = false }));
    const ro = "ResizeObserver" in window ? new ResizeObserver(() => { size(); kick() }) : null; ro && ro.observe(el);
    const io = "IntersectionObserver" in window ? new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick() }) : null; io && io.observe(el);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) kick() });
    canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); disposed = true; opts.onFail && opts.onFail() });

    size(); applyState(); kick();
    const wait = fn => new Promise(res => { fn(res); dirty = true; kick() });
    return {
      update(o) {
        o.done.forEach((d, i) => { stations[i].done = !!d });
        links.forEach((a, i) => { a.querySelector(".t").textContent = o.labels[i]; a.setAttribute("aria-label", o.aria[i]) });
        if (o.selected !== undefined && o.selected !== selected && !busy) this.select(o.selected);
        if (!seq) lit = !!o.lit;
        if (!busy) {                                   // outside story scenes, snap straight to the saved state
          (o.healed || [false, false, false]).forEach((h, r) => { heal[r] = healGoal[r] = h ? 1 : 0 });
          travHeal = travHealGoal = o.travHeal || 0;
          if (o.rest != null) { travU = restU(o.rest); placeTrav() }
          neutralK = -1;
        }
        applyState(); kick();
      },
      busy(b) { busy = !!b; if (!b) fast = false; dirty = true; kick() },
      select(i) { selected = i; if (i == null) { camGoal = 0; camRate = 2.2 } else { camTarget = i; camGoal = window.innerWidth < 640 ? 0.32 : 0.42; camRate = 2.4 } applyState(); kick() },
      fast(b) { fast = !!b; dirty = true; kick() },
      place(i) { travU = restU(i); placeTrav(); dirty = true; kick() },
      walkTo(i) { const to = restU(i); if (fast || RM || Math.abs(to - travU) < 1e-4) { travU = to; placeTrav(); dirty = true; kick(); return Promise.resolve() } return wait(done => { walk = { to, done } }) },
      focus(target, amount, ms) { camTarget = target; camGoal = amount; camRate = 3 / Math.max(0.2, (ms || 1500) / 1000); if (!ms) camF = amount; dirty = true; kick() },
      absorb(i) { if (fast || RM) return Promise.resolve(); return wait(done => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a })); world.add(m); absorbing = { m, from: stations[i].base.clone(), t: performance.now(), done } }) },
      healRegion(i) { healGoal[i] = 1; if (fast || RM) { heal[i] = 1; neutralK = -1; dirty = true; kick(); return Promise.resolve() } return wait(done => { healAnim = { r: i, done } }) },
      setHeal(v) { travHealGoal = v; if (fast || RM) travHeal = v; dirty = true; kick() },
      celebrate() { hop = 1.6; trav.getWorldPosition(tp); world.worldToLocal(tp); tp.y += 0.9; burst(tp.clone(), 26, 0xfff1bd); dirty = true; kick() },
      light(cb) {
        if (lit) { cb && cb(); return }
        if (RM) { lit = true; applyState(); kick(); cb && cb(); return }
        seq = { t: performance.now(), cb }; dirty = true; kick();
      }
    };
  }
  window.OdysseyIsland = { mount };
})();
