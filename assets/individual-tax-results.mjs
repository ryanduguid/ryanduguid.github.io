// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// The result rows of the individual tax calculators, from a form's fields. assets/accounting-pages.mjs
// renders them as it does the business calculators' results.
import { STUDY_LOAN_YEARS, studyLoanRepayment } from './study-loan.mjs';
import { SUPER_GUARANTEE, takeHomePay } from './take-home-pay.mjs';
import { INCOME_TAX_YEARS } from './income-tax.mjs';
import { taxEstimate } from './tax-estimate.mjs';
import { PACKAGING_YEARS, salaryPackaging } from './salary-packaging.mjs';
import { NOVATED_YEARS, novatedLease } from './novated-lease.mjs';
import { BONUS_YEAR, bonusWithholding } from './bonus-withholding.mjs';
import { PAYS } from './payg-withholding.mjs';
import { DIVISION_293_YEARS, division293Tax } from './division-293.mjs';
import { lumpSumArrears } from './lump-sum-arrears.mjs';
import { SOLE_TRADER_YEARS, soleTraderSetAside } from './sole-trader.mjs';
import { incomeTests } from './income-tests.mjs';
import { CAP, concessionalCatchUp } from './concessional-catch-up.mjs';
import { superProjection } from './super-projection.mjs';

/** @typedef {{inputs: string, rows: string[][], principal: number, note?: string}} Result */

const RESIDENCY = /** @type {Record<string, string>} */ ({ resident: 'Australian resident', foreign: 'foreign resident',
  'working-holiday': 'working holiday maker' });
const NOT_RESIDENT = /** @type {Record<string, string>} */ ({
  foreign: 'A foreign resident gets no low income tax offset and pays no Medicare levy or surcharge',
  'working-holiday': 'Working holiday maker rates apply to all of this taxable income, taken as a foreign resident’s: '
    + 'no low income tax offset and no Medicare levy or surcharge',
});
const PERIOD = /** @type {Record<string, string>} */ ({ year: 'a year', month: 'a month', fortnight: 'a fortnight', week: 'a week' });
const whole = (/** @type {number} */ value) => `$${value.toLocaleString('en-AU')}`;
const cents = (/** @type {number} */ value) => Math.round(value * 100);
const count = (/** @type {number} */ n, /** @type {string} */ noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;
/** A refund or an amount owing, by its sign. @param {number} value @param {(amount: number) => string} aud */
const settle = (value, aud) => [value < 0 ? 'Amount owing estimate' : 'Refund estimate', aud(Math.abs(value))];

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function incomeTaxResult(value, aud) {
  const spouse = value('spouse') === 'yes';
  const loan = value('study-loan') === 'yes';
  const resident = value('residency') === 'resident';
  const r = taxEstimate({ year: value('year'), residency: value('residency'), taxable: value('income'),
    fringe: value('fringe'), super: value('super'), losses: value('losses'), foreign: value('foreign'), studyLoan: loan,
    uncoveredDays: value('uncovered'), spouse: spouse ? value('spouse-income') : null, children: value('children'),
    withheld: value('withheld') });
  const children = Number(value('children'));
  const rows = [['Tax on taxable income', aud(r.tax)], ['Low income tax offset', aud(r.offset)]];
  if (['2020-21', '2021-22'].includes(value('year'))) rows.push(['Low and middle income tax offset', aud(r.lmito)]);
  rows.push(['Medicare levy', aud(r.medicare)], ['Medicare levy surcharge', aud(r.surcharge)]);
  if (loan) rows.push(['Study and training loan repayment', aud(r.studyLoan)]);
  rows.push(['Total tax, levies and repayment', aud(r.assessed)], ['Tax withheld', aud(r.withheld)], settle(r.refund, aud));
  const surcharge = resident ? `Income for surcharge purposes ${whole(r.surchargeIncome)}${spouse ? ' and the spouse’s' : ''} `
    + `against a ${spouse || children ? 'family' : 'singles'} threshold of ${whole(r.surchargeThreshold)}: `
    + (r.surchargeRate ? `${r.surchargeRate}% for the days without cover` : 'no surcharge') : NOT_RESIDENT[value('residency')];
  return {
    inputs: `${value('year')}, ${RESIDENCY[value('residency')]}, taxable income ${aud(Number(value('income')))}, `
      + `reportable fringe benefits ${aud(Number(value('fringe')))}, reportable super contributions ${aud(Number(value('super')))}, `
      + `total net investment loss ${aud(Number(value('losses')))}, `
      + `${loan ? `a study or training loan with exempt foreign employment income ${aud(Number(value('foreign')))}` : 'no study or training loan'}, `
      + `${count(Number(value('uncovered')), 'day')} without private hospital cover, `
      + `${spouse ? `a spouse with income for surcharge purposes of ${aud(Number(value('spouse-income')))}` : 'no spouse'} and `
      + `${children === 1 ? '1 dependent child' : `${children || 'no'} dependent children`}, tax withheld ${aud(Number(value('withheld')))}`,
    principal: rows.length - 1, rows, note: surcharge };
}

/** @param {string} text */
function datedPayments(text) {
  if (!text.trim()) return undefined;
  return text.trim().split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    const [payday, grossSalary, superEarnings, extra] = line.trim().split(/\s+/);
    if (!superEarnings || extra) throw new Error('Enter one payday, gross salary and earnings for super per line.');
    return { payday, grossSalary, superEarnings };
  });
}

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function takeHomeResult(value, aud) {
  const included = value('super') === 'included';
  const loan = value('study-loan') === 'yes';
  const covered = value('cover') === 'yes';
  const period = value('period');
  const year = value('year');
  const datedPay = datedPayments(value('dated-pay'));
  const r = takeHomePay({ year, residency: value('residency'), salary: value('salary'), period,
    includesSuper: included, sacrifice: value('sacrifice'), studyLoan: loan, hospitalCover: covered, datedPay });
  const superLabel = datedPay ? 'Employer super guarantee from dated earnings' : 'Estimated employer super guarantee';
  const rows = [['Salary for the year', aud(r.salary)], ['Salary sacrificed to super', aud(r.sacrifice)],
    [superLabel, aud(r.superGuarantee)], ['Standard deduction for work-related expenses', aud(r.deduction)],
    ['Income tax less offsets', aud((cents(r.tax) - cents(r.offset) - cents(r.lmito)) / 100)], ['Medicare levy', aud(r.medicare)],
    ['Medicare levy surcharge', aud(r.surcharge)], ['Study and training loan repayment', aud(r.studyLoan)],
    ['Take-home pay for the year', aud(r.net)], ['Each month, a twelfth', aud(r.monthly)],
    ['Each fortnight, a 26th', aud(r.fortnightly)], ['Each week, a 52nd', aud(r.weekly)]];
  const notes = [];
  if (datedPay) {
    notes.push(`Super uses the supplied earnings ${year < '2026-27' ? 'by quarter' : 'by payday'}; tax and PAYG estimates use the salary and sacrifice inputs`);
  }
  if (r.withheld) {
    rows.push([`PAYG withheld each ${period}${loan ? ', with the study loan component' : ''}`, aud(r.withheld.total)],
      [`Pay after withholding each ${period}`, aud(r.withheld.afterWithholding)],
      ['PAYG withheld over the year', aud(r.withheld.year)], settle(r.withheld.refund, aud));
    notes.push(`The take-home rows spread the year’s tax evenly; PAYG withheld is what the ${year} Schedule 1`
      + `${loan ? ' and Schedule 8' : ''} take from each pay, and the refund or amount owing is the difference over the year`);
    if (loan && year === '2025-26') {
      notes.push(`Pays before 24 September 2025 had ${aud(r.withheld.earlierStudyLoan)} withheld for the study loan each `
        + `${period} under the earlier Schedule 8, not ${aud(r.withheld.studyLoan)}; the year’s figures use the later one for `
        + 'every pay');
    }
  } else {
    notes.push('The year’s tax on this salary spread evenly, not the amounts an employer withholds each pay');
  }
  if (r.overCap) {
    notes.push(`Concessional contributions of ${aud(r.concessional)} exceed the year’s cap by ${aud(r.overCap)}: the figures `
      + 'assume unused cap amounts carried forward cover it; if not, Division 291 adds the excess to assessable income, '
      + 'which is not worked here');
  }
  if (r.division293) {
    notes.push(`Division 293 tax applies to ${aud(r.division293)} of taxable contributions (section 293-20), not worked here`);
  }
  return { inputs: `${value('year')}, ${RESIDENCY[value('residency')]}, salary ${aud(Number(value('salary')))} ${PERIOD[period]} `
    + `${included ? 'including' : 'plus'} super, ${aud(Number(value('sacrifice')))} ${PERIOD[period]} sacrificed to super, `
    + `${loan ? 'with a' : 'no'} study or training loan, ${covered ? 'with' : 'no'} private hospital cover`, principal: 8,
  rows, note: notes.join('. ') };
}

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function studyLoanResult(value, aud) {
  const year = value('year');
  const parts = { taxable: value('taxable'), fringe: value('fringe'), losses: value('losses'), super: value('super'),
    foreign: value('foreign') };
  const r = studyLoanRepayment(parts, year);
  const { minimum, top } = STUDY_LOAN_YEARS[year];
  const note = {
    nil: `Repayment income does not exceed the minimum repayment income of ${whole(minimum)}`,
    marginal: `15% of repayment income over ${whole(minimum)} up to ${whole(top ?? 0)}, and 17% of any part above it`,
    'ten-percent': `10% of all repayment income, which is less than 15% and 17% of the parts over ${whole(minimum)}`,
    'percent-of-income': `The ${year} rate for this repayment income, applied to all of it`,
  }[r.method];
  return { inputs: `${year}, taxable income ${aud(Number(parts.taxable))}, reportable fringe benefits ${aud(Number(parts.fringe))}, `
    + `total net investment loss ${aud(Number(parts.losses))}, reportable super contributions ${aud(Number(parts.super))}, `
    + `exempt foreign employment income ${aud(Number(parts.foreign))}`, principal: 1,
  rows: [['Repayment income', aud(r.repaymentIncome)], ['Compulsory repayment', aud(r.repayment)]], note };
}

const EMPLOYER = /** @type {Record<string, string>} */ ({ charity: 'a public benevolent institution or health promotion charity',
  hospital: 'a public or not-for-profit hospital or public ambulance service' });

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function salaryPackagingResult(value, aud) {
  const flag = (/** @type {string} */ name) => value(name) === 'yes';
  const r = salaryPackaging({ year: value('year'), residency: value('residency'), employer: value('employer'),
    salary: value('salary'), typeTwo: value('type-two'), typeOne: value('type-one'), meals: value('meals'),
    mealsTypeOne: flag('meals-type-one'), studyLoan: flag('study-loan'), hospitalCover: flag('cover') });
  const rows = [['Benefits packaged, at their taxable value', aud(r.packaged)]];
  if (r.grossedTypeOne) rows.push(['Type 1 benefits grossed up at 2.0802, to the dollar', aud(r.grossedTypeOne)]);
  rows.push(['Type 2 benefits grossed up at 1.8868, to the dollar', aud(r.grossedTypeTwo)],
    [`Cap for ${value('employer') === 'charity' ? 'a charity' : 'a hospital or ambulance service'}`, aud(r.cap)]);
  if (r.grossedMeals) rows.push(['Meal entertainment allowed above the cap, up to $5,000', aud(r.mealAllowance)]);
  rows.push(['Grossed-up amount liable to FBT', aud(r.excess)], ['FBT on it at 47%', aud(r.fbt)],
    ['Reportable fringe benefits amount', aud(r.reportable)],
    ['Tax, levies and study loan without packaging', aud(r.owedBefore)],
    ['Tax, levies and study loan with packaging', aud(r.owedAfter)], ['Tax saved', aud(r.saved)],
    ['Gain after the FBT, if your employer passes it on', aud(r.gain)]);
  const principal = rows.length - 1;
  if (r.room) rows.push(['Room left under the cap, as Type 2 benefits', aud(r.roomTypeTwo)]);
  const notes = [];
  if (r.reportable) {
    notes.push(`Your income statement shows ${aud(r.reportable)} of reportable fringe benefits: it is not taxed, but it counts `
      + 'for the Medicare levy surcharge, study loan repayments and other income tests');
  }
  if (!r.reportable && r.packaged) notes.push('Benefits of $2,000 or less are not reportable');
  const flagText = (/** @type {string} */ name, /** @type {string} */ yes, /** @type {string} */ no) => (flag(name) ? yes : no);
  return { inputs: `${r.year}, ${value('residency') === 'resident' ? 'Australian resident' : 'foreign resident'} employed by `
    + `${EMPLOYER[value('employer')]}, salary ${aud(Number(value('salary')))}, Type 2 benefits ${aud(Number(value('type-two')))}, `
    + `Type 1 benefits ${aud(Number(value('type-one')))}, salary packaged meal entertainment ${aud(Number(value('meals')))} `
    + `(${flagText('meals-type-one', 'Type 1', 'Type 2')}), ${flagText('study-loan', 'with', 'no')} study loan, `
    + `${flagText('cover', 'with', 'without')} private hospital cover`, rows, principal,
  note: notes.length ? notes.join('. ') : undefined };
}

const CAR = /** @type {Record<string, string>} */ ({ bev: 'battery electric car', fcev: 'hydrogen fuel cell car',
  phev: 'plug-in hybrid', other: 'petrol, diesel or hybrid car' });

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function novatedLeaseResult(value, aud) {
  const flag = (/** @type {string} */ name) => value(name) === 'yes';
  const r = novatedLease({ year: value('year'), residency: value('residency'), salary: value('salary'), studyLoan: flag('study-loan'),
    hospitalCover: flag('cover'), kind: value('kind'), firstUsed: value('first-used'), commitment: flag('commitment'),
    saleYear: value('sale-year'), price: value('price'), otherSupply: flag('other-supply'), lctTiming: value('lct-timing'),
    reduced: flag('reduced'),
    days: value('days'), gstCosts: value('gst-costs'), otherCosts: value('other-costs') });
  const rows = [[`Statutory formula value for ${value('days')} days`, aud(r.taxableValue)],
    [`Luxury car tax threshold for fuel-efficient cars, ${value('sale-year')}`, aud(r.threshold)],
    ['Electric car exemption', r.exempt ? 'applies' : `does not apply: ${r.reason}`],
    ['Yearly car costs', aud(r.costs)], ['The same less the GST credits your employer claims', aud(r.netCosts)],
    ['Tax, levies and study loan paying the costs from after-tax pay', aud(r.owedWithout)]];
  let principal = 0;
  if (r.exemptCase) {
    rows.push(['Exempt: all from pre-tax salary', aud(r.exemptCase.preTax)],
      ['Exempt: reportable fringe benefits amount', aud(r.exemptCase.reportable)],
      ['Exempt: tax, levies and study loan', aud(r.exemptCase.owed)], ['Exempt: saving', aud(r.exemptCase.saving)]);
    principal = rows.length - 1;
  }
  if (r.contribution) {
    rows.push([`${r.exempt ? 'Were it not exempt' : 'Employee contribution method'}: after-tax contribution`, aud(r.contribution.postTax)],
      [`${r.exempt ? 'Were it not exempt' : 'Employee contribution method'}: from pre-tax salary`, aud(r.contribution.preTax)],
      [`${r.exempt ? 'Were it not exempt' : 'Employee contribution method'}: tax, levies and study loan`, aud(r.contribution.owed)],
      [`${r.exempt ? 'Were it not exempt' : 'Employee contribution method'}: saving`, aud(r.contribution.saving)]);
    if (!r.exempt) principal = rows.length - 1;
  }
  const note = r.exemptCase?.reportable
    ? `The exempt car’s ${aud(r.exemptCase.reportable)} reportable amount is not taxed, but it counts for the Medicare levy `
      + 'surcharge, study loan repayments and other income tests'
    : undefined;
  const firstUsed = new Date(value('first-used')).toLocaleDateString('en-AU', { dateStyle: 'long', timeZone: 'UTC' });
  return { inputs: `${r.year}, ${value('residency') === 'resident' ? 'Australian resident' : 'foreign resident'}, salary `
    + `${aud(Number(value('salary')))}, ${CAR[value('kind')]} first held and used on ${firstUsed}`
    + `${value('kind') === 'phev' ? `, ${flag('commitment') ? 'with' : 'without'} a commitment from before 1 April 2025` : ''}, `
    + `first sold in ${value('sale-year')} for ${aud(Number(value('price')))}, `
    + `${flag('other-supply') ? 'luxury car tax payable at another supply or importation, ' : ''}${flag('reduced') ? 'held over 4 years, ' : ''}`
    + `available ${value('days')} days, costs with GST ${aud(Number(value('gst-costs')))} and without ${aud(Number(value('other-costs')))}, `
    + `${flag('study-loan') ? 'with' : 'no'} study loan, ${flag('cover') ? 'with' : 'without'} private hospital cover`, rows, principal, note };
}

const PAY_NAME = /** @type {Record<string, string>} */ ({ week: 'weekly', fortnight: 'fortnightly', month: 'monthly' });
const PAYEE = /** @type {Record<string, string>} */ ({ resident: 'Australian resident claiming the tax-free threshold (scale 2)',
  foreign: 'foreign resident (scale 3)' });

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function bonusResult(value, aud) {
  const period = value('period');
  const loan = value('study-loan') === 'yes';
  const r = bonusWithholding({ period, residency: value('residency'), studyLoan: loan, method: value('method'),
    earnings: value('earnings'), additional: value('additional'), spread: value('spread'), backPays: value('back-pays'),
    backEarnings: value('back-earnings'), backEach: value('back-each'), backWithheld: value('back-withheld'),
    yearToDate: value('year-to-date'), paysToDate: value('pays-to-date'), earlierAdditional: value('earlier-additional'),
    earlierWithheld: value('earlier-withheld') });
  const money = (/** @type {string} */ name) => aud(Number(value(name)));
  const head = `${BONUS_YEAR}, ${PAY_NAME[period]} pay, ${PAYEE[value('residency')]}, ${loan ? 'with a' : 'no'} study or training loan, `
    + `earnings ${money('earnings')} this pay`;
  /** The study loan component of each amount withheld, with a loan.
   * @param {[{studyLoan: number, total: number}, string][]} parts */
  const loanNote = (parts) => {
    const each = parts.map(([t, label]) => `${aud(t.studyLoan)} of the ${aud(t.total)}`.replaceAll('.00', '') + ` ${label}`);
    return loan ? `Each amount withheld includes the Schedule 8 study loan component: ${each.slice(0, -1).join(', ')}`
      + `${each.length > 1 ? ' and ' : ''}${each.at(-1)}` : '';
  };
  if (r.method === 'A') return methodAResult(r, { aud, loan, head, money, loanNote });
  const rows = [['Withheld from this pay’s earnings', aud(r.base.total)]];
  const parts = /** @type {[{studyLoan: number, total: number}, string][]} */ ([[r.base, 'on this pay’s earnings']]);
  const described = [];
  if (r.methodBi) {
    const bi = r.methodBi;
    rows.push([`Each earlier pay worked again on ${aud(bi.earnings).replace('.00', '')} (B(i) steps 2 and 3)`, aud(bi.recalculated.total)],
      [`Less what was withheld, times ${bi.pays} pays (B(i) steps 4 and 5)`, aud(bi.onBackPayment)]);
    described.push(`B(i): back payment ${money('back-each')} for each of ${bi.pays} earlier pays this year that paid `
      + `${money('back-earnings')} and had ${money('back-withheld')} withheld`);
  }
  if (r.methodBii) {
    const bii = r.methodBii;
    rows.push(['Average total earnings to date, cents ignored (B(ii) step 1)', aud(bii.step1)],
      ['Withheld from that average (B(ii) step 2)', aud(bii.step2.total)],
      [`This year’s B(ii) payments divided by ${PAYS[period]}, cents ignored (B(ii) step 3)`, aud(bii.step3)],
      [`Withheld from earnings of ${aud(bii.step4).replace('.00', '')} (B(ii) steps 4 and 5)`, aud(bii.step5.total)],
      [`The difference times ${PAYS[period]}, less earlier B(ii) withholding (B(ii) steps 6 to 8)`, aud(bii.step8)],
      ['47% of the payment, the limit (B(ii) step 9)', aud(bii.limit)],
      ['Withheld from the payment, the lesser (B(ii) step 10)', aud(bii.onAdditional)]);
    described.push(`B(ii): additional payment ${money('additional')}, normal earnings to date ${money('year-to-date')} over `
      + `${value('pays-to-date')} pays, earlier B(ii) payments ${money('earlier-additional')} with ${money('earlier-withheld')} withheld`);
  }
  if (r.methodBi) parts.push([r.methodBi.recalculated, 'for each earlier pay']);
  if (r.methodBii) parts.push([r.methodBii.step7, 'by B(ii)']);
  rows.push(['Total withheld this pay', aud(r.total)]);
  return { inputs: `${head}, Method B, ${described.join('; ')}`, rows, principal: rows.length - 1, note: loanNote(parts) || undefined };
}


/** The Method A rows. @param {Extract<ReturnType<typeof bonusWithholding>, {method: 'A'}>} r
 * @param {{aud: (amount: number) => string, loan: boolean, head: string, money: (name: string) => string,
 *   loanNote: (parts: [{studyLoan: number, total: number}, string][]) => string}} f @returns {Result} */
function methodAResult(r, { aud, loan, head, money, loanNote }) {
  const rows = [['Earnings this pay, cents ignored (step 1)', aud(r.step1)], ['Withheld from those earnings (step 2)', aud(r.step2.total)],
    [`The payment divided by ${r.spread}, cents ignored (step 3)`, aud(r.step3)],
    [`Withheld from earnings of ${aud(r.step4).replace('.00', '')} (steps 4 and 5)`, aud(r.step5.total)],
    [`The difference, times ${r.spread} (steps 6 and 7)`, aud(r.step7.total)], ['47% of the payment, the limit (step 8)', aud(r.limit)],
    ['Withheld from the payment, the lesser (step 9)', aud(r.onAdditional)], ['Total withheld this pay (step 10)', aud(r.total)],
    [`Tax${loan ? ' and study loan repayment' : ''} the payment adds to a year of this pay`, aud(r.yearTax)]];
  const notes = [loanNote([[r.step2, 'on this pay’s earnings'], [r.step7, 'on the payment']]),
    'The last row is the payment’s effect on the year’s assessment, were every pay this pay; the withholding schedules do not aim to match it']
    .filter(Boolean);
  return { inputs: `${head}, Method A: additional payment ${money('additional')} spread over ${r.spread} pays`, rows, principal: 7,
    note: notes.join('. ') };
}

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function division293Result(value, aud) {
  const balanceUnder = value('balance-under') === 'yes';
  const r = division293Tax({ year: value('year'), interests: value('interests'), taxable: value('taxable'),
    fringe: value('fringe'), losses: value('losses'), trust: value('trust'), fhss: value('fhss'), lumpSum: value('lump-sum'),
    concessional: value('concessional'), unused: value('unused'), balanceUnder });
  const rows = [['Division 293 income: income for surcharge purposes less reportable super contributions', aud(r.income)],
    ['Concessional contributions', aud(r.concessional)], [`Concessional contributions cap for ${r.year}`, aud(r.cap)]];
  if (r.carried) rows.push(['Unused cap carried forward that raises it', aud(r.carried)]);
  rows.push(['Excess concessional contributions', aud(r.excess)], ['Low tax contributions: the contributions less the excess', aud(r.low)],
    ['Division 293 income plus low tax contributions', aud(r.combined)], ['Amount over the $250,000 threshold', aud(r.over)],
    ['Taxable contributions: the lesser of the low tax contributions and that amount', aud(r.taxable)],
    ['Division 293 tax at 15%', aud(r.tax)]);
  const principal = rows.length - 1;
  if (r.room) rows.push(['Room left under the $250,000 threshold', aud(r.room)]);
  const notes = [];
  if (r.excess) {
    notes.push(`The ${aud(r.excess)} excess is not taxed here: it is in your assessable income instead (section 291-15), `
      + 'so the taxable income entered should include it');
  }
  if (!balanceUnder && Number(value('unused')) > 0 && r.concessional > r.cap) {
    notes.push('Unused cap does not carry forward with a total super balance of $500,000 or more just before the year');
  }
  if (r.tax) notes.push('The ATO assesses it on a separate notice, payable 21 days after it is given (section 293-65)');
  const amount = (/** @type {string} */ name) => aud(Number(value(name)));
  return { inputs: `${r.year}, accumulation interests only, taxable income ${amount('taxable')}, reportable fringe benefits `
    + `${amount('fringe')}, total net investment loss ${amount('losses')}, family trust distribution tax income ${amount('trust')}, `
    + `assessable FHSS released amount ${amount('fhss')}, zero-rate super lump sum ${amount('lump-sum')}, concessional `
    + `contributions ${amount('concessional')}, unused cap carried forward ${amount('unused')}`
    + `${Number(value('unused')) > 0 ? `, total super balance ${balanceUnder ? 'under $500,000' : '$500,000 or more'}` : ''}`,
  rows, principal, note: notes.length ? notes.join('. ') : undefined };
}

/** The form's accrual year slots: the 2 that take each recent year's taxable income and adjustments, then the rest. */
const ARREARS_SLOTS = ['latest', 'before', 'earlier-1', 'earlier-2', 'earlier-3', 'earlier-4'];
const ARREARS_FACTS = /** @type {const} */ ([['taxable', 'taxable'], ['gain', 'gain'], ['rebateYearArrears', 'rebate-year'],
  ['earlierRebateArrears', 'earlier-rebate']]);
const percent = (/** @type {number} */ rate) => `${Number((rate * 100).toFixed(2))}%`;

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function lumpSumArrearsResult(value, aud) {
  const accrual = [];
  for (const slot of ARREARS_SLOTS) {
    const field = (/** @type {string} */ name) => (value(`${slot}-${name}`) ?? '').trim();
    // Only the 2 latest accrual years take their own taxable income and rebate facts.
    const facts = slot.startsWith('earlier') ? []
      : ARREARS_FACTS.map(([key, name]) => [key, field(name)]).filter(([, text]) => text !== '');
    if (field('year') === '' && field('arrears') === '' && facts.length === 0) continue;
    if (field('year') === '') throw new Error('Enter the income year of each accrual year you fill in, such as 2023-24.');
    accrual.push({ year: field('year'), arrears: field('arrears'), ...Object.fromEntries(facts) });
  }
  const year = value('year');
  const r = lumpSumArrears({ year, resident: value('resident') === 'yes',
    otherAmounts: value('other') !== 'no', taxable: value('taxable'), gain: value('gain'),
    accrual });
  const rows = [['Total arrears amount', aud(r.total)], ['Normal taxable income', aud(r.normal)],
    ['10% of normal taxable income less the arrears', aud(r.tenPercent)]];
  let note = 'No offset: the total arrears amount is less than 10% of normal taxable income less it';
  if (r.met) {
    rows.push([`Tax on arrears in ${year}`, aud(/** @type {number} */ (r.taxOnArrears))],
      ...(r.notional ?? []).map(({ year: accrued, amount }) => [`Notional tax for ${accrued}`, aud(amount)]));
    if (r.distant) rows.push(['Notional tax for the distant years', aud(r.distant.amount)]);
    rows.push(['Notional tax on arrears', aud(/** @type {number} */ (r.notionalTotal))]);
    const [latest, before] = r.notional ?? [];
    const distant = r.distant?.years ?? [];
    const listed = distant.length > 1 ? `${distant.slice(0, -1).join(', ')} and ${distant.at(-1)}` : distant[0];
    note = r.distant && r.rates ? `${distant.length > 1 ? 'The distant years' : 'The distant year'} ${listed} `
      + `${distant.length > 1 ? 'take' : 'takes'} the average rate on recent arrears, `
      + `${percent(r.rates.average)}: ${percent(r.rates.mostRecent)} for ${latest.year} and ${percent(r.rates.secondMostRecent)} `
      + `for ${before.year}` : 'The notional tax is what the arrears would have added to the tax of the years they accrued in';
    if (r.offset === 0) note += '. Nil: the notional tax is not less than the tax on arrears';
  }
  rows.push(['Lump sum payment in arrears tax offset', aud(r.offset)]);
  const accrued = accrual.map((a) => `${a.year} ${aud(Number(a.arrears))}`
    + `${a.taxable === undefined ? '' : ` on taxable income ${aud(Number(a.taxable))}`}`).join(', ');
  return { inputs: `${year}, taxable income ${aud(Number(value('taxable')))}, net capital gain ${aud(Number(value('gain')))}, `
    + `accrual years ${accrued}`, principal: rows.length - 1, rows, note };
}

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function superProjectionResult(value, aud) {
  const r = superProjection({ age: value('age'), retire: value('retire'), balance: value('balance'), salary: value('salary'),
    employer: value('employer'), sacrifice: value('sacrifice'), afterTax: value('after-tax'), returnRate: value('return'),
    percentFee: value('percent-fee'), adminFee: value('admin-fee'), insurance: value('insurance'), growth: value('growth'),
    discount: value('discount') });
  const rate = (/** @type {string} */ name) => `${Number(value(name))}%`;
  const rows = [[`Years projected, from age ${value('age')} to ${r.retire}`, String(r.years)],
    ['Employer contributions in 2026-27', aud(r.employer)],
    ['Concessional contributions in 2026-27, within the $32,500 cap', aud(r.concessional)],
    ['Contributions paid in, less the 15% contributions tax', aud(r.contributed)],
    ['Investment earnings, after investment fees and tax', aud(r.earnings)],
    ['Administration fees and insurance premiums, less the fund’s tax deduction', aud(r.fees)],
    [`Balance at ${r.retire} in future dollars`, aud(r.balance)],
    [`Balance at ${r.retire} at its present value, discounted at ${rate('discount')} a year to today’s dollars`, aud(r.present)]];
  return { inputs: `Age ${value('age')}, retiring at ${r.retire}, super balance ${aud(Number(value('balance')))}, salary `
    + `${aud(Number(value('salary')))}, employer contributions ${rate('employer')} of salary, salary sacrifice `
    + `${aud(Number(value('sacrifice')))} and after-tax contributions ${aud(Number(value('after-tax')))} a year, return `
    + `${rate('return')} after investment fees and tax, administration fees ${aud(Number(value('admin-fee')))} and `
    + `${rate('percent-fee')} of the balance, insurance premiums ${aud(Number(value('insurance')))} a year, wages growing `
    + `${rate('growth')} a year`, rows, principal: rows.length - 1,
  note: 'A model on the assumptions shown, not a prediction. It is not intended to be relied on for a decision about a '
    + 'financial product: consider getting advice from an Australian financial services licensee before making any '
    + 'financial decision' };
}

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function soleTraderResult(value, aud) {
  const yes = (/** @type {string} */ name) => value(name) === 'yes';
  const year = value('year');
  const r = soleTraderSetAside({ year, income: value('income'), expenses: value('expenses'), wages: value('wages'),
    deductions: value('deductions'), super: value('super'), offset: yes('offset'), studyLoan: yes('study-loan'),
    hospitalCover: yes('cover'), gst: yes('gst'), credits: value('credits'), invoice: value('invoice') });
  const wages = Number(value('wages')) > 0;
  const rows = [['Business profit', aud(r.profit)]];
  if (r.deduction) rows.push(['Standard deduction on the wages', aud(r.deduction)]);
  rows.push(['Taxable income', whole(r.taxable)], ['Tax on taxable income', aud(r.tax)], ['Low income tax offset', aud(r.offset)]);
  if (year === '2021-22') rows.push(['Low and middle income tax offset', aud(r.lmito)]);
  rows.push(['Small business income tax offset', aud(r.smallBusinessOffset)], ['Medicare levy', aud(r.medicare)]);
  if (!yes('cover')) rows.push(['Medicare levy surcharge', aud(r.surcharge)]);
  if (yes('study-loan')) rows.push(['Study and training loan repayment', aud(r.studyLoan)]);
  rows.push(['Total tax, levies and repayment', aud(r.total)]);
  if (wages) rows.push(['Less the same on the wages alone', aud(r.wagesTax)]);
  rows.push(['Tax to set aside for the business', aud(r.businessTax)]);
  if (yes('gst')) rows.push(['GST on the business income', aud(r.gstOnIncome)], ['Less GST credits', aud(r.credits)]);
  const principal = rows.length;
  rows.push(['Total to set aside for the year', aud(r.setAside)], ['Each quarter', aud(r.quarterly)],
    ['Each month', aud(r.monthly)], ['Each week', aud(r.weekly)],
    [`Share of each invoice${yes('gst') ? ', GST included,' : ''} to set aside`, `${r.invoiceShare.toFixed(2)}%`],
    [`From an invoice of ${aud(r.invoice.amount)}, set aside`, aud(r.invoice.setAside)]);
  const notes = [`As a PAYG instalment rate, ${r.taxShare.toFixed(2)}% of business income excluding GST covers this `
    + 'year’s tax on it'];
  if (r.instalments) {
    notes.push('A return like this meets 2 of the 3 PAYG instalment entry tests; the ATO works out the third, '
      + 'notional tax, and decides entry');
  }
  if (r.mustRegister) {
    notes.push('Business income of $75,000 or more a year means the business must register for GST, within 21 days of '
      + 'its turnover over 12 months reaching $75,000');
  }
  if (wages) {
    notes.push('This assumes the wages’ withholding covers the tax, levy and any study loan repayment on the wages '
      + 'alone');
  }
  return { inputs: `${year}, business income ${aud(Number(value('income')))} and expenses ${aud(Number(value('expenses')))} `
    + `excluding GST, wages ${aud(Number(value('wages')))}, other deductions ${aud(Number(value('deductions')))}, `
    + `${Number(value('super')) > 0 ? `personal super contributions ${aud(Number(value('super')))}, ` : ''}`
    + `${yes('offset') ? 'qualifies' : 'does not qualify'} for the small business income tax offset, `
    + `${yes('study-loan') ? 'with a' : 'no'} study or training loan, ${yes('cover') ? 'with' : 'no'} private hospital cover, `
    + `${yes('gst') ? `registered for GST with credits of ${aud(Number(value('credits')))}` : 'not registered for GST'}, `
    + `invoice ${aud(Number(value('invoice')))}`, principal, rows, note: notes.join('. ') };
}

/** The earlier years the catch-up form asks about, from 2018-19 to the year before the latest it works. */
const CATCH_UP_EARLIER = Object.keys(CAP).filter((year) => year < '2026-27').sort((a, b) => a.localeCompare(b));

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function catchUpResult(value, aud) {
  const earlier = [];
  for (const year of CATCH_UP_EARLIER) {
    const [contributions, balance] = [value(`contributions-${year}`).trim(), value(`balance-${year}`).trim()];
    if (contributions === '' && balance !== '') throw new Error(`Enter ${year}’s concessional contributions, or clear its balance.`);
    if (contributions !== '') earlier.push({ year, contributions, ...(balance === '' ? {} : { balance }) });
  }
  const proposed = value('proposed').trim();
  const year = value('year');
  const r = concessionalCatchUp({ year, balance: value('balance'), concessional: value('concessional'),
    ...(proposed === '' ? {} : { proposed }), definedBenefit: value('defined-benefit') === 'yes', earlier });
  const rows = [['General concessional cap', aud(r.cap)], ['Unused cap from the previous 5 years', aud(r.unusedCarried)],
    ['Concessional cap available', aud(r.available)], ['Carried-forward cap applied', aud(r.carryForwardApplied)],
    ['Cap left after this year’s contributions', aud(r.remaining)], ['Excess concessional contributions', aud(r.excess)]];
  if (r.withProposal !== null) {
    rows.push(['Contributions with the proposed one', aud(r.withProposal)],
      ['Excess with the proposed contribution', aud(/** @type {number} */ (r.excessWithProposal))]);
  }
  for (const row of r.years) rows.push([`${row.year} unused cap left, lapses after ${row.expiresAtEndOf}`, aud(row.remaining)]);
  const notes = Object.entries(r.earlierApplied).map(([to, from]) => `${to}’s excess used `
    + Object.entries(from).map(([source, amount]) => `${aud(amount)} of ${source}’s unused cap`).join(' and '));
  notes.push(r.carriesForward ? 'Unused cap applies earliest year first, and only to contributions above the general cap'
    : 'With a total super balance of $500,000 or more on 30 June before the year, no unused cap increases this year’s; '
      + 'the unused amounts still lapse after 5 years');
  return { inputs: `${year}, total super balance ${aud(Number(value('balance')))}, concessional contributions `
    + `${aud(Number(value('concessional')))}${proposed === '' ? '' : `, proposed ${aud(Number(proposed))}`}, earlier years `
    + earlier.map((e) => `${e.year} ${aud(Number(e.contributions))}`).join(', '), principal: 2, rows,
  note: notes.join('. ') };
}

/** Each income test part's form field and how the inputs sentence names it. */
const INCOME_TEST_FIELDS = /** @type {const} */ ([['taxable', 'taxable', 'taxable income'],
  ['fhss', 'fhss', 'assessable FHSS released amount'], ['familyTrust', 'family-trust', 'family trust distribution amounts'],
  ['fringe57a', 'fringe-57a', 'reportable fringe benefits from section 57A employers'],
  ['fringeOther', 'fringe-other', 'reportable fringe benefits from other employers'],
  ['employerSuper', 'employer-super', 'reportable employer super contributions'],
  ['personalSuper', 'personal-super', 'deductible personal super contributions'],
  ['excessConcessional', 'excess-concessional', 'excess concessional contributions'],
  ['financialLoss', 'financial-loss', 'net financial investment loss'], ['rentalLoss', 'rental-loss', 'net rental property loss'],
  ['pensions', 'pensions', 'tax-free government pensions'], ['targetForeign', 'target-foreign', 'target foreign income'],
  ['exemptForeign', 'exempt-foreign', 'exempt foreign employment income'], ['childSupport', 'child-support', 'child support paid'],
  ['assessable', 'assessable', 'assessable income'], ['businessDeductions', 'business-deductions', 'business deductions']]);

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function incomeTestsResult(value, aud) {
  const parts = /** @type {import('./income-tests.mjs').IncomeTestParts} */ (Object.fromEntries([
    ...INCOME_TEST_FIELDS.map(([key, field]) => [key, value(field)]), ['resident', value('resident') === 'yes']]));
  const r = incomeTests(parts);
  const given = INCOME_TEST_FIELDS.filter(([key]) => key === 'taxable' || Number(parts[key]) !== 0)
    .map(([key, , label]) => `${label} ${aud(Number(parts[key]))}`);
  return { inputs: `resident all year, ${given.join(', ')}`, principal: 8,
    rows: [['Taxable income without the FHSS amount', aud(r.taxableWithoutFhss)],
      ['Reportable fringe benefits total', aud(r.fringeTotal)], ['Adjusted fringe benefits total', aud(r.adjustedFringe)],
      ['Total net investment loss', aud(r.losses)], ['Reportable super contributions', aud(r.contributions)],
      ['Income for surcharge purposes', aud(r.surchargeIncome)], ['Division 293 income', aud(r.division293Income)],
      ['Rebate income', aud(r.rebateIncome)], ['Repayment income', aud(r.repaymentIncome)],
      ['Adjusted taxable income', aud(r.adjustedTaxableIncome)], ['Co-contribution total income', aud(r.coContributionIncome)]],
    note: r.exemptForeignDiffers ? 'Income for surcharge purposes leaves out exempt foreign employment income, as section 995-1 '
      + 'defines it; the ATO’s surcharge page adds it where taxable income is $1 or more' : undefined };
}

const RESULTS = new Map([['income-tax', incomeTaxResult], ['take-home-pay', takeHomeResult], ['study-loan', studyLoanResult],
  ['sole-trader', soleTraderResult], ['lump-sum-arrears', lumpSumArrearsResult], ['division-293', division293Result], ['income-tests', incomeTestsResult], ['concessional-catch-up', catchUpResult],
  ['bonus-withholding', bonusResult], ['salary-packaging', salaryPackagingResult], ['novated-lease', novatedLeaseResult],
  ['super-projection', superProjectionResult]]);

/** The result of the individual tax calculator `kind`, or undefined for any other form.
 * @param {string} kind the form's data-calculator @param {(name: string) => string} value a field's value
 * @param {(amount: number) => string} aud money as the page writes it */
export function individualResult(kind, value, aud) {
  return RESULTS.get(kind)?.(value, aud);
}

/** The engines and years assets/webmcp-tools.mjs offers as this page's WebMCP tools. */
export const engines = { taxEstimate, takeHomePay, soleTraderSetAside, division293Tax, incomeTests, incomeYears: INCOME_TAX_YEARS,
  payYears: Object.keys(SUPER_GUARANTEE), soleTraderYears: SOLE_TRADER_YEARS, division293Years: DIVISION_293_YEARS,
  bonusWithholding, salaryPackaging, novatedLease, packagingYears: PACKAGING_YEARS, novatedYears: NOVATED_YEARS,
  superProjection };
