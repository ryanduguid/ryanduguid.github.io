// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for the ATO penalties and interest calculator.
// Imported by assets/webmcp-business-a.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {import('./webmcp-tools.mjs').Schema} Schema */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

const ATO_QUESTIONS = [
  'gic', 'sic', 'failure_to_lodge', 'statement_penalty', 'early_payment_interest', 'overpayment_interest',
];

const ATO_SIMPLE_FIELDS = /** @type {const} */ ([
  ['amount', 'amount'], ['dueDate', 'due_date'], ['toDate', 'to'], ['assumedAnnualRate', 'assumed_annual_rate'],
  ['noticeDate', 'notice_date'], ['givenOn', 'given_on'], ['entitySize', 'size'], ['statementDate', 'statement_date'],
  ['significantGlobalEntity', 'significant_global_entity'], ['trustOrPartnership', 'trust_or_partnership'],
  ['incomeTaxPayable', 'income_tax_payable'], ['otherDisclosedBeforeExamination', 'other_disclosed_before_examination'],
  ['liability', 'liability'], ['paidOn', 'paid_on'], ['fullSelfAssessment', 'full_self_assessment'],
  ['noticeIssued', 'notice_issued'], ['refunded', 'refunded'], ['refundedOn', 'refunded_on'],
  ['relevantTax', 'relevant_tax'], ['decisionToWhichActApplies', 'decision_to_which_act_applies'],
]);

/** @param {Record<string, any>} p */
function atoStatementPartInput(p) {
  /** @type {Map<string, unknown>} */
  const out = new Map([['shortfall_amount', p.shortfallAmount ?? null], ['behaviour', p.behaviour]]);
  if (p.notReasonablyArguable !== undefined) out.set('not_reasonably_arguable', p.notReasonablyArguable);
  if (p.acceptedWayAmount !== undefined) out.set('accepted_way_amount', p.acceptedWayAmount);
  if (p.increase !== undefined) out.set('increase', p.increase);
  if (p.disclosure !== undefined) out.set('disclosure', p.disclosure);
  return Object.fromEntries(out);
}

/** @param {Record<string, any>} input */
function atoPenaltiesInput(input) {
  const supplied = new Map(Object.entries(input));
  /** @type {Map<string, unknown>} */
  const out = new Map([['question', input.question], ['year', input.incomeYear]]);
  for (const [prop, key] of ATO_SIMPLE_FIELDS) {
    const val = supplied.get(prop);
    if (val !== undefined) out.set(key, val);
  }
  if (input.payments !== undefined) {
    const key = input.question === 'overpayment_interest' ? 'paid_on' : 'date';
    out.set('payments', input.payments.map((/** @type {{date: string, amount: string}} */ p) => (
      key === 'paid_on' ? { paid_on: p.date, amount: p.amount } : { date: p.date, amount: p.amount }
    )));
  }
  if (input.parts !== undefined) out.set('parts', input.parts.map(atoStatementPartInput));
  return /** @type {{question: string, year: string} & Record<string, unknown>} */ (Object.fromEntries(out));
}

/** @param {Array<{from: string, to: string, days: number, rate: number, assumed: boolean}>} stretches */
const formatStretches = (stretches) => stretches.map((s) => ({
  from: s.from, to: s.to, days: s.days, ratePercent: s.rate.toFixed(2), assumed: s.assumed,
}));

/** @param {Record<string, any>} p @param {(value: number) => string} dollars */
function formatAtoPart(p, dollars) {
  const base = {
    part: p.part, behaviour: p.behaviour, basePenaltyAmount: dollars(p.basePenaltyAmount),
    increasePercent: p.increasePercent, reduction: p.reduction, disclosure: p.disclosure, penalty: dollars(p.penalty),
  };
  if (p.shortfallAmount === undefined) {
    return { ...base, penaltyUnits: p.penaltyUnits, penaltyUnit: dollars(p.penaltyUnit) };
  }
  return {
    ...base, shortfallAmount: dollars(p.shortfallAmount),
    acceptedWayAmount: p.acceptedWayAmount === null ? null : dollars(p.acceptedWayAmount),
    aboveThreshold: p.aboveThreshold, basePercentage: p.basePercentage,
  };
}

/** @typedef {(r: Record<string, any>, dollars: (value: number) => string) => Record<string, unknown>} AtoFormatter */
/** @type {Map<string, AtoFormatter>} */
const ATO_FORMATTERS = new Map(/** @type {[string, AtoFormatter][]} */ ([
  ['gic', (r, dollars) => ({
    gic: dollars(r.gic), paid: dollars(r.paid), balance: dollars(r.balance), days: r.days,
    assumedDays: r.assumedDays, assumedRatePercent: r.assumedRate === null ? null : r.assumedRate.toFixed(2),
    stretches: formatStretches(r.stretches),
  })],
  ['sic', (r, dollars) => ({
    sic: dollars(r.sic), days: r.days, firstDay: r.firstDay, lastDay: r.lastDay,
    stretches: formatStretches(r.stretches),
  })],
  ['failure_to_lodge', (r, dollars) => ({
    basePenaltyAmount: dollars(r.basePenaltyAmount), penalty: dollars(r.penalty),
    multiplier: r.multiplier, daysLate: r.daysLate, penaltyUnits: r.penaltyUnits,
    periods: r.periods.map((/** @type {{from: string, unit: number}} */ p) => ({ from: p.from, unit: dollars(p.unit) })),
  })],
  ['statement_penalty', (r, dollars) => ({
    basePenaltyAmount: dollars(r.basePenaltyAmount), penalty: dollars(r.penalty),
    penaltyUnit: dollars(r.penaltyUnit), threshold: r.threshold === null ? null : dollars(r.threshold),
    parts: r.parts.map((/** @type {Record<string, any>} */ p) => formatAtoPart(p, dollars)),
  })],
  ['early_payment_interest', (r, dollars) => ({
    interest: dollars(r.interest), interestPayable: dollars(r.interestPayable), daysEarly: r.daysEarly,
    entitled: r.entitled, days: r.days, firstDay: r.firstDay, lastDay: r.lastDay,
    stretches: formatStretches(r.stretches),
  })],
  ['overpayment_interest', (r, dollars) => ({
    refunded: dollars(r.refunded), interest: dollars(r.interest), interestPayable: dollars(r.interestPayable),
    attribution: r.attribution.map((/** @type {Record<string, any>} */ a) => ({
      paidOn: a.paidOn, attributed: dollars(a.attributed), firstDay: a.firstDay, lastDay: a.lastDay,
      days: a.days, stretches: formatStretches(a.stretches),
    })),
  })],
]));

/** @param {ToolKit} kit @param {string[]} atoPenaltyYears @returns {Schema} */
function atoPenaltiesSchema(kit, atoPenaltyYears) {
  const { text, choice, record } = kit;
  const paymentSchema = record({
    date: text('date', 'Payment date as YYYY-MM-DD.'),
    amount: text('cost', 'Payment amount in AUD with at most 2 decimal places.'),
  }, ['date', 'amount']);
  const partSchema = record({
    behaviour: choice(['intentional_disregard', 'recklessness', 'failure_to_take_reasonable_care', 'reasonable_care'],
      'Culpable behaviour level under TAA Sch 1 s 284-90.'),
    shortfallAmount: text('cost', 'Tax shortfall amount in AUD; omit for a no-shortfall statement (items 3A to 3C).'),
    notReasonablyArguable: { type: 'boolean', description: 'true when the position is not reasonably arguable (requires shortfallAmount and incomeTaxPayable).' },
    acceptedWayAmount: text('cost', 'Part of the shortfall attributable to treating a law in an accepted way, in AUD.'),
    increase: { type: 'boolean', description: 'true when the 20% s 284-220 increase applies.' },
    disclosure: choice(['none', 'before_examination', 'during_examination'], 'Voluntary disclosure timing under s 284-225.'),
  }, ['behaviour']);
  return record({
    question: choice(ATO_QUESTIONS, 'Calculation type: "gic", "sic", "failure_to_lodge", "statement_penalty", "early_payment_interest" or "overpayment_interest".'),
    incomeYear: choice(atoPenaltyYears, 'Financial year (2020-21 to 2027-28) containing the question\'s last date.'),
    amount: text('cost', 'Principal amount in AUD (gic, sic, early_payment_interest).'),
    dueDate: text('date', 'Due date as YYYY-MM-DD (gic, sic, failure_to_lodge, early_payment_interest).'),
    toDate: text('date', 'Last day GIC accrues, YYYY-MM-DD (gic).'),
    assumedAnnualRate: text('percent', 'Optional assumed annual GIC rate in per cent after 2026-12-31 (gic).'),
    payments: { type: 'array', maxItems: 1000, items: paymentSchema, description: 'Dated payments in AUD (gic optional; overpayment_interest required).' },
    noticeDate: text('date', 'Amended assessment notice date, YYYY-MM-DD (sic).'),
    givenOn: text('date', 'Lodgement date, YYYY-MM-DD (failure_to_lodge).'),
    entitySize: choice(['small', 'medium', 'large', 'significant_global'], 'Entity size multiplier (failure_to_lodge).'),
    statementDate: text('date', 'Date the statement was made, YYYY-MM-DD (statement_penalty).'),
    significantGlobalEntity: { type: 'boolean', description: 'true to double base penalty for an SGE under s 284-90(1A) (statement_penalty).' },
    trustOrPartnership: { type: 'boolean', description: 'Optional: true refuses when a part is not reasonably arguable (statement_penalty).' },
    incomeTaxPayable: text('cost', 'Income tax on the return in AUD, required only with a not-reasonably-arguable part (statement_penalty).'),
    otherDisclosedBeforeExamination: text('cost', 'Other shortfalls disclosed before examination in AUD, required only with a before_examination shortfall part (statement_penalty).'),
    parts: { type: 'array', maxItems: 100, items: partSchema, description: 'From 1 to 100 statement penalty parts (statement_penalty).' },
    liability: choice(['income_tax', 'shortfall_interest_charge', 'compulsory_study_loan_repayment', 'fs_assessment_debt'],
      'Eligible liability under s 8A(1)(a) (early_payment_interest).'),
    paidOn: text('date', 'Date payment was made, YYYY-MM-DD (early_payment_interest).'),
    fullSelfAssessment: { type: 'boolean', description: 'true for a full self-assessment taxpayer; false requires noticeIssued (early_payment_interest).' },
    noticeIssued: text('date', 'Notice issue date, YYYY-MM-DD (overpayment_interest, and early_payment_interest when fullSelfAssessment is false).'),
    refunded: text('cost', 'Amount refunded in AUD (overpayment_interest).'),
    refundedOn: text('date', 'Date refunded, YYYY-MM-DD (overpayment_interest).'),
    relevantTax: { type: 'boolean', description: 'true when overpaid tax is relevant tax under s 3C; false refuses (overpayment_interest).' },
    decisionToWhichActApplies: { type: 'boolean', description: 'true when overpaid due to a covered decision under s 3(1); false refuses (overpayment_interest).' },
  }, ['question', 'incomeYear']);
}

/**
 * @param {ToolKit} kit
 * @param {BusinessCalculators['atoPenaltiesInterest']} atoPenaltiesInterest
 * @param {string[]} atoPenaltyYears
 */
export function atoPenaltiesInterestTool(kit, atoPenaltiesInterest, atoPenaltyYears) {
  const { tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_ato_penalties_interest',
    title: 'ATO penalties and interest calculator',
    description: 'ATO interest and administrative penalties in AUD before remission for 2020-21 to 2027-28: general interest '
      + 'charge (TAA 1953 ss 8AAC-8AAD), shortfall interest charge (Sch 1 ss 280-100 to 280-105), failure to lodge penalty '
      + '(s 286-80 with Crimes Act s 4AA penalty units by date), false or misleading statement penalties (ss 284-85 to 284-225), '
      + 'early payment interest and overpayment interest (T(IOEP)A 1983). Published GIC/SIC/base rates run to 31 December 2026 '
      + '(GIC accepts assumedAnnualRate for later days). Refuses fields belonging to another question, discretionary remission '
      + 'estimates and Subdivision 284-C scheme penalties.',
    inputSchema: atoPenaltiesSchema(kit, atoPenaltyYears),
    run(input) {
      const r = /** @type {Record<string, any>} */ (atoPenaltiesInterest(atoPenaltiesInput(input)));
      const format = ATO_FORMATTERS.get(r.question);
      const body = format ? format(r, dollars) : {};
      return {
        question: r.question, incomeYear: r.year, ...body,
        warnings: r.warnings, remission: r.remission,
        currency: 'AUD', source: `${CALCULATORS}ato-penalties-interest/`,
      };
    },
  });
}
