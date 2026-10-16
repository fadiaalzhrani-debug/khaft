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
  // syncLost: انقطع التحديث المباشر. replacing: استيراد أو مسح جارٍ في البيانات المشتركة من هذه الصفحة.
  // replaceFailed: لم يكتمل ذلك (state: الدفتر المطلوب حفظه). replaceMarker: علامة config/replace كما في البيانات المشتركة.
  // retrying: إعادة حفظ ما لم يُحفظ جارية (زر «أعد المحاولة»). revoked: توقف الوصول إلى البيانات المشتركة (نهائي لهذه
  // الزيارة، وسببه لا تذكره المنصة: صلاحية أو مشاركة أو إتاحة) فلا تعديل ولا «أعد المحاولة» بعده.
  // noShared: الصفحة داخل Claude (Artifact) والبيانات المشتركة غير متاحة في هذه الزيارة: لا يُبدأ دفتر خاص بهذا المتصفح
  // (لا يراه الشريك)، وتُعرض التجربة أو نسخة خاصة من زيارة سابقة مع شريط دائم
  const APP = {
    mode: 'loading', demo: false, backend: null, savedAt: 0, real: null, warnedDemo: false,
    save: { pending: 0, failed: null }, canWrite: null, readOnly: false, syncLost: false, noStorage: false,
    replacing: false, replaceFailed: null, replaceMarker: null, adopting: false, loadFailed: false, retrying: false, revoked: false, noShared: false,
    // عدد اللقطات التي وصلت من الخارج (loadSettled: قراءة وصلت أثناءها لقطة تُعاد)
    remoteSeq: 0,
  };
  // معرّف هذه الزيارة: يميّز علامة الاستيراد التي كتبتها هذه الصفحة عن علامة جهاز آخر
  const SID = Math.random().toString(36).slice(2, 10);
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
  // وقت آخر نسخة احتياطية في مفتاح وحده: نافذة أخرى تحفظ حالة واجهتها (ui) فلا تمحوه. ui.lastBackupAt من نسخة سابقة
  const BACKUP_KEY = 'rb-restaurant-last-backup';
  const lastBackupAt = () => Date.parse(lsGet(BACKUP_KEY) || ui.lastBackupAt || '');
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
  // نسبة محفوظة كما أدخلها المستخدم (عمولة، تأمينات): حتى منزلتين بلا أصفار زائدة — 0.75% و20% و11.75%،
  // لا 0.8% في الإقفال و0.80% في الإعدادات للنسبة نفسها. pct للنسب المحسوبة (هامش، تكلفة طعام…)
  const rate = (n) => `<span class="n">${+num(n).toFixed(2)}%</span>`;
  // العدد والمعدود (RB.countText): «3 أيام»، «12 يوماً»، «يومان». o.gen بعد حرف جر أو مضاف («خلال يومين»)،
  // o.wrap: وسم الرقم (مثل <span class="n">). الناتج نص عادي ما لم يُعطَ wrap
  const W = RB.WORDS;
  const cnt = (n, forms, o) => {
    o = o || {};
    return RB.countText(n, forms, { gen: o.gen, fmt: (x) => (o.wrap ? o.wrap(fmt0(x)) : fmt0(x)) });
  };
  const numSpan = (s) => `<span class="n">${s}</span>`;
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const N = (n, cls) => `<span class="n ${cls || ''} ${r2(n) < 0 ? 'neg' : ''}">${fmt(n)}</span>`;
  const N0 = (n) => `<span class="n">${fmt0(n)}</span>`;
  const cur = () => esc(S.settings.currency || 'ر.س');
  // قيمة خام (تاريخ غير صالح، شهر…) داخل نص عربي: تُعزل باتجاه من اليسار لليمين (LRI…PDI)، وإلا قلب
  // ترتيب الاتجاهات أجزاءها فظهر «2026-13-45» كأنه «45-13-2026». تصلح للنص والسمات معاً
  const ltr = (s) => '\u2066' + s + '\u2069';
  // التاريخ غير الصالح (بيانات منقولة أو معيبة) يُعرض كما هو
  const dt = (iso) => {
    if (!iso) return '';
    if (!RB.isISODate(iso)) return ltr(esc(iso));
    const y = iso.slice(0, 4);
    const s = +iso.slice(8, 10) + ' ' + RB.MONTHS[+iso.slice(5, 7) - 1];
    return `<span class="dt">${s}${y !== today().slice(0, 4) ? ' ' + y : ''}</span>`;
  };
  const dtText = (iso) => (!iso ? '' : !RB.isISODate(iso) ? ltr(esc(iso)) : +iso.slice(8, 10) + ' ' + RB.MONTHS[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4));
  const good = RB.good;
  // عدد السجلات في دفتر، وهل فيه بيانات حقيقية (بدأه أحد أو فيه سجلات)
  const countRecs = (st) => RB.SECTIONS.reduce((n, k) => n + (st && Array.isArray(st[k]) ? st[k].length : 0), 0);
  const shortId = (id) => (id.length > 24 ? id.slice(0, 24) + '…' : id);
  const hasBooks = (st) => !!st && ((RB.isObj(st.settings) && !!st.settings.startedAt) || countRecs(st) > 0);
  const chip = (t, k) => `<span class="chip ${k || ''}">${t}</span>`;
  // مستوى تكلفة الطعام مقابل المستهدف، واحد في كل مكان: ضمنه، أعلى بـ3 نقاط أو أقل، أو أعلى بأكثر من 3 نقاط
  const fcLevel = (fc, t) => (fc <= t ? 'good' : fc <= t + 3 ? 'warn' : 'bad');

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
    const first = ledger().entries[0];
    if (first && first.date < lo) lo = first.date;
    boundsCache = { v: VER, t, b: [lo, hi] };
    return [lo, hi];
  }
  // الفترة تُحسب مرة لكل (نسخة البيانات، الفترة المختارة، اليوم): inRange تُستدعى لكل سجل في القوائم الطويلة
  let rangeCache = null;
  function rangeRef() {
    const t = today();
    const k = VER + '|' + ui.period + '|' + ui.from + '|' + ui.to + '|' + t;
    if (!rangeCache || rangeCache.k !== k) rangeCache = { k, r: calcRange(t) };
    return rangeCache.r;
  }
  const range = () => rangeRef().slice();
  function calcRange(t) {
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
    const r = rangeRef();
    return d >= r[0] && d <= r[1];
  };
  function periodLabel() {
    const [a, b] = range();
    const t = today();
    if (b > t && a <= t) return dtText(a) + ' — حتى ' + dtText(t);
    if (a.slice(0, 7) === b.slice(0, 7) && a.endsWith('-01') && b === RB.monthEnd(b.slice(0, 7))) return RB.monthName(a.slice(0, 7));
    return dtText(a) + ' — ' + dtText(b);
  }

  // دفتر قيود واحد لكل نسخة من البيانات، بكل القيود بلا قطع بتاريخ: كل تقرير يقطعه بتواريخه
  // (الفترة، أو اليوم، أو نهاية الإقرار)، فلا يُعاد بناؤه مع تغيّر الفترة أو إعادة الرسم
  let ledgerCache = null;
  function ledger() {
    if (!ledgerCache || ledgerCache.v !== VER) ledgerCache = { v: VER, L: RB.buildLedger(S, '9999-12-31') };
    return ledgerCache.L;
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
      this.pending = []; // {op: 'put'|'del'|'settings', section, rec|id|s, keys}
      this.raw = null; // آخر نص قرأته هذه النافذة أو كتبته
    }
    async load() {
      this.raw = lsGet(this.key);
      return safeJSON(this.raw);
    }
    // تطبيق العمليات المنتظرة على نسخة من الدفتر (بالمعرّف)
    apply(st) {
      for (const p of this.pending) {
        // الإعدادات: المفاتيح التي غيّرها الحفظ فقط فوق آخر نسخة مخزنة (ما حفظته نافذة أخرى في غيرها يبقى)
        if (p.op === 'settings') st.settings = RB.settingsWith(st.settings, p.s, p.keys);
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
    saveSettings(s, keys) {
      this.pending.push({ op: 'settings', s: clone(s), keys });
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
        // نسخة احتياطية أُخذت من نافذة أخرى: يزول تذكيرها هنا أيضاً
        if (e.key === BACKUP_KEY) return scheduleRender();
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
      // لا يُقترح حذف سجلات قديمة: كل رصيد في الدفتر تراكمي من بدايته، فحذفها يغيّر الأرصدة كلها
      case 'quota_exceeded':
        return 'امتلأت مساحة البيانات المشتركة فلم يُحفظ هذا التعديل. صدّر نسخة احتياطية الآن ففيها ما لم يُحفظ، ولا تحذف سجلات قديمة لتفريغ المساحة: حذفها يغيّر أرصدة الصندوق والبنك والمخزون والضريبة وحقوق الشركاء.';
      case 'invalid_argument':
      case 'transform_error':
        return APP.readOnly ? 'ليست لديك صلاحية تعديل هذه البيانات.' : 'تعذّر الحفظ: السجل غير صالح أو أكبر من الحجم المسموح.';
      case 'invalid_id':
        return 'معرّف سجل غير صالح';
      case 'revoked':
        return LOST_MSG;
      case 'not_granted':
      case 'capability_disabled':
      case 'capability_removed':
        return 'البيانات المشتركة غير متاحة في هذه الصفحة.';
      case 'resource_exhausted':
        return 'طلبات كثيرة على البيانات المشتركة. انتظر قليلاً ثم أعد المحاولة.';
      case 'busy':
        return BUSY_MSG;
      default:
        return 'تعذّر الحفظ في البيانات المشتركة (انقطاع مؤقت). أعد المحاولة بعد قليل.';
    }
  }

  // استيراد أو مسح أو بداية دفتر جارية في البيانات المشتركة من جهاز آخر: لا تبدأ عملية ثانية فوقها (يُخلط الدفتران)
  const BUSY_MSG = 'جهاز آخر يستورد أو يمسح البيانات المشتركة الآن — انتظر حتى ينتهي ثم أعد المحاولة.';
  // عقد استبدال الدفتر (config/replacelock): يُجدَّد كل ثلث مدته ما دامت العملية جارية، فإن توقفت الصفحة انتهى بعد
  // 30 ثانية ولا يمنع غيرها
  const LEASE_MS = 30000;
  class CloudBackend {
    constructor(db) {
      this.kind = 'cloud';
      this.db = db;
      this.q = {};
      this.subs = {};
      // حفظ فشل ولم ينجح بعده (المسار ← {section, id, rec}؛ rec = null للحذف): الحالة لا تعود «محفوظ» قبل أن يُحفظ
      // كل منها، وما في الشاشة يبقى كما أدخله المستخدم (لقطة البيانات المشتركة لا تمحوه) فتشمله النسخة الاحتياطية.
      // إعادة حفظه أو حذفه تحل محله من بدايتها، فلا تُعيد لقطتها أثناء الحفظ القيمة القديمة إلى الشاشة
      this.bad = RB.unsavedWrites();
      // آخر ما رأته هذه الصفحة محفوظاً (قبل ما يُحفظ منها): كل قسم بمعرّفات سجلاته، والإعدادات. يُبنى عليه كل تعديل
      // (base) فيُعرف عند إعادة المحاولة وعند حفظ الإعدادات ما غيّره الشريك بعده
      this.raw = {};
      this.seenSettings = undefined;
    }
    seen(section, data) {
      this.raw[section] = new Map(data.map((x) => [String(x.id), clone(x)]));
    }
    async load() {
      // الإعدادات وكل المجموعات معاً لا واحدة بعد الأخرى (فتح أسرع). ولكل قراءة إعادة محاولة عند الانقطاع المؤقت
      // أو الحد المؤقت لعدد الطلبات، فلا يُفشل خطأ عابر القراءة (التحقق قبل البداية والاستيراد يعتمد عليها)
      const [st, ...snaps] = await Promise.all([
        this.retry(() => this.db.doc('config/settings').get()),
        ...RB.SECTIONS.map((k) => this.retry(() => this.db.collection(k).get())),
      ]);
      const out = { settings: st.exists ? clone(st.data()) : null };
      this.seenSettings = st.exists ? clone(st.data()) : null;
      RB.SECTIONS.forEach((k, i) => {
        out[k] = snaps[i].docs.map(docRec);
        this.seen(k, out[k]);
      });
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
      add('settings', () => this.db.doc('config/settings'), (s) => {
        this.seenSettings = s.exists ? clone(s.data()) : null;
        if (s.exists) cb('settings', clone(s.data()));
      });
      // علامة الاستيراد أو المسح: يظهر أن جهازاً آخر يستورد الآن، ويختفي التنبيه حين ينتهي
      add('replace', () => this.db.doc('config/replace'), (s) => cb('replace', s.exists ? clone(s.data()) : null));
      for (const k of RB.SECTIONS)
        add(
          k,
          () => this.db.collection(k),
          (snap) => {
            const data = snap.docs.map(docRec);
            this.seen(k, data);
            cb(k, data);
          }
        );
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
        if (code === 'revoked') return this.lost();
        // كل المستمعين قد ينقطعون معاً: يُعاد الرسم مرة واحدة لكل تغيّر في الحالة
        if (APP.syncLost) return;
        APP.syncLost = true;
        render();
        return;
      }
      clearTimeout(s.timer);
      s.timer = setTimeout(() => this.listen(key), 1000 * s.tries + Math.random() * 1500);
    }
    // توقف الوصول (revoked، من مستمع أو من كتابة): عرض فقط بقية الزيارة بلا «أعد المحاولة» (لن ينجح)، وما لم يُحفظ
    // يبقى في الشاشة وفي النسخة الاحتياطية. مرة واحدة لكل المستمعين والكتابات
    lost() {
      if (APP.revoked) return;
      APP.revoked = APP.syncLost = APP.readOnly = true;
      render();
      // الشريط مخفي خلف النموذج المفتوح: يُقال الآن قبل أن يكمل المستخدم الإدخال (الحفظ لن يُغلقه، فيُنسخ ما فيه)
      if (OPEN_FORMS.size) toast(LOST_MSG, 'bad');
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
    // onErr (إعادة المحاولة من الشريط): يُجمع الخطأ فيُنبَّه مرة واحدة لكل المحاولات، لا رسالة لكل سجل
    write(path, fn, section, keep, onErr) {
      APP.save.pending++;
      updateSaveStatus();
      const n = this.bad.start(path, keep);
      return this.chain(path, fn)
        .then(() => {
          this.bad.ok(path, n);
          if (!this.bad.size) APP.save.failed = null;
          APP.savedAt = Date.now();
        })
        .catch((e) => this.failed(e, section, path, keep, n, onErr))
        .finally(() => {
          APP.save.pending--;
          updateSaveStatus();
        });
    }
    failed(e, section, path, keep, n, onErr) {
      const code = e && e.code;
      // رفض الكتابة لمن لم تحدد المنصة صلاحيته: عرض فقط بقية الزيارة، ويُعاد القسم من البيانات المشتركة (لا يبقى سجل وهمي،
      // ولا يُعرض ما كان يُحفظ فوق اللقطات)
      if (code === 'invalid_argument' && APP.canWrite !== true) {
        this.bad.discard(path, n);
        APP.save.failed = code;
        APP.readOnly = true;
        toast('ليست لديك صلاحية تعديل هذه البيانات.', 'bad');
        this.resync(section);
        return;
      }
      // توقف الوصول: نهائي (لا «أعد المحاولة»)، وينبَّه له مرة واحدة لا لكل كتابة
      const again = code === 'revoked' && APP.revoked;
      if (code === 'revoked') this.lost();
      // تلتها كتابة أحدث للمستند نفسه (تعديل أو حذف بعدها): تلك هي التي تقرر ما يُحفظ وما يُنبَّه له
      if (!this.bad.fail(path, n, keep)) return;
      APP.save.failed = failCode(code || (e instanceof TypeError ? 'invalid_id' : 'error'));
      if (again) return;
      if (onErr) onErr(e);
      else toast(dbErrMsg(e), 'bad');
    }
    // لقطة من البيانات المشتركة ومعها ما يُحفظ الآن وما فشل حفظه من هذه الصفحة (كما في الشاشة): لقطة تصل أثناء
    // إعادة المحاولة التلقائية (بالقيمة القديمة) لا تُخفي التعديل الجاري حفظه
    overlay(section, data) {
      const un = this.bad.values();
      return un.length ? RB.withUnsaved(section, data, un) : data;
    }
    // زر «أعد المحاولة» في شريط «لم يُحفظ آخر تعديل»: كل ما فشل حفظه أو حذفه ولا تجري له كتابة الآن يُعاد بآخر ما
    // أراده المستخدم (يُحفظ السجل، أو يُحذف، أو تُحفظ الإعدادات). السجل يُقرأ أولاً كما هو محفوظ الآن: إن عدّله الشريك بعد
    // ما بُني عليه التعديل (base) يُكتب ما غيّره المستخدم وحده فوق نسخة الشريك (RB.editMerge)، ويُسأل مرة واحدة (ask) عمّا
    // غيّراه كلاهما، وعن سجل حذفه الشريك وكان المستخدم عدّله، وسجل عدّله الشريك وكان المستخدم حذفه — فلا يمحو الضغط على
    // الزر تعديلات الشريك بصمت. ask(items) يرجع true لما أدخله المستخدم، وfalse لما حفظه الشريك.
    // يرجع null إن لم يبقَ ما يُعاد، وإلا {ok, err, merged}: ok إن لم يبقَ شيء لم يُحفظ، وerr آخر خطأ (للتنبيه مرة
    // واحدة)، وmerged عدد السجلات التي دُمج فيها تعديل المستخدم مع تعديل الشريك
    async retryFailed(ask) {
      const list = this.bad.failed();
      if (!list.length) return null;
      let err = null;
      const plans = (
        await Promise.all(
          list.map(async ({ path, keep }) => {
            if (keep.section === 'settings' || keep.base === undefined) return { path, keep, rec: keep.rec };
            let cur;
            try {
              const d = await this.retry(() => this.db.collection(keep.section).doc(String(keep.id)).get());
              cur = d.exists ? docRec(d) : null;
            } catch (e) {
              err = e;
              return null;
            }
            const base = keep.base;
            const same = (a, b) => (a === null || b === null ? a === b : RB.sameRec(a, b));
            if (same(cur, base) || same(cur, keep.rec)) return { path, keep, rec: keep.rec, cur };
            if (!keep.rec) return { path, keep, rec: null, cur, kind: 'edited' };
            if (!cur) return { path, keep, rec: keep.rec, cur, kind: 'deleted' };
            const mg = RB.editMerge(base || {}, base || {}, keep.rec, cur);
            return { path, keep, rec: mg.rec, cur, clash: mg.clash, kind: mg.clash.length ? 'clash' : 'merged' };
          })
        )
      ).filter(Boolean);
      const asks = plans.filter((p) => p.kind && p.kind !== 'merged');
      const mine = !asks.length || !ask || (await ask(asks));
      let merged = 0;
      const jobs = [];
      for (const p of plans) {
        // أثناء السؤال حفظه المستخدم من جديد أو حُفظ: الكتابة الأحدث هي التي تقرر
        if (!this.bad.failed().some((f) => f.path === p.path && f.keep === p.keep)) continue;
        let rec = p.rec;
        if (!mine && p.kind === 'clash') {
          rec = clone(p.rec);
          for (const f of p.clash) {
            if (p.cur[f] === undefined) delete rec[f];
            else rec[f] = clone(p.cur[f]);
          }
        }
        if (!mine && (p.kind === 'deleted' || p.kind === 'edited' || (p.kind === 'clash' && RB.sameRec(rec, p.cur)))) {
          // أبقى المستخدم ما حفظه الشريك: لا كتابة، وتعود الشاشة للبيانات المشتركة
          this.bad.drop(p.path);
          this.resync(p.keep.section);
          continue;
        }
        if (p.kind === 'merged' || p.kind === 'clash') merged++;
        // ما يُكتب الآن مبني على المحفوظ الآن: إن فشل ثانية يُقارن به
        jobs.push(this.save(Object.assign({}, p.keep, { rec }, p.cur !== undefined ? { base: p.cur } : {}), (e) => (err = e)));
      }
      await Promise.all(jobs);
      if (!this.bad.size) APP.save.failed = null;
      return { ok: !this.bad.size, err, merged };
    }
    // السجل كما هو محفوظ الآن (لقطة هذه الصفحة قد تصل متأخرة) ومعه ما يُحفظ منها أو فشل حفظه كما في الشاشة: يُقارن به
    // نموذج التعديل عند الحفظ. undefined إن تعذّرت القراءة سريعاً (يُعتمد ما في الشاشة)
    async fresh(section, id) {
      try {
        const d = await Promise.race([this.db.collection(section).doc(String(id)).get(), new Promise((r) => setTimeout(r, 5000))]);
        if (!d) return undefined;
        const list = this.overlay(section, d.exists ? [docRec(d)] : []);
        return list.find((x) => RB.isObj(x) && String(x.id) === String(id)) || null;
      } catch (e) {
        return undefined;
      }
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
      return this.save(this.based({ section, id: rec.id, rec: clone(rec) }));
    }
    del(section, id) {
      return this.save(this.based({ section, id, rec: null }));
    }
    // المستند كما كان محفوظاً حين بدأ تعديل المستخدم (base؛ null: لم يكن موجوداً). تعديل ثانٍ لسجل يُحفظ الآن أو فشل حفظه
    // يبقى مبنياً على ما بُني عليه الأول (لم يُحفظ ما بينهما)
    based(keep) {
      const prev = this.bad.keeps(keep.section + '/' + keep.id).find((k) => k.base !== undefined);
      const raw = this.raw[keep.section];
      if (prev) keep.base = prev.base;
      else if (raw) keep.base = raw.has(String(keep.id)) ? clone(raw.get(String(keep.id))) : null;
      return keep;
    }
    // keys: مفاتيح الإعدادات التي غيّرها هذا الحفظ، ومعها مفاتيح حفظ سابق للإعدادات يجري أو فشل (لا يضيع إن فشل).
    // base: الإعدادات كما رأتها هذه الصفحة محفوظة الآن؛ يُدمج بها كل مفتاح فوق أحدث نسخة (RB.settingsWith)
    saveSettings(settings, keys) {
      const k = RB.settingsKeys(this.bad.keeps('config/settings'), keys);
      const base = this.seenSettings === undefined ? {} : { base: clone(this.seenSettings) };
      return this.save(Object.assign({ section: 'settings', id: 'settings', rec: clone(settings) }, k ? { keys: k } : {}, base));
    }
    // كتابة مستند كما يصفه keep ({section, id, rec}؛ rec = null للحذف): الحفظ العادي وإعادة المحاولة بالطريقة نفسها
    save(keep, onErr) {
      const { section, id, rec } = keep;
      if (section === 'settings') {
        // المفاتيح التي غيّرها الحفظ فقط تُكتب فوق أحدث نسخة مشتركة: نسخة هذا الجهاز قد تكون أقدم (تحديثات تصل متأخرة،
        // أو نموذج فُتح قبل تعديل الشريك) فلا تمحو ما حفظه الشريك في غيرها. القراءة والكتابة متتاليتان في سلسلة المستند
        const ref = this.db.doc('config/settings');
        const fn = keep.keys
          ? async () => {
              const d = await ref.get();
              return ref.set(RB.settingsWith(d.exists ? d.data() : null, rec, d.exists ? keep.keys : null, keep.base));
            }
          : () => ref.set(rec);
        return this.write('config/settings', fn, section, keep, onErr);
      }
      const fn = rec ? () => this.db.collection(section).doc(id).set(rec) : () => this.db.collection(section).doc(id).delete();
      return this.write(section + '/' + id, fn, section, keep, onErr);
    }
    // علامة config/replace: تُكتب عند البدء وتتجدد كل 30 ثانية ما دامت العملية جارية (فيعرف الجهاز الآخر
    // أنها جارية لا متوقفة)، وتصير failed إن توقفت، وتُحذف عند الاكتمال. كتاباتها متتالية لا تتداخل
    mark(status) {
      return this.chain('config/replace', () => this.db.doc('config/replace').set({ status, at: new Date().toISOString(), by: SID }));
    }
    // عقد قصير على config/replacelock (مستند لا يُحذف): جهاز واحد فقط يستبدل الدفتر في الوقت نفسه، ولو بدأ جهازان معاً
    // قبل أن يرى أحدهما علامة الآخر. يرجع false إن كان العقد مع جهاز آخر (تجديده من هذه الصفحة يرجع true).
    // منصة بلا acquire: بلا عقد (تكفي العلامة)
    async lease(ms) {
      const ref = this.db.doc('config/replacelock');
      if (typeof ref.acquire !== 'function') return true;
      const r = await this.retry(() => ref.acquire({ holder: SID, ttlMs: ms || LEASE_MS }));
      return !!(r && r.acquired);
    }
    // استبدال الدفتر المشترك كله: العلامة أثناء العملية، ثم كتابة كل السجلات، ثم حذف القديمة،
    // ثم الإعدادات أخيراً. أي فشل يوقف الباقي، والإعادة آمنة (تكتب نفس الشيء). يرجع {ok, failed, dels, code, before}:
    // failed سجلات الدفتر المطلوب التي لم تُكتب بعد، وdels السجلات القديمة التي لم تُحذف بعد (والإعدادات آخراً)
    // before: المستندات التي كانت موجودة حين بدأت العملية أول مرة وما كتبته العملية. عند إكمال عملية فشلت
    // يُمرَّر prev = before، فلا يُحذف إلا منها: ما أضافه الشريك بعد الفشل يبقى
    // busy (untouched: لم يُكتب شيء): جهاز آخر يستبدل الدفتر الآن (علامته جارية أو العقد معه)، أو فقدت هذه الصفحة
    // العقد أثناء الكتابة (تأخر تجديده حتى أخذه جهاز آخر) فتتوقف ولا تكتب علامة فوق علامته.
    // written (ومعه prev عند الإكمال): ما كتبته المحاولات السابقة (المسار ← نصه)، يرجع في نتيجة الفشل؛ السجل الذي كُتب ولم
    // يتغيّر بعدها في هذه الصفحة لا يُكتب ثانية (RB.replacePlan)، فلا يُمحى ما عدّله الشريك فيه بعد الفشل.
    // عند النجاح: extra السجلات التي في الدفتر المشترك وليست في الدفتر المطلوب، وmissing عكسها — أضافها جهاز آخر أو حذفها
    // أثناء العملية (أو بعد فشلها)، فيُنبَّه لها بدل «تم» وحدها
    async replaceAll(state, progress, prev, written) {
      const bad = RB.badIds(state);
      if (bad.length) return { ok: false, failed: countRecs(state), code: 'invalid_id', badIds: bad, before: prev, written };
      const run = { done: 0, failed: false, code: null, written: new Map(written || []) };
      let renew = null;
      try {
        return await this.replaceRun(state, progress, prev, run, (t) => (renew = t));
      } finally {
        // لا فعل لتحرير العقد: يُجدَّد بأقصر مدة (ثانية) فلا ينتظر جهاز آخر انتهاء مدته بعد انتهاء العملية
        if (renew) {
          clearInterval(renew);
          this.lease(1000).catch(() => {});
        }
      }
    }
    async replaceRun(state, progress, prev, run, onRenew) {
      let marked = false;
      const fail = (e) => {
        if (marked) this.mark('failed').catch(() => {});
        return { ok: false, failed: countRecs(state), code: (e && e.code) || (e instanceof TypeError ? 'invalid_id' : 'error'), before: prev, written: run.written };
      };
      let plan;
      try {
        const m = await this.retry(() => this.db.doc('config/replace').get());
        const live = m.exists && RB.replaceMarkerState(clone(m.data() || {}), Date.now(), SID) === 'running';
        if (live || !(await this.lease())) return { ok: false, code: 'busy', untouched: true, failed: 0, before: prev, written: run.written };
        onRenew(
          setInterval(() => {
            this.lease().then(
              (ok) => {
                if (!ok && !run.failed) {
                  run.failed = true;
                  run.code = 'busy';
                }
              },
              () => {}
            );
          }, LEASE_MS / 3)
        );
        await this.mark('running');
        marked = true;
        // السجلات القديمة لكل المجموعات تُقرأ معاً
        const snaps = await Promise.all(RB.SECTIONS.map((k) => this.retry(() => this.db.collection(k).get())));
        const existing = {};
        RB.SECTIONS.forEach((k, i) => (existing[k] = snaps[i].docs.map((d) => d.id)));
        plan = RB.replacePlan(state, existing, prev, run.written);
      } catch (e) {
        return fail(e);
      }
      const before = plan.known;
      const sets = plan.sets.map(([k, r]) => {
        const body = clone(r);
        const json = JSON.stringify(r);
        return [k + '/' + r.id, () => this.db.collection(k).doc(r.id).set(body).then(() => run.written.set(k + '/' + r.id, json))];
      });
      const dels = plan.dels.map(([k, id]) => [k + '/' + id, () => this.db.collection(k).doc(id).delete()]);
      const st = clone(state.settings);
      const total = sets.length + dels.length + 1;
      let beat = Date.now();
      if (progress) progress(0, total);
      const phase = async (jobs) => {
        const worker = async () => {
          while (jobs.length && !run.failed) {
            const [path, fn] = jobs.shift();
            try {
              await this.chain(path, fn);
              run.done++;
              if (progress) progress(run.done);
              if (Date.now() - beat > 30000) {
                beat = Date.now();
                this.mark('running').catch(() => {});
              }
            } catch (e) {
              run.failed = true;
              run.code = (e && e.code) || (e instanceof TypeError ? 'invalid_id' : 'error');
            }
          }
        };
        await Promise.all([worker(), worker(), worker()]);
      };
      const nSets = sets.length;
      const nDels = dels.length;
      await phase(sets);
      const setsDone = run.done;
      if (!run.failed) await phase(dels);
      const delsDone = run.done - setsDone;
      if (!run.failed) await phase([['config/settings', () => this.db.doc('config/settings').set(st)]]);
      if (run.failed) {
        // العقد مع جهاز آخر الآن: علامته الجارية تبقى
        if (run.code !== 'busy') this.mark('failed').catch(() => {});
        return { ok: false, failed: nSets - setsDone, dels: nDels - delsDone, code: run.code, before, written: run.written };
      }
      // الدفتر المشترك الآن مقابل الدفتر المطلوب، قبل أن تزول العلامة: سجل حفظه جهاز آخر قبل أن تصله العلامة (أو بعد فشل
      // سابق) يبقى أو يُحذف بلا علم من بدأ العملية، فيُذكر له. تعذّرت القراءة: لا تنبيه
      let extra = 0;
      let missing = 0;
      try {
        const now = await Promise.all(RB.SECTIONS.map((k) => this.retry(() => this.db.collection(k).get())));
        RB.SECTIONS.forEach((k, i) => {
          const want = new Set((Array.isArray(state[k]) ? state[k] : []).map((r) => String(r.id)));
          const have = new Set(now[i].docs.map((d) => String(d.id)));
          for (const id of have) if (!want.has(id)) extra++;
          for (const id of want) if (!have.has(id)) missing++;
        });
      } catch (e) {
        /* بلا مقارنة */
      }
      try {
        // العلامة تُحذف إن كانت لهذه الصفحة فقط: لا يزول تنبيه عملية بدأها جهاز آخر بعدها
        await this.chain('config/replace', async () => {
          const ref = this.db.doc('config/replace');
          const d = await ref.get();
          if (d.exists && RB.isObj(d.data()) && d.data().by !== SID) return;
          await ref.delete();
        });
      } catch (e) {
        /* تبقى العلامة فيظهر تنبيه في الزيارة القادمة */
      }
      // الدفتر كله حُفظ كما في الشاشة: لا يبقى تعديل سابق فشل حفظه
      this.bad.clear();
      APP.savedAt = Date.now();
      return { ok: true, failed: 0, extra, missing };
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
  function persistSettings(keys) {
    if (APP.demo) return demoNote();
    APP.backend.saveSettings(S.settings, keys);
  }
  function demoNote() {
    if (APP.warnedDemo) return;
    APP.warnedDemo = true;
    toast('أنت في وضع التجربة: التعديلات تظهر الآن لكنها لا تُحفظ.');
  }
  // عرض فقط: لا يتغير شيء في الدفتر (وضع التجربة مستثنى لأنه لا يُحفظ)
  const RO_MSG = 'عرض فقط — ليست لديك صلاحية تعديل دفتر المطعم';
  // توقف الوصول (revoked): لا يُدّعى أن السبب الصلاحية (قد يكون المشاركة أو الإتاحة)
  const LOST_MSG = 'توقف الوصول إلى البيانات المشتركة فلا يمكن التعديل الآن — صدّر نسخة احتياطية ثم أعد تحميل الصفحة';
  const roMsg = () => (APP.revoked ? LOST_MSG : RO_MSG);
  // استيراد أو مسح للدفتر المشترك يجري من هذه الصفحة
  const OWN_BUSY_MSG = 'يجري الاستيراد أو المسح من هذه الصفحة — انتظر حتى ينتهي ثم احفظ.';
  // لا تعديل الآن (يُنبَّه ويرجع true): عرض فقط أو توقف الوصول، أو استيراد أو مسح للدفتر المشترك يجري الآن من هذه
  // الصفحة أو من جهاز آخر — العملية تكتب الدفتر كله وتحذف ما ليس فيه، فتعديل يُحفظ أثناءها يبقى في دفتر ممسوح أو يُضاف
  // إلى النسخة المستوردة أو يُستبدل بها. وضع التجربة مستثنى لأنه لا يُحفظ. ما يُرفض أثناء حفظ نموذج يُعلَّم في سجله
  // (saveLog.refused) فيبقى النموذج مفتوحاً بما فيه
  function roBlock() {
    if (APP.demo) return false;
    const msg = APP.readOnly ? roMsg() : APP.replacing ? OWN_BUSY_MSG : otherReplacing() ? BUSY_MSG : '';
    if (!msg) return false;
    if (saveLog) saveLog.refused = true;
    toast(msg, 'bad');
    return true;
  }
  // بدء دفتر أو استيراده أو مسحه والبيانات المشتركة غير متاحة: يُكتب في هذا المتصفح وحده فلا يراه الشريك، ولا تعرضه
  // الزيارات التي تتاح فيها البيانات المشتركة
  const NO_SHARED_MSG = 'البيانات المشتركة غير متاحة في هذه الزيارة، فلا يُبدأ دفتر ولا يُستورد ولا يُمسح هنا: لن يراه شريكك. أعد تحميل الصفحة، أو افتحها من Claude وأنت مسجّل الدخول.';
  function noSharedBlock() {
    if (!APP.noShared) return false;
    toast(NO_SHARED_MSG, 'bad');
    return true;
  }

  function bump() {
    VER++;
    costCache = null;
  }
  // السجل بمعرّفه في قسم (الإعدادات ليست قائمة سجلات: لا شيء)
  const find = (section, id) => (Array.isArray(S[section]) ? S[section].find((x) => String(x.id) === String(id)) : undefined);
  // تعديل سجل محفوظ يُفتح نموذجه الآن (ACT.edit): القسم والسجل كما كان حين فُتح، يأخذه formModal ليُعرف عند الحفظ أعدّله
  // الشريك أو نافذة أخرى بعدها أم حذفه
  let EDIT_OF = null;
  // بعد حفظ النموذج التالي وزوال الزر الذي فتحه (تجديد من تنبيهه): دالة تعطي ما يُركَّز عليه قبل المحتوى الرئيسي
  let REFOCUS = null;
  // ما حفظه النموذج المفتوح (أول سجل: فاتورة المشتريات قبل أسعار موادها): ليُعرف بعد الحفظ أظاهر هو في الصفحة أم لا
  let saveLog = null;
  function upsert(section, rec) {
    if (roBlock()) return false;
    // العلامة تُحسب من جديد: السجل المصحح يخرج من «سجلات تحتاج إلى تصحيح»
    delete rec._bad;
    // المصروف المحفوظ بالتصنيفات الحالية: لا يُعاد تصنيفه عند التحميل (RB.migrateExpense للسجلات الأقدم فقط)
    if (section === 'expenses' && RB.isObj(rec)) rec.catV = RB.EXPENSE_CAT_V;
    rec = RB.sanitizeRecord(section, rec) || rec;
    // حقل معيب ليس في النموذج (بيانات منقولة): حُفظ لكنه باقٍ في «سجلات تحتاج إلى تصحيح»
    if (rec._bad) toast('حُفظ، لكن السجل ما زال يحتاج إلى تصحيح: ' + badWhy(section, rec), 'bad');
    const arr = S[section];
    const i = arr.findIndex((x) => String(x.id) === String(rec.id));
    if (i >= 0) arr[i] = rec;
    else arr.push(rec);
    if (saveLog && !saveLog.length) saveLog.push({ section, rec });
    bump();
    persistPut(section, rec);
  }
  function remove(section, id) {
    if (roBlock()) return false;
    S[section] = S[section].filter((x) => String(x.id) !== String(id));
    bump();
    persistDel(section, id);
  }
  // keys: مفاتيح الإعدادات التي غيّرها هذا الحفظ (opening، channels…): تُكتب وحدها فوق أحدث نسخة محفوظة، فلا تمحو نسخةُ
  // هذه الصفحة (قد تكون أقدم) ما حفظه الشريك أو نافذة أخرى في غيرها. بلا keys تُحفظ الإعدادات كلها
  function saveSettings(keys) {
    bump();
    if (roBlock()) return false;
    persistSettings(keys);
  }

  // ═════════════ أدوات الواجهة ═════════════
  // act: زر في الرسالة {label, run} (مثل «اعرضه» أو «تراجع»): تبقى أطول، ولا تختفي ما دام المؤشر أو التركيز عليها.
  // الرسالة نفسها مكررة (الضغط على «حفظ» مرات بنموذج ناقص): تتجدد مدتها ولا تتكدس فوق النافذة
  function toast(msg, kind, act) {
    const el = document.getElementById('toast');
    if (!el) return;
    const k = 'toast ' + (kind || '');
    const last = el.lastElementChild;
    if (!act && last && last.className === k && last.textContent === msg && last._arm) {
      last._arm(4200);
      return last;
    }
    const t = document.createElement('div');
    t.className = k;
    t.textContent = msg;
    let timer = null;
    t._arm = (ms) => {
      clearTimeout(timer);
      t.classList.remove('out');
      timer = setTimeout(() => {
        t.classList.add('out');
        timer = setTimeout(() => t.remove(), 500);
      }, ms);
    };
    if (act) {
      t.classList.add('has-act');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-a';
      b.textContent = act.label;
      b.addEventListener('click', () => {
        t.remove();
        act.run();
        // زر الرسالة زال ومعه التركيز: إن لم ينقله run إلى ما يخصه فإلى المحتوى الرئيسي، لا إلى أول الصفحة
        const a = document.activeElement;
        const main = document.getElementById('main');
        if ((!a || a === document.body) && main && !document.getElementById('modals').children.length) main.focus({ preventScroll: true });
      });
      t.append(' ', b);
      t.addEventListener('mouseenter', () => clearTimeout(timer));
      t.addEventListener('focusin', () => clearTimeout(timer));
      t.addEventListener('mouseleave', () => t.contains(document.activeElement) || t._arm(3000));
      t.addEventListener('focusout', (e) => t.contains(e.relatedTarget) || t._arm(3000));
    }
    el.appendChild(t);
    placeToasts();
    t._arm(act ? 9000 : 4200);
    return t;
  }

  // موضع الرسائل والنافذة مفتوحة: النافذة القصيرة في وسط الشاشة فأزرار أسفلها (حفظ/إلغاء) في أي ارتفاع، فلا يكفي رفع
  // الرسائل مسافة ثابتة. تبقى في مكانها أسفل الشاشة إن اتسع لها ما تحت النافذة، وإلا فهي فوق أزرارها مباشرة (على أسفل
  // محتواها). تُقاس مع كل رسالة، وعند فتح النافذة وإغلاقها، وتغيّر حجمها أو حجم الشاشة (bindGlobal)
  function placeToasts() {
    const el = document.getElementById('toast');
    const root = document.getElementById('modals');
    if (!el || !root) return;
    el.style.bottom = '';
    const top = root.lastElementChild;
    const dlg = top && top.querySelector('.dialog');
    const foot = dlg && dlg.querySelector('.dlg-f');
    if (!foot || !el.children.length) return;
    const tr = el.getBoundingClientRect();
    if (tr.top >= dlg.getBoundingClientRect().bottom + 8) return;
    // أسفل الشاشة = أسفل الرسائل + بُعدها عنه في CSS
    const ft = foot.getBoundingClientRect().top;
    el.style.bottom = Math.max(0, Math.round(tr.bottom + (parseFloat(getComputedStyle(el).bottom) || 0) - ft + 8)) + 'px';
    // محتوى يتمرر (النافذة بأقصى ارتفاعها): مسافة في آخره بقدر ما تغطيه الرسائل، فيصل آخر حقل إلى ما فوقها. تبقى حتى
    // تُغلق النافذة (إزالتها مع الرسالة كانت ستُنزل المحتوى الممرَّر إلى آخره)، ولا تغيّر ارتفاع النافذة
    const body = dlg.querySelector('.dlg-b');
    if (body && body.scrollHeight > body.clientHeight + 1) {
      if (body._pad0 === undefined) body._pad0 = parseFloat(getComputedStyle(body).paddingBottom) || 0;
      const need = Math.ceil(ft - el.getBoundingClientRect().top);
      if (need > (body._padX || 0)) {
        body._padX = need;
        body.style.paddingBottom = body._pad0 + need + 'px';
      }
    }
    toastUncover();
  }
  // الرسائل فوق أسفل محتوى النافذة: الحقل الذي عليه التركيز (حقل ناقص بعد «حفظ»، أو بالتنقل بـ Tab أو النقر) لا يبقى
  // تحتها: يُمرَّر المحتوى حتى يظهر فوقها (دون أن يخرج أعلاه)، وإن لم يتمرر (نافذة قصيرة) ترتفع الرسائل فوقه
  function toastUncover() {
    const el = document.getElementById('toast');
    const a = document.activeElement;
    if (!el || !el.style.bottom || !el.children.length || !a || !a.closest) return;
    const body = a.closest('.dlg-b');
    const root = document.getElementById('modals');
    if (!body || !root.lastElementChild || !root.lastElementChild.contains(body)) return;
    const er = el.getBoundingClientRect();
    let r = a.getBoundingClientRect();
    if (!r.height || r.bottom <= er.top - 4) return;
    const by = Math.min(r.bottom - er.top + 8, r.top - body.getBoundingClientRect().top - 8);
    if (by > 0) {
      body.scrollTop += by;
      r = a.getBoundingClientRect();
      if (r.bottom <= er.top - 4) return;
    }
    if (r.top - 8 - er.height >= 0) el.style.bottom = Math.round(er.bottom + parseFloat(el.style.bottom) - r.top + 8) + 'px';
  }

  // النافذة: الخلفية (الصفحة والنوافذ تحتها) معطّلة (inert) فلا يصلها Tab ولا النقر، وعند الإغلاق يعود التركيز
  // إلى الزر الذي فتحها (أو مثيله بعد إعادة رسم الصفحة، أو المحتوى الرئيسي).
  // o.beforeClose: يُسأل قبل الإغلاق بـ Escape أو ✕ أو «إلغاء» (يرجع false أو وعداً بـ false فيبقى مفتوحاً)؛
  // close() المرجَعة تغلق بلا سؤال (بعد الحفظ مثلاً)
  let DLG = 0;
  const TRIGGER_ATTRS = ['act', 's', 'id', 'x'];
  function openModal(o) {
    const root = document.getElementById('modals');
    const prevFocus = document.activeElement;
    // محدد الزر الذي فتح النافذة: يُبحث به عنه إن أُعيد رسم الصفحة بعد الحفظ
    const trigSel =
      prevFocus && prevFocus.dataset && prevFocus.dataset.act
        ? TRIGGER_ATTRS.filter((k) => prevFocus.dataset[k] !== undefined)
            .map((k) => `[data-${k}="${CSS.escape(prevFocus.dataset[k])}"]`)
            .join('')
        : '';
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    const tid = 'dlg-t-' + ++DLG;
    wrap.innerHTML = `<div class="dialog ${o.wide ? 'wide' : ''}${o.wide === 'x' ? ' xwide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${tid}"><header class="dlg-h"><h2 id="${tid}">${esc(o.title)}</h2><button type="button" class="icon-btn" data-close aria-label="إغلاق">✕</button></header><div class="dlg-b"></div><footer class="dlg-f"></footer></div>`;
    for (const w of root.children) w.inert = true;
    const shell = document.querySelector('.shell');
    if (shell) shell.inert = true;
    root.appendChild(wrap);
    let closed = false;
    let asking = false;
    const onKey = (e) => {
      if (e.key === 'Escape' && root.lastElementChild === wrap) requestClose();
    };
    function close() {
      if (closed) return;
      closed = true;
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      const top = root.lastElementChild;
      if (top) top.inert = false;
      else if (shell) shell.inert = false;
      if (o.onClose) o.onClose();
      // بعد إعادة الرسم التي تتبع الحفظ: الزر نفسه إن بقي، أو مثيله في الصفحة الجديدة، أو المحتوى الرئيسي
      setTimeout(() => {
        if (top) {
          // عودة إلى النافذة التي تحتها (إن لم تُغلق هي أيضاً، فإغلاقها يعيد التركيز)
          if (!top.isConnected) return;
          if (prevFocus && prevFocus.isConnected && top.contains(prevFocus)) prevFocus.focus();
          else if (!top.contains(document.activeElement)) (top.querySelector('[data-save],[data-ok],[data-close]') || top).focus();
          return;
        }
        if (root.lastElementChild) return;
        const a = document.activeElement;
        if (a && a !== document.body && a.isConnected) return;
        let el = prevFocus && prevFocus !== document.body && prevFocus.isConnected && !root.contains(prevFocus) ? prevFocus : null;
        if (!el && trigSel) el = [...document.querySelectorAll(trigSel)].find((x) => !root.contains(x) && x.getClientRects().length);
        if (!el && o.refocus) el = o.refocus();
        if (!el) el = document.getElementById('main');
        if (el && el.focus) el.focus({ preventScroll: el.id === 'main' });
      }, 0);
    }
    async function requestClose() {
      if (closed || asking) return;
      if (o.beforeClose) {
        asking = true;
        let ok = false;
        try {
          ok = await o.beforeClose();
        } finally {
          asking = false;
        }
        if (!ok) return;
      }
      close();
    }
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) requestClose();
    });
    return { el: wrap, body: wrap.querySelector('.dlg-b'), foot: wrap.querySelector('.dlg-f'), close };
  }

  // opt.danger: التأكيد لعملية لا تُسترجع (حذف، تجاهل)؛ التركيز يبدأ عند «إلغاء» فلا يحذف Enter المتكرر شيئاً
  function confirmBox(msg, opt) {
    opt = opt || {};
    return new Promise((resolve) => {
      let done = false;
      const m = openModal({ title: opt.title || 'تأكيد', onClose: () => !done && resolve(false) });
      m.body.innerHTML = `<p class="confirm-msg">${msg}</p>`;
      m.foot.innerHTML = `<button type="button" class="btn ${opt.danger ? 'danger' : 'primary'}" data-ok>${esc(opt.ok || 'نعم')}</button><button type="button" class="btn ghost" data-close>${esc(opt.cancel || 'إلغاء')}</button>`;
      m.foot.querySelector('[data-ok]').addEventListener('click', () => {
        done = true;
        resolve(true);
        m.close();
      });
      (opt.danger ? m.foot.querySelector('[data-close]') : m.foot.querySelector('[data-ok]')).focus();
    });
  }

  // التركيز داخل النافذة على محتواها (منطقة تتمرر): يُعلَن عنوانها لقارئ الشاشة، وتمرّرها الأسهم وPageDown،
  // ولا يُغلقها Enter مستمر من زر ⓘ (كان التركيز يسقط إلى الصفحة الخاملة خلفها)
  function infoBox(title, html, wide) {
    const m = openModal({ title, wide });
    m.body.innerHTML = html;
    m.foot.innerHTML = `<button type="button" class="btn ghost" data-close>إغلاق</button>`;
    afterRender(m.body);
    m.body.tabIndex = -1;
    m.body.focus({ preventScroll: true });
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
  // حقل التاريخ أو الشهر: فارغ أو قيمة صحيحة. المتصفح لا يعرض القيمة غير الصالحة (سجل منقول أو معيب) فيبدو
  // الحقل فارغاً وهي باقية، فتُرفض عند الحفظ ويُذكر ما خُزّن
  const isDateField = (f) => f.type === 'date' || f.type === 'month';
  const dateOK = (f, v) => v === '' || v === undefined || v === null || (f.type === 'month' ? RB.isISOMonth(v) : RB.isISODate(v));
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
    if (f.type === 'section') return `<h3 class="fsec">${esc(f.label)}</h3>`;
    if (f.type === 'lines') return linesHTML(f, val);
    // get: القيمة المعروضة حين تُشتق من حقول أخرى ما لم يحددها المستخدم
    const v = f.get ? f.get(val) : getPath(val, f.k);
    const id = 'f' + ++FID;
    const rd = f.redraw ? 'data-redraw="1"' : '';
    const badDate = isDateField(f) && !dateOK(f, v);
    // التوضيح وملاحظة القيمة غير الصالحة مربوطان بالحقل فيقرؤهما قارئ الشاشة معه
    const desc = [badDate ? id + 'n' : '', f.help ? id + 'h' : ''].filter(Boolean).join(' ');
    const ax = `${desc ? `aria-describedby="${desc}"` : ''} ${badDate ? 'aria-invalid="true"' : ''} ${f.req ? 'required' : ''}`;
    const help = f.help ? `<small id="${id}h">${f.help}</small>` : '';
    const lab = `<label for="${id}">${esc(f.label)}${f.req ? ' <b class="req" aria-hidden="true">*</b>' : ''}</label>`;
    let inp;
    switch (f.type) {
      case 'select': {
        const opts = typeof f.options === 'function' ? f.options(val) : f.options;
        inp = `<select id="${id}" data-path="${f.k}" ${ax} ${rd}>${optionsHTML(opts, v)}</select>`;
        break;
      }
      case 'check':
        return `<div class="field check ${f.cls || ''}" data-k="${f.k}" ${f.live && f.show && !f.show(val) ? 'hidden' : ''}><label class="checkl"><input id="${id}" type="checkbox" data-path="${f.k}" ${f.help ? `aria-describedby="${id}h"` : ''} ${rd} ${v ? 'checked' : ''}><span>${esc(f.label)}</span></label>${help}</div>`;
      case 'textarea':
        inp = `<textarea id="${id}" data-path="${f.k}" rows="2" ${ax}>${esc(v)}</textarea>`;
        break;
      case 'num':
      case 'money':
        // neg: يقبل السالب (مرتجع، استرداد). لوحة الأرقام العشرية في iPhone (inputmode=decimal) بلا علامة «−»، فيُترك
        // للمتصفح لوحة الأرقام والرموز
        inp = `<input id="${id}" type="number" ${f.neg ? '' : 'inputmode="decimal"'} step="${f.step || 'any'}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} data-type="num" data-path="${f.k}" value="${v === undefined || v === null ? '' : esc(v)}" ${ax} ${rd}>`;
        break;
      default:
        inp = `<input id="${id}" type="${f.type || 'text'}" data-path="${f.k}" value="${esc(v)}" ${f.list ? `list="${id}l"` : ''} ${ax} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} ${rd}>${f.list ? `<datalist id="${id}l">${f.list(val).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}`;
    }
    const note = badDate ? `<small class="bad-note" id="${id}n">القيمة المحفوظة «${ltr(esc(v))}» غير صالحة — اختر ${f.type === 'month' ? 'الشهر' : 'التاريخ'} الصحيح.</small>` : '';
    return `<div class="field ${f.cls || ''}${badDate ? ' invalid' : ''}" data-k="${f.k}">${lab}${inp}${note}${help}</div>`;
  }
  function linesHTML(f, val) {
    const rows = getPath(val, f.k) || [];
    // عنوان الجدول يسمّيه لقارئ الشاشة (aria-labelledby)، والتوضيح يصفه
    const cid = 'l' + ++FID;
    const head = f.cols.map((c) => `<th class="${c.num ? 'num' : ''} ${c.cls || ''}" ${c.w ? `style="width:${c.w}"` : ''}>${esc(c.label)}</th>`).join('');
    const body = rows
      .map((r, i) => {
        // rowName: اسم السطر (الموظف مثلاً) يدخل في اسم كل خانة: «الأساسي — سليم» بدل «الأساسي 1»
        const rn = f.rowName ? String(f.rowName(r, val) || '').trim() : '';
        const cells = f.cols
          .map((c) => {
            const p = `${f.k}.${i}.${c.k}`;
            const rd = c.redraw ? 'data-redraw="1"' : '';
            const aria = `aria-label="${esc(rn ? c.label + ' — ' + rn : c.label + ' ' + (i + 1))}"`;
            let h;
            if (c.calc) h = `<span class="calc n" data-calc="${f.k}|${i}|${c.k}">${c.calc(r, val)}</span>`;
            else if (c.type === 'select') h = `<select data-path="${p}" ${rd} ${aria}>${optionsHTML(c.options(r, val), r[c.k])}</select>`;
            else if (c.type === 'num') h = `<input type="number" ${c.neg ? '' : 'inputmode="decimal"'} step="any" ${c.min !== undefined ? `min="${c.min}"` : ''} ${c.max !== undefined ? `max="${c.max}"` : ''} data-type="num" data-path="${p}" value="${r[c.k] === undefined || r[c.k] === null ? '' : esc(r[c.k])}" ${aria}>`;
            else if (c.type === 'static') h = `<span>${esc(c.text ? c.text(r, val) : r[c.k])}</span>`;
            else h = `<input type="text" data-path="${p}" value="${esc(r[c.k])}" ${aria}>`;
            // extra: عناصر إضافية في الخلية تُرسم مع النموذج؛ hint: سطر توضيح يتحدث مع كل إدخال
            if (c.extra) h += c.extra(r, i, val);
            if (c.hint) h += `<small class="lhint" data-hint="${f.k}|${i}|${c.k}">${c.hint(r, val)}</small>`;
            // قائمة الاسم (المادة، المكوّن، الصنف) بعرض عمودها المعلن: على الجوال يصير حدها الأدنى (style.css) فيُقرأ الاسم
            const ws = c.type === 'select' && c.w;
            return `<td class="${c.num ? 'num' : ''} ${c.cls || ''}${ws ? ' wsel' : ''}"${ws ? ` style="--w:${c.w}"` : ''}>${h}</td>`;
          })
          .join('');
        return `<tr>${cells}<td class="act"><button type="button" class="icon-btn" data-lact="del" data-lk="${f.k}" data-i="${i}" aria-label="${esc('حذف السطر ' + (i + 1) + (rn ? ' — ' + rn : ''))}">✕</button></td></tr>`;
      })
      .join('');
    return `<div class="field lines ${f.cls || ''}"><div class="lines-h"><span class="lines-cap" id="${cid}">${esc(f.label)}</span>${(f.tools || []).map((t) => `<button type="button" class="btn ghost sm" data-ltool="${t.id}" data-lk="${f.k}">${esc(t.label)}</button>`).join('')}</div>
      <div class="tbl-wrap"><table class="lines-tbl" aria-labelledby="${cid}" ${f.help ? `aria-describedby="${cid}h"` : ''}><thead><tr>${head}<th></th></tr></thead><tbody>${body || `<tr><td colspan="${f.cols.length + 1}" class="empty">${esc(f.empty || 'لا توجد أسطر بعد')}</td></tr>`}</tbody></table></div>
      ${f.foot ? `<div class="lines-foot" data-lfoot="${f.k}">${f.foot(val)}</div>` : ''}
      <button type="button" class="btn ghost sm add-line" data-lact="add" data-lk="${f.k}">+ ${esc(f.addLabel || 'إضافة سطر')}</button>${f.help ? `<small id="${cid}h">${f.help}</small>` : ''}</div>`;
  }
  function flatFields(fields) {
    const out = [];
    for (const f of fields) {
      if (f.type === 'row') out.push(...flatFields(f.fields));
      else out.push(f);
    }
    return out;
  }
  const pathSel = (p) => `[data-path="${CSS.escape(p)}"]`;
  // بعد إلغاء سؤال الحفظ: التركيز إلى حقل في النافذة العليا (النموذج) بعد أن تعيده نافذة التأكيد المغلقة إلى زر الحفظ
  function focusLater(path) {
    setTimeout(() => {
      const top = document.getElementById('modals').lastElementChild;
      const el = top && top.querySelector(pathSel(path));
      if (el) el.focus();
    }, 0);
  }
  // القائمة ومربع الاختيار تتغير قيمتهما دفعة واحدة (change)، والحقل النصي أو التاريخ مع كل حرف (input)
  const discrete = (el) => el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio';

  // الحقل الذي يُكتب فيه يبقى في الصفحة عند إعادة الرسم (لا يُنزع ثم يُعاد): يُستبدل ما حوله فقط، فلا تنقطع
  // الكتابة ولا إدخال التاريخ بمقاطعه (اليوم ثم الشهر…) ولا يفقد التركيز. يرجع false إن اختلف موضعه أو قيمته
  // في الرسم الجديد (فيُرسم النموذج كله ويُعاد التركيز إلى الحقل الجديد)
  function syncAttrs(a, n, skip) {
    for (const at of [...a.attributes]) if (!n.hasAttribute(at.name) && at.name !== skip) a.removeAttribute(at.name);
    for (const at of [...n.attributes]) if (at.name !== skip && a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
  }
  function graftDraw(body, box, a, n) {
    // الرقم أثناء كتابته («33.» = 33) قيمته كقيمة الرسم الجديد
    if (!n || a.tagName !== n.tagName || a.type !== n.type) return false;
    if (a.value !== n.value && !(a.dataset.type === 'num' && n.value !== '' && readInput(a) === readInput(n))) return false;
    const oc = [];
    for (let x = a; x && x !== body; x = x.parentNode) oc.push(x);
    const nc = [];
    for (let x = n; x && x !== box; x = x.parentNode) nc.push(x);
    if (oc.length !== nc.length || oc.some((x, i) => x.tagName !== nc[i].tagName)) return false;
    // من الأعلى إلى الحقل: كل مستوى يأخذ عناصر الرسم الجديد، وفرع الحقل نفسه يبقى في مكانه
    for (let i = oc.length; i > 0; i--) {
      const op = i === oc.length ? body : oc[i];
      const np = i === nc.length ? box : nc[i];
      const keep = oc[i - 1];
      const nk = nc[i - 1];
      if (op !== body) syncAttrs(op, np);
      for (const c of [...op.childNodes]) if (c !== keep) c.remove();
      let before = true;
      for (const c of [...np.childNodes]) {
        if (c === nk) before = false;
        else if (before) op.insertBefore(c, keep);
        else op.appendChild(c);
      }
    }
    // قيمة الحقل الحية تبقى كما هي (لا تُلمس سمة value أثناء الكتابة)
    syncAttrs(a, n, 'value');
    return true;
  }

  // النماذج المفتوحة: معاينتها وحساباتها وتلميحاتها تتحدث حين تتغير البيانات من الخارج (الشريك أو نافذة أخرى)، كتنبيه
  // «يوجد إقفال مسجل لهذا اليوم» حين يحفظ الشريك إقفال اليوم نفسه. الحقول نفسها لا تُلمس
  const OPEN_FORMS = new Set();
  // أسماء حقول السجل التي لا حقل واحد لها في النموذج (لرسالة التعديل المتزامن): مبالغ القنوات في الإقفال جدول مرسوم
  const KEY_NAME = { channels: 'مبالغ القنوات' };
  // o.onChange(path, val) يرجع 'redraw' إذا غيّر حقولاً أخرى فيُعاد رسم النموذج فوراً لتظهر قيمها الجديدة
  // (حتى أثناء كتابة التاريخ: الحقل نفسه لا يُمس). o.onLeave(path, val): عند مغادرة الحقل (انتهاء تعديله)،
  // ويرجع 'redraw' إن غيّر شيئاً. o.focus: محدد CSS للحقل الذي يبدأ عنده التركيز
  function formModal(o) {
    const val = clone(o.value || {});
    // نموذج تعديل سجل محفوظ (من ✎): السجل كما كان حين فُتح (لا نموذجاً آخر فتحه هذا النموذج بدلاً منه)
    const editOf = EDIT_OF && RB.isObj(o.value) && String(o.value.id) === String(EDIT_OF.rec.id) ? EDIT_OF : null;
    EDIT_OF = null;
    const refocus = REFOCUS;
    REFOCUS = null;
    // فُتح في البيانات التجريبية أم في دفتر المطعم: قيمه (موظفون وأصناف ومبالغ) من ذلك الدفتر وحده
    const demoAt = APP.demo;
    // تغيّرت بيانات النموذج عما فُتح به (لقطة بعد أول رسم)، فالإغلاق بلا حفظ يُسأل عنه أولاً. ما عُدّل ثم أُعيد
    // كما كان لا يُسأل عنه
    let snap = null;
    const dirty = () => snap !== null && JSON.stringify(val) !== snap;
    const refresh = () => !drawing && upd();
    const m = openModal({
      title: o.title,
      wide: o.wide,
      beforeClose: () => !dirty() || confirmBox('لم تُحفظ البيانات التي أدخلتها. هل تريد تجاهلها وإغلاق النموذج؟', { danger: true, ok: 'تجاهل وإغلاق' }),
      onClose: () => OPEN_FORMS.delete(refresh),
      refocus,
    });
    if (demoAt && !o.anyBooks) m.el.dataset.demoForm = '1';
    const fields = () => (typeof o.fields === 'function' ? o.fields(val) : o.fields);
    let saving = false;
    // drawing يمنع رسماً داخل رسم (حدث يطلقه حذف العنصر المركَّز أثناء innerHTML)، ويُعاد الرسم بعده مرة واحدة
    let drawing = false;
    let redo = false;
    // حقل نصي أو تاريخ بإعادة رسم (data-redraw) لم يطلب onChange رسمه: يُرسم النموذج عند مغادرته
    let pending = false;
    // أخطاء التحقق لكل مسار: تبقى تحت الحقل (وبعد إعادة الرسم) حتى يُعدَّل. errAt: قيمة الحقل حين ظهر خطؤه
    let errs = {};
    let errAt = {};
    // أخطاء رفض الحفظ (onSave) بمساراتها: لا يزيلها إعادة التحقق، بل تعديل الحقل نفسه
    let saveErrs = new Set();
    function draw(again) {
      if (drawing) {
        redo = true;
        return;
      }
      drawing = true;
      pending = false;
      try {
        // الحقل الذي يُكتب فيه يبقى كما هو، أو يعود إليه التركيز وموضع المؤشر بعد إعادة الرسم
        const a = document.activeElement;
        const ap = a && a !== m.body && m.body.contains(a) && a.dataset ? a.dataset.path : '';
        let sel = null;
        try {
          if (ap && typeof a.selectionStart === 'number') sel = [a.selectionStart, a.selectionEnd, a.selectionDirection];
        } catch (e) {
          sel = null;
        }
        const sc = m.body.scrollTop;
        const box = document.createElement('div');
        box.innerHTML = `<form class="form" novalidate>${fields().map((f) => fieldHTML(f, val)).join('')}<div class="form-preview" ${o.preview ? '' : 'hidden'}></div><button type="submit" hidden></button></form>`;
        const kept = !!ap && !discrete(a) && graftDraw(m.body, box, a, box.querySelector(pathSel(ap)));
        if (!kept) m.body.replaceChildren(...box.childNodes);
        m.body.scrollTop = sc;
        upd();
        for (const p of Object.keys(errs)) {
          // تغيّرت قيمته منذ ظهر الخطأ (عبّأها حقل آخر، كالمبلغ عند اختيار التطبيق أو الموظف): يزول خطؤه كما لو عدّله المستخدم
          if (JSON.stringify(getPath(val, p)) !== errAt[p]) {
            delete errs[p];
            continue;
          }
          const el = m.body.querySelector(pathSel(p));
          if (el) markErr(el, errs[p]);
        }
        const n = !kept && ap && m.body.querySelector(pathSel(ap));
        if (n && !discrete(a) && a.tagName === n.tagName && a.type === n.type && a.value === n.value) {
          // تغيّر موضعه في النموذج وقيمته كما هي: يعود العنصر نفسه (موضع المؤشر والتحديد) بخصائص الرسم الجديد
          syncAttrs(a, n);
          n.replaceWith(a);
          a.focus({ preventScroll: true });
        } else if (n) {
          n.focus({ preventScroll: true });
          try {
            if (n.type === 'number') n.select();
            else if (sel) n.setSelectionRange(sel[0], sel[1], sel[2] || 'none');
          } catch (e) {
            // حقل لا يقبل التحديد (تاريخ، قائمة)
          }
        }
      } finally {
        drawing = false;
      }
      if (redo) {
        redo = false;
        if (!again) draw(true);
      }
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
      // جدول أسطر أعرض من النافذة (شاشة أضيق من 1240 للمسير، والجوال): ظل على الحافة التي بقيت خلفها أعمدة
      m.body.querySelectorAll('.tbl-wrap').forEach(scrollCue);
    }
    // خطأ الحقل: aria-invalid، وإطار أحمر، ورسالة تحته مربوطة به (aria-describedby). خانة الجدول تُعلَّم وحدها
    function markErr(el, msg) {
      el.setAttribute('aria-invalid', 'true');
      const cell = el.closest('td');
      const fe = el.closest('.field');
      if (!cell && fe) fe.classList.add('invalid');
      const box = cell || fe;
      if (!msg || !box || box.querySelector('.err')) return;
      const s = document.createElement('small');
      s.className = 'err';
      s.id = (el.id || 'c' + ++FID) + 'e';
      s.textContent = msg;
      (el.closest('.checkl') || el).insertAdjacentElement('afterend', s);
      el.setAttribute('aria-describedby', [s.id, el.getAttribute('aria-describedby')].filter(Boolean).join(' '));
    }
    function clearErr(el) {
      if (el.dataset && el.dataset.path) delete errs[el.dataset.path];
      el.removeAttribute('aria-invalid');
      const cell = el.closest('td');
      const fe = el.closest('.field');
      if (!cell && fe) fe.classList.remove('invalid');
      const er = (cell || fe) && (cell || fe).querySelector('.err');
      if (!er) return;
      const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter((x) => x && x !== er.id);
      if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
      else el.removeAttribute('aria-describedby');
      er.remove();
    }
    function onField(e, isChange) {
      const el = e.target;
      const p = el.dataset && el.dataset.path;
      if (!p) return;
      const nv = readInput(el);
      setPath(val, p, nv);
      clearErr(el);
      const want = o.onChange ? o.onChange(p, val) : undefined;
      // ما غيّره onChange يظهر فوراً، حتى أثناء كتابة التاريخ بمقاطعه (الحقل نفسه يبقى في مكانه فلا تنقطع كتابته)
      if ((isChange && el.dataset.redraw) || want === 'redraw') draw();
      else upd();
      recheck();
    }
    // خطأ ظاهر زال سببه بتغيير حقل آخر (المورد لم يعد مطلوباً حين لم يعد الدفع آجلاً): يزول من تحت حقله
    function recheck() {
      const keys = Object.keys(errs).filter((k) => !saveErrs.has(k));
      if (!keys.length) return;
      const now = validate().errs;
      for (const k of keys) {
        if (now[k] !== undefined) continue;
        const el = m.body.querySelector(pathSel(k));
        if (el) clearErr(el);
        else delete errs[k];
      }
    }
    m.el.addEventListener('input', (e) => {
      if (!discrete(e.target)) onField(e, false);
    });
    m.el.addEventListener('change', (e) => {
      const el = e.target;
      if (!el.dataset || !el.dataset.path) return;
      if (discrete(el)) return onField(e, true);
      // قيمة تغيّرت بلا حدث input (نادر): تُسجَّل أولاً
      if (getPath(val, el.dataset.path) !== readInput(el)) onField(e, false);
      if (el.dataset.redraw) pending = true;
    });
    // مغادرة الحقل: o.onLeave (انتهى تعديله)، ثم إعادة الرسم المؤجلة. البقاء في الحقل نفسه (أُعيد رسمه، أو انتقل
    // التركيز إلى نافذة أخرى ثم عاد) ليس مغادرة
    m.el.addEventListener('focusout', (e) => {
      const p = !drawing && e.target.dataset && e.target.dataset.path;
      if (!pending && !(p && o.onLeave)) return;
      setTimeout(() => {
        if (p && o.onLeave) {
          const x = document.activeElement;
          if (!(x && x.dataset && x.dataset.path === p && m.body.contains(x)) && o.onLeave(p, val) === 'redraw') pending = true;
        }
        if (pending) draw();
      }, 0);
    });
    // Enter ينقل إلى الحقل التالي ولا يحفظ (آخر حقل يحفظ)، من خانة الكتابة أو من القائمة المغلقة (المفتوحة تأخذ
    // Enter لاختيارها قبل الصفحة)، وCtrl/Cmd+Enter يحفظ من أي مكان في النموذج. النص متعدد الأسطر يبقى له سطره الجديد
    m.el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
      const el = e.target;
      if (!m.body.contains(el) && !(e.ctrlKey || e.metaKey)) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        submit();
        return;
      }
      const p = el.dataset && el.dataset.path;
      if (!p || !(el.tagName === 'INPUT' || el.tagName === 'SELECT') || el.type === 'radio' || e.altKey) return;
      e.preventDefault();
      if (el.dataset.redraw && !discrete(el)) onField(e, true);
      else if (pending) draw();
      const list = [...m.body.querySelectorAll('input[data-path], select[data-path]')].filter((x) => !x.disabled && !x.readOnly && x.getClientRects().length);
      const i = list.indexOf(m.body.querySelector(pathSel(p)));
      if (i < 0) return;
      if (i === list.length - 1) return submit();
      const next = list[i + 1];
      next.focus();
      try {
        if (next.tagName === 'INPUT' && /^(text|number|search|tel|url|email)$/.test(next.type)) next.select();
      } catch (e2) {
        // لا يدعم التحديد
      }
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
      // أرقام الأسطر تغيّرت: أخطاؤها السابقة لا تخص السطر نفسه
      for (const k of Object.keys(errs)) if (k.startsWith(f.k + '.')) delete errs[k];
      draw();
      // الزر المضغوط استُبدل بإعادة الرسم، فلا يسقط التركيز إلى أول النموذج: إلى أول خانة في السطر الجديد، أو إلى ✕
      // السطر الذي حلّ محل المحذوف (أو الذي قبله، أو «+ إضافة سطر» إن فرغ الجدول)، أو إلى زر الأداة نفسه
      const q = (sel) => m.body.querySelector(sel);
      const lk = CSS.escape(f.k);
      let to = null;
      if (b.dataset.lact === 'add') to = q(`[data-path^="${CSS.escape(f.k + '.' + (rows.length - 1) + '.')}"]`);
      else if (b.dataset.lact === 'del') {
        const dels = m.body.querySelectorAll(`[data-lact="del"][data-lk="${lk}"]`);
        to = dels[Math.min(+b.dataset.i, dels.length - 1)] || q(`[data-lact="add"][data-lk="${lk}"]`);
      } else to = q(`[data-ltool="${CSS.escape(b.dataset.ltool)}"][data-lk="${lk}"]`);
      if (to) to.focus();
    });
    // التحقق: الحقول المطلوبة، والتواريخ، وحدود الأرقام (min/max، وفي أعمدة الأسطر كذلك)، وf.check(val) لشرط خاص.
    // كل خطأ يظهر تحت حقله، والرسالة تذكر الحقول الناقصة كلها
    function validate() {
      const out = {};
      const missing = [];
      const other = [];
      let first = '';
      const add = (p, inline, msg) => {
        out[p] = inline;
        if (msg) other.push(msg);
        if (!first) first = p;
      };
      for (const f of flatFields(fields())) {
        if (f.show && !f.show(val)) continue;
        if (f.type === 'lines') {
          (getPath(val, f.k) || []).forEach((row, i) => {
            for (const c of f.cols) {
              if (c.type !== 'num' || (c.min === undefined && c.max === undefined)) continue;
              const r = RB.rangeMsg(row && row[c.k], c.min, c.max);
              if (r) add(`${f.k}.${i}.${c.k}`, r, `«${c.label}» في السطر ${i + 1}: ${r}`);
            }
          });
          continue;
        }
        if (!f.k) continue;
        const v = getPath(val, f.k);
        const empty = v === '' || v === undefined || v === null || (typeof v === 'string' && !v.trim());
        let r = '';
        if (f.req && empty) {
          missing.push(f.label);
          add(f.k, 'هذا الحقل مطلوب');
        } else if (isDateField(f) && !dateOK(f, v)) add(f.k, '', (f.type === 'month' ? 'أدخل شهراً صحيحاً: ' : 'أدخل تاريخاً صحيحاً: ') + f.label);
        else if ((f.min !== undefined || f.max !== undefined) && (r = RB.rangeMsg(v, f.min, f.max))) add(f.k, r, `«${f.label}»: ${r}`);
        else if (f.check && (r = f.check(val))) add(f.k, r, `«${f.label}»: ${r}`);
      }
      const msg = [missing.length ? (missing.length > 1 ? 'أكمل الحقول: ' : 'أكمل الحقل: ') + missing.join('، ') : '', ...other].filter(Boolean).join(' · ');
      return { errs: out, first, msg };
    }
    const keyName = (k) => {
      const all = flatFields(fields()).filter((f) => f.k && f.label);
      const f = all.find((x) => x.k === k);
      const sub = all.find((x) => x.k.startsWith(k + '.'));
      return f ? f.label : KEY_NAME[k] || FIELD_NAME[k] || (sub ? sub.label : k);
    };
    // السجل تغيّر بعد فتح النموذج (الشريك أو نافذة أخرى): لا يُكتب فوقه بصمت. حُذف: يُسأل أيُعاد إنشاؤه. عُدّل: ما غيّره
    // المستخدم في النموذج وحده يُكتب فوق أحدث نسخة (تبقى تعديلات الآخر في حقولها)، ويُسأل إن غيّرا الحقل نفسه.
    // يرجع ما يُحفظ، أو null إن ألغى المستخدم (يبقى النموذج مفتوحاً)
    let mergedNote = false;
    async function editedSince(v) {
      mergedNote = false;
      // السجل كما هو محفوظ الآن، لا كما في هذه الصفحة: لقطة تعديل الشريك قد تصل متأخرة (حتى نصف دقيقة إن انقطع التحديث
      // المباشر)، فلا يُكتب فوقه بصمت. يُنظَّف كما عند التحميل. تعذّرت القراءة: ما في الصفحة
      let cur = APP.backend && APP.backend.fresh && !APP.demo ? await APP.backend.fresh(editOf.s, editOf.rec.id) : undefined;
      if (cur === undefined) cur = find(editOf.s, editOf.rec.id);
      else if (cur) {
        cur = RB.sanitizeRecord(editOf.s, cur) || cur;
        if (editOf.s === 'expenses') cur = RB.migrateExpense(cur);
      }
      if (!cur) return (await confirmBox('حُذف هذا السجل بعد أن فتحته — حذفه شريكك أو نافذة أخرى، أو مُسحت البيانات. هل تعيد إنشاءه بما في النموذج؟', { ok: 'أعد إنشاءه' })) ? v : null;
      if (RB.sameRec(cur, editOf.rec)) return v;
      const mg = RB.editMerge(editOf.rec, JSON.parse(snap), v, cur);
      // ما وافق عليه المستخدم مرة لا يُسأل عنه ثانية إن رُفض الحفظ لسبب آخر ثم أُعيد
      if (mg.clash.length && !(editOf.seen && RB.sameRec(cur, editOf.seen))) {
        const names = [...new Set(mg.clash.map(keyName))].map((x) => '«' + esc(x) + '»').join('، ');
        const one = mg.clash.length === 1;
        if (!(await confirmBox(`عدّل شريكك أو نافذة أخرى هذا السجل بعد أن فتحته، وغيّرتَ أنت أيضاً ${names}. الحفظ يضع ما في النموذج مكان تعديله في ${one ? 'هذا الحقل' : 'هذه الحقول'}، وتبقى تعديلاته في غيرها. هل تحفظ؟`, { ok: 'احفظ ما في النموذج' }))) return null;
        editOf.seen = clone(cur);
      }
      mergedNote = true;
      return mg.rec;
    }
    async function submit() {
      if (saving) return;
      // تغيّر الدفتر المعروض بعد فتح النموذج: بدأ الشريك أو نافذة أخرى دفتر المطعم والنموذج من التجربة، أو مُسح الدفتر
      // في نافذة أخرى فعُرضت التجربة. لا يُحفظ في دفتر لم يُفتح منه (o.anyBooks: معالج البداية يتحقق بنفسه)
      if (APP.demo !== demoAt && !o.anyBooks) {
        toast(demoAt ? 'فُتح دفتر المطعم بعد أن فتحت هذا النموذج في البيانات التجريبية، فأُغلق دون حفظ: لا يُحفظ شيء من التجربة في دفترك.' : 'عُرضت البيانات التجريبية بعد أن فتحت هذا النموذج (مُسح الدفتر في نافذة أخرى)، فأُغلق دون حفظ.', 'bad');
        m.close();
        render();
        return;
      }
      // إعادة رسم مؤجلة لم تحدث بعد: تُرسم أولاً، وإن غيّرت شيئاً على الشاشة (حقلاً أو سطراً) لا يُحفظ قبل أن
      // يراه المستخدم — فلا يُحفظ أبداً ما لم يُعرض
      if (pending) {
        const shown = () => JSON.stringify([...m.body.querySelectorAll('[data-path]')].map((x) => [x.dataset.path, x.type === 'checkbox' ? x.checked : x.value]));
        const before = shown();
        draw();
        if (shown() !== before) {
          toast('تحدّثت بعض القيم في النموذج — راجعها ثم احفظ.', 'bad');
          return;
        }
      }
      m.body.querySelectorAll('[aria-invalid="true"]').forEach(clearErr);
      saveErrs = new Set();
      const chk = validate();
      errs = chk.errs;
      errAt = {};
      for (const p of Object.keys(errs)) errAt[p] = JSON.stringify(getPath(val, p));
      if (chk.first) {
        for (const p of Object.keys(errs)) {
          const el = m.body.querySelector(pathSel(p));
          if (el) markErr(el, errs[p]);
        }
        toast(chk.msg, 'bad');
        const fe = m.body.querySelector(pathSel(chk.first));
        if (fe) fe.focus();
        return;
      }
      // عرض فقط (توقف الوصول والنموذج مفتوح) أو استيراد أو مسح جارٍ: لا يُحفظ ولا يُغلق النموذج، فيبقى ما أُدخل فيه
      // ليُنسخ أو يُحفظ بعد انتهاء العملية
      if (roBlock()) return;
      saving = true;
      let log = null;
      try {
        let out = clone(val);
        if (editOf && !APP.readOnly && !(out = await editedSince(out))) return;
        // onSave يعمل على نسخة: الحفظ المرفوض (رسالة خطأ أو إلغاء التأكيد) لا يغيّر بيانات النموذج المفتوح،
        // فتبقى الأسطر على الشاشة هي البيانات نفسها (كان حذف السطر الفارغ قبل الرفض يزيح أرقام الأسطر).
        // الرفض نص (رسالة)، أو {msg, path, inline}: الخطأ تحت حقله (aria-invalid) والتركيز إليه كأخطاء التحقق
        saveLog = log = [];
        const res = await o.onSave(out);
        saveLog = null;
        if (typeof res === 'string' || (res && typeof res === 'object' && res.msg)) {
          const r = typeof res === 'string' ? { msg: res } : res;
          const el = r.path && m.body.querySelector(pathSel(r.path));
          if (el) {
            errs[r.path] = r.inline || r.msg;
            errAt[r.path] = JSON.stringify(getPath(val, r.path));
            saveErrs.add(r.path);
            markErr(el, errs[r.path]);
            el.focus();
          }
          toast(r.msg, 'bad');
          return;
        }
        // ألغى المستخدم التأكيد، أو رُفض الحفظ (صار عرضاً فقط أو بدأ استيراد أثناء سؤال في onSave): يبقى النموذج مفتوحاً
        if (res === false || log.refused) return;
        m.close();
        render();
        savedHint(log, o.done);
        if (mergedNote) toast('عدّل شريكك أو نافذة أخرى هذا السجل بعد أن فتحته — حُفظ ما غيّرته أنت، وبقيت تعديلاته في الحقول الأخرى.');
      } finally {
        saving = false;
        if (saveLog === log) saveLog = null;
      }
    }
    m.el.addEventListener('submit', (e) => {
      e.preventDefault();
      submit();
    });
    m.foot.innerHTML = `<button type="button" class="btn primary" data-save>${esc(o.ok || 'حفظ')}</button><small class="muted kbd-hint">Ctrl+Enter للحفظ</small><button type="button" class="btn ghost" data-close>إلغاء</button>${o.extra || ''}`;
    m.foot.querySelector('[data-save]').addEventListener('click', submit);
    draw();
    snap = JSON.stringify(val);
    OPEN_FORMS.add(refresh);
    const first = (o.focus && m.body.querySelector(o.focus)) || m.body.querySelector('input:not([type=checkbox]),select,textarea');
    if (first && !o.noFocus) first.focus();
    return m;
  }

  // بعد حفظ نموذج: السجل الظاهر في الصفحة يكفيه سطره (يُبرَز لحظة). وغير الظاهر يُقال لماذا مع زر يُظهره: تاريخه خارج
  // الفترة المعروضة، أو يخفيه فلتر التصنيف؛ وإلا «تم الحفظ.» (صفحة لا تعرض هذا القسم)، فلا يُدخَل السجل مرة ثانية.
  // done: رسالة النموذج نفسه (الإقفال، الأرصدة الافتتاحية)
  const CAT_FILTER = { expenses: ['expenses', 'expCat', (id) => RB.expenseCat(id).name], purchases: ['purchases', 'purCat', (id) => RB.purchaseCat(id).name] };
  function savedRow(section, id) {
    const sel = `[data-act="edit"][data-s="${CSS.escape(section)}"][data-id="${CSS.escape(String(id))}"]`;
    const page = document.getElementById('page');
    return page ? [...page.querySelectorAll(sel)].find((b) => b.getClientRects().length) : null;
  }
  function flashRow(b) {
    const row = b && b.closest('tr, li, .card');
    if (!row) return;
    row.classList.remove('just-saved');
    void row.offsetWidth;
    row.classList.add('just-saved');
    setTimeout(() => row.classList.remove('just-saved'), 2000);
  }
  function savedHint(log, done) {
    const x = log && log[0];
    if (!x || !x.rec) return done ? toast(done) : undefined;
    const { section, rec } = x;
    const b = savedRow(section, rec.id);
    if (b) {
      flashRow(b);
      if (done) toast(done);
      return;
    }
    // بعد زر الرسالة: السطر نفسه يُبرَز ويأخذ التركيز (زر الرسالة زال)
    const reveal = (fn) => () => {
      fn();
      resetRows();
      saveUI();
      render();
      const r = savedRow(section, rec.id);
      if (r) {
        flashRow(r);
        r.focus();
      } else focusPageTitle();
    };
    const say = (body, act) => toast((done || 'حُفظ.') + ' ' + body, '', act);
    const f = CAT_FILTER[section];
    const hidCat = !!f && ui.page === f[0] && !!ui[f[1]] && rec.category !== ui[f[1]];
    if (RB.isISODate(rec.date) && !inRange(rec.date)) {
      const ym = rec.date.slice(0, 7);
      return say(`تاريخه ${dtText(rec.date)} خارج الفترة المعروضة (${periodLabel()}).`, {
        label: 'اعرض ' + RB.monthName(ym),
        run: reveal(() => {
          ui.period = 'custom';
          ui.from = ym + '-01';
          ui.to = RB.monthEnd(ym);
          if (hidCat) ui[f[1]] = '';
        }),
      });
    }
    if (hidCat) return say(`تصنيفه «${f[2](rec.category)}» يخفيه الفلتر المختار.`, { label: 'اعرض كل التصنيفات', run: reveal(() => (ui[f[1]] = '')) });
    toast(done || 'تم الحفظ.');
  }

  // ─── جداول وأقسام ───
  // عنوان العمود نصاً عادياً لسمة data-label (العنوان HTML مهرَّب أصلاً: يُفك ثم يُهرَّب للسمة)
  const UNESC = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
  const plainLabel = (h) => esc(String(h || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (m, k) => UNESC[k]).replace(/\s+/g, ' ').trim());
  // cols: { h: العنوان, f: الخانة, num, cls } — عمود أزرار السطر يُمرَّر بـ cls: 'acts' فيثبت على حافة الجدول.
  // o.cards: جدول سجلات يتحول على الجوال إلى بطاقات (عنوان كل خانة فوقها من data-label)
  function table(cols, rows, o) {
    o = o || {};
    if (!rows.length) return `<div class="empty-box">${o.empty || 'لا توجد بيانات في هذه الفترة.'}</div>`;
    const cc = (c) => `${c && c.num ? 'num' : ''} ${(c && c.cls) || ''}`;
    const lab = cols.map((c) => plainLabel(c.h));
    const la = (i) => (lab[i] ? ` data-label="${lab[i]}"` : '');
    const head = cols.map((c) => `<th class="${cc(c)}">${c.h}</th>`).join('');
    const body = rows
      .map((r) => `<tr ${o.rowCls ? `class="${o.rowCls(r)}"` : ''}>${cols.map((c, i) => `<td class="${cc(c)}"${la(i)}>${c.f(r)}</td>`).join('')}</tr>`)
      .join('');
    const foot = o.foot ? `<tfoot><tr>${o.foot.map((x, i) => `<td class="${cc(cols[i])}"${la(i)}>${x}</td>`).join('')}</tr></tfoot>` : '';
    return `<div class="tbl-wrap"><table class="tbl ${o.cls || ''} ${o.cards ? 'cards' : ''}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
  }
  function card(title, body, o) {
    o = o || {};
    return `<section class="card ${o.cls || ''}">${title ? `<div class="card-h"><div><h2>${title}</h2>${o.sub ? `<p class="sub">${o.sub}</p>` : ''}</div>${o.actions ? `<div class="card-a">${o.actions}</div>` : ''}</div>` : ''}<div class="card-b">${body}</div></section>`;
  }
  function kpi(label, value, sub, state) {
    return `<div class="kpi ${state || ''}"><div class="kpi-l">${label}</div><div class="kpi-v">${value}</div>${sub ? `<div class="kpi-s">${sub}</div>` : ''}</div>`;
  }
  const money = (n) => `<span class="money">${N(n)} <small class="cur">${cur()}</small></span>`;
  const btn = (label, act, attrs, kind) => `<button type="button" class="btn ${kind || ''}" data-act="${act}" ${attrs || ''}>${label}</button>`;
  // القوائم الطويلة (المشتريات، الإقفالات، المصاريف، الرسوم، التحويلات): يُرسم أحدث ui.rowLimit سطر فقط،
  // والمجاميع والمؤشرات والفلاتر من القائمة كاملة. «عرض المزيد» يضيف 300، ويعود الحد عند تغيير الصفحة أو الفترة أو الفلتر
  const ROWS = 300;
  const rowLimit = () => (ui.rowLimit >= ROWS ? ui.rowLimit : ROWS);
  const limitRows = (list) => list.slice(0, rowLimit());
  const moreRows = (n) => (n > rowLimit() ? `<div class="more-rows"><p class="note">يظهر أحدث ${fmt0(rowLimit())} من ${fmt0(n)}</p>${btn('عرض المزيد', 'more', '', 'sm')}</div>` : '');
  const resetRows = () => (ui.rowLimit = ROWS);
  // أقسام بلا نسخ (⧉): الشريك ونسبته لا يُنسخان، ولا سداد الضريبة (لكل إقرار سداده)
  const NO_DUP = ['partners', 'vatPayments'];
  const rowActs = (s, id, extra) =>
    `<div class="row-acts">${extra || ''}<button type="button" class="icon-btn" data-act="edit" data-s="${s}" data-id="${esc(id)}" aria-label="تعديل" title="تعديل">✎</button>${NO_DUP.includes(s) ? '' : `<button type="button" class="icon-btn" data-act="dup" data-s="${s}" data-id="${esc(id)}" aria-label="نسخ" title="نسخ">⧉</button>`}<button type="button" class="icon-btn danger" data-act="del" data-s="${s}" data-id="${esc(id)}" aria-label="حذف" title="حذف">✕</button></div>`;
  function hbars(items, o) {
    o = o || {};
    if (!items.length) return `<div class="empty-box">${o.empty || 'لا توجد بيانات.'}</div>`;
    const max = Math.max(...items.map((x) => Math.abs(x.v)), 1);
    const total = o.total !== undefined ? o.total : items.reduce((s, x) => s + Math.max(x.v, 0), 0);
    return `<div class="hbars">${items
      .map(
        (x) => `<div class="hbar" data-tip="${esc(x.label)}: ${ltr(fmt(x.v))} ${esc(S.settings.currency)}${total ? ' · ' + ltr(pctT((x.v / total) * 100)) : ''}"><span class="hb-l">${esc(x.label)}</span><span class="hb-t"><i style="width:${Math.max((Math.abs(x.v) / max) * 100, 0.5).toFixed(2)}%"></i></span><span class="hb-v">${N(x.v)}${total ? `<small>${pct((x.v / total) * 100, 0)}</small>` : ''}</span></div>`
      )
      .join('')}</div>`;
  }
  // التبويبات: المختار وحده يصله Tab والأسهم تنقل بينها (bindGlobal). كل ما بعدها في الصفحة لوحة التبويب
  // المختار (wrapTabPanel بعد الرسم). قيمة محفوظة لا تطابق تبويباً تعني الأول، كما تعرضه الصفحات
  const tabId = (id, k) => `tab-${id}-${k}`;
  function tabs(id, items, active) {
    if (!items.some(([k]) => k === active)) active = items[0][0];
    return `<div class="tabs" role="tablist" data-panel="tp-${esc(id)}">${items
      .map(([k, l]) => `<button type="button" role="tab" id="${esc(tabId(id, k))}" aria-controls="tp-${esc(id)}" aria-selected="${k === active}" tabindex="${k === active ? 0 : -1}" class="tab ${k === active ? 'on' : ''}" data-act="tab" data-tab="${esc(id)}" data-v="${esc(k)}">${l}</button>`)
      .join('')}</div>`;
  }
  function wrapTabPanel(page) {
    const tl = page.querySelector(':scope > .tabs[role="tablist"]');
    if (!tl || !tl.nextSibling) return;
    const panel = document.createElement('div');
    panel.className = 'tabpanel';
    panel.id = tl.dataset.panel;
    panel.setAttribute('role', 'tabpanel');
    panel.tabIndex = 0;
    const on = tl.querySelector('[role="tab"][aria-selected="true"]');
    if (on) panel.setAttribute('aria-labelledby', on.id);
    while (tl.nextSibling) panel.appendChild(tl.nextSibling);
    tl.after(panel);
  }
  // بعد التنقل إلى صفحة: التركيز على عنوانها، فيبدأ منه قارئ الشاشة ولوحة المفاتيح (لا بعد كل إعادة رسم)
  function focusPageTitle() {
    const h = document.querySelector('#page h1');
    if (!h) return;
    h.tabIndex = -1;
    h.focus({ preventScroll: true });
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
  // المطعم مسجل في الضريبة في يوم من الفترة المنتهية بـ to على الأقل: مبيعاته «شاملة الضريبة» ولها «ضريبة المبيعات».
  // غير المسجل (أو الفترة كلها قبل سريان تسجيله) مبيعاته بلا ضريبة، فلا يُقال له «شاملة الضريبة» ولا تُعرض له خانة ضريبتها
  const vatIn = (to) => RB.isVatReg(S.settings, to || today());
  const inclVat = (to) => (vatIn(to) ? ' شاملة الضريبة' : '');
  // «المبيعات بدون الضريبة» لمن عليه ضريبة مبيعات في الفترة المنتهية بـ to، و«المبيعات» لغير المسجل (RB.salesLabel)
  const salesLbl = (base, to) => RB.salesLabel(base, S.settings, to || today());
  // account: طريقة الدفع — الآجل لم يُدفع بعد (يُسدَّد للمورد لاحقاً)، فإجماليه مستحق لا مدفوع
  const vatPreview = (amount, includesVat, taxable, date, account) => {
    const v = RB.vatSplit(amount, includesVat, taxable, S.settings);
    const reg = RB.isVatReg(S.settings, date || today());
    const owed = account === 'payable';
    const totLabel = v.gross < 0 ? (owed ? 'المخصوم من المستحق للمورد' : 'المبلغ المسترد / المخصوم من المورد') : owed ? 'الإجمالي المستحق للمورد' : 'الإجمالي المدفوع';
    return `<div class="pv-grid"><div><span>قبل الضريبة</span>${money(v.net)}</div><div><span>الضريبة ${taxable ? pct(S.settings.vatRate, 0) : '(غير خاضعة)'}</span>${money(v.vat)}</div><div><span>${totLabel}</span>${money(v.gross)}</div></div>${taxable && !reg ? '<p class="note">المطعم غير مسجل في الضريبة، فتُحسب الضريبة ضمن التكلفة.</p>' : ''}`;
  };

  // ═════════════ الرسوم البيانية ═════════════
  const CHARTS = {};
  let chartN = 0;
  // الرسم صورة لقارئ الشاشة: وصفها العنوان والإجمالي وأعلى نقطة وآخرها (وعدد الأشهر الخاسرة)،
  // وجدول مخفي بصرياً بكل النقاط. data.points: {label على المحور، name الاسم الكامل، v، tip}، data.col عنوان عمود النقاط
  function chartSlot(data) {
    const id = 'chart' + ++chartN;
    CHARTS[id] = data;
    const pts = data.points || [];
    const label = data.label || '';
    const cu = S.settings.currency || 'ر.س';
    const nm = (p) => String(p.name || p.label);
    const amt = (v) => fmt(v) + ' ' + cu;
    let aria = label;
    if (pts.length) {
      const hi = pts.reduce((a, p) => (p.v > a.v ? p : a));
      // آخر نقطة جاءت (أشهر السنة الباقية في الرسم أصفار لم تأتِ بعد)
      const last = pts.filter((p) => !p.future).pop() || pts[pts.length - 1];
      aria += ` — الإجمالي ${amt(RB.sum(pts, (p) => p.v))}، الأعلى ${nm(hi)}: ${amt(hi.v)}، الأخير ${nm(last)}: ${amt(last.v)}`;
      const loss = pts.filter((p) => p.v < 0).length;
      if (loss && data.lossLabel) aria += `، ${data.lossLabel}: ${loss}`;
    }
    const rows = pts.map((p) => `<tr><th scope="row">${esc(nm(p))}</th><td>${fmt(p.v)}</td></tr>`).join('');
    return `<div class="chart" id="${id}" role="img" aria-label="${esc(aria)}"></div><div class="vh"><table><caption>${esc(label)}</caption><thead><tr><th scope="col">${esc(data.col || 'الفترة')}</th><th scope="col">المبلغ (${esc(cu)})</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  // اسم الشهر كاملاً على المحور، ومعه السنة برقمين إن امتدت الفترة على أكثر من سنة (معزولاً من اليمين لليسار
  // فيُقرأ «سبتمبر 25» لا «25 سبتمبر» داخل الرسم ذي الاتجاه من اليسار لليمين)
  const monthTick = (ym, years) => (years ? '\u2067' + RB.MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(2, 4) + '\u2069' : RB.MONTHS[+ym.slice(5, 7) - 1]);
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }
  // الأعمدة من خط الصفر: الموجبة لأعلى، والسالبة (الأشهر الخاسرة) لأسفل باللون الأحمر.
  // المحور من أصغر قيمة إلى أكبرها، وخطوط الشبكة بخطوة واحدة على جانبي الصفر
  function drawColumns(el, d) {
    const W = Math.max(el.clientWidth, 260);
    const H = d.h || 210;
    const pr = 8;
    const pt = 14;
    const pb = 26;
    const pts = d.points;
    const vals = pts.map((p) => Number(p.v) || 0);
    const top = Math.max(0, ...vals);
    const bot = Math.min(0, ...vals);
    const step = niceMax(Math.max(top, -bot)) / 4;
    const hi = top > 0 ? Math.ceil(top / step - 1e-9) * step : bot < 0 ? 0 : step * 4;
    const lo = bot < 0 ? -Math.ceil(-bot / step - 1e-9) * step : 0;
    const ticks = [];
    for (let i = 0, k = Math.round((hi - lo) / step); i <= k; i++) ticks.push(lo + i * step);
    // هامش أرقام المحور بقدر أطولها (السالبة أطول)
    const pl = Math.max(52, 14 + 7 * Math.max(...ticks.map((v) => fmt0(v).length)));
    const n = pts.length || 1;
    const band = (W - pl - pr) / n;
    const bw = Math.max(Math.min(24, band - 2), 1.5);
    const y = (v) => pt + ((hi - v) / (hi - lo)) * (H - pt - pb);
    const y0 = y(0);
    let g = '';
    for (const v of ticks) {
      const yy = y(v);
      g += `<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}" class="grid"/><text x="${pl - 8}" y="${yy + 4}" text-anchor="end" class="ax">${fmt0(v)}</text>`;
    }
    // تسمية كل عدد من الأعمدة بقدر ما يتسع لأطول تسمية
    const lw = Math.max(44, ...pts.map((p) => String(p.label).length * 7 + 8));
    const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((W - pl - pr) / lw))));
    let bars = '';
    let labels = '';
    pts.forEach((p, i) => {
      const x = pl + i * band + (band - bw) / 2;
      const v = vals[i];
      const yy = y(v);
      const h = Math.abs(yy - y0);
      const r = Math.min(4, bw / 2, h);
      if (h > 0.3) {
        if (v > 0) bars += `<path class="bar ${p.hl ? 'hl' : ''}" d="M${x},${y0} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${y0} Z"/>`;
        else bars += `<path class="bar neg" d="M${x},${y0} V${yy - r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy - r} V${y0} Z"/>`;
      }
      bars += `<rect class="hit" x="${pl + i * band}" y="${pt}" width="${band}" height="${H - pt - pb}" data-tip="${esc(p.tip)}"/>`;
      if (i % every === 0) labels += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" class="ax">${esc(p.label)}</text>`;
    });
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" dir="ltr" aria-hidden="true">${g}<line x1="${pl}" x2="${W - pr}" y1="${y0}" y2="${y0}" class="base"/>${bars}${labels}</svg>`;
  }
  // إشارة التمرير للجدول العريض: cue-end إن بقيت أعمدة إلى اليسار (نهاية السطر)، وcue-start إن مُرِّر عن بدايته.
  // scrollLeft في RTL من 0 (البداية يميناً) نحو السالب
  function scrollCue(wr) {
    const max = wr.scrollWidth - wr.clientWidth;
    const x = Math.abs(wr.scrollLeft);
    wr.classList.toggle('cue-end', max > 1 && x < max - 1);
    wr.classList.toggle('cue-start', max > 1 && x > 1);
  }
  // التبويب المختار ظاهر في شريط التبويبات الذي يتمرر جانبياً (الشاشات الواسعة): تمرير الشريط نفسه فقط،
  // لا الصفحة (scrollIntoView كان سيرفع الصفحة إلى الشريط مع كل إعادة رسم بعد حفظ أو تحديث من الشريك)
  function showActiveTabs(scope) {
    (scope || document).querySelectorAll('.tabs').forEach((tl) => {
      const on = tl.querySelector('.tab.on');
      if (!on || tl.scrollWidth <= tl.clientWidth + 1) return;
      const r = on.getBoundingClientRect();
      const c = tl.getBoundingClientRect();
      if (r.left < c.left) tl.scrollLeft -= c.left - r.left + 12;
      else if (r.right > c.right) tl.scrollLeft += r.right - c.right + 12;
    });
  }
  function afterRender(scope) {
    (scope || document).querySelectorAll('.chart').forEach((el) => {
      const d = CHARTS[el.id];
      if (d) drawColumns(el, d);
    });
    (scope || document).querySelectorAll('.tbl-wrap').forEach(scrollCue);
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

  // ─── خطوات البداية: دفتر جديد ما زالت فيه خطوة مطلوبة، حتى تكتمل أو تُخفى ───
  // لكل خطوة زر يفتح نموذجها أو صفحتها (k: نوع الزر، باهت للمكتملة)
  const SETUP_STEPS = {
    partners: { t: 'الشركاء ونسبهم', note: 'قبل رأس المال والأرصدة الافتتاحية — تُسجَّل حقوقاً لهم حسب نسبهم', b: (k) => btn('+ شريك', 'add', 'data-s="partners"', k) + btn('الشركاء', 'go', 'data-v="partners"', 'sm ghost') },
    settings: { t: 'راجع الإعدادات (الضريبة، التأمينات، عمولات التطبيقات)', note: 'قبل أول إقفال — العمولة تُحفظ مع كل إقفال', b: (k) => btn('الإعدادات', 'go', 'data-v="settings"', k) },
    capital: { t: 'إيداع رأس المال', b: (k) => btn('+ إيداع رأس مال', 'add', 'data-s="capital" data-x="contribution"', k) },
    assets: { t: 'الأصول والأثاث', b: (k) => btn('+ أصل', 'add', 'data-s="assets"', k) },
    fixed: { t: 'الإيجار والسكن والرسوم الحكومية', b: (k) => btn('+ الإيجار', 'add', 'data-s="expenses" data-x="rent"', k) + btn('الرسوم الحكومية', 'go', 'data-v="gov"', 'sm ghost') },
    staff: { t: 'العمال', b: (k) => btn('+ موظف', 'add', 'data-s="employees"', k) },
    raw: { t: 'المواد الخام', b: (k) => btn('+ مادة خام', 'add', 'data-s="raw"', k) },
    composites: { t: 'المنتجات المجمّعة (اختياري)', b: (k) => btn('+ منتج مجمّع', 'add', 'data-s="composites"', k) },
    products: { t: 'أصناف المنيو', b: (k) => btn('+ صنف في المنيو', 'add', 'data-s="products"', k) },
    sales: { t: 'أول إقفال يومي', b: (k) => btn('+ إقفال يومي', 'add', 'data-s="sales"', k) },
  };
  // لا تظهر في التجربة ولا للعرض فقط (لا يملك إضافة شيء)
  const setupShown = () => !APP.demo && !APP.readOnly && !S.settings.setupDone && RB.setupSteps(S).pending;
  function setupCard() {
    const st = RB.setupSteps(S);
    const li = st.steps
      .map((x, i) => {
        const d = SETUP_STEPS[x.id];
        return `<li class="step ${x.done ? 'done' : ''}"><span class="step-n" aria-hidden="true">${x.done ? '✓' : i + 1}</span><span class="step-t"><b>${x.done ? '<span class="vh">تمت: </span>' : ''}${d.t}</b>${d.note ? `<small>${d.note}</small>` : ''}</span><span class="step-a">${d.b(x.done ? 'sm ghost' : 'sm')}</span></li>`;
      })
      .join('');
    return card('ابدأ من هنا', `<ol class="steps" role="list">${li}</ol>`, { cls: 'setup', sub: `خطوات تجهيز دفتر المطعم بالترتيب · أنجزت ${st.done} من ${st.steps.length}`, actions: btn('إخفاء', 'setupdone', '', 'sm ghost') });
  }

  // ─── لوحة المتابعة ───
  // الشهر الجاري قبل تسجيل مسيره: الرواتب لم تُحمَّل بعد، والإيجار والمدفوع مقدماً والإهلاك محمّلة للشهر كاملاً من أوله،
  // فيظهر الربح أعلى من الحقيقة. تقدير «حتى اليوم» لمؤشرات اللوحة فقط (التقارير على الدفاتر الفعلية):
  // f = أيام الشهر الجاري التي تشملها الفترة حتى اليوم ÷ أيام الشهر (للشهر كله: الأيام المنقضية). تحميل الشهر من
  // الإيجار والمدفوع مقدماً والإهلاك (ولو كان قيده قبل بداية فترة تبدأ أثناء الشهر) بنسبة f، ومسير الشهر المتوقع من
  // بيانات الموظفين (مع مخصص نهاية الخدمة) × f؛ ففترة من 10 إلى 14 لا تُحمَّل رواتب 14 يوماً على مبيعات 5 أيام.
  // null إن لم تشمل الفترة اليوم، أو للشهر مسير، أو لا موظف له راتب فيه
  function mtdEstimate(from, asOf, L, inc) {
    const t = today();
    const ym = t.slice(0, 7);
    if (asOf !== t || from > t || paidMonths().has(ym)) return null;
    const emps = S.employees.filter((e) => e && RB.isEmployeeActive(e, ym));
    if (!emps.length) return null;
    const ms = ym + '-01';
    const lo = from > ms ? from : ms;
    const f = (RB.daysBetween(lo, t) + 1) / +RB.monthEnd(ym).slice(8, 10);
    const tot = Object.assign({}, inc.tot);
    for (const e of L.entries) {
      if ((e.kind !== 'amort' && e.kind !== 'dep') || e.date < ms || e.date > t) continue;
      // في الفترة: محمّل كاملاً فيبقى منه f؛ قبل بدايتها (أول الشهر): غير محمّل فيُضاف منه f
      const inR = e.date >= from;
      for (const l of e.lines) {
        const info = RB.accInfo(l.a, S);
        if (info.type !== 'X') continue;
        const g = tot[info.group] !== undefined ? info.group : 'opex';
        tot[g] = r2(tot[g] + l.v * f - (inR ? l.v : 0));
      }
    }
    const lines = emps.map((e) => RB.payrollLine(e, S, ym));
    const pt = RB.payrollTotals({ lines });
    // مخصص نهاية الخدمة كما يُستحق مع المسير: عن أيام خدمته في الشهر، ولمن له مخصص افتتاحي من تاريخ بدء الدفتر
    const op = RB.openingInfo(S);
    const eosb = RB.sum(lines, (l) => RB.eosbLineAccrual(l, emps.find((x) => x.id === l.employeeId), ym, op && op.eosbBy[l.employeeId] ? op.date : ''));
    tot.labor = r2(tot.labor + f * (pt.cost + eosb));
    const rev = inc.revenue;
    const net = r2(rev - tot.cogs - tot.sell - tot.labor - tot.occ - tot.opex - tot.dep - tot.disp - tot.zakat);
    const pctOf = (x) => (rev > 0 ? (x / rev) * 100 : 0);
    return { f, tot, net, ratios: { foodCost: pctOf(tot.cogs), labor: pctOf(tot.labor), prime: pctOf(tot.cogs + tot.labor), netMargin: pctOf(net) } };
  }
  const EST_LABEL = 'حتى اليوم · تقديري (الرواتب لم تُسجَّل بعد)';

  PAGES.dashboard = () => {
    const [from, to] = range();
    const asOf = minD(to, today());
    const L = ledger();
    const inc = RB.incomeStatement(S, from, asOf, L);
    const sales = RB.salesByChannel(S, from, asOf);
    const bal = RB.balances(L.entries, null, asOf);
    const target = num(S.settings.targetFoodCost);
    // مؤشرات الربح والتكلفة الأساسية: تقدير الشهر الجاري حتى اليوم إن لم يُسجَّل مسيره بعد
    const est = mtdEstimate(from, asOf, L, inc);
    const k = est || inc;
    const estTag = est ? `<span class="kpi-est" title="الإيجار والإهلاك والرواتب (مقدّرة من بيانات الموظفين حتى يُسجَّل مسير الشهر) بنسبة أيام الشهر التي تشملها الفترة حتى اليوم">${EST_LABEL}</span>` : '';
    const fcState = !inc.revenue ? '' : fcLevel(inc.ratios.foodCost, target);
    const primeState = !inc.revenue ? '' : k.ratios.prime > 65 ? 'bad' : k.ratios.prime > 60 ? 'warn' : 'good';
    const vatBal = -(bal['2102'] || 0);
    const setup = setupShown();
    // النسب من المبيعات بلا مبيعات: «—» لا «0%» (الدفتر الجديد قبل أول إقفال، أو فترة بلا مبيعات)
    const noRev = good(S.sales).length ? 'لا مبيعات في هذه الفترة' : 'يظهر بعد أول إقفال';
    const dash = '<span class="n">—</span>';
    let h = pageHead('لوحة المتابعة', `${esc(S.settings.name)} · ${periodLabel()}`, btn('+ إقفال يومي', 'add', 'data-s="sales"', 'primary') + btn('+ فاتورة مشتريات', 'add', 'data-s="purchases"') + btn('+ مصروف', 'add', 'data-s="expenses"'));
    if (setup) h += setupCard();
    h += `<div class="kpis">
      ${kpi('المبيعات' + inclVat(asOf), money(sales.total.gross), sales.total.orders ? `${cnt(sales.total.orders, W.order)} · متوسط الفاتورة ${fmt(sales.total.avgTicket)}` : sales.total.gross ? 'سجّل عدد الطلبات في الإقفال لمعرفة متوسط الفاتورة' : noRev)}
      ${kpi('صافي الربح', money(k.net), (inc.revenue ? `هامش ${pct(k.ratios.netMargin)} من ${salesLbl('المبيعات', asOf)}` : 'هامش الربح: ' + noRev) + estTag, k.net < 0 ? 'bad' : inc.revenue ? 'good' : '')}
      ${kpi('تكلفة المواد', inc.revenue ? pct(inc.ratios.foodCost) : dash, inc.revenue ? `المستهدف ${pct(target, 0)} · ${fmt(inc.tot.cogs)} ${cur()}` : noRev, fcState)}
      ${kpi('التكلفة الأساسية', inc.revenue ? pct(k.ratios.prime) : dash, (inc.revenue ? `المواد + العمالة${est ? ` (العمالة ${pct(k.ratios.labor)})` : ''} · الأفضل أقل من ${pct(60, 0)}` : noRev) + estTag, primeState)}
    </div>`;
    h += `<div class="kpis small">
      ${kpi('الصندوق (الكاشير)', money(bal['1101'] || 0), 'حتى ' + dtText(asOf), (bal['1101'] || 0) < 0 ? 'bad' : '')}
      ${kpi('الحساب البنكي', money(bal['1102'] || 0), 'حتى ' + dtText(asOf), (bal['1102'] || 0) < 0 ? 'bad' : '')}
      ${kpi('مستحقات التطبيقات', money(bal['1103'] || 0), 'لم تُحوَّل للبنك بعد')}
      ${
        // غير مسجل بلا رصيد ضريبة (لا من تسجيل سابق ولا من الأرصدة الافتتاحية): لا بطاقة «مستحقة للهيئة 0.00». الرصيد لصالح
        // المطعم لم يُسترد بعد («مسترد» لما وصل فعلاً من الهيئة)
        !vatIn(asOf) && Math.abs(vatBal) < 0.005
          ? kpi('ضريبة القيمة المضافة', '<span>غير مسجل</span>', 'لا تُحسب ضريبة على المبيعات')
          : kpi(vatBal >= 0 ? 'ضريبة مستحقة للهيئة' : 'رصيد ضريبة لصالحك', money(Math.abs(vatBal)), (vatBal < 0 ? 'لم يُسترد بعد · ' : '') + 'الرصيد المتراكم حتى ' + dtText(asOf))
      }
    </div>`;
    // المبيعات اليومية أو الشهرية
    const days = RB.daysBetween(from, to) + 1;
    let pts = [];
    if (days <= 93) {
      // هذا الشهر: المحور حتى اليوم، بلا أيام لم تأتِ بعد
      const end = ui.period === 'month' ? minD(to, today()) : to;
      for (let d = from; d <= end; d = RB.addDays(d, 1)) {
        const v = sales.days[d] || 0;
        pts.push({ label: String(+d.slice(8, 10)), name: dtText(d), v, tip: `${dtText(d)}: ${ltr(fmt(v))} ${S.settings.currency}`, hl: d === today(), future: d > today() });
      }
    } else {
      const m = {};
      for (const d of Object.keys(sales.days)) m[d.slice(0, 7)] = (m[d.slice(0, 7)] || 0) + sales.days[d];
      const years = from.slice(0, 4) !== to.slice(0, 4);
      for (let ym = from.slice(0, 7); ym <= to.slice(0, 7); ym = RB.ymAdd(ym, 1)) pts.push({ label: monthTick(ym, years), name: RB.monthName(ym), v: m[ym] || 0, tip: `${RB.monthName(ym)}: ${ltr(fmt(m[ym] || 0))} ${S.settings.currency}`, future: ym > today().slice(0, 7) });
    }
    const best = Object.entries(sales.days).sort((a, b) => b[1] - a[1])[0];
    const chartLabel = (days <= 93 ? 'المبيعات اليومية' : 'المبيعات الشهرية') + inclVat(asOf);
    h += card(days <= 93 ? 'المبيعات اليومية' : 'المبيعات الشهرية', sales.total.gross ? chartSlot({ points: pts, label: chartLabel, col: days <= 93 ? 'اليوم' : 'الشهر' }) : `<div class="empty-box">لا توجد مبيعات مسجلة في هذه الفترة. سجّل أول إقفال يومي من زر «إقفال يومي».</div>`, {
      sub: [vatIn(asOf) ? 'شاملة الضريبة' : '', best ? `أعلى يوم ${dtText(best[0])} بمبلغ ${fmt(best[1])} ${cur()}` : ''].filter(Boolean).join(' · '),
    });
    // القنوات وتوزيع المصاريف
    const chItems = sales.list.map((c) => ({ label: c.name, v: c.gross }));
    const typeTot = { cash: 0, card: 0, app: 0 };
    sales.list.forEach((c) => (typeTot[c.type] = (typeTot[c.type] || 0) + c.gross));
    const typeLine = sales.total.gross ? `كاش ${pct((typeTot.cash / sales.total.gross) * 100, 0)} · شبكة ${pct((typeTot.card / sales.total.gross) * 100, 0)} · تطبيقات ${pct((typeTot.app / sales.total.gross) * 100, 0)}` : '';
    const gItems = Object.keys(RB.GROUPS).map((g) => ({ label: RB.GROUPS[g], v: inc.tot[g] })).filter((x) => x.v);
    h += `<div class="grid2">${card('المبيعات حسب القناة', hbars(chItems, { empty: 'لا توجد مبيعات.' }), { sub: typeLine })}${card('أين ذهبت الإيرادات؟', hbars(gItems, { total: inc.revenue, empty: 'لا توجد مصاريف في هذه الفترة.' }), { sub: `النسبة من ${salesLbl('المبيعات', asOf)} (${fmt(inc.revenue)} ${cur()})` })}</div>`;
    // التنبيهات
    h += card('تنبيهات تحتاج إلى متابعة', alertsHTML(asOf, setup), { sub: 'إقفالات ورواتب، تجديدات، ضريبة، أسعار، وأرصدة' });
    return h;
  };

  const lastBackupText = () => {
    const at = lastBackupAt();
    if (!isFinite(at)) return 'لم تُؤخذ بعد';
    const d = new Date(at);
    return dtText(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')) + ' ' + TIMEF.format(d);
  };
  // تذكير النسخ الاحتياطي للحفظ في المتصفح: عمر آخر نسخة بالأيام إن مضى عليها أكثر من 14 يوماً (−1: لم تُؤخذ)، وإلا null
  function backupAge() {
    if (APP.demo || !APP.backend || APP.backend.kind !== 'local' || !countRecs(S)) return null;
    const at = lastBackupAt();
    if (!isFinite(at)) return -1;
    return Date.now() - at > 14 * 86400000 ? Math.floor((Date.now() - at) / 86400000) : null;
  }
  // setup: خطوات البداية ظاهرة فوق التنبيهات، فلا «كل شيء على ما يرام» لدفتر لم يُجهَّز بعد
  // دفعة زائدة على إقرار الفترة التي بدأ الدفتر أثناءها، ولا ضريبة افتتاحية لأيامها قبل البدء: غالباً سُدِّد الإقرار
  // الحقيقي كاملاً (يشمل تلك الأيام) فظهر رصيد دائن لا وجود له. يرجع نص التنبيه أو ''
  function preVatHint(label) {
    const op = RB.openingInfo(S);
    const c = op && !op.vatCurrent && op.date <= today() ? (RB.vatOpeningPeriod(S, op) || {}).cur : null;
    if (!c || c.label !== label) return '';
    // ومن أدخلها من قبل في «ضريبة مستحقة من إقرار سابق» (مستحق لإقرار سابق لم يُسدَّد) ينقلها منه
    const moved = op.vatPayable > 0 ? ' وإن كنت أدخلتها في «ضريبة مستحقة من إقرار سابق» فانقلها منه.' : '';
    return `إن كان إقرار «${esc(c.label)}» الذي سددته يشمل ضريبة ${dtText(c.from)} – ${dtText(c.to)} قبل بدء الدفتر فأدخلها في الأرصدة الافتتاحية («ضريبة الفترة الجارية حتى بدء الدفتر») لتُضاف لمستحقه؛ وإلا فالزائد رصيد دائن لك.${moved}`;
  }
  function alertsHTML(asOf, setup) {
    const out = [];
    const bad = badRecords();
    if (bad.length) out.push(['bad', `سجلات تحتاج إلى تصحيح: <span class="n">${bad.length}</span> — لا تدخل في الحسابات حتى تُصحَّح${fixList(bad, true)}`, '']);
    const bk = backupAge();
    if (bk !== null) out.push(['warn', `${bk < 0 ? 'لم تُؤخذ نسخة احتياطية بعد' : `آخر نسخة احتياطية قبل ${cnt(bk, W.day, { gen: true, wrap: numSpan })}`} — مسح بيانات المتصفح يمسح الدفتر`, btn('صدّر الآن', 'backup', '', 'sm')]);
    // أيام بلا إقفال يومي، وأشهر بلا مسير رواتب (الربح يظهر أعلى من الحقيقة)
    const noClose = missingClosings();
    if (noClose.length) {
      const d0 = esc(noClose[0]);
      out.push(['warn', `لا يوجد إقفال يومي في ${cnt(noClose.length, W.day, { gen: true, wrap: numSpan })}: ${noClose.slice(0, 5).map(dt).join('، ')}${noClose.length > 5 ? '…' : ''}`, `<span class="al-a">${btn('سجّل إقفال ' + dt(noClose[0]), 'add', `data-s="sales" data-x="${d0}"`, 'sm')}${btn('كان مغلقاً ' + dt(noClose[0]), 'closedDay', `data-d="${d0}"`, 'sm ghost')}</span>`]);
    }
    for (const ym of missingPayroll()) {
      // اشتراكات التأمينات تُسدَّد خلال أول 15 يوماً من الشهر التالي: يوم 15 نفسه في الموعد، والتأخير من 16
      const due = RB.ymAdd(ym, 1) + '-15';
      const late = today() > due;
      out.push([late ? 'bad' : 'warn', `لم يُسجَّل مسير رواتب ${esc(RB.monthName(ym))} — الأرباح لهذا الشهر أعلى من الحقيقة. اصرف الرواتب عبر البنك وارفع ملف «مدد»${late ? `. فات موعد سداد اشتراكات التأمينات عنه (${dtText(due)})، والتأخير عليه غرامة.` : `، وآخر موعد لسداد اشتراكات التأمينات عنه ${dtText(due)}.`}`, btn('مسير الرواتب', 'add', `data-s="payroll" data-x="${esc(ym)}"`, 'sm')]);
    }
    for (const r of RB.renewals(S, today())) {
      if (r.status === 'ok') continue;
      const name = (r.rec.desc || RB.expenseCat(r.rec.category).name) + (r.rec.entity ? ' — ' + r.rec.entity : '') + empName(r.rec.employeeId, ' · ');
      out.push([r.status === 'expired' ? 'bad' : 'warn', r.status === 'expired' ? `انتهى: ${esc(name)} منذ ${cnt(-r.days, W.day, { gen: true })}` : r.days ? `يحتاج إلى تجديد: ${esc(name)} خلال ${cnt(r.days, W.day, { gen: true })} (${dtText(r.end)})` : `يحتاج إلى تجديد: ${esc(name)} — ينتهي اليوم (${dtText(r.end)})`, renewActs(r)]);
    }
    // إقرارات الضريبة: كل فترة منتهية لم تُسدد وفات موعدها، وآخر فترة منتهية ما زال موعدها قائماً
    if (S.settings.vatRegistered) {
      const t = today();
      const rets = RB.vatReturns(S, t, ledger());
      const ended = rets.filter((p) => p.to < t);
      const deadline = (p) => RB.monthEnd(RB.ymAdd(p.to.slice(0, 7), 1));
      const payBtn = (p) => btn('سجّل السداد', 'add', `data-s="vatPayments" data-x="${esc(p.label)}"`, 'sm');
      // الضريبة المستحقة عند بدء الدفتر من إقرار سابق ولم تُسدَّد بعد
      const opv = rets.opening;
      if (opv && !opv.settled) {
        const late = opv.deadline && opv.deadline < t;
        out.push([late ? 'bad' : 'warn', `ضريبة مستحقة عند بدء الدفتر (${esc(opv.label)}): المتبقي ${fmt(opv.remaining)} ${cur()}${opv.deadline ? (late ? ` — فات موعدها (${dtText(opv.deadline)})` : ' — آخر موعد ' + dtText(opv.deadline)) : ''}`, payBtn(opv)]);
      }
      for (const p of ended) if (!p.settled && deadline(p) < t) out.push(['bad', `إقرار ${esc(p.label)}: المتبقي ${fmt(p.remaining)} ${cur()} — فات موعده`, payBtn(p)]);
      const last = ended[ended.length - 1];
      if (last && deadline(last) >= t) {
        if (!last.settled) out.push(['warn', `إقرار ضريبة ${esc(last.label)}: المستحق ${fmt(last.remaining)} ${cur()} — آخر موعد ${dtText(deadline(last))}`, payBtn(last)]);
        else if (last.credit > 0) {
          const hint = last.over > 0.005 ? preVatHint(last.label) : '';
          out.push(['warn', `إقرار ضريبة ${esc(last.label)}: لا يوجد مبلغ للسداد، ولك رصيد دائن ${fmt(last.credit)} ${cur()} يُرحّل أو يُطلب استرداده. قدّم الإقرار في موعد أقصاه ${dtText(deadline(last))}.${hint ? ' ' + hint : ''}`, btn('تقرير الضريبة', 'report', 'data-v="vat"', 'sm') + (hint ? btn('الأرصدة الافتتاحية', 'opening', '', 'sm ghost') : '')]);
        }
      }
    } else {
      // غير المسجل: حد التسجيل من مبيعات آخر 12 شهراً أو المتوقعة لسنة إن كان التشغيل أقل من سنة
      const th = RB.vatThreshold(S, today());
      const vatBtn = btn('إعدادات الضريبة', 'settings', 'data-v="vat"', 'sm');
      if (th && th.level === 'mandatory') out.push(['bad', 'مبيعاتك (في آخر 12 شهراً، أو المتوقعة خلال الاثني عشر شهراً القادمة) ' + fmt(th.est) + ' ر.س تجاوزت حد التسجيل الإلزامي في ضريبة القيمة المضافة (375,000 ر.س) — يجب التسجيل لدى هيئة الزكاة والضريبة والجمارك خلال 30 يوماً، ثم فعّل التسجيل في الإعدادات مع تاريخ السريان.', vatBtn]);
      else if (th && th.level === 'voluntary') out.push(['warn', 'تجاوزت حد التسجيل الاختياري (187,500 ر.س) — يمكنك التسجيل واسترداد ضريبة المشتريات.', vatBtn]);
    }
    const C = costing();
    const target = num(S.settings.targetFoodCost);
    // نفس الأصناف التي شارتها حمراء في «المنيو والتسعير»
    const high = S.products.filter((p) => {
      if (p.active === false) return false;
      const st = RB.productStats(S, p, C);
      return st.price > 0 && fcLevel(st.foodCost, target) === 'bad';
    });
    if (high.length) out.push(['warn', `${high.length} من أصناف المنيو تكلفتها أعلى من المستهدف بأكثر من 3 نقاط: ${high.slice(0, 4).map((p) => esc(p.name)).join('، ')}${high.length > 4 ? '…' : ''}`, btn('راجع التسعير', 'go', 'data-v="products"', 'sm')]);
    if (C.errors.some((e) => e.path)) out.push(['bad', 'يوجد تداخل دائري في وصفة: منتج يحتوي نفسه. افتح المنتجات المجمّعة وصحّح المكونات.', '']);
    // وصفة فيها مكوّن محذوف (بيانات قديمة): تكلفته لا تدخل، فتكلفة الوصفة ناقصة
    const miss = (list) => good(list).filter((r) => RB.recipeItems(S, r.items).bad);
    const missC = miss(S.composites);
    const missP = miss(S.products);
    if (missC.length || missP.length) {
      const names = missC.concat(missP).map((r) => esc(r.name));
      out.push(['warn', `وصفات فيها مكوّن محذوف فتكلفتها ناقصة: ${names.slice(0, 4).join('، ')}${names.length > 4 ? '…' : ''} — افتحها واحذف السطر أو اختر مكوّناً آخر.`, btn(missP.length ? 'المنيو والتسعير' : 'المنتجات المجمّعة', 'go', `data-v="${missP.length ? 'products' : 'composites'}"`, 'sm')]);
    }
    // رصيد الصندوق أو البنك بالسالب: في نهاية الفترة منذ بداية هذا السالب (لا أول سالب سابق عاد بعده الرصيد موجباً)،
    // أو في نهاية يوم سابق من آخر 60 يوماً (خرج منه في الدفتر أكثر مما دخل حتى ذلك اليوم) بأول يوم صار فيه بالسالب،
    // والزر يفتح كشفه من شهر ذلك اليوم
    const NEG = {
      1101: ['الصندوق', 'سجّلت مصروفات نقدية أو إيداعات في البنك أكثر من الكاش الموجود. راجع الإقفالات والتحويلات.', 'كشف الصندوق'],
      1102: ['البنك', 'تأكد من تسجيل إيداعات رأس المال والتحويلات.', 'كشف البنك'],
    };
    for (const acc of ['1101', '1102']) {
      const n = RB.negativeAlert(ledger(), acc, asOf, 60);
      if (!n) continue;
      const [name, why, label] = NEG[acc];
      const go2 = btn(label, 'stmt', `data-v="${acc}" data-d="${esc(n.since)}"`, 'sm');
      if (n.now) out.push(['bad', `رصيد ${name} بالسالب منذ نهاية ${dtText(n.since)}: ${why}`, go2]);
      else out.push(['warn', `رصيد ${name} كان بالسالب في نهاية ${dtText(n.since)} (${fmt(n.sinceBalance)} ${cur()}): خرج منه في الدفتر أكثر مما دخل حتى ذلك اليوم. غالباً سُجّل مصروف أو تحويل بتاريخ أبكر من الإقفال أو الإيداع الذي يغطيه، أو نقص إقفال أو تحويل — صحّح التاريخ أو سجّل الناقص.`, go2]);
    }
    // جرد الصندوق الذي تغيّر الدفتر بعده: فرقه المسجل لم يعد يجعل الصندوق = المعدود
    const staleCnt = RB.staleCashCounts(S, ledger());
    if (staleCnt.length) {
      const x = staleCnt[0];
      out.push(['warn', `جرد الصندوق في ${dtText(x.count.date)} لم يعد مطابقاً للدفتر: سُجّلت أو عُدّلت بعده حركة نقدية بتاريخه أو قبله، فالمتوقع الآن ${fmt(x.expected)} لا ${fmt(x.count.expected)}، وفرقه المسجل (${fmt(x.count.diff)}) لم يعد صحيحاً. افتح الجرد واحفظه ليتحدّث الفرق${staleCnt.length > 1 ? `، ثم راجع ما بعده (${cnt(staleCnt.length - 1, W.count)})` : ''}.`, btn('افتح الجرد', 'edit', `data-s="cashCounts" data-id="${esc(x.count.id)}"`, 'sm')]);
    }
    for (const a of RB.appReceivables(S, asOf)) {
      if (a.balance > 1 && (!a.lastPayout || RB.daysBetween(a.lastPayout, asOf) > 14)) out.push(['warn', `${esc(a.name)}: مستحقات ${fmt(a.balance)} ${cur()} ولم يُسجَّل تحويل منذ ${a.lastPayout ? cnt(RB.daysBetween(a.lastPayout, asOf), W.day, { gen: true }) : 'البداية'}`, btn('سجّل تحويل', 'add', `data-s="payouts" data-x="${esc(a.id)}"`, 'sm')]);
    }
    const shares = RB.sum(S.partners, (p) => num(p.share));
    if (S.partners.length && Math.abs(shares - 100) > 0.01) out.push(['warn', `مجموع نسب الشركاء ${rate(shares)} وليس ${rate(100)}.`, btn('الشركاء', 'go', 'data-v="partners"', 'sm')]);
    // مشتريات المخزون الافتتاحي قبل الافتتاح بلا جرد قبله: تُحمَّل كلها على شهر ما قبل التشغيل
    const od = S.settings.openingDate;
    const opInfo = RB.openingInfo(S);
    // مطعم قائم بلا قيمة مخزون في الأرصدة الافتتاحية وله جرد: أول جرد يُحسب كله تخفيضاً لتكلفة المواد (ربحاً)، أو ربحاً قبل
    // بدء الدفتر إن سبقه، لا حقوقاً افتتاحية للشركاء
    const firstCount = good(S.stockCounts).filter((c) => RB.isISODate(c.date)).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    if (opInfo && !opInfo.inventory && firstCount) out.push(['warn', `الأرصدة الافتتاحية بلا «قيمة المخزون»، فجرد ${dtText(firstCount.date)} يُحسب كله ${firstCount.date < opInfo.date ? 'ربحاً قبل بدء الدفتر' : 'تخفيضاً لتكلفة المواد (ربحاً) في أول شهر'}. إن كان في المطعم مخزون عند بدء الدفتر (${dtText(opInfo.date)}) فأدخل قيمته من جرده في الأرصدة الافتتاحية.`, btn('الأرصدة الافتتاحية', 'opening', '', 'sm')]);
    // مطعم جديد (بلا أرصدة افتتاحية): بضاعة الافتتاح بجرد قبل الافتتاح
    if (od && !opInfo) {
      const pre = good(S.purchases).filter((p) => p.date < od && RB.purchaseCat(p.category).cogs);
      const first = pre.reduce((m, p) => (!m || p.date < m ? p.date : m), '');
      if (first && !good(S.stockCounts).some((c) => c.date >= first && c.date < od)) out.push(['warn', 'سجّل جرداً افتتاحياً بتاريخ اليوم السابق للافتتاح حتى لا تُحمَّل بضاعة الافتتاح على شهر ما قبل التشغيل', btn('+ جرد', 'add', `data-s="stockCounts" data-x="${esc(RB.addDays(od, -1))}"`, 'sm')]);
    }
    if (ledger().errors.some((e) => e.section === 'settings' && e.id === 'opening')) out.push(['bad', 'الأرصدة الافتتاحية لم تدخل في الحسابات: أضف الشركاء ونسبهم ليُسجَّل صافيها حقوقاً لهم.', btn('الشركاء', 'go', 'data-v="partners"', 'sm')]);
    out.push(...advanceAlerts());
    out.push(...eosbAlerts(false));
    if (!out.length) return setup ? `<div class="empty-box">لا تنبيهات بعد — أكمل خطوات البداية أعلاه.</div>` : `<div class="empty-box ok">لا توجد تنبيهات حالياً — كل شيء على ما يرام.</div>`;
    return alertsUL(out);
  }
  // أيام بلا إقفال يومي حتى أمس: من آخر 30 يوماً، ولا قبل الافتتاح أو أول إقفال مسجل، إلا الأيام المعلَّمة
  // «كان مغلقاً» (settings.closedDays). دفتر بلا إقفالات: لا شيء
  function missingClosings() {
    const sales = good(S.sales);
    if (!sales.length) return [];
    const t = today();
    const has = new Set();
    let start = RB.addDays(t, -30);
    let first = '';
    for (const x of sales) {
      has.add(x.date);
      if (!first || x.date < first) first = x.date;
    }
    if (first > start) start = first;
    const op = S.settings.openingDate;
    if (op && op > start) start = op;
    const closed = new Set(S.settings.closedDays || []);
    const out = [];
    for (let d = start, y = RB.addDays(t, -1); d <= y; d = RB.addDays(d, 1)) if (!has.has(d) && !closed.has(d)) out.push(d);
    return out;
  }
  // أشهر منتهية (آخر 3 أشهر) فيها موظف له راتب ولا مسير رواتب لها: من شهر الافتتاح وأول مباشرة لموظف وبداية الدفتر
  // (وتاريخ الأرصدة الافتتاحية لمطعم قائم بدأ دفتره بعد تشغيله)
  function missingPayroll() {
    const emps = S.employees.filter(Boolean);
    if (!emps.length) return [];
    const thisYm = today().slice(0, 7);
    const lows = [RB.ymAdd(thisYm, -3)];
    const bs = booksStartYm();
    if (bs) lows.push(bs);
    if (S.settings.openingDate) lows.push(S.settings.openingDate.slice(0, 7));
    const starts = emps.map((e) => (RB.isISODate(e.startDate) ? e.startDate.slice(0, 7) : '')).filter(Boolean).sort();
    if (starts.length) lows.push(starts[0]);
    const op = RB.openingInfo(S);
    if (op) lows.push(op.date.slice(0, 7));
    const lo = lows.sort().pop();
    const paid = paidMonths();
    const out = [];
    for (let ym = lo; ym < thisYm; ym = RB.ymAdd(ym, 1)) if (!paid.has(ym) && emps.some((e) => RB.isEmployeeActive(e, ym))) out.push(ym);
    return out;
  }
  // شهر بداية الدفتر: أول حركة تشغيل مسجلة (إقفال، مصروف، مشتريات، مسير، سداد مورد، تحويل…)، وبلا حركات: شهر
  // إنشاء الدفتر (settings.startedAt). مطعم قائم بدأ دفتره اليوم بلا أرصدة افتتاحية لا تُطلب منه مسيرات أشهر لم
  // يسجّل فيها شيئاً. رأس المال والأصول لا تُحسب: قد تُسجَّل بتواريخها الأصلية قبل بدء الدفتر بمدة
  function booksStartYm() {
    let lo = '';
    for (const k of ['sales', 'expenses', 'purchases', 'supplierPayments', 'payouts', 'transfers', 'cashCounts', 'advances'])
      for (const r of good(S[k])) if (RB.isISODate(r.date) && (!lo || r.date < lo)) lo = r.date;
    for (const p of good(S.payroll)) {
      const m = runMonth(p);
      if (RB.isISOMonth(m) && (!lo || m + '-01' < lo)) lo = m + '-01';
    }
    if (lo) return lo.slice(0, 7);
    const st = S.settings.startedAt ? new Date(S.settings.startedAt) : null;
    return st && isFinite(st) ? st.getFullYear() + '-' + String(st.getMonth() + 1).padStart(2, '0') : '';
  }
  // من ترك العمل أو توقف وما زالت عليه سلفة
  // واستقطاع سلفة من مسير أكثر من سلف الموظف (رصيد سالب: سلفة حُذفت أو لم تُسجَّل، أو استقطاع لعامل غير مسجل)
  function advanceAlerts() {
    const t = today();
    const bal = RB.advanceBalances(S, t);
    const out = S.employees
      .filter((e) => e && (bal[e.id] || 0) > 0.005 && (e.active === false || (RB.isISODate(e.endDate) && e.endDate <= t)))
      .map((e) => ['warn', `${esc(e.name)} ترك العمل وعليه سلفة مستحقة ${fmt(bal[e.id])} ${cur()} — استقطعها في مسير التسوية أو سجّل سدادها.`, `<span class="al-a">${btn('سجّل السداد', 'add', `data-s="advances" data-x="repay:${esc(e.id)}"`, 'sm')}</span>`]);
    for (const id of Object.keys(bal)) {
      if (!(bal[id] < -0.005)) continue;
      const e = id && S.employees.find((z) => z && z.id === id);
      out.push(['bad', `استُقطع من راتب ${e ? esc(e.name) : id ? 'موظف محذوف' : 'عامل غير مسجل'} في مسير الرواتب ${fmt(-bal[id])} ${cur()} أكثر من سلفه المسجلة — سجّل السلفة، أو عدّل «استقطاع سلفة» في المسير.`, btn('مسيرات الرواتب', 'go', 'data-v="staff"', 'sm')]);
    }
    return out;
  }
  // ─── سجلات تحتاج إلى تصحيح: تاريخ ناقص أو غير صالح (_bad)، أو فشل حسابها في الدفتر أو التكلفة ───
  const SECTION_NAME = {
    partners: 'شريك', capital: 'حركة رأس مال', assets: 'أصل', expenses: 'مصروف', employees: 'موظف', payroll: 'مسير رواتب',
    raw: 'مادة خام', purchases: 'فاتورة مشتريات', supplierPayments: 'سداد مورد', composites: 'منتج مجمّع', products: 'صنف في المنيو',
    sales: 'إقفال يومي', payouts: 'تحويل تطبيق', transfers: 'تحويل بين الصندوق والبنك', stockCounts: 'جرد', vatPayments: 'سداد ضريبة',
    cashCounts: 'جرد الصندوق', advances: 'سلفة عامل',
  };
  const FIELD_NAME = { date: 'التاريخ', startDate: 'بداية التغطية', endDate: 'تاريخ ترك العمل', month: 'الشهر' };
  const fieldName = (section, f) => (section === 'employees' && f === 'startDate' ? 'تاريخ المباشرة' : FIELD_NAME[f] || f);
  // سبب التعليم: الحقل ناقص أو قيمته الخام (معزولة الاتجاه فتظهر كما خُزّنت)
  const badWhy = (section, x) => (x._bad || []).map((f) => `${fieldName(section, f)} ${x[f] ? '«' + ltr(String(x[f])) + '» غير صالح' : 'ناقص'}`).join('، ');
  function badRecords() {
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
        if (x._bad) push(k, x, badWhy(k, x));
    for (const e of ledger().errors.concat(costing().errors.filter((x) => x.section))) {
      const rec = e.id !== undefined && e.id !== '' && find(e.section, e.id);
      if (rec) push(e.section, rec, 'تعذّر حسابه');
    }
    return out;
  }
  // وصف يميّز السجل للمستخدم: حسب نوعه (المسير بشهره وصافيه، الجرد بعدد أصنافه وقيمته، التحويل باتجاهه…)،
  // والمعرّف الداخلي آخر حل. السجل المعيب قد يفشل حسابه فلا يوقف ذلك القائمة
  const ACC_SHORT = { cash: 'الصندوق', bank: 'البنك' };
  function recLabel(section, x) {
    const parts = [];
    const add = (t) => t && parts.push(String(t));
    const amt = () => num(x.amount) && add(fmt(x.amount));
    try {
      switch (section) {
        case 'payroll': {
          const t = RB.payrollTotals(x);
          add(RB.isISOMonth(x.month) ? 'رواتب ' + RB.monthName(x.month) : '');
          add(t.count ? cnt(t.count, W.emp) : 'بلا موظفين');
          add(t.count ? 'الصافي ' + fmt(t.net) : '');
          add(x.note);
          break;
        }
        case 'stockCounts': {
          const n = (x.lines || []).length;
          add(n ? cnt(n, W.item) : 'بلا أصناف');
          add(n ? 'القيمة ' + fmt(RB.stockValue(x, S)) : '');
          add(x.note);
          break;
        }
        case 'transfers':
          add(ACC_SHORT[x.from] && ACC_SHORT[x.to] ? `من ${ACC_SHORT[x.from]} إلى ${ACC_SHORT[x.to]}` : '');
          amt();
          add(x.note);
          break;
        case 'sales': {
          const t = RB.saleTotal(x);
          add(t ? 'مبيعات ' + fmt(t) : '');
          add(x.note);
          break;
        }
        case 'payouts': {
          const c = S.settings.channels.find((ch) => ch.id === x.channelId);
          add(c && c.name);
          amt();
          break;
        }
        case 'capital': {
          const p = S.partners.find((y) => y.id === x.partnerId);
          add(p && p.name);
          add(x.type === 'withdrawal' ? 'سحب' : x.type === 'contribution' ? 'إيداع' : x.type === 'transfer' ? 'نقل حقوق' : '');
          amt();
          add(x.note);
          break;
        }
        case 'vatPayments':
          add(x.period);
          amt();
          break;
        case 'cashCounts':
          add(x.counted !== undefined && x.counted !== '' ? 'المعدود ' + fmt(x.counted) : '');
          add(num(x.diff) ? (num(x.diff) < 0 ? 'عجز ' : 'زيادة ') + fmt(Math.abs(num(x.diff))) : '');
          add(x.note);
          break;
        case 'advances': {
          const e = S.employees.find((y) => y.id === x.employeeId);
          add(e && e.name);
          add(x.kind === 'repay' ? 'سداد سلفة' : 'سلفة');
          amt();
          add(x.note);
          break;
        }
        case 'purchases': {
          add(x.supplier);
          add(x.invoiceNo ? 'فاتورة ' + x.invoiceNo : '');
          const t = RB.purchaseTotal(x);
          add(t ? fmt(t) : '');
          break;
        }
        case 'expenses':
          add(x.desc || (x.category && RB.expenseCat(x.category).name));
          amt();
          break;
        default:
          add(x.name || x.desc || x.supplier || x.entity || x.note);
          amt();
      }
      // التاريخ الصالح يميّز السجل أيضاً (غير الصالح يظهر في سبب التعليم)
      if (RB.DATED.includes(section) && RB.isISODate(x.date)) add(dtText(x.date));
    } catch (e) {
      /* يُكتفى بما جُمع */
    }
    return parts.join(' · ') || 'بلا وصف (المعرّف ' + ltr(String(x.id)) + ')';
  }
  // قائمة السجلات مع «تصحيح» و«حذف» لكل منها (withSection: يُذكر نوع السجل)
  const fixList = (list, withSection) =>
    `<ul class="fix-list">${list
      .slice(0, 30)
      .map((b) => `<li><span>${withSection ? `<b>${esc(SECTION_NAME[b.section] || b.section)}</b>: ` : ''}${esc(recLabel(b.section, b.rec))} — ${esc(b.why)}</span><span class="al-a">${btn('تصحيح', 'edit', `data-s="${esc(b.section)}" data-id="${esc(b.rec.id)}"`, 'sm')}${btn('حذف', 'del', `data-s="${esc(b.section)}" data-id="${esc(b.rec.id)}"`, 'sm ghost')}</span></li>`)
      .join('')}</ul>${list.length > 30 ? `<p class="note">وغيرها: ${cnt(list.length - 30, W.rec)}.</p>` : ''}`;
  // صندوق «بحاجة إلى تصحيح» في صفحة القسم
  const fixCard = (section) => {
    const list = badRecords().filter((b) => b.section === section);
    return list.length ? card('بحاجة إلى تصحيح', fixList(list, false), { cls: 'fix', sub: 'سجلات بتاريخ ناقص أو غير صالح: لا تدخل في الحسابات ولا في القوائم حتى تصححها أو تحذفها.' }) : '';
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
  // نسب الشريك السابقة: «حتى 31 ديسمبر 2025: 50%» لكل فترة
  const shareHistHTML = (p) => RB.shareHistory(p).map((h) => `<div class="muted sm">حتى ${dtText(h.until)}: ${pct(h.share, 0)}</div>`).join('');
  PAGES.partners = () => {
    const [from, asOf] = rangeToDate();
    const uses = RB.capitalUses(S, ledger());
    const rep = RB.partnersReport(S, from, asOf, ledger());
    let h = pageHead('الشركاء ورأس المال', 'رأس المال التأسيسي، مساهمة كل شريك، ونصيبه من الأرباح', btn('+ شريك', 'add', 'data-s="partners"') + btn('+ إيداع رأس مال', 'add', 'data-s="capital" data-x="contribution"', 'primary') + btn('+ سحب شريك', 'add', 'data-s="capital" data-x="withdrawal"'));
    h += card(
      'حصص الشركاء',
      table(
        [
          { h: 'الشريك', f: (r) => `<b>${esc(r.name)}</b>` },
          // النسبة في نهاية الفترة، وتحتها نسبه السابقة بتواريخها (RB.shareHistory)
          { h: 'النسبة<br>المتفق عليها', num: 1, f: (r) => pct(r.sharePct, 0) + shareHistHTML(S.partners.find((p) => p.id === r.id)) },
          { h: 'إجمالي<br>مساهمته', num: 1, f: (r) => N(r.contributed) },
          { h: 'منها دفعها<br>مباشرة', num: 1, f: (r) => N(r.direct) },
          { h: 'المطلوب<br>حسب نسبته', num: 1, f: (r) => N(r.required) },
          { h: 'الفرق', num: 1, f: (r) => (Math.abs(r.diff) < 0.5 ? '—' : `${N(r.diff)} ${r.diff > 0 ? chip('زيادة', 'good') : chip('ناقص', 'warn')}`) },
          { h: 'المسحوبات', num: 1, f: (r) => N(r.drawings) },
          { h: 'نصيبه من<br>ربح الفترة', num: 1, f: (r) => N(r.profitPeriod) },
          // نصيبه من الأرباح المتراكمة − مسحوباته؛ بالسالب مع مسحوبات: سحب من رأس ماله (وبلا مسحوبات: خسارة فقط)
          // (العناوين على سطرين، والشارة قصيرة، والهوامش أضيق ليتسع الجدول على شاشة 1280)
          { h: 'أرباح متاحة<br>للسحب', num: 1, f: (r) => N(r.undistributed) + (r.undistributed < -0.5 && r.drawings > 0.5 ? `<div class="sm" title="مسحوباته أكثر من نصيبه من الأرباح بمقدار ${fmt(-r.undistributed)}: الزيادة سحب من رأس ماله">${chip('من رأس المال', 'warn')}</div>` : '') },
          { h: 'رصيد<br>حقوقه', num: 1, f: (r) => N(r.equity) },
          { h: '', cls: 'acts', f: (r) => rowActs('partners', r.id) },
        ],
        rep.rows,
        { cards: 1, cls: 'dense', empty: 'أضف الشركاء أولاً مع نسبة كل شريك.', foot: ['الإجمالي', pct(rep.totalShare, 0), N(rep.totalCap), '', '', '', N(RB.sum(rep.rows, (r) => r.drawings)), N(rep.net), N(rep.undistributedTotal), N(RB.sum(rep.rows, (r) => r.equity)), ''] }
      ),
      { sub: `ربح الفترة يوزّع حسب النسب السارية في أيامه (${periodLabel()})، والنسبة المعروضة في ${dtText(asOf)}. «المسحوبات» و«أرباح متاحة للسحب» تراكمية من بداية الدفتر حتى ${dtText(asOf)}: نصيبه من الأرباح المتراكمة كلها (لا ربح الفترة) − كل مسحوباته. «رصيد حقوقه» = مساهمته − مسحوباته + نصيبه من الأرباح المتراكمة.` }
    );
    const useItems = uses.assets.map((a) => ({ label: a.name, v: a.amount }));
    if (uses.preopen.expenses) useItems.push({ label: 'مصاريف قبل الافتتاح (إيجار، رسوم، تأمين…)', v: uses.preopen.expenses });
    if (uses.preopen.purchases) useItems.push({ label: 'مشتريات المخزون الافتتاحي', v: uses.preopen.purchases });
    if (uses.preopen.payroll) useItems.push({ label: 'رواتب قبل الافتتاح', v: uses.preopen.payroll });
    if (uses.opPrepaid) useItems.push({ label: 'مدفوع مقدماً وسلف قائمة عند بدء الدفتر', v: uses.opPrepaid });
    h += `<div class="grid2">${card(
      'أين ذهب رأس المال التأسيسي؟',
      `<div class="pv-grid"><div><span>إجمالي رأس المال</span>${money(uses.sources)}</div><div><span>المصروف على التأسيس</span>${money(uses.used)}</div><div><span>المتبقي كرأس مال عامل</span>${money(uses.remaining)}</div></div>` +
        (uses.vatRecoverable > 0.005 ? `<p class="note">منها ضريبة مدخلات تُسترد بخصمها من ضريبة المبيعات: <b class="n">${fmt(uses.vatRecoverable)}</b> ${cur()}</p>` : '') +
        (uses.owedAtOpen > 0.005 ? `<p class="note">منها مستحق للموردين بالآجل لم يُسدد حتى الافتتاح: <b class="n">${fmt(uses.owedAtOpen)}</b> ${cur()} (مخصوم من المتبقي)</p>` : '') +
        (uses.laterAssets.count > 0 ? `<p class="note">أصول اشتُريت بعد الافتتاح (غير محسوبة من رأس المال التأسيسي): <b class="n">${fmt(uses.laterAssets.amount)}</b> ${cur()}</p>` : '') +
        // رأس المال التأسيسي ما وُجد حتى الافتتاح: ما أودعه الشركاء أو دفعوه من حساباتهم بعده للعلم، وما سحبوه قبله مخصوم
        (uses.preWithdrawals > 0.005 ? `<p class="note">منها مسحوبات الشركاء قبل الافتتاح (مخصومة من رأس المال): <b class="n">${fmt(uses.preWithdrawals)}</b> ${cur()}</p>` : '') +
        (uses.later.contributions + uses.later.direct > 0.005 ? `<p class="note">إيداعات الشركاء ومدفوعاتهم من حساباتهم بعد الافتتاح (غير محسوبة من رأس المال التأسيسي ولا من المتبقي): <b class="n">${fmt(uses.later.contributions + uses.later.direct)}</b> ${cur()}</p>` : '') +
        hbars(useItems, { total: uses.sources }),
      { sub: uses.open ? `رأس المال وما صُرف منه حتى تاريخ الافتتاح (${dtText(uses.open)})` : 'حدّد تاريخ الافتتاح في الإعدادات لفصل مصاريف ما قبل الافتتاح.' }
    )}${card(
      'حركة رأس المال',
      table(
        [
          { h: 'التاريخ', f: (r) => dt(r.date) },
          { h: 'الشريك', f: (r) => esc((S.partners.find((p) => p.id === r.partnerId) || {}).name || '—') },
          // الحساب تحت النوع (لا عمود له) ليتسع المبلغ في نصف الصفحة
          { h: 'النوع والحساب', f: (r) => (r.type === 'transfer' ? chip('نقل حقوق', 'accent') + `<div class="muted sm">إلى ${esc((S.partners.find((p) => p.id === r.toPartnerId) || {}).name || '—')}</div>` : (r.type === 'withdrawal' ? chip('سحب', 'warn') : chip('إيداع', 'good')) + `<div class="muted sm">${esc(RB.srcLabel(r.account, S))}</div>`) },
          { h: 'المبلغ', num: 1, cls: 'nw', f: (r) => N(r.amount) },
          { h: '', cls: 'acts', f: (r) => rowActs('capital', r.id) },
        ],
        good(S.capital).sort((a, b) => (a.date < b.date ? 1 : -1)),
        { cards: 1, empty: 'لا توجد إيداعات بعد.' }
      ),
      { sub: `المدفوع مباشرة من حساب شريك (أصل أو مصروف) يُضاف تلقائياً لرأس ماله: ${fmt(uses.direct + uses.later.direct)} ${cur()}` }
    )}</div>`;
    return h;
  };

  // ─── الأصول ───
  PAGES.assets = () => {
    const [from, to] = range();
    const asOf = minD(to, today());
    // الأصل المستبعد حتى asOf (بيع أو استرداد أو تخريد، RB.assetDisposal): خرج من الدفاتر فلا قيمة دفترية له، ولا يدخل
    // في التكلفة والإهلاك الحالي
    const rows = good(S.assets).map((a) => {
      const sch = RB.depSchedule(a, S);
      const accum = r2(RB.sum(sch.months.filter((m) => m.date <= asOf), (m) => m.amount));
      const d = RB.assetDisposal(a);
      const gone = !!d && d.date <= asOf;
      return { a, sch, accum, gone, disp: d, book: gone ? 0 : r2(sch.cost - accum) };
    });
    const cats = {};
    rows.forEach((r) => {
      if (r.gone) return;
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
    // متوسط الطلبات الشهري من أشهر التشغيل في الفترة (RB.opStart، كنقطة التعادل): أشهر ما قبل الافتتاح أو قبل بدء الدفتر
    // (للمطعم القائم، وأصوله بتواريخها القديمة تمد «كل الفترات» إليها) لا طلبات فيها فلا تدخل في القسمة
    const st = RB.opStart(S).first;
    const oFrom = st && st > from ? st : from;
    const sales = oFrom <= asOf ? RB.salesByChannel(S, oFrom, asOf) : null;
    const ordersPerMonth = sales ? sales.total.orders / RB.monthsIn(oFrom, asOf) : 0;
    let h = pageHead('الأصول والأثاث', 'معدات المطبخ والأثاث والأدوات والديكور، وتوزيع تكلفتها على أشهر التشغيل (الإهلاك)', btn('+ أصل جديد', 'add', 'data-s="assets"', 'primary'));
    h += `<div class="kpis small">
      ${kpi('تكلفة الأصول', money(RB.sum(catRows, (c) => c.cost)), cnt(RB.sum(catRows, (c) => c.n), W.asset) + (rows.some((r) => r.gone) ? ` · بلا المستبعدة (${cnt(rows.filter((r) => r.gone).length, W.asset)})` : ''))}
      ${kpi('الإهلاك الشهري الحالي', money(monthlyDep), 'يُحمّل على مصاريف كل شهر')}
      ${kpi('نصيب الطلب الواحد', money(ordersPerMonth ? monthlyDep / ordersPerMonth : 0), ordersPerMonth ? `على أساس ${cnt(ordersPerMonth, W.order, { gen: true })} شهرياً${oFrom > from ? ` منذ بداية التشغيل (${dtText(oFrom)})` : ''}` : 'يظهر بعد تسجيل المبيعات')}
      ${kpi('القيمة الدفترية الحالية', money(RB.sum(catRows, (c) => c.book)), 'التكلفة − الإهلاك المتراكم')}
    </div>`;
    h += fixCard('assets');
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
        { empty: rows.length ? 'لا أصول قائمة: كل الأصول المسجلة بيعت أو استُبعدت (في سجل الأصول أدناه).' : 'لم تُسجَّل أصول بعد. أضف معدات المطبخ والأثاث والأدوات.' }
      )
    );
    h += card(
      'سجل الأصول',
      table(
        [
          // بيع الأصل أو استرداد التأمين أو تخريده (FORMS.disposal): زره تحت اسمه، فلا يتسع عمود الأزرار ويبقى الجدول في 1280
          {
            h: 'الأصل',
            f: (r) =>
              `<b>${esc(r.a.name)}</b>${r.disp ? `<div>${chip((r.a.category === 'deposit' ? 'مُسترد ' : r.disp.proceeds ? 'مُباع ' : 'مُستبعد ') + dtText(r.disp.date), r.gone ? 'mute' : 'warn')}</div>` : ''}${r.a.note ? `<div class="muted sm">${esc(r.a.note)}</div>` : ''}<div><button type="button" class="btn sm ghost" data-act="dispose" data-id="${esc(r.a.id)}">${r.disp ? (r.a.category === 'deposit' ? 'تعديل الاسترداد' : 'تعديل الاستبعاد') : r.a.category === 'deposit' ? 'استرداد التأمين' : 'بيع أو استبعاد'}</button></div>`,
          },
          { h: 'التصنيف', f: (r) => esc(RB.assetCat(r.a.category).name) },
          { h: 'تاريخ الشراء', f: (r) => dt(r.a.date) },
          { h: 'التكلفة', num: 1, f: (r) => N(r.sch.cost) },
          { h: 'العمر', num: 1, f: (r) => (r.sch.life ? cnt(r.sch.life, W.month) : 'لا يُستهلك') },
          { h: 'الإهلاك الشهري', num: 1, f: (r) => N(r.sch.monthly) },
          { h: 'المتراكم', num: 1, f: (r) => N(r.accum) },
          { h: 'القيمة الدفترية', num: 1, f: (r) => N(r.book) },
          { h: 'الدفع من', f: (r) => `<span class="muted">${esc(RB.srcLabel(r.a.account, S))}</span>` },
          { h: '', cls: 'acts', f: (r) => rowActs('assets', r.a.id) },
        ],
        rows.sort((a, b) => (a.a.date < b.a.date ? 1 : -1)),
        { cards: 1 }
      ),
      { sub: `الإهلاك المتراكم حتى ${dtText(asOf)}. الأصول المشتراة قبل الافتتاح يبدأ إهلاكها من تاريخ الافتتاح، وما بعده من شهر شرائه. «بيع أو استبعاد» (و«استرداد التأمين»): الأصل يخرج من الدفاتر بتاريخه، ويتوقف إهلاكه، والفرق بين ثمنه وقيمته الدفترية ربح أو خسارة.` }
    );
    return h;
  };

  // ─── المصاريف التشغيلية ───
  PAGES.expenses = () => {
    const [from, to] = range();
    const exps = good(S.expenses);
    // فلتر محفوظ لتصنيف لم يعد موجوداً لا يُخفي القائمة كلها
    if (ui.expCat && !RB.EXPENSE_CATS.some((c) => c.id === ui.expCat)) ui.expCat = '';
    const inPer = exps.filter((x) => inRange(x.date));
    const list = inPer.filter((x) => !ui.expCat || x.category === ui.expCat).sort((a, b) => (a.date < b.date ? 1 : -1));
    const counts = {};
    inPer.forEach((x) => (counts[x.category] = (counts[x.category] || 0) + 1));
    // المدفوع مقابل المحمّل على الفترة (حتى اليوم) لكل تصنيف
    const asOf = minD(to, today());
    const b = RB.balances(ledger().entries, from, asOf);
    const catRows = RB.EXPENSE_CATS.map((c) => {
      // المدفوع قبل بدء الدفتر (رصيد افتتاحي) لم يُدفع في الفترة: يظهر في المحمّل وحده
      const paid = RB.sum(inPer.filter((x) => x.category === c.id && !RB.isOpeningExpense(x)), (x) => RB.vatSplit(x.amount, x.includesVat, x.taxable, S.settings).gross);
      return { c, paid, charged: b[c.acc] || 0 };
    }).filter((r) => r.paid || r.charged);
    // الإيجار والإهلاك يُحمّلان كاملين أول الشهر، فالشهر الجاري يُحسب شهراً كاملاً في المتوسط
    const months = RB.chargeMonths(from, asOf);
    let h = pageHead('المصاريف التشغيلية', 'إيجار المحل وسكن العمال والكهرباء والصيانة والتسويق وغيرها. المصروف المدفوع لعدة أشهر يُوزّع تلقائياً على أشهره.', btn('+ مصروف', 'add', 'data-s="expenses"', 'primary'));
    h += `<div class="quick">${['rent', 'housing', 'utilities', 'telecom', 'maintenance', 'marketing', 'cleaning'].map((k) => btn('+ ' + RB.expenseCat(k).name, 'add', `data-s="expenses" data-x="${k}"`, 'sm ghost')).join('')}</div>`;
    h += fixCard('expenses');
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
      { sub: '«المدفوع» شامل الضريبة كما خرج من الحساب. «المحمّل» هو نصيب الفترة من المصروف بدون ضريبة المدخلات التي تُخصم في الإقرار (مثلاً: إيجار 6 أشهر يُحمّل سدسه كل شهر). الرواتب والمشتريات في صفحاتها.' }
    );
    h += card('المدفوعات', filterChips('expCat', RB.EXPENSE_CATS, counts) + expensesTable(list, ui.expCat ? `لا توجد مصاريف من تصنيف «${esc(RB.expenseCat(ui.expCat).name)}» في هذه الفترة — اختر «الكل».` : 'لا توجد مصاريف في هذه الفترة.'), { actions: btn('تصدير CSV', 'csv', 'data-v="expenses"', 'sm ghost') });
    return h;
  };
  // شارات فلتر التصنيف: التصنيفات التي لها سجلات في الفترة، والمختار يبقى ظاهراً ولو صار عدده صفراً
  // (فلا يبقى فلتر مخفي يُفرغ القائمة). f: مفتاح الفلتر في ui
  function filterChips(f, cats, counts) {
    const items = [['', 'الكل']].concat(cats.filter((c) => counts[c.id] || c.id === ui[f]).map((c) => [c.id, `${c.name} (${counts[c.id] || 0})`]));
    return `<div class="chips">${items.map(([k, l]) => `<button type="button" class="fchip ${ui[f] === k ? 'on' : ''}" data-act="filter" data-f="${f}" data-v="${esc(k)}" aria-pressed="${ui[f] === k}">${esc(l)}</button>`).join('')}</div>`;
  }
  function expensesTable(list, empty) {
    return (
      table(
        [
          { h: 'التاريخ', f: (x) => dt(x.date) },
          { h: 'التصنيف', f: (x) => esc(RB.expenseCat(x.category).name) },
          { h: 'البيان', f: (x) => `${esc(x.desc || '')}${x.entity ? `<div class="muted sm">${esc(x.entity)}${empName(x.employeeId, ' · ')}</div>` : empName(x.employeeId, '<div class="muted sm">') }` },
          { h: 'المبلغ', num: 1, f: (x) => N(RB.vatSplit(x.amount, x.includesVat, x.taxable, S.settings).gross) },
          { h: 'الضريبة', num: 1, f: (x) => (x.taxable ? N(RB.vatSplit(x.amount, x.includesVat, x.taxable, S.settings).vat) : chip('غير خاضع', 'mute')) },
          { h: 'التغطية', f: (x) => (num(x.months) > 1 ? `${cnt(x.months, W.month)}<div class="muted sm">حتى ${dtText(RB.expenseCoverageEnd(x))}</div>` : 'شهر واحد' + (x.startDate && x.startDate.slice(0, 7) !== x.date.slice(0, 7) ? `<div class="muted sm">${esc(RB.monthName(x.startDate.slice(0, 7)))}</div>` : '')) },
          { h: 'الدفع من', f: (x) => `<span class="muted">${esc(RB.srcLabel(x.account, S, 'expenses'))}</span>` },
          { h: '', cls: 'acts', f: (x) => rowActs('expenses', x.id) },
        ],
        limitRows(list),
        { cards: 1, empty: empty || 'لا توجد مصاريف بهذا التصنيف في الفترة المحددة.' }
      ) + moreRows(list.length)
    );
  }

  // ─── الرسوم الحكومية ───
  PAGES.gov = () => {
    // كل ما يُتابع تجديده (RB.renewals: كل بند متكرر يغطي 3 أشهر فأكثر) — القائمة نفسها التي تنبّه لها لوحة المتابعة،
    // فلا يظهر تنبيه لبند (عقد نظافة أو صيانة) لا تجده هنا ولا يختلف العدّاد عن التنبيهات
    const rn = RB.renewals(S, today());
    // التكلفة السنوية للبنود المتكررة (المنتهية منها باقية): تكلفة آخر دفعة بدون الضريبة المستردة، محوّلة لسنة
    const annual = RB.sum(rn.filter((r) => RB.GOV_CATS.includes(r.rec.category)), (r) => (RB.costSplit(r.rec.amount, r.rec.includesVat, r.rec.taxable, S.settings, r.rec.date).cost * 12) / Math.max(1, num(r.rec.months)));
    const list = good(S.expenses).filter((x) => RB.GOV_CATS.includes(x.category) && inRange(x.date)).sort((a, b) => (a.date < b.date ? 1 : -1));
    let h = pageHead('الرسوم الحكومية والاشتراكات', 'السجل التجاري والبلدية والدفاع المدني والغرفة التجارية، ورسوم العمالة (قوى ومقيم)، والتأمين، والزكاة، واشتراكات الأنظمة، مع تنبيه قبل انتهاء كل منها — التأمينات الاجتماعية تُحسب من مسير الرواتب', btn('+ رسم أو اشتراك', 'add', 'data-s="expenses" data-x="gov"', 'primary'));
    const soon = rn.filter((r) => r.status !== 'ok').length;
    h += `<div class="kpis small">
      ${kpi('التكلفة السنوية التقديرية', money(annual), 'للرسوم والاشتراكات المتكررة')}
      ${kpi('ما يعادل شهرياً', money(annual / 12), 'يُوزّع على أشهر التغطية')}
      ${kpi('بنود تحتاج إلى تجديد', `<span class="n">${soon}</span>`, 'منتهية أو تنتهي خلال 30 يوماً', soon ? 'warn' : 'good')}
    </div>`;
    h += card(
      'متابعة التجديد',
      table(
        [
          { h: 'الحالة', f: (r) => (r.status === 'expired' ? chip('منتهي', 'bad') : r.status === 'soon' ? chip(r.days ? 'متبقٍّ ' + cnt(r.days, W.day) : 'ينتهي اليوم', 'warn') : chip('ساري', 'good')) },
          { h: 'البند', f: (r) => `<b>${esc(r.rec.desc || RB.expenseCat(r.rec.category).name)}</b><div class="muted sm">${esc(RB.expenseCat(r.rec.category).name)}</div>` },
          { h: 'الجهة', f: (r) => esc(r.rec.entity || '—') + empName(r.rec.employeeId, '<div class="muted sm">') },
          { h: 'آخر دفعة', f: (r) => dt(r.rec.date) },
          { h: 'المبلغ', num: 1, f: (r) => N(RB.vatSplit(r.rec.amount, r.rec.includesVat, r.rec.taxable, S.settings).gross) },
          { h: 'ينتهي في', f: (r) => dt(r.end) },
          { h: '', cls: 'acts', f: (r) => renewActs(r) },
        ],
        rn,
        { empty: 'لا توجد رسوم أو اشتراكات مسجلة. أضف السجل التجاري ورخصة البلدية وشهادة السلامة ورسوم العمالة.', rowCls: (r) => r.status }
      ),
      { sub: 'آخر تغطية لكل بند متكرر يغطي 3 أشهر فأكثر: الرسوم والاشتراكات والإيجار وسكن العمال وعقود النظافة والصيانة وغيرها، وهي نفسها تنبيهات التجديد في لوحة المتابعة. الرسوم لمرة واحدة وما يغطي أقل من 3 أشهر لا يُتابع.' }
    );
    h += card('مدفوعات الفترة', expensesTable(list));
    return h;
  };

  // ─── العمال والرواتب ───
  PAGES.staff = () => {
    const ym = today().slice(0, 7);
    const emps = S.employees.slice().sort((a, b) => (a.active === false) - (b.active === false));
    // على رأس العمل الآن (حالته في الشهر)، لا كل من له راتب في مسير الشهر
    const active = emps.filter((e) => RB.employeeStatus(e, ym) === 'active');
    const costs = Object.fromEntries(emps.map((e) => [e.id, RB.employeeMonthlyCost(e, S, ym)]));
    const saudi = active.filter((e) => e.nationality === 'saudi').length;
    // مخصص نهاية الخدمة المتراكم حتى اليوم (رصيد الحساب 2201) ونصيب كل موظف منه
    const eosb = RB.eosbBalances(S, today());
    const eosbTotal = -(RB.balances(ledger().entries, null, today())['2201'] || 0);
    // أرصدة سلف العمال حتى اليوم (رصيد الحساب 1106)
    const adv = RB.advanceBalances(S, today());
    let h = pageHead('العمال والرواتب', 'الرواتب والبدلات، التأمينات الاجتماعية، المقابل المالي والإقامات، والتكلفة الحقيقية لكل عامل', btn('+ موظف', 'add', 'data-s="employees"') + btn('+ سلفة', 'add', 'data-s="advances"') + btn('+ مسير رواتب', 'add', 'data-s="payroll"', 'primary'));
    h += `<div class="kpis small five">
      ${kpi('عدد العمال النشطين', `<span class="n">${active.length}</span>`, `سعوديون ${saudi} · غير سعوديين ${active.length - saudi}${active.length ? ' · نسبة التوطين ' + pct((saudi / active.length) * 100, 0) : ''}`)}
      ${kpi('الرواتب الشهرية', money(RB.sum(active, (e) => costs[e.id].salary)), 'الأساسي + البدلات')}
      ${kpi('التكلفة الشهرية الحقيقية', money(RB.sum(active, (e) => costs[e.id].total)), 'تشمل التأمينات والرسوم والسكن ونهاية الخدمة')}
      ${kpi('تأمينات المنشأة شهرياً', money(RB.sum(active, (e) => costs[e.id].gosi.er)), 'حسب النسب في الإعدادات')}
      ${kpi('مخصص نهاية الخدمة المتراكم', money(eosbTotal), 'يُستحق مع كل مسير رواتب')}
    </div>`;
    h += tabs('staffTab', [['emp', 'الموظفون'], ['payroll', 'مسيرات الرواتب'], ['adv', 'سلف العمال']], ui.staffTab);
    if (ui.staffTab === 'adv') {
      const list = good(S.advances).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      const owed = RB.r2(RB.sum(Object.values(adv)));
      h += card(
        'سلف العمال',
        table(
          [
            { h: 'التاريخ', f: (a) => dt(a.date) },
            { h: 'الموظف', f: (a) => `<b>${esc((S.employees.find((e) => e.id === a.employeeId) || {}).name || '—')}</b>` },
            { h: 'النوع', f: (a) => (a.kind === 'repay' ? chip('سداد نقدي', 'good') : chip('سلفة', 'warn')) },
            { h: 'المبلغ', num: 1, f: (a) => N(a.amount) },
            { h: 'من / إلى', f: (a) => `<span class="muted">${esc(RB.isOpeningAdvance(a) ? RB.OPENING_LABEL.advances : RB.PAY_LABEL[a.account === 'cash' ? 'cash' : 'bank'])}</span>` },
            { h: 'ملاحظة', f: (a) => esc(a.note || '') },
            { h: '', cls: 'acts', f: (a) => rowActs('advances', a.id) },
          ],
          limitRows(list),
          { cards: 1, empty: 'لا توجد سلف. اضغط «سلفة» لتسجيل مبلغ أعطيته لعامل من الصندوق أو البنك.' }
        ) + moreRows(list.length),
        { sub: `المستحق على العمال الآن: ${fmt(owed)} ${cur()}. السلفة أصل على العامل لا مصروف، وتُستقطع من راتبه في مسير الرواتب (عمود «استقطاع سلفة») فيبقى مصروف الرواتب كاملاً.` }
      );
      return h;
    }
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
            { h: 'تأمينات (موظف + منشأة)', num: 1, f: (p) => N(RB.payrollTotals(p).gosiEe + RB.payrollTotals(p).gosiEr) + (RB.isISODate(p.gosiDate) && p.gosiDate !== p.date ? `<div class="muted sm">تُسدَّد ${dtText(p.gosiDate)}</div>` : '') },
            // ما خرج من الحساب للموظفين: الصافي + مكافأة نهاية الخدمة المصروفة (مسير تسوية بلا راتب يظهر بمكافأته)
            { h: 'الصافي المصروف', num: 1, f: (p) => { const t = RB.payrollTotals(p); return N(t.netPaid + t.eosbPaid) + (t.eosbPaid ? `<div class="muted sm">منه نهاية الخدمة<br>${N(t.eosbPaid)}</div>` : '') + (t.adv ? `<div class="muted sm">بعد استقطاع سلف<br>${N(t.adv)}</div>` : ''); } },
            { h: 'التكلفة على المطعم', num: 1, f: (p) => N(RB.payrollTotals(p).cost) },
            { h: 'من', f: (p) => `<span class="muted">${esc(RB.srcLabel(p.account, S))}</span>` },
            { h: '', cls: 'acts', f: (p) => rowActs('payroll', p.id) },
          ],
          runs,
          { cards: 1, empty: 'لا توجد مسيرات رواتب. اضغط «مسير رواتب» ليتعبأ تلقائياً من بيانات الموظفين.' }
        ),
        { sub: 'التكلفة على المطعم = إجمالي الرواتب + حصة المنشأة في التأمينات. حصة الموظف تُخصم من راتبه وتُورّد مع حصة المنشأة. «الصافي المصروف» ما حُوّل للموظفين بعد استقطاع السلف، ويشمل مكافأة نهاية الخدمة المصروفة، وهي من مخصصها المتراكم فلا تدخل في التكلفة.' }
      );
      return h;
    }
    // المقابل المالي 700 بدل 800 إن كان السعوديون مساوين للوافدين أو أكثر
    const expats = active.filter((e) => e.nationality !== 'saudi');
    const al = [];
    if (expats.length && saudi >= expats.length && expats.some((e) => num(e.levyMonthly) >= 800)) al.push(['warn', 'عدد السعوديين ≥ الوافدين: قد يكون المقابل المالي 700 ر.س — راجع قوى.', '']);
    al.push(...advanceAlerts());
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
          // بالسالب: استُقطع من راتبه أكثر من سلفه (تنبيه في لوحة المتابعة)
          { h: 'سلف<br>مستحقة', num: 1, f: (e) => (Math.abs(adv[e.id] || 0) > 0.005 ? N(adv[e.id]) : '—') },
          { h: 'الحالة', f: (e) => { const st = RB.employeeStatus(e, ym); return st === 'active' ? chip('على رأس العمل', 'good') : chip(EMP_STATUS[st], st === 'future' ? 'accent' : 'mute'); } },
          { h: '', cls: 'acts', f: (e) => rowActs('employees', e.id, `<button type="button" class="icon-btn" data-act="empcost" data-id="${esc(e.id)}" aria-label="تفاصيل التكلفة" title="تفاصيل التكلفة">ⓘ</button>`) },
        ],
        emps,
        { cards: 1, empty: 'أضف العمال مع رواتبهم لحساب التأمينات والمقابل المالي والتكلفة الحقيقية.' }
      ),
      { sub: 'المقابل المالي ورسوم الإقامة تُسجَّل كدفعات فعلية في «الرسوم الحكومية» عند السداد؛ هنا تقدير شهري لتكلفة العامل.' }
    );
    return h;
  };

  // ─── المشتريات ───
  PAGES.purchases = () => {
    const [, to] = range();
    if (ui.purCat && !RB.PURCHASE_CATS.some((c) => c.id === ui.purCat)) ui.purCat = '';
    const all = good(S.purchases).filter((p) => inRange(p.date));
    const list = all.filter((p) => !ui.purCat || p.category === ui.purCat).sort((a, b) => (a.date < b.date ? 1 : -1));
    // ضريبة المدخلات حسب تاريخ الفاتورة: قبل سريان التسجيل (أو بدونه) جزء من التكلفة لا تُخصم.
    // تُحسب مرة لكل فاتورة (المجاميع وخانات الجدول الثلاث)
    const spMap = new Map();
    const sp = (p) => {
      let v = spMap.get(p);
      if (!v) spMap.set(p, (v = RB.costSplit(RB.purchaseTotal(p), p.includesVat, p.taxable, S.settings, p.date)));
      return v;
    };
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
      ${kpi('إجمالي المشتريات', money(taxable + exempt), `${cnt(all.length, W.invoice)} في الفترة`)}
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
    const filt = filterChips('purCat', RB.PURCHASE_CATS, counts);
    h += card(
      'الفواتير',
      filt +
        table(
          [
            { h: 'التاريخ', f: (p) => dt(p.date) },
            // المرتجع أو الإشعار الدائن (إجمالي سالب) يُميَّز عن فواتير الشراء
            { h: 'المورد', f: (p) => `<b>${esc(p.supplier || '—')}</b>${RB.purchaseTotal(p) < 0 ? ' ' + chip('مرتجع', 'warn') : ''}${p.invoiceNo ? `<div class="muted sm">فاتورة ${esc(p.invoiceNo)}</div>` : ''}` },
            { h: 'التصنيف', f: (p) => esc(RB.purchaseCat(p.category).name) },
            { h: 'الأصناف', f: (p) => `<span class="muted sm">${esc((p.lines || []).map((l) => l.desc || RB.itemName(S, 'raw', l.rawId)).slice(0, 3).join('، '))}${(p.lines || []).length > 3 ? '…' : ''}</span>` },
            { h: 'الدفع', f: (p) => (p.account === 'payable' ? chip('آجل', 'warn') : p.account === 'cash' ? chip('الكاشير', 'mute') : p.account === 'bank' ? chip('البنك', 'mute') : chip(esc(RB.srcLabel(p.account, S)), 'accent')) },
            { h: 'الضريبة', f: (p) => (p.taxable ? chip('خاضعة', 'good') : chip('غير خاضعة', 'mute')) },
            { h: 'قبل الضريبة', num: 1, f: (p) => N(sp(p).net) },
            { h: 'الضريبة', num: 1, f: (p) => N(sp(p).vat) },
            { h: 'الإجمالي', num: 1, f: (p) => `<b>${N(sp(p).gross)}</b>` },
            { h: '', cls: 'acts', f: (p) => rowActs('purchases', p.id) },
          ],
          limitRows(list),
          { cards: 1, empty: ui.purCat ? `لا توجد فواتير من تصنيف «${esc(RB.purchaseCat(ui.purCat).name)}» في هذه الفترة — اختر «الكل».` : 'لا توجد فواتير في هذه الفترة.' }
        ) +
        moreRows(list.length),
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
          { h: '', cls: 'acts', f: (r) => (r.balance > 0.005 ? btn('سداد', 'add', `data-s="supplierPayments" data-x="${esc(r.supplier)}"`, 'sm') : r.balance < -0.005 ? chip('دفعة زائدة', 'warn') : chip('مسدد', 'good')) },
        ],
        sb,
        { empty: 'لا توجد مستحقات آجلة.' }
      ) +
        (good(S.supplierPayments).length
          ? `<h3 class="sub-h">دفعات السداد</h3>` +
            table(
              [
                { h: 'التاريخ', f: (p) => dt(p.date) },
                { h: 'المورد', f: (p) => esc(p.supplier) },
                { h: 'من', f: (p) => esc(RB.srcLabel(p.account, S)) },
                { h: 'المبلغ', num: 1, f: (p) => N(p.amount) },
                { h: '', cls: 'acts', f: (p) => rowActs('supplierPayments', p.id) },
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
            // جرد قبل بدء الدفتر والأرصدة الافتتاحية فيها قيمة المخزون: لا يدخل الحسابات (RB.stockCountSkipped)
            { h: 'التاريخ', f: (c) => dt(c.date) + (RB.stockCountSkipped(S, c) ? `<div>${chip('قبل بدء الدفتر — لا يدخل', 'mute')}</div>` : '') },
            { h: 'عدد الأصناف', num: 1, f: (c) => (c.lines || []).filter((l) => num(l.qty)).length },
            { h: 'قيمة المخزون', num: 1, f: (c) => `<b>${N(RB.stockValue(c, S))}</b>` },
            { h: 'ملاحظات', f: (c) => esc(c.note || '') },
            { h: '', cls: 'acts', f: (c) => rowActs('stockCounts', c.id) },
          ],
          good(S.stockCounts).sort((a, b) => (a.date < b.date ? 1 : -1)),
          { empty: 'سجّل جرد آخر الشهر لتصبح تكلفة المواد دقيقة: تكلفة المواد = المشتريات − الزيادة في المخزون.' }
        ),
        { sub: 'قيمة الجرد = الكمية الموجودة × سعر وحدة الشراء. الفرق بين جرد وآخر يعدّل تكلفة المواد في قائمة الدخل.' + (RB.isVatReg(S.settings, today()) ? '' : ' المطعم غير مسجل في الضريبة: قيمة الجرد تشمل الضريبة للمواد الخاضعة لأنها جزء من التكلفة') }
      );
      return h;
    }
    const rows = S.raw.slice().sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name, 'ar'));
    // السعر السابق من الفواتير ونسبة التغيّر، وارتفاع أكثر من 5% بشارة تنبيه. سعر عُدّل يدوياً يُقارن بآخر فاتورة
    const priceCell = (r) => {
      const h = RB.rawPriceHistory(S, r.id);
      if (h.length && Math.abs(h[0].priceNet - num(r.price)) > 0.004) return N(r.price) + `<div class="muted sm">آخر فاتورة ${fmt(h[0].priceNet)}</div>`;
      const c = RB.rawPriceChange(S, r.id);
      if (!c) return N(r.price);
      const p = `<span class="n">${c.pct > 0 ? '+' : ''}${c.pct.toFixed(1)}%</span>`;
      return N(r.price) + `<div class="muted sm">السابق ${fmt(c.prev)} ${c.pct > 5 ? chip(p, 'warn') : `(${p})`}</div>`;
    };
    h += card(
      'قائمة المواد',
      table(
        [
          { h: 'المادة', f: (r) => `<b>${esc(r.name)}</b><div class="muted sm">${esc(r.category || '')}${r.supplier ? ' · ' + esc(r.supplier) : ''}</div>` },
          { h: 'وحدة الشراء', f: (r) => `${esc(r.buyUnit || '')}<div class="muted sm">= ${fmtQ(r.packQty)} ${esc(r.useUnit)}</div>` },
          { h: 'سعر الشراء', num: 1, f: priceCell },
          { h: 'الهدر', num: 1, f: (r) => (num(r.wastePct) ? pct(r.wastePct, 0) : '—') },
          { h: 'الضريبة', f: (r) => (r.taxable ? chip('خاضعة', 'good') : chip('غير خاضعة', 'mute')) },
          { h: 'تكلفة وحدة الاستخدام', num: 1, f: (r) => `<b class="n">${(C.raw[r.id] || 0).toFixed(4)}</b><div class="muted sm">لكل 1 ${esc(r.useUnit)}</div>` },
          { h: 'تستخدم في', num: 1, f: (r) => usedIn(r.id) || '—' },
          { h: '', cls: 'acts', f: (r) => rowActs('raw', r.id) },
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
          { h: '', cls: 'acts', f: (c) => rowActs('composites', c.id, `<button type="button" class="icon-btn" data-act="view" data-s="composites" data-id="${esc(c.id)}" aria-label="تفاصيل التكلفة" title="تفاصيل التكلفة">ⓘ</button>`) },
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
    // أعلى من المستهدف، ومنها ما يزيد عليه بأكثر من 3 نقاط (شارته حمراء ويظهر في التنبيهات)
    const above = act.filter((r) => fcLevel(r.st.foodCost, target) !== 'good').length;
    const far = act.filter((r) => fcLevel(r.st.foodCost, target) === 'bad').length;
    // بلا صنف مفعّل مسعّر: لا متوسط ولا «كل الأصناف ضمن المستهدف»
    const noAct = rows.length ? 'يظهر حين يوجد صنف مفعّل له سعر' : 'يظهر بعد إضافة أصناف المنيو';
    let h = pageHead('المنيو والتسعير', 'تكلفة كل صنف وسعر بيعه، ومقارنته بأسعار السوق المحلي وبصافي ربحه في تطبيقات التوصيل', btn('+ صنف في المنيو', 'add', 'data-s="products"', 'primary'));
    h += `<div class="kpis small">
      ${kpi('أصناف المنيو', `<span class="n">${act.length}</span>`, `${rows.length - act.length} غير مفعّل`)}
      ${kpi('متوسط تكلفة الطعام', act.length ? pct(avgFc) : '<span class="n">—</span>', act.length ? `المستهدف ${pct(target, 0)}` : noAct, act.length ? fcLevel(avgFc, target) : '')}
      ${kpi('أعلى من المستهدف', `<span class="n">${above}</span>`, !act.length ? noAct : above ? `منها ${far} بفارق أكثر من 3 نقاط` : 'كل الأصناف ضمن المستهدف', far ? 'bad' : above ? 'warn' : act.length ? 'good' : '')}
      ${kpi('متوسط عمولة التطبيقات', pct(RB.appChannels(S).length ? RB.sum(RB.appChannels(S), (c) => num(c.feePct)) / RB.appChannels(S).length : 0), 'تعدّلها من الإعدادات')}
    </div>`;
    // الصنف غير المفعّل لا يدخل في المؤشرات ولا التنبيهات: شارته باهتة
    const fcChip = (r) => chip(pct(r.st.foodCost), r.p.active === false ? 'mute' : fcLevel(r.st.foodCost, target));
    h += card(
      'الأصناف',
      table(
        [
          { h: 'الصنف', f: (r) => `<b>${esc(r.p.name)}</b>${r.p.active === false ? ' ' + chip('غير مفعّل', 'mute') : ''}<div class="muted sm">${esc(r.p.category || '')}${(r.p.items || []).some((i) => i.kind === 'prod') ? ' · وجبة مركّبة' : ''}</div>` },
          { h: 'التكلفة', num: 1, f: (r) => N(r.st.cost) },
          { h: 'سعر البيع', num: 1, f: (r) => `<b>${N(r.st.price)}</b>` },
          { h: 'تكلفة الطعام', num: 1, f: (r) => (r.st.price ? fcChip(r) : '—') },
          { h: 'ربح الحبة', num: 1, f: (r) => N(r.st.profit) },
          { h: 'السعر المقترح', num: 1, f: (r) => (r.st.suggested ? `${N(r.st.suggested)}${r.st.suggested > r.st.price + 0.01 ? '<div class="muted sm">لتحقيق المستهدف</div>' : ''}` : '—') },
          { h: 'متوسط السوق', num: 1, f: (r) => (r.st.market ? `${N(r.st.market.avg)}<div class="sm">${r.st.vsMarket > 5 ? chip('أغلى ' + pct(r.st.vsMarket, 0), 'warn') : r.st.vsMarket < -5 ? chip('أرخص ' + pct(-r.st.vsMarket, 0), 'accent') : chip('مماثل', 'good')}</div>` : '<span class="muted">—</span>') },
          { h: 'سعر التطبيقات', num: 1, f: (r) => N(r.st.appPrice) },
          { h: 'ربحه في التطبيقات', num: 1, f: (r) => (r.st.avgApp ? `${N(r.st.avgApp.profit)}<div class="muted sm">هامش ${pct(r.st.avgApp.margin, 0)}</div>` : '—') },
          { h: '', cls: 'acts', f: (r) => rowActs('products', r.p.id, `<button type="button" class="icon-btn" data-act="view" data-s="products" data-id="${esc(r.p.id)}" aria-label="تحليل الصنف" title="تحليل الصنف">ⓘ</button>`) },
        ],
        rows,
        { cards: 1, empty: 'أضف أصناف المنيو وحدّد مكونات كل صنف (مواد خام أو منتجات مجمّعة) وسعر البيع.', rowCls: (r) => (r.p.active === false ? 'off' : '') }
      ),
      { sub: `${RB.isVatReg(S.settings, today()) ? `الأسعار شاملة ضريبة ${pct(S.settings.vatRate, 0)}. تكلفة الطعام = التكلفة ÷ السعر بدون الضريبة.` : 'المطعم غير مسجل في الضريبة: الأسعار بدون ضريبة وتكلفة الطعام = التكلفة ÷ السعر.'} السعر المقترح يحقق المستهدف (${pct(target, 0)}) مقرّباً لأعلى. ربح التطبيقات بعد خصم متوسط العمولة.` }
    );
    return h;
  };

  // ─── المبيعات ───
  PAGES.sales = () => {
    const [from, to] = range();
    const sales = RB.salesByChannel(S, from, to);
    // مطعم غير مسجل في الضريبة طوال الفترة: لا «شاملة الضريبة» ولا خانة ضريبة المبيعات (ما لم تكن فيها ضريبة فعلاً)
    const showVat = vatIn(to) || Math.abs(sales.total.vat) >= 0.005;
    let h = pageHead('المبيعات اليومية', `إقفال كل يوم حسب القناة: كاش، شبكة، وتطبيقات التوصيل — مع العمولات${showVat ? ' والضريبة' : ''} وتحويلات التطبيقات`, btn('+ تحويل من تطبيق', 'add', 'data-s="payouts"') + btn('+ إقفال يومي', 'add', 'data-s="sales"', 'primary'));
    h += `<div class="kpis small">
      ${kpi('المبيعات' + (showVat ? ' شاملة الضريبة' : ''), money(sales.total.gross), periodLabel())}
      ${showVat ? kpi('ضريبة المبيعات', money(sales.total.vat), '') : ''}
      ${kpi('عمولات ورسوم', money(sales.total.fee), 'التطبيقات والشبكة شاملة ضريبتها')}
      ${
        // الطلبات اختيارية في الإقفال: بلا عدد مسجل لا «0 طلب» ولا «متوسط 0.00»
        sales.total.orders || !sales.total.gross
          ? kpi('عدد الطلبات', N0(sales.total.orders), sales.total.orders ? `متوسط الفاتورة ${fmt(sales.total.avgTicket)} ${cur()}` : '')
          : kpi('عدد الطلبات', '<span class="n">—</span>', 'لم يُسجَّل في الإقفالات، فلا متوسط للفاتورة')
      }
    </div>`;
    h += card(
      'حسب القناة',
      table(
        [
          { h: 'القناة', f: (c) => `<b>${esc(c.name)}</b><div class="muted sm">${esc(RB.CHANNEL_TYPES[c.type] || '')}</div>` },
          { h: 'الطلبات', num: 1, f: (c) => N0(c.orders) },
          { h: 'المبيعات', num: 1, f: (c) => N(c.gross) },
          { h: 'الحصة', num: 1, f: (c) => pct(sales.total.gross ? (c.gross / sales.total.gross) * 100 : 0, 0) },
          ...(showVat ? [{ h: 'الضريبة', num: 1, f: (c) => N(c.vat) }] : []),
          { h: 'العمولة', num: 1, f: (c) => N(c.fee) },
          { h: 'الصافي الواصل', num: 1, f: (c) => `<b>${N(c.receive)}</b>` },
          { h: 'متوسط الطلب', num: 1, f: (c) => (c.orders ? N(c.avgTicket) : '<span class="n">—</span>') },
        ],
        sales.list,
        { foot: ['الإجمالي', N0(sales.total.orders), N(sales.total.gross), pct(100, 0), ...(showVat ? [N(sales.total.vat)] : []), N(sales.total.fee), N(RB.sum(sales.list, (c) => c.receive)), sales.total.orders ? N(sales.total.avgTicket) : '<span class="n">—</span>'] }
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
            { h: '', cls: 'acts', f: (a) => btn('سجّل تحويل', 'add', `data-s="payouts" data-x="${esc(a.id)}"`, 'sm') },
          ],
          RB.appReceivables(S, asOf),
          { empty: 'لا توجد مبيعات تطبيقات.' }
        ),
        { sub: `حتى ${dtText(asOf)}. الرصيد = المبيعات − العمولة وضريبتها − ما حُوّل للبنك − الخصومات. إن حوّل التطبيق مبلغاً أقل سجّل الفرق في «خصومات» واختر نوعه: العرض أو المرتجع على الطلبات يخفض المبيعات (في قائمة الدخل والإقرار) وضريبتها، ورسوم الإعلان أو الخدمة بفاتورة ضريبية مصروف تُسترد ضريبته، والغرامة أو التسوية مصروف بلا ضريبة.` }
      );
      const pays = good(S.payouts).filter((p) => inRange(p.date)).sort((a, b) => (a.date < b.date ? 1 : -1));
      h += card(
        'التحويلات',
        table(
          [
            { h: 'التاريخ', f: (p) => dt(p.date) },
            { h: 'التطبيق', f: (p) => esc((RB.channelOf(S, p.channelId) || {}).name || p.channelId) },
            { h: 'المبلغ المحوّل', num: 1, f: (p) => N(p.amount) },
            { h: 'خصومات', num: 1, f: (p) => N(p.deductions) + (num(p.deductions) ? `<div class="muted sm">${esc((RB.DED_TYPES[p.dedType] || RB.DED_TYPES.other).short)}</div>` : '') },
            { h: 'ملاحظات', f: (p) => esc(p.note || '') },
            { h: '', cls: 'acts', f: (p) => rowActs('payouts', p.id) },
          ],
          limitRows(pays)
        ) + moreRows(pays.length)
      );
      return h;
    }
    const days = good(S.sales).filter((s) => inRange(s.date)).sort((a, b) => (a.date < b.date ? 1 : -1));
    const chs = S.settings.channels.filter((c) => c.active !== false || days.some((s) => s.channels && s.channels[c.id]));
    const showApps = chs.filter((c) => c.type === 'app');
    const compact = showApps.length > 3;
    // الإجمالي بعد اليوم مباشرة: يبقى ظاهراً دون تمرير، وفي بطاقة الجوال يأتي في سطرها الأول
    const cols = [
      { h: 'اليوم', f: (s) => `${dt(s.date)}<div class="muted sm">${['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][RB.weekday(s.date)]}</div>` },
      { h: 'الإجمالي', num: 1, f: (s) => `<b>${N(RB.saleTotal(s))}</b>` },
    ];
    chs.filter((c) => c.type !== 'app' || !compact).forEach((c) => cols.push({ h: esc(c.name), num: 1, f: (s) => (s.channels && s.channels[c.id] ? N(s.channels[c.id].amount) : '—') }));
    if (compact) cols.push({ h: 'التطبيقات', num: 1, f: (s) => N(RB.sum(showApps, (c) => num(s.channels && s.channels[c.id] && s.channels[c.id].amount))) });
    cols.push({ h: 'الطلبات', num: 1, f: (s) => N0(RB.saleOrders(s)) });
    cols.push({ h: '', cls: 'acts', f: (s) => rowActs('sales', s.id) });
    h += card('الإقفالات اليومية', table(cols, limitRows(days), { cards: 1, empty: 'لا توجد إقفالات في هذه الفترة. اضغط «إقفال يومي» وأدخل مبيعات كل قناة.' }) + moreRows(days.length), { actions: btn('تصدير CSV', 'csv', 'data-v="sales"', 'sm ghost'), sub: showVat ? 'المبالغ شاملة الضريبة.' : '' });
    // الأيام المعلَّمة «كان مغلقاً» في مدة تنبيه الأيام بلا إقفال (آخر 30 يوماً): «إلغاء» يعيد تنبيه اليوم إن عُلّم خطأً.
    // يوم سُجّل إقفاله (من هذا الجهاز أو جهاز الشريك، قبل العلامة أو بعدها) لا يُعرض مغلقاً
    const lo = RB.addDays(today(), -31);
    const hasSale = new Set(good(S.sales).map((z) => z.date));
    const closed = (S.settings.closedDays || []).filter((d) => RB.isISODate(d) && d >= lo && !hasSale.has(d)).sort().reverse();
    if (closed.length)
      h += card(
        'أيام كان المطعم فيها مغلقاً',
        `<ul class="closed-days">${closed.map((d) => `<li>${dt(d)} ${btn('إلغاء', 'unclosedDay', `data-d="${esc(d)}" aria-label="${esc('إلغاء علامة «كان مغلقاً» عن ' + dtText(d))}"`, 'sm ghost')}</li>`).join('')}</ul>`,
        { cls: 'closed-card', sub: 'لا يُنبَّه إلى أنها بلا إقفال يومي. «إلغاء» يعيد التنبيه لليوم إن عُلّم خطأً.' }
      );
    return h;
  };

  // ─── الصندوق والبنك ───
  PAGES.cash = () => {
    const [from, asOf] = rangeToDate();
    const L = ledger();
    const bal = RB.balances(L.entries, null, asOf);
    const acc = ui.cashAcc === '1102' ? '1102' : '1101';
    const st = RB.accountStatement(S, acc, from, asOf, L);
    let h = pageHead('الصندوق والبنك', 'كل حركة تدخل أو تخرج من الكاشير والحساب البنكي، مع الرصيد بعد كل حركة', btn('+ جرد الصندوق', 'add', 'data-s="cashCounts"') + btn('سحب من البنك للصندوق', 'add', 'data-s="transfers" data-x="bank"') + btn('+ إيداع الكاش في البنك', 'add', 'data-s="transfers" data-x="cash"', 'primary'));
    h += `<div class="kpis small">
      ${kpi('الصندوق (الكاشير)', money(bal['1101'] || 0), 'حتى ' + dtText(asOf), (bal['1101'] || 0) < 0 ? 'bad' : '')}
      ${kpi('الحساب البنكي', money(bal['1102'] || 0), 'حتى ' + dtText(asOf), (bal['1102'] || 0) < 0 ? 'bad' : '')}
      ${kpi('مستحقات التطبيقات', money(bal['1103'] || 0), 'تتحول للبنك لاحقاً')}
      ${kpi('مستحق للموردين', money(-(bal['2101'] || 0)), 'مشتريات آجلة')}
    </div>`;
    h += tabs('cashAcc', [['1101', 'كشف الصندوق'], ['1102', 'كشف البنك'], ['counts', 'جرد الصندوق'], ['transfers', 'التحويلات']], ['counts', 'transfers'].includes(ui.cashAcc) ? ui.cashAcc : acc);
    // التحويلات بين الصندوق والبنك: قائمة لتعديلها أو حذفها (في الكشف تظهر حركة في كل حساب)
    if (ui.cashAcc === 'transfers') {
      const list = good(S.transfers).filter((x) => inRange(x.date)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      h += card(
        'التحويلات بين الصندوق والبنك',
        table(
          [
            { h: 'التاريخ', f: (x) => dt(x.date) },
            { h: 'من ← إلى', f: (x) => `${esc(RB.PAY_LABEL[x.from] || x.from || '')} ← ${esc(RB.PAY_LABEL[x.to] || x.to || '')}` },
            { h: 'المبلغ', num: 1, f: (x) => `<b>${N(x.amount)}</b>` },
            { h: 'ملاحظة', f: (x) => esc(x.note || '') },
            { h: '', cls: 'acts', f: (x) => rowActs('transfers', x.id) },
          ],
          limitRows(list),
          { cards: 1, empty: 'لا توجد تحويلات في هذه الفترة. «إيداع الكاش في البنك» ينقل النقد من الصندوق إلى الحساب البنكي.' }
        ) + moreRows(list.length),
        { sub: periodLabel() }
      );
      return h;
    }
    if (ui.cashAcc === 'counts') {
      const list = good(S.cashCounts).filter((c) => inRange(c.date)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      // جرد تغيّر الدفتر بعده (حركة نقدية بتاريخه أو قبله سُجّلت بعد حفظه): فرقه المسجل لم يعد صحيحاً
      const stale = new Map(RB.staleCashCounts(S, L).map((x) => [x.count.id, x.expected]));
      const diffCell = (c) => {
        const d = num(c.diff);
        const st = stale.has(c.id) ? `<div class="muted sm">${chip('تغيّر الدفتر بعد الجرد', 'warn')} المتوقع الآن ${fmt(stale.get(c.id))} — افتح الجرد (✎) واحفظه لتحديث الفرق</div>` : '';
        return (Math.abs(d) < 0.01 ? chip('مطابق', 'good') : `${N(d)} ${d < 0 ? chip('عجز', 'warn') : chip('زيادة', 'good')}`) + st;
      };
      const net = RB.r2(RB.sum(list, (c) => num(c.diff)));
      h += card(
        'جرد الصندوق',
        table(
          [
            { h: 'التاريخ', f: (c) => dt(c.date) + (c.note ? `<div class="muted sm">${esc(c.note)}</div>` : '') },
            { h: 'المتوقع', num: 1, f: (c) => N(c.expected) },
            { h: 'المعدود', num: 1, f: (c) => `<b>${N(c.counted)}</b>` },
            { h: 'الفرق', num: 1, f: diffCell },
            { h: '', cls: 'acts', f: (c) => rowActs('cashCounts', c.id) },
          ],
          limitRows(list),
          { cards: 1, empty: 'لا يوجد جرد للصندوق في هذه الفترة. بعد الإقفال اليومي عُدّ النقد في الدرج وسجّله من «جرد الصندوق».', foot: list.length ? ['صافي الفروق', '', '', N(net), ''] : null }
        ) + moreRows(list.length),
        { sub: `${periodLabel()} · المتوقع = رصيد الصندوق في الدفتر نهاية اليوم. الفرق يُسجَّل في «عجز وزيادة الصندوق» (العجز مصروف) فيصبح رصيد الصندوق = المعدود.` }
      );
      return h;
    }
    const rows = st.rows.slice().reverse();
    h += card(
      RB.ACC[acc].name,
      `<div class="pv-grid"><div><span>رصيد أول الفترة</span>${money(st.opening)}</div><div><span>الداخل</span>${money(st.totIn)}</div><div><span>الخارج</span>${money(st.totOut)}</div><div><span>رصيد آخر الفترة</span>${money(st.closing)}</div></div>` +
        table(
          [
            { h: 'التاريخ', f: (r) => dt(r.date) },
            { h: 'البيان', f: (r) => esc(r.desc) },
            { h: 'داخل', num: 1, f: (r) => (r.in ? N(r.in, 'pos') : '') },
            { h: 'خارج', num: 1, f: (r) => (r.out ? N(r.out) : '') },
            { h: 'الرصيد', num: 1, f: (r) => N(r.balance) },
            { h: '', cls: 'acts', f: (r) => (r.ref && r.ref.s ? `<button type="button" class="icon-btn" data-act="edit" data-s="${esc(r.ref.s)}" data-id="${esc(r.ref.id)}" aria-label="فتح العملية" title="فتح العملية">↗</button>` : '') },
          ],
          rows.slice(0, 400),
          { cards: 1, empty: 'لا توجد حركات في هذه الفترة.' }
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
    const inc = RB.incomeStatement(S, from, asOf, ledger());
    const rev = inc.revenue;
    // بلا مبيعات في الفترة (قبل الافتتاح، أو شهر مغلق): النسب من المبيعات «—» لا «100%» و«0.0%» (كلوحة المتابعة)
    const dashN = '<span class="n">—</span>';
    const P = (x) => (rev ? pct((x / rev) * 100) : dashN);
    const G = (g, label) => (inc.groups[g].length ? `<tr class="grp"><td colspan="3">${label}</td></tr>${lineRows(inc.groups[g], rev, 'إجمالي ' + label)}` : '');
    const body = `<div class="tbl-wrap"><table class="tbl stmt"><thead><tr><th>البند</th><th class="num">المبلغ (${cur()})</th><th class="num">من المبيعات</th></tr></thead><tbody>
      <tr class="grp"><td colspan="3">الإيرادات</td></tr>
      ${
        // عروض ومرتجعات التطبيقات (4102) تخفض المبيعات: صافي المبيعات = أساس الإقرار، والنسب منه
        Math.abs(inc.salesDeductions) >= 0.005
          ? `<tr><td class="ind">${salesLbl('المبيعات', asOf)}</td><td class="num">${N(inc.grossSales)}</td><td class="num muted">${P(inc.grossSales)}</td></tr><tr><td class="ind">ناقص: خصومات ومرتجعات المبيعات (عروض التطبيقات)</td><td class="num">${N(-inc.salesDeductions)}</td><td class="num muted">${P(-inc.salesDeductions)}</td></tr><tr class="sum"><td>صافي المبيعات</td><td class="num">${N(rev)}</td><td class="num muted">${rev ? pct(100, 0) : dashN}</td></tr>`
          : `<tr><td class="ind">${salesLbl('المبيعات', asOf)}</td><td class="num">${N(rev)}</td><td class="num muted">${rev ? pct(100, 0) : dashN}</td></tr>`
      }
      ${G('cogs', RB.GROUPS.cogs)}
      <tr class="total"><td>مجمل الربح</td><td class="num">${N(inc.grossProfit)}</td><td class="num">${P(inc.grossProfit)}</td></tr>
      ${G('sell', RB.GROUPS.sell)}${G('labor', RB.GROUPS.labor)}${G('occ', RB.GROUPS.occ)}${G('opex', RB.GROUPS.opex)}${G('dep', RB.GROUPS.dep)}${G('disp', RB.GROUPS.disp)}
      <tr class="total ${inc.netBeforeZakat < 0 ? 'neg' : ''}"><td>صافي الربح قبل الزكاة</td><td class="num">${N(inc.netBeforeZakat)}</td><td class="num">${P(inc.netBeforeZakat)}</td></tr>
      ${inc.groups.zakat.length ? lineRows(inc.groups.zakat, rev) : `<tr><td class="ind">${RB.GROUPS.zakat}</td><td class="num">${N(0)}</td><td></td></tr>`}
      <tr class="total big ${inc.net < 0 ? 'neg' : ''}"><td>صافي الربح بعد الزكاة</td><td class="num">${N(inc.net)}</td><td class="num">${rev ? pct(inc.ratios.netMargin) : dashN}</td></tr>
      </tbody></table></div>`;
    const R = inc.ratios;
    const ratio = (l, v, hint) => `<div><span>${l}</span><b class="n">${rev ? pct(v) : '—'}</b><small>${hint}</small></div>`;
    const noRevNote = rev ? '' : `<p class="note">${good(S.sales).length ? 'لا مبيعات في هذه الفترة، فلا تُحسب النسب من المبيعات.' : 'النسب من المبيعات تظهر بعد أول إقفال يومي.'}</p>`;
    return card('قائمة الدخل', body, { sub: `${periodLabel()} · المصاريف المدفوعة مقدماً محمّلة حسب أشهرها، والإهلاك شهرياً.` }) + card('مؤشرات المطعم', `<div class="ratios">${ratio('تكلفة المواد', R.foodCost, 'المستهدف ' + pct(S.settings.targetFoodCost, 0))}${ratio('تكلفة العمالة', R.labor, 'تشمل التأمينات والسكن والرسوم')}${ratio('التكلفة الأساسية', R.prime, 'المواد + العمالة')}${ratio('الإيجار', R.occupancy, 'من المبيعات')}${ratio('عمولات البيع', R.sell, 'التطبيقات والشبكة')}${ratio('صافي الهامش', R.netMargin, 'الربح ÷ المبيعات')}</div>${noRevNote}`);
  };
  REPORT.balance = () => {
    const [, asOf] = rangeToDate();
    const b = RB.balanceSheet(S, asOf, ledger());
    const rows = (list) => list.map((x) => `<tr><td class="ind">${esc(x.name)}</td><td class="num">${N(x.amount)}</td></tr>`).join('');
    const body = `<div class="grid2 tight"><div class="tbl-wrap"><table class="tbl stmt"><thead><tr><th>الأصول</th><th class="num">${cur()}</th></tr></thead><tbody>
      <tr class="grp"><td colspan="2">أصول متداولة</td></tr>${rows(b.cur)}<tr class="sum"><td>إجمالي المتداولة</td><td class="num">${N(b.tCur)}</td></tr>
      <tr class="grp"><td colspan="2">أصول غير متداولة</td></tr>${rows(b.fixed)}<tr class="sum"><td>صافي الأصول غير المتداولة</td><td class="num">${N(b.tFixed)}</td></tr>
      <tr class="total"><td>إجمالي الأصول</td><td class="num">${N(b.tAssets)}</td></tr></tbody></table></div>
      <div class="tbl-wrap"><table class="tbl stmt"><thead><tr><th>الالتزامات وحقوق الشركاء</th><th class="num">${cur()}</th></tr></thead><tbody>
      <tr class="grp"><td colspan="2">الالتزامات</td></tr>${rows(b.liab) || '<tr><td class="ind muted">لا توجد</td><td></td></tr>'}<tr class="sum"><td>إجمالي الالتزامات</td><td class="num">${N(b.tLiab)}</td></tr>
      <tr class="grp"><td colspan="2">حقوق الشركاء</td></tr>${rows(b.equity)}<tr class="sum"><td>إجمالي حقوق الشركاء</td><td class="num">${N(b.tEq)}</td></tr>
      <tr class="total"><td>الإجمالي</td><td class="num">${N(b.tLiab + b.tEq)}</td></tr></tbody></table></div></div>
      ${Math.abs(b.check) > 0.01 ? `<p class="note bad">فرق غير متوقع ${fmt(b.check)} — راجع البيانات.</p>` : `<p class="note">الميزانية متوازنة: الأصول = الالتزامات + حقوق الشركاء.</p>`}`;
    return card('الميزانية العمومية', body, { sub: 'كما في ' + dtText(asOf) });
  };
  // ما يجعل مبيعات الإقرار غير إجمالي الإقفالات بدون الضريبة: عروض ومرتجعات التطبيقات (تخفضها كما في «صافي المبيعات»
  // بقائمة الدخل)، وثمن بيع الأصول (توريد خاضع لا يظهر في الإقفالات)
  const vatSalesNote = (v) =>
    (v.sales.adj < -0.005 ? ` المبيعات هنا بعد خصم عروض ومرتجعات التطبيقات (${fmt(v.sales.adj)} بدون الضريبة) كـ«صافي المبيعات» في قائمة الدخل، فهي وضريبتها أقل من إجمالي الإقفالات في صفحة المبيعات.` : '') +
    (v.sales.assets > 0.005 ? ` وتشمل ثمن بيع أصول (${fmt(v.sales.assets)} بدون الضريبة).` : '');
  REPORT.vat = () => {
    const [from, to] = range();
    const asOf = minD(to, today());
    const L = ledger();
    // كل الإقرارات من البداية حتى اليوم (لترحيل الرصيد الدائن)، ويُعرض منها ما يلامس الفترة بكامل أرقامه
    // ولو انتهت الفترة المختارة في منتصف إقرار؛ «ملخص الفترة» وحده يتبع الفترة المختارة
    const t = today();
    const all = RB.vatReturns(S, t, ledger());
    const pers = all.filter((p) => p.to >= from && p.from <= to);
    const lastEnded = (all.filter((p) => p.to < t).pop() || {}).key;
    // الضريبة المستحقة عند بدء الدفتر (من الأرصدة الافتتاحية) وما سُدد منها، وسداد لفترة قبل بداية الإقرارات
    // لم يقابله مستحق افتتاحي: لا يُخصم من أي إقرار
    const opv = all.opening;
    const payX = (x) => `${esc(x.period || 'بدون فترة')} ${x.amount < 0 ? 'استرداد ' : ''}<b class="n">${fmt(Math.abs(x.amount))}</b> ${cur()}${x.date ? ` (${dtText(x.date)})` : ''}`;
    let preNote = '';
    if (opv) {
      const st = opv.settled ? chip(opv.paid ? 'مسدد ' + fmt(opv.paid) : 'لا يوجد مستحق', 'good') : (opv.paid ? chip('مسدد ' + fmt(opv.paid), 'warn') + ' ' : '') + `المتبقي <b class="n">${fmt(opv.remaining)}</b> ${cur()}${opv.deadline ? (opv.deadline < t ? ` — فات موعدها (${dtText(opv.deadline)})` : ` — آخر موعد ${dtText(opv.deadline)}`) : ''}`;
      const over = opv.over > 0.005 ? ` ${chip('دفعة زائدة ' + fmt(opv.over), 'warn')} الزائد لا يُخصم من أي إقرار هنا ويبقى في رصيد حساب الضريبة بالميزانية.` : '';
      preNote += `<p class="note">ضريبة مستحقة عند بدء الدفتر من إقرار سابق (${esc(opv.label)}): <b class="n">${fmt(opv.payable)}</b> ${cur()} من الأرصدة الافتتاحية. ${st}${over}${opv.settled ? '' : ' ' + btn('سجّل السداد', 'add', `data-s="vatPayments" data-x="${esc(opv.label)}"`, 'sm')}</p>`;
    }
    // ضريبة أيام الفترة الجارية قبل بدء الدفتر (الأرصدة الافتتاحية): جزء من إقرار تلك الفترة يُسدَّد معه
    const opc = RB.openingInfo(S);
    const vc = opc && opc.vatCurrent ? (RB.vatOpeningPeriod(S, opc) || {}).cur : null;
    for (const p of pers) {
      if (Math.abs(p.pre) >= 0.005)
        preNote += `<p class="note">إقرار «${esc(p.label)}» يشمل ${p.pre > 0 ? 'ضريبة' : 'رصيداً لصالحك من'} ${vc && vc.key === p.key ? `${dtText(vc.from)} – ${dtText(vc.to)}` : 'الأيام'} قبل بدء الدفتر: <b class="n">${fmt(Math.abs(p.pre))}</b> ${cur()} من الأرصدة الافتتاحية (في «مرحّل من قبل»)، فسدِّد الإقرار كاملاً باسمه.</p>`;
      const hint = p.over > 0.005 ? preVatHint(p.label) : '';
      if (hint) preNote += `<p class="note">${chip('دفعة زائدة ' + fmt(p.over), 'warn')} ${hint}</p>`;
    }
    const pre = (all.before || []).filter((x) => !x.opening);
    if (pre.length)
      preNote += `<p class="note">${pre.length > 1 ? 'مدفوعات لفترات' : 'سداد لفترة'} قبل بداية الإقرارات في الدفتر: ${pre.map(payX).join('، ')}. ${pre.length > 1 ? 'لا تُخصم من أي إقرار هنا لأن ضريبة تلك الفترات ليست مسجلة في الدفتر، لكنها تدخل' : 'لا يُخصم من أي إقرار هنا لأن ضريبة تلك الفترة ليست مسجلة في الدفتر، لكنه يدخل'} في رصيد حساب الضريبة بالميزانية${opv ? '' : '. إن كانت الضريبة مستحقة عند بدء الدفتر فأدخلها في الأرصدة الافتتاحية («ضريبة مستحقة من إقرار سابق») ليُسدَّد منها'}.</p>`;
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
      <tr class="total big"><td>${v.net >= 0 ? 'صافي الضريبة المستحقة' : 'صافي الضريبة لصالحك (رصيد دائن)'}</td><td></td><td class="num">${N(Math.abs(v.net))}</td></tr>
      <tr><td class="ind">المسدد في الفترة</td><td></td><td class="num">${N(v.paid)}</td></tr></tbody></table></div>`,
      { sub: periodLabel() + ' · المشتريات غير الخاضعة لا تدخل في المدخلات.' + vatSalesNote(v) }
    );
    h += card(
      S.settings.vatPeriod === 'monthly' ? 'الإقرارات الشهرية' : 'الإقرارات الربع سنوية',
      table(
        [
          // اسم الإقرار ومداه بلا التفاف كلمة كلمة على الجوال (الجدول يُمرَّر أفقياً)
          { h: 'الفترة', cls: 'nw', f: (p) => `<b>${esc(p.label)}</b><div class="muted sm">${dtText(p.from)} — ${dtText(p.to)}</div>` },
          { h: 'ضريبة المبيعات', num: 1, f: (p) => N(p.report.sales.vat) },
          { h: 'ضريبة المدخلات', num: 1, f: (p) => N(p.report.inVat) },
          { h: 'صافي الفترة', num: 1, f: (p) => N(p.net) },
          // ضريبة أيام الفترة قبل بدء الدفتر (الأرصدة الافتتاحية) والرصيد الدائن المرحّل من الإقرارات السابقة
          {
            h: 'مرحّل من قبل',
            num: 1,
            f: (p) => (Math.abs(p.pre) >= 0.005 ? `${N(p.pre)}<div class="muted sm">${p.pre > 0 ? 'ضريبة ما قبل بدء الدفتر' : 'لك من قبل بدء الدفتر'}</div>` : '') + (p.carried < -0.005 ? `${N(p.carried)}<div class="muted sm">رصيد دائن لك</div>` : '') || '—',
          },
          { h: 'المستحق للسداد', num: 1, f: (p) => `<b>${N(p.due)}</b>${p.credit ? `<div class="muted sm">رصيد دائن ${fmt(p.credit)}</div>` : ''}` },
          { h: 'آخر موعد', f: (p) => dt(RB.monthEnd(RB.ymAdd(p.to.slice(0, 7), 1))) },
          {
            h: 'السداد',
            f: (p) => {
              if (p.to >= t) return chip('الفترة جارية', 'mute');
              const b = btn('سجّل السداد', 'add', `data-s="vatPayments" data-x="${esc(p.label)}"`, 'sm');
              const over = p.over > 0.005 ? ' ' + chip('دفعة زائدة ' + fmt(p.over), 'warn') + '<div class="muted sm">تُخصم من الإقرار التالي</div>' : '';
              if (!p.settled) return (p.paid ? chip('مسدد ' + fmt(p.paid), 'warn') : '') + (p.paid || Math.abs(p.remaining - p.due) > 0.005 ? `<div class="muted sm">المتبقي ${fmt(p.remaining)}</div>` : '') + b;
              // الرصيد الدائن قائم على آخر إقرار منتهٍ (ما قبله رُحّل إليه): استرداده من الهيئة يُسجَّل عليه بالسالب
              const rf = p.refund > 0.005 ? '<div class="muted sm">مسترد ' + fmt(p.refund) + '</div>' : '';
              const rb = p.credit > 0.005 && p.key === lastEnded ? btn('سجّل استرداد', 'add', `data-s="vatPayments" data-x="${esc('refund:' + p.label)}"`, 'sm ghost') : '';
              return (p.paid ? chip('مسدد ' + fmt(p.paid), 'good') : chip('لا يوجد مستحق', 'good')) + over + rf + rb;
            },
          },
        ],
        pers,
        { empty: 'لا توجد فترات.' }
      ) + preNote,
      { sub: 'آخر موعد لتقديم الإقرار والسداد: نهاية الشهر التالي للفترة. الرصيد الدائن (ضريبة مدخلات أكبر من المبيعات، مثل فترة التأسيس) يُرحّل ويُخصم من الفترات التالية، إلا إذا طلبت استرداده.' }
    );
    // المدفوعات والمستردات المسجلة: بتاريخها في الفترة، أو لإقرار معروض — لتعديلها أو حذفها
    const shown = new Set(pers.map((p) => p.label));
    const pays = good(S.vatPayments).filter((x) => inRange(x.date) || shown.has(x.period)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    if (pays.length)
      h += card(
        'مدفوعات ومستردات الضريبة',
        table(
          [
            { h: 'التاريخ', f: (x) => dt(x.date) },
            { h: 'الإقرار', f: (x) => esc(x.period || '—') },
            { h: 'المبلغ', num: 1, f: (x) => N(Math.abs(num(x.amount))) + ' ' + (num(x.amount) < 0 ? chip('استرداد', 'good') : chip('سداد', 'mute')) },
            { h: 'من / إلى', f: (x) => `<span class="muted">${esc(RB.srcLabel(x.account, S))}</span>` },
            { h: 'ملاحظة', f: (x) => esc(x.note || '') },
            { h: '', cls: 'acts', f: (x) => rowActs('vatPayments', x.id) },
          ],
          pays,
          { cards: 1 }
        ),
        { sub: 'السداد يُنسب للإقرار المختار مهما كان تاريخه، والاسترداد من الهيئة مبلغ بالسالب.' }
      );
    return h;
  };
  // نقطة التعادل للشاشة وملف CSV: الأرقام، وأساس الحساب (basis)، وتوضيح ما عُدّل من الفترة المختارة (adj)
  function breakEvenView() {
    const [from, asOf] = rangeToDate();
    const e = RB.breakEven(S, from, asOf, ledger(), today());
    // أساس الحساب: أشهر التشغيل الكاملة، مع توضيح ما عُدّل من الفترة المختارة
    const bA = e.basisFrom.slice(0, 7);
    const bB = e.basisTo.slice(0, 7);
    const nM = Math.round(e.months);
    const basis = e.estimate ? `${dtText(e.basisFrom)} — ${dtText(e.basisTo)}` : bA === bB ? RB.monthName(bA) : `${RB.monthName(bA)} — ${RB.monthName(bB)} (${cnt(nM, W.month)})`;
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
    return { e, basis, adj, from, asOf };
  }
  REPORT.breakeven = () => {
    const { e, basis, adj } = breakEvenView();
    const body = `<div class="pv-grid"><div><span>المصاريف الثابتة شهرياً</span>${money(e.fixedMonthly)}</div><div><span>المصاريف المتغيرة</span><b class="n">${pct(e.varRatio * 100)}</b><small>المواد + العمولات من المبيعات</small></div><div><span>هامش المساهمة</span><b class="n">${pct((1 - e.varRatio) * 100)}</b><small>ما يبقى من كل ريال لتغطية الثابت</small></div></div>
      <div class="be-hero"><div><span>مبيعات التعادل الشهرية${vatIn(today()) ? ' (شاملة الضريبة)' : ''}</span><b><span class="n">${fmt(e.beGross)}</span> <small class="cur">${cur()}</small></b></div><div><span>يومياً</span><b><span class="n">${fmt(e.beDaily)}</span> <small class="cur">${cur()}</small></b></div><div><span>طلبات يومياً تقريباً</span><b class="n">${e.avgTicket ? fmt0(e.beDaily / e.avgTicket) : '—'}</b></div></div>
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
  // تفسير الفرق بين التكلفة الفعلية والنظرية حسب إشارته: الهدر غير المسجل والسرقة لا يفسران فعلية أقل من النظرية
  // (الهدر المتوقع داخل النظرية أصلاً). vp: الفرق نسبةً من النظرية
  function varianceWhy(vp) {
    if (Math.abs(vp) < 1) return `الفرق صغير (أقل من ${pct(1, 0)} من النظرية) — الوصفات والجرد متسقان تقريباً.`;
    if (vp > 0) return 'الهدر المتوقع محسوب أصلاً في التكلفة النظرية عبر «نسبة الهدر %» لكل مادة؛ الزيادة المتبقية من هدر غير مسجل، وجبات العمال، حصص أكبر من الوصفة، أو نقص/سرقة.';
    return 'الفعلية أقل من النظرية: غالباً جرد نهاية الفترة أكبر من الواقع أو جرد بدايتها ناقص، أو مشتريات لم تُسجَّل بعد، أو كميات الوصفات أو «نسبة الهدر %» أكبر من الفعلي، أو ارتفعت أسعار المواد (النظرية بأسعار المواد الحالية).';
  }
  REPORT.menu = () => {
    const [from, asOf] = rangeToDate();
    const m = RB.menuAnalysis(S, from, asOf, ledger());
    if (!m.hasItems) return card('تحليل المنيو', `<div class="empty-box">لتحليل المنيو سجّل الكميات المباعة من كل صنف في الإقفال اليومي (قسم «الأصناف المباعة»).</div>`);
    const cls = (c) => chip(RB.MENU_CLASS[c].name, { star: 'good', plow: 'accent', puzzle: 'warn', dog: 'bad' }[c]);
    let h = card(
      'هندسة المنيو',
      table(
        [
          { h: 'الصنف', f: (r) => `<b>${esc(r.name)}</b>` },
          { h: 'الكمية', num: 1, f: (r) => N0(r.qty) },
          { h: 'حصة الكمية', num: 1, f: (r) => pct(r.mix) },
          { h: 'ربح الحبة', num: 1, f: (r) => N(r.profit) },
          { h: 'إجمالي الربح', num: 1, f: (r) => N(r.totalProfit) },
          { h: 'تكلفة الطعام', num: 1, f: (r) => pct(r.foodCost) },
          { h: 'فئة المنيو', f: (r) => `${cls(r.cls)}<div class="muted sm">${RB.MENU_CLASS[r.cls].tip}</div>` },
        ],
        m.rows
      ),
      { sub: `متوسط ربح الحبة ${fmt(m.avgProfit)} ${cur()}. «حصة الكمية» = نصيب الصنف من عدد الحبات المباعة لا من قيمة المبيعات. «مطلوب» = كميته ${pct(70, 0)} أو أكثر من متوسط الكمية المباعة للصنف الواحد.` }
    );
    const vp = m.theoretical ? (m.variance / m.theoretical) * 100 : 0;
    h += card(
      'التكلفة النظرية مقابل الفعلية',
      `<div class="pv-grid"><div><span>النظرية (حسب الوصفات × المبيعات)</span>${money(m.theoretical)}<small>${pct(m.revenue ? (m.theoretical / m.revenue) * 100 : 0)} من المبيعات</small></div><div><span>الفعلية (المشتريات ± الجرد)</span>${money(m.actual)}<small>${pct(m.revenue ? (m.actual / m.revenue) * 100 : 0)} من المبيعات</small></div><div><span>الفرق غير المفسَّر</span>${money(m.variance)}<small>${pct(vp)} من النظرية</small></div></div><p class="note">${varianceWhy(vp)} تحتاج إلى جرد في بداية الفترة ونهايتها لتكون المقارنة دقيقة. التكلفة النظرية محسوبة بأسعار المواد الحالية.</p>`
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
  // أشهر «مقارنة الأشهر» وقائمة دخل كل منها، للشاشة وملف CSV: لا أعمدة لأشهر لم تأتِ بعد والشهر الجاري حتى اليوم،
  // وفترة من شهر واحد تُعرض معها الأشهر الخمسة قبلها (حتى 24 شهراً)
  function monthlyData() {
    const [from, to] = range();
    let a = from.slice(0, 7);
    const b = minD(to, today()).slice(0, 7);
    if (a >= b) a = RB.ymAdd(b, -5);
    const months = [];
    for (let ym = a; ym <= b && months.length < 24; ym = RB.ymAdd(ym, 1)) months.push(ym);
    const L = ledger();
    const incs = months.map((ym) => RB.incomeStatement(S, ym + '-01', minD(RB.monthEnd(ym), today()), L));
    const last = months[months.length - 1];
    return { months, incs, from: months[0] + '-01', to: minD(RB.monthEnd(last), today()), own: a === from.slice(0, 7) };
  }
  REPORT.monthly = () => {
    const { months, incs, own, to } = monthlyData();
    const years = months[0].slice(0, 4) !== months[months.length - 1].slice(0, 4);
    const row = (label, f, cls) => `<tr class="${cls || ''}"><td>${label}</td>${incs.map((i) => `<td class="num">${f(i)}</td>`).join('')}</tr>`;
    const body = `<div class="tbl-wrap"><table class="tbl stmt"><thead><tr><th>البند</th>${months.map((m) => `<th class="num">${RB.monthName(m)}</th>`).join('')}</tr></thead><tbody>
      ${row(salesLbl('صافي المبيعات', to), (i) => N(i.revenue))}
      ${Object.keys(RB.GROUPS).map((g) => row(RB.GROUPS[g], (i) => N(i.tot[g]))).join('')}
      ${row('صافي الربح بعد الزكاة', (i) => N(i.net), 'total')}
      ${
        // شهر بلا مبيعات: «—» لا «0.0%» (هامش صفر لشهر خاسر يُقرأ تعادلاً)
        row('تكلفة المواد %', (i) => (i.revenue ? pct(i.ratios.foodCost) : '<span class="n">—</span>'))
      }
      ${row('التكلفة الأساسية %', (i) => (i.revenue ? pct(i.ratios.prime) : '<span class="n">—</span>'))}
      ${row('صافي الهامش %', (i) => (i.revenue ? pct(i.ratios.netMargin) : '<span class="n">—</span>'))}
      </tbody></table></div>`;
    return card('مقارنة الأشهر', body, { sub: own ? periodLabel() : 'آخر 6 أشهر' }) + card('صافي الربح الشهري', chartSlot({ points: months.map((m, i) => ({ label: monthTick(m, years), name: RB.monthName(m), v: incs[i].net, tip: `${RB.monthName(m)}: ${ltr(fmt(incs[i].net))} ${S.settings.currency}` })), label: 'صافي الربح الشهري بعد الزكاة', col: 'الشهر', lossLabel: 'الأشهر الخاسرة' }));
  };
  REPORT.trial = () => {
    const [from, asOf] = rangeToDate();
    const t = RB.trialBalance(S, from, asOf, ledger());
    return card(
      'ميزان المراجعة (حركة الفترة)',
      table(
        [
          { h: 'الحساب', f: (r) => `<span class="muted sm n">${esc(r.disp)}</span> ${esc(r.name)}` },
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
    const es = ledger().entries.filter((e) => e.date >= from && e.date <= asOf);
    const shown = es.slice(-300).reverse();
    const body = shown
      .map(
        (e) => `<tr class="jh"><td>${dt(e.date)}</td><td colspan="2">${esc(e.desc)}</td></tr>${e.lines.map((l) => `<tr><td></td><td class="ind">${l.v > 0 ? '' : '&emsp;'}${esc(RB.accInfo(l.a, S).name)}${l.memo ? ` <span class="muted sm">— ${esc(l.memo)}</span>` : ''}</td><td class="num">${l.v > 0 ? N(l.v) : ''}</td><td class="num">${l.v < 0 ? N(-l.v) : ''}</td></tr>`).join('')}`
      )
      .join('');
    return card('دفتر اليومية', es.length ? `<div class="tbl-wrap"><table class="tbl journal"><thead><tr><th>التاريخ</th><th>الحساب</th><th class="num">مدين</th><th class="num">دائن</th></tr></thead><tbody>${body}</tbody></table></div>${es.length > 300 ? `<p class="note">يظهر آخر 300 قيد من ${fmt0(es.length)}. صدّر الكل بصيغة CSV.</p>` : ''}` : `<div class="empty-box">لا قيود في هذه الفترة.</div>`, { sub: `${cnt(es.length, W.entry)} · تُنشأ تلقائياً` });
  };

  // ─── الإعدادات ───
  PAGES.settings = () => {
    const st = S.settings;
    const backend = APP.backend ? APP.backend.kind : '';
    const where = APP.noShared
      ? APP.demo
        ? 'البيانات المشتركة غير متاحة في هذه الزيارة — بيانات تجريبية لا يُحفظ منها شيء'
        : 'نسخة خاصة بهذا المتصفح من زيارة سابقة لم تتح فيها البيانات المشتركة — لا يراها شريكك. صدّرها نسخة احتياطية.'
      : APP.demo
        ? APP.loadFailed && !APP.real
          ? 'تعذّر تحميل دفتر المطعم المشترك في هذه الزيارة — ما تراه بيانات تجريبية. أعد تحميل الصفحة'
          : APP.readOnly && !APP.revoked
            ? 'وضع التجربة — للعرض فقط (لديك صلاحية العرض فقط)'
            : 'وضع التجربة — لا يُحفظ شيء'
        : backend === 'cloud'
          ? 'قاعدة بيانات مشتركة لهذه الصفحة: يقرؤها كل من تُفتح له الصفحة، ولو بصلاحية العرض فقط أو برابط عام بعد تسجيل الدخول، ويعدّلها من لديه صلاحية التعديل (مثل شريكك). راجع من شاركت الصفحة معه.'
          : 'هذا المتصفح على هذا الجهاز فقط. اجعل الإدخال من جهاز واحد، وصدّر نسخة احتياطية بانتظام. الاستيراد يستبدل كل البيانات ولا يدمجها؛ للعمل مع شريكك على نفس الدفتر استخدما نسخة Claude المشتركة.';
    const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
    let h = pageHead('الإعدادات والنسخ الاحتياطي', 'بيانات المطعم، الضريبة، نسب التأمينات، قنوات البيع، والنسخ الاحتياطي');
    h += `<div class="grid2">`;
    h += card('بيانات المطعم', kv('الاسم', esc(st.name)) + kv('المدينة', esc(st.city || '—')) + kv('السجل التجاري', esc(st.crNumber || '—')) + kv('تاريخ الافتتاح', st.openingDate ? dtText(st.openingDate) : '—') + kv('مستهدف تكلفة الطعام', pct(st.targetFoodCost, 0)) + kv('تقريب السعر المقترح', fmt(st.priceRounding) + ' ' + cur()), { actions: btn('تعديل', 'settings', 'data-v="general"', 'sm') });
    h += card('ضريبة القيمة المضافة', kv('مسجل في الضريبة', st.vatRegistered ? 'نعم' : 'لا') + (st.vatRegistered ? kv('سريان التسجيل', st.vatRegisteredFrom ? dtText(st.vatRegisteredFrom) : 'منذ البداية') : '') + kv('الرقم الضريبي', esc(st.vatNumber || '—')) + kv('النسبة', pct(st.vatRate, 0)) + kv('فترة الإقرار', st.vatPeriod === 'monthly' ? 'شهرية' : 'ربع سنوية') + kv('ضريبة على العمولات والرسوم', st.feeVat ? 'نعم' : 'لا'), { actions: btn('تعديل', 'settings', 'data-v="vat"', 'sm') });
    h += card('التأمينات الاجتماعية ورسوم العمالة', kv('السعودي (النظام السابق) — حصة المنشأة', rate(st.gosi.saudiEr)) + kv('السعودي (النظام السابق) — حصة الموظف', rate(st.gosi.saudiEe)) + kv('السعودي (النظام الجديد)', '<span class="n">+0.5%</span> لكل طرف كل يوليو 2025–2028') + kv('غير السعودي — حصة المنشأة', rate(st.gosi.expatEr)) + kv('الحد الأعلى للأجر الخاضع', fmt0(st.gosi.cap)) + kv('المقابل المالي الشهري (افتراضي)', fmt(st.labor.levyMonthly)) + kv('الإقامة سنوياً (افتراضي)', fmt(st.labor.iqamaAnnual)) + kv('رخصة العمل سنوياً (افتراضي)', fmt(st.labor.workPermitAnnual)) + kv('التأمين الطبي سنوياً (افتراضي)', fmt(st.labor.medicalAnnual)), { actions: btn('تعديل', 'settings', 'data-v="labor"', 'sm'), sub: 'قيم افتراضية قابلة للتعديل. راجع آخر النسب المعتمدة من التأمينات الاجتماعية ومنصة قوى.' });
    // مطعم قائم بدأ دفتره بعد تشغيله: ما كان له وعليه في تاريخ البدء
    const op = RB.openingInfo(S);
    h += card(
      'أرصدة افتتاحية',
      op
        ? kv('تاريخ بدء الدفتر', dtText(op.date)) + kv('الصندوق', fmt(op.cash)) + kv('البنك', fmt(op.bank)) + kv('مستحقات التطبيقات', fmt(op.apps)) + kv('المخزون', fmt(op.inventory)) + (op.vatPayable ? kv('ضريبة مستحقة من إقرار سابق', fmt(op.vatPayable)) : kv('رصيد ضريبة دائن', fmt(op.vatCredit))) + (op.vatCurrent ? kv('ضريبة الفترة الجارية حتى بدء الدفتر', fmt(op.vatCurrent)) : '') + kv('مستحق للموردين', fmt(op.owed)) + (op.eosb ? kv('مخصص نهاية الخدمة', fmt(op.eosb)) : '') + kv('الصافي (حقوق الشركاء)', fmt(op.net))
        : '<p class="note">للمطعم القائم قبل بدء الدفتر: سجّل ما في الصندوق والبنك والمخزون وما عند التطبيقات وما عليه للموردين ولعماله (مكافأة نهاية الخدمة) في تاريخ البدء، فتبدأ الأرصدة والتقارير صحيحة.</p>',
      { actions: btn(op ? 'تعديل' : 'إضافة', 'opening', '', 'sm') + (op ? btn('حذف', 'delopening', '', 'sm ghost') : ''), sub: 'لمطعم قائم يبدأ دفتره بعد تشغيله' }
    );
    h += card(
      'الحفظ والنسخ الاحتياطي',
      `<p class="note">مكان الحفظ: <b>${where}</b>${APP.savedAt ? `<br>آخر حفظ: ${TIMEF.format(new Date(APP.savedAt))}` : ''}${backend === 'local' && !APP.demo ? `<br>آخر نسخة احتياطية من هذا المتصفح: ${lastBackupText()}` : ''}</p>
      <div class="btn-row">${btn('تصدير نسخة احتياطية', 'backup', '', 'primary')}${btn('نسخ النسخة للحافظة', 'copybackup', '', 'ghost')}${APP.noShared ? '' : btn('استيراد نسخة', 'import', '', 'ghost')}<input type="file" accept=".json,application/json" id="importFile" hidden></div>
      <div class="btn-row">${APP.demo ? (APP.real ? btn('الرجوع لبياناتي', 'leavedemo', '', 'primary') : APP.noShared || APP.loadFailed ? '' : btn('ابدأ ببيانات مطعمك', 'start', '', 'primary')) : btn('عرض البيانات التجريبية', 'showdemo', '', 'ghost') + (APP.noShared ? '' : btn('مسح كل البيانات', 'wipe', '', 'danger ghost'))}</div>`
    );
    h += `</div>`;
    h += card(
      'قنوات البيع وعمولاتها',
      table(
        [
          { h: 'القناة', f: (c) => `<b>${esc(c.name)}</b>` },
          { h: 'النوع', f: (c) => esc(RB.CHANNEL_TYPES[c.type] || c.type) },
          { h: 'العمولة / الرسوم', num: 1, f: (c) => (c.type === 'cash' ? '—' : rate(c.feePct)) },
          { h: 'الحالة', f: (c) => (c.active === false ? chip('موقوفة', 'mute') : chip('مفعّلة', 'good')) },
          { h: '', cls: 'acts', f: (c) => `<div class="row-acts"><button type="button" class="icon-btn" data-act="channel" data-id="${esc(c.id)}" aria-label="تعديل" title="تعديل">✎</button><button type="button" class="icon-btn danger" data-act="delchannel" data-id="${esc(c.id)}" aria-label="حذف" title="حذف">✕</button></div>` },
        ],
        st.channels
      ),
      { actions: btn('+ قناة أو تطبيق', 'channel', '', 'sm'), sub: 'نسب العمولات افتراضية — عدّلها حسب عقدك مع كل تطبيق. العمولة تُحفظ مع كل إقفال، فتعديلها لا يغيّر الأيام السابقة.' }
    );
    return h;
  };

  // ═════════════ النماذج ═════════════
  const FORMS = {};
  // كل نموذج يُستدعى (rec, x, opts): rec السجل، وopts.isNew أنه سجل جديد مبني على rec (نسخة ⧉ أو تجديد)،
  // فيُعامل كإضافة لا كتعديل (العنوان، والقوالب، وذاكرة المورد، ونسب العمولات الحالية…)
  const editing = (rec, opts) => !!rec && !(opts && opts.isNew);
  // تحذير في المعاينة (لا يمنع الحفظ): السجل كما في النموذج يُخرج من الصندوق أو البنك فيصير رصيده بالسالب في نهاية
  // يوم من تاريخه فصاعداً — مبلغ أكبر من الموجود، أو تاريخ أبكر من الإقفال أو الإيداع الذي يغطيه. قيود السجل وحده
  // من دفتر مصغّر (بلا الأرصدة الافتتاحية)، مع بقية الدفتر بلا نسخته المحفوظة
  const OVERDRAW = [
    ['1101', 'الصندوق', 'سجّل قبله إقفال اليوم أو السحب من البنك الذي يغطيه'],
    ['1102', 'البنك', 'سجّل قبله الإيداع أو التحويل الذي يغطيه'],
  ];
  function overdrawNote(section, v) {
    if (!v || !RB.isISODate(v.date)) return '';
    const T = Object.assign(RB.emptyState(), { settings: Object.assign({}, S.settings, { opening: null }), partners: S.partners, employees: S.employees });
    T[section] = [v];
    const mine = RB.buildLedger(T, '9999-12-31').entries;
    let h = '';
    for (const [acc, name, fix] of OVERDRAW) {
      if (!mine.some((e) => e.lines.some((l) => l.a === acc && l.v < 0))) continue;
      const n = RB.firstNegative(ledger(), acc, v.date, '9999-12-31', { except: { s: section, id: v.id }, extra: mine });
      if (n) h += `<p class="note bad">بعد الحفظ يصير رصيد ${name} بالسالب في نهاية ${dtText(n.date)}: <b class="n">${fmt(n.balance)}</b> ${cur()} — يخرج منه أكثر مما دخل حتى ذلك اليوم. تأكد من المبلغ والتاريخ، أو ${fix}.</p>`;
    }
    return h;
  }
  // مبلغ الحركة أكبر من صفر (كالسلفة): سجل بمبلغ صفر لا أثر له في الحسابات ويُربك القوائم. ما يقبل الصفر عن قصد: الرسم
  // الحكومي (متابعة تجديد وثيقة بلا رسم)، والأصل القائم المستهلك كله، والتحويل الذي خصمه التطبيق كله (الخصومات)
  const POS_MSG = 'أدخل مبلغاً أكبر من صفر';
  const posCheck = (k, ok) => (x) => (num(x[k]) > 0 || (ok && ok(x)) ? '' : POS_MSG);
  const LEVY_HELP = 'المقابل المالي 800 ر.س شهرياً لكل وافد إذا زاد عدد الوافدين عن السعوديين في المنشأة، و700 ر.س إذا كانوا مساوين أو أقل — تحقق من قيمته في منصة قوى.';
  const MED_HELP = 'إلزامي لكل عامل وافد ولكل موظف سعودي في القطاع الخاص (نظام الضمان الصحي التعاوني) — أدخل قسط وثيقتك الفعلي';
  const vatFields = (redraw) => [
    { type: 'row', fields: [{ k: 'taxable', type: 'check', label: 'خاضع لضريبة القيمة المضافة', redraw: true, help: 'اختره إذا كانت الفاتورة ضريبية فيها الرقم الضريبي للمورد. في السعودية لا إعفاء للأغذية (خضار، لحوم، خبز = <span class="n">15%</span>). غير الخاضع: الرسوم الحكومية، إيجار السكن، أو مورد غير مسجل/بدون فاتورة ضريبية. فاتورة 1,000 ر.س فأكثر يلزم أن تكون باسم المطعم ورقمه الضريبي لخصم ضريبتها.' }, { k: 'includesVat', type: 'check', label: 'المبلغ المدخل شامل الضريبة', redraw: !!redraw, show: (v) => v.taxable }] },
  ];

  // نسبة الشريك تسري من تاريخ (RB.shareFrom): تغييرها في دفتر فيه قيود، أو شريك جديد يدخل دفتراً قائماً، يُسأل عن
  // تاريخ سريانها، فلا يتغير توزيع ما قبله (الأرصدة الافتتاحية وأرباح الفترات السابقة وحقوق من خرج). «تصحيح» يجعلها
  // لكل الفترات (نسبة أُدخلت خطأ). shareFrom وshareAll مؤقتان لا يُحفظان
  FORMS.partners = (rec, x, opts = {}) => {
    const isEdit = editing(rec, opts);
    const L = ledger();
    const first = L.entries.length ? L.entries[0].date : '';
    const share0 = isEdit ? num(rec.share) : 0;
    const changed = (v) => !!first && (isEdit ? Math.abs(num(v.share) - share0) > 1e-9 : num(v.share) > 0);
    const dated = (v) => changed(v) && !v.shareAll;
    const fromOf = (v) => (dated(v) && RB.isISODate(v.shareFrom) && v.shareFrom > first ? v.shareFrom : '');
    const value = Object.assign({}, rec || { id: RB.uid(), name: '', share: S.partners.length ? Math.max(0, 100 - RB.sum(S.partners, (p) => num(p.share))) : 50, phone: '', note: '' }, { shareFrom: today(), shareAll: false });
    // الشريك كما يُحفظ: نسبته الجديدة من تاريخها، وما قبله بنسبه السابقة
    const result = (v) => {
      const out = Object.assign({}, v);
      delete out.shareFrom;
      delete out.shareAll;
      if (!changed(v)) return out;
      return RB.shareFrom(Object.assign({}, out, { share: share0 }), num(v.share), fromOf(v));
    };
    return formModal({
      title: isEdit ? 'تعديل شريك' : 'شريك جديد',
      value,
      fields: [
        { k: 'name', label: 'اسم الشريك', req: 1 },
        { type: 'row', fields: [{ k: 'share', type: 'num', label: 'نسبة الشراكة %', req: 1, min: 0, max: 100, help: 'يتوزع الربح حسبها من تاريخ سريانها. لشريك خرج من الشراكة: سوِّ حقوقه أولاً (سحب أو نقل إلى شريك)، ثم اجعل نسبته 0 من تاريخ خروجه' }, { k: 'phone', label: 'الجوال' }] },
        { k: 'shareAll', type: 'check', label: 'تصحيح نسبة أُدخلت خطأ: تسري على كل الفترات من بداية الدفتر', live: true, show: changed },
        { k: 'shareFrom', type: 'date', label: isEdit ? 'تسري النسبة الجديدة من' : 'دخل الشراكة من', req: 1, live: true, show: dated, help: 'ما قبل هذا التاريخ يبقى بالنسب السابقة: الأرصدة الافتتاحية وأرباح الفترات السابقة وحقوق كل شريك فيها' },
        { k: 'note', type: 'textarea', label: 'ملاحظات' },
      ],
      preview: (v) => {
        if (!changed(v)) return '';
        const from = fromOf(v);
        if (!from) return `<p class="note">النسبة ${pct(num(v.share), 0)} لكل الفترات من بداية الدفتر: يُعاد بها توزيع الأرصدة الافتتاحية والأرباح السابقة كلها.</p>`;
        const prev = RB.addDays(from, -1);
        const was = isEdit ? RB.shareAt(rec, prev) : 0;
        let h = `<p class="note">من ${dtText(from)}: ${pct(num(v.share), 0)}، وحتى ${dtText(prev)} تبقى ${pct(was, 0)} كما كانت.</p>`;
        // خروج من الشراكة: حقوقه حتى اليوم السابق تبقى له حتى تُسوّى
        if (isEdit && !(num(v.share) > 0)) {
          const r = RB.partnersReport(S, prev, prev, L).rows.find((z) => z.id === rec.id);
          if (r && Math.abs(r.equity) >= 0.5)
            h += `<p class="note bad">حقوقه حتى ${dtText(prev)}: <b class="n">${fmt(r.equity)}</b> ${cur()} (مساهمته − مسحوباته + نصيبه من الأرباح حتى خروجه). تبقى له في الميزانية حتى تُسوّى: سجّل من «+ سحب شريك» سحباً بها إن دفعها المطعم، أو اختر في نوعه «نقل حقوق إلى شريك» إن اشتراها شريك من ماله.</p>`;
        }
        return h;
      },
      onSave: (v) => upsert('partners', result(v)),
    });
  };

  FORMS.capital = (rec, x, opts = {}) => {
    // بلا شركاء (دفتر قديم مُسح، أو نسخة مستوردة بلا شركاء): نموذج الشريك نفسه بدل رسالة بلا مخرج
    if (!S.partners.length) {
      toast('أضف الشركاء ونسبهم أولاً: رأس المال يُسجَّل باسم شريك.', 'bad');
      return FORMS.partners();
    }
    const type = rec ? rec.type : x;
    const isEdit = editing(rec, opts);
    // المتاح من أرباح الشريك (نصيبه من الأرباح المتراكمة − مسحوباته) وحقوقه كلها ورصيدا البنك والصندوق في تاريخ
    // الحركة، بلا هذه الحركة نفسها إن كانت محفوظة
    const avail = (v) => {
      const d = RB.isISODate(v.date) ? v.date : today();
      const L = ledger();
      const row = RB.partnersReport(S, d, d, L).rows.find((r) => r.id === v.partnerId);
      const b = RB.balances(L.entries, null, d);
      let u = row ? row.undistributed : 0;
      let eq = row ? row.equity : 0;
      let bank = b['1102'] || 0;
      let cash = b['1101'] || 0;
      const old = isEdit ? find('capital', v.id) : null;
      if (old && !old._bad && old.date <= d) {
        const a = num(old.amount);
        // السحب ونقل الحقوق من هذا الشريك نقصا من حقوقه؛ والإيداع أو النقل إليه زادها
        if ((old.type === 'withdrawal' || old.type === 'transfer') && old.partnerId === v.partnerId) {
          u += a;
          eq += a;
        } else if ((old.type === 'transfer' ? old.toPartnerId : old.type === 'withdrawal' ? '' : old.partnerId) === v.partnerId) eq -= a;
        if (old.type !== 'transfer') {
          const sg = old.type === 'withdrawal' ? 1 : -1;
          if (old.account === 'cash') cash += a * sg;
          else bank += a * sg;
        }
      }
      return { u: r2(u), eq: r2(eq), bank: r2(bank), cash: r2(cash) };
    };
    const name = (id) => (S.partners.find((p) => p.id === id) || {}).name || '';
    // نقل الحقوق إلى شريك آخر (اشترى حصة الخارج أو جزءاً منها من ماله): لا يدخل المطعم ولا يخرج منه شيء
    const types = [['contribution', 'إيداع في رأس المال'], ['withdrawal', 'سحب شريك (من الأرباح أو رأس المال)']].concat(S.partners.length > 1 || type === 'transfer' ? [['transfer', 'نقل حقوق إلى شريك آخر (اشتراها من ماله)']] : []);
    const others = (v) => S.partners.filter((p) => p.id !== v.partnerId).map((p) => [p.id, p.name]);
    const value = rec || { id: RB.uid(), date: today(), partnerId: S.partners[0].id, type: x || 'contribution', account: 'bank', amount: '', note: '' };
    return formModal({
      title: isEdit ? 'تعديل حركة رأس مال' : type === 'withdrawal' ? 'سحب شريك' : 'إيداع رأس مال',
      value,
      onChange: (p, v) => {
        // الشريك المنقول إليه غير الناقل
        if ((p === 'type' || p === 'partnerId') && v.type === 'transfer' && (!v.toPartnerId || v.toPartnerId === v.partnerId)) {
          v.toPartnerId = (others(v)[0] || [''])[0];
          return 'redraw';
        }
      },
      fields: (v) => [
        { type: 'row', fields: [{ k: 'date', type: 'date', label: 'التاريخ', req: 1 }, { k: 'partnerId', type: 'select', label: v.type === 'transfer' ? 'من الشريك' : 'الشريك', options: S.partners.map((p) => [p.id, p.name]), redraw: true }] },
        {
          type: 'row',
          fields: [
            { k: 'type', type: 'select', label: 'النوع', options: types, redraw: true },
            v.type === 'transfer'
              ? { k: 'toPartnerId', type: 'select', label: 'إلى الشريك', options: others, check: (z) => (!z.toPartnerId || z.toPartnerId === z.partnerId ? 'اختر شريكاً آخر' : '') }
              : { k: 'account', type: 'select', label: 'الحساب', options: [['bank', RB.PAY_LABEL.bank], ['cash', RB.PAY_LABEL.cash]] },
          ],
        },
        { k: 'amount', type: 'money', label: 'المبلغ', req: 1, min: 0, check: posCheck('amount') },
        { k: 'note', label: 'ملاحظة' },
      ],
      // يتحدث مع تغيير الشريك أو النوع أو التاريخ
      preview: (v) => {
        if (v.type === 'transfer') {
          const a = avail(v);
          return `<p class="note">حقوق ${esc(name(v.partnerId))} في هذا التاريخ: <b class="n">${fmt(a.eq)}</b> ${cur()} (مساهمته − مسحوباته + نصيبه من الأرباح). النقل لا يُدخل للمطعم مالاً ولا يُخرجه: تنقص حقوقه وتزيد حقوق ${esc(name(v.toPartnerId)) || 'الشريك الآخر'} بالمبلغ. لخروجه من الشراكة انقل حقوقه كلها، ثم اجعل نسبته 0 من تاريخ خروجه.</p>`;
        }
        if (v.type !== 'withdrawal') return '';
        const a = avail(v);
        return `<p class="note">المتاح من أرباح هذا الشريك: <b class="n">${fmt(a.u)}</b> — البنك: <b class="n">${fmt(a.bank)}</b> / الصندوق: <b class="n">${fmt(a.cash)}</b></p>` + overdrawNote('capital', v);
      },
      onSave: async (v) => {
        // تعديل حركة محفوظة تجاوزت حدها من قبل (تصحيح الملاحظة أو الحساب): لا يُسأل عنها ثانية ما لم يزد التجاوز أو يتغير
        // النوع أو الشريك. التجاوز الحالي للسجل المحفوظ يُحسب بالدالة نفسها (avail تُخرجه من الحساب)
        const old = isEdit ? find('capital', v.id) : null;
        const limit = (x, k) => (k === 'u' ? Math.max(0, avail(x).u) : avail(x).eq);
        const wasOver = (k) => (old && !old._bad && old.type === v.type && old.partnerId === v.partnerId ? r2(num(old.amount) - limit(old, k)) : 0);
        if (v.type === 'transfer') {
          delete v.account;
          const a = avail(v);
          const over = r2(num(v.amount) - a.eq);
          if (over > 0.005 && over > wasOver('eq') + 0.005 && !(await confirmBox(`المبلغ أكبر من حقوق ${esc(name(v.partnerId))} في هذا التاريخ (${fmt(a.eq)}) فتصير حقوقه بالسالب. متابعة؟`, { ok: 'احفظ' }))) return false;
        } else {
          delete v.toPartnerId;
          if (!v.account) v.account = 'bank';
        }
        if (v.type === 'withdrawal') {
          const a = avail(v);
          const over = r2(num(v.amount) - Math.max(0, a.u));
          if (over > 0.005 && over > wasOver('u') + 0.005 && !(await confirmBox(`هذا السحب يتجاوز نصيبه من الأرباح بمقدار ${fmt(over)} وسيُخصم من رأس ماله. متابعة؟`, { ok: 'احفظ' }))) return false;
        }
        upsert('capital', v);
      },
    });
  };

  // الأصل القائم قبل بدء الدفتر: لا ضريبة مدخلات تُسترد عليه الآن، وقيمته الدفترية من تكلفته كما دُفعت — بدون الضريبة
  // إن استردها المطعم عند الشراء، وشاملة الضريبة إن لم يستردها (غير مسجل، أو اشتراه قبل تسجيله)
  const openingAssetNote = (x) =>
    RB.isVatReg(S.settings, RB.isISODate(x.date) ? x.date : today())
      ? 'أصل كان يملكه المطعم قبل بدء الدفتر: يُسجَّل بقيمته الدفترية كما في دفاترك، ولا تُسترد عليه ضريبة الآن — من تكلفته بدون الضريبة إن استرددتها عند شرائه، وشاملة الضريبة إن اشتريته قبل تسجيل المطعم فيها. وتُضاف قيمته لحقوق الشركاء حسب نسبهم.'
      : 'أصل كان يملكه المطعم قبل بدء الدفتر: المطعم غير مسجل في الضريبة فلم يستردها، فيُسجَّل بقيمته الدفترية من تكلفته شاملة الضريبة، ولا تُحتسب عليه ضريبة مدخلات. وتُضاف قيمته لحقوق الشركاء حسب نسبهم.';
  FORMS.assets = (rec, x, opts = {}) => {
    const isEdit = editing(rec, opts);
    // التأمين المسترد لا ضريبة عليه: يُفرض «غير خاضع» عند اختيار التصنيف وعند فتح سجل محفوظ أو حفظه،
    // وكذلك الأصل القائم قبل بدء الدفتر (لا ضريبة مدخلات تُسترد عليه الآن؛ قيمته الدفترية تشمل ضريبته إن لم تُسترد عند شرائه)
    const noVat = (v) => Object.assign(v, { taxable: false, includesVat: false });
    const value = Object.assign({}, rec || { id: RB.uid(), date: today(), name: '', category: 'kitchen', amount: '', includesVat: false, taxable: true, account: 'bank', lifeMonths: 60, salvage: 0, supplier: '', note: '' });
    if (value.category === 'deposit' || RB.isOpeningAsset(value)) noVat(value);
    // مطعم قائم (له أرصدة افتتاحية): «أصل قائم قبل بدء الدفتر» مصدراً للدفع — قيمته الدفترية حقوق للشركاء حسب نسبهم
    const op = RB.openingInfo(S);
    const accOpts = payOptions(true).concat(op || RB.isOpeningAsset(value) ? [['opening', RB.PAY_LABEL.opening + ' (رصيد افتتاحي)']] : []);
    // أصل جديد بتاريخ بدء الدفتر أو قبله: «أصل قائم» تلقائياً ما دام المستخدم لم يختر مصدر الدفع بنفسه
    let accTouched = isEdit;
    let lastAcc = value.account;
    const date0 = value.date;
    // تكلفة الأصل كما يُهلك (بدون الضريبة المستردة): القيمة المتبقية أقل منها، وإلا لا يُستهلك منه شيء
    const assetCost = (x) => RB.costSplit(x.amount, x.includesVat, RB.assetTaxable(x), S.settings, RB.isISODate(x.date) ? x.date : today()).cost;
    const salvageCheck = (x) => {
      if (!(num(x.salvage) > 0) || !(num(x.lifeMonths) > 0) || RB.assetCat(x.category).life === 0) return '';
      const c = assetCost(x);
      return num(x.salvage) >= c ? 'تكون أقل من تكلفة الأصل (' + fmt(c) + ') وإلا لا يُستهلك منه شيء' : '';
    };
    // ما حدده المستخدم بنفسه (أو حُفظ مع السجل، أو نُسخ) لا يغيّره تغيير التصنيف: العمر الإنتاجي و«خاضع». التأمين
    // المسترد يُفرض عمره صفراً وبلا ضريبة دائماً، والخروج منه يعيد افتراضي التصنيف الجديد
    // moved: غيّر المستخدم التصنيف فبقي العمر الذي حدده، فيُذكر افتراضي التصنيف الجديد تحت الحقل
    const touched = { lifeMonths: !!rec, taxable: !!rec, moved: false };
    let cat0 = value.category;
    // اختيار المستخدم للضريبة («خاضع» و«شامل الضريبة») قبل التحول إلى «أصل قائم»: يعود كما كان عند الرجوع منه
    let vat0 = null;
    const setAcc = (v, a) => {
      if (a === 'opening') {
        if (lastAcc !== 'opening') vat0 = { taxable: v.taxable, includesVat: v.includesVat };
        noVat(v);
        // بتاريخ بدء الدفتر ما لم يكتب المستخدم تاريخاً
        if (!isEdit && op && v.date === date0 && v.date > op.date) v.date = op.date;
      } else if (lastAcc === 'opening') {
        v.taxable = v.category !== 'deposit' && (vat0 ? vat0.taxable !== false : true);
        v.includesVat = !!(v.taxable && vat0 && vat0.includesVat);
        vat0 = null;
      }
      v.account = a;
      lastAcc = a;
    };
    return formModal({
      title: isEdit ? 'تعديل أصل' : 'أصل جديد',
      value,
      onChange: (p, v) => {
        if (p === 'lifeMonths' || p === 'taxable') touched[p] = true;
        if (p === 'account') {
          accTouched = true;
          setAcc(v, v.account);
          return 'redraw';
        }
        if (p === 'date') {
          // التاريخ أثناء كتابته بلوحة المفاتيح (سنة ناقصة مثل 0002 أو 0202) لا يغيّر مصدر الدفع
          if (accTouched || !op || !RB.isISODate(v.date) || v.date < '2000' || !['bank', 'opening'].includes(v.account)) return;
          const want = v.date <= op.date ? 'opening' : 'bank';
          if (want === v.account) return;
          setAcc(v, want);
          return 'redraw';
        }
        if (p !== 'category') return;
        const dep = v.category === 'deposit' || cat0 === 'deposit';
        if (!touched.lifeMonths || dep) v.lifeMonths = RB.assetCat(v.category).life;
        if (v.category === 'deposit' || RB.isOpeningAsset(v)) v.taxable = false;
        else if (!touched.taxable || cat0 === 'deposit') v.taxable = true;
        if (!v.taxable) v.includesVat = false;
        cat0 = v.category;
        touched.moved = true;
        return 'redraw';
      },
      fields: (v) => {
        const old = RB.isOpeningAsset(v);
        return [
          { k: 'name', label: 'اسم الأصل', req: 1, placeholder: 'مثال: شواية برقر مسطحة' },
          { type: 'row', fields: [{ k: 'category', type: 'select', label: 'تصنيف الأصل', options: RB.ASSET_CATS.map((c) => [c.id, c.name]), redraw: true }, { k: 'date', type: 'date', label: old ? 'تاريخ بدء الدفتر' : 'تاريخ الشراء', req: 1 }] },
          { type: 'html', html: (x) => `<p class="note">${esc(RB.assetCat(x.category).hint)}</p>` },
          { type: 'row', fields: [{ k: 'amount', type: 'money', label: old ? 'القيمة الدفترية' : 'المبلغ', req: 1, min: 0, check: posCheck('amount', RB.isOpeningAsset), help: old ? 'التكلفة (شاملة الضريبة إن لم تُسترد عند الشراء) − ما استُهلك منها حتى بدء الدفتر' : '' }, { k: 'account', type: 'select', label: 'دُفع من', options: accOpts }] },
          ...(old
            ? [{ type: 'html', html: (x) => `<p class="note">${openingAssetNote(x)}</p>` }]
            : v.category === 'deposit'
              ? [{ type: 'html', html: () => '<p class="note">تأمين الإيجار والعدادات لا تُحتسب عليه ضريبة القيمة المضافة</p>' }]
              : vatFields()),
          { type: 'row', fields: [{ k: 'lifeMonths', type: 'num', label: old ? 'العمر المتبقي (بالأشهر)' : 'العمر الإنتاجي (بالأشهر)', min: 0, help: '0 = لا يُستهلك (مثل تأمين الإيجار)' + (touched.moved && num(v.lifeMonths) !== RB.assetCat(v.category).life && v.category !== 'deposit' ? ` · الافتراضي لهذا التصنيف ${cnt(RB.assetCat(v.category).life, W.month)}` : '') }, { k: 'salvage', type: 'money', label: 'القيمة المتبقية في النهاية', min: 0, check: salvageCheck }] },
          { k: 'supplier', label: 'المورد', check: (x) => (x.account === 'payable' && !String(x.supplier || '').trim() ? 'مطلوب للشراء الآجل' : '') },
          { k: 'note', type: 'textarea', label: 'ملاحظات' },
        ];
      },
      preview: (v) => {
        // الأصل المستبعد (بيع أو استرداد أو تخريد): يُعدَّل استبعاده من زره في سجل الأصول
        const dd = RB.isISODate(v.disposedDate) ? (RB.assetDisposal(v) ? `<p class="note">${v.category === 'deposit' ? 'استُرد' : 'استُبعد'} في ${dtText(v.disposedDate)} — عدّله أو ألغه من زر «${v.category === 'deposit' ? 'تعديل الاسترداد' : 'تعديل الاستبعاد'}» تحت اسمه في سجل الأصول.</p>` : `<p class="note bad">تاريخ الاستبعاد (${dtText(v.disposedDate)}) قبل تاريخ الأصل فلا يُعتد به: عدّله من زر «تعديل الاستبعاد» تحت اسمه في سجل الأصول.</p>`) : '';
        return dd + assetPreview(v);
      },
      onSave: (v) => {
        if (RB.isOpeningAsset(v) && !S.partners.length) return { msg: 'أضف الشركاء أولاً: قيمة الأصل القائم تُسجَّل حقوقاً لهم حسب نسبهم.', path: 'account', inline: 'أضف الشركاء أولاً' };
        if (v.category === 'deposit' || RB.isOpeningAsset(v)) noVat(v);
        upsert('assets', v);
      },
    });
    function assetPreview(v) {
      const sch = RB.depSchedule(Object.assign({}, v, { date: v.date || today() }), S);
      const dep = sch.monthly
        ? `<p class="note">يُحمّل <b class="n">${fmt(sch.monthly)}</b> ${cur()} شهرياً على المصاريف لمدة ${cnt(sch.life, W.month, { gen: true })}، بدءاً من ${RB.monthName(sch.months[0].ym)}.</p>`
        : salvageCheck(v)
          ? `<p class="note bad">لا يُستهلك: القيمة المتبقية (${fmt(num(v.salvage))}) ليست أقل من تكلفته (${fmt(sch.cost)}).</p>`
          : `<p class="note">لا يُستهلك هذا الأصل.</p>`;
      if (RB.isOpeningAsset(v)) {
        const sh = RB.openingShares(S, num(v.amount), v.date);
        return (sh.length ? `<p class="note">حقوق الشركاء: ${sh.map((z) => `${esc((S.partners.find((p) => p.id === z.partnerId) || {}).name || '')} <b class="n">${fmt(z.amount)}</b>`).join(' · ')}</p>` : '<p class="note bad">أضف الشركاء أولاً: قيمة الأصل القائم تُسجَّل حقوقاً لهم.</p>') + (op && RB.isISODate(v.date) && v.date !== op.date ? `<p class="note">تاريخ بدء الدفتر في الأرصدة الافتتاحية ${dtText(op.date)}.</p>` : '') + dep;
      }
      // تاريخ قبل بدء الدفتر بدفع من البنك أو الصندوق: الأرجح أصل قائم (لا تُسترد ضريبته مرة أخرى ولا يُخصم ثمنه)
      const early = op && RB.isISODate(v.date) && v.date < op.date ? `<p class="note bad">تاريخ الأصل قبل بدء الدفتر (${dtText(op.date)}). إن كان المطعم يملكه قبل البدء فاختر في «دُفع من»: «${RB.PAY_LABEL.opening}».</p>` : '';
      return early + vatPreview(v.amount, v.includesVat, RB.assetTaxable(v), v.date, v.account) + dep + overdrawNote('assets', v);
    }
  };

  // بيع الأصل أو استرداد التأمين أو تخريده: في سجل الأصل نفسه (disposedDate، proceeds، proceedsAccount، proceedsIncludesVat).
  // يخرج من الدفاتر بتكلفته وإهلاكه حتى شهر استبعاده، ويدخل الثمن الصندوق أو البنك (بضريبة مخرجات للمسجل إلا التأمين)،
  // والفرق ربح أو خسارة (RB.buildLedger). مسح التاريخ يلغي الاستبعاد
  FORMS.disposal = (rec) => {
    const dep = rec.category === 'deposit';
    const keys = ['disposedDate', 'proceeds', 'proceedsAccount', 'proceedsIncludesVat'];
    const had = !!rec.disposedDate;
    const value = Object.assign({}, rec, { proceedsAccount: rec.proceedsAccount === 'cash' ? 'cash' : 'bank', proceedsIncludesVat: rec.proceedsIncludesVat !== false });
    if (!had) Object.assign(value, { disposedDate: today(), proceeds: dep ? num(rec.amount) : '' });
    const taxable = (v) => !dep && RB.isVatReg(S.settings, RB.isISODate(v.disposedDate) ? v.disposedDate : today());
    return formModal({
      title: (dep ? 'استرداد التأمين: ' : 'بيع أو استبعاد: ') + (rec.name || ''),
      value,
      fields: (v) => [
        { type: 'html', html: () => `<p class="note">${dep ? 'التأمين المسترد (من المؤجر أو مزود الخدمة): يخرج من الأصول بقيمته، وما نقص منه (خصم المؤجر) خسارة. لا ضريبة عليه.' : 'الأصل المباع أو المستبعد يخرج من الدفاتر بتكلفته وإهلاكه حتى شهر بيعه، ويتوقف إهلاكه. ثمنه ناقص قيمته الدفترية ربح أو خسارة في قائمة الدخل، وبيع المسجل في الضريبة لأصوله عليه ضريبة مخرجات.'}${had ? ' لإلغاء الاستبعاد امسح التاريخ واحفظ.' : ''}</p>` },
        { type: 'row', fields: [{ k: 'disposedDate', type: 'date', label: dep ? 'تاريخ الاسترداد' : 'تاريخ البيع أو الاستبعاد', req: !had, check: (x) => (x.disposedDate && RB.isISODate(rec.date) && x.disposedDate < rec.date ? 'لا يسبق تاريخ الأصل (' + dtText(rec.date) + ')' : '') }, { k: 'proceeds', type: 'money', label: dep ? 'المبلغ المسترد' : 'المبلغ المستلم (0 للتخريد بلا مقابل)', min: 0 }, { k: 'proceedsAccount', type: 'select', label: 'استُلم في', options: [['bank', RB.PAY_LABEL.bank], ['cash', RB.PAY_LABEL.cash]] }] },
        ...(taxable(v) ? [{ k: 'proceedsIncludesVat', type: 'check', label: 'المبلغ المستلم شامل الضريبة' }] : []),
      ],
      preview: (v) => {
        if (!RB.isISODate(v.disposedDate) || (RB.isISODate(rec.date) && v.disposedDate < rec.date)) return had ? '<p class="note">بلا تاريخ: يُلغى الاستبعاد ويعود الأصل كما كان.</p>' : '';
        const a = Object.assign({}, rec, v);
        const sch = RB.depSchedule(a, S);
        const accum = r2(RB.sum(sch.months, (m) => m.amount));
        const book = r2(sch.cost - accum);
        const d = RB.disposalSplit(a, S.settings);
        const gain = r2(d.net - book);
        return `<div class="pv-grid"><div><span>القيمة الدفترية</span>${money(book)}<small>التكلفة ${fmt(sch.cost)} − الإهلاك ${fmt(accum)}</small></div><div><span>${d.vat ? 'الثمن بدون الضريبة' : 'المستلم'}</span>${money(d.net)}${d.vat ? `<small>والضريبة ${fmt(d.vat)}</small>` : ''}</div><div><span>${gain >= 0 ? 'ربح' : 'خسارة'}</span>${money(Math.abs(gain))}</div></div>`;
      },
      onSave: (v) => {
        // v: السجل كما في النموذج (أو أحدث نسخته وفيها ما غيّره المستخدم إن عدّله الشريك بعد الفتح)؛ حقل لم يغيّره
        // المستخدم وغاب عن أحدث نسخة يُؤخذ كما عُرض في النموذج
        const out = Object.assign({}, v);
        const at = (k) => (v[k] !== undefined ? v[k] : value[k]);
        if (!at('disposedDate')) for (const k of keys) delete out[k];
        else {
          for (const k of keys) out[k] = at(k);
          out.proceeds = num(at('proceeds'));
          if (!taxable(out)) delete out.proceedsIncludesVat;
        }
        upsert('assets', out);
      },
      done: dep ? 'سُجّل استرداد التأمين.' : 'سُجّل الاستبعاد.',
    });
  };

  FORMS.expenses = (rec, x, opts = {}) => {
    const isEdit = editing(rec, opts);
    const isGov = x === 'gov' || (rec && RB.GOV_CATS.includes(rec.category));
    const cat0 = x && RB.EXPENSE_CATS.some((c) => c.id === x) ? x : isGov ? 'gov' : 'utilities';
    // بلا ضريبة افتراضياً: سكن العمال والرسوم الحكومية والزكاة
    const noVat = ['housing', 'gov', 'labor_gov', 'zakat'];
    // الزكاة تخص السنة المالية السابقة لسنة الدفع، والأولى من الافتتاح إن افتُتح المطعم أثناءها (RB.zakatCoverage).
    // تاريخ أثناء كتابته (سنة ناقصة مثل 0002) لا ينتج بداية غير صالحة. بداية التغطية وأشهرها تتبع تاريخ الدفع
    // ما دامتا الافتراضيتين (v._zs و v._zm مؤقتان لا يُحفظان)
    const zakatCov = (d) => RB.zakatCoverage(S.settings, RB.isISODate(d) && d >= '2000' ? d : today());
    const zakatSet = (v) => {
      const z = zakatCov(v.date);
      v.startDate = v._zs = z.startDate;
      v.months = v._zm = z.months;
    };
    const empCats = ['labor_gov', 'insurance', 'staff'];
    const oneOffCats = RB.GOV_CATS.concat(['rent', 'housing']);
    const base = { id: RB.uid(), date: today(), category: cat0, desc: '', entity: '', amount: '', includesVat: true, taxable: !noVat.includes(cat0), account: 'bank', months: RB.expenseCat(cat0).months, startDate: '', employeeId: '', note: '', preset: '' };
    if (cat0 === 'zakat') zakatSet(base);
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
        if (!v.startDate) zakatSet(v);
      } else if (v._zs && v.startDate === v._zs) {
        // بداية التغطية الافتراضية للزكاة لا تخص التصنيفات الأخرى
        v.startDate = '';
        delete v._zs;
        delete v._zm;
      }
    };
    // نسخة أو تجديد للزكاة: بداية السنة التي تخصها تتبع تاريخ الدفع ما دامت الافتراضية
    const value = rec ? Object.assign({ preset: '' }, rec) : base;
    // مطعم قائم (أرصدة افتتاحية): «مدفوع قبل بدء الدفتر» مصدراً — إيجار أو تأمين أو رخصة دُفعت قبل البدء وبقي منها أشهر،
    // بالمبلغ غير المستهلك وبتاريخ البدء، بلا ضريبة مدخلات الآن، وقيمته حقوق للشركاء حسب نسبهم (RB.isOpeningExpense)
    const op = RB.openingInfo(S);
    const accOpts = payOptions(true).concat(op || RB.isOpeningExpense(value) ? [['opening', RB.OPENING_LABEL.expenses]] : []);
    const opNoVat = (v) => Object.assign(v, { taxable: false, includesVat: false });
    if (RB.isOpeningExpense(value)) opNoVat(value);
    let accTouched = isEdit;
    let vat0 = null;
    // lastAcc: مصدر الدفع قبل التغيير (حقل «دُفع من» يتغير قبل onChange)
    let lastAcc = value.account;
    const date0 = value.date;
    const setAcc = (v, a) => {
      if (a === 'opening' && lastAcc !== 'opening') {
        vat0 = { taxable: v.taxable, includesVat: v.includesVat };
        opNoVat(v);
        v.startDate = '';
        if (!isEdit && op && v.date === date0 && v.date > op.date) v.date = op.date;
      } else if (a !== 'opening' && lastAcc === 'opening') {
        if (vat0) Object.assign(v, vat0);
        else v.taxable = !noVat.includes(v.category);
        vat0 = null;
      }
      v.account = a;
      lastAcc = a;
    };
    // ما حدده المستخدم بنفسه (أو حُفظ مع السجل، أو نُسخ أو جُدّد) لا يغيّره تغيير التصنيف: «كم شهراً يغطي» و«خاضع»
    // (الزكاة تُفرض بلا ضريبة دائماً). القالب الجاهز اختيار صريح فيعبّئهما
    // moved: غيّر المستخدم التصنيف فبقيت الأشهر التي حددها، فيُذكر افتراضي التصنيف الجديد تحت الحقل
    const touched = { months: !!rec, taxable: !!rec, moved: false };
    if (!isEdit && rec && value.category === 'zakat') {
      const z = zakatCov(value.date);
      if (!value.startDate) zakatSet(value);
      else if (value.startDate === z.startDate) {
        value._zs = value.startDate;
        if (num(value.months) === z.months) value._zm = z.months;
      }
    }
    return formModal({
      title: isEdit ? 'تعديل مصروف' : opts.mode === 'renew' ? 'تجديد: ' + (rec.desc || RB.expenseCat(rec.category).name) : isGov ? 'رسم حكومي أو اشتراك' : 'مصروف تشغيلي',
      value,
      onChange: (p, v) => {
        if (p === 'months' || p === 'taxable') touched[p] = true;
        if (p === 'account') {
          accTouched = true;
          setAcc(v, v.account);
          return 'redraw';
        }
        // تاريخ قبل بدء الدفتر بدفع من البنك: الأرجح مدفوع قبل البدء (لا يُخصم من رصيد البنك الافتتاحي مرة ثانية)،
        // ما دام المستخدم لم يختر مصدر الدفع بنفسه
        let accMoved = false;
        if (p === 'date' && !accTouched && op && RB.isISODate(v.date) && v.date >= '2000' && ['bank', 'opening'].includes(v.account)) {
          const want = v.date < op.date ? 'opening' : 'bank';
          if (want !== v.account) {
            setAcc(v, want);
            accMoved = true;
          }
        }
        if (p === 'category') {
          if (!touched.months) v.months = RB.expenseCat(v.category).months;
          if (!touched.taxable) v.taxable = !noVat.includes(v.category);
          touched.moved = true;
          onCategory(v);
        }
        if (p === 'preset' && v.preset !== '') {
          const pr = RB.GOV_PRESETS[+v.preset];
          Object.assign(v, { entity: pr.entity, desc: pr.desc, category: pr.category, months: pr.months, taxable: ['insurance', 'shop_insurance', 'software'].includes(pr.category), oneOff: !!pr.oneOff });
          onCategory(v);
        }
        // تاريخ دفع الزكاة يحدد سنتها ما دامت بداية التغطية هي الافتراضية (تظهر عند مغادرة حقل التاريخ)
        if (p === 'date' && v.category === 'zakat' && v.startDate && v.startDate === v._zs) {
          const z = zakatCov(v.date);
          v.startDate = v._zs = z.startDate;
          if (v._zm !== undefined && num(v.months) === v._zm) v.months = v._zm = z.months;
          return 'redraw';
        }
        if (p === 'preset' || p === 'employeeId' || p === 'category') {
          applyAuto(v);
          return 'redraw';
        }
        if (accMoved) return 'redraw';
      },
      fields: (v) => [
        ...(isGov && !isEdit ? [{ k: 'preset', type: 'select', label: 'اختر من القائمة (اختياري)', options: [['', '— بند آخر —']].concat(presetList), redraw: true }] : []),
        { type: 'row', fields: [{ k: 'category', type: 'select', label: 'التصنيف', options: RB.EXPENSE_CATS.map((c) => [c.id, c.name]), redraw: true }, { k: 'date', type: 'date', label: RB.isOpeningExpense(v) ? 'تاريخ بدء الدفتر' : 'تاريخ الدفع', req: 1, redraw: v.category === 'zakat' }] },
        ...(v.category === 'zakat' ? [{ type: 'html', html: () => '<p class="note">يُقدَّم إقرار الزكاة ويُسدَّد خلال 120 يوماً من نهاية السنة المالية. الزكاة <span class="n">2.5%</span> من الوعاء الزكوي عن سنة هجرية (354 يوماً)، وللسنة الميلادية التي يستخدمها البرنامج بنسبة أيامها (نحو <span class="n">2.58%</span> لسنة كاملة)، والمبلغ الفعلي ما يحدده الإقرار؛ وتُحمَّل على السنة التي تخصها.</p>' }] : []),
        ...(v.category === 'insurance' ? [{ type: 'html', html: () => '<p class="note">اشتراكات التأمينات الاجتماعية (GOSI) تُحسب وتُسجَّل تلقائياً من مسير الرواتب — لا تسجّل فاتورة سداد التأمينات هنا حتى لا تُحسب مرتين.</p>' }] : []),
        { type: 'row', fields: [{ k: 'desc', label: 'البيان', req: 1, placeholder: 'مثال: فاتورة الكهرباء' }, { k: 'entity', label: v.category === 'rent' || v.category === 'housing' ? 'المؤجر' : 'الجهة / المورد', list: () => [...new Set(S.expenses.map((e) => e.entity).filter(Boolean))], check: (x) => (x.account === 'payable' && !String(x.entity || '').trim() ? 'مطلوب للشراء الآجل' : '') }] },
        ...(empCats.includes(v.category) ? [{ k: 'employeeId', type: 'select', label: 'العامل (اختياري)', options: empOptions, redraw: true }] : []),
        { type: 'row', fields: [{ k: 'amount', type: 'money', label: RB.isOpeningExpense(v) ? 'المبلغ غير المستهلك عند بدء الدفتر' : 'المبلغ', req: 1, min: 0, check: posCheck('amount', (z) => RB.GOV_CATS.includes(z.category) && !RB.isOpeningExpense(z)), help: RB.isOpeningExpense(v) ? 'ما دُفع قبل البدء ويخص الأشهر الباقية (إيجار 6 أشهر باقية من سنة مدفوعة = نصف الإيجار السنوي)' : '' }, { k: 'account', type: 'select', label: 'دُفع من', options: accOpts }] },
        ...(RB.isOpeningExpense(v) ? [] : vatFields()),
        {
          type: 'row',
          fields: [
            { k: 'months', type: 'num', label: RB.isOpeningExpense(v) ? 'الأشهر الباقية من بدء الدفتر' : 'كم شهراً يغطي؟', min: 1, step: 1, check: (x) => (Number.isInteger(num(x.months)) ? '' : 'عدد صحيح من الأشهر'), help: 'مثال: إيجار 6 أشهر، رخصة سنة = 12' + (touched.moved && v.category !== 'zakat' && num(v.months) !== RB.expenseCat(v.category).months ? ` · الافتراضي لهذا التصنيف ${cnt(RB.expenseCat(v.category).months, W.month)}` : '') },
            // المدفوع قبل بدء الدفتر يُحمَّل من تاريخ البدء على أشهره الباقية
            ...(RB.isOpeningExpense(v)
              ? []
              : [v.category === 'zakat' ? { k: 'startDate', type: 'date', label: 'بداية السنة المالية التي تخصها', help: 'تُحمَّل الزكاة على هذه السنة لا على سنة الدفع. السنة الأولى تبدأ من الافتتاح، فأشهرها ما بقي من تلك السنة' } : { k: 'startDate', type: 'date', label: 'بداية التغطية', help: 'إن اختلفت عن تاريخ الدفع' }]),
          ],
        },
        ...(oneOffCats.includes(v.category) ? [{ k: 'oneOff', type: 'check', label: 'رسم لمرة واحدة (لا يحتاج إلى تجديد)' }] : []),
        ...(rec && rec.noRenew ? [{ k: 'noRenew', type: 'check', label: 'أوقفت متابعة تجديده' }] : []),
        { k: 'note', type: 'textarea', label: 'ملاحظات' },
      ],
      preview: (v) => {
        const months = Math.max(1, Math.round(num(v.months) || 1));
        const c = RB.costSplit(v.amount, v.includesVat, v.taxable, S.settings, v.date || today());
        const sym = (v.startDate || v.date || today()).slice(0, 7);
        const one = months === 1 && sym !== (v.date || today()).slice(0, 7) ? `<p class="note">يُحمَّل على شهر ${esc(RB.monthName(sym))}.</p>` : '';
        const spread = months > 1 ? `<p class="note">يُوزّع على ${cnt(months, W.month, { gen: true })}: <b class="n">${fmt(c.cost / months)}</b> ${cur()} شهرياً، والتغطية حتى ${dtText(RB.expenseCoverageEnd({ category: v.category, startDate: v.startDate || v.date || today(), months }))}.</p>` : '';
        if (RB.isOpeningExpense(v)) {
          const sh = RB.openingShares(S, num(v.amount), v.date);
          return `<p class="note">مدفوع قبل بدء الدفتر ولم يُستهلك بعد: رصيد افتتاحي في «مصروفات مدفوعة مقدماً» يُحمَّل على أشهره الباقية، بلا ضريبة مدخلات الآن ولا حركة في البنك أو الصندوق، وقيمته حقوق للشركاء حسب نسبهم.</p>` + (sh.length ? `<p class="note">حقوق الشركاء: ${sh.map((z) => `${esc((S.partners.find((p) => p.id === z.partnerId) || {}).name || '')} <b class="n">${fmt(z.amount)}</b>`).join(' · ')}</p>` : '<p class="note bad">أضف الشركاء أولاً: قيمته تُسجَّل حقوقاً لهم.</p>') + (op && RB.isISODate(v.date) && v.date !== op.date ? `<p class="note">تاريخ بدء الدفتر في الأرصدة الافتتاحية ${dtText(op.date)}.</p>` : '') + spread;
        }
        // تاريخ قبل بدء الدفتر بدفع من البنك أو الصندوق: يُخرج من رصيدهما الافتتاحي مرة ثانية
        const early = op && RB.isISODate(v.date) && v.date < op.date && !String(v.account || '').startsWith('partner:') ? `<p class="note bad">تاريخ المصروف قبل بدء الدفتر (${dtText(op.date)}): أرصدة البنك والصندوق الافتتاحية بعده، فيُخصم منها مرة ثانية. إن كان مدفوعاً قبل البدء وبقي منه أشهر (إيجار مثلاً) فاختر في «دُفع من»: «${RB.OPENING_LABEL.expenses}» بالمبلغ غير المستهلك.</p>` : '';
        return early + vatPreview(v.amount, v.includesVat, v.taxable, v.date, v.account) + one + spread + overdrawNote('expenses', v);
      },
      onSave: (v) => {
        delete v.preset;
        delete v._auto;
        delete v._zs;
        delete v._zm;
        if (RB.isOpeningExpense(v)) {
          if (!S.partners.length) return { msg: 'أضف الشركاء أولاً: قيمة المدفوع قبل بدء الدفتر تُسجَّل حقوقاً لهم حسب نسبهم.', path: 'account', inline: 'أضف الشركاء أولاً' };
          opNoVat(v);
          v.startDate = '';
        }
        upsert('expenses', v);
      },
    });
  };

  FORMS.employees = (rec, x, opts = {}) => {
    const L = S.settings.labor;
    const isEdit = editing(rec, opts);
    return formModal({
      title: isEdit ? 'تعديل بيانات موظف' : 'موظف جديد',
      wide: true,
      value: rec || { id: RB.uid(), name: '', job: '', nationality: 'expat', startDate: today(), endDate: '', active: true, basic: '', housing: 0, transport: 0, otherAllow: 0, levyMonthly: L.levyMonthly, iqamaAnnual: L.iqamaAnnual, workPermitAnnual: L.workPermitAnnual, medicalAnnual: L.medicalAnnual, ticketAnnual: 0, housingCost: 0, otherAnnual: 0, note: '' },
      onChange: (p, v) => {
        if (p === 'nationality' && v.nationality === 'saudi') Object.assign(v, { levyMonthly: 0, iqamaAnnual: 0, workPermitAnnual: 0 });
        if (p === 'nationality' && v.nationality !== 'saudi' && !num(v.levyMonthly)) Object.assign(v, { levyMonthly: L.levyMonthly, iqamaAnnual: L.iqamaAnnual, workPermitAnnual: L.workPermitAnnual });
        // السعودي الجديد: النظام الجديد افتراضياً؛ السجل القائم بلا قيمة يبقى على النظام السابق
        if (p === 'nationality' && v.nationality === 'saudi' && !isEdit && !v.gosiSystem) v.gosiSystem = 'new';
        if (p === 'nationality') return 'redraw';
        // إلغاء «على رأس العمل» بلا تاريخ ترك العمل: يُقترح اليوم ويظهر ليؤكده المستخدم أو يعدّله (v._autoEnd مؤقت)
        if (p === 'active' && !v.active && !v.endDate) {
          v.endDate = v._autoEnd = today();
          return 'redraw';
        }
        if (p === 'active' && v.active && v._autoEnd && v.endDate === v._autoEnd) {
          v.endDate = '';
          delete v._autoEnd;
          return 'redraw';
        }
      },
      fields: (v) => [
        { type: 'row', fields: [{ k: 'name', label: 'الاسم', req: 1 }, { k: 'job', label: 'الوظيفة', placeholder: 'طباخ، كاشير، عامل نظافة…' }] },
        { type: 'row', fields: [{ k: 'nationality', type: 'select', label: 'الجنسية', options: [['expat', 'غير سعودي'], ['saudi', 'سعودي']], redraw: true }, { k: 'startDate', type: 'date', label: 'تاريخ المباشرة' }, { k: 'endDate', type: 'date', label: 'تاريخ ترك العمل', check: (x) => (x.endDate && RB.isISODate(x.startDate) && x.endDate < x.startDate ? 'لا يكون قبل تاريخ المباشرة' : '') }] },
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
        (RB.isISODate(v.startDate) ? '' : '<p class="note bad">بلا «تاريخ المباشرة»: يُحسب راتبه كاملاً من أول شهر بلا خصم أيام، ومخصص نهاية الخدمة بمعدل أول خمس سنوات، ولا يُقدَّر مخصصه الافتتاحي من بيانات الموظفين. أدخله إن كان معروفاً.</p>') +
        (v._autoEnd && v.endDate === v._autoEnd ? `<p class="note">حُدّد «تاريخ ترك العمل» بتاريخ اليوم (${dtText(v.endDate)}) — عدّله إن ترك العمل في يوم آخر. يُصرف له راتب الأيام التي عملها في شهر تركه.</p>` : '') +
        (v.active === false && !v.endDate
          ? '<p class="note bad">حدّد «تاريخ ترك العمل» إن ترك العمل، ثم سجّل مكافأة نهاية الخدمة في مسير رواتب أو اختر «لا مكافأة مستحقة» ليُسوّى مخصصه.</p>'
          : v.endDate && !v.eosbNone
            ? '<p class="note">يبقى مخصص نهاية الخدمة التزاماً حتى تُسجَّل مكافأته في مسير رواتب («إضافة موظف» ثم اختره)، ويُرد ما زاد منه على المكافأة إلى المصروف.</p>'
            : ''),
      onSave: (v) => {
        if (!v.endDate || !v.eosbNone) delete v.eosbNone;
        delete v._autoEnd;
        upsert('employees', v);
      },
    });
  };
  function empCostHTML(e) {
    const ym = today().slice(0, 7);
    const c = RB.employeeMonthlyCost(e, S, ym);
    // النسب الفعلية لهذا الشهر (السعودي في النظام الجديد تزيد نسبته كل يوليو)
    const saudi = e.nationality === 'saudi';
    const r = saudi ? RB.gosiSaudiRates(e, S, ym) : { er: S.settings.gosi.expatEr, ee: 0 };
    const rates = saudi ? `بنسبة ${rate(r.er)} على المنشأة و${rate(r.ee)} على الموظف (${e.gosiSystem === 'new' ? 'النظام الجديد' : 'النظام السابق'})` : `بنسبة ${rate(r.er)} على المنشأة`;
    // التأمين الطبي إلزامي: يظهر دائماً، وبلا قسط يُنبَّه عليه
    const row = (i) => `<tr><td>${esc(i.label)}${i.k === 'medical' && !i.v ? '<div class="note bad">لم يُدخل قسط التأمين الطبي (إلزامي)</div>' : ''}</td><td class="num">${N(i.v)}</td></tr>`;
    return `<div class="tbl-wrap"><table class="tbl mini"><tbody>${c.items.filter((i) => i.v || i.k === 'medical').map(row).join('')}<tr class="total"><td>التكلفة الشهرية الحقيقية</td><td class="num">${N(c.total)}</td></tr></tbody></table></div>
      <p class="note">التأمينات ${rates} من أجر خاضع ${fmt(c.gosi.base)}. الأجر الخاضع = الأساسي + بدل السكن (أو السكن العيني مقدّراً بأجر شهرين في السنة). ${c.gosi.ee ? `يُخصم من الموظف ${fmt(c.gosi.ee)} فيصله صافي ${fmt(c.netPay)}.` : 'لا يُخصم من الموظف غير السعودي.'} تكلفته السنوية ≈ ${fmt(c.total * 12)} ${cur()}.</p>`;
  }

  // تاريخ الصرف الافتراضي لمسير الشهر ym: آخر الشهر، أو اليوم إن لم ينتهِ الشهر بعد
  const payDefaultDate = (ym) => (RB.monthEnd(ym) <= today() ? RB.monthEnd(ym) : today());
  // تاريخ سداد التأمينات الافتراضي: آخر موعد (15 من الشهر التالي)، أو تاريخ صرف الرواتب إن كان بعده
  const gosiDefaultDate = (ym, date) => {
    const due = RB.ymAdd(ym, 1) + '-15';
    return RB.isISODate(date) && date > due ? date : due;
  };
  const runMonth = (p) => p.month || String(p.date || '').slice(0, 7);
  // أشهر لها مسير رواتب (مسير التسوية بلا راتب لا يُعد مسيراً للشهر)
  const paidMonths = (exceptId) => new Set(good(S.payroll).filter((p) => p.id !== exceptId && RB.payrollTotals(p).gross > 0).map(runMonth));
  // أسطر مسير الشهر ym من بيانات الموظفين، ويبقى ما أدخله المستخدم في الأسطر الحالية cur (RB.payrollFill).
  // exceptId: المسير المفتوح نفسه لا يُحسب استقطاعه من رصيد السلف المقترح استقطاعه؛ date: تاريخ الصرف (السلف حتى يومه)
  const withoutRun = (id) => (id ? Object.assign({}, S, { payroll: S.payroll.filter((p) => p.id !== id) }) : S);
  const payrollFill = (ym, cur, fromYm, exceptId, date) => RB.payrollFill(withoutRun(exceptId), ym, cur, fromYm, date);

  FORMS.payroll = (rec, empId, opts = {}) => {
    const isEdit = editing(rec, opts);
    // الشهر الافتراضي لمسير جديد: الشهر الماضي (أو الحالي من يوم 25)، أو أول شهر بعده حتى الشهر الحالي بلا مسير.
    // ولا قبل شهر بدء الدفتر لمطعم قائم (رواتب ما قبله في أرصدته الافتتاحية، وتنبيه المسير يبدأ منه) ولا قبل أول
    // مباشرة لموظف — ولا بعد الشهر الحالي. لا يُقيَّد بالافتتاح: رواتب ما قبل الافتتاح لمطعم جديد مشروعة
    const thisYm = today().slice(0, 7);
    const op0 = RB.openingInfo(S);
    const starts = S.employees.filter((e) => e && RB.isISODate(e.startDate)).map((e) => e.startDate.slice(0, 7)).sort();
    let def = RB.ymAdd(thisYm, today().slice(8) >= '25' ? 0 : -1);
    for (const lo of [op0 && op0.date.slice(0, 7), starts[0]]) if (lo && def < lo) def = lo < thisYm ? lo : thisYm;
    const paid = paidMonths();
    // من تنبيه «لم يُسجَّل مسير رواتب»: الشهر المطلوب
    const monthX = !rec && RB.isISOMonth(empId) ? empId : '';
    let ym = monthX || def;
    for (let m = def; !monthX && m <= thisYm; m = RB.ymAdd(m, 1)) {
      if (!paid.has(m)) {
        ym = m;
        break;
      }
    }
    const base = { id: RB.uid(), month: ym, date: payDefaultDate(ym), account: 'bank', gosiAccount: 'bank', lines: [], note: '' };
    base.gosiDate = gosiDefaultDate(ym, base.date);
    if (!rec) base.lines = payrollFill(ym, undefined, undefined, undefined, base.date);
    const nCol = (k, label) => ({ k, label, type: 'num', num: 1 });
    const empOf = (id) => (id ? S.employees.find((e) => e.id === id) : null);
    // من تنبيه «لم تُسوَّ مكافأة نهاية الخدمة»: مسير تسوية اليوم بسطر واحد لمن ترك العمل، والمكافأة مقترحة بمقدار مخصصه.
    // سطر المكافأة وحدها: لا راتب فيه ولا إضافي ولا خصم أيام (راتب شهر تركه في مسير ذلك الشهر)
    const settleEmp = !rec && !monthX && empOf(empId);
    if (settleEmp) {
      const prov = Math.max(0, RB.eosbBalances(S, today(), { release: false })[settleEmp.id] || 0);
      // سلفة باقية عليه تُستقطع من مكافأته (بقدرها)، بلا ما سُدّد منها بعد اليوم
      const owe = Math.max(0, RB.advanceRoom(S, today())[settleEmp.id] || 0);
      const line = Object.assign(RB.payrollLine(settleEmp, S, today().slice(0, 7)), { basic: 0, housing: 0, allowances: 0, additions: 0, deductions: 0, gosiEe: 0, gosiEr: 0, eosbPaid: prov, advance: r2(Math.min(owe, prov)), _autoDed: 0 });
      line._autoAdv = line.advance;
      delete line.note;
      Object.assign(base, {
        month: today().slice(0, 7),
        date: today(),
        gosiDate: today(),
        note: 'تسوية نهاية الخدمة: ' + settleEmp.name,
        lines: [line],
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
    // ما يمكن استقطاعه من سلف كل موظف في تاريخ الصرف، بلا استقطاع هذا المسير نفسه: أدنى رصيد لسلفه من تاريخ
    // الصرف فصاعداً (RB.advanceRoom)، فمسير شهر فات تسجيله لا يستقطع ثانية سلفة استقطعها مسير لاحق.
    // advBal: رصيد سلفه في تاريخ الصرف نفسه (للتوضيح تحت الخانة)
    const payDate = (v) => (RB.isISODate(v.date) ? v.date : today());
    const advOut = (v) => RB.advanceRoom(withoutRun(v.id), payDate(v));
    const advBal = (v) => RB.advanceBalances(withoutRun(v.id), payDate(v));
    // خصم الأيام التلقائي لموظف السطر في الشهر (0 لعامل غير مسجل أو لمن ليس له راتب فيه)
    const autoDed = (id, ym2) => {
      const e = empOf(id);
      return e && RB.isISOMonth(ym2) && RB.isEmployeeActive(e, ym2) ? num(RB.payrollLine(e, S, ym2).deductions) : 0;
    };
    // المسير المحفوظ (أو المنسوخ): خصم الأيام التلقائي لكل سطر، ليُعرف عند تغيير الموظف ما وضعه البرنامج؛
    // واستقطاع السلفة المحفوظ يخص موظف السطر، فيُعامل كتلقائي يتغيّر بتغيير الموظف
    const value = rec && Array.isArray(rec.lines)
      ? Object.assign({}, rec, {
          lines: rec.lines.map((l) => {
            if (!l || typeof l !== 'object') return l;
            const o = Object.assign({}, l);
            if (o._autoDed === undefined) o._autoDed = autoDed(l.employeeId, rec.month);
            if (o._autoAdv === undefined) o._autoAdv = num(l.advance);
            return o;
          }),
        })
      : rec || base;
    // تاريخ سداد التأمينات يتبع الشهر وتاريخ الصرف ما دام الافتراضي (gosiAuto: آخر ما وضعه البرنامج)
    let gosiAuto = value.gosiDate && value.gosiDate === gosiDefaultDate(value.month, value.date) ? value.gosiDate : undefined;
    const gosiFollow = (v) => {
      if (gosiAuto === undefined || v.gosiDate !== gosiAuto || !RB.isISOMonth(v.month)) return;
      v.gosiDate = gosiAuto = settleEmp ? v.date : gosiDefaultDate(v.month, v.date);
    };
    // linesYm: الشهر الذي بُنيت له الأسطر (لمعرفة ما عدّله المستخدم عند إعادة التعبئة)، lastMonth: آخر شهر صالح
    let linesYm = value.month;
    let lastMonth = value.month;
    // snap: الأسطر كما كانت قبل بدء تعديل الشهر (حتى مغادرة حقله). كتابة الشهر بلوحة المفاتيح تمر بأشهر وسيطة
    // (كتابة 11 تمر بيناير)، فكل تعبئة تُبنى من هذه الأسطر لا من أسطر شهر وسيط قد لا يكون فيه بعض الموظفين،
    // فلا يضيع ما أُدخل لهم من إضافي وخصومات وتأمينات معدّلة
    let snap = null;
    // مسير آخر لنفس الشهر فيه رواتب: مسير ثانٍ يضاعف مصروف الرواتب (مسير التسوية بلا راتب مستثنى)
    const otherRun = (v) => !settleEmp && RB.isISOMonth(v.month) && paidMonths(v.id).has(v.month);
    // استقطاع السلفة لسطر: ما بقي من سلف موظفه في تاريخ الصرف (بلا هذا المسير، out = advOut) بقدر ما يُصرف له
    // (كما في RB.payrollLine). عامل غير مسجل أو بلا سلف: صفر؛ وما كتبه المستخدم يبقى لموظف عليه سلف
    const advFor = (row, out) => {
      const b = row.employeeId ? out[row.employeeId] || 0 : 0;
      if (!(b > 0.005)) {
        row.advance = 0;
        row._autoAdv = 0;
        return;
      }
      const a = r2(Math.max(0, Math.min(b, RB.payrollLineGross(row) - num(row.gosiEe) + Math.max(0, num(row.eosbPaid)))));
      if (!num(row.advance) || (row._autoAdv !== undefined && Math.abs(num(row.advance) - num(row._autoAdv)) < 0.005)) row.advance = a;
      row._autoAdv = a;
    };
    // مسير تسوية (من تنبيه «سجّل المكافأة»، أو محفوظ فيه من ترك العمل): أدوات المكافأة بنظام العمل
    const settling = !!settleEmp || (!!rec && (rec.lines || []).some((l) => l && RB.eosbFinalRun(empOf(l.employeeId), rec)));
    const awardTool = (v, rows, k) => {
      let n = 0;
      const out = advOut(v);
      for (const r of rows) {
        const e = r && empOf(r.employeeId);
        if (!e || !RB.eosbFinalRun(e, v)) continue;
        r.eosbPaid = RB.eosbAward(RB.lastWage(S, e.id), e.startDate, e.endDate)[k];
        advFor(r, out);
        n++;
      }
      if (!n) toast('لا يوجد في المسير من ترك العمل في شهره أو قبله (حدّد «تاريخ ترك العمل» في بياناته).', 'bad');
    };
    return formModal({
      title: isEdit ? 'تعديل مسير رواتب' : settleEmp ? 'تسوية نهاية الخدمة' : 'مسير رواتب',
      // أعرض من بقية النماذج: 12 عموداً، فيظهر «المحوَّل فعلياً» وزر حذف السطر بلا تمرير أفقي على 1280
      wide: 'x',
      value,
      onChange: (p, v) => {
        if (p === 'month') {
          // الشهر أثناء كتابته (سنة ناقصة مثل 0002-10، أو فارغ) لا يمسح الأسطر ولا ينتج تاريخاً غير صالح
          if (!(RB.isISOMonth(v.month) && v.month >= '2000-01')) return;
          const from = lastMonth;
          lastMonth = v.month;
          // مسير التسوية يبقى بسطر من ترك العمل وإن تغيّر شهره
          if (from === v.month || settleEmp) return;
          // تاريخ الصرف يتبع الشهر ما دام الافتراضي لشهره السابق (التاريخ الذي كتبه المستخدم يبقى)
          if (RB.isISOMonth(from) && v.date === payDefaultDate(from)) v.date = payDefaultDate(v.month);
          gosiFollow(v);
          // مسير جديد: أسطر الشهر الجديد (والسلف حتى تاريخ صرفه)، ويبقى ما أدخله المستخدم فيها
          if (!isEdit) {
            if (!snap) snap = { lines: clone(v.lines || []), ym: linesYm };
            v.lines = payrollFill(v.month, clone(snap.lines), snap.ym, v.id, v.date);
            linesYm = v.month;
          }
          return 'redraw';
        }
        // تاريخ الصرف: السلف المقترح استقطاعها حتى يومه (سلفة أُعطيت بعده لا تُستقطع)، والمقترح وحده يتغير.
        // المسير المحفوظ يبقى استقطاعه كما حُفظ (والحفظ ينبّه إن زاد على الباقي من سلف الموظف)
        if (p === 'date') {
          if (!(RB.isISODate(v.date) && v.date >= '2000-01-01')) return;
          const g0 = v.gosiDate;
          gosiFollow(v);
          if (isEdit) return v.gosiDate !== g0 ? 'redraw' : undefined;
          const out = advOut(v);
          for (const r of v.lines || []) if (r && typeof r === 'object' && r.employeeId) advFor(r, out);
          return 'redraw';
        }
        const m = p.match(/^lines\.(\d+)\.employeeId$/);
        const row = m && v.lines[+m[1]];
        if (!row) return;
        // خصم الأيام يخص الموظف: خصم الموظف السابق التلقائي (أو الخانة الفارغة) يُستبدل بخصم الجديد،
        // وما كتبه المستخدم يبقى
        const ded = (d) => {
          if (!num(row.deductions) || (row._autoDed !== undefined && Math.abs(num(row.deductions) - num(row._autoDed)) < 0.005)) row.deductions = d;
          row._autoDed = d;
        };
        // استقطاع السلفة يخص الموظف: ما بقي من سلف الجديد في تاريخ الصرف (advFor)
        const adv = () => advFor(row, advOut(v));
        const e = empOf(row.employeeId);
        if (e) {
          // له راتب في الشهر: راتبه وتأميناته من بياناته (وخصم ما لم يعمله إن باشر أو ترك العمل أثناءه)؛
          // من ترك العمل قبل الشهر: سطر تسوية بلا راتب
          const pl = RB.isEmployeeActive(e, v.month) ? RB.payrollLine(e, S, v.month, v.date) : { basic: 0, housing: 0, allowances: 0, deductions: 0, gosiEe: 0, gosiEr: 0 };
          row.name = e.name;
          for (const k of ['basic', 'housing', 'allowances', 'gosiEe', 'gosiEr']) row[k] = pl[k];
          ded(num(pl.deductions));
          adv();
          if (pl.note) row.note = pl.note;
          else delete row.note;
          return 'redraw';
        }
        // عامل غير مسجل: لا خصم أيام له ولا سلفة (بقية السطر تبقى ليُعدّلها المستخدم)
        if (!row.employeeId) {
          ded(0);
          adv();
          delete row.note;
          return 'redraw';
        }
      },
      // انتهى تعديل الشهر: الأسطر المعروضة هي أساس التعديل التالي
      onLeave: (p) => {
        if (p === 'month') snap = null;
      },
      fields: [
        { type: 'row', fields: [{ k: 'month', type: 'month', label: 'الشهر', req: 1, redraw: true }, { k: 'date', type: 'date', label: 'تاريخ الصرف', req: 1, help: 'تُحمَّل التكلفة على الشهر المختار مهما كان تاريخ الصرف' }, { k: 'account', type: 'select', label: 'صُرفت من', options: payOptions(false, false) }, { k: 'gosiAccount', type: 'select', label: 'التأمينات سُددت من', options: payOptions(false, false) }, { k: 'gosiDate', type: 'date', label: 'تاريخ سداد التأمينات', help: 'تبقى حتى سدادها التزاماً «رواتب وتأمينات مستحقة» ولا تخرج من البنك يوم الرواتب. فارغ = مع الرواتب' }] },
        { type: 'html', html: (v) => (otherRun(v) ? `<p class="note bad">يوجد مسير مسجل لشهر ${esc(RB.monthName(v.month))}. الحفظ يضيف مسيراً ثانياً يتضاعف به مصروف الرواتب — للمكافآت أو الإضافي استخدم عمود «إضافي ومكافآت» في المسير الموجود.</p>` : '') },
        {
          k: 'lines',
          type: 'lines',
          label: 'الموظفون',
          addLabel: 'إضافة موظف',
          // اسم الموظف يدخل في اسم كل خانة لقارئ الشاشة: «الأساسي — سليم»
          rowName: (r) => r.name || (empOf(r.employeeId) || {}).name || '',
          // تعبئة من بيانات الموظفين لا تمسح ما أُدخل: الإضافي والخصومات والتأمينات المعدّلة والأسطر اليدوية تبقى.
          // ومسير التسوية: المكافأة بنظام العمل على الأجر الأخير لمن ترك العمل، كاملة أو عند الاستقالة
          tools: [
            {
              id: 'fill',
              label: 'تعبئة من بيانات الموظفين',
              run: (v, rows) => {
                if (!RB.isISOMonth(v.month)) return toast('اختر الشهر أولاً.', 'bad');
                rows.splice(0, rows.length, ...payrollFill(v.month, rows, linesYm, v.id, v.date));
                linesYm = v.month;
                snap = null;
              },
            },
            ...(settling
              ? [
                  ['eosbFull', 'المكافأة كاملة (المادة 84)', 'full'],
                  ['eosbResign', 'مكافأة الاستقالة (المادة 85)', 'resign'],
                ].map(([id, label, k]) => ({ id, label, run: (v, rows) => awardTool(v, rows, k) }))
              : []),
          ],
          newRow: () => ({ employeeId: '', name: '', basic: 0, housing: 0, allowances: 0, additions: 0, deductions: 0, gosiEe: 0, gosiEr: 0, eosbPaid: 0, advance: 0 }),
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
            // «أيام عمل 20»: من باشر أو ترك العمل أثناء الشهر، وخُصم ما لم يعمله
            Object.assign(nCol('deductions', 'خصومات وغياب'), { hint: (r) => (r.note ? esc(r.note) : '') }),
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
            // السلفة لا تغيّر الراتب ولا التأمينات: تُخصم مما يُحوَّل له، ورصيد سلفه في تاريخ الصرف تحتها،
            // وما سُدّد منه بعد ذلك (استقطاع في مسير لاحق أو سداد نقدي) فلا يُستقطع ثانية
            Object.assign(nCol('advance', 'استقطاع سلفة'), {
              min: 0,
              hint: (r, v) => {
                if (!r.employeeId) return '';
                const b = advBal(v)[r.employeeId] || 0;
                const room = Math.max(0, advOut(v)[r.employeeId] || 0);
                if (!(b > 0.005) && !(num(r.advance) > 0)) return '';
                return `سلفه <span class="n">${fmt(b)}</span>` + (b - room > 0.005 ? `<br>سُدّد منها لاحقاً <span class="n">${fmt(b - room)}</span>` : '');
              },
            }),
            // ما يُحوَّل للموظف: الصافي + مكافأة نهاية الخدمة المصروفة − السلفة المستقطعة
            { k: 'net', label: 'المحوَّل فعلياً', num: 1, calc: (r) => fmt(RB.payrollLineGross(r) - num(r.gosiEe) + Math.max(0, num(r.eosbPaid)) - Math.max(0, num(r.advance))) },
          ],
          help: '«مكافأة نهاية الخدمة المصروفة» تُكتب عند انتهاء خدمة الموظف فقط: تُخصم من مخصصه المتراكم (يظهر تحتها)، ولا تدخل في إجمالي الرواتب ولا في التأمينات. لموظف ترك العمل: «إضافة موظف» ثم اختره من القائمة. «استقطاع سلفة» يُخصم مما يُحوَّل للموظف ويسدّد سلفه، ولا يغيّر مصروف الرواتب.',
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
                // المكافأة بنظام العمل على أجره الأخير (المادة 84 كاملة، والمادة 85 عند الاستقالة) للمقارنة بالمخصص
                const w = RB.lastWage(S, e.id);
                const aw = RB.eosbAward(w, e.startDate, e.endDate);
                const law = aw.full > 0 ? ` (بنظام العمل على آخر أجر ${fmt(w)}: كاملة <span class="n">${fmt(aw.full)}</span>، وعند الاستقالة <span class="n">${fmt(aw.resign)}</span>)` : '';
                const head = `${esc(e.name)} ترك العمل في ${dtText(e.endDate)}: مخصصه <span class="n">${fmt(b)}</span>${law}`;
                if (!p) {
                  if (!(b > 0)) return '';
                  return `<li>${head}${e.eosbNone ? '، ولا مكافأة مستحقة له فيُرد إلى المصروف.' : '، ويبقى التزاماً حتى تُسجَّل مكافأته (هنا أو في مسير لاحق). إن لم تكن له مكافأة (كالاستقالة قبل سنتين) فاختر «لا مكافأة مستحقة» في بياناته.'}</li>`;
                }
                return `<li>${head}، يُصرف منه <span class="n">${fmt(Math.min(p, b))}</span>${rest > 0 ? `، ويُرد الباقي <span class="n">${fmt(rest)}</span> إلى المصروف (المكافأة المستحقة أقل من المخصص، كالاستقالة).` : rest < 0 ? `، والزيادة <span class="n">${fmt(-rest)}</span> مصروف في تاريخ الصرف.` : '.'}</li>`;
              })
              .join('');
            return `<div class="pv-grid"><div><span>إجمالي الرواتب</span>${money(t.gross)}</div><div><span>المحوَّل فعلياً</span>${money(t.netPaid + t.eosbPaid)}${t.adv || t.eosbPaid ? `<small>الصافي ${fmt(t.net)}${t.eosbPaid ? ` + نهاية الخدمة ${fmt(t.eosbPaid)}` : ''}${t.adv ? ` − سلف ${fmt(t.adv)}` : ''}</small>` : ''}</div><div><span>للتأمينات (الحصتان)</span>${money(t.gosiEe + t.gosiEr)}</div><div><span>التكلفة على المطعم</span>${money(t.cost)}</div></div>${t.eosbPaid ? `<p class="note">ويُصرف معه مكافأة نهاية الخدمة <b class="n">${fmt(t.eosbPaid)}</b> ${cur()} من المخصص المتراكم (ما زاد عليه مصروف في تاريخ الصرف).</p>` : ''}${settle ? `<ul class="note settle">${settle}</ul>` : ''}`;
          },
        },
        { k: 'note', label: 'ملاحظات' },
      ],
      // نظام حماية الأجور (مدد) وموعد سداد التأمينات
      preview: (v) =>
        (v.account === 'cash' || v.gosiAccount === 'cash' ? '<p class="note bad">نظام حماية الأجور يتطلب صرف رواتب العمال عبر الحساب البنكي ورفع ملف الأجور في منصة «مدد» شهرياً؛ الصرف النقدي قد يُعدّ عدم التزام ويعرّض المنشأة لإيقاف خدمات قوى.</p>' : '') +
        '<p class="note">اشتراكات التأمينات الاجتماعية تُسدَّد خلال أول 15 يوماً من الشهر التالي (آخر موعد يوم 15)، وبعده غرامة تأخير.</p>' +
        (RB.isISOMonth(v.month) && RB.isISODate(v.gosiDate) && v.gosiDate > RB.ymAdd(v.month, 1) + '-15' && RB.payrollTotals(v).gosiEe + RB.payrollTotals(v).gosiEr > 0 ? `<p class="note bad">تاريخ سداد التأمينات بعد آخر موعد (${dtText(RB.ymAdd(v.month, 1) + '-15')}): عليه غرامة تأخير.</p>` : '') +
        // صرف قبل بدء الدفتر لمطعم قائم: رصيد البنك الافتتاحي بعده، فيُخصم منه مرة ثانية
        (op0 && RB.isISODate(v.date) && v.date < op0.date ? `<p class="note bad">تاريخ الصرف قبل بدء الدفتر (${dtText(op0.date)}): الرواتب التي صُرفت قبله داخلة في الأرصدة الافتتاحية فلا تُسجَّل هنا؛ وإن صُرفت بعده فاجعل تاريخ الصرف تاريخها.</p>` : '') +
        overdrawNote('payroll', v),
      onSave: async (v) => {
        if (!v.lines.length) return 'المسير فارغ.';
        // السطر المكرر لموظف يضاعف استحقاق مخصصه (الخطأ تحت موظف السطر المكرر)
        const ids = v.lines.map((l) => l.employeeId || '');
        const di = ids.findIndex((id, i) => id && ids.indexOf(id) !== i);
        if (di >= 0) return { msg: 'الموظف مكرر في المسير: ' + ((empOf(ids[di]) || {}).name || '') + '. اجمع ما له في سطر واحد.', path: `lines.${di}.employeeId`, inline: 'مكرر في المسير' };
        // سطر راتب سالب (خصومات أكبر من الأجر) يقيّد رواتب سالبة ومالاً داخلاً للبنك
        const neg = v.lines.findIndex((l) => RB.payrollLineGross(l) < 0);
        if (neg >= 0) return { msg: `الخصومات أكبر من الراتب في السطر ${neg + 1}${v.lines[neg].name ? ' (' + v.lines[neg].name + ')' : ''}.`, path: `lines.${neg}.deductions`, inline: 'أكبر من الراتب' };
        // استقطاع السلفة مما يُصرف له (صافي الراتب ومكافأة نهاية الخدمة)، وأكبر من رصيد سلفه يُؤكَّد (السلفة لم تُسجَّل بعد مثلاً)
        const over = v.lines.findIndex((l) => num(l.advance) > RB.payrollLineGross(l) - num(l.gosiEe) + Math.max(0, num(l.eosbPaid)) + 0.005);
        if (over >= 0) return { msg: `استقطاع السلفة أكبر مما يُصرف للموظف في السطر ${over + 1}${v.lines[over].name ? ' (' + v.lines[over].name + ')' : ''}.`, path: `lines.${over}.advance`, inline: 'أكبر مما يُصرف له' };
        // وأكبر مما بقي من سلفه من تاريخ الصرف فصاعداً (بعد ما استُقطع منها في مسير لاحق أو سُدّد) يجعل رصيده سالباً
        const out = advOut(v);
        const more = v.lines.filter((l) => num(l.advance) > Math.max(0, out[l.employeeId || ''] || 0) + 0.005);
        if (more.length && !(await confirmBox(`استقطاع السلفة أكبر مما بقي من سلف الموظف (بعد ما استُقطع منها في مسيرات لاحقة أو سُدّد): ${more.map((l) => `${esc(l.name || (empOf(l.employeeId) || {}).name || 'عامل')} ${fmt(l.advance)} والباقي ${fmt(Math.max(0, out[l.employeeId || ''] || 0))}`).join('، ')}. الحفظ يجعل رصيد سلفه بالسالب. متابعة؟`, { ok: 'احفظ' }))) return false;
        v.lines.forEach((l) => {
          delete l._autoDed;
          delete l._autoAdv;
        });
        // مسير ثانٍ لنفس الشهر برواتب: يُؤكَّد (تعديل مسير قائم يُسأل فقط إن نُقل إلى شهر له مسير)
        if (otherRun(v) && RB.payrollTotals(v).gross > 0 && (!isEdit || v.month !== runMonth(rec)) && !(await confirmBox('يوجد مسير لنفس الشهر. حفظ مسير ثانٍ؟', { ok: 'احفظ' }))) return 'لم يُحفظ المسير.';
        upsert('payroll', v);
      },
    });
  };

  // سلفة استُقطعت في مسير رواتب: حذفها أو إنقاصها أو نقلها لموظف آخر أو لتاريخ بعد الاستقطاع يجعل رصيد سلف
  // الموظف سالباً (1106 دائن). يُمنع ما دام يزيد السالب، ويُعدَّل «استقطاع سلفة» في المسير أولاً.
  // next: قائمة السلف بعد التغيير، ids: الموظفون المتأثرون. يرجع رسالة المنع أو ''
  function advanceGuard(next, ids) {
    const T = Object.assign({}, S, { advances: next });
    for (const id of new Set(ids.filter(Boolean))) {
      const after = RB.advanceLow(T, id);
      if (after.min >= -0.005 || after.min >= RB.advanceLow(S, id).min - 0.005) continue;
      const e = S.employees.find((z) => z.id === id);
      return `هذه السلفة استُقطعت من راتب ${e ? e.name : 'الموظف'} في مسير الرواتب، ورصيد سلفه يصير ${fmt(after.min)} في ${dtText(after.date)}. عدّل «استقطاع سلفة» في المسير أولاً.`;
    }
    return '';
  }

  // سلفة عامل: صرف مبلغ له (أصل عليه في 1106)، أو سداد نقدي منه. الاستقطاع من الراتب في مسير الرواتب.
  // x: «repay:معرّف الموظف» من تنبيه سلفة من ترك العمل
  FORMS.advances = (rec, x, opts = {}) => {
    if (!S.employees.length) return toast('أضف العمال أولاً.', 'bad');
    const isEdit = editing(rec, opts);
    const m = /^(give|repay):(.+)$/.exec(String(x || ''));
    const ym = today().slice(0, 7);
    const emp0 = (m && S.employees.find((e) => e.id === m[2])) || S.employees.find((e) => RB.employeeStatus(e, ym) === 'active') || S.employees[0];
    // رصيده كله بلا هذه العملية (السلف وما استُقطع في كل المسيرات المسجلة)
    const bal = (v) => RB.advanceBalances(Object.assign({}, S, { advances: S.advances.filter((a) => a.id !== v.id) }), '9999-12-31')[v.employeeId] || 0;
    // من على رأس العمل أولاً، ثم من ترك العمل أو توقف (لسداد سلفه)
    const empOpts = (v) => {
      const st = (e) => RB.employeeStatus(e, ym);
      const list = S.employees.filter((e) => st(e) === 'active').concat(S.employees.filter((e) => st(e) !== 'active'));
      return list.map((e) => [e.id, e.name + (st(e) === 'active' ? '' : ' — ' + EMP_STATUS[st(e)])]).concat(v.employeeId && !S.employees.some((e) => e.id === v.employeeId) ? [[v.employeeId, 'موظف محذوف']] : []);
    };
    const value = rec || { id: RB.uid(), date: today(), employeeId: emp0.id, kind: m ? m[1] : 'give', amount: '', account: 'cash', note: '' };
    if (!rec && m && m[1] === 'repay') value.amount = r2(Math.max(0, bal(value))) || '';
    // مطعم قائم: سلفة على عامل قائمة عند بدء الدفتر (رصيد افتتاحي، RB.isOpeningAdvance) — بتاريخ البدء، بلا حركة في
    // الصندوق أو البنك، وقيمتها حقوق للشركاء حسب نسبهم
    const op = RB.openingInfo(S);
    const accOpts = (v) => [['cash', RB.PAY_LABEL.cash], ['bank', RB.PAY_LABEL.bank]].concat(v.kind !== 'repay' && (op || RB.isOpeningAdvance(value)) ? [['opening', RB.OPENING_LABEL.advances]] : []);
    return formModal({
      title: isEdit ? 'تعديل سلفة' : value.kind === 'repay' ? 'سداد سلفة' : 'سلفة عامل',
      value,
      onChange: (p, v) => {
        // السداد من العامل نقداً أو للبنك، لا رصيد افتتاحي
        if (p === 'kind' && v.kind === 'repay' && v.account === 'opening') v.account = 'cash';
        if (p === 'account' && v.account === 'opening' && !isEdit && op && RB.isISODate(v.date) && v.date > op.date) v.date = op.date;
        if (p === 'kind' || p === 'account') return 'redraw';
      },
      fields: (v) => [
        { type: 'row', fields: [{ k: 'date', type: 'date', label: RB.isOpeningAdvance(v) ? 'تاريخ بدء الدفتر' : 'التاريخ', req: 1 }, { k: 'employeeId', type: 'select', label: 'الموظف', options: empOpts }] },
        { type: 'row', fields: [{ k: 'kind', type: 'select', label: 'النوع', options: [['give', 'صرف سلفة للعامل'], ['repay', 'سداد نقدي من العامل']] }, { k: 'amount', type: 'money', label: RB.isOpeningAdvance(v) ? 'الباقي عليه عند بدء الدفتر' : 'المبلغ', req: 1, min: 0, check: (x) => (!(num(x.amount) > 0) ? 'أدخل مبلغاً أكبر من صفر' : x.kind === 'repay' && num(x.amount) > bal(x) + 0.005 ? `أكبر من رصيد سلفه المستحق (${fmt(Math.max(0, bal(x)))})` : '') }, { k: 'account', type: 'select', label: 'من / إلى', options: accOpts }] },
        { k: 'note', label: 'ملاحظة' },
      ],
      preview: (v) => {
        const b = bal(v);
        const after = r2(b + (v.kind === 'repay' ? -1 : 1) * num(v.amount));
        let h = `<p class="note">رصيد سلفه قبل هذه العملية: <b class="n">${fmt(b)}</b> · بعدها: <b class="n">${fmt(after)}</b> ${cur()}</p><p class="note">السلفة ليست مصروفاً: تُستقطع من راتبه في مسير الرواتب (عمود «استقطاع سلفة») فيبقى مصروف الرواتب كاملاً.</p>`;
        if (RB.isOpeningAdvance(v)) {
          const sh = RB.openingShares(S, num(v.amount), v.date);
          return h + `<p class="note">سلفة قائمة عند بدء الدفتر: رصيد افتتاحي على العامل بلا حركة في الصندوق أو البنك، وقيمتها حقوق للشركاء حسب نسبهم${sh.length ? ': ' + sh.map((z) => `${esc((S.partners.find((p) => p.id === z.partnerId) || {}).name || '')} <b class="n">${fmt(z.amount)}</b>`).join(' · ') : ''}.</p>` + (sh.length ? '' : '<p class="note bad">أضف الشركاء أولاً: قيمتها تُسجَّل حقوقاً لهم.</p>');
        }
        // سلفة بتاريخ قبل بدء الدفتر من الصندوق أو البنك: تُخصم من رصيدهما الافتتاحي مرة ثانية
        if (op && v.kind !== 'repay' && RB.isISODate(v.date) && v.date < op.date) h += `<p class="note bad">تاريخ السلفة قبل بدء الدفتر (${dtText(op.date)}): أرصدة الصندوق والبنك الافتتاحية بعدها، فتُخصم منها مرة ثانية. إن كانت قائمة على العامل عند البدء فاختر في «من / إلى»: «${RB.OPENING_LABEL.advances}» بالباقي عليه.</p>`;
        return h + overdrawNote('advances', v);
      },
      onSave: (v) => {
        if (RB.isOpeningAdvance(v) && !S.partners.length) return { msg: 'أضف الشركاء أولاً: قيمة السلفة القائمة قبل بدء الدفتر تُسجَّل حقوقاً لهم حسب نسبهم.', path: 'account', inline: 'أضف الشركاء أولاً' };
        if (v.kind === 'repay' && v.account === 'opening') v.account = 'cash';
        v.amount = num(v.amount);
        const block = advanceGuard(S.advances.filter((a) => a && a.id !== v.id).concat([v]), [v.employeeId, rec && rec.employeeId]);
        if (block) return { msg: block, path: 'amount', inline: 'استُقطعت في مسير الرواتب' };
        upsert('advances', v);
      },
    });
  };

  FORMS.purchases = (rec, x, opts = {}) => {
    const set = S.settings;
    const isEdit = editing(rec, opts);
    // مادة حُذفت بعد الفاتورة: تظهر «(مادة محذوفة)» (الوصف يبقى باسمها) بدل «بند حر» وقيمتها باقية
    const rawOpts = (row) =>
      [['', '— بند حر —']].concat(
        S.raw.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar')).map((x) => [x.id, x.name + (x.buyUnit ? ' (' + x.buyUnit + ')' : '')]),
        row && row.rawId && !S.raw.some((x) => x.id === row.rawId) ? [[row.rawId, '(مادة محذوفة)']] : []
      );
    const last = S.purchases.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const payOpts = payOptions(true);
    // ما غيّره المستخدم بنفسه من هذه الإعدادات لا تغيّره ذاكرة المورد
    const MEM = RB.SUPPLIER_MEM_KEYS;
    const touched = {};
    // memo: ما طبّقته ذاكرة المورد (RB.supplierMemoryStep)، وmemoToast تنبيهه
    let memo = null;
    let memoToast = null;
    const memOK = { category: (x) => RB.PURCHASE_CATS.some((c) => c.id === x), account: (x) => payOpts.some((o) => o[0] === x), taxable: () => true, includesVat: () => true };
    const memText = {
      category: (v) => (RB.PURCHASE_CATS.find((c) => c.id === v.category) || {}).name || v.category,
      account: (v) => (payOpts.find((o) => o[0] === v.account) || [0, v.account])[1],
      taxable: (v) => (v.taxable ? 'خاضعة للضريبة' : 'غير خاضعة للضريبة'),
      includesVat: (v) => (v.includesVat ? 'المبالغ شاملة الضريبة' : 'المبالغ قبل الضريبة'),
    };
    // السعر المعبأ من المادة الخام (row._auto مؤقت لا يُحفظ) يتبع «خاضع» و«شامل الضريبة» ما دام لم يُعدَّل
    const reprice = (v) => {
      for (const row of v.lines || []) {
        if (!row || row._auto === undefined) continue;
        const raw = row.rawId && S.raw.find((x) => x.id === row.rawId);
        if (raw && num(row.price) === num(row._auto)) row.price = row._auto = RB.autoLinePrice(raw, v.includesVat, v.taxable, set);
        else delete row._auto;
      }
    };
    return formModal({
      title: isEdit ? 'تعديل فاتورة مشتريات' : 'فاتورة مشتريات',
      wide: true,
      // نسخة فاتورة: أسعارها المنسوخة (row._copy مؤقت) لا تُحدّث أسعار المواد الخام إلا إن عُدّلت،
      // فلا ترجع نسخة فاتورة قديمة سعر مادة إلى سعرها القديم
      value: isEdit
        ? Object.assign({ updatePrices: false }, rec)
        : rec
          ? Object.assign({}, rec, { updatePrices: true, lines: (rec.lines || []).map((l) => Object.assign({}, l, l.rawId ? { _copy: l.price } : {})) })
          : { id: RB.uid(), date: today(), supplier: '', invoiceNo: '', category: 'food', account: 'bank', taxable: true, includesVat: false, lines: [{ rawId: '', desc: '', qty: 1, price: '' }], note: '', updatePrices: true },
      onChange: (p, v) => {
        if (MEM.includes(p)) touched[p] = true;
        const m = p.match(/^lines\.(\d+)\.(rawId|price)$/);
        if (m) {
          const row = v.lines[+m[1]];
          if (!row) return;
          // ربط السطر بمادة يعبّئ السعر من المادة فقط إن كان فارغاً أو ما زال ما عبّأه البرنامج أو ما نُسخ: سعر كتبه
          // المستخدم من الفاتورة (أو المحفوظ عند تعديلها) يبقى، فلا يتغير مبلغ الفاتورة، وتتعلمه المادة عند الحفظ
          const autoP = row.price === '' || row.price === undefined || row.price === null || (row._auto !== undefined && num(row.price) === num(row._auto)) || (row._copy !== undefined && num(row.price) === num(row._copy));
          // سعر كتبه المستخدم لا يُحوَّل مع خيارات الضريبة
          delete row._copy;
          if (m[2] === 'price') {
            delete row._auto;
            return;
          }
          const raw = S.raw.find((x) => x.id === row.rawId);
          if (raw) {
            // الوصف كذلك: الفارغ أو اسم مادة أخرى يصير اسمها، والمكتوب يبقى
            if (!String(row.desc || '').trim() || S.raw.some((x) => x.name === row.desc)) row.desc = raw.name;
            const ap = RB.autoLinePrice(raw, v.includesVat, v.taxable, set);
            if (autoP) row.price = row._auto = ap;
            else {
              delete row._auto;
              if (Math.abs(num(row.price) - ap) > 0.005) toast(`أُبقي السعر ${fmt(num(row.price))} كما في الفاتورة — آخر سعر مسجل لـ«${raw.name}» ${fmt(ap)}`);
            }
          } else delete row._auto;
          return 'redraw';
        }
        let again = p === 'includesVat' || p === 'taxable';
        if (p === 'supplier' && !isEdit) {
          // ذاكرة المورد: إعدادات آخر فاتورة منه، إلا ما غيّره المستخدم بنفسه، وتظهر في النموذج قبل الحفظ.
          // إن لم يعد الاسم اسمه (مورد جديد يبدأ اسمه باسمه أثناء الكتابة، أو مُسح) تعود الإعدادات التي غيّرتها
          // ويُزال تنبيهها (RB.supplierMemoryStep)
          const st = RB.supplierMemoryStep(v, S.purchases, memo, touched, (k, x) => memOK[k](x));
          memo = st.memo;
          if (st.dropped && memoToast) {
            memoToast.remove();
            memoToast = null;
          }
          const txt = st.applied.filter((k) => k !== 'includesVat' || v.taxable).map((k) => memText[k](v));
          if (txt.length) memoToast = toast('طُبّقت إعدادات آخر فاتورة من هذا المورد: ' + txt.join(' · ') + ' — يمكنك تغييرها');
          if (st.changed) again = true;
        }
        if (again) {
          reprice(v);
          return 'redraw';
        }
      },
      fields: [
        { type: 'row', fields: [{ k: 'date', type: 'date', label: 'التاريخ', req: 1 }, { k: 'supplier', label: 'المورد', req: 1, list: () => [...new Set(S.purchases.map((p) => p.supplier).filter(Boolean))], placeholder: last ? last.supplier : '' }, { k: 'invoiceNo', label: 'رقم الفاتورة' }] },
        { type: 'row', fields: [{ k: 'category', type: 'select', label: 'التصنيف', options: RB.PURCHASE_CATS.map((c) => [c.id, c.name]) }, { k: 'account', type: 'select', label: 'الدفع', options: payOpts, help: 'آجل = يُسدد للمورد لاحقاً' }] },
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
            { k: 'qty', label: 'الكمية', type: 'num', num: 1, neg: 1 },
            { k: 'price', label: 'سعر الوحدة', type: 'num', num: 1, min: 0 },
            { k: 'total', label: 'المجموع', num: 1, calc: (row) => fmt(num(row.qty) * num(row.price)) },
          ],
          foot: (v) => vatPreview(RB.purchaseTotal(v), v.includesVat, v.taxable, v.date, v.account),
          help: 'اربط السطر بالمادة الخام لتتحدث تكلفتها تلقائياً. الكمية بوحدة الشراء (كرتون، كيس…). مرتجع أو إشعار دائن من المورد؟ أدخل الكمية بالسالب والسعر موجباً.',
        },
        { k: 'updatePrices', type: 'check', label: 'تحديث أسعار المواد الخام من هذه الفاتورة' },
        { k: 'note', label: 'ملاحظات' },
      ],
      preview: (v) => overdrawNote('purchases', v),
      onSave: (v) => {
        const keep = (l) => num(l.qty) || num(l.price) || l.desc || l.rawId;
        // رقم أول سطر غير فارغ في النموذج (قبل حذف الفارغة): خطأ المبلغ تحت سعره
        const at = Math.max(0, v.lines.findIndex(keep));
        v.lines = v.lines.filter(keep);
        if (!v.lines.length) return { msg: 'أضف صنفاً واحداً على الأقل.', path: 'lines.0.rawId', inline: 'اختر المادة أو اكتب الوصف' };
        // فاتورة بلا مبلغ (لا سطر بكمية وسعر): لا أثر لها. السطر بسعر صفر (بضاعة مجانية) يُقبل مع أسطر بسعرها
        if (!v.lines.some((l) => Math.abs(num(l.qty) * num(l.price)) >= 0.005)) return { msg: 'الفاتورة بلا مبلغ: أدخل الكمية وسعر الوحدة.', path: `lines.${at}.price`, inline: 'أدخل سعر الوحدة' };
        // السعر المعبأ تلقائياً من المادة الخام لا يحمل سعراً جديداً لها
        const typed = v.lines.filter((l) => !(l._auto !== undefined && num(l.price) === num(l._auto)) && !(l._copy !== undefined && num(l.price) === num(l._copy)));
        v.lines.forEach((l) => {
          delete l._auto;
          delete l._copy;
        });
        const updPrices = v.updatePrices;
        delete v.updatePrices;
        if (upsert('purchases', v) === false) return false;
        if (updPrices) {
          // فاتورة أقدم من آخر سعر مسجل للمادة (فاتورة متأخرة الإدخال) لا ترجع سعرها إلى سعر قديم
          const all = RB.rawPriceUpdates(Object.assign({}, v, { lines: typed }), S.raw, set);
          const older = all.filter((c) => {
            const h = RB.rawPriceHistory(S, c.id, v.id);
            return h.length && v.date < h[0].date;
          });
          const ch = all.filter((c) => !older.includes(c));
          for (const c of ch) {
            const raw = S.raw.find((x) => x.id === c.id);
            if (raw) upsert('raw', Object.assign({}, raw, { price: c.price, taxable: !!v.taxable }));
          }
          const msg = [];
          if (ch.length) msg.push(`تحدّث سعر ${ch.length} من المواد الخام وتكلفة الوصفات المرتبطة بها: ` + ch.map((c) => `${c.name}: ${ltr(fmt(c.old) + ' → ' + fmt(c.price))}`).join('، '));
          if (older.length) msg.push(`لم يُحدَّث سعر ${cnt(older.length, W.material, { gen: true })} لأن الفاتورة أقدم من آخر سعر مسجل`);
          if (msg.length) toast(msg.join(' · '));
        }
      },
    });
  };

  FORMS.supplierPayments = (rec, x, opts = {}) => {
    const isEdit = editing(rec, opts);
    const bal = RB.supplierBalances(S, today());
    // المبلغ المقترح = المستحق على المورد المختار (إن كان له رصيد)
    const owed = (name) => {
      const b = bal.find((z) => z.supplier === String(name || '').trim());
      return b && b.balance > 0.005 ? r2(b.balance) : '';
    };
    const sup = x || (bal.find((b) => b.balance > 0.005) || {}).supplier || '';
    let auto = owed(sup);
    return formModal({
      title: isEdit ? 'تعديل سداد مورد' : 'سداد مورد',
      value: rec || { id: RB.uid(), date: today(), supplier: sup, account: 'bank', amount: auto, note: '' },
      // تغيير المورد يغيّر المبلغ المقترح، ما لم يكتب المستخدم مبلغاً بنفسه
      onChange: (p, v) => {
        if (p !== 'supplier' || isEdit) return;
        const was = v.amount;
        if (v.amount === '' || v.amount === auto) v.amount = auto = owed(v.supplier);
        if (v.amount !== was) return 'redraw';
      },
      // المورد بلا إعادة رسم أثناء الكتابة: المعاينة تتحدث، والمبلغ المقترح يُرسم فقط إن تغيّر
      fields: [
        { type: 'row', fields: [{ k: 'date', type: 'date', label: 'التاريخ', req: 1 }, { k: 'supplier', label: 'المورد', req: 1, list: () => bal.map((b) => b.supplier) }] },
        { type: 'row', fields: [{ k: 'amount', type: 'money', label: 'المبلغ', req: 1, min: 0, check: posCheck('amount') }, { k: 'account', type: 'select', label: 'من', options: payOptions(false) }] },
        { k: 'note', label: 'ملاحظة' },
      ],
      preview: (v) => {
        const b = bal.find((z) => z.supplier === (v.supplier || '').trim());
        return (b ? `<p class="note">الرصيد المستحق لهذا المورد: <b class="n">${fmt(b.balance)}</b> ${cur()}</p>` : '') + overdrawNote('supplierPayments', v);
      },
      onSave: (v) => upsert('supplierPayments', v),
    });
  };

  FORMS.raw = (rec, x, opts = {}) =>
    formModal({
      title: editing(rec, opts) ? 'تعديل مادة خام' : 'مادة خام جديدة',
      // وحدة الشراء وعدد وحدات الاستخدام فيها بلا قيمة افتراضية (كانت «كرتون = 1 جم» فيُحفظ الاسم والسعر وحدهما فتصير
      // تكلفة الجرام ثمن كرتون): كلاهما مطلوب، فيُدخل المستخدم التحويل الذي تُبنى عليه تكلفة الوصفات
      value: rec || { id: RB.uid(), name: '', category: 'لحوم', supplier: '', buyUnit: '', packQty: '', useUnit: 'جم', price: '', taxable: true, wastePct: 0 },
      fields: [
        { type: 'row', fields: [{ k: 'name', label: 'اسم المادة', req: 1 }, { k: 'category', type: 'select', label: 'الفئة', options: RB.RAW_CATS }] },
        { k: 'supplier', label: 'المورد المعتاد', list: () => [...new Set(S.purchases.map((p) => p.supplier).filter(Boolean))] },
        { type: 'section', label: 'كيف تشتريها وكيف تستخدمها' },
        { type: 'row', fields: [{ k: 'buyUnit', label: 'وحدة الشراء', req: 1, placeholder: 'كرتون 10 كجم' }, { k: 'price', type: 'money', label: 'سعر وحدة الشراء (بدون ضريبة)', req: 1, min: 0 }] },
        { type: 'row', fields: [{ k: 'useUnit', type: 'select', label: 'وحدة الاستخدام في الوصفات', options: RB.UNITS, redraw: true }, { k: 'packQty', type: 'num', label: 'كم وحدة استخدام في وحدة الشراء؟', req: 1, min: 0, check: (x) => (num(x.packQty) > 0 ? '' : 'يجب أن تكون أكبر من صفر'), help: 'كرتون 10 كجم بوحدة جم = 10000' }] },
        { type: 'row', fields: [{ k: 'wastePct', type: 'num', label: 'نسبة الهدر %', min: 0, max: 95, help: 'تقشير، تقطيع، تلف' }, { k: 'taxable', type: 'check', label: 'خاضعة لضريبة القيمة المضافة', help: 'حسب المورد المعتاد: أزلها فقط إذا كان المورد غير مسجل في الضريبة' }] },
      ],
      preview: (v) => {
        if (!(num(v.packQty) > 0)) return `<p class="note">أدخل كم ${esc(v.useUnit)} في وحدة الشراء${String(v.buyUnit || '').trim() ? ` («${esc(v.buyUnit)}»)` : ''} لحساب تكلفة ${esc(v.useUnit)} في الوصفات.</p>`;
        const u = RB.rawUnitCost(v, S);
        // وحدة الشراء غير وحدة الاستخدام وفيها وحدة واحدة فقط (كرتون = 1 جم): غالباً لم يُدخل التحويل
        const one = num(v.packQty) === 1 && String(v.buyUnit || '').trim() && String(v.buyUnit).trim() !== v.useUnit ? `<p class="note bad">وحدة الشراء «${esc(v.buyUnit)}» = 1 ${esc(v.useUnit)} فقط؟ تأكد من العدد: كرتون 10 كجم بوحدة جم = 10000.</p>` : '';
        return `${one}<div class="pv-grid"><div><span>تكلفة 1 ${esc(v.useUnit)}</span><b class="n">${u.toFixed(4)}</b></div><div><span>تكلفة 100 ${esc(v.useUnit)}</span><b class="n">${fmt(u * 100)}</b></div><div><span>تكلفة 1000 ${esc(v.useUnit)}</span><b class="n">${fmt(u * 1000)}</b></div></div>`;
      },
      onSave: (v) => upsert('raw', v),
    });

  // كمية الجرد تبدأ فارغة («لم تُعدّ»): الحفظ بلا كمية لكل المواد يُرفض، وببعضها يُسأل عنه بأسمائها (تُحسب صفراً = نفدت
  // فتدخل قيمتها في تكلفة المواد)؛ الصفر الذي يكتبه المستخدم كمية حقيقية
  FORMS.stockCounts = (rec, x, opts = {}) => {
    const all = () => S.raw.slice().sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name, 'ar')).map((x) => ({ rawId: x.id, qty: '', price: x.price }));
    const uncounted = (row) => !!row && !!row.rawId && RB.isBlankQty(row.qty);
    return formModal({
      title: editing(rec, opts) ? 'تعديل جرد' : 'جرد المخزون',
      wide: true,
      // من تنبيه الجرد الافتتاحي: بتاريخ اليوم السابق للافتتاح
      value: rec || { id: RB.uid(), date: RB.isISODate(x) ? x : today(), note: RB.isISODate(x) && x < (S.settings.openingDate || '') ? 'جرد افتتاحي' : '', lines: all() },
      onChange: (p, v) => {
        const m = p.match(/^lines\.(\d+)\.rawId$/);
        if (m) {
          const raw = S.raw.find((x) => x.id === v.lines[+m[1]].rawId);
          if (raw) v.lines[+m[1]].price = raw.price;
          return 'redraw';
        }
      },
      fields: [
        { type: 'row', fields: [{ k: 'date', type: 'date', label: 'تاريخ الجرد', req: 1 }, { k: 'note', label: 'ملاحظة' }] },
        {
          k: 'lines',
          type: 'lines',
          label: 'الكميات الموجودة (بوحدة الشراء، ويمكن كسور مثل 1.5) — اكتب 0 لما نفد',
          // الأداة تضيف المواد التي ليس لها سطر (مادة جديدة مثلاً) بلا كمية، ولا تمس الكميات المدخلة
          tools: [{ id: 'all', label: 'إضافة المواد الناقصة', run: (v, rows) => all().filter((n) => !rows.some((r) => r.rawId === n.rawId)).forEach((n) => rows.push(n)) }],
          newRow: () => ({ rawId: '', qty: '', price: 0 }),
          cols: [
            // مادة حُذفت بعد الجرد: سطرها يبقى بقيمته ويظهر «(مادة محذوفة)» بدل «—»
            { k: 'rawId', label: 'المادة', type: 'select', options: (row) => [['', '—']].concat(S.raw.map((x) => [x.id, x.name]), row.rawId && !S.raw.some((x) => x.id === row.rawId) ? [[row.rawId, '(مادة محذوفة)']] : []), redraw: true, w: '12rem' },
            { k: 'unit', label: 'الوحدة', calc: (row) => esc((S.raw.find((x) => x.id === row.rawId) || {}).buyUnit || '') },
            { k: 'qty', label: 'الكمية', type: 'num', num: 1, min: 0 },
            { k: 'price', label: 'سعر الشراء (بدون ضريبة)', type: 'num', num: 1, min: 0 },
            { k: 'value', label: 'القيمة', num: 1, calc: (row, v) => (uncounted(row) ? '<span class="muted">لم تُعدّ</span>' : fmt(num(row.qty) * RB.stockLinePrice(row, S, v.date))) },
          ],
          foot: (v) => {
            const n = RB.uncountedRaw(v.lines).length;
            return `<div class="pv-grid"><div><span>قيمة المخزون</span>${money(RB.stockValue(v, S))}${n ? `<small>لم تُدخل كمية ${cnt(n, W.material, { gen: true })} بعد</small>` : ''}</div></div>${RB.isVatReg(S.settings, v.date) ? '' : '<p class="note">المطعم غير مسجل في الضريبة: قيمة الجرد تشمل الضريبة للمواد الخاضعة لأنها جزء من التكلفة</p>'}`;
          },
        },
      ],
      // مطعم قائم (أرصدة افتتاحية): المخزون الافتتاحي هو مخزون صباح بدء الدفتر. الجرد قبله لا يدخل الحسابات، والجرد في
      // تاريخ البدء يُقارن به؛ وبلا قيمة مخزون فيها تُحسب قيمة الجرد كلها ربحاً لا حقوقاً افتتاحية
      preview: (v) => {
        const op = RB.openingInfo(S);
        if (!op || !RB.isISODate(v.date) || v.date > op.date) return '';
        const val = RB.stockValue(v, S);
        if (op.inventory) {
          if (v.date < op.date) return `<p class="note bad">تاريخ الجرد قبل بدء الدفتر (${dtText(op.date)}): «قيمة المخزون» في الأرصدة الافتتاحية (<b class="n">${fmt(op.inventory)}</b>) هي مخزون صباح بدء الدفتر، فلا يدخل هذا الجرد في الحسابات. لتصحيح المخزون الافتتاحي عدّل «قيمة المخزون» في الأرصدة الافتتاحية، أو اجعل تاريخ الجرد يوم بدء الدفتر.</p>`;
          return Math.abs(val - op.inventory) >= 0.5 ? `<p class="note">قيمة هذا الجرد تختلف عن «قيمة المخزون» في الأرصدة الافتتاحية (<b class="n">${fmt(op.inventory)}</b>): الفرق <b class="n">${fmt(val - op.inventory)}</b> يُحسب في تكلفة المواد لأول شهر. إن كان هذا هو الجرد الافتتاحي فاجعل «قيمة المخزون» في الأرصدة الافتتاحية <b class="n">${fmt(val)}</b>.</p>` : '';
        }
        return `<p class="note bad">الأرصدة الافتتاحية بلا «قيمة المخزون»: أدخل فيها قيمة هذا الجرد (<b class="n">${fmt(val)}</b>) من «الإعدادات ← أرصدة افتتاحية»، وإلا تُحسب قيمته كلها ${v.date < op.date ? 'ربحاً قبل بدء الدفتر' : 'تخفيضاً لتكلفة المواد (ربحاً) في أول شهر'} لا حقوقاً افتتاحية للشركاء.</p>`;
      },
      onSave: async (v) => {
        const blank = RB.uncountedRaw(v.lines);
        if (blank.length) {
          const at = (v.lines || []).findIndex(uncounted);
          if (blank.length === new Set((v.lines || []).filter((l) => l && l.rawId).map((l) => l.rawId)).size) return { msg: 'لم تُدخل أي كمية: اكتب الكمية الموجودة من كل مادة (0 لما نفد منها).', path: `lines.${at}.qty`, inline: 'أدخل الكمية' };
          const names = blank.slice(0, 4).map((id) => RB.itemName(S, 'raw', id)).join('، ') + (blank.length > 4 ? '…' : '');
          if (!(await confirmBox(`لم تُدخل كمية ${cnt(blank.length, W.material, { gen: true })} (${esc(names)}). ${blank.length === 1 ? 'تُحسب صفراً، أي نفدت' : 'تُحسب صفراً، أي نفدت كلها'} ولم يبقَ منها شيء، فتدخل قيمتها في تكلفة المواد. هل تحفظ؟`, { ok: 'احفظها صفراً' }))) {
            focusLater(`lines.${at}.qty`);
            return false;
          }
          for (const l of v.lines) if (uncounted(l)) l.qty = 0;
        }
        // المادة المكررة في الجرد سطر واحد: تُجمع كمياتها ويبقى سعر أول سطر
        const mg = RB.mergeStockLines(v.lines);
        v.lines = mg.lines;
        if (upsert('stockCounts', v) === false) return false;
        if (mg.merged.length) toast('جُمعت أسطر المادة المكررة في سطر واحد: ' + mg.merged.map((id) => RB.itemName(S, 'raw', id)).join('، '));
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
            const o = [['', '— اختر —']].concat(ok.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar')).map((x) => [x.id, x.name]));
            // مكوّن محفوظ لم يعد موجوداً: يظهر كما هو (لا «اختر» وقيمته باقية)، ويُرفض عند الحفظ
            if (row.id && !list.some((x) => x.id === row.id)) o.push([row.id, '(مكوّن محذوف)']);
            return o;
          },
        },
        { k: 'qty', label: 'الكمية', type: 'num', num: 1, min: 0 },
        { k: 'unit', label: 'الوحدة', calc: (row) => esc(row.id ? RB.itemUnit(S, row.kind, row.id) : '') },
        { k: 'cost', label: 'التكلفة', num: 1, calc: (row) => (row.id ? fmt(costing().unit(row.kind, row.id) * num(row.qty)) : '') },
      ],
      help: kind === 'prod' ? 'أضف التغليف (علبة، كيس، مناديل) كمواد خام ليدخل في التكلفة. الوجبة المركّبة تضم أصنافاً من المنيو.' : 'الكمية بوحدة استخدام المكوّن.',
    };
  }
  const withRec = (section, v) => Object.assign({}, S, { [section]: S[section].filter((x) => x.id !== v.id).concat([v]) });
  // تغيير نوع المكوّن في السطر يفرّغ المكوّن: المعرّف القديم لا يخص قائمة النوع الجديد (كان يُحفظ «(محذوف)»)
  const recipeKindChange = (p, v) => {
    const m = /^items\.(\d+)\.kind$/.exec(p);
    if (m && v.items && v.items[+m[1]]) v.items[+m[1]].id = '';
  };
  // أسطر الوصفة: الفارغ يُحذف، والسطر بكمية ومكوّن غير صالح يُرفض برقمه (والخطأ تحت مكوّنه)
  const recipeSave = (v) => {
    const r = RB.recipeItems(S, v.items);
    if (r.bad) return { msg: 'مكوّن غير صالح في السطر ' + r.bad, path: `items.${r.bad - 1}.id`, inline: 'اختر مكوّناً' };
    v.items = r.items;
  };

  FORMS.composites = (rec, x, opts = {}) =>
    formModal({
      title: editing(rec, opts) ? 'تعديل منتج مجمّع' : 'منتج مجمّع جديد',
      wide: true,
      value: rec || { id: RB.uid(), name: '', yieldQty: 1, yieldUnit: 'حبة', items: [{ kind: 'raw', id: '', qty: '' }], note: '' },
      onChange: recipeKindChange,
      fields: [
        { type: 'row', fields: [{ k: 'name', label: 'الاسم', req: 1, placeholder: 'مثال: صوص البرقر الخاص' }, { k: 'yieldQty', type: 'num', label: 'الكمية الناتجة من الوصفة', req: 1, min: 0, check: (x) => (num(x.yieldQty) > 0 ? '' : 'يجب أن تكون أكبر من صفر') }, { k: 'yieldUnit', type: 'select', label: 'وحدتها', options: RB.UNITS, redraw: true }] },
        itemsField('comp', rec && rec.id, 'المكونات'),
        { k: 'note', label: 'ملاحظات' },
      ],
      preview: (v) => {
        const tmp = withRec('composites', v);
        const b = RB.breakdown(tmp, v, 'comp', RB.costing(tmp));
        return `<div class="pv-grid"><div><span>تكلفة الوصفة كاملة</span>${money(b.total)}</div><div><span>تكلفة 1 ${esc(v.yieldUnit)}</span><b class="n">${b.perUnit.toFixed(4)}</b></div></div>`;
      },
      onSave: (v) => {
        const bad = recipeSave(v);
        if (bad) return bad;
        upsert('composites', v);
      },
    });

  FORMS.products = (rec, x, opts = {}) => {
    // أسعار المنيو شاملة الضريبة للمطعم المسجل فقط
    const incl = RB.isVatReg(S.settings, today()) ? ' (شامل الضريبة)' : '';
    return formModal({
      title: editing(rec, opts) ? 'تعديل صنف' : 'صنف جديد في المنيو',
      wide: true,
      value: rec ? Object.assign({ competitors: [] }, rec) : { id: RB.uid(), name: '', category: 'برقر', price: '', appPrice: '', active: true, items: [{ kind: 'raw', id: '', qty: '' }], competitors: [], note: '' },
      onChange: recipeKindChange,
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
            { k: 'price', label: 'السعر', type: 'num', num: 1, min: 0 },
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
        const bad = recipeSave(v);
        if (bad) return bad;
        v.competitors = (v.competitors || []).filter((c) => c.name || num(c.price));
        upsert('products', v);
      },
    });
  };

  function productAnalysisHTML(St, p, C, short) {
    const st = RB.productStats(St, p, C);
    const target = num(St.settings.targetFoodCost);
    let h = `<div class="pv-grid"><div><span>التكلفة</span>${money(st.cost)}</div><div><span>${RB.isVatReg(St.settings, today()) ? 'السعر بدون الضريبة' : 'سعر البيع (غير مسجل في الضريبة)'}</span>${money(st.priceNet)}</div><div><span>تكلفة الطعام</span><b class="n ${{ bad: 'neg', warn: 'warn' }[fcLevel(st.foodCost, target)] || ''}">${pct(st.foodCost)}</b><small>المستهدف ${pct(target, 0)}</small></div><div><span>ربح الحبة</span>${money(st.profit)}</div></div>`;
    const tips = [];
    if (st.suggested && st.price && st.suggested > st.price + 0.01) tips.push(`لتحقيق تكلفة طعام ${pct(target, 0)} يكون السعر ${fmt(st.suggested)} ${cur()}.`);
    if (st.market) tips.push(`السوق: من ${fmt(st.market.min)} إلى ${fmt(st.market.max)} (المتوسط ${fmt(st.market.avg)}). سعرك ${st.vsMarket > 0 ? 'أعلى' : 'أقل'} بـ ${pct(Math.abs(st.vsMarket), 0)}.`);
    if (st.avgApp) tips.push(`في التطبيقات بسعر ${fmt(st.appPrice)}: ربح الحبة ${fmt(st.avgApp.profit)} بعد العمولة. للحفاظ على نفس ربح المحل يلزم ${fmt(st.avgApp.keepPrice)}.`);
    if (tips.length) h += `<ul class="tips">${tips.map((t) => `<li>${t}</li>`).join('')}</ul>`;
    if (short) return h;
    if (st.apps.length) h += `<h3 class="sub-h">ربح الصنف في كل تطبيق</h3>` + table([{ h: 'التطبيق', f: (a) => esc(a.name) }, { h: 'العمولة', num: 1, f: (a) => rate(a.feePct) }, { h: 'العمولة بالريال', num: 1, f: (a) => N(a.commission) }, { h: 'ربح الحبة', num: 1, f: (a) => N(a.profit) }, { h: 'الهامش', num: 1, f: (a) => pct(a.margin, 0) }, { h: 'السعر المكافئ لربح المحل', num: 1, f: (a) => N(a.keepPrice) }], st.apps);
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

  FORMS.sales = (rec, x, opts = {}) => {
    const isEdit = editing(rec, opts);
    // القنوات المفعّلة، والموقوفة التي لها مبيعات في الإقفال المحفوظ
    const chs = S.settings.channels.filter((c) => c.active !== false || (isEdit && rec.channels && rec.channels[c.id]));
    // اليوم الافتراضي: المطلوب (من تنبيه يوم بلا إقفال)، أو أمس إن كان آخر إقفال قبله مباشرة (إقفال الأمس صباحاً)، وإلا اليوم
    const lastClose = good(S.sales).reduce((m, z) => (z.date > m ? z.date : m), '');
    // الإقفالات حين فُتح النموذج: إقفال لليوم نفسه يصل بعدها (الشريك أو نافذة أخرى) يُسأل عنه عند الحفظ
    const known = new Set(S.sales.map((z) => String(z.id)));
    const yest = RB.addDays(today(), -1);
    const day0 = RB.isISODate(x) ? x : lastClose && RB.addDays(lastClose, 1) === yest ? yest : today();
    const base = { id: RB.uid(), date: day0, channels: {}, items: [], note: '' };
    chs.forEach((c) => (base.channels[c.id] = { amount: '', orders: '' }));
    const v0 = rec ? clone(rec) : base;
    v0.channels = v0.channels || {};
    // سجل جديد من نسخة: لا قناة مخفية (موقوفة أو محذوفة) تُحسب أو تُحفظ دون أن تظهر
    if (!isEdit) for (const id of Object.keys(v0.channels)) if (!chs.some((c) => c.id === id)) delete v0.channels[id];
    chs.forEach((c) => (v0.channels[c.id] = v0.channels[c.id] || { amount: '', orders: '' }));
    // الأصناف المفعّلة، وصنف السطر إن لم يعد مفعّلاً أو حُذف (الإقفال القديم يظهر كما حُفظ لا «اختر»)
    // تعديل إقفال نُقل تاريخه إلى يوم له إقفال آخر، وهل يبقى يومه السابق بلا إقفال
    const movedOnto = (v) => isEdit && RB.isISODate(v.date) && v.date !== rec.date && good(S.sales).some((z) => z.date === v.date && z.id !== v.id);
    const leftEmpty = (v) => RB.isISODate(rec && rec.date) && !good(S.sales).some((z) => z.date === rec.date && z.id !== v.id);
    const prodOpts = (row) => {
      const o = [['', '— اختر —']].concat(S.products.filter((p) => p.active !== false).map((p) => [p.id, p.name]));
      if (row && row.productId && !o.some((z) => z[0] === row.productId)) {
        const p = S.products.find((x) => x.id === row.productId);
        o.push([row.productId, p ? p.name + ' (غير مفعّل)' : '(صنف محذوف)']);
      }
      return o;
    };
    return formModal({
      title: isEdit ? 'تعديل إقفال يومي' : 'إقفال يومي',
      wide: true,
      value: v0,
      // الإقفال الجديد يبدأ من مبلغ أول قناة
      focus: isEdit ? '' : '[data-path^="channels."][data-path$=".amount"]',
      // اليوم بلا إعادة رسم (يُكتب بلوحة المفاتيح بمقاطعه)، وتنبيه الإقفال الثاني لنفس اليوم في المعاينة
      fields: [
        { type: 'row', fields: [{ k: 'date', type: 'date', label: 'اليوم', req: 1 }, { k: 'note', label: 'ملاحظات' }] },
        ...(!isEdit && lastClose ? [{ type: 'html', html: () => `<p class="note">آخر إقفال مسجّل: ${dtText(lastClose)}</p>` }] : []),
        {
          type: 'html',
          html: (v) =>
            `<div class="field"><span class="lines-cap" id="sales-ch-cap">المبيعات حسب القناة${vatIn(v.date) ? ' (شاملة الضريبة)' : ''}</span><div class="tbl-wrap"><table class="lines-tbl" aria-labelledby="sales-ch-cap"><thead><tr><th>القناة</th><th class="num">المبلغ</th><th class="num">عدد الطلبات</th><th class="num">العمولة</th></tr></thead><tbody>${chs
              .map((c) => {
                const x = v.channels[c.id] || {};
                return `<tr><td><b>${esc(c.name)}</b></td><td class="num"><input type="number" inputmode="decimal" step="any" min="0" data-type="num" data-path="channels.${esc(c.id)}.amount" value="${x.amount === undefined ? '' : esc(x.amount)}" aria-label="مبلغ ${esc(c.name)}"></td><td class="num"><input type="number" inputmode="numeric" step="1" min="0" data-type="num" data-path="channels.${esc(c.id)}.orders" value="${x.orders === undefined ? '' : esc(x.orders)}" aria-label="طلبات ${esc(c.name)}"></td><td class="num muted">${c.type === 'cash' ? '—' : rate(x.feePct !== undefined && x.feePct !== '' ? x.feePct : c.feePct)}</td></tr>`;
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
            { k: 'qty', label: 'الكمية', type: 'num', num: 1, min: 0 },
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
        // إقفال لليوم نفسه: للجديد (وردية ثانية)، وللمحفوظ إن نُقل تاريخه إلى يوم له إقفال
        const moved = movedOnto(v);
        const twice = (!isEdit || moved) && S.sales.some((s) => s.date === v.date && s.id !== v.id) ? `<p class="note bad">يوجد إقفال مسجل لهذا اليوم. ${moved ? `نقل هذا الإقفال إليه يجعل فيه إقفالين فتتضاعف مبيعاته وضريبته${leftEmpty(v) ? `، ويترك ${dtText(rec.date)} بلا إقفال` : ''}.` : 'الحفظ يضيف إقفالاً ثانياً (مثلاً وردية مسائية).'}</p>` : '';
        const shut = (S.settings.closedDays || []).includes(v.date) ? `<p class="note">هذا اليوم معلَّم «كان مغلقاً»، وحفظ إقفاله يلغي العلامة.</p>` : '';
        return `${twice}${shut}<div class="pv-grid"><div><span>إجمالي المبيعات</span>${money(gross)}</div>${vatIn(v.date) || Math.abs(vat) >= 0.005 ? `<div><span>الضريبة</span>${money(vat)}</div>` : ''}<div><span>العمولات والرسوم</span>${money(fee)}</div><div><span>الطلبات</span><b class="n">${fmt0(orders)}</b><small>${orders ? 'متوسط ' + fmt(gross / orders) : ''}</small></div></div>${itemsVal && gross ? `<p class="note">قيمة الأصناف بسعر المحل ${fmt(itemsVal)} (أسعار التطبيقات أعلى عادة).</p>` : ''}`;
      },
      onSave: async (v) => {
        // خانات القنوات ليست حقولاً في النموذج (جدول مرسوم): خطؤها تحت خانتها هنا
        for (const id of Object.keys(v.channels))
          for (const k of ['amount', 'orders']) if (num(v.channels[id][k]) < 0) return { msg: 'المبالغ والطلبات لا تكون سالبة', path: `channels.${id}.${k}`, inline: 'لا تكون سالبة' };
        if ((v.items || []).some((i) => num(i.qty) < 0)) return 'كميات الأصناف لا تكون سالبة';
        // قناة بطلبات بلا مبلغ (نُسي المبلغ): لا يُحفظ إقفال يُسقط مبيعات اليوم وضريبته ويُسكت تنبيه اليوم بلا إقفال
        for (const id of Object.keys(v.channels)) {
          const x = v.channels[id];
          if (num(x.orders) > 0 && !(num(x.amount) > 0)) return { msg: `أدخل مبلغ «${(chs.find((z) => z.id === id) || {}).name || id}» أو امسح عدد طلباتها.`, path: `channels.${id}.amount`, inline: 'أدخل مبلغ القناة' };
        }
        const out = {};
        for (const id of Object.keys(v.channels)) {
          const x = v.channels[id];
          if (!num(x.amount) && !num(x.orders)) continue;
          const c = RB.channelOf(S, id) || {};
          // قناة حُذفت من الإعدادات والنموذج مفتوح (من جهاز الشريك): لا تُعرف عمولتها ولا نوعها، فلا تُحفظ مبيعاتها
          // نقداً في الصندوق بلا عمولة. سطر الإقفال المحفوظ (بنوع قناته ونسبتها، أو بيانات قديمة كما هي) يبقى قابلاً للتعديل
          if (!c.id && !x.type && !(isEdit && rec.channels && RB.isObj(rec.channels[id]))) return { msg: 'قناة البيع «' + ((chs.find((z) => z.id === id) || {}).name || id) + '» حُذفت من الإعدادات (غالباً من جهاز الشريك)، فلا تُعرف عمولتها ولا نوعها. امسح مبلغها وطلباتها ثم احفظ، أو أعد إضافة القناة من الإعدادات ثم افتح الإقفال من جديد.', path: `channels.${id}.amount`, inline: 'القناة حُذفت من الإعدادات' };
          // نسبة العمولة وضريبتها تُحفظ مع الإقفال، فتعديل الإعدادات لاحقاً لا يغيّر الأيام السابقة؛
          // الإقفال الجديد (ومنه النسخة) يأخذها من الإعدادات الحالية
          const keep = isEdit || !c.id;
          out[id] = {
            amount: num(x.amount),
            orders: num(x.orders),
            feePct: keep && x.feePct !== undefined && x.feePct !== '' ? num(x.feePct) : num(c.feePct),
            type: (keep && x.type) || c.type,
            feeVat: keep && x.feeVat !== undefined ? !!x.feeVat : !!S.settings.feeVat,
          };
        }
        if (!Object.keys(out).length) return { msg: 'أدخل مبيعات قناة واحدة على الأقل.', path: chs.length ? `channels.${chs[0].id}.amount` : '', inline: 'أدخل مبيعات قناة واحدة على الأقل' };
        // إقفال لليوم نفسه سُجّل بعد فتح النموذج: الشريكان يُدخلان إقفال المساء معاً غالباً، وتنبيه المعاينة قد لا يُرى
        // قبل الحفظ، والإقفال الثاني يضاعف مبيعات اليوم وضريبته ونقده. إقفال كان قبل فتحه ظهر تنبيهه عند اختيار اليوم
        const late = !isEdit && good(S.sales).some((z) => z.date === v.date && z.id !== v.id && !known.has(String(z.id)));
        if (late && !(await confirmBox(`سُجّل إقفال لـ ${esc(dtText(v.date))} بعد أن فتحت هذا النموذج (ربما من شريكك أو من نافذة أخرى). هل تحفظ إقفالاً ثانياً لليوم نفسه (وردية أخرى مثلاً)؟`, { ok: 'احفظ إقفالاً ثانياً' }))) return false;
        // تعديل نقل الإقفال إلى يوم له إقفال (كان قبل فتح النموذج أو بعده): يُسأل دائماً، فالوردية الثانية تُسجَّل إقفالاً جديداً
        if (movedOnto(v) && !(await confirmBox(`يوجد إقفال مسجل لـ ${esc(dtText(v.date))}. نقل هذا الإقفال إليه يجعل في اليوم إقفالين فتتضاعف مبيعاته وضريبته ونقده${leftEmpty(v) ? `، ويترك ${esc(dtText(rec.date))} بلا إقفال` : ''}. هل تنقله؟`, { ok: 'انقل الإقفال' }))) return false;
        v.channels = out;
        v.items = (v.items || []).filter((i) => i.productId && num(i.qty));
        if (upsert('sales', v) === false) return false;
        // يوم معلَّم «كان مغلقاً» سُجّل إقفاله: تُلغى العلامة (وتنبيه إقفاله يعود إن حُذف الإقفال لاحقاً)
        if ((S.settings.closedDays || []).includes(v.date)) {
          S.settings.closedDays = S.settings.closedDays.filter((d) => d !== v.date);
          saveSettings(['closedDays']);
        }
      },
      done: 'تم حفظ الإقفال.',
    });
  };

  FORMS.payouts = (rec, x, opts = {}) => {
    const isEdit = editing(rec, opts);
    const apps = S.settings.channels.filter((c) => c.type === 'app');
    if (!apps.length) return toast('لا توجد تطبيقات توصيل في الإعدادات.', 'bad');
    const recv = RB.appReceivables(S, today());
    const ch0 = x || (recv.sort((a, b) => b.balance - a.balance)[0] || apps[0]).id;
    // المستحق على التطبيق قبل هذا التحويل في تاريخه: كل المبيعات والتحويلات حتى التاريخ، بلا هذا التحويل نفسه
    const balOf = (v) => {
      const S2 = Object.assign({}, S, { payouts: S.payouts.filter((p) => p.id !== v.id) });
      const b = RB.appReceivables(S2, RB.isISODate(v.date) ? v.date : today()).find((a) => a.id === v.channelId);
      return b ? b.balance : 0;
    };
    const autoAmt = (v) => r2(Math.max(balOf(v), 0)) || '';
    // التطبيقات المفعّلة، والموقوفة التي لها رصيد أو المختارة في التحويل، والتطبيق المحذوف المختار باسمه
    const chOpts = (v) => {
      const o = apps.filter((c) => c.active !== false || c.id === v.channelId || Math.abs((recv.find((a) => a.id === c.id) || {}).balance || 0) > 0.005).map((c) => [c.id, c.name + (c.active === false ? ' (موقوفة)' : '')]);
      if (v.channelId && !o.some((z) => z[0] === v.channelId)) o.push([v.channelId, v.channelId + ' (محذوفة)']);
      return o;
    };
    // «نوع الخصم» يظهر عند وجود خصومات، ويُبدّل أثناء الكتابة بلا إعادة رسم حتى لا يضيع الضغط على «حفظ» أو Enter
    const dedOff = (v) => !(num(v.deductions) > 0);
    // المبلغ المقترح (= المستحق) يتبع التطبيق والتاريخ ما دام المستخدم لم يكتب مبلغاً غيره
    const value = rec
      ? Object.assign({}, rec, { dedType: RB.DED_TYPES[rec.dedType] ? rec.dedType : num(rec.deductions) ? 'other' : 'sale' })
      : { id: RB.uid(), date: today(), channelId: ch0, amount: '', deductions: 0, dedType: 'sale', note: '' };
    let auto;
    if (!rec) value.amount = auto = autoAmt(value);
    let m = null;
    m = formModal({
      title: isEdit ? 'تعديل تحويل' : 'تحويل من تطبيق توصيل',
      // السجل القديم بخصومات وبلا نوع يبقى «غرامة أو تسوية» فلا تتغير الفترات المقدَّمة؛ الجديد افتراضياً «عرض أو مرتجع»
      value,
      onChange: (p, v) => {
        const f = p === 'deductions' && m && m.body.querySelector('.field[data-k="dedType"]');
        if (f) f.classList.toggle('off', dedOff(v));
        if (p !== 'channelId' && p !== 'date') return;
        if (!(v.amount === '' || v.amount === undefined || v.amount === null || (auto !== undefined && num(v.amount) === num(auto)))) return;
        const a = autoAmt(v);
        if (a === v.amount) return;
        v.amount = auto = a;
        return 'redraw';
      },
      fields: (v) => [
        { type: 'row', fields: [{ k: 'date', type: 'date', label: 'تاريخ وصول المبلغ للبنك', req: 1 }, { k: 'channelId', type: 'select', label: 'التطبيق', options: chOpts, redraw: true }] },
        { type: 'row', fields: [{ k: 'amount', type: 'money', label: 'المبلغ الواصل', req: 1, min: 0, check: (z) => (num(z.amount) + num(z.deductions) > 0 ? '' : 'أدخل المبلغ الواصل (أو الخصومات إن خصمها التطبيق كلها)') }, { k: 'deductions', type: 'money', label: 'خصومات إضافية', min: 0, help: 'ما خصمه التطبيق من التحويل غير عمولته المسجلة في الإقفال: عروض أو مرتجعات، رسوم إعلان، أو غرامات' }] },
        { k: 'dedType', type: 'select', label: 'نوع الخصم', cls: dedOff(v) ? 'off' : '', options: Object.keys(RB.DED_TYPES).map((k) => [k, RB.DED_TYPES[k].short]), help: 'العرض أو المرتجع يخفض المبيعات وضريبتها (يظهر في قائمة الدخل «خصومات ومرتجعات المبيعات» ويخفض المبيعات في الإقرار)، والرسوم بفاتورة ضريبية مصروف تُسترد ضريبته، والغرامة مصروف بلا ضريبة.' },
        { k: 'note', label: 'ملاحظة' },
      ],
      preview: (v) => {
        const bal = balOf(v);
        return `<p class="note">المستحق على التطبيق قبل هذا التحويل: <b class="n">${fmt(bal)}</b> ${cur()} · بعده: <b class="n">${fmt(bal - num(v.amount) - num(v.deductions))}</b></p>`;
      },
      onSave: (v) => upsert('payouts', v),
    });
    return m;
  };

  FORMS.transfers = (rec, x, opts = {}) => {
    const isEdit = editing(rec, opts);
    // رصيد الحساب في تاريخ التحويل قبله (بلا هذا التحويل إن كان محفوظاً)
    const balAt = (acc, v) => {
      const d = RB.isISODate(v.date) ? v.date : today();
      let b = RB.balances(ledger().entries, null, d)[RB.srcAcc(acc)] || 0;
      const old = S.transfers.find((t) => t.id === v.id);
      if (old && old.date <= d) {
        if (old.from === acc) b += num(old.amount);
        if (old.to === acc) b -= num(old.amount);
      }
      return r2(b);
    };
    // المقترح: من الصندوق رصيده مقرَّباً لأدنى 100، ومن البنك بلا مبلغ
    const autoAmt = (v) => (v.from === 'cash' ? Math.max(0, Math.floor(balAt('cash', v) / 100) * 100) || '' : '');
    const value = rec || { id: RB.uid(), date: today(), from: x === 'bank' ? 'bank' : 'cash', to: x === 'bank' ? 'cash' : 'bank', amount: '', note: '' };
    let auto;
    if (!rec) value.amount = auto = autoAmt(value);
    return formModal({
      title: isEdit ? 'تعديل تحويل' : 'تحويل بين الصندوق والبنك',
      value,
      onChange: (p, v) => {
        if (p !== 'from') return;
        v.to = v.from === 'cash' ? 'bank' : 'cash';
        if (!isEdit && (v.amount === '' || v.amount === undefined || v.amount === null || (auto !== undefined && num(v.amount) === num(auto)))) v.amount = auto = autoAmt(v);
        return 'redraw';
      },
      fields: [
        { type: 'row', fields: [{ k: 'date', type: 'date', label: 'التاريخ', req: 1 }, { k: 'from', type: 'select', label: 'من', options: [['cash', RB.PAY_LABEL.cash], ['bank', RB.PAY_LABEL.bank]], redraw: true }] },
        { k: 'amount', type: 'money', label: 'المبلغ', req: 1, min: 0, check: posCheck('amount') },
        { k: 'note', label: 'ملاحظة' },
      ],
      preview: (v) => `<p class="note">من: <b>${esc(RB.PAY_LABEL[v.from] || '')}</b> ← إلى: <b>${esc(RB.PAY_LABEL[v.to] || '')}</b> · رصيد ${v.from === 'bank' ? 'البنك' : 'الصندوق'} قبل التحويل: <b class="n">${fmt(balAt(v.from, v))}</b> ${cur()}</p>` + overdrawNote('transfers', v),
      onSave: (v) => upsert('transfers', v),
    });
  };

  // جرد الصندوق (عدّ الدرج): المعدود مقابل رصيد الصندوق المتوقع في الدفتر نهاية اليوم. المتوقع والفرق يُحفظان
  // مع الجرد، والفرق قيد «عجز وزيادة الصندوق» يجعل رصيد الصندوق = المعدود
  FORMS.cashCounts = (rec, x, opts = {}) => {
    const isEdit = editing(rec, opts);
    // المتوقع: رصيد الصندوق نهاية اليوم بلا فرق هذا الجرد ولا فروق ما بعده من جرود اليوم نفسه
    const expAt = (v) => RB.cashCountExpected(S, ledger(), { id: v.id, date: RB.isISODate(v.date) ? v.date : today() });
    const has = (v) => v.counted !== '' && v.counted !== undefined && v.counted !== null;
    return formModal({
      title: isEdit ? 'تعديل جرد الصندوق' : 'جرد الصندوق (عدّ الدرج)',
      value: rec || { id: RB.uid(), date: today(), counted: '', note: '' },
      fields: [
        { type: 'row', fields: [{ k: 'date', type: 'date', label: 'التاريخ', req: 1 }, { k: 'counted', type: 'money', label: 'النقد المعدود في الدرج', req: 1, min: 0 }] },
        { k: 'note', label: 'ملاحظة' },
      ],
      preview: (v) => {
        const e = expAt(v);
        const d = has(v) ? r2(num(v.counted) - e) : 0;
        const st = !has(v) ? '' : Math.abs(d) < 0.01 ? chip('مطابق', 'good') : d < 0 ? chip('عجز', 'warn') : chip('زيادة', 'good');
        return `<div class="pv-grid"><div><span>الرصيد المتوقع</span>${money(e)}<small>رصيد الصندوق في الدفتر نهاية اليوم</small></div>${has(v) ? `<div><span>الفرق</span>${money(d)}<small>${st}</small></div>` : ''}</div><p class="note">سجّل إقفال اليوم ومصروفاته النقدية قبل عدّ الدرج. العجز يُسجَّل مصروفاً في «عجز وزيادة الصندوق» والزيادة تخفضه، فيصبح رصيد الصندوق في الدفتر = المعدود.</p>`;
      },
      onSave: (v) => {
        v.counted = num(v.counted);
        v.expected = expAt(v);
        v.diff = r2(v.counted - v.expected);
        upsert('cashCounts', v);
        const d = v.diff;
        // العجز بلون الخطأ، والزيادة والمطابقة عادية (الزيادة «جيدة» في المعاينة وقائمة الجرد)
        toast(Math.abs(d) < 0.01 ? 'الصندوق مطابق للدفتر.' : `${d < 0 ? 'عجز' : 'زيادة'} في الصندوق ${fmt(Math.abs(d))} ${S.settings.currency || ''} — سُجّل الفرق.`, d < -0.005 ? 'bad' : '');
      },
    });
  };

  // x: اسم الإقرار للسداد، أو «refund:اسم الإقرار» لتسجيل استرداد رصيده الدائن من الهيئة (مبلغ بالسالب)
  FORMS.vatPayments = (rec, x, opts = {}) => {
    const isEdit = editing(rec, opts);
    const t = today();
    const rm = /^refund:(.+)$/.exec(String(x || ''));
    const refund = !rec && !!rm;
    const label = rm ? rm[1] : x;
    // الفترات المنتهية مع المتبقي من كل إقرار (بعد خصم الرصيد الدائن وما سُدد)
    const rets = RB.vatReturns(S, t, ledger());
    let pers = rets.filter((p) => p.to < t);
    if (!pers.length) pers = RB.vatPeriodsBetween(S, RB.addDays(t, -400), t).filter((p) => p.to < t).map((p) => Object.assign({ remaining: 0, credit: 0 }, p));
    // الضريبة المستحقة عند بدء الدفتر (الأرصدة الافتتاحية): فترتها قبل الإقرارات، ومتبقيها هو المقترح
    const opv = rets.opening;
    if (opv) {
      const q = pers.find((p) => p.label === opv.label);
      if (q) q.remaining = opv.remaining;
      else pers.unshift({ label: opv.label, remaining: opv.remaining, credit: 0 });
    }
    const per = pers.find((p) => p.label === label) || pers.filter((p) => p.remaining > 0).pop() || pers[pers.length - 1];
    // المقترح: المتبقي للسداد، وللاسترداد الرصيد الدائن بالسالب
    const auto = (q) => (!q ? '' : refund ? (q.credit > 0 ? -r2(q.credit) : '') : q.remaining > 0 ? r2(q.remaining) : '');
    const labels = pers.map((p) => p.label).reverse();
    if (rec && rec.period && !labels.includes(rec.period)) labels.unshift(rec.period);
    const back = refund || (!!rec && num(rec.amount) < 0);
    return formModal({
      title: isEdit ? (num(rec.amount) < 0 ? 'تعديل استرداد الضريبة' : 'تعديل سداد الضريبة') : refund ? 'استرداد ضريبة القيمة المضافة' : 'سداد ضريبة القيمة المضافة',
      value: rec || { id: RB.uid(), date: t, period: per ? per.label : '', account: 'bank', amount: auto(per), note: refund ? 'استرداد الرصيد الدائن من الهيئة' : '' },
      onChange: (p, v) => {
        if (p !== 'period' || isEdit) return;
        v.amount = auto(pers.find((z) => z.label === v.period));
        return 'redraw';
      },
      preview: (v) => {
        if (num(v.amount) < 0) return `<p class="note">استرداد من الهيئة: يدخل الحساب ${fmt(-num(v.amount))} ${cur()} ويُخصم من الرصيد الدائن للإقرار فلا يُرحّل للفترة التالية. سجّله بعد وصول المبلغ.</p>`;
        // سداد جديد أكبر من متبقي إقرار الفترة التي بدأ الدفتر أثناءها: قد يشمل ضريبة أيامها قبل البدء
        const q = isEdit ? null : pers.find((z) => z.label === v.period);
        const hint = q && num(v.amount) > r2(q.remaining) + 0.005 ? preVatHint(q.label) : '';
        return overdrawNote('vatPayments', v) + (hint ? `<p class="note">المبلغ أكبر من المتبقي على الإقرار في الدفتر (${fmt(q.remaining)} ${cur()}). ${hint}</p>` : '');
      },
      fields: [
        { type: 'row', fields: [{ k: 'date', type: 'date', label: back ? 'تاريخ الاسترداد' : 'تاريخ السداد', req: 1 }, { k: 'period', type: 'select', label: 'الفترة', options: labels, redraw: true }] },
        { type: 'row', fields: [{ k: 'amount', type: 'money', label: back ? 'المبلغ المسترد (بالسالب)' : 'المبلغ المسدد', req: 1, neg: 1, help: back ? 'ما ردّته الهيئة من الرصيد الدائن، بالسالب' : 'استرداد من الهيئة؟ أدخله بالسالب' }, { k: 'account', type: 'select', label: 'من / إلى', options: payOptions(false, false) }] },
        { k: 'note', label: 'ملاحظة' },
      ],
      onSave: (v) => upsert('vatPayments', v),
    });
  };

  // الأرصدة الافتتاحية لمطعم قائم (settings.opening): الأصول والالتزامات في تاريخ بدء الدفتر، وصافيها حقوق للشركاء
  function openingForm() {
    const o = S.settings.opening;
    const val = RB.isObj(o) ? clone(o) : { date: today(), cash: '', bank: '', inventory: '', vatCredit: '', vatPayable: '', vatCurrent: '', apps: {}, payables: [], eosb: [] };
    val.apps = RB.isObj(val.apps) ? val.apps : {};
    if (!Array.isArray(val.payables)) val.payables = [];
    if (!Array.isArray(val.eosb)) val.eosb = [];
    // التطبيقات: قنوات التطبيقات الحالية، ومعها ما له مبلغ محفوظ من قناة حُذفت أو لم تعد تطبيقاً (يبقى ظاهراً ليُعدَّل أو يُصفَّر)
    const apps = S.settings.channels.filter((c) => c.type === 'app').map((c) => [c.id, c.name]);
    for (const id of Object.keys(val.apps)) {
      if (!num(val.apps[id]) || apps.some((a) => a[0] === id)) continue;
      const c = RB.channelOf(S, id);
      apps.push([id, c ? c.name : id + ' (محذوفة)']);
    }
    // مخصص نهاية الخدمة الافتتاحي: لمن باشر قبل تاريخ البدء ولم يترك العمل قبله، ويُقدَّر بنظام العمل من راتبه ومدة خدمته
    const empOf = (id) => (id ? S.employees.find((e) => e && e.id === id) : null);
    const atStart = (e, d) => RB.isISODate(e.startDate) && e.startDate < d && !(RB.isISODate(e.endDate) && e.endDate < d);
    const est = (e, d) => RB.eosbEarned(num(e.basic) + num(e.housing) + num(e.transport) + num(e.otherAllow), e.startDate, d);
    const empOpts = (r) => {
      const opts = [['', '— اختر الموظف —']].concat(S.employees.filter(Boolean).map((e) => [e.id, e.name]));
      if (r.employeeId && !empOf(r.employeeId)) opts.push([r.employeeId, 'موظف محذوف']);
      return opts;
    };
    // فترات الضريبة حول تاريخ البدء: آخر إقرار انتهى قبله (ضريبته المستحقة تُسدَّد من «سداد الضريبة» باسمه)،
    // والفترة الجارية إن بدأ الدفتر أثناءها (cur: ضريبة أيامها قبل البدء تُضاف لإقرارها فتُسدَّد معه)
    const vatPer = (d) => (RB.isISODate(d) ? RB.vatOpeningPeriod(S, { date: d }) : null);
    const vatPayableHelp = (q) => (q && q.to ? `إقرار «${esc(q.label)}» أو ما قبله؛ سجّل سداده من «سداد الضريبة» باسمه` : 'التزام للهيئة؛ سجّل سداده من «سداد الضريبة»');
    // ما يُحفظ: أرقام، والموردون بأسماء ومبالغ، ومخصص نهاية الخدمة بالموظف
    const clean = (v) => {
      const out = { date: v.date, cash: num(v.cash), bank: num(v.bank), inventory: num(v.inventory), vatCredit: num(v.vatCredit), vatPayable: num(v.vatPayable), vatCurrent: num(v.vatCurrent), apps: {}, payables: [], eosb: [] };
      for (const id of Object.keys(v.apps || {})) if (num(v.apps[id])) out.apps[id] = num(v.apps[id]);
      out.payables = (v.payables || []).filter((x) => x && (String(x.supplier || '').trim() || num(x.amount))).map((x) => ({ supplier: String(x.supplier || '').trim(), amount: num(x.amount) }));
      out.eosb = (v.eosb || []).filter((x) => x && (x.employeeId || num(x.amount))).map((x) => ({ employeeId: String(x.employeeId || ''), amount: num(x.amount) }));
      return out;
    };
    // الأرصدة حين فُتح النموذج (null: لم تكن، فيُقارن ما حفظه الآخر بعدها بالنموذج الفارغ)، وقيمة النموذج حينها: يُعرف عند
    // الحفظ ما غيّره المستخدم وما غيّره الشريك أو نافذة أخرى بعدها (أو حذفه، أو مسح البيانات)
    const orig = RB.isObj(o) ? clean(o) : null;
    const start = clean(val);
    // حقول الأرصدة بمساراتها: كل مبلغ وحده، ومستحق كل تطبيق وحده، وقائمتا الموردين ومخصص نهاية الخدمة كل منهما وحدها
    const openPaths = (...vs) => ['date', 'cash', 'bank', 'inventory', 'vatCredit', 'vatPayable', 'vatCurrent', 'payables', 'eosb'].concat([...new Set(vs.flatMap((x) => (RB.isObj(x) && RB.isObj(x.apps) ? Object.keys(x.apps) : [])))].map((id) => 'apps.' + id));
    formModal({
      title: 'أرصدة افتتاحية',
      wide: true,
      value: val,
      fields: (v) => {
        const vp = vatPer(v.date);
        const vcur = vp && vp.cur;
        return [
          { type: 'html', html: () => `<p class="note">للمطعم القائم قبل بدء الدفتر: ما في الصندوق والبنك والمخزون، وما للمطعم عند التطبيقات، وما عليه للموردين ولعماله (مكافأة نهاية الخدمة) في تاريخ البدء. صافيها يُسجَّل حقوقاً للشركاء حسب نسبهم.</p><p class="note">الأصول الموجودة (المعدات والأثاث والديكور) سجّلها بعد حفظ هذه الأرصدة من صفحة الأصول: بقيمتها الدفترية وعمرها المتبقي وبتاريخ بدء الدفتر، واختر في «دُفع من»: «أصل قائم قبل بدء الدفتر». لا تُسترد عليها ضريبة الآن: قيمتها الدفترية بدون الضريبة إن استرددتها عند شرائها، وشاملة الضريبة إن لم تستردها (غير مسجل في الضريبة حينها)، وتُضاف قيمتها لحقوق الشركاء حسب نسبهم.</p><p class="note">وما دُفع قبل البدء وبقي منه أشهر (إيجار المحل أو التأمين أو رخصة): سجّله من «المصاريف» بتاريخ بدء الدفتر بالمبلغ غير المستهلك والأشهر الباقية، واختر في «دُفع من»: «${RB.OPENING_LABEL.expenses}»؛ فيُحمَّل على أشهره ولا يخرج من البنك. وسلفة باقية على عامل: من «+ سلفة» بتاريخ بدء الدفتر و«${RB.OPENING_LABEL.advances}»، فتُستقطع من راتبه.</p>` },
          {
            type: 'row',
            fields: [
              { k: 'date', type: 'date', label: 'تاريخ بدء الدفتر', req: 1, redraw: true, help: 'الأرصدة كما هي صباح هذا اليوم' },
              { k: 'cash', type: 'money', label: 'النقد في الصندوق', min: 0 },
              { k: 'bank', type: 'money', label: 'رصيد الحساب البنكي', min: 0 },
              // قيمة المخزون كما يُقيَّم الجرد في ذلك التاريخ: غير المسجل في الضريبة يقيّم المواد الخاضعة شاملة ضريبتها (جزء من تكلفتها)
              { k: 'inventory', type: 'money', label: 'قيمة المخزون من جرد افتتاحي', min: 0, help: (RB.isVatReg(S.settings, RB.isISODate(v.date) ? v.date : today()) ? 'الكميات × سعر الشراء بدون الضريبة' : 'الكميات × سعر الشراء شاملاً الضريبة (غير مسجل في الضريبة)') + '. هي مخزون صباح البدء: جرد قبل تاريخ البدء لا يدخل الحسابات' },
            ],
          },
          // الضريبة من إقرار سابق: لصالح المطعم (رصيد دائن يُخصم من أول إقرار) أو عليه (مستحق للهيئة لم يُسدَّد بعد)؛
          // وإن بدأ الدفتر أثناء فترة إقرار: صافي ضريبة أيامها قبل البدء، يُضاف لإقرار تلك الفترة فيُسدَّد معه باسمه
          {
            type: 'row',
            fields: [
              { k: 'vatCredit', type: 'money', label: 'رصيد ضريبة دائن من إقرار سابق', min: 0, help: 'لصالح المطعم: يُخصم من أول إقرار في الدفتر' },
              { k: 'vatPayable', type: 'money', label: 'ضريبة مستحقة من إقرار سابق لم تُسدَّد', min: 0, help: vatPayableHelp(vp) },
              {
                k: 'vatCurrent',
                type: 'money',
                label: 'ضريبة الفترة الجارية حتى بدء الدفتر',
                neg: 1,
                show: (x) => !!vcur || !!num(x.vatCurrent),
                help: vcur
                  ? `صافي ضريبة ${dtText(vcur.from)} – ${dtText(vcur.to)} (المبيعات ناقص المدخلات): يُضاف لمستحق إقرار «${esc(vcur.label)}» فيُسدَّد معه باسمه. بالسالب إن كانت المدخلات أكبر`
                  : 'لا أيام من فترة الإقرار قبل تاريخ البدء: امسح المبلغ، أو أدخله في «ضريبة مستحقة من إقرار سابق» إن كان من إقرار سابق',
              },
            ],
          },
          ...(apps.length ? [{ type: 'section', label: 'مستحقات التطبيقات (مبيعات لم تُحوَّل للبنك بعد)' }, { type: 'row', fields: apps.map(([id, name]) => ({ k: 'apps.' + id, type: 'money', label: name, min: 0 })) }] : []),
          {
            k: 'payables',
            type: 'lines',
            label: 'مستحق للموردين (فواتير آجلة لم تُسدَّد)',
            addLabel: 'إضافة مورد',
            newRow: () => ({ supplier: '', amount: '' }),
            cols: [
              { k: 'supplier', label: 'المورد' },
              { k: 'amount', label: 'المبلغ شامل الضريبة', type: 'num', num: 1, min: 0 },
            ],
            empty: 'لا مستحقات للموردين',
            help: 'سدادها لاحقاً من «سداد مورد» باسم المورد نفسه.',
          },
          {
            k: 'eosb',
            type: 'lines',
            label: 'مخصص نهاية الخدمة عن خدمة العمال قبل بدء الدفتر',
            addLabel: 'إضافة موظف',
            rowName: (r) => (empOf(r.employeeId) || {}).name || '',
            tools: [
              {
                id: 'eosbfill',
                label: 'احسب من بيانات الموظفين',
                run: (v2, rows) => {
                  if (!RB.isISODate(v2.date)) return toast('اختر تاريخ بدء الدفتر أولاً.', 'bad');
                  const list = S.employees.filter((e) => e && atStart(e, v2.date));
                  // موظف بلا تاريخ مباشرة لا تُعرف مدة خدمته: يُذكر ليُكمل بياناته أو يُدخل مخصصه يدوياً
                  const noStart = S.employees.filter((e) => e && !RB.isISODate(e.startDate) && !(RB.isISODate(e.endDate) && e.endDate < v2.date));
                  if (noStart.length) toast('بلا تاريخ مباشرة فلم يُقدَّر مخصصه: ' + noStart.map((e) => e.name).join('، ') + '. أدخله من صفحة العمال أو اكتب مخصصه يدوياً.', 'bad');
                  if (!list.length) return noStart.length ? undefined : toast('لا يوجد موظف باشر قبل تاريخ بدء الدفتر. أضف الموظفين بتواريخ مباشرتهم من صفحة العمال أولاً.', 'bad');
                  // أسطر من باشر قبل البدء تُحسب من جديد، وما سواها (موظف أُضيف يدوياً) يبقى
                  const keep = rows.filter((r) => r && (r.employeeId || num(r.amount)) && !list.some((e) => e.id === r.employeeId));
                  rows.splice(0, rows.length, ...list.map((e) => ({ employeeId: e.id, amount: est(e, v2.date) })), ...keep);
                },
              },
            ],
            newRow: () => ({ employeeId: '', amount: '' }),
            cols: [
              { k: 'employeeId', label: 'الموظف', type: 'select', options: empOpts, redraw: true },
              {
                k: 'amount',
                label: 'المخصص حتى تاريخ البدء',
                type: 'num',
                num: 1,
                min: 0,
                hint: (r, v2) => {
                  const e = empOf(r.employeeId);
                  if (!e || !RB.isISODate(v2.date)) return '';
                  if (!RB.isISODate(e.startDate)) return 'أدخل «تاريخ المباشرة» في بيانات الموظف ليُقدَّر';
                  return atStart(e, v2.date) ? `بنظام العمل <span class="n">${fmt(est(e, v2.date))}</span>` : 'لم يكن على رأس العمل في تاريخ البدء';
                },
              },
            ],
            empty: 'لا مخصص افتتاحي',
            help: 'ما استحقه كل عامل عن خدمته قبل تاريخ البدء (نصف أجر شهر عن كل سنة من الخمس الأولى، وأجر شهر عن كل سنة بعدها). «احسب من بيانات الموظفين» يقدّره من تاريخ المباشرة والراتب. يُسجَّل التزاماً يُخصم من حقوق الشركاء، ويُضاف إليه ما يُستحق مع كل مسير، وتُصرف منه مكافأة العامل حين يترك العمل.',
          },
        ];
      },
      preview: (v) => {
        const info = RB.openingInfo({ settings: { opening: clean(v) } });
        if (!info) return '';
        const sh = RB.openingShares(S, info.net, info.date);
        const parts = [['الموردون', info.owed], ['نهاية الخدمة', info.eosb], ['الضريبة', RB.r2(info.vatPayable + Math.max(0, info.vatCurrent))]].filter((x, i) => !i || x[1]);
        const liab = parts.length > 1 ? `<small>${parts.map((x) => `${x[0]} ${fmt(x[1])}`).join(' + ')}</small>` : '';
        return `<div class="pv-grid"><div><span>الأصول</span>${money(info.assets)}</div><div><span>الالتزامات</span>${money(info.liab)}${liab}</div><div><span>الصافي (حقوق الشركاء)</span>${money(info.net)}</div></div>${sh.length ? `<p class="note">${sh.map((x) => `${esc((S.partners.find((p) => p.id === x.partnerId) || {}).name || '')}: <b class="n">${fmt(x.amount)}</b>`).join(' · ')}</p>` : '<p class="note bad">أضف الشركاء أولاً: الصافي يُسجَّل حقوقاً لهم.</p>'}`;
      },
      onSave: async (v) => {
        if (roBlock()) return false;
        if (!S.partners.length) return 'أضف الشركاء أولاً: صافي الأرصدة الافتتاحية يُسجَّل حقوقاً لهم.';
        const c = clean(v);
        // الخطأ تحت خانته: أرقام الأسطر من النموذج نفسه (قبل حذف الأسطر الفارغة)
        const pi = (v.payables || []).findIndex((x) => x && num(x.amount) && !String(x.supplier || '').trim());
        if (pi >= 0) return { msg: 'اكتب اسم المورد لكل مبلغ مستحق.', path: `payables.${pi}.supplier`, inline: 'اكتب اسم المورد' };
        if (c.vatCredit > 0 && c.vatPayable > 0) return { msg: 'أدخل الضريبة من الإقرار السابق مرة واحدة: رصيداً دائناً لصالح المطعم أو مستحقاً عليه للهيئة، بالصافي.', path: 'vatPayable', inline: 'رصيد دائن أو مستحق، لا الاثنان' };
        // ضريبة الفترة الجارية لتاريخ بدء في أول يوم من فترة الإقرار (أو قبل سريان التسجيل): لا أيام لها قبل البدء
        if (c.vatCurrent && !(vatPer(c.date) || {}).cur) return { msg: 'تاريخ البدء أول يوم في فترة الإقرار (أو قبل سريان التسجيل)، فلا ضريبة للفترة الجارية قبله. امسح المبلغ، أو أدخله في «ضريبة مستحقة من إقرار سابق» إن كان من إقرار سابق.', path: 'vatCurrent', inline: 'لا أيام قبل البدء في هذه الفترة' };
        const ei = (v.eosb || []).findIndex((x) => x && num(x.amount) && !x.employeeId);
        if (ei >= 0) return { msg: 'اختر الموظف لكل مبلغ في مخصص نهاية الخدمة.', path: `eosb.${ei}.employeeId`, inline: 'اختر الموظف' };
        const ids = (v.eosb || []).map((x) => (x && (x.employeeId || num(x.amount)) ? String(x.employeeId || '') : ''));
        const di = ids.findIndex((id, i) => id && ids.indexOf(id) !== i);
        if (di >= 0) return { msg: 'الموظف مكرر في مخصص نهاية الخدمة: ' + ((empOf(ids[di]) || {}).name || '') + '. اجمع مخصصه في سطر واحد.', path: `eosb.${di}.employeeId`, inline: 'مكرر' };
        // تغيّرت الأرصدة بعد فتح النموذج (الشريك أو نافذة أخرى): لا يُكتب فوقها بصمت كما كانت حين فُتح.
        // حُذفت (أو مُسحت البيانات): يُسأل أتُعاد. عُدّلت: ما غيّره المستخدم وحده فوقها، ويُسأل عن الحقل الذي غيّراه كلاهما
        const mg = await (async () => {
          const curO = S.settings.opening;
          if (orig && !RB.isObj(curO)) return (await confirmBox('حُذفت الأرصدة الافتتاحية بعد أن فتحت هذا النموذج — حذفها شريكك أو نافذة أخرى، أو مُسحت البيانات. هل تعيد حفظها بما في النموذج؟', { ok: 'أعد حفظها' })) ? { rec: c } : null;
          if (!RB.isObj(curO) || (orig && RB.sameRec(clean(curO), orig))) return { rec: c };
          const cur0 = clean(curO);
          const pm = RB.pathMerge(orig || start, start, c, cur0, openPaths(orig, start, c, cur0));
          if (pm.clash.length) {
            const label = (p) => (p.startsWith('apps.') ? (RB.channelOf(S, p.slice(5)) || { name: p.slice(5) }).name : { date: 'تاريخ بدء الدفتر', cash: 'النقد في الصندوق', bank: 'رصيد الحساب البنكي', inventory: 'قيمة المخزون', vatCredit: 'رصيد ضريبة دائن', vatPayable: 'ضريبة مستحقة من إقرار سابق', vatCurrent: 'ضريبة الفترة الجارية', payables: 'مستحق للموردين', eosb: 'مخصص نهاية الخدمة' }[p] || p);
            const names = pm.clash.map((p) => '«' + esc(label(p)) + '»').join('، ');
            if (!(await confirmBox(`عدّل شريكك أو نافذة أخرى الأرصدة الافتتاحية بعد أن فتحت هذا النموذج، وغيّرتَ أنت أيضاً ${names}. الحفظ يضع ما في النموذج مكان تعديله فيها، وتبقى تعديلاته في غيرها. هل تحفظ؟`, { ok: 'احفظ ما في النموذج' }))) return null;
          }
          return { rec: pm.rec, merged: true };
        })();
        if (!mg) return false;
        const merged = mg.rec;
        // الدمج قد يجمع ما لا يجتمع (رصيد دائن من الشريك ومستحق من المستخدم): لا يُحفظ
        if ((merged.vatCredit > 0 && merged.vatPayable > 0) || (merged.vatCurrent && !(vatPer(merged.date) || {}).cur)) return 'عدّل شريكك أو نافذة أخرى الأرصدة الافتتاحية بعد أن فتحت هذا النموذج، ودمج تعديله مع ما أدخلته يجعل الضريبة من الإقرار السابق أو ضريبة الفترة الجارية غير متسقة. أغلق النموذج وافتحه من جديد ثم عدّل.';
        if (roBlock()) return false;
        S.settings.opening = merged;
        if (saveSettings(['opening']) === false) return false;
        if (mg.merged) toast('عدّل شريكك أو نافذة أخرى الأرصدة الافتتاحية بعد أن فتحت النموذج — حُفظ ما غيّرته أنت، وبقيت تعديلاته في الحقول الأخرى.');
      },
      done: 'حُفظت الأرصدة الافتتاحية.',
    });
  }

  function channelForm(id) {
    const c = id ? S.settings.channels.find((x) => x.id === id) : null;
    // القناة حين فُتح النموذج: إن عدّلها الشريك أو نافذة أخرى بعدها يُكتب ما غيّره المستخدم وحده (ويُسأل عن الحقل الذي
    // غيّراه كلاهما)، وإن حذفها يُسأل أتُعاد
    const orig = c ? clone(c) : null;
    const names = { name: 'الاسم', type: 'النوع', feePct: 'العمولة أو الرسوم %', active: 'مفعّلة' };
    formModal({
      title: c ? 'تعديل قناة بيع' : 'قناة أو تطبيق جديد',
      value: c ? clone(c) : { id: 'ch' + Date.now().toString(36), name: '', type: 'app', feePct: 20, active: true },
      fields: [
        { k: 'name', label: 'الاسم', req: 1, placeholder: 'اسم التطبيق' },
        { type: 'row', fields: [{ k: 'type', type: 'select', label: 'النوع', options: Object.entries(RB.CHANNEL_TYPES), redraw: true }, { k: 'feePct', type: 'num', label: 'العمولة أو الرسوم %', min: 0, max: 100, show: (v) => v.type !== 'cash', help: 'نسبة من قيمة الطلب شاملة الضريبة' }] },
        { k: 'active', type: 'check', label: 'مفعّلة' },
      ],
      onSave: async (v) => {
        if (roBlock()) return false;
        if (orig) {
          const cur = S.settings.channels.find((x) => x.id === v.id);
          if (!cur) {
            if (!(await confirmBox('حُذفت هذه القناة بعد أن فتحت النموذج — حذفها شريكك أو نافذة أخرى. هل تعيد إضافتها بما في النموذج؟', { ok: 'أعد إضافتها' }))) return false;
          } else if (!RB.sameRec(cur, orig)) {
            const mg = RB.editMerge(orig, orig, v, cur);
            if (mg.clash.length && !(await confirmBox(`عدّل شريكك أو نافذة أخرى هذه القناة بعد أن فتحت النموذج، وغيّرتَ أنت أيضاً ${mg.clash.map((k) => '«' + esc(names[k] || k) + '»').join('، ')}. الحفظ يضع ما في النموذج مكان تعديله، وتبقى تعديلاته في غيره. هل تحفظ؟`, { ok: 'احفظ ما في النموذج' }))) return false;
            v = Object.assign(mg.rec, { id: v.id });
          }
          if (roBlock()) return false;
        }
        const i = S.settings.channels.findIndex((x) => x.id === v.id);
        if (i >= 0) S.settings.channels[i] = v;
        else S.settings.channels.push(v);
        // خطوة البداية «راجع الإعدادات» تكتمل بحفظ أي نموذج إعدادات أو قناة
        S.settings.reviewedAt = new Date().toISOString();
        saveSettings(['channels', 'reviewedAt']);
      },
    });
  }

  // النموذج يُفتح بنسخة من الإعدادات للعرض والتحقق، ويكتب عند الحفظ ما غيّره المستخدم من حقوله وحدها فوق الإعدادات الحالية
  // (S.settings تتحدث أثناء فتحه بما يحفظه الشريك أو نافذة أخرى: قناة جديدة، أرصدة افتتاحية، يوم مغلق، أو حقل في النموذج
  // نفسه… فيبقى). حقل غيّره الآخر بعد فتح النموذج وغيّره المستخدم أيضاً يُسأل عنه كنماذج السجلات
  function settingsForm(which) {
    const defs = {
      general: [
        { k: 'name', label: 'اسم المطعم', req: 1 },
        { type: 'row', fields: [{ k: 'city', label: 'المدينة' }, { k: 'crNumber', label: 'رقم السجل التجاري' }] },
        { type: 'row', fields: [{ k: 'openingDate', type: 'date', label: 'تاريخ الافتتاح', help: 'يبدأ منه إهلاك الأصول، ويفصل مصاريف ما قبل الافتتاح' }, { k: 'currency', label: 'العملة' }] },
        {
          type: 'row',
          fields: [
            { k: 'targetFoodCost', type: 'num', label: 'مستهدف تكلفة الطعام %', req: 1, min: 1, max: 100, help: 'شائع في مطاعم البرقر بين <span class="n">28%</span> و<span class="n">35%</span>' },
            { k: 'priceRounding', type: 'num', label: 'تقريب السعر المقترح لأقرب', req: 1, min: 0, check: (x) => (num(x.priceRounding) > 0 ? '' : 'يجب أن تكون القيمة أكبر من صفر'), help: '1 = لأقرب ريال' },
          ],
        },
      ],
      vat: (v) => [
        { k: 'vatRegistered', type: 'check', label: 'المطعم مسجل في ضريبة القيمة المضافة', redraw: true, help: 'التسجيل إلزامي إذا تجاوزت المبيعات الخاضعة 375,000 ر.س خلال 12 شهراً، واختياري من 187,500 ر.س' },
        {
          k: 'vatRegisteredFrom',
          type: 'date',
          label: 'تاريخ سريان التسجيل في الضريبة (من شهادة التسجيل)',
          show: (x) => x.vatRegistered,
          req: !S.settings.vatRegistered && v.vatRegistered && hasVatData() ? 1 : 0,
          help: 'اتركه فارغاً إن كان المطعم مسجلاً منذ البداية؛ العمليات قبله بلا ضريبة مخرجات ولا تُسترد ضريبة مشترياتها',
        },
        { type: 'row', fields: [{ k: 'vatNumber', label: 'الرقم الضريبي' }, { k: 'vatRate', type: 'num', label: 'نسبة الضريبة %', req: 1, min: 0, max: 100, check: (x) => (x.vatRegistered && !(num(x.vatRate) > 0) ? 'لا تكون صفراً والمطعم مسجل في الضريبة' : '') }] },
        { k: 'vatPeriod', type: 'select', label: 'فترة الإقرار', options: [['quarterly', 'ربع سنوية'], ['monthly', 'شهرية']] },
        { k: 'feeVat', type: 'check', label: 'عمولات التطبيقات ورسوم الشبكة عليها ضريبة قيمة مضافة' },
      ],
      labor: [
        { type: 'section', label: 'نسب التأمينات الاجتماعية من الأجر الخاضع' },
        { type: 'html', html: () => '<p class="note">الأجر الخاضع = الأساسي + بدل السكن (أو السكن العيني مقدّراً بأجر شهرين في السنة)</p>' },
        { type: 'row', fields: [{ k: 'gosi.saudiEr', type: 'num', label: 'السعودي (النظام السابق) — حصة المنشأة %', req: 1, min: 0, max: 100 }, { k: 'gosi.saudiEe', type: 'num', label: 'السعودي (النظام السابق) — حصة الموظف %', req: 1, min: 0, max: 100 }] },
        { type: 'html', html: () => '<p class="note">المشتركون الجدد (أول تسجيل من 3 يوليو 2024): تُضاف زيادة فرع المعاشات <span class="n">0.5%</span> لكل طرف كل يوليو من 2025 حتى 2028 (من يوليو 2026: المنشأة <span class="n">12.75%</span> والموظف <span class="n">10.75%</span>).</p>' },
        { type: 'row', fields: [{ k: 'gosi.expatEr', type: 'num', label: 'غير السعودي — حصة المنشأة % (الأخطار المهنية)', req: 1, min: 0, max: 100 }, { k: 'gosi.cap', type: 'num', label: 'الحد الأعلى للأجر الخاضع', min: 0, help: 'فارغ أو 0 = بلا حد أعلى' }] },
        { type: 'section', label: 'قيم افتراضية تتعبأ عند إضافة موظف' },
        { type: 'row', fields: [{ k: 'labor.levyMonthly', type: 'num', label: 'المقابل المالي شهرياً', min: 0, help: LEVY_HELP }, { k: 'labor.iqamaAnnual', type: 'num', label: 'رسوم الإقامة سنوياً', min: 0 }] },
        { type: 'row', fields: [{ k: 'labor.workPermitAnnual', type: 'num', label: 'رخصة العمل سنوياً', min: 0 }, { k: 'labor.medicalAnnual', type: 'num', label: 'التأمين الطبي سنوياً', min: 0, help: MED_HELP }] },
      ],
    };
    // الإعدادات حين فُتح النموذج
    const at = clone(S.settings);
    formModal({
      title: { general: 'بيانات المطعم', vat: 'ضريبة القيمة المضافة', labor: 'التأمينات ورسوم العمالة' }[which],
      value: clone(S.settings),
      fields: defs[which],
      onChange: (p, v) => {
        // تسجيل جديد ولدى المطعم عمليات سابقة: السريان من اليوم حتى لا تتغير الفترات الماضية
        if (which === 'vat' && p === 'vatRegistered' && v.vatRegistered && !S.settings.vatRegistered && hasVatData() && !v.vatRegisteredFrom) {
          v.vatRegisteredFrom = today();
          return 'redraw';
        }
      },
      onSave: async (v) => {
        if (roBlock()) return false;
        // الأرقام تُحفظ أرقاماً: الحقل الفارغ (الحد الأعلى للأجر مثلاً) صفر لا نص فارغ
        const list = typeof defs[which] === 'function' ? defs[which](v) : defs[which];
        const nums = (o) => {
          for (const f of flatFields(list)) if (f.k && (f.type === 'num' || f.type === 'money')) setPath(o, f.k, num(getPath(o, f.k)));
          return o;
        };
        nums(v);
        // ما غيّره المستخدم من حقول هذا النموذج وحده (gosi.cap مثلاً لا التأمينات كلها) فوق الإعدادات الحالية، لا النسخة
        // التي فُتح بها: حقل لم يلمسه وحفظه الشريك بعد فتح النموذج يبقى بقيمة الشريك
        const ks = flatFields(list).filter((f) => f.k).map((f) => f.k);
        const start = nums(clone(at));
        const merge = () => RB.pathMerge(at, start, v, S.settings, ks);
        const mg = merge();
        if (mg.clash.length) {
          const names = mg.clash.map((k) => '«' + esc((flatFields(list).find((f) => f.k === k) || {}).label || k) + '»').join('، ');
          const one = mg.clash.length === 1;
          if (!(await confirmBox(`عدّل شريكك أو نافذة أخرى ${names} بعد أن فتحت هذا النموذج، وغيّرتَ ${one ? 'الحقل' : 'الحقول'} أنت أيضاً. الحفظ يضع ما في النموذج مكان تعديله في ${one ? 'هذا الحقل' : 'هذه الحقول'}، وتبقى تعديلاته في غيرها. هل تحفظ؟`, { ok: 'احفظ ما في النموذج' }))) return false;
        }
        const warn = which === 'vat' ? vatHistoryChanges(S.settings, merge().rec) : '';
        if (warn && !(await confirmBox(warn + ' متابعة؟', { danger: true }))) return false;
        // بعد الأسئلة: صار عرضاً فقط أو بدأ استيراد أثناءها فلا يُغيَّر شيء، وإلا فوق أحدث إعدادات (قد تصل أثناء السؤال)
        if (roBlock()) return false;
        const fin = merge();
        for (const k of fin.mine) setPath(S.settings, k, getPath(v, k));
        S.settings.reviewedAt = new Date().toISOString();
        saveSettings(['reviewedAt', ...new Set(fin.mine.map((k) => k.split('.')[0]))]);
        if (ks.some((k) => !fin.mine.includes(k) && !RB.sameRec(getPath(S.settings, k), getPath(at, k)))) toast('عدّل شريكك أو نافذة أخرى هذا النموذج بعد أن فتحته — حُفظ ما غيّرته أنت، وبقيت تعديلاته في الحقول الأخرى.');
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
    // رأس مال، أو أي قيد على حساب الشريك في الدفاتر (أصل أو مصروف أو فاتورة أو سداد مورد دفعه من حسابه…)
    partners: (id) => RB.partnerUsed(S, id),
    // تاريخ المباشرة وتاريخ ترك العمل يحددان مخصص نهاية الخدمة في المسيرات السابقة؛ حذفه يغيّر الدفاتر
    // وسلفه مرتبطة به (رصيده في 1106)
    // ومخصصه الافتتاحي (خدمته قبل بدء الدفتر) في الأرصدة الافتتاحية
    employees: (id) =>
      S.payroll.some((pr) => (pr.lines || []).some((l) => l && l.employeeId === id)) ||
      S.advances.some((a) => a && a.employeeId === id) ||
      Object.prototype.hasOwnProperty.call((RB.openingInfo(S) || {}).eosbBy || {}, id),
  };
  const refMsg = {
    raw: 'هذه المادة مستخدمة في وصفات. احذفها من الوصفات أولاً.',
    composites: 'هذا المنتج المجمّع مستخدم في منتجات أخرى. احذفه منها أولاً.',
    products: 'هذا الصنف داخل في وجبة مركّبة. احذفه منها أولاً، أو اجعله غير مفعّل.',
    partners: 'لهذا الشريك حركات رأس مال أو مدفوعات. احذفها أولاً.',
    employees: 'لهذا الموظف مسيرات رواتب أو سلف أو مخصص نهاية خدمة في الأرصدة الافتتاحية؛ حدّد «تاريخ ترك العمل» وأوقفه بدلاً من حذفه.',
  };

  // حذف مادة في جرد سابق: سطرها يبقى بلا اسم بقيمته. الجرد قبل التسجيل في الضريبة يُقيَّم بضريبة المادة الخاضعة،
  // وبحذفها لا تُعرف فتنقص قيمته؛ يُذكر ذلك بدل «القيمة لا تتغير»
  const rawDelMsg = (id) => {
    const without = Object.assign({}, S, { raw: S.raw.filter((x) => x.id !== id) });
    const drops = S.stockCounts.some((c) => (c.lines || []).some((l) => l && l.rawId === id) && Math.abs(RB.stockValue(c, S) - RB.stockValue(c, without)) > 0.005);
    return drops
      ? 'هذه المادة موجودة في جرد سابق قبل التسجيل في الضريبة، وحذفها يُظهر سطرها في الجرد بلا اسم وتنقص قيمته بضريبة المادة. هل تحذفها؟'
      : 'هذه المادة موجودة في جرد سابق، وحذفها يُظهر سطرها في الجرد بلا اسم (القيمة لا تتغير). هل تحذفها؟';
  };

  // نسخة أو تجديد لمصروف مدفوع قبل بدء الدفتر (رصيد افتتاحي): دفعة جديدة من البنك بضريبة تصنيفه
  const unOpening = (c) => {
    if (!RB.isOpeningExpense(c)) return;
    c.account = 'bank';
    c.taxable = !['housing', 'gov', 'labor_gov', 'zakat'].includes(c.category);
    c.includesVat = c.taxable;
  };
  // تجهيز النسخة قبل فتحها كسجل جديد
  const DUP_PREP = {
    // نسب العمولة وضريبتها من الإعدادات الحالية (لا من الإقفال المنسوخ)، ولا قنوات موقوفة أو محذوفة
    sales: (c) => {
      const out = {};
      for (const id of Object.keys(c.channels || {})) {
        const ch = S.settings.channels.find((z) => z.id === id);
        if (!ch || ch.active === false) continue;
        const x = Object.assign({}, c.channels[id]);
        delete x.feePct;
        delete x.type;
        delete x.feeVat;
        out[id] = x;
      }
      c.channels = out;
    },
    // التغطية تبدأ من تاريخ الدفع الجديد (لا من بداية تغطية المصروف المنسوخ). البيان كما هو: المصروف المنسوخ دفعة
    // جديدة للبند نفسه (في الكشوف وقيود الدفتر)، ومتابعة تجديده تتبع أحدث دفعة لا تبقى على القديمة
    expenses: (c) => {
      c.startDate = '';
      unOpening(c);
    },
    // السلفة القائمة قبل بدء الدفتر: نسختها سلفة جديدة من الصندوق
    advances: (c) => {
      if (c.account === 'opening') c.account = 'cash';
    },
    // الأصل المنسوخ أصل جديد لم يُستبعد
    assets: (c) => {
      for (const k of ['disposedDate', 'proceeds', 'proceedsAccount', 'proceedsIncludesVat']) delete c[k];
    },
    // مسير الشهر التالي لآخر مسير: أسطره من بيانات الموظفين لذلك الشهر، والأسطر اليدوية (بلا موظف مسجل) تبقى
    payroll: (c) => {
      const months = [...paidMonths()].filter(RB.isISOMonth).sort();
      const ym = months.length ? RB.ymAdd(months[months.length - 1], 1) : RB.isISOMonth(c.month) ? c.month : today().slice(0, 7);
      c.month = ym;
      c.date = payDefaultDate(ym);
      c.gosiDate = gosiDefaultDate(ym, c.date);
      c.lines = payrollFill(ym, (c.lines || []).filter((l) => l && !l.employeeId).map((l) => Object.assign({}, l, { eosbPaid: 0 })), undefined, undefined, c.date);
      // ملاحظة المسير المنسوخ تخص شهره (شهر جزئي، تسوية نهاية الخدمة…)
      c.note = '';
    },
  };

  // علامة «كان مغلقاً» ليوم أو إلغاؤها (say: رسالة بالإلغاء)
  function setClosedDay(d, on, say) {
    if (roBlock()) return false;
    const rest = (S.settings.closedDays || []).filter((x) => x !== d);
    S.settings.closedDays = on ? rest.concat([d]).sort().slice(-60) : rest;
    saveSettings(['closedDays']);
    render();
    if (!on && say) toast('أُلغيت علامة «كان مغلقاً» عن ' + dtText(d) + '، فيعود تنبيه إقفاله.');
  }
  const ACT = {
    go: (el) => go(el.dataset.v),
    add: (el) => FORMS[el.dataset.s] && FORMS[el.dataset.s](null, el.dataset.x),
    edit: (el) => {
      // قيد الأرصدة الافتتاحية (من كشف الصندوق أو البنك) يُفتح بنموذجها
      if (el.dataset.s === 'settings') return el.dataset.id === 'opening' ? openingForm() : undefined;
      const rec = find(el.dataset.s, el.dataset.id);
      if (!rec || !FORMS[el.dataset.s]) return;
      // كل النماذج تُفتح متزامنة (formModal يأخذه فوراً)
      EDIT_OF = { s: el.dataset.s, rec: clone(rec) };
      try {
        FORMS[el.dataset.s](clone(rec));
      } finally {
        EDIT_OF = null;
      }
    },
    // النسخة سجل جديد: تُفتح كإضافة (العنوان، ونسب العمولات الحالية، وذاكرة المورد…) بعد تجهيزها في DUP_PREP
    dup: (el) => {
      const s = el.dataset.s;
      const rec = find(s, el.dataset.id);
      if (!rec || !FORMS[s] || NO_DUP.includes(s)) return;
      const c = clone(rec);
      c.id = RB.uid();
      delete c._bad;
      if (c.date) c.date = today();
      if (c.name) c.name = c.name + ' (نسخة)';
      if (DUP_PREP[s]) DUP_PREP[s](c);
      FORMS[s](c, undefined, { isNew: true, mode: 'dup' });
    },
    del: async (el) => {
      const s = el.dataset.s;
      const id = el.dataset.id;
      if (roBlock()) return;
      if (refCheck[s] && refCheck[s](id)) return toast(refMsg[s], 'bad');
      const rec = find(s, id);
      // سلفة استُقطعت في مسير: حذفها يجعل رصيد سلف الموظف سالباً
      const advBlock = s === 'advances' && rec ? advanceGuard(S.advances.filter((a) => a && a.id !== id), [rec.employeeId]) : '';
      if (advBlock) return toast(advBlock, 'bad');
      if (s === 'products' && S.sales.some((x) => (x.items || []).some((i) => i.productId === id))) {
        if (!(await confirmBox('هذا الصنف له مبيعات مسجلة، وحذفه يُسقطه من تحليل المنيو. الأفضل جعله «غير مفعّل». هل تحذفه رغم ذلك؟', { danger: true, ok: 'احذف' }))) return;
      } else if (s === 'raw' && S.stockCounts.some((c) => (c.lines || []).some((l) => l && l.rawId === id))) {
        if (!(await confirmBox(rawDelMsg(id), { danger: true, ok: 'احذف' }))) return;
      } else if (!(await confirmBox(rec ? `حذف ${esc(SECTION_NAME[s] || 'السجل')} «${esc(recLabel(s, rec))}» نهائياً؟` : 'حذف هذا السجل نهائياً؟', { danger: true, ok: 'احذف' }))) return;
      // التركيز بعد الحذف: زر الحذف التالي في القائمة نفسها (أو السابق إن كان الأخير)، أو عنوان البطاقة إن فرغت —
      // لا أول الصفحة. حذف من خارج بطاقة يبقى على المحتوى الرئيسي
      const sel = `[data-act="del"][data-s="${CSS.escape(s)}"]`;
      const card0 = el.closest('#page .card');
      const ci = card0 ? [...document.querySelectorAll('#page .card')].indexOf(card0) : -1;
      const i = card0 ? [...card0.querySelectorAll(sel)].indexOf(el) : -1;
      // صار عرضاً فقط (توقف الوصول) أو بدأ استيراد أثناء السؤال: لم يُحذف، فلا «تم الحذف.»
      if (remove(s, id) === false) return;
      render();
      toast('تم الحذف.');
      const c2 = ci >= 0 ? document.querySelectorAll('#page .card')[ci] : null;
      if (c2 && i >= 0) {
        const left = c2.querySelectorAll(sel);
        const h = c2.querySelector('h2');
        const to = left[Math.min(i, left.length - 1)] || h;
        if (to) {
          if (to === h) to.tabIndex = -1;
          to.focus();
        }
      }
    },
    view: (el) => {
      const s = el.dataset.s;
      const rec = find(s, el.dataset.id);
      if (!rec) return;
      const C = costing();
      if (s === 'composites') infoBox(rec.name, breakdownHTML(S, rec, 'comp', C), true);
      else infoBox(rec.name, productAnalysisHTML(S, rec, C) + '<h3 class="sub-h">تفصيل التكلفة</h3>' + breakdownHTML(S, rec, 'prod', C), true);
    },
    // بيع الأصل أو استرداد التأمين أو تخريده (يُعدَّل سجل الأصل نفسه، فيُعامل كتعديل عند تعديل الشريك له)
    dispose: (el) => {
      const rec = find('assets', el.dataset.id);
      if (!rec || roBlock()) return;
      EDIT_OF = { s: 'assets', rec: clone(rec) };
      try {
        FORMS.disposal(clone(rec));
      } finally {
        EDIT_OF = null;
      }
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
      // الزكاة: سنة الدفع الجديدة تخص السنة السابقة لها (والأولى من الافتتاح)؛ غيرها يبدأ بعد نهاية التغطية السابقة
      if (rec.category === 'zakat') Object.assign(c, RB.zakatCoverage(S.settings, c.date));
      else c.startDate = RB.addDays(RB.coverageEnd(rec.startDate || rec.date, rec.months), 1);
      unOpening(c);
      // بعد حفظ التجديد يزول تنبيهه وزره: التركيز إلى زر «تجديد» التالي (أو السابق إن كان الأخير)
      const i = [...document.querySelectorAll('#page [data-act="renew"]')].indexOf(el);
      REFOCUS = () => {
        const nx = document.querySelectorAll('#page [data-act="renew"]');
        return i >= 0 ? nx[Math.min(i, nx.length - 1)] || null : null;
      };
      FORMS.expenses(c, undefined, { isNew: true, mode: 'renew' });
      REFOCUS = null;
    },
    // بعد الإيقاف: التركيز إلى زر «إيقاف المتابعة» التالي (أو المحتوى الرئيسي إن زالت كلها)، و«تراجع» في الرسالة يعيد
    // المتابعة (يُزيل noRenew من البند نفسه) ويركّز على زره العائد
    stopRenew: async (el) => {
      if (roBlock()) return;
      const id = el.dataset.id;
      const rec = find('expenses', id);
      if (!rec) return;
      if (!(await confirmBox(`إيقاف متابعة تجديد «${esc(rec.desc || RB.expenseCat(rec.category).name)}»؟ لن يظهر في متابعة التجديد ولا في التنبيهات، ويعود إذا سجّلت تجديده لاحقاً.`, { ok: 'أوقف المتابعة' }))) return;
      const sel = '#page [data-act="stopRenew"]';
      const i = [...document.querySelectorAll(sel)].indexOf(el);
      if (upsert('expenses', Object.assign(clone(rec), { noRenew: true })) === false) return;
      render();
      const focusOn = (b) => {
        if (b) b.focus();
        else {
          const main = document.getElementById('main');
          if (main) main.focus({ preventScroll: true });
        }
      };
      const nx = document.querySelectorAll(sel);
      focusOn(i >= 0 ? nx[Math.min(i, nx.length - 1)] : null);
      toast('أُوقفت متابعة التجديد.', '', {
        label: 'تراجع',
        run: () => {
          const r = find('expenses', id);
          if (!r || !r.noRenew || roBlock()) return;
          const c = clone(r);
          delete c.noRenew;
          if (upsert('expenses', c) === false) return;
          render();
          focusOn(document.querySelector(`${sel}[data-id="${CSS.escape(id)}"]`));
        },
      });
    },
    tab: (el) => {
      ui[el.dataset.tab] = el.dataset.v;
      resetRows();
      saveUI();
      render();
      const t = document.getElementById(tabId(el.dataset.tab, el.dataset.v));
      if (t) t.focus();
    },
    filter: (el) => {
      ui[el.dataset.f] = el.dataset.v;
      resetRows();
      saveUI();
      render();
      // الشارة المختارة نفسها بعد إعادة الرسم (لا يضيع التركيز)
      const c = document.querySelector(`.fchip[data-f="${CSS.escape(el.dataset.f)}"][data-v="${CSS.escape(el.dataset.v)}"]`);
      if (c) c.focus();
    },
    // 300 سطر أخرى من القائمة الطويلة؛ التركيز يبقى على الزر، أو على عنوان البطاقة إن ظهرت كلها
    more: (el) => {
      const cards = [...document.querySelectorAll('#page .card')];
      const i = cards.indexOf(el.closest('.card'));
      ui.rowLimit = rowLimit() + ROWS;
      saveUI();
      render();
      const b = document.querySelector('#page [data-act="more"]');
      const c = document.querySelectorAll('#page .card')[i];
      const h = c && c.querySelector('h2');
      if (b) b.focus();
      else if (h) {
        h.tabIndex = -1;
        h.focus({ preventScroll: true });
      }
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
      // الإقفالات والتحويلات تشير إلى القناة: حذفها يترك رصيد التطبيق وتحويلاته بلا قناة
      if (S.sales.some((s) => s.channels && s.channels[id]) || (S.payouts || []).some((p) => p && p.channelId === id)) return toast('لهذه القناة مبيعات أو تحويلات مسجلة. أوقفها (غير مفعّلة) بدلاً من حذفها.', 'bad');
      // ومستحقاتها في الأرصدة الافتتاحية: حذفها يُبقي المبلغ في الدفاتر ويخفيه من نموذج الأرصدة
      const opApps = (RB.openingInfo(S) || {}).appsBy || {};
      if (Object.prototype.hasOwnProperty.call(opApps, id) && num(opApps[id])) return toast('لهذه القناة مستحقات في الأرصدة الافتتاحية. أوقفها (غير مفعّلة) بدلاً من حذفها، أو صفّر مستحقاتها في الأرصدة الافتتاحية أولاً.', 'bad');
      if (!(await confirmBox('حذف قناة البيع؟', { danger: true, ok: 'احذف' })) || roBlock()) return;
      S.settings.channels = S.settings.channels.filter((c) => c.id !== id);
      saveSettings(['channels']);
      render();
      toast('تم الحذف.');
    },
    // يوم بلا إقفال لأن المطعم كان مغلقاً: لا يُنبَّه عليه (آخر 60 يوماً معلَّماً). يُسأل أولاً (العلامة تُسقط التنبيه
    // الوحيد على يوم ربما كانت فيه مبيعات)، و«تراجع» في الرسالة، والأيام المعلَّمة في صفحة المبيعات مع «إلغاء».
    // بعد التأكيد يعود التركيز إلى زر اليوم التالي (أو المحتوى الرئيسي إن زال التنبيه)
    closedDay: async (el) => {
      if (roBlock()) return;
      const d = el.dataset.d;
      if (!RB.isISODate(d)) return;
      if (!(await confirmBox(`تسجيل ${esc(dtText(d))} يوماً كان المطعم فيه مغلقاً؟ لن يُنبَّه بعدها إلى أنه بلا إقفال يومي. إن كانت فيه مبيعات فسجّل إقفاله بدلاً من ذلك.`, { ok: 'كان مغلقاً' }))) return;
      if (setClosedDay(d, true) === false) return;
      toast('سُجّل ' + dtText(d) + ' يوماً مغلقاً، فلا تنبيه له.', '', {
        label: 'تراجع',
        run: () => {
          if (setClosedDay(d, false, true) === false) return;
          // زر «تراجع» زال: التركيز إلى زر اليوم في تنبيهه العائد (أو زر التنبيه الذي يذكره)، وإلا المحتوى الرئيسي
          const b = document.querySelector(`#page [data-act="closedDay"][data-d="${d}"]`) || document.querySelector('#page [data-act="closedDay"]');
          if (b) b.focus();
          else {
            const main = document.getElementById('main');
            if (main) main.focus({ preventScroll: true });
          }
        },
      });
    },
    unclosedDay: (el) => {
      if (roBlock()) return;
      const d = el.dataset.d;
      if (!RB.isISODate(d)) return;
      // التركيز إلى زر «إلغاء» التالي في القائمة، أو عنوان البطاقة إن فرغت
      const list = [...document.querySelectorAll('#page [data-act="unclosedDay"]')];
      const i = list.indexOf(el);
      if (setClosedDay(d, false, true) === false) return;
      const next = document.querySelectorAll('#page [data-act="unclosedDay"]');
      const h = document.querySelector('#page .closed-card h2') || document.querySelector('#page h1');
      const to = next[Math.min(i, next.length - 1)] || h;
      if (to) {
        if (to === h) to.tabIndex = -1;
        to.focus();
      }
    },
    opening: () => {
      if (roBlock()) return;
      openingForm();
    },
    // كشف الصندوق أو البنك (من تنبيه الرصيد السالب): شهر التاريخ إن لم يكن في الفترة المعروضة
    stmt: (el) => {
      const d = el.dataset.d;
      ui.cashAcc = el.dataset.v === '1102' ? '1102' : '1101';
      if (RB.isISODate(d) && !inRange(d)) {
        ui.period = 'custom';
        ui.from = d.slice(0, 7) + '-01';
        ui.to = RB.monthEnd(d.slice(0, 7));
      }
      go('cash');
    },
    delopening: async () => {
      if (roBlock()) return;
      if (!(await confirmBox('حذف الأرصدة الافتتاحية؟ يُحذف قيدها من الدفاتر (الصندوق والبنك والمخزون والموردون ومخصص نهاية الخدمة وحقوق الشركاء).', { danger: true, ok: 'احذف' })) || roBlock()) return;
      S.settings.opening = null;
      saveSettings(['opening']);
      render();
      toast('تم الحذف.');
    },
    // «إخفاء» خطوات البداية (يُحفظ في الإعدادات، فتختفي عند الشريك كذلك)
    setupdone: () => {
      if (roBlock()) return;
      S.settings.setupDone = true;
      saveSettings(['setupDone']);
      render();
      focusPageTitle();
    },
    menu: () => setNav(!document.body.classList.contains('nav-open')),
    skip: () => focusPageTitle(),
    // زر حقيقي يصله Tab ويفتح اختيار الملف (حقل الملف نفسه مخفي)
    import: () => {
      if (noSharedBlock()) return;
      const i = document.getElementById('importFile');
      if (i) {
        i.value = '';
        i.click();
      }
    },
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
      // الزر الذي ضُغط (في الشريط أو الإعدادات) زال: التركيز إلى عنوان الصفحة، لا إلى أول المستند
      focusPageTitle();
    },
    // يبقى اسم المطعم والشركاء ونسبهم (لا سجلات تتبعهم بعد المسح): بدونهم لا يُسجَّل رأس مال ولا أرصدة افتتاحية،
    // ومعالج البداية لا يُعرض لدفتر بدأ (ولا يُعاد فتحه: في البيانات المشتركة يفتح الدفتر القائم ولا يضيف الشركاء)
    wipe: async () => {
      if (roBlock() || noSharedBlock()) return;
      if (otherReplacing()) return toast(BUSY_MSG, 'bad');
      // في البيانات المشتركة يُمسح الدفتر عند الشريك أيضاً، والإعدادات التي تعود إلى الافتراضي تُذكر بأسمائها (الدفتر
      // الممسوح لا يعرض معالج البداية ليُعاد إدخالها، وما يُسجَّل بعده يُحسب بها)
      const what = APP.backend && APP.backend.kind === 'cloud' ? 'مسح الدفتر المشترك نهائياً؟ يُمسح عندك وعند شريكك.' : 'مسح كل بيانات المطعم من هذا المتصفح نهائياً؟';
      if (!(await confirmBox(`${what} يبقى اسم المطعم والشركاء ونسبهم فقط، وتعود بقية الإعدادات (التسجيل في الضريبة وتاريخه والرقم الضريبي وتاريخ الافتتاح وقنوات البيع وعمولاتها ونسب التأمينات) إلى قيمها الافتراضية فراجعها بعد المسح. صدّر نسخة احتياطية قبلها إن احتجت.`, { danger: true, ok: 'امسح الكل' }))) return;
      const fresh = RB.emptyState();
      fresh.settings = Object.assign(RB.defaultSettings(), { name: S.settings.name, startedAt: new Date().toISOString() });
      // بنسبهم الحالية: تاريخ نسبهم السابقة يخص الدفتر الممسوح
      fresh.partners = good(S.partners).map((p) => {
        const c = clone(p);
        delete c.shareHist;
        return c;
      });
      await replaceAll(fresh, { done: 'تم مسح البيانات.' });
    },
    reload: () => location.reload(),
    // إعادة حفظ ما لم يُحفظ في البيانات المشتركة (شريط «لم يُحفظ آخر تعديل»): تنبيه واحد بالنتيجة
    retrysave: async () => {
      const be = APP.backend;
      if (APP.retrying || APP.replacing || !be || !be.retryFailed || roBlock()) return;
      APP.retrying = true;
      updateBanner();
      let res = null;
      try {
        res = await be.retryFailed(retryAsk);
      } finally {
        APP.retrying = false;
        updateSaveStatus();
      }
      if (!res) toast('جارٍ الحفظ الآن…');
      else if (res.ok) toast(res.merged ? 'حُفظ كل ما لم يُحفظ في البيانات المشتركة، ودُمج مع ما عدّله شريكك أو نافذة أخرى في السجلات نفسها أثناء ذلك.' : 'حُفظ كل ما لم يُحفظ في البيانات المشتركة.');
      else if (res.err) toast(dbErrMsg(res.err), 'bad');
    },
    // إكمال استيراد أو مسح لم يكتمل في البيانات المشتركة: إعادة كتابة الدفتر المطلوب (آمنة إن تكررت).
    // الدفتر المطلوب هو ما كان يُحفظ مع تعديلات المستخدم بعده، لا خليط البيانات المشتركة ولا التجربة المعروضة
    resumereplace: async () => {
      const f = APP.replaceFailed;
      if (!f || APP.replacing) return;
      await replaceAll(f.state, { before: f.before, written: f.written, done: 'اكتمل الحفظ في البيانات المشتركة.' });
    },
    dismissreplace: async () => {
      APP.replaceMarker = null;
      updateBanner();
      // زر الإخفاء زال مع شريطه: التركيز إلى المحتوى الرئيسي
      const main = document.getElementById('main');
      if (main && (!document.activeElement || document.activeElement === document.body)) main.focus({ preventScroll: true });
      try {
        await APP.backend.db.doc('config/replace').delete();
      } catch (e) {
        /* يبقى مخفياً في هذه الزيارة */
      }
    },
  };

  // «أعد المحاولة» وقد عدّل الشريك أو نافذة أخرى بعض ما لم يُحفظ (CloudBackend.retryFailed): سؤال واحد عنها كلها.
  // true: يُحفظ ما أدخله المستخدم فيها، false (ومنه الإغلاق): يبقى ما حفظه الآخر، وتُحفظ بقية تعديلات المستخدم في الحالتين
  const RETRY_FIELD = { amount: 'المبلغ', desc: 'البيان', note: 'الملاحظة', name: 'الاسم', category: 'التصنيف', account: 'الحساب', months: 'عدد الأشهر', supplier: 'المورد', price: 'السعر', lines: 'الأسطر', items: 'الأصناف', channels: 'مبالغ القنوات', share: 'النسبة', type: 'النوع' };
  function retryAsk(items) {
    const line = (p) => {
      const s = p.keep.section;
      const r = p.keep.rec || p.cur || {};
      const what = `${esc(SECTION_NAME[s] || 'سجل')} «${esc(recLabel(s, r))}»`;
      if (p.kind === 'deleted') return `${what}: حذفه وكنت عدّلته`;
      if (p.kind === 'edited') return `${what}: عدّله وكنت حذفته`;
      return `${what}: غيّرتما كلاكما ${[...new Set(p.clash.map((k) => RETRY_FIELD[k] || fieldName(s, k)))].map((x) => '«' + esc(x) + '»').join('، ')}`;
    };
    return confirmBox(`عدّل شريكك أو نافذة أخرى بعد فشل الحفظ سجلات لم يُحفظ تعديلك عليها:<br>${items.map((p) => '• ' + line(p)).join('<br>')}<br>«احفظ ما أدخلته» يضع تعديلك فيها (ويعيد ما حذفه ويحذف ما حذفته)، و«أبقِ تعديله» يتركها كما حفظها. بقية تعديلاتك تُحفظ في الحالتين.`, { title: 'تعديل شريكك أثناء انقطاع الحفظ', ok: 'احفظ ما أدخلته', cancel: 'أبقِ تعديله' });
  }

  function go(page) {
    if (!isPage(page)) page = 'dashboard';
    ui.page = page;
    resetRows();
    saveUI();
    try {
      if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
    } catch (e) {
      /* بعض الإطارات تمنع تعديل الرابط */
    }
    setNav(false, { focus: false });
    render();
    const m = document.getElementById('main');
    if (m) m.scrollTo ? m.scrollTo(0, 0) : null;
    window.scrollTo(0, 0);
    focusPageTitle();
  }

  // درج القائمة على الشاشات الصغيرة: ☰ يفتحه وينقل التركيز إلى رابط الصفحة الحالية، والإغلاق يعيده إلى ☰.
  // o.focus=false: إغلاق بلا نقل التركيز (التنقل، تكبير النافذة)
  function setNav(open, o) {
    const focus = !o || o.focus !== false;
    open = !!open;
    const was = document.body.classList.contains('nav-open');
    document.body.classList.toggle('nav-open', open);
    const b = document.querySelector('.menu-btn');
    if (b) b.setAttribute('aria-expanded', String(open));
    if (!focus || was === open) return;
    if (open) {
      const a = document.querySelector('#nav a.on') || document.querySelector('#nav a');
      if (a) a.focus();
    } else if (b) b.focus();
  }

  // جهاز آخر يستورد أو يمسح البيانات المشتركة الآن (علامته جارية): لا تبدأ عملية استبدال ثانية فوقها
  const otherReplacing = () => !!APP.backend && APP.backend.kind === 'cloud' && RB.replaceMarkerState(APP.replaceMarker, Date.now(), SID) === 'running';
  // استبدال الدفتر كله (البداية، الاستيراد، المسح، إكمال الحفظ). يرجع true فقط إن حُفظ كاملاً.
  // o.before وo.written: عند إكمال عملية فشلت، المستندات التي كانت قبلها (لا يُحذف غيرها) وما كُتب منها (لا يُكتب ثانية
  // ما لم يتغيّر). o.done: رسالة النجاح؛ وإن تغيّر الدفتر المشترك أثناء العملية من جهاز آخر (سجلات أُضيفت أو حُذفت) تُذكر معها
  async function replaceAll(state, o) {
    o = o || {};
    const before = o.before;
    if (APP.readOnly) {
      toast(roMsg(), 'bad');
      return false;
    }
    if (otherReplacing()) {
      toast(BUSY_MSG, 'bad');
      return false;
    }
    const was = { S, demo: APP.demo, real: APP.real };
    S = RB.normalize(state);
    APP.demo = false;
    APP.real = null;
    bump();
    render();
    if (APP.backend.kind !== 'cloud') {
      const ok = await APP.backend.replaceAll(S);
      if (ok && o.done) toast(o.done);
      return ok;
    }
    // اللقطات الجزئية أثناء الكتابة لا تُعرض؛ يُطابق الدفتر مع البيانات المشتركة بعد الانتهاء
    APP.replacing = true;
    APP.save.pending++;
    updateSaveStatus();
    const t = document.createElement('div');
    t.className = 'toast sticky';
    document.getElementById('toast').appendChild(t);
    let res;
    try {
      // التعديل أثناءها يُرفض (roBlock)، فيُقال ذلك مع التقدم
      res = await APP.backend.replaceAll(
        S,
        (done, total) => {
          if (total) t.dataset.total = total;
          t.textContent = `جارٍ الحفظ… ${done} من ${t.dataset.total || '?'} — لا تعدّل حتى ينتهي`;
        },
        before,
        o.written
      );
    } catch (e) {
      res = { ok: false, failed: countRecs(S), code: (e && e.code) || 'error', before, written: o.written };
    }
    t.remove();
    APP.replacing = false;
    APP.save.pending--;
    if (res.code === 'busy' && res.untouched) {
      // بدأ جهاز آخر قبل هذه (لم يُكتب شيء): يعود ما كان معروضاً، مطابَقاً مع البيانات المشتركة (لقطاتها أثناء
      // المحاولة لم تُطبَّق). عملية فشلت قبلها يبقى دفترها المطلوب في الشاشة لـ «أكمل الحفظ»
      S = was.S;
      APP.demo = was.demo;
      APP.real = was.real;
      toast(BUSY_MSG, 'bad');
      if (!APP.replaceFailed) {
        try {
          const d = await loadSettled();
          if (APP.demo) {
            if (APP.real && d) APP.real = RB.normalize(d);
          } else if (hasBooks(d)) S = RB.normalize(d);
        } catch (e) {
          /* يبقى ما كان معروضاً */
        }
      }
      bump();
      render();
      return false;
    }
    if (res.ok) {
      APP.replaceFailed = null;
      APP.replaceMarker = null;
      APP.save.failed = null;
      try {
        const d = await loadSettled();
        if (d) S = RB.normalize(d);
      } catch (e) {
        /* يبقى ما كُتب */
      }
      bump();
      render();
      const other = [res.extra ? 'سجلات أضافها فبقيت فيه: ' + fmt0(res.extra) : '', res.missing ? 'سجلات حذفها منه: ' + fmt0(res.missing) : ''].filter(Boolean).join('، و');
      if (other) toast(`${o.done || 'حُفظ الدفتر.'} لكن جهازاً آخر (شريكك غالباً) غيّر الدفتر المشترك أثناء العملية — ${other}. راجعها.`, 'bad');
      else if (o.done) toast(o.done);
      return true;
    }
    if (res.code === 'invalid_argument' && APP.canWrite !== true) {
      // لا صلاحية تعديل: لا شيء كُتب، فيُعاد الدفتر المشترك كما هو (ولا إكمال لعرض فقط)
      APP.readOnly = true;
      APP.replaceFailed = null;
      APP.save.failed = 'invalid_argument';
      toast('ليست لديك صلاحية تعديل هذه البيانات.', 'bad');
      try {
        openBooks(await APP.backend.load());
      } catch (e) {
        render();
      }
      return false;
    }
    // الدفتر المطلوب يبقى كما هو حتى يُحفظ كاملاً: لقطات البيانات المشتركة (خليط القديم وما كُتب) لا تُطبَّق عليه،
    // وهو نفسه الدفتر في الشاشة فتدخل فيه تعديلات المستخدم بعد الفشل. «أكمل الحفظ» يكتبه هو
    APP.replaceFailed = { n: res.failed, d: res.dels || 0, state: S, before: res.before, written: res.written, code: res.code };
    APP.save.failed = failCode(res.code);
    // توقف الوصول أثناء العملية: لا «أكمل الحفظ» (لن ينجح)، والدفتر المطلوب في الشاشة وفي النسخة الاحتياطية
    if (res.code === 'revoked' && APP.backend.lost) APP.backend.lost();
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
  // القفل يمنع تحميلين متزامنين فقط (لقطات الأقسام تصل متتابعة)، ويُفك بعد الفتح: إن رجعت النافذة
  // إلى التجربة لاحقاً (مسح الدفتر في نافذة أخرى) يُفتح الدفتر الجديد كذلك
  // قراءة الدفتر المشترك كله لفتحه. الإعدادات والمجموعات تُقرأ معاً والشريك قد يكتب الدفتر الآن (سجلاته أولاً ثم
  // إعداداته)، فقراءة تتقاطع مع كتابته تجمع الجديد والقديم (شركاؤه بإعدادات افتراضية)، ولقطاته أثناءها لا تُطبَّق في وضع
  // التجربة ولا تتكرر بعدها. فتُعاد القراءة ما دامت لقطة وصلت أثناءها (بحد أقصى)
  async function loadSettled() {
    for (let i = 0; ; i++) {
      const seq = APP.remoteSeq;
      const d = await APP.backend.load();
      if (seq === APP.remoteSeq || i >= 20) return d;
    }
  }
  async function adoptSaved() {
    if (APP.adopting) return;
    APP.adopting = true;
    let d = null;
    try {
      d = await loadSettled();
    } catch (e) {
      return;
    } finally {
      APP.adopting = false;
    }
    // تعذّر التحميل عند الفتح ثم نجح الآن: يزول شريطه (ويعود «ابدأ» إن لم يبدأ أحد الدفتر بعد)
    const wasFailed = APP.loadFailed;
    APP.loadFailed = false;
    if (!(APP.demo && !APP.real && hasBooks(d))) {
      if (wasFailed) render();
      return;
    }
    // نموذج مفتوح من التجربة (غير معالج البداية) لا يُحفظ في الدفتر (formModal)، فيُقال ذلك الآن قبل أن يُكمله المستخدم
    const form = !!document.querySelector('#modals .overlay[data-demo-form]');
    openBooks(d);
    // تعذّر التحميل عند الفتح ثم وصلت البيانات: ليست بداية جديدة من الشريك
    toast((wasFailed ? 'تم فتح دفتر المطعم بعد تعذّر تحميله أول مرة.' : APP.backend.kind === 'cloud' ? 'بدأ شريكك دفتر المطعم — تم فتح البيانات المشتركة.' : 'بدأ دفتر المطعم في نافذة أخرى — تم فتحه هنا.') + (form ? ' النموذج المفتوح من البيانات التجريبية لن يُحفظ.' : ''));
  }

  function startWizard() {
    if (noSharedBlock()) return;
    // نسبة الشريك الثاني تكمل الأول إلى 100% ما لم يكتبها المستخدم بنفسه
    let s2Typed = false;
    const twoP = (v) => !!(v.p2 && String(v.p2).trim());
    formModal({
      title: 'ابدأ ببيانات مطعمك',
      ok: 'ابدأ',
      // يتحقق بنفسه من دفتر بدأ بعد فتحه (يفتحه أو يسأل قبل حذفه)
      anyBooks: true,
      value: { name: '', openingDate: '', vatRegistered: true, vatRegisteredFrom: '', p1: '', s1: 50, p2: '', s2: 50, existing: false },
      // نسبة الثاني تظهر فوراً أثناء الكتابة (الحقل الذي يُكتب فيه يبقى كما هو)، فلا يُحفظ ما لم يُعرض
      onChange: (p, v) => {
        if (p === 's2') s2Typed = true;
        const s1 = num(v.s1);
        if (!twoP(v) || v.s1 === '' || !(s1 >= 0 && s1 <= 100)) return;
        if (p !== 's1' && !(p === 'p2' && !s2Typed)) return;
        const s2 = r2(Math.max(0, 100 - s1));
        if (s2 === v.s2) return;
        v.s2 = s2;
        return 'redraw';
      },
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
        { type: 'row', fields: [{ k: 'p1', label: 'الشريك الأول', req: 1 }, { k: 's1', type: 'num', label: 'نسبته %', min: 0, max: 100, redraw: true, help: 'إذا كنت الشريك الوحيد اترك الثاني فارغاً وتصبح نسبتك ' + rate(100) }] },
        { type: 'row', fields: [{ k: 'p2', label: 'الشريك الثاني', redraw: true }, { k: 's2', type: 'num', label: 'نسبته %', min: 0, max: 100 }] },
        { k: 'existing', type: 'check', label: 'المطعم يعمل من قبل — أبدأ الدفتر بأرصدة افتتاحية', help: 'بعد البدء يُفتح نموذج الأرصدة الافتتاحية: ما في الصندوق والبنك والمخزون، وما عند التطبيقات، وما عليك للموردين' },
      ],
      onSave: async (v) => {
        // شريك واحد: نسبته 100% مهما كُتب في حقلها؛ شريكان: نسبتان موجبتان مجموعهما 100%
        const two = twoP(v);
        const s1 = two ? num(v.s1) : 100;
        const s2 = num(v.s2);
        if (two && (!(s1 > 0) || !(s2 > 0))) return 'يجب أن تكون نسبة كل شريك أكبر من صفر.';
        // الرسالة نص عادي (textContent): النسبة معزولة باتجاه من اليسار لليمين، وإلا ظهرت «%100» في السياق العربي
        if (two && Math.abs(s1 + s2 - 100) > 0.01) return 'يجب أن يكون مجموع نسبتي الشريكين ' + ltr('100%') + ' (يمكن إضافة شركاء آخرين لاحقاً من صفحة الشركاء).';
        // الشريك يستورد أو يبدأ الدفتر الآن: يبقى النموذج مفتوحاً، وحين ينتهي يُفتح دفتره هنا
        if (otherReplacing()) return BUSY_MSG;
        // لا يُكتب فوق دفتر محفوظ: المشترك يُفتح كما هو، وفي المتصفح يلزم تأكيد حذفه
        let existing = APP.real;
        if (!existing) {
          try {
            existing = await loadSettled();
          } catch (e) {
            return 'تعذّر التحقق من البيانات المحفوظة، أعد المحاولة.';
          }
          APP.loadFailed = false;
        }
        if (hasBooks(existing)) {
          if (APP.backend.kind === 'cloud') {
            const mine = existing === APP.real;
            openBooks(existing);
            toast(mine ? 'يوجد دفتر مشترك محفوظ — تم فتحه بدل البدء من جديد.' : 'بدأ شريكك دفتر المطعم — تم فتح البيانات المشتركة.');
            return;
          }
          const name = (existing.settings && existing.settings.name) || '';
          if (!(await confirmBox('يوجد دفتر محفوظ «' + esc(name) + '» فيه ' + cnt(countRecs(existing), W.rec) + '، وسيُحذف نهائياً. صدّر نسخة احتياطية أولاً إن احتجت.', { danger: true, ok: 'احذف وابدأ من جديد' }))) return false;
        }
        const st = RB.emptyState();
        Object.assign(st.settings, { name: v.name.trim(), openingDate: v.openingDate, vatRegistered: !!v.vatRegistered, vatRegisteredFrom: v.vatRegistered ? v.vatRegisteredFrom || '' : '', startedAt: new Date().toISOString() });
        st.partners.push({ id: RB.uid(), name: v.p1.trim(), share: s1, phone: '', note: '' });
        if (two) st.partners.push({ id: RB.uid() + 'b', name: v.p2.trim(), share: s2, phone: '', note: '' });
        const ok = await replaceAll(st);
        go('dashboard');
        if (ok && v.existing) {
          // بعد إغلاق نافذة البداية
          setTimeout(openingForm, 50);
          toast('جاهز. أدخل الأرصدة الافتتاحية في تاريخ بدء الدفتر.');
        } else if (ok) toast('جاهز. اتبع خطوات «ابدأ من هنا» في لوحة المتابعة.');
      },
    });
  }

  // النسخة الاحتياطية: الدفتر المحفوظ لا البيانات التجريبية المعروضة فوقه
  const backupSource = () => (APP.demo && APP.real ? APP.real : S);
  const REAL_MSG = 'صُدّرت بياناتك الحقيقية وليست البيانات التجريبية';
  // آخر نسخة احتياطية (لتذكير الحفظ في المتصفح)
  function backedUp() {
    lsSet(BACKUP_KEY, new Date().toISOString());
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
  // اسم ملف داخل نص عربي: الجزء العربي ثم التاريخ والامتداد كتلة واحدة من اليسار لليمين لا تنكسر بين سطرين
  // (عزل بالوسوم لا بعلامات اتجاه خفية تنتقل مع الاسم إن نُسخ)
  function fileNameHtml(name) {
    const i = name.search(/\d/);
    if (i < 0) return `<bdi class="fname">${esc(name)}</bdi>`;
    return `<bdi class="fname">${esc(name.slice(0, i))}<span dir="ltr">${esc(name.slice(i))}</span></bdi>`;
  }
  // نافذة نسخ النص حين لا يمكن تنزيل الملف. intro: شرح (HTML) فوق النص. ترجع (عند إغلاقها) true إن نُسخ النص
  function copyBox(title, txt, intro) {
    return new Promise((resolve) => {
      let copied = false;
      const m = openModal({ title, wide: true, onClose: () => resolve(copied) });
      m.body.innerHTML = (intro || '') + `<textarea class="copy-area" readonly aria-label="نص الملف">${esc(txt)}</textarea>`;
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
      // العنوان قصير، والاسم في سطر وحده تحته فلا ينكسر داخل التاريخ على الجوال
      const ok = await copyBox('التنزيل غير متاح هنا', data, `<p class="note copy-intro">انسخ النص واحفظه في ملف نصي باسم:</p><p class="copy-name">${fileNameHtml(name)}</p>`);
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
    let start = from;
    let end = to;
    let rows = [];
    let name = what;
    // ما يصدَّر هو ما في الجدول: الفترة وفلتر التصنيف، واسم التصنيف في اسم الملف
    const catSuffix = (k, cat) => (ui[k] ? '-' + cat(ui[k]).name : '');
    if (what === 'expenses') {
      rows.push(['التاريخ', 'التصنيف', 'البيان', 'الجهة', 'قبل الضريبة', 'الضريبة', 'الإجمالي', 'الأشهر', 'الدفع من']);
      good(S.expenses).filter((x) => inRange(x.date) && (!ui.expCat || x.category === ui.expCat)).sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((x) => {
        const v = RB.vatSplit(x.amount, x.includesVat, x.taxable && !RB.isOpeningExpense(x), S.settings);
        rows.push([x.date, RB.expenseCat(x.category).name, x.desc, x.entity, v.net, v.vat, v.gross, x.months, RB.srcLabel(x.account, S, 'expenses')]);
      });
      name = 'المصاريف' + catSuffix('expCat', RB.expenseCat);
    } else if (what === 'purchases') {
      rows.push(['التاريخ', 'المورد', 'رقم الفاتورة', 'التصنيف', 'الدفع', 'خاضعة', 'قبل الضريبة', 'الضريبة', 'الإجمالي']);
      good(S.purchases).filter((p) => inRange(p.date) && (!ui.purCat || p.category === ui.purCat)).sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((p) => {
        const v = RB.vatSplit(RB.purchaseTotal(p), p.includesVat, p.taxable, S.settings);
        rows.push([p.date, p.supplier, p.invoiceNo, RB.purchaseCat(p.category).name, RB.srcLabel(p.account, S), p.taxable ? 'نعم' : 'لا', v.net, v.vat, v.gross]);
      });
      name = 'المشتريات' + catSuffix('purCat', RB.purchaseCat);
    } else if (what === 'sales') {
      const chs = S.settings.channels;
      rows.push(['التاريخ', ...chs.map((c) => c.name), 'الطلبات', 'الإجمالي']);
      good(S.sales).filter((s) => inRange(s.date)).sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((s) => rows.push([s.date, ...chs.map((c) => (s.channels[c.id] ? s.channels[c.id].amount : '')), RB.saleOrders(s), RB.saleTotal(s)]));
      name = 'المبيعات';
    } else if (what === 'statement') {
      const acc = ui.cashAcc === '1102' ? '1102' : '1101';
      const st = RB.accountStatement(S, acc, from, asOf, ledger());
      rows.push(['التاريخ', 'البيان', 'داخل', 'خارج', 'الرصيد']);
      rows.push([from, 'رصيد أول الفترة', '', '', st.opening]);
      st.rows.forEach((r) => rows.push([r.date, r.desc, r.in, r.out, r.balance]));
      name = acc === '1101' ? 'كشف-الصندوق' : 'كشف-البنك';
      end = asOf;
    } else {
      // كل تبويب يصدّر ما يعرضه، مقطوعاً عند اليوم مثل الشاشة
      const L = ledger();
      const rep = isReport(ui.report) ? ui.report : 'income';
      end = asOf;
      if (rep === 'journal') {
        rows.push(['التاريخ', 'البيان', 'الحساب', 'مدين', 'دائن']);
        L.entries.filter((e) => e.date >= from && e.date <= asOf).forEach((e) => e.lines.forEach((l) => rows.push([e.date, l.memo ? e.desc + ' — ' + l.memo : e.desc, RB.accInfo(l.a, S).name, l.v > 0 ? l.v : '', l.v < 0 ? -l.v : ''])));
      } else if (rep === 'trial') {
        const t = RB.trialBalance(S, from, asOf, L);
        rows.push(['الرمز', 'الحساب', 'مدين', 'دائن']);
        t.rows.forEach((r) => rows.push([r.disp, r.name, r.dr, r.cr]));
        rows.push(['', 'الإجمالي', t.dr, t.cr]);
      } else if (rep === 'balance') {
        const b = RB.balanceSheet(S, asOf, L);
        rows.push(['القسم', 'البند', 'المبلغ']);
        b.cur.forEach((x) => rows.push(['أصول متداولة', x.name, x.amount]));
        rows.push(['أصول متداولة', 'إجمالي المتداولة', b.tCur]);
        b.fixed.forEach((x) => rows.push(['أصول غير متداولة', x.name, x.amount]));
        rows.push(['أصول غير متداولة', 'صافي الأصول غير المتداولة', b.tFixed]);
        rows.push(['', 'إجمالي الأصول', b.tAssets]);
        b.liab.forEach((x) => rows.push(['التزامات', x.name, x.amount]));
        rows.push(['التزامات', 'إجمالي الالتزامات', b.tLiab]);
        b.equity.forEach((x) => rows.push(['حقوق الشركاء', x.name, x.amount]));
        rows.push(['حقوق الشركاء', 'إجمالي حقوق الشركاء', b.tEq]);
        rows.push(['', 'الالتزامات + حقوق الشركاء', r2(b.tLiab + b.tEq)]);
      } else if (rep === 'vat') {
        // ملخص الفترة كما في الشاشة، ثم الإقرارات التي تلامس الفترة (من بداية الإقرارات حتى اليوم لترحيل الرصيد الدائن)
        const v = RB.vatReport(S, from, asOf, L);
        rows.push(['البند', 'المبلغ الخاضع', 'الضريبة']);
        rows.push(['المبيعات (كل القنوات)', v.sales.base, v.sales.vat]);
        Object.keys(v.inputs).forEach((k) => rows.push(['مدخلات: ' + k, v.inputs[k].base, v.inputs[k].vat]));
        rows.push(['إجمالي المدخلات', v.inBase, v.inVat]);
        rows.push([v.net >= 0 ? 'صافي الضريبة المستحقة' : 'صافي الضريبة لصالحك (رصيد دائن)', '', Math.abs(v.net)]);
        rows.push(['المسدد في الفترة', '', v.paid]);
        const t = today();
        const rets = RB.vatReturns(S, t, L);
        const pers = rets.filter((p) => p.to >= from && p.from <= to);
        // والضريبة المستحقة عند بدء الدفتر من إقرار سابق (كما في الشاشة)
        const opv = rets.opening;
        if (pers.length || opv) {
          rows.push([]);
          rows.push(['الإقرار', 'من', 'إلى', 'ضريبة المبيعات', 'ضريبة المدخلات', 'صافي الفترة', 'قبل بدء الدفتر', 'مرحّل من قبل', 'المستحق للسداد', 'المسدد', 'المسترد', 'المتبقي', 'آخر موعد', 'الحالة']);
          if (opv) rows.push([opv.label + ' (مستحق عند بدء الدفتر)', opv.from, opv.to, '', '', '', '', '', opv.payable, opv.paid, '', opv.remaining, opv.deadline, opv.settled ? 'مسدد' : 'غير مسدد']);
          pers.forEach((p) => rows.push([p.label, p.from, p.to, p.report.sales.vat, p.report.inVat, p.net, p.pre, p.carried, p.due, p.paid, p.refund, p.remaining, RB.monthEnd(RB.ymAdd(p.to.slice(0, 7), 1)), p.to >= t ? 'الفترة جارية' : p.settled ? 'مسدد' : 'غير مسدد']));
        }
      } else if (rep === 'breakeven') {
        // الأساس نفسه الذي تعرضه الشاشة (أشهر التشغيل الكاملة)
        const { e, basis, adj } = breakEvenView();
        rows.push(['البند', 'القيمة']);
        rows.push(['المصاريف الثابتة شهرياً', e.fixedMonthly]);
        ['labor', 'occ', 'opex', 'dep'].forEach((g) => rows.push(['منها: ' + RB.GROUPS[g], e.fixedParts[g]]));
        rows.push(['المصاريف المتغيرة % (المواد + العمولات من المبيعات)', e.varRatio * 100]);
        rows.push(['هامش المساهمة %', (1 - e.varRatio) * 100]);
        // غير المسجل: مبيعاته بلا ضريبة، فسطر واحد للتعادل الشهري (بدون الضريبة = شاملة الضريبة)
        if (vatIn(today())) {
          rows.push(['مبيعات التعادل الشهرية بدون الضريبة', e.beNet]);
          rows.push(['مبيعات التعادل الشهرية شاملة الضريبة', e.beGross]);
          rows.push(['مبيعات التعادل يومياً شاملة الضريبة', e.beDaily]);
        } else {
          rows.push(['مبيعات التعادل الشهرية', e.beGross]);
          rows.push(['مبيعات التعادل يومياً', e.beDaily]);
        }
        rows.push(['طلبات يومياً تقريباً', e.avgTicket ? Math.round(e.beDaily / e.avgTicket) : '']);
        rows.push(['متوسط الفاتورة', e.avgTicket || '']);
        rows.push(['هامش الأمان %', e.revenue ? e.safety : '']);
        rows.push(['أساس الحساب', basis]);
        rows.push(['عدد الأشهر', e.months]);
        rows.push(['من', e.basisFrom]);
        rows.push(['إلى', e.basisTo]);
        if (adj.length) rows.push(['ملاحظة', adj.join(' ')]);
      } else if (rep === 'monthly') {
        const md = monthlyData();
        const G = Object.keys(RB.GROUPS).filter((g) => g !== 'zakat');
        const row = (label, f) => rows.push([label, ...md.incs.map(f)]);
        rows.push(['البند', ...md.months.map((m) => RB.monthName(m))]);
        row(salesLbl('صافي المبيعات', md.to), (i) => i.revenue);
        G.forEach((g) => row(RB.GROUPS[g], (i) => i.tot[g]));
        row('صافي الربح قبل الزكاة', (i) => i.netBeforeZakat);
        row(RB.GROUPS.zakat, (i) => i.tot.zakat);
        row('صافي الربح بعد الزكاة', (i) => i.net);
        // شهر بلا مبيعات: خانة فارغة لا 0
        row('تكلفة المواد %', (i) => (i.revenue ? i.ratios.foodCost : ''));
        row('التكلفة الأساسية %', (i) => (i.revenue ? i.ratios.prime : ''));
        row('صافي الهامش %', (i) => (i.revenue ? i.ratios.netMargin : ''));
        start = md.from;
        end = md.to;
      } else if (rep === 'menu') {
        const m = RB.menuAnalysis(S, from, asOf, L);
        rows.push(['الصنف', 'الكمية', 'حصة الكمية المباعة %', 'ربح الحبة', 'إجمالي الربح', 'تكلفة الطعام %', 'فئة المنيو', 'ماذا تفعل']);
        m.rows.forEach((r) => rows.push([r.name, r.qty, r.mix, r.profit, r.totalProfit, r.foodCost, RB.MENU_CLASS[r.cls].name, RB.MENU_CLASS[r.cls].tip]));
        if (m.hasItems) {
          rows.push([]);
          rows.push(['التكلفة النظرية (حسب الوصفات × المبيعات)', m.theoretical]);
          rows.push(['التكلفة الفعلية (المشتريات ± الجرد)', m.actual]);
          rows.push(['الفرق غير المفسَّر', m.variance]);
          rows.push([]);
          rows.push(['المادة', 'الكمية', 'الوحدة', 'بوحدة الشراء', 'وحدة الشراء', 'التكلفة']);
          m.rawUsage.forEach((r) => rows.push([r.name, Math.round(r.qty), r.unit, +r.buyQty.toFixed(1), r.buyUnit, r.cost]));
        }
      } else if (rep === 'income') {
        // كما في الشاشة: بنود كل مجموعة ثم إجماليها، ومجمل الربح بعد تكلفة المبيعات
        const inc = RB.incomeStatement(S, from, asOf, L);
        rows.push(['القسم', 'البند', 'المبلغ']);
        if (Math.abs(inc.salesDeductions) >= 0.005) {
          rows.push(['الإيرادات', salesLbl('المبيعات', asOf), inc.grossSales]);
          rows.push(['الإيرادات', 'ناقص: خصومات ومرتجعات المبيعات (عروض التطبيقات)', -inc.salesDeductions]);
          rows.push(['الإيرادات', 'صافي المبيعات', inc.revenue]);
        } else rows.push(['الإيرادات', salesLbl('المبيعات', asOf), inc.revenue]);
        Object.keys(RB.GROUPS)
          .filter((g) => g !== 'zakat')
          .forEach((g) => {
            inc.groups[g].forEach((x) => rows.push([RB.GROUPS[g], x.name, x.amount]));
            if (inc.groups[g].length) rows.push([RB.GROUPS[g], 'إجمالي ' + RB.GROUPS[g], inc.tot[g]]);
            if (g === 'cogs') rows.push(['', 'مجمل الربح', inc.grossProfit]);
          });
        rows.push(['', 'صافي الربح قبل الزكاة', inc.netBeforeZakat]);
        rows.push([RB.GROUPS.zakat, RB.GROUPS.zakat, inc.zakat]);
        rows.push(['', 'صافي الربح بعد الزكاة', inc.net]);
      } else {
        toast('هذا التقرير لا يدعم التصدير بعد', 'bad');
        return;
      }
      name = (REPORTS.find((r) => r[0] === rep) || ['', 'تقرير'])[1];
    }
    saveFile(`${name}-${start}-${end}.csv`.replace(/\s+/g, '-').replace(/[\\/:*?"<>|]/g, '-'), RB.toCSV(rows));
  }

  function importFile(file) {
    const fr = new FileReader();
    fr.onload = async () => {
      const data = safeJSON(fr.result);
      const isObj = RB.isObj;
      if (!isObj(data) || (data.settings != null && !isObj(data.settings)) || (!isObj(data.settings) && !RB.SECTIONS.some((k) => Array.isArray(data[k])))) return toast('الملف ليس نسخة احتياطية صالحة من دفتر المطعم.', 'bad');
      if (APP.readOnly) return toast(roMsg(), 'bad');
      if (otherReplacing()) return toast(BUSY_MSG, 'bad');
      if (noSharedBlock()) return;
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
      // البيانات المشتركة (ولو كانت التجربة معروضة فوقها): تُستبدل عند الشريك أيضاً
      const what = APP.backend.kind === 'cloud' ? 'الدفتر المشترك (عندك وعند شريكك)' : APP.demo ? 'دفترك المحفوظ' : 'بياناتك الحالية';
      const repl = hasBooks(cur) ? `ستحل محل ${what} «${esc((cur.settings && cur.settings.name) || '')}» (${cnt(countRecs(cur), W.rec)}) بالكامل. صدّر نسخة من بياناتك أولاً إن احتجتها.` : 'لا يوجد دفتر محفوظ الآن، فيبدأ دفترك بها.';
      const notes = (skipped ? `<br>تم تجاهل سجلات غير صالحة: ${cnt(skipped, W.rec)}.` : '') + (notList.length ? `<br>أقسام ليست قوائم تم تجاهلها: ${esc(notList.map((k) => RB.SECTION_LABELS[k] || k).join('، '))}.` : '');
      const demoNote = data.demo === true ? '<br><b>هذا ملف بيانات تجريبية وليس نسخة من دفترك.</b>' : '';
      if (!(await confirmBox(`استيراد نسخة «${esc((data.settings && data.settings.name) || '')}» فيها ${cnt(n, W.rec)}؟ ${repl}${demoNote}${notes}`, { danger: true, ok: 'استورد' }))) return;
      delete data.demo;
      data.settings = Object.assign({}, data.settings, { startedAt: (data.settings && data.settings.startedAt) || new Date().toISOString() });
      await replaceAll(data, { done: 'تم الاستيراد.' });
    };
    fr.readAsText(file);
  }

  // ═════════════ الرسم ═════════════
  function shellHTML() {
    return `<div class="shell">
      <a class="skip" href="#page" data-act="skip">تخطَّ إلى المحتوى</a>
      <aside class="side" id="side" aria-label="القائمة الرئيسية">
        <div class="brand"><span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><div><b>دفتر المطعم</b><small id="restName"></small></div></div>
        <nav id="nav"></nav>
        <div class="side-foot" id="saveStatus"></div>
      </aside>
      <div class="scrim" data-act="menu"></div>
      <main class="main" id="main" tabindex="-1">
        <header class="topbar">
          <button type="button" class="icon-btn menu-btn" data-act="menu" aria-label="القائمة" aria-controls="side" aria-expanded="false">☰</button>
          <div class="crumb" id="crumb"></div>
          <div class="period">
            <label for="periodSel" class="vh">الفترة</label>
            <select id="periodSel">${PERIODS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
            <span class="custom-range" id="customRange"><input type="date" id="pFrom" aria-label="من تاريخ" min="${P_MIN}" max="${P_MAX}"><span>—</span><input type="date" id="pTo" aria-label="إلى تاريخ" min="${P_MIN}" max="${P_MAX}"></span>
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
    document.title = (PAGE_TITLES[ui.page] || '') + ' · ' + (S.settings.name || 'دفتر المطعم');
    document.getElementById('periodSel').value = ui.period;
    const cr = document.getElementById('customRange');
    cr.hidden = ui.period !== 'custom';
    // الفترة المخصصة: الحقلان يعرضان المحفوظ نفسه، فلا يظهر شهر غير المستخدم في الحساب. الحقل الذي يُكتب فيه
    // الآن لا يُلمس (إعادة رسم أثناء كتابة التاريخ بمقاطعه لا تُرجعه إلى قيمته السابقة)
    const [a, b] = range();
    const custom = ui.period === 'custom';
    const pf = document.getElementById('pFrom');
    const pt = document.getElementById('pTo');
    if (periodFocus !== pf) pf.value = custom && RB.isISODate(ui.from) ? ui.from : a;
    if (periodFocus !== pt) pt.value = custom && RB.isISODate(ui.to) ? ui.to : b;
    document.body.classList.toggle('readonly', !!APP.readOnly);
    updateBanner();
    try {
      page.innerHTML = PAGES[ui.page]();
      wrapTabPanel(page);
    } catch (e) {
      console.error(e);
      page.innerHTML = `<div class="empty-box bad">حدث خطأ أثناء عرض الصفحة: ${esc(e.message)}</div>`;
    }
    updateSaveStatus();
    afterRender(page);
    showActiveTabs(page);
  }

  // الأشرطة أعلى الصفحة: لا حفظ في المتصفح، انقطاع التحديث، حفظ لم يكتمل، عرض فقط، ووضع التجربة.
  // تُرسم فقط إن تغيرت (لا تُعاد قراءتها لقارئ الشاشة مع كل تنقل)
  let lastBanner = null;
  // علامة config/replace (RB.replaceMarkerState): جهاز آخر يستورد الآن، أو عملية سابقة لم تكتمل.
  // علامة هذه الصفحة لا تُعرض هنا (فشلها له شريط «أكمل الحفظ»)
  let markerTimer = null;
  function markerState() {
    const m = APP.replaceMarker;
    clearTimeout(markerTimer);
    if (APP.replacing || APP.replaceFailed) return '';
    const st = RB.replaceMarkerState(m, Date.now(), SID);
    // إن لم تتجدد العلامة (توقفت العملية في الجهاز الآخر) يتحول التنبيه إلى «لم يكتمل»
    if (st === 'running') markerTimer = setTimeout(updateBanner, RB.REPLACE_LIVE_MS - (Date.now() - Date.parse(m.at)) + 1000);
    return st;
  }
  function updateBanner() {
    const el = document.getElementById('banner');
    if (!el) return;
    const bar = (cls, text, acts) => `<div class="banner ${cls}"><div>${text}</div>${acts ? `<div class="btn-row">${acts}</div>` : ''}</div>`;
    let h = '';
    if (APP.noStorage) h += bar('bad', '<b>هذا المتصفح لا يسمح بالحفظ (وضع خاص أو تخزين محظور) — لن تُحفظ بياناتك</b>', '');
    // حفظ فشل بعد الفتح (امتلأت مساحة المتصفح، أو رُفض في البيانات المشتركة): شريط ظاهر على كل شاشة، لا في الشريط
    // الجانبي وحده (مخفي في درج الجوال، وأسفل الشاشة القصيرة). لا تخزين أصلاً، وعرض فقط، والاستيراد الناقص لها أشرطتها
    // في البيانات المشتركة: «أعد المحاولة» يعيد حفظ كل ما فشل حفظه أو حذفه (الحذف الفاشل يُخفي السجل فلا يمكن فتحه
    // وحذفه ثانية، فلا مخرج من الحالة الحمراء بغير هذا الزر)
    // امتلاء المساحة أو سجل مرفوض (غير صالح أو كبير): إعادة المحاولة لا تنجح غالباً، فالتصدير هو الزر الأول
    // ويبقى «أعد المحاولة» ثانوياً (المخرج الوحيد من الحالة الحمراء إن فرغت مساحة أو عُدّل السجل)
    const sf = APP.save.failed;
    const failBar = sf && sf !== 'invalid_argument' && !APP.noStorage && !APP.replaceFailed && !APP.demo;
    if (failBar) {
      const cloud = APP.backend && APP.backend.kind === 'cloud';
      const retry = cloud && !APP.readOnly && APP.backend.bad.size > 0;
      const stuck = sf === 'quota_exceeded' || sf === 'invalid';
      const first = retry && !stuck;
      const acts = (first ? btn(APP.retrying ? 'جارٍ إعادة المحاولة…' : 'أعد المحاولة', 'retrysave', APP.retrying ? 'aria-disabled="true"' : '', 'sm primary') : '') + btn('صدّر نسخة احتياطية', 'backup', '', first ? 'sm' : 'sm primary') + (retry && stuck ? btn(APP.retrying ? 'جارٍ إعادة المحاولة…' : 'أعد المحاولة', 'retrysave', APP.retrying ? 'aria-disabled="true"' : '', 'sm ghost') : '');
      const why = !cloud ? 'تعذّر حفظه في هذا المتصفح' : sf === 'quota_exceeded' ? 'امتلأت مساحة البيانات المشتركة' : 'تعذّر حفظه أو حذفه في البيانات المشتركة';
      const todo = first ? 'اضغط «أعد المحاولة»، وإن تكرر الفشل فصدّر نسخة احتياطية' : 'صدّر نسخة احتياطية';
      h += bar('bad', `<b>لم يُحفظ آخر تعديل</b> — ${why}. ${todo} الآن حتى لا يضيع، ولا تُغلق الصفحة قبلها.${sf === 'quota_exceeded' ? ' لا تحذف سجلات قديمة لتفريغ المساحة: حذفها يغيّر الأرصدة كلها.' : ''}`, acts);
    }
    // توقف الوصول: شريط واحد بلا ادعاء سبب (لا «انقطع التحديث» ولا «ليست لديك صلاحية» معه)
    const hasBackupBtn = failBar || !!APP.replaceFailed;
    if (APP.revoked) h += bar('bad', `<b>${LOST_MSG}</b>`, (hasBackupBtn ? '' : btn('صدّر نسخة احتياطية', 'backup', '', 'sm primary')) + btn('إعادة تحميل الصفحة', 'reload', '', hasBackupBtn ? 'sm primary' : 'sm'));
    else if (APP.syncLost) h += bar('bad', 'انقطع التحديث المباشر للبيانات المشتركة، وقد لا تكون تعديلات شريكك الأخيرة ظاهرة. أعد تحميل الصفحة قبل أن تعدّل.', btn('إعادة تحميل الصفحة', 'reload', '', 'sm primary'));
    if (APP.replaceFailed) {
      // ما بقي من العملية: سجلات الدفتر التي لم تُكتب، والقديمة التي لم تُحذف، أو الإعدادات وحدها (تُكتب آخراً)
      const f = APP.replaceFailed;
      const left = [f.n ? 'لم يُكتب: ' + cnt(f.n, W.rec, { wrap: numSpan }) : '', f.d ? 'لم يُحذف من القديم: ' + cnt(f.d, W.rec, { wrap: numSpan }) : ''].filter(Boolean).join('، و');
      // السبب، والتصدير دائماً (الشريط الجانبي مخفي في درج الجوال). امتلاء المساحة أو سجل مرفوض: الإكمال لا ينجح غالباً،
      // فالتصدير هو الزر الأول ويبقى «أكمل الحفظ» ثانوياً (كشريط «لم يُحفظ آخر تعديل»)
      const fc = failCode(f.code);
      const stuck = fc === 'quota_exceeded' || fc === 'invalid' || fc === 'invalid_id' || fc === 'transform_error';
      const why = fc === 'quota_exceeded' ? 'امتلأت مساحة البيانات المشتركة' : stuck ? 'سجل غير صالح أو أكبر من الحجم المسموح' : fc === 'revoked' ? 'توقف الوصول' : 'انقطع الاتصال أو رُفض الحفظ';
      const todo = APP.revoked ? '' : stuck ? ' صدّر نسخة احتياطية الآن ففيها الدفتر المطلوب كاملاً.' : ' اضغط «أكمل الحفظ»، وإن تكرر الفشل فصدّر نسخة احتياطية.';
      const acts = APP.revoked ? btn('صدّر نسخة احتياطية', 'backup', '', 'sm primary') : stuck ? btn('صدّر نسخة احتياطية', 'backup', '', 'sm primary') + btn('أكمل الحفظ', 'resumereplace', '', 'sm ghost') : btn('أكمل الحفظ', 'resumereplace', '', 'sm primary') + btn('صدّر نسخة احتياطية', 'backup', '', 'sm');
      h += bar('bad', `<b>لم يكتمل الحفظ في البيانات المشتركة (${left || 'بقيت الإعدادات'}) — البيانات في الشاشة غير محفوظة بالكامل</b>. ${why}.${todo}`, acts);
    }
    const mk = markerState();
    if (mk === 'running') h += bar('warn', '<b>يجري الآن استيراد أو مسح للبيانات المشتركة من جهاز آخر</b> — انتظر حتى ينتهي قبل أن تعدّل.', '');
    // علامة جهاز آخر أو زيارة سابقة (علامة هذه الصفحة لها شريط «أكمل الحفظ»): من بدأها هو من يكملها
    if (mk === 'stale') h += bar('warn', '<b>استيراد أو مسح للبيانات المشتركة لم يكتمل، فقد يكون الدفتر ناقصاً أو خليطاً من القديم والجديد</b> — إن بدأته أنت في زيارة سابقة فأعد العملية، وإلا فاطلب ممن بدأه أن يكمله قبل أن تعدّل.', btn('إخفاء', 'dismissreplace', '', 'sm ghost'));
    if (APP.readOnly && !APP.demo && !APP.revoked) h += bar('info', RO_MSG, '');
    if (APP.noShared)
      h += APP.demo
        ? bar('bad', '<b>البيانات المشتركة غير متاحة في هذه الزيارة</b> — ما تراه بيانات تجريبية وليس دفتر مطعمك المشترك. أعد تحميل الصفحة، أو افتحها من Claude وأنت مسجّل الدخول. لا تبدأ دفتراً هنا: لن يراه شريكك.', btn('إعادة تحميل الصفحة', 'reload', '', 'sm primary'))
        : bar('bad', '<b>البيانات المشتركة غير متاحة في هذه الزيارة</b> — هذه نسخة خاصة بهذا المتصفح (من زيارة سابقة) لا يراها شريكك، وما تُدخله فيها لا يصل إلى الدفتر المشترك. صدّرها نسخة احتياطية، ثم أعد تحميل الصفحة.', btn('صدّر نسخة احتياطية', 'backup', '', 'sm primary') + btn('إعادة تحميل الصفحة', 'reload', '', 'sm'));
    // تعذّرت قراءة البيانات المشتركة عند الفتح (انقطاع مؤقت): الدفتر قد يكون محفوظاً ولم يُقرأ، وما يُعرض تجربة. شريط دائم
    // لا رسالة عابرة، ولا «ابدأ ببيانات مطعمك» حتى تنجح القراءة (يُفتح الدفتر تلقائياً حين تعود)
    const loadBad = APP.loadFailed && APP.demo && !APP.real && !APP.noShared;
    if (loadBad) h += bar('bad', '<b>تعذّر تحميل دفتر المطعم المشترك</b> — قد يكون دفترك محفوظاً ولم يُقرأ بعد، وما تراه بيانات تجريبية وليس دفترك. يُفتح تلقائياً حين يعود الاتصال، أو أعد تحميل الصفحة. لا تبدأ دفتراً جديداً ولا تستورد نسخة قبل أن يظهر.', btn('إعادة تحميل الصفحة', 'reload', '', 'sm primary'));
    else if (APP.demo) {
      // صلاحية العرض فقط: أزرار الإضافة والتعديل مخفية في التجربة أيضاً، فلا «جرّب بحرية»، ويُذكر أن الدفتر المشترك لم
      // يبدأ بعد (يظهر هنا حين يبدؤه شريك) — لا شريط «عرض فقط» آخر معه
      const ro = APP.readOnly && !APP.revoked;
      const demoNote = ' الأرقام أمثلة توضيحية وليست أسعاراً أو رسوماً رسمية.';
      const txt = !ro
        ? '<b>بيانات تجريبية لمطعم برقر</b> — جرّب كل شيء بحرية؛ لا يُحفظ أي تعديل.' + demoNote
        : APP.real
          ? '<b>بيانات تجريبية لمطعم برقر — للعرض فقط</b>: لديك صلاحية العرض فقط، فلا تعديل ولا إضافة.' + demoNote
          : '<b>لم يبدأ دفتر المطعم المشترك بعد</b> — لديك صلاحية العرض فقط. ما تراه بيانات تجريبية لمطعم برقر للاطلاع، ويظهر الدفتر هنا تلقائياً حين يبدؤه أحد الشركاء.' + demoNote;
      h += bar(
        'demo',
        txt,
        // فوق دفتر محفوظ: الرجوع إليه فقط (البدء من جديد يكون بمسح البيانات من الإعدادات)
        APP.real ? btn('الرجوع لبياناتي', 'leavedemo', '', 'primary sm') : APP.noShared || ro ? '' : btn('ابدأ ببيانات مطعمك', 'start', '', 'primary sm')
      );
    }
    if (h !== lastBanner) {
      // زر في الشريط عليه التركيز (أعد المحاولة مثلاً) يبقى عليه بعد إعادة رسم الشريط
      const a = document.activeElement;
      const act = a && el.contains(a) && a.dataset ? a.dataset.act : '';
      el.innerHTML = h;
      lastBanner = h;
      const b = act && el.querySelector(`[data-act="${act}"]`);
      if (b) b.focus();
    }
  }

  // حالة الحفظ الحقيقية في الشريط الجانبي
  function updateSaveStatus() {
    const el = document.getElementById('saveStatus');
    if (!el) return;
    const kind = APP.backend ? APP.backend.kind : '';
    // استيراد أو مسح لم يكتمل: الدفتر غير محفوظ كاملاً ولو نجح حفظ تعديل بعده
    const f = APP.save.failed || (APP.replaceFailed && !APP.replacing ? 'replace' : null);
    const at = APP.savedAt ? ' · ' + TIMEF.format(new Date(APP.savedAt)) : '';
    const dot = (k) => `<span class="dot ${k}" aria-hidden="true"></span>`;
    let h = '';
    if (APP.demo && APP.loadFailed && !APP.real && !APP.noShared) h = `${dot('bad')}تعذّر تحميل الدفتر — بيانات تجريبية`;
    else if (APP.demo) h = `${dot('warn')}${APP.readOnly && !APP.revoked ? 'وضع التجربة — عرض فقط' : 'وضع التجربة — لا يُحفظ'}`;
    else if (f === 'replace') h = `${dot('bad')}<span class="ss-t">لم يكتمل الحفظ في البيانات المشتركة</span>`;
    else if (f && f !== 'invalid_argument') h = `${dot('bad')}<span class="ss-t">لم يُحفظ آخر تعديل — صدّر نسخة احتياطية</span>${btn('تصدير', 'backup', '', 'sm ghost')}`;
    else if (APP.revoked) h = `${dot('bad')}توقف الوصول إلى البيانات المشتركة`;
    else if (APP.syncLost) h = `${dot('bad')}غير متزامن`;
    else if (APP.readOnly || f === 'invalid_argument') h = `${dot(f ? 'bad' : 'warn')}عرض فقط — لا تملك صلاحية التعديل`;
    else if (APP.save.pending > 0) h = `${dot('warn')}جارٍ الحفظ…`;
    else if (kind === 'cloud') h = `${dot('good')}محفوظ ومشترك${at}`;
    else if (kind === 'local') h = APP.noShared ? `${dot('warn')}محفوظ في هذا المتصفح فقط — لا يراه شريكك${at}` : `${dot('good')}محفوظ في هذا المتصفح${at}`;
    el.innerHTML = h;
    // شريط فشل الحفظ يظهر أو يزول مع الحالة (الحفظ يفشل أو ينجح بعد الرسم)
    updateBanner();
  }

  let rt = null;
  // بعد تحديث من الخارج: الصفحة، ومعاينة النماذج المفتوحة فوقها
  function scheduleRender() {
    clearTimeout(rt);
    rt = setTimeout(() => {
      render();
      for (const f of OPEN_FORMS) {
        try {
          f();
        } catch (e) {
          console.warn(e);
        }
      }
    }, 80);
  }

  // حقلا الفترة المخصصة. كتابة التاريخ بلوحة المفاتيح تمر بقيم وسيطة صالحة الشكل (السنة 0002 ثم 0020 ثم 0202 ثم 2025،
  // والشهر 01 قبل 10): typing = الحقل ما زال مركَّزاً، فتُتجاهل السنة قبل 2000، ولا يُغيَّر الطرف الآخر أبداً — القيمة
  // التي تجعل «إلى» قبل «من» تنتظر حتى مغادرة الحقل أو Enter، وعندها فقط يُعدَّل الطرف الآخر إلى نهاية شهر «من» أو
  // أول شهر «إلى» مع تنبيه. حقل فارغ أو تاريخ غير صالح عند المغادرة يعود إلى قيمته
  const P_MIN = '2000-01-01';
  const P_MAX = '2099-12-31';
  // الحقل الذي فيه التركيز (من focusin إلى focusout): document.activeElement يصير body لحظة الانتقال بين مقاطع التاريخ
  // (الشهر ثم اليوم)، فلا يُعتمد عليه لمعرفة أن الكتابة جارية. وكتابة القيمة في الحقل أثناء ذلك تمحو المقطع الجاري
  let periodFocus = null;
  function periodField(t, typing) {
    const isFrom = t.id === 'pFrom';
    const v = t.value;
    // الطرف الآخر كما يظهر في الشاشة إن لم يكن محفوظاً
    const [a, b] = range();
    const from0 = RB.isISODate(ui.from) ? ui.from : a;
    const to0 = RB.isISODate(ui.to) ? ui.to : b;
    const own = isFrom ? from0 : to0;
    if (!RB.isISODate(v) || v < P_MIN || v > P_MAX) {
      if (!typing) t.value = own;
      return;
    }
    let from = isFrom ? v : from0;
    let to = isFrom ? to0 : v;
    if (to < from) {
      if (typing) return;
      if (isFrom) to = RB.monthEnd(from.slice(0, 7));
      else from = to.slice(0, 7) + '-01';
      toast(isFrom ? 'عُدّل تاريخ «إلى» ليأتي بعد «من»' : 'عُدّل تاريخ «من» ليأتي قبل «إلى»');
    }
    if (from === ui.from && to === ui.to) return;
    ui.from = from;
    ui.to = to;
    resetRows();
    saveUI();
    render();
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
        resetRows();
        if (t.value === 'custom' && !(RB.isISODate(ui.from) && RB.isISODate(ui.to))) {
          ui.from = a;
          ui.to = b;
        }
        saveUI();
        render();
      } else if (t.id === 'pFrom' || t.id === 'pTo') {
        // أثناء الكتابة (الحقل مركَّز): تاريخ اختير من التقويم يُطبَّق فوراً
        periodField(t, periodFocus === t);
      } else if (t.id === 'importFile' && t.files && t.files[0]) {
        importFile(t.files[0]);
        t.value = '';
      }
    });
    // خانات الأرقام (data-type=num): الأرقام العربية أو الفارسية وفاصلتها العشرية «٫» تُكتب أو تُلصق بالأرقام
    // اللاتينية — حقل الأرقام في المتصفح يُسقطها بصمت فيبقى فارغاً (أو يمحو الرقم المحدد ولا يكتب بدله).
    // insertText يكتب في موضع المؤشر ويطلق input، فيأخذه محرك النماذج كأي إدخال
    document.addEventListener(
      'beforeinput',
      (e) => {
        const el = e.target;
        if (!el || !el.dataset || el.dataset.type !== 'num' || !e.cancelable) return;
        const d = e.data !== null && e.data !== undefined ? e.data : e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
        if (!d) return;
        if (RB.latinDigits(d) === d) return;
        // مع الأرقام العربية: الفاصلة اللاتينية فاصلة آلاف (العشرية «٫»)
        const n = RB.latinDigits(d).replace(/[,\s]/g, '');
        e.preventDefault();
        if (n) document.execCommand('insertText', false, n);
      },
      true
    );
    // مغادرة حقل الفترة أو Enter فيه: انتهت الكتابة، فيُطبَّق ما فيه (ويُصحَّح ترتيب الطرفين إن لزم)
    document.addEventListener('focusin', (e) => {
      const t = e.target;
      if (t && (t.id === 'pFrom' || t.id === 'pTo')) periodFocus = t;
    });
    document.addEventListener('focusout', (e) => {
      const t = e.target;
      if (!t || (t.id !== 'pFrom' && t.id !== 'pTo')) return;
      if (periodFocus === t) periodFocus = null;
      periodField(t, false);
    });
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (e.key === 'Enter' && t && (t.id === 'pFrom' || t.id === 'pTo')) periodField(t, false);
    });
    window.addEventListener('hashchange', () => {
      const p = location.hash.slice(1);
      if (p && p !== ui.page && isPage(p)) {
        ui.page = p;
        resetRows();
        saveUI();
        setNav(false, { focus: false });
        render();
        window.scrollTo(0, 0);
        focusPageTitle();
      }
    });
    document.addEventListener('keydown', (e) => {
      // Escape يغلق درج القائمة إن لم تكن نافذة مفتوحة (النافذة تُغلق أولاً)
      if (e.key === 'Escape' && document.body.classList.contains('nav-open') && !document.getElementById('modals').children.length) {
        setNav(false);
        return;
      }
      // التبويبات: السهم الأيسر للتالي والأيمن للسابق (من اليمين لليسار)، Home وEnd للأول والأخير؛ التبويب يُختار مع التركيز
      const t = e.target;
      const tl = t && t.getAttribute && t.getAttribute('role') === 'tab' && !e.altKey && !e.ctrlKey && !e.metaKey && t.closest('[role="tablist"]');
      if (!tl) return;
      const list = [...tl.querySelectorAll('[role="tab"]')];
      const i = list.indexOf(t);
      const j = { ArrowLeft: i + 1, ArrowRight: i - 1, Home: 0, End: list.length - 1 }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      const next = list[(j + list.length) % list.length];
      if (next === t) return;
      next.click();
    });
    // موضع الرسائل فوق النافذة المفتوحة (placeToasts): يتبع تغيّر عدد الرسائل وارتفاعها، والنافذة العليا (فتحها وإغلاقها
    // وتغيّر ارتفاعها مع حقل يظهر أو سطر يُضاف، وانتهاء حركة ظهورها)، وحجم الشاشة. والتركيز ينتقل إلى حقل تحت الرسائل: يظهر فوقها
    const toastEl = document.getElementById('toast');
    const modals = document.getElementById('modals');
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => placeToasts());
      const watch = () => {
        ro.disconnect();
        ro.observe(toastEl);
        const d = modals.lastElementChild && modals.lastElementChild.querySelector('.dialog');
        if (d) ro.observe(d);
      };
      watch();
      new MutationObserver(() => {
        watch();
        placeToasts();
      }).observe(modals, { childList: true });
    }
    modals.addEventListener('animationend', placeToasts);
    window.addEventListener('resize', placeToasts);
    document.addEventListener('focusin', () => document.getElementById('toast').children.length && requestAnimationFrame(placeToasts));
    let rz = null;
    window.addEventListener('resize', () => {
      // اتسعت الشاشة فظهر الشريط الجانبي ثابتاً: لا درج مفتوح بعدها
      if (document.body.classList.contains('nav-open') && !matchMedia('(max-width: 900px)').matches) setNav(false, { focus: false });
      clearTimeout(rz);
      rz = setTimeout(() => {
        document.querySelectorAll('.chart').forEach((el) => CHARTS[el.id] && drawColumns(el, CHARTS[el.id]));
        document.querySelectorAll('.tbl-wrap').forEach(scrollCue);
      }, 120);
    });
    // التمرير لا ينتشر للأعلى: يُلتقط في مرحلة النزول لتحديث إشارة تمرير الجدول
    document.addEventListener(
      'scroll',
      (e) => {
        const t = e.target;
        if (t && t.classList && t.classList.contains('tbl-wrap')) scrollCue(t);
      },
      true
    );
    // تلميحات الرسوم البيانية: نص عادي (textContent)، فأرقامها ونسبها معزولة عند بنائها (ltr) وإلا ظهرت «%3.6» و«3,000.00-»
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
      // استيراد لم يكتمل يُنبَّه له حتى أثناء عرض التجربة (الدفتر المطلوب لم يُحفظ كاملاً)
      if (!APP.replaceFailed && (APP.demo || !(APP.save.pending > 0 || (f && f !== 'invalid_argument')))) return;
      e.preventDefault();
      e.returnValue = '';
    });
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  }

  // بيانات وصلت من الخارج (شريك في البيانات المشتركة أو نافذة أخرى). يرجع true إن تغيّر شيء
  function onRemote(section, data) {
    if (section === 'replace') {
      APP.replaceMarker = RB.isObj(data) ? data : null;
      updateBanner();
      return false;
    }
    APP.remoteSeq++;
    // أثناء الاستيراد أو المسح تصل لقطات جزئية، وبعد فشله تحمل خليط القديم وما كُتب: تُتجاهل حتى يكتمل الحفظ،
    // ثم يُطابق الدفتر مع البيانات المشتركة
    if (APP.replacing || APP.replaceFailed) return false;
    // ما فشل حفظه من هذه الصفحة يبقى في الشاشة كما أدخله المستخدم حتى يُحفظ
    if (APP.backend && APP.backend.overlay) data = APP.backend.overlay(section, data);
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
      // التجربة بلا دفتر: لقطة فيها بيانات حقيقية تعني أن أحداً بدأ الدفتر (اللقطات الفارغة الأولى تُتجاهل). وإن تعذّر
      // التحميل عند الفتح فأي لقطة تعني أن القراءة عادت: يُعاد التحميل (يُفتح الدفتر، أو يزول شريط التعذّر)
      if (APP.loadFailed || (section === 'settings' ? !!data.startedAt : data.length > 0)) adoptSaved();
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
    // القوائم الطويلة تبدأ بأحدث 300 سطر في كل زيارة
    resetRows();
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
    document.getElementById('page').innerHTML = `<div class="loading"><span class="mark big" aria-hidden="true"><i></i><i></i><i></i><i></i></span><p>جارٍ فتح دفتر المطعم…</p></div>`;
    let backend = null;
    // داخل Claude (Artifact): الدفتر في البيانات المشتركة. use('db') = null أو خطأ (لم تُمنح، أو تعذّر تحميلها، أو بلا تسجيل
    // دخول، أو لم تُجب المنصة): لا يُبدأ دفتر في هذا المتصفح بدلها (noShared)، وتبقى نسخة خاصة سابقة إن وُجدت للعرض والتصدير
    const inArtifact = !!(window.claude && typeof window.claude.use === 'function');
    if (inArtifact) {
      try {
        const db = await window.claude.use('db');
        if (db) backend = new CloudBackend(db);
      } catch (e) {
        backend = null;
      }
    }
    APP.backend = backend || new LocalBackend();
    APP.noShared = inArtifact && !backend;
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
    // علامة استيراد أو مسح بدأ ولم ينتهِ: تُقرأ مع الدفتر في الوقت نفسه (ثم يتابعها المستمع)
    const marker = backend
      ? Promise.resolve()
          .then(() => backend.retry(() => backend.db.doc('config/replace').get()))
          .then((r) => (r && r.exists ? clone(r.data()) : null), () => null)
      : Promise.resolve(null);
    let data = null;
    try {
      data = await APP.backend.load();
    } catch (e) {
      APP.loadFailed = true;
      toast('تعذّر تحميل البيانات المحفوظة. أعد تحميل الصفحة قبل أن تبدأ.', 'bad');
    }
    APP.replaceMarker = RB.isObj(await marker) ? await marker : null;
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
