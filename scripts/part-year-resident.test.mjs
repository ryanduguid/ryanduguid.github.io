// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The income tax page's part-year resident option (australian-accounting resident-tax with
// part_year_residency_months, and personal-tax-estimate for a part_year_resident).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { incomeTax, partYearLevy, partYearThreshold } from '../assets/income-tax.mjs';
import { taxEstimate } from '../assets/tax-estimate.mjs';

export const partYearFixture = createRequire(import.meta.url)('./part-year-resident-engine-differential.json');
const row = (result, label) => result.rows.find(([name]) => name === label)?.[1];
const partYear = (months, nonResidentDays = 0, eligiblePensioner = false) => ({ months, nonResidentDays, eligiblePensioner });

test('the part-year threshold is the ATO’s: John 3 months $14,648, Britney 6 months $15,832, one month kept exact', () => {
  assert.equal(partYearThreshold(3, false) / 12, 14648);
  assert.equal(partYearThreshold(6, false) / 12, 15832);
  assert.equal(partYearThreshold(12, false) / 12, 18200);
  assert.equal(partYearThreshold(1, true) / 12, 18200);
  assert.equal(incomeTax('20000', '2026-27', 'part-year', partYear(1)).threshold.toFixed(2), '13858.67');
  // (20,000 - 14,253.333...) x 16% = 919.4666..., to the cent.
  assert.equal(incomeTax('20000', '2025-26', 'part-year', partYear(2)).tax, 919.47);
  assert.equal(incomeTax('16000', '2026-27', 'part-year', partYear(8)).tax, 0);
  // Twelve months with no non-resident day is the full year.
  assert.deepEqual(incomeTax('50000', '2025-26', 'part-year', partYear(12)), { ...incomeTax('50000', '2025-26', 'resident'),
    threshold: 18200 });
});

test('the levy loses the non-resident days’ share, half a cent up', () => {
  assert.equal(partYearLevy(120000, 106, 365), 85151);
  assert.equal(partYearLevy(120000, 0, 365), 120000);
  // 1 cent over 2 of 3 days: 0.666... rounds up; 1 cent over 1 of 2 days: exactly half, up.
  assert.equal(partYearLevy(1, 1, 3), 1);
  assert.equal(partYearLevy(1, 1, 2), 1);
  assert.equal(partYearLevy(3, 2, 4), 2);
});

test('the part-year option refuses what it does not cover', () => {
  const run = (year, p, extra = {}) => () => taxEstimate({ year, residency: 'part-year', taxable: '60000', fringe: '0', super: '0',
    losses: '0', foreign: '0', studyLoan: false, uncoveredDays: '365', spouse: null, children: '0', withheld: '0', partYear: p, ...extra });
  assert.throws(run('2023-24', partYear(3)), /covers 2024-25 to 2026-27/);
  assert.throws(run('2025-26', partYear(0)), /from 1 to 12/);
  assert.throws(run('2025-26', partYear(13)), /from 1 to 12/);
  assert.throws(run('2025-26', partYear(3, 363)), /from 0 to 362/);
  assert.doesNotThrow(run('2025-26', partYear(3, 362)));
  assert.throws(run('2025-26', undefined), /months/);
  assert.throws(run('2025-26', partYear(3), { studyLoan: true }), /full-year resident only/);
  // Days without cover leave a part-year resident's surcharge at nil, as personal-tax-estimate leaves it out.
  assert.equal(run('2025-26', { ...partYear(3), nonResidentDays: 200 }, { taxable: '200000' })().surcharge, 0);
});

// australian-tax-calculators at the commit the fixture's engine line names.
test('the part-year option agrees with the australian-accounting commands on every differential case', () => {
  const { cases } = partYearFixture;
  assert.ok(cases.length > 300);
  assert.ok(cases.filter((c) => c.refused).length > 10);
  for (const { source, command, call, amounts, refused } of cases) {
    const p = partYear(call.part_year_residency_months, call['medicare-levy']?.non_resident_days ?? 0, call.eligible_pensioner);
    const work = () => (command === 'resident-tax' ? incomeTax(call.taxable_income, call.year, 'part-year', p)
      : taxEstimate({ year: call.year, residency: 'part-year', taxable: call.taxable_income, fringe: '0', super: '0', losses: '0',
        foreign: '0', studyLoan: false, uncoveredDays: '0', spouse: null, children: '0', withheld: call.tax_withheld ?? '0', partYear: p }));
    if (refused) {
      assert.throws(work, Error, `${source}: the engine refused, ${refused}`);
      continue;
    }
    const r = work();
    const ours = command === 'resident-tax'
      ? { tax_free_threshold: r.threshold, basic_income_tax: r.tax }
      : { basic_income_tax: r.tax, low_income_tax_offset_applied: r.offset, medicare_levy: r.medicare,
        total_before_credits: r.assessed, medicare_levy_surcharge: r.surcharge };
    const theirs = Object.fromEntries(Object.entries(amounts).filter(([key]) => Object.hasOwn(ours, key)));
    assert.deepEqual(Object.fromEntries(Object.entries(ours).map(([k, v]) => [k, Number(v).toFixed(2)])), theirs, source);
  }
});

/** The page's form tests; individual-tax.test.mjs runs them with its form reader.
 * @param {(fields?: object) => any} incomeTaxPage @param {string} html the income tax include */
export const partYearFormTests = (incomeTaxPage, html) => {
  test('the income tax page works a part-year resident and states its differential count', () => {
    // personal-tax-estimate's case: resident from 15 October 2025, 9 months, 106 days not.
    const r = incomeTaxPage({ year: '2025-26', residency: 'part-year', income: '60000', fringe: '0', uncovered: '365', withheld: '0',
      'part-year-months': '9', 'non-resident-days': '106' });
    assert.equal(row(r, 'Tax-free threshold'), '$17,016.00');
    assert.equal(row(r, 'Tax on taxable income'), '$8,977.44');
    assert.equal(row(r, 'Low income tax offset'), '$100.00');
    assert.equal(row(r, 'Medicare levy'), '$851.51');
    assert.equal(row(r, 'Medicare levy surcharge'), '$0.00');
    assert.equal(row(r, 'Total tax, levies and repayment'), '$9,728.95');
    assert.match(r.inputs, /Australian resident for part of the year.*9 months as a resident and 106 days not, not an eligible pensioner/);
    assert.match(r.note, /^The Medicare levy surcharge is not worked out for a part-year resident/);
    const full = incomeTaxPage({ year: '2025-26', income: '60000', fringe: '0', uncovered: '0', withheld: '0' });
    assert.equal(row(full, 'Tax-free threshold'), undefined);
    assert.throws(() => incomeTaxPage({ residency: 'part-year', phi: 'yes' }), /part-year resident/);
    // An eligible pensioner keeps the full $18,200 threshold (the first test above).
    const pensioner = incomeTaxPage({ year: '2025-26', residency: 'part-year', income: '60000', fringe: '0', uncovered: '365', withheld: '0',
      'part-year-months': '9', 'non-resident-days': '106', 'eligible-pensioner': 'yes' });
    assert.equal(row(pensioner, 'Tax-free threshold'), '$18,200.00');
    assert.match(pensioner.inputs, /9 months as a resident and 106 days not, an eligible pensioner/);
    assert.throws(() => incomeTax('20000', '2025-26', 'part-year', { months: 6, nonResidentDays: 0 }), /eligible pensioner/);
    assert.ok(html.includes(`personal-tax-estimate on ${partYearFixture.cases.length} part-year cases`));
  });
};
