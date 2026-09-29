// Port of index.html's recategorizeTransaction() — the Transactions browser's inline category
// edit. Recategorizes every transaction with the same merchant (not just the edited row), since a
// merchant's category is meant to be consistent, and records the new category as an override so
// future imports of that merchant categorize the same way.

import { dataset, overrides } from './state.js';
import { markUnsaved } from './persistence.js';
import { showToast } from './lib/ui.js';

export function recategorizeTransaction(id, newCategory) {
  recategorizeTransactions([id], newCategory);
}

// Bulk version for the Transactions browser's multi-select: same merchant-wide semantics, applied
// to every merchant among the selected rows at once (one dataset update, one toast).
export function recategorizeTransactions(ids, newCategory) {
  const idSet = new Set(ids);
  const merchants = new Set(dataset.value.filter(t => idSet.has(t.id) && t.category !== newCategory).map(t => t.merchant));
  if (!merchants.size) return;
  let count = 0;
  dataset.value = dataset.value.map(t => {
    if (merchants.has(t.merchant) && t.category !== newCategory) {
      count++;
      return { ...t, category: newCategory };
    }
    return t;
  });
  const nextOverrides = { ...overrides.value };
  merchants.forEach(m => { nextOverrides[m] = newCategory; });
  overrides.value = nextOverrides;
  markUnsaved();
  if (merchants.size > 1) {
    showToast(`Recategorized ${count} transactions from ${merchants.size} merchants to ${newCategory}.`, 'success');
  } else if (count > 1) {
    showToast(`Recategorized all ${count} "${[...merchants][0]}" transactions to ${newCategory}.`, 'success');
  }
}
