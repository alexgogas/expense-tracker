// Verbatim port from index.html — pure month-label helpers, no state.

export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthLabel(dateStr) {
  const [y, m] = dateStr.split('-');
  return MONTH_ABBR[parseInt(m, 10) - 1] + '-' + y.slice(2);
}

export function todayMonthLabel() {
  return monthLabel(new Date().toISOString().slice(0, 10));
}

// Chronological sort key for a "Mon-YY" label, *100-per-year so it doesn't need a transaction to
// derive order from (unlike sortedMonthList's monthOrder, which needs real data).
export function monthSortKey(label) {
  const [abbr, yy] = label.split('-');
  return parseInt(yy, 10) * 100 + MONTH_ABBR.indexOf(abbr);
}

// Number of calendar months from `fromLabel` to `toLabel` (positive if `to` is later) — safe to
// use in month arithmetic, unlike monthSortKey (a valid ordering key, but *100-per-year so its
// numeric difference isn't a month count once a year boundary is crossed).
export function monthsElapsed(fromLabel, toLabel) {
  const [fAbbr, fYY] = fromLabel.split('-');
  const [tAbbr, tYY] = toLabel.split('-');
  return (parseInt(tYY, 10) * 12 + MONTH_ABBR.indexOf(tAbbr)) - (parseInt(fYY, 10) * 12 + MONTH_ABBR.indexOf(fAbbr));
}

// Shifts a "Mon-YY" label by n calendar months (either direction) — used to generate future
// months for the Net Worth chart's projection and its default From/To window.
export function addMonthsToLabel(label, n) {
  const [abbr, yy] = label.split('-');
  let monthIdx = MONTH_ABBR.indexOf(abbr) + n;
  let year = parseInt(yy, 10) + Math.floor(monthIdx / 12);
  monthIdx = ((monthIdx % 12) + 12) % 12;
  return MONTH_ABBR[monthIdx] + '-' + String(year).padStart(2, '0');
}

// The "Mon-YY" label for the calendar month right after the given one.
export function nextMonthLabel(label) {
  return addMonthsToLabel(label, 1);
}
