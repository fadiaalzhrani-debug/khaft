/* OneClick · Week completion: ISO-week task list driving the gauge; carry-over of unfinished tasks */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon, U = OC.util;
  const cw = U.isoWeek(new Date());
  const st = { year: cw.year, week: cw.week, filter: 'all' };
  const inWeek = x => x.year === st.year && x.week === st.week;
  const rank = { high: 0, med: 1, low: 2 };

  function fields() {
    return [
      { key: 'title', label: t('week.f.title'), required: true, full: true },
      { key: 'owner', label: t('week.f.owner'), list: OC.db.team.map(m => m.name) },
      { key: 'priority', label: t('priority'), type: 'select', options: ['high', 'med', 'low'].map(p => ({ value: p, label: t('pri.' + p) })) },
      { key: 'week', label: t('week.f.week'), type: 'number', min: 1, max: 53, step: 1, required: true },
      { key: 'year', label: t('week.f.year'), type: 'number', min: 2020, max: 2100, step: 1, required: true }
    ];
  }
  function openForm(id) {
    const existing = id ? OC.find('tasks', id) : null;
    OC.form({
      title: existing ? t('week.edit') : t('week.addTask'), fields: fields(), values: existing || { priority: 'med', week: st.week, year: st.year },
      onSubmit(v) {
        if (v.week > U.weeksInYear(v.year)) return t('week.badWeek', { n: U.weeksInYear(v.year) });
        if (existing) Object.assign(existing, v); else OC.db.tasks.push(Object.assign({ id: U.uid(), done: false }, v));
        st.week = v.week; st.year = v.year; OC.save(); OC.toast(t('saved')); OC.refresh();
      }
    });
  }

  OC.modules.week = {
    id: 'week', icon: 'gauge', order: 6,
    title: () => t('week.title'), tagline: () => t('week.completion'),
    count: () => { const l = OC.db.tasks.filter(x => x.year === cw.year && x.week === cw.week); const n = l.filter(x => !x.done).length; return n || ''; },
    render() {
      const all = OC.db.tasks.filter(inWeek).sort((a, b) => (a.done - b.done) || (rank[a.priority] - rank[b.priority]) || a.title.localeCompare(b.title));
      const list = all.filter(x => st.filter === 'all' || (st.filter === 'open' ? !x.done : x.done));
      const done = all.filter(x => x.done).length, pct = all.length ? Math.round(done / all.length * 100) : 0;
      const start = U.weekStart(st.year, st.week), end = U.addDays(start, 6);
      const isCurrent = st.year === cw.year && st.week === cw.week;
      const isPast = start < U.weekStart(cw.year, cw.week);
      const byOwner = {}; all.forEach(x => { const o = x.owner || t('week.unassigned'); byOwner[o] = byOwner[o] || { total: 0, done: 0 }; byOwner[o].total++; if (x.done) byOwner[o].done++; });
      const owners = Object.entries(byOwner).sort((a, b) => b[1].total - a[1].total);
      const quick = `<form class="row" data-submit="quick" style="gap:8px;margin-top:14px"><input class="input" name="title" placeholder="${esc(t('week.quickPh'))}" aria-label="${esc(t('week.f.title'))}" required style="flex:1;min-width:180px"/><button class="btn primary" type="submit">${I('plus')}${esc(t('add'))}</button></form>`;
      return `
      <div class="page-head"><div><h2>${esc(t('week.title'))}</h2><p>${esc(t('week.desc'))}</p></div>
        <div class="actions"><button class="btn" data-act="import">${I('upload')}${esc(t('imp.button'))}</button>${all.some(x => !x.done) ? `<button class="btn" data-act="carry">${I('arrow')}${esc(t('week.carry'))}</button>` : ''}<button class="btn primary" data-act="add">${I('plus')}${esc(t('week.addTask'))}</button></div></div>
      <div class="split">
        <div class="stack">
          <div class="card pad">
            <div class="row between"><div class="row"><button class="btn icon sm" data-act="prev" aria-label="${esc(t('prev'))}">${I('left')}</button><h3 style="font-size:1.15rem">${esc(t('week.n', { n: st.week }))} · ${st.year}</h3><button class="btn icon sm" data-act="next" aria-label="${esc(t('next'))}">${I('right')}</button>${!isCurrent ? `<button class="btn sm" data-act="cur">${esc(t('week.thisWeek'))}</button>` : OC.pill('accent', t('week.current'), 'check')}</div>
              <span class="muted small">${esc(OC.fmtDate(start))} – ${esc(OC.fmtDate(end))}</span></div>
            ${quick}
          </div>
          <div class="toolbar" style="margin:0">${OC.seg('filter', [{ value: 'all', label: t('all') + ` (${all.length})` }, { value: 'open', label: t('week.open') + ` (${all.length - done})` }, { value: 'done', label: t('week.done') + ` (${done})` }], st.filter)}</div>
          ${list.length ? `<div class="stack" style="gap:8px">${list.map(x => `<div class="task${x.done ? ' done' : ''}"><input type="checkbox" data-change="toggle" data-id="${x.id}" ${x.done ? 'checked' : ''} aria-label="${esc(x.title)}"/><i class="pri ${esc(x.priority || 'med')}" title="${esc(t('pri.' + (x.priority || 'med')))}"></i>
            <div class="t">${esc(x.title)}<small>${esc(x.owner || t('week.unassigned'))}${isPast && !x.done ? ' · ' + esc(t('week.overdue')) : ''}</small></div>
            <div class="acts"><button class="btn ghost icon sm" data-act="edit" data-id="${x.id}" aria-label="${esc(t('edit'))}">${I('edit')}</button><button class="btn ghost icon sm" data-act="del" data-id="${x.id}" aria-label="${esc(t('delete'))}">${I('trash')}</button></div></div>`).join('')}</div>`
            : OC.empty('gauge', t('week.empty'), t('week.emptyHint'))}
        </div>
        <div class="stack">
          <div class="card pad" style="text-align:center">${OC.gauge(pct, { big: true, caption: t('kpi.tasksDone', { done, total: all.length }) })}
            <p class="muted small mt">${esc(pct === 100 && all.length ? t('week.allDone') : isPast ? t('week.pastNote') : t('week.gaugeNote'))}</p></div>
          <div class="card pad"><h3>${I('users')}${esc(t('week.byOwner'))}</h3><div class="stack mt" style="gap:10px">${owners.length ? owners.map(([o, s]) => `<div><div class="row between small"><b>${esc(o)}</b><span class="muted">${s.done}/${s.total}</span></div><div class="progress" style="margin-top:4px"><i style="width:${Math.round(s.done / s.total * 100)}%"></i></div></div>`).join('') : `<p class="muted small">${esc(t('week.noOwners'))}</p>`}</div></div>
        </div>
      </div>`;
    },
    actions: {
      add: () => openForm(), edit: d => openForm(d.id),
      prev: () => { const w = U.shiftWeek(st.year, st.week, -1); st.year = w.year; st.week = w.week; OC.refresh(); },
      next: () => { const w = U.shiftWeek(st.year, st.week, 1); st.year = w.year; st.week = w.week; OC.refresh(); },
      cur: () => { st.year = cw.year; st.week = cw.week; OC.refresh(); },
      filter: d => { st.filter = d.v; OC.refresh(); },
      toggle: (d, el) => { const x = OC.find('tasks', d.id); if (!x) return; x.done = el.checked; OC.save(); const all = OC.db.tasks.filter(inWeek); if (all.length && all.every(y => y.done)) OC.toast(t('week.allDone')); OC.refresh(); },
      quick: (d, form) => { const title = form.elements.title.value.trim(); if (!title) return; OC.db.tasks.push({ id: U.uid(), title, owner: '', priority: 'med', year: st.year, week: st.week, done: false }); OC.save(); OC.refresh(); },
      async carry() {
        const open = OC.db.tasks.filter(x => inWeek(x) && !x.done); if (!open.length) return;
        const nw = U.shiftWeek(st.year, st.week, 1);
        if (await OC.confirm({ title: t('week.carry'), message: t('week.carryMsg', { n: open.length, week: nw.week }), okLabel: t('week.carryOk'), danger: false })) {
          open.forEach(x => { x.year = nw.year; x.week = nw.week; }); OC.save(); st.year = nw.year; st.week = nw.week; OC.toast(t('week.carried', { n: open.length })); OC.refresh();
        }
      },
      async del(d) { const x = OC.find('tasks', d.id); if (!x) return; if (await OC.confirm({ title: t('week.delete'), message: t('week.deleteMsg', { title: x.title }) })) { OC.remove('tasks', d.id); OC.save(); OC.toast(t('deleted')); OC.refresh(); } }
    }
  };
})(window.OC);
