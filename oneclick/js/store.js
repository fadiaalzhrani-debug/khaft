/* OneClick · data layer: localStorage persistence, helpers, sample data */
window.OC = window.OC || {};
(function (OC) {
  'use strict';
  const KEY = 'oneclick.v1';
  const SEED = 3; // bump when sample data changes shape; migrate() refreshes untouched sample lists

  /* ---------- helpers ---------- */
  const pad = n => String(n).padStart(2, '0');
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = iso => new Date(iso + 'T00:00:00');
  const today = () => toISO(new Date());
  const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
  const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const nowISO = () => new Date().toISOString();

  /* ISO-8601 week number (weeks start Monday, week 1 contains Jan 4th) */
  function isoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return { week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7), year: d.getUTCFullYear() };
  }
  function weekStart(year, week) {
    const jan4 = new Date(year, 0, 4);
    const dow = jan4.getDay() || 7;
    const monday = new Date(year, 0, 4 - dow + 1 + (week - 1) * 7);
    return toISO(monday);
  }
  function weeksInYear(year) { return isoWeek(new Date(year, 11, 28)).week; }
  function shiftWeek(year, week, delta) {
    const d = parseISO(weekStart(year, week));
    d.setDate(d.getDate() + delta * 7);
    const w = isoWeek(d);
    return { year: w.year, week: w.week };
  }

  /* ---------- sample data (relative to today so the demo always looks alive) ---------- */
  function sample() {
    const t = today();
    const cw = isoWeek(new Date());
    const pw = shiftWeek(cw.year, cw.week, -1);
    const monthStr = t.slice(0, 7);
    const dom = n => `${monthStr}-${pad(n)}`;
    const team = SAMPLE_TEAM.map(m => Object.assign({ id: uid() }, m));
    return {
      courses: sampleCourses(), training: {}, leaves: [], users: [], requests: [],
      settings: { lang: 'en', theme: 'dark', bg: '3d', teamName: 'Maintenance Team', owner: '', seed: SEED },
      team,
      inventory: [
        { id: uid(), name: 'Nitrile gloves (box)', sku: 'PPE-0101', category: 'PPE', qty: 14, min: 10, unit: 'box', location: 'Cabinet A1' },
        { id: uid(), name: 'Safety glasses', sku: 'PPE-0115', category: 'PPE', qty: 6, min: 12, unit: 'pcs', location: 'Cabinet A1' },
        { id: uid(), name: 'Hex bolt M12x50', sku: 'FST-2201', category: 'Fasteners', qty: 240, min: 100, unit: 'pcs', location: 'Bin B3' },
        { id: uid(), name: 'Hydraulic oil ISO 46', sku: 'LUB-3001', category: 'Lubricants', qty: 3, min: 4, unit: 'drum', location: 'Store C' },
        { id: uid(), name: 'PLA filament 1.75mm', sku: '3DP-4010', category: '3D Printing', qty: 2, min: 3, unit: 'spool', location: 'Print room' },
        { id: uid(), name: 'PETG filament 1.75mm', sku: '3DP-4012', category: '3D Printing', qty: 5, min: 2, unit: 'spool', location: 'Print room' },
        { id: uid(), name: 'Cable ties 300mm', sku: 'ELC-5120', category: 'Electrical', qty: 0, min: 5, unit: 'pack', location: 'Bin D2' },
        { id: uid(), name: 'Teflon tape', sku: 'CON-6001', category: 'Consumables', qty: 30, min: 15, unit: 'roll', location: 'Bin D1' },
        { id: uid(), name: 'Cutting discs 115mm', sku: 'CON-6044', category: 'Consumables', qty: 18, min: 20, unit: 'pcs', location: 'Workshop' }
      ],
      events: [
        { id: uid(), date: t, time: '07:30', title: 'Toolbox safety talk', type: 'safety', notes: 'Topic: hand injuries' },
        { id: uid(), date: t, time: '10:00', title: 'Weekly planning meeting', type: 'meeting', notes: '' },
        { id: uid(), date: addDays(t, 1), time: '08:00', title: 'PM inspection – Pump P-204', type: 'maintenance', notes: 'Bring vibration kit' },
        { id: uid(), date: addDays(t, 3), time: '13:00', title: 'Confined space refresher', type: 'training', notes: 'Training center, room 2' },
        { id: uid(), date: addDays(t, 6), time: '09:00', title: 'Vehicle inspection day', type: 'other', notes: '' },
        { id: uid(), date: dom(2), time: '08:30', title: 'Monthly KPI review', type: 'meeting', notes: '' },
        { id: uid(), date: dom(20), time: '07:00', title: 'Fire drill', type: 'safety', notes: 'Assembly point 3' }
      ],
      prints: [
        { id: uid(), item: 'Sensor bracket v3', requester: 'Fahad Al-Otaibi', material: 'PETG', qty: 2, status: 'printing', progress: 65, due: addDays(t, 1), priority: 'high', notes: 'Mount for vibration sensor' },
        { id: uid(), item: 'Gauge protective cover', requester: 'Khalid Al-Dossary', material: 'PLA', qty: 4, status: 'queued', progress: 0, due: addDays(t, 3), priority: 'med', notes: '' },
        { id: uid(), item: 'Cable clip 25mm', requester: 'Sara Al-Zahrani', material: 'PLA', qty: 20, status: 'queued', progress: 0, due: addDays(t, 5), priority: 'low', notes: '' },
        { id: uid(), item: 'Tool shadow board insert', requester: 'Ahmed Al-Harbi', material: 'PLA', qty: 1, status: 'done', progress: 100, due: addDays(t, -2), priority: 'med', notes: '' },
        { id: uid(), item: 'Valve handle replica', requester: 'Omar Al-Ghamdi', material: 'Nylon', qty: 1, status: 'failed', progress: 40, due: addDays(t, -1), priority: 'high', notes: 'Warping – retry with brim' }
      ],
      vehicles: [
        { id: uid(), name: 'Nissan Patrol 1', plate: 'HSD 7421', type: 'suv', year: 2023, status: 'available', assignedTo: '', mileage: 38420, nextService: addDays(t, 18), nextServiceKm: 40000, registrationExpiry: addDays(t, 210), insuranceExpiry: addDays(t, 120), notes: '' },
        { id: uid(), name: 'Nissan Patrol 2', plate: 'HSD 7422', type: 'suv', year: 2022, status: 'inuse', assignedTo: 'Ahmed Al-Harbi', mileage: 61350, nextService: addDays(t, 35), nextServiceKm: 65000, registrationExpiry: addDays(t, 10), insuranceExpiry: addDays(t, 95), notes: '' },
        { id: uid(), name: 'Nissan Patrol 3', plate: 'HSD 7423', type: 'suv', year: 2021, status: 'maintenance', assignedTo: '', mileage: 92780, nextService: addDays(t, -2), nextServiceKm: 90000, registrationExpiry: addDays(t, 150), insuranceExpiry: addDays(t, 25), notes: 'Brake pads + AC compressor at the dealer' },
        { id: uid(), name: 'RAM Single Cab 1', plate: 'RKA 3310', type: 'singlecab', year: 2023, status: 'available', assignedTo: '', mileage: 27900, nextService: addDays(t, 40), nextServiceKm: 30000, registrationExpiry: addDays(t, 300), insuranceExpiry: addDays(t, 200), notes: '' },
        { id: uid(), name: 'RAM Single Cab 2', plate: 'RKA 3311', type: 'singlecab', year: 2022, status: 'inuse', assignedTo: 'Fahad Al-Otaibi', mileage: 54600, nextService: addDays(t, 12), nextServiceKm: 55000, registrationExpiry: addDays(t, 80), insuranceExpiry: addDays(t, 45), notes: '' },
        { id: uid(), name: 'RAM Single Cab 3', plate: 'RKA 3312', type: 'singlecab', year: 2020, status: 'available', assignedTo: '', mileage: 118200, nextService: addDays(t, 60), nextServiceKm: 120000, registrationExpiry: addDays(t, -5), insuranceExpiry: addDays(t, 140), notes: 'Registration renewal in progress' },
        { id: uid(), name: 'RAM Double Cab 1', plate: 'RKB 5120', type: 'doublecab', year: 2024, status: 'available', assignedTo: '', mileage: 12300, nextService: addDays(t, 85), nextServiceKm: 15000, registrationExpiry: addDays(t, 330), insuranceExpiry: addDays(t, 290), notes: '' },
        { id: uid(), name: 'RAM Double Cab 2', plate: 'RKB 5121', type: 'doublecab', year: 2023, status: 'inuse', assignedTo: 'Sara Al-Zahrani', mileage: 44100, nextService: addDays(t, 9), nextServiceKm: 45000, registrationExpiry: addDays(t, 190), insuranceExpiry: addDays(t, 20), notes: '' },
        { id: uid(), name: 'RAM Double Cab 3', plate: 'RKB 5122', type: 'doublecab', year: 2021, status: 'maintenance', assignedTo: '', mileage: 76500, nextService: addDays(t, 3), nextServiceKm: 80000, registrationExpiry: addDays(t, 60), insuranceExpiry: addDays(t, 60), notes: 'Tires + wheel alignment' }
      ],
      tasks: [
        { id: uid(), title: 'Complete PM work orders (12)', owner: 'Ahmed Al-Harbi', year: cw.year, week: cw.week, done: true, priority: 'high' },
        { id: uid(), title: 'Calibrate pressure gauges – Unit 3', owner: 'Omar Al-Ghamdi', year: cw.year, week: cw.week, done: true, priority: 'med' },
        { id: uid(), title: 'Replace worn belts on conveyor C-2', owner: 'Fahad Al-Otaibi', year: cw.year, week: cw.week, done: true, priority: 'high' },
        { id: uid(), title: 'Update tool register', owner: 'Reem Al-Qahtani', year: cw.year, week: cw.week, done: true, priority: 'low' },
        { id: uid(), title: 'Close safety observations', owner: 'Noura Al-Shehri', year: cw.year, week: cw.week, done: false, priority: 'high' },
        { id: uid(), title: 'Shadow board for workshop', owner: 'Ahmed Al-Harbi', year: cw.year, week: cw.week, done: false, priority: 'med' },
        { id: uid(), title: 'Submit monthly KPI report', owner: 'Sara Al-Zahrani', year: cw.year, week: cw.week, done: false, priority: 'med' },
        { id: uid(), title: 'Weekly vehicle checks', owner: 'Yousef Al-Mutairi', year: pw.year, week: pw.week, done: true, priority: 'low' },
        { id: uid(), title: 'Lubrication route – Area 2', owner: 'Fahad Al-Otaibi', year: pw.year, week: pw.week, done: true, priority: 'med' },
        { id: uid(), title: 'Housekeeping audit', owner: 'Noura Al-Shehri', year: pw.year, week: pw.week, done: false, priority: 'low' }
      ],
      turnovers: [
        { id: uid(), date: t, shift: 'night', from: 'Khalid Al-Dossary', to: 'Ahmed Al-Harbi',
          summary: 'Quiet night. Pump P-204 running on standby after high vibration alarm at 02:10. Contractor crew left at 23:00.',
          issues: [{ id: uid(), text: 'P-204 vibration alarm – needs analysis', open: true }, { id: uid(), text: 'Workshop AC unit tripping', open: true }, { id: uid(), text: 'Replace missing fire extinguisher sign – Bay 2', open: false }],
          created: nowISO() },
        { id: uid(), date: addDays(t, -1), shift: 'day', from: 'Ahmed Al-Harbi', to: 'Khalid Al-Dossary',
          summary: 'Completed 4 PM work orders. Nissan Patrol 3 sent to the dealer for brakes and AC. Awaiting PETG filament delivery.',
          issues: [{ id: uid(), text: 'Nissan Patrol 3 out of service until the dealer confirms a date', open: true }],
          created: nowISO() }
      ],
      ideas: [
        { id: uid(), title: 'QR codes on tools for instant check-out', by: 'Reem Al-Qahtani', desc: 'Print QR labels for all shared tools; scanning logs who took it and when. Cuts time spent hunting for tools.', status: 'approved', votes: 9, created: nowISO() },
        { id: uid(), title: 'Digital shift turnover instead of paper', by: 'Khalid Al-Dossary', desc: 'Move the turnover log to this dashboard so open issues never get lost between shifts.', status: 'done', votes: 12, created: nowISO() },
        { id: uid(), title: '3D-printed spare clips for cable trays', by: 'Fahad Al-Otaibi', desc: 'Stock-outs on clips delay small jobs. Printing a batch locally takes an hour.', status: 'review', votes: 5, created: nowISO() },
        { id: uid(), title: 'Weekly 10-minute safety video', by: 'Noura Al-Shehri', desc: 'Short videos recorded by the team on recent near-misses.', status: 'new', votes: 3, created: nowISO() }
      ],
      votes: []
    };
  }
  const SAMPLE_TEAM = [
    { name: 'Ahmed Al-Harbi', badge: '87163', role: 'Team Lead', group: 'Mechanical', shift: 'A', status: 'on', phone: '0550000001' },
    { name: 'Fahad Al-Otaibi', badge: '87201', role: 'Mechanical Tech', group: 'Mechanical', shift: 'A', status: 'on', phone: '0550000002' },
    { name: 'Sara Al-Zahrani', badge: '87355', role: 'Planner', group: 'Planning', shift: 'A', status: 'on', phone: '0550000003' },
    { name: 'Khalid Al-Dossary', badge: '87410', role: 'Electrical Tech', group: 'Electrical', shift: 'B', status: 'off', phone: '0550000004' },
    { name: 'Noura Al-Shehri', badge: '87488', role: 'Safety Officer', group: 'Safety', shift: 'A', status: 'training', phone: '0550000005' },
    { name: 'Omar Al-Ghamdi', badge: '87502', role: 'Instrument Tech', group: 'Electrical', shift: 'B', status: 'leave', phone: '0550000006' },
    { name: 'Yousef Al-Mutairi', badge: '87577', role: 'Welder', group: 'Mechanical', shift: 'C', status: 'off', phone: '0550000007' },
    { name: 'Reem Al-Qahtani', badge: '87634', role: 'Materials Coordinator', group: 'Planning', shift: 'A', status: 'on', phone: '0550000008' }
  ];
  const SAMPLE_GROUPS = Object.fromEntries(SAMPLE_TEAM.map(m => [m.name, m.group]));
  function sampleCourses() {
    return [['H2S Awareness', 24], ['First Aid & CPR', 24], ['Fire Fighting', 36], ['Confined Space Entry', 24], ['Working at Heights', 36], ['Lock-out / Tag-out', 24], ['Forklift Operation', 36], ['Defensive Driving', 36]]
      .map(([name, validity]) => ({ id: uid(), name, validity }));
  }
  /* completions and leaves for the sample team, relative to today */
  function sampleTraining(team, courses) {
    const t = today(), training = {};
    courses.forEach((c, ci) => {
      training[c.id] = {};
      team.forEach((m, mi) => {
        const k = (mi * 7 + ci * 3) % 10;
        if (k < 6) training[c.id][m.id] = addDays(t, -(40 + ((mi * 53 + ci * 97) % 600)));
        else if (k === 6) training[c.id][m.id] = addDays(t, -(800 + mi * 9)); // expired
      });
    });
    return training;
  }
  function sampleLeaves(team) {
    const t = today(), L = (mi, type, a, b, notes) => ({ id: uid(), personId: team[mi].id, type, from: addDays(t, a), to: addDays(t, b), notes: notes || '' });
    return [
      L(5, 'annual', -3, 10, 'Family travel'), L(4, 'training', -1, 2, 'NEBOSH module 2'), L(1, 'training', 6, 8, 'Rigging course'),
      L(2, 'annual', 24, 37), L(3, 'annual', 30, 44), L(7, 'annual', 33, 40), L(6, 'sick', -26, -25),
      L(0, 'annual', 62, 82), L(3, 'mission', 12, 15, 'Ras Tanura support'), L(6, 'annual', -60, -46), L(0, 'emergency', -90, -88)
    ];
  }

  function sampleFull() {
    const d = sample(); d.training = sampleTraining(d.team, d.courses); d.leaves = sampleLeaves(d.team); return d;
  }
  function empty() {
    return { settings: { lang: 'en', theme: 'dark', bg: '3d', teamName: 'My Team', owner: '', seed: SEED },
      courses: [], training: {}, leaves: [], users: [], requests: [], team: [], inventory: [], events: [], prints: [], vehicles: [], tasks: [], turnovers: [], ideas: [], votes: [] };
  }

  /* ---------- persistence ---------- */
  const LISTS = ['team', 'inventory', 'events', 'prints', 'vehicles', 'tasks', 'turnovers', 'ideas', 'votes', 'courses', 'leaves', 'users', 'requests'];
  const LEAVE_TYPES = ['annual', 'sick', 'emergency', 'training', 'mission', 'off', 'other'];
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  /* Everything that reaches the DOM goes through esc(), but ids land in attributes and numbers in
     inline styles, so imported backups are coerced into safe shapes here as well. */
  const SAFE_ID = /^[a-z0-9_-]{1,40}$/i;
  const NUMERIC = { inventory: ['qty', 'min'], prints: ['qty', 'progress'], vehicles: ['mileage'], tasks: ['week', 'year'], ideas: ['votes'] };
  const OPTIONAL_NUMERIC = { vehicles: ['year', 'nextServiceKm'], courses: ['validity'] };
  function normalize(data) {
    const base = empty();
    const out = Object.assign({}, base, data || {});
    out.settings = Object.assign({}, base.settings, (data && data.settings) || {});
    out.settings.lang = out.settings.lang === 'ar' ? 'ar' : 'en';
    out.settings.theme = out.settings.theme === 'light' ? 'light' : 'dark';
    out.settings.bg = out.settings.bg === 'minimal' ? 'minimal' : '3d';
    out.settings.teamName = String(out.settings.teamName || '').slice(0, 60);
    const int = (v, d, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    out.settings.maxOff = int(out.settings.maxOff, 2, 1, 99);
    out.settings.annualDays = int(out.settings.annualDays, 30, 0, 365);
    out.settings.weekend = ['fs', 'ss', 'f'].includes(out.settings.weekend) ? out.settings.weekend : 'fs';
    out.settings.leaveCount = out.settings.leaveCount === 'working' ? 'working' : 'calendar';
    const str = (v, n) => String(v == null ? '' : v).slice(0, n);
    const au = out.settings.auth && typeof out.settings.auth === 'object' ? out.settings.auth : {};
    out.settings.auth = { enabled: !!au.enabled, autoLock: int(au.autoLock, 5, 0, 240), approval: au.approval !== false,
      recovery: au.recovery && typeof au.recovery === 'object' ? { salt: str(au.recovery.salt, 64), hash: str(au.recovery.hash, 64) } : null };
    out.settings.brand = str(out.settings.brand || 'OneClick', 40) || 'OneClick';
    out.settings.accent = /^#[0-9a-f]{6}$/i.test(out.settings.accent || '') ? out.settings.accent : '';
    const lb = out.settings.labels && typeof out.settings.labels === 'object' ? out.settings.labels : {}; out.settings.labels = { en: {}, ar: {} };
    ['en', 'ar'].forEach(l => { const src = lb[l] && typeof lb[l] === 'object' ? lb[l] : {}; Object.keys(src).slice(0, 2000).forEach(k => { if (/^[\w.]{1,80}$/.test(k) && typeof src[k] === 'string' && src[k].trim()) out.settings.labels[l][k] = src[k].slice(0, 300); }); });
    out.settings.hiddenSections = Array.isArray(out.settings.hiddenSections) ? out.settings.hiddenSections.filter(x => /^[a-z]{2,20}$/.test(x)) : [];
    const hl = out.settings.homeLayout && typeof out.settings.homeLayout === 'object' ? out.settings.homeLayout : {};
    const ids = v => (Array.isArray(v) ? v : []).filter(x => typeof x === 'string' && /^[\w-]{1,40}$/.test(x));
    out.settings.homeLayout = { order: ids(hl.order), hidden: ids(hl.hidden), kpiHidden: ids(hl.kpiHidden),
      custom: (Array.isArray(hl.custom) ? hl.custom : []).filter(c => c && SAFE_ID.test(String(c.id || ''))).slice(0, 40).map(c => ({ id: c.id, title: str(c.title, 60), sub: str(c.sub, 120),
        kind: ['section', 'link', 'note'].includes(c.kind) ? c.kind : 'note', target: /^[a-z]{2,20}$/.test(c.target || '') ? c.target : '',
        url: /^https?:\/\/[^\s"'<>]{1,500}$/i.test(c.url || '') ? c.url : '', icon: /^[a-z]{2,20}$/.test(c.icon || '') ? c.icon : 'sparkles' })) };
    LISTS.forEach(k => {
      if (!Array.isArray(out[k])) out[k] = [];
      if (k === 'votes') { out.votes = out.votes.filter(v => typeof v === 'string'); return; }
      out[k] = out[k].filter(x => x && typeof x === 'object').map(x => {
        if (!SAFE_ID.test(String(x.id || ''))) x.id = uid();
        (NUMERIC[k] || []).forEach(f => { const n = Number(x[f]); x[f] = Number.isFinite(n) ? n : 0; });
        (OPTIONAL_NUMERIC[k] || []).forEach(f => { if (x[f] === '' || x[f] == null) { x[f] = null; return; } const n = Number(x[f]); x[f] = Number.isFinite(n) ? n : null; });
        return x;
      });
    });
    out.tasks.forEach(x => { x.done = !!x.done; });
    out.team.forEach(m => { m.group = String(m.group || ''); });
    out.users = out.users.filter(u => typeof u.username === 'string' && /^[0-9a-f]{64}$/.test(String(u.hash || '')) && /^[0-9a-f]{8,64}$/.test(String(u.salt || '')))
      .map(u => ({ id: u.id, username: u.username.slice(0, 40), personId: SAFE_ID.test(String(u.personId || '')) ? u.personId : '', role: u.role === 'admin' ? 'admin' : 'member', salt: u.salt, hash: u.hash, createdAt: String(u.createdAt || '') }));
    out.requests = out.requests.filter(r => Array.isArray(r.ops) && ['pending', 'approved', 'rejected'].includes(r.status))
      .map(r => Object.assign(r, { summary: (Array.isArray(r.summary) ? r.summary : []).map(x => String(x).slice(0, 400)).slice(0, 40), userId: String(r.userId || '') })).slice(-500);
    out.leaves = out.leaves.filter(l => SAFE_ID.test(String(l.personId || '')) && ISO_RE.test(l.from) && ISO_RE.test(l.to || l.from))
      .map(l => Object.assign(l, { to: l.to && l.to >= l.from ? l.to : l.from, type: LEAVE_TYPES.includes(l.type) ? l.type : 'other', notes: String(l.notes || '') }));
    const tr = (data && data.training && typeof data.training === 'object') ? data.training : {}; out.training = {};
    Object.keys(tr).forEach(cid => { if (!SAFE_ID.test(cid) || !tr[cid] || typeof tr[cid] !== 'object') return; out.training[cid] = {};
      Object.keys(tr[cid]).forEach(pid => { const v = String(tr[cid][pid] || ''); if (SAFE_ID.test(pid) && (v === '1' || ISO_RE.test(v))) out.training[cid][pid] = v; }); });
    out.vehicles.forEach(v => {
      delete v.photo; delete v.color; // vehicle pictures were removed
    });
    out.turnovers.forEach(tv => {
      tv.issues = (Array.isArray(tv.issues) ? tv.issues : []).filter(i => i && typeof i === 'object')
        .map(i => { if (!SAFE_ID.test(String(i.id || ''))) i.id = uid(); return { id: i.id, text: String(i.text || ''), open: !!i.open }; });
    });
    return out;
  }
  /* Sample lists that the user never touched are refreshed when the sample data changes. */
  const OLD_SAMPLE_PLATES = 'FL-002|KSA 1190|KSA 4821|KSA 4822|KSA 7731';
  function migrate(data) {
    const seed = Number(data.settings.seed) || 1;
    if (seed < 2) {
      const plates = data.vehicles.map(v => String(v.plate)).sort().join('|');
      if (plates === OLD_SAMPLE_PLATES) data.vehicles = sample().vehicles;
    }
    if (seed < 3) {
      data.team.forEach(m => { if (!m.group && SAMPLE_GROUPS[m.name]) m.group = SAMPLE_GROUPS[m.name]; });
      const sampleNames = data.team.filter(m => SAMPLE_GROUPS[m.name]).length;
      if (sampleNames >= 5 && !data.courses.length && !data.leaves.length) {
        data.courses = sampleCourses(); data.training = sampleTraining(data.team, data.courses); data.leaves = sampleLeaves(data.team);
      }
    }
    data.settings.seed = SEED;
    return data;
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) { const s = normalize(sampleFull()); s._fresh = true; return s; }
      return migrate(normalize(JSON.parse(raw)));
    } catch (e) { console.warn('OneClick: could not read saved data, starting with sample data.', e); return normalize(sampleFull()); }
  }
  /* raw write; OC._base is the last saved (approved) state that members' edits are compared with */
  function persist() {
    try { delete OC.db._fresh; localStorage.setItem(KEY, JSON.stringify(OC.db)); OC._base = JSON.parse(JSON.stringify(OC.db)); return true; }
    catch (e) { console.error('OneClick: save failed', e); if (OC.toast) OC.toast(OC.t('err.save'), 'err'); return false; }
  }
  function save() {
    if (OC.auth && OC.auth.mustRequest()) return OC.auth.capture();
    return persist();
  }

  OC.db = load();
  OC._base = JSON.parse(JSON.stringify(OC.db));
  OC.save = save;
  OC._persist = persist;
  OC.storageKey = KEY;
  OC.resetData = mode => { OC.db = normalize(mode === 'sample' ? sampleFull() : empty()); save(); };
  OC.exportJSON = () => JSON.stringify(Object.assign({ _app: 'OneClick', _version: 1, _exported: nowISO() }, OC.db), null, 2);
  OC.importJSON = text => {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !LISTS.some(k => Array.isArray(parsed[k]))) throw new Error('not a OneClick backup');
    const settings = Object.assign({}, OC.db.settings, parsed.settings || {});
    OC.db = normalize(parsed); OC.db.settings = settings; save();
  };
  /* full backup: localStorage data + the large inventory table from IndexedDB */
  OC.exportBackup = async () => {
    const out = Object.assign({ _app: 'OneClick', _version: 2, _exported: nowISO() }, OC.db);
    if (OC.inv) out.inventoryStore = await OC.inv.exportData();
    return JSON.stringify(out);
  };
  OC.importBackup = async text => {
    const parsed = JSON.parse(text);
    OC.importJSON(text);
    if (OC.inv) {
      const inv = parsed.inventoryStore;
      if (inv && Array.isArray(inv.columns) && Array.isArray(inv.rows)) {
        const n = inv.columns.length;
        const rows = inv.rows.filter(Array.isArray).map(r => r.slice(0, n).map(v => (typeof v === 'number' || typeof v === 'string') ? v : ''));
        await OC.inv.replaceAll(inv.columns.map(String), rows, inv.roles || {}, inv.info || {});
      } else if (Array.isArray(parsed.inventory) && parsed.inventory.length) await OC.inv.importLegacy(OC.db.inventory);
    }
  };
  OC.find = (list, id) => (OC.db[list] || []).find(x => x.id === id);
  OC.remove = (list, id) => { OC.db[list] = OC.db[list].filter(x => x.id !== id); };

  OC.LEAVE_TYPES = LEAVE_TYPES;
  OC.util = { pad, toISO, parseISO, today, addDays, daysBetween, uid, nowISO, isoWeek, weekStart, weeksInYear, shiftWeek };
})(window.OC);
