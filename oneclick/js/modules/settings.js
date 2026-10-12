/* OneClick · Settings: identity, language, theme, background, backup & restore */
window.OC = window.OC || {};
OC.modules = OC.modules || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon;

  OC.modules.settings = {
    id: 'settings', icon: 'settings', order: 99, hideInNav: true,
    title: () => t('settings.title'), tagline: () => t('settings.tag'),
    render() {
      const s = OC.db.settings, db = OC.db;
      const counts = ['team', 'inventory', 'events', 'prints', 'vehicles', 'tasks', 'turnovers', 'ideas'].map(k => `${db[k].length} ${t('settings.c.' + k)}`).join(' · ');
      let size = 0; try { size = (localStorage.getItem(OC.storageKey) || '').length; } catch (e) { /* ignore */ }
      const setting = (title, hint, ctl) => `<div class="setting"><div><b>${esc(title)}</b><small>${esc(hint)}</small></div><div class="ctl">${ctl}</div></div>`;
      return `
      <div class="page-head"><div><h2>${esc(t('settings.title'))}</h2><p>${esc(t('settings.desc'))}</p></div></div>
      <div class="grid-2">
        <div class="card pad"><h3>${I('sparkles')}${esc(t('settings.appearance'))}</h3>
          ${setting(t('settings.teamName'), t('settings.teamNameHint'), `<input class="input" style="min-width:220px" data-change="teamName" value="${esc(s.teamName || '')}" aria-label="${esc(t('settings.teamName'))}"/>`)}
          ${setting(t('settings.lang'), t('settings.langHint'), OC.seg('lang', [{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }], s.lang))}
          ${setting(t('settings.theme'), t('settings.themeHint'), OC.seg('theme', [{ value: 'dark', label: t('settings.dark') }, { value: 'light', label: t('settings.light') }], s.theme))}
          ${setting(t('settings.bg'), t('settings.bgHint'), OC.seg('bg', [{ value: '3d', label: t('settings.bg3d') }, { value: 'minimal', label: t('settings.bgMin') }], s.bg || '3d'))}
          ${setting(t('settings.firstDay'), t('settings.firstDayHint'), OC.seg('firstDay', [{ value: '0', label: t('settings.sunday') }, { value: '1', label: t('settings.monday') }], String(s.firstDay || 0)))}
        </div>
        <div class="card pad"><h3>${I('database')}${esc(t('settings.data'))}</h3>
          <p class="muted small" style="margin-top:6px">${esc(t('settings.dataNote'))}</p>
          <p class="small mt"><b>${esc(counts)}</b> · ${esc(t('settings.size', { kb: (size / 1024).toFixed(1) }))}</p>
          ${setting(t('settings.backup'), t('settings.backupHint'), `<button class="btn" data-act="export">${I('download')}${esc(t('settings.export'))}</button><label class="btn">${I('upload')}${esc(t('settings.import'))}<input type="file" accept="application/json,.json" data-change="import" class="sr-only"/></label>`)}
          ${setting(t('settings.sample'), t('settings.sampleHint'), `<button class="btn" data-act="sample">${I('refresh')}${esc(t('settings.loadSample'))}</button>`)}
          ${setting(t('settings.wipe'), t('settings.wipeHint'), `<button class="btn danger" data-act="wipe">${I('trash')}${esc(t('settings.wipeBtn'))}</button>`)}
        </div>
      </div>
      <div class="card pad mt"><h3>${I('info')}${esc(t('settings.about'))}</h3><p class="muted small" style="margin-top:8px">${esc(t('settings.aboutText'))}</p>
        <p class="muted small mt"><b>${esc(t('settings.shortcuts'))}:</b> <kbd>Esc</kbd> ${esc(t('settings.kEsc'))} · <kbd>/</kbd> ${esc(t('settings.kSearch'))} · <kbd>1</kbd>–<kbd>8</kbd> ${esc(t('settings.kNav'))} · <kbd>H</kbd> ${esc(t('settings.kHome'))}</p></div>`;
    },
    actions: {
      teamName: (d, el) => { OC.db.settings.teamName = el.value.trim(); OC.save(); OC.applySettings(); },
      lang: d => { OC.db.settings.lang = d.v; OC.save(); OC.applySettings(); OC.render(); },
      theme: d => { OC.db.settings.theme = d.v; OC.save(); OC.applySettings(); OC.refresh(); },
      bg: d => { OC.db.settings.bg = d.v; OC.save(); OC.applySettings(); OC.refresh(); },
      firstDay: d => { OC.db.settings.firstDay = Number(d.v); OC.save(); OC.refresh(); },
      export: () => { OC.download(`oneclick-backup-${OC.util.today()}.json`, OC.exportJSON(), 'application/json'); OC.toast(t('settings.exported')); },
      import: (d, el) => {
        const file = el.files && el.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            if (await OC.confirm({ title: t('settings.import'), message: t('settings.importMsg', { name: file.name }), okLabel: t('settings.import'), danger: false })) { OC.importJSON(String(reader.result)); OC.applySettings(); OC.toast(t('settings.imported')); OC.render(); }
          } catch (e) { OC.toast(t('settings.importErr'), 'err'); }
          el.value = '';
        };
        reader.readAsText(file);
      },
      async sample() { if (await OC.confirm({ title: t('settings.loadSample'), message: t('settings.sampleMsg'), okLabel: t('settings.loadSample') })) { const s = OC.db.settings; OC.resetData('sample'); OC.db.settings = s; OC.save(); OC.applySettings(); OC.toast(t('settings.sampleLoaded')); OC.render(); } },
      async wipe() { if (await OC.confirm({ title: t('settings.wipeBtn'), message: t('settings.wipeMsg'), okLabel: t('settings.wipeBtn') })) { const s = OC.db.settings; OC.resetData('empty'); OC.db.settings = s; OC.save(); OC.toast(t('settings.wiped'), 'info'); OC.render(); } }
    }
  };
})(window.OC);
