import { useState } from 'preact/hooks';

// Port of index.html's renderSortableTable() — reusable click-to-sort table. `columns` is
// [{ label, sortValue(row), render(row) -> node, align?, defaultDir? }]. Unlike the old DOM-
// building version (which had a `mount(td, row)` escape hatch for custom cell markup), `render`
// always returns JSX here, so a cell can be arbitrary markup (e.g. a <select>) with no separate
// code path.
export function SortableTable({ rows, columns, defaultSortIdx = 0, defaultSortDir = 'desc', rowKey }) {
  const [sortIdx, setSortIdx] = useState(defaultSortIdx);
  const [sortDir, setSortDir] = useState(defaultSortDir);

  const col = columns[sortIdx];
  const sorted = rows.slice().sort((a, b) => {
    const av = col.sortValue(a);
    const bv = col.sortValue(b);
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function onHeaderClick(idx) {
    if (idx === sortIdx) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortIdx(idx);
      setSortDir(columns[idx].defaultDir || 'desc');
    }
  }

  return (
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c.label} class="sortable" onClick={() => onHeaderClick(i)}>
                {c.label}
                {i === sortIdx && <span class="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={rowKey ? rowKey(row) : i}>
              {columns.map(c => (
                <td key={c.label} style={c.align ? { textAlign: c.align } : undefined}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
