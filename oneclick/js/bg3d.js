/* OneClick · animated 3D background
   A perspective-projected particle field with a plexus web and slowly tumbling wireframe solids,
   rendered with Canvas 2D (no dependencies, works offline and over file://). Camera eases toward the pointer. */
window.OC = window.OC || {};
(function (OC) {
  'use strict';
  const canvas = document.getElementById('bg3d');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, DPR = 1, raf = 0, running = false, t0 = performance.now();
  const FOV = 720, DEPTH = 900;
  const cam = { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0 };
  let theme = { line: '52,211,153', dot: '220,255,240', edge: '134,239,172', alpha: 1 };

  /* ----- particles ----- */
  const pts = [];
  function seedParticles() {
    pts.length = 0;
    const n = Math.round(Math.min(190, Math.max(70, (W * H) / 9000)));
    for (let i = 0; i < n; i++) pts.push({
      x: (Math.random() - .5) * W * 1.6, y: (Math.random() - .5) * H * 1.6, z: Math.random() * DEPTH - DEPTH / 2,
      vx: (Math.random() - .5) * .18, vy: (Math.random() - .5) * .18, vz: (Math.random() - .5) * .25,
      r: 1 + Math.random() * 1.8, tw: Math.random() * Math.PI * 2
    });
  }

  /* ----- wireframe solids ----- */
  function icosahedron() {
    const t = (1 + Math.sqrt(5)) / 2, v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const e = new Set(); f.forEach(([a, b, c]) => [[a, b], [b, c], [c, a]].forEach(([p, q]) => e.add(p < q ? p + '-' + q : q + '-' + p)));
    return { v: v.map(p => p.map(c => c / Math.sqrt(1 + t * t))), e: [...e].map(s => s.split('-').map(Number)) };
  }
  function cube() { const v = []; for (let i = 0; i < 8; i++) v.push([(i & 1 ? 1 : -1) * .72, (i & 2 ? 1 : -1) * .72, (i & 4 ? 1 : -1) * .72]); const e = []; for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) { const d = (i ^ j); if (d === 1 || d === 2 || d === 4) e.push([i, j]); } return { v, e }; }
  function octahedron() { return { v: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], e: [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [2, 5], [3, 4], [3, 5]] }; }
  function torusKnotish() { /* a ring of points, drawn as a loop */ const v = [], e = [], n = 28; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; v.push([Math.cos(a), Math.sin(a) * .35 + Math.sin(a * 3) * .18, Math.sin(a)]); e.push([i, (i + 1) % n]); } return { v, e }; }
  const solids = [];
  function seedSolids() {
    solids.length = 0;
    const defs = [
      { g: icosahedron(), s: 150, p: [.34, -.22, 120], spin: [.00013, .00021, .00007] },
      { g: cube(), s: 95, p: [-.36, .26, 240], spin: [.00019, -.00011, .00016] },
      { g: octahedron(), s: 80, p: [.12, .36, -60], spin: [-.00016, .00024, .0001] },
      { g: torusKnotish(), s: 120, p: [-.3, -.3, -180], spin: [.00009, .00014, -.00012] }
    ];
    defs.forEach((d, i) => solids.push({ g: d.g, s: d.s * (W < 700 ? .7 : 1), px: d.p[0] * W, py: d.p[1] * H, pz: d.p[2], rot: [i * .7, i * 1.1, i * .4], spin: d.spin, drift: i * 1.3 }));
  }

  /* ----- math ----- */
  function rot(p, ax, ay, az) {
    let [x, y, z] = p;
    let c = Math.cos(ax), s = Math.sin(ax); let y1 = y * c - z * s, z1 = y * s + z * c; y = y1; z = z1;
    c = Math.cos(ay); s = Math.sin(ay); let x1 = x * c + z * s; z1 = -x * s + z * c; x = x1; z = z1;
    c = Math.cos(az); s = Math.sin(az); x1 = x * c - y * s; y1 = x * s + y * c; x = x1; y = y1;
    return [x, y, z];
  }
  function project(x, y, z) {
    const [cx, cy, cz] = rot([x, y, z], cam.pitch, cam.yaw, 0);
    const s = FOV / (FOV + cz + DEPTH / 2);
    return { x: W / 2 + cx * s, y: H / 2 + cy * s, s, z: cz };
  }

  /* ----- resize ----- */
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    seedParticles(); seedSolids();
    if (!running) draw(performance.now());
  }

  /* ----- draw ----- */
  function draw(now) {
    const dt = Math.min(50, now - t0); t0 = now;
    ctx.clearRect(0, 0, W, H);
    cam.yaw += (cam.tYaw - cam.yaw) * .04; cam.pitch += (cam.tPitch - cam.pitch) * .04;
    const A = theme.alpha;

    // particles: move + wrap
    const proj = new Array(pts.length);
    const LX = W * .8, LY = H * .8, LZ = DEPTH / 2;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.tw += .0012 * dt;
      if (p.x > LX) p.x = -LX; else if (p.x < -LX) p.x = LX;
      if (p.y > LY) p.y = -LY; else if (p.y < -LY) p.y = LY;
      if (p.z > LZ) p.z = -LZ; else if (p.z < -LZ) p.z = LZ;
      proj[i] = project(p.x, p.y, p.z);
    }
    // plexus lines
    const LINK = Math.min(170, 110 + W / 14), LINK2 = LINK * LINK;
    ctx.lineWidth = 1;
    for (let i = 0; i < pts.length; i++) {
      const a = proj[i]; if (a.x < -50 || a.x > W + 50 || a.y < -50 || a.y > H + 50) continue;
      for (let j = i + 1; j < pts.length; j++) {
        const b = proj[j]; const dx = a.x - b.x, dy = a.y - b.y; const d2 = dx * dx + dy * dy;
        if (d2 > LINK2) continue;
        const depth = (a.s + b.s) / 2;
        const al = (1 - d2 / LINK2) * .34 * Math.min(1, depth) * A;
        if (al < .015) continue;
        ctx.strokeStyle = `rgba(${theme.line},${al.toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    // dots
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = proj[i]; if (q.x < -10 || q.x > W + 10 || q.y < -10 || q.y > H + 10) continue;
      const r = p.r * q.s * 1.6; const al = (.35 + .35 * Math.sin(p.tw)) * Math.min(1, q.s + .2) * A;
      ctx.fillStyle = `rgba(${theme.dot},${al.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(.6, r), 0, Math.PI * 2); ctx.fill();
      if (r > 1.9) { ctx.fillStyle = `rgba(${theme.line},${(al * .35).toFixed(3)})`; ctx.beginPath(); ctx.arc(q.x, q.y, r * 3, 0, Math.PI * 2); ctx.fill(); }
    }
    // solids
    for (const s of solids) {
      s.rot[0] += s.spin[0] * dt; s.rot[1] += s.spin[1] * dt; s.rot[2] += s.spin[2] * dt;
      const bob = Math.sin(now * .00035 + s.drift) * 18;
      const vp = s.g.v.map(v => { const r = rot(v, s.rot[0], s.rot[1], s.rot[2]); return project(r[0] * s.s + s.px, r[1] * s.s + s.py + bob, r[2] * s.s + s.pz); });
      ctx.lineWidth = 1.2;
      for (const [a, b] of s.g.e) {
        const p = vp[a], q = vp[b]; const depth = (p.s + q.s) / 2; const al = (.08 + .32 * Math.max(0, depth - .45)) * A;
        ctx.strokeStyle = `rgba(${theme.edge},${al.toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
      for (const p of vp) { ctx.fillStyle = `rgba(${theme.dot},${(.5 * p.s * A).toFixed(3)})`; ctx.beginPath(); ctx.arc(p.x, p.y, 1.6 * p.s, 0, Math.PI * 2); ctx.fill(); }
    }
    if (running) raf = requestAnimationFrame(draw);
  }

  function start() { if (running || reduced || document.body.dataset.bg === 'minimal') return; running = true; t0 = performance.now(); raf = requestAnimationFrame(draw); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  /* ----- events ----- */
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pointermove', e => { cam.tYaw = ((e.clientX / W) - .5) * .22; cam.tPitch = ((e.clientY / H) - .5) * .16; }, { passive: true });
  window.addEventListener('deviceorientation', e => { if (e.gamma == null) return; cam.tYaw = Math.max(-.25, Math.min(.25, e.gamma / 180)); cam.tPitch = Math.max(-.2, Math.min(.2, (e.beta - 45) / 220)); }, { passive: true });
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());

  OC.bg = {
    setTheme(name) {
      theme = name === 'light'
        ? { line: '5,150,105', dot: '4,120,87', edge: '5,150,105', alpha: .75 }
        : { line: '52,211,153', dot: '220,255,240', edge: '134,239,172', alpha: 1 };
      if (!running) draw(performance.now());
    },
    setMode(mode) { if (document.body.dataset.bg === mode) return; document.body.dataset.bg = mode; if (mode === 'minimal') { stop(); ctx.clearRect(0, 0, W, H); } else { resize(); start(); } },
    start, stop
  };
  resize(); start();
})(window.OC);
