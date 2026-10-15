/*
 * دفتر حسابات المطعم — المنطق الحسابي
 * ملف مستقل بلا واجهة: الثوابت، دليل الحسابات، القيود التلقائية، تكلفة الوصفات، والتقارير.
 * يعمل في المتصفح (window.RB) وفي Node للاختبارات (module.exports).
 */
(function (root) {
  'use strict';

  const RB = {};

  // ───────────── أدوات عامة ─────────────
  function r2(x) {
    x = Number(x) || 0;
    return (Math.sign(x) * Math.round(Math.abs(x) * 100 + 1e-7)) / 100;
  }
  function num(x) {
    const n = parseFloat(x);
    return isFinite(n) ? n : 0;
  }
  const sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
  const byId = (arr) => Object.fromEntries((arr || []).map((x) => [x.id, x]));
  const pad = (n) => String(n).padStart(2, '0');

  RB.r2 = r2;
  RB.num = num;
  RB.sum = sum;
  RB.byId = byId;
  RB.uid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // ───────────── التواريخ (نصوص ISO مثل 2026-03-15) ─────────────
  RB.todayISO = () => {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };
  RB.ymAdd = (ym, n) => {
    let [y, m] = ym.split('-').map(Number);
    m += n;
    y += Math.floor((m - 1) / 12);
    m = ((((m - 1) % 12) + 12) % 12) + 1;
    return y + '-' + pad(m);
  };
  RB.monthEnd = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return ym + '-' + pad(new Date(Date.UTC(y, m, 0)).getUTCDate());
  };
  RB.addDays = (iso, n) => {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  RB.addMonths = (iso, n) => {
    const ym = RB.ymAdd(iso.slice(0, 7), n);
    const day = Math.min(+iso.slice(8, 10), +RB.monthEnd(ym).slice(8, 10));
    return ym + '-' + pad(day);
  };
  RB.daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  RB.weekday = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay(); // 0 = الأحد
  RB.coverageEnd = (start, months) => RB.addDays(RB.addMonths(start, Math.max(1, Math.round(num(months) || 1))), -1);
  RB.MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  RB.monthName = (ym) => RB.MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);

  // ───────────── الثوابت والتصنيفات ─────────────
  // أصناف الأصول التأسيسية: العمر الافتراضي بالأشهر (0 = لا يُستهلك)
  RB.ASSET_CATS = [
    { id: 'kitchen', name: 'معدات المطبخ', acc: '1201', life: 60, hint: 'شوايات، قلايات، ثلاجات، فريزرات، شفاطات' },
    { id: 'furniture', name: 'أثاث المحل', acc: '1202', life: 60, hint: 'طاولات، كراسي، كاونتر' },
    { id: 'tools', name: 'أدوات وأواني', acc: '1203', life: 24, hint: 'أواني، سكاكين، صواني، أدوات تقديم' },
    { id: 'fitout', name: 'ديكور وتجهيزات المحل', acc: '1204', life: 60, hint: 'ديكور، لوحات، إضاءة، تكييف، سباكة وكهرباء' },
    { id: 'tech', name: 'أجهزة ونظام الكاشير', acc: '1205', life: 36, hint: 'جهاز كاشير، شاشات، طابعات، كاميرات' },
    { id: 'vehicle', name: 'سيارات ودراجات توصيل', acc: '1206', life: 60, hint: '' },
    { id: 'preop', name: 'مصاريف التأسيس وما قبل الافتتاح', acc: '1207', life: 36, hint: 'تصميم الهوية والمنيو، استشارات، رسوم التأسيس' },
    { id: 'deposit', name: 'تأمينات مستردة', acc: '1208', life: 0, hint: 'تأمين الإيجار أو العدادات — لا يُستهلك ولا تُحتسب عليه ضريبة (يُسترد عند انتهاء العقد)' },
  ];

  // المصاريف التشغيلية. group يحدد مكانها في قائمة الدخل
  RB.EXPENSE_CATS = [
    { id: 'rent', name: 'إيجار المحل', acc: '5301', group: 'occ', months: 6 },
    { id: 'housing', name: 'سكن العمال', acc: '5302', group: 'labor', months: 3 },
    { id: 'utilities', name: 'كهرباء ومياه', acc: '5303', group: 'opex', months: 1 },
    { id: 'telecom', name: 'اتصالات وإنترنت', acc: '5304', group: 'opex', months: 1 },
    { id: 'gov', name: 'رسوم حكومية واشتراكات المنصات', acc: '5305', group: 'opex', months: 12 },
    { id: 'labor_gov', name: 'المقابل المالي والإقامات ورسوم العمالة', acc: '5306', group: 'labor', months: 12 },
    // التأمينات الاجتماعية (GOSI) لا تُسجَّل هنا: تُحسب من مسير الرواتب
    { id: 'insurance', name: 'التأمين الطبي للعمال', acc: '5307', group: 'labor', months: 12 },
    { id: 'shop_insurance', name: 'تأمين المحل والممتلكات', acc: '5315', group: 'opex', months: 12 },
    { id: 'maintenance', name: 'صيانة وإصلاحات', acc: '5308', group: 'opex', months: 1 },
    { id: 'marketing', name: 'تسويق وإعلان', acc: '5309', group: 'opex', months: 1 },
    { id: 'software', name: 'أنظمة واشتراكات تقنية', acc: '5310', group: 'opex', months: 1 },
    { id: 'cleaning', name: 'نظافة ومكافحة حشرات', acc: '5311', group: 'opex', months: 1 },
    { id: 'transport', name: 'نقل ومواصلات', acc: '5312', group: 'opex', months: 1 },
    { id: 'staff', name: 'إعاشة ومزايا العمال', acc: '5313', group: 'labor', months: 1 },
    { id: 'bankfees', name: 'رسوم بنكية', acc: '5314', group: 'opex', months: 1 },
    // الزكاة: بند مستقل بعد صافي الربح، تُحمَّل على السنة التي تخصها (بداية التغطية = بداية تلك السنة)
    { id: 'zakat', name: 'الزكاة', acc: '5901', group: 'zakat', months: 12 },
    // «أخرى» آخر القائمة دائماً: التصنيف غير المعروف يُعامل كمصاريف أخرى
    { id: 'other', name: 'مصاريف أخرى', acc: '5399', group: 'opex', months: 1 },
  ];
  // التصنيفات التي تظهر في صفحة الرسوم الحكومية والاشتراكات
  RB.GOV_CATS = ['gov', 'labor_gov', 'insurance', 'shop_insurance', 'software', 'zakat'];

  // المشتريات التشغيلية. cogs = تدخل في تكلفة المبيعات
  RB.PURCHASE_CATS = [
    { id: 'food', name: 'مواد غذائية وخام', acc: '5101', cogs: true },
    { id: 'packaging', name: 'تغليف وتعبئة', acc: '5102', cogs: true },
    { id: 'drinks', name: 'مشروبات للبيع', acc: '5103', cogs: true },
    { id: 'consumables', name: 'مستهلكات ومنظفات', acc: '5601', cogs: false },
    { id: 'gas', name: 'غاز وفحم', acc: '5602', cogs: false },
    { id: 'other', name: 'مشتريات أخرى', acc: '5603', cogs: false },
  ];

  RB.RAW_CATS = ['لحوم', 'خبز', 'أجبان', 'خضار', 'صوصات', 'بهارات', 'بطاطس', 'زيوت', 'مشروبات', 'تغليف', 'أخرى'];
  RB.UNITS = ['جم', 'كجم', 'مل', 'لتر', 'حبة', 'شريحة', 'حصة', 'علبة', 'كيس', 'كرتون'];
  RB.PRODUCT_CATS = ['برقر', 'وجبات', 'بطاطس وجانبي', 'مشروبات', 'صوصات وإضافات', 'حلى', 'أخرى'];

  // قوالب جاهزة للرسوم الحكومية والاشتراكات (المبالغ يحددها المستخدم).
  // oneOff = رسم لمرة واحدة لا يحتاج تجديداً. auto = مبلغ يتعبأ من بيانات العامل المختار:
  // qiwa = المقابل المالي × 12 + رخصة العمل، iqama = رسوم الإقامة، medical = التأمين الطبي السنوي
  RB.GOV_PRESETS = [
    { entity: 'وزارة التجارة', desc: 'السجل التجاري (تأكيد سنوي)', category: 'gov', months: 12 },
    { entity: 'الغرفة التجارية', desc: 'اشتراك الغرفة التجارية', category: 'gov', months: 12 },
    { entity: 'بلدي (أمانة المنطقة)', desc: 'رخصة المحل التجاري', category: 'gov', months: 12 },
    { entity: 'بلدي (أمانة المنطقة)', desc: 'لوحة المحل', category: 'gov', months: 12 },
    { entity: 'بلدي (أمانة المنطقة)', desc: 'الشهادات الصحية للعمال', category: 'labor_gov', months: 12 },
    { entity: 'الدفاع المدني (سلامة)', desc: 'شهادة السلامة', category: 'gov', months: 12 },
    { entity: 'منصة إيجار', desc: 'توثيق عقد إيجار المحل', category: 'gov', months: 12 },
    { entity: 'هيئة الزكاة والضريبة والجمارك', desc: 'الزكاة عن السنة المالية السابقة', category: 'zakat', months: 12 },
    { entity: 'قوى', desc: 'رخصة عمل + المقابل المالي', category: 'labor_gov', months: 12, auto: 'qiwa' },
    { entity: 'مقيم (الجوازات)', desc: 'تجديد إقامة', category: 'labor_gov', months: 12, auto: 'iqama' },
    { entity: 'مقيم (الجوازات)', desc: 'تأشيرة خروج وعودة', category: 'labor_gov', months: 1, oneOff: true },
    { entity: 'قوى (وزارة الموارد البشرية)', desc: 'إصدار تأشيرة عمل (استقدام عامل)', category: 'labor_gov', months: 1, oneOff: true },
    { entity: 'قوى', desc: 'نقل خدمات عامل', category: 'labor_gov', months: 1, oneOff: true },
    { entity: 'قوى', desc: 'تغيير مهنة', category: 'labor_gov', months: 1, oneOff: true },
    { entity: 'شركة التأمين', desc: 'تأمين طبي للعمال', category: 'insurance', months: 12, auto: 'medical' },
    { entity: 'شركة التأمين', desc: 'تأمين المحل ضد الحريق', category: 'shop_insurance', months: 12 },
    { entity: 'مزود نظام الكاشير', desc: 'اشتراك نظام نقاط البيع', category: 'software', months: 1 },
    { entity: 'مزود الفوترة الإلكترونية', desc: 'ربط فاتورة (المرحلة الثانية)', category: 'software', months: 12 },
    { entity: 'مقيم (علم)', desc: 'اشتراك بوابة مقيم', category: 'software', months: 12 },
    { entity: 'تطبيق توصيل', desc: 'رسوم تسجيل أو اشتراك تطبيق', category: 'software', months: 12 },
  ];

  // المبلغ التلقائي لرسم عامل: auto من القالب، أو بلا قالب لرسوم العمالة = المقابل المالي × 12 + الإقامة + رخصة العمل.
  // المقابل المالي والإقامة لا تُدفع عن السعودي. يرجع 0 إن لم توجد قاعدة
  RB.autoFeeAmount = (auto, emp, category) => {
    if (!emp) return 0;
    const saudi = emp.nationality === 'saudi';
    let a = 0;
    if (auto === 'qiwa') a = saudi ? 0 : num(emp.levyMonthly) * 12 + num(emp.workPermitAnnual);
    else if (auto === 'iqama') a = saudi ? 0 : num(emp.iqamaAnnual);
    else if (auto === 'medical') a = num(emp.medicalAnnual);
    else if (!auto && category === 'labor_gov' && !saudi) a = num(emp.levyMonthly) * 12 + num(emp.iqamaAnnual) + num(emp.workPermitAnnual);
    return a > 0 ? r2(a) : 0;
  };

  // حد التسجيل في ضريبة القيمة المضافة (للمطعم غير المسجل): إلزامي إذا تجاوزت المبيعات الخاضعة 375,000
  // خلال 12 شهراً (الماضية أو المتوقعة القادمة)، واختياري من 187,500.
  // المتوقع: إن كان التشغيل المسجل في الدفتر أقل من سنة (من الافتتاح، أو من أول مبيعات إن بدأ الدفتر بعده)
  // فمبيعاته ÷ أيامه × 365. يرجع null للمسجل (أو من حدّد تاريخ سريان لتسجيله)
  RB.VAT_MANDATORY = 375000;
  RB.VAT_VOLUNTARY = 187500;
  RB.vatThreshold = (S, today) => {
    today = today || RB.todayISO();
    const set = S.settings;
    if (set.vatRegistered) return null;
    const y0 = RB.addDays(today, -365);
    let last12 = 0;
    let first = '';
    for (const s of good(S.sales)) {
      if (!s.date || s.date > today) continue;
      const v = RB.saleTotal(s);
      if (s.date >= y0) last12 += v;
      if (v > 0 && (!first || s.date < first)) first = s.date;
    }
    const open = set.openingDate && set.openingDate <= today ? set.openingDate : '';
    const start = open && first ? (open > first ? open : first) : open || first;
    let runRate = 0;
    if (start && RB.daysBetween(start, today) < 365) {
      const since = sum(good(S.sales).filter((s) => s.date >= start && s.date <= today), RB.saleTotal);
      runRate = r2((since / (RB.daysBetween(start, today) + 1)) * 365);
    }
    last12 = r2(last12);
    const est = Math.max(last12, runRate);
    return { last12, runRate, start, est, level: est >= RB.VAT_MANDATORY ? 'mandatory' : est >= RB.VAT_VOLUNTARY ? 'voluntary' : '' };
  };

  RB.CHANNEL_TYPES = { cash: 'كاش (الصندوق)', card: 'شبكة (تُودع في البنك)', app: 'تطبيق توصيل' };

  // أنواع خصومات تحويلات التطبيقات ومعالجتها الضريبية (السجل بلا نوع يُعامل «other»)
  RB.DED_TYPES = {
    sale: { name: 'عرض/خصم أو مرتجع على طلبات العملاء — يخفض المبيعات وضريبتها', short: 'عرض أو مرتجع' },
    fee: { name: 'رسوم إعلان/خدمة من التطبيق بفاتورة ضريبية', short: 'رسوم بفاتورة ضريبية' },
    other: { name: 'غرامة أو تسوية — بدون ضريبة', short: 'غرامة أو تسوية' },
  };

  // opening: أصل كان يملكه المطعم قبل بدء الدفتر (مطعم قائم) — للأصول فقط (RB.isOpeningAsset)
  RB.PAY_LABEL = { cash: 'الصندوق (الكاشير)', bank: 'الحساب البنكي', payable: 'آجل على المورد', opening: 'أصل قائم قبل بدء الدفتر' };

  RB.defaultSettings = () => ({
    name: 'مطعم البرقر',
    vatNumber: '',
    crNumber: '',
    city: '',
    currency: 'ر.س',
    vatRate: 15,
    vatRegistered: true,
    vatRegisteredFrom: '', // تاريخ سريان التسجيل؛ فارغ = مسجل منذ البداية
    vatPeriod: 'quarterly',
    feeVat: true, // عمولات التطبيقات ورسوم الشبكة عليها ضريبة قيمة مضافة
    openingDate: '',
    // أرصدة افتتاحية لمطعم قائم بدأ الدفتر بعد تشغيله (RB.openingInfo): null أو
    // {date, cash, bank, inventory, vatCredit, apps: {قناة: مبلغ}, payables: [{supplier, amount}]}
    opening: null,
    // أيام بلا إقفال لأن المطعم كان مغلقاً (لا يُنبَّه عليها)
    closedDays: [],
    targetFoodCost: 30,
    priceRounding: 1,
    gosi: { saudiEr: 11.75, saudiEe: 9.75, expatEr: 2, cap: 45000 },
    // التأمين الطبي إلزامي لكل عامل (نظام الضمان الصحي التعاوني): 1,500 تقدير قابل للتعديل
    labor: { levyMonthly: 800, iqamaAnnual: 650, workPermitAnnual: 100, medicalAnnual: 1500 },
    channels: [
      { id: 'cash', name: 'كاش', type: 'cash', feePct: 0, active: true },
      { id: 'card', name: 'شبكة (مدى وبطاقات)', type: 'card', feePct: 0.8, active: true },
      { id: 'hungerstation', name: 'هنقرستيشن', type: 'app', feePct: 20, active: true },
      { id: 'jahez', name: 'جاهز', type: 'app', feePct: 20, active: true },
      { id: 'keeta', name: 'كيتا', type: 'app', feePct: 20, active: true },
      { id: 'mrsool', name: 'مرسول', type: 'app', feePct: 20, active: true },
      { id: 'thechefz', name: 'ذا شفز', type: 'app', feePct: 20, active: true },
    ],
  });

  RB.SECTIONS = [
    'partners', 'capital', 'assets', 'expenses', 'employees', 'payroll', 'raw', 'purchases',
    'supplierPayments', 'composites', 'products', 'sales', 'payouts', 'transfers', 'stockCounts', 'vatPayments',
    'cashCounts', 'advances',
  ];
  // اسم كل قسم بالعربية كما يُعرض للمستخدم (رسائل الاستيراد وغيرها)
  RB.SECTION_LABELS = {
    partners: 'الشركاء', capital: 'حركات رأس المال', assets: 'الأصول', expenses: 'المصاريف', employees: 'الموظفون', payroll: 'مسيرات الرواتب',
    raw: 'المواد الخام', purchases: 'فواتير المشتريات', supplierPayments: 'سداد الموردين', composites: 'المنتجات المجمّعة', products: 'أصناف المنيو',
    sales: 'الإقفالات اليومية', payouts: 'تحويلات التطبيقات', transfers: 'التحويلات بين الصندوق والبنك', stockCounts: 'جرد المخزون',
    vatPayments: 'مدفوعات الضريبة', cashCounts: 'جرود الصندوق', advances: 'سلف العمال',
  };

  RB.emptyState = () => {
    const s = { settings: RB.defaultSettings() };
    RB.SECTIONS.forEach((k) => (s[k] = []));
    return s;
  };

  // ───────────── سلامة البيانات ─────────────
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  RB.isObj = isObj;
  // تاريخ ISO حقيقي في التقويم (2026-02-30 و15/03/2026 مرفوضان)
  RB.isISODate = (s) => {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  };
  RB.isISOMonth = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
  // الأقسام التي لكل سجل فيها تاريخ عملية إلزامي
  RB.DATED = ['capital', 'assets', 'expenses', 'payroll', 'purchases', 'supplierPayments', 'sales', 'payouts', 'transfers', 'stockCounts', 'vatPayments', 'cashCounts', 'advances'];
  const NAMED = ['partners', 'assets', 'employees', 'raw', 'composites', 'products'];
  // أسماء لا تصلح مفاتيح في كائنات البرنامج (تلوّث النموذج الأولي للكائنات)
  const PROTO = ['__proto__', 'constructor', 'prototype'];
  const str = (v) => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');
  const noNumKeys = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !/^\d+$/.test(k) && !PROTO.includes(k)));

  // يصلح شكل السجل دون حذف بياناته: المعرّف نص، القوائم مصفوفات كائنات، الأسماء نصوص.
  // التاريخ الناقص أو غير الصالح لا يُحذف بل يُعلَّم في _bad (يُحسب من جديد في كل مرة)،
  // فيُستبعد السجل من الحسابات ويظهر للتصحيح. يرجع null لما ليس سجلاً (ليس كائناً أو بلا معرّف).
  // لا يغيّر السجل الأصلي: يرجعه نفسه إن لم يحتج تصحيحاً، وإلا نسخة مصححة
  RB.sanitizeRecord = (section, x) => {
    if (!isObj(x) || x.id === undefined || x.id === null || x.id === '' || typeof x.id === 'object') return null;
    let y = x;
    const set = (k, v) => {
      if (y === x) y = Object.assign({}, x);
      y[k] = v;
    };
    if (typeof x.id !== 'string') set('id', String(x.id));
    const bad = [];
    for (const f of ['date', 'startDate', 'endDate']) {
      const v = x[f];
      if (v === undefined || v === null || v === '') {
        if (f === 'date' && RB.DATED.includes(section)) bad.push(f);
        continue;
      }
      if (typeof v !== 'string') set(f, str(v));
      if (!RB.isISODate(y[f])) bad.push(f);
    }
    if (x.month !== undefined && x.month !== null && x.month !== '') {
      if (typeof x.month !== 'string') set('month', str(x.month));
      if (!RB.isISOMonth(y.month)) bad.push('month');
    }
    for (const f of ['lines', 'items', 'competitors']) {
      const v = x[f];
      if (v === undefined || (Array.isArray(v) && v.every(isObj))) continue;
      set(f, Array.isArray(v) ? v.filter(isObj) : []);
    }
    if (section === 'sales') {
      const ch = x.channels;
      const okCh = (k) => isObj(ch[k]) && !PROTO.includes(k);
      if (!isObj(ch)) set('channels', {});
      else if (!Object.keys(ch).every(okCh)) set('channels', Object.fromEntries(Object.keys(ch).filter(okCh).map((k) => [k, ch[k]])));
    }
    for (const f of ['name', 'desc', 'supplier']) {
      const v = x[f];
      if (typeof v === 'string') continue;
      if (v === undefined) {
        if (f === 'name' && NAMED.includes(section)) set(f, '');
      } else set(f, str(v));
    }
    if (bad.length) {
      if (JSON.stringify(x._bad) !== JSON.stringify(bad)) set('_bad', bad);
    } else if ('_bad' in x) {
      if (y === x) y = Object.assign({}, x);
      delete y._bad;
    }
    return y;
  };

  // معرّفات السجلات وقنوات البيع المقبولة من ملف خارجي: حروف لاتينية وأرقام و_ و- فقط
  // (بلا «:» التي تفصل حسابات الشركاء ولا «.» التي تفصل مسارات الحقول)
  RB.ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  RB.validId = (id) => (typeof id === 'string' || typeof id === 'number') && RB.ID_RE.test(String(id)) && !PROTO.includes(String(id));
  // المعرّفات غير الصالحة في بيانات (سجلات الأقسام وقنوات البيع)
  RB.badIds = (st) => {
    const out = [];
    if (!isObj(st)) return out;
    const has = (x) => isObj(x) && x.id !== undefined && x.id !== null && x.id !== '';
    for (const k of RB.SECTIONS) if (Array.isArray(st[k])) for (const x of st[k]) if (has(x) && !RB.validId(x.id)) out.push(String(x.id));
    const chs = isObj(st.settings) && Array.isArray(st.settings.channels) ? st.settings.channels : [];
    for (const c of chs) if (isObj(c) && !RB.validId(c.id)) out.push(String(c.id));
    return out;
  };

  // خطة استبدال الدفتر المشترك (استيراد، مسح، بداية): كتابة كل سجلات الهدف، وحذف ما ليس فيه.
  // existing: {قسم: [معرّفات المستندات الموجودة الآن]}. prev (عند إكمال عملية فشلت): المستندات المعروفة من
  // المحاولات السابقة (ما كان قبلها وما كتبته)؛ لا يُحذف غيرها، فما أضافه الشريك بعد الفشل يبقى.
  // يرجع {sets: [[قسم، سجل]], dels: [[قسم، معرّف]], known} وknown هو prev للإكمال التالي
  RB.replacePlan = (state, existing, prev) => {
    const known = new Set(prev || []);
    const sets = [];
    const dels = [];
    for (const k of RB.SECTIONS) {
      const recs = Array.isArray(state[k]) ? state[k] : [];
      const keep = new Set(recs.map((r) => r.id));
      for (const id of (existing && existing[k]) || []) {
        const p = k + '/' + id;
        if (!prev) known.add(p);
        if (!keep.has(id) && known.has(p)) dels.push([k, id]);
      }
      for (const r of recs) {
        sets.push([k, r]);
        known.add(k + '/' + r.id);
      }
    }
    return { sets, dels, known };
  };
  // لقطة قسم من البيانات المشتركة ومعها ما فشل حفظه من هذه الصفحة ولم يُحفظ بعده (unsaved: [{section, id, rec}]؛
  // rec = null للحذف، وللإعدادات rec الإعدادات كلها): ما في الشاشة يبقى كما أدخله المستخدم. لا تُعدَّل data
  RB.withUnsaved = (section, data, unsaved) => {
    let out = data;
    for (const u of unsaved || []) {
      if (!isObj(u) || u.section !== section) continue;
      if (section === 'settings') {
        if (isObj(u.rec)) out = JSON.parse(JSON.stringify(u.rec));
        continue;
      }
      out = (Array.isArray(out) ? out : []).filter((x) => !(isObj(x) && String(x.id) === String(u.id)));
      if (isObj(u.rec)) out.push(JSON.parse(JSON.stringify(u.rec)));
    }
    return out;
  };

  // علامة config/replace كما تُعرض لمن يفتح البيانات المشتركة: '' (لا علامة، أو كتبتها هذه الصفحة sid)،
  // running (جهاز آخر يستورد أو يمسح الآن: العلامة تتجدد كل 30 ثانية أثناء العملية فتُعد جارية ما دامت أحدث من
  // 5 دقائق، مع تسامح في فرق الساعة بين الجهازين)، stale (توقفت أو فشلت: البيانات قد تكون ناقصة)
  RB.REPLACE_LIVE_MS = 5 * 60 * 1000;
  RB.replaceMarkerState = (m, now, sid) => {
    if (!isObj(m) || (sid && m.by === sid)) return '';
    const age = now - Date.parse(m.at);
    return m.status === 'running' && Math.abs(age) < RB.REPLACE_LIVE_MS ? 'running' : 'stale';
  };

  // شكل الأرصدة الافتتاحية: كائن بتاريخ ومبالغ، والتطبيقات كائن بمعرّفات قنوات صالحة، والموردون ومخصص نهاية الخدمة
  // لكل موظف قائمتان؛ غيره null
  RB.cleanOpening = (o) => {
    if (!isObj(o)) return null;
    const apps = {};
    if (isObj(o.apps)) for (const k of Object.keys(o.apps)) if (!PROTO.includes(k) && !/^\d+$/.test(k)) apps[k] = o.apps[k];
    const payables = (Array.isArray(o.payables) ? o.payables : []).filter(isObj).map((x) => Object.assign({}, x, { supplier: str(x.supplier) }));
    const eosb = (Array.isArray(o.eosb) ? o.eosb : []).filter(isObj).map((x) => Object.assign({}, x, { employeeId: str(x.employeeId) }));
    return Object.assign({}, noNumKeys(o), { date: str(o.date), apps, payables, eosb });
  };

  // يكمل أي حقول ناقصة (نسخ احتياطية قديمة أو بيانات منقوصة)، ويصلح شكل الإعدادات والسجلات:
  // الإعدادات كائن (بلا مفاتيح رقمية دخيلة)، قنوات البيع بمعرّف نصي، والمعرّف المكرر في القسم يُعطى معرّفاً جديداً
  RB.normalize = (src) => {
    const out = RB.emptyState();
    if (!isObj(src)) return out;
    const s = isObj(src.settings) ? noNumKeys(src.settings) : {};
    out.settings = Object.assign(RB.defaultSettings(), s);
    out.settings.gosi = Object.assign(RB.defaultSettings().gosi, isObj(s.gosi) ? noNumKeys(s.gosi) : {});
    out.settings.labor = Object.assign(RB.defaultSettings().labor, isObj(s.labor) ? noNumKeys(s.labor) : {});
    const chs = (Array.isArray(s.channels) ? s.channels : [])
      .filter((c) => isObj(c) && ((typeof c.id === 'string' && c.id && !PROTO.includes(c.id)) || typeof c.id === 'number'))
      .map((c) => (typeof c.id === 'string' && typeof c.name === 'string' ? c : Object.assign({}, c, { id: String(c.id), name: str(c.name) || String(c.id) })));
    out.settings.channels = chs.length ? chs : RB.defaultSettings().channels;
    // تاريخ غير مفهوم في الإعدادات لا يمكن الحساب به (يكسر الإهلاك والإقرارات): يُفرَّغ ليُعاد تحديده
    for (const f of ['openingDate', 'vatRegisteredFrom']) if (out.settings[f] && !RB.isISODate(out.settings[f])) out.settings[f] = '';
    out.settings.opening = RB.cleanOpening(s.opening);
    out.settings.closedDays = (Array.isArray(s.closedDays) ? s.closedDays : []).filter(RB.isISODate);
    RB.SECTIONS.forEach((k) => {
      if (!Array.isArray(src[k])) return;
      const seen = new Set();
      out[k] = src[k]
        .map((x) => RB.sanitizeRecord(k, x))
        .filter(Boolean)
        .map((x) => {
          if (seen.has(x.id)) x = Object.assign({}, x, { id: RB.uid() });
          seen.add(x.id);
          return x;
        });
    });
    out.expenses = out.expenses.map(RB.migrateExpense);
    return out;
  };
  // السجلات السليمة فقط (بلا تاريخ ناقص أو غير صالح)
  const good = (arr) => (arr || []).filter((x) => x && !x._bad);
  RB.good = good;

  // تصنيفات أقدم: الزكاة كانت ضمن «رسوم حكومية»، وتأمين المحل ضمن «التأمين الطبي».
  // يرجع السجل نفسه إن لم يتغير، وإلا نسخة بالتصنيف الجديد
  RB.migrateExpense = (x) => {
    if (!x || typeof x !== 'object') return x;
    const d = String(x.desc || '');
    if (x.category === 'gov' && /زكاة/.test(d)) return Object.assign({}, x, { category: 'zakat' });
    if (x.category === 'insurance' && /حريق|المحل|ممتلكات/.test(d) && !/طبي|صحي/.test(d)) return Object.assign({}, x, { category: 'shop_insurance' });
    return x;
  };

  RB.isEmpty = (S) => RB.SECTIONS.every((k) => !S[k] || S[k].length === 0);

  // ───────────── دليل الحسابات ─────────────
  // type: A أصل، L التزام، E حقوق ملكية، R إيراد، X مصروف
  const ACC = {
    1101: { name: 'الصندوق (الكاشير)', type: 'A', group: 'cash' },
    1102: { name: 'الحساب البنكي', type: 'A', group: 'cash' },
    1103: { name: 'مستحقات تطبيقات التوصيل', type: 'A', group: 'cur' },
    1104: { name: 'مخزون المواد (حسب الجرد)', type: 'A', group: 'cur' },
    1105: { name: 'مصروفات مدفوعة مقدماً', type: 'A', group: 'cur' },
    1106: { name: 'سلف العمال', type: 'A', group: 'cur' },
    1290: { name: 'مجمع الإهلاك والإطفاء', type: 'A', group: 'fixed' },
    2101: { name: 'ذمم الموردين (آجل)', type: 'L', group: 'liab' },
    2102: { name: 'ضريبة القيمة المضافة', type: 'L', group: 'liab' },
    2103: { name: 'رواتب وتأمينات مستحقة', type: 'L', group: 'liab' },
    2201: { name: 'مخصص مكافأة نهاية الخدمة', type: 'L', group: 'liab' },
    4101: { name: 'المبيعات (بدون الضريبة)', type: 'R', group: 'sales' },
    5109: { name: 'تغيّر المخزون (حسب الجرد)', type: 'X', group: 'cogs' },
    5201: { name: 'الرواتب والأجور', type: 'X', group: 'labor' },
    5202: { name: 'التأمينات الاجتماعية (حصة المنشأة)', type: 'X', group: 'labor' },
    5203: { name: 'مكافأة نهاية الخدمة (مخصص)', type: 'X', group: 'labor' },
    5401: { name: 'عمولات تطبيقات التوصيل', type: 'X', group: 'sell' },
    5402: { name: 'رسوم أجهزة الشبكة', type: 'X', group: 'sell' },
    5403: { name: 'خصومات وتسويات التطبيقات', type: 'X', group: 'sell' },
    // فرق جرد الدرج: مدين = عجز، دائن = زيادة
    5316: { name: 'عجز وزيادة الصندوق', type: 'X', group: 'opex' },
    5501: { name: 'الإهلاك والإطفاء', type: 'X', group: 'dep' },
  };
  RB.ASSET_CATS.forEach((c) => (ACC[c.acc] = { name: c.name, type: 'A', group: 'fixed' }));
  RB.EXPENSE_CATS.forEach((c) => (ACC[c.acc] = { name: c.name, type: 'X', group: c.group }));
  RB.PURCHASE_CATS.forEach((c) => (ACC[c.acc] = { name: c.name, type: 'X', group: c.cogs ? 'cogs' : 'opex' }));
  RB.ACC = ACC;

  RB.GROUPS = {
    cogs: 'تكلفة المبيعات (المواد والتغليف)',
    sell: 'عمولات البيع والتوصيل',
    labor: 'تكاليف العمالة',
    occ: 'إيجار المحل',
    opex: 'مصاريف تشغيلية وإدارية',
    dep: 'الإهلاك والإطفاء',
    // بعد صافي الربح التشغيلي: لا تدخل في المصاريف ولا في نقطة التعادل
    zakat: 'الزكاة',
  };

  RB.accInfo = (code, S) => {
    if (ACC[code]) return Object.assign({ code }, ACC[code]);
    const [kind, pid] = String(code).split(':');
    const i = S ? (S.partners || []).findIndex((x) => x && x.id === pid) : -1;
    const p = i >= 0 ? S.partners[i] : null;
    // حساب شريك حُذف وبقيت له قيود (بيانات قديمة): يُسمّى بذلك بدل «شريك» المبهم
    const pname = p ? p.name : S ? 'شريك محذوف' : 'شريك';
    // رمز العرض: 31xx رأس مال الشريك و32xx مسحوباته بترتيبه في قائمة الشركاء (99 لشريك محذوف)، لا معرّفه الداخلي
    const disp = (base) => base + String(i >= 0 ? Math.min(i + 1, 98) : 99).padStart(2, '0');
    if (kind === 'cap') return { code, disp: disp('31'), name: 'رأس مال ' + pname, type: 'E', group: 'cap', partnerId: pid };
    if (kind === 'drw') return { code, disp: disp('32'), name: 'مسحوبات ' + pname, type: 'E', group: 'drw', partnerId: pid };
    return { code, name: code, type: 'X', group: 'opex' };
  };

  RB.srcAcc = (src) => {
    if (src === 'cash') return '1101';
    if (src === 'payable') return '2101';
    if (typeof src === 'string' && src.startsWith('partner:')) return 'cap:' + src.slice(8);
    return '1102';
  };
  RB.srcLabel = (src, S) => {
    if (RB.PAY_LABEL[src]) return RB.PAY_LABEL[src];
    if (typeof src === 'string' && src.startsWith('partner:')) {
      const p = (S.partners || []).find((x) => x.id === src.slice(8));
      return 'دفعها ' + (p ? p.name : 'شريك');
    }
    return RB.PAY_LABEL.bank;
  };

  const catOf = (list, id) => list.find((c) => c.id === id) || list[list.length - 1];
  RB.assetCat = (id) => RB.ASSET_CATS.find((c) => c.id === id) || RB.ASSET_CATS[0];
  // أصل قائم قبل بدء الدفتر (رصيد افتتاحي): يُسجَّل بقيمته الدفترية، لا ضريبة مدخلات عليه (استُردّت عند شرائه)،
  // وقيمته حقوق للشركاء حسب نسبهم كبقية الأرصدة الافتتاحية
  RB.isOpeningAsset = (a) => !!a && a.account === 'opening';
  // التأمين المسترد (تأمين الإيجار أو العدادات) ليس توريداً خاضعاً: لا ضريبة عليه مهما كانت قيمة taxable المحفوظة،
  // ولا الأصل القائم قبل بدء الدفتر
  RB.assetTaxable = (a) => a.category !== 'deposit' && !RB.isOpeningAsset(a) && !!a.taxable;
  RB.expenseCat = (id) => catOf(RB.EXPENSE_CATS, id);
  RB.purchaseCat = (id) => RB.PURCHASE_CATS.find((c) => c.id === id) || RB.PURCHASE_CATS[0];

  // ───────────── الضريبة ─────────────
  // amount: المبلغ المدخل، includesVat: هل يشمل الضريبة، taxable: هل الفاتورة خاضعة
  RB.vatSplit = (amount, includesVat, taxable, settings) => {
    const rate = num(settings.vatRate) / 100;
    amount = num(amount);
    if (!taxable || !rate) return { net: r2(amount), vat: 0, gross: r2(amount) };
    if (includesVat) {
      const gross = r2(amount);
      const net = r2(gross / (1 + rate));
      return { net, vat: r2(gross - net), gross };
    }
    const net = r2(amount);
    const vat = r2(net * rate);
    return { net, vat, gross: r2(net + vat) };
  };
  // هل المطعم مسجل في الضريبة في هذا التاريخ؟ (بدون تاريخ = حسب الإعداد فقط)
  RB.isVatReg = (set, date) => !!set.vatRegistered && (!set.vatRegisteredFrom || !date || date >= set.vatRegisteredFrom);
  // غير المسجل في الضريبة يتحمّلها كتكلفة؛ المسجل يستردها. date = تاريخ العملية
  RB.costSplit = (amount, includesVat, taxable, settings, date) => {
    const v = RB.vatSplit(amount, includesVat, taxable, settings);
    const reg = RB.isVatReg(settings, date);
    return { cost: reg ? v.net : v.gross, vat: reg ? v.vat : 0, gross: v.gross, net: v.net, rawVat: v.vat };
  };

  RB.purchaseTotal = (p) => r2(sum(p.lines || [], (l) => num(l.qty) * num(l.price)));

  // سعر المادة الخام في سطر الفاتورة: بلا ضريبة، ويُرفع بالضريبة إن كانت الفاتورة خاضعة وأسعارها شاملة
  RB.autoLinePrice = (raw, includesVat, taxable, settings) => (includesVat && taxable ? r2(num(raw.price) * (1 + num(settings.vatRate) / 100)) : num(raw.price));
  // تحديث أسعار المواد الخام من فاتورة: من أسطر الشراء فقط (كمية وسعر موجبان)، فالمرتجع أو الإشعار الدائن
  // لا يغيّر سعراً ولا يصير السعر سالباً. السعر المحفوظ بلا ضريبة. يرجع [{id, name, old, price}] لما تغيّر
  RB.rawPriceUpdates = (p, raws, settings) => {
    const r = num(settings.vatRate) / 100;
    const out = new Map();
    for (const l of p.lines || []) {
      if (!l || !l.rawId || !(num(l.qty) > 0) || !(num(l.price) > 0)) continue;
      const raw = (raws || []).find((x) => x && x.id === l.rawId);
      if (!raw) continue;
      const net = p.includesVat && p.taxable ? r2(num(l.price) / (1 + r)) : r2(num(l.price));
      out.set(raw.id, { id: raw.id, name: raw.name, old: num(raw.price), price: net });
    }
    return [...out.values()].filter((x) => Math.abs(x.price - x.old) > 0.004);
  };
  // تاريخ أسعار المادة الخام من الفواتير، الأحدث أولاً (وفي اليوم نفسه آخر ما سُجّل): أسطر الشراء فقط (كمية وسعر
  // موجبان) بالسعر بلا ضريبة. exceptId: فاتورة لا تُحسب (الفاتورة التي تُحفظ الآن)
  RB.rawPriceHistory = (S, rawId, exceptId) => {
    const r = num(S.settings.vatRate) / 100;
    const out = [];
    good(S.purchases).forEach((p, i) => {
      if (!p.date || p.id === exceptId) return;
      for (const l of p.lines || []) {
        if (!l || l.rawId !== rawId || !(num(l.qty) > 0) || !(num(l.price) > 0)) continue;
        out.push({ date: p.date, supplier: p.supplier || '', priceNet: p.includesVat && p.taxable ? r2(num(l.price) / (1 + r)) : r2(num(l.price)), purchaseId: p.id, i });
      }
    });
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.i - a.i));
    return out.map(({ i, ...x }) => x);
  };
  // تغيّر سعر المادة: آخر سعر شراء، والسعر الذي سبقه (آخر سعر مختلف عنه)، ونسبة التغيّر؛ null إن لم يتغير
  RB.rawPriceChange = (S, rawId) => {
    const h = RB.rawPriceHistory(S, rawId);
    if (!h.length) return null;
    const last = h[0].priceNet;
    const p = h.find((x) => Math.abs(x.priceNet - last) > 0.004);
    if (!p) return null;
    return { last, prev: p.priceNet, pct: ((last - p.priceNet) / p.priceNet) * 100, date: h[0].date, prevDate: p.date };
  };

  // ذاكرة المورد: إعدادات آخر فاتورة من المورد نفسه (اسمه كاملاً بلا المسافات الطرفية، لا اسماً يبدأ به)؛
  // التاريخ الأحدث، وفي اليوم نفسه آخر ما سُجّل. null إن لم تكن له فاتورة
  RB.SUPPLIER_MEM_KEYS = ['category', 'account', 'taxable', 'includesVat'];
  RB.supplierMemory = (purchases, name) => {
    const n = String(name || '').trim();
    if (!n) return null;
    let last = null;
    for (const x of purchases || []) if (x && String(x.supplier || '').trim() === n && (!last || String(x.date || '') >= String(last.date || ''))) last = x;
    return last ? { category: last.category, account: last.account, taxable: !!last.taxable, includesVat: !!last.includesVat } : null;
  };
  // خطوة ذاكرة المورد عند كل تغيير لاسم المورد في نموذج الفاتورة (تعدّل v):
  // - memo: ما طبّقته الذاكرة سابقاً {name, was: القيم قبلها، now: ما وضعته} أو null.
  // - الاسم لم يعد اسم ذلك المورد (مورد جديد يبدأ اسمه باسمه أثناء الكتابة، أو مُسح الاسم): تعود القيم التي
  //   وضعتها الذاكرة إلى ما كانت عليه، إلا ما غيّره المستخدم بعدها (touched) أو ما تغيّر بغيرها.
  // - ثم إعدادات آخر فاتورة من المورد المكتوب، إلا ما غيّره المستخدم بنفسه أو ما لا يصلح (valid).
  // يرجع {memo, changed: تغيّرت قيم، applied: ما طُبّق الآن، dropped: أُلغيت ذاكرة سابقة}
  RB.supplierMemoryStep = (v, purchases, memo, touched, valid) => {
    const name = String(v.supplier || '').trim();
    const t = touched || {};
    let changed = false;
    let dropped = false;
    if (memo && memo.name !== name) {
      for (const k of Object.keys(memo.was)) {
        if (t[k] || v[k] !== memo.now[k]) continue;
        v[k] = memo.was[k];
        changed = true;
      }
      memo = null;
      dropped = true;
    }
    let applied = [];
    const mem = !memo && RB.supplierMemory(purchases, name);
    if (mem) {
      applied = RB.SUPPLIER_MEM_KEYS.filter((k) => !t[k] && (!valid || valid(k, mem[k])) && v[k] !== mem[k]);
      if (applied.length) {
        memo = { name, was: {}, now: {} };
        for (const k of applied) {
          memo.was[k] = v[k];
          v[k] = memo.now[k] = mem[k];
        }
        changed = true;
      }
    }
    return { memo, changed, applied, dropped };
  };

  // حدود الحقل الرقمي: فراغ = لا قيمة (يحكمه «مطلوب»)؛ يرجع نص الخطأ أو فراغاً
  RB.rangeMsg = (v, min, max) => {
    if (v === '' || v === undefined || v === null || (typeof v === 'string' && !v.trim())) return '';
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!isFinite(n)) return 'أدخل رقماً';
    if (min !== undefined && min !== null && n < min) return 'القيمة لا تقل عن ' + min;
    if (max !== undefined && max !== null && n > max) return 'القيمة لا تزيد عن ' + max;
    return '';
  };

  // ───────────── الرواتب والعمالة ─────────────
  // نظام التأمينات الاجتماعية الجديد: لمن سُجّل في التأمينات أول مرة من 3 يوليو 2024 تزيد نسبة فرع المعاشات
  // 0.5% لكل طرف كل يوليو من 2025 حتى 2028، فوق نسب الإعدادات (النظام السابق). بلا قيمة = النظام السابق
  RB.GOSI_NEW_STEPS = ['2025-07', '2026-07', '2027-07', '2028-07'];
  RB.gosiSaudiRates = (emp, S, ym) => {
    const g = S.settings.gosi;
    const m = ym || RB.todayISO().slice(0, 7);
    const step = emp.gosiSystem === 'new' ? 0.5 * RB.GOSI_NEW_STEPS.filter((s) => m >= s).length : 0;
    return { er: num(g.saudiEr) + step, ee: num(g.saudiEe) + step };
  };
  // السكن المقدَّم عيناً (بلا بدل نقدي): يدخل في الأجر الخاضع مقدّراً بأجر شهرين في السنة.
  // بلا اختيار صريح: يُفترض إن لم يكن له بدل سكن نقدي وله نصيب من سكن العمال
  RB.housingInKind = (emp) => (emp.housingInKind != null ? !!emp.housingInKind : !num(emp.housing) && num(emp.housingCost) > 0);
  // ym = شهر الرواتب (للنظام الجديد)؛ بدونه الشهر الحالي
  RB.gosiFor = (emp, S, ym) => {
    const g = S.settings.gosi;
    // السكن العيني المقدَّر يدخل في أساس التأمينات فقط، لا في الراتب ولا في المسير
    const hous = num(emp.housing) > 0 ? num(emp.housing) : RB.housingInKind(emp) ? (num(emp.basic) * 2) / 12 : 0;
    const base = Math.min(num(emp.basic) + hous, num(g.cap) || Infinity);
    if (emp.nationality === 'saudi') {
      const r = RB.gosiSaudiRates(emp, S, ym);
      return { base: r2(base), er: r2((base * r.er) / 100), ee: r2((base * r.ee) / 100) };
    }
    return { base: r2(base), er: r2((base * num(g.expatEr)) / 100), ee: 0 };
  };

  // مخصص مكافأة نهاية الخدمة الشهري (نظام العمل، المادة 84): نصف أجر شهر عن كل سنة من الخمس الأولى
  // (الأجر ÷ 24 شهرياً)، وأجر شهر عن كل سنة بعدها (الأجر ÷ 12). مدة الخدمة حتى atDate
  RB.eosbMonthly = (wage, startDate, atDate) => {
    const y = startDate ? RB.daysBetween(startDate, atDate || RB.todayISO()) / 365.25 : 0;
    return r2(num(wage) / (isFinite(y) && y >= 5 ? 12 : 24));
  };
  // ما تراكم بالمعدل نفسه عن الخدمة من startDate حتى atDate (المخصص الافتتاحي لعامل باشر قبل بدء الدفتر):
  // نصف أجر شهر عن كل سنة من الخمس الأولى، وأجر شهر عن كل سنة بعدها، وجزء السنة بنسبته
  RB.eosbEarned = (wage, startDate, atDate) => {
    if (!RB.isISODate(startDate) || !RB.isISODate(atDate) || atDate <= startDate) return 0;
    const y = RB.daysBetween(startDate, atDate) / 365.25;
    return r2(num(wage) * (Math.min(y, 5) / 2 + Math.max(0, y - 5)));
  };

  // التكلفة الشهرية الحقيقية للعامل على المطعم. ym = الشهر (للتأمينات ومدة الخدمة)؛ بدونه الشهر الحالي
  RB.employeeMonthlyCost = (emp, S, ym) => {
    ym = ym || RB.todayISO().slice(0, 7);
    const salary = num(emp.basic) + num(emp.housing) + num(emp.transport) + num(emp.otherAllow);
    const gosi = RB.gosiFor(emp, S, ym);
    const expat = emp.nationality !== 'saudi';
    const levy = expat ? num(emp.levyMonthly) : 0;
    const iqama = expat ? (num(emp.iqamaAnnual) + num(emp.workPermitAnnual)) / 12 : 0;
    const medical = num(emp.medicalAnnual) / 12;
    const ticket = num(emp.ticketAnnual) / 12;
    const other = num(emp.otherAnnual) / 12;
    const housing = num(emp.housingCost); // نصيبه من سكن العمال إن كان السكن على المطعم
    // مخصص نهاية الخدمة: نفس ما يُستحق في الدفاتر مع كل مسير
    const eosb = RB.eosbMonthly(salary, emp.startDate, RB.monthEnd(ym));
    const items = [
      ['salary', 'الراتب والبدلات', salary],
      ['gosi', 'التأمينات الاجتماعية (حصة المنشأة)', gosi.er],
      ['levy', 'المقابل المالي', levy],
      ['iqama', 'الإقامة ورخصة العمل (شهرياً)', iqama],
      ['medical', 'التأمين الطبي (شهرياً)', medical],
      ['ticket', 'تذاكر السفر (شهرياً)', ticket],
      ['housing', 'السكن المقدّم (نصيبه)', housing],
      ['other', 'رسوم ومزايا أخرى (شهرياً)', other],
      ['eosb', 'مخصص نهاية الخدمة', eosb],
    ].map(([k, label, v]) => ({ k, label, v: r2(v) }));
    return { salary: r2(salary), gosi, items, total: r2(sum(items, (i) => i.v)), netPay: r2(salary - gosi.ee) };
  };

  // حالة الموظف في الشهر ym: active على رأس العمل، left ترك العمل، stopped متوقف بلا تاريخ ترك العمل،
  // future لم يباشر بعد (تاريخ المباشرة بعد الشهر)
  RB.employeeStatus = (emp, ym) => {
    if (emp.endDate && emp.endDate.slice(0, 7) < ym) return 'left';
    if (emp.startDate && emp.startDate.slice(0, 7) > ym) return 'future';
    if (emp.active === false) return emp.endDate && emp.endDate.slice(0, 7) <= ym ? 'left' : 'stopped';
    return 'active';
  };
  // له راتب في مسير الشهر ym: باشر قبل نهاية الشهر، ولم يترك العمل قبل أوله. تاريخ ترك العمل هو الحَكَم
  // (من ترك العمل في 20 سبتمبر له مسير سبتمبر وإن أُلغي «على رأس العمل»)، وبلا تاريخ يُتبع «على رأس العمل».
  // حالة الموظف للعرض (RB.employeeStatus) تبقى كما هي
  RB.isEmployeeActive = (emp, ym) => {
    if (emp.startDate && emp.startDate.slice(0, 7) > ym) return false;
    if (emp.endDate) return emp.endDate.slice(0, 7) >= ym;
    return emp.active !== false;
  };

  // سطر المسير لشهر ym (نسب التأمينات حسب الشهر)؛ بدونه الشهر الحالي.
  // من باشر أو ترك العمل أثناء الشهر: خصم الأيام التي لم يعملها (الأجر ÷ 30 لكل يوم، والشهر الكامل 30 يوماً)
  // في «الخصومات»، ويبقى الأساسي والسكن كما هما فلا يتغير أجر التأمينات.
  // شهر ليس له فيه راتب (بعد ترك العمل أو قبل المباشرة) لا خصم أيام فيه: سطره لا يُبنى منه مسير
  // (مسير التسوية يصفّر الراتب)، والخصم لا يزيد على الأجر فلا يكون السطر سالباً
  RB.payrollLine = (emp, S, ym) => {
    const g = RB.gosiFor(emp, S, ym);
    const l = {
      employeeId: emp.id,
      name: emp.name,
      basic: num(emp.basic),
      housing: num(emp.housing),
      allowances: r2(num(emp.transport) + num(emp.otherAllow)),
      additions: 0,
      deductions: 0,
      gosiEe: g.ee,
      gosiEr: g.er,
      eosbPaid: 0, // مكافأة نهاية الخدمة المصروفة: خارج إجمالي الرواتب والتأمينات، تُخصم من المخصص
      advance: 0, // استقطاع سلفة: لا يغيّر إجمالي الراتب، يُخصم مما يُحوَّل للموظف ويُسدّد رصيد سلفه
    };
    const w = RB.payrollDaysWorked(emp, ym);
    if (w !== null && RB.isEmployeeActive(emp, ym)) {
      const ded = r2(((l.basic + l.housing + l.allowances) * (30 - Math.min(w, 30))) / 30);
      if (ded > 0) {
        l.deductions = ded;
        l.note = 'أيام عمل ' + w;
      }
    }
    // السلفة الباقية عليه من نهاية الشهر تُستقطع بقدر ما يتسع له صافي راتبه: أدنى رصيد لسلفه من ذلك اليوم فصاعداً،
    // فما استُقطع منها في مسير لاحق (أو سدّده) لا يُقترح استقطاعه ثانية في مسير شهر فات تسجيله
    const owed = (S.advances || []).length ? RB.advanceRoom(S, RB.monthEnd(RB.isISOMonth(ym) ? ym : RB.todayISO().slice(0, 7)))[emp.id] || 0 : 0;
    if (owed > 0.005) l.advance = r2(Math.max(0, Math.min(owed, RB.payrollLineGross(l) - num(l.gosiEe))));
    return l;
  };
  // أيام العمل في الشهر ym لمن باشر أو ترك العمل أثناءه؛ null إن عمل الشهر كله (أو بلا شهر صالح)
  RB.payrollDaysWorked = (emp, ym) => {
    if (!RB.isISOMonth(ym)) return null;
    const ms = ym + '-01';
    const me = RB.monthEnd(ym);
    const from = RB.isISODate(emp.startDate) && emp.startDate > ms ? emp.startDate : ms;
    const to = RB.isISODate(emp.endDate) && emp.endDate < me ? emp.endDate : me;
    if (from === ms && to === me) return null;
    return Math.max(0, RB.daysBetween(from, to) + 1);
  };
  RB.payrollLineGross = (l) => r2(num(l.basic) + num(l.housing) + num(l.allowances) + num(l.additions) - num(l.deductions));
  RB.payrollTotals = (pr) => {
    const lines = pr.lines || [];
    const gross = r2(sum(lines, RB.payrollLineGross));
    const gosiEe = r2(sum(lines, (l) => num(l.gosiEe)));
    const gosiEr = r2(sum(lines, (l) => num(l.gosiEr)));
    const eosbPaid = r2(sum(lines, (l) => Math.max(0, num(l.eosbPaid))));
    // adv: سلف مستقطعة من المسير؛ netPaid: ما يُحوَّل للموظفين فعلاً (الصافي − السلف)
    const adv = r2(sum(lines, (l) => Math.max(0, num(l.advance))));
    const net = r2(gross - gosiEe);
    // advEosb: ما استُقطع من مكافأة نهاية الخدمة (لا من الراتب) من تلك السلف — يُقيَّد مع صرف المكافأة
    const advEosb = r2(sum(lines, RB.payrollLineAdvEosb));
    return { gross, gosiEe, gosiEr, net, adv, netPaid: r2(net - adv), advEosb, count: lines.length, cost: r2(gross + gosiEr), eosbPaid };
  };
  // استقطاع سلفة السطر الزائد على صافي راتبه يؤخذ من مكافأة نهاية الخدمة المصروفة في السطر (مسير التسوية بلا راتب)
  RB.payrollLineAdvEosb = (l) => {
    if (!l) return 0;
    const salary = Math.max(0, RB.payrollLineGross(l) - num(l.gosiEe));
    return r2(Math.min(Math.max(0, num(l.eosbPaid)), Math.max(0, Math.max(0, num(l.advance)) - salary)));
  };
  // أرصدة سلف العمال حتى تاريخ لكل موظف: السلف المصروفة − ما سدّده نقداً − ما استُقطع في مسيرات صُرفت حتى التاريخ.
  // مجموعها = رصيد حساب 1106 (المفتاح '' لاستقطاع في سطر بلا موظف مسجل)
  RB.advanceBalances = (S, asOf) => {
    const out = {};
    const add = (id, v) => (out[id || ''] = r2((out[id || ''] || 0) + v));
    for (const a of good(S.advances)) {
      if (asOf && a.date > asOf) continue;
      add(a.employeeId, a.kind === 'repay' ? -num(a.amount) : num(a.amount));
    }
    for (const pr of good(S.payroll)) {
      if (!pr.date || (asOf && pr.date > asOf)) continue;
      for (const l of pr.lines || []) if (l && num(l.advance) > 0) add(l.employeeId, -num(l.advance));
    }
    return out;
  };
  // ما يمكن استقطاعه من سلف كل موظف في مسير بتاريخ from: أدنى رصيد لسلفه في نهاية ذلك اليوم وكل يوم بعده.
  // استقطاع في from ينقص رصيده في كل ما بعده، فلا يُستقطع في مسير أقدم (شهر فات تسجيل مسيره) ما استُقطع أو سُدّد
  // بعده؛ وسلفة صُرفت بعد from لا تُستقطع قبل صرفها. بالسالب: رصيده دائن في يوم ما بعده
  RB.advanceRoom = (S, from) => {
    const ev = {};
    const add = (id, d, v) => {
      const m = ev[id || ''] || (ev[id || ''] = {});
      const k = !d || d <= from ? '' : d;
      m[k] = (m[k] || 0) + v;
    };
    for (const a of good(S.advances)) add(a.employeeId, a.date, a.kind === 'repay' ? -num(a.amount) : num(a.amount));
    for (const pr of good(S.payroll)) {
      if (!pr.date) continue;
      for (const l of pr.lines || []) if (l && num(l.advance) > 0) add(l.employeeId, pr.date, -num(l.advance));
    }
    const out = {};
    for (const id of Object.keys(ev)) {
      const m = ev[id];
      let bal = r2(m[''] || 0);
      let min = bal;
      for (const d of Object.keys(m).filter(Boolean).sort()) {
        bal = r2(bal + m[d]);
        if (bal < min) min = bal;
      }
      out[id] = min;
    }
    return out;
  };
  // أدنى رصيد سلف للموظف في نهاية أي يوم (السلف وسدادها واستقطاعات المسيرات بتواريخها): {min, date}.
  // بالسالب: استُقطع من راتبه أكثر مما أُعطي حتى ذلك اليوم (رصيد دائن في 1106)
  RB.advanceLow = (S, empId) => {
    const day = {};
    const add = (d, v) => (day[d] = (day[d] || 0) + v);
    for (const a of good(S.advances)) if ((a.employeeId || '') === (empId || '') && a.date) add(a.date, a.kind === 'repay' ? -num(a.amount) : num(a.amount));
    for (const pr of good(S.payroll)) {
      if (!pr.date) continue;
      for (const l of pr.lines || []) if (l && (l.employeeId || '') === (empId || '') && num(l.advance) > 0) add(pr.date, -num(l.advance));
    }
    let bal = 0;
    let min = 0;
    let at = '';
    for (const d of Object.keys(day).sort()) {
      bal = r2(bal + day[d]);
      if (bal < min) {
        min = bal;
        at = d;
      }
    }
    return { min, date: at };
  };
  // أسطر مسير الشهر ym من بيانات الموظفين: من له راتب في الشهر، ومن باشر أو ترك العمل أثناءه بخصم ما لم يعمله
  // (نسب التأمينات حسب الشهر). cur: الأسطر الحالية (بُنيت لشهر fromYm) يبقى منها ما أدخله المستخدم:
  // الإضافي، والخصومات والتأمينات إن اختلفت عمّا يُحسب تلقائياً، ومكافأة نهاية الخدمة المصروفة؛
  // والأسطر بلا موظف مسجل، وسطر من ليس له راتب في الشهر إن صُرفت له فيه مكافأة نهاية الخدمة.
  // ما أُدخل لموظف ليس له راتب في ym لا يبقى في الناتج، فتغيير الشهر يُبنى دائماً من أسطر ما قبل التغيير
  // (النموذج يحتفظ بها حتى يغادر المستخدم حقل الشهر) لا من أسطر شهر وسيط.
  // l._autoDed و l._autoAdv (مؤقتان، يُحذفان عند الحفظ): خصم الأيام واستقطاع السلفة اللذان وضعهما البرنامج في السطر،
  // فما خالفهما أدخله المستخدم
  RB.payrollFill = (S, ym, cur, fromYm) => {
    cur = (cur || []).filter((l) => l && typeof l === 'object');
    fromYm = RB.isISOMonth(fromYm) ? fromYm : ym;
    const old = {};
    for (const l of cur) if (l.employeeId && !old[l.employeeId]) old[l.employeeId] = l;
    const same = (a, b) => Math.abs(num(a) - num(b)) < 0.005;
    const lines = (S.employees || [])
      .filter((e) => e && RB.isEmployeeActive(e, ym))
      .map((e) => {
        const n = RB.payrollLine(e, S, ym);
        n._autoDed = n.deductions;
        n._autoAdv = n.advance;
        const o = old[e.id];
        if (!o) return n;
        const was = RB.payrollLine(e, S, fromYm);
        // التأمينات تلقائية إن طابقت المحسوب من بيانات الموظف أو من أساسي السطر وسكنه
        const g = RB.gosiFor(Object.assign({}, e, { basic: num(o.basic), housing: num(o.housing) }), S, fromYm);
        if (num(o.additions)) n.additions = o.additions;
        if (num(o.deductions) && !same(o.deductions, o._autoDed !== undefined ? o._autoDed : was.deductions)) n.deductions = o.deductions;
        if (!same(o.gosiEe, was.gosiEe) && !same(o.gosiEe, g.ee)) n.gosiEe = o.gosiEe;
        if (!same(o.gosiEr, was.gosiEr) && !same(o.gosiEr, g.er)) n.gosiEr = o.gosiEr;
        if (num(o.eosbPaid) > 0) n.eosbPaid = o.eosbPaid;
        // استقطاع السلفة: ما عدّله المستخدم يبقى، وإلا فالمستحق عليه في الشهر الجديد
        if (o.advance !== undefined && !same(o.advance, o._autoAdv !== undefined ? o._autoAdv : was.advance)) n.advance = o.advance;
        return n;
      });
    const ids = new Set(lines.map((l) => l.employeeId));
    for (const l of cur) {
      if (!l.employeeId) lines.push(l);
      else if (!ids.has(l.employeeId) && num(l.eosbPaid) > 0) {
        lines.push(l);
        ids.add(l.employeeId);
      }
    }
    return lines;
  };

  const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  // مسير تسوية لمن ترك العمل: مسير شهر ترك العمل أو ما بعده، أو مصروف في تاريخ ترك العمل أو بعده
  RB.eosbFinalRun = (emp, pr) => !!emp && isDay(emp.endDate) && !!pr && isDay(pr.date) && ((pr.month || pr.date.slice(0, 7)) >= emp.endDate.slice(0, 7) || pr.date >= emp.endDate);

  // مخصص نهاية الخدمة من المسيرات بترتيب تاريخ الاستحقاق: لكل مسير استحقاق (لكل موظف له سطر من أجره:
  // الأساسي + السكن + البدلات، بلا إضافي ولا خصومات) في تاريخ استحقاق الرواتب، ثم صرف المكافأة
  // (eosbPaid) في تاريخ الصرف: من المخصص المتراكم للموظف، وما زاد عليه مصروف في حينه.
  // ومن ترك العمل يبقى مخصصه التزاماً حتى تُسوّى مكافأته، ثم يُرد ما بقي منه إلى المصروف (release)
  RB.eosbEvents = (S) => {
    const emps = byId(S.employees);
    const accrued = {};
    const last = {}; // تاريخ آخر استحقاق أو صرف مكافأة لكل موظف
    const settled = {}; // صُرفت له مكافأة في مسير التسوية بعد ترك العمل
    const names = {};
    const lastRun = {};
    const seen = (id, d, pr) => {
      if (!last[id] || d >= last[id]) {
        last[id] = d;
        lastRun[id] = pr;
      }
    };
    const out = [];
    // مطعم قائم: مخصص كل موظف عن خدمته قبل بدء الدفتر (الأرصدة الافتتاحية) يبدأ منه متراكمه، وقيده مع قيد الأرصدة
    // الافتتاحية (لا يدخل إن لم يدخل ذلك القيد: بلا شركاء يُسجَّل صافيها حقوقاً لهم)
    const op = RB.openingInfo(S);
    if (op && op.eosb > 0 && (RB.openingShares(S, op.net).length || Math.abs(op.net) < 0.005)) {
      const lines = Object.keys(op.eosbBy).map((id) => ({ employeeId: id, amount: op.eosbBy[id] }));
      for (const l of lines) {
        accrued[l.employeeId] = r2((accrued[l.employeeId] || 0) + l.amount);
        seen(l.employeeId, op.date, null);
      }
      out.push({ kind: 'opening', date: op.date, lines, total: op.eosb });
    }
    const runs = good(S.payroll)
      .filter((pr) => pr.date)
      .map((pr) => {
        const ym = pr.month || pr.date.slice(0, 7);
        return { pr, ym, date: pr.date.slice(0, 7) === ym ? pr.date : RB.monthEnd(ym) };
      })
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    for (const { pr, ym, date } of runs) {
      const lines = [];
      for (const l of pr.lines || []) {
        if (!l || !l.employeeId) continue;
        const e = emps[l.employeeId] || {};
        const amount = RB.eosbMonthly(num(l.basic) + num(l.housing) + num(l.allowances), e.startDate, RB.monthEnd(ym));
        if (!(amount > 0)) continue;
        accrued[l.employeeId] = r2((accrued[l.employeeId] || 0) + amount);
        seen(l.employeeId, date, pr);
        if (l.name) names[l.employeeId] = l.name;
        lines.push({ employeeId: l.employeeId, amount });
      }
      if (lines.length) out.push({ kind: 'accrual', pr, ym, date, lines, total: r2(sum(lines, (x) => x.amount)) });
      for (const l of pr.lines || []) {
        const id = (l && l.employeeId) || '';
        const paid = r2(num(l && l.eosbPaid));
        if (!(paid > 0)) continue;
        const fromProv = id ? r2(Math.min(paid, Math.max(0, accrued[id] || 0))) : 0;
        if (id) {
          accrued[id] = r2((accrued[id] || 0) - fromProv);
          seen(id, pr.date, pr);
          if (RB.eosbFinalRun(emps[id], pr)) settled[id] = true;
        }
        // adv: ما استُقطع من هذه المكافأة لسلفة لم يتسع لها راتبه (RB.payrollLineAdvEosb): لا يُصرف نقداً
        out.push({ kind: 'payout', pr, ym, date: pr.date, employeeId: id, name: l.name || (emps[id] || {}).name || '', paid, fromProv, excess: r2(paid - fromProv), adv: RB.payrollLineAdvEosb(l) });
      }
    }
    // ترك العمل: المكافأة الفعلية قد تقل عن المخصص (الاستقالة قبل سنتين لا شيء لها، ومن سنتين إلى عشر بنصيب منقوص —
    // المادة 85). يبقى المخصص التزاماً حتى تُسوّى: بصرف مكافأته في مسير شهر ترك العمل أو بعده، أو بتحديد أنه لا مكافأة
    // له (eosbNone). عندها يُرد الباقي إلى المصروف في تاريخ ترك العمل، أو بعد آخر استحقاق أو صرف له إن كان بعده.
    // فلا يتغير شهر ترك العمل عند تسجيل مكافأة تُصرف بعده. والموظف المحذوف (بيانات قديمة) لا يمكن تسويته، فيُرد باقيه بعد آخر حركة له
    for (const id of Object.keys(accrued)) {
      const e = emps[id];
      const rem = accrued[id];
      if (!(rem > 0)) continue;
      let date;
      if (!e) date = last[id];
      else if (isDay(e.endDate) && (settled[id] || e.eosbNone === true)) date = e.endDate > (last[id] || '') ? e.endDate : last[id];
      else continue;
      out.push({ kind: 'release', date, employeeId: id, name: (e && e.name) || names[id] || '', amount: rem, ref: e ? { s: 'employees', id } : lastRun[id] ? { s: 'payroll', id: lastRun[id].id } : { s: 'settings', id: 'opening' } });
    }
    return out;
  };
  const eosbBal = (evs, asOf, rel) => {
    const out = {};
    for (const ev of evs) {
      if (asOf && ev.date > asOf) continue;
      if (ev.kind === 'accrual' || ev.kind === 'opening') for (const l of ev.lines) out[l.employeeId] = r2((out[l.employeeId] || 0) + l.amount);
      else if (ev.kind === 'release') {
        if (rel) out[ev.employeeId] = r2((out[ev.employeeId] || 0) - ev.amount);
      } else if (ev.employeeId) out[ev.employeeId] = r2((out[ev.employeeId] || 0) - ev.fromProv);
    }
    return out;
  };
  // المخصص المتراكم لكل موظف حتى تاريخ (مجموعها = رصيد حساب 2201).
  // o.release === false: قبل رد الباقي عند التسوية (المتاح للصرف في مسير التسوية)
  RB.eosbBalances = (S, asOf, o) => eosbBal(RB.eosbEvents(S), asOf, !(o && o.release === false));
  // مخصص لم يُسوَّ حتى asOf: من ترك العمل (pending) ولم تُسجَّل مكافأته ولم يُحدَّد أنه لا مكافأة له،
  // والمتوقف بلا تاريخ ترك العمل (noEnd). amount = مخصصه القائم
  RB.eosbUnsettled = (S, asOf) => {
    asOf = asOf || RB.todayISO();
    const evs = RB.eosbEvents(S);
    const released = new Set(evs.filter((ev) => ev.kind === 'release').map((ev) => ev.employeeId));
    const bal = eosbBal(evs, asOf, true);
    const out = [];
    for (const e of S.employees || []) {
      if (!e) continue;
      const amount = bal[e.id] || 0;
      if (released.has(e.id) || !(amount > 0.005)) continue;
      if (isDay(e.endDate)) {
        if (e.endDate <= asOf) out.push({ employee: e, amount, reason: 'pending' });
      } else if (e.active === false) out.push({ employee: e, amount, reason: 'noEnd' });
    }
    return out;
  };

  // ───────────── تكلفة المواد والوصفات ─────────────
  // تكلفة وحدة الاستخدام من المادة الخام (بعد الهدر، وبالضريبة إن لم يكن المطعم مسجلاً)
  RB.rawUnitCost = (raw, S) => {
    const reg = RB.isVatReg(S.settings, RB.todayISO());
    const vf = reg || !raw.taxable ? 1 : 1 + num(S.settings.vatRate) / 100;
    const pack = num(raw.packQty) || 1;
    const waste = Math.min(Math.max(num(raw.wastePct), 0), 95) / 100;
    return (num(raw.price) * vf) / pack / (1 - waste);
  };

  // errors: التداخل الدائري ({kind, id, path})، وسجل فشل حسابه ({section, id, msg}) فيُعامل بتكلفة صفر
  RB.costing = (S) => {
    const raw = {};
    const errors = [];
    const safe = (section, x, fn) => {
      try {
        fn();
      } catch (e) {
        errors.push({ section, id: x.id, msg: String((e && e.message) || e) });
      }
    };
    good(S.raw).forEach((r) => safe('raw', r, () => (raw[r.id] = RB.rawUnitCost(r, S))));
    const maps = { comp: byId(good(S.composites)), prod: byId(good(S.products)) };
    const memo = { comp: {}, prod: {} };
    function unit(kind, id, stack) {
      if (kind === 'raw') return raw[id] || 0;
      if (!maps[kind]) return 0;
      if (memo[kind][id] !== undefined) return memo[kind][id];
      const key = kind + ':' + id;
      if (stack.includes(key)) {
        errors.push({ kind, id, path: stack.concat(key) });
        return 0;
      }
      const rec = maps[kind][id];
      if (!rec) return 0;
      stack.push(key);
      let total = 0;
      for (const it of rec.items || []) total += num(it.qty) * unit(it.kind, it.id, stack);
      stack.pop();
      const v = kind === 'comp' ? total / (num(rec.yieldQty) || 1) : total;
      memo[kind][id] = v;
      return v;
    }
    good(S.composites).forEach((c) => safe('composites', c, () => unit('comp', c.id, [])));
    good(S.products).forEach((p) => safe('products', p, () => unit('prod', p.id, [])));
    return { raw, comp: memo.comp, prod: memo.prod, errors, unit: (k, id) => unit(k, id, []) };
  };

  // هل يحتوي العنصر (kind,id) — بشكل مباشر أو غير مباشر — على الهدف؟
  RB.contains = (S, kind, id, tKind, tId, depth) => {
    depth = depth || 0;
    if (depth > 40) return true;
    if (kind === tKind && id === tId) return true;
    if (kind === 'raw') return false;
    const rec = (kind === 'comp' ? S.composites : S.products).find((x) => x.id === id);
    if (!rec) return false;
    return (rec.items || []).some((it) => RB.contains(S, it.kind, it.id, tKind, tId, depth + 1));
  };
  // إضافة المكوّن (cKind,cId) إلى (kind,id) تصنع حلقة إن كان المكوّن يحتوي العنصر نفسه
  RB.wouldCycle = (S, kind, id, cKind, cId) => !!id && RB.contains(S, cKind, cId, kind, id);

  // تفكيك منتج أو منتج مجمّع إلى مواد خام (للاستهلاك النظري)
  RB.explode = (S, kind, id, qty, out, depth) => {
    out = out || {};
    depth = depth || 0;
    if (depth > 40 || !qty) return out;
    if (kind === 'raw') {
      out[id] = (out[id] || 0) + qty;
      return out;
    }
    const rec = (kind === 'comp' ? S.composites : S.products).find((x) => x.id === id);
    if (!rec) return out;
    const factor = kind === 'comp' ? qty / (num(rec.yieldQty) || 1) : qty;
    for (const it of rec.items || []) RB.explode(S, it.kind, it.id, num(it.qty) * factor, out, depth + 1);
    return out;
  };

  RB.itemName = (S, kind, id) => {
    const list = kind === 'raw' ? S.raw : kind === 'comp' ? S.composites : S.products;
    const r = (list || []).find((x) => x.id === id);
    return r ? r.name : '(محذوف)';
  };
  // أسطر الوصفة عند الحفظ: السطر بلا مكوّن أو بلا كمية يُحذف، والسطر بكمية ومكوّن غير موجود في قائمة نوعه
  // (نوع تغيّر، أو مكوّن محذوف) يُرفض فلا يُحفظ «(محذوف)» بلا تكلفة. bad: رقم أول سطر غير صالح (من 1) أو 0
  RB.recipeItems = (S, items) => {
    const list = (k) => (k === 'raw' ? S.raw : k === 'comp' ? S.composites : k === 'prod' ? S.products : null) || [];
    const all = Array.isArray(items) ? items : [];
    const i = all.findIndex((r) => r && num(r.qty) && !list(r.kind).some((x) => x && x.id === r.id));
    return { bad: i + 1, items: all.filter((r) => r && r.id && num(r.qty)) };
  };
  RB.itemUnit = (S, kind, id) => {
    if (kind === 'raw') {
      const r = S.raw.find((x) => x.id === id);
      return r ? r.useUnit : '';
    }
    if (kind === 'comp') {
      const c = S.composites.find((x) => x.id === id);
      return c ? c.yieldUnit : '';
    }
    return 'حبة';
  };

  RB.breakdown = (S, rec, kind, C) => {
    C = C || RB.costing(S);
    const lines = (rec.items || []).map((it) => {
      const unit = C.unit(it.kind, it.id);
      return { kind: it.kind, id: it.id, name: RB.itemName(S, it.kind, it.id), unitName: RB.itemUnit(S, it.kind, it.id), qty: num(it.qty), unitCost: unit, cost: unit * num(it.qty) };
    });
    const total = sum(lines, (l) => l.cost);
    lines.forEach((l) => (l.share = total ? (l.cost / total) * 100 : 0));
    const perUnit = kind === 'comp' ? total / (num(rec.yieldQty) || 1) : total;
    return { lines, total, perUnit };
  };

  function roundUp(x, step) {
    step = num(step) || 1;
    return Math.ceil(x / step - 1e-9) * step;
  }

  RB.appChannels = (S) => (S.settings.channels || []).filter((c) => c.type === 'app' && c.active !== false);

  // تحليل منتج المنيو: التكلفة، نسبة تكلفة الطعام، الربح، السعر المقترح، مقارنة السوق، والتطبيقات
  RB.productStats = (S, p, C) => {
    C = C || RB.costing(S);
    const set = S.settings;
    const rate = num(set.vatRate) / 100;
    const reg = RB.isVatReg(set, RB.todayISO());
    const exVat = (x) => (reg ? x / (1 + rate) : x);
    const cost = C.prod[p.id] || 0;
    const price = num(p.price);
    const priceNet = exVat(price);
    const foodCost = priceNet ? (cost / priceNet) * 100 : 0;
    const profit = priceNet - cost;
    const target = num(set.targetFoodCost) / 100;
    const suggested = target > 0 && cost > 0 ? roundUp((cost / target) * (reg ? 1 + rate : 1), set.priceRounding) : 0;
    const comps = (p.competitors || []).map((c) => num(c.price)).filter((x) => x > 0);
    const market = comps.length ? { min: Math.min(...comps), max: Math.max(...comps), avg: sum(comps) / comps.length, n: comps.length } : null;
    const vsMarket = market && price ? ((price - market.avg) / market.avg) * 100 : null;
    // عمولة التطبيق تكلفة؛ ضريبتها تُسترد إن كان المطعم مسجلاً
    const feeK = set.feeVat && !reg ? 1 + rate : 1;
    const appPrice = num(p.appPrice) || price;
    const apps = RB.appChannels(S).map((ch) => {
      const f = num(ch.feePct) / 100;
      const net = exVat(appPrice);
      const commission = appPrice * f * feeK;
      const prof = net - commission - cost;
      // السعر الذي يحقق نفس ربح المحل بعد العمولة
      const div = (reg ? 1 / (1 + rate) : 1) - f * feeK;
      const keepPrice = div > 0 ? roundUp((profit + cost) / div, set.priceRounding) : 0;
      return { id: ch.id, name: ch.name, feePct: num(ch.feePct), commission, profit: prof, margin: net ? (prof / net) * 100 : 0, keepPrice };
    });
    const avgApp = apps.length ? { profit: sum(apps, (a) => a.profit) / apps.length, margin: sum(apps, (a) => a.margin) / apps.length, keepPrice: Math.max(...apps.map((a) => a.keepPrice)) } : null;
    return { cost, price, priceNet, foodCost, profit, margin: priceNet ? (profit / priceNet) * 100 : 0, suggested, market, vsMarket, appPrice, apps, avgApp };
  };

  // ───────────── القيود المحاسبية التلقائية ─────────────
  // كل عملية تتحول إلى قيد مزدوج متوازن؛ القيم الموجبة مدين والسالبة دائن
  RB.channelOf = (S, id) => (S.settings.channels || []).find((c) => c.id === id);

  // تفاصيل مبيعات قناة في يوم: الإجمالي، الضريبة، العمولة، الصافي المستحق. date = تاريخ الإقفال
  RB.saleChannelSplit = (S, chId, v, date) => {
    const set = S.settings;
    const rate = num(set.vatRate) / 100;
    const reg = RB.isVatReg(set, date);
    const ch = RB.channelOf(S, chId) || {};
    const type = v.type || ch.type || 'cash';
    const gross = r2(v.amount);
    const net = reg ? r2(gross / (1 + rate)) : gross;
    const outVat = r2(gross - net);
    const feePct = v.feePct !== undefined && v.feePct !== '' ? num(v.feePct) : num(ch.feePct);
    const fee = type === 'cash' ? 0 : r2((gross * feePct) / 100);
    // ضريبة العمولة محفوظة مع الإقفال (مثل نسبة العمولة)، فتغيير الإعداد لا يغيّر الأيام السابقة
    const feeVat = (v.feeVat !== undefined ? v.feeVat : set.feeVat) ? r2(fee * rate) : 0;
    const receive = r2(gross - fee - feeVat);
    return { type, gross, net, outVat, feePct, fee, feeVat, receive, orders: num(v.orders), reg };
  };

  // للشريك حركات في الدفاتر: رأس مال أو سحب، أو أي قيد على حساب رأس ماله أو مسحوباته (مصروف أو فاتورة أو سداد مورد
  // دفعه من حسابه…)، بأي تاريخ. حذفه يترك هذه القيود على حساب بلا شريك
  RB.partnerUsed = (S, id) =>
    (S.capital || []).some((c) => c && c.partnerId === id) || RB.buildLedger(S, '9999-12-31').entries.some((e) => e.lines.some((l) => l.a === 'cap:' + id || l.a === 'drw:' + id));

  RB.saleTotal = (s) => r2(sum(Object.values(s.channels || {}), (v) => num(v.amount)));
  RB.saleOrders = (s) => sum(Object.values(s.channels || {}), (v) => num(v.orders));

  // ترتيب القيود في اليوم الواحد: الأرصدة الافتتاحية أولاً، وجرد الدرج آخراً (بعد كل حركات الصندوق في يومه)
  const KIND_ORDER = { opening: -1, capital: 0, asset: 1, expense: 2, purchase: 3, advance: 4, payroll: 5, eosb: 6, sale: 7, payout: 8, transfer: 9, supplierpay: 10, vatpay: 11, withdrawal: 12, amort: 13, dep: 14, stock: 15, cashadj: 16 };

  // الأرصدة الافتتاحية بأرقامها: الأصول، والالتزامات (الموردون owed، ومخصص نهاية الخدمة eosb عن خدمة العمال قبل
  // بدء الدفتر، ومجموعهما liab)، وصافيها (حقوق الشركاء الافتتاحية)، أو null إن لم توجد أو بلا تاريخ صالح.
  // eosbBy: مخصص كل موظف (السطر بلا موظف لا يدخل: المخصص لكل موظف على حدة)
  RB.openingInfo = (S) => {
    const o = S && S.settings && S.settings.opening;
    if (!isObj(o) || !RB.isISODate(o.date)) return null;
    const apps = r2(sum(Object.values(isObj(o.apps) ? o.apps : {}), num));
    const payables = (Array.isArray(o.payables) ? o.payables : []).filter((x) => isObj(x) && num(x.amount));
    const owed = r2(sum(payables, (x) => num(x.amount)));
    const eosbBy = {};
    for (const x of Array.isArray(o.eosb) ? o.eosb : []) if (isObj(x) && RB.validId(x.employeeId) && num(x.amount) > 0) eosbBy[x.employeeId] = r2((eosbBy[x.employeeId] || 0) + num(x.amount));
    const eosb = r2(sum(Object.values(eosbBy)));
    const assets = r2(num(o.cash) + num(o.bank) + apps + num(o.inventory) + Math.max(0, num(o.vatCredit)));
    return { date: o.date, cash: num(o.cash), bank: num(o.bank), apps, appsBy: isObj(o.apps) ? o.apps : {}, inventory: num(o.inventory), vatCredit: Math.max(0, num(o.vatCredit)), payables, owed, eosb, eosbBy, liab: r2(owed + eosb), assets, net: r2(assets - owed - eosb) };
  };
  // صافي الأرصدة الافتتاحية موزعاً على الشركاء حسب نسبهم (بالتساوي إن لم تُحدَّد نسب)، والأخير يأخذ فرق التقريب
  RB.openingShares = (S, net) => {
    const ps = (S.partners || []).filter((p) => p && p.id);
    if (!ps.length) return [];
    const tot = sum(ps, (p) => Math.max(0, num(p.share)));
    let left = r2(net);
    return ps.map((p, i) => {
      const v = i === ps.length - 1 ? left : r2((net * (tot ? Math.max(0, num(p.share)) / tot : 1 / ps.length)));
      left = r2(left - v);
      return { partnerId: p.id, amount: v };
    });
  };

  RB.buildLedger = (S, asOf) => {
    asOf = asOf || RB.todayISO();
    const set = S.settings;
    const entries = [];
    const errors = [];
    let rounding = 0;
    // كل سجل على حدة: السجل المعلَّم بخطأ (_bad) لا يدخل، والسجل الذي يفشل حسابه لا يوقف الدفتر —
    // تُحذف قيوده الجزئية ويُسجَّل في errors
    const each = (section, list, fn) => {
      for (const x of list) {
        if (!x || x._bad) continue;
        const mark = entries.length;
        try {
          fn(x);
        } catch (e) {
          entries.length = mark;
          errors.push({ section, id: x.id, msg: String((e && e.message) || e) });
        }
      }
    };

    function add(date, kind, ref, desc, lines) {
      if (!date || date > asOf) return;
      const ls = [];
      // السطر: [الحساب، المبلغ، المبلغ الخاضع للضريبة (اختياري)، بيان السطر (اختياري)]
      for (const l of lines) {
        const v = r2(l[1]);
        if (Math.abs(v) < 0.005) continue;
        const o = { a: l[0], v, base: l[2] !== undefined ? r2(l[2]) : undefined };
        if (l[3]) o.memo = l[3];
        ls.push(o);
      }
      if (!ls.length) return;
      const diff = r2(sum(ls, (l) => l.v));
      if (diff !== 0) {
        const big = ls.reduce((m, l) => (Math.abs(l.v) > Math.abs(m.v) ? l : m), ls[0]);
        big.v = r2(big.v - diff);
        rounding += Math.abs(diff);
      }
      entries.push({ date, kind, ref, desc, lines: ls });
    }

    // الأرصدة الافتتاحية لمطعم قائم: الأصول والالتزامات في تاريخها، وصافيها حقوق للشركاء حسب نسبهم
    const op = RB.openingInfo(S);
    if (op) {
      try {
        const shares = RB.openingShares(S, op.net);
        if (!shares.length && Math.abs(op.net) >= 0.005) throw new Error('أضف الشركاء قبل الأرصدة الافتتاحية');
        add(op.date, 'opening', { s: 'settings', id: 'opening' }, 'أرصدة افتتاحية', [
          ['1101', op.cash],
          ['1102', op.bank],
          ['1103', op.apps],
          ['1104', op.inventory],
          ['2102', op.vatCredit],
          ['2101', -op.owed],
          ['2201', -op.eosb],
          ...shares.map((x) => ['cap:' + x.partnerId, -x.amount]),
        ]);
      } catch (e) {
        errors.push({ section: 'settings', id: 'opening', msg: String((e && e.message) || e) });
      }
    }

    // رأس المال والمسحوبات
    each('capital', S.capital || [], (c) => {
      const amt = num(c.amount);
      const src = RB.srcAcc(c.account);
      const ref = { s: 'capital', id: c.id };
      if (c.type === 'withdrawal') add(c.date, 'withdrawal', ref, 'مسحوبات الشريك' + (c.note ? ' — ' + c.note : ''), [['drw:' + c.partnerId, amt], [src, -amt]]);
      else add(c.date, 'capital', ref, 'إيداع رأس مال' + (c.note ? ' — ' + c.note : ''), [[src, amt], ['cap:' + c.partnerId, -amt]]);
    });

    // الأصول وإهلاكها الشهري
    each('assets', S.assets || [], (a) => {
      const cat = RB.assetCat(a.category);
      const sp = RB.costSplit(a.amount, a.includesVat, RB.assetTaxable(a), set, a.date);
      const ref = { s: 'assets', id: a.id };
      if (RB.isOpeningAsset(a)) {
        // أصل قائم قبل بدء الدفتر: رصيد افتتاحي، قيمته حقوق للشركاء حسب نسبهم (قيد 'opening' لا دفعاً مباشراً من شريك)
        const shares = RB.openingShares(S, sp.cost);
        if (!shares.length && Math.abs(sp.cost) >= 0.005) throw new Error('أضف الشركاء قبل الأصل القائم: قيمته تُسجَّل حقوقاً لهم');
        add(a.date, 'opening', ref, 'أصل قائم (رصيد افتتاحي): ' + a.name, [[cat.acc, sp.cost], ...shares.map((x) => ['cap:' + x.partnerId, -x.amount])]);
      } else add(a.date, 'asset', ref, 'شراء أصل: ' + a.name, [[cat.acc, sp.cost], ['2102', sp.vat, sp.net], [RB.srcAcc(a.account), -sp.gross]]);
      const sched = RB.depSchedule(a, S);
      for (const m of sched.months) add(m.date, 'dep', ref, 'إهلاك: ' + a.name, [['5501', m.amount], ['1290', -m.amount]]);
    });

    // المصاريف التشغيلية (المدفوعة مقدماً توزّع على أشهر التغطية)
    each('expenses', S.expenses || [], (x) => {
      const cat = RB.expenseCat(x.category);
      const sp = RB.costSplit(x.amount, x.includesVat, x.taxable, set, x.date);
      const ref = { s: 'expenses', id: x.id };
      const desc = cat.name + (x.desc ? ': ' + x.desc : '');
      const src = RB.srcAcc(x.account);
      const sched = RB.amortSchedule(x, S);
      const payYm = x.date.slice(0, 7);
      if (sched.months.length === 1 && sched.months[0].ym === payYm) {
        add(x.date, 'expense', ref, desc, [[cat.acc, sp.cost], ['2102', sp.vat, sp.net], [src, -sp.gross]]);
      } else {
        // تغطية في أشهر أخرى: مدفوع مقدماً (1105) ثم تحميل على أشهرها؛ التغطية السابقة للدفع تظهر «مصروفات مستحقة» حتى يُدفع
        const late = sched.months[sched.months.length - 1].ym < payYm;
        add(x.date, 'expense', ref, desc + (late ? ' (عن فترة سابقة)' : ' (مدفوع مقدماً)'), [['1105', sp.cost], ['2102', sp.vat, sp.net], [src, -sp.gross]]);
        for (const m of sched.months) add(m.date, 'amort', ref, 'تحميل شهري — ' + desc, [[cat.acc, m.amount], ['1105', -m.amount]]);
      }
    });

    // المشتريات وسداد الموردين
    each('purchases', S.purchases || [], (p) => {
      const cat = RB.purchaseCat(p.category);
      const sp = RB.costSplit(RB.purchaseTotal(p), p.includesVat, p.taxable, set, p.date);
      add(p.date, 'purchase', { s: 'purchases', id: p.id }, 'مشتريات: ' + (p.supplier || cat.name) + (p.invoiceNo ? ' — فاتورة ' + p.invoiceNo : ''), [[cat.acc, sp.cost], ['2102', sp.vat, sp.net], [RB.srcAcc(p.account), -sp.gross]]);
    });
    each('supplierPayments', S.supplierPayments || [], (p) => {
      const amt = num(p.amount);
      add(p.date, 'supplierpay', { s: 'supplierPayments', id: p.id }, 'سداد مورد: ' + (p.supplier || ''), [['2101', amt], [RB.srcAcc(p.account), -amt]]);
    });

    // الرواتب والتأمينات الاجتماعية: التكلفة على شهر الخدمة مهما كان تاريخ الصرف
    each('payroll', S.payroll || [], (pr) => {
      if (!pr.date) return;
      const t = RB.payrollTotals(pr);
      const ref = { s: 'payroll', id: pr.id };
      const ym = pr.month || pr.date.slice(0, 7);
      const desc = 'رواتب ' + RB.monthName(ym);
      // ما يُحوَّل للموظفين = الصافي − السلف المستقطعة (تُسدّد رصيد سلفهم ولا تغيّر مصروف الرواتب).
      // سلفة أكبر من صافي راتب صاحبها تُستقطع من مكافأة نهاية الخدمة المصروفة له (advEosb): تُقيَّد مع صرف المكافأة،
      // فلا يظهر صافي رواتب سالب (مال داخل للبنك) يقابله صرف مكافأة لم يُدفع منها شيء
      const pay = [
        [RB.srcAcc(pr.account), -(t.netPaid + t.advEosb), undefined, 'صافي الرواتب'],
        ['1106', -(t.adv - t.advEosb), undefined, 'استقطاع سلف العمال'],
        [RB.srcAcc(pr.gosiAccount || pr.account), -(t.gosiEe + t.gosiEr), undefined, 'التأمينات الاجتماعية (حصة العامل والمنشأة)'],
      ];
      if (pr.date.slice(0, 7) === ym) {
        add(pr.date, 'payroll', ref, desc, [['5201', t.gross], ['5202', t.gosiEr], ...pay]);
      } else {
        // استحقاق في آخر شهر الخدمة، وصرف في تاريخه (قبله = مدفوع مقدماً، بعده = مستحق)
        add(RB.monthEnd(ym), 'payroll', ref, 'استحقاق ' + desc, [['5201', t.gross], ['5202', t.gosiEr], ['2103', -t.cost]]);
        add(pr.date, 'payroll', ref, 'صرف ' + desc, [['2103', t.cost], ...pay]);
      }
    });
    // سلف العمال: الصرف أصل على الموظف (1106)، والسداد النقدي يعكسه؛ الاستقطاع من الراتب في قيد المسير
    each('advances', S.advances || [], (a) => {
      const amt = num(a.amount);
      const src = RB.srcAcc(a.account === 'cash' ? 'cash' : 'bank');
      const emp = (S.employees || []).find((e) => e && e.id === a.employeeId);
      const who = emp ? ': ' + emp.name : '';
      const ref = { s: 'advances', id: a.id };
      if (a.kind === 'repay') add(a.date, 'advance', ref, 'سداد سلفة' + who, [[src, amt], ['1106', -amt]]);
      else add(a.date, 'advance', ref, 'سلفة عامل' + who, [['1106', amt], [src, -amt]]);
    });

    // مخصص مكافأة نهاية الخدمة: يُستحق مع كل مسير في تاريخ استحقاق الرواتب، والمكافأة المصروفة تُخصم من المخصص
    let evs = [];
    try {
      evs = RB.eosbEvents(S);
    } catch (e) {
      errors.push({ section: 'payroll', id: '', msg: String((e && e.message) || e) });
    }
    each('payroll', evs, (ev) => {
      // المخصص الافتتاحي في قيد الأرصدة الافتتاحية
      if (ev.kind === 'opening') return;
      if (ev.kind === 'release') {
        // رد ما بقي من مخصص من ترك العمل إلى المصروف
        add(ev.date, 'eosb', ev.ref, 'رد مخصص نهاية الخدمة غير المصروف — ترك العمل' + (ev.name ? ': ' + ev.name : ''), [['2201', ev.amount], ['5203', -ev.amount]]);
        return;
      }
      const ref = { s: 'payroll', id: ev.pr.id };
      if (ev.kind === 'accrual') add(ev.date, 'eosb', ref, 'مخصص نهاية الخدمة — ' + RB.monthName(ev.ym), [['5203', ev.total], ['2201', -ev.total]]);
      else add(ev.date, 'eosb', ref, 'صرف مكافأة نهاية الخدمة' + (ev.name ? ': ' + ev.name : ''), [['2201', ev.fromProv], ['5203', ev.excess], ['1106', -ev.adv, undefined, 'استقطاع سلفة من المكافأة'], [RB.srcAcc(ev.pr.account), -(ev.paid - ev.adv)]]);
    });

    // المبيعات اليومية لكل قناة
    each('sales', S.sales || [], (s) => {
      for (const chId of Object.keys(s.channels || {})) {
        const v = s.channels[chId];
        const x = RB.saleChannelSplit(S, chId, v, s.date);
        if (!x.gross) continue;
        const ch = RB.channelOf(S, chId);
        const recv = x.type === 'cash' ? '1101' : x.type === 'card' ? '1102' : '1103';
        const feeAcc = x.type === 'app' ? '5401' : '5402';
        // ضريبة العمولة تُسترد فقط إن كان المطعم مسجلاً في تاريخ الإقفال
        add(s.date, 'sale', { s: 'sales', id: s.id, ch: chId }, 'مبيعات ' + (ch ? ch.name : chId), [
          [recv, x.receive],
          [feeAcc, x.reg ? x.fee : x.fee + x.feeVat],
          ['2102', x.reg ? x.feeVat : 0, x.fee],
          ['4101', -x.net],
          ['2102', -x.outVat, x.net],
        ]);
      }
    });

    // تحويلات التطبيقات للبنك. خصومات التطبيق حسب نوعها (dedType):
    // sale = عرض أو مرتجع على طلبات العملاء يخفض المبيعات وضريبتها، fee = رسوم بفاتورة ضريبية (ضريبة مدخلات)،
    // other أو بدون نوع (السجلات القديمة) = غرامة أو تسوية بلا ضريبة
    const payRate = num(set.vatRate) / 100;
    each('payouts', S.payouts || [], (p) => {
      const amt = num(p.amount);
      const ded = num(p.deductions);
      const ch = RB.channelOf(S, p.channelId);
      const t = RB.DED_TYPES[p.dedType] ? p.dedType : 'other';
      const on = RB.isVatReg(set, p.date) && (t === 'sale' || t === 'fee');
      const dNet = on ? r2(ded / (1 + payRate)) : ded;
      const dVat = r2(ded - dNet);
      add(p.date, 'payout', { s: 'payouts', id: p.id }, 'تحويل من ' + (ch ? ch.name : 'تطبيق'), [
        ['1102', amt],
        ['5403', dNet],
        ['2102', dVat, t === 'sale' ? -dNet : dNet],
        ['1103', -(amt + ded)],
      ]);
    });

    // التحويل بين الصندوق والبنك
    each('transfers', S.transfers || [], (t) => {
      const amt = num(t.amount);
      add(t.date, 'transfer', { s: 'transfers', id: t.id }, t.from === 'cash' ? 'إيداع نقدية الصندوق في البنك' : 'سحب من البنك إلى الصندوق', [[RB.srcAcc(t.to), amt], [RB.srcAcc(t.from), -amt]]);
    });

    // الجرد: الفرق بين قيمة الجرد ورصيد المخزون قبله (الجرد السابق، ومعه المخزون الافتتاحي لما بعد تاريخه)
    let prevStock = 0;
    let opInv = op && op.inventory ? op.inventory : 0;
    each('stockCounts', good(S.stockCounts).sort((a, b) => (a.date < b.date ? -1 : 1)), (c) => {
      if (opInv && c.date >= op.date) {
        prevStock = r2(prevStock + opInv);
        opInv = 0;
      }
      const value = RB.stockValue(c, S);
      const delta = r2(value - prevStock);
      add(c.date, 'stock', { s: 'stockCounts', id: c.id }, 'جرد المخزون', [['1104', delta], ['5109', -delta]]);
      prevStock = value;
    });

    // جرد الدرج: الفرق المحفوظ (المعدود − المتوقع) يصحح رصيد الصندوق؛ السالب عجز (مصروف) والموجب زيادة
    each('cashCounts', S.cashCounts || [], (c) => {
      const diff = r2(num(c.diff));
      if (Math.abs(diff) < 0.01) return;
      add(c.date, 'cashadj', { s: 'cashCounts', id: c.id }, diff < 0 ? 'عجز الصندوق (جرد الدرج)' : 'زيادة الصندوق (جرد الدرج)', [['1101', diff], ['5316', -diff]]);
    });

    // سداد ضريبة القيمة المضافة
    each('vatPayments', S.vatPayments || [], (v) => {
      const amt = num(v.amount);
      add(v.date, 'vatpay', { s: 'vatPayments', id: v.id }, 'سداد ضريبة القيمة المضافة ' + (v.period || ''), [['2102', amt], [RB.srcAcc(v.account), -amt]]);
    });

    entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (KIND_ORDER[a.kind] || 0) - (KIND_ORDER[b.kind] || 0)));
    return { entries, rounding: r2(rounding), asOf, errors };
  };

  // سعر سطر الجرد للتقييم: الأسعار تُحفظ بدون ضريبة، وغير المسجل في الضريبة في تاريخ الجرد
  // يقيّم المواد الخاضعة شاملة الضريبة لأنها جزء من تكلفتها (كما حُمّلت في المشتريات)
  RB.stockLinePrice = (l, S, date) => {
    const p = num(l.price);
    if (!S || !S.settings || RB.isVatReg(S.settings, date)) return p;
    const raw = (S.raw || []).find((x) => x.id === l.rawId);
    return raw && raw.taxable ? p * (1 + num(S.settings.vatRate) / 100) : p;
  };
  // أسطر الجرد عند الحفظ: السطر بلا مادة يُحذف، وأسطر المادة المكررة تُجمع في سطر واحد (الكميات تُجمع
  // ويبقى سعر السطر الأول). merged: معرّفات المواد التي جُمعت أسطرها
  RB.mergeStockLines = (lines) => {
    const by = new Map();
    const merged = new Set();
    for (const l of Array.isArray(lines) ? lines : []) {
      if (!l || !l.rawId) continue;
      const a = by.get(l.rawId);
      if (!a) by.set(l.rawId, Object.assign({}, l));
      else {
        a.qty = +(num(a.qty) + num(l.qty)).toFixed(6);
        merged.add(l.rawId);
      }
    }
    return { lines: [...by.values()], merged: [...merged] };
  };
  RB.stockValue = (c, S) => r2(sum(c.lines || [], (l) => num(l.qty) * RB.stockLinePrice(l, S, c.date)));

  // جدول إهلاك الأصل: يبدأ من تاريخ الافتتاح إن كان الأصل اشتُري قبله
  RB.depSchedule = (a, S) => {
    const cat = RB.assetCat(a.category);
    const life = Math.round(num(a.lifeMonths));
    const sp = RB.costSplit(a.amount, a.includesVat, RB.assetTaxable(a), S.settings, a.date);
    const base = r2(sp.cost - num(a.salvage));
    const out = { cost: sp.cost, base, life, monthly: 0, months: [] };
    if (cat.life === 0 || life <= 0 || base <= 0) return out;
    const open = S.settings.openingDate;
    const start = a.depStart || (open && open > a.date ? open : a.date);
    const monthly = r2(base / life);
    out.monthly = monthly;
    let acc = 0;
    for (let i = 0; i < life; i++) {
      const ym = RB.ymAdd(start.slice(0, 7), i);
      const amount = i === life - 1 ? r2(base - acc) : monthly;
      acc = r2(acc + amount);
      out.months.push({ ym, date: i === 0 ? start : ym + '-01', amount });
    }
    return out;
  };

  // جدول تحميل المصروف المدفوع مقدماً على الأشهر
  RB.amortSchedule = (x, S) => {
    const sp = RB.costSplit(x.amount, x.includesVat, x.taxable, S.settings, x.date);
    const months = Math.max(1, Math.round(num(x.months) || 1));
    const start = x.startDate || x.date;
    const out = { cost: sp.cost, months: [], end: RB.coverageEnd(start, months) };
    if (months === 1) {
      // شهر واحد: يُحمّل على شهر بداية التغطية (فاتورة سبتمبر المدفوعة في أكتوبر تُحمّل على سبتمبر)
      const sym = start.slice(0, 7);
      out.months.push({ ym: sym, date: sym === x.date.slice(0, 7) ? x.date : start, amount: sp.cost });
      return out;
    }
    const monthly = r2(sp.cost / months);
    let acc = 0;
    for (let i = 0; i < months; i++) {
      const ym = RB.ymAdd(start.slice(0, 7), i);
      let date = ym + '-01';
      if (ym === x.date.slice(0, 7) && x.date > date) date = x.date;
      const amount = i === months - 1 ? r2(sp.cost - acc) : monthly;
      acc = r2(acc + amount);
      out.months.push({ ym, date, amount });
    }
    return out;
  };

  // السنة المالية التي تخصها زكاة تُدفع في تاريخ date: السنة السابقة لسنة الدفع ({startDate, months}).
  // إن افتُتح المطعم أثناء تلك السنة فسنته الزكوية الأولى من الافتتاح: لا يُحمَّل منها شيء على أشهر ما قبل الافتتاح
  RB.zakatCoverage = (set, date) => {
    const y = +(RB.isISODate(date) && date >= '2000' ? date : RB.todayISO()).slice(0, 4) - 1;
    const open = set && set.openingDate;
    if (RB.isISODate(open) && open > y + '-01-01' && open <= y + '-12-31') return { startDate: open, months: 13 - +open.slice(5, 7) };
    return { startDate: y + '-01-01', months: 12 };
  };

  // أرصدة الحسابات في فترة (أو حتى تاريخ إن لم تُحدد البداية)
  RB.balances = (entries, from, to) => {
    const b = {};
    for (const e of entries) {
      if (from && e.date < from) continue;
      if (to && e.date > to) continue;
      for (const l of e.lines) b[l.a] = r2((b[l.a] || 0) + l.v);
    }
    return b;
  };

  // ───────────── التقارير ─────────────
  // عدد الأشهر في فترة: لكل شهر تقويمي تلمسه الفترة (الأيام المغطاة ÷ أيام ذلك الشهر)، فالشهر الكامل = 1 بالضبط
  RB.monthsIn = (from, to) => {
    let total = 0;
    if (from && to && from <= to) {
      for (let ym = from.slice(0, 7); ym <= to.slice(0, 7); ym = RB.ymAdd(ym, 1)) {
        const end = RB.monthEnd(ym);
        const a = from > ym + '-01' ? from : ym + '-01';
        const b = to < end ? to : end;
        total += (RB.daysBetween(a, b) + 1) / +end.slice(8, 10);
      }
    }
    return total > 0 ? total : 1 / 31;
  };
  // عدد الأشهر لمتوسط المحمّل شهرياً: الإيجار والمدفوع مقدماً والإهلاك تُحمّل كاملة أول كل شهر،
  // فالشهر الذي دخل أول يومه في الفترة يُحسب كاملاً ولو لم ينتهِ (الشهر الجاري أو فترة تنتهي منتصف الشهر)
  RB.chargeMonths = (from, to) => RB.monthsIn(from, RB.monthEnd(to.slice(0, 7)));

  RB.incomeStatement = (S, from, to, L) => {
    L = L || RB.buildLedger(S, to);
    const b = RB.balances(L.entries, from, to);
    const groups = { cogs: [], sell: [], labor: [], occ: [], opex: [], dep: [], zakat: [] };
    let revenue = 0;
    for (const code of Object.keys(b)) {
      const info = RB.accInfo(code, S);
      if (info.type === 'R') revenue += -b[code];
      if (info.type !== 'X') continue;
      const g = groups[info.group] ? info.group : 'opex';
      groups[g].push({ code, name: info.name, amount: b[code] });
    }
    const tot = {};
    for (const g of Object.keys(groups)) {
      groups[g].sort((a, b2) => b2.amount - a.amount);
      tot[g] = r2(sum(groups[g], (x) => x.amount));
    }
    revenue = r2(revenue);
    const grossProfit = r2(revenue - tot.cogs);
    const expenses = r2(tot.sell + tot.labor + tot.occ + tot.opex + tot.dep);
    // الزكاة بعد صافي الربح التشغيلي: صافي الربح قبل الزكاة − الزكاة = صافي الربح بعد الزكاة
    const netBeforeZakat = r2(grossProfit - expenses);
    const zakat = tot.zakat;
    const net = r2(netBeforeZakat - zakat);
    const pctOf = (x) => (revenue ? (x / revenue) * 100 : 0);
    return {
      from, to, revenue, groups, tot, grossProfit, expenses, netBeforeZakat, zakat, net,
      ratios: {
        foodCost: pctOf(tot.cogs),
        labor: pctOf(tot.labor),
        prime: pctOf(tot.cogs + tot.labor),
        occupancy: pctOf(tot.occ),
        sell: pctOf(tot.sell),
        netMargin: pctOf(net),
      },
    };
  };

  RB.balanceSheet = (S, asOf, L) => {
    L = L || RB.buildLedger(S, asOf);
    const b = RB.balances(L.entries, null, asOf);
    const cur = [];
    const fixed = [];
    const liab = [];
    const equity = [];
    let retained = 0;
    for (const code of Object.keys(b).sort()) {
      const v = b[code];
      if (Math.abs(v) < 0.005) continue;
      const info = RB.accInfo(code, S);
      if (info.type === 'R' || info.type === 'X') {
        retained += -v;
        continue;
      }
      if (code === '1105' && v < 0) liab.push({ code, name: 'مصروفات مستحقة (لم تُدفع بعد)', amount: -v });
      else if (code === '2103' && v > 0) cur.push({ code, name: 'رواتب مدفوعة مقدماً', amount: v });
      else if (code === '2102' && v > 0) cur.push({ code, name: 'ضريبة قيمة مضافة مستردة', amount: v });
      else if (info.type === 'A') (info.group === 'fixed' ? fixed : cur).push({ code, name: info.name, amount: v });
      else if (info.type === 'L') liab.push({ code, name: info.name, amount: -v });
      else equity.push({ code, name: info.name, amount: -v, partnerId: info.partnerId });
    }
    retained = r2(retained);
    equity.push({ code: 'RE', name: 'الأرباح (الخسائر) المتراكمة', amount: retained });
    const tCur = r2(sum(cur, (x) => x.amount));
    const tFixed = r2(sum(fixed, (x) => x.amount));
    const tLiab = r2(sum(liab, (x) => x.amount));
    const tEq = r2(sum(equity, (x) => x.amount));
    return { asOf, cur, fixed, liab, equity, retained, tCur, tFixed, tAssets: r2(tCur + tFixed), tLiab, tEq, check: r2(tCur + tFixed - tLiab - tEq) };
  };

  // disp: رمز الحساب للعرض (حسابات الشركاء 31xx و32xx بدل معرّفاتها الداخلية)، والترتيب به
  RB.trialBalance = (S, from, to, L) => {
    L = L || RB.buildLedger(S, to);
    const b = RB.balances(L.entries, from, to);
    const rows = Object.keys(b)
      .filter((c) => Math.abs(b[c]) >= 0.005)
      .map((code) => {
        const info = RB.accInfo(code, S);
        return { code, disp: info.disp || code, name: info.name, type: info.type, dr: b[code] > 0 ? b[code] : 0, cr: b[code] < 0 ? -b[code] : 0 };
      })
      .sort((x, y) => (x.disp < y.disp ? -1 : x.disp > y.disp ? 1 : x.code < y.code ? -1 : 1));
    return { rows, dr: r2(sum(rows, (r) => r.dr)), cr: r2(sum(rows, (r) => r.cr)) };
  };

  // الرصيد المتوقع في درج الصندوق نهاية يوم: رصيد 1101 في الدفتر حتى نهاية التاريخ، بلا فرق جرد الدرج exceptId نفسه
  RB.cashExpected = (L, date, exceptId) => {
    let b = 0;
    for (const e of L.entries) {
      if (e.date > date) continue;
      if (exceptId && e.ref && e.ref.s === 'cashCounts' && e.ref.id === exceptId) continue;
      for (const l of e.lines) if (l.a === '1101') b += l.v;
    }
    return r2(b);
  };
  // المتوقع لجرد الدرج c ({id, date}) من الدفتر الحالي: رصيد الصندوق نهاية يومه بلا فرقه هو، ولا فروق ما بعده من جرود
  // اليوم نفسه (بترتيب المعرّف؛ معرّف الجرد الجديد أكبر من معرّفات ما قبله). كما يُحسب عند حفظ الجرد
  const cntBefore = (a, b) => a.date < b.date || (a.date === b.date && String(a.id) < String(b.id));
  RB.cashCountExpected = (S, L, c) => {
    const cs = byId(good(S.cashCounts));
    let b = 0;
    for (const e of L.entries) {
      if (e.date > c.date) break;
      if (e.ref && e.ref.s === 'cashCounts' && (String(e.ref.id) === String(c.id) || !(cs[e.ref.id] && cntBefore(cs[e.ref.id], c)))) continue;
      for (const l of e.lines) if (l.a === '1101') b += l.v;
    }
    return r2(b);
  };
  // جرود الدرج التي تغيّر الدفتر بعدها (حركة نقدية بتاريخها أو قبله سُجّلت أو عُدّلت بعد حفظها): المتوقع المحفوظ
  // لا يساوي المتوقع الآن، فالفرق المسجل لم يعد يجعل الصندوق = المعدود. [{count, expected (الآن)}] بترتيب التاريخ
  RB.staleCashCounts = (S, L) => {
    const cs = good(S.cashCounts)
      .filter((c) => RB.isISODate(c.date))
      .sort((a, b) => (cntBefore(a, b) ? -1 : cntBefore(b, a) ? 1 : 0));
    if (!cs.length) return [];
    // رصيد الصندوق بلا فروق الجرد في نهاية كل يوم فيه حركة، وفرق كل جرد كما قُيّد
    const adj = {};
    const days = [];
    let run = 0;
    for (const e of L.entries) {
      let v = 0;
      for (const l of e.lines) if (l.a === '1101') v += l.v;
      if (!v) continue;
      if (e.ref && e.ref.s === 'cashCounts') adj[e.ref.id] = (adj[e.ref.id] || 0) + v;
      else {
        run += v;
        if (days.length && days[days.length - 1][0] === e.date) days[days.length - 1][1] = run;
        else days.push([e.date, run]);
      }
    }
    const out = [];
    let i = -1;
    let before = 0;
    for (const c of cs) {
      while (i + 1 < days.length && days[i + 1][0] <= c.date) i++;
      const expected = r2((i >= 0 ? days[i][1] : 0) + before);
      before += adj[c.id] || 0;
      if (Math.abs(expected - num(c.expected)) >= 0.01) out.push({ count: c, expected });
    }
    return out;
  };

  // أول يوم ينتهي فيه رصيد الحساب acc بالسالب (أقل من −0.5) في الفترة from..to من قيود الدفتر L: بلا قيود السجل
  // o.except ({s, id}) ومعها قيود o.extra (السجل كما في النموذج قبل حفظه). يرجع {date, balance, since, sinceBalance}
  // أو null: date أول يوم سالب في الفترة (from نفسه إن كان سالباً قبلها) ورصيده، وsince بداية هذا السالب (قد تسبق from) ورصيده
  RB.firstNegative = (L, acc, from, to, o) => {
    o = o || {};
    const ex = o.except;
    const day = {};
    const put = (e) => {
      if (e.date > to) return;
      let v = 0;
      for (const l of e.lines) if (l.a === acc) v += l.v;
      if (v) day[e.date] = (day[e.date] || 0) + v;
    };
    for (const e of L.entries) if (!(ex && e.ref && e.ref.s === ex.s && String(e.ref.id) === String(ex.id))) put(e);
    for (const e of o.extra || []) put(e);
    const dates = Object.keys(day).sort();
    let bal = 0;
    let since = '';
    let sinceBalance = 0;
    for (let i = 0; i < dates.length; i++) {
      bal = r2(bal + day[dates[i]]);
      if (bal >= -0.5) {
        since = '';
        continue;
      }
      if (!since) {
        since = dates[i];
        sinceBalance = bal;
      }
      // رصيد اليوم يبقى حتى اليوم السابق لحركة تالية: يدخل الفترة إن امتد إلى from
      if (i + 1 < dates.length && dates[i + 1] <= from) continue;
      return { date: dates[i] > from ? dates[i] : from, balance: bal, since, sinceBalance };
    }
    return null;
  };

  // كشف حساب (الصندوق أو البنك أو غيرهما)
  RB.accountStatement = (S, acc, from, to, L) => {
    L = L || RB.buildLedger(S, to);
    let opening = 0;
    const rows = [];
    for (const e of L.entries) {
      if (e.date > to) continue;
      for (const l of e.lines) {
        if (l.a !== acc) continue;
        if (from && e.date < from) opening = r2(opening + l.v);
        else rows.push({ date: e.date, desc: l.memo ? e.desc + ' — ' + l.memo : e.desc, kind: e.kind, ref: e.ref, in: l.v > 0 ? l.v : 0, out: l.v < 0 ? -l.v : 0 });
      }
    }
    // في اليوم الواحد: الداخل قبل الخارج، فلا يظهر رصيد سالب وهمي أثناء اليوم (الترتيب ثابت فيما عداه)؛
    // وجرد الدرج آخر يومه عجزاً كان أو زيادة، فرصيد سطره = المعدود
    const adj = (r) => (r.kind === 'cashadj' ? 1 : 0);
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : adj(a) - adj(b) || (b.in > 0) - (a.in > 0)));
    let bal = opening;
    rows.forEach((r) => {
      bal = r2(bal + r.in - r.out);
      r.balance = bal;
    });
    return { opening, rows, closing: bal, totIn: r2(sum(rows, (r) => r.in)), totOut: r2(sum(rows, (r) => r.out)) };
  };

  RB.vatPeriodsBetween = (S, from, to) => {
    const q = S.settings.vatPeriod !== 'monthly';
    const out = [];
    // لا فترات إقرار قبل تاريخ سريان التسجيل
    const regFrom = S.settings.vatRegistered && S.settings.vatRegisteredFrom;
    if (regFrom && from < regFrom) from = regFrom;
    if (from > to) return out;
    let ym = from.slice(0, 7);
    if (q) ym = ym.slice(0, 5) + String(Math.floor((+ym.slice(5, 7) - 1) / 3) * 3 + 1).padStart(2, '0');
    while (ym <= to.slice(0, 7)) {
      const endYm = q ? RB.ymAdd(ym, 2) : ym;
      const key = q ? ym.slice(0, 4) + '-Q' + (Math.floor((+ym.slice(5, 7) - 1) / 3) + 1) : ym;
      const label = q ? 'الربع ' + ['الأول', 'الثاني', 'الثالث', 'الرابع'][Math.floor((+ym.slice(5, 7) - 1) / 3)] + ' ' + ym.slice(0, 4) : RB.monthName(ym);
      out.push({ key, label, from: ym + '-01', to: RB.monthEnd(endYm) });
      ym = RB.ymAdd(endYm, 1);
    }
    return out;
  };

  // إقرار ضريبة القيمة المضافة لفترة
  RB.vatReport = (S, from, to, L) => {
    L = L || RB.buildLedger(S, to);
    const out = { sales: { base: 0, vat: 0 }, inputs: {}, inBase: 0, inVat: 0, paid: 0 };
    const labels = { purchase: 'المشتريات', expense: 'المصاريف التشغيلية', asset: 'الأصول والمعدات', sale: 'عمولات التطبيقات ورسوم الشبكة', payout: 'عمولات التطبيقات ورسوم الشبكة' };
    for (const e of L.entries) {
      // الرصيد الدائن الافتتاحي من إقرار قبل الدفتر لا يدخل في إقرار الفترة (يُرحّل في RB.vatReturns)
      if (e.date < from || e.date > to || e.kind === 'opening') continue;
      for (const l of e.lines) {
        if (l.a !== '2102') continue;
        if (e.kind === 'vatpay') {
          out.paid = r2(out.paid + l.v);
          continue;
        }
        // خصم العروض والمرتجعات من التطبيق (أساس سالب) يخفض ضريبة المبيعات وأساسها
        if (l.v < 0 || (e.kind === 'payout' && (l.base || 0) < 0)) {
          out.sales.vat = r2(out.sales.vat - l.v);
          out.sales.base = r2(out.sales.base + (l.base || 0));
        } else {
          const k = labels[e.kind] || 'أخرى';
          out.inputs[k] = out.inputs[k] || { base: 0, vat: 0 };
          out.inputs[k].vat = r2(out.inputs[k].vat + l.v);
          out.inputs[k].base = r2(out.inputs[k].base + (l.base || 0));
          out.inVat = r2(out.inVat + l.v);
          out.inBase = r2(out.inBase + (l.base || 0));
        }
      }
    }
    out.net = r2(out.sales.vat - out.inVat);
    return out;
  };

  // رصيد حساب الضريبة في تاريخ: موجب = مستحق للهيئة، سالب = رصيد دائن مرحّل لصالح المطعم
  RB.vatBalanceAt = (S, date, L) => {
    L = L || RB.buildLedger(S, date);
    return r2(-(RB.balances(L.entries, null, date)['2102'] || 0));
  };
  // مدى فترة الإقرار من اسمها («الربع الثاني 2026» أو «مايو 2026»)، أياً كانت فترة الإقرار الحالية
  RB.vatLabelRange = (label) => {
    const y = /(\d{4})/.exec(String(label || ''));
    if (!y) return null;
    for (let m = 1; m <= 12; m++) {
      const ym = y[1] + '-' + String(m).padStart(2, '0');
      if (RB.monthName(ym) === label) return { from: ym + '-01', to: RB.monthEnd(ym) };
    }
    const q = ['الأول', 'الثاني', 'الثالث', 'الرابع'].findIndex((n) => label === 'الربع ' + n + ' ' + y[1]);
    if (q < 0) return null;
    const s = y[1] + '-' + String(q * 3 + 1).padStart(2, '0');
    return { from: s + '-01', to: RB.monthEnd(RB.ymAdd(s, 2)) };
  };
  // الإقرارات بالترتيب حتى تاريخ: مستحق كل فترة وحده، ولا يُرحّل إلا ما هو لصالح المطعم:
  // الرصيد الدائن من الإقرار (مدخلات أكبر من المخرجات) والدفعة الزائدة عن المستحق.
  // السداد يُنسب لفترته (period) مهما كان تاريخه، والمبلغ السالب استرداد من الهيئة.
  // سداد باسم فترة غير موجودة الآن (تغيّرت فترة الإقرار أو تاريخ السريان) يُنسب للفترات التي يغطيها مداه،
  // ويملأ مستحقها بالترتيب والباقي على آخرها؛ وما لا يُعرف مداه يُنسب لآخر فترة انتهت قبل تاريخ السداد.
  // سداد لفترة قبل بداية الإقرارات (قبل بدء الدفتر، أو قبل تاريخ سريان نُقل لاحقاً) لا يُخصم من أي إقرار،
  // لأن ضريبة تلك الفترة ليست في الدفتر؛ يُعاد في out.before للعلم فقط.
  RB.vatReturns = (S, upTo, L) => {
    L = L || RB.buildLedger(S, upTo);
    // بداية الإقرارات: أول عملية فيها ضريبة؛ قيد السداد وحده لا يبدأها (سداد قبل أول عملية هو لفترة قبل الدفتر)
    let start = '';
    for (const e of L.entries) {
      if (e.date > upTo) break;
      if (e.kind !== 'vatpay' && e.kind !== 'opening' && e.lines.some((l) => l.a === '2102')) {
        start = e.date;
        break;
      }
    }
    const regFrom = S.settings.vatRegisteredFrom;
    if (start && regFrom && regFrom > start) start = regFrom;
    const pers = start ? RB.vatPeriodsBetween(S, start, upTo) : [];
    const firstFrom = pers.length ? pers[0].from : '';
    const own = pers.map(() => []);
    const loose = [];
    const before = [];
    for (const x of good(S.vatPayments)) {
      const amt = num(x.amount);
      if (!amt) continue;
      const i = pers.findIndex((q) => q.label === x.period);
      if (i >= 0) {
        own[i].push(amt);
        continue;
      }
      const rg = RB.vatLabelRange(x.period);
      let idx;
      if (rg) {
        if (rg.from > upTo) continue; // فترة لم تأتِ بعد في هذا العرض
        idx = pers.map((q, j) => (q.to >= rg.from && q.from <= rg.to ? j : -1)).filter((j) => j >= 0);
      } else {
        const j = pers.map((q) => q.to < (x.date || '')).lastIndexOf(true);
        // اسم غير معروف بتاريخ داخل أول إقرار: يُنسب له؛ وبتاريخ قبل بداية الإقرارات: لفترة قبل الدفتر
        idx = j >= 0 ? [j] : firstFrom && (x.date || '') >= firstFrom ? [0] : [];
      }
      if (!idx.length) {
        before.push({ id: x.id, date: x.date || '', period: x.period || '', amount: amt });
        continue;
      }
      loose.push({ idx, left: amt });
    }
    const out = [];
    out.before = before;
    if (!pers.length) return out;
    let credit = 0;
    // رصيد دائن افتتاحي (من إقرار قبل بدء الدفتر): يُرحّل إلى أول إقرار ينتهي في تاريخ الأرصدة الافتتاحية أو بعده
    const op = RB.openingInfo(S);
    let opCredit = op && op.vatCredit > 0 && op.date <= upTo ? op.vatCredit : 0;
    pers.forEach((q, i) => {
      if (opCredit && q.to >= op.date) {
        credit = r2(credit + opCredit);
        opCredit = 0;
      }
      // الفترة الجارية حتى upTo فقط: الدفتر المعطى قد يمتد بعده (دفتر واحد لكل نسخة من البيانات)
      const report = RB.vatReport(S, q.from, q.to < upTo ? q.to : upTo, L);
      const carried = credit ? -credit : 0;
      const x = r2(report.net - credit);
      const due = Math.max(0, x);
      let paid = r2(sum(own[i].filter((a) => a > 0)));
      let refund = r2(-sum(own[i].filter((a) => a < 0)));
      for (const o of loose) {
        if (!o.left || !o.idx.includes(i)) continue;
        const last = i === o.idx[o.idx.length - 1];
        if (o.left < 0) {
          // الاسترداد على آخر فترة يغطيها
          if (last) {
            refund = r2(refund - o.left);
            o.left = 0;
          }
          continue;
        }
        const need = Math.max(0, r2(due + refund - Math.max(0, -x) - paid));
        const give = last ? o.left : Math.min(o.left, need);
        paid = r2(paid + give);
        o.left = r2(o.left - give);
      }
      // الموقف بعد السداد: موجب = لصالح المطعم يُرحّل، سالب = متبقٍ على هذه الفترة
      const bal = r2(Math.max(0, -x) + paid - refund - due);
      credit = Math.max(0, bal);
      const remaining = Math.max(0, -bal);
      out.push(Object.assign({}, q, { report, net: report.net, carried, due, credit, paid, refund, over: Math.max(0, r2(paid - refund - due)), remaining, settled: remaining <= 0.01 }));
    });
    return out;
  };
  // المستحق لفترة إقرار مع ترحيل الرصيد الدائن من الفترات السابقة
  RB.vatDue = (S, p, L) => {
    L = L || RB.buildLedger(S, p.to);
    const row = RB.vatReturns(S, p.to, L).find((r) => r.key === p.key);
    if (row) return row;
    const report = { sales: { base: 0, vat: 0 }, inputs: {}, inBase: 0, inVat: 0, paid: 0, net: 0 };
    return Object.assign({}, p, { report, net: 0, carried: 0, due: 0, credit: 0, paid: 0, refund: 0, over: 0, remaining: 0, settled: true });
  };

  // ملخص مبيعات القنوات في فترة
  RB.salesByChannel = (S, from, to) => {
    const out = {};
    const days = {};
    for (const s of good(S.sales)) {
      if (s.date < from || s.date > to) continue;
      for (const chId of Object.keys(s.channels || {})) {
        const x = RB.saleChannelSplit(S, chId, s.channels[chId], s.date);
        if (!x.gross && !x.orders) continue;
        const o = (out[chId] = out[chId] || { id: chId, gross: 0, net: 0, vat: 0, fee: 0, receive: 0, orders: 0, type: x.type });
        o.gross = r2(o.gross + x.gross);
        o.net = r2(o.net + x.net);
        o.vat = r2(o.vat + x.outVat);
        o.fee = r2(o.fee + x.fee + x.feeVat);
        o.receive = r2(o.receive + x.receive);
        o.orders += x.orders;
      }
      days[s.date] = r2((days[s.date] || 0) + RB.saleTotal(s));
    }
    const list = Object.values(out).map((o) => {
      const ch = RB.channelOf(S, o.id);
      o.name = ch ? ch.name : o.id;
      o.avgTicket = o.orders ? o.gross / o.orders : 0;
      return o;
    });
    list.sort((a, b) => b.gross - a.gross);
    const total = {
      gross: r2(sum(list, (o) => o.gross)),
      net: r2(sum(list, (o) => o.net)),
      vat: r2(sum(list, (o) => o.vat)),
      fee: r2(sum(list, (o) => o.fee)),
      orders: sum(list, (o) => o.orders),
    };
    total.avgTicket = total.orders ? total.gross / total.orders : 0;
    return { list, total, days };
  };

  // رصيد مستحقات كل تطبيق توصيل حتى تاريخ
  RB.appReceivables = (S, asOf) => {
    const out = {};
    // المستحق الافتتاحي من كل تطبيق (مبيعات قبل بدء الدفتر لم تُحوَّل بعد)
    const op = RB.openingInfo(S);
    if (op && op.date <= asOf) for (const id of Object.keys(op.appsBy)) if (num(op.appsBy[id])) out[id] = r2((out[id] || 0) + num(op.appsBy[id]));
    for (const s of good(S.sales)) {
      if (s.date > asOf) continue;
      for (const chId of Object.keys(s.channels || {})) {
        const x = RB.saleChannelSplit(S, chId, s.channels[chId], s.date);
        if (x.type !== 'app') continue;
        out[chId] = r2((out[chId] || 0) + x.receive);
      }
    }
    for (const p of good(S.payouts)) {
      if (p.date > asOf) continue;
      out[p.channelId] = r2((out[p.channelId] || 0) - num(p.amount) - num(p.deductions));
    }
    return Object.keys(out).map((id) => {
      const ch = RB.channelOf(S, id);
      const last = good(S.payouts).filter((p) => p.channelId === id && p.date <= asOf).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      return { id, name: ch ? ch.name : id, balance: out[id], lastPayout: last ? last.date : '' };
    });
  };

  // أرصدة الموردين الآجلة: المشتريات والأصول والمصاريف المسجلة «آجل»، ناقص السداد.
  // purchases = إجمالي المستحق الآجل (شامل الضريبة)، يطابق رصيد حساب 2101
  RB.supplierBalances = (S, asOf) => {
    const out = {};
    const set = S.settings;
    const owe = (name, amount) => {
      const k = (name || 'بدون اسم').trim() || 'بدون اسم';
      out[k] = out[k] || { supplier: k, purchases: 0, paid: 0 };
      out[k].purchases = r2(out[k].purchases + amount);
    };
    // المستحق الافتتاحي للموردين (فواتير قبل بدء الدفتر)
    const op = RB.openingInfo(S);
    if (op && op.date <= asOf) for (const x of op.payables) owe(x.supplier, num(x.amount));
    for (const p of good(S.purchases)) {
      if (p.account !== 'payable' || p.date > asOf) continue;
      owe(p.supplier, RB.costSplit(RB.purchaseTotal(p), p.includesVat, p.taxable, set, p.date).gross);
    }
    for (const a of good(S.assets)) {
      if (a.account !== 'payable' || a.date > asOf) continue;
      owe(a.supplier, RB.costSplit(a.amount, a.includesVat, RB.assetTaxable(a), set, a.date).gross);
    }
    for (const x of good(S.expenses)) {
      if (x.account !== 'payable' || x.date > asOf) continue;
      owe(x.entity, RB.costSplit(x.amount, x.includesVat, x.taxable, set, x.date).gross);
    }
    for (const p of good(S.supplierPayments)) {
      if (p.date > asOf) continue;
      const k = (p.supplier || 'بدون اسم').trim() || 'بدون اسم';
      out[k] = out[k] || { supplier: k, purchases: 0, paid: 0 };
      out[k].paid = r2(out[k].paid + num(p.amount));
    }
    return Object.values(out).map((o) => Object.assign(o, { balance: r2(o.purchases - o.paid) }));
  };

  // متابعة التجديد: آخر تغطية لكل بند حكومي أو اشتراك أو عقد، ويُتابع إن كان آخر سجل له يغطي 3 أشهر فأكثر
  // (والزكاة دائماً). لا يُتابع البند إن كان آخر سجل له رسماً لمرة واحدة (oneOff) أو أوقف المستخدم متابعته
  // (noRenew؛ تجديده لاحقاً يعيده) أو يغطي أقل من 3 أشهر، فلا يظهر سجل أقدم منه منتهياً.
  // ولا تُتابع رسوم عامل غادر أو حُذف أو انتهى عمله قبل نهاية التغطية
  RB.renewals = (S, today) => {
    today = today || RB.todayISO();
    const groups = {};
    for (const x of good(S.expenses)) {
      if (!x.date) continue;
      const months = Math.round(num(x.months) || 1);
      if (months < 1) continue;
      const zakat = x.category === 'zakat';
      const key = [x.category, (x.entity || '').trim(), (x.desc || '').trim(), x.employeeId || ''].join('|');
      // الزكاة تُدفع عن سنة سابقة: التذكير سنوي من تاريخ الدفع لا من بداية السنة التي تخصها
      const end = zakat ? RB.coverageEnd(x.date, 12) : RB.coverageEnd(x.startDate || x.date, months);
      if (!groups[key] || groups[key].end < end) groups[key] = { key, rec: x, end, short: months < 3 && !zakat };
    }
    const emps = byId(S.employees);
    const staffGone = (g) => {
      if (!g.rec.employeeId) return false;
      const e = emps[g.rec.employeeId];
      return !e || e.active === false || (!!e.endDate && e.endDate <= g.end);
    };
    return Object.values(groups)
      .filter((g) => !g.short && !g.rec.oneOff && !g.rec.noRenew && !staffGone(g))
      .map((g) => {
        const days = RB.daysBetween(today, g.end);
        const status = days < 0 ? 'expired' : days <= 30 ? 'soon' : 'ok';
        return { rec: g.rec, end: g.end, days, status };
      })
      .sort((a, b) => a.days - b.days);
  };

  // خطوات البداية لدفتر جديد بالترتيب، وكل منها مكتملة إن سُجّل في قسمها شيء. مراجعة الإعدادات تكتمل بحفظ
  // أي نموذج إعدادات أو قناة بيع (settings.reviewedAt)، أو بوجود إقفال يومي: هي مطلوبة قبل أول إقفال، والدفتر
  // المستخدم قبل وجود reviewedAt فيه إقفالات. optional: لا تُبقي القائمة ظاهرة وحدها.
  // pending: خطوة مطلوبة لم تكتمل بعد
  RB.setupSteps = (S) => {
    const has = (k, f) => good(S[k]).some(f || (() => true));
    const fixed = (x) => x.category === 'rent' || x.category === 'housing' || RB.GOV_CATS.includes(x.category);
    const steps = [
      { id: 'settings', done: !!(S.settings && S.settings.reviewedAt) || has('sales') },
      // المطعم القائم يبدأ برأس ماله من الأرصدة الافتتاحية
      { id: 'capital', done: has('capital', (c) => c.type !== 'withdrawal') || !!RB.openingInfo(S) },
      { id: 'assets', done: has('assets') },
      { id: 'fixed', done: has('expenses', fixed) },
      { id: 'staff', done: has('employees') },
      { id: 'raw', done: has('raw') },
      { id: 'composites', done: has('composites'), optional: true },
      { id: 'products', done: has('products') },
      { id: 'sales', done: has('sales') },
    ];
    return { steps, done: steps.filter((s) => s.done).length, pending: steps.some((s) => !s.optional && !s.done) };
  };

  // الشركاء: المساهمات، المسحوبات، ونصيب الربح
  RB.partnersReport = (S, from, to, L) => {
    L = L || RB.buildLedger(S, to);
    const all = RB.balances(L.entries, null, to);
    const inc = RB.incomeStatement(S, from, to, L);
    const bs = RB.balanceSheet(S, to, L);
    const totalShare = sum(S.partners || [], (p) => num(p.share));
    const totalCap = r2(sum(S.partners || [], (p) => -(all['cap:' + p.id] || 0)));
    // الدفتر المعطى قد يمتد بعد «to» (دفتر واحد لكل نسخة من البيانات): ما دفعه الشريك بعده لا يدخل
    const direct = {};
    for (const e of L.entries) {
      if (e.kind === 'capital' || e.kind === 'opening' || e.date > to) continue;
      for (const l of e.lines) if (l.a.startsWith('cap:') && l.v < 0) direct[l.a.slice(4)] = r2((direct[l.a.slice(4)] || 0) - l.v);
    }
    const rows = (S.partners || []).map((p) => {
      const share = totalShare ? num(p.share) / totalShare : 0;
      const contributed = r2(-(all['cap:' + p.id] || 0));
      const drawings = r2(all['drw:' + p.id] || 0);
      const required = r2(totalCap * share);
      const profitPeriod = r2(inc.net * share);
      const profitAll = r2(bs.retained * share);
      return {
        id: p.id, name: p.name, sharePct: num(p.share), share, contributed, direct: direct[p.id] || 0,
        cashContrib: r2(contributed - (direct[p.id] || 0)), drawings, required, diff: r2(contributed - required),
        profitPeriod, profitAll, equity: r2(contributed - drawings + profitAll),
        // أرباح متاحة للسحب: نصيبه من الأرباح المتراكمة − مسحوباته (بالسالب: سحب من رأس ماله)
        undistributed: r2(profitAll - drawings),
      };
    });
    const undistributedTotal = r2(bs.retained - sum(rows, (r) => r.drawings));
    return { rows, totalShare, totalCap, net: inc.net, retained: bs.retained, undistributedTotal };
  };

  // أين ذهب رأس المال التأسيسي؟
  RB.capitalUses = (S, L) => {
    L = L || RB.buildLedger(S, '9999-12-31');
    const set = S.settings;
    const open = set.openingDate;
    // حقوق الشركاء من الأرصدة الافتتاحية (مطعم قائم) رأس مال كالإيداع، لا دفعاً مباشراً من الشريك
    const opInfo = RB.openingInfo(S);
    // والأصول القائمة قبل بدء الدفتر: قيمتها حقوق افتتاحية، وتُعرض في الاستخدامات أياً كان تاريخها
    const opAssets = good(S.assets).filter(RB.isOpeningAsset);
    const contributions = r2(sum(good(S.capital).filter((c) => c.type !== 'withdrawal'), (c) => num(c.amount)) + (opInfo ? opInfo.net : 0) + sum(opAssets, (a) => num(a.amount)));
    let direct = 0;
    for (const e of L.entries) for (const l of e.lines) if (l.a.startsWith('cap:') && l.v < 0 && e.kind !== 'capital' && e.kind !== 'opening') direct = r2(direct - l.v);
    // الأصول التأسيسية فقط: المشتراة حتى الافتتاح (نقداً أو بالآجل، مثل مشتريات ومصاريف ما قبل الافتتاح).
    // ما بعد الافتتاح يُعرض للعلم ولا يُخصم
    const assets = {};
    const laterAssets = { amount: 0, count: 0 };
    let vatRecoverable = 0;
    for (const a of good(S.assets)) {
      const c = RB.assetCat(a.category);
      const sp = RB.costSplit(a.amount, a.includesVat, RB.assetTaxable(a), set, a.date);
      if (open && a.date > open && !RB.isOpeningAsset(a)) {
        laterAssets.amount = r2(laterAssets.amount + sp.gross);
        laterAssets.count++;
        continue;
      }
      assets[c.id] = assets[c.id] || { name: c.name, amount: 0, count: 0 };
      assets[c.id].amount = r2(assets[c.id].amount + sp.gross);
      assets[c.id].count++;
      vatRecoverable += sp.vat;
    }
    const assetList = Object.values(assets).sort((a, b) => b.amount - a.amount);
    let preopen = { expenses: 0, purchases: 0, payroll: 0 };
    if (open) {
      for (const x of good(S.expenses)) {
        if (x.date >= open) continue;
        const sp = RB.costSplit(x.amount, x.includesVat, x.taxable, set, x.date);
        preopen.expenses += sp.gross;
        vatRecoverable += sp.vat;
      }
      for (const p of good(S.purchases)) {
        if (p.date >= open) continue;
        const sp = RB.costSplit(RB.purchaseTotal(p), p.includesVat, p.taxable, set, p.date);
        preopen.purchases += sp.gross;
        vatRecoverable += sp.vat;
      }
      for (const p of good(S.payroll)) if (p.date < open) preopen.payroll += RB.payrollTotals(p).net + RB.payrollTotals(p).gosiEe + RB.payrollTotals(p).gosiEr;
    }
    preopen = { expenses: r2(preopen.expenses), purchases: r2(preopen.purchases), payroll: r2(preopen.payroll) };
    const sources = r2(contributions + direct);
    // المصروف والمتبقي بالإجمالي شامل الضريبة؛ ضريبة المدخلات المستردة معلومة فقط ولا تُضاف للمتبقي.
    // المتبقي = الصندوق + البنك − المستحق للموردين قبل الافتتاح (رأس المال العامل عند الافتتاح)
    const used = r2(sum(assetList, (a) => a.amount) + preopen.expenses + preopen.purchases + preopen.payroll);
    // منه ما بقي آجلاً على الموردين حتى الافتتاح (يُسدد من المتبقي): رصيد الموردين في اليوم السابق للافتتاح
    // (المشتريات والمصاريف التأسيسية قبل الافتتاح)، ومعه الأصول الآجلة بتاريخ الافتتاح نفسه (تأسيسية كذلك)
    let owedAtOpen = 0;
    if (open) {
      const onOpen = sum(good(S.assets).filter((a) => a.account === 'payable' && a.date === open), (a) => RB.costSplit(a.amount, a.includesVat, RB.assetTaxable(a), set, a.date).gross);
      owedAtOpen = Math.max(0, r2(-(RB.balances(L.entries, null, RB.addDays(open, -1))['2101'] || 0) + onOpen));
    }
    return { contributions, direct, sources, assets: assetList, assetsTotal: r2(sum(assetList, (a) => a.amount)), preopen, used, remaining: r2(sources - used), open, laterAssets, vatRecoverable: r2(vatRecoverable), owedAtOpen };
  };

  // نقطة التعادل: كم يلزم من المبيعات شهرياً لتغطية المصاريف الثابتة.
  // تُحسب من أشهر التشغيل التقويمية الكاملة داخل الفترة؛ الشهر غير المكتمل والأشهر قبل الافتتاح لا تدخل.
  // إن لم تضم الفترة شهراً كاملاً فآخر شهر كامل قبل نهايتها، وإن لم يوجد شهر تشغيل كامل بعد فتقدير من الأيام المتاحة.
  RB.breakEven = (S, from, to, L, today) => {
    today = today || RB.todayISO();
    const set = S.settings;
    // بداية التشغيل في الدفتر: تاريخ الافتتاح إن كان الدفتر يغطيه (فيه مبيعات أو مصاريف أو مشتريات أو رواتب
    // حتى نهاية شهر الافتتاح)، وإلا فالدفتر بدأ بعد الافتتاح (مطعم قائم) فمن أول يوم مبيعات؛ وبلا تاريخ افتتاح كذلك.
    // الأصول ورأس المال لا تُعد هنا لأن المطعم القائم قد يسجلها بتواريخها القديمة.
    let firstSale = '';
    for (const s of good(S.sales)) if (s.date && RB.saleTotal(s) > 0 && (!firstSale || s.date < firstSale)) firstSale = s.date;
    const open = set.openingDate || '';
    const openEnd = open ? RB.monthEnd(open.slice(0, 7)) : '';
    const covered = !!open && ['sales', 'expenses', 'purchases', 'payroll'].some((k) => good(S[k]).some((x) => x.date && x.date <= openEnd));
    const bySales = !!firstSale && !covered && firstSale > open;
    const first = bySales ? firstSale : open;
    const monthStart = (d) => (d.endsWith('-01') ? d : RB.ymAdd(d.slice(0, 7), 1) + '-01');
    const firstFull = first ? monthStart(first) : '';
    const end = to < today ? to : today;
    const lastFull = end === RB.monthEnd(end.slice(0, 7)) ? end : RB.addDays(end.slice(0, 7) + '-01', -1);
    let wFrom = monthStart(firstFull > from ? firstFull : from);
    let wTo = lastFull;
    let estimate = false;
    let fallback = false;
    let beforeOpen = false;
    if (first && end < first) {
      // الفترة المختارة كلها قبل بداية التشغيل: الحساب من أول شهر تشغيل كامل حتى اليوم،
      // وإلا فتقدير من أيام التشغيل المتاحة، وإن لم يبدأ التشغيل بعد فمن الفترة نفسها
      beforeOpen = true;
      const tFull = today === RB.monthEnd(today.slice(0, 7)) ? today : RB.addDays(today.slice(0, 7) + '-01', -1);
      if (firstFull <= tFull) {
        wFrom = firstFull;
        wTo = RB.monthEnd(firstFull.slice(0, 7));
      } else if (first <= today) {
        estimate = true;
        wFrom = first;
        wTo = today;
      } else {
        estimate = true;
        wFrom = from;
        wTo = end;
      }
    } else if (wTo < wFrom) {
      wFrom = lastFull.slice(0, 7) + '-01';
      fallback = true;
      if (firstFull && wFrom < firstFull) {
        fallback = false;
        estimate = true;
        wFrom = first > from ? first : from;
        if (wFrom > end) wFrom = from;
        wTo = end;
      }
    }
    // الدفتر المعطى قد ينتهي قبل أساس الحساب (فترة قبل الافتتاح): يُبنى حتى نهاية الأساس
    if (!L || (L.asOf && L.asOf < wTo)) L = RB.buildLedger(S, wTo);
    const inc = RB.incomeStatement(S, wFrom, wTo, L);
    const months = RB.monthsIn(wFrom, wTo);
    const days = Math.max(RB.daysBetween(wFrom, wTo) + 1, 1);
    const rate = RB.isVatReg(set, today) ? num(set.vatRate) / 100 : 0;
    const variable = r2(inc.tot.cogs + inc.tot.sell);
    const varRatio = inc.revenue ? variable / inc.revenue : 0;
    const fixedMonthly = r2((inc.tot.labor + inc.tot.occ + inc.tot.opex + inc.tot.dep) / months);
    const sales = RB.salesByChannel(S, wFrom, wTo);
    const beNet = varRatio < 1 ? fixedMonthly / (1 - varRatio) : 0;
    const beGross = beNet * (1 + rate);
    const beDaily = (beGross * months) / days;
    const avgMonthlyNet = inc.revenue / months;
    return {
      months, revenue: inc.revenue, variable, varRatio, fixedMonthly,
      fixedParts: { labor: inc.tot.labor / months, occ: inc.tot.occ / months, opex: inc.tot.opex / months, dep: inc.tot.dep / months },
      beNet, beGross, beDaily, beOrders: sales.total.avgTicket ? beGross / sales.total.avgTicket : 0,
      avgTicket: sales.total.avgTicket, avgMonthlyNet, safety: avgMonthlyNet ? ((avgMonthlyNet - beNet) / avgMonthlyNet) * 100 : 0,
      basisFrom: wFrom, basisTo: wTo, estimate, fallback, beforeOpen,
      // بداية التشغيل المعتمدة ومصدرها: 'opening' تاريخ الافتتاح، 'sales' أول يوم مبيعات مسجل
      start: first, startBy: bySales ? 'sales' : first ? 'opening' : '',
      // ما استُبعد من الفترة المختارة (للتوضيح في التقرير)
      cutEnd: !estimate && !fallback && !beforeOpen && wTo < end,
      cutStart: !estimate && !fallback && !beforeOpen && wFrom > from && !(firstFull && from < firstFull),
      preOpen: !estimate && !fallback && !beforeOpen && !!firstFull && from < firstFull,
    };
  };

  // الكميات المباعة لكل منتج في فترة
  RB.itemsSold = (S, from, to) => {
    const q = {};
    for (const s of good(S.sales)) {
      if (s.date < from || s.date > to) continue;
      for (const it of s.items || []) if (it.productId && num(it.qty)) q[it.productId] = (q[it.productId] || 0) + num(it.qty);
    }
    return q;
  };

  // هندسة المنيو + التكلفة النظرية مقابل الفعلية
  RB.menuAnalysis = (S, from, to, L) => {
    const C = RB.costing(S);
    const q = RB.itemsSold(S, from, to);
    const rows = Object.keys(q)
      .map((id) => {
        const p = S.products.find((x) => x.id === id);
        if (!p) return null;
        const st = RB.productStats(S, p, C);
        return { id, name: p.name, qty: q[id], cost: st.cost, priceNet: st.priceNet, profit: st.profit, foodCost: st.foodCost, totalProfit: st.profit * q[id], totalCost: st.cost * q[id], totalSales: st.priceNet * q[id] };
      })
      .filter(Boolean);
    const totalQty = sum(rows, (r) => r.qty);
    const avgProfit = totalQty ? sum(rows, (r) => r.profit * r.qty) / totalQty : 0;
    const popThr = rows.length ? (totalQty / rows.length) * 0.7 : 0;
    rows.forEach((r) => {
      r.mix = totalQty ? (r.qty / totalQty) * 100 : 0;
      const pop = r.qty >= popThr;
      const prof = r.profit >= avgProfit;
      r.cls = pop && prof ? 'star' : pop ? 'plow' : prof ? 'puzzle' : 'dog';
    });
    rows.sort((a, b) => b.qty - a.qty);
    const theoretical = r2(sum(rows, (r) => r.totalCost));
    const inc = RB.incomeStatement(S, from, to, L);
    // المواد الخام المستهلكة نظرياً
    const usage = {};
    for (const id of Object.keys(q)) RB.explode(S, 'prod', id, q[id], usage);
    const rawUsage = Object.keys(usage)
      .map((rid) => {
        const r = S.raw.find((x) => x.id === rid);
        if (!r) return null;
        const qty = usage[rid];
        return { id: rid, name: r.name, unit: r.useUnit, qty, buyQty: qty / (num(r.packQty) || 1), buyUnit: r.buyUnit, cost: qty * (C.raw[rid] || 0) };
      })
      .filter(Boolean)
      .sort((a, b) => b.cost - a.cost);
    return { rows, totalQty, avgProfit, popThr, theoretical, actual: inc.tot.cogs, revenue: inc.revenue, variance: r2(inc.tot.cogs - theoretical), rawUsage, hasItems: rows.length > 0 };
  };

  RB.MENU_CLASS = {
    star: { name: 'نجم', tip: 'مطلوب ومربح — حافظ عليه وأبرزه في المنيو' },
    plow: { name: 'حصان عمل', tip: 'مطلوب لكن ربحه أقل — راجع التكلفة أو ارفع السعر قليلاً' },
    puzzle: { name: 'لغز', tip: 'مربح لكن الطلب عليه قليل — سوّق له أو غيّر مكانه في المنيو' },
    dog: { name: 'ضعيف', tip: 'طلب قليل وربح قليل — فكّر في تعديله أو حذفه' },
  };

  // ───────────── التصدير ─────────────
  RB.toCSV = (rows) =>
    '﻿' +
    rows
      .map((r) =>
        r
          .map((c) => {
            if (c === null || c === undefined) return '';
            let s = typeof c === 'number' ? String(r2(c)) : String(c);
            // نص يبدأ بـ = + - @ أو مسافة جدولة يُنفَّذ كمعادلة في Excel: يُسبق بفاصلة عليا (المبالغ السالبة تبقى أرقاماً)
            if (typeof c !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
            return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
          })
          .join(',')
      )
      .join('\n');

  root.RB = RB;
  if (typeof module !== 'undefined' && module.exports) module.exports = RB;
})(typeof window !== 'undefined' ? window : globalThis);
