/*
 * دفتر حسابات المطعم — الواجهة
 * يعتمد على core.js (RB) وdemo.js. الحفظ: في المتصفح (localStorage)،
 * أو في قاعدة بيانات مشتركة عند فتحه كـ Artifact داخل Claude.
 */
(function () {
  'use strict';
  const RB = window.RB;
  const { r2, num } = RB;

  // ═════════════ الحالة ═════════════
  let S = RB.emptyState();
  let VER = 0;
  // save: حالة الحفظ الفعلية (pending عمليات لم تُؤكَّد بعد، failed رمز آخر فشل). readOnly: عرض فقط بلا صلاحية تعديل.
  // syncLost: انقطع التحديث المباشر. replacing: استيراد أو مسح جارٍ في البيانات المشتركة
  const APP = {
    mode: 'loading', demo: false, backend: null, savedAt: 0, real: null, warnedDemo: false,
    save: { pending: 0, failed: null }, canWrite: null, readOnly: false, syncLost: false, noStorage: false,
    replacing: false, replaceFailed: null, replaceStale: false, adopting: false, loadFailed: false,
  };
  const UI_KEY = 'rb-restaurant-ui';
  const ui = Object.assign(
    { page: 'dashboard', period: 'month', from: '', to: '', expCat: '', purCat: '', cashAcc: '1101', report: 'income', salesTab: 'days', staffTab: 'emp', rawTab: 'list' },
    safeJSON(lsGet(UI_KEY)) || {}
  );

  function lsGet(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }
  function lsSet(k, v) {
    try {
      localStorage.setItem(k, v);
      return true;
    } catch (e) {
      return false;
    }
  }
  function safeJSON(s) {
    try {
      return s ? JSON.parse(s) : null;
    } catch (e) {
      return null;
    }
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const saveUI = () => lsSet(UI_KEY, JSON.stringify(ui));
  const today = () => RB.todayISO();
  const minD = (a, b) => (a < b ? a : b);

  // ═════════════ التنسيق ═════════════
  const NF2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const NF0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  // وقت الحفظ بأرقام لاتينية مثل باقي الأرقام في البرنامج
  const TIMEF = new Intl.DateTimeFormat('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
  const fmt = (n) => NF2.format(r2(n) || 0);
  const fmt0 = (n) => NF0.format(Math.round(n) || 0);
  const fmtQ = (n) => {
    const v = Math.round((Number(n) || 0) * 1000) / 1000;
    return NF0.format(Math.trunc(v)) + (v % 1 ? String(Math.abs(v % 1).toFixed(3)).replace(/0+$/, '').slice(1) : '');
  };
  const pctT = (n, d) => (isFinite(n) ? (Number(n) || 0).toFixed(d === undefined ? 1 : d) : '—') + '%';
  const pct = (n, d) => `<span class="n">${pctT(n, d)}</span>`;
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const N = (n, cls) => `<span class="n ${cls || ''} ${r2(n) < 0 ? 'neg' : ''}">${fmt(n)}</span>`;
  const N0 = (n) => `<span class="n">${fmt0(n)}</span>`;
  const cur = () => esc(S.settings.currency || 'ر.س');
  // التاريخ غير الصالح (بيانات منقولة أو معيبة) يُعرض كما هو
  const dt = (iso) => {
    if (!iso) return '';
    if (!RB.isISODate(iso)) return esc(iso);
    const y = iso.slice(0, 4);
    const s = +iso.slice(8, 10) + ' ' + RB.MONTHS[+iso.slice(5, 7) - 1];
    return `<span class="dt">${s}${y !== today().slice(0, 4) ? ' ' + y : ''}</span>`;
  };
  const dtText = (iso) => (!iso ? '' : !RB.isISODate(iso) ? esc(iso) : +iso.slice(8, 10) + ' ' + RB.MONTHS[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4));
  const good = RB.good;
  // عدد السجلات في دفتر، وهل فيه بيانات حقيقية (بدأه أحد أو فيه سجلات)
  const countRecs = (st) => RB.SECTIONS.reduce((n, k) => n + (st && Array.isArray(st[k]) ? st[k].length : 0), 0);
  const shortId = (id) => (id.length > 24 ? id.slice(0, 24) + '…' : id);
  const hasBooks = (st) => !!st && ((RB.isObj(st.settings) && !!st.settings.startedAt) || countRecs(st) > 0);
  const chip = (t, k) => `<span class="chip ${k || ''}">${t}</span>`;

  // ═════════════ الفترة ═════════════
  const PERIODS = [
    ['month', 'هذا الشهر'],
    ['prev', 'الشهر الماضي'],
    ['3m', 'آخر 3 أشهر'],
    ['quarter', 'هذا الربع'],
    ['year', 'هذه السنة'],
    ['all', 'كل الفترات'],
    ['custom', 'فترة مخصصة'],
  ];
  let boundsCache = null;
  function dataBounds() {
    const t = today();
    if (boundsCache && boundsCache.v === VER && boundsCache.t === t) return boundsCache.b.slice();
    let lo = t;
    let hi = t;
    for (const k of RB.SECTIONS) for (const r of S[k]) if (r.date && !r._bad) {
      if (r.date < lo) lo = r.date;
      if (r.date > hi) hi = r.date;
    }
    // أول قيد قد يسبق أول تاريخ مسجل (مثل إيجار تبدأ تغطيته قبل تاريخ دفعه)
    const first = ledger(hi).entries[0];
    if (first && first.date < lo) lo = first.date;
    boundsCache = { v: VER, t, b: [lo, hi] };
    return [lo, hi];
  }
  function range() {
    const t = today();
    const ym = t.slice(0, 7);
    switch (ui.period) {
      case 'prev': {
        const p = RB.ymAdd(ym, -1);
        return [p + '-01', RB.monthEnd(p)];
      }
      case '3m':
        return [RB.ymAdd(ym, -2) + '-01', RB.monthEnd(ym)];
      case 'quarter': {
        const q = Math.floor((+ym.slice(5, 7) - 1) / 3) * 3 + 1;
        const s = ym.slice(0, 5) + String(q).padStart(2, '0');
        return [s + '-01', RB.monthEnd(RB.ymAdd(s, 2))];
      }
      case 'year':
        return [ym.slice(0, 4) + '-01-01', ym.slice(0, 4) + '-12-31'];
      case 'all':
        return dataBounds();
      case 'custom':
        // من وإلى بأي ترتيب (حالة محفوظة قديمة): الأصغر ثم الأكبر، لا الشهر الجاري
        if (RB.isISODate(ui.from) && RB.isISODate(ui.to)) return ui.from <= ui.to ? [ui.from, ui.to] : [ui.to, ui.from];
        return [ym + '-01', RB.monthEnd(ym)];
      default:
        return [ym + '-01', RB.monthEnd(ym)];
    }
  }
  // الفترة مقطوعة عند اليوم: للقوائم والأرصدة، فلا يُحمّل إهلاك أو مصروف لأشهر لم تأتِ بعد
  function rangeToDate() {
    const [from, to] = range();
    return [from, minD(to, today())];
  }
  const inRange = (d) => {
    const [a, b] = range();
    return d >= a && d <= b;
  };
  function periodLabel() {
    const [a, b] = range();
    const t = today();
    if (b > t && a <= t) return dtText(a) + ' — حتى ' + dtText(t);
    if (a.slice(0, 7) === b.slice(0, 7) && a.endsWith('-01') && b === RB.monthEnd(b.slice(0, 7))) return RB.monthName(a.slice(0, 7));
    return dtText(a) + ' — ' + dtText(b);
  }

  // دفتر القيود محفوظ مؤقتاً حتى يتغير شيء
  const ledgerCache = {};
  function ledger(asOf) {
    const k = VER + '|' + asOf;
    if (!ledgerCache[k]) {
      for (const key of Object.keys(ledgerCache)) delete ledgerCache[key];
      ledgerCache[k] = RB.buildLedger(S, asOf);
    }
    return ledgerCache[k];
  }
  let costCache = null;
  function costing() {
    if (!costCache || costCache.v !== VER) costCache = { v: VER, c: RB.costing(S) };
    return costCache.c;
  }

  // ═════════════ الحفظ ═════════════
  // في المتصفح: كل تعديل عملية في قائمة انتظار تُطبَّق عند الحفظ على آخر نسخة مخزنة (لا على نسخة هذه النافذة)،
  // فلا تمحو نافذةٌ تعديلات نافذة أخرى، والنافذة الخاملة لا تكتب شيئاً. ونافذة أخرى تحفظ فتتحدث هذه
  class LocalBackend {
    constructor() {
      this.kind = 'local';
      this.key = 'rb-restaurant-books-v1';
      this.t = null;
      this.pending = []; // {op: 'put'|'del'|'settings', section, rec|id|s}
      this.raw = null; // آخر نص قرأته هذه النافذة أو كتبته
    }
    async load() {
      this.raw = lsGet(this.key);
      return safeJSON(this.raw);
    }
    // تطبيق العمليات المنتظرة على نسخة من الدفتر (بالمعرّف)
    apply(st) {
      for (const p of this.pending) {
        if (p.op === 'settings') st.settings = clone(p.s);
        else if (p.op === 'put') {
          const arr = st[p.section];
          const i = arr.findIndex((x) => String(x.id) === String(p.rec.id));
          if (i >= 0) arr[i] = clone(p.rec);
          else arr.push(clone(p.rec));
        } else if (p.op === 'del') st[p.section] = st[p.section].filter((x) => String(x.id) !== String(p.id));
      }
      return st;
    }
    write(json) {
      if (!lsSet(this.key, json)) {
        APP.save.failed = 'local';
        updateSaveStatus();
        toast('تعذّر الحفظ في هذا المتصفح. صدّر نسخة احتياطية من الإعدادات الآن.', 'bad');
        return false;
      }
      this.raw = json;
      APP.save.failed = null;
      APP.savedAt = Date.now();
      updateSaveStatus();
      return true;
    }
    flush() {
      clearTimeout(this.t);
      this.t = null;
      if (APP.demo || !this.pending.length) return true;
      const cur = lsGet(this.key);
      // لم يتغير المخزن منذ آخر قراءة: نسخة هذه النافذة = المخزن + تعديلاتها. وإلا فالتعديلات فوق أحدث نسخة مخزنة
      const merged = cur !== this.raw;
      const base = merged ? this.apply(RB.normalize(safeJSON(cur) || S)) : S;
      if (!this.write(JSON.stringify(base))) return false;
      this.pending = [];
      if (merged) {
        S = base;
        bump();
        scheduleRender();
      }
      return true;
    }
    schedule() {
      clearTimeout(this.t);
      this.t = setTimeout(() => this.flush(), 200);
    }
    put(section, rec) {
      this.pending.push({ op: 'put', section, rec: clone(rec) });
      this.schedule();
    }
    del(section, id) {
      this.pending.push({ op: 'del', section, id });
      this.schedule();
    }
    saveSettings(s) {
      this.pending.push({ op: 'settings', s: clone(s) });
      this.schedule();
    }
    // استبدال الدفتر كله (البداية، الاستيراد، المسح): يُكتب كما هو وتُلغى العمليات المنتظرة
    async replaceAll(state) {
      clearTimeout(this.t);
      this.t = null;
      this.pending = [];
      return this.write(JSON.stringify(state));
    }
    // حفظ من نافذة أخرى لنفس الدفتر: تتحدث هذه النافذة (مع إبقاء تعديلاتها المنتظرة والنموذج المفتوح)
    subscribe(cb) {
      window.addEventListener('storage', (e) => {
        if (e.key !== null && e.key !== this.key) return;
        const nv = e.key === null ? lsGet(this.key) : e.newValue;
        if (nv === this.raw) return;
        if (nv === null) {
          clearTimeout(this.t);
          this.t = null;
          this.pending = [];
          this.raw = null;
          toast('تم مسح الدفتر من نافذة أخرى');
          openBooks(null);
          return;
        }
        const d = safeJSON(nv);
        if (!d) return;
        this.raw = nv;
        const fresh = this.apply(RB.normalize(d));
        let changed = cb('settings', fresh.settings);
        for (const k of RB.SECTIONS) changed = cb(k, fresh[k]) || changed;
        if (changed) toast('تحدّثت البيانات من نافذة أخرى');
      });
    }
  }

  // رموز الأخطاء التي لا يُصلحها إعادة الاشتراك (db.d.ts)
  const DB_TERMINAL = ['revoked', 'invalid_argument', 'resource_exhausted', 'not_granted', 'capability_disabled', 'capability_removed', 'transform_error'];
  // سجل من مستند: المعرّف من مسار المستند لا من محتواه
  const docRec = (d) => Object.assign(clone(d.data() || {}), { id: d.id });
  // رمز فشل الحفظ: invalid_argument محجوز لمن لا يملك صلاحية التعديل (عرض فقط)، وغيره سجل غير صالح أو كبير
  const failCode = (code) => (code === 'invalid_argument' ? 'invalid' : code || 'error');
  // رسالة عربية لخطأ البيانات المشتركة (لا تُعرض رسائل المنصة الإنجليزية)
  function dbErrMsg(e) {
    if (e instanceof TypeError) return 'معرّف سجل غير صالح';
    switch (e && e.code) {
      case 'quota_exceeded':
        return 'امتلأت مساحة البيانات المشتركة. صدّر نسخة احتياطية واحذف سجلات قديمة.';
      case 'invalid_argument':
      case 'transform_error':
        return APP.readOnly ? 'ليست لديك صلاحية تعديل هذه البيانات.' : 'تعذّر الحفظ: السجل غير صالح أو أكبر من الحجم المسموح.';
      case 'invalid_id':
        return 'معرّف سجل غير صالح';
      case 'revoked':
        return 'توقف الوصول إلى البيانات المشتركة. أعد تحميل الصفحة.';
      case 'not_granted':
      case 'capability_disabled':
      case 'capability_removed':
        return 'البيانات المشتركة غير متاحة في هذه الصفحة.';
      case 'resource_exhausted':
        return 'طلبات كثيرة على البيانات المشتركة. انتظر قليلاً ثم أعد المحاولة.';
      default:
        return 'تعذّر الحفظ في البيانات المشتركة (انقطاع مؤقت). أعد المحاولة بعد قليل.';
    }
  }

  class CloudBackend {
    constructor(db) {
      this.kind = 'cloud';
      this.db = db;
      this.q = {};
      this.subs = {};
    }
    async load() {
      // الإعدادات وكل المجموعات معاً لا واحدة بعد الأخرى (فتح أسرع). ولكل قراءة إعادة محاولة عند الانقطاع المؤقت
      // أو الحد المؤقت لعدد الطلبات، فلا يُفشل خطأ عابر القراءة (التحقق قبل البداية والاستيراد يعتمد عليها)
      const [st, ...snaps] = await Promise.all([
        this.retry(() => this.db.doc('config/settings').get()),
        ...RB.SECTIONS.map((k) => this.retry(() => this.db.collection(k).get())),
      ]);
      const out = { settings: st.exists ? clone(st.data()) : null };
      RB.SECTIONS.forEach((k, i) => (out[k] = snaps[i].docs.map(docRec)));
      if (!out.settings && RB.SECTIONS.every((k) => !out[k].length)) return null;
      out.settings = out.settings || {};
      return out;
    }
    // مستمع لكل مجموعة: إن انقطع لسبب مؤقت يُعاد تشغيله وحده (لقطة جديدة تعيد الحالة كاملة)،
    // وإن كان السبب نهائياً أو تكرر أكثر من 5 مرات فتنبيه دائم بأن التحديث المباشر انقطع
    subscribe(cb) {
      const add = (key, ref, deliver) => {
        this.subs[key] = { ref, deliver, unsub: null, tries: 0, timer: null, dead: false };
        this.listen(key);
      };
      add('settings', () => this.db.doc('config/settings'), (s) => s.exists && cb('settings', clone(s.data())));
      for (const k of RB.SECTIONS) add(k, () => this.db.collection(k), (snap) => cb(k, snap.docs.map(docRec)));
    }
    listen(key) {
      const s = this.subs[key];
      try {
        s.unsub = s.ref().onSnapshot(
          (snap) => {
            s.tries = 0;
            try {
              s.deliver(snap);
            } catch (e) {
              console.error(e);
            }
          },
          (e) => this.onErr(key, e)
        );
      } catch (e) {
        this.onErr(key, e);
      }
    }
    onErr(key, e) {
      const s = this.subs[key];
      if (!s || s.dead) return;
      try {
        if (s.unsub) s.unsub();
      } catch (x) {
        /* انتهى أصلاً */
      }
      s.unsub = null;
      const code = e && e.code;
      s.tries++;
      if (DB_TERMINAL.includes(code) || s.tries > 5) {
        s.dead = true;
        // كل المستمعين قد ينقطعون معاً: يُعاد الرسم مرة واحدة لكل تغيّر في الحالة
        const ro = code === 'revoked' && !APP.readOnly;
        if (APP.syncLost && !ro) return;
        APP.syncLost = true;
        if (ro) APP.readOnly = true;
        render();
        return;
      }
      clearTimeout(s.timer);
      s.timer = setTimeout(() => this.listen(key), 1000 * s.tries + Math.random() * 1500);
    }
    async retry(fn) {
      for (let i = 0; ; i++) {
        try {
          return await fn();
        } catch (e) {
          const code = e && e.code;
          if ((code === 'resource_exhausted' || code === 'unavailable') && i < 6) {
            await new Promise((r) => setTimeout(r, 700 * (i + 1) + Math.random() * 400));
            continue;
          }
          throw e;
        }
      }
    }
    // عمليات المستند الواحد متتالية لا تتداخل (حفظ عادي واستيراد)
    chain(path, fn) {
      const p = (this.q[path] || Promise.resolve()).then(() => this.retry(fn));
      this.q[path] = p.catch(() => {});
      return p;
    }
    write(path, fn, section) {
      APP.save.pending++;
      updateSaveStatus();
      return this.chain(path, fn)
        .then(() => {
          APP.save.failed = null;
          APP.savedAt = Date.now();
        })
        .catch((e) => this.failed(e, section))
        .finally(() => {
          APP.save.pending--;
          updateSaveStatus();
        });
    }
    failed(e, section) {
      const code = e && e.code;
      // رفض الكتابة لمن لم تحدد المنصة صلاحيته: عرض فقط بقية الزيارة، ويُعاد القسم من البيانات المشتركة (لا يبقى سجل وهمي)
      if (code === 'invalid_argument' && APP.canWrite !== true) {
        APP.save.failed = code;
        APP.readOnly = true;
        toast('ليست لديك صلاحية تعديل هذه البيانات.', 'bad');
        this.resync(section);
        return;
      }
      APP.save.failed = failCode(code || (e instanceof TypeError ? 'invalid_id' : 'error'));
      toast(dbErrMsg(e), 'bad');
    }
    async resync(section) {
      try {
        if (section === 'settings') {
          const d = await this.db.doc('config/settings').get();
          if (d.exists) onRemote('settings', clone(d.data()));
        } else if (section) {
          const snap = await this.db.collection(section).get();
          onRemote(section, snap.docs.map(docRec));
        }
      } catch (e) {
        /* يبقى ما في الشاشة */
      }
      render();
    }
    put(section, rec) {
      const body = clone(rec);
      return this.write(section + '/' + rec.id, () => this.db.collection(section).doc(rec.id).set(body), section);
    }
    del(section, id) {
      return this.write(section + '/' + id, () => this.db.collection(section).doc(id).delete(), section);
    }
    saveSettings(settings) {
      const body = clone(settings);
      return this.write('config/settings', () => this.db.doc('config/settings').set(body), 'settings');
    }
    // استبدال الدفتر المشترك كله: علامة config/replace أثناء العملية، ثم كتابة كل السجلات، ثم حذف القديمة،
    // ثم الإعدادات أخيراً. أي فشل يوقف الباقي، والإعادة آمنة (تكتب نفس الشيء). يرجع {ok, failed, code}
    async replaceAll(state, progress) {
      const bad = RB.badIds(state);
      if (bad.length) return { ok: false, failed: countRecs(state) + 1, code: 'invalid_id', badIds: bad };
      const fail = (e) => ({ ok: false, failed: countRecs(state) + 1, code: (e && e.code) || (e instanceof TypeError ? 'invalid_id' : 'error') });
      const sets = [];
      const dels = [];
      try {
        await this.retry(() => this.db.doc('config/replace').set({ status: 'running', at: new Date().toISOString() }));
        // السجلات القديمة لكل المجموعات تُقرأ معاً
        const snaps = await Promise.all(RB.SECTIONS.map((k) => this.retry(() => this.db.collection(k).get())));
        RB.SECTIONS.forEach((k, i) => {
          const snap = snaps[i];
          const keep = new Set(state[k].map((r) => r.id));
          snap.docs.forEach((d) => {
            if (!keep.has(d.id)) dels.push([k + '/' + d.id, () => this.db.collection(k).doc(d.id).delete()]);
          });
          state[k].forEach((r) => {
            const body = clone(r);
            sets.push([k + '/' + r.id, () => this.db.collection(k).doc(r.id).set(body)]);
          });
        });
      } catch (e) {
        return fail(e);
      }
      const st = clone(state.settings);
      const total = sets.length + dels.length + 1;
      const run = { done: 0, failed: false, code: null };
      if (progress) progress(0, total);
      const phase = async (jobs) => {
        const worker = async () => {
          while (jobs.length && !run.failed) {
            const [path, fn] = jobs.shift();
            try {
              await this.chain(path, fn);
              run.done++;
              if (progress) progress(run.done);
            } catch (e) {
              run.failed = true;
              run.code = (e && e.code) || (e instanceof TypeError ? 'invalid_id' : 'error');
            }
          }
        };
        await Promise.all([worker(), worker(), worker()]);
      };
      await phase(sets);
      if (!run.failed) await phase(dels);
      if (!run.failed) await phase([['config/settings', () => this.db.doc('config/settings').set(st)]]);
      if (run.failed) return { ok: false, failed: total - run.done, code: run.code };
      try {
        await this.retry(() => this.db.doc('config/replace').delete());
      } catch (e) {
        /* تبقى العلامة فيظهر تنبيه في الزيارة القادمة */
      }
      APP.savedAt = Date.now();
      return { ok: true, failed: 0 };
    }
  }

  function persistPut(section, rec) {
    if (APP.demo) return demoNote();
    APP.backend.put(section, rec);
  }
  function persistDel(section, id) {
    if (APP.demo) return demoNote();
    APP.backend.del(section, id);
  }
  function persistSettings() {
    if (APP.demo) return demoNote();
    APP.backend.saveSettings(S.settings);
  }
  function demoNote() {
    if (APP.warnedDemo) return;
    APP.warnedDemo = true;
    toast('أنت في وضع التجربة: التعديلات تظهر الآن لكنها لا تُحفظ.');
  }
  // عرض فقط: لا يتغير شيء في الدفتر (وضع التجربة مستثنى لأنه لا يُحفظ)
  const RO_MSG = 'عرض فقط — ليست لديك صلاحية تعديل دفتر المطعم';
  function roBlock() {
    if (!APP.readOnly || APP.demo) return false;
    toast(RO_MSG, 'bad');
    return true;
  }

  function bump() {
    VER++;
    costCache = null;
  }
  const find = (section, id) => S[section].find((x) => String(x.id) === String(id));
  function upsert(section, rec) {
    if (roBlock()) return false;
    // العلامة تُحسب من جديد: السجل المصحح يخرج من «سجلات تحتاج تصحيح»
    delete rec._bad;
    rec = RB.sanitizeRecord(section, rec) || rec;
    const arr = S[section];
    const i = arr.findIndex((x) => String(x.id) === String(rec.id));
    if (i >= 0) arr[i] = rec;
    else arr.push(rec);
    bump();
    persistPut(section, rec);
  }
  function remove(section, id) {
    if (roBlock()) return false;
    S[section] = S[section].filter((x) => String(x.id) !== String(id));
    bump();
    persistDel(section, id);
  }
  function saveSettings() {
    bump();
    if (APP.readOnly && !APP.demo) return;
    persistSettings();
  }

  // ═════════════ أدوات الواجهة ═════════════
  function toast(msg, kind) {
    const el = document.getElementById('toast');
    if (!el) return;
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    el.appendChild(t);
    setTimeout(() => t.classList.add('out'), 4200);
    setTimeout(() => t.remove(), 4700);
  }

  function openModal(o) {
    const root = document.getElementById('modals');
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.innerHTML = `<div class="dialog ${o.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="dlg-t-${VER}"><header class="dlg-h"><h3 id="dlg-t-${VER}">${esc(o.title)}</h3><button type="button" class="icon-btn" data-close aria-label="إغلاق">✕</button></header><div class="dlg-b"></div><footer class="dlg-f"></footer></div>`;
    root.appendChild(wrap);
    const prevFocus = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape' && root.lastElementChild === wrap) close();
    };
    function close() {
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      if (o.onClose) o.onClose();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    }
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) close();
    });
    return { el: wrap, body: wrap.querySelector('.dlg-b'), foot: wrap.querySelector('.dlg-f'), close };
  }

  function confirmBox(msg, opt) {
    opt = opt || {};
    return new Promise((resolve) => {
      let done = false;
      const m = openModal({ title: opt.title || 'تأكيد', onClose: () => !done && resolve(false) });
      m.body.innerHTML = `<p class="confirm-msg">${msg}</p>`;
      m.foot.innerHTML = `<button type="button" class="btn ${opt.danger ? 'danger' : 'primary'}" data-ok>${esc(opt.ok || 'نعم')}</button><button type="button" class="btn ghost" data-close>إلغاء</button>`;
      m.foot.querySelector('[data-ok]').addEventListener('click', () => {
        done = true;
        resolve(true);
        m.close();
      });
      m.foot.querySelector('[data-ok]').focus();
    });
  }

  function infoBox(title, html, wide) {
    const m = openModal({ title, wide });
    m.body.innerHTML = html;
    m.foot.innerHTML = `<button type="button" class="btn ghost" data-close>إغلاق</button>`;
    afterRender(m.body);
    return m;
  }

  // ─── محرك النماذج: أي عنصر فيه data-path يرتبط بالقيمة ───
  function getPath(o, p) {
    return p.split('.').reduce((a, k) => (a === undefined || a === null ? undefined : a[k]), o);
  }
  function setPath(o, p, v) {
    const ks = p.split('.');
    // مسار من معرّف خارجي لا يصل إلى النموذج الأولي للكائنات
    if (ks.some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype')) return;
    let a = o;
    for (let i = 0; i < ks.length - 1; i++) {
      if (a[ks[i]] === undefined || a[ks[i]] === null || typeof a[ks[i]] !== 'object') a[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {};
      a = a[ks[i]];
    }
    a[ks[ks.length - 1]] = v;
  }
  function readInput(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.dataset.type === 'num') return el.value === '' ? '' : parseFloat(el.value);
    return el.value;
  }
  let FID = 0;
  function optionsHTML(opts, v) {
    return opts.map((o) => {
      const [val, label] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(val)}" ${String(val) === String(v === undefined ? '' : v) ? 'selected' : ''}>${esc(label)}</option>`;
    }).join('');
  }
  function fieldHTML(f, val) {
    // live: الحقل يُرسم دائماً ويُخفى أو يظهر مع كل إدخال (بلا إعادة رسم النموذج، فلا ينقطع إدخال التاريخ بلوحة المفاتيح)
    if (f.show && !f.show(val) && !f.live) return '';
    if (f.type === 'row') return `<div class="frow">${f.fields.map((x) => fieldHTML(x, val)).join('')}</div>`;
    if (f.type === 'html') return `<div class="fhtml">${f.html(val)}</div>`;
    if (f.type === 'section') return `<h4 class="fsec">${esc(f.label)}</h4>`;
    if (f.type === 'lines') return linesHTML(f, val);
    // get: القيمة المعروضة حين تُشتق من حقول أخرى ما لم يحددها المستخدم
    const v = f.get ? f.get(val) : getPath(val, f.k);
    const id = 'f' + ++FID;
    const rd = f.redraw ? 'data-redraw="1"' : '';
    const lab = `<label for="${id}">${esc(f.label)}${f.req ? ' <b class="req">*</b>' : ''}</label>`;
    let inp;
    switch (f.type) {
      case 'select': {
        const opts = typeof f.options === 'function' ? f.options(val) : f.options;
        inp = `<select id="${id}" data-path="${f.k}" ${rd}>${optionsHTML(opts, v)}</select>`;
        break;
      }
      case 'check':
        return `<div class="field check ${f.cls || ''}" data-k="${f.k}" ${f.live && f.show && !f.show(val) ? 'hidden' : ''}><label class="checkl"><input id="${id}" type="checkbox" data-path="${f.k}" ${rd} ${v ? 'checked' : ''}><span>${esc(f.label)}</span></label>${f.help ? `<small>${f.help}</small>` : ''}</div>`;
      case 'textarea':
        inp = `<textarea id="${id}" data-path="${f.k}" rows="2">${esc(v)}</textarea>`;
        break;
      case 'num':
      case 'money':
        inp = `<input id="${id}" type="number" inputmode="decimal" step="${f.step || 'any'}" ${f.min !== undefined ? `min="${f.min}"` : ''} data-type="num" data-path="${f.k}" value="${v === undefined || v === null ? '' : esc(v)}" ${f.req ? 'required' : ''} ${rd}>`;
        break;
      default:
        inp = `<input id="${id}" type="${f.type || 'text'}" data-path="${f.k}" value="${esc(v)}" ${f.list ? `list="${id}l"` : ''} ${f.req ? 'required' : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} ${rd}>${f.list ? `<datalist id="${id}l">${f.list(val).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}`;
    }
    return `<div class="field ${f.cls || ''}" data-k="${f.k}">${lab}${inp}${f.help ? `<small>${f.help}</small>` : ''}</div>`;
  }
  function linesHTML(f, val) {
    const rows = getPath(val, f.k) || [];
    const head = f.cols.map((c) => `<th class="${c.num ? 'num' : ''} ${c.cls || ''}" ${c.w ? `style="width:${c.w}"` : ''}>${esc(c.label)}</th>`).join('');
    const body = rows
      .map((r, i) => {
        const cells = f.cols
          .map((c) => {
            const p = `${f.k}.${i}.${c.k}`;
            const rd = c.redraw ? 'data-redraw="1"' : '';
            const aria = `aria-label="${esc(c.label)} ${i + 1}"`;
            let h;
            if (c.calc) h = `<span class="calc n" data-calc="${f.k}|${i}|${c.k}">${c.calc(r, val)}</span>`;
            else if (c.type === 'select') h = `<select data-path="${p}" ${rd} ${aria}>${optionsHTML(c.options(r, val), r[c.k])}</select>`;
            else if (c.type === 'num') h = `<input type="number" inputmode="decimal" step="any" data-type="num" data-path="${p}" value="${r[c.k] === undefined || r[c.k] === null ? '' : esc(r[c.k])}" ${aria}>`;
            else if (c.type === 'static') h = `<span>${esc(c.text ? c.text(r, val) : r[c.k])}</span>`;
            else h = `<input type="text" data-path="${p}" value="${esc(r[c.k])}" ${aria}>`;
            // extra: عناصر إضافية في الخلية تُرسم مع النموذج؛ hint: سطر توضيح يتحدث مع كل إدخال
            if (c.extra) h += c.extra(r, i, val);
            if (c.hint) h += `<small class="lhint" data-hint="${f.k}|${i}|${c.k}">${c.hint(r, val)}</small>`;
            return `<td class="${c.num ? 'num' : ''} ${c.cls || ''}">${h}</td>`;
          })
          .join('');
        return `<tr>${cells}<td class="act"><button type="button" class="icon-btn" data-lact="del" data-lk="${f.k}" data-i="${i}" aria-label="حذف السطر ${i + 1}">✕</button></td></tr>`;
      })
      .join('');
    return `<div class="field lines ${f.cls || ''}"><div class="lines-h"><label>${esc(f.label)}</label>${(f.tools || []).map((t) => `<button type="button" class="btn ghost sm" data-ltool="${t.id}" data-lk="${f.k}">${esc(t.label)}</button>`).join('')}</div>
      <div class="tbl-wrap"><table class="lines-tbl"><thead><tr>${head}<th></th></tr></thead><tbody>${body || `<tr><td colspan="${f.cols.length + 1}" class="empty">${esc(f.empty || 'لا توجد أسطر بعد')}</td></tr>`}</tbody></table></div>
      ${f.foot ? `<div class="lines-foot" data-lfoot="${f.k}">${f.foot(val)}</div>` : ''}
      <button type="button" class="btn ghost sm add-line" data-lact="add" data-lk="${f.k}">+ ${esc(f.addLabel || 'إضافة سطر')}</button>${f.help ? `<small>${f.help}</small>` : ''}</div>`;
  }
  function flatFields(fields) {
    const out = [];
    for (const f of fields) {
      if (f.type === 'row') out.push(...flatFields(f.fields));
      else out.push(f);
    }
    return out;
  }

  function formModal(o) {
    const val = clone(o.value || {});
    const m = openModal({ title: o.title, wide: o.wide });
    const fields = () => (typeof o.fields === 'function' ? o.fields(val) : o.fields);
    let saving = false;
    function draw() {
      const sc = m.body.scrollTop;
      m.body.innerHTML = `<form class="form" novalidate>${fields().map((f) => fieldHTML(f, val)).join('')}<div class="form-preview" ${o.preview ? '' : 'hidden'}></div><button type="submit" hidden></button></form>`;
      m.body.scrollTop = sc;
      upd();
    }
    // المعاينة والحسابات المساعدة لا توقف النموذج إن فشلت (سجل بتاريخ غير صالح يُفتح للتصحيح)
    const safeHTML = (f) => {
      try {
        return f();
      } catch (e) {
        console.warn(e);
        return '';
      }
    };
    function upd() {
      const lf = flatFields(fields()).filter((f) => f.type === 'lines');
      for (const f of lf) {
        m.body.querySelectorAll(`[data-calc^="${f.k}|"]`).forEach((el) => {
          const [, i, ck] = el.dataset.calc.split('|');
          const c = f.cols.find((x) => x.k === ck);
          const row = (getPath(val, f.k) || [])[+i];
          if (c && row) el.innerHTML = safeHTML(() => c.calc(row, val));
        });
        m.body.querySelectorAll(`[data-hint^="${f.k}|"]`).forEach((el) => {
          const [, i, ck] = el.dataset.hint.split('|');
          const c = f.cols.find((x) => x.k === ck);
          const row = (getPath(val, f.k) || [])[+i];
          if (c && c.hint && row) el.innerHTML = safeHTML(() => c.hint(row, val));
        });
        const ft = m.body.querySelector(`[data-lfoot="${f.k}"]`);
        if (ft && f.foot) ft.innerHTML = safeHTML(() => f.foot(val));
      }
      for (const f of flatFields(fields())) {
        if (!f.live || !f.show) continue;
        const fe = m.body.querySelector(`.field[data-k="${f.k}"]`);
        if (fe) fe.hidden = !f.show(val);
      }
      // مربعات الاختيار المشتقة (get) تتبع الحقول التي تُشتق منها ما لم يحددها المستخدم صراحة
      for (const f of flatFields(fields())) {
        if (f.type !== 'check' || !f.get) continue;
        const el = m.body.querySelector(`input[type="checkbox"][data-path="${f.k}"]`);
        if (el) el.checked = !!f.get(val);
      }
      const pv = m.body.querySelector('.form-preview');
      if (pv && o.preview) pv.innerHTML = safeHTML(() => o.preview(val));
    }
    function onField(e, isChange) {
      const el = e.target;
      const p = el.dataset && el.dataset.path;
      if (!p) return;
      setPath(val, p, readInput(el));
      el.closest('.field') && el.closest('.field').classList.remove('invalid');
      if (o.onChange) o.onChange(p, val);
      if (isChange && el.dataset.redraw) draw();
      else upd();
    }
    m.el.addEventListener('input', (e) => onField(e, false));
    m.el.addEventListener('change', (e) => {
      if (e.target.dataset && e.target.dataset.redraw) onField(e, true);
    });
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lact],[data-ltool]');
      if (!b) return;
      const f = flatFields(fields()).find((x) => x.k === b.dataset.lk);
      if (!f) return;
      const rows = getPath(val, f.k) || [];
      if (b.dataset.lact === 'add') rows.push(f.newRow ? f.newRow(val) : {});
      else if (b.dataset.lact === 'del') rows.splice(+b.dataset.i, 1);
      else {
        const t = (f.tools || []).find((x) => x.id === b.dataset.ltool);
        if (t) t.run(val, rows);
      }
      setPath(val, f.k, rows);
      draw();
      if (b.dataset.lact === 'add') {
        const trs = m.body.querySelectorAll(`[data-path^="${f.k}.${rows.length - 1}."]`);
        if (trs[0]) trs[0].focus();
      }
    });
    async function submit() {
      if (saving) return;
      let bad = null;
      for (const f of flatFields(fields())) {
        if (!f.req || (f.show && !f.show(val))) continue;
        const v = getPath(val, f.k);
        if (v === '' || v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
          const fe = m.body.querySelector(`.field[data-k="${f.k}"]`);
          if (fe) fe.classList.add('invalid');
          bad = bad || f;
        }
      }
      if (bad) {
        toast('أكمل الحقل: ' + bad.label, 'bad');
        const fe = m.body.querySelector(`.field[data-k="${bad.k}"] input, .field[data-k="${bad.k}"] select`);
        if (fe) fe.focus();
        return;
      }
      saving = true;
      try {
        const res = await o.onSave(val);
        if (typeof res === 'string') {
          toast(res, 'bad');
          return;
        }
        if (res === false) return; // ألغى المستخدم التأكيد: يبقى النموذج مفتوحاً
        m.close();
        render();
        if (o.done) toast(o.done);
      } finally {
        saving = false;
      }
    }
    m.el.addEventListener('submit', (e) => {
      e.preventDefault();
      submit();
    });
    m.foot.innerHTML = `<button type="button" class="btn primary" data-save>${esc(o.ok || 'حفظ')}</button><button type="button" class="btn ghost" data-close>إلغاء</button>${o.extra || ''}`;
    m.foot.querySelector('[data-save]').addEventListener('click', submit);
    draw();
    const first = m.body.querySelector('input:not([type=checkbox]),select,textarea');
    if (first && !o.noFocus) first.focus();
    return m;
  }

  // ─── جداول وأقسام ───
  function table(cols, rows, o) {
    o = o || {};
    if (!rows.length) return `<div class="empty-box">${o.empty || 'لا توجد بيانات في هذه الفترة.'}</div>`;
    const head = cols.map((c) => `<th class="${c.num ? 'num' : ''} ${c.cls || ''}">${c.h}</th>`).join('');
    const body = rows
      .map((r) => `<tr ${o.rowCls ? `class="${o.rowCls(r)}"` : ''}>${cols.map((c) => `<td class="${c.num ? 'num' : ''} ${c.cls || ''}">${c.f(r)}</td>`).join('')}</tr>`)
      .join('');
    const foot = o.foot ? `<tfoot><tr>${o.foot.map((x, i) => `<td class="${cols[i] && cols[i].num ? 'num' : ''}">${x}</td>`).join('')}</tr></tfoot>` : '';
    return `<div class="tbl-wrap"><table class="tbl ${o.cls || ''}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
  }
  function card(title, body, o) {
    o = o || {};
    return `<section class="card ${o.cls || ''}">${title ? `<div class="card-h"><div><h3>${title}</h3>${o.sub ? `<p class="sub">${o.sub}</p>` : ''}</div>${o.actions ? `<div class="card-a">${o.actions}</div>` : ''}</div>` : ''}<div class="card-b">${body}</div></section>`;
  }
  function kpi(label, value, sub, state) {
    return `<div class="kpi ${state || ''}"><div class="kpi-l">${label}</div><div class="kpi-v">${value}</div>${sub ? `<div class="kpi-s">${sub}</div>` : ''}</div>`;
  }
  const money = (n) => `<span class="money">${N(n)} <small class="cur">${cur()}</small></span>`;
  const btn = (label, act, attrs, kind) => `<button type="button" class="btn ${kind || ''}" data-act="${act}" ${attrs || ''}>${label}</button>`;
  const rowActs = (s, id, extra) =>
    `<div class="row-acts">${extra || ''}<button type="button" class="icon-btn" data-act="edit" data-s="${s}" data-id="${esc(id)}" aria-label="تعديل" title="تعديل">✎</button><button type="button" class="icon-btn" data-act="dup" data-s="${s}" data-id="${esc(id)}" aria-label="نسخ" title="نسخ">⧉</button><button type="button" class="icon-btn danger" data-act="del" data-s="${s}" data-id="${esc(id)}" aria-label="حذف" title="حذف">✕</button></div>`;
  function hbars(items, o) {
    o = o || {};
    if (!items.length) return `<div class="empty-box">${o.empty || 'لا توجد بيانات.'}</div>`;
    const max = Math.max(...items.map((x) => Math.abs(x.v)), 1);
    const total = o.total !== undefined ? o.total : items.reduce((s, x) => s + Math.max(x.v, 0), 0);
    return `<div class="hbars">${items
      .map(
        (x) => `<div class="hbar" data-tip="${esc(x.label)}: ${fmt(x.v)} ${esc(S.settings.currency)}${total ? ' · ' + pctT((x.v / total) * 100) : ''}"><span class="hb-l">${esc(x.label)}</span><span class="hb-t"><i style="width:${Math.max((Math.abs(x.v) / max) * 100, 0.5).toFixed(2)}%"></i></span><span class="hb-v">${N(x.v)}${total ? `<small>${pct((x.v / total) * 100, 0)}</small>` : ''}</span></div>`
      )
      .join('')}</div>`;
  }
  function tabs(id, items, active) {
    return `<div class="tabs" role="tablist">${items.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === active}" class="tab ${k === active ? 'on' : ''}" data-act="tab" data-tab="${id}" data-v="${k}">${l}</button>`).join('')}</div>`;
  }
  function pageHead(title, sub, actions) {
    return `<div class="page-h"><div><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${actions ? `<div class="page-a">${actions}</div>` : ''}</div>`;
  }
  const payOptions = (withPayable, withPartners) => {
    const o = [['bank', RB.PAY_LABEL.bank], ['cash', RB.PAY_LABEL.cash]];
    if (withPayable) o.push(['payable', RB.PAY_LABEL.payable]);
    if (withPartners !== false) S.partners.forEach((p) => o.push(['partner:' + p.id, 'دفعها ' + p.name + ' من حسابه']));
    return o;
  };
  const vatPreview = (amount, includesVat, taxable, date) => {
    const v = RB.vatSplit(amount, includesVat, taxable, S.settings);
    const reg = RB.isVatReg(S.settings, date || today());
    return `<div class="pv-grid"><div><span>قبل الضريبة</span>${money(v.net)}</div><div><span>الضريبة ${taxable ? pct(S.settings.vatRate, 0) : '(غير خاضعة)'}</span>${money(v.vat)}</div><div><span>الإجمالي المدفوع</span>${money(v.gross)}</div></div>${taxable && !reg ? '<p class="note">المطعم غير مسجل في الضريبة، فتُحسب الضريبة ضمن التكلفة.</p>' : ''}`;
  };

  // ═════════════ الرسوم البيانية ═════════════
  const CHARTS = {};
  let chartN = 0;
  function chartSlot(data) {
    const id = 'chart' + ++chartN;
    CHARTS[id] = data;
    return `<div class="chart" id="${id}" role="img" aria-label="${esc(data.label || '')}"></div>`;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }
  function drawColumns(el, d) {
    const W = Math.max(el.clientWidth, 260);
    const H = d.h || 210;
    const pl = 52;
    const pr = 8;
    const pt = 14;
    const pb = 26;
    const pts = d.points;
    const max = niceMax(Math.max(...pts.map((p) => p.v), 0));
    const n = pts.length || 1;
    const band = (W - pl - pr) / n;
    const bw = Math.max(Math.min(24, band - 2), 1.5);
    const y = (v) => pt + (1 - v / max) * (H - pt - pb);
    const y0 = y(0);
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      const yy = y(v);
      g += `<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}" class="grid"/><text x="${pl - 8}" y="${yy + 4}" text-anchor="end" class="ax">${fmt0(v)}</text>`;
    }
    const every = Math.max(1, Math.ceil(n / Math.floor((W - pl) / 44)));
    let bars = '';
    let labels = '';
    pts.forEach((p, i) => {
      const x = pl + i * band + (band - bw) / 2;
      const yy = y(Math.max(p.v, 0));
      const h = y0 - yy;
      const r = Math.min(4, bw / 2, h);
      if (h > 0.3) bars += `<path class="bar ${p.hl ? 'hl' : ''}" d="M${x},${y0} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${y0} Z"/>`;
      bars += `<rect class="hit" x="${pl + i * band}" y="${pt}" width="${band}" height="${H - pt - pb}" data-tip="${esc(p.tip)}"/>`;
      if (i % every === 0) labels += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" class="ax">${esc(p.label)}</text>`;
    });
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" dir="ltr">${g}<line x1="${pl}" x2="${W - pr}" y1="${y0}" y2="${y0}" class="base"/>${bars}${labels}</svg>`;
  }
  function afterRender(scope) {
    (scope || document).querySelectorAll('.chart').forEach((el) => {
      const d = CHARTS[el.id];
      if (d) drawColumns(el, d);
    });
  }

  // ═════════════ الصفحات ═════════════
  const NAV = [
    ['نظرة عامة', [['dashboard', 'لوحة المتابعة']]],
    ['التأسيس', [['partners', 'الشركاء ورأس المال'], ['assets', 'الأصول والأثاث']]],
    ['المصاريف', [['expenses', 'المصاريف التشغيلية'], ['gov', 'الرسوم الحكومية والاشتراكات'], ['staff', 'العمال والرواتب'], ['purchases', 'المشتريات']]],
    ['المنيو والتكلفة', [['raw', 'المواد الخام'], ['composites', 'المنتجات المجمّعة'], ['products', 'المنيو والتسعير']]],
    ['المبيعات والنقد', [['sales', 'المبيعات اليومية'], ['cash', 'الصندوق والبنك']]],
    ['التقارير', [['reports', 'التقارير المالية'], ['settings', 'الإعدادات والنسخ الاحتياطي']]],
  ];
  const PAGE_TITLES = Object.fromEntries(NAV.flatMap((g) => g[1]));
  const PAGES = {};
  // اسم صفحة من الرابط أو من حالة محفوظة: صفحاتنا فقط، لا خصائص الكائنات الموروثة (#constructor، #toString…)
  const hasOwn = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  const isPage = (p) => hasOwn(PAGES, p);

  // ─── لوحة المتابعة ───
  PAGES.dashboard = () => {
    const [from, to] = range();
    const asOf = minD(to, today());
    const L = ledger(asOf);
    const inc = RB.incomeStatement(S, from, asOf, L);
    const sales = RB.salesByChannel(S, from, asOf);
    const bal = RB.balances(L.entries, null, asOf);
    const target = num(S.settings.targetFoodCost);
    const fcState = !inc.revenue ? '' : inc.ratios.foodCost > target + 3 ? 'warn' : 'good';
    const primeState = !inc.revenue ? '' : inc.ratios.prime > 65 ? 'bad' : inc.ratios.prime > 60 ? 'warn' : 'good';
    const vatBal = -(bal['2102'] || 0);
    let h = pageHead('لوحة المتابعة', `${esc(S.settings.name)} · ${periodLabel()}`, btn('+ إقفال يومي', 'add', 'data-s="sales"', 'primary') + btn('+ فاتورة مشتريات', 'add', 'data-s="purchases"') + btn('+ مصروف', 'add', 'data-s="expenses"'));
    h += `<div class="kpis">
      ${kpi('المبيعات شاملة الضريبة', money(sales.total.gross), `${fmt0(sales.total.orders)} طلب · متوسط الفاتورة ${fmt(sales.total.avgTicket)}`)}
      ${kpi('صافي الربح', money(inc.net), `هامش ${pct(inc.ratios.netMargin)} من المبيعات بدون الضريبة`, inc.net < 0 ? 'bad' : inc.revenue ? 'good' : '')}
      ${kpi('تكلفة المواد', pct(inc.ratios.foodCost), `المستهدف ${pct(target, 0)} · ${fmt(inc.tot.cogs)} ${cur()}`, fcState)}
      ${kpi('التكلفة الأساسية', pct(inc.ratios.prime), 'المواد + العمالة · الأفضل أقل من 60%', primeState)}
    </div>`;
    h += `<div class="kpis small">
      ${kpi('الصندوق (الكاشير)', money(bal['1101'] || 0), 'حتى ' + dtText(asOf), (bal['1101'] || 0) < 0 ? 'bad' : '')}
      ${kpi('الحساب البنكي', money(bal['1102'] || 0), 'حتى ' + dtText(asOf), (bal['1102'] || 0) < 0 ? 'bad' : '')}
      ${kpi('مستحقات التطبيقات', money(bal['1103'] || 0), 'لم تُحوَّل للبنك بعد')}
      ${kpi(vatBal >= 0 ? 'ضريبة مستحقة للهيئة' : 'ضريبة مستردة', money(Math.abs(vatBal)), 'الرصيد المتراكم حتى ' + dtText(asOf))}
    </div>`;
    // المبيعات اليومية أو الشهرية
    const days = RB.daysBetween(from, to) + 1;
    let pts = [];
    if (days <= 93) {
      for (let d = from; d <= to; d = RB.addDays(d, 1)) {
        const v = sales.days[d] || 0;
        pts.push({ label: String(+d.slice(8, 10)), v, tip: `${dtText(d)}: ${fmt(v)} ${S.settings.currency}`, hl: d === today() });
      }
    } else {
      const m = {};
      for (const d of Object.keys(sales.days)) m[d.slice(0, 7)] = (m[d.slice(0, 7)] || 0) + sales.days[d];
      for (let ym = from.slice(0, 7); ym <= to.slice(0, 7); ym = RB.ymAdd(ym, 1)) pts.push({ label: RB.MONTHS[+ym.slice(5, 7) - 1].slice(0, 3), v: m[ym] || 0, tip: `${RB.monthName(ym)}: ${fmt(m[ym] || 0)} ${S.settings.currency}` });
    }
    const best = Object.entries(sales.days).sort((a, b) => b[1] - a[1])[0];
    h += card(days <= 93 ? 'المبيعات اليومية' : 'المبيعات الشهرية', sales.total.gross ? chartSlot({ points: pts, label: 'المبيعات اليومية شاملة الضريبة' }) : `<div class="empty-box">لا توجد مبيعات مسجلة في هذه الفترة. سجّل أول إقفال يومي من زر «إقفال يومي».</div>`, {
      sub: best ? `شاملة الضريبة · أعلى يوم ${dtText(best[0])} بمبلغ ${fmt(best[1])} ${cur()}` : 'شاملة الضريبة',
    });
    // القنوات وتوزيع المصاريف
    const chItems = sales.list.map((c) => ({ label: c.name, v: c.gross }));
    const typeTot = { cash: 0, card: 0, app: 0 };
    sales.list.forEach((c) => (typeTot[c.type] = (typeTot[c.type] || 0) + c.gross));
    const typeLine = sales.total.gross ? `كاش ${pct((typeTot.cash / sales.total.gross) * 100, 0)} · شبكة ${pct((typeTot.card / sales.total.gross) * 100, 0)} · تطبيقات ${pct((typeTot.app / sales.total.gross) * 100, 0)}` : '';
    const gItems = Object.keys(RB.GROUPS).map((g) => ({ label: RB.GROUPS[g], v: inc.tot[g] })).filter((x) => x.v);
    h += `<div class="grid2">${card('المبيعات حسب القناة', hbars(chItems, { empty: 'لا توجد مبيعات.' }), { sub: typeLine })}${card('أين ذهبت الإيرادات؟', hbars(gItems, { total: inc.revenue, empty: 'لا توجد مصاريف في هذه الفترة.' }), { sub: `النسبة من المبيعات بدون الضريبة (${fmt(inc.revenue)} ${cur()})` })}</div>`;
    // التنبيهات
    h += card('تنبيهات تحتاج متابعة', alertsHTML(asOf), { sub: 'تجديدات، ضريبة، أسعار، وأرصدة' });
    return h;
  };

  const lastBackupText = () => {
    const at = Date.parse(ui.lastBackupAt || '');
    if (!isFinite(at)) return 'لم تُؤخذ بعد';
    const d = new Date(at);
    return dtText(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')) + ' ' + TIMEF.format(d);
  };
  // تذكير النسخ الاحتياطي للحفظ في المتصفح: عمر آخر نسخة بالأيام إن مضى عليها أكثر من 14 يوماً (−1: لم تُؤخذ)، وإلا null
  function backupAge() {
    if (APP.demo || !APP.backend || APP.backend.kind !== 'local' || !countRecs(S)) return null;
    const at = Date.parse(ui.lastBackupAt || '');
    if (!isFinite(at)) return -1;
    return Date.now() - at > 14 * 86400000 ? Math.floor((Date.now() - at) / 86400000) : null;
  }
  function alertsHTML(asOf) {
    const out = [];
    const bad = badRecords(asOf);
    if (bad.length) out.push(['bad', `سجلات تحتاج تصحيح: <span class="n">${bad.length}</span> — لا تدخل في الحسابات حتى تُصحَّح${fixList(bad, true)}`, '']);
    const bk = backupAge();
    if (bk !== null) out.push(['warn', `${bk < 0 ? 'لم تُؤخذ نسخة احتياطية بعد' : `آخر نسخة احتياطية قبل <span class="n">${bk}</span> يوم`} — مسح بيانات المتصفح يمسح الدفتر`, btn('صدّر الآن', 'backup', '', 'sm')]);
    for (const r of RB.renewals(S, today())) {
      if (r.status === 'ok') continue;
      const name = (r.rec.desc || RB.expenseCat(r.rec.category).name) + (r.rec.entity ? ' — ' + r.rec.entity : '') + empName(r.rec.employeeId, ' · ');
      out.push([r.status === 'expired' ? 'bad' : 'warn', r.status === 'expired' ? `انتهى: ${esc(name)} منذ ${-r.days} يوم` : `يحتاج تجديد: ${esc(name)} خلال ${r.days} يوم (${dtText(r.end)})`, renewActs(r)]);
    }
    // إقرارات الضريبة: كل فترة منتهية لم تُسدد وفات موعدها، وآخر فترة منتهية ما زال موعدها قائماً
    if (S.settings.vatRegistered) {
      const t = today();
      const ended = RB.vatReturns(S, t, ledger(t)).filter((p) => p.to < t);
      const deadline = (p) => RB.monthEnd(RB.ymAdd(p.to.slice(0, 7), 1));
      const payBtn = (p) => btn('سجّل السداد', 'add', `data-s="vatPayments" data-x="${esc(p.label)}"`, 'sm');
      for (const p of ended) if (!p.settled && deadline(p) < t) out.push(['bad', `إقرار ${esc(p.label)}: المتبقي ${fmt(p.remaining)} ${cur()} — فات موعده`, payBtn(p)]);
      const last = ended[ended.length - 1];
      if (last && deadline(last) >= t) {
        if (!last.settled) out.push(['warn', `إقرار ضريبة ${esc(last.label)}: المستحق ${fmt(last.remaining)} ${cur()} — آخر موعد ${dtText(deadline(last))}`, payBtn(last)]);
        else if (last.credit > 0) out.push(['warn', `إقرار ضريبة ${esc(last.label)}: لا يوجد مبلغ للسداد، ولك رصيد دائن ${fmt(last.credit)} ${cur()} يُرحّل أو يُطلب استرداده. قدّم الإقرار قبل ${dtText(deadline(last))}.`, btn('تقرير الضريبة', 'report', 'data-v="vat"', 'sm')]);
      }
    } else {
      // غير المسجل: حد التسجيل من مبيعات آخر 12 شهراً أو المتوقعة لسنة إن كان التشغيل أقل من سنة
      const th = RB.vatThreshold(S, today());
      const vatBtn = btn('إعدادات الضريبة', 'settings', 'data-v="vat"', 'sm');
      if (th && th.level === 'mandatory') out.push(['bad', 'مبيعاتك (آخر 12 شهراً أو المتوقعة للـ12 شهراً القادمة) ' + fmt(th.est) + ' ر.س تجاوزت حد التسجيل الإلزامي في ضريبة القيمة المضافة (375,000 ر.س) — يجب التسجيل لدى هيئة الزكاة والضريبة والجمارك خلال 30 يوماً، ثم فعّل التسجيل في الإعدادات مع تاريخ السريان.', vatBtn]);
      else if (th && th.level === 'voluntary') out.push(['warn', 'تجاوزت حد التسجيل الاختياري (187,500 ر.س) — يمكنك التسجيل واسترداد ضريبة المشتريات.', vatBtn]);
    }
    const C = costing();
    const target = num(S.settings.targetFoodCost);
    const high = S.products.filter((p) => p.active !== false && num(p.price) > 0 && RB.productStats(S, p, C).foodCost > target + 5);
    if (high.length) out.push(['warn', `${high.length} من أصناف المنيو تكلفتها أعلى من المستهدف بأكثر من 5 نقاط: ${high.slice(0, 4).map((p) => esc(p.name)).join('، ')}${high.length > 4 ? '…' : ''}`, btn('راجع التسعير', 'go', 'data-v="products"', 'sm')]);
    if (C.errors.some((e) => e.path)) out.push(['bad', 'يوجد تداخل دائري في وصفة: منتج يحتوي نفسه. افتح المنتجات المجمّعة وصحّح المكونات.', '']);
    const bal = RB.balances(ledger(asOf).entries, null, asOf);
    if ((bal['1101'] || 0) < -0.5) out.push(['bad', 'رصيد الصندوق بالسالب: سجّلت مصروفات نقدية أكثر من الكاش الموجود. راجع الإقفالات والتحويلات.', btn('كشف الصندوق', 'go', 'data-v="cash"', 'sm')]);
    if ((bal['1102'] || 0) < -0.5) out.push(['bad', 'رصيد البنك بالسالب: تأكد من تسجيل إيداعات رأس المال والتحويلات.', btn('كشف البنك', 'go', 'data-v="cash"', 'sm')]);
    for (const a of RB.appReceivables(S, asOf)) {
      if (a.balance > 1 && (!a.lastPayout || RB.daysBetween(a.lastPayout, asOf) > 14)) out.push(['warn', `${esc(a.name)}: مستحقات ${fmt(a.balance)} ${cur()} ولم يُسجَّل تحويل منذ ${a.lastPayout ? RB.daysBetween(a.lastPayout, asOf) + ' يوم' : 'البداية'}`, btn('سجّل تحويل', 'add', `data-s="payouts" data-x="${esc(a.id)}"`, 'sm')]);
    }
    const shares = RB.sum(S.partners, (p) => num(p.share));
    if (S.partners.length && Math.abs(shares - 100) > 0.01) out.push(['warn', `مجموع نسب الشركاء ${fmt(shares)}% وليس 100%.`, btn('الشركاء', 'go', 'data-v="partners"', 'sm')]);
    out.push(...eosbAlerts(false));
    if (!out.length) return `<div class="empty-box ok">كل شيء تمام — لا تنبيهات حالياً.</div>`;
    return alertsUL(out);
  }
  // ─── سجلات تحتاج تصحيح: تاريخ ناقص أو غير صالح (_bad)، أو فشل حسابها في الدفتر أو التكلفة ───
  const SECTION_NAME = {
    partners: 'شريك', capital: 'حركة رأس مال', assets: 'أصل', expenses: 'مصروف', employees: 'موظف', payroll: 'مسير رواتب',
    raw: 'مادة خام', purchases: 'فاتورة مشتريات', supplierPayments: 'سداد مورد', composites: 'منتج مجمّع', products: 'صنف في المنيو',
    sales: 'إقفال يومي', payouts: 'تحويل تطبيق', transfers: 'تحويل بين الصندوق والبنك', stockCounts: 'جرد', vatPayments: 'سداد ضريبة',
  };
  const FIELD_NAME = { date: 'التاريخ', startDate: 'بداية التغطية', endDate: 'تاريخ ترك العمل', month: 'الشهر' };
  function badRecords(asOf) {
    const out = [];
    const seen = new Set();
    const push = (section, rec, why) => {
      const k = section + '|' + rec.id;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ section, rec, why });
    };
    for (const k of RB.SECTIONS)
      for (const x of S[k])
        if (x._bad) push(k, x, x._bad.map((f) => `${k === 'employees' && f === 'startDate' ? 'تاريخ المباشرة' : FIELD_NAME[f] || f} ${x[f] ? '«' + x[f] + '» غير صالح' : 'ناقص'}`).join('، '));
    for (const e of ledger(asOf || today()).errors.concat(costing().errors.filter((x) => x.section))) {
      const rec = e.id !== undefined && e.id !== '' && find(e.section, e.id);
      if (rec) push(e.section, rec, 'تعذّر حسابه');
    }
    return out;
  }
  const recLabel = (x) => {
    const t = x.name || x.desc || x.supplier || x.entity || x.note || '';
    return t + (num(x.amount) ? (t ? ' · ' : '') + fmt(x.amount) : '');
  };
  // قائمة السجلات مع «تصحيح» و«حذف» لكل منها (withSection: يُذكر نوع السجل)
  const fixList = (list, withSection) =>
    `<ul class="fix-list">${list
      .slice(0, 30)
      .map((b) => `<li><span>${withSection ? `<b>${esc(SECTION_NAME[b.section] || b.section)}</b>: ` : ''}${esc(recLabel(b.rec) || b.rec.id)} — ${esc(b.why)}</span><span class="al-a">${btn('تصحيح', 'edit', `data-s="${esc(b.section)}" data-id="${esc(b.rec.id)}"`, 'sm')}${btn('حذف', 'del', `data-s="${esc(b.section)}" data-id="${esc(b.rec.id)}"`, 'sm ghost')}</span></li>`)
      .join('')}</ul>${list.length > 30 ? `<p class="note">و${list.length - 30} سجل آخر.</p>` : ''}`;
  // صندوق «بحاجة لتصحيح» في صفحة القسم (asOf: تاريخ دفتر الصفحة، فلا يُبنى دفتر آخر)
  const fixCard = (section, asOf) => {
    const list = badRecords(asOf).filter((b) => b.section === section);
    return list.length ? card('بحاجة لتصحيح', fixList(list, false), { cls: 'fix', sub: 'سجلات بتاريخ ناقص أو غير صالح: لا تدخل في الحسابات ولا في القوائم حتى تصححها أو تحذفها.' }) : '';
  };
  const alertsUL = (out) => `<ul class="alerts">${out.map(([k, t, a]) => `<li class="al ${k}"><span class="al-dot" aria-hidden="true"></span><span class="al-t">${t}</span>${a}</li>`).join('')}</ul>`;
  // مخصص نهاية خدمة لم يُسوَّ: من ترك العمل ولم تُسجَّل مكافأته ولا أنه لا مكافأة له (يبقى التزاماً حتى ذلك)،
  // و(في صفحة العمال فقط: all) المتوقف بلا تاريخ ترك العمل
  function eosbAlerts(all) {
    return RB.eosbUnsettled(S, today())
      .filter((u) => all || u.reason === 'pending')
      .map((u) => {
        const e = u.employee;
        const edit = btn('بيانات الموظف', 'edit', `data-s="employees" data-id="${esc(e.id)}"`, 'sm ghost');
        if (u.reason === 'noEnd') return ['warn', `${esc(e.name)} متوقف بلا «تاريخ ترك العمل»، ومخصص نهاية الخدمة له ${fmt(u.amount)} ${cur()} باقٍ في الالتزامات. إن ترك العمل فحدّد تاريخه لتُسوّى مكافأته.`, `<span class="al-a">${edit}</span>`];
        return [
          'warn',
          `${esc(e.name)} ترك العمل في ${dtText(e.endDate)} ولم تُسوَّ مكافأة نهاية الخدمة: مخصصه ${fmt(u.amount)} ${cur()} باقٍ في الالتزامات. سجّل المكافأة المصروفة له، أو اختر في بياناته «لا مكافأة مستحقة».`,
          `<span class="al-a">${btn('سجّل المكافأة', 'add', `data-s="payroll" data-x="${esc(e.id)}"`, 'sm')}${edit}</span>`,
        ];
      });
  }
  const EMP_STATUS = { active: 'على رأس العمل', left: 'ترك العمل', stopped: 'متوقف', future: 'لم يباشر بعد' };
  // زرّا متابعة التجديد: تجديد البند، أو إيقاف متابعته (رسم لن يتكرر)
  const renewActs = (r) => `<span class="al-a">${btn('تجديد', 'renew', `data-id="${esc(r.rec.id)}"`, 'sm')}${btn('إيقاف المتابعة', 'stopRenew', `data-id="${esc(r.rec.id)}"`, 'sm ghost')}</span>`;
  const empName = (id, pre) => {
    const e = id && S.employees.find((x) => x.id === id);
    return e ? (pre || '') + esc(e.name) : '';
  };

  // ─── الشركاء ورأس المال ───
  PAGES.partners = () => {
    const [from, asOf] = rangeToDate();
    const uses = RB.capitalUses(S, ledger('9999-12-31'));
    const rep = RB.partnersReport(S, from, asOf, ledger(asOf));
    let h = pageHead('الشركاء ورأس المال', 'رأس المال التأسيسي، مساهمة كل شريك، ونصيبه من الأرباح', btn('+ شريك', 'add', 'data-s="partners"') + btn('+ إيداع رأس مال', 'add', 'data-s="capital" data-x="contribution"', 'primary') + btn('+ سحب شريك', 'add', 'data-s="capital" data-x="withdrawal"'));
    h += card(
      'حصص الشركاء',
      table(
        [
          { h: 'الشريك', f: (r) => `<b>${esc(r.name)}</b>` },
          { h: 'النسبة المتفق عليها', num: 1, f: (r) => pct(r.sharePct, 0) },
          { h: 'إجمالي مساهمته', num: 1, f: (r) => N(r.contributed) },
          { h: 'منها دفعها مباشرة', num: 1, f: (r) => N(r.direct) },
          { h: 'المطلوب حسب نسبته', num: 1, f: (r) => N(r.required) },
          { h: 'الفرق', num: 1, f: (r) => (Math.abs(r.diff) < 0.5 ? '—' : `${N(r.diff)} ${r.diff > 0 ? chip('زيادة', 'good') : chip('ناقص', 'warn')}`) },
          { h: 'المسحوبات', num: 1, f: (r) => N(r.drawings) },
          { h: 'نصيبه من ربح الفترة', num: 1, f: (r) => N(r.profitPeriod) },
          { h: 'رصيد حقوقه', num: 1, f: (r) => N(r.equity) },
          { h: '', f: (r) => rowActs('partners', r.id) },
        ],
        rep.rows,
        { empty: 'أضف الشركاء أولاً مع نسبة كل شريك.', foot: ['الإجمالي', pct(rep.totalShare, 0), N(rep.totalCap), '', '', '', N(RB.sum(rep.rows, (r) => r.drawings)), N(rep.net), N(RB.sum(rep.rows, (r) => r.equity)), ''] }
      ),
      { sub: `ربح الفترة يوزّع حسب النسب (${periodLabel()}). «رصيد حقوقه» = مساهمته − مسحوباته + نصيبه من الأرباح المتراكمة.` }
    );
    const useItems = uses.assets.map((a) => ({ label: a.name, v: a.amount }));
    if (uses.preopen.expenses) useItems.push({ label: 'مصاريف قبل الافتتاح (إيجار، رسوم، تأمين…)', v: uses.preopen.expenses });
    if (uses.preopen.purchases) useItems.push({ label: 'مشتريات المخزون الافتتاحي', v: uses.preopen.purchases });
    if (uses.preopen.payroll) useItems.push({ label: 'رواتب قبل الافتتاح', v: uses.preopen.payroll });
    h += `<div class="grid2">${card(
      'أين ذهب رأس المال التأسيسي؟',
      `<div class="pv-grid three"><div><span>إجمالي رأس المال</span>${money(uses.sources)}</div><div><span>المصروف على التأسيس</span>${money(uses.used)}</div><div><span>المتبقي كرأس مال عامل</span>${money(uses.remaining)}</div></div>` +
        (uses.vatRecoverable > 0.005 ? `<p class="note">منها ضريبة مدخلات تُسترد بخصمها من ضريبة المبيعات: <b class="n">${fmt(uses.vatRecoverable)}</b> ${cur()}</p>` : '') +
        (uses.owedAtOpen > 0.005 ? `<p class="note">منها مستحق للموردين بالآجل لم يُسدد حتى الافتتاح: <b class="n">${fmt(uses.owedAtOpen)}</b> ${cur()} (مخصوم من المتبقي)</p>` : '') +
        (uses.laterAssets.count > 0 ? `<p class="note">أصول اشتُريت بعد الافتتاح (غير محسوبة من رأس المال التأسيسي): <b class="n">${fmt(uses.laterAssets.amount)}</b> ${cur()}</p>` : '') +
        hbars(useItems, { total: uses.sources }),
      { sub: uses.open ? `حسب الأصول وما صُرف قبل تاريخ الافتتاح (${dtText(uses.open)})` : 'حدّد تاريخ الافتتاح في الإعدادات لفصل مصاريف ما قبل الافتتاح.' }
    )}${card(
      'حركة رأس المال',
      table(
        [
          { h: 'التاريخ', f: (r) => dt(r.date) },
          { h: 'الشريك', f: (r) => esc((S.partners.find((p) => p.id === r.partnerId) || {}).name || '—') },
          { h: 'النوع', f: (r) => (r.type === 'withdrawal' ? chip('سحب', 'warn') : chip('إيداع', 'good')) },
          { h: 'الحساب', f: (r) => esc(RB.srcLabel(r.account, S)) },
          { h: 'المبلغ', num: 1, f: (r) => N(r.amount) },
          { h: '', f: (r) => rowActs('capital', r.id) },
        ],
        good(S.capital).sort((a, b) => (a.date < b.date ? 1 : -1)),
        { empty: 'لا توجد إيداعات بعد.' }
      ),
      { sub: `المدفوع مباشرة من حساب شريك (أصل أو مصروف) يُضاف تلقائياً لرأس ماله: ${fmt(uses.direct)} ${cur()}` }
    )}</div>`;
    return h;
  };

  // ─── الأصول ───
  PAGES.assets = () => {
    const [from, to] = range();
    const asOf = minD(to, today());
    const rows = good(S.assets).map((a) => {
      const sch = RB.depSchedule(a, S);
      const accum = r2(RB.sum(sch.months.filter((m) => m.date <= asOf), (m) => m.amount));
      return { a, sch, accum, book: r2(sch.cost - accum) };
    });
    const cats = {};
    rows.forEach((r) => {
      const c = RB.assetCat(r.a.category);
      const o = (cats[c.id] = cats[c.id] || { name: c.name, n: 0, cost: 0, monthly: 0, accum: 0, book: 0 });
      o.n++;
      o.cost += r.sch.cost;
      o.monthly += r.sch.months.some((m) => m.ym === asOf.slice(0, 7)) ? r.sch.monthly : 0;
      o.accum += r.accum;
      o.book += r.book;
    });
    const catRows = Object.values(cats).sort((a, b) => b.cost - a.cost);
    const monthlyDep = RB.sum(catRows, (c) => c.monthly);
    const sales = RB.salesByChannel(S, from, asOf);
    const months = RB.monthsIn(from, asOf);
    const ordersPerMonth = sales.total.orders / months;
    let h = pageHead('الأصول والأثاث', 'معدات المطبخ والأثاث والأدوات والديكور، وتوزيع تكلفتها على أشهر التشغيل (الإهلاك)', btn('+ أصل جديد', 'add', 'data-s="assets"', 'primary'));
    h += `<div class="kpis small">
      ${kpi('تكلفة الأصول', money(RB.sum(catRows, (c) => c.cost)), `${rows.length} أصل`)}
      ${kpi('الإهلاك الشهري الحالي', money(monthlyDep), 'يُحمّل على مصاريف كل شهر')}
      ${kpi('نصيب الطلب الواحد', money(ordersPerMonth ? monthlyDep / ordersPerMonth : 0), ordersPerMonth ? `على أساس ${fmt0(ordersPerMonth)} طلب شهرياً` : 'يظهر بعد تسجيل المبيعات')}
      ${kpi('القيمة الدفترية الحالية', money(RB.sum(catRows, (c) => c.book)), 'التكلفة − الإهلاك المتراكم')}
    </div>`;
    h += fixCard('assets', asOf);
    h += card(
      'حسب التصنيف',
      table(
        [
          { h: 'التصنيف', f: (r) => esc(r.name) },
          { h: 'العدد', num: 1, f: (r) => r.n },
          { h: 'التكلفة', num: 1, f: (r) => N(r.cost) },
          { h: 'الإهلاك الشهري', num: 1, f: (r) => N(r.monthly) },
          { h: 'الإهلاك المتراكم', num: 1, f: (r) => N(r.accum) },
          { h: 'القيمة الدفترية', num: 1, f: (r) => N(r.book) },
        ],
        catRows,
        { empty: 'لم تُسجَّل أصول بعد. أضف معدات المطبخ والأثاث والأدوات.' }
      )
    );
    h += card(
      'سجل الأصول',
      table(
        [
          { h: 'الأصل', f: (r) => `<b>${esc(r.a.name)}</b>${r.a.note ? `<div class="muted sm">${esc(r.a.note)}</div>` : ''}` },
          { h: 'التصنيف', f: (r) => esc(RB.assetCat(r.a.category).name) },
          { h: 'تاريخ الشراء', f: (r) => dt(r.a.date) },
          { h: 'التكلفة', num: 1, f: (r) => N(r.sch.cost) },
          { h: 'العمر', num: 1, f: (r) => (r.sch.life ? `${r.sch.life} شهر` : 'لا يُستهلك') },
          { h: 'الإهلاك الشهري', num: 1, f: (r) => N(r.sch.monthly) },
          { h: 'المتراكم', num: 1, f: (r) => N(r.accum) },
          { h: 'القيمة الدفترية', num: 1, f: (r) => N(r.book) },
          { h: 'الدفع من', f: (r) => `<span class="muted">${esc(RB.srcLabel(r.a.account, S))}</span>` },
          { h: '', f: (r) => rowActs('assets', r.a.id) },
        ],
        rows.sort((a, b) => (a.a.date < b.a.date ? 1 : -1))
      ),
      { sub: `الإهلاك المتراكم حتى ${dtText(asOf)}. الأصول المشتراة قبل الافتتاح يبدأ إهلاكها من تاريخ الافتتاح.` }
    );
    return h;
  };

  // ─── المصاريف التشغيلية ───
  PAGES.expenses = () => {
    const [from, to] = range();
    const exps = good(S.expenses);
    const list = exps.filter((x) => inRange(x.date) && (!ui.expCat || x.category === ui.expCat)).sort((a, b) => (a.date < b.date ? 1 : -1));
    const counts = {};
    exps.filter((x) => inRange(x.date)).forEach((x) => (counts[x.category] = (counts[x.category] || 0) + 1));
    // المدفوع مقابل المحمّل على الفترة (حتى اليوم) لكل تصنيف
    const asOf = minD(to, today());
    const b = RB.balances(ledger(asOf).entries, from, asOf);
    const catRows = RB.EXPENSE_CATS.map((c) => {
      const paid = RB.sum(exps.filter((x) => x.category === c.id && inRange(x.date)), (x) => RB.vatSplit(x.amount, x.includesVat, x.taxable, S.settings).gross);
      return { c, paid, charged: b[c.acc] || 0 };
    }).filter((r) => r.paid || r.charged);
    // الإيجار والإهلاك يُحمّلان كاملين أول الشهر، فالشهر الجاري يُحسب شهراً كاملاً في المتوسط
    const months = RB.chargeMonths(from, asOf);
    let h = pageHead('المصاريف التشغيلية', 'إيجار المحل وسكن العمال والكهرباء والصيانة والتسويق وغيرها. المصروف المدفوع لعدة أشهر يُوزّع تلقائياً على أشهره.', btn('+ مصروف', 'add', 'data-s="expenses"', 'primary'));
    h += `<div class="quick">${['rent', 'housing', 'utilities', 'telecom', 'maintenance', 'marketing', 'cleaning'].map((k) => btn('+ ' + RB.expenseCat(k).name, 'add', `data-s="expenses" data-x="${k}"`, 'sm ghost')).join('')}</div>`;
    h += fixCard('expenses', asOf);
    h += card(
      'ملخص الفترة',
      table(
        [
          { h: 'التصنيف', f: (r) => esc(r.c.name) },
          { h: 'المدفوع في الفترة', num: 1, f: (r) => N(r.paid) },
          { h: 'المحمّل على الفترة', num: 1, f: (r) => N(r.charged) },
          { h: 'المتوسط الشهري المحمّل', num: 1, f: (r) => N(r.charged / months) },
        ],
        catRows,
        { foot: ['الإجمالي', N(RB.sum(catRows, (r) => r.paid)), N(RB.sum(catRows, (r) => r.charged)), N(RB.sum(catRows, (r) => r.charged) / months)], empty: 'لا مصاريف في هذه الفترة.' }
      ),
      { sub: '«المدفوع» شامل الضريبة كما خرج من الحساب. «المحمّل» هو نصيب الفترة من المصروف بدون الضريبة المستردة (مثلاً: إيجار 6 أشهر يُحمّل سدسه كل شهر). الرواتب والمشتريات في صفحاتها.' }
    );
    const filt = `<div class="chips">${[['', 'الكل']].concat(RB.EXPENSE_CATS.filter((c) => counts[c.id]).map((c) => [c.id, `${c.name} (${counts[c.id]})`])).map(([k, l]) => `<button type="button" class="fchip ${ui.expCat === k ? 'on' : ''}" data-act="filter" data-f="expCat" data-v="${k}">${esc(l)}</button>`).join('')}</div>`;
    h += card('المدفوعات', filt + expensesTable(list), { actions: btn('تصدير CSV', 'csv', 'data-v="expenses"', 'sm ghost') });
    return h;
  };
  function expensesTable(list) {
    return table(
      [
        { h: 'التاريخ', f: (x) => dt(x.date) },
        { h: 'التصنيف', f: (x) => esc(RB.expenseCat(x.category).name) },
        { h: 'البيان', f: (x) => `${esc(x.desc || '')}${x.entity ? `<div class="muted sm">${esc(x.entity)}${empName(x.employeeId, ' · ')}</div>` : empName(x.employeeId, '<div class="muted sm">') }` },
        { h: 'المبلغ', num: 1, f: (x) => N(RB.vatSplit(x.amount, x.includesVat, x.taxable, S.settings).gross) },
        { h: 'الضريبة', num: 1, f: (x) => (x.taxable ? N(RB.vatSplit(x.amount, x.includesVat, x.taxable, S.settings).vat) : chip('غير خاضع', 'mute')) },
        { h: 'التغطية', f: (x) => (num(x.months) > 1 ? `${num(x.months)} شهر<div class="muted sm">حتى ${dtText(RB.coverageEnd(x.startDate || x.date, x.months))}</div>` : 'شهر واحد' + (x.startDate && x.startDate.slice(0, 7) !== x.date.slice(0, 7) ? `<div class="muted sm">${esc(RB.monthName(x.startDate.slice(0, 7)))}</div>` : '')) },
        { h: 'الدفع من', f: (x) => `<span class="muted">${esc(RB.srcLabel(x.account, S))}</span>` },
        { h: '', f: (x) => rowActs('expenses', x.id) },
      ],
      list,
      { empty: 'لا توجد مصاريف بهذا التصنيف في الفترة المحددة.' }
    );
  }

  // ─── الرسوم الحكومية ───
  PAGES.gov = () => {
    const rn = RB.renewals(S, today()).filter((r) => RB.GOV_CATS.includes(r.rec.category) || ['rent', 'housing'].includes(r.rec.category));
    // التكلفة السنوية للبنود المتكررة (المنتهية منها باقية): تكلفة آخر دفعة بدون الضريبة المستردة، محوّلة لسنة
    const annual = RB.sum(rn.filter((r) => RB.GOV_CATS.includes(r.rec.category)), (r) => (RB.costSplit(r.rec.amount, r.rec.includesVat, r.rec.taxable, S.settings, r.rec.date).cost * 12) / Math.max(1, num(r.rec.months)));
    const list = good(S.expenses).filter((x) => RB.GOV_CATS.includes(x.category) && inRange(x.date)).sort((a, b) => (a.date < b.date ? 1 : -1));
    let h = pageHead('الرسوم الحكومية والاشتراكات', 'السجل التجاري والبلدية والدفاع المدني والغرفة التجارية، ورسوم العمالة (قوى ومقيم)، والتأمين، والزكاة، واشتراكات الأنظمة، مع تنبيه قبل انتهاء كل منها — التأمينات الاجتماعية تُحسب من مسير الرواتب', btn('+ رسم أو اشتراك', 'add', 'data-s="expenses" data-x="gov"', 'primary'));
    const soon = rn.filter((r) => r.status !== 'ok').length;
    h += `<div class="kpis small">
      ${kpi('التكلفة السنوية التقديرية', money(annual), 'للبنود المتكررة')}
      ${kpi('ما يعادل شهرياً', money(annual / 12), 'يُوزّع على أشهر التغطية')}
      ${kpi('بنود تحتاج تجديد', `<span class="n">${soon}</span>`, 'منتهية أو تنتهي خلال 30 يوماً', soon ? 'warn' : 'good')}
    </div>`;
    h += card(
      'متابعة التجديد',
      table(
        [
          { h: 'الحالة', f: (r) => (r.status === 'expired' ? chip('منتهي', 'bad') : r.status === 'soon' ? chip(`باقي ${r.days} يوم`, 'warn') : chip('ساري', 'good')) },
          { h: 'البند', f: (r) => `<b>${esc(r.rec.desc || RB.expenseCat(r.rec.category).name)}</b><div class="muted sm">${esc(RB.expenseCat(r.rec.category).name)}</div>` },
          { h: 'الجهة', f: (r) => esc(r.rec.entity || '—') + empName(r.rec.employeeId, '<div class="muted sm">') },
          { h: 'آخر دفعة', f: (r) => dt(r.rec.date) },
          { h: 'المبلغ', num: 1, f: (r) => N(RB.vatSplit(r.rec.amount, r.rec.includesVat, r.rec.taxable, S.settings).gross) },
          { h: 'ينتهي في', f: (r) => dt(r.end) },
          { h: '', f: (r) => renewActs(r) },
        ],
        rn,
        { empty: 'لا توجد رسوم أو اشتراكات مسجلة. أضف السجل التجاري ورخصة البلدية وشهادة السلامة ورسوم العمالة.', rowCls: (r) => r.status }
      ),
      { sub: 'آخر تغطية لكل بند. الإيجارات وسكن العمال تظهر هنا أيضاً لمتابعة مواعيدها.' }
    );
    h += card('مدفوعات الفترة', expensesTable(list));
    return h;
  };

  // ─── العمال والرواتب ───
  PAGES.staff = () => {
    const ym = today().slice(0, 7);
    const emps = S.employees.slice().sort((a, b) => (a.active === false) - (b.active === false));
    const active = emps.filter((e) => RB.isEmployeeActive(e, ym));
    const costs = Object.fromEntries(emps.map((e) => [e.id, RB.employeeMonthlyCost(e, S, ym)]));
    const saudi = active.filter((e) => e.nationality === 'saudi').length;
    // مخصص نهاية الخدمة المتراكم حتى اليوم (رصيد الحساب 2201) ونصيب كل موظف منه
    const eosb = RB.eosbBalances(S, today());
    const eosbTotal = -(RB.balances(ledger(today()).entries, null, today())['2201'] || 0);
    let h = pageHead('العمال والرواتب', 'الرواتب والبدلات، التأمينات الاجتماعية، المقابل المالي والإقامات، والتكلفة الحقيقية لكل عامل', btn('+ موظف', 'add', 'data-s="employees"') + btn('+ مسير رواتب', 'add', 'data-s="payroll"', 'primary'));
    h += `<div class="kpis small five">
      ${kpi('عدد العمال النشطين', `<span class="n">${active.length}</span>`, `سعوديون ${saudi} · غير سعوديين ${active.length - saudi}${active.length ? ' · نسبة التوطين ' + pct((saudi / active.length) * 100, 0) : ''}`)}
      ${kpi('الرواتب الشهرية', money(RB.sum(active, (e) => costs[e.id].salary)), 'الأساسي + البدلات')}
      ${kpi('التكلفة الشهرية الحقيقية', money(RB.sum(active, (e) => costs[e.id].total)), 'تشمل التأمينات والرسوم والسكن ونهاية الخدمة')}
      ${kpi('تأمينات المنشأة شهرياً', money(RB.sum(active, (e) => costs[e.id].gosi.er)), 'حسب النسب في الإعدادات')}
      ${kpi('مخصص نهاية الخدمة المتراكم', money(eosbTotal), 'يُستحق مع كل مسير رواتب')}
    </div>`;
    h += tabs('staffTab', [['emp', 'الموظفون'], ['payroll', 'مسيرات الرواتب']], ui.staffTab);
    if (ui.staffTab === 'payroll') {
      const runMonth = (p) => p.month || p.date.slice(0, 7);
      const runs = good(S.payroll).sort((a, b) => (runMonth(a) < runMonth(b) ? 1 : -1));
      h += card(
        'مسيرات الرواتب',
        table(
          [
            { h: 'الشهر', f: (p) => `<b>${RB.monthName(runMonth(p))}</b>${p.note ? `<div class="muted sm">${esc(p.note)}</div>` : ''}` },
            { h: 'تاريخ الصرف', f: (p) => dt(p.date) },
            { h: 'العدد', num: 1, f: (p) => RB.payrollTotals(p).count },
            { h: 'إجمالي الرواتب', num: 1, f: (p) => N(RB.payrollTotals(p).gross) },
            { h: 'تأمينات (موظف + منشأة)', num: 1, f: (p) => N(RB.payrollTotals(p).gosiEe + RB.payrollTotals(p).gosiEr) },
            // ما خرج من الحساب للموظفين: الصافي + مكافأة نهاية الخدمة المصروفة (مسير تسوية بلا راتب يظهر بمكافأته)
            { h: 'الصافي المصروف', num: 1, f: (p) => { const t = RB.payrollTotals(p); return N(t.net + t.eosbPaid) + (t.eosbPaid ? `<div class="muted sm">منه نهاية الخدمة<br>${N(t.eosbPaid)}</div>` : ''); } },
            { h: 'التكلفة على المطعم', num: 1, f: (p) => N(RB.payrollTotals(p).cost) },
            { h: 'من', f: (p) => `<span class="muted">${esc(RB.srcLabel(p.account, S))}</span>` },
            { h: '', f: (p) => rowActs('payroll', p.id) },
          ],
          runs,
          { empty: 'لا توجد مسيرات رواتب. اضغط «مسير رواتب» ليتعبأ تلقائياً من بيانات الموظفين.' }
        ),
        { sub: 'التكلفة على المطعم = إجمالي الرواتب + حصة المنشأة في التأمينات. حصة الموظف تُخصم من راتبه وتُورّد مع حصة المنشأة. «الصافي المصروف» يشمل مكافأة نهاية الخدمة المصروفة، وهي من مخصصها المتراكم فلا تدخل في التكلفة.' }
      );
      return h;
    }
    // المقابل المالي 700 بدل 800 إن كان السعوديون مساوين للوافدين أو أكثر
    const expats = active.filter((e) => e.nationality !== 'saudi');
    const al = [];
    if (expats.length && saudi >= expats.length && expats.some((e) => num(e.levyMonthly) >= 800)) al.push(['warn', 'عدد السعوديين ≥ الوافدين: قد يكون المقابل المالي 700 ر.س — راجع قوى.', '']);
    al.push(...eosbAlerts(true));
    if (al.length) h += card('', alertsUL(al));
    h += card(
      'الموظفون',
      table(
        [
          { h: 'الاسم', f: (e) => `<b>${esc(e.name)}</b><div class="muted sm">${esc(e.job || '')}</div>` },
          { h: 'الجنسية', f: (e) => (e.nationality === 'saudi' ? chip('سعودي', 'accent') : chip('غير سعودي', 'mute')) },
          // العناوين الطويلة على سطرين ليتسع الجدول لأزرار السطر على شاشة 1280
          { h: 'الراتب<br>والبدلات', num: 1, f: (e) => N(costs[e.id].salary) },
          { h: 'تأمينات<br>المنشأة', num: 1, f: (e) => N(costs[e.id].gosi.er) },
          { h: 'المقابل المالي<br>والإقامة', num: 1, f: (e) => N(RB.sum(costs[e.id].items.filter((i) => i.k === 'levy' || i.k === 'iqama'), (i) => i.v)) },
          { h: 'التكلفة الشهرية<br>الحقيقية', num: 1, f: (e) => `<b>${N(costs[e.id].total)}</b>` },
          { h: 'مخصص<br>نهاية الخدمة', num: 1, f: (e) => N(eosb[e.id] || 0) },
          { h: 'الحالة', f: (e) => { const st = RB.employeeStatus(e, ym); return st === 'active' ? chip('على رأس العمل', 'good') : chip(EMP_STATUS[st], st === 'future' ? 'accent' : 'mute'); } },
          { h: '', f: (e) => rowActs('employees', e.id, `<button type="button" class="icon-btn" data-act="empcost" data-id="${esc(e.id)}" aria-label="تفاصيل التكلفة" title="تفاصيل التكلفة">ⓘ</button>`) },
        ],
        emps,
        { empty: 'أضف العمال مع رواتبهم لحساب التأمينات والمقابل المالي والتكلفة الحقيقية.' }
      ),
      { sub: 'المقابل المالي ورسوم الإقامة تُسجَّل كدفعات فعلية في «الرسوم الحكومية» عند السداد؛ هنا تقدير شهري لتكلفة العامل.' }
    );
    return h;
  };

  // ─── المشتريات ───
  PAGES.purchases = () => {
    const [, to] = range();
    const all = good(S.purchases).filter((p) => inRange(p.date));
    const list = all.filter((p) => !ui.purCat || p.category === ui.purCat).sort((a, b) => (a.date < b.date ? 1 : -1));
    // ضريبة المدخلات حسب تاريخ الفاتورة: قبل سريان التسجيل (أو بدونه) جزء من التكلفة لا تُخصم
    const sp = (p) => RB.costSplit(RB.purchaseTotal(p), p.includesVat, p.taxable, S.settings, p.date);
    const byCat = {};
    const bySrc = {};
    let taxable = 0;
    let exempt = 0;
    let vat = 0;
    let vatCost = 0;
    all.forEach((p) => {
      const v = sp(p);
      byCat[p.category] = (byCat[p.category] || 0) + v.gross;
      bySrc[p.account] = (bySrc[p.account] || 0) + v.gross;
      if (p.taxable) taxable += v.gross;
      else exempt += v.gross;
      vat += v.vat;
      vatCost += v.rawVat - v.vat;
    });
    const vatNote =
      vatCost >= 0.005 && vat >= 0.005
        ? `ضريبة المدخلات تُخصم من ضريبة المبيعات في الإقرار، أما ضريبة الفواتير قبل سريان التسجيل (${fmt(vatCost)}) فجزء من التكلفة ولا تُخصم.`
        : vatCost >= 0.005 || !RB.isVatReg(S.settings, today())
          ? 'المطعم غير مسجل في الضريبة في تواريخ هذه الفواتير، فالضريبة المدفوعة جزء من التكلفة.'
          : 'ضريبة المدخلات تُخصم من ضريبة المبيعات في الإقرار.';
    let h = pageHead('المشتريات التشغيلية', 'فواتير المواد الخام والتغليف والمستهلكات — من البنك أو من الكاشير أو آجل، خاضعة للضريبة أو غير خاضعة', btn('سداد مورد', 'add', 'data-s="supplierPayments"') + btn('+ فاتورة مشتريات', 'add', 'data-s="purchases"', 'primary'));
    h += `<div class="kpis small">
      ${kpi('إجمالي المشتريات', money(taxable + exempt), `${all.length} فاتورة في الفترة`)}
      ${kpi('من البنك', money(bySrc.bank || 0), '')}
      ${kpi('من الكاشير', money(bySrc.cash || 0), '')}
      ${kpi('آجل على الموردين', money(bySrc.payable || 0), '')}
    </div>`;
    h += `<div class="grid2">${card('حسب التصنيف', hbars(RB.PURCHASE_CATS.filter((c) => byCat[c.id]).map((c) => ({ label: c.name, v: byCat[c.id] }))))}${card(
      'الضريبة',
      `<div class="pv-grid"><div><span>مشتريات خاضعة للضريبة</span>${money(taxable)}</div><div><span>مشتريات غير خاضعة</span>${money(exempt)}</div><div><span>${vat < 0.005 && vatCost >= 0.005 ? 'الضريبة المدفوعة (تكلفة)' : 'ضريبة المدخلات'}</span>${money(vat < 0.005 && vatCost >= 0.005 ? vatCost : vat)}</div></div><p class="note">${vatNote} غير الخاضعة مثل مشتريات من موردين غير مسجلين أو بدون فاتورة ضريبية.</p>`
    )}</div>`;
    const counts = {};
    all.forEach((p) => (counts[p.category] = (counts[p.category] || 0) + 1));
    const filt = `<div class="chips">${[['', 'الكل']].concat(RB.PURCHASE_CATS.filter((c) => counts[c.id]).map((c) => [c.id, `${c.name} (${counts[c.id]})`])).map(([k, l]) => `<button type="button" class="fchip ${ui.purCat === k ? 'on' : ''}" data-act="filter" data-f="purCat" data-v="${k}">${esc(l)}</button>`).join('')}</div>`;
    h += card(
      'الفواتير',
      filt +
        table(
          [
            { h: 'التاريخ', f: (p) => dt(p.date) },
            { h: 'المورد', f: (p) => `<b>${esc(p.supplier || '—')}</b>${p.invoiceNo ? `<div class="muted sm">فاتورة ${esc(p.invoiceNo)}</div>` : ''}` },
            { h: 'التصنيف', f: (p) => esc(RB.purchaseCat(p.category).name) },
            { h: 'الأصناف', f: (p) => `<span class="muted sm">${esc((p.lines || []).map((l) => l.desc || RB.itemName(S, 'raw', l.rawId)).slice(0, 3).join('، '))}${(p.lines || []).length > 3 ? '…' : ''}</span>` },
            { h: 'الدفع', f: (p) => (p.account === 'payable' ? chip('آجل', 'warn') : p.account === 'cash' ? chip('الكاشير', 'mute') : p.account === 'bank' ? chip('البنك', 'mute') : chip(esc(RB.srcLabel(p.account, S)), 'accent')) },
            { h: 'الضريبة', f: (p) => (p.taxable ? chip('خاضعة', 'good') : chip('غير خاضعة', 'mute')) },
            { h: 'قبل الضريبة', num: 1, f: (p) => N(sp(p).net) },
            { h: 'الضريبة', num: 1, f: (p) => N(sp(p).vat) },
            { h: 'الإجمالي', num: 1, f: (p) => `<b>${N(sp(p).gross)}</b>` },
            { h: '', f: (p) => rowActs('purchases', p.id) },
          ],
          list,
          { empty: 'لا توجد فواتير في هذه الفترة.' }
        ),
      { actions: btn('تصدير CSV', 'csv', 'data-v="purchases"', 'sm ghost') }
    );
    const sb = RB.supplierBalances(S, minD(to, today()));
    h += card(
      'الموردون بالآجل',
      table(
        [
          { h: 'المورد', f: (r) => `<b>${esc(r.supplier)}</b>` },
          { h: 'المستحق الآجل', num: 1, f: (r) => N(r.purchases) },
          { h: 'المسدد', num: 1, f: (r) => N(r.paid) },
          { h: 'الرصيد المستحق', num: 1, f: (r) => `<b>${N(r.balance)}</b>` },
          { h: '', f: (r) => (r.balance > 0.005 ? btn('سداد', 'add', `data-s="supplierPayments" data-x="${esc(r.supplier)}"`, 'sm') : r.balance < -0.005 ? chip('دفعة زائدة', 'warn') : chip('مسدد', 'good')) },
        ],
        sb,
        { empty: 'لا توجد مستحقات آجلة.' }
      ) +
        (good(S.supplierPayments).length
          ? `<h4 class="sub-h">دفعات السداد</h4>` +
            table(
              [
                { h: 'التاريخ', f: (p) => dt(p.date) },
                { h: 'المورد', f: (p) => esc(p.supplier) },
                { h: 'من', f: (p) => esc(RB.srcLabel(p.account, S)) },
                { h: 'المبلغ', num: 1, f: (p) => N(p.amount) },
                { h: '', f: (p) => rowActs('supplierPayments', p.id) },
              ],
              good(S.supplierPayments).sort((a, b) => (a.date < b.date ? 1 : -1))
            )
          : '')
    );
    return h;
  };

  // ─── المواد الخام ───
  PAGES.raw = () => {
    const C = costing();
    const usedIn = (rid) => S.composites.filter((c) => (c.items || []).some((i) => i.kind === 'raw' && i.id === rid)).length + S.products.filter((p) => (p.items || []).some((i) => i.kind === 'raw' && i.id === rid)).length;
    let h = pageHead('المواد الخام', 'كل ما يدخل في المنيو: اللحم والخبز والصوصات والتغليف. التكلفة تُحسب لوحدة الاستخدام بعد الهدر.', btn('+ جرد', 'add', 'data-s="stockCounts"') + btn('+ مادة خام', 'add', 'data-s="raw"', 'primary'));
    h += tabs('rawTab', [['list', 'المواد'], ['counts', 'الجرد']], ui.rawTab);
    if (ui.rawTab === 'counts') {
      h += card(
        'الجرد',
        table(
          [
            { h: 'التاريخ', f: (c) => dt(c.date) },
            { h: 'عدد الأصناف', num: 1, f: (c) => (c.lines || []).filter((l) => num(l.qty)).length },
            { h: 'قيمة المخزون', num: 1, f: (c) => `<b>${N(RB.stockValue(c, S))}</b>` },
            { h: 'ملاحظات', f: (c) => esc(c.note || '') },
            { h: '', f: (c) => rowActs('stockCounts', c.id) },
          ],
          good(S.stockCounts).sort((a, b) => (a.date < b.date ? 1 : -1)),
          { empty: 'سجّل جرد آخر الشهر لتصبح تكلفة المواد دقيقة: تكلفة المواد = المشتريات − الزيادة في المخزون.' }
        ),
        { sub: 'قيمة الجرد = الكمية الموجودة × سعر وحدة الشراء. الفرق بين جرد وآخر يعدّل تكلفة المواد في قائمة الدخل.' + (RB.isVatReg(S.settings, today()) ? '' : ' المطعم غير مسجل في الضريبة: قيمة الجرد تشمل الضريبة للمواد الخاضعة لأنها جزء من التكلفة') }
      );
      return h;
    }
    const rows = S.raw.slice().sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name, 'ar'));
    h += card(
      'قائمة المواد',
      table(
        [
          { h: 'المادة', f: (r) => `<b>${esc(r.name)}</b><div class="muted sm">${esc(r.category || '')}${r.supplier ? ' · ' + esc(r.supplier) : ''}</div>` },
          { h: 'وحدة الشراء', f: (r) => `${esc(r.buyUnit || '')}<div class="muted sm">= ${fmtQ(r.packQty)} ${esc(r.useUnit)}</div>` },
          { h: 'سعر الشراء', num: 1, f: (r) => N(r.price) },
          { h: 'الهدر', num: 1, f: (r) => (num(r.wastePct) ? pct(r.wastePct, 0) : '—') },
          { h: 'الضريبة', f: (r) => (r.taxable ? chip('خاضعة', 'good') : chip('غير خاضعة', 'mute')) },
          { h: 'تكلفة وحدة الاستخدام', num: 1, f: (r) => `<b class="n">${(C.raw[r.id] || 0).toFixed(4)}</b><div class="muted sm">لكل 1 ${esc(r.useUnit)}</div>` },
          { h: 'تستخدم في', num: 1, f: (r) => usedIn(r.id) || '—' },
          { h: '', f: (r) => rowActs('raw', r.id) },
        ],
        rows,
        { empty: 'ابدأ بإضافة المواد الخام: اللحم، الخبز، الجبن، الصوصات، البطاطس، علب التغليف…' }
      ),
      { sub: RB.isVatReg(S.settings, today()) ? 'السعر بدون ضريبة لأن المطعم مسجل ويسترد ضريبة المدخلات. يتحدث السعر تلقائياً من آخر فاتورة مشتريات مرتبطة بالمادة.' : 'المطعم غير مسجل في الضريبة: التكلفة تشمل الضريبة للمواد الخاضعة.' }
    );
    return h;
  };

  // ─── المنتجات المجمّعة ───
  PAGES.composites = () => {
    const C = costing();
    const usedIn = (cid) => S.composites.filter((c) => (c.items || []).some((i) => i.kind === 'comp' && i.id === cid)).length + S.products.filter((p) => (p.items || []).some((i) => i.kind === 'comp' && i.id === cid)).length;
    let h = pageHead('المنتجات المجمّعة', 'التحضيرات التي تُصنع من مواد خام أو من منتجات مجمّعة أخرى: قطعة اللحم، الصوص الخاص، خلطة الخضار، حصة البطاطس…', btn('+ منتج مجمّع', 'add', 'data-s="composites"', 'primary'));
    h += card(
      'التحضيرات',
      table(
        [
          { h: 'المنتج المجمّع', f: (c) => `<b>${esc(c.name)}</b>${(c.items || []).some((i) => i.kind === 'comp') ? ' ' + chip('يحتوي منتجاً مجمّعاً', 'accent') : ''}<div class="muted sm">${esc((c.items || []).map((i) => RB.itemName(S, i.kind, i.id)).join('، '))}</div>` },
          { h: 'الكمية الناتجة', num: 1, f: (c) => `${fmtQ(c.yieldQty)} ${esc(c.yieldUnit)}` },
          { h: 'تكلفة الدفعة', num: 1, f: (c) => N((C.comp[c.id] || 0) * (num(c.yieldQty) || 1)) },
          { h: 'تكلفة الوحدة', num: 1, f: (c) => `<b class="n">${(C.comp[c.id] || 0).toFixed(4)}</b><div class="muted sm">لكل 1 ${esc(c.yieldUnit)}</div>` },
          { h: 'يستخدم في', num: 1, f: (c) => usedIn(c.id) || '—' },
          { h: '', f: (c) => rowActs('composites', c.id, `<button type="button" class="icon-btn" data-act="view" data-s="composites" data-id="${esc(c.id)}" aria-label="تفاصيل التكلفة" title="تفاصيل التكلفة">ⓘ</button>`) },
        ],
        S.composites.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar')),
        { empty: 'أضف أول منتج مجمّع، مثل «قطعة لحم 120 جم» = لحم مفروم + ملح + بهارات.' }
      ),
      { sub: 'المنتج المجمّع يمكن أن يدخل كمكوّن في منتج مجمّع آخر (مثل صوص سبايسي مبني على الصوص الخاص) وفي أصناف المنيو.' }
    );
    return h;
  };

  // ─── المنيو والتسعير ───
  PAGES.products = () => {
    const C = costing();
    const target = num(S.settings.targetFoodCost);
    const rows = S.products.map((p) => ({ p, st: RB.productStats(S, p, C) })).sort((a, b) => (a.p.category || '').localeCompare(b.p.category || '', 'ar') || a.p.name.localeCompare(b.p.name, 'ar'));
    const act = rows.filter((r) => r.p.active !== false && r.st.price > 0);
    const avgFc = act.length ? RB.sum(act, (r) => r.st.foodCost) / act.length : 0;
    let h = pageHead('المنيو والتسعير', 'تكلفة كل صنف وسعر بيعه، ومقارنته بأسعار السوق المحلي وبصافي ربحه في تطبيقات التوصيل', btn('+ صنف في المنيو', 'add', 'data-s="products"', 'primary'));
    h += `<div class="kpis small">
      ${kpi('أصناف المنيو', `<span class="n">${act.length}</span>`, `${rows.length - act.length} غير مفعّل`)}
      ${kpi('متوسط تكلفة الطعام', pct(avgFc), `المستهدف ${pct(target, 0)}`, avgFc > target + 3 ? 'warn' : 'good')}
      ${kpi('أعلى من المستهدف', `<span class="n">${act.filter((r) => r.st.foodCost > target + 3).length}</span>`, 'صنف يحتاج مراجعة سعر أو مكونات', act.some((r) => r.st.foodCost > target + 3) ? 'warn' : 'good')}
      ${kpi('متوسط عمولة التطبيقات', pct(RB.appChannels(S).length ? RB.sum(RB.appChannels(S), (c) => num(c.feePct)) / RB.appChannels(S).length : 0), 'تعدّلها من الإعدادات')}
    </div>`;
    const fcChip = (fc) => (fc > target + 3 ? chip(pct(fc), 'bad') : fc > target ? chip(pct(fc), 'warn') : chip(pct(fc), 'good'));
    h += card(
      'الأصناف',
      table(
        [
          { h: 'الصنف', f: (r) => `<b>${esc(r.p.name)}</b>${r.p.active === false ? ' ' + chip('غير مفعّل', 'mute') : ''}<div class="muted sm">${esc(r.p.category || '')}${(r.p.items || []).some((i) => i.kind === 'prod') ? ' · وجبة مركّبة' : ''}</div>` },
          { h: 'التكلفة', num: 1, f: (r) => N(r.st.cost) },
          { h: 'سعر البيع', num: 1, f: (r) => `<b>${N(r.st.price)}</b>` },
          { h: 'تكلفة الطعام', num: 1, f: (r) => (r.st.price ? fcChip(r.st.foodCost) : '—') },
          { h: 'ربح الحبة', num: 1, f: (r) => N(r.st.profit) },
          { h: 'السعر المقترح', num: 1, f: (r) => (r.st.suggested ? `${N(r.st.suggested)}${r.st.suggested > r.st.price + 0.01 ? '<div class="muted sm">لتحقيق المستهدف</div>' : ''}` : '—') },
          { h: 'متوسط السوق', num: 1, f: (r) => (r.st.market ? `${N(r.st.market.avg)}<div class="sm">${r.st.vsMarket > 5 ? chip('أغلى ' + pct(r.st.vsMarket, 0), 'warn') : r.st.vsMarket < -5 ? chip('أرخص ' + pct(-r.st.vsMarket, 0), 'accent') : chip('مماثل', 'good')}</div>` : '<span class="muted">—</span>') },
          { h: 'سعر التطبيقات', num: 1, f: (r) => N(r.st.appPrice) },
          { h: 'ربحه في التطبيقات', num: 1, f: (r) => (r.st.avgApp ? `${N(r.st.avgApp.profit)}<div class="muted sm">هامش ${pct(r.st.avgApp.margin, 0)}</div>` : '—') },
          { h: '', f: (r) => rowActs('products', r.p.id, `<button type="button" class="icon-btn" data-act="view" data-s="products" data-id="${esc(r.p.id)}" aria-label="تحليل الصنف" title="تحليل الصنف">ⓘ</button>`) },
        ],
        rows,
        { empty: 'أضف أصناف المنيو وحدّد مكونات كل صنف (مواد خام أو منتجات مجمّعة) وسعر البيع.', rowCls: (r) => (r.p.active === false ? 'off' : '') }
      ),
      { sub: `${RB.isVatReg(S.settings, today()) ? `الأسعار شاملة ضريبة ${pct(S.settings.vatRate, 0)}. تكلفة الطعام = التكلفة ÷ السعر بدون الضريبة.` : 'المطعم غير مسجل في الضريبة: الأسعار بدون ضريبة وتكلفة الطعام = التكلفة ÷ السعر.'} السعر المقترح يحقق المستهدف (${pct(target, 0)}) مقرّباً لأعلى. ربح التطبيقات بعد خصم متوسط العمولة.` }
    );
    return h;
  };

  // ─── المبيعات ───
  PAGES.sales = () => {
    const [from, to] = range();
    const sales = RB.salesByChannel(S, from, to);
    let h = pageHead('المبيعات اليومية', 'إقفال كل يوم حسب القناة: كاش، شبكة، وتطبيقات التوصيل — مع العمولات والضريبة وتحويلات التطبيقات', btn('+ تحويل من تطبيق', 'add', 'data-s="payouts"') + btn('+ إقفال يومي', 'add', 'data-s="sales"', 'primary'));
    h += `<div class="kpis small">
      ${kpi('المبيعات شاملة الضريبة', money(sales.total.gross), periodLabel())}
      ${kpi('ضريبة المبيعات', money(sales.total.vat), '')}
      ${kpi('عمولات ورسوم', money(sales.total.fee), 'التطبيقات والشبكة شاملة ضريبتها')}
      ${kpi('عدد الطلبات', N0(sales.total.orders), `متوسط الفاتورة ${fmt(sales.total.avgTicket)} ${cur()}`)}
    </div>`;
    h += card(
      'حسب القناة',
      table(
        [
          { h: 'القناة', f: (c) => `<b>${esc(c.name)}</b><div class="muted sm">${esc(RB.CHANNEL_TYPES[c.type] || '')}</div>` },
          { h: 'الطلبات', num: 1, f: (c) => N0(c.orders) },
          { h: 'المبيعات', num: 1, f: (c) => N(c.gross) },
          { h: 'الحصة', num: 1, f: (c) => pct(sales.total.gross ? (c.gross / sales.total.gross) * 100 : 0, 0) },
          { h: 'الضريبة', num: 1, f: (c) => N(c.vat) },
          { h: 'العمولة', num: 1, f: (c) => N(c.fee) },
          { h: 'الصافي الواصل', num: 1, f: (c) => `<b>${N(c.receive)}</b>` },
          { h: 'متوسط الطلب', num: 1, f: (c) => N(c.avgTicket) },
        ],
        sales.list,
        { foot: ['الإجمالي', N0(sales.total.orders), N(sales.total.gross), '100%', N(sales.total.vat), N(sales.total.fee), N(RB.sum(sales.list, (c) => c.receive)), N(sales.total.avgTicket)] }
      )
    );
    h += tabs('salesTab', [['days', 'الإقفالات اليومية'], ['apps', 'تحويلات التطبيقات']], ui.salesTab);
    if (ui.salesTab === 'apps') {
      const asOf = minD(to, today());
      h += card(
        'مستحقات التطبيقات',
        table(
          [
            { h: 'التطبيق', f: (a) => `<b>${esc(a.name)}</b>` },
            { h: 'الرصيد المستحق', num: 1, f: (a) => N(a.balance) },
            { h: 'آخر تحويل', f: (a) => (a.lastPayout ? dt(a.lastPayout) : '—') },
            { h: '', f: (a) => btn('سجّل تحويل', 'add', `data-s="payouts" data-x="${esc(a.id)}"`, 'sm') },
          ],
          RB.appReceivables(S, asOf),
          { empty: 'لا توجد مبيعات تطبيقات.' }
        ),
        { sub: `حتى ${dtText(asOf)}. الرصيد = المبيعات − العمولة وضريبتها − ما حُوّل للبنك. إن حوّل التطبيق مبلغاً أقل سجّل الفرق في «خصومات» واختر نوعه: العرض أو المرتجع على الطلبات يخفض المبيعات وضريبتها، ورسوم الإعلان أو الخدمة بفاتورة ضريبية تُسترد ضريبتها، والغرامة أو التسوية بلا ضريبة.` }
      );
      h += card(
        'التحويلات',
        table(
          [
            { h: 'التاريخ', f: (p) => dt(p.date) },
            { h: 'التطبيق', f: (p) => esc((RB.channelOf(S, p.channelId) || {}).name || p.channelId) },
            { h: 'المبلغ المحوّل', num: 1, f: (p) => N(p.amount) },
            { h: 'خصومات', num: 1, f: (p) => N(p.deductions) + (num(p.deductions) ? `<div class="muted sm">${esc((RB.DED_TYPES[p.dedType] || RB.DED_TYPES.other).short)}</div>` : '') },
            { h: 'ملاحظات', f: (p) => esc(p.note || '') },
            { h: '', f: (p) => rowActs('payouts', p.id) },
          ],
          good(S.payouts).filter((p) => inRange(p.date)).sort((a, b) => (a.date < b.date ? 1 : -1))
        )
      );
      return h;
    }
    const days = good(S.sales).filter((s) => inRange(s.date)).sort((a, b) => (a.date < b.date ? 1 : -1));
    const chs = S.settings.channels.filter((c) => c.active !== false || days.some((s) => s.channels && s.channels[c.id]));
    const showApps = chs.filter((c) => c.type === 'app');
    const compact = showApps.length > 3;
    const cols = [{ h: 'اليوم', f: (s) => `${dt(s.date)}<div class="muted sm">${['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][RB.weekday(s.date)]}</div>` }];
    chs.filter((c) => c.type !== 'app' || !compact).forEach((c) => cols.push({ h: esc(c.name), num: 1, f: (s) => (s.channels && s.channels[c.id] ? N(s.channels[c.id].amount) : '—') }));
    if (compact) cols.push({ h: 'التطبيقات', num: 1, f: (s) => N(RB.sum(showApps, (c) => num(s.channels && s.channels[c.id] && s.channels[c.id].amount))) });
    cols.push({ h: 'الطلبات', num: 1, f: (s) => N0(RB.saleOrders(s)) });
    cols.push({ h: 'الإجمالي', num: 1, f: (s) => `<b>${N(RB.saleTotal(s))}</b>` });
    cols.push({ h: '', f: (s) => rowActs('sales', s.id) });
    h += card('الإقفالات اليومية', table(cols, days, { empty: 'لا توجد إقفالات في هذه الفترة. اضغط «إقفال يومي» وأدخل مبيعات كل قناة.' }), { actions: btn('تصدير CSV', 'csv', 'data-v="sales"', 'sm ghost'), sub: 'المبالغ شاملة الضريبة.' });
    return h;
  };

  // ─── الصندوق والبنك ───
  PAGES.cash = () => {
    const [from, asOf] = rangeToDate();
    const L = ledger(asOf);
    const bal = RB.balances(L.entries, null, asOf);
    const acc = ui.cashAcc === '1102' ? '1102' : '1101';
    const st = RB.accountStatement(S, acc, from, asOf, L);
    let h = pageHead('الصندوق والبنك', 'كل حركة تدخل أو تخرج من الكاشير والحساب البنكي، مع الرصيد بعد كل حركة', btn('سحب من البنك للصندوق', 'add', 'data-s="transfers" data-x="bank"') + btn('+ إيداع الكاش في البنك', 'add', 'data-s="transfers" data-x="cash"', 'primary'));
    h += `<div class="kpis small">
      ${kpi('الصندوق (الكاشير)', money(bal['1101'] || 0), 'حتى ' + dtText(asOf), (bal['1101'] || 0) < 0 ? 'bad' : '')}
      ${kpi('الحساب البنكي', money(bal['1102'] || 0), 'حتى ' + dtText(asOf), (bal['1102'] || 0) < 0 ? 'bad' : '')}
      ${kpi('مستحقات التطبيقات', money(bal['1103'] || 0), 'تتحول للبنك لاحقاً')}
      ${kpi('مستحق للموردين', money(-(bal['2101'] || 0)), 'مشتريات آجلة')}
    </div>`;
    h += tabs('cashAcc', [['1101', 'كشف الصندوق'], ['1102', 'كشف البنك']], acc);
    const rows = st.rows.slice().reverse();
    h += card(
      RB.ACC[acc].name,
      `<div class="pv-grid four"><div><span>رصيد أول الفترة</span>${money(st.opening)}</div><div><span>الداخل</span>${money(st.totIn)}</div><div><span>الخارج</span>${money(st.totOut)}</div><div><span>رصيد آخر الفترة</span>${money(st.closing)}</div></div>` +
        table(
          [
            { h: 'التاريخ', f: (r) => dt(r.date) },
            { h: 'البيان', f: (r) => esc(r.desc) },
            { h: 'داخل', num: 1, f: (r) => (r.in ? N(r.in, 'pos') : '') },
            { h: 'خارج', num: 1, f: (r) => (r.out ? N(r.out) : '') },
            { h: 'الرصيد', num: 1, f: (r) => N(r.balance) },
            { h: '', f: (r) => (r.ref && r.ref.s ? `<button type="button" class="icon-btn" data-act="edit" data-s="${esc(r.ref.s)}" data-id="${esc(r.ref.id)}" aria-label="فتح العملية" title="فتح العملية">↗</button>` : '') },
          ],
          rows.slice(0, 400),
          { empty: 'لا توجد حركات في هذه الفترة.' }
        ) +
        (rows.length > 400 ? `<p class="note">يظهر آخر 400 حركة. صدّر الكشف كاملاً بصيغة CSV.</p>` : ''),
      { actions: btn('تصدير CSV', 'csv', `data-v="statement"`, 'sm ghost'), sub: periodLabel() }
    );
    return h;
  };

  // ─── التقارير ───
  const REPORTS = [
    ['income', 'قائمة الدخل'],
    ['balance', 'الميزانية'],
    ['vat', 'ضريبة القيمة المضافة'],
    ['breakeven', 'نقطة التعادل'],
    ['menu', 'تحليل المنيو'],
    ['monthly', 'مقارنة الأشهر'],
    ['trial', 'ميزان المراجعة'],
    ['journal', 'دفتر اليومية'],
  ];
  PAGES.reports = () => {
    const canPrint = !window.claude;
    let h = pageHead('التقارير المالية', periodLabel(), (canPrint ? btn('طباعة', 'print', '', 'ghost') : '') + btn('تصدير CSV', 'csv', `data-v="report"`, 'ghost'));
    if (!isReport(ui.report)) ui.report = 'income';
    h += tabs('report', REPORTS, ui.report);
    h += REPORT[ui.report]();
    return h;
  };
  const REPORT = {};
  const isReport = (r) => hasOwn(REPORT, r);
  function lineRows(list, total, label) {
    return list.map((x) => `<tr><td class="ind">${esc(x.name)}</td><td class="num">${N(x.amount)}</td><td class="num muted">${total ? pct((x.amount / total) * 100) : ''}</td></tr>`).join('') + (label ? `<tr class="sum"><td>${label}</td><td class="num">${N(RB.sum(list, (x) => x.amount))}</td><td class="num muted">${total ? pct((RB.sum(list, (x) => x.amount) / total) * 100) : ''}</td></tr>` : '');
  }
  REPORT.income = () => {
    const [from, asOf] = rangeToDate();
    const inc = RB.incomeStatement(S, from, asOf, ledger(asOf));
    const rev = inc.revenue;
    const G = (g, label) => (inc.groups[g].length ? `<tr class="grp"><td colspan="3">${label}</td></tr>${lineRows(inc.groups[g], rev, 'إجمالي ' + label)}` : '');
    const body = `<div class="tbl-wrap"><table class="tbl stmt"><thead><tr><th>البند</th><th class="num">المبلغ (${cur()})</th><th class="num">من المبيعات</th></tr></thead><tbody>
      <tr class="grp"><td colspan="3">الإيرادات</td></tr>
      <tr><td class="ind">المبيعات بدون الضريبة</td><td class="num">${N(rev)}</td><td class="num muted">100%</td></tr>
      ${G('cogs', RB.GROUPS.cogs)}
      <tr class="total"><td>مجمل الربح</td><td class="num">${N(inc.grossProfit)}</td><td class="num">${pct(rev ? (inc.grossProfit / rev) * 100 : 0)}</td></tr>
      ${G('sell', RB.GROUPS.sell)}${G('labor', RB.GROUPS.labor)}${G('occ', RB.GROUPS.occ)}${G('opex', RB.GROUPS.opex)}${G('dep', RB.GROUPS.dep)}
      <tr class="total ${inc.netBeforeZakat < 0 ? 'neg' : ''}"><td>صافي الربح قبل الزكاة</td><td class="num">${N(inc.netBeforeZakat)}</td><td class="num">${pct(rev ? (inc.netBeforeZakat / rev) * 100 : 0)}</td></tr>
      ${inc.groups.zakat.length ? lineRows(inc.groups.zakat, rev) : `<tr><td class="ind">${RB.GROUPS.zakat}</td><td class="num">${N(0)}</td><td></td></tr>`}
      <tr class="total big ${inc.net < 0 ? 'neg' : ''}"><td>صافي الربح بعد الزكاة</td><td class="num">${N(inc.net)}</td><td class="num">${pct(inc.ratios.netMargin)}</td></tr>
      </tbody></table></div>`;
    const R = inc.ratios;
    const ratio = (l, v, hint) => `<div><span>${l}</span><b class="n">${pct(v)}</b><small>${hint}</small></div>`;
    return card('قائمة الدخل', body, { sub: `${periodLabel()} · المصاريف المدفوعة مقدماً محمّلة حسب أشهرها، والإهلاك شهرياً.` }) + card('مؤشرات المطعم', `<div class="ratios">${ratio('تكلفة المواد', R.foodCost, 'المستهدف ' + pct(S.settings.targetFoodCost, 0))}${ratio('تكلفة العمالة', R.labor, 'تشمل التأمينات والسكن والرسوم')}${ratio('التكلفة الأساسية', R.prime, 'المواد + العمالة')}${ratio('الإيجار', R.occupancy, 'من المبيعات')}${ratio('عمولات البيع', R.sell, 'التطبيقات والشبكة')}${ratio('صافي الهامش', R.netMargin, 'الربح ÷ المبيعات')}</div>`);
  };
  REPORT.balance = () => {
    const [, asOf] = rangeToDate();
    const b = RB.balanceSheet(S, asOf, ledger(asOf));
    const rows = (list) => list.map((x) => `<tr><td class="ind">${esc(x.name)}</td><td class="num">${N(x.amount)}</td></tr>`).join('');
    const body = `<div class="grid2 tight"><div class="tbl-wrap"><table class="tbl stmt"><thead><tr><th>الأصول</th><th class="num">${cur()}</th></tr></thead><tbody>
      <tr class="grp"><td colspan="2">أصول متداولة</td></tr>${rows(b.cur)}<tr class="sum"><td>إجمالي المتداولة</td><td class="num">${N(b.tCur)}</td></tr>
      <tr class="grp"><td colspan="2">أصول ثابتة</td></tr>${rows(b.fixed)}<tr class="sum"><td>صافي الأصول الثابتة</td><td class="num">${N(b.tFixed)}</td></tr>
      <tr class="total"><td>إجمالي الأصول</td><td class="num">${N(b.tAssets)}</td></tr></tbody></table></div>
      <div class="tbl-wrap"><table class="tbl stmt"><thead><tr><th>الالتزامات وحقوق الشركاء</th><th class="num">${cur()}</th></tr></thead><tbody>
      <tr class="grp"><td colspan="2">الالتزامات</td></tr>${rows(b.liab) || '<tr><td class="ind muted">لا توجد</td><td></td></tr>'}<tr class="sum"><td>إجمالي الالتزامات</td><td class="num">${N(b.tLiab)}</td></tr>
      <tr class="grp"><td colspan="2">حقوق الشركاء</td></tr>${rows(b.equity)}<tr class="sum"><td>إجمالي حقوق الشركاء</td><td class="num">${N(b.tEq)}</td></tr>
      <tr class="total"><td>الإجمالي</td><td class="num">${N(b.tLiab + b.tEq)}</td></tr></tbody></table></div></div>
      ${Math.abs(b.check) > 0.01 ? `<p class="note bad">فرق غير متوقع ${fmt(b.check)} — راجع البيانات.</p>` : `<p class="note">الميزانية متوازنة: الأصول = الالتزامات + حقوق الشركاء.</p>`}`;
    return card('الميزانية العمومية', body, { sub: 'كما في ' + dtText(asOf) });
  };
  REPORT.vat = () => {
    const [from, to] = range();
    const asOf = minD(to, today());
    const L = ledger(asOf);
    // كل الإقرارات من البداية حتى اليوم (لترحيل الرصيد الدائن)، ويُعرض منها ما يلامس الفترة بكامل أرقامه
    // ولو انتهت الفترة المختارة في منتصف إقرار؛ «ملخص الفترة» وحده يتبع الفترة المختارة
    const t = today();
    const all = RB.vatReturns(S, t, ledger(t));
    const pers = all.filter((p) => p.to >= from && p.from <= to);
    // سداد لفترة قبل بداية الإقرارات: للعلم فقط، لا يُخصم من أي إقرار
    const pre = all.before || [];
    const preNote = pre.length
      ? `<p class="note">${pre.length > 1 ? 'مدفوعات لفترات' : 'سداد لفترة'} قبل بداية الإقرارات في الدفتر: ${pre
          .map((x) => `${esc(x.period || 'بدون فترة')} ${x.amount < 0 ? 'استرداد ' : ''}<b class="n">${fmt(Math.abs(x.amount))}</b> ${cur()}${x.date ? ` (${dtText(x.date)})` : ''}`)
          .join('، ')}. ${pre.length > 1 ? 'لا تُخصم من أي إقرار هنا لأن ضريبة تلك الفترات ليست مسجلة في الدفتر، لكنها تدخل' : 'لا يُخصم من أي إقرار هنا لأن ضريبة تلك الفترة ليست مسجلة في الدفتر، لكنه يدخل'} في رصيد حساب الضريبة بالميزانية.</p>`
      : '';
    const v = RB.vatReport(S, from, asOf, L);
    const regFrom = S.settings.vatRegisteredFrom;
    let h = '';
    if (!S.settings.vatRegistered) h += `<p class="note">المطعم غير مسجل في ضريبة القيمة المضافة حسب الإعدادات، فلا تُحسب ضريبة على المبيعات. التسجيل إلزامي إذا تجاوزت المبيعات الخاضعة 375,000 ر.س خلال 12 شهراً، واختياري من 187,500 ر.س.</p>`;
    else if (regFrom && from < regFrom) h += `<p class="note">التسجيل في الضريبة ساري من ${dtText(regFrom)}؛ العمليات قبله بلا ضريبة مخرجات ولا مدخلات.</p>`;
    const inRows = Object.keys(v.inputs).map((k) => `<tr><td class="ind">${esc(k)}</td><td class="num">${N(v.inputs[k].base)}</td><td class="num">${N(v.inputs[k].vat)}</td></tr>`).join('');
    h += card(
      'ملخص الفترة',
      `<div class="tbl-wrap"><table class="tbl stmt"><thead><tr><th>البند</th><th class="num">المبلغ الخاضع</th><th class="num">الضريبة</th></tr></thead><tbody>
      <tr class="grp"><td colspan="3">ضريبة المخرجات</td></tr><tr><td class="ind">المبيعات (كل القنوات)</td><td class="num">${N(v.sales.base)}</td><td class="num">${N(v.sales.vat)}</td></tr>
      <tr class="grp"><td colspan="3">ضريبة المدخلات (القابلة للخصم)</td></tr>${inRows || '<tr><td class="ind muted" colspan="3">لا توجد</td></tr>'}
      <tr class="sum"><td>إجمالي المدخلات</td><td class="num">${N(v.inBase)}</td><td class="num">${N(v.inVat)}</td></tr>
      <tr class="total big"><td>${v.net >= 0 ? 'صافي الضريبة المستحقة' : 'صافي الضريبة المستردة'}</td><td></td><td class="num">${N(Math.abs(v.net))}</td></tr>
      <tr><td class="ind">المسدد في الفترة</td><td></td><td class="num">${N(v.paid)}</td></tr></tbody></table></div>`,
      { sub: periodLabel() + ' · المشتريات غير الخاضعة لا تدخل في المدخلات.' }
    );
    h += card(
      S.settings.vatPeriod === 'monthly' ? 'الإقرارات الشهرية' : 'الإقرارات الربع سنوية',
      table(
        [
          { h: 'الفترة', f: (p) => `<b>${esc(p.label)}</b><div class="muted sm">${dtText(p.from)} — ${dtText(p.to)}</div>` },
          { h: 'ضريبة المبيعات', num: 1, f: (p) => N(p.report.sales.vat) },
          { h: 'ضريبة المدخلات', num: 1, f: (p) => N(p.report.inVat) },
          { h: 'صافي الفترة', num: 1, f: (p) => N(p.net) },
          { h: 'مرحّل من قبل', num: 1, f: (p) => (p.carried < -0.005 ? `${N(p.carried)}<div class="muted sm">رصيد دائن لك</div>` : '—') },
          { h: 'المستحق للسداد', num: 1, f: (p) => `<b>${N(p.due)}</b>${p.credit ? `<div class="muted sm">رصيد دائن ${fmt(p.credit)}</div>` : ''}` },
          { h: 'آخر موعد', f: (p) => dt(RB.monthEnd(RB.ymAdd(p.to.slice(0, 7), 1))) },
          {
            h: 'السداد',
            f: (p) => {
              if (p.to >= t) return chip('الفترة جارية', 'mute');
              const b = btn('سجّل السداد', 'add', `data-s="vatPayments" data-x="${esc(p.label)}"`, 'sm');
              const over = p.over > 0.005 ? ' ' + chip('دفعة زائدة ' + fmt(p.over), 'warn') + '<div class="muted sm">تُخصم من الإقرار التالي</div>' : '';
              if (!p.settled) return (p.paid ? chip('مسدد ' + fmt(p.paid), 'warn') : '') + (p.paid || Math.abs(p.remaining - p.due) > 0.005 ? `<div class="muted sm">المتبقي ${fmt(p.remaining)}</div>` : '') + b;
              return (p.paid ? chip('مسدد ' + fmt(p.paid), 'good') : chip('لا يوجد مستحق', 'good')) + over;
            },
          },
        ],
        pers,
        { empty: 'لا توجد فترات.' }
      ) + preNote,
      { sub: 'آخر موعد لتقديم الإقرار والسداد: نهاية الشهر التالي للفترة. الرصيد الدائن (ضريبة مدخلات أكبر من المبيعات، مثل فترة التأسيس) يُرحّل ويُخصم من الفترات التالية، إلا إذا طلبت استرداده.' }
    );
    return h;
  };
  REPORT.breakeven = () => {
    const [from, asOf] = rangeToDate();
    const e = RB.breakEven(S, from, asOf, ledger(asOf), today());
    // أساس الحساب: أشهر التشغيل الكاملة، مع توضيح ما عُدّل من الفترة المختارة
    const bA = e.basisFrom.slice(0, 7);
    const bB = e.basisTo.slice(0, 7);
    const nM = Math.round(e.months);
    const basis = e.estimate ? `${dtText(e.basisFrom)} — ${dtText(e.basisTo)}` : bA === bB ? RB.monthName(bA) : `${RB.monthName(bA)} — ${RB.monthName(bB)} (${nM === 2 ? 'شهران' : nM <= 10 ? nM + ' أشهر' : nM + ' شهراً'})`;
    const adj = [];
    // الدفتر بدأ بعد الافتتاح (مطعم قائم): بداية التشغيل في الحساب أول يوم مبيعات مسجل
    const late = e.startBy === 'sales' && !!S.settings.openingDate;
    if (e.beforeOpen) {
      const op = e.startBy === 'opening' ? 'الافتتاح' : late ? 'أول مبيعات مسجلة في الدفتر' : 'أول يوم مبيعات';
      if (!e.estimate) adj.push(`الفترة المختارة قبل ${op}، فالحساب من أول شهر تشغيل كامل (${RB.monthName(bA)}).`);
      else if (e.basisFrom > asOf) adj.push(`الفترة المختارة قبل ${op}، ولا يوجد شهر تشغيل كامل بعد، فالأرقام تقديرية من أيام التشغيل حتى اليوم.`);
      else adj.push(`الفترة المختارة قبل ${op} ولم يبدأ التشغيل بعد، فالأرقام تقديرية من مصاريف ما قبل الافتتاح ولا تمثّل التشغيل الفعلي.`);
    } else if (e.estimate) adj.push(late ? 'الدفتر بدأ بعد الافتتاح ولا يضم شهر تشغيل كاملاً بعد، فالأرقام تقديرية من الأيام المسجلة وقد لا تشمل كل المصاريف الشهرية.' : 'لا يوجد شهر تشغيل كامل بعد، فالأرقام تقديرية من الأيام المتاحة وقد لا تشمل كل المصاريف الشهرية.');
    else if (e.fallback) adj.push(asOf === today() ? `الشهر الجاري لم يكتمل بعد، فالحساب من آخر شهر كامل (${RB.monthName(bA)}).` : `الفترة المختارة لا تضم شهراً كاملاً، فالحساب من آخر شهر كامل قبل نهايتها (${RB.monthName(bA)}).`);
    else {
      if (e.cutEnd) adj.push(asOf === today() ? 'الشهر الجاري لم يكتمل بعد، فلم يدخل في الحساب.' : 'الأيام من شهر غير مكتمل في نهاية الفترة لم تدخل في الحساب.');
      if (e.preOpen) adj.push(e.startBy === 'opening' ? 'الأشهر قبل الافتتاح مستبعدة.' : late ? 'الدفتر بدأ بعد الافتتاح، فالأشهر قبل أول شهر كامل من المبيعات المسجلة مستبعدة.' : 'الأشهر قبل أول شهر كامل من المبيعات مستبعدة.');
      if (e.cutStart) adj.push('الأيام من شهر غير مكتمل في بداية الفترة لم تدخل في الحساب.');
    }
    const body = `<div class="pv-grid three"><div><span>المصاريف الثابتة شهرياً</span>${money(e.fixedMonthly)}</div><div><span>المصاريف المتغيرة</span><b class="n">${pct(e.varRatio * 100)}</b><small>المواد + العمولات من المبيعات</small></div><div><span>هامش المساهمة</span><b class="n">${pct((1 - e.varRatio) * 100)}</b><small>ما يبقى من كل ريال لتغطية الثابت</small></div></div>
      <div class="be-hero"><div><span>مبيعات التعادل الشهرية (شاملة الضريبة)</span><b class="n">${fmt(e.beGross)}</b> <small>${cur()}</small></div><div><span>يومياً</span><b class="n">${fmt(e.beDaily)}</b></div><div><span>طلبات يومياً تقريباً</span><b class="n">${e.avgTicket ? fmt0(e.beDaily / e.avgTicket) : '—'}</b></div></div>
      <p class="note">${e.revenue ? (e.safety >= 0 ? `مبيعاتك أعلى من نقطة التعادل بنسبة ${pct(e.safety)} (هامش الأمان).` : `مبيعاتك أقل من نقطة التعادل بنسبة ${pct(-e.safety)}.`) : 'سجّل مبيعات ومصاريف لحساب نقطة التعادل.'}</p>
      ${adj.length ? `<p class="note">${esc(adj.join(' '))}</p>` : ''}`;
    const parts = [
      { label: RB.GROUPS.labor, v: e.fixedParts.labor },
      { label: RB.GROUPS.occ, v: e.fixedParts.occ },
      { label: RB.GROUPS.opex, v: e.fixedParts.opex },
      { label: RB.GROUPS.dep, v: e.fixedParts.dep },
    ].filter((x) => x.v);
    return card('نقطة التعادل', body, { sub: esc(e.estimate ? `تقدير من فترة جزئية: ${basis}` : `محسوبة من الأشهر الكاملة: ${basis}`) }) + card('المصاريف الثابتة الشهرية', hbars(parts, { total: e.fixedMonthly }), { sub: esc(basis) });
  };
  REPORT.menu = () => {
    const [from, asOf] = rangeToDate();
    const m = RB.menuAnalysis(S, from, asOf, ledger(asOf));
    if (!m.hasItems) return card('تحليل المنيو', `<div class="empty-box">لتحليل المنيو سجّل الكميات المباعة من كل صنف في الإقفال اليومي (قسم «الأصناف المباعة»).</div>`);
    const cls = (c) => chip(RB.MENU_CLASS[c].name, { star: 'good', plow: 'accent', puzzle: 'warn', dog: 'bad' }[c]);
    let h = card(
      'هندسة المنيو',
      table(
        [
          { h: 'الصنف', f: (r) => `<b>${esc(r.name)}</b>` },
          { h: 'الكمية', num: 1, f: (r) => N0(r.qty) },
          { h: 'حصة المبيعات', num: 1, f: (r) => pct(r.mix) },
          { h: 'ربح الحبة', num: 1, f: (r) => N(r.profit) },
          { h: 'إجمالي الربح', num: 1, f: (r) => N(r.totalProfit) },
          { h: 'تكلفة الطعام', num: 1, f: (r) => pct(r.foodCost) },
          { h: 'فئة المنيو', f: (r) => `${cls(r.cls)}<div class="muted sm">${RB.MENU_CLASS[r.cls].tip}</div>` },
        ],
        m.rows
      ),
      { sub: `متوسط ربح الحبة ${fmt(m.avgProfit)} ${cur()}. «مطلوب» = كميته أعلى من 70% من متوسط حصة الصنف.` }
    );
    h += card(
      'التكلفة النظرية مقابل الفعلية',
      `<div class="pv-grid three"><div><span>النظرية (حسب الوصفات × المبيعات)</span>${money(m.theoretical)}<small>${pct(m.revenue ? (m.theoretical / m.revenue) * 100 : 0)} من المبيعات</small></div><div><span>الفعلية (المشتريات ± الجرد)</span>${money(m.actual)}<small>${pct(m.revenue ? (m.actual / m.revenue) * 100 : 0)} من المبيعات</small></div><div><span>الفرق غير المفسَّر</span>${money(m.variance)}<small>${pct(m.theoretical ? (m.variance / m.theoretical) * 100 : 0)} من النظرية</small></div></div><p class="note">الهدر المتوقع محسوب أصلاً في التكلفة النظرية عبر «نسبة الهدر %» لكل مادة؛ الفرق المتبقي من هدر غير مسجل، وجبات العمال، حصص أكبر، أو نقص/سرقة. تحتاج جرداً في بداية الفترة ونهايتها لتكون المقارنة دقيقة.</p>`
    );
    h += card(
      'الاستهلاك النظري للمواد الخام',
      table(
        [
          { h: 'المادة', f: (r) => `<b>${esc(r.name)}</b>` },
          { h: 'الكمية', num: 1, f: (r) => `${fmtQ(Math.round(r.qty))} ${esc(r.unit)}` },
          { h: 'بوحدة الشراء', num: 1, f: (r) => `${r.buyQty.toFixed(1)} <span class="muted sm">${esc(r.buyUnit || '')}</span>` },
          { h: 'التكلفة', num: 1, f: (r) => N(r.cost) },
        ],
        m.rawUsage
      ),
      { sub: 'ما كان يُفترض استهلاكه حسب الوصفات والكميات المباعة — قارنه بالمشتريات والجرد.' }
    );
    return h;
  };
  REPORT.monthly = () => {
    const [from, to] = range();
    let a = from.slice(0, 7);
    // لا أعمدة لأشهر لم تأتِ بعد، والشهر الجاري حتى اليوم
    const b = minD(to, today()).slice(0, 7);
    if (a >= b) a = RB.ymAdd(b, -5);
    const months = [];
    for (let ym = a; ym <= b && months.length < 24; ym = RB.ymAdd(ym, 1)) months.push(ym);
    const L = ledger(minD(RB.monthEnd(b), today()));
    const incs = months.map((ym) => RB.incomeStatement(S, ym + '-01', RB.monthEnd(ym), L));
    const row = (label, f, cls) => `<tr class="${cls || ''}"><td>${label}</td>${incs.map((i) => `<td class="num">${f(i)}</td>`).join('')}</tr>`;
    const body = `<div class="tbl-wrap"><table class="tbl stmt"><thead><tr><th>البند</th>${months.map((m) => `<th class="num">${RB.monthName(m)}</th>`).join('')}</tr></thead><tbody>
      ${row('المبيعات بدون الضريبة', (i) => N(i.revenue))}
      ${Object.keys(RB.GROUPS).map((g) => row(RB.GROUPS[g], (i) => N(i.tot[g]))).join('')}
      ${row('صافي الربح بعد الزكاة', (i) => N(i.net), 'total')}
      ${row('تكلفة المواد %', (i) => pct(i.ratios.foodCost))}
      ${row('التكلفة الأساسية %', (i) => pct(i.ratios.prime))}
      ${row('صافي الهامش %', (i) => pct(i.ratios.netMargin))}
      </tbody></table></div>`;
    return card('مقارنة الأشهر', body, { sub: a === from.slice(0, 7) ? periodLabel() : 'آخر 6 أشهر' }) + card('صافي الربح الشهري', chartSlot({ points: months.map((m, i) => ({ label: RB.MONTHS[+m.slice(5, 7) - 1], v: Math.max(incs[i].net, 0), tip: `${RB.monthName(m)}: ${fmt(incs[i].net)} ${S.settings.currency}` })), label: 'صافي الربح الشهري' }), { sub: 'الأشهر الخاسرة تظهر بدون عمود.' });
  };
  REPORT.trial = () => {
    const [from, asOf] = rangeToDate();
    const t = RB.trialBalance(S, from, asOf, ledger(asOf));
    return card(
      'ميزان المراجعة (حركة الفترة)',
      table(
        [
          { h: 'الحساب', f: (r) => `<span class="muted sm n">${esc(r.code)}</span> ${esc(r.name)}` },
          { h: 'مدين', num: 1, f: (r) => (r.dr ? N(r.dr) : '') },
          { h: 'دائن', num: 1, f: (r) => (r.cr ? N(r.cr) : '') },
        ],
        t.rows,
        { foot: ['الإجمالي', N(t.dr), N(t.cr)] }
      ),
      { sub: 'القيود تُولّد تلقائياً من كل عملية تسجلها. تساوي المدين والدائن يؤكد سلامة القيود.' }
    );
  };
  REPORT.journal = () => {
    const [from, asOf] = rangeToDate();
    const es = ledger(asOf).entries.filter((e) => e.date >= from && e.date <= asOf);
    const shown = es.slice(-300).reverse();
    const body = shown
      .map(
        (e) => `<tr class="jh"><td>${dt(e.date)}</td><td colspan="2">${esc(e.desc)}</td></tr>${e.lines.map((l) => `<tr><td></td><td class="ind">${l.v > 0 ? '' : '&emsp;'}${esc(RB.accInfo(l.a, S).name)}${l.memo ? ` <span class="muted sm">— ${esc(l.memo)}</span>` : ''}</td><td class="num">${l.v > 0 ? N(l.v) : ''}</td><td class="num">${l.v < 0 ? N(-l.v) : ''}</td></tr>`).join('')}`
      )
      .join('');
    return card('دفتر اليومية', es.length ? `<div class="tbl-wrap"><table class="tbl journal"><thead><tr><th>التاريخ</th><th>الحساب</th><th class="num">مدين</th><th class="num">دائن</th></tr></thead><tbody>${body}</tbody></table></div>${es.length > 300 ? `<p class="note">يظهر آخر 300 قيد من ${es.length}. صدّر الكل بصيغة CSV.</p>` : ''}` : `<div class="empty-box">لا قيود في هذه الفترة.</div>`, { sub: `${es.length} قيد · تُنشأ تلقائياً` });
  };

  // ─── الإعدادات ───
  PAGES.settings = () => {
    const st = S.settings;
    const backend = APP.backend ? APP.backend.kind : '';
    const where = APP.demo ? 'وضع التجربة — لا يُحفظ شيء' : backend === 'cloud' ? 'قاعدة بيانات مشتركة لهذه الصفحة: يراها ويعدّلها كل من لديه صلاحية التعديل عليها (مثل شريكك).' : 'هذا المتصفح على هذا الجهاز فقط. اجعل الإدخال من جهاز واحد، وصدّر نسخة احتياطية بانتظام. الاستيراد يستبدل كل البيانات ولا يدمجها؛ للعمل مع شريكك على نفس الدفتر استخدما نسخة Claude المشتركة.';
    const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
    let h = pageHead('الإعدادات والنسخ الاحتياطي', 'بيانات المطعم، الضريبة، نسب التأمينات، قنوات البيع، والنسخ الاحتياطي');
    h += `<div class="grid2">`;
    h += card('بيانات المطعم', kv('الاسم', esc(st.name)) + kv('المدينة', esc(st.city || '—')) + kv('السجل التجاري', esc(st.crNumber || '—')) + kv('تاريخ الافتتاح', st.openingDate ? dtText(st.openingDate) : '—') + kv('مستهدف تكلفة الطعام', pct(st.targetFoodCost, 0)) + kv('تقريب السعر المقترح', fmt(st.priceRounding) + ' ' + cur()), { actions: btn('تعديل', 'settings', 'data-v="general"', 'sm') });
    h += card('ضريبة القيمة المضافة', kv('مسجل في الضريبة', st.vatRegistered ? 'نعم' : 'لا') + (st.vatRegistered ? kv('سريان التسجيل', st.vatRegisteredFrom ? dtText(st.vatRegisteredFrom) : 'منذ البداية') : '') + kv('الرقم الضريبي', esc(st.vatNumber || '—')) + kv('النسبة', pct(st.vatRate, 0)) + kv('فترة الإقرار', st.vatPeriod === 'monthly' ? 'شهرية' : 'ربع سنوية') + kv('ضريبة على العمولات والرسوم', st.feeVat ? 'نعم' : 'لا'), { actions: btn('تعديل', 'settings', 'data-v="vat"', 'sm') });
    h += card('التأمينات الاجتماعية ورسوم العمالة', kv('السعودي (النظام السابق) — حصة المنشأة', pct(st.gosi.saudiEr, 2)) + kv('السعودي (النظام السابق) — حصة الموظف', pct(st.gosi.saudiEe, 2)) + kv('السعودي (النظام الجديد)', '<span class="n">+0.5%</span> لكل طرف كل يوليو 2025–2028') + kv('غير السعودي — حصة المنشأة', pct(st.gosi.expatEr, 2)) + kv('الحد الأعلى للأجر الخاضع', fmt0(st.gosi.cap)) + kv('المقابل المالي الشهري (افتراضي)', fmt(st.labor.levyMonthly)) + kv('الإقامة سنوياً (افتراضي)', fmt(st.labor.iqamaAnnual)) + kv('رخصة العمل سنوياً (افتراضي)', fmt(st.labor.workPermitAnnual)) + kv('التأمين الطبي سنوياً (افتراضي)', fmt(st.labor.medicalAnnual)), { actions: btn('تعديل', 'settings', 'data-v="labor"', 'sm'), sub: 'قيم افتراضية قابلة للتعديل. راجع آخر النسب المعتمدة من التأمينات الاجتماعية ومنصة قوى.' });
    h += card(
      'الحفظ والنسخ الاحتياطي',
      `<p class="note">مكان الحفظ: <b>${where}</b>${APP.savedAt ? `<br>آخر حفظ: ${TIMEF.format(new Date(APP.savedAt))}` : ''}${backend === 'local' && !APP.demo ? `<br>آخر نسخة احتياطية من هذا المتصفح: ${lastBackupText()}` : ''}</p>
      <div class="btn-row">${btn('تصدير نسخة احتياطية', 'backup', '', 'primary')}${btn('نسخ النسخة للحافظة', 'copybackup', '', 'ghost')}<label class="btn ghost file-btn">استيراد نسخة<input type="file" accept=".json,application/json" id="importFile" hidden></label></div>
      <div class="btn-row">${APP.demo ? (APP.real ? btn('الرجوع لبياناتي', 'leavedemo', '', 'primary') : btn('ابدأ ببيانات مطعمك', 'start', '', 'primary')) : btn('عرض البيانات التجريبية', 'showdemo', '', 'ghost') + btn('مسح كل البيانات', 'wipe', '', 'danger ghost')}</div>`
    );
    h += `</div>`;
    h += card(
      'قنوات البيع وعمولاتها',
      table(
        [
          { h: 'القناة', f: (c) => `<b>${esc(c.name)}</b>` },
          { h: 'النوع', f: (c) => esc(RB.CHANNEL_TYPES[c.type] || c.type) },
          { h: 'العمولة / الرسوم', num: 1, f: (c) => (c.type === 'cash' ? '—' : pct(c.feePct, 2)) },
          { h: 'الحالة', f: (c) => (c.active === false ? chip('موقوفة', 'mute') : chip('مفعّلة', 'good')) },
          { h: '', f: (c) => `<div class="row-acts"><button type="button" class="icon-btn" data-act="channel" data-id="${esc(c.id)}" aria-label="تعديل" title="تعديل">✎</button><button type="button" class="icon-btn danger" data-act="delchannel" data-id="${esc(c.id)}" aria-label="حذف" title="حذف">✕</button></div>` },
        ],
        st.channels
      ),
      { actions: btn('+ قناة أو تطبيق', 'channel', '', 'sm'), sub: 'نسب العمولات افتراضية — عدّلها حسب عقدك مع كل تطبيق. العمولة تُحفظ مع كل إقفال، فتعديلها لا يغيّر الأيام السابقة.' }
    );
    return h;
  };

  // ═════════════ النماذج ═════════════
  const FORMS = {};
  const LEVY_HELP = 'المقابل المالي 800 ر.س شهرياً لكل وافد إذا زاد عدد الوافدين عن السعوديين في المنشأة، و700 ر.س إذا كانوا مساوين أو أقل — تحقق من قيمته في منصة قوى.';
  const MED_HELP = 'إلزامي لكل عامل وافد ولكل موظف سعودي في القطاع الخاص (نظام الضمان الصحي التعاوني) — أدخل قسط وثيقتك الفعلي';
  const vatFields = (redraw) => [
    { type: 'row', fields: [{ k: 'taxable', type: 'check', label: 'خاضع لضريبة القيمة المضافة', redraw: true, help: 'اختره إذا كانت الفاتورة ضريبية فيها الرقم الضريبي للمورد. في السعودية لا إعفاء للأغذية (خضار، لحوم، خبز = 15%). غير الخاضع: الرسوم الحكومية، إيجار السكن، أو مورد غير مسجل/بدون فاتورة ضريبية. فاتورة 1,000 ر.س فأكثر يلزم أن تكون باسم المطعم ورقمه الضريبي لخصم ضريبتها.' }, { k: 'includesVat', type: 'check', label: 'المبلغ المدخل شامل الضريبة', redraw: !!redraw, show: (v) => v.taxable }] },
  ];

  FORMS.partners = (rec) =>
    formModal({
      title: rec ? 'تعديل شريك' : 'شريك جديد',
      value: rec || { id: RB.uid(), name: '', share: S.partners.length ? Math.max(0, 100 - RB.sum(S.partners, (p) => num(p.share))) : 50, phone: '', note: '' },
      fields: [
        { k: 'name', label: 'اسم الشريك', req: 1 },
        { type: 'row', fields: [{ k: 'share', type: 'num', label: 'نسبة الشراكة %', req: 1, help: 'يتوزع الربح حسبها' }, { k: 'phone', label: 'الجوال' }] },
        { k: 'note', type: 'textarea', label: 'ملاحظات' },
      ],
      onSave: (v) => upsert('partners', v),
    });

  FORMS.capital = (rec, x) => {
    if (!S.partners.length) return toast('أضف الشركاء أولاً.', 'bad');
    return formModal({
      title: rec ? 'تعديل حركة رأس مال' : x === 'withdrawal' ? 'سحب شريك' : 'إيداع رأس مال',
      value: rec || { id: RB.uid(), date: today(), partnerId: S.partners[0].id, type: x || 'contribution', account: 'bank', amount: '', note: '' },
      fields: [
        { type: 'row', fields: [{ k: 'date', type: 'date', label: 'التاريخ', req: 1 }, { k: 'partnerId', type: 'select', label: 'الشريك', options: S.partners.map((p) => [p.id, p.name]) }] },
        { type: 'row', fields: [{ k: 'type', type: 'select', label: 'النوع', options: [['contribution', 'إيداع في رأس المال'], ['withdrawal', 'سحب / توزيع أرباح']] }, { k: 'account', type: 'select', label: 'الحساب', options: [['bank', RB.PAY_LABEL.bank], ['cash', RB.PAY_LABEL.cash]] }] },
        { k: 'amount', type: 'money', label: 'المبلغ', req: 1, min: 0 },
        { k: 'note', label: 'ملاحظة' },
      ],
      onSave: (v) => upsert('capital', v),
    });
  };

  FORMS.assets = (rec) => {
    // التأمين المسترد لا ضريبة عليه: يُفرض «غير خاضع» عند اختيار التصنيف وعند فتح سجل محفوظ أو حفظه
    const noVat = (v) => Object.assign(v, { taxable: false, includesVat: false });
    const value = Object.assign({}, rec || { id: RB.uid(), date: today(), name: '', category: 'kitchen', amount: '', includesVat: false, taxable: true, account: 'bank', lifeMonths: 60, salvage: 0, supplier: '', note: '' });
    if (value.category === 'deposit') noVat(value);
    return formModal({
      title: rec ? 'تعديل أصل' : 'أصل جديد',
      value,
      onChange: (p, v) => {
        if (p !== 'category') return;
        v.lifeMonths = RB.assetCat(v.category).life;
        v.taxable = v.category !== 'deposit';
        if (!v.taxable) v.includesVat = false;
      },
      fields: (v) => [
        { k: 'name', label: 'اسم الأصل', req: 1, placeholder: 'مثال: شواية برقر مسطحة' },
        { type: 'row', fields: [{ k: 'category', type: 'select', label: 'تصنيف الأصل', options: RB.ASSET_CATS.map((c) => [c.id, c.name]), redraw: true }, { k: 'date', type: 'date', label: 'تاريخ الشراء', req: 1 }] },
        { type: 'html', html: (x) => `<p class="note">${esc(RB.assetCat(x.category).hint)}</p>` },
        { type: 'row', fields: [{ k: 'amount', type: 'money', label: 'المبلغ', req: 1, min: 0 }, { k: 'account', type: 'select', label: 'دُفع من', options: payOptions(true) }] },
        ...(v.category === 'deposit' ? [{ type: 'html', html: () => '<p class="note">التأمين المسترد لا تُحتسب عليه ضريبة القيمة المضافة</p>' }] : vatFields()),
        { type: 'row', fields: [{ k: 'lifeMonths', type: 'num', label: 'العمر الإنتاجي (بالأشهر)', min: 0, help: '0 = لا يُستهلك (مثل التأمين المسترد)' }, { k: 'salvage', type: 'money', label: 'القيمة المتبقية في النهاية', min: 0 }] },
        { k: 'supplier', label: 'المورد' },
        { k: 'note', type: 'textarea', label: 'ملاحظات' },
      ],
      preview: (v) => {
        const sch = RB.depSchedule(Object.assign({}, v, { date: v.date || today() }), S);
        return vatPreview(v.amount, v.includesVat, RB.assetTaxable(v), v.date) + (sch.monthly ? `<p class="note">يُحمّل <b class="n">${fmt(sch.monthly)}</b> ${cur()} شهرياً على المصاريف لمدة ${sch.life} شهراً، بدءاً من ${RB.monthName(sch.months[0].ym)}.</p>` : `<p class="note">لا يُستهلك هذا الأصل.</p>`);
      },
      onSave: (v) => {
        if (v.account === 'payable' && !(v.supplier || '').trim()) return 'اكتب اسم المورد أو الجهة للشراء الآجل.';
        if (v.category === 'deposit') noVat(v);
        upsert('assets', v);
      },
    });
  };

  FORMS.expenses = (rec, x) => {
    const isGov = x === 'gov' || (rec && RB.GOV_CATS.includes(rec.category));
    const cat0 = x && RB.EXPENSE_CATS.some((c) => c.id === x) ? x : isGov ? 'gov' : 'utilities';
    // بلا ضريبة افتراضياً: سكن العمال والرسوم الحكومية والزكاة
    const noVat = ['housing', 'gov', 'labor_gov', 'zakat'];
    // الزكاة تخص السنة المالية السابقة لسنة الدفع (بداية التغطية = أول تلك السنة)
    const zakatStart = (d) => +(d || today()).slice(0, 4) - 1 + '-01-01';
    const empCats = ['labor_gov', 'insurance', 'staff'];
    const oneOffCats = RB.GOV_CATS.concat(['rent', 'housing']);
    const base = { id: RB.uid(), date: today(), category: cat0, desc: '', entity: '', amount: '', includesVat: true, taxable: !noVat.includes(cat0), account: 'bank', months: RB.expenseCat(cat0).months, startDate: cat0 === 'zakat' ? zakatStart(today()) : '', employeeId: '', note: '', preset: '' };
    const presetList = RB.GOV_PRESETS.map((p, i) => [String(i), p.entity + ' — ' + p.desc]);
    // العامل الذي ترك العمل قبل تاريخ الدفع: لا تعبئة تلقائية له، ويظهر آخر القائمة بعلامة «(غادر)»
    const gone = (e, d) => e.active === false || (!!e.endDate && e.endDate < (d || today()));
    const empOptions = (v) => [['', '— للجميع —']].concat(S.employees.slice().sort((a, b) => gone(a, v.date) - gone(b, v.date)).map((e) => [e.id, e.name + (gone(e, v.date) ? ' (غادر)' : '')]));
    // المبلغ التلقائي يتبع القالب والعامل ما دام المستخدم لم يكتب مبلغاً غيره (v._auto مؤقت لا يُحفظ)
    const applyAuto = (v) => {
      const blank = v.amount === '' || v.amount === undefined || v.amount === null;
      if (!blank && !(v._auto !== undefined && num(v.amount) === v._auto)) return;
      const e = v.employeeId && empCats.includes(v.category) ? S.employees.find((z) => z.id === v.employeeId) : null;
      const pr = v.preset !== '' && v.preset !== undefined ? RB.GOV_PRESETS[+v.preset] : null;
      const a = e && !gone(e, v.date) ? RB.autoFeeAmount(pr ? pr.auto : undefined, e, pr ? '' : v.category) : 0;
      v.amount = a || '';
      if (a) v._auto = a;
      else delete v._auto;
    };
    const onCategory = (v) => {
      if (!empCats.includes(v.category)) v.employeeId = '';
      if (!oneOffCats.includes(v.category)) delete v.oneOff;
      if (v.category === 'zakat') {
        v.taxable = false;
        if (!v.startDate) v.startDate = v._zs = zakatStart(v.date);
      } else if (v._zs && v.startDate === v._zs) {
        // بداية التغطية الافتراضية للزكاة لا تخص التصنيفات الأخرى
        v.startDate = '';
        delete v._zs;
      }
    };
    return formModal({
      title: rec ? 'تعديل مصروف' : isGov ? 'رسم حكومي أو اشتراك' : 'مصروف تشغيلي',
      value: rec ? Object.assign({ preset: '' }, rec) : base,
      onChange: (p, v) => {
        if (p === 'category') {
          v.months = RB.expenseCat(v.category).months;
          v.taxable = !noVat.includes(v.category);
          onCategory(v);
        }
        if (p === 'preset' && v.preset !== '') {
          const pr = RB.GOV_PRESETS[+v.preset];
          Object.assign(v, { entity: pr.entity, desc: pr.desc, category: pr.category, months: pr.months, taxable: ['insurance', 'shop_insurance', 'software'].includes(pr.category), oneOff: !!pr.oneOff });
          onCategory(v);
        }
        // تاريخ دفع الزكاة يحدد سنتها ما دامت بداية التغطية هي الافتراضية
        if (p === 'date' && v.category === 'zakat' && v.startDate && v.startDate === v._zs) v.startDate = v._zs = zakatStart(v.date);
        if (p === 'preset' || p === 'employeeId' || p === 'category') applyAuto(v);
      },
      fields: (v) => [
        ...(isGov && !rec ? [{ k: 'preset', type: 'select', label: 'اختر من القائمة (اختياري)', options: [['', '— بند آخر —']].concat(presetList), redraw: true }] : []),
        { type: 'row', fields: [{ k: 'category', type: 'select', label: 'التصنيف', options: RB.EXPENSE_CATS.map((c) => [c.id, c.name]), redraw: true }, { k: 'date', type: 'date', label: 'تاريخ الدفع', req: 1, redraw: v.category === 'zakat' }] },
        ...(v.category === 'zakat' ? [{ type: 'html', html: () => '<p class="note">يُقدَّم إقرار الزكاة ويُسدَّد خلال 120 يوماً من نهاية السنة المالية؛ الزكاة 2.5% من الوعاء الزكوي، وتُحمَّل على السنة التي تخصها.</p>' }] : []),
        ...(v.category === 'insurance' ? [{ type: 'html', html: () => '<p class="note">اشتراكات التأمينات الاجتماعية (GOSI) تُحسب وتُسجَّل تلقائياً من مسير الرواتب — لا تسجّل فاتورة سداد التأمينات هنا حتى لا تُحسب مرتين.</p>' }] : []),
        { type: 'row', fields: [{ k: 'desc', label: 'البيان', req: 1, placeholder: 'مثال: فاتورة الكهرباء' }, { k: 'entity', label: v.category === 'rent' || v.category === 'housing' ? 'المؤجر' : 'الجهة / المورد', list: () => [...new Set(S.expenses.map((e) => e.entity).filter(Boolean))] }] },
        ...(empCats.includes(v.category) ? [{ k: 'employeeId', type: 'select', label: 'العامل (اختياري)', options: empOptions, redraw: true }] : []),
        { type: 'row', fields: [{ k: 'amount', type: 'money', label: 'المبلغ', req: 1, min: 0 }, { k: 'account', type: 'select', label: 'دُفع من', options: payOptions(true) }] },
        ...vatFields(),
        {
          type: 'row',
          fields: [
            { k: 'months', type: 'num', label: 'يغطي كم شهر؟', min: 1, help: 'مثال: إيجار 6 أشهر، رخصة سنة = 12' },
            v.category === 'zakat' ? { k: 'startDate', type: 'date', label: 'بداية السنة المالية التي تخصها', help: 'تُحمَّل الزكاة على هذه السنة لا على سنة الدفع' } : { k: 'startDate', type: 'date', label: 'بداية التغطية', help: 'إن اختلفت عن تاريخ الدفع' },
          ],
        },
        ...(oneOffCats.includes(v.category) ? [{ k: 'oneOff', type: 'check', label: 'رسم لمرة واحدة (لا يحتاج تجديد)' }] : []),
        ...(rec && rec.noRenew ? [{ k: 'noRenew', type: 'check', label: 'أوقفت متابعة تجديده' }] : []),
        { k: 'note', type: 'textarea', label: 'ملاحظات' },
      ],
      preview: (v) => {
        const months = Math.max(1, Math.round(num(v.months) || 1));
        const c = RB.costSplit(v.amount, v.includesVat, v.taxable, S.settings, v.date || today());
        const sym = (v.startDate || v.date || today()).slice(0, 7);
        const one = months === 1 && sym !== (v.date || today()).slice(0, 7) ? `<p class="note">يُحمَّل على شهر ${esc(RB.monthName(sym))}.</p>` : '';
        return vatPreview(v.amount, v.includesVat, v.taxable, v.date) + one + (months > 1 ? `<p class="note">يُوزّع على ${months} شهر: <b class="n">${fmt(c.cost / months)}</b> ${cur()} شهرياً، والتغطية حتى ${dtText(RB.coverageEnd(v.startDate || v.date || today(), months))}.</p>` : '');
      },
      onSave: (v) => {
        if (v.account === 'payable' && !(v.entity || '').trim()) return 'اكتب اسم المورد أو الجهة للشراء الآجل.';
        delete v.preset;
        delete v._auto;
        delete v._zs;
        upsert('expenses', v);
      },
    });
  };

  FORMS.employees = (rec) => {
    const L = S.settings.labor;
    return formModal({
      title: rec ? 'تعديل بيانات موظف' : 'موظف جديد',
      wide: true,
      value: rec || { id: RB.uid(), name: '', job: '', nationality: 'expat', startDate: today(), endDate: '', active: true, basic: '', housing: 0, transport: 0, otherAllow: 0, levyMonthly: L.levyMonthly, iqamaAnnual: L.iqamaAnnual, workPermitAnnual: L.workPermitAnnual, medicalAnnual: L.medicalAnnual, ticketAnnual: 0, housingCost: 0, otherAnnual: 0, note: '' },
      onChange: (p, v) => {
        if (p === 'nationality' && v.nationality === 'saudi') Object.assign(v, { levyMonthly: 0, iqamaAnnual: 0, workPermitAnnual: 0 });
        if (p === 'nationality' && v.nationality !== 'saudi' && !num(v.levyMonthly)) Object.assign(v, { levyMonthly: L.levyMonthly, iqamaAnnual: L.iqamaAnnual, workPermitAnnual: L.workPermitAnnual });
        // السعودي الجديد: النظام الجديد افتراضياً؛ السجل القائم بلا قيمة يبقى على النظام السابق
        if (p === 'nationality' && v.nationality === 'saudi' && !rec && !v.gosiSystem) v.gosiSystem = 'new';
      },
      fields: (v) => [
        { type: 'row', fields: [{ k: 'name', label: 'الاسم', req: 1 }, { k: 'job', label: 'الوظيفة', placeholder: 'طباخ، كاشير، عامل نظافة…' }] },
        { type: 'row', fields: [{ k: 'nationality', type: 'select', label: 'الجنسية', options: [['expat', 'غير سعودي'], ['saudi', 'سعودي']], redraw: true }, { k: 'startDate', type: 'date', label: 'تاريخ المباشرة' }, { k: 'endDate', type: 'date', label: 'تاريخ ترك العمل' }] },
        {
          k: 'gosiSystem',
          type: 'select',
          label: 'نظام التأمينات الاجتماعية',
          show: (x) => x.nationality === 'saudi',
          options: [['old', 'مسجّل في التأمينات قبل 3 يوليو 2024 (النظام السابق)'], ['new', 'أول تسجيل في التأمينات من 3 يوليو 2024 (النظام الجديد)']],
          help: 'يحدده تاريخ أول تسجيل في التأمينات في أي منشأة، لا تاريخ التعيين عندكم',
        },
        { type: 'section', label: 'الراتب الشهري' },
        { type: 'row', fields: [{ k: 'basic', type: 'money', label: 'الراتب الأساسي', req: 1, min: 0 }, { k: 'housing', type: 'money', label: 'بدل السكن', min: 0 }, { k: 'transport', type: 'money', label: 'بدل النقل', min: 0 }, { k: 'otherAllow', type: 'money', label: 'بدلات أخرى (إعاشة…)', min: 0 }] },
        { type: 'section', label: 'تكاليف أخرى على المطعم' },
        ...(v.nationality !== 'saudi' ? [{ type: 'row', fields: [{ k: 'levyMonthly', type: 'money', label: 'المقابل المالي شهرياً', min: 0, help: LEVY_HELP }, { k: 'iqamaAnnual', type: 'money', label: 'رسوم الإقامة سنوياً', min: 0 }, { k: 'workPermitAnnual', type: 'money', label: 'رخصة العمل سنوياً', min: 0 }] }] : []),
        { type: 'row', fields: [{ k: 'medicalAnnual', type: 'money', label: 'التأمين الطبي سنوياً', min: 0, help: MED_HELP }, { k: 'ticketAnnual', type: 'money', label: 'تذاكر السفر سنوياً', min: 0 }, { k: 'housingCost', type: 'money', label: 'نصيبه من سكن العمال شهرياً', min: 0 }, { k: 'otherAnnual', type: 'money', label: 'رسوم أخرى سنوياً', min: 0 }] },
        // بلا اختيار صريح يُفترض العيني إن لم يكن له بدل سكن نقدي وله نصيب من سكن العمال
        { k: 'housingInKind', type: 'check', label: 'السكن مقدَّم عيناً من المطعم (يُحتسب للتأمينات بأجر شهرين في السنة)', get: (x) => RB.housingInKind(x) },
        { k: 'active', type: 'check', label: 'على رأس العمل' },
        // من ترك العمل يبقى مخصصه التزاماً حتى تُسجَّل مكافأته في مسير، أو يُحدَّد هنا أنه لا مكافأة له
        {
          k: 'eosbNone',
          type: 'check',
          label: 'لا مكافأة نهاية خدمة مستحقة له (كالاستقالة قبل إكمال سنتين)',
          show: (x) => !!x.endDate,
          live: true,
          help: 'يُرد مخصصه إلى المصروف بتاريخ ترك العمل. إن كانت له مكافأة فلا تختره، وسجّلها في مسير رواتب: «إضافة موظف» ثم اختره.',
        },
        { k: 'note', type: 'textarea', label: 'ملاحظات' },
      ],
      // مخصص نهاية الخدمة لمن ترك العمل يبقى قائماً حتى تُسوّى مكافأته
      preview: (v) =>
        empCostHTML(v) +
        (v.active === false && !v.endDate
          ? '<p class="note bad">حدّد «تاريخ ترك العمل» إن ترك العمل، ثم سجّل مكافأة نهاية الخدمة في مسير رواتب أو اختر «لا مكافأة مستحقة» ليُسوّى مخصصه.</p>'
          : v.endDate && !v.eosbNone
            ? '<p class="note">يبقى مخصص نهاية الخدمة التزاماً حتى تُسجَّل مكافأته في مسير رواتب («إضافة موظف» ثم اختره)، ويُرد ما زاد منه على المكافأة إلى المصروف.</p>'
            : ''),
      onSave: (v) => {
        if (!v.endDate || !v.eosbNone) delete v.eosbNone;
        upsert('employees', v);
      },
    });
  };
  function empCostHTML(e) {
    const ym = today().slice(0, 7);
    const c = RB.employeeMonthlyCost(e, S, ym);
    // النسب الفعلية لهذا الشهر (السعودي في النظام الجديد تزيد نسبته كل يوليو)
    const rp = (x) => `<span class="n">${+num(x).toFixed(2)}%</span>`;
    const saudi = e.nationality === 'saudi';
    const r = saudi ? RB.gosiSaudiRates(e, S, ym) : { er: S.settings.gosi.expatEr, ee: 0 };
    const rates = saudi ? `بنسبة ${rp(r.er)} على المنشأة و${rp(r.ee)} على الموظف (${e.gosiSystem === 'new' ? 'النظام الجديد' : 'النظام السابق'})` : `بنسبة ${rp(r.er)} على المنشأة`;
    // التأمين الطبي إلزامي: يظهر دائماً، وبلا قسط يُنبَّه عليه
    const row = (i) => `<tr><td>${esc(i.label)}${i.k === 'medical' && !i.v ? '<div class="note bad">لم يُدخل قسط التأمين الطبي (إلزامي)</div>' : ''}</td><td class="num">${N(i.v)}</td></tr>`;
    return `<div class="tbl-wrap"><table class="tbl mini"><tbody>${c.items.filter((i) => i.v || i.k === 'medical').map(row).join('')}<tr class="total"><td>التكلفة الشهرية الحقيقية</td><td class="num">${N(c.total)}</td></tr></tbody></table></div>
      <p class="note">التأمينات ${rates} من أجر خاضع ${fmt(c.gosi.base)}. الأجر الخاضع = الأساسي + بدل السكن (أو السكن العيني مقدّراً بأجر شهرين في السنة). ${c.gosi.ee ? `يُخصم من الموظف ${fmt(c.gosi.ee)} فيصله صافي ${fmt(c.netPay)}.` : 'لا يُخصم من الموظف غير السعودي.'} تكلفته السنوية ≈ ${fmt(c.total * 12)} ${cur()}.</p>`;
  }

  FORMS.payroll = (rec, empId) => {
    const ym = RB.ymAdd(today().slice(0, 7), today().slice(8) >= '25' ? 0 : -1);
    // نسب التأمينات حسب شهر المسير (النظام الجديد للسعودي يتغير كل يوليو)
    const fill = (v) => (v.lines = S.employees.filter((e) => RB.isEmployeeActive(e, v.month)).map((e) => RB.payrollLine(e, S, v.month)));
    const base = { id: RB.uid(), month: ym, date: RB.monthEnd(ym) <= today() ? RB.monthEnd(ym) : today(), account: 'bank', gosiAccount: 'bank', lines: [], note: '' };
    if (!rec) fill(base);
    const nCol = (k, label) => ({ k, label, type: 'num', num: 1 });
    const empOf = (id) => (id ? S.employees.find((e) => e.id === id) : null);
    // من تنبيه «لم تُسوَّ مكافأة نهاية الخدمة»: مسير تسوية اليوم بسطر واحد لمن ترك العمل، والمكافأة مقترحة بمقدار مخصصه
    const settleEmp = !rec && empOf(empId);
    if (settleEmp) {
      const prov = Math.max(0, RB.eosbBalances(S, today(), { release: false })[settleEmp.id] || 0);
      Object.assign(base, {
        month: today().slice(0, 7),
        date: today(),
        note: 'تسوية نهاية الخدمة: ' + settleEmp.name,
        lines: [Object.assign(RB.payrollLine(settleEmp, S, today().slice(0, 7)), { basic: 0, housing: 0, allowances: 0, gosiEe: 0, gosiEr: 0, eosbPaid: prov })],
      });
    }
    // الموظف في السطر: من على رأس العمل، ثم من ترك العمل أو توقف (لصرف مكافأته)، أو عامل غير مسجل باسم حر.
    // من لم يباشر بعد في شهر المسير لا يُعرض (إلا إن كان مختاراً في السطر)
    const empOpts = (r, v) => {
      const st = (e) => RB.employeeStatus(e, v.month);
      const list = S.employees.filter((e) => st(e) === 'active').concat(S.employees.filter((e) => st(e) === 'left' || st(e) === 'stopped' || (st(e) === 'future' && e.id === r.employeeId)));
      const o = [['', '— عامل غير مسجل —']].concat(list.map((e) => [e.id, e.name + (st(e) === 'active' ? '' : ' — ' + EMP_STATUS[st(e)])]));
      if (r.employeeId && !empOf(r.employeeId)) o.push([r.employeeId, (r.name || 'موظف') + ' — محذوف']);
      return o;
    };
    // مخصص الموظف المتاح للصرف في هذا المسير: مع استحقاق هذا المسير، وقبل صرفه ورد الباقي عند ترك العمل
    const provAt = (v) => {
      const draft = Object.assign({}, v, { lines: (v.lines || []).map((l) => Object.assign({}, l, { eosbPaid: 0 })) });
      return RB.eosbBalances(Object.assign({}, S, { payroll: S.payroll.filter((p) => p.id !== v.id).concat([draft]) }), v.date, { release: false });
    };
    return formModal({
      title: rec ? 'تعديل مسير رواتب' : settleEmp ? 'تسوية نهاية الخدمة' : 'مسير رواتب',
      wide: true,
      value: rec || base,
      onChange: (p, v) => {
        // مسير التسوية يبقى بسطر من ترك العمل وإن تغيّر شهره
        if (p === 'month' && !rec && !settleEmp) {
          fill(v);
          v.date = RB.monthEnd(v.month) <= today() ? RB.monthEnd(v.month) : today();
        }
        const m = p.match(/^lines\.(\d+)\.employeeId$/);
        const row = m && v.lines[+m[1]];
        const e = row && empOf(row.employeeId);
        if (e) {
          // على رأس العمل في الشهر: راتبه وتأميناته من بياناته؛ من ترك العمل: سطر تسوية بلا راتب
          const pl = RB.isEmployeeActive(e, v.month) ? RB.payrollLine(e, S, v.month) : { basic: 0, housing: 0, allowances: 0, gosiEe: 0, gosiEr: 0 };
          row.name = e.name;
          for (const k of ['basic', 'housing', 'allowances', 'gosiEe', 'gosiEr']) row[k] = pl[k];
        }
      },
      fields: [
        { type: 'row', fields: [{ k: 'month', type: 'month', label: 'الشهر', req: 1, redraw: true }, { k: 'date', type: 'date', label: 'تاريخ الصرف', req: 1, help: 'تُحمَّل التكلفة على الشهر المختار مهما كان تاريخ الصرف' }, { k: 'account', type: 'select', label: 'صُرفت من', options: payOptions(false, false) }, { k: 'gosiAccount', type: 'select', label: 'التأمينات سُددت من', options: payOptions(false, false) }] },
        {
          k: 'lines',
          type: 'lines',
          label: 'الموظفون',
          addLabel: 'إضافة موظف',
          tools: [{ id: 'fill', label: 'تعبئة من بيانات الموظفين', run: (v, rows) => rows.splice(0, rows.length, ...S.employees.filter((e) => RB.isEmployeeActive(e, v.month)).map((e) => RB.payrollLine(e, S, v.month))) }],
          newRow: () => ({ employeeId: '', name: '', basic: 0, housing: 0, allowances: 0, additions: 0, deductions: 0, gosiEe: 0, gosiEr: 0, eosbPaid: 0 }),
          cols: [
            {
              k: 'employeeId',
              label: 'الموظف',
              type: 'select',
              options: empOpts,
              redraw: true,
              cls: 'emp',
              extra: (r, i) => (r.employeeId ? '' : `<input type="text" class="sub" data-path="lines.${i}.name" value="${esc(r.name || '')}" placeholder="اسم العامل" aria-label="اسم العامل ${i + 1}">`),
            },
            nCol('basic', 'الأساسي'),
            nCol('housing', 'السكن'),
            nCol('allowances', 'بدلات'),
            nCol('additions', 'إضافي ومكافآت'),
            nCol('deductions', 'خصومات وغياب'),
            nCol('gosiEe', 'تأمينات الموظف'),
            nCol('gosiEr', 'تأمينات المنشأة'),
            Object.assign(nCol('eosbPaid', 'مكافأة نهاية الخدمة المصروفة'), {
              cls: 'wrap',
              hint: (r, v) => {
                if (!r.employeeId) return '';
                const b = provAt(v)[r.employeeId] || 0;
                return b > 0 || num(r.eosbPaid) > 0 ? `مخصصه <span class="n">${fmt(b)}</span>` : '';
              },
            }),
            { k: 'net', label: 'الصافي', num: 1, calc: (r) => fmt(RB.payrollLineGross(r) - num(r.gosiEe)) },
          ],
          help: '«مكافأة نهاية الخدمة المصروفة» تُكتب عند انتهاء خدمة الموظف فقط: تُخصم من مخصصه المتراكم (يظهر تحتها)، ولا تدخل في إجمالي الرواتب ولا في التأمينات. لموظف ترك العمل: «إضافة موظف» ثم اختره من القائمة.',
          foot: (v) => {
            const t = RB.payrollTotals(v);
            // تسوية من ترك العمل (مسير شهر تركه أو ما بعده): بصرف مكافأته يُرد ما بقي من مخصصه إلى المصروف،
            // وبلا مكافأة يبقى المخصص التزاماً إلا إن حُدّد في بياناته أنه لا مكافأة له
            let prov = null;
            const settle = (v.lines || [])
              .map((l) => {
                const e = empOf(l.employeeId);
                if (!e) return '';
                if (e.active === false && !e.endDate) return `<li>${esc(e.name)} متوقف بلا تاريخ ترك العمل: حدّده في بياناته ليُسوّى مخصص نهاية الخدمة.</li>`;
                if (!RB.eosbFinalRun(e, v)) return '';
                prov = prov || provAt(v);
                const b = prov[e.id] || 0;
                const p = Math.max(0, num(l.eosbPaid));
                const rest = RB.r2(b - p);
                const head = `${esc(e.name)} ترك العمل في ${dtText(e.endDate)}: مخصصه <span class="n">${fmt(b)}</span>`;
                if (!p) {
                  if (!(b > 0)) return '';
                  return `<li>${head}${e.eosbNone ? '، ولا مكافأة مستحقة له فيُرد إلى المصروف.' : '، ويبقى التزاماً حتى تُسجَّل مكافأته (هنا أو في مسير لاحق). إن لم تكن له مكافأة (كالاستقالة قبل سنتين) فاختر «لا مكافأة مستحقة» في بياناته.'}</li>`;
                }
                return `<li>${head}، يُصرف منه <span class="n">${fmt(Math.min(p, b))}</span>${rest > 0 ? `، ويُرد الباقي <span class="n">${fmt(rest)}</span> إلى المصروف (المكافأة المستحقة أقل من المخصص، كالاستقالة).` : rest < 0 ? `، والزيادة <span class="n">${fmt(-rest)}</span> مصروف في تاريخ الصرف.` : '.'}</li>`;
              })
              .join('');
            return `<div class="pv-grid four"><div><span>إجمالي الرواتب</span>${money(t.gross)}</div><div><span>الصافي للموظفين</span>${money(t.net)}</div><div><span>للتأمينات (الحصتان)</span>${money(t.gosiEe + t.gosiEr)}</div><div><span>التكلفة على المطعم</span>${money(t.cost)}</div></div>${t.eosbPaid ? `<p class="note">ويُصرف معه مكافأة نهاية الخدمة <b class="n">${fmt(t.eosbPaid)}</b> ${cur()} من المخصص المتراكم (ما زاد عليه مصروف في تاريخ الصرف).</p>` : ''}${settle ? `<ul class="note settle">${settle}</ul>` : ''}`;
          },
        },
        { k: 'note', label: 'ملاحظات' },
      ],
      // نظام حماية الأجور (مدد) وموعد سداد التأمينات
      preview: (v) =>
        (v.account === 'cash' || v.gosiAccount === 'cash' ? '<p class="note bad">نظام حماية الأجور يتطلب صرف رواتب العمال عبر الحساب البنكي ورفع ملف الأجور في منصة «مدد» شهرياً؛ الصرف النقدي قد يُعدّ عدم التزام ويعرّض المنشأة لإيقاف خدمات قوى.</p>' : '') +
        '<p class="note">اشتراكات التأمينات الاجتماعية تُسدَّد قبل يوم 15 من الشهر التالي.</p>',
      onSave: (v) => {
        if (!v.lines.length) return 'المسير فارغ.';
        // السطر المكرر لموظف يضاعف استحقاق مخصصه
        const ids = v.lines.map((l) => l.employeeId).filter(Boolean);
        const dup = ids.find((id, i) => ids.indexOf(id) !== i);
        if (dup) return 'الموظف مكرر في المسير: ' + ((empOf(dup) || {}).name || '') + '. اجمع ما له في سطر واحد.';
        upsert('payroll', v);
      },
    });
  };

  FORMS.purchases = (rec) => {
    const r = S.settings.vatRate / 100;
    const rawOpts = () => [['', '— بند حر —']].concat(S.raw.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar')).map((x) => [x.id, x.name + (x.buyUnit ? ' (' + x.buyUnit + ')' : '')]));
    const last = S.purchases.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return formModal({
      title: rec ? 'تعديل فاتورة مشتريات' : 'فاتورة مشتريات',
      wide: true,
      value: rec ? Object.assign({ updatePrices: false }, rec) : { id: RB.uid(), date: today(), supplier: '', invoiceNo: '', category: 'food', account: 'bank', taxable: true, includesVat: false, lines: [{ rawId: '', desc: '', qty: 1, price: '' }], note: '', updatePrices: true },
      onChange: (p, v) => {
        const m = p.match(/^lines\.(\d+)\.rawId$/);
        if (m) {
          const row = v.lines[+m[1]];
          const raw = S.raw.find((x) => x.id === row.rawId);
          if (raw) {
            row.desc = raw.name;
            row.price = v.includesVat && v.taxable ? r2(raw.price * (1 + r)) : raw.price;
          }
        }
        if (p === 'supplier' && !rec) {
          const prev = S.purchases.filter((x) => x.supplier === v.supplier).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
          if (prev) Object.assign(v, { category: prev.category, account: prev.account, taxable: prev.taxable, includesVat: prev.includesVat });
        }
      },
      fields: [
        { type: 'row', fields: [{ k: 'date', type: 'date', label: 'التاريخ', req: 1 }, { k: 'supplier', label: 'المورد', req: 1, list: () => [...new Set(S.purchases.map((p) => p.supplier).filter(Boolean))], placeholder: last ? last.supplier : '' }, { k: 'invoiceNo', label: 'رقم الفاتورة' }] },
        { type: 'row', fields: [{ k: 'category', type: 'select', label: 'التصنيف', options: RB.PURCHASE_CATS.map((c) => [c.id, c.name]) }, { k: 'account', type: 'select', label: 'الدفع', options: payOptions(true), help: 'آجل = يُسدد للمورد لاحقاً' }] },
        ...vatFields(true),
        {
          k: 'lines',
          type: 'lines',
          label: 'الأصناف',
          addLabel: 'إضافة صنف',
          newRow: () => ({ rawId: '', desc: '', qty: 1, price: '' }),
          cols: [
            { k: 'rawId', label: 'المادة الخام', type: 'select', options: rawOpts, redraw: true, w: '12rem' },
            { k: 'desc', label: 'الوصف' },
            { k: 'qty', label: 'الكمية', type: 'num', num: 1 },
            { k: 'price', label: 'سعر الوحدة', type: 'num', num: 1 },
            { k: 'total', label: 'المجموع', num: 1, calc: (row) => fmt(num(row.qty) * num(row.price)) },
          ],
          foot: (v) => vatPreview(RB.purchaseTotal(v), v.includesVat, v.taxable, v.date),
          help: 'اربط السطر بالمادة الخام لتتحدث تكلفتها تلقائياً. الكمية بوحدة الشراء (كرتون، كيس…).',
        },
        { k: 'updatePrices', type: 'check', label: 'تحديث أسعار المواد الخام من هذه الفاتورة' },
        { k: 'note', label: 'ملاحظات' },
      ],
      onSave: (v) => {
        v.lines = v.lines.filter((l) => num(l.qty) || num(l.price) || l.desc || l.rawId);
        if (!v.lines.length) return 'أضف صنفاً واحداً على الأقل.';
        const upd = v.updatePrices;
        delete v.updatePrices;
        upsert('purchases', v);
        if (upd) {
          let n = 0;
          for (const l of v.lines) {
            const raw = l.rawId && S.raw.find((x) => x.id === l.rawId);
            if (!raw || !num(l.price)) continue;
            const net = v.includesVat && v.taxable ? r2(num(l.price) / (1 + r)) : num(l.price);
            if (Math.abs(net - num(raw.price)) > 0.004) {
              upsert('raw', Object.assign({}, raw, { price: net, taxable: !!v.taxable }));
              n++;
            }
          }
          if (n) toast(`تحدّث سعر ${n} من المواد الخام وتكلفة الوصفات المرتبطة بها.`);
        }
      },
    });
  };

  FORMS.supplierPayments = (rec, x) => {
    const bal = RB.supplierBalances(S, today());
    // المبلغ المقترح = المستحق على المورد المختار (إن كان له رصيد)
    const owed = (name) => {
      const b = bal.find((z) => z.supplier === String(name || '').trim());
      return b && b.balance > 0.005 ? r2(b.balance) : '';
    };
    const sup = x || (bal.find((b) => b.balance > 0.005) || {}).supplier || '';
    let auto = owed(sup);
    return formModal({
      title: rec ? 'تعديل سداد مورد' : 'سداد مورد',
      value: rec || { id: RB.uid(), date: today(), supplier: sup, account: 'bank', amount: auto, note: '' },
      // تغيير المورد يغيّر المبلغ المقترح، ما لم يكتب المستخدم مبلغاً بنفسه
      onChange: (p, v) => {
        if (p !== 'supplier' || rec) return;
        if (v.amount === '' || v.amount === auto) v.amount = auto = owed(v.supplier);
      },
      fields: [
        { type: 'row', fields: [{ k: 'date', type: 'date', label: 'التاريخ', req: 1 }, { k: 'supplier', label: 'المورد', req: 1, list: () => bal.map((b) => b.supplier), redraw: true }] },
        { type: 'row', fields: [{ k: 'amount', type: 'money', label: 'المبلغ', req: 1, min: 0 }, { k: 'account', type: 'select', label: 'من', options: payOptions(false) }] },
        { k: 'note', label: 'ملاحظة' },
      ],
      preview: (v) => {
        const b = bal.find((z) => z.supplier === (v.supplier || '').trim());
        return b ? `<p class="note">الرصيد المستحق لهذا المورد: <b class="n">${fmt(b.balance)}</b> ${cur()}</p>` : '';
      },
      onSave: (v) => upsert('supplierPayments', v),
    });
  };

  FORMS.raw = (rec) =>
    formModal({
      title: rec ? 'تعديل مادة خام' : 'مادة خام جديدة',
      value: rec || { id: RB.uid(), name: '', category: 'لحوم', supplier: '', buyUnit: 'كرتون', packQty: 1, useUnit: 'جم', price: '', taxable: true, wastePct: 0 },
      fields: [
        { type: 'row', fields: [{ k: 'name', label: 'اسم المادة', req: 1 }, { k: 'category', type: 'select', label: 'الفئة', options: RB.RAW_CATS }] },
        { k: 'supplier', label: 'المورد المعتاد', list: () => [...new Set(S.purchases.map((p) => p.supplier).filter(Boolean))] },
        { type: 'section', label: 'كيف تشتريها وكيف تستخدمها' },
        { type: 'row', fields: [{ k: 'buyUnit', label: 'وحدة الشراء', req: 1, placeholder: 'كرتون 10 كجم' }, { k: 'price', type: 'money', label: 'سعر وحدة الشراء (بدون ضريبة)', req: 1, min: 0 }] },
        { type: 'row', fields: [{ k: 'useUnit', type: 'select', label: 'وحدة الاستخدام في الوصفات', options: RB.UNITS, redraw: true }, { k: 'packQty', type: 'num', label: 'كم وحدة استخدام في وحدة الشراء؟', req: 1, min: 0, help: 'كرتون 10 كجم بوحدة جم = 10000' }] },
        { type: 'row', fields: [{ k: 'wastePct', type: 'num', label: 'نسبة الهدر %', min: 0, help: 'تقشير، تقطيع، تلف' }, { k: 'taxable', type: 'check', label: 'خاضعة لضريبة القيمة المضافة', help: 'حسب المورد المعتاد: أزلها فقط إذا كان المورد غير مسجل في الضريبة' }] },
      ],
      preview: (v) => {
        const u = RB.rawUnitCost(v, S);
        return `<div class="pv-grid"><div><span>تكلفة 1 ${esc(v.useUnit)}</span><b class="n">${u.toFixed(4)}</b></div><div><span>تكلفة 100 ${esc(v.useUnit)}</span><b class="n">${fmt(u * 100)}</b></div><div><span>تكلفة 1000 ${esc(v.useUnit)}</span><b class="n">${fmt(u * 1000)}</b></div></div>`;
      },
      onSave: (v) => {
        if (!(num(v.packQty) > 0)) return 'يجب أن تكون كمية وحدة الشراء أكبر من صفر.';
        upsert('raw', v);
      },
    });

  FORMS.stockCounts = (rec) => {
    const all = () => S.raw.slice().sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name, 'ar')).map((x) => ({ rawId: x.id, qty: 0, price: x.price }));
    return formModal({
      title: rec ? 'تعديل جرد' : 'جرد المخزون',
      wide: true,
      value: rec || { id: RB.uid(), date: today(), note: '', lines: all() },
      onChange: (p, v) => {
        const m = p.match(/^lines\.(\d+)\.rawId$/);
        if (m) {
          const raw = S.raw.find((x) => x.id === v.lines[+m[1]].rawId);
          if (raw) v.lines[+m[1]].price = raw.price;
        }
      },
      fields: [
        { type: 'row', fields: [{ k: 'date', type: 'date', label: 'تاريخ الجرد', req: 1 }, { k: 'note', label: 'ملاحظة' }] },
        {
          k: 'lines',
          type: 'lines',
          label: 'الكميات الموجودة (بوحدة الشراء، ويمكن كسور مثل 1.5)',
          tools: [{ id: 'all', label: 'كل المواد', run: (v, rows) => rows.splice(0, rows.length, ...all()) }],
          newRow: () => ({ rawId: '', qty: 0, price: 0 }),
          cols: [
            { k: 'rawId', label: 'المادة', type: 'select', options: () => [['', '—']].concat(S.raw.map((x) => [x.id, x.name])), redraw: true, w: '12rem' },
            { k: 'unit', label: 'الوحدة', calc: (row) => esc((S.raw.find((x) => x.id === row.rawId) || {}).buyUnit || '') },
            { k: 'qty', label: 'الكمية', type: 'num', num: 1 },
            { k: 'price', label: 'سعر الشراء (بدون ضريبة)', type: 'num', num: 1 },
            { k: 'value', label: 'القيمة', num: 1, calc: (row, v) => fmt(num(row.qty) * RB.stockLinePrice(row, S, v.date)) },
          ],
          foot: (v) => `<div class="pv-grid"><div><span>قيمة المخزون</span>${money(RB.stockValue(v, S))}</div></div>${RB.isVatReg(S.settings, v.date) ? '' : '<p class="note">المطعم غير مسجل في الضريبة: قيمة الجرد تشمل الضريبة للمواد الخاضعة لأنها جزء من التكلفة</p>'}`,
        },
      ],
      onSave: (v) => {
        v.lines = v.lines.filter((l) => l.rawId);
        upsert('stockCounts', v);
      },
    });
  };

  // المكونات (مواد خام أو منتجات مجمّعة أو أصناف منيو)
  function itemsField(kind, selfId, label) {
    const kinds = kind === 'prod' ? [['raw', 'مادة خام'], ['comp', 'منتج مجمّع'], ['prod', 'صنف من المنيو']] : [['raw', 'مادة خام'], ['comp', 'منتج مجمّع']];
    return {
      k: 'items',
      type: 'lines',
      label,
      addLabel: 'إضافة مكوّن',
      newRow: () => ({ kind: 'raw', id: '', qty: '' }),
      cols: [
        { k: 'kind', label: 'النوع', type: 'select', options: () => kinds, redraw: true, w: '8.5rem' },
        {
          k: 'id',
          label: 'المكوّن',
          type: 'select',
          redraw: true,
          w: '13rem',
          options: (row, v) => {
            const list = row.kind === 'comp' ? S.composites : row.kind === 'prod' ? S.products : S.raw;
            const ok = list.filter((x) => !(row.kind === kind && x.id === (v.id || selfId)) && !(row.kind !== 'raw' && RB.wouldCycle(S, kind, v.id || selfId, row.kind, x.id)));
            return [['', '— اختر —']].concat(ok.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar')).map((x) => [x.id, x.name]));
          },
        },
        { k: 'qty', label: 'الكمية', type: 'num', num: 1 },
        { k: 'unit', label: 'الوحدة', calc: (row) => esc(row.id ? RB.itemUnit(S, row.kind, row.id) : '') },
        { k: 'cost', label: 'التكلفة', num: 1, calc: (row) => (row.id ? fmt(costing().unit(row.kind, row.id) * num(row.qty)) : '') },
      ],
      help: kind === 'prod' ? 'أضف التغليف (علبة، كيس، مناديل) كمواد خام ليدخل في التكلفة. الوجبة المركّبة تضم أصنافاً من المنيو.' : 'الكمية بوحدة استخدام المكوّن.',
    };
  }
  const withRec = (section, v) => Object.assign({}, S, { [section]: S[section].filter((x) => x.id !== v.id).concat([v]) });

  FORMS.composites = (rec) =>
    formModal({
      title: rec ? 'تعديل منتج مجمّع' : 'منتج مجمّع جديد',
      wide: true,
      value: rec || { id: RB.uid(), name: '', yieldQty: 1, yieldUnit: 'حبة', items: [{ kind: 'raw', id: '', qty: '' }], note: '' },
      fields: [
        { type: 'row', fields: [{ k: 'name', label: 'الاسم', req: 1, placeholder: 'مثال: صوص البرقر الخاص' }, { k: 'yieldQty', type: 'num', label: 'الكمية الناتجة من الوصفة', req: 1, min: 0 }, { k: 'yieldUnit', type: 'select', label: 'وحدتها', options: RB.UNITS, redraw: true }] },
        itemsField('comp', rec && rec.id, 'المكونات'),
        { k: 'note', label: 'ملاحظات' },
      ],
      preview: (v) => {
        const tmp = withRec('composites', v);
        const b = RB.breakdown(tmp, v, 'comp', RB.costing(tmp));
        return `<div class="pv-grid"><div><span>تكلفة الوصفة كاملة</span>${money(b.total)}</div><div><span>تكلفة 1 ${esc(v.yieldUnit)}</span><b class="n">${b.perUnit.toFixed(4)}</b></div></div>`;
      },
      onSave: (v) => {
        v.items = v.items.filter((i) => i.id && num(i.qty));
        if (!(num(v.yieldQty) > 0)) return 'يجب أن تكون الكمية الناتجة أكبر من صفر.';
        upsert('composites', v);
      },
    });

  FORMS.products = (rec) => {
    // أسعار المنيو شاملة الضريبة للمطعم المسجل فقط
    const incl = RB.isVatReg(S.settings, today()) ? ' (شامل الضريبة)' : '';
    return formModal({
      title: rec ? 'تعديل صنف' : 'صنف جديد في المنيو',
      wide: true,
      value: rec ? Object.assign({ competitors: [] }, rec) : { id: RB.uid(), name: '', category: 'برقر', price: '', appPrice: '', active: true, items: [{ kind: 'raw', id: '', qty: '' }], competitors: [], note: '' },
      fields: [
        { type: 'row', fields: [{ k: 'name', label: 'اسم الصنف', req: 1 }, { k: 'category', type: 'select', label: 'القسم', options: RB.PRODUCT_CATS }] },
        { type: 'row', fields: [{ k: 'price', type: 'money', label: 'سعر البيع في المحل' + incl, req: 1, min: 0 }, { k: 'appPrice', type: 'money', label: 'سعره في التطبيقات' + incl, min: 0, help: 'اتركه فارغاً إن كان نفس السعر' }] },
        itemsField('prod', rec && rec.id, 'المكونات'),
        {
          k: 'competitors',
          type: 'lines',
          label: 'أسعار السوق المحلي (منافسون لصنف مشابه)',
          addLabel: 'إضافة منافس',
          newRow: () => ({ name: '', price: '' }),
          cols: [
            { k: 'name', label: 'المطعم' },
            { k: 'price', label: 'السعر', type: 'num', num: 1 },
          ],
        },
        { k: 'active', type: 'check', label: 'مفعّل في المنيو' },
      ],
      preview: (v) => {
        const tmp = withRec('products', v);
        const C = RB.costing(tmp);
        return productAnalysisHTML(tmp, v, C, true);
      },
      onSave: (v) => {
        v.items = v.items.filter((i) => i.id && num(i.qty));
        v.competitors = (v.competitors || []).filter((c) => c.name || num(c.price));
        upsert('products', v);
      },
    });
  };

  function productAnalysisHTML(St, p, C, short) {
    const st = RB.productStats(St, p, C);
    const target = num(St.settings.targetFoodCost);
    let h = `<div class="pv-grid four"><div><span>التكلفة</span>${money(st.cost)}</div><div><span>${RB.isVatReg(St.settings, today()) ? 'السعر بدون الضريبة' : 'سعر البيع (غير مسجل في الضريبة)'}</span>${money(st.priceNet)}</div><div><span>تكلفة الطعام</span><b class="n ${st.foodCost > target + 3 ? 'neg' : ''}">${pct(st.foodCost)}</b><small>المستهدف ${pct(target, 0)}</small></div><div><span>ربح الحبة</span>${money(st.profit)}</div></div>`;
    const tips = [];
    if (st.suggested && st.price && st.suggested > st.price + 0.01) tips.push(`لتحقيق تكلفة طعام ${pct(target, 0)} يكون السعر ${fmt(st.suggested)} ${cur()}.`);
    if (st.market) tips.push(`السوق: من ${fmt(st.market.min)} إلى ${fmt(st.market.max)} (المتوسط ${fmt(st.market.avg)}). سعرك ${st.vsMarket > 0 ? 'أعلى' : 'أقل'} بـ ${pct(Math.abs(st.vsMarket), 0)}.`);
    if (st.avgApp) tips.push(`في التطبيقات بسعر ${fmt(st.appPrice)}: ربح الحبة ${fmt(st.avgApp.profit)} بعد العمولة. للحفاظ على نفس ربح المحل يلزم ${fmt(st.avgApp.keepPrice)}.`);
    if (tips.length) h += `<ul class="tips">${tips.map((t) => `<li>${t}</li>`).join('')}</ul>`;
    if (short) return h;
    if (st.apps.length) h += `<h4 class="sub-h">ربح الصنف في كل تطبيق</h4>` + table([{ h: 'التطبيق', f: (a) => esc(a.name) }, { h: 'العمولة', num: 1, f: (a) => pct(a.feePct, 1) }, { h: 'العمولة بالريال', num: 1, f: (a) => N(a.commission) }, { h: 'ربح الحبة', num: 1, f: (a) => N(a.profit) }, { h: 'الهامش', num: 1, f: (a) => pct(a.margin, 0) }, { h: 'السعر المكافئ لربح المحل', num: 1, f: (a) => N(a.keepPrice) }], st.apps);
    return h;
  }
  function breakdownHTML(St, rec, kind, C, depth) {
    const b = RB.breakdown(St, rec, kind, C);
    return `<div class="tbl-wrap"><table class="tbl mini"><thead><tr><th>المكوّن</th><th class="num">الكمية</th><th class="num">تكلفة الوحدة</th><th class="num">التكلفة</th><th class="num">الحصة</th></tr></thead><tbody>${b.lines
      .map((l) => {
        const sub = l.kind !== 'raw' && (depth || 0) < 3 ? (l.kind === 'comp' ? St.composites : St.products).find((x) => x.id === l.id) : null;
        return `<tr><td>${esc(l.name)} ${l.kind === 'comp' ? chip('مجمّع', 'accent') : l.kind === 'prod' ? chip('صنف', 'accent') : ''}${sub ? `<details><summary>مكوناته</summary>${breakdownHTML(St, sub, l.kind, C, (depth || 0) + 1)}</details>` : ''}</td><td class="num">${fmtQ(l.qty)} <span class="muted sm">${esc(l.unitName)}</span></td><td class="num">${l.unitCost.toFixed(4)}</td><td class="num">${N(l.cost)}</td><td class="num">${pct(l.share, 0)}</td></tr>`;
      })
      .join('')}<tr class="total"><td colspan="3">الإجمالي${kind === 'comp' ? ` (ينتج ${fmtQ(rec.yieldQty)} ${esc(rec.yieldUnit)})` : ''}</td><td class="num">${N(b.total)}</td><td></td></tr></tbody></table></div>`;
  }

  FORMS.sales = (rec) => {
    const chs = S.settings.channels.filter((c) => c.active !== false || (rec && rec.channels && rec.channels[c.id]));
    const base = { id: RB.uid(), date: today(), channels: {}, items: [], note: '' };
    chs.forEach((c) => (base.channels[c.id] = { amount: '', orders: '' }));
    const v0 = rec ? clone(rec) : base;
    chs.forEach((c) => (v0.channels[c.id] = v0.channels[c.id] || { amount: '', orders: '' }));
    const prodOpts = () => [['', '— اختر —']].concat(S.products.filter((p) => p.active !== false).map((p) => [p.id, p.name]));
    return formModal({
      title: rec ? 'تعديل إقفال يومي' : 'إقفال يومي',
      wide: true,
      value: v0,
      fields: [
        { type: 'row', fields: [{ k: 'date', type: 'date', label: 'اليوم', req: 1, redraw: true }, { k: 'note', label: 'ملاحظات' }] },
        { type: 'html', html: (v) => (!rec && S.sales.some((s) => s.date === v.date) ? `<p class="note bad">يوجد إقفال مسجل لهذا اليوم. الحفظ يضيف إقفالاً ثانياً (مثلاً وردية مسائية).</p>` : '') },
        {
          type: 'html',
          html: (v) =>
            `<div class="field"><label>المبيعات حسب القناة (شاملة الضريبة)</label><div class="tbl-wrap"><table class="lines-tbl"><thead><tr><th>القناة</th><th class="num">المبلغ</th><th class="num">عدد الطلبات</th><th class="num">العمولة</th></tr></thead><tbody>${chs
              .map((c) => {
                const x = v.channels[c.id] || {};
                return `<tr><td><b>${esc(c.name)}</b></td><td class="num"><input type="number" inputmode="decimal" step="any" data-type="num" data-path="channels.${esc(c.id)}.amount" value="${x.amount === undefined ? '' : esc(x.amount)}" aria-label="مبلغ ${esc(c.name)}"></td><td class="num"><input type="number" inputmode="numeric" step="1" data-type="num" data-path="channels.${esc(c.id)}.orders" value="${x.orders === undefined ? '' : esc(x.orders)}" aria-label="طلبات ${esc(c.name)}"></td><td class="num muted">${c.type === 'cash' ? '—' : pct(x.feePct !== undefined && x.feePct !== '' ? x.feePct : c.feePct, 1)}</td></tr>`;
              })
              .join('')}</tbody></table></div></div>`,
        },
        {
          k: 'items',
          type: 'lines',
          label: 'الأصناف المباعة (اختياري — لتحليل المنيو والتكلفة النظرية)',
          addLabel: 'إضافة صنف',
          tools: [{ id: 'all', label: 'كل الأصناف', run: (v, rows) => S.products.filter((p) => p.active !== false && !rows.some((r) => r.productId === p.id)).forEach((p) => rows.push({ productId: p.id, qty: '' })) }],
          newRow: () => ({ productId: '', qty: '' }),
          cols: [
            { k: 'productId', label: 'الصنف', type: 'select', options: prodOpts, redraw: true, w: '14rem' },
            { k: 'qty', label: 'الكمية', type: 'num', num: 1 },
            { k: 'val', label: 'بسعر المحل', num: 1, calc: (row) => fmt(num((S.products.find((p) => p.id === row.productId) || {}).price) * num(row.qty)) },
          ],
          empty: 'من تقرير الأصناف في جهاز الكاشير: كم بعت من كل صنف.',
        },
      ],
      preview: (v) => {
        let gross = 0;
        let vat = 0;
        let fee = 0;
        let orders = 0;
        for (const id of Object.keys(v.channels)) {
          const x = RB.saleChannelSplit(S, id, v.channels[id], v.date || today());
          gross += x.gross;
          vat += x.outVat;
          fee += x.fee + x.feeVat;
          orders += x.orders;
        }
        const itemsVal = RB.sum(v.items || [], (row) => num((S.products.find((p) => p.id === row.productId) || {}).price) * num(row.qty));
        return `<div class="pv-grid four"><div><span>إجمالي المبيعات</span>${money(gross)}</div><div><span>الضريبة</span>${money(vat)}</div><div><span>العمولات والرسوم</span>${money(fee)}</div><div><span>الطلبات</span><b class="n">${fmt0(orders)}</b><small>${orders ? 'متوسط ' + fmt(gross / orders) : ''}</small></div></div>${itemsVal && gross ? `<p class="note">قيمة الأصناف بسعر المحل ${fmt(itemsVal)} (أسعار التطبيقات أعلى عادة).</p>` : ''}`;
      },
      onSave: (v) => {
        const out = {};
        for (const id of Object.keys(v.channels)) {
          const x = v.channels[id];
          if (!num(x.amount) && !num(x.orders)) continue;
          const c = RB.channelOf(S, id) || {};
          // نسبة العمولة وضريبتها تُحفظ مع الإقفال، فتعديل الإعدادات لاحقاً لا يغيّر الأيام السابقة
          out[id] = { amount: num(x.amount), orders: num(x.orders), feePct: x.feePct !== undefined && x.feePct !== '' ? num(x.feePct) : num(c.feePct), type: x.type || c.type, feeVat: x.feeVat !== undefined ? !!x.feeVat : !!S.settings.feeVat };
        }
        if (!Object.keys(out).length) return 'أدخل مبيعات قناة واحدة على الأقل.';
        v.channels = out;
        v.items = (v.items || []).filter((i) => i.productId && num(i.qty));
        upsert('sales', v);
      },
      done: 'تم حفظ الإقفال.',
    });
  };

  FORMS.payouts = (rec, x) => {
    const apps = S.settings.channels.filter((c) => c.type === 'app');
    if (!apps.length) return toast('لا توجد تطبيقات توصيل في الإعدادات.', 'bad');
    const recv = RB.appReceivables(S, today());
    const ch0 = x || (recv.sort((a, b) => b.balance - a.balance)[0] || apps[0]).id;
    // «نوع الخصم» يظهر عند وجود خصومات، ويُبدّل أثناء الكتابة بلا إعادة رسم حتى لا يضيع الضغط على «حفظ» أو Enter
    const dedOff = (v) => !(num(v.deductions) > 0);
    let m = null;
    m = formModal({
      title: rec ? 'تعديل تحويل' : 'تحويل من تطبيق توصيل',
      // السجل القديم بخصومات وبلا نوع يبقى «غرامة أو تسوية» فلا تتغير الفترات المقدَّمة؛ الجديد افتراضياً «عرض أو مرتجع»
      value: rec
        ? Object.assign({}, rec, { dedType: RB.DED_TYPES[rec.dedType] ? rec.dedType : num(rec.deductions) ? 'other' : 'sale' })
        : { id: RB.uid(), date: today(), channelId: ch0, amount: r2(Math.max((recv.find((a) => a.id === ch0) || {}).balance || 0, 0)) || '', deductions: 0, dedType: 'sale', note: '' },
      onChange: (p, v) => {
        const f = p === 'deductions' && m && m.body.querySelector('.field[data-k="dedType"]');
        if (f) f.classList.toggle('off', dedOff(v));
      },
      fields: (v) => [
        { type: 'row', fields: [{ k: 'date', type: 'date', label: 'تاريخ وصول المبلغ للبنك', req: 1 }, { k: 'channelId', type: 'select', label: 'التطبيق', options: apps.map((c) => [c.id, c.name]), redraw: true }] },
        { type: 'row', fields: [{ k: 'amount', type: 'money', label: 'المبلغ الواصل', req: 1, min: 0 }, { k: 'deductions', type: 'money', label: 'خصومات إضافية', min: 0, help: 'ما خصمه التطبيق من التحويل غير عمولته المسجلة في الإقفال: عروض أو مرتجعات، رسوم إعلان، أو غرامات' }] },
        { k: 'dedType', type: 'select', label: 'نوع الخصم', cls: dedOff(v) ? 'off' : '', options: Object.keys(RB.DED_TYPES).map((k) => [k, RB.DED_TYPES[k].name]), help: 'يحدد معالجة الضريبة: العرض أو المرتجع يخفض المبيعات وضريبتها، والرسوم بفاتورة ضريبية تُسترد ضريبتها، والغرامة بلا ضريبة.' },
        { k: 'note', label: 'ملاحظة' },
      ],
      preview: (v) => {
        const b = RB.appReceivables(S, v.date || today()).find((a) => a.id === v.channelId);
        const own = rec ? num(rec.amount) + num(rec.deductions) : 0;
        const bal = b ? b.balance + (rec && rec.channelId === v.channelId ? own : 0) : 0;
        return `<p class="note">المستحق على التطبيق قبل هذا التحويل: <b class="n">${fmt(bal)}</b> ${cur()} · بعده: <b class="n">${fmt(bal - num(v.amount) - num(v.deductions))}</b></p>`;
      },
      onSave: (v) => upsert('payouts', v),
    });
    return m;
  };

  FORMS.transfers = (rec, x) =>
    formModal({
      title: rec ? 'تعديل تحويل' : x === 'bank' ? 'سحب من البنك إلى الصندوق' : 'إيداع نقدية الصندوق في البنك',
      value: rec || { id: RB.uid(), date: today(), from: x === 'bank' ? 'bank' : 'cash', to: x === 'bank' ? 'cash' : 'bank', amount: x === 'bank' ? '' : Math.max(0, Math.floor((RB.balances(ledger(today()).entries, null, today())['1101'] || 0) / 100) * 100) || '', note: '' },
      onChange: (p, v) => {
        if (p === 'from') v.to = v.from === 'cash' ? 'bank' : 'cash';
      },
      fields: [
        { type: 'row', fields: [{ k: 'date', type: 'date', label: 'التاريخ', req: 1 }, { k: 'from', type: 'select', label: 'من', options: [['cash', RB.PAY_LABEL.cash], ['bank', RB.PAY_LABEL.bank]], redraw: true }] },
        { k: 'amount', type: 'money', label: 'المبلغ', req: 1, min: 0 },
        { k: 'note', label: 'ملاحظة' },
      ],
      preview: (v) => `<p class="note">إلى: <b>${RB.PAY_LABEL[v.to]}</b></p>`,
      onSave: (v) => upsert('transfers', v),
    });

  FORMS.vatPayments = (rec, x) => {
    const t = today();
    // الفترات المنتهية مع المتبقي من كل إقرار (بعد خصم الرصيد الدائن وما سُدد)
    let pers = RB.vatReturns(S, t, ledger(t)).filter((p) => p.to < t);
    if (!pers.length) pers = RB.vatPeriodsBetween(S, RB.addDays(t, -400), t).filter((p) => p.to < t).map((p) => Object.assign({ remaining: 0 }, p));
    const per = pers.find((p) => p.label === x) || pers.filter((p) => p.remaining > 0).pop() || pers[pers.length - 1];
    const due = per ? r2(per.remaining) : 0;
    const labels = pers.map((p) => p.label).reverse();
    if (rec && rec.period && !labels.includes(rec.period)) labels.unshift(rec.period);
    return formModal({
      title: rec ? 'تعديل سداد الضريبة' : 'سداد ضريبة القيمة المضافة',
      value: rec || { id: RB.uid(), date: t, period: per ? per.label : '', account: 'bank', amount: due > 0 ? due : '', note: '' },
      onChange: (p, v) => {
        if (p !== 'period' || rec) return;
        const q = pers.find((z) => z.label === v.period);
        v.amount = q && q.remaining > 0 ? r2(q.remaining) : '';
      },
      fields: [
        { type: 'row', fields: [{ k: 'date', type: 'date', label: 'تاريخ السداد', req: 1 }, { k: 'period', type: 'select', label: 'الفترة', options: labels, redraw: true }] },
        { type: 'row', fields: [{ k: 'amount', type: 'money', label: 'المبلغ المسدد', req: 1, help: 'استرداد من الهيئة؟ أدخله بالسالب' }, { k: 'account', type: 'select', label: 'من / إلى', options: payOptions(false, false) }] },
        { k: 'note', label: 'ملاحظة' },
      ],
      onSave: (v) => upsert('vatPayments', v),
    });
  };

  function channelForm(id) {
    const c = id ? S.settings.channels.find((x) => x.id === id) : null;
    formModal({
      title: c ? 'تعديل قناة بيع' : 'قناة أو تطبيق جديد',
      value: c ? clone(c) : { id: 'ch' + Date.now().toString(36), name: '', type: 'app', feePct: 20, active: true },
      fields: [
        { k: 'name', label: 'الاسم', req: 1, placeholder: 'اسم التطبيق' },
        { type: 'row', fields: [{ k: 'type', type: 'select', label: 'النوع', options: Object.entries(RB.CHANNEL_TYPES), redraw: true }, { k: 'feePct', type: 'num', label: 'العمولة أو الرسوم %', min: 0, show: (v) => v.type !== 'cash', help: 'نسبة من قيمة الطلب شاملة الضريبة' }] },
        { k: 'active', type: 'check', label: 'مفعّلة' },
      ],
      onSave: (v) => {
        if (roBlock()) return false;
        const i = S.settings.channels.findIndex((x) => x.id === v.id);
        if (i >= 0) S.settings.channels[i] = v;
        else S.settings.channels.push(v);
        saveSettings();
      },
    });
  }

  function settingsForm(which) {
    const st = S.settings;
    const defs = {
      general: [
        { k: 'name', label: 'اسم المطعم', req: 1 },
        { type: 'row', fields: [{ k: 'city', label: 'المدينة' }, { k: 'crNumber', label: 'رقم السجل التجاري' }] },
        { type: 'row', fields: [{ k: 'openingDate', type: 'date', label: 'تاريخ الافتتاح', help: 'يبدأ منه إهلاك الأصول، ويفصل مصاريف ما قبل الافتتاح' }, { k: 'currency', label: 'العملة' }] },
        { type: 'row', fields: [{ k: 'targetFoodCost', type: 'num', label: 'مستهدف تكلفة الطعام %', min: 1, help: 'شائع في مطاعم البرقر بين 28% و35%' }, { k: 'priceRounding', type: 'num', label: 'تقريب السعر المقترح لأقرب', min: 0.25, help: '1 = لأقرب ريال' }] },
      ],
      vat: (v) => [
        { k: 'vatRegistered', type: 'check', label: 'المطعم مسجل في ضريبة القيمة المضافة', redraw: true, help: 'التسجيل إلزامي إذا تجاوزت المبيعات الخاضعة 375,000 ر.س خلال 12 شهراً، واختياري من 187,500 ر.س' },
        {
          k: 'vatRegisteredFrom',
          type: 'date',
          label: 'تاريخ سريان التسجيل في الضريبة (من شهادة التسجيل)',
          show: (x) => x.vatRegistered,
          req: !st.vatRegistered && v.vatRegistered && hasVatData() ? 1 : 0,
          help: 'اتركه فارغاً إن كان المطعم مسجلاً منذ البداية؛ العمليات قبله بلا ضريبة مخرجات ولا تُسترد ضريبة مشترياتها',
        },
        { type: 'row', fields: [{ k: 'vatNumber', label: 'الرقم الضريبي' }, { k: 'vatRate', type: 'num', label: 'نسبة الضريبة %', min: 0 }] },
        { k: 'vatPeriod', type: 'select', label: 'فترة الإقرار', options: [['quarterly', 'ربع سنوية'], ['monthly', 'شهرية']] },
        { k: 'feeVat', type: 'check', label: 'عمولات التطبيقات ورسوم الشبكة عليها ضريبة قيمة مضافة' },
      ],
      labor: [
        { type: 'section', label: 'نسب التأمينات الاجتماعية من الأجر الخاضع' },
        { type: 'html', html: () => '<p class="note">الأجر الخاضع = الأساسي + بدل السكن (أو السكن العيني مقدّراً بأجر شهرين في السنة)</p>' },
        { type: 'row', fields: [{ k: 'gosi.saudiEr', type: 'num', label: 'السعودي (النظام السابق) — حصة المنشأة %' }, { k: 'gosi.saudiEe', type: 'num', label: 'السعودي (النظام السابق) — حصة الموظف %' }] },
        { type: 'html', html: () => '<p class="note">المشتركون الجدد (أول تسجيل من 3 يوليو 2024): تُضاف زيادة فرع المعاشات 0.5% لكل طرف كل يوليو من 2025 حتى 2028 (من يوليو 2026: المنشأة 12.75% والموظف 10.75%).</p>' },
        { type: 'row', fields: [{ k: 'gosi.expatEr', type: 'num', label: 'غير السعودي — حصة المنشأة % (الأخطار المهنية)' }, { k: 'gosi.cap', type: 'num', label: 'الحد الأعلى للأجر الخاضع' }] },
        { type: 'section', label: 'قيم افتراضية تتعبأ عند إضافة موظف' },
        { type: 'row', fields: [{ k: 'labor.levyMonthly', type: 'num', label: 'المقابل المالي شهرياً', help: LEVY_HELP }, { k: 'labor.iqamaAnnual', type: 'num', label: 'رسوم الإقامة سنوياً' }] },
        { type: 'row', fields: [{ k: 'labor.workPermitAnnual', type: 'num', label: 'رخصة العمل سنوياً' }, { k: 'labor.medicalAnnual', type: 'num', label: 'التأمين الطبي سنوياً', help: MED_HELP }] },
      ],
    };
    formModal({
      title: { general: 'بيانات المطعم', vat: 'ضريبة القيمة المضافة', labor: 'التأمينات ورسوم العمالة' }[which],
      value: clone(st),
      fields: defs[which],
      onChange: (p, v) => {
        // تسجيل جديد ولدى المطعم عمليات سابقة: السريان من اليوم حتى لا تتغير الفترات الماضية
        if (which === 'vat' && p === 'vatRegistered' && v.vatRegistered && !st.vatRegistered && hasVatData() && !v.vatRegisteredFrom) v.vatRegisteredFrom = today();
      },
      onSave: async (v) => {
        if (roBlock()) return false;
        const warn = which === 'vat' ? vatHistoryChanges(st, v) : '';
        if (warn && !(await confirmBox(warn + ' متابعة؟', { danger: true }))) return false;
        S.settings = Object.assign(S.settings, v);
        saveSettings();
      },
    });
  }
  const hasVatData = () => S.sales.length > 0 || S.purchases.length > 0;
  // هل يغيّر تعديل إعدادات الضريبة أرقام عمليات أو إقرارات سابقة؟ يرجع نص التحذير أو فراغاً
  function vatHistoryChanges(old, v) {
    const out = [];
    const dated = [...S.sales, ...S.purchases, ...S.expenses, ...S.assets, ...S.payouts].filter((r) => r.date);
    if (
      dated.length &&
      (num(v.vatRate) !== num(old.vatRate) ||
        dated.some((r) => RB.isVatReg(old, r.date) !== RB.isVatReg(v, r.date)) ||
        // ضريبة العمولة: تؤثر فقط على الإقفالات القديمة التي لم تُحفظ معها
        (!!v.feeVat !== !!old.feeVat && S.sales.some((s) => Object.keys(s.channels || {}).some((id) => s.channels[id] && s.channels[id].feeVat === undefined && RB.saleChannelSplit(S, id, s.channels[id], s.date).fee > 0))))
    )
      out.push('تغيير التسجيل أو النسبة يعيد حساب الإيرادات والتكلفة وإقرارات الضريبة لكل الفترات السابقة. لتسجيل جديد استخدم تاريخ السريان بدل ذلك.');
    if ((v.vatPeriod || 'quarterly') !== (old.vatPeriod || 'quarterly') && S.vatPayments.length)
      out.push('تغيير فترة الإقرار يعيد تقسيم الإقرارات السابقة كلها على الفترة الجديدة، وتُنسب المدفوعات المسجلة إلى الفترات الجديدة التي تغطيها. إن كانت الإقرارات السابقة قُدّمت بالفترة الحالية فالأفضل إبقاؤها.');
    return out.join(' ');
  }

  // ═════════════ الأحداث ═════════════
  const refCheck = {
    raw: (id) => S.composites.some((c) => (c.items || []).some((i) => i.kind === 'raw' && i.id === id)) || S.products.some((p) => (p.items || []).some((i) => i.kind === 'raw' && i.id === id)),
    composites: (id) => S.composites.some((c) => (c.items || []).some((i) => i.kind === 'comp' && i.id === id)) || S.products.some((p) => (p.items || []).some((i) => i.kind === 'comp' && i.id === id)),
    products: (id) => S.products.some((p) => (p.items || []).some((i) => i.kind === 'prod' && i.id === id)),
    partners: (id) => S.capital.some((c) => c.partnerId === id) || [...S.assets, ...S.expenses, ...S.purchases].some((x) => x.account === 'partner:' + id),
    // تاريخ المباشرة وتاريخ ترك العمل يحددان مخصص نهاية الخدمة في المسيرات السابقة؛ حذفه يغيّر الدفاتر
    employees: (id) => S.payroll.some((pr) => (pr.lines || []).some((l) => l && l.employeeId === id)),
  };
  const refMsg = {
    raw: 'هذه المادة مستخدمة في وصفات. احذفها من الوصفات أولاً.',
    composites: 'هذا المنتج المجمّع مستخدم في منتجات أخرى. احذفه منها أولاً.',
    products: 'هذا الصنف داخل في وجبة مركّبة. احذفه منها أولاً، أو اجعله غير مفعّل.',
    partners: 'لهذا الشريك حركات رأس مال أو مدفوعات. احذفها أولاً.',
    employees: 'لهذا الموظف مسيرات رواتب؛ حدّد «تاريخ ترك العمل» وأوقفه بدلاً من حذفه.',
  };

  const ACT = {
    go: (el) => go(el.dataset.v),
    add: (el) => FORMS[el.dataset.s] && FORMS[el.dataset.s](null, el.dataset.x),
    edit: (el) => {
      const rec = find(el.dataset.s, el.dataset.id);
      if (rec && FORMS[el.dataset.s]) FORMS[el.dataset.s](clone(rec));
    },
    dup: (el) => {
      const rec = find(el.dataset.s, el.dataset.id);
      if (!rec) return;
      const c = clone(rec);
      c.id = RB.uid();
      if (c.date) c.date = today();
      if (c.name) c.name = c.name + ' (نسخة)';
      FORMS[el.dataset.s](c);
    },
    del: async (el) => {
      const s = el.dataset.s;
      const id = el.dataset.id;
      if (refCheck[s] && refCheck[s](id)) return toast(refMsg[s], 'bad');
      const rec = find(s, id);
      if (s === 'products' && S.sales.some((x) => (x.items || []).some((i) => i.productId === id))) {
        if (!(await confirmBox('هذا الصنف له مبيعات مسجلة، وحذفه يُسقطه من تحليل المنيو. الأفضل جعله «غير مفعّل». هل تحذفه رغم ذلك؟', { danger: true, ok: 'احذف' }))) return;
      } else if (!(await confirmBox(`حذف «${esc((rec && (rec.name || rec.desc || rec.supplier)) || 'هذا السجل')}» نهائياً؟`, { danger: true, ok: 'احذف' }))) return;
      remove(s, id);
      render();
      toast('تم الحذف.');
    },
    view: (el) => {
      const s = el.dataset.s;
      const rec = find(s, el.dataset.id);
      if (!rec) return;
      const C = costing();
      if (s === 'composites') infoBox(rec.name, breakdownHTML(S, rec, 'comp', C), true);
      else infoBox(rec.name, productAnalysisHTML(S, rec, C) + '<h4 class="sub-h">تفصيل التكلفة</h4>' + breakdownHTML(S, rec, 'prod', C), true);
    },
    empcost: (el) => {
      const e = find('employees', el.dataset.id);
      if (e) infoBox('التكلفة الحقيقية: ' + e.name, empCostHTML(e));
    },
    renew: (el) => {
      const rec = find('expenses', el.dataset.id);
      if (!rec) return;
      const c = clone(rec);
      c.id = RB.uid();
      // التجديد بند جديد يُتابع: لا يرث إيقاف المتابعة ولا «لمرة واحدة»
      delete c.noRenew;
      delete c.oneOff;
      c.date = today();
      // الزكاة: سنة الدفع الجديدة تخص السنة السابقة لها؛ غيرها يبدأ بعد نهاية التغطية السابقة
      if (rec.category === 'zakat') c.startDate = +c.date.slice(0, 4) - 1 + '-01-01';
      else c.startDate = RB.addDays(RB.coverageEnd(rec.startDate || rec.date, rec.months), 1);
      FORMS.expenses(c);
    },
    stopRenew: async (el) => {
      const rec = find('expenses', el.dataset.id);
      if (!rec) return;
      if (!(await confirmBox(`إيقاف متابعة تجديد «${esc(rec.desc || RB.expenseCat(rec.category).name)}»؟ لن يظهر في متابعة التجديد ولا في التنبيهات، ويعود إذا سجّلت تجديده لاحقاً.`, { ok: 'أوقف المتابعة' }))) return;
      upsert('expenses', Object.assign(clone(rec), { noRenew: true }));
      render();
      toast('أُوقفت متابعة التجديد.');
    },
    tab: (el) => {
      ui[el.dataset.tab] = el.dataset.v;
      saveUI();
      render();
    },
    filter: (el) => {
      ui[el.dataset.f] = el.dataset.v;
      saveUI();
      render();
    },
    settings: (el) => settingsForm(el.dataset.v),
    report: (el) => {
      ui.report = el.dataset.v;
      go('reports');
    },
    channel: (el) => channelForm(el.dataset.id),
    delchannel: async (el) => {
      if (roBlock()) return;
      const id = el.dataset.id;
      if (S.sales.some((s) => s.channels && s.channels[id])) return toast('لهذه القناة مبيعات مسجلة. أوقفها بدلاً من حذفها.', 'bad');
      if (!(await confirmBox('حذف قناة البيع؟', { danger: true, ok: 'احذف' }))) return;
      S.settings.channels = S.settings.channels.filter((c) => c.id !== id);
      saveSettings();
      render();
    },
    menu: () => document.body.classList.toggle('nav-open'),
    print: () => window.print(),
    csv: (el) => exportCSV(el.dataset.v),
    // أثناء عرض التجربة فوق دفتر محفوظ تُصدَّر البيانات الحقيقية، وملف التجربة وحدها يُعلَّم بأنه تجريبي
    backup: async () => {
      const src = backupSource();
      const demo = APP.demo && !APP.real;
      const name = demo ? `بيانات-تجريبية-${today()}.json` : `نسخة-دفتر-المطعم-${today()}.json`;
      const ok = await saveFile(name, JSON.stringify(Object.assign({ app: 'restaurant-books', version: 1, exportedAt: new Date().toISOString() }, demo ? { demo: true } : {}, src), null, 1), APP.demo && APP.real ? { okMsg: REAL_MSG } : null);
      if (ok && !demo) backedUp();
    },
    copybackup: async () => {
      const src = backupSource();
      const demo = APP.demo && !APP.real;
      const txt = JSON.stringify(Object.assign({ app: 'restaurant-books', version: 1, exportedAt: new Date().toISOString() }, demo ? { demo: true } : {}, src));
      let ok = false;
      try {
        await writeClip(txt);
        ok = true;
        toast(APP.demo && APP.real ? REAL_MSG + '. الصقها في ملف نصي واحفظه.' : 'نُسخت البيانات. الصقها في ملف نصي واحفظه.');
      } catch (e) {
        ok = await copyBox('انسخ النص يدوياً واحفظه في ملف', txt);
        if (ok && APP.demo && APP.real) toast(REAL_MSG);
      }
      if (ok && !demo) backedUp();
    },
    start: () => startWizard(),
    showdemo: async () => {
      if (!(await confirmBox('عرض البيانات التجريبية مؤقتاً؟ بياناتك تبقى محفوظة كما هي، ويمكنك الرجوع إليها من الإعدادات.'))) return;
      // تعديل لم يُكتب بعد يُحفظ قبل التجربة (التجربة لا تحفظ شيئاً)
      if (APP.backend.flush) APP.backend.flush();
      APP.real = S;
      S = RB.normalize(RB.demoState(today()));
      APP.demo = true;
      bump();
      render();
    },
    leavedemo: () => {
      if (!APP.real) return;
      S = APP.real;
      APP.real = null;
      APP.demo = false;
      bump();
      render();
    },
    wipe: async () => {
      if (roBlock()) return;
      if (!(await confirmBox('مسح كل بيانات المطعم نهائياً؟ صدّر نسخة احتياطية قبلها إن احتجت.', { danger: true, ok: 'امسح الكل' }))) return;
      const fresh = RB.emptyState();
      fresh.settings = Object.assign(RB.defaultSettings(), { name: S.settings.name, startedAt: new Date().toISOString() });
      if (await replaceAll(fresh)) toast('تم مسح البيانات.');
    },
    reload: () => location.reload(),
    // إكمال استيراد أو مسح لم يكتمل في البيانات المشتركة: إعادة كتابة ما في الشاشة (آمنة إن تكررت)
    resumereplace: async () => {
      if (await replaceAll(S)) toast('اكتمل الحفظ في البيانات المشتركة.');
    },
    dismissreplace: async () => {
      APP.replaceStale = false;
      updateBanner();
      try {
        await APP.backend.db.doc('config/replace').delete();
      } catch (e) {
        /* يبقى مخفياً في هذه الزيارة */
      }
    },
  };

  function go(page) {
    if (!isPage(page)) page = 'dashboard';
    ui.page = page;
    saveUI();
    try {
      if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
    } catch (e) {
      /* بعض الإطارات تمنع تعديل الرابط */
    }
    document.body.classList.remove('nav-open');
    render();
    const m = document.getElementById('main');
    if (m) m.scrollTo ? m.scrollTo(0, 0) : null;
    window.scrollTo(0, 0);
  }

  // استبدال الدفتر كله (البداية، الاستيراد، المسح، إكمال الحفظ). يرجع true فقط إن حُفظ كاملاً
  async function replaceAll(state) {
    if (APP.readOnly) {
      toast(RO_MSG, 'bad');
      return false;
    }
    S = RB.normalize(state);
    APP.demo = false;
    APP.real = null;
    bump();
    render();
    if (APP.backend.kind !== 'cloud') return APP.backend.replaceAll(S);
    // اللقطات الجزئية أثناء الكتابة لا تُعرض؛ يُطابق الدفتر مع البيانات المشتركة بعد الانتهاء
    APP.replacing = true;
    APP.save.pending++;
    updateSaveStatus();
    const t = document.createElement('div');
    t.className = 'toast sticky';
    document.getElementById('toast').appendChild(t);
    let res;
    try {
      res = await APP.backend.replaceAll(S, (done, total) => {
        if (total) t.dataset.total = total;
        t.textContent = `جاري الحفظ… ${done} من ${t.dataset.total || '?'}`;
      });
    } catch (e) {
      res = { ok: false, failed: countRecs(S) + 1, code: (e && e.code) || 'error' };
    }
    t.remove();
    APP.replacing = false;
    APP.save.pending--;
    if (res.ok) {
      APP.replaceFailed = null;
      APP.replaceStale = false;
      APP.save.failed = null;
      try {
        const d = await APP.backend.load();
        if (d) S = RB.normalize(d);
      } catch (e) {
        /* يبقى ما كُتب */
      }
      bump();
      render();
      return true;
    }
    if (res.code === 'invalid_argument' && APP.canWrite !== true) {
      // لا صلاحية تعديل: لا شيء كُتب، فيُعاد الدفتر المشترك كما هو
      APP.readOnly = true;
      APP.save.failed = 'invalid_argument';
      toast('ليست لديك صلاحية تعديل هذه البيانات.', 'bad');
      try {
        openBooks(await APP.backend.load());
      } catch (e) {
        render();
      }
      return false;
    }
    APP.replaceFailed = { n: res.failed };
    APP.save.failed = failCode(res.code);
    toast(res.code === 'invalid_id' ? 'معرّف سجل غير صالح: ' + (res.badIds || []).slice(0, 5).map(shortId).join('، ') : dbErrMsg(res), 'bad');
    render();
    return false;
  }

  // يفتح دفتراً محفوظاً، أو البيانات التجريبية إن لم يوجد
  function openBooks(d) {
    APP.real = null;
    if (hasBooks(d)) {
      S = RB.normalize(d);
      APP.demo = false;
    } else {
      S = RB.normalize(RB.demoState(today()));
      APP.demo = true;
    }
    bump();
    render();
  }
  // وضع التجربة بلا دفتر: بدأ أحدٌ الدفتر (الشريك في البيانات المشتركة أو نافذة أخرى) فيُفتح بدل التجربة
  async function adoptSaved() {
    if (APP.adopting) return;
    APP.adopting = true;
    let d = null;
    try {
      d = await APP.backend.load();
    } catch (e) {
      APP.adopting = false;
      return;
    }
    if (!(APP.demo && !APP.real && hasBooks(d))) {
      APP.adopting = false;
      return;
    }
    openBooks(d);
    // تعذّر التحميل عند الفتح ثم وصلت البيانات: ليست بداية جديدة من الشريك
    toast(APP.loadFailed ? 'تم فتح دفتر المطعم بعد تعذّر تحميله أول مرة.' : APP.backend.kind === 'cloud' ? 'بدأ شريكك دفتر المطعم — تم فتح البيانات المشتركة.' : 'بدأ دفتر المطعم في نافذة أخرى — تم فتحه هنا.');
  }

  function startWizard() {
    formModal({
      title: 'ابدأ ببيانات مطعمك',
      ok: 'ابدأ',
      value: { name: '', openingDate: '', vatRegistered: true, vatRegisteredFrom: '', p1: '', s1: 50, p2: '', s2: 50 },
      fields: [
        { type: 'html', html: () => '<p class="note">تبدأ بدفتر فارغ (قنوات البيع والتصنيفات جاهزة). البيانات التجريبية لن تُحفظ.</p>' },
        { k: 'name', label: 'اسم المطعم', req: 1 },
        { type: 'row', fields: [{ k: 'openingDate', type: 'date', label: 'تاريخ الافتتاح (أو المتوقع)' }, { k: 'vatRegistered', type: 'check', label: 'مسجل في ضريبة القيمة المضافة', redraw: true, help: 'التسجيل إلزامي إذا تجاوزت المبيعات الخاضعة 375,000 ر.س خلال 12 شهراً، واختياري من 187,500 ر.س' }] },
        {
          k: 'vatRegisteredFrom',
          type: 'date',
          label: 'تاريخ سريان التسجيل (من شهادة التسجيل، اختياري)',
          show: (v) => v.vatRegistered,
          help: 'اتركه فارغاً إن كان التسجيل سارياً قبل مشتريات التأسيس فتُخصم ضريبتها. العمليات قبل هذا التاريخ بلا ضريبة ولا تُسترد ضريبة مشترياتها، ويمكن تعديله لاحقاً من الإعدادات.',
        },
        { type: 'row', fields: [{ k: 'p1', label: 'الشريك الأول', req: 1 }, { k: 's1', type: 'num', label: 'نسبته %' }] },
        { type: 'row', fields: [{ k: 'p2', label: 'الشريك الثاني' }, { k: 's2', type: 'num', label: 'نسبته %' }] },
      ],
      onSave: async (v) => {
        // لا يُكتب فوق دفتر محفوظ: المشترك يُفتح كما هو، وفي المتصفح يلزم تأكيد حذفه
        let existing = APP.real;
        if (!existing) {
          try {
            existing = await APP.backend.load();
          } catch (e) {
            return 'تعذّر التحقق من البيانات المحفوظة، أعد المحاولة.';
          }
        }
        if (hasBooks(existing)) {
          if (APP.backend.kind === 'cloud') {
            const mine = existing === APP.real;
            openBooks(existing);
            toast(mine ? 'يوجد دفتر مشترك محفوظ — تم فتحه بدل البدء من جديد.' : 'بدأ شريكك دفتر المطعم — تم فتح البيانات المشتركة.');
            return;
          }
          const name = (existing.settings && existing.settings.name) || '';
          if (!(await confirmBox('يوجد دفتر محفوظ «' + esc(name) + '» فيه ' + countRecs(existing) + ' سجل وسيُحذف نهائياً. صدّر نسخة احتياطية أولاً إن احتجت.', { danger: true, ok: 'احذف وابدأ من جديد' }))) return false;
        }
        const st = RB.emptyState();
        Object.assign(st.settings, { name: v.name.trim(), openingDate: v.openingDate, vatRegistered: !!v.vatRegistered, vatRegisteredFrom: v.vatRegistered ? v.vatRegisteredFrom || '' : '', startedAt: new Date().toISOString() });
        st.partners.push({ id: RB.uid(), name: v.p1.trim(), share: num(v.s1), phone: '', note: '' });
        if (v.p2 && v.p2.trim()) st.partners.push({ id: RB.uid() + 'b', name: v.p2.trim(), share: num(v.s2), phone: '', note: '' });
        const ok = await replaceAll(st);
        go('partners');
        if (ok) toast('جاهز. ابدأ بتسجيل رأس المال ثم الأصول.');
      },
    });
  }

  // النسخة الاحتياطية: الدفتر المحفوظ لا البيانات التجريبية المعروضة فوقه
  const backupSource = () => (APP.demo && APP.real ? APP.real : S);
  const REAL_MSG = 'صُدّرت بياناتك الحقيقية وليست البيانات التجريبية';
  // آخر نسخة احتياطية (لتذكير الحفظ في المتصفح)
  function backedUp() {
    ui.lastBackupAt = new Date().toISOString();
    saveUI();
    render();
  }
  // الصفحة داخل إطار (Artifact): التنزيل المباشر بالرابط لا يعمل فيه
  const framed = () => {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  };
  // الكتابة في الحافظة. محظورة في الإطار: ترفض مباشرة دون محاولة يسجّلها المتصفح خطأً
  function writeClip(txt) {
    try {
      const fp = document.permissionsPolicy || document.featurePolicy;
      if (fp && !fp.allowsFeature('clipboard-write')) return Promise.reject(new Error('clipboard blocked'));
    } catch (e) {
      /* لا يُعرف: تُجرَّب الحافظة */
    }
    return navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject(new Error('no clipboard'));
  }
  // نافذة نسخ النص حين لا يمكن تنزيل الملف. ترجع (عند إغلاقها) true إن نُسخ النص
  function copyBox(title, txt) {
    return new Promise((resolve) => {
      let copied = false;
      const m = openModal({ title, wide: true, onClose: () => resolve(copied) });
      m.body.innerHTML = `<textarea class="copy-area" readonly aria-label="نص الملف">${esc(txt)}</textarea>`;
      m.foot.innerHTML = `<button type="button" class="btn primary" data-copy>نسخ</button><button type="button" class="btn ghost" data-close>إغلاق</button>`;
      const ta = m.body.querySelector('textarea');
      m.foot.querySelector('[data-copy]').addEventListener('click', async () => {
        try {
          await writeClip(txt);
          copied = true;
        } catch (e) {
          // الحافظة محظورة في الإطار: تحديد النص ونسخه بالطريقة القديمة
          ta.focus();
          ta.select();
          try {
            copied = document.execCommand('copy');
          } catch (x) {
            copied = false;
          }
        }
        toast(copied ? 'نُسخ النص. الصقه في ملف نصي واحفظه.' : 'تعذّر النسخ التلقائي: النص محدد، انسخه يدوياً.', copied ? '' : 'bad');
      });
      ta.focus();
      ta.select();
    });
  }
  // حفظ ملف: صلاحية التنزيل في Artifact، أو رابط تنزيل في المتصفح، أو نافذة نسخ النص إن تعذّر التنزيل.
  // ترجع true إن سُلّم الملف أو نُسخ نصه. opt.okMsg: رسالة النجاح
  async function saveFile(name, data, opt) {
    opt = opt || {};
    const copy = async () => {
      // علامة اتجاه قبل أول رقم: تاريخ الاسم يظهر بترتيبه بعد الحروف العربية
      const ok = await copyBox('التنزيل غير متاح هنا — انسخ النص واحفظه في ملف باسم ' + name.replace(/\d/, '\u200E$&'), data);
      if (ok && opt.okMsg) toast(opt.okMsg);
      return ok;
    };
    if (window.claude && typeof window.claude.use === 'function') {
      let dl = null;
      try {
        dl = await window.claude.use('downloads');
      } catch (e) {
        dl = null;
      }
      if (dl) {
        try {
          await dl.save({ filename: name, data });
          toast(opt.okMsg || 'تم حفظ الملف.');
          return true;
        } catch (e) {
          const code = e && e.code;
          if (code === 'declined') return false;
          if (code === 'rate_limited') {
            toast('نافذة الحفظ مفتوحة بالفعل، انتظر ثم حاول مرة أخرى', 'bad');
            return false;
          }
          if (code === 'too_large') {
            const mb = new Blob([data]).size / 1048576;
            toast(`الملف أكبر من الحجم المسموح للحفظ هنا (${mb.toFixed(1)} ميغابايت).${name.endsWith('.csv') ? ' اختر فترة أقصر.' : ''}`, 'bad');
            return false;
          }
          // unavailable وnot_granted وcapability_disabled وcapability_removed وأي رمز آخر
          return copy();
        }
      }
      // بلا صلاحية تنزيل داخل إطار: رابط التنزيل لا يعمل، فيُعرض النص للنسخ
      if (framed()) return copy();
    }
    const blob = new Blob([data], { type: name.endsWith('.csv') ? 'text/csv;charset=utf-8' : 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1500);
    if (opt.okMsg) toast(opt.okMsg);
    return true;
  }

  function exportCSV(what) {
    const [from, to] = range();
    const asOf = minD(to, today());
    let end = to;
    let rows = [];
    let name = what;
    if (what === 'expenses') {
      rows.push(['التاريخ', 'التصنيف', 'البيان', 'الجهة', 'قبل الضريبة', 'الضريبة', 'الإجمالي', 'الأشهر', 'الدفع من']);
      good(S.expenses).filter((x) => inRange(x.date)).sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((x) => {
        const v = RB.vatSplit(x.amount, x.includesVat, x.taxable, S.settings);
        rows.push([x.date, RB.expenseCat(x.category).name, x.desc, x.entity, v.net, v.vat, v.gross, x.months, RB.srcLabel(x.account, S)]);
      });
      name = 'المصاريف';
    } else if (what === 'purchases') {
      rows.push(['التاريخ', 'المورد', 'رقم الفاتورة', 'التصنيف', 'الدفع', 'خاضعة', 'قبل الضريبة', 'الضريبة', 'الإجمالي']);
      good(S.purchases).filter((p) => inRange(p.date)).sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((p) => {
        const v = RB.vatSplit(RB.purchaseTotal(p), p.includesVat, p.taxable, S.settings);
        rows.push([p.date, p.supplier, p.invoiceNo, RB.purchaseCat(p.category).name, RB.srcLabel(p.account, S), p.taxable ? 'نعم' : 'لا', v.net, v.vat, v.gross]);
      });
      name = 'المشتريات';
    } else if (what === 'sales') {
      const chs = S.settings.channels;
      rows.push(['التاريخ', ...chs.map((c) => c.name), 'الطلبات', 'الإجمالي']);
      good(S.sales).filter((s) => inRange(s.date)).sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((s) => rows.push([s.date, ...chs.map((c) => (s.channels[c.id] ? s.channels[c.id].amount : '')), RB.saleOrders(s), RB.saleTotal(s)]));
      name = 'المبيعات';
    } else if (what === 'statement') {
      const acc = ui.cashAcc === '1102' ? '1102' : '1101';
      const st = RB.accountStatement(S, acc, from, asOf, ledger(asOf));
      rows.push(['التاريخ', 'البيان', 'داخل', 'خارج', 'الرصيد']);
      rows.push([from, 'رصيد أول الفترة', '', '', st.opening]);
      st.rows.forEach((r) => rows.push([r.date, r.desc, r.in, r.out, r.balance]));
      name = acc === '1101' ? 'كشف-الصندوق' : 'كشف-البنك';
      end = asOf;
    } else {
      // التقارير مقطوعة عند اليوم مثل ما تعرضه الشاشة
      const L = ledger(asOf);
      const rep = isReport(ui.report) ? ui.report : 'income';
      end = asOf;
      if (rep === 'journal') {
        rows.push(['التاريخ', 'البيان', 'الحساب', 'مدين', 'دائن']);
        L.entries.filter((e) => e.date >= from && e.date <= asOf).forEach((e) => e.lines.forEach((l) => rows.push([e.date, l.memo ? e.desc + ' — ' + l.memo : e.desc, RB.accInfo(l.a, S).name, l.v > 0 ? l.v : '', l.v < 0 ? -l.v : ''])));
      } else if (rep === 'trial') {
        const t = RB.trialBalance(S, from, asOf, L);
        rows.push(['الرمز', 'الحساب', 'مدين', 'دائن']);
        t.rows.forEach((r) => rows.push([r.code, r.name, r.dr, r.cr]));
      } else if (rep === 'balance') {
        const b = RB.balanceSheet(S, asOf, L);
        rows.push(['القسم', 'البند', 'المبلغ']);
        b.cur.forEach((x) => rows.push(['أصول متداولة', x.name, x.amount]));
        b.fixed.forEach((x) => rows.push(['أصول ثابتة', x.name, x.amount]));
        b.liab.forEach((x) => rows.push(['التزامات', x.name, x.amount]));
        b.equity.forEach((x) => rows.push(['حقوق الشركاء', x.name, x.amount]));
      } else if (rep === 'vat') {
        const v = RB.vatReport(S, from, asOf, L);
        rows.push(['البند', 'المبلغ الخاضع', 'الضريبة']);
        rows.push(['المبيعات', v.sales.base, v.sales.vat]);
        Object.keys(v.inputs).forEach((k) => rows.push(['مدخلات: ' + k, v.inputs[k].base, v.inputs[k].vat]));
        rows.push(['الصافي', '', v.net]);
      } else if (rep === 'menu') {
        const m = RB.menuAnalysis(S, from, asOf, L);
        rows.push(['الصنف', 'الكمية', 'ربح الحبة', 'إجمالي الربح', 'تكلفة الطعام %', 'فئة المنيو', 'ماذا تفعل']);
        m.rows.forEach((r) => rows.push([r.name, r.qty, r.profit, r.totalProfit, r.foodCost, RB.MENU_CLASS[r.cls].name, RB.MENU_CLASS[r.cls].tip]));
      } else {
        const inc = RB.incomeStatement(S, from, asOf, L);
        rows.push(['القسم', 'البند', 'المبلغ']);
        rows.push(['الإيرادات', 'المبيعات بدون الضريبة', inc.revenue]);
        Object.keys(RB.GROUPS).filter((g) => g !== 'zakat').forEach((g) => inc.groups[g].forEach((x) => rows.push([RB.GROUPS[g], x.name, x.amount])));
        rows.push(['', 'صافي الربح قبل الزكاة', inc.netBeforeZakat]);
        rows.push([RB.GROUPS.zakat, RB.GROUPS.zakat, inc.zakat]);
        rows.push(['', 'صافي الربح بعد الزكاة', inc.net]);
      }
      name = (REPORTS.find((r) => r[0] === rep) || ['', 'تقرير'])[1];
    }
    saveFile(`${name}-${from}-${end}.csv`.replace(/\s+/g, '-'), RB.toCSV(rows));
  }

  function importFile(file) {
    const fr = new FileReader();
    fr.onload = async () => {
      const data = safeJSON(fr.result);
      const isObj = RB.isObj;
      if (!isObj(data) || (data.settings != null && !isObj(data.settings)) || (!isObj(data.settings) && !RB.SECTIONS.some((k) => Array.isArray(data[k])))) return toast('الملف ليس نسخة احتياطية صالحة من دفتر المطعم.', 'bad');
      if (APP.readOnly) return toast(RO_MSG, 'bad');
      // معرّف يكسر الصفحة أو مسار البيانات المشتركة: يُرفض الملف كله (لا تُغيَّر المعرّفات لأن السجلات مرتبطة بها)
      const badIds = RB.badIds(data);
      if (badIds.length) return toast(`لم يُستورد الملف: فيه معرّفات سجلات غير صالحة (${badIds.slice(0, 5).map(shortId).join('، ')}${badIds.length > 5 ? '…' : ''}).`, 'bad');
      // يُعد السجل الصالح فقط (كائن بمعرّف)، وتُذكر الأقسام التي ليست قوائم
      let n = 0;
      let skipped = 0;
      const notList = [];
      for (const k of RB.SECTIONS) {
        if (data[k] == null) continue;
        if (!Array.isArray(data[k])) notList.push(k);
        else for (const x of data[k]) RB.sanitizeRecord(k, x) ? n++ : skipped++;
      }
      // ما سيُستبدل: الدفتر المحفوظ، لا البيانات التجريبية المعروضة
      let cur = S;
      if (APP.demo) {
        cur = APP.real;
        if (!cur) {
          try {
            cur = await APP.backend.load();
          } catch (e) {
            return toast('تعذّر التحقق من البيانات المحفوظة، أعد المحاولة.', 'bad');
          }
        }
      }
      // الاستيراد يستبدل ولا يدمج: يُذكر عدد ما سيُحذف ويُنصح بالتصدير قبله
      const repl = hasBooks(cur) ? `ستحل محل ${APP.demo ? 'دفترك المحفوظ' : 'بياناتك الحالية'} «${esc((cur.settings && cur.settings.name) || '')}» (${countRecs(cur)} سجل) بالكامل. صدّر نسخة من بياناتك أولاً إن احتجتها.` : 'لا يوجد دفتر محفوظ الآن، فيبدأ دفترك بها.';
      const notes = (skipped ? `<br>تم تجاهل ${skipped} سجل غير صالح.` : '') + (notList.length ? `<br>أقسام ليست قوائم تم تجاهلها: ${esc(notList.join('، '))}.` : '');
      const demoNote = data.demo === true ? '<br><b>هذا ملف بيانات تجريبية وليس نسخة من دفترك.</b>' : '';
      if (!(await confirmBox(`استيراد نسخة «${esc((data.settings && data.settings.name) || '')}» فيها ${n} سجل؟ ${repl}${demoNote}${notes}`, { danger: true, ok: 'استورد' }))) return;
      delete data.demo;
      data.settings = Object.assign({}, data.settings, { startedAt: (data.settings && data.settings.startedAt) || new Date().toISOString() });
      if (await replaceAll(data)) toast('تم الاستيراد.');
    };
    fr.readAsText(file);
  }

  // ═════════════ الرسم ═════════════
  function shellHTML() {
    return `<div class="shell">
      <aside class="side" id="side" aria-label="القائمة الرئيسية">
        <div class="brand"><span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><div><b>دفتر المطعم</b><small id="restName"></small></div></div>
        <nav id="nav"></nav>
        <div class="side-foot" id="saveStatus"></div>
      </aside>
      <div class="scrim" data-act="menu"></div>
      <main class="main" id="main">
        <header class="topbar">
          <button type="button" class="icon-btn menu-btn" data-act="menu" aria-label="القائمة">☰</button>
          <div class="crumb" id="crumb"></div>
          <div class="period">
            <label for="periodSel" class="vh">الفترة</label>
            <select id="periodSel">${PERIODS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
            <span class="custom-range" id="customRange"><input type="date" id="pFrom" aria-label="من تاريخ"><span>—</span><input type="date" id="pTo" aria-label="إلى تاريخ"></span>
          </div>
        </header>
        <div id="banner"></div>
        <div class="page" id="page"></div>
      </main>
    </div>
    <div id="modals"></div><div id="toast" aria-live="polite"></div><div id="tip" role="tooltip" hidden></div>`;
  }

  function render() {
    const page = document.getElementById('page');
    if (!page) return;
    for (const k of Object.keys(CHARTS)) delete CHARTS[k];
    if (!isPage(ui.page)) ui.page = 'dashboard';
    document.getElementById('restName').textContent = S.settings.name || '';
    document.getElementById('nav').innerHTML = NAV.map(([g, items]) => `<div class="nav-g"><span>${g}</span>${items.map(([k, l]) => `<a href="#${k}" class="${ui.page === k ? 'on' : ''}" ${ui.page === k ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</div>`).join('');
    document.getElementById('crumb').textContent = PAGE_TITLES[ui.page] || '';
    document.getElementById('periodSel').value = ui.period;
    const cr = document.getElementById('customRange');
    cr.hidden = ui.period !== 'custom';
    // الفترة المخصصة: الحقلان يعرضان المحفوظ نفسه، فلا يظهر شهر غير المستخدم في الحساب
    const [a, b] = range();
    const custom = ui.period === 'custom';
    document.getElementById('pFrom').value = custom && RB.isISODate(ui.from) ? ui.from : a;
    document.getElementById('pTo').value = custom && RB.isISODate(ui.to) ? ui.to : b;
    document.body.classList.toggle('readonly', !!APP.readOnly);
    updateBanner();
    try {
      page.innerHTML = PAGES[ui.page]();
    } catch (e) {
      console.error(e);
      page.innerHTML = `<div class="empty-box bad">حدث خطأ أثناء عرض الصفحة: ${esc(e.message)}</div>`;
    }
    updateSaveStatus();
    afterRender(page);
  }

  // الأشرطة أعلى الصفحة: لا حفظ في المتصفح، انقطاع التحديث، حفظ لم يكتمل، عرض فقط، ووضع التجربة.
  // تُرسم فقط إن تغيرت (لا تُعاد قراءتها لقارئ الشاشة مع كل تنقل)
  let lastBanner = null;
  function updateBanner() {
    const el = document.getElementById('banner');
    if (!el) return;
    const bar = (cls, text, acts) => `<div class="banner ${cls}"><div>${text}</div>${acts ? `<div class="btn-row">${acts}</div>` : ''}</div>`;
    let h = '';
    if (APP.noStorage) h += bar('bad', '<b>هذا المتصفح لا يسمح بالحفظ (وضع خاص أو تخزين محظور) — لن تُحفظ بياناتك</b>', '');
    if (APP.syncLost) h += bar('bad', 'انقطع التحديث المباشر للبيانات المشتركة، وقد لا تكون تعديلات شريكك الأخيرة ظاهرة. أعد تحميل الصفحة قبل أن تعدّل.', btn('إعادة تحميل الصفحة', 'reload', '', 'sm primary'));
    if (APP.replaceFailed) h += bar('bad', `<b>لم يكتمل الحفظ في البيانات المشتركة (<span class="n">${APP.replaceFailed.n}</span> سجل) — البيانات في الشاشة غير محفوظة بالكامل</b>`, btn('أكمل الحفظ', 'resumereplace', '', 'sm primary'));
    if (APP.replaceStale && !APP.replaceFailed) h += bar('warn', 'استيراد/مسح سابق لم يكتمل — أعد العملية', btn('إخفاء', 'dismissreplace', '', 'sm ghost'));
    if (APP.readOnly && !APP.demo) h += bar('info', RO_MSG, '');
    if (APP.demo)
      h += bar(
        'demo',
        '<b>بيانات تجريبية لمطعم برقر</b> — جرّب كل شيء بحرية؛ لا يُحفظ أي تعديل. الأرقام أمثلة توضيحية وليست أسعاراً أو رسوماً رسمية.',
        // فوق دفتر محفوظ: الرجوع إليه فقط (البدء من جديد يكون بمسح البيانات من الإعدادات)
        APP.real ? btn('الرجوع لبياناتي', 'leavedemo', '', 'primary sm') : btn('ابدأ ببيانات مطعمك', 'start', '', 'primary sm')
      );
    if (h !== lastBanner) {
      el.innerHTML = h;
      lastBanner = h;
    }
  }

  // حالة الحفظ الحقيقية في الشريط الجانبي
  function updateSaveStatus() {
    const el = document.getElementById('saveStatus');
    if (!el) return;
    const kind = APP.backend ? APP.backend.kind : '';
    const f = APP.save.failed;
    const at = APP.savedAt ? ' · ' + TIMEF.format(new Date(APP.savedAt)) : '';
    const dot = (k) => `<span class="dot ${k}" aria-hidden="true"></span>`;
    let h = '';
    if (APP.demo) h = `${dot('warn')}وضع التجربة — لا يُحفظ`;
    else if (f && f !== 'invalid_argument') h = `${dot('bad')}<span class="ss-t">لم يُحفظ آخر تعديل — صدّر نسخة احتياطية</span>${btn('تصدير', 'backup', '', 'sm ghost')}`;
    else if (APP.syncLost) h = `${dot('bad')}غير متزامن`;
    else if (APP.readOnly || f === 'invalid_argument') h = `${dot(f ? 'bad' : 'warn')}عرض فقط — لا تملك صلاحية التعديل`;
    else if (APP.save.pending > 0) h = `${dot('warn')}جاري الحفظ…`;
    else if (kind === 'cloud') h = `${dot('good')}محفوظ ومشترك${at}`;
    else if (kind === 'local') h = `${dot('good')}محفوظ في هذا المتصفح${at}`;
    el.innerHTML = h;
  }

  let rt = null;
  function scheduleRender() {
    clearTimeout(rt);
    rt = setTimeout(render, 80);
  }

  function bindGlobal() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.closest('.dialog form')) return;
      const fn = ACT[el.dataset.act];
      if (fn) {
        e.preventDefault();
        fn(el, e);
      }
    });
    document.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'periodSel') {
        // الفترة المخصصة تبدأ من الفترة المعروضة إن لم تُحدَّد من قبل
        const [a, b] = range();
        ui.period = t.value;
        if (t.value === 'custom' && !(RB.isISODate(ui.from) && RB.isISODate(ui.to))) {
          ui.from = a;
          ui.to = b;
        }
        saveUI();
        render();
      } else if (t.id === 'pFrom' || t.id === 'pTo') {
        // حقل فارغ أو تاريخ غير صالح يعيد القيمة السابقة. وإن صار «من» بعد «إلى» يُعدَّل الطرف الآخر إلى نهاية شهر «من» أو أول شهر «إلى»
        const v = t.value;
        if (!RB.isISODate(v)) {
          t.value = t.id === 'pFrom' ? ui.from : ui.to;
          return;
        }
        // الطرف الآخر كما يظهر في الشاشة إن لم يكن محفوظاً
        const [a, b] = range();
        if (!RB.isISODate(ui.from)) ui.from = a;
        if (!RB.isISODate(ui.to)) ui.to = b;
        if (t.id === 'pFrom') {
          ui.from = v;
          if (ui.to < ui.from) {
            ui.to = RB.monthEnd(ui.from.slice(0, 7));
            toast('عُدّل تاريخ «إلى» ليأتي بعد «من»');
          }
        } else {
          ui.to = v;
          if (ui.to < ui.from) {
            ui.from = ui.to.slice(0, 7) + '-01';
            toast('عُدّل تاريخ «من» ليأتي قبل «إلى»');
          }
        }
        saveUI();
        render();
      } else if (t.id === 'importFile' && t.files && t.files[0]) {
        importFile(t.files[0]);
        t.value = '';
      }
    });
    window.addEventListener('hashchange', () => {
      const p = location.hash.slice(1);
      if (p && p !== ui.page && isPage(p)) {
        ui.page = p;
        saveUI();
        document.body.classList.remove('nav-open');
        render();
        window.scrollTo(0, 0);
      }
    });
    let rz = null;
    window.addEventListener('resize', () => {
      clearTimeout(rz);
      rz = setTimeout(() => {
        document.querySelectorAll('.chart').forEach((el) => CHARTS[el.id] && drawColumns(el, CHARTS[el.id]));
      }, 120);
    });
    // تلميحات الرسوم البيانية
    const tip = document.getElementById('tip');
    const showTip = (el, x, y) => {
      tip.textContent = el.getAttribute('data-tip');
      tip.hidden = false;
      const r = tip.getBoundingClientRect();
      tip.style.left = Math.min(Math.max(8, x - r.width / 2), window.innerWidth - r.width - 8) + 'px';
      tip.style.top = Math.max(8, y - r.height - 14) + 'px';
    };
    document.addEventListener('mousemove', (e) => {
      const el = e.target.closest && e.target.closest('[data-tip]');
      if (el) showTip(el, e.clientX, e.clientY);
      else tip.hidden = true;
    });
    document.addEventListener('touchstart', (e) => {
      const el = e.target.closest && e.target.closest('[data-tip]');
      if (el && e.touches[0]) showTip(el, e.touches[0].clientX, e.touches[0].clientY);
      else tip.hidden = true;
    }, { passive: true });
    const flush = () => APP.backend && APP.backend.flush && APP.backend.flush();
    window.addEventListener('pagehide', flush);
    // تعديل لم يُؤكَّد حفظه أو فشل حفظه: تنبيه قبل مغادرة الصفحة
    window.addEventListener('beforeunload', (e) => {
      const f = APP.save.failed;
      if (APP.demo || !(APP.save.pending > 0 || (f && f !== 'invalid_argument'))) return;
      e.preventDefault();
      e.returnValue = '';
    });
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  }

  // بيانات وصلت من الخارج (شريك في البيانات المشتركة أو نافذة أخرى). يرجع true إن تغيّر شيء
  function onRemote(section, data) {
    // أثناء الاستيراد أو المسح تصل لقطات جزئية: تُتجاهل، ويُطابق الدفتر بعد الانتهاء
    if (APP.replacing) return false;
    if (section === 'settings') {
      if (!RB.isObj(data)) return false;
      data = RB.normalize({ settings: data }).settings;
    } else {
      // كل سجل يُنظّف كما عند التحميل (المعيب يُعلَّم ولا يكسر الصفحات)، وتصنيفات المصاريف القديمة تُرحّل
      data = (Array.isArray(data) ? data : []).map((x) => RB.sanitizeRecord(section, x)).filter(Boolean);
      if (section === 'expenses') data = data.map(RB.migrateExpense);
    }
    if (APP.demo) {
      if (APP.real) {
        APP.real[section] = data;
        return true;
      }
      // التجربة بلا دفتر: لقطة فيها بيانات حقيقية تعني أن أحداً بدأ الدفتر (اللقطات الفارغة الأولى تُتجاهل)
      if (section === 'settings' ? !!data.startedAt : data.length > 0) adoptSaved();
      return false;
    }
    if (JSON.stringify(data) === JSON.stringify(S[section])) return false;
    S[section] = data;
    bump();
    scheduleRender();
    return true;
  }

  async function boot() {
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
    const root = document.getElementById('app');
    root.innerHTML = shellHTML();
    bindGlobal();
    // صفحة أو تقرير محفوظ لم يعد صالحاً (أو من خصائص الكائنات الموروثة) يعود للبداية
    const uiWas = JSON.stringify(ui);
    if (!isPage(ui.page)) ui.page = 'dashboard';
    if (!isReport(ui.report)) ui.report = 'income';
    if (RB.isISODate(ui.from) && RB.isISODate(ui.to) && ui.from > ui.to) [ui.from, ui.to] = [ui.to, ui.from];
    if (JSON.stringify(ui) !== uiWas) saveUI();
    const h = location.hash.slice(1);
    if (h && isPage(h)) ui.page = h;
    else if (h) {
      try {
        history.replaceState(null, '', '#' + ui.page);
      } catch (e) {
        /* بعض الإطارات تمنع تعديل الرابط */
      }
    }
    document.getElementById('page').innerHTML = `<div class="loading"><span class="mark big" aria-hidden="true"><i></i><i></i><i></i><i></i></span><p>جاري فتح دفاتر المطعم…</p></div>`;
    let backend = null;
    if (window.claude && typeof window.claude.use === 'function') {
      try {
        const db = await window.claude.use('db');
        if (db) backend = new CloudBackend(db);
      } catch (e) {
        backend = null;
      }
    }
    APP.backend = backend || new LocalBackend();
    if (backend) {
      // من لا يملك صلاحية تعديل البيانات المشتركة يرى الدفتر للعرض فقط (null = لم تحدد المنصة: يقرر أول حفظ)
      try {
        const u = await window.claude.use('user');
        APP.canWrite = u && typeof u.can === 'function' ? await u.can('data.write') : null;
      } catch (e) {
        APP.canWrite = null;
      }
      APP.readOnly = APP.canWrite === false;
    } else {
      // وضع خاص أو تخزين محظور: لا يُحفظ شيء، فيُقال ذلك صراحة
      const okLS = lsSet('rb-probe', '1');
      try {
        localStorage.removeItem('rb-probe');
      } catch (e) {
        /* محظور */
      }
      if (!okLS) {
        APP.noStorage = true;
        APP.save.failed = 'local';
      }
    }
    // علامة استيراد أو مسح بدأ ولم ينتهِ: تُقرأ مع الدفتر في الوقت نفسه
    const stale = backend
      ? Promise.resolve()
          .then(() => backend.retry(() => backend.db.doc('config/replace').get()))
          .then((r) => !!(r && r.exists), () => false)
      : Promise.resolve(false);
    let data = null;
    try {
      data = await APP.backend.load();
    } catch (e) {
      APP.loadFailed = true;
      toast('تعذّر تحميل البيانات المحفوظة. أعد تحميل الصفحة قبل أن تبدأ.', 'bad');
    }
    APP.replaceStale = await stale;
    if (hasBooks(data)) {
      S = RB.normalize(data);
      APP.demo = false;
    } else {
      S = RB.normalize(RB.demoState(today()));
      APP.demo = true;
    }
    bump();
    if (APP.backend.subscribe) APP.backend.subscribe(onRemote);
    render();
  }

  window.RBApp = { get state() { return S; }, go, render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
