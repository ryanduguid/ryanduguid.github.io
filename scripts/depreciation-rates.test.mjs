// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FIRST_START, SYNONYMS, below, flatten, formatCents, lifeFromMonths, parseCents,
  parseLife, parseUse, rates, schedule, search,
} from '../assets/depreciation-rates.mjs';
import {
  INSTRUMENTS, LINK_FIELDS, calculationQuery, citation, readCalculation, scheduleColumns, scheduleCsv,
} from '../assets/depreciation-working.mjs';

const data = JSON.parse(
  readFileSync(new URL('../tools/depreciation-rates/effective-life.json', import.meta.url), 'utf8'),
);
const entries = flatten(data);

/** @param {string} life @param {string} start @param {number} yearEnd
 * @param {'prime-cost' | 'diminishing-value'} method @param {bigint} cost */
const deductions = (cost, life, start, yearEnd, method) =>
  schedule({ cost, life: parseLife(life), start, yearEnd, method }).map((line) => formatCents(line.decline));

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
  for (const text of ['', 'ten', '0', '-5', '1/0', '0.05', '201', '1e2', '5 years', '6 4/3', '6 0/3', '3/2']) {
    assert.throws(() => parseLife(text), /effective life/, text);
  }
  for (const months of [0, -12, 1.5]) assert.throws(() => lifeFromMonths(months), /months/);
});

test('money is whole cents', () => {
  assert.equal(parseCents('$1,500'), 150000n);
  assert.equal(parseCents('1500.5'), 150050n);
  assert.equal(parseCents('0.01'), 1n);
  assert.equal(formatCents(123456n), '$1,234.56');
  assert.equal(formatCents(5n), '$0.05');
  assert.equal(formatCents(100_000_000_000n), '$1,000,000,000.00');
  assert.equal(parseCents('1,500.50'), 150050n);
  assert.equal(parseCents('$1,234,567'), 123456700n);
  for (const text of ['', '0', '-5', '1e3', '12.345', '1000000000.01', 'abc']) {
    assert.throws(() => parseCents(text), /cost/, text);
  }
  // A comma that is not a thousands separator is refused, never dropped: '12,50' is not $1,250.
  for (const text of ['12,50', '1,00', '1,2,3', ',5', '5$', '$$5', '1,5000']) {
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
    [fourth.days, formatCents(fourth.opening), formatCents(fourth.decline), formatCents(fourth.closing)],
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
  assert.deepEqual([dv.days, dv.decline, dv.closing], [365, 60_000n, 90_000n]);
  const [pc] = schedule({
    cost: 150_000n, life: parseLife('5'), start: '2025-07-01', yearEnd: 2026, method: 'prime-cost',
  });
  assert.deepEqual([pc.days, pc.decline, pc.closing], [365, 30_000n, 120_000n]);
});

// The same guide: Paul's $2,000 refrigerator, first used 1 July 2022, 10 year life, prime
// cost, with 366 days held in 2023-24 over a divisor of 365. The guide prints whole
// dollars ($200, and $201 for the long year); to the cent the long year is $200.55.
test('the ATO example of a leap year keeps 365 as the divisor', () => {
  const lines = schedule({
    cost: 200_000n, life: parseLife('10'), start: '2022-07-01', yearEnd: 2026, method: 'prime-cost',
  });
  assert.deepEqual(lines.map((line) => line.days), [365, 366, 365, 365]);
  assert.deepEqual(lines.map((line) => line.decline), [20_000n, 20_055n, 20_000n, 20_000n]);
});

test('a part year counts the days from the start date to 30 June', () => {
  // 1 January to 30 June 2025 is 181 days: $1,000 x 181 / 365 x 50% = $247.95.
  const lines = schedule({
    cost: 100_000n, life: parseLife('2'), start: '2025-01-01', yearEnd: 2028, method: 'prime-cost',
  });
  assert.deepEqual(lines.map((line) => line.days), [181, 365, 365, 366]);
  // The third year takes what is left, not a full $500, and nothing is left after it.
  assert.deepEqual(lines.map((line) => line.decline), [24_795n, 50_000n, 25_205n, 0n]);
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
  // A life under a year: the formula gives 4 times the base value, and subsection
  // 40-72(3) stops the decline at the base value. 1 day in 2025-26, then all that is left.
  assert.deepEqual(deductions(36_500n, '1/2', '2026-06-30', 2027, 'diminishing-value'), ['$4.00', '$361.00']);
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
  // The last year worked is 200 after the first, and a later one is told so.
  assert.equal(schedule({ ...input, start: '2025-07-01', yearEnd: 2226 }).length, 201);
  assert.throws(() => schedule({ ...input, start: '2025-07-01', yearEnd: 2227 }), /30 June 2226 or earlier/);
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
  assert.deepEqual([taxis.section, taxis.life, taxis.months, taxis.capped, taxis.heading],
    ['M', '4', 48, false, false]);
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
  assert.ok(page.includes(`holds all ${entries.length.toLocaleString('en-AU')} rows`));
  // The ATO and accountants cite the instrument by its legal database number.
  const { cited: number } = INSTRUMENTS[data.source.register_id];
  const cited = `${number}, ${data.source.register_id}`;
  // The lead's first sentence answers on its own: the instrument in full, both numbers, its
  // registration, the day it was read unamended and the count.
  assert.ok(page.includes(`<p class="lead-note">The ${data.source.title} (${cited}), registered on ${long(data.source.registered)}`
    + ` and unamended on ${long(data.source.read)}, sets the ${lives.toLocaleString('en-AU')} effective lives this page searches,`));
  assert.ok(page.includes(`(${cited}), made on ${long(data.source.made)} and registered on ${long(data.source.registered)}`));
  assert.ok(page.includes(`<title>Depreciation rates: ATO effective lives in ${number}</title>`));
  assert.ok(page.includes(`content="Every effective life in ${number} (${data.source.register_id})`));
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
  assert.deepEqual(new Set(ids('batteries')), new Set(ids('battery')));
  for (const asset of ['Storage batteries', 'Battery chargers']) {
    assert.ok(found('battery').some((entry) => entry.asset.startsWith(asset)), asset);
  }
  assert.ok(found('accessory').length > 0);
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
    // The typed word finds every row of the instrument's term, and rows that hold the word itself.
    const typedIds = new Set(ids(typed));
    assert.ok(ids(meant).every((id) => typedIds.has(id)), typed);
    assert.deepEqual(ids(`${typed}s`), ids(typed), `${typed}s`);
    assert.deepEqual(ids(typed.toUpperCase()), ids(typed), typed.toUpperCase());
  }
  // A word that names a property of every object is an ordinary word.
  assert.deepEqual(ids('constructor'), ids('constructors'));
  // The instrument's own use of an everyday word is still found.
  assert.ok(search(entries, 'tv').some((entry) => /\bTV\b/.test(entry.asset)));
});

test('a search of every row stays quick', () => {
  const started = performance.now();
  for (const query of ['car', 'motor vehicle', 'pumps', 'a', 'solar hot water system']) search(entries, query);
  assert.ok(performance.now() - started < 1000);
});

test('a taxable use percentage is read as the reader types it', () => {
  assert.equal(parseUse('100'), 10_000n);
  assert.equal(parseUse(' 62.5 '), 6_250n);
  assert.equal(parseUse('50%'), 5_000n);
  assert.equal(parseUse('0'), 0n);
  assert.equal(parseUse('33.33'), 3_333n);
  for (const text of ['', '101', '100.01', '-1', 'half', '1.234', '5 0', '%', '50%%']) {
    assert.throws(() => parseUse(text), /taxable use/, text);
  }
});

// The ATO's 'Guide to depreciating assets 2026' (read 14 November 2026): Leo's $6,000
// computer, used 50% of the time for a taxable purpose in 2025-26, declines by $1,500; his
// deduction is $750 and its adjustable value on 30 June 2026 is $4,500 whatever his use.
// A 4 year life by prime cost from 1 July 2025 gives that $1,500.
test('the ATO example of a computer used half for a taxable purpose', () => {
  const [line] = schedule({
    cost: 600_000n, life: parseLife('4'), start: '2025-07-01', yearEnd: 2026, method: 'prime-cost', use: 5_000n,
  });
  assert.deepEqual([line.decline, line.deduction, line.closing], [150_000n, 75_000n, 450_000n]);
  // The next year's base is the full adjustable value, not the deducted part.
  const lines = schedule({
    cost: 600_000n, life: parseLife('8'), start: '2025-07-01', yearEnd: 2027, method: 'diminishing-value', use: 5_000n,
  });
  assert.deepEqual(lines.map((each) => [each.decline, each.deduction]), [[150_000n, 75_000n], [112_500n, 56_250n]]);
});

test('the deduction is the decline in value where use is wholly taxable, and rounds half up', () => {
  const full = schedule({ cost: 150_000n, life: parseLife('5'), start: '2025-07-01', yearEnd: 2027, method: 'diminishing-value' });
  for (const line of full) assert.equal(line.deduction, line.decline);
  // Half of a 1 cent decline is half a cent, which rounds up.
  const [tiny] = schedule({ cost: 1n, life: parseLife('1'), start: '2025-07-01', yearEnd: 2026, method: 'prime-cost', use: 5_000n });
  assert.deepEqual([tiny.decline, tiny.deduction], [1n, 1n]);
  const [none] = schedule({ cost: 150_000n, life: parseLife('5'), start: '2025-07-01', yearEnd: 2026, method: 'prime-cost', use: 0n });
  assert.deepEqual([none.decline, none.deduction], [30_000n, 0n]);
});

test('part taxable use in a part first year rounds each deduction and leaves the values whole', () => {
  // $1,000 over 2 years from 1 January 2025 at 62.5% taxable use. Prime cost: $1,000 x 181 / 365 x 50%
  // = $247.95, of which 62.5% is $154.96875, so $154.97; then $500, of which $312.50.
  const at = (/** @type {import('../assets/depreciation-rates.mjs').Method} */ method) => schedule({
    cost: 100_000n, life: parseLife('2'), start: '2025-01-01', yearEnd: 2026, method, use: 6_250n,
  }).map((line) => [line.decline, line.deduction, line.closing]);
  assert.deepEqual(at('prime-cost'), [[24_795n, 15_497n, 75_205n], [50_000n, 31_250n, 25_205n]]);
  // Diminishing value at 100% a year: $495.89, of which $309.93125, so $309.93; then all of the $504.11
  // left, of which $315.06875, so $315.07.
  assert.deepEqual(at('diminishing-value'), [[49_589n, 30_993n, 50_411n], [50_411n, 31_507n, 0n]]);
});

/** Laura's photocopier from the guide, by each method, for 2 years. @param {bigint} use */
const photocopier = (use) => /** @type {const} */ (['prime-cost', 'diminishing-value']).map((method) => ({
  method,
  lines: schedule({ cost: 150_000n, life: parseLife('5'), start: '2025-07-01', yearEnd: 2027, method, use }),
}));

test('the schedule has the same columns on the page and in the CSV', () => {
  const [, dv] = photocopier(10_000n);
  assert.equal(scheduleCsv(scheduleColumns([dv], 10_000n)), [
    'Year ending 30 June,Days held,Opening value,Decline in value,Closing value',
    '2026,365,1500.00,600.00,900.00',
    '2027,365,900.00,360.00,540.00',
    '',
  ].join('\r\n'));
  const both = scheduleColumns(photocopier(5_000n), 5_000n);
  assert.deepEqual(both.map((column) => column.heading), [
    'Income year', 'Days held',
    'Prime cost: decline in value', 'Prime cost: deduction at 50% taxable use', 'Prime cost: closing value',
    'Diminishing value: decline in value', 'Diminishing value: deduction at 50% taxable use', 'Diminishing value: closing value',
  ]);
  assert.equal(scheduleCsv(both).split('\r\n')[1], '2026,365,300.00,150.00,1200.00,600.00,300.00,900.00');
  // A part per cent is written as typed, without trailing zeros.
  assert.equal(scheduleColumns(photocopier(6_250n), 6_250n)[3].heading, 'Prime cost: deduction at 62.5% taxable use');
});

test('a link holds the inputs as typed and gives them back', () => {
  const fields = { cost: ' $1,500 ', life: '6 2/3', start: '2025-07-01', year: '2026', method: 'both', use: '62.5' };
  const query = calculationQuery(fields);
  assert.equal(query, 'cost=%241%2C500&life=6+2%2F3&start=2025-07-01&year=2026&method=both&use=62.5');
  assert.deepEqual(readCalculation(new URLSearchParams(query)), { ...fields, cost: '$1,500' });
  // A search link is not a calculation.
  assert.equal(readCalculation(new URLSearchParams('q=laptop')), null);
  // An input the link leaves out is left out, so the form keeps its default or names it.
  assert.deepEqual(readCalculation(new URLSearchParams('cost=10&start=')), { cost: '10', start: '' });
  // What the form could not hold is refused, not cut short or replaced.
  assert.throws(() => readCalculation(new URLSearchParams('cost=10&method=straight-line')), /link/);
  assert.throws(() => readCalculation(new URLSearchParams(`cost=${'1'.repeat(21)}`)), /link/);
});

test('a citation names the row, the instrument by both numbers, the figures and the link', () => {
  const entry = entries.find((each) => each.asset === 'Photo copying machines');
  assert.ok(entry);
  const runs = photocopier(5_000n);
  const link = 'https://duguid.com.au/tools/depreciation-rates/?cost=1500#deduction';
  assert.equal(
    citation({ entry, source: data.source, life: '5', cost: 150_000n, start: '2025-07-01', use: 5_000n, runs, link }),
    'Effective life 5 years, last updated 1 January 2001: ‘Photo copying machines’ (Table B / Office machines and equipment),'
      + ' Schedule 2 to the Income Tax Assessment (Effective Life of Depreciating Assets) Determination 2025 (LI 2025/20, F2025L01097),'
      + ' read on 13 November 2026. LI 2025/20 commenced on 16 September 2025, after this start date:'
      + ' check the life in the determination in force at the time subsection 40-95(2) fixes.'
      + ' Cost $1,500.00, first used or installed ready for use on 1 July 2025.'
      + ' Prime cost: decline in value for 2026-27 $300.00, deduction at 50% taxable use $150.00.'
      + ' Diminishing value: decline in value for 2026-27 $360.00, deduction at 50% taxable use $180.00.'
      + ` Working: ${link}`,
  );
  // A start before the instrument commenced on 16 September 2025 is flagged in its place.
  const early = citation({ entry, source: data.source, life: '5', cost: 150_000n, start: '2025-09-15', use: 5_000n, runs, link });
  assert.ok(early.includes('read on 13 November 2026. LI 2025/20 commenced on 16 September 2025, after this start date:'
    + ' check the life in the determination in force at the time subsection 40-95(2) fixes. Cost'));
  // A later start can still follow an earlier contract, acquisition or start of construction, which subsection 40-95(2)(a) can make the time
  // that fixes the life, so the citation always says so.
  const later = citation({ entry, source: data.source, life: '5', cost: 150_000n, start: '2025-09-16', use: 5_000n, runs, link });
  assert.ok(later.includes('read on 13 November 2026. LI 2025/20 commenced on 16 September 2025: for an asset contracted for,'
    + ' acquired or started to be constructed before then, subsection 40-95(2) can fix the life in an earlier determination. Cost'));
  // A life typed in, or changed after a row filled it, is not credited to the instrument.
  const typed = citation({ entry: null, source: data.source, life: '4', cost: 150_000n, start: '2025-07-01', use: 10_000n, runs: runs.slice(1), link });
  assert.ok(typed.startsWith('Effective life 4 years, entered for this working and not taken from a row of the determination. Cost'));
  assert.ok(typed.includes('Diminishing value: decline in value for 2026-27 $360.00. Working:'));
  assert.ok(!typed.includes('Prime cost'));
});

test('the instrument the data names has its ATO citation and its commencement, the day after registration', () => {
  assert.deepEqual(INSTRUMENTS[data.source.register_id], { cited: 'LI 2025/20', commenced: '2025-09-16' });
  assert.equal(data.source.registered, '2025-09-15');
});

test('a link takes no longer value than the form field it fills', () => {
  const page = readFileSync(new URL('../tools/depreciation-rates/index.html', import.meta.url), 'utf8');
  for (const [name, longest] of LINK_FIELDS) {
    const field = new RegExp(`<input id="dep-${name}"[^>]*>`).exec(page)?.[0];
    if (!field) {
      assert.equal(name, 'method');
      continue;
    }
    // The date field holds YYYY-MM-DD and the year field a 4 figure year.
    assert.equal(String(longest), /maxlength="(\d+)"/.exec(field)?.[1] ?? { start: '10', year: '4' }[name], name);
  }
});

test('the page offers its data as a Dataset, a correction route and the feed', () => {
  const page = readFileSync(new URL('../tools/depreciation-rates/index.html', import.meta.url), 'utf8');
  const start = page.indexOf('<script type="application/ld+json">');
  const graph = JSON.parse(page.slice(page.indexOf('>', start) + 1, page.lastIndexOf('</script>')))['@graph'];
  const dataset = graph.find((/** @type {{'@type': string}} */ node) => node['@type'] === 'Dataset');
  assert.equal(dataset.distribution.contentUrl, 'https://duguid.com.au/tools/depreciation-rates/effective-life.json');
  assert.equal(dataset.distribution.encodingFormat, 'application/json');
  // The rows keep the source's licence and the file's own licence covers their arrangement.
  assert.deepEqual(dataset.license, [data.source.licence_url, data.licence_url]);
  assert.equal(dataset.creditText, data.source.attribution);
  assert.equal(dataset.isBasedOn, data.source.url);
  assert.ok(graph.some((/** @type {{'@type': string}} */ node) => node['@type'] === 'FAQPage'));
  assert.ok(page.includes('href="https://github.com/ryanduguid/ryanduguid.github.io/issues/new?template=content_correction.yml"'));
  assert.ok(page.includes('href="/feed.xml"'));
});
