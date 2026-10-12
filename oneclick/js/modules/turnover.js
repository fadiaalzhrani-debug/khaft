/* OneClick · Shift turnover: handover log with open-issue tracking and copy-as-text */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon, U = OC.util;
  const st = { openOnly: false, q: '' };
  const sorted = () => OC.db.turnovers.slice().sort((a, b) => (b.date + (b.shift === 'night' ? '1' : '0') + b.created).localeCompare(a.date + (a.shift === 'night' ? '1' : '0') + a.created));

  function fields() {
    const names = OC.db.team.map(m => m.name);
    return [
      { key: 'date', label: t('turnover.f.date'), type: 'date', required: true },
      { key: 'shift', label: t('turnover.f.shift'), type: 'select', options: [{ value: 'day', label: t('turnover.day') }, { value: 'night', label: t('turnover.night') }] },
      { key: 'from', label: t('turnover.f.from'), required: true, list: names },
      { key: 'to', label: t('turnover.f.to'), required: true, list: names },
      { key: 'summary', label: t('turnover.f.summary'), type: 'textarea', required: true, placeholder: t('turnover.summaryPh') },
      { key: 'issuesText', label: t('turnover.f.issues'), type: 'textarea', placeholder: t('turnover.issuesPh') }
    ];
  }
  function openForm(id) {
    const existing = id ? OC.find('turnovers', id) : null;
    const values = existing ? Object.assign({}, existing, { issuesText: existing.issues.map(i => i.text).join('\n') }) : { date: U.today(), shift: new Date().getHours() >= 18 || new Date().getHours() < 6 ? 'night' : 'day' };
    OC.form({
      title: existing ? t('turnover.edit') : t('turnover.add'), fields: fields(), values,
      onSubmit(v) {
        const lines = String(v.issuesText || '').split('\n').map(s => s.trim()).filter(Boolean);
        const issues = lines.map(text => { const prev = existing && existing.issues.find(i => i.text === text); return prev || { id: U.uid(), text, open: true }; });
        delete v.issuesText;
        if (existing) Object.assign(existing, v, { issues }); else OC.db.turnovers.push(Object.assign({ id: U.uid(), created: U.nowISO(), issues }, v));
        OC.save(); OC.toast(t('saved')); OC.refresh();
      }
    });
  }
  function asText(tv) {
    return [`${t('turnover.title')} · ${OC.fmtDate(tv.date)} · ${t('turnover.' + tv.shift)}`, `${t('turnover.f.from')}: ${tv.from}  →  ${t('turnover.f.to')}: ${tv.to}`, '', tv.summary, '',
      tv.issues.length ? t('turnover.f.issues') + ':' : '', ...tv.issues.map(i => `${i.open ? '[ ]' : '[x]'} ${i.text}`)].join('\n').trim();
  }

  OC.modules.turnover = {
    id: 'turnover', icon: 'swap', order: 7,
    title: () => t('turnover.title'), tagline: () => t('turnover.tag'),
    count: () => { const n = OC.db.turnovers.reduce((s, tv) => s + tv.issues.filter(i => i.open).length, 0); return n || ''; },
    render() {
      const q = st.q.toLowerCase();
      let list = sorted().filter(tv => !q || [tv.from, tv.to, tv.summary, ...tv.issues.map(i => i.text)].some(x => String(x || '').toLowerCase().includes(q)));
      if (st.openOnly) list = list.filter(tv => tv.issues.some(i => i.open));
      const openIssues = OC.db.turnovers.flatMap(tv => tv.issues.filter(i => i.open).map(i => Object.assign({ tv }, i)));
      return `
      <div class="page-head"><div><h2>${esc(t('turnover.title'))}</h2><p>${esc(t('turnover.desc'))}</p></div>
        <div class="actions"><button class="btn primary" data-act="add">${I('plus')}${esc(t('turnover.add'))}</button></div></div>
      <div class="kpis">
        <div class="card kpi"><span class="lbl">${I('swap')}${esc(t('turnover.entries'))}</span><span class="val">${OC.db.turnovers.length}</span></div>
        <div class="card kpi"><span class="lbl">${I('alert')}${esc(t('turnover.openIssues'))}</span><span class="val">${openIssues.length}</span><span class="hint ${openIssues.length ? 'warn' : ''}">${esc(openIssues.length ? t('turnover.openHint') : t('turnover.noOpen'))}</span></div>
        <div class="card kpi"><span class="lbl">${I('clock')}${esc(t('turnover.last'))}</span><span class="val" style="font-size:1.2rem">${list[0] ? esc(OC.fmtDateShort(sorted()[0].date)) : '—'}</span><span class="hint">${sorted()[0] ? esc(t('turnover.' + sorted()[0].shift) + ' · ' + sorted()[0].from) : ''}</span></div>
      </div>
      <div class="split">
        <div>
          <div class="toolbar">${OC.search(st.q, t('turnover.search'))}<label class="check"><input type="checkbox" data-change="openOnly" ${st.openOnly ? 'checked' : ''}/> ${esc(t('turnover.onlyOpen'))}</label></div>
          ${list.length ? `<div class="tl">${list.map(tv => `<div class="tl-item card pad ${esc(tv.shift)}">
            <div class="row between"><div class="head"><b>${esc(OC.fmtDate(tv.date, { weekday: 'short', day: 'numeric', month: 'short' }))}</b>${OC.pill(tv.shift === 'night' ? 'violet' : 'warn', t('turnover.' + tv.shift), tv.shift === 'night' ? 'moonstar' : 'sunrise')}${tv.issues.some(i => i.open) ? OC.pill('crit', t('turnover.nOpen', { n: tv.issues.filter(i => i.open).length }), 'alert') : ''}</div>
              <div class="row" style="gap:2px"><button class="btn ghost icon sm" data-act="copy" data-id="${tv.id}" title="${esc(t('turnover.copy'))}" aria-label="${esc(t('turnover.copy'))}">${I('copy')}</button><button class="btn ghost icon sm" data-act="edit" data-id="${tv.id}" aria-label="${esc(t('edit'))}">${I('edit')}</button><button class="btn ghost icon sm" data-act="del" data-id="${tv.id}" aria-label="${esc(t('delete'))}">${I('trash')}</button></div></div>
            <div class="who-line">${esc(t('turnover.f.from'))} <b>${esc(tv.from)}</b> → ${esc(t('turnover.f.to'))} <b>${esc(tv.to)}</b></div>
            <p class="sum">${esc(tv.summary)}</p>
            ${tv.issues.length ? `<div class="mt small muted" style="font-weight:700">${esc(t('turnover.f.issues'))}</div>${tv.issues.map(i => `<label class="issue${i.open ? '' : ' done'}"><input type="checkbox" data-change="issue" data-id="${tv.id}" data-iid="${i.id}" ${i.open ? '' : 'checked'}/> <span>${esc(i.text)}</span></label>`).join('')}` : ''}
          </div>`).join('')}</div>` : OC.empty('swap', t('turnover.empty'), t('turnover.emptyHint'))}
        </div>
        <div class="card pad"><h3>${I('alert')}${esc(t('turnover.openIssues'))}</h3>
          <div class="mt stack" style="gap:6px">${openIssues.length ? openIssues.map(i => `<label class="issue"><input type="checkbox" data-change="issue" data-id="${i.tv.id}" data-iid="${i.id}"/> <span style="flex:1">${esc(i.text)}<small class="muted" style="display:block">${esc(OC.fmtDateShort(i.tv.date))} · ${esc(t('turnover.' + i.tv.shift))}</small></span></label>`).join('') : `<p class="muted small">${esc(t('turnover.noOpen'))}</p>`}</div></div>
      </div>`;
    },
    actions: {
      add: () => openForm(), edit: d => openForm(d.id),
      q: (d, el) => { st.q = el.value; OC.refresh(); },
      openOnly: (d, el) => { st.openOnly = el.checked; OC.refresh(); },
      issue: (d, el) => { const tv = OC.find('turnovers', d.id); const i = tv && tv.issues.find(x => x.id === d.iid); if (!i) return; i.open = !el.checked; OC.save(); if (!i.open) OC.toast(t('turnover.resolved')); OC.refresh(); },
      copy: d => { const tv = OC.find('turnovers', d.id); if (tv) OC.copyText(asText(tv)); },
      async del(d) { const tv = OC.find('turnovers', d.id); if (!tv) return; if (await OC.confirm({ title: t('turnover.delete'), message: t('turnover.deleteMsg', { date: OC.fmtDate(tv.date) }) })) { OC.remove('turnovers', d.id); OC.save(); OC.toast(t('deleted')); OC.refresh(); } }
    }
  };
})(window.OC);
