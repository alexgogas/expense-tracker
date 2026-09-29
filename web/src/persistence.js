// Port of index.html's loadAllData()/saveAllChanges()/buildAppSettings()/loadLegacyJSON(), updated
// to read/write signals instead of bare globals.
//
// Now that the Overview slice exists, initOverviewState() (the state-reset portion of the old
// renderOverview() — defaulting rangeFilter and resetting drillState) runs at the end of
// loadAllData() below, same as the old app.
//
// Remaining known, intentional gap: the 4 one-time dataset-hygiene migrations
// (removeSyntheticLoanEntries, migrateMortgageSubcategories, mergeHousingAssociationFeeMerchant,
// migrateEarlyFixedTermRedemption) are still NOT called here. These aren't tied to any one card —
// they're bank-import data hygiene the old app runs unconditionally on every load — and each
// mutates real historical transactions/overrides/categoryTree in subtle, hand-tuned ways (e.g.
// preferring whichever duplicate copy is already correctly categorized, Bankgiro-prefix matching).
// Given that risk, porting them was deliberately kept out of this pass rather than folded silently
// into the Overview diff; the old index.html stays fully deployed and keeps applying them, so nothing
// that already relies on them today regresses. Worth a dedicated, carefully-tested pass of its own.
//
// CATEGORY_TREE/isValidParsedRow etc. below are bare references to categorization-engine.js's
// globals (a classic, non-module <script>, loaded before this module runs — see vite.config.js's
// comment on why that file is never converted to an ES module).

import {
  fileIds, folderId, dataset, aliases, overrides, learnedLookup, accountBalances,
  categoryTree, budgets, budgetPeriods, iskYtdPct, notes, mortgageModel,
  sparkontoReferences, incomeModel, unsavedChanges, REQUIRED_FILES, FOLDER_STORAGE_KEY,
  DEFAULT_BANK_REFERENCES, categorizationRules, categoryRoles
} from './state.js';
import { downloadFile, updateFileContent, createFileInFolder, listFilesInFolder } from './drive.js';
import { setStatus, showToast } from './lib/ui.js';
import { todayMonthLabel } from './lib/months.js';
import { initOverviewState } from './overview.js';

function freshMortgageModel() {
  return {
    loanBalance: 0, originalLoanAmount: 0, currentInterestRate: 2,
    quarterlyInterestRates: [null, null, null, null], currentAmortizationRate: 2,
    amortizationSchedule: [{ month: null, rate: null }, { month: null, rate: null }, { month: null, rate: null }, { month: null, rate: null }]
  };
}
function freshIncomeModel() {
  return {
    regularSalaryCutoff: todayMonthLabel(), projectedMonthlySalary: 0,
    benefitTiers: [{ throughMonth: 3, gross: 0 }, { throughMonth: 5, gross: 0 }, { throughMonth: 10, gross: 0 }]
  };
}

// Packages every field synced via app_settings.json into one object — the single source of truth
// for both saveAllChanges() and the one-time legacy-file migration in loadAllData() below.
export function buildAppSettings() {
  return {
    categoryTree: categoryTree.value, budgets: budgets.value, budgetPeriods: budgetPeriods.value,
    iskYtdPct: iskYtdPct.value, notes: notes.value, mortgageModel: mortgageModel.value,
    sparkontoReferences: sparkontoReferences.value, incomeModel: incomeModel.value,
    categorizationRules: categorizationRules.value, categoryRoles: categoryRoles.value
  };
}

function defaultRules() {
  return DEFAULT_CATEGORIZATION_RULES.map(r => ({ ...r }));
}

// The engine assigns EXCLUDED and UNCATEGORIZED itself, so they must always exist in the tree (for
// dropdowns, budgets, grouping) — re-added if a saved tree is somehow missing them. Pure: returns
// the same array if nothing needed adding.
function withBuiltInCategories(tree) {
  let next = tree;
  if (!next.some(c => c.key === EXCLUDED)) next = [...next, { key: EXCLUDED, subs: null }];
  const [otherKey, uncategorizedSub] = UNCATEGORIZED.split(' > ');
  const other = next.find(c => c.key === otherKey);
  if (!other) {
    next = [...next, { key: otherKey, subs: [uncategorizedSub] }];
  } else if (!(other.subs || []).includes(uncategorizedSub)) {
    next = next.map(c => (c === other ? { ...c, subs: [...(c.subs || []), uncategorizedSub] } : c));
  }
  return next;
}

// Best-effort read of a pre-consolidation settings file, used only during the one-time migration
// to app_settings.json — returns undefined (not a throw) if the file doesn't exist or fails to
// parse, so the migration can fall back to a fresh default for that one field without losing others.
async function loadLegacyJSON(filename) {
  if (!fileIds.value[filename]) return undefined;
  try {
    return JSON.parse(await downloadFile(fileIds.value[filename]));
  } catch (e) {
    console.error(`Could not read legacy ${filename} during app_settings.json migration.`, e);
    return undefined;
  }
}

export function markUnsaved() {
  unsavedChanges.value = true;
}

function isValidTransaction(t) {
  return !!(t &&
    typeof t.txn_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.txn_date) &&
    t.merchant && String(t.merchant).trim().length > 0 &&
    typeof t.amount === 'number' && isFinite(t.amount) &&
    t.category && typeof t.category === 'string');
}

export async function loadAllData() {
  if (!folderId.value) {
    setStatus('No Drive folder connected yet.');
    return;
  }
  try {
    setStatus('Listing files…');
    const files = await listFilesInFolder(folderId.value);
    const nextFileIds = {};
    files.forEach(f => { nextFileIds[f.name] = f.id; });
    fileIds.value = nextFileIds;

    const missing = REQUIRED_FILES.filter(name => !fileIds.value[name]);
    if (missing.length) {
      setStatus('');
      showToast('Missing files in Drive folder: ' + missing.join(', '), 'error');
      return;
    }

    setStatus('Loading transactions…');
    const [datasetRaw, aliasesRaw, overridesRaw, learnedLookupRaw, accountBalancesRaw] = await Promise.all([
      downloadFile(fileIds.value['canonical_dataset.json']),
      downloadFile(fileIds.value['canonical_aliases.json']),
      downloadFile(fileIds.value['canonical_overrides.json']),
      downloadFile(fileIds.value['merchant_category_lookup.json']),
      fileIds.value['account_balances.json'] ? downloadFile(fileIds.value['account_balances.json']) : Promise.resolve(null)
    ]);
    let nextDataset = JSON.parse(datasetRaw);
    const invalidCount = nextDataset.filter(t => !isValidTransaction(t)).length;
    if (invalidCount) nextDataset = nextDataset.filter(isValidTransaction);
    dataset.value = nextDataset;

    aliases.value = JSON.parse(aliasesRaw);
    overrides.value = JSON.parse(overridesRaw);
    learnedLookup.value = JSON.parse(learnedLookupRaw);

    accountBalances.value = accountBalancesRaw ? JSON.parse(accountBalancesRaw) : {};
    if (!fileIds.value['account_balances.json']) {
      try {
        await createFileInFolder('account_balances.json', JSON.stringify(accountBalances.value, null, 2));
      } catch (e) {
        console.error('Could not create account_balances.json yet — will retry on next save.', e);
      }
    }

    setStatus('Loading settings…');
    if (fileIds.value['app_settings.json']) {
      const s = JSON.parse(await downloadFile(fileIds.value['app_settings.json']));
      categoryTree.value = s.categoryTree ?? JSON.parse(JSON.stringify(CATEGORY_TREE));
      budgets.value = s.budgets ?? {};
      budgetPeriods.value = s.budgetPeriods ?? {};
      iskYtdPct.value = s.iskYtdPct ?? 0;
      notes.value = s.notes ?? '';
      const loadedMortgageModel = s.mortgageModel ?? freshMortgageModel();
      // Backward compat: mortgageModel saved before originalLoanAmount existed used the
      // outstanding balance as the amortization base too.
      if (loadedMortgageModel.originalLoanAmount === undefined) loadedMortgageModel.originalLoanAmount = loadedMortgageModel.loanBalance;
      mortgageModel.value = loadedMortgageModel;
      // Merged over defaults so settings saved before a field existed (e.g. housingFeeBankgiro)
      // still yield '' for it rather than undefined.
      sparkontoReferences.value = { ...DEFAULT_BANK_REFERENCES, ...(s.sparkontoReferences ?? {}) };
      incomeModel.value = s.incomeModel ?? freshIncomeModel();
      // Settings saved before these existed re-seed from the defaults (identical behavior to the
      // old hardcoded rules) until the next Save to Drive writes them out.
      categorizationRules.value = s.categorizationRules ?? defaultRules();
      categoryRoles.value = { ...DEFAULT_CATEGORY_ROLES, ...(s.categoryRoles ?? {}) };
    } else {
      // One-time migration: read whichever pre-consolidation files exist (all in parallel), fall
      // back to fresh defaults for anything missing, then write the new combined file.
      const [legacyCategoryTree, legacyBudgets, legacyBudgetPeriods, legacyIskYtdPct, legacyMortgageModel, legacyNotes] = await Promise.all([
        loadLegacyJSON('category_tree.json'),
        loadLegacyJSON('budgets.json'),
        loadLegacyJSON('budget_periods.json'),
        loadLegacyJSON('isk_ytd_pct.json'),
        loadLegacyJSON('mortgage_model.json'),
        loadLegacyJSON('notes.json')
      ]);
      categoryTree.value = legacyCategoryTree ?? JSON.parse(JSON.stringify(CATEGORY_TREE));
      budgets.value = legacyBudgets ?? {};
      budgetPeriods.value = legacyBudgetPeriods ?? {};
      iskYtdPct.value = legacyIskYtdPct ?? 0;
      notes.value = legacyNotes ?? '';
      const migratedMortgageModel = legacyMortgageModel ?? freshMortgageModel();
      if (migratedMortgageModel.originalLoanAmount === undefined) migratedMortgageModel.originalLoanAmount = migratedMortgageModel.loanBalance;
      mortgageModel.value = migratedMortgageModel;
      sparkontoReferences.value = { ...DEFAULT_BANK_REFERENCES };
      incomeModel.value = freshIncomeModel();
      categorizationRules.value = defaultRules();
      categoryRoles.value = { ...DEFAULT_CATEGORY_ROLES };
      try {
        await createFileInFolder('app_settings.json', JSON.stringify(buildAppSettings(), null, 2));
      } catch (e) {
        console.error('Could not create app_settings.json yet — will retry on next save.', e);
      }
    }

    // TODO (future pass): removeSyntheticLoanEntries(), migrateMortgageSubcategories(),
    // mergeHousingAssociationFeeMerchant(), migrateEarlyFixedTermRedemption() — see the file-level
    // comment above.
    categoryTree.value = withBuiltInCategories(categoryTree.value);
    initOverviewState();
    unsavedChanges.value = false;
    setStatus(`Loaded ${dataset.value.length} transactions.`);

    if (invalidCount) {
      unsavedChanges.value = true;
      showToast(
        `Removed ${invalidCount} corrupted transaction${invalidCount === 1 ? '' : 's'} found in your data ` +
        `(e.g. a bank export's summary row that got imported by mistake). Click "Save to Drive" to make this permanent.`,
        'error'
      );
    }
  } catch (err) {
    setStatus('');
    if (err.message && err.message.includes('404')) {
      localStorage.removeItem(FOLDER_STORAGE_KEY);
      folderId.value = null;
      showToast('That folder is no longer accessible. Click "Connect Drive folder" to reselect it.', 'error');
    } else {
      showToast('Error loading data: ' + err.message, 'error');
    }
    console.error(err);
  }
}

export async function saveAllChanges() {
  if (!unsavedChanges.value) return;
  setStatus('Saving changes to Drive…');
  try {
    await updateFileContent(fileIds.value['canonical_dataset.json'], JSON.stringify(dataset.value));
    await updateFileContent(fileIds.value['canonical_overrides.json'], JSON.stringify(overrides.value, null, 2));
    await updateFileContent(fileIds.value['merchant_category_lookup.json'], JSON.stringify(learnedLookup.value, null, 2));
    if (fileIds.value['account_balances.json']) {
      await updateFileContent(fileIds.value['account_balances.json'], JSON.stringify(accountBalances.value, null, 2));
    } else {
      await createFileInFolder('account_balances.json', JSON.stringify(accountBalances.value, null, 2));
    }
    if (fileIds.value['app_settings.json']) {
      await updateFileContent(fileIds.value['app_settings.json'], JSON.stringify(buildAppSettings(), null, 2));
    } else {
      await createFileInFolder('app_settings.json', JSON.stringify(buildAppSettings(), null, 2));
    }
    unsavedChanges.value = false;
    setStatus('Changes saved.');
    showToast('Changes saved to Drive.', 'success');
  } catch (err) {
    setStatus('');
    let hint = '';
    if (err.message && err.message.includes('appNotAuthorizedToFile')) {
      hint = ' Click "Grant file access" above and select the 4 data files, then try saving again.';
    } else if (err.message && err.message.includes('401')) {
      hint = ' Your session may have expired — try signing in again.';
    }
    showToast('Save failed: ' + err.message + hint, 'error');
    console.error(err);
  }
}
