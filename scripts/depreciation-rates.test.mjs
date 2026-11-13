// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FIRST_START, SYNONYMS, below, flatten, formatCents, formatLife, lifeFromMonths, parseCents,
  parseLife, rates, schedule, search,
} from '../assets/depreciation-rates.mjs';

const data = JSON.parse(
  readFileSync(new URL('../tools/depreciation-rates/effective-life.json', import.meta.url), 'utf8'),
);
const entries = flatten(data);

/** @param {string} life @param {string} start @param {number} yearEnd
 * @param {'prime-cost' | 'diminishing-value'} method @param {bigint} cost */
const deductions = (cost, life, start, yearEnd, method) =>
  schedule({ cost, life: parseLife(life), start, yearEnd, method }).map((line) => formatCents(line.deduction));

test('a life gives the prime cost and diminishing value rates', () => {
  const cases = [
    ['5', '20.00%', '40.00%'],
    ['3', '33.33%', '66.67%'],
    ['7', '14.29%', '28.57%'],
    ['6 2/3', '15.00%', '30.00%'],
    ['13 1/3', '7.50%', '15.00%'],
    ['17 1/2', '5.71%', '11.43%'],
    ['1', '100.00%', '200.00%'],
    ['100', '1.00%', '2.00%'],
  ];
  for (const [life, primeCost, diminishingValue] of cases) {
    assert.deepEqual(rates(parseLife(life)), { primeCost, diminishingValue }, life);
  }
});

test('every life in the instrument reads the same from its text and its months', () => {
  let lives = 0;
  for (const entry of entries) {
    if (entry.life === null || entry.months === null) continue;
    lives += 1;
    assert.deepEqual(parseLife(entry.life), lifeFromMonths(entry.months), entry.asset);
  }
  assert.equal(lives, data.counts.table_a.lives + data.counts.table_b.lives);
});

test('a life is read in the forms a reader types', () => {
  assert.deepEqual(parseLife('10'), { numerator: 10n, denominator: 1n });
  assert.deepEqual(parseLife(' 7.5 '), { numerator: 15n, denominator: 2n });
  assert.deepEqual(parseLife('6 2/3'), { numerator: 20n, denominator: 3n });
  assert.deepEqual(parseLife('13⅓'), { numerator: 40n, denominator: 3n });
  assert.deepEqual(parseLife('½'), { numerator: 1n, denominator: 2n });
  assert.deepEqual(parseLife('200'), { numerator: 200n, denominator: 1n });
  assert.deepEqual(lifeFromMonths(80), { numerator: 20n, denominator: 3n });
  for (const text of ['', 'ten', '0', '-5', '1/0', '0.05', '201', '1e2', '5 years']) {
    assert.throws(() => parseLife(text), /effective life/, text);
  }
  for (const months of [0, -12, 1.5]) assert.throws(() => lifeFromMonths(months), /months/);
});

test('a life prints with its fraction as one character', () => {
  assert.equal(formatLife('13 1/3'), '13⅓');
  assert.equal(formatLife('6 2/3'), '6⅔');
  assert.equal(formatLife('17 1/2'), '17½');
  assert.equal(formatLife('10'), '10');
});

test('money is whole cents', () => {
  assert.equal(parseCents('$1,500'), 150000n);
  assert.equal(parseCents('1500.5'), 150050n);
  assert.equal(parseCents('0.01'), 1n);
  assert.equal(formatCents(123456n), '$1,234.56');
  assert.equal(formatCents(5n), '$0.05');
  assert.equal(formatCents(100_000_000_000n), '$1,000,000,000.00');
  for (const text of ['', '0', '-5', '1e3', '12.345', '1000000000.01', 'abc']) {
    assert.throws(() => parseCents(text), /cost/, text);
  }
});

// The ATO's page 'Prime cost and diminishing value methods' (read 13 November 2026) works
// an $80,000 asset with a 5 year life held from the first day of an income year: prime
// cost $16,000 a year; diminishing value $32,000, $19,200, $11,520 and $6,912. Its years
// are 365 days. From 1 July 2024 the first 3 years are, and 2027-28 has 366.
test('the ATO example of an $80,000 asset over 5 years', () => {
  assert.deepEqual(
    deductions(8_000_000n, '5', '2024-07-01', 2027, 'prime-cost'),
    ['$16,000.00', '$16,000.00', '$16,000.00'],
  );
  assert.deepEqual(
    deductions(8_000_000n, '5', '2024-07-01', 2027, 'diminishing-value'),
    ['$32,000.00', '$19,200.00', '$11,520.00'],
  );
  // 2027-28 holds 29 February 2028: $17,280 x 366 / 365 x 40% = $6,930.94 where a 365 day
  // year gives the page's $6,912.
  const fourth = schedule({
    cost: 8_000_000n, life: parseLife('5'), start: '2024-07-01', yearEnd: 2028, method: 'diminishing-value',
  })[3];
  assert.deepEqual(
    [fourth.days, formatCents(fourth.opening), formatCents(fourth.deduction), formatCents(fourth.closing)],
    [366, '$17,280.00', '$6,930.94', '$10,349.06'],
  );
});

// The ATO's 'Guide to depreciating assets 2026' (read 13 November 2026): Laura's $1,500
// photocopier, first used 1 July 2025, 5 year life, declines by $600 in 2025-26 under
// diminishing value and is worth $900 on 30 June 2026; under prime cost it declines by
// $300 and is worth $1,200.
test('the ATO example of a $1,500 photocopier', () => {
  const [dv] = schedule({
    cost: 150_000n, life: parseLife('5'), start: '2025-07-01', yearEnd: 2026, method: 'diminishing-value',
  });
  assert.deepEqual([dv.days, dv.deduction, dv.closing], [365, 60_000n, 90_000n]);
  const [pc] = schedule({
    cost: 150_000n, life: parseLife('5'), start: '2025-07-01', yearEnd: 2026, method: 'prime-cost',
  });
  assert.deepEqual([pc.days, pc.deduction, pc.closing], [365, 30_000n, 120_000n]);
});

// The same guide: Paul's $2,000 refrigerator, first used 1 July 2022, 10 year life, prime
// cost, with 366 days held in 2023-24 over a divisor of 365. The guide prints whole
// dollars ($200, and $201 for the long year); to the cent the long year is $200.55.
test('the ATO example of a leap year keeps 365 as the divisor', () => {
  const lines = schedule({
    cost: 200_000n, life: parseLife('10'), start: '2022-07-01', yearEnd: 2026, method: 'prime-cost',
  });
  assert.deepEqual(lines.map((line) => line.days), [365, 366, 365, 365]);
  assert.deepEqual(lines.map((line) => line.deduction), [20_000n, 20_055n, 20_000n, 20_000n]);
});

test('a part year counts the days from the start date to 30 June', () => {
  // 1 January to 30 June 2025 is 181 days: $1,000 x 181 / 365 x 50% = $247.95.
  const lines = schedule({
    cost: 100_000n, life: parseLife('2'), start: '2025-01-01', yearEnd: 2028, method: 'prime-cost',
  });
  assert.deepEqual(lines.map((line) => line.days), [181, 365, 365, 366]);
  // The third year takes what is left, not a full $500, and nothing is left after it.
  assert.deepEqual(lines.map((line) => line.deduction), [24_795n, 50_000n, 25_205n, 0n]);
  assert.equal(lines[3].closing, 0n);
  // 1 January to 30 June 2024 holds 29 February: 182 days.
  assert.equal(schedule({
    cost: 100_000n, life: parseLife('2'), start: '2024-01-01', yearEnd: 2024, method: 'prime-cost',
  })[0].days, 182);
  // 30 June is the last day of its income year and 1 July the first of the next.
  assert.deepEqual(deductions(36_500n, '1', '2025-06-30', 2025, 'prime-cost'), ['$1.00']);
  assert.equal(schedule({
    cost: 36_500n, life: parseLife('1'), start: '2025-07-01', yearEnd: 2026, method: 'prime-cost',
  })[0].yearEnd, 2026);
});

test('diminishing value works on what is left and a third of a year is exact', () => {
  // 6 2/3 years is 30% a year: $10,000, then 30% of $7,000.
  assert.deepEqual(
    deductions(1_000_000n, '6 2/3', '2025-07-01', 2027, 'diminishing-value'),
    ['$3,000.00', '$2,100.00'],
  );
  // Each year rounds half up to the cent: $0.05 x 40% is 2 cents.
  assert.deepEqual(deductions(5n, '5', '2025-07-01', 2026, 'diminishing-value'), ['$0.02']);
});

test('dates and years the working cannot cover are refused', () => {
  const input = { cost: 100_000n, life: parseLife('5'), yearEnd: 2026, method: /** @type {const} */ ('prime-cost') };
  assert.equal(FIRST_START, '2006-05-10');
  assert.equal(schedule({ ...input, start: '2006-05-10', yearEnd: 2006 })[0].days, 52);
  assert.throws(() => schedule({ ...input, start: '2006-05-09' }), /10 May 2006/);
  for (const start of ['', '2025-02-30', '2025-13-01', '1 July 2025']) {
    assert.throws(() => schedule({ ...input, start }), /start date/, start);
  }
  assert.throws(() => schedule({ ...input, start: '2025-07-01', yearEnd: 2025 }), /30 June 2026 or later/);
  assert.throws(() => schedule({ ...input, start: '2025-07-01', yearEnd: 2026.5 }), /income year/);
});

test('every row of the instrument is an entry with the headings above it', () => {
  assert.equal(entries.length, data.counts.table_a.rows + data.counts.table_b.rows);
  assert.deepEqual(entries.map((entry) => entry.id), entries.map((_, index) => index));
  const taxis = entries.find((entry) => entry.table === 'B' && entry.asset === 'Taxis');
  assert.ok(taxis);
  assert.deepEqual(taxis.path, [
    'Motor vehicles and trailers',
    'Cars (motor vehicles designed to carry a load of less than one tonne and fewer than 9 passengers)',
  ]);
  assert.deepEqual([taxis.section, taxis.life, taxis.months, taxis.reviewed, taxis.capped, taxis.heading],
    ['M', '4', 48, true, false, false]);
  const tractors = entries.find((entry) => entry.table === 'A' && entry.asset === 'Tractors');
  assert.ok(tractors);
  assert.deepEqual([tractors.division, tractors.section, tractors.capped, tractors.updated],
    ['AGRICULTURE, FORESTRY AND FISHING', '', true, '2007-07-01']);
  // A row with no life is a heading only when deeper rows follow it.
  const heading = entries.find((entry) => entry.table === 'B' && entry.asset === 'Motor vehicles and trailers:');
  const reference = entries.find((entry) => entry.asset.startsWith('Garbage compactor trucks – see Table A'));
  assert.ok(heading && reference);
  assert.deepEqual([heading.heading, reference.heading, reference.life], [true, false, null]);
});

test('a heading gives the rows nested under it and no others', () => {
  const cars = entries.find((entry) => entry.table === 'B' && entry.asset.startsWith('Cars (motor vehicles'));
  assert.ok(cars);
  assert.deepEqual(below(entries, cars).map((entry) => entry.asset), [
    'Generally',
    'Hire cars:',
    'Cars used to provide basic service ride-sourcing, ride-hailing or ride-sharing services (e.g. UberX)',
    'Generally (including cars used to provide premium service ride-sourcing, ride-hailing or ride-sharing services e.g. UberBLACK)',
    'Rental cars',
    'Taxis',
  ]);
  const taxis = entries.find((entry) => entry.table === 'B' && entry.asset === 'Taxis');
  assert.ok(taxis);
  assert.deepEqual(below(entries, taxis), []);
  // Rows never run past the end of their section, or of the tables.
  for (const entry of entries.filter((candidate) => candidate.heading)) {
    const under = below(entries, entry);
    assert.ok(under.length > 0, entry.asset);
    assert.ok(under.every((row) => row.section === entry.section && row.division === entry.division), entry.asset);
  }
  assert.deepEqual(below(entries, entries[entries.length - 1]), []);
});

test('the page states the counts and dates the data file records', () => {
  const page = readFileSync(new URL('../tools/depreciation-rates/index.html', import.meta.url), 'utf8');
  const long = (/** @type {string} */ iso) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const lives = data.counts.table_a.lives + data.counts.table_b.lives;
  assert.ok(page.includes(`Search the ${lives.toLocaleString('en-AU')} effective lives`));
  assert.ok(page.includes(`holds all ${entries.length.toLocaleString('en-AU')} rows`));
  assert.ok(page.includes(`(${data.source.register_id}), made on ${long(data.source.made)} and registered on ${long(data.source.registered)}`));
  assert.ok(page.includes(`href="${data.source.url}"`));
  // The Register's required words, with the date the source was read, appear as the file gives them.
  assert.ok(page.includes(data.source.attribution.replace(
    'https://www.legislation.gov.au.',
    '<a href="https://www.legislation.gov.au">https://www.legislation.gov.au</a>.',
  )));
  assert.ok(page.includes(`href="${data.source.licence_url}"`));
});

test('a search finds rows by every word typed', () => {
  const found = (/** @type {string} */ query) => search(entries, query);
  const first = (/** @type {string} */ query, /** @type {'A' | 'B'} */ table) =>
    found(query).find((entry) => entry.table === table)?.asset;

  assert.deepEqual(found(''), []);
  assert.deepEqual(found('  ,; '), []);
  assert.deepEqual(found('xyzzy'), []);
  // Every word must be found: a second word narrows the list.
  assert.ok(found('tractor').length > found('tractor baggage').length);
  assert.ok(found('tractor baggage').length > 0);
  assert.deepEqual(found('tractor xyzzy'), []);

  // Case, plurals and typed punctuation make no difference.
  const ids = (/** @type {string} */ query) => found(query).map((entry) => entry.id);
  assert.deepEqual(ids('TRACTORS'), ids('tractor'));
  assert.deepEqual(ids("Monumental masons' plant"), ids('monumental masons’ plant'));
  assert.deepEqual(ids('self propelled'), ids('self-propelled'));

  // The description that is the query leads its table.
  assert.equal(first('tractor', 'B'), 'Tractors');
  assert.equal(first('mobile phones', 'B'), 'Mobile phones');
  assert.equal(first('desk', 'B'), 'Desks');
  assert.equal(first('car', 'B'),
    'Cars (motor vehicles designed to carry a load of less than one tonne and fewer than 9 passengers):');
  assert.equal(first('motor vehicle', 'B'), 'Motor vehicles and trailers:');
  // A word in a heading finds the rows under it.
  assert.ok(found('office furniture').some((entry) => entry.asset === 'Desks'));
  assert.ok(found('motor vehicle').some((entry) => entry.asset === 'Taxis' && entry.table === 'B'));
  // A word in the industry's name finds its rows, after rows that hold the word themselves.
  const dairy = found('dairy pumps');
  assert.ok(dairy.length > 0);
  assert.ok(dairy.every((entry) => entry.table === 'A'));

  // An ending does not hide an asset: 'conditioner' finds every 'conditioning' row.
  const conditioner = new Set(found('air conditioner').map((entry) => entry.id));
  const conditioning = found('air conditioning');
  assert.ok(conditioning.length > 0);
  assert.ok(conditioning.every((entry) => conditioner.has(entry.id)));
  // A short word does not match inside longer ones such as 'chutes'.
  assert.ok(found('ute').every((entry) => entry.own.some((term) => term.word.startsWith('ute'))));
});

test('each everyday word finds the rows of the instrument word it stands for', () => {
  const ids = (/** @type {string} */ query) => search(entries, query).map((entry) => entry.id);
  for (const [typed, meant] of Object.entries(SYNONYMS)) {
    assert.ok(ids(meant).length > 0, meant);
    assert.deepEqual(ids(typed), ids(meant), typed);
    assert.deepEqual(ids(`${typed}s`), ids(meant), `${typed}s`);
    assert.deepEqual(ids(typed.toUpperCase()), ids(meant), typed.toUpperCase());
  }
});

test('a search of every row stays quick', () => {
  const started = performance.now();
  for (const query of ['car', 'motor vehicle', 'pumps', 'a', 'solar hot water system']) search(entries, query);
  assert.ok(performance.now() - started < 1000);
});
