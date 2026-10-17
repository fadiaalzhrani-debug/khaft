/* OneClick · 3D Prints: kanban queue (drag & drop or buttons), progress, priority */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon, U = OC.util;
  const COLS = ['queued', 'printing', 'done', 'failed'];
  const MATERIALS = ['PLA', 'PETG', 'ABS', 'TPU', 'Nylon', 'Resin'];
  const PRI = { high: 'crit', med: 'warn', low: 'info' };
  const st = { q: '' };

  function fields() {
    return [
      { key: 'item', label: t('prints.f.item'), required: true, full: true },
      { key: 'requester', label: t('prints.f.requester'), required: true, list: OC.db.team.map(m => m.name) },
      { key: 'material', label: t('prints.f.material'), type: 'select', options: MATERIALS.map(m => ({ value: m, label: m })) },
      { key: 'qty', label: t('prints.f.qty'), type: 'number', min: 1, step: 1, required: true },
      { key: 'due', label: t('prints.f.due'), type: 'date' },
      { key: 'priority', label: t('priority'), type: 'select', options: ['high', 'med', 'low'].map(p => ({ value: p, label: t('pri.' + p) })) },
      { key: 'status', label: t('status'), type: 'select', options: COLS.map(c => ({ value: c, label: t('prints.s.' + c) })) },
      { key: 'notes', label: t('notes'), type: 'textarea' }
    ];
  }
  function openForm(id) {
    const existing = id ? OC.find('prints', id) : null;
    OC.form({
      title: existing ? t('prints.edit') : t('prints.add'), fields: fields(), values: existing || { material: 'PLA', qty: 1, priority: 'med', status: 'queued', due: U.addDays(U.today(), 3) },
      onSubmit(v) {
        if (existing) { Object.assign(existing, v); if (v.status === 'done') existing.progress = 100; if (v.status === 'queued') existing.progress = 0; }
        else OC.db.prints.push(Object.assign({ id: U.uid(), progress: v.status === 'done' ? 100 : 0 }, v));
        OC.save(); OC.toast(t('saved')); OC.refresh();
      }
    });
  }
  function move(id, status) {
    const p = OC.find('prints', id); if (!p || p.status === status) return;
    p.status = status; if (status === 'done') p.progress = 100; if (status === 'queued') p.progress = 0; if (status === 'printing' && p.progress >= 100) p.progress = 0;
    OC.save(); OC.toast(t('prints.moved', { item: p.item, status: t('prints.s.' + status) })); OC.refresh();
  }
  const card = p => {
    const late = p.due && p.status !== 'done' && U.daysBetween(U.today(), p.due) < 0;
    const idx = COLS.indexOf(p.status);
    return `<div class="kcard" draggable="true" data-drag="${p.id}">
      <div class="row between" style="align-items:flex-start"><b>${esc(p.item)}</b>${OC.pill(PRI[p.priority] || '', t('pri.' + (p.priority || 'med')), 'circle')}</div>
      <div class="meta"><span>${esc(p.requester)}</span><span>·</span><span>${esc(p.material)} × ${esc(p.qty)}</span>${p.due ? `<span>·</span><span class="${late ? 'crit' : ''}" style="${late ? 'color:var(--crit);font-weight:800' : ''}">${esc(t('due'))} ${esc(OC.relDays(p.due))}</span>` : ''}</div>
      ${p.notes ? `<p class="muted small" style="margin-top:6px">${esc(p.notes)}</p>` : ''}
      ${p.status === 'printing' ? `<div class="row" style="margin-top:10px;gap:8px"><div class="progress"><i style="width:${p.progress || 0}%"></i></div><b class="small" style="min-width:36px;text-align:end">${p.progress || 0}%</b></div><input class="range" type="range" min="0" max="100" step="5" value="${p.progress || 0}" data-change="prog" data-id="${p.id}" aria-label="${esc(t('prints.progress'))}" />` : ''}
      <div class="foot"><div class="row" style="gap:4px">
        ${idx > 0 && p.status !== 'failed' ? `<button class="btn ghost icon sm" data-act="back" data-id="${p.id}" title="${esc(t('prints.s.' + COLS[idx - 1]))}" aria-label="${esc(t('prints.s.' + COLS[idx - 1]))}">${I('left')}</button>` : ''}
        ${p.status === 'queued' ? `<button class="btn sm primary" data-act="to" data-id="${p.id}" data-s="printing">${I('play')}${esc(t('prints.start'))}</button>` : ''}
        ${p.status === 'printing' ? `<button class="btn sm primary" data-act="to" data-id="${p.id}" data-s="done">${I('check')}${esc(t('prints.finish'))}</button><button class="btn sm" data-act="to" data-id="${p.id}" data-s="failed">${I('x')}${esc(t('prints.s.failed'))}</button>` : ''}
        ${p.status === 'failed' ? `<button class="btn sm" data-act="to" data-id="${p.id}" data-s="queued">${I('refresh')}${esc(t('prints.retry'))}</button>` : ''}
      </div><div class="row" style="gap:2px"><button class="btn ghost icon sm" data-act="edit" data-id="${p.id}" aria-label="${esc(t('edit'))}">${I('edit')}</button><button class="btn ghost icon sm" data-act="del" data-id="${p.id}" aria-label="${esc(t('delete'))}">${I('trash')}</button></div></div></div>`;
  };

  OC.modules.prints = {
    id: 'prints', icon: 'cube', order: 4.5,
    title: () => t('prints.title'), tagline: () => t('prints.tag'),
    count: () => { const n = OC.db.prints.filter(p => p.status === 'queued' || p.status === 'printing').length; return n || ''; },
    render() {
      const q = st.q.toLowerCase();
      const list = OC.db.prints.filter(p => !q || [p.item, p.requester, p.material, p.notes].some(x => String(x || '').toLowerCase().includes(q)));
      const rank = { high: 0, med: 1, low: 2 };
      const col = s => list.filter(p => p.status === s).sort((a, b) => (rank[a.priority] - rank[b.priority]) || String(a.due || '').localeCompare(String(b.due || '')));
      const done7 = OC.db.prints.filter(p => p.status === 'done').length;
      return `
      <div class="page-head"><div><h2>${esc(t('prints.title'))}</h2><p>${esc(t('prints.desc'))}</p></div>
        <div class="actions"><button class="btn" data-act="import">${I('upload')}${esc(t('imp.button'))}</button><button class="btn primary" data-act="add">${I('plus')}${esc(t('prints.add'))}</button></div></div>
      <div class="kpis">
        <div class="card kpi"><span class="lbl">${I('clock')}${esc(t('prints.s.queued'))}</span><span class="val">${col('queued').length}</span></div>
        <div class="card kpi"><span class="lbl">${I('printer')}${esc(t('prints.s.printing'))}</span><span class="val">${col('printing').length}</span></div>
        <div class="card kpi"><span class="lbl">${I('check')}${esc(t('prints.s.done'))}</span><span class="val">${done7}</span></div>
        <div class="card kpi"><span class="lbl">${I('alert')}${esc(t('prints.s.failed'))}</span><span class="val">${col('failed').length}</span></div>
      </div>
      <div class="toolbar">${OC.search(st.q, t('prints.search'))}<span class="muted small">${esc(t('prints.dragHint'))}</span></div>
      <div class="kanban">${COLS.map(s => `<div class="card kcol" data-drop="${s}"><h4>${I(s === 'queued' ? 'clock' : s === 'printing' ? 'printer' : s === 'done' ? 'check' : 'alert')}${esc(t('prints.s.' + s))}<span class="cnt">${col(s).length}</span></h4>${col(s).map(card).join('') || `<p class="muted small" style="padding:6px">${esc(t('prints.emptyCol'))}</p>`}</div>`).join('')}</div>`;
    },
    mount(root) {
      let dragId = null;
      root.querySelectorAll('[data-drag]').forEach(el => {
        el.addEventListener('dragstart', e => { dragId = el.dataset.drag; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (err) { /* ignore */ } });
        el.addEventListener('dragend', () => { el.classList.remove('dragging'); root.querySelectorAll('.kcol.over').forEach(c => c.classList.remove('over')); });
      });
      root.querySelectorAll('[data-drop]').forEach(colEl => {
        colEl.addEventListener('dragover', e => { e.preventDefault(); colEl.classList.add('over'); e.dataTransfer.dropEffect = 'move'; });
        colEl.addEventListener('dragleave', () => colEl.classList.remove('over'));
        colEl.addEventListener('drop', e => { e.preventDefault(); colEl.classList.remove('over'); const id = dragId || e.dataTransfer.getData('text/plain'); if (id) move(id, colEl.dataset.drop); dragId = null; });
      });
    },
    actions: {
      add: () => openForm(), edit: d => openForm(d.id),
      q: (d, el) => { st.q = el.value; OC.refresh(); },
      to: d => move(d.id, d.s),
      back: d => { const p = OC.find('prints', d.id); if (p) move(d.id, COLS[Math.max(0, COLS.indexOf(p.status) - 1)]); },
      prog: (d, el) => { const p = OC.find('prints', d.id); if (!p) return; p.progress = Number(el.value); if (p.progress >= 100) { p.status = 'done'; OC.toast(t('prints.moved', { item: p.item, status: t('prints.s.done') })); } OC.save(); OC.refresh(); },
      async del(d) { const p = OC.find('prints', d.id); if (!p) return; if (await OC.confirm({ title: t('prints.delete'), message: t('prints.deleteMsg', { item: p.item }) })) { OC.remove('prints', d.id); OC.save(); OC.toast(t('deleted')); OC.refresh(); } }
    }
  };
})(window.OC);
