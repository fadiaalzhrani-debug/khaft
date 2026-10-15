/* OneClick · Home: KPI row + launch tiles (bento grid, the weekly completion gauge is the hero tile) */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon, U = OC.util;

  function stats() {
    const db = OC.db, today = U.today(), cw = U.isoWeek(new Date()), inv = OC.inv.st;
    const onShift = db.team.filter(m => m.status === 'on').length;
    const away = OC.awayOn ? OC.awayOn(today) : [];
    const todayEv = db.events.filter(e => e.date === today).sort((a, b) => a.time.localeCompare(b.time));
    const leavesSoon = db.leaves.filter(l => l.from > today && l.from <= U.addDays(today, 7)).length;
    const printing = db.prints.filter(p => p.status === 'printing').length;
    const queued = db.prints.filter(p => p.status === 'queued').length;
    const vAvail = db.vehicles.filter(v => v.status === 'available').length;
    const vMaint = db.vehicles.filter(v => v.status === 'maintenance').length;
    const vAlerts = OC.modules.vehicles && OC.modules.vehicles.alerts ? OC.modules.vehicles.alerts : () => [];
    const vDue = db.vehicles.filter(v => vAlerts(v).length).length;
    const wk = db.tasks.filter(x => x.year === cw.year && x.week === cw.week);
    const wkDone = wk.filter(x => x.done).length;
    const pct = wk.length ? Math.round(wkDone / wk.length * 100) : 0;
    const openIssues = db.turnovers.reduce((n, tv) => n + tv.issues.filter(i => i.open).length, 0);
    const lastTurn = db.turnovers.slice().sort((a, b) => (b.date + b.created).localeCompare(a.date + a.created))[0];
    const ideasNew = db.ideas.filter(i => i.status === 'new' || i.status === 'review').length;
    const ideasApproved = db.ideas.filter(i => i.status === 'approved').length;
    const tr = OC.modules.training ? OC.modules.training.totals() : { pct: 0, expired: 0 };
    return { onShift, away, todayEv, leavesSoon, printing, queued, vAvail, vMaint, vDue, wk, wkDone, pct, openIssues, lastTurn, ideasNew, ideasApproved, cw, inv, tr };
  }
  const greeting = () => { const h = new Date().getHours(); return h < 12 ? t('home.morning') : h < 17 ? t('home.afternoon') : t('home.evening'); };

  OC.modules.home = {
    id: 'home', icon: 'home', order: 0,
    title: () => t('home.title'),
    render() {
      const s = stats(), db = OC.db, inv = s.inv.stats, invReady = s.inv.metaLoaded;
      const tile = (id, icon, title, sub, stat, unit, badge) => `
        <button class="tile" data-nav="${id}" aria-label="${esc(title)}">
          <div class="t-top"><span class="t-ico">${I(icon)}</span>${badge ? `<span class="t-badge ${badge.kind || ''}">${esc(badge.text)}</span>` : ''}</div>
          <div><div class="t-title">${esc(title)}</div><div class="t-sub">${esc(sub)}</div>
          <div class="t-stat"><b>${esc(stat)}</b><span>${esc(unit)}</span></div></div>
          <span class="t-arrow">${I('arrow')}</span></button>`;
      const openTasks = s.wk.filter(x => !x.done).slice(0, 3);
      return `
      <div class="greet"><div><h2>${esc(greeting())}, ${esc(db.settings.teamName || t('home.team'))}</h2><p>${esc(t('home.sub', { date: OC.fmtDate(U.today(), { weekday: 'long', day: 'numeric', month: 'long' }), week: s.cw.week }))}</p></div>
        <div class="row"><button class="btn" data-nav="settings">${I('upload')}${esc(t('home.importBtn'))}</button></div></div>
      <div class="kpis">
        <div class="card kpi"><span class="lbl">${I('users')}${esc(t('kpi.onShift'))}</span><span class="val">${s.onShift}<small>/ ${db.team.length}</small></span><span class="hint">${esc(t('kpi.onShiftHint'))}</span></div>
        <div class="card kpi"><span class="lbl">${I('box')}${esc(t('kpi.lowStock'))}</span><span class="val">${invReady ? OC.fmtNum(inv.low + inv.out) : '…'}</span><span class="hint ${inv.out ? 'crit' : inv.low ? 'warn' : ''}">${esc(inv.out ? t('kpi.outOfStock', { n: OC.fmtNum(inv.out) }) : inv.low ? t('kpi.belowMin') : t('kpi.stockOk'))}</span></div>
        <div class="card kpi"><span class="lbl">${I('calendar')}${esc(t('team.awayToday'))}</span><span class="val">${s.away.length}</span><span class="hint">${esc(s.away.length ? s.away.slice(0, 2).map(l => (OC.find('team', l.personId) || {}).name).join('، ') + (s.away.length > 2 ? '…' : '') : t('kpi.allIn'))}</span></div>
        <div class="card kpi"><span class="lbl">${I('swap')}${esc(t('kpi.openIssues'))}</span><span class="val">${s.openIssues}</span><span class="hint ${s.openIssues > 3 ? 'warn' : ''}">${esc(t('kpi.fromTurnovers'))}</span></div>
        <div class="card kpi"><span class="lbl">${I('gauge')}${esc(t('kpi.week', { n: s.cw.week }))}</span><span class="val">${s.pct}<small>%</small></span><span class="hint">${esc(t('kpi.tasksDone', { done: s.wkDone, total: s.wk.length }))}</span></div>
      </div>
      <div class="tiles bento">
        ${tile('team', 'users', t('team.title'), t('team.tag'), s.onShift, t('home.onShiftNow'), s.away.length ? { text: t('home.awayN', { n: s.away.length }) } : null)}
        ${tile('inventory', 'box', t('inventory.title'), t('inventory.tag'), invReady ? OC.fmtNum(inv.count) : '…', t('home.items'), inv.out ? { text: t('home.out', { n: OC.fmtNum(inv.out) }), kind: 'crit' } : inv.low ? { text: t('home.low', { n: OC.fmtNum(inv.low) }), kind: 'warn' } : inv.count ? { text: t('home.allStocked') } : null)}
        ${tile('calendar', 'calendar', t('calendar.title'), t('calendar.tag'), s.away.length, t('home.awayToday'), s.todayEv.length ? { text: t('home.eventsN', { n: s.todayEv.length }) } : s.leavesSoon ? { text: t('home.leavesSoon', { n: s.leavesSoon }) } : null)}
        ${tile('training', 'grad', t('training.title'), t('training.tag'), s.tr.pct + '%', t('home.trained'), s.tr.expired ? { text: t('home.expiredN', { n: s.tr.expired }), kind: 'warn' } : db.courses.length ? { text: t('home.coursesN', { n: db.courses.length }) } : null)}
        <button class="tile gauge-tile hero" data-nav="week" aria-label="${esc(t('week.title'))}">
          <div class="t-title">${esc(t('week.n', { n: s.cw.week }))}</div><div class="t-sub">${esc(t('week.completion'))}</div>
          ${OC.gauge(s.pct, { big: true, caption: t('kpi.tasksDone', { done: s.wkDone, total: s.wk.length }) })}
          ${openTasks.length ? `<div class="hero-tasks">${openTasks.map(x => `<span><i class="pri ${esc(x.priority || 'med')}"></i>${esc(x.title)}<small>${esc(x.owner || '')}</small></span>`).join('')}</div>` : ''}
          <span class="t-arrow">${I('arrow')}</span></button>
        ${tile('vehicles', 'truck', t('vehicles.title'), t('vehicles.tag'), `${s.vAvail}/${db.vehicles.length}`, t('home.available'), s.vMaint ? { text: t('home.inMaint', { n: s.vMaint }), kind: 'warn' } : s.vDue ? { text: t('home.attention', { n: s.vDue }), kind: 'warn' } : null)}
        ${tile('prints', 'cube', t('prints.title'), t('prints.tag'), s.queued, t('home.inQueue'), s.printing ? { text: t('home.printing', { n: s.printing }) } : null)}
        ${tile('turnover', 'swap', t('turnover.title'), t('turnover.tag'), s.openIssues, t('home.openIssues'), s.lastTurn ? { text: t('home.lastShift', { shift: t('turnover.' + s.lastTurn.shift) }) } : null)}
        ${tile('ideas', 'bulb', t('ideas.title'), t('ideas.tag'), db.ideas.length, t('home.ideas'), s.ideasApproved ? { text: t('home.approved', { n: s.ideasApproved }) } : s.ideasNew ? { text: t('home.toReview', { n: s.ideasNew }) } : null)}
      </div>`;
    },
    actions: {}
  };
})(window.OC);
