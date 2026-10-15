/* OneClick · Settings: identity, language, theme, background, leave rules, Excel imports per section,
   backup & restore (including the large inventory table), sample data, wipe */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon;
  const allSpecs = () => Object.values(OC.modules).sort((a, b) => a.order - b.order).flatMap(m => (m.importSpecs || []).map(s => ({ s, m })));
  const specById = id => (allSpecs().find(x => x.s.id === id) || {}).s;

  OC.modules.settings = {
    id: 'settings', icon: 'settings', order: 99, hideInNav: true,
    title: () => t('settings.title'), tagline: () => t('settings.tag'),
    render() {
      const s = OC.db.settings, db = OC.db, inv = OC.inv.st;
      const counts = [`${OC.fmtNum(db.team.length)} ${t('settings.c.team')}`, `${OC.fmtNum(inv.stats.count)} ${t('settings.c.inventory')}`, `${db.courses.length} ${t('settings.c.courses')}`, `${db.leaves.length} ${t('settings.c.leaves')}`, `${db.events.length} ${t('settings.c.events')}`, `${db.vehicles.length} ${t('settings.c.vehicles')}`, `${db.tasks.length} ${t('settings.c.tasks')}`].join(' · ');
      let size = 0; try { size = (localStorage.getItem(OC.storageKey) || '').length; } catch (e) { /* ignore */ }
      const setting = (title, hint, ctl) => `<div class="setting"><div><b>${esc(title)}</b><small>${esc(hint)}</small></div><div class="ctl">${ctl}</div></div>`;
      return `
      <div class="page-head"><div><h2>${esc(t('settings.title'))}</h2><p>${esc(t('settings.desc'))}</p></div></div>
      <div class="card pad"><h3>${I('upload')}${esc(t('settings.imports'))}</h3><p class="muted small" style="margin-top:6px">${esc(t('settings.importsHint'))}</p>
        <div class="imp-hub mt">${allSpecs().map(({ s: sp }) => `<div class="imp-tile"><span class="t-ico">${I(sp.icon || 'file')}</span><div class="imp-tile-txt"><b>${esc(sp.title())}</b><small class="muted">${esc(t('settings.nNow', { n: OC.fmtNum(sp.count ? sp.count() : 0) }))}</small></div>
          <div class="row" style="gap:6px"><button class="btn sm ghost" data-act="tpl" data-id="${sp.id}" title="${esc(t('imp.template'))}" aria-label="${esc(t('imp.template'))}">${I('download')}</button><button class="btn sm primary" data-act="imp" data-id="${sp.id}">${I('upload')}${esc(t('imp.short'))}</button></div></div>`).join('')}</div></div>
      <div class="grid-2 mt">
        <div class="card pad"><h3>${I('sparkles')}${esc(t('settings.appearance'))}</h3>
          ${setting(t('settings.teamName'), t('settings.teamNameHint'), `<input class="input" style="min-width:220px" data-change="teamName" value="${esc(s.teamName || '')}" aria-label="${esc(t('settings.teamName'))}"/>`)}
          ${setting(t('settings.lang'), t('settings.langHint'), OC.seg('lang', [{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }], s.lang))}
          ${setting(t('settings.theme'), t('settings.themeHint'), OC.seg('theme', [{ value: 'dark', label: t('settings.dark') }, { value: 'light', label: t('settings.light') }], s.theme))}
          ${setting(t('settings.bg'), t('settings.bgHint'), OC.seg('bg', [{ value: '3d', label: t('settings.bg3d') }, { value: 'minimal', label: t('settings.bgMin') }], s.bg || '3d'))}
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
      imp: d => { const sp = specById(d.id); if (sp) OC.importer.open(sp); },
      tpl: d => { const sp = specById(d.id); if (sp && sp.template) OC.xlsx.exportBook(`oneclick-${sp.id}-template.xlsx`, [{ name: sp.title(), aoa: sp.template() }]).catch(e => OC.toast(e.message, 'err')); },
      teamName: (d, el) => { OC.db.settings.teamName = el.value.trim(); OC.save(); OC.applySettings(); },
      lang: d => { OC.db.settings.lang = d.v; OC.save(); OC.applySettings(); OC.render(); },
      theme: d => { OC.db.settings.theme = d.v; OC.save(); OC.applySettings(); OC.refresh(); },
      bg: d => { OC.db.settings.bg = d.v; OC.save(); OC.applySettings(); OC.refresh(); },
      firstDay: d => { OC.db.settings.firstDay = Number(d.v); OC.save(); OC.refresh(); },
      maxOff: (d, el) => { const n = Math.round(Number(el.value)); if (n >= 1 && n <= 99) { OC.db.settings.maxOff = n; OC.save(); OC.toast(t('saved')); } else el.value = OC.db.settings.maxOff; },
      annualDays: (d, el) => { const n = Math.round(Number(el.value)); if (n >= 0 && n <= 365) { OC.db.settings.annualDays = n; OC.save(); OC.toast(t('saved')); } else el.value = OC.db.settings.annualDays; },
      weekend: d => { OC.db.settings.weekend = d.v; OC.save(); OC.refresh(); },
      leaveCount: d => { OC.db.settings.leaveCount = d.v; OC.save(); OC.refresh(); },
      async export() {
        try { OC.toast(t('settings.preparing'), 'info', 2500); const json = await OC.exportBackup(); OC.download(`oneclick-backup-${OC.util.today()}.json`, json, 'application/json'); OC.toast(t('settings.exported')); }
        catch (e) { console.error(e); OC.toast(t('err.generic'), 'err'); }
      },
      import: (d, el) => {
        const file = el.files && el.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            if (await OC.confirm({ title: t('settings.import'), message: t('settings.importMsg', { name: file.name }), okLabel: t('settings.import'), danger: false })) { await OC.importBackup(String(reader.result)); OC.applySettings(); OC.toast(t('settings.imported')); OC.render(); }
          } catch (e) { console.error(e); OC.toast(t('settings.importErr'), 'err'); }
          el.value = '';
        };
        reader.readAsText(file);
      },
      async clearInv() { if (await OC.confirm({ title: t('inv.clear'), message: t('inv.clearMsg', { n: OC.fmtNum(OC.inv.st.stats.count) }), okLabel: t('inv.clear') })) { await OC.inv.clear(); OC.db.settings.invCols = null; OC.save(); OC.toast(t('deleted')); OC.refresh(); } },
      async sample() { if (await OC.confirm({ title: t('settings.loadSample'), message: t('settings.sampleMsg'), okLabel: t('settings.loadSample') })) { const s = OC.db.settings; OC.resetData('sample'); OC.db.settings = s; OC.save(); await OC.inv.importLegacy(OC.db.inventory); OC.db.settings.invCols = null; OC.save(); OC.applySettings(); OC.toast(t('settings.sampleLoaded')); OC.render(); } },
      async wipe() { if (await OC.confirm({ title: t('settings.wipeBtn'), message: t('settings.wipeMsg'), okLabel: t('settings.wipeBtn') })) { const s = OC.db.settings; OC.resetData('empty'); OC.db.settings = s; OC.db.settings.invCols = null; OC.save(); await OC.inv.clear(); OC.toast(t('settings.wiped'), 'info'); OC.render(); } }
    }
  };
})(window.OC);
