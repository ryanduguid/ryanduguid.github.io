// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for the contractor against employee calculator. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

/** @param {ToolKit} kit @param {readonly string[]} years */
function schema(kit, years) {
  const { text, choice, record } = kit;
  /** @param {string} description */
  const flag = (description) => ({ type: /** @type {const} */ ('boolean'), description });
  return record({
    incomeYear: choice([...years], `Income year, ${years.at(-1)} to ${years[0]}.`),
    hoursPerWeek: text('percent', 'Hours worked each week, more than 0 and at most 168, at most 2 decimal places.'),
    salary: text('amount', 'Employee salary a year for those hours, including paid leave, in AUD.'),
    annualLeaveWeeks: text('percent', 'Weeks of paid annual leave a year as the award, agreement or contract gives; "4" when omitted.'),
    leaveLoadingPercent: text('rate', 'Leave loading on annual leave in per cent as stated; "0" when omitted. No award rate is assumed.'),
    leaveLoadingIsOrdinaryTimeEarnings: flag('false when the loading stands for lost overtime; true when omitted.'),
    otherLeaveWeeks: text('percent', 'Weeks of other paid leave taken (personal leave, public holidays); "0" when omitted.'),
    payrollTaxPercent: text('rate', 'Payroll tax rate on these wages in per cent, 0 below the threshold; "0" when omitted.'),
    payrollTaxIncludesSuper: flag('true (default) when payroll tax counts super as wages.'),
    workersCompensationPercent: text('rate', 'Workers compensation premium rate on these wages in per cent; "0" when omitted.'),
    workersCompensationIncludesSuper: flag('true when the premium counts super as wages; false when omitted.'),
    contractorHourlyRate: text('amount', 'Contractor rate an hour excluding GST, in AUD.'),
    nonLabourPart: text('amount', 'Part of the year\'s fee for something other than labour, such as equipment or materials, in AUD; "0" when omitted.'),
    contractorExpenses: text('amount', 'Contractor\'s deductible business expenses a year excluding GST, in AUD; "0" when omitted.'),
    contractorOwnSuper: text('amount', 'Contractor\'s own super contributions claimed as a deduction, in AUD; "0" when omitted.'),
    gstRegistered: flag('true (default) when the contractor is registered for GST.'),
    fullGstCredit: flag('true (default) when the business claims the GST back in full.'),
    contractWithIndividual: flag('true (default) when the contract is with the person as an individual, not their company, trust or partnership.'),
    rightToDelegate: flag('true when the contract gives a right to delegate, subcontract or assign the work; false when omitted.'),
    contractForResult: flag('true when the contract is to produce a result and pays for that result; false when omitted.'),
    contractorInPayrollTax: flag('true when the payments are wages for payroll tax under a relevant contract rule; false when omitted.'),
    contractorInWorkersCompensation: flag('true when the contractor is a worker for workers compensation; false when omitted.'),
    smallBusinessOffset: flag('true when the contractor qualifies for the small business income tax offset; false when omitted.'),
    hospitalCover: flag('true (default) when the person had private patient hospital cover all year.'),
    studyLoan: flag('true when the person has a study or training loan; false when omitted.'),
  }, ['incomeYear', 'hoursPerWeek', 'salary', 'contractorHourlyRate']);
}

/** @param {ToolKit} kit @param {Pick<BusinessCalculators, 'contractorEmployee' | 'CONTRACTOR_YEARS'>} calculate */
export function contractorEmployeeTool(kit, calculate) {
  const { tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_contractor_employee',
    title: 'Contractor against employee calculator',
    description: 'The same person for the same hours as an employee or a contractor, in AUD for one income year from 2021-22 '
      + 'to 2026-27: each side\'s cost to the business (salary, stated leave loading, super guarantee, stated payroll tax '
      + 'and workers compensation rates, unclaimable GST) and take-home pay for a resident with no other income. The '
      + 'super guarantee is owed on a contractor\'s labour part under SGAA 1992 s 12(3) when the contract is with the '
      + 'person as an individual, has no right to delegate, is not for a result and labour is more than half the fee, a '
      + 'screen, not a decision. Payroll tax and workers compensation on a contractor use the labour part, a simplification. '
      + 'It does not decide whether the person is an employee and holds no award rates.',
    inputSchema: schema(kit, calculate.CONTRACTOR_YEARS),
    run(input) {
      const r = calculate.contractorEmployee({
        year: input.incomeYear, hours: input.hoursPerWeek, salary: input.salary, annualLeave: input.annualLeaveWeeks ?? '4',
        otherLeave: input.otherLeaveWeeks ?? '0', loading: input.leaveLoadingPercent ?? '0',
        loadingQualifying: input.leaveLoadingIsOrdinaryTimeEarnings ?? true, payrollRate: input.payrollTaxPercent ?? '0',
        payrollSuper: input.payrollTaxIncludesSuper ?? true, wcRate: input.workersCompensationPercent ?? '0',
        wcSuper: input.workersCompensationIncludesSuper ?? false, rate: input.contractorHourlyRate,
        nonLabour: input.nonLabourPart ?? '0', expenses: input.contractorExpenses ?? '0', ownSuper: input.contractorOwnSuper ?? '0',
        gst: input.gstRegistered ?? true, credits: input.fullGstCredit ?? true, individual: input.contractWithIndividual ?? true,
        delegate: input.rightToDelegate ?? false, result: input.contractForResult ?? false,
        contractorPayroll: input.contractorInPayrollTax ?? false, contractorWc: input.contractorInWorkersCompensation ?? false,
        smallBusinessOffset: input.smallBusinessOffset ?? false, hospitalCover: input.hospitalCover ?? true,
        studyLoan: input.studyLoan ?? false,
      });
      return {
        incomeYear: r.year, superGuaranteeRatePercent: r.sgRate, hoursWorked: r.hoursWorked, weeksWorked: r.weeksWorked,
        section12_3Applies: r.section12, section12_3Elements: r.elements, labourSharePercent: r.labourShare,
        employee: { salary: dollars(r.salary), leaveLoading: dollars(r.loading), superGuarantee: dollars(r.employeeSuperGuarantee),
          payrollTax: dollars(r.employeePayrollTax), workersCompensation: dollars(r.employeeWorkersCompensation),
          cost: dollars(r.employeeCost), costPerHour: dollars(r.employeeCostPerHour), taxAndLevies: dollars(r.employeeTax),
          takeHome: dollars(r.employeeTakeHome) },
        contractor: { fee: dollars(r.fee), labourPart: dollars(r.labour), gst: dollars(r.gst), unclaimableGst: dollars(r.gstCost),
          superGuarantee: dollars(r.contractorSuperGuarantee), payrollTax: dollars(r.contractorPayrollTax),
          workersCompensation: dollars(r.contractorWorkersCompensation), cost: dollars(r.contractorCost),
          costPerHour: dollars(r.contractorCostPerHour), profit: dollars(r.profit), taxAndLevies: dollars(r.contractorTax),
          smallBusinessOffset: dollars(r.smallBusinessOffset), takeHome: dollars(r.contractorTakeHome), super: dollars(r.contractorSuper),
          gstThresholdReached: r.gstThresholdReached },
        costDifference: dollars(r.costDifference), takeHomeDifference: dollars(r.takeHomeDifference),
        currency: 'AUD', source: `${CALCULATORS}contractor-employee/`,
      };
    },
  });
}
