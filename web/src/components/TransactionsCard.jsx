import { useState } from 'preact/hooks';
import { dataset, categoryTree, budgets, unsavedChanges } from '../state.js';
import { rangeFilteredDataset, visibleMonths } from '../lib/dataset.js';
import { effectiveMonthlyBudget } from '../budgets.js';
import { leafCategories } from '../categories.js';
import { recategorizeTransaction } from '../transactions.js';
import { SortableTable } from './SortableTable.jsx';
import { SaveChangesButton } from './SaveChangesButton.jsx';

// Port of index.html's groupMeta() — the summary line shown next to a collapsed category/
// subcategory group.
function groupMeta(rows, grandTotal, isExcluded, monthCount, totalIncome, monthlyBudget) {
  const subtotal = rows.reduce((s, i) => s + i.amount, 0);
  const countTxt = `${rows.length.toLocaleString()} txn${rows.length === 1 ? '' : 's'}`;
  const amountTxt = `${Math.round(subtotal).toLocaleString()} kr`;
  const avgTxt = `${Math.round(subtotal / monthCount).toLocaleString()} kr/mo avg`;
  if (isExcluded) return `${countTxt} · excluded from totals · ${amountTxt}`;

  const parts = [countTxt, `${grandTotal ? (subtotal / grandTotal * 100).toFixed(1) : '0.0'}% of spend`, amountTxt, avgTxt];
  if (totalIncome) parts.push(`${(subtotal / totalIncome * 100).toFixed(1)}% of income`);
  if (monthlyBudget) {
    const rangeBudget = monthlyBudget * monthCount;
    if (rangeBudget) parts.push(`${(subtotal / rangeBudget * 100).toFixed(1)}% of budget`);
  }
  return parts.join(' · ');
}

function transactionsColumns() {
  const leaves = leafCategories();
  return [
    { label: 'Date', sortValue: r => r.txn_date, render: r => r.txn_date },
    { label: 'Merchant', sortValue: r => r.merchant, render: r => r.merchant },
    { label: 'Amount', sortValue: r => r.amount, render: r => r.amount.toFixed(2), align: 'right' },
    { label: 'Card', sortValue: r => r.card, render: r => r.card },
    {
      label: 'Category',
      sortValue: r => r.category,
      render: r => {
        const options = leaves.includes(r.category) ? leaves : [r.category, ...leaves];
        return (
          <select class="cat-select" value={r.category} onChange={(e) => recategorizeTransaction(r.id, e.currentTarget.value)}>
            {options.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        );
      }
    }
  ];
}

// A transaction filed directly under a top category (no subcategory) still needs somewhere to
// render when that category ALSO has other, genuinely subcategorized transactions — folded into
// "Other" (merging with an existing declared "Other" sub if there is one), but a purely flat
// category (no subcategorized transactions at all, e.g. Groceries) keeps rendering as a flat list.
function CategoryGroup({ top, topRows, grandTotal, monthCount, totalIncome, openKeys, forceOpen, toggleKey }) {
  const topEntry = categoryTree.value.find(c => c.key === top);
  const topMonthlyBudget = topEntry ? effectiveMonthlyBudget(topEntry) : null;
  const columns = transactionsColumns();

  const bySub = {};
  topRows.forEach(r => {
    const sub = r.category.split(' > ')[1];
    if (sub) (bySub[sub] = bySub[sub] || []).push(r);
  });
  const hasRealSubs = Object.keys(bySub).length > 0;
  if (hasRealSubs) {
    const noSubRows = topRows.filter(r => !r.category.split(' > ')[1]);
    if (noSubRows.length) (bySub['Other'] = bySub['Other'] || []).push(...noSubRows);
  }
  const hasSubs = Object.keys(bySub).length > 0;

  return (
    <details class="cat-group" open={forceOpen || openKeys.has(top)} onToggle={(e) => toggleKey(top, e.currentTarget.open)}>
      <summary>
        <span><span class="caret">▶</span> <span class="name">{top}</span></span>
        <span class="meta">{groupMeta(topRows, grandTotal, top === 'Excluded', monthCount, totalIncome, topMonthlyBudget)}</span>
      </summary>
      {hasSubs ? (
        Object.entries(bySub)
          .sort((a, b) => b[1].reduce((s, i) => s + i.amount, 0) - a[1].reduce((s, i) => s + i.amount, 0))
          .map(([sub, subRows]) => {
            const subKey = top + ' > ' + sub;
            const subMonthlyBudget = budgets.value[subKey] || null;
            return (
              <details key={sub} class="cat-group sub-group" open={forceOpen || openKeys.has(subKey)} onToggle={(e) => toggleKey(subKey, e.currentTarget.open)}>
                <summary>
                  <span><span class="caret">▶</span> <span class="name">{sub}</span></span>
                  <span class="meta">{groupMeta(subRows, grandTotal, false, monthCount, totalIncome, subMonthlyBudget)}</span>
                </summary>
                <SortableTable rows={subRows} columns={columns} defaultSortIdx={0} defaultSortDir="desc" rowKey={r => r.id} />
              </details>
            );
          })
      ) : (
        <SortableTable rows={topRows} columns={columns} defaultSortIdx={0} defaultSortDir="desc" rowKey={r => r.id} />
      )}
    </details>
  );
}

export function TransactionsCard() {
  const [category, setCategory] = useState('');
  const [card, setCard] = useState('');
  const [search, setSearch] = useState('');
  // Which category/subcategory groups are expanded — starts empty (every group closed), same as
  // the old app's freshly-built table. Persists across re-renders (filter changes, recategorizing
  // a row) since it's this component's own state, not rebuilt from a torn-down DOM every time.
  const [openKeys, setOpenKeys] = useState(() => new Set());

  function toggleKey(key, isOpen) {
    setOpenKeys(prev => {
      const next = new Set(prev);
      if (isOpen) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  // Category/card filter option lists always reflect the FULL dataset, not the currently filtered
  // rows — so picking one filter never narrows what's selectable in another.
  const topCategories = [...new Set(dataset.value.map(i => i.category.split(' > ')[0]))].sort();
  const cardOptions = [...new Set(dataset.value.map(i => i.card))].sort();

  let rows = rangeFilteredDataset();
  if (category) rows = rows.filter(i => i.category.split(' > ')[0] === category);
  if (card) rows = rows.filter(i => i.card === card);
  // Deliberately matched against ALL categories regardless of the category filter above — a
  // merchant can end up scattered across more than one category over time, and the point of this
  // search is to surface all of them at once.
  const searchLower = search.trim().toLowerCase();
  if (searchLower) rows = rows.filter(i => i.merchant.toLowerCase().includes(searchLower));

  // Excluded transactions (salary deposits, transfers, etc.) don't count toward any total or %.
  const countedRows = rows.filter(i => i.category !== 'Excluded');
  const grandTotal = countedRows.reduce((s, i) => s + i.amount, 0);

  const byTop = {};
  rows.forEach(r => {
    const top = r.category.split(' > ')[0];
    (byTop[top] = byTop[top] || []).push(r);
  });
  // "Excluded" always sorts last, regardless of amount — everything else by subtotal descending.
  const topEntries = Object.entries(byTop).sort((a, b) => {
    if (a[0] === 'Excluded') return 1;
    if (b[0] === 'Excluded') return -1;
    return b[1].reduce((s, i) => s + i.amount, 0) - a[1].reduce((s, i) => s + i.amount, 0);
  });

  const monthCount = Math.max(visibleMonths().length, 1);
  const totalIncome = rows.filter(i => i.merchant === 'Lön (salary)').reduce((s, i) => s + i.amount, 0);

  return (
    <details class="card">
      <summary>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>Transactions</h2>
          {unsavedChanges.value && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--warn)' }}>
              Unsaved changes
              <SaveChangesButton />
            </span>
          )}
        </div>
      </summary>
      <div class="format-row">
        <input
          type="text" class="cat-select" placeholder="Search merchant… (across all categories)"
          value={search} onInput={(e) => setSearch(e.currentTarget.value)}
        />
        <select class="cat-select" value={category} onChange={(e) => setCategory(e.currentTarget.value)}>
          <option value="">All categories</option>
          {topCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select class="cat-select" value={card} onChange={(e) => setCard(e.currentTarget.value)}>
          <option value="">All cards</option>
          {cardOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div id="txn-table-wrap">
        {rows.length === 0 ? (
          <div style={{ margin: '10px 0', color: 'var(--text-dim)', fontSize: '13px' }}>No transactions in this range.</div>
        ) : (
          <>
            <div style={{ margin: '10px 0', color: 'var(--text-dim)', fontSize: '13px' }}>
              {countedRows.length.toLocaleString()} transactions · {Math.round(grandTotal).toLocaleString()} kr total
            </div>
            {topEntries.map(([top, topRows]) => (
              <CategoryGroup
                key={top}
                top={top}
                topRows={topRows}
                grandTotal={grandTotal}
                monthCount={monthCount}
                totalIncome={totalIncome}
                openKeys={openKeys}
                forceOpen={!!searchLower}
                toggleKey={toggleKey}
              />
            ))}
          </>
        )}
      </div>
    </details>
  );
}
