/* OneClick · My page: the signed-in user, change PIN, sign out; approvals inbox for the admin,
   request history for members */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon, A = () => OC.auth;
  const st = { history: false };
  const when = iso => { const d = new Date(iso); if (isNaN(d)) return ''; return OC.fmtDate(OC.util.toISO(d), { day: 'numeric', month: 'short' }) + ' · ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const userName = id => { const u = OC.db.users.find(x => x.id === id); return u ? A().displayName(u) : t('auth.unknownUser'); };
  const statusPill = s => OC.pill(s === 'approved' ? 'good' : s === 'rejected' ? 'crit' : 'warn', t('auth.s.' + s), s === 'approved' ? 'check' : s === 'rejected' ? 'x' : 'clock');

  function reqCard(r, admin) {
    return `<div class="rq card pad${r.status === 'pending' ? ' pending' : ''}">
      <div class="row between"><div class="who">${OC.avatar(userName(r.userId))}<div><b>${esc(userName(r.userId))}</b><small>${esc(when(r.at))}${r.kind === 'inventory' ? ' · ' + esc(t('inventory.title')) : ''}</small></div></div>${statusPill(r.status)}</div>
      <ul class="req-lines">${r.summary.map(line => `<li>${esc(line)}</li>`).join('') || `<li class="muted">${esc(t('auth.noDetails'))}</li>`}</ul>
      ${admin && r.status === 'pending' ? `<div class="row" style="justify-content:flex-end"><button class="btn danger sm" data-act="reject" data-id="${r.id}">${I('x')}${esc(t('auth.reject'))}</button><button class="btn primary sm" data-act="approve" data-id="${r.id}">${I('check')}${esc(t('auth.approve'))}</button></div>`
        : r.status !== 'pending' && r.decidedAt ? `<p class="muted small">${esc(t('auth.decidedOn', { date: when(r.decidedAt) }))}</p>` : ''}
    </div>`;
  }

  function changePin() {
    const u = A().current(); if (!u) return;
    OC.form({
      title: t('auth.changePin'),
      fields: [{ key: 'old', label: t('auth.currentPin'), type: 'password', required: true, full: true }, { key: 'pin', label: t('auth.newPin'), type: 'password', required: true }, { key: 'pin2', label: t('auth.confirmPin'), type: 'password', required: true }],
      onSubmit(v) {
        if (A().hashPin(v.old, u.salt) !== u.hash) return t('auth.wrong');
        if (!A().validPin(v.pin)) return t('auth.pinRule');
        if (v.pin !== v.pin2) return t('auth.pinMismatch');
        const fresh = A().makeUser({ username: u.username, pin: v.pin }); u.salt = fresh.salt; u.hash = fresh.hash;
        OC._persist(); OC.toast(t('auth.pinChanged'));
      }
    });
  }

  OC.modules.me = {
    id: 'me', icon: 'user', order: 98, hideInNav: true,
    title: () => t('me.title'), tagline: () => t('me.tag'),
    count: () => (A().enabled() && A().isAdmin() ? A().pending().length : 0) || '',
    render() {
      const head = `<div class="page-head"><div><h2>${esc(t('me.title'))}</h2><p>${esc(t('me.desc'))}</p></div></div>`;
      if (!A().enabled()) return head + `<div class="card pad empty">${I('lock')}<b>${esc(t('me.offTitle'))}</b><span>${esc(t('me.offHint'))}</span><button class="btn primary mt" data-nav="settings">${I('settings')}${esc(t('me.setup'))}</button></div>`;
      const u = A().current(), admin = A().isAdmin(), p = A().personOf(u);
      const mine = OC.db.requests.filter(r => r.userId === u.id).slice().reverse();
      const pend = A().pending().slice().reverse(), done = OC.db.requests.filter(r => r.status !== 'pending').slice(-30).reverse();
      return head + `
      <div class="card pad me-head"><div class="who">${OC.avatar(A().displayName(u))}<div><b>${esc(A().displayName(u))}</b><small>@${esc(u.username)} · ${esc(admin ? t('auth.role.admin') : t('auth.role.member'))}${p && p.group ? ' · ' + esc(p.group) : ''}</small></div></div>
        <div class="row"><button class="btn" data-act="pin">${I('key')}${esc(t('auth.changePin'))}</button><button class="btn" data-act="logout">${I('logout')}${esc(t('auth.signOut'))}</button></div></div>
      ${admin ? `
      <div class="row between mt"><h3 class="sec-h">${I('shieldcheck')}${esc(t('auth.inbox'))} <span class="pill ${pend.length ? 'warn' : 'good'}">${pend.length}</span></h3>
        ${pend.length > 1 ? `<button class="btn primary sm" data-act="approveAll">${I('check')}${esc(t('auth.approveAll', { n: pend.length }))}</button>` : ''}</div>
      <p class="muted small">${esc(OC.db.settings.auth.approval ? t('auth.inboxHint') : t('auth.approvalOff'))}</p>
      <div class="req-list mt">${pend.length ? pend.map(r => reqCard(r, true)).join('') : `<div class="card pad">${OC.pill('good', t('auth.nothingPending'), 'check')}</div>`}</div>
      <div class="row between mt"><h3 class="sec-h">${I('clock')}${esc(t('auth.history'))}</h3><button class="btn ghost sm" data-act="toggleHistory">${esc(st.history ? t('auth.hide') : t('auth.show'))}</button></div>
      ${st.history ? `<div class="req-list mt">${done.length ? done.map(r => reqCard(r, false)).join('') : `<p class="muted small">${esc(t('auth.noHistory'))}</p>`}</div>` : ''}`
      : `
      <h3 class="sec-h mt">${I('clock')}${esc(t('auth.myRequests'))}</h3>
      <p class="muted small">${esc(t('auth.memberHint'))}</p>
      <div class="req-list mt">${mine.length ? mine.slice(0, 60).map(r => reqCard(r, false)).join('') : `<p class="muted small">${esc(t('auth.noRequests'))}</p>`}</div>`}`;
    },
    actions: {
      pin: () => changePin(),
      logout: () => A().logout(),
      toggleHistory: () => { st.history = !st.history; OC.refresh(); },
      async approve(d) { const skipped = await A().decide(d.id, true); OC.toast(skipped ? t('auth.approvedSkipped', { n: skipped }) : t('auth.approved')); OC.refresh(); },
      async reject(d) { await A().decide(d.id, false); OC.toast(t('auth.rejected'), 'info'); OC.refresh(); },
      async approveAll() {
        const list = A().pending(); if (!(await OC.confirm({ title: t('auth.approveAllTitle'), message: t('auth.approveAllMsg', { n: list.length }), okLabel: t('auth.approve'), danger: false }))) return;
        for (const r of list.slice()) await A().decide(r.id, true);
        OC.toast(t('auth.approved')); OC.refresh();
      }
    }
  };
})(window.OC);
