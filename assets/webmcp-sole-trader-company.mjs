// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for the sole trader against company calculator. Imported by
// assets/webmcp-business-e.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

/** @param {ToolKit} kit @param {BusinessCalculators['soleTraderCompany']} soleTraderCompany
 * @param {readonly string[]} years */
export function soleTraderCompanyTool(kit, soleTraderCompany, years) {
  const { text, choice, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_sole_trader_vs_company',
    title: 'Sole trader against company calculator',
    description: 'Compare the total Australian tax on one business profit for 2021-22 to 2026-27 in AUD as a resident sole '
      + 'trader (resident rates, low income tax offsets, the small business income tax offset of 16% up to $1,000 under '
      + 'ITAA 1997 s 328-360, Medicare levy) and through a company (a salary with super guarantee, company tax at 25% for '
      + 'a base rate entity or 30%, the rest of the amount taken out as a fully franked dividend with the owner\'s top-up '
      + 'tax, the remainder retained, 15% contributions tax and Division 293 tax). States figures only and recommends no '
      + 'structure. Assumes no other income, private hospital cover and no study loan; leaves out PSI rules, Division 7A, '
      + 'CGT concessions, state taxes, the cost of running a company and the later tax on retained profit.',
    inputSchema: record({
      incomeYear: choice([...years].reverse(), `Income year from ${years.at(-1)} to ${years[0]}.`),
      businessProfit: text('cost', 'Business taxable profit before anything is paid to the owner, in AUD.'),
      amountTakenOut: text('cost', 'Amount the owner takes out in the year in AUD: under a company, the salary plus the dividend.'),
      salary: text('cost', 'Salary the company pays the owner in AUD; businessProfit must also cover its super guarantee.'),
      baseRateEntity: { type: 'boolean', description: 'true when the company is a base rate entity this year and last year (25% tax and franking); false for 30%.' },
      smallBusinessOffset: { type: 'boolean', description: 'true when the sole trader\'s aggregated turnover is under $5 million, so the small business income tax offset applies.' },
    }, ['incomeYear', 'businessProfit', 'amountTakenOut', 'salary', 'baseRateEntity', 'smallBusinessOffset']),
    run({ incomeYear, businessProfit, amountTakenOut, salary, baseRateEntity, smallBusinessOffset }) {
      const r = soleTraderCompany({ year: incomeYear, profit: businessProfit, takenOut: amountTakenOut, salary,
        baseRate: baseRateEntity, offset: smallBusinessOffset });
      return {
        incomeYear,
        soleTrader: {
          taxableIncome: dollars(r.soleTaxable),
          incomeTax: dollars(r.soleTax),
          lowIncomeOffsets: dollars(r.soleOffsets),
          smallBusinessIncomeTaxOffset: dollars(r.smallBusinessOffset),
          medicareLevy: dollars(r.soleMedicare),
          totalTax: dollars(r.soleTotal),
          profitAfterTax: dollars(r.soleKept),
        },
        company: {
          companyTaxRatePercent: r.companyRate,
          superGuarantee: dollars(r.superGuarantee),
          companyTaxableIncome: dollars(r.companyTaxable),
          companyTax: dollars(r.companyTax),
          dividend: dollars(r.dividend),
          frankingCredit: dollars(r.credit),
          retainedAfterTax: dollars(r.retained),
          ownerTaxableIncome: dollars(r.ownerTaxable),
          ownerTaxOnSalary: dollars(r.salaryTax),
          topUpTaxOnDividend: dollars(r.topUp),
          superTax: dollars(r.superTax),
          division293Tax: dollars(r.division293),
          totalTax: dollars(r.companyTotal),
          ownerCashAfterTax: dollars(r.cash),
          superAfterTax: dollars(r.superKept),
        },
        companyLessSoleTraderTax: dollars(r.difference),
        currency: 'AUD',
        source: `${CALCULATORS}sole-trader-company/`,
      };
    },
  });
}
