/* OneClick · Excel import definitions for vehicles, 3D prints, weekly tasks, shift turnover and ideas.
   (Team, inventory, training and calendar define theirs in their own module files.) */
window.OC = window.OC || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), U = OC.util, C = () => OC.cells;
  const txt = v => String(v == null ? '' : v).trim();
  const PRI = { high: ['high', 'urgent', 'critical', 'h', 'عالية', 'عاجل', 'مستعجل'], med: ['medium', 'normal', 'm', 'متوسطة', 'عادية'], low: ['low', 'l', 'منخفضة'] };

  const specs = {
    vehicles: {
      id: 'vehicles', icon: 'truck', title: () => t('vehicles.title'), count: () => OC.db.vehicles.length,
      fields: [
        { key: 'name', label: 'vehicles.f.name', required: true, aliases: ['vehicle', 'name', 'car', 'model', 'description', 'المركبة', 'السيارة', 'الاسم', 'الموديل'] },
        { key: 'plate', label: 'vehicles.f.plate', aliases: ['plate', 'plate no', 'plate number', 'registration', 'reg no', 'door no', 'اللوحة', 'رقم اللوحة', 'رقم الباب'] },
        { key: 'type', label: 'vehicles.f.type', aliases: ['type', 'category', 'body', 'النوع', 'الفئة'] },
        { key: 'year', label: 'vehicles.f.year', type: 'number', aliases: ['year', 'model year', 'سنة الصنع', 'سنة'] },
        { key: 'status', label: 'status', aliases: ['status', 'condition', 'الحالة'] },
        { key: 'assignedTo', label: 'vehicles.f.assigned', aliases: ['assigned to', 'driver', 'custodian', 'user', 'السائق', 'المستلم', 'العهدة'] },
        { key: 'mileage', label: 'vehicles.f.mileage', type: 'number', aliases: ['mileage', 'odometer', 'km', 'reading', 'العداد', 'الكيلومترات', 'قراءة العداد'] },
        { key: 'nextService', label: 'vehicles.f.nextService', type: 'date', aliases: ['next service', 'service date', 'next pm', 'موعد الصيانة', 'الصيانة القادمة'] },
        { key: 'nextServiceKm', label: 'vehicles.f.nextServiceKm', type: 'number', aliases: ['next service km', 'service km', 'كم الصيانة', 'الصيانة القادمة كم'] },
        { key: 'registrationExpiry', label: 'vehicles.f.registration', type: 'date', aliases: ['registration expiry', 'istimara', 'license expiry', 'انتهاء الاستمارة', 'الاستمارة'] },
        { key: 'insuranceExpiry', label: 'vehicles.f.insurance', type: 'date', aliases: ['insurance', 'insurance expiry', 'انتهاء التأمين', 'التأمين'] },
        { key: 'notes', label: 'notes', aliases: ['notes', 'remarks', 'ملاحظات'] }
      ],
      modes: [{ value: 'merge', label: () => t('veh.m.merge'), hint: () => t('veh.m.mergeHint') }, { value: 'replace', label: () => t('imp.m.replace') }],
      template: () => [[t('vehicles.f.name'), t('vehicles.f.plate'), t('vehicles.f.type'), t('vehicles.f.year'), t('status'), t('vehicles.f.mileage'), t('vehicles.f.nextService'), t('vehicles.f.nextServiceKm'), t('vehicles.f.registration'), t('vehicles.f.insurance')],
        ['Nissan Patrol 1', 'HSD 7421', t('vehicles.t.suv'), 2023, t('vehicles.s.available'), 38420, U.addDays(U.today(), 18), 40000, U.addDays(U.today(), 210), U.addDays(U.today(), 120)],
        ['RAM Double Cab 1', 'RKB 5120', t('vehicles.t.doublecab'), 2024, t('vehicles.s.inuse'), 12300, U.addDays(U.today(), 85), 15000, U.addDays(U.today(), 330), U.addDays(U.today(), 290)]],
      async run({ records, mode }) {
        const types = C().enumTable(['suv', 'singlecab', 'doublecab', 'pickup', 'van', 'truck', 'bus', 'forklift', 'other'], 'vehicles.t.', {
          suv: ['patrol', 'باترول', 'جيب', 'land cruiser', 'لاندكروزر', 'tahoe', 'تاهو', 'yukon', 'يوكن', 'suburban'], singlecab: ['single cab', 'regular cab', 'غمارة', 'غماره'], doublecab: ['double cab', 'crew cab', 'quad cab', 'غمارتين', 'دبل'],
          pickup: ['pickup', 'pick up', 'بيك اب', 'hilux', 'هايلكس'], van: ['van', 'فان', 'hiace', 'هايس'], truck: ['truck', 'شاحنة', 'دينا', 'لوري'], bus: ['bus', 'coaster', 'باص', 'حافلة', 'كوستر'], forklift: ['forklift', 'فوركلفت', 'رافعة شوكية'] });
        const status = C().enumTable(['available', 'inuse', 'maintenance'], 'vehicles.s.', { available: ['available', 'free', 'ready', 'متاحة', 'متاح', 'جاهزة'], inuse: ['in use', 'assigned', 'checked out', 'مستخدمة', 'مستلمة'], maintenance: ['maintenance', 'workshop', 'repair', 'broken', 'down', 'صيانة', 'ورشة', 'عطلانة'] });
        if (mode === 'replace') OC.db.vehicles = [];
        let added = 0, updated = 0; const N = C().norm;
        records.forEach(r => {
          const v = { name: r.name, plate: txt(r.plate) || r.name, type: C().matchEnum(r.type, types, null) || C().matchEnum(r.name, types, 'other') };
          ['year', 'mileage', 'nextServiceKm'].forEach(k => { if (r[k] !== '') v[k] = r[k]; });
          ['nextService', 'registrationExpiry', 'insuranceExpiry', 'notes', 'assignedTo'].forEach(k => { if (r[k] !== '') v[k] = r[k]; });
          if (r.status !== '') v.status = C().matchEnum(r.status, status, 'available');
          const ex = OC.db.vehicles.find(x => N(x.plate) === N(v.plate)) || OC.db.vehicles.find(x => N(x.name) === N(v.name));
          if (ex) { Object.assign(ex, v); updated++; } else { OC.db.vehicles.push(Object.assign({ id: U.uid(), status: 'available', assignedTo: '', mileage: 0, nextServiceKm: null, year: null }, v)); added++; }
        });
        return t('imp.addedUpdated', { a: added, u: updated });
      }
    },
    prints: {
      id: 'prints', icon: 'cube', title: () => t('prints.title'), count: () => OC.db.prints.length,
      fields: [
        { key: 'item', label: 'prints.f.item', required: true, aliases: ['item', 'part', 'part name', 'description', 'القطعة', 'الصنف', 'الوصف'] },
        { key: 'requester', label: 'prints.f.requester', aliases: ['requester', 'requested by', 'by', 'name', 'الطالب', 'مقدم الطلب', 'طلبها'] },
        { key: 'material', label: 'prints.f.material', aliases: ['material', 'filament', 'الخامة', 'المادة'] },
        { key: 'qty', label: 'prints.f.qty', type: 'number', aliases: ['qty', 'quantity', 'الكمية', 'العدد'] },
        { key: 'due', label: 'prints.f.due', type: 'date', aliases: ['due', 'due date', 'needed by', 'deadline', 'الموعد', 'مطلوبة بتاريخ'] },
        { key: 'priority', label: 'priority', aliases: ['priority', 'الأولوية'] },
        { key: 'status', label: 'status', aliases: ['status', 'الحالة'] },
        { key: 'notes', label: 'notes', aliases: ['notes', 'remarks', 'ملاحظات'] }
      ],
      modes: [{ value: 'append', label: () => t('imp.m.append') }, { value: 'replace', label: () => t('imp.m.replace') }],
      template: () => [[t('prints.f.item'), t('prints.f.requester'), t('prints.f.material'), t('prints.f.qty'), t('prints.f.due'), t('priority')], ['Sensor bracket v3', 'Fahad', 'PETG', 2, U.addDays(U.today(), 3), t('pri.high')]],
      async run({ records, mode }) {
        if (mode === 'replace') OC.db.prints = [];
        const st = C().enumTable(['queued', 'printing', 'done', 'failed'], 'prints.s.', { queued: ['queue', 'new', 'pending', 'جديد', 'انتظار'], printing: ['printing', 'in progress', 'جاري'], done: ['done', 'completed', 'finished', 'منجز', 'تم'], failed: ['failed', 'error', 'فشل'] });
        records.forEach(r => { const status = C().matchEnum(r.status, st, 'queued'); OC.db.prints.push({ id: U.uid(), item: r.item, requester: r.requester || '', material: txt(r.material).toUpperCase() || 'PLA', qty: r.qty || 1, due: r.due || '', priority: C().matchEnum(r.priority, C().enumTable(['high', 'med', 'low'], 'pri.', PRI), 'med'), status, progress: status === 'done' ? 100 : 0, notes: r.notes || '' }); });
        return t('imp.addedN', { n: records.length });
      }
    },
    week: {
      id: 'tasks', icon: 'gauge', title: () => t('week.title'), count: () => OC.db.tasks.length,
      fields: [
        { key: 'title', label: 'week.f.title', required: true, aliases: ['task', 'title', 'activity', 'work', 'description', 'المهمة', 'العمل', 'النشاط', 'الوصف'] },
        { key: 'owner', label: 'week.f.owner', aliases: ['owner', 'assigned to', 'responsible', 'name', 'المسؤول', 'المكلف', 'الاسم'] },
        { key: 'priority', label: 'priority', aliases: ['priority', 'الأولوية'] },
        { key: 'week', label: 'week.f.week', type: 'number', aliases: ['week', 'week no', 'wk', 'الأسبوع', 'رقم الأسبوع'] },
        { key: 'year', label: 'week.f.year', type: 'number', aliases: ['year', 'السنة'] },
        { key: 'done', label: 'week.done', type: 'bool', aliases: ['done', 'completed', 'status', 'منجز', 'منجزة', 'الحالة', 'تم'] }
      ],
      modes: [{ value: 'append', label: () => t('imp.m.append') }, { value: 'replace', label: () => t('imp.m.replace') }],
      template: () => { const w = U.isoWeek(new Date()); return [[t('week.f.title'), t('week.f.owner'), t('priority'), t('week.f.week'), t('week.f.year'), t('week.done')], ['Complete PM work orders', 'Ahmed', t('pri.high'), w.week, w.year, ''], ['Update tool register', 'Reem', t('pri.low'), w.week, w.year, '✓']]; },
      async run({ records, mode }) {
        if (mode === 'replace') OC.db.tasks = [];
        const cw = U.isoWeek(new Date()), pri = C().enumTable(['high', 'med', 'low'], 'pri.', PRI);
        records.forEach(r => { const year = r.year >= 2000 && r.year < 2200 ? r.year : cw.year; const week = r.week >= 1 && r.week <= U.weeksInYear(year) ? r.week : cw.week; OC.db.tasks.push({ id: U.uid(), title: r.title, owner: r.owner || '', priority: C().matchEnum(r.priority, pri, 'med'), week, year, done: !!r.done }); });
        return t('imp.addedN', { n: records.length });
      }
    },
    turnover: {
      id: 'turnover', icon: 'swap', title: () => t('turnover.title'), count: () => OC.db.turnovers.length,
      fields: [
        { key: 'date', label: 'turnover.f.date', type: 'date', required: true, aliases: ['date', 'التاريخ'] },
        { key: 'shift', label: 'turnover.f.shift', aliases: ['shift', 'الوردية'] },
        { key: 'from', label: 'turnover.f.from', aliases: ['from', 'handed over by', 'outgoing', 'سلم', 'المسلم'] },
        { key: 'to', label: 'turnover.f.to', aliases: ['to', 'received by', 'incoming', 'استلم', 'المستلم'] },
        { key: 'summary', label: 'turnover.f.summary', required: true, aliases: ['summary', 'notes', 'details', 'الملخص', 'ملاحظات', 'التفاصيل'] },
        { key: 'issues', label: 'turnover.f.issues', aliases: ['issues', 'open issues', 'pending', 'المسائل', 'مسائل مفتوحة', 'المعلقات'] }
      ],
      modes: [{ value: 'append', label: () => t('imp.m.append') }, { value: 'replace', label: () => t('imp.m.replace') }],
      template: () => [[t('turnover.f.date'), t('turnover.f.shift'), t('turnover.f.from'), t('turnover.f.to'), t('turnover.f.summary'), t('turnover.f.issues')], [U.today(), t('turnover.night'), 'Khalid', 'Ahmed', 'Quiet night. P-204 on standby.', 'P-204 vibration; Workshop AC tripping']],
      async run({ records, mode }) {
        if (mode === 'replace') OC.db.turnovers = [];
        const sh = C().enumTable(['day', 'night'], 'turnover.', { day: ['day', 'd', 'morning', 'نهار', 'نهاري', 'صباح'], night: ['night', 'n', 'evening', 'ليل', 'ليلي', 'مساء'] });
        records.forEach(r => OC.db.turnovers.push({ id: U.uid(), date: r.date, shift: C().matchEnum(r.shift, sh, 'day'), from: r.from || '', to: r.to || '', summary: r.summary, issues: txt(r.issues).split(/\n|;|\|/).map(s => s.trim()).filter(Boolean).map(text => ({ id: U.uid(), text, open: true })), created: U.nowISO() }));
        return t('imp.addedN', { n: records.length });
      }
    },
    ideas: {
      id: 'ideas', icon: 'bulb', title: () => t('ideas.title'), count: () => OC.db.ideas.length,
      fields: [
        { key: 'title', label: 'ideas.f.title', required: true, aliases: ['idea', 'title', 'suggestion', 'الفكرة', 'العنوان', 'الاقتراح'] },
        { key: 'by', label: 'ideas.f.by', aliases: ['by', 'suggested by', 'name', 'owner', 'اقترحها', 'الاسم', 'صاحب الفكرة'] },
        { key: 'desc', label: 'ideas.f.desc', aliases: ['description', 'details', 'desc', 'الوصف', 'التفاصيل'] },
        { key: 'status', label: 'status', aliases: ['status', 'الحالة'] },
        { key: 'votes', label: 'ideas.votes', type: 'number', aliases: ['votes', 'الأصوات'] }
      ],
      modes: [{ value: 'append', label: () => t('imp.m.append') }, { value: 'replace', label: () => t('imp.m.replace') }],
      template: () => [[t('ideas.f.title'), t('ideas.f.by'), t('ideas.f.desc'), t('status')], ['QR codes on tools', 'Reem', 'Scan to check tools out and in.', t('ideas.s.new')]],
      async run({ records, mode }) {
        if (mode === 'replace') { OC.db.ideas = []; OC.db.votes = []; }
        const st = C().enumTable(['new', 'review', 'approved', 'done', 'rejected'], 'ideas.s.', { review: ['review', 'pending', 'مراجعة'], approved: ['approved', 'accepted', 'معتمدة', 'موافق'], done: ['done', 'implemented', 'منفذة', 'تم'], rejected: ['rejected', 'no', 'مرفوضة'] });
        records.forEach(r => OC.db.ideas.push({ id: U.uid(), title: r.title, by: r.by || '', desc: r.desc || r.title, status: C().matchEnum(r.status, st, 'new'), votes: Math.max(0, Math.round(Number(r.votes) || 0)), created: U.nowISO() }));
        return t('imp.addedN', { n: records.length });
      }
    }
  };
  Object.keys(specs).forEach(id => {
    const m = OC.modules[id]; if (!m) return;
    m.importSpecs = [specs[id]];
    m.actions.import = () => OC.importer.open(specs[id]);
  });
  /* vehicles: Excel export replaces CSV */
  if (OC.modules.vehicles) OC.modules.vehicles.actions.csv = async () => {
    const f = specs.vehicles.fields, list = OC.db.vehicles;
    const aoa = [f.map(x => t(x.label))].concat(list.map(v => f.map(x => x.key === 'type' ? t('vehicles.t.' + (v.type || 'other')) : x.key === 'status' ? t('vehicles.s.' + v.status) : (v[x.key] == null ? '' : v[x.key]))));
    try { await OC.xlsx.exportBook(`oneclick-vehicles-${U.today()}.xlsx`, [{ name: t('vehicles.title'), aoa }]); OC.toast(t('exported', { n: list.length })); } catch (e) { OC.toast(e.message, 'err'); }
  };
})(window.OC);
