import { notes } from '../state.js';
import { markUnsaved } from '../persistence.js';

// Side-panel content (see app.jsx). Notes sync to Drive with the rest of the settings.
export function NotesPanel() {
  return (
    <>
      <p class="panel-hint">
        Free-form notes, saved to your Drive folder with everything else — they'll be here next time
        you sign in, on any device.
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
    </>
  );
}
