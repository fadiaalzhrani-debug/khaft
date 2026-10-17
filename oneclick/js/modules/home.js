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

  /* ---------- layout (customizable) ---------- */
  const st = { edit: false };
  const L = () => OC.db.settings.homeLayout;
  const canCustomize = () => !OC.auth.enabled() || OC.auth.isAdmin();
  const DEFAULT_ORDER = ['team', 'inventory', 'calendar', 'training', 'vehicles', 'week', 'turnover', 'ideas', 'prints']; // Training sits where 3D Prints used to be
  const ICONS = ['sparkles', 'link', 'note', 'box', 'users', 'calendar', 'truck', 'gauge', 'swap', 'bulb', 'grad', 'cube', 'chart', 'file', 'shield', 'clock', 'wrench', 'key', 'database', 'info'];
  function ordered(ids) {
    const ord = L().order.filter(id => ids.includes(id));
    return ord.concat(ids.filter(id => !ord.includes(id)));
  }
  function move(id, dir, ids) {
    const list = ordered(ids), i = list.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]]; L().order = list; OC.save(); OC.refresh();
  }
  function toggle(arr, id) { const k = arr.indexOf(id); if (k >= 0) arr.splice(k, 1); else arr.push(id); }
  function customForm(id) {
    const c = id ? L().custom.find(x => x.id === id) : null;
    const sections = Object.values(OC.modules).filter(m => !m.hideInNav && m.id !== 'home').sort((a, b) => a.order - b.order);
    OC.form({
      title: c ? t('home.editTile') : t('home.addTile'),
      fields: [
        { key: 'title', label: t('home.f.title'), required: true, full: true },
        { key: 'sub', label: t('home.f.sub'), type: 'textarea' },
        { key: 'kind', label: t('home.f.kind'), type: 'select', options: [{ value: 'section', label: t('home.k.section') }, { value: 'link', label: t('home.k.link') }, { value: 'note', label: t('home.k.note') }] },
        { key: 'target', label: t('home.f.target'), type: 'select', options: sections.map(m => ({ value: m.id, label: m.title() })) },
        { key: 'url', label: t('home.f.url'), placeholder: 'https://', full: true },
        { key: 'icon', label: t('home.f.icon'), type: 'select', options: ICONS.map(x => ({ value: x, label: x })) }
      ],
      values: c || { kind: 'section', icon: 'sparkles', target: sections[0] && sections[0].id },
      onSubmit(v) {
        if (v.kind === 'link' && !/^https?:\/\/[^\s"'<>]{1,500}$/i.test(v.url)) return t('home.badUrl');
        const data = { title: v.title.slice(0, 60), sub: v.sub.slice(0, 120), kind: v.kind, target: v.target, url: v.kind === 'link' ? v.url : '', icon: v.icon };
        if (c) Object.assign(c, data); else L().custom.push(Object.assign({ id: OC.util.uid() }, data));
        OC.save(); OC.refresh();
      }
    });
  }

  OC.modules.home = {
    id: 'home', icon: 'home', order: 0,
    title: () => t('home.title'),
    render() {
      const s = stats(), db = OC.db, inv = s.inv.stats, invReady = s.inv.metaLoaded, edit = st.edit && canCustomize();
      const hidden = id => OC.isHidden(id), today = U.today(), n = v => OC.fmtNum(v);
      const name = id => (OC.find('team', id) || {}).name;

      /* ---- summary strip: four headline numbers in one card ---- */
      const kpis = [
        { id: 'onShift', icon: 'users', label: t('kpi.onShift'), val: `${s.onShift}<small>/${db.team.length}</small>`, hint: t('kpi.onShiftHint') },
        { id: 'away', sec: 'calendar', icon: 'calendar', label: t('team.awayToday'), val: s.away.length, hint: s.away.length ? s.away.slice(0, 2).map(l => name(l.personId)).filter(Boolean).join('، ') + (s.away.length > 2 ? '…' : '') : t('kpi.allIn') },
        { id: 'stock', sec: 'inventory', icon: 'box', label: t('kpi.lowStock'), val: invReady ? n(inv.low + inv.out) : '…', hint: inv.out ? t('kpi.outOfStock', { n: n(inv.out) }) : inv.low ? t('kpi.belowMin') : t('kpi.stockOk') },
        { id: 'issues', sec: 'turnover', icon: 'swap', label: t('kpi.openIssues'), val: s.openIssues, hint: t('kpi.fromTurnovers') }
      ].filter(k => !(k.sec && hidden(k.sec)));
      const shownK = kpis.filter(k => edit || !L().kpiHidden.includes(k.id));
      const strip = shownK.length ? `<div class="card hs">${shownK.map(k => { const off = L().kpiHidden.includes(k.id);
        return `<div class="hs-item${off ? ' off' : ''}"><span class="hs-lbl">${I(k.icon)}${esc(k.label)}</span><b class="hs-val">${k.val}</b><span class="hs-hint">${esc(k.hint)}</span>${edit ? `<button type="button" class="btn icon sm hs-eye" data-act="kpiVis" data-id="${k.id}" aria-label="${esc(off ? t('home.show') : t('home.hide'))}">${I(off ? 'eyeoff' : 'eye')}</button>` : ''}</div>`; }).join('')}</div>` : '';

      /* ---- week: the one big number on the page ---- */
      const openTasks = s.wk.filter(x => !x.done).slice(0, 3);
      const weekCard = hidden('week') ? '' : `<div class="card hc hc-week">
          <div class="hc-head"><h3>${esc(t('week.n', { n: s.cw.week }))}</h3><button class="link" data-nav="week">${esc(t('home.viewAll'))}</button></div>
          ${OC.gauge(s.pct, { caption: t('kpi.tasksDone', { done: s.wkDone, total: s.wk.length }) })}
          ${openTasks.length ? `<ul class="hc-list">${openTasks.map(x => `<li><i class="pri ${esc(x.priority || 'med')}"></i><span>${esc(x.title)}</span><small>${esc(x.owner || '')}</small></li>`).join('')}</ul>` : `<p class="hc-empty">${I('check')}${esc(t('home.allDone'))}</p>`}
        </div>`;

      /* ---- today: events + who is away ---- */
      const awayNames = s.away.map(l => name(l.personId)).filter(Boolean);
      const todayCard = hidden('calendar') ? '' : `<div class="card hc">
          <div class="hc-head"><h3>${esc(t('home.today'))}</h3><button class="link" data-nav="calendar">${esc(t('home.viewAll'))}</button></div>
          ${s.todayEv.length ? `<ul class="hc-list hc-ev">${s.todayEv.slice(0, 4).map(e => `<li><time>${esc(e.time || '—')}</time><span>${esc(e.title)}</span></li>`).join('')}</ul>` : `<p class="hc-empty">${esc(t('home.noEvents'))}</p>`}
          <div class="hc-away"><span>${esc(t('home.awayLbl'))}</span>${awayNames.length ? `<div class="avs">${awayNames.slice(0, 5).map(x => `<span title="${esc(x)}">${OC.avatar(x)}</span>`).join('')}${awayNames.length > 5 ? `<span class="more">+${awayNames.length - 5}</span>` : ''}</div>` : `<b>${esc(t('kpi.allIn'))}</b>`}</div>
        </div>`;

      /* ---- needs attention: only what someone should act on ---- */
      const pend = OC.auth.enabled() && OC.auth.isAdmin() ? OC.auth.pending().length : 0;
      const att = [
        pend && { sec: 'me', kind: 'info', icon: 'shieldcheck', text: t('home.att.pending'), n: pend },
        !hidden('inventory') && invReady && inv.out && { sec: 'inventory', kind: 'crit', icon: 'alert', text: t('home.att.out'), n: n(inv.out) },
        !hidden('inventory') && invReady && inv.low && { sec: 'inventory', kind: 'warn', icon: 'box', text: t('home.att.low'), n: n(inv.low) },
        !hidden('vehicles') && s.vMaint && { sec: 'vehicles', kind: 'warn', icon: 'wrench', text: t('home.att.maint'), n: s.vMaint },
        !hidden('vehicles') && s.vDue && { sec: 'vehicles', kind: 'warn', icon: 'truck', text: t('home.att.due'), n: s.vDue },
        !hidden('training') && s.tr.expired && { sec: 'training', kind: 'warn', icon: 'grad', text: t('home.att.expired'), n: s.tr.expired },
        !hidden('turnover') && s.openIssues && { sec: 'turnover', kind: 'info', icon: 'swap', text: t('home.att.issues'), n: s.openIssues }
      ].filter(Boolean);
      const attCard = `<div class="card hc">
          <div class="hc-head"><h3>${esc(t('home.attention'))}</h3>${att.length ? `<span class="hc-count">${att.length}</span>` : ''}</div>
          ${att.length ? `<ul class="hc-att">${att.slice(0, 6).map(a => `<li><button type="button" data-nav="${a.sec}" class="${a.kind}">${I(a.icon)}<span>${esc(a.text)}</span><b>${esc(a.n)}</b>${I('arrow', 'go')}</button></li>`).join('')}</ul>` : `<p class="hc-empty ok">${I('check')}${esc(t('home.allGood'))}</p>`}
        </div>`;

      /* ---- sections: plain shortcuts, one color ---- */
      const meta = {
        team: `${s.onShift}/${db.team.length} ${t('home.onShiftNow')}`,
        inventory: invReady ? `${n(inv.count)} ${t('home.items')}` : '…',
        calendar: `${s.away.length} ${t('home.awayToday')}`,
        training: db.courses.length ? `${s.tr.pct}% ${t('home.trained')} · ${t('home.coursesN', { n: db.courses.length })}` : t('training.tag'),
        vehicles: `${s.vAvail}/${db.vehicles.length} ${t('home.available')}`,
        week: t('kpi.tasksDone', { done: s.wkDone, total: s.wk.length }),
        turnover: `${s.openIssues} ${t('home.openIssues')}`,
        ideas: `${db.ideas.length} ${t('home.ideas')}`,
        prints: `${s.queued} ${t('home.inQueue')}`
      };
      const tiles = {};
      DEFAULT_ORDER.forEach(id => { const m = OC.modules[id]; if (m) tiles[id] = { sec: id, icon: m.icon, title: m.title(), sub: meta[id] || '' }; });
      L().custom.forEach(c => { tiles[c.id] = { custom: c, sec: c.kind === 'section' ? c.target : '', icon: c.icon, title: c.title, sub: c.sub }; });
      const ids = ordered(Object.keys(tiles).filter(id => !(tiles[id].sec && hidden(tiles[id].sec))));
      const body = d => `<span class="sc-ico">${I(d.icon)}</span><span class="sc-txt"><b>${esc(d.title)}</b>${d.sub ? `<small>${esc(d.sub)}</small>` : ''}</span>`;
      const tileHtml = id => {
        const d = tiles[id], off = L().hidden.includes(id), cls = `sc${d.custom && d.custom.kind === 'note' ? ' note' : ''}`;
        if (edit) return `<div class="${cls} editing${off ? ' off' : ''}">${body(d)}<div class="sc-ctl"><button type="button" class="btn icon sm" data-act="mv" data-id="${id}" data-d="-1" aria-label="${esc(t('home.moveBack'))}">${I('left')}</button><button type="button" class="btn icon sm" data-act="vis" data-id="${id}" aria-label="${esc(off ? t('home.show') : t('home.hide'))}" title="${esc(off ? t('home.show') : t('home.hide'))}">${I(off ? 'eyeoff' : 'eye')}</button><button type="button" class="btn icon sm" data-act="mv" data-id="${id}" data-d="1" aria-label="${esc(t('home.moveFwd'))}">${I('right')}</button>${d.custom ? `<button type="button" class="btn icon sm" data-act="editTile" data-id="${id}" aria-label="${esc(t('edit'))}">${I('edit')}</button><button type="button" class="btn icon sm" data-act="delTile" data-id="${id}" aria-label="${esc(t('delete'))}">${I('trash')}</button>` : ''}</div></div>`;
        if (off) return '';
        if (d.custom && d.custom.kind === 'link') return `<a class="${cls}" href="${esc(d.custom.url)}" target="_blank" rel="noopener noreferrer">${body(d)}${I('link', 'go')}</a>`;
        if (d.custom && d.custom.kind === 'note') return `<div class="${cls}">${body(d)}</div>`;
        return `<button class="${cls}" data-nav="${esc(d.sec)}">${body(d)}${I('arrow', 'go')}</button>`;
      };

      return `
      <div class="hg"><div><p class="hg-date">${esc(OC.fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' }))}</p><h2>${esc(greeting())}${db.settings.lang === 'ar' ? '، ' : ', '}${esc(db.settings.teamName || t('home.team'))}</h2></div>
        ${canCustomize() ? `<div class="row"><button class="btn sm${edit ? ' primary' : ' ghost'}" data-act="customize">${I(edit ? 'check' : 'layers')}${esc(edit ? t('home.done') : t('home.customize'))}</button>${edit ? '' : `<button class="btn sm ghost" data-nav="settings">${I('upload')}${esc(t('home.importBtn'))}</button>`}</div>` : ''}</div>
      ${edit ? `<div class="card pad edit-bar"><span>${I('info')} ${esc(t('home.editHint'))}</span><div class="row"><button class="btn sm" data-act="addTile">${I('plus')}${esc(t('home.addTile'))}</button><button class="btn sm ghost" data-act="resetHome">${I('refresh')}${esc(t('home.reset'))}</button></div></div>` : ''}
      ${strip}
      <div class="hrow">${weekCard}${todayCard}${attCard}</div>
      <h3 class="h-sec">${esc(t('home.sections'))}</h3>
      <div class="scs">${ids.map(tileHtml).join('')}</div>`;
    },
    actions: {
      customize: () => { st.edit = !st.edit; OC.refresh(); },
      vis: d => { toggle(L().hidden, d.id); OC.save(); OC.refresh(); },
      kpiVis: d => { toggle(L().kpiHidden, d.id); OC.save(); OC.refresh(); },
      mv: (d, el) => { const all = [...document.querySelectorAll('.scs [data-act="vis"]')].map(b => b.dataset.id); move(d.id, Number(d.d) * (document.documentElement.dir === 'rtl' ? -1 : 1), all); }, // arrows point the way the grid flows
      addTile: () => customForm(), editTile: d => customForm(d.id),
      async delTile(d) { if (!(await OC.confirm({ title: t('home.delTile'), message: t('home.delTileMsg') }))) return; L().custom = L().custom.filter(c => c.id !== d.id); L().order = L().order.filter(x => x !== d.id); OC.save(); OC.refresh(); },
      async resetHome() { if (!(await OC.confirm({ title: t('home.reset'), message: t('home.resetMsg'), okLabel: t('home.reset') }))) return; const c = L().custom; OC.db.settings.homeLayout = { order: [], hidden: [], kpiHidden: [], custom: c }; OC.save(); OC.refresh(); }
    }
  };
})(window.OC);
