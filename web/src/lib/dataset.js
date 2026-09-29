// Verbatim port from index.html — dataset/range-filter query helpers, shared by multiple cards
// (Budgets, Transactions, AI Insights, ...). Reads dataset/rangeFilter signals directly rather
// than taking them as parameters, matching every card's own direct-signal-import style.

import { dataset, rangeFilter } from '../state.js';

export function sortedMonthList() {
  const months = [...new Set(dataset.value.map(i => i.month))];
  const monthOrder = {};
  dataset.value.forEach(i => { if (!(i.month in monthOrder)) monthOrder[i.month] = i.txn_date; });
  return months.sort((a, b) => monthOrder[a].localeCompare(monthOrder[b]));
}

export function visibleMonths() {
  const months = sortedMonthList();
  if (!rangeFilter.value.from || !rangeFilter.value.to) return months;
  const fromIdx = months.indexOf(rangeFilter.value.from);
  const toIdx = months.indexOf(rangeFilter.value.to);
  if (fromIdx === -1 || toIdx === -1) return months;
  return months.slice(fromIdx, toIdx + 1);
}

export function rangeFilteredDataset() {
  const months = new Set(visibleMonths());
  return dataset.value.filter(i => months.has(i.month));
}

export function actualSpendForPath(path, prefixMatch) {
  return rangeFilteredDataset()
    .filter(i => i.category !== 'Excluded')
    .filter(i => (prefixMatch ? i.category.split(' > ')[0] === path : i.category === path))
    .reduce((s, i) => s + i.amount, 0);
}

// When the From/To range narrows to a single month, the charts switch from monthly bars to
// daily ones for that month. "Bucket" abstracts over both granularities: a month label
// ("Jan-26") normally, or a "YYYY-MM-DD" day string when isDailyMode() is true.
export function isDailyMode() {
  return !!(rangeFilter.value.from && rangeFilter.value.from === rangeFilter.value.to);
}

export function daysInVisibleMonth() {
  const anyTxn = dataset.value.find(t => t.month === rangeFilter.value.from);
  if (!anyTxn) return [];
  const [y, m] = anyTxn.txn_date.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const days = [];
  for (let d = 1; d <= lastDay; d++) days.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  return days;
}

export function visibleBuckets() {
  return isDailyMode() ? daysInVisibleMonth() : visibleMonths();
}

export function bucketOf(txn) {
  return isDailyMode() ? txn.txn_date : txn.month;
}

export function bucketLabel(bucket) {
  return isDailyMode() ? String(parseInt(bucket.slice(-2), 10)) : bucket;
}
