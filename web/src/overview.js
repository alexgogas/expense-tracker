// Port of index.html's Overview/Spend-chart business logic: the drill-down helpers
// (categoryHasSubs/subcategoryListWithOther/rowsForSubcategoryBucket/merchantSummaryRows), the
// drillState/rangeFilter mutation setters, and the one-time state reset the old app did inside
// renderOverview() at the end of every loadAllData() call.

import { categoryTree, rangeFilter, drillState, netWorthRangeFilter, DEFAULT_HISTORY_MONTHS, defaultNetWorthRange } from './state.js';
import { sortedMonthList } from './lib/dataset.js';
import { monthSortKey, todayMonthLabel, addMonthsToLabel } from './lib/months.js';

export function categoryHasSubs(topCategory) {
  const entry = categoryTree.value.find(c => c.key === topCategory);
  return entry && entry.subs && entry.subs.length > 0;
}

// The list of subcategory labels to show for a drilled-in category, folding in an "Other" bucket
// for transactions filed at the bare top-level category (no subcategory at all) — merged into an
// existing declared "Other" sub if the category already has one, rather than creating a second,
// ambiguously-labeled bucket.
export function subcategoryListWithOther(cat, rows) {
  const entry = categoryTree.value.find(c => c.key === cat);
  const hasDeclaredOther = entry.subs.includes('Other');
  const hasNoSubRows = rows.some(i => i.category === cat);
  const subs = (hasDeclaredOther || !hasNoSubRows) ? entry.subs : [...entry.subs, 'Other'];
  return { subs };
}

// Rows belonging to a "cat > sub" bucket. For sub === "Other" this always also folds in
// transactions filed with no subcategory at all.
export function rowsForSubcategoryBucket(rows, cat, sub) {
  if (sub === 'Other') {
    return rows.filter(i => i.category === cat || i.category === cat + ' > Other');
  }
  return rows.filter(i => i.category === cat + ' > ' + sub);
}

export function merchantSummaryRows(rows) {
  const totals = {};
  const counts = {};
  rows.forEach(i => {
    totals[i.merchant] = (totals[i.merchant] || 0) + i.amount;
    counts[i.merchant] = (counts[i.merchant] || 0) + 1;
  });
  return Object.keys(totals).map(m => ({ merchant: m, total: totals[m], count: counts[m] }));
}

export function drillDown(category) {
  if (drillState.value.level !== 'top' || !category) return;
  drillState.value = categoryHasSubs(category) ? { level: 'sub', category } : { level: 'merchant', category };
}

export function drillBack() {
  drillState.value = { level: 'top', category: null };
}

export function setRangeFrom(from) {
  const months = sortedMonthList();
  const cur = rangeFilter.value;
  const to = months.indexOf(from) > months.indexOf(cur.to) ? from : cur.to;
  rangeFilter.value = { from, to };
}

export function setRangeTo(to) {
  const months = sortedMonthList();
  const cur = rangeFilter.value;
  const from = months.indexOf(to) < months.indexOf(cur.from) ? to : cur.from;
  rangeFilter.value = { from, to };
}

// Called once at the end of every loadAllData() (see persistence.js). Resets both ranges to the
// default period and drillState to the top level:
// - Overview/Savings/Transactions (rangeFilter, which only offers months that have data): from the
//   first data month on or after the same month last year, through the latest data month. If all
//   data is older than that, the most recent DEFAULT_HISTORY_MONTHS of data instead.
// - Net Worth: the same year back, plus the projection months ahead (defaultNetWorthRange()).
// Only the initial selection — the pickers still reach any other month afterward.
export function initOverviewState() {
  const months = sortedMonthList();
  const lastMonth = months[months.length - 1] || null;
  const since = addMonthsToLabel(todayMonthLabel(), -DEFAULT_HISTORY_MONTHS);
  const from = months.find(m => monthSortKey(m) >= monthSortKey(since))
    || months[Math.max(0, months.length - 1 - DEFAULT_HISTORY_MONTHS)]
    || null;
  rangeFilter.value = { from, to: lastMonth };
  netWorthRangeFilter.value = defaultNetWorthRange();
  drillState.value = { level: 'top', category: null };
}
