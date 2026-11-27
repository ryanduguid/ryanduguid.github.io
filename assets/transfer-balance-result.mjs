// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { ATO_TABLE_5, CHARGE_YEARS, RELEASE_YEARS, excessContributions } from './excess-contributions.mjs';
import { TBA_KINDS, TBA_YEARS, dayOf, label, transferBalance, yearOf } from './transfer-balance.mjs';

export { ATO_TABLE_5, CHARGE_YEARS, RELEASE_YEARS, TBA_KINDS, TBA_YEARS, dayOf, excessContributions, label, transferBalance, yearOf };

// The transfer balance page's form and results: the account, the excess concessional contributions
// charge, or the release of excess non-concessional contributions, each from the input the
// australian-accounting command takes.

/** The event rows the form shows. */
export const TBA_EVENT_ROWS = 5;
/** @type {ReadonlyMap<string, string>} */
const KIND_NAMES = new Map(TBA_KINDS.map(([kind, , name]) => [kind, name]));
const day = (/** @type {string} */ iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The `transfer-balance` input from the form: each event row with a date or an amount, the last day, its
 * financial year and the earlier liability answer. @param {(name: string) => string} value */
export function tbaFormInput(value) {
  const events = [];
  for (let i = 1; i <= TBA_EVENT_ROWS; i += 1) {
    const [date, amount] = [value(`event-${i}-date`).trim(), value(`event-${i}-amount`).trim()];
    if (date !== '' || amount !== '') events.push({ date, kind: value(`event-${i}-kind`), amount });
  }
  const to = value('to').trim();
  const last = dayOf(to);
  return { events, to, previously_liable: value('liable') === 'yes', year: last === null ? '' : label(yearOf(last)), scope_confirmed: true };
}

/** The `excess-contributions` input for the charge or the release. @param {(name: string) => string} value */
export function excessFormInput(value) {
  return value('calc') === 'charge'
    ? { question: 'concessional_charge', year: value('charge-year'), scope_confirmed: true, additional_tax: value('additional-tax').trim(),
      tax_due_date: value('due-date').trim() }
    : { question: 'non_concessional_release', year: value('release-year'), scope_confirmed: true, excess: value('excess').trim(),
      determination_date: value('determination-date').trim() };
}

const HOW = {
  start: () => 'The general cap for the year the account starts',
  flat: () => 'Last year’s cap: the general cap was not indexed',
  exceeded: () => 'Last year’s cap: no proportional indexation once the balance has exceeded the cap',
};

/** @param {(name: string) => string} value @param {(value: number) => string} aud */
function accountResult(value, aud) {
  const input = tbaFormInput(value);
  const r = transferBalance(input);
  const money = (/** @type {string} */ text) => aud(Number(text));
  const rows = [[`Transfer balance at the end of ${day(r.to)}`, money(r.amounts.transfer_balance)],
    ['Personal transfer balance cap', money(r.amounts.transfer_balance_cap)], ['Cap space', money(r.amounts.cap_space)],
    ['Excess transfer balance', money(r.amounts.excess_transfer_balance)],
    ['Excess transfer balance earnings', money(r.amounts.notional_earnings)], ['Excess transfer balance tax', money(r.amounts.excess_transfer_balance_tax)]];
  const caps = r.caps.map((c) => [c.year, aud(c.general), aud(c.cap), c.why === 'indexed'
    ? `${c.unused}% unused × ${aud(/** @type {number} */ (c.increase))} indexation; highest balance ${money(/** @type {string} */ (c.highest))} on ${day(/** @type {string} */ (c.highestOn))}`
    : HOW[c.why]()]);
  const ledger = r.ledger.map((l) => [day(l.date), /** @type {string} */ (KIND_NAMES.get(l.kind)), money(l.debit), money(l.credit), money(l.balance)]);
  const periods = r.periods.map((p) => [`${day(p.from)} to ${day(p.to)}`, String(p.days), money(p.earnings), `${p.rate}%`, money(p.tax)]);
  const note = r.periods.length === 0 ? `No excess at the end of any day to ${day(r.to)}`
    : `${r.inExcess ? `In excess at the end of ${day(r.to)}: earnings keep accruing until the excess is removed` : 'Not in excess at the last day'}; `
      + 'an estimate: the ATO’s determination may differ by cents, and it stops the earnings from its date';
  return { inputs: `${r.year}; ${input.events.length} ${input.events.length === 1 ? 'event' : 'events'} to ${day(r.to)}`
      + `${input.previously_liable ? '; liable for an earlier period from 1 July 2018' : ''}`,
    rows, principal: 5, note, tables: { 'tba-caps': caps, 'tba-ledger': ledger, ...(periods.length ? { 'tba-periods': periods } : {}) } };
}

/** @param {(name: string) => string} value @param {(value: number) => string} aud */
function excessResult(value, aud) {
  const input = excessFormInput(value);
  const r = excessContributions(input);
  const money = (/** @type {string} */ text) => aud(Number(text));
  const a = r.amounts;
  if (r.question === 'concessional_charge') {
    return { inputs: `${r.year}; additional income tax ${money(/** @type {string} */ (input.additional_tax))}; tax due ${day(/** @type {string} */ (input.tax_due_date))}`,
      rows: [['Additional income tax', money(/** @type {string} */ (input.additional_tax))],
        ['Days charged', `${r.days}, ${day(/** @type {string} */ (r.firstDay))} to ${day(/** @type {string} */ (r.lastDay))}`],
        ['Excess concessional contributions charge', money(a.excess_concessional_contributions_charge)]],
      principal: 2, note: 'Compounded daily at the shortfall interest charge rate; payable only once the ATO’s determination states it', tables: {} };
  }
  const [annual, daily] = /** @type {string[]} */ (ATO_TABLE_5.get(r.year));
  return { inputs: `${r.year} contributions year; excess ${money(/** @type {string} */ (input.excess))}; determination ${day(/** @type {string} */ (input.determination_date))}`,
    rows: [['Excess non-concessional contributions', money(/** @type {string} */ (input.excess))],
      ['Proxy rate, the year’s average base interest rate plus 7 points', `${Number(r.rates.proxy_rate_percent)}% a year`],
      ['Days to the determination', String(r.days)], ['Associated earnings, rounded down to the dollar', money(a.associated_earnings)],
      ['Total release amount: the excess and 85% of the earnings', money(a.total_release_amount)],
      ['Associated earnings in your assessable income', money(a.assessable_associated_earnings)],
      ['Tax offset, 15% of the earnings', money(a.associated_earnings_tax_offset)]],
    principal: 4, note: `Assumes the whole amount is released. The ATO publishes ${annual}% a year (${daily}% a day) for ${r.year}; `
      + 'a determination using it can differ by some dollars', tables: {} };
}

/** The page's result for the chosen calculation. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function transferBalanceResult(value, aud) {
  return value('calc') === 'transfer' ? accountResult(value, aud) : excessResult(value, aud);
}
