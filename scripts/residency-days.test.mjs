// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The 183-day residency day count against ITAA 1936 s 6(1) resident (a)(ii) (compilation 193), TR 2023/1
// paragraphs 83 to 87 and footnote 51 (read 26 November 2026), and the `residency-tests` command of
// ryanduguid/australian-accounting on every case of its differential fixture.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { RESIDENCY_YEARS, residencyDays, residencyDaysResult, residencyFormPresence, residencyTests } from '../assets/residency-days.mjs';

const fixture = createRequire(import.meta.url)('./residency-days-engine-differential.json');
// Every runner (check_site, mutation-check and `node --test scripts/`) starts in the site's root.
const page = readFileSync('_includes/calculators/residency-days.html', 'utf8');
const code = (run) => {
  try {
    run();
  } catch (error) {
    return error.code;
  }
  return 'computed';
};
/** A form's value reader over the given fields. */
const ask = (fields) => (name) => new Map(Object.entries(fields)).get(name) ?? '';
const span = (from, to) => ({ from, to });
const count = (year, ...spans) => residencyDays(year, spans, false, false).tests.days_in_australia;

test('the page agrees with the australian-accounting command on every differential case', () => {
  for (const c of fixture.cases) {
    let got;
    try {
      const r = residencyTests(c.call);
      got = { resident: r.resident, met_by: r.met_by, income_year: r.income_year, tests: r.tests };
    } catch (error) {
      if (!error.code) throw error;
      got = { refused: error.code };
    }
    const want = c.refused ? { refused: c.refused }
      : { resident: c.resident, met_by: c.met_by, income_year: c.income_year, tests: c.tests };
    assert.deepEqual(got, want, c.source);
  }
  assert.equal(fixture.cases.length, 667);
  assert.ok(page.includes('agrees with the command on 667 test cases'));
});

test('the count adds distinct days in the income year, part days whole, and needs more than one-half', () => {
  // Paragraph 86: continuous or intermittent, added together; arrival and departure days both count.
  assert.equal(count('2025-26', span('2025-07-01', '2025-07-01')), 1);
  assert.equal(count('2025-26', span('2025-07-01', '2025-09-30'), span('2025-11-15', '2026-03-31')), 229);
  // Overlaps count once; days before 1 July or after 30 June do not count (paragraph 87).
  assert.equal(count('2025-26', span('2025-01-01', '2025-07-10'), span('2025-07-05', '2025-07-12')), 12);
  assert.equal(count('2025-26', span('2026-07-01', '2026-12-31')), 0);
  assert.equal(count('2025-26', span('2020-01-01', '2030-01-01')), 365);
  // More than one-half: 183 of 365, 184 of 366 (footnote 51; 2023-24 includes 29 February 2024).
  const needed = RESIDENCY_YEARS.map((y) => residencyDays(y, [], false, false).tests.days_needed);
  assert.deepEqual(needed, [183, 183, 183, 184, 183, 183, 183]);
  assert.equal(residencyDays('2025-26', [span('2025-07-01', '2025-12-30')], false, false).tests.days_183, true);
  assert.equal(residencyDays('2025-26', [span('2025-07-01', '2025-12-29')], false, false).tests.days_183, false);
  assert.equal(residencyDays('2023-24', [span('2023-07-01', '2023-12-30')], false, false).tests.days_183, false);
  // The exception needs both facts: abode outside and no intention to take up residence.
  const stay = [span('2025-08-01', '2026-04-30')];
  assert.deepEqual([[true, false], [true, true], [false, false], [false, true]].map(([u, i]) => residencyDays('2025-26', stay, u, i).tests.days_183),
    [false, true, true, true]);
  assert.equal(code(() => residencyDays('2025-26', [span('2026-01-02', '2026-01-01')], false, false)), 'residency_tests.presence_invalid');
  assert.equal(code(() => residencyDays('2025-26', [span('2026-02-29', '2026-03-01')], false, false)), 'residency_tests.presence_invalid');
  assert.equal(code(() => residencyDays('2027-28', [], false, false)), 'period.unsupported');
  assert.equal(code(() => residencyDays('2025-26', [], false, false, false)), 'scope.not_confirmed');
});

test('the form fills a blank arrival or departure from the year and shows only the 183-day test', () => {
  const fields = { year: '2025-26', 'arrived-1': '', 'departed-1': '2025-08-31', 'arrived-2': '2026-06-01', 'departed-2': '',
    'usual-abode-outside': 'no', 'intends-residence': 'no' };
  assert.deepEqual(residencyFormPresence(ask(fields)), [span('2025-07-01', '2025-08-31'), span('2026-06-01', '2026-06-30')]);
  const shown = residencyDaysResult(ask(fields));
  assert.deepEqual(shown.rows[0], ['Days in Australia in the income year', '92 of 365']);
  assert.deepEqual(shown.rows[shown.principal], ['183-day test', 'Not met']);
  assert.ok(!JSON.stringify(shown).includes('resident:'));
  const years = [...page.matchAll(/name="year" value="([^"]+)"/g)].map(([, y]) => y);
  assert.deepEqual(years, [...RESIDENCY_YEARS].reverse());
  assert.throws(() => residencyDaysResult(ask({ year: '2025-26' })), { code: 'residency_tests.presence_empty' });
  assert.throws(() => residencyDaysResult(ask({ year: '2025-26', 'arrived-1': '2026-01-02', 'departed-1': '2026-01-01' })),
    { message: 'Period 1 leaves before it arrives: enter the departure on or after the arrival.' });
  const visitor = residencyDaysResult(ask({ year: '2025-26', 'arrived-1': '2025-08-01', 'departed-1': '2026-04-30',
    'usual-abode-outside': 'yes', 'intends-residence': 'no' }));
  assert.deepEqual(visitor.rows.map(([, v]) => v), ['273 of 365', '183 days or more', 'Yes, as you answered', 'Not met']);
  // The page names the other 3 tests and leaves them to the reader.
  for (const words of ['ordinary concepts', 'domicile', 'Commonwealth superannuation', 'TR 2023/1', 'does not decide whether you are an Australian resident']) {
    assert.ok(page.includes(words), words);
  }
});
