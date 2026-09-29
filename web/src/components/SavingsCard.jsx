import { useEffect, useRef } from 'preact/hooks';
import { useSignalEffect } from '@preact/signals';
import Chart from 'chart.js/auto';
import { visibleBuckets, bucketOf, bucketLabel, rangeFilteredDataset, isDailyMode } from '../lib/dataset.js';
import { colorForIndex, legendDoubleClickHandler, downloadChartPNG } from '../lib/charts.js';

// Port of index.html's renderSavingsChart(), split into pure data/options builders (unchanged
// logic) called from a useSignalEffect below instead of directly from render — useEffect would
// only track signals read inside ITS OWN callback, not ones read by functions it merely calls
// during render; useSignalEffect tracks every signal read anywhere inside its callback, which is
// what's needed here since buildSavingsChartData() reads dataset/rangeFilter deep inside
// lib/dataset.js's helpers. Exported so AI Insights (insights.js) can pull the same {labels,
// datasets} shape the old app read off `savingsChartInstance.data` — without depending on
// whether this component has actually mounted/rendered yet.
export function buildSavingsChartData() {
  const buckets = visibleBuckets();
  const rows = rangeFilteredDataset();
  const cards = [...new Set(rows.map(i => i.card))];

  const cardDatasets = cards.map((card, idx) => ({
    label: card,
    data: buckets.map(b => rows.filter(i => bucketOf(i) === b && i.card === card && i.category !== 'Excluded').reduce((s, i) => s + i.amount, 0)),
    backgroundColor: colorForIndex(idx),
    stack: 'spend',
    type: 'bar',
    yAxisID: 'y'
  }));

  // Salary is inherently a monthly figure, so "savings" (salary minus spend) doesn't have a
  // meaningful daily breakdown — only plot it at month-level granularity.
  let datasets = cardDatasets;
  if (!isDailyMode()) {
    const salaryByMonth = {};
    rows.filter(i => i.merchant === 'Lön (salary)').forEach(i => { salaryByMonth[i.month] = i.amount; });
    const savingsData = buckets.map(b => {
      if (!(b in salaryByMonth)) return null;
      const spend = rows.filter(i => bucketOf(i) === b && i.category !== 'Excluded').reduce((s, i) => s + i.amount, 0);
      return salaryByMonth[b] - spend;
    });
    datasets = [...cardDatasets, {
      label: 'Savings (salary − spend)',
      data: savingsData,
      type: 'line',
      borderColor: '#e8eaed',
      backgroundColor: '#e8eaed',
      borderWidth: 2,
      pointRadius: 3,
      spanGaps: false,
      yAxisID: 'y1'
    }];
  }

  return { labels: buckets.map(bucketLabel), datasets };
}

function buildSavingsChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { stacked: true, ticks: { color: '#9aa4b2' }, grid: { color: '#2a303a' }, title: { display: isDailyMode(), text: 'Day of month', color: '#9aa4b2' } },
      // beginAtZero (not a hard min:0 — see the Net Worth chart's y/y1 for that variant, once
      // migrated): Chart.js can otherwise round an axis's auto-computed min below the true data
      // minimum, even when nothing is actually negative. Left soft here since "Savings (salary −
      // spend)" on y1 can be genuinely negative in a real deficit month — a hard min:0 would clip
      // that instead of just fixing the rounding.
      y: { stacked: true, position: 'left', beginAtZero: true, ticks: { color: '#9aa4b2' }, grid: { color: '#2a303a' } },
      y1: { position: 'right', beginAtZero: true, ticks: { color: '#9aa4b2' }, grid: { drawOnChartArea: false }, display: !isDailyMode() }
    },
    plugins: {
      legend: { labels: { color: '#e8eaed', boxWidth: 12, font: { size: 11 } }, onClick: legendDoubleClickHandler() }
    }
  };
}

export function SavingsCard() {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => () => chartRef.current?.destroy(), []);

  useSignalEffect(() => {
    const chartData = buildSavingsChartData();
    const chartOptions = buildSavingsChartOptions();
    // Mutate the existing Chart instance rather than destroy+recreate on every interaction — same
    // convention as the old renderSpendChart()/renderSavingsChart().
    if (chartRef.current) {
      chartRef.current.data = chartData;
      chartRef.current.options = chartOptions;
      chartRef.current.update();
    } else {
      chartRef.current = new Chart(canvasRef.current.getContext('2d'), { data: chartData, options: chartOptions });
    }
  });

  return (
    <details class="card" open>
      <summary>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Savings</h2>
          <button
            class="btn-sm"
            onClick={(e) => {
              e.stopPropagation(); // this button sits inside the collapsible card's <summary> — don't toggle it
              downloadChartPNG(chartRef.current, 'savings-chart.png');
            }}
          >
            Export chart
          </button>
        </div>
      </summary>
      <div style={{ position: 'relative', height: '300px', marginTop: '14px' }}>
        <canvas ref={canvasRef} />
      </div>
    </details>
  );
}
