// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// The depreciation calculator's working as text: the schedule's columns, shared by the page
// table and the CSV, the citation line and the link that restores a calculation. No page
// access, so Node can test it.

import { formatCents } from './depreciation-rates.mjs';

/**
 * @typedef {import('./depreciation-rates.mjs').Entry} Entry
 * @typedef {import('./depreciation-rates.mjs').Method} Method
 * @typedef {import('./depreciation-rates.mjs').YearLine} YearLine
 * @typedef {{method: Method, lines: YearLine[]}} Run one method's schedule
 * @typedef {{heading: string, values: (string | bigint)[], csv?: {heading: string, values: string[]}}} Column
 *   a bigint is whole cents; `csv` stands in for the column in a CSV
 * @typedef {{title: string, register_id: string}} Source the data file's source block
 * @typedef {{cost: string, life: string, start: string, year: string, method: string, use: string}} Fields
 *   the calculator's inputs as typed
 */

/** @type {Record<Method, string>} */
export const METHOD_NAMES = { 'prime-cost': 'Prime cost', 'diminishing-value': 'Diminishing value' };

/** Each instrument the data file can come from, by its Federal Register ID: the ATO legal
 * database's citation and the day it commenced. The legal database titles F2025L01097
 * 'LI 2025/20', and its section 2 commences it the day after registration, which was
 * 15 September 2025 (read 14 November 2026). A rebuild from another instrument needs its entry.
 * @type {Record<string, {cited: string, commenced: string}>} */
export const INSTRUMENTS = { F2025L01097: { cited: 'LI 2025/20', commenced: '2025-09-16' } };

/** Each input a link can carry, with the longest value its field takes. */
export const LINK_FIELDS = /** @type {const} */ ([['cost', 20], ['life', 12], ['start', 10], ['year', 4], ['method', 17], ['use', 6]]);
const LINK_METHODS = ['prime-cost', 'diminishing-value', 'both'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December',
];

/** 'RETAIL TRADE' as 'Retail trade'. @param {string} heading */
export const sentence = (heading) => heading.charAt(0) + heading.slice(1).toLowerCase();

/** '2016-07-01' as '1 July 2016'. @param {string} iso */
export function longDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** @param {string} printed */
export const years = (printed) => `${printed} ${printed === '1' ? 'year' : 'years'}`;

/** The income year that ends on 30 June of a year: 2026 is '2025-26'. @param {number} end */
export const incomeYear = (end) => `${end - 1}-${String(end % 100).padStart(2, '0')}`;

/** Where a row sits: its table or industry, then the headings above it. @param {Entry} entry */
export function place(entry) {
  const top = entry.table === 'B' ? ['Table B'] : [sentence(entry.division), entry.section];
  return [...top, ...entry.path].filter(Boolean).join(' / ');
}

/** Hundredths of a per cent as a reader writes it: 10000n is '100' and 6250n is '62.5'. @param {bigint} hundredths */
export function formatUse(hundredths) {
  const part = String(hundredths % 100n).padStart(2, '0');
  const whole = String(hundredths / 100n);
  if (part === '00') return whole;
  return `${whole}.${part.endsWith('0') ? part.charAt(0) : part}`;
}

/**
 * The columns of a schedule, for the page's table and the CSV alike. With 2 methods each
 * column is named for its method and the opening values are left out, as each year's
 * opening value is the year before's closing value. A deduction column appears only where
 * use is partly not for a taxable purpose.
 * @param {Run[]} runs @param {bigint} use @returns {Column[]}
 */
export function scheduleColumns(runs, use) {
  const { lines } = runs[0];
  /** @type {Column[]} */
  const columns = [
    // A spreadsheet reads '2010-11' as November 2010, so the CSV gives the year's end instead.
    {
      heading: 'Income year',
      values: lines.map((line) => incomeYear(line.yearEnd)),
      csv: { heading: 'Year ending 30 June', values: lines.map((line) => String(line.yearEnd)) },
    },
    { heading: 'Days held', values: lines.map((line) => String(line.days)) },
  ];
  const both = runs.length > 1;
  for (const run of runs) {
    /** @param {string} name */
    const label = (name) => (both ? `${METHOD_NAMES[run.method]}: ${name.toLowerCase()}` : name);
    if (!both) columns.push({ heading: 'Opening value', values: run.lines.map((line) => line.opening) });
    columns.push({ heading: label('Decline in value'), values: run.lines.map((line) => line.decline) });
    if (use < 10_000n) {
      columns.push({ heading: label(`Deduction at ${formatUse(use)}% taxable use`), values: run.lines.map((line) => line.deduction) });
    }
    columns.push({ heading: label('Closing value'), values: run.lines.map((line) => line.closing) });
  }
  return columns;
}

/** A CSV of the columns: money as plain dollars and cents, lines ending CRLF (RFC 4180). No
 * heading or value holds a comma, quotation mark or line break, so nothing is quoted.
 * @param {Column[]} columns */
export function scheduleCsv(columns) {
  const shown = columns.map((column) => column.csv ?? column);
  /** @param {string | bigint} value */
  const cell = (value) => (typeof value === 'bigint' ? `${value / 100n}.${String(value % 100n).padStart(2, '0')}` : value);
  const rows = [shown.map((column) => column.heading)];
  for (let index = 0; index < shown[0].values.length; index += 1) {
    rows.push(shown.map((column) => cell(column.values[index])));
  }
  return rows.map((row) => `${row.join(',')}\r\n`).join('');
}

/** The query that restores the inputs as typed. @param {Fields} fields */
export function calculationQuery(fields) {
  const params = new URLSearchParams();
  for (const [name] of LINK_FIELDS) params.set(name, fields[name].trim());
  return params.toString();
}

/**
 * The inputs a link carries, or null when it carries none. An input the link leaves out is
 * left out here, so the form keeps its default or names it; a value the form could not hold
 * is refused.
 * @param {URLSearchParams} params @returns {Partial<Fields> | null}
 */
export function readCalculation(params) {
  /** @type {Partial<Fields>} */
  const fields = {};
  for (const [name, longest] of LINK_FIELDS) {
    const value = params.get(name);
    if (value === null) continue;
    if (value.length > longest) throw new Error(`The link’s ${name} is longer than the form takes.`);
    fields[name] = value;
  }
  if (fields.method !== undefined && !LINK_METHODS.includes(fields.method)) {
    throw new Error('The link’s method is not one the calculator offers.');
  }
  return Object.keys(fields).length ? fields : null;
}

/** The warning for a start date before an instrument commenced.
 * @param {{cited: string, commenced: string}} instrument */
export const commencedNote = (instrument) =>
  `${instrument.cited} commenced on ${longDate(instrument.commenced)}, after this start date: check the life in the determination in force at the time subsection 40-95(2) fixes.`;

/**
 * A line for a working paper: the life and the row and instrument it came from, the inputs,
 * each method's figures for the last year and the link that restores the working. A life
 * that did not come from a row is said to be entered. A start before the instrument
 * commenced is flagged: subsection 40-95(2) then points to an earlier determination.
 * @param {{entry: Entry | null, source: Source | null, life: string, cost: bigint, start: string,
 *   use: bigint, runs: Run[], link: string}} working
 */
export function citation({ entry, source, life, cost, start, use, runs, link }) {
  const instrument = source ? INSTRUMENTS[source.register_id] : undefined;
  const numbers = source ? [instrument?.cited, source.register_id].filter(Boolean).join(', ') : '';
  const updated = entry?.updated ? `, last updated ${longDate(entry.updated)}` : '';
  const early = instrument && start < instrument.commenced ? ` ${commencedNote(instrument)}` : '';
  const origin = entry && source
    ? `Effective life ${years(life)}: ‘${entry.asset}’ (${place(entry)}), Schedule 2 to the ${source.title} (${numbers})${updated}.${early}`
    : `Effective life ${years(life)}, entered for this working and not taken from a row of the determination.`;
  const figures = runs.map(({ method, lines }) => {
    const last = lines[lines.length - 1];
    const part = use < 10_000n ? `, deduction at ${formatUse(use)}% taxable use ${formatCents(last.deduction)}` : '';
    return `${METHOD_NAMES[method]}: decline in value for ${incomeYear(last.yearEnd)} ${formatCents(last.decline)}${part}.`;
  });
  return [
    origin, `Cost ${formatCents(cost)}, first used or installed ready for use on ${longDate(start)}.`, ...figures, `Working: ${link}`,
  ].join(' ');
}
