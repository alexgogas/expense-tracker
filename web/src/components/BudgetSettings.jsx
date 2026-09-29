import { budgets, budgetPeriods } from '../state.js';
import { budgetSummary, budgetColorForPct, setBudget, setBudgetPeriod } from '../budgets.js';
import { actualSpendForPath } from '../lib/dataset.js';

function BudgetRowRight({ path, explicitMonthlyBudget, actual, effectiveRangeBudget, isRolledUp }) {
  const period = budgetPeriods.value[path] || 'month';
  const pct = effectiveRangeBudget ? (actual / effectiveRangeBudget * 100) : null;
  const color = pct !== null ? budgetColorForPct(pct) : null;
  const displayValue = explicitMonthlyBudget
    ? Math.round(period === 'year' ? explicitMonthlyBudget * 12 : explicitMonthlyBudget)
    : '';

  return (
    <span class="budget-row-right">
      <span class="budget-actual">{Math.round(actual).toLocaleString()} kr</span>
      {effectiveRangeBudget ? (
        <>
          <span class="budget-bar-wrap">
            <span class="budget-bar" style={{ width: Math.min(pct, 100) + '%', backgroundColor: color }} />
          </span>
          <span class="budget-pct" style={{ color }}>{Math.round(pct)}%{isRolledUp ? ' (from subs)' : ''}</span>
        </>
      ) : (
        <span class="budget-pct" style={{ color: 'var(--text-dim)' }}>no budget set</span>
      )}
      <input
        type="number" min="0" class="budget-input" placeholder="amount"
        value={displayValue}
        onChange={(e) => setBudget(path, e.currentTarget.value, period)}
      />
      <select class="budget-period-select" value={period} onChange={(e) => setBudgetPeriod(path, e.currentTarget.value)}>
        <option value="month">kr/mo</option>
        <option value="year">kr/yr</option>
      </select>
    </span>
  );
}

// Settings tab: set a budget per category or subcategory. Progress against these is shown on the
// dashboard (BudgetProgress, inside Overview).
export function BudgetSettings() {
  const { rows, monthCount } = budgetSummary();
  return (
    <>
      <p class="panel-hint">
        Set a budget per category or subcategory, as kr/mo or kr/yr — use kr/yr for lumpy,
        non-recurring spend (travel, one-off shopping). A category with no budget of its own uses
        the sum of its subcategories' budgets. Actual spend shown here is for the date range
        selected on the dashboard (budgets prorated to the months in range).
      </p>
      {rows.map(({ entry, rangeBudget, actual, isRolledUp }) => (
        <div class="cat-tree-row" key={entry.key}>
          <div class="cat-tree-header">
            <span class="cat-tree-name">{entry.key}</span>
            <BudgetRowRight
              path={entry.key}
              explicitMonthlyBudget={budgets.value[entry.key] || null}
              actual={actual}
              effectiveRangeBudget={rangeBudget}
              isRolledUp={isRolledUp}
            />
          </div>
          {entry.subs && entry.subs.length > 0 && (
            <div class="cat-tree-subs">
              {entry.subs.map(sub => {
                const subPath = entry.key + ' > ' + sub;
                const subMonthlyBudget = budgets.value[subPath] || null;
                return (
                  <div class="cat-tree-sub-row" key={sub}>
                    <span>{sub}</span>
                    <BudgetRowRight
                      path={subPath}
                      explicitMonthlyBudget={subMonthlyBudget}
                      actual={actualSpendForPath(subPath, false)}
                      effectiveRangeBudget={subMonthlyBudget ? subMonthlyBudget * monthCount : null}
                      isRolledUp={false}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
