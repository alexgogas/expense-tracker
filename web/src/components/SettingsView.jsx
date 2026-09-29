import { settingsTab, view } from '../lib/ui.js';
import { openFolderPicker, openFileAccessPicker } from '../auth.js';
import { CategoriesSettings } from './CategoriesSettings.jsx';
import { BudgetSettings } from './BudgetSettings.jsx';
import { ProjectionSettings } from './ProjectionSettings.jsx';
import { BankReferencesSettings } from './BankReferencesSettings.jsx';

function DriveSettings() {
  return (
    <>
      <p class="panel-hint">
        This app only sees the one Drive folder you pick and the files in it — nothing else in your
        Drive. Picking the folder grants read access; writing to the 4 data files that were already
        in it needs each one granted once too.
      </p>
      <div class="format-row">
        <button onClick={openFolderPicker}>Change Drive folder</button>
        <button onClick={openFileAccessPicker}>Grant file access</button>
      </div>
    </>
  );
}

const TABS = [
  { key: 'categories', label: 'Categories & rules', Content: CategoriesSettings },
  { key: 'budgets', label: 'Budgets', Content: BudgetSettings },
  { key: 'projections', label: 'Projections', Content: ProjectionSettings },
  { key: 'references', label: 'Bank references', Content: BankReferencesSettings },
  { key: 'drive', label: 'Drive', Content: DriveSettings },
];

// Everything configuration-like, out of the dashboard. Edits are staged like everywhere else and
// saved with "Save to Drive".
export function SettingsView() {
  const active = TABS.find(t => t.key === settingsTab.value) || TABS[0];
  return (
    <section class="card">
      <div class="settings-top">
        <button class="btn-sm" onClick={() => { view.value = 'dashboard'; }}>← Dashboard</button>
        <h2 style={{ margin: 0 }}>Settings</h2>
      </div>
      <div class="format-row" role="tablist">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={t.key === active.key}
            class={'format-pill' + (t.key === active.key ? ' active' : '')}
            onClick={() => { settingsTab.value = t.key; }}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel"><active.Content /></div>
    </section>
  );
}
