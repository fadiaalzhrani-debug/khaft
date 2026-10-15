/* OneClick · MyTeam: roster with groups, shifts, status, planned leave, search, filters, Excel import / export */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon, U = OC.util;
  const STATUS = ['on', 'off', 'leave', 'training'];
  const BASE_SHIFTS = ['A', 'B', 'C', 'D'];
  const pillKind = { on: 'good', off: '', leave: 'warn', training: 'info' };
  const pillIcon = { on: 'check', off: 'dash', leave: 'calendar', training: 'bulb' };
  const st = { q: '', status: 'all', shift: 'all', group: 'all' };
  const shifts = () => [...new Set(BASE_SHIFTS.concat(OC.db.team.map(m => m.shift).filter(Boolean)))];
  const groups = () => [...new Set(OC.db.team.map(m => m.group).filter(Boolean))].sort();

  function fields() {
    return [
      { key: 'name', label: t('team.f.name'), required: true, placeholder: 'e.g. Ahmed Al-Harbi' },
      { key: 'badge', label: t('team.f.badge'), placeholder: '87163' },
      { key: 'role', label: t('team.f.role'), list: ['Team Lead', 'Mechanical Tech', 'Electrical Tech', 'Instrument Tech', 'Planner', 'Safety Officer', 'Welder', 'Materials Coordinator', 'Operator'] },
      { key: 'group', label: t('team.f.group'), list: groups() },
      { key: 'shift', label: t('team.f.shift'), type: 'select', options: shifts().map(s => ({ value: s, label: t('team.shift', { s }) })) },
      { key: 'status', label: t('team.f.status'), type: 'select', options: STATUS.map(s => ({ value: s, label: t('team.s.' + s) })) },
      { key: 'phone', label: t('team.f.phone'), type: 'tel', placeholder: '05xxxxxxxx', full: true }
    ];
  }
  function openForm(id) {
    const existing = id ? OC.find('team', id) : null;
    OC.form({
      title: existing ? t('team.edit') : t('team.add'), fields: fields(), values: existing || { shift: 'A', status: 'on' },
      onSubmit(v) {
        if (existing) Object.assign(existing, v); else OC.db.team.push(Object.assign({ id: U.uid() }, v));
        OC.save(); OC.toast(existing ? t('saved') : t('team.added', { name: v.name })); OC.refresh();
      }
    });
  }
  /* removing a person also removes their leaves and training records */
  function removePeople(ids) {
    const set = new Set(ids);
    OC.db.team = OC.db.team.filter(m => !set.has(m.id));
    OC.db.leaves = OC.db.leaves.filter(l => !set.has(l.personId));
    Object.values(OC.db.training).forEach(rec => ids.forEach(id => { delete rec[id]; }));
  }
  function filtered() {
    const q = st.q.toLowerCase();
    return OC.db.team.filter(m => (st.status === 'all' || m.status === st.status) && (st.shift === 'all' || m.shift === st.shift) && (st.group === 'all' || m.group === st.group) &&
      (!q || [m.name, m.badge, m.role, m.group, m.phone].some(x => String(x || '').toLowerCase().includes(q))))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  async function exportExcel() {
    const list = filtered();
    const aoa = [[t('team.f.name'), t('team.f.badge'), t('team.f.role'), t('team.f.group'), t('team.f.shift'), t('team.f.status'), t('team.f.phone')]].concat(list.map(m => [m.name, m.badge || '', m.role || '', m.group || '', m.shift || '', t('team.s.' + m.status), m.phone || '']));
    try { await OC.xlsx.exportBook(`oneclick-team-${U.today()}.xlsx`, [{ name: t('team.title'), aoa }]); OC.toast(t('exported', { n: list.length })); } catch (e) { OC.toast(e.message, 'err'); }
  }

  const STATUS_ALIASES = { on: ['on duty', 'working', 'present', 'active', 'حاضر', 'دوام', 'على رأس العمل'], off: ['off', 'off duty', 'absent', 'خارج الدوام', 'راحة'], leave: ['leave', 'vacation', 'إجازة', 'اجازة'], training: ['training', 'course', 'تدريب', 'دورة'] };
  const AR_SHIFT = { 'أ': 'A', 'ا': 'A', 'ب': 'B', 'ج': 'C', 'د': 'D' };
  const shiftOf = v => { const s = String(v || '').trim(); if (!s) return ''; if (AR_SHIFT[s]) return AR_SHIFT[s]; const m = s.match(/^(?:shift|وردية)?\s*([A-Za-z0-9])$/i); return (m ? m[1] : s).toUpperCase().slice(0, 10); };
  const importSpec = {
    id: 'team', icon: 'users', title: () => t('team.title'), hint: () => t('team.impHint'), count: () => OC.db.team.length,
    fields: [
      { key: 'name', label: 'team.f.name', required: true, aliases: ['name', 'employee', 'employee name', 'full name', 'الاسم', 'اسم الموظف', 'الموظف', 'الاسم الكامل'] },
      { key: 'badge', label: 'team.f.badge', aliases: ['badge', 'badge no', 'badge number', 'id', 'emp no', 'employee id', 'employee no', 'staff no', 'الرقم الوظيفي', 'رقم الموظف', 'الرقم', 'رقم الشارة'] },
      { key: 'role', label: 'team.f.role', aliases: ['role', 'job', 'job title', 'title', 'position', 'designation', 'الوظيفة', 'المسمى', 'المسمى الوظيفي', 'المهنة'] },
      { key: 'group', label: 'team.f.group', aliases: ['group', 'crew', 'team', 'section', 'unit', 'department', 'القروب', 'المجموعة', 'الفريق', 'القسم', 'الوحدة'] },
      { key: 'shift', label: 'team.f.shift', aliases: ['shift', 'الوردية', 'الشفت'] },
      { key: 'status', label: 'team.f.status', aliases: ['status', 'الحالة'] },
      { key: 'phone', label: 'team.f.phone', aliases: ['phone', 'mobile', 'cell', 'contact', 'الجوال', 'الهاتف', 'رقم الجوال', 'التلفون'] }
    ],
    modes: [{ value: 'merge', label: () => t('team.m.merge'), hint: () => t('team.m.mergeHint') }, { value: 'replace', label: () => t('imp.m.replace'), hint: () => t('team.m.replaceHint') }],
    template: () => [[t('team.f.name'), t('team.f.badge'), t('team.f.role'), t('team.f.group'), t('team.f.shift'), t('team.f.phone')], ['Ahmed Al-Harbi', '87163', 'Team Lead', 'Mechanical', 'A', '0550000001'], ['Sara Al-Zahrani', '87355', 'Planner', 'Planning', 'A', '0550000003']],
    async run({ records, mode }) {
      const table = OC.cells.enumTable(STATUS, 'team.s.', STATUS_ALIASES);
      let added = 0, updated = 0; const keep = new Set();
      records.forEach(r => {
        const p = OC.findPerson(r.name, r.badge, false);
        const data = { name: r.name };
        ['badge', 'role', 'group', 'phone'].forEach(k => { if (r[k] !== '') data[k] = String(r[k]); });
        if (r.shift !== '') data.shift = shiftOf(r.shift);
        if (r.status !== '') data.status = OC.cells.matchEnum(r.status, table, 'on');
        if (p) { Object.assign(p, data); keep.add(p.id); updated++; }
        else { const n = Object.assign({ id: U.uid(), badge: '', role: '', group: '', shift: 'A', status: 'on', phone: '' }, data); OC.db.team.push(n); keep.add(n.id); added++; }
      });
      let removed = 0;
      if (mode === 'replace') { const gone = OC.db.team.filter(m => !keep.has(m.id)).map(m => m.id); removed = gone.length; removePeople(gone); }
      return t('team.imported', { a: added, u: updated }) + (removed ? ' ' + t('team.removedN', { n: removed }) : '');
    }
  };

  OC.modules.team = {
    id: 'team', icon: 'users', order: 1,
    title: () => t('team.title'), tagline: () => t('team.tag'), count: () => OC.db.team.length,
    importSpecs: [importSpec], removePeople,
    render() {
      const list = filtered(), all = OC.db.team, gs = groups(), today = U.today();
      const away = OC.awayOn ? OC.awayOn(today) : [];
      const awayOf = id => away.find(l => l.personId === id);
      const cnt = s => all.filter(m => m.status === s).length;
      return `
      <div class="page-head"><div><h2>${esc(t('team.title'))}</h2><p>${esc(t('team.desc'))}</p></div>
        <div class="actions"><button class="btn" data-act="export">${I('download')}${esc(t('inv.exportXlsx'))}</button><button class="btn" data-act="import">${I('upload')}${esc(t('imp.button'))}</button><button class="btn primary" data-act="add">${I('plus')}${esc(t('team.add'))}</button></div></div>
      <div class="kpis">
        <div class="card kpi"><span class="lbl">${I('users')}${esc(t('team.total'))}</span><span class="val">${all.length}</span><span class="hint">${esc(gs.length ? t('team.groupsN', { n: gs.length }) : '')}</span></div>
        <div class="card kpi"><span class="lbl">${I('check')}${esc(t('team.s.on'))}</span><span class="val">${cnt('on')}</span></div>
        <div class="card kpi"><span class="lbl">${I('calendar')}${esc(t('team.awayToday'))}</span><span class="val">${away.length}</span><span class="hint">${esc(t('team.awayHint'))}</span></div>
        <div class="card kpi"><span class="lbl">${I('bulb')}${esc(t('team.s.training'))}</span><span class="val">${cnt('training')}</span></div>
      </div>
      <div class="toolbar">${OC.search(st.q, t('team.search'))}
        ${gs.length ? `<select class="select" style="width:auto" data-change="group" aria-label="${esc(t('team.f.group'))}">${OC.options([{ value: 'all', label: t('team.allGroups') }].concat(gs.map(g => ({ value: g, label: g }))), st.group)}</select>` : ''}
        <select class="select" style="width:auto" data-change="status" aria-label="${esc(t('team.f.status'))}">${OC.options([{ value: 'all', label: t('team.allStatus') }].concat(STATUS.map(s => ({ value: s, label: t('team.s.' + s) }))), st.status)}</select>
        <select class="select" style="width:auto" data-change="shift" aria-label="${esc(t('team.f.shift'))}">${OC.options([{ value: 'all', label: t('team.allShifts') }].concat(shifts().map(s => ({ value: s, label: t('team.shift', { s }) }))), st.shift)}</select>
        <span class="muted small">${esc(t('showing', { n: list.length, total: all.length }))}</span></div>
      ${list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>${esc(t('team.f.name'))}</th><th>${esc(t('team.f.badge'))}</th><th>${esc(t('team.f.role'))}</th><th>${esc(t('team.f.group'))}</th><th>${esc(t('team.f.shift'))}</th><th>${esc(t('team.f.status'))}</th><th>${esc(t('team.f.phone'))}</th><th></th></tr></thead><tbody>
        ${list.map(m => { const a = awayOf(m.id); return `<tr><td><div class="who">${OC.avatar(m.name)}<div><b>${esc(m.name)}</b>${a ? `<small>${OC.pill('info', t('team.awayUntil', { type: t('cal.lt.' + a.type), date: OC.fmtDate(a.to, { day: 'numeric', month: 'short' }) }), 'calendar')}</small>` : ''}</div></div></td><td class="muted">${esc(m.badge || '—')}</td><td>${esc(m.role || '—')}</td><td>${m.group ? OC.pill('', m.group, 'layers') : '<span class="muted">—</span>'}</td><td>${esc(t('team.shift', { s: m.shift || '—' }))}</td>
          <td><select class="select" style="width:auto;min-height:34px;padding:4px 32px 4px 10px;font-size:.8rem" data-change="setStatus" data-id="${m.id}" aria-label="${esc(t('team.f.status'))}">${OC.options(STATUS.map(s => ({ value: s, label: t('team.s.' + s) })), m.status)}</select></td>
          <td class="muted">${m.phone ? `<a href="tel:${esc(m.phone)}">${esc(m.phone)}</a>` : '—'}</td>
          <td><div class="acts"><button class="btn ghost icon sm" data-act="edit" data-id="${m.id}" title="${esc(t('edit'))}" aria-label="${esc(t('edit'))}">${I('edit')}</button><button class="btn ghost icon sm" data-act="del" data-id="${m.id}" title="${esc(t('delete'))}" aria-label="${esc(t('delete'))}">${I('trash')}</button></div></td></tr>`; }).join('')}
      </tbody></table></div>` : OC.empty('users', t('team.empty'), all.length ? t('tryFilters') : t('team.emptyHint'))}`;
    },
    actions: {
      add: () => openForm(), edit: d => openForm(d.id),
      import: () => OC.importer.open(importSpec), export: () => exportExcel(),
      q: (d, el) => { st.q = el.value; OC.refresh(); },
      status: (d, el) => { st.status = el.value; OC.refresh(); },
      shift: (d, el) => { st.shift = el.value; OC.refresh(); },
      group: (d, el) => { st.group = el.value; OC.refresh(); },
      setStatus: (d, el) => { const m = OC.find('team', d.id); if (!m) return; m.status = el.value; OC.save(); OC.toast(t('team.statusSet', { name: m.name, status: t('team.s.' + m.status) })); OC.refresh(); },
      async del(d) { const m = OC.find('team', d.id); if (!m) return; if (await OC.confirm({ title: t('team.delete'), message: t('team.deleteMsg2', { name: m.name }) })) { removePeople([m.id]); OC.save(); OC.toast(t('deleted')); OC.refresh(); } }
    },
    pill: m => OC.pill(pillKind[m.status] || '', t('team.s.' + m.status), pillIcon[m.status])
  };
})(window.OC);
