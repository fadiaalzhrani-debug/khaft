/* OneClick · Innovation board: ideas with votes and a review pipeline */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon, U = OC.util;
  const STATUS = ['new', 'review', 'approved', 'done', 'rejected'];
  const KIND = { new: 'info', review: 'warn', approved: 'good', done: 'accent', rejected: 'crit' };
  const st = { status: 'all', sort: 'votes', q: '' };

  function fields() {
    return [
      { key: 'title', label: t('ideas.f.title'), required: true, full: true },
      { key: 'by', label: t('ideas.f.by'), required: true, list: OC.db.team.map(m => m.name) },
      { key: 'status', label: t('status'), type: 'select', options: STATUS.map(s => ({ value: s, label: t('ideas.s.' + s) })) },
      { key: 'desc', label: t('ideas.f.desc'), type: 'textarea', required: true, placeholder: t('ideas.descPh') }
    ];
  }
  function openForm(id) {
    const existing = id ? OC.find('ideas', id) : null;
    OC.form({
      title: existing ? t('ideas.edit') : t('ideas.add'), fields: fields(), values: existing || { status: 'new' },
      onSubmit(v) {
        if (existing) Object.assign(existing, v); else OC.db.ideas.push(Object.assign({ id: U.uid(), votes: 0, created: U.nowISO() }, v));
        OC.save(); OC.toast(existing ? t('saved') : t('ideas.thanks')); OC.refresh();
      }
    });
  }

  OC.modules.ideas = {
    id: 'ideas', icon: 'bulb', order: 8,
    title: () => t('ideas.title'), tagline: () => t('ideas.tag'),
    count: () => { const n = OC.db.ideas.filter(i => i.status === 'new').length; return n || ''; },
    render() {
      const all = OC.db.ideas, q = st.q.toLowerCase();
      let list = all.filter(i => (st.status === 'all' || i.status === st.status) && (!q || [i.title, i.by, i.desc].some(x => String(x || '').toLowerCase().includes(q))));
      list = list.sort((a, b) => st.sort === 'votes' ? (b.votes - a.votes) || b.created.localeCompare(a.created) : b.created.localeCompare(a.created));
      const c = s => all.filter(i => i.status === s).length;
      const totalVotes = all.reduce((s, i) => s + (i.votes || 0), 0);
      return `
      <div class="page-head"><div><h2>${esc(t('ideas.title'))}</h2><p>${esc(t('ideas.desc'))}</p></div>
        <div class="actions"><button class="btn" data-act="import">${I('upload')}${esc(t('imp.button'))}</button><button class="btn primary" data-act="add">${I('plus')}${esc(t('ideas.add'))}</button></div></div>
      <div class="kpis">
        <div class="card kpi"><span class="lbl">${I('bulb')}${esc(t('ideas.total'))}</span><span class="val">${all.length}</span></div>
        <div class="card kpi"><span class="lbl">${I('clock')}${esc(t('ideas.s.review'))}</span><span class="val">${c('new') + c('review')}</span><span class="hint">${esc(t('ideas.reviewHint'))}</span></div>
        <div class="card kpi"><span class="lbl">${I('check')}${esc(t('ideas.s.done'))}</span><span class="val">${c('done')}<small>+ ${c('approved')} ${esc(t('ideas.s.approved').toLowerCase())}</small></span></div>
        <div class="card kpi"><span class="lbl">${I('up')}${esc(t('ideas.votes'))}</span><span class="val">${totalVotes}</span></div>
      </div>
      <div class="toolbar">${OC.search(st.q, t('ideas.search'))}
        ${OC.seg('filter', [{ value: 'all', label: t('all') }].concat(STATUS.map(s => ({ value: s, label: t('ideas.s.' + s) }))), st.status)}
        ${OC.seg('sort', [{ value: 'votes', label: t('ideas.top') }, { value: 'new', label: t('ideas.newest') }], st.sort)}</div>
      ${list.length ? `<div class="grid-2">${list.map(i => { const voted = OC.db.votes.includes(i.id); return `
        <div class="card idea"><div class="vote"><button type="button" class="${voted ? 'voted' : ''}" data-act="vote" data-id="${i.id}" aria-pressed="${voted}" aria-label="${esc(t('ideas.vote'))}">${I('up')}</button><b>${i.votes || 0}</b></div>
          <div class="body"><div class="row between" style="align-items:flex-start"><h4>${esc(i.title)}</h4>${OC.pill(KIND[i.status] || '', t('ideas.s.' + i.status), i.status === 'done' ? 'check' : i.status === 'rejected' ? 'x' : i.status === 'approved' ? 'sparkles' : 'circle')}</div>
            <p>${esc(i.desc)}</p>
            <div class="meta"><span>${esc(i.by)}</span><span>·</span><span>${esc(OC.fmtDate(i.created.slice(0, 10)))}</span><span style="flex:1"></span>
              <select class="select" data-change="status" data-id="${i.id}" aria-label="${esc(t('status'))}">${OC.options(STATUS.map(s => ({ value: s, label: t('ideas.s.' + s) })), i.status)}</select>
              <button class="btn ghost icon sm" data-act="edit" data-id="${i.id}" aria-label="${esc(t('edit'))}">${I('edit')}</button><button class="btn ghost icon sm" data-act="del" data-id="${i.id}" aria-label="${esc(t('delete'))}">${I('trash')}</button></div></div></div>`; }).join('')}</div>`
        : OC.empty('bulb', t('ideas.empty'), all.length ? t('tryFilters') : t('ideas.emptyHint'))}`;
    },
    actions: {
      add: () => openForm(), edit: d => openForm(d.id),
      q: (d, el) => { st.q = el.value; OC.refresh(); },
      filter: d => { st.status = d.v; OC.refresh(); }, sort: d => { st.sort = d.v; OC.refresh(); },
      vote: d => { const i = OC.find('ideas', d.id); if (!i) return; const k = OC.db.votes.indexOf(i.id); if (k >= 0) { OC.db.votes.splice(k, 1); i.votes = Math.max(0, (i.votes || 0) - 1); } else { OC.db.votes.push(i.id); i.votes = (i.votes || 0) + 1; OC.toast(t('ideas.voted')); } OC.save(); OC.refresh(); },
      status: (d, el) => { const i = OC.find('ideas', d.id); if (!i) return; i.status = el.value; OC.save(); OC.toast(t('ideas.statusSet', { status: t('ideas.s.' + i.status) })); OC.refresh(); },
      async del(d) { const i = OC.find('ideas', d.id); if (!i) return; if (await OC.confirm({ title: t('ideas.delete'), message: t('ideas.deleteMsg', { title: i.title }) })) { OC.remove('ideas', d.id); OC.db.votes = OC.db.votes.filter(v => v !== d.id); OC.save(); OC.toast(t('deleted')); OC.refresh(); } }
    }
  };
})(window.OC);
