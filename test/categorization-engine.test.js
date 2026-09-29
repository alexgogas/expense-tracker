// Tests for categorization-engine.js — run with `node --test test/categorization-engine.test.js`
// from the repo root (or `npm test` in web/).
// All reference numbers, names, and amounts below are fake.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const e = require(path.join(__dirname, '..', 'categorization-engine.js'));

const REFS = { isk: '11112222333', externalSavings: '44445555666', personkontoLink: '77778888999', housingFeeBankgiro: '123-4567' };

const categories = results => results.map(r => [r.merchant, r.category]);

test('default rules categorize by pattern, first match wins', () => {
  const { results, unmatched } = e.processImport([
    { Datum: '2026-01-01', Specifikation: 'RYANAIR DUBLIN', Belopp: 900 },
    { Datum: '2026-01-02', Specifikation: 'ICA NARA', Belopp: 120 },
    { Datum: '2026-01-03', Specifikation: 'SOME UNKNOWN SHOP', Belopp: 10 },
  ], 'eurobonus', {}, {}, {});
  assert.deepEqual(categories(results), [
    ['RYANAIR DUBLIN', 'Flights & Travel Booking'],
    ['ICA NARA', 'Groceries'],
    ['SOME UNKNOWN SHOP', e.UNCATEGORIZED],
  ]);
  assert.deepEqual(unmatched.map(r => r.merchant), ['SOME UNKNOWN SHOP']);
});

test('priority: alias → override → learned lookup → rules', () => {
  const rows = [
    { Datum: '2026-01-01', Specifikation: 'ICA NARA', Belopp: 1 },
    { Datum: '2026-01-02', Specifikation: 'ICA MAXI', Belopp: 1 },
    { Datum: '2026-01-03', Specifikation: 'ica alias', Belopp: 1 },
  ];
  const aliases = { 'ica alias': 'ICA MAXI' };
  const overrides = { 'ICA NARA': 'Shopping/Retail' };
  const learned = { 'ICA MAXI': 'Health & Wellness', 'ICA NARA': 'Transportation' };
  const { results } = e.processImport(rows, 'eurobonus', aliases, overrides, learned);
  assert.deepEqual(categories(results), [
    ['ICA NARA', 'Shopping/Retail'],       // override beats learned + rule
    ['ICA MAXI', 'Health & Wellness'],     // learned beats rule
    ['ICA MAXI', 'Health & Wellness'],     // alias resolved before lookup
  ]);
});

test('custom rules replace defaults; invalid and empty patterns are skipped', () => {
  const rules = [
    { pattern: '(unclosed', category: 'Broken' },
    { pattern: '', category: 'Empty' },
    { pattern: 'RYANAIR', category: 'Travel > Flights' },
    { pattern: '.*', category: 'Catch-all' },
  ];
  const { results, unmatched } = e.processImport([
    { Datum: '2026-01-01', Specifikation: 'RYANAIR X', Belopp: 1 },
    { Datum: '2026-01-02', Specifikation: 'ICA NARA', Belopp: 1 },
  ], 'eurobonus', {}, {}, {}, {}, { rules });
  assert.deepEqual(categories(results), [['RYANAIR X', 'Travel > Flights'], ['ICA NARA', 'Catch-all']]);
  assert.equal(unmatched.length, 0);
});

test('compileRules matches case-insensitively and drops invalid rules', () => {
  const compiled = e.compileRules([{ pattern: 'ryanair', category: 'A' }, { pattern: '[', category: 'B' }]);
  assert.equal(compiled.length, 1);
  assert.equal(e.categorizeMerchant('RYANAIR', {}, {}, {}, compiled).category, 'A');
});

test('Swish: generic rule excludes, a contact-specific rule placed earlier wins', () => {
  const rows = [
    { Bokforingsdag: '2026-01-01', Belopp: '-200', Rubrik: 'Swish betalning Test Person' },
    { Bokforingsdag: '2026-01-02', Belopp: '-100', Rubrik: 'Swish betalning Someone Else' },
  ];
  assert.deepEqual(categories(e.processImport(rows, 'personkonto', {}, {}, {}).results), [
    ['Swish: Test Person', e.EXCLUDED], ['Swish: Someone Else', e.EXCLUDED],
  ]);
  const rules = [{ pattern: '^Swish: Test Person', category: 'Groceries' }, ...e.DEFAULT_CATEGORIZATION_RULES];
  assert.deepEqual(categories(e.processImport(rows, 'personkonto', {}, {}, {}, {}, { rules }).results), [
    ['Swish: Test Person', 'Groceries'], ['Swish: Someone Else', e.EXCLUDED],
  ]);
});

test('Personkonto: salary, card purchases, sign, and override beating a forced category', () => {
  const rows = [
    { Bokforingsdag: '2026-01-25', Belopp: '30000', Rubrik: 'Lön' },
    { Bokforingsdag: '2026-01-03', Belopp: '-99', Rubrik: 'Kortköp 260103 SPOTIFY' },
    { Bokforingsdag: '2026-01-04', Belopp: '-500', Rubrik: 'Överföring 123' },
  ];
  const { results } = e.processImport(rows, 'personkonto', {}, { 'Lön (salary)': 'Other > 7-Eleven' }, {});
  assert.deepEqual(categories(results), [
    ['Lön (salary)', 'Other > 7-Eleven'],             // explicit override beats the forced Excluded
    ['SPOTIFY', 'Subscriptions/Digital Services'],
    ['Överföring 123', e.EXCLUDED],
  ]);
  assert.equal(results[1].amount, 99);
  assert.equal(results[1]._rawSign, -1);
  assert.equal(results[0]._rawSign, 1);
});

test('housing fee needs a configured Bankgiro and uses the housingFee role', () => {
  const rows = [{ Bokforingsdag: '2026-01-01', Belopp: '-4000', Rubrik: 'Open Banking BG 123-4567 Fake Assoc' }];
  const configured = e.processImport(rows, 'personkonto', {}, {}, {}, REFS).results[0];
  assert.equal(configured.merchant, 'Housing association fee (BG 123-4567)');
  assert.equal(configured.category, e.DEFAULT_CATEGORY_ROLES.housingFee);

  const unset = e.processImport(rows, 'personkonto', {}, {}, {}, { housingFeeBankgiro: '' }).results[0];
  assert.equal(unset.merchant, 'Open Banking BG 123-4567 Fake Assoc');
  assert.equal(unset.category, e.UNCATEGORIZED);

  const renamed = e.processImport(rows, 'personkonto', {}, {}, {}, REFS, { roles: { housingFee: 'Home > Fee' } }).results[0];
  assert.equal(renamed.category, 'Home > Fee');
});

test('Sparkonto: roles, flow buckets, and empty references never matching', () => {
  const rows = [
    { Bokforingsdag: '2026-01-27', Belopp: '-12000', Rubrik: 'Omsättning lån 42' },
    { Bokforingsdag: '2026-01-10', Belopp: '-5000', Rubrik: 'Överföring 1111 22 22333' },
    { Bokforingsdag: '2026-01-11', Belopp: '3000', Rubrik: 'UTTAG NML' },
    { Bokforingsdag: '2026-01-12', Belopp: '-10000', Rubrik: 'Ny FASTRÄNTEPLACERING' },
    { Bokforingsdag: '2026-01-13', Belopp: '-300', Rubrik: 'Uttag' },
  ];
  const { results } = e.processImport(rows, 'sparkonto', {}, {}, {}, REFS, { roles: { mortgageCost: 'Home > Loan' } });
  assert.deepEqual(results.map(r => [r.merchant, r.category, r._flowBucket]), [
    ['Omsättning lån 42', 'Home > Loan', null],
    ['ISK transfer', e.EXCLUDED, 'isk'],                     // spaced reference still matches
    ['External savings (44445555666)', e.EXCLUDED, 'external-savings'],
    ['Fasträntplacering', e.EXCLUDED, 'fixed-term-deposit'],
    ['Uttag', e.UNCATEGORIZED, null],
  ]);

  // ''.includes('') is true for every string — an unset reference must not tag everything.
  const unsetRefs = e.processImport([rows[1]], 'sparkonto', {}, {}, {}, { isk: '', externalSavings: '', personkontoLink: '' }).results[0];
  assert.equal(unsetRefs._flowBucket, null);
});

test('summary/footer rows without a valid date, merchant, or amount are dropped', () => {
  const { results } = e.processImport([
    { Datum: '2026-01-01', Specifikation: 'ICA NARA', Belopp: 10 },
    { Datum: 'Totalt belopp', Specifikation: 'Summa', Belopp: 999 },
    { Datum: '2026-01-02', Specifikation: '   ', Belopp: 5 },
  ], 'eurobonus', {}, {}, {});
  assert.deepEqual(results.map(r => r.merchant), ['ICA NARA']);
});

test('card parsers skip payments and fees; Amex takes the merchant before the column gap', () => {
  const eb = e.parseEuroBonusRows([
    { Datum: '2026-01-01', Specifikation: 'Inbetalning', Belopp: -500 },
    { Datum: '2026-01-02', Specifikation: 'Avgift ersättningskort', Belopp: 50 },
    { Datum: '2026-01-03', Specifikation: 'SHOP', Belopp: 20 },
  ]);
  assert.deepEqual(eb.map(r => [r.merchant, r.card]), [['SHOP', 'EuroBonus']]);

  const amex = e.parseAmexRows([
    { Datum: '2026-01-01', Beskrivning: 'BETALNING MOTTAGEN, TACK', Belopp: -500 },
    { Datum: '2026-01-02', Beskrivning: 'SOME MERCHANT    SOMECITY EXTRA TEXT', Belopp: 30 },
  ]);
  assert.deepEqual(amex.map(r => [r.merchant, r.card]), [['SOME MERCHANT', 'Amex']]);
});

test('unknown format throws', () => {
  assert.throws(() => e.processImport([], 'nope', {}, {}, {}), /Unknown format/);
});
