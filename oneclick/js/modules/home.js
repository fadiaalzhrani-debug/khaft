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
  const DEFAULT_ORDER = ['team', 'inventory', 'calendar', 'vehicles', 'week', 'training', 'turnover', 'ideas', 'prints']; // Training sits where 3D Prints used to be
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
      const hidden = id => OC.isHidden(id), today = U.today();
      const badgeHtml = b => b ? `<span class="t-badge ${b.kind || ''}">${esc(b.text)}</span>` : '';
      /* small visuals inside the tiles; every one carries a text label, color is never the only cue */
      const seg = parts => { const tot = parts.reduce((n, p) => n + p.n, 0); if (!tot) return ''; return `<div class="t-viz"><div class="t-seg" role="img" aria-label="${esc(parts.filter(p => p.n).map(p => p.label + ' ' + p.n).join(', '))}">${parts.filter(p => p.n).map(p => `<i class="${p.cls}" style="flex:${p.n}" title="${esc(p.label + ': ' + OC.fmtNum(p.n))}"></i>`).join('')}</div><div class="t-legend">${parts.filter(p => p.n).map(p => `<span><i class="${p.cls}"></i>${esc(p.label)} ${OC.fmtNum(p.n)}</span>`).join('')}</div></div>`; };
      const bar = (pct, label) => `<div class="t-viz"><div class="t-bar" role="img" aria-label="${esc(label)}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div></div>`;
      const stack = (names, max = 5) => names.length ? `<div class="t-viz t-avs">${names.slice(0, max).map(n => `<span title="${esc(n)}">${OC.avatar(n)}</span>`).join('')}${names.length > max ? `<span class="more">+${names.length - max}</span>` : ''}</div>` : '';
      const week7 = () => { const days = Array.from({ length: 7 }, (_, i) => U.addDays(today, i)), n = days.map(d => (OC.awayOn ? OC.awayOn(d) : []).length), mx = Math.max(1, ...n);
        return `<div class="t-viz"><div class="t-days" role="img" aria-label="${esc(t('home.next7'))}">${days.map((d, i) => `<span title="${esc(OC.fmtDate(d, { weekday: 'long', day: 'numeric', month: 'short' }) + ' · ' + n[i])}"><em><i style="height:${Math.round(n[i] / mx * 100)}%"></i></em><b>${esc(OC.fmtDate(d, { weekday: 'narrow' }))}</b></span>`).join('')}</div></div>`; };
      const inner = (icon, title, sub, stat, unit, badge, viz) => `<div class="t-top"><span class="t-ico">${I(icon)}</span>${badgeHtml(badge)}</div>
          <div><div class="t-title">${esc(title)}</div><div class="t-sub">${esc(sub)}</div>${stat !== null ? `<div class="t-stat"><b>${esc(stat)}</b><span>${esc(unit)}</span></div>` : ''}${viz || ''}</div>`;
      /* per-course completion for the wide Training tile */
      const courseBars = () => {
        const T = OC.modules.training, n = db.team.length; if (!T || !db.courses.length) return '';
        const rows = db.courses.map(c => ({ c, d: db.team.filter(m => ['done', 'soon'].includes(T.state(c, T.rec(c.id, m.id)))).length }));
        return `<div class="t-viz t-courses">${rows.slice(0, 4).map(r => `<div class="tc"><span title="${esc(r.c.name)}">${esc(r.c.name)}</span><b>${r.d}/${n}</b><div class="t-bar"><i style="width:${n ? Math.round(r.d / n * 100) : 0}%"></i></div></div>`).join('')}${rows.length > 4 ? `<div class="tc more">${esc(t('home.moreCourses', { n: rows.length - 4 }))}</div>` : ''}</div>`;
      };
      const openTasks = s.wk.filter(x => !x.done).slice(0, 3);
      const onNames = db.team.filter(m => m.status === 'on').map(m => m.name);
      const by = (list, key, vals, pre) => vals.map(v => ({ n: list.filter(x => x[key] === v).length, cls: 's-' + v, label: t(pre + v) }));
      const tiles = {
        team: { sec: 'team', tone: 'sky', html: inner('users', t('team.title'), t('team.tag'), s.onShift, t('home.onShiftNow'), s.away.length ? { text: t('home.awayN', { n: s.away.length }) } : null, stack(onNames)) },
        inventory: { sec: 'inventory', tone: 'amber', html: inner('box', t('inventory.title'), t('inventory.tag'), invReady ? OC.fmtNum(inv.count) : '…', t('home.items'), inv.out ? { text: t('home.out', { n: OC.fmtNum(inv.out) }), kind: 'crit' } : inv.low ? { text: t('home.low', { n: OC.fmtNum(inv.low) }), kind: 'warn' } : inv.count ? { text: t('home.allStocked') } : null,
          invReady ? seg([{ n: Math.max(0, inv.count - inv.low - inv.out), cls: 's-ok', label: t('home.v.ok') }, { n: inv.low, cls: 's-low', label: t('home.v.low') }, { n: inv.out, cls: 's-out', label: t('home.v.out') }]) : '') },
        calendar: { sec: 'calendar', tone: 'indigo', html: inner('calendar', t('calendar.title'), t('calendar.tag'), s.away.length, t('home.awayToday'), s.todayEv.length ? { text: t('home.eventsN', { n: s.todayEv.length }) } : s.leavesSoon ? { text: t('home.leavesSoon', { n: s.leavesSoon }) } : null, week7()) },
        training: { sec: 'training', tone: 'violet', wide: true, html: inner('grad', t('training.title'), t('training.tag'), s.tr.pct + '%', t('home.trained'), s.tr.expired ? { text: t('home.expiredN', { n: s.tr.expired }), kind: 'warn' } : db.courses.length ? { text: t('home.coursesN', { n: db.courses.length }) } : null, courseBars()) },
        week: { sec: 'week', hero: true, tone: 'accent', html: `<div class="wk-head"><span class="t-ico">${I('gauge')}</span><div><div class="t-title">${esc(t('week.n', { n: s.cw.week }))}</div><div class="t-sub">${esc(t('week.completion'))}</div></div></div>
          ${OC.gauge(s.pct, { big: true })}
          <div class="wk-stats"><span><b>${s.wkDone}</b>${esc(t('week.done'))}</span><span><b>${s.wk.length - s.wkDone}</b>${esc(t('week.open'))}</span><span><b>${s.wk.length}</b>${esc(t('home.total'))}</span></div>
          ${openTasks.length ? `<div class="hero-tasks">${openTasks.map(x => `<span><i class="pri ${esc(x.priority || 'med')}"></i>${esc(x.title)}<small>${esc(x.owner || '')}</small></span>`).join('')}</div>` : ''}` },
        vehicles: { sec: 'vehicles', tone: 'cyan', html: inner('truck', t('vehicles.title'), t('vehicles.tag'), `${s.vAvail}/${db.vehicles.length}`, t('home.available'), s.vMaint ? { text: t('home.inMaint', { n: s.vMaint }), kind: 'warn' } : s.vDue ? { text: t('home.attention', { n: s.vDue }), kind: 'warn' } : null, seg(by(db.vehicles, 'status', ['available', 'inuse', 'maintenance'], 'vehicles.s.'))) },
        prints: { sec: 'prints', tone: 'pink', html: inner('cube', t('prints.title'), t('prints.tag'), s.queued, t('home.inQueue'), s.printing ? { text: t('home.printing', { n: s.printing }) } : null, seg(by(db.prints, 'status', ['done', 'printing', 'queued', 'failed'], 'prints.s.'))) },
        turnover: { sec: 'turnover', tone: 'orange', html: inner('swap', t('turnover.title'), t('turnover.tag'), s.openIssues, t('home.openIssues'), s.lastTurn ? { text: t('home.lastShift', { shift: t('turnover.' + s.lastTurn.shift) }) } : null) },
        ideas: { sec: 'ideas', tone: 'yellow', html: inner('bulb', t('ideas.title'), t('ideas.tag'), db.ideas.length, t('home.ideas'), s.ideasApproved ? { text: t('home.approved', { n: s.ideasApproved }) } : s.ideasNew ? { text: t('home.toReview', { n: s.ideasNew }) } : null, seg(by(db.ideas, 'status', ['done', 'approved', 'review', 'new'], 'ideas.s.'))) }
      };
      L().custom.forEach(c => { tiles[c.id] = { custom: c, tone: 'accent', sec: c.kind === 'section' ? c.target : '', html: inner(c.icon, c.title, c.kind === 'note' ? '' : c.sub, null, '', { text: t('home.k.' + c.kind) }) + (c.kind === 'note' && c.sub ? `<p class="t-note">${esc(c.sub)}</p>` : '') }; });
      const rank = id => { const k = DEFAULT_ORDER.indexOf(id); return k < 0 ? 99 : k; };
      const ids = ordered(Object.keys(tiles).sort((a, b) => rank(a) - rank(b)).filter(id => !(tiles[id].sec && hidden(tiles[id].sec))));
      const tileHtml = (id, i) => {
        const d = tiles[id], off = L().hidden.includes(id), cls = `tile tone-${d.tone}${d.hero ? ' gauge-tile hero' : ''}${d.wide ? ' wide' : ''}${d.custom ? ' custom' : ''}`, sty = ` style="--i:${i}"`;
        if (edit) return `<div class="${cls} editing${off ? ' off' : ''}"${sty}>${d.html}<div class="tile-ctl"><button type="button" class="btn icon sm" data-act="mv" data-id="${id}" data-d="-1" aria-label="${esc(t('home.moveBack'))}">${I('left')}</button><button type="button" class="btn icon sm" data-act="vis" data-id="${id}" aria-label="${esc(off ? t('home.show') : t('home.hide'))}" title="${esc(off ? t('home.show') : t('home.hide'))}">${I(off ? 'eyeoff' : 'eye')}</button><button type="button" class="btn icon sm" data-act="mv" data-id="${id}" data-d="1" aria-label="${esc(t('home.moveFwd'))}">${I('right')}</button>${d.custom ? `<button type="button" class="btn icon sm" data-act="editTile" data-id="${id}" aria-label="${esc(t('edit'))}">${I('edit')}</button><button type="button" class="btn icon sm" data-act="delTile" data-id="${id}" aria-label="${esc(t('delete'))}">${I('trash')}</button>` : ''}</div></div>`;
        if (off) return '';
        if (d.custom && d.custom.kind === 'link') return `<a class="${cls}"${sty} href="${esc(d.custom.url)}" target="_blank" rel="noopener noreferrer">${d.html}<span class="t-arrow">${I('link')}</span></a>`;
        if (d.custom && d.custom.kind === 'note') return `<div class="${cls} note"${sty}>${d.html}</div>`;
        return `<button class="${cls}"${sty} data-nav="${esc(d.sec)}" aria-label="${esc(d.custom ? d.custom.title : (OC.modules[d.sec] || { title: () => '' }).title())}">${d.html}<span class="t-arrow">${I('arrow')}</span></button>`;
      };
      const pctOf = (a, b) => b ? Math.round(a / b * 100) : 0;
      const kpis = [
        { id: 'onShift', tone: 'sky', bar: pctOf(s.onShift, db.team.length), html: `<span class="lbl"><i class="k-ico">${I('users')}</i>${esc(t('kpi.onShift'))}</span><span class="val">${s.onShift}<small>/ ${db.team.length}</small></span><span class="hint">${esc(t('kpi.onShiftHint'))}</span>` },
        { id: 'stock', tone: 'amber', sec: 'inventory', bar: invReady && inv.count ? pctOf(inv.count - inv.low - inv.out, inv.count) : null, html: `<span class="lbl"><i class="k-ico">${I('box')}</i>${esc(t('kpi.lowStock'))}</span><span class="val">${invReady ? OC.fmtNum(inv.low + inv.out) : '…'}</span><span class="hint ${inv.out ? 'crit' : inv.low ? 'warn' : ''}">${esc(inv.out ? t('kpi.outOfStock', { n: OC.fmtNum(inv.out) }) : inv.low ? t('kpi.belowMin') : t('kpi.stockOk'))}</span>` },
        { id: 'away', tone: 'indigo', sec: 'calendar', html: `<span class="lbl"><i class="k-ico">${I('calendar')}</i>${esc(t('team.awayToday'))}</span><span class="val">${s.away.length}</span><span class="hint">${esc(s.away.length ? s.away.slice(0, 2).map(l => (OC.find('team', l.personId) || {}).name).join('، ') + (s.away.length > 2 ? '…' : '') : t('kpi.allIn'))}</span>` },
        { id: 'issues', tone: 'orange', sec: 'turnover', html: `<span class="lbl"><i class="k-ico">${I('swap')}</i>${esc(t('kpi.openIssues'))}</span><span class="val">${s.openIssues}</span><span class="hint ${s.openIssues > 3 ? 'warn' : ''}">${esc(t('kpi.fromTurnovers'))}</span>` },
        { id: 'week', tone: 'accent', sec: 'week', bar: s.pct, html: `<span class="lbl"><i class="k-ico">${I('gauge')}</i>${esc(t('kpi.week', { n: s.cw.week }))}</span><span class="val">${s.pct}<small>%</small></span><span class="hint">${esc(t('kpi.tasksDone', { done: s.wkDone, total: s.wk.length }))}</span>` }
      ].filter(k => !(k.sec && hidden(k.sec)));
      const pend = OC.auth.enabled() && OC.auth.isAdmin() ? OC.auth.pending().length : 0;
      const awayNames = s.away.map(l => (OC.find('team', l.personId) || {}).name).filter(Boolean);
      const evIcon = { safety: 'shield', meeting: 'users', maintenance: 'wrench', training: 'grad' };
      const todayBox = hidden('calendar') ? '' : `<div class="hh-today">
          <div class="hh-th"><span>${I('calendar')}${esc(t('home.today'))}</span><b>${esc(OC.fmtDate(today, { day: 'numeric', month: 'short' }))}</b></div>
          ${s.todayEv.length ? `<ul class="hh-ev">${s.todayEv.slice(0, 3).map(e => `<li><time>${esc(e.time || '—')}</time><span class="hh-dot">${I(evIcon[e.type] || 'clock')}</span><b>${esc(e.title)}</b></li>`).join('')}${s.todayEv.length > 3 ? `<li class="more">+${s.todayEv.length - 3}</li>` : ''}</ul>` : `<p class="hh-empty">${esc(t('home.noEvents'))}</p>`}
          <div class="hh-away"><small>${esc(t('home.awayLbl'))}</small>${awayNames.length ? `<div class="t-avs">${awayNames.slice(0, 6).map(n => `<span title="${esc(n)}">${OC.avatar(n)}</span>`).join('')}${awayNames.length > 6 ? `<span class="more">+${awayNames.length - 6}</span>` : ''}</div>` : `<span class="hh-in">${I('check')}${esc(t('kpi.allIn'))}</span>`}</div>
        </div>`;
      return `
      <section class="hh${todayBox ? '' : ' solo'}">
        <div class="hh-main">
          <span class="hh-eye">${I('sparkles')}${esc(OC.fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' }))} · ${esc(t('week.n', { n: s.cw.week }))}</span>
          <h2>${esc(greeting())}${OC.db.settings.lang === 'ar' ? '، ' : ', '}<span>${esc(db.settings.teamName || t('home.team'))}</span></h2>
          <p>${esc(t('home.tagline'))}</p>
          <div class="row">${pend ? `<button class="btn primary" data-nav="me">${I('shieldcheck')}${esc(t('home.pendingN', { n: pend }))}</button>` : ''}${canCustomize() ? `<button class="btn${edit ? ' primary' : ''}" data-act="customize">${I(edit ? 'check' : 'layers')}${esc(edit ? t('home.done') : t('home.customize'))}</button>${edit ? '' : `<button class="btn" data-nav="settings">${I('upload')}${esc(t('home.importBtn'))}</button>`}` : ''}</div>
        </div>
        ${todayBox}
      </section>
      ${edit ? `<div class="card pad edit-bar"><span>${I('info')} ${esc(t('home.editHint'))}</span><div class="row"><button class="btn sm" data-act="addTile">${I('plus')}${esc(t('home.addTile'))}</button><button class="btn sm ghost" data-act="resetHome">${I('refresh')}${esc(t('home.reset'))}</button></div></div>` : ''}
      <div class="kpis">${kpis.map((k, i) => { const off = L().kpiHidden.includes(k.id); if (off && !edit) return ''; const tag = k.sec && !edit ? 'button' : 'div'; return `<${tag} class="card kpi tone-${k.tone}${edit ? ' editing' : ''}${off ? ' off' : ''}" style="--i:${i}"${tag === 'button' ? ` data-nav="${k.sec}"` : ''}>${k.html}${k.bar != null ? `<span class="k-bar"><i style="width:${k.bar}%"></i></span>` : ''}${edit ? `<button type="button" class="btn icon sm kpi-eye" data-act="kpiVis" data-id="${k.id}" aria-label="${esc(off ? t('home.show') : t('home.hide'))}">${I(off ? 'eyeoff' : 'eye')}</button>` : ''}</${tag}>`; }).join('')}</div>
      <div class="tiles bento">${ids.map(tileHtml).join('')}</div>`;
    },
    actions: {
      customize: () => { st.edit = !st.edit; OC.refresh(); },
      vis: d => { toggle(L().hidden, d.id); OC.save(); OC.refresh(); },
      kpiVis: d => { toggle(L().kpiHidden, d.id); OC.save(); OC.refresh(); },
      mv: (d, el) => { const all = [...document.querySelectorAll('.tiles [data-act="vis"]')].map(b => b.dataset.id); move(d.id, Number(d.d) * (document.documentElement.dir === 'rtl' ? -1 : 1), all); }, // arrows point the way the grid flows
      addTile: () => customForm(), editTile: d => customForm(d.id),
      async delTile(d) { if (!(await OC.confirm({ title: t('home.delTile'), message: t('home.delTileMsg') }))) return; L().custom = L().custom.filter(c => c.id !== d.id); L().order = L().order.filter(x => x !== d.id); OC.save(); OC.refresh(); },
      async resetHome() { if (!(await OC.confirm({ title: t('home.reset'), message: t('home.resetMsg'), okLabel: t('home.reset') }))) return; const c = L().custom; OC.db.settings.homeLayout = { order: [], hidden: [], kpiHidden: [], custom: c }; OC.save(); OC.refresh(); }
    }
  };
})(window.OC);
