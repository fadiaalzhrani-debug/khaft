/* OneClick · Vehicles: fleet cards, check-out / check-in, maintenance, service reminders */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon, U = OC.util;
  const TYPES = ['pickup', 'van', 'truck', 'bus', 'forklift', 'other'];
  const STATUS = ['available', 'inuse', 'maintenance'];
  const st = { status: 'all', q: '' };
  const serviceState = v => { if (!v.nextService) return 'none'; const d = U.daysBetween(U.today(), v.nextService); return d < 0 ? 'overdue' : d <= 14 ? 'soon' : 'ok'; };

  function fields() {
    return [
      { key: 'name', label: t('vehicles.f.name'), required: true },
      { key: 'plate', label: t('vehicles.f.plate'), required: true, placeholder: 'KSA 4821' },
      { key: 'type', label: t('vehicles.f.type'), type: 'select', options: TYPES.map(x => ({ value: x, label: t('vehicles.t.' + x) })) },
      { key: 'status', label: t('status'), type: 'select', options: STATUS.map(x => ({ value: x, label: t('vehicles.s.' + x) })) },
      { key: 'assignedTo', label: t('vehicles.f.assigned'), list: OC.db.team.map(m => m.name) },
      { key: 'mileage', label: t('vehicles.f.mileage'), type: 'number', min: 0, step: 1 },
      { key: 'nextService', label: t('vehicles.f.nextService'), type: 'date' }
    ];
  }
  function openForm(id) {
    const existing = id ? OC.find('vehicles', id) : null;
    OC.form({
      title: existing ? t('vehicles.edit') : t('vehicles.add'), fields: fields(), values: existing || { type: 'pickup', status: 'available', mileage: 0 },
      onSubmit(v) {
        if (existing) Object.assign(existing, v); else OC.db.vehicles.push(Object.assign({ id: U.uid() }, v));
        OC.save(); OC.toast(t('saved')); OC.refresh();
      }
    });
  }
  function checkout(id) {
    const v = OC.find('vehicles', id); if (!v) return;
    OC.form({
      title: t('vehicles.checkout', { name: v.name }), submitLabel: t('vehicles.checkoutBtn'),
      fields: [{ key: 'assignedTo', label: t('vehicles.f.assigned'), required: true, list: OC.db.team.map(m => m.name), full: true }, { key: 'mileage', label: t('vehicles.f.mileage'), type: 'number', min: 0, full: true }],
      values: { assignedTo: v.assignedTo || '', mileage: v.mileage },
      onSubmit(x) { v.status = 'inuse'; v.assignedTo = x.assignedTo; if (x.mileage !== '') v.mileage = x.mileage; OC.save(); OC.toast(t('vehicles.checkedOut', { name: v.name, who: x.assignedTo })); OC.refresh(); }
    });
  }
  function checkin(id) {
    const v = OC.find('vehicles', id); if (!v) return;
    OC.form({
      title: t('vehicles.checkin', { name: v.name }), submitLabel: t('vehicles.checkinBtn'),
      fields: [{ key: 'mileage', label: t('vehicles.f.mileage'), type: 'number', min: 0, full: true }],
      values: { mileage: v.mileage },
      onSubmit(x) { if (x.mileage !== '' && x.mileage < v.mileage) return t('vehicles.mileageErr'); v.status = 'available'; v.assignedTo = ''; if (x.mileage !== '') v.mileage = x.mileage; OC.save(); OC.toast(t('vehicles.checkedIn', { name: v.name })); OC.refresh(); }
    });
  }
  const statusPill = v => OC.pill(v.status === 'available' ? 'good' : v.status === 'inuse' ? 'info' : 'warn', t('vehicles.s.' + v.status), v.status === 'available' ? 'check' : v.status === 'inuse' ? 'key' : 'wrench');

  OC.modules.vehicles = {
    id: 'vehicles', icon: 'truck', order: 5,
    title: () => t('vehicles.title'), tagline: () => t('vehicles.tag'),
    count: () => { const n = OC.db.vehicles.filter(v => v.status === 'maintenance' || serviceState(v) === 'overdue').length; return n || ''; },
    render() {
      const all = OC.db.vehicles, q = st.q.toLowerCase();
      const list = all.filter(v => (st.status === 'all' || v.status === st.status) && (!q || [v.name, v.plate, v.assignedTo].some(x => String(x || '').toLowerCase().includes(q)))).sort((a, b) => a.name.localeCompare(b.name));
      const c = s => all.filter(v => v.status === s).length;
      const due = all.filter(v => serviceState(v) === 'soon' || serviceState(v) === 'overdue').length;
      return `
      <div class="page-head"><div><h2>${esc(t('vehicles.title'))}</h2><p>${esc(t('vehicles.desc'))}</p></div>
        <div class="actions"><button class="btn" data-act="csv">${I('download')}${esc(t('exportCsv'))}</button><button class="btn primary" data-act="add">${I('plus')}${esc(t('vehicles.add'))}</button></div></div>
      <div class="kpis">
        <div class="card kpi"><span class="lbl">${I('check')}${esc(t('vehicles.s.available'))}</span><span class="val">${c('available')}<small>/ ${all.length}</small></span></div>
        <div class="card kpi"><span class="lbl">${I('key')}${esc(t('vehicles.s.inuse'))}</span><span class="val">${c('inuse')}</span></div>
        <div class="card kpi"><span class="lbl">${I('wrench')}${esc(t('vehicles.s.maintenance'))}</span><span class="val">${c('maintenance')}</span></div>
        <div class="card kpi"><span class="lbl">${I('alert')}${esc(t('vehicles.serviceDue'))}</span><span class="val">${due}</span><span class="hint ${due ? 'warn' : ''}">${esc(t('vehicles.serviceDueHint'))}</span></div>
      </div>
      <div class="toolbar">${OC.search(st.q, t('vehicles.search'))}${OC.seg('filter', [{ value: 'all', label: t('all') }].concat(STATUS.map(s => ({ value: s, label: t('vehicles.s.' + s) }))), st.status)}</div>
      ${list.length ? `<div class="grid-cards">${list.map(v => { const ss = serviceState(v); return `
        <div class="card vcard"><div class="top"><div class="row" style="gap:12px"><span class="ico">${I('truck')}</span><div><h4>${esc(v.name)}</h4><span class="plate">${esc(v.plate)}</span></div></div>${statusPill(v)}</div>
          <div class="kv"><div><span>${esc(t('vehicles.f.type'))}</span><b>${esc(t('vehicles.t.' + (v.type || 'other')))}</b></div><div><span>${esc(t('vehicles.f.assigned'))}</span><b>${esc(v.assignedTo || '—')}</b></div>
            <div><span>${esc(t('vehicles.f.mileage'))}</span><b>${esc(OC.fmtNum(v.mileage))} km</b></div><div><span>${esc(t('vehicles.f.nextService'))}</span><b style="${ss === 'overdue' ? 'color:var(--crit)' : ss === 'soon' ? 'color:var(--warn)' : ''}">${v.nextService ? esc(OC.fmtDate(v.nextService)) + (ss !== 'ok' && ss !== 'none' ? ' · ' + esc(t('vehicles.sv.' + ss)) : '') : '—'}</b></div></div>
          <div class="foot">
            ${v.status === 'available' ? `<button class="btn sm primary" data-act="checkout" data-id="${v.id}">${I('key')}${esc(t('vehicles.checkoutBtn'))}</button>` : ''}
            ${v.status === 'inuse' ? `<button class="btn sm primary" data-act="checkin" data-id="${v.id}">${I('check')}${esc(t('vehicles.checkinBtn'))}</button>` : ''}
            ${v.status !== 'maintenance' ? `<button class="btn sm" data-act="maint" data-id="${v.id}">${I('wrench')}${esc(t('vehicles.toMaint'))}</button>` : `<button class="btn sm" data-act="ready" data-id="${v.id}">${I('check')}${esc(t('vehicles.backInService'))}</button>`}
            <span style="flex:1"></span><button class="btn ghost icon sm" data-act="edit" data-id="${v.id}" aria-label="${esc(t('edit'))}">${I('edit')}</button><button class="btn ghost icon sm" data-act="del" data-id="${v.id}" aria-label="${esc(t('delete'))}">${I('trash')}</button></div></div>`; }).join('')}</div>`
        : OC.empty('truck', t('vehicles.empty'), all.length ? t('tryFilters') : t('vehicles.emptyHint'))}`;
    },
    actions: {
      add: () => openForm(), edit: d => openForm(d.id),
      q: (d, el) => { st.q = el.value; OC.refresh(); },
      filter: d => { st.status = d.v; OC.refresh(); },
      checkout: d => checkout(d.id), checkin: d => checkin(d.id),
      maint: d => { const v = OC.find('vehicles', d.id); if (!v) return; v.status = 'maintenance'; v.assignedTo = ''; OC.save(); OC.toast(t('vehicles.sentMaint', { name: v.name }), 'info'); OC.refresh(); },
      ready: d => { const v = OC.find('vehicles', d.id); if (!v) return; v.status = 'available'; OC.save(); OC.toast(t('vehicles.nowAvailable', { name: v.name })); OC.refresh(); },
      async del(d) { const v = OC.find('vehicles', d.id); if (!v) return; if (await OC.confirm({ title: t('vehicles.delete'), message: t('vehicles.deleteMsg', { name: v.name }) })) { OC.remove('vehicles', d.id); OC.save(); OC.toast(t('deleted')); OC.refresh(); } },
      csv: () => OC.exportCSV('oneclick-vehicles.csv', [{ key: 'name', label: 'Vehicle' }, { key: 'plate', label: 'Plate' }, { key: 'type', label: 'Type' }, { key: 'status', label: 'Status', get: v => t('vehicles.s.' + v.status) }, { key: 'assignedTo', label: 'Assigned to' }, { key: 'mileage', label: 'Mileage' }, { key: 'nextService', label: 'Next service' }], OC.db.vehicles)
    }
  };
})(window.OC);
