// Business types. Numbers are round EXAMPLES for a small Indian business of each kind,
// shown with an "Example" tag. They are not industry benchmarks.
// Labels and hints for each type live in i18n.js under keys like `field.cogs.label.cafe`.

import { EMPTY_INPUT } from './engine.js';

const base = { ...EMPTY_INPUT };

export const PRESET_ORDER = ['d2c', 'shop', 'cafe', 'service', 'maker'];

export const PRESETS = {
  // The worked example from the reel.
  d2c: {
    icon: 'parcel',
    example: {
      ...base,
      moneyIn: 500000, gstIncluded: true, gstMode: 'regular', gstRate: 5, orders: 500,
      returnsMode: 'pct', returnsPct: 8,
      cogs: 160000,
      packaging: 45000, shipping: 12000, paymentFeePct: 2, commissionPct: 0, otherVariable: 0,
      marketing: 110000,
      rent: 25000, staff: 45000, ownerSalary: 30000, utilities: 8000, otherFixed: 0,
      interest: 4000, depreciation: 5000, taxRate: 25,
      stockBought: 190000, udhaarGiven: 0, udhaarCollected: 0, supplierCredit: 20000, supplierPaid: 10000,
      loanPrincipal: 6000, personalWithdrawals: 0,
    },
  },
  shop: {
    icon: 'shop',
    example: {
      ...base,
      moneyIn: 400000, gstIncluded: true, gstMode: 'composition', compositionRate: 1, gstRate: 5, orders: 3000,
      returnsMode: 'pct', returnsPct: 1,
      cogs: 312000,
      packaging: 2000, shipping: 3000, paymentFeePct: 0.5, commissionPct: 0, otherVariable: 0,
      marketing: 2000,
      rent: 20000, staff: 18000, ownerSalary: 25000, utilities: 4000, otherFixed: 0,
      interest: 0, depreciation: 1000, taxRate: 0,
      stockBought: 330000, udhaarGiven: 30000, udhaarCollected: 22000, supplierCredit: 40000, supplierPaid: 35000,
      loanPrincipal: 0, personalWithdrawals: 0,
    },
  },
  cafe: {
    icon: 'cup',
    example: {
      ...base,
      moneyIn: 600000, gstIncluded: true, gstMode: 'regular', gstRate: 5, orders: 2400,
      returnsMode: 'pct', returnsPct: 2,
      cogs: 170000,
      packaging: 15000, shipping: 0, paymentFeePct: 1.5, commissionPct: 10, otherVariable: 0,
      marketing: 20000,
      rent: 80000, staff: 100000, ownerSalary: 40000, utilities: 35000, otherFixed: 10000,
      interest: 6000, depreciation: 12000, taxRate: 0,
      stockBought: 180000, udhaarGiven: 0, udhaarCollected: 0, supplierCredit: 25000, supplierPaid: 20000,
      loanPrincipal: 15000, personalWithdrawals: 0,
    },
  },
  service: {
    icon: 'spark',
    example: {
      ...base,
      moneyIn: 354000, gstIncluded: true, gstMode: 'regular', gstRate: 18, orders: 40,
      returnsMode: 'pct', returnsPct: 2,
      cogs: 15000,
      packaging: 0, shipping: 0, paymentFeePct: 1, commissionPct: 0, otherVariable: 20000,
      marketing: 15000,
      rent: 25000, staff: 120000, ownerSalary: 50000, utilities: 12000, otherFixed: 5000,
      interest: 0, depreciation: 3000, taxRate: 20,
      stockBought: null, udhaarGiven: 80000, udhaarCollected: 50000, supplierCredit: 0, supplierPaid: 0,
      loanPrincipal: 0, personalWithdrawals: 10000,
    },
  },
  maker: {
    icon: 'gear',
    example: {
      ...base,
      moneyIn: 1200000, gstIncluded: true, gstMode: 'regular', gstRate: 18, orders: 60,
      returnsMode: 'pct', returnsPct: 3,
      cogs: 520000,
      packaging: 25000, shipping: 35000, paymentFeePct: 0.2, commissionPct: 2, otherVariable: 40000,
      marketing: 15000,
      rent: 60000, staff: 110000, ownerSalary: 60000, utilities: 15000, otherFixed: 10000,
      interest: 25000, depreciation: 30000, taxRate: 25,
      stockBought: 600000, udhaarGiven: 300000, udhaarCollected: 220000, supplierCredit: 150000, supplierPaid: 120000,
      loanPrincipal: 40000, personalWithdrawals: 0,
    },
  },
  blank: {
    icon: 'blank',
    example: { ...base, gstRate: 18 },
  },
};
