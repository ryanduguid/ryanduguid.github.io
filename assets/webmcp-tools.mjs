// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { POSITIVE_FRACTION } from './money.mjs';

// WebMCP tool descriptors for the site's calculators. Each tool calls the same module
// function as its page's form, reads nothing from the form and sends nothing anywhere.
// https://webmachinelearning.github.io/webmcp/
//
// Every input is held to its tool's own inputSchema before a calculator runs: a value of
// the wrong type, outside its pattern, range or list, or under a name the schema does not
// declare is refused, never converted or dropped.

/** The patterns string inputs must match. A schema carries each one as its `source`. */
const PATTERNS = {
  fraction: POSITIVE_FRACTION,
  amount: /^\d{1,9}(?:\.\d{1,2})?$/,
  percent: /^\d{1,3}(?:\.\d{1,2})?$/,
  rate: /^\d{1,3}(?:\.\d{1,4})?$/,
  cost: /^\d{1,10}(?:\.\d{1,2})?$/,
  life: /^(?:\d{1,3}(?:\.\d{1,4})?|(?:\d{1,3} )?\d{1,2}\/\d{1,2})$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  month: /^\d{4}-(?:0[1-9]|1[0-2])$/,
  share: /^(?:0(?:\.\d{1,12})?|1(?:\.0{1,12})?)$/,
  quantity: /^\d{1,12}(?:\.\d{1,4})?$/,
  consumption: /^\d{1,3}(?:\.\d{1,6})?$/,
};

/**
 * @typedef {{type: 'string' | 'boolean' | 'integer' | 'array' | 'object', description?: string,
 *   pattern?: string, enum?: string[], minimum?: number, maximum?: number, maxItems?: number,
 *   items?: Schema, properties?: Record<string, Schema>, required?: string[],
 *   additionalProperties?: false}} Schema
 */

/** @param {keyof typeof PATTERNS} kind @param {string} description @returns {Schema} */
const text = (kind, description) => ({ type: 'string', pattern: PATTERNS[kind].source, description });

/** @param {string[]} values @param {string} description @returns {Schema} */
const choice = (values, description) => ({ type: 'string', enum: values, description });

/** @param {number} minimum @param {number} maximum @param {string} description @returns {Schema} */
const whole = (minimum, maximum, description) => ({ type: 'integer', minimum, maximum, description });

/** @param {Record<string, Schema>} properties @param {string[]} required @returns {Schema} */
const record = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });

/**
 * The value, once it matches the schema; otherwise an error naming the input.
 * @param {unknown} value @param {Schema} schema @param {string} name @returns {any}
 */
function checked(value, schema, name) {
  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${name} must be an object.`);
    const properties = schema.properties ?? {};
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(properties, key)) throw new Error(`${key} is not an input of this tool.`);
    }
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) throw new Error(`${key} is required.`);
    }
    for (const [key, item] of Object.entries(value)) checked(item, properties[key], key);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > (schema.maxItems ?? 0)) {
      throw new Error(`${name} must be a list of at most ${schema.maxItems} items.`);
    }
    for (const item of value) checked(item, /** @type {Schema} */ (schema.items), name);
  } else if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`${name} must be true or false.`);
  } else if (schema.type === 'integer') {
    const [low, high] = [schema.minimum ?? 0, schema.maximum ?? 0];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < low || value > high) {
      throw new Error(`${name} must be a whole number from ${low} to ${high}.`);
    }
  } else {
    const pattern = Object.values(PATTERNS).find((regex) => regex.source === schema.pattern);
    if (typeof value !== 'string' || (pattern && !pattern.test(value)) || (schema.enum && !schema.enum.includes(value))) {
      throw new Error(`${name} does not match its description: ${schema.description}`);
    }
  }
  return value;
}

/**
 * A read-only tool whose calculation runs only on input its schema accepts. Its description
 * ends by saying the result is general information.
 * @param {{name: string, title: string, description: string, inputSchema: Schema,
 *   run: (input: Record<string, any>) => Record<string, unknown>}} spec
 */
function tool({ name, title, description, inputSchema, run }) {
  return {
    name, title, description: `${description} General information only, not advice.`, inputSchema,
    annotations: { readOnlyHint: true },
    /** @param {unknown} [input] */
    async execute(input = {}) {
      return run(checked(input, inputSchema, 'input'));
    },
  };
}

/** Dollars to 2 decimal places. @param {number} value */
const dollars = (value) => value.toFixed(2);
const CALCULATORS = 'https://duguid.com.au/tools/business-calculators/';

/** @param {typeof import('./business-calculators.mjs').gst} gst */
const gstTool = (gst) => tool({
  name: 'calculate_gst',
  title: 'GST calculator',
  description: 'Split an Australian dollar amount for a wholly taxable supply into its GST-exclusive amount, '
    + 'GST at 10% and GST-inclusive amount, rounded once to cents. Planning estimate only: it does not decide '
    + 'whether a supply is taxable, GST-free or input taxed.',
  inputSchema: record({
    amount: text('amount', 'Amount in AUD with at most 2 decimal places, for example "1100.00".'),
    inclusive: { type: 'boolean', description: 'true when the amount already includes GST; false or omitted when it excludes GST.' },
  }, ['amount']),
  run({ amount, inclusive = false }) {
    const r = gst(amount, inclusive);
    return {
      excludingGst: dollars(r.net), gst: dollars(r.gst), includingGst: dollars(r.gross), currency: 'AUD',
      basis: '10% GST on a wholly taxable supply, rounded once to cents. Confirm tax treatment separately.',
      source: `${CALCULATORS}gst/`,
    };
  },
});

/** @param {typeof import('./business-calculators.mjs').div7aMinimumRepayment} minimumRepayment */
const div7aTool = (minimumRepayment) => tool({
  name: 'calculate_div7a_minimum_repayment',
  title: 'Division 7A minimum yearly repayment calculator',
  description: 'Minimum yearly repayment in AUD of one amalgamated Division 7A loan for an income year, under subsection '
    + '109E(6) of the Income Tax Assessment Act 1936, with its interest and principal parts if repaid on the '
    + 'last day of the year, each rounded half up to the cent. Supply the benchmark interest rate for the income '
    + 'year: 8.77 for 2026-27 (https://duguid.com.au/rates/div7a-benchmark-rate/). It does not decide whether a '
    + 'loan is a Division 7A loan or whether its agreement complies.',
  inputSchema: record({
    balance: text('amount', 'Loan not repaid at the end of the previous income year, in AUD with at most 2 decimal places, for example "100000".'),
    benchmarkRate: text('percent', 'Benchmark interest rate for the income year, in per cent with at most 2 decimal places, for example "8.77".'),
    remainingTerm: whole(1, 25, 'Remaining term of the loan in whole years.'),
  }, ['balance', 'benchmarkRate', 'remainingTerm']),
  run({ balance, benchmarkRate, remainingTerm }) {
    const r = minimumRepayment(balance, benchmarkRate, String(remainingTerm));
    return {
      minimumRepayment: dollars(r.repayment), interest: dollars(r.interest), principal: dollars(r.principal),
      currency: 'AUD', basis: 'Subsection 109E(6) ITAA 1936; each amount rounded half up to the cent.',
      source: `${CALCULATORS}div7a/`,
    };
  },
});

/** The inputs each choice of `solve` needs, besides the balloon, frequency, timing and start date. */
const FINANCE_NEEDS = { payment: ['amount', 'annualRate', 'payments'], amount: ['payment', 'annualRate', 'payments'],
  term: ['amount', 'annualRate', 'payment'], rate: ['amount', 'payment', 'payments'] };

/** A finance schedule tool; the hire purchase one adds interest by income year.
 * @param {Pick<typeof import('./business-calculators.mjs'), 'financeSchedule' | 'interestByIncomeYear'>} calculate
 * @param {boolean} hirePurchase */
const financeTool = ({ financeSchedule, interestByIncomeYear }, hirePurchase) => tool({
  name: hirePurchase ? 'calculate_hire_purchase_schedule' : 'calculate_loan_schedule',
  title: hirePurchase ? 'Hire purchase and chattel mortgage schedule' : 'Loan repayment schedule calculator',
  description: `${hirePurchase ? 'Payment schedule in AUD of a hire purchase agreement or chattel mortgage' : 'Repayment schedule in AUD of an amortising loan'} `
    + 'with level payments weekly, fortnightly, monthly, quarterly or yearly, in arrears or in advance, and an optional balloon '
    + 'as an amount or a percentage of the amount financed. Given 3 of the payment, the amount financed, the number of '
    + 'payments and the annual nominal rate, it works out the fourth: the rate by bisection to within 2^-48 of 100% a year. '
    + 'The period rate is the annual rate divided by 52, 26, 12, 4 or 1. Each period\'s interest is rounded half up to the '
    + 'cent, a payment worked out is rounded once, and the last payment takes the rest so the schedule closes on the balloon. '
    + `${hirePurchase ? 'It also totals the interest by income year, 1 July to 30 June, sharing a period across 30 June by days. '
      + 'It does not work out GST, the GST credit, the car limit or income tax. ' : ''}`
    + 'Planning estimate only: a financier\'s fees, day counts and payment dates can differ.',
  inputSchema: record({
    solve: choice(['payment', 'amount', 'term', 'rate'], 'What to work out: the payment, the amount financed, the number of payments ("term") or the rate.'),
    amount: text('amount', 'Amount financed in AUD with at most 2 decimal places, for example "60000"; not used when solve is "amount".'),
    annualRate: text('rate', 'Annual nominal interest rate in per cent with at most 4 decimal places, for example "7.5"; not used when solve is "rate".'),
    payments: whole(1, 2600, 'Number of payments, at most 50 years of them; not used when solve is "term".'),
    payment: text('amount', 'Regular payment in AUD with at most 2 decimal places; not used when solve is "payment".'),
    balloon: text('amount', 'Balloon or residual due at the end of the term, in AUD or, with balloonKind "percent", a percentage of the amount financed; "0" or omitted for none.'),
    balloonKind: choice(['amount', 'percent'], '"amount" (or omitted) for a balloon in AUD, "percent" for a percentage of the amount financed.'),
    frequency: choice(['weekly', 'fortnightly', 'monthly', 'quarterly', 'annual'], 'How often payments fall; "monthly" when omitted.'),
    timing: choice(['arrears', 'advance'], '"arrears" (or omitted) for payments at the end of each period, "advance" for the start.'),
    startDate: text('date', 'Day the amount is advanced, as YYYY-MM-DD, from 1900-01-01 to 2099-12-31.'),
  }, ['solve', 'startDate']),
  run({ solve, amount = '', annualRate = '', payments, payment = '', balloon = '0', balloonKind = 'amount', frequency = 'monthly',
    timing = 'arrears', startDate }) {
    const given = /** @type {Record<string, unknown>} */ ({ amount, annualRate, payments, payment });
    for (const key of FINANCE_NEEDS[/** @type {keyof typeof FINANCE_NEEDS} */ (solve)]) {
      if (given[key] === '' || given[key] === undefined) throw new Error(`${key} is required to work out the ${solve}.`);
    }
    const terms = { solve, amount, rate: annualRate, payments: payments === undefined ? '' : String(payments), payment, balloon,
      balloonKind, frequency, timing, start: startDate };
    const r = financeSchedule(terms);
    /** @param {import('./finance-schedule.mjs').FinanceRow} row */
    const shown = (row) => ({ date: row.date, opening: dollars(row.opening), payment: dollars(row.payment), interest: dollars(row.interest),
      principal: dollars(row.principal), closing: dollars(row.closing) });
    return {
      payment: dollars(r.payment), lastPayment: dollars(r.finalPayment), payments: r.payments, amountFinanced: dollars(r.amount),
      annualRatePercent: solve === 'rate' ? r.rate.toFixed(4) : annualRate, balloon: dollars(r.balloon), balloonDue: r.balloonDate,
      totalPaid: dollars(r.totalPaid), totalInterest: dollars(r.totalInterest),
      ...(hirePurchase ? { interestByIncomeYear: Object.fromEntries(Object.entries(interestByIncomeYear(terms, r))
        .map(([year, interest]) => [year, dollars(interest)])) } : {}),
      schedule: r.rows.map(shown), balloonRow: r.balloonRow && shown(r.balloonRow), currency: 'AUD',
      source: `${CALCULATORS}${hirePurchase ? 'hire-purchase' : 'loan'}/`,
    };
  },
});

/** The AASB 16 lessee schedule tool. @param {typeof import('./business-calculators.mjs').lease} lease */
const leaseTool = (lease) => tool({
  name: 'calculate_lease_schedule',
  title: 'AASB 16 lessee lease schedule',
  description: 'A lessee\'s AASB 16 lease liability and right-of-use asset in AUD for level lease payments weekly, fortnightly, monthly, '
    + 'quarterly or yearly, in arrears or in advance. The liability is the payments not paid at commencement and any residual value '
    + 'guarantee or purchase option price, discounted at the given annual rate (paragraph 26); the asset adds payments made at or '
    + 'before commencement, initial direct costs and the restoration estimate, less incentives (paragraph 24). Interest is rounded '
    + 'half up to the cent each period and the last period takes the rest; the asset is depreciated straight line over the lease term, '
    + 'or over the useful life when ownership transfers or the life ends first. Interest, payments and depreciation are totalled by '
    + 'income year, 1 July to 30 June. It does not remeasure for a change in rate, term or payments, and it does not work out GST or income tax.',
  inputSchema: record({
    payment: text('amount', 'Each lease payment in AUD excluding GST, with at most 2 decimal places, for example "1000".'),
    payments: whole(1, 2600, 'Number of lease payments in the lease term, at most 50 years of them.'),
    frequency: choice(['weekly', 'fortnightly', 'monthly', 'quarterly', 'annual'], 'How often payments fall; "monthly" when omitted.'),
    timing: choice(['arrears', 'advance'], '"arrears" (or omitted) for payments at the end of each period, "advance" for the start, the first at commencement.'),
    annualRate: text('rate', 'Discount rate in per cent a year with at most 4 decimal places: the rate implicit in the lease or the incremental borrowing rate.'),
    startDate: text('date', 'Commencement date as YYYY-MM-DD, from 1900-01-01 to 2099-12-31.'),
    residual: text('amount', 'Residual value guarantee expected to be paid, or purchase option price, in AUD; "0" or omitted for none.'),
    prepaid: text('amount', 'Lease payments made before commencement, in AUD; "0" or omitted for none.'),
    incentives: text('amount', 'Lease incentives received, in AUD; "0" or omitted for none.'),
    initialDirectCosts: text('amount', 'Initial direct costs, in AUD; "0" or omitted for none.'),
    restoration: text('amount', 'Estimated cost of dismantling or restoring, in AUD; "0" or omitted for none.'),
    ownershipTransfers: { type: 'boolean', description: 'True when ownership transfers or a purchase option is reasonably certain to be exercised.' },
    usefulLifeMonths: whole(1, 600, 'Useful life of the underlying asset in months; required when ownershipTransfers is true.'),
  }, ['payment', 'payments', 'annualRate', 'startDate']),
  run({ payment, payments, frequency = 'monthly', timing = 'arrears', annualRate, startDate, residual = '0', prepaid = '0', incentives = '0',
    initialDirectCosts = '0', restoration = '0', ownershipTransfers = false, usefulLifeMonths }) {
    const r = lease({ payment, payments: String(payments), frequency, timing, rate: annualRate, start: startDate, residual, prepaid, incentives,
      direct: initialDirectCosts, restoration, ownership: ownershipTransfers ? 'yes' : 'no', life: usefulLifeMonths === undefined ? '' : String(usefulLifeMonths) });
    return {
      leaseLiability: dollars(r.liability), rightOfUseAsset: dollars(r.cost), totalInterest: dollars(r.totalInterest), leaseTermEnds: r.end,
      depreciatedTo: r.depreciationEnd, shortTermElectionAvailable: r.shortTerm,
      incomeYears: r.years.map((y) => ({ year: y.year, interest: dollars(y.interest), payments: dollars(y.paid), leaseLiability: dollars(y.liability),
        depreciation: dollars(y.depreciation), rightOfUseAsset: dollars(y.asset) })),
      schedule: r.rows.map((row) => ({ date: row.date, opening: dollars(row.opening), payment: dollars(row.payment), interest: dollars(row.interest),
        principal: dollars(row.principal), closing: dollars(row.closing) })),
      currency: 'AUD', source: `${CALCULATORS}lease/`,
    };
  },
});

/** @param {typeof import('./business-calculators.mjs').breakEven} breakEven */
const breakEvenTool = (breakEven) => tool({
  name: 'calculate_break_even',
  title: 'Break-even sales calculator',
  description: 'Whole units, and the sales in AUD they bring in, that cover a period\'s fixed costs: contribution per '
    + 'unit is price less variable cost, units are fixed costs divided by contribution and rounded up, and sales '
    + 'are those units times the price. The price must exceed the variable cost per unit.',
  inputSchema: record({
    fixedCosts: text('amount', 'Fixed costs for the period in AUD with at most 2 decimal places.'),
    pricePerUnit: text('amount', 'Selling price per unit in AUD with at most 2 decimal places.'),
    variableCostPerUnit: text('amount', 'Variable cost per unit in AUD with at most 2 decimal places.'),
  }, ['fixedCosts', 'pricePerUnit', 'variableCostPerUnit']),
  run({ fixedCosts, pricePerUnit, variableCostPerUnit }) {
    const r = breakEven(fixedCosts, pricePerUnit, variableCostPerUnit);
    return {
      contributionPerUnit: dollars(r.contribution), units: r.units, sales: dollars(r.sales), currency: 'AUD',
      source: `${CALCULATORS}break-even/`,
    };
  },
});

/** @param {typeof import('./business-calculators.mjs').companyTax} companyTax */
const companyTaxTool = (companyTax) => tool({
  name: 'calculate_company_tax',
  title: 'Company tax and franking calculator',
  description: 'An Australian company\'s tax rate (25% for a base rate entity under section 23AA of the Income Tax Rates Act 1986, '
    + 'otherwise 30%) and tax in AUD for an income year from 2021-22, its corporate tax rate for imputation purposes from the '
    + 'previous year\'s figures (25% for a company new this year), the maximum franking credit on a dividend, the credit at the '
    + 'franking percentage, rounded down to the cent, and an Australian resident individual shareholder\'s tax on the grossed-up '
    + 'dividend less the franking tax offset: positive is tax to pay, negative a refund. It does not work out turnover or passive income.',
  inputSchema: record({
    turnover: text('cost', 'Aggregated turnover for the year, connected entities and affiliates included, in AUD with at most 2 decimal places.'),
    assessableIncome: text('cost', 'Assessable income for the year in AUD with at most 2 decimal places.'),
    passiveIncome: text('cost', 'Base rate entity passive income in it, franking credits included, in AUD; no more than assessable income.'),
    taxableIncome: text('cost', 'Taxable income for the year in AUD with at most 2 decimal places.'),
    existedLastYear: { type: 'boolean', description: 'true when the company existed in the previous income year.' },
    previousTurnover: text('cost', 'Previous year\'s aggregated turnover in AUD; "0" or omitted when the company did not exist.'),
    previousAssessableIncome: text('cost', 'Previous year\'s assessable income in AUD; "0" or omitted when the company did not exist.'),
    previousPassiveIncome: text('cost', 'Previous year\'s base rate entity passive income in AUD; "0" or omitted when the company did not exist.'),
    dividend: text('cost', 'Dividend paid in AUD with at most 2 decimal places.'),
    frankingPercent: text('percent', 'Franking percentage, 0 to 100, with at most 2 decimal places.'),
    marginalRate: text('percent', 'Shareholder\'s marginal tax rate with any Medicare levy, in per cent, 0 to 100.'),
  }, ['turnover', 'assessableIncome', 'passiveIncome', 'taxableIncome', 'existedLastYear', 'dividend', 'frankingPercent', 'marginalRate']),
  run(input) {
    const { previousTurnover = '0', previousAssessableIncome = '0', previousPassiveIncome = '0' } = input;
    const r = companyTax({ turnover: input.turnover, assessable: input.assessableIncome, passive: input.passiveIncome,
      taxable: input.taxableIncome, existed: input.existedLastYear,
      prior: { turnover: previousTurnover, assessable: previousAssessableIncome, passive: previousPassiveIncome },
      dividend: input.dividend, franking: input.frankingPercent, marginal: input.marginalRate });
    return {
      baseRateEntity: r.entity === 'base-rate', taxRatePercent: r.rate, tax: dollars(r.tax), imputationRatePercent: r.imputationRate,
      maximumFrankingCredit: dollars(r.maximum), frankingCredit: dollars(r.credit), grossedUpDividend: dollars(r.grossedUp),
      shareholderTax: dollars(r.shareholderTax), shareholderNet: dollars(r.net), currency: 'AUD',
      basis: 'Income Tax Rates Act 1986 ss 23(2) and 23AA; ITAA 1997 ss 995-1, 202-60, 207-20 and 67-25. Tax rounds half up; credits round down.',
      source: `${CALCULATORS}company-tax/`,
    };
  },
});

const SURCHARGE_PLACES = ['AU-NSW', 'AU-VIC', 'AU-QLD', 'AU-WA', 'AU-SA', 'AU-TAS', 'AU-ACT', 'AU-NT'];
/** Optional yes or no answers of the foreign surcharge tool, false when omitted. */
const SURCHARGE_FLAGS = {
  nzResident: 'Victorian duty, New Zealand citizen: ordinarily resident in Australia for 6 consecutive months within the 12 months before or after settlement.',
  resides: 'The individual ordinarily resides in Australia (Victorian and Queensland land tax, ACT).',
  absent: 'The individual was away from Australia on the land tax day or for over 6 months of the year before it (Victoria and Queensland).',
  home: 'ACT: the individual will live in the home as their principal place of residence.',
  overseas: 'A company incorporated outside Australia.',
  amendable: 'Discretionary trust: the deed could be amended so a foreign person can benefit.',
  control: 'Discretionary trust: a foreign person is a trustee or appointor.',
  named: 'Discretionary trust: a beneficiary, object or taker in default named in the deed is a foreign person (for Victorian land tax, an absentee).',
};

/** @param {Pick<typeof import('./business-calculators.mjs'), 'foreignSurcharge' | 'firbApplicationFee'>} calculate */
const foreignSurchargeTool = ({ foreignSurcharge, firbApplicationFee }) => tool({
  name: 'calculate_foreign_purchaser_surcharges',
  title: 'Foreign purchaser surcharge calculator',
  description: 'One buyer\'s foreign purchaser duty surcharge in AUD on its share of one property, and the foreign owner land tax '
    + 'surcharge for a full year, in one Australian state or territory, each with that jurisdiction\'s own test of whether the '
    + 'buyer is foreign, worded as the result. The Northern Territory charges neither, the ACT no duty surcharge, and Western '
    + 'Australia and South Australia no land tax surcharge. It does not work out exemptions, refunds or relief, which each '
    + 'Commissioner decides, or the status of a partner or retirement visa holder. An explicit FIRB application gives the 2026-27 '
    + 'residential land fee. The federal approval requirement, lower fee rules, waivers and concessions are outside the calculation.',
  inputSchema: record({
    place: choice(SURCHARGE_PLACES, 'State or territory, for example "AU-NSW".'),
    buyer: choice(['individual', 'company', 'trust', 'discretionary', 'smsf'],
      '"individual", "company", "trust" (a fixed or unit trust), "discretionary" (a discretionary trust) or "smsf" (a complying self-managed super fund).'),
    status: choice(['citizen', 'permanent', 'nz', 'other'],
      'An individual\'s status: "citizen", "permanent" visa, "nz" (New Zealand citizen on a special category visa) or "other"; ignored for other buyers.'),
    use: choice(['residential', 'primary', 'other'], '"residential" (vacant residential land included), "primary" production or "other".'),
    value: whole(1, 1000000000, 'Dutiable value of the whole property in whole AUD.'),
    share: whole(1, 1000000000, 'Dutiable value of this buyer\'s share in whole AUD, no more than the value.'),
    landValue: whole(0, 1000000000, 'All the buyer\'s taxable land in the jurisdiction, their share only, in whole AUD.'),
    firb: record({
      kind: choice(['none', 'vacant', 'established'], 'FIRB application type. Use "vacant" for residential land without an established dwelling.'),
      consideration: whole(1, 1000000000, 'Consideration for the whole acquisition including any GST, in whole AUD, required for an application.'),
      ownership: choice(['sole', 'joint', 'tenant-in-common'], 'Acquisition ownership type, required for an application.'),
      interest: text('fraction', 'Required for a tenant in common, using their ownership fraction, for example 1/2.'),
    }, ['kind']),
    daysBefore: whole(0, 366, 'New South Wales duty: days in Australia in the 12 months before the contract.'),
    daysToDecember: whole(0, 366, 'New South Wales land tax: days in Australia in the 12 months to the next 31 December.'),
    largestForeignPercent: text('percent', 'Company, trust or fund: largest interest of one foreign person with associates, in per cent; for a company, the higher of shares and votes, or potential voting power where higher in New South Wales, Queensland, Tasmania and Western Australia.'),
    foreignPercent: text('percent', 'Company, trust or fund: interests of all foreign persons together, with associates, in per cent; for a company, the higher of shares and votes, or potential voting power where higher in New South Wales, Queensland, Tasmania and Western Australia.'),
    absenteePercent: text('percent', 'Victorian land tax, company or fixed trust: interests of absentee persons together, with associates, in per cent, for a company the higher of shares and votes; foreign interests are not absentee ones.'),
    capitalPercent: text('percent', 'Discretionary trust: most of the capital the trustee could give foreign persons, in per cent.'),
    defaultsPercent: text('percent', 'Discretionary trust: foreign takers in default\'s share, in per cent.'),
    ...Object.fromEntries(Object.entries(SURCHARGE_FLAGS).map(([key, description]) => [key, { type: 'boolean', description }])),
  }, ['place', 'buyer', 'status', 'use', 'value', 'share', 'landValue']),
  run(input) {
    // New South Wales decides these 2 statuses by days in Australia, so a missing count is not taken as none.
    if (input.place === 'AU-NSW' && input.buyer === 'individual' && ['permanent', 'nz'].includes(input.status)
      && (input.daysBefore === undefined || input.daysToDecember === undefined)) {
      throw new Error('New South Wales tests a permanent visa holder or New Zealand citizen by days in Australia: give daysBefore and daysToDecember.');
    }
    const r = foreignSurcharge({ type: input.buyer, status: input.status, daysBefore: String(input.daysBefore ?? 0),
      daysDecember: String(input.daysToDecember ?? 0), largest: input.largestForeignPercent ?? '0', combined: input.foreignPercent ?? '0', absentee: input.absenteePercent ?? '0',
      capital: input.capitalPercent ?? '0', defaults: input.defaultsPercent ?? '0', exemption: false,
      nzResident: input.nzResident ?? false, resides: input.resides ?? false, absent: input.absent ?? false,
      home: input.home ?? false, overseas: input.overseas ?? false, amendable: input.amendable ?? false,
      control: input.control ?? false, named: input.named ?? false },
    { place: input.place, use: input.use, value: String(input.value), share: String(input.share), land: String(input.landValue) });
    const result = {
      dutySurchargeRatePercent: r.dutyRate, dutySurcharge: dollars(r.duty), dutyTest: r.dutyTest,
      landTaxSurcharge: dollars(r.land), landTaxTest: r.landTest, currency: 'AUD',
      basis: 'Each jurisdiction\'s rate and test of a foreign buyer as its revenue office states them, read 18 November 2026; the revenue office decides.',
      source: `${CALCULATORS}foreign-surcharge/`,
    };
    if (!input.firb) return result;
    const { kind, consideration, ownership, interest } = input.firb;
    const fee = firbApplicationFee({
      kind, consideration: consideration === undefined ? undefined : String(consideration), ownership, interest,
    }, input.use);
    return { ...result, firb: { applicationFee: dollars(fee.fee), wholePropertyFee: dollars(fee.whole),
      feeYear: fee.feeYear, ownership: fee.ownership, notes: fee.notes } };
  },
});

const LSL_REASON_CODES = ['resign', 'pressing', 'no-notice', 'retire', 'redundancy', 'illness-dismissal', 'performance', 'misconduct',
  'fixed-term', 'death'];

/** @param {typeof import('./business-calculators.mjs').longServiceLeave} longServiceLeave */
const longServiceLeaveTool = (longServiceLeave) => tool({
  name: 'calculate_long_service_leave',
  title: 'Long service leave calculator',
  description: 'One employee\'s long service leave under the general Act of an Australian state or territory: the service counted, '
    + 'the weeks the employee can take while employment continues or the weeks payable when it ends for a given reason, less leave '
    + 'already taken or paid, and their value in AUD at the weekly ordinary pay, with the provision applied. Service runs from the '
    + 'first day to the end of the last day, less the excluded days. It refuses a reason an Act leaves unsettled, and does not '
    + 'decide which Act or award applies, continuity of service, ordinary pay averaging, portable schemes or tax.',
  inputSchema: record({
    place: choice(SURCHARGE_PLACES, 'State or territory whose Act applies, for example "AU-NSW".'),
    firstDay: text('date', 'First day of service, YYYY-MM-DD, from 1990-06-23 to 2099-12-31.'),
    lastDay: text('date', 'Last day of employment, or the day to work the leave out at while it continues, YYYY-MM-DD, no earlier than firstDay.'),
    excludedDays: whole(0, 36500, 'Calendar days inside the service that do not count towards it, such as unpaid leave; 0 when omitted.'),
    employment: choice(['ends', 'employed'], '"ends" when employment ends on lastDay, or "employed" for the leave the employee can take now.'),
    reason: choice(LSL_REASON_CODES, 'Why employment ends, required when employment is "ends": "resign", "pressing" (resignation for illness, '
      + 'incapacity or a domestic or other pressing necessity), "no-notice" (resignation without the notice the contract requires), "retire" '
      + '(at or after the retiring age), "redundancy" (or another dismissal not about conduct, capacity or performance), "illness-dismissal", '
      + '"performance" (dismissal for conduct, capacity or performance short of serious misconduct, or of serious and wilful misconduct in NSW, '
      + 'SA, Tasmania and the ACT), "misconduct" (serious misconduct, or serious and wilful misconduct in NSW, SA, Tasmania and the ACT), '
      + '"fixed-term" or "death".'),
    takenWeeks: text('rate', 'Weeks of long service leave already taken or paid, with at most 4 decimal places; "0" when omitted.'),
    weeklyPay: text('amount', 'Ordinary pay a week in AUD with at most 2 decimal places, no more than 1000000.'),
  }, ['place', 'firstDay', 'lastDay', 'employment', 'weeklyPay']),
  run(input) {
    if (input.employment === 'ends' && input.reason === undefined) throw new Error('reason is required when employment ends.');
    const r = longServiceLeave({ place: input.place, start: input.firstDay, end: input.lastDay, excluded: String(input.excludedDays ?? 0),
      taken: input.takenWeeks ?? '0', mode: input.employment, reason: input.reason ?? 'redundancy', pay: input.weeklyPay });
    return {
      years: r.years, months: r.months, days: r.days, daysCounted: r.counted, rule: r.rule, weeks: r.weeks.toFixed(4),
      takenWeeks: r.taken.toFixed(4), weeksLeft: r.balance.toFixed(4), value: dollars(r.value), currency: 'AUD',
      next: r.next && { years: r.next.years, date: r.next.date, weeks: r.next.weeks.toFixed(4) },
      basis: 'Each state and territory\'s general long service leave Act as read 19 November 2026. Weeks round half up to 4 decimal places; '
        + 'the value is the exact weeks times the pay, rounded half up to the cent.',
      source: `${CALCULATORS}long-service-leave/`,
    };
  },
});

/** Whole cents as dollars to 2 decimal places. @param {bigint} cents */
const centsText = (cents) => `${cents < 0n ? '-' : ''}${(cents < 0n ? -cents : cents) / 100n}.${String((cents < 0n ? -cents : cents) % 100n).padStart(2, '0')}`;

/** @param {typeof import('./business-calculators.mjs').borrowingSchedule} borrowingSchedule @param {string[]} years */
const borrowingTool = (borrowingSchedule, years) => tool({
  name: 'calculate_borrowing_expenses',
  title: 'Borrowing expenses deduction schedule',
  description: 'Borrowing expenses deductions under ITAA 1997 s 25-25 for up to 20 loans and every income year of each: each year’s '
    + 'remaining expenditure, days, maximum deduction and deduction at the income use, the year asked about’s totals in AUD, and the $100 '
    + 'rule of s 25-25(6) across loans first drawn in the same year. A refinancing is the earlier loan repaid on the new loan’s first '
    + 'day. Years from 2027-28 are flagged for s 26-155, which it does not apply, and years after 2027-28 are marked projected. It does '
    + 'not decide which costs are borrowing expenses or the use of the money, and does not work the page’s accounting column. It assumes '
    + 'no loan’s money is used for a holiday home or other leisure facility, or that s 26-50(3) applies all year: otherwise s 26-50 may deny '
    + 'the deduction.',
  inputSchema: record({
    year: choice(years, 'Income year asked about, for example "2025-26".'),
    loans: { type: 'array', maxItems: 20, description: 'Each loan, in order; a refinancing names an earlier one by its number from 1.',
      items: record({
        borrowingExpenses: text('cost', 'Borrowing expenses in AUD with at most 2 decimal places.'),
        firstBorrowed: text('date', 'First day the money was borrowed, YYYY-MM-DD, from 2017-07-01.'),
        contractEnd: text('date', 'Last day of the period the original loan contract specifies, YYYY-MM-DD; omit when it has none.'),
        repaidOn: text('date', 'Day the loan was repaid, YYYY-MM-DD; omit when it is not.'),
        incomeUse: text('share', 'Fraction of the money used to produce assessable income in every year, from "0" to "1".'),
        refinances: whole(1, 19, 'Number of the earlier loan this loan repaid on its first day; omit when none.'),
      }, ['borrowingExpenses', 'firstBorrowed', 'incomeUse']) },
  }, ['year', 'loans']),
  run(input) {
    const loans = input.loans.map((/** @type {Record<string, any>} */ l) => ({ borrowing_expenses: l.borrowingExpenses, loan_start: l.firstBorrowed,
      loan_term_end: l.contractEnd ?? null, repaid_on: l.repaidOn ?? null, income_use: l.incomeUse, section_26_50_applies: false,
      ...(l.refinances === undefined ? {} : { refinances: l.refinances }) }));
    const r = borrowingSchedule({ year: input.year, loans });
    return {
      year: r.year, borrowingExpenses: r.borrowingExpenses.toFixed(2), maximumDeduction: r.maximumDeduction.toFixed(2),
      deduction: r.deduction.toFixed(2), remainingAfterYear: r.remainingAfterYear.toFixed(2), currency: 'AUD',
      loans: r.loans.map((l) => ({ loan: l.loan, periodTo: l.to, periodBasis: l.basis, spread: l.spread, totalDeduction: centsText(l.total),
        years: l.rows.map((row) => ({ incomeYear: row.income_year, remaining: centsText(row.remaining), daysInYear: row.days, daysLeft: row.left,
          maximum: centsText(row.maximum), deduction: centsText(row.deduction), section26_155: row.section_26_155, projected: row.projected })) })),
      warnings: r.warnings,
      basis: 'ITAA 1997 s 25-25 as read 19 November 2026; each maximum is rounded half up to the cent and carried forward, as the ATO’s examples are.',
      source: `${CALCULATORS}borrowing-expenses/`,
    };
  },
});

const FTC_LINE = record({
  method: choice(['litres_from_cost', 'basic_heavy_vehicle'], 'Omit for a line by quantity; "litres_from_cost" (a small claimant\'s PCG 2016/2 '
    + 'Method 1) to work out the litres from cost and averagePriceCentsPerLitre; "basic_heavy_vehicle" (a small claimant\'s PCG 2021/2 basic method) '
    + 'to split litres of diesel by publicRoadKm or totalKm and rigidTruckGrossWeightTonnes or litresPerKm.'),
  fuel: choice(['diesel', 'petrol', 'b5', 'b20', 'e10', 'e85', 'lpg', 'lng_cng', 'b100'], 'The eligible fuel; the basic method takes "diesel" only.'),
  use: choice(['heavy_vehicle_public_road', 'other_business', 'light_vehicle_public_road'], 'The fuel\'s use: a vehicle over 4.5 tonnes GVM on a '
    + 'public road (including a bus\'s or coach\'s passenger air-conditioning), every other business use, or a vehicle of 4.5 tonnes or less on a '
    + 'public road (nil). Not with the basic method.'),
  acquired: text('date', 'Day the fuel was acquired, YYYY-MM-DD, inside the income year and no later than 2027-01-31.'),
  quantity: text('quantity', 'Litres (kilograms for "lng_cng") with at most 4 decimal places, for a line by quantity.'),
  cost: text('cost', 'GST inclusive cost in AUD with at most 2 decimal places, with "litres_from_cost".'),
  averagePriceCentsPerLitre: text('quantity', 'Average GST inclusive pump price for the tax period in cents a litre, from '
    + 'https://aip.com.au/pricing/pump-prices-retail/, with "litres_from_cost".'),
  litres: text('quantity', 'Litres of eligible diesel, with "basic_heavy_vehicle".'),
  publicRoadKm: text('quantity', 'Kilometres travelled on public roads, or give totalKm instead.'),
  totalKm: text('quantity', 'Total kilometres, of which 98.4% are taken as on public roads.'),
  rigidTruckGrossWeightTonnes: text('quantity', 'A rigid truck\'s gross weight in tonnes, above 4.5, or give litresPerKm instead.'),
  litresPerKm: text('consumption', 'The engine diagnostic report\'s \'driving fuel\' economy in litres a kilometre.'),
}, ['fuel', 'acquired']);
const FTC_FIELDS = { averagePriceCentsPerLitre: 'average_price_cents_per_litre', publicRoadKm: 'public_road_km', totalKm: 'total_km',
  rigidTruckGrossWeightTonnes: 'rigid_truck_gross_weight_tonnes', litresPerKm: 'litres_per_km' };

/** @param {typeof import('./business-calculators.mjs').fuelTaxCredits} fuelTaxCredits */
const fuelTaxCreditsTool = (fuelTaxCredits) => tool({
  name: 'calculate_fuel_tax_credits',
  title: 'Fuel tax credit calculator',
  description: 'A business\'s fuel tax credits in AUD for fuel acquired in one income year from 2022-23 to 2026-27, each line at the ATO\'s '
    + 'published rate for the day it was acquired, its fuel and its use, rounded half up to the cent, with the whole dollars for label 7D. '
    + 'Small claimants may give a line by its cost and average price, split a heavy vehicle\'s diesel by the basic method, or take every line '
    + 'at the rate on a tax period\'s last day across indexation. It refuses fuel acquired after 31 January 2027 and does not decide entitlement, '
    + 'public roads, hire chains, apportionment or the auxiliary equipment percentages.',
  inputSchema: record({
    year: choice(['2022-23', '2023-24', '2024-25', '2025-26', '2026-27'], 'Income year the fuel was acquired in.'),
    lines: { type: 'array', maxItems: 50, items: FTC_LINE, description: 'From 1 to 50 fuel lines.' },
    smallClaimant: { type: 'boolean', description: 'Required with a simplified method or ratePeriod: true when the credits were $10,000 or less in '
      + 'the previous 12 months and are expected to be in the current 12 months (for the basic method alone, no claim in the previous 12 months also '
      + 'counts: PCG 2021/2 footnote 3).' },
    ratePeriod: record({ start: text('date', 'Tax period\'s first day, YYYY-MM-DD.'), end: text('date', 'Tax period\'s last day, YYYY-MM-DD.') },
      ['start', 'end']),
    returnDate: text('date', 'Day the activity statement is given, YYYY-MM-DD, to list lines acquired more than 4 years before it (subsection 47-5(2)).'),
  }, ['year', 'lines']),
  run({ year, lines, smallClaimant, ratePeriod, returnDate }) {
    const r = fuelTaxCredits({ year, lines: lines.map((/** @type {Record<string, string>} */ line) => Object.fromEntries(Object.entries(line)
      .map(([key, value]) => [FTC_FIELDS[/** @type {keyof typeof FTC_FIELDS} */ (key)] ?? key, value]))),
    ...(smallClaimant === undefined ? {} : { small_claimant: smallClaimant }), ...(ratePeriod ? { rate_at_period_end: ratePeriod } : {}),
    ...(returnDate ? { return_date: returnDate } : {}) });
    return {
      lines: r.lines.map((l) => ({ line: l.line, rateDay: l.rateDay, ratePeriod: l.period, ...(l.method === 'basic_heavy_vehicle'
        ? { publicRoadLitres: l.publicRoadLitres, otherLitres: l.otherLitres, publicRoadRateCents: l.publicRoadRate, otherRateCents: l.otherRate }
        : { quantity: l.quantity, rateCents: l.rateCents }), credit: dollars(l.credit) })),
      fuelTaxCredits: dollars(r.total), label7d: String(r.label7d), currency: 'AUD', warnings: r.warnings, timeLimitLines: r.timeLimitLines,
      basis: 'The ATO\'s 16 published rate periods from 1 July 2022, read 19 November 2026; quantity times rate in cents over 100, rounded half up '
        + 'to the cent, and label 7D in whole dollars.',
      source: `${CALCULATORS}fuel-tax-credits/`,
    };
  },
});

/** Tools keyed by the `data-calculator` name of the form whose page registers them.
 * @param {Pick<typeof import('./business-calculators.mjs'), 'gst' | 'div7aMinimumRepayment' | 'financeSchedule' | 'interestByIncomeYear'
 *   | 'lease' | 'breakEven' | 'companyTax' | 'foreignSurcharge' | 'firbApplicationFee' | 'longServiceLeave'
 *   | 'fuelTaxCredits' | 'borrowingSchedule'
 *   | 'BORROWING_YEARS'>} calculate */
export function calculatorTools(calculate) {
  return {
    gst: gstTool(calculate.gst),
    div7a: div7aTool(calculate.div7aMinimumRepayment),
    loan: financeTool(calculate, false),
    'hire-purchase': financeTool(calculate, true),
    lease: leaseTool(calculate.lease),
    'break-even': breakEvenTool(calculate.breakEven),
    'company-tax': companyTaxTool(calculate.companyTax),
    'foreign-surcharge': foreignSurchargeTool(calculate),
    'long-service-leave': longServiceLeaveTool(calculate.longServiceLeave),
    'fuel-tax-credits': fuelTaxCreditsTool(calculate.fuelTaxCredits),
    'borrowing-expenses': borrowingTool(calculate.borrowingSchedule, calculate.BORROWING_YEARS),
  };
}

/**
 * WebMCP descriptor for the depreciation rates page's decline in value calculator.
 * @param {Pick<typeof import('./depreciation-rates.mjs'), 'parseCents' | 'parseLife' | 'parseUse' | 'rates' | 'schedule'>} depreciation
 */
export function depreciationTools({ parseCents, parseLife, parseUse, rates, schedule }) {
  /** Whole cents as dollars to 2 decimal places. @param {bigint} cents */
  const money = (cents) => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
  return {
    declineInValue: tool({
      name: 'calculate_decline_in_value',
      title: 'Depreciating asset decline in value calculator',
      description: 'Decline in value in AUD of one depreciating asset for each income year from the year it was first used '
        + 'or installed ready for use to the year asked for, by prime cost (section 40-75 ITAA 1997) or diminishing '
        + 'value (section 40-72, 200%), and the deduction for its taxable use, each rounded half up to the cent. '
        + 'Income years end on 30 June. It assumes the asset is held all of each later year with no second element '
        + 'of cost, and does not cover assets first held before 10 May 2006, pools or immediate write-offs.',
      inputSchema: record({
        cost: text('cost', 'Cost in AUD with at most 2 decimal places, for example "1500".'),
        effectiveLife: text('life', 'Effective life in years: whole years, a decimal or a fraction as the determination prints it, for example "10", "7.5" or "6 2/3".'),
        startDate: text('date', 'Day the asset was first used or installed ready for use, as YYYY-MM-DD, on or after 2006-05-10.'),
        incomeYearEnding: whole(2007, 2300, 'Last income year to work out, by the year in which it ends on 30 June, for example 2027 for 2026-27.'),
        method: choice(['prime-cost', 'diminishing-value'], 'prime-cost or diminishing-value.'),
        taxableUse: text('percent', 'Taxable use in per cent from 0 to 100 with at most 2 decimal places; "100" when omitted.'),
      }, ['cost', 'effectiveLife', 'startDate', 'incomeYearEnding', 'method']),
      run({ cost, effectiveLife, startDate, incomeYearEnding, method, taxableUse = '100' }) {
        const life = parseLife(effectiveLife);
        const lines = schedule({
          cost: parseCents(cost), life, start: startDate, yearEnd: incomeYearEnding, method, use: parseUse(taxableUse),
        });
        return {
          method, rate: method === 'prime-cost' ? rates(life).primeCost : rates(life).diminishingValue,
          years: lines.map((line) => ({
            incomeYear: `${line.yearEnd - 1}-${String(line.yearEnd % 100).padStart(2, '0')}`, daysHeld: line.days,
            openingValue: money(line.opening), declineInValue: money(line.decline), deduction: money(line.deduction),
            closingValue: money(line.closing),
          })),
          currency: 'AUD', source: 'https://duguid.com.au/tools/depreciation-rates/#deduction',
        };
      },
    }),
  };
}

const BONUS = record({
  amount: text('amount', 'Bonus or incentive amount paid in the month, in AUD.'),
  frequency: choice(['weekly', 'fortnightly', 'monthly', 'quarterly', 'halfYearly', 'annually'], 'How often the bonus is paid.'),
}, ['amount', 'frequency']);

const LEVY_MONEY = 'in AUD with at most 2 decimal places; "0" when omitted.';

/** The levy tool's inputs: the page form's fields, by the same names. */
const LEVY_INPUTS = record({
  reportingMonth: text('month', 'Month the wages were paid, as YYYY-MM, from 2023-07.'),
  branch: choice(['baseRate', 'annual', 'casual'], 'How the employee is paid: baseRate (section 3B(1)), annual (an annual salary, section 3B(2)) or casual (section 3B(3)).'),
  baseRate: text('amount', `Base rate of pay for the month (baseRate branch), ${LEVY_MONEY}`),
  overtime: text('amount', `Overtime and penalty rates for the month (baseRate branch), ${LEVY_MONEY}`),
  allowances: text('amount', `Allowances for the month (baseRate branch), ${LEVY_MONEY}`),
  annualSalary: text('amount', `Annual salary paid for the month (annual branch), ${LEVY_MONEY}`),
  casualBasePay: text('amount', `Casual base rate pay for the month (casual branch), ${LEVY_MONEY}`),
  casualLoading: text('amount', `Casual loading for the month (casual branch), ${LEVY_MONEY}`),
  ordinaryPay: text('amount', `All-in ordinary rate pay for the month (casual branch), ${LEVY_MONEY}`),
  sacrificed: text('amount', `Salary sacrificed in the month, ${LEVY_MONEY}`),
  instrumentSpecifiesLoading: { type: 'boolean', description: 'Casual branch: an industrial instrument specifies a casual loading.' },
  loadingQuantifiable: { type: 'boolean', description: 'Casual branch: that loading can be quantified separately from the ordinary rate.' },
  bonuses: { type: 'array', maxItems: 20, items: BONUS, description: 'Bonuses and incentive payments in the month, with how often each is paid.' },
}, ['reportingMonth', 'branch']);

/**
 * WebMCP descriptor for the Coal LSL levy calculator.
 * @param {{computeEntry: (entry: Record<string, unknown>) => {branch: string, eligibleWagesCents: number,
 *   formulaA?: number, formulaB?: number, winner?: string, ignored?: string[]}, levyCents: (cents: number) => number}} levy
 */
export function levyTools({ computeEntry, levyCents }) {
  return {
    levy: tool({
      name: 'calculate_coal_lsl_levy',
      title: 'Coal LSL levy calculator',
      description: 'Eligible wages in AUD for one employee\'s month under section 3B of the Coal Mining Industry (Long '
        + 'Service Leave) Payroll Levy Collection Act 1992 and the 2.7% payroll levy on them, rounded half up to '
        + 'the cent at the last step. The 2.7% rate applies to wages paid from July 2023; earlier months are '
        + 'refused. Bonuses count only where paid at least monthly. It does not decide whether '
        + 'the employer or employee is in the coal mining industry.',
      inputSchema: LEVY_INPUTS,
      run({ bonuses = [], ...fields }) {
        const result = computeEntry({
          ...fields, bonuses: bonuses.map((/** @type {{amount: string, frequency: string}} */ b) => ({ ...b, amount: Number(b.amount) })),
          ...Object.fromEntries(['baseRate', 'overtime', 'allowances', 'annualSalary', 'casualBasePay', 'casualLoading',
            'ordinaryPay', 'sacrificed'].map((name) => [name, Number(fields[name] ?? '0')])),
        });
        return {
          section: result.branch, reportingMonth: fields.reportingMonth,
          eligibleWages: String(result.eligibleWagesCents / 100), levy: dollars(levyCents(result.eligibleWagesCents) / 100),
          ...(result.winner ? { formulaA: String((result.formulaA ?? 0) / 100), formulaB: String((result.formulaB ?? 0) / 100), greaterOf: result.winner } : {}),
          ...(result.ignored?.length ? { ignored: result.ignored } : {}),
          rate: '2.7%', currency: 'AUD', source: 'https://duguid.com.au/tools/coal-lsl-levy/',
        };
      },
    }),
  };
}

// Lambda is written as \u03bb in this file: the site's font checks treat a
// literal character in a page script as text that page can show.
/** A function name as people type it: no `oz.` prefix, no lambda, no case.
 * @param {unknown} name */
const functionKey = name => String(name).trim().replace(/^oz\./i, '').replace(/\u03bb/g, '').toLowerCase();

/**
 * WebMCP descriptor that looks up one Ozzit formula in the published function reference.
 * @param {() => Promise<{modules: Array<{module: string, functions: Array<Record<string, any>>}>}>} loadReference
 * @param {string} pageBase the module pages' path, ending in a slash
 */
export function ozzitTools(loadReference, pageBase = '/tools/ozzit/functions/') {
  return {
    lookup: {
      name: 'ozzit_function',
      title: 'Ozzit function reference',
      description: 'Look up one Ozzit Excel LAMBDA function by name and return its signature, parameters, notes '
        + 'and worked examples from the released workbook help. Reference only: it calculates nothing and does '
        + 'not decide an accounting treatment.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 80, description: 'Function name, for example "oz.Amortise\u03bb", "Amortise" or "GSTExtract".' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      /** @param {{name?: unknown}} [input] */
      async execute({ name } = {}) {
        if (typeof name !== 'string' || !name.trim()) throw new Error('name must be a function name.');
        const key = functionKey(name);
        const reference = await loadReference();
        for (const { module, functions } of reference.modules) {
          const found = functions.find(f => functionKey(f.name) === key);
          if (!found) continue;
          const anchor = 'oz-' + key.replace(/[^a-z0-9]/g, '');
          return {
            name: found.name, module, signature: 'oz.' + found.signature, summary: found.summary,
            description: found.description, parameters: found.parameters, notes: found.notes,
            examples: found.examples, source: `https://duguid.com.au${pageBase}${module.toLowerCase()}/#${anchor}`,
          };
        }
        throw new Error(`No Ozzit function is named ${name.trim()}.`);
      },
    },
  };
}

const INDIVIDUAL = 'https://duguid.com.au/tools/individual-tax/';
const RESIDENCY = choice(['resident', 'foreign', 'working-holiday'], 'Residency for tax purposes all year: resident (Australian '
  + 'resident), foreign (foreign resident) or working-holiday (working holiday maker, visa 417 or 462).');
/** @param {string} description @returns {Schema} */
const dollarsOnly = (description) => whole(0, 1e9, `${description} In whole AUD; 0 when omitted.`);
/** A signed amount as a refund or an amount owing. @param {number} value */
const settled = (value) => ({ refund: dollars(Math.max(0, value)), amountOwing: dollars(Math.max(0, -value)) });

const INCOME_TAX_DESCRIPTION = 'One Australian individual\'s income tax for a full income year in AUD: tax on taxable income, the low '
  + 'income tax offset, the low and middle income tax offset for 2020-21 and 2021-22, the Medicare levy, the Medicare '
  + 'levy surcharge for the days without private patient hospital cover and any compulsory study loan repayment, '
  + 'less the tax withheld, as a refund or an amount owing, each rounded half up to the cent. Every rate is cited '
  + `on ${INDIVIDUAL}income-tax/. It does not compute other offsets, deductions, the Medicare levy reduction `
  + 'for families or a Medicare levy exemption, a working holiday maker who is an Australian resident or has other '
  + 'income besides working holiday taxable income, a part-year residency, a first home super saver released amount, '
  + 'an amount on which family trust '
  + 'distribution tax has been paid, or the 2023-24 and earlier reduction of income for surcharge purposes by a super '
  + 'lump sum, and it assumes the study loan debt is at least the repayment, which the debt still owed caps.';
const TAKE_HOME_DESCRIPTION = 'Take-home pay in AUD from one salary for a full income year: the year\'s income tax, offsets, Medicare '
  + 'levy, any Medicare levy surcharge and study loan repayment, after salary sacrificed to super and, from 2026-27, '
  + 'the standard deduction, spread over a year, month, fortnight and week, with the employer\'s super guarantee '
  + 'worked on the year\'s earnings, not pay by pay or quarter by quarter. A weekly, fortnightly or monthly salary '
  + 'is 52, 26 or 12 pays a year; a 53rd weekly or 27th fortnightly pay is not computed. The surcharge is a single '
  + 'person\'s with no dependants, and the study loan repayment assumes the debt is at least the repayment. For a '
  + 'weekly, fortnightly or monthly pay of a resident (scale 2, tax-free threshold claimed) or a foreign resident '
  + '(scale 3) it also gives the PAYG withheld each pay under the year\'s Schedules 1 and 8 and the refund or amount '
  + 'owing over the year; for a working holiday maker it gives none. For 2025-26 every pay takes the study loan '
  + 'component from 24 September 2025, and so do the year\'s withholding and the refund or amount owing; the component '
  + 'before that date is given beside it and not mixed in. '
  + 'It names, but does not work, concessional contributions above the cap and Division 293 taxable '
  + `contributions. Sources on ${INDIVIDUAL}take-home-pay/.`;

const BONUS_WITHHOLDING_DESCRIPTION = 'PAYG withholding in AUD from one 2026-27 weekly, fortnightly or monthly pay that includes a '
  + 'back payment, commission, bonus or similar payment, by the methods of the ATO\'s Schedule 5 for payments made from '
  + '1 July 2026, on scale 2 (resident claiming the tax-free threshold) or scale 3 (foreign resident), with the Schedule 8 '
  + 'study loan component when the payee has one. Method A spreads the payment over the pays in a year, or fewer for a '
  + 'commission or bonus for a defined period under 12 months, and limits it to 47%. Method B works a back payment for earlier pays this year '
  + 'by B(i), each pay with the same earnings, back payment and earlier withholding, and any other payment by B(ii) on '
  + 'the average earnings to date, limited to 47%. Method A also gives the tax and study loan repayment the payment adds '
  + 'to a year of this pay. It does not compute scales 1, 5 or 6, a payee without a tax file number, a working holiday '
  + `maker, a withholding variation, or years before 2026-27. Sources on ${INDIVIDUAL}bonus-withholding/.`;
const SOLE_TRADER_DESCRIPTION = 'What an Australian resident sole trader sets aside in AUD for a full income year: the income '
  + 'tax, Medicare levy, any Medicare levy surcharge and study loan repayment that the business profit adds to any wages, '
  + 'after the small business income tax offset (16% of the share of basic income tax liability on net small business '
  + 'income, at most $1,000), plus the GST on the business income less GST credits when registered, as a share of each '
  + 'invoice and an amount each quarter, month and week, each rounded half up to the cent. It assumes all sales are '
  + 'taxable supplies, the wages were withheld from as though they were the only income, a single person with no '
  + 'dependants, an adult, and a study loan debt at least the repayment; it refuses a business loss and GST credits '
  + `above the GST on income. Sources on ${INDIVIDUAL}sole-trader/.`;

/** @param {typeof import('./sole-trader.mjs').soleTraderSetAside} soleTraderSetAside @param {string[]} years */
const soleTraderTool = (soleTraderSetAside, years) => tool({
  name: 'calculate_sole_trader_set_aside',
  title: 'Sole trader tax set-aside calculator',
  description: SOLE_TRADER_DESCRIPTION,
  inputSchema: record({
    incomeYear: choice(years, `Income year, ${years.at(-1)} to ${years[0]}.`),
    businessIncome: text('amount', 'Business income for the year excluding GST, in AUD with at most 2 decimal places.'),
    businessExpenses: text('amount', 'Deductible business expenses for the year excluding GST, in AUD; "0" when omitted.'),
    wages: text('amount', 'Salary and wages from a job for the year before tax, in AUD; "0" when omitted.'),
    otherDeductions: text('amount', 'Tax agent fees and gifts claimed, in AUD; "0" when omitted.'),
    personalSuperContributions: text('amount', 'Personal super contributions claimed as a deduction, in AUD; they also '
      + 'count in study loan repayment income and income for surcharge purposes; "0" when omitted.'),
    smallBusinessOffset: { type: 'boolean', description: 'false when the business does not qualify for the small business '
      + 'income tax offset (aggregated turnover of $5 million or more, or personal services income outside a personal '
      + 'services business); true when omitted.' },
    studyLoan: { type: 'boolean', description: 'true when the person has a HELP or other study or training loan.' },
    privateHospitalCover: { type: 'boolean', description: 'false when the person had no private patient hospital cover all year; true when omitted.' },
    registeredForGst: { type: 'boolean', description: 'true when the business is registered for GST; false when omitted.' },
    gstCredits: text('amount', 'GST credits on business purchases for the year, in AUD; "0" when omitted.'),
    invoice: text('amount', 'One invoice as charged, GST included when registered, in AUD; "0" when omitted.'),
  }, ['incomeYear', 'businessIncome']),
  run({ incomeYear, businessIncome, businessExpenses = '0', wages = '0', otherDeductions = '0',
    personalSuperContributions = '0', smallBusinessOffset = true, studyLoan = false, privateHospitalCover = true,
    registeredForGst = false, gstCredits = '0', invoice = '0' }) {
    const r = soleTraderSetAside({ year: incomeYear, income: businessIncome, expenses: businessExpenses, wages,
      deductions: otherDeductions, super: personalSuperContributions, offset: smallBusinessOffset, studyLoan,
      hospitalCover: privateHospitalCover, gst: registeredForGst, credits: gstCredits, invoice });
    return {
      businessProfit: dollars(r.profit), taxableIncome: dollars(r.taxable), smallBusinessIncomeTaxOffset: dollars(r.smallBusinessOffset),
      totalTaxLeviesAndRepayment: dollars(r.total), onWagesAlone: dollars(r.wagesTax), businessTax: dollars(r.businessTax),
      gst: dollars(r.gst), setAsideYear: dollars(r.setAside), setAsideQuarter: dollars(r.quarterly),
      setAsideMonth: dollars(r.monthly), setAsideWeek: dollars(r.weekly), invoiceSharePercent: r.invoiceShare.toFixed(2),
      setAsideFromInvoice: dollars(r.invoice.setAside), currency: 'AUD', source: `${INDIVIDUAL}sole-trader/`,
    };
  },
});

const INCOME_TESTS_DESCRIPTION = 'The income measures that the tax return of one person resident in Australia all year feeds, '
  + 'for 2024-25 to 2026-27, in '
  + 'whole AUD: income for surcharge purposes (Medicare levy surcharge), Division 293 income, rebate income (seniors and '
  + 'pensioners tax offset), repayment income (study and training loans), adjusted taxable income (dependant offsets) and '
  + 'the super co-contribution’s total income, with the reportable fringe benefits total, the adjusted fringe benefits '
  + 'total (section 57A amounts times 0.53, rounded down), total net investment loss and reportable super contributions. '
  + 'Every amount is whole dollars and 0 when omitted. It works the measures only; it does not decide the offsets, '
  + 'surcharge, repayment or co-contribution, a part-year or foreign resident, or the Services Australia income tests. '
  + `Sources on ${INDIVIDUAL}income-tests/.`;
/** The income tests tool's inputs and the engine's names for them. */
const INCOME_TEST_INPUTS = /** @type {const} */ ([['taxableIncome', 'taxable', 'Taxable income, including any assessable FHSS released amount.'],
  ['assessableFhssReleasedAmount', 'fhss', 'Assessable first home super saver released amount (ITAA 1997 s 313-20).'],
  ['familyTrustDistributionAmounts', 'familyTrust', 'Amounts on which family trust distribution tax was paid.'],
  ['reportableFringeBenefitsSection57a', 'fringe57a', 'Reportable fringe benefits from FBTAA s 57A exempt employers (IT1 label N).'],
  ['reportableFringeBenefitsOther', 'fringeOther', 'Reportable fringe benefits from other employers (IT1 label W).'],
  ['reportableEmployerSuperContributions', 'employerSuper', 'Reportable employer super contributions (IT2).'],
  ['deductiblePersonalSuperContributions', 'personalSuper', 'Personal super contributions deducted (D12).'],
  ['excessConcessionalContributions', 'excessConcessional', 'Excess concessional contributions for the year.'],
  ['netFinancialInvestmentLoss', 'financialLoss', 'Net financial investment loss (IT5).'],
  ['netRentalPropertyLoss', 'rentalLoss', 'Net rental property loss (IT6).'],
  ['taxFreeGovernmentPensions', 'pensions', 'Tax-free government pensions or benefits (IT3).'],
  ['targetForeignIncome', 'targetForeign', 'Target foreign income, including exempt foreign employment income (IT4).'],
  ['exemptForeignEmploymentIncome', 'exemptForeign', 'Exempt foreign employment income, net of the costs of earning it.'],
  ['childSupportPaid', 'childSupport', 'Child support paid (IT7).'],
  ['assessableIncome', 'assessable', 'Assessable income, at least the taxable income.'],
  ['businessDeductions', 'businessDeductions', 'Deductions from carrying on a business.']]);

const SUPER_PROJECTION_DESCRIPTION = 'A projection in AUD of one accumulation super account from 2026-27 to a retirement '
  + 'age of 60 to 75, a whole year at a time: employer contributions at their rate of salary up to the $270,830 maximum '
  + 'contribution base, 15% contributions tax on them and on salary sacrifice, after-tax contributions, a steady return '
  + 'after investment fees and tax earned on the opening balance and half the year\'s net flows, dollar and percentage '
  + 'administration fees and insurance premiums less the fund\'s 15% deduction for them; salary, contributions, fees, '
  + 'premiums and the base grow at the wage growth rate after the first year. The present value divides the final balance '
  + 'by (1 + the discount rate) per year (ASIC Instrument 2022/603 s 4: 3.7% by default; retirement at 67 by default). '
  + 'Refuses 2026-27 contributions above the $32,500 concessional or $130,000 non-concessional cap. It does not compute '
  + 'retirement income, the age pension, the low income super tax offset, co-contributions or Division 293 tax. A model '
  + 'on stated assumptions, not a prediction or a recommendation. '
  + `Sources and the reasons for each default on ${INDIVIDUAL}super-projection/.`;

/**
 * The WebMCP descriptor for the super projection calculator.
 * @param {typeof import('./super-projection.mjs').superProjection} superProjection
 */
function superProjectionTool(superProjection) {
  return tool({
    name: 'project_super_balance',
    title: 'Super projection calculator',
    description: SUPER_PROJECTION_DESCRIPTION,
    inputSchema: record({
      age: whole(15, 74, 'Age now in whole years.'),
      retirementAge: whole(15, 75, 'Retirement age in whole years; 67 when omitted; an age under 60, the preservation age, is taken as 60.'),
      balance: text('amount', 'Super balance now in AUD.'),
      salary: whole(0, 1e9, 'Salary for 2026-27 before salary sacrifice, the qualifying earnings the super guarantee is paid on, in whole AUD.'),
      employerRate: text('percent', 'Employer contributions as a per cent of salary, up to 30; "12" (the super guarantee) when omitted.'),
      salarySacrifice: text('amount', 'Salary sacrifice and personal deductible contributions for 2026-27 in AUD; "0" when omitted.'),
      afterTaxContributions: text('amount', 'After-tax contributions for 2026-27 in AUD; "0" when omitted.'),
      returnRate: text('percent', 'Return a year after investment fees and tax on earnings, per cent up to 20; "6.1" when omitted.'),
      adminFee: text('amount', 'Dollar administration fee for 2026-27 in AUD; "59" when omitted.'),
      percentFee: text('percent', 'Administration fee as a per cent of the balance a year, up to 5; "0.11" when omitted.'),
      insurancePremiums: text('amount', 'Insurance premiums for 2026-27 in AUD; "599" when omitted.'),
      wageGrowth: text('percent', 'Wage growth a year, per cent up to 10; "3.7" when omitted.'),
      discountRate: text('percent', 'Present value rate a year, per cent up to 10; "3.7" (ASIC Instrument 2022/603) when omitted.'),
    }, ['age', 'balance', 'salary']),
    run({ age, retirementAge = 67, balance, salary, employerRate = '12', salarySacrifice = '0', afterTaxContributions = '0',
      returnRate = '6.1', adminFee = '59', percentFee = '0.11', insurancePremiums = '599', wageGrowth = '3.7',
      discountRate = '3.7' }) {
      const r = superProjection({ age: String(age), retire: String(retirementAge), balance, salary: String(salary),
        employer: employerRate, sacrifice: salarySacrifice, afterTax: afterTaxContributions, returnRate, percentFee, adminFee,
        insurance: insurancePremiums, growth: wageGrowth, discount: discountRate });
      return {
        yearsProjected: r.years, retirementAge: r.retire, employerContributionsFirstYear: dollars(r.employer),
        concessionalContributionsFirstYear: dollars(r.concessional), contributionsAfterTax: dollars(r.contributed),
        earnings: dollars(r.earnings), feesAndPremiumsAfterDeduction: dollars(r.fees), balanceAtRetirement: dollars(r.balance),
        presentValue: dollars(r.present), currency: 'AUD', source: `${INDIVIDUAL}super-projection/`,
      };
    },
  });
}

const DIVISION_293_DESCRIPTION = 'Division 293 tax in AUD for one individual and income year (ITAA 1997 Division 293), '
  + 'for contributions to accumulation interests only. Division 293 income is taxable income less any assessable first '
  + 'home super saver released amount, plus income on which family trust distribution tax was paid, the reportable '
  + 'fringe benefits total and total net investment loss, less a super lump sum taxed element at the zero rate. Low tax '
  + 'contributions are the concessional contributions less excess concessional contributions over the year\'s cap, '
  + 'raised by unused cap carried forward when the total super balance just before the year was under $500,000. '
  + 'Taxable contributions are the lesser of the low tax contributions and the amount by which they plus Division 293 '
  + 'income exceed $250,000; the tax is 15% of them. It does not compute defined benefit interests, constitutionally '
  + 'protected funds, Commonwealth judges\' pensions, contributions the Commissioner disregarded or reallocated, or '
  + `interest, deferral or release from super. Sources on ${INDIVIDUAL}division-293/.`;

const SALARY_PACKAGING_DESCRIPTION = 'Salary packaging in AUD for one employee of an FBT-exempt employer for one year: a public '
  + 'benevolent institution or health promotion charity ($30,000 cap) or a public or not-for-profit hospital or public '
  + 'ambulance service ($17,000 cap), FBTAA s 57A. Type 1 and Type 2 benefits are grossed up at 2.0802 and 1.8868 to the '
  + 'dollar and added; FBT is 47% of the part above the cap after up to $5,000 more of salary packaged meal entertainment '
  + '(s 5B(1E)). The reportable fringe benefits amount is the taxable value over $2,000 times 1 / 0.53, cents dropped '
  + '(s 135Q). Tax, the Medicare levy and surcharge and any study loan repayment are worked with and without the '
  + 'packaging, the salary as the only income. It does not compute rebatable or ordinary employers, car parking, '
  + `package fees, other income or a spouse. Sources on ${INDIVIDUAL}salary-packaging/.`;
const NOVATED_LEASE_DESCRIPTION = 'A novated car lease in AUD for one year against paying the same costs from after-tax pay. '
  + 'The electric car exemption (FBTAA s 8A) applies to a battery electric or hydrogen fuel cell car first held and used '
  + 'on or after 1 July 2022, for a current employee, if no luxury car tax became payable before the benefit on a supply '
  + 'or importation. This calculator needs the same treatment for every benefit in the year. A plug-in hybrid qualifies from 1 April 2025 '
  + 'only under an earlier unchanged commitment. An exempt car '
  + 'is packaged wholly from pre-tax salary and its statutory formula value is reportable; otherwise the employee '
  + 'contribution method pays the taxable value after tax, ten elevenths of it towards the costs. Costs with GST are '
  + 'taken less the employer\'s GST credit. It does not compute lease payments, the residual, the operating cost method '
  + `or other income. Sources on ${INDIVIDUAL}novated-lease/.`;

/**
 * WebMCP descriptors for the income tax estimate, take-home pay, sole trader set-aside, Division 293, income
 * tests, bonus withholding, salary packaging, novated lease and super projection calculators, keyed by the
 * `data-calculator` name of the form whose page registers them.
 * @param {{taxEstimate: typeof import('./tax-estimate.mjs').taxEstimate,
 *   takeHomePay: typeof import('./take-home-pay.mjs').takeHomePay,
 *   soleTraderSetAside: typeof import('./sole-trader.mjs').soleTraderSetAside,
 *   division293Tax: typeof import('./division-293.mjs').division293Tax,
 *   incomeTests: typeof import('./income-tests.mjs').incomeTests, incomeYears: string[], payYears: string[],
 *   soleTraderYears: string[], division293Years: string[],
 *   bonusWithholding: typeof import('./bonus-withholding.mjs').bonusWithholding,
 *   salaryPackaging: typeof import('./salary-packaging.mjs').salaryPackaging,
 *   novatedLease: typeof import('./novated-lease.mjs').novatedLease, packagingYears: string[],
 *   novatedYears: string[], superProjection: typeof import('./super-projection.mjs').superProjection}} engines
 */
export function individualTaxTools({ taxEstimate, takeHomePay, soleTraderSetAside, division293Tax, incomeTests, incomeYears,
  payYears, soleTraderYears, division293Years, bonusWithholding, salaryPackaging, novatedLease, packagingYears,
  novatedYears, superProjection }) {
  return {
    'income-tests': incomeTestsTool(incomeTests),
    'income-tax': tool({
      name: 'estimate_income_tax',
      title: 'Income tax and refund estimate',
      description: INCOME_TAX_DESCRIPTION,
      inputSchema: record({
        incomeYear: choice(incomeYears, `Income year, ${incomeYears.at(-1)} to ${incomeYears[0]}.`),
        residency: RESIDENCY,
        taxableIncome: whole(0, 1e9, 'Taxable income in whole AUD.'),
        reportableFringeBenefits: dollarsOnly('Reportable fringe benefits total.'),
        reportableSuperContributions: dollarsOnly('Reportable super contributions, including salary sacrificed to super.'),
        totalNetInvestmentLoss: dollarsOnly('Total net investment loss.'),
        exemptForeignEmploymentIncome: dollarsOnly('Exempt foreign employment income, which counts only for the study loan.'),
        studyLoan: { type: 'boolean', description: 'true when the person has a HELP or other study or training loan.' },
        daysWithoutHospitalCover: whole(0, 366, 'Days in the year without private patient hospital cover; 0 when omitted.'),
        spouseIncome: whole(0, 1e9, 'A spouse all year: their income for surcharge purposes in whole AUD. Omit with no spouse.'),
        dependentChildren: whole(0, 20, 'Dependent children; 0 when omitted.'),
        taxWithheld: text('amount', 'Tax withheld over the year in AUD with at most 2 decimal places; "0" when omitted.'),
      }, ['incomeYear', 'residency', 'taxableIncome']),
      run({ incomeYear, residency, taxableIncome, reportableFringeBenefits = 0, reportableSuperContributions = 0,
        totalNetInvestmentLoss = 0, exemptForeignEmploymentIncome = 0, studyLoan = false, daysWithoutHospitalCover = 0,
        spouseIncome, dependentChildren = 0, taxWithheld = '0' }) {
        const r = taxEstimate({ year: incomeYear, residency, taxable: String(taxableIncome),
          fringe: String(reportableFringeBenefits), super: String(reportableSuperContributions),
          losses: String(totalNetInvestmentLoss), foreign: String(exemptForeignEmploymentIncome), studyLoan,
          uncoveredDays: String(daysWithoutHospitalCover), spouse: spouseIncome === undefined ? null : String(spouseIncome),
          children: String(dependentChildren), withheld: taxWithheld });
        return {
          taxOnTaxableIncome: dollars(r.tax), lowIncomeTaxOffset: dollars(r.offset), lowAndMiddleIncomeTaxOffset: dollars(r.lmito),
          medicareLevy: dollars(r.medicare), medicareLevySurcharge: dollars(r.surcharge), studyLoanRepayment: dollars(r.studyLoan),
          total: dollars(r.assessed), taxWithheld: dollars(r.withheld), ...settled(r.refund), currency: 'AUD',
          source: `${INDIVIDUAL}income-tax/`,
        };
      },
    }),
    'take-home-pay': tool({
      name: 'calculate_take_home_pay',
      title: 'Take-home pay calculator',
      description: TAKE_HOME_DESCRIPTION,
      inputSchema: record({
        incomeYear: choice(payYears, `Income year, ${payYears.at(-1)} to ${payYears[0]}.`),
        residency: RESIDENCY,
        salary: text('amount', 'Salary for each pay period in AUD with at most 2 decimal places.'),
        payPeriod: choice(['year', 'month', 'fortnight', 'week'], 'The period the salary and sacrifice are for; "year" when omitted.'),
        includesSuper: { type: 'boolean', description: 'true when the salary is a package including super guarantee; false when omitted.' },
        salarySacrifice: text('amount', 'Salary sacrificed to super each pay period in AUD; "0" when omitted.'),
        studyLoan: { type: 'boolean', description: 'true when the person has a HELP or other study or training loan.' },
        privateHospitalCover: { type: 'boolean', description: 'false when the person had no private patient hospital cover all year; true when omitted.' },
      }, ['incomeYear', 'residency', 'salary']),
      run({ incomeYear, residency, salary, payPeriod = 'year', includesSuper = false, salarySacrifice = '0', studyLoan = false,
        privateHospitalCover = true }) {
        const r = takeHomePay({ year: incomeYear, residency, salary, period: payPeriod, includesSuper,
          sacrifice: salarySacrifice, studyLoan, hospitalCover: privateHospitalCover });
        const cents = (/** @type {number} */ value) => Math.round(value * 100);
        return {
          salaryForYear: dollars(r.salary), salarySacrificed: dollars(r.sacrifice), superGuarantee: dollars(r.superGuarantee),
          standardDeduction: dollars(r.deduction), taxableIncome: dollars(r.taxable),
          incomeTaxLessOffsets: dollars((cents(r.tax) - cents(r.offset) - cents(r.lmito)) / 100), medicareLevy: dollars(r.medicare),
          medicareLevySurcharge: dollars(r.surcharge), studyLoanRepayment: dollars(r.studyLoan), takeHomeYear: dollars(r.net),
          takeHomeMonth: dollars(r.monthly), takeHomeFortnight: dollars(r.fortnightly), takeHomeWeek: dollars(r.weekly),
          concessionalOverCap: dollars(r.overCap), division293TaxableContributions: dollars(r.division293),
          paygWithholding: r.withheld ? { eachPay: dollars(r.withheld.total), studyLoanComponent: dollars(r.withheld.studyLoan),
            studyLoanComponentBefore24September2025: r.withheld.earlierStudyLoan === null ? null
              : dollars(r.withheld.earlierStudyLoan),
            year: dollars(r.withheld.year), ...settled(r.withheld.refund) } : null,
          currency: 'AUD', source: `${INDIVIDUAL}take-home-pay/`,
        };
      },
    }),
    'super-projection': superProjectionTool(superProjection),
    'sole-trader': soleTraderTool(soleTraderSetAside, soleTraderYears),
    'division-293': division293Tool({ division293Tax, division293Years }),
    'bonus-withholding': bonusWithholdingTool(bonusWithholding),
    'salary-packaging': salaryPackagingTool(salaryPackaging, packagingYears),
    'novated-lease': novatedLeaseTool(novatedLease, novatedYears),
  };
}

/** The WebMCP descriptor for the income tests calculator.
 * @param {typeof import('./income-tests.mjs').incomeTests} incomeTests */
function incomeTestsTool(incomeTests) {
  return tool({
    name: 'calculate_income_tests',
    title: 'Income tests calculator',
    description: INCOME_TESTS_DESCRIPTION,
    inputSchema: record(Object.fromEntries(INCOME_TEST_INPUTS.map(([name, , description]) => [name, dollarsOnly(description)])),
      ['taxableIncome']),
    run(input) {
      const parts = Object.fromEntries(INCOME_TEST_INPUTS.map(([name, key]) => [key, String(input[name] ?? 0)]));
      const r = incomeTests(/** @type {import('./income-tests.mjs').IncomeTestParts} */ ({ ...parts, resident: true }));
      return {
        incomeForSurchargePurposes: dollars(r.surchargeIncome), division293Income: dollars(r.division293Income),
        rebateIncome: dollars(r.rebateIncome), repaymentIncome: dollars(r.repaymentIncome),
        adjustedTaxableIncome: dollars(r.adjustedTaxableIncome), coContributionTotalIncome: dollars(r.coContributionIncome),
        reportableFringeBenefitsTotal: dollars(r.fringeTotal), adjustedFringeBenefitsTotal: dollars(r.adjustedFringe),
        totalNetInvestmentLoss: dollars(r.losses), reportableSuperContributions: dollars(r.contributions),
        currency: 'AUD', source: `${INDIVIDUAL}income-tests/`,
      };
    },
  });
}

/** The WebMCP descriptor for the salary packaging calculator.
 * @param {typeof import('./salary-packaging.mjs').salaryPackaging} salaryPackaging @param {string[]} packagingYears */
function salaryPackagingTool(salaryPackaging, packagingYears) {
  return tool({
    name: 'calculate_salary_packaging',
    title: 'Salary packaging calculator',
    description: SALARY_PACKAGING_DESCRIPTION,
    inputSchema: record({
      incomeYear: choice(packagingYears, `Income year, ${packagingYears.at(-1)} to ${packagingYears[0]}.`),
      residency: choice(['resident', 'foreign'], 'Residency for tax purposes all year.'),
      employer: choice(['charity', 'hospital'], 'charity: public benevolent institution or health promotion charity; '
        + 'hospital: public or not-for-profit hospital, or public ambulance service for an employee predominantly in or '
        + 'supporting its ambulance services.'),
      salary: whole(0, 1e9, 'Salary for the year before packaging, without super, in whole AUD.'),
      typeTwoBenefits: text('amount', 'Benefits the employer gets no GST credit for, at taxable value in AUD; "0" when omitted.'),
      typeOneBenefits: text('amount', 'Benefits the employer claims a GST credit for, at taxable value in AUD; "0" when omitted.'),
      mealEntertainment: text('amount', 'Salary packaged meal entertainment and venue hire in AUD; "0" when omitted.'),
      mealEntertainmentTypeOne: { type: 'boolean', description: 'true when the employer claims GST credits on it; true when omitted.' },
      studyLoan: { type: 'boolean', description: 'true when the person has a HELP or other study or training loan.' },
      privateHospitalCover: { type: 'boolean', description: 'false when the person had no private patient hospital cover all year; true when omitted.' },
    }, ['incomeYear', 'residency', 'employer', 'salary']),
    run({ incomeYear, residency, employer, salary, typeTwoBenefits = '0', typeOneBenefits = '0', mealEntertainment = '0',
      mealEntertainmentTypeOne = true, studyLoan = false, privateHospitalCover = true }) {
      const r = salaryPackaging({ year: incomeYear, residency, employer, salary: String(salary), typeTwo: typeTwoBenefits,
        typeOne: typeOneBenefits, meals: mealEntertainment, mealsTypeOne: mealEntertainmentTypeOne, studyLoan,
        hospitalCover: privateHospitalCover });
      return {
        packaged: dollars(r.packaged), grossedUp: dollars(r.grossed), cap: dollars(r.cap), mealEntertainmentAllowed: dollars(r.mealAllowance),
        liableToFbt: dollars(r.excess), fbt: dollars(r.fbt), reportableFringeBenefits: dollars(r.reportable),
        owedWithout: dollars(r.owedBefore), owedWith: dollars(r.owedAfter), taxSaved: dollars(r.saved), gainAfterFbt: dollars(r.gain),
        roomUnderCapTypeTwo: dollars(r.roomTypeTwo), currency: 'AUD', source: `${INDIVIDUAL}salary-packaging/`,
      };
    },
  });
}

/** The WebMCP descriptor for the Division 293 tax calculator.
 * @param {{division293Tax: typeof import('./division-293.mjs').division293Tax, division293Years: string[]}} engines */
function division293Tool({ division293Tax, division293Years }) {
  return tool({
    name: 'calculate_division_293_tax',
    title: 'Division 293 tax calculator',
    description: DIVISION_293_DESCRIPTION,
    inputSchema: record({
      incomeYear: choice(division293Years, `Income year, ${division293Years.at(-1)} to ${division293Years[0]}.`),
      accumulationOnly: { type: 'boolean', description: 'true when every contribution is to an accumulation interest; false refuses.' },
      taxableIncome: whole(0, 1e9, 'Taxable income in whole AUD, including any excess concessional contributions assessed.'),
      reportableFringeBenefits: dollarsOnly('Reportable fringe benefits total.'),
      totalNetInvestmentLoss: dollarsOnly('Total net investment loss, financial and rental.'),
      familyTrustDistributionIncome: dollarsOnly('Income on which family trust distribution tax was paid.'),
      assessableFhssReleasedAmount: dollarsOnly('Assessable first home super saver released amount in taxable income.'),
      zeroRateLumpSum: dollarsOnly('Taxable component of a super lump sum taxed at 0% (s 301-20(3)), received from preservation age to under 60: 2023-24 and earlier only.'),
      concessionalContributions: text('amount', 'Concessional contributions for the financial year in AUD with at most 2 decimal places.'),
      unusedCapCarriedForward: text('amount', 'Unapplied unused concessional cap from the previous 5 years in AUD; "0" when omitted.'),
      totalSuperBalanceUnder500k: { type: 'boolean', description: 'true when the total super balance just before the year was under $500,000; false when omitted.' },
    }, ['incomeYear', 'accumulationOnly', 'taxableIncome', 'concessionalContributions']),
    run({ incomeYear, accumulationOnly, taxableIncome, reportableFringeBenefits = 0, totalNetInvestmentLoss = 0,
      familyTrustDistributionIncome = 0, assessableFhssReleasedAmount = 0, zeroRateLumpSum = 0, concessionalContributions,
      unusedCapCarriedForward = '0', totalSuperBalanceUnder500k = false }) {
      const r = division293Tax({ year: incomeYear, interests: accumulationOnly ? 'accumulation' : 'other',
        taxable: String(taxableIncome), fringe: String(reportableFringeBenefits), losses: String(totalNetInvestmentLoss),
        trust: String(familyTrustDistributionIncome), fhss: String(assessableFhssReleasedAmount), lumpSum: String(zeroRateLumpSum),
        concessional: concessionalContributions, unused: unusedCapCarriedForward, balanceUnder: totalSuperBalanceUnder500k });
      return {
        division293Income: dollars(r.income), concessionalContributionsCap: dollars(r.cap), unusedCapApplied: dollars(r.carried),
        excessConcessionalContributions: dollars(r.excess), lowTaxContributions: dollars(r.low), overThreshold: dollars(r.over),
        taxableContributions: dollars(r.taxable), division293Tax: dollars(r.tax), roomUnderThreshold: dollars(r.room),
        currency: 'AUD', source: `${INDIVIDUAL}division-293/`,
      };
    },
  });
}

/** The WebMCP descriptor for the novated lease calculator.
 * @param {typeof import('./novated-lease.mjs').novatedLease} novatedLease @param {string[]} novatedYears */
function novatedLeaseTool(novatedLease, novatedYears) {
  return tool({
    name: 'calculate_novated_lease',
    title: 'Novated lease calculator',
    description: NOVATED_LEASE_DESCRIPTION,
    inputSchema: record({
      incomeYear: choice(novatedYears, `Income year, ${novatedYears.at(-1)} to ${novatedYears[0]}.`),
      residency: choice(['resident', 'foreign'], 'Residency for tax purposes all year.'),
      salary: whole(0, 1e9, 'Salary for the year before the lease, without super, in whole AUD.'),
      car: choice(['bev', 'fcev', 'phev', 'other'], 'bev: battery electric; fcev: hydrogen fuel cell; phev: plug-in hybrid; other.'),
      firstHeldAndUsed: text('date', 'YYYY-MM-DD when the car was first both held and used, including availability for use by anyone.'),
      phevCommitment: { type: 'boolean', description: 'Plug-in hybrid: true when its private use or availability was exempt before 1 April 2025 under a commitment still unchanged; false when omitted.' },
      firstSaleYear: choice(['2026-27', '2025-26', '2024-25', '2023-24', '2022-23', '2021-22'], 'Financial year of the car\'s first retail sale.'),
      costPrice: text('amount', 'Cost price with GST and dealer-fitted options, without registration and stamp duty, in AUD.'),
      luxuryCarTaxOnOtherSupply: { type: 'boolean', description: 'true when luxury car tax became payable on a supply '
        + 'other than the first retail sale (a sale, lease or hire) or on an importation; '
        + 'false when omitted.' },
      luxuryCarTaxTiming: choice(['before-all', 'after-all', 'mixed-or-unknown'],
        'If luxury car tax became payable, when it first did so relative to the benefits counted in the FBT year. '
        + 'Required when the sale year and the other supply facts leave the timing unresolved. Mixed or unknown timing then prevents an estimate.'),
      heldOverFourYears: { type: 'boolean', description: 'true when the lessor held the car more than 4 years before the FBT year; false when omitted.' },
      daysAvailable: whole(0, 366, 'Days in the FBT year ending 31 March when the car was used or available for private use by the employee or an associate, including deemed availability when it was garaged at or near either home.'),
      costsWithGst: text('amount', 'Yearly lease payments and running costs that include GST, in AUD.'),
      costsWithoutGst: text('amount', 'Yearly costs without GST, such as registration, in AUD; "0" when omitted.'),
      studyLoan: { type: 'boolean', description: 'true when the person has a HELP or other study or training loan.' },
      privateHospitalCover: { type: 'boolean', description: 'false when the person had no private patient hospital cover all year; true when omitted.' },
    }, ['incomeYear', 'residency', 'salary', 'car', 'firstHeldAndUsed', 'firstSaleYear', 'costPrice', 'daysAvailable',
      'costsWithGst']),
    run({ incomeYear, residency, salary, car, firstHeldAndUsed, phevCommitment = false, firstSaleYear, costPrice,
      luxuryCarTaxOnOtherSupply = false, luxuryCarTaxTiming, heldOverFourYears = false, daysAvailable, costsWithGst,
      costsWithoutGst = '0', studyLoan = false, privateHospitalCover = true }) {
      const r = novatedLease({ year: incomeYear, residency, salary: String(salary), studyLoan, hospitalCover: privateHospitalCover,
        kind: car, firstUsed: firstHeldAndUsed, commitment: phevCommitment, saleYear: firstSaleYear,
        price: costPrice, otherSupply: luxuryCarTaxOnOtherSupply, lctTiming: luxuryCarTaxTiming, reduced: heldOverFourYears,
        days: String(daysAvailable),
        gstCosts: costsWithGst, otherCosts: costsWithoutGst });
      const way = (/** @type {{preTax: number, postTax: number, reportable: number, owed: number, saving: number} | null} */ c) => (c
        ? { preTax: dollars(c.preTax), postTax: dollars(c.postTax), reportableFringeBenefits: dollars(c.reportable), owed: dollars(c.owed),
          saving: dollars(c.saving) } : null);
      return {
        exempt: r.exempt, reasonNotExempt: r.reason, statutoryValue: dollars(r.taxableValue), luxuryCarTaxThreshold: dollars(r.threshold),
        costs: dollars(r.costs), costsLessGstCredits: dollars(r.netCosts), owedPayingAfterTax: dollars(r.owedWithout),
        exemptCase: way(r.exemptCase), employeeContributionMethod: way(r.contribution), currency: 'AUD',
        source: `${INDIVIDUAL}novated-lease/`,
      };
    },
  });
}

/** The WebMCP descriptor for the bonus and back payment withholding calculator.
 * @param {typeof import('./bonus-withholding.mjs').bonusWithholding} bonusWithholding */
function bonusWithholdingTool(bonusWithholding) {
  return tool({
    name: 'calculate_bonus_withholding',
    title: 'Bonus withholding calculator',
    description: BONUS_WITHHOLDING_DESCRIPTION,
    inputSchema: record({
      payPeriod: choice(['week', 'fortnight', 'month'], 'How often the payee is paid.'),
      residency: choice(['resident', 'foreign'], 'resident: an Australian resident claiming the tax-free threshold (scale 2); '
        + 'foreign: a foreign resident (scale 3).'),
      studyLoan: { type: 'boolean', description: 'true when the payee has a HELP or other study or training loan; false when omitted.' },
      method: choice(['A', 'B'], 'Schedule 5 Method A, or Method B with B(i) and B(ii).'),
      earnings: text('amount', 'Gross earnings this pay without any additional payment, in AUD.'),
      additionalPayment: text('amount', 'The bonus, commission or other additional payment in AUD; under Method B, the part '
        + 'worked by B(ii). "0" when omitted.'),
      spreadOverPays: whole(2, 52, 'Method A: pays to spread the payment over: the pays in a year, or for a commission or bonus '
        + 'for a defined period under 12 months, the pays it covers; the pays in a year when omitted.'),
      backPayPays: whole(0, 52, 'Method B(i): earlier pays this year the back payment covers; 0 when omitted.'),
      backPayEach: text('amount', 'Method B(i): back payment for each of those pays in AUD; "0" when omitted.'),
      backPayPayEarnings: text('amount', 'Method B(i): earnings each of those pays had before it in AUD; "0" when omitted.'),
      backPayPayWithheld: text('amount', 'Method B(i): amount withheld from each of those pays in AUD; "0" when omitted.'),
      earningsToDate: text('amount', 'Method B(ii): normal earnings this year to date, with this pay and B(i) back payments '
        + 'made in earlier pays (not this pay’s), in AUD; "0" when omitted.'),
      paysToDate: whole(1, 53, 'Method B(ii): pays this year to date, with this pay; 1 when omitted.'),
      earlierAdditionalPayments: text('amount', 'Method B(ii): earlier additional payments this year worked by B(ii), in AUD; '
        + '"0" when omitted.'),
      earlierAdditionalWithheld: text('amount', 'Method B(ii): amount withheld from those payments, in AUD; "0" when omitted.'),
    }, ['payPeriod', 'residency', 'method', 'earnings']),
    run({ payPeriod, residency, studyLoan = false, method, earnings, additionalPayment = '0', spreadOverPays, backPayPays = 0,
      backPayEach = '0', backPayPayEarnings = '0', backPayPayWithheld = '0', earningsToDate = '0', paysToDate = 1,
      earlierAdditionalPayments = '0', earlierAdditionalWithheld = '0' }) {
      const spread = spreadOverPays ?? { week: 52, fortnight: 26, month: 12 }[/** @type {string} */ (payPeriod)];
      const r = bonusWithholding({ period: payPeriod, residency, studyLoan, method, earnings, additional: additionalPayment,
        spread: String(spread), backPays: String(backPayPays), backEarnings: backPayPayEarnings, backEach: backPayEach,
        backWithheld: backPayPayWithheld, yearToDate: earningsToDate, paysToDate: String(paysToDate),
        earlierAdditional: earlierAdditionalPayments, earlierWithheld: earlierAdditionalWithheld });
      const parts = r.method === 'A' ? { withheldOnAdditionalPayment: dollars(r.onAdditional), limit: dollars(r.limit),
        beforeLimit: dollars(r.step7.total), taxAddedToYear: dollars(r.yearTax) }
        : { methodBi: r.methodBi ? dollars(r.methodBi.onBackPayment) : null,
          methodBii: r.methodBii ? dollars(r.methodBii.onAdditional) : null };
      return { method: r.method, withheldOnEarnings: dollars(r.onEarnings), ...parts, totalWithheld: dollars(r.total),
        currency: 'AUD', source: `${INDIVIDUAL}bonus-withholding/` };
    },
  });
}
