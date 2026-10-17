/* OneClick · Calendar
   Year planner: every day of the year across, team members down (names on the inline-start side),
   leave bars by type, drag on a row to plan a leave, daily "who is off" count against a limit,
   leave schedule, balances and conflicts. Month view: events and who is away each day. */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon, U = OC.util;
  const TYPES = ['meeting', 'maintenance', 'training', 'safety', 'other'];
  const LT = () => OC.LEAVE_TYPES;
  const ZOOM = { s: 12, m: 22, l: 32 }, NAMEW = 230;
  const now = new Date();
  const st = { tab: 'year', year: now.getFullYear(), y: now.getFullYear(), m: now.getMonth(), sel: U.today(), zoom: 'm', group: 'all', q: '', showPast: false, scroll: null, scrollKey: '' };
  let drag = null;

  /* ---------- leave helpers ---------- */
  const weekendDays = () => ({ fs: [5, 6], ss: [6, 0], f: [5] })[OC.db.settings.weekend || 'fs'];
  const isWeekend = d => weekendDays().includes(d.getDay());
  const daysInYear = y => (new Date(y, 1, 29).getMonth() === 1 ? 366 : 365);
  function leaveDays(l, from, to) {
    const a = from || l.from, b = to || l.to; if (b < a) return 0;
    if (OC.db.settings.leaveCount !== 'working') return U.daysBetween(a, b) + 1;
    let n = 0; for (let d = U.parseISO(a); U.toISO(d) <= b; d.setDate(d.getDate() + 1)) if (!isWeekend(d)) n++;
    return n;
  }
  const person = id => OC.find('team', id);
  const ltLabel = k => t('cal.lt.' + k);
  const groups = () => [...new Set(OC.db.team.map(m => m.group).filter(Boolean))].sort();
  function people() {
    const q = st.q.toLowerCase();
    return OC.db.team.filter(m => (st.group === 'all' || m.group === st.group) && (!q || [m.name, m.badge, m.group, m.role].some(x => String(x || '').toLowerCase().includes(q)))).sort((a, b) => a.name.localeCompare(b.name));
  }
  const yearLeaves = Y => OC.db.leaves.filter(l => l.to >= `${Y}-01-01` && l.from <= `${Y}-12-31` && person(l.personId));
  function offCounts(Y, ppl) {
    const n = daysInYear(Y), counts = new Array(n).fill(0), names = Array.from({ length: n }, () => []), ids = new Set(ppl.map(p => p.id)), y0 = `${Y}-01-01`;
    yearLeaves(Y).forEach(l => { if (!ids.has(l.personId)) return; const a = Math.max(0, U.daysBetween(y0, l.from)), b = Math.min(n - 1, U.daysBetween(y0, l.to)); const nm = person(l.personId).name; for (let d = a; d <= b; d++) { counts[d]++; names[d].push(nm); } });
    return { counts, names };
  }
  function conflicts(Y, ppl) {
    const { counts, names } = offCounts(Y, ppl), max = OC.db.settings.maxOff, out = []; let cur = null;
    counts.forEach((c, d) => { if (c > max) { if (!cur) { cur = { a: d, b: d, peak: c, names: new Set() }; out.push(cur); } cur.b = d; cur.peak = Math.max(cur.peak, c); names[d].forEach(x => cur.names.add(x)); } else cur = null; });
    const iso = d => U.addDays(`${Y}-01-01`, d);
    return out.map(c => ({ from: iso(c.a), to: iso(c.b), peak: c.peak, names: [...c.names] }));
  }
  const overlapOf = (pid, from, to, except) => OC.db.leaves.find(l => l.personId === pid && l.id !== except && l.from <= to && l.to >= from);
  const awayOn = iso => OC.db.leaves.filter(l => l.from <= iso && l.to >= iso && person(l.personId));
  OC.awayOn = awayOn;

  const member = () => OC.auth.enabled() && !OC.auth.isAdmin();
  const myPerson = () => { const u = OC.auth.current(); return u ? u.personId : ''; };
  function leaveForm(id, preset) {
    const l = id ? OC.find('leaves', id) : null;
    if (!OC.db.team.length) { OC.toast(t('cal.needTeam'), 'info'); return; }
    if (member()) {
      if (!myPerson()) { OC.toast(t('auth.noPersonLink'), 'info', 4500); return; }
      if ((l && l.personId !== myPerson()) || (preset && preset.personId && preset.personId !== myPerson())) { OC.toast(t('auth.ownRowOnly'), 'info'); return; }
    }
    const team = OC.db.team.slice().sort((a, b) => a.name.localeCompare(b.name)).filter(p => !member() || p.id === myPerson());
    const m = OC.form({
      title: l ? t('cal.editLeave') : t('cal.addLeave'),
      extraButtons: l ? `<button class="btn danger" type="button" data-ldel>${I('trash')}${esc(t('delete'))}</button>` : '',
      fields: [
        { key: 'personId', label: t('cal.f.person'), type: 'select', options: team.map(p => ({ value: p.id, label: p.name })), full: true },
        { key: 'type', label: t('cal.f.type'), type: 'select', options: LT().map(k => ({ value: k, label: ltLabel(k) })), full: true },
        { key: 'from', label: t('cal.f.from'), type: 'date', required: true },
        { key: 'to', label: t('cal.f.to'), type: 'date', required: true },
        { key: 'notes', label: t('notes'), type: 'textarea' }
      ],
      values: l || Object.assign({ type: 'annual', personId: team[0].id, from: U.today(), to: U.today() }, preset || {}),
      onSubmit(v) {
        if (v.to < v.from) return t('cal.toBeforeFrom');
        const ov = overlapOf(v.personId, v.from, v.to, l && l.id);
        if (ov) return t('cal.overlap', { type: ltLabel(ov.type), from: OC.fmtDate(ov.from), to: OC.fmtDate(ov.to) });
        if (l) Object.assign(l, v); else OC.db.leaves.push(Object.assign({ id: U.uid() }, v));
        OC.save();
        const Y = Number(v.from.slice(0, 4)), c = conflicts(Y, OC.db.team).filter(x => x.from <= v.to && x.to >= v.from);
        if (c.length) OC.toast(t('cal.conflictWarn', { max: OC.db.settings.maxOff }), 'info', 5000); else OC.toast(t('saved'));
        OC.refresh();
      }
    });
    const del = m.el.querySelector('[data-ldel]');
    if (del) del.onclick = async () => { if (!(await OC.confirm({ title: t('cal.deleteLeave'), message: t('cal.deleteLeaveMsg', { name: (person(l.personId) || {}).name || '', from: OC.fmtDate(l.from), to: OC.fmtDate(l.to) }) }))) return; OC.remove('leaves', l.id); OC.save(); m.close(); OC.toast(t('deleted')); OC.refresh(); };
  }
  function rulesForm() {
    const s = OC.db.settings;
    OC.form({
      title: t('cal.rules'),
      fields: [
        { key: 'maxOff', label: t('cal.f.maxOff'), type: 'number', min: 1, max: 99, step: 1, required: true },
        { key: 'annualDays', label: t('cal.f.annualDays'), type: 'number', min: 0, max: 365, step: 1, required: true },
        { key: 'weekend', label: t('cal.f.weekend'), type: 'select', options: [{ value: 'fs', label: t('cal.we.fs') }, { value: 'ss', label: t('cal.we.ss') }, { value: 'f', label: t('cal.we.f') }] },
        { key: 'leaveCount', label: t('cal.f.leaveCount'), type: 'select', options: [{ value: 'calendar', label: t('cal.lc.calendar') }, { value: 'working', label: t('cal.lc.working') }] }
      ],
      values: { maxOff: s.maxOff, annualDays: s.annualDays, weekend: s.weekend, leaveCount: s.leaveCount },
      onSubmit(v) { Object.assign(s, v); OC.save(); OC.toast(t('saved')); OC.refresh(); }
    });
  }

  /* ---------- events (month view) ---------- */
  const byDate = () => { const map = {}; OC.db.events.forEach(e => (map[e.date] = map[e.date] || []).push(e)); Object.values(map).forEach(l => l.sort((a, b) => (a.time || '').localeCompare(b.time || ''))); return map; };
  function eventForm(id, date) {
    const existing = id ? OC.find('events', id) : null;
    OC.form({
      title: existing ? t('calendar.edit') : t('calendar.add'),
      fields: [
        { key: 'title', label: t('calendar.f.title'), required: true, full: true },
        { key: 'date', label: t('calendar.f.date'), type: 'date', required: true },
        { key: 'time', label: t('calendar.f.time'), type: 'time' },
        { key: 'type', label: t('calendar.f.type'), type: 'select', options: TYPES.map(x => ({ value: x, label: t('calendar.t.' + x) })) },
        { key: 'notes', label: t('calendar.f.notes'), type: 'textarea' }
      ],
      values: existing || { date: date || st.sel, time: '08:00', type: 'meeting' },
      onSubmit(v) {
        if (existing) Object.assign(existing, v); else OC.db.events.push(Object.assign({ id: U.uid() }, v));
        st.sel = v.date; const d = U.parseISO(v.date); st.y = d.getFullYear(); st.m = d.getMonth();
        OC.save(); OC.toast(t('saved')); OC.refresh();
      }
    });
  }
  const evRow = (e, showDate) => `<div class="ev"><div class="when">${esc(e.time || '—')}${showDate ? `<small>${esc(OC.fmtDateShort(e.date))}</small>` : ''}</div>
    <div style="min-width:0"><b>${esc(e.title)}</b><div class="row" style="gap:6px;margin-top:3px"><span class="chip ${esc(e.type)}">${esc(t('calendar.t.' + e.type))}</span>${e.notes ? `<p>${esc(e.notes)}</p>` : ''}</div></div>
    <div class="acts"><button class="btn ghost icon sm" data-act="editEv" data-id="${e.id}" aria-label="${esc(t('edit'))}">${I('edit')}</button><button class="btn ghost icon sm" data-act="delEv" data-id="${e.id}" aria-label="${esc(t('delete'))}">${I('trash')}</button></div></div>`;

  /* ---------- year planner ---------- */
  function yearView() {
    const Y = st.year, n = daysInYear(Y), dw = ZOOM[st.zoom], y0 = `${Y}-01-01`, today = U.today(), ti = today.slice(0, 4) === String(Y) ? U.daysBetween(y0, today) : -1;
    const ppl = people(), { counts, names } = offCounts(Y, ppl), max = OC.db.settings.maxOff, evs = byDate();
    const loc = OC.db.settings.lang === 'ar' ? 'ar' : 'en';
    const monthFmt = new Intl.DateTimeFormat(loc, { month: dw >= 20 ? 'long' : 'short' }), wdFmt = new Intl.DateTimeFormat(loc, { weekday: 'narrow' });
    let months = '', dayHead = '', bg = '', off = '';
    for (let mo = 0; mo < 12; mo++) {
      const a = U.daysBetween(y0, U.toISO(new Date(Y, mo, 1))), len = new Date(Y, mo + 1, 0).getDate();
      months += `<div class="yp-mon" style="inset-inline-start:${a * dw}px;width:${len * dw}px"><span>${esc(monthFmt.format(new Date(Y, mo, 1)))}</span></div>`;
      if (mo) bg += `<i class="yp-msep" style="inset-inline-start:${a * dw}px"></i>`;
    }
    for (let d = 0; d < n; d++) {
      const date = new Date(Y, 0, 1 + d), iso = U.toISO(date), we = isWeekend(date), ev = evs[iso];
      const tip = OC.fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long' }) + (ev ? ' · ' + ev.map(e => e.title).join(' · ') : '');
      dayHead += `<button type="button" class="yp-d${we ? ' we' : ''}${d === ti ? ' today' : ''}${ev ? ' has-ev' : ''}" style="inset-inline-start:${d * dw}px;width:${dw}px" data-act="gotoDay" data-date="${iso}" title="${esc(tip)}">${dw >= 20 ? `<b>${date.getDate()}</b><small>${esc(wdFmt.format(date))}</small>` : ''}</button>`;
      if (we || d === ti) bg += `<i class="yp-col${we ? ' we' : ''}${d === ti ? ' today' : ''}" style="inset-inline-start:${d * dw}px;width:${dw}px"></i>`;
      if (counts[d]) off += `<span class="yp-o${counts[d] > max ? ' over' : ''}" style="inset-inline-start:${d * dw}px;width:${dw}px;--a:${Math.min(1, counts[d] / Math.max(1, max)).toFixed(2)}" title="${esc(OC.fmtDate(iso) + ' · ' + t('cal.offN', { n: counts[d] }) + ': ' + names[d].join('، '))}">${dw >= 20 ? counts[d] : ''}</span>`;
    }
    const ly = yearLeaves(Y), ent = OC.db.settings.annualDays, pendingLv = OC.auth.pendingLeaves().filter(l => l.to >= y0 && l.from <= `${Y}-12-31`);
    const rows = ppl.map(p => {
      const mine = ly.filter(l => l.personId === p.id).concat(pendingLv.filter(l => l.personId === p.id));
      const used = mine.filter(l => l.type === 'annual').reduce((s, l) => s + leaveDays(l, l.from < y0 ? y0 : l.from, l.to > `${Y}-12-31` ? `${Y}-12-31` : l.to), 0);
      const bars = mine.map(l => {
        const a = Math.max(0, U.daysBetween(y0, l.from)), b = Math.min(n - 1, U.daysBetween(y0, l.to)), w = (b - a + 1) * dw - 2, days = leaveDays(l);
        const tip = `${p.name} · ${ltLabel(l.type)} · ${OC.fmtDate(l.from)} – ${OC.fmtDate(l.to)} (${t('cal.daysN', { n: days })})${l.notes ? ' · ' + l.notes : ''}`;
        if (l._pending) return `<span class="yp-bar lv-${l.type} pending" style="inset-inline-start:${a * dw + 1}px;width:${Math.max(4, w)}px" title="${esc(tip + ' · ' + t('auth.waiting'))}">${w >= 64 ? `<span>${esc(t('auth.waitingShort'))}</span>` : ''}</span>`;
        return `<button type="button" class="yp-bar lv-${l.type}" data-act="leave" data-id="${l.id}" style="inset-inline-start:${a * dw + 1}px;width:${Math.max(4, w)}px" title="${esc(tip)}" aria-label="${esc(tip)}">${w >= 64 ? `<span>${esc(ltLabel(l.type))} · ${days}</span>` : ''}</button>`;
      }).join('');
      return `<div class="yp-row"><div class="yp-name"><div class="who">${OC.avatar(p.name)}<div><b>${esc(p.name)}</b><small>${esc(p.group || p.role || '')}</small></div></div><span class="yp-bal${used > ent ? ' over' : ''}" title="${esc(t('cal.balanceTip', { used, ent }))}">${used}/${ent}</span></div><div class="yp-track" data-track data-pid="${p.id}"><span class="yp-rule"></span>${bars}</div></div>`;
    }).join('');
    return `
      <div class="toolbar">
        <div class="row"><button class="btn icon sm" data-act="yprev" aria-label="${esc(t('prev'))}">${I('left')}</button><h3 class="yp-year">${Y}</h3><button class="btn icon sm" data-act="ynext" aria-label="${esc(t('next'))}">${I('right')}</button><button class="btn sm" data-act="ytoday">${esc(t('rel.today'))}</button></div>
        ${OC.search(st.q, t('cal.searchPeople'))}
        ${groups().length ? `<select class="select" style="width:auto" data-change="group" aria-label="${esc(t('team.f.group'))}">${OC.options([{ value: 'all', label: t('team.allGroups') }].concat(groups().map(g => ({ value: g, label: g }))), st.group)}</select>` : ''}
        ${OC.seg('zoom', [{ value: 's', label: 'S' }, { value: 'm', label: 'M' }, { value: 'l', label: 'L' }], st.zoom)}
      </div>
      <div class="legend">${LT().map(k => `<span><i class="lv-sw lv-${k}"></i>${esc(ltLabel(k))}</span>`).join('')}<span class="muted">${esc(t('cal.dragHint'))}</span></div>
      <div class="yp card" data-yp style="--dw:${dw}px;--namew:${NAMEW}px">
        <div class="yp-inner" style="width:${NAMEW + n * dw}px">
          <div class="yp-head">
            <div class="yp-hrow h-mon"><div class="yp-name corner">${esc(t('cal.team'))} <span class="muted small">(${ppl.length})</span></div><div class="yp-track">${months}</div></div>
            <div class="yp-hrow h-day"><div class="yp-name corner"></div><div class="yp-track">${dayHead}</div></div>
            <div class="yp-hrow h-off"><div class="yp-name corner"><span>${esc(t('cal.offRow'))}</span><span class="muted small">${esc(t('cal.maxN', { n: max }))}</span></div><div class="yp-track">${off}</div></div>
          </div>
          <div class="yp-body"><div class="yp-bg" style="inset-inline-start:${NAMEW}px;width:${n * dw}px">${bg}</div>${rows || `<div class="yp-row"><div class="yp-name"><span class="muted small">${esc(t('team.empty'))}</span></div><div class="yp-track"></div></div>`}</div>
        </div>
      </div>
      ${scheduleCards(Y, ppl)}`;
  }
  function scheduleCards(Y, ppl) {
    const ids = new Set(ppl.map(p => p.id)), today = U.today(), max = OC.db.settings.maxOff;
    const cs = conflicts(Y, ppl), list = yearLeaves(Y).filter(l => ids.has(l.personId) && (st.showPast || l.to >= today)).sort((a, b) => a.from.localeCompare(b.from) || person(a.personId).name.localeCompare(person(b.personId).name));
    const inConflict = l => cs.some(c => c.from <= l.to && c.to >= l.from);
    const ent = OC.db.settings.annualDays, y0 = `${Y}-01-01`, y1 = `${Y}-12-31`;
    const clip = l => leaveDays(l, l.from < y0 ? y0 : l.from, l.to > y1 ? y1 : l.to);
    const bal = ppl.map(p => { const mine = yearLeaves(Y).filter(l => l.personId === p.id); const used = mine.filter(l => l.type === 'annual').reduce((s, l) => s + clip(l), 0); const other = mine.filter(l => l.type !== 'annual').reduce((s, l) => s + clip(l), 0); const next = mine.filter(l => l.from >= today).sort((a, b) => a.from.localeCompare(b.from))[0]; return { p, used, other, next }; });
    return `<div class="grid-3 mt">
      <div class="card pad"><div class="row between"><h3>${I('calendar')}${esc(t('cal.schedule'))}</h3><label class="check small"><input type="checkbox" data-change="showPast" ${st.showPast ? 'checked' : ''}/> ${esc(t('cal.showPast'))}</label></div>
        <div class="mt lv-list">${list.length ? list.map(l => { const p = person(l.personId), past = l.to < today, now = l.from <= today && l.to >= today; return `<button type="button" class="lv-item${past ? ' past' : ''}" data-act="leave" data-id="${l.id}"><i class="lv-sw lv-${l.type}"></i><span class="lv-txt"><b>${esc(p.name)}</b><small>${esc(ltLabel(l.type))} · ${esc(OC.fmtDate(l.from, { day: 'numeric', month: 'short' }))} – ${esc(OC.fmtDate(l.to, { day: 'numeric', month: 'short' }))} · ${esc(t('cal.daysN', { n: leaveDays(l) }))}</small></span>${now ? OC.pill('info', t('cal.now'), 'clock') : ''}${inConflict(l) ? OC.pill('crit', t('cal.conflict'), 'alert') : ''}</button>`; }).join('') : `<p class="muted small">${esc(t('cal.noLeaves'))}</p>`}</div></div>
      <div class="card pad"><h3>${I('users')}${esc(t('cal.balances'))}</h3><p class="muted small">${esc(t('cal.balancesHint', { n: ent }))}</p>
        <div class="stack mt" style="gap:10px">${bal.map(b => `<div><div class="row between small"><b>${esc(b.p.name)}</b><span class="${b.used > ent ? 'crit-txt' : 'muted'}">${b.used}/${ent}${b.other ? ' · ' + esc(t('cal.otherN', { n: b.other })) : ''}</span></div><div class="progress" style="margin-top:4px"><i class="${b.used > ent ? 'crit' : ''}" style="width:${ent ? Math.min(100, Math.round(b.used / ent * 100)) : 0}%"></i></div>${b.next ? `<small class="muted">${esc(t('cal.nextLeave', { date: OC.fmtDate(b.next.from), type: ltLabel(b.next.type) }))}</small>` : ''}</div>`).join('') || `<p class="muted small">${esc(t('team.empty'))}</p>`}</div></div>
      <div class="card pad"><h3>${I('alert')}${esc(t('cal.conflicts'))}</h3><p class="muted small">${esc(t('cal.conflictsHint', { n: max }))}</p>
        <div class="stack mt" style="gap:8px">${cs.length ? cs.map(c => `<div class="issue"><span style="flex:1"><b>${esc(OC.fmtDate(c.from, { day: 'numeric', month: 'short' }))}${c.to !== c.from ? ' – ' + esc(OC.fmtDate(c.to, { day: 'numeric', month: 'short' })) : ''}</b> · ${esc(t('cal.offN', { n: c.peak }))}<small class="muted" style="display:block">${esc(c.names.join('، '))}</small></span></div>`).join('') : `<p class="small">${OC.pill('good', t('cal.noConflicts'), 'check')}</p>`}</div></div>
    </div>`;
  }
  function mountYear(root) {
    const box = root.querySelector('[data-yp]'); if (!box) return;
    const dw = ZOOM[st.zoom], rtl = document.documentElement.dir === 'rtl', key = `${st.year}|${st.zoom}|${rtl}`;
    const setStart = v => { box.scrollLeft = rtl ? -v : v; };
    const getStart = () => Math.abs(box.scrollLeft);
    if (st.scrollKey === key && st.scroll != null) setStart(st.scroll);
    else {
      const ti = U.today().slice(0, 4) === String(st.year) ? U.daysBetween(`${st.year}-01-01`, U.today()) : 0;
      setStart(Math.max(0, ti * dw - (box.clientWidth - NAMEW) / 3));
      st.scrollKey = key;
    }
    box.addEventListener('scroll', () => { st.scroll = getStart(); }, { passive: true });
    const n = daysInYear(st.year);
    const dayAt = (tr, e) => { const r = tr.getBoundingClientRect(); const x = rtl ? r.right - e.clientX : e.clientX - r.left; return Math.max(0, Math.min(n - 1, Math.floor(x / dw))); };
    root.querySelectorAll('[data-track][data-pid]').forEach(tr => {
      tr.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target.closest('.yp-bar')) return;
        const d = dayAt(tr, e); const el = document.createElement('i'); el.className = 'yp-sel'; tr.appendChild(el);
        drag = { tr, pid: tr.dataset.pid, a: d, b: d, el, moved: false };
        const paint = () => { const a = Math.min(drag.a, drag.b), b = Math.max(drag.a, drag.b); el.style.insetInlineStart = (a * dw) + 'px'; el.style.width = ((b - a + 1) * dw) + 'px'; el.dataset.n = String(b - a + 1); };
        paint(); drag.paint = paint;
        if (e.pointerType === 'mouse') { tr.setPointerCapture(e.pointerId); e.preventDefault(); }
      });
      tr.addEventListener('pointermove', e => { if (!drag || drag.tr !== tr) return; const d = dayAt(tr, e); if (d !== drag.b) { drag.b = d; drag.moved = true; drag.paint(); } });
      const end = cancel => () => {
        if (!drag || drag.tr !== tr) return; const g = drag; drag = null; g.el.remove(); if (cancel) return;
        const a = Math.min(g.a, g.b), b = Math.max(g.a, g.b), y0 = `${st.year}-01-01`;
        leaveForm(null, { personId: g.pid, from: U.addDays(y0, a), to: U.addDays(y0, b), type: 'annual' });
      };
      tr.addEventListener('pointerup', end(false)); tr.addEventListener('pointercancel', end(true));
    });
  }

  /* ---------- month view ---------- */
  function monthView() {
    const map = byDate(), today = U.today();
    const firstDay = Number(OC.db.settings.firstDay || 0);
    const first = new Date(st.y, st.m, 1), lead = (first.getDay() - firstDay + 7) % 7, start = new Date(st.y, st.m, 1 - lead);
    const cells = []; for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); cells.push(d); }
    if (cells[35].getMonth() !== st.m) cells.length = 35;
    const dows = []; for (let i = 0; i < 7; i++) { const d = new Date(2024, 0, 7 + ((firstDay + i) % 7)); dows.push(new Intl.DateTimeFormat(OC.db.settings.lang === 'ar' ? 'ar' : 'en', { weekday: 'short' }).format(d)); }
    const selList = map[st.sel] || [], away = awayOn(st.sel);
    const upcoming = OC.db.events.filter(e => e.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 8);
    return `
      <div class="split">
        <div class="card pad">
          <div class="cal-head"><h3>${esc(OC.fmtMonth(st.y, st.m))}</h3><div class="row"><button class="btn sm" data-act="today">${esc(t('rel.today'))}</button><button class="btn icon sm" data-act="prev" aria-label="${esc(t('prev'))}">${I('left')}</button><button class="btn icon sm" data-act="next" aria-label="${esc(t('next'))}">${I('right')}</button></div></div>
          <div class="cal-grid">${dows.map(d => `<div class="cal-dow">${esc(d)}</div>`).join('')}
          ${cells.map(d => { const iso = U.toISO(d), evs = map[iso] || [], out = d.getMonth() !== st.m, off = awayOn(iso);
            return `<button type="button" class="cal-cell${out ? ' out' : ''}${iso === today ? ' today' : ''}${iso === st.sel ? ' sel' : ''}${isWeekend(d) ? ' we' : ''}" data-act="sel" data-date="${iso}" aria-label="${esc(OC.fmtDate(iso))}">
              <span class="d"><span>${d.getDate()}</span>${evs.length ? `<small class="muted">${evs.length}</small>` : ''}</span>
              ${evs.slice(0, 2).map(e => `<span class="chip ${esc(e.type)}">${esc((e.time ? e.time + ' ' : '') + e.title)}</span>`).join('')}
              ${evs.length > 2 ? `<span class="more">+${evs.length - 2}</span>` : ''}
              ${off.length ? `<span class="chip off" title="${esc(off.map(l => person(l.personId).name + ' · ' + ltLabel(l.type)).join('\n'))}">${I('users')} ${esc(t('cal.offN', { n: off.length }))}</span>` : ''}
              <span class="dots">${evs.slice(0, 3).map(() => `<i class="dot" style="width:5px;height:5px;color:var(--accent)"></i>`).join('')}${off.length ? '<i class="dot" style="width:5px;height:5px;color:var(--info)"></i>' : ''}</span></button>`; }).join('')}
          </div>
        </div>
        <div class="stack">
          <div class="card pad"><div class="row between"><h3>${I('calendar')}${esc(OC.fmtDate(st.sel, { weekday: 'long', day: 'numeric', month: 'long' }))}</h3><button class="btn sm" data-act="addOn">${I('plus')}${esc(t('add'))}</button></div>
            <div class="mt">${selList.length ? selList.map(e => evRow(e)).join('') : `<p class="muted small">${esc(t('calendar.noneDay'))}</p>`}</div>
            ${away.length ? `<h4 class="imp-h">${esc(t('cal.awayDay', { n: away.length }))}</h4><div class="lv-list">${away.map(l => `<button type="button" class="lv-item" data-act="leave" data-id="${l.id}"><i class="lv-sw lv-${l.type}"></i><span class="lv-txt"><b>${esc(person(l.personId).name)}</b><small>${esc(ltLabel(l.type))} · ${esc(t('cal.until', { date: OC.fmtDate(l.to) }))}</small></span></button>`).join('')}</div>` : ''}</div>
          <div class="card pad"><h3>${I('clock')}${esc(t('calendar.upcoming'))}</h3>
            <div class="mt">${upcoming.length ? upcoming.map(e => evRow(e, true)).join('') : `<p class="muted small">${esc(t('calendar.noneUpcoming'))}</p>`}</div></div>
        </div>
      </div>`;
  }

  /* ---------- Excel import ---------- */
  const LEAVE_ALIASES = {
    annual: ['vacation', 'annual leave', 'leave', 'al', 'holiday', 'اجازة', 'إجازة', 'سنوية', 'إجازة سنوية'],
    sick: ['sick', 'sick leave', 'sl', 'medical', 'مرضية', 'مرضي', 'إجازة مرضية'],
    emergency: ['emergency', 'el', 'urgent', 'اضطرارية', 'طارئة', 'إجازة اضطرارية'],
    training: ['training', 'course', 'دورة', 'تدريب'],
    mission: ['business trip', 'trip', 'mission', 'assignment', 'انتداب', 'مهمة', 'رحلة عمل'],
    off: ['off', 'rest', 'day off', 'راحة', 'أوف', 'اوف'],
    other: ['other', 'أخرى']
  };
  const leaveSpec = {
    id: 'leaves', icon: 'calendar', title: () => t('cal.leaves'), hint: () => t('cal.impHint'),
    count: () => OC.db.leaves.length,
    fields: [
      { key: 'name', label: 'team.f.name', required: true, aliases: ['name', 'employee', 'employee name', 'الاسم', 'اسم الموظف', 'الموظف'] },
      { key: 'badge', label: 'team.f.badge', aliases: ['badge', 'id', 'emp no', 'employee id', 'الرقم الوظيفي', 'رقم الموظف'] },
      { key: 'type', label: 'cal.f.type', aliases: ['type', 'leave type', 'نوع الإجازة', 'النوع'] },
      { key: 'from', label: 'cal.f.from', type: 'date', required: true, aliases: ['from', 'start', 'start date', 'begin', 'من', 'بداية', 'تاريخ البداية', 'من تاريخ', 'تاريخ البدء'] },
      { key: 'to', label: 'cal.f.to', type: 'date', aliases: ['to', 'end', 'end date', 'until', 'return', 'إلى', 'الى', 'نهاية', 'تاريخ النهاية', 'إلى تاريخ', 'تاريخ العودة'] },
      { key: 'days', label: 'cal.f.days', type: 'number', aliases: ['days', 'duration', 'no of days', 'عدد الأيام', 'المدة', 'الأيام'] },
      { key: 'notes', label: 'notes', aliases: ['notes', 'remarks', 'comment', 'ملاحظات', 'ملاحظة'] }
    ],
    modes: [{ value: 'append', label: () => t('imp.m.append'), hint: () => t('cal.m.appendHint') }, { value: 'replace', label: () => t('imp.m.replace'), hint: () => t('cal.m.replaceHint') }],
    options: [{ key: 'create', label: () => t('imp.createPeople'), default: true }],
    template: () => { const n = OC.db.team.slice(0, 2).map(m => m.name); return [[t('team.f.name'), t('team.f.badge'), t('cal.f.type'), t('cal.f.from'), t('cal.f.to'), t('notes')], [n[0] || 'Ahmed', '', ltLabel('annual'), U.addDays(U.today(), 20), U.addDays(U.today(), 33), ''], [n[1] || 'Sara', '', ltLabel('training'), U.addDays(U.today(), 7), U.addDays(U.today(), 9), 'Rigging course']]; },
    async run({ records, mode, options }) {
      if (mode === 'replace') OC.db.leaves = [];
      OC.findPerson.created = 0;
      const table = OC.cells.enumTable(LT(), 'cal.lt.', LEAVE_ALIASES); let added = 0, dup = 0, missing = 0;
      records.forEach(r => {
        const p = OC.findPerson(r.name, r.badge, options.create); if (!p) { missing++; return; }
        let from = r.from, to = r.to || (r.days ? U.addDays(from, Math.max(1, r.days) - 1) : from); if (to < from) [from, to] = [to, from];
        const type = OC.cells.matchEnum(r.type, table, 'annual');
        if (OC.db.leaves.some(l => l.personId === p.id && l.from === from && l.to === to && l.type === type)) { dup++; return; }
        OC.db.leaves.push({ id: U.uid(), personId: p.id, type, from, to, notes: r.notes || '' }); added++;
      });
      return t('cal.imported', { n: added, p: OC.findPerson.created || 0 }) + (dup ? ' ' + t('imp.dups', { n: dup }) : '') + (missing ? ' ' + t('imp.unknownPeople', { n: missing }) : '');
    }
  };
  const eventSpec = {
    id: 'events', icon: 'clock', title: () => t('cal.events'), count: () => OC.db.events.length,
    fields: [
      { key: 'title', label: 'calendar.f.title', required: true, aliases: ['title', 'event', 'subject', 'activity', 'العنوان', 'الحدث', 'النشاط', 'الموضوع'] },
      { key: 'date', label: 'calendar.f.date', type: 'date', required: true, aliases: ['date', 'day', 'التاريخ', 'اليوم'] },
      { key: 'time', label: 'calendar.f.time', aliases: ['time', 'start time', 'الوقت', 'الساعة'] },
      { key: 'type', label: 'calendar.f.type', aliases: ['type', 'category', 'النوع'] },
      { key: 'notes', label: 'calendar.f.notes', aliases: ['notes', 'location', 'details', 'ملاحظات', 'المكان', 'التفاصيل'] }
    ],
    modes: [{ value: 'append', label: () => t('imp.m.append') }, { value: 'replace', label: () => t('imp.m.replace') }],
    template: () => [[t('calendar.f.title'), t('calendar.f.date'), t('calendar.f.time'), t('calendar.f.type'), t('calendar.f.notes')], ['Toolbox talk', U.today(), '07:30', t('calendar.t.safety'), ''], ['Monthly KPI review', U.addDays(U.today(), 5), '09:00', t('calendar.t.meeting'), 'Room 2']],
    async run({ records, mode }) {
      if (mode === 'replace') OC.db.events = [];
      const table = OC.cells.enumTable(TYPES, 'calendar.t.', { safety: ['hse', 'سلامة'], maintenance: ['pm', 'صيانة'], meeting: ['اجتماع'] });
      records.forEach(r => { let time = String(r.time || ''); if (/^0?\.\d+$/.test(time)) { const mins = Math.round(Number(time) * 1440); time = String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0'); } const m = time.match(/(\d{1,2})[:.](\d{2})/); time = m ? m[1].padStart(2, '0') + ':' + m[2] : ''; OC.db.events.push({ id: U.uid(), title: r.title, date: r.date, time, type: OC.cells.matchEnum(r.type, table, 'other'), notes: r.notes || '' }); });
      return t('cal.evImported', { n: records.length });
    }
  };

  /* ---------- module ---------- */
  OC.modules.calendar = {
    id: 'calendar', icon: 'calendar', order: 3,
    title: () => t('calendar.title'), tagline: () => t('calendar.tag'),
    count: () => { const n = awayOn(U.today()).length; return n || ''; },
    importSpecs: [leaveSpec, eventSpec], awayOn, leaveDays,
    render() {
      return `
      <div class="page-head"><div><h2>${esc(t('calendar.title'))}</h2><p>${esc(st.tab === 'year' ? t('cal.yearDesc') : t('calendar.desc'))}</p></div>
        <div class="actions">${OC.seg('tab', [{ value: 'year', label: t('cal.yearTab') }, { value: 'month', label: t('cal.monthTab') }], st.tab)}
          ${st.tab === 'year' ? `<button class="btn" data-act="rules">${I('settings')}${esc(t('cal.rules'))}</button><button class="btn" data-act="importLeaves">${I('upload')}${esc(t('imp.button'))}</button><button class="btn primary" data-act="addLeave">${I('plus')}${esc(t('cal.addLeave'))}</button>`
          : `<button class="btn" data-act="importEvents">${I('upload')}${esc(t('imp.button'))}</button><button class="btn primary" data-act="add">${I('plus')}${esc(t('calendar.add'))}</button>`}</div></div>
      ${st.tab === 'year' ? yearView() : monthView()}`;
    },
    mount(root) { if (st.tab === 'year') mountYear(root); },
    actions: {
      tab: d => { st.tab = d.v; OC.refresh(); },
      rules: () => rulesForm(),
      importLeaves: () => OC.importer.open(leaveSpec), importEvents: () => OC.importer.open(eventSpec),
      addLeave: () => leaveForm(), leave: d => leaveForm(d.id),
      yprev: () => { st.year--; OC.refresh(); }, ynext: () => { st.year++; OC.refresh(); },
      ytoday: () => { st.year = new Date().getFullYear(); st.scrollKey = ''; OC.refresh(); },
      zoom: d => { st.zoom = d.v; OC.refresh(); },
      group: (d, el) => { st.group = el.value; OC.refresh(); },
      q: (d, el) => { st.q = el.value; OC.refresh(); },
      showPast: (d, el) => { st.showPast = el.checked; OC.refresh(); },
      gotoDay: d => { const dt = U.parseISO(d.date); st.tab = 'month'; st.y = dt.getFullYear(); st.m = dt.getMonth(); st.sel = d.date; OC.refresh(); },
      add: () => eventForm(), addOn: () => eventForm(null, st.sel), editEv: d => eventForm(d.id),
      sel: d => { st.sel = d.date; const dt = U.parseISO(d.date); if (dt.getMonth() !== st.m) { st.y = dt.getFullYear(); st.m = dt.getMonth(); } OC.refresh(); },
      prev: () => { st.m--; if (st.m < 0) { st.m = 11; st.y--; } OC.refresh(); },
      next: () => { st.m++; if (st.m > 11) { st.m = 0; st.y++; } OC.refresh(); },
      today: () => { const d = new Date(); st.y = d.getFullYear(); st.m = d.getMonth(); st.sel = U.today(); OC.refresh(); },
      async delEv(d) { const e = OC.find('events', d.id); if (!e) return; if (await OC.confirm({ title: t('calendar.delete'), message: t('calendar.deleteMsg', { title: e.title }) })) { OC.remove('events', d.id); OC.save(); OC.toast(t('deleted')); OC.refresh(); } }
    }
  };
})(window.OC);
