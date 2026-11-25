// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for the 2 retirement-phase individual tax calculators:
// account-based pension minimum payment and transfer balance account / excess
// contributions. Imported by assets/webmcp-tools.mjs.

import { checkModeFields } from './webmcp-business-b-payroll.mjs';

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {{PENSION_MINIMUM_YEARS: string[], pensionMinimum: typeof import('./pension-minimum.mjs').pensionMinimum}} PensionEngine */
/** @typedef {{ATO_TABLE_5: ReadonlyMap<string, string[]>, CHARGE_YEARS: string[], RELEASE_YEARS: string[],
 *   TBA_KINDS: ReadonlyArray<readonly [string, boolean, string]>, TBA_YEARS: string[],
 *   dayOf: typeof import('./transfer-balance.mjs').dayOf, excessContributions: typeof import('./excess-contributions.mjs').excessContributions,
 *   label: typeof import('./transfer-balance.mjs').label, transferBalance: typeof import('./transfer-balance.mjs').transferBalance,
 *   yearOf: typeof import('./transfer-balance.mjs').yearOf}} TransferBalanceEngine */

const TBA_COMMON = new Set(['calculation', 'scopeConfirmed']);
const TBA_ALLOWED = new Map([
  ['transfer', new Set(['events', 'toDate', 'previouslyLiable'])],
  ['concessional_charge', new Set(['incomeYear', 'additionalTax', 'taxDueDate'])],
  ['non_concessional_release', new Set(['incomeYear', 'excess', 'determinationDate'])],
]);
const TBA_REQUIRED = new Map([
  ['transfer', ['events', 'toDate']],
  ['concessional_charge', ['incomeYear', 'additionalTax', 'taxDueDate']],
  ['non_concessional_release', ['incomeYear', 'excess', 'determinationDate']],
]);

/** Exact days in the financial year starting 1 July `first`. @param {number} first */
const yearDays = (first) => {
  const second = first + 1;
  return second % 4 === 0 && (second % 100 !== 0 || second % 400 === 0) ? 366 : 365;
};

/** Exact days from a real calendar YYYY-MM-DD `startDate` to 30 June `first + 1`, or throws if outside the year.
 * @param {string} startDate @param {number} first @param {number} totalDays */
function pensionStartDays(startDate, first, totalDays) {
  const second = first + 1;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  const [y, m, d] = parts ? [Number(parts[1]), Number(parts[2]), Number(parts[3])] : [0, 0, 0];
  const parsed = new Date(Date.UTC(y, m - 1, d));
  const valid = Boolean(parts) && parsed.toISOString().slice(0, 10) === startDate;
  const days = valid ? Math.round((Date.UTC(second, 5, 30) - parsed.getTime()) / 86400000) + 1 : -1;
  if (days < 1 || days > totalDays) {
    throw new Error(`Enter a start day from 1 July ${first} to 30 June ${second}, or leave it blank.`);
  }
  return days;
}

/** @param {ToolKit} kit @param {PensionEngine} engine */
export function pensionMinimumTool(kit, { pensionMinimum, PENSION_MINIMUM_YEARS }) {
  const { text, choice, whole, record, tool, INDIVIDUAL } = kit;
  return tool({
    name: 'calculate_pension_minimum',
    title: 'Pension minimum payment calculator',
    description: 'Account-based pension minimum annual payment in AUD for 2024-25 to 2027-28 under SISR 1994 '
      + 'Schedule 7 clauses 1 to 5: age percentage factors (4% under 65 up to 14% at 95+), rounded to the nearest '
      + '$10 with $5 rounded up. Omit startDate for a pension running on 1 July; supply startDate for a first year '
      + 'pro-rated to 30 June (nil when starting on or after 1 June, the last 30 days). Excludes halved 2019-20 to '
      + '2022-23 factors, market-linked pensions, transition-to-retirement maximums and death years.',
    inputSchema: record({
      incomeYear: choice(PENSION_MINIMUM_YEARS, `Income year, ${PENSION_MINIMUM_YEARS[0]} to ${PENSION_MINIMUM_YEARS.at(-1)}.`),
      accountBalance: text('trillionCost', 'Account balance on 1 July (or startDate in the first year) in AUD.'),
      age: whole(0, 150, 'Age in whole years on that day (0 to 150).'),
      startDate: text('date', 'Optional start day as YYYY-MM-DD inside the income year; omit when running on 1 July.'),
      scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation; false refuses.' },
    }, ['incomeYear', 'accountBalance', 'age']),
    run({ incomeYear, accountBalance, age, startDate, scopeConfirmed = true }) {
      const first = Number(incomeYear.slice(0, 4));
      const daysInYear = yearDays(first);
      const days = startDate === undefined ? daysInYear : pensionStartDays(startDate, first, daysInYear);
      const r = pensionMinimum({
        account_balance: accountBalance, age, days, year: incomeYear, scope_confirmed: scopeConfirmed,
      });
      return {
        incomeYear: r.year, accountBalance: r.amounts.account_balance_used, age, startDate: startDate ?? null,
        daysCounted: r.days, daysInYear: r.daysInYear, percentageFactorPercent: r.factor, clause: r.clause,
        minimumBeforeRounding: r.amounts.minimum_before_rounding, minimumPayment: r.amounts.minimum_payment,
        currency: 'AUD', source: `${INDIVIDUAL}pension-minimum/`,
      };
    },
  });
}

/** @param {ToolKit} kit @param {TransferBalanceEngine} engine */
function tbaSchema(kit, { RELEASE_YEARS, TBA_KINDS }) {
  const { text, choice, record } = kit;
  const eventSchema = record({
    date: text('date', 'Event date as YYYY-MM-DD, on or after 2017-07-01.'),
    kind: choice(TBA_KINDS.map(([k]) => k), 'Supported transfer balance credit or debit event kind.'),
    amount: text('trillionCost', 'Event amount above nil in AUD (up to 1,000,000,000,000).'),
  }, ['date', 'kind', 'amount']);
  return record({
    calculation: choice(['transfer', 'concessional_charge', 'non_concessional_release'],
      '"transfer" (transfer balance account), "concessional_charge" (2013-14 to 2020-21) or "non_concessional_release" (2013-14 to 2025-26).'),
    scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation; false refuses.' },
    events: { type: 'array', maxItems: 1000, items: eventSchema, description: 'transfer: 1 to 1,000 credit and debit events.' },
    toDate: text('date', 'transfer: work the account to the end of this YYYY-MM-DD day (2017-07-01 to 2027-06-30; earnings published to 2026-12-31).'),
    previouslyLiable: { type: 'boolean', description: 'transfer optional: true if liable for excess transfer balance tax for an earlier period from 1 July 2018; false when omitted.' },
    incomeYear: choice(RELEASE_YEARS, `concessional_charge (2013-14 to 2020-21) or non_concessional_release (${RELEASE_YEARS[0]} to ${RELEASE_YEARS.at(-1)}).`),
    additionalTax: text('trillionCost', 'concessional_charge: additional income tax from excess concessional contributions in AUD.'),
    taxDueDate: text('date', 'concessional_charge: day tax under first notice of assessment is due, YYYY-MM-DD.'),
    excess: text('trillionCost', 'non_concessional_release: excess non-concessional contributions above nil in AUD.'),
    determinationDate: text('date', 'non_concessional_release: day of the ATO\'s first determination, YYYY-MM-DD.'),
  }, ['calculation']);
}

/** @param {Record<string, any>} input @param {TransferBalanceEngine} engine @param {string} source */
function runTransferBalanceMode(input, engine, source) {
  const { transferBalance, excessContributions, ATO_TABLE_5, dayOf, label, yearOf } = engine;
  const scopeConfirmed = input.scopeConfirmed ?? true;
  if (input.calculation === 'transfer') {
    const last = dayOf(input.toDate);
    if (last === null) throw new Error('toDate must be a valid calendar date as YYYY-MM-DD.');
    const r = transferBalance({
      events: input.events, to: input.toDate, previously_liable: input.previouslyLiable ?? false,
      year: label(yearOf(last)), scope_confirmed: scopeConfirmed,
    });
    return {
      calculation: 'transfer', incomeYear: r.year, toDate: r.to, inExcess: r.inExcess,
      transferBalance: r.amounts.transfer_balance, transferBalanceCap: r.amounts.transfer_balance_cap,
      capSpace: r.amounts.cap_space, excessTransferBalance: r.amounts.excess_transfer_balance,
      notionalEarnings: r.amounts.notional_earnings, excessTransferBalanceTax: r.amounts.excess_transfer_balance_tax,
      generalTransferBalanceCap: `${r.rates.general_transfer_balance_cap}.00`,
      caps: r.caps, ledger: r.ledger, excessPeriods: r.periods, currency: 'AUD', source,
    };
  }
  const r = excessContributions(input.calculation === 'concessional_charge'
    ? { question: 'concessional_charge', year: input.incomeYear, scope_confirmed: scopeConfirmed, additional_tax: input.additionalTax, tax_due_date: input.taxDueDate }
    : { question: 'non_concessional_release', year: input.incomeYear, scope_confirmed: scopeConfirmed, excess: input.excess, determination_date: input.determinationDate });
  if (r.question === 'concessional_charge') {
    return {
      calculation: 'concessional_charge', incomeYear: r.year, days: r.days, firstDay: r.firstDay, lastDay: r.lastDay,
      excessConcessionalContributionsCharge: r.amounts.excess_concessional_contributions_charge, currency: 'AUD', source,
    };
  }
  const ato = ATO_TABLE_5.get(r.year);
  return {
    calculation: 'non_concessional_release', incomeYear: r.year, days: r.days, proxyRatePercent: r.rates.proxy_rate_percent,
    associatedEarnings: r.amounts.associated_earnings, totalReleaseAmount: r.amounts.total_release_amount,
    assessableAssociatedEarnings: r.amounts.assessable_associated_earnings,
    associatedEarningsTaxOffset: r.amounts.associated_earnings_tax_offset,
    atoPublishedTable5AnnualPercent: ato?.[0] ?? null, atoPublishedTable5DailyPercent: ato?.[1] ?? null,
    currency: 'AUD', source,
  };
}

/** @param {ToolKit} kit @param {TransferBalanceEngine} engine */
export function transferBalanceTool(kit, engine) {
  const { tool, INDIVIDUAL } = kit;
  const source = `${INDIVIDUAL}transfer-balance/`;
  return tool({
    name: 'calculate_transfer_balance',
    title: 'Transfer balance and excess contributions calculator',
    description: 'Retirement transfer balance account in AUD from 1 July 2017 to 30 June 2027 (general and indexed '
      + 'personal cap, excess earnings at published GIC rates to 2026-12-31 and 15% or 30% tax), excess concessional '
      + 'contributions charge (2013-14 to 2020-21) or release of excess non-concessional contributions (2013-14 to '
      + '2025-26). Refuses reversionary, child, defined benefit and structured settlement events and Commissioner notices.',
    inputSchema: tbaSchema(kit, engine),
    run(input) {
      checkModeFields(input, input.calculation, TBA_ALLOWED, TBA_REQUIRED, TBA_COMMON);
      return runTransferBalanceMode(input, engine, source);
    },
  });
}
