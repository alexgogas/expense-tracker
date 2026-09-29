// categorization-engine.js
// Portable client-side engine for parsing bank/card exports and categorizing transactions.
// Used by the standalone app to process newly-uploaded files without needing manual processing.

const CATEGORY_TREE = [
  { key: "Restaurants, Cafes & Bars", subs: ["Restaurant", "Lunch", "Bars", "Cafe/Bakery", "Other"] },
  // Utilities live only here now, not as a separate flat "Bills/Utilities" top-level category —
  // existing data already filed under the old category can be moved with the Categories card's
  // "Merge into..." action (merge "Bills/Utilities" into "Housing/Mortgage > Utilities").
  // Interest and Amortization used to be separate subs, but Sparkonto's per-tranche mortgage
  // rollover (see parseSparkontoRows) can't cleanly split between them, so both are tracked as
  // one combined "Amortization/interest" sub instead, sourced only from real Sparkonto rollover
  // transactions (existing data on the old subs was migrated by the original app). Avgift is the
  // recurring Personkonto Bankgiro fee (see parsePersonkontoRows).
  { key: "Housing/Mortgage", subs: ["Amortization/interest", "Avgift", "Utilities"] },
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

// Built-in category names with app-wide meaning: EXCLUDED is left out of every total, UNCATEGORIZED
// flags a row for manual review. These are never user-renamable.
const EXCLUDED = 'Excluded';
const UNCATEGORIZED = 'Other > Uncategorized';

// ---------- Default categorization rules ----------
// Starter set only — the live, user-editable list is `categorizationRules` in app_settings.json,
// passed in via processImport's `options.rules`. Tried in order against the canonical merchant
// name (case-insensitive regex source strings, so they round-trip through JSON); first match wins.
// Used only when a merchant has no override and no learned-lookup entry; anything unmatched
// surfaces to the user for review.
const DEFAULT_CATEGORIZATION_RULES = [
  { pattern: 'UBER|TAXI|\\bSL\\b|ARLANDA EXPRESS|ARLANDA WALK|ARRIVA|KEOLIS|KTEL|\\bNS\\b|DSB', category: 'Transportation' },
  { pattern: 'RYANAIR|EUROWINGS|FERRYSCANNER|BKG\\*HOTEL|HOTEL|AEGEAN|FLYSAS|KIWI\\.COM|TRAVIX', category: 'Flights & Travel Booking' },
  { pattern: '\\bICA\\b|COOP |HEMKOP|HEMKÖP|ALBERT HEIJN|SYSTEMBOLAGET|X:-TRA|\\bXTRA\\b|MASOUTIS', category: 'Groceries' },
  { pattern: 'APOTEKET|APOTEK|FARMAKEIO|TANDVAYRD|TANDHYGIENIST|TANDLAKARE|APOHEM|APOTEA', category: 'Health & Wellness' },
  { pattern: 'BAGERI|COFFEE|KAFFE|GELATO|KONDITORI|CAFE |CAFÉ', category: 'Restaurants, Cafes & Bars > Cafe/Bakery' },
  { pattern: '\\bBAR\\b|PUB |BREWDOG|TAVERN|BEER|OLSTUGAN|NIGHTCLUB|LOUNGE', category: 'Restaurants, Cafes & Bars > Bars' },
  { pattern: 'RESTAURANG|RESTAURANT|BURGER|GRILL|PIZZA|PIZZERIA|KEBAB|THAI|SUSHI', category: 'Restaurants, Cafes & Bars > Restaurant' },
  { pattern: 'GOOGLE PLAY|PRIME VIDEO|SPOTIFY|MICROSOFT|ADOBE|NETFLIX|ANTHROPIC|APPLE\\.COM', category: 'Subscriptions/Digital Services' },
  { pattern: '7-ELEVEN|PRESSBYRAN|PRESSBYRÅN', category: 'Other > 7-Eleven' },
  { pattern: 'UBER.*EATS|WOLT|FOODORA', category: 'Delivery Apps' },
  // Most Swish transfers are personal (splitting a bill, repaying a friend), not real spend — a
  // low-priority default. Add a more specific "^Swish: <name>" rule above it (or override a
  // merchant in the Transactions browser) to categorize a particular contact differently.
  { pattern: '^Swish:', category: EXCLUDED },
];

// Categories the parsers assign by *role* rather than by keyword — also user-editable
// (`categoryRoles` in app_settings.json) so renaming these categories can't break the parsers or
// the Net Worth chart, which looks them up by role too.
const DEFAULT_CATEGORY_ROLES = {
  housing: 'Housing/Mortgage',                                  // top level whose budget the mortgage projection replaces
  housingFee: 'Housing/Mortgage > Avgift',                      // housing-association fee (Personkonto Bankgiro payment)
  mortgageCost: 'Housing/Mortgage > Amortization/interest',     // Sparkonto loan rollover
};

// [{ pattern: string, category }] -> [{ regex, category }], silently skipping empty or invalid
// patterns (the rules editor already flags those) so one bad rule can't break a whole import.
function compileRules(rules) {
  const compiled = [];
  for (const rule of rules || []) {
    if (!rule || !rule.pattern || !rule.category) continue;
    try {
      compiled.push({ regex: new RegExp(rule.pattern, 'i'), category: rule.category });
    } catch (e) { /* invalid regex — skipped */ }
  }
  return compiled;
}

function applyRules(merchant, compiledRules) {
  for (const rule of compiledRules) {
    if (rule.regex.test(merchant)) return rule.category;
  }
  return null;
}

// ---------- Main categorization function ----------
// aliases: { rawName: canonicalName }
// overrides: { canonicalName: category }
// learnedLookup: { canonicalName: category }  (built from the existing categorized history)
// compiledRules: output of compileRules(); defaults to the built-in starter rules.
function categorizeMerchant(rawMerchant, aliases, overrides, learnedLookup, compiledRules = compileRules(DEFAULT_CATEGORIZATION_RULES)) {
  const trimmed = rawMerchant.trim();
  const canonical = aliases[trimmed] || trimmed;

  if (overrides[canonical]) {
    return { merchant: canonical, category: overrides[canonical], matched: 'override' };
  }
  if (learnedLookup[canonical]) {
    return { merchant: canonical, category: learnedLookup[canonical], matched: 'learned' };
  }
  const ruleMatch = applyRules(canonical, compiledRules);
  if (ruleMatch) {
    return { merchant: canonical, category: ruleMatch, matched: 'rule' };
  }
  return { merchant: canonical, category: UNCATEGORIZED, matched: 'none' };
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

function parsePersonkontoRows(rows, references = {}, roles = DEFAULT_CATEGORY_ROLES) {
  // rows: array of {Bokforingsdag, Belopp, Rubrik} from the Nordea CSV
  // references: same private settings object parseSparkontoRows takes — only housingFeeBankgiro
  // is read here (see below).
  const out = [];
  for (const row of rows) {
    const rubrik = String(row.Rubrik || '').trim();
    const amount = parseFloat(row.Belopp);
    let merchant = rubrik;
    let category = null;

    if (/^Swish (betalning|inbetalning)/i.test(rubrik)) {
      const name = rubrik.replace(/^Swish (betalning|inbetalning)\s+/i, '').trim();
      merchant = 'Swish: ' + name;
      // category deliberately left unset here — resolved through the normal alias/override/
      // learned-lookup/rules pipeline (see the "^Swish:" default rule), not forced, so a specific
      // contact can be categorized with a "^Swish: <name>" rule in the user's own settings or an
      // override from the Transactions browser — never by naming anyone in this public file.
    } else if (/^Kortköp/i.test(rubrik)) {
      const m = rubrik.match(/^Kortköp\s+\d{6}\s+(.+)$/i);
      merchant = m ? m[1].trim() : rubrik;
    } else if (/SAS EuroBonus|EUROBONUS|American Exp/i.test(rubrik)) {
      category = EXCLUDED;
    } else if (/^Överföring/i.test(rubrik)) {
      category = EXCLUDED;
    } else if (rubrik === 'Lön') {
      merchant = 'Lön (salary)';
      category = EXCLUDED;
    } else if (rubrik === 'Skatt') {
      // Tax refund (skatteåterbäring) credited to the Personkonto — income, not spend, same
      // treatment as Lön.
      merchant = 'Skatteåterbäring (tax refund)';
      category = EXCLUDED;
    } else if (/^Nordea Vardagspaket/i.test(rubrik)) {
      merchant = 'Nordea Vardagspaket';
      category = EXCLUDED;
    } else if (references.housingFeeBankgiro && rubrik.startsWith('Open Banking BG ' + references.housingFeeBankgiro)) {
      // The recurring housing-association fee ("Avgift", paid via a PSD2/Open Banking-initiated
      // Bankgiro payment to the association's dedicated Bankgiro number — matching on that number
      // rather than the amount, since the fee itself can change over time (e.g. an annual
      // increase) while the payee's Bankgiro number stays fixed. The number itself lives only in
      // the user's private settings (a Bankgiro number can be looked up to identify its owner),
      // and an unset one never matches.
      merchant = `Housing association fee (BG ${references.housingFeeBankgiro})`;
      category = roles.housingFee;
    }
    // Autogiro, Betalning BG/PG, other Open Banking payments, Kontantuttag: leave category null,
    // resolved downstream

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

function parseSparkontoRows(rows, references = {}, roles = DEFAULT_CATEGORY_ROLES) {
  // rows: array of {Bokforingsdag, Belopp, Rubrik} — same shape as Personkonto's raw CSV rows
  // (both are Nordea account exports with identical columns). Rubrik patterns below are the
  // user's own documented conventions for this specific Sparkonto (mortgage loan tranches,
  // fixed-term deposit account, ISK, and an external-bank savings arrangement) — see the
  // "Nordea CSV parsing conventions" reference memory for the full writeup these came from.
  // references: { isk, externalSavings, personkontoLink } — real bank reference numbers, which
  // live only in the user's private Drive-synced settings (see web/src/state.js's
  // sparkontoReferences signal), not in this public source file. Each match below is guarded on
  // the reference being non-empty
  // BEFORE calling .includes() — ''.includes('') is true for every string, so an unset reference
  // must never silently match every transaction.
  const out = [];
  for (const row of rows) {
    const rubrik = String(row.Rubrik || '').trim();
    // Reference numbers appear both spaced ("1234 56 78901") and unspaced ("12345678901") in
    // real exports — match against a whitespace-stripped copy so either form is recognized.
    const rubrikCompact = rubrik.replace(/\s+/g, '');
    const amount = parseFloat(row.Belopp);
    let merchant = rubrik;
    let category = null;
    // _flowBucket tags transactions that move money into/out of a specific owned-elsewhere
    // pot (ISK, an external bank's savings account, a Nordea fixed-term deposit) rather than
    // spending it. Combined with _rawSign (money leaving Sparkonto increases the pot; money
    // returning decreases it) this drives the Net Worth chart's per-pot running balance —
    // these pots aren't tracked via the manual/CSV account-balance grid since their whole
    // history lives in these Sparkonto transactions already.
    let flowBucket = null;

    if (/^Omsättning lån/i.test(rubrik)) {
      // Full loan rollover per tranche — this can't be cleanly split into interest vs.
      // amortization from this data alone, so both are tracked as one combined subcategory
      // (see CATEGORY_TREE's "Amortization/interest"), alongside — not replacing — any
      // pre-existing entries recorded elsewhere (e.g. from a Personkonto import).
      category = roles.mortgageCost;
    } else if (/^(Ny|Förfall|Förtidsinlösen) FASTRÄNTEPL/i.test(rubrik)) {
      // Matches on the "FASTRÄNTEPL" prefix rather than the full "FASTRÄNTEPLACERING" word, since
      // real exports also abbreviate it (e.g. "Förtidsinlösen FASTRÄNTEPL. 4418 00" for an early
      // redemption, which still spells out the full word for Ny/Förfall).
      merchant = 'Fasträntplacering';
      category = EXCLUDED; // internal transfer to/from an owned fixed-term deposit, not spend
      flowBucket = 'fixed-term-deposit'; // principal moving in (Ny) or out (Förfall/Förtidsinlösen)
    } else if (/^(Prel\.skatt|Ränta) FASTRÄNTEPLACERING/i.test(rubrik)) {
      // Tax withheld / interest earned on the deposit — a side effect of holding it, not a
      // change in principal, so this does NOT feed the fixed-term-deposit running balance
      // (avoids double-counting alongside the Ny/Förfall pair around the same rollover).
      merchant = 'Fasträntplacering';
      category = EXCLUDED;
    } else if (/^(Ränta|Preliminär skatt) \d{4}$/i.test(rubrik)) {
      category = EXCLUDED; // account-level annual interest/tax entries, not spend
    } else if (references.isk && rubrikCompact.includes(references.isk)) {
      merchant = 'ISK transfer';
      category = EXCLUDED; // moving to another owned asset (ISK), not spend
      flowBucket = 'isk';
    } else if ((references.externalSavings && rubrikCompact.includes(references.externalSavings)) || /^UTTAG NML/i.test(rubrik)) {
      merchant = 'External savings' + (references.externalSavings ? ` (${references.externalSavings})` : '');
      category = EXCLUDED; // temporarily held at another bank, still owned
      flowBucket = 'external-savings';
    } else if (/^Överföring/i.test(rubrik) && references.personkontoLink && rubrikCompact.includes(references.personkontoLink)) {
      category = EXCLUDED; // transfer to/from the linked Personkonto
    } else if (/^Slutlikvid/i.test(rubrik) || rubrik === 'Insättning') {
      category = EXCLUDED; // one-off property purchase settlement
    }
    // Uttag / Uttag utland / anything else unrecognized: leave category null so it surfaces for
    // manual review instead of guessing — these can be genuine spend (e.g. foreign ATM cash).

    out.push({
      txn_date: row.Bokforingsdag,
      merchant,
      amount: Math.abs(amount),
      card: 'Sparkonto',
      _forcedCategory: category,
      _flowBucket: flowBucket,
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

// options.rules: the user's categorizationRules ([{ pattern, category }]); options.roles: the
// user's categoryRoles. Both default to the built-in starter values, so calling this without
// them (e.g. from a plain Node script) behaves exactly like the defaults.
function processImport(rawRows, format, aliases, overrides, learnedLookup, sparkontoReferences = {}, options = {}) {
  const compiledRules = compileRules(options.rules || DEFAULT_CATEGORIZATION_RULES);
  const roles = { ...DEFAULT_CATEGORY_ROLES, ...(options.roles || {}) };
  let parsed;
  if (format === 'eurobonus') parsed = parseEuroBonusRows(rawRows);
  else if (format === 'amex') parsed = parseAmexRows(rawRows);
  else if (format === 'personkonto') parsed = parsePersonkontoRows(rawRows, sparkontoReferences, roles);
  else if (format === 'sparkonto') parsed = parseSparkontoRows(rawRows, sparkontoReferences, roles);
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
    const { merchant, category, matched } = categorizeMerchant(txn.merchant, aliases, overrides, learnedLookup, compiledRules);
    const record = { ...txn, merchant, category };
    results.push(record);
    if (matched === 'none') unmatched.push(record);
  }

  return { results, unmatched };
}

// Exports for use in the browser app
if (typeof module !== 'undefined') {
  module.exports = {
    CATEGORY_TREE, LEAF_CATEGORIES, EXCLUDED, UNCATEGORIZED,
    DEFAULT_CATEGORIZATION_RULES, DEFAULT_CATEGORY_ROLES, compileRules,
    categorizeMerchant, processImport, isValidParsedRow,
    parseEuroBonusRows, parseAmexRows, parsePersonkontoRows, parseSparkontoRows
  };
}
