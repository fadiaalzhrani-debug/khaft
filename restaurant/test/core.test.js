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
  close(octInc.revenue, oct.total.gross / 1.15, 0.5);
  close(oct.total.vat, oct.total.gross - octInc.revenue, 0.02);
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
  // عرض أو مرتجع: ضريبة المبيعات تنقص 3 وأساسها 20
  const sale = run('sale');
  assert.equal(sale.v.sales.vat, 12);
  assert.equal(sale.v.sales.base, 80);
  assert.equal(sale.v.inVat, 0);
  close(sale.b['5403'], 20);
  close(sale.b['1103'] || 0, 0);
  close(-sale.b['2102'], 12);
  // رسوم بفاتورة ضريبية: ضريبة مدخلات 3
  const fee = run('fee');
  assert.equal(fee.v.sales.vat, 15);
  assert.equal(fee.v.inVat, 3);
  assert.deepEqual(fee.v.inputs['عمولات التطبيقات ورسوم الشبكة'], { base: 20, vat: 3 });
  close(fee.b['5403'], 20);
  // غير مسجل في تاريخ التحويل: الخصم كله مصروف بلا ضريبة
  S.settings.vatRegisteredFrom = '2026-06-01';
  const pre = run('sale');
  close(pre.b['5403'], 23);
  assert.equal(pre.v.sales.vat, 0);
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
