/* OneClick · Inventory: stock levels vs minimum, quick +/- adjust, low-stock filter, CSV */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon;
  const st = { q: '', cat: 'all', low: false, sort: 'status' };
  const level = i => i.qty <= 0 ? 'out' : i.qty <= i.min ? 'low' : 'ok';
  const levelPill = i => { const l = level(i); return OC.pill(l === 'out' ? 'crit' : l === 'low' ? 'warn' : 'good', t('inventory.l.' + l), l === 'out' ? 'alert' : l === 'low' ? 'alert' : 'check'); };
  const cats = () => [...new Set(OC.db.inventory.map(i => i.category).filter(Boolean))].sort();

  function fields() {
    return [
      { key: 'name', label: t('inventory.f.name'), required: true, full: true },
      { key: 'sku', label: t('inventory.f.sku'), placeholder: 'PPE-0101' },
      { key: 'category', label: t('inventory.f.category'), required: true, list: [...new Set(cats().concat(['PPE', 'Fasteners', 'Lubricants', '3D Printing', 'Electrical', 'Consumables', 'Tools', 'Spare parts']))] },
      { key: 'qty', label: t('inventory.f.qty'), type: 'number', required: true, min: 0, step: 1 },
      { key: 'min', label: t('inventory.f.min'), type: 'number', required: true, min: 0, step: 1 },
      { key: 'unit', label: t('inventory.f.unit'), list: ['pcs', 'box', 'pack', 'roll', 'spool', 'drum', 'litre', 'kg', 'set'] },
      { key: 'location', label: t('inventory.f.location'), placeholder: 'Cabinet A1' }
    ];
  }
  function openForm(id) {
    const existing = id ? OC.find('inventory', id) : null;
    OC.form({
      title: existing ? t('inventory.edit') : t('inventory.add'), fields: fields(), values: existing || { qty: 0, min: 1, unit: 'pcs' },
      onSubmit(v) {
        if (existing) Object.assign(existing, v); else OC.db.inventory.push(Object.assign({ id: OC.util.uid() }, v));
        OC.save(); OC.toast(t('saved')); OC.refresh();
      }
    });
  }
  function filtered() {
    const q = st.q.toLowerCase(); const rank = { out: 0, low: 1, ok: 2 };
    const list = OC.db.inventory.filter(i => (st.cat === 'all' || i.category === st.cat) && (!st.low || level(i) !== 'ok') &&
      (!q || [i.name, i.sku, i.category, i.location].some(x => String(x || '').toLowerCase().includes(q))));
    if (st.sort === 'status') list.sort((a, b) => rank[level(a)] - rank[level(b)] || a.name.localeCompare(b.name));
    else if (st.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (st.sort === 'qty') list.sort((a, b) => a.qty - b.qty);
    return list;
  }

  OC.modules.inventory = {
    id: 'inventory', icon: 'box', order: 2,
    title: () => t('inventory.title'), tagline: () => t('inventory.tag'),
    count: () => { const n = OC.db.inventory.filter(i => level(i) !== 'ok').length; return n || ''; },
    render() {
      const all = OC.db.inventory, list = filtered();
      const low = all.filter(i => level(i) === 'low').length, out = all.filter(i => level(i) === 'out').length;
      return `
      <div class="page-head"><div><h2>${esc(t('inventory.title'))}</h2><p>${esc(t('inventory.desc'))}</p></div>
        <div class="actions"><button class="btn" data-act="csv">${I('download')}${esc(t('exportCsv'))}</button><button class="btn primary" data-act="add">${I('plus')}${esc(t('inventory.add'))}</button></div></div>
      <div class="kpis">
        <div class="card kpi"><span class="lbl">${I('box')}${esc(t('inventory.items'))}</span><span class="val">${all.length}</span></div>
        <div class="card kpi"><span class="lbl">${I('alert')}${esc(t('inventory.l.low'))}</span><span class="val">${low}</span><span class="hint ${low ? 'warn' : ''}">${esc(t('inventory.lowHint'))}</span></div>
        <div class="card kpi"><span class="lbl">${I('alert')}${esc(t('inventory.l.out'))}</span><span class="val">${out}</span><span class="hint ${out ? 'crit' : ''}">${esc(t('inventory.outHint'))}</span></div>
        <div class="card kpi"><span class="lbl">${I('layers')}${esc(t('inventory.cats'))}</span><span class="val">${cats().length}</span></div>
      </div>
      <div class="toolbar">${OC.search(st.q, t('inventory.search'))}
        <select class="select" style="width:auto" data-change="cat" aria-label="${esc(t('inventory.f.category'))}">${OC.options([{ value: 'all', label: t('inventory.allCats') }].concat(cats().map(c => ({ value: c, label: c }))), st.cat)}</select>
        <select class="select" style="width:auto" data-change="sort" aria-label="${esc(t('sort'))}">${OC.options([{ value: 'status', label: t('inventory.sortStatus') }, { value: 'name', label: t('inventory.sortName') }, { value: 'qty', label: t('inventory.sortQty') }], st.sort)}</select>
        <label class="check"><input type="checkbox" data-change="low" ${st.low ? 'checked' : ''}/> ${esc(t('inventory.onlyLow'))}</label>
        <span class="muted small">${esc(t('showing', { n: list.length, total: all.length }))}</span></div>
      ${list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>${esc(t('inventory.f.name'))}</th><th>${esc(t('inventory.f.category'))}</th><th>${esc(t('inventory.f.location'))}</th><th class="num">${esc(t('inventory.f.qty'))}</th><th class="num">${esc(t('inventory.f.min'))}</th><th>${esc(t('status'))}</th><th></th></tr></thead><tbody>
        ${list.map(i => `<tr><td><b>${esc(i.name)}</b><div class="muted">${esc(i.sku || '')}</div></td><td>${esc(i.category)}</td><td class="muted">${esc(i.location || '—')}</td>
          <td class="num"><span class="qty-ctl"><button type="button" data-act="dec" data-id="${i.id}" aria-label="-1">−</button><b>${esc(i.qty)}</b><button type="button" data-act="inc" data-id="${i.id}" aria-label="+1">+</button></span> <span class="muted">${esc(i.unit || '')}</span></td>
          <td class="num muted">${esc(i.min)}</td><td>${levelPill(i)}</td>
          <td><div class="acts"><button class="btn ghost icon sm" data-act="edit" data-id="${i.id}" title="${esc(t('edit'))}" aria-label="${esc(t('edit'))}">${I('edit')}</button><button class="btn ghost icon sm" data-act="del" data-id="${i.id}" title="${esc(t('delete'))}" aria-label="${esc(t('delete'))}">${I('trash')}</button></div></td></tr>`).join('')}
      </tbody></table></div>` : OC.empty('box', t('inventory.empty'), all.length ? t('tryFilters') : t('inventory.emptyHint'))}`;
    },
    actions: {
      add: () => openForm(), edit: d => openForm(d.id),
      q: (d, el) => { st.q = el.value; OC.refresh(); },
      cat: (d, el) => { st.cat = el.value; OC.refresh(); },
      sort: (d, el) => { st.sort = el.value; OC.refresh(); },
      low: (d, el) => { st.low = el.checked; OC.refresh(); },
      inc: d => { const i = OC.find('inventory', d.id); if (i) { i.qty = Number(i.qty) + 1; OC.save(); OC.refresh(); } },
      dec: d => { const i = OC.find('inventory', d.id); if (i && i.qty > 0) { i.qty = Number(i.qty) - 1; OC.save(); if (level(i) === 'out') OC.toast(t('inventory.nowOut', { name: i.name }), 'err'); else if (level(i) === 'low' && i.qty === i.min) OC.toast(t('inventory.nowLow', { name: i.name }), 'info'); OC.refresh(); } },
      async del(d) { const i = OC.find('inventory', d.id); if (!i) return; if (await OC.confirm({ title: t('inventory.delete'), message: t('inventory.deleteMsg', { name: i.name }) })) { OC.remove('inventory', d.id); OC.save(); OC.toast(t('deleted')); OC.refresh(); } },
      csv: () => OC.exportCSV('oneclick-inventory.csv', [{ key: 'name', label: 'Item' }, { key: 'sku', label: 'SKU' }, { key: 'category', label: 'Category' }, { key: 'qty', label: 'Qty' }, { key: 'min', label: 'Min' }, { key: 'unit', label: 'Unit' }, { key: 'location', label: 'Location' }, { key: 'status', label: 'Status', get: i => t('inventory.l.' + level(i)) }], filtered())
    },
    level
  };
})(window.OC);
