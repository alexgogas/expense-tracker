import { useEffect } from 'preact/hooks';
import {
  initAuth, requestSignIn, signOut, openFolderPicker, openFileAccessPicker,
  signedIn, userProfile, headerSub, hasStoredFolder, showNoFolderMsg
} from './auth.js';
import { saveAllChanges } from './persistence.js';
import { unsavedChanges } from './state.js';
import { Toasts } from './components/Toasts.jsx';
import { OverviewCard } from './components/OverviewCard.jsx';
import { NotesCard } from './components/NotesCard.jsx';
import { TransactionsCard } from './components/TransactionsCard.jsx';
import { BudgetsCard } from './components/BudgetsCard.jsx';
import { SavingsCard } from './components/SavingsCard.jsx';
import { NetWorthCard } from './components/NetWorthCard.jsx';
import { InsightsCard } from './components/InsightsCard.jsx';
import { CategoriesCard } from './components/CategoriesCard.jsx';
import { ImportCard } from './components/ImportCard.jsx';

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

  return (
    <>
      <header>
        <div>
          <h1>Expense Tracker</h1>
          <div class="sub">{headerSub.value}</div>
        </div>
        <div id="signin-area">
          {userProfile.value && (
            <div id="user-chip" style={{ display: 'flex' }}>
              <img id="user-avatar" src={userProfile.value.picture} alt="" />
              <span id="user-name">{userProfile.value.name}</span>
            </div>
          )}
          {signedIn.value && (
            <button onClick={openFolderPicker}>{hasStoredFolder.value ? 'Change Drive folder' : 'Connect Drive folder'}</button>
          )}
          {signedIn.value && hasStoredFolder.value && (
            <button onClick={openFileAccessPicker} title='Grants this app write access to the 4 data files themselves — needed once, since selecting a folder only grants read access to its contents.'>Grant file access</button>
          )}
          {!signedIn.value && <button class="primary" onClick={requestSignIn}>Sign in with Google</button>}
          {signedIn.value && <button onClick={signOut}>Sign out</button>}
        </div>
      </header>

      <main>
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

        {signedIn.value && hasStoredFolder.value && (
          <div id="app-content">
            {unsavedChanges.value && (
              <div id="unsaved-changes-bar">
                <span id="unsaved-changes-label">You have unsaved changes. Reload the page to discard them.</span>
                <button class="primary btn-sm" onClick={saveAllChanges}>Save to Drive</button>
              </div>
            )}
            <OverviewCard />
            <NotesCard />
            <TransactionsCard />
            <BudgetsCard />
            <SavingsCard />
            <NetWorthCard />
            <InsightsCard />
            <CategoriesCard />
            <ImportCard />
            {/* Every card is now migrated — order matches the old app's own Overview/Notes/
                Transactions/Budgets/Savings/Net Worth/AI Insights/Categories/Import layout. */}
          </div>
        )}
      </main>

      <Toasts />
    </>
  );
}
