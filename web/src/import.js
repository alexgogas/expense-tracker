// Port of index.html's Import card business logic (file parsing, dedup, staging, save) — updated
// to read/write signals instead of bare globals. `processImport` below is a bare reference to
// categorization-engine.js's global (see persistence.js's file-level comment on why that file
// stays a classic, non-module <script>). xlsx (SheetJS) is an npm dependency loaded on demand in
// parseXlsx() — it's the app's largest dependency and only needed for .xlsx imports.

import {
  dataset, aliases, overrides, learnedLookup, sparkontoReferences, selectedFormat, pendingImport,
  fileIds, accountBalances, NET_WORTH_ACCOUNT, categorizationRules, categoryRoles
} from './state.js';
import { updateFileContent, createFileInFolder } from './drive.js';
import { setStatus, showToast, busy } from './lib/ui.js';
import { monthLabel } from './lib/months.js';
import { markUnsaved } from './persistence.js';

export function transactionKey(t) {
  return [t.txn_date, t.merchant.trim().toLowerCase(), t.amount.toFixed(2), t.card].join('|');
}

// For each calendar month present, keeps the balance from that month's latest-dated row — the
// "as of the last known transaction that month" snapshot, not a sum or average across the month.
export function extractMonthEndBalances(rows) {
  const byMonth = {};
  rows.forEach(r => {
    const month = monthLabel(r.txn_date);
    if (!byMonth[month] || r.txn_date > byMonth[month].date) {
      byMonth[month] = { date: r.txn_date, balance: r.balance };
    }
  });
  const result = {};
  Object.keys(byMonth).forEach(m => { result[m] = byMonth[m].balance; });
  return result;
}

function normalizeDate(val, XLSX) {
  // handles Excel serial dates or date strings -> YYYY-MM-DD
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  return String(val).slice(0, 10);
}
function normalizeAmexDate(val, XLSX) {
  // MM/DD/YYYY -> YYYY-MM-DD
  if (typeof val === 'number') return normalizeDate(val, XLSX);
  const parts = String(val).split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  return String(val);
}

export async function parseXlsx(file, format) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  if (format === 'eurobonus') {
    const sheet = wb.Sheets['Transaktioner'] || wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: ['Datum', 'Bokfort', 'Specifikation', 'Ort', 'Valuta', 'Utl_belopp', 'Belopp'], range: 3, raw: true });
    return rows
      .filter(r => r.Datum && typeof r.Belopp === 'number')
      .map(r => ({
        Datum: normalizeDate(r.Datum, XLSX),
        Specifikation: String(r.Specifikation || '').trim(),
        Belopp: r.Belopp
      }));
  }
  if (format === 'amex') {
    const sheet = wb.Sheets['Transaktionsspecifikationer'] || wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: ['Datum', 'Beskrivning', 'Belopp', 'Utokade', 'Kontoutdrag', 'Adress', 'Ort', 'Postnr', 'Land', 'Referens'], range: 6, raw: true });
    return rows
      .filter(r => r.Datum && r.Datum !== 'Datum' && r.Beskrivning)
      .map(r => ({
        Datum: normalizeAmexDate(r.Datum, XLSX),
        Beskrivning: String(r.Beskrivning).trim(),
        Belopp: parseFloat(r.Belopp)
      }))
      .filter(r => !isNaN(r.Belopp));
  }
  throw new Error('Unknown xlsx format');
}

export function parsePersonkontoCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let text = e.target.result;
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const header = lines[0].split(';');
        const idx = {
          date: header.indexOf('Bokföringsdag'),
          amount: header.indexOf('Belopp'),
          rubrik: header.indexOf('Rubrik'),
          saldo: header.indexOf('Saldo')
        };
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(';');
          if (cols.length < header.length) continue;
          const dateStr = cols[idx.date].replace(/\//g, '-');
          const amountStr = cols[idx.amount].replace(/\s/g, '').replace(',', '.');
          // Saldo isn't used for Personkonto imports (categorization only), but Sparkonto imports
          // reuse it to derive the Net Worth chart's balance bar — see handleFile.
          const saldoStr = idx.saldo > -1 ? (cols[idx.saldo] || '').replace(/\s/g, '').replace(',', '.') : '';
          rows.push({
            Bokforingsdag: dateStr,
            Belopp: parseFloat(amountStr),
            Rubrik: cols[idx.rubrik],
            Saldo: saldoStr ? parseFloat(saldoStr) : null
          });
        }
        resolve(rows.filter(r => !isNaN(r.Belopp)));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });
}

export async function handleFile(file) {
  if (!dataset.value.length) {
    showToast('Sign in and let data finish loading first.', 'error');
    return;
  }
  if (busy.value) return;
  setStatus('Reading file…');
  busy.value = { kind: 'import', message: 'Reading file…' };
  try {
    const format = selectedFormat.value;
    let rawRows;
    if (format === 'personkonto' || format === 'sparkonto') {
      rawRows = await parsePersonkontoCSV(file);
    } else {
      rawRows = await parseXlsx(file, format);
    }

    const { results, unmatched } = processImport(rawRows, format, aliases.value, overrides.value, learnedLookup.value, sparkontoReferences.value,
      { rules: categorizationRules.value, roles: categoryRoles.value });

    // Skip transactions that already exist in the dataset, or repeat within this same file (same
    // date, merchant, amount and card), so re-importing an overlapping statement is a no-op.
    const existingByKey = new Map(dataset.value.map(t => [transactionKey(t), t]));
    const seenInBatch = new Set();
    const deduped = [];
    const flowBucketUpgrades = [];
    let duplicateCount = 0;
    results.forEach(r => {
      const key = transactionKey(r);
      const existing = existingByKey.get(key);
      if (existing || seenInBatch.has(key)) {
        duplicateCount++;
        // Upgrade path: a Sparkonto transaction saved before ISK/external-savings/fixed-term-
        // deposit tracking existed has no _flowBucket of its own. Re-importing the same file now
        // would otherwise just discard this duplicate forever, permanently blocking that pot's
        // balance from ever being derived — so patch the existing record in instead.
        if (existing && r._flowBucket && !existing._flowBucket) {
          flowBucketUpgrades.push({ id: existing.id, flowBucket: r._flowBucket, rawSign: r._rawSign });
        }
        return;
      }
      seenInBatch.add(key);
      deduped.push(r);
    });
    const dedupedSet = new Set(deduped);
    const dedupedUnmatched = unmatched.filter(r => dedupedSet.has(r));

    // Sparkonto exports carry a running Saldo column too — piggyback on the same file to derive
    // the Net Worth chart's balance bar, no separate balance-history upload needed. Staged on
    // pendingImport (not applied yet) so nothing is committed until saveImport() runs.
    let balanceUpdates = null;
    if (format === 'sparkonto') {
      const balanceRows = rawRows
        .filter(r => r.Saldo != null && !isNaN(r.Saldo))
        .map(r => ({ txn_date: r.Bokforingsdag, balance: r.Saldo }));
      if (balanceRows.length) balanceUpdates = extractMonthEndBalances(balanceRows);
    }

    pendingImport.value = { results: deduped, unmatched: dedupedUnmatched, format, balanceUpdates, flowBucketUpgrades, duplicateCount };
    setStatus('');
  } catch (err) {
    setStatus('');
    showToast('Import failed: ' + err.message, 'error');
    console.error(err);
  } finally {
    busy.value = null;
  }
}

export function setSparkontoReference(field, rawValue) {
  sparkontoReferences.value = { ...sparkontoReferences.value, [field]: rawValue.replace(/\s+/g, '').trim() };
  markUnsaved();
}

// `choices` is { unmatchedIdx: chosenCategory }, from the ImportResults component's local state —
// the reactive equivalent of the old app reading `<select data-unmatched-idx>` elements straight
// out of the DOM at save time.
export async function saveImport(choices) {
  const pending = pendingImport.value;
  if (!pending || busy.value) return;
  setStatus('Saving to Drive…');

  // Apply any manual category picks for unmatched rows. The old app relied on `unmatched[idx]`
  // and its corresponding entry in `results` being the SAME object reference, so mutating
  // `row.category` there updated both at once; this port instead correlates by identity through a
  // Map, so nothing is mutated in place.
  const newOverrides = { ...overrides.value };
  const categoryOverridesByRow = new Map();
  pending.unmatched.forEach((row, idx) => {
    const chosenCategory = choices[idx] || 'Other > Uncategorized';
    if (chosenCategory !== 'Other > Uncategorized') {
      newOverrides[row.merchant] = chosenCategory;
      categoryOverridesByRow.set(row, chosenCategory);
    }
  });
  const resolvedResults = pending.results.map(r => (categoryOverridesByRow.has(r) ? { ...r, category: categoryOverridesByRow.get(r) } : r));

  // merge: assign new ids, append to dataset. _flowBucket/_rawSign (Sparkonto's ISK/external-
  // savings/fixed-term-deposit tagging) are carried through explicitly, not via a blind spread, so
  // other internal parser-only fields (e.g. _forcedCategory) don't leak into what's persisted.
  const maxId = dataset.value.reduce((m, i) => Math.max(m, i.id), 0);
  const merged = resolvedResults.map((r, i) => ({
    id: maxId + 1 + i,
    month: monthLabel(r.txn_date),
    merchant: r.merchant,
    amount: r.amount,
    category: r.category,
    txn_date: r.txn_date,
    card: r.card,
    ...(r._flowBucket ? { _flowBucket: r._flowBucket, _rawSign: r._rawSign } : {})
  }));

  // Patch _flowBucket/_rawSign onto already-saved duplicate transactions that predate this
  // tracking (see the "Upgrade path" comment in handleFile) — everything else about the record is
  // untouched.
  const upgrades = pending.flowBucketUpgrades || [];
  const upgradesById = new Map(upgrades.map(u => [u.id, u]));

  // Compute the merged state locally first; don't touch dataset/overrides signals until the Drive
  // write actually succeeds, so a failed save doesn't leave the app pointing at unsaved local data
  // (which would also duplicate rows on retry) while the charts silently go stale.
  const nextDataset = dataset.value.map(t => {
    const u = upgradesById.get(t.id);
    return u ? { ...t, _flowBucket: u.flowBucket, _rawSign: u.rawSign } : t;
  }).concat(merged);
  const nextOverrides = newOverrides;

  // The dataset write is the point of no return: once it succeeds, the transactions are safely on
  // Drive with the categories the user picked already baked in (independent of overrides.json —
  // overrides only affect FUTURE auto-categorization of the same merchant). The dataset signal and
  // pendingImport get committed right after that write, before anything else is attempted — so if
  // the dataset write succeeds but the overrides write then fails, local state still matches what
  // Drive actually has (no stale dataset, no risk of double-writing these rows on retry).
  const balanceUpdates = pending.balanceUpdates; // captured before pendingImport is cleared below
  let transactionsSaved = false;
  busy.value = { kind: 'save', message: 'Saving import to Drive…' };
  try {
    await updateFileContent(fileIds.value['canonical_dataset.json'], JSON.stringify(nextDataset));
    transactionsSaved = true;
    dataset.value = nextDataset;
    pendingImport.value = null;

    await updateFileContent(fileIds.value['canonical_overrides.json'], JSON.stringify(nextOverrides, null, 2));
    overrides.value = nextOverrides;

    // Sparkonto's Saldo-derived balances — best-effort: the transactions above are already safely
    // saved, so a failure here just means the Net Worth chart's Sparkonto bar won't reflect this
    // import yet, not a lost import.
    if (balanceUpdates) {
      const nextAccountBalances = { ...accountBalances.value };
      Object.keys(balanceUpdates).forEach(m => {
        nextAccountBalances[m] = { ...(nextAccountBalances[m] || {}), [NET_WORTH_ACCOUNT]: balanceUpdates[m] };
      });
      accountBalances.value = nextAccountBalances;
      try {
        if (fileIds.value['account_balances.json']) {
          await updateFileContent(fileIds.value['account_balances.json'], JSON.stringify(accountBalances.value, null, 2));
        } else {
          await createFileInFolder('account_balances.json', JSON.stringify(accountBalances.value, null, 2));
        }
      } catch (e) {
        console.error('Could not save updated Sparkonto balances — will retry on next import/save.', e);
      }
    }

    const upgradeNote = upgrades.length ? ` Backfilled pot-tracking data onto ${upgrades.length} existing transaction${upgrades.length === 1 ? '' : 's'}.` : '';
    setStatus(`Saved. ${merged.length} transactions added.${upgradeNote}`);
    showToast(`Saved ${merged.length} transactions to Drive.${upgradeNote}`, 'success');
  } catch (err) {
    setStatus('');
    let hint = '';
    if (err.message && err.message.includes('appNotAuthorizedToFile')) {
      hint = ' Click "Grant file access" above and select the 4 data files, then try saving again.';
    } else if (err.message && err.message.includes('401')) {
      hint = ' Your session may have expired — try signing in again.';
    }
    if (transactionsSaved) {
      showToast(
        `Saved ${merged.length} transactions to Drive, but saving the merchant category override failed: ` +
        `${err.message}.${hint} The categories you picked are still applied to these transactions — only ` +
        `future imports of the same merchant will need recategorizing.`,
        'error'
      );
    } else {
      showToast('Save failed: ' + err.message + hint, 'error');
    }
    console.error(err);
  } finally {
    busy.value = null;
  }
}
