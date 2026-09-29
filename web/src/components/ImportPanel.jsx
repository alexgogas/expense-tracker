import { useRef, useState } from 'preact/hooks';
import { selectedFormat, pendingImport } from '../state.js';
import { handleFile, saveImport } from '../import.js';
import { leafCategories } from '../categories.js';
import { busy } from '../lib/ui.js';
import { Spinner } from './Spinner.jsx';

const FORMATS = [
  { key: 'eurobonus', label: 'SAS EuroBonus (.xlsx)', ext: '.xlsx' },
  { key: 'amex', label: 'SAS Amex (.xlsx)', ext: '.xlsx' },
  { key: 'personkonto', label: 'Nordea Personkonto (.csv)', ext: '.csv' },
  { key: 'sparkonto', label: 'Nordea Sparkonto (.csv)', ext: '.csv' }
];

function ImportResults({ pending, choices, setChoices }) {
  const { results, unmatched, duplicateCount, balanceUpdates, flowBucketUpgrades } = pending;
  const total = results.reduce((s, r) => s + r.amount, 0);
  const hasPendingSideEffects = !!(balanceUpdates && Object.keys(balanceUpdates).length) || (flowBucketUpgrades && flowBucketUpgrades.length > 0);
  const canSave = results.length > 0 || hasPendingSideEffects;
  const leaves = leafCategories();

  return (
    <>
      <div class="stat-row" style={{ marginTop: '16px' }}>
        <div class="stat"><div class="label">New</div><div class="value">{results.length}</div></div>
        <div class="stat"><div class="label">Total</div><div class="value">{Math.round(total).toLocaleString()} kr</div></div>
        <div class="stat"><div class="label">Needs review</div><div class="value">{unmatched.length}</div></div>
        <div class="stat"><div class="label">Duplicates skipped</div><div class="value">{duplicateCount || 0}</div></div>
      </div>
      {unmatched.length > 0 && (
        <div class="table-scroll">
          <table>
            <thead><tr><th>Date</th><th>Merchant</th><th>Amount</th><th>Category</th></tr></thead>
            <tbody>
              {unmatched.map((r, idx) => (
                <tr key={idx}>
                  <td>{r.txn_date}</td>
                  <td>{r.merchant}</td>
                  <td>{r.amount.toFixed(2)}</td>
                  <td>
                    <select
                      class="cat-select"
                      value={choices[idx] || 'Other > Uncategorized'}
                      onChange={(e) => setChoices({ ...choices, [idx]: e.currentTarget.value })}
                    >
                      {leaves.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canSave ? (
        <>
          {!results.length && (
            <div style={{ marginTop: '16px', marginBottom: '10px', color: 'var(--text-dim)', fontSize: '13px' }}>
              No new transactions, but this file has Sparkonto balance/pot-tracking data worth saving.
            </div>
          )}
          <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
            <button class="primary" onClick={() => saveImport(choices)} disabled={!!busy.value}>
              {busy.value?.kind === 'save' ? <><Spinner /> Saving…</> : 'Save to Drive'}
            </button>
            <button onClick={() => { pendingImport.value = null; }} disabled={busy.value?.kind === 'save'}>Discard</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginTop: '16px', color: 'var(--text-dim)', fontSize: '13px' }}>
            Every transaction in this file was already in your data — nothing new to save.
          </div>
          <div style={{ marginTop: '12px' }}>
            <button onClick={() => { pendingImport.value = null; }}>Dismiss</button>
          </div>
        </>
      )}
    </>
  );
}

// Import modal content (see app.jsx). The staged import lives in the pendingImport signal, so
// closing and reopening the modal keeps it.
export function ImportPanel() {
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  // Mirrors the old app's drop-zone label/accept: both start generic and only narrow once the
  // user actually clicks a format pill (not derived reactively from selectedFormat — the initial
  // "eurobonus" pill is already marked active in the old app's static HTML without ever having
  // fired its own click handler).
  const [dropLabel, setDropLabel] = useState('Drop a file here, or click to choose');
  const [accept, setAccept] = useState('.xlsx,.csv');
  const [choices, setChoices] = useState({});

  function onFilePicked(file) {
    if (!file) return;
    setChoices({});
    handleFile(file);
  }

  return (
    <>
      <div class="format-row">
        {FORMATS.map(f => (
          <div
            key={f.key}
            class={'format-pill' + (selectedFormat.value === f.key ? ' active' : '')}
            onClick={() => {
              selectedFormat.value = f.key;
              setDropLabel(`Drop a ${f.ext} file here, or click to choose`);
              setAccept(f.ext);
            }}
          >
            {f.label}
          </div>
        ))}
      </div>
      <div
        class={'drop-zone' + (dragOver ? ' dragover' : '')}
        onClick={() => fileInputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) onFilePicked(e.dataTransfer.files[0]);
        }}
      >
        <input
          type="file" ref={fileInputRef} accept={accept}
          onChange={(e) => {
            if (e.currentTarget.files.length) onFilePicked(e.currentTarget.files[0]);
            e.currentTarget.value = '';
          }}
        />
        {busy.value?.kind === 'import'
          ? <div role="status"><Spinner /> {busy.value.message}</div>
          : <div>{dropLabel}</div>}
      </div>
      <div id="import-results">
        {pendingImport.value && <ImportResults pending={pendingImport.value} choices={choices} setChoices={setChoices} />}
      </div>
    </>
  );
}
