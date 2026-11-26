// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The boundary-case readers for the defined benefit income cap, foreign pension, scholarship and
// crystallisation pages (merged into scripts/individual-tax.test.mjs), and their parity test against
// the australian-accounting command on every case of each page's differential fixture.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dbIncomeCapFormInput, definedBenefitIncomeCap } from '../assets/defined-benefit-income-cap.mjs';
import { foreignPensionFormInput, foreignPensionUpp } from '../assets/foreign-pension-upp.mjs';
import { scholarshipExemption, scholarshipFormInput } from '../assets/scholarship-exemption.mjs';
import { crystallisationFormInput, superCrystallisation } from '../assets/super-crystallisation.mjs';

const dollars = (/** @type {string} */ value) => `$${Number(value).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const reader = (/** @type {Record<string, string>} */ f) => (/** @type {string} */ name) => f[name] ?? ''; // eslint-disable-line security/detect-object-injection -- a form's own field names

/** @type {Record<string, (...call: any[]) => unknown>} */
export const ENGINES = {
  dbIncomeCapCases: (c) => definedBenefitIncomeCap(c).amounts,
  foreignPensionCases: (c) => foreignPensionUpp(c).amounts,
  scholarshipCases: (c) => {
    const r = scholarshipExemption(c);
    return { exempt: r.exempt, conditions_not_met: r.conditions_not_met };
  },
  crystallisationCases: (c) => superCrystallisation(c).amounts,
};

/** @type {Record<string, (...call: any[]) => string>} */
export const INPUTS = {
  dbIncomeCapCases: (c) => `${c.year}, tax free and taxed ${dollars(c.tax_free_and_taxed)}, untaxed ${dollars(c.untaxed)}, `
    + `other ${dollars(c.other_defined_benefit_income)}${c.first_day ? `, first day ${c.first_day}` : ''}`,
  foreignPensionCases: (c) => `${c.year}, ${c.method.replaceAll('_', ' ')}, received ${dollars(c.annuity_derived)}`
    + (c.method === 'formula' ? `, price ${dollars(c.undeducted_purchase_price)}, residual ${dollars(c.residual_capital_value)}, `
      + `relevant number ${c.relevant_number.years}${c.total_annuity_derived ? `, whole annuity ${dollars(c.total_annuity_derived)}` : ''}` : '')
    + (c.uk_category ? `, category ${c.uk_category}` : ''),
  scholarshipCases: (c) => `${c.year}, ${c.payment_type.replaceAll('_', ' ')}${c.full_time_student ? '' : ', not full-time'}`
    + `${c.employment_condition ? ', employment condition' : ''}${c.labour_contract_condition ? ', labour contract condition' : ''}`
    + `${c.principally_educational ? '' : ', not principally educational'}`,
  crystallisationCases: (c) => `service from ${c.eligible_service_start}, value ${dollars(c.interest_value)}, undeducted ${dollars(c.undeducted_contributions)}`
    + `${c.concessional_component === '0' ? '' : `, concessional ${dollars(c.concessional_component)}`}`
    + `${c.cgt_exempt_component === '0' ? '' : `, CGT exempt ${dollars(c.cgt_exempt_component)}`}`,
};

/** @type {Record<string, (r: any) => string>} */
export const OUTPUTS = {
  dbIncomeCapCases: (r) => `Cap ${dollars(r.defined_benefit_income_cap)}, assessable ${dollars(r.assessable_income)}, offset ${dollars(r.untaxed_offset)}`,
  foreignPensionCases: (r) => `Deductible ${dollars(r.deductible_amount)}, assessable ${dollars(r.assessable_amount)}`,
  scholarshipCases: (r) => (r.exempt ? 'Exempt' : `Not exempt: ${r.conditions_not_met.join(', ').replaceAll('_', ' ')}`),
  crystallisationCases: (r) => `Pre-July 83 ${dollars(r.pre_july_83_component)}, segment ${dollars(r.crystallised_segment)}`,
};

/** @type {Record<string, (f: Record<string, string>) => unknown[]>} */
export const FORM_CALLS = {
  dbIncomeCapCases: (f) => [dbIncomeCapFormInput(reader(f))],
  foreignPensionCases: (f) => [foreignPensionFormInput(reader(f))],
  scholarshipCases: (f) => [scholarshipFormInput(reader(f))],
  crystallisationCases: (f) => [crystallisationFormInput(reader(f))],
};

/**
 * The page agrees with its command on every case of its differential fixture.
 * @param {string} slug @param {number} count @param {(call: unknown) => Record<string, unknown>} run @param {string[]} keys
 */
export function parityTest(slug, count, run, keys) {
  test(`the ${slug} page agrees with the australian-accounting command on every differential case`, () => {
    const fixture = JSON.parse(readFileSync(new URL(`./${slug}-engine-differential.json`, import.meta.url), 'utf8'));
    const page = readFileSync(new URL(`../_includes/calculators/${slug}.html`, import.meta.url), 'utf8');
    for (const c of fixture.cases) {
      let got;
      try {
        const r = run(c.call);
        got = Object.fromEntries(keys.map((k) => [k, r[k]])); // eslint-disable-line security/detect-object-injection -- the fixture's fixed result keys
      } catch (error) {
        if (!(/** @type {{code?: string}} */ (error).code)) throw error;
        got = { refused: /** @type {{code: string}} */ (error).code };
      }
      const want = c.refused ? { refused: c.refused } : Object.fromEntries(keys.map((k) => [k, c[k]])); // eslint-disable-line security/detect-object-injection -- the fixture's fixed result keys
      assert.deepEqual(got, want, c.source);
    }
    assert.equal(fixture.cases.length, count);
    assert.ok(page.includes(`agrees with the command on ${count} test cases`));
  });
}
