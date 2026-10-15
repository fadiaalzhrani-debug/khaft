/* OneClick · shell, hash router, event delegation, settings application */
window.OC = window.OC || {};
(function (OC) {
  'use strict';
  const t = (k, v) => OC.t(k, v), esc = OC.esc, I = OC.icon;
  const app = document.getElementById('app');
  let current = 'home', viewEl = null;

  const navModules = () => Object.values(OC.modules).filter(m => !m.hideInNav).sort((a, b) => a.order - b.order);

  /* ---------- shell ---------- */
  function shell() {
    app.innerHTML = `
      <aside class="sidebar" aria-label="${esc(t('nav'))}">
        <a class="brand" href="#/home"><span class="mark">${I('sparkles')}</span><span><b>OneClick</b><small data-team></small></span></a>
        <nav class="nav" data-nav-list></nav>
        <div class="side-foot"><b data-date></b><br/><span>${esc(t('footer'))}</span></div>
      </aside>
      <div class="scrim" data-scrim></div>
      <div class="main">
        <header class="topbar">
          <button class="ibtn menu-btn" data-menu aria-label="${esc(t('nav'))}">${I('menu')}</button>
          <div class="crumb"><span class="dot"></span><h1 data-title></h1></div>
          <div class="grow"></div>
          <div class="clock" aria-hidden="true"><b data-clock>--:--</b><small data-clock-date></small></div>
          <button class="ibtn txt" data-lang title="${esc(t('settings.lang'))}" aria-label="${esc(t('settings.lang'))}"></button>
          <button class="ibtn" data-theme-btn title="${esc(t('settings.theme'))}" aria-label="${esc(t('settings.theme'))}"></button>
          <a class="ibtn" href="#/settings" title="${esc(t('settings.title'))}" aria-label="${esc(t('settings.title'))}">${I('settings')}</a>
        </header>
        <main class="view" id="view"></main>
      </div>`;
    viewEl = document.getElementById('view');
    renderNav();
    app.querySelector('[data-menu]').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    app.querySelector('[data-scrim]').addEventListener('click', () => document.body.classList.remove('nav-open'));
    app.querySelector('[data-lang]').addEventListener('click', () => { OC.db.settings.lang = OC.db.settings.lang === 'ar' ? 'en' : 'ar'; OC.save(); OC.applySettings(); OC.render(); });
    app.querySelector('[data-theme-btn]').addEventListener('click', () => { OC.db.settings.theme = OC.db.settings.theme === 'light' ? 'dark' : 'light'; OC.save(); OC.applySettings(); OC.refresh(); });
    bindDelegation();
  }
  OC.renderNavCounts = () => { if (app.querySelector('[data-nav-list]')) renderNav(); };
  function renderNav() {
    const nav = app.querySelector('[data-nav-list]');
    nav.innerHTML = navModules().map(m => { const c = m.count ? m.count() : ''; return `<a href="#/${m.id}" class="${m.id === current ? 'active' : ''}" data-nav-link="${m.id}">${I(m.icon)}<span>${esc(m.title())}</span>${c ? `<span class="cnt">${esc(c)}</span>` : ''}</a>`; }).join('')
      + `<div class="sep"></div><a href="#/settings" class="${current === 'settings' ? 'active' : ''}" data-nav-link="settings">${I('settings')}<span>${esc(t('settings.title'))}</span></a>`;
  }
  function updateChrome() {
    const m = OC.modules[current];
    app.querySelector('[data-title]').textContent = m.title();
    app.querySelector('[data-team]').textContent = OC.db.settings.teamName || '';
    app.querySelector('[data-lang]').textContent = OC.db.settings.lang === 'ar' ? 'EN' : 'ع';
    app.querySelector('[data-theme-btn]').innerHTML = I(OC.db.settings.theme === 'light' ? 'moon' : 'sun');
    document.title = `${m.title()} · OneClick`;
    renderNav();
  }

  /* ---------- clock ---------- */
  function tick() {
    const d = new Date(), lang = OC.db.settings.lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB';
    const c = app.querySelector('[data-clock]'); if (!c) return;
    c.textContent = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(d);
    app.querySelector('[data-clock-date]').textContent = new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    app.querySelector('[data-date]').textContent = t('week.n', { n: OC.util.isoWeek(d).week }) + ' · ' + d.getFullYear();
  }

  /* ---------- settings ---------- */
  OC.applySettings = () => {
    const s = OC.db.settings;
    document.documentElement.lang = s.lang === 'ar' ? 'ar' : 'en';
    document.documentElement.dir = s.lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dataset.theme = s.theme === 'light' ? 'light' : 'dark';
    document.querySelector('meta[name=theme-color]').setAttribute('content', s.theme === 'light' ? '#edf4ef' : '#07110c');
    if (OC.bg) { OC.bg.setTheme(s.theme); OC.bg.setMode(s.bg === 'minimal' ? 'minimal' : '3d'); }
    const team = app.querySelector('[data-team]'); if (team) team.textContent = s.teamName || '';
  };

  /* ---------- router ---------- */
  function route() {
    const id = (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0];
    current = OC.modules[id] ? id : 'home';
    document.body.classList.remove('nav-open');
    OC.closeModals();
    OC.render();
    if (viewEl) { viewEl.classList.remove('anim'); void viewEl.offsetWidth; viewEl.classList.add('anim'); }
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }
  OC.route = { get id() { return current; } };
  OC.go = id => { location.hash = '#/' + id; };

  OC.render = () => {
    if (!viewEl) return;
    const m = OC.modules[current];
    viewEl.innerHTML = m.render();
    if (m.mount) m.mount(viewEl);
    updateChrome(); tick();
  };
  /* re-render while keeping the focused control (search boxes) and scroll position */
  OC.refresh = () => {
    const ae = document.activeElement; let sel = null;
    if (ae && viewEl && viewEl.contains(ae) && ae.matches('input,select,textarea')) sel = { key: ae.dataset.input || ae.dataset.change || ae.name, start: ae.selectionStart, end: ae.selectionEnd, id: ae.dataset.id };
    const y = window.scrollY;
    OC.render();
    window.scrollTo(0, y);
    if (sel && sel.key) {
      const el = viewEl.querySelector(`[data-input="${sel.key}"]${sel.id ? `[data-id="${sel.id}"]` : ''}, [data-change="${sel.key}"]${sel.id ? `[data-id="${sel.id}"]` : ''}, [name="${sel.key}"]`);
      if (el) { el.focus({ preventScroll: true }); try { if (sel.start != null && el.setSelectionRange) el.setSelectionRange(sel.start, sel.end); } catch (e) { /* ignore */ } }
    }
  };

  /* ---------- delegation ---------- */
  function run(name, el, ev) {
    const m = OC.modules[current]; const fn = m.actions && m.actions[name];
    if (!fn) { console.warn('OneClick: no action', name, 'in', current); return; }
    try { const r = fn(el.dataset, el, ev); if (r && r.catch) r.catch(err => { console.error(err); OC.toast(t('err.generic'), 'err'); }); }
    catch (err) { console.error(err); OC.toast(t('err.generic'), 'err'); }
  }
  function bindDelegation() {
    viewEl.addEventListener('click', e => {
      const el = e.target.closest('[data-act]'); if (!el || !viewEl.contains(el)) return;
      e.preventDefault(); run(el.dataset.act, el, e);
    });
    viewEl.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el) run(el.dataset.change, el, e); });
    viewEl.addEventListener('input', e => { const el = e.target.closest('[data-input]'); if (el) run(el.dataset.input, el, e); });
    viewEl.addEventListener('submit', e => { const f = e.target.closest('form[data-submit]'); if (!f) return; e.preventDefault(); run(f.dataset.submit, f, e); });
  }
  document.addEventListener('click', e => { const el = e.target.closest('[data-nav]'); if (el) { e.preventDefault(); OC.go(el.dataset.nav); } });

  /* ---------- keyboard shortcuts ---------- */
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName) || document.querySelector('.overlay');
    if (typing) return;
    if (e.key === '/') { const s = viewEl.querySelector('[data-input="q"]'); if (s) { e.preventDefault(); s.focus(); s.select(); } return; }
    if (e.key.toLowerCase() === 'h') { OC.go('home'); return; }
    const n = Number(e.key); if (n >= 1 && n <= 9) { const m = navModules()[n]; if (m) OC.go(m.id); }
  });

  /* ---------- boot ---------- */
  function boot() {
    OC.applySettings();
    OC.inv.init().then(() => { if (['home', 'settings'].includes(current)) OC.refresh(); else OC.renderNavCounts(); });
    shell();
    window.addEventListener('hashchange', route);
    route();
    setInterval(tick, 15000);
    if (OC.db._fresh) { delete OC.db._fresh; OC.save(); setTimeout(() => OC.toast(t('welcome'), 'info', 5000), 600); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.OC);
