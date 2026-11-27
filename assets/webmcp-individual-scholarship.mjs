// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for the scholarship exemption check. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {{SCHOLARSHIP_YEARS: string[], PAYMENT_TYPES: string[], COMMONWEALTH_PAYMENTS: string[],
 *   scholarshipExemption: typeof import('./scholarship-exemption.mjs').scholarshipExemption}} ScholarshipEngine */

/** @param {string} description */
const yes = (description) => ({ type: /** @type {const} */ ('boolean'), description });

/** @param {ToolKit} kit @param {ScholarshipEngine} engine */
export function scholarshipTool(kit, { SCHOLARSHIP_YEARS, PAYMENT_TYPES, COMMONWEALTH_PAYMENTS, scholarshipExemption }) {
  const { choice, record, tool, INDIVIDUAL } = kit;
  const years = `${SCHOLARSHIP_YEARS[0]} to ${SCHOLARSHIP_YEARS.at(-1)}`;
  return tool({
    name: 'check_scholarship_exemption',
    title: 'Scholarship exemption check',
    description: `Checks whether a scholarship, bursary, educational allowance or educational assistance for ${years} is exempt `
      + 'income under ITAA 1997 s 51-10 item 2.1A: paid to a full-time student, not on a condition of employment or of a labour '
      + 'contract with the payer (s 51-35(c) and (d)), and principally for educational purposes (s 51-35(e)). Refuses the '
      + 'Commonwealth payments s 51-35(a), (b) and (f) exclude and friendly society scholarship plans. Works no amounts.',
    inputSchema: record({
      incomeYear: choice(SCHOLARSHIP_YEARS, `Income year, ${years}.`),
      paymentType: choice(PAYMENT_TYPES, 'The payment item 2.1A covers.'),
      fullTimeStudent: yes('Paid to a full-time student at a school, college or university.'),
      employmentCondition: yes('Paid on condition that the student becomes or stays the payer’s employee.'),
      labourContractCondition: yes('Paid on condition of a contract wholly or principally for the student’s labour.'),
      principallyEducational: yes('Provided principally for educational purposes.'),
      commonwealthPayment: choice(COMMONWEALTH_PAYMENTS, 'none, or the Commonwealth payment it is (refused).'),
      friendlySocietyPlan: yes('Paid under a friendly society scholarship plan (refused).'),
    }, ['incomeYear', 'paymentType', 'fullTimeStudent', 'employmentCondition', 'labourContractCondition', 'principallyEducational']),
    run({ incomeYear, paymentType, fullTimeStudent, employmentCondition, labourContractCondition, principallyEducational,
      commonwealthPayment = 'none', friendlySocietyPlan = false }) {
      const r = scholarshipExemption({ year: incomeYear, scope_confirmed: true, payment_type: paymentType, full_time_student: fullTimeStudent,
        employment_condition: employmentCondition, labour_contract_condition: labourContractCondition,
        principally_educational: principallyEducational, commonwealth_payment: commonwealthPayment, friendly_society_plan: friendlySocietyPlan });
      return { incomeYear: r.period, paymentType: r.payment_type, exempt: r.exempt, conditionsNotMet: r.conditions_not_met,
        source: `${INDIVIDUAL}scholarship-exemption/` };
    },
  });
}
