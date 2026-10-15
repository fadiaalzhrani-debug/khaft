/* OneClick · spreadsheet → rows conversion, shared by the main thread and the Web Worker.
   Exposes self.OCX. Needs the global XLSX (SheetJS) to be passed in. */
(function (g) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const MAX_COLS = 250;

  /* CSV files saved by Excel in Arabic Windows are usually Windows-1256, not UTF-8 */
  function decode(buf, name) {
    if (/\.(csv|txt|tsv)$/i.test(name || '')) {
      const u8 = new Uint8Array(buf); let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(u8); }
      catch (e) { try { text = new TextDecoder('windows-1256').decode(u8); } catch (e2) { text = new TextDecoder('utf-8').decode(u8); } }
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      return { data: text, type: 'string', csv: true };
    }
    return { data: new Uint8Array(buf), type: 'array', csv: false };
  }
  function readBook(XLSX, buf, name) {
    const d = decode(buf, name);
    const opts = { type: d.type, dense: true, cellNF: true, cellHTML: false, cellStyles: false, cellFormula: false };
    if (d.csv) opts.raw = true; // keep codes like 00123 as text
    return XLSX.read(d.data, opts);
  }
  function cellValue(XLSX, c) {
    if (!c) return '';
    switch (c.t) {
      case 's': case 'str': return typeof c.v === 'string' ? c.v.trim() : String(c.v == null ? '' : c.v);
      case 'n':
        if (c.z && c.z !== 'General' && XLSX.SSF.is_date(c.z)) { const p = XLSX.SSF.parse_date_code(c.v); if (p && p.y > 1900 && p.y < 2200) return iso(p.y, p.m, p.d); }
        return c.v;
      case 'd': { const dt = c.v instanceof Date ? c.v : new Date(c.v); return isNaN(dt) ? (c.w || '') : iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); }
      case 'b': return c.v ? 'TRUE' : 'FALSE';
      case 'e': case 'z': return '';
      default: return c.w != null ? c.w : (c.v != null ? c.v : '');
    }
  }
  /* returns non-blank rows as arrays; trailing empty cells trimmed */
  function sheetToRows(XLSX, ws, limit) {
    if (!ws || !ws['!ref']) return [];
    const range = XLSX.utils.decode_range(ws['!ref']);
    const c0 = range.s.c, c1 = Math.min(range.e.c, c0 + MAX_COLS - 1);
    const data = ws['!data'];
    const out = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row = data ? data[r] : null;
      if (data && !row) continue;
      let last = -1; const arr = new Array(c1 - c0 + 1);
      for (let c = c0; c <= c1; c++) {
        const cell = data ? row[c] : ws[XLSX.utils.encode_cell({ r, c })];
        const v = cellValue(XLSX, cell);
        arr[c - c0] = v;
        if (v !== '' && v != null) last = c - c0;
      }
      if (last < 0) continue;
      arr.length = last + 1;
      out.push(arr);
      if (limit && out.length >= limit) break;
    }
    return out;
  }
  function describe(XLSX, wb) {
    return wb.SheetNames.map(name => {
      const ws = wb.Sheets[name]; let rows = 0;
      if (ws && ws['!ref']) { const r = XLSX.utils.decode_range(ws['!ref']); rows = r.e.r - r.s.r + 1; }
      return { name, rows, preview: sheetToRows(XLSX, ws, 40) };
    });
  }
  g.OCX = { readBook, sheetToRows, describe, cellValue };
})(typeof self !== 'undefined' ? self : this);
