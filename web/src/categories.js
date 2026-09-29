// Port of index.html's Categories card business logic (category tree editing: add/rename/merge/
// delete, plus the shared migrateCategoryReferences/categoryInUseCount helpers Budgets/Import/
// Transactions also rely on). Uses window.prompt/confirm exactly like the old app — a personal,
// single-user desktop tool, not something that needs a custom modal for this.

import { categoryTree, dataset, overrides, learnedLookup, budgets, budgetPeriods } from './state.js';
import { markUnsaved } from './persistence.js';
import { showToast } from './lib/ui.js';

export function leafCategories() {
  const leaves = [];
  categoryTree.value.forEach(cat => {
    if (cat.subs && cat.subs.length) cat.subs.forEach(sub => leaves.push(cat.key + ' > ' + sub));
    else leaves.push(cat.key);
  });
  return leaves;
}

export function categoryInUseCount(cat, prefixMatch) {
  const matches = v => (prefixMatch ? (v === cat || v.startsWith(cat + ' > ')) : v === cat);
  return dataset.value.filter(t => matches(t.category)).length;
}

// A merge target can be any leaf category ("Top" for flat, "Top > Sub" for a subcategory) OR a
// bare top-level name even if it currently has subs — the app already handles transactions filed
// with no subcategory gracefully (folded into "Other" for display), so that's a legitimate
// destination, not just leaves.
export function validMergeTargets() {
  return [...new Set([...leafCategories(), ...categoryTree.value.map(c => c.key)])];
}

// Renaming/merging a category path touches every place that path can appear: transactions'
// `category`, `overrides`/`learnedLookup` values, and budgets/budgetPeriods KEYS — all replaced
// via a shallow copy per the signal reference-equality discipline.
function migrateCategoryReferences(oldCat, newCat, prefixMatch) {
  const matches = v => (prefixMatch ? (v === oldCat || v.startsWith(oldCat + ' > ')) : v === oldCat);
  const replace = v => ((prefixMatch && v !== oldCat) ? newCat + v.slice(oldCat.length) : newCat);

  dataset.value = dataset.value.map(t => (matches(t.category) ? { ...t, category: replace(t.category) } : t));

  const nextOverrides = { ...overrides.value };
  Object.keys(nextOverrides).forEach(m => { if (matches(nextOverrides[m])) nextOverrides[m] = replace(nextOverrides[m]); });
  overrides.value = nextOverrides;

  const nextLearnedLookup = { ...learnedLookup.value };
  Object.keys(nextLearnedLookup).forEach(m => { if (matches(nextLearnedLookup[m])) nextLearnedLookup[m] = replace(nextLearnedLookup[m]); });
  learnedLookup.value = nextLearnedLookup;

  const nextBudgets = { ...budgets.value };
  Object.keys(nextBudgets).forEach(k => {
    if (!matches(k)) return;
    const newKey = replace(k);
    if (newKey !== k) { nextBudgets[newKey] = nextBudgets[k]; delete nextBudgets[k]; }
  });
  budgets.value = nextBudgets;

  const nextBudgetPeriods = { ...budgetPeriods.value };
  Object.keys(nextBudgetPeriods).forEach(k => {
    if (!matches(k)) return;
    const newKey = replace(k);
    if (newKey !== k) { nextBudgetPeriods[newKey] = nextBudgetPeriods[k]; delete nextBudgetPeriods[k]; }
  });
  budgetPeriods.value = nextBudgetPeriods;
}

export function addCategory() {
  const name = (prompt('New category name:') || '').trim();
  if (!name) return;
  if (categoryTree.value.some(c => c.key === name)) { showToast('That category already exists.', 'error'); return; }
  categoryTree.value = [...categoryTree.value, { key: name, subs: null }];
  markUnsaved();
}

export function addSubcategory(topKey) {
  const name = (prompt(`New subcategory of "${topKey}":`) || '').trim();
  if (!name) return;
  const entry = categoryTree.value.find(c => c.key === topKey);
  const subs = entry.subs || [];
  if (subs.includes(name)) { showToast('That subcategory already exists.', 'error'); return; }
  categoryTree.value = categoryTree.value.map(c => (c.key === topKey ? { ...c, subs: [...subs, name] } : c));
  markUnsaved();
}

export function renameCategory(oldKey) {
  const newKey = (prompt('Rename category:', oldKey) || '').trim();
  if (!newKey || newKey === oldKey) return;
  if (categoryTree.value.some(c => c.key === newKey)) { showToast('That category name is already in use.', 'error'); return; }
  categoryTree.value = categoryTree.value.map(c => (c.key === oldKey ? { ...c, key: newKey } : c));
  migrateCategoryReferences(oldKey, newKey, true);
  markUnsaved();
}

export function renameSubcategory(topKey, oldSub) {
  const newSub = (prompt('Rename subcategory:', oldSub) || '').trim();
  if (!newSub || newSub === oldSub) return;
  const entry = categoryTree.value.find(c => c.key === topKey);
  if (entry.subs.includes(newSub)) { showToast('That subcategory name is already in use.', 'error'); return; }
  categoryTree.value = categoryTree.value.map(c => (c.key === topKey ? { ...c, subs: c.subs.map(s => (s === oldSub ? newSub : s)) } : c));
  migrateCategoryReferences(topKey + ' > ' + oldSub, topKey + ' > ' + newSub, false);
  markUnsaved();
}

export function deleteCategory(key) {
  const count = categoryInUseCount(key, true);
  if (count) {
    showToast(`Can't delete "${key}" — ${count} transaction${count === 1 ? '' : 's'} still ${count === 1 ? 'uses' : 'use'} it. Recategorize ${count === 1 ? 'it' : 'them'} first.`, 'error');
    return;
  }
  if (!confirm(`Delete category "${key}"?`)) return;
  categoryTree.value = categoryTree.value.filter(c => c.key !== key);
  const nextBudgets = { ...budgets.value };
  delete nextBudgets[key];
  Object.keys(nextBudgets).forEach(k => { if (k.startsWith(key + ' > ')) delete nextBudgets[k]; });
  budgets.value = nextBudgets;
  const nextBudgetPeriods = { ...budgetPeriods.value };
  delete nextBudgetPeriods[key];
  Object.keys(nextBudgetPeriods).forEach(k => { if (k.startsWith(key + ' > ')) delete nextBudgetPeriods[k]; });
  budgetPeriods.value = nextBudgetPeriods;
  markUnsaved();
}

export function deleteSubcategory(topKey, sub) {
  const path = topKey + ' > ' + sub;
  const count = categoryInUseCount(path, false);
  if (count) {
    showToast(`Can't delete "${sub}" — ${count} transaction${count === 1 ? '' : 's'} still ${count === 1 ? 'uses' : 'use'} it. Recategorize ${count === 1 ? 'it' : 'them'} first.`, 'error');
    return;
  }
  if (!confirm(`Delete subcategory "${sub}" from "${topKey}"?`)) return;
  categoryTree.value = categoryTree.value.map(c => {
    if (c.key !== topKey) return c;
    const nextSubs = c.subs.filter(s => s !== sub);
    return { ...c, subs: nextSubs.length ? nextSubs : null };
  });
  const nextBudgets = { ...budgets.value };
  delete nextBudgets[path];
  budgets.value = nextBudgets;
  const nextBudgetPeriods = { ...budgetPeriods.value };
  delete nextBudgetPeriods[path];
  budgetPeriods.value = nextBudgetPeriods;
  markUnsaved();
}

// Prompts for a merge target, validates it, and confirms — used by both merge functions below.
// Returns the target path, or null if the user canceled/gave an invalid target.
function promptMergeTarget(sourcePath, count) {
  const target = (prompt(`Merge "${sourcePath}" into which category? Type the exact name, e.g. "Housing/Mortgage" or "Housing/Mortgage > Utilities".`) || '').trim();
  if (!target || target === sourcePath) return null;
  if (!validMergeTargets().includes(target)) {
    showToast(`"${target}" isn't an existing category or subcategory. Valid options: ${validMergeTargets().join(', ')}`, 'error');
    return null;
  }
  const countTxt = count ? ` (${count} transaction${count === 1 ? '' : 's'})` : '';
  if (!confirm(`Merge "${sourcePath}"${countTxt} into "${target}"? This can't be undone automatically — you'd need to recategorize them back one by one.`)) return null;
  return target;
}

export function mergeCategory(sourceKey) {
  const target = promptMergeTarget(sourceKey, categoryInUseCount(sourceKey, true));
  if (!target) return;
  migrateCategoryReferences(sourceKey, target, true);
  categoryTree.value = categoryTree.value.filter(c => c.key !== sourceKey);
  markUnsaved();
  showToast(`Merged "${sourceKey}" into "${target}".`, 'success');
}

export function mergeSubcategory(topKey, sourceSub) {
  const sourcePath = topKey + ' > ' + sourceSub;
  const target = promptMergeTarget(sourcePath, categoryInUseCount(sourcePath, false));
  if (!target) return;
  migrateCategoryReferences(sourcePath, target, false);
  categoryTree.value = categoryTree.value.map(c => {
    if (c.key !== topKey) return c;
    const nextSubs = c.subs.filter(s => s !== sourceSub);
    return { ...c, subs: nextSubs.length ? nextSubs : null };
  });
  const nextBudgets = { ...budgets.value };
  delete nextBudgets[sourcePath];
  budgets.value = nextBudgets;
  const nextBudgetPeriods = { ...budgetPeriods.value };
  delete nextBudgetPeriods[sourcePath];
  budgetPeriods.value = nextBudgetPeriods;
  markUnsaved();
  showToast(`Merged "${sourcePath}" into "${target}".`, 'success');
}
