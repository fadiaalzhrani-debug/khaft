/* OneClick · users, PIN login, roles and approvals
   - Users sign in with a username + PIN on this device. The admin approves members' changes.
   - A member's edit is never applied directly: OC.save() hands the difference between the last
     approved data and the edited data to capture(), which files it as a request and restores the
     approved data. Inventory edits (IndexedDB) are wrapped the same way.
   - This is a convenience lock for a shared screen, not real security: everything runs in the
     browser, so a technical user with the device can read the data. */
window.OC = window.OC || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon;
  const U = OC.util;
  const SESSION_KEY = 'oneclick.session', LOCKOUT_KEY = 'oneclick.lockout';
  const PREFS = ['lang', 'theme', 'invCols'];
  const DATA_LISTS = ['team', 'events', 'prints', 'vehicles', 'tasks', 'turnovers', 'ideas', 'courses', 'leaves'];
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ---------- SHA-256 (sync, UTF-8) ---------- */
  function sha256(str) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const bytes = new TextEncoder().encode(str), l = bytes.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n);
    m.set(bytes); m[l] = 0x80; const bits = l * 8; for (let i = 0; i < 8; i++) m[n - 1 - i] = (bits / Math.pow(2, 8 * i)) & 0xff;
    let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const w = new Uint32Array(64), r = (x, s) => (x >>> s) | (x << (32 - s));
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = (m[o + i * 4] << 24) | (m[o + i * 4 + 1] << 16) | (m[o + i * 4 + 2] << 8) | m[o + i * 4 + 3];
      for (let i = 16; i < 64; i++) { const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) { const S1 = r(e, 6) ^ r(e, 11) ^ r(e, 25), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K[i] + w[i]) | 0, S0 = r(a, 2) ^ r(a, 13) ^ r(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0; hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0; }
      h = [h[0] + a, h[1] + b, h[2] + c, h[3] + d, h[4] + e, h[5] + f, h[6] + g, h[7] + hh].map(x => x | 0);
    }
    return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  const randHex = n => { const a = new Uint8Array(n); (window.crypto || window.msCrypto).getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); };
  function hashPin(pin, salt) { let x = salt + ':' + pin; for (let i = 0; i < 1500; i++) x = sha256(x + salt); return x; }
  const validPin = p => /^\d{4,8}$/.test(String(p || ''));

  /* ---------- state ---------- */
  let session = null;
  try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { session = null; }
  const cfg = () => OC.db.settings.auth;
  const users = () => OC.db.users;
  const current = () => (session && users().find(u => u.id === session.userId)) || null;
  const enabled = () => !!(cfg().enabled && users().some(u => u.role === 'admin'));
  const isAdmin = () => !enabled() || !!(current() && current().role === 'admin');
  const isMember = () => enabled() && !!current() && current().role !== 'admin';
  const locked = () => enabled() && !current();
  const mustRequest = () => isMember() && cfg().approval !== false;
  const personOf = u => (u && u.personId && OC.find('team', u.personId)) || null;
  const displayName = u => u ? ((personOf(u) || {}).name || u.username) : '';
  const setSession = u => { session = u ? { userId: u.id, at: Date.now() } : null; try { if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); else sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } };

  /* ---------- diff / patch ---------- */
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function diff(a, b) {
    const ops = [];
    DATA_LISTS.forEach(k => {
      const A = new Map((a[k] || []).map(x => [x.id, x])), B = new Map((b[k] || []).map(x => [x.id, x]));
      B.forEach((x, id) => { if (!A.has(id)) ops.push({ t: 'add', k, item: clone(x) }); });
      A.forEach((x, id) => { if (!B.has(id)) ops.push({ t: 'del', k, id, item: clone(x) }); });
      B.forEach((x, id) => {
        const y = A.get(id); if (!y || same(x, y)) return;
        const set = {}, prev = {};
        new Set(Object.keys(x).concat(Object.keys(y))).forEach(f => { if (!same(x[f], y[f])) { set[f] = x[f] === undefined ? null : clone(x[f]); prev[f] = y[f] === undefined ? null : clone(y[f]); } });
        ops.push({ t: 'mod', k, id, set, prev, title: titleOf(k, x) });
      });
    });
    const ta = a.training || {}, tb = b.training || {};
    new Set(Object.keys(ta).concat(Object.keys(tb))).forEach(cid => {
      const pa = ta[cid] || {}, pb = tb[cid] || {};
      new Set(Object.keys(pa).concat(Object.keys(pb))).forEach(pid => { if ((pa[pid] || '') !== (pb[pid] || '')) ops.push({ t: 'tr', cid, pid, v: pb[pid] || '', prev: pa[pid] || '' }); });
    });
    const va = new Set(a.votes || []), vb = new Set(b.votes || []);
    const vAdd = [...vb].filter(x => !va.has(x)), vDel = [...va].filter(x => !vb.has(x));
    if (vAdd.length || vDel.length) ops.push({ t: 'votes', add: vAdd, del: vDel });
    return ops;
  }
  function apply(db, ops) {
    let skipped = 0;
    ops.forEach(op => {
      if (op.t === 'add') { if (!db[op.k].some(x => x.id === op.item.id)) db[op.k].push(clone(op.item)); else skipped++; }
      else if (op.t === 'del') db[op.k] = db[op.k].filter(x => x.id !== op.id);
      else if (op.t === 'mod') { const x = db[op.k].find(y => y.id === op.id); if (x) Object.keys(op.set).forEach(f => { if (op.set[f] === null) delete x[f]; else x[f] = clone(op.set[f]); }); else skipped++; }
      else if (op.t === 'tr') { db.training[op.cid] = db.training[op.cid] || {}; if (op.v) db.training[op.cid][op.pid] = op.v; else delete db.training[op.cid][op.pid]; }
      else if (op.t === 'votes') { const s = new Set(db.votes); op.add.forEach(x => s.add(x)); op.del.forEach(x => s.delete(x)); db.votes = [...s]; }
    });
    return skipped;
  }

  /* ---------- human-readable summaries ---------- */
  const SECTION = { team: 'team.title', events: 'calendar.title', prints: 'prints.title', vehicles: 'vehicles.title', tasks: 'week.title', turnovers: 'turnover.title', ideas: 'ideas.title', courses: 'training.title', leaves: 'cal.leaves', training: 'training.title', inventory: 'inventory.title', votes: 'ideas.title' };
  const ENUM = { 'team.status': 'team.s.', 'vehicles.status': 'vehicles.s.', 'vehicles.type': 'vehicles.t.', 'prints.status': 'prints.s.', 'prints.priority': 'pri.', 'tasks.priority': 'pri.', 'ideas.status': 'ideas.s.', 'leaves.type': 'cal.lt.', 'turnovers.shift': 'turnover.' };
  const FIELD = { name: 'team.f.name', badge: 'team.f.badge', role: 'team.f.role', group: 'team.f.group', shift: 'team.f.shift', status: 'status', phone: 'team.f.phone', title: 'calendar.f.title', date: 'calendar.f.date', time: 'calendar.f.time', type: 'cal.f.type', notes: 'notes', item: 'prints.f.item', qty: 'inventory.f.qty', due: 'prints.f.due', priority: 'priority', progress: 'prints.progress', plate: 'vehicles.f.plate', assignedTo: 'vehicles.f.assigned', mileage: 'vehicles.f.mileage', nextService: 'vehicles.f.nextService', owner: 'week.f.owner', done: 'week.done', week: 'week.f.week', from: 'cal.f.from', to: 'cal.f.to', personId: 'cal.f.person', summary: 'turnover.f.summary', issues: 'turnover.f.issues', votes: 'ideas.votes', desc: 'ideas.f.desc', validity: 'training.f.validity' };
  const short = v => { if (v === true) return '✓'; if (v === false || v == null || v === '') return '—'; if (Array.isArray(v)) return v.length + ' ' + '×'; const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return s.length > 40 ? s.slice(0, 39) + '…' : s; };
  const pname = id => ((OC.find('team', id) || {}).name) || '?';
  function titleOf(k, x) {
    if (!x) return '';
    if (k === 'leaves') return `${pname(x.personId)} · ${t('cal.lt.' + x.type)} · ${x.from} → ${x.to}`;
    if (k === 'turnovers') return `${x.date} · ${t('turnover.' + x.shift)}`;
    if (k === 'vehicles') return `${x.name} (${x.plate})`;
    return x.name || x.title || x.item || x.id;
  }
  function fieldText(k, f, v) { const e = ENUM[k + '.' + f]; if (e && typeof v === 'string' && v) return t(e + v); if (f === 'personId') return pname(v); return short(v); }
  function summarize(op) {
    const sec = t(SECTION[op.k || (op.t === 'tr' ? 'training' : 'votes')] || 'home.title');
    if (op.t === 'add') return `${sec}: ${t('auth.op.add')} «${titleOf(op.k, op.item)}»`;
    if (op.t === 'del') return `${sec}: ${t('auth.op.del')} «${titleOf(op.k, op.item)}»`;
    if (op.t === 'mod') return `${sec}: «${op.title}» · ` + Object.keys(op.set).slice(0, 3).map(f => `${FIELD[f] ? t(FIELD[f]) : f}: ${fieldText(op.k, f, op.prev[f])} → ${fieldText(op.k, f, op.set[f])}`).join('، ') + (Object.keys(op.set).length > 3 ? '…' : '');
    if (op.t === 'tr') { const c = OC.find('courses', op.cid); return `${sec}: ${pname(op.pid)} · ${c ? c.name : '?'} · ${op.v ? '✓ ' + (op.v === '1' ? '' : op.v) : '✗'}`; }
    if (op.t === 'votes') return `${sec}: ${t('ideas.votes')}`;
    if (op.t === 'inv') return `${t('inventory.title')}: ${op.summary}`;
    return '';
  }

  /* ---------- capture a member's change as a request ---------- */
  let okMuteUntil = 0;
  function newRequest(ops, kind) {
    const u = current();
    return { id: U.uid(), userId: u ? u.id : '', at: U.nowISO(), kind, ops, summary: ops.map(summarize).filter(Boolean).slice(0, 40), status: 'pending' };
  }
  function announce() { okMuteUntil = Date.now() + 600; setTimeout(() => OC.toast(t('auth.sent'), 'info', 3500), 30); if (OC.renderNavCounts) OC.renderNavCounts(); }
  function capture() {
    const base = OC._base, cur = OC.db, ops = diff(base, cur), next = clone(base);
    PREFS.forEach(k => { if (k in cur.settings) next.settings[k] = cur.settings[k]; });
    next.requests = cur.requests; next.users = cur.users;
    const votesOnly = ops.length && ops.every(o => o.t === 'votes' || (o.t === 'mod' && o.k === 'ideas' && Object.keys(o.set).every(f => f === 'votes')));
    if (votesOnly) apply(next, ops);
    else if (ops.length) { next.requests.push(newRequest(ops, 'data')); announce(); }
    OC.db = next;
    return OC._persist();
  }
  const suppressOk = () => Date.now() < okMuteUntil;

  /* inventory rows live in IndexedDB; a member's change becomes a request too */
  const invOrig = {};
  function wrapInventory() {
    ['setRow', 'addRow', 'removeRow'].forEach(fn => { invOrig[fn] = OC.inv[fn]; });
    const codeOf = row => { const c = OC.inv.role('code'); return c >= 0 && row ? String(row[c]) : ''; };
    const label = row => { const n = OC.inv.role('name'), c = OC.inv.role('code'); return row ? String((n >= 0 && row[n]) || (c >= 0 && row[c]) || '') : ''; };
    const req = (op) => { OC.db.requests.push(newRequest([op], 'inventory')); OC._persist(); announce(); };
    OC.inv.setRow = (i, row) => {
      if (!mustRequest()) return invOrig.setRow(i, row);
      const before = OC.inv.st.rows[i] || [], ch = OC.inv.st.columns.map((c, k) => (String(before[k]) !== String(row[k]) ? `${c}: ${short(before[k])} → ${short(row[k])}` : '')).filter(Boolean).slice(0, 3).join('، ');
      req({ t: 'inv', op: 'set', i, code: codeOf(before), row, summary: `«${label(before)}» · ${ch}` });
    };
    OC.inv.addRow = row => { if (!mustRequest()) return invOrig.addRow(row); req({ t: 'inv', op: 'add', row, summary: `${t('auth.op.add')} «${label(row)}»` }); return -1; };
    OC.inv.removeRow = i => { if (!mustRequest()) return invOrig.removeRow(i); const before = OC.inv.st.rows[i]; req({ t: 'inv', op: 'remove', i, code: codeOf(before), summary: `${t('auth.op.del')} «${label(before)}»` }); };
  }
  async function applyInventory(op) {
    await OC.inv.loadRows();
    const rows = OC.inv.st.rows, c = OC.inv.role('code');
    const find = () => { if (rows[op.i] && (!op.code || String(rows[op.i][c]) === op.code)) return op.i; if (op.code && c >= 0) return rows.findIndex(r => r && String(r[c]) === op.code); return -1; };
    if (op.op === 'add') { invOrig.addRow(op.row); return true; }
    const i = find(); if (i < 0) return false;
    if (op.op === 'set') invOrig.setRow(i, op.row); else invOrig.removeRow(i);
    return true;
  }

  /* ---------- approvals ---------- */
  const pending = () => OC.db.requests.filter(r => r.status === 'pending');
  async function decide(id, ok) {
    const r = OC.db.requests.find(x => x.id === id); if (!r || r.status !== 'pending') return;
    let skipped = 0;
    if (ok) {
      const data = r.ops.filter(o => o.t !== 'inv'), inv = r.ops.filter(o => o.t === 'inv');
      skipped = apply(OC.db, data);
      for (const op of inv) if (!(await applyInventory(op))) skipped++;
    }
    r.status = ok ? 'approved' : 'rejected'; r.decidedAt = U.nowISO(); r.decidedBy = (current() || {}).id || '';
    const done = OC.db.requests.filter(x => x.status !== 'pending');
    if (done.length > 300) { const drop = new Set(done.slice(0, done.length - 300).map(x => x.id)); OC.db.requests = OC.db.requests.filter(x => !drop.has(x.id)); }
    OC.save();
    return skipped;
  }
  /* what is waiting, for pending marks in the UI */
  function pendingTraining() { const m = {}; pending().forEach(r => r.ops.forEach(o => { if (o.t === 'tr') { (m[o.cid] = m[o.cid] || {})[o.pid] = o.v; } })); return m; }
  function pendingLeaves() { const out = []; pending().forEach(r => r.ops.forEach(o => { if (o.k === 'leaves' && o.t === 'add') out.push(Object.assign({ _pending: true }, o.item)); })); return out; }

  /* ---------- users ---------- */
  function makeUser({ username, personId, role, pin }) {
    const salt = randHex(16);
    return { id: U.uid(), username: String(username).trim().slice(0, 40), personId: personId || '', role: role === 'admin' ? 'admin' : 'member', salt, hash: hashPin(pin, salt), createdAt: U.nowISO() };
  }
  const usernameTaken = (name, except) => users().some(u => u.id !== except && OC.cells.norm(u.username) === OC.cells.norm(name));
  function setRecovery() { const code = randHex(4).toUpperCase().replace(/(.{4})(.{4})/, '$1-$2'); const salt = randHex(8); cfg().recovery = { salt, hash: hashPin(code, salt) }; return code; }
  function checkRecovery(code) { const r = cfg().recovery; return !!(r && hashPin(String(code).trim().toUpperCase(), r.salt) === r.hash); }

  /* ---------- lock screen ---------- */
  const lockout = () => { try { return JSON.parse(localStorage.getItem(LOCKOUT_KEY) || '{"n":0,"until":0}'); } catch (e) { return { n: 0, until: 0 }; } };
  const setLockout = v => { try { localStorage.setItem(LOCKOUT_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  let lockEl = null;
  function showLock() {
    if (lockEl) return;
    OC.closeModals();
    lockEl = document.createElement('div'); lockEl.className = 'lock-screen'; lockEl.setAttribute('role', 'dialog'); lockEl.setAttribute('aria-modal', 'true');
    document.body.appendChild(lockEl); document.body.classList.add('locked');
    let picked = null, pin = '', msg = '';
    const draw = () => {
      const lo = lockout(), wait = Math.max(0, Math.ceil((lo.until - Date.now()) / 1000));
      const list = users().slice().sort((a, b) => (a.role === 'admin' ? -1 : 0) - (b.role === 'admin' ? -1 : 0) || displayName(a).localeCompare(displayName(b)));
      lockEl.innerHTML = `<div class="lock-card">
        <div class="brand"><span class="mark">${I('sparkles')}</span><span><b>${esc(OC.db.settings.brand || 'OneClick')}</b><small>${esc(OC.db.settings.teamName || '')}</small></span></div>
        ${!picked ? `<h2>${esc(t('auth.whoAreYou'))}</h2><div class="lock-users">${list.map(u => `<button type="button" class="lock-user" data-u="${u.id}">${OC.avatar(displayName(u))}<span><b>${esc(displayName(u))}</b><small>${esc(u.role === 'admin' ? t('auth.role.admin') : '@' + u.username)}</small></span></button>`).join('')}</div>`
        : `<button type="button" class="btn ghost sm" data-back>${I('left')}${esc(t('auth.switchUser'))}</button>
          <div class="lock-who">${OC.avatar(displayName(picked))}<b>${esc(displayName(picked))}</b></div>
          <div class="pin-dots" aria-label="${esc(t('auth.pin'))}">${Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('')}</div>
          <div class="pin-msg" role="alert">${esc(wait ? t('auth.wait', { s: wait }) : msg)}</div>
          <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-d="${n}" ${wait ? 'disabled' : ''}>${n}</button>`).join('')}<button type="button" data-clear aria-label="${esc(t('auth.clear'))}" ${wait ? 'disabled' : ''}>${I('x')}</button><button type="button" data-d="0" ${wait ? 'disabled' : ''}>0</button><button type="button" class="go" data-go aria-label="${esc(t('auth.signIn'))}" ${wait ? 'disabled' : ''}>${I('arrow')}</button></div>
          ${picked.role === 'admin' ? `<button type="button" class="btn ghost sm" data-forgot>${esc(t('auth.forgot'))}</button>` : `<p class="muted small">${esc(t('auth.forgotMember'))}</p>`}`}
        <p class="muted small lock-note">${I('info')} ${esc(t('auth.note'))}</p></div>`;
      lockEl.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { picked = users().find(u => u.id === b.dataset.u); pin = ''; msg = ''; draw(); });
      const q = s => lockEl.querySelector(s);
      if (q('[data-back]')) q('[data-back]').onclick = () => { picked = null; draw(); };
      lockEl.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { if (pin.length < 8) { pin += b.dataset.d; msg = ''; draw(); } });
      if (q('[data-clear]')) q('[data-clear]').onclick = () => { pin = pin.slice(0, -1); draw(); };
      if (q('[data-go]')) q('[data-go]').onclick = submit;
      if (q('[data-forgot]')) q('[data-forgot]').onclick = forgot;
      if (wait) setTimeout(() => { if (lockEl) draw(); }, 1000);
    };
    const submit = () => {
      const lo = lockout(); if (lo.until > Date.now() || !picked) return;
      if (picked.hash === hashPin(pin, picked.salt)) { setLockout({ n: 0, until: 0 }); setSession(picked); hideLock(); OC.toast(t('auth.welcome', { name: displayName(picked) })); return; }
      const n = lo.n + 1; setLockout(n >= 5 ? { n: 0, until: Date.now() + 30000 } : { n, until: 0 });
      pin = ''; msg = t('auth.wrong'); draw();
      const dots = lockEl.querySelector('.pin-dots'); if (dots) { dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); }
    };
    const forgot = () => {
      const code = window.prompt(t('auth.recoveryPrompt'));
      if (code == null) return;
      if (!checkRecovery(code)) { msg = t('auth.recoveryWrong'); draw(); return; }
      const np = window.prompt(t('auth.newPinPrompt'));
      if (!validPin(np)) { msg = t('auth.pinRule'); draw(); return; }
      picked.salt = randHex(16); picked.hash = hashPin(np, picked.salt); OC._persist(); OC._base = clone(OC.db); msg = t('auth.pinReset'); pin = ''; draw();
    };
    /* listen on the document: redrawing the card would drop focus from any element inside it */
    onLockKey = e => { if (!lockEl || !picked || e.ctrlKey || e.metaKey || e.altKey) return; if (lockout().until > Date.now()) return;
      if (/^\d$/.test(e.key)) { e.preventDefault(); if (pin.length < 8) { pin += e.key; msg = ''; draw(); } } else if (e.key === 'Backspace') { e.preventDefault(); pin = pin.slice(0, -1); draw(); } else if (e.key === 'Enter') { e.preventDefault(); submit(); } };
    document.addEventListener('keydown', onLockKey);
    lockEl.tabIndex = -1; draw(); lockEl.focus();
  }
  let onLockKey = null;
  function hideLock() { if (onLockKey) { document.removeEventListener('keydown', onLockKey); onLockKey = null; } if (lockEl) { lockEl.remove(); lockEl = null; } document.body.classList.remove('locked'); if (OC.renderShell) OC.renderShell(); }
  function logout() { setSession(null); OC.closeModals(); if (enabled()) showLock(); if (OC.renderShell) OC.renderShell(); }

  /* auto-lock after inactivity */
  let last = Date.now();
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => window.addEventListener(ev, () => { last = Date.now(); }, { passive: true }));
  setInterval(() => { const m = Number(cfg().autoLock) || 0; if (m > 0 && enabled() && current() && Date.now() - last > m * 60000) logout(); }, 15000);

  OC.auth = { sha256, hashPin, validPin, makeUser, usernameTaken, setRecovery, checkRecovery, current, enabled, isAdmin, isMember, locked, mustRequest, capture, suppressOk, wrapInventory, pending, decide, pendingTraining, pendingLeaves, summarize, displayName, personOf, setSession, showLock, hideLock, logout, diff, apply };
})(window.OC);
