// Port of index.html's Google sign-in + Picker flow. DOM-visibility toggling (classList.add/remove
// 'hidden', textContent writes) is replaced with signals the App component reads to decide what to
// render — same underlying flow, reactive instead of imperative.

import { signal } from '@preact/signals';
import { CLIENT_ID, SCOPES, API_KEY, APP_ID, DRIVE_FOLDER_NAME, FOLDER_STORAGE_KEY, REQUIRED_FILES, accessToken, folderId } from './state.js';
import { showToast } from './lib/ui.js';
import { loadAllData } from './persistence.js';

// Plain (non-signal) module state: neither is ever read reactively by a component, only checked
// imperatively inside click handlers — a signal would add nothing here.
let tokenClient = null;
let pickerLoaded = false;

// Reactive UI state for the sign-in gate/header, read by app.jsx.
export const signedIn = signal(false);
export const userProfile = signal(null); // { name, picture } | null
export const headerSub = signal('Not connected');
export const hasStoredFolder = signal(false);
export const showNoFolderMsg = signal(false);

export function initAuth() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: async (resp) => {
      if (resp.error) {
        showToast('Sign-in failed: ' + resp.error, 'error');
        return;
      }
      accessToken.value = resp.access_token;
      await onSignedIn();
    },
    // Non-OAuth failures (the popup itself couldn't open, or the user closed it) land here
    // instead of the callback above — without this they fail silently with no feedback.
    error_callback: (err) => {
      showToast('Sign-in failed: ' + ((err && (err.type || err.message)) || 'popup was blocked or closed'), 'error');
    }
  });
  gapi.load('picker', () => { pickerLoaded = true; });
}

export function requestSignIn() {
  tokenClient.requestAccessToken();
}

export function signOut() {
  if (accessToken.value) {
    google.accounts.oauth2.revoke(accessToken.value, () => {});
  }
  accessToken.value = null;
  signedIn.value = false;
  userProfile.value = null;
  hasStoredFolder.value = false;
  showNoFolderMsg.value = false;
  headerSub.value = 'Not connected';
}

async function fetchUserProfile() {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: 'Bearer ' + accessToken.value }
  });
  if (!res.ok) return null;
  return res.json();
}

async function onSignedIn() {
  signedIn.value = true;
  headerSub.value = 'Signed in';

  try {
    const profile = await fetchUserProfile();
    if (profile) userProfile.value = { name: profile.name || profile.email || '', picture: profile.picture || '' };
  } catch (e) { /* non-fatal */ }

  // This app only ever sees the one Drive folder you explicitly select below.
  // It cannot browse, list, or read anything else in your Drive.
  const storedFolderId = localStorage.getItem(FOLDER_STORAGE_KEY);
  if (storedFolderId) {
    folderId.value = storedFolderId;
    hasStoredFolder.value = true;
    await loadAllData();
  } else {
    hasStoredFolder.value = false;
    showNoFolderMsg.value = true;
  }
}

export function openFolderPicker() {
  if (!pickerLoaded) {
    showToast('Picker still loading, try again in a second.', 'error');
    return;
  }
  const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
    .setSelectFolderEnabled(true)
    .setIncludeFolders(true)
    .setMimeTypes('application/vnd.google-apps.folder');

  const picker = new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(accessToken.value)
    .setDeveloperKey(API_KEY)
    .setAppId(APP_ID)
    .setTitle('Select your ' + DRIVE_FOLDER_NAME + ' folder')
    .setCallback(onFolderPicked)
    .build();
  picker.setVisible(true);
}

async function onFolderPicked(data) {
  if (data.action !== google.picker.Action.PICKED) return;
  const doc = data.docs[0];
  folderId.value = doc.id;
  localStorage.setItem(FOLDER_STORAGE_KEY, folderId.value);
  hasStoredFolder.value = true;
  headerSub.value = 'Connected to "' + doc.name + '"';
  showNoFolderMsg.value = false;
  await loadAllData();
  // Picking the folder only grants read access to its contents (drive.file scope) — writing
  // to the 4 pre-existing files inside it needs each one individually authorized, so prompt
  // for that as the next step of connecting.
  showToast('Now select the 4 data files in that folder to grant write access.', 'success');
  openFileAccessPicker();
}

export function openFileAccessPicker() {
  if (!pickerLoaded) {
    showToast('Picker still loading, try again in a second.', 'error');
    return;
  }
  if (!folderId.value) {
    showToast('Connect a Drive folder first.', 'error');
    return;
  }
  const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
    .setParent(folderId.value)
    .setIncludeFolders(false)
    .setSelectFolderEnabled(false)
    .setMode(google.picker.DocsViewMode.LIST);

  const picker = new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(accessToken.value)
    .setDeveloperKey(API_KEY)
    .setAppId(APP_ID)
    .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
    .setTitle('Select all 4 data files to grant write access (cmd/ctrl-click for multiple)')
    .setCallback(onFileAccessPicked)
    .build();
  picker.setVisible(true);
}

function onFileAccessPicked(data) {
  if (data.action !== google.picker.Action.PICKED) return;
  const pickedNames = data.docs.map(d => d.name);
  const missing = REQUIRED_FILES.filter(name => !pickedNames.includes(name));
  if (missing.length) {
    showToast(`Granted write access to ${data.docs.length} file(s), but still missing: ${missing.join(', ')}. Click "Grant file access" again and select those too.`, 'error');
  } else {
    showToast('Granted write access to all data files — you can now save imports.', 'success');
  }
}
