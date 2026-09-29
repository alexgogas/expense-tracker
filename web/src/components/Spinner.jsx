export function Spinner({ large }) {
  return <span class={'spinner' + (large ? ' large' : '')} aria-hidden="true" />;
}
