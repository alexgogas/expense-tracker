import { mortgageModel, incomeModel, iskYtdPct } from '../state.js';
import { todayMonthLabel } from '../lib/months.js';
import {
  netWorthSelectableMonths, futureAmortizationSelectableMonths, quarterKeyForMonth, quarterKeyToLabel,
  setMortgageField, setQuarterlyInterestRate, setAmortizationScheduleEntry,
  setIskYtdPct, setIncomeField, setBenefitTierField
} from '../networth.js';

// Settings tab: the assumptions behind the Net Worth chart's projections.
export function ProjectionSettings() {
  const m = mortgageModel.value;
  const im = incomeModel.value;
  const todayQKey = quarterKeyForMonth(todayMonthLabel());
  const amortMonthOptions = futureAmortizationSelectableMonths();
  const incomeMonths = netWorthSelectableMonths();

  return (
    <>
      <h3 class="settings-heading">ISK performance</h3>
      <p class="panel-hint">
        The ISK pot is tracked from net deposits/withdrawals only, which misses investment
        performance. Enter your broker's reported year-to-date % change to correct it to today's
        real value (applied from the start of the current calendar year).
      </p>
      <div class="mortgage-model-row">
        <label>ISK YTD % change <input type="number" class="budget-input" step="0.1" placeholder="e.g. 8.5"
          value={iskYtdPct.value || ''} onChange={(e) => setIskYtdPct(parseFloat(e.currentTarget.value) || 0)} /></label>
      </div>

      <h3 class="settings-heading">Income</h3>
      <p class="panel-hint">
        Drives the "salary, then a-kassa step-down" projection: a regular monthly salary through the
        month below, then the a-kassa/insurance unemployment benefit step-down schedule.
      </p>
      <div class="mortgage-model-row">
        <label>Regular salary ends
          <select class="cat-select" value={im.regularSalaryCutoff} onChange={(e) => setIncomeField('regularSalaryCutoff', e.currentTarget.value)}>
            {incomeMonths.map(mo => <option key={mo} value={mo}>{mo}</option>)}
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

      <h3 class="settings-heading">Mortgage</h3>
      <p class="panel-hint">
        Drives the "mortgage rate/amortization model" projection: simulates the loan month by month
        and replaces just the housing slice of your budget in that line. Interest is charged on the
        shrinking outstanding balance; amortization on the original loan amount (as banks peg it to
        the loan size at origination or the last valuation). Neither is synced from transactions —
        update the outstanding balance yourself now and then.
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
    </>
  );
}
