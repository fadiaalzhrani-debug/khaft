/* OneClick · Settings: customize everything (name, colour, sections, every text), users & PIN codes,
   approvals, appearance, leave rules, Excel imports per section, backup & restore, sample data, wipe */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon, A = () => OC.auth;
  const st = { textQ: '', textsOpen: false };
  const allSpecs = () => Object.values(OC.modules).sort((a, b) => a.order - b.order).flatMap(m => (m.importSpecs || []).map(s => ({ s, m })));
  const specById = id => (allSpecs().find(x => x.s.id === id) || {}).s;
  const ACCENTS = ['#34d399', '#3b82f6', '#14b8a6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];
  const lang = () => OC.db.settings.lang;
  const labels = () => OC.db.settings.labels[lang()];
  const dict = () => OC.i18n.dict;
  const defaultText = k => (dict()[lang()][k] != null ? dict()[lang()][k] : dict().en[k]) || '';
  function setLabel(key, value) {
    const v = String(value || '').trim();
    if (!v || v === defaultText(key)) delete labels()[key]; else labels()[key] = v.slice(0, 300);
    OC.save();
  }
  const sections = () => Object.values(OC.modules).filter(m => !m.hideInNav || m.id === 'me').sort((a, b) => a.order - b.order);
  const tagKey = id => ({ week: 'week.completion' })[id] || (dict().en[id + '.tag'] ? id + '.tag' : '');

  /* ---------- users ---------- */
  function userForm(id) {
    const u = id ? OC.db.users.find(x => x.id === id) : null;
    const team = OC.db.team.slice().sort((a, b) => a.name.localeCompare(b.name));
    const fields = [
      { key: 'username', label: t('auth.username'), required: true, placeholder: 'ahmed' },
      { key: 'personId', label: t('auth.linkPerson'), type: 'select', options: [{ value: '', label: '— ' + t('auth.noLink') + ' —' }].concat(team.map(p => ({ value: p.id, label: p.name }))) },
      { key: 'role', label: t('auth.role'), type: 'select', options: [{ value: 'member', label: t('auth.role.member') }, { value: 'admin', label: t('auth.role.admin') }] }
    ];
    if (!u) fields.push({ key: 'pin', label: t('auth.pin'), type: 'password', required: true }, { key: 'pin2', label: t('auth.confirmPin'), type: 'password', required: true });
    OC.form({
      title: u ? t('auth.editUser') : t('auth.addUser'), fields, values: u || { role: 'member' },
      onSubmit(v) {
        if (A().usernameTaken(v.username, u && u.id)) return t('auth.taken');
        if (u) {
          if (u.role === 'admin' && v.role !== 'admin' && OC.db.users.filter(x => x.role === 'admin').length === 1) return t('auth.lastAdmin');
          Object.assign(u, { username: v.username.slice(0, 40), personId: v.personId, role: v.role });
        } else {
          if (!A().validPin(v.pin)) return t('auth.pinRule');
          if (v.pin !== v.pin2) return t('auth.pinMismatch');
          OC.db.users.push(A().makeUser(v));
        }
        OC.save(); OC.toast(t('saved')); OC.refresh();
      }
    });
  }
  function resetPin(id) {
    const u = OC.db.users.find(x => x.id === id); if (!u) return;
    OC.form({
      title: t('auth.resetPinFor', { name: A().displayName(u) }),
      fields: [{ key: 'pin', label: t('auth.newPin'), type: 'password', required: true }, { key: 'pin2', label: t('auth.confirmPin'), type: 'password', required: true }],
      onSubmit(v) { if (!A().validPin(v.pin)) return t('auth.pinRule'); if (v.pin !== v.pin2) return t('auth.pinMismatch'); const f = A().makeUser({ username: u.username, pin: v.pin }); u.salt = f.salt; u.hash = f.hash; OC.save(); OC.toast(t('auth.pinChanged')); }
    });
  }
  function showRecovery(code) {
    const body = document.createElement('div');
    body.innerHTML = `<p class="msg">${esc(t('auth.recoveryMsg'))}</p><p class="recovery-code">${esc(code)}</p><p class="muted small">${esc(t('auth.recoveryKeep'))}</p>`;
    const foot = document.createElement('div'); foot.style.display = 'contents';
    foot.innerHTML = `<button class="btn" type="button" data-copy>${I('copy')}${esc(t('inv.copy'))}</button><button class="btn primary" type="button" data-ok>${I('check')}${esc(t('auth.savedIt'))}</button>`;
    const m = OC.modal({ title: t('auth.recoveryTitle'), body, footer: foot, narrow: true });
    foot.querySelector('[data-copy]').onclick = () => OC.copyText(code);
    foot.querySelector('[data-ok]').onclick = () => m.close();
  }
  function setupAdmin() {
    const team = OC.db.team.slice().sort((a, b) => a.name.localeCompare(b.name));
    OC.form({
      title: t('auth.setupTitle'), submitLabel: t('auth.enable'),
      fields: [
        { key: 'username', label: t('auth.username'), required: true },
        { key: 'personId', label: t('auth.linkPerson'), type: 'select', options: [{ value: '', label: '— ' + t('auth.noLink') + ' —' }].concat(team.map(p => ({ value: p.id, label: p.name }))) },
        { key: 'pin', label: t('auth.adminPin'), type: 'password', required: true }, { key: 'pin2', label: t('auth.confirmPin'), type: 'password', required: true }
      ],
      values: { username: 'admin' },
      onSubmit(v) {
        if (!A().validPin(v.pin)) return t('auth.pinRule');
        if (v.pin !== v.pin2) return t('auth.pinMismatch');
        if (A().usernameTaken(v.username)) return t('auth.taken');
        const u = A().makeUser(Object.assign({}, v, { role: 'admin' })); OC.db.users.push(u);
        const code = A().setRecovery(); OC.db.settings.auth.enabled = true;
        A().setSession(u); OC.save(); OC.renderShell(); setTimeout(() => showRecovery(code), 80);
      }
    });
  }

  OC.modules.settings = {
    id: 'settings', icon: 'settings', order: 99, hideInNav: true,
    title: () => t('settings.title'), tagline: () => t('settings.tag'),
    render() {
      const s = OC.db.settings, db = OC.db, inv = OC.inv.st, au = s.auth;
      const counts = [`${OC.fmtNum(db.team.length)} ${t('settings.c.team')}`, `${OC.fmtNum(inv.stats.count)} ${t('settings.c.inventory')}`, `${db.courses.length} ${t('settings.c.courses')}`, `${db.leaves.length} ${t('settings.c.leaves')}`, `${db.events.length} ${t('settings.c.events')}`, `${db.vehicles.length} ${t('settings.c.vehicles')}`, `${db.tasks.length} ${t('settings.c.tasks')}`].join(' · ');
      let size = 0; try { size = (localStorage.getItem(OC.storageKey) || '').length; } catch (e) { /* ignore */ }
      const setting = (title, hint, ctl) => `<div class="setting"><div><b>${esc(title)}</b><small>${esc(hint)}</small></div><div class="ctl">${ctl}</div></div>`;
      const q = OC.cells.norm(st.textQ), keys = Object.keys(dict().en);
      const textRows = st.textsOpen ? keys.filter(k => !q || OC.cells.norm(k).includes(q) || OC.cells.norm(defaultText(k)).includes(q) || OC.cells.norm(labels()[k] || '').includes(q)).slice(0, 60) : [];
      const custom = Object.keys(labels()).length;
      return `
      <div class="page-head"><div><h2>${esc(t('settings.title'))}</h2><p>${esc(t('settings.desc'))}</p></div></div>

      <div class="card pad"><h3>${I('lock')}${esc(t('auth.title'))}</h3><p class="muted small" style="margin-top:6px">${esc(t('auth.desc'))}</p>
        ${setting(t('auth.require'), t('auth.requireHint'), `${OC.seg('authOn', [{ value: '0', label: t('auth.off') }, { value: '1', label: t('auth.on') }], A().enabled() ? '1' : '0')}`)}
        ${A().enabled() ? `
        ${setting(t('auth.approvalSetting'), t('auth.approvalHint'), OC.seg('approval', [{ value: '1', label: t('auth.on') }, { value: '0', label: t('auth.off') }], au.approval ? '1' : '0'))}
        ${setting(t('auth.autoLock'), t('auth.autoLockHint'), `<select class="select" style="width:auto" data-change="autoLock" aria-label="${esc(t('auth.autoLock'))}">${OC.options([0, 2, 5, 10, 30, 60].map(m => ({ value: m, label: m ? t('auth.minutes', { n: m }) : t('auth.never') })), au.autoLock)}</select>`)}
        <div class="row between mt"><b>${esc(t('auth.users'))} (${db.users.length})</b><button class="btn sm primary" data-act="addUser">${I('plus')}${esc(t('auth.addUser'))}</button></div>
        <div class="table-wrap mt"><table class="table"><thead><tr><th>${esc(t('auth.user'))}</th><th>${esc(t('auth.linkPerson'))}</th><th>${esc(t('auth.role'))}</th><th></th></tr></thead><tbody>
          ${db.users.map(u => `<tr><td><div class="who">${OC.avatar(A().displayName(u))}<div><b>${esc(A().displayName(u))}</b><small>@${esc(u.username)}${A().current() && A().current().id === u.id ? ' · ' + esc(t('auth.you')) : ''}</small></div></div></td><td>${esc((A().personOf(u) || {}).name || '—')}</td><td>${OC.pill(u.role === 'admin' ? 'accent' : '', t('auth.role.' + u.role), u.role === 'admin' ? 'shieldcheck' : 'user')}</td>
            <td><div class="acts"><button class="btn ghost icon sm" data-act="editUser" data-id="${u.id}" aria-label="${esc(t('edit'))}">${I('edit')}</button><button class="btn ghost icon sm" data-act="resetPin" data-id="${u.id}" title="${esc(t('auth.resetPin'))}" aria-label="${esc(t('auth.resetPin'))}">${I('key')}</button><button class="btn ghost icon sm" data-act="delUser" data-id="${u.id}" aria-label="${esc(t('delete'))}">${I('trash')}</button></div></td></tr>`).join('')}
        </tbody></table></div>
        <p class="muted small mt">${I('info')} ${esc(t('auth.note'))}</p>` : ''}
      </div>

      <div class="card pad mt"><h3>${I('palette')}${esc(t('cust.title'))}</h3><p class="muted small" style="margin-top:6px">${esc(t('cust.desc'))}</p>
        ${setting(t('cust.brand'), t('cust.brandHint'), `<input class="input" style="min-width:200px" data-change="brand" value="${esc(s.brand)}" aria-label="${esc(t('cust.brand'))}"/>`)}
        ${setting(t('settings.teamName'), t('settings.teamNameHint'), `<input class="input" style="min-width:200px" data-change="teamName" value="${esc(s.teamName || '')}" aria-label="${esc(t('settings.teamName'))}"/>`)}
        ${setting(t('cust.accent'), t('cust.accentHint'), `<div class="swatches">${ACCENTS.map(c => `<button type="button" class="swatch${(s.accent || '#34d399') === c ? ' on' : ''}" style="--sw:${c}" data-act="accent" data-v="${c}" aria-label="${c}"></button>`).join('')}<label class="swatch custom" title="${esc(t('cust.customColor'))}"><input type="color" value="${esc(s.accent || '#34d399')}" data-change="accentCustom" aria-label="${esc(t('cust.customColor'))}"/></label></div>`)}
        ${setting(t('cust.homeLayout'), t('cust.homeLayoutHint'), `<button class="btn" data-act="goHome">${I('layers')}${esc(t('home.customize'))}</button>`)}
        <h4 class="imp-h">${esc(t('cust.sections'))}</h4><p class="muted small">${esc(t('cust.sectionsHint'))}</p>
        <div class="table-wrap mt"><table class="table cust-sec"><thead><tr><th>${esc(t('cust.show'))}</th><th>${esc(t('cust.name'))}</th><th>${esc(t('cust.tagline'))}</th></tr></thead><tbody>
          ${sections().map(m => { const fixed = ['home', 'settings', 'me'].includes(m.id), tk = tagKey(m.id); return `<tr><td><label class="check"><input type="checkbox" data-change="secVis" data-id="${m.id}" ${OC.isHidden(m.id) ? '' : 'checked'} ${fixed ? 'disabled' : ''}/> ${I(m.icon)}</label></td>
            <td><input class="input" data-change="label" data-id="${m.id}.title" value="${esc(t(m.id + '.title'))}" placeholder="${esc(defaultText(m.id + '.title'))}" aria-label="${esc(t('cust.name'))}"/></td>
            <td>${tk ? `<input class="input" data-change="label" data-id="${tk}" value="${esc(t(tk))}" placeholder="${esc(defaultText(tk))}" aria-label="${esc(t('cust.tagline'))}"/>` : '<span class="muted">—</span>'}</td></tr>`; }).join('')}
        </tbody></table></div>
        <div class="row between mt"><h4 class="imp-h" style="margin:0">${esc(t('cust.texts'))} ${custom ? OC.pill('accent', t('cust.changedN', { n: custom }), 'edit') : ''}</h4><div class="row">${custom ? `<button class="btn sm ghost" data-act="resetTexts">${I('refresh')}${esc(t('cust.resetTexts'))}</button>` : ''}<button class="btn sm" data-act="toggleTexts">${esc(st.textsOpen ? t('auth.hide') : t('cust.editTexts'))}</button></div></div>
        <p class="muted small">${esc(t('cust.textsHint', { lang: lang() === 'ar' ? 'العربية' : 'English' }))}</p>
        ${st.textsOpen ? `<div class="mt">${OC.search(st.textQ, t('cust.searchTexts'), 'textQ')}</div>
          <div class="text-rows mt">${textRows.map(k => `<div class="text-row"><small class="mono">${esc(k)}</small><input class="input" data-change="label" data-id="${esc(k)}" value="${esc(labels()[k] || '')}" placeholder="${esc(defaultText(k))}" aria-label="${esc(k)}"/></div>`).join('') || `<p class="muted small">${esc(t('tryFilters'))}</p>`}</div>
          <p class="muted small">${esc(t('cust.textsShown', { n: textRows.length }))}</p>` : ''}
      </div>

      <div class="card pad mt"><h3>${I('upload')}${esc(t('settings.imports'))}</h3><p class="muted small" style="margin-top:6px">${esc(t('settings.importsHint'))}</p>
        <div class="imp-hub mt">${allSpecs().map(({ s: sp }) => `<div class="imp-tile"><span class="t-ico">${I(sp.icon || 'file')}</span><div class="imp-tile-txt"><b>${esc(sp.title())}</b><small class="muted">${esc(t('settings.nNow', { n: OC.fmtNum(sp.count ? sp.count() : 0) }))}</small></div>
          <div class="row" style="gap:6px"><button class="btn sm ghost" data-act="tpl" data-id="${sp.id}" title="${esc(t('imp.template'))}" aria-label="${esc(t('imp.template'))}">${I('download')}</button><button class="btn sm primary" data-act="imp" data-id="${sp.id}">${I('upload')}${esc(t('imp.short'))}</button></div></div>`).join('')}</div></div>
      <div class="grid-2 mt">
        <div class="card pad"><h3>${I('sparkles')}${esc(t('settings.appearance'))}</h3>
          ${setting(t('settings.lang'), t('settings.langHint'), OC.seg('lang', [{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }], s.lang))}
          ${setting(t('settings.theme'), t('settings.themeHint'), OC.seg('theme', [{ value: 'dark', label: t('settings.dark') }, { value: 'light', label: t('settings.light') }], s.theme))}
          ${setting(t('settings.firstDay'), t('settings.firstDayHint'), OC.seg('firstDay', [{ value: '0', label: t('settings.sunday') }, { value: '1', label: t('settings.monday') }], String(s.firstDay || 0)))}
        </div>
        <div class="card pad"><h3>${I('calendar')}${esc(t('cal.rules'))}</h3>
          ${setting(t('cal.f.maxOff'), t('settings.maxOffHint'), `<input class="input" type="number" min="1" max="99" style="width:90px" data-change="maxOff" value="${esc(s.maxOff)}" aria-label="${esc(t('cal.f.maxOff'))}"/>`)}
          ${setting(t('cal.f.annualDays'), t('settings.annualHint'), `<input class="input" type="number" min="0" max="365" style="width:90px" data-change="annualDays" value="${esc(s.annualDays)}" aria-label="${esc(t('cal.f.annualDays'))}"/>`)}
          ${setting(t('cal.f.weekend'), t('settings.weekendHint'), OC.seg('weekend', [{ value: 'fs', label: t('cal.we.fs') }, { value: 'ss', label: t('cal.we.ss') }, { value: 'f', label: t('cal.we.f') }], s.weekend))}
          ${setting(t('cal.f.leaveCount'), t('settings.leaveCountHint'), OC.seg('leaveCount', [{ value: 'calendar', label: t('cal.lc.calendar') }, { value: 'working', label: t('cal.lc.working') }], s.leaveCount))}
        </div>
      </div>
      <div class="grid-2 mt">
        <div class="card pad"><h3>${I('database')}${esc(t('settings.data'))}</h3>
          <p class="muted small" style="margin-top:6px">${esc(t('settings.dataNote'))}</p>
          <p class="small mt"><b>${esc(counts)}</b> · ${esc(t('settings.size', { kb: (size / 1024).toFixed(1) }))}${inv.persistent ? '' : ' · ' + esc(t('inv.memoryOnly'))}</p>
          ${setting(t('settings.backup'), t('settings.backupHint'), `<button class="btn" data-act="export">${I('download')}${esc(t('settings.export'))}</button><label class="btn">${I('upload')}${esc(t('settings.import'))}<input type="file" accept="application/json,.json" data-change="import" class="sr-only"/></label>`)}
          ${setting(t('inv.clear'), t('inv.clearHint', { n: OC.fmtNum(inv.stats.count) }), `<button class="btn danger" data-act="clearInv" ${inv.stats.count ? '' : 'disabled'}>${I('trash')}${esc(t('inv.clear'))}</button>`)}
          ${setting(t('settings.sample'), t('settings.sampleHint'), `<button class="btn" data-act="sample">${I('refresh')}${esc(t('settings.loadSample'))}</button>`)}
          ${setting(t('settings.wipe'), t('settings.wipeHint'), `<button class="btn danger" data-act="wipe">${I('trash')}${esc(t('settings.wipeBtn'))}</button>`)}
        </div>
        <div class="card pad"><h3>${I('info')}${esc(t('settings.about'))}</h3><p class="muted small" style="margin-top:8px">${esc(t('settings.aboutText'))}</p>
          <p class="muted small mt">${esc(t('settings.shareNote'))}</p>
          <p class="muted small mt"><b>${esc(t('settings.shortcuts'))}:</b> <kbd>Esc</kbd> ${esc(t('settings.kEsc'))} · <kbd>/</kbd> ${esc(t('settings.kSearch'))} · <kbd>1</kbd>–<kbd>9</kbd> ${esc(t('settings.kNav'))} · <kbd>H</kbd> ${esc(t('settings.kHome'))}</p></div>
      </div>`;
    },
    actions: {
      /* users & PIN */
      authOn: async d => {
        if (d.v === '1') { if (A().enabled()) return; if (OC.db.users.some(u => u.role === 'admin')) { const admin = OC.db.users.find(u => u.role === 'admin'); OC.db.settings.auth.enabled = true; A().setSession(admin); OC.save(); OC.renderShell(); return; } setupAdmin(); return; }
        if (!A().enabled()) return;
        if (await OC.confirm({ title: t('auth.turnOff'), message: t('auth.turnOffMsg'), okLabel: t('auth.turnOff') })) { OC.db.settings.auth.enabled = false; OC.save(); OC.renderShell(); }
      },
      approval: d => { OC.db.settings.auth.approval = d.v === '1'; OC.save(); OC.refresh(); },
      autoLock: (d, el) => { OC.db.settings.auth.autoLock = Number(el.value); OC.save(); OC.toast(t('saved')); },
      addUser: () => userForm(), editUser: d => userForm(d.id), resetPin: d => resetPin(d.id),
      async delUser(d) {
        const u = OC.db.users.find(x => x.id === d.id); if (!u) return;
        if (A().current() && A().current().id === u.id) { OC.toast(t('auth.cantDeleteSelf'), 'info'); return; }
        if (u.role === 'admin' && OC.db.users.filter(x => x.role === 'admin').length === 1) { OC.toast(t('auth.lastAdmin'), 'info'); return; }
        if (await OC.confirm({ title: t('auth.deleteUser'), message: t('auth.deleteUserMsg', { name: A().displayName(u) }) })) { OC.db.users = OC.db.users.filter(x => x.id !== u.id); OC.save(); OC.toast(t('deleted')); OC.refresh(); }
      },
      /* customize */
      brand: (d, el) => { OC.db.settings.brand = el.value.trim().slice(0, 40) || 'OneClick'; OC.save(); OC.renderShell(); },
      teamName: (d, el) => { OC.db.settings.teamName = el.value.trim(); OC.save(); OC.applySettings(); },
      accent: d => { OC.db.settings.accent = d.v === '#34d399' ? '' : d.v; OC.save(); OC.applySettings(); OC.refresh(); },
      accentCustom: (d, el) => { OC.db.settings.accent = el.value; OC.save(); OC.applySettings(); OC.refresh(); },
      goHome: () => { OC.go('home'); setTimeout(() => { const b = document.querySelector('[data-act="customize"]'); if (b) b.click(); }, 120); },
      secVis: (d, el) => { const h = OC.db.settings.hiddenSections; const i = h.indexOf(d.id); if (el.checked && i >= 0) h.splice(i, 1); if (!el.checked && i < 0) h.push(d.id); OC.save(); OC.renderShell(); },
      label: (d, el) => { setLabel(d.id, el.value); OC.renderShell(); },
      toggleTexts: () => { st.textsOpen = !st.textsOpen; OC.refresh(); },
      textQ: (d, el) => { st.textQ = el.value; OC.refresh(); },
      async resetTexts() { if (await OC.confirm({ title: t('cust.resetTexts'), message: t('cust.resetTextsMsg'), okLabel: t('cust.resetTexts') })) { OC.db.settings.labels[lang()] = {}; OC.save(); OC.renderShell(); } },
      /* imports */
      imp: d => { const sp = specById(d.id); if (sp) OC.importer.open(sp); },
      tpl: d => { const sp = specById(d.id); if (sp && sp.template) OC.xlsx.exportBook(`oneclick-${sp.id}-template.xlsx`, [{ name: sp.title(), aoa: sp.template() }]).catch(e => OC.toast(e.message, 'err')); },
      /* appearance & rules */
      lang: d => { OC.db.settings.lang = d.v; OC.save(); OC.applySettings(); OC.renderShell(); },
      theme: d => { OC.db.settings.theme = d.v; OC.save(); OC.applySettings(); OC.refresh(); },
      firstDay: d => { OC.db.settings.firstDay = Number(d.v); OC.save(); OC.refresh(); },
      maxOff: (d, el) => { const n = Math.round(Number(el.value)); if (n >= 1 && n <= 99) { OC.db.settings.maxOff = n; OC.save(); OC.toast(t('saved')); } else el.value = OC.db.settings.maxOff; },
      annualDays: (d, el) => { const n = Math.round(Number(el.value)); if (n >= 0 && n <= 365) { OC.db.settings.annualDays = n; OC.save(); OC.toast(t('saved')); } else el.value = OC.db.settings.annualDays; },
      weekend: d => { OC.db.settings.weekend = d.v; OC.save(); OC.refresh(); },
      leaveCount: d => { OC.db.settings.leaveCount = d.v; OC.save(); OC.refresh(); },
      /* data */
      async export() {
        try { OC.toast(t('settings.preparing'), 'info', 2500); const json = await OC.exportBackup(); OC.download(`oneclick-backup-${OC.util.today()}.json`, json, 'application/json'); OC.toast(t('settings.exported')); }
        catch (e) { console.error(e); OC.toast(t('err.generic'), 'err'); }
      },
      import: (d, el) => {
        const file = el.files && el.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            if (await OC.confirm({ title: t('settings.import'), message: t('settings.importMsg', { name: file.name }), okLabel: t('settings.import'), danger: false })) { await OC.importBackup(String(reader.result)); OC.applySettings(); OC.toast(t('settings.imported')); OC.renderShell(); }
          } catch (e) { console.error(e); OC.toast(t('settings.importErr'), 'err'); }
          el.value = '';
        };
        reader.readAsText(file);
      },
      async clearInv() { if (await OC.confirm({ title: t('inv.clear'), message: t('inv.clearMsg', { n: OC.fmtNum(OC.inv.st.stats.count) }), okLabel: t('inv.clear') })) { await OC.inv.clear(); OC.db.settings.invCols = null; OC.save(); OC.toast(t('deleted')); OC.refresh(); } },
      async sample() { if (await OC.confirm({ title: t('settings.loadSample'), message: t('settings.sampleMsg'), okLabel: t('settings.loadSample') })) { const s = OC.db.settings, us = OC.db.users; OC.resetData('sample'); OC.db.settings = s; OC.db.users = us; OC.save(); await OC.inv.importLegacy(OC.db.inventory); OC.db.settings.invCols = null; OC.save(); OC.applySettings(); OC.toast(t('settings.sampleLoaded')); OC.renderShell(); } },
      async wipe() { if (await OC.confirm({ title: t('settings.wipeBtn'), message: t('settings.wipeMsg'), okLabel: t('settings.wipeBtn') })) { const s = OC.db.settings, us = OC.db.users; OC.resetData('empty'); OC.db.settings = s; OC.db.users = us; OC.db.settings.invCols = null; OC.save(); await OC.inv.clear(); OC.toast(t('settings.wiped'), 'info'); OC.renderShell(); } }
    }
  };
})(window.OC);
