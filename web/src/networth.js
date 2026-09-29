// Port of index.html's Net Worth card business logic (mortgage/income model math, quarter/rate
// helpers, flow-bucket balances) plus its signal mutation setters — mirrors budgets.js's pattern
// of pure compute functions + shallow-copy mutation helpers for this card's own domain signals
// (mortgageModel, incomeModel, iskYtdPct, netWorthRangeFilter).

import { dataset, accountBalances, mortgageModel, incomeModel, iskYtdPct, netWorthRangeFilter, MUNICIPAL_TAX_RATE, STATE_TAX_RATE, STATE_TAX_MONTHLY_THRESHOLD } from './state.js';
import { markUnsaved } from './persistence.js';
import { sortedMonthList } from './lib/dataset.js';
import { MONTH_ABBR, monthSortKey, todayMonthLabel, addMonthsToLabel, nextMonthLabel } from './lib/months.js';

export function netOfIncomeTax(gross) {
  const municipalTax = gross * MUNICIPAL_TAX_RATE;
  const stateTax = Math.max(0, gross - STATE_TAX_MONTHLY_THRESHOLD) * STATE_TAX_RATE;
  return gross - municipalTax - stateTax;
}

// Union of months with transactions and months with an imported Sparkonto balance — a month can
// have balance data with no transactions in it at all, so this can't just reuse sortedMonthList().
export function netWorthMonths() {
  const months = new Set([...sortedMonthList(), ...Object.keys(accountBalances.value)]);
  return [...months].sort((a, b) => monthSortKey(a) - monthSortKey(b));
}

// Every month selectable in the Net Worth chart's From/To pickers: real history (which can start
// earlier than "2 years ago" if there's older data) through a fixed 60-month runway from today.
export function netWorthSelectableMonths() {
  const actual = netWorthMonths();
  const today = todayMonthLabel();
  const defaultFrom = addMonthsToLabel(today, -24);
  const start = (actual.length && monthSortKey(actual[0]) < monthSortKey(defaultFrom)) ? actual[0] : defaultFrom;
  const end = addMonthsToLabel(today, 60);
  const list = [];
  for (let cursor = start; monthSortKey(cursor) <= monthSortKey(end); cursor = addMonthsToLabel(cursor, 1)) {
    list.push(cursor);
  }
  return list;
}

// Amortization rate changes are always prospective, so unlike netWorthSelectableMonths() this
// starts at NEXT month, not today's.
export function futureAmortizationSelectableMonths() {
  const start = nextMonthLabel(todayMonthLabel());
  const end = addMonthsToLabel(todayMonthLabel(), 60);
  const list = [];
  for (let cursor = start; monthSortKey(cursor) <= monthSortKey(end); cursor = addMonthsToLabel(cursor, 1)) {
    list.push(cursor);
  }
  return list;
}

// Linear calendar-quarter key (year*4 + quarterIndex, 0=Jan-Mar..3=Oct-Dec).
export function quarterKeyForMonth(label) {
  const [abbr, yy] = label.split('-');
  const year = parseInt(yy, 10);
  const q = Math.floor(MONTH_ABBR.indexOf(abbr) / 3);
  return year * 4 + q;
}

// Inverse of quarterKeyForMonth — the "Mon-YY to Mon-YY" display label for a quarter.
export function quarterKeyToLabel(qkey) {
  const year = Math.floor(qkey / 4);
  const q = qkey % 4;
  const yy = String(year).padStart(2, '0');
  return `${MONTH_ABBR[q * 3]}-${yy} to ${MONTH_ABBR[q * 3 + 2]}-${yy}`;
}

// Effective annual interest rate % for a projected month: today's own quarter (or anything not
// after it) uses mortgageModel.currentInterestRate; each of the 4 quarters after today's has its
// own optional slot that, if blank, cascades backward to the nearest earlier set slot.
export function effectiveInterestRateForMonth(label) {
  const m = mortgageModel.value;
  const todayQKey = quarterKeyForMonth(todayMonthLabel());
  const offset = quarterKeyForMonth(label) - todayQKey;
  if (offset <= 0) return m.currentInterestRate;
  const slotIdx = Math.min(offset, 4) - 1;
  for (let i = slotIdx; i >= 0; i--) {
    const v = m.quarterlyInterestRates[i];
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return m.currentInterestRate;
}

// mortgageModel.amortizationSchedule entries in chronological order, with any row missing EITHER
// a month or a rate dropped entirely.
export function sortedAmortizationSchedule() {
  return mortgageModel.value.amortizationSchedule
    .filter(e => e && e.month && e.rate !== null && e.rate !== undefined && e.rate !== '')
    .slice()
    .sort((a, b) => monthSortKey(a.month) - monthSortKey(b.month));
}

// Effective annual amortization rate % for a projected month: the most recent schedule entry whose
// month is <= this month, falling back to mortgageModel.currentAmortizationRate if none applies yet.
export function effectiveAmortizationRateForMonth(label, sortedSchedule) {
  let rate = mortgageModel.value.currentAmortizationRate;
  for (const entry of sortedSchedule) {
    if (monthSortKey(entry.month) <= monthSortKey(label)) rate = entry.rate;
    else break;
  }
  return rate;
}

// Running balance for a Sparkonto-tracked "pot" (ISK / external savings / fixed-term deposit) —
// its whole history is the Sparkonto transactions tagged with this _flowBucket.
export function computeFlowBucketBalances(bucketKey) {
  const txns = dataset.value
    .filter(t => t._flowBucket === bucketKey)
    .slice()
    .sort((a, b) => a.txn_date.localeCompare(b.txn_date));
  let running = 0;
  const byMonth = {};
  txns.forEach(t => {
    running += -(t._rawSign || 1) * t.amount;
    byMonth[t.month] = running;
  });
  return byMonth;
}

// --- Signal mutation setters — every one a shallow-copy replace, per the signal reference-
// equality discipline (see state.js's file-level comment). ---

export function setMortgageField(field, value) {
  mortgageModel.value = { ...mortgageModel.value, [field]: value };
  markUnsaved();
}

export function setQuarterlyInterestRate(idx, value) {
  const next = { ...mortgageModel.value };
  next.quarterlyInterestRates = next.quarterlyInterestRates.slice();
  next.quarterlyInterestRates[idx] = value;
  mortgageModel.value = next;
  markUnsaved();
}

export function setAmortizationScheduleEntry(idx, field, value) {
  const next = { ...mortgageModel.value };
  next.amortizationSchedule = next.amortizationSchedule.map((e, i) => (i === idx ? { ...e, [field]: value } : e));
  mortgageModel.value = next;
  markUnsaved();
}

export function setIskYtdPct(value) {
  iskYtdPct.value = value;
  markUnsaved();
}

export function setIncomeField(field, value) {
  incomeModel.value = { ...incomeModel.value, [field]: value };
  markUnsaved();
}

export function setBenefitTierField(idx, field, value) {
  const next = { ...incomeModel.value };
  next.benefitTiers = next.benefitTiers.map((t, i) => (i === idx ? { ...t, [field]: value } : t));
  incomeModel.value = next;
  markUnsaved();
}

export function setNetWorthRangeFrom(from) {
  const cur = netWorthRangeFilter.value;
  const to = monthSortKey(from) > monthSortKey(cur.to) ? from : cur.to;
  netWorthRangeFilter.value = { from, to };
}

export function setNetWorthRangeTo(to) {
  const cur = netWorthRangeFilter.value;
  const from = monthSortKey(to) < monthSortKey(cur.from) ? to : cur.from;
  netWorthRangeFilter.value = { from, to };
}
