/* OneClick · UI primitives: icons, escaping, modal, form builder, confirm, toast, CSV, formatting */
window.OC = window.OC || {};
(function (OC) {
  'use strict';

  /* ---------- escaping ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  OC.esc = esc;

  /* ---------- icons (24x24, stroke) ---------- */
  const P = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5a5 5 0 0 1 6 5"/>',
    box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5"/><path d="M12 12v9"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    cube: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z"/><path d="m3 7 9 5 9-5M12 12v10"/><path d="m7.5 4.5 9 5"/>',
    truck: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    car: '<path d="M5 17H3v-4l2.2-5.3A2 2 0 0 1 7 6.5h10a2 2 0 0 1 1.8 1.2L21 13v4h-2"/><path d="M3 13h18"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M9.5 17h5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    gauge: '<path d="M4 15a8 8 0 1 1 16 0"/><path d="m12 15 4-5"/><circle cx="12" cy="15" r="1.5"/><path d="M3 19h18"/>',
    swap: '<path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M8.5 14.5a6 6 0 1 1 7 0c-.7.6-1 1.4-1 2.5h-5c0-1.1-.3-1.9-1-2.5Z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 17v3h16v-3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 13A8.5 8.5 0 0 1 11 3a8.5 8.5 0 1 0 10 10Z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17.5v.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
    filter: '<path d="M3 5h18l-7 8v5l-4 2v-7L3 5Z"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    sparkles: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4M4 13a8 8 0 0 0 14.5 4"/><path d="M20 4v7h-7M4 20v-7h7"/>',
    play: '<path d="M7 4v16l13-8L7 4Z"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l2 2M18 5l2 2"/>',
    wrench: '<path d="M14.5 6.5a4 4 0 0 0 5 5L9 22l-3-3L16.5 8.5Z"/><path d="M20 3l-5.5 5.5"/>',
    printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    sunrise: '<path d="M4 17h16M6 13a6 6 0 0 1 12 0M12 3v4M3 10l1.5 1.5M21 10l-1.5 1.5"/>',
    moonstar: '<path d="M20 14.5A7.5 7.5 0 0 1 9.5 4a7.5 7.5 0 1 0 10.5 10.5Z"/><path d="m17 3 .6 1.8L19.5 5.5l-1.9.7L17 8l-.6-1.8L14.5 5.5l1.9-.7L17 3Z"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
    circle: '<circle cx="12" cy="12" r="5"/>',
    dash: '<path d="M6 12h12"/>'
  };
  OC.icon = (name, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.circle}</svg>`;

  /* ---------- formatting ---------- */
  const locale = () => (OC.db && OC.db.settings.lang === 'ar') ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB';
  OC.fmtDate = (iso, opts) => { if (!iso) return '—'; try { return new Intl.DateTimeFormat(locale(), opts || { day: 'numeric', month: 'short', year: 'numeric' }).format(OC.util.parseISO(iso)); } catch (e) { return iso; } };
  OC.fmtDateShort = iso => OC.fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  OC.fmtMonth = (y, m) => new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(new Date(y, m, 1));
  OC.fmtNum = n => new Intl.NumberFormat(locale()).format(n || 0);
  OC.initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  OC.hue = str => { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  OC.avatar = name => { const h = OC.hue(name); return `<span class="avatar" style="--c1:hsl(${h} 60% 52%);--c2:hsl(${(h + 40) % 360} 60% 38%)">${esc(OC.initials(name))}</span>`; };
  OC.pill = (kind, label, icon) => `<span class="pill ${kind}">${icon ? OC.icon(icon) : '<i class="dot"></i>'}${esc(label)}</span>`;
  OC.relDays = iso => { const d = OC.util.daysBetween(OC.util.today(), iso); if (d === 0) return OC.t('rel.today'); if (d === 1) return OC.t('rel.tomorrow'); if (d === -1) return OC.t('rel.yesterday'); return d > 0 ? OC.t('rel.inDays', { n: d }) : OC.t('rel.daysAgo', { n: -d }); };

  /* ---------- toast ---------- */
  OC.toast = (msg, type = 'ok', ms = 2600) => {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = OC.icon(type === 'err' ? 'alert' : type === 'info' ? 'info' : 'check') + `<span>${esc(msg)}</span>`;
    root.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, ms);
  };

  /* ---------- modal ---------- */
  const stack = [];
  OC.modal = ({ title, body, footer, narrow, onClose }) => {
    const root = document.getElementById('modal-root');
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="modal${narrow ? ' narrow' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="m-head"><h3>${esc(title)}</h3><button class="ibtn" data-close aria-label="${esc(OC.t('close'))}">${OC.icon('x')}</button></div>
      <div class="m-body"></div>${footer !== false ? '<div class="m-foot"></div>' : ''}</div>`;
    const bodyEl = ov.querySelector('.m-body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    const footEl = ov.querySelector('.m-foot');
    if (footEl && footer) { if (typeof footer === 'string') footEl.innerHTML = footer; else footEl.appendChild(footer); }
    const api = { el: ov, close() { if (!ov.isConnected) return; ov.remove(); stack.splice(stack.indexOf(api), 1); if (!stack.length) document.body.style.overflow = ''; onClose && onClose(); } };
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) api.close(); });
    root.appendChild(ov); stack.push(api); document.body.style.overflow = 'hidden';
    const first = ov.querySelector('input,select,textarea,button:not([data-close])'); if (first) setTimeout(() => first.focus(), 30);
    return api;
  };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close(); });
  OC.closeModals = () => { while (stack.length) stack[stack.length - 1].close(); };

  /* ---------- confirm ---------- */
  OC.confirm = ({ title, message, okLabel, danger = true }) => new Promise(resolve => {
    let settled = false; const finish = v => { if (!settled) { settled = true; resolve(v); } };
    const foot = document.createElement('div'); foot.style.display = 'contents';
    foot.innerHTML = `<button class="btn ghost" type="button" data-cancel>${esc(OC.t('cancel'))}</button><button class="btn ${danger ? 'danger' : 'primary'}" type="button" data-ok>${esc(okLabel || OC.t('delete'))}</button>`;
    const m = OC.modal({ title, body: `<p class="msg">${esc(message)}</p>`, footer: foot, narrow: true, onClose: () => finish(false) });
    foot.querySelector('[data-cancel]').onclick = () => m.close();
    foot.querySelector('[data-ok]').onclick = () => { finish(true); m.close(); };
  });

  /* ---------- form builder ----------
     fields: [{key,label,type:'text'|'number'|'select'|'date'|'time'|'textarea',options:[{value,label}],required,placeholder,min,max,step,full,list(datalist array)}] */
  OC.form = ({ title, fields, values = {}, submitLabel, onSubmit, extraButtons }) => {
    const form = document.createElement('form');
    form.className = 'form-grid'; form.noValidate = true;
    form.innerHTML = fields.map(f => {
      const id = 'f_' + f.key; const v = values[f.key] != null ? values[f.key] : (f.default != null ? f.default : '');
      const req = f.required ? ' <i>*</i>' : '';
      let ctl = '';
      if (f.type === 'select') ctl = `<select id="${id}" name="${f.key}" class="select">${(f.options || []).map(o => `<option value="${esc(o.value)}"${String(o.value) === String(v) ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
      else if (f.type === 'textarea') ctl = `<textarea id="${id}" name="${f.key}" class="textarea" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
      else ctl = `<input id="${id}" name="${f.key}" class="input" type="${f.type || 'text'}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}"${f.min != null ? ` min="${f.min}"` : ''}${f.max != null ? ` max="${f.max}"` : ''}${f.step != null ? ` step="${f.step}"` : ''}${f.list ? ` list="${id}_list"` : ''} autocomplete="off" />` + (f.list ? `<datalist id="${id}_list">${f.list.map(o => `<option value="${esc(o)}"></option>`).join('')}</datalist>` : '');
      return `<div class="field${f.full || f.type === 'textarea' ? ' full' : ''}"><label for="${id}">${esc(f.label)}${req}</label>${ctl}</div>`;
    }).join('') + '<div class="form-err full" role="alert"></div>';
    const foot = document.createElement('div'); foot.style.display = 'contents';
    foot.innerHTML = `${extraButtons || ''}<button class="btn ghost" type="button" data-cancel>${esc(OC.t('cancel'))}</button><button class="btn primary" type="submit" form="ocform">${OC.icon('check')}${esc(submitLabel || OC.t('save'))}</button>`;
    form.id = 'ocform';
    const m = OC.modal({ title, body: form, footer: foot });
    foot.querySelector('[data-cancel]').onclick = () => m.close();
    form.addEventListener('submit', e => {
      e.preventDefault();
      const out = {}; const err = form.querySelector('.form-err'); err.classList.remove('show');
      for (const f of fields) {
        const el = form.elements[f.key]; let val = el.value;
        if (f.type === 'number') val = val === '' ? '' : Number(val);
        if (typeof val === 'string') val = val.trim();
        if (f.required && (val === '' || val == null || Number.isNaN(val))) { err.textContent = OC.t('form.required', { field: f.label }); err.classList.add('show'); el.focus(); return; }
        if (f.type === 'number' && val !== '' && Number.isNaN(val)) { err.textContent = OC.t('form.number', { field: f.label }); err.classList.add('show'); el.focus(); return; }
        out[f.key] = val;
      }
      const res = onSubmit(out, m);
      if (typeof res === 'string') { err.textContent = res; err.classList.add('show'); return; }
      if (res !== false) m.close();
    });
    return m;
  };

  /* ---------- CSV / downloads ---------- */
  OC.download = (filename, text, mime = 'text/plain') => {
    const blob = new Blob(['﻿' + text], { type: mime + ';charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  OC.exportCSV = (filename, columns, rows) => {
    const cell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [columns.map(c => cell(c.label)).join(',')].concat(rows.map(r => columns.map(c => cell(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(',')));
    OC.download(filename, lines.join('\n'), 'text/csv');
    OC.toast(OC.t('exported', { n: rows.length }));
  };
  OC.copyText = async text => { try { await navigator.clipboard.writeText(text); OC.toast(OC.t('copied')); } catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); OC.toast(OC.t('copied')); } catch (e2) { OC.toast(OC.t('err.copy'), 'err'); } ta.remove(); } };

  /* ---------- small view helpers ---------- */
  OC.empty = (icon, title, hint) => `<div class="empty">${OC.icon(icon)}<b>${esc(title)}</b>${hint ? `<span>${esc(hint)}</span>` : ''}</div>`;
  OC.search = (value, placeholder, name = 'q') => `<div class="search">${OC.icon('search')}<input class="input" type="search" data-input="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" /></div>`;
  OC.options = (list, selected) => list.map(o => `<option value="${esc(o.value)}"${String(o.value) === String(selected) ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  OC.seg = (name, items, current) => `<div class="seg" role="tablist">${items.map(i => `<button type="button" role="tab" data-act="${name}" data-v="${esc(i.value)}" class="${String(i.value) === String(current) ? 'on' : ''}" aria-selected="${String(i.value) === String(current)}">${esc(i.label)}</button>`).join('')}</div>`;
  OC.gauge = (pct, opts = {}) => {
    const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
    const r = 80, cx = 100, cy = 95, len = Math.PI * r;
    const cls = p >= 70 ? '' : p >= 40 ? 'warn' : 'crit';
    return `<div class="gauge${opts.big ? ' big' : ''}" role="img" aria-label="${p}%">
      <svg viewBox="0 0 200 110"><path class="track" d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke-width="16" stroke-linecap="round"/>
      <path class="fill ${cls}" d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke-width="16" stroke-dasharray="${len.toFixed(1)}" stroke-dashoffset="${(len * (1 - p / 100)).toFixed(1)}"/></svg>
      <div class="num">${p}<small>%</small></div>${opts.caption ? `<div class="cap">${esc(opts.caption)}</div>` : ''}</div>`;
  };
})(window.OC);
