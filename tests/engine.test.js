import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculate, cashChange, applyWhatIf, validate, per100, marginPct, depreciationFromAsset, EMPTY_INPUT,
} from '../src/engine.js';
import { PRESETS } from '../src/presets.js';

const near = (actual, expected, tol = 1, label = '') =>
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: expected ${expected} ±${tol}, got ${actual}`);

// The worked example from the reel.
const REEL = {
  moneyIn: 500000, gstIncluded: true, gstMode: 'regular', gstRate: 5,
  returnsMode: 'pct', returnsPct: 8,
  cogs: 160000,
  packaging: 45000, shipping: 12000, paymentFeePct: 2, commissionPct: 0, otherVariable: 0,
  marketing: 110000,
  rent: 25000, staff: 45000, ownerSalary: 30000, utilities: 8000, otherFixed: 0,
  depreciation: 5000, interest: 4000,
  taxRate: 25,
};

test('worked example from the reel matches to ±1', () => {
  const r = calculate(REEL);
  near(r.salesExGst, 476190, 1, 'salesExGst');
  near(r.gstCollected, 23810, 1, 'gstCollected');
  near(r.returns, 38095, 1, 'returns');
  near(r.netRevenue, 438095, 1, 'netRevenue');
  near(r.cm1, 278095, 1, 'CM1');
  near(r.sellingCosts, 67000, 1, 'sellingCosts');
  near(r.cm2, 211095, 1, 'CM2');
  near(r.cm3, 101095, 1, 'CM3');
  near(r.ebitda, -6905, 1, 'EBITDA');
  near(r.pbt, -15905, 1, 'PBT');
  near(r.tax, 0, 0, 'tax');
  near(r.netProfit, -15905, 1, 'netProfit');
  near(per100(r.netProfit, r.moneyIn), -3.2, 0.05, 'per100(netProfit)');
  near(r.per100.netProfit, -3.2, 0.05, 'r.per100.netProfit');
  near(r.naiveProfit, 340000, 1, 'naiveProfit');
});

test('reel example: break-even, flags and leaks', () => {
  const r = calculate(REEL);
  // Fixed = 108000 + 5000 + 4000 = 117000; CM3 share of G = 101095/500000
  near(r.breakEven.sales, 117000 * 500000 / 101095.24, 2, 'break-even');
  assert.equal(r.breakEven.reachable, true);
  assert.ok(r.breakEven.gap > 0, 'needs more sales');
  assert.ok(r.flags.includes('gstIsNotIncome'));
  assert.ok(!r.flags.includes('cm2Negative'));
  assert.ok(r.flags.includes('belowBreakEven'), 'each sale earns, but not enough for fixed costs');
  assert.equal(r.leaks.length, 3);
  assert.equal(r.leaks[0].key, 'cogs');
  assert.equal(r.leaks[1].key, 'marketing');
  // shares are of net revenue
  near(r.leaks[0].pctOfNR, 160000 / 438095.24 * 100, 0.01, 'cogs share');
});

test('GST-exclusive input: GST shown for info, not part of profit', () => {
  const r = calculate({ moneyIn: 100000, gstIncluded: false, gstMode: 'regular', gstRate: 18 });
  assert.equal(r.salesExGst, 100000);
  near(r.gstCollected, 18000, 0, 'gstCollected');
  assert.equal(r.netRevenue, 100000);
  assert.equal(r.netProfit, 100000);
  assert.ok(!r.flags.includes('gstIsNotIncome'));
});

test('composition scheme: tax on turnover is a cost', () => {
  const r = calculate({ moneyIn: 200000, gstMode: 'composition', compositionRate: 1, returnsPct: 5, cogs: 150000 });
  assert.equal(r.salesExGst, 200000);
  assert.equal(r.gstCollected, 0);
  near(r.compositionTax, 2000, 0, 'compositionTax');
  near(r.returns, 10000, 0, 'returns');
  near(r.netRevenue, 188000, 0, 'netRevenue');
  near(r.cm1, 38000, 0, 'CM1');
});

test('composition rate defaults to 1%', () => {
  const r = calculate({ moneyIn: 100000, gstMode: 'composition' });
  near(r.compositionTax, 1000, 0, 'default composition tax');
});

test('not registered: all money in is sales', () => {
  const r = calculate({ moneyIn: 80000, gstIncluded: true, gstMode: 'none', gstRate: 18, cogs: 50000 });
  assert.equal(r.salesExGst, 80000);
  assert.equal(r.gstCollected, 0);
  assert.equal(r.cm1, 30000);
});

test('all-zero / empty inputs never crash and give zeros', () => {
  for (const input of [{}, EMPTY_INPUT, { moneyIn: '' }, { moneyIn: null, gstRate: undefined }]) {
    const r = calculate(input);
    assert.equal(r.netProfit, 0);
    assert.equal(r.per100.netProfit, 0);
    assert.equal(r.breakEven.sales, null);
    assert.ok(Number.isFinite(r.netRevenue));
    assert.ok(r.flags.includes('noSales'));
  }
});

test('CM3 <= 0 means break-even is not reachable', () => {
  const r = calculate({ moneyIn: 100000, gstMode: 'none', cogs: 60000, marketing: 50000, rent: 10000 });
  assert.ok(r.cm3 <= 0);
  assert.equal(r.breakEven.sales, null);
  assert.equal(r.breakEven.reachable, false);
  assert.equal(r.breakEven.reason, 'cm3');
  assert.ok(r.flags.includes('cm3Negative'));
  assert.ok(!r.flags.includes('cm2Negative'));
});

test('CM2 negative flag when each sale loses money before ads', () => {
  const r = calculate({ moneyIn: 100000, gstMode: 'none', cogs: 80000, shipping: 30000 });
  assert.ok(r.cm2 < 0);
  assert.ok(r.flags.includes('cm2Negative'));
  assert.ok(!r.flags.includes('cm3Negative'), 'cm3 flag only when cm2 is positive');
});

test('profitable case with tax applied', () => {
  const r = calculate({
    moneyIn: 1000000, gstMode: 'none', cogs: 400000, marketing: 50000,
    rent: 50000, staff: 100000, ownerSalary: 50000, depreciation: 10000, interest: 10000, taxRate: 25,
  });
  assert.equal(r.ebitda, 350000);
  assert.equal(r.pbt, 330000);
  assert.equal(r.tax, 82500);
  assert.equal(r.netProfit, 247500);
  near(r.per100.netProfit, 24.75, 0.001, 'per100');
  near(marginPct(r.netProfit, r.netRevenue), 24.75, 0.001, 'net margin');
  // Break-even: fixed 220000 / (cm3 share 0.55) = 400000
  near(r.breakEven.sales, 400000, 0.5, 'break-even');
  assert.ok(r.breakEven.gap < 0, 'above break-even');
  assert.ok(r.flags.includes('noOwnerSalary') === false);
});

test('no owner salary flag', () => {
  const r = calculate({ moneyIn: 100000, gstMode: 'none', cogs: 10000 });
  assert.ok(r.flags.includes('noOwnerSalary'));
});

test('returns entered as an amount', () => {
  const r = calculate({ moneyIn: 118000, gstMode: 'regular', gstRate: 18, returnsMode: 'amount', returnsAmount: 5000 });
  near(r.salesExGst, 100000, 0.01, 'salesExGst');
  assert.equal(r.returns, 5000);
  near(r.netRevenue, 95000, 0.01, 'NR');
});

test('payment fees on money paid, commission on sales ex-GST', () => {
  const r = calculate({ moneyIn: 105000, gstRate: 5, paymentFeePct: 2, commissionPct: 10 });
  near(r.sellingCosts, 2100 + 10000, 0.01, 'selling');
});

test('cash formula', () => {
  const input = {
    moneyIn: 1000000, gstMode: 'none', cogs: 400000, rent: 100000, depreciation: 20000, taxRate: 0,
    stockBought: 450000, udhaarGiven: 80000, udhaarCollected: 30000,
    supplierCredit: 40000, supplierPaid: 10000, loanPrincipal: 25000, personalWithdrawals: 15000,
  };
  const r = calculate(input);
  assert.equal(r.netProfit, 480000);
  // 480000 + 20000 − 50000 − 50000 + 30000 − 25000 − 15000
  assert.equal(r.cash.change, 390000);
  assert.equal(cashChange(input, r), 390000);
  assert.equal(r.cash.gap, 390000 - 480000);
});

test('cash: blank stock bought is treated as equal to stock used', () => {
  const r = calculate({ moneyIn: 100000, gstMode: 'none', cogs: 40000 });
  assert.equal(r.cash.change, 60000);
});

test('per-order ladder when orders are given', () => {
  const r = calculate({ ...REEL, orders: 500 });
  near(r.perOrder.moneyIn, 1000, 0.001, 'per order money');
  near(r.perOrder.netProfit, -31.81, 0.01, 'per order net');
  assert.equal(calculate(REEL).perOrder, null);
});

test('what-if: price, returns, marketing, rent/staff', () => {
  const base = calculate(REEL);
  const up = calculate(applyWhatIf(REEL, { price: 10 }));
  near(up.moneyIn, 550000, 0.01, 'price lifts money in');
  assert.equal(up.cogs, base.cogs, 'product cost unchanged when price rises');
  assert.ok(up.netProfit > base.netProfit);

  const lessReturns = calculate(applyWhatIf(REEL, { returns: -50 }));
  near(lessReturns.returns, base.returns / 2, 0.01, 'returns halved');
  near(lessReturns.pbt - base.pbt, base.returns / 2, 0.5, 'PBT gain = half of returns');

  const lessAds = calculate(applyWhatIf(REEL, { marketing: -50 }));
  assert.equal(lessAds.marketing, 55000);

  const leaner = calculate(applyWhatIf(REEL, { fixed: -20 }));
  assert.equal(leaner.fixedCosts, base.fixedCosts - 0.2 * (25000 + 45000));

  const same = calculate(applyWhatIf(REEL, {}));
  assert.equal(same.netProfit, base.netProfit);
});

test('validate: negatives and percentages', () => {
  const { values, errors } = validate({ moneyIn: '-500', returnsPct: '140', rent: '1,20,000', cogs: '', gstRate: 'abc' });
  assert.equal(values.moneyIn, 0);
  assert.equal(errors.moneyIn, 'negative');
  assert.equal(values.returnsPct, 100);
  assert.equal(errors.returnsPct, 'pctRange');
  assert.equal(values.rent, 120000);
  assert.equal(values.cogs, 0);
  assert.equal(errors.cogs, undefined);
  assert.equal(errors.gstRate, 'notNumber');
});

test('depreciation helper: cost ÷ years ÷ 12', () => {
  assert.equal(depreciationFromAsset(240000, 5), 4000);
  assert.equal(depreciationFromAsset(100000, 0), 0);
});

test('every preset calculates without NaN and examples stay plausible', () => {
  for (const [key, preset] of Object.entries(PRESETS)) {
    const r = calculate(preset.example);
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v), `${key}.${k} is ${v}`);
    }
    if (key !== 'blank') assert.ok(r.moneyIn > 0, `${key} has example sales`);
  }
  // The D2C preset is the reel example
  const d2c = calculate(PRESETS.d2c.example);
  near(d2c.netProfit, -15905, 1, 'd2c preset net');
});
