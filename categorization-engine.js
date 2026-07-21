// categorization-engine.js
// Portable client-side engine for parsing bank/card exports and categorizing transactions.
// Used by the standalone app to process newly-uploaded files without needing manual processing.

const CATEGORY_TREE = [
  { key: "Restaurants, Cafes & Bars", subs: ["Restaurant", "Lunch", "Bars", "Cafe/Bakery", "Other"] },
  // Utilities live only here now, not as a separate flat "Bills/Utilities" top-level category —
  // existing data already filed under the old category can be moved with the Categories card's
  // "Merge into..." action (merge "Bills/Utilities" into "Housing/Mortgage > Utilities").
  { key: "Housing/Mortgage", subs: ["Interest", "Amortization", "Utilities"] },
  { key: "Greece", subs: null },
  { key: "Transportation", subs: null },
  { key: "Flights & Travel Booking", subs: null },
  { key: "Groceries", subs: null },
  { key: "Shopping/Retail", subs: null },
  { key: "Health & Wellness", subs: null },
  { key: "Subscriptions/Digital Services", subs: null },
  { key: "Delivery Apps", subs: null },
  { key: "Other", subs: ["7-Eleven", "Uncategorized"] },
  { key: "Excluded", subs: null },
];

const LEAF_CATEGORIES = [];
CATEGORY_TREE.forEach(cat => {
  if (cat.subs) cat.subs.forEach(sub => LEAF_CATEGORIES.push(cat.key + " > " + sub));
  else LEAF_CATEGORIES.push(cat.key);
});

// ---------- Fallback keyword rules ----------
// Used only when a merchant has no alias, no override, and no entry in the learned
// merchant->category lookup. Best-effort; anything unmatched surfaces to the user.
const KEYWORD_RULES = [
  { pattern: /UBER|TAXI|\bSL\b|ARLANDA EXPRESS|ARLANDA WALK|ARRIVA|KEOLIS|KTEL|\bNS\b|DSB/i, category: "Transportation" },
  { pattern: /RYANAIR|EUROWINGS|FERRYSCANNER|BKG\*HOTEL|HOTEL|AEGEAN|FLYSAS|KIWI\.COM|TRAVIX/i, category: "Flights & Travel Booking" },
  { pattern: /\bICA\b|COOP |HEMKOP|HEMKÖP|ALBERT HEIJN|SYSTEMBOLAGET|X:-TRA|XTRA ASPUDDEN|MASOUTIS/i, category: "Groceries" },
  { pattern: /APOTEKET|APOTEK|FARMAKEIO|TANDVAYRD|TANDHYGIENIST|TANDLAKARE|APOHEM|APOTEA|BADTOOTH/i, category: "Health & Wellness" },
  { pattern: /BAGERI|COFFEE|KAFFE|GELATO|KONDITORI|CAFE |CAFÉ/i, category: "Restaurants, Cafes & Bars > Cafe/Bakery" },
  { pattern: /\bBAR\b|PUB |BREWDOG|TAVERN|BEER|OLSTUGAN|NIGHTCLUB|LOUNGE/i, category: "Restaurants, Cafes & Bars > Bars" },
  { pattern: /RESTAURANG|RESTAURANT|BURGER|GRILL|PIZZA|PIZZERIA|KEBAB|THAI|SUSHI/i, category: "Restaurants, Cafes & Bars > Restaurant" },
  { pattern: /GOOGLE PLAY|PRIME VIDEO|SPOTIFY|MICROSOFT|ADOBE|NETFLIX|ANTHROPIC|APPLE\.COM/i, category: "Subscriptions/Digital Services" },
  { pattern: /7-ELEVEN|PRESSBYRAN|PRESSBYRÅN/i, category: "Other > 7-Eleven" },
  { pattern: /UBER.*EATS|WOLT|FOODORA/i, category: "Delivery Apps" },
];

function applyKeywordRules(merchant) {
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(merchant)) return rule.category;
  }
  return null;
}

// ---------- Main categorization function ----------
// aliases: { rawName: canonicalName }
// overrides: { canonicalName: category }
// learnedLookup: { canonicalName: category }  (built from the existing categorized history)
function categorizeMerchant(rawMerchant, aliases, overrides, learnedLookup) {
  const trimmed = rawMerchant.trim();
  const canonical = aliases[trimmed] || trimmed;

  if (overrides[canonical]) {
    return { merchant: canonical, category: overrides[canonical], matched: 'override' };
  }
  if (learnedLookup[canonical]) {
    return { merchant: canonical, category: learnedLookup[canonical], matched: 'learned' };
  }
  const keywordMatch = applyKeywordRules(canonical);
  if (keywordMatch) {
    return { merchant: canonical, category: keywordMatch, matched: 'keyword' };
  }
  return { merchant: canonical, category: 'Other > Uncategorized', matched: 'none' };
}

// ---------- Format-specific parsers ----------
// Each parser takes raw rows (already extracted from xlsx/csv by the browser)
// and returns [{ txn_date, merchant, amount, card }]

function parseEuroBonusRows(rows) {
  // rows: array of {Datum, Specifikation, Belopp} from the "Transaktioner" sheet
  const out = [];
  for (const row of rows) {
    if (!row.Datum || row.Specifikation === 'Inbetalning') continue;
    if (/Avgift ersättningskort/i.test(row.Specifikation || '')) continue;
    out.push({
      txn_date: row.Datum, // expects already-normalized YYYY-MM-DD
      merchant: String(row.Specifikation).trim(),
      amount: parseFloat(row.Belopp),
      card: 'EuroBonus'
    });
  }
  return out;
}

function parseAmexRows(rows) {
  // rows: array of {Datum, Beskrivning, Belopp} from "Transaktionsspecifikationer"
  const out = [];
  for (const row of rows) {
    if (!row.Datum || row.Beskrivning === 'BETALNING MOTTAGEN, TACK') continue;
    const parts = String(row.Beskrivning).trim().split(/\s{2,}/);
    const merchant = parts[0].trim();
    out.push({
      txn_date: row.Datum,
      merchant: merchant,
      amount: parseFloat(row.Belopp),
      card: 'Amex'
    });
  }
  return out;
}

function parsePersonkontoRows(rows) {
  // rows: array of {Bokforingsdag, Belopp, Rubrik} from the Nordea CSV
  const out = [];
  for (const row of rows) {
    const rubrik = String(row.Rubrik || '').trim();
    const amount = parseFloat(row.Belopp);
    let merchant = rubrik;
    let category = null;

    if (/^Swish (betalning|inbetalning)/i.test(rubrik)) {
      const name = rubrik.replace(/^Swish (betalning|inbetalning)\s+/i, '').trim();
      merchant = 'Swish: ' + name;
      const upper = name.toUpperCase();
      if (upper.includes('JAN ARONSSON')) category = 'Health & Wellness';
      else if (upper.includes('LACHANAS')) category = amount < 0 ? 'Health & Wellness' : 'Excluded';
      else category = 'Excluded';
    } else if (/^Kortköp/i.test(rubrik)) {
      const m = rubrik.match(/^Kortköp\s+\d{6}\s+(.+)$/i);
      merchant = m ? m[1].trim() : rubrik;
    } else if (/SAS EuroBonus|EUROBONUS|American Exp/i.test(rubrik)) {
      category = 'Excluded';
    } else if (/^Överföring/i.test(rubrik)) {
      category = 'Excluded';
    } else if (rubrik === 'Lön') {
      merchant = 'Lön (salary)';
      category = 'Excluded';
    } else if (/^Nordea Vardagspaket/i.test(rubrik)) {
      merchant = 'Nordea Vardagspaket';
      category = 'Excluded';
    }
    // Autogiro, Betalning BG/PG, Open Banking, Kontantuttag: leave category null, resolved downstream

    out.push({
      txn_date: row.Bokforingsdag,
      merchant: merchant,
      amount: Math.abs(amount),
      card: 'Personkonto',
      _forcedCategory: category,
      _rawSign: amount < 0 ? -1 : 1
    });
  }
  return out;
}

// ---------- Full pipeline: parse + categorize + merge ----------
// Guards against summary/footer/total rows in a bank export leaking through as fake
// transactions — e.g. a trailing "Totalt belopp" row whose amount column happens to hold a
// real number. A row only counts as a transaction if it has a well-formed date, a non-empty
// merchant, and a finite amount.
function isValidParsedRow(row) {
  return !!(row &&
    typeof row.txn_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.txn_date) &&
    row.merchant && String(row.merchant).trim().length > 0 &&
    typeof row.amount === 'number' && isFinite(row.amount));
}

function processImport(rawRows, format, aliases, overrides, learnedLookup) {
  let parsed;
  if (format === 'eurobonus') parsed = parseEuroBonusRows(rawRows);
  else if (format === 'amex') parsed = parseAmexRows(rawRows);
  else if (format === 'personkonto') parsed = parsePersonkontoRows(rawRows);
  else throw new Error('Unknown format: ' + format);

  parsed = parsed.filter(isValidParsedRow);

  const results = [];
  const unmatched = [];

  for (const txn of parsed) {
    const canonical = aliases[txn.merchant.trim()] || txn.merchant.trim();

    // Explicit overrides always win, even over a format's hardcoded default (e.g. Swish -> Excluded)
    if (overrides[canonical]) {
      results.push({ ...txn, merchant: canonical, category: overrides[canonical] });
      continue;
    }
    if (txn._forcedCategory) {
      results.push({ ...txn, merchant: canonical, category: txn._forcedCategory });
      continue;
    }
    const { merchant, category, matched } = categorizeMerchant(txn.merchant, aliases, overrides, learnedLookup);
    const record = { ...txn, merchant, category };
    results.push(record);
    if (matched === 'none') unmatched.push(record);
  }

  return { results, unmatched };
}

// Exports for use in the browser app
if (typeof module !== 'undefined') {
  module.exports = {
    CATEGORY_TREE, LEAF_CATEGORIES, categorizeMerchant, processImport, isValidParsedRow,
    parseEuroBonusRows, parseAmexRows, parsePersonkontoRows, generateLoanEntries
  };
}

// ---------- Recurring mortgage/loan entries ----------
// These aren't parsed from any file; they're fixed monthly amounts, generated on demand
// for any month not already present in the dataset.
const LOAN_MONTHLY = {
  interest: 5326.0,      // after-tax monthly interest
  amortization: 6667.0,  // monthly amortization (current >70% LTV tier)
  utilities: 4100.0      // flat monthly utilities estimate
};

function generateLoanEntries(monthLabel) {
  // monthLabel: e.g. "Aug-26"
  const [mon, yy] = monthLabel.split('-');
  const monthNum = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }[mon];
  const txnDate = '20' + yy + '-' + String(monthNum).padStart(2, '0') + '-15';
  return [
    { txn_date: txnDate, month: monthLabel, merchant: 'Mortgage interest (after tax)', amount: LOAN_MONTHLY.interest, category: 'Housing/Mortgage > Interest', card: 'Loan' },
    { txn_date: txnDate, month: monthLabel, merchant: 'Mortgage amortization', amount: LOAN_MONTHLY.amortization, category: 'Housing/Mortgage > Amortization', card: 'Loan' },
    { txn_date: txnDate, month: monthLabel, merchant: 'Housing utilities', amount: LOAN_MONTHLY.utilities, category: 'Housing/Mortgage > Utilities', card: 'Loan' },
  ];
}
