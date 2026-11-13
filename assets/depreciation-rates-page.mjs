// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// The depreciation rates page: loads the effective life data, draws search results, the
// browse view and the deduction schedule. Search and arithmetic are in
// depreciation-rates.mjs, which Node tests. Every node is built with createElement and
// textContent, so the instrument's text is never parsed as markup.

import {
  below, flatten, formatCents, formatLife, lifeFromMonths, parseCents, parseLife, rates, schedule, search,
} from './depreciation-rates.mjs';
import { clearFieldError, reportFirstInvalid } from './field-errors.mjs';

/** @typedef {import('./depreciation-rates.mjs').Entry} Entry */
/** @typedef {import('./depreciation-rates.mjs').SourceSection} SourceSection */

const DATA_URL = '/tools/depreciation-rates/effective-life.json';
/** Rows drawn in a group of results before 'Show more' is needed. */
const SHOWN = 40;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December',
];
const COLUMNS = ['Asset', 'Effective life', 'Prime cost rate', 'Diminishing value rate', 'Last updated', 'Calculator'];

/** @template {HTMLElement} T @param {string} id @param {new () => T} kind @returns {T} */
function byId(id, kind) {
  const node = document.getElementById(id);
  if (!(node instanceof kind)) throw new Error(`#${id} is missing`);
  return node;
}

const finder = byId('finder', HTMLFormElement);
const queryInput = byId('asset-query', HTMLInputElement);
const industrySelect = byId('asset-industry', HTMLSelectElement);
const statusLine = byId('finder-status', HTMLElement);
const results = byId('finder-results', HTMLElement);
const browse = byId('browse-tables', HTMLElement);
const deduction = byId('deduction-form', HTMLFormElement);
const output = byId('deduction-output', HTMLOutputElement);
const costInput = byId('dep-cost', HTMLInputElement);
const lifeInput = byId('dep-life', HTMLInputElement);
const startInput = byId('dep-start', HTMLInputElement);
const yearInput = byId('dep-year', HTMLInputElement);
const methodSelect = byId('dep-method', HTMLSelectElement);

/** @type {Entry[]} */
let entries = [];

/**
 * @param {string} tag @param {Record<string, string>} [attributes]
 * @param {...(Node | string)} children
 */
function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

/** 'RETAIL TRADE' as 'Retail trade'. @param {string} heading */
const sentence = (heading) => heading.charAt(0) + heading.slice(1).toLowerCase();
/** @param {string} heading */
const slug = (heading) => heading.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
/** '2016-07-01' as '1 July 2016'. @param {string} iso */
function longDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}
/** @param {string} printed */
const years = (printed) => `${formatLife(printed)} ${printed === '1' ? 'year' : 'years'}`;
/** The income year that ends on 30 June of a year: 2026 is '2025-26'. @param {number} end */
const incomeYear = (end) => `${end - 1}-${String(end % 100).padStart(2, '0')}`;

/** Where a row sits: its table or industry, then the headings above it. @param {Entry} entry */
function place(entry) {
  const top = entry.table === 'B' ? ['Table B'] : [sentence(entry.division), entry.section];
  return [...top, ...entry.path].filter(Boolean).join(' › ');
}

/**
 * A table of lives in its scroll region. On a phone each row stacks as a block, so the
 * table roles are stated: a browser can drop them from cells that are not laid out as a
 * table.
 * @param {string} caption @param {Node[]} rows @returns {HTMLElement}
 */
function livesTable(caption, rows) {
  const head = el('tr', { role: 'row' }, ...COLUMNS.map((name, index) => {
    const cell = el('th', { scope: 'col', role: 'columnheader' });
    cell.append(index === COLUMNS.length - 1 ? el('span', { class: 'visually-hidden' }, name) : name);
    return cell;
  }));
  const table = el('table', { class: 'facts lives', role: 'table' }, el('caption', {}, caption),
    el('thead', { role: 'rowgroup' }, head), el('tbody', { role: 'rowgroup' }, ...rows));
  return el('div', { class: 'table-scroll', role: 'region', 'aria-label': caption, tabindex: '0' }, table);
}

/** A cell that names its column, for the stacked layout. @param {number} column
 * @param {...(Node | string)} children */
const cellOf = (column, ...children) => el('td', { role: 'cell', 'data-label': COLUMNS[column] }, ...children);

/**
 * One row of the tables. In search results a row names where it sits and a heading offers
 * its rows; in the browse view a row is indented under its headings instead.
 * @param {Entry} entry @param {{indentFrom?: number, placed?: boolean}} [options]
 */
function rowOf(entry, { indentFrom, placed = false } = {}) {
  const depth = indentFrom === undefined ? 0 : Math.min(entry.depth - indentFrom, 4);
  const name = el('th', { scope: 'row', role: 'rowheader', class: `depth-${depth}` }, entry.asset);
  if (placed) name.append(el('span', { class: 'asset-place' }, place(entry)));
  if (entry.capped) name.append(el('span', { class: 'asset-mark' }, 'Capped life available (section 40-102)'));
  const row = el('tr', entry.life === null ? { role: 'row', class: 'is-heading' } : { role: 'row' }, name);
  if (entry.life === null || entry.months === null) {
    const cell = el('td', { role: 'cell', colspan: String(COLUMNS.length - 1) });
    const under = placed && entry.heading ? below(entries, entry).length : 0;
    if (under) {
      const open = el('button', { type: 'button', class: 'link-button' }, `Show the ${under} rows under this heading`);
      open.addEventListener('click', () => drawUnder(entry));
      cell.append(open);
    }
    row.append(cell);
    return row;
  }
  const rate = rates(lifeFromMonths(entry.months));
  // The name starts with the words on the button and adds which life it is.
  const use = el('button', {
    type: 'button', class: 'link-button', 'aria-label': `Use this life: ${years(entry.life)}, ${entry.asset}`,
  }, 'Use this life');
  use.addEventListener('click', () => useLife(entry));
  row.append(
    cellOf(1, years(entry.life)),
    cellOf(2, rate.primeCost),
    cellOf(3, rate.diminishingValue),
    cellOf(4, entry.updated ? longDate(entry.updated) : ''),
    el('td', { role: 'cell' }, use),
  );
  return row;
}

/** A group of search results, drawn SHOWN rows at a time. @param {string} title @param {Entry[]} found */
function group(title, found) {
  const caption = `${title}: ${found.length} ${found.length === 1 ? 'row' : 'rows'}`;
  const table = livesTable(caption, []);
  const body = table.querySelector('tbody') ?? table;
  const more = el('button', { type: 'button', class: 'button button--secondary' });
  let shown = 0;
  const show = () => {
    const next = found.slice(shown, shown + SHOWN);
    body.append(...next.map((entry) => rowOf(entry, { placed: true })));
    shown += next.length;
    more.hidden = shown >= found.length;
    more.textContent = `Show ${Math.min(SHOWN, found.length - shown)} more of ${title}`;
  };
  more.addEventListener('click', show);
  show();
  return el('section', { class: 'lives-group' }, el('h3', {}, title), table, more);
}

/** The division the reader chose, or null. */
function chosenDivision() {
  const chosen = industrySelect.value;
  return chosen ? entries.find((entry) => entry.table === 'A' && slug(entry.division) === chosen)?.division ?? null : null;
}

function drawResults() {
  const query = queryInput.value.trim();
  const division = chosenDivision();
  results.replaceChildren();
  if (!query) {
    statusLine.textContent = entries.length ? `${entries.length.toLocaleString('en-AU')} rows to search.` : '';
    return;
  }
  const pool = division ? entries.filter((entry) => entry.table === 'B' || entry.division === division) : entries;
  const found = search(pool, query);
  const inA = found.filter((entry) => entry.table === 'A');
  const inB = found.filter((entry) => entry.table === 'B');
  const where = division ? ` in ${sentence(division)} and Table B` : '';
  statusLine.textContent = found.length
    ? `${found.length.toLocaleString('en-AU')} ${found.length === 1 ? 'row matches' : 'rows match'} ‘${query}’${where}.`
    : `No row matches ‘${query}’${where}. Try fewer or different words, or browse the tables below.`;
  const groupA = inA.length ? group(division ? `${sentence(division)} (Table A)` : 'Listed for an industry (Table A)', inA) : null;
  const groupB = inB.length ? group('Used across industries (Table B)', inB) : null;
  // Section 6 of the determination: the industry's own rows first, then Table B.
  for (const part of division ? [groupA, groupB] : [groupB, groupA]) if (part) results.append(part);
}

/** Replaces the results with a heading and the rows under it. @param {Entry} heading */
function drawUnder(heading) {
  const rows = [heading, ...below(entries, heading)];
  const title = el('h3', { tabindex: '-1' }, heading.asset.replace(/:$/, ''));
  const back = el('button', { type: 'button', class: 'button button--secondary' }, 'Back to the search results');
  back.addEventListener('click', () => {
    drawResults();
    queryInput.focus();
  });
  results.replaceChildren(el('section', { class: 'lives-group' }, title,
    el('p', { class: 'field-note' }, place(heading)),
    livesTable(`Rows under ${heading.asset.replace(/:$/, '')}`, rows.map((entry) => rowOf(entry, { indentFrom: heading.depth }))),
    back));
  title.focus();
}

/** Sends a row's life to the calculator. @param {Entry} entry */
function useLife(entry) {
  if (entry.life === null) return;
  lifeInput.value = entry.life;
  lifeInput.setCustomValidity('');
  clearFieldError(lifeInput);
  output.textContent = `Effective life of ${years(entry.life)} taken from ‘${entry.asset}’ (${place(entry)}). Enter the cost and dates, then work out the deduction.`;
  costInput.focus();
}

/** A closed `details` that draws its content the first time it opens.
 * @param {string} label @param {() => Node[]} content */
function lazyDetails(label, content) {
  const details = document.createElement('details');
  details.append(el('summary', {}, label));
  details.addEventListener('toggle', () => {
    if (details.open && details.childElementCount === 1) details.append(...content());
  });
  return details;
}

/**
 * The browse view: each industry of Table A, then each letter of Table B. Sections are in
 * the order of the entries, so each takes the next run of them.
 * @param {{table_a: {heading: string, anzsic: string, sections: SourceSection[]}[], table_b: SourceSection[]}} data
 */
function drawBrowse(data) {
  let at = 0;
  /** @param {SourceSection} section @param {string} label */
  const sectionOf = (section, label) => {
    const rows = entries.slice(at, at + section.rows.length);
    at += section.rows.length;
    return lazyDetails(`${label} (${rows.length} ${rows.length === 1 ? 'row' : 'rows'})`, () => [
      ...(section.note ? [el('p', { class: 'field-note' }, section.note)] : []),
      livesTable(label, rows.map((entry) => rowOf(entry, { indentFrom: 0 }))),
    ]);
  };
  const tableA = data.table_a.map((division) => {
    const sections = division.sections.map((section) => sectionOf(
      section,
      section.heading ? `${section.heading}${section.anzsic ? `, ANZSIC ${section.anzsic}` : ''}` : `${sentence(division.heading)}: assets generally`,
    ));
    const details = el('details', {}, el('summary', {}, `${sentence(division.heading)}, ANZSIC ${division.anzsic}`), ...sections);
    return details;
  });
  const tableB = data.table_b.map((section) => sectionOf(section, `Assets beginning with ${section.heading}`));
  browse.replaceChildren(
    el('h3', {}, 'Table A: industry categories'), ...tableA,
    el('h3', {}, 'Table B: asset categories'), ...tableB,
  );
}

/** Keeps the address in step with the search, so a result can be linked. */
function recordSearch() {
  const params = new URLSearchParams();
  if (queryInput.value.trim()) params.set('q', queryInput.value.trim());
  if (industrySelect.value) params.set('industry', industrySelect.value);
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
}

function drawSchedule() {
  const controls = [costInput, lifeInput, startInput, yearInput];
  for (const control of controls) {
    control.setCustomValidity('');
    clearFieldError(control);
  }
  if (!reportFirstInvalid(deduction)) return;
  /** @param {HTMLInputElement} control @param {unknown} error */
  const refuse = (control, error) => {
    control.setCustomValidity(error instanceof Error ? error.message : 'Check this value.');
    reportFirstInvalid(deduction);
  };
  let cost;
  let life;
  let lines;
  try {
    cost = parseCents(costInput.value);
  } catch (error) {
    return refuse(costInput, error);
  }
  try {
    life = parseLife(lifeInput.value);
  } catch (error) {
    return refuse(lifeInput, error);
  }
  const method = methodSelect.value === 'prime-cost' ? 'prime-cost' : 'diminishing-value';
  try {
    lines = schedule({ cost, life, start: startInput.value, yearEnd: Number(yearInput.value), method });
  } catch (error) {
    const about = error instanceof Error && error.message.includes('income year') ? yearInput : startInput;
    return refuse(about, error);
  }
  const rate = rates(life);
  const last = lines[lines.length - 1];
  const working = method === 'prime-cost'
    ? `Prime cost: cost × days held ÷ 365 × 100% ÷ ${formatLife(lifeInput.value.trim())} years (${rate.primeCost} a year), and no more than the value left.`
    : `Diminishing value: opening value × days held ÷ 365 × 200% ÷ ${formatLife(lifeInput.value.trim())} years (${rate.diminishingValue} a year).`;
  const head = el('tr', {}, ...['Income year', 'Days held', 'Opening value', 'Decline in value', 'Closing value']
    .map((name) => el('th', { scope: 'col' }, name)));
  const body = lines.map((line) => el('tr', {},
    el('th', { scope: 'row' }, incomeYear(line.yearEnd)),
    el('td', {}, String(line.days)),
    el('td', {}, formatCents(line.opening)),
    el('td', {}, formatCents(line.deduction)),
    el('td', {}, formatCents(line.closing))));
  const caption = `Decline in value by income year, ${method === 'prime-cost' ? 'prime cost' : 'diminishing value'}`;
  output.replaceChildren(
    el('div', { class: 'result-row' }, el('span', {}, `Decline in value for ${incomeYear(last.yearEnd)}`), el('strong', {}, formatCents(last.deduction))),
    el('div', { class: 'result-row' }, el('span', {}, `Value left at 30 June ${last.yearEnd}`), el('strong', {}, formatCents(last.closing))),
    el('p', { class: 'field-note' }, working),
    el('div', { class: 'table-scroll', role: 'region', 'aria-label': caption, tabindex: '0' },
      el('table', { class: 'facts facts--figures' }, el('caption', {}, caption), el('thead', {}, head), el('tbody', {}, ...body))),
  );
}

deduction.addEventListener('submit', (event) => {
  event.preventDefault();
  drawSchedule();
});
for (const control of [costInput, lifeInput, startInput, yearInput]) {
  control.addEventListener('input', () => {
    control.setCustomValidity('');
    clearFieldError(control);
  });
}
// The first income year an asset can have is the one its start date falls in.
startInput.addEventListener('change', () => {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(startInput.value);
  if (!match) return;
  const first = Number(match[1]) + (Number(match[2]) >= 7 ? 1 : 0);
  if (!yearInput.value || Number(yearInput.value) < first) yearInput.value = String(first);
});
deduction.querySelector('fieldset')?.removeAttribute('disabled');

finder.addEventListener('submit', (event) => {
  event.preventDefault();
  drawResults();
  recordSearch();
});
let waiting = 0;
queryInput.addEventListener('input', () => {
  clearTimeout(waiting);
  waiting = setTimeout(() => {
    drawResults();
    recordSearch();
  }, 150);
});
industrySelect.addEventListener('change', () => {
  drawResults();
  recordSearch();
});

statusLine.textContent = 'Loading the effective life tables.';
try {
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  entries = flatten(data);
  for (const division of data.table_a) {
    industrySelect.append(el('option', { value: slug(division.heading) }, sentence(division.heading)));
  }
  const asked = new URLSearchParams(location.search);
  queryInput.value = (asked.get('q') ?? '').slice(0, 100);
  const industry = asked.get('industry') ?? '';
  if ([...industrySelect.options].some((option) => option.value === industry)) industrySelect.value = industry;
  drawBrowse(data);
  drawResults();
} catch {
  statusLine.textContent = 'The effective life tables could not be loaded. Reload the page, or open the data file linked under Source.';
}
