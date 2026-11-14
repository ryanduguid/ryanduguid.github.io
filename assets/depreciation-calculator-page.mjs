// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// The depreciation rates page's calculator: reads the form, draws the result and the yearly
// schedule, and offers the schedule as a link, a citation, a CSV and a printout. The
// arithmetic is in depreciation-rates.mjs and the text in depreciation-working.mjs, which
// Node tests. Every node is built with createElement and textContent.

import { formatCents, parseCents, parseLife, parseUse, rates, schedule } from './depreciation-rates.mjs';
import {
  INSTRUMENTS, METHOD_NAMES, calculationQuery, citation, commencedNote, formatUse, incomeYear, longDate, place,
  readCalculation, scheduleColumns, scheduleCsv, years,
} from './depreciation-working.mjs';
import { clearFieldError, reportFirstInvalid } from './field-errors.mjs';

/** @typedef {import('./depreciation-rates.mjs').Entry} Entry */
/** @typedef {import('./depreciation-working.mjs').Run} Run */
/** @typedef {import('./depreciation-working.mjs').Source} Source */

/** The page's element with an id, of the kind expected. Shared with the finder script.
 * @template {HTMLElement} T @param {string} id @param {new () => T} kind @returns {T} */
export function byId(id, kind) {
  const node = document.getElementById(id);
  if (!(node instanceof kind)) throw new Error(`#${id} is missing`);
  return node;
}

const form = byId('deduction-form', HTMLFormElement);
const output = byId('deduction-output', HTMLOutputElement);
// The yearly table and its actions sit outside the live region, which announces the result alone.
const scheduleBox = byId('deduction-schedule', HTMLDivElement);
const inputs = {
  cost: byId('dep-cost', HTMLInputElement),
  life: byId('dep-life', HTMLInputElement),
  start: byId('dep-start', HTMLInputElement),
  year: byId('dep-year', HTMLInputElement),
  use: byId('dep-use', HTMLInputElement),
};
const methodSelect = byId('dep-method', HTMLSelectElement);
const READY = 'Enter the inputs and work out the deduction.';
/** The schedules each choice of method draws. */
const METHOD_RUNS = /** @type {const} */ ({
  both: ['prime-cost', 'diminishing-value'], 'prime-cost': ['prime-cost'], 'diminishing-value': ['diminishing-value'],
});

/** The row whose life was last sent to the calculator. @type {Entry | null} */
let chosen = null;
/** The data file's source block, once the tables arrive. @type {Source | null} */
let source = null;

/**
 * A new element with its attributes and children. Shared with the finder script.
 * @param {string} tag @param {Record<string, string>} [attributes]
 * @param {...(Node | string)} children
 */
export function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

/** @param {Source} found */
export function setSource(found) {
  source = found;
}

/** Sends a row's life to the calculator. @param {Entry} entry */
export function useLife(entry) {
  if (entry.life === null) return;
  chosen = entry;
  inputs.life.value = entry.life;
  inputs.life.setCustomValidity('');
  clearFieldError(inputs.life);
  scheduleBox.replaceChildren();
  output.textContent = `Effective life of ${years(entry.life)} taken from ‘${entry.asset}’ (${place(entry)}). Enter the cost and dates, then work out the deduction.`;
  inputs.cost.focus();
}

/** The chosen row, while the life field still holds its life. */
const chosenRow = () => (chosen && inputs.life.value.trim() === chosen.life ? chosen : null);

/** The schedule's columns as a table in its scrollable region. @param {Run[]} runs @param {bigint} use */
function scheduleTable(runs, use) {
  const columns = scheduleColumns(runs, use);
  const name = runs.length > 1 ? 'both methods' : METHOD_NAMES[runs[0].method].toLowerCase();
  const caption = `Decline in value by income year, ${name}`;
  const head = el('tr', {}, ...columns.map((column) => el('th', { scope: 'col' }, column.heading)));
  const body = columns[0].values.map((_, index) => el('tr', {}, ...columns.map((column, at) => {
    const value = column.values[index];
    const text = typeof value === 'bigint' ? formatCents(value) : value;
    return at === 0 ? el('th', { scope: 'row' }, text) : el('td', {}, text);
  })));
  return el('div', { class: 'table-scroll', role: 'region', 'aria-label': caption, tabindex: '0' },
    el('table', { class: 'facts facts--figures' }, el('caption', {}, caption), el('thead', {}, head), el('tbody', {}, ...body)));
}

/** The result rows and the working for each method. @param {Run[]} runs @param {bigint} use @param {string} life */
function resultRows(runs, use, life) {
  const rate = rates(parseLife(life));
  return runs.flatMap(({ method, lines }) => {
    const last = lines[lines.length - 1];
    /** @param {string} name */
    const label = (name) => (runs.length > 1 ? `${METHOD_NAMES[method]}: ${name.charAt(0).toLowerCase()}${name.slice(1)}` : name);
    const row = (/** @type {string} */ name, /** @type {bigint} */ value) =>
      el('div', { class: 'result-row' }, el('span', {}, label(name)), el('strong', {}, formatCents(value)));
    const working = method === 'prime-cost'
      ? `Prime cost: cost × days held ÷ 365 × 100% ÷ ${life} years (${rate.primeCost} a year), and no more than the value left.`
      : `Diminishing value: opening value × days held ÷ 365 × 200% ÷ ${life} years (${rate.diminishingValue} a year).`;
    return [
      row(`Decline in value for ${incomeYear(last.yearEnd)}`, last.decline),
      ...(use < 10_000n ? [row(`Deduction at ${formatUse(use)}% taxable use`, last.deduction)] : []),
      row(`Value left at 30 June ${last.yearEnd}`, last.closing),
      el('p', { class: 'field-note' }, working),
    ];
  });
}

/** Saves text as a file. @param {string} text @param {string} name @param {string} type */
function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  el('a', { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * A button that copies text and says whether it did. It shows that it is copying and takes no
 * second press until the clipboard answers, as the site's other copy controls do.
 * @param {string} label @param {string} text @param {HTMLElement} status
 * @param {{done: string, failed: string}} messages
 */
function copyButton(label, text, status, { done, failed }) {
  const button = el('button', { type: 'button', class: 'button button--secondary' }, label);
  let pending = false;
  button.addEventListener('click', async () => {
    if (pending) return;
    pending = true;
    button.setAttribute('aria-disabled', 'true');
    status.textContent = 'Copying...';
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = done;
    } catch {
      status.textContent = failed;
    } finally {
      pending = false;
      button.removeAttribute('aria-disabled');
    }
  });
  return button;
}

/** Prints the schedule alone: the page's other sections are hidden until printing ends. */
function printSchedule() {
  document.body.classList.add('print-schedule');
  window.addEventListener('afterprint', () => document.body.classList.remove('print-schedule'), { once: true });
  window.print();
}

/**
 * The link, citation, CSV and print controls for a drawn schedule.
 * @param {{runs: Run[], use: bigint, cost: bigint, life: string}} drawn
 */
function actions({ runs, use, cost, life }) {
  const query = calculationQuery({
    cost: inputs.cost.value, life: inputs.life.value, start: inputs.start.value, year: inputs.year.value,
    method: methodSelect.value, use: inputs.use.value,
  });
  const link = `${location.origin}${location.pathname}?${query}#deduction`;
  const line = citation({ entry: chosenRow(), source, life, cost, start: inputs.start.value, use, runs, link });
  const status = el('p', { class: 'field-note', role: 'status' });
  const csv = el('button', { type: 'button', class: 'button button--secondary' }, 'Download the schedule as CSV');
  csv.addEventListener('click', () => download(scheduleCsv(scheduleColumns(runs, use)), 'decline-in-value.csv', 'text/csv;charset=utf-8'));
  const print = el('button', { type: 'button', class: 'button button--secondary' }, 'Print the schedule');
  print.addEventListener('click', printSchedule);
  return el('div', { class: 'schedule-actions' },
    el('p', { class: 'citation-line', id: 'deduction-citation' }, line),
    el('p', {}, el('a', { href: link }, 'Link to this calculation'),
      '. The link holds the inputs you entered, and this site’s host receives them when the link is opened.'),
    el('div', { class: 'action-row' },
      copyButton('Copy the citation', line, status, {
        done: 'Citation copied.', failed: 'Copying is not available here. Select the citation above and copy it.',
      }),
      copyButton('Copy the link', link, status, {
        done: 'Link copied.', failed: 'Copying is not available here. Copy the address after ‘Working:’ in the citation.',
      }),
      csv, print),
    status);
}

/** Names a field's problem beside it. @param {HTMLInputElement} control @param {unknown} error */
function refuse(control, error) {
  control.setCustomValidity(error instanceof Error ? error.message : 'Check this value.');
  reportFirstInvalid(form);
}

/** Reads one input with its parser, or names the field's problem and returns null.
 * @template T @param {HTMLInputElement} control @param {(text: string) => T} parse @returns {T | null} */
function read(control, parse) {
  try {
    return parse(control.value);
  } catch (error) {
    refuse(control, error);
    return null;
  }
}

/** The schedules the inputs give, or null once a field has been named.
 * @param {bigint} cost @param {import('./depreciation-rates.mjs').Life} life @param {bigint} use */
function runsFor(cost, life, use) {
  const methods = METHOD_RUNS[/** @type {keyof typeof METHOD_RUNS} */ (methodSelect.value)] ?? METHOD_RUNS['diminishing-value'];
  try {
    return methods.map((method) => ({
      method, lines: schedule({ cost, life, start: inputs.start.value, yearEnd: Number(inputs.year.value), method, use }),
    }));
  } catch (error) {
    refuse(error instanceof Error && error.message.includes('income year') ? inputs.year : inputs.start, error);
    return null;
  }
}

/** Section 40-95(2) takes the life in force when the asset was acquired, which a row whose
 * life was set after the start date, or an instrument that commenced after it, may not give.
 * @param {Entry | null} row */
function warnings(row) {
  const start = inputs.start.value;
  const instrument = source ? INSTRUMENTS[source.register_id] : undefined;
  return [
    ...(row?.updated && start < row.updated
      ? [`The life of ‘${row.asset}’ was last set on ${longDate(row.updated)}, after this start date. Check the determination in force when you acquired the asset.`]
      : []),
    ...(row && instrument && start < instrument.commenced ? [commencedNote(instrument)] : []),
  ].map((text) => el('p', { class: 'field-note' }, text));
}

function drawSchedule() {
  for (const control of Object.values(inputs)) {
    control.setCustomValidity('');
    clearFieldError(control);
  }
  if (!reportFirstInvalid(form)) return;
  const cost = read(inputs.cost, parseCents);
  const parsed = cost === null ? null : read(inputs.life, parseLife);
  const use = parsed === null ? null : read(inputs.use, parseUse);
  if (cost === null || parsed === null || use === null) return;
  const runs = runsFor(cost, parsed, use);
  if (!runs) return;
  const life = inputs.life.value.trim();
  output.replaceChildren(...warnings(chosenRow()), ...resultRows(runs, use, life));
  scheduleBox.replaceChildren(scheduleTable(runs, use), actions({ runs, use, cost, life }));
}

/** Removes figures worked from inputs that have since changed. */
function clearSchedule() {
  if (!scheduleBox.hasChildNodes()) return;
  scheduleBox.replaceChildren();
  output.textContent = READY;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  drawSchedule();
});
for (const control of Object.values(inputs)) {
  control.addEventListener('input', () => {
    control.setCustomValidity('');
    clearFieldError(control);
    clearSchedule();
  });
}
methodSelect.addEventListener('change', clearSchedule);
// The first income year an asset can have is the one its start date falls in.
inputs.start.addEventListener('change', () => {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(inputs.start.value);
  if (!match) return;
  const first = Number(match[1]) + (Number(match[2]) >= 7 ? 1 : 0);
  if (!inputs.year.value || Number(inputs.year.value) < first) inputs.year.value = String(first);
});
form.querySelector('fieldset')?.removeAttribute('disabled');

// A link to a calculation fills the form and works it out, naming any field it cannot use.
try {
  const linked = readCalculation(new URLSearchParams(location.search));
  if (linked) {
    for (const [name, input] of Object.entries(inputs)) {
      const value = linked[/** @type {keyof typeof inputs} */ (name)];
      if (value !== undefined) input.value = value;
    }
    if (linked.method) methodSelect.value = linked.method;
    drawSchedule();
  }
} catch (error) {
  output.textContent = `${error instanceof Error ? error.message : 'The link could not be read.'} Enter the inputs and work out the deduction.`;
}
