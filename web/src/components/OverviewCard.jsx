import { useEffect, useRef } from 'preact/hooks';
import { useSignalEffect } from '@preact/signals';
import Chart from 'chart.js/auto';
import { rangeFilter, drillState } from '../state.js';
import { rangeFilteredDataset, visibleMonths, visibleBuckets, bucketOf, bucketLabel, isDailyMode, sortedMonthList } from '../lib/dataset.js';
import { colorForIndex, legendDoubleClickHandler, budgetContributionForSeries, downloadChartPNG } from '../lib/charts.js';
import { statusLine } from '../lib/ui.js';
import { subcategoryListWithOther, rowsForSubcategoryBucket, merchantSummaryRows, drillDown, drillBack, setRangeFrom, setRangeTo } from '../overview.js';
import { SortableTable } from './SortableTable.jsx';
import { Stat } from './Stat.jsx';
import { BudgetProgress } from './BudgetProgress.jsx';

// Port of index.html's renderSpendChart(), split into pure data/options builders called from a
// useSignalEffect below (see SavingsCard.jsx's comment on useSignalEffect vs useEffect).
function buildSpendChartData() {
  const buckets = visibleBuckets();
  const rows = rangeFilteredDataset();
  const level = drillState.value.level;
  let datasets;

  if (level === 'top') {
    const byCategory = {};
    rows.forEach(i => {
      const top = i.category.split(' > ')[0];
      if (top === 'Excluded') return;
      byCategory[top] = true;
    });
    const categories = Object.keys(byCategory);
    datasets = categories.map((cat, idx) => ({
      label: cat,
      data: buckets.map(b => rows.filter(i => bucketOf(i) === b && i.category.split(' > ')[0] === cat).reduce((s, i) => s + i.amount, 0)),
      backgroundColor: colorForIndex(idx),
      stack: 'spend',
      _category: cat
    }));
  } else if (level === 'sub') {
    const cat = drillState.value.category;
    const { subs } = subcategoryListWithOther(cat, rows);
    datasets = subs.map((sub, idx) => ({
      label: sub,
      data: buckets.map(b => rowsForSubcategoryBucket(rows, cat, sub).filter(i => bucketOf(i) === b).reduce((s, i) => s + i.amount, 0)),
      backgroundColor: colorForIndex(idx),
      stack: 'spend'
    }));
  } else {
    // 'merchant'
    const cat = drillState.value.category;
    const merchantTotals = {};
    rows.filter(i => i.category.split(' > ')[0] === cat).forEach(i => {
      merchantTotals[i.merchant] = (merchantTotals[i.merchant] || 0) + i.amount;
    });
    const topMerchants = Object.entries(merchantTotals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
    datasets = topMerchants.map((merch, idx) => ({
      label: merch,
      data: buckets.map(b => rows.filter(i => bucketOf(i) === b && i.merchant === merch && i.category.split(' > ')[0] === cat).reduce((s, i) => s + i.amount, 0)),
      backgroundColor: colorForIndex(idx),
      stack: 'spend'
    }));
  }

  // Trend line: total across whatever's currently plotted, overlaid on top of the stacked bars.
  // Average: the flat mean of that same trend across the visible buckets. Both start out
  // reflecting every series, and get recomputed by legendDoubleClickHandler whenever the user
  // hides/isolates series via the legend.
  const trendData = buckets.map((b, idx) => datasets.reduce((s, d) => s + (d.data[idx] || 0), 0));
  const avgValue = trendData.reduce((s, v) => s + v, 0) / (trendData.length || 1);
  datasets = [...datasets, {
    label: 'Trend', data: trendData, type: 'line', stack: 'trend-line',
    borderColor: '#e8eaed', backgroundColor: '#e8eaed', borderWidth: 2, pointRadius: 3, tension: 0.25, fill: false
  }, {
    label: 'Average', data: buckets.map(() => avgValue), type: 'line', stack: 'average-line',
    borderColor: '#ffb454', backgroundColor: '#ffb454', borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, fill: false
  }];

  // Budget: the flat monthly (or, in daily mode, evenly per-day) budget ceiling for whatever's
  // currently plotted, summed from each visible series' own budget. Only added when there's
  // actually a budget to show.
  const monthlyBudgetSum = datasets.reduce((s, d) => s + budgetContributionForSeries(d.label), 0);
  if (monthlyBudgetSum > 0) {
    const perBucketBudget = isDailyMode() ? monthlyBudgetSum / (buckets.length || 1) : monthlyBudgetSum;
    datasets = [...datasets, {
      label: 'Budget', data: buckets.map(() => perBucketBudget), type: 'line', stack: 'budget-line',
      borderColor: '#ff6b6b', backgroundColor: '#ff6b6b', borderWidth: 1.5, borderDash: [2, 3], pointRadius: 0, fill: false
    }];
  }

  return { labels: buckets.map(bucketLabel), datasets };
}

function buildSpendChartOptions() {
  // Recomputed here (not shared via closure with buildSpendChartData) since this is a separate
  // pure function call — cheap, deterministic, and avoids needing an external chart-instance ref
  // just to recover the raw bucket keys inside the tooltip callback below.
  const buckets = visibleBuckets();

  return {
    responsive: true,
    maintainAspectRatio: false,
    // Chart.js passes the chart instance as the 3rd onClick arg — no external ref needed to read
    // back which dataset/category was clicked.
    onClick: (evt, elements, chart) => {
      if (!elements.length) return;
      if (drillState.value.level !== 'top') return; // only drill down one level from the top view
      const ds = chart.data.datasets[elements[0].datasetIndex];
      drillDown(ds._category);
    },
    scales: {
      x: { stacked: true, ticks: { color: '#9aa4b2' }, grid: { color: '#2a303a' }, title: { display: isDailyMode(), text: 'Day of month', color: '#9aa4b2' } },
      y: { stacked: true, ticks: { color: '#9aa4b2' }, grid: { color: '#2a303a' } }
    },
    plugins: {
      legend: {
        labels: {
          color: '#e8eaed', boxWidth: 12, font: { size: 11 },
          // Average and Budget are flat reference lines with no marker to hover — show their
          // value directly in the legend text instead.
          generateLabels: (chart) => {
            const items = Chart.defaults.plugins.legend.labels.generateLabels(chart);
            items.forEach(item => {
              const ds = chart.data.datasets[item.datasetIndex];
              if ((ds.label === 'Average' || ds.label === 'Budget') && ds.data.length) {
                item.text = `${ds.label}: ${Math.round(ds.data[0]).toLocaleString()} kr`;
              }
            });
            return items;
          }
        },
        onClick: legendDoubleClickHandler()
      },
      tooltip: {
        callbacks: {
          afterBody: (items) => {
            if (drillState.value.level !== 'sub' || !items.length) return [];
            // TooltipItem carries its own chart reference — same reasoning as onClick above.
            const hoveredDataset = items[0].chart.data.datasets[items[0].datasetIndex];
            if (hoveredDataset.stack !== 'spend') return []; // skip the trend line itself
            const sub = hoveredDataset.label;
            const bucket = buckets[items[0].dataIndex];
            const cat = drillState.value.category;
            const totals = {};
            rowsForSubcategoryBucket(rangeFilteredDataset(), cat, sub)
              .filter(i => bucketOf(i) === bucket)
              .forEach(i => { totals[i.merchant] = (totals[i.merchant] || 0) + i.amount; });
            const top3 = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 3);
            if (!top3.length) return [];
            return ['', 'Top merchants:', ...top3.map(([m, t]) => `  ${m}: ${Math.round(t).toLocaleString()} kr`)];
          }
        }
      }
    }
  };
}

function merchantColumns() {
  return [
    { label: 'Merchant', sortValue: r => r.merchant, render: r => r.merchant },
    { label: 'Transactions', sortValue: r => r.count, render: r => String(r.count), align: 'right' },
    { label: 'Total', sortValue: r => r.total, render: r => Math.round(r.total).toLocaleString() + ' kr', align: 'right' }
  ];
}

// Port of index.html's renderMerchantSummary(): nothing at the top level, a full sortable
// merchant-totals table at the merchant level, or one top-5 table per subcategory at the sub
// level (aggregated across the whole selected range, not just a hovered bucket).
function MerchantSummary({ rows }) {
  const level = drillState.value.level;
  if (level === 'merchant') {
    const cat = drillState.value.category;
    const merchRows = merchantSummaryRows(rows.filter(i => i.category.split(' > ')[0] === cat));
    return <SortableTable rows={merchRows} columns={merchantColumns()} defaultSortIdx={2} defaultSortDir="desc" rowKey={r => r.merchant} />;
  }
  if (level === 'sub') {
    const cat = drillState.value.category;
    const { subs } = subcategoryListWithOther(cat, rows);
    return subs.map(sub => {
      const subRows = rowsForSubcategoryBucket(rows, cat, sub);
      if (!subRows.length) return null;
      const topRows = merchantSummaryRows(subRows).sort((a, b) => b.total - a.total).slice(0, 5);
      return (
        <div key={sub}>
          <div style={{ margin: '16px 0 4px', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{sub} — top merchants</div>
          <SortableTable rows={topRows} columns={merchantColumns()} defaultSortIdx={2} defaultSortDir="desc" rowKey={r => r.merchant} />
        </div>
      );
    });
  }
  return null;
}

export function OverviewCard() {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => () => chartRef.current?.destroy(), []);

  useSignalEffect(() => {
    const chartData = buildSpendChartData();
    const chartOptions = buildSpendChartOptions();
    if (chartRef.current) {
      chartRef.current.data = chartData;
      chartRef.current.options = chartOptions;
      chartRef.current.update();
    } else {
      chartRef.current = new Chart(canvasRef.current.getContext('2d'), { type: 'bar', data: chartData, options: chartOptions });
    }
  });

  const rows = rangeFilteredDataset();
  const counted = rows.filter(i => i.category !== 'Excluded');
  const total = counted.reduce((s, i) => s + i.amount, 0);
  const months = visibleMonths();
  const monthOptions = sortedMonthList();

  const level = drillState.value.level;
  const breadcrumbVisible = level !== 'top';
  const breadcrumbText = level === 'sub'
    ? 'Showing subcategories of ' + drillState.value.category
    : level === 'merchant'
      ? 'Showing top merchants of ' + drillState.value.category
      : '';

  return (
    <details class="card" open>
      <summary><h2>Overview</h2></summary>
      <div id="status-line">{statusLine.value}</div>
      <div class="stat-row">
        <Stat label="Transactions" value={counted.length.toLocaleString()} />
        <Stat label="Total tracked" value={Math.round(total).toLocaleString() + ' kr'} />
        <Stat label="Months covered" value={months.length} />
      </div>
      <div id="range-filter-row">
        <label>From
          <select class="cat-select" value={rangeFilter.value.from || ''} onChange={(e) => setRangeFrom(e.currentTarget.value)}>
            {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>To
          <select class="cat-select" value={rangeFilter.value.to || ''} onChange={(e) => setRangeTo(e.currentTarget.value)}>
            {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <button class="btn-sm" style={{ marginLeft: 'auto' }} onClick={() => downloadChartPNG(chartRef.current, 'spend-chart.png')}>Export chart</button>
      </div>
      {breadcrumbVisible && (
        <div id="breadcrumb-row">
          <button onClick={drillBack}>← Back</button>
          <span id="breadcrumb-label">{breadcrumbText}</span>
        </div>
      )}
      <div id="chart-wrap">
        <canvas ref={canvasRef} />
      </div>
      <div id="merchant-summary-wrap">
        <MerchantSummary rows={rows} />
      </div>
      <BudgetProgress />
    </details>
  );
}
