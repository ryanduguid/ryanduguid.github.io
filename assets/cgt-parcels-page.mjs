// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The CGT page's share parcels form: reading its lines into the `cgt-parcels` input, and the rows
// its result shows. cgt-parcels.mjs works the result out.
import { cgtParcels, PARCEL_YEARS } from './cgt-parcels.mjs';

export { PARCEL_YEARS };

/** How the result names each input the command names. */
const WORDS = new Map([['acquisition_cost', 'the purchase cost'], ['incidental_costs', 'the buying or selling costs'],
  ['ownership_costs', 'the costs of owning'], ['capital_expenditure', 'the capital improvements'], ['title_costs', 'the title costs'],
  ['capital_proceeds', 'the sale proceeds'], ['units', 'the number of units'], ['acquired', 'the purchase date'],
  ['date', 'the sale date'], ['security', 'the code'], ['parcel', 'the parcel name']]);

/** A refusal in the page's words. @param {string} message @returns {never} */
function refused(message) {
  const words = message.split(/(\w+)/).map((part) => WORDS.get(part) ?? part).join('');
  throw Object.assign(new Error(words), { code: 'cgt_parcels.page_input' });
}

/** Non-blank lines split on spaces. @param {string} text */
const lines = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.split(/\s+/));

/** Parcel lines: name, code, purchase date, units, cost, buying costs, then optionally costs of owning,
 * improvements and title costs. @param {string} text */
export function parcelLines(text) {
  return lines(text).map((entries, i) => {
    if (entries.length < 6 || entries.length > 9) {
      refused(`Parcel line ${i + 1}: enter a name, the code, the purchase date, the units, the purchase cost and the buying costs, `
        + 'then optionally the costs of owning, the capital improvements and the title costs, separated by spaces.');
    }
    const [parcel, security, acquired, units, cost, incidental, owning, improvements, title] = entries;
    return { parcel, security, acquired, units, acquisition_cost: cost, incidental_costs: incidental,
      ...(owning === undefined ? {} : { ownership_costs: owning }),
      ...(improvements === undefined ? {} : { capital_expenditure: improvements }), ...(title === undefined ? {} : { title_costs: title }) };
  });
}

/** Sale lines: code, sale date, units, proceeds, selling costs, then for selected parcels each parcel:units.
 * @param {string} text @param {boolean} selected */
export function saleLines(text, selected) {
  return lines(text).map((entries, i) => {
    const [security, date, units, proceeds, selling, ...picks] = entries;
    if (entries.length < 5 || (selected ? picks.length === 0 : picks.length > 0)) {
      refused(`Sale line ${i + 1}: enter the code, the sale date, the units, the sale proceeds and the selling costs`
        + `${selected ? ', then each parcel sold as name:units' : ''}, separated by spaces.`);
    }
    const sale = { security, date, units, capital_proceeds: proceeds, incidental_costs: selling };
    return selected ? { ...sale, parcels: picks.map((pick) => {
      const at = pick.lastIndexOf(':');
      if (at < 1) refused(`Sale line ${i + 1}: enter each parcel sold as name:units, such as A:100.`);
      return { parcel: pick.slice(0, at), units: pick.slice(at + 1) };
    }) } : sale;
  });
}

/** The command's input from the form. @param {(name: string) => string} value */
export function parcelsInput(value) {
  const selected = value('identification') === 'selected';
  return { entity: value('entity'), identification: value('identification'), parcels: parcelLines(value('parcel-lines')),
    disposals: saleLines(value('sale-lines'), selected), other_discount_capital_gains: value('other-discount-gains') || '0',
    other_capital_gains: value('other-gains') || '0', other_capital_losses: value('other-losses') || '0',
    prior_net_capital_losses: value('prior-losses') || '0', year: value('year'), scope_confirmed: true };
}

/** @param {string} text */
const amount = (text) => Number(text);
/** @param {string} text */
const wholeAud = (text) => `$${Math.trunc(Number(text)).toLocaleString('en-AU')}`;

/** The result the page shows. @param {(name: string) => string} value @param {(amount: number) => string} aud */
export function cgtParcelsResult(value, aud) {
  const input = parcelsInput(value);
  let r;
  try {
    r = cgtParcels(input);
  } catch (error) {
    if (error instanceof Error && 'code' in error && String(error.code).startsWith('cgt_parcels.')) refused(error.message);
    throw error;
  }
  const a = new Map(Object.entries(r.amounts));
  const money = (/** @type {string} */ key) => aud(amount(a.get(key) ?? '0'));
  /** @type {[string, string][]} */
  const rows = r.matches.map((m) => [`Sale ${m.disposal} of ${m.units} ${m.security} from parcel ${m.parcel} (bought ${m.acquired})`,
    `${m.counted ? '' : `Sold in ${m.income_year}, outside the year: `}proceeds ${aud(amount(m.capital_proceeds))}, cost base `
    + `${aud(amount(m.cost_base))}, ${m.capital_loss === '0.00' ? `gain ${aud(amount(m.capital_gain))}` : `loss ${aud(amount(m.capital_loss))}`}`
    + `${m.discount && m.counted ? (m.discount.startsWith('discount') ? ', a discount capital gain' : ', no discount') : ''}`]);
  rows.push(['Total current year capital gains (label H)', money('total_capital_gains')], ['Capital losses', money('capital_losses')]);
  rows.push([`CGT discount of ${r.rates.discount_denominator === '3' ? '33 1/3' : '50'}%`, money('discount')]);
  const principal = rows.push(['Net capital gain', money('net_capital_gain')]) - 1;
  rows.push(['Net capital gain (label A), whole dollars', wholeAud(a.get('net_capital_gain') ?? '0')]);
  if (a.get('net_capital_losses_carried_forward') !== '0.00') {
    rows.push(['Net capital losses carried forward (label V), whole dollars', wholeAud(a.get('net_capital_losses_carried_forward') ?? '0')]);
  }
  for (const h of r.holdings) rows.push([`Still held: parcel ${h.parcel}, ${h.units} ${h.security}`, `cost base ${aud(amount(h.cost_base))}`]);
  const inputs = `${input.parcels.length} parcel${input.parcels.length === 1 ? '' : 's'} and ${input.disposals.length} sale`
    + `${input.disposals.length === 1 ? '' : 's'}, matched ${input.identification === 'selected' ? 'as selected' : 'first in, first out'}, for ${r.period}`;
  return { inputs, rows, principal, note: 'Each parcel is a separate CGT asset; costs and proceeds are shared between units in proportion, '
    + 'to the cent (sections 112-30 and 116-40)' };
}
