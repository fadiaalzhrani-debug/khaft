/* OneClick · Calendar: month grid with typed events, day panel, upcoming list */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon, U = OC.util;
  const TYPES = ['meeting', 'maintenance', 'training', 'safety', 'other'];
  const now = new Date();
  const st = { y: now.getFullYear(), m: now.getMonth(), sel: U.today() };

  const byDate = () => { const map = {}; OC.db.events.forEach(e => (map[e.date] = map[e.date] || []).push(e)); Object.values(map).forEach(l => l.sort((a, b) => (a.time || '').localeCompare(b.time || ''))); return map; };
  function fields() {
    return [
      { key: 'title', label: t('calendar.f.title'), required: true, full: true },
      { key: 'date', label: t('calendar.f.date'), type: 'date', required: true },
      { key: 'time', label: t('calendar.f.time'), type: 'time' },
      { key: 'type', label: t('calendar.f.type'), type: 'select', options: TYPES.map(x => ({ value: x, label: t('calendar.t.' + x) })) },
      { key: 'notes', label: t('calendar.f.notes'), type: 'textarea' }
    ];
  }
  function openForm(id, date) {
    const existing = id ? OC.find('events', id) : null;
    OC.form({
      title: existing ? t('calendar.edit') : t('calendar.add'), fields: fields(), values: existing || { date: date || st.sel, time: '08:00', type: 'meeting' },
      onSubmit(v) {
        if (existing) Object.assign(existing, v); else OC.db.events.push(Object.assign({ id: U.uid() }, v));
        st.sel = v.date; const d = U.parseISO(v.date); st.y = d.getFullYear(); st.m = d.getMonth();
        OC.save(); OC.toast(t('saved')); OC.refresh();
      }
    });
  }
  const evRow = (e, showDate) => `<div class="ev"><div class="when">${esc(e.time || '—')}${showDate ? `<small>${esc(OC.fmtDateShort(e.date))}</small>` : ''}</div>
    <div style="min-width:0"><b>${esc(e.title)}</b><div class="row" style="gap:6px;margin-top:3px"><span class="chip ${esc(e.type)}">${esc(t('calendar.t.' + e.type))}</span>${e.notes ? `<p>${esc(e.notes)}</p>` : ''}</div></div>
    <div class="acts"><button class="btn ghost icon sm" data-act="edit" data-id="${e.id}" aria-label="${esc(t('edit'))}">${I('edit')}</button><button class="btn ghost icon sm" data-act="del" data-id="${e.id}" aria-label="${esc(t('delete'))}">${I('trash')}</button></div></div>`;

  OC.modules.calendar = {
    id: 'calendar', icon: 'calendar', order: 3,
    title: () => t('calendar.title'), tagline: () => t('calendar.tag'),
    count: () => { const n = OC.db.events.filter(e => e.date === U.today()).length; return n || ''; },
    render() {
      const map = byDate(), today = U.today();
      const firstDay = Number(OC.db.settings.firstDay || 0); // 0 Sunday, 1 Monday
      const first = new Date(st.y, st.m, 1); const lead = (first.getDay() - firstDay + 7) % 7;
      const start = new Date(st.y, st.m, 1 - lead);
      const cells = []; for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); cells.push(d); }
      if (cells[35].getMonth() !== st.m) cells.length = 35;
      const dows = []; for (let i = 0; i < 7; i++) { const d = new Date(2024, 0, 7 + ((firstDay + i) % 7)); dows.push(new Intl.DateTimeFormat(OC.db.settings.lang === 'ar' ? 'ar' : 'en', { weekday: 'short' }).format(d)); }
      const selList = map[st.sel] || [];
      const upcoming = OC.db.events.filter(e => e.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 8);
      return `
      <div class="page-head"><div><h2>${esc(t('calendar.title'))}</h2><p>${esc(t('calendar.desc'))}</p></div>
        <div class="actions"><button class="btn primary" data-act="add">${I('plus')}${esc(t('calendar.add'))}</button></div></div>
      <div class="split">
        <div class="card pad">
          <div class="cal-head"><h3>${esc(OC.fmtMonth(st.y, st.m))}</h3><div class="row"><button class="btn sm" data-act="today">${esc(t('rel.today'))}</button><button class="btn icon sm" data-act="prev" aria-label="${esc(t('prev'))}">${I('left')}</button><button class="btn icon sm" data-act="next" aria-label="${esc(t('next'))}">${I('right')}</button></div></div>
          <div class="cal-grid">${dows.map(d => `<div class="cal-dow">${esc(d)}</div>`).join('')}
          ${cells.map(d => { const iso = U.toISO(d); const evs = map[iso] || []; const out = d.getMonth() !== st.m;
            return `<button type="button" class="cal-cell${out ? ' out' : ''}${iso === today ? ' today' : ''}${iso === st.sel ? ' sel' : ''}" data-act="sel" data-date="${iso}" aria-label="${esc(OC.fmtDate(iso))}">
              <span class="d"><span>${d.getDate()}</span>${evs.length ? `<small class="muted">${evs.length}</small>` : ''}</span>
              ${evs.slice(0, 2).map(e => `<span class="chip ${esc(e.type)}">${esc((e.time ? e.time + ' ' : '') + e.title)}</span>`).join('')}
              ${evs.length > 2 ? `<span class="more">+${evs.length - 2}</span>` : ''}
              <span class="dots">${evs.slice(0, 3).map(e => `<i class="dot" style="width:5px;height:5px;color:var(--accent)"></i>`).join('')}</span></button>`; }).join('')}
          </div>
        </div>
        <div class="stack">
          <div class="card pad"><div class="row between"><h3>${I('calendar')}${esc(OC.fmtDate(st.sel, { weekday: 'long', day: 'numeric', month: 'long' }))}</h3><button class="btn sm" data-act="addOn">${I('plus')}${esc(t('add'))}</button></div>
            <div class="mt">${selList.length ? selList.map(e => evRow(e)).join('') : `<p class="muted small">${esc(t('calendar.noneDay'))}</p>`}</div></div>
          <div class="card pad"><h3>${I('clock')}${esc(t('calendar.upcoming'))}</h3>
            <div class="mt">${upcoming.length ? upcoming.map(e => evRow(e, true)).join('') : `<p class="muted small">${esc(t('calendar.noneUpcoming'))}</p>`}</div></div>
        </div>
      </div>`;
    },
    actions: {
      add: () => openForm(), addOn: () => openForm(null, st.sel), edit: d => openForm(d.id),
      sel: d => { st.sel = d.date; const dt = U.parseISO(d.date); if (dt.getMonth() !== st.m) { st.y = dt.getFullYear(); st.m = dt.getMonth(); } OC.refresh(); },
      prev: () => { st.m--; if (st.m < 0) { st.m = 11; st.y--; } OC.refresh(); },
      next: () => { st.m++; if (st.m > 11) { st.m = 0; st.y++; } OC.refresh(); },
      today: () => { const d = new Date(); st.y = d.getFullYear(); st.m = d.getMonth(); st.sel = U.today(); OC.refresh(); },
      async del(d) { const e = OC.find('events', d.id); if (!e) return; if (await OC.confirm({ title: t('calendar.delete'), message: t('calendar.deleteMsg', { title: e.title }) })) { OC.remove('events', d.id); OC.save(); OC.toast(t('deleted')); OC.refresh(); } }
    }
  };
})(window.OC);
