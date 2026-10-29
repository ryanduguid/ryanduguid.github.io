// Marks the row of each rate table in force today and adds a Copy for Excel
// control under each table. Pages work unchanged without JavaScript.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
// A dated period: '1 July 2024 to 30 June 2025' or '1 July 2025 onwards'.
const PERIOD = /^(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})(?: to (\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})| onwards)$/;
const pad = (number) => String(number).padStart(2, '0');
const isoDate = (day, month, year) => `${year}-${pad(MONTHS.indexOf(month) + 1)}-${pad(Number(day))}`;

/**
 * Returns the first and last ISO dates a rate table row header covers, or null
 * for a header in no known form. The forms are an income year (2026-27), an
 * FBT year by its end date (31 March 2027) and a dated period (1 July 2024 to
 * 30 June 2025, or 1 July 2025 onwards).
 * @param {string} label
 * @returns {[string, string] | null}
 */
export function periodOf(label) {
  const text = label.replace(/\s+/g, ' ').trim();
  let match = /^(\d{4})-(\d{2})$/.exec(text);
  if (match) {
    const year = Number(match[1]);
    if ((year + 1) % 100 !== Number(match[2])) return null;
    return [`${year}-07-01`, `${year + 1}-06-30`];
  }
  match = /^31 March (\d{4})$/.exec(text);
  if (match) return [`${Number(match[1]) - 1}-04-01`, `${match[1]}-03-31`];
  match = PERIOD.exec(text);
  if (!match) return null;
  return [isoDate(match[1], match[2], match[3]), match[4] ? isoDate(match[4], match[5], match[6]) : '9999-12-31'];
}

/**
 * Today's ISO date in Canberra time, whatever the reader's own time zone.
 * shortcut: one Australian time zone for every reader; a Perth reader sees a
 * 1 July change from 10 pm on 30 June local time.
 * @param {Date} [now]
 */
export function australianToday(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Tab-separated text of a table's rows, which Excel pastes one value per cell.
 * @param {string[][]} rows
 */
export function toTabSeparated(rows) {
  return rows.map((cells) => cells.map((cell) => cell.replace(/\s+/g, ' ').trim()).join('\t')).join('\n');
}

if (typeof document !== 'undefined') {
  const today = australianToday();
  for (const table of document.querySelectorAll('table.rate-figures')) {
    for (const header of table.querySelectorAll('tbody th[scope="row"]')) {
      const period = periodOf(header.textContent ?? '');
      if (period && period[0] <= today && today <= period[1]) {
        const label = document.createElement('span');
        label.className = 'rate-current';
        label.textContent = 'In force today';
        header.append(' ', label);
        break;
      }
    }

    const region = table.closest('.table-scroll');
    if (!region || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') continue;
    const wrap = document.createElement('div');
    wrap.className = 'copy-wrap';
    region.before(wrap);
    wrap.append(region);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-button';
    button.textContent = 'Copy for Excel';
    const tableLabel = region.getAttribute('aria-label');
    if (tableLabel) button.setAttribute('aria-label', 'Copy for Excel: ' + tableLabel.toLowerCase());
    const status = document.createElement('p');
    status.className = 'copy-status';
    status.setAttribute('role', 'status');
    let pending = false;
    button.addEventListener('click', async () => {
      if (pending) return;
      pending = true;
      button.setAttribute('aria-disabled', 'true');
      status.textContent = 'Copying table...';
      const rows = [...table.rows].map((row) => [...row.cells].map((cell) => {
        const copy = /** @type {HTMLElement} */ (cell.cloneNode(true));
        copy.querySelector('.rate-current')?.remove();
        return copy.textContent ?? '';
      }));
      try {
        await navigator.clipboard.writeText(toTabSeparated(rows));
        status.textContent = 'Copied. Paste into Excel to fill one cell per value.';
      } catch {
        status.textContent = 'Copy unavailable. Download the CSV below instead.';
      } finally {
        pending = false;
        button.removeAttribute('aria-disabled');
      }
    });
    wrap.append(button, status);
  }
}
