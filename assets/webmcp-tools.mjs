// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// WebMCP tool descriptors for the site's calculators. Each tool calls the same module
// function as its page's form, reads nothing from the form and sends nothing anywhere.
// https://webmachinelearning.github.io/webmcp/
//
// Every input is held to its tool's own inputSchema before a calculator runs: a value of
// the wrong type, outside its pattern, range or list, or under a name the schema does not
// declare is refused, never converted or dropped.

/** The patterns string inputs must match. A schema carries each one as its `source`. */
const PATTERNS = {
  amount: /^\d{1,9}(?:\.\d{1,2})?$/,
  percent: /^\d{1,3}(?:\.\d{1,2})?$/,
  rate: /^\d{1,3}(?:\.\d{1,4})?$/,
  cost: /^\d{1,10}(?:\.\d{1,2})?$/,
  life: /^(?:\d{1,3}(?:\.\d{1,4})?|(?:\d{1,3} )?\d{1,2}\/\d{1,2})$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  month: /^\d{4}-(?:0[1-9]|1[0-2])$/,
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

/** @param {typeof import('./business-calculators.mjs').foreignSurcharge} foreignSurcharge */
const foreignSurchargeTool = (foreignSurcharge) => tool({
  name: 'calculate_foreign_purchaser_surcharges',
  title: 'Foreign purchaser surcharge calculator',
  description: 'One buyer\'s foreign purchaser duty surcharge in AUD on its share of one property, and the foreign owner land tax '
    + 'surcharge for a full year, in one Australian state or territory, each with that jurisdiction\'s own test of whether the '
    + 'buyer is foreign, worded as the result. The Northern Territory charges neither, the ACT no duty surcharge, and Western '
    + 'Australia and South Australia no land tax surcharge. It does not work out exemptions, refunds or relief, which each '
    + 'Commissioner decides, or the status of a partner or retirement visa holder.',
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
    return {
      dutySurchargeRatePercent: r.dutyRate, dutySurcharge: dollars(r.duty), dutyTest: r.dutyTest,
      landTaxSurcharge: dollars(r.land), landTaxTest: r.landTest, currency: 'AUD',
      basis: 'Each jurisdiction\'s rate and test of a foreign buyer as its revenue office states them, read 18 November 2026; the revenue office decides.',
      source: `${CALCULATORS}foreign-surcharge/`,
    };
  },
});

/** Tools keyed by the `data-calculator` name of the form whose page registers them.
 * @param {Pick<typeof import('./business-calculators.mjs'), 'gst' | 'div7aMinimumRepayment' | 'financeSchedule' | 'interestByIncomeYear'
 *   | 'breakEven' | 'companyTax' | 'foreignSurcharge'>} calculate */
export function calculatorTools(calculate) {
  return {
    gst: gstTool(calculate.gst),
    div7a: div7aTool(calculate.div7aMinimumRepayment),
    loan: financeTool(calculate, false),
    'hire-purchase': financeTool(calculate, true),
    'break-even': breakEvenTool(calculate.breakEven),
    'company-tax': companyTaxTool(calculate.companyTax),
    'foreign-surcharge': foreignSurchargeTool(calculate.foreignSurcharge),
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
  + '2026-27 weekly, fortnightly or monthly pay of a resident (scale 2, tax-free threshold claimed) or a foreign '
  + 'resident (scale 3) it also gives the PAYG withheld each pay under the ATO\'s Schedules 1 and 8 and the refund '
  + 'or amount owing over the year; for a working holiday maker it gives none. '
  + 'It names, but does not work, concessional contributions above the cap and Division 293 taxable '
  + `contributions. Sources on ${INDIVIDUAL}take-home-pay/.`;

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
    otherDeductions: text('amount', 'Tax agent fees, gifts and personal super contributions claimed, in AUD; "0" when omitted.'),
    smallBusinessOffset: { type: 'boolean', description: 'false when the business does not qualify for the small business '
      + 'income tax offset (aggregated turnover of $5 million or more, or personal services income outside a personal '
      + 'services business); true when omitted.' },
    studyLoan: { type: 'boolean', description: 'true when the person has a HELP or other study or training loan.' },
    privateHospitalCover: { type: 'boolean', description: 'false when the person had no private patient hospital cover all year; true when omitted.' },
    registeredForGst: { type: 'boolean', description: 'true when the business is registered for GST; false when omitted.' },
    gstCredits: text('amount', 'GST credits on business purchases for the year, in AUD; "0" when omitted.'),
    invoice: text('amount', 'One invoice as charged, GST included when registered, in AUD; "0" when omitted.'),
  }, ['incomeYear', 'businessIncome']),
  run({ incomeYear, businessIncome, businessExpenses = '0', wages = '0', otherDeductions = '0', smallBusinessOffset = true,
    studyLoan = false, privateHospitalCover = true, registeredForGst = false, gstCredits = '0', invoice = '0' }) {
    const r = soleTraderSetAside({ year: incomeYear, income: businessIncome, expenses: businessExpenses, wages,
      deductions: otherDeductions, offset: smallBusinessOffset, studyLoan, hospitalCover: privateHospitalCover,
      gst: registeredForGst, credits: gstCredits, invoice });
    return {
      businessProfit: dollars(r.profit), taxableIncome: dollars(r.taxable), smallBusinessIncomeTaxOffset: dollars(r.smallBusinessOffset),
      totalTaxLeviesAndRepayment: dollars(r.total), onWagesAlone: dollars(r.wagesTax), businessTax: dollars(r.businessTax),
      gst: dollars(r.gst), setAsideYear: dollars(r.setAside), setAsideQuarter: dollars(r.quarterly),
      setAsideMonth: dollars(r.monthly), setAsideWeek: dollars(r.weekly), invoiceSharePercent: r.invoiceShare.toFixed(2),
      setAsideFromInvoice: dollars(r.invoice.setAside), currency: 'AUD', source: `${INDIVIDUAL}sole-trader/`,
    };
  },
});

/**
 * WebMCP descriptors for the income tax estimate, take-home pay and sole trader set-aside calculators,
 * keyed by the `data-calculator` name of the form whose page registers them.
 * @param {{taxEstimate: typeof import('./tax-estimate.mjs').taxEstimate,
 *   takeHomePay: typeof import('./take-home-pay.mjs').takeHomePay,
 *   soleTraderSetAside: typeof import('./sole-trader.mjs').soleTraderSetAside, incomeYears: string[], payYears: string[],
 *   soleTraderYears: string[]}} engines
 */
export function individualTaxTools({ taxEstimate, takeHomePay, soleTraderSetAside, incomeYears, payYears, soleTraderYears }) {
  return {
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
            year: dollars(r.withheld.year), ...settled(r.withheld.refund) } : null,
          currency: 'AUD', source: `${INDIVIDUAL}take-home-pay/`,
        };
      },
    }),
    'sole-trader': soleTraderTool(soleTraderSetAside, soleTraderYears),
  };
}
