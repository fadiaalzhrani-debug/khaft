/* OneClick · MyTeam: roster with status, shift, search, filters, CSV */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon;
  const STATUS = ['on', 'off', 'leave', 'training'];
  const SHIFTS = ['A', 'B', 'C', 'D'];
  const pillKind = { on: 'good', off: '', leave: 'warn', training: 'info' };
  const pillIcon = { on: 'check', off: 'dash', leave: 'calendar', training: 'bulb' };
  const st = { q: '', status: 'all', shift: 'all' };

  function fields(existing) {
    return [
      { key: 'name', label: t('team.f.name'), required: true, placeholder: 'e.g. Ahmed Al-Harbi' },
      { key: 'badge', label: t('team.f.badge'), placeholder: '87163' },
      { key: 'role', label: t('team.f.role'), required: true, list: ['Team Lead', 'Mechanical Tech', 'Electrical Tech', 'Instrument Tech', 'Planner', 'Safety Officer', 'Welder', 'Materials Coordinator', 'Operator'] },
      { key: 'shift', label: t('team.f.shift'), type: 'select', options: SHIFTS.map(s => ({ value: s, label: t('team.shift', { s }) })) },
      { key: 'status', label: t('team.f.status'), type: 'select', options: STATUS.map(s => ({ value: s, label: t('team.s.' + s) })) },
      { key: 'phone', label: t('team.f.phone'), type: 'tel', placeholder: '05xxxxxxxx' }
    ];
  }
  function openForm(id) {
    const existing = id ? OC.find('team', id) : null;
    OC.form({
      title: existing ? t('team.edit') : t('team.add'), fields: fields(existing), values: existing || { shift: 'A', status: 'on' },
      onSubmit(v) {
        if (existing) Object.assign(existing, v); else OC.db.team.push(Object.assign({ id: OC.util.uid() }, v));
        OC.save(); OC.toast(existing ? t('saved') : t('team.added', { name: v.name })); OC.refresh();
      }
    });
  }
  function filtered() {
    const q = st.q.toLowerCase();
    return OC.db.team.filter(m => (st.status === 'all' || m.status === st.status) && (st.shift === 'all' || m.shift === st.shift) &&
      (!q || [m.name, m.badge, m.role, m.phone].some(x => String(x || '').toLowerCase().includes(q))))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  OC.modules.team = {
    id: 'team', icon: 'users', order: 1,
    title: () => t('team.title'), tagline: () => t('team.tag'), count: () => OC.db.team.length,
    render() {
      const list = filtered(), all = OC.db.team;
      const cnt = s => all.filter(m => m.status === s).length;
      return `
      <div class="page-head"><div><h2>${esc(t('team.title'))}</h2><p>${esc(t('team.desc'))}</p></div>
        <div class="actions"><button class="btn" data-act="csv">${I('download')}${esc(t('exportCsv'))}</button><button class="btn primary" data-act="add">${I('plus')}${esc(t('team.add'))}</button></div></div>
      <div class="kpis">
        <div class="card kpi"><span class="lbl">${I('users')}${esc(t('team.total'))}</span><span class="val">${all.length}</span></div>
        <div class="card kpi"><span class="lbl">${I('check')}${esc(t('team.s.on'))}</span><span class="val">${cnt('on')}</span></div>
        <div class="card kpi"><span class="lbl">${I('calendar')}${esc(t('team.s.leave'))}</span><span class="val">${cnt('leave')}</span></div>
        <div class="card kpi"><span class="lbl">${I('bulb')}${esc(t('team.s.training'))}</span><span class="val">${cnt('training')}</span></div>
      </div>
      <div class="toolbar">${OC.search(st.q, t('team.search'))}
        <select class="select" style="width:auto" data-change="status" aria-label="${esc(t('team.f.status'))}">${OC.options([{ value: 'all', label: t('team.allStatus') }].concat(STATUS.map(s => ({ value: s, label: t('team.s.' + s) }))), st.status)}</select>
        <select class="select" style="width:auto" data-change="shift" aria-label="${esc(t('team.f.shift'))}">${OC.options([{ value: 'all', label: t('team.allShifts') }].concat(SHIFTS.map(s => ({ value: s, label: t('team.shift', { s }) }))), st.shift)}</select>
        <span class="muted small">${esc(t('showing', { n: list.length, total: all.length }))}</span></div>
      ${list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>${esc(t('team.f.name'))}</th><th>${esc(t('team.f.badge'))}</th><th>${esc(t('team.f.role'))}</th><th>${esc(t('team.f.shift'))}</th><th>${esc(t('team.f.status'))}</th><th>${esc(t('team.f.phone'))}</th><th></th></tr></thead><tbody>
        ${list.map(m => `<tr><td><div class="who">${OC.avatar(m.name)}<div><b>${esc(m.name)}</b></div></div></td><td class="muted">${esc(m.badge || '—')}</td><td>${esc(m.role)}</td><td>${esc(t('team.shift', { s: m.shift }))}</td>
          <td><select class="select" style="width:auto;min-height:34px;padding:4px 32px 4px 10px;font-size:.8rem" data-change="setStatus" data-id="${m.id}" aria-label="${esc(t('team.f.status'))}">${OC.options(STATUS.map(s => ({ value: s, label: t('team.s.' + s) })), m.status)}</select></td>
          <td class="muted">${m.phone ? `<a href="tel:${esc(m.phone)}">${esc(m.phone)}</a>` : '—'}</td>
          <td><div class="acts"><button class="btn ghost icon sm" data-act="edit" data-id="${m.id}" title="${esc(t('edit'))}" aria-label="${esc(t('edit'))}">${I('edit')}</button><button class="btn ghost icon sm" data-act="del" data-id="${m.id}" title="${esc(t('delete'))}" aria-label="${esc(t('delete'))}">${I('trash')}</button></div></td></tr>`).join('')}
      </tbody></table></div>` : OC.empty('users', t('team.empty'), all.length ? t('tryFilters') : t('team.emptyHint'))}`;
    },
    actions: {
      add: () => openForm(), edit: d => openForm(d.id),
      q: (d, el) => { st.q = el.value; OC.refresh(); },
      status: (d, el) => { st.status = el.value; OC.refresh(); },
      shift: (d, el) => { st.shift = el.value; OC.refresh(); },
      setStatus: (d, el) => { const m = OC.find('team', d.id); if (!m) return; m.status = el.value; OC.save(); OC.toast(t('team.statusSet', { name: m.name, status: t('team.s.' + m.status) })); OC.refresh(); },
      async del(d) { const m = OC.find('team', d.id); if (!m) return; if (await OC.confirm({ title: t('team.delete'), message: t('team.deleteMsg', { name: m.name }) })) { OC.remove('team', d.id); OC.save(); OC.toast(t('deleted')); OC.refresh(); } },
      csv: () => OC.exportCSV('oneclick-team.csv', [{ key: 'name', label: 'Name' }, { key: 'badge', label: 'Badge' }, { key: 'role', label: 'Role' }, { key: 'shift', label: 'Shift' }, { key: 'status', label: 'Status', get: m => t('team.s.' + m.status) }, { key: 'phone', label: 'Phone' }], filtered())
    },
    pill: m => OC.pill(pillKind[m.status] || '', t('team.s.' + m.status), pillIcon[m.status])
  };
})(window.OC);
