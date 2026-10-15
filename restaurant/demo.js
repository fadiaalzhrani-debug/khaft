/*
 * بيانات تجريبية لمطعم برقر — تُعرض عند أول فتح ولا تُحفظ إلا إذا طلب المستخدم ذلك.
 * كل الأرقام أمثلة توضيحية وليست أسعاراً أو رسوماً رسمية.
 */
(function (root) {
  'use strict';
  const RB = root.RB || require('./core.js');

  RB.demoState = function (today) {
    today = today || RB.todayISO();
    let seed = 20260308;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const between = (a, b) => a + (b - a) * rnd();
    const r2 = RB.r2;
    let n = 0;
    const id = (p) => p + (++n).toString(36);

    const S = RB.emptyState();
    const thisYm = today.slice(0, 7);
    const openYm = RB.ymAdd(thisYm, -3);
    const opening = openYm + '-01';
    const pre = RB.addDays(opening, -50);
    const yesterday = RB.addDays(today, -1);
    Object.assign(S.settings, { name: 'برقر الحي', city: 'الخبر', openingDate: opening });

    // ─── الشركاء ورأس المال ───
    S.partners = [
      { id: 'p1', name: 'الشريك الأول', share: 50, phone: '' },
      { id: 'p2', name: 'الشريك الثاني', share: 50, phone: '' },
    ];
    S.capital.push({ id: id('c'), date: pre, partnerId: 'p1', type: 'contribution', account: 'bank', amount: 150000, note: 'الدفعة الأولى' });
    S.capital.push({ id: id('c'), date: pre, partnerId: 'p2', type: 'contribution', account: 'bank', amount: 150000, note: 'الدفعة الأولى' });

    // ─── الأصول التأسيسية ───
    const assets = [
      ['شواية برقر مسطحة (غاز)', 'kitchen', 9800, 5],
      ['قلاية بطاطس مزدوجة', 'kitchen', 7400, 5],
      ['ثلاجة تحضير سلطات', 'kitchen', 6200, 6],
      ['فريزر عمودي', 'kitchen', 5400, 6],
      ['شفاط ومدخنة المطبخ', 'kitchen', 12500, 10],
      ['طاولات تحضير ستانلس', 'kitchen', 4600, 10],
      ['طاولات وكراسي الصالة', 'furniture', 14500, 18],
      ['كاونتر الاستقبال', 'furniture', 6800, 18],
      ['أدوات وأواني المطبخ', 'tools', 3900, 25],
      ['ديكور وإضاءة الصالة', 'fitout', 38000, 12],
      ['نظام كاشير وشاشة طلبات وطابعة', 'tech', 7200, 28],
      ['تصميم الهوية والمنيو', 'preop', 6500, 3],
    ];
    for (const [name, category, amount, d] of assets) {
      const cat = RB.assetCat(category);
      S.assets.push({ id: id('a'), date: RB.addDays(pre, d), name, category, amount, includesVat: false, taxable: true, account: 'bank', lifeMonths: cat.life, salvage: 0, supplier: '', note: '' });
    }
    S.assets.push({ id: id('a'), date: RB.addDays(pre, 15), name: 'لوحة المحل الخارجية', category: 'fitout', amount: 8500, includesVat: true, taxable: true, account: 'partner:p1', lifeMonths: 60, salvage: 0, supplier: '', note: 'دفعها الشريك الأول من حسابه' });
    S.assets.push({ id: id('a'), date: RB.addDays(pre, 2), name: 'تأمين إيجار المحل (مسترد)', category: 'deposit', amount: 12000, includesVat: false, taxable: false, account: 'bank', lifeMonths: 0, salvage: 0, supplier: '', note: '' });

    // ─── الموظفون ───
    const empStart = RB.addDays(opening, -20);
    const expat = { nationality: 'expat', housing: 0, transport: 0, levyMonthly: 800, iqamaAnnual: 650, workPermitAnnual: 100, medicalAnnual: 1800, ticketAnnual: 1000, housingCost: 375, otherAnnual: 0, startDate: empStart, active: true };
    S.employees = [
      Object.assign({ id: 'e1', name: 'سليم', job: 'طباخ رئيسي', basic: 2500, otherAllow: 200 }, expat),
      Object.assign({ id: 'e2', name: 'رفيق', job: 'طباخ مساعد', basic: 1900, otherAllow: 200 }, expat),
      Object.assign({ id: 'e3', name: 'أنور', job: 'تحضير وتغليف', basic: 1600, otherAllow: 200 }, expat),
      Object.assign({ id: 'e4', name: 'جمال', job: 'نظافة وخدمة', basic: 1400, otherAllow: 200 }, expat),
      // أول تسجيل له في التأمينات بعد 3 يوليو 2024: نسب النظام الجديد
      { id: 'e5', name: 'سعود', job: 'كاشير ومشرف وردية', nationality: 'saudi', gosiSystem: 'new', basic: 4000, housing: 1000, transport: 500, otherAllow: 0, levyMonthly: 0, iqamaAnnual: 0, workPermitAnnual: 0, medicalAnnual: 2300, ticketAnnual: 0, housingCost: 0, otherAnnual: 0, startDate: empStart, active: true },
    ];

    // ─── المواد الخام (السعر لوحدة الشراء بدون ضريبة) ───
    const raw = (rid, name, category, buyUnit, packQty, useUnit, price, wastePct, supplier) => ({ id: rid, name, category, buyUnit, packQty, useUnit, price, taxable: supplier !== 'veg', wastePct: wastePct || 0, supplier });
    S.raw = [
      raw('m_beef', 'لحم بقري مفروم', 'لحوم', 'كرتون 10 كجم', 10000, 'جم', 340, 0, 'meat'),
      raw('m_bun', 'خبز برقر بريوش', 'خبز', 'كرتون 48 حبة', 48, 'حبة', 58, 0, 'bread'),
      raw('m_cheddar', 'جبن شيدر شرائح', 'أجبان', 'علبة 84 شريحة', 84, 'شريحة', 42, 0, 'dry'),
      raw('m_lettuce', 'خس', 'خضار', 'كرتون 5 كجم', 5000, 'جم', 45, 15, 'veg'),
      raw('m_tomato', 'طماطم', 'خضار', 'كرتون 6 كجم', 6000, 'جم', 30, 10, 'veg'),
      raw('m_onion', 'بصل', 'خضار', 'كيس 10 كجم', 10000, 'جم', 25, 10, 'veg'),
      raw('m_pickle', 'مخلل خيار شرائح', 'صوصات', 'علبة 3 كجم', 3000, 'جم', 28, 0, 'dry'),
      raw('m_mayo', 'مايونيز', 'صوصات', 'جالون 3.78 لتر', 3780, 'مل', 32, 0, 'dry'),
      raw('m_ketchup', 'كاتشب', 'صوصات', 'جالون 3.78 لتر', 3780, 'مل', 26, 0, 'dry'),
      raw('m_mustard', 'خردل', 'صوصات', 'علبة 3 لتر', 3000, 'مل', 30, 0, 'dry'),
      raw('m_jalapeno', 'هالبينو', 'صوصات', 'علبة 3 كجم', 3000, 'جم', 35, 0, 'dry'),
      raw('m_hot', 'صوص حار', 'صوصات', 'علبة 1 لتر', 1000, 'مل', 18, 0, 'dry'),
      raw('m_spice', 'بهارات البرقر', 'بهارات', 'كيس 1 كجم', 1000, 'جم', 40, 0, 'dry'),
      raw('m_salt', 'ملح', 'بهارات', 'كيس 1 كجم', 1000, 'جم', 3, 0, 'dry'),
      raw('m_fries', 'بطاطس مجمدة', 'بطاطس', 'كرتون 10 كجم', 10000, 'جم', 95, 0, 'dry'),
      raw('m_oil', 'زيت قلي', 'زيوت', 'تنكة 17 لتر', 17000, 'مل', 120, 0, 'dry'),
      raw('m_cheesesauce', 'صوص جبن جاهز', 'صوصات', 'جالون 3 كجم', 3000, 'جم', 55, 0, 'dry'),
      raw('m_box', 'علبة برقر كرتون', 'تغليف', 'كرتون 300 حبة', 300, 'حبة', 135, 0, 'pack'),
      raw('m_friesbox', 'علبة بطاطس', 'تغليف', 'كرتون 500 حبة', 500, 'حبة', 125, 0, 'pack'),
      raw('m_bag', 'كيس ورقي', 'تغليف', 'كرتون 500 حبة', 500, 'حبة', 90, 0, 'pack'),
      raw('m_napkin', 'مناديل', 'تغليف', 'كرتون 5000 حبة', 5000, 'حبة', 60, 0, 'pack'),
      raw('m_soda', 'مشروب غازي (علبة)', 'مشروبات', 'كرتون 30 علبة', 30, 'حبة', 42, 0, 'drinks'),
      raw('m_water', 'مياه صغيرة', 'مشروبات', 'كرتون 40 حبة', 40, 'حبة', 18, 0, 'drinks'),
    ];

    // ─── المنتجات المجمّعة (تحضيرات) ───
    const it = (kind, rid, qty) => ({ kind, id: rid, qty });
    S.composites = [
      { id: 'c_patty', name: 'قطعة لحم برقر 120 جم', yieldQty: 1, yieldUnit: 'حبة', items: [it('raw', 'm_beef', 120), it('raw', 'm_salt', 1.5), it('raw', 'm_spice', 2)], note: '' },
      { id: 'c_sauce', name: 'صوص البرقر الخاص', yieldQty: 1000, yieldUnit: 'جم', items: [it('raw', 'm_mayo', 600), it('raw', 'm_ketchup', 250), it('raw', 'm_pickle', 100), it('raw', 'm_mustard', 50), it('raw', 'm_spice', 10)], note: 'دفعة لتر تقريباً' },
      { id: 'c_spicy', name: 'صوص سبايسي', yieldQty: 1000, yieldUnit: 'جم', items: [it('comp', 'c_sauce', 700), it('raw', 'm_jalapeno', 200), it('raw', 'm_hot', 100)], note: 'مبني على صوص البرقر الخاص' },
      { id: 'c_veg', name: 'خضار البرقر', yieldQty: 1, yieldUnit: 'حصة', items: [it('raw', 'm_lettuce', 20), it('raw', 'm_tomato', 30), it('raw', 'm_onion', 15)], note: '' },
      { id: 'c_fries', name: 'حصة بطاطس مقلية', yieldQty: 1, yieldUnit: 'حصة', items: [it('raw', 'm_fries', 150), it('raw', 'm_oil', 20), it('raw', 'm_salt', 1)], note: '' },
    ];

    // ─── المنيو ───
    const comp = (name, price) => ({ name, price });
    S.products = [
      { id: 'p_classic', name: 'كلاسيك برقر', category: 'برقر', price: 22, appPrice: 26, active: true, items: [it('raw', 'm_bun', 1), it('comp', 'c_patty', 1), it('raw', 'm_cheddar', 1), it('comp', 'c_veg', 1), it('comp', 'c_sauce', 30), it('raw', 'm_box', 1), it('raw', 'm_napkin', 2)], competitors: [comp('مطعم منافس أ', 23), comp('مطعم منافس ب', 21), comp('مطعم منافس ج', 25)] },
      { id: 'p_double', name: 'دبل تشيز برقر', category: 'برقر', price: 34, appPrice: 39, active: true, items: [it('raw', 'm_bun', 1), it('comp', 'c_patty', 2), it('raw', 'm_cheddar', 2), it('comp', 'c_veg', 1), it('comp', 'c_sauce', 35), it('raw', 'm_box', 1), it('raw', 'm_napkin', 2)], competitors: [comp('مطعم منافس أ', 33), comp('مطعم منافس ب', 31), comp('مطعم منافس ج', 36)] },
      { id: 'p_spicy', name: 'سبايسي برقر', category: 'برقر', price: 25, appPrice: 29, active: true, items: [it('raw', 'm_bun', 1), it('comp', 'c_patty', 1), it('raw', 'm_cheddar', 1), it('comp', 'c_veg', 1), it('comp', 'c_spicy', 35), it('raw', 'm_jalapeno', 15), it('raw', 'm_box', 1), it('raw', 'm_napkin', 2)], competitors: [comp('مطعم منافس أ', 26), comp('مطعم منافس ج', 27)] },
      { id: 'p_fries', name: 'بطاطس مقلية', category: 'بطاطس وجانبي', price: 9, appPrice: 11, active: true, items: [it('comp', 'c_fries', 1), it('raw', 'm_friesbox', 1)], competitors: [comp('مطعم منافس أ', 7), comp('مطعم منافس ب', 9), comp('مطعم منافس ج', 8)] },
      { id: 'p_cfries', name: 'بطاطس بالجبن', category: 'بطاطس وجانبي', price: 13, appPrice: 15, active: true, items: [it('comp', 'c_fries', 1), it('raw', 'm_cheesesauce', 60), it('raw', 'm_friesbox', 1)], competitors: [comp('مطعم منافس أ', 14), comp('مطعم منافس ب', 12)] },
      { id: 'p_soda', name: 'مشروب غازي', category: 'مشروبات', price: 4, appPrice: 5, active: true, items: [it('raw', 'm_soda', 1)], competitors: [comp('مطعم منافس أ', 4), comp('مطعم منافس ب', 5)] },
      { id: 'p_water', name: 'مياه', category: 'مشروبات', price: 2, appPrice: 3, active: true, items: [it('raw', 'm_water', 1)], competitors: [] },
      { id: 'p_combo', name: 'وجبة كلاسيك', category: 'وجبات', price: 32, appPrice: 37, active: true, items: [it('prod', 'p_classic', 1), it('prod', 'p_fries', 1), it('prod', 'p_soda', 1), it('raw', 'm_bag', 1)], competitors: [comp('مطعم منافس أ', 33), comp('مطعم منافس ب', 30), comp('مطعم منافس ج', 35)] },
    ];
    const mixW = { p_combo: 0.3, p_classic: 0.14, p_double: 0.19, p_spicy: 0.1, p_fries: 0.1, p_cfries: 0.08, p_soda: 0.06, p_water: 0.03 };

    // ─── المصاريف قبل الافتتاح ───
    const exp = (o) => S.expenses.push(Object.assign({ id: id('x'), includesVat: false, taxable: true, account: 'bank', months: 1, startDate: '', entity: '', employeeId: '', note: '' }, o));
    exp({ date: RB.addDays(pre, 2), category: 'rent', desc: 'إيجار المحل — دفعة 6 أشهر', entity: 'المؤجر', amount: 36000, months: 6, startDate: pre });
    exp({ date: RB.addDays(pre, 1), category: 'gov', desc: 'السجل التجاري (تأكيد سنوي)', entity: 'وزارة التجارة', amount: 200, taxable: false, months: 12 });
    exp({ date: RB.addDays(pre, 1), category: 'gov', desc: 'اشتراك الغرفة التجارية', entity: 'الغرفة التجارية', amount: 800, taxable: false, months: 12 });
    exp({ date: RB.addDays(pre, 20), category: 'gov', desc: 'رخصة المحل التجاري', entity: 'بلدي (أمانة المنطقة)', amount: 1800, taxable: false, months: 12 });
    exp({ date: RB.addDays(pre, 22), category: 'gov', desc: 'شهادة السلامة', entity: 'الدفاع المدني (سلامة)', amount: 300, taxable: false, months: 12 });
    exp({ date: RB.addDays(pre, 30), category: 'labor_gov', desc: 'الشهادات الصحية للعمال', entity: 'بلدي (أمانة المنطقة)', amount: 400, taxable: false, months: 12 });
    exp({ date: RB.addDays(pre, 30), category: 'insurance', desc: 'تأمين طبي للعمال', entity: 'شركة التأمين', amount: 9500, months: 12 });
    for (const e of S.employees.filter((x) => x.nationality === 'expat')) {
      exp({ date: RB.addDays(empStart, -3), category: 'labor_gov', desc: 'رخصة عمل + المقابل المالي + إقامة', entity: 'قوى / مقيم', amount: 9600 + 650 + 100, taxable: false, months: 12, employeeId: e.id });
    }
    exp({ date: RB.addDays(pre, 8), category: 'marketing', desc: 'إعلانات الافتتاح وتصوير المنيو', amount: 4500 });

    // اشتراك الكاشير ربع سنوي — آخر تجديد ينتهي بعد أيام قليلة (لعرض تنبيه التجديد)
    const posLast = RB.addMonths(RB.addDays(today, 13), -3);
    for (const d of [RB.addMonths(posLast, -3), posLast]) if (d >= RB.addDays(opening, -15)) exp({ date: d, category: 'software', desc: 'اشتراك نظام نقاط البيع', entity: 'مزود نظام الكاشير', amount: 690, includesVat: true, months: 3 });

    // ─── التشغيل اليومي ───
    const need = {}; // احتياج المواد غير المشتراة بعد (بوحدة الاستخدام)
    const supplierRaw = (sup) => S.raw.filter((r) => r.supplier === sup);
    let cash = 0;
    const pending = {}; // مستحقات التطبيقات بانتظار التحويل
    const apps = { hungerstation: 0.4, jahez: 0.3, keeta: 0.15, mrsool: 0.08, thechefz: 0.07 };

    function buy(date, sup, opts) {
      const lines = [];
      for (const r of supplierRaw(sup)) {
        const q = need[r.id] || 0;
        const packs = opts.initial ? 2 : q > 0 ? Math.ceil((q * 1.06) / r.packQty) : 0;
        if (!packs) continue;
        need[r.id] = q - packs * r.packQty;
        lines.push({ rawId: r.id, desc: r.name, qty: packs, price: r.price });
      }
      if (!lines.length) return;
      const p = Object.assign({ id: id('b'), date, invoiceNo: String(1000 + n), includesVat: false, note: '', lines }, opts.inv);
      delete p.initial;
      S.purchases.push(p);
      if (p.account === 'cash') cash -= RB.vatSplit(RB.purchaseTotal(p), p.includesVat, p.taxable, S.settings).gross;
    }
    const SUP = {
      meat: { supplier: 'مؤسسة اللحوم الطازجة', category: 'food', account: 'payable', taxable: true },
      bread: { supplier: 'مخبز الريان', category: 'food', account: 'cash', taxable: true },
      // مورد غير مسجل في الضريبة (لا إعفاء للخضار في السعودية): بلا فاتورة ضريبية ولا رقم فاتورة
      veg: { supplier: 'بائع خضار (غير مسجل في الضريبة)', category: 'food', account: 'cash', taxable: false, invoiceNo: '', note: 'مورد غير مسجل في الضريبة — لا فاتورة ضريبية' },
      dry: { supplier: 'شركة التموين الغذائي', category: 'food', account: 'bank', taxable: true },
      pack: { supplier: 'مصنع التغليف الحديث', category: 'packaging', account: 'bank', taxable: true },
      drinks: { supplier: 'موزع المشروبات', category: 'drinks', account: 'bank', taxable: true },
    };

    // مخزون افتتاحي قبل الافتتاح بيومين
    for (const sup of Object.keys(SUP)) buy(RB.addDays(opening, -2), sup, { initial: true, inv: SUP[sup] });

    let d = opening;
    let dayIdx = 0;
    while (d <= yesterday) {
      const wd = RB.weekday(d);
      const dom = +d.slice(8, 10);
      const g = 0.72 + 0.38 * Math.min(1, dayIdx / 75);
      const wf = wd === 4 ? 1.25 : wd === 5 ? 1.35 : wd === 6 ? 1.1 : 1;
      const orders = Math.round(80 * g * wf * between(0.85, 1.15));
      const ch = {};
      const store = { cash: 0.3, card: 0.7 };
      const storeOrders = Math.round(orders * 0.5);
      for (const k of Object.keys(store)) {
        const o = Math.round(storeOrders * store[k] * between(0.85, 1.15));
        ch[k] = { amount: r2(o * between(31, 37)), orders: o };
      }
      for (const k of Object.keys(apps)) {
        const o = Math.round((orders - storeOrders) * apps[k] * between(0.8, 1.2));
        if (o > 0) ch[k] = { amount: r2(o * between(42, 50)), orders: o };
      }
      // لقطة نسبة العمولة ونوع القناة وقت الإدخال
      for (const k of Object.keys(ch)) {
        const c = RB.channelOf(S, k);
        ch[k].feePct = c.feePct;
        ch[k].type = c.type;
      }
      const total = Object.values(ch).reduce((s, v) => s + v.amount, 0);
      const items = [];
      for (const pid of Object.keys(mixW)) {
        const p = S.products.find((x) => x.id === pid);
        const q = Math.round((total * mixW[pid]) / p.price);
        if (q > 0) items.push({ productId: pid, qty: q });
        const use = RB.explode(S, 'prod', pid, q);
        for (const rid of Object.keys(use)) need[rid] = (need[rid] || 0) + use[rid];
      }
      S.sales.push({ id: id('s'), date: d, channels: ch, items, note: '' });
      cash += ch.cash ? ch.cash.amount : 0;
      for (const k of Object.keys(apps)) if (ch[k]) pending[k] = (pending[k] || 0) + RB.saleChannelSplit(S, k, ch[k]).receive;

      // المشتريات حسب الاستهلاك
      if (wd === 0 || wd === 3) buy(d, 'meat', { inv: SUP.meat });
      if (dayIdx % 2 === 1) buy(d, 'bread', { inv: SUP.bread });
      if (dayIdx % 2 === 0 && dayIdx > 0) buy(d, 'veg', { inv: SUP.veg });
      if (wd === 1) buy(d, 'dry', { inv: SUP.dry });
      if (wd === 2 && dayIdx % 14 < 7) buy(d, 'pack', { inv: SUP.pack });
      if (wd === 2) buy(d, 'drinks', { inv: SUP.drinks });
      if (wd === 6) {
        const amt = r2(between(180, 320));
        S.purchases.push({ id: id('b'), date: d, supplier: 'محل المنظفات', invoiceNo: '', category: 'consumables', account: 'cash', includesVat: true, taxable: true, note: '', lines: [{ rawId: '', desc: 'منظفات ومستهلكات', qty: 1, price: amt }] });
        cash -= amt;
        S.purchases.push({ id: id('b'), date: d, supplier: 'موزع الغاز', invoiceNo: '', category: 'gas', account: 'cash', includesVat: true, taxable: true, note: '', lines: [{ rawId: '', desc: 'تعبئة غاز', qty: 3, price: 25 }] });
        cash -= 75;
      }

      // تحويلات التطبيقات كل اثنين
      if (wd === 1 && dayIdx > 3) {
        for (const k of Object.keys(pending)) {
          const amt = r2(pending[k]);
          if (amt <= 0) continue;
          const ded = rnd() < 0.15 ? r2(between(40, 150)) : 0;
          S.payouts.push({ id: id('o'), date: d, channelId: k, amount: r2(amt - ded), deductions: ded, dedType: 'sale', note: ded ? 'خصم عرض ترويجي' : '' });
          pending[k] = 0;
        }
      }
      // إيداع نقدية الصندوق في البنك (يبقى 500 للفكة)
      if ((wd === 0 || wd === 3) && cash > 1500) {
        const amt = Math.floor((cash - 500) / 100) * 100;
        S.transfers.push({ id: id('t'), date: d, from: 'cash', to: 'bank', amount: amt, note: '' });
        cash -= amt;
      }
      // سداد مورد اللحوم أول كل شهر
      if (dom === 1 && dayIdx > 0) {
        const bal = RB.supplierBalances(S, RB.addDays(d, -1)).find((x) => x.supplier === SUP.meat.supplier);
        if (bal && bal.balance > 0) S.supplierPayments.push({ id: id('y'), date: d, supplier: SUP.meat.supplier, account: 'bank', amount: bal.balance, note: 'سداد فواتير الشهر' });
      }
      // مصاريف شهرية
      if (dom === 12 && dayIdx > 10) {
        exp({ date: d, category: 'utilities', desc: 'فاتورة الكهرباء', entity: 'الشركة السعودية للكهرباء', amount: r2(between(2600, 3600)), includesVat: true });
        exp({ date: d, category: 'utilities', desc: 'فاتورة المياه', entity: 'شركة المياه الوطنية', amount: r2(between(260, 380)), includesVat: true });
      }
      if (dom === 5) exp({ date: d, category: 'telecom', desc: 'إنترنت المحل', entity: 'مزود الاتصالات', amount: 345, includesVat: true });
      if (dom === 20) exp({ date: d, category: 'marketing', desc: 'إعلانات سناب', amount: 1500, includesVat: true });
      if (dayIdx === 40) {
        exp({ date: d, category: 'maintenance', desc: 'صيانة القلاية', amount: 650, includesVat: true, account: 'cash' });
        cash -= 650;
      }
      if (dom === 25 && dayIdx < 40) exp({ date: d, category: 'cleaning', desc: 'مكافحة حشرات (3 أشهر)', amount: 600, months: 3, includesVat: true });
      // سكن العمال كل 3 أشهر
      if (d === RB.addMonths(RB.addDays(opening, -15), 3)) {
        exp({ date: d, category: 'housing', desc: 'إيجار سكن العمال — 3 أشهر', entity: 'مالك السكن', amount: 4500, taxable: false, months: 3 });
      }
      d = RB.addDays(d, 1);
      dayIdx++;
    }
    // دفعة سكن العمال الأولى (قبل الافتتاح)
    exp({ date: RB.addDays(opening, -15), category: 'housing', desc: 'إيجار سكن العمال — 3 أشهر', entity: 'مالك السكن', amount: 4500, taxable: false, months: 3 });

    // ─── الرواتب ───
    for (let ym = RB.ymAdd(openYm, -1); ym < thisYm; ym = RB.ymAdd(ym, 1)) {
      const date = RB.monthEnd(ym);
      if (date > today) break;
      // الشهر الأول جزئي: باشروا قبل نهايته بعشرين يوماً، فيُخصم من رواتبهم ما لم يعملوه (RB.payrollLine)
      const lines = S.employees.filter((e) => RB.isEmployeeActive(e, ym)).map((e) => RB.payrollLine(e, S, ym));
      S.payroll.push({ id: id('w'), month: ym, date, account: 'bank', gosiAccount: 'bank', lines, note: ym < openYm ? 'شهر جزئي قبل الافتتاح' : '' });
    }

    // ─── الجرد آخر كل شهر ───
    for (let ym = openYm; ym < thisYm; ym = RB.ymAdd(ym, 1)) {
      const date = RB.monthEnd(ym);
      S.stockCounts.push({ id: id('k'), date, note: 'جرد نهاية الشهر', lines: S.raw.map((r) => ({ rawId: r.id, qty: Math.round(between(0.6, 2.4) * 2) / 2, price: r.price })) });
    }

    // ─── سداد ضريبة القيمة المضافة للأرباع المنتهية ───
    for (const p of RB.vatPeriodsBetween(S, pre, today)) {
      const due = RB.addDays(p.to, 25);
      if (p.to >= today || due > today) continue;
      const v = RB.vatDue(S, p);
      if (v.due > 0) S.vatPayments.push({ id: id('v'), date: due, period: p.label, account: 'bank', amount: v.due, note: '' });
    }

    // تنظيف الحقول المساعدة
    S.raw.forEach((r) => {
      r.supplier = { meat: SUP.meat.supplier, bread: SUP.bread.supplier, veg: SUP.veg.supplier, dry: SUP.dry.supplier, pack: SUP.pack.supplier, drinks: SUP.drinks.supplier }[r.supplier] || '';
    });
    return S;
  };
})(typeof window !== 'undefined' ? window : globalThis);
