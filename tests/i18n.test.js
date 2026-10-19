import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, GLOSSARY, formatINR, formatShort, formatPer100, translate } from '../src/i18n.js';

test('Hindi has every English string', () => {
  const missing = Object.keys(STRINGS.en).filter((k) => !(k in STRINGS.hi));
  assert.deepEqual(missing, []);
});

test('every glossary term has a definition, example and why, in both languages', () => {
  assert.equal(GLOSSARY.en.length, 18);
  assert.equal(GLOSSARY.hi.length, GLOSSARY.en.length);
  for (const lang of ['en', 'hi']) {
    for (const [key, title, def, ex, why] of GLOSSARY[lang]) {
      for (const part of [key, title, def, ex, why]) assert.ok(part && part.length > 1, `${lang}.${key}`);
      assert.ok(ex.includes('₹'), `${lang}.${key} example has a ₹ amount`);
    }
  }
  assert.deepEqual(GLOSSARY.hi.map((g) => g[0]), GLOSSARY.en.map((g) => g[0]));
});

test('Indian number format', () => {
  assert.equal(formatINR(123456), '₹1,23,456');
  assert.equal(formatINR(-15904.76), '−₹15,905');
  assert.equal(formatShort(440000), '₹4.4 lakh');
  assert.equal(formatShort(12000000, 'hi'), '₹1.2 करोड़');
  assert.equal(formatShort(500000), '₹5 lakh');
  assert.equal(formatPer100(-3.18), '−₹3.2');
  assert.equal(formatPer100(24.75), '₹25');
});

test('type overrides and variables', () => {
  assert.equal(translate('en', 'field.cogs.label', null, 'cafe'), 'Food and drink cost');
  assert.equal(translate('en', 'field.cogs.label', null, 'nope'), 'Cost of what you sold');
  assert.equal(translate('en', 'live.keep', { x: '₹4' }), 'You keep ₹4 of every ₹100');
});
