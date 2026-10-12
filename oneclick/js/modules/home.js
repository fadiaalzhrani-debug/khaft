/* OneClick · Home: KPI row + the eight launch tiles */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon;

  function stats() {
    const db = OC.db, today = OC.util.today(), cw = OC.util.isoWeek(new Date());
    const onShift = db.team.filter(m => m.status === 'on').length;
    const low = db.inventory.filter(i => i.qty <= i.min && i.qty > 0).length;
    const out = db.inventory.filter(i => i.qty <= 0).length;
    const todayEv = db.events.filter(e => e.date === today).sort((a, b) => a.time.localeCompare(b.time));
    const upcoming = db.events.filter(e => e.date > today && e.date <= OC.util.addDays(today, 7)).length;
    const printing = db.prints.filter(p => p.status === 'printing').length;
    const queued = db.prints.filter(p => p.status === 'queued').length;
    const vAvail = db.vehicles.filter(v => v.status === 'available').length;
    const vMaint = db.vehicles.filter(v => v.status === 'maintenance').length;
    const vDue = db.vehicles.filter(v => v.nextService && OC.util.daysBetween(today, v.nextService) <= 7).length;
    const wk = db.tasks.filter(x => x.year === cw.year && x.week === cw.week);
    const wkDone = wk.filter(x => x.done).length;
    const pct = wk.length ? Math.round(wkDone / wk.length * 100) : 0;
    const openIssues = db.turnovers.reduce((n, tv) => n + tv.issues.filter(i => i.open).length, 0);
    const lastTurn = db.turnovers.slice().sort((a, b) => (b.date + b.created).localeCompare(a.date + a.created))[0];
    const ideasNew = db.ideas.filter(i => i.status === 'new' || i.status === 'review').length;
    const ideasApproved = db.ideas.filter(i => i.status === 'approved').length;
    return { onShift, low, out, todayEv, upcoming, printing, queued, vAvail, vMaint, vDue, wk, wkDone, pct, openIssues, lastTurn, ideasNew, ideasApproved, cw };
  }

  function greeting() { const h = new Date().getHours(); return h < 12 ? t('home.morning') : h < 17 ? t('home.afternoon') : t('home.evening'); }

  OC.modules.home = {
    id: 'home', icon: 'home', order: 0,
    title: () => t('home.title'),
    render() {
      const s = stats(), db = OC.db;
      const tile = (id, icon, title, sub, stat, unit, badge, mini) => `
        <button class="tile" data-nav="${id}" aria-label="${esc(title)}">
          <div class="t-top"><span class="t-ico">${I(icon)}</span>${badge ? `<span class="t-badge ${badge.kind || ''}">${esc(badge.text)}</span>` : ''}</div>
          <div><div class="t-title">${esc(title)}</div><div class="t-sub">${esc(sub)}</div>
          <div class="t-stat"><b>${esc(stat)}</b><span>${esc(unit)}</span></div>${mini ? `<div class="t-mini">${mini}</div>` : ''}</div>
          <span class="t-arrow">${I('arrow')}</span></button>`;
      return `
      <div class="greet"><div><h2>${esc(greeting())}, ${esc(db.settings.teamName || t('home.team'))}</h2><p>${esc(t('home.sub', { date: OC.fmtDate(OC.util.today(), { weekday: 'long', day: 'numeric', month: 'long' }), week: s.cw.week }))}</p></div>
        <div class="row"><button class="btn" data-nav="settings">${I('settings')}${esc(t('settings.title'))}</button></div></div>
      <div class="kpis">
        <div class="card kpi"><span class="lbl">${I('users')}${esc(t('kpi.onShift'))}</span><span class="val">${s.onShift}<small>/ ${db.team.length}</small></span><span class="hint">${esc(t('kpi.onShiftHint'))}</span></div>
        <div class="card kpi"><span class="lbl">${I('box')}${esc(t('kpi.lowStock'))}</span><span class="val">${s.low + s.out}</span><span class="hint ${s.out ? 'crit' : s.low ? 'warn' : ''}">${esc(s.out ? t('kpi.outOfStock', { n: s.out }) : s.low ? t('kpi.belowMin') : t('kpi.stockOk'))}</span></div>
        <div class="card kpi"><span class="lbl">${I('calendar')}${esc(t('kpi.today'))}</span><span class="val">${s.todayEv.length}</span><span class="hint">${esc(s.todayEv[0] ? s.todayEv[0].time + ' · ' + s.todayEv[0].title : t('kpi.nothingToday'))}</span></div>
        <div class="card kpi"><span class="lbl">${I('swap')}${esc(t('kpi.openIssues'))}</span><span class="val">${s.openIssues}</span><span class="hint ${s.openIssues > 3 ? 'warn' : ''}">${esc(t('kpi.fromTurnovers'))}</span></div>
        <div class="card kpi"><span class="lbl">${I('gauge')}${esc(t('kpi.week', { n: s.cw.week }))}</span><span class="val">${s.pct}<small>%</small></span><span class="hint">${esc(t('kpi.tasksDone', { done: s.wkDone, total: s.wk.length }))}</span></div>
      </div>
      <div class="tiles">
        ${tile('team', 'users', t('team.title'), t('team.tag'), s.onShift, t('home.onShiftNow'), db.team.filter(m => m.status === 'leave').length ? { text: t('home.onLeave', { n: db.team.filter(m => m.status === 'leave').length }) } : null)}
        ${tile('inventory', 'box', t('inventory.title'), t('inventory.tag'), db.inventory.length, t('home.items'), (s.out ? { text: t('home.out', { n: s.out }), kind: 'crit' } : s.low ? { text: t('home.low', { n: s.low }), kind: 'warn' } : { text: t('home.allStocked') }))}
        ${tile('calendar', 'calendar', t('calendar.title'), t('calendar.tag'), s.todayEv.length, t('home.eventsToday'), s.upcoming ? { text: t('home.next7', { n: s.upcoming }) } : null)}
        ${tile('prints', 'cube', t('prints.title'), t('prints.tag'), s.queued, t('home.inQueue'), s.printing ? { text: t('home.printing', { n: s.printing }), kind: '' } : null)}
        ${tile('vehicles', 'truck', t('vehicles.title'), t('vehicles.tag'), `${s.vAvail}/${db.vehicles.length}`, t('home.available'), s.vMaint ? { text: t('home.inMaint', { n: s.vMaint }), kind: 'warn' } : s.vDue ? { text: t('home.serviceDue', { n: s.vDue }), kind: 'warn' } : null)}
        <button class="tile gauge-tile" data-nav="week" aria-label="${esc(t('week.title'))}">
          <div class="t-title">${esc(t('week.n', { n: s.cw.week }))}</div><div class="t-sub">${esc(t('week.completion'))}</div>
          ${OC.gauge(s.pct, { caption: t('kpi.tasksDone', { done: s.wkDone, total: s.wk.length }) })}
          <span class="t-arrow">${I('arrow')}</span></button>
        ${tile('turnover', 'swap', t('turnover.title'), t('turnover.tag'), s.openIssues, t('home.openIssues'), s.lastTurn ? { text: t('home.lastShift', { shift: t('turnover.' + s.lastTurn.shift) }) } : null)}
        ${tile('ideas', 'bulb', t('ideas.title'), t('ideas.tag'), db.ideas.length, t('home.ideas'), s.ideasApproved ? { text: t('home.approved', { n: s.ideasApproved }) } : s.ideasNew ? { text: t('home.toReview', { n: s.ideasNew }) } : null)}
      </div>`;
    },
    actions: {}
  };
})(window.OC);
