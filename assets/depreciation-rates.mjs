// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// The depreciation rate finder's arithmetic and search, with no page access so
// Node can test it. Lives are exact fractions of a year and money is whole
// cents in BigInt, so a life of 6 2/3 years never passes through a float.

/**
 * @typedef {[string, number, string | null, number | null, string, string | null]} SourceRow
 *   asset, depth, life as printed, life in months, flags, last updated
 * @typedef {{heading: string | null, anzsic: string | null, note: string | null, rows: SourceRow[]}} SourceSection
 * @typedef {{heading: string, anzsic: string, sections: SourceSection[]}} SourceDivision
 * @typedef {{table_a: SourceDivision[], table_b: SourceSection[]}} SourceTables
 * @typedef {{word: string, one: string, stem: string}} Term a word, its singular and its stem
 * @typedef {{
 *   id: number, table: 'A' | 'B', division: string, section: string, anzsic: string,
 *   note: string | null, path: string[], asset: string, depth: number,
 *   life: string | null, months: number | null, reviewed: boolean, capped: boolean,
 *   updated: string | null, heading: boolean, own: Term[], above: Term[], around: Term[],
 *   size: number
 * }} Entry `own` is the description's words, `above` the headings over it, `around` the
 *   names of its industry and `size` the count of its words outside brackets
 * @typedef {{numerator: bigint, denominator: bigint}} Life a positive number of years
 * @typedef {'prime-cost' | 'diminishing-value'} Method
 * @typedef {{yearEnd: number, days: number, opening: bigint, deduction: bigint, closing: bigint}} YearLine
 */

/** The first day an asset can start to be held for the 200% diminishing value rate
 * (section 40-72 of the Income Tax Assessment Act 1997). */
export const FIRST_START = '2006-05-10';

/** Lower case, with dashes and quotation marks in their plain forms, so that a typed
 * query and the instrument's text compare alike. @param {string} text */
export function fold(text) {
  return text.toLowerCase().replace(/[‐-―]/g, '-').replace(/[‘’]/g, "'");
}

/** The words of a text: runs of letters and digits. @param {string} text */
function words(text) {
  return fold(text).match(/[a-z0-9]+/g) ?? [];
}

/** A word without its plural ending: 'presses' is 'press' and 'heaters' is 'heater'.
 * @param {string} word */
function singular(word) {
  if (word.endsWith('sses')) return word.slice(0, -2);
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

/** A singular word without the ending that makes it an action or a doer, so that
 * 'conditioner' and 'conditioning' meet. At least 4 letters stay. @param {string} word */
function stem(word) {
  const one = singular(word);
  const ending = ['ing', 'er', 'ed'].find((end) => one.endsWith(end) && one.length - end.length > 3);
  return ending ? one.slice(0, -ending.length) : one;
}

/** @param {string} text @returns {Term[]} */
function terms(text) {
  return words(text).map((word) => ({ word, one: singular(word), stem: stem(word) }));
}

/** Everyday words and the instrument's words for the same thing. Plain synonyms only: a
 * word that needs a tax judgement to place, such as 'ute', is left out.
 * @type {Record<string, string>} */
export const SYNONYMS = { fridge: 'refrigerator', tv: 'television', aircon: 'air conditioning' };

/**
 * Every row of both tables in the instrument's order, each with the headings above it.
 * A row with no life is a heading when a deeper row follows it, and otherwise a
 * cross-reference such as 'see Table B'.
 * @param {SourceTables} tables
 * @returns {Entry[]}
 */
export function flatten(tables) {
  /** @type {Entry[]} */
  const entries = [];
  /** @param {'A' | 'B'} table @param {string} division @param {SourceSection} section */
  const add = (table, division, section) => {
    /** @type {string[]} */
    const path = [];
    section.rows.forEach(([asset, depth, life, months, flags, updated], index) => {
      path.length = depth;
      const next = section.rows[index + 1];
      const name = section.heading ?? '';
      entries.push({
        id: entries.length, table, division, section: name, anzsic: section.anzsic ?? '',
        note: section.note, path: [...path], asset, depth, life, months,
        reviewed: flags.includes('*'), capped: flags.includes('#'), updated,
        heading: life === null && next !== undefined && next[1] > depth,
        own: terms(asset), above: terms(path.join(' ')), around: terms(`${name} ${division}`),
        size: words(asset.replace(/\([^)]*\)/g, ' ')).length,
      });
      path[depth] = asset.replace(/:$/, '');
    });
  };
  for (const division of tables.table_a) {
    for (const section of division.sections) add('A', division.heading, section);
  }
  for (const section of tables.table_b) add('B', '', section);
  return entries;
}

/** How well one query word matches a list of words: 4 the same word in the singular, 3
 * the same stem, 2 the start of a word, 1 inside a word (for 4 letters or more), 0 not at
 * all. @param {Term} query @param {Term[]} list */
function termScore(query, list) {
  let best = 0;
  for (const term of list) {
    if (term.one === query.one) return 4;
    if (term.stem === query.stem) best = Math.max(best, 3);
    else if (term.word.startsWith(query.one)) best = Math.max(best, 2);
    else if (query.one.length > 3 && term.word.includes(query.one)) best = Math.max(best, 1);
  }
  return best;
}

/**
 * The entries that hold every word of the query, best first. A word found in the asset's
 * own description counts for more than one found in the headings above it, and that for
 * more than one found in the name of its industry. A description that starts with a query
 * word comes before one that holds it later, a short description before a long one, and
 * ties keep the instrument's order.
 * @param {Entry[]} entries @param {string} query
 * @returns {Entry[]}
 */
export function search(entries, query) {
  const typed = words(query).map((word) => SYNONYMS[word] ?? SYNONYMS[word.replace(/s$/, '')] ?? word).join(' ');
  const wanted = terms(typed).filter((term, index, all) => all.findIndex((t) => t.one === term.one) === index);
  if (!wanted.length) return [];
  /** @type {{entry: Entry, score: number}[]} */
  const found = [];
  for (const entry of entries) {
    let score = 0;
    for (const term of wanted) {
      const part = termScore(term, entry.own) * 5 || termScore(term, entry.above) * 3 || termScore(term, entry.around);
      if (!part) {
        score = -1;
        break;
      }
      score += part;
    }
    if (score < 0) continue;
    if (wanted.some((term) => term.one === entry.own[0]?.one)) score += 2;
    found.push({ entry, score: score * 100 - Math.min(entry.size, 99) });
  }
  return found.sort((a, b) => b.score - a.score || a.entry.id - b.entry.id).map(({ entry }) => entry);
}

/** @param {bigint} a @param {bigint} b @returns {bigint} */
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** Non-negative division rounded half up. @param {bigint} top @param {bigint} bottom */
const roundHalfUp = (top, bottom) => (2n * top + bottom) / (2n * bottom);

/**
 * An effective life in years: whole years, a decimal with up to 4 places, or whole
 * years and a fraction as the instrument prints it ('6 2/3'), from 1 month to 200 years.
 * @param {string} text
 * @returns {Life}
 */
export function parseLife(text) {
  const plain = text.trim().replace('½', ' 1/2').replace('⅓', ' 1/3').replace('⅔', ' 2/3').trim();
  const mixed = /^(?:(\d{1,3}) +)?(\d{1,2})\/(\d{1,2})$/.exec(plain);
  const decimal = /^(\d{1,3})(?:\.(\d{1,4}))?$/.exec(plain);
  let numerator;
  let denominator;
  if (mixed && BigInt(mixed[3]) > 0n) {
    denominator = BigInt(mixed[3]);
    numerator = BigInt(mixed[1] ?? '0') * denominator + BigInt(mixed[2]);
  } else if (decimal) {
    denominator = 10n ** BigInt((decimal[2] ?? '').length);
    numerator = BigInt(decimal[1] + (decimal[2] ?? ''));
  } else {
    throw new Error('Enter the effective life in years, such as 10, 7.5 or 6 2/3.');
  }
  if (numerator * 12n < denominator || numerator > 200n * denominator) {
    throw new Error('Enter an effective life between 1 month and 200 years.');
  }
  const common = gcd(numerator, denominator);
  return { numerator: numerator / common, denominator: denominator / common };
}

/** A whole number of months as a life. @param {number} months @returns {Life} */
export function lifeFromMonths(months) {
  if (!Number.isInteger(months) || months < 1) throw new Error('A life is a whole number of months.');
  const common = gcd(BigInt(months), 12n);
  return { numerator: BigInt(months) / common, denominator: 12n / common };
}

/** A life as the instrument prints it, with the fraction as one character: '13⅓'.
 * @param {string} printed */
export function formatLife(printed) {
  return printed.replace(' 1/2', '½').replace(' 1/3', '⅓').replace(' 2/3', '⅔')
    .replace(/^1\/2$/, '½').replace(/^1\/3$/, '⅓').replace(/^2\/3$/, '⅔');
}

/** Hundredths of a per cent as text: 1500 is '15.00%'. @param {bigint} hundredths */
const percent = (hundredths) => `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, '0')}%`;

/**
 * The yearly rates a life gives, each rounded half up to 2 decimal places: prime cost is
 * 100% divided by the life and diminishing value is 200% divided by the life.
 * @param {Life} life
 * @returns {{primeCost: string, diminishingValue: string}}
 */
export function rates({ numerator, denominator }) {
  return {
    primeCost: percent(roundHalfUp(10000n * denominator, numerator)),
    diminishingValue: percent(roundHalfUp(20000n * denominator, numerator)),
  };
}

/** Money text as whole cents, from 1 cent to $1 billion. @param {string} text */
export function parseCents(text) {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/[$,]/g, ''));
  if (!match) throw new Error('Enter the cost in dollars and cents, using digits only.');
  const value = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  if (value < 1n || value > 100_000_000_000n) throw new Error('Enter a cost between $0.01 and $1,000,000,000.');
  return value;
}

/** Whole cents as dollars: 123456n is '$1,234.56'. @param {bigint} value */
export function formatCents(value) {
  const dollars = String(value / 100n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${dollars}.${String(value % 100n).padStart(2, '0')}`;
}

/** The day number of an ISO date, or NaN when it is not a real date. @param {string} iso */
function dayNumber(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return NaN;
  const [year, month, day] = match.slice(1).map(Number);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real ? time / 86_400_000 : NaN;
}

/**
 * The decline in value of one asset for each income year, from the year it starts to the
 * year asked for. Income years end on 30 June. The asset is taken to be held and used all
 * of every year after its start date, with no second element of cost.
 *
 * Prime cost (section 40-75): cost × days held ÷ 365 × 100% ÷ effective life, and no more
 * than what is left. Diminishing value (section 40-72): base value × days held ÷ 365 ×
 * 200% ÷ effective life. Days held can be 366 in a leap year; the divisor stays 365.
 * Each year's amount rounds half up to the cent.
 * @param {{cost: bigint, life: Life, start: string, yearEnd: number, method: Method}} input
 * @returns {YearLine[]}
 */
export function schedule({ cost, life, start, yearEnd, method }) {
  const first = dayNumber(start);
  if (Number.isNaN(first)) throw new Error('Enter the start date.');
  if (start < FIRST_START) throw new Error('Enter a start date on or after 10 May 2006.');
  const [year, month] = start.split('-').map(Number);
  const firstYearEnd = month >= 7 ? year + 1 : year;
  if (!Number.isInteger(yearEnd) || yearEnd < firstYearEnd || yearEnd > firstYearEnd + 200) {
    throw new Error(`Enter an income year ending 30 June ${firstYearEnd} or later.`);
  }
  const bottom = 365n * life.numerator;
  const rate = method === 'diminishing-value' ? 2n : 1n;
  /** @type {YearLine[]} */
  const lines = [];
  let opening = cost;
  for (let end = firstYearEnd; end <= yearEnd; end += 1) {
    const from = end === firstYearEnd ? first : dayNumber(`${end - 1}-07-01`);
    const days = dayNumber(`${end}-06-30`) - from + 1;
    const base = method === 'diminishing-value' ? opening : cost;
    const worked = roundHalfUp(base * BigInt(days) * rate * life.denominator, bottom);
    const deduction = worked > opening ? opening : worked;
    lines.push({ yearEnd: end, days, opening, deduction, closing: opening - deduction });
    opening -= deduction;
  }
  return lines;
}
