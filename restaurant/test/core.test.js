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
  close(inc.tot.labor, 8127.5);
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
  close(RB.incomeStatement(S, '2026-09-01', '2026-09-30', L).tot.labor, 6087.5);
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
  // أصل تأسيسي بالآجل: خارج «المصروف على التأسيس»
  S.assets.push({ id: 'owed', date: RB.addDays(pre, -5), name: 'ثلاجة بالآجل', category: 'kitchen', amount: 5000, includesVat: false, taxable: true, account: 'payable', supplier: 'شركة المعدات', lifeMonths: 60, salvage: 0 });
  const cu3 = RB.capitalUses(S);
  close(cu3.used, cu.used);
  assert.deepEqual(cu3.laterAssets, { amount: 9200 + 5750, count: 2 });
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
