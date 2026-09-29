import { signal } from '@preact/signals';

// Verbatim port from index.html, except statusLine is now a signal (rendered by app.jsx's
// #status-line element) instead of a direct DOM write, and showToast renders via a signal-backed
// list a <Toasts/> component owns, instead of manually creating/removing DOM nodes.

// What the user is waiting on, or null: { kind: 'load' } while loadAllData() runs (app.jsx shows
// a loading panel instead of the cards), { kind: 'save', message } during a Drive write (a
// floating indicator, save buttons disabled), { kind: 'import', message } while an import file is
// read/parsed (spinner in the Import modal).
export const busy = signal(null);

// Layout: which main view is showing, which side panel (if any) is open, and whether the Import
// modal is open. UI-only, never persisted.
export const view = signal('dashboard'); // 'dashboard' | 'settings'
export const settingsTab = signal('categories'); // see SettingsView.jsx's TABS
export const panel = signal(null);       // null | 'notes' | 'insights'
export const importOpen = signal(false);

export const statusLine = signal('');
export function setStatus(msg) {
  statusLine.value = msg;
}

let nextToastId = 1;
export const toasts = signal([]); // [{ id, msg, type }]
export function showToast(msg, type) {
  const id = nextToastId++;
  toasts.value = [...toasts.value, { id, msg, type }];
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, 4500);
}
