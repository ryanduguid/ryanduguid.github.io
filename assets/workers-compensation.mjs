// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { number } from './money.mjs';

// One employer's workers compensation premium for a 2026-27 policy, from the wages it declares
// and the industry or premium rate its insurer gives it. The rate is the user's: no industry rate
// table is held here. Each scheme's method, read 19 November 2026:
// - NSW: SIRA, Workers Compensation Market Practice and Premiums Guidelines 2026 (from 4 pm on
//   30 June 2026), cl 6.7 (a small employer's basic tariff premium does not exceed $30,000) and
//   cl 6.10 (the apprentice incentive); icare, 'Premium calculation for small employers'
//   (P = APP + D + M - SER - PD - A + Q + CCC) and 'Premium updates for 2026-27' (updated
//   9 November 2026: minimum premium $240). icare's 2025-26 WIC rate table, which the rate freeze
//   keeps for 2026-27, gives the dust diseases rate including GST.
// - Vic: WorkCover Premiums Order (No. 34) 2026/2027 (Gazette P1, 29 April 2026) cl 6, 8, 9(1)
//   to (3), 10, 11 and 12(4) and (5); Gazette S 284 (2 June 2026) items 1 to 3: minimum premium
//   $400, buy-out value 0.1, deductible amount 15,500.
// - Qld: WorkCover Queensland Notice (No. 1) of 2026 (Gazette No. 43, 26 June 2026) ss 3.2, 4.1,
//   5.2, 8.3 and 10.1(a): a policy that commences in 2026-27 pays wages / 100 x the industry rate
//   per $100, less the apprentice discount; Duties Act 2001 (Qld) s 362(3) (reprint from
//   22 October 2026): duty at 5% of net premiums, which include the GST (QRO public ruling DA356.1).
// - SA: ReturnToWorkSA, 'Your premium explained': Premium = BP x (1 - D) + C - A + SUR, with its
//   discount bands and the claims cost cap of 3 x D x BP; its 2026-27 premium calculator workbook:
//   no discount or claims cost in the first full year, the apprentice base premium deducted,
//   a $200 minimum and the premium rounded down to the whole dollar. SUR is taken as nil.
// - WA, Tas, ACT and NT: privately underwritten; the premium is the insurer's rate x wages, plus
//   GST (NT WorkSafe's worked example). WorkCover WA's recommended rates, WorkSafe Tasmania's
//   suggested rates and the ACT's suggested reasonable rates are guides, not the insurer's price.

/** @typedef {'AU-NSW' | 'AU-VIC' | 'AU-QLD' | 'AU-WA' | 'AU-SA' | 'AU-TAS' | 'AU-ACT' | 'AU-NT'} WcPlace */
/** @typedef {{place: WcPlace, wages: string, rate: string, apprentice: string, actual: string, group: 'yes' | 'no',
 *   dust: string, reward: string, vicEmployer: 'new' | 'small' | 'other', days: string, buyout: 'yes' | 'no',
 *   qldStart: 'q1' | 'q2' | 'q3' | 'q4' | 'existing', firstYear: 'yes' | 'no', claims: string}} WcInput */
/** @typedef {[string, bigint]} WcLine a step's label and its amount in cents, negative when it is taken off */
/** @typedef {{lines: WcLine[], premium: bigint, gst: bigint, duty: bigint, total: bigint, notes: string[]}} WcPremium */

export const WC_SCHEMES = {
  'AU-NSW': { name: 'New South Wales', insurer: 'icare' },
  'AU-VIC': { name: 'Victoria', insurer: 'WorkSafe Victoria' },
  'AU-QLD': { name: 'Queensland', insurer: 'WorkCover Queensland' },
  'AU-WA': { name: 'Western Australia', insurer: 'your approved insurer' },
  'AU-SA': { name: 'South Australia', insurer: 'ReturnToWorkSA' },
  'AU-TAS': { name: 'Tasmania', insurer: 'your licensed insurer' },
  'AU-ACT': { name: 'Australian Capital Territory', insurer: 'your approved insurer' },
  'AU-NT': { name: 'Northern Territory', insurer: 'your approved insurer' },
};

const NSW_SMALL_LIMIT = 3000000n; // cents: a basic tariff premium of $30,000 or less
const NSW_MINIMUM = 24000n;
const VIC_MINIMUM = 40000n;
const VIC_DEDUCTIBLE_DOLLARS = 15500n;
const VIC_EXEMPTION_DOLLARS = 7500n;
const NSW_EXEMPTION = 750000n;
const QLD_MINIMUM = { q1: 20000n, q2: 15000n, q3: 10000n, q4: 5000n };
const QLD_STARTS = { q1: 'from 1 July to 30 September 2026', q2: 'from 1 October to 31 December 2026',
  q3: 'from 1 January to 31 March 2027', q4: 'from 1 April to 30 June 2027' };
const QLD_DUTY_PERCENT = 5n;
// ReturnToWorkSA's discount factor in hundredths for a base premium below each bound, in cents.
const SA_BANDS = [[1000000n, 5n], [5000000n, 10n], [10000000n, 15n], [50000000n, 20n], [100000000n, 25n]];
const SA_TOP_BAND = 30n;
const SA_MINIMUM_DOLLARS = 200n;

/** Half up to a whole unit; the fraction must not be negative. @param {bigint} n @param {bigint} d */
const half = (n, d) => (2n * n + d) / (2n * d);
/** Cents at a rate held in ten-thousandths of 1%: 3.5% is 35,000. @param {bigint} cents @param {bigint} rate */
const at = (cents, rate) => half(cents * rate, 1000000n);
const gstOn = (/** @type {bigint} */ cents) => half(cents, 10n);
/** @param {bigint} cents */
const dollarsText = (cents) => `$${(Number(cents) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** A rate as the page writes it: 2.25%, 3.5%. @param {bigint} rate */
const rateText = (rate) => `${Number(rate) / 10000}%`;

/** @param {string} value @param {string} what */
const moneyCents = (value, what) => {
  try {
    return BigInt(Math.round(number(value, { max: 1e10, money: true }) * 100));
  } catch {
    throw new Error(`Enter ${what} in dollars and cents, from $0 to $10,000,000,000.`);
  }
};
/** A rate per cent to 4 decimal places, in ten-thousandths of 1%. @param {string} value @param {string} what */
const rateOf = (value, what, { min = 0, max = 100 } = {}) => {
  let rate;
  try {
    rate = number(value, { min, max, places: 4 });
  } catch {
    throw new Error(`Enter ${what} as a percentage from ${min}% to ${max}%, to no more than 4 decimal places.`);
  }
  return BigInt(Math.round(rate * 10000));
};
/** @param {string} value @param {string[]} choices @param {string} message */
const choice = (value, choices, message) => {
  if (!choices.includes(value)) throw new Error(message);
  return value;
};

/** New South Wales, a small employer: the average performance premium, less the Safe Employer
 * Reward on it (an apprentice incentive is refused before this), plus GST, with the dust diseases contribution
 * (its rate includes GST) added after.
 * @param {bigint} wages @param {bigint} rate @param {bigint} apprentice @param {WcInput} x @returns {WcPremium} */
function nsw(wages, rate, apprentice, x) {
  const dust = rateOf(x.dust, 'the dust diseases rate', { max: 10 });
  const reward = rateOf(x.reward, 'the Safe Employer Reward', { max: 100 });
  const app = at(wages, rate);
  // icare's APP is wages × the WIC rate, with no rounding before the $30,000 test, so the
  // exact product is tested: $1,000,000.01 at 3% is over it, though it rounds to $30,000.00.
  if (wages * rate > NSW_SMALL_LIMIT * 1000000n) {
    const amount = app > NSW_SMALL_LIMIT ? `of ${dollarsText(app)}` : `(wages × WIC rate, before rounding to ${dollarsText(app)})`;
    throw new Error(`The average performance premium ${amount} is more than $30,000, so icare experience-rates the premium on its claims model (Market Practice and Premiums Guidelines 2026, clause 6.7): use the renewal notice.`);
  }
  const ser = at(app, reward);
  const premium = app - ser;
  if (premium < NSW_MINIMUM) {
    throw new Error(`The premium of ${dollarsText(premium)} is below icare’s minimum premium of $240, and icare does not say whether the minimum includes GST: use the renewal notice.`);
  }
  const gst = gstOn(premium);
  const contribution = at(wages, dust);
  /** @type {WcLine[]} */
  const lines = [[`Average performance premium: wages × WIC rate of ${rateText(rate)}`, app]];
  if (ser) lines.push([`Less Safe Employer Reward at ${rateText(reward)} of it`, -ser]);
  lines.push(['Premium before GST', premium], ['GST at 10%', gst],
    [`Dust diseases contribution: wages × ${rateText(dust)}, including GST`, contribution]);
  const notes = wages <= NSW_EXEMPTION
    ? ['Wages of $7,500 or less with no apprentice or trainee, outside a group: the employer may be exempt from holding a policy'] : [];
  return { lines, premium, gst, duty: 0n, total: premium + gst + contribution, notes };
}

/** Victoria, a new or small employer: Premiums Order (No. 34) clauses 6, 8 to 11, worked in
 * millionths of a dollar as clause 6(1) rounds, the WorkCover premium rounded down to the cent.
 * @param {bigint} wages @param {bigint} rate @param {WcInput} x @returns {WcPremium} */
function victoria(wages, rate, x) {
  if (choice(x.vicEmployer, ['new', 'small', 'other'], 'Choose whether the Victorian employer is new, small or neither.') === 'other') {
    throw new Error('An employer that is neither new nor small (annualised 2025-26 remuneration over $200,000) has a performance-rated premium (Premiums Order clause 12): use WorkSafe’s premium notice.');
  }
  let days;
  try {
    days = BigInt(number(x.days, { min: 1, max: 365, integer: true }));
  } catch {
    throw new Error('Enter the days in 2026-27 the employer is registered, from 1 to 365.');
  }
  const remuneration = half(wages, 100n); // clause 6(6): to the nearest dollar
  // Clause 11 divides the preliminary premium by the remuneration, so nil gives no figure.
  if (remuneration === 0n) {
    throw new Error('The remuneration rounds to $0, and clause 11’s deductible divides by it: the Premiums Order gives no figure, so use WorkSafe’s premium notice.');
  }
  // Clause 9(2): R × premium rate, in millionths of a dollar, as the rate is in millionths of 1;
  // clause 11: preliminary premium ÷ R × 15,500 × N ÷ 365, which is the premium rate × 15,500
  // × N ÷ 365, with N ÷ 365 rounded to 6 decimal places as clause 6(1) rounds all numbers, and
  // the deductible to the nearest cent (clause 6(4)).
  const preliminary = remuneration * rate;
  const share = half(days * 1000000n, 365n); // N ÷ 365 in millionths
  const deductible = half(rate * VIC_DEDUCTIBLE_DOLLARS * share, 10000n * 1000000n);
  const worked = (preliminary - deductible * 10000n) / 10000n; // below $400 whenever negative
  const minimum = worked < VIC_MINIMUM;
  const workcover = minimum ? VIC_MINIMUM : worked;
  const buyout = x.buyout === 'yes' ? workcover / 10n : 0n;
  const gst = gstOn(workcover + buyout);
  /** @type {WcLine[]} */
  const lines = [[`Preliminary premium: remuneration of ${dollarsText(remuneration * 100n)} × premium rate of ${rateText(rate)} (clause 9(2))`,
    half(preliminary, 10000n)],
  [`Less deductible benefit: premium rate × $15,500 × ${days} days ÷ 365 (to 6 decimal places), to the cent (clauses 11 and 6)`, -deductible],
  [minimum ? 'WorkCover premium: the minimum premium of $400 (clause 9(1)(b))' : 'WorkCover premium, rounded down to the cent (clause 9(1))', workcover]];
  if (buyout) lines.push(['Excess buy-out premium: 0.1 × WorkCover premium (clause 10)', buyout]);
  lines.push(['GST at 10% (clause 8)', gst]);
  const notes = remuneration <= VIC_EXEMPTION_DOLLARS
    ? ['Rateable remuneration of $7,500 or less is within the exemption limit for 2026-27 (Premiums Order clause 7), unless the employer has an apprentice or trainee'] : [];
  return { lines, premium: workcover + buyout, gst, duty: 0n, total: workcover + buyout + gst, notes };
}

/** Queensland, a policy that commences in 2026-27: the notice's sections 3.2, 4.1, 5.2, 8.3 and 10.1.
 * @param {bigint} wages @param {bigint} rate @param {bigint} apprentice @param {WcInput} x @returns {WcPremium} */
function queensland(wages, rate, apprentice, x) {
  const start = /** @type {keyof typeof QLD_MINIMUM | 'existing'} */ (choice(x.qldStart, ['q1', 'q2', 'q3', 'q4', 'existing'],
    'Choose when the Queensland policy commences.'));
  if (start === 'existing') {
    throw new Error('A policy that commenced before 1 July 2026 has a premium rate from WorkCover Queensland’s simplified or experience-based model and an adjustment for 2025-26 (Notice (No. 1) of 2026, parts 5 and 6): use the premium notice.');
  }
  const estimated = at(wages, rate);
  const discount = at(apprentice, rate);
  const premium = estimated - discount;
  const gst = gstOn(premium);
  const duty = half((premium + gst) * QLD_DUTY_PERCENT, 100n);
  /** @type {WcLine[]} */
  const lines = [[`Estimated premium: wages ÷ $100 × industry rate of $${Number(rate) / 10000} (sections 5.2 and 10.1)`, estimated]];
  if (discount) lines.push(['Less apprentice discount: apprentice wages ÷ $100 × the rate (section 8.3)', -discount]);
  const minimum = QLD_MINIMUM[start];
  if (premium + gst + duty >= minimum) {
    lines.push(['GST at 10%', gst], ['Insurance duty at 5% of the premium and GST (Duties Act 2001 (Qld) s 362(3))', duty]);
    return { lines, premium, gst, duty, total: premium + gst + duty, notes: [] };
  }
  // Section 4.1's minimum includes GST and duty: the premium within it is the minimum ÷ 1.1 ÷ 1.05.
  const within = half(minimum * 1000n, 1155n);
  const withinGst = gstOn(within);
  lines.push([`Premium within the minimum of ${dollarsText(minimum)} for a policy commencing then, including GST and duty (section 4.1)`, within],
    ['GST at 10%', withinGst], ['Insurance duty at 5% of the premium and GST (Duties Act 2001 (Qld) s 362(3))', minimum - within - withinGst]);
  return { lines, premium: within, gst: withinGst, duty: minimum - within - withinGst, total: minimum, notes: [] };
}

/** South Australia: BP × (1 - D) + C - A, with SUR nil, as ReturnToWorkSA's 2026-27 calculator
 * works it: exact until the premium, which is at least $200 and rounded down to the whole dollar.
 * @param {bigint} wages @param {bigint} rate @param {bigint} apprentice @param {WcInput} x @returns {WcPremium} */
function southAustralia(wages, rate, apprentice, x) {
  const first = choice(x.firstYear, ['yes', 'no'], 'Choose whether this is the employer’s first full financial year registered.') === 'yes';
  const claims = first ? 0n : moneyCents(x.claims, 'the claims costs');
  // Hundred-millionths of a cent, so the base premium, the discount and the cap are exact.
  const unit = 100000000n;
  const base = wages * rate * 100n;
  const apprenticeBase = apprentice * rate * 100n;
  // ReturnToWorkSA's table puts a base premium 'under $10k' in the lower band; its calculator
  // looks the band up against $9,999.99, putting one above that and below $10,000 in the higher.
  // The Premium Order that settles it was not readable, so a base premium in that gap is refused.
  const edge = first ? undefined : SA_BANDS.find(([below]) => base > (below - 1n) * unit && below * unit > base);
  if (edge) {
    throw new Error(`The base premium is above ${dollarsText(edge[0] - 1n)} and below ${dollarsText(edge[0])}: ReturnToWorkSA’s table puts it in the lower discount band and its premium calculator in the higher one, so this calculator does not decide it.`);
  }
  const band = first ? 0n : (SA_BANDS.find(([below]) => base < below * unit)?.[1] ?? SA_TOP_BAND);
  const discount = wages * rate * band;
  const cap = 3n * discount;
  const applied = claims * unit < cap ? claims * unit : cap;
  const sum = base - discount + applied - apprenticeBase;
  const minimum = sum < SA_MINIMUM_DOLLARS * 100n * unit;
  const premium = (minimum ? SA_MINIMUM_DOLLARS * 100n * unit : sum) / (100n * unit) * 100n;
  const gst = gstOn(premium);
  const shown = (/** @type {bigint} */ amount) => half(amount, unit);
  /** @type {WcLine[]} */
  const lines = [[`Base premium: remuneration × industry premium rate of ${rateText(rate)}`, shown(base)]];
  if (first) lines.push(['No discount or claims costs in the first full financial year registered', 0n]);
  else {
    lines.push([`Less discount at ${band}% for a base premium in its band`, -shown(discount)]);
    lines.push([applied < claims * unit ? 'Plus claims costs, capped at 3 × the discount' : 'Plus claims costs', shown(applied)]);
  }
  if (apprenticeBase) lines.push(['Less apprentice incentive: apprentice remuneration × the rate', -shown(apprenticeBase)]);
  lines.push([minimum ? 'Premium: the minimum premium of $200' : 'Premium, rounded down to the whole dollar', premium], ['GST at 10%', gst]);
  return { lines, premium, gst, duty: 0n, total: premium + gst, notes: [] };
}

/** Western Australia, Tasmania, the ACT and the Northern Territory: the insurer's rate × wages, plus GST.
 * @param {bigint} wages @param {bigint} rate @returns {WcPremium} */
function privateScheme(wages, rate) {
  const premium = at(wages, rate);
  const gst = gstOn(premium);
  return { lines: [[`Premium: wages × your insurer’s rate of ${rateText(rate)}`, premium], ['GST at 10%', gst]],
    premium, gst, duty: 0n, total: premium + gst, notes: [] };
}

/** The premium on one wages figure, in the chosen scheme. @param {WcInput} x @param {bigint} wages @param {bigint} rate @param {bigint} apprentice */
function premiumOn(x, wages, rate, apprentice) {
  if (apprentice > wages) throw new Error('Apprentice wages are part of the wages: enter no more than the wages.');
  switch (x.place) {
    case 'AU-NSW': return nsw(wages, rate, apprentice, x);
    case 'AU-VIC': return victoria(wages, rate, x);
    case 'AU-QLD': return queensland(wages, rate, apprentice, x);
    case 'AU-SA': return southAustralia(wages, rate, apprentice, x);
    default: return privateScheme(wages, rate);
  }
}

const money = (/** @type {bigint} */ cents) => Number(cents) / 100;

/** One employer's 2026-27 premium on its estimated wages and, when `actual` is not blank, on its
 * actual wages with the adjustment between them. Amounts are numeric AUD.
 * @param {WcInput} x */
export function workersCompensation(x) {
  if (!Object.hasOwn(WC_SCHEMES, x.place)) throw new Error('Choose the state or territory whose scheme insures the workers.');
  const grouped = choice(x.group, ['yes', 'no'], 'Choose whether the employer is a member of a group.') === 'yes';
  if (grouped && ['AU-NSW', 'AU-VIC', 'AU-QLD', 'AU-SA'].includes(x.place)) {
    throw new Error('A member of a group is classed and rated on the group’s wages or premiums together: use the insurer’s notice.');
  }
  const wages = moneyCents(x.wages, 'the estimated wages');
  const rate = rateOf(x.rate, 'the rate', { min: 0.0001 });
  const usesApprentices = ['AU-NSW', 'AU-QLD', 'AU-SA'].includes(x.place);
  const apprentice = usesApprentices ? moneyCents(x.apprentice, 'the apprentice wages') : 0n;
  if (!usesApprentices && x.apprentice.trim() !== '' && moneyCents(x.apprentice, 'the apprentice wages') !== 0n) {
    throw new Error(`There is no apprentice deduction for ${WC_SCHEMES[x.place].name} here: enter 0 apprentice wages${x.place === 'AU-VIC' ? ', and leave exempt apprentice and trainee pay out of the remuneration' : ''}.`);
  }
  // icare takes the incentive off 'after premium payable is calculated' without saying whether before
  // or after GST, and SIRA's Guidelines, which would settle it, were not readable on 24 November 2026.
  if (x.place === 'AU-NSW' && apprentice > 0n) {
    throw new Error('icare discounts the apprentice incentive ‘after premium payable is calculated’ and does not say whether before or after GST: use the renewal notice.');
  }
  const estimate = premiumOn(x, wages, rate, apprentice);
  const actualWages = x.actual.trim() === '' ? null : moneyCents(x.actual, 'the actual wages');
  // The Notice (No. 1) of 2026 works the 2026-27 estimate and the 2025-26 actual premium (sections 5
  // and 6); the 2026-27 actual premium is for a later notice.
  if (x.place === 'AU-QLD' && actualWages !== null) {
    throw new Error('WorkCover Queensland Notice (No. 1) of 2026 sets no year-end adjustment on actual wages for a policy commencing in 2026-27: leave the actual wages blank.');
  }
  let actual = null;
  if (actualWages !== null) {
    try {
      actual = premiumOn(x, actualWages, rate, apprentice);
    } catch (error) {
      const { message } = /** @type {Error} */ (error);
      throw new Error(`On the actual wages, ${message[0].toLowerCase()}${message.slice(1)}`);
    }
  }
  const claims = x.place === 'AU-SA' && x.firstYear === 'no' ? moneyCents(x.claims, 'the claims costs') : 0n;
  return { lines: estimate.lines, notes: estimate.notes, wages: money(wages), actualWages: actualWages === null ? null : money(actualWages),
    apprentice: money(apprentice), claims: money(claims),
    premium: money(estimate.premium), gst: money(estimate.gst), duty: money(estimate.duty), total: money(estimate.total),
    actualTotal: actual && money(actual.total), adjustment: actual && money(actual.total - estimate.total) };
}

/** The page's result: its inputs sentence, a row for each step and the note.
 * @param {(name: string) => string} value @param {(value: number) => string} aud */
export function workersCompensationResult(value, aud) {
  // The form's field for each input.
  const fields = { place: 'jurisdiction', vicEmployer: 'vic-employer', qldStart: 'qld-start', firstYear: 'first-year' };
  const x = /** @type {WcInput} */ (Object.fromEntries(['place', 'wages', 'rate', 'apprentice', 'actual', 'group', 'dust', 'reward',
    'vicEmployer', 'days', 'buyout', 'qldStart', 'firstYear', 'claims'].map((name) => [name, value(fields[/** @type {keyof typeof fields} */ (name)] ?? name)])));
  const r = workersCompensation(x);
  const shown = (/** @type {bigint} */ cents) => aud(Math.abs(Number(cents)) / 100);
  const rows = r.lines.map(([label, cents]) => [label, shown(cents)]);
  rows.push(['Premium payable on the estimated wages', aud(r.total)]);
  const principal = rows.length - 1;
  if (r.adjustment !== null && r.actualTotal !== null) {
    rows.push(['Premium payable on the actual wages', aud(r.actualTotal)],
      [r.adjustment < 0 ? 'Adjustment: a credit, actual less estimate' : 'Adjustment: more to pay, actual less estimate', aud(Math.abs(r.adjustment))]);
  }
  const scheme = WC_SCHEMES[x.place];
  /** @type {Partial<Record<WcPlace, string>>} */
  const extras = { 'AU-SA': ', before the work health and safety fee, which carries no GST' };
  const extra = extras[x.place] ?? '';
  const apprentices = r.apprentice ? `, apprentice wages ${aud(r.apprentice)}` : '';
  /** @type {Partial<Record<WcPlace, string>>} */
  const schemeFacts = {
    'AU-NSW': `${apprentices}, dust diseases rate ${x.dust}%, Safe Employer Reward ${x.reward}%`,
    'AU-VIC': `, ${x.vicEmployer === 'new' ? 'a new' : 'a small'} employer registered ${x.days} days${x.buyout === 'yes' ? ', excess bought out' : ''}`,
    'AU-QLD': `, policy commencing ${QLD_STARTS[/** @type {keyof typeof QLD_MINIMUM} */ (x.qldStart)]}${apprentices}`,
    'AU-SA': `${x.firstYear === 'yes' ? ', first full financial year registered' : `, claims costs ${aud(r.claims)}`}${apprentices}`,
  };
  const facts = schemeFacts[x.place] ?? '';
  return { inputs: `${scheme.name}, estimated wages ${aud(r.wages)}, rate ${value('rate')}%${facts}`
    + `${r.actualWages === null ? '' : `, actual wages ${aud(r.actualWages)}`}`,
  rows, principal, note: [...r.notes, `An estimate for a 2026-27 policy${extra}; ${scheme.insurer}’s notice is the premium`].join('. ') };
}
