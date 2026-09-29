import { budgets, budgetPeriods, categoryTree } from '../state.js';
import { effectiveMonthlyBudget, budgetColorForPct, setBudget, setBudgetPeriod } from '../budgets.js';
import { visibleMonths, actualSpendForPath } from '../lib/dataset.js';
import { Stat } from './Stat.jsx';

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

export function BudgetsCard() {
  const monthCount = Math.max(visibleMonths().length, 1);
  let totalBudget = 0;
  let totalActual = 0;

  const rows = categoryTree.value.filter(entry => entry.key !== 'Excluded').map(entry => {
    const monthlyBudget = effectiveMonthlyBudget(entry);
    const rangeBudget = monthlyBudget ? monthlyBudget * monthCount : null;
    const actual = actualSpendForPath(entry.key, true);
    if (rangeBudget) totalBudget += rangeBudget;
    totalActual += actual;

    return (
      <div class="cat-tree-row" key={entry.key}>
        <div class="cat-tree-header">
          <span class="cat-tree-name">{entry.key}</span>
          <BudgetRowRight
            path={entry.key}
            explicitMonthlyBudget={budgets.value[entry.key] || null}
            actual={actual}
            effectiveRangeBudget={rangeBudget}
            isRolledUp={!budgets.value[entry.key] && !!rangeBudget}
          />
        </div>
        {entry.subs && entry.subs.length > 0 && (
          <div class="cat-tree-subs">
            {entry.subs.map(sub => {
              const subPath = entry.key + ' > ' + sub;
              const subMonthlyBudget = budgets.value[subPath] || null;
              const subRangeBudget = subMonthlyBudget ? subMonthlyBudget * monthCount : null;
              const subActual = actualSpendForPath(subPath, false);
              return (
                <div class="cat-tree-sub-row" key={sub}>
                  <span>{sub}</span>
                  <BudgetRowRight
                    path={subPath}
                    explicitMonthlyBudget={subMonthlyBudget}
                    actual={subActual}
                    effectiveRangeBudget={subRangeBudget}
                    isRolledUp={false}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  });

  const totalPct = totalBudget ? Math.round(totalActual / totalBudget * 100) : null;

  return (
    <details class="card">
      <summary><h2>Budgets</h2></summary>
      <p style={{ color: 'var(--text-dim)', fontSize: '13px', margin: '0 0 14px' }}>
        Set a budget per category or subcategory, as either kr/mo or kr/yr — use kr/yr for
        lumpy, non-recurring spend (travel, one-off shopping) where a monthly figure doesn't make
        sense. A category with no budget of its own shows the sum of its subcategories' budgets
        instead. Actual spend is scaled to the selected date range above (budget prorated to
        months in range — a kr/yr budget is divided by 12 first).
      </p>
      <div class="stat-row" style={{ marginBottom: '16px' }}>
        <Stat label="Total budget" value={totalBudget ? Math.round(totalBudget).toLocaleString() + ' kr' : '—'} />
        <Stat label="Total actual" value={Math.round(totalActual).toLocaleString() + ' kr'} />
        <Stat label="Of budget" value={totalPct !== null ? totalPct + '%' : '—'} />
      </div>
      <div>{rows}</div>
    </details>
  );
}
