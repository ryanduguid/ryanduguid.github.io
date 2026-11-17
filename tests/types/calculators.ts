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
calculate.loan('60000', '7.5', '60', '18000', 'advance');
// @ts-expect-error Loan payments fall in arrears or in advance, nothing else.
calculate.loan('60000', '7.5', '60', '18000', 'start');
void tax;
void formatted;
const fee: number = calculate.fixedFee('18.5', '95', '40', '10', true, '12').first;
// @ts-expect-error A fixed fee rounds up to the cent, $10, $50 or $100 only.
calculate.fixedFee('18.5', '95', '40', '5', true, '12');
// @ts-expect-error Adding GST is a boolean flag.
calculate.fixedFee('18.5', '95', '40', '10', 'yes', '12');
void fee;
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
