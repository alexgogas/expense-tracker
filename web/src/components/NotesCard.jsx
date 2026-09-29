import { notes } from '../state.js';
import { markUnsaved } from '../persistence.js';

export function NotesCard() {
  return (
    <details class="card">
      <summary><h2>Notes</h2></summary>
      <p style={{ color: 'var(--text-dim)', fontSize: '13px', margin: '0 0 14px' }}>
        Free-form notes, synced to the same Drive folder as everything else — jot down
        anything about your finances here and it'll be there next time you sign in, on any device.
      </p>
      <textarea
        id="notes-textarea"
        placeholder="e.g. planned upcoming expenses, reminders, context for a budget decision…"
        value={notes.value}
        onInput={(e) => {
          notes.value = e.currentTarget.value;
          markUnsaved();
        }}
      />
    </details>
  );
}
