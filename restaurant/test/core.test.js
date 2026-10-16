// اختبارات المنطق الحسابي — تشغيل: node --test restaurant/test
const test = require('node:test');
const assert = require('node:assert/strict');
const RB = require('../core.js');
require('../demo.js');

const close = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

function base() {
  const S = RB.emptyState();
  S.partners = [{ id: 'p1', name: 'أ', share: 60 }, { id: 'p2', name: 'ب', share: 40 }];
  return S;
}

test('تقسيم الضريبة: شامل، غير شامل، وغير خاضع', () => {
  const st = RB.defaultSettings();
  assert.deepEqual(RB.vatSplit(115, true, true, st), { net: 100, vat: 15, gross: 115 });
  assert.deepEqual(RB.vatSplit(100, false, true, st), { net: 100, vat: 15, gross: 115 });
  assert.deepEqual(RB.vatSplit(100, true, false, st), { net: 100, vat: 0, gross: 100 });
  const unreg = Object.assign(RB.defaultSettings(), { vatRegistered: false });
  assert.equal(RB.costSplit(100, false, true, unreg).cost, 115);
  assert.equal(RB.costSplit(100, false, true, unreg).vat, 0);
});

test('تكلفة الوصفات المتداخلة: منتج مجمّع داخل منتج مجمّع، وصنف داخل صنف', () => {
  const S = base();
  S.raw = [
    { id: 'beef', name: 'لحم', price: 400, packQty: 10000, useUnit: 'جم', taxable: true, wastePct: 0 },
    { id: 'mayo', name: 'مايونيز', price: 30, packQty: 3000, useUnit: 'مل', taxable: true, wastePct: 0 },
    { id: 'onion', name: 'بصل', price: 20, packQty: 10000, useUnit: 'جم', taxable: false, wastePct: 20 },
    { id: 'box', name: 'علبة', price: 100, packQty: 200, useUnit: 'حبة', taxable: true, wastePct: 0 },
  ];
  // تكلفة الوحدة: لحم 0.04/جم، مايونيز 0.01/مل، بصل 0.002/0.8 = 0.0025/جم، علبة 0.5
  S.composites = [
    { id: 'sauce', name: 'صوص', yieldQty: 1000, yieldUnit: 'جم', items: [{ kind: 'raw', id: 'mayo', qty: 800 }, { kind: 'raw', id: 'onion', qty: 200 }] },
    { id: 'spicy', name: 'سبايسي', yieldQty: 500, yieldUnit: 'جم', items: [{ kind: 'comp', id: 'sauce', qty: 500 }] },
  ];
  S.products = [
    { id: 'burger', name: 'برقر', price: 23, items: [{ kind: 'raw', id: 'beef', qty: 150 }, { kind: 'comp', id: 'spicy', qty: 40 }, { kind: 'raw', id: 'box', qty: 1 }] },
    { id: 'combo', name: 'وجبة', price: 30, items: [{ kind: 'prod', id: 'burger', qty: 2 }] },
  ];
  const C = RB.costing(S);
  close(C.raw.onion, 0.0025, 1e-9);
  close(C.comp.sauce, (800 * 0.01 + 200 * 0.0025) / 1000, 1e-9); // 0.0085
  close(C.comp.spicy, (500 * 0.0085) / 500, 1e-9);
  close(C.prod.burger, 150 * 0.04 + 40 * 0.0085 + 0.5, 1e-9); // 6.84
  close(C.prod.combo, 2 * 6.84, 1e-9);
  assert.equal(C.errors.length, 0);

  const st = RB.productStats(S, S.products[0], C);
  close(st.priceNet, 20, 1e-9);
  close(st.foodCost, (6.84 / 20) * 100, 1e-9);
  assert.equal(st.suggested, 27); // 6.84 / 0.30 × 1.15 = 26.22 ← تقريب لأعلى

  const use = RB.explode(S, 'prod', 'combo', 3);
  close(use.beef, 900, 1e-9);
  close(use.mayo, 6 * 40 * 0.8, 1e-9);
  assert.ok(RB.wouldCycle(S, 'comp', 'sauce', 'comp', 'spicy'), 'الصوص داخل السبايسي، فإضافة السبايسي للصوص حلقة');
  assert.ok(!RB.wouldCycle(S, 'comp', 'spicy', 'comp', 'sauce'));
  assert.ok(RB.wouldCycle(S, 'prod', 'burger', 'prod', 'combo'));
});

test('المصروف المدفوع مقدماً يتوزع على أشهره والإهلاك يبدأ من الافتتاح', () => {
  const S = base();
  S.settings.openingDate = '2026-03-01';
  S.capital = [{ id: 'c1', date: '2026-01-05', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 100000 }];
  S.expenses = [{ id: 'x1', date: '2026-01-10', category: 'rent', desc: 'إيجار', amount: 36000, includesVat: false, taxable: true, account: 'bank', months: 6, startDate: '2026-02-01' }];
  S.assets = [{ id: 'a1', date: '2026-01-20', name: 'شواية', category: 'kitchen', amount: 12000, includesVat: false, taxable: true, account: 'partner:p2', lifeMonths: 24, salvage: 0 }];
  const L = RB.buildLedger(S, '2026-12-31');
  for (const e of L.entries) close(RB.sum(e.lines, (l) => l.v), 0, 0.001);
  const feb = RB.incomeStatement(S, '2026-02-01', '2026-02-28', L);
  close(feb.tot.occ, 6000);
  close(feb.tot.dep, 0); // قبل الافتتاح
  const mar = RB.incomeStatement(S, '2026-03-01', '2026-03-31', L);
  close(mar.tot.dep, 500);
  const b = RB.balances(L.entries, null, '2026-12-31');
  close(b['1105'] || 0, 0); // انتهت التغطية
  close(-(b['cap:p2'] || 0), 13800); // دفعها الشريك الثاني من حسابه شاملة الضريبة
  const sch = RB.depSchedule(S.assets[0], S);
  close(RB.sum(sch.months, (m) => m.amount), 12000);
  assert.equal(sch.months[0].date, '2026-03-01');
  assert.equal(RB.coverageEnd('2026-02-01', 6), '2026-07-31');
});

test('مبيعات التطبيق: الضريبة والعمولة وضريبة العمولة والمستحق', () => {
  const S = base();
  const x = RB.saleChannelSplit(S, 'jahez', { amount: 115, orders: 3, feePct: 20, type: 'app' });
  assert.equal(x.net, 100);
  assert.equal(x.outVat, 15);
  assert.equal(x.fee, 23);
  assert.equal(x.feeVat, 3.45);
  assert.equal(x.receive, 88.55);
  S.sales = [{ id: 's1', date: '2026-05-01', channels: { jahez: { amount: 115, orders: 3, feePct: 20, type: 'app' }, cash: { amount: 230, orders: 5, type: 'cash' } }, items: [] }];
  S.payouts = [{ id: 'o1', date: '2026-05-04', channelId: 'jahez', amount: 80, deductions: 8.55 }];
  const L = RB.buildLedger(S, '2026-05-31');
  const b = RB.balances(L.entries, null, '2026-05-31');
  close(b['1101'], 230);
  close(b['1103'] || 0, 0);
  close(b['1102'], 80);
  close(-b['2102'], 15 + 30 - 3.45);
  assert.equal(RB.appReceivables(S, '2026-05-02')[0].balance, 88.55);
});

test('الرواتب والتأمينات للسعودي وغير السعودي', () => {
  const S = base();
  const sa = { id: 'e1', nationality: 'saudi', basic: 4000, housing: 1000, transport: 500 };
  const ex = { id: 'e2', nationality: 'expat', basic: 2000, housing: 0, levyMonthly: 800, iqamaAnnual: 650, workPermitAnnual: 100 };
  assert.deepEqual(RB.gosiFor(sa, S), { base: 5000, er: 587.5, ee: 487.5 });
  assert.deepEqual(RB.gosiFor(ex, S), { base: 2000, er: 40, ee: 0 });
  const c = RB.employeeMonthlyCost(ex, S);
  close(c.total, 2000 + 40 + 800 + 750 / 12 + 2000 / 24);
  S.employees = [sa, ex];
  S.payroll = [{ id: 'w1', month: '2026-05', date: '2026-05-31', account: 'bank', gosiAccount: 'bank', lines: [RB.payrollLine(sa, S), RB.payrollLine(ex, S)] }];
  const t = RB.payrollTotals(S.payroll[0]);
  assert.equal(t.gross, 7500);
  assert.equal(t.net, 7012.5);
  assert.equal(t.cost, 8127.5);
  const inc = RB.incomeStatement(S, '2026-05-01', '2026-05-31');
  // التكلفة + مخصص نهاية الخدمة (الأجر ÷ 24 لأقل من خمس سنوات): (5,500 + 2,000) ÷ 24
  close(inc.tot.labor, 8127.5 + RB.r2(5500 / 24) + RB.r2(2000 / 24));
});

test('غير المسجل في الضريبة: لا ضريبة مبيعات والضريبة المدفوعة تكلفة', () => {
  const S = base();
  S.settings.vatRegistered = false;
  S.purchases = [{ id: 'b1', date: '2026-05-02', category: 'food', account: 'cash', taxable: true, includesVat: false, lines: [{ qty: 2, price: 50 }] }];
  S.sales = [{ id: 's1', date: '2026-05-02', channels: { cash: { amount: 500, orders: 10, type: 'cash' } } }];
  const inc = RB.incomeStatement(S, '2026-05-01', '2026-05-31');
  assert.equal(inc.revenue, 500);
  assert.equal(inc.tot.cogs, 115);
  const v = RB.vatReport(S, '2026-05-01', '2026-05-31');
  assert.equal(v.net, 0);
});

test('ترحيل الرصيد الدائن للضريبة إلى الفترة التالية', () => {
  const S = base();
  S.assets = [{ id: 'a1', date: '2026-05-10', name: 'معدات', category: 'kitchen', amount: 20000, includesVat: false, taxable: true, account: 'bank', lifeMonths: 60 }];
  S.sales = [{ id: 's1', date: '2026-08-10', channels: { cash: { amount: 23000, orders: 100, type: 'cash' } } }];
  const [q2, q3] = RB.vatPeriodsBetween(S, '2026-05-01', '2026-09-30');
  assert.equal(q2.key, '2026-Q2');
  const d2 = RB.vatDue(S, q2);
  assert.equal(d2.due, 0);
  assert.equal(d2.credit, 3000);
  const d3 = RB.vatDue(S, q3);
  assert.equal(d3.net, 3000);
  assert.equal(d3.carried, -3000);
  assert.equal(d3.due, 0);
});

test('البيانات التجريبية: كل القيود متوازنة والميزانية متوازنة والأرباح متسقة', () => {
  for (const today of ['2026-10-09', '2027-02-17', '2026-12-31']) {
    const S = RB.demoState(today);
    const L = RB.buildLedger(S, today);
    assert.ok(L.entries.length > 500);
    for (const e of L.entries) close(RB.sum(e.lines, (l) => l.v), 0, 0.001);
    assert.ok(L.rounding < 0.05, 'تقريب ' + L.rounding);
    const bs = RB.balanceSheet(S, today, L);
    close(bs.check, 0);
    const all = RB.incomeStatement(S, '2000-01-01', today, L);
    close(all.net, bs.retained);
    const tb = RB.trialBalance(S, null, today, L);
    close(tb.dr, tb.cr);
    const C = RB.costing(S);
    assert.equal(C.errors.length, 0);
    const p = RB.partnersReport(S, '2000-01-01', today, L);
    close(RB.sum(p.rows, (r) => r.equity), bs.tEq);
    const ym = RB.ymAdd(today.slice(0, 7), -1);
    const m = RB.menuAnalysis(S, ym + '-01', RB.monthEnd(ym), L);
    assert.ok(m.theoretical > 0 && m.actual > 0);
  }
});

test('تصدير CSV يهرب الفواصل وعلامات التنصيص', () => {
  assert.equal(RB.toCSV([['أ', 'ب,ج', 'قال "نعم"', 1.005]]), '﻿أ,"ب,ج","قال ""نعم""",1.01');
});

test('تصدير CSV يمنع حقن المعادلات ويحيط السطر الذي فيه CR بعلامات تنصيص (WP3)', () => {
  assert.equal(RB.toCSV([['=1+1', -5, 'a\rb']]), '﻿' + "'=1+1,-5,\"a\rb\"");
  // كل بادئة خطرة في النص تُعطَّل، والأرقام السالبة والصفر تبقى أرقاماً، والفارغ يبقى فارغاً
  assert.equal(RB.toCSV([['+966500000000', '-سحب', '@SUM(A1)', '\tx', -12.345, 0, null, undefined, '']]), "﻿'+966500000000,'-سحب,'@SUM(A1),'\tx,-12.35,0,,,");
  // نص بمعادلة وفاصلة: البادئة داخل علامات التنصيص
  assert.equal(RB.toCSV([['=HYPERLINK("http://x","y")']]), '﻿"\'=HYPERLINK(""http://x"",""y"")"');
  // نص عادي أو تاريخ لا يتغير، والأسطر تُفصل بـ \n
  assert.equal(RB.toCSV([['2026-08-01', 'برقر'], ['a\nb', 3]]), '﻿2026-08-01,برقر\n"a\nb",3');
});

// ───────── دفعة التصحيحات المحاسبية (WP1) ─────────

test('الفترة الجارية تُقطع عند اليوم: لا إهلاك ولا تحميل لأشهر لم تأتِ بعد', () => {
  const today = '2026-10-14';
  const S = RB.demoState(today);
  const L = RB.buildLedger(S, today);
  assert.ok(L.entries.every((e) => e.date <= today));
  const year = RB.incomeStatement(S, '2026-01-01', today, L);
  const p = RB.partnersReport(S, '2026-01-01', today, L);
  close(year.net, p.net);
  // صافي السنة حتى اليوم + ما قبلها = الأرباح المتراكمة في الميزانية
  const before = RB.incomeStatement(S, '2000-01-01', '2025-12-31', L);
  close(year.net + before.net, RB.balanceSheet(S, today, L).retained);
  // بدون القطع كانت السنة تحمّل إهلاك نوفمبر وديسمبر مسبقاً
  const uncut = RB.incomeStatement(S, '2026-01-01', '2026-12-31', RB.buildLedger(S, '2026-12-31'));
  assert.ok(uncut.tot.dep > year.tot.dep + 1);
  // الربع الجاري (أكتوبر–ديسمبر) حتى اليوم = أكتوبر حتى اليوم؛ بدون القطع ينقص بإهلاك الشهرين القادمين
  const q = RB.incomeStatement(S, '2026-10-01', today, L);
  const qUncut = RB.incomeStatement(S, '2026-10-01', '2026-12-31', RB.buildLedger(S, '2026-12-31'));
  close(q.net, RB.incomeStatement(S, '2026-10-01', '2026-10-31', L).net);
  assert.ok(qUncut.net < q.net - 1);
});

test('«كل الفترات» تبدأ من أول قيد: إيجار تغطيته قبل أول تاريخ مسجل', () => {
  const S = base();
  S.partners = [{ id: 'p1', name: 'أ', share: 100 }];
  S.capital = [{ id: 'c', date: '2026-03-15', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 50000 }];
  S.expenses = [{ id: 'r', date: '2026-03-15', category: 'rent', desc: 'إيجار', amount: 36000, taxable: false, months: 6, startDate: '2026-01-01', account: 'bank' }];
  const today = '2026-10-14';
  const L = RB.buildLedger(S, today);
  // أول تاريخ في السجلات 15 مارس، لكن أول قيد (تحميل يناير) قبله
  const first = L.entries[0].date;
  assert.equal(first, '2026-01-01');
  const lo = RB.SECTIONS.reduce((m, k) => S[k].reduce((a, r) => (r.date && r.date < a ? r.date : a), m), today);
  assert.equal(lo, '2026-03-15');
  const fromRecords = RB.incomeStatement(S, lo, today, L);
  assert.ok(fromRecords.net > -36000, 'البدء من أول سجل يُسقط تحميل يناير وفبراير');
  const all = RB.incomeStatement(S, first < lo ? first : lo, today, L);
  close(all.net, -36000);
  close(all.net, RB.balanceSheet(S, today, L).retained);
});

// ضريبة مبيعات 1,500 في كل من الربع الثاني والثالث 2026
function vatTwoQuarters(period) {
  const S = base();
  if (period) S.settings.vatPeriod = period;
  S.capital = [{ id: 'c', date: '2026-04-01', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 100000 }];
  S.sales = [
    { id: 's1', date: period === 'monthly' ? '2026-08-10' : '2026-05-10', channels: { cash: { amount: 11500, orders: 10, type: 'cash', feePct: 0 } } },
    { id: 's2', date: period === 'monthly' ? '2026-09-10' : '2026-08-10', channels: { cash: { amount: 11500, orders: 10, type: 'cash', feePct: 0 } } },
  ];
  return S;
}

test('إقرارات الضريبة: مستحق كل فترة وحده حتى لو سُدد السابق متأخراً', () => {
  // (أ) سداد الربع الثاني متأخراً بعد نهاية الثالث
  const S = vatTwoQuarters();
  const [q2, q3] = RB.vatPeriodsBetween(S, '2026-04-01', '2026-09-30');
  S.vatPayments = [
    { id: 'v2', date: '2026-10-05', period: q2.label, account: 'bank', amount: 1500 },
    { id: 'v3', date: '2026-10-20', period: q3.label, account: 'bank', amount: 1500 },
  ];
  const rows = RB.vatReturns(S, '2026-12-31');
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(by['2026-Q2'].due, 1500);
  assert.equal(by['2026-Q2'].settled, true);
  assert.equal(by['2026-Q3'].due, 1500);
  assert.equal(by['2026-Q3'].remaining, 0);
  assert.equal(by['2026-Q3'].settled, true);
  assert.equal(by['2026-Q4'].carried, 0);
  assert.equal(by['2026-Q4'].due, 0);
  // vatDue يعطي نفس الصف، بدفتر حتى نهاية الفترة
  const d3 = RB.vatDue(S, q3, RB.buildLedger(S, q3.to));
  assert.equal(d3.due, 1500);
  assert.equal(d3.settled, true);
  // قبل سداد الربع الثالث: المستحق 1,500 وليس 3,000 ولا صفر
  S.vatPayments = S.vatPayments.slice(0, 1);
  assert.equal(RB.vatDue(S, q3).due, 1500);
  assert.equal(RB.vatDue(S, q3).settled, false);

  // (ب) سداد جزئي داخل الفترة نفسها: لا يُخصم مرتين
  const S2 = vatTwoQuarters();
  S2.vatPayments = [
    { id: 'v2', date: '2026-07-20', period: q2.label, account: 'bank', amount: 1500 },
    { id: 'v3', date: '2026-09-30', period: q3.label, account: 'bank', amount: 1000 },
  ];
  const e3 = RB.vatDue(S2, q3);
  assert.equal(e3.due, 1500);
  assert.equal(e3.paid, 1000);
  assert.equal(e3.remaining, 500);
  assert.equal(e3.settled, false);

  // (ج) إقرار شهري: سداد أغسطس في أكتوبر لا يُضاف إلى سبتمبر
  const S3 = vatTwoQuarters('monthly');
  const pers = RB.vatPeriodsBetween(S3, '2026-08-01', '2026-09-30');
  S3.vatPayments = [{ id: 'v8', date: '2026-10-01', period: pers[0].label, account: 'bank', amount: 1500 }];
  const sep = RB.vatDue(S3, pers[1]);
  assert.equal(sep.key, '2026-09');
  assert.equal(sep.due, 1500);
  assert.equal(sep.carried, 0);
});

test('إقرارات الضريبة: الرصيد الدائن يُرحّل، والاسترداد يلغيه', () => {
  const S = base();
  S.assets = [{ id: 'a1', date: '2026-05-10', name: 'معدات', category: 'kitchen', amount: 20000, includesVat: false, taxable: true, account: 'bank', lifeMonths: 60 }];
  S.sales = [{ id: 's1', date: '2026-08-10', channels: { cash: { amount: 46000, orders: 100, type: 'cash' } } }];
  const [q2, q3] = RB.vatPeriodsBetween(S, '2026-05-01', '2026-09-30');
  let d3 = RB.vatDue(S, q3);
  assert.equal(d3.carried, -3000);
  assert.equal(d3.due, 3000); // 6,000 − 3,000 المرحّل
  // استرداد الرصيد الدائن من الهيئة (مبلغ سالب لفترته) فلا يُرحّل
  S.vatPayments = [{ id: 'r2', date: '2026-07-15', period: q2.label, account: 'bank', amount: -3000 }];
  const d2 = RB.vatDue(S, q2);
  assert.equal(d2.credit, 0);
  d3 = RB.vatDue(S, q3);
  assert.equal(d3.carried, 0);
  assert.equal(d3.due, 6000);
});

test('إقرارات الضريبة: الدفعة الزائدة تُرحّل رصيداً دائناً للفترة التالية', () => {
  const S = vatTwoQuarters();
  const [q2, q3] = RB.vatPeriodsBetween(S, '2026-04-01', '2026-09-30');
  S.vatPayments = [{ id: 'v2', date: '2026-07-20', period: q2.label, account: 'bank', amount: 3000 }];
  const by = Object.fromEntries(RB.vatReturns(S, '2026-10-14').map((r) => [r.key, r]));
  assert.equal(by['2026-Q2'].over, 1500);
  assert.equal(by['2026-Q2'].credit, 1500);
  assert.equal(by['2026-Q3'].carried, -1500);
  assert.equal(by['2026-Q3'].due, 0);
  assert.equal(by['2026-Q3'].settled, true);
  assert.equal(by['2026-Q4'].carried, 0);
  assert.equal(RB.vatBalanceAt(S, '2026-10-14'), 0);
  // دفعة زائدة جزئياً: المتبقي من الربع الثالث = مستحقه − الزيادة
  S.vatPayments[0].amount = 2000;
  const d3 = RB.vatDue(S, q3);
  assert.equal(d3.carried, -500);
  assert.equal(d3.due, 1000);
  assert.equal(d3.remaining, 1000);
  close(d3.remaining, RB.vatBalanceAt(S, '2026-10-14'));
  // استرداد الزيادة من الهيئة يلغي الترحيل، ومستحق الربع الثاني يبقى 1,500
  S.vatPayments = [
    { id: 'v2', date: '2026-07-20', period: q2.label, account: 'bank', amount: 3000 },
    { id: 'r2', date: '2026-08-20', period: q2.label, account: 'bank', amount: -1500 },
  ];
  const r = RB.vatReturns(S, '2026-10-14');
  assert.deepEqual([r[0].due, r[0].over, r[0].credit, r[0].settled], [1500, 0, 0, true]);
  assert.deepEqual([r[1].carried, r[1].due, r[1].remaining], [0, 1500, 1500]);
  // استرداد أكبر من الرصيد الدائن: الزيادة متبقية على الفترة (كما في رصيد حساب الضريبة)
  const C = base();
  C.assets = [{ id: 'a1', date: '2026-05-10', name: 'معدات', category: 'kitchen', amount: 20000, includesVat: false, taxable: true, account: 'bank', lifeMonths: 60 }];
  C.vatPayments = [{ id: 'r', date: '2026-07-15', period: q2.label, account: 'bank', amount: -4000 }];
  const c2 = RB.vatReturns(C, '2026-10-14')[0];
  assert.deepEqual([c2.key, c2.due, c2.credit, c2.remaining, c2.settled], ['2026-Q2', 0, 0, 1000, false]);
});

test('إقرارات الضريبة: تغيير فترة الإقرار لا يترك المدفوعات السابقة بلا فترة', () => {
  // ربع سنوي ← شهري: سداد الربع يُنسب لأشهره ويملأ مستحقها بالترتيب
  const S = vatTwoQuarters();
  S.sales.push({ id: 's3', date: '2026-06-10', channels: { cash: { amount: 11500, orders: 10, type: 'cash', feePct: 0 } } });
  const [q2, q3] = RB.vatPeriodsBetween(S, '2026-04-01', '2026-09-30');
  S.vatPayments = [
    { id: 'v2', date: '2026-07-20', period: q2.label, account: 'bank', amount: 3000 },
    { id: 'v3', date: '2026-10-05', period: q3.label, account: 'bank', amount: 1500 },
  ];
  assert.ok(RB.vatReturns(S, '2026-10-14').every((r) => r.settled));
  S.settings.vatPeriod = 'monthly';
  const m = Object.fromEntries(RB.vatReturns(S, '2026-10-14').map((r) => [r.key, r]));
  assert.deepEqual([m['2026-05'].paid, m['2026-06'].paid, m['2026-08'].paid], [1500, 1500, 1500]);
  assert.ok(Object.values(m).every((r) => r.settled && r.credit === 0));
  // شهري ← ربع سنوي: سداد الأشهر يُجمع في ربعها
  const M = vatTwoQuarters('monthly');
  M.vatPayments = [
    { id: 'a', date: '2026-09-05', period: 'أغسطس 2026', account: 'bank', amount: 1500 },
    { id: 'b', date: '2026-10-05', period: 'سبتمبر 2026', account: 'bank', amount: 1000 },
  ];
  M.settings.vatPeriod = 'quarterly';
  const q = RB.vatReturns(M, '2026-10-14').find((r) => r.key === '2026-Q3');
  assert.deepEqual([q.due, q.paid, q.remaining, q.settled], [3000, 2500, 500, false]);
  close(q.remaining, RB.vatBalanceAt(M, '2026-10-14'));
  // اسم فترة غير معروف: يُنسب لآخر فترة انتهت قبل تاريخ السداد
  const U = vatTwoQuarters();
  U.vatPayments = [{ id: 'u', date: '2026-10-05', period: 'سداد ضريبة', account: 'bank', amount: 1500 }];
  const u = RB.vatReturns(U, '2026-10-14');
  assert.deepEqual(u.map((r) => [r.key, r.paid]), [['2026-Q2', 0], ['2026-Q3', 1500], ['2026-Q4', 0]]);
  assert.equal(RB.vatLabelRange('الربع الثالث 2026').to, '2026-09-30');
  assert.equal(RB.vatLabelRange('فبراير 2028').to, '2028-02-29');
  assert.equal(RB.vatLabelRange('سداد ضريبة'), null);
});

test('إقرارات الضريبة: سداد لفترة قبل بداية الإقرارات للعلم فقط ولا يُخصم من أول إقرار', () => {
  // مطعم قائم بدأ دفتره في أكتوبر 2026: مبيعات نقدية أكتوبر–ديسمبر، ضريبة الربع الرابع 13,800
  const mk = () => {
    const S = base();
    S.settings.openingDate = '2024-03-01';
    S.sales = [];
    for (const ym of ['2026-10', '2026-11', '2026-12'])
      for (let d = 1; d <= +RB.monthEnd(ym).slice(8); d++) S.sales.push({ id: ym + d, date: ym + '-' + String(d).padStart(2, '0'), channels: { cash: { amount: 1150, orders: 30, type: 'cash' } } });
    return S;
  };
  const T = '2027-01-10';
  // (ب) سداد الربع الثاني بتاريخ قبل الدفتر: لا يُنشئ إقراراً للربع الثالث ولا يُخصم من الرابع
  const B = mk();
  B.vatPayments = [{ id: 'v', date: '2026-07-25', period: 'الربع الثاني 2026', account: 'bank', amount: 9000 }];
  const rb = RB.vatReturns(B, T);
  assert.deepEqual(rb.map((r) => r.key), ['2026-Q4', '2027-Q1']);
  close(rb[0].net, 13800);
  assert.deepEqual([rb[0].due, rb[0].paid, rb[0].remaining, rb[0].settled], [rb[0].net, 0, rb[0].net, false]);
  assert.deepEqual(rb.before.map((x) => [x.id, x.period, x.amount]), [['v', 'الربع الثاني 2026', 9000]]);
  close(RB.vatDue(B, rb[0]).remaining, 13800);
  // (أ) سداد ضريبة الربع الثالث (قبل الدفتر) بتاريخ داخل الدفتر: كذلك للعلم فقط
  const A = mk();
  A.vatPayments = [{ id: 'q3', date: '2026-10-20', period: 'الربع الثالث 2026', account: 'bank', amount: 9000 }];
  const ra = RB.vatReturns(A, T);
  close(ra[0].remaining, 13800);
  assert.equal(ra[0].paid, 0);
  assert.deepEqual(ra.before.map((x) => x.id), ['q3']);
  // يدخل في رصيد حساب الضريبة (لا رصيد افتتاحي للضريبة في الدفتر)
  close(RB.vatBalanceAt(A, T), 13800 - 9000);
  // اسم فترة غير معروف: بتاريخ قبل بداية الإقرارات للعلم، وبتاريخ داخل أول إقرار يُنسب له
  const U = mk();
  U.vatPayments = [
    { id: 'old', date: '2026-09-02', period: 'دفعة قديمة', account: 'bank', amount: 500 },
    { id: 'early', date: '2026-10-05', period: 'دفعة مقدمة', account: 'bank', amount: 100 },
  ];
  const ru = RB.vatReturns(U, T);
  assert.deepEqual(ru.before.map((x) => x.id), ['old']);
  assert.equal(ru[0].paid, 100);
  // نقل تاريخ سريان التسجيل لاحقاً بعد السداد: سداد الربع الثاني يصبح للعلم، والثالث يبقى لفترته
  const R = vatTwoQuarters();
  const [q2, q3] = RB.vatPeriodsBetween(R, '2026-04-01', '2026-09-30');
  R.vatPayments = [
    { id: 'v2', date: '2026-07-20', period: q2.label, account: 'bank', amount: 1500 },
    { id: 'v3', date: '2026-10-20', period: q3.label, account: 'bank', amount: 1500 },
  ];
  R.settings.vatRegisteredFrom = '2026-07-01';
  const rr = RB.vatReturns(R, '2026-10-31');
  assert.deepEqual(rr.map((r) => [r.key, r.due, r.paid, r.credit, r.settled]), [['2026-Q3', 1500, 1500, 0, true], ['2026-Q4', 0, 0, 0, true]]);
  assert.deepEqual(rr.before.map((x) => x.id), ['v2']);
  // لا عمليات فيها ضريبة بعد: لا إقرارات، والسداد للعلم
  const E = base();
  E.vatPayments = [{ id: 'e', date: '2026-07-25', period: 'الربع الثاني 2026', account: 'bank', amount: 9000 }];
  const re = RB.vatReturns(E, '2026-10-10');
  assert.equal(re.length, 0);
  assert.deepEqual(re.before.map((x) => x.id), ['e']);
});

test('أرصدة افتتاحية: ضريبة مستحقة من إقرار سابق التزام يسدده سداد فترتها، ورصيد حساب الضريبة يطابق الإقرارات', () => {
  // مطعم قائم بدأ دفتره 1 أبريل وعليه ضريبة الربع الأول 4,000 يسددها في أبريل؛ مبيعات أبريل 23,000 شاملة (ضريبتها 3,000)
  const mk = (pays, opening) => {
    const S = base();
    S.settings.vatPeriod = 'quarterly';
    S.settings.opening = Object.assign({ date: '2026-04-01', cash: 2000, bank: 30000, inventory: 0, vatCredit: 0, vatPayable: 4000, apps: {}, payables: [], eosb: [] }, opening || {});
    S.sales = [{ id: 's1', date: '2026-04-10', channels: { cash: { amount: 23000, orders: 500, type: 'cash', feePct: 0, feeVat: true } } }];
    S.vatPayments = pays.map((x, i) => Object.assign({ id: 'v' + i, account: 'bank' }, x));
    return S;
  };
  const op = RB.openingInfo(mk([]));
  assert.deepEqual([op.vatPayable, op.liab, op.net], [4000, 4000, 28000]);
  assert.deepEqual(RB.openingShares(mk([]), op.net).map((x) => x.amount), [16800, 11200]);
  const T = '2026-06-30';
  // (أ) سُدد كاملاً: يُنسب للمستحق الافتتاحي لا لأي إقرار، والميزانية تُظهر ضريبة الربع الثاني وحدها التزاماً
  const A = mk([{ date: '2026-04-28', period: 'الربع الأول 2026', amount: 4000 }]);
  const ra = RB.vatReturns(A, T);
  assert.deepEqual(ra.map((r) => [r.key, r.due, r.paid, r.remaining]), [['2026-Q2', 3000, 0, 3000]]);
  assert.deepEqual([ra.opening.label, ra.opening.payable, ra.opening.paid, ra.opening.remaining, ra.opening.over, ra.opening.settled, ra.opening.deadline], ['الربع الأول 2026', 4000, 4000, 0, 0, true, '2026-04-30']);
  assert.deepEqual(ra.before.map((x) => [x.id, x.opening]), [['v0', true]]);
  assert.equal(RB.vatBalanceAt(A, T), 3000);
  const bs = RB.balanceSheet(A, T);
  assert.deepEqual(bs.liab.map((x) => x.amount), [3000]);
  assert.ok(!bs.cur.some((x) => /ضريبة/.test(x.name)));
  close(bs.check, 0);
  close(bs.tEq, 28000 + 20000);
  // رصيد حساب الضريبة = متبقي الإقرارات − الرصيد الدائن + المتبقي الافتتاحي − الزائد عنه
  const inv = (S, at) => {
    const r = RB.vatReturns(S, at);
    const last = r[r.length - 1];
    return RB.r2(RB.sum(r, (x) => x.remaining) - (last ? last.credit : 0) + (r.opening ? r.opening.remaining - r.opening.over : 0));
  };
  close(RB.vatBalanceAt(A, T), inv(A, T));
  // قبل السداد: المستحق الافتتاحي كله متبقٍ، وفي الميزانية مع ضريبة أبريل
  const r0 = RB.vatReturns(A, '2026-04-20');
  assert.deepEqual([r0.opening.paid, r0.opening.remaining, r0.opening.settled], [0, 4000, false]);
  assert.equal(RB.vatBalanceAt(A, '2026-04-20'), 7000);
  close(RB.vatBalanceAt(A, '2026-04-20'), inv(A, '2026-04-20'));
  // (ب) سداد جزئي: الباقي يبقى التزاماً
  const B = mk([{ date: '2026-04-28', period: 'الربع الأول 2026', amount: 2500 }]);
  const rb = RB.vatReturns(B, T);
  assert.deepEqual([rb.opening.paid, rb.opening.remaining], [2500, 1500]);
  assert.equal(RB.vatBalanceAt(B, T), 4500);
  close(RB.vatBalanceAt(B, T), inv(B, T));
  // (ج) دفعة زائدة: الزائد لا يُخصم من الربع الثاني ويبقى في رصيد الحساب؛ وسداد قبل تاريخ البدء داخل في الرصيد الافتتاحي
  const C = mk([
    { date: '2026-04-28', period: 'الربع الأول 2026', amount: 4500 },
    { date: '2026-03-20', period: 'الربع الرابع 2025', amount: 900 },
  ]);
  const rc = RB.vatReturns(C, T);
  assert.deepEqual([rc.opening.paid, rc.opening.over, rc.opening.remaining, rc[0].remaining], [4500, 500, 0, 3000]);
  assert.deepEqual(rc.before.map((x) => [x.id, !!x.opening]), [['v0', true], ['v1', false]]);
  close(RB.vatBalanceAt(C, T), inv(C, T) - 900);
  // (د) سريان التسجيل من تاريخ البدء: لا فترة إقرار قبله، فاسم ثابت يُسدَّد به ولا يُنسب لأي إقرار
  const D = mk([{ date: '2026-07-10', period: 'ضريبة مستحقة عند بدء الدفتر', amount: 4000 }]);
  D.settings.vatRegisteredFrom = '2026-04-01';
  const rd = RB.vatReturns(D, '2026-07-31');
  assert.deepEqual([rd.opening.label, rd.opening.deadline, rd.opening.paid], ['ضريبة مستحقة عند بدء الدفتر', '', 4000]);
  assert.deepEqual(rd.map((r) => [r.key, r.paid, r.remaining]), [['2026-Q2', 0, 3000], ['2026-Q3', 0, 0]]);
  // بلا مستحق افتتاحي: لا شيء يتغير (السداد للعلم فقط)
  const E = mk([{ date: '2026-04-28', period: 'الربع الأول 2026', amount: 4000 }], { vatPayable: 0 });
  const re = RB.vatReturns(E, T);
  assert.equal(re.opening, null);
  assert.equal(RB.openingInfo(E).net, 32000);
  assert.equal(RB.vatBalanceAt(E, T), -1000);
  // رصيد سالب في الحقل لا يُعتمد
  assert.equal(RB.openingInfo(mk([], { vatPayable: -50 })).vatPayable, 0);
});

test('أرصدة افتتاحية: دفتر بدأ أثناء الربع — ضريبة أيامه قبل البدء تدخل في إقراره فيسدده سداده كاملاً بلا رصيد دائن وهمي', () => {
  // بدأ الدفتر 15 أغسطس؛ ضريبة 1 يوليو – 14 أغسطس 3,000 لم يُقدَّم إقرارها، وضريبة المبيعات في الدفتر 1,500؛
  // الإقرار الحقيقي للربع الثالث 4,500 يُسدَّد 20 أكتوبر باسمه
  const mk = (opening, pays, sales) => {
    const S = base();
    S.settings.vatPeriod = 'quarterly';
    S.settings.opening = Object.assign({ date: '2026-08-15', cash: 10000, bank: 50000, inventory: 0, vatCredit: 0, vatPayable: 0, vatCurrent: 3000, apps: {}, payables: [], eosb: [] }, opening || {});
    S.sales = (sales || [['2026-09-01', 11500]]).map(([date, amount], i) => ({ id: 's' + i, date, channels: { cash: { amount, orders: 10, type: 'cash', feePct: 0, feeVat: true } } }));
    S.vatPayments = (pays || []).map((x, i) => Object.assign({ id: 'v' + i, account: 'bank' }, x));
    return S;
  };
  const inv = (S, at) => {
    const r = RB.vatReturns(S, at);
    const last = r[r.length - 1];
    return RB.r2(RB.sum(r, (x) => x.remaining) - (last ? last.credit : 0) + (r.opening ? r.opening.remaining - r.opening.over : 0));
  };
  // فترتا البدء: آخر إقرار انتهى قبله (الربع الثاني) والجارية التي بدأ أثناءها (أيامها قبل البدء)
  const vp = RB.vatOpeningPeriod(mk());
  assert.deepEqual([vp.label, vp.deadline], ['الربع الثاني 2026', '2026-07-31']);
  assert.deepEqual(vp.cur, { key: '2026-Q3', label: 'الربع الثالث 2026', from: '2026-07-01', to: '2026-08-14', end: '2026-09-30', deadline: '2026-10-31' });
  const op = RB.openingInfo(mk());
  assert.deepEqual([op.vatCurrent, op.liab, op.net], [3000, 3000, 57000]);
  // قبل السداد: مستحق الربع الثالث = ضريبة الدفتر + ما قبل البدء، ويطابق رصيد حساب الضريبة
  const A0 = mk();
  const r0 = RB.vatReturns(A0, '2026-10-10');
  assert.deepEqual(r0.map((r) => [r.key, r.net, r.pre, r.due, r.remaining, r.credit]), [['2026-Q3', 1500, 3000, 4500, 4500, 0], ['2026-Q4', 0, 0, 0, 0, 0]]);
  assert.equal(r0.opening, null);
  assert.equal(RB.vatBalanceAt(A0, '2026-10-10'), 4500);
  close(RB.vatBalanceAt(A0, '2026-10-10'), inv(A0, '2026-10-10'));
  // سداد الإقرار الحقيقي كاملاً باسمه: مسدد، بلا رصيد دائن يُرحّل للربع الرابع، والميزانية بلا ضريبة
  const A = mk({}, [{ date: '2026-10-20', period: 'الربع الثالث 2026', amount: 4500 }]);
  const T = '2026-10-25';
  const ra = RB.vatReturns(A, T);
  assert.deepEqual(ra.map((r) => [r.key, r.due, r.paid, r.remaining, r.credit, r.over, r.settled]), [['2026-Q3', 4500, 4500, 0, 0, 0, true], ['2026-Q4', 0, 0, 0, 0, 0, true]]);
  assert.equal(ra[1].carried, 0);
  assert.equal(ra.opening, null);
  assert.equal(RB.vatBalanceAt(A, T), 0);
  close(RB.vatBalanceAt(A, T), inv(A, T));
  const bs = RB.balanceSheet(A, T);
  close(bs.check, 0);
  assert.ok(!bs.liab.concat(bs.cur).some((x) => /ضريبة/.test(x.name)));
  // بلا أي عملية فيها ضريبة بعد: الإقرار الجاري يبدأ من ضريبة ما قبل البدء
  const B = mk({}, [], []);
  const rb = RB.vatReturns(B, '2026-10-05');
  assert.deepEqual(rb.map((r) => [r.key, r.pre, r.due]), [['2026-Q3', 3000, 3000], ['2026-Q4', 0, 0]]);
  close(RB.vatBalanceAt(B, '2026-10-05'), inv(B, '2026-10-05'));
  // بالسالب (مدخلات تلك الأيام أكبر): أصل لصالح المطعم يخفض مستحق الإقرار
  const C = mk({ vatCurrent: -400 });
  const oc = RB.openingInfo(C);
  assert.deepEqual([oc.assets, oc.liab, oc.net], [60400, 0, 60400]);
  const rc = RB.vatReturns(C, '2026-10-10');
  assert.deepEqual([rc[0].pre, rc[0].due], [-400, 1100]);
  close(RB.vatBalanceAt(C, '2026-10-10'), inv(C, '2026-10-10'));
  // الحالتان معاً (بدء 15 أكتوبر): الربع الثالث لم يُسدَّد بعد (موعده 31 أكتوبر) وضريبة 1–14 أكتوبر 700؛
  // كل منهما يسدده سداده باسمه
  const D = mk({ date: '2026-10-15', vatPayable: 4500, vatCurrent: 700 }, [
    { date: '2026-10-20', period: 'الربع الثالث 2026', amount: 4500 },
    { date: '2027-01-20', period: 'الربع الرابع 2026', amount: 2200 },
  ], [['2026-11-01', 11500]]);
  const vd = RB.vatOpeningPeriod(D);
  assert.deepEqual([vd.label, vd.deadline, vd.cur.label, vd.cur.from, vd.cur.to], ['الربع الثالث 2026', '2026-10-31', 'الربع الرابع 2026', '2026-10-01', '2026-10-14']);
  const rd = RB.vatReturns(D, '2027-01-25');
  assert.deepEqual([rd.opening.label, rd.opening.paid, rd.opening.settled], ['الربع الثالث 2026', 4500, true]);
  assert.deepEqual(rd.map((r) => [r.key, r.pre, r.due, r.paid, r.remaining, r.credit]), [['2026-Q4', 700, 2200, 2200, 0, 0], ['2027-Q1', 0, 0, 0, 0, 0]]);
  assert.equal(RB.vatBalanceAt(D, '2027-01-25'), 0);
  close(RB.vatBalanceAt(D, '2027-01-25'), inv(D, '2027-01-25'));
  // بدء في أول يوم من الربع، أو بسريان التسجيل من تاريخ البدء: لا أيام قبله في الفترة الجارية
  assert.equal(RB.vatOpeningPeriod(mk({ date: '2026-10-01' })).cur, null);
  const E = mk();
  E.settings.vatRegisteredFrom = '2026-08-15';
  assert.equal(RB.vatOpeningPeriod(E).cur, null);
  E.settings.vatRegisteredFrom = '2026-08-01';
  assert.deepEqual([RB.vatOpeningPeriod(E).cur.from, RB.vatOpeningPeriod(E).cur.to], ['2026-08-01', '2026-08-14']);
  const F = mk();
  F.settings.vatRegistered = false;
  assert.equal(RB.vatOpeningPeriod(F).cur, null);
});

test('إقرارات البيانات التجريبية: المستحق والرصيد الدائن كما في رصيد حساب الضريبة', () => {
  for (const today of ['2026-10-14', '2027-02-17', '2026-12-31']) {
    const S = RB.demoState(today);
    const L = RB.buildLedger(S, today);
    const rows = RB.vatReturns(S, today, L);
    assert.ok(rows.length >= 2);
    for (const r of rows) {
      // في التجربة يُسدد كل إقرار بعد نهاية فترته وقبل نهاية التالية، فالرصيد في نهاية الفترة = المستحق − الرصيد الدائن
      const atEnd = RB.vatBalanceAt(S, r.to < today ? r.to : today, L);
      close(r.due, Math.max(0, atEnd));
      close(r.credit, Math.max(0, -atEnd));
      if (r.to < today && RB.addDays(r.to, 25) <= today) assert.equal(r.settled, true, r.key);
    }
  }
});

test('تاريخ سريان التسجيل في الضريبة: ما قبله بلا ضريبة، وما بعده يُقسم', () => {
  const today = '2026-10-14';
  const plain = RB.demoState(today);
  const unreg = RB.demoState(today);
  unreg.settings.vatRegistered = false;
  const S = RB.demoState(today);
  S.settings.vatRegisteredFrom = '2026-10-01';
  const L = RB.buildLedger(S, today);
  const Lu = RB.buildLedger(unreg, today);
  const q3 = RB.incomeStatement(S, '2026-07-01', '2026-09-30', L);
  close(q3.revenue, RB.incomeStatement(unreg, '2026-07-01', '2026-09-30', Lu).revenue);
  close(q3.net, RB.incomeStatement(unreg, '2026-07-01', '2026-09-30', Lu).net);
  const v3 = RB.vatReport(S, '2026-07-01', '2026-09-30', L);
  assert.equal(v3.sales.vat, 0);
  assert.equal(v3.inVat, 0);
  // أكتوبر: المبيعات تُقسم إلى صافي وضريبة 15%
  const oct = RB.salesByChannel(S, '2026-10-01', today);
  const octInc = RB.incomeStatement(S, '2026-10-01', today, L);
  // المبيعات قبل خصومات عروض التطبيقات = الإقفالات بدون الضريبة (صافي المبيعات بعدها)
  close(octInc.grossSales, oct.total.gross / 1.15, 0.5);
  close(oct.total.vat, oct.total.gross - octInc.grossSales, 0.02);
  close(octInc.revenue, octInc.grossSales - octInc.salesDeductions);
  assert.ok(RB.vatReport(S, '2026-10-01', today, L).sales.vat > 0);
  // الإقرارات تبدأ من الربع الذي يبدأ فيه التسجيل
  assert.deepEqual(RB.vatReturns(S, today, L).map((r) => r.key), ['2026-Q4']);
  assert.equal(RB.vatPeriodsBetween(S, '2026-01-01', '2026-09-30').length, 0);
  close(RB.balanceSheet(S, today, L).check, 0);
  // تاريخ سريان قبل كل العمليات = نفس الأرقام بلا تاريخ
  const early = RB.demoState(today);
  early.settings.vatRegisteredFrom = '2000-01-01';
  assert.deepEqual(RB.buildLedger(early, today).entries, RB.buildLedger(plain, today).entries);
  assert.equal(RB.isVatReg(plain.settings, '2026-01-01'), true);
  assert.equal(RB.isVatReg(S.settings, '2026-09-30'), false);
  assert.equal(RB.isVatReg(S.settings, '2026-10-01'), true);
  assert.equal(RB.isVatReg(unreg.settings, '2026-10-01'), false);
});

test('ضريبة العمولة محفوظة مع الإقفال: تغيير الإعداد لا يغيّر الأيام السابقة', () => {
  const S = base();
  S.sales = [
    { id: 's1', date: '2026-05-01', channels: { jahez: { amount: 115, orders: 3, feePct: 20, type: 'app', feeVat: true } } },
    { id: 's2', date: '2026-05-02', channels: { jahez: { amount: 115, orders: 3, feePct: 20, type: 'app' } } },
  ];
  const day = (id) => RB.saleChannelSplit(S, 'jahez', S.sales.find((s) => s.id === id).channels.jahez, '2026-05-01');
  assert.equal(day('s1').feeVat, 3.45);
  const b1 = RB.balances(RB.buildLedger(S, '2026-05-31').entries.filter((e) => e.ref.id === 's1'));
  S.settings.feeVat = false;
  assert.equal(day('s1').feeVat, 3.45);
  assert.equal(day('s2').feeVat, 0); // الإقفال القديم بلا لقطة يتبع الإعداد
  assert.deepEqual(RB.balances(RB.buildLedger(S, '2026-05-31').entries.filter((e) => e.ref.id === 's1')), b1);
});

test('أرصدة الموردين تشمل الأصول والمصاريف الآجلة وتطابق حساب الموردين', () => {
  const S = base();
  const d = '2026-06-30';
  S.purchases = [{ id: 'b1', date: '2026-05-02', supplier: 'مورد اللحوم', category: 'food', account: 'payable', taxable: true, includesVat: false, lines: [{ qty: 10, price: 100 }] }];
  S.assets = [{ id: 'a1', date: '2026-05-03', name: 'ثلاجة', supplier: 'شركة المعدات', category: 'kitchen', amount: 11500, includesVat: true, taxable: true, account: 'payable', lifeMonths: 60 }];
  S.expenses = [{ id: 'x1', date: '2026-05-04', category: 'cleaning', desc: 'مكافحة حشرات', entity: 'شركة النظافة', amount: 600, includesVat: false, taxable: true, account: 'payable', months: 3 }];
  S.supplierPayments = [{ id: 'sp1', date: '2026-06-01', supplier: 'شركة المعدات', account: 'bank', amount: 4000 }];
  const sb = RB.supplierBalances(S, d);
  const by = Object.fromEntries(sb.map((r) => [r.supplier, r]));
  close(by['شركة المعدات'].purchases, 11500);
  close(by['شركة المعدات'].balance, 7500);
  close(by['شركة النظافة'].balance, 690); // كامل المبلغ وإن توزّع على 3 أشهر
  close(by['مورد اللحوم'].balance, 1150);
  const b = RB.balances(RB.buildLedger(S, d).entries, null, d);
  assert.equal(r2sum(sb), RB.r2(-b['2101']));
  // دفعة زائدة تظهر رصيداً سالباً
  S.supplierPayments.push({ id: 'sp2', date: '2026-06-02', supplier: 'شركة النظافة', account: 'bank', amount: 700 });
  close(RB.supplierBalances(S, d).find((r) => r.supplier === 'شركة النظافة').balance, -10);
});
const r2sum = (sb) => RB.r2(RB.sum(sb, (r) => r.balance));

test('الرواتب تُحمّل على شهر الخدمة وإن صُرفت في الشهر التالي', () => {
  const S = base();
  const sa = { id: 'e1', nationality: 'saudi', basic: 4000, housing: 1000, transport: 500 };
  S.employees = [sa];
  S.payroll = [{ id: 'w9', month: '2026-09', date: '2026-10-02', account: 'bank', gosiAccount: 'bank', lines: [RB.payrollLine(sa, S)] }];
  const L = RB.buildLedger(S, '2026-10-14');
  for (const e of L.entries) close(RB.sum(e.lines, (l) => l.v), 0, 0.001);
  // الرواتب والتأمينات + مخصص نهاية الخدمة للشهر (5,500 ÷ 24) على نفس الشهر
  close(RB.incomeStatement(S, '2026-09-01', '2026-09-30', L).tot.labor, 6087.5 + RB.r2(5500 / 24));
  close(RB.incomeStatement(S, '2026-10-01', '2026-10-31', L).tot.labor, 0);
  const sep = RB.balanceSheet(S, '2026-09-30', RB.buildLedger(S, '2026-09-30'));
  close(sep.liab.find((x) => x.code === '2103').amount, 6087.5);
  close(sep.check, 0);
  const oct = RB.balanceSheet(S, '2026-10-14', L);
  assert.ok(!oct.liab.some((x) => x.code === '2103') && !oct.cur.some((x) => x.code === '2103'));
  close(oct.check, 0);
  close(RB.balances(L.entries, null, '2026-10-14')['2103'] || 0, 0);
  // صرف مقدّم قبل الشهر: أصل متداول «رواتب مدفوعة مقدماً» حتى نهاية الشهر
  S.payroll[0].date = '2026-08-28';
  const aug = RB.balanceSheet(S, '2026-08-31', RB.buildLedger(S, '2026-08-31'));
  close(aug.cur.find((x) => x.code === '2103').amount, 6087.5);
  close(aug.check, 0);
  close(RB.incomeStatement(S, '2026-08-01', '2026-08-31').tot.labor, 0);
  // نفس الشهر: قيد واحد كما كان
  S.payroll[0].date = '2026-09-30';
  assert.equal(RB.buildLedger(S, '2026-10-14').entries.filter((e) => e.kind === 'payroll').length, 1);
});

// ───────── دفعة التصحيحات المحاسبية (WP1، الجزء الثاني) ─────────

test('مصروف الشهر الواحد يُحمّل على شهر بداية التغطية', () => {
  const S = base();
  S.expenses = [
    { id: 'e1', date: '2026-10-12', category: 'utilities', desc: 'كهرباء سبتمبر', amount: 3000, includesVat: false, taxable: false, account: 'bank', months: 1, startDate: '2026-09-01' },
    { id: 'e2', date: '2026-10-12', category: 'utilities', desc: 'كهرباء أغسطس وسبتمبر', amount: 6000, includesVat: false, taxable: false, account: 'bank', months: 2, startDate: '2026-08-01' },
  ];
  const t = '2026-10-14';
  const L = RB.buildLedger(S, t);
  for (const e of L.entries) close(RB.sum(e.lines, (l) => l.v), 0, 0.001);
  const opex = (f, to) => RB.incomeStatement(S, f, to, L).tot.opex;
  close(opex('2026-08-01', '2026-08-31'), 3000);
  close(opex('2026-09-01', '2026-09-30'), 6000);
  close(opex('2026-10-01', t), 0);
  assert.deepEqual(RB.amortSchedule(S.expenses[0], S).months, [{ ym: '2026-09', date: '2026-09-01', amount: 3000 }]);
  // قبل الدفع: مصروفات مستحقة في الالتزامات، والميزانية متوازنة
  const sep = RB.balanceSheet(S, '2026-09-30', RB.buildLedger(S, '2026-09-30'));
  close(sep.liab.find((x) => x.code === '1105').amount, 9000);
  close(sep.check, 0);
  close(RB.balanceSheet(S, t, L).check, 0);
  close(RB.balances(L.entries, null, t)['1105'] || 0, 0);
  // تغطية لاحقة: مدفوع في سبتمبر عن نوفمبر يُحمّل على نوفمبر
  S.expenses = [{ id: 'e3', date: '2026-09-28', category: 'utilities', desc: 'نوفمبر', amount: 3000, taxable: false, account: 'bank', months: 1, startDate: '2026-11-01' }];
  const L2 = RB.buildLedger(S, '2026-12-31');
  close(RB.incomeStatement(S, '2026-09-01', '2026-09-30', L2).tot.opex, 0);
  close(RB.incomeStatement(S, '2026-11-01', '2026-11-30', L2).tot.opex, 3000);
  const oct = RB.balanceSheet(S, '2026-10-31', RB.buildLedger(S, '2026-10-31'));
  close(oct.cur.find((x) => x.code === '1105').amount, 3000);
  close(oct.check, 0);
  // نفس الشهر: قيد مباشر واحد كما كان
  S.expenses = [{ id: 'e4', date: '2026-09-12', category: 'utilities', desc: 'سبتمبر', amount: 3000, taxable: false, account: 'bank', months: 1, startDate: '2026-09-01' }];
  const es = RB.buildLedger(S, t).entries;
  assert.deepEqual(es.map((e) => e.kind), ['expense']);
  // البيانات التجريبية: مصاريف الشهر الواحد لا تتغير (بلا تحميل منفصل)
  const D = RB.demoState(t);
  const one = new Set(D.expenses.filter((x) => Math.round(RB.num(x.months) || 1) === 1).map((x) => x.id));
  assert.ok(one.size > 5);
  assert.ok(!RB.buildLedger(D, t).entries.some((e) => e.kind === 'amort' && one.has(e.ref.id)));
});

test('عدد الأشهر في فترة: الشهر الكامل = 1 مهما كان عدد أيامه', () => {
  close(RB.monthsIn('2026-02-01', '2026-02-28'), 1, 1e-9);
  close(RB.monthsIn('2026-08-01', '2026-08-31'), 1, 1e-9);
  close(RB.monthsIn('2026-07-01', '2026-09-30'), 3, 1e-9);
  close(RB.monthsIn('2026-10-01', '2026-10-14'), 14 / 31, 1e-9);
  close(RB.monthsIn('2026-01-15', '2026-02-28'), 17 / 31 + 1, 1e-9);
  assert.ok(RB.monthsIn('2026-10-14', '2026-10-01') > 0);
});

test('متوسط المحمّل شهرياً: الشهر الجاري يُحسب كاملاً لأن الإيجار والإهلاك يُحمّلان أول الشهر', () => {
  close(RB.chargeMonths('2026-10-01', '2026-10-02'), 1, 1e-9);
  close(RB.chargeMonths('2026-10-01', '2026-10-14'), 1, 1e-9);
  close(RB.chargeMonths('2026-01-01', '2026-10-14'), 10, 1e-9);
  close(RB.chargeMonths('2026-08-01', '2026-10-31'), 3, 1e-9);
  // بداية من منتصف شهر: ذلك الشهر بأيامه (لم يدخل تحميل أول يومه)
  close(RB.chargeMonths('2026-09-16', '2026-10-14'), 15 / 30 + 1, 1e-9);
  // «هذا الشهر» في التجربة: متوسط الإيجار = إيجار الشهر 6,000 في اليوم 2 واليوم 14
  for (const t of ['2026-10-02', '2026-10-14']) {
    const D = RB.demoState(t);
    const b = RB.balances(RB.buildLedger(D, t).entries, '2026-10-01', t);
    close(b['5301'], 6000);
    close(b['5301'] / RB.chargeMonths('2026-10-01', t), 6000);
  }
});

test('نقطة التعادل من أشهر التشغيل الكاملة', () => {
  // فبراير: إيجار 6,000 شهرياً = 6,000 (لا 6,522 بقسمة 28 يوماً على 30.44)
  const S = base();
  S.settings.openingDate = '2026-01-01';
  S.expenses = [{ id: 'r', date: '2026-01-01', category: 'rent', desc: 'إيجار', amount: 36000, taxable: false, account: 'bank', months: 6, startDate: '2026-01-01' }];
  S.sales = [{ id: 's', date: '2026-02-10', channels: { cash: { amount: 23000, orders: 500, type: 'cash' } } }];
  const feb = RB.breakEven(S, '2026-02-01', '2026-02-28', null, '2026-10-14');
  close(feb.fixedParts.occ, 6000);
  close(feb.months, 1, 1e-9);
  close(feb.beDaily, feb.beGross / 28, 1e-6);

  const t = '2026-10-14';
  const D = RB.demoState(t);
  const L = RB.buildLedger(D, t);
  const fixedOf = (f, to) => {
    const i = RB.incomeStatement(D, f, to, L);
    return i.tot.labor + i.tot.occ + i.tot.opex + i.tot.dep;
  };
  // «هذا الشهر» ينتهي منتصف الشهر: نفس الشهر الكامل السابق
  const cur = RB.breakEven(D, '2026-10-01', t, L, t);
  const prev = RB.breakEven(D, '2026-09-01', '2026-09-30', L, t);
  assert.equal(cur.basisFrom, '2026-09-01');
  assert.equal(cur.basisTo, '2026-09-30');
  assert.equal(cur.fallback, true);
  assert.equal(cur.estimate, false);
  close(cur.fixedMonthly, prev.fixedMonthly);
  close(cur.fixedMonthly, fixedOf('2026-09-01', '2026-09-30'));
  close(cur.fixedParts.occ, RB.incomeStatement(D, '2026-09-01', '2026-09-30', L).tot.occ);
  close(cur.beDaily, cur.beGross / 30, 1e-6);
  // الطريقة القديمة (أيام أكتوبر ÷ 30.44) تضخّم الثابت لأن الإيجار والإهلاك يُحمّلان أول الشهر
  assert.ok(fixedOf('2026-10-01', t) / (14 / 30.4375) > cur.fixedMonthly + 1000);
  // «هذه السنة» والافتتاح 1 يوليو: القسمة على أشهر التشغيل فقط
  assert.equal(D.settings.openingDate, '2026-07-01');
  const year = RB.breakEven(D, '2026-01-01', t, L, t);
  assert.equal(year.basisFrom, '2026-07-01');
  assert.equal(year.basisTo, '2026-09-30');
  close(year.months, 3, 1e-9);
  assert.equal(year.preOpen, true);
  assert.equal(year.cutEnd, true);
  close(year.fixedMonthly, fixedOf('2026-07-01', '2026-09-30') / 3);
  const inc = RB.incomeStatement(D, '2026-07-01', '2026-09-30', L);
  close(year.avgMonthlyNet, inc.revenue / 3, 0.01);
  close(year.beDaily, (year.beGross * 3) / 92, 1e-6);
  // «آخر 3 أشهر» (أغسطس–أكتوبر): أغسطس وسبتمبر فقط
  const m3 = RB.breakEven(D, '2026-08-01', t, L, t);
  assert.deepEqual([m3.basisFrom, m3.basisTo, m3.fallback], ['2026-08-01', '2026-09-30', false]);
  // لا يوجد شهر تشغيل كامل بعد: تقدير من الأيام المتاحة
  const N = base();
  N.settings.openingDate = '2026-10-01';
  N.sales = [{ id: 's', date: '2026-10-02', channels: { cash: { amount: 11500, orders: 300, type: 'cash' } } }];
  N.expenses = [{ id: 'x', date: '2026-10-01', category: 'utilities', desc: 'كهرباء', amount: 1000, taxable: false, account: 'bank', months: 1 }];
  const est = RB.breakEven(N, '2026-10-01', t, null, t);
  assert.equal(est.estimate, true);
  assert.deepEqual([est.basisFrom, est.basisTo], ['2026-10-01', t]);
  close(est.months, 14 / 31, 1e-9);
  close(est.fixedMonthly, 1000 / (14 / 31));
  close(est.beDaily, (est.beGross * est.months) / 14, 1e-6);
  // بلا تاريخ افتتاح: بداية التشغيل أول يوم مبيعات (منتصف الشهر ← الشهر التالي أول شهر كامل)
  N.settings.openingDate = '';
  N.sales[0].date = '2026-08-15';
  const ns = RB.breakEven(N, '2026-01-01', t, null, t);
  assert.deepEqual([ns.basisFrom, ns.basisTo, ns.estimate], ['2026-09-01', '2026-09-30', false]);
  // فترة كلها قبل الافتتاح (مايو في التجربة): أول شهر تشغيل كامل، لا تقدير من أشهر التأسيس
  const may = RB.breakEven(D, '2026-05-01', '2026-05-31', RB.buildLedger(D, '2026-05-31'), t);
  const jul = RB.breakEven(D, '2026-07-01', '2026-07-31', L, t);
  assert.deepEqual([may.basisFrom, may.basisTo, may.estimate, may.fallback, may.beforeOpen], ['2026-07-01', '2026-07-31', false, false, true]);
  close(may.fixedMonthly, jul.fixedMonthly);
  close(may.beGross, jul.beGross, 1e-6);
  assert.ok(may.revenue > 0);
  // افتُتح حديثاً بلا شهر كامل: تقدير من أيام التشغيل حتى اليوم
  N.settings.openingDate = '2026-10-01';
  N.sales[0].date = '2026-10-02';
  const nb = RB.breakEven(N, '2026-05-01', '2026-05-31', null, t);
  assert.deepEqual([nb.basisFrom, nb.basisTo, nb.estimate, nb.beforeOpen], ['2026-10-01', t, true, true]);
});

test('نقطة التعادل لمطعم قائم بدأ دفتره بعد افتتاحه: من أول مبيعات مسجلة لا من تاريخ الافتتاح', () => {
  // افتُتح في 2024، والدفتر من 1 أكتوبر 2026: إيجار 6,000 أول كل شهر ومبيعات نقدية يومية
  const mk = (T) => {
    const S = base();
    S.settings.openingDate = '2024-03-01';
    // أصل قديم بتاريخه الفعلي لا يجعل الدفتر «يغطي» الافتتاح
    S.assets = [{ id: 'a', date: '2024-02-15', name: 'شواية', category: 'kitchen', amount: 12000, includesVat: true, taxable: true, account: 'bank', lifeMonths: 60 }];
    S.expenses = [];
    S.sales = [];
    for (const ym of ['2026-10', '2026-11', '2026-12']) {
      if (ym + '-01' > T) break;
      S.expenses.push({ id: 'r' + ym, date: ym + '-01', category: 'rent', desc: 'إيجار', amount: 6000, taxable: false, account: 'bank', months: 1 });
      for (let d = 1; d <= 28; d++) {
        const dt = ym + '-' + String(d).padStart(2, '0');
        if (dt <= T) S.sales.push({ id: 's' + dt, date: dt, channels: { cash: { amount: 1150, orders: 40, type: 'cash' } } });
      }
    }
    return S;
  };
  // «هذا الشهر» في 14 أكتوبر: تقدير من 1 أكتوبر حتى اليوم، لا سبتمبر الفارغ
  let T = '2026-10-14';
  const m = RB.breakEven(mk(T), '2026-10-01', T, null, T);
  assert.deepEqual([m.estimate, m.fallback, m.basisFrom, m.basisTo, m.start, m.startBy], [true, false, '2026-10-01', T, '2026-10-01', 'sales']);
  assert.ok(m.revenue > 0 && m.fixedParts.occ > 0 && m.beGross > 0);
  // «هذه السنة» في 10 ديسمبر: أكتوبر ونوفمبر فقط (لا 11 شهراً من يناير)
  T = '2026-12-10';
  const S = mk(T);
  const y = RB.breakEven(S, '2026-01-01', T, null, T);
  assert.deepEqual([y.basisFrom, y.basisTo, y.estimate, y.preOpen, y.cutEnd], ['2026-10-01', '2026-11-30', false, true, true]);
  close(y.months, 2, 1e-9);
  close(y.fixedParts.occ, 6000);
  const dep = RB.incomeStatement(S, '2026-10-01', '2026-11-30').tot.dep / 2;
  close(y.fixedMonthly, 6000 + dep);
  close(y.beGross, (6000 + dep) * 1.15);
  close(y.avgMonthlyNet, (56 * 1000) / 2);
  // «الشهر الماضي» كامل كما هو
  const nov = RB.breakEven(S, '2026-11-01', '2026-11-30', null, T);
  close(nov.fixedMonthly, y.fixedMonthly);
  // الفترة كلها قبل الدفتر (2025): من أول شهر تشغيل كامل في الدفتر
  const y25 = RB.breakEven(S, '2025-01-01', '2025-12-31', null, T);
  assert.deepEqual([y25.beforeOpen, y25.basisFrom, y25.basisTo], [true, '2026-10-01', '2026-10-31']);
  // الدفتر يغطي الافتتاح (مصروف في شهر الافتتاح) فيبقى تاريخ الافتتاح ولو جاءت أول مبيعات في شهر لاحق
  const C = mk(T);
  C.settings.openingDate = '2026-09-01';
  C.expenses.push({ id: 'x', date: '2026-09-01', category: 'rent', desc: 'إيجار سبتمبر', amount: 6000, taxable: false, account: 'bank', months: 1 });
  const c = RB.breakEven(C, '2026-01-01', T, null, T);
  assert.deepEqual([c.start, c.startBy, c.basisFrom], ['2026-09-01', 'opening', '2026-09-01']);
  // بلا تاريخ افتتاح: أول يوم مبيعات كما كان
  C.settings.openingDate = '';
  assert.deepEqual([RB.breakEven(C, '2026-01-01', T, null, T).startBy, RB.breakEven(C, '2026-01-01', T, null, T).basisFrom], ['sales', '2026-10-01']);
});

function stockCase(reg, regFrom) {
  const S = base();
  S.settings.vatRegistered = reg;
  if (regFrom) S.settings.vatRegisteredFrom = regFrom;
  S.raw = [
    { id: 'beef', name: 'لحم', price: 100, packQty: 10000, useUnit: 'جم', taxable: true, wastePct: 0 },
    { id: 'veg', name: 'خس', price: 50, packQty: 5000, useUnit: 'جم', taxable: false, wastePct: 0 },
  ];
  S.purchases = [{ id: 'b1', date: '2026-09-05', supplier: 'مورد', category: 'food', account: 'bank', taxable: true, includesVat: false, lines: [{ rawId: 'beef', qty: 10, price: 100 }] }];
  S.stockCounts = [{ id: 'k1', date: '2026-09-30', lines: [{ rawId: 'beef', qty: 10, price: 100 }] }];
  const L = RB.buildLedger(S, '2026-09-30');
  return { S, b: RB.balances(L.entries, null, '2026-09-30'), inc: RB.incomeStatement(S, '2026-09-01', '2026-09-30', L), L };
}

test('الجرد بتكلفة الشراء: شامل الضريبة للمواد الخاضعة إن لم يكن المطعم مسجلاً', () => {
  const u = stockCase(false);
  close((u.b['5101'] || 0) + (u.b['5109'] || 0), 0);
  close(u.inc.tot.cogs, 0);
  close(u.b['1104'], 1150);
  const r = stockCase(true);
  close((r.b['5101'] || 0) + (r.b['5109'] || 0), 0);
  close(r.b['1104'], 1000);
  // السعر المحفوظ يبقى بدون ضريبة، والمواد غير الخاضعة بلا زيادة
  assert.equal(u.S.stockCounts[0].lines[0].price, 100);
  const c = { date: '2026-09-30', lines: [{ rawId: 'beef', qty: 2, price: 100 }, { rawId: 'veg', qty: 2, price: 50 }] };
  close(RB.stockValue(c, u.S), 330);
  close(RB.stockValue(c, r.S), 300);
  close(RB.stockValue(c), 300); // بدون بيانات المطعم = السعر المحفوظ
  close(RB.stockLinePrice(c.lines[0], u.S, c.date), 115, 1e-9);
  // تاريخ سريان التسجيل: الجرد قبله بالإجمالي، وبعده بالصافي
  const f = stockCase(true, '2026-10-01');
  close(f.b['1104'], 1150);
  close(f.inc.tot.cogs, 0);
  close(RB.balanceSheet(f.S, '2026-09-30', f.L).check, 0);
});

test('خصومات التحويل من التطبيق: معالجة الضريبة حسب النوع', () => {
  const S = base();
  S.sales = [{ id: 's1', date: '2026-05-01', channels: { jahez: { amount: 115, orders: 1, feePct: 0, type: 'app' } } }];
  const run = (dedType) => {
    S.payouts = [{ id: 'o1', date: '2026-05-04', channelId: 'jahez', amount: 92, deductions: 23, dedType }];
    const L = RB.buildLedger(S, '2026-05-31');
    for (const e of L.entries) close(RB.sum(e.lines, (l) => l.v), 0, 0.001);
    return { v: RB.vatReport(S, '2026-05-01', '2026-05-31', L), b: RB.balances(L.entries, null, '2026-05-31') };
  };
  const none = run(undefined);
  assert.equal(none.v.sales.vat, 15);
  assert.equal(none.v.sales.base, 100);
  assert.equal(none.v.inVat, 0);
  close(none.b['5403'], 23);
  assert.deepEqual(run('other').b, none.b);
  // عرض أو مرتجع: ضريبة المبيعات تنقص 3 وأساسها 20، والمبيعات في قائمة الدخل كذلك (4102 لا مصروف بيع في 5403)
  const sale = run('sale');
  assert.equal(sale.v.sales.vat, 12);
  assert.equal(sale.v.sales.base, 80);
  assert.equal(sale.v.sales.adj, -20);
  assert.equal(sale.v.inVat, 0);
  close(sale.b['4102'], 20);
  assert.equal(sale.b['5403'], undefined);
  close(sale.b['1103'] || 0, 0);
  close(-sale.b['2102'], 12);
  const saleInc = RB.incomeStatement(S, '2026-05-01', '2026-05-31');
  assert.deepEqual([saleInc.grossSales, saleInc.salesDeductions, saleInc.revenue, saleInc.tot.sell], [100, 20, 80, 0]);
  assert.equal(saleInc.revenue, sale.v.sales.base);
  // رسوم بفاتورة ضريبية: ضريبة مدخلات 3
  const fee = run('fee');
  assert.equal(fee.v.sales.vat, 15);
  assert.equal(fee.v.inVat, 3);
  assert.deepEqual(fee.v.inputs['عمولات التطبيقات ورسوم الشبكة'], { base: 20, vat: 3 });
  close(fee.b['5403'], 20);
  // غير مسجل في تاريخ التحويل: العرض يخفض المبيعات بكامله بلا ضريبة
  S.settings.vatRegisteredFrom = '2026-06-01';
  const pre = run('sale');
  close(pre.b['4102'], 23);
  assert.equal(pre.b['5403'], undefined);
  assert.equal(pre.v.sales.vat, 0);
  assert.equal(RB.incomeStatement(S, '2026-05-01', '2026-05-31').revenue, 92);
  close(run('other').b['5403'], 23);
  // البيانات التجريبية: خصومات العروض تخفض ضريبة المبيعات بمقدار ضريبتها
  const t = '2026-10-14';
  const D = RB.demoState(t);
  const ded = D.payouts.filter((p) => RB.num(p.deductions) > 0);
  assert.ok(ded.length > 0 && ded.every((p) => p.dedType === 'sale'));
  const withType = RB.vatReport(D, '2000-01-01', t, RB.buildLedger(D, t));
  D.payouts.forEach((p) => delete p.dedType);
  const plain = RB.vatReport(D, '2000-01-01', t, RB.buildLedger(D, t));
  const expected = RB.sum(ded, (p) => RB.num(p.deductions) - RB.r2(RB.num(p.deductions) / 1.15));
  close(plain.sales.vat - withType.sales.vat, expected, 0.05);
  // وصافي المبيعات في قائمة الدخل = أساس المبيعات في الإقرار (الخصم يخفضهما معاً)
  D.payouts = RB.demoState(t).payouts;
  const LD = RB.buildLedger(D, t);
  const incD = RB.incomeStatement(D, '2000-01-01', t, LD);
  assert.ok(incD.salesDeductions > 0);
  close(incD.revenue, RB.vatReport(D, '2000-01-01', t, LD).sales.base);
});

test('خانات الإقرار: مرتجع المشتريات واسترداد المصروف يخفضان المدخلات ولا يدخلان في المبيعات', () => {
  const S = base();
  S.settings.vatPeriod = 'monthly';
  S.sales = [{ id: 's1', date: '2026-03-05', channels: { cash: { amount: 1150, orders: 10, type: 'cash' } } }];
  S.purchases = [
    { id: 'b1', date: '2026-03-06', supplier: 'مورد', category: 'food', account: 'cash', taxable: true, includesVat: false, lines: [{ qty: 10, price: 100 }] },
    // مرتجع في فاتورة منفصلة (كمية بالسالب كما يشرح النموذج)
    { id: 'b2', date: '2026-03-07', supplier: 'مورد', category: 'food', account: 'cash', taxable: true, includesVat: false, lines: [{ qty: -2, price: 100 }] },
  ];
  const box = (v) => [v.sales.base, v.sales.vat, v.inBase, v.inVat, v.net];
  const v = RB.vatReport(S, '2026-03-01', '2026-03-31');
  assert.deepEqual(box(v), [1000, 150, 800, 120, 30]);
  assert.deepEqual(v.inputs['المشتريات'], { base: 800, vat: 120 });
  // المرتجع نفسه داخل الفاتورة يعطي الخانات نفسها
  const S2 = JSON.parse(JSON.stringify(S));
  S2.purchases = [{ id: 'b1', date: '2026-03-06', supplier: 'مورد', category: 'food', account: 'cash', taxable: true, includesVat: false, lines: [{ qty: 10, price: 100 }, { qty: -2, price: 100 }] }];
  assert.deepEqual(box(RB.vatReport(S2, '2026-03-01', '2026-03-31')), box(v));
  // فترة فيها المرتجع وحده: تعديل سالب على المدخلات، والمبيعات صفر
  S.purchases[1].date = '2026-04-07';
  S.sales.push({ id: 's2', date: '2026-04-05', channels: { cash: { amount: 1150, orders: 10, type: 'cash' } } });
  assert.deepEqual(box(RB.vatReport(S, '2026-04-01', '2026-04-30')), [1000, 150, -200, -30, 180]);
  // استرداد مصروف (مبلغ بالسالب) كذلك
  const S3 = base();
  S3.sales = [{ id: 's1', date: '2026-03-05', channels: { cash: { amount: 1150, orders: 10, type: 'cash' } } }];
  S3.expenses = [
    { id: 'x1', date: '2026-03-06', category: 'maintenance', desc: 'صيانة', amount: 1000, includesVat: false, taxable: true, account: 'cash' },
    { id: 'x2', date: '2026-03-08', category: 'maintenance', desc: 'استرداد من المقاول', amount: -200, includesVat: false, taxable: true, account: 'cash' },
  ];
  const v3 = RB.vatReport(S3, '2026-03-01', '2026-03-31');
  assert.deepEqual(box(v3), [1000, 150, 800, 120, 30]);
  // كل خانة ضريبتها ≈ أساسها × النسبة
  for (const x of [v, v3]) {
    close(x.sales.vat, x.sales.base * 0.15);
    close(x.inVat, x.inBase * 0.15);
  }
  // الإقرار والرصيد لم يتغيرا: صافي الفترة كما في حساب الضريبة
  close(RB.vatBalanceAt(S3, '2026-03-31'), 30);
});

test('أين ذهب رأس المال التأسيسي: الأصول التأسيسية فقط، والضريبة المستردة للعلم', () => {
  const t = '2026-10-14';
  const S = RB.demoState(t);
  const cu = RB.capitalUses(S);
  // المتبقي = الصندوق + البنك − الموردين في اليوم السابق للافتتاح
  const pre = RB.addDays(S.settings.openingDate, -1);
  const b = RB.balances(RB.buildLedger(S, t).entries, null, pre);
  close(cu.remaining, (b['1101'] || 0) + (b['1102'] || 0) + (b['2101'] || 0));
  // ضريبة المدخلات قبل الافتتاح = رصيد حساب الضريبة المسترد، ولا تُضاف للمتبقي
  assert.ok(cu.vatRecoverable > 0);
  close(cu.vatRecoverable, b['2102']);
  assert.deepEqual(cu.laterAssets, { amount: 0, count: 0 });
  // أصل بعد الافتتاح من البنك: لا يغيّر المتبقي ويظهر في الملاحظة
  S.assets.push({ id: 'late', date: '2026-10-01', name: 'فريزر إضافي', category: 'kitchen', amount: 8000, includesVat: false, taxable: true, account: 'bank', lifeMonths: 60, salvage: 0 });
  const cu2 = RB.capitalUses(S);
  close(cu2.remaining, cu.remaining);
  close(cu2.used, cu.used);
  assert.deepEqual(cu2.laterAssets, { amount: 9200, count: 1 });
  close(cu2.vatRecoverable, cu.vatRecoverable);
  // أصل تأسيسي بالآجل يُعامل كمشتريات ما قبل الافتتاح الآجلة: من «المصروف على التأسيس»،
  // والمتبقي يبقى = الصندوق + البنك − المستحق للموردين عند الافتتاح
  const reconcile = (st) => {
    const c = RB.capitalUses(st);
    const bb = RB.balances(RB.buildLedger(st, t).entries, null, pre);
    close(c.remaining, (bb['1101'] || 0) + (bb['1102'] || 0) + (bb['2101'] || 0));
    close(c.owedAtOpen, -(bb['2101'] || 0));
    return c;
  };
  S.assets.push({ id: 'owed', date: RB.addDays(pre, -5), name: 'ثلاجة بالآجل', category: 'kitchen', amount: 10000, includesVat: false, taxable: true, account: 'payable', supplier: 'شركة المعدات', lifeMonths: 60, salvage: 0 });
  const cu3 = reconcile(S);
  close(cu3.used, cu.used + 11500);
  close(cu3.remaining, cu.remaining - 11500);
  assert.deepEqual(cu3.laterAssets, { amount: 9200, count: 1 });
  // نفس المبلغ كفاتورة مشتريات آجلة قبل الافتتاح: نفس الأثر على المتبقي
  const P = RB.demoState(t);
  P.purchases.push({ id: 'pp', date: RB.addDays(pre, -5), supplier: 'مورد', category: 'food', account: 'payable', taxable: true, includesVat: false, lines: [{ qty: 1, price: 10000 }] });
  close(reconcile(P).remaining, cu.remaining - 11500);
  // سداد جزئي للمورد قبل الافتتاح لا يغيّر المتبقي (ينقص البنك والمستحق معاً)
  S.supplierPayments = (S.supplierPayments || []).concat([{ id: 'sp', date: RB.addDays(pre, -2), supplier: 'شركة المعدات', account: 'bank', amount: 4000 }]);
  close(reconcile(S).remaining, cu3.remaining);
  // غير مسجل: لا ضريبة مستردة
  S.settings.vatRegistered = false;
  assert.equal(RB.capitalUses(S).vatRecoverable, 0);
});

test('كشف الصندوق والبنك: الداخل قبل الخارج في اليوم نفسه، وسطور الرواتب لها بيان', () => {
  const S = base();
  S.capital = [{ id: 'c', date: '2026-05-01', partnerId: 'p1', type: 'contribution', account: 'cash', amount: 100 }];
  S.expenses = [{ id: 'x', date: '2026-05-02', category: 'maintenance', desc: 'صيانة', amount: 650, taxable: false, account: 'cash', months: 1 }];
  S.sales = [{ id: 's', date: '2026-05-02', channels: { cash: { amount: 700, orders: 10, type: 'cash' } } }];
  for (const from of [null, '2026-05-02']) {
    const st = RB.accountStatement(S, '1101', from, '2026-05-31');
    const floor = Math.min(st.opening, st.closing);
    assert.ok(st.rows.every((r) => r.balance >= floor - 0.001), JSON.stringify(st.rows));
    close(st.closing, 150);
    const day = st.rows.filter((r) => r.date === '2026-05-02');
    assert.deepEqual(day.map((r) => r.kind), ['sale', 'expense']);
  }
  // رواتب من البنك: سطران ببيانين مختلفين
  const sa = { id: 'e1', nationality: 'saudi', basic: 4000, housing: 1000, transport: 500 };
  S.capital.push({ id: 'c2', date: '2026-05-01', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 10000 });
  S.payroll = [{ id: 'w', month: '2026-05', date: '2026-05-31', account: 'bank', gosiAccount: 'bank', lines: [RB.payrollLine(sa, S)] }];
  const L = RB.buildLedger(S, '2026-05-31');
  const bank = RB.accountStatement(S, '1102', '2026-05-31', '2026-05-31', L).rows;
  assert.equal(bank.length, 2);
  assert.notEqual(bank[0].desc, bank[1].desc);
  assert.ok(bank[0].desc.endsWith('صافي الرواتب'));
  close(bank[0].out, 5012.5);
  assert.ok(bank[1].desc.includes('التأمينات الاجتماعية'));
  close(bank[1].out, 1075);
  // السطور بلا بيان لا تحمل الحقل
  assert.ok(L.entries.filter((e) => e.kind !== 'payroll').every((e) => e.lines.every((l) => !('memo' in l))));
  // البيانات التجريبية: في كل يوم لا ينزل الرصيد الجاري عن أقل رصيدي أول اليوم وآخره، ومسير سبتمبر سطران في كشف البنك
  const t = '2026-10-14';
  const D = RB.demoState(t);
  const DL = RB.buildLedger(D, t);
  for (const acc of ['1101', '1102']) {
    const st = RB.accountStatement(D, acc, null, t, DL);
    let open = st.opening;
    const byDay = {};
    st.rows.forEach((r) => (byDay[r.date] = byDay[r.date] || []).push(r));
    for (const d of Object.keys(byDay).sort()) {
      const rows = byDay[d];
      const floor = Math.min(open, rows[rows.length - 1].balance);
      assert.ok(rows.every((r) => r.balance >= floor - 0.001), acc + ' ' + d);
      open = rows[rows.length - 1].balance;
    }
  }
  const sep = RB.accountStatement(D, '1102', '2026-09-30', '2026-09-30', DL).rows.filter((r) => r.kind === 'payroll');
  assert.equal(sep.length, 2);
  assert.notEqual(sep[0].desc, sep[1].desc);
});

// ───────── WP2: الأنظمة السعودية والتصنيفات ─────────

test('التأمينات للسعودي في النظام الجديد: زيادة 0.5% لكل طرف كل يوليو من 2025 حتى 2028', () => {
  const S = base();
  const sa = { id: 'e1', name: 'سعود', nationality: 'saudi', basic: 4000, housing: 1000, gosiSystem: 'new' };
  const at = (emp, ym) => {
    const g = RB.gosiFor(emp, S, ym);
    return [g.base, g.er, g.ee];
  };
  assert.deepEqual(at(sa, '2026-10'), [5000, 637.5, 537.5]);
  assert.deepEqual(at(sa, '2025-10'), [5000, 612.5, 512.5]);
  assert.deepEqual(at(sa, '2025-06'), [5000, 587.5, 487.5]);
  assert.deepEqual(at(sa, '2028-08'), [5000, 687.5, 587.5]);
  // النظام السابق أو بلا قيمة (بيانات قائمة): نسب الإعدادات في كل الأشهر
  for (const gosiSystem of ['old', undefined]) {
    for (const ym of ['2025-06', '2026-10', '2028-08']) assert.deepEqual(at(Object.assign({}, sa, { gosiSystem }), ym), [5000, 587.5, 487.5]);
  }
  // المسير والتكلفة الشهرية يأخذان شهرهما
  const l = RB.payrollLine(sa, S, '2026-07');
  assert.deepEqual([l.gosiEr, l.gosiEe], [637.5, 537.5]);
  assert.equal(RB.employeeMonthlyCost(sa, S, '2025-08').gosi.er, 612.5);
  assert.deepEqual(RB.gosiSaudiRates(sa, S, '2026-07'), { er: 12.75, ee: 10.75 });
  // الزيادة فوق نسب الإعدادات، فتعديلها ينعكس على النظام الجديد
  S.settings.gosi.saudiEr = 12;
  assert.equal(RB.gosiFor(sa, S, '2026-10').er, 650);
  // غير السعودي لا يتأثر
  assert.equal(RB.gosiFor({ nationality: 'expat', basic: 2000, gosiSystem: 'new' }, S, '2028-08').er, 40);
  // البيانات التجريبية: الموظف السعودي في النظام الجديد، ومسيراته بنسب شهرها
  const D = RB.demoState('2026-10-15');
  const e5 = D.employees.find((e) => e.nationality === 'saudi');
  assert.equal(e5.gosiSystem, 'new');
  for (const pr of D.payroll) {
    const line = pr.lines.find((x) => x.employeeId === e5.id);
    assert.equal(line.gosiEr, RB.gosiFor(e5, D, pr.month).er, pr.month);
  }
  assert.equal(D.payroll.find((p) => p.month === '2026-09').lines.find((x) => x.employeeId === e5.id).gosiEr, 637.5);
});

test('السكن المقدَّم عيناً يدخل أجر التأمينات مقدّراً بأجر شهرين في السنة', () => {
  const S = base();
  const ex = { id: 'e2', nationality: 'expat', basic: 2500, housing: 0, housingCost: 375 };
  let g = RB.gosiFor(ex, S);
  close(g.base, 2916.67);
  assert.equal(g.er, 58.33);
  g = RB.gosiFor(Object.assign({}, ex, { housingInKind: false }), S);
  assert.deepEqual([g.base, g.er], [2500, 50]);
  // بدل سكن نقدي: يدخل كما هو
  assert.equal(RB.gosiFor(Object.assign({}, ex, { housing: 625 }), S).base, 3125);
  // اختيار صريح بلا نصيب من السكن
  assert.equal(RB.gosiFor({ nationality: 'expat', basic: 2400, housingInKind: true }, S).base, 2800);
  // السعودي كذلك، ضمن الحد الأعلى للأجر الخاضع
  close(RB.gosiFor({ nationality: 'saudi', basic: 4000, housingCost: 500 }, S, '2026-10').base, 4666.67);
  assert.equal(RB.gosiFor({ nationality: 'saudi', basic: 44000, housingCost: 500 }, S, '2026-10').base, 45000);
  // السكن المقدّر للتأمينات فقط: لا يغيّر الراتب ولا سطر المسير ولا إجماليه
  const l = RB.payrollLine(ex, S);
  assert.deepEqual([l.housing, RB.payrollLineGross(l), l.gosiEr], [0, 2500, 58.33]);
  assert.equal(RB.employeeMonthlyCost(ex, S).salary, 2500);
});

test('مخصص نهاية الخدمة يُستحق مع كل مسير، والمكافأة تُصرف منه', () => {
  const S = base();
  S.capital = [{ id: 'c', date: '2026-01-01', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 50000 }];
  S.employees = [{ id: 'e1', name: 'سالم', nationality: 'expat', basic: 2500, housing: 0, transport: 0, otherAllow: 500, startDate: '2026-01-10' }];
  const run = (ym, extra) => ({ id: 'w' + ym, month: ym, date: RB.monthEnd(ym), account: 'bank', gosiAccount: 'bank', lines: [Object.assign(RB.payrollLine(S.employees[0], S, ym), extra)] });
  // الأجر = الأساسي + السكن + البدلات = 3,000؛ الإضافي والخصومات لا تدخل
  S.payroll = [run('2026-03'), run('2026-04', { additions: 400 }), run('2026-05', { deductions: 300 })];
  const check = (asOf) => {
    const L = RB.buildLedger(S, asOf);
    for (const e of L.entries) close(RB.sum(e.lines, (x) => x.v), 0, 0.001);
    const tb = RB.trialBalance(S, null, asOf, L);
    close(tb.dr, tb.cr);
    const bs = RB.balanceSheet(S, asOf, L);
    close(bs.check, 0);
    close(RB.incomeStatement(S, '2000-01-01', asOf, L).net, bs.retained);
    return { b: RB.balances(L.entries, null, asOf), bs, L };
  };
  let { b, bs, L } = check('2026-12-31');
  close(b['5203'], 375);
  close(b['2201'], -375);
  close(bs.liab.find((x) => x.code === '2201').amount, 375);
  assert.deepEqual(RB.eosbBalances(S, '2026-12-31'), { e1: 375 });
  assert.deepEqual(RB.eosbBalances(S, '2026-04-30'), { e1: 250 });
  // قيد واحد لكل مسير بتاريخ استحقاق الرواتب
  assert.deepEqual(L.entries.filter((e) => e.kind === 'eosb').map((e) => e.date), ['2026-03-31', '2026-04-30', '2026-05-31']);
  // المسير المصروف في الشهر التالي: المخصص على شهر الخدمة
  S.payroll[2].date = '2026-06-03';
  close(RB.incomeStatement(S, '2026-05-01', '2026-05-31', RB.buildLedger(S, '2026-06-30')).groups.labor.find((x) => x.code === '5203').amount, 125);
  S.payroll[2].date = '2026-05-31';
  // صفحة العمال والدفاتر متفقة
  assert.equal(RB.employeeMonthlyCost(S.employees[0], S, '2026-05').items.find((i) => /نهاية الخدمة/.test(i.label)).v, 125);
  // أكثر من خمس سنوات خدمة: أجر شهر عن كل سنة (الأجر ÷ 12)
  S.employees[0].startDate = '2018-01-01';
  close(check('2026-12-31').b['5203'], 750);
  assert.equal(RB.eosbMonthly(3000, '2021-06-01', '2026-05-31'), 125);
  assert.equal(RB.eosbMonthly(3000, '2021-05-01', '2026-05-31'), 250);
  assert.equal(RB.eosbMonthly(3000, '', '2026-05-31'), 125);
  S.employees[0].startDate = '2026-01-10';
  // الصرف 400 مقابل 375 متراكماً: المخصص يُقفل والزيادة 25 مصروف
  S.payroll[2].lines[0].eosbPaid = 400;
  assert.equal(RB.payrollTotals(S.payroll[2]).eosbPaid, 400);
  assert.equal(RB.payrollTotals(S.payroll[2]).gross, 2700);
  ({ b, bs, L } = check('2026-12-31'));
  close(b['2201'] || 0, 0);
  close(b['5203'], 375 + 25);
  assert.ok(!bs.liab.some((x) => x.code === '2201'));
  assert.deepEqual(RB.eosbBalances(S, '2026-12-31'), { e1: 0 });
  const pay = L.entries.find((e) => e.kind === 'eosb' && e.lines.some((x) => x.a === '1102'));
  assert.equal(pay.date, '2026-05-31');
  close(pay.lines.find((x) => x.a === '1102').v, -400);
  // سطر بلا موظف لا يُستحق له مخصص، وصرفه كله مصروف
  S.payroll.push({ id: 'wx', month: '2026-06', date: '2026-06-30', account: 'bank', lines: [{ name: 'عامل مؤقت', basic: 1000, eosbPaid: 50 }] });
  b = check('2026-12-31').b;
  close(b['5203'], 375 + 25 + 50);
  close(b['2201'] || 0, 0);
  // البيانات التجريبية: مخصص سبتمبر = مجموع أجور العاملين ÷ 24، والميزانية تعرض المخصص
  const t = '2026-10-15';
  const D = RB.demoState(t);
  const DL = RB.buildLedger(D, t);
  const wages = RB.sum(D.employees.filter((e) => RB.isEmployeeActive(e, '2026-09')), (e) => RB.eosbMonthly(RB.num(e.basic) + RB.num(e.housing) + RB.num(e.transport) + RB.num(e.otherAllow), e.startDate, '2026-09-30'));
  const sep = RB.incomeStatement(D, '2026-09-01', '2026-09-30', DL);
  close(sep.groups.labor.find((x) => x.code === '5203').amount, wages);
  close(wages, 13700 / 24, 0.05);
  const dbs = RB.balanceSheet(D, t, DL);
  close(dbs.check, 0);
  close(dbs.liab.find((x) => x.code === '2201').amount, -RB.balances(DL.entries, null, t)['2201']);
  close(RB.sum(Object.values(RB.eosbBalances(D, t))), dbs.liab.find((x) => x.code === '2201').amount);
});

test('مخصص نهاية الخدمة عن أيام الخدمة في الشهر: المباشرة وترك العمل أثناءه، وشهر بدء الدفتر بلا حساب مرتين', () => {
  const run = (S, ym, date) => ({ id: 'w' + ym, month: ym, date: date || RB.monthEnd(ym), account: 'bank', gosiAccount: 'bank', lines: S.employees.map((e) => RB.payrollLine(e, S, ym)).filter((l) => RB.payrollLineGross(l) > 0) });
  // (أ) باشر 25 يناير بأجر 2,400: خصم 23 يوماً من راتبه، ومخصص 7 أيام (100 × 7/30) لا شهر كامل
  const A = base();
  A.employees = [{ id: 'e1', name: 'جديد', nationality: 'expat', basic: 2400, startDate: '2026-01-25', active: true }];
  A.payroll = ['2026-01', '2026-02', '2026-03'].map((ym) => run(A, ym));
  assert.equal(A.payroll[0].lines[0].deductions, 1840);
  assert.equal(RB.eosbServiceShare(A.employees[0], '2026-01'), 7 / 30);
  assert.equal(RB.eosbServiceShare(A.employees[0], '2026-02'), 1);
  const evA = RB.eosbEvents(A).filter((e) => e.kind === 'accrual');
  assert.deepEqual(evA.map((e) => e.total), [23.33, 100, 100]);
  // قريب من نظام العمل حتى 1 أبريل (الفرق من نظام 30 يوماً)
  close(RB.eosbBalances(A, '2026-03-31').e1, RB.eosbEarned(2400, '2026-01-25', '2026-04-01'), 7);
  close(-RB.balances(RB.buildLedger(A, '2026-03-31').entries, null, '2026-03-31')['2201'], 223.33);
  // (ب) ترك العمل 10 مارس: مخصص مارس عن 10 أيام
  A.employees[0].endDate = '2026-03-10';
  A.payroll[2] = run(A, '2026-03');
  // المخصص بعد كل مسير = الأجر × الخدمة حتى الآن بأشهر الأجر (فلا يتراكم فرق التقريب): 2,400 × (7/30 + 1 + 10/30) ÷ 24 = 156.67
  assert.equal(RB.eosbEvents(A).filter((e) => e.kind === 'accrual').pop().total, 33.34);
  assert.equal(RB.eosbBalances(A, '2026-03-31').e1, 156.67);
  // (ج) مطعم قائم بدأ دفتره 20 مارس، وعامل منذ 2018 بأجر 4,800 مخصصه الافتتاحي بنظام العمل حتى تاريخ البدء:
  // مسير مارس يستحق 12 يوماً بمعدل ما بعد الخمس سنوات (4,800 ÷ 12 × 12/30 = 160)
  const mkC = (withEosb) => {
    const C = base();
    C.employees = [{ id: 'e1', name: 'قديم', nationality: 'expat', basic: 4800, startDate: '2018-03-01', active: true }];
    const opE = RB.eosbEarned(4800, '2018-03-01', '2026-03-20');
    C.settings.opening = { date: '2026-03-20', cash: 0, bank: 50000, inventory: 0, vatCredit: 0, apps: {}, payables: [], eosb: withEosb ? [{ employeeId: 'e1', amount: opE }] : [] };
    C.payroll = [run(C, '2026-03'), run(C, '2026-04')];
    return C;
  };
  const C = mkC(true);
  assert.deepEqual(RB.eosbEvents(C).filter((e) => e.kind === 'accrual').map((e) => e.total), [160, 400]);
  close(RB.eosbBalances(C, '2026-03-31').e1, RB.eosbEarned(4800, '2018-03-01', '2026-04-01'), 3);
  // الشهر الكامل أجر ÷ 12 (لا بأيامه الفعلية من 365.25 يوماً): فرق أيام قليلة لا تراكم شهر
  close(RB.eosbBalances(C, '2026-04-30').e1, RB.eosbEarned(4800, '2018-03-01', '2026-05-01'), 10);
  const lab = RB.incomeStatement(C, '2026-03-20', '2026-03-31').groups.labor.find((x) => x.code === '5203');
  assert.equal(lab.amount, 160);
  // بلا مخصص افتتاحي له: خدمته قبل الدفتر لم تُحسب، فيبقى مارس شهراً كاملاً
  assert.deepEqual(RB.eosbEvents(mkC(false)).filter((e) => e.kind === 'accrual').map((e) => e.total), [400, 400]);
  // (هـ) الشهر الذي تكتمل فيه خمس سنوات (15 أكتوبر 2025 لمن باشر 14 أكتوبر 2020): 14 يوماً بمعدل ÷ 24 و17 بمعدل ÷ 12
  const F = base();
  F.employees = [{ id: 'e1', name: 'قديم', nationality: 'expat', basic: 4300, startDate: '2020-10-14', active: true }];
  assert.deepEqual(['2025-09', '2025-10', '2025-11'].map((ym) => RB.eosbLineAccrual(RB.payrollLine(F.employees[0], F, ym), F.employees[0], ym)), [179.17, 277.42, 358.33]);
  F.settings.opening = { date: '2025-09-01', cash: 0, bank: 50000, inventory: 0, vatCredit: 0, apps: {}, payables: [], eosb: [{ employeeId: 'e1', amount: RB.eosbEarned(4300, '2020-10-14', '2025-09-01') }] };
  F.payroll = ['2025-09', '2025-10', '2025-11', '2025-12'].map((ym) => run(F, ym));
  close(RB.eosbBalances(F, '2025-12-31').e1, RB.eosbEarned(4300, '2020-10-14', '2026-01-01'), 15);
  // (د) البيانات التجريبية: الموظفون باشروا 11 يونيو، فمخصص كل منهم قريب من نظام العمل حتى نهاية آخر مسير
  const t = '2026-10-14';
  const D = RB.demoState(t);
  const lastYm = D.payroll.map((p) => p.month).sort().pop();
  const bal = RB.eosbBalances(D, RB.monthEnd(lastYm));
  for (const e of D.employees) {
    if (!bal[e.id]) continue;
    const wage = RB.num(e.basic) + RB.num(e.housing) + RB.num(e.transport) + RB.num(e.otherAllow);
    close(bal[e.id], RB.eosbEarned(wage, e.startDate, RB.addDays(RB.monthEnd(lastYm), 1)), 0.03 * bal[e.id]);
  }
});

test('ترك العمل: يبقى المخصص حتى تُسوّى المكافأة، ثم يُرد ما بقي منه إلى المصروف', () => {
  const S = base();
  S.capital = [{ id: 'c', date: '2026-01-01', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 50000 }];
  S.employees = [{ id: 'e1', name: 'سالم', nationality: 'expat', basic: 2500, housing: 0, transport: 0, otherAllow: 500, startDate: '2026-01-10' }];
  const run = (ym, extra, date) => ({ id: 'w' + ym, month: ym, date: date || RB.monthEnd(ym), account: 'bank', gosiAccount: 'bank', lines: [Object.assign(RB.payrollLine(S.employees[0], S, ym), extra)] });
  S.payroll = [run('2026-03'), run('2026-04'), run('2026-05')];
  const check = (asOf) => {
    const L = RB.buildLedger(S, asOf);
    for (const e of L.entries) close(RB.sum(e.lines, (x) => x.v), 0, 0.001);
    const tb = RB.trialBalance(S, null, asOf, L);
    close(tb.dr, tb.cr);
    const bs = RB.balanceSheet(S, asOf, L);
    close(bs.check, 0);
    close(RB.incomeStatement(S, '2000-01-01', asOf, L).net, bs.retained);
    return { b: RB.balances(L.entries, null, asOf), L, rel: L.entries.filter((e) => e.kind === 'eosb' && e.ref.s === 'employees') };
  };
  const mayLabor = () => RB.incomeStatement(S, '2026-05-01', '2026-05-31', RB.buildLedger(S, '2026-12-31')).tot.labor;
  const pending = (d) => RB.eosbUnsettled(S, d).map((u) => [u.employee.id, u.amount, u.reason]);
  // على رأس العمل: المخصص قائم (375)
  close(check('2026-12-31').b['2201'], -375);
  const may0 = mayLabor();
  // ترك العمل ولم تُسجَّل مكافأته (قد يكون فصلاً تُستحق له كاملة): يبقى المخصص التزاماً، ويُنبَّه عليه
  S.employees[0].endDate = '2026-05-31';
  S.employees[0].active = false;
  let { b, rel } = check('2026-12-31');
  close(b['2201'], -375);
  assert.equal(rel.length, 0);
  close(mayLabor(), may0);
  assert.deepEqual(pending('2026-06-15'), [['e1', 375, 'pending']]);
  assert.deepEqual(pending('2026-05-30'), []);
  // لا مكافأة مستحقة (استقالة قبل سنتين — المادة 85): يُرد المخصص كله في تاريخ ترك العمل
  S.employees[0].eosbNone = true;
  ({ b, rel } = check('2026-12-31'));
  close(b['2201'] || 0, 0);
  close(b['5203'] || 0, 0);
  assert.deepEqual(rel.map((e) => e.date), ['2026-05-31']);
  assert.deepEqual(RB.eosbBalances(S, '2026-12-31'), { e1: 0 });
  assert.deepEqual(pending('2026-06-15'), []);
  // قبل تاريخ ترك العمل يبقى المخصص
  close(check('2026-05-30').b['2201'], -250);
  // تاريخ ترك العمل في المستقبل: لا رد حتى يحين، ولا تنبيه قبله
  S.employees[0].endDate = '2026-12-31';
  close(check('2026-10-15').b['2201'], -375);
  assert.deepEqual(pending('2026-10-15'), []);
  S.employees[0].endDate = '2026-05-31';
  delete S.employees[0].eosbNone;
  // صُرف له 100 في مسيره الأخير (شهر ترك العمل): تسوية، فيُرد الباقي 275 في تاريخ الصرف
  S.payroll[2].lines[0].eosbPaid = 100;
  ({ b, rel } = check('2026-12-31'));
  close(b['2201'] || 0, 0);
  close(b['5203'], 100);
  assert.equal(rel.length, 1);
  assert.equal(rel[0].date, '2026-05-31');
  close(rel[0].lines.find((x) => x.a === '2201').v, 275);
  close(rel[0].lines.find((x) => x.a === '5203').v, -275);
  // المتاح للصرف قبل رد الباقي = المتراكم بعد استحقاق المسير الأخير
  S.payroll[2].lines[0].eosbPaid = 0;
  assert.deepEqual(RB.eosbBalances(S, '2026-05-31', { release: false }), { e1: 375 });
  assert.deepEqual(RB.eosbBalances(S, '2026-05-31'), { e1: 375 });
  // فصل بمكافأة كاملة تُصرف في الشهر التالي: يبقى المخصص حتى الصرف، ولا يتغير شهر ترك العمل بتسجيلها
  S.payroll.push({ id: 'wfinal', month: '2026-06', date: '2026-06-10', account: 'bank', gosiAccount: 'bank', lines: [{ employeeId: 'e1', name: 'سالم', basic: 0, housing: 0, allowances: 0, additions: 0, deductions: 0, gosiEe: 0, gosiEr: 0, eosbPaid: 375 }] });
  ({ b, rel } = check('2026-12-31'));
  close(b['2201'] || 0, 0);
  close(b['5203'], 375);
  assert.equal(rel.length, 0);
  close(check('2026-06-05').b['2201'], -375);
  close(mayLabor(), may0);
  assert.deepEqual(pending('2026-06-15'), []);
  // صُرف أقل من المخصص (استقالة بنصيب منقوص): يُرد الباقي في تاريخ الصرف، وشهر ترك العمل كما هو
  S.payroll[3].lines[0].eosbPaid = 300;
  ({ b, rel } = check('2026-12-31'));
  close(b['2201'] || 0, 0);
  close(b['5203'], 300);
  assert.deepEqual(rel.map((e) => e.date), ['2026-06-10']);
  close(rel[0].lines.find((x) => x.a === '2201').v, 75);
  close(mayLabor(), may0);
  // المكافأة تزيد على المخصص: لا رد، والزيادة مصروف
  S.payroll[3].lines[0].eosbPaid = 400;
  ({ b, rel } = check('2026-12-31'));
  assert.equal(rel.length, 0);
  close(b['2201'] || 0, 0);
  close(b['5203'], 400);
  S.payroll.pop();
  // مكافأة صُرفت قبل شهر ترك العمل (تسوية سنوية أثناء الخدمة) ليست تسوية لترك العمل: الباقي يبقى حتى يُسوّى
  S.payroll[0].lines[0].eosbPaid = 50;
  ({ b, rel } = check('2026-12-31'));
  assert.equal(rel.length, 0);
  close(b['2201'], -325);
  assert.deepEqual(pending('2026-06-15'), [['e1', 325, 'pending']]);
  S.payroll[0].lines[0].eosbPaid = 0;
  // متوقف بلا تاريخ ترك العمل: لا رد، ويُنبَّه لتحديد التاريخ
  delete S.employees[0].endDate;
  close(check('2026-12-31').b['2201'], -375);
  assert.deepEqual(pending('2026-06-15'), [['e1', 375, 'noEnd']]);
  // ولا مكافأة مستحقة بلا تاريخ ترك العمل لا يرد شيئاً (يحتاج تاريخاً للرد)
  S.employees[0].eosbNone = true;
  close(check('2026-12-31').b['2201'], -375);
});

test('مسير التسوية: مسير شهر ترك العمل أو ما بعده، أو المصروف في تاريخ ترك العمل أو بعده', () => {
  const e = { id: 'e1', endDate: '2026-09-20' };
  const F = (month, date) => RB.eosbFinalRun(e, { month, date });
  assert.equal(F('2026-09', '2026-09-15'), true);
  assert.equal(F('2026-10', '2026-10-05'), true);
  assert.equal(F('2026-08', '2026-09-25'), true);
  assert.equal(F('2026-08', '2026-09-02'), false);
  assert.equal(RB.eosbFinalRun({ id: 'e1' }, { month: '2026-10', date: '2026-10-05' }), false);
  assert.equal(RB.eosbFinalRun(null, { month: '2026-10', date: '2026-10-05' }), false);
});

test('البيانات التجريبية: ترك العمل لا يغيّر شهره، وتسجيل المكافأة في الشهر التالي لا يعيد كتابته', () => {
  const t = '2026-10-15';
  const D = RB.normalize(RB.demoState(t));
  const e3 = D.employees.find((e) => e.id === 'e3');
  const sep = () => {
    const i = RB.incomeStatement(D, '2026-09-01', '2026-09-30', RB.buildLedger(D, t));
    const bs = RB.balanceSheet(D, '2026-09-30', RB.buildLedger(D, '2026-09-30'));
    close(bs.check, 0);
    return [i.tot.labor, bs.liab.find((x) => x.code === '2201').amount];
  };
  const s0 = sep();
  const prov = RB.eosbBalances(D, t).e3;
  e3.endDate = '2026-09-30';
  e3.active = false;
  assert.deepEqual(sep(), s0);
  assert.deepEqual(RB.eosbUnsettled(D, t).map((u) => [u.employee.id, u.amount]), [['e3', prov]]);
  D.payroll.push({ id: 'set', month: '2026-10', date: '2026-10-05', account: 'bank', gosiAccount: 'bank', lines: [{ employeeId: 'e3', name: e3.name, basic: 0, housing: 0, allowances: 0, additions: 0, deductions: 0, gosiEe: 0, gosiEr: 0, eosbPaid: prov }] });
  assert.deepEqual(sep(), s0);
  assert.deepEqual(RB.eosbUnsettled(D, t), []);
  close(RB.balances(RB.buildLedger(D, t).entries, null, t)['2201'], -(s0[1] - prov));
});

test('موظف محذوف له مسيرات (بيانات قديمة): لا يبقى مخصصه معلقاً بلا صاحب', () => {
  const S = base();
  S.capital = [{ id: 'c', date: '2026-01-01', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 50000 }];
  S.employees = [{ id: 'e1', name: 'سالم', nationality: 'expat', basic: 3000, startDate: '2026-01-01' }];
  S.payroll = ['2026-03', '2026-04'].map((ym) => ({ id: 'w' + ym, month: ym, date: RB.monthEnd(ym), account: 'bank', gosiAccount: 'bank', lines: [RB.payrollLine(S.employees[0], S, ym)] }));
  S.employees = [];
  const L = RB.buildLedger(S, '2026-12-31');
  const b = RB.balances(L.entries, null, '2026-12-31');
  close(b['2201'] || 0, 0);
  const rel = L.entries.filter((e) => e.kind === 'eosb' && /ترك العمل/.test(e.desc));
  assert.deepEqual(rel.map((e) => [e.date, e.ref.s, e.ref.id]), [['2026-04-30', 'payroll', 'w2026-04']]);
  close(RB.balanceSheet(S, '2026-12-31', L).check, 0);
  // قبل آخر مسير له يبقى المخصص كما كان
  close(RB.balances(L.entries, null, '2026-03-31')['2201'], -125);
  assert.deepEqual(RB.eosbUnsettled(S, '2026-12-31'), []);
});

test('حالة الموظف في الشهر: على رأس العمل، ترك العمل، متوقف، لم يباشر بعد', () => {
  const st = (e, ym) => RB.employeeStatus(e, ym);
  assert.equal(st({ startDate: '2026-01-01' }, '2026-10'), 'active');
  assert.equal(st({ startDate: '2026-11-01' }, '2026-10'), 'future');
  assert.equal(st({ startDate: '2026-10-20' }, '2026-10'), 'active');
  assert.equal(st({ startDate: '2026-01-01', endDate: '2026-09-30' }, '2026-10'), 'left');
  assert.equal(st({ startDate: '2026-01-01', endDate: '2026-10-31', active: false }, '2026-10'), 'left');
  assert.equal(st({ startDate: '2026-01-01', active: false }, '2026-10'), 'stopped');
  assert.equal(st({ startDate: '2026-01-01', endDate: '2026-12-31', active: false }, '2026-10'), 'stopped');
  assert.equal(st({ startDate: '2026-12-01', active: false }, '2026-10'), 'future');
  for (const [e, ym] of [[{ startDate: '2026-11-01' }, '2026-10'], [{ active: false }, '2026-10'], [{ endDate: '2026-09-01' }, '2026-10'], [{}, '2026-10']]) {
    assert.equal(RB.isEmployeeActive(e, ym), st(e, ym) === 'active');
  }
});

test('مكافأة من ترك العمل في مسير لاحق مرتبطة به: تُخصم من مخصصه ولا تُحمَّل مرتين', () => {
  const t = '2026-10-15';
  const D = RB.demoState(t);
  const bal = () => RB.balances(RB.buildLedger(D, '2026-10-31').entries, null, '2026-10-31');
  const b0 = bal();
  const prov = RB.eosbBalances(D, '2026-10-31').e3;
  assert.ok(prov > 0);
  const e3 = D.employees.find((e) => e.id === 'e3');
  e3.active = false;
  e3.endDate = '2026-09-30';
  // المسير التالي لا يعبّئه، لكن يُضاف له سطر مرتبط به (بلا راتب) لصرف مكافأته
  assert.ok(!D.employees.filter((e) => RB.isEmployeeActive(e, '2026-10')).some((e) => e.id === 'e3'));
  D.payroll.push({ id: 'prX', month: '2026-10', date: '2026-10-15', account: 'bank', gosiAccount: 'bank', lines: [{ employeeId: 'e3', name: e3.name, basic: 0, housing: 0, allowances: 0, additions: 0, deductions: 0, gosiEe: 0, gosiEr: 0, eosbPaid: prov }] });
  let b = bal();
  close(b['5203'], b0['5203']);
  close(b['2201'], b0['2201'] + prov);
  assert.equal(RB.eosbBalances(D, '2026-10-31').e3, 0);
  // صرف أقل من المخصص: الباقي يُرد، فالمصروف = المدفوع فقط
  D.payroll[D.payroll.length - 1].lines[0].eosbPaid = 100;
  b = bal();
  close(b['5203'], b0['5203'] - prov + 100);
  close(b['2201'], b0['2201'] + prov);
  const bs = RB.balanceSheet(D, '2026-10-31', RB.buildLedger(D, '2026-10-31'));
  close(bs.check, 0);
});

test('الزكاة بند مستقل بعد صافي الربح وتُحمَّل على السنة التي تخصها', () => {
  const S = base();
  S.settings.openingDate = '2025-01-01';
  S.capital = [{ id: 'c', date: '2025-01-01', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 100000 }];
  S.sales = [
    { id: 's1', date: '2025-06-10', channels: { cash: { amount: 115000, orders: 1000, type: 'cash' } } },
    { id: 's2', date: '2026-06-10', channels: { cash: { amount: 115000, orders: 1000, type: 'cash' } } },
  ];
  const ex = (o) => Object.assign({ includesVat: false, taxable: false, account: 'bank', entity: '', employeeId: '' }, o);
  S.expenses = [
    ex({ id: 'r1', date: '2025-01-01', category: 'rent', desc: 'إيجار', amount: 24000, months: 12 }),
    ex({ id: 'g1', date: '2025-01-05', category: 'gov', desc: 'رخصة المحل التجاري', amount: 1200, months: 12 }),
    ex({ id: 'z1', date: '2026-04-28', category: 'zakat', desc: 'الزكاة عن السنة المالية السابقة', entity: 'هيئة الزكاة والضريبة والجمارك', amount: 12000, months: 12, startDate: '2025-01-01' }),
  ];
  const y25 = RB.incomeStatement(S, '2025-01-01', '2025-12-31', RB.buildLedger(S, '2025-12-31'));
  assert.equal(y25.zakat, 12000);
  assert.deepEqual(y25.groups.zakat.map((x) => x.code), ['5901']);
  assert.ok(!y25.groups.opex.some((x) => x.code === '5901'));
  close(y25.tot.opex, 1200);
  close(y25.expenses, y25.tot.sell + y25.tot.labor + y25.tot.occ + y25.tot.opex + y25.tot.dep);
  close(y25.netBeforeZakat, y25.grossProfit - y25.expenses);
  close(y25.net, y25.netBeforeZakat - 12000);
  const y26 = RB.incomeStatement(S, '2026-01-01', '2026-12-31', RB.buildLedger(S, '2026-12-31'));
  assert.equal(y26.zakat, 0);
  close(y26.net, y26.netBeforeZakat);
  // الميزانية متوازنة: زكاة 2025 غير المدفوعة في نهايتها مستحقة
  const bs25 = RB.balanceSheet(S, '2025-12-31', RB.buildLedger(S, '2025-12-31'));
  close(bs25.check, 0);
  close(bs25.liab.find((x) => x.code === '1105').amount, 12000);
  // نقطة التعادل لا تتغير بالزكاة
  const noZ = Object.assign({}, S, { expenses: S.expenses.filter((x) => x.id !== 'z1') });
  for (const [from, to] of [['2025-01-01', '2025-12-31'], ['2026-04-01', '2026-04-30']]) {
    assert.equal(RB.breakEven(S, from, to, null, '2026-10-15').fixedMonthly, RB.breakEven(noZ, from, to, null, '2026-10-15').fixedMonthly);
  }
  // تذكير سنوي من تاريخ الدفع
  const rz = RB.renewals(S, '2026-10-15').find((r) => r.rec.id === 'z1');
  assert.equal(rz.end, '2027-04-27');
  assert.equal(rz.status, 'ok');
  // القالب والتصنيف
  const pr = RB.GOV_PRESETS.find((p) => p.category === 'zakat');
  assert.deepEqual([pr.entity, pr.desc, pr.months], ['هيئة الزكاة والضريبة والجمارك', 'الزكاة عن السنة المالية السابقة', 12]);
  assert.ok(RB.GOV_CATS.includes('zakat'));
  assert.equal(RB.GROUPS.zakat, 'الزكاة');
  assert.equal(RB.ACC['5901'].group, 'zakat');
  // الزكاة المسجلة سابقاً «رسوماً حكومية» تنتقل لتصنيفها
  const old = RB.normalize({ expenses: [{ id: 'q', date: '2026-04-01', category: 'gov', desc: 'الزكاة السنوية', amount: 5000, months: 12 }, { id: 'q2', date: '2026-04-01', category: 'gov', desc: 'رخصة', amount: 50, months: 12 }] });
  assert.deepEqual(old.expenses.map((x) => x.category), ['zakat', 'gov']);
});

test('تأمين المحل مصروف تشغيلي والتأمين الطبي للعمال ضمن العمالة', () => {
  const fire = RB.GOV_PRESETS.find((p) => p.desc.includes('الحريق'));
  assert.equal(fire.category, 'shop_insurance');
  assert.deepEqual([RB.expenseCat('shop_insurance').acc, RB.expenseCat('shop_insurance').group], ['5315', 'opex']);
  assert.ok(RB.GOV_CATS.includes('shop_insurance'));
  assert.deepEqual([RB.expenseCat('insurance').name, RB.expenseCat('insurance').acc, RB.expenseCat('insurance').group], ['التأمين الطبي للعمال', '5307', 'labor']);
  assert.equal(RB.GOV_PRESETS.find((p) => p.desc === 'تأمين طبي للعمال').category, 'insurance');
  // التصنيف غير المعروف ما زال «مصاريف أخرى»
  assert.equal(RB.expenseCat('???').id, 'other');
  const S = base();
  S.sales = [{ id: 's', date: '2026-05-15', channels: { cash: { amount: 115000, orders: 900, type: 'cash' } } }];
  S.expenses = [
    { id: 'f', date: '2026-05-01', category: fire.category, desc: fire.desc, amount: 6000, taxable: true, includesVat: false, months: 12, account: 'bank' },
    { id: 'm', date: '2026-05-01', category: 'insurance', desc: 'تأمين طبي للعمال', amount: 2400, taxable: true, includesVat: false, months: 12, account: 'bank' },
  ];
  const may = RB.incomeStatement(S, '2026-05-01', '2026-05-31');
  close(may.tot.opex, 500);
  close(may.tot.labor, 200);
  close(may.ratios.labor, 0.2);
  // السجلات القديمة: تأمين المحل كان تحت «التأمين الطبي والتأمينات»
  const n = RB.normalize({
    expenses: [
      { id: 'a', date: '2026-01-01', category: 'insurance', desc: 'تأمين المحل ضد الحريق', amount: 1 },
      { id: 'b', date: '2026-01-01', category: 'insurance', desc: 'تأمين ممتلكات', amount: 1 },
      { id: 'c', date: '2026-01-01', category: 'insurance', desc: 'تأمين طبي للعمال', amount: 1 },
      { id: 'd', date: '2026-01-01', category: 'insurance', desc: 'التأمين الطبي لعمال المحل', amount: 1 },
    ],
  });
  assert.deepEqual(n.expenses.map((x) => x.category), ['shop_insurance', 'shop_insurance', 'insurance', 'insurance']);
});

test('تصنيف المصروف المحفوظ بالتصنيفات الحالية يبقى كما هو بعد التحميل، والقديم وحده يُنقل', () => {
  const S = base();
  S.sales = [{ id: 's1', date: '2026-02-05', channels: { cash: { amount: 11500, orders: 10, type: 'cash' } } }];
  const v = RB.EXPENSE_CAT_V;
  S.expenses = [
    { id: 'g', date: '2026-02-05', category: 'gov', desc: 'رسوم إصدار شهادة الزكاة', amount: 1100, taxable: false, account: 'bank', catV: v },
    { id: 'p', date: '2026-02-05', category: 'gov', desc: 'غرامة هيئة الزكاة والضريبة', amount: 300, taxable: false, account: 'bank', catV: v },
    { id: 'i', date: '2026-02-05', category: 'insurance', desc: 'تأمين عمال المحل', amount: 2200, taxable: false, account: 'bank', catV: v },
    // محفوظ قبل التصنيفات الجديدة (بلا catV): يُنقل مرة عند التحميل
    { id: 'o', date: '2026-02-05', category: 'gov', desc: 'زكاة 2025', amount: 500, taxable: false, account: 'bank' },
  ];
  const n = RB.normalize(JSON.parse(JSON.stringify(S)));
  assert.deepEqual(n.expenses.map((x) => x.category), ['gov', 'gov', 'insurance', 'zakat']);
  // التحميل مرة ثانية لا يغيّر شيئاً، والدفتر نفسه قبل الحفظ وبعده (ما عدا السجل القديم المنقول)
  assert.deepEqual(RB.normalize(JSON.parse(JSON.stringify(n))).expenses, n.expenses);
  const S2 = JSON.parse(JSON.stringify(S));
  S2.expenses = S2.expenses.filter((x) => x.catV);
  assert.deepEqual(RB.buildLedger(S2, '2026-12-31'), RB.buildLedger(RB.normalize(JSON.parse(JSON.stringify(S2))), '2026-12-31'));
  const inc = RB.incomeStatement(n, '2026-02-01', '2026-02-28');
  assert.deepEqual([inc.tot.opex, inc.tot.labor, inc.tot.zakat], [1400, 2200, 500]);
  // البيانات التجريبية محفوظة بالتصنيفات الحالية
  assert.ok(RB.demoState('2026-10-14').expenses.every((x) => x.catV === v));
});

test('متابعة التجديد: لا رسوم لمرة واحدة ولا لعامل غادر، وإيقاف المتابعة حتى التجديد', () => {
  const S = base();
  S.employees = [
    { id: 'eL', name: 'غادر', nationality: 'expat', basic: 2000, startDate: '2025-01-01', endDate: '2026-08-15', active: false },
    { id: 'eE', name: 'ينتهي عقده', nationality: 'expat', basic: 2000, startDate: '2025-01-01', endDate: '2026-12-31', active: true },
    { id: 'eA', name: 'على رأس العمل', nationality: 'expat', basic: 2000, startDate: '2025-01-01', active: true },
  ];
  const ex = (o) => Object.assign({ includesVat: false, taxable: false, account: 'bank', startDate: '', entity: '', employeeId: '', months: 12 }, o);
  S.expenses = [
    ex({ id: 'v1', date: '2026-09-01', category: 'labor_gov', desc: 'تأشيرة خروج وعودة', amount: 200, months: 1 }),
    ex({ id: 'v2', date: '2026-02-01', category: 'labor_gov', desc: 'إصدار تأشيرة عمل (استقدام عامل)', amount: 2000, oneOff: true }),
    ex({ id: 'i1', date: '2025-09-01', category: 'labor_gov', desc: 'تجديد إقامة', amount: 650, employeeId: 'eL' }),
    ex({ id: 'i2', date: '2026-03-01', category: 'labor_gov', desc: 'تجديد إقامة', amount: 650, employeeId: 'eE' }),
    ex({ id: 'i3', date: '2026-03-01', category: 'labor_gov', desc: 'تجديد إقامة', amount: 650, employeeId: 'eA' }),
    ex({ id: 'i4', date: '2026-03-01', category: 'labor_gov', desc: 'تجديد إقامة', amount: 650, employeeId: 'deleted' }),
    ex({ id: 'l1', date: '2025-11-01', category: 'gov', desc: 'رخصة المحل التجاري', amount: 1800 }),
    ex({ id: 'c1', date: '2025-12-20', category: 'gov', desc: 'لوحة المحل', amount: 500, noRenew: true }),
    ex({ id: 'p1', date: '2026-09-20', category: 'software', desc: 'اشتراك نظام نقاط البيع', amount: 230, months: 1 }),
  ];
  const ids = (d) => RB.renewals(S, d).map((r) => r.rec.id).sort();
  assert.deepEqual(ids('2026-10-15'), ['i3', 'l1']);
  const lic = (d) => RB.renewals(S, d).find((r) => r.rec.id === 'l1');
  assert.deepEqual([lic('2026-10-15').end, lic('2026-10-15').status], ['2026-10-31', 'soon']);
  assert.equal(lic('2026-09-15').status, 'ok');
  assert.equal(lic('2026-11-05').status, 'expired');
  // تجديد البند الموقوف (سجل جديد بلا noRenew) يعيده للمتابعة
  S.expenses.push(ex({ id: 'c2', date: '2026-12-10', category: 'gov', desc: 'لوحة المحل', amount: 500, startDate: '2026-12-20' }));
  assert.deepEqual(ids('2026-10-15'), ['c2', 'i3', 'l1']);
  // إيقاف المتابعة على آخر سجل يخفي البند كله
  S.expenses.find((x) => x.id === 'c2').noRenew = true;
  assert.deepEqual(ids('2026-10-15'), ['i3', 'l1']);
  // عامل عاد للعمل بلا تاريخ ترك: يُتابع
  Object.assign(S.employees[1], { endDate: '' });
  assert.deepEqual(ids('2026-10-15'), ['i2', 'i3', 'l1']);
});

test('متابعة التجديد: آخر سجل للبند يقرر — «لمرة واحدة» أو أقل من 3 أشهر لا يعيد سجلاً أقدم منتهياً', () => {
  const ex = (o) => Object.assign({ category: 'gov', entity: 'بلدي', desc: 'لوحة المحل', amount: 500, months: 12, account: 'bank', includesVat: false, taxable: false }, o);
  const S = RB.normalize({ settings: {}, expenses: [ex({ id: 'a', date: '2025-06-01' }), ex({ id: 'b', date: '2026-06-01' })] });
  const R = () => RB.renewals(S, '2026-10-15').map((r) => [r.rec.id, r.end, r.status]);
  assert.deepEqual(R(), [['b', '2027-05-31', 'ok']]);
  // «رسم لمرة واحدة» على آخر سجل: البند كله لا يُتابع، ولا يظهر السجل الأقدم منتهياً
  S.expenses[1].oneOff = true;
  assert.deepEqual(R(), []);
  // «لمرة واحدة» على سجل أقدم فقط لا يوقف متابعة الأحدث
  S.expenses[1].oneOff = false;
  S.expenses[0].oneOff = true;
  assert.deepEqual(R(), [['b', '2027-05-31', 'ok']]);
  S.expenses[0].oneOff = false;
  // آخر سجل يغطي شهراً واحداً (صار الدفع شهرياً): لا يُتابع، ولا يظهر السجل السنوي الأقدم منتهياً
  S.expenses.push(ex({ id: 'm', date: '2027-06-05', months: 1 }));
  assert.deepEqual(RB.renewals(S, '2027-07-15').map((r) => r.rec.id), []);
  // وتجديد سنوي بعده يعيده
  S.expenses.push(ex({ id: 'y', date: '2027-07-05', months: 12 }));
  assert.deepEqual(RB.renewals(S, '2027-07-15').map((r) => r.rec.id), ['y']);
});

test('قوالب الرسوم الحكومية: رسوم لمرة واحدة ومبالغ تتعبأ من بيانات العامل', () => {
  const P = (d) => RB.GOV_PRESETS.find((p) => p.desc === d);
  for (const d of ['تأشيرة خروج وعودة', 'إصدار تأشيرة عمل (استقدام عامل)', 'نقل خدمات عامل', 'تغيير مهنة']) {
    assert.ok(P(d) && P(d).oneOff && P(d).category === 'labor_gov', d);
  }
  assert.ok(!RB.GOV_PRESETS.some((p) => p.desc === 'تأشيرة استقدام'));
  assert.deepEqual([P('توثيق عقد إيجار المحل').entity, P('توثيق عقد إيجار المحل').category], ['منصة إيجار', 'gov']);
  assert.deepEqual([P('اشتراك بوابة مقيم').entity, P('اشتراك بوابة مقيم').category, P('اشتراك بوابة مقيم').months], ['مقيم (علم)', 'software', 12]);
  assert.deepEqual(RB.GOV_PRESETS.filter((p) => p.auto).map((p) => [p.desc, p.auto]), [['رخصة عمل + المقابل المالي', 'qiwa'], ['تجديد إقامة', 'iqama'], ['تأمين طبي للعمال', 'medical']]);
  const e1 = RB.demoState('2026-10-15').employees.find((e) => e.id === 'e1');
  assert.equal(RB.autoFeeAmount('qiwa', e1), 9700);
  assert.equal(RB.autoFeeAmount('iqama', e1), 650);
  assert.equal(RB.autoFeeAmount('medical', e1), 1800);
  assert.equal(RB.autoFeeAmount(undefined, e1, 'labor_gov'), 10350);
  assert.equal(RB.autoFeeAmount(undefined, e1, 'gov'), 0);
  const sa = { nationality: 'saudi', levyMonthly: 800, iqamaAnnual: 650, workPermitAnnual: 100, medicalAnnual: 2300 };
  assert.deepEqual(['qiwa', 'iqama', 'medical'].map((a) => RB.autoFeeAmount(a, sa)), [0, 0, 2300]);
  assert.equal(RB.autoFeeAmount(undefined, sa, 'labor_gov'), 0);
  assert.equal(RB.autoFeeAmount('qiwa', null), 0);
});

test('حد التسجيل في ضريبة القيمة المضافة لغير المسجل: 375,000 إلزامي و187,500 اختياري', () => {
  const t = '2026-10-15';
  const D = RB.demoState(t);
  assert.equal(RB.vatThreshold(D, t), null); // المسجل لا يُنبّه
  D.settings.vatRegistered = false;
  const v = RB.vatThreshold(D, t);
  // مفتوح منذ أقل من سنة: المتوقع لسنة من مبيعات أيام التشغيل يتجاوز الحد الإلزامي
  assert.equal(v.start, D.settings.openingDate);
  assert.ok(v.last12 < RB.VAT_MANDATORY, String(v.last12));
  close(v.last12, RB.sum(D.sales, RB.saleTotal));
  close(v.runRate, (v.last12 / (RB.daysBetween(D.settings.openingDate, t) + 1)) * 365, 0.02);
  assert.equal(v.level, 'mandatory');
  // مسجل بتاريخ سريان لاحق: سُجّل فعلاً فلا تنبيه
  assert.equal(RB.vatThreshold(Object.assign({}, D, { settings: Object.assign({}, D.settings, { vatRegistered: true, vatRegisteredFrom: '2026-12-01' }) }), t), null);
  // مطعم قائم منذ سنوات: آخر 12 شهراً فقط
  const S = base();
  S.settings.vatRegistered = false;
  S.settings.openingDate = '2020-01-01';
  const day = (date, amount) => ({ id: date, date, channels: { cash: { amount, orders: 1, type: 'cash' } } });
  S.sales = [day('2025-09-01', 300000), day('2025-11-01', 100000), day('2026-08-01', 100000)];
  let x = RB.vatThreshold(S, '2026-10-15');
  assert.deepEqual([x.last12, x.runRate, x.level], [200000, 0, 'voluntary']);
  S.sales.push(day('2026-10-15', 175000));
  assert.equal(RB.vatThreshold(S, '2026-10-15').level, 'mandatory');
  S.sales = [day('2025-01-01', 1000), day('2026-05-01', 100000)];
  assert.equal(RB.vatThreshold(S, '2026-10-15').level, '');
  // الدفتر بدأ بعد الافتتاح بسنوات: المتوقع من أول مبيعات مسجلة
  S.sales = [day('2026-09-16', 40000)];
  x = RB.vatThreshold(S, '2026-10-15');
  assert.equal(x.start, '2026-09-16');
  close(x.runRate, (40000 / 30) * 365);
  assert.equal(x.level, 'mandatory');
});

test('التأمين المسترد لا ضريبة عليه ولو حُفظ «خاضعاً»', () => {
  const S = base();
  S.settings.openingDate = '2026-09-15';
  S.capital = [{ id: 'c1', date: '2026-08-01', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 50000 }];
  // سجل قديم حُفظ بـ taxable: true (الافتراضي في النموذج قبل التصحيح)
  const dep = { id: 'a1', date: '2026-09-01', name: 'تأمين إيجار المحل', category: 'deposit', amount: 11500, includesVat: false, taxable: true, account: 'bank', lifeMonths: 0, salvage: 0 };
  S.assets = [dep, { id: 'a2', date: '2026-09-02', name: 'تأمين العدادات', category: 'deposit', amount: 2300, includesVat: true, taxable: true, account: 'payable', supplier: 'شركة الكهرباء', lifeMonths: 0, salvage: 0 }];
  assert.equal(RB.assetTaxable(dep), false);
  assert.equal(RB.assetTaxable({ category: 'kitchen', taxable: true }), true);
  assert.equal(RB.assetTaxable({ category: 'kitchen', taxable: false }), false);
  assert.match(RB.assetCat('deposit').hint, /لا تُحتسب عليه ضريبة/);
  const L = RB.buildLedger(S, '2026-10-15');
  const e = L.entries.find((x) => x.kind === 'asset' && x.ref.id === 'a1');
  assert.ok(!e.lines.some((l) => l.a === '2102' && l.v), 'لا سطر ضريبة مدخلات');
  assert.equal(e.lines.find((l) => l.a === '1208').v, 11500);
  assert.equal(e.lines.find((l) => l.a === '1102').v, -11500);
  const vr = RB.vatReport(S, '2026-07-01', '2026-12-31', L);
  assert.equal(vr.inVat, 0);
  assert.equal(vr.inBase, 0);
  // جدول الإهلاك والآجل ورأس المال التأسيسي بلا ضريبة أيضاً
  assert.equal(RB.depSchedule(dep, S).cost, 11500);
  assert.equal(RB.supplierBalances(S, '2026-10-15').find((x) => x.supplier === 'شركة الكهرباء').balance, 2300);
  const u = RB.capitalUses(S, L);
  assert.equal(u.assetsTotal, 13800);
  assert.equal(u.vatRecoverable, 0);
  const bal = RB.balances(L.entries, null, '2026-10-15');
  close(bal['1208'], 13800);
  close(bal['2102'] || 0, 0);
});

test('التأمين الطبي إلزامي: قيمة افتراضية في الإعدادات وتكلفة العامل، وتطابق التجريبي مع المصروف المسجل', () => {
  const d = RB.defaultSettings();
  assert.equal(d.labor.medicalAnnual, 1500);
  // نسخة قديمة حفظت 0: تبقى كما هي (قيمة المستخدم)
  assert.equal(RB.normalize({ settings: { labor: { medicalAnnual: 0 } } }).settings.labor.medicalAnnual, 0);
  // عامل جديد بالقيم الافتراضية في دفتر جديد: 1,500 ÷ 12 = 125 شهرياً
  const S = base();
  const L = S.settings.labor;
  const ex = { id: 'e1', nationality: 'expat', basic: 2000, housing: 0, levyMonthly: L.levyMonthly, iqamaAnnual: L.iqamaAnnual, workPermitAnnual: L.workPermitAnnual, medicalAnnual: L.medicalAnnual };
  const c = RB.employeeMonthlyCost(ex, S);
  const med = c.items.find((i) => i.k === 'medical');
  assert.equal(med.v, 125);
  assert.equal(med.label, 'التأمين الطبي (شهرياً)');
  assert.deepEqual(c.items.map((i) => i.k), ['salary', 'gosi', 'levy', 'iqama', 'medical', 'ticket', 'housing', 'other', 'eosb']);
  // بلا قسط: البند موجود بقيمة صفر (تعرضه الواجهة مع تنبيه)
  assert.equal(RB.employeeMonthlyCost(Object.assign({}, ex, { medicalAnnual: 0 }), S).items.find((i) => i.k === 'medical').v, 0);
  // التجريبي: مجموع أقساط الموظفين = مصروف التأمين الطبي المسجل
  const D = RB.demoState('2026-10-15');
  const booked = RB.sum(D.expenses.filter((x) => x.category === 'insurance'), (x) => RB.num(x.amount));
  assert.equal(booked, 9500);
  assert.equal(RB.sum(D.employees, (e) => RB.num(e.medicalAnnual)), booked);
  assert.ok(D.employees.filter((e) => e.nationality === 'saudi').every((e) => RB.num(e.medicalAnnual) > 0));
});

test('التجريبي: مورد الخضار غير مسجل في الضريبة وفواتيره بلا رقم ضريبي', () => {
  const D = RB.demoState('2026-10-15');
  const veg = D.purchases.filter((p) => p.supplier === 'بائع خضار (غير مسجل في الضريبة)');
  assert.ok(veg.length > 5);
  for (const p of veg) {
    assert.equal(p.taxable, false);
    assert.equal(p.invoiceNo, '');
    assert.equal(p.note, 'مورد غير مسجل في الضريبة — لا فاتورة ضريبية');
  }
  assert.ok(!D.purchases.some((p) => p.supplier === 'سوق الخضار المركزي'));
  // المواد غير الخاضعة في التجريبي مصدرها هذا المورد فقط
  const untaxed = D.raw.filter((r) => !r.taxable);
  assert.ok(untaxed.length && untaxed.every((r) => r.supplier === 'بائع خضار (غير مسجل في الضريبة)'));
  // باقي الموردين لهم أرقام فواتير
  assert.ok(D.purchases.filter((p) => p.lines.some((l) => l.rawId) && p.taxable).every((p) => p.invoiceNo));
});

test('تكلفة الطعام والسعر المقترح حسب التسجيل في الضريبة (كما يشرحها الدليل)', () => {
  const S = base();
  S.settings.targetFoodCost = 30;
  S.settings.priceRounding = 1;
  S.raw = [{ id: 'beef', name: 'لحم', price: 400, packQty: 10000, useUnit: 'جم', taxable: true, wastePct: 0 }];
  S.products = [{ id: 'b', name: 'برقر', price: 23, items: [{ kind: 'raw', id: 'beef', qty: 150 }] }]; // التكلفة 6
  // المسجل: الأسعار شاملة الضريبة؛ تكلفة الطعام من السعر بدونها، والمقترح يضيف الضريبة ثم يُقرَّب لأعلى
  let st = RB.productStats(S, S.products[0]);
  close(st.cost, 6, 1e-9);
  close(st.foodCost, (6 / 20) * 100, 1e-9);
  assert.equal(st.suggested, 23); // 6 ÷ 0.30 = 20 × 1.15 = 23
  // نسبة ضريبة مختلفة في الإعدادات تُستخدم بدل 15% الثابتة
  S.settings.vatRate = 10;
  assert.equal(RB.productStats(S, S.products[0]).suggested, 22);
  // غير المسجل: لا ضريبة على أسعاره
  S.settings.vatRate = 15;
  S.settings.vatRegistered = false;
  S.raw[0].taxable = false;
  st = RB.productStats(S, S.products[0]);
  close(st.priceNet, 23, 1e-9);
  close(st.foodCost, (6 / 23) * 100, 1e-9);
  assert.equal(st.suggested, 20);
});

// ───────────── سلامة البيانات (WP3) ─────────────
test('تنظيف السجل: التاريخ الناقص أو غير الصالح يُعلَّم ولا يُحذف، والأشكال الخاطئة تُصحَّح بلا تغيير الأصل', () => {
  const ok = { id: 'x1', date: '2026-03-15', category: 'rent', amount: 100 };
  assert.equal(RB.sanitizeRecord('expenses', ok), ok); // السليم يرجع كما هو
  // قسم صنف المنيو «حلى» القديم ← «حلويات» (خيار «القسم» الحالي)، في التحميل وفي اللقطة المشتركة، دون تغيير الأصل
  assert.ok(RB.PRODUCT_CATS.includes('حلويات') && !RB.PRODUCT_CATS.includes('حلى'));
  const sweet = { id: 'p1', name: 'كيكة', category: 'حلى', price: 8 };
  assert.deepEqual(RB.sanitizeRecord('products', sweet), { id: 'p1', name: 'كيكة', category: 'حلويات', price: 8 });
  assert.equal(sweet.category, 'حلى');
  assert.equal(RB.normalize({ products: [sweet] }).products[0].category, 'حلويات');
  const burger = { id: 'p2', name: 'برقر', category: 'برقر' };
  assert.equal(RB.sanitizeRecord('products', burger), burger);
  assert.equal(RB.sanitizeRecord('raw', { id: 'r1', name: 'مادة', category: 'حلى' }).category, 'حلى');
  assert.deepEqual(RB.sanitizeRecord('expenses', { id: 'a', amount: 1 })._bad, ['date']);
  assert.deepEqual(RB.sanitizeRecord('expenses', { id: 'a', date: '15/03/2026' })._bad, ['date']);
  assert.deepEqual(RB.sanitizeRecord('expenses', { id: 'a', date: '2026-13-45' })._bad, ['date']);
  assert.deepEqual(RB.sanitizeRecord('expenses', { id: 'a', date: '2026-02-30' })._bad, ['date']);
  assert.deepEqual(RB.sanitizeRecord('expenses', { id: 'a', date: '2026-02-28', startDate: 'غداً' })._bad, ['startDate']);
  assert.deepEqual(RB.sanitizeRecord('payroll', { id: 'a', date: '2026-02-28', month: '2026-13' })._bad, ['month']);
  assert.deepEqual(RB.sanitizeRecord('employees', { id: 'a', name: 'س', endDate: 20260101 }), { id: 'a', name: 'س', endDate: '20260101', _bad: ['endDate'] });
  // الأقسام بلا تاريخ عملية (الموظفون والمواد والمنيو) لا تحتاج تاريخاً
  assert.equal(RB.sanitizeRecord('employees', { id: 'e', name: 'س' })._bad, undefined);
  // التصحيح يمسح العلامة القديمة، والأصل لا يتغير
  const fixed = { id: 'a', date: '2026-03-01', _bad: ['date'] };
  assert.equal(RB.sanitizeRecord('expenses', fixed)._bad, undefined);
  assert.deepEqual(fixed._bad, ['date']);
  // المعرّف نص، والقوائم مصفوفات كائنات، والأسماء نصوص، والقناة الفارغة تُسقط
  assert.equal(RB.sanitizeRecord('partners', { id: 42, name: 'ر' }).id, '42');
  assert.deepEqual(RB.sanitizeRecord('purchases', { id: 'p', date: '2026-01-01', lines: { a: 1 } }).lines, []);
  assert.deepEqual(RB.sanitizeRecord('purchases', { id: 'p', date: '2026-01-01', lines: [null, { qty: 1 }, 'x'] }).lines, [{ qty: 1 }]);
  assert.deepEqual(RB.sanitizeRecord('composites', { id: 'c', name: 'ص', items: { a: 1 } }).items, []);
  assert.deepEqual(RB.sanitizeRecord('sales', { id: 's', date: '2026-01-01', channels: { cash: null, card: { amount: 5 } } }).channels, { card: { amount: 5 } });
  assert.deepEqual(RB.sanitizeRecord('sales', { id: 's', date: '2026-01-01', channels: 'x' }).channels, {});
  assert.equal(RB.sanitizeRecord('products', { id: 'p', price: 5 }).name, '');
  assert.equal(RB.sanitizeRecord('expenses', { id: 'e', date: '2026-01-01', desc: 12 }).desc, '12');
  // ليس سجلاً: يُرفض
  assert.equal(RB.sanitizeRecord('sales', null), null);
  assert.equal(RB.sanitizeRecord('sales', { date: '2026-01-01' }), null);
  assert.equal(RB.sanitizeRecord('sales', [1]), null);
});

test('توحيد البيانات: الإعدادات كائن بلا مفاتيح رقمية، قنوات صالحة، ومعرّفات مكررة تُفرَّق', () => {
  const a = RB.normalize({ settings: 'abc' });
  assert.deepEqual(a.settings, RB.defaultSettings());
  const b = RB.normalize({ settings: { 0: 'a', 1: 'b', name: 'مطعمنا', gosi: [1], labor: { 5: 1, levyMonthly: 700 } } });
  assert.equal(b.settings.name, 'مطعمنا');
  assert.ok(!('0' in b.settings) && !('1' in b.settings));
  assert.deepEqual(b.settings.gosi, RB.defaultSettings().gosi);
  assert.equal(b.settings.labor.levyMonthly, 700);
  assert.ok(!('5' in b.settings.labor));
  // قنوات البيع: تُسقط الفارغة وما بلا معرّف، وإن لم يبقَ شيء فالافتراضية
  const c = RB.normalize({ settings: { channels: [null, { id: 'cash', name: 'كاش', type: 'cash' }, { name: 'بلا معرّف' }] } });
  assert.deepEqual(c.settings.channels.map((x) => x.id), ['cash']);
  assert.equal(RB.normalize({ settings: { channels: [null, 5] } }).settings.channels.length, RB.defaultSettings().channels.length);
  // تاريخ غير مفهوم في الإعدادات يُفرَّغ
  assert.equal(RB.normalize({ settings: { openingDate: '15/03/2026', vatRegisteredFrom: '2026-01-01' } }).settings.openingDate, '');
  // المعرّف المكرر في القسم يُعطى معرّفاً جديداً، والمعرّف الرقمي يصبح نصاً، وما بلا معرّف يُسقط
  const d = RB.normalize({ partners: [{ id: 'p', name: 'أ' }, { id: 'p', name: 'ب' }, { id: 7, name: 'ج' }, { name: 'بلا معرّف' }, null] });
  assert.equal(d.partners.length, 3);
  assert.equal(new Set(d.partners.map((x) => x.id)).size, 3);
  assert.equal(d.partners[0].id, 'p');
  assert.equal(d.partners[2].id, '7');
  // ما ليس كائناً
  assert.deepEqual(RB.normalize([1, 2]), RB.emptyState());
});

test('السجل المعيب لا يكسر الدفتر ولا التقارير، ويُستبعد من الحسابات', () => {
  const t = '2026-10-14';
  const clean = RB.normalize(RB.demoState(t));
  const L0 = RB.buildLedger(clean, '2026-10-31');
  const cases = {
    'مصروف بلا تاريخ': (S) => S.expenses.push({ id: 'bad1', category: 'rent', amount: 100, months: 6 }),
    'مصروف 15/03/2026': (S) => S.expenses.push({ id: 'bad2', date: '15/03/2026', category: 'utilities', amount: 100, months: 1 }),
    'بداية تغطية غير صالحة': (S) => S.expenses.push({ id: 'bad2b', date: '2026-09-01', startDate: '2026-13-45', category: 'rent', amount: 100, months: 6 }),
    'أصل بلا تاريخ': (S) => S.assets.push({ id: 'bad3', name: 'x', category: 'kitchen', amount: 1000, lifeMonths: 60 }),
    'أسطر فاتورة كائن': (S) => S.purchases.push({ id: 'bad4', date: '2026-10-01', supplier: 'م', lines: { a: 1 } }),
    'قناة فارغة في إقفال': (S) => S.sales.push({ id: 'bad5', date: '2026-10-02', channels: { cash: null } }),
    'مكونات منتج مجمّع كائن': (S) => S.composites.push({ id: 'bad6', name: 'x', items: { a: 1 } }),
    'مسير بلا تاريخ': (S) => S.payroll.push({ id: 'bad7', month: '2026-09', lines: [{ employeeId: 'e1', basic: 1000 }] }),
    'قناة فارغة في الإعدادات': (S) => S.settings.channels.push(null),
  };
  for (const [name, mut] of Object.entries(cases)) {
    const raw = JSON.parse(JSON.stringify(RB.demoState(t)));
    mut(raw);
    const S = RB.normalize(raw);
    let L;
    assert.doesNotThrow(() => (L = RB.buildLedger(S, '2026-10-31')), name);
    assert.deepEqual(L.errors, [], name);
    // السجل المعيب خارج القيود: الأرصدة كما بدونه (الأسطر الفارغة لا تضيف شيئاً)
    assert.deepEqual(RB.balances(L.entries), RB.balances(L0.entries), name);
    for (const f of [
      () => RB.costing(S),
      () => RB.incomeStatement(S, '2026-01-01', '2026-10-31', L),
      () => RB.balanceSheet(S, '2026-10-31', L),
      () => RB.salesByChannel(S, '2026-01-01', '2026-10-31'),
      () => RB.appReceivables(S, '2026-10-31'),
      () => RB.supplierBalances(S, '2026-10-31'),
      () => RB.renewals(S, t),
      () => RB.capitalUses(S),
      () => RB.breakEven(S, '2026-07-01', '2026-09-30', L, t),
      () => RB.vatReturns(S, t),
      () => RB.eosbUnsettled(S, t),
      () => RB.menuAnalysis(S, '2026-01-01', '2026-10-31', L),
      () => S.products.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    ])
      assert.doesNotThrow(f, name);
  }
  // العلامة على السجل تحدد أنه يحتاج تصحيحاً
  const raw = JSON.parse(JSON.stringify(RB.demoState(t)));
  raw.expenses.push({ id: 'bad1', category: 'rent', amount: 100, months: 6 });
  assert.deepEqual(RB.normalize(raw).expenses.find((x) => x.id === 'bad1')._bad, ['date']);
});

test('سجل يفشل حسابه لا يوقف الدفتر: تُحذف قيوده الجزئية ويُذكر في الأخطاء', () => {
  const S = base();
  S.capital = [{ id: 'c1', date: '2026-01-01', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 1000 }];
  const boom = { id: 'x', date: '2026-01-05', category: 'rent', amount: 100, months: 1 };
  Object.defineProperty(boom, 'account', { enumerable: true, get: () => { throw new Error('تالف'); } });
  S.expenses = [boom, { id: 'y', date: '2026-01-06', category: 'utilities', amount: 50, months: 1, taxable: false, account: 'cash' }];
  const L = RB.buildLedger(S, '2026-01-31');
  assert.deepEqual(L.errors.map((e) => [e.section, e.id]), [['expenses', 'x']]);
  assert.ok(!L.entries.some((e) => e.ref && e.ref.id === 'x'));
  assert.ok(L.entries.some((e) => e.ref && e.ref.id === 'y'));
  const bal = RB.balances(L.entries);
  assert.equal(bal['1102'], 1000);
  assert.equal(bal['1101'], -50);
  // التكلفة: سجل يفشل حسابه يُذكر ولا يوقف الباقي
  S.raw = [{ id: 'r', name: 'لحم', price: 10, packQty: 1 }];
  const evil = { id: 'pz', name: 'صنف' };
  Object.defineProperty(evil, 'items', { enumerable: true, get: () => { throw new Error('تالف'); } });
  S.products = [evil, { id: 'ok', name: 'برقر', items: [{ kind: 'raw', id: 'r', qty: 2 }] }];
  const C = RB.costing(S);
  assert.deepEqual(C.errors.map((e) => [e.section, e.id]), [['products', 'pz']]);
  assert.equal(C.prod.ok, 20);
});

test('معرّفات الملف المستورد: يُرفض ما يكسر الصفحة أو مسار البيانات المشتركة', () => {
  const st = RB.normalize(RB.demoState('2026-10-14'));
  assert.deepEqual(RB.badIds(st), []); // كل معرّفات البرنامج والتجريبي صالحة
  assert.ok(RB.validId(RB.uid()) && RB.validId('ch' + Date.now().toString(36)) && RB.validId(RB.uid() + 'b') && RB.validId(42));
  for (const id of ['"><img src=x onerror=__hit(1)>', 'a b', 'x/1', 'cap:1', 'a.b', 'لحم', '__proto__', 'constructor', '', 'x'.repeat(65)]) assert.ok(!RB.validId(id), id);
  const evil = { settings: { channels: [{ id: 'cash' }, { id: 'a"b' }] }, partners: [{ id: 'ok' }, { id: '<b>' }], sales: [{ id: 'x.y' }, null, { date: '2026-01-01' }] };
  assert.deepEqual(RB.badIds(evil).sort(), ['<b>', 'a"b', 'x.y'].sort());
  // مفتاح قناة يلوّث النموذج الأولي لا يدخل الإقفال
  const s = RB.sanitizeRecord('sales', JSON.parse('{"id":"s","date":"2026-01-01","channels":{"__proto__":{"amount":5},"cash":{"amount":1}}}'));
  assert.deepEqual(Object.keys(s.channels), ['cash']);
  assert.equal({}.amount, undefined);
});

// قاعدة بيانات مشتركة في الذاكرة لتجربة خطة الاستبدال: تنفيذ الخطة مع فشل بعد عدد من العمليات
function runPlan(db, plan, failAfter) {
  let n = 0;
  for (const [k, r] of plan.sets) {
    if (failAfter !== undefined && n++ >= failAfter) return false;
    db.set(k + '/' + r.id, Object.assign({}, r));
  }
  for (const [k, id] of plan.dels) {
    if (failAfter !== undefined && n++ >= failAfter) return false;
    db.delete(k + '/' + id);
  }
  return true;
}
const idsOf = (db) => {
  const out = {};
  for (const p of db.keys()) {
    const [k, id] = p.split('/');
    (out[k] = out[k] || []).push(id);
  }
  return out;
};

test('استيراد مشترك لم يكتمل ثم أُكمل: لا يبقى سجل قديم، وما أضافه الشريك بعد الفشل يبقى (مراجعة WP3)', () => {
  const old = RB.normalize(RB.demoState('2026-07-14'));
  RB.SECTIONS.forEach((k) => old[k].forEach((r) => (r.id = 'old' + r.id)));
  const target = RB.normalize(RB.demoState('2026-10-14'));
  const db = new Map();
  RB.SECTIONS.forEach((k) => old[k].forEach((r) => db.set(k + '/' + r.id, r)));
  const nOld = db.size;
  // المحاولة الأولى: كل الكتابات قبل أي حذف، وتتوقف في المنتصف
  const p1 = RB.replacePlan(target, idsOf(db));
  assert.equal(p1.dels.length, nOld);
  assert.equal(p1.sets.length, RB.SECTIONS.reduce((n, k) => n + target[k].length, 0));
  assert.equal(runPlan(db, p1, 300), false);
  assert.equal(db.size, nOld + 300); // خليط القديم وما كُتب
  // بعد الفشل: الشريك يضيف مصروفاً، والمستخدم يضيف سجلاً إلى الدفتر المطلوب (في الشاشة)
  db.set('expenses/partnerX', { id: 'partnerX' });
  target.expenses.push({ id: 'mine1', date: '2026-10-12', category: 'utilities', amount: 5, months: 1, account: 'cash' });
  db.set('expenses/mine1', target.expenses[target.expenses.length - 1]);
  // الإكمال: يكتب الدفتر المطلوب نفسه، ويحذف القديم فقط
  const p2 = RB.replacePlan(target, idsOf(db), p1.known);
  assert.ok(!p2.dels.some(([k, id]) => id === 'partnerX'));
  assert.equal(runPlan(db, p2, 120), false); // يفشل مرة أخرى في المنتصف
  const p3 = RB.replacePlan(target, idsOf(db), p2.known);
  assert.equal(runPlan(db, p3), true);
  const left = [...db.keys()];
  assert.deepEqual(left.filter((p) => p.split('/')[1].startsWith('old')), []);
  assert.ok(db.has('expenses/partnerX'));
  for (const k of RB.SECTIONS) for (const r of target[k]) assert.ok(db.has(k + '/' + r.id), k + '/' + r.id);
  assert.equal(db.size, p1.sets.length + 2);
  // بلا prev (استيراد جديد): كل ما ليس في الهدف يُحذف، ومنه سجل الشريك
  const p4 = RB.replacePlan(RB.emptyState(), idsOf(db));
  assert.equal(p4.dels.length, db.size);
});

test('علامة الاستيراد المشترك: جارٍ من جهاز آخر، أو سابق لم يكتمل، وعلامة الصفحة نفسها لا تُعرض', () => {
  const now = Date.parse('2026-10-15T10:00:00Z');
  const at = (ms) => new Date(now - ms).toISOString();
  const st = RB.replaceMarkerState;
  assert.equal(st(null, now, 's1'), '');
  assert.equal(st({ status: 'running', at: at(0), by: 's1' }, now, 's1'), '');
  assert.equal(st({ status: 'running', at: at(30000), by: 's2' }, now, 's1'), 'running');
  assert.equal(st({ status: 'running', at: at(0) }, now, 's1'), 'running'); // علامة قديمة الشكل بلا by
  assert.equal(st({ status: 'running', at: at(-120000), by: 's2' }, now, 's1'), 'running'); // ساعة الجهاز الآخر متقدمة
  assert.equal(st({ status: 'running', at: at(RB.REPLACE_LIVE_MS + 1000), by: 's2' }, now, 's1'), 'stale');
  assert.equal(st({ status: 'failed', at: at(1000), by: 's2' }, now, 's1'), 'stale');
  assert.equal(st({ status: 'running', at: 'أمس' }, now, 's1'), 'stale');
});

test('حدود الحقول الرقمية: الفراغ للمطلوب، والحد الأدنى والأعلى، والسالب حيث له معنى (WP4)', () => {
  assert.equal(RB.rangeMsg('', 0), '');
  assert.equal(RB.rangeMsg(undefined, 0), '');
  assert.equal(RB.rangeMsg(null, 0, 95), '');
  assert.equal(RB.rangeMsg(-5000, 0), 'القيمة لا تقل عن 0');
  assert.equal(RB.rangeMsg('-5000', 0), 'القيمة لا تقل عن 0');
  assert.equal(RB.rangeMsg(0, 0), '');
  assert.equal(RB.rangeMsg(100, 0, 95), 'القيمة لا تزيد عن 95');
  assert.equal(RB.rangeMsg(95, 0, 95), '');
  assert.equal(RB.rangeMsg(0.5, 1, 100), 'القيمة لا تقل عن 1');
  assert.equal(RB.rangeMsg('abc', 0), 'أدخل رقماً');
  // بلا حدود (استرداد الضريبة بالسالب، كمية المرتجع بالسالب): مقبول
  assert.equal(RB.rangeMsg(-500), '');
  assert.equal(RB.rangeMsg(-2, undefined, undefined), '');
});

test('تحديث أسعار المواد الخام من الفاتورة: السعر بلا ضريبة، والمرتجع والسعر السالب لا يغيّران شيئاً (WP4)', () => {
  const set = RB.defaultSettings();
  const raws = [{ id: 'beef', name: 'لحم', price: 340 }, { id: 'bun', name: 'خبز', price: 12.5 }];
  const inv = (lines, o) => Object.assign({ includesVat: false, taxable: true, lines }, o || {});
  // السعر المعبأ تلقائياً يتبع «شامل الضريبة» ثم يرجع منه إلى نفس السعر
  assert.equal(RB.autoLinePrice(raws[0], true, true, set), 391);
  assert.equal(RB.autoLinePrice(raws[0], true, false, set), 340);
  assert.equal(RB.autoLinePrice(raws[0], false, true, set), 340);
  assert.deepEqual(RB.rawPriceUpdates(inv([{ rawId: 'beef', qty: 2, price: 391 }], { includesVat: true }), raws, set), []);
  assert.deepEqual(RB.rawPriceUpdates(inv([{ rawId: 'beef', qty: 2, price: 340 }]), raws, set), []);
  // ذهاب وإياب بالضريبة لا يغيّر أي سعر بخانتين عشريتين
  for (const p of [0.05, 1.99, 12.5, 17.35, 340, 1234.56]) {
    const r = { id: 'x', name: 'x', price: p };
    assert.deepEqual(RB.rawPriceUpdates(inv([{ rawId: 'x', qty: 1, price: RB.autoLinePrice(r, true, true, set) }], { includesVat: true }), [r], set), [], String(p));
  }
  // سعر جديد بالضريبة يُحفظ بلا ضريبة
  assert.deepEqual(RB.rawPriceUpdates(inv([{ rawId: 'beef', qty: 1, price: 414 }], { includesVat: true }), raws, set), [{ id: 'beef', name: 'لحم', old: 340, price: 360 }]);
  // غير خاضعة: السعر كما هو حتى لو «شامل الضريبة»
  assert.deepEqual(RB.rawPriceUpdates(inv([{ rawId: 'beef', qty: 1, price: 360 }], { includesVat: true, taxable: false }), raws, set), [{ id: 'beef', name: 'لحم', old: 340, price: 360 }]);
  // مرتجع (كمية سالبة) أو سعر سالب أو صفر، أو مادة غير موجودة: لا تحديث
  assert.deepEqual(RB.rawPriceUpdates(inv([{ rawId: 'beef', qty: -2, price: 300 }]), raws, set), []);
  assert.deepEqual(RB.rawPriceUpdates(inv([{ rawId: 'beef', qty: 2, price: -340 }]), raws, set), []);
  assert.deepEqual(RB.rawPriceUpdates(inv([{ rawId: 'beef', qty: 2, price: 0 }, { rawId: 'gone', qty: 1, price: 5 }, { desc: 'حر', qty: 1, price: 5 }]), raws, set), []);
  // سطران لنفس المادة: آخر سطر شراء هو السعر الجديد، وتغيير واحد يُذكر
  const two = RB.rawPriceUpdates(inv([{ rawId: 'beef', qty: 1, price: 350 }, { rawId: 'beef', qty: -1, price: 999 }, { rawId: 'beef', qty: 3, price: 355 }, { rawId: 'bun', qty: 10, price: 13 }]), raws, set);
  assert.deepEqual(two, [{ id: 'beef', name: 'لحم', old: 340, price: 355 }, { id: 'bun', name: 'خبز', old: 12.5, price: 13 }]);
  // سطر بآخر سعر نفسه بين سطرين: لا يعني تغييراً إن كان الأخير مثل الحالي
  assert.deepEqual(RB.rawPriceUpdates(inv([{ rawId: 'beef', qty: 1, price: 350 }, { rawId: 'beef', qty: 1, price: 340 }]), raws, set), []);
});

test('المسير يتبع تاريخ ترك العمل: من ترك في 20 سبتمبر له مسير سبتمبر بعشرين يوماً وليس له أكتوبر (WP4)', () => {
  const S = base();
  const left = { id: 'x', name: 'سالم', nationality: 'saudi', gosiSystem: 'old', basic: 5000, housing: 1000, transport: 300, otherAllow: 0, startDate: '2026-01-01', endDate: '2026-09-20', active: false };
  // تاريخ ترك العمل هو الحَكَم وإن أُلغي «على رأس العمل»
  assert.equal(RB.isEmployeeActive(left, '2026-08'), true);
  assert.equal(RB.isEmployeeActive(left, '2026-09'), true);
  assert.equal(RB.isEmployeeActive(left, '2026-10'), false);
  assert.equal(RB.isEmployeeActive(Object.assign({}, left, { active: true }), '2026-09'), true);
  // بلا تاريخ ترك العمل: «على رأس العمل»؛ ومن لم يباشر بعد لا مسير له
  assert.equal(RB.isEmployeeActive({ startDate: '2026-01-01', active: false }, '2026-09'), false);
  assert.equal(RB.isEmployeeActive({ startDate: '2026-10-05' }, '2026-09'), false);
  assert.equal(RB.isEmployeeActive({ startDate: '2026-10-05' }, '2026-10'), true);
  // سطر سبتمبر: خصم 10 أيام من 30 من الأجر، والأساسي والسكن كما هما فلا يتغير أجر التأمينات
  const full = RB.payrollLine(left, S, '2026-08');
  const sep = RB.payrollLine(left, S, '2026-09');
  const wage = 5000 + 1000 + 300;
  assert.equal(full.deductions, 0);
  assert.equal(full.note, undefined);
  close(sep.deductions, RB.r2((wage * 10) / 30));
  assert.equal(sep.note, 'أيام عمل 20');
  assert.deepEqual([sep.basic, sep.housing, sep.allowances, sep.gosiEe, sep.gosiEr], [full.basic, full.housing, full.allowances, full.gosiEe, full.gosiEr]);
  close(RB.payrollLineGross(sep), RB.r2((wage * 20) / 30));
  // المباشرة أثناء الشهر: من 11 يونيو = 20 يوماً؛ من أول فبراير شهر كامل (28 يوماً) بلا خصم؛ من 15 فبراير 14 يوماً
  const join = (d) => ({ id: 'j', name: 'ج', nationality: 'expat', basic: 3000, startDate: d });
  close(RB.payrollLine(join('2026-06-11'), S, '2026-06').deductions, 1000);
  assert.equal(RB.payrollLine(join('2026-02-01'), S, '2026-02').deductions, 0);
  assert.equal(RB.payrollLine(join('2026-02-15'), S, '2026-02').note, 'أيام عمل 14');
  close(RB.payrollLine(join('2026-02-15'), S, '2026-02').deductions, 1600);
  // من 2 يوليو (31 يوماً): 30 يوم عمل = شهر كامل
  assert.equal(RB.payrollLine(join('2026-07-02'), S, '2026-07').deductions, 0);
  assert.equal(RB.payrollDaysWorked(join('2026-07-02'), '2026-07'), 30);
  assert.equal(RB.payrollDaysWorked(join('2026-01-01'), '2026-07'), null);
  // بلا شهر: لا تقدير لأيام العمل
  assert.equal(RB.payrollLine(join('2026-06-11'), S).deductions, 0);
});

test('سطر المسير لشهر ليس للموظف فيه راتب بلا خصم أيام، فسطر تسوية المكافأة لا يكون سالباً (مراجعة WP4)', () => {
  const S = base();
  const left = { id: 'x', name: 'سالم', nationality: 'expat', basic: 2000, housing: 500, transport: 200, otherAllow: 0, startDate: '2025-01-01', endDate: '2026-09-20', active: false };
  // بعد شهر ترك العمل: لا خصم ولا ملاحظة «أيام عمل 0» (كان الخصم الأجر كله)
  const oct = RB.payrollLine(left, S, '2026-10');
  assert.equal(RB.payrollDaysWorked(left, '2026-10'), 0);
  assert.equal(oct.deductions, 0);
  assert.equal(oct.note, undefined);
  // قبل المباشرة كذلك
  const fut = RB.payrollLine({ id: 'f', name: 'ف', nationality: 'expat', basic: 3000, startDate: '2026-11-05' }, S, '2026-10');
  assert.equal(fut.deductions, 0);
  assert.equal(fut.note, undefined);
  // مسير التسوية (كما يبنيه النموذج): الراتب صفر والمكافأة وحدها، فلا رواتب سالبة ولا مال داخل للبنك
  const settle = (ym) => Object.assign(RB.payrollLine(left, S, ym), { basic: 0, housing: 0, allowances: 0, additions: 0, deductions: 0, gosiEe: 0, gosiEr: 0, eosbPaid: 450 });
  for (const ym of ['2026-09', '2026-10']) {
    const t = RB.payrollTotals({ lines: [settle(ym)] });
    assert.deepEqual([t.gross, t.cost, t.eosbPaid], [0, 0, 450]);
  }
  S.employees = [left];
  S.payroll = [{ id: 'set', month: '2026-10', date: '2026-10-15', account: 'bank', gosiAccount: 'bank', lines: [settle('2026-10')] }];
  const b = RB.balances(RB.buildLedger(S, '2026-12-31').entries.filter((e) => e.kind === 'payroll' || e.kind === 'eosb'));
  assert.equal(b['5201'] || 0, 0);
  assert.equal(b['1102'], -450, 'يخرج من البنك مبلغ المكافأة وحده');
  // خصم الأيام لا يزيد على الأجر في أي شهر: السطر المبني من بيانات الموظف لا يكون سالباً
  for (const ym of ['2024-12', '2025-01', '2026-08', '2026-09', '2026-10', '2027-01']) assert.ok(RB.payrollLineGross(RB.payrollLine(left, S, ym)) >= 0, ym);
});

test('مسير الشهر الأول في التجربة: خصم الأيام قبل المباشرة من RB.payrollLine نفسه (WP4)', () => {
  const D = RB.demoState('2026-10-15');
  const first = D.payroll.slice().sort((a, b) => (a.month < b.month ? -1 : 1))[0];
  assert.ok(first.lines.length > 0);
  for (const l of first.lines) {
    const e = D.employees.find((x) => x.id === l.employeeId);
    const w = RB.payrollDaysWorked(e, first.month);
    assert.ok(w > 0 && w < 30);
    close(l.deductions, RB.r2(((l.basic + l.housing + l.allowances) * (30 - w)) / 30));
    assert.equal(l.note, 'أيام عمل ' + w);
  }
  // الأشهر الكاملة بلا خصم
  for (const p of D.payroll.filter((x) => x !== first)) for (const l of p.lines) assert.equal(l.deductions, 0);
});

test('أسطر الوصفة: تغيير النوع بلا مكوّن صالح يُرفض برقم السطر، والفارغ يُحذف (WP4)', () => {
  const D = RB.normalize(RB.demoState('2026-10-15'));
  // السطر الأول تحوّل من منتج مجمّع (c_sauce) إلى مادة خام: المعرّف القديم ليس مادة خام
  const items = [{ kind: 'raw', id: 'c_sauce', qty: 100 }, { kind: 'raw', id: 'm_beef', qty: 50 }];
  assert.equal(RB.recipeItems(D, items).bad, 1);
  // بعد تفريغ المكوّن (تغيير النوع يفرّغه) والكمية باقية: مرفوض أيضاً، فلا يُحفظ «(محذوف)»
  assert.equal(RB.recipeItems(D, [{ kind: 'raw', id: 'm_beef', qty: 50 }, { kind: 'raw', id: '', qty: 100 }]).bad, 2);
  // مكوّن محذوف بكمية، أو نوع غير معروف
  assert.equal(RB.recipeItems(D, [{ kind: 'comp', id: 'gone', qty: 1 }]).bad, 1);
  assert.equal(RB.recipeItems(D, [{ kind: 'x', id: 'm_beef', qty: 1 }]).bad, 1);
  // الأسطر الفارغة (أو بلا كمية) تُحذف، والصالحة تبقى بترتيبها
  const ok = RB.recipeItems(D, [{ kind: 'raw', id: '', qty: '' }, { kind: 'comp', id: 'c_sauce', qty: 30 }, { kind: 'raw', id: 'm_beef', qty: '' }, null, { kind: 'raw', id: 'm_bun', qty: 1 }]);
  assert.equal(ok.bad, 0);
  assert.deepEqual(ok.items.map((i) => i.id), ['c_sauce', 'm_bun']);
  // وصفات التجربة كلها صالحة
  for (const r of [...D.composites, ...D.products]) assert.equal(RB.recipeItems(D, r.items).bad, 0, r.name);
});

test('الجرد: أداة «إضافة المواد الناقصة» لا تغيّر القيمة، والمادة المكررة تُجمع في سطر واحد (WP4)', () => {
  const D = RB.normalize(RB.demoState('2026-10-15'));
  const c = D.stockCounts.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const before = RB.stockValue(c, D);
  assert.ok(before > 0);
  // مادة جديدة بعد الجرد: سطر صفري لها لا يغيّر قيمة الجرد
  D.raw.push({ id: 'newmat', name: 'مادة جديدة', price: 50, packQty: 10, useUnit: 'حبة', buyUnit: 'كرتون', taxable: true });
  const lines = c.lines.concat([{ rawId: 'newmat', qty: 0, price: 50 }]);
  const mg = RB.mergeStockLines(lines);
  assert.equal(mg.lines.length, c.lines.length + 1);
  assert.deepEqual(mg.merged, []);
  close(RB.stockValue(Object.assign({}, c, { lines: mg.lines }), D), before, 0.001);
  // سطران لنفس المادة: الكميتان تُجمعان ويبقى سعر الأول، والسطر بلا مادة يُحذف
  const dup = RB.mergeStockLines([{ rawId: 'a', qty: 1.1, price: 10 }, { rawId: '', qty: 5, price: 1 }, { rawId: 'b', qty: 2, price: 3 }, { rawId: 'a', qty: 2.2, price: 99 }]);
  assert.deepEqual(dup.lines, [{ rawId: 'a', qty: 3.3, price: 10 }, { rawId: 'b', qty: 2, price: 3 }]);
  assert.deepEqual(dup.merged, ['a']);
  // لا يغيّر الأسطر الأصلية
  const src = [{ rawId: 'a', qty: 1, price: 1 }, { rawId: 'a', qty: 1, price: 1 }];
  RB.mergeStockLines(src);
  assert.equal(src[0].qty, 1);
});

test('حذف الشريك: أي قيد على حسابه يمنعه، والحساب اليتيم يُسمّى «شريك محذوف» (WP4)', () => {
  const S = base();
  S.partners.push({ id: 'p3', name: 'ج', share: 0 });
  S.capital = [{ id: 'c1', date: '2026-01-01', partnerId: 'p1', type: 'deposit', amount: 1000, account: 'bank' }];
  // سدد الشريك ب مورداً 300 من حسابه: لا حركة رأس مال ولا أصل أو مصروف أو فاتورة باسمه
  S.supplierPayments = [{ id: 'sp1', date: '2026-02-01', supplier: 'مورد', account: 'partner:p2', amount: 300 }];
  assert.equal(RB.partnerUsed(S, 'p1'), true);
  assert.equal(RB.partnerUsed(S, 'p2'), true);
  assert.equal(RB.partnerUsed(S, 'p3'), false);
  // بتاريخ مستقبلي كذلك
  S.supplierPayments[0].date = '2099-01-01';
  assert.equal(RB.partnerUsed(S, 'p2'), true);
  // أسماء الحسابات
  assert.equal(RB.accInfo('cap:p1', S).name, 'رأس مال أ');
  assert.equal(RB.accInfo('cap:gone', S).name, 'رأس مال شريك محذوف');
  assert.equal(RB.accInfo('drw:gone', S).name, 'مسحوبات شريك محذوف');
  assert.equal(RB.accInfo('drw:gone', S).group, 'drw');
});

test('مرتجع المشتريات: إجمالي سالب ولا يغيّر سعر المادة الخام (WP4)', () => {
  const S = base();
  S.raw = [{ id: 'beef', name: 'لحم', price: 400, packQty: 10000, useUnit: 'جم', taxable: true }];
  const ret = { id: 'r1', date: '2026-03-01', supplier: 'مورد', account: 'payable', taxable: true, includesVat: false, lines: [{ rawId: 'beef', desc: 'لحم', qty: -2, price: 380 }] };
  assert.equal(RB.purchaseTotal(ret), -760);
  assert.deepEqual(RB.rawPriceUpdates(ret, S.raw, S.settings), []);
  assert.ok(RB.vatSplit(RB.purchaseTotal(ret), false, true, S.settings).gross < 0);
});

test('تغيير شهر المسير: التعبئة من أسطر ما قبل التغيير فلا يمحو شهر وسيط بلا موظفين ما أُدخل (مراجعة WP4)', () => {
  const S = base();
  const emp = (id, name, basic) => ({ id, name, nationality: 'expat', basic, housing: 0, transport: 0, otherAllow: 0, startDate: '2026-06-01', active: true });
  S.employees = [emp('a', 'سليم', 3000), emp('b', 'رفيق', 2500)];
  const oct = RB.payrollFill(S, '2026-10');
  assert.deepEqual(oct.map((l) => l.employeeId), ['a', 'b']);
  oct[0].additions = 500;
  oct[1].deductions = 200;
  oct.push({ employeeId: '', name: 'عامل يومي', basic: 900, housing: 0, allowances: 0, additions: 0, deductions: 0, gosiEe: 0, gosiEr: 0, eosbPaid: 0 });
  const snap = JSON.parse(JSON.stringify(oct));
  // كتابة «11» في حقل الشهر تمر بيناير (لم يباشر فيه أحد): تعبئة نوفمبر من أسطر يناير تفقد الإضافي والخصم
  const jan = RB.payrollFill(S, '2026-01', JSON.parse(JSON.stringify(oct)), '2026-10');
  assert.deepEqual(jan.map((l) => l.name), ['عامل يومي']);
  const chained = RB.payrollFill(S, '2026-11', jan, '2026-01');
  assert.equal(chained.find((l) => l.employeeId === 'a').additions, 0);
  assert.equal(chained.find((l) => l.employeeId === 'b').deductions, 0);
  // من أسطر ما قبل تغيير الشهر (ما يحتفظ به النموذج حتى مغادرة الحقل): يبقى كل شيء
  const nov = RB.payrollFill(S, '2026-11', JSON.parse(JSON.stringify(snap)), '2026-10');
  assert.equal(nov.find((l) => l.employeeId === 'a').additions, 500);
  assert.equal(nov.find((l) => l.employeeId === 'b').deductions, 200);
  assert.ok(nov.some((l) => !l.employeeId && l.name === 'عامل يومي'));
  // والعودة إلى الشهر الأصلي تعيد الأسطر نفسها، والأسطر الأصلية لا تتغير بالتعبئة
  const back = RB.payrollFill(S, '2026-10', JSON.parse(JSON.stringify(snap)), '2026-10');
  const key = (ls) => ls.map((l) => [l.employeeId, l.name, l.additions, l.deductions, l.gosiEe, l.gosiEr]);
  assert.deepEqual(key(back), key(snap));
  RB.payrollFill(S, '2026-01', snap, '2026-10');
  assert.equal(snap.length, 3);
  assert.equal(snap[0].additions, 500);
});

test('ذاكرة المورد: الاسم كاملاً لا بدايته، وتعود الإعدادات حين لا يعود الاسم اسمه (مراجعة WP4)', () => {
  const P = [
    { id: '1', date: '2026-09-01', supplier: 'مخبز الريان', category: 'food', account: 'bank', taxable: true, includesVat: false },
    { id: '2', date: '2026-10-01', supplier: ' مخبز الريان ', category: 'food', account: 'cash', taxable: false, includesVat: false },
    { id: '3', date: '2026-10-02', supplier: 'مؤسسة اللحوم', category: 'food', account: 'payable', taxable: true, includesVat: true },
  ];
  // آخر فاتورة من المورد نفسه، والاسم الذي يبدأ باسمه أو جزء منه ليس هو
  assert.deepEqual(RB.supplierMemory(P, 'مخبز الريان'), { category: 'food', account: 'cash', taxable: false, includesVat: false });
  assert.equal(RB.supplierMemory(P, 'مخبز الريان الجديد'), null);
  assert.equal(RB.supplierMemory(P, 'مخبز'), null);
  assert.equal(RB.supplierMemory(P, '  '), null);
  const v = { supplier: '', category: 'food', account: 'bank', taxable: true, includesVat: false };
  let memo = null;
  const touched = {};
  const type = (s) => {
    v.supplier = s;
    const r = RB.supplierMemoryStep(v, P, memo, touched);
    memo = r.memo;
    return r;
  };
  // كتابة مورد جديد يمر اسمه باسم مورد موجود: تُطبَّق إعداداته عند تطابق الاسم ثم تعود
  assert.equal(type('مخبز').changed, false);
  let r = type('مخبز الريان');
  assert.deepEqual(r.applied, ['account', 'taxable']);
  assert.deepEqual([v.account, v.taxable], ['cash', false]);
  r = type('مخبز الريان ');
  assert.deepEqual([r.changed, r.dropped, v.account], [false, false, 'cash']);
  r = type('مخبز الريان الجديد');
  assert.deepEqual([r.dropped, r.changed, r.applied], [true, true, []]);
  assert.deepEqual([v.account, v.taxable, memo], ['bank', true, null]);
  // ما غيّره المستخدم بعد تطبيق الذاكرة يبقى، والباقي يعود
  type('مخبز الريان');
  touched.account = true;
  v.account = 'payable';
  type('مخبز الريان 2');
  assert.deepEqual([v.account, v.taxable], ['payable', true]);
  // من مورد معروف إلى آخر: تعود إعدادات الأول ثم تُطبَّق إعدادات الثاني
  delete touched.account;
  v.account = 'bank';
  type('مخبز الريان');
  r = type('مؤسسة اللحوم');
  assert.deepEqual([r.dropped, r.applied], [true, ['account', 'includesVat']]);
  assert.deepEqual([v.account, v.taxable, v.includesVat], ['payable', true, true]);
  // مسح الاسم يعيد ما كان قبل الذاكرة
  type('');
  assert.deepEqual([v.account, v.taxable, v.includesVat], ['bank', true, false]);
  // قيمة لا تصلح (حساب شريك محذوف مثلاً) لا تُطبَّق
  const w = { supplier: 'مورد', category: 'food', account: 'bank', taxable: true, includesVat: false };
  const old = [{ id: 'x', date: '2026-01-01', supplier: 'مورد', category: 'food', account: 'partner:gone', taxable: true, includesVat: true }];
  r = RB.supplierMemoryStep(w, old, null, {}, (k, x) => k !== 'account' || x !== 'partner:gone');
  assert.deepEqual([r.applied, w.account, w.includesVat], [['includesVat'], 'bank', true]);
});

test('نسبة الشريك: لا تكون سالبة ولا أكثر من 100، والصفر لشريك خرج وبقيت حركاته (مراجعة WP4)', () => {
  assert.equal(RB.rangeMsg(-10, 0, 100), 'القيمة لا تقل عن 0');
  assert.match(RB.rangeMsg(150, 0, 100), /100/);
  assert.equal(RB.rangeMsg(0, 0, 100), '');
  // شريك بنسبة صفر لا نصيب له من الربح، والنسبة السالبة كانت تزيد نصيب الآخرين على الربح كله
  const S = base();
  S.partners.push({ id: 'p3', name: 'ج', share: 0 });
  const rep = RB.partnersReport(S, '2026-01-01', '2026-12-31');
  assert.deepEqual(rep.rows.map((x) => RB.r2(x.share)), [0.6, 0.4, 0]);
});

test('دفتر واحد لكل نسخة من البيانات: كل تقرير يقطع الدفتر الكامل بتواريخه فتتطابق أرقامه مع الدفتر المقطوع (WP5)', () => {
  const TODAY = '2026-10-14';
  const S = RB.normalize(RB.demoState(TODAY));
  const pid = S.partners[0].id;
  // دفعها الشريك من حسابه بعد نهاية الفترة: لا تدخل في «منها دفعها مباشرة» ولا في مساهمته حتى تاريخها
  S.expenses.push({ id: 'fx', date: '2026-12-15', category: 'maintenance', amount: 1000, includesVat: true, taxable: true, account: 'partner:' + pid, desc: 'دفعة لاحقة' });
  const full = RB.buildLedger(S, '9999-12-31');
  const to = '2026-10-14';
  const cut = RB.partnersReport(S, '2026-10-01', to, RB.buildLedger(S, to));
  assert.deepEqual(RB.partnersReport(S, '2026-10-01', to, full), cut);
  const later = RB.partnersReport(S, '2026-10-01', '2026-12-31', full);
  close(later.rows[0].direct - cut.rows[0].direct, 1000);
  // باقي التقارير تقطع الدفتر بتواريخها أصلاً
  const ranges = [['2026-10-01', '2026-10-31'], ['2026-01-01', '2026-12-31'], ['2026-09-01', '2026-09-30'], ['2026-07-01', '2026-09-30']];
  for (const [from, end] of ranges) {
    const asOf = end < TODAY ? end : TODAY;
    const Lto = RB.buildLedger(S, end);
    const La = RB.buildLedger(S, asOf);
    assert.deepEqual(RB.incomeStatement(S, from, asOf, full), RB.incomeStatement(S, from, asOf, La), from + ' income');
    assert.deepEqual(RB.balanceSheet(S, asOf, full), RB.balanceSheet(S, asOf, La), from + ' balance');
    assert.deepEqual(RB.trialBalance(S, from, end, full), RB.trialBalance(S, from, end, Lto), from + ' trial');
    assert.deepEqual(RB.vatReport(S, from, end, full), RB.vatReport(S, from, end, Lto), from + ' vat');
    for (const acc of ['1101', '1102']) assert.deepEqual(RB.accountStatement(S, acc, from, asOf, full), RB.accountStatement(S, acc, from, asOf, La), from + ' ' + acc);
    assert.deepEqual(RB.breakEven(S, from, asOf, full, TODAY), RB.breakEven(S, from, asOf, La, TODAY), from + ' breakEven');
    assert.deepEqual(RB.partnersReport(S, from, asOf, full), RB.partnersReport(S, from, asOf, La), from + ' partners');
    assert.deepEqual(RB.menuAnalysis(S, from, asOf, full), RB.menuAnalysis(S, from, asOf, La), from + ' menu');
    assert.deepEqual(RB.balances(full.entries, null, asOf), RB.balances(La.entries, null, asOf), from + ' balances');
  }
  assert.deepEqual(RB.vatReturns(S, TODAY, full), RB.vatReturns(S, TODAY, RB.buildLedger(S, TODAY)));
  assert.deepEqual(RB.capitalUses(S, full), RB.capitalUses(S));
});

test('خطوات البداية: دفتر جديد بعد المعالج كل خطواته مطلوبة، والمنتجات المجمّعة اختيارية (WP5)', () => {
  // ما يكتبه معالج البداية: الإعدادات والشريكان فقط
  const S = RB.emptyState();
  Object.assign(S.settings, { name: 'مطعم', startedAt: '2026-10-15T00:00:00Z' });
  S.partners = [{ id: 'p1', name: 'أ', share: 50 }, { id: 'p2', name: 'ب', share: 50 }];
  let st = RB.setupSteps(S);
  assert.deepEqual(st.steps.map((x) => x.id), ['partners', 'settings', 'capital', 'assets', 'fixed', 'staff', 'raw', 'composites', 'products', 'sales']);
  // الشريكان من المعالج: الخطوة الأولى مكتملة
  assert.equal(st.done, 1);
  assert.equal(st.pending, true);
  // حفظ الإعدادات يكمل خطوتها، وسحب الشريك ليس إيداعاً، والسجل المعيب لا يُعد
  S.settings.reviewedAt = '2026-10-15T08:00:00Z';
  S.capital.push({ id: 'w', date: '2026-10-01', partnerId: 'p1', type: 'withdrawal', amount: 10, account: 'bank' });
  S.expenses.push({ id: 'r', date: 'x', _bad: ['date'], category: 'rent', amount: 100 });
  st = RB.setupSteps(S);
  assert.deepEqual(st.steps.filter((x) => x.done).map((x) => x.id), ['partners', 'settings']);
  // كل الخطوات المطلوبة مكتملة: لا شيء معلّق ولو لم توجد منتجات مجمّعة
  const D = RB.normalize(RB.demoState('2026-10-14'));
  D.settings.reviewedAt = '2026-10-15T08:00:00Z';
  D.composites = [];
  st = RB.setupSteps(D);
  assert.equal(st.pending, false);
  assert.deepEqual(st.steps.filter((x) => !x.done).map((x) => x.id), ['composites']);
  // رسوم حكومية وحدها تكمل خطوة «الإيجار والسكن والرسوم الحكومية»
  S.expenses.push({ id: 'g', date: '2026-10-02', category: 'gov', amount: 300 });
  assert.ok(RB.setupSteps(S).steps.find((x) => x.id === 'fixed').done);
});

test('خطوات البداية: دفتر بلا شركاء (مُسح في نسخة سابقة أو مستورد بلا شركاء) خطوته الأولى «الشركاء ونسبهم» (مراجعة الواجهة 1)', () => {
  const S = RB.emptyState();
  Object.assign(S.settings, { name: 'مطعم', startedAt: '2026-10-15T00:00:00Z' });
  let st = RB.setupSteps(S);
  assert.equal(st.steps[0].id, 'partners');
  assert.equal(st.steps[0].done, false);
  assert.equal(st.pending, true);
  // الشريك المعيب لا يكمل الخطوة، والسليم يكملها
  S.partners.push({ id: 'x', name: 'أ', share: 'x', _bad: ['share'] });
  assert.equal(RB.setupSteps(S).steps[0].done, false);
  S.partners.push({ id: 'p1', name: 'أ', share: 100 });
  st = RB.setupSteps(S);
  assert.equal(st.steps[0].done, true);
  assert.equal(st.done, 1);
});

test('العدد والمعدود: الواحد والاثنان كلمة، و3–10 جمع، و11–99 مفرد منصوب، وغيرها مفرد بآخر رقمين (مراجعة النصوص 1)', () => {
  const t = (n, o) => RB.countText(n, 'day', o);
  assert.equal(t(1), 'يوم واحد');
  assert.equal(t(2), 'يومان');
  assert.equal(t(2, { gen: true }), 'يومين');
  assert.equal(t(3), '3 أيام');
  assert.equal(t(10), '10 أيام');
  assert.equal(t(11), '11 يوماً');
  assert.equal(t(99), '99 يوماً');
  assert.equal(t(100), '100 يوم');
  assert.equal(t(0), '0 يوم');
  assert.equal(t(103), '103 أيام');
  assert.equal(t(111), '111 يوماً');
  assert.equal(t(-9), '9 أيام');
  assert.equal(t(2.4), 'يومان');
  assert.equal(RB.countText(6, RB.WORDS.month), '6 أشهر');
  assert.equal(RB.countText(2, 'month', { gen: true }), 'شهرين');
  assert.equal(RB.countText(36, 'month'), '36 شهراً');
  assert.equal(RB.countText(1753, 'order', { fmt: (n) => n.toLocaleString('en-US') }), '1,753 طلباً');
  assert.equal(RB.countText(1227, 'entry'), '1227 قيداً');
  assert.equal(RB.countText(14, 'asset'), '14 أصلاً');
  assert.equal(RB.countText(204, 'invoice'), '204 فواتير');
  assert.equal(RB.countText(200, 'invoice'), '200 فاتورة');
  assert.equal(RB.countText(26, 'invoice'), '26 فاتورة');
  assert.equal(RB.countText(1, 'invoice'), 'فاتورة واحدة');
  assert.equal(RB.countText(5, 'invoice'), '5 فواتير');
  for (const k of Object.keys(RB.WORDS)) assert.equal(RB.WORDS[k].length, 6, k);
});

test('الأرقام العربية والفارسية وفاصلتها العشرية تُحوَّل إلى أرقام لاتينية لخانات الأرقام (مراجعة الواجهة 1)', () => {
  assert.equal(RB.latinDigits('١٢٥٠'), '1250');
  assert.equal(RB.latinDigits('۱۲۵۰'), '1250');
  assert.equal(RB.latinDigits('١٢٥٠٫٥'), '1250.5');
  assert.equal(RB.latinDigits('١٬٢٥٠٫٧٥'), '1250.75');
  assert.equal(RB.latinDigits('−٣'), '-3');
  assert.equal(RB.latinDigits('1,250.00'), '1,250.00');
  assert.equal(RB.latinDigits('42'), '42');
  assert.equal(RB.latinDigits(undefined), '');
  assert.equal(parseFloat(RB.latinDigits('٣٤٥٠')), 3450);
});

test('خطوات البداية: دفتر فيه إقفالات بلا reviewedAt (حُفظ قبل هذه النسخة) لا يعرض القائمة (مراجعة WP5)', () => {
  // دفتر مستخدم كامل لم يُحفظ فيه reviewedAt قط: مراجعة الإعدادات مطلوبة «قبل أول إقفال» وقد مضى
  const D = RB.normalize(RB.demoState('2026-10-15'));
  assert.equal(D.settings.reviewedAt, undefined);
  let st = RB.setupSteps(D);
  assert.ok(st.steps.find((x) => x.id === 'settings').done);
  assert.equal(st.pending, false);
  assert.equal(st.done, st.steps.length);
  // الإقفال المعيب لا يُعد، فتبقى الخطوة الأولى معلّقة في دفتر لا إقفال سليم فيه
  const S = RB.emptyState();
  S.sales.push({ id: 's', date: 'x', _bad: ['date'], lines: [] });
  st = RB.setupSteps(S);
  assert.equal(st.steps.find((x) => x.id === 'settings').done, false);
  assert.equal(st.steps.find((x) => x.id === 'sales').done, false);
  // أول إقفال سليم يكمل الخطوتين معاً ولو لم تُحفظ الإعدادات
  S.sales.push({ id: 's2', date: '2026-10-15', lines: [] });
  st = RB.setupSteps(S);
  // بلا شركاء: خطوتهم معلّقة
  assert.deepEqual(st.steps.filter((x) => x.done).map((x) => x.id), ['settings', 'sales']);
  assert.equal(st.pending, true);
});

// ───────────── WP6 ─────────────
const tbBalanced = (S, asOf) => {
  const L = RB.buildLedger(S, asOf);
  for (const e of L.entries) close(RB.sum(e.lines, (l) => l.v), 0, 0.001);
  const tb = RB.trialBalance(S, null, asOf, L);
  close(tb.dr, tb.cr);
  close(RB.balanceSheet(S, asOf, L).check, 0);
  return { L, b: RB.balances(L.entries, null, asOf) };
};

test('جرد الدرج: العجز مصروف في 5316 والزيادة دائنة، والصندوق = المعدود (WP6)', () => {
  const S = base();
  S.sales = [{ id: 's1', date: '2026-10-01', channels: { cash: { amount: 1000, orders: 20, type: 'cash' } } }];
  S.purchases = [{ id: 'b1', date: '2026-10-01', supplier: 'مخبز', category: 'food', account: 'cash', taxable: true, includesVat: true, lines: [{ qty: 1, price: 200 }] }];
  // المتوقع 800، المعدود 790: عجز 10 (الفرق المحفوظ = المعدود − المتوقع)
  S.cashCounts = [{ id: 'k1', date: '2026-10-01', counted: 790, expected: 800, diff: -10, note: '' }];
  let { L, b } = tbBalanced(S, '2026-10-31');
  close(b['5316'], 10);
  close(b['1101'], 790);
  const e = L.entries.find((x) => x.kind === 'cashadj');
  assert.deepEqual(e.ref, { s: 'cashCounts', id: 'k1' });
  // جرد الدرج آخر قيود يومه (بعد مبيعات اليوم ومشترياته)
  assert.equal(L.entries.filter((x) => x.date === '2026-10-01').pop().kind, 'cashadj');
  // زيادة: دائن 5316
  S.cashCounts = [{ id: 'k1', date: '2026-10-01', counted: 815, expected: 800, diff: 15 }];
  ({ b } = tbBalanced(S, '2026-10-31'));
  close(b['5316'], -15);
  close(b['1101'], 815);
  // لا فرق (أو أقل من هللة): لا قيد
  S.cashCounts = [{ id: 'k1', date: '2026-10-01', counted: 800, expected: 800, diff: 0.004 }];
  assert.ok(!RB.buildLedger(S, '2026-10-31').entries.some((x) => x.kind === 'cashadj'));
  // المتوقع لجرد محفوظ بلا فرقه هو نفسه، وبعده الصندوق = المعدود؛ ولجرد جديد في اليوم التالي يشمل الفرق السابق
  S.cashCounts = [{ id: 'k1', date: '2026-10-01', counted: 790, expected: 800, diff: -10 }];
  const LL = RB.buildLedger(S, '2026-10-31');
  close(RB.cashExpected(LL, '2026-10-01', 'k1'), 800);
  close(RB.cashExpected(LL, '2026-10-02', 'new'), 790);
  close(RB.cashExpected(LL, '2026-09-30'), 0);
  assert.ok(RB.SECTIONS.includes('cashCounts') && RB.DATED.includes('cashCounts'));
  assert.equal(RB.accInfo('5316').group, 'opex');
});

test('أرصدة افتتاحية لمطعم قائم: المخزون والموردون والتطبيقات والضريبة، والحقوق للشركاء حسب نسبهم (WP6)', () => {
  const S = base(); // الشريكان 60% و40%
  S.settings.opening = { date: '2026-10-01', cash: 3000, bank: 20000, inventory: 5000, vatCredit: 1200, apps: { jahez: 2500, keeta: 500 }, payables: [{ supplier: 'ملحمة', amount: 4000 }, { supplier: '', amount: 0 }] };
  S.raw = [{ id: 'r1', name: 'لحم', price: 40, packQty: 1, taxable: true }];
  // جرد بقيمة المخزون الافتتاحي نفسها: لا تغيّر في تكلفة المواد
  S.stockCounts = [{ id: 'k1', date: '2026-10-31', lines: [{ rawId: 'r1', qty: 125, price: 40 }] }];
  let { L, b } = tbBalanced(S, '2026-10-31');
  close(b['5109'] || 0, 0);
  close(b['1104'], 5000);
  close(b['1101'], 3000);
  close(b['1102'], 20000);
  close(b['1103'], 3000);
  close(b['2102'], 1200);
  close(b['2101'], -4000);
  // الصافي 28,200 = حقوق الشريكين 60/40
  close(-b['cap:p1'], 16920);
  close(-b['cap:p2'], 11280);
  assert.equal(L.entries[0].kind, 'opening');
  // الموردون: المستحق الافتتاحي ثم سداده يصفّره
  close(RB.supplierBalances(S, '2026-10-31').find((r) => r.supplier === 'ملحمة').balance, 4000);
  S.supplierPayments = [{ id: 'sp', date: '2026-10-04', supplier: 'ملحمة', account: 'bank', amount: 4000 }];
  close(RB.supplierBalances(S, '2026-10-31').find((r) => r.supplier === 'ملحمة').balance, 0);
  ({ b } = tbBalanced(S, '2026-10-31'));
  close(b['2101'] || 0, 0);
  // التطبيقات: المستحق الافتتاحي ثم التحويل
  close(RB.appReceivables(S, '2026-10-31').find((a) => a.id === 'jahez').balance, 2500);
  S.payouts = [{ id: 'po', date: '2026-10-03', channelId: 'jahez', amount: 2500, deductions: 0 }];
  close(RB.appReceivables(S, '2026-10-31').find((a) => a.id === 'jahez').balance, 0);
  // قبل تاريخ الأرصدة الافتتاحية لا شيء
  assert.equal(RB.supplierBalances(S, '2026-09-30').length, 0);
  // الضريبة: الرصيد الدائن الافتتاحي لا يدخل في إقرار الفترة، ويُرحّل للإقرار الأول
  S.sales = [{ id: 's1', date: '2026-10-05', channels: { cash: { amount: 11500, orders: 300, type: 'cash' } } }];
  const v = RB.vatReport(S, '2026-10-01', '2026-12-31');
  close(v.net, 1500);
  const q4 = RB.vatReturns(S, '2026-12-31').find((r) => r.key === '2026-Q4');
  close(q4.carried, -1200);
  close(q4.due, 300);
  // حقوق الشركاء الافتتاحية رأس مال لا دفع مباشر
  const p = RB.partnersReport(S, '2026-10-01', '2026-10-31');
  close(RB.sum(p.rows, (r) => r.direct), 0);
  close(p.rows[0].contributed, 16920);
  const u = RB.capitalUses(S);
  close(u.direct, 0);
  close(u.contributions, 28200);
  assert.ok(RB.setupSteps(S).steps.find((x) => x.id === 'capital').done);
  // تاريخ غير صالح: لا قيد افتتاحي
  assert.equal(RB.openingInfo(RB.normalize({ settings: { opening: { date: '2026-13-01', cash: 5 } } })), null);
});

test('الجرد بعد الأرصدة الافتتاحية: الفرق عن المخزون الافتتاحي، ورصيد المخزون = آخر جرد (WP6)', () => {
  const S = base();
  S.settings.opening = { date: '2026-10-01', inventory: 5000 };
  S.raw = [{ id: 'r1', name: 'لحم', price: 40, packQty: 1, taxable: true }];
  S.purchases = [{ id: 'b1', date: '2026-10-10', supplier: 'م', category: 'food', account: 'bank', taxable: true, includesVat: false, lines: [{ rawId: 'r1', qty: 100, price: 40 }] }];
  S.stockCounts = [{ id: 'k1', date: '2026-10-31', lines: [{ rawId: 'r1', qty: 150, price: 40 }] }];
  const { b } = tbBalanced(S, '2026-10-31');
  // المستهلك = 5,000 + 4,000 − 6,000
  close(RB.incomeStatement(S, '2026-10-01', '2026-10-31').tot.cogs, 3000);
  close(b['1104'], 6000);
  // بلا شركاء: لا قيد افتتاحي غير متوازن بل خطأ يُذكر
  const N = RB.emptyState();
  N.settings.opening = { date: '2026-10-01', cash: 100 };
  const L = RB.buildLedger(N, '2026-10-31');
  assert.ok(!L.entries.some((e) => e.kind === 'opening'));
  assert.equal(L.errors[0].id, 'opening');
});

test('سلف العمال: الصرف أصل، والاستقطاع من المسير لا يغيّر مصروف الرواتب ويعيد الرصيد إلى صفر (WP6)', () => {
  const S = base();
  S.settings.vatRegistered = false;
  S.capital = [{ id: 'c', date: '2026-09-01', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 50000 }];
  S.employees = [{ id: 'e1', name: 'سليم', nationality: 'expat', basic: 2000, housing: 0, startDate: '2025-01-01', active: true }];
  S.advances = [{ id: 'a1', date: '2026-09-10', employeeId: 'e1', amount: 500, account: 'cash', kind: 'give', note: '' }];
  S.capital.push({ id: 'c2', date: '2026-09-01', partnerId: 'p1', type: 'contribution', account: 'cash', amount: 1000 });
  const run = (ym, adv) => ({ id: 'w' + ym, month: ym, date: RB.monthEnd(ym), account: 'bank', gosiAccount: 'bank', lines: [Object.assign(RB.payrollLine(S.employees[0], S, ym), { advance: adv })] });
  S.payroll = [run('2026-09', 0), run('2026-10', 500)];
  const { b } = tbBalanced(S, '2026-10-31');
  const sep = RB.incomeStatement(S, '2026-09-01', '2026-09-30');
  const oct = RB.incomeStatement(S, '2026-10-01', '2026-10-31');
  const g = (inc) => (inc.groups.labor.find((x) => x.code === '5201') || {}).amount;
  close(g(sep), 2000);
  close(g(oct), 2000);
  close(b['1106'] || 0, 0);
  close(b['1101'], 500);
  // في سبتمبر بعد الصرف: الرصيد 500 على الموظف، ويطابق حساب 1106
  close(RB.advanceBalances(S, '2026-09-30').e1, 500);
  close(RB.balances(RB.buildLedger(S, '2026-09-30').entries, null, '2026-09-30')['1106'], 500);
  close(RB.advanceBalances(S, '2026-10-31').e1, 0);
  // المسير: المحوَّل فعلياً = الصافي − السلفة
  const t = RB.payrollTotals(S.payroll[1]);
  close(t.adv, 500);
  close(t.netPaid, 1500);
  close(t.cost, 2040); // الإجمالي + تأمينات المنشأة 2% (السلفة لا تغيّره)
  // مسير الشهر التالي للصرف يقترح استقطاع المستحق (بقدر الصافي)، والمسيرات المحفوظة تُخصم من الرصيد
  S.payroll = [run('2026-09', 0)];
  close(RB.payrollLine(S.employees[0], S, '2026-10').advance, 500);
  S.advances.push({ id: 'a2', date: '2026-09-20', employeeId: 'e1', amount: 5000, account: 'bank', kind: 'give' });
  close(RB.payrollLine(S.employees[0], S, '2026-10').advance, 2000);
  S.advances.push({ id: 'a3', date: '2026-10-02', employeeId: 'e1', amount: 4000, account: 'cash', kind: 'repay' });
  close(RB.advanceBalances(S, '2026-10-31').e1, 1500);
  // التعبئة تحفظ ما عدّله المستخدم من الاستقطاع
  const kept = RB.payrollFill(S, '2026-10', [Object.assign(RB.payrollLine(S.employees[0], S, '2026-10'), { advance: 300 })]);
  close(kept[0].advance, 300);
  // الاستقطاع في مسير يُصرف في الشهر التالي: في قيد الصرف
  S.advances = [{ id: 'a1', date: '2026-09-10', employeeId: 'e1', amount: 500, account: 'cash', kind: 'give' }];
  S.payroll = [Object.assign(run('2026-09', 500), { date: '2026-10-03' })];
  const r = tbBalanced(S, '2026-10-31');
  close(r.b['1106'] || 0, 0);
  close(RB.incomeStatement(S, '2026-09-01', '2026-09-30').groups.labor.find((x) => x.code === '5201').amount, 2000);
  assert.ok(RB.SECTIONS.includes('advances') && RB.accInfo('1106').type === 'A');
});

test('الشركاء: الأرباح المتاحة للسحب = نصيب الأرباح المتراكمة − المسحوبات (WP6)', () => {
  for (const today of ['2026-10-14', '2027-02-17']) {
    const D = RB.demoState(today);
    const L = RB.buildLedger(D, today);
    const p = RB.partnersReport(D, '2000-01-01', today, L);
    close(p.undistributedTotal, RB.r2(p.retained - RB.sum(p.rows, (r) => r.drawings)));
    // الأسطر تجمع إلى المجموع بالضبط (فرق التقريب لآخر شريك له نسبة)
    assert.equal(RB.r2(RB.sum(p.rows, (r) => r.undistributed)), p.undistributedTotal);
    for (const r of p.rows) close(r.undistributed, RB.r2(r.profitAll - r.drawings));
  }
  const S = base();
  S.sales = [{ id: 's1', date: '2026-10-05', channels: { cash: { amount: 1150, orders: 10, type: 'cash' } } }];
  S.capital = [{ id: 'w', date: '2026-10-06', partnerId: 'p2', type: 'withdrawal', account: 'cash', amount: 600 }];
  const p = RB.partnersReport(S, '2026-10-01', '2026-10-31');
  // ربح 1,000: نصيب الثاني 400 وسحب 600 → −200 (سحب من رأس المال)
  close(p.rows[1].undistributed, -200);
  close(p.rows[0].undistributed, 600);
  close(p.undistributedTotal, 400);
});

test('الشركاء: أسطر الأرباح والحقوق تجمع إلى ربح الفترة والأرباح المتراكمة والميزانية بلا فرق تقريب', () => {
  const check = (S, from, to) => {
    const p = RB.partnersReport(S, from, to);
    const bs = RB.balanceSheet(S, to);
    const tot = (f) => RB.r2(RB.sum(p.rows, f));
    assert.equal(tot((r) => r.profitAll), p.retained);
    assert.equal(tot((r) => r.profitPeriod), p.net);
    assert.equal(tot((r) => r.undistributed), p.undistributedTotal);
    assert.equal(tot((r) => r.equity), bs.tEq);
    assert.equal(tot((r) => r.required), p.totalCap);
    return p;
  };
  // شريكان 50/50 ومصروف 100.01: −50.01 و−50.00
  const S = RB.emptyState();
  S.partners = [{ id: 'a', name: 'أ', share: 50 }, { id: 'b', name: 'ب', share: 50 }];
  S.capital = S.partners.map((x) => ({ id: 'c' + x.id, date: '2026-02-01', partnerId: x.id, type: 'contribution', account: 'bank', amount: 50000 }));
  S.expenses = [{ id: 'x', date: '2026-02-05', category: 'maintenance', desc: 'صيانة', amount: 100.01, taxable: false, account: 'bank' }];
  const p = check(S, '2026-02-01', '2026-02-28');
  assert.deepEqual(p.rows.map((r) => r.profitAll), [-50.01, -50]);
  // شريك ثالث بنسبة صفر (خرج من الشراكة) في آخر القائمة لا يأخذ فرق التقريب
  S.partners.push({ id: 'c', name: 'ج', share: 0 });
  const p0 = check(S, '2026-02-01', '2026-02-28');
  assert.deepEqual(p0.rows.map((r) => r.profitAll), [-50.01, -50, 0]);
  // ثلاثة متساوون وخسارة 100
  const T = RB.emptyState();
  T.partners = ['a', 'b', 'c'].map((id) => ({ id, name: id, share: 1 }));
  T.capital = T.partners.map((x) => ({ id: 'c' + x.id, date: '2026-02-01', partnerId: x.id, type: 'contribution', account: 'bank', amount: 33333.33 }));
  T.expenses = [{ id: 'x', date: '2026-02-05', category: 'maintenance', desc: 'صيانة', amount: 100, taxable: false, account: 'bank' }];
  assert.deepEqual(check(T, '2026-02-01', '2026-02-28').rows.map((r) => r.profitAll), [-33.33, -33.33, -33.34]);
  // بلا نسب: لا أرباح لأحد كما كان
  T.partners.forEach((x) => (x.share = 0));
  assert.ok(RB.partnersReport(T, '2026-02-01', '2026-02-28').rows.every((r) => r.profitAll === 0 && r.profitPeriod === 0));
  // البيانات التجريبية في نهايات أشهر مختلفة
  for (const today of ['2026-08-31', '2026-09-30', '2026-10-14', '2027-02-17']) {
    const D = RB.demoState(today);
    check(D, today.slice(0, 8) + '01', today);
    check(D, '2000-01-01', today);
  }
});

test('تاريخ أسعار المادة الخام: بلا ضريبة، الأحدث أولاً، وأسطر الشراء فقط (WP6)', () => {
  const S = base();
  S.raw = [{ id: 'beef', name: 'لحم', price: 360 }];
  const buy = (id, date, price, o) => Object.assign({ id, date, supplier: 'ملحمة', category: 'food', account: 'bank', taxable: true, includesVat: false, lines: [{ rawId: 'beef', qty: 2, price }] }, o || {});
  S.purchases = [
    buy('b1', '2026-07-01', 340),
    buy('b2', '2026-09-01', 391, { includesVat: true }), // 340 بلا ضريبة
    buy('b3', '2026-10-01', 360, { includesVat: true, taxable: false }), // غير خاضعة: كما هو
    buy('b4', '2026-10-05', 300, { lines: [{ rawId: 'beef', qty: -1, price: 300 }] }), // مرتجع لا يُعد
    buy('b5', '2026-08-01', 272, { supplier: 'آخر' }),
  ];
  const h = RB.rawPriceHistory(S, 'beef');
  assert.deepEqual(h.map((x) => [x.date, x.priceNet, x.purchaseId]), [['2026-10-01', 360, 'b3'], ['2026-09-01', 340, 'b2'], ['2026-08-01', 272, 'b5'], ['2026-07-01', 340, 'b1']]);
  assert.equal(h[2].supplier, 'آخر');
  const ch = RB.rawPriceChange(S, 'beef');
  close(ch.last, 360);
  close(ch.prev, 340);
  close(ch.pct, (20 / 340) * 100, 1e-9);
  // استثناء الفاتورة التي تُحفظ (الأحدث الآن من غيرها)
  assert.equal(RB.rawPriceHistory(S, 'beef', 'b3')[0].date, '2026-09-01');
  // سعر واحد لم يتغير: لا تغيّر
  S.purchases = [buy('b1', '2026-07-01', 340), buy('b2', '2026-09-01', 340)];
  assert.equal(RB.rawPriceChange(S, 'beef'), null);
});

test('البيانات التجريبية واقعية: جرد افتتاحي، تكلفة مواد معقولة، وكميات الأصناف بأسعار المحل والتطبيقات (WP6)', () => {
  for (const today of ['2026-10-14', '2026-10-09', '2027-02-17', '2026-12-31']) {
    const D = RB.demoState(today);
    const L = RB.buildLedger(D, today);
    const open = D.settings.openingDate;
    // جرد افتتاحي في اليوم السابق للافتتاح: لا تكلفة مواد في شهر ما قبل التشغيل
    const first = D.stockCounts.slice().sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    assert.equal(first.date, RB.addDays(open, -1));
    const preYm = RB.ymAdd(open.slice(0, 7), -1);
    close(RB.incomeStatement(D, preYm + '-01', RB.monthEnd(preYm), L).tot.cogs, 0);
    for (let ym = open.slice(0, 7); ym < today.slice(0, 7); ym = RB.ymAdd(ym, 1)) {
      const to = RB.monthEnd(ym);
      const inc = RB.incomeStatement(D, ym + '-01', to, L);
      assert.ok(inc.ratios.foodCost >= 30 && inc.ratios.foodCost <= 34, `${today} ${ym} تكلفة المواد ${inc.ratios.foodCost}`);
      const m = RB.menuAnalysis(D, ym + '-01', to, L);
      assert.ok(Math.abs(m.variance / m.theoretical) <= 0.05, `${today} ${ym} الفرق ${m.variance}`);
      // قيمة الأصناف بسعر المحل أقل من المبيعات (أصناف التطبيقات بأسعارها الأعلى)
      const days = D.sales.filter((s) => s.date.slice(0, 7) === ym);
      const atShop = RB.sum(days, (s) => RB.sum(s.items, (i) => i.qty * D.products.find((p) => p.id === i.productId).price));
      assert.ok(atShop < RB.sum(days, RB.saleTotal), ym);
      // جرد آخر الشهر كميات غير سالبة
      const c = D.stockCounts.find((x) => x.date === to);
      assert.ok(c && c.lines.every((l) => l.qty >= 0));
    }
    // سحب شريك، وفاتورة لحم بسعر أعلى يتحدث منها سعر المادة
    assert.ok(D.capital.some((c) => c.type === 'withdrawal'));
    const ch = RB.rawPriceChange(D, 'm_beef');
    assert.ok(ch && ch.last > ch.prev);
    assert.equal(D.raw.find((r) => r.id === 'm_beef').price, ch.last);
  }
});

test('سلفة من ترك العمل تُستقطع من مكافأة نهاية الخدمة في مسير التسوية (WP6)', () => {
  const S = base();
  S.capital = [{ id: 'c', date: '2026-01-01', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 50000 }];
  S.employees = [{ id: 'e1', name: 'سليم', nationality: 'expat', basic: 2400, housing: 0, startDate: '2024-01-01', endDate: '2026-09-30', active: false }];
  S.advances = [{ id: 'a1', date: '2026-09-10', employeeId: 'e1', amount: 300, account: 'bank', kind: 'give' }];
  const line = Object.assign(RB.payrollLine(S.employees[0], S, '2026-10'), { basic: 0, housing: 0, allowances: 0, gosiEe: 0, gosiEr: 0, eosbPaid: 450, advance: 300 });
  S.payroll = [{ id: 'st', month: '2026-10', date: '2026-10-05', account: 'bank', gosiAccount: 'bank', lines: [line] }];
  const { L, b } = tbBalanced(S, '2026-10-31');
  close(b['1106'] || 0, 0);
  // من البنك: السلفة 300، ثم صافي التسوية 450 − 300 = 150
  close(b['1102'], 50000 - 300 - 150);
  // السلفة أكبر من راتب السطر (صفر): تُستقطع من المكافأة في قيد صرفها، فلا صافي رواتب سالب (مال داخل للبنك)
  // (بلا مسيرات سابقة لا مخصص له: المكافأة كلها مصروف 5203 في تاريخ الصرف)
  const eo = L.entries.find((e) => e.kind === 'eosb' && e.lines.some((l) => l.a === '5203' && l.v > 0));
  close(eo.lines.find((l) => l.a === '1106').v, -300);
  close(eo.lines.find((l) => l.a === '1102').v, -150);
  assert.ok(!L.entries.some((e) => e.kind === 'payroll' && e.lines.some((l) => l.a === '1102' && l.v > 0)));
});

test('مسير تسوية يستقطع السلفة كلها من المكافأة: لا حركة في البنك، ومسير مختلط يبقى صافي رواتبه كما هو (مراجعة WP6)', () => {
  const S = base();
  S.capital = [{ id: 'c', date: '2026-01-01', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 50000 }];
  S.employees = [
    { id: 'e1', name: 'سليم', nationality: 'expat', basic: 2400, housing: 0, startDate: '2024-01-01', endDate: '2026-10-10', active: false },
    { id: 'e2', name: 'ماهر', nationality: 'expat', basic: 3000, housing: 0, startDate: '2024-01-01', active: true },
  ];
  S.advances = [{ id: 'a1', date: '2026-10-02', employeeId: 'e1', amount: 700, account: 'cash', kind: 'give' }];
  const settle = Object.assign(RB.payrollLine(S.employees[0], S, '2026-10'), { basic: 0, housing: 0, allowances: 0, deductions: 0, gosiEe: 0, gosiEr: 0, eosbPaid: 450, advance: 450 });
  close(RB.payrollLineAdvEosb(settle), 450);
  S.payroll = [{ id: 'st', month: '2026-10', date: '2026-10-15', account: 'bank', gosiAccount: 'bank', lines: [settle] }];
  let { L, b } = tbBalanced(S, '2026-10-31');
  // لم يتحرك مال: لا سطر للبنك في قيدي المسير والمكافأة، والسلفة الباقية 250
  const own = L.entries.filter((e) => e.ref && e.ref.id === 'st');
  assert.ok(own.length > 0);
  assert.ok(!own.some((e) => e.lines.some((l) => l.a === '1102')));
  close(b['1102'], 50000);
  close(b['1106'], 250);
  close(RB.advanceBalances(S, '2026-10-31').e1, 250);
  const st = RB.accountStatement(S, '1102', '2026-10-15', '2026-10-15', L);
  assert.equal(st.rows.length, 0);
  // مسير مختلط: سطر راتب لماهر وسطر التسوية لسليم — صافي الرواتب لماهر وحده، والمكافأة بلا صرف من البنك
  const t2 = RB.payrollLine(S.employees[1], S, '2026-10');
  S.payroll = [{ id: 'mx', month: '2026-10', date: '2026-10-15', account: 'bank', gosiAccount: 'bank', lines: [t2, settle] }];
  ({ L, b } = tbBalanced(S, '2026-10-31'));
  const t = RB.payrollTotals(S.payroll[0]);
  close(t.advEosb, 450);
  const pay = L.entries.find((e) => e.kind === 'payroll' && e.ref.id === 'mx');
  const net2 = RB.payrollLineGross(t2) - t2.gosiEe;
  close(pay.lines.find((l) => l.a === '1102' && l.memo === 'صافي الرواتب').v, -net2);
  assert.ok(!pay.lines.some((l) => l.a === '1106'));
  const eo = L.entries.find((e) => e.kind === 'eosb' && e.ref.id === 'mx' && e.lines.some((l) => l.a === '1106'));
  assert.ok(!eo.lines.some((l) => l.a === '1102'));
  close(b['1106'], 250);
  // مجموع ما خرج من البنك = صافي ماهر + تأميناته وتأمينات المنشأة، والمكافأة لم يُدفع منها شيء
  close(b['1102'], 50000 - net2 - t.gosiEe - t.gosiEr);
});

test('مسير شهر فات تسجيله: لا يُقترح استقطاع سلفة استقطعها مسير لاحق أو سُدّدت بعده (مراجعة WP6)', () => {
  const S = base();
  S.employees = [{ id: 'e1', name: 'سليم', nationality: 'expat', basic: 2000, housing: 0, startDate: '2025-01-01', active: true }];
  S.advances = [{ id: 'a1', date: '2026-07-10', employeeId: 'e1', amount: 500, account: 'cash', kind: 'give' }];
  const run = (ym, adv) => ({ id: 'w' + ym, month: ym, date: RB.monthEnd(ym), account: 'bank', gosiAccount: 'bank', lines: [Object.assign(RB.payrollLine(S.employees[0], S, ym), { advance: adv })] });
  // مسير سبتمبر استقطع السلفة كلها، ولا مسير ليوليو
  S.payroll = [run('2026-09', 500)];
  close(RB.advanceBalances(S, '2026-07-31').e1, 500);
  close(RB.advanceRoom(S, '2026-07-31').e1, 0);
  close(RB.payrollLine(S.employees[0], S, '2026-07').advance, 0);
  assert.equal(RB.payrollFill(S, '2026-07')[0].advance, 0);
  // استقطع سبتمبر 200 فقط: يوليو يقترح الباقي 300، وبعد حفظه لا رصيد سالب في أي يوم
  S.payroll = [run('2026-09', 200)];
  close(RB.payrollLine(S.employees[0], S, '2026-07').advance, 300);
  S.payroll.push(run('2026-07', 300));
  close(RB.advanceLow(S, 'e1').min, 0);
  close(RB.advanceBalances(S, '2026-12-31').e1, 0);
  // سداد نقدي بعد يوليو: لا يُستقطع ما سُدّد
  S.payroll = [];
  S.advances.push({ id: 'r1', date: '2026-08-15', employeeId: 'e1', amount: 500, account: 'cash', kind: 'repay' });
  close(RB.payrollLine(S.employees[0], S, '2026-07').advance, 0);
  // سلفة صُرفت بعد الشهر لا تُستقطع فيه: تُستقطع في الشهر التالي
  S.advances = [{ id: 'a2', date: '2026-08-05', employeeId: 'e1', amount: 400, account: 'cash', kind: 'give' }];
  close(RB.payrollLine(S.employees[0], S, '2026-07').advance, 0);
  close(RB.payrollLine(S.employees[0], S, '2026-08').advance, 400);
  // رصيد سالب لاحقاً (بيانات قديمة): لا اقتراح سالب
  S.payroll = [run('2026-09', 900)];
  close(RB.advanceRoom(S, '2026-08-31').e1, -500);
  close(RB.payrollLine(S.employees[0], S, '2026-08').advance, 0);
});

test('أصل قائم قبل بدء الدفتر: بلا ضريبة مدخلات، وقيمته حقوق للشركاء حسب نسبهم لا دفعاً من شريك واحد (مراجعة WP6)', () => {
  const S = base(); // الشريكان 60% و40%
  S.settings.opening = { date: '2026-10-01', bank: 10000 };
  // كما يقترح الدليل: بالقيمة الدفترية، والنموذج حُفظ بقيم «خاضع/غير شامل» الافتراضية
  S.assets = [{ id: 'a1', name: 'شواية', date: '2026-10-01', category: 'kitchen', amount: 50000, includesVat: false, taxable: true, account: 'opening', lifeMonths: 60, salvage: 0 }];
  assert.equal(RB.assetTaxable(S.assets[0]), false);
  assert.equal(RB.srcLabel('opening', S), 'أصل قائم قبل بدء الدفتر');
  const { L, b } = tbBalanced(S, '2026-12-31');
  // لا ضريبة مدخلات في أول إقرار
  const v = RB.vatReport(S, '2026-10-01', '2026-12-31');
  close(v.inVat, 0);
  close(v.net, 0);
  close(b['2102'] || 0, 0);
  // الأصل بقيمته، والحقوق 60/40 مع بقية الأرصدة الافتتاحية
  close(b['1201'], 50000);
  close(-b['cap:p1'], 36000);
  close(-b['cap:p2'], 24000);
  const e = L.entries.find((x) => x.ref.s === 'assets' && x.ref.id === 'a1' && x.lines.some((l) => l.a === '1201'));
  assert.equal(e.kind, 'opening');
  // الإهلاك من تاريخ بدء الدفتر بعمره المتبقي
  close(RB.depSchedule(S.assets[0], S).monthly, 833.33);
  // الشركاء: لا فرق بينهما ولا «دفعها مباشرة»
  const p = RB.partnersReport(S, '2026-10-01', '2026-12-31', L);
  for (const r of p.rows) {
    close(r.diff, 0);
    close(r.direct, 0);
  }
  // رأس المال التأسيسي: الأصل القائم مصدر واستخدام معاً فلا يغيّر المتبقي
  const u = RB.capitalUses(S, L);
  close(u.contributions, 60000);
  close(u.direct, 0);
  close(u.assetsTotal, 50000);
  close(u.remaining, 10000);
  // الطريقة القديمة (دفعها الشريك من حسابه، خاضع): ضريبة مدخلات وحقوق لشريك واحد — هذا ما يمنعه المصدر الجديد
  const old = JSON.parse(JSON.stringify(S));
  old.assets[0].account = 'partner:p1';
  close(RB.vatReport(old, '2026-10-01', '2026-12-31').inVat, 7500);
  // بلا شركاء: خطأ يُذكر ولا قيد غير متوازن
  const N = RB.emptyState();
  N.assets = [Object.assign({}, S.assets[0])];
  const LN = RB.buildLedger(N, '2026-12-31');
  assert.ok(!LN.entries.some((x) => x.lines.some((l) => l.a === '1201')));
  assert.equal(LN.errors[0].id, 'a1');
});

test('رصيد السلف عبر الزمن: حذف سلفة استُقطعت في مسير يجعله سالباً (يُمنع في الواجهة) (مراجعة WP6)', () => {
  const S = base();
  S.employees = [{ id: 'e1', name: 'سليم', nationality: 'expat', basic: 2000, housing: 0, startDate: '2025-01-01', active: true }];
  S.advances = [{ id: 'a1', date: '2026-09-10', employeeId: 'e1', amount: 500, account: 'cash', kind: 'give' }];
  const line = Object.assign(RB.payrollLine(S.employees[0], S, '2026-09'));
  close(line.advance, 500);
  S.payroll = [{ id: 'w', month: '2026-09', date: '2026-10-01', account: 'bank', gosiAccount: 'bank', lines: [line] }];
  assert.deepEqual(RB.advanceLow(S, 'e1'), { min: 0, date: '' });
  // بلا السلفة: −500 من يوم الصرف، و1106 دائن
  const del = Object.assign({}, S, { advances: [] });
  assert.deepEqual(RB.advanceLow(del, 'e1'), { min: -500, date: '2026-10-01' });
  close(RB.balances(RB.buildLedger(del, '2026-10-31').entries, null, '2026-10-31')['1106'], -500);
  // إنقاصها إلى 300: −200
  close(RB.advanceLow(Object.assign({}, S, { advances: [Object.assign({}, S.advances[0], { amount: 300 })] }), 'e1').min, -200);
  // نقلها إلى ما بعد الاستقطاع: سالب بين التاريخين ثم يعود صفراً
  const late = Object.assign({}, S, { advances: [Object.assign({}, S.advances[0], { date: '2026-10-05' })] });
  assert.deepEqual(RB.advanceLow(late, 'e1'), { min: -500, date: '2026-10-01' });
  close(RB.advanceBalances(late, '2026-10-31').e1, 0);
  // سداد نقدي في اليوم نفسه بعد الصرف: لا سالب في نهاية اليوم
  const same = Object.assign({}, S, { payroll: [], advances: S.advances.concat([{ id: 'r', date: '2026-09-10', employeeId: 'e1', amount: 500, account: 'cash', kind: 'repay' }]) });
  close(RB.advanceLow(same, 'e1').min, 0);
});

test('تعبئة المسير: استقطاع السلفة التلقائي (_autoAdv) يتبع الشهر، وما كتبه المستخدم يبقى (مراجعة WP6)', () => {
  const S = base();
  S.employees = [{ id: 'e1', name: 'سليم', nationality: 'expat', basic: 2000, housing: 0, startDate: '2025-01-01', active: true }];
  S.advances = [{ id: 'a1', date: '2026-09-10', employeeId: 'e1', amount: 500, account: 'cash', kind: 'give' }];
  const sep = RB.payrollFill(S, '2026-09');
  close(sep[0].advance, 500);
  close(sep[0]._autoAdv, 500);
  // أغسطس قبل السلفة: التلقائي يصير صفراً
  const aug = RB.payrollFill(S, '2026-08', JSON.parse(JSON.stringify(sep)), '2026-09');
  close(aug[0].advance, 0);
  // ما كتبه المستخدم (200) يبقى
  sep[0].advance = 200;
  close(RB.payrollFill(S, '2026-08', JSON.parse(JSON.stringify(sep)), '2026-09')[0].advance, 200);
});

test('استقطاع السلفة المقترح حتى تاريخ صرف المسير: سلفة أُعطيت بعده لا تُستقطع قبل أن تُعطى', () => {
  const S = base();
  S.employees = [{ id: 'e1', name: 'عبدالله', nationality: 'expat', basic: 3000, housing: 0, startDate: '2025-01-01', active: true }];
  S.advances = [{ id: 'a1', date: '2026-03-28', employeeId: 'e1', amount: 900, account: 'cash', kind: 'give' }];
  const e = S.employees[0];
  // بلا تاريخ صرف: آخر الشهر كما كان
  assert.equal(RB.payrollLine(e, S, '2026-03').advance, 900);
  assert.equal(RB.payrollLine(e, S, '2026-03', '2026-03-31').advance, 900);
  assert.equal(RB.payrollFill(S, '2026-03')[0].advance, 900);
  // صرف 25 مارس قبل السلفة: لا استقطاع، والتلقائي صفر
  const fill = RB.payrollFill(S, '2026-03', [], '2026-03', '2026-03-25');
  assert.deepEqual([fill[0].advance, fill[0]._autoAdv], [0, 0]);
  S.payroll = [{ id: 'w3', month: '2026-03', date: '2026-03-25', account: 'bank', gosiAccount: 'bank', lines: fill }];
  assert.deepEqual(RB.advanceLow(S, 'e1'), { min: 0, date: '' });
  assert.equal(RB.advanceBalances(S, '2026-03-31').e1, 900);
  // مسير أبريل يستقطعها
  assert.equal(RB.payrollFill(S, '2026-04', [], '2026-04', '2026-04-25')[0].advance, 900);
  // مسير مارس مصروف 5 أبريل بعد سلفة 2 أبريل: تُقترح من تاريخ الصرف
  const T = base();
  T.employees = S.employees;
  T.advances = [{ id: 'a2', date: '2026-04-02', employeeId: 'e1', amount: 400, account: 'cash', kind: 'give' }];
  assert.equal(RB.payrollLine(e, T, '2026-03').advance, 0);
  assert.equal(RB.payrollLine(e, T, '2026-03', '2026-04-05').advance, 400);
});

test('التجريبي: المخزون المحسوب لا يصير سالباً، وبضاعة الافتتاح تكفي حتى أول توريد (مراجعة WP6)', () => {
  for (const today of ['2026-10-14', '2026-10-09', '2027-02-17', '2026-12-31']) {
    const D = RB.demoState(today);
    const pack = Object.fromEntries(D.raw.map((r) => [r.id, r.packQty]));
    const byDay = {};
    for (const p of D.purchases) (byDay[p.date] = byDay[p.date] || { p: [], s: [] }).p.push(p);
    for (const s of D.sales) (byDay[s.date] = byDay[s.date] || { p: [], s: [] }).s.push(s);
    const oh = {};
    for (const d of Object.keys(byDay).sort()) {
      for (const p of byDay[d].p) for (const l of p.lines) if (l.rawId) oh[l.rawId] = (oh[l.rawId] || 0) + l.qty * pack[l.rawId];
      const u = {};
      for (const s of byDay[d].s) for (const i of s.items) RB.explode(D, 'prod', i.productId, i.qty, u);
      for (const k of Object.keys(u)) {
        oh[k] = (oh[k] || 0) - u[k];
        assert.ok(oh[k] >= -0.001, `${today}: ${k} بالسالب ${(oh[k] / pack[k]).toFixed(2)} في ${d}`);
      }
    }
    // الجرد الافتتاحي = بضاعة الافتتاح
    const open = D.settings.openingDate;
    const init = D.purchases.filter((p) => p.date === RB.addDays(open, -2));
    close(RB.stockValue(D.stockCounts.find((c) => c.date === RB.addDays(open, -1)), D), RB.sum(init, RB.purchaseTotal));
  }
});

test('ميزان المراجعة: حسابات الشركاء برموز 31xx و32xx لا بمعرّفاتها الداخلية، ومرتبة بالرمز (القبول النهائي)', () => {
  const S = base();
  S.settings.openingDate = '2026-08-01';
  S.capital = [
    { id: 'c1', date: '2026-07-01', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 60000 },
    { id: 'c2', date: '2026-07-01', partnerId: 'p2', type: 'contribution', account: 'bank', amount: 40000 },
    { id: 'w1', date: '2026-09-01', partnerId: 'p2', type: 'withdrawal', account: 'cash', amount: 500 },
    // شريك حُذف وبقيت حركته
    { id: 'c3', date: '2026-07-02', partnerId: 'gone', type: 'contribution', account: 'bank', amount: 100 },
  ];
  S.sales = [{ id: 's1', date: '2026-08-05', channels: { cash: { amount: 1150, orders: 10 } } }];
  const tb = RB.trialBalance(S, null, '2026-12-31');
  const disp = Object.fromEntries(tb.rows.map((r) => [r.code, r.disp]));
  assert.equal(disp['cap:p1'], '3101');
  assert.equal(disp['cap:p2'], '3102');
  assert.equal(disp['drw:p2'], '3202');
  assert.equal(disp['cap:gone'], '3199');
  assert.equal(disp['1102'], '1102');
  assert.ok(tb.rows.every((r) => /^\d{4}$/.test(r.disp)), 'كل الرموز المعروضة أرقام');
  const order = tb.rows.map((r) => r.disp);
  assert.deepEqual(order, order.slice().sort());
  close(tb.dr, tb.cr);
  // الاسم كما هو، والحساب الداخلي باقٍ للتمييز
  assert.equal(tb.rows.find((r) => r.code === 'drw:p2').name, 'مسحوبات ب');
  assert.equal(tb.rows.find((r) => r.code === 'cap:gone').name, 'رأس مال شريك محذوف');
});

// ───────── المتبقيات: المحاسبة والرواتب والصندوق ─────────

test('أين ذهب رأس المال: الأصل الآجل بتاريخ الافتتاح من المستحق للموردين عند الافتتاح كما هو من المصروف (المتبقيات)', () => {
  const t = '2026-10-14';
  const asset = (date) => ({ id: 'pay', date, name: 'معدات آجلة', supplier: 'شركة المعدات', category: 'kitchen', amount: 10000, includesVat: false, taxable: true, account: 'payable', lifeMonths: 60, salvage: 0 });
  const S0 = RB.demoState(t);
  const open = S0.settings.openingDate;
  const cu0 = RB.capitalUses(S0);
  const on = RB.demoState(t);
  on.assets.push(asset(open));
  const before = RB.demoState(t);
  before.assets.push(asset(RB.addDays(open, -10)));
  const a = RB.capitalUses(on);
  const b = RB.capitalUses(before);
  // تأسيسي في الحالتين: يُخصم من المتبقي، والمستحق للموردين عند الافتتاح يشمله (المتبقي = النقد − المستحق)
  close(a.used, cu0.used + 11500);
  close(a.remaining, cu0.remaining - 11500);
  close(a.owedAtOpen, cu0.owedAtOpen + 11500);
  close(a.owedAtOpen, b.owedAtOpen);
  close(a.remaining, b.remaining);
  // بعد الافتتاح: لا يدخل في أيٍّ منهما
  const later = RB.demoState(t);
  later.assets.push(asset(RB.addDays(open, 1)));
  close(RB.capitalUses(later).owedAtOpen, cu0.owedAtOpen);
});

test('الزكاة الأولى من الافتتاح: لا يُحمَّل منها شيء على أشهر ما قبل الافتتاح (المتبقيات)', () => {
  const set = { openingDate: '2026-07-01' };
  assert.deepEqual(RB.zakatCoverage(set, '2027-04-20'), { startDate: '2026-07-01', months: 6 });
  assert.deepEqual(RB.zakatCoverage(set, '2028-04-20'), { startDate: '2027-01-01', months: 12 });
  assert.deepEqual(RB.zakatCoverage({ openingDate: '2026-07-15' }, '2027-04-20'), { startDate: '2026-07-15', months: 6 });
  // الافتتاح أول السنة أو قبلها، أو بلا تاريخ افتتاح: السنة كاملة
  assert.deepEqual(RB.zakatCoverage({ openingDate: '2026-01-01' }, '2027-04-20'), { startDate: '2026-01-01', months: 12 });
  assert.deepEqual(RB.zakatCoverage({ openingDate: '2024-03-01' }, '2027-04-20'), { startDate: '2026-01-01', months: 12 });
  assert.deepEqual(RB.zakatCoverage({}, '2027-04-20'), { startDate: '2026-01-01', months: 12 });
  // يُوزَّع على يوليو–ديسمبر فقط، و«كل الفترات» لا تبدأ قبل الافتتاح
  const S = base();
  S.settings.openingDate = '2026-07-01';
  S.capital = [{ id: 'c', date: '2026-06-01', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 50000 }];
  S.expenses = [Object.assign({ id: 'z', date: '2027-04-20', category: 'zakat', desc: 'الزكاة', amount: 6000, includesVat: false, taxable: false, account: 'bank' }, RB.zakatCoverage(S.settings, '2027-04-20'))];
  const sch = RB.amortSchedule(S.expenses[0], S);
  assert.deepEqual(sch.months.map((m) => m.ym), ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
  const L = RB.buildLedger(S, '2027-12-31');
  assert.equal(L.entries[0].date, '2026-06-01');
  close(RB.incomeStatement(S, '2026-01-01', '2026-06-30', L).zakat, 0);
  close(RB.incomeStatement(S, '2026-07-01', '2026-12-31', L).zakat, 6000);
  assert.equal(sch.end, '2026-12-31');
});

test('الزكاة الأولى من افتتاح أثناء الشهر: تغطيتها حتى آخر السنة وأول تحميل يوم الافتتاح لا قبله (المتبقيات)', () => {
  const S = base();
  S.settings.vatRegistered = false;
  S.settings.openingDate = '2025-07-15';
  S.capital = [{ id: 'c', date: '2025-07-15', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 50000 }];
  const cov = RB.zakatCoverage(S.settings, '2026-03-10');
  assert.deepEqual(cov, { startDate: '2025-07-15', months: 6 });
  const z = Object.assign({ id: 'z', date: '2026-03-10', category: 'zakat', desc: 'زكاة 2025', amount: 6000, includesVat: false, taxable: false, account: 'bank' }, cov);
  S.expenses = [z];
  // نهاية التغطية: آخر السنة المالية 2025، لا 14 يناير 2026 (كما في معاينة النموذج وقائمة المصاريف)
  assert.equal(RB.expenseCoverageEnd(z), '2025-12-31');
  const sch = RB.amortSchedule(z, S);
  assert.equal(sch.end, '2025-12-31');
  assert.deepEqual(sch.months.map((m) => m.ym + '@' + m.date), ['2025-07@2025-07-15', '2025-08@2025-08-01', '2025-09@2025-09-01', '2025-10@2025-10-01', '2025-11@2025-11-01', '2025-12@2025-12-01']);
  close(RB.sum(sch.months, (m) => m.amount), 6000);
  // لا تحميل قبل الافتتاح، وفترة تبدأ يوم الافتتاح تشمل حصة يوليو
  const L = RB.buildLedger(S, '2026-12-31');
  assert.ok(!L.entries.some((e) => e.kind === 'amort' && e.date < '2025-07-15'));
  close(RB.incomeStatement(S, '2025-07-15', '2025-12-31', L).zakat, 6000);
  close(RB.incomeStatement(S, '2025-07-15', '2025-07-31', L).zakat, 1000);
  close(RB.balanceSheet(S, '2026-12-31', L).check, 0);
  // الزكاة من أول الشهر أو السنة كاملة: النهاية نفسها كما كانت
  assert.equal(RB.expenseCoverageEnd({ category: 'zakat', date: '2026-04-20', startDate: '2025-01-01', months: 12 }), '2025-12-31');
  assert.equal(RB.expenseCoverageEnd({ category: 'zakat', date: '2026-04-20', startDate: '2025-07-01', months: 6 }), '2025-12-31');
  // غير الزكاة: التغطية بالأيام من بدايتها كما هي، وأول تحميل بتاريخ بدايتها إن بدأت أثناء الشهر
  const rent = { id: 'r', date: '2026-07-20', category: 'rent', desc: 'إيجار', amount: 12000, includesVat: false, taxable: false, account: 'bank', months: 6, startDate: '2026-08-15' };
  assert.equal(RB.expenseCoverageEnd(rent), '2027-02-14');
  const rs = RB.amortSchedule(rent, S);
  assert.equal(rs.end, '2027-02-14');
  assert.deepEqual(rs.months.slice(0, 2).map((m) => m.date), ['2026-08-15', '2026-09-01']);
  // الدفع بعد بداية التغطية في شهرها: أول تحميل بتاريخ الدفع كما كان
  assert.equal(RB.amortSchedule(Object.assign({}, rent, { date: '2026-08-20' }), S).months[0].date, '2026-08-20');
});

test('زكاة تُدفع في سنة الافتتاح نفسها: لا تبدأ تغطيتها قبل الافتتاح ولا تمتد «كل الفترات» إلى سنة قبله (المتبقيات 3)', () => {
  const set = { openingDate: '2026-07-01' };
  // السنة السابقة لسنة الدفع (2025) انتهت قبل الافتتاح: السنة الأولى من الافتتاح حتى آخر 2026
  const cov = RB.zakatCoverage(set, '2026-10-15');
  assert.deepEqual(cov, { startDate: '2026-07-01', months: 6 });
  assert.ok(cov.startDate >= set.openingDate);
  assert.deepEqual(RB.zakatCoverage({ openingDate: '2026-07-15' }, '2026-10-15'), { startDate: '2026-07-15', months: 6 });
  // افتتاح أول يناير من سنة الدفع: سنة الافتتاح كاملة لا السنة التي قبلها
  assert.deepEqual(RB.zakatCoverage({ openingDate: '2026-01-01' }, '2026-10-15'), { startDate: '2026-01-01', months: 12 });
  // دفع قبل الافتتاح (ولو بسنوات): لا بداية قبل الافتتاح أبداً
  for (const d of ['2026-03-01', '2025-05-10', '2024-12-31']) assert.ok(RB.zakatCoverage(set, d).startDate >= set.openingDate, d);
  // السنة الثانية بعد الافتتاح كما كانت
  assert.deepEqual(RB.zakatCoverage(set, '2027-04-20'), { startDate: '2026-07-01', months: 6 });
  // التجربة (افتتاح 1 يوليو 2026، اليوم 15 أكتوبر 2026): الزكاة بتغطيتها الافتراضية لا تُحمَّل على 2025،
  // وأول قيد في الدفتر (بداية «كل الفترات») كما هو قبلها
  const t = '2026-10-15';
  const D = RB.demoState(t);
  const first = RB.buildLedger(D, '9999-12-31').entries.reduce((m, e) => (e.date < m ? e.date : m), '9999-12-31');
  D.expenses.push(Object.assign({ id: 'zk', date: t, category: 'zakat', desc: 'الزكاة', amount: 3000, includesVat: false, taxable: false, account: 'bank' }, RB.zakatCoverage(D.settings, t)));
  const L = RB.buildLedger(D, '9999-12-31');
  assert.equal(L.entries.reduce((m, e) => (e.date < m ? e.date : m), '9999-12-31'), first);
  const zk = L.entries.filter((e) => e.kind === 'amort' && e.ref && e.ref.id === 'zk');
  assert.deepEqual(zk.map((e) => e.date), ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-15', '2026-11-01', '2026-12-01']); // شهر الدفع بتاريخ الدفع كما في amortSchedule
  close(RB.incomeStatement(D, '2025-01-01', '2025-12-31', L).zakat, 0);
  close(RB.incomeStatement(D, D.settings.openingDate, '2026-12-31', L).zakat, 3000);
  close(RB.balanceSheet(D, '2026-12-31', L).check, 0);
});

test('جرد الدرج يصير قديماً بحركة نقدية بتاريخه أو قبله سُجّلت بعده، وإعادة حفظه تصححه (المتبقيات)', () => {
  const S = base();
  S.settings.vatRegistered = false;
  S.sales = [{ id: 's1', date: '2026-10-14', channels: { cash: { amount: 1000, orders: 10, type: 'cash' } } }];
  const count = (id, date, counted) => {
    const L = RB.buildLedger(S, '2026-10-31');
    const expected = RB.cashCountExpected(S, L, { id, date });
    const c = { id, date, counted, expected, diff: RB.r2(counted - expected) };
    S.cashCounts = S.cashCounts.filter((x) => x.id !== id).concat([c]);
    return c;
  };
  count('k1', '2026-10-14', 950);
  assert.deepEqual(RB.staleCashCounts(S, RB.buildLedger(S, '2026-10-31')), []);
  // مشتريات نقدية نُسيت بتاريخ الجرد: الفرق المحفوظ (−50) قديم، والمتوقع الآن 950
  S.purchases = [{ id: 'p1', date: '2026-10-14', supplier: 'x', category: 'food', account: 'cash', includesVat: true, taxable: false, lines: [{ qty: 1, price: 50 }] }];
  let L = RB.buildLedger(S, '2026-10-31');
  close(RB.balances(L.entries, null, '2026-10-31')['1101'], 900);
  let st = RB.staleCashCounts(S, L);
  assert.equal(st.length, 1);
  assert.equal(st[0].count.id, 'k1');
  close(st[0].expected, 950);
  close(RB.cashCountExpected(S, L, S.cashCounts[0]), 950);
  // حركة بعد يوم الجرد لا تجعله قديماً
  S.expenses = [{ id: 'x1', date: '2026-10-15', category: 'maintenance', desc: 'صيانة', amount: 30, taxable: false, account: 'cash', months: 1 }];
  assert.equal(RB.staleCashCounts(S, RB.buildLedger(S, '2026-10-31')).length, 1);
  // إعادة الحفظ: لا فرق، والصندوق = المعدود، ولا عجز مكرر
  count('k1', '2026-10-14', 950);
  const r = tbBalanced(S, '2026-10-31');
  assert.equal(RB.staleCashCounts(S, r.L).length, 0);
  close(RB.balances(r.L.entries, null, '2026-10-14')['1101'], 950);
  close(r.b['5316'] || 0, 0);
  // جردان في اليوم نفسه (بترتيب المعرّف): الثاني يشمل فرق الأول، وكلاهما مطابق لما حُفظ
  S.cashCounts = [];
  S.purchases = [];
  count('r1', '2026-10-14', 990);
  count('r2', '2026-10-14', 985);
  L = RB.buildLedger(S, '2026-10-31');
  assert.deepEqual(RB.staleCashCounts(S, L), []);
  close(RB.cashCountExpected(S, L, S.cashCounts.find((x) => x.id === 'r2')), 990);
  close(RB.balances(L.entries, null, '2026-10-14')['1101'], 985);
  // جرد في يوم لاحق يشمل فروق ما قبله؛ تعديل الأول يجعل الثاني قديماً حتى يُحفظ
  count('r3', '2026-10-16', 950);
  close(S.cashCounts.find((x) => x.id === 'r3').expected, 955);
  count('r1', '2026-10-14', 980);
  st = RB.staleCashCounts(S, RB.buildLedger(S, '2026-10-31'));
  assert.deepEqual(st.map((x) => x.count.id), ['r2', 'r3']);
  // نقل الجرد لتاريخ لاحق لا يُدخل فرقه القديم في متوقعه
  L = RB.buildLedger(S, '2026-10-31');
  close(RB.cashCountExpected(S, L, { id: 'r1', date: '2026-10-20' }), RB.cashCountExpected(S, L, { id: 'new', date: '2026-10-20' }) - S.cashCounts.find((x) => x.id === 'r1').diff);
});

test('كشف الصندوق: زيادة الصندوق من الجرد آخر يومها بعد مصروفاته، فرصيدها = المعدود (المتبقيات)', () => {
  const S = base();
  S.sales = [{ id: 's', date: '2026-10-14', channels: { cash: { amount: 1000, orders: 10, type: 'cash' } } }];
  S.purchases = [{ id: 'p', date: '2026-10-14', supplier: 'x', category: 'food', account: 'cash', includesVat: true, taxable: false, lines: [{ qty: 1, price: 200 }] }];
  S.cashCounts = [{ id: 'k', date: '2026-10-14', counted: 815, expected: 800, diff: 15 }];
  const st = RB.accountStatement(S, '1101', '2026-10-01', '2026-10-31');
  assert.deepEqual(st.rows.map((r) => r.kind), ['sale', 'purchase', 'cashadj']);
  assert.deepEqual(st.rows.map((r) => r.balance), [1000, 800, 815]);
  // والعجز كذلك آخر يومه
  S.cashCounts = [{ id: 'k', date: '2026-10-14', counted: 790, expected: 800, diff: -10 }];
  assert.deepEqual(RB.accountStatement(S, '1101', '2026-10-01', '2026-10-31').rows.map((r) => r.kind), ['sale', 'purchase', 'cashadj']);
});

test('مخصص نهاية الخدمة الافتتاحي لمطعم قائم: التزام بالموظف يُخصم من حقوق الشركاء، وتُصرف منه المكافأة (المتبقيات)', () => {
  const S = base(); // 60% و40%
  S.employees = [
    { id: 'e1', name: 'سالم', nationality: 'expat', basic: 2500, housing: 0, transport: 0, otherAllow: 500, startDate: '2022-10-01', active: true },
    { id: 'e2', name: 'ماهر', nationality: 'expat', basic: 2000, housing: 0, transport: 0, otherAllow: 0, startDate: '2019-10-01', active: true },
  ];
  // التقدير بنظام العمل: 4 سنوات × نصف أجر = أجر شهرين؛ و7 سنوات = 5 × نصف + 2 × كامل
  close(RB.eosbEarned(3000, '2022-10-01', '2026-10-01'), 6000, 5);
  close(RB.eosbEarned(2000, '2019-10-01', '2026-10-01'), 2000 * (2.5 + 2), 5);
  assert.equal(RB.eosbEarned(3000, '2026-10-05', '2026-10-01'), 0);
  assert.equal(RB.eosbEarned(3000, '', '2026-10-01'), 0);
  S.settings.opening = { date: '2026-10-01', cash: 2000, bank: 30000, apps: {}, payables: [], eosb: [{ employeeId: 'e1', amount: 6000 }, { employeeId: 'e2', amount: 9000 }, { employeeId: '', amount: 0 }] };
  const op = RB.openingInfo(S);
  close(op.eosb, 15000);
  close(op.liab, 15000);
  close(op.net, 17000);
  assert.deepEqual(op.eosbBy, { e1: 6000, e2: 9000 });
  let { L, b } = tbBalanced(S, '2026-10-31');
  close(b['2201'], -15000);
  close(-b['cap:p1'], 10200);
  close(-b['cap:p2'], 6800);
  assert.equal(L.entries.filter((e) => e.kind === 'opening').length, 1);
  assert.deepEqual(RB.eosbBalances(S, '2026-10-01'), { e1: 6000, e2: 9000 });
  assert.deepEqual(RB.eosbBalances(S, '2026-09-30'), {});
  // مسير أكتوبر يضيف استحقاقه للمخصص الافتتاحي (ماهر تجاوز 5 سنوات: أجر شهر ÷ 12)
  const line = (e, extra) => Object.assign(RB.payrollLine(e, S, '2026-10'), extra);
  S.payroll = [{ id: 'w10', month: '2026-10', date: '2026-10-31', account: 'bank', gosiAccount: 'bank', lines: S.employees.map((e) => line(e)) }];
  ({ b } = tbBalanced(S, '2026-10-31'));
  close(b['2201'], -(15000 + 125 + 166.67));
  close(b['5203'], 125 + 166.67);
  const bal = RB.eosbBalances(S, '2026-10-31');
  close(bal.e1, 6125);
  close(bal.e2, 9166.67);
  // سالم يترك العمل في 31 أكتوبر وتُصرف مكافأته كاملة في مسير الشهر: من المخصص، بلا مصروف إضافي ولا رد
  S.employees[0].endDate = '2026-10-31';
  S.employees[0].active = false;
  S.payroll[0].lines[0].eosbPaid = 6125;
  ({ L, b } = tbBalanced(S, '2026-11-30'));
  close(b['5203'], 125 + 166.67);
  close(b['2201'], -9166.67);
  assert.ok(!L.entries.some((e) => e.kind === 'eosb' && e.desc.startsWith('رد')));
  assert.deepEqual(RB.eosbUnsettled(S, '2026-11-30'), []);
  // ماهر يترك العمل بلا مكافأة مستحقة: يُرد مخصصه كله (ومنه الافتتاحي) إلى المصروف
  Object.assign(S.employees[1], { endDate: '2026-10-31', active: false });
  assert.equal(RB.eosbUnsettled(S, '2026-11-30')[0].employee.id, 'e2');
  close(RB.eosbUnsettled(S, '2026-11-30')[0].amount, 9166.67);
  S.employees[1].eosbNone = true;
  ({ b } = tbBalanced(S, '2026-11-30'));
  close(b['2201'] || 0, 0);
  close(b['5203'], 125 + 166.67 - 9166.67);
  // موظف محذوف (بيانات قديمة) له مخصص افتتاحي فقط: يُرد في تاريخ البدء ولا يتوقف الدفتر
  S.employees = S.employees.slice(0, 1);
  S.payroll = [];
  const D = tbBalanced(S, '2026-10-31');
  assert.equal(D.L.errors.length, 0);
  assert.deepEqual(D.L.entries.find((e) => e.kind === 'eosb' && e.desc.startsWith('رد')).ref, { s: 'settings', id: 'opening' });
  // بلا شركاء: لا قيد افتتاحي ولا مخصص منه
  const N = Object.assign({}, S, { partners: [] });
  assert.deepEqual(RB.eosbBalances(N, '2026-10-31'), {});
  // التنظيف: قائمة دائماً، والمعرّف نص؛ وما ليس قائمة أو معرّف موظف غير صالح لا يدخل
  const n = RB.normalize({ settings: { opening: { date: '2026-10-01', eosb: [{ employeeId: 5, amount: 100 }, 'x', { employeeId: '__proto__', amount: 50 }] } } });
  assert.deepEqual(n.settings.opening.eosb, [{ employeeId: '5', amount: 100 }, { employeeId: '__proto__', amount: 50 }]);
  assert.deepEqual(RB.openingInfo(n).eosbBy, { 5: 100 });
  assert.deepEqual(RB.normalize({ settings: { opening: { date: '2026-10-01', eosb: 'x' } } }).settings.opening.eosb, []);
  assert.equal(RB.openingInfo({ settings: { opening: { date: '2026-10-01', cash: 5 } } }).eosb, 0);
});

test('أول يوم رصيده بالسالب في الصندوق أو البنك: في الفترة، ومن تاريخ السجل قبل حفظه (المتبقيات)', () => {
  const S = base();
  S.sales = [
    { id: 's1', date: '2026-07-01', channels: { cash: { amount: 100, orders: 2, type: 'cash' } } },
    { id: 's2', date: '2026-07-05', channels: { cash: { amount: 100, orders: 2, type: 'cash' } } },
  ];
  S.transfers = [{ id: 't1', date: '2026-07-03', from: 'cash', to: 'bank', amount: 150 }];
  const L = RB.buildLedger(S, '2026-12-31');
  // الصندوق: 100 ثم −50 من 3 يوليو حتى 5 يوليو (50)
  assert.deepEqual(RB.firstNegative(L, '1101', '2026-06-01', '2026-12-31'), { date: '2026-07-03', balance: -50, since: '2026-07-03', sinceBalance: -50 });
  assert.deepEqual(RB.firstNegative(L, '1101', '2026-07-04', '2026-12-31'), { date: '2026-07-04', balance: -50, since: '2026-07-03', sinceBalance: -50 });
  assert.equal(RB.firstNegative(L, '1101', '2026-07-05', '2026-12-31'), null);
  assert.equal(RB.firstNegative(L, '1101', '2026-06-01', '2026-07-02'), null);
  assert.equal(RB.firstNegative(L, '1102', '2026-06-01', '2026-12-31'), null);
  // السجل كما في النموذج بدل نسخته المحفوظة: تحويل 100 بدل 150 لا يجعله سالباً، و250 في 6 يوليو يجعله سالباً من يومه
  const draft = (t) => RB.buildLedger(Object.assign(base(), { transfers: [t] }), '9999-12-31').entries;
  const ex = { s: 'transfers', id: 't1' };
  assert.equal(RB.firstNegative(L, '1101', '2026-07-03', '9999-12-31', { except: ex, extra: draft({ id: 't1', date: '2026-07-03', from: 'cash', to: 'bank', amount: 100 }) }), null);
  assert.deepEqual(RB.firstNegative(L, '1101', '2026-07-06', '9999-12-31', { except: ex, extra: draft({ id: 't1', date: '2026-07-06', from: 'cash', to: 'bank', amount: 250 }) }), { date: '2026-07-06', balance: -50, since: '2026-07-06', sinceBalance: -50 });
  // البيانات التجريبية: الصندوق والبنك لا ينزلان عن الصفر في أي يوم (عهدة الصندوق قبل الافتتاح)
  for (const t of ['2026-10-14', '2027-02-03']) {
    const D = RB.demoState(t);
    const DL = RB.buildLedger(D, '9999-12-31');
    for (const acc of ['1101', '1102']) assert.equal(RB.firstNegative(DL, acc, '2000-01-01', t), null, t + ' ' + acc);
    assert.deepEqual(RB.staleCashCounts(D, DL), []);
  }
});

test('أسماء الأقسام بالعربية: لكل قسم اسم، فلا يظهر للمستخدم مفتاح إنجليزي في رسائل الاستيراد (المتبقيات)', () => {
  for (const k of RB.SECTIONS) assert.ok(typeof RB.SECTION_LABELS[k] === 'string' && /[؀-ۿ]/.test(RB.SECTION_LABELS[k]), k);
  assert.deepEqual(Object.keys(RB.SECTION_LABELS).sort(), RB.SECTIONS.slice().sort());
  // أنواع خصومات التطبيقات: اسم مختصر لكل نوع (خيارات القائمة على الجوال)
  for (const k of Object.keys(RB.DED_TYPES)) assert.ok(RB.DED_TYPES[k].short && RB.DED_TYPES[k].short.length <= 24, k);
});

test('ما فشل حفظه في البيانات المشتركة يبقى في الشاشة فوق لقطتها حتى يُحفظ (المتبقيات)', () => {
  const snap = [{ id: 'c1', amount: 1001 }];
  const failedNew = { section: 'capital', id: 'c9', rec: { id: 'c9', amount: 777 } };
  // سجل جديد لم يُحفظ: يبقى، والسجل المحفوظ كما في اللقطة
  assert.deepEqual(RB.withUnsaved('capital', snap, [failedNew]), [{ id: 'c1', amount: 1001 }, { id: 'c9', amount: 777 }]);
  assert.deepEqual(snap, [{ id: 'c1', amount: 1001 }]); // اللقطة نفسها لا تتغير
  // تعديل لم يُحفظ يحل محل نسخته في اللقطة، وحذف لم يُحفظ لا يُعيد السجل
  assert.deepEqual(RB.withUnsaved('capital', snap, [{ section: 'capital', id: 'c1', rec: { id: 'c1', amount: 5 } }]), [{ id: 'c1', amount: 5 }]);
  assert.deepEqual(RB.withUnsaved('capital', snap, [{ section: 'capital', id: 'c1', rec: null }]), []);
  // قسم آخر لا يتأثر، والإعدادات تُستبدل كلها
  assert.equal(RB.withUnsaved('expenses', snap, [failedNew]), snap);
  assert.deepEqual(RB.withUnsaved('settings', { name: 'أ' }, [{ section: 'settings', id: 'settings', rec: { name: 'ب' } }]), { name: 'ب' });
  // نسخة لا مرجع: تعديل الناتج لا يغيّر ما حُفظ للمحاولة
  const out = RB.withUnsaved('capital', [], [failedNew]);
  out[0].amount = 1;
  assert.equal(failedNew.rec.amount, 777);
  assert.equal(RB.withUnsaved('capital', snap, []), snap);
});

test('إعادة حفظ ما فشل حفظه أو حذفه: ما يُعرض فوق اللقطة هو آخر ما أراده المستخدم من بداية الحفظ، وكتابة تلتها أحدث لا يُعتدّ بنتيجتها (المتبقيات 2)', () => {
  const rec = (amount) => ({ section: 'capital', id: 'c9', rec: { id: 'c9', amount } });
  const P = 'capital/c9';
  const u = RB.unsavedWrites();
  const shown = (snap) => RB.withUnsaved('capital', snap, u.values());
  // حفظ عادي لا يدخل السجل ما لم يفشل
  let n = u.start(P, rec(777));
  assert.equal(u.size, 0);
  assert.equal(u.fail(P, n, rec(777)), true);
  assert.deepEqual(shown([]), [{ id: 'c9', amount: 777 }]);
  // إعادة الحفظ بـ 778: لقطتها الفورية (فيها 778) تُعرض بـ 778 لا بالقديمة أثناء الحفظ، ثم يزول بنجاحه
  n = u.start(P, rec(778));
  assert.equal(u.size, 1);
  assert.deepEqual(shown([{ id: 'c9', amount: 778 }]), [{ id: 'c9', amount: 778 }]);
  assert.equal(u.ok(P, n), true);
  assert.equal(u.size, 0);
  assert.deepEqual(shown([{ id: 'c9', amount: 778 }]), [{ id: 'c9', amount: 778 }]);
  // سجل جديد فشل حفظه ثم حُذف: لا يعود إلى الشاشة أثناء الحذف ولا بعده
  n = u.start(P, rec(555));
  u.fail(P, n, rec(555));
  n = u.start(P, { section: 'capital', id: 'c9', rec: null });
  assert.deepEqual(shown([]), []);
  assert.deepEqual(shown([{ id: 'c1', amount: 1 }]), [{ id: 'c1', amount: 1 }]);
  assert.equal(u.ok(P, n), true);
  assert.equal(u.size, 0);
  // كتابة أحدث بدأت قبل أن يفشل ما قبلها: فشل القديمة لا يُعيد قيمتها، والأحدث تقرر
  const a = u.start(P, rec(1));
  const b = u.start(P, rec(2));
  assert.equal(u.fail(P, a, rec(1)), false);
  assert.equal(u.size, 0);
  assert.equal(u.ok(P, b), true);
  assert.equal(u.size, 0);
  const c = u.start(P, rec(3));
  const d = u.start(P, rec(4));
  u.fail(P, c, rec(3));
  assert.equal(u.fail(P, d, rec(4)), true);
  assert.deepEqual(shown([]), [{ id: 'c9', amount: 4 }]);
  // والمستند فاشل الحفظ: كتابتان بعده، نجاح الأولى لا يُزيله والمعروض الأحدث حتى تنتهي الثانية
  const e = u.start(P, rec(5));
  const f = u.start(P, rec(6));
  assert.equal(u.ok(P, e), false);
  assert.deepEqual(shown([{ id: 'c9', amount: 5 }]), [{ id: 'c9', amount: 6 }]);
  assert.equal(u.ok(P, f), true);
  assert.equal(u.size, 0);
  // رقم كتابة انتهت لا يطابق كتابة بدأت بعدها للمستند نفسه، ومستند آخر لا يتأثر
  const g = u.start(P, rec(7));
  u.ok(P, g);
  const h = u.start(P, rec(8));
  assert.equal(u.ok(P, g), false);
  assert.equal(u.fail(P, h, rec(8)), true);
  const o = u.start('capital/c1', { section: 'capital', id: 'c1', rec: { id: 'c1', amount: 9 } });
  u.ok('capital/c1', o);
  assert.equal(u.has(P), true);
  assert.equal(u.has('capital/c1'), false);
  u.clear();
  assert.equal(u.size, 0);
});

test('ما يُحفظ الآن يُعرض فوق اللقطات أثناء إعادة المحاولة التلقائية ولا يُعد فشلاً، وما فشل حفظه أو حذفه يُعاد بـ «أعد المحاولة» (المتبقيات 3)', () => {
  const rec = (id, amount) => ({ section: 'capital', id, rec: { id, amount } });
  const P = 'capital/c1';
  const u = RB.unsavedWrites();
  const shown = (snap) => RB.withUnsaved('capital', snap, u.values());
  const amounts = (list) => Object.fromEntries(list.map((x) => [x.id, x.amount]));
  const server = [{ id: 'c1', amount: 1000 }, { id: 'c2', amount: 2000 }];
  // تعديل 1000 → 1500 جارٍ: لقطة بعد محاولة رفضها الخادم (المنصة أسقطت الكتابة المحلية فعادت القيمة القديمة) تُعرض
  // بـ 1500، والحالة ليست فشلاً (الأحمر للفشل وحده)
  let n = u.start(P, rec('c1', 1500));
  assert.equal(u.size, 0);
  assert.equal(u.busy(P), true);
  assert.deepEqual(amounts(shown(server)), { c1: 1500, c2: 2000 });
  // الإعدادات كذلك: الاسم الجديد يبقى أثناء إعادة المحاولة
  const s = u.start('config/settings', { section: 'settings', id: 'settings', rec: { name: 'اسم جديد' } });
  assert.deepEqual(RB.withUnsaved('settings', { name: 'سحابي' }, u.values()), { name: 'اسم جديد' });
  // فشل نهائي: يبقى معروضاً ويُعد فشلاً، ويُعاد من «أعد المحاولة»
  assert.equal(u.fail(P, n, rec('c1', 1500)), true);
  assert.equal(u.size, 1);
  assert.equal(u.busy(P), false);
  assert.deepEqual(amounts(shown(server)), { c1: 1500, c2: 2000 });
  assert.deepEqual(u.failed(), [{ path: P, keep: rec('c1', 1500) }]);
  // نجاح الإعدادات: لا يبقى منها شيء فوق اللقطات
  assert.equal(u.ok('config/settings', s), true);
  assert.deepEqual(RB.withUnsaved('settings', { name: 'اسم جديد' }, u.values()), { name: 'اسم جديد' });
  assert.equal(u.values().length, 1);
  // إعادة المحاولة جارية: لا تُعاد مرة ثانية (failed فارغة) والحالة حمراء حتى تنتهي، ثم تزول بنجاحها
  n = u.start(P, rec('c1', 1500));
  assert.deepEqual(u.failed(), []);
  assert.equal(u.size, 1);
  assert.equal(u.ok(P, n), true);
  assert.equal(u.size, 0);
  assert.deepEqual(u.values(), []);
  assert.deepEqual(amounts(shown([{ id: 'c1', amount: 1500 }])), { c1: 1500 });
  // سجل جديد جارٍ حفظه يظهر ولو لم تحمله اللقطة، وحذف جارٍ لا يُعيده
  n = u.start('capital/c9', rec('c9', 777));
  assert.deepEqual(amounts(shown(server)), { c1: 1000, c2: 2000, c9: 777 });
  u.ok('capital/c9', n);
  // حذف فشل: السجل مخفي فلا يمكن فتحه وحذفه ثانية، فيبقى في failed حتى تنجح إعادة المحاولة
  n = u.start(P, { section: 'capital', id: 'c1', rec: null });
  assert.deepEqual(amounts(shown(server)), { c2: 2000 });
  u.fail(P, n, { section: 'capital', id: 'c1', rec: null });
  assert.deepEqual(amounts(shown(server)), { c2: 2000 });
  assert.deepEqual(u.failed(), [{ path: P, keep: { section: 'capital', id: 'c1', rec: null } }]);
  // كتابة لاحقة ناجحة لمستند آخر لا تُزيله
  n = u.start('capital/c2', rec('c2', 2200));
  u.ok('capital/c2', n);
  assert.equal(u.size, 1);
  n = u.start(P, u.failed()[0].keep);
  assert.deepEqual(amounts(shown(server)), { c2: 2000 });
  assert.equal(u.ok(P, n), true);
  assert.equal(u.size, 0);
  // كتابتان للمستند نفسه: فشل الأقدم لا يُعرض فوق الأحدث الجارية، والأحدث هي المعروضة
  const a = u.start(P, rec('c1', 1));
  const b = u.start(P, rec('c1', 2));
  assert.equal(u.fail(P, a, rec('c1', 1)), false);
  assert.deepEqual(amounts(shown(server)), { c1: 2, c2: 2000 });
  assert.equal(u.size, 0);
  assert.equal(u.ok(P, b), true);
  assert.deepEqual(u.values(), []);
  // رفض لا يُحتفظ به (عرض فقط): يزول الجاري والفاشل للمستند فتعود الشاشة للبيانات المشتركة
  n = u.start(P, rec('c1', 5));
  u.fail(P, n, rec('c1', 5));
  n = u.start(P, rec('c1', 6));
  assert.equal(u.discard(P, n), true);
  assert.equal(u.size, 0);
  assert.deepEqual(shown(server), server);
  // discard لكتابة تلتها أحدث لا يمس الأحدث
  const c = u.start(P, rec('c1', 7));
  const d = u.start(P, rec('c1', 8));
  assert.equal(u.discard(P, c), false);
  assert.deepEqual(amounts(shown(server)), { c1: 8, c2: 2000 });
  u.ok(P, d);
});

test('تنبيه الرصيد السالب: الجاري منذ بداية هذا السالب لا أول سالب سابق في الفترة عاد بعده موجباً (المتبقيات 2)', () => {
  const S = RB.emptyState();
  Object.assign(S.settings, { vatRegistered: false, openingDate: '2026-01-01' });
  S.partners = [{ id: 'p1', name: 'أ', share: 100 }];
  S.settings.opening = { date: '2026-09-01', cash: 100, bank: 5000, inventory: 0, vatCredit: 0, apps: {}, payables: [], eosb: [] };
  const ex = (id, date, amount) => S.expenses.push({ id, date, category: 'utilities', desc: 'x', amount, includesVat: true, taxable: true, account: 'cash', months: 1 });
  ex('x1', '2026-09-10', 300); // −200
  S.transfers.push({ id: 't1', date: '2026-09-20', from: 'bank', to: 'cash', amount: 1000 }); // +800
  ex('x2', '2026-10-10', 1000); // −200 حتى اليوم
  const L = RB.buildLedger(S, '9999-12-31');
  // بالسالب اليوم منذ 10 أكتوبر، لا منذ 10 سبتمبر (عاد موجباً من 20 سبتمبر)
  assert.deepEqual(RB.negativeAlert(L, '1101', '2026-10-15', 60), { now: true, since: '2026-10-10', balance: -200, sinceBalance: -200 });
  // سالب جارٍ بدأ قبل الفترة: من بدايته
  assert.deepEqual(RB.negativeAlert(L, '1101', '2027-02-01', 60), { now: true, since: '2026-10-10', balance: -200, sinceBalance: -200 });
  assert.deepEqual(RB.negativeAlert(L, '1101', '2026-09-15', 60), { now: true, since: '2026-09-10', balance: -200, sinceBalance: -200 });
  // موجب اليوم: أول سالب سابق في الفترة، أو لا شيء إن كان قبلها
  assert.deepEqual(RB.negativeAlert(L, '1101', '2026-10-05', 60), { now: false, since: '2026-09-10', balance: -200, sinceBalance: -200 });
  assert.equal(RB.negativeAlert(L, '1101', '2026-10-05', 10), null);
  assert.equal(RB.negativeAlert(L, '1102', '2026-10-15', 60), null);
});

test('حفظ الإعدادات يكتب المفاتيح التي غيّرها فقط فوق أحدث نسخة: لا تمحو نسخة قديمة أرصدة الشريك الافتتاحية وقنواته (السحابة، الجولة 1)', () => {
  // أحدث نسخة مشتركة: الشريك أدخل الأرصدة الافتتاحية وأضاف قناة
  const server = { name: 'برقر', city: '', opening: { date: '2026-08-01', cash: 50000 }, channels: [{ id: 'cash' }, { id: 'toyou' }], closedDays: [] };
  // نسخة هذا الجهاز أقدم (بلا أرصدة ولا القناة الجديدة) وفيها تعديله: المدينة، و«إخفاء» خطوات البداية
  const mine = { name: 'برقر', city: 'الرياض', opening: null, channels: [{ id: 'cash' }], closedDays: [], setupDone: true };
  const out = RB.settingsWith(server, mine, ['city', 'reviewedAt']);
  assert.equal(out.city, 'الرياض');
  assert.deepEqual(out.opening, server.opening);
  assert.equal(out.channels.length, 2);
  // مفتاح غير موجود في النسخة المحفوظة يُحذف (لا undefined)، ومفتاح null يُكتب null
  assert.equal('reviewedAt' in out, false);
  assert.equal(RB.settingsWith(server, mine, ['opening']).opening, null);
  assert.equal(RB.settingsWith(server, mine, ['setupDone']).setupDone, true);
  // لا تُعدَّل النسختان، ولا تُكتب خصائص النموذج الأولي
  assert.deepEqual(server.channels.length, 2);
  assert.equal(RB.settingsWith(server, mine, ['__proto__', 'city']).city, 'الرياض');
  assert.equal({}.polluted, undefined);
  // بلا مفاتيح، أو لا نسخة محفوظة: الإعدادات كلها
  assert.deepEqual(RB.settingsWith(server, mine), mine);
  assert.deepEqual(RB.settingsWith(null, mine, ['city']), mine);
  // مفاتيح حفظ سابق يجري أو فشل تدخل في الحفظ التالي (لا يضيع ما غيّره إن فشل)، وحفظ سابق للإعدادات كلها يجعله كلها
  assert.deepEqual(RB.settingsKeys([{ keys: ['opening'] }, { keys: ['channels', 'reviewedAt'] }], ['setupDone']).sort(), ['channels', 'opening', 'reviewedAt', 'setupDone']);
  assert.deepEqual(RB.settingsKeys([], ['closedDays']), ['closedDays']);
  assert.equal(RB.settingsKeys([{ rec: {} }], ['closedDays']), undefined);
  assert.equal(RB.settingsKeys([{ keys: ['opening'] }], undefined), undefined);
  // ما يُحفظ الآن يُعرض فوق اللقطة بمفاتيحه فقط: أرصدة الشريك تظهر مع «إخفاء» هذا الجهاز
  const shown = RB.withUnsaved('settings', server, [{ section: 'settings', id: 'settings', rec: mine, keys: ['setupDone'] }]);
  assert.equal(shown.setupDone, true);
  assert.deepEqual(shown.opening, server.opening);
  assert.equal(server.setupDone, undefined);
  const u = RB.unsavedWrites();
  const P = 'config/settings';
  const n = u.start(P, { section: 'settings', id: 'settings', rec: mine, keys: ['opening'] });
  assert.deepEqual(u.keeps(P).map((k) => k.keys), [['opening']]);
  u.fail(P, n, { section: 'settings', id: 'settings', rec: mine, keys: ['opening'] });
  assert.deepEqual(u.keeps(P).map((k) => k.keys), [['opening']]);
  assert.deepEqual(RB.settingsKeys(u.keeps(P), ['setupDone']), ['setupDone', 'opening']);
  assert.deepEqual(u.keeps('expenses/x'), []);
});

test('تعديل سجل عدّله الشريك بعد فتح النموذج: ما غيّره المستخدم وحده فوق أحدث نسخة، ويُسأل عن الحقل الذي غيّراه كلاهما (السحابة، الجولة 1)', () => {
  const orig = { id: 'x1', date: '2026-08-01', desc: 'إيجار', amount: 30000, account: 'bank' };
  // النموذج يُفتح بحقول مؤقتة (لا تُحفظ) وبترتيب مفاتيح آخر
  const start = { amount: 30000, id: 'x1', desc: 'إيجار', date: '2026-08-01', account: 'bank', preset: '' };
  const cur = { id: 'x1', date: '2026-08-01', desc: 'إيجار', amount: 34500, account: 'bank', _bad: undefined };
  // المستخدم غيّر البيان، والشريك المبلغ: لا تعارض، ويبقى مبلغ الشريك
  let r = RB.editMerge(orig, start, Object.assign({}, start, { desc: 'إيجار المحل — أغسطس' }), cur);
  assert.deepEqual(r.clash, []);
  assert.equal(r.rec.amount, 34500);
  assert.equal(r.rec.desc, 'إيجار المحل — أغسطس');
  assert.equal('preset' in r.rec, false);
  // كلاهما غيّر المبلغ إلى قيمتين مختلفتين: تعارض يُسأل عنه، وما في النموذج هو ما يُحفظ فيه إن وافق
  r = RB.editMerge(orig, start, Object.assign({}, start, { amount: 31000 }), cur);
  assert.deepEqual(r.clash, ['amount']);
  assert.equal(r.rec.amount, 31000);
  // إلى القيمة نفسها: لا تعارض
  assert.deepEqual(RB.editMerge(orig, start, Object.assign({}, start, { amount: 34500 }), cur).clash, []);
  // لم يغيّر المستخدم شيئاً: نسخة الشريك كما هي
  assert.deepEqual(RB.editMerge(orig, start, Object.assign({}, start), cur).rec, { id: 'x1', date: '2026-08-01', desc: 'إيجار', amount: 34500, account: 'bank' });
  // حقل حذفه المستخدم من النموذج يُحذف
  assert.equal('account' in RB.editMerge(orig, start, { id: 'x1', amount: 30000, desc: 'إيجار', date: '2026-08-01', preset: '' }, cur).rec, false);
  // المقارنة لا تتأثر بترتيب المفاتيح ولا بعلامة _bad
  assert.equal(RB.sameRec({ a: 1, b: { c: 2, d: [1, { e: 1, f: 2 }] } }, { b: { d: [1, { f: 2, e: 1 }], c: 2 }, a: 1, _bad: ['date'] }), true);
  assert.equal(RB.sameRec({ a: 1 }, { a: 2 }), false);
  assert.equal(RB.sameRec({ a: [1, 2] }, { a: [2, 1] }), false);
});

// ───────────── مراجعة المحاسبة (الجولة 2) ─────────────

test('نسب الشركاء بتاريخ سريانها: تغييرها لا يعيد توزيع ما قبله، والشريك الخارج تُسوّى حقوقه ثم نسبته صفر (الجولة 2)', () => {
  const mk = () => {
    const S = RB.emptyState();
    S.settings.vatRegistered = false;
    S.partners = [{ id: 'p1', name: 'أحمد', share: 50 }, { id: 'p2', name: 'خالد', share: 50 }];
    S.settings.opening = { date: '2025-01-01', cash: 0, bank: 100000, inventory: 0, vatCredit: 0, vatPayable: 0, vatCurrent: 0, apps: {}, payables: [], eosb: [] };
    S.assets = [{ id: 'a1', date: '2025-01-01', name: 'معدات قائمة', category: 'kitchen', amount: 12000, account: 'opening', lifeMonths: 0, salvage: 0 }];
    S.sales = [
      { id: 's1', date: '2025-06-30', channels: { cash: { amount: 60000, orders: 1, type: 'cash', feePct: 0, feeVat: false } } },
      { id: 's2', date: '2026-03-31', channels: { cash: { amount: 10000, orders: 1, type: 'cash', feePct: 0, feeVat: false } } },
    ];
    return S;
  };
  const eqOf = (S, from, to) => {
    const r = RB.partnersReport(S, from, to);
    return Object.fromEntries(r.rows.map((x) => [x.id, [x.contributed, x.profitPeriod, x.profitAll, x.equity, x.undistributed]]));
  };
  const S = mk();
  const before25 = eqOf(S, '2025-01-01', '2025-12-31');
  assert.deepEqual(before25, { p1: [56000, 30000, 30000, 86000, 30000], p2: [56000, 30000, 30000, 86000, 30000] });
  const openBefore = RB.buildLedger(S, '2025-12-31').entries.filter((e) => e.kind === 'opening').map((e) => e.lines);
  // من 2026: 80/20
  S.partners = [RB.shareFrom(S.partners[0], 80, '2026-01-01'), RB.shareFrom(S.partners[1], 20, '2026-01-01')];
  assert.deepEqual(S.partners[0].shareHist, [{ until: '2025-12-31', share: 50 }]);
  assert.equal(RB.shareAt(S.partners[1], '2025-12-31'), 50);
  assert.equal(RB.shareAt(S.partners[1], '2026-01-01'), 20);
  assert.equal(RB.shareAt(S.partners[1]), 20);
  // 2025 كما كان (الأرصدة الافتتاحية والأصل القائم وأرباح السنة)، و2026 بالنسب الجديدة
  assert.deepEqual(eqOf(S, '2025-01-01', '2025-12-31'), before25);
  assert.deepEqual(RB.buildLedger(S, '2025-12-31').entries.filter((e) => e.kind === 'opening').map((e) => e.lines), openBefore);
  const y26 = eqOf(S, '2026-01-01', '2026-12-31');
  assert.deepEqual([y26.p1[1], y26.p2[1]], [8000, 2000]);
  assert.deepEqual([y26.p1[2], y26.p2[2]], [38000, 32000]);
  // فترة تعبر تاريخ التغيير: كل جزء بنسبه، ومجموع الحقوق = حقوق الشركاء في الميزانية
  const span = RB.partnersReport(S, '2025-06-01', '2026-12-31');
  assert.deepEqual(span.rows.map((r) => r.profitPeriod), [38000, 32000]);
  assert.deepEqual(span.rows.map((r) => r.sharePct), [80, 20]);
  close(RB.sum(span.rows, (r) => r.equity), RB.balanceSheet(S, '2026-12-31').tEq);
  // إعادة النسبة كما كانت من التاريخ نفسه تُلغي تاريخ النسب؛ وبلا تاريخ = تصحيح لكل الفترات
  assert.equal(RB.shareFrom(S.partners[0], 50, '2026-01-01').shareHist, undefined);
  assert.equal(RB.shareFrom(S.partners[0], 70, '').shareHist, undefined);
  // تغيير ثانٍ قبل الأول يقطع ما بعده
  const p = RB.shareFrom(S.partners[0], 60, '2025-07-01');
  assert.deepEqual([p.share, p.shareHist], [60, [{ until: '2025-06-30', share: 50 }]]);
  // شريك جديد دخل من يوليو 2026: لا شيء له قبل ذلك
  assert.deepEqual(RB.shareFrom({ id: 'p3', name: 'ج', share: 0 }, 30, '2026-07-01').shareHist, [{ until: '2026-06-30', share: 0 }]);

  // خروج خالد آخر 2025: تُدفع حقوقه (86,000) سحباً، ثم نسبته صفر من 2026 — حقوقه صفر ولا تنتقل أرباح 2025 لأحمد
  const X = mk();
  X.capital = [{ id: 'w', date: '2026-01-01', partnerId: 'p2', type: 'withdrawal', account: 'bank', amount: 86000 }];
  X.partners = [RB.shareFrom(X.partners[0], 100, '2026-01-01'), RB.shareFrom(X.partners[1], 0, '2026-01-01')];
  const xr = RB.partnersReport(X, '2026-01-01', '2026-12-31');
  assert.deepEqual(xr.rows.map((r) => [r.equity, r.undistributed]), [[96000, 40000], [0, -56000]]);
  close(RB.sum(xr.rows, (r) => r.equity), RB.balanceSheet(X, '2026-12-31').tEq);
  // أو اشترى أحمد حصته من ماله: نقل الحقوق لا يحرك البنك، وحقوق خالد صفر
  const T = mk();
  T.capital = [{ id: 'tr', date: '2026-01-01', partnerId: 'p2', toPartnerId: 'p1', type: 'transfer', amount: 86000 }];
  T.partners = [RB.shareFrom(T.partners[0], 100, '2026-01-01'), RB.shareFrom(T.partners[1], 0, '2026-01-01')];
  const LT = RB.buildLedger(T, '2026-12-31');
  assert.equal(LT.errors.length, 0);
  assert.equal(RB.balances(LT.entries, null, '2026-12-31')['1102'], 100000);
  const tr = RB.partnersReport(T, '2026-01-01', '2026-12-31', LT);
  // النقل ليس إيداعاً ولا سحباً: رأس مال خالد كله (56,000) صار لأحمد، والباقي (30,000) نصيبه من أرباح 2025
  assert.deepEqual(tr.rows.map((r) => [r.contributed, r.drawings, r.equity]), [[112000, 0, 182000], [0, 0, 0]]);
  assert.deepEqual(tr.moves.map((m) => [m.from, m.to, m.amount, m.capital, m.profit]), [['p2', 'p1', 86000, 56000, 30000]]);
  assert.ok(RB.partnerUsed(T, 'p1'));
  // الأرباح المتاحة للسحب لأحمد: نصيبه من أرباح 2025 (30,000) و2026 كلها (10,000) وأرباح خالد التي اشتراها (30,000)
  assert.equal(tr.rows[0].undistributed, 70000);
  assert.equal(tr.undistributedTotal, 70000);
  // ولا فرق في رأس المال: المطلوب منه 100% من 112,000، وخالد خارج بلا حقوق
  assert.deepEqual([tr.totalCap, tr.rows[0].required, tr.rows[0].diff, tr.rows[1].out, tr.rows[1].diff], [112000, 112000, 0, true, 0]);
  // وكذلك لو دفع المطعم حقوقه: ما سُحب من رأس ماله لا يبقى مطلوباً من أحمد
  assert.deepEqual([xr.totalCap, xr.rows[0].required, xr.rows[0].diff, xr.rows[1].out, xr.rows[1].diff], [56000, 56000, 0, true, 0]);
  // بلا تاريخ نسب: كما كان (النسب الحالية في كل الأيام)
  const plain = mk();
  plain.partners[0].share = 80;
  plain.partners[1].share = 20;
  assert.deepEqual(eqOf(plain, '2025-01-01', '2025-12-31').p1, [89600, 48000, 48000, 137600, 48000]);
  // فرق التقريب لآخر شريك له نسبة في ذلك التاريخ (لا لآخر الشركاء إن كانت نسبته صفراً)
  const R = mk();
  R.partners = [{ id: 'p1', name: 'أ', share: 1 }, { id: 'p2', name: 'ب', share: 2 }, { id: 'p3', name: 'ج', share: 0 }];
  assert.deepEqual(RB.openingShares(R, 100, '2025-01-01').map((x) => x.amount), [33.33, 66.67, 0]);
});

test('نقل الحقوق بين الشركاء ينقل رأس المال: المطلوب حسب النسبة والفرق لا يحسبان المنقول مرتين (audit-r2)', () => {
  const mk = (a, b) => {
    const S = RB.emptyState();
    S.settings.vatRegistered = false;
    S.settings.openingDate = '2026-08-01';
    S.partners = [{ id: 'a', name: 'أحمد', share: a }, { id: 'b', name: 'سالم', share: b }];
    S.capital = [
      { id: 'ca', date: '2026-08-01', partnerId: 'a', type: 'contribution', account: 'bank', amount: a * 1000 },
      { id: 'cb', date: '2026-08-01', partnerId: 'b', type: 'contribution', account: 'bank', amount: b * 1000 },
    ];
    return S;
  };
  const sale = (S, amount) => S.sales.push({ id: 's' + S.sales.length, date: '2026-08-10', channels: { cash: { amount, orders: 1, type: 'cash', feePct: 0, feeVat: false } } });
  const shares = (S, a, b) => (S.partners = [RB.shareFrom(S.partners[0], a, '2026-09-01'), RB.shareFrom(S.partners[1], b, '2026-09-01')]);
  const move = (S, from, to, amount) => S.capital.push({ id: 't' + S.capital.length, date: '2026-09-01', partnerId: from, toPartnerId: to, type: 'transfer', amount });
  const rep = (S) => {
    const p = RB.partnersReport(S, '2026-08-01', '2026-12-31');
    const tot = (f) => RB.r2(RB.sum(p.rows, f));
    // الأسطر تجمع إلى رأس المال المطلوب والأرباح المتراكمة والمتاح للسحب وحقوق الشركاء في الميزانية
    assert.equal(tot((r) => r.required), p.totalCap);
    assert.equal(tot((r) => r.profitAll), p.retained);
    assert.equal(tot((r) => r.undistributed), p.undistributedTotal);
    assert.equal(tot((r) => r.equity), RB.balanceSheet(S, '2026-12-31').tEq);
    for (const r of p.rows) close(r.equity, RB.r2(r.contributed - r.drawings + r.profitAll));
    return p;
  };
  const cols = (p) => p.rows.map((r) => [r.contributed, r.required, r.diff, r.drawings, r.undistributed, r.equity, r.out]);

  // خروج سالم كما يصفه البرنامج: 50,000 لكل منهما، ربح 10,000 في أغسطس، نسبته 0 وأحمد 100% من سبتمبر، ونقل حقوقه كلها
  // (55,000) لأحمد. رأس المال 100,000 كله لأحمد ولا «ناقص»، وأرباح أغسطس كلها متاحة له، وسالم خارج بلا مطلوب ولا فرق
  const X = mk(50, 50);
  sale(X, 10000);
  shares(X, 100, 0);
  const eqB = RB.partnersReport(X, '2026-08-31', '2026-08-31').rows[1].equity;
  assert.equal(eqB, 55000);
  move(X, 'b', 'a', eqB);
  const x = rep(X);
  assert.equal(x.totalCap, 100000);
  assert.deepEqual(cols(x), [[100000, 100000, 0, 0, 10000, 110000, false], [0, 0, 0, 0, 0, 0, true]]);
  assert.deepEqual(x.rows.map((r) => [r.capIn, r.capOut, r.profitIn, r.profitOut]), [[50000, 0, 5000, 0], [0, 50000, 0, 5000]]);
  assert.equal(x.undistributedTotal, 10000);
  // قبل النقل كما كان: لكل منهما رأس ماله وأرباحه
  assert.deepEqual(cols(RB.partnersReport(X, '2026-08-01', '2026-08-31')), [[50000, 50000, 0, 0, 5000, 55000, false], [50000, 50000, 0, 0, 5000, 55000, false]]);
  // الخروج قبل النقل: سالم بنسبة 0 وله حقوقه كلها، فرأس ماله باقٍ في المطعم وزيادة له والنقص على أحمد حتى تُسوّى
  const Y = mk(50, 50);
  sale(Y, 10000);
  shares(Y, 100, 0);
  assert.deepEqual(cols(rep(Y)), [[50000, 100000, -50000, 0, 5000, 55000, false], [50000, 0, 50000, 0, 5000, 55000, false]]);

  // إعادة التوازن من 60/40 إلى 50/50 بنقل 10,000 من أحمد إلى سالم: 50,000 لكل منهما ولا فرق
  const R = mk(60, 40);
  shares(R, 50, 50);
  move(R, 'a', 'b', 10000);
  const r = rep(R);
  assert.equal(r.totalCap, 100000);
  assert.deepEqual(cols(r), [[50000, 50000, 0, 0, 0, 50000, false], [50000, 50000, 0, 0, 0, 50000, false]]);
  // ومع ربح قبل التغيير يبقى بنسبه السابقة (6,000 و4,000): النقل من رأس المال أولاً، فلا فرق في رأس المال
  sale(R, 10000);
  assert.deepEqual(cols(rep(R)), [[50000, 50000, 0, 0, 6000, 56000, false], [50000, 50000, 0, 0, 4000, 54000, false]]);
  // ونقل حقوق أكثر من رأس ماله: الزائد من نصيبه من الأرباح
  R.capital.pop();
  move(R, 'a', 'b', 61000);
  const r2 = rep(R);
  assert.deepEqual(r2.moves.map((m) => [m.capital, m.profit]), [[60000, 1000]]);
  assert.deepEqual(cols(r2), [[0, 50000, -50000, 0, 5000, 5000, false], [100000, 50000, 50000, 0, 5000, 105000, false]]);

  // من سحب أكثر من نصيبه من الأرباح ثم خرج بنقل حقوقه كلها (40,000): رأس ماله كله يُنقل ومعه ما سحبه زيادة على أرباحه
  const O = mk(50, 50);
  O.capital.push({ id: 'w', date: '2026-08-15', partnerId: 'b', type: 'withdrawal', account: 'bank', amount: 10000 });
  shares(O, 100, 0);
  move(O, 'b', 'a', 40000);
  const o = rep(O);
  assert.deepEqual(o.moves.map((m) => [m.capital, m.profit]), [[50000, -10000]]);
  assert.deepEqual(cols(o), [[100000, 100000, 0, 0, -10000, 90000, false], [0, 0, 0, 10000, 0, 0, true]]);
  // ونقل نصف حقوقه (20,000) ينقل نصف رأس ماله
  O.capital.pop();
  move(O, 'b', 'a', 20000);
  assert.deepEqual(rep(O).moves.map((m) => [m.capital, m.profit]), [[25000, -5000]]);

  // شريك خرج ودُفع له جزء من حقوقه: يُحسب له من رأس المال ما بقي من حقوقه فقط
  const P = mk(50, 50);
  sale(P, 10000);
  shares(P, 100, 0);
  P.capital.push({ id: 'w', date: '2026-09-01', partnerId: 'b', type: 'withdrawal', account: 'bank', amount: 30000 });
  const pp = rep(P);
  assert.equal(pp.totalCap, 75000);
  assert.deepEqual(cols(pp), [[50000, 75000, -25000, 0, 5000, 55000, false], [50000, 0, 25000, 30000, -25000, 25000, false]]);
});

test('مخصص نهاية الخدمة على الأجر الأخير: الزيادة تضيف الفرق عن الخدمة السابقة، والتخفيض ينقصه (الجولة 2)', () => {
  const S = RB.emptyState();
  S.settings.vatRegistered = false;
  S.partners = [{ id: 'p1', name: 'أحمد', share: 100 }];
  const e = { id: 'e1', name: 'عامل', nationality: 'expat', basic: 4000, housing: 0, transport: 0, otherAllow: 0, startDate: '2023-01-01', active: true };
  S.employees = [e];
  S.capital = [{ id: 'c1', date: '2023-01-01', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 500000 }];
  let n = 0;
  const pay = (ym) => {
    const lines = RB.payrollFill(S, ym, [], ym, RB.monthEnd(ym)).map((l) => (delete l._autoDed, delete l._autoAdv, l));
    S.payroll.push({ id: 'w' + ++n, month: ym, date: RB.monthEnd(ym), account: 'bank', gosiAccount: 'bank', lines });
  };
  for (let ym = '2023-01'; ym <= '2025-12'; ym = RB.ymAdd(ym, 1)) {
    if (ym === '2025-07') e.basic = 6000;
    pay(ym);
  }
  const acc = RB.eosbEvents(S).filter((x) => x.kind === 'accrual');
  // يوليو 2025: شهره بالأجر الجديد (250) + الفرق عن 30 شهراً سابقة (2,000 × 30 ÷ 24 = 2,500)
  assert.equal(acc.find((x) => x.ym === '2025-07').total, 2750);
  assert.equal(acc.find((x) => x.ym === '2025-08').total, 250);
  const prov = RB.eosbBalances(S, '2025-12-31').e1;
  assert.equal(prov, 9000);
  close(prov, RB.eosbEarned(6000, '2023-01-01', '2026-01-01'), 3);
  close(-RB.balances(RB.buildLedger(S, '2025-12-31').entries, null, '2025-12-31')['2201'], 9000);
  // المكافأة بنظام العمل على الأجر الأخير: كاملة، وعند الاستقالة ثلثها (خدمة 3 سنوات)
  assert.equal(RB.lastWage(S, 'e1'), 6000);
  const aw = RB.eosbAward(6000, '2023-01-01', '2025-12-31');
  assert.equal(aw.full, 9002.05);
  assert.equal(aw.resign, 3000.68);
  assert.deepEqual([RB.eosbAward(5000, '2024-06-01', '2025-12-31').resign, RB.eosbAward(5000, '2015-01-01', '2025-12-31').frac], [0, 1]);
  close(RB.eosbAward(5000, '2019-01-01', '2025-12-31').frac, 2 / 3, 1e-9);
  // تسوية بالمكافأة الكاملة بعد ترك العمل: الفرق عن المخصص (نظام 30 يوماً) أقل من 3 ريالات، ومسير التسوية بلا أجر لا يرد شيئاً
  e.endDate = '2025-12-31';
  e.active = false;
  S.payroll.push({ id: 'set', month: '2026-01', date: '2026-01-05', account: 'bank', gosiAccount: 'bank', lines: [{ employeeId: 'e1', name: 'عامل', basic: 0, housing: 0, allowances: 0, additions: 0, deductions: 0, gosiEe: 0, gosiEr: 0, eosbPaid: aw.full, advance: 0 }] });
  const evs = RB.eosbEvents(S);
  assert.equal(evs.filter((x) => x.kind === 'accrual' && x.ym === '2026-01').length, 0);
  const po = evs.find((x) => x.kind === 'payout');
  assert.deepEqual([po.fromProv, po.excess], [9000, 2.05]);
  close(RB.incomeStatement(S, '2026-01-01', '2026-01-31').tot.labor, 2.05);
  // تخفيض الأجر: المخصص على الأجر الأخير ينقص (استحقاق بالسالب، قيد مدين 2201 دائن 5203)
  const C = RB.emptyState();
  C.partners = [{ id: 'p1', name: 'أ', share: 100 }];
  const c = { id: 'e1', name: 'عامل', nationality: 'expat', basic: 4800, startDate: '2024-01-01', active: true };
  C.employees = [c];
  const run = (ym, basic) => ({ id: 'w' + ym, month: ym, date: RB.monthEnd(ym), account: 'bank', gosiAccount: 'bank', lines: [Object.assign(RB.payrollLine(c, C, ym), { basic })] });
  C.payroll = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06'].map((ym) => run(ym, 4800));
  C.payroll.push(run('2024-07', 2400));
  const cut = RB.eosbEvents(C).filter((x) => x.kind === 'accrual').pop();
  assert.equal(cut.total, -500); // 2,400 × 7 ÷ 24 = 700 − 1,200
  assert.equal(RB.eosbBalances(C, '2024-07-31').e1, 700);
  const ent = RB.buildLedger(C, '2024-07-31').entries.filter((x) => x.kind === 'eosb').pop();
  assert.deepEqual(ent.lines.map((l) => [l.a, l.v]), [['5203', -500], ['2201', 500]]);
});

test('جرد قبل بدء الدفتر لا يُقيَّد فوق المخزون الافتتاحي (الجولة 2)', () => {
  const mk = (inv, countDate) => {
    const S = base();
    S.settings.vatRegistered = false;
    S.raw = [{ id: 'm', name: 'لحم', price: 1, taxable: false }];
    S.settings.opening = { date: '2026-01-01', cash: 0, bank: 50000, inventory: inv, vatCredit: 0, apps: {}, payables: [], eosb: [] };
    S.purchases = [{ id: 'b', date: '2026-01-10', supplier: 'مورد', category: 'food', account: 'bank', taxable: false, includesVat: false, lines: [{ rawId: 'm', qty: 30000, price: 1 }] }];
    S.stockCounts = [
      { id: 'k0', date: countDate, lines: [{ rawId: 'm', qty: 20000, price: 1 }] },
      { id: 'k1', date: '2026-01-31', lines: [{ rawId: 'm', qty: 22000, price: 1 }] },
    ];
    return S;
  };
  const view = (S) => {
    const L = RB.buildLedger(S, '2026-01-31');
    return {
      inv: RB.balances(L.entries, null, '2026-01-01')['1104'] || 0,
      cogs: RB.incomeStatement(S, '2026-01-01', '2026-01-31', L).tot.cogs,
      before: RB.sum(L.entries.filter((e) => e.date < '2026-01-01'), (e) => e.lines.length),
      equity: RB.balanceSheet(S, '2026-01-01', L).tEq,
    };
  };
  // الجرد في تاريخ البدء، أو قبله بيوم (الجرد الافتتاحي مساء اليوم السابق): المخزون 20,000 وتكلفة يناير 28,000
  assert.deepEqual(view(mk(20000, '2026-01-01')), { inv: 20000, cogs: 28000, before: 0, equity: 70000 });
  assert.deepEqual(view(mk(20000, '2025-12-31')), { inv: 20000, cogs: 28000, before: 0, equity: 70000 });
  assert.equal(RB.stockCountSkipped(mk(20000, '2025-12-31'), { date: '2025-12-31' }), true);
  assert.equal(RB.stockCountSkipped(mk(20000, '2025-12-31'), { date: '2026-01-01' }), false);
  // بلا قيمة مخزون في الأرصدة الافتتاحية: يبقى الجرد كما هو (تنبّه الواجهة إلى إدخال قيمته في الأرصدة الافتتاحية)
  assert.equal(RB.stockCountSkipped(mk(0, '2025-12-31'), { date: '2025-12-31' }), false);
  assert.equal(view(mk(0, '2026-01-01')).cogs, 8000);
  // مطعم جديد (بلا أرصدة افتتاحية): جرد ما قبل الافتتاح يُقيَّد كما هو
  const N = mk(0, '2025-12-31');
  N.settings.opening = null;
  assert.equal(RB.buildLedger(N, '2026-01-31').entries.filter((e) => e.kind === 'stock').length, 2);
});

test('مدفوع مقدماً وسلفة قائمة عند بدء الدفتر: رصيد افتتاحي يُحمَّل على أشهره وحقوق للشركاء (الجولة 2)', () => {
  const S = RB.emptyState();
  S.settings.vatRegistered = true;
  S.partners = [{ id: 'p1', name: 'أحمد', share: 50 }, { id: 'p2', name: 'خالد', share: 50 }];
  S.employees = [{ id: 'e1', name: 'عامل', nationality: 'expat', basic: 3000, startDate: '2025-01-01', active: true }];
  S.settings.opening = { date: '2026-01-01', cash: 5000, bank: 80000, inventory: 0, vatCredit: 0, apps: {}, payables: [], eosb: [] };
  // إيجار مدفوع حتى يونيو (60,000 باقية لستة أشهر)، وسلفة 3,000 على العامل
  S.expenses = [{ id: 'x', date: '2026-01-01', category: 'rent', desc: 'إيجار المحل', entity: 'المؤجر', amount: 60000, taxable: true, includesVat: true, account: 'opening', months: 6, startDate: '' }];
  S.advances = [{ id: 'a', date: '2026-01-01', employeeId: 'e1', kind: 'give', amount: 3000, account: 'opening' }];
  const L = RB.buildLedger(S, '2026-06-30');
  assert.equal(L.errors.length, 0);
  const b0 = RB.balances(L.entries, null, '2026-01-01');
  assert.deepEqual([b0['1102'], b0['1101'], b0['1106'], b0['1105'], b0['cap:p1'], b0['cap:p2']], [80000, 5000, 3000, 50000, -74000, -74000]);
  // بلا ضريبة مدخلات (مهما حُفظ «خاضع»)، ولا حركة في البنك أو الصندوق
  assert.equal(b0['2102'], undefined);
  assert.deepEqual(RB.accountStatement(S, '1102', '2026-01-01', '2026-06-30', L).rows.map((r) => r.ref.s), ['settings']);
  assert.equal(RB.accountStatement(S, '1101', '2026-01-01', '2026-06-30', L).rows.filter((r) => r.ref.s !== 'settings').length, 0);
  // إيجار يناير–يونيو 60,000 في قائمة الدخل، و1105 صفر في آخر يونيو
  assert.equal(RB.incomeStatement(S, '2026-01-01', '2026-06-30', L).tot.occ, 60000);
  close(RB.balances(L.entries, null, '2026-06-30')['1105'] || 0, 0);
  // السلفة تُستقطع من راتبه كأي سلفة
  assert.equal(RB.advanceBalances(S, '2026-01-31').e1, 3000);
  assert.equal(RB.payrollLine(S.employees[0], S, '2026-01', '2026-01-31').advance, 3000);
  // حقوق كل شريك 74,000، و«أين ذهب رأس المال» يعرضهما في الاستخدامات بلا أثر على المتبقي
  const rep = RB.partnersReport(S, '2026-01-01', '2026-01-01', L);
  assert.deepEqual(rep.rows.map((r) => r.contributed), [74000, 74000]);
  const cu = RB.capitalUses(S, L);
  assert.equal(cu.opPrepaid, 63000);
  assert.equal(cu.remaining, cu.sources - cu.used);
  // بلا شركاء: خطأ في السجل لا يوقف الدفتر
  const N = JSON.parse(JSON.stringify(S));
  N.partners = [];
  N.settings.opening = null;
  const LN = RB.buildLedger(N, '2026-06-30');
  assert.deepEqual(LN.errors.map((x) => x.section).sort(), ['advances', 'expenses']);
});

test('بيع الأصل أو استرداد التأمين أو تخريده: يخرج من الدفاتر بإهلاكه، والفرق ربح أو خسارة (الجولة 2)', () => {
  const mk = () => {
    const S = base();
    S.capital = [{ id: 'c', date: '2025-01-01', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 100000 }];
    S.assets = [
      { id: 'dep', date: '2025-01-05', name: 'تأمين الإيجار', category: 'deposit', amount: 20000, account: 'bank', lifeMonths: 0, salvage: 0 },
      { id: 'fry', date: '2025-01-10', name: 'قلاية', category: 'kitchen', amount: 12000, includesVat: false, taxable: true, account: 'bank', lifeMonths: 60, salvage: 0 },
    ];
    return S;
  };
  const S = mk();
  const before = RB.buildLedger(S, '2027-12-31');
  const bank25 = RB.balances(before.entries, null, '2025-12-31')['1102'];
  // استرداد التأمين كاملاً في البنك 30 يونيو 2026، وبيع القلاية 15 يونيو 2026 بـ 8,050 شاملة الضريبة نقداً
  Object.assign(S.assets[0], { disposedDate: '2026-06-30', proceeds: 20000, proceedsAccount: 'bank' });
  Object.assign(S.assets[1], { disposedDate: '2026-06-15', proceeds: 8050, proceedsAccount: 'cash', proceedsIncludesVat: true });
  const L = RB.buildLedger(S, '2027-12-31');
  for (const e of L.entries) close(RB.sum(e.lines, (l) => l.v), 0, 0.001);
  const b = (d) => RB.balances(L.entries, null, d);
  // السنة المغلقة كما هي، والاسترداد في كشف البنك بتاريخه
  assert.equal(b('2025-12-31')['1102'], bank25);
  const st = RB.accountStatement(S, '1102', '2026-06-01', '2026-06-30', L);
  assert.deepEqual(st.rows.map((r) => [r.date, r.in]), [['2026-06-30', 20000]]);
  assert.equal(b('2026-06-30')['1208'] || 0, 0);
  // القلاية: إهلاكها 200 شهرياً من يناير 2025 حتى يونيو 2026 (18 شهراً = 3,600)، ثم لا شيء
  assert.equal(RB.depSchedule(S.assets[1], S).months.length, 18);
  assert.equal(L.entries.filter((e) => e.kind === 'dep' && e.date > '2026-06-30').length, 0);
  close(b('2027-12-31')['1201'] || 0, 0);
  close(b('2027-12-31')['1290'] || 0, 0);
  // ثمنها بدون الضريبة 7,000 − قيمتها الدفترية 8,400 = خسارة 1,400، وضريبة مخرجات 1,050 في الإقرار
  const inc = RB.incomeStatement(S, '2026-01-01', '2026-12-31', L);
  assert.equal(inc.tot.disp, 1400);
  assert.equal(inc.revenue, 0);
  const v = RB.vatReport(S, '2026-06-01', '2026-06-30', L);
  assert.deepEqual([v.sales.base, v.sales.vat, v.sales.assets], [7000, 1050, 7000]);
  assert.equal(b('2026-06-15')['1101'], 8050);
  // الاسترداد بأقل من التأمين (خصم المؤجر): الفرق خسارة
  const D = mk();
  Object.assign(D.assets[0], { disposedDate: '2026-06-30', proceeds: 18500, proceedsAccount: 'bank' });
  assert.equal(RB.incomeStatement(D, '2026-01-01', '2026-12-31').tot.disp, 1500);
  // تخريد بلا مقابل: الخسارة = القيمة الدفترية
  const Z = mk();
  Object.assign(Z.assets[1], { disposedDate: '2026-06-15', proceeds: 0 });
  assert.equal(RB.incomeStatement(Z, '2026-01-01', '2026-12-31').tot.disp, 8400);
  // تاريخ استبعاد قبل تاريخ الأصل لا يُعتد به، ومسحه يعيد الدفتر كما كان
  const Y = mk();
  Object.assign(Y.assets[1], { disposedDate: '2024-01-01', proceeds: 100 });
  assert.equal(RB.assetDisposal(Y.assets[1]), null);
  assert.deepEqual(RB.buildLedger(Y, '2027-12-31').entries, before.entries);
  // غير المسجل في الضريبة: لا ضريبة على البيع
  const U = mk();
  U.settings.vatRegistered = false;
  Object.assign(U.assets[1], { disposedDate: '2026-06-15', proceeds: 8050, proceedsIncludesVat: true });
  const du = RB.disposalSplit(U.assets[1], U.settings);
  assert.deepEqual([du.vat, du.net, du.gross], [0, 8050, 8050]);
  // نقطة التعادل لا تعدّ خسارة الاستبعاد مصروفاً ثابتاً: يونيو إهلاكه 200 وحده
  assert.equal(RB.breakEven(S, '2026-06-01', '2026-06-30', L, '2026-10-15').fixedMonthly, 200);
});

test('رأس المال التأسيسي ما وُجد حتى الافتتاح: مدفوعات الشركاء وإيداعاتهم بعده للعلم، والسحب قبله يُخصم (الجولة 2)', () => {
  const t = '2026-10-16';
  const pre = (S) => RB.addDays(S.settings.openingDate, -1);
  const reconcile = (S) => {
    const c = RB.capitalUses(S);
    const bb = RB.balances(RB.buildLedger(S, t).entries, null, pre(S));
    close(c.remaining, (bb['1101'] || 0) + (bb['1102'] || 0) + (bb['2101'] || 0));
    return c;
  };
  const base0 = reconcile(RB.demoState(t));
  assert.deepEqual(base0.later, { contributions: 0, direct: 0 });
  // إيجار دفعه شريك من حسابه بعد الافتتاح: لا يغيّر المتبقي ويُعرض وحده
  const A = RB.demoState(t);
  A.expenses.push({ id: 'xr', date: '2026-09-01', category: 'rent', desc: 'إيجار', amount: 30000, taxable: false, includesVat: false, account: 'partner:p1', months: 6 });
  const a = reconcile(A);
  close(a.remaining, base0.remaining);
  close(a.sources, base0.sources);
  assert.equal(a.later.direct, 30000);
  // إيداع بعد الافتتاح
  const B = RB.demoState(t);
  B.capital.push({ id: 'top', date: '2026-09-15', partnerId: 'p2', type: 'contribution', account: 'bank', amount: 20000 });
  const bq = reconcile(B);
  close(bq.remaining, base0.remaining);
  assert.equal(bq.later.contributions, 20000);
  // سحب قبل الافتتاح: يُخصم من رأس المال فيبقى المتبقي = الصندوق + البنك − الموردين
  const C = RB.demoState(t);
  C.capital.push({ id: 'wd', date: RB.addDays(C.settings.openingDate, -10), partnerId: 'p1', type: 'withdrawal', account: 'bank', amount: 25000 });
  const cq = reconcile(C);
  close(cq.remaining, base0.remaining - 25000);
  assert.equal(cq.preWithdrawals, 25000);
  // نقل حقوق بين الشريكين لا يُعد إيداعاً
  const D = RB.demoState(t);
  D.capital.push({ id: 'tr', date: '2026-09-20', partnerId: 'p1', toPartnerId: 'p2', type: 'transfer', amount: 5000 });
  close(reconcile(D).sources, base0.sources);
});

test('تاريخ سداد التأمينات: التزام حتى سدادها، والبنك يوم الرواتب = الحقيقي (الجولة 2)', () => {
  const S = base();
  S.settings.vatRegistered = false;
  S.capital = [{ id: 'c', date: '2026-09-01', partnerId: 'p1', type: 'contribution', account: 'bank', amount: 30000 }];
  S.employees = [{ id: 'e1', name: 'سعد', nationality: 'saudi', basic: 8000, housing: 2000, startDate: '2026-01-01', active: true, gosiSystem: 'old' }];
  const line = RB.payrollLine(S.employees[0], S, '2026-09');
  const run = { id: 'w', month: '2026-09', date: '2026-09-30', account: 'bank', gosiAccount: 'bank', lines: [line] };
  const t = RB.payrollTotals(run);
  const g = RB.r2(t.gosiEe + t.gosiEr);
  const legacy = RB.buildLedger(Object.assign({}, S, { payroll: [run] }), '2026-12-31').entries;
  // تاريخ السداد يوم الصرف نفسه = كما قبله
  assert.deepEqual(RB.buildLedger(Object.assign({}, S, { payroll: [Object.assign({}, run, { gosiDate: '2026-09-30' })] }), '2026-12-31').entries, legacy);
  S.payroll = [Object.assign({}, run, { gosiDate: '2026-10-12' })];
  const L = RB.buildLedger(S, '2026-12-31');
  for (const e of L.entries) close(RB.sum(e.lines, (l) => l.v), 0, 0.001);
  const b = (d) => RB.balances(L.entries, null, d);
  assert.equal(b('2026-09-30')['1102'], RB.r2(30000 - t.netPaid));
  close(b('2026-09-30')['2103'], -g);
  assert.equal(RB.balanceSheet(S, '2026-09-30', L).liab.find((x) => x.code === '2103').amount, g);
  close(b('2026-10-12')['2103'] || 0, 0);
  assert.equal(b('2026-10-12')['1102'], RB.r2(30000 - t.netPaid - g));
  // المصروف على شهر الخدمة كما هو
  const inc = RB.incomeStatement(S, '2026-09-01', '2026-09-30', L);
  assert.equal(inc.tot.labor, RB.incomeStatement(Object.assign({}, S, { payroll: [run] }), '2026-09-01', '2026-09-30').tot.labor);
  // لا تنبيه رصيد سالب وهمي يوم الرواتب، ولا قبل سداد التأمينات
  S.capital[0].amount = 12000;
  const L2 = RB.buildLedger(S, '2026-12-31');
  assert.equal(RB.negativeAlert(L2, '1102', '2026-10-03', 60), null);
  // مسير يُصرف في الشهر التالي (استحقاق ثم صرف): التأمينات تبقى التزاماً بعد الصرف حتى تاريخ سدادها
  S.capital[0].amount = 30000;
  S.payroll = [Object.assign({}, run, { date: '2026-10-02', gosiDate: '2026-10-14' })];
  const L3 = RB.buildLedger(S, '2026-12-31');
  close(RB.balances(L3.entries, null, '2026-10-02')['2103'], -g);
  close(RB.balances(L3.entries, null, '2026-10-14')['2103'] || 0, 0);
});

test('بداية التشغيل (RB.opStart) ونصيب الطلب من الإهلاك على أشهر التشغيل (الجولة 2)', () => {
  const t = '2026-10-16';
  const D = RB.demoState(t);
  assert.deepEqual(RB.opStart(D), { first: D.settings.openingDate, bySales: false });
  // مطعم قائم بدأ دفتره بعد افتتاحه: من أول يوم مبيعات
  const S = base();
  S.settings.openingDate = '2019-03-01';
  S.sales = [{ id: 's', date: '2026-10-01', channels: { cash: { amount: 100, orders: 2, type: 'cash' } } }];
  assert.deepEqual(RB.opStart(S), { first: '2026-10-01', bySales: true });
  S.settings.openingDate = '';
  assert.deepEqual(RB.opStart(S), { first: '2026-10-01', bySales: true });
  // نقطة التعادل كما كانت
  const be = RB.breakEven(D, '2026-01-01', t, null, t);
  assert.deepEqual([be.start, be.startBy], [D.settings.openingDate, 'opening']);
});

test('الجرد: الكمية الفارغة «لم تُعدّ» والصفر المكتوب كمية (الواجهة والنصوص، الجولة 2)', () => {
  assert.equal(RB.isBlankQty(''), true);
  assert.equal(RB.isBlankQty('  '), true);
  assert.equal(RB.isBlankQty(undefined), true);
  assert.equal(RB.isBlankQty(null), true);
  assert.equal(RB.isBlankQty(0), false);
  assert.equal(RB.isBlankQty('0'), false);
  assert.equal(RB.isBlankQty(1.5), false);
  // سطر مكرر بكمية يكفي لمادته؛ والسطر بلا مادة لا يُعدّ
  const lines = [
    { rawId: 'a', qty: '' },
    { rawId: 'b', qty: 0 },
    { rawId: 'c', qty: '' },
    { rawId: 'c', qty: 2 },
    { rawId: '', qty: '' },
    { rawId: 'd' },
  ];
  assert.deepEqual(RB.uncountedRaw(lines), ['a', 'd']);
  assert.deepEqual(RB.uncountedRaw(null), []);
  // الفارغ يُحسب صفراً في القيمة (معاينة الجرد قبل الحفظ)
  const S = base();
  S.raw = [{ id: 'a', name: 'لحم', price: 100, packQty: 1, useUnit: 'جم', taxable: true }];
  assert.equal(RB.stockValue({ date: '2026-10-01', lines: [{ rawId: 'a', qty: '', price: 100 }] }, S), 0);
});

test('متوسط الفاتورة من الإقفالات التي سُجّل فيها عدد الطلبات فقط (الواجهة والنصوص، الجولة 2)', () => {
  const S = base();
  S.settings.channels = [{ id: 'cash', name: 'كاش', type: 'cash', feePct: 0, active: true }];
  S.sales = [
    { id: 's1', date: '2026-10-13', channels: { cash: { amount: 4000, orders: 0 } } },
    { id: 's2', date: '2026-10-14', channels: { cash: { amount: 4100, orders: 0 } } },
  ];
  let r = RB.salesByChannel(S, '2026-10-01', '2026-10-31');
  assert.equal(r.total.orders, 0);
  assert.equal(r.total.avgTicket, 0);
  close(r.total.gross, 8100);
  // إقفال واحد بطلبات: المتوسط مبيعاته ÷ طلباته (50)، لا كل المبيعات ÷ طلباته (455)
  S.sales.push({ id: 's3', date: '2026-10-15', channels: { cash: { amount: 1000, orders: 20 } } });
  r = RB.salesByChannel(S, '2026-10-01', '2026-10-31');
  close(r.total.avgTicket, 50);
  close(r.list[0].avgTicket, 50);
  close(r.total.gross, 9100);
  assert.equal(r.total.orders, 20);
});

test('الميزانية: رصيد الضريبة المدين «لصالح المطعم» لا «مستردة»، والتأمين «قابل للاسترداد» (الجولة 2)', () => {
  const D = RB.demoState('2026-10-16');
  const b = RB.balanceSheet(D, '2026-07-15');
  const names = b.cur.concat(b.fixed).map((x) => x.name);
  assert.ok(!names.some((n) => /مستردة/.test(n)), names.join('، '));
  assert.ok(names.includes('رصيد ضريبة القيمة المضافة لصالح المطعم'), names.join('، '));
  assert.ok(names.includes('تأمينات قابلة للاسترداد'), names.join('، '));
  assert.equal(RB.assetCat('deposit').name, 'تأمينات قابلة للاسترداد');
});

test('حفظ الإعدادات فوق نسخة أحدث لم تصل هذه الصفحة: دمج ثلاثي لكل مفتاح — القنوات بالمعرّف، والأيام المغلقة بالمضاف والمحذوف، والكائنات حقلاً حقلاً (السحابة، الجولة 2)', () => {
  // ما رأته هذه الصفحة محفوظاً حين حفظت
  const seen = { channels: [{ id: 'cash', name: 'كاش' }, { id: 'hs', name: 'هنقرستيشن', feePct: 20 }], closedDays: ['2026-10-01'], gosi: { saudiEr: 11.75, cap: 45000 }, opening: { date: '2026-08-01', cash: 0, bank: 0, apps: {} } };
  // الشريك (ولم تصل لقطته): أضاف قناة، وعلّم يوماً مغلقاً، وغيّر نسبة التأمينات والنقد الافتتاحي
  const cur = { channels: [...seen.channels, { id: 'chA', name: 'تطبيق أ' }], closedDays: ['2026-10-01', '2026-10-05'], gosi: { saudiEr: 12, cap: 45000 }, opening: { date: '2026-08-01', cash: 5000, bank: 0, apps: {} } };
  // هذه الصفحة: أضافت قناة وعدّلت عمولة أخرى، وعلّمت يوماً آخر، وغيّرت الحد الأعلى للأجر والبنك الافتتاحي
  const mine = { channels: [{ id: 'cash', name: 'كاش' }, { id: 'hs', name: 'هنقرستيشن', feePct: 22 }, { id: 'chB', name: 'تطبيق ب' }], closedDays: ['2026-10-01', '2026-10-06'], gosi: { saudiEr: 11.75, cap: 50000 }, opening: { date: '2026-08-01', cash: 0, bank: 20000, apps: {} } };
  const out = RB.settingsWith(cur, mine, ['channels', 'closedDays', 'gosi', 'opening'], seen);
  assert.deepEqual(out.channels.map((c) => c.id), ['cash', 'hs', 'chA', 'chB']);
  assert.equal(out.channels[1].feePct, 22);
  assert.deepEqual(out.closedDays, ['2026-10-01', '2026-10-05', '2026-10-06']);
  assert.deepEqual(out.gosi, { saudiEr: 12, cap: 50000 });
  assert.deepEqual(out.opening, { date: '2026-08-01', cash: 5000, bank: 20000, apps: {} });
  // المدخلات لا تتغير
  assert.equal(cur.channels.length, 3);
  assert.equal(mine.closedDays.length, 2);
  // حذف قناة وإلغاء يوم من هذه الصفحة يبقيان محذوفين، وما أضافه الشريك يبقى
  const mine2 = { channels: [{ id: 'cash', name: 'كاش' }], closedDays: [] };
  const out2 = RB.settingsWith(cur, mine2, ['channels', 'closedDays'], seen);
  assert.deepEqual(out2.channels.map((c) => c.id), ['cash', 'chA']);
  assert.deepEqual(out2.closedDays, ['2026-10-05']);
  // الحقل نفسه غيّراه كلاهما: ما في هذه الصفحة
  assert.deepEqual(RB.merge3({ cash: 0 }, { cash: 1 }, { cash: 2 }), { cash: 1 });
  // لم تغيّر هذه الصفحة المفتاح (مفاتيح حفظ سابق): يبقى الأحدث
  assert.deepEqual(RB.settingsWith(cur, Object.assign({}, mine, { gosi: seen.gosi }), ['gosi'], seen).gosi, cur.gosi);
  // حذف الأرصدة الافتتاحية (null) من هذه الصفحة يُكتب، وبلا seen يبقى السلوك السابق (المفتاح كله من هذه الصفحة)
  assert.equal(RB.settingsWith(cur, { opening: null }, ['opening'], seen).opening, null);
  assert.deepEqual(RB.settingsWith(cur, mine, ['channels']).channels, mine.channels);
  // قناة عدّلتها هذه الصفحة وحذفها الشريك تبقى بتعديلها، ولا خصائص للنموذج الأولي
  assert.deepEqual(RB.merge3([{ id: 'x', f: 1 }], [{ id: 'x', f: 2 }], []), [{ id: 'x', f: 2 }]);
  assert.deepEqual(RB.merge3([{ id: 'x', f: 1 }], [{ id: 'x', f: 1 }], []), []);
  RB.merge3({}, JSON.parse('{"__proto__": {"polluted": 1}, "a": 1}'), { b: 2 });
  assert.equal({}.polluted, undefined);
  // مستند قديم بلا مفتاح (الأيام المغلقة): يُقارن بقيمته الافتراضية، فيبقى يوم الشريك مع يوم هذه الصفحة
  const old = { name: 'برقر' };
  assert.deepEqual(RB.settingsWith(Object.assign({}, old, { closedDays: ['2026-10-05'] }), Object.assign(RB.normalize({ settings: old }).settings, { closedDays: ['2026-10-06'] }), ['closedDays'], old).closedDays, ['2026-10-05', '2026-10-06']);
  // العرض فوق اللقطة بالدمج نفسه: قناة الشريك تظهر مع ما يُحفظ الآن
  const shown = RB.withUnsaved('settings', cur, [{ section: 'settings', id: 'settings', rec: mine, keys: ['channels'], base: seen }]);
  assert.deepEqual(shown.channels.map((c) => c.id), ['cash', 'hs', 'chA', 'chB']);
});

test('نموذج الإعدادات أو الأرصدة الافتتاحية بحقول بمسارات: ما غيّره المستخدم وحده فوق أحدث نسخة، والتعارض في الحقل نفسه (السحابة، الجولة 2)', () => {
  const at = { name: 'برقر', city: '', targetFoodCost: 30, gosi: { cap: 45000, saudiEr: 11.75 }, apps: { hs: 100 } };
  const paths = ['name', 'city', 'targetFoodCost', 'gosi.cap', 'gosi.saudiEr', 'apps.hs', 'apps.toyou'];
  // الشريك غيّر المستهدف والنسبة بعد فتح النموذج، والمستخدم غيّر المدينة والحد الأعلى
  const cur = { name: 'برقر', city: '', targetFoodCost: 27, gosi: { cap: 45000, saudiEr: 12 }, apps: { hs: 100 }, opening: { cash: 5 } };
  const form = { name: 'برقر', city: 'جدة', targetFoodCost: 30, gosi: { cap: 50000, saudiEr: 11.75 }, apps: { hs: 100, toyou: 40 } };
  let r = RB.pathMerge(at, at, form, cur, paths);
  assert.deepEqual(r.mine.sort(), ['apps.toyou', 'city', 'gosi.cap']);
  assert.deepEqual(r.clash, []);
  assert.equal(r.rec.targetFoodCost, 27);
  assert.deepEqual(r.rec.gosi, { cap: 50000, saudiEr: 12 });
  assert.deepEqual(r.rec.apps, { hs: 100, toyou: 40 });
  assert.deepEqual(r.rec.opening, { cash: 5 });
  // كلاهما غيّر المستهدف إلى قيمتين مختلفتين: تعارض (وما في النموذج يُكتب إن وافق)
  r = RB.pathMerge(at, at, Object.assign({}, form, { targetFoodCost: 33 }), cur, paths);
  assert.deepEqual(r.clash, ['targetFoodCost']);
  assert.equal(r.rec.targetFoodCost, 33);
  // إلى القيمة نفسها: لا تعارض
  assert.deepEqual(RB.pathMerge(at, at, Object.assign({}, form, { targetFoodCost: 27 }), cur, paths).clash, []);
  // مسار للنموذج الأولي لا يُكتب، ولا cur
  RB.pathMerge({}, {}, { __proto__: { x: 1 } }, null, ['__proto__.x', 'constructor.prototype.y']);
  assert.equal({}.x, undefined);
  assert.deepEqual(RB.pathMerge({}, {}, { a: 1 }, null, ['a']).rec, { a: 1 });
});

test('ما فشل حفظه والشريك عدّل السجل بعده: يظهر تعديل الشريك في الحقول الأخرى، والحذف الفاشل لا يُخفي سجلاً عدّله الشريك (السحابة، الجولة 2)', () => {
  const base = { id: 'x', desc: 'إيجار', amount: 30000, note: '' };
  const snap = [{ id: 'x', desc: 'إيجار المحل — عقد جديد', amount: 30000, note: 'رقم العقد 5521' }];
  const mine = { section: 'expenses', id: 'x', rec: { id: 'x', desc: 'إيجار', amount: 31000, note: '' }, base };
  assert.deepEqual(RB.withUnsaved('expenses', snap, [mine]), [{ id: 'x', desc: 'إيجار المحل — عقد جديد', amount: 31000, note: 'رقم العقد 5521' }]);
  // لم يتغيّر بعد التعديل (أو اللقطة هي التعديل نفسه): التعديل كما هو
  assert.deepEqual(RB.withUnsaved('expenses', [base], [mine]), [mine.rec]);
  assert.deepEqual(RB.withUnsaved('expenses', [mine.rec], [mine]), [mine.rec]);
  // حذف فشل: يُخفي السجل ما لم يعدّله الشريك بعده
  assert.deepEqual(RB.withUnsaved('expenses', [base], [{ section: 'expenses', id: 'x', rec: null, base }]), []);
  assert.deepEqual(RB.withUnsaved('expenses', snap, [{ section: 'expenses', id: 'x', rec: null, base }]), snap);
  // بلا base (كتابة قديمة): كما كان
  assert.deepEqual(RB.withUnsaved('expenses', snap, [{ section: 'expenses', id: 'x', rec: mine.rec }]), [mine.rec]);
  // drop: يُترك ما فشل ولا تجري له كتابة الآن
  const u = RB.unsavedWrites();
  const n = u.start('expenses/x', mine);
  assert.equal(u.drop('expenses/x'), false); // جارية
  u.fail('expenses/x', n, mine);
  assert.equal(u.size, 1);
  assert.equal(u.drop('expenses/x'), true);
  assert.equal(u.size, 0);
  assert.deepEqual(u.values(), []);
});

test('إكمال استيراد لم يكتمل لا يكتب ثانية ما كُتب ولم يتغيّر في الصفحة، فيبقى ما عدّله الشريك فيه أو حذفه بعد الفشل (السحابة، الجولة 2)', () => {
  const target = RB.normalize(RB.demoState('2026-10-14'));
  const db = new Map();
  const p1 = RB.replacePlan(target, idsOf(db));
  const written = new Map();
  let n = 0;
  for (const [k, r] of p1.sets) {
    if (n++ >= 20) break;
    db.set(k + '/' + r.id, Object.assign({}, r));
    written.set(k + '/' + r.id, JSON.stringify(r));
  }
  const [k0, r0] = p1.sets[0];
  const [k1, r1] = p1.sets[1];
  const [k2, r2] = p1.sets[2];
  // الشريك عدّل الأول وحذف الثاني، والمستخدم عدّل الثالث في الشاشة بعد الفشل
  db.set(k0 + '/' + r0.id, Object.assign({}, r0, { note: 'من الشريك' }));
  db.delete(k1 + '/' + r1.id);
  const i2 = target[k2].findIndex((x) => x.id === r2.id);
  target[k2][i2] = Object.assign({}, r2, { note: 'من المستخدم' });
  const p2 = RB.replacePlan(target, idsOf(db), p1.known, written);
  assert.equal(p2.sets.length, p1.sets.length - 19);
  assert.ok(!p2.sets.some(([k, r]) => r.id === r0.id || r.id === r1.id));
  assert.ok(p2.sets.some(([k, r]) => r.id === r2.id && r.note === 'من المستخدم'));
  assert.equal(runPlan(db, p2), true);
  assert.equal(db.get(k0 + '/' + r0.id).note, 'من الشريك');
  assert.equal(db.has(k1 + '/' + r1.id), false);
  // بلا written: كل الهدف يُكتب كما كان
  assert.equal(RB.replacePlan(target, idsOf(db), p1.known).sets.length, p1.sets.length);
});

test('غير المسجل في الضريبة لا يرى «بدون الضريبة»: اسم المبيعات في التقارير وحساب المبيعات في الميزان واليومية (audit-r2)', () => {
  const today = '2026-10-14';
  const reg = RB.demoState(today);
  const unreg = RB.demoState(today);
  unreg.settings.vatRegistered = false;
  const later = RB.demoState(today);
  later.settings.vatRegisteredFrom = '2026-10-01';
  // اسم المبيعات في الفترة المنتهية بـ to: «بدون الضريبة» لمن عليه ضريبة مبيعات في يوم منها على الأقل
  assert.equal(RB.salesLabel('المبيعات', reg.settings, today), 'المبيعات بدون الضريبة');
  assert.equal(RB.salesLabel('صافي المبيعات', reg.settings, today), 'صافي المبيعات بدون الضريبة');
  assert.equal(RB.salesLabel('المبيعات', unreg.settings, today), 'المبيعات');
  assert.equal(RB.salesLabel('صافي المبيعات', unreg.settings, today), 'صافي المبيعات');
  // فترة كلها قبل سريان التسجيل: بلا ضريبة مبيعات فلا «بدون الضريبة»؛ وفترة يسري التسجيل في آخرها: معها
  assert.equal(RB.salesLabel('المبيعات', later.settings, '2026-09-30'), 'المبيعات');
  assert.equal(RB.salesLabel('المبيعات', later.settings, '2026-10-01'), 'المبيعات بدون الضريبة');
  // يطابق ضريبة المبيعات الفعلية في الفترة: بلا «بدون الضريبة» لا ضريبة مبيعات، ومعها ضريبة
  const sep = RB.salesByChannel(later, '2026-09-01', '2026-09-30').total;
  assert.ok(sep.gross > 0 && sep.vat === 0);
  assert.ok(RB.salesByChannel(later, '2026-09-01', '2026-10-14').total.vat > 0);
  assert.equal(RB.salesByChannel(unreg, '2026-01-01', today).total.vat, 0);
  // حساب المبيعات 4101: «المبيعات» لغير المسجل في الميزان واليومية، وبقية خصائصه كما هي
  assert.equal(RB.accInfo('4101', reg).name, 'المبيعات (بدون الضريبة)');
  assert.equal(RB.accInfo('4101', later).name, 'المبيعات (بدون الضريبة)');
  assert.equal(RB.accInfo('4101', unreg).name, 'المبيعات');
  assert.equal(RB.accInfo(4101, unreg).name, 'المبيعات');
  assert.deepEqual([RB.accInfo('4101', unreg).type, RB.accInfo('4101', unreg).group, RB.accInfo('4101', unreg).code], ['R', 'sales', '4101']);
  assert.equal(RB.accInfo('4101').name, 'المبيعات (بدون الضريبة)');
  const L = RB.buildLedger(unreg, today);
  const tb = RB.trialBalance(unreg, '2026-01-01', today, L);
  const row = tb.rows.find((r) => r.code === '4101');
  assert.ok(row && row.name === 'المبيعات' && row.cr > 0);
  assert.ok(!tb.rows.some((r) => /بدون الضريبة/.test(r.name)));
  close(tb.dr, tb.cr);
  // الاسم لا يغيّر الأرقام: قائمة الدخل كما هي
  const bU = RB.balances(L.entries, '2026-01-01', today);
  close(RB.incomeStatement(unreg, '2026-01-01', today, L).revenue, -bU['4101'] - (bU['4102'] || 0));
});

// ───────────── مراجعة المحاسبة والبيانات (audit-r3) ─────────────

test('خروج شريك: نسبته 0 من تاريخ خروجه أولاً ثم تسوية حقوقه بتاريخه، فلا أرباح له بعد خروجه ولا حقوق بالسالب (audit-r3)', () => {
  const mk = () => {
    const S = RB.emptyState();
    S.settings.vatRegistered = false;
    S.partners = [{ id: 'P', name: 'فهد', share: 70 }, { id: 'Q', name: 'قاسم', share: 30 }];
    S.capital = [
      { id: 'c1', date: '2026-03-01', partnerId: 'P', type: 'contribution', account: 'bank', amount: 70000 },
      { id: 'c2', date: '2026-03-01', partnerId: 'Q', type: 'contribution', account: 'bank', amount: 30000 },
    ];
    S.sales = [];
    for (let d = 1; d <= 31; d++) S.sales.push({ id: 's' + d, date: '2026-03-' + String(d).padStart(2, '0'), channels: { cash: { amount: 1000, orders: 10, type: 'cash', feePct: 0, feeVat: false } } });
    return S;
  };
  const D = '2026-03-16';
  const eq = (S, d, id) => RB.partnersReport(S, d, d).rows.find((r) => r.id === id).equity;
  // حقوقه حتى اليوم السابق لخروجه: 30,000 + 30% من ربح 15 يوماً
  const S = mk();
  const before = eq(S, '2026-03-15', 'Q');
  close(before, 34500);
  // النسبة 0 من يوم الخروج أولاً: نموذج النقل يعرض حقوقه في يوم الخروج = حقوقه عند خروجه، بلا ربح ذلك اليوم
  S.partners = [RB.shareFrom(S.partners[0], 100, D), RB.shareFrom(S.partners[1], 0, D)];
  close(eq(S, D, 'Q'), before);
  S.capital.push({ id: 't', date: D, partnerId: 'Q', toPartnerId: 'P', type: 'transfer', amount: eq(S, D, 'Q') });
  const r = RB.partnersReport(S, '2026-03-01', '2026-03-31');
  const q = r.rows.find((x) => x.id === 'Q');
  assert.deepEqual([q.equity, q.out], [0, true]);
  close(r.rows.find((x) => x.id === 'P').equity, 131000);
  // الترتيب المعاكس (التسوية بنسبته القديمة ثم 0 من اليوم نفسه): تدخل التسوية نصيبه من ربح يوم الخروج فتصير حقوقه بالسالب
  const O = mk();
  const paid = eq(O, D, 'Q');
  close(paid, 34800);
  O.capital.push({ id: 't', date: D, partnerId: 'Q', toPartnerId: 'P', type: 'transfer', amount: paid });
  O.partners = [RB.shareFrom(O.partners[0], 100, D), RB.shareFrom(O.partners[1], 0, D)];
  const qo = RB.partnersReport(O, '2026-03-01', '2026-03-31').rows.find((x) => x.id === 'Q');
  assert.deepEqual([qo.equity, qo.out], [-300, false]);
  // نموذج الشريك يحسب الباقي بعد كل الحركات بنسبته الجديدة: −300 (زاد ما سُجّل له على حقوقه عند خروجه)
  close(RB.partnersReport(O, '9999-12-31', '9999-12-31').rows.find((x) => x.id === 'Q').equity, before - paid);
});

test('تاريخ نسبة قبل تغيير مسجل يحل محل ما بعده، ويُعاد التغيير اللاحق بتاريخه (audit-r3)', () => {
  // خرج قاسم من 16 مارس (0%)، ثم سُجّل تغيير نسي: باع 5% من 1 فبراير
  const Q = { id: 'Q', name: 'قاسم', share: 0, shareHist: [{ until: '2026-03-15', share: 30 }] };
  const q1 = RB.shareFrom(Q, 25, '2026-02-01');
  assert.deepEqual([q1.share, q1.shareHist], [25, [{ until: '2026-01-31', share: 30 }]]);
  assert.equal(RB.shareAt(q1, '2026-03-20'), 25);
  // إعادة الخروج بتاريخه بعد ذلك تُرجع النسب كلها
  const q2 = RB.shareFrom(q1, 0, '2026-03-16');
  assert.deepEqual([q2.share, q2.shareHist], [0, [{ until: '2026-01-31', share: 30 }, { until: '2026-03-15', share: 25 }]]);
  assert.deepEqual(['2026-01-31', '2026-02-01', '2026-03-15', '2026-03-16'].map((d) => RB.shareAt(q2, d)), [30, 25, 25, 0]);
});

test('مكافأة نهاية الخدمة على الأجر الأخير: مسير شهر ترك العمل بأجره الجديد يدخل قبل حفظه، ومسير التسوية بلا أجر لا يغيّره (audit-r3)', () => {
  const S = base();
  S.settings.vatRegistered = false;
  S.employees = [{ id: 'E', name: 'عامل', basic: 5000, housing: 0, transport: 0, otherAllow: 0, startDate: '2023-06-01', endDate: '2026-05-20', active: false }];
  S.payroll = [];
  for (let ym = '2023-06'; ym <= '2026-04'; ym = RB.ymAdd(ym, 1)) S.payroll.push({ id: 'p' + ym, month: ym, date: RB.monthEnd(ym), account: 'bank', lines: [{ employeeId: 'E', basic: 4000, housing: 0, allowances: 0, additions: 0, deductions: 0, gosiEe: 0, gosiEr: 0 }] });
  assert.equal(RB.lastWage(S, 'E'), 4000);
  close(RB.eosbAward(RB.lastWage(S, 'E'), '2023-06-01', '2026-05-20').full, 5941.14);
  // مسير مايو بعد الزيادة (أيامه الأخيرة في الخصومات) كما يكون في النموذج قبل حفظه
  const draft = { id: 'may', month: '2026-05', date: '2026-05-31', account: 'bank', lines: [{ employeeId: 'E', basic: 5000, housing: 0, allowances: 0, additions: 0, deductions: 1666.67, gosiEe: 0, gosiEr: 0 }] };
  const W = Object.assign({}, S, { payroll: S.payroll.concat([draft]) });
  assert.equal(RB.lastWage(W, 'E'), 5000);
  close(RB.eosbAward(RB.lastWage(W, 'E'), '2023-06-01', '2026-05-20').full, 7426.42);
  const settle = { id: 'st', month: '2026-05', date: '2026-05-20', lines: [{ employeeId: 'E', basic: 0, housing: 0, allowances: 0, eosbPaid: 100 }] };
  assert.equal(RB.lastWage(Object.assign({}, W, { payroll: W.payroll.concat([settle]) }), 'E'), 5000);
});

test('رأس المال التأسيسي ومدفوعات الشريك المباشرة: ما رُدّ إليه من فاتورة دفعها (مرتجع على حسابه) يُخصم منها (audit-r3)', () => {
  const S = RB.emptyState();
  S.settings.vatRegistered = false;
  S.settings.openingDate = '2026-03-01';
  S.partners = [{ id: 'A', name: 'أحمد', share: 50 }, { id: 'B', name: 'بدر', share: 50 }];
  S.capital = [
    { id: 'c1', date: '2026-02-01', partnerId: 'A', type: 'contribution', account: 'bank', amount: 50000 },
    { id: 'c2', date: '2026-02-01', partnerId: 'B', type: 'contribution', account: 'bank', amount: 50000 },
  ];
  const inv = (id, date, qty) => ({ id, date, supplier: 'مورد', category: 'food', account: 'partner:A', taxable: false, includesVat: false, lines: [{ desc: 'لحم', qty, price: 575 }] });
  S.purchases = [inv('p1', '2026-02-10', 10), inv('p2', '2026-02-15', -2)];
  const L = RB.buildLedger(S, '2026-12-31');
  const b = RB.balances(L.entries, null, '2026-02-28');
  close(-b['cap:A'], 54600);
  const cu = RB.capitalUses(S, L);
  close(cu.direct, 4600);
  // المتبقي = الصندوق + البنك − المستحق للموردين عند الافتتاح
  close(cu.remaining, (b['1101'] || 0) + (b['1102'] || 0) + (b['2101'] || 0));
  close(cu.remaining, 100000);
  const pr = RB.partnersReport(S, '2026-02-01', '2026-02-28', L);
  close(pr.rows.find((r) => r.id === 'A').direct, 4600);
  assert.ok(pr.rows.find((r) => r.id === 'A').direct <= pr.rows.find((r) => r.id === 'A').contributed);
});

test('سعر المادة الخام من فاتورة عُدّلت أو حُذفت يرجع إلى آخر فاتورة باقية، ولا يُلمس سعر عُدّل يدوياً أو من فاتورة أحدث (audit-r3)', () => {
  const S = base();
  S.settings.vatRegistered = false;
  S.raw = [{ id: 'm', name: 'لحم', price: 4200, packQty: 10000, useUnit: 'جم', taxable: false, wastePct: 0 }];
  const inv = (id, date, price) => ({ id, date, supplier: 'مورد', category: 'food', account: 'bank', taxable: false, includesVat: false, lines: [{ rawId: 'm', desc: 'لحم', qty: 6, price }] });
  // فاتورة 4200 خطأً (420) حدّثت سعر المادة
  S.purchases = [inv('a', '2026-09-01', 420), inv('b', '2026-10-01', 4200)];
  assert.deepEqual(RB.rawPriceSources(S, 'b'), ['m']);
  assert.deepEqual(RB.rawPriceSources(S, 'a'), [], 'الفاتورة الأقدم ليست مصدر السعر');
  // تصحيح سعرها في الفاتورة: يرجع السعر إلى السطر المصحح
  const E = Object.assign({}, S, { purchases: [inv('a', '2026-09-01', 420), inv('b', '2026-10-01', 425)] });
  assert.deepEqual(RB.rawPriceRestore(E, 'm'), { price: 425, taxable: false });
  // حذفها: إلى الفاتورة السابقة
  assert.deepEqual(RB.rawPriceRestore(Object.assign({}, S, { purchases: [inv('a', '2026-09-01', 420)] }), 'm'), { price: 420, taxable: false });
  // لا فاتورة باقية: يبقى السعر كما هو
  assert.equal(RB.rawPriceRestore(Object.assign({}, S, { purchases: [] }), 'm'), null);
  // سعر عُدّل يدوياً بعد الفاتورة: ليست مصدره فلا يُلمس
  S.raw[0].price = 450;
  assert.deepEqual(RB.rawPriceSources(S, 'b'), []);
  // فاتورة أحدث حدّدت السعر: تعديل الأقدم لا يغيّره
  S.raw[0].price = 430;
  S.purchases.push(inv('c', '2026-10-05', 430));
  assert.deepEqual(RB.rawPriceSources(S, 'b'), []);
  assert.deepEqual(RB.rawPriceSources(S, 'c'), ['m']);
  // الضريبة: فاتورة شاملة الضريبة سعرها بدونها
  const T = base();
  T.raw = [{ id: 'm', name: 'لحم', price: 400, packQty: 1, useUnit: 'جم', taxable: true, wastePct: 0 }];
  T.purchases = [Object.assign(inv('x', '2026-10-01', 460), { taxable: true, includesVat: true })];
  assert.deepEqual(RB.rawPriceSources(T, 'x'), ['m']);
  assert.deepEqual(RB.rawPriceRestore(T, 'm'), { price: 400, taxable: true });
});

test('متابعة التجديد: المدفوع قبل بدء الدفتر يُتابع بنهاية تغطيته ولو بقي منه شهر، ومفتاح البند واحد لتجديده (audit-r3)', () => {
  const S = base();
  const op = (id, category, desc, months, entity) => ({ id, date: '2026-09-01', category, desc, entity: entity || '', amount: 300, months, account: 'opening', taxable: false, includesVat: false });
  S.expenses = [
    op('l1', 'gov', 'رخصة المحل التجاري', 1, 'بلدي (أمانة المنطقة)'),
    op('c2', 'gov', 'شهادة السلامة', 2, 'الدفاع المدني (سلامة)'),
    op('rent', 'rent', 'إيجار المحل', 4),
    op('u', 'utilities', 'كهرباء', 1),
    // رسم مدفوع من البنك يغطي شهراً: لا يُتابع كما كان
    { id: 'g1', date: '2026-09-10', category: 'gov', desc: 'رسم شهري', entity: '', amount: 100, months: 1, account: 'bank', taxable: false, includesVat: false },
  ];
  assert.equal(RB.expenseTerm(S.expenses[0]), 12);
  assert.equal(RB.expenseTerm(S.expenses[2]), 6);
  assert.equal(RB.expenseTerm(S.expenses[3]), 1);
  const R = RB.renewals(S, '2026-10-06').map((r) => [r.rec.id, r.end, r.status]);
  assert.deepEqual(R, [
    ['l1', '2026-09-30', 'expired'],
    ['c2', '2026-10-31', 'soon'],
    ['rent', '2026-12-31', 'ok'],
  ]);
  // التجديد بمفتاح البند نفسه (التصنيف والجهة والوصف والموظف): يحل محل السجل الافتتاحي في المتابعة
  const ren = { id: 'l1b', date: '2026-10-06', startDate: '2026-10-01', category: 'gov', desc: 'رخصة المحل التجاري', entity: 'بلدي (أمانة المنطقة)', amount: 250, months: 12, account: 'bank' };
  assert.equal(RB.renewKey(ren), RB.renewKey(S.expenses[0]));
  S.expenses.push(ren);
  assert.deepEqual(RB.renewals(S, '2026-10-06').map((r) => r.rec.id), ['c2', 'rent', 'l1b']);
});

test('نقطة التعادل في أول شهر تشغيل: الإيجار والإهلاك قسط شهر كامل لا يُقسم على أيام الفترة (audit-r3)', () => {
  const N = base();
  N.settings.vatRegistered = false;
  N.settings.openingDate = '2026-10-01';
  N.expenses = [{ id: 'r', date: '2026-09-25', category: 'rent', desc: 'إيجار', amount: 36000, months: 6, startDate: '2026-10-01', taxable: false, includesVat: false, account: 'bank' }];
  N.assets = [{ id: 'k', date: '2026-09-20', name: 'معدات', category: 'kitchen', amount: 12000, includesVat: false, taxable: false, account: 'bank', lifeMonths: 60, salvage: 0 }];
  N.sales = [{ id: 's', date: '2026-10-02', channels: { cash: { amount: 5000, orders: 100, type: 'cash', feePct: 0, feeVat: false } } }];
  for (const t of ['2026-10-02', '2026-10-16', '2026-10-30']) {
    const e = RB.breakEven(N, '2026-10-01', t, null, t);
    assert.equal(e.estimate, true, t);
    close(e.fixedParts.occ, 6000);
    close(e.fixedParts.dep, 200);
    close(e.fixedMonthly, 6200);
    close(e.beGross, 6200 * (1 + 0));
  }
  // إيجار يُدفع شهرياً (مصروف شهر واحد بتصنيف الإيجار) قسط شهر كامل كذلك؛ وفاتورة الكهرباء بأيام الفترة كما كانت
  N.expenses = [
    { id: 'r1', date: '2026-10-01', category: 'rent', desc: 'إيجار أكتوبر', amount: 6000, months: 1, taxable: false, includesVat: false, account: 'bank' },
    { id: 'u', date: '2026-10-01', category: 'utilities', desc: 'كهرباء', amount: 1000, months: 1, taxable: false, includesVat: false, account: 'bank' },
  ];
  const e2 = RB.breakEven(N, '2026-10-01', '2026-10-14', null, '2026-10-14');
  close(e2.fixedParts.occ, 6000);
  close(e2.fixedParts.opex, 1000 / (14 / 31));
  // فترة تعبر نهاية الشهر قبل أول شهر كامل (افتتاح منتصف الشهر): قسطان في الفترة = متوسطهما
  const M = base();
  M.settings.vatRegistered = false;
  M.settings.openingDate = '2026-10-15';
  M.expenses = [{ id: 'r', date: '2026-10-10', category: 'rent', desc: 'إيجار', amount: 36000, months: 6, startDate: '2026-10-15', taxable: false, includesVat: false, account: 'bank' }];
  M.sales = [{ id: 's', date: '2026-10-16', channels: { cash: { amount: 5000, orders: 100, type: 'cash', feePct: 0, feeVat: false } } }];
  const e3 = RB.breakEven(M, '2026-10-01', '2026-11-05', null, '2026-11-05');
  assert.equal(e3.estimate, true);
  close(e3.fixedParts.occ, 6000);
});

test('متوسط المحمّل شهرياً لـ«كل الفترات» أو سنة بدأ الدفتر أثناءها: من أول شهر فيه تحميل كاملاً (audit-r3)', () => {
  const t = '2026-10-16';
  const D = RB.demoState(t);
  const L = RB.buildLedger(D, t);
  const accs = new Set(RB.EXPENSE_CATS.map((c) => c.acc));
  const first = L.entries.find((e) => e.lines.some((l) => accs.has(l.a))).date;
  // «كل الفترات» تبدأ بأول قيد (منتصف مايو)
  const from = L.entries[0].date;
  const b = RB.balances(L.entries, from, t);
  close(b['5301'], 36000);
  close(b['5301'] / RB.chargeMonths(from, t, first), 6000);
  // «هذه السنة» والدفتر بدأ في مايو
  close(RB.balances(L.entries, '2026-01-01', t)['5301'] / RB.chargeMonths('2026-01-01', t, first), 6000);
  // فترة تبدأ منتصف شهر بعد أول تحميل: ذلك الشهر بأيامه كما كان
  close(RB.chargeMonths('2026-09-16', '2026-10-14', first), 15 / 30 + 1, 1e-9);
  close(RB.chargeMonths('2026-10-01', '2026-10-14', first), 1, 1e-9);
});

test('كشف البنك يسمّي الشريك في مسحوباته وإيداعاته، واسترداد الضريبة «استرداد» ومنفصل عن المسدد (audit-r3 ui)', () => {
  const t = '2026-10-16';
  const D = RB.demoState(t);
  D.capital.push(
    { id: 'w1', date: '2026-10-03', partnerId: 'p1', type: 'withdrawal', account: 'bank', amount: 300 },
    { id: 'w2', date: '2026-10-03', partnerId: 'p2', type: 'withdrawal', account: 'bank', amount: 200, note: 'شخصي' },
    { id: 'd1', date: '2026-10-03', partnerId: 'p2', type: 'contribution', account: 'bank', amount: 500 }
  );
  D.vatPayments = [
    { id: 'v1', date: '2026-10-05', period: 'الربع الثاني 2026', amount: 400, account: 'bank' },
    { id: 'v2', date: '2026-10-06', period: 'الربع الثالث 2026', amount: -900, account: 'bank' },
  ];
  const st = RB.accountStatement(D, '1102', '2026-10-03', '2026-10-06');
  const d = st.rows.map((r) => r.desc);
  assert.ok(d.includes('مسحوبات الشريك: الشريك الأول'));
  assert.ok(d.includes('مسحوبات الشريك: الشريك الثاني — شخصي'));
  assert.ok(d.includes('إيداع رأس مال: الشريك الثاني'));
  assert.ok(d.includes('سداد ضريبة القيمة المضافة الربع الثاني 2026'));
  assert.ok(d.includes('استرداد ضريبة القيمة المضافة الربع الثالث 2026'));
  const v = RB.vatReport(D, '2026-10-01', t);
  close(v.paid, 400);
  close(v.refunded, 900);
});

test('التسجيل في الضريبة منتصف ربع: أول إقرار من تاريخ السريان، ومبيعات ما قبله «المبيعات» في الميزان (audit-r3 ui)', () => {
  const t = '2026-10-16';
  const D = RB.demoState(t);
  D.settings.vatRegisteredFrom = '2026-08-15';
  const ps = RB.vatPeriodsBetween(D, '2026-01-01', '2026-12-31');
  assert.equal(ps[0].key, '2026-Q3');
  assert.equal(ps[0].from, '2026-08-15');
  assert.equal(ps[0].to, '2026-09-30');
  assert.equal(ps[1].from, '2026-10-01');
  assert.equal(RB.accInfo('4101', D, '2026-07-31').name, 'المبيعات');
  assert.equal(RB.accInfo('4101', D, '2026-08-31').name, 'المبيعات (بدون الضريبة)');
  assert.equal(RB.accInfo('4101', D).name, 'المبيعات (بدون الضريبة)');
  const tb = RB.trialBalance(D, '2026-07-01', '2026-07-31');
  assert.equal(tb.rows.find((r) => r.code === '4101').name, 'المبيعات');
});

test('كتابة مُعادة تلقائياً تُبنى على المستند الآن (RB.writePlan): تعديل الشريك يبقى، والمحذوف لا يعود (cloud r3)', () => {
  const base = { id: 'x27', amount: 3182.95, desc: 'فاتورة الكهرباء', note: '' };
  const mine = Object.assign({}, base, { desc: 'كهرباء أكتوبر' });
  // لم يتغيّر بعد ما بُني عليه التعديل، أو وصلت محاولة سابقة: يُكتب كما هو
  assert.deepEqual(RB.writePlan(base, mine, base).rec, mine);
  assert.deepEqual(RB.writePlan(base, mine, Object.assign({}, mine)).rec, mine);
  // حفظان متتاليان من الصفحة نفسها: الأول وصل قبل الثاني، فليس تعديلاً من الشريك
  const first = Object.assign({}, base, { amount: 200 });
  const second = Object.assign({}, base, { amount: 300 });
  assert.equal(RB.writePlan(base, second, first), null);
  assert.deepEqual(RB.writePlan(base, second, first, [first]).rec, second);
  // عدّل الشريك حقلاً آخر أثناء الانقطاع: يبقى، ويُكتب ما غيّره المستخدم وحده
  const p = RB.writePlan(base, mine, Object.assign({}, base, { amount: 1111 }));
  assert.equal(p.merged, true);
  assert.equal(p.rec.amount, 1111);
  assert.equal(p.rec.desc, 'كهرباء أكتوبر');
  // غيّرا الحقل نفسه، أو حُذف (مسح أو استيراد)، أو حذفه المستخدم وقد عدّله الشريك: لا يُكتب (يُسأل في «أعد المحاولة»)
  assert.equal(RB.writePlan(base, mine, Object.assign({}, base, { desc: 'كهرباء سبتمبر' })), null);
  assert.equal(RB.writePlan(base, mine, null), null);
  assert.equal(RB.writePlan(base, null, Object.assign({}, base, { amount: 1111 })), null);
  // حذف لم يتغيّر قبله، وسجل جديد لم يكن موجوداً
  assert.deepEqual(RB.writePlan(base, null, base), { rec: null });
  assert.deepEqual(RB.writePlan(null, mine, null).rec, mine);
  assert.equal(RB.writePlan(null, mine, Object.assign({}, base, { amount: 5 })), null);
});
