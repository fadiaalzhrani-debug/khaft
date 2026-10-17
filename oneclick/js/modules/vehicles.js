/* OneClick · Vehicles: fleet cards, check-out / check-in,
   maintenance, service by date & km, registration and insurance expiry alerts */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon, U = OC.util;
  const TYPES = ['suv', 'singlecab', 'doublecab', 'pickup', 'van', 'truck', 'bus', 'forklift', 'other'];
  const STATUS = ['available', 'inuse', 'maintenance'];
  const SVC_SOON_DAYS = 14, SVC_SOON_KM = 500, DOC_SOON_DAYS = 30;
  const st = { filter: 'all', q: '' };

  const daysTo = iso => iso ? U.daysBetween(U.today(), iso) : null;
  const kmLeft = v => (v.nextServiceKm == null || v.nextServiceKm === '') ? null : Number(v.nextServiceKm) - Number(v.mileage || 0);
  /* every reason a vehicle needs attention: service (date or km), registration, insurance */
  function alerts(v) {
    const out = [], d = daysTo(v.nextService), k = kmLeft(v);
    if ((d != null && d < 0) || (k != null && k <= 0)) out.push({ kind: 'service', state: 'overdue' });
    else if ((d != null && d <= SVC_SOON_DAYS) || (k != null && k <= SVC_SOON_KM)) out.push({ kind: 'service', state: 'soon' });
    [['reg', v.registrationExpiry], ['ins', v.insuranceExpiry]].forEach(([kind, iso]) => { const n = daysTo(iso); if (n == null) return; if (n < 0) out.push({ kind, state: 'expired' }); else if (n <= DOC_SOON_DAYS) out.push({ kind, state: 'expiresSoon' }); });
    return out;
  }
  const stateOf = (v, kind) => { const a = alerts(v).find(x => x.kind === kind); return a ? a.state : 'ok'; };
  const tone = s => s === 'overdue' || s === 'expired' ? 'color:var(--crit);font-weight:800' : s === 'soon' || s === 'expiresSoon' ? 'color:var(--warn);font-weight:800' : '';
  const statusPill = v => OC.pill(v.status === 'available' ? 'good' : v.status === 'inuse' ? 'info' : 'warn', t('vehicles.s.' + v.status), v.status === 'available' ? 'check' : v.status === 'inuse' ? 'key' : 'wrench');
  const typeIcon = v => ['suv', 'van', 'bus'].includes(v.type) ? 'car' : 'truck';

  function fields() {
    return [
      { key: 'name', label: t('vehicles.f.name'), required: true, placeholder: 'Nissan Patrol 1' },
      { key: 'plate', label: t('vehicles.f.plate'), required: true, placeholder: 'HSD 7421' },
      { key: 'type', label: t('vehicles.f.type'), type: 'select', options: TYPES.map(x => ({ value: x, label: t('vehicles.t.' + x) })) },
      { key: 'year', label: t('vehicles.f.year'), type: 'number', min: 1990, max: 2100, step: 1 },
      { key: 'status', label: t('status'), type: 'select', options: STATUS.map(x => ({ value: x, label: t('vehicles.s.' + x) })) },
      { key: 'assignedTo', label: t('vehicles.f.assigned'), list: OC.db.team.map(m => m.name) },
      { key: 'mileage', label: t('vehicles.f.mileage'), type: 'number', min: 0, step: 1 },
      { key: 'nextService', label: t('vehicles.f.nextService'), type: 'date' },
      { key: 'nextServiceKm', label: t('vehicles.f.nextServiceKm'), type: 'number', min: 0, step: 100 },
      { key: 'registrationExpiry', label: t('vehicles.f.registration'), type: 'date' },
      { key: 'insuranceExpiry', label: t('vehicles.f.insurance'), type: 'date' },
      { key: 'notes', label: t('notes'), type: 'textarea' }
    ];
  }
  function openForm(id) {
    const existing = id ? OC.find('vehicles', id) : null;
    OC.form({
      title: existing ? t('vehicles.edit') : t('vehicles.add'), fields: fields(), values: existing || { type: 'suv', status: 'available', mileage: 0 },
      onSubmit(v) {
        if (v.status !== 'inuse') v.assignedTo = '';
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
  const kv = (label, value, style) => `<div><span>${esc(label)}</span><b${style ? ` style="${style}"` : ''}>${value}</b></div>`;

  function card(v) {
    const svc = stateOf(v, 'service'), reg = stateOf(v, 'reg'), ins = stateOf(v, 'ins'), k = kmLeft(v);
    const svcText = [v.nextService ? esc(OC.fmtDate(v.nextService)) : '', svc !== 'ok' ? esc(t('vehicles.sv.' + svc)) : ''].filter(Boolean).join(' · ') || '—';
    const kmText = v.nextServiceKm != null && v.nextServiceKm !== '' ? `<small class="muted" style="display:block;font-weight:600">${esc(t('vehicles.atKm', { n: OC.fmtNum(v.nextServiceKm) }))} · ${esc(k < 0 ? t('vehicles.kmOver', { n: OC.fmtNum(-k) }) : t('vehicles.kmLeft', { n: OC.fmtNum(k) }))}</small>` : '';
    const doc = (iso, state) => iso ? `${esc(OC.fmtDate(iso))}${state !== 'ok' ? ' · ' + esc(t('vehicles.sv.' + state)) : ''}` : '—';
    return `<div class="card vcard">
      <div class="top"><div class="row" style="gap:12px"><span class="ico">${I(typeIcon(v))}</span><div><h4>${esc(v.name)}</h4><span class="plate">${esc(v.plate)}</span>${v.year ? ` <span class="muted small">${esc(v.year)}</span>` : ''}</div></div>${statusPill(v)}</div>
      <div class="kv">
        ${kv(t('vehicles.f.type'), esc(t('vehicles.t.' + (v.type || 'other'))))}
        ${kv(t('vehicles.f.assigned'), esc(v.assignedTo || '—'))}
        ${kv(t('vehicles.f.mileage'), esc(OC.fmtNum(v.mileage)) + ' km')}
        ${kv(t('vehicles.f.nextService'), svcText + kmText, tone(svc))}
        ${kv(t('vehicles.f.registration'), doc(v.registrationExpiry, reg), tone(reg))}
        ${kv(t('vehicles.f.insurance'), doc(v.insuranceExpiry, ins), tone(ins))}
      </div>
      ${v.notes ? `<p class="muted small">${I('info')} ${esc(v.notes)}</p>` : ''}
      <div class="foot">
        ${v.status === 'available' ? `<button class="btn sm primary" data-act="checkout" data-id="${v.id}">${I('key')}${esc(t('vehicles.checkoutBtn'))}</button>` : ''}
        ${v.status === 'inuse' ? `<button class="btn sm primary" data-act="checkin" data-id="${v.id}">${I('check')}${esc(t('vehicles.checkinBtn'))}</button>` : ''}
        ${v.status !== 'maintenance' ? `<button class="btn sm" data-act="maint" data-id="${v.id}">${I('wrench')}${esc(t('vehicles.toMaint'))}</button>` : `<button class="btn sm" data-act="ready" data-id="${v.id}">${I('check')}${esc(t('vehicles.backInService'))}</button>`}
        <span style="flex:1"></span>
        <button class="btn ghost icon sm" data-act="edit" data-id="${v.id}" aria-label="${esc(t('edit'))}">${I('edit')}</button><button class="btn ghost icon sm" data-act="del" data-id="${v.id}" aria-label="${esc(t('delete'))}">${I('trash')}</button>
      </div></div>`;
  }

  OC.modules.vehicles = {
    id: 'vehicles', icon: 'truck', order: 5,
    title: () => t('vehicles.title'), tagline: () => t('vehicles.tag'),
    count: () => { const n = OC.db.vehicles.filter(v => v.status === 'maintenance' || alerts(v).some(a => a.state === 'overdue' || a.state === 'expired')).length; return n || ''; },
    alerts,
    render() {
      const all = OC.db.vehicles, q = st.q.toLowerCase();
      const list = all.filter(v => (st.filter === 'all' || (st.filter === 'attention' ? alerts(v).length : v.status === st.filter)) && (!q || [v.name, v.plate, v.assignedTo, v.notes, t('vehicles.t.' + v.type)].some(x => String(x || '').toLowerCase().includes(q))))
        .sort((a, b) => a.name.localeCompare(b.name));
      const c = s => all.filter(v => v.status === s).length;
      const attention = all.filter(v => alerts(v).length), svcN = all.filter(v => stateOf(v, 'service') !== 'ok').length, docN = all.filter(v => stateOf(v, 'reg') !== 'ok' || stateOf(v, 'ins') !== 'ok').length;
      return `
      <div class="page-head"><div><h2>${esc(t('vehicles.title'))}</h2><p>${esc(t('vehicles.desc'))}</p></div>
        <div class="actions"><button class="btn" data-act="csv">${I('download')}${esc(t('inv.exportXlsx'))}</button><button class="btn" data-act="import">${I('upload')}${esc(t('imp.button'))}</button><button class="btn primary" data-act="add">${I('plus')}${esc(t('vehicles.add'))}</button></div></div>
      <div class="kpis">
        <div class="card kpi"><span class="lbl">${I('check')}${esc(t('vehicles.s.available'))}</span><span class="val">${c('available')}<small>/ ${all.length}</small></span></div>
        <div class="card kpi"><span class="lbl">${I('key')}${esc(t('vehicles.s.inuse'))}</span><span class="val">${c('inuse')}</span></div>
        <div class="card kpi"><span class="lbl">${I('wrench')}${esc(t('vehicles.s.maintenance'))}</span><span class="val">${c('maintenance')}</span></div>
        <div class="card kpi"><span class="lbl">${I('alert')}${esc(t('vehicles.attention'))}</span><span class="val">${attention.length}</span><span class="hint ${attention.length ? 'warn' : ''}">${esc(attention.length ? t('vehicles.attentionHint', { s: svcN, d: docN }) : t('vehicles.allGood'))}</span></div>
      </div>
      <div class="toolbar">${OC.search(st.q, t('vehicles.search'))}${OC.seg('filter', [{ value: 'all', label: t('all') }].concat(STATUS.map(s => ({ value: s, label: t('vehicles.s.' + s) }))).concat([{ value: 'attention', label: t('vehicles.attention') + (attention.length ? ` (${attention.length})` : '') }]), st.filter)}</div>
      ${list.length ? `<div class="grid-cards">${list.map(card).join('')}</div>` : OC.empty('truck', t('vehicles.empty'), all.length ? t('tryFilters') : t('vehicles.emptyHint'))}`;
    },
    actions: {
      add: () => openForm(), edit: d => openForm(d.id),
      q: (d, el) => { st.q = el.value; OC.refresh(); },
      filter: d => { st.filter = d.v; OC.refresh(); },
      checkout: d => checkout(d.id), checkin: d => checkin(d.id),
      maint: d => { const v = OC.find('vehicles', d.id); if (!v) return; v.status = 'maintenance'; v.assignedTo = ''; OC.save(); OC.toast(t('vehicles.sentMaint', { name: v.name }), 'info'); OC.refresh(); },
      ready: d => { const v = OC.find('vehicles', d.id); if (!v) return; v.status = 'available'; OC.save(); OC.toast(t('vehicles.nowAvailable', { name: v.name })); OC.refresh(); },
      async del(d) { const v = OC.find('vehicles', d.id); if (!v) return; if (await OC.confirm({ title: t('vehicles.delete'), message: t('vehicles.deleteMsg', { name: v.name }) })) { OC.remove('vehicles', d.id); OC.save(); OC.toast(t('deleted')); OC.refresh(); } },
      csv: () => OC.exportCSV('oneclick-vehicles.csv', [{ key: 'name', label: 'Vehicle' }, { key: 'plate', label: 'Plate' }, { key: 'type', label: 'Type', get: v => t('vehicles.t.' + (v.type || 'other')) }, { key: 'year', label: 'Year' }, { key: 'status', label: 'Status', get: v => t('vehicles.s.' + v.status) }, { key: 'assignedTo', label: 'Assigned to' }, { key: 'mileage', label: 'Mileage (km)' }, { key: 'nextService', label: 'Next service' }, { key: 'nextServiceKm', label: 'Next service (km)' }, { key: 'registrationExpiry', label: 'Registration expiry' }, { key: 'insuranceExpiry', label: 'Insurance expiry' }, { key: 'notes', label: 'Notes' }], OC.db.vehicles)
    }
  };
})(window.OC);
