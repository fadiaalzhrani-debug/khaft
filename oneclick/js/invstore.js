/* OneClick · inventory store for very large item lists (200,000+ rows)
   Rows are arrays of cell values, kept in memory once loaded and persisted to IndexedDB in chunks
   of 2,000 rows, so editing one item rewrites one chunk only. Deleted rows become null until the
   next full save compacts them. Column meaning (name, code, qty, ...) is stored as "roles". */
window.OC = window.OC || {};
(function (OC) {
  'use strict';
  const DB = 'oneclick-inventory', VER = 1, CH = 2000;
  const ROLES = ['code', 'name', 'category', 'location', 'qty', 'min', 'unit'];
  const st = {
    columns: [], rows: [], roles: {}, info: {}, stats: { count: 0, low: 0, out: 0, cats: 0 },
    metaLoaded: false, rowsLoaded: false, persistent: true, version: 0
  };
  let dbp = null, loadP = null, metaP = null;

  function openDB() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      let req;
      try { req = indexedDB.open(DB, VER); } catch (e) { rej(e); return; }
      req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta'); if (!d.objectStoreNames.contains('chunks')) d.createObjectStore('chunks'); };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error || new Error('IndexedDB unavailable'));
      req.onblocked = () => rej(new Error('IndexedDB blocked'));
    });
    dbp.catch(() => { st.persistent = false; });
    return dbp;
  }
  function tx(stores, mode, fn) {
    return openDB().then(d => new Promise((res, rej) => {
      const t = d.transaction(stores, mode); let out;
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('transaction aborted'));
      out = fn(t);
    }));
  }
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  /* ---------- derived values ---------- */
  const num = v => { if (typeof v === 'number') return v; if (v == null || v === '') return NaN; return Number(OC.cells ? OC.cells.toNumber(v) : String(v).replace(/,/g, '')); };
  const role = r => (st.roles[r] != null && st.roles[r] >= 0 && st.roles[r] < st.columns.length) ? st.roles[r] : -1;
  function level(row) {
    const qi = role('qty'); if (qi < 0 || !row) return '';
    const q = num(row[qi]); if (Number.isNaN(q) || row[qi] === '') return '';
    if (q <= 0) return 'out';
    const mi = role('min'); if (mi < 0) return 'ok';
    const mn = num(row[mi]); if (Number.isNaN(mn) || row[mi] === '') return 'ok';
    return q <= mn ? 'low' : 'ok';
  }
  function computeStats() {
    let count = 0, low = 0, out = 0; const cats = new Set(); const ci = role('category');
    for (const r of st.rows) { if (!r) continue; count++; const l = level(r); if (l === 'low') low++; else if (l === 'out') out++; if (ci >= 0 && r[ci] !== '' && r[ci] != null) cats.add(String(r[ci])); }
    st.stats = { count, low, out, cats: cats.size };
  }
  const meta = () => ({ columns: st.columns, roles: st.roles, info: st.info, stats: st.stats, chunks: Math.ceil(st.rows.length / CH) });
  const changed = () => { st.version++; };

  /* ---------- persistence ---------- */
  async function writeMeta() { if (!st.persistent) return; try { await tx(['meta'], 'readwrite', t => t.objectStore('meta').put(meta(), 'main')); } catch (e) { fail(e); } }
  async function writeChunks(from, to, onProgress) {
    if (!st.persistent) return;
    const total = Math.ceil(st.rows.length / CH);
    for (let c = from; c < Math.min(to, total); c += 10) {
      const end = Math.min(c + 10, total, to);
      await tx(['chunks'], 'readwrite', t => { const s = t.objectStore('chunks'); for (let k = c; k < end; k++) s.put(st.rows.slice(k * CH, (k + 1) * CH), k); });
      if (onProgress) onProgress((end - from) / Math.max(1, Math.min(to, total) - from));
    }
  }
  let warned = false;
  function fail(e) { console.error('OneClick inventory store:', e); if (!warned && OC.toast) { warned = true; OC.toast(OC.t('inv.storeErr'), 'err', 6000); } }
  async function saveAll(onProgress) {
    st.rows = st.rows.filter(Boolean); computeStats(); changed();
    if (!st.persistent) return;
    try {
      await tx(['chunks'], 'readwrite', t => t.objectStore('chunks').clear());
      await writeChunks(0, Infinity, onProgress);
      await writeMeta();
    } catch (e) { fail(e); }
  }
  const pendingChunks = new Set(); let flushT = 0;
  function saveRowSoon(i) {
    pendingChunks.add(Math.floor(i / CH));
    clearTimeout(flushT);
    flushT = setTimeout(async () => {
      const list = [...pendingChunks]; pendingChunks.clear();
      try { for (const c of list) await writeChunks(c, c + 1); await writeMeta(); } catch (e) { fail(e); }
    }, 250);
  }

  /* ---------- public API ---------- */
  async function init() {
    if (metaP) return metaP;
    metaP = (async () => {
      try {
        const m = await tx(['meta'], 'readonly', t => reqP(t.objectStore('meta').get('main'))).then(r => r);
        const got = await m;
        if (got) { st.columns = got.columns || []; st.roles = got.roles || {}; st.info = got.info || {}; st.stats = got.stats || st.stats; }
        else if (OC.db.inventory && OC.db.inventory.length) await importLegacy(OC.db.inventory);
      } catch (e) {
        st.persistent = false; console.warn('OneClick: IndexedDB unavailable, inventory kept in memory only', e);
        if (OC.db.inventory && OC.db.inventory.length) await importLegacy(OC.db.inventory);
      }
      st.metaLoaded = true;
      return st;
    })();
    return metaP;
  }
  async function loadRows(onProgress) {
    await init();
    if (st.rowsLoaded) return st;
    if (loadP) return loadP;
    loadP = (async () => {
      if (st.persistent) {
        try {
          const chunks = await tx(['chunks'], 'readonly', t => reqP(t.objectStore('chunks').getAll()));
          const all = await chunks; const rows = [];
          all.forEach((c, k) => { for (let j = 0; j < c.length; j++) rows.push(c[j]); if (onProgress) onProgress((k + 1) / all.length); });
          if (rows.length || !st.rows.length) st.rows = rows;
        } catch (e) { fail(e); }
      }
      st.rowsLoaded = true; computeStats(); changed();
      return st;
    })();
    return loadP;
  }
  /* legacy small inventory (localStorage objects) → table rows */
  async function importLegacy(items) {
    const cols = ['Code', 'Item', 'Category', 'Location', 'Qty', 'Min', 'Unit'];
    const rows = items.map(i => [i.sku || '', i.name || '', i.category || '', i.location || '', Number(i.qty) || 0, Number(i.min) || 0, i.unit || '']);
    await replaceAll(cols, rows, { code: 0, name: 1, category: 2, location: 3, qty: 4, min: 5, unit: 6 }, { source: 'sample' });
    OC.db.inventory = []; OC.save();
  }
  async function replaceAll(columns, rows, roles, info, onProgress) {
    st.columns = columns.slice(); st.rows = rows; st.roles = Object.assign({}, roles); st.info = Object.assign({ importedAt: new Date().toISOString() }, info || {});
    st.rowsLoaded = true; st.metaLoaded = true;
    await saveAll(onProgress);
  }
  async function append(rows, onProgress) {
    const from = Math.floor(st.rows.length / CH);
    for (const r of rows) st.rows.push(r);
    computeStats(); changed();
    try { await writeChunks(from, Infinity, onProgress); await writeMeta(); } catch (e) { fail(e); }
  }
  function setColumns(columns, roles) {
    st.columns = columns.slice(); if (roles) st.roles = Object.assign({}, roles);
    computeStats(); changed(); return writeMeta();
  }
  function setRoles(roles) { st.roles = Object.assign({}, roles); computeStats(); changed(); return writeMeta(); }
  function setRow(i, row) { st.rows[i] = row; computeStats(); changed(); saveRowSoon(i); }
  function addRow(row) { st.rows.push(row); const i = st.rows.length - 1; computeStats(); changed(); saveRowSoon(i); return i; }
  function removeRow(i) { st.rows[i] = null; computeStats(); changed(); saveRowSoon(i); }
  async function clear() {
    st.columns = []; st.rows = []; st.roles = {}; st.info = {}; computeStats(); changed(); st.rowsLoaded = true;
    if (!st.persistent) return;
    try { await tx(['chunks', 'meta'], 'readwrite', t => { t.objectStore('chunks').clear(); t.objectStore('meta').clear(); }); } catch (e) { fail(e); }
  }
  async function exportData() { await loadRows(); return { columns: st.columns, roles: st.roles, info: st.info, rows: st.rows.filter(Boolean) }; }

  OC.inv = { st, ROLES, CH, init, loadRows, replaceAll, append, setColumns, setRoles, setRow, addRow, removeRow, clear, exportData, importLegacy, level, role, num, computeStats };
})(window.OC);
