import { explainLevyResult, money } from './levy-explanation.mjs';
import {
  annualSalaryWages,
  baseRateWages,
  CASUAL_METHOD_CHANGE_MONTH,
  casualWages,
  grossUp,
  LEVY_RATE_AS_AT,
  LEVY_RATE_DENOMINATOR,
  LEVY_RATE_NUMERATOR,
  levyCents,
  toCents,
} from './levy.mjs';

const MAX_DOLLARS = 100_000_000;
const MAX_BONUSES = 50;
const PAGE_REVIEWED = '2026-08-28';
const ESTIMATE_BOUNDARY =
  'Estimate only. General information, not legal, tax, accounting or financial advice, and not a lodgement channel.';
const ROUNDING_BOUNDARY =
  'The levy is rounded half up to the nearest cent at the final step only; no published rule was identified.';

const BONUS_FREQUENCIES = [
  'weekly',
  'fortnightly',
  'monthly',
  'quarterly',
  'halfYearly',
  'annually',
];

const SOURCES = [
  {
    label: 'Payroll Levy Collection Act 1992',
    url: 'https://www.legislation.gov.au/C2004A04352/latest/text',
  },
  {
    label: 'Payroll Levy Regulations 2018',
    url: 'https://www.legislation.gov.au/F2018L00217/latest/text',
  },
  {
    label: 'Coal LSL eligible wages guidance',
    url: 'https://coallsl.com.au/guidance-notes/eligible-wages',
  },
  {
    label: 'Coal LSL governing legislation',
    url: 'https://coallsl.com.au/about-us/governing-legislation/legislation',
  },
  { label: 'Coal LSL', url: 'https://coallsl.com.au' },
];

const amountSchema = {
  type: 'number',
  minimum: 0,
  maximum: MAX_DOLLARS,
  description: 'Fabricated monthly amount in Australian dollars.',
};

const bonusSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    amount: amountSchema,
    frequency: {
      type: 'string',
      enum: BONUS_FREQUENCIES,
      description: 'How often the bonus is paid.',
    },
  },
  required: ['amount', 'frequency'],
};

const calculationInputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    branch: {
      type: 'string',
      enum: ['base_rate', 'annual_salary', 'casual'],
      description: 'Section 3B payment branch.',
    },
    baseRate: amountSchema,
    annualSalary: amountSchema,
    salarySacrifice: amountSchema,
    overtimeAndPenalties: amountSchema,
    allowances: amountSchema,
    reportingMonth: {
      type: 'string',
      pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
      description: 'Casual reporting month in YYYY-MM form.',
    },
    instrumentSpecifiesLoading: { type: 'boolean' },
    loadingQuantifiable: { type: 'boolean' },
    casualBasePay: amountSchema,
    casualLoading: amountSchema,
    ordinaryPay: amountSchema,
    bonuses: {
      type: 'array',
      maxItems: MAX_BONUSES,
      items: bonusSchema,
    },
  },
  required: ['branch'],
  oneOf: [
    {
      properties: { branch: { const: 'base_rate' } },
      required: ['baseRate'],
    },
    {
      properties: { branch: { const: 'annual_salary' } },
      required: ['annualSalary'],
    },
    {
      properties: { branch: { const: 'casual' } },
      required: ['reportingMonth'],
    },
  ],
};

const fixtureScenarios = {
  D1: { branch: 'base_rate', baseRate: 6000 },
  D2: {
    branch: 'base_rate',
    baseRate: 6000,
    overtimeAndPenalties: 3000,
    allowances: 500,
  },
  D3: { branch: 'base_rate', baseRate: 6000, overtimeAndPenalties: 2000 },
  D4: { branch: 'base_rate', baseRate: 6000, overtimeAndPenalties: 2500 },
  D5: {
    branch: 'base_rate',
    baseRate: 6000,
    bonuses: [{ amount: 400, frequency: 'monthly' }],
  },
  D6: {
    branch: 'base_rate',
    baseRate: 6000,
    bonuses: [{ amount: 12000, frequency: 'annually' }],
  },
  D7: { branch: 'base_rate', baseRate: 5000, salarySacrifice: 1000 },
  D8: {
    branch: 'annual_salary',
    annualSalary: 10000,
    bonuses: [{ amount: 200, frequency: 'monthly' }],
  },
  D9: {
    branch: 'casual',
    reportingMonth: '2026-06',
    instrumentSpecifiesLoading: true,
    loadingQuantifiable: true,
    casualBasePay: 1800,
    casualLoading: 450,
  },
  D10: {
    branch: 'casual',
    reportingMonth: '2026-06',
    instrumentSpecifiesLoading: true,
    loadingQuantifiable: false,
    ordinaryPay: 2250,
  },
  D11: { branch: 'casual', reportingMonth: '2023-12', casualBasePay: 1800 },
  D11b: {
    branch: 'casual',
    reportingMonth: '2024-01',
    instrumentSpecifiesLoading: true,
    loadingQuantifiable: true,
    casualBasePay: 1800,
    casualLoading: 450,
  },
  D12: { branch: 'base_rate', baseRate: 0 },
};

const methodFixtures = {
  base_rate: 'D2',
  annual_salary: 'D8',
  casual_quantifiable_loading: 'D9',
  casual_ordinary_rate: 'D10',
  casual_pre_2024: 'D11',
};

const registeredContexts = new WeakSet();

function assertObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function assertKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new TypeError(`${label} contains unsupported fields: ${unknown.join(', ')}`);
  }
}

function requireField(value, key, label = 'scenario') {
  if (!Object.hasOwn(value, key)) {
    throw new TypeError(`${label}.${key} is required`);
  }
  return value[key];
}

function amount(value, key, { required = false } = {}) {
  if (!Object.hasOwn(value, key)) {
    if (required) throw new TypeError(`scenario.${key} is required`);
    return 0;
  }
  const dollars = value[key];
  if (
    typeof dollars !== 'number'
    || !Number.isFinite(dollars)
    || dollars < 0
    || dollars > MAX_DOLLARS
  ) {
    throw new TypeError(
      `scenario.${key} must be a finite amount from 0 to ${MAX_DOLLARS} dollars`,
    );
  }
  return dollars;
}

function bonuses(value) {
  if (!Object.hasOwn(value, 'bonuses')) return [];
  if (!Array.isArray(value.bonuses) || value.bonuses.length > MAX_BONUSES) {
    throw new TypeError(`scenario.bonuses must contain at most ${MAX_BONUSES} items`);
  }
  return value.bonuses.map((bonus, index) => {
    assertObject(bonus, `scenario.bonuses[${index}]`);
    assertKeys(
      bonus,
      new Set(['amount', 'frequency']),
      `scenario.bonuses[${index}]`,
    );
    const bonusAmount = requireField(bonus, 'amount', `scenario.bonuses[${index}]`);
    if (
      typeof bonusAmount !== 'number'
      || !Number.isFinite(bonusAmount)
      || bonusAmount < 0
      || bonusAmount > MAX_DOLLARS
    ) {
      throw new TypeError(`scenario.bonuses[${index}].amount is invalid`);
    }
    const frequency = requireField(bonus, 'frequency', `scenario.bonuses[${index}]`);
    if (!BONUS_FREQUENCIES.includes(frequency)) {
      throw new TypeError(`scenario.bonuses[${index}].frequency is invalid`);
    }
    return { amount: bonusAmount, frequency };
  });
}

function rejectPresent(value, keys, branch) {
  const present = keys.filter((key) => Object.hasOwn(value, key));
  if (present.length) {
    throw new TypeError(`${branch} does not accept fields: ${present.join(', ')}`);
  }
}

function calculateBaseRate(value, inputBonuses) {
  assertKeys(
    value,
    new Set([
      'branch',
      'baseRate',
      'salarySacrifice',
      'overtimeAndPenalties',
      'allowances',
      'bonuses',
    ]),
    'base-rate scenario',
  );
  return baseRateWages({
    baseRateCents: grossUp(
      toCents(amount(value, 'baseRate', { required: true })),
      toCents(amount(value, 'salarySacrifice')),
    ),
    bonuses: inputBonuses,
    overtimeAndPenaltyCents: toCents(amount(value, 'overtimeAndPenalties')),
    allowancesCents: toCents(amount(value, 'allowances')),
  });
}

function calculateAnnualSalary(value, inputBonuses) {
  assertKeys(
    value,
    new Set(['branch', 'annualSalary', 'salarySacrifice', 'bonuses']),
    'annual-salary scenario',
  );
  return annualSalaryWages({
    annualSalaryPaidCents: grossUp(
      toCents(amount(value, 'annualSalary', { required: true })),
      toCents(amount(value, 'salarySacrifice')),
    ),
    bonuses: inputBonuses,
  });
}

function calculateCasual(value, inputBonuses) {
  const allowed = new Set([
    'branch',
    'reportingMonth',
    'instrumentSpecifiesLoading',
    'loadingQuantifiable',
    'casualBasePay',
    'casualLoading',
    'ordinaryPay',
    'salarySacrifice',
    'bonuses',
  ]);
  assertKeys(value, allowed, 'casual scenario');

  const reportingMonth = requireField(value, 'reportingMonth');
  if (
    typeof reportingMonth !== 'string'
    || !/^\d{4}-(0[1-9]|1[0-2])$/.test(reportingMonth)
  ) {
    throw new TypeError('scenario.reportingMonth must be a valid YYYY-MM value');
  }
  const sacrifice = toCents(amount(value, 'salarySacrifice'));

  if (reportingMonth < CASUAL_METHOD_CHANGE_MONTH) {
    rejectPresent(
      value,
      ['instrumentSpecifiesLoading', 'loadingQuantifiable', 'casualLoading'],
      'pre-2024 casual scenario',
    );
    const payFields = ['casualBasePay', 'ordinaryPay'].filter((key) => Object.hasOwn(value, key));
    if (payFields.length !== 1) {
      throw new TypeError('pre-2024 casual scenario requires exactly one pay field');
    }
    const pay = toCents(amount(value, payFields[0], { required: true }));
    return casualWages({
      reportingMonth,
      baseRatePayCents: grossUp(pay, sacrifice),
      bonuses: inputBonuses,
    });
  }

  const specifiesLoading = requireField(value, 'instrumentSpecifiesLoading');
  if (typeof specifiesLoading !== 'boolean') {
    throw new TypeError('scenario.instrumentSpecifiesLoading must be boolean');
  }

  if (!specifiesLoading) {
    rejectPresent(
      value,
      ['loadingQuantifiable', 'casualBasePay', 'casualLoading'],
      'all-in casual scenario',
    );
    return casualWages({
      reportingMonth,
      instrumentSpecifiesLoading: false,
      ordinaryRatePayCents: grossUp(
        toCents(amount(value, 'ordinaryPay', { required: true })),
        sacrifice,
      ),
      bonuses: inputBonuses,
    });
  }

  const quantifiable = requireField(value, 'loadingQuantifiable');
  if (typeof quantifiable !== 'boolean') {
    throw new TypeError('scenario.loadingQuantifiable must be boolean');
  }
  if (quantifiable) {
    rejectPresent(value, ['ordinaryPay'], 'quantifiable-loading casual scenario');
    return casualWages({
      reportingMonth,
      instrumentSpecifiesLoading: true,
      loadingQuantifiable: true,
      baseRatePayCents: grossUp(
        toCents(amount(value, 'casualBasePay', { required: true })),
        sacrifice,
      ),
      casualLoadingCents: toCents(amount(value, 'casualLoading', { required: true })),
      bonuses: inputBonuses,
    });
  }

  rejectPresent(
    value,
    ['casualBasePay', 'casualLoading'],
    'unquantifiable-loading casual scenario',
  );
  return casualWages({
    reportingMonth,
    instrumentSpecifiesLoading: true,
    loadingQuantifiable: false,
    ordinaryRatePayCents: grossUp(
      toCents(amount(value, 'ordinaryPay', { required: true })),
      sacrifice,
    ),
    bonuses: inputBonuses,
  });
}

function sources() {
  return SOURCES.map((source) => ({ ...source }));
}

function structuredResult(result) {
  const eligibleWages = result.eligibleWagesCents;
  const roundedLevy = levyCents(eligibleWages);
  return {
    branch: result.branch,
    ...(result.winner ? { winner: result.winner } : {}),
    ...(result.formulaA !== undefined ? { formulaACents: result.formulaA } : {}),
    ...(result.formulaB !== undefined ? { formulaBCents: result.formulaB } : {}),
    eligibleWagesCents: eligibleWages,
    eligibleWagesDisplay: money(eligibleWages),
    levyCents: roundedLevy,
    levyDisplay: money(roundedLevy),
    ratePercent: (LEVY_RATE_NUMERATOR / LEVY_RATE_DENOMINATOR) * 100,
    rateAsAt: LEVY_RATE_AS_AT,
    pageReviewed: PAGE_REVIEWED,
    explanation: explainLevyResult(result),
    roundingBoundary: ROUNDING_BOUNDARY,
    estimateOnly: true,
    boundary: ESTIMATE_BOUNDARY,
    sources: sources(),
  };
}

export function calculateScenario(input) {
  assertObject(input, 'scenario');
  const branch = requireField(input, 'branch');
  const inputBonuses = bonuses(input);
  let result;
  if (branch === 'base_rate') result = calculateBaseRate(input, inputBonuses);
  else if (branch === 'annual_salary') result = calculateAnnualSalary(input, inputBonuses);
  else if (branch === 'casual') result = calculateCasual(input, inputBonuses);
  else throw new TypeError(`unsupported scenario branch: ${String(branch)}`);
  return structuredResult(result);
}

function fixtureResult(input) {
  assertObject(input, 'fixture input');
  assertKeys(input, new Set(['fixture']), 'fixture input');
  const fixture = requireField(input, 'fixture', 'fixture input');
  if (typeof fixture !== 'string' || !Object.hasOwn(fixtureScenarios, fixture)) {
    throw new TypeError('fixture must name an allowlisted synthetic D-series case');
  }
  return { fixture, result: calculateScenario(fixtureScenarios[fixture]) };
}

function methodExplanation(input) {
  assertObject(input, 'method input');
  assertKeys(input, new Set(['method']), 'method input');
  const method = requireField(input, 'method', 'method input');
  if (method === 'rounding') {
    return {
      method,
      explanation: ROUNDING_BOUNDARY,
      roundingBoundary: ROUNDING_BOUNDARY,
      estimateOnly: true,
    };
  }
  const fixture = methodFixtures[method];
  if (!fixture) throw new TypeError('method must name an allowlisted Coal LSL branch');
  const result = calculateScenario(fixtureScenarios[fixture]);
  return {
    method,
    branch: result.branch,
    explanation: result.explanation,
    roundingBoundary: ROUNDING_BOUNDARY,
    estimateOnly: true,
  };
}

function evidence(input) {
  assertObject(input, 'evidence input');
  assertKeys(input, new Set(), 'evidence input');
  return {
    ratePercent: (LEVY_RATE_NUMERATOR / LEVY_RATE_DENOMINATOR) * 100,
    rateAsAt: LEVY_RATE_AS_AT,
    pageReviewed: PAGE_REVIEWED,
    estimateOnly: true,
    boundary: ESTIMATE_BOUNDARY,
    limitations: [
      'Does not determine whether a worker is an eligible employee.',
      'Does not resolve statutory gaps identified on the calculator page.',
      'Does not lodge a return or calculate late-payment levy.',
    ],
    sources: sources(),
  };
}

function tool({ name, title, description, inputSchema, execute }) {
  return {
    name,
    title,
    description,
    inputSchema,
    execute: async (input) => execute(input),
    annotations: { readOnlyHint: true, untrustedContentHint: false },
  };
}

export function coalLslTools() {
  return [
    tool({
      name: 'calculate_coal_lsl_levy',
      title: 'Calculate Coal LSL levy',
      description: 'Calculate one fabricated monthly Coal LSL scenario. Read-only and estimate-only. Accepts numbers and fixed choices only; never pass names, identifiers, client records, files or URLs.',
      inputSchema: calculationInputSchema,
      execute: calculateScenario,
    }),
    tool({
      name: 'run_coal_lsl_fixture',
      title: 'Run Coal LSL fixture',
      description: 'Run one allowlisted synthetic D-series fixture through the protected calculator engine. Read-only; it does not accept client data, names, identifiers, files or URLs.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fixture: {
            type: 'string',
            enum: Object.keys(fixtureScenarios),
            description: 'Allowlisted synthetic fixture name.',
          },
        },
        required: ['fixture'],
      },
      execute: fixtureResult,
    }),
    tool({
      name: 'explain_coal_lsl_method',
      title: 'Explain Coal LSL method',
      description: 'Explain one fixed Coal LSL calculation branch or the final-step rounding boundary. Read-only and based only on public page content; it does not accept client data.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          method: {
            type: 'string',
            enum: [...Object.keys(methodFixtures), 'rounding'],
            description: 'Allowlisted method or rounding boundary.',
          },
        },
        required: ['method'],
      },
      execute: methodExplanation,
    }),
    tool({
      name: 'get_coal_lsl_evidence',
      title: 'Get Coal LSL evidence',
      description: 'Return the calculator rate date, visible public sources and stated limitations. Read-only; it performs no network request and accepts no names, identifiers, client records, files or URLs.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      execute: evidence,
    }),
  ];
}

export function registerCoalLslTools(modelContext) {
  if (
    (typeof modelContext !== 'object' && typeof modelContext !== 'function')
    || modelContext === null
    || typeof modelContext.registerTool !== 'function'
    || registeredContexts.has(modelContext)
  ) {
    return false;
  }
  registeredContexts.add(modelContext);
  for (const definition of coalLslTools()) modelContext.registerTool(definition);
  return true;
}
