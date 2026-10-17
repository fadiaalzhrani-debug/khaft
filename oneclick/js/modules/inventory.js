/* OneClick · Inventory: hundreds of thousands of items imported from Excel.
   Virtual list (only visible rows are in the DOM), multi-word search, category / alert filters,
   column sorting, item details with edit / prev / next, quick +/- quantity, Excel import & export. */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon;
  const S = () => OC.inv.st, role = r => OC.inv.role(r);
  const ROW_H = 50;
  const st = { q: '', cat: 'all', alerts: false, sort: null, scroll: 0, restoreKey: '', loading: false, progress: 0, tab: 'dash' };
  const dash = { ver: -1, data: null };
  const view = { sig: '', idx: [], hay: null, hayVer: -1, cats: null, catsVer: -1 };
  let vl = null;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const normQ = s => String(s).toLowerCase().replace(/[٠-٩۰-۹]/g, d => String(d.charCodeAt(0) & 0xF)).replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  const shown = v => (v === '' || v == null) ? '—' : String(v);
  const levelPill = l => l ? OC.pill(l === 'out' ? 'crit' : l === 'low' ? 'warn' : 'good', t('inventory.l.' + l), l === 'ok' ? 'check' : 'alert') : '';

  /* ---------- derived data ---------- */
  function displayCols() {
    const s = S(), saved = OC.db.settings.invCols;
    let cols = Array.isArray(saved) ? saved.map(n => s.columns.indexOf(n)).filter(i => i >= 0) : [];
    if (!cols.length) cols = [...new Set(['code', 'name', 'category', 'location', 'qty', 'min', 'unit'].map(role).filter(i => i >= 0))];
    if (!cols.length) cols = s.columns.slice(0, 7).map((_, i) => i);
    return cols;
  }
  function hay() {
    const s = S();
    if (view.hay && view.hayVer === s.version) return view.hay;
    const h = new Array(s.rows.length);
    for (let i = 0; i < s.rows.length; i++) { const r = s.rows[i]; h[i] = r ? normQ(r.join('\u0001')) : ''; }
    view.hay = h; view.hayVer = s.version; return h;
  }
  function categories() {
    const s = S(); if (view.cats && view.catsVer === s.version) return view.cats;
    const ci = role('category'); const set = new Set();
    if (ci >= 0) for (const r of s.rows) if (r && r[ci] !== '' && r[ci] != null) set.add(String(r[ci]));
    view.cats = [...set].sort(collator.compare); view.catsVer = s.version; return view.cats;
  }
  const filterKey = () => [st.q, st.cat, st.alerts, st.sort ? st.sort.c + ':' + st.sort.dir : ''].join('|');
  function computeView() {
    const s = S(), sig = s.version + '|' + filterKey();
    if (sig === view.sig) return view.idx;
    const terms = normQ(st.q).split(/\s+/).filter(Boolean), ci = role('category'), h = terms.length ? hay() : null, out = [];
    for (let i = 0; i < s.rows.length; i++) {
      const r = s.rows[i]; if (!r) continue;
      if (st.cat !== 'all' && String(r[ci] == null ? '' : r[ci]) !== st.cat) continue;
      if (st.alerts) { const l = OC.inv.level(r); if (l !== 'low' && l !== 'out') continue; }
      if (h) { const x = h[i]; let ok = true; for (let k = 0; k < terms.length; k++) if (x.indexOf(terms[k]) < 0) { ok = false; break; } if (!ok) continue; }
      out.push(i);
    }
    if (st.sort) sortIdx(out, st.sort.c, st.sort.dir);
    view.sig = sig; view.idx = out; return out;
  }
  function sortIdx(idx, c, dir) {
    const rows = S().rows, keys = new Array(idx.length); let numeric = true;
    for (let k = 0; k < idx.length; k++) { const v = rows[idx[k]][c]; keys[k] = v; if (numeric && v !== '' && v != null && typeof v !== 'number') numeric = false; }
    const order = keys.map((_, k) => k), val = v => (v === '' || v == null) ? -Infinity : v;
    order.sort(numeric ? (a, b) => (dir * (val(keys[a]) - val(keys[b]))) || a - b : (a, b) => (dir * collator.compare(String(keys[a] == null ? '' : keys[a]), String(keys[b] == null ? '' : keys[b]))) || a - b);
    const copy = idx.slice(); for (let k = 0; k < order.length; k++) idx[k] = copy[order[k]];
  }
  /* keep caches valid after an in-place edit of one row */
  function patched(i) { const s = S(); if (view.hay && i < view.hay.length) view.hay[i] = s.rows[i] ? normQ(s.rows[i].join('\u0001')) : ''; else if (view.hay) view.hay.push(s.rows[i] ? normQ(s.rows[i].join('\u0001')) : ''); view.hayVer = s.version; view.sig = s.version + '|' + filterKey(); }
  const titleOf = (r, i) => { const n = role('name'), c = role('code'); return (n >= 0 && r[n] !== '' ? String(r[n]) : c >= 0 && r[c] !== '' ? String(r[c]) : t('inv.itemN', { n: i + 1 })); };

  /* ---------- list rendering ---------- */
  function colTemplate(cols) {
    const n = role('name'), q = role('qty'), c = role('code');
    const parts = cols.map(ci => ci === n ? 'minmax(240px,2.4fr)' : ci === q ? 'minmax(136px,.9fr)' : ci === c ? 'minmax(120px,1fr)' : 'minmax(110px,1fr)');
    if (q >= 0) parts.push('112px');
    const minw = cols.reduce((w, ci) => w + (ci === n ? 240 : ci === q ? 136 : ci === c ? 120 : 110), 0) + (q >= 0 ? 112 : 0) + 24;
    return { tpl: parts.join(' '), minw };
  }
  function cellHtml(ci, r, i) {
    const v = r[ci];
    if (ci === role('qty')) return `<div class="vl-c num"><span class="qty-ctl"><button type="button" data-act="dec" data-i="${i}" aria-label="-1">−</button><b>${esc(shown(v))}</b><button type="button" data-act="inc" data-i="${i}" aria-label="+1">+</button></span></div>`;
    if (ci === role('name')) return `<div class="vl-c strong" title="${esc(shown(v))}">${esc(shown(v))}</div>`;
    if (ci === role('code')) return `<div class="vl-c mono">${esc(shown(v))}</div>`;
    return `<div class="vl-c${typeof v === 'number' ? ' num' : ''}" title="${esc(shown(v))}">${esc(shown(v))}</div>`;
  }
  function rowHtml(i, k, cols) {
    const r = S().rows[i]; if (!r) return '';
    return `<div class="vl-row${k % 2 ? ' alt' : ''}" style="top:${k * ROW_H}px" data-act="detail" data-i="${i}">${cols.map(ci => cellHtml(ci, r, i)).join('')}${role('qty') >= 0 ? `<div class="vl-c">${levelPill(OC.inv.level(r))}</div>` : ''}</div>`;
  }
  function mountList(root) {
    const box = root.querySelector('[data-vl]'); if (!box) { vl = null; return; }
    const body = box.querySelector('.vl-body'), idx = computeView(), cols = displayCols();
    body.style.height = Math.max(1, idx.length * ROW_H) + 'px';
    let raf = 0;
    const paint = () => {
      raf = 0;
      const first = Math.max(0, Math.floor(box.scrollTop / ROW_H) - 8), last = Math.min(idx.length, Math.ceil((box.scrollTop + box.clientHeight) / ROW_H) + 8);
      let html = ''; for (let k = first; k < last; k++) html += rowHtml(idx[k], k, cols);
      body.innerHTML = html;
    };
    box.addEventListener('scroll', () => { st.scroll = box.scrollTop; if (!raf) raf = requestAnimationFrame(paint); }, { passive: true });
    if (st.restoreKey === filterKey()) box.scrollTop = st.scroll; else { st.scroll = 0; st.restoreKey = filterKey(); }
    paint();
    vl = { paint, box, idx: () => view.idx };
  }
  function updateKpis() {
    const s = S().stats, root = document.getElementById('view'); if (!root) return;
    const set = (k, v) => { const el = root.querySelector(`[data-kpi="${k}"]`); if (el) el.textContent = OC.fmtNum(v); };
    set('count', s.count); set('low', s.low); set('out', s.out);
    if (OC.renderNavCounts) OC.renderNavCounts();
  }
  function adjust(i, delta) {
    const s = S(), qi = role('qty'), r = s.rows[i]; if (qi < 0 || !r) return;
    const q = OC.inv.num(r[qi]); const next = Math.max(0, (Number.isNaN(q) ? 0 : q) + delta);
    if (next === q) return;
    const row = r.slice(); row[qi] = next; OC.inv.setRow(i, row);
    if (OC.auth.mustRequest()) return row;
    patched(i);
    const l = OC.inv.level(row);
    if (delta < 0 && l === 'out') OC.toast(t('inventory.nowOut', { name: titleOf(row, i) }), 'err');
    else if (delta < 0 && l === 'low' && OC.inv.level(r) === 'ok') OC.toast(t('inventory.nowLow', { name: titleOf(row, i) }), 'info');
    if (vl) vl.paint(); updateKpis();
    return row;
  }

  /* ---------- details ---------- */
  function openDetail(i) {
    const s = S(); let editing = false;
    const body = document.createElement('div'); body.className = 'det';
    const m = OC.modal({ title: titleOf(s.rows[i], i), body, footer: false, wide: true });
    const pos = () => view.idx.indexOf(i);
    const go = d => { const p = pos(), n = view.idx[p + d]; if (n == null) return; i = n; editing = false; draw(); };
    function draw() {
      const r = s.rows[i]; if (!r) { m.close(); return; }
      m.el.querySelector('.m-head h3').textContent = titleOf(r, i);
      const qi = role('qty'), ui = role('unit'), ci = role('code'), li = role('location'), gi = role('category'), p = pos();
      body.innerHTML = `
        <div class="det-top">
          <div class="row">${levelPill(OC.inv.level(r))}${ci >= 0 && r[ci] !== '' ? `<span class="plate">${esc(r[ci])}</span>` : ''}${li >= 0 && r[li] !== '' ? OC.pill('info', String(r[li]), 'box') : ''}${gi >= 0 && r[gi] !== '' ? OC.pill('', String(r[gi]), 'layers') : ''}</div>
          ${qi >= 0 && !editing ? `<div class="det-qty"><button type="button" data-d="dec" aria-label="-1">−</button><b>${esc(shown(r[qi]))}</b>${ui >= 0 ? `<span>${esc(shown(r[ui]))}</span>` : ''}<button type="button" data-d="inc" aria-label="+1">+</button></div>` : ''}
        </div>
        <div class="det-grid">${s.columns.map((c, k) => `<div class="det-f"><span>${esc(c)}</span>${editing ? `<input class="input" data-ci="${k}" value="${esc(r[k] == null ? '' : r[k])}" />` : `<b>${esc(shown(r[k]))}</b>`}</div>`).join('')}</div>
        <div class="row between mt det-foot">
          <div class="row">${p >= 0 ? `<button class="btn sm" type="button" data-d="prev" ${p <= 0 ? 'disabled' : ''}>${I('left')}${esc(t('prev'))}</button><span class="muted small">${OC.fmtNum(p + 1)} / ${OC.fmtNum(view.idx.length)}</span><button class="btn sm" type="button" data-d="next" ${p >= view.idx.length - 1 ? 'disabled' : ''}>${esc(t('next'))}${I('right')}</button>` : ''}</div>
          <div class="row">${editing
            ? `<button class="btn ghost" type="button" data-d="cancel">${esc(t('cancel'))}</button><button class="btn primary" type="button" data-d="save">${I('check')}${esc(t('save'))}</button>`
            : `<button class="btn ghost sm" type="button" data-d="copy">${I('copy')}${esc(t('inv.copy'))}</button><button class="btn sm" type="button" data-d="edit">${I('edit')}${esc(t('edit'))}</button><button class="btn danger sm" type="button" data-d="del">${I('trash')}${esc(t('delete'))}</button>`}</div>
        </div>`;
      body.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => act(b.dataset.d)));
      if (editing) { const f = body.querySelector('input'); if (f) f.focus(); }
    }
    async function act(a) {
      const r = s.rows[i];
      if (a === 'prev') go(-1); else if (a === 'next') go(1);
      else if (a === 'inc' || a === 'dec') { adjust(i, a === 'inc' ? 1 : -1); draw(); }
      else if (a === 'edit') { editing = true; draw(); }
      else if (a === 'cancel') { editing = false; draw(); }
      else if (a === 'save') {
        const row = r.slice();
        body.querySelectorAll('[data-ci]').forEach(inp => { const k = Number(inp.dataset.ci), v = inp.value.trim(); const n = OC.cells.toNumber(v); row[k] = (typeof r[k] === 'number' || k === role('qty') || k === role('min')) && n !== '' ? n : v; });
        OC.inv.setRow(i, row); patched(i); editing = false; draw(); if (vl) vl.paint(); updateKpis(); OC.toast(t('saved'));
      } else if (a === 'copy') OC.copyText(s.columns.map((c, k) => `${c}: ${shown(r[k])}`).join('\n'));
      else if (a === 'del') {
        if (!(await OC.confirm({ title: t('inventory.delete'), message: t('inventory.deleteMsg', { name: titleOf(r, i) }) }))) return;
        if (OC.auth.mustRequest()) { OC.inv.removeRow(i); return; }
        const p = pos(); OC.inv.removeRow(i); if (p >= 0) view.idx.splice(p, 1); patched(i);
        OC.toast(t('deleted')); const n = view.idx[Math.min(p, view.idx.length - 1)];
        if (n == null) { m.close(); OC.refresh(); return; } i = n; draw(); OC.refresh();
      }
    }
    m.el.addEventListener('keydown', e => { if (editing || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; const rtl = document.documentElement.dir === 'rtl'; if (e.key === 'ArrowRight') go(rtl ? -1 : 1); if (e.key === 'ArrowLeft') go(rtl ? 1 : -1); });
    draw();
  }

  /* ---------- dashboard ---------- */
  function dashData() {
    const s = S(); if (dash.ver === s.version && dash.data) return dash.data;
    const qi = role('qty'), mi = role('min'), ci = role('category'), li = role('location');
    const cats = new Map(), locs = new Map(), top = []; let ok = 0, low = 0, out = 0, none = 0, units = 0;
    for (let i = 0; i < s.rows.length; i++) {
      const r = s.rows[i]; if (!r) continue;
      const l = OC.inv.level(r); if (l === 'ok') ok++; else if (l === 'low') low++; else if (l === 'out') out++; else none++;
      if (ci >= 0) { const k = String(r[ci] === '' || r[ci] == null ? '—' : r[ci]); const c = cats.get(k) || { n: 0, low: 0, out: 0 }; c.n++; if (l === 'low') c.low++; if (l === 'out') c.out++; cats.set(k, c); }
      if (li >= 0) { const k = String(r[li] === '' || r[li] == null ? '—' : r[li]); const c = locs.get(k) || { n: 0, alerts: 0 }; c.n++; if (l === 'low' || l === 'out') c.alerts++; locs.set(k, c); }
      if (qi >= 0) { const q = OC.inv.num(r[qi]); if (Number.isFinite(q)) units += q;
        if ((l === 'low' || l === 'out') && mi >= 0) { const gap = OC.inv.num(r[mi]) - (Number.isFinite(q) ? q : 0); if (Number.isFinite(gap) && (top.length < 12 || gap > top[top.length - 1].gap)) { top.push({ i, gap }); top.sort((a, b) => b.gap - a.gap); if (top.length > 12) top.pop(); } } }
    }
    const sorted = (m, f) => [...m.entries()].map(([k, v]) => Object.assign({ k }, v)).sort((a, b) => f(b) - f(a));
    dash.data = { ok, low, out, none, units, total: ok + low + out + none, cats: sorted(cats, c => c.n), alertCats: sorted(cats, c => c.low + c.out).filter(c => c.low + c.out > 0), locs: sorted(locs, c => c.n), top, catCount: cats.size };
    dash.ver = s.version; return dash.data;
  }
  const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;
  function barList(items, value, opts) {
    if (!items.length) return `<p class="muted small">${esc(t('inv.d.noData'))}</p>`;
    const max = Math.max(...items.map(value), 1);
    return `<div class="bars">${items.map(c => `<button type="button" class="bar-row" data-act="${opts.act}" data-v="${esc(c.k)}" title="${esc(c.k)} · ${esc(OC.fmtNum(value(c)))}">
      <span class="bar-label">${esc(c.k)}</span>
      <span class="bar-track">${opts.stack ? opts.stack(c).map(seg => `<i class="bar-fill ${seg.cls}" style="width:${(seg.v / max * 100).toFixed(2)}%"></i>`).join('') : `<i class="bar-fill" style="width:${(value(c) / max * 100).toFixed(2)}%"></i>`}</span>
      <span class="bar-val">${esc(OC.fmtNum(value(c)))}</span></button>`).join('')}</div>`;
  }
  function dashboardHtml() {
    const d = dashData(), s = S(), qi = role('qty'), ni = role('name'), ci = role('code'), mi = role('min'), li = role('location'), ui = role('unit');
    const seg = (cls, v, label, icon) => v ? `<i class="health-seg ${cls}" style="width:${pct(v, d.total)}%" title="${esc(label)} · ${esc(OC.fmtNum(v))}"></i>` : '';
    const chip = (cls, v, label, icon, act) => `<button type="button" class="health-chip" ${act ? `data-act="${act}"` : 'disabled'}><span class="dot ${cls}"></span>${I(icon)}<b>${esc(OC.fmtNum(v))}</b><span>${esc(label)}</span><small>${pct(v, d.total)}%</small></button>`;
    return `
      <div class="card pad"><div class="row between"><h3>${I('chart')}${esc(t('inv.d.health'))}</h3><span class="muted small">${esc(t('inv.d.healthHint', { n: OC.fmtNum(d.total) }))}</span></div>
        ${qi >= 0 ? `<div class="health-bar" role="img" aria-label="${esc(t('inv.d.health'))}">${seg('ok', d.ok, t('inventory.l.ok'))}${seg('low', d.low, t('inventory.l.low'))}${seg('out', d.out, t('inventory.l.out'))}${seg('none', d.none, t('inv.d.noQty'))}</div>
        <div class="health-chips">${chip('ok', d.ok, t('inventory.l.ok'), 'check', '')}${chip('low', d.low, t('inventory.l.low'), 'alert', 'dashAlerts')}${chip('out', d.out, t('inventory.l.out'), 'alert', 'dashAlerts')}${d.none ? chip('none', d.none, t('inv.d.noQty'), 'info', '') : ''}</div>` : `<p class="muted small mt">${esc(t('inv.noQty'))}</p>`}
      </div>
      <div class="grid-2 mt">
        <div class="card pad"><h3>${I('layers')}${esc(t('inv.d.byCat'))}</h3><p class="muted small">${esc(role('category') >= 0 ? t('inv.d.byCatHint', { n: d.catCount }) : t('inv.d.mapCat'))}</p>${role('category') >= 0 ? barList(d.cats.slice(0, 10), c => c.n, { act: 'dashCat' }) : ''}</div>
        <div class="card pad"><h3>${I('alert')}${esc(t('inv.d.alertsByCat'))}</h3>
          ${role('category') >= 0 && qi >= 0 ? `<div class="legend small"><span><i class="lv-sw st-low"></i>${esc(t('inventory.l.low'))}</span><span><i class="lv-sw st-out"></i>${esc(t('inventory.l.out'))}</span></div>${barList(d.alertCats.slice(0, 10), c => c.low + c.out, { act: 'dashCatAlerts', stack: c => [{ cls: 'st-out', v: c.out }, { cls: 'st-low', v: c.low }] })}` : `<p class="muted small">${esc(t('inv.d.mapCat'))}</p>`}</div>
      </div>
      <div class="grid-2 mt">
        <div class="card pad"><h3>${I('box')}${esc(t('inv.d.byLoc'))}</h3><p class="muted small">${esc(li >= 0 ? t('inv.d.byLocHint', { n: d.locs.length }) : t('inv.d.mapLoc'))}</p>${li >= 0 ? barList(d.locs.slice(0, 10), c => c.n, { act: 'dashLoc' }) : ''}</div>
        <div class="card pad"><div class="row between"><h3>${I('wrench')}${esc(t('inv.d.reorder'))}</h3>${d.low + d.out ? `<button class="btn sm ghost" data-act="dashAlerts">${esc(t('inv.d.seeAll', { n: OC.fmtNum(d.low + d.out) }))}</button>` : ''}</div>
          <p class="muted small">${esc(mi >= 0 ? t('inv.d.reorderHint') : t('inv.d.mapMin'))}</p>
          ${d.top.length ? `<div class="reorder">${d.top.map(x => { const r = s.rows[x.i]; return `<button type="button" class="reorder-row" data-act="detail" data-i="${x.i}"><span class="ro-name"><b>${esc(shown(ni >= 0 ? r[ni] : r[ci]))}</b><small class="mono">${esc(ci >= 0 ? shown(r[ci]) : '')}${li >= 0 && r[li] !== '' ? ' · ' + esc(r[li]) : ''}</small></span><span class="ro-num">${esc(shown(r[qi]))}<small>/ ${esc(shown(r[mi]))}${ui >= 0 && r[ui] !== '' ? ' ' + esc(r[ui]) : ''}</small></span>${levelPill(OC.inv.level(r))}<span class="ro-gap">−${esc(OC.fmtNum(x.gap))}</span></button>`; }).join('')}</div>` : `<p class="small">${OC.pill('good', t('inv.d.nothingToReorder'), 'check')}</p>`}</div>
      </div>`;
  }

  /* ---------- forms ---------- */
  function addItem() {
    const s = S();
    if (!s.columns.length) { OC.inv.setColumns(['Code', 'Item', 'Category', 'Location', 'Qty', 'Min', 'Unit'], { code: 0, name: 1, category: 2, location: 3, qty: 4, min: 5, unit: 6 }); }
    const fields = s.columns.map((c, k) => ({ key: 'c' + k, label: c, type: (k === role('qty') || k === role('min')) ? 'number' : 'text', required: k === role('name'), list: k === role('category') ? categories().slice(0, 300) : null }));
    OC.form({
      title: t('inventory.add'), fields, values: {},
      onSubmit(v) { const row = s.columns.map((c, k) => v['c' + k] == null ? '' : v['c' + k]); const i = OC.inv.addRow(row); if (i < 0) return; patched(i); OC.toast(t('saved')); OC.refresh(); setTimeout(() => openDetail(i), 50); }
    });
  }
  function columnsDialog() {
    const s = S(), cur = new Set(displayCols()), body = document.createElement('div');
    body.innerHTML = `<p class="muted small">${esc(t('inv.colsHint'))}</p>
      <div class="col-picks mt">${s.columns.map((c, k) => `<label class="check"><input type="checkbox" data-col="${k}" ${cur.has(k) ? 'checked' : ''}/> ${esc(c)}</label>`).join('')}</div>
      <h4 class="imp-h">${esc(t('imp.rolesTitle'))}</h4>
      <div class="imp-map">${OC.inv.ROLES.map(r => `<div class="field"><label>${esc(t(ROLE_LABEL[r]))}</label><select class="select" data-role="${r}"><option value="-1">— ${esc(t('imp.none'))} —</option>${s.columns.map((c, k) => `<option value="${k}"${role(r) === k ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div>`).join('')}</div>`;
    const foot = document.createElement('div'); foot.style.display = 'contents';
    foot.innerHTML = `<button class="btn ghost" type="button" data-reset>${esc(t('inv.colsReset'))}</button><button class="btn primary" type="button" data-ok>${I('check')}${esc(t('save'))}</button>`;
    const m = OC.modal({ title: t('inv.columns'), body, footer: foot, wide: true });
    foot.querySelector('[data-reset]').onclick = () => { OC.db.settings.invCols = null; OC.save(); m.close(); OC.refresh(); };
    foot.querySelector('[data-ok]').onclick = async () => {
      const cols = [...body.querySelectorAll('[data-col]')].filter(x => x.checked).map(x => s.columns[Number(x.dataset.col)]);
      const roles = {}; body.querySelectorAll('[data-role]').forEach(x => { roles[x.dataset.role] = Number(x.value); });
      OC.db.settings.invCols = cols.length ? cols : null; OC.save(); await OC.inv.setRoles(roles); m.close(); OC.refresh();
    };
  }
  async function exportExcel() {
    const s = S(), idx = computeView();
    OC.toast(t('inv.exporting', { n: OC.fmtNum(idx.length) }), 'info', 4000);
    const aoa = [s.columns.slice()]; for (const i of idx) aoa.push(s.rows[i]);
    try { await OC.xlsx.exportBook(`oneclick-inventory-${OC.util.today()}.xlsx`, [{ name: t('inventory.title'), aoa }]); OC.toast(t('exported', { n: OC.fmtNum(idx.length) })); }
    catch (e) { console.error(e); OC.toast(e.message, 'err'); }
  }

  /* ---------- Excel import ---------- */
  const ROLE_LABEL = { code: 'inventory.f.sku', name: 'inventory.f.name', category: 'inventory.f.category', location: 'inventory.f.location', qty: 'inventory.f.qty', min: 'inventory.f.min', unit: 'inventory.f.unit' };
  const ROLE_ALIASES = {
    code: ['code', 'item code', 'material', 'material no', 'material number', 'mat no', 'part no', 'part number', 'stock no', 'stock code', 'sku', 'item no', 'item number', 'catalog', 'رقم الصنف', 'رقم المادة', 'كود', 'الكود', 'رمز الصنف', 'رقم القطعة'],
    name: ['description', 'item', 'item name', 'item description', 'material description', 'short text', 'name', 'الوصف', 'اسم الصنف', 'الصنف', 'البيان', 'وصف المادة', 'اسم المادة'],
    category: ['category', 'group', 'material group', 'type', 'class', 'family', 'الفئة', 'المجموعة', 'النوع', 'التصنيف'],
    location: ['location', 'bin', 'bin location', 'storage location', 'sloc', 'shelf', 'rack', 'warehouse', 'store', 'الموقع', 'الرف', 'المستودع', 'الخانة', 'مكان التخزين'],
    qty: ['qty', 'quantity', 'on hand', 'qty on hand', 'stock', 'balance', 'available', 'unrestricted', 'الكمية', 'الرصيد', 'المتوفر', 'العدد'],
    min: ['min', 'minimum', 'min qty', 'reorder', 'reorder point', 'rop', 'safety stock', 'الحد الأدنى', 'حد الطلب', 'حد إعادة الطلب'],
    unit: ['unit', 'uom', 'unit of measure', 'bun', 'base unit', 'الوحدة', 'وحدة القياس']
  };
  const importSpec = {
    id: 'inventory', icon: 'box', dynamic: true,
    title: () => t('inventory.title'), hint: () => t('inv.impHint'),
    count: () => S().stats.count,
    fields: OC.inv.ROLES.map(r => ({ key: r, label: ROLE_LABEL[r], aliases: ROLE_ALIASES[r] })),
    modes: [
      { value: 'replace', label: () => t('imp.m.replace'), hint: () => t('inv.m.replaceHint') },
      { value: 'merge', label: () => t('inv.m.merge'), hint: () => t('inv.m.mergeHint') },
      { value: 'append', label: () => t('imp.m.append'), hint: () => t('inv.m.appendHint') }
    ],
    template: () => [[t('inventory.f.sku'), t('inventory.f.name'), t('inventory.f.category'), t('inventory.f.location'), t('inventory.f.qty'), t('inventory.f.min'), t('inventory.f.unit')], ['1000123456', 'Safety glasses', 'PPE', 'A1-03', 24, 10, 'EA'], ['1000123457', 'Hex bolt M12x50', 'Fasteners', 'B3-11', 240, 100, 'EA']],
    async run({ rows, headers, map, mode, progress, fileName }) {
      const n = headers.length;
      const clean = new Array(rows.length);
      for (let k = 0; k < rows.length; k++) { const r = rows[k], a = new Array(n); for (let c = 0; c < n; c++) { const v = r[c]; a[c] = v == null ? '' : v; } clean[k] = a; }
      const roles = {}; OC.inv.ROLES.forEach(r => { roles[r] = map[r] >= 0 ? map[r] : -1; });
      if (mode === 'replace' || !S().columns.length) {
        await OC.inv.replaceAll(headers, clean, roles, { fileName: fileName || '' }, p => progress(p, t('inv.saving')));
        OC.db.settings.invCols = null;
        return t('inv.imported', { n: OC.fmtNum(clean.length) });
      }
      await OC.inv.loadRows();
      const s = S(), ex = s.columns.slice(), N = OC.cells.norm;
      const pos = headers.map(h => { let k = ex.findIndex(x => N(x) === N(h)); if (k < 0) { ex.push(h); k = ex.length - 1; } return k; });
      const newRoles = Object.assign({}, s.roles); OC.inv.ROLES.forEach(r => { if (!(newRoles[r] >= 0) && map[r] >= 0) newRoles[r] = pos[map[r]]; });
      const aligned = clean.map(r => { const a = new Array(ex.length).fill(''); for (let c = 0; c < r.length; c++) a[pos[c]] = r[c]; return a; });
      await OC.inv.setColumns(ex, newRoles);
      for (let k = 0; k < s.rows.length; k++) if (s.rows[k] && s.rows[k].length < ex.length) while (s.rows[k].length < ex.length) s.rows[k].push('');
      if (mode === 'append') { await OC.inv.append(aligned, p => progress(p, t('inv.saving'))); return t('inv.appended', { n: OC.fmtNum(aligned.length) }); }
      const codeCol = map.code >= 0 ? pos[map.code] : -1;
      if (codeCol < 0) throw new Error(t('inv.needCode'));
      const index = new Map(); s.rows.forEach((r, k) => { if (r && r[codeCol] !== '') index.set(String(r[codeCol]).trim(), k); });
      let upd = 0, add = 0;
      aligned.forEach(r => { const key = String(r[codeCol]).trim(); const k = key ? index.get(key) : undefined; if (k != null) { const cur = s.rows[k]; pos.forEach(c => { if (r[c] !== '') cur[c] = r[c]; }); upd++; } else { s.rows.push(r); if (key) index.set(key, s.rows.length - 1); add++; } });
      await OC.inv.replaceAll(ex, s.rows, newRoles, Object.assign({}, s.info, { fileName: fileName || s.info.fileName }), p => progress(p, t('inv.saving')));
      return t('inv.merged', { u: OC.fmtNum(upd), a: OC.fmtNum(add) });
    }
  };
  const openImport = file => OC.importer.open(importSpec, file);

  /* ---------- module ---------- */
  OC.modules.inventory = {
    id: 'inventory', icon: 'box', order: 2,
    title: () => t('inventory.title'), tagline: () => t('inventory.tag'),
    count: () => { const s = S().stats; return (s.low + s.out) || ''; },
    importSpecs: [importSpec],
    render() {
      const s = S();
      if (!s.rowsLoaded) return `<div class="page-head"><div><h2>${esc(t('inventory.title'))}</h2><p>${esc(t('inventory.desc'))}</p></div></div>
        <div class="card pad imp-wait"><span class="spinner"></span><b>${esc(t('inv.loading', { n: OC.fmtNum(s.stats.count || 0) }))}</b><div class="imp-bar"><i style="width:${Math.round(st.progress * 100)}%" data-loadbar></i></div></div>`;
      const idx = computeView(), cols = displayCols(), { tpl, minw } = colTemplate(cols), qi = role('qty'), cats = categories();
      const info = s.info && s.info.fileName ? t('inv.source', { file: s.info.fileName, date: OC.fmtDate(String(s.info.importedAt || '').slice(0, 10)) }) : '';
      const arrow = c => st.sort && st.sort.c === c ? (st.sort.dir > 0 ? ' ↑' : ' ↓') : '';
      return `
      <div class="page-head"><div><h2>${esc(t('inventory.title'))}</h2><p>${esc(t('inventory.desc'))}</p>${info ? `<p class="muted small">${I('file')} ${esc(info)}</p>` : ''}</div>
        <div class="actions">${s.columns.length ? `<button class="btn" data-act="cols">${I('layers')}${esc(t('inv.columns'))}</button><button class="btn" data-act="export">${I('download')}${esc(t('inv.exportXlsx'))}</button><button class="btn" data-act="add">${I('plus')}${esc(t('inventory.add'))}</button>` : ''}<button class="btn primary" data-act="import">${I('upload')}${esc(t('imp.button'))}</button></div></div>
      <div class="kpis">
        <div class="card kpi"><span class="lbl">${I('box')}${esc(t('inventory.items'))}</span><span class="val" data-kpi="count">${OC.fmtNum(s.stats.count)}</span></div>
        <div class="card kpi"><span class="lbl">${I('alert')}${esc(t('inventory.l.low'))}</span><span class="val" data-kpi="low">${OC.fmtNum(s.stats.low)}</span><span class="hint ${s.stats.low ? 'warn' : ''}">${esc(qi >= 0 ? t('inventory.lowHint') : t('inv.noQty'))}</span></div>
        <div class="card kpi"><span class="lbl">${I('alert')}${esc(t('inventory.l.out'))}</span><span class="val" data-kpi="out">${OC.fmtNum(s.stats.out)}</span><span class="hint ${s.stats.out ? 'crit' : ''}">${esc(t('inventory.outHint'))}</span></div>
        <div class="card kpi"><span class="lbl">${I('layers')}${esc(t('inventory.cats'))}</span><span class="val">${OC.fmtNum(cats.length)}</span></div>
      </div>
      ${s.stats.count ? `
      <div class="toolbar">${OC.seg('tab', [{ value: 'dash', label: t('inv.d.tab') }, { value: 'list', label: t('inv.d.listTab') }], st.tab)}</div>
      ${st.tab === 'dash' ? dashboardHtml() : `
      <div class="toolbar">${OC.search(st.q, t('inv.search'))}
        ${role('category') >= 0 ? `<select class="select" style="width:auto;max-width:260px" data-change="cat" aria-label="${esc(t('inventory.f.category'))}">${OC.options([{ value: 'all', label: t('inventory.allCats') }].concat(cats.slice(0, 2000).map(c => ({ value: c, label: c }))), st.cat)}</select>` : ''}
        ${qi >= 0 ? `<label class="check"><input type="checkbox" data-change="alerts" ${st.alerts ? 'checked' : ''}/> ${esc(t('inventory.onlyLow'))}</label>` : ''}
        <span class="muted small">${esc(t('showing', { n: OC.fmtNum(idx.length), total: OC.fmtNum(s.stats.count) }))}</span></div>
      <div class="vl card" data-vl style="--cols:${tpl};--minw:${minw}px">
        <div class="vl-head">${cols.map(c => `<button type="button" class="vl-h${c === role('qty') || typeof (s.rows[idx[0]] || [])[c] === 'number' ? ' num' : ''}" data-act="sort" data-c="${c}">${esc(s.columns[c])}${arrow(c)}</button>`).join('')}${qi >= 0 ? `<span class="vl-h">${esc(t('status'))}</span>` : ''}</div>
        <div class="vl-body"></div>
        ${idx.length ? '' : OC.empty('search', t('inventory.empty'), t('tryFilters'))}
      </div>
      <p class="muted small mt">${I('info')} ${esc(t('inv.clickHint'))}</p>`}`
        : `<label class="card drop big" data-inv-drop tabindex="0"><input type="file" accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv" class="sr-only" data-inv-file />${I('upload')}<b>${esc(t('inv.emptyTitle'))}</b><span class="muted">${esc(t('inv.emptyHint'))}</span></label>`}`;
    },
    mount(root) {
      const s = S();
      if (!s.rowsLoaded) {
        if (!st.loading) {
          st.loading = true;
          OC.inv.loadRows(p => { st.progress = p; const b = document.querySelector('[data-loadbar]'); if (b) b.style.width = Math.round(p * 100) + '%'; })
            .then(() => { st.loading = false; if (OC.route.id === 'inventory') OC.refresh(); });
        }
        return;
      }
      if (st.tab === 'list') mountList(root); else vl = null;
      const drop = root.querySelector('[data-inv-drop]');
      if (drop) {
        const f = drop.querySelector('[data-inv-file]');
        f.addEventListener('change', () => f.files[0] && openImport(f.files[0]));
        drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('over'));
        drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) openImport(e.dataTransfer.files[0]); });
      }
    },
    actions: {
      tab: d => { st.tab = d.v; OC.refresh(); },
      dashCat: d => { st.cat = d.v === '—' ? '' : d.v; st.alerts = false; st.q = ''; st.tab = 'list'; OC.refresh(); },
      dashCatAlerts: d => { st.cat = d.v === '—' ? '' : d.v; st.alerts = true; st.q = ''; st.tab = 'list'; OC.refresh(); },
      dashLoc: d => { st.q = d.v === '—' ? '' : d.v; st.cat = 'all'; st.alerts = false; st.tab = 'list'; OC.refresh(); },
      dashAlerts: () => { st.alerts = true; st.cat = 'all'; st.q = ''; st.tab = 'list'; OC.refresh(); },
      import: () => openImport(),
      export: () => exportExcel(),
      add: () => addItem(),
      cols: () => columnsDialog(),
      detail: d => openDetail(Number(d.i)),
      inc: d => adjust(Number(d.i), 1),
      dec: d => adjust(Number(d.i), -1),
      q: (d, el) => { st.q = el.value; clearTimeout(st.qT); st.qT = setTimeout(() => OC.refresh(), S().stats.count > 50000 ? 220 : 60); },
      cat: (d, el) => { st.cat = el.value; OC.refresh(); },
      alerts: (d, el) => { st.alerts = el.checked; OC.refresh(); },
      sort: d => { const c = Number(d.c); st.sort = !st.sort || st.sort.c !== c ? { c, dir: 1 } : st.sort.dir === 1 ? { c, dir: -1 } : null; OC.refresh(); }
    },
    level: r => OC.inv.level(r)
  };
})(window.OC);
