// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Compile only. Runtime validation and rounding have separate Node tests.
import * as calculate from '../../assets/business-calculators.mjs';
import {
  calculatorTools, fhssTools, governmentSuperTools, individualTaxTools, pensionMinimumTools, residencyDaysTools, transferBalanceTools,
  workExpensesTools,
} from '../../assets/webmcp-tools.mjs';
import { MAX_PERIODS, RESIDENCY_YEARS, residencyDays } from '../../assets/residency-days.mjs';
import { PENSION_MINIMUM_YEARS, pensionMinimum } from '../../assets/pension-minimum.mjs';
import {
  ATO_TABLE_5, CHARGE_YEARS, RELEASE_YEARS, TBA_KINDS, TBA_YEARS, dayOf, excessContributions, label, transferBalance,
  yearOf,
} from '../../assets/transfer-balance-result.mjs';
import { fhss } from '../../assets/fhss.mjs';
import { WORK_EXPENSES_YEARS, workExpenses } from '../../assets/work-expenses.mjs';
import { GOVERNMENT_SUPER_YEARS, governmentSuperAmounts } from '../../assets/government-super.mjs';
import { engines as individualEngines } from '../../assets/individual-tax-results.mjs';

const result = calculate.gst('110.00', true);
const tax: number = result.gst;
// @ts-expect-error Money inputs are decimal strings, not numeric dollars or cents.
calculate.gst(110);
// @ts-expect-error GST inclusion is a boolean flag.
calculate.gst('110.00', 'inclusive');
// @ts-expect-error Variance needs the declared income or cost interpretation.
calculate.variance('100', '90', 'expense');
// @ts-expect-error A calculated amount is numeric, not formatted text.
const formatted: string = result.gst;
const weeks = [{ receipts: '100', payments: '20' }];
calculate.cashForecast('0', weeks, '50', { week: '1', amount: '10', delay: 2 });
// @ts-expect-error Each week needs both receipts and payments.
calculate.cashForecast('0', [{ receipts: '100' }], '50');
// @ts-expect-error A cash deferral amount uses the same decimal string contract.
calculate.cashForecast('0', weeks, '50', { week: 1, amount: 10, delay: 2 });

const tool = calculatorTools(calculate).gst;
void tool.execute({ amount: '110.00', inclusive: true });
// @ts-expect-error The WebMCP descriptor needs the calculator's numeric result contract.
calculatorTools({ gst: () => ({ net: '100', gst: '10', gross: '110' }) });
// @ts-expect-error A Division 7A benchmark rate is a decimal string, as the rate table writes it.
calculate.div7aMinimumRepayment('100000', 8.77, '5');
const div7aLoan = { made: '2022-10-01', amount: '100000', term: '7', assumedRate: '8.77', repayments: '', marginalRate: '',
  franking: 'unfranked', lodgment: false, refinanced: false, interposed: false };
const div7aYears: number = calculate.div7aSchedule(div7aLoan).years.length;
// @ts-expect-error Each question about the loan is a boolean answer, as the form passes it.
calculate.div7aSchedule({ ...div7aLoan, interposed: 'no' });
// @ts-expect-error A year's funding dividend is null when no marginal rate is given.
const funding: number = calculate.div7aSchedule(div7aLoan).years[0].funding;
void div7aYears;
void funding;
const duty: number = calculate.transferDuty('1350000', [['0', '', '0', '1', 'excess']]).duty;
// @ts-expect-error A dutiable value is a decimal string, as the form field gives it.
calculate.transferDuty(1350000, [['0', '', '0', '1', 'excess']]);
void duty;
const arrangement = { gateway1: true, gateway2: true, entitlement: '600000', returned: '330000', tax: '189367',
  factor3: false, remuneration: '0', benchmark: '0' };
const zone: string = calculate.pcgRisk(arrangement).zone;
// @ts-expect-error A gateway answer is a boolean, as the form passes it.
calculate.pcgRisk({ ...arrangement, gateway1: 'yes' });
// @ts-expect-error Factor 3's score is null when only factors 1 and 2 are used.
const factor3: number = calculate.pcgRisk(arrangement).factor3;
const plan = { debt: '1000', start: '2026-10-01', count: '3', frequency: 'monthly', assumedRate: '11.51' } as const;
const gic: number = calculate.gicPaymentPlan(plan).gic;
// @ts-expect-error A plan's frequency is weekly, fortnightly or monthly.
calculate.gicPaymentPlan({ ...plan, frequency: 'quarterly' });
// @ts-expect-error The last instalment date is an ISO date string.
const lastDay: Date = calculate.gicPaymentPlan(plan).lastDate;
void gic;
void lastDay;
void zone;
void factor3;
void tax;
void formatted;
const objection: string = calculate.objectionDeadline('assessment', '2', '2026-11-18', '2026-11-18').lastDay;
// @ts-expect-error A private ruling is not one of the decisions the checker covers.
calculate.objectionDeadline('ruling', '2', '2026-11-18', '2026-11-18');
// @ts-expect-error The 60 days after an amended notice are null for an unamended assessment.
const amendedEnds: string = calculate.objectionDeadline('assessment', '2', '2026-11-18', '2026-11-18').amendedEnds;
void objection;
void amendedEnds;
const psiPayer = { amount: '100000', associate: false, offer: true, result: false, tools: false, defects: false };
const psiAnswers = { earner: 'sole-trader' as const, mainly: true, determination: false, payers: [psiPayer], agent: false,
  commission: '0', principal: '0', others: '0', apprentice: false,
  premises: { times: false, mainly: false, exclusive: false, private: false, clients: false } };
const psiRule: string = calculate.psiDetermination(psiAnswers).rule;
// @ts-expect-error A trust receiving the income is the 'entity' earner, not its own kind.
calculate.psiDetermination({ ...psiAnswers, earner: 'trust' });
// @ts-expect-error Each tick is a boolean, as the form's checkbox passes it.
calculate.psiDetermination({ ...psiAnswers, payers: [{ ...psiPayer, offer: 'yes' }] });
// @ts-expect-error The results test share is null when the steps stop before it.
const psiResults: number = calculate.psiDetermination(psiAnswers).results;
const psiReligious: string = calculate.psiDetermination({ ...psiAnswers, earner: 'religious' as const,
  payers: [psiPayer, { ...psiPayer, same: 1 }] }).rule;
// @ts-expect-error A row names its payer's first row by number, as the form passes it.
calculate.psiDetermination({ ...psiAnswers, payers: [psiPayer, { ...psiPayer, same: '1' }] });
void psiReligious;
void psiRule;
void psiResults;
const payg = { method: 'rate', notified: '0', instalment: '1', estimatedTax: '0', earlier: '0', credits: '0', income: '20100',
  rate: '1.7', estimatedIncome: '0', earlierIncome: '0', previousRate: '0' } as const;
const instalment: number = calculate.paygInstalment(payg).instalment;
// @ts-expect-error Annual instalments are not one of the methods the calculator covers.
calculate.paygInstalment({ ...payg, method: 'annual' });
// @ts-expect-error The amount due by an instalment is null under the instalment rate method.
const due: number = calculate.paygInstalment(payg).due;
void instalment;
void due;
const etpYear = { yearEnd: '2027-06-30', etpCap: '270000', wholeOfIncomeCap: '180000', baseAmount: '13598',
  serviceAmount: '6801', rateUnder: '32', rateReached: '17', rateAbove: '47' };
const etpPayment = { redundancy: '48000', years: '5', excluded: '0', nonExcluded: '17678', other: '140000', born: '1996-08-01' };
const withheld: number = calculate.terminationPayment(etpPayment, etpYear).withholding;
// @ts-expect-error Years of service are a decimal string, as the form passes them.
calculate.terminationPayment({ ...etpPayment, years: 5 }, etpYear);
// @ts-expect-error Whether preservation age is reached is a boolean, not text.
const reachedText: string = calculate.terminationPayment(etpPayment, etpYear).reached;
void withheld;
void reachedText;
const car = { method: 'statutory', cost: '60000', accessories: '0', reduced: false, days: '182', costs: '0',
  businessUse: '0', contribution: '1000' } as const;
const fbtYear = { days: '365', grossUp: '2.0802', fbtRate: '47' };
const fbt: number = calculate.fbtCar(car, fbtYear).fbt;
// @ts-expect-error The 4-year answer is a boolean, as the form passes it.
calculate.fbtCar({ ...car, reduced: 'yes' }, fbtYear);
// @ts-expect-error The operating cost value is null under the statutory formula.
const operatingValue: number = calculate.fbtCar(car, fbtYear).operating;
void fbt;
void operatingValue;
const ev = { vehicle: 'battery', currentEmployee: true, firstUsed: '2026-04-01', firstSale: '2026-04-01', lctValue: '60000',
  otherSupply: false } as const;
const evExempt: boolean = calculate.fbtEvExemption(ev, { ended: '2027' }).exempt;
// @ts-expect-error A current employee is a boolean, as the form passes it.
calculate.fbtEvExemption({ ...ev, currentEmployee: 'yes' }, { ended: '2027' });
// @ts-expect-error The vehicle is one of the 3 kinds the exemption can reach.
calculate.fbtEvExemption({ ...ev, vehicle: 'diesel' }, { ended: '2027' });
// @ts-expect-error The threshold is whole dollars, a number, or null for a first retail sale after the FBT year.
const evThreshold: string = calculate.fbtEvExemption(ev, { ended: '2027' }).threshold;
void evExempt;
void evThreshold;
const terms = { solve: 'payment', amount: '60000', rate: '7.5', payments: '60', payment: '', balloon: '18000',
  balloonKind: 'amount', frequency: 'monthly', timing: 'advance', start: '2026-07-01' } as const;
const lastPayment: number = calculate.financeSchedule(terms).finalPayment;
const yearInterest: number | undefined = calculate.interestByIncomeYear(terms)['2026-27'];
// @ts-expect-error Payments fall in arrears or in advance, nothing else.
calculate.financeSchedule({ ...terms, timing: 'start' });
// @ts-expect-error Payments fall weekly, fortnightly, monthly, quarterly or yearly.
calculate.financeSchedule({ ...terms, frequency: 'daily' });
// @ts-expect-error The balloon row is null when there is no balloon.
const balloonInterest: number = calculate.financeSchedule(terms).balloonRow.interest;
void lastPayment;
void yearInterest;
void balloonInterest;
void tax;
void formatted;
const fee: number = calculate.fixedFee('18.5', '95', '40', '10', true, '12').first;
// @ts-expect-error A fixed fee rounds up to the cent, $10, $50 or $100 only.
calculate.fixedFee('18.5', '95', '40', '5', true, '12');
// @ts-expect-error Adding GST is a boolean flag.
calculate.fixedFee('18.5', '95', '40', '10', 'yes', '12');
void fee;
const member = { balance: '4000000', earnings: '100000', child: false, settlement: false, died: false };
const division296Year = { largeThreshold: '3000000', veryLargeThreshold: '10000000', rate: '15', veryLargeRate: '10' };
const division296Total: number = calculate.division296(member, division296Year).total;
// @ts-expect-error Each exception is a boolean answer, as the form passes it.
calculate.division296({ ...member, died: 'no' }, division296Year);
// The very large component keeps the sign of the earnings, so it is always a number.
const component: number = calculate.division296(member, division296Year).component;
void division296Total;
void component;
const parking = { method: 'station', fee: '12.36', benefits: '22', each: '12.36', firstFee: '0', lastFee: '0', registerValue: '0',
  days: '0', firstYear: '2027', rate: '0', spaceDays: '1', spaces: '1', employeesStart: '0', employeesEnd: '0', spacesStart: '0',
  spacesEnd: '0', contribution: '0' } as const;
const parkingValue: number = calculate.fbtCarParking(parking, { threshold: '11.48', days: '365', ended: '2027' }).taxableValue;
// @ts-expect-error The actual cost of a car park is not one of the 5 methods.
calculate.fbtCarParking({ ...parking, method: 'actual' }, { threshold: '11.48', days: '365', ended: '2027' });
const loanValue: number = calculate.fbtLoan({ balances: '18250000', accrued: '2000', incomeUse: '60', deduction: '1200' },
  { days: '365', rate: '8.27' }).reduction;
const meal = { method: 'register', expenses: '900', registerBenefits: '1000', registerTotal: '3000', firstYear: '2027', earlier: [] } as const;
const mealValue: number = calculate.fbtMealEntertainment({ ...meal, earlier: [] }, { ended: '2027' }).taxableValue;
// @ts-expect-error Earlier years' expenses are a list of decimal strings.
calculate.fbtMealEntertainment({ ...meal, earlier: '1000' }, { ended: '2027' });
const property = { method: 'in-house-public-price', price: '900', notional: '0', contribution: '500', incomeUse: '0',
  contributionDeduction: '0', available: '0' } as const;
const propertyValue: number = calculate.fbtProperty(property).taxableValue;
const inHouseReduction: number | undefined = calculate.fbtProperty(property).inHouseReduction;
// @ts-expect-error Airline transport is not one of the property rules.
calculate.fbtProperty({ ...property, method: 'in-house-airline' });
const expense = { method: 'external', expenditure: '500', paid: '250', contribution: '0', incomeUse: '80', portionDeduction: '200',
  price: '0', notional: '0', available: '0' } as const;
const expenseValue: number = calculate.fbtExpensePayment(expense).taxableValue;
// @ts-expect-error An external property rule does not value an expense payment.
calculate.fbtExpensePayment({ ...expense, method: 'external-cost-price' });
void parkingValue;
void loanValue;
void mealValue;
void propertyValue;
void inHouseReduction;
void expenseValue;
const landTax: number = calculate.landTaxYear('1100000', { name: 'Tasmania', scale: '0,0,0,0,excess', surcharge: '0,0,2,0,excess' },
  { foreign: true, surchargeValue: '400000' }).total;
// @ts-expect-error A land value is a decimal string, as the form field gives it.
calculate.landTaxYear(1100000, { name: 'Tasmania', scale: '0,0,0,0,excess' });
// @ts-expect-error A foreign or absentee owner is a boolean flag.
calculate.landTaxYear('1100000', { name: 'Tasmania', scale: '0,0,0,0,excess' }, { foreign: 'yes' });
void landTax;
const dualCab = { body: 'dual-cab', seats: '5', gvm: '2000', kerb: '1400', payload: '0', accessories: '0', modified: 'no',
  cost: '50000', credit: 'full', fuel: 'other', use: 'limited' } as const;
const vehicleYear = { carLimit: '69883', fuelEfficientThreshold: '91661', otherThreshold: '80809' };
const passengers: boolean | null = calculate.vehicleClass(dualCab, vehicleYear).passengers;
// @ts-expect-error Private use is the user's stated fact, limited or other, not a conclusion the page draws.
calculate.vehicleClass({ ...dualCab, use: true }, vehicleYear);
// @ts-expect-error Seats are a decimal string, as the form passes them.
calculate.vehicleClass({ ...dualCab, seats: 5 }, vehicleYear);
// @ts-expect-error The GST credit is null when the classifier cannot decide it.
const vehicleCredit: number = calculate.vehicleClass(dualCab, vehicleYear).credit;
void passengers;
void vehicleCredit;
const payroll: number = calculate.payrollTax('1500000', '', 'AU-NSW').total;
// @ts-expect-error Wages are decimal strings, as the form passes them.
calculate.payrollTax(1500000, '', 'AU-NSW');
// @ts-expect-error A tax line's rate is the text the page shows.
const payrollRate: number = calculate.payrollTax('1500000', '', 'AU-NSW').lines[0].rate;
void payroll;
void payrollRate;
const allocationYear = { scale: '0,0,0;18201,0,15;45001,4020,30;135001,31020,37;190001,51370,45', baseRate: '25', companyRate: '30' };
const allocation = { gateway1: true, gateway2: true, factor3: false, benchmark: '0',
  recipients: [{ kind: 'individual' as const, firm: '330000', deductions: '0', other: '0' }] };
const counted: number | null = calculate.pcgAllocation(allocation, allocationYear).taxRate;
// @ts-expect-error A recipient's kind is one the form offers, not a free label.
calculate.pcgAllocation({ ...allocation, recipients: [{ kind: 'trust', firm: '1', deductions: '0', other: '0' }] }, allocationYear);
// @ts-expect-error Other income less other deductions is a decimal string, which may be negative.
calculate.pcgAllocation({ ...allocation, recipients: [{ kind: 'individual', firm: '1', deductions: '0', other: -50 }] }, allocationYear);
// @ts-expect-error The year's company rates come from the form as decimal strings.
calculate.pcgAllocation(allocation, { ...allocationYear, baseRate: 25 });
void counted;
const companyYear = { turnover: '104000', assessable: '104000', passive: '4000' };
const companyInput = { ...companyYear, taxable: '104000', existed: true, prior: companyYear, dividend: '30000', franking: '100', marginal: '30' };
const companyNet: number = calculate.companyTax(companyInput).net;
// @ts-expect-error Whether the company existed is a boolean, not the form's 'yes'.
calculate.companyTax({ ...companyInput, existed: 'yes' });
// @ts-expect-error The base rate entity test names its reason; the rate is a number.
const companyReason: number = calculate.companyTax(companyInput).entity;
void companyNet;
void companyReason;
const marginInput = { interest: 'freehold' as const, taxable: true, agreed: true, acquired: 'margin' as const, associate: false,
  method: 'consideration' as const, price: '190000', basis: 'inclusive' as const, cost: '400000', part: '200000', whole: '2000000' };
const marginGst: number = calculate.gstMarginScheme(marginInput).gst;
// @ts-expect-error The written agreement is a boolean, not the form's 'yes'.
calculate.gstMarginScheme({ ...marginInput, agreed: 'yes' });
// @ts-expect-error An acquisition is one of the 5 the page offers.
calculate.gstMarginScheme({ ...marginInput, acquired: 'gift' });
// @ts-expect-error Whether the scheme applies is a boolean, not an amount.
const marginApplies: number = calculate.gstMarginScheme(marginInput).applies;
void marginGst;
void marginApplies;
const surchargeBuyer = { type: 'individual' as const, status: 'other' as const, daysBefore: '0', daysDecember: '0', nzResident: false,
  resides: false, absent: false, home: false, overseas: false, largest: '0', combined: '0', absentee: '0', capital: '0', amendable: false, control: false,
  named: false, defaults: '0', exemption: false };
const surchargePurchase = { place: 'AU-NSW', use: 'residential' as const, value: '1000000', share: '1000000', land: '1200000' };
const surchargeDuty: number = calculate.foreignSurcharge(surchargeBuyer, surchargePurchase).duty;
// @ts-expect-error Values are whole-dollar strings, as the form passes them.
calculate.foreignSurcharge(surchargeBuyer, { ...surchargePurchase, value: 1000000 });
// @ts-expect-error A buyer is one of the 5 kinds the page offers.
calculate.foreignSurcharge({ ...surchargeBuyer, type: 'partnership' }, surchargePurchase);
const firb: number = calculate.firbFee('established', '2000000').fee;
// @ts-expect-error A FIRB application is for residential land without or with an established dwelling, or none.
calculate.firbFee('commercial', '2000000');
void firb;
void surchargeDuty;
const holidays = calculate.parseHolidays('[]');
const businessDayCount: number = calculate.businessDays({ mode: 'count', place: 'NSW', start: '2026-12-21', end: '2027-01-04', count: '10' },
  holidays).days;
// @ts-expect-error The mode is count, add or subtract.
calculate.businessDays({ mode: 'sum', place: 'NSW', start: '2026-12-21', end: '2027-01-04', count: '10' }, holidays);
void businessDayCount;
const sgcPay = { payday: '2026-07-30', timing: 'standard', nextPayday: '2026-07-30', determination: '2026-07-30', earnings: '1000',
  earlier: '0', onTime: '0', late: '120', received: '2026-08-25', assessment: '2026-12-01', assessed: 'no', disclosure: 'none',
  lodged: '2026-07-30', assumedRate: '11.51' } as const;
const sgcCharge: number = calculate.paydaySuperCharge(sgcPay).charge;
// @ts-expect-error Money is a decimal string, as the form passes it.
calculate.paydaySuperCharge({ ...sgcPay, earnings: 1000 });
// @ts-expect-error The timing is one of the 4 periods in subsection 18C(2) and the usual one.
calculate.paydaySuperCharge({ ...sgcPay, timing: 'bunched' });
// @ts-expect-error A due date is an ISO date string, not a day number.
const sgcDue: number = calculate.paydaySuperDue(sgcPay).due;
// @ts-expect-error The old law covers 2022-23 to 2025-26 only.
calculate.quarterlySgCharge({ year: '2026-27', quarter: '1', wages: '1', ote: '1', contributions: '0', lodged: '2026-11-20' });
void sgcCharge;
void sgcDue;
const cgtHome = { purchased: '', sold: '', movedIn: '', practicable: 'yes', exclusions: 'none',
  away: [{ from: '', to: '', rented: false, choose: false }], partPercent: '0', partFrom: '', partTo: '', market: '0' };
const cgtSale = { entity: 'individual', resident: 'yes', kind: 'investment', acquired: '1997-07-01', event: '2026-02-01', proceeds: '496000',
  price: '144000', buying: { amount: '20000', date: '1997-07-01' }, improvements: [{ amount: '0', date: '' }], selling: '12500', owning: '0',
  works: '255', currentLosses: '0', priorLosses: '0', income: '90000', home: cgtHome } as const;
const cgtNet: number = calculate.capitalGain(cgtSale).net;
// @ts-expect-error Money is a decimal string, as the form passes it.
calculate.capitalGain({ ...cgtSale, proceeds: 496000 });
// @ts-expect-error The entity is an individual, a trust, a complying super fund or a company.
calculate.capitalGain({ ...cgtSale, entity: 'partnership' });
// @ts-expect-error An absence's rented and chosen marks are checkbox states.
calculate.capitalGain({ ...cgtSale, home: { ...cgtHome, away: [{ from: '', to: '', rented: 'yes', choose: false }] } });
void cgtNet;
const concessionAnswers = { entity: 'individual', partnership: 'no', asset: 'business', acquired: '2014-03-03', event: '2026-02-02',
  business: 'yes', previousBusiness: 'yes', previous: '2150000', earlierBusiness: 'yes', earlier: '1900000', likely: '2100000',
  actual: '1950000', netAssets: '6200000', passive: 'none', ceased: '', extension: 'no', active: '3000', born: '1975-08-14',
  retiring: 'no', incapacitated: 'no', significant: 'no', fifteen: 'no', choice: '2026-10-31', used: '0' } as const;
const concessionsOpen: boolean = calculate.cgtConcessions(concessionAnswers).basic;
// @ts-expect-error Money is a decimal string, as the form passes it.
calculate.cgtConcessions({ ...concessionAnswers, netAssets: 6200000 });
// @ts-expect-error The entity is an individual, a company or a trust.
calculate.cgtConcessions({ ...concessionAnswers, entity: 'partnership' });
void concessionsOpen;
const leaveInput = { place: 'AU-NSW', start: '2014-02-01', end: '2026-07-31', excluded: '0', taken: '0', mode: 'ends',
  reason: 'redundancy', pay: '1500' } as const;
const leaveWeeks: number = calculate.longServiceLeave(leaveInput).weeks;
// @ts-expect-error The place is a state or territory code, as the form's radios carry it.
calculate.longServiceLeave({ ...leaveInput, place: 'NSW' });
// @ts-expect-error Weekly pay is a decimal string, as the form passes it.
calculate.longServiceLeave({ ...leaveInput, pay: 1500 });
// @ts-expect-error The reason is one of the form's 10 reasons.
calculate.longServiceLeave({ ...leaveInput, reason: 'sacked' });
void leaveWeeks;
const ownerPay = { year: '2026-27', profit: '200000', baseRate: true, salary: '100000', other: '0' };
const ownerKept: number = calculate.salaryDividend(ownerPay).bestKept;
// @ts-expect-error Whether the company is a base rate entity is a boolean, as the form passes it.
calculate.salaryDividend({ ...ownerPay, baseRate: 'yes' });
// @ts-expect-error Money is a decimal string.
calculate.salaryDividend({ ...ownerPay, profit: 200000 });
void ownerKept;
const structures = { year: '2026-27', profit: '150000', takenOut: '100000', salary: '60000', baseRate: true, offset: true };
const structuresDifference: number = calculate.soleTraderCompany(structures).difference;
// @ts-expect-error Whether the business qualifies for the offset is a boolean, as the form passes it.
calculate.soleTraderCompany({ ...structures, offset: 'yes' });
// @ts-expect-error Money is a decimal string.
calculate.soleTraderCompany({ ...structures, takenOut: 100000 });
void structuresDifference;
const leaseTerms = { payment: '1000', payments: '60', frequency: 'monthly', timing: 'arrears', rate: '7.5', start: '2026-07-01', residual: '0',
  prepaid: '0', incentives: '0', direct: '500', restoration: '0', ownership: 'no', life: '' } as const;
const leaseLiability: number = calculate.lease(leaseTerms).liability;
// @ts-expect-error Ownership is the form's yes or no, not a boolean.
calculate.lease({ ...leaseTerms, ownership: false });
// @ts-expect-error A lease payment is a decimal string, as the form passes it.
calculate.lease({ ...leaseTerms, payment: 1000 });
const leasePurchase = { price: '50000', gst: 'credit', hpRate: '7.5', life: '8', method: 'diminishing-value', taxRate: '25', car: 'no' } as const;
const leaseNet: number = calculate.leaseComparison(leaseTerms, leasePurchase).hirePurchase.net;
// @ts-expect-error GST is charged and claimed, charged and not claimed, or not charged.
calculate.leaseComparison(leaseTerms, { ...leasePurchase, gst: 'partly' });
void leaseLiability;
void leaseNet;
const ftcInput = { year: '2026-27', lines: [{ fuel: 'diesel', use: 'other_business', acquired: '2026-09-15', quantity: '2000' }] };
const ftcTotal: number = calculate.fuelTaxCredits(ftcInput).total;
// @ts-expect-error The income year is a string such as '2026-27', as the form's select gives it.
calculate.fuelTaxCredits({ ...ftcInput, year: 2026 });
// @ts-expect-error Label 7D is whole dollars as a number, not text.
const ftcLabel: string = calculate.fuelTaxCredits(ftcInput).label7d;
void ftcTotal;
void ftcLabel;
const poolInput = { year: '2025-26', opening_pool_balance: '100000.00', additions: '28000.00', cost_additions: '0', termination_values: '8000.00' };
const poolDeduction: number = calculate.smallBusinessPool(poolInput).deduction;
// @ts-expect-error The income year is a string such as '2025-26', as the form's select gives it.
calculate.smallBusinessPool({ ...poolInput, year: 2025 });
// @ts-expect-error The threshold is dollars as a number, or null for no limit, not text.
const poolThreshold: string = calculate.smallBusinessPool(poolInput).threshold;
// @ts-expect-error Whether the part was used in the 4% manner is a boolean, not text.
calculate.capitalWorks({ year: '2025-26', construction_expenditure: '1', construction_start: '2000-01-01', four_percent_manner: 'no',
  days_used: 365, taxable_use: '1', undeducted_construction_expenditure: '1' });
void poolDeduction;
void poolThreshold;
const lctInput = { year: '2026-27', lines: [{ kind: 'sale', luxury_car_tax_value: '88000', fuel_consumption_litres_per_100km: null }] };
const lctOnSales: number = calculate.luxuryCarTax(lctInput).onSales;
// @ts-expect-error The tax period's year is a string such as '2026-27', as the form's select gives it.
calculate.luxuryCarTax({ ...lctInput, year: 2026 });
// @ts-expect-error Label 1E is whole dollars as a number, not text.
const lctLabel: string = calculate.luxuryCarTax(lctInput).label1e;
void lctOnSales;
void lctLabel;
const fhogInput = { place: 'AU-NSW', date: '2026-08-01', home: 'bought', value: '600000', facts: { person: true, citizen: true, first: true, residence: true } };
const fhogGrant: number = calculate.firstHomeOwnerGrant(fhogInput).grant;
// @ts-expect-error The value is whole dollars as the form's text, not a number.
calculate.firstHomeOwnerGrant({ ...fhogInput, value: 600000 });
// @ts-expect-error The cap reads as text, such as 'up to $600,000'.
const fhogCap: number = calculate.firstHomeOwnerGrant(fhogInput).cap;
void fhogGrant;
void fhogCap;
const sbtInput = { benefit: '11000', interest_value: '11000', interest_tax_free_component: '1000', untaxed_element: '0', recipient: 'member',
  payment_date: '2022-10-01', date_of_birth: '1972-05-01', terminal_medical_condition: false, disability_superannuation_benefit: false,
  year: '2022-23', scope_confirmed: true };
const sbtMaximum: number = calculate.superBenefitTax(sbtInput).maximumTax;
// @ts-expect-error The most tax is a number of dollars, not text.
const sbtText: string = calculate.superBenefitTax(sbtInput).maximumTax;
// @ts-expect-error Each part's ceiling rate is a percentage number.
const sbtRate: string = calculate.superBenefitTax(sbtInput).parts[0].rate;
void sbtMaximum;
void sbtText;
void sbtRate;
const wetInput = { year: '2026-27', dealings: [{ kind: 'wholesale_sale', price_excluding_wet_and_gst: '120.00' }] };
const wetLabel: number = calculate.wineEqualisationTax(wetInput).label1c;
// @ts-expect-error The year is a financial year string, not a number.
calculate.wineEqualisationTax({ ...wetInput, year: 2027 });
// @ts-expect-error The cap is a number of dollars, not a string.
const wetCap: string = calculate.wineEqualisationTax(wetInput).cap;
void wetLabel;
const rentalInput = { year: '2025-26', ownership_share: '1', acquired: '2020-07-01', disposed: null, days_available: 365,
  section_26_50_applies: false, income: {}, expenses: {}, rental_only_expenses: {}, loans: [], borrowing_expenses: '0',
  capital_works: [], depreciating_assets: [] };
const rentalNet: number = calculate.rentalProperty(rentalInput).netRent;
// @ts-expect-error The net rent is a number of dollars, not a string.
const rentalText: string = calculate.rentalProperty(rentalInput).netRent;
void rentalNet;
void rentalText;
void wetCap;
const leavePay = { annual: '0', loading: '0', longService: '22020', accrualStart: '1977-01-01', reason: 'normal', annualBefore1993: '',
  loadingBefore1993: '', lslBefore1978: '780', lsl1978To1993: '6420', payee: 'tfn', earnings: '1155', period: 'week' } as const;
const leaveWithheld: number = calculate.unusedLeave(leavePay).withholding;
const leaveType: 'R' | 'T' = calculate.unusedLeave(leavePay).lumpSumAType;
// @ts-expect-error Money is a decimal string, as the form passes it.
calculate.unusedLeave({ ...leavePay, annual: 0 });
// @ts-expect-error The reason is one of the 4 the form offers; death is out of scope.
calculate.unusedLeave({ ...leavePay, reason: 'death' });
// @ts-expect-error A working holiday maker is not a payee choice: Schedule 15 covers them.
calculate.unusedLeave({ ...leavePay, payee: 'working-holiday-maker' });
void leaveWithheld;
void leaveType;
const frankingInput = { year: '2025-26', entity: 'public', rate: '30', opening: '10000', rdForward: '0', lastBenchmark: '', periodsSince: '',
  determination: false, taxBefore: '', offsetForward: '', earlierLiability: '',
  events: [{ date: '2025-10-28', type: 'payg_instalment', amount: '125000', rdPart: '' }],
  distributions: [{ date: '2025-09-30', amount: '1190000', credit: '510000', permitted: '' }] } as const;
const frankingOffset: number = calculate.frankingAccount(frankingInput).offset;
const frankingCode: 'F' | 'P' | null = calculate.frankingAccount(frankingInput).offsetCode;
// @ts-expect-error The entity is one of the form's 3 kinds; a trust has no franking account here.
calculate.frankingAccount({ ...frankingInput, entity: 'trust' });
// @ts-expect-error Money is a decimal string, as the form passes it.
calculate.frankingAccount({ ...frankingInput, opening: 10000 });
void frankingOffset;
void frankingCode;
const borrowInput = { year: '2024-25', loans: [{ borrowing_expenses: '1600.00', loan_start: '2020-07-03', loan_term_end: '2045-07-02',
  repaid_on: null, income_use: '1', section_26_50_applies: false }] };
const borrowDeduction: number = calculate.borrowingSchedule(borrowInput).deduction;
// @ts-expect-error The rows hold whole cents as bigint, not dollars.
const borrowRemaining: number = calculate.borrowingSchedule(borrowInput).loans[0].rows[0].remaining;
void borrowDeduction;
void borrowRemaining;
const premiumInput = { place: 'AU-SA', wages: '450000', rate: '2', apprentice: '0', actual: '', group: 'no', dust: '', reward: '0',
  vicEmployer: 'new', days: '365', buyout: 'no', qldStart: 'q1', firstYear: 'no', claims: '0' } as const;
const premiumTotal: number = calculate.workersCompensation(premiumInput).total;
// @ts-expect-error The place is a state or territory code, as the form's radios carry it.
calculate.workersCompensation({ ...premiumInput, place: 'SA' });
// @ts-expect-error Wages are a decimal string, as the form passes them.
calculate.workersCompensation({ ...premiumInput, wages: 450000 });
// @ts-expect-error The Queensland start is one of the form's 5 choices.
calculate.workersCompensation({ ...premiumInput, qldStart: 'q5' });
void premiumTotal;
const asicLate = calculate.asicFee({ fee: 'late-review-payment', due: '2026-09-15', received: '2026-10-15' });
const asicAmount: number = asicLate.amount;
// @ts-expect-error The fee is one of the page's fee types.
calculate.asicFee({ fee: 'late-payment' });
// @ts-expect-error Dates are YYYY-MM-DD strings, as the form passes them.
calculate.asicFee({ fee: 'late-lodgement', due: 20260915, received: '2026-10-15' });
// @ts-expect-error The tier is a phrase or null, not a number.
const asicTier: number = asicLate.tier;
void asicAmount;
void asicTier;
const atoInput = { question: 'gic', year: '2025-26', amount: '10000', due_date: '2025-11-21', to: '2026-06-30' };
const atoYear: string = calculate.atoPenaltiesInterest(atoInput).year;
// @ts-expect-error The year is a financial year string, not a number.
calculate.atoPenaltiesInterest({ ...atoInput, year: 2026 });
// @ts-expect-error Warnings are sentences, not numbers.
const atoWarnings: number[] = calculate.atoPenaltiesInterest(atoInput).warnings;
void atoYear;
void atoWarnings;
const rdInput = { notional_deductions: '100000.00', rsp_crc_expenditure: '0', aggregated_turnover: '1000000', exempt_entity_controlled: false,
  base_rate_entity: true, total_expenses: '0', recoupment_clawback: '0', feedstock_revenue: '0', feedstock_expenditure: '0',
  present_year_base_rate_entity: true, year: '2025-26', scope_confirmed: true };
const rdOffset: number = calculate.rdTaxOffset(rdInput).taxOffset;
const blackhole: string = calculate.businessCapitalExpenditure({ items: [], year: '2025-26', scope_confirmed: true }).amounts.deduction;
const statementS: string = calculate.companyTaxStatement({ financial_year: 2027 }).calculation_statement.S;
// @ts-expect-error An answer is a boolean, not 'yes'.
calculate.rdTaxOffset({ ...rdInput, base_rate_entity: 'yes' });
// @ts-expect-error The command's amounts are decimal text, not numbers.
const rdAmounts: Record<string, number> = calculate.rdTaxOffset(rdInput).amounts;
void rdOffset;
void blackhole;
void statementS;
void rdAmounts;
const ceInput = { year: '2026-27', hours: '38', salary: '100000', annualLeave: '4', otherLeave: '0', loading: '0', loadingQualifying: true,
  payrollRate: '0', payrollSuper: true, wcRate: '0', wcSuper: false, rate: '70', nonLabour: '0', expenses: '0', ownSuper: '0',
  gst: true, credits: true, individual: true, delegate: false, result: false, contractorPayroll: false, contractorWc: false,
  smallBusinessOffset: false, hospitalCover: true, studyLoan: false };
const ceCost: number = calculate.contractorEmployee(ceInput).contractorCost;
// @ts-expect-error An answer is a boolean, not 'yes'.
calculate.contractorEmployee({ ...ceInput, delegate: 'no' });
// @ts-expect-error Section 12(3)'s answer is a boolean.
const ceSection: string = calculate.contractorEmployee(ceInput).section12;
void ceCost;
void ceSection;
const gstBdInput = { party: 'supplier', event: 'written_off', amount: '550.00', taxable_or_creditable: true, cash_basis: false,
  special_rule: 'none', attributed: true, year: '2025-26', scope_confirmed: true };
const gstApplies: boolean = calculate.gstBadDebt(gstBdInput).applies;
// @ts-expect-error The command's amounts are decimal text, not numbers.
const gstAmounts: Record<string, number> = calculate.gstBadDebt(gstBdInput).amounts;
const gstOutcome: string = calculate.gstAdjustment('bad-debt', gstBdInput).outcome;
void gstApplies;
void gstAmounts;
void gstOutcome;
const dtInput = { items: [{ label: 'Plant', class: 'asset', carrying_amount: '70000', tax_base: '50000', opening_carrying_amount: '0',
  opening_tax_base: '0' }], unused_tax_losses: '0', opening_unused_tax_losses: '0', unrecognised_deductible: '0', opening_unrecognised_deductible: '0',
  unrecognised_used: '0', accounting_profit: '100000', non_deductible_expenses: '0', non_assessable_income: '0', taxable_income: '100000',
  tax_offsets: '0', base_rate_entity: false, expected_rate: 'standard', opening_expected_rate: 'standard', business_combination: false,
  uncertain_tax_treatment: false, tax_consolidated_group: false, outside_profit_or_loss: false, year: '2025-26', scope_confirmed: true };
const dtExpense: number = calculate.deferredTax(dtInput).incomeTaxExpense;
// @ts-expect-error The command's amounts are decimal text, not numbers.
const dtAmounts: Record<string, number> = calculate.deferredTax(dtInput).amounts;
void dtExpense;
void dtAmounts;
const individualSet = individualTaxTools(individualEngines);
void individualSet['study-loan'].execute({ incomeYear: '2026-27', taxableIncome: 86380 });
void individualSet['concessional-catch-up'].execute({ incomeYear: '2024-25', totalSuperBalance: '450000',
  concessionalContributions: '97500', earlierYears: [] });
void individualSet['lump-sum-arrears'].execute({ receiptYear: '2025-26', taxableIncome: 100000,
  australianResidentAllYears: true, accrualYears: [] });
void fhssTools({ fhss }).fhss.execute({ mode: 'stated', scopeConfirmed: true, determinationDate: '2025-06-20',
  withholdingBasis: 'unable' });
void workExpensesTools({ workExpenses, workExpensesYears: WORK_EXPENSES_YEARS })['work-expenses'].execute({
  method: 'home_office', incomeYear: '2025-26', scopeConfirmed: true });
void governmentSuperTools({ governmentSuperAmounts, governmentSuperYears: GOVERNMENT_SUPER_YEARS })['government-super'].execute({
  incomeYear: '2023-24', scopeConfirmed: true, residency: 'full_year_resident', assessableIncome: 35000,
  taxableIncome: 35000, eligibleIncome: '35000', returnLodged: true, under71: true });
// @ts-expect-error fhssTools requires the fhss engine function.
fhssTools({ fhss: () => ({ amounts: {} }) });
// @ts-expect-error workExpensesTools requires workExpensesYears alongside workExpenses.
workExpensesTools({ workExpenses });
// @ts-expect-error governmentSuperTools requires governmentSuperYears alongside governmentSuperAmounts.
governmentSuperTools({ governmentSuperAmounts });
const businessSet = calculatorTools(calculate);
void businessSet['asic-fees'].execute({ fee: 'company-share-capital' });
void businessSet['ato-penalties-interest'].execute({ question: 'gic', incomeYear: '2025-26', amount: '10000', dueDate: '2025-11-21', toDate: '2026-06-30' });
void businessSet['business-use'].execute({ cost: '20.15', businessUsePercent: '50' });
void businessSet['fixed-fee'].execute({ hours: '18.5', rate: '95' });
void businessSet['franking-account'].execute({ incomeYear: '2025-26', entity: 'public', imputationRatePercent: '30', openingBalance: '10000' });
void businessSet['gic-payment-plan'].execute({ debt: '1000', startDate: '2026-10-01', instalments: 3, frequency: 'monthly' });
void businessSet['gst-margin-scheme'].execute({ interest: 'freehold', taxable: true, agreedInWriting: true, acquired: 'margin',
  method: 'consideration', price: '190000', priceBasis: 'inclusive', cost: '400000' });
void businessSet.hourly.execute({ annualCosts: '20.15', targetProfit: '0', billableHours: '2' });
void businessSet['luxury-car-tax'].execute({ incomeYear: '2026-27', lines: [{ kind: 'sale', luxuryCarTaxValue: '88000' }] });
void businessSet.margin.execute({ sales: '100', directCost: '80' });
void businessSet['objection-deadline'].execute({ decision: 'assessment', reviewPeriodYears: '2', noticeDate: '2026-11-18' });
void businessSet.variance.execute({ actual: '110', budget: '100', kind: 'income' });
void businessSet['vehicle-class'].execute({ incomeYear: '2026-27', body: 'passenger', seats: 5, grossVehicleMassKg: 3000, kerbWeightKg: 2135,
  price: '75000', gstCredit: 'full', fuelConsumption: 'other', privateUse: 'limited' });
void businessSet['wine-equalisation-tax'].execute({ incomeYear: '2026-27', dealings: [{ kind: 'wholesale_sale', priceExcludingWetAndGst: '120.00' }] });
void businessSet.cash.execute({ opening: '-50', buffer: '100', weeks: Array.from({ length: 13 }, () => ({ receipts: '0', payments: '0' })) });
void businessSet['depreciation-pools'].execute({ worksheet: 'low-value-pool', incomeYear: '2025-26',
  previousClosingPoolBalance: '5000', lowCostAssets: '594', lowValueAssets: '0', secondElementCosts: '0', terminationValues: '0' });
void businessSet['div7a-schedule'].execute({ madeDate: '2022-10-01', amount: '100000', termYears: '7', assumedBenchmarkRate: '8.77' });
void businessSet['first-home-owner-grant'].execute({ place: 'AU-NSW', contractDate: '2026-08-01', home: 'bought', value: 600000,
  facts: { person: true, citizen: true, first: true, residence: true } });
void businessSet['payg-instalments'].execute({ method: 'rate', instalmentIncome: '20100', instalmentRatePercent: '1.7' });
void businessSet['payroll-tax'].execute({ place: 'AU-NSW', wages: '1500000' });
void businessSet['salary-dividend'].execute({ incomeYear: '2026-27', companyProfit: '200000', baseRateEntity: true, salary: '100000' });
void businessSet['sole-trader-company'].execute({ incomeYear: '2026-27', businessProfit: '150000', amountTakenOut: '100000',
  salary: '60000', baseRateEntity: true, smallBusinessOffset: true });
void businessSet['sgc-payday'].execute({ regime: 'payday', payday: '2026-07-30', qualifyingEarnings: '1000', receivedOnTime: '120' });
void businessSet.staff.execute({ wages: '51.30', superAmount: '0', otherCosts: '0' });
void businessSet.cgt.execute({ entity: 'individual', assetKind: 'investment', purchaseContractDate: '1997-07-01',
  saleContractDate: '2026-02-01', proceeds: '496000', purchasePrice: '144000' });
void businessSet['cgt-concessions'].execute({ entity: 'individual', assetKind: 'business', purchaseContractDate: '2014-03-03',
  saleContractDate: '2026-02-02', businessInSaleYear: 'yes', likelyTurnover: '2100000', actualTurnover: '1950000',
  netAssetValue: '6200000', activeDays: 3000, dateOfBirth: '1975-08-14', retirementChoiceDate: '2026-10-31' });
void businessSet['pcg-2021-4'].execute({ gateway1Passed: true, gateway2Passed: true, profitEntitlement: '600000',
  returnedByIpp: '330000', taxPaid: '189367' });
void businessSet['pcg-2021-4-allocation'].execute({ incomeYear: '2020-21', gateway1Passed: true, gateway2Passed: true,
  ipp: { firmIncome: '330000' }, associates: [{ kind: 'base-rate-company', firmIncome: '270000' }] });
void businessSet['psi-determination'].execute({ earner: 'sole-trader', mainlyPersonalEfforts: true,
  payers: [{ amount: '18000', paidForResult: true, suppliesTools: true, liableForDefects: true }] });
void businessSet['rental-property'].execute({ incomeYear: '2025-26', ownershipShare: '1', acquiredDate: '2025-07-20',
  daysAvailable: 346 });
void businessSet['super-benefit-tax'].execute({ calculation: 'dasp', incomeYear: '2026-27', taxFreeComponent: '25000',
  taxedElement: '17000', workingHolidayMakerContributions: false, unclaimedMoneyRollover: false });
void businessSet['unused-leave'].execute({ longServiceLeave: '22020', accrualStartDate: '1977-01-01', reason: 'normal',
  lslBefore16August1978: '780', lsl16August1978To17August1993: '6420', payee: 'tfn', normalGrossEarnings: '1155', payPeriod: 'week' });
void businessSet['workers-compensation'].execute({ place: 'AU-NT', estimatedWages: '400000', ratePercent: '3.5', actualWages: '500000' });
void businessSet['business-days'].execute({ mode: 'count', place: 'NSW', startDate: '2026-12-21', endDate: '2027-01-04' });
void businessSet['division-296'].execute({ totalSuperBalance: '4000000', totalSuperEarnings: '100000' });
void businessSet['fbt-car'].execute({ method: 'statutory', costPrice: '60000', daysAvailable: 182, gstCreditEntitled: true });
void businessSet['fbt-car-parking'].execute({ method: 'station', firstBusinessDayFee: '12.36', benefits: 22, feePerBenefit: '12.36' });
void businessSet['fbt-expense-payment'].execute({ method: 'external', expenditure: '500', paidOrReimbursed: '250', incomeUsePercent: '80', portionDeduction: '200' });
void businessSet['fbt-loan'].execute({ totalDailyBalances: '18250000', interestAccrued: '2000', incomeUsePercent: '60', deductionForAccruedInterest: '1200' });
void businessSet['fbt-meal-entertainment'].execute({ method: 'split', expenses: '4000' });
void businessSet['fbt-property'].execute({ method: 'in-house-public-price', price: '900', employeeContribution: '500' });
void businessSet['land-tax'].execute({ place: 'AU-NSW', taxableLandValue: 1100000 });
void businessSet['termination-payment'].execute({ genuineRedundancyPayment: '48000', completedYearsOfService: 5, codeOTaxableComponent: '17678', otherTaxablePayments: '140000', dateOfBirth: '1996-08-01' });
void businessSet['transfer-duty'].execute({ place: 'AU-NSW', dutiableValue: 1350000 });
void businessSet['contractor-employee'].execute({ incomeYear: '2026-27', hoursPerWeek: '38', salary: '100000', contractorHourlyRate: '70' });
void businessSet['rd-tax-offset'].execute({ incomeYear: '2025-26', notionalDeductions: '100000', aggregatedTurnover: '10000000', totalExpenses: '100000' });
void businessSet['gst-adjustments'].execute({ worksheet: 'going-concern', year: '2025-26', forConsideration: true, recipientRegistration: 'registered', writtenAgreement: 'on_or_before_supply_day', allThingsNecessary: true, carriedOnUntilSupply: true });
void businessSet['deferred-tax'].execute({ incomeYear: '2025-26', items: [{ label: 'Plant', class: 'asset', carryingAmount: '70000', taxBase: '50000', openingCarryingAmount: '0', openingTaxBase: '0' }], accountingProfit: '100000', taxableIncome: '100000' });
void pensionMinimumTools({ pensionMinimum, PENSION_MINIMUM_YEARS })['pension-minimum'].execute({ incomeYear: '2026-27', accountBalance: '600000', age: 67 });
void transferBalanceTools({ ATO_TABLE_5, CHARGE_YEARS, RELEASE_YEARS, TBA_KINDS, TBA_YEARS, dayOf, excessContributions, label, transferBalance, yearOf })['transfer-balance'].execute({ calculation: 'concessional_charge', incomeYear: '2020-21', additionalTax: '1000', taxDueDate: '2021-12-01' });
// @ts-expect-error pensionMinimumTools requires PENSION_MINIMUM_YEARS alongside pensionMinimum.
pensionMinimumTools({ pensionMinimum });
void residencyDaysTools({ MAX_PERIODS, RESIDENCY_YEARS, residencyDays })['residency-days'].execute({ incomeYear: '2025-26', periods: [{ arrival: '2025-07-01', departure: '2025-09-30' }], usualPlaceOfAbodeOutsideAustralia: false, intendsToTakeUpResidence: false });
// @ts-expect-error residencyDaysTools requires MAX_PERIODS alongside the years and residencyDays.
residencyDaysTools({ RESIDENCY_YEARS, residencyDays });
const coInput = { payday: '2026-07-10', base_rate: '30.00', casual_loading: '25', ordinary_hours: '30',
  lines: [{ hours: '3', percent: '175', overtime: true }], leave_hours: '0', leave_loading: '0', leave_loading_overtime: false };
const coSuper: number = calculate.casualOvertime(coInput).superGuarantee;
// @ts-expect-error A line says whether it is overtime with a boolean, not 'overtime'.
calculate.casualOvertime({ ...coInput, lines: [{ hours: '3', percent: '175', overtime: 'overtime' }] });
// @ts-expect-error Rates and hours are decimal text, not numbers.
calculate.casualOvertime({ ...coInput, base_rate: 30 });
void coSuper;
