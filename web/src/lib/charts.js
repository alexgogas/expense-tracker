// Port of index.html's shared chart helpers (colorForIndex, legendDoubleClickHandler,
// recomputeReferenceLines, slidingWindowTrend, budgetContributionForSeries, downloadChartPNG) —
// used by every chart-owning card (Savings here first; Spend/Net Worth in later slices).
// budgetContributionForSeries/recomputeReferenceLines are exercised as no-ops by the Savings
// chart today (it has neither a 'Budget' nor drill-down 'spend'-stack dataset) but are ported now,
// unchanged, so the Spend/Net Worth slices don't need to touch this file again.

import { drillState, categoryTree, budgets } from '../state.js';
import { effectiveMonthlyBudget } from '../budgets.js';
import { isDailyMode } from './dataset.js';
import { todayMonthLabel } from './months.js';

export function colorForIndex(i) {
  const palette = ['#5eb1ff', '#7ee8b8', '#ffb454', '#ff6b6b', '#c792ea', '#82e0f9',
                    '#f78c6c', '#89ddff', '#c3e88d', '#ffcb6b', '#f07178', '#addb67', '#ff5370'];
  return palette[i % palette.length];
}

// A single series' (top-level category, or drilled-in subcategory) own monthly budget
// contribution to the chart's "Budget" reference line. Merchant-level series contribute
// nothing — there's no per-merchant budget in this app's model.
export function budgetContributionForSeries(label) {
  if (drillState.value.level === 'top') {
    const entry = categoryTree.value.find(c => c.key === label);
    return entry ? (effectiveMonthlyBudget(entry) || 0) : 0;
  }
  if (drillState.value.level === 'sub') {
    return budgets.value[drillState.value.category + ' > ' + label] || 0;
  }
  return 0;
}

// Rolling trend: at each index, the mean of just that point and the (up to) windowSize-1 points
// before it — a genuine moving average, so month-to-month noise gets actually dampened rather
// than tracked closely.
export function slidingWindowTrend(values, windowSize) {
  return values.map((_, i) => {
    const windowStart = Math.max(0, i - windowSize + 1);
    const window = values.slice(windowStart, i + 1);
    return window.reduce((s, v) => s + v, 0) / window.length;
  });
}

export function recomputeReferenceLines(chart) {
  const trendDs = chart.data.datasets.find(d => d.label === 'Trend' || d.label === 'Trend (total savings)');
  const avgDs = chart.data.datasets.find(d => d.label === 'Average');
  const budgetDs = chart.data.datasets.find(d => d.label === 'Budget');
  if (!trendDs && !avgDs && !budgetDs) return;

  const primaryStack = chart.data.datasets.some(d => d.stack === 'balance') ? 'balance' : 'spend';

  const bucketCount = chart.data.labels.length;
  const totalData = Array.from({ length: bucketCount }, (_, idx) =>
    chart.data.datasets.reduce((s, d, i) => {
      if (d.stack !== primaryStack || !chart.isDatasetVisible(i)) return s;
      return s + (d.data[idx] || 0);
    }, 0)
  );
  const avgValue = totalData.reduce((s, v) => s + v, 0) / (bucketCount || 1);

  if (trendDs) {
    if (primaryStack === 'balance') {
      let lastBalanceIdx = bucketCount - 1;
      while (lastBalanceIdx >= 0 && !chart.data.datasets.some(d => d.stack === 'balance' && d.data[lastBalanceIdx] != null)) {
        lastBalanceIdx--;
      }
      if (lastBalanceIdx > 0 && chart.data.labels[lastBalanceIdx] === todayMonthLabel()) lastBalanceIdx--;
      trendDs.data = slidingWindowTrend(totalData.slice(0, lastBalanceIdx + 1), 3)
        .concat(totalData.slice(lastBalanceIdx + 1).map(() => null));
    } else {
      trendDs.data = totalData;
    }
  }
  if (avgDs) avgDs.data = totalData.map(() => avgValue);

  if (budgetDs) {
    const monthlyBudgetSum = chart.data.datasets.reduce((s, d, i) => {
      if (d.stack !== 'spend' || !chart.isDatasetVisible(i)) return s;
      return s + budgetContributionForSeries(d.label);
    }, 0);
    const perBucketBudget = isDailyMode() ? monthlyBudgetSum / (bucketCount || 1) : monthlyBudgetSum;
    budgetDs.data = budgetDs.data.map(() => perBucketBudget);
  }

  chart.update();
}

// Chart.js legend clicks are single-click-toggle by default. This wraps that behavior so a
// double-click isolates just that series (hides all others), and double-clicking the sole
// remaining visible series restores everyone. Returns a fresh handler (own timing state) each
// call — invoke once per Chart construction.
export function legendDoubleClickHandler() {
  const DELAY = 300; // ms — standard double-click window
  let pendingIndex = null;
  let pendingTimer = null;

  return (evt, legendItem, legend) => {
    const chart = legend.chart;
    const index = legendItem.datasetIndex;
    const clickedIsPrimarySeries = chart.data.datasets[index].stack === 'spend' || chart.data.datasets[index].stack === 'balance';

    if (pendingTimer !== null && pendingIndex === index) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
      pendingIndex = null;

      const onlyThisVisible = chart.isDatasetVisible(index) &&
        chart.data.datasets.every((_, i) => i === index || !chart.isDatasetVisible(i));
      chart.data.datasets.forEach((_, i) => {
        if (onlyThisVisible || i === index) chart.show(i);
        else chart.hide(i);
      });
      if (clickedIsPrimarySeries) recomputeReferenceLines(chart);
      return;
    }

    if (pendingTimer !== null) clearTimeout(pendingTimer);
    pendingIndex = index;
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      pendingIndex = null;
      if (chart.isDatasetVisible(index)) chart.hide(index);
      else chart.show(index);
      if (clickedIsPrimarySeries) recomputeReferenceLines(chart);
    }, DELAY);
  };
}

export function downloadChartPNG(chart, filename) {
  if (!chart) return;
  const link = document.createElement('a');
  link.href = chart.toBase64Image('image/png', 1);
  link.download = filename;
  link.click();
}
