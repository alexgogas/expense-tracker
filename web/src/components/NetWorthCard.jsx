import { useEffect, useRef } from 'preact/hooks';
import { useSignalEffect } from '@preact/signals';
import Chart from 'chart.js/auto';
import { dataset, accountBalances, categoryTree, categoryRoles, mortgageModel, incomeModel, iskYtdPct, netWorthRangeFilter, NET_WORTH_ACCOUNT } from '../state.js';
import { effectiveMonthlyBudget } from '../budgets.js';
import { colorForIndex, legendDoubleClickHandler, slidingWindowTrend, downloadChartPNG } from '../lib/charts.js';
import { todayMonthLabel, monthSortKey, monthsElapsed, nextMonthLabel } from '../lib/months.js';
import {
  netOfIncomeTax, netWorthMonths, netWorthSelectableMonths, futureAmortizationSelectableMonths,
  quarterKeyForMonth, quarterKeyToLabel, effectiveInterestRateForMonth, sortedAmortizationSchedule,
  effectiveAmortizationRateForMonth, computeFlowBucketBalances,
  setMortgageField, setQuarterlyInterestRate, setAmortizationScheduleEntry,
  setIskYtdPct, setIncomeField, setBenefitTierField, setNetWorthRangeFrom, setNetWorthRangeTo
} from '../networth.js';

// Port of index.html's renderNetWorthChart(), split into a pure data/options builder called from
// a useSignalEffect below (see SavingsCard.jsx's comment on useSignalEffect vs useEffect — the
// same reasoning applies here, doubly so given how many signals this one function reads).
// Exported so AI Insights (insights.js) can pull the same {labels, datasets} shape the old app
// read off `netWorthChartInstance.data`, without depending on this component having mounted.
export function buildNetWorthChartData() {
  const months = netWorthMonths();
  const datasets = [];
  const hasSparkontoBalance = months.some(m => accountBalances.value[m] && (NET_WORTH_ACCOUNT in accountBalances.value[m]));
  if (hasSparkontoBalance) {
    datasets.push({
      label: NET_WORTH_ACCOUNT,
      data: months.map(m => (accountBalances.value[m] && accountBalances.value[m][NET_WORTH_ACCOUNT]) || 0),
      backgroundColor: colorForIndex(0),
      stack: 'balance',
      type: 'bar',
      yAxisID: 'y'
    });
  }

  const FLOW_BUCKETS = [
    { key: 'isk', label: 'ISK' },
    { key: 'external-savings', label: 'External savings (until returned)' },
    { key: 'fixed-term-deposit', label: 'Fixed-term deposit' }
  ];
  FLOW_BUCKETS.forEach((bucket, idx) => {
    const byMonth = computeFlowBucketBalances(bucket.key);
    if (!Object.keys(byMonth).length) return;
    let last = 0;
    let data = months.map(m => {
      if (Object.prototype.hasOwnProperty.call(byMonth, m)) last = byMonth[m];
      return last;
    });
    let label = bucket.label;
    const ytdPct = iskYtdPct.value;
    if (bucket.key === 'isk' && ytdPct) {
      const yearStartLabel = 'Jan-' + todayMonthLabel().split('-')[1];
      const factor = 1 + ytdPct / 100;
      data = data.map((v, i) => (monthSortKey(months[i]) >= monthSortKey(yearStartLabel) ? v * factor : v));
      label = `${bucket.label} (YTD ${ytdPct > 0 ? '+' : ''}${ytdPct}%)`;
    }
    datasets.push({
      label,
      data,
      backgroundColor: colorForIndex((hasSparkontoBalance ? 1 : 0) + idx),
      stack: 'balance',
      type: 'bar',
      yAxisID: 'y'
    });
  });

  const totalPerMonth = months.map((m, idx) => datasets.reduce((s, d) => s + (d.data[idx] || 0), 0));

  let lastActualIdx = totalPerMonth.length - 1;
  if (lastActualIdx > 0 && months[lastActualIdx] === todayMonthLabel()) lastActualIdx--;
  const lastActualTotal = lastActualIdx >= 0 ? totalPerMonth[lastActualIdx] : 0;
  const lastRealMonth = lastActualIdx >= 0 ? months[lastActualIdx] : null;

  const trendData = slidingWindowTrend(totalPerMonth.slice(0, lastActualIdx + 1), 3)
    .concat(totalPerMonth.slice(lastActualIdx + 1).map(() => null));
  datasets.push({
    label: 'Trend (total savings)',
    data: trendData,
    type: 'line',
    stack: 'trend-line',
    borderColor: '#e8eaed',
    backgroundColor: '#e8eaed',
    borderWidth: 2,
    pointRadius: 3,
    tension: 0.15,
    fill: false,
    yAxisID: 'y'
  });

  const mortgageData = months.map(m =>
    dataset.value.filter(i => i.month === m && i.category === categoryRoles.value.mortgageCost).reduce((s, i) => s + i.amount, 0)
  );
  datasets.push({
    label: 'Mortgage cost',
    data: mortgageData,
    type: 'line',
    stack: 'mortgage-line',
    borderColor: '#ff8a80',
    backgroundColor: '#ff8a80',
    borderWidth: 2,
    pointRadius: 3,
    tension: 0.15,
    fill: false,
    yAxisID: 'y1'
  });

  const salaryData = months.map(m => {
    const rows = dataset.value.filter(i => i.month === m && i.merchant === 'Lön (salary)');
    return rows.length ? rows.reduce((s, i) => s + i.amount, 0) : null;
  });
  datasets.push({
    label: 'Lön (salary)',
    data: salaryData,
    type: 'line',
    stack: 'salary-line',
    borderColor: '#7ee8b8',
    backgroundColor: '#7ee8b8',
    borderWidth: 2,
    pointRadius: 3,
    spanGaps: false,
    fill: false,
    yAxisID: 'y1'
  });

  const REGULAR_SALARY_CUTOFF = incomeModel.value.regularSalaryCutoff;
  const PROJECTED_MONTHLY_SALARY = incomeModel.value.projectedMonthlySalary;
  const BENEFIT_TIERS = incomeModel.value.benefitTiers.map(t => ({ ...t, net: netOfIncomeTax(t.gross) }));
  function projectedIncomeForMonth(m) {
    if (monthSortKey(m) <= monthSortKey(REGULAR_SALARY_CUTOFF)) return PROJECTED_MONTHLY_SALARY;
    const monthsAfterCutoff = monthsElapsed(REGULAR_SALARY_CUTOFF, m);
    const tier = BENEFIT_TIERS.find(t => monthsAfterCutoff <= t.throughMonth);
    return tier ? tier.net : 0;
  }

  const totalMonthlyBudget = categoryTree.value
    .filter(c => c.key !== 'Excluded')
    .reduce((s, c) => s + (effectiveMonthlyBudget(c) || 0), 0);

  const housingMortgageEntry = categoryTree.value.find(c => c.key === categoryRoles.value.housing);
  const housingMortgageBudget = housingMortgageEntry ? (effectiveMonthlyBudget(housingMortgageEntry) || 0) : 0;
  const sortedAmortSchedule = sortedAmortizationSchedule();

  const recentWindow = Math.min(3, lastActualIdx);
  const recentMonthlyDelta = recentWindow > 0
    ? (totalPerMonth[lastActualIdx] - totalPerMonth[lastActualIdx - recentWindow]) / recentWindow
    : 0;

  const projectedMonths = [];
  const projectedValues = [];
  const mortgageModelValues = [];
  const projectedMortgageCostValues = [];
  const projectedMortgageCostAfterTaxValues = [];
  const recentTrendValues = [];
  const overlapValues = {};
  const rangeTo = netWorthRangeFilter.value.to;
  const rangeFrom = netWorthRangeFilter.value.from;
  if (lastRealMonth && monthSortKey(rangeTo) > monthSortKey(lastRealMonth)) {
    const lastDisplayedMonth = months.length ? months[months.length - 1] : null;
    let cursor = lastRealMonth;
    let running = lastActualTotal;
    let runningMortgageModel = lastActualTotal;
    let simulatedBalance = mortgageModel.value.loanBalance;
    const amortizationBase = mortgageModel.value.originalLoanAmount;
    const ANNUAL_INTEREST_DEDUCTION_THRESHOLD = 100000;
    const INTEREST_DEDUCTION_RATE_LOW = 0.30;
    const INTEREST_DEDUCTION_RATE_HIGH = 0.21;
    let cumulativeInterestThisYear = 0;
    let runningRecentTrend = lastActualTotal;
    while (monthSortKey(cursor) < monthSortKey(rangeTo)) {
      cursor = nextMonthLabel(cursor);
      const income = projectedIncomeForMonth(cursor);
      running += income - totalMonthlyBudget;

      const interestRatePct = effectiveInterestRateForMonth(cursor);
      const amortRatePct = effectiveAmortizationRateForMonth(cursor, sortedAmortSchedule);
      const monthlyInterest = simulatedBalance * (interestRatePct / 100) / 12;
      const monthlyAmortization = Math.min(simulatedBalance, amortizationBase * (amortRatePct / 100) / 12);
      simulatedBalance -= monthlyAmortization;
      const monthlyMortgageCost = monthlyInterest + monthlyAmortization;
      const budgetForMortgageModel = (totalMonthlyBudget - housingMortgageBudget) + monthlyMortgageCost;
      runningMortgageModel += income - budgetForMortgageModel;

      if (cursor.startsWith('Jan-')) cumulativeInterestThisYear = 0;
      const remainingLowBracket = Math.max(0, ANNUAL_INTEREST_DEDUCTION_THRESHOLD - cumulativeInterestThisYear);
      const interestInLowBracket = Math.min(monthlyInterest, remainingLowBracket);
      const interestInHighBracket = monthlyInterest - interestInLowBracket;
      cumulativeInterestThisYear += monthlyInterest;
      const monthlyInterestTaxReturn = interestInLowBracket * INTEREST_DEDUCTION_RATE_LOW + interestInHighBracket * INTEREST_DEDUCTION_RATE_HIGH;
      const monthlyMortgageCostAfterTax = monthlyMortgageCost - monthlyInterestTaxReturn;

      runningRecentTrend += recentMonthlyDelta;
      if (lastDisplayedMonth && monthSortKey(cursor) <= monthSortKey(lastDisplayedMonth)) {
        overlapValues[cursor] = {
          primary: running,
          mortgageModel: runningMortgageModel,
          mortgageCost: monthlyMortgageCost,
          mortgageCostAfterTax: monthlyMortgageCostAfterTax,
          recentTrend: runningRecentTrend
        };
      } else {
        projectedMonths.push(cursor);
        projectedValues.push(running);
        mortgageModelValues.push(runningMortgageModel);
        projectedMortgageCostValues.push(monthlyMortgageCost);
        projectedMortgageCostAfterTaxValues.push(monthlyMortgageCostAfterTax);
        recentTrendValues.push(runningRecentTrend);
      }
    }
  }

  datasets.forEach(d => { d.data = d.data.concat(projectedMonths.map(() => null)); });
  const buildPrefix = key => months.map((m, idx) => {
    if (idx === lastActualIdx) return lastActualTotal;
    if (idx > lastActualIdx && overlapValues[m]) return overlapValues[m][key];
    return null;
  });
  const connectingPoint = buildPrefix('primary');
  datasets.push({
    label: 'Projected savings (salary, then a-kassa step-down)',
    data: connectingPoint.concat(projectedValues),
    type: 'line',
    stack: 'projection-line',
    borderColor: '#c792ea',
    backgroundColor: '#c792ea',
    borderWidth: 2,
    borderDash: [6, 4],
    pointRadius: 2,
    tension: 0,
    spanGaps: false,
    fill: false,
    yAxisID: 'y'
  });
  datasets.push({
    label: 'Projected savings (mortgage rate/amortization model)',
    data: buildPrefix('mortgageModel').concat(mortgageModelValues),
    type: 'line',
    stack: 'projection-line-2',
    borderColor: '#82e0f9',
    backgroundColor: '#82e0f9',
    borderWidth: 2,
    borderDash: [4, 2],
    pointRadius: 2,
    tension: 0,
    spanGaps: false,
    fill: false,
    yAxisID: 'y'
  });
  const mortgageCostPrefix = months.map((m, idx) => {
    if (idx === lastActualIdx) return mortgageData[lastActualIdx];
    if (idx > lastActualIdx && overlapValues[m]) return overlapValues[m].mortgageCost;
    return null;
  });
  datasets.push({
    label: 'Projected mortgage cost',
    data: mortgageCostPrefix.concat(projectedMortgageCostValues),
    type: 'line',
    stack: 'mortgage-line-projected',
    borderColor: '#ff8a80',
    backgroundColor: '#ff8a80',
    borderWidth: 2,
    borderDash: [4, 2],
    pointRadius: 2,
    tension: 0,
    spanGaps: false,
    fill: false,
    yAxisID: 'y1'
  });
  const mortgageCostAfterTaxPrefix = months.map((m, idx) => {
    if (idx > lastActualIdx && overlapValues[m]) return overlapValues[m].mortgageCostAfterTax;
    return null;
  });
  datasets.push({
    label: 'Projected mortgage cost (after tax return)',
    data: mortgageCostAfterTaxPrefix.concat(projectedMortgageCostAfterTaxValues),
    type: 'line',
    stack: 'mortgage-line-after-tax',
    borderColor: '#ffcb6b',
    backgroundColor: '#ffcb6b',
    borderWidth: 2,
    borderDash: [1, 3],
    pointRadius: 2,
    tension: 0,
    spanGaps: false,
    fill: false,
    yAxisID: 'y1'
  });
  if (recentWindow > 0) {
    datasets.push({
      label: `Projected savings (recent ${recentWindow}-month trend)`,
      data: buildPrefix('recentTrend').concat(recentTrendValues),
      type: 'line',
      stack: 'projection-line-4',
      borderColor: '#c3e88d',
      backgroundColor: '#c3e88d',
      borderWidth: 2,
      borderDash: [1, 3],
      pointRadius: 2,
      tension: 0,
      spanGaps: false,
      fill: false,
      yAxisID: 'y'
    });
  }

  const allMonths = months.concat(projectedMonths);
  const visibleIdx = [];
  allMonths.forEach((m, idx) => {
    if (monthSortKey(m) >= monthSortKey(rangeFrom) && monthSortKey(m) <= monthSortKey(rangeTo)) {
      visibleIdx.push(idx);
    }
  });
  const visibleLabels = visibleIdx.map(idx => allMonths[idx]);
  datasets.forEach(d => { d.data = visibleIdx.map(idx => d.data[idx]); });
  return { labels: visibleLabels, datasets };
}

function buildNetWorthChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { stacked: true, ticks: { color: '#9aa4b2' }, grid: { color: '#2a303a' } },
      y: { stacked: true, position: 'left', min: 0, ticks: { color: '#9aa4b2' }, grid: { color: '#2a303a' } },
      y1: { position: 'right', min: 0, ticks: { color: '#9aa4b2' }, grid: { drawOnChartArea: false } }
    },
    plugins: {
      legend: { labels: { color: '#e8eaed', boxWidth: 12, font: { size: 11 } }, onClick: legendDoubleClickHandler() }
    }
  };
}

function MortgageModelDetails() {
  const m = mortgageModel.value;
  const todayQKey = quarterKeyForMonth(todayMonthLabel());
  const amortMonthOptions = futureAmortizationSelectableMonths();

  return (
    <details id="mortgage-model-details" style={{ marginTop: '10px' }}>
      <summary style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--text-dim)' }}>
        Mortgage rate/amortization model (drives the "mortgage rate/amortization model" projection line)
      </summary>
      <p style={{ color: 'var(--text-dim)', fontSize: '12px', margin: '8px 0 10px' }}>
        Simulates the loan balance forward month by month to replace just the Housing/Mortgage
        slice of the budget in that one projection line — every other category still uses its
        budget as set in the Budgets card above. Interest is charged on the shrinking outstanding
        balance below, but amortization is computed against the original loan amount instead
        (same as how banks peg it to your loan size at origination or your last LTV
        reassessment, not to whatever's left today) — update that figure yourself if a
        reassessment changes it. Neither figure is synced from your transactions; update the
        outstanding balance yourself periodically to keep the projection accurate.
      </p>
      <div class="mortgage-model-row">
        <label>Outstanding loan balance (kr) <input type="number" class="budget-input" style={{ width: '110px' }} placeholder="e.g. 3000000"
          value={m.loanBalance || ''} onChange={(e) => setMortgageField('loanBalance', parseFloat(e.currentTarget.value) || 0)} /></label>
        <label>Original loan amount (kr) <input type="number" class="budget-input" style={{ width: '110px' }} placeholder="e.g. 3500000"
          value={m.originalLoanAmount || ''} onChange={(e) => setMortgageField('originalLoanAmount', parseFloat(e.currentTarget.value) || 0)} /></label>
        <label>Current interest rate (%) <input type="number" class="budget-input" step="0.1" placeholder="e.g. 2"
          value={m.currentInterestRate ?? ''} onChange={(e) => setMortgageField('currentInterestRate', parseFloat(e.currentTarget.value) || 0)} /></label>
        <label>Current amortization rate (%) <input type="number" class="budget-input" step="0.1" placeholder="e.g. 2"
          value={m.currentAmortizationRate ?? ''} onChange={(e) => setMortgageField('currentAmortizationRate', parseFloat(e.currentTarget.value) || 0)} /></label>
      </div>
      <div class="mortgage-model-row">
        {[1, 2, 3, 4].map(i => (
          <label key={i}>
            <span>{quarterKeyToLabel(todayQKey + i)}</span> rate (%)
            <input
              type="number" class="budget-input" step="0.1" placeholder="same as previous"
              value={m.quarterlyInterestRates[i - 1] ?? ''}
              onChange={(e) => {
                const v = e.currentTarget.value === '' ? null : parseFloat(e.currentTarget.value);
                setQuarterlyInterestRate(i - 1, (v === null || isNaN(v)) ? null : v);
              }}
            />
          </label>
        ))}
      </div>
      <div class="mortgage-model-row">
        {[1, 2, 3, 4].map(i => {
          const entry = m.amortizationSchedule[i - 1];
          return (
            <label key={i}>
              Amortization change {i}
              <select class="cat-select" value={entry.month || ''} onChange={(e) => setAmortizationScheduleEntry(i - 1, 'month', e.currentTarget.value || null)}>
                <option value="">(unset)</option>
                {amortMonthOptions.map(mo => <option key={mo} value={mo}>{mo}</option>)}
              </select>
              <input
                type="number" class="budget-input" step="0.1" placeholder="new %"
                value={entry.rate ?? ''}
                onChange={(e) => {
                  const v = e.currentTarget.value === '' ? null : parseFloat(e.currentTarget.value);
                  setAmortizationScheduleEntry(i - 1, 'rate', (v === null || isNaN(v)) ? null : v);
                }}
              />
            </label>
          );
        })}
      </div>
    </details>
  );
}

function IncomeModelDetails() {
  const im = incomeModel.value;
  const selectable = netWorthSelectableMonths();

  return (
    <details id="income-model-details" style={{ marginTop: '10px' }}>
      <summary style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--text-dim)' }}>
        Income projection assumptions (drives the "salary, then a-kassa step-down" projection line)
      </summary>
      <p style={{ color: 'var(--text-dim)', fontSize: '12px', margin: '8px 0 10px' }}>
        Assumes a regular monthly salary through the month below, then the a-kassa/insurance
        unemployment benefit step-down schedule after that.
      </p>
      <div class="mortgage-model-row">
        <label>Regular salary ends
          <select class="cat-select" value={im.regularSalaryCutoff} onChange={(e) => setIncomeField('regularSalaryCutoff', e.currentTarget.value)}>
            {selectable.map(mo => <option key={mo} value={mo}>{mo}</option>)}
          </select>
        </label>
        <label>Projected monthly salary (kr, net) <input type="number" class="budget-input" style={{ width: '110px' }} placeholder="e.g. 45000"
          value={im.projectedMonthlySalary || ''} onChange={(e) => setIncomeField('projectedMonthlySalary', parseFloat(e.currentTarget.value) || 0)} /></label>
      </div>
      <div class="mortgage-model-row">
        {[1, 2, 3].map(i => {
          const tier = im.benefitTiers[i - 1];
          return (
            <label key={i}>
              Tier {i}: through month
              <input type="number" class="budget-input" style={{ width: '60px' }}
                value={tier.throughMonth ?? ''} onChange={(e) => setBenefitTierField(i - 1, 'throughMonth', parseFloat(e.currentTarget.value) || 0)} />
              gross kr/mo
              <input type="number" class="budget-input" style={{ width: '90px' }}
                value={tier.gross || ''} onChange={(e) => setBenefitTierField(i - 1, 'gross', parseFloat(e.currentTarget.value) || 0)} />
            </label>
          );
        })}
      </div>
    </details>
  );
}

export function NetWorthCard() {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => () => chartRef.current?.destroy(), []);
  const selectable = netWorthSelectableMonths();

  useSignalEffect(() => {
    const chartData = buildNetWorthChartData();
    const chartOptions = buildNetWorthChartOptions();
    if (chartRef.current) {
      chartRef.current.data = chartData;
      chartRef.current.options = chartOptions;
      chartRef.current.update();
    } else {
      chartRef.current = new Chart(canvasRef.current.getContext('2d'), { type: 'bar', data: chartData, options: chartOptions });
    }
  });

  return (
    <details class="card" open>
      <summary>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Net Worth</h2>
          <button
            class="btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              downloadChartPNG(chartRef.current, 'net-worth-chart.png');
            }}
          >
            Export chart
          </button>
        </div>
      </summary>
      <p style={{ color: 'var(--text-dim)', fontSize: '13px', margin: '0 0 14px' }}>
        Sparkonto balance, ISK/external-savings/fixed-term-deposit holdings, mortgage cost, and
        salary are all computed automatically from your imported Personkonto/Sparkonto
        transactions — nothing to enter by hand. The projection assumes a regular salary through
        the month set below, then the a-kassa/insurance unemployment benefit step-down schedule,
        out to however far the "To" selector below reaches. The ISK pot itself is only ever
        tracked from net deposits/withdrawals, which doesn't capture actual investment
        performance — enter your broker's reported year-to-date % change below to correct it to
        today's real value (applied from the start of the current calendar year onward).
      </p>
      <div id="networth-range-filter-row">
        <label>From
          <select class="cat-select" value={netWorthRangeFilter.value.from} onChange={(e) => setNetWorthRangeFrom(e.currentTarget.value)}>
            {selectable.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>To
          <select class="cat-select" value={netWorthRangeFilter.value.to} onChange={(e) => setNetWorthRangeTo(e.currentTarget.value)}>
            {selectable.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>ISK YTD % change <input type="number" class="budget-input" step="0.1" placeholder="e.g. 8.5"
          value={iskYtdPct.value || ''} onChange={(e) => setIskYtdPct(parseFloat(e.currentTarget.value) || 0)} /></label>
      </div>
      <MortgageModelDetails />
      <IncomeModelDetails />
      <div style={{ position: 'relative', height: '340px', marginTop: '14px' }}>
        <canvas ref={canvasRef} />
      </div>
    </details>
  );
}
