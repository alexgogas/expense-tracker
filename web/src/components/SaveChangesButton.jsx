import { saveAllChanges } from '../persistence.js';
import { busy } from '../lib/ui.js';

// "Save to Drive" for staged changes. The click is stopped from bubbling so the button can sit
// inside a collapsible card's <summary> without toggling the card.
export function SaveChangesButton() {
  const saving = busy.value?.kind === 'save';
  return (
    <button class="primary btn-sm" disabled={saving}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); saveAllChanges(); }}>
      {saving ? 'Saving…' : 'Save to Drive'}
    </button>
  );
}
