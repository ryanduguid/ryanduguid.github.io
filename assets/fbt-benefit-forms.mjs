// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// The FBT car parking, loan and meal entertainment forms: each reads its fields, runs its
// engine from assets/fbt-benefits.mjs and returns the rows assets/accounting-pages.mjs renders.
// The year's rate, threshold and days come from the form's data attributes, which the Node
// tests bind to the ATO's FBT rates and thresholds page as the include cites it.

const PARKING_METHODS = { station: 'commercial parking station method', market: 'market value method',
  average: 'average cost method', register: '12-week register method', spaces: 'spaces method' };

const parkingInputs = (value) => ({ method: value('method'), fee: value('fee'), benefits: value('benefits'), each: value('each'),
  firstFee: value('first-fee'), lastFee: value('last-fee'), registerValue: value('register-value'), days: value('days'),
  firstYear: value('first-year'), rate: value('rate'), spaceDays: value('space-days'), spaces: value('spaces'),
  employeesStart: value('employees-start'), employeesEnd: value('employees-end'), spacesStart: value('spaces-start'),
  spacesEnd: value('spaces-end'), contribution: value('contribution') });

// The inputs the chosen method reads, as the result's first line names them.
function parkingSummary(p, money) {
  const fee = `first business day fee ${money('fee')}`;
  const paid = `employee contributions ${money('contribution')}`;
  const method = {
    station: `${p.benefits} benefits at ${money('each')}, ${paid}`,
    market: `${p.benefits} benefits at a market value of ${money('each')}, ${paid}`,
    average: `${p.benefits} benefits, lowest fees ${money('first-fee')} on the first day and ${money('last-fee')} on the last, ${paid}`,
    register: `register value ${money('register-value')} over ${p.days} days, register first valid for the year ending 31 March ${p.firstYear}`,
    spaces: `${p.spaces} spaces at a daily rate amount of ${money('rate')} for ${p.spaceDays} days, employees ${p.employeesStart} `
      + `and ${p.employeesEnd}, eligible spaces ${p.spacesStart} and ${p.spacesEnd}, ${paid}`,
  }[p.method];
  return `${PARKING_METHODS[p.method]}, ${fee}, ${method}`;
}

function parkingRows(r, aud) {
  return [
    ...(r.average === undefined ? [] : [['Average cost of each benefit', aud(r.average)]]),
    ...(r.annual === undefined ? [] : [['Register value × 52 ÷ 12', aud(r.annual)]]),
    ...(r.statutoryBenefit === undefined ? [] : [['Total statutory benefit', aud(r.statutoryBenefit)],
      ['Average employees and eligible spaces', `${r.averageEmployees} and ${r.averageSpaces}`]]),
    ['Gross taxable value', aud(r.gross)],
    ...(r.contributionApplied === undefined ? [] : [['Employee contributions applied', aud(r.contributionApplied)],
      ['Excess contributions', aud(r.excess)]]),
    ['Taxable value', aud(r.taxableValue)],
  ];
}

function parking(form, calculate, { aud, value, money }) {
  const year = { threshold: form.dataset.threshold, days: form.dataset.yearDays, ended: form.dataset.yearEnded };
  const p = parkingInputs(value);
  const r = calculate.fbtCarParking(p, year);
  const result = { inputs: parkingSummary(p, money) };
  if (!r.benefit) {
    return { ...result, rows: [['Taxable value', aud(0)]], principal: 0,
      note: `No car parking benefit arises: the first business day fee is not more than the $${year.threshold} threshold` };
  }
  const rows = parkingRows(r, aud);
  return { ...result, rows, principal: rows.length - 1, note: parkingNote(p, r, Number(year.ended) - 1) };
}

// What a valued result rests on that the calculator cannot check, by method; `last` is the year before this one.
function parkingNote(p, r, last) {
  // s 39GF(3): a 10% rise on any day of an earlier year ended the register at that year's end.
  if (p.method === 'register') {
    return Number(p.firstYear) <= last ? 'Valid only if the number of car parking fringe benefits did not rise by '
      + `more than 10% on any day in the years ending 31 March ${p.firstYear} to ${last} (subsection 39GF(3)), which this `
      + 'calculator does not check' : undefined;
  }
  // s 39FB(6): the reduction for fewer employees needs representative numbers of employees and spaces.
  if (p.method === 'spaces') {
    return r.averageEmployees < r.averageSpaces ? 'The reduction for fewer employees than spaces applies only if both '
      + 'numbers are representative (subsection 39FB(6)), which this calculator does not check' : undefined;
  }
  // ss 39C, 39D and 39DA reduce each benefit by its own contribution, so a total is right only without excesses.
  return r.contributionApplied + r.excess > 0 ? 'Contributions come off in total: if one benefit’s contribution was '
    + 'more than its value, the excess does not reduce other benefits, so value that benefit separately' : undefined;
}

function loan(form, calculate, { aud, value, money }) {
  const year = { days: form.dataset.yearDays, rate: form.dataset.statutoryRate };
  const r = calculate.fbtLoan({ balances: value('balances'), accrued: value('accrued'), incomeUse: value('income-use'),
    deduction: value('deduction') }, year);
  return { inputs: `daily balances totalling ${money('balances')}, interest accrued ${money('accrued')}, `
    + `${value('income-use')}% income use, deduction for the interest accrued ${money('deduction')}`, principal: 5,
  rows: [[`Notional interest at ${year.rate}%`, aud(r.notional)], ['Gross taxable value', aud(r.gross)],
    ['Gross deduction', aud(r.grossDeduction)], ['Notional deduction', aud(r.notionalDeduction)],
    ['Reduction applied', aud(r.reduction)], ['Taxable value', aud(r.taxableValue)]] };
}

function meal(form, calculate, { aud, value, money }) {
  const year = { ended: form.dataset.yearEnded };
  const method = value('method');
  const first = Number(value('first-year'));
  // The years from the register's first valid year to the year before this one, oldest first.
  const years = [];
  for (let ended = first; ended < Number(year.ended); ended += 1) years.push(ended);
  const earlier = years.map((ended) => form.elements.namedItem(`earlier-${ended}`)?.value ?? '');
  const r = calculate.fbtMealEntertainment({ method, expenses: value('expenses'), registerBenefits: value('register-benefits'),
    registerTotal: value('register-total'), firstYear: value('first-year'), earlier }, year);
  if (method === 'split') {
    return { inputs: `50/50 split method, meal entertainment expenses ${money('expenses')}`, principal: 0,
      rows: [['Taxable value, 50% of the expenses', aud(r.taxableValue)]] };
  }
  return { inputs: `12-week register method, meal entertainment expenses ${money('expenses')}, register fringe benefits `
    + `${money('register-benefits')} of ${money('register-total')}, register first valid for the year ending 31 March ${first}`
    + `${years.map((ended) => `, expenses ${money(`earlier-${ended}`)} for ${ended}`).join('')}`, principal: 1,
  rows: [['Register percentage', `${r.registerPercent.toFixed(2)}%`], ['Taxable value', aud(r.taxableValue)],
    ['50/50 split method, for the same expenses', aud(calculate.fbtMealEntertainment({ method: 'split', expenses: value('expenses') }, year).taxableValue)]],
  note: 'Which method to elect is the employer’s choice' };
}

// The electric cars exemption's conditions as the FBT car result names them, with their provisions.
const EV_CONDITIONS = {
  'current-employee': 'Provided to a current employee, s 8A(1)(a)',
  'zero-or-low-emissions': 'A battery electric or hydrogen fuel cell electric car, s 8A(1)(b)',
  'hybrid-committed': 'Committed before 1 April 2025 for a period that began before then and includes the benefit, Schedule 2 item 5(2)(b)',
  'hybrid-no-new-commitment': 'No new commitment from 1 April 2025 for a period including the benefit, Schedule 2 item 5(2)(c)',
  'hybrid-exempt-before': 'An exempt car benefit with the car before 1 April 2025, Schedule 2 item 5(2)(d) and (e)',
  'first-held-and-used': 'First held and used on or after 1 July 2022, Schedule 1 item 7(2)',
  'first-sale': 'No luxury car tax payable on the first retail sale before the benefit, s 8A(1)(c)',
  'other-supply': 'No luxury car tax payable on another sale or an import before the benefit, s 8A(1)(c)',
};
const EV_KINDS = { battery: 'battery electric', 'fuel-cell': 'hydrogen fuel cell electric', 'plug-in-hybrid': 'plug-in hybrid electric' };
const longDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export const EV_EXEMPT_NOTE = 'The taxable value before the exemption still counts in the employee’s reportable fringe benefits amount '
  + '(subsection 135P(3)), reported when the employee’s total for the year is more than $2,000, unless the car is a pooled or shared '
  + 'car, whose benefit is excluded. The car’s registration, insurance, repairs, maintenance and fuel, electricity included, are exempt '
  + 'too (subsection 53(1)) and not reported; a home charging station is not a car expense under that exemption';

/** The electric cars exemption for the FBT car form: its inputs, a row for each condition and the
 * verdict, or null for a car it cannot reach.
 * @param {HTMLFormElement} form @param {Record<string, Function>} calculate the engines
 * @param {{aud: Function, value: Function, money: Function}} format the page's helpers */
export function fbtEvResult(form, calculate, { aud, value, money }) {
  const kind = value('kind');
  if (kind === 'other') return null;
  const yes = (name) => value(name) === 'yes';
  const hybrid = kind === 'plug-in-hybrid'
    ? { committed: yes('hybrid-committed'), newCommitment: yes('hybrid-new'), exemptBefore: yes('hybrid-exempt-before') } : undefined;
  const e = calculate.fbtEvExemption({ vehicle: kind, currentEmployee: yes('current-employee'), firstUsed: value('first-used'),
    firstSale: value('first-sale'), lctValue: value('lct-value'), otherSupply: yes('other-supply'), ...(hybrid ? { hybrid } : {}) },
  { ended: form.dataset.yearEnded });
  const commitments = hybrid ? `, ${hybrid.committed ? '' : 'not '}committed before 1 April 2025, ${hybrid.newCommitment ? 'a' : 'no'} new `
    + `commitment since, ${hybrid.exemptBefore ? 'an' : 'no'} exempt car benefit before 1 April 2025` : '';
  return { exempt: e.exempt,
    inputs: `${EV_KINDS[kind]} car for a ${yes('current-employee') ? 'current' : 'former or future'} employee, first held and used `
      + `${longDate(value('first-used'))}, first sold at retail ${longDate(value('first-sale'))} `
      + `${e.threshold === null ? 'after the FBT year, so after every benefit in it'
        : `at a luxury car tax value of ${money('lct-value')} against the ${e.saleYear} fuel-efficient threshold of ${aud(e.threshold)}`}, `
      + `${yes('other-supply') ? '' : 'no '}luxury car tax on another sale or an import before the benefit${commitments}`,
    rows: [...e.conditions.map(({ condition, met }) => [EV_CONDITIONS[condition], met ? 'met' : 'not met']),
      ['Electric cars exemption, section 8A', e.exempt ? 'applies' : 'does not apply']] };
}

/** The result of the FBT benefit form `form`, for renderResult in accounting-pages.mjs.
 * @param {HTMLFormElement} form @param {Record<string, Function>} calculate the engines
 * @param {{aud: Function, value: Function, money: Function}} format the page's helpers */
export function fbtBenefitResult(form, calculate, format) {
  const result = new Map([['fbt-car-parking', parking], ['fbt-loan', loan], ['fbt-meal-entertainment', meal]])
    .get(form.dataset.calculator);
  if (!result) throw new Error('Unknown calculator.');
  return result(form, calculate, format);
}
