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
    for (const s of S.sales || []) {
      if (!s || !s.date || s.date > today) continue;
      const v = RB.saleTotal(s);
      if (s.date >= y0) last12 += v;
      if (v > 0 && (!first || s.date < first)) first = s.date;
    }
    const open = set.openingDate && set.openingDate <= today ? set.openingDate : '';
    const start = open && first ? (open > first ? open : first) : open || first;
    let runRate = 0;
    if (start && RB.daysBetween(start, today) < 365) {
      const since = sum((S.sales || []).filter((s) => s && s.date >= start && s.date <= today), RB.saleTotal);
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

  RB.PAY_LABEL = { cash: 'الصندوق (الكاشير)', bank: 'الحساب البنكي', payable: 'آجل على المورد' };

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
  ];

  RB.emptyState = () => {
    const s = { settings: RB.defaultSettings() };
    RB.SECTIONS.forEach((k) => (s[k] = []));
    return s;
  };

  // يكمل أي حقول ناقصة (نسخ احتياطية قديمة أو بيانات منقوصة)
  RB.normalize = (src) => {
    const out = RB.emptyState();
    if (!src || typeof src !== 'object') return out;
    const d = RB.defaultSettings();
    const s = src.settings || {};
    out.settings = Object.assign(d, s);
    out.settings.gosi = Object.assign(RB.defaultSettings().gosi, s.gosi || {});
    out.settings.labor = Object.assign(RB.defaultSettings().labor, s.labor || {});
    if (!Array.isArray(s.channels) || !s.channels.length) out.settings.channels = RB.defaultSettings().channels;
    RB.SECTIONS.forEach((k) => {
      if (Array.isArray(src[k])) out[k] = src[k].filter((x) => x && typeof x === 'object' && x.id);
    });
    out.expenses = out.expenses.map(RB.migrateExpense);
    return out;
  };

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
    const p = S && (S.partners || []).find((x) => x.id === pid);
    const pname = p ? p.name : 'شريك';
    if (kind === 'cap') return { code, name: 'رأس مال ' + pname, type: 'E', group: 'cap', partnerId: pid };
    if (kind === 'drw') return { code, name: 'مسحوبات ' + pname, type: 'E', group: 'drw', partnerId: pid };
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
  // التأمين المسترد (تأمين الإيجار أو العدادات) ليس توريداً خاضعاً: لا ضريبة عليه مهما كانت قيمة taxable المحفوظة
  RB.assetTaxable = (a) => a.category !== 'deposit' && !!a.taxable;
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

  RB.isEmployeeActive = (emp, ym) => {
    if (emp.active === false) return false;
    if (emp.startDate && emp.startDate.slice(0, 7) > ym) return false;
    if (emp.endDate && emp.endDate.slice(0, 7) < ym) return false;
    return true;
  };

  // سطر المسير لشهر ym (نسب التأمينات حسب الشهر)؛ بدونه الشهر الحالي
  RB.payrollLine = (emp, S, ym) => {
    const g = RB.gosiFor(emp, S, ym);
    return {
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
    };
  };
  RB.payrollLineGross = (l) => r2(num(l.basic) + num(l.housing) + num(l.allowances) + num(l.additions) - num(l.deductions));
  RB.payrollTotals = (pr) => {
    const lines = pr.lines || [];
    const gross = r2(sum(lines, RB.payrollLineGross));
    const gosiEe = r2(sum(lines, (l) => num(l.gosiEe)));
    const gosiEr = r2(sum(lines, (l) => num(l.gosiEr)));
    const eosbPaid = r2(sum(lines, (l) => Math.max(0, num(l.eosbPaid))));
    return { gross, gosiEe, gosiEr, net: r2(gross - gosiEe), count: lines.length, cost: r2(gross + gosiEr), eosbPaid };
  };

  // مخصص نهاية الخدمة من المسيرات بترتيب تاريخ الاستحقاق: لكل مسير استحقاق (لكل موظف له سطر من أجره:
  // الأساسي + السكن + البدلات، بلا إضافي ولا خصومات) في تاريخ استحقاق الرواتب، ثم صرف المكافأة
  // (eosbPaid) في تاريخ الصرف: من المخصص المتراكم للموظف، وما زاد عليه مصروف في حينه
  RB.eosbEvents = (S) => {
    const emps = byId(S.employees);
    const accrued = {};
    const out = [];
    const runs = (S.payroll || [])
      .filter((pr) => pr && pr.date)
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
        lines.push({ employeeId: l.employeeId, amount });
      }
      if (lines.length) out.push({ kind: 'accrual', pr, ym, date, lines, total: r2(sum(lines, (x) => x.amount)) });
      for (const l of pr.lines || []) {
        const paid = r2(num(l && l.eosbPaid));
        if (!(paid > 0)) continue;
        const id = l.employeeId || '';
        const fromProv = id ? r2(Math.min(paid, Math.max(0, accrued[id] || 0))) : 0;
        if (id) accrued[id] = r2((accrued[id] || 0) - fromProv);
        out.push({ kind: 'payout', pr, ym, date: pr.date, employeeId: id, name: l.name || (emps[id] || {}).name || '', paid, fromProv, excess: r2(paid - fromProv) });
      }
    }
    return out;
  };
  // المخصص المتراكم لكل موظف حتى تاريخ (مجموعها = رصيد حساب 2201)
  RB.eosbBalances = (S, asOf) => {
    const out = {};
    for (const ev of RB.eosbEvents(S)) {
      if (asOf && ev.date > asOf) continue;
      if (ev.kind === 'accrual') for (const l of ev.lines) out[l.employeeId] = r2((out[l.employeeId] || 0) + l.amount);
      else if (ev.employeeId) out[ev.employeeId] = r2((out[ev.employeeId] || 0) - ev.fromProv);
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

  RB.costing = (S) => {
    const raw = {};
    (S.raw || []).forEach((r) => (raw[r.id] = RB.rawUnitCost(r, S)));
    const maps = { comp: byId(S.composites), prod: byId(S.products) };
    const memo = { comp: {}, prod: {} };
    const errors = [];
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
    (S.composites || []).forEach((c) => unit('comp', c.id, []));
    (S.products || []).forEach((p) => unit('prod', p.id, []));
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

  RB.saleTotal = (s) => r2(sum(Object.values(s.channels || {}), (v) => num(v.amount)));
  RB.saleOrders = (s) => sum(Object.values(s.channels || {}), (v) => num(v.orders));

  const KIND_ORDER = { capital: 0, asset: 1, expense: 2, purchase: 3, payroll: 4, eosb: 5, sale: 6, payout: 7, transfer: 8, supplierpay: 9, vatpay: 10, withdrawal: 11, amort: 12, dep: 13, stock: 14 };

  RB.buildLedger = (S, asOf) => {
    asOf = asOf || RB.todayISO();
    const set = S.settings;
    const entries = [];
    let rounding = 0;

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

    // رأس المال والمسحوبات
    for (const c of S.capital || []) {
      const amt = num(c.amount);
      const src = RB.srcAcc(c.account);
      const ref = { s: 'capital', id: c.id };
      if (c.type === 'withdrawal') add(c.date, 'withdrawal', ref, 'مسحوبات الشريك' + (c.note ? ' — ' + c.note : ''), [['drw:' + c.partnerId, amt], [src, -amt]]);
      else add(c.date, 'capital', ref, 'إيداع رأس مال' + (c.note ? ' — ' + c.note : ''), [[src, amt], ['cap:' + c.partnerId, -amt]]);
    }

    // الأصول وإهلاكها الشهري
    for (const a of S.assets || []) {
      const cat = RB.assetCat(a.category);
      const sp = RB.costSplit(a.amount, a.includesVat, RB.assetTaxable(a), set, a.date);
      const ref = { s: 'assets', id: a.id };
      add(a.date, 'asset', ref, 'شراء أصل: ' + a.name, [[cat.acc, sp.cost], ['2102', sp.vat, sp.net], [RB.srcAcc(a.account), -sp.gross]]);
      const sched = RB.depSchedule(a, S);
      for (const m of sched.months) add(m.date, 'dep', ref, 'إهلاك: ' + a.name, [['5501', m.amount], ['1290', -m.amount]]);
    }

    // المصاريف التشغيلية (المدفوعة مقدماً توزّع على أشهر التغطية)
    for (const x of S.expenses || []) {
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
    }

    // المشتريات وسداد الموردين
    for (const p of S.purchases || []) {
      const cat = RB.purchaseCat(p.category);
      const sp = RB.costSplit(RB.purchaseTotal(p), p.includesVat, p.taxable, set, p.date);
      add(p.date, 'purchase', { s: 'purchases', id: p.id }, 'مشتريات: ' + (p.supplier || cat.name) + (p.invoiceNo ? ' — فاتورة ' + p.invoiceNo : ''), [[cat.acc, sp.cost], ['2102', sp.vat, sp.net], [RB.srcAcc(p.account), -sp.gross]]);
    }
    for (const p of S.supplierPayments || []) {
      const amt = num(p.amount);
      add(p.date, 'supplierpay', { s: 'supplierPayments', id: p.id }, 'سداد مورد: ' + (p.supplier || ''), [['2101', amt], [RB.srcAcc(p.account), -amt]]);
    }

    // الرواتب والتأمينات الاجتماعية: التكلفة على شهر الخدمة مهما كان تاريخ الصرف
    for (const pr of S.payroll || []) {
      if (!pr.date) continue;
      const t = RB.payrollTotals(pr);
      const ref = { s: 'payroll', id: pr.id };
      const ym = pr.month || pr.date.slice(0, 7);
      const desc = 'رواتب ' + RB.monthName(ym);
      const pay = [
        [RB.srcAcc(pr.account), -t.net, undefined, 'صافي الرواتب'],
        [RB.srcAcc(pr.gosiAccount || pr.account), -(t.gosiEe + t.gosiEr), undefined, 'التأمينات الاجتماعية (حصة العامل والمنشأة)'],
      ];
      if (pr.date.slice(0, 7) === ym) {
        add(pr.date, 'payroll', ref, desc, [['5201', t.gross], ['5202', t.gosiEr], ...pay]);
      } else {
        // استحقاق في آخر شهر الخدمة، وصرف في تاريخه (قبله = مدفوع مقدماً، بعده = مستحق)
        add(RB.monthEnd(ym), 'payroll', ref, 'استحقاق ' + desc, [['5201', t.gross], ['5202', t.gosiEr], ['2103', -t.cost]]);
        add(pr.date, 'payroll', ref, 'صرف ' + desc, [['2103', t.cost], ...pay]);
      }
    }
    // مخصص مكافأة نهاية الخدمة: يُستحق مع كل مسير في تاريخ استحقاق الرواتب، والمكافأة المصروفة تُخصم من المخصص
    for (const ev of RB.eosbEvents(S)) {
      const ref = { s: 'payroll', id: ev.pr.id };
      if (ev.kind === 'accrual') add(ev.date, 'eosb', ref, 'مخصص نهاية الخدمة — ' + RB.monthName(ev.ym), [['5203', ev.total], ['2201', -ev.total]]);
      else add(ev.date, 'eosb', ref, 'صرف مكافأة نهاية الخدمة' + (ev.name ? ': ' + ev.name : ''), [['2201', ev.fromProv], ['5203', ev.excess], [RB.srcAcc(ev.pr.account), -ev.paid]]);
    }

    // المبيعات اليومية لكل قناة
    for (const s of S.sales || []) {
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
    }

    // تحويلات التطبيقات للبنك. خصومات التطبيق حسب نوعها (dedType):
    // sale = عرض أو مرتجع على طلبات العملاء يخفض المبيعات وضريبتها، fee = رسوم بفاتورة ضريبية (ضريبة مدخلات)،
    // other أو بدون نوع (السجلات القديمة) = غرامة أو تسوية بلا ضريبة
    const payRate = num(set.vatRate) / 100;
    for (const p of S.payouts || []) {
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
    }

    // التحويل بين الصندوق والبنك
    for (const t of S.transfers || []) {
      const amt = num(t.amount);
      add(t.date, 'transfer', { s: 'transfers', id: t.id }, t.from === 'cash' ? 'إيداع نقدية الصندوق في البنك' : 'سحب من البنك إلى الصندوق', [[RB.srcAcc(t.to), amt], [RB.srcAcc(t.from), -amt]]);
    }

    // الجرد: الفرق بين قيمة الجرد والجرد السابق
    let prevStock = 0;
    for (const c of (S.stockCounts || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1))) {
      const value = RB.stockValue(c, S);
      const delta = r2(value - prevStock);
      add(c.date, 'stock', { s: 'stockCounts', id: c.id }, 'جرد المخزون', [['1104', delta], ['5109', -delta]]);
      prevStock = value;
    }

    // سداد ضريبة القيمة المضافة
    for (const v of S.vatPayments || []) {
      const amt = num(v.amount);
      add(v.date, 'vatpay', { s: 'vatPayments', id: v.id }, 'سداد ضريبة القيمة المضافة ' + (v.period || ''), [['2102', amt], [RB.srcAcc(v.account), -amt]]);
    }

    entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (KIND_ORDER[a.kind] || 0) - (KIND_ORDER[b.kind] || 0)));
    return { entries, rounding: r2(rounding), asOf };
  };

  // سعر سطر الجرد للتقييم: الأسعار تُحفظ بدون ضريبة، وغير المسجل في الضريبة في تاريخ الجرد
  // يقيّم المواد الخاضعة شاملة الضريبة لأنها جزء من تكلفتها (كما حُمّلت في المشتريات)
  RB.stockLinePrice = (l, S, date) => {
    const p = num(l.price);
    if (!S || !S.settings || RB.isVatReg(S.settings, date)) return p;
    const raw = (S.raw || []).find((x) => x.id === l.rawId);
    return raw && raw.taxable ? p * (1 + num(S.settings.vatRate) / 100) : p;
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

  RB.trialBalance = (S, from, to, L) => {
    L = L || RB.buildLedger(S, to);
    const b = RB.balances(L.entries, from, to);
    const rows = Object.keys(b)
      .filter((c) => Math.abs(b[c]) >= 0.005)
      .sort()
      .map((code) => {
        const info = RB.accInfo(code, S);
        return { code, name: info.name, type: info.type, dr: b[code] > 0 ? b[code] : 0, cr: b[code] < 0 ? -b[code] : 0 };
      });
    return { rows, dr: r2(sum(rows, (r) => r.dr)), cr: r2(sum(rows, (r) => r.cr)) };
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
    // في اليوم الواحد: الداخل قبل الخارج، فلا يظهر رصيد سالب وهمي أثناء اليوم (الترتيب ثابت فيما عداه)
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (b.in > 0) - (a.in > 0)));
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
      if (e.date < from || e.date > to) continue;
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
      if (e.kind !== 'vatpay' && e.lines.some((l) => l.a === '2102')) {
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
    for (const x of S.vatPayments || []) {
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
    pers.forEach((q, i) => {
      const report = RB.vatReport(S, q.from, q.to, L);
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
    for (const s of S.sales || []) {
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
    for (const s of S.sales || []) {
      if (s.date > asOf) continue;
      for (const chId of Object.keys(s.channels || {})) {
        const x = RB.saleChannelSplit(S, chId, s.channels[chId], s.date);
        if (x.type !== 'app') continue;
        out[chId] = r2((out[chId] || 0) + x.receive);
      }
    }
    for (const p of S.payouts || []) {
      if (p.date > asOf) continue;
      out[p.channelId] = r2((out[p.channelId] || 0) - num(p.amount) - num(p.deductions));
    }
    return Object.keys(out).map((id) => {
      const ch = RB.channelOf(S, id);
      const last = (S.payouts || []).filter((p) => p.channelId === id && p.date <= asOf).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
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
    for (const p of S.purchases || []) {
      if (p.account !== 'payable' || p.date > asOf) continue;
      owe(p.supplier, RB.costSplit(RB.purchaseTotal(p), p.includesVat, p.taxable, set, p.date).gross);
    }
    for (const a of S.assets || []) {
      if (a.account !== 'payable' || a.date > asOf) continue;
      owe(a.supplier, RB.costSplit(a.amount, a.includesVat, RB.assetTaxable(a), set, a.date).gross);
    }
    for (const x of S.expenses || []) {
      if (x.account !== 'payable' || x.date > asOf) continue;
      owe(x.entity, RB.costSplit(x.amount, x.includesVat, x.taxable, set, x.date).gross);
    }
    for (const p of S.supplierPayments || []) {
      if (p.date > asOf) continue;
      const k = (p.supplier || 'بدون اسم').trim() || 'بدون اسم';
      out[k] = out[k] || { supplier: k, purchases: 0, paid: 0 };
      out[k].paid = r2(out[k].paid + num(p.amount));
    }
    return Object.values(out).map((o) => Object.assign(o, { balance: r2(o.purchases - o.paid) }));
  };

  // متابعة التجديد: آخر تغطية لكل بند حكومي أو اشتراك أو عقد يغطي 3 أشهر فأكثر (والزكاة دائماً).
  // لا تُتابع: الرسوم لمرة واحدة (oneOff)، والبند الذي أوقف المستخدم متابعته (noRenew على آخر سجل؛
  // تجديده لاحقاً يعيده)، ورسوم عامل غادر أو حُذف أو انتهى عمله قبل نهاية التغطية
  RB.renewals = (S, today) => {
    today = today || RB.todayISO();
    const groups = {};
    for (const x of S.expenses || []) {
      if (!x || !x.date || x.oneOff) continue;
      const months = Math.round(num(x.months) || 1);
      const zakat = x.category === 'zakat';
      if (months < 1 || (months < 3 && !zakat)) continue;
      const key = [x.category, (x.entity || '').trim(), (x.desc || '').trim(), x.employeeId || ''].join('|');
      // الزكاة تُدفع عن سنة سابقة: التذكير سنوي من تاريخ الدفع لا من بداية السنة التي تخصها
      const end = zakat ? RB.coverageEnd(x.date, 12) : RB.coverageEnd(x.startDate || x.date, months);
      if (!groups[key] || groups[key].end < end) groups[key] = { key, rec: x, end };
    }
    const emps = byId(S.employees);
    const staffGone = (g) => {
      if (!g.rec.employeeId) return false;
      const e = emps[g.rec.employeeId];
      return !e || e.active === false || (!!e.endDate && e.endDate <= g.end);
    };
    return Object.values(groups)
      .filter((g) => !g.rec.noRenew && !staffGone(g))
      .map((g) => {
        const days = RB.daysBetween(today, g.end);
        const status = days < 0 ? 'expired' : days <= 30 ? 'soon' : 'ok';
        return { rec: g.rec, end: g.end, days, status };
      })
      .sort((a, b) => a.days - b.days);
  };

  // الشركاء: المساهمات، المسحوبات، ونصيب الربح
  RB.partnersReport = (S, from, to, L) => {
    L = L || RB.buildLedger(S, to);
    const all = RB.balances(L.entries, null, to);
    const inc = RB.incomeStatement(S, from, to, L);
    const bs = RB.balanceSheet(S, to, L);
    const totalShare = sum(S.partners || [], (p) => num(p.share));
    const totalCap = r2(sum(S.partners || [], (p) => -(all['cap:' + p.id] || 0)));
    const direct = {};
    for (const e of L.entries) {
      if (e.kind === 'capital') continue;
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
      };
    });
    return { rows, totalShare, totalCap, net: inc.net, retained: bs.retained };
  };

  // أين ذهب رأس المال التأسيسي؟
  RB.capitalUses = (S, L) => {
    L = L || RB.buildLedger(S, '9999-12-31');
    const set = S.settings;
    const open = set.openingDate;
    const contributions = r2(sum((S.capital || []).filter((c) => c.type !== 'withdrawal'), (c) => num(c.amount)));
    let direct = 0;
    for (const e of L.entries) for (const l of e.lines) if (l.a.startsWith('cap:') && l.v < 0 && e.kind !== 'capital') direct = r2(direct - l.v);
    // الأصول التأسيسية فقط: المشتراة حتى الافتتاح (نقداً أو بالآجل، مثل مشتريات ومصاريف ما قبل الافتتاح).
    // ما بعد الافتتاح يُعرض للعلم ولا يُخصم
    const assets = {};
    const laterAssets = { amount: 0, count: 0 };
    let vatRecoverable = 0;
    for (const a of S.assets || []) {
      const c = RB.assetCat(a.category);
      const sp = RB.costSplit(a.amount, a.includesVat, RB.assetTaxable(a), set, a.date);
      if (open && a.date > open) {
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
      for (const x of S.expenses || []) {
        if (x.date >= open) continue;
        const sp = RB.costSplit(x.amount, x.includesVat, x.taxable, set, x.date);
        preopen.expenses += sp.gross;
        vatRecoverable += sp.vat;
      }
      for (const p of S.purchases || []) {
        if (p.date >= open) continue;
        const sp = RB.costSplit(RB.purchaseTotal(p), p.includesVat, p.taxable, set, p.date);
        preopen.purchases += sp.gross;
        vatRecoverable += sp.vat;
      }
      for (const p of S.payroll || []) if (p.date < open) preopen.payroll += RB.payrollTotals(p).net + RB.payrollTotals(p).gosiEe + RB.payrollTotals(p).gosiEr;
    }
    preopen = { expenses: r2(preopen.expenses), purchases: r2(preopen.purchases), payroll: r2(preopen.payroll) };
    const sources = r2(contributions + direct);
    // المصروف والمتبقي بالإجمالي شامل الضريبة؛ ضريبة المدخلات المستردة معلومة فقط ولا تُضاف للمتبقي.
    // المتبقي = الصندوق + البنك − المستحق للموردين قبل الافتتاح (رأس المال العامل عند الافتتاح)
    const used = r2(sum(assetList, (a) => a.amount) + preopen.expenses + preopen.purchases + preopen.payroll);
    // منه ما بقي آجلاً على الموردين حتى الافتتاح (يُسدد من المتبقي)
    const owedAtOpen = open ? Math.max(0, r2(-(RB.balances(L.entries, null, RB.addDays(open, -1))['2101'] || 0))) : 0;
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
    for (const s of S.sales || []) if (s.date && RB.saleTotal(s) > 0 && (!firstSale || s.date < firstSale)) firstSale = s.date;
    const open = set.openingDate || '';
    const openEnd = open ? RB.monthEnd(open.slice(0, 7)) : '';
    const covered = !!open && ['sales', 'expenses', 'purchases', 'payroll'].some((k) => (S[k] || []).some((x) => x.date && x.date <= openEnd));
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
    for (const s of S.sales || []) {
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
            const s = c === null || c === undefined ? '' : typeof c === 'number' ? String(r2(c)) : String(c);
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
          })
          .join(',')
      )
      .join('\n');

  root.RB = RB;
  if (typeof module !== 'undefined' && module.exports) module.exports = RB;
})(typeof window !== 'undefined' ? window : globalThis);
