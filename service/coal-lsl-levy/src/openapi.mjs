// The OpenAPI 3.1 document for the service, built from the same constants
// the validator uses so the two cannot drift apart silently; the test suite
// checks every property the document declares is one the validator reads.

import { BONUS_FREQUENCIES, BRANCHES, MAX_BONUSES } from './schema.mjs';
import { REFUSAL_CLASSES } from './calculate.mjs';

const money = (description) => ({
  type: 'string',
  pattern: '^(0|[1-9][0-9]{0,12})(\\.[0-9]{1,2})?$',
  description: `${description} AUD as a decimal string with at most 2 decimal places, for example "6000.00". JSON numbers are rejected. Send "0.00" for nil; a missing amount is not nil.`,
});
const tristate = (description) => ({
  description: `${description} true, false or the string "unknown". "unknown" is a fact not established, which is refused, never read as false.`,
  oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['unknown'] }],
});
const bonuses = {
  type: 'array',
  maxItems: MAX_BONUSES,
  description: 'Incentive-based payments and bonuses paid in the month with their payment frequency. Only weekly, fortnightly and monthly frequencies count (s 3B(4)(c) and (d)); the rest are reported under excluded, never spread.',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['amount', 'frequency'],
    properties: {
      amount: money('Bonus amount.'),
      frequency: { type: 'string', enum: [...BONUS_FREQUENCIES] },
    },
  },
};

export const REQUEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reporting_month', 'branch', 'employee', 'pay'],
  allOf: [
    { if: { properties: { branch: { const: 'base_rate' } } }, then: { properties: { pay: { required: ['base_rate_of_pay', 'salary_sacrificed', 'overtime_and_penalty_rates', 'allowances', 'allowances_exclude_expense_reimbursements', 'bonuses'] } } } },
    { if: { properties: { branch: { const: 'annual_salary' } } }, then: { properties: { pay: { required: ['annual_salary_paid', 'salary_sacrificed', 'bonuses'] } } } },
    { if: { properties: { branch: { const: 'casual' } } }, then: { properties: { pay: { required: ['instrument_specifies_loading', 'loading_quantifiable', 'base_rate_of_pay', 'casual_loading', 'ordinary_rate_of_pay', 'salary_sacrificed', 'bonuses'] } } } },
  ],
  properties: {
    reporting_month: {
      type: 'string',
      pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$',
      description: 'The reporting month, YYYY-MM. Must equal the month in the period URN of the path.',
    },
    branch: {
      type: 'string',
      enum: [...BRANCHES],
      description: 'base_rate: s 3B(1); annual_salary: s 3B(2); casual: s 3B(3).',
    },
    employee: {
      type: 'object',
      additionalProperties: false,
      required: ['eligible_employee'],
      properties: {
        eligible_employee: tristate('Whether the person is an eligible employee under s 4 of the Administration Act, as established by the caller.'),
      },
    },
    pay: {
      description: 'Pay components for the selected branch. The set of fields is fixed per branch and every field is required.',
      oneOf: [
        {
          title: 'base_rate',
          type: 'object',
          additionalProperties: false,
          required: ['base_rate_of_pay', 'salary_sacrificed', 'overtime_and_penalty_rates', 'allowances', 'allowances_exclude_expense_reimbursements', 'bonuses'],
          properties: {
            base_rate_of_pay: money('Base rate of pay paid in the month, after salary sacrifice deductions.'),
            salary_sacrificed: money('Amounts deducted under a salary sacrifice arrangement, grossed back onto the base rate (s 3B(4)(a)).'),
            overtime_and_penalty_rates: money('Overtime and penalty rates paid (Formula B only).'),
            allowances: money('Allowances other than expense reimbursements (Formula B only).'),
            allowances_exclude_expense_reimbursements: tristate('Assertion that the allowances figure contains no reimbursement of expenses. Required to be true when allowances are non-nil.'),
            bonuses,
          },
        },
        {
          title: 'annual_salary',
          type: 'object',
          additionalProperties: false,
          required: ['annual_salary_paid', 'salary_sacrificed', 'bonuses'],
          properties: {
            annual_salary_paid: money('Annual salary paid in the month, after salary sacrifice deductions, excluding overtime, penalty rates and shift loadings.'),
            salary_sacrificed: money('Amounts deducted under a salary sacrifice arrangement, grossed back onto the salary (s 3B(4)(b)).'),
            bonuses,
          },
        },
        {
          title: 'casual',
          type: 'object',
          additionalProperties: false,
          required: ['instrument_specifies_loading', 'loading_quantifiable', 'base_rate_of_pay', 'casual_loading', 'ordinary_rate_of_pay', 'salary_sacrificed', 'bonuses'],
          properties: {
            instrument_specifies_loading: tristate('Whether an industrial instrument covering the employee specifies a casual loading.'),
            loading_quantifiable: tristate('Whether that casual loading can be quantified.'),
            base_rate_of_pay: money('Base rate of pay paid (s 3B(3)(a) branch). Send "0.00" on the other branch.'),
            casual_loading: money('Casual loading paid (s 3B(3)(a) branch). Send "0.00" on the other branch.'),
            ordinary_rate_of_pay: money('Ordinary rate of pay paid, loading included (s 3B(3)(b) branch). Send "0.00" on the other branch.'),
            salary_sacrificed: money('Amounts deducted under a salary sacrifice arrangement, grossed onto the component the branch reads.'),
            bonuses,
          },
        },
      ],
    },
  },
};

export function buildOpenApi(config, register) {
  const months = register.supportedMonths();
  const calculatorPath = `/v1/calculators/${config.calculatorUrn}/{period_uri}`;
  return {
    openapi: '3.1.0',
    info: {
      title: 'Coal LSL levy calculator',
      version: config.version,
      summary: 'Coal Mining Industry (Long Service Leave) payroll levy on eligible wages under s 3B, as a deterministic HTTP calculator.',
      description: [
        'Same arithmetic as https://duguid.com.au/tools/coal-lsl-levy/ (assets/levy.mjs). Money in and out is decimal strings.',
        'Refusals are a feature: 422 names a malformed or missing field, 400 carries a refusal_class, 404 names the calculator or period URNs this service accepts.',
        `Refusal classes: ${Object.entries(REFUSAL_CLASSES).map(([key, text]) => `${key} (${text})`).join(' ')}`,
        'Rounding: half up to the cent at the final step only; levy_before_rounding is exact. Not advice; review aid only.',
        'Development source. This surface is not listed anywhere and carries no external conformance approval.',
      ].join('\n\n'),
      license: { name: 'MIT' },
    },
    servers: [{ url: config.publicBaseUrl ?? 'http://127.0.0.1:8787' }],
    paths: {
      '/v1/calculators': {
        get: {
          summary: 'List calculators with their period URNs',
          responses: { 200: { description: 'Calculator listing', content: { 'application/json': { schema: { $ref: '#/components/schemas/CalculatorListing' } } } } },
        },
      },
      [calculatorPath]: {
        post: {
          summary: 'Calculate the levy for one employee for one reporting month',
          parameters: [{
            name: 'period_uri', in: 'path', required: true,
            schema: { type: 'string', enum: months.map((month) => `${config.periodUrnPrefix}${month}`) },
            description: 'Period URN for the reporting month. The listing is the authority for which months are supported.',
          }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CoalLslLevyInput' } } } },
          responses: {
            200: { description: 'Computed', content: { 'application/json': { schema: { $ref: '#/components/schemas/CoalLslLevyResult' } } } },
            400: { description: 'Well-formed but outside what this calculator answers', content: { 'application/json': { schema: { $ref: '#/components/schemas/Refusal' } } } },
            404: { description: 'Unknown calculator or period URN', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotFound' } } } },
            413: { description: 'Body larger than the configured limit' },
            415: { description: 'Content-Type is not application/json' },
            422: { description: 'Malformed or incomplete request', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
            429: { description: 'Throttled; Retry-After is set in seconds' },
          },
        },
      },
      '/v1/rates/{period_uri}': {
        get: {
          summary: 'Rate tables registered for a period, each with the SHA-256 of the bytes served by /v1/rates/{period_uri}/{rate_id}',
          parameters: [{ name: 'period_uri', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Rate table listing' }, 404: { description: 'Unsupported period' } },
        },
      },
      '/v1/rates/{period_uri}/{rate_id}': {
        get: {
          summary: 'The exact bytes of a rate table (the rates register series file)',
          parameters: [
            { name: 'period_uri', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'rate_id', in: 'path', required: true, schema: { type: 'string', enum: ['levy-rate', 'eligible-wages-method'] } },
          ],
          responses: { 200: { description: 'The document whose SHA-256 the manifest cites' }, 404: { description: 'Unknown period or rate id' } },
        },
      },
      '/healthz': { get: { summary: 'Liveness', responses: { 200: { description: 'ok' } } } },
      '/livez': { get: { summary: 'Liveness (alias)', responses: { 200: { description: 'ok' } } } },
      '/openapi.json': { get: { summary: 'This document', responses: { 200: { description: 'OpenAPI 3.1' } } } },
    },
    components: {
      schemas: {
        CoalLslLevyInput: REQUEST_SCHEMA,
        CoalLslLevyResult: {
          type: 'object',
          required: ['calculator', 'period', 'reporting_month', 'branch', 'eligible_wages', 'levy', 'levy_before_rounding', 'rate', 'workings', 'excluded', 'rounding', 'manifest', 'advisory'],
          properties: {
            calculator: { type: 'string' },
            period: { type: 'string' },
            reporting_month: { type: 'string' },
            branch: { type: 'object', properties: { code: { type: 'string' }, label: { type: 'string' } } },
            eligible_wages: { type: 'string', description: 'Decimal string, 2 to 4 decimal places (Formula B keeps quarter cents).' },
            levy: { type: 'string', description: 'Decimal string, 2 decimal places, rounded half up.' },
            levy_before_rounding: { type: 'string', description: 'Exact decimal string before the final rounding.' },
            rate: { type: 'object' },
            workings: { type: 'object' },
            excluded: { type: 'array', items: { type: 'object' } },
            rounding: { type: 'object' },
            manifest: { type: 'object', description: 'calculator, period, schema, engine, method and rate_table_uris with SHA-256 content hashes.' },
            advisory: { type: 'object', properties: { figure_type: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } } } },
          },
        },
        CalculatorListing: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              calc_uri: { type: 'string' }, label: { type: 'string' }, method: { type: 'string' },
              supported_periods: { type: 'array', items: { type: 'string' } },
              input_schema_ref: { type: 'string' }, jurisdiction: { type: 'string' },
              limits: { type: 'object' }, refusal_classes: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        ValidationError: {
          type: 'object',
          required: ['error', 'field', 'code', 'message'],
          properties: { error: { type: 'string', const: 'validation_error' }, field: { type: 'string' }, code: { type: 'string' }, message: { type: 'string' } },
        },
        Refusal: {
          type: 'object',
          required: ['refusal_class', 'reason'],
          properties: { refusal_class: { type: 'string', enum: Object.keys(REFUSAL_CLASSES) }, reason: { type: 'string' } },
        },
        NotFound: {
          type: 'object',
          required: ['error', 'message'],
          properties: { error: { type: 'string', const: 'not_found' }, message: { type: 'string' }, accepted: { type: 'object' } },
        },
      },
    },
  };
}
