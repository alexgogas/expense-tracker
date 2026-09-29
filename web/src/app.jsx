import { useEffect } from 'preact/hooks';
import {
  initAuth, requestSignIn, signOut, openFolderPicker,
  signedIn, userProfile, headerSub, hasStoredFolder, showNoFolderMsg
} from './auth.js';
import { unsavedChanges, pendingImport } from './state.js';
import { SaveChangesButton } from './components/SaveChangesButton.jsx';
import { busy, statusLine, view, panel, importOpen } from './lib/ui.js';
import { Toasts } from './components/Toasts.jsx';
import { Spinner } from './components/Spinner.jsx';
import { Modal, SidePanel } from './components/Overlay.jsx';
import { UploadIcon, NotesIcon, SparkIcon, GearIcon } from './components/Icons.jsx';
import { OverviewCard } from './components/OverviewCard.jsx';
import { SavingsCard } from './components/SavingsCard.jsx';
import { NetWorthCard } from './components/NetWorthCard.jsx';
import { TransactionsCard } from './components/TransactionsCard.jsx';
import { SettingsView } from './components/SettingsView.jsx';
import { ImportPanel } from './components/ImportPanel.jsx';
import { NotesPanel } from './components/NotesPanel.jsx';
import { InsightsPanel } from './components/InsightsPanel.jsx';

const PANELS = {
  notes: { title: 'Notes', Content: NotesPanel },
  insights: { title: 'AI Insights', Content: InsightsPanel },
};

function togglePanel(name) {
  panel.value = panel.value === name ? null : name;
}

// Icon buttons in the header once a Drive folder is connected: Import (modal), Notes and AI
// Insights (side panel), Settings (a separate view instead of the dashboard).
function Toolbar() {
  return (
    <>
      <button class="icon-btn" onClick={() => { importOpen.value = true; }} aria-label="Import transactions" title="Import transactions">
        <UploadIcon />
        {pendingImport.value && <span class="icon-badge" aria-label="An import is waiting to be saved" />}
      </button>
      <button class={'icon-btn' + (panel.value === 'notes' ? ' active' : '')} onClick={() => togglePanel('notes')} aria-label="Notes" title="Notes" aria-pressed={panel.value === 'notes'}>
        <NotesIcon />
      </button>
      <button class={'icon-btn' + (panel.value === 'insights' ? ' active' : '')} onClick={() => togglePanel('insights')} aria-label="AI Insights" title="AI Insights" aria-pressed={panel.value === 'insights'}>
        <SparkIcon />
      </button>
      <button class={'icon-btn' + (view.value === 'settings' ? ' active' : '')}
        onClick={() => { view.value = view.value === 'settings' ? 'dashboard' : 'settings'; }}
        aria-label="Settings" title="Settings" aria-pressed={view.value === 'settings'}>
        <GearIcon />
      </button>
    </>
  );
}

export function App() {
  useEffect(() => {
    initAuth();
    const onBeforeUnload = (e) => {
      if (unsavedChanges.value) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // The sticky header's height (it wraps on narrow screens) as --header-h, so side panels and the
  // saving indicator sit just below it and the toolbar stays reachable while a panel is open.
  useEffect(() => {
    const header = document.querySelector('header');
    const observer = new ResizeObserver(() => document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px'));
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // Switching between the dashboard and Settings starts the new view at the top.
  useEffect(() => { window.scrollTo(0, 0); }, [view.value]);

  const ready = signedIn.value && hasStoredFolder.value;
  const openPanel = ready && panel.value && PANELS[panel.value];
  const saving = busy.value?.kind === 'save';

  return (
    <>
      <header>
        <div>
          <h1>Expense Tracker</h1>
          <div class="sub">{headerSub.value}</div>
        </div>
        <div id="signin-area">
          {ready && <Toolbar />}
          {userProfile.value && (
            <div id="user-chip" style={{ display: 'flex' }}>
              <img id="user-avatar" src={userProfile.value.picture} alt="" />
              <span id="user-name">{userProfile.value.name}</span>
            </div>
          )}
          {signedIn.value && !hasStoredFolder.value && <button onClick={openFolderPicker}>Connect Drive folder</button>}
          {!signedIn.value && <button class="primary" onClick={requestSignIn}>Sign in with Google</button>}
          {signedIn.value && <button onClick={signOut}>Sign out</button>}
        </div>
      </header>

      <main class={openPanel ? 'with-panel' : ''}>
        {!signedIn.value && (
          <div id="signed-out-msg">
            <h2>Sign in to load your data</h2>
            <p>Connect your Google account to read and update your expense data stored in Drive.</p>
          </div>
        )}

        {signedIn.value && showNoFolderMsg.value && (
          <div id="no-folder-msg">
            <h2>Connect your Drive folder</h2>
            <p>Click "Connect Drive folder" above and select your Expense Tracker App folder.<br />
              This app only ever sees the contents of the folder you pick — nothing else in your Drive.</p>
          </div>
        )}

        {ready && busy.value?.kind === 'load' && (
          <div id="loading-panel" role="status">
            <Spinner large />
            <div>{statusLine.value || 'Loading your data…'}</div>
          </div>
        )}

        {ready && busy.value?.kind !== 'load' && (
          <div id="app-content">
            {/* On the dashboard, Save lives in the Transactions card's header instead. */}
            {unsavedChanges.value && view.value === 'settings' && (
              <div id="unsaved-changes-bar">
                <span id="unsaved-changes-label">You have unsaved changes. Reload the page to discard them.</span>
                <SaveChangesButton />
              </div>
            )}
            {view.value === 'settings' ? <SettingsView /> : (
              <>
                <OverviewCard />
                <SavingsCard />
                <NetWorthCard />
                <TransactionsCard />
              </>
            )}
          </div>
        )}
      </main>

      {openPanel && (
        <SidePanel title={openPanel.title} onClose={() => { panel.value = null; }}>
          <openPanel.Content />
        </SidePanel>
      )}
      {ready && importOpen.value && (
        <Modal title="Import transactions" onClose={() => { importOpen.value = false; }} locked={saving || busy.value?.kind === 'import'}>
          <ImportPanel />
        </Modal>
      )}
      {saving && <div id="busy-pill" role="status"><Spinner /> {busy.value.message}</div>}
      <Toasts />
    </>
  );
}
