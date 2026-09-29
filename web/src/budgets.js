// Port of index.html's Budgets card business logic. budgets/budgetPeriods are plain-object
// signals — every mutation replaces the whole object with a shallow copy (never mutates in
// place), per the plan's signal reference-equality note, since this file is the densest
// concentration of that pattern anywhere in the app.

import { budgets, budgetPeriods, categoryTree } from './state.js';
import { markUnsaved } from './persistence.js';
import { visibleMonths, actualSpendForPath } from './lib/dataset.js';

// A category's own monthly budget if set; otherwise, if it has subcategories, the sum of
// whichever of THEIR budgets are set (the "trace up" rollup) — or null if neither exists.
// An explicit budget on the category itself always wins over the rollup.
export function effectiveMonthlyBudget(entry) {
  if (budgets.value[entry.key]) return budgets.value[entry.key];
  if (entry.subs && entry.subs.length) {
    const subSum = entry.subs.reduce((s, sub) => s + (budgets.value[entry.key + ' > ' + sub] || 0), 0);
    return subSum > 0 ? subSum : null;
  }
  return null;
}

// Budget vs actual per top-level category over the selected date range (rangeFilter): the monthly
// budget is prorated to the number of months in range. Shared by the dashboard's budget progress
// and the Budgets settings tab. Excluded is left out (budgets track spend, not transfers).
export function budgetSummary() {
  const monthCount = Math.max(visibleMonths().length, 1);
  let totalBudget = 0;
  let totalActual = 0;
  const rows = categoryTree.value.filter(entry => entry.key !== EXCLUDED).map(entry => {
    const monthlyBudget = effectiveMonthlyBudget(entry);
    const rangeBudget = monthlyBudget ? monthlyBudget * monthCount : null;
    const actual = actualSpendForPath(entry.key, true);
    if (rangeBudget) totalBudget += rangeBudget;
    totalActual += actual;
    return { entry, rangeBudget, actual, isRolledUp: !budgets.value[entry.key] && !!rangeBudget };
  });
  return { rows, monthCount, totalBudget, totalActual };
}

// Warms steadily as spend approaches the budget — green (comfortably under), yellow, orange, light
// red just under 100% — then red once over, darkest when far over. Monotonic, so a redder bar always
// means a larger share of the budget spent.
export function budgetColorForPct(pct) {
  if (pct < 50) return '#7ee8b8';
  if (pct < 75) return '#ffcb6b';
  if (pct < 90) return '#ffb454';
  if (pct < 100) return '#ff8a80';
  if (pct < 125) return '#ff6b6b';
  return '#e53935';
}

// rawValue is in whatever unit `period` denotes ('year' or 'month'); budgets[path] always stores
// the monthly-equivalent so every other consumer (chart Budget line, groupMeta %, AI insights)
// can keep treating it as a plain monthly figure without knowing about periods at all.
export function setBudget(path, rawValue, period) {
  const amount = parseFloat(rawValue);
  const next = { ...budgets.value };
  if (!rawValue || isNaN(amount) || amount <= 0) delete next[path];
  else next[path] = period === 'year' ? amount / 12 : amount;
  budgets.value = next;
  markUnsaved();
}

// Toggling the unit alone doesn't change the stored monthly-equivalent amount — only how it's
// displayed/entered — so no conversion happens here, just the period flag.
export function setBudgetPeriod(path, period) {
  const next = { ...budgetPeriods.value };
  if (period === 'year') next[path] = 'year';
  else delete next[path];
  budgetPeriods.value = next;
  markUnsaved();
}
