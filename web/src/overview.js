// Port of index.html's Overview/Spend-chart business logic: the drill-down helpers
// (categoryHasSubs/subcategoryListWithOther/rowsForSubcategoryBucket/merchantSummaryRows), the
// drillState/rangeFilter mutation setters, and the one-time state reset the old app did inside
// renderOverview() at the end of every loadAllData() call.

import { categoryTree, rangeFilter, drillState } from './state.js';
import { sortedMonthList } from './lib/dataset.js';
import { monthSortKey } from './lib/months.js';

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

// The state-reset portion of index.html's renderOverview() — called once at the end of
// loadAllData() (see persistence.js), same as the old app. Defaults the Overview/Savings/
// Transactions range to Jan-25 onward (falling back to the earliest available month if there's no
// data that far back yet) and resets drillState to the top level. Only sets the INITIAL From
// selector — the dropdown still lets the user pick any earlier month afterward.
export function initOverviewState() {
  const months = sortedMonthList();
  const lastMonth = months[months.length - 1] || null;
  const defaultFrom = (months.includes('Jan-25') && lastMonth && monthSortKey('Jan-25') <= monthSortKey(lastMonth))
    ? 'Jan-25' : (months[0] || null);
  rangeFilter.value = { from: defaultFrom, to: lastMonth };
  drillState.value = { level: 'top', category: null };
}
