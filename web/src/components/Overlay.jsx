import { useEffect, useRef } from 'preact/hooks';
import { CloseIcon } from './Icons.jsx';

// Escape closes (unless `locked`, e.g. while a save is in flight), and focus moves into the
// dialog on open so keyboard users land inside it.
function useDismiss(onClose, locked) {
  const ref = useRef(null);
  const latest = useRef({ onClose, locked });
  latest.current = { onClose, locked };
  // Mount-only: re-running on every render (onClose is usually a fresh arrow) would steal focus
  // back from whatever input the user is typing in.
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !latest.current.locked) latest.current.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return ref;
}

function Header({ title, onClose, locked }) {
  return (
    <div class="overlay-header">
      <h2>{title}</h2>
      <button class="icon-btn" onClick={onClose} disabled={locked} aria-label="Close" title="Close"><CloseIcon /></button>
    </div>
  );
}

// Centered dialog over a dimmed backdrop; clicking the backdrop closes it.
export function Modal({ title, onClose, locked, children }) {
  const ref = useDismiss(onClose, locked);
  return (
    <div class="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !locked) onClose(); }}>
      <div class="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <Header title={title} onClose={onClose} locked={locked} />
        {children}
      </div>
    </div>
  );
}

// Right-hand panel with no backdrop, so the dashboard stays visible and usable beside it.
export function SidePanel({ title, onClose, children }) {
  const ref = useDismiss(onClose, false);
  return (
    <aside class="side-panel" role="dialog" aria-label={title} tabIndex={-1} ref={ref}>
      <Header title={title} onClose={onClose} />
      {children}
    </aside>
  );
}
