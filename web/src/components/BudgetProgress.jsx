import { budgetSummary, budgetColorForPct } from '../budgets.js';
import { view, settingsTab } from '../lib/ui.js';
import { Stat } from './Stat.jsx';

// Bars share one scale so they compare across rows: it stretches past 100% to fit the most
// overspent row, up to this cap — beyond it a bar is clipped (with a faded end) and its % says the rest.
const MAX_SCALE_PCT = 150;

// Read-only budget vs actual for the dashboard (inside Overview), over the selected date range.
// Amounts are set in Settings → Budgets.
export function BudgetProgress() {
  const { rows, totalBudget, totalActual } = budgetSummary();
  const budgeted = rows.filter(r => r.rangeBudget);
  const totalPct = totalBudget ? Math.round(totalActual / totalBudget * 100) : null;
  const maxPct = Math.max(100, ...budgeted.map(r => r.actual / r.rangeBudget * 100));
  const scale = Math.min(maxPct, MAX_SCALE_PCT);

  return (
    <details class="budget-progress" open>
      <summary>Budget progress</summary>
      {budgeted.length === 0 ? (
        <p class="panel-hint">
          No budgets set yet — add them in{' '}
          <button class="link-btn" onClick={() => { settingsTab.value = 'budgets'; view.value = 'settings'; }}>Settings → Budgets</button>.
        </p>
      ) : (
        <>
          <div class="stat-row" style={{ margin: '10px 0 12px' }}>
            <Stat label="Total budget" value={Math.round(totalBudget).toLocaleString() + ' kr'} />
            <Stat label="Total actual" value={Math.round(totalActual).toLocaleString() + ' kr'} />
            <Stat label="Of budget" value={totalPct + '%'} />
          </div>
          <div class="progress-list">
            {budgeted.map(({ entry, rangeBudget, actual, isRolledUp }) => {
              const pct = actual / rangeBudget * 100;
              const color = budgetColorForPct(pct);
              return (
                <div class="progress-row" key={entry.key}>
                  <span class="progress-name">{entry.key}</span>
                  <span class="progress-track" title={`${Math.round(pct)}% of budget`}>
                    <span class={'progress-fill' + (pct > scale ? ' clipped' : '')}
                      style={{ width: Math.min(pct, scale) / scale * 100 + '%', backgroundColor: color }} />
                    <span class="progress-limit" style={{ left: 100 / scale * 100 + '%' }} />
                  </span>
                  <span class="progress-pct" style={{ color }}>{Math.round(pct)}%</span>
                  <span class="budget-actual">
                    {Math.round(actual).toLocaleString()} / {Math.round(rangeBudget).toLocaleString()} kr{isRolledUp ? ' (from subs)' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </details>
  );
}
