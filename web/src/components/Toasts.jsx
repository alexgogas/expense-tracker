import { toasts } from '../lib/ui.js';

export function Toasts() {
  return (
    <>
      {toasts.value.map(t => (
        <div key={t.id} class={'toast' + (t.type ? ' ' + t.type : '')}>{t.msg}</div>
      ))}
    </>
  );
}
