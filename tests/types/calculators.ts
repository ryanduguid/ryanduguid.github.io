// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// Compile only. Runtime validation and rounding have separate Node tests.
import * as calculate from '../../assets/business-calculators.mjs';
import { calculatorTools } from '../../assets/webmcp-tools.mjs';

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
void psiRule;
void psiResults;
const payg = { method: 'rate', notified: '0', instalment: '1', estimatedTax: '0', earlier: '0', credits: '0', income: '20100',
  rate: '1.7', estimatedIncome: '0', earlierIncome: '0' } as const;
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
void parkingValue;
void loanValue;
void mealValue;
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
const surchargeBuyer = { type: 'individual' as const, status: 'other' as const, daysBefore: '0', daysDecember: '0', nzResident: false,
  resides: false, absent: false, home: false, overseas: false, largest: '0', combined: '0', absentee: '0', capital: '0', amendable: false, control: false,
  named: false, defaults: '0', exemption: false };
const surchargePurchase = { place: 'AU-NSW', use: 'residential' as const, value: '1000000', share: '1000000', land: '1200000' };
const surchargeDuty: number = calculate.foreignSurcharge(surchargeBuyer, surchargePurchase).duty;
// @ts-expect-error Values are whole-dollar strings, as the form passes them.
calculate.foreignSurcharge(surchargeBuyer, { ...surchargePurchase, value: 1000000 });
// @ts-expect-error A buyer is one of the 5 kinds the page offers.
calculate.foreignSurcharge({ ...surchargeBuyer, type: 'partnership' }, surchargePurchase);
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
