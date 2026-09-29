// Port of index.html's recategorizeTransaction() — the Transactions browser's inline category
// edit. Recategorizes every transaction with the same merchant (not just the edited row), since a
// merchant's category is meant to be consistent, and records the new category as an override so
// future imports of that merchant categorize the same way.

import { dataset, overrides } from './state.js';
import { markUnsaved } from './persistence.js';
import { showToast } from './lib/ui.js';

export function recategorizeTransaction(id, newCategory) {
  const txn = dataset.value.find(t => t.id === id);
  if (!txn || txn.category === newCategory) return;
  const merchant = txn.merchant;
  let count = 0;
  const nextDataset = dataset.value.map(t => {
    if (t.merchant === merchant && t.category !== newCategory) {
      count++;
      return { ...t, category: newCategory };
    }
    return t;
  });
  dataset.value = nextDataset;
  overrides.value = { ...overrides.value, [merchant]: newCategory };
  markUnsaved();
  if (count > 1) showToast(`Recategorized all ${count} "${merchant}" transactions to ${newCategory}.`, 'success');
}
