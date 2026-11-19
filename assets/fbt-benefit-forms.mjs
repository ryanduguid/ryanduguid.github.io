// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// The FBT car parking, loan, meal entertainment, property and expense payment forms: each reads its fields, runs its
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

// Each property, in-house property or in-house residual valuation rule: how a result names it, and
// what its price field holds, or null where it reads only the notional value; the acquired rule reads both.
const RULES = {
  'in-house-salary-packaging': ['in-house under salary packaging, the notional value', null],
  'in-house-trade-price': ['in-house made and sold to the trade, the lowest arm’s length price', 'lowest trade price'],
  'in-house-public-price': ['in-house made and sold to the public, 75% of the lowest public price', 'lowest public price'],
  'in-house-produced-other': ['in-house made but not identical, 75% of the notional value', null],
  'in-house-acquired': ['in-house bought for the business, the lesser of the arm’s length purchase price and the notional value',
    'arm’s length purchase price'],
  'in-house-other': ['in-house other, 75% of the notional value', null],
  'external-cost-price': ['external bought at arm’s length, the cost price', 'cost price'],
  'external-expenditure': ['external from a third party, the employer’s expenditure', 'employer’s expenditure'],
  'external-notional-value': ['external other, the notional value', null],
  'in-house-residual-salary-packaging': ['in-house residual under salary packaging, the notional value', null],
  'in-house-residual-public-price': ['in-house residual provided to the public, 75% of the lowest public price', 'lowest public price'],
  'in-house-residual-other': ['in-house residual other, 75% of the notional value', null],
};

/** The valuation rule's part of a result's inputs line: its name and the figures it reads.
 * @param {string} method @param {Function} money */
function ruleSummary(method, money) {
  const [name, price] = RULES[method] ?? ['', null];
  const notional = price === null || method === 'in-house-acquired' ? `, notional value ${money('notional')}` : '';
  return `${name}${price ? `, ${price} ${money('price')}` : ''}${notional}`;
}

/** The s 62 reduction left, where the rule takes one, to end a result's inputs line.
 * @param {string} method @param {Function} money */
const reductionLeft = (method, money) => (method.startsWith('in-house-') && !method.endsWith('-salary-packaging')
  ? `, in-house reduction left ${money('available')}` : '');

/** The rows of the BenefitValue `r` that `labels` names and `r` has, in that order.
 * @param {Record<string, number | undefined>} r @param {[string, string][]} labels @param {Function} aud */
const valueRows = (r, labels, aud) => labels.filter(([key]) => r[key] !== undefined).map(([key, label]) => [label, aud(r[key])]);

/** The otherwise deductible rule's rows, RD named `rd`. @param {string} rd @returns {[string, string][]} */
const deductibleRows = (rd) => [['grossDeduction', 'Gross deduction'], ['deductionApplied', rd],
  ['notionalDeduction', 'Notional deduction'], ['reduction', 'Otherwise deductible reduction']];
/** @type {[string, string][]} */
const IN_HOUSE_ROWS = [['inHouseReduction', 'In-house reduction, section 62'], ['taxableValue', 'Taxable value']];
const IN_HOUSE_NOTE = 'The $1,000 in-house reduction in section 62 is for all of the employee’s in-house fringe benefits '
  + 'in the year together';

/** The notes a result rests on: the declaration or evidence a reduction needs, and s 62's annual total.
 * @param {Record<string, number | undefined>} r @param {string} declaration */
function benefitNote(r, declaration) {
  const notes = [(r.reduction ?? 0) > 0 && declaration, r.inHouseReduction !== undefined && IN_HOUSE_NOTE].filter(Boolean);
  return notes.length ? notes.join('. ') : undefined;
}

function property(_form, calculate, { aud, value, money }) {
  const method = value('method');
  const r = calculate.fbtProperty({ method, price: value('price'), notional: value('notional'), contribution: value('contribution'),
    incomeUse: value('income-use'), contributionDeduction: value('contribution-deduction'), available: value('available') });
  const rows = valueRows(r, [['gross', 'Value before the contribution'], ['contributionApplied', 'Employee contribution applied'],
    ['excess', 'Excess contribution'], ['valueAfterContribution', 'Value after the contribution'],
    ...deductibleRows('Deduction for the contribution applied'), ...IN_HOUSE_ROWS], aud);
  return { inputs: `${ruleSummary(method, money)}, employee contribution ${money('contribution')}, ${value('income-use')}% `
    + `income use, deduction for the contribution ${money('contribution-deduction')}${reductionLeft(method, money)}`,
  rows, principal: rows.length - 1,
  note: benefitNote(r, 'The otherwise deductible reduction needs the employee’s declaration before the declaration date '
    + '(paragraph 44(1)(c)), unless the benefit is an exclusive employee benefit or under a recurring fringe benefit declaration') };
}

function expensePayment(_form, calculate, { aud, value, money }) {
  const method = value('method');
  const r = calculate.fbtExpensePayment({ method, expenditure: value('expenditure'), paid: value('paid'),
    contribution: value('contribution'), incomeUse: value('income-use'), portionDeduction: value('portion-deduction'),
    price: value('price'), notional: value('notional'), available: value('available') });
  const external = method === 'external';
  const paid = `expenditure ${money('expenditure')}, paid or reimbursed ${money('paid')}, employee contribution ${money('contribution')}`;
  const rows = external
    ? valueRows(r, [['gross', 'Payment or reimbursement'], ['contributionApplied', 'Employee contribution applied'],
      ['excess', 'Excess contribution'], ['valueAfterContribution', 'Value after the contribution'],
      ...deductibleRows('Deduction for the recipient’s portion applied'), ['taxableValue', 'Taxable value']], aud)
    : valueRows(r, [['gross', 'In-house value'], ['recipientsPortion', 'Recipient’s portion'],
      ['contributionApplied', 'Recipient’s portion applied'], ['excess', 'Excess portion'],
      ['valueAfterContribution', 'Value after the portion'], ...IN_HOUSE_ROWS], aud);
  return { inputs: external ? `external, ${paid}, ${value('income-use')}% income use, deduction for the recipient’s portion `
    + `${money('portion-deduction')}` : `${ruleSummary(method, money)}, ${paid}${reductionLeft(method, money)}`,
  rows, principal: rows.length - 1,
  note: benefitNote(r, 'The otherwise deductible reduction needs the evidence paragraph 24(1)(c) asks for, usually '
    + 'documentary evidence of the expenditure, and for most payments the employee’s declaration before the declaration date '
    + '(paragraph 24(1)(e))') };
}

/** The result of the FBT benefit form `form`, for renderResult in accounting-pages.mjs.
 * @param {HTMLFormElement} form @param {Record<string, Function>} calculate the engines
 * @param {{aud: Function, value: Function, money: Function}} format the page's helpers */
export function fbtBenefitResult(form, calculate, format) {
  const result = new Map([['fbt-car-parking', parking], ['fbt-loan', loan], ['fbt-meal-entertainment', meal],
    ['fbt-property', property], ['fbt-expense-payment', expensePayment]])
    .get(form.dataset.calculator);
  if (!result) throw new Error('Unknown calculator.');
  return result(form, calculate, format);
}
