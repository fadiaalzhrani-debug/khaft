/* OneClick · spreadsheet parsing off the main thread, so a 200,000-row file does not freeze the page */
/* global importScripts, XLSX, OCX */
importScripts('../vendor/xlsx.full.min.js', 'xlsx-core.js');
let book = null;
self.onmessage = e => {
  const m = e.data || {};
  try {
    if (m.cmd === 'open') { book = OCX.readBook(XLSX, m.buf, m.name); self.postMessage({ id: m.id, ok: true, sheets: OCX.describe(XLSX, book) }); }
    else if (m.cmd === 'rows') { if (!book) throw new Error('no workbook'); self.postMessage({ id: m.id, ok: true, rows: OCX.sheetToRows(XLSX, book.Sheets[m.sheet]) }); }
    else if (m.cmd === 'close') { book = null; self.postMessage({ id: m.id, ok: true }); }
  } catch (err) { self.postMessage({ id: m.id, ok: false, error: String((err && err.message) || err) }); }
};
