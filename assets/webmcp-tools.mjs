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

/** @param {typeof import('./business-calculators.mjs').loan} loan */
const loanTool = (loan) => tool({
  name: 'calculate_loan_payment',
  title: 'Monthly loan payment calculator',
  description: 'Fixed monthly payment in AUD on an amortising loan with payments at the end or the start of each month, '
    + 'interest at the annual rate divided by 12 and an optional balloon owed at the end of the term, with the '
    + 'interest in the first payment and the total interest, each rounded half up to the cent, and the first '
    + 'payment\'s principal as the payment less that interest. '
    + 'Planning estimate only: a lender\'s fees, rounding and payment dates can differ.',
  inputSchema: record({
    principal: text('amount', 'Amount borrowed in AUD with at most 2 decimal places, for example "100000".'),
    annualRate: text('rate', 'Annual interest rate in per cent with at most 4 decimal places, for example "6" or "6.25".'),
    months: whole(1, 600, 'Number of monthly payments.'),
    balloon: text('amount', 'Balloon or residual owed at the end of the term in AUD with at most 2 decimal places, '
      + 'no more than the principal; "0" or omitted for none.'),
    timing: choice(['arrears', 'advance'], '"arrears" (or omitted) for payments at the end of each month, "advance" for the start.'),
  }, ['principal', 'annualRate', 'months']),
  run({ principal, annualRate, months, balloon = '0', timing = 'arrears' }) {
    const r = loan(principal, annualRate, String(months), balloon, timing);
    return {
      monthlyPayment: dollars(r.payment), firstInterest: dollars(r.firstInterest),
      firstPrincipal: dollars(r.firstPrincipal), totalInterest: dollars(r.totalInterest), currency: 'AUD',
      source: `${CALCULATORS}loan/`,
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

/** Tools keyed by the `data-calculator` name of the form whose page registers them.
 * @param {Pick<typeof import('./business-calculators.mjs'), 'gst' | 'div7aMinimumRepayment' | 'loan' | 'breakEven'>} calculate */
export function calculatorTools(calculate) {
  return {
    gst: gstTool(calculate.gst),
    div7a: div7aTool(calculate.div7aMinimumRepayment),
    loan: loanTool(calculate.loan),
    'break-even': breakEvenTool(calculate.breakEven),
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
