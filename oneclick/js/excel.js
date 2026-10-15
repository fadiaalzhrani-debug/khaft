/* OneClick · Excel import / export
   OC.xlsx      open(file) → book {sheets, rows(sheet), close}; exportBook(filename, sheets)
   OC.importer  open(spec, file?) → wizard: pick file → sheet / header row / column mapping → import with progress
   OC.cells     value helpers: norm, toDate, toNumber, toBool, matchEnum */
window.OC = window.OC || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon;
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));

  /* ---------- cell helpers ---------- */
  const latinDigits = s => String(s).replace(/[٠-٩۰-۹]/g, d => String(d.charCodeAt(0) & 0xF));
  const norm = s => latinDigits(s == null ? '' : s).toLowerCase()
    .replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[^a-z0-9؀-ۿ]+/g, '');
  const pad = n => String(n).padStart(2, '0');
  function validDate(y, m, d) {
    if (!(y > 1900 && y < 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
    const dt = new Date(y, m - 1, d); if (dt.getMonth() !== m - 1) return '';
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  function toDate(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') { if (v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return validDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); } return ''; }
    if (v instanceof Date) return isNaN(v) ? '' : validDate(v.getFullYear(), v.getMonth() + 1, v.getDate());
    const s = latinDigits(v).trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (m) return validDate(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (m) { const a = +m[1], b = +m[2]; let y = +m[3]; if (y < 100) y += 2000; return a <= 12 && b > 12 ? validDate(y, a, b) : validDate(y, b, a); } // day-first unless impossible
    if (/^\d{5}(\.\d+)?$/.test(s)) return toDate(Number(s));
    if (/[a-z]/i.test(s)) { const dt = new Date(s); if (!isNaN(dt)) return validDate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()); }
    return '';
  }
  function toNumber(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : '';
    if (v == null) return '';
    const s = latinDigits(v).replace(/[٬,\s]/g, '').replace(/٫/g, '.');
    if (!s) return '';
    const n = Number(s); return Number.isFinite(n) ? n : '';
  }
  const TRUE_WORDS = ['1', 'true', 'yes', 'y', 'x', '✓', '✔', 'done', 'ok', 'نعم', 'تم', 'منجز', 'منجزه', 'مكتمل', 'صح'];
  function toBool(v) { if (v === true) return true; if (typeof v === 'number') return v !== 0; const n = norm(v); if (!n) return /[✓✔☑]/.test(String(v)); return TRUE_WORDS.some(w => norm(w) === n); }
  /* value text → enum key, by key name or any alias (both languages) */
  function matchEnum(v, table, fallback) {
    const n = norm(v); if (!n) return fallback;
    for (const key of Object.keys(table)) if (norm(key) === n) return key;
    for (const key of Object.keys(table)) if (table[key].some(a => norm(a) === n)) return key;
    let best = null, bestLen = 0; // longest contained alias wins ("إجازة مرضية" → sick, not annual)
    for (const key of Object.keys(table)) for (const a of table[key]) { const x = norm(a); if (x.length >= 3 && x.length > bestLen && n.includes(x)) { best = key; bestLen = x.length; } }
    return best || fallback;
  }
  /* aliases for an enum = its translated labels in both languages + extra words */
  function enumTable(keys, labelPrefix, extra) {
    const out = {}, d = OC.i18n.dict;
    keys.forEach(k => { out[k] = [d.en[labelPrefix + k], d.ar[labelPrefix + k]].filter(Boolean).concat((extra && extra[k]) || []); });
    return out;
  }
  OC.cells = { norm, toDate, toNumber, toBool, matchEnum, enumTable, latinDigits };

  /* ---------- SheetJS loading ---------- */
  let libP = null;
  function loadLib() {
    if (window.XLSX && window.XLSX.read) return Promise.resolve(window.XLSX);
    if (libP) return libP;
    libP = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'vendor/xlsx.full.min.js';
      s.onload = () => (window.XLSX ? res(window.XLSX) : rej(new Error('XLSX missing')));
      s.onerror = () => { libP = null; rej(new Error('Could not load vendor/xlsx.full.min.js')); };
      document.head.appendChild(s);
    });
    return libP;
  }
  const canWorker = () => typeof Worker !== 'undefined' && /^https?:$/.test(location.protocol);
  function workerBook(buf, name) {
    return new Promise((resolve, reject) => {
      let w; try { w = new Worker('js/xlsx-worker.js'); } catch (e) { reject(e); return; }
      let seq = 0; const pending = new Map();
      const call = (msg, transfer) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); w.postMessage(Object.assign({ id }, msg), transfer || []); });
      w.onmessage = e => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); if (e.data.ok) p.res(e.data); else { const err = new Error(e.data.error); err.fromWorker = true; p.rej(err); } };
      w.onerror = e => { if (e.preventDefault) e.preventDefault(); const err = new Error(e.message || 'worker failed'); pending.forEach(p => p.rej(err)); pending.clear(); w.terminate(); reject(err); };
      call({ cmd: 'open', buf, name }, [buf]).then(r => resolve({
        name, sheets: r.sheets,
        rows: sheet => call({ cmd: 'rows', sheet }).then(x => x.rows),
        close: () => w.terminate()
      }), err => { w.terminate(); reject(err); });
    });
  }
  async function open(file) {
    if (canWorker()) {
      try { return await workerBook(await file.arrayBuffer(), file.name); }
      catch (e) { if (e.fromWorker) throw e; console.warn('OneClick: parsing on the main thread', e); }
    }
    const X = await loadLib(); await nextFrame();
    const wb = OCX.readBook(X, await file.arrayBuffer(), file.name);
    return { name: file.name, sheets: OCX.describe(X, wb), rows: async sheet => { await nextFrame(); return OCX.sheetToRows(X, wb.Sheets[sheet]); }, close() { } };
  }
  const safeSheet = s => String(s || 'Sheet').replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet';
  async function exportBook(filename, sheets) {
    const X = await loadLib(); await nextFrame();
    const wb = X.utils.book_new();
    sheets.forEach(s => {
      const ws = X.utils.aoa_to_sheet(s.aoa);
      const widths = []; s.aoa.slice(0, 300).forEach(r => r.forEach((v, i) => { widths[i] = Math.max(widths[i] || 8, Math.min(48, String(v == null ? '' : v).length + 2)); }));
      ws['!cols'] = widths.map(w => ({ wch: w }));
      X.utils.book_append_sheet(wb, ws, safeSheet(s.name));
    });
    if (OC.db.settings.lang === 'ar') wb.Workbook = { Views: [{ RTL: true }] };
    X.writeFile(wb, filename, { compression: true });
  }
  OC.xlsx = { open, exportBook, loadLib };

  /* ---------- import wizard ---------- */
  const fieldAliases = f => {
    const d = OC.i18n.dict;
    return [f.key, d.en[f.label], d.ar[f.label]].concat(f.aliases || []).map(norm).filter(Boolean);
  };
  function autoMap(fields, headers) {
    const H = headers.map(norm), used = new Set(), map = {};
    fields.forEach(f => { const al = fieldAliases(f); const i = H.findIndex((h, j) => h && !used.has(j) && al.includes(h)); if (i >= 0) { map[f.key] = i; used.add(i); } });
    fields.forEach(f => {
      if (map[f.key] != null) return;
      const al = fieldAliases(f).filter(a => a.length >= 3);
      const i = H.findIndex((h, j) => h && !used.has(j) && al.some(a => h.includes(a)));
      map[f.key] = i; if (i >= 0) used.add(i);
    });
    return map;
  }
  function detectHeader(preview, fields) {
    let best = 0, bestScore = -1;
    for (let r = 0; r < Math.min(15, preview.length); r++) {
      const row = preview[r] || [];
      const strs = row.filter(v => typeof v === 'string' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v) && !/^\d+$/.test(v)).length;
      const hits = Object.values(autoMap(fields, row.map(v => String(v)))).filter(i => i >= 0).length;
      const score = strs + hits * 4;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    return best;
  }
  const convert = (type, v) => type === 'number' ? toNumber(v) : type === 'date' ? toDate(v) : type === 'bool' ? toBool(v) : String(v == null ? '' : v).trim();
  const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

  OC.importer = {
    autoMap, detectHeader,
    open(spec, initialFile) {
      const st = { step: 'pick', file: null, book: null, sheetIdx: 0, header: 0, map: {}, mode: spec.modes ? spec.modes[0].value : 'append', options: {}, error: '', pct: 0, progressText: '', summary: '' };
      (spec.options || []).forEach(o => { st.options[o.key] = o.default !== false; });
      const body = document.createElement('div'); body.className = 'imp';
      let closed = false;
      const m = OC.modal({ title: t('imp.title', { section: spec.title() }), body, footer: false, wide: true, onClose: () => { closed = true; if (st.book) st.book.close(); } });

      const sheet = () => st.book.sheets[st.sheetIdx];
      const headers = () => { const s = sheet(); const row = s.preview[st.header] || []; const n = Math.max(row.length, ...s.preview.slice(st.header + 1, st.header + 30).map(r => r.length), 0); return Array.from({ length: n }, (_, i) => { const v = row[i]; return v === '' || v == null ? `${t('imp.col')} ${i + 1}` : String(v); }); };
      const extraCols = () => { if (spec.extra !== 'columns') return []; const used = new Set(Object.values(st.map).filter(i => i >= 0)); const row = sheet().preview[st.header] || []; return headers().map((h, i) => ({ i, h })).filter(x => !used.has(x.i) && row[x.i] !== '' && row[x.i] != null); };
      const setMapping = () => { st.map = autoMap(spec.fields, headers()); };

      async function pick(file) {
        if (!file) return;
        st.file = file; st.step = 'reading'; st.error = ''; render();
        try {
          if (st.book) st.book.close();
          st.book = await OC.xlsx.open(file);
          if (closed) { st.book.close(); return; }
          st.sheetIdx = Math.max(0, st.book.sheets.findIndex(s => s.preview.length > 0));
          st.header = detectHeader(sheet().preview, spec.fields); setMapping();
          st.step = sheet().preview.length ? 'map' : 'pick';
          if (!sheet().preview.length) st.error = t('imp.emptyFile');
        } catch (e) { console.error(e); st.step = 'pick'; st.error = t('imp.readErr', { msg: e.message || e }); }
        render();
      }
      async function run() {
        const missing = spec.fields.filter(f => f.required && !(st.map[f.key] >= 0));
        if (missing.length) { st.error = t('imp.missing', { fields: missing.map(f => t(f.label)).join('، ') }); render(); return; }
        st.step = 'importing'; st.pct = 0; st.progressText = t('imp.readingRows'); st.error = ''; render();
        const progress = (p, text) => { st.pct = p; if (text) st.progressText = text; const bar = body.querySelector('.imp-bar i'); const lbl = body.querySelector('[data-plabel]'); if (bar) bar.style.width = Math.round(p * 100) + '%'; if (lbl) lbl.textContent = st.progressText + ' · ' + Math.round(p * 100) + '%'; };
        try {
          const all = await st.book.rows(sheet().name);
          const rows = all.slice(st.header + 1);
          progress(.15, t('imp.preparing', { n: OC.fmtNum(rows.length) }));
          await nextFrame();
          let records = null, skipped = 0;
          if (!spec.dynamic) {
            records = [];
            for (const r of rows) {
              const o = {}; spec.fields.forEach(f => { const c = st.map[f.key]; o[f.key] = convert(f.type, c >= 0 ? r[c] : ''); });
              if (spec.fields.some(f => f.required && (o[f.key] === '' || o[f.key] == null))) { skipped++; continue; }
              o._row = r; records.push(o);
            }
          }
          const summary = await spec.run({ fileName: st.file.name, records, rows, headers: headers(), map: st.map, mode: st.mode, options: st.options, extraCols: extraCols(), progress: (p, txt) => progress(.2 + p * .8, txt) });
          OC.save();
          st.summary = [summary, skipped ? t('imp.skipped', { n: OC.fmtNum(skipped) }) : ''].filter(Boolean).join(' ');
          st.step = 'done';
        } catch (e) { console.error(e); st.step = 'map'; st.error = t('imp.failed', { msg: e.message || e }); }
        if (closed) return;
        render(); OC.refresh();
      }

      function render() {
        if (closed) return;
        if (st.step === 'pick') {
          body.innerHTML = `
            ${spec.hint ? `<p class="muted small">${esc(spec.hint())}</p>` : ''}
            <label class="drop mt" data-dropzone tabindex="0">
              <input type="file" accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv" class="sr-only" data-file />
              ${I('upload')}<b>${esc(t('imp.drop'))}</b><span class="muted small">${esc(t('imp.formats'))}</span></label>
            ${st.error ? `<div class="form-err show">${esc(st.error)}</div>` : ''}
            <div class="row between mt"><span class="muted small">${esc(t('imp.lookingFor'))}: ${spec.fields.map(f => esc(t(f.label)) + (f.required ? '<i class="req">*</i>' : '')).join(' · ')}${spec.extra === 'columns' ? ' · ' + esc(spec.extraLabel()) : ''}</span>
              ${spec.template ? `<button class="btn sm" type="button" data-tpl>${I('download')}${esc(t('imp.template'))}</button>` : ''}</div>`;
        } else if (st.step === 'reading') {
          body.innerHTML = `<div class="imp-wait"><span class="spinner"></span><b>${esc(t('imp.reading', { name: st.file.name }))}</b><span class="muted small">${esc(fmtSize(st.file.size))}${st.file.size > 4194304 ? ' · ' + esc(t('imp.bigFile')) : ''}</span></div>`;
        } else if (st.step === 'map') {
          const s = sheet(), hs = headers(), data = s.preview.slice(st.header + 1, st.header + 6);
          const fieldsShown = spec.dynamic ? hs.slice(0, 8).map((h, i) => ({ h, i })) : spec.fields.filter(f => st.map[f.key] >= 0).map(f => ({ h: t(f.label), i: st.map[f.key], f }));
          const extras = extraCols();
          body.innerHTML = `
            <div class="imp-file row between"><div class="row">${I('file')}<b>${esc(st.file.name)}</b><span class="muted small">${esc(t('imp.approxRows', { n: OC.fmtNum(Math.max(0, s.rows - st.header - 1)) }))}</span></div><button class="btn sm ghost" type="button" data-again>${I('refresh')}${esc(t('imp.another'))}</button></div>
            <div class="form-grid mt">
              ${st.book.sheets.length > 1 ? `<div class="field"><label>${esc(t('imp.sheet'))}</label><select class="select" data-sheet>${st.book.sheets.map((x, i) => `<option value="${i}"${i === st.sheetIdx ? ' selected' : ''}>${esc(x.name)} (${OC.fmtNum(x.rows)})</option>`).join('')}</select></div>` : ''}
              <div class="field"><label>${esc(t('imp.headerRow'))}</label><select class="select" data-header>${s.preview.slice(0, 15).map((r, i) => `<option value="${i}"${i === st.header ? ' selected' : ''}>${esc(t('imp.rowN', { n: i + 1 }))}: ${esc(r.filter(v => v !== '').slice(0, 4).join(' | ').slice(0, 70))}</option>`).join('')}</select></div>
            </div>
            <h4 class="imp-h">${esc(spec.dynamic ? t('imp.rolesTitle') : t('imp.mapTitle'))}</h4>
            ${spec.dynamic ? `<p class="muted small">${esc(t('imp.dynamicNote', { n: hs.length }))}</p>` : ''}
            <div class="imp-map">${spec.fields.map(f => `<div class="field"><label>${esc(t(f.label))}${f.required ? '<i class="req">*</i>' : ''}</label><select class="select" data-map="${f.key}"><option value="-1">— ${esc(t('imp.none'))} —</option>${hs.map((h, i) => `<option value="${i}"${st.map[f.key] === i ? ' selected' : ''}>${esc(h)}</option>`).join('')}</select></div>`).join('')}</div>
            ${spec.extra === 'columns' ? `<div class="mt"><b class="small">${esc(spec.extraLabel())} (${extras.length})</b><div class="chips mt">${extras.length ? extras.slice(0, 60).map(x => `<span class="pill accent">${esc(x.h)}</span>`).join('') + (extras.length > 60 ? `<span class="pill">+${extras.length - 60}</span>` : '') : `<span class="muted small">${esc(t('imp.noExtra'))}</span>`}</div></div>` : ''}
            <h4 class="imp-h">${esc(t('imp.preview'))}</h4>
            <div class="table-wrap imp-prev"><table class="table"><thead><tr>${fieldsShown.map(x => `<th>${esc(x.h)}</th>`).join('')}</tr></thead><tbody>${data.map(r => `<tr>${fieldsShown.map(x => { let v = r[x.i]; if (x.f) v = convert(x.f.type, v); if (typeof v === 'boolean') v = v ? '✓' : ''; return `<td>${esc(v === '' || v == null ? '—' : v)}</td>`; }).join('')}</tr>`).join('') || `<tr><td class="muted">${esc(t('imp.noRows'))}</td></tr>`}</tbody></table></div>
            ${spec.modes ? `<h4 class="imp-h">${esc(t('imp.mode'))}</h4><div class="imp-modes">${spec.modes.map(md => `<label class="imp-mode${st.mode === md.value ? ' on' : ''}"><input type="radio" name="impmode" value="${md.value}"${st.mode === md.value ? ' checked' : ''}/><span><b>${esc(md.label())}</b><small class="muted">${esc(md.hint ? md.hint() : '')}</small></span></label>`).join('')}</div>` : ''}
            ${(spec.options || []).map(o => `<label class="check mt"><input type="checkbox" data-opt="${o.key}"${st.options[o.key] ? ' checked' : ''}/> ${esc(o.label())}</label>`).join('')}
            ${st.error ? `<div class="form-err show">${esc(st.error)}</div>` : ''}
            <div class="row mt" style="justify-content:flex-end"><button class="btn ghost" type="button" data-cancel>${esc(t('cancel'))}</button><button class="btn primary" type="button" data-run>${I('upload')}${esc(t('imp.run'))}</button></div>`;
        } else if (st.step === 'importing') {
          body.innerHTML = `<div class="imp-wait"><span class="spinner"></span><b>${esc(t('imp.importing'))}</b><div class="imp-bar"><i style="width:${Math.round(st.pct * 100)}%"></i></div><span class="muted small" data-plabel>${esc(st.progressText)}</span></div>`;
        } else if (st.step === 'done') {
          body.innerHTML = `<div class="imp-wait"><span class="imp-ok">${I('check')}</span><b>${esc(t('imp.done'))}</b><p class="muted">${esc(st.summary)}</p>
            <div class="row mt"><button class="btn" type="button" data-again>${I('upload')}${esc(t('imp.another'))}</button><button class="btn primary" type="button" data-cancel>${esc(t('close'))}</button></div></div>`;
        }
        bind();
      }
      function bind() {
        const q = s => body.querySelector(s);
        const fileIn = q('[data-file]'); if (fileIn) fileIn.addEventListener('change', () => pick(fileIn.files[0]));
        const dz = q('[data-dropzone]');
        if (dz) {
          dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
          dz.addEventListener('dragleave', () => dz.classList.remove('over'));
          dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); pick(e.dataTransfer.files[0]); });
          dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
        }
        const tpl = q('[data-tpl]'); if (tpl) tpl.addEventListener('click', () => OC.xlsx.exportBook(`oneclick-${spec.id}-template.xlsx`, [{ name: spec.title(), aoa: spec.template() }]).catch(e => OC.toast(e.message, 'err')));
        const again = q('[data-again]'); if (again) again.addEventListener('click', () => { st.step = 'pick'; st.error = ''; render(); });
        const cancel = q('[data-cancel]'); if (cancel) cancel.addEventListener('click', () => m.close());
        const sh = q('[data-sheet]'); if (sh) sh.addEventListener('change', () => { st.sheetIdx = Number(sh.value); st.header = detectHeader(sheet().preview, spec.fields); setMapping(); render(); });
        const hd = q('[data-header]'); if (hd) hd.addEventListener('change', () => { st.header = Number(hd.value); setMapping(); render(); });
        body.querySelectorAll('[data-map]').forEach(sel => sel.addEventListener('change', () => { st.map[sel.dataset.map] = Number(sel.value); render(); }));
        body.querySelectorAll('input[name=impmode]').forEach(r => r.addEventListener('change', () => { st.mode = r.value; render(); }));
        body.querySelectorAll('[data-opt]').forEach(c => c.addEventListener('change', () => { st.options[c.dataset.opt] = c.checked; }));
        const go = q('[data-run]'); if (go) go.addEventListener('click', run);
      }
      render();
      if (initialFile) pick(initialFile);
      return m;
    }
  };

  /* person lookup used by imports that reference team members by name or badge */
  OC.findPerson = (name, badge, create, extra) => {
    const b = String(badge || '').trim(), n = norm(name);
    let p = b ? OC.db.team.find(m => String(m.badge || '').trim() === b) : null;
    if (!p && n) p = OC.db.team.find(m => norm(m.name) === n);
    if (!p && create && String(name || '').trim()) {
      p = Object.assign({ id: OC.util.uid(), name: String(name).trim(), badge: b, role: '', group: '', shift: 'A', status: 'on', phone: '' }, extra || {});
      OC.db.team.push(p); OC.findPerson.created = (OC.findPerson.created || 0) + 1;
    }
    return p || null;
  };
})(window.OC);
