/* OneClick · Training matrix: people (rows) × courses (columns). Click a cell to tick it with today's
   date; click a ticked cell to change the date or remove it. Courses can have a validity in months,
   so old certificates show as expired. Import / export as an Excel matrix. */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon, U = OC.util;
  const st = { q: '', group: 'all', show: 'all' };
  const SOON_DAYS = 30;

  const rec = (cid, pid) => ((OC.db.training[cid] || {})[pid]) || '';
  const setRec = (cid, pid, v) => { OC.db.training[cid] = OC.db.training[cid] || {}; if (v) OC.db.training[cid][pid] = v; else delete OC.db.training[cid][pid]; };
  function addMonths(iso, n) { const d = U.parseISO(iso); const day = d.getDate(); d.setMonth(d.getMonth() + n); if (d.getDate() < day) d.setDate(0); return U.toISO(d); }
  const expiry = (c, v) => (c.validity && /^\d{4}-/.test(v)) ? addMonths(v, c.validity) : '';
  function state(c, v) {
    if (!v) return 'none';
    const e = expiry(c, v); if (!e) return 'done';
    const left = U.daysBetween(U.today(), e);
    return left < 0 ? 'expired' : left <= SOON_DAYS ? 'soon' : 'done';
  }
  const groups = () => [...new Set(OC.db.team.map(m => m.group).filter(Boolean))].sort();
  function people() {
    const q = st.q.toLowerCase();
    return OC.db.team.filter(m => (st.group === 'all' || m.group === st.group) && (!q || [m.name, m.badge, m.role, m.group].some(x => String(x || '').toLowerCase().includes(q))))
      .filter(m => st.show === 'all' || OC.db.courses.some(c => { const s = state(c, rec(c.id, m.id)); return st.show === 'missing' ? s === 'none' : (s === 'expired' || s === 'soon'); }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  function totals() {
    let done = 0, expired = 0; const n = OC.db.team.length * OC.db.courses.length;
    OC.db.courses.forEach(c => OC.db.team.forEach(m => { const s = state(c, rec(c.id, m.id)); if (s === 'done' || s === 'soon') done++; else if (s === 'expired') expired++; }));
    return { done, expired, n, pct: n ? Math.round(done / n * 100) : 0 };
  }
  const cellTitle = (m, c, v) => { const s = state(c, v), e = expiry(c, v); return `${m.name} · ${c.name} · ${s === 'none' ? t('training.notDone') : (v === '1' ? t('training.doneNoDate') : t('training.doneOn', { date: OC.fmtDate(v) })) + (e ? ' · ' + t(s === 'expired' ? 'training.expiredOn' : 'training.validUntil', { date: OC.fmtDate(e) }) : '')}`; };
  const cellIcon = s => s === 'done' ? I('check') : s === 'soon' ? I('clock') : s === 'expired' ? I('alert') : s === 'pending' ? I('clock') : '';
  const A = () => OC.auth;
  const member = () => A().enabled() && !A().isAdmin();
  const myPerson = () => { const u = A().current(); return u ? u.personId : ''; };
  /* members may only tick their own row; the admin may tick anyone */
  function mayTick(pid) {
    if (!member()) return true;
    if (!myPerson()) { OC.toast(t('auth.noPersonLink'), 'info', 4500); return false; }
    if (pid !== myPerson()) { OC.toast(t('auth.ownRowOnly'), 'info'); return false; }
    return true;
  }

  function courseForm(id) {
    const c = id ? OC.find('courses', id) : null;
    const extra = c ? `<button class="btn danger" type="button" data-cdel>${I('trash')}${esc(t('delete'))}</button><button class="btn" type="button" data-call>${I('check')}${esc(t('training.markAll'))}</button>` : '';
    const m = OC.form({
      title: c ? t('training.editCourse') : t('training.addCourse'), extraButtons: extra,
      fields: [{ key: 'name', label: t('training.f.course'), required: true, full: true }, { key: 'validity', label: t('training.f.validity'), type: 'number', min: 0, max: 240, step: 1, full: true, placeholder: t('training.validityPh') }],
      values: c || {},
      onSubmit(v) {
        const dup = OC.db.courses.find(x => x.id !== (c && c.id) && OC.cells.norm(x.name) === OC.cells.norm(v.name));
        if (dup) return t('training.dup');
        const validity = v.validity === '' ? null : v.validity;
        if (c) Object.assign(c, { name: v.name, validity }); else OC.db.courses.push({ id: U.uid(), name: v.name, validity });
        OC.save(); OC.toast(t('saved')); OC.refresh();
      }
    });
    if (!c) return;
    m.el.querySelector('[data-cdel]').onclick = async () => {
      if (!(await OC.confirm({ title: t('training.deleteCourse'), message: t('training.deleteCourseMsg', { name: c.name }) }))) return;
      OC.remove('courses', c.id); delete OC.db.training[c.id]; OC.save(); m.close(); OC.toast(t('deleted')); OC.refresh();
    };
    m.el.querySelector('[data-call]').onclick = async () => {
      const list = people(); if (!(await OC.confirm({ title: t('training.markAll'), message: t('training.markAllMsg', { n: list.length, name: c.name }), okLabel: t('training.markAll'), danger: false }))) return;
      list.forEach(p => { if (!rec(c.id, p.id)) setRec(c.id, p.id, U.today()); }); OC.save(); m.close(); OC.toast(t('saved')); OC.refresh();
    };
  }
  function cellDialog(c, m) {
    const v = rec(c.id, m.id);
    const body = document.createElement('div');
    body.innerHTML = `<div class="who">${OC.avatar(m.name)}<div><b>${esc(m.name)}</b><small>${esc(c.name)}</small></div></div>
      <div class="field mt"><label for="tr-date">${esc(t('training.f.date'))}</label><input id="tr-date" class="input" type="date" value="${v === '1' ? '' : esc(v)}"/></div>
      <p class="muted small mt">${esc(cellTitle(m, c, v))}</p>`;
    const foot = document.createElement('div'); foot.style.display = 'contents';
    foot.innerHTML = `<button class="btn danger" type="button" data-rm>${I('x')}${esc(t('training.unmark'))}</button><button class="btn primary" type="button" data-ok>${I('check')}${esc(t('save'))}</button>`;
    const dlg = OC.modal({ title: t('training.record'), body, footer: foot, narrow: true });
    foot.querySelector('[data-rm]').onclick = () => { setRec(c.id, m.id, ''); OC.save(); dlg.close(); OC.refresh(); };
    foot.querySelector('[data-ok]').onclick = () => { const d = body.querySelector('input').value; setRec(c.id, m.id, d || '1'); OC.save(); dlg.close(); OC.refresh(); };
  }
  async function exportExcel() {
    const cs = OC.db.courses, list = people();
    const aoa = [[t('team.f.name'), t('team.f.badge'), t('team.f.group')].concat(cs.map(c => c.name))];
    list.forEach(m => aoa.push([m.name, m.badge || '', m.group || ''].concat(cs.map(c => { const v = rec(c.id, m.id); return v === '1' ? '✓' : v; }))));
    try { await OC.xlsx.exportBook(`oneclick-training-${U.today()}.xlsx`, [{ name: t('training.title'), aoa }]); OC.toast(t('exported', { n: list.length })); } catch (e) { OC.toast(e.message, 'err'); }
  }

  const importSpec = {
    id: 'training', icon: 'grad', title: () => t('training.title'), hint: () => t('training.impHint'),
    count: () => OC.db.courses.length,
    extra: 'columns', extraLabel: () => t('training.courseCols'),
    fields: [
      { key: 'name', label: 'team.f.name', required: true, aliases: ['name', 'employee', 'employee name', 'full name', 'الاسم', 'اسم الموظف', 'الموظف'] },
      { key: 'badge', label: 'team.f.badge', aliases: ['badge', 'badge no', 'id', 'emp no', 'employee id', 'staff no', 'الرقم الوظيفي', 'رقم الموظف', 'الرقم'] },
      { key: 'group', label: 'team.f.group', aliases: ['group', 'crew', 'section', 'unit', 'القروب', 'المجموعة', 'القسم'] }
    ],
    modes: [{ value: 'merge', label: () => t('training.m.merge'), hint: () => t('training.m.mergeHint') }, { value: 'replace', label: () => t('imp.m.replace'), hint: () => t('training.m.replaceHint') }],
    options: [{ key: 'create', label: () => t('imp.createPeople'), default: true }],
    template: () => {
      const cs = OC.db.courses.length ? OC.db.courses.slice(0, 8).map(c => c.name) : ['H2S Awareness', 'First Aid', 'Fire Fighting'];
      const ppl = OC.db.team.slice(0, 3);
      return [[t('team.f.name'), t('team.f.badge'), t('team.f.group')].concat(cs)].concat((ppl.length ? ppl : [{ name: 'Ahmed', badge: '87163', group: 'Mechanical' }]).map((m, i) => [m.name, m.badge || '', m.group || ''].concat(cs.map((c, k) => (i + k) % 3 === 0 ? '' : (i + k) % 3 === 1 ? '✓' : U.addDays(U.today(), -100 * (k + 1))))));
    },
    async run({ records, extraCols, mode, options, progress }) {
      if (mode === 'replace') { OC.db.courses = []; OC.db.training = {}; }
      OC.findPerson.created = 0;
      const N = OC.cells.norm;
      const cols = extraCols.map(x => { let c = OC.db.courses.find(y => N(y.name) === N(x.h)); if (!c) { c = { id: U.uid(), name: x.h, validity: null }; OC.db.courses.push(c); } return { i: x.i, c }; });
      let ticks = 0, missingPeople = 0;
      records.forEach((r, k) => {
        const p = OC.findPerson(r.name, r.badge, options.create, { group: r.group || '' });
        if (!p) { missingPeople++; return; }
        if (r.group && !p.group) p.group = r.group;
        cols.forEach(({ i, c }) => {
          const raw = r._row[i]; if (raw === '' || raw == null) return;
          const d = OC.cells.toDate(raw); const v = d || (OC.cells.toBool(raw) ? '1' : '');
          if (v) { setRec(c.id, p.id, v); ticks++; }
        });
        if (k % 500 === 0) progress(k / records.length);
      });
      return t('training.imported', { c: cols.length, t: OC.fmtNum(ticks), p: OC.findPerson.created || 0 }) + (missingPeople ? ' ' + t('imp.unknownPeople', { n: missingPeople }) : '');
    }
  };

  OC.modules.training = {
    id: 'training', icon: 'grad', order: 1.5,
    title: () => t('training.title'), tagline: () => t('training.tag'),
    count: () => { const x = totals().expired; return x || ''; },
    importSpecs: [importSpec], state, rec, totals,
    render() {
      const cs = OC.db.courses, list = people(), tot = totals(), gs = groups();
      const head = `<div class="page-head"><div><h2>${esc(t('training.title'))}</h2><p>${esc(t('training.desc'))}</p></div>
        <div class="actions">${cs.length ? `<button class="btn" data-act="export">${I('download')}${esc(t('inv.exportXlsx'))}</button>` : ''}${member() ? '' : `<button class="btn" data-act="addCourse">${I('plus')}${esc(t('training.addCourse'))}</button><button class="btn primary" data-act="import">${I('upload')}${esc(t('imp.button'))}</button>`}</div></div>`;
      if (!OC.db.team.length) return head + OC.empty('users', t('training.noTeam'), t('training.noTeamHint'));
      if (!cs.length) return head + OC.empty('grad', t('training.noCourses'), t('training.noCoursesHint'));
      const pend = A().pendingTraining(), me = myPerson();
      const banner = member() ? `<div class="card pad mine-banner">${I('user')} ${esc(me ? t('auth.tickHint') : t('auth.noPersonLink'))}</div>` : '';
      const colStats = cs.map(c => { let d = 0; list.forEach(m => { const s = state(c, rec(c.id, m.id)); if (s === 'done' || s === 'soon') d++; }); return d; });
      return head + banner + `
      <div class="kpis">
        <div class="card kpi"><span class="lbl">${I('grad')}${esc(t('training.courses'))}</span><span class="val">${cs.length}</span></div>
        <div class="card kpi"><span class="lbl">${I('users')}${esc(t('training.people'))}</span><span class="val">${OC.db.team.length}</span></div>
        <div class="card kpi"><span class="lbl">${I('check')}${esc(t('training.completion'))}</span><span class="val">${tot.pct}<small>%</small></span><span class="hint">${esc(t('training.ticks', { d: OC.fmtNum(tot.done), n: OC.fmtNum(tot.n) }))}</span></div>
        <div class="card kpi"><span class="lbl">${I('alert')}${esc(t('training.expired'))}</span><span class="val">${tot.expired}</span><span class="hint ${tot.expired ? 'warn' : ''}">${esc(t('training.expiredHint'))}</span></div>
      </div>
      <div class="toolbar">${OC.search(st.q, t('training.search'))}
        ${gs.length ? `<select class="select" style="width:auto" data-change="group" aria-label="${esc(t('team.f.group'))}">${OC.options([{ value: 'all', label: t('team.allGroups') }].concat(gs.map(g => ({ value: g, label: g }))), st.group)}</select>` : ''}
        ${OC.seg('show', [{ value: 'all', label: t('all') }, { value: 'missing', label: t('training.showMissing') }, { value: 'expired', label: t('training.showExpired') }], st.show)}</div>
      <div class="mx-wrap card"><table class="mx">
        <thead><tr><th class="mx-name">${esc(t('training.person'))} <span class="muted small">(${list.length})</span></th>
          ${cs.map((c, k) => `<th class="mx-h"><button type="button" data-act="course" data-id="${c.id}" title="${esc(c.name)}${c.validity ? ' · ' + esc(t('training.validityN', { n: c.validity })) : ''}"><span class="mx-cname">${esc(c.name)}</span><span class="mx-cstat">${colStats[k]}/${list.length}${c.validity ? ` · ${esc(t('training.validityShort', { n: c.validity }))}` : ''}</span><span class="progress"><i style="width:${list.length ? Math.round(colStats[k] / list.length * 100) : 0}%"></i></span></button></th>`).join('')}
          <th class="mx-pct">%</th></tr></thead>
        <tbody>${list.map(m => { let d = 0; const cells = cs.map(c => { const v = rec(c.id, m.id), s0 = state(c, v); if (s0 === 'done' || s0 === 'soon') d++; const pv = (pend[c.id] || {})[m.id]; const s = pv !== undefined ? 'pending' : s0; const tip = pv !== undefined ? `${m.name} · ${c.name} · ${t('auth.waiting')}` : cellTitle(m, c, v); return `<td class="mx-cell"><button type="button" class="mx-b ${s}" data-act="cell" data-c="${c.id}" data-p="${m.id}" title="${esc(tip)}" aria-label="${esc(tip)}">${cellIcon(s)}</button></td>`; }).join(''); const pct = Math.round(d / cs.length * 100);
          return `<tr class="${member() && m.id === me ? 'mine' : ''}"><th class="mx-name"><div class="who">${OC.avatar(m.name)}<div><b>${esc(m.name)}</b><small>${esc([m.group, m.role].filter(Boolean).join(' · '))}</small></div></div></th>${cells}<td class="mx-pct">${OC.pill(pct === 100 ? 'good' : pct >= 60 ? 'accent' : 'warn', pct + '%', pct === 100 ? 'check' : 'circle')}</td></tr>`; }).join('') || `<tr><td colspan="${cs.length + 2}">${OC.empty('search', t('team.empty'), t('tryFilters'))}</td></tr>`}</tbody>
      </table></div>
      <div class="legend mt"><span><i class="mx-b done">${I('check')}</i>${esc(t('training.lgDone'))}</span><span><i class="mx-b soon">${I('clock')}</i>${esc(t('training.lgSoon'))}</span><span><i class="mx-b expired">${I('alert')}</i>${esc(t('training.lgExpired'))}</span><span><i class="mx-b none"></i>${esc(t('training.lgNone'))}</span>${A().enabled() ? `<span><i class="mx-b pending">${I('clock')}</i>${esc(t('auth.waiting'))}</span>` : ''}<span class="muted">${esc(t('training.clickHint'))}</span></div>`;
    },
    actions: {
      import: () => OC.importer.open(importSpec), export: () => exportExcel(),
      addCourse: () => courseForm(), course: d => courseForm(d.id),
      q: (d, el) => { st.q = el.value; OC.refresh(); },
      group: (d, el) => { st.group = el.value; OC.refresh(); },
      show: d => { st.show = d.v; OC.refresh(); },
      cell: d => {
        const c = OC.find('courses', d.c), m = OC.find('team', d.p); if (!c || !m) return;
        if (!mayTick(m.id)) return;
        if (((A().pendingTraining()[c.id]) || {})[m.id] !== undefined) { OC.toast(t('auth.alreadyWaiting'), 'info'); return; }
        if (rec(c.id, m.id)) { cellDialog(c, m); return; }
        setRec(c.id, m.id, U.today()); OC.save(); OC.refresh();
        OC.toast(t('training.ticked', { name: m.name, course: c.name }), 'ok', 4000, { label: t('undo'), fn: () => { setRec(c.id, m.id, ''); OC.save(); OC.refresh(); } });
      }
    }
  };
})(window.OC);
