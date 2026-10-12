/* OneClick · vehicle visuals
   1) OC.vehicleArt(type, color)  -> inline SVG side-profile illustration (SUV / single cab / double cab / van)
   2) OC.car3d.mount(canvas, opts) -> low-poly 3D model (extruded profiles + wheels) with flat shading,
      auto-rotation and drag-to-rotate. Canvas 2D only, no libraries, works offline. */
window.OC = window.OC || {};
(function (OC) {
  'use strict';
  let gid = 0;
  const TYPE_ALIAS = { suv: 'suv', singlecab: 'single', pickup: 'single', truck: 'single', doublecab: 'double', van: 'van', bus: 'van', forklift: 'van', other: 'van' };
  const kind = t => TYPE_ALIAS[t] || 'van';

  /* ---------- side-profile geometry (320 x 150 box, ground at y=112, car faces right) ---------- */
  const PROFILES = {
    suv: {
      body: 'M28,112 L28,76 Q28,66 33,62 L37,47 Q39,40 47,40 L196,38 Q210,38 220,44 L254,64 Q262,68 274,69 L290,70 Q300,72 300,84 L300,104 Q300,112 292,112 Z',
      glass: ['M50,48 L98,47 L98,66 L45,66 Z', 'M106,47 L150,46 L150,66 L106,66 Z', 'M158,46 L198,45 L236,66 L158,66 Z', 'M207,45 L217,45 L257,66 L247,66 Z'],
      wheels: [[75, 112], [245, 112]], wr: 21, arch: 26,
      details: [['rail', 56, 36, 136], ['handle', 118, 78], ['handle', 170, 78], ['mirror', 204, 60], ['step', 96, 104, 126], ['head', 288, 74, 10, 7], ['tail', 28, 72, 6, 12]],
      model: { body: [[28, 112], [28, 72], [33, 66], [258, 66], [292, 70], [300, 84], [300, 104], [292, 112]], belt: 66, cabin: [[44, 66], [46, 46], [54, 41], [198, 40], [214, 44], [250, 66]], bed: null, pillars: [100, 156], roof: 43, front: { x: 300, y0: 84, y1: 92 }, grille: [94, 102], rear: { x: 28, y0: 72, y1: 84 } }
    },
    single: {
      body: 'M26,112 L26,60 Q26,56 30,56 L134,56 L134,46 Q134,40 142,40 L186,38 Q196,38 204,44 L232,60 L276,60 Q298,60 299,72 L300,104 Q300,112 292,112 Z',
      glass: ['M142,46 L184,45 L208,57 L142,57 Z', 'M194,45 L204,45 L238,60 L228,60 Z'],
      wheels: [[72, 112], [248, 112]], wr: 22, arch: 27,
      details: [['seam', 34, 58, 110], ['seam', 136, 44, 112], ['handle', 160, 72], ['mirror', 200, 52], ['step', 140, 104, 70], ['head', 284, 64, 13, 8], ['tail', 26, 60, 6, 14], ['grille', 290, 68, 10, 30], ['bedline', 40, 62, 90]],
      model: { body: [[26, 112], [26, 56], [134, 56], [232, 56], [276, 60], [299, 72], [300, 104], [292, 112]], belt: 56, cabin: [[138, 56], [140, 44], [146, 40], [188, 38], [204, 44], [232, 56]], bed: [30, 130], pillars: [], roof: 41, front: { x: 300, y0: 74, y1: 84 }, grille: [87, 100], rear: { x: 26, y0: 60, y1: 74 } }
    },
    double: {
      body: 'M26,112 L26,60 Q26,56 30,56 L96,56 L96,46 Q96,40 104,40 L190,38 Q200,38 208,44 L236,60 L276,60 Q298,60 299,72 L300,104 Q300,112 292,112 Z',
      glass: ['M104,46 L142,45 L142,57 L104,57 Z', 'M150,45 L188,44 L212,57 L150,57 Z', 'M198,45 L208,45 L242,60 L232,60 Z'],
      wheels: [[66, 112], [250, 112]], wr: 22, arch: 27,
      details: [['seam', 34, 58, 72], ['seam', 98, 44, 112], ['handle', 118, 72], ['handle', 166, 72], ['mirror', 204, 52], ['step', 102, 104, 110], ['head', 284, 64, 13, 8], ['tail', 26, 60, 6, 14], ['grille', 290, 68, 10, 30], ['bedline', 40, 62, 52]],
      model: { body: [[26, 112], [26, 56], [96, 56], [236, 56], [276, 60], [299, 72], [300, 104], [292, 112]], belt: 56, cabin: [[100, 56], [102, 44], [108, 40], [192, 38], [208, 44], [236, 56]], bed: [30, 92], pillars: [146], roof: 41, front: { x: 300, y0: 74, y1: 84 }, grille: [87, 100], rear: { x: 26, y0: 60, y1: 74 } }
    },
    van: {
      body: 'M26,112 L26,44 Q26,36 34,36 L230,36 Q244,36 252,46 L286,70 Q300,74 300,86 L300,104 Q300,112 292,112 Z',
      glass: ['M150,42 L230,42 L250,64 L150,64 Z', 'M240,42 L252,42 L286,68 L272,68 Z'],
      wheels: [[72, 112], [246, 112]], wr: 21, arch: 26,
      details: [['seam', 140, 40, 70], ['handle', 160, 76], ['mirror', 236, 54], ['head', 288, 76, 10, 7], ['tail', 26, 46, 6, 16]],
      model: { body: [[26, 112], [26, 70], [286, 70], [300, 86], [300, 104], [292, 112]], belt: 70, cabin: [[26, 70], [26, 44], [34, 36], [232, 36], [252, 46], [286, 70]], bed: null, pillars: [140], roof: 39, front: { x: 300, y0: 88, y1: 95 }, grille: [97, 103], rear: { x: 26, y0: 46, y1: 62 } }
    }
  };

  const hex = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#e8ecef';
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const shade = (h, k) => { const [r, g, b] = rgb(h); const f = v => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)))); return `rgb(${f(r)},${f(g)},${f(b)})`; };

  /* ---------- SVG illustration ---------- */
  OC.vehicleArt = (type, color) => {
    const P = PROFILES[kind(type)], c = hex(color), id = 'va' + (++gid);
    const det = P.details.map(d => {
      switch (d[0]) {
        case 'rail': return `<rect x="${d[1]}" y="${d[2]}" width="${d[3]}" height="3" rx="1.5" fill="#2b3238"/>`;
        case 'handle': return `<rect x="${d[1]}" y="${d[2]}" width="12" height="3.5" rx="1.75" fill="rgba(0,0,0,.35)"/>`;
        case 'mirror': return `<path d="M${d[1]},${d[2]} h8 v7 h-8 z" fill="url(#${id}b)" stroke="rgba(0,0,0,.25)" stroke-width=".8"/>`;
        case 'step': return `<rect x="${d[1]}" y="${d[2]}" width="${d[3]}" height="5" rx="2.5" fill="#1d2228"/>`;
        case 'head': return `<rect x="${d[1]}" y="${d[2]}" width="${d[3]}" height="${d[4]}" rx="2" fill="#fff6c7" stroke="rgba(0,0,0,.2)" stroke-width=".6"/>`;
        case 'tail': return `<rect x="${d[1]}" y="${d[2]}" width="${d[3]}" height="${d[4]}" rx="1.5" fill="#e2403a"/>`;
        case 'grille': return `<rect x="${d[1]}" y="${d[2]}" width="${d[3]}" height="${d[4]}" rx="2" fill="#1a1f24"/><path d="M${d[1] + 2},${d[2] + 6} h${d[3] - 4} M${d[1] + 2},${d[2] + 14} h${d[3] - 4} M${d[1] + 2},${d[2] + 22} h${d[3] - 4}" stroke="#3a424a" stroke-width="1.5"/>`;
        case 'seam': return `<path d="M${d[1]},${d[2]} v${d[3] - d[2]}" stroke="rgba(0,0,0,.28)" stroke-width="1.2"/>`;
        case 'bedline': return `<rect x="${d[1]}" y="${d[2]}" width="${d[3]}" height="3" rx="1.5" fill="rgba(0,0,0,.22)"/>`;
        default: return '';
      }
    }).join('');
    const wheels = P.wheels.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${P.arch}" fill="#0c1115"/>
      <circle cx="${x}" cy="${y}" r="${P.wr}" fill="#15191d" stroke="#0a0d10" stroke-width="1"/>
      <circle cx="${x}" cy="${y}" r="${P.wr * .58}" fill="url(#${id}r)" stroke="#5c646d" stroke-width="1"/>
      ${[0, 60, 120, 180, 240, 300].map(a => `<path d="M${x},${y} l${(P.wr * .5 * Math.cos(a * Math.PI / 180)).toFixed(1)},${(P.wr * .5 * Math.sin(a * Math.PI / 180)).toFixed(1)}" stroke="#7b848d" stroke-width="2.4" stroke-linecap="round"/>`).join('')}
      <circle cx="${x}" cy="${y}" r="${P.wr * .16}" fill="#9aa3ad"/>`).join('');
    return `<svg viewBox="0 0 320 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity=".05"/><stop offset=".7" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></linearGradient>
        <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5f8c9c"/><stop offset=".35" stop-color="#1d3843"/><stop offset="1" stop-color="#0b171d"/></linearGradient>
        <radialGradient id="${id}r" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#d6dbe0"/><stop offset="1" stop-color="#6c747c"/></radialGradient>
        <radialGradient id="${id}s" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      </defs>
      <ellipse cx="163" cy="124" rx="150" ry="9" fill="url(#${id}s)"/>
      <path d="${P.body}" fill="${c}"/><path d="${P.body}" fill="url(#${id}b)" stroke="rgba(0,0,0,.35)" stroke-width="1"/>
      <path d="M30,106 L298,106 L298,112 L30,112 Z" fill="rgba(0,0,0,.28)"/>
      ${P.glass.map(g => `<path d="${g}" fill="url(#${id}g)" stroke="rgba(0,0,0,.4)" stroke-width=".8"/><path d="${g}" fill="url(#${id}b)" opacity=".35"/>`).join('')}
      ${det}${wheels}
    </svg>`;
  };

  /* ---------- low-poly 3D model ---------- */
  function buildModel(type, color) {
    const P = PROFILES[kind(type)].model, c = hex(color);
    const faces = []; // {pts:[[x,y,z]...], color, kind}
    const prism = (profile, hw, colorFn, skipEdge) => {
      const pts = profile.map(([x, y]) => [x - 163, y - 76]);
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      faces.push({ pts: pts.map(p => [p[0], p[1], hw]), color: colorFn('side', pts), n0: [0, 0, 1], center: [cx, cy, 0] });
      faces.push({ pts: pts.map(p => [p[0], p[1], -hw]), color: colorFn('side', pts), n0: [0, 0, -1], center: [cx, cy, 0] });
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if (skipEdge && skipEdge(a, b)) continue;
        const ex = b[0] - a[0], ey = b[1] - a[1]; const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        let n = [ey, -ex, 0]; if (n[0] * (mx - cx) + n[1] * (my - cy) < 0) n = [-n[0], -n[1], 0];
        const len = Math.hypot(n[0], n[1]) || 1; n = [n[0] / len, n[1] / len, 0];
        faces.push({ pts: [[a[0], a[1], hw], [b[0], b[1], hw], [b[0], b[1], -hw], [a[0], a[1], -hw]], color: colorFn(n[1] < -.93 ? 'top' : n[1] > .6 ? 'bottom' : 'wall', [a, b], mx + 163), n0: n, center: [cx, cy, 0] });
      }
    };
    const HW = 52;
    prism(P.body, HW, (k, e, mx) => k === 'top' && P.bed && mx > P.bed[0] && mx < P.bed[1] ? '#353b42' : k === 'bottom' ? '#14181c' : c);
    if (P.cabin) prism(P.cabin, HW * .86, k => k === 'top' ? c : '#35606f', (a, b) => a[1] === P.belt - 76 && b[1] === P.belt - 76);
    // trim: body-colored pillars over the glass band, headlights, grille and tail lights
    const quad = (pts, color, n0) => faces.push({ pts, color, n0, decal: true, center: [pts.reduce((a, p) => a + p[0], 0) / 4, pts.reduce((a, p) => a + p[1], 0) / 4, pts.reduce((a, p) => a + p[2], 0) / 4] });
    const HWc = HW * .86;
    (P.pillars || []).forEach(px => { const x = px - 163, y0 = P.belt - 76, y1 = P.roof - 76; [1, -1].forEach(side => { const z = side * (HWc + .4); quad([[x - 3, y0, z], [x + 3, y0, z], [x + 3, y1, z], [x - 3, y1, z]], c, [0, 0, side]); }); });
    if (P.front) {
      const fx = P.front.x - 163 + .6;
      [1, -1].forEach(side => quad([[fx, P.front.y0 - 76, side * (HW - 16)], [fx, P.front.y0 - 76, side * (HW - 4)], [fx, P.front.y1 - 76, side * (HW - 4)], [fx, P.front.y1 - 76, side * (HW - 16)]], '#fff3b0', [1, 0, 0]));
      quad([[fx, P.grille[0] - 76, -HW * .5], [fx, P.grille[0] - 76, HW * .5], [fx, P.grille[1] - 76, HW * .5], [fx, P.grille[1] - 76, -HW * .5]], '#1a1f24', [1, 0, 0]);
      const rx = P.rear.x - 163 - .6;
      [1, -1].forEach(side => quad([[rx, P.rear.y0 - 76, side * (HW - 12)], [rx, P.rear.y0 - 76, side * (HW - 3)], [rx, P.rear.y1 - 76, side * (HW - 3)], [rx, P.rear.y1 - 76, side * (HW - 12)]], '#d9342b', [-1, 0, 0]));
    }
    // wheels: cylinders protruding slightly from each side, plus dark arches on the body sides
    const WP = PROFILES[kind(type)]; const SEG = 18;
    WP.wheels.forEach(([wx, wy]) => {
      [1, -1].forEach(side => {
        const z0 = side * (HW + 1), z1 = side * (HW + 7), x = wx - 163, y = wy - 76, r = WP.wr + 1;
        const ring = i => { const a = i / SEG * Math.PI * 2; return [x + r * Math.cos(a), y + r * Math.sin(a)]; };
        faces.push({ pts: Array.from({ length: SEG }, (_, i) => { const p = ring(i); return [p[0], p[1] + 0, z0 + side * .5]; }).map(p => p), color: '#0d1114', n0: [0, 0, side], center: [x, y, z0], arch: WP.arch + 2, ax: x, ay: y, decal: true });
        for (let i = 0; i < SEG; i++) { const a = ring(i), b = ring(i + 1); const nx = Math.cos((i + .5) / SEG * Math.PI * 2), ny = Math.sin((i + .5) / SEG * Math.PI * 2); faces.push({ pts: [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], color: '#1b1f24', n0: [nx, ny, 0], center: [x, y, (z0 + z1) / 2] }); }
        faces.push({ pts: Array.from({ length: SEG }, (_, i) => { const p = ring(i); return [p[0], p[1], z1]; }), color: '#20252b', n0: [0, 0, side], center: [x, y, z1] });
        const rr = r * .6; faces.push({ pts: Array.from({ length: SEG }, (_, i) => { const a = i / SEG * Math.PI * 2; return [x + rr * Math.cos(a), y + rr * Math.sin(a), z1 + side * .6]; }), color: '#aeb6bf', n0: [0, 0, side], center: [x, y, z1 + side], decal: true });
        const hr = r * .18; faces.push({ pts: Array.from({ length: 10 }, (_, i) => { const a = i / 10 * Math.PI * 2; return [x + hr * Math.cos(a), y + hr * Math.sin(a), z1 + side * 1.2]; }), color: '#e4e8ec', n0: [0, 0, side], center: [x, y, z1 + side], decal: 2 });
      });
    });
    // arches as flat dark discs on the body sides (drawn via the first wheel face per side, enlarged)
    faces.forEach(f => { if (f.arch) { const SEGA = 18; f.pts = Array.from({ length: SEGA }, (_, i) => { const a = i / SEGA * Math.PI * 2; return [f.ax + f.arch * Math.cos(a), f.ay + f.arch * Math.sin(a), f.pts[0][2]]; }); } });
    return { faces, ground: 112 - 76 + 2 };
  }

  OC.car3d = {
    mount(canvas, opts = {}) {
      const ctx = canvas.getContext('2d');
      const model = buildModel(opts.type, opts.color);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let yaw = .7, pitch = .36, auto = !reduced, raf = 0, W = 0, H = 0, DPR = 1, dragging = false, lx = 0, ly = 0, last = 0, idleT = 0;
      const L = (() => { const v = [-.45, -.75, -.5]; const n = Math.hypot(...v); return v.map(x => x / n); })();
      const rot = (p, cy, sy, cp, sp) => { const x = p[0] * cy + p[2] * sy, z = -p[0] * sy + p[2] * cy; const y = p[1] * cp - z * sp, z2 = p[1] * sp + z * cp; return [x, y, z2]; };
      function resize() { DPR = Math.min(2, window.devicePixelRatio || 1); W = canvas.clientWidth || 560; H = canvas.clientHeight || Math.round(W * .625); canvas.width = W * DPR; canvas.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
      function draw(now) {
        if (auto && !dragging) yaw += .0045 * Math.min(40, now - (last || now)); last = now;
        ctx.clearRect(0, 0, W, H);
        const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
        const D = 980, F = Math.min(W, H * 1.6) * 2.45, cxs = W / 2, cys = H * .55;
        const proj = p => { const s = F / (D + p[2]); return [cxs + p[0] * s, cys + p[1] * s, s]; };
        // ground shadow
        const g = model.ground; const corners = [[-150, g, -75], [150, g, -75], [150, g, 75], [-150, g, 75]].map(p => proj(rot(p, cy, sy, cp, sp)));
        const gx = corners.reduce((s, p) => s + p[0], 0) / 4, gy = corners.reduce((s, p) => s + p[1], 0) / 4;
        const rx = Math.max(...corners.map(p => Math.abs(p[0] - gx))) * .92, ry = Math.max(8, Math.max(...corners.map(p => Math.abs(p[1] - gy))) * .9);
        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, rx); grad.addColorStop(0, 'rgba(0,0,0,.42)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save(); ctx.translate(gx, gy); ctx.scale(1, ry / rx); ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        // faces
        const list = [];
        for (const f of model.faces) {
          const n = rot(f.n0, cy, sy, cp, sp); const c = rot(f.center, cy, sy, cp, sp);
          const view = [c[0], c[1], c[2] + D]; // camera at origin looking +z
          if (n[0] * view[0] + n[1] * view[1] + n[2] * view[2] > 0) continue; // back-face
          const pts = f.pts.map(p => rot(p, cy, sy, cp, sp));
          const depth = pts.reduce((s, p) => s + p[2], 0) / pts.length - (f.decal ? 40 * f.decal : 0);
          const lit = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
          list.push({ f, pts: pts.map(proj), depth, lit });
        }
        list.sort((a, b) => b.depth - a.depth);
        for (const it of list) {
          const k = .5 + .55 * it.lit; const base = it.f.color.startsWith('#') ? rgb(it.f.color) : [120, 120, 120];
          const col = `rgb(${Math.round(base[0] * k)},${Math.round(base[1] * k)},${Math.round(base[2] * k)})`;
          ctx.beginPath(); it.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
          ctx.fillStyle = col; ctx.fill(); ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = .8; ctx.stroke();
        }
        raf = requestAnimationFrame(draw);
      }
      const down = e => { dragging = true; auto = false; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); clearTimeout(idleT); };
      const move = e => { if (!dragging) return; yaw += (e.clientX - lx) * .012; pitch = Math.max(.05, Math.min(1.1, pitch + (e.clientY - ly) * .008)); lx = e.clientX; ly = e.clientY; };
      const up = () => { dragging = false; clearTimeout(idleT); idleT = setTimeout(() => { auto = !reduced; }, 2500); };
      canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      window.addEventListener('resize', resize);
      resize(); raf = requestAnimationFrame(draw);
      return { destroy() { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); clearTimeout(idleT); }, setColor(c) { const m = buildModel(opts.type, c); model.faces = m.faces; } };
    }
  };
  OC.vehicleKind = kind;
})(window.OC);
