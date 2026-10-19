// Asli Munafa calculation engine.
// Pure functions only: no DOM, no storage, no network. All inputs are monthly.
// Percentages are passed as plain numbers (5 means 5%).

export const MONEY_FIELDS = [
  'moneyIn', 'returnsAmount', 'cogs', 'packaging', 'shipping', 'otherVariable', 'marketing',
  'rent', 'staff', 'ownerSalary', 'utilities', 'otherFixed', 'interest', 'depreciation', 'orders',
  'stockBought', 'udhaarGiven', 'udhaarCollected', 'supplierCredit', 'supplierPaid',
  'loanPrincipal', 'personalWithdrawals',
];
export const PCT_FIELDS = ['gstRate', 'compositionRate', 'returnsPct', 'paymentFeePct', 'commissionPct', 'taxRate'];

// Fields where "left blank" means something other than zero.
const OPTIONAL_FIELDS = new Set(['stockBought', 'orders']);

export const EMPTY_INPUT = Object.freeze({
  moneyIn: 0, gstIncluded: true, gstMode: 'regular', gstRate: 5, compositionRate: 1,
  returnsMode: 'pct', returnsPct: 0, returnsAmount: 0,
  cogs: 0, packaging: 0, shipping: 0, paymentFeePct: 0, commissionPct: 0, otherVariable: 0,
  marketing: 0, rent: 0, staff: 0, ownerSalary: 0, utilities: 0, otherFixed: 0,
  interest: 0, depreciation: 0, taxRate: 0, orders: null,
  stockBought: null, udhaarGiven: 0, udhaarCollected: 0, supplierCredit: 0, supplierPaid: 0,
  loanPrincipal: 0, personalWithdrawals: 0,
});

/** Parse a user-typed number: accepts "1,20,000", "₹ 4500", "12.5", "". Returns NaN when not a number. */
export function parseNumber(raw) {
  if (raw === null || raw === undefined) return NaN;
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw).replace(/[₹,\s%]/g, '').replace(/^rs\.?/i, '');
  if (cleaned === '') return NaN;
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

const isBlank = (raw) => raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');

/**
 * Turn raw form values into clean numbers and friendly error codes.
 * Empty → 0 (or null for optional fields). Never throws.
 * Error codes: 'negative' | 'pctRange' | 'notNumber'
 */
export function validate(raw = {}) {
  const values = { ...EMPTY_INPUT };
  const errors = {};
  for (const [key, val] of Object.entries(raw)) {
    if (MONEY_FIELDS.includes(key) || PCT_FIELDS.includes(key)) {
      if (isBlank(val)) {
        values[key] = OPTIONAL_FIELDS.has(key) ? null : 0;
        continue;
      }
      const n = parseNumber(val);
      if (!Number.isFinite(n)) { errors[key] = 'notNumber'; values[key] = OPTIONAL_FIELDS.has(key) ? null : 0; continue; }
      if (n < 0) { errors[key] = 'negative'; values[key] = 0; continue; }
      if (PCT_FIELDS.includes(key) && n > 100) { errors[key] = 'pctRange'; values[key] = 100; continue; }
      values[key] = n;
    } else if (val !== undefined) {
      values[key] = val;
    }
  }
  return { values, errors };
}

// Coerce anything into a safe non-negative number.
const num = (x) => {
  const n = typeof x === 'number' ? x : parseNumber(x);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const pct = (x) => Math.min(100, num(x)) / 100;
const opt = (x) => (x === null || x === undefined || x === '' ? null : num(x));

/** "Out of every ₹100 your customers paid". */
export function per100(x, moneyIn) {
  return moneyIn > 0 ? (x / moneyIn) * 100 : 0;
}

/** Standard margin: share of net revenue. */
export function marginPct(x, netRevenue) {
  return netRevenue > 0 ? (x / netRevenue) * 100 : 0;
}

/** Monthly depreciation: cost ÷ years it will last ÷ 12. */
export function depreciationFromAsset(cost, years) {
  const c = num(cost);
  const y = num(years);
  return y > 0 ? c / y / 12 : 0;
}

function normalise(input) {
  const i = { ...EMPTY_INPUT, ...input };
  return {
    G: num(i.moneyIn),
    gstIncluded: i.gstIncluded !== false && i.gstIncluded !== 'no',
    gstMode: ['regular', 'composition', 'none'].includes(i.gstMode) ? i.gstMode : 'regular',
    r: pct(i.gstRate),
    c: i.compositionRate === undefined || i.compositionRate === null || i.compositionRate === '' ? 0.01 : pct(i.compositionRate),
    returnsMode: i.returnsMode === 'amount' ? 'amount' : 'pct',
    returnsPct: pct(i.returnsPct),
    returnsAmount: num(i.returnsAmount),
    cogs: num(i.cogs),
    packaging: num(i.packaging),
    shipping: num(i.shipping),
    paymentFee: pct(i.paymentFeePct),
    commission: pct(i.commissionPct),
    otherVariable: num(i.otherVariable),
    marketing: num(i.marketing),
    rent: num(i.rent),
    staff: num(i.staff),
    ownerSalary: num(i.ownerSalary),
    utilities: num(i.utilities),
    otherFixed: num(i.otherFixed),
    interest: num(i.interest),
    depreciation: num(i.depreciation),
    taxRate: pct(i.taxRate),
    orders: opt(i.orders),
    stockBought: opt(i.stockBought),
    udhaarGiven: num(i.udhaarGiven),
    udhaarCollected: num(i.udhaarCollected),
    supplierCredit: num(i.supplierCredit),
    supplierPaid: num(i.supplierPaid),
    loanPrincipal: num(i.loanPrincipal),
    personalWithdrawals: num(i.personalWithdrawals),
  };
}

// Lines that can be "leaks". Owner salary and depreciation are left out on purpose:
// one is the owner's own pay, the other isn't money going out this month.
const LEAK_KEYS = ['returns', 'cogs', 'delivery', 'fees', 'otherVariable', 'marketing', 'rent', 'staff', 'utilities', 'otherFixed', 'interest', 'compositionTax'];

/** The full profit ladder. */
export function calculate(input = {}) {
  const n = normalise(input);
  const G = n.G;

  let salesExGst = G;
  let gstCollected = 0;
  let compositionTax = 0;
  if (n.gstMode === 'regular') {
    if (n.gstIncluded) {
      salesExGst = G / (1 + n.r);
      gstCollected = G - salesExGst;
    } else {
      gstCollected = G * n.r; // for info only: not part of profit
    }
  } else if (n.gstMode === 'composition') {
    compositionTax = G * n.c;
  }

  const returns = n.returnsMode === 'amount' ? n.returnsAmount : salesExGst * n.returnsPct;
  const netRevenue = salesExGst - returns - compositionTax;
  const cm1 = netRevenue - n.cogs;

  const delivery = n.packaging + n.shipping;
  const paymentFees = n.paymentFee * G;
  const commission = n.commission * salesExGst;
  const fees = paymentFees + commission;
  const sellingCosts = delivery + fees + n.otherVariable;
  const cm2 = cm1 - sellingCosts;
  const cm3 = cm2 - n.marketing;

  const fixedCosts = n.rent + n.staff + n.ownerSalary + n.utilities + n.otherFixed;
  const ebitda = cm3 - fixedCosts;
  const pbt = ebitda - n.depreciation - n.interest;
  const tax = Math.max(0, pbt) * n.taxRate;
  const netProfit = pbt - tax;
  const naiveProfit = G - n.cogs;

  const lines = {
    moneyIn: G, gstCollected, salesExGst, returns, compositionTax, netRevenue,
    cogs: n.cogs, cm1, packaging: n.packaging, shipping: n.shipping, delivery, paymentFees, commission, fees,
    otherVariable: n.otherVariable, sellingCosts, cm2, marketing: n.marketing, cm3,
    rent: n.rent, staff: n.staff, ownerSalary: n.ownerSalary, utilities: n.utilities, otherFixed: n.otherFixed,
    fixedCosts, ebitda, depreciation: n.depreciation, interest: n.interest, pbt, tax, netProfit, naiveProfit,
  };

  // GST that counts against "money in": only when it's inside G.
  const gstInsideMoneyIn = n.gstMode === 'regular' && n.gstIncluded ? gstCollected : 0;

  const result = {
    ...lines,
    gstInsideMoneyIn,
    gstMode: n.gstMode,
    gstIncluded: n.gstIncluded,
    taxRate: n.taxRate,
    per100: {},
    margin: {},
  };
  for (const [k, v] of Object.entries(lines)) {
    result.per100[k] = per100(v, G);
    result.margin[k] = marginPct(v, netRevenue);
  }

  result.breakEven = breakEven({ G, cm3, fixed: fixedCosts + n.depreciation + n.interest });
  result.leaks = leaks(result);
  result.flags = flags(result, n);
  result.perOrder = n.orders && n.orders > 0
    ? Object.fromEntries(Object.entries(lines).map(([k, v]) => [k, v / n.orders]))
    : null;
  result.orders = n.orders;
  result.cash = cash(n, result);
  return result;
}

/**
 * Break-even money-in. COGS, selling costs, returns and marketing scale with sales;
 * rent, staff, owner salary, bills, depreciation and interest stay fixed.
 * CM3 is then linear in G: CM3(G') = CM3 × G'/G, so PBT(G') = 0 at G' = fixed × G / CM3.
 */
function breakEven({ G, cm3, fixed }) {
  if (G <= 0) return { sales: null, reachable: false, reason: 'noSales', gap: null };
  if (cm3 <= 0) return { sales: null, reachable: false, reason: 'cm3', gap: null };
  const sales = (fixed * G) / cm3;
  return { sales, reachable: true, reason: null, gap: sales - G };
}

function leaks(r) {
  if (r.netRevenue <= 0) return [];
  return LEAK_KEYS
    .map((key) => ({ key, amount: r[key], pctOfNR: (r[key] / r.netRevenue) * 100, per100: r.per100[key] }))
    .filter((l) => l.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
}

function flags(r, n) {
  const out = [];
  if (r.moneyIn <= 0) { out.push('noSales'); return out; }
  if (r.cm2 < 0) out.push('cm2Negative');
  else if (r.cm3 < 0) out.push('cm3Negative');
  else if (r.pbt < 0) out.push('belowBreakEven');
  if (n.ownerSalary <= 0) out.push('noOwnerSalary');
  if (r.gstInsideMoneyIn > 0) out.push('gstIsNotIncome');
  if (r.netRevenue <= 0) out.push('noNetRevenue');
  return out;
}

function cash(n, r) {
  const stockBought = n.stockBought === null ? n.cogs : n.stockBought;
  const parts = {
    netProfit: r.netProfit,
    depreciation: n.depreciation,
    extraStock: -(stockBought - n.cogs),
    udhaar: -(n.udhaarGiven - n.udhaarCollected),
    supplierCredit: n.supplierCredit - n.supplierPaid,
    loanPrincipal: -n.loanPrincipal,
    personal: -n.personalWithdrawals,
  };
  const change = Object.values(parts).reduce((a, b) => a + b, 0);
  return { change, parts, gap: change - r.netProfit };
}

/** Estimated change in cash this month. */
export function cashChange(input, result = calculate(input)) {
  return result.cash.change;
}

/**
 * What-if scenarios, all in percent changes:
 *   price     −10…+10  money in rises with price; units (and so product, delivery costs) stay the same
 *   returns   −50…+50
 *   marketing −50…+50
 *   fixed     −20…+20  rent and staff
 */
export function applyWhatIf(input, w = {}) {
  const f = (k) => 1 + (Number(w[k]) || 0) / 100;
  const out = { ...EMPTY_INPUT, ...input };
  const price = f('price');
  out.moneyIn = num(out.moneyIn) * price;
  if (out.returnsMode === 'amount') out.returnsAmount = num(out.returnsAmount) * price * f('returns');
  else out.returnsPct = Math.min(100, num(out.returnsPct) * f('returns'));
  out.marketing = num(out.marketing) * f('marketing');
  out.rent = num(out.rent) * f('fixed');
  out.staff = num(out.staff) * f('fixed');
  return out;
}
