// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { cents, ratioCents, ratioPercent } from './money.mjs';

// PCG 2021/4, Table 1 (paragraph 76): each risk assessment factor's bands, from score 1 to 5,
// as a percentage and whether the band includes it; anything below the fifth band scores 6.
// Factor 1 is the profit entitlement returned by the IPP, factor 2 the total effective tax
// rate and factor 3 the IPP's remuneration as a share of the commercial benchmark.
/** @type {ReadonlyArray<ReadonlyArray<readonly [number, boolean]>>} */
const PCG_BANDS = [
  [[90, false], [75, false], [60, false], [50, true], [25, false]],
  [[40, false], [35, false], [30, true], [25, false], [20, false]],
  [[200, false], [150, false], [100, false], [90, false], [70, false]],
];
// Table 2 (paragraph 78): the highest green and the highest amber aggregate, against 2 factors or all 3.
/** @type {Readonly<Record<2 | 3, readonly [number, number]>>} */
const PCG_ZONES = { 2: [7, 8], 3: [10, 12] };

/** The score for part over whole: the first band it reaches, compared exactly in cents.
 * @param {number} part @param {number} whole positive @param {number} factor 0, 1 or 2 */
const pcgScore = (part, whole, factor) => {
  const band = PCG_BANDS[factor].findIndex(([percent, inclusive]) =>
    (inclusive ? part * 100 >= percent * whole : part * 100 > percent * whole));
  return band === -1 ? 6 : band + 1;
};

/** PCG 2021/4, Allocation of professional firm profits: the ATO's risk zone for one IPP's
 * arrangement. The guideline scores only an arrangement that passes both gateways
 * (paragraphs 10 to 12). Returning the whole entitlement is low risk with no other factor
 * scored (paragraph 81). Factor 3 is optional (paragraphs 77 to 80). Each factor's
 * percentage is compared with its bands exactly; the percentages returned round to 0.01.
 * @param {{gateway1: boolean, gateway2: boolean, entitlement: string, returned: string, tax: string,
 *   factor3: boolean, remuneration: string, benchmark: string}} arrangement */
export function pcgRisk(arrangement) {
  const failed = [arrangement.gateway1, arrangement.gateway2].findIndex((passed) => passed !== true);
  if (failed !== -1) throw new Error(`The arrangement fails Gateway ${failed + 1}, so PCG 2021/4 gives it no risk score.`);
  if (typeof arrangement.factor3 !== 'boolean') throw new Error('Factor 3 must be true or false.');
  const entitlement = cents(arrangement.entitlement);
  const returned = cents(arrangement.returned);
  if (entitlement === 0) throw new Error('Enter a profit entitlement above nil.');
  const tax = cents(arrangement.tax);
  if (returned > entitlement) throw new Error('The amount returned cannot exceed the profit entitlement.');
  if (tax > entitlement) throw new Error('The tax cannot exceed the firm income.');
  if (returned === entitlement) {
    return { returned: 100, factor1: 1, taxRate: null, factor2: null, benchmarkShare: null, factor3: null,
      total: null, zone: 'green' };
  }
  const factor1 = pcgScore(returned, entitlement, 0);
  const factor2 = pcgScore(tax, entitlement, 1);
  /** @type {number | null} */
  let benchmarkShare = null;
  /** @type {number | null} */
  let factor3 = null;
  if (arrangement.factor3) {
    const benchmark = cents(arrangement.benchmark);
    if (benchmark === 0) throw new Error('Enter a commercial benchmark above nil.');
    const remuneration = cents(arrangement.remuneration);
    benchmarkShare = ratioPercent(remuneration, benchmark);
    factor3 = pcgScore(remuneration, benchmark, 2);
  }
  const total = factor1 + factor2 + (factor3 ?? 0);
  const [green, amber] = PCG_ZONES[factor3 === null ? 2 : 3];
  return { returned: ratioPercent(returned, entitlement), factor1, taxRate: ratioPercent(tax, entitlement), factor2,
    benchmarkShare, factor3, total, zone: total <= green ? 'green' : total <= amber ? 'amber' : 'red' };
}


// The allocation across the IPP and associates that feeds factors 1 to 3. Read from PCG 2021/4
// as updated 19 June 2024, read 17 November 2026:
// https://www.ato.gov.au/law/view/document?docid=COG/PCG20214/NAT/ATO/00001
// Factor 1 (paragraph 82): the profit entitlement in the IPP's assessable income over the income
// the IPP and associated entities are collectively entitled to from the whole of firm group.
// Factor 2 (paragraph 85): total tax paid by the IPP and associated entities on professional firm
// income, divided by total firm income collectively received, times 100. Each recipient's tax is
// the larger of (a) the tax on its firm-related amounts alone and (b) its tax for the year less
// the tax without those amounts. Levies on taxable income are left out (footnote 6), and the
// guideline's examples apply the scale with no tax offset (paragraphs 87 to 99, 122 to 181).
// Factor 3 (paragraphs 100 and 101): the assessable income from the firm in the IPP's own
// hands as a percentage of the benchmark the user supplies.

/** Who an associate is. 'none' is an unused row; 'other' is a recipient this calculator cannot tax.
 * @typedef {'individual' | 'base-rate-company' | 'company' | 'none' | 'other'} PcgKind
 * @typedef {{kind: PcgKind, firm: string, deductions: string, other: string}} PcgRecipient
 * @typedef {{gateway1: boolean, gateway2: boolean, factor3: boolean, benchmark: string,
 *   recipients: PcgRecipient[]}} PcgAllocation
 * @typedef {{scale: string, baseRate: string, companyRate: string}} PcgYear
 * @typedef {{tax: number, rule: '85(a)' | '85(b)'}} PcgTax */

const PCG_RECIPIENTS = 6;

/** A rate per cent with at most 2 decimal places, as whole hundredths of a per cent.
 * @param {string | undefined} text */
const hundredths = (text) => {
  if (typeof text !== 'string' || !/^\d{1,3}(\.\d{1,2})?$/.test(text) || Number(text) > 100) {
    throw new Error('This income year’s tax rates are not usable.');
  }
  return Math.round(Number(text) * 100);
};

/** The resident scale as the year's radio holds it: from,base,rate for each band, lowest first,
 * separated by semicolons; `from` is the band's first whole dollar and `base` the tax on the
 * income below it, as the site's individual income tax table lists them. Each band starts at
 * the dollar after the previous band ends, so a band's tax runs from `from` - 1.
 * @param {string} text @returns {Array<{over: number, base: number, rate: number}>} cents and hundredths */
function residentScale(text) {
  const rows = (typeof text === 'string' ? text : '').split(';').map((row) => row.split(','));
  const usable = rows.every((row, index) => row.length === 3 && /^\d+$/.test(row[0]) && /^\d+$/.test(row[1])
    && (index ? Number(row[0]) > Number(rows[index - 1][0]) : row[0] === '0' && row[1] === '0'));
  if (!usable) throw new Error('This income year’s tax rates are not usable.');
  return rows.map(([from, base, rate]) => ({ over: Math.max(Number(from) - 1, 0) * 100, base: Number(base) * 100,
    rate: hundredths(rate) }));
}

/** Tax in cents on a taxable income in cents, half up to the cent, before any offset or levy.
 * @param {number} income @param {Array<{over: number, base: number, rate: number}>} scale */
function scaleTax(income, scale) {
  if (income <= 0) return 0;
  const band = scale.filter(({ over }) => income >= over).at(-1) ?? scale[0];
  return band.base + Number(ratioCents(BigInt(income - band.over) * BigInt(band.rate), 10000n));
}

/** Cents as the decimal string the scorer takes. @param {number} value cents, not negative */
const decimal = (value) => `${Math.trunc(value / 100)}.${String(value % 100).padStart(2, '0')}`;

/** PCG 2021/4 with the tax worked out: each recipient's tax under paragraph 85 from its firm
 * income, firm-related deductions and other income less other deductions, on the year's resident
 * scale for an individual or the year's company rate, then the 3 factors and the zone from
 * `pcgRisk`. The first recipient is the IPP. Remuneration for factor 3 is the IPP's firm income.
 * @param {PcgAllocation} arrangement @param {PcgYear} year */
export function pcgAllocation(arrangement, year) {
  const scale = residentScale(year?.scale);
  const [baseRate, companyRate] = [hundredths(year?.baseRate), hundredths(year?.companyRate)];
  const { recipients } = arrangement;
  if (!Array.isArray(recipients) || recipients.length < 1 || recipients.length > PCG_RECIPIENTS) {
    throw new Error(`Enter the IPP and up to ${PCG_RECIPIENTS - 1} associates.`);
  }
  if (recipients[0].kind !== 'individual') throw new Error('The IPP is an individual.');
  let [firmIncome, totalTax] = [0, 0];
  const taxes = recipients.map(({ kind, firm, deductions, other }, index) => {
    const [received, firmDeductions, rest] = [cents(firm), cents(deductions), cents(other, -1e9)];
    if (kind === 'none') {
      if (received || firmDeductions || rest) {
        throw new Error(`Associate ${index} is marked not used but has amounts; choose who it is or set them to 0.`);
      }
      return null;
    }
    if (kind === 'other') {
      throw new Error(`Associate ${index} is a recipient this calculator cannot tax; work out its tax yourself `
        + 'and enter the total in the PCG 2021/4 risk scorer.');
    }
    if (!['individual', 'base-rate-company', 'company'].includes(kind)) throw new Error('Choose who each associate is.');
    const rate = kind === 'base-rate-company' ? baseRate : companyRate;
    /** @param {number} income cents */
    const tax = (income) => (kind === 'individual' ? scaleTax(income, scale)
      : Number(ratioCents(BigInt(Math.max(income, 0)) * BigInt(rate), 10000n)));
    const net = received - firmDeductions;
    const alone = tax(Math.max(net, 0));
    const difference = tax(Math.max(net + rest, 0)) - tax(Math.max(rest, 0));
    firmIncome += received;
    totalTax += Math.max(alone, difference);
    return { tax: Math.max(alone, difference) / 100, rule: difference > alone ? '85(b)' : '85(a)' };
  });
  if (firmIncome > 100_000_000_000) throw new Error('The firm income of all recipients together cannot exceed $1,000,000,000.');
  const risk = pcgRisk({ gateway1: arrangement.gateway1, gateway2: arrangement.gateway2, entitlement: decimal(firmIncome),
    returned: decimal(cents(recipients[0].firm)), tax: decimal(totalTax), factor3: arrangement.factor3,
    remuneration: decimal(cents(recipients[0].firm)), benchmark: arrangement.benchmark });
  return { recipients: /** @type {Array<PcgTax | null>} */ (taxes), firmIncome: firmIncome / 100, tax: totalTax / 100, ...risk };
}

const PCG_WHO = { individual: 'individual', 'base-rate-company': 'company (base rate entity)',
  company: 'company (not a base rate entity)' };
/** @type {Record<string, string>} */
const PCG_ZONE_NAMES = { green: 'Green: low risk', amber: 'Amber: moderate risk', red: 'Red: high risk' };

/** The allocation form's result as assets/accounting-pages.mjs renders it. `value` reads a field
 * by name; `year` is the checked year's radio value and data; `aud` and `percent` format figures.
 * @param {(name: string) => string} value @param {PcgYear & {name: string}} year
 * @param {(amount: number) => string} aud @param {(share: number | null) => string} percent */
export function pcgAllocationResult(value, year, aud, percent) {
  const all = value('factor3') === 'yes';
  const recipients = Array.from({ length: PCG_RECIPIENTS }, (_, i) => ({
    kind: /** @type {PcgKind} */ (i ? value(`kind-${i}`) : 'individual'),
    firm: value(`firm-${i}`), deductions: value(`deductions-${i}`), other: value(`other-${i}`) }));
  const r = pcgAllocation({ gateway1: value('gateway1') === 'yes', gateway2: value('gateway2') === 'yes', factor3: all,
    benchmark: value('benchmark'), recipients }, year);
  const name = (/** @type {number} */ i) => (i ? `Associate ${i}` : 'IPP');
  const used = recipients.flatMap((recipient, i) => (recipient.kind === 'none' ? [] : [{ ...recipient, i }]));
  const described = used.map(({ kind, firm, deductions, other, i }) => `${i ? `associate ${i}, ${PCG_WHO[
    /** @type {'individual' | 'base-rate-company' | 'company'} */ (kind)]}` : 'IPP'}: firm income ${aud(Number(firm))}`
    + `${Number(deductions) ? `, firm-related deductions ${aud(Number(deductions))}` : ''}`
    + `${Number(other) ? `, other income less other deductions ${aud(Number(other))}` : ''}`);
  const scored = (/** @type {number | null} */ share, /** @type {number | null} */ score) => `${percent(share)}, score ${score}`;
  const rows = [...used.map(({ i }) => {
    const counted = /** @type {PcgTax} */ (r.recipients[i]);
    return [`${name(i)}: tax counted, paragraph ${counted.rule}`, aud(counted.tax)];
  }), ['Firm income of the IPP and associates', aud(r.firmIncome)], ['Tax counted on that firm income', aud(r.tax)],
  ['Factor 1: profit entitlement returned by the IPP', scored(r.returned, r.factor1)],
  ...(r.total === null ? [] : [['Factor 2: total effective tax rate', scored(r.taxRate, r.factor2)],
    ...(all ? [['Factor 3: IPP’s firm income as a share of the benchmark', scored(r.benchmarkShare, r.factor3)]] : []),
    ['Aggregate score', String(r.total)]]),
  ['Risk zone', PCG_ZONE_NAMES[r.zone]]];
  return { inputs: `${year.name} rates, gateways 1 and 2 passed, ${described.join('; ')}; ${all
    ? `remuneration against a commercial benchmark of ${aud(Number(value('benchmark')))}, all 3 factors` : 'factors 1 and 2'}`,
  rows, principal: rows.length - 1,
  note: r.total === null ? 'The IPP returns the whole entitlement, so paragraph 81 makes the arrangement low risk with no other factor scored' : undefined };
}
