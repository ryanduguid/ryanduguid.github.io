// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Do the calculator tests notice a wrong engine? Each named mutation below is one
// plausible money error. It is applied to a temporary copy of the engines, never to
// assets/, and the engine's own Node tests must then fail on an assertion. A mutation
// that survives fails this script, and so does a run that ends any other way, such as
// a module that will not load: that shows nothing about the tests. CONTROLS prove it.
// A `find` that no longer matches exactly once also fails, so the list cannot go stale.
//
// Run with: node scripts/mutation-check.mjs

import { spawn } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const levy = { file: 'assets/levy.mjs', test: 'scripts/levy.test.mjs' };
const business = { file: 'assets/business-calculators.mjs', test: 'scripts/business-calculators.test.mjs' };
const individualTest = 'scripts/individual-tax.test.mjs';
const incomeTax = { file: 'assets/income-tax.mjs', test: individualTest };
const studyLoan = { file: 'assets/study-loan.mjs', test: individualTest };
const takeHome = { file: 'assets/take-home-pay.mjs', test: individualTest };
const withholding = { file: 'assets/payg-withholding.mjs', test: individualTest };
const estimate = { file: 'assets/tax-estimate.mjs', test: individualTest };
const projection = { file: 'assets/super-projection.mjs', test: individualTest };
const packaging = { file: 'assets/salary-packaging.mjs', test: individualTest };
const lease = { file: 'assets/novated-lease.mjs', test: individualTest };
const bonus = { file: 'assets/bonus-withholding.mjs', test: individualTest };
const workExpenses = { file: 'assets/work-expenses.mjs', test: individualTest };
const d293 = { file: 'assets/division-293.mjs', test: individualTest };
const arrears = { file: 'assets/lump-sum-arrears.mjs', test: individualTest };
const soleTrader = { file: 'assets/sole-trader.mjs', test: individualTest };
const incomeTests = { file: 'assets/income-tests.mjs', test: individualTest };
const catchUp = { file: 'assets/concessional-catch-up.mjs', test: individualTest };
const rebate = { file: 'assets/private-health-rebate.mjs', test: individualTest };
const offsets = { file: 'assets/individual-offsets.mjs', test: individualTest };
const medical = { file: 'assets/net-medical-expenses.mjs', test: individualTest };
const fito = { file: 'assets/foreign-income-tax-offset.mjs', test: individualTest };
const conversion = { file: 'assets/foreign-income-conversion.mjs', test: individualTest };
const minors = { file: 'assets/minors-income.mjs', test: individualTest };
const nonCommercial = { file: 'assets/non-commercial-losses.mjs', test: individualTest };
const governmentSuper = { file: 'assets/government-super.mjs', test: individualTest };
const governmentSuperResult = { file: 'assets/government-super-result.mjs', test: individualTest };
const tba = { file: 'assets/transfer-balance.mjs', test: 'scripts/transfer-balance.test.mjs' };
const excess = { ...tba, file: 'assets/excess-contributions.mjs' };
const tbaPage = { ...tba, file: 'assets/transfer-balance-result.mjs' };
const pm = { file: 'assets/pension-minimum.mjs', test: 'scripts/pension-minimum.test.mjs' };
const rd = { file: 'assets/residency-days.mjs', test: 'scripts/residency-days.test.mjs' };
const money = { ...business, file: 'assets/money.mjs' };
const division296 = { ...business, file: 'assets/division-296.mjs' };
const div7a = { ...business, file: 'assets/div7a.mjs' };
const finance = { ...business, file: 'assets/finance-schedule.mjs' };
const fbt = { ...business, file: 'assets/fbt-benefits.mjs' };
const evExemption = { ...business, file: 'assets/fbt-ev-exemption.mjs' };
const landTax = { ...business, file: 'assets/land-tax.mjs' };
const pcg = { ...business, file: 'assets/pcg-2021-4.mjs' };
const psi = { ...business, file: 'assets/psi-determination.mjs' };
const concessions = { ...business, file: 'assets/cgt-concessions.mjs' };
const vehicle = { ...business, file: 'assets/vehicle-class.mjs' };
const payroll = { ...business, file: 'assets/payroll-tax.mjs' };
const companyTax = { ...business, file: 'assets/company-tax.mjs' };
const marginScheme = { ...business, file: 'assets/gst-margin-scheme.mjs' };
const surcharges = { ...business, file: 'assets/foreign-surcharge.mjs' };
const businessDays = { ...business, file: 'assets/business-days.mjs' };
const sgc = { ...business, file: 'assets/sgc-payday.mjs' };
const cashflowEngine = { ...business, file: 'assets/payday-cashflow.mjs' };
const cgt = { ...business, file: 'assets/cgt.mjs' };
const lsl = { ...business, file: 'assets/long-service-leave.mjs' };
const salaryDividend = { ...business, file: 'assets/salary-dividend.mjs' };
const soleTraderCompanyEngine = { ...business, file: 'assets/sole-trader-company.mjs' };
const leaseEngine = { ...business, file: 'assets/lease.mjs' };
const ftc = { ...business, file: 'assets/fuel-tax-credits.mjs' };
const pools = { ...business, file: 'assets/depreciation-pools.mjs' };
const rdOffset = { ...business, file: 'assets/rd-tax-offset.mjs' };
const blackhole = { ...business, file: 'assets/blackhole-expenditure.mjs' };
const statement = { ...business, file: 'assets/company-tax-statement.mjs' };
const casualOt = { ...business, file: 'assets/casual-overtime.mjs' };
const contractor = { ...business, file: 'assets/contractor-employee.mjs' };
const invoice = { ...business, file: 'assets/tax-invoice.mjs' };
const trustStream = { ...business, file: 'assets/trust-streaming.mjs' };
const gstAdjustments = { ...business, file: 'assets/gst-adjustments.mjs' };
const deferredTaxEngine = { ...business, file: 'assets/deferred-tax.mjs' };
const lct = { ...business, file: 'assets/luxury-car-tax.mjs' };
const fhog = { ...business, file: 'assets/first-home-owner-grant.mjs' };
const sbt = { ...business, file: 'assets/super-benefit-tax.mjs' };
const swh = { file: 'assets/super-withholding.mjs', test: 'scripts/super-lump-sum-options.test.mjs' };
const dasp = { ...swh, file: 'assets/dasp-tax.mjs' };
const wet = { ...business, file: 'assets/wine-equalisation-tax.mjs' };
const rental = { ...business, file: 'assets/rental-property.mjs' };
const rentalResult = { ...business, file: 'assets/rental-property-result.mjs' };
const leave = { ...business, file: 'assets/unused-leave.mjs' };
const asic = { ...business, file: 'assets/asic-fees.mjs' };
const ato = { ...business, file: 'assets/ato-penalties-interest.mjs' };
const franking = { ...business, file: 'assets/franking-account.mjs' };
const borrow = { ...business, file: 'assets/borrowing-expenses.mjs' };
const wc = { ...business, file: 'assets/workers-compensation.mjs' };

const MUTATIONS = [
  { ...levy, name: 'levy rate is 2.6%', find: 'LEVY_RATE_NUMERATOR = 27;', replace: 'LEVY_RATE_NUMERATOR = 26;' },
  { ...levy, name: 'formula B takes all of the aggregate', find: '(aggregate * 3) / 4', replace: '(aggregate * 4) / 4' },
  { ...levy, name: 'eligible wages take the lesser formula', find: 'Math.max(formulaA, formulaB)', replace: 'Math.min(formulaA, formulaB)' },
  { ...levy, name: 'a tie reports formula B', find: 'formulaB > formulaA ?', replace: 'formulaB >= formulaA ?' },
  { ...levy, name: 'monthly bonuses drop out', find: "['weekly', 'fortnightly', 'monthly']", replace: "['weekly', 'fortnightly']" },
  { ...levy, name: 'quarterly bonuses count', find: "['weekly', 'fortnightly', 'monthly']", replace: "['weekly', 'fortnightly', 'monthly', 'quarterly']" },
  { ...levy, name: 'January 2024 keeps the old casual method', find: 'reportingMonth < CASUAL_METHOD_CHANGE_MONTH', replace: 'reportingMonth <= CASUAL_METHOD_CHANGE_MONTH' },
  { ...levy, name: 'July 2023 is refused', find: 'reportingMonth < LEVY_RATE_FROM_MONTH', replace: 'reportingMonth <= LEVY_RATE_FROM_MONTH' },
  { ...levy, name: 'salary sacrifice is not grossed up', find: 'return paidCents + sacrificedCents;', replace: 'return paidCents;' },
  { ...levy, name: 'the casual loading drops out', find: '+ bonus + casualLoadingCents', replace: '+ bonus' },
  { ...levy, name: 'either casual condition selects s 3B(3)(a)', find: 'instrumentSpecifiesLoading && loadingQuantifiable', replace: 'instrumentSpecifiesLoading || loadingQuantifiable' },
  { ...levy, name: 'levy truncates instead of rounding half up', find: '+ divisor / 2n', replace: '+ 0n' },
  { ...levy, name: 'negative wages are rounded', find: 'if (quarters < 0) {', replace: 'if (false) {' },

  { ...business, name: 'GST inclusive divides by 10', find: '(inclusive ? 11 : 10)', replace: '(inclusive ? 10 : 10)' },
  { ...money, name: 'money ratios truncate', find: '(2n * numerator + denominator) / (2n * denominator)', replace: '(2n * numerator) / (2n * denominator)' },
  { ...money, name: 'percentages truncate', find: '(2n * top + bottom) / (2n * bottom)', replace: '(2n * top) / (2n * bottom)' },
  { ...money, name: 'a rounded zero keeps its minus sign', find: 'numerator < 0 && hundredths ? -hundredths', replace: 'numerator < 0 ? -hundredths' },
  { ...business, name: 'margin divides by cost', find: 'ratioPercent(profit, revenue)', replace: 'ratioPercent(profit, expense || 1)' },
  { ...business, name: 'break-even rounds units down', find: 'Math.ceil(cost / contribution)', replace: 'Math.floor(cost / contribution)' },
  { ...business, name: 'break-even allows a zero contribution', find: 'contribution <= 0', replace: 'contribution < 0' },
  { ...business, name: 'hourly rate rounds down', find: '(numerator + time - 1n) / time', replace: 'numerator / time' },
  { ...business, name: 'a fixed fee rounds to the nearest step', find: '(numerator + denominator - 1n) / denominator', replace: '(numerator + denominator / 2n) / denominator' },
  { ...business, name: 'a fixed fee ignores the margin', find: '(10000n - margin) * step', replace: '10000n * step' },
  { ...business, name: 'fee instalments round to the nearest cent', find: 'const instalment = total / count;', replace: 'const instalment = ratioCents(total, count);' },
  { ...business, name: 'the effective hourly rate includes GST', find: 'ratioMoney(fee * 100n, time)', replace: 'ratioMoney(total * 100n, time)' },
  { ...business, name: 'cost variance reads as income', find: "kind === 'income' ? 1 : -1", replace: "kind === 'income' ? 1 : 1" },
  { ...finance, name: 'the period rate ignores how often payments fall', find: 'den: BigInt(perYear) * ENTERED_ONE', replace: 'den: 12n * ENTERED_ONE' },
  { ...finance, name: 'a balloon is not discounted to today', find: '- balloon * scale) * rate.num', replace: '- balloon * growth) * rate.num' },
  { ...finance, name: 'payments in advance are worked as arrears', find: '(advance ? rate.den + rate.num : rate.den) * (growth - scale));', replace: 'rate.den * (growth - scale));' },
  { ...finance, name: 'a first payment in advance carries interest', find: 'advance && k === 1 ? 0n', replace: 'false ? 0n' },
  { ...finance, name: 'the last payment does not take the rounding', find: 'const paid = last ? balance + interest - left : payment;', replace: 'const paid = payment;' },
  { ...finance, name: 'the number of payments stops a payment early', find: 'balance + interest - payment <= left :', replace: 'balance + interest - 2n * payment <= left :' },
  { ...finance, name: 'a rate is found where the payments fall short', find: "if (atNil < 0) throw new Error('The payments", replace: "if (atNil < -1) throw new Error('The payments" },
  { ...finance, name: 'a percentage balloon is left out of the amount financed', find: '(10000n * growth - share * scale)', replace: '(10000n * growth)' },
  { ...finance, name: 'a balloon above the amount financed is accepted', find: 'balloon > amount)', replace: 'balloon > amount + 1n)' },
  { ...finance, name: 'monthly dates run past a short month', find: 'Math.min(first.getUTCDate(), last)', replace: 'first.getUTCDate()' },
  { ...finance, name: 'income years start on 1 June', find: 'Date.UTC(yearStarting(to - 1), 6, 1)', replace: 'Date.UTC(yearStarting(to - 1), 5, 1)' },
  { ...finance, name: 'the journal debits the liability with the whole payment', find: '[shortDate(row.date), row.label, aud(row.principal)', replace: '[shortDate(row.date), row.label, aud(row.payment)' },
  { ...business, name: 'staff cost spreads over 13 months', find: 'BigInt(cents(wages) + cents(superAmount) + cents(other)), 12n', replace: 'BigInt(cents(wages) + cents(superAmount) + cents(other)), 13n' },
  { ...business, name: 'funding uses the closing balance', find: 'minimumBuffer - minimum', replace: 'minimumBuffer - balance' },
  { ...div7a, name: 'Division 7A compounds over one year too many', find: '(10000n + rate) ** term', replace: '(10000n + rate) ** (term + 1n)' },
  { ...div7a, name: 'Division 7A interest is taken on the repayment', find: 'ratioCents(balanceCents * rate, 10000n)', replace: 'ratioCents(repayment * rate, 10000n)' },
  { ...div7a, name: 'Division 7A accepts a 26-year term', find: 'max: 25, integer: true', replace: 'max: 26, integer: true' },
  { ...business, name: 'transfer duty ignores part of $100', find: '((excess + 99n) / 100n)', replace: '(excess / 100n)' },
  { ...business, name: 'transfer duty takes the next band at a band\'s top value', find: 'dollars <= Number(to)', replace: 'dollars < Number(to)' },
  { ...business, name: 'a whole-value band charges only the excess', find: 'exact = [hundredths * whole, 100n]', replace: 'exact = [hundredths * excess, 100n]' },
  { ...business, name: 'Victorian transfer duty is not taken to the dollar', find: "const toDollar = named.endsWith('-to-dollar');", replace: 'const toDollar = false;' },
  { ...business, name: 'Victorian transfer duty rounds 50 cents up', find: '(numerator + 50n * denominator - 1n)', replace: '(numerator + 50n * denominator)' },
  { ...business, name: 'Victorian transfer duty rounds from the cents', find: '(numerator + 50n * denominator - 1n) / (100n * denominator) * 100n', replace: '(ratioCents(numerator, denominator) + 49n) / 100n * 100n' },
  { ...business, name: 'the NT formula drops its 15V term', find: '+ 1500000000000n * whole', replace: '+ 0n * whole' },
  { ...business, name: 'a broken transfer duty table is used', find: 'if (!contiguous) throw', replace: 'if (false) throw' },
  { ...business, name: 'a transfer duty band may end part way through a dollar', find: '/^\\d+$/.test(to) && ', replace: '' },
  { ...business, name: 'a transfer duty band may end at or below its start', find: 'Number(to) > Number(over)', replace: 'true' },
  { ...landTax, name: 'a land tax band may carry a malformed base', find: '/^\\d+(\\.\\d{1,2})?$/.test(base) && ', replace: '' },
  { ...landTax, name: 'a land tax band may carry an extra field', find: 'row.length === 5 && ', replace: '' },
  { ...landTax, name: 'a land tax choice may be a string', find: "typeof flag === 'boolean'", replace: 'true' },
  { ...business, name: 'a first home exemption reaches $1 past its threshold', find: 'whole <= scheme.exemptTo) duty = 0n', replace: 'whole <= scheme.exemptTo + 1n) duty = 0n' },
  { ...business, name: 'the NSW first home concession scales the duty on the value', find: 'centsOf(String(scheme.exemptTo))', replace: 'centsOf(value)' },
  { ...business, name: 'the NSW $20 minimum drops out for a first home', find: 'if (duty < scheme.minimum)', replace: 'if (false)' },
  { ...business, name: 'Victoria\'s first home share counts down from $750,000', find: '(whole - scheme.exemptTo), scheme.upTo - scheme.exemptTo', replace: '(scheme.upTo - whole), scheme.upTo - scheme.exemptTo' },
  { ...business, name: 'the WA first home rate ignores part of $100', find: '((whole - scheme.exemptTo + 99n) / 100n)', replace: '((whole - scheme.exemptTo) / 100n)' },
  { ...business, name: 'Queensland\'s first home amount takes the next band at a band\'s top value', find: 'whole <= upTo', replace: 'whole < upTo' },
  { ...business, name: 'Queensland\'s first home duty goes below nil', find: 'if (duty < 0n) duty = 0n;', replace: 'if (false) duty = 0n;' },
  { ...business, name: 'FBT car statutory percentage is 25%', find: 'base * 20n * days', replace: 'base * 25n * days' },
  { ...business, name: 'FBT car takes a third off later accessories too', find: '3n * BigInt(cents(car.accessories))', replace: '(car.reduced ? 2n : 3n) * BigInt(cents(car.accessories))' },
  { ...business, name: 'FBT car operating cost stands when the statutory value is lower', find: 'Math.min(statutory, operating ?? statutory)', replace: '(operating ?? statutory)' },
  { ...business, name: 'FBT car contributions take the value below nil', find: 'Math.max(0, Number(ratioCents(numerator, denominator)) - payment)', replace: 'Number(ratioCents(numerator, denominator)) - payment' },
  { ...business, name: 'FBT car business use counts as private use', find: '(10000n - BigInt(', replace: '(0n + BigInt(' },
  { ...business, name: 'FBT is worked on the taxable value, not the grossed-up value', find: 'ratioCents(exact * b, den * 10000n)', replace: 'ratioCents(BigInt(taxable) * b, 10000n)' },
  { ...business, name: 'FBT car grosses Type 2 up at the 4-place rate 1.8868', find: ': [10000n, 10000n - b]', replace: ': [18868n, 10000n]' },
  { ...business, name: 'FBT car grosses Type 1 up at the 4-place rate 2.0802', find: '[100000n * (b + 1000n), 11n * b * (10000n - b)]', replace: '[20802n, 10000n]' },
  { ...business, name: 'FBT car accepts nil operating costs', find: 'cents(car.costs) === 0', replace: 'cents(car.costs) < 0' },
  { ...business, name: 'FBT car accepts more days than the year has', find: 'max: yearDays, integer: true', replace: 'max: yearDays + 1, integer: true' },
  { ...fbt, name: 'FBT loan ignores the interest accrued', find: 'notional - least(accrued, notional)', replace: 'notional' },
  { ...fbt, name: 'FBT loan reduction can take the value below nil', find: 'least(notionalDeduction, gross)', replace: 'notionalDeduction' },
  { ...fbt, name: 'FBT loan deduction for accrued interest can exceed the gross deduction', find: 'grossDeduction - least(deduction, grossDeduction)', replace: 'grossDeduction - deduction' },
  { ...fbt, name: 'FBT loan accepts a deduction above the interest accrued', find: 'if (deduction > accrued)', replace: 'if (false)' },
  { ...fbt, name: 'FBT loan divides by 365 in every year', find: '10000n * days', replace: '10000n * 365n' },
  { ...fbt, name: 'FBT meal 50/50 split takes all the expenses', find: 'ratioCents(expenses, 2n)', replace: 'ratioCents(expenses, 1n)' },
  { ...fbt, name: 'FBT meal register lapses at 30%, not 20%', find: 'earlier[0] * 12n', replace: 'earlier[0] * 13n' },
  { ...fbt, name: 'FBT meal register lapses at exactly 20%', find: 'value * 10n > limit', replace: 'value * 10n >= limit' },
  { ...fbt, name: 'FBT meal register accepts a nil first year', find: 'if (earlier[0] === 0n)', replace: 'if (false)' },
  { ...fbt, name: 'FBT results keep totals too large to show to the cent', find: '100n * 2n ** 46n', replace: 'BigInt(Number.MAX_SAFE_INTEGER)' },
  { ...fbt, name: 'FBT results refuse a total of exactly 2^46 dollars', find: 'if (value > MOST_CENTS)', replace: 'if (value >= MOST_CENTS)' },
  { ...fbt, name: 'FBT register stays valid for 5 years after its first', find: 'min: ended - 4', replace: 'min: ended - 5' },
  { ...fbt, name: 'FBT meal register percentage is not applied', find: 'ratioCents(expenses * benefits, total)', replace: 'ratioCents(expenses * benefits, benefits || 1n)' },
  { ...fbt, name: 'FBT car parking fee at the threshold gives a benefit', find: 'fee > threshold', replace: 'fee >= threshold' },
  { ...fbt, name: 'FBT car parking benefit arises whatever the fee', find: 'return benefit ? { benefit, ...value }', replace: 'return true ? { benefit, ...value }' },
  { ...fbt, name: 'FBT car parking register divides by the year’s days', find: '12n * 366n', replace: '12n * BigInt(yearDays)' },
  { ...fbt, name: 'FBT car parking spaces take 230 days', find: '228n * spaces', replace: '230n * spaces' },
  { ...fbt, name: 'FBT car parking spaces ignore fewer employees', find: 'e0 + e1 < s0 + s1 ?', replace: 'false ?' },
  { ...fbt, name: 'FBT car parking average cost takes the first fee only', find: 'money(p.firstFee) + money(p.lastFee)', replace: '2n * money(p.firstFee)' },
  { ...evExemption, name: 'EV exemption: a value at the threshold pays luxury car tax', find: 'value <= threshold * 100', replace: 'value < threshold * 100' },
  { ...evExemption, name: 'EV exemption: a car first used on 1 July 2022 is not exempt', find: "firstUsed >= '2022-07-01'", replace: "firstUsed > '2022-07-01'" },
  { ...evExemption, name: 'EV exemption: a sale on 1 July falls in the year before', find: "iso.slice(5) < '07-01'", replace: "iso.slice(5) <= '07-01'" },
  { ...evExemption, name: 'EV exemption: a new plug-in hybrid commitment is ignored', find: "['hybrid-no-new-commitment', !facts[1]]", replace: "['hybrid-no-new-commitment', true]" },
  { ...evExemption, name: 'EV exemption: luxury car tax on another supply is ignored', find: "['other-supply', !otherSupply]", replace: "['other-supply', true]" },
  { ...evExemption, name: 'EV exemption: a former employee is exempt', find: "['current-employee', current]", replace: "['current-employee', true]" },
  { ...evExemption, name: 'EV exemption: a taxed sale within the year after first use gives one result', find: 'firstSale > firstUsed && firstSale >=', replace: 'false && firstSale >=' },
  { ...evExemption, name: 'EV exemption: a taxed sale on 1 April after first use precedes the year', find: "firstSale >= `${ended - 1}-04-01`", replace: "firstSale > `${ended - 1}-04-01`" },
  { ...evExemption, name: 'EV exemption: a taxed sale on the day of first use is refused', find: 'firstSale > firstUsed &&', replace: 'firstSale >= firstUsed &&' },
  { ...evExemption, name: 'EV exemption: one condition met is enough', find: 'conditions.every((c) => c.met)', replace: 'conditions.some((c) => c.met)' },
  { ...evExemption, name: 'EV exemption: a first retail sale after the FBT year counts its luxury car tax', find: 'const afterYear = firstSale > yearEnd;', replace: 'const afterYear = false;' },
  { ...evExemption, name: 'EV exemption: an exempt plug-in hybrid benefit before 1 April 2025 needs no earlier use', find: "facts[2] && firstUsed >= '2025-04-01'", replace: "facts[2] && firstUsed > '2025-04-01'" },
  { ...fbt, name: 'FBT car parking contributions take the value below nil', find: 'least(contribution, gross)', replace: 'contribution' },
  { ...fbt, name: 'FBT property 75% rules take the whole price', find: 'ratioCents(value * 3n, 4n)', replace: 'value' },
  { ...fbt, name: 'FBT property bought goods take the notional value', find: 'least(money(p.price), money(p.notional))', replace: 'money(p.notional)' },
  { ...fbt, name: 'FBT in-house reduction applies under salary packaging', find: "&& !method.endsWith('-salary-packaging')", replace: '' },
  { ...fbt, name: 'FBT in-house reduction takes the value below nil', find: 'least(money(available, 1000), value - rule.reduction)', replace: 'money(available, 1000)' },
  { ...fbt, name: 'FBT in-house reduction accepts more than $1,000', find: 'money(available, 1000)', replace: 'money(available)' },
  { ...fbt, name: 'FBT in-house reduction applies to external benefits', find: "method.startsWith('in-house-') && !", replace: '!' },
  { ...fbt, name: 'FBT otherwise deductible reduction takes the value below nil', find: 'least(gd - applied, value)', replace: 'gd - applied' },
  { ...fbt, name: 'FBT otherwise deductible RD can exceed GD', find: 'least(rd, gd)', replace: 'rd' },
  { ...fbt, name: 'FBT property gross deduction on the value after the contribution', find: 'otherwiseDeductible(gross, p.incomeUse, rd)', replace: 'otherwiseDeductible(gross - least(contribution, gross), p.incomeUse, rd)' },
  { ...fbt, name: 'FBT property accepts RD above the contribution', find: 'if (rd > contribution)', replace: 'if (false)' },
  { ...fbt, name: 'FBT property contribution takes the value below nil', find: 'const applied = least(paid, gross);', replace: 'const applied = paid;' },
  { ...fbt, name: 'FBT expense payment gross deduction on the payment', find: 'otherwiseDeductible(expenditure, e.incomeUse, rd)', replace: 'otherwiseDeductible(paid, e.incomeUse, rd)' },
  { ...fbt, name: 'FBT expense payment portion ignores the contribution', find: 'expenditure - paid + contribution', replace: 'expenditure - paid' },
  { ...fbt, name: 'FBT expense payment accepts a payment above the expenditure', find: 'if (paid > expenditure)', replace: 'if (false)' },
  { ...fbt, name: 'FBT expense payment accepts RD above the portion', find: 'if (rd > portion)', replace: 'if (false)' },
  { ...fbt, name: 'FBT in-house expense payment takes the otherwise deductible inputs', find: 'if (hundredths(e.incomeUse) > 0n || rd > 0n)', replace: 'if (false)' },
  { ...fbt, name: 'FBT expense payment takes an external property rule', find: "e.method.startsWith('in-house-') ? e.method : ''", replace: 'e.method' },
  { ...pcg, name: 'PCG 2021/4 puts exactly 50% returned in the band below', find: '[50, true]', replace: '[50, false]' },
  { ...pcg, name: 'PCG 2021/4 puts an exactly 30% tax rate in the band below', find: '[30, true]', replace: '[30, false]' },
  { ...pcg, name: 'PCG 2021/4 puts exactly 100% of the benchmark in the band above', find: '[100, false]', replace: '[100, true]' },
  { ...pcg, name: 'PCG 2021/4 counts an aggregate of 8 on 2 factors as green', find: '2: [7, 8]', replace: '2: [8, 8]' },
  { ...pcg, name: 'PCG 2021/4 counts an aggregate of 13 on 3 factors as amber', find: '3: [10, 12]', replace: '3: [10, 13]' },
  { ...pcg, name: 'PCG 2021/4 scores an arrangement that fails a gateway', find: 'if (failed !== -1)', replace: 'if (false)' },
  { ...pcg, name: 'PCG 2021/4 scores factor 2 when the whole entitlement is returned', find: 'if (returned === entitlement) {', replace: 'if (false) {' },
  { ...pcg, name: 'PCG 2021/4 divides the tax by the amount returned', find: 'pcgScore(tax, entitlement, 1)', replace: 'pcgScore(tax, returned || 1, 1)' },
  { ...pcg, name: 'PCG 2021/4 applies the 2-factor zones to all 3', find: 'PCG_ZONES[factor3 === null ? 2 : 3]', replace: 'PCG_ZONES[2]' },
  { ...pcg, name: 'PCG 2021/4 allocation takes the tax on the firm income alone', find: 'Math.max(alone, difference) / 100, rule', replace: 'alone / 100, rule' },
  { ...pcg, name: 'PCG 2021/4 allocation counts the smaller of 85(a) and 85(b)', find: 'totalTax += Math.max(alone, difference);', replace: 'totalTax += Math.min(alone, difference);' },
  { ...pcg, name: 'PCG 2021/4 allocation names 85(b) when the 2 are equal', find: 'rule: difference > alone ?', replace: 'rule: difference >= alone ?' },
  { ...pcg, name: 'PCG 2021/4 allocation ignores other income under 85(b)', find: 'tax(Math.max(net + rest, 0)) - tax(Math.max(rest, 0))', replace: 'tax(Math.max(net, 0))' },
  { ...pcg, name: 'PCG 2021/4 allocation ignores firm-related deductions', find: 'const net = received - firmDeductions;', replace: 'const net = received;' },
  { ...pcg, name: 'PCG 2021/4 allocation taxes a base rate entity at the full rate', find: "kind === 'base-rate-company' ? baseRate : companyRate", replace: 'companyRate' },
  { ...pcg, name: 'PCG 2021/4 allocation starts each band at its first dollar', find: 'Math.max(Number(from) - 1, 0) * 100', replace: 'Number(from) * 100' },
  { ...pcg, name: 'PCG 2021/4 allocation drops the tax below a band', find: 'return band.base + Number(', replace: 'return Number(' },
  { ...pcg, name: 'PCG 2021/4 allocation truncates each tax', find: 'ratioCents(BigInt(income - band.over) * BigInt(band.rate), 10000n)', replace: '(BigInt(income - band.over) * BigInt(band.rate) / 10000n)' },
  { ...pcg, name: 'PCG 2021/4 allocation drops amounts on an unused row', find: 'if (received || firmDeductions || rest) {', replace: 'if (false) {' },
  { ...pcg, name: 'PCG 2021/4 allocation taxes a recipient it cannot', find: "if (kind === 'other') {", replace: 'if (false) {' },
  { ...pcg, name: 'PCG 2021/4 allocation scores factor 3 on the whole firm income', find: 'remuneration: decimal(cents(recipients[0].firm))', replace: 'remuneration: decimal(firmIncome)' },
  { ...pcg, name: 'PCG 2021/4 allocation uses a scale out of order', find: 'Number(row[0]) > Number(rows[index - 1][0])', replace: 'true' },
  { ...business, name: 'GIC divides by 365 in a leap year', find: '? 366 : 365', replace: '? 365 : 365' },
  { ...business, name: 'GIC moves to a new quarter rate a day late', find: 'GIC_FROM[quarter + 1].from <= day', replace: 'GIC_FROM[quarter + 1].from < day' },
  { ...business, name: 'GIC ignores the assumed rate after the table', find: 'day < GIC_TABLE_END ? GIC_FROM[quarter].rate : assumed', replace: 'GIC_FROM[quarter].rate' },
  { ...business, name: 'GIC keeps a monthly instalment on a day the month lacks', find: 'Math.min(first.getUTCDate(), last)', replace: 'first.getUTCDate()' },
  { ...business, name: 'GIC stops compounding instalments already paid', find: 'paid * (base + BigInt(rate))', replace: 'paid * base' },
  { ...business, name: 'GIC rounds the equal instalment up', find: 'const instalment = grown / paid;', replace: 'const instalment = (grown + paid - 1n) / paid;' },
  { ...business, name: 'GIC truncates the final instalment', find: '(2n * left + scale) / (2n * scale)', replace: 'left / scale' },
  { ...business, name: 'a receipt landing in week 13 counts as deferred', find: 'week + delay >= rows.length ? delayed', replace: 'week + delay >= rows.length - 1 ? delayed' },
  { ...business, name: 'an objection period counts the day notice is given', find: 'const start = new Date(day.getTime() + DAY);', replace: 'const start = day;' },
  { ...business, name: 'an objection period of years ends on the anniversary', find: 'start.getUTCDate()) - DAY)', replace: 'start.getUTCDate()))' },
  { ...business, name: 'an objection allows 59 days, not 60', find: 'getTime() + 60 * DAY', replace: 'getTime() + 59 * DAY' },
  { ...business, name: 'a Saturday last day moves to the Sunday', find: 'weekday === 6 ? 2', replace: 'weekday === 6 ? 1' },
  { ...business, name: 'a Sunday last day stands', find: 'weekday === 0 ? 1 : 0', replace: 'weekday === 0 ? 0 : 0' },
  { ...business, name: 'item 1, 2, 3 or 3A gives 4 years', find: "group === '4' ? 4 : 2", replace: "group === '2' ? 4 : 2" },
  { ...business, name: 'an FBT assessment allows 2 years', find: "decision === 'fbt' || decision === 'amended-fbt' ||", replace: "decision === 'amended-fbt' ||" },
  { ...business, name: 'an amended assessment takes the earlier date', find: 'amended.getTime() > original.getTime()', replace: 'amended.getTime() < original.getTime()' },
  { ...psi, name: 'PSI meets the results test only above 75%', find: '4 * met >= 3 * total', replace: '4 * met > 3 * total' },
  { ...psi, name: 'PSI counts a result without liability for defects', find: 'result && tools && defects ? amounts[i]', replace: 'result && tools ? amounts[i]' },
  { ...psi, name: 'PSI needs more than 80% from one payer to stop self-assessment', find: '5 * largest >= 4 * total', replace: '5 * largest > 4 * total' },
  { ...psi, name: 'PSI ignores the 80% rule', find: 'if (oneSource) {', replace: 'if (false) {' },
  { ...psi, name: 'PSI counts an associate as an unrelated client', find: 'amounts[i] && !associate && offer', replace: 'amounts[i] && offer' },
  { ...psi, name: 'PSI counts an unrelated client not won by an offer', find: '!associate && offer ? [rows[i]]', replace: '!associate ? [rows[i]]' },
  { ...psi, name: 'PSI counts each row of one payer as its own unrelated client', find: 'offer ? [rows[i]] : []', replace: 'offer ? [i] : []' },
  { ...psi, name: 'PSI counts each row of one payer as its own source', find: 'sums[rows[i]] += amount', replace: 'sums[i] += amount' },
  { ...psi, name: 'PSI links a row to the row it names, not that payer’s first row', find: 'same === undefined ? i : first[same - 1]', replace: 'same === undefined ? i : same - 1' },
  { ...psi, name: 'PSI accepts a row named as the same payer as a later row', find: 'same >= 1 && same <= i', replace: 'same >= 1' },
  { ...psi, name: 'PSI meets the unrelated clients test with one client', find: 'pass: unrelated >= 2,', replace: 'pass: unrelated >= 1,' },
  { ...psi, name: 'PSI needs more than 20% of principal work by others', find: 'const fifth = 5 * others >= total;', replace: 'const fifth = 5 * others > total;' },
  { ...psi, name: 'PSI ignores an apprentice', find: 'const employs = fifth || answers.apprentice;', replace: 'const employs = fifth;' },
  { ...psi, name: 'PSI accepts premises not held all year', find: 'premises.times && premises.mainly', replace: 'premises.mainly' },
  { ...psi, name: 'PSI accepts premises not separate from a payer’s', find: 'premises.private && premises.clients', replace: 'premises.private' },
  { ...psi, name: 'PSI applies the agent rules below 75% commission', find: '4 * agent.commission >= 3 * agent.principal', replace: '4 * agent.commission > 3 * agent.principal' },
  { ...psi, name: 'PSI checks an agent’s payments only on the way to the 80% rule', find: 'if (!answers.agent) return null;', replace: 'if (!answers.agent || !answers.mainly || answers.determination || answers.earner !== \'sole-trader\') return null;' },
  { ...psi, name: 'PSI accepts commission over the principal’s payments', find: 'paid.commission > paid.principal', replace: 'false' },
  { ...psi, name: 'PSI ignores a determination in force', find: 'if (answers.determination) {', replace: 'if (false) {' },
  { ...psi, name: 'PSI treats employee income as PSI caught by the rules', find: 'if (outside) {', replace: 'if (false) {' },
  { ...psi, name: 'PSI cites subsection 85-35(1) for a religious practitioner', find: 'a payment to a religious practitioner\', \'subsection 85-35(2)\'', replace: 'a payment to a religious practitioner\', \'subsection 85-35(1)\'' },
  { ...psi, name: 'PSI treats income not mainly from personal effort as PSI', find: 'if (!answers.mainly) {', replace: 'if (false) {' },
  { ...psi, name: 'PSI rounds a share up to a threshold', find: '(BigInt(part) * 10000n) / BigInt(whole)', replace: '(BigInt(part) * 20000n + BigInt(whole)) / (2n * BigInt(whole))' },
  { ...psi, name: 'PSI cites subsection 87-18(1) for an entity', find: 'rule: `subsection 87-18(${entity ? 3 : 1})`', replace: 'rule: `subsection 87-18(1)`' },
  { ...psi, name: 'PSI applies Division 85 to an entity', find: 'entity ? \'Division 86 applies\' : \'Division 85 applies\'', replace: '\'Division 85 applies\'' },
  { ...psi, name: 'PSI accepts others’ work worth more than the PSI', find: 'if (others > total)', replace: 'if (false)' },
  { ...psi, name: 'PSI accepts more than $1,000,000,000', find: 'if (total > 100_000_000_000)', replace: 'if (false)' },
  { ...concessions, name: 'CGT concessions use the $10 million turnover', find: 'const TURNOVER = 200_000_000;', replace: 'const TURNOVER = 1_000_000_000;' },
  { ...concessions, name: 'CGT concessions count a previous turnover of $2 million', find: "previous < TURNOVER) rule = 'subparagraph 328-110(1)(b)(i)'", replace: "previous <= TURNOVER) rule = 'subparagraph 328-110(1)(b)(i)'" },
  { ...concessions, name: 'CGT concessions drop the 2-year bar on likely turnover', find: 'likely < TURNOVER && !barred', replace: 'likely < TURNOVER' },
  { ...concessions, name: 'CGT concessions ignore the turnover at the end of the year', find: 'else if (actual < TURNOVER)', replace: 'else if (actual < 0)' },
  { ...concessions, name: 'CGT concessions treat no business as a small business entity', find: "if (x.business !== 'no') {", replace: 'if (true) {' },
  { ...concessions, name: 'CGT concessions fail net assets of exactly $6 million', find: 'netValue <= NET_ASSETS', replace: 'netValue < NET_ASSETS' },
  { ...concessions, name: 'CGT concessions allow 2 years after the business ceased', find: "ceased >= yearsLater(event, -1) || x.extension === 'yes'", replace: "ceased >= yearsLater(event, -2) || x.extension === 'yes'" },
  { ...concessions, name: 'CGT concessions count the 12 months on from the cessation', find: 'ceased >= yearsLater(event, -1)', replace: 'yearsLater(ceased, 1) >= event' },
  { ...concessions, name: 'CGT concessions ignore a longer period the Commissioner allows', find: "|| x.extension === 'yes') to = ceased", replace: '|| false) to = ceased' },
  { ...concessions, name: 'CGT concessions count the test period without its first day', find: 'dayOf(to) - dayOf(acquired) + 1', replace: 'dayOf(to) - dayOf(acquired)' },
  { ...concessions, name: 'CGT concessions need more than half the test period', find: '2 * activeDays >= testDays', replace: '2 * activeDays > testDays' },
  { ...concessions, name: 'CGT concessions apply the half test to an asset owned more than 15 years', find: 'const over15 = yearsLater(acquired, 15) < event;', replace: 'const over15 = yearsLater(acquired, 15) > event;' },
  { ...concessions, name: 'CGT concessions need more than 7.5 years', find: 'activeDays >= SEVEN_AND_A_HALF.longest', replace: 'activeDays > SEVEN_AND_A_HALF.longest' },
  { ...concessions, name: 'CGT concessions need 14 years for the 15-year exemption', find: 'yearsLater(acquired, 15) < event, retires', replace: 'yearsLater(acquired, 14) < event, retires' },
  { ...concessions, name: 'CGT concessions are not 55 on the 55th birthday', find: 'fiftyFifth <= event', replace: 'fiftyFifth < event' },
  { ...concessions, name: 'CGT concessions test age 55 at the sale for the super contribution', find: 'under55: fiftyFifth > choice', replace: 'under55: fiftyFifth > event' },
  { ...concessions, name: 'CGT concessions ignore permanent incapacity', find: "|| x.incapacitated === 'yes'", replace: '|| false' },
  { ...concessions, name: 'CGT concessions skip the 15 years with a significant individual', find: 'unmet.push(`a significant individual for a total of 15 years of ownership (${at}(c))`);', replace: 'void at;' },
  { ...concessions, name: 'CGT concessions skip the significant individual just before the sale', find: "if (x.significant !== 'yes') unmet.push", replace: 'if (false) unmet.push' },
  { ...concessions, name: 'CGT concessions let a passively held asset through beside your own business', find: "if (x.passive !== 'none' && x.business !== 'no') {", replace: 'if (false) {' },
  { ...concessions, name: 'CGT concessions ignore a passively held asset', find: "const passive = x.passive !== 'none';", replace: 'const passive = false;' },
  { ...concessions, name: 'CGT concessions take the basic conditions without the active asset test', find: '(business.smallBusiness || netAssets || passive) && active.activeAsset', replace: '(business.smallBusiness || netAssets || passive) || active.activeAsset' },
  { ...concessions, name: 'CGT concessions let a trust without a significant individual choose the retirement exemption', find: "const significant = x.entity === 'individual' || x.significant === 'yes';", replace: 'const significant = true;' },
  { ...concessions, name: 'CGT concessions allow the retirement exemption once the limit is used', find: 'used < RETIREMENT_LIMIT', replace: 'used <= RETIREMENT_LIMIT' },
  { ...concessions, name: 'CGT concessions end the replacement asset period after 1 year', find: "-02-28` : yearsLater(event, 2) };", replace: "-02-28` : yearsLater(event, 1) };" },
  { ...concessions, name: 'CGT concessions end a replacement period from 29 February on 1 March', find: "event.endsWith('-02-29') ? `", replace: "false ? `" },
  { ...business, name: 'an activity statement figure rounds its cents', find: 'instalment: Math.floor(notified / 100)', replace: 'instalment: Math.round(notified / 100)' },
  { ...business, name: 'a varied amount rounds its share of estimated tax to the cent', find: 'const share = BigInt(cents(inputs.estimatedTax)) * BigInt(instalment);', replace: 'const share = (BigInt(cents(inputs.estimatedTax)) * BigInt(instalment) + 2n) / 4n * 4n;' },
  { ...business, name: 'a varied amount takes a fifth of estimated tax a quarter', find: 'const amount = share - 4n * net;', replace: 'const amount = share * 4n / 5n - 4n * net;' },
  { ...business, name: 'credits claimed are not added back', find: 'return BigInt(earlier - credits);', replace: 'return BigInt(earlier);' },
  { ...business, name: 'a varied amount below nil gives no credit', find: 'credit: Number(amount < 0n ? -amount / 400n : 0n)', replace: 'credit: 0' },
  { ...business, name: 'the first instalment takes earlier instalments', find: 'instalment === 1 && cents(inputs.earlier)', replace: 'false && cents(inputs.earlier)' },
  { ...business, name: 'the second instalment adds back credits', find: 'instalment < 3 && cents(inputs.credits)', replace: 'instalment < 2 && cents(inputs.credits)' },
  { ...business, name: 'the third instalment refuses credits', find: 'instalment < 3 && cents(inputs.credits)', replace: 'instalment < 4 && cents(inputs.credits)' },
  { ...business, name: 'a varied rate rounds to the nearest hundredth', find: 'tax * 10000n / yearIncome', replace: '(tax * 20000n + yearIncome) / (2n * yearIncome)' },
  { ...business, name: 'a higher varied rate gives a credit', find: 'if (rate < previous)', replace: 'if (rate !== previous)' },
  { ...business, name: 'a varied rate is compared with T2', find: 'if (rate < previous)', replace: 'if (rate < hundredths(inputs.rate))' },
  { ...business, name: 'the credit leaves out earlier instalment income', find: 'earlierLessCredits() * 10000n - BigInt(cents(inputs.earlierIncome)) * BigInt(rate)', replace: 'earlierLessCredits() * 10000n' },
  { ...business, name: 'the credit rounds earlier income at the varied rate to the cent', find: 'earlierLessCredits() * 10000n - BigInt(cents(inputs.earlierIncome)) * BigInt(rate)', replace: 'earlierLessCredits() * 10000n - (BigInt(cents(inputs.earlierIncome)) * BigInt(rate) + 5000n) / 10000n * 10000n' },
  { ...business, name: 'a varied rate is not applied to T1', find: 'const amount = BigInt(cents(inputs.income)) * BigInt(rate);', replace: 'const amount = BigInt(cents(inputs.income)) * BigInt(hundredths(inputs.rate));' },
  { ...business, name: 'T1 times the rate rounds to the cent', find: 'const amount = BigInt(cents(inputs.income)) * BigInt(rate);', replace: 'const amount = (BigInt(cents(inputs.income)) * BigInt(rate) + 5000n) / 10000n * 10000n;' },
  { ...business, name: 'estimated tax above estimated income is accepted', find: 'if (tax > yearIncome)', replace: 'if (tax > 2n * yearIncome)' },
  { ...business, name: 'ETP tax-free limit leaves out the years of service', find: 'cents(year.serviceAmount) * number(', replace: '0 * number(' },
  { ...business, name: 'ETP tax-free part can exceed the redundancy payment', find: 'Math.min(redundancy, limit)', replace: 'limit' },
  { ...business, name: 'ETP code O cap ignores the ETP cap the code R part used', find: 'Math.min(etpCap - excludedWithin, wholeOfIncomeCap)', replace: 'Math.min(etpCap, wholeOfIncomeCap)' },
  { ...business, name: 'ETP whole-of-income cap ignores other taxable payments', find: 'cents(year.wholeOfIncomeCap) - cents(payment.other)', replace: 'cents(year.wholeOfIncomeCap)' },
  { ...business, name: 'ETP above the cap is withheld at the rate within it', find: 'BigInt(component - inside) * above', replace: 'BigInt(component - inside) * within' },
  { ...business, name: 'ETP withholding rounds to the cent, not the dollar', find: 'within + BigInt(component - inside) * above, 1000000n);\n    return [inside, Number(dollars) * 100];', replace: 'within + BigInt(component - inside) * above, 10000n);\n    return [inside, Number(dollars)];' },
  { ...business, name: 'ETP preservation age reached on the year’s last day does not count', find: '<= year.yearEnd', replace: '< year.yearEnd' },
  { ...business, name: 'ETP preservation age table is a year out', find: 'july - 1904', replace: 'july - 1903' },
  { ...business, name: 'ETP accepts a date of birth after the year', find: 'born > year.yearEnd', replace: 'born > \'9999\'' },
  { ...business, name: 'ETP accepts 151 years of service', find: 'max: 150, integer: true', replace: 'max: 151, integer: true' },
  { ...division296, name: 'Division 296 shares truncate', find: 'ratioCents((balance - threshold) * 10000n, balance)', replace: '((balance - threshold) * 10000n / balance)' },
  { ...division296, name: 'Division 296 taxes a balance equal to the threshold', find: 'reference <= largeThreshold', replace: 'reference < largeThreshold' },
  { ...division296, name: 'Division 296 keeps the balance after death', find: 'member.died ? 0n : balance', replace: 'balance' },
  { ...division296, name: 'Division 296 taxes negative earnings', find: 'earnings > 0n ? earnings * percentage : 0n', replace: 'earnings * percentage' },
  { ...division296, name: 'Division 296 takes the 10% on taxable earnings', find: 'component * hundredths(year.veryLargeRate)', replace: 'taxable * hundredths(year.veryLargeRate)' },
  { ...division296, name: 'Division 296 ignores the exceptions', find: "const liable = liability === 'liable' || liability === 'rounds-to-nil';", replace: 'const liable = true;' },
  { ...division296, name: 'Division 296 rounds each tax before the total', find: 'shown(tax + veryLargeTax, 100000000n)', replace: 'shown(tax, 100000000n) + shown(veryLargeTax, 100000000n)' },
  { ...division296, name: 'Division 296 shows a negative component as nil', find: 'component: shown(component, 10000n)', replace: 'component: shown(component < 0n ? 0n : component, 10000n)' },
  { ...division296, name: 'Division 296 accepts an exception answered with text', find: "typeof flag !== 'boolean'", replace: 'false' },

  { ...arrears, name: 'the repair levy runs into 2017-18', find: "const LEVY_YEARS = ['2014-15', '2015-16', '2016-17'];", replace: "const LEVY_YEARS = ['2014-15', '2015-16', '2016-17', '2017-18'];" },
  { ...arrears, name: 'the repair levy is 3%', find: 'income - 180000) * 40 : 0', replace: 'income - 180000) * 60 : 0' },
  { ...arrears, name: 'amounts round half down', find: 'Math.floor((units + 10) / 20)', replace: 'Math.floor((units + 9) / 20)' },
  { ...arrears, name: 'arrears of exactly 10% fail the test', find: 'met: total * 10 >= testIncome', replace: 'met: total * 10 > testIncome' },
  { ...arrears, name: 'the net capital gain stays in normal taxable income', find: 'const normal = Math.max(0, taxable - gain);', replace: 'const normal = taxable;' },
  { ...arrears, name: '3 accrual years are recent', find: 'const recent = years.slice(0, 2);', replace: 'const recent = years.slice(0, 3);' },
  { ...arrears, name: 'a fourth place of 5 is not raised', find: '(units * 5) / arrears) + 5) / 10', replace: '(units * 5) / arrears) + 4) / 10' },
  { ...arrears, name: 'distant years take the latest rate only', find: 'distantArrears * (recentRates[0] + recentRates[1])', replace: 'distantArrears * recentRates[0] * 2' },
  { ...arrears, name: 'a rebate year adds its own arrears', find: 'income - (year.facts.rebateYearArrears ?? 0)', replace: 'income + (year.facts.rebateYearArrears ?? 0)' },
  { ...arrears, name: 'the distant rate keeps the net capital gain', find: 'Math.max(0, year.facts.taxable - (year.facts.gain ?? 0))', replace: 'year.facts.taxable' },
  { ...arrears, name: '2017-18 37% band starts at $80,000', find: "'2017-18': [[18200, 19], [37000, 32.5], [87000", replace: "'2017-18': [[18200, 19], [37000, 32.5], [80000" },
  { ...arrears, name: 'a negative offset is kept', find: 'money(Math.max(0, taxOnArrears - notionalTotal))', replace: 'money(taxOnArrears - notionalTotal)' },
  { ...incomeTests, name: 'income tests round section 57A benefits to the nearest dollar', find: 'Math.floor((p.fringe57a * 53) / 100)', replace: 'Math.round((p.fringe57a * 53) / 100)' },
  { ...incomeTests, name: 'income tests count section 57A benefits in full where adjusted', find: 'Math.floor((p.fringe57a * 53) / 100)', replace: 'p.fringe57a' },
  { ...incomeTests, name: 'income tests take reportable super contributions below nil', find: 'Math.max(0, p.employerSuper + p.personalSuper - p.excessConcessional)', replace: 'p.employerSuper + p.personalSuper - p.excessConcessional' },
  { ...incomeTests, name: 'income tests keep the FHSS released amount', find: 'Math.max(0, p.taxable - p.fhss)', replace: 'p.taxable' },
  { ...incomeTests, name: 'Division 293 income keeps reportable super contributions', find: 'trust: p.familyTrust, fringe, losses, lumpSum: 0', replace: 'trust: p.familyTrust + contributions, fringe, losses, lumpSum: 0' },
  { ...incomeTests, name: 'rebate income adds family trust distribution amounts', find: 'rebateIncome: taxable + contributions', replace: 'rebateIncome: taxable + p.familyTrust + contributions' },
  { ...incomeTests, name: 'adjusted taxable income ignores child support', find: '+ contributions - p.childSupport,', replace: '+ contributions,' },
  { ...incomeTests, name: 'repayment income takes the adjusted fringe benefits total', find: 'repaymentIncome: taxable + losses + fringe', replace: 'repaymentIncome: taxable + losses + adjustedFringe' },
  { ...incomeTests, name: 'co-contribution income keeps business deductions', find: '+ coEmployer - p.businessDeductions,', replace: '+ coEmployer,' },
  { ...incomeTests, name: 'income tests accept a part larger than its whole', find: 'if (p[part] > p[whole]) throw', replace: 'if (false) throw' },
  { ...incomeTests, name: 'income tests accept a person not resident all year', find: 'if (!parts.resident) throw', replace: 'if (false) throw' },
  { ...catchUp, name: '$500,000 itself carries forward', find: 'const below = balance < BALANCE_LIMIT;', replace: 'const below = balance <= BALANCE_LIMIT;' },
  { ...catchUp, name: 'an earlier year at $500,000 carries forward', find: 'if (year.balance < BALANCE_LIMIT) {', replace: 'if (year.balance <= BALANCE_LIMIT) {' },
  { ...catchUp, name: 'unused cap applies latest year first', find: 'for (const unused of pool) {', replace: 'for (const unused of [...pool].reverse()) {' },
  { ...catchUp, name: 'unused cap lasts 6 years', find: 'const YEARS_CARRIED = 5;', replace: 'const YEARS_CARRIED = 6;' },
  { ...catchUp, name: 'a year over its cap has negative unused cap', find: 'amount: Math.max(0, yearCap - year.contributions)', replace: 'amount: yearCap - year.contributions' },
  { ...catchUp, name: 'an increase is not limited to the excess', find: 'Math.min(unused.amount - unused.applied, need)', replace: '(unused.amount - unused.applied)' },
  { ...catchUp, name: 'the carried amount counts at any balance', find: 'const available = below ? cap + carried : cap;', replace: 'const available = cap + carried;' },
  { ...catchUp, name: 'an earlier year draws from 2019-20 on', find: 'const from = Math.max(2018, year.start - YEARS_CARRIED);', replace: 'const from = Math.max(2019, year.start - YEARS_CARRIED);' },
  { ...catchUp, name: 'the 2020-21 cap is $27,500', find: "'2020-21': 25000,", replace: "'2020-21': 27500," },
  { ...catchUp, name: 'the proposal is left out of what is applied', find: 'apply(window, Math.max(0, total - cap))', replace: 'apply(window, Math.max(0, concessional - cap))' },
  { ...catchUp, name: 'the applied amount is not limited to what was carried', find: 'Math.min(carried, Math.max(0, concessional - cap))', replace: 'Math.max(0, concessional - cap)' },
  { ...catchUp, name: 'an amount lapses a year early', find: 'expiresAtEndOf: label(unused.start + YEARS_CARRIED) }', replace: 'expiresAtEndOf: label(unused.start + YEARS_CARRIED - 1) }' },
  { ...rebate, name: 'PHI income at a threshold reaches its tier', find: '.filter((threshold) => income > threshold)', replace: '.filter((threshold) => income >= threshold)' },
  { ...rebate, name: 'PHI family thresholds rise for the first child', find: '1500 * Math.max(0, children - 1)', replace: '1500 * children' },
  { ...rebate, name: 'PHI premiums from 1 April take the earlier percentages', find: 'Number(year.slice(0, 4)) + later;', replace: 'Number(year.slice(0, 4));' },
  { ...rebate, name: 'PHI share truncates the cents', find: 'ratioCents(BigInt(premiums) * BigInt(pct), 100000n)', replace: '(BigInt(premiums) * BigInt(pct) / 100000n)' },
  { ...rebate, name: 'PHI ignores a maintained dependant', find: '(families ? 2 * amount', replace: '(spouse !== null ? 2 * amount' },
  { ...rebate, name: 'PHI nets the excess against the offset', find: 'offset: Math.max(0, share - received) / 100', replace: 'offset: (share - received) / 100' },
  { ...offsets, name: 'beneficiary offset rounds half up', find: 'Math.ceil(cents / 100)', replace: 'Math.round(cents / 100)' },
  { ...offsets, name: 'beneficiary offset drops the second 15%', find: ' + 15 * Math.max(0, amount - upper)', replace: '' },
  { ...offsets, name: 'invalid carer limit excludes income at it', find: 'tested <= limit * 100', replace: 'tested < limit * 100' },
  { ...offsets, name: 'invalid carer keeps an offset under $1', find: 'left >= 100', replace: 'left > 0' },
  { ...offsets, name: 'income reduction from $286', find: 'income - 28200', replace: 'income - 28600' },
  { ...offsets, name: 'zone residence at exactly half the year', find: 'if (days * 2 > yearDays) return [true', replace: 'if (days * 2 >= yearDays) return [true' },
  { ...offsets, name: 'zone gives $376 for every child', find: 'children < 2 ? 376 : 282', replace: 'children < 2 ? 376 : 376' },
  { ...offsets, name: 'overseas forces over the days in the year', find: 'BigInt(days) / 183n', replace: 'BigInt(days) / BigInt(yearDays)' },
  { ...offsets, name: 'zone ignores a remote area allowance', find: 'Math.max(0, full - allowance * 10)', replace: 'full' },
  { ...offsets, name: 'zone half shares of the relevant rebate amount', find: 'zone_a: [338, 5]', replace: 'zone_a: [338, 2]' },
  { ...medical, name: 'net medical income at the threshold takes the higher limit', find: 'tested > threshold * 100', replace: 'tested >= threshold * 100' },
  { ...medical, name: 'net medical family threshold rises for the first child', find: '1500 * Math.max(0, children - 1)', replace: '1500 * children' },
  { ...medical, name: 'net medical children do not make a family', find: 'spouse !== null || children > 0', replace: 'spouse !== null' },
  { ...medical, name: 'net medical leaves out the spouse’s income', find: 'own + (spouse ?? 0)', replace: 'own' },
  { ...medical, name: 'net medical takes 20% over the higher limit', find: 'BigInt(higherApplies ? 10 : 20)', replace: 'BigInt(20)' },
  { ...medical, name: 'net medical 2018-19 higher limit wrong', find: "['2018-19', [2377, 5609]]", replace: "['2018-19', [2377, 5604]]" },
  { ...medical, name: 'net medical truncates half cents', find: 'Number(ratioCents(BigInt(excess) * BigInt(higherApplies ? 10 : 20), 100n))', replace: 'Math.floor((excess * (higherApplies ? 10 : 20)) / 100)' },
  { ...medical, name: 'net medical 2019-20 refused without s 159P(1A)', find: 'Number(year.slice(0, 4)) >= 2019', replace: 'Number(year.slice(0, 4)) >= 2020' },
  { ...medical, name: 'net medical accepts an unknown field', find: 'if (unknown) refuse(', replace: 'if (false) refuse(' },
  { ...medical, name: 'net medical accepts fractional children', find: '!Number.isInteger(children) || children < 0', replace: 'children < 0' },
  { ...fito, name: 'FITO limit without the $1,000 floor', find: 'if (payable - payableAssumed > limit) limit = payable - payableAssumed;', replace: 'limit = payable - payableAssumed;' },
  { ...fito, name: 'FITO limit not raised by NANE tax', find: 'limit += nane * 1200n;', replace: '' },
  { ...fito, name: 'FITO leaves out the NANE tax', find: 'const before = (paid + nane) * 1200n;', replace: 'const before = paid * 1200n;' },
  { ...fito, name: 'FITO part-year threshold counts a month more', find: '(13464n * 12n + 4736n * BigInt(months)) * 100n', replace: '(13464n * 12n + 4736n * BigInt(months + 1)) * 100n' },
  { ...fito, name: 'FITO eligible pensioner gets the part-year threshold', find: 'if (pensioner === true)', replace: 'if (false)' },
  { ...fito, name: 'FITO assumed income below nil', find: 'taxable - income + deductions > 0n ?', replace: 'true ?' },
  { ...fito, name: 'FITO worked limit for 2023-24', find: "WORKED_YEARS = ['2024-25', '2025-26', '2026-27']", replace: "WORKED_YEARS = ['2023-24', '2024-25', '2025-26', '2026-27']" },
  { ...fito, name: 'FITO negative bands', find: 'if (ceiling > floor) tax +=', replace: 'tax +=' },
  { ...fito, name: 'FITO taxable income in cents accepted', find: 'if (taxable % 100n !== 0n)', replace: 'if (false)' },
  { ...fito, name: 'FITO last residency month not counted', find: 'm <= index(to); m++', replace: 'm < index(to); m++' },
  { ...conversion, name: 'conversion asset paid on the day held takes payment', find: "earlier: 'satisfied', strict: true", replace: "earlier: 'satisfied', strict: false" },
  { ...conversion, name: 'conversion ignores an earlier receipt', find: '(earlier < time || (earlier === time && !rule.strict))', replace: '(earlier === time && !rule.strict)' },
  { ...conversion, name: 'conversion average of exactly 12 months', find: 'to >= yearOn', replace: 'to > yearOn' },
  { ...conversion, name: 'conversion average need not contain the day', find: 'on < from || on > to', replace: 'on < from' },
  { ...conversion, name: 'conversion rate for another day accepted', find: 'if (day !== on)', replace: 'if (false)' },
  { ...conversion, name: 'conversion truncates to the cent', find: 'Number(ratioCents(amount * 10000n, rate))', replace: 'Number((amount * 10000n) / rate)' },
  { ...conversion, name: 'conversion amount with 5 decimal places', find: 'fraction.length <= places', replace: 'fraction.length <= places + 1' },
  { ...conversion, name: 'conversion accepts AUD', find: " || currency === 'AUD'", replace: '' },
  { ...conversion, name: 'conversion deductions totalled as income', find: "deduction: 'deductions'", replace: "deduction: 'ordinary_income'" },
  { ...minors, name: 'minors nil band $417', find: 'const NIL_BAND = 416;', replace: 'const NIL_BAND = 417;' },
  { ...minors, name: 'minors phase-in at 67%', find: 'const PHASE_IN = 66;', replace: 'const PHASE_IN = 67;' },
  { ...minors, name: 'minors special rate 47%', find: 'const SPECIAL_RATE = 45;', replace: 'const SPECIAL_RATE = 47;' },
  { ...minors, name: 'minors resident nil band exclusive', find: '(resident && !gt(eligible, nilBand))', replace: '(resident && gt(nilBand, eligible))' },
  { ...minors, name: 'minors phase-out rounds up', find: 'Math.floor(NIL_BAND', replace: 'Math.ceil(NIL_BAND' },
  { ...minors, name: 'minors foreign phase-out takes the resident formula', find: '(resident ? PHASE_IN : PHASE_IN - scale[0][1])', replace: '(PHASE_IN)' },
  { ...minors, name: 'minors cap ignores the top slice', find: 'min(atSpecial, max(floor, top))', replace: 'min(atSpecial, floor)' },
  { ...minors, name: 'minors second resident rate from the first band', find: 'residentScale[1][1]', replace: 'residentScale[0][1]' },
  { ...minors, name: 'minors apportions over taxable income alone', find: 'const base = taxableCents + apportionable;', replace: 'const base = taxableCents;' },
  { ...minors, name: 'minors leaves out related deductions', find: 'eligibleAssessable - exclusive - related', replace: 'eligibleAssessable - exclusive' },
  { ...minors, name: 'minors adult trust share eligible', find: '[excepted + trustExcepted + trustEligible, other]', replace: '[excepted + trustExcepted, other + trustEligible]' },
  { ...minors, name: 'minors ignores dependence on relatives', find: "holds: needsDependency ? !flag(dependent, 'dependent_on_relatives') : true", replace: 'holds: true' },
  { ...minors, name: 'minors full-time test ignores study', find: '&& occupationNext && !educationNext', replace: '&& occupationNext' },
  { ...minors, name: 'minors tests an adult’s ground', find: '  if (!under18) return null;\n', replace: '' },
  { ...minors, name: 'minors truncates half cents', find: '((n < 0n ? -n : n) * 2n + d) / (2n * d)', replace: '(n < 0n ? -n : n) / d' },
  { ...minors, name: 'minors total of rounded parts', find: 'total: toCents(add(taxOther, taxEligible))', replace: 'total: toCents(taxOther) + toCents(taxEligible)' },
  { ...minors, name: 'minors taxable income above assessable income', find: 'if (taxableCents > eligibleAssessable + exceptedTotal)', replace: 'if (false)' },
  { ...minors, name: 'minors takes 51 items', find: 'given.length <= MAX_ITEMS', replace: 'given.length <= MAX_ITEMS + 1' },
  { ...minors, name: 'minors trust part above the share', find: 'if (part > amount)', replace: 'if (false)' },
  { ...minors, name: 'minors foreign nil band at the phase-in rate', find: 'capped(mul(percent(secondRate), eligible))', replace: 'capped(mul(percent(PHASE_IN), eligible))' },
  { ...minors, name: 'minors taxable income in cents', find: 'if (taxableCents % 100n !== 0n)', replace: 'if (false)' },
  { ...nonCommercial, name: 'non-commercial income requirement at $250,000 met', find: 'requirementTotal < INCOME_REQUIREMENT', replace: 'requirementTotal <= INCOME_REQUIREMENT' },
  { ...nonCommercial, name: 'non-commercial assessable income test below $20,000', find: 'measured >= ASSESSABLE_INCOME', replace: 'measured > ASSESSABLE_INCOME' },
  { ...nonCommercial, name: 'non-commercial real property test below $500,000', find: 'realProperty >= REAL_PROPERTY', replace: 'realProperty > REAL_PROPERTY' },
  { ...nonCommercial, name: 'non-commercial other assets test below $100,000', find: 'otherAssets >= OTHER_ASSETS', replace: 'otherAssets > OTHER_ASSETS' },
  { ...nonCommercial, name: 'non-commercial profits test at 2 years', find: 'profitYears >= 3', replace: 'profitYears >= 2' },
  { ...nonCommercial, name: 'non-commercial this year not a profit year', find: 'earlierProfits + (deductions < income ? 1 : 0)', replace: 'earlierProfits' },
  { ...nonCommercial, name: 'non-commercial earlier break-even a profit year', find: "if (statedCents(fields, name, 'deductions') < income)", replace: "if (statedCents(fields, name, 'deductions') <= income)" },
  { ...nonCommercial, name: 'non-commercial exception at $40,000', find: 'money(input.other_income) < OTHER_INCOME', replace: 'money(input.other_income) <= OTHER_INCOME' },
  { ...nonCommercial, name: 'non-commercial exception for any activity', find: 'const exception = excepted && ', replace: 'const exception = ' },
  { ...nonCommercial, name: 'non-commercial losses not added back', find: 'taxable + losses - fhss', replace: 'taxable - fhss' },
  { ...nonCommercial, name: 'non-commercial FHSS amount kept', find: 'taxable + losses - fhss', replace: 'taxable + losses' },
  { ...nonCommercial, name: 'non-commercial taxable loss counted', find: 'withoutLosses < 0n ? 0n : withoutLosses', replace: 'withoutLosses' },
  { ...nonCommercial, name: 'non-commercial part-year estimate ignored', find: 'if (estimate > income) measured = estimate;', replace: '' },
  { ...nonCommercial, name: 'non-commercial brought forward left out', find: 'deductions + broughtForward - income', replace: 'deductions - income' },
  { ...nonCommercial, name: 'non-commercial exempt income not taken off', find: 'excess > exempt ? excess - exempt : 0n', replace: 'excess' },
  { ...nonCommercial, name: 'non-commercial rule ignores the income requirement', find: '!(requirementMet && Object.values(tests).some(Boolean))', replace: '!Object.values(tests).some(Boolean)' },
  { ...nonCommercial, name: 'non-commercial signed amount with 3 places', find: 'parts && parts.fraction.length <= 2 ? BigInt(parts.whole)', replace: 'parts && parts.fraction.length <= 3 ? BigInt(parts.whole)' },
  { ...nonCommercial, name: 'non-commercial signed amount loses its sign', find: 'return parts?.negative ? -size : size;', replace: 'return size;' },
  { ...nonCommercial, name: 'non-commercial 3 earlier years taken', find: 'given.length !== 4', replace: 'given.length > 4' },
  { ...nonCommercial, name: 'non-commercial estimate taken without a part year', find: 'if (!wanted && Object.hasOwn(input, key))', replace: 'if (false)' },
  { ...conversion, name: 'conversion NaN called invalid', find: 'if (text !== null && /^[+-]?s?nan', replace: 'if (false && /^[+-]?s?nan' },
  { ...conversion, name: 'conversion accepts a minus sign', find: '(parts?.negative && scaled > 0n) || (positive', replace: '(positive' },
  { ...conversion, name: 'conversion refuses surrounding spaces', find: 'given.length <= 32 ? given.trim() : null', replace: 'given.length <= 32 ? String(given) : null' },
  { ...estimate, name: 'foreign income tax offset before the zone offset', find: '  const applied = { beneficiary:', replace: '  left -= Math.min(left, cents(foreign?.offset ?? 0));\n  const applied = { beneficiary:' },
  { ...estimate, name: 'foreign income tax offset not taken off the levy', find: '[take(left), take(cents(base.medicare))]', replace: '[take(left), 0]' },
  { ...estimate, name: 'foreign income tax offset not taken off the surcharge', find: 'const fromSurcharge = take(cents(base.surcharge));', replace: 'const fromSurcharge = 0;' },
  { ...estimate, name: 'foreign income tax offset takes the levy below nil', find: 'const taken = Math.min(from, unusedForeign);', replace: 'const taken = unusedForeign;' },
  { ...estimate, name: 'worked FITO limit leaves out the surcharge', find: '(cents(base.medicare) + cents(base.surcharge))', replace: '(cents(base.medicare))' },
  { ...estimate, name: 'worked FITO limit for a foreign resident', find: "if (worked && r.residency !== 'resident')", replace: 'if (false)' },
  { ...money, test: individualTest, name: 'command amounts with 3 decimal places', find: 'fraction.length <= 2', replace: 'fraction.length <= 3' },
  { ...money, test: individualTest, name: 'command amounts accept a minus sign', find: '(parts?.negative && scaled > 0n)', replace: 'false' },
  { ...money, test: individualTest, name: 'command amounts accept a trailing point', find: 'pieces.every((piece) => digits.test(piece))', replace: "pieces.every((piece) => piece === '' || digits.test(piece))" },
  { ...money, test: individualTest, name: 'command amounts accept 2 points', find: 'pieces.length <= 2 && ', replace: '' },
  { ...money, test: individualTest, name: 'command amounts above $1e12', find: 'scaled > 10n ** 14n', replace: 'scaled > 10n ** 15n' },
  { ...money, test: individualTest, name: 'command amounts unreadable called invalid', find: 'if (!parts && !/^', replace: 'if (false && !/^' },
  { ...estimate, name: 'private health insurance offset not refunded', find: "\n    - cents(privateHealth?.offset ?? 0);", replace: ';' },
  { ...estimate, name: 'beneficiary offset after the low income tax offset', find: 'beneficiary: apply(benefit?.offset ?? 0), offset: apply(base.offset)', replace: 'offset: apply(base.offset), beneficiary: apply(benefit?.offset ?? 0)' },
  { ...estimate, name: 'zone offset leaves out the invalid carer offset', find: 'invalid_carer_tax_offset: carer ? carer.offset.toFixed(2) : undefined', replace: 'invalid_carer_tax_offset: undefined' },
  { ...incomeTax, name: '2026-27 starts at 16%', find: "'2026-27': [[18200, 15]", replace: "'2026-27': [[18200, 16]" },
  { ...incomeTax, name: 'foreign residents reach 37% at $120,000', find: '[[0, 30], [135000, 37]', replace: '[[0, 30], [120000, 37]' },
  { ...incomeTax, name: 'working holiday makers reach 30% at $37,000', find: '[[0, 15], [45000, 30]', replace: '[[0, 15], [37000, 30]' },
  { ...incomeTax, name: 'the offset tapers at 4%', find: '(income - 37500) * 50', replace: '(income - 37500) * 40' },
  { ...incomeTax, name: 'the offset rounds half a cent down', find: 'Math.floor((tenths + 5) / 10)', replace: 'Math.floor(tenths / 10)' },
  { ...incomeTax, name: 'the offset can exceed the tax', find: 'Math.min(tax, halfUp(lowIncomeOffset(income)))', replace: 'halfUp(lowIncomeOffset(income))' },
  { ...incomeTax, name: 'the Medicare shade-in takes the greater', find: 'Math.min(income * 2, (income - threshold) * 10)', replace: 'Math.max(income * 2, (income - threshold) * 10)' },
  { ...incomeTax, name: 'foreign residents pay the Medicare levy', find: 'const medicare = resident ?', replace: 'const medicare = true ?' },
  { ...incomeTax, name: '2024-25 takes the 2025-26 Medicare thresholds', find: "'2024-25': [27222, 34027]", replace: "'2024-25': [28011, 35013]" },
  { ...studyLoan, name: 'the upper marginal rate is 16%', find: 'Math.max(0, income - top) * 17', replace: 'Math.max(0, income - top) * 16' },
  { ...studyLoan, name: 'the repayment takes the greater amount', find: 'tenth < marginal ?', replace: 'tenth > marginal ?' },
  { ...studyLoan, name: '2024-25 takes the first band', find: 'income >= from).at(-1)', replace: 'income >= from).at(0)' },
  { ...studyLoan, name: 'the minimum repayment income itself repays', find: 'if (income <= table.minimum)', replace: 'if (income < table.minimum)' },
  { ...studyLoan, name: 'repayment income leaves out super contributions', find: "const PARTS = ['taxable', 'fringe', 'losses', 'super', 'foreign'];", replace: "const PARTS = ['taxable', 'fringe', 'losses', 'foreign'];" },
  { ...takeHome, name: 'super guarantee ignores the base', find: 'Math.min(entered, capCents) * tenths', replace: 'entered * tenths' },
  { ...takeHome, name: 'a package’s super is the rate of the package', find: 'nearest(entered * tenths, 1000 + tenths)', replace: 'nearest(entered * tenths, 1000)' },
  { ...takeHome, name: 'the study loan is left out', find: 'const loan = pay.studyLoan', replace: 'const loan = false' },
  { ...takeHome, name: 'no standard deduction', find: 'Math.min(100000, paid) : 0', replace: '0 : 0' },
  { ...takeHome, name: 'the standard deduction drops the salary’s cents', find: 'Math.min(100000, paid) : 0', replace: 'Math.min(100000, paid - (paid % 100)) : 0' },
  { ...takeHome, name: 'the standard deduction for foreign residents too', find: 'pay.year >= STANDARD_DEDUCTION_FROM && resident', replace: 'pay.year >= STANDARD_DEDUCTION_FROM' },
  { ...takeHome, name: 'a fortnight is a 24th', find: 'nearest(net, 26)', replace: 'nearest(net, 24)' },
  { ...takeHome, name: '2024-25 super guarantee is 12%', find: "'2024-25': { rate: 11.5", replace: "'2024-25': { rate: 12" },
  { ...incomeTax, name: '2023-24 reaches 37% at $135,000', find: "'2023-24': [[18200, 19], [45000, 32.5], [120000, 37]", replace: "'2023-24': [[18200, 19], [45000, 32.5], [135000, 37]" },
  { ...incomeTax, name: 'foreign residents before 2024-25 start at 30%', find: '[[0, 32.5], [120000, 37]', replace: '[[0, 30], [120000, 37]' },
  { ...incomeTax, name: 'the $420 also for 2020-21', find: "year === '2021-22' && income !== 126000", replace: 'income !== 126000' },
  { ...incomeTax, name: 'the $420 at $126,000 too', find: '&& income !== 126000 ? 420000', replace: '? 420000' },
  { ...incomeTax, name: 'the middle income offset tapers at 2%', find: '(income - 90000) * 30', replace: '(income - 90000) * 20' },
  { ...incomeTax, name: 'the middle income offset can exceed the tax left', find: 'Math.min(tax - offset, halfUp(lowAndMiddleIncomeOffset(income, year)))', replace: 'halfUp(lowAndMiddleIncomeOffset(income, year))' },
  { ...incomeTax, name: 'the surcharge leaves out reportable fringe benefits', find: '(s.taxable + s.fringe) * hundredths', replace: 's.taxable * hundredths' },
  { ...incomeTax, name: 'surcharge income leaves out super contributions', find: 'const income = s.taxable + s.fringe + s.super + s.losses;', replace: 'const income = s.taxable + s.fringe + s.losses;' },
  { ...incomeTax, name: 'the first child raises the family threshold', find: '1500 * Math.max(0, s.children - 1)', replace: '1500 * s.children' },
  { ...incomeTax, name: 'a spouse on a low income pays the surcharge', find: '(s.spouse === null || income > MEDICARE_THRESHOLDS[s.year][0])', replace: 'true' },
  { ...incomeTax, name: 'tier 2 is 1.5%', find: 'tested > second ? 125', replace: 'tested > second ? 150' },
  { ...incomeTax, name: 'the surcharge threshold itself is liable', find: 'tested > first &&', replace: 'tested >= first &&' },
  { ...incomeTax, name: 'no leap years', find: 'end % 4 === 0 &&', replace: 'false &&' },
  { ...withholding, name: 'weekly earnings leave out the 99 cents', find: 'return dollars * 100 + 99;', replace: 'return dollars * 100;' },
  { ...withholding, name: 'a month is 4 weeks', find: 'Math.floor((monthly * 3) / 1300)', replace: 'Math.floor(monthly / 400)' },
  { ...withholding, name: 'a month ending in 33 cents gains nothing', find: 'earnings % 100 === 33 ?', replace: 'false ?' },
  { ...withholding, name: 'withholding rounds down', find: '(millionths + 500000) / 1000000', replace: 'millionths / 1000000' },
  { ...withholding, name: 'a monthly amount is cut, not rounded', find: 'Math.floor((2 * amount * 13 + 3) / 6)', replace: 'Math.floor((amount * 13) / 3)' },
  { ...withholding, name: 'scale 2 at 19% from $721', find: '[865, 1790, 608377]', replace: '[865, 1900, 608377]' },
  { ...withholding, name: 'the study loan component at 17% from the start', find: '[2494, 1500, 2005615]', replace: '[2494, 1700, 2005615]' },
  { ...withholding, name: '2021-22 to 2023-24 on the 2024 coefficients', find: "'2023-24': FROM_OCTOBER_2020, '2022-23': FROM_OCTOBER_2020, '2021-22': FROM_OCTOBER_2020,", replace: "'2023-24': FROM_JULY_2024, '2022-23': FROM_JULY_2024, '2021-22': FROM_JULY_2024," },
  { ...withholding, name: 'scale 3 from October 2020 at 37% to the top', find: '[3461, 3700, 1038462], [0, 4500, 3807692]', replace: '[3461, 3700, 1038462], [0, 3700, 1038462]' },
  { ...withholding, name: 'scale 2 from July 2024 at 26% from $500', find: '[625, 2600, 1078462], [721, 1800, 578462]', replace: '[625, 2600, 1078462], [721, 2600, 1078462]' },
  { ...withholding, name: 'a percentage band one row late', find: '(a, band) => [firsts[band] ?? 0, a, 0]', replace: '(a, band) => [firsts[band + 1] ?? 0, a, 0]' },
  { ...withholding, name: 'the 2% band at 2.5%', find: 'const COMPONENT_RATES = [0, 100, 200, 250,', replace: 'const COMPONENT_RATES = [0, 100, 250, 250,' },
  { ...withholding, name: '2025-26 on the percentage Schedule 8 all year', find: "'2025-26': [[1288, 0, 0], [2403, 1500, 1932692], [3447, 1700, 2413462], [0, 1000, 0]],", replace: "'2025-26': EARLY_2025_26," },
  { ...withholding, name: '2023-24 study loan bands on 2022-23 thresholds', find: "'2023-24': percentBands([991,", replace: "'2023-24': percentBands([930," },
  { ...withholding, name: 'the earlier 2025-26 component goes to every year', find: "earlierStudyLoan: year === '2025-26' ? component(EARLY_2025_26) : null", replace: 'earlierStudyLoan: component(EARLY_2025_26)' },
  { ...withholding, name: 'the earlier 2025-26 component without a loan', find: '(studyLoan ? forPeriod(weekly(bands, x), period) : 0)', replace: 'forPeriod(weekly(bands, x), period)' },
  { ...withholding, name: 'an unknown year falls through', find: "if (!Object.hasOwn(SCHEDULE_1, year)) throw", replace: "if (false) throw" },
  { ...takeHome, name: 'super guarantee on the salary after the sacrifice', find: 'Math.min(entered, capCents) * tenths', replace: 'Math.min(entered - amountCents(pay.sacrifice) * pays, capCents) * tenths' },
  { ...takeHome, name: 'the sacrifice is not reportable', find: 'const reported = Math.floor(sacrifice / 100);', replace: 'const reported = 0;' },
  { ...takeHome, name: 'the sacrifice stays taxable', find: 'const paid = salary - sacrifice;', replace: 'const paid = salary;' },
  { ...takeHome, name: 'the cap is a dollar higher', find: 'CONCESSIONAL_CAP[pay.year] * 100', replace: '(CONCESSIONAL_CAP[pay.year] + 1) * 100' },
  { ...takeHome, name: 'Division 293 from $300,000', find: '25000000', replace: '30000000' },
  { ...takeHome, name: 'no withholding for a working holiday maker is dropped', find: "if (pay.residency !== 'working-holiday' && pay.period !== 'year')", replace: "if (pay.period !== 'year')" },
  { ...takeHome, name: 'withholding under the 2026-27 schedules every year', find: 'resident ? 2 : 3, pay.studyLoan, pay.year);', replace: "resident ? 2 : 3, pay.studyLoan, '2026-27');" },
  { ...takeHome, name: 'withholding on the salary before the sacrifice', find: 'const earnings = nearest(paid, pays);', replace: 'const earnings = nearest(salary, pays);' },
  { ...takeHome, name: 'no cover all year costs nothing', find: 'pay.hospitalCover ? 0 : daysInYear(pay.year)', replace: 'pay.hospitalCover ? 0 : 0' },
  { ...estimate, name: 'a refund reads as an amount owing', find: '(withheld - total) / 100', replace: '(total - withheld) / 100' },
  { ...estimate, name: 'foreign residents pay the surcharge', find: "r.residency === 'resident' ? days : 0", replace: 'days' },
  { ...estimate, name: 'the study loan is left out of the total', find: 'cents(loan?.repayment ?? 0)', replace: '0' },
  { ...projection, name: 'super projection pays the employer rate on salary above the base', find: 'y.salary < y.base ? y.salary : y.base', replace: 'y.salary' },
  { ...projection, name: 'super projection takes no contributions tax', find: 'concessional - share(concessional, CONTRIBUTIONS_TAX) + y.afterTax', replace: 'concessional + y.afterTax' },
  { ...projection, name: 'super projection taxes after-tax contributions', find: 'concessional - share(concessional, CONTRIBUTIONS_TAX) + y.afterTax', replace: 'concessional + y.afterTax - share(concessional + y.afterTax, CONTRIBUTIONS_TAX)' },
  { ...projection, name: 'super projection earns a full year on the year’s flows', find: 'const twiceAverage = 2n * balance + flow > 0n ? 2n * balance + flow : 0n;', replace: 'const twiceAverage = 2n * (balance + flow) > 0n ? 2n * (balance + flow) : 0n;' },
  { ...projection, name: 'super projection gives no deduction for fees', find: 'const net = fees - share(fees, CONTRIBUTIONS_TAX);', replace: 'const net = fees;' },
  { ...projection, name: 'super projection lets fees overdraw the account', find: 'const taken = net < available ? net : available;', replace: 'const taken = net;' },
  { ...projection, name: 'super projection grows the flows from the first year', find: 'if (year) y =', replace: 'y =' },
  { ...projection, name: 'super projection discounts one year too few', find: 'const years = BigInt(retire - age);', replace: 'const years = BigInt(retire - age - 1);' },
  { ...projection, name: 'super projection allows retirement before 60', find: 'const PRESERVATION_AGE = 60;', replace: 'const PRESERVATION_AGE = 55;' },
  { ...projection, name: 'super projection accepts concessional contributions over the cap', find: 'if (first.concessional > BigInt', replace: 'if (false && first.concessional > BigInt' },
  { ...projection, name: 'super projection leaves the percentage fee out', find: 'const fees = y.fee + y.insurance + percentFee;', replace: 'const fees = y.fee + y.insurance;' },
  { ...packaging, name: 'salary packaging puts meal entertainment in the other type', find: 'grossUp(typeOne + (p.mealsTypeOne ? meals : 0), TYPE_1)', replace: 'grossUp(typeOne + (p.mealsTypeOne ? 0 : meals), TYPE_1)' },
  { ...packaging, name: 'salary packaging grosses Type 2 benefits up at the Type 1 rate', find: 'typeTwo: grossUp(typeTwo + (p.mealsTypeOne ? 0 : meals), TYPE_2)', replace: 'typeTwo: grossUp(typeTwo + (p.mealsTypeOne ? 0 : meals), TYPE_1)' },
  { ...packaging, name: 'salary packaging rounds the gross-up down', find: '+ 1000000n) / 2000000n', replace: ') / 2000000n' },
  { ...packaging, name: 'salary packaging gives a charity the hospital cap', find: 'charity: 30000, hospital: 17000', replace: 'charity: 17000, hospital: 17000' },
  { ...packaging, name: 'salary packaging allows no meal entertainment over the cap', find: 'const excess = overCap - mealAllowance;', replace: 'const excess = overCap;' },
  { ...packaging, name: 'salary packaging allows meal entertainment beyond $5,000', find: 'Math.min(MEAL_ALLOWANCE, grossed.meals, overCap)', replace: 'Math.min(grossed.meals, overCap)' },
  { ...packaging, name: 'salary packaging taxes the excess at 45%', find: 'const fbt = excess * 47;', replace: 'const fbt = excess * 45;' },
  { ...packaging, name: 'salary packaging reports benefits of exactly $2,000', find: 'packaged > REPORTING_THRESHOLD', replace: 'packaged >= REPORTING_THRESHOLD' },
  { ...packaging, name: 'salary packaging reports the taxable value without the gross-up', find: 'Math.floor(packaged / 53)', replace: 'Math.floor(packaged / 100)' },
  { ...packaging, name: 'salary packaging leaves the reportable amount out of the tax', find: 'owed(p, salary - packaged, reportable)', replace: 'owed(p, salary - packaged, 0)' },
  { ...packaging, name: 'salary packaging takes the standard deduction before 2026-27', find: 'p.year >= STANDARD_DEDUCTION_FROM && ', replace: '' },
  { ...lease, name: 'novated lease exempts a petrol car', find: "if (n.kind === 'other') return", replace: 'if (false) return' },
  { ...lease, name: 'novated lease exempts a plug-in hybrid without a commitment', find: '&& !n.commitment) {', replace: '&& false) {' },
  { ...lease, name: 'novated lease takes a plug-in hybrid commitment with a sale after 2024-25', find: "n.saleYear > '2024-25'", replace: "n.saleYear > '2026-27'" },
  { ...lease, name: 'novated lease exempts a car first used before 1 July 2022', find: "if (n.firstUsed < '2022-07-01') return", replace: 'if (false) return' },
  { ...lease, name: 'novated lease finds luxury car tax payable at the threshold', find: 'price > FUEL_EFFICIENT_THRESHOLD[n.saleYear] * 100', replace: 'price >= FUEL_EFFICIENT_THRESHOLD[n.saleYear] * 100' },
  { ...lease, name: 'novated lease ignores luxury car tax at another supply or importation', find: 'if (!firstSaleTaxed && !n.otherSupply) return null;', replace: 'if (!firstSaleTaxed) return null;' },
  { ...lease, name: 'novated lease takes the income year’s luxury car tax threshold', find: 'FUEL_EFFICIENT_THRESHOLD[n.saleYear] * 100;', replace: 'FUEL_EFFICIENT_THRESHOLD[n.year] * 100;' },
  { ...lease, name: 'novated lease refuses an exemption when luxury car tax is first payable after every benefit', find: "if (n.lctTiming === 'after-all') return null;", replace: "if (n.lctTiming === 'after-all') return firstSaleReason;" },
  { ...lease, name: 'novated lease accepts mixed luxury car tax timing', find: "if (n.lctTiming !== 'before-all') {", replace: 'if (false) {' },
  { ...lease, name: 'novated lease ignores the reduction after 4 years', find: '(n.reduced ? 2n : 3n)', replace: '3n' },
  { ...lease, name: 'novated lease counts every day of the year', find: '* BigInt(days), 300n', replace: '* BigInt(yearDays), 300n' },
  { ...lease, name: 'novated lease takes no GST credit on the costs', find: 'ratioCents(BigInt(gstCosts) * 10n, 11n)', replace: 'BigInt(gstCosts)' },
  { ...lease, name: 'novated lease charges no GST on the contribution', find: 'ratioCents(BigInt(taxableValue) * 10n, 11n)', replace: 'BigInt(taxableValue)' },
  { ...lease, name: 'novated lease reports nothing for an exempt car', find: 'taxableValue > 200000 ? Math.floor(taxableValue / 53) : 0', replace: '0' },
  { ...lease, name: 'novated lease saving leaves out the after-tax contribution', find: '- pre - post + costs', replace: '- pre + costs' },
  { ...bonus, name: 'Schedule 5 limits withholding to 45%', find: '(additional * 47) / 100)) / 100);', replace: '(additional * 45) / 100)) / 100);' },
  { ...bonus, name: 'Schedule 5 limit leaves out the study loan component', find: 'limited(step7.total * 100, additional)', replace: 'limited(step7.tax * 100, additional)' },
  { ...bonus, name: 'Schedule 5 Method A keeps the earnings’ cents', find: 'const step1 = dollarsOnly(earnings);', replace: 'const step1 = earnings;' },
  { ...bonus, name: 'Schedule 5 Method A keeps the share’s cents', find: 'const step3 = dollarsOnly(additional / spread);', replace: 'const step3 = Math.round(additional / spread);' },
  { ...bonus, name: 'Schedule 5 Method A always spreads over the year', find: 'step7 = extra(step5, step2, spread);', replace: 'step7 = extra(step5, step2, pays);' },
  { ...bonus, name: 'Schedule 5 B(i) keeps a negative result', find: 'Math.max(0, each * backPays) / 100', replace: '(each * backPays) / 100' },
  { ...bonus, name: 'Schedule 5 B(i) ignores what was withheld before', find: 'recalculated.total * 100 - cents(b.backWithheld)', replace: 'recalculated.total * 100' },
  { ...bonus, name: 'Schedule 5 B(ii) averages without this pay’s B(i) back payment', find: 'dollarsOnly((toDate + backPayment) / paysToDate)', replace: 'dollarsOnly(toDate / paysToDate)' },
  { ...bonus, name: 'Schedule 5 B(ii) leaves out earlier B(ii) payments', find: 'dollarsOnly((cents(b.earlierAdditional) + additional) / pays)', replace: 'dollarsOnly(additional / pays)' },
  { ...bonus, name: 'Schedule 5 B(ii) keeps what earlier B(ii) payments withheld', find: 'step7.total * 100 - cents(b.earlierWithheld)', replace: 'step7.total * 100' },
  { ...bonus, name: 'Schedule 5 Method A year tax ignores the payment', find: 'owed(year + additional) - owed(year)', replace: 'owed(year) - owed(year)' },
  { ...d293, name: 'Division 293 taxes the excess contributions too', find: 'const low = concessional - excess;', replace: 'const low = concessional;' },
  { ...d293, name: 'Division 293 carries unused cap forward whatever the balance', find: 'd.balanceUnder ? Math.min(unused, overCap) : 0', replace: 'Math.min(unused, overCap)' },
  { ...d293, name: 'Division 293 carries forward more than the excess', find: 'Math.min(unused, overCap)', replace: 'unused' },
  { ...d293, name: 'Division 293 counts the FHSS released amount', find: 'Math.max(0, taxable - fhss)', replace: 'taxable' },
  { ...d293, name: 'Division 293 leaves out family trust distribution tax income', find: 'base + trust + ', replace: 'base + ' },
  { ...d293, name: 'Division 293 counts a zero-rate lump sum', find: 'losses - lumpSum;', replace: 'losses;' },
  { ...d293, name: 'Division 293 takes a zero-rate lump sum after 2023-24', find: "year >= '2024-25'", replace: "year >= '2027-28'" },
  { ...d293, name: 'Division 293 tax rounds down', find: 'Math.round((taxable * 15) / 100)', replace: 'Math.floor((taxable * 15) / 100)' },
  { ...d293, name: 'Division 293 accepts a defined benefit interest', find: "if (d.interests !== 'accumulation') {", replace: 'if (false) {' },
  { ...soleTrader, name: 'the small business offset is 13%', find: 'const OFFSET_RATE = 16;', replace: 'const OFFSET_RATE = 13;' },
  { ...soleTrader, name: 'the small business offset has no $1,000 cap', find: 'Math.min(share, OFFSET_CAP, tax - offset - lmito)', replace: 'Math.min(share, tax - offset - lmito)' },
  { ...soleTrader, name: 'the small business offset can take the tax below nil', find: 'Math.min(share, OFFSET_CAP, tax - offset - lmito)', replace: 'Math.min(share, OFFSET_CAP)' },
  { ...soleTrader, name: 'the offset’s share is not capped at taxable income', find: 'Math.min(business, taxable) * tax', replace: 'business * tax' },
  { ...soleTrader, name: 'the offset is 16% of the whole tax', find: 'Math.min(business, taxable) * tax', replace: 'taxable * tax' },
  { ...soleTrader, name: 'the standard deduction also takes the profit', find: 'Math.min(100000, wages) : 0', replace: 'Math.min(100000, wages + profit) : 0' },
  { ...soleTrader, name: 'the tax on the wages alone is not taken off', find: 'const businessTax = all.total - alone.total;', replace: 'const businessTax = all.total;' },
  { ...soleTrader, name: 'the wages alone keep the other deductions off', find: 'Math.max(0, wages - deduction - deductions)', replace: 'Math.max(0, wages - deduction)' },
  { ...soleTrader, name: 'GST is an eleventh of the GST-exclusive income', find: 'const GST_TENTHS = 10;', replace: 'const GST_TENTHS = 11;' },
  { ...soleTrader, name: 'GST credits are not taken off', find: 'const gst = gstOnIncome - credits;', replace: 'const gst = gstOnIncome;' },
  { ...soleTrader, name: 'the invoice share leaves the GST out of the invoices', find: 'const invoiced = income + gstOnIncome;', replace: 'const invoiced = income;' },
  { ...soleTrader, name: 'a quarter is a third', find: 'nearest(setAside, 4)', replace: 'nearest(setAside, 3)' },
  { ...soleTrader, name: 'GST registration at more than $75,000 only', find: 'income >= GST_THRESHOLD', replace: 'income > GST_THRESHOLD' },
  { ...soleTrader, name: 'PAYG instalment entry at more than $4,000 only', find: 'income >= INSTALMENT_INCOME', replace: 'income > INSTALMENT_INCOME' },
  { ...soleTrader, name: 'the surcharge is left out', find: 'const surcharge = hospitalCover ? 0 :', replace: 'const surcharge = true ? 0 :' },
  { ...soleTrader, name: 'super contributions are left out of repayment and surcharge income', find: 'const reported = Math.floor(contributions / 100);', replace: 'const reported = 0;' },
  { ...soleTrader, name: 'the wages alone report contributions they cannot absorb', find: 'Math.floor(aloneContributions / 100));', replace: 'reported);' },
  { ...soleTrader, name: 'a business loss is worked', find: 'if (expenses > income) {', replace: 'if (false) {' },
  { ...div7a, name: 'Division 7A schedule counts the remaining term from the year made', find: 'const remainingTerm = term - k + 1;', replace: 'const remainingTerm = term - k + 2;' },
  { ...div7a, name: 'Division 7A schedule drops unpaid interest from the loan', find: 'const principal = repayment - interest;', replace: 'const principal = repayment > interest ? repayment - interest : 0n;' },
  { ...div7a, name: 'Division 7A schedule runs on past a shortfall', find: 'if (shortfall > 0n || opening === 0n) break;', replace: 'if (opening === 0n) break;' },
  { ...div7a, name: 'Division 7A schedule finds a shortfall only below the interest', find: 'repayment < minimum ?', replace: 'repayment < interest ?' },
  { ...div7a, name: 'Division 7A schedule ignores the assumed rate', find: 'PUBLISHED.get(label) ?? assumed', replace: 'PUBLISHED.get(label) ?? 877n' },
  { ...div7a, name: 'Division 7A schedule puts a loan made on 30 June in the next year', find: "made.slice(5) >= '07-01'", replace: "made.slice(5) >= '06-30'" },
  { ...div7a, name: 'Division 7A schedule works a loan made on 3 December 1997', find: "made < '1997-12-04'", replace: "made < '1997-12-03'" },
  { ...div7a, name: 'Division 7A schedule accepts a repayment above the balance and interest', find: 'repayment > opening + interest', replace: 'repayment > opening + interest + 1n' },
  { ...div7a, name: 'Division 7A schedule ignores repayments after the loan is repaid', find: 'if (opening === 0n && entered.length > years.length)', replace: 'if (false)' },
  { ...div7a, name: 'Division 7A interest ignores a 30 June repayment', find: 'ratioCents(opening * rate * (days - 1n), 10000n * days) + ratioCents(after * rate, 10000n * days)', replace: 'ratioCents(opening * rate, 10000n)' },
  { ...div7a, name: 'Division 7A interest divides a leap year by 365', find: 'getUTCDate() === 29 ? 366 : 365', replace: 'getUTCDate() === 29 ? 365 : 365' },
  { ...div7a, name: 'Division 7A schedule takes a loan repaid in full as a shortfall', find: 'principal < opening && repayment < minimum', replace: 'repayment < minimum' },
  { ...div7a, name: 'a funding dividend rounds to the nearest cent', find: '+ 10000n - marginal - 1n) /', replace: '+ (10000n - marginal) / 2n) /' },
  { ...div7a, name: 'a franked funding dividend ignores the corporate rate', find: 'repayment * (10000n - corporate)', replace: 'repayment * 10000n' },
  { ...vehicle, name: 'a 1 tonne load is still a car', find: 'motor && load < 1000 && seats < 9', replace: 'motor && load <= 1000 && seats < 9' },
  { ...vehicle, name: '9 seats are still a car', find: 'motor && load < 1000 && seats < 9', replace: 'motor && load < 1000 && seats <= 9' },
  { ...vehicle, name: 'an LCT car carries under 1 tonne, not 2', find: 'motor && load < 2000', replace: 'motor && load < 1000' },
  { ...vehicle, name: 'a motor cycle is a car', find: "vehicle.body !== 'motorcycle'", replace: 'true' },
  { ...vehicle, name: 'a seat weighs 75 kg', find: 'const SEAT_KG = 68;', replace: 'const SEAT_KG = 75;' },
  { ...vehicle, name: 'a dual cab whose passengers equal the load left carries passengers', find: 'seats * SEAT_KG > load - seats * SEAT_KG', replace: 'seats * SEAT_KG >= load - seats * SEAT_KG' },
  { ...vehicle, name: 'LCTD 2023/1 accepts passengers at half the load', find: '2 * seats * SEAT_KG < load', replace: '2 * seats * SEAT_KG <= load' },
  { ...vehicle, name: 'a van is left undecided for LCT and the GST credit cap',find: "if (body === 'van') return 'commercial';", replace: '' },
  { ...vehicle, name: 'a single cab ute or panel van is a goods body for the car limit', find: "return body === 'passenger' ? true : null;", replace: "return body === 'passenger';" },
  { ...vehicle, name: 'a single cab ute is not a utility truck for FBT', find: "['single-cab', 'van'].includes(vehicle.body) ? '8(2)(a)(i)'", replace: "['van'].includes(vehicle.body) ? '8(2)(a)(i)'" },
  { ...vehicle, name: 'a stated payload is not checked against the mass and kerb weight', find: 'gvm - kerb !== payload', replace: 'false' },
  { ...vehicle, name: 'a modified vehicle without its figures is classified', find: "if (vehicle.modified === 'unplated') {", replace: 'if (false) {' },
  { ...vehicle, name: 'the GST credit cap is ignored', find: 'capApplies && exceeds ? cap', replace: 'false ? cap' },
  { ...vehicle, name: 'the GST credit cap is 1/11 of the price', find: 'ratioCents(BigInt(limit), 11n)', replace: 'ratioCents(BigInt(price), 11n)' },
  { ...vehicle, name: 'a van or ute the ATO will not review is free of the GST credit cap', find: "design === 'passengers' ? true : null", replace: "design === 'passengers' ? true : design === 'undetermined' ? null : false" },
  { ...vehicle, name: 'a dual cab takes the car limit from MT 2024', find: "const carLimit = !car ? false : vehicle.body === 'passenger' ? true : null;", replace: 'const carLimit = !car ? false : passengers;' },
  { ...vehicle, name: 'accessories fitted at supply are ignored for LCT', find: 'luxuryDesign(vehicle.body, load - accessories, seats)', replace: 'luxuryDesign(vehicle.body, load, seats)' },
  { ...vehicle, name: 'accessories as heavy as the load are accepted', find: 'if (accessories >= load) throw', replace: 'if (accessories > load) throw' },
  { ...vehicle, name: 'the car limit applies before the GST credit', find: 'Math.min(net, limit)', replace: 'Math.min(price, limit) - Number(credit)' },
  { ...vehicle, name: 'an undecided car limit hides the cost within it', find: ': net <= limit ? net : null;', replace: ': null;' },
  { ...vehicle, name: 'an undecided car limit gives a cost above it', find: 'net <= limit ? net', replace: 'true ? net' },
  { ...vehicle, name: 'a price at the LCT threshold is a luxury car', find: 'price <= threshold ?', replace: 'price < threshold ?' },
  { ...vehicle, name: 'the LCT thresholds are swapped', find: "vehicle.fuel === 'efficient' ? year.fuelEfficientThreshold", replace: "vehicle.fuel === 'other' ? year.fuelEfficientThreshold" },
  { ...vehicle, name: 'an undecided LCT design still gives a GST credit over the car limit', find: 'capApplies === null && exceeds ? null', replace: 'false ? null' },
  { ...vehicle, name: 'a stated use beyond the exemption still exempts', find: "vehicle.use === 'limited'", replace: 'true' },
  { ...landTax, name: 'a land tax band starts a dollar above its first value', find: 'dollars >= Number(from)', replace: 'dollars > Number(from)' },
  { ...landTax, name: 'land tax ignores part of $100', find: '(excess + 99n) / 100n * parts', replace: 'excess / 100n * parts' },
  { ...landTax, name: 'the ACT fixed charge is left out', find: 'cents(base) + cents(fixed)', replace: 'cents(base)' },
  { ...landTax, name: 'land tax takes the rate on the whole value', find: 'BigInt(dollars) - BigInt(over)', replace: 'BigInt(dollars)' },
  { ...landTax, name: 'a land tax rate may start above its band', find: 'Number(over) <= Number(from)', replace: 'true' },
  { ...landTax, name: 'a broken land tax table is used', find: 'if (!usable) throw', replace: 'if (false) throw' },
  { ...landTax, name: 'land tax rates lose their third and fourth decimal places', find: 'number(rate, { max: 100, places: 4 }) * 10000', replace: 'number(rate, { max: 100, places: 4 }) * 100' },
  { ...landTax, name: 'trust rates are ignored', find: 'trust ? place.trustScale :', replace: 'false ? place.trustScale :' },
  { ...landTax, name: 'Queensland absentee rates are ignored', find: '(foreign && place.absenteeScale) || ', replace: '' },
  { ...landTax, name: 'Victorian absentee trust is not refused', find: "if (trust && foreign && place.absenteeTrust === 'unsupported') {", replace: 'if (false) {' },
  { ...landTax, name: 'South Australia land tax under $20 is not nil', find: "if (place.payable === 'nil-below-20' && landAmount < 2000n) landAmount = 0n;", replace: '' },
  { ...landTax, name: 'Tasmania s 7 rounds 5 cents up instead of down', find: 'rest > 5n * den', replace: 'rest >= 5n * den' },
  { ...landTax, name: 'Tasmania surcharge value above taxable value is allowed', find: "if (place.payable === 'ten-cents' && base > dollars) {", replace: 'if (false) {' },
  { ...landTax, name: 'Tasmania unsettled s 7 sum rounding is allowed', find: 'if (landAmount + surcharge !== together) {', replace: 'if (false) {' },
  { ...landTax, name: 'a separate surcharge applies to the land tax value', find: "place.surchargeBase === 'separate'", replace: 'false' },
  { ...landTax, name: 'MRIT is left out of the land tax total', find: 'landAmount + surcharge + mrit', replace: 'landAmount + surcharge' },
  { ...landTax, name: 'the surcharge is left out of the land tax total', find: 'landAmount + surcharge + mrit', replace: 'landAmount + mrit' },
  { ...landTax, name: 'trust rates are taken where a jurisdiction has none', find: 'if (trust && !place.trustScale) throw', replace: 'if (false) throw' },
  { ...landTax, name: 'MRIT is taken outside Western Australia', find: 'if (metro && !place.mrit) throw', replace: 'if (false) throw' },
  { ...payroll, name: 'payroll tax apportions by truncating', find: 'ratioCents(own * n, all * d)', replace: '((own * n) / (all * d))' },
  { ...payroll, name: 'payroll tax taxes the deduction instead of the wages above it', find: 'const size = tn * fd - fn * td;', replace: 'const size = fn * td;' },
  { ...payroll, name: 'payroll tax deductions never taper', find: 'return [above(lawCents(threshold) * per, above(australian, lawCents(threshold))), per];', replace: 'return [lawCents(threshold) * per, per];' },
  { ...payroll, name: 'payroll tax rate bands include their lower edge', find: 'australian > lawCents(over) ? rate : found', replace: 'australian >= lawCents(over) ? rate : found' },
  { ...payroll, name: 'payroll tax WA taper is the upper threshold over the band', find: 'above(a, threshold) * threshold), upper - threshold]', replace: 'above(a, threshold) * upper), upper - threshold]' },
  { ...payroll, name: 'payroll tax SA rate is never phased in', find: 'a > full ? [n, d] : [above(a, threshold) * n, (full - threshold) * d]', replace: '[n, d]' },
  { ...payroll, name: 'payroll tax SA rate is negative below the threshold', find: '[above(a, threshold) * n,', replace: '[(a - threshold) * n,' },
  { ...payroll, name: 'payroll tax Tasmania charges the higher rate throughout', find: 'rate: percent(lower)', replace: 'rate: percent(upper)' },
  { ...payroll, name: 'payroll tax Victoria never phases out the deduction', find: 'above(australian, lawCents(law.phaseOutFrom)) * n', replace: '0n * n' },
  { ...payroll, name: 'payroll tax Victoria skips the second surcharge threshold', find: ' + above(australian, lawCents(law.secondSurchargeThreshold))', replace: '' },
  { ...payroll, name: 'payroll tax NT higher rate starts above $100 million', find: "['99999999.99', '6.5']", replace: "['100000000', '6.5']" },
  { ...payroll, name: 'payroll tax accepts Australian wages below the state wages', find: 'if (all < own)', replace: 'if (false)' },
  { ...payroll, name: 'payroll tax blank Australian wages are twice the state wages', find: "australian.trim() === '' ? own", replace: "australian.trim() === '' ? own * 2n" },
  { ...payroll, name: 'payroll tax total leaves out the surcharges and levies', find: '(payroll + cents(first) + cents(second)) / 100', replace: 'payroll / 100' },
  { ...companyTax, name: 'company tax takes exactly 80% passive income as too much', find: 'passive * 10000n <= hundredths(law.passiveLimit)', replace: 'passive * 10000n < hundredths(law.passiveLimit)' },
  { ...companyTax, name: 'company tax takes $50 million of turnover as under the threshold', find: 'turnover < amount(law.threshold)', replace: 'turnover <= amount(law.threshold)' },
  { ...companyTax, name: 'company tax franks at this year’s rate', find: 'baseRateTest(input.prior, law)', replace: 'baseRateTest(input, law)' },
  { ...companyTax, name: 'a new company franks at 30%', find: "imputation.reason === 'base-rate' || imputation.reason === 'new'", replace: "imputation.reason === 'base-rate'" },
  { ...companyTax, name: 'the maximum franking credit is the dividend times the rate', find: 'dividend * imputationRate / (10000n - imputationRate)', replace: 'dividend * imputationRate / 10000n' },
  { ...companyTax, name: 'a franking credit rounds half up past the maximum', find: 'const credit = dividend * imputationRate * franking / ((10000n - imputationRate) * 10000n);', replace: 'const credit = ratioCents(dividend * imputationRate * franking, (10000n - imputationRate) * 10000n);' },
  { ...companyTax, name: 'the grossed-up dividend leaves out the credit', find: 'const grossedUp = dividend + credit;', replace: 'const grossedUp = dividend;' },
  { ...companyTax, name: 'company tax accepts passive income above assessable income', find: 'if (passive > assessable) throw', replace: 'if (false) throw' },
  { ...surcharges, name: 'NSW takes 200 days in Australia as too few', find: '>= 200;', replace: '> 200;' },
  { ...surcharges, name: 'NSW takes a 20% interest as not substantial', find: 'atLeast(largest, 20)', replace: 'over(largest, 20)' },
  { ...surcharges, name: 'Victoria takes 50% as a controlling interest', find: "verdict(over(held, 50), `foreign persons with associates hold ${b.type === 'discretionary'", replace: "verdict(atLeast(held, 50), `foreign persons with associates hold ${b.type === 'discretionary'" },
  { ...surcharges, name: 'the 50%-or-more states need more than 50%', find: 'verdict(atLeast(held, 50), `foreign persons with associates hold ${b.combined}%', replace: 'verdict(over(held, 50), `foreign persons with associates hold ${b.combined}%' },
  { ...surcharges, name: 'Victoria charges a complying super fund the absentee surcharge', find: "if (b.type === 'smsf') return", replace: 'if (false) return' },
  { ...surcharges, name: 'Victoria charges a fixed trust on land held for residents', find: "if (purchase.place === 'AU-VIC' && buyer.type === 'trust')", replace: 'if (false)' },
  { ...surcharges, name: 'Victoria’s land tax tests foreign rather than absentee interests', find: 'const held = hundredths(b.absentee);', replace: 'const held = hundredths(b.combined);' },
  { ...surcharges, name: 'Victoria charges a fixed trust on its foreign rather than absentee share', find: 'hundredths(buyer.absentee), 10000n)', replace: 'hundredths(buyer.combined), 10000n)' },
  { ...surcharges, name: 'Victoria’s trust surcharge threshold is ignored', find: '(trust && law.trustLand) || ', replace: '' },
  { ...surcharges, name: 'a surcharge exemption is worked out instead of refused', find: 'if (b.exemption) {', replace: 'if (false) {' },
  { ...surcharges, name: 'a partner visa holder is decided instead of refused', find: "if (b.type === 'individual' && b.status === 'partner')", replace: 'if (false)' },
  { ...surcharges, name: 'the duty surcharge falls on the whole property, not the buyer’s share', find: 'BigInt(share) * hundredths', replace: 'BigInt(number(purchase.value, whole)) * hundredths' },
  { ...surcharges, name: 'a residential-only land tax surcharge falls on commercial land', find: "law.landOn === 'all' || purchase.use === 'residential'", replace: 'true' },
  { ...surcharges, name: 'Tasmania’s primary production duty surcharge is left out', find: 'primary: law.primary', replace: 'primary: undefined' },
  { ...surcharges, name: 'the ACT charges a foreign owner on their own home', find: 'return b.home ?', replace: 'return false ?' },
  { ...surcharges, name: 'Queensland tests an individual for land tax by visa, not absence', find: "b.type === 'individual' ? absenteeTest(b, 'on 30 June", replace: "false ? absenteeTest(b, 'on 30 June" },
  { ...surcharges, name: 'a largest foreign interest above the total is accepted', find: 'if (hundredths(b.largest) > hundredths(b.combined)) {', replace: 'if (false) {' },
  { ...surcharges, name: 'a buyer’s share above the property’s value is accepted', find: 'if (share > number(purchase.value, whole)) throw', replace: 'if (false) throw' },
  { ...businessDays, name: 'business days count the start date', find: 'for (let day = start + 1; day <= end', replace: 'for (let day = start; day <= end' },
  { ...businessDays, name: 'business days ignore public holidays', find: 'if (!names.has(toIso(day))) return true;', replace: 'if (true) return true;' },
  { ...businessDays, name: 'business days count Saturdays', find: 'if (weekday === 0 || weekday === 6) return false;', replace: 'if (weekday === 0) return false;' },
  { ...businessDays, name: 'business days leave out Melbourne Cup Day and the WA King’s Birthday', find: '[...holidays, ...STATE_ONLY_HOLIDAYS]', replace: '[...holidays]' },
  { ...businessDays, name: 'any state or territory skips Melbourne Cup Day', find: "place === 'any' ? holidays :", replace: "place === 'any' ? [...holidays, ...STATE_ONLY_HOLIDAYS] :" },
  { ...businessDays, name: 'provisional public holidays are kept', find: 'rows.filter((row) => !row.provisional)', replace: 'rows' },
  { ...businessDays, name: 'business days end before the 2027 Grand Final holiday', find: "until: '2027-12-31'", replace: "until: '2027-08-31'" },
  { ...businessDays, name: 'business days accept an end before the start', find: 'if (end < start) throw', replace: 'if (false) throw' },
  { ...businessDays, name: 'business days accept an impossible date', find: '&& toIso(toDay(value)) === value', replace: '' },
  { ...marginScheme, name: 'the margin scheme refuses no sale that is not taxable', find: 'if (!input.taxable) {', replace: 'if (false) {' },
  { ...marginScheme, name: 'the margin scheme works out section 75-11 acquisitions', find: "if (input.acquired === 'special') {", replace: 'if (false) {' },
  { ...marginScheme, name: 'the margin scheme takes a sale to an associate at its price', find: 'if (input.associate) {', replace: 'if (false) {' },
  { ...marginScheme, name: 'the margin scheme takes a valuation for property acquired after 1 July 2000', find: "input.acquired !== 'before-2000'", replace: 'false' },
  { ...marginScheme, name: 'the margin scheme takes a part larger than the whole', find: 'if (part > whole) throw', replace: 'if (false) throw' },
  { ...marginScheme, name: 'a subdivided lot carries the whole cost', find: 'const share = part === whole ? cost : ratioCents(cost * part, whole);', replace: 'const share = cost;' },
  { ...marginScheme, name: 'the margin scheme applies to a short lease', find: "interest: input.interest !== 'other'", replace: 'interest: true' },
  { ...marginScheme, name: 'the margin scheme applies without a written agreement', find: 'agreed: input.agreed,', replace: 'agreed: true,' },
  { ...marginScheme, name: 'the margin scheme applies to property bought with GST on the whole price', find: "eligible: input.acquired !== 'full-gst'", replace: 'eligible: true' },
  { ...marginScheme, name: 'a sale below cost gives margin scheme GST back', find: 'ratioCents(nil(price * whole - cost * part)', replace: 'ratioCents((price * whole - cost * part)' },
  { ...marginScheme, name: 'a GST-exclusive price takes 1/11 of the price less the cost', find: '(exclusive ? 10n : 11n) * whole)', replace: '11n * whole)' },
  { ...marginScheme, name: 'GST without the margin scheme takes 1/11 of a GST-exclusive price', find: 'ratioCents(price, exclusive ? 10n : 11n)', replace: 'ratioCents(price, 11n)' },
  { ...marginScheme, name: 'an ineligible sale pays the margin scheme GST', find: 'gst: dollars(applies ? schemeGst : basic)', replace: 'gst: dollars(schemeGst)' },
  { ...sgc, name: 'SGC due date counts 6 business days', find: "const usual = [after(qe, 7), '7", replace: "const usual = [after(qe, 6), '7" },
  { ...sgc, name: 'SGC due date ignores public holidays', find: '&& !HOLIDAYS.has(day)', replace: '&& true' },
  { ...sgc, name: 'SGC exceptional circumstances take the earlier date', find: 'Math.max(after(qe, 20), after(made, 20))', replace: 'Math.min(after(qe, 20), after(made, 20))' },
  { ...sgc, name: 'SGC out-of-cycle earnings run from their own payday', find: "return [after(next, 7), '7", replace: "return [after(qe, 7), '7" },
  { ...sgc, name: 'SGC first contribution gets 7 business days', find: "['first', () => [after(qe, 20), '20", replace: "['first', () => [after(qe, 7), '20" },
  { ...sgc, name: 'SGC out-of-cycle earnings under a determination drop item 2', find: "['out-of-cycle-exceptional', ['out-of-cycle', 'exceptional']]", replace: "['out-of-cycle-exceptional', ['exceptional']]" },
  { ...sgc, name: 'SGC a first out-of-cycle contribution drops item 1', find: "['first-out-of-cycle', ['first', 'out-of-cycle']]", replace: "['first-out-of-cycle', ['out-of-cycle']]" },
  { ...sgc, name: 'SGC combined periods take the first, not the latest', find: '(period[0] > latest[0] ? period : latest), usual)', replace: '(latest[0] === usual[0] ? period : latest), usual)' },
  { ...sgc, name: 'SGC ignores the maximum contributions base', find: 'Math.min(earnings, Math.max(0, MAXIMUM_BASE_2026_27 - cents(inputs.earlier)))', replace: 'earnings' },
  { ...cashflowEngine, name: 'Payday cashflow at 11%', find: 'BigInt(cents(inputs.earnings)) * 12n', replace: 'BigInt(cents(inputs.earnings)) * 11n' },
  { ...cashflowEngine, name: 'Payday cashflow quarterly date a day late', find: "due: '2026-10-28'", replace: "due: '2026-10-29'" },
  { ...cashflowEngine, name: 'Payday cashflow part-day dates not flagged', find: 'partDay = true;', replace: 'partDay = false;' },
  { ...cashflowEngine, name: 'Payday cashflow fortnights of 15 days', find: "['fortnightly', { step: 14,", replace: "['fortnightly', { step: 15," },
  { ...cashflowEngine, name: 'Payday cashflow monthly date not moved to a shorter month end', find: 'Math.min(date, last)', replace: 'date' },
  { ...cashflowEngine, name: 'Payday cashflow average not weighted by amount', find: 'weighted += sg * daysEarlier;', replace: 'weighted += daysEarlier;' },
  { ...sgc, name: 'SGC notional earnings run on the final shortfall', find: 'const notional = compoundedEarnings(base, rates);', replace: 'const notional = compoundedEarnings(final, rates);' },
  { ...sgc, name: 'SGC notional earnings include the assessment day', find: 'received : assessment - 1;', replace: 'received : assessment;' },
  { ...sgc, name: 'SGC notional earnings stop the day before receipt', find: '? received : assessment - 1;', replace: '? received - 1 : assessment - 1;' },
  { ...sgc, name: 'SGC notional earnings compound on simple interest', find: '[grown, scale] = [grown * (whole + BigInt(rate)), scale * whole];', replace: '[grown, scale] = [grown + BigInt(base) * BigInt(rate) * scale / whole, scale];' },
  { ...sgc, name: 'SGC disclosure periods count from the day after payday', find: '[[29, 40], [59, 35], [119, 30]', replace: '[[30, 40], [60, 35], [120, 30]' },
  { ...sgc, name: 'SGC a first offence keeps the full uplift', find: "60 - (inputs.assessed === 'no' ? 20 : 0)", replace: '60' },
  { ...sgc, name: 'SGC uplift leaves out notional earnings', find: 'BigInt(final + notional) * BigInt(upliftPercent)', replace: 'BigInt(final) * BigInt(upliftPercent)' },
  { ...sgc, name: 'SGC a contribution on the due date counts as late', find: 'if (received <= dueDay)', replace: 'if (received < dueDay)' },
  { ...sgc, name: 'SGC late contributions on the assessment day count', find: 'if (received >= assessment) {', replace: 'if (received > assessment) {' },
  { ...sgc, name: 'SGC nil earnings pass', find: 'if (earnings === 0) throw', replace: 'if (false) throw' },
  { ...sgc, name: 'SGC quarterly interest ignores a late statement', find: 'Math.max(lodgmentDay, lodged)', replace: 'lodgmentDay' },
  { ...sgc, name: 'SGC quarterly interest divides by 366 days', find: '10n, 36500n', replace: '10n, 36600n' },
  { ...sgc, name: 'SGC quarterly contributions reduce by salary or wages', find: 'percent * ote - 10000 * contributions', replace: 'percent * wages - 10000 * contributions' },
  { ...sgc, name: 'SGC quarterly salary or wages are not capped', find: 'const wages = Math.min(cents(inputs.wages), maximum);', replace: 'const wages = cents(inputs.wages);' },
  { ...sgc, name: 'SGC quarterly administration applies with no shortfall', find: 'shortfall > 0 ? 2000 : 0', replace: '2000' },
  { ...sgc, name: 'SGC quarterly lodgment day is the 28th of the next month', find: 'Date.UTC(first, month + 4, 28)', replace: 'Date.UTC(first, month + 3, 28)' },
  { ...sgc, name: 'SGC quarterly 29 February is not refused', find: "if (isoOf(day).endsWith('-02-29')) {", replace: 'if (false) {' },
  { ...cgt, name: 'CGT indexes to the June 1999 quarter', find: 'SEPTEMBER_1999 = 687n', replace: 'SEPTEMBER_1999 = 681n' },
  { ...cgt, name: 'CGT indexation factor truncates instead of rounding', find: '(2n * SEPTEMBER_1999 * 1000n + BigInt(index)) / (2n * BigInt(index))', replace: '(SEPTEMBER_1999 * 1000n) / BigInt(index)' },
  { ...cgt, name: "CGT a cost's quarter is a month late", find: 'Math.floor((Number(iso.slice(5, 7)) - 1) / 3)', replace: 'Math.floor(Number(iso.slice(5, 7)) / 3)' },
  { ...cgt, name: 'CGT a super fund gets the 50% discount', find: 'super: [1n, 3n]', replace: 'super: [1n, 2n]' },
  { ...cgt, name: 'CGT capital works deductions never reduce the cost base', find: "const fromCostBase = acquired > '1997-05-13' ? deducted : 0n;", replace: 'const fromCostBase = 0n;' },
  { ...cgt, name: 'CGT capital works deductions do not reduce the reduced cost base', find: 'reducedCostBase: spent - deducted', replace: 'reducedCostBase: spent' },
  { ...cgt, name: 'CGT costs of owning are left out of the indexed cost base', find: 'indexed + BigInt(selling + owning) - fromCostBase', replace: 'indexed + BigInt(selling) - fromCostBase' },
  { ...cgt, name: 'CGT costs of owning are left out of the cost base', find: 'costBase: spent + BigInt(owning) - fromCostBase', replace: 'costBase: spent - fromCostBase' },
  { ...cgt, name: 'CGT the 6 years end the day before the sixth anniversary', find: '- row.from + (leap ? 0 : 1);', replace: '- row.from;' },
  { ...cgt, name: 'CGT the 6 years from 29 February run to 1 March', find: '- row.from + (leap ? 0 : 1);', replace: '- row.from + 1;' },
  { ...cgt, name: 'CGT separate absences share one 6 years', find: 'if (!previous || row.from !== previous.to + 1) {', replace: 'if (!previous) {' },
  { ...cgt, name: 'CGT a rented absence has no 6-year limit', find: 'const covered = Math.min(left, row.to - row.from + 1);', replace: 'const covered = row.to - row.from + 1;' },
  { ...cgt, name: 'CGT moving in late counts only when practicable', find: "if (home.practicable === 'no') main.fill", replace: "if (home.practicable === 'yes') main.fill" },
  { ...cgt, name: 'CGT section 118-192 ignores days before the first use', find: 'const mainBefore = first > 0 && main.subarray(0, first).every(Boolean);', replace: 'const mainBefore = first > 0;' },
  { ...cgt, name: 'CGT section 118-192 applies from 20 August 1996 inclusive', find: "start + first < dayOf('1996-08-20')", replace: "start + first < dayOf('1996-08-19')" },
  { ...cgt, name: 'CGT section 118-192 keeps the original ownership period', find: 'return { ...count(main, first, part, start), part, capped, incomeTime', replace: 'return { ...count(main, 0, part, start), part, capped, incomeTime' },
  { ...cgt, name: 'CGT section 118-192 keeps costs spent before the first use', find: 'if (improvement && !(incomeTime && improvement.date < incomeTime)) {', replace: 'if (improvement) {' },
  { ...cgt, name: 'CGT capital works on an asset bought before 13 May 1997 and improved after June 1999 stay in the cost base', find: "if (deducted && acquired < '1997-05-13' && improvedAfterJune1999) {", replace: 'if (false) {' },
  { ...cgt, name: 'CGT indexation is open for an asset bought on 21 September 1999', find: "if (acquired === '1999-09-21') {", replace: 'if (false) {' },
  { ...cgt, name: 'CGT part use is not taxed', find: 'BigInt(home.nonMain * 10000 + home.part.percent * home.partDays)', replace: 'BigInt(home.nonMain * 10000)' },
  { ...cgt, name: 'CGT the discount needs 12 months and a day', find: 'event >= yearsLater(isoOf(dayOf(acquired) + 1), 1)', replace: 'event > yearsLater(isoOf(dayOf(acquired) + 1), 1)' },
  { ...cgt, name: 'CGT the 12 months count the day bought', find: 'event >= yearsLater(isoOf(dayOf(acquired) + 1), 1)', replace: 'event >= yearsLater(isoOf(dayOf(acquired)), 1)' },
  { ...cgt, name: 'CGT indexation stops at 1990', find: "const indexable = acquired <= '1999-09-21';", replace: "const indexable = acquired <= '1990-09-21';" },
  { ...cgt, name: 'CGT a company gets no indexation', find: "if (entity === 'company') return [indexable ? 'indexation' : 'other'];", replace: "if (entity === 'company') return ['other'];" },
  { ...cgt, name: "CGT earlier years' losses are not applied", find: 'const remaining = gain - currentApplied - priorApplied;', replace: 'const remaining = gain - currentApplied;' },
  { ...cgt, name: "CGT this year's unused losses are not carried forward", find: 'carried: current - currentApplied + prior - priorApplied', replace: 'carried: prior - priorApplied' },
  { ...cgt, name: 'CGT a tie between methods ignores the losses carried forward', find: '(a.net === b.net ? Number(b.carried - a.carried) : Number(a.net - b.net))', replace: 'Number(a.net - b.net)' },
  { ...cgt, name: 'CGT the tax estimate leaves out the Medicare levy', find: "'resident').total - base) * 100) / 100;", replace: "'resident').netTax - base) * 100) / 100;" },
  { ...cgt, name: 'CGT label A rounds the cents', find: 'const labelA = Number(chosen.net / 100n);', replace: 'const labelA = Math.round(Number(chosen.net) / 100);' },
  { ...cgt, name: 'CGT a sale contract from 1 July 2027 is worked', find: "until: '2027-06-30'", replace: "until: '2027-07-01'" },
  { ...cgt, name: 'CGT a pre-CGT asset is worked', find: "if (acquired < '1985-09-20') {", replace: "if (acquired < '1985-09-19') {" },
  { ...cgt, name: 'CGT costs of owning are accepted from June 1991', find: "if (owning && acquired <= '1991-08-20') {", replace: "if (owning && acquired < '1991-06-01') {" },
  { ...cgt, name: 'CGT costs of owning stay in when section 118-192 applies', find: 'if (owning && incomeTime) {', replace: 'if (false) {' },
  { ...cgt, name: 'CGT part use begun during a chosen absence is worked', find: 'row.choose && part.from >= row.from && part.from <= row.to', replace: 'false' },
  { ...cgt, name: 'CGT part use begun before a chosen absence is refused', find: 'row.choose && part.from >= row.from && part.from <= row.to', replace: 'row.choose && part.from <= row.to' },
  { ...cgt, name: 'CGT shares held at least 10% get the discount', find: "if (x.kind === 'equity' && x.entity !== 'company') {", replace: 'if (false) {' },
  { ...cgt, name: 'CGT a company is refused shares held at least 10%', find: "x.kind === 'equity' && x.entity !== 'company'", replace: "x.kind === 'equity'" },
  { ...cgt, name: 'CGT the 6-year note is never given', find: 'capped ||= rented > allowance;', replace: '' },
  { ...cgt, name: 'CGT rent ending on the sixth anniversary is worked', find: 'if (rented >= allowance && rented <= allowance + (leap ? 1 : 0)) {', replace: 'if (false) {' },
  { ...cgt, name: 'CGT rent from 29 February ending on 1 March is worked', find: 'allowance + (leap ? 1 : 0)', replace: 'allowance' },
  { ...cgt, name: 'CGT an absence that ends after another starts is not checked', find: '      settle();', replace: '' },
  { ...cgt, name: 'CGT part use begun past the 6 years is refused', find: 'main[part.from - start] && rows.some', replace: 'rows.some' },
  { ...lsl, name: 'LSL NSW pro rata from 4 years', find: "(NSW)', full: 10, early: 5", replace: "(NSW)', full: 10, early: 4" },
  { ...lsl, name: 'LSL Victoria needs 10 years', find: "(Vic)', full: 7, early: 7", replace: "(Vic)', full: 10, early: 7" },
  { ...lsl, name: 'LSL service leaves out the last day', find: 'const until = end + 1 - excluded;', replace: 'const until = end - excluded;' },
  { ...lsl, name: 'LSL a year completes a day early', find: 'while (anniversary(start, years + 1) <= until)', replace: 'while (anniversary(start, years + 1) <= until + 1)' },
  { ...lsl, name: 'LSL a period from 29 February or the 31st ends a day early', find: 'Date.UTC(year, inYear + 1, 1)', replace: 'Date.UTC(year, inYear, last)' },
  { ...lsl, name: 'LSL part years drop the days', find: '+ s.days * 1200)', replace: '+ 0)' },
  { ...lsl, name: 'LSL 8 2/3 weeks become 8 1/8', find: 'at(years, 13n, 15n)', replace: 'at(years, 13n, 16n)' },
  { ...lsl, name: 'LSL 1.3 weeks a year become 1.2', find: 'at(years, 13n, 10n)', replace: 'at(years, 12n, 10n)' },
  { ...lsl, name: 'LSL 1/60th of the period is taken over 365 days', find: '[BigInt(days), 420n]', replace: '[BigInt(days), 365n]' },
  { ...lsl, name: 'LSL NSW a resignation under 10 years pays', find: "'AU-NSW': [['redundancy',", replace: "'AU-NSW': [['resign', 'redundancy'," },
  { ...lsl, name: 'LSL SA serious misconduct under 10 years pays', find: "'performance', 'fixed-term', 'death'], 'subsections", replace: "'performance', 'misconduct', 'fixed-term', 'death'], 'subsections" },
  { ...lsl, name: 'LSL an unsettled reason is guessed', find: 'if (unsettled) throw new Error(unsettled);', replace: 'if (false) throw new Error(unsettled);' },
  { ...lsl, name: 'LSL ACT pro rata drops the completed months', find: 'twoMonths(completedMonths(s))', replace: 'twoMonths(completedYears(s))' },
  { ...lsl, name: 'LSL NSW after 15 years keeps the part year', find: "case 'AU-NSW': if (s.years < 15)", replace: "case 'AU-NSW': if (s.years < 99)" },
  { ...lsl, name: 'LSL WA serious misconduct after 10 years pays each completed year', find: "case 'AU-WA': if (reason === 'misconduct')", replace: "case 'AU-WA': if (reason === 'none')" },
  { ...lsl, name: 'LSL NT serious misconduct after 10 years pays each completed year', find: "default: if (reason === 'misconduct')", replace: "default: if (reason === 'none')" },
  { ...lsl, name: 'LSL Tasmania death after 10 years drops the time since', find: 'outcomeOf(plus(blockWeeks(s), sixtieth(since))', replace: 'outcomeOf(blockWeeks(s)' },
  { ...lsl, name: 'LSL Queensland 10 to 15 years gives the exact proportion to take', find: 'if (s.years < 15) return outcomeOf([86667n, 10000n]', replace: 'if (s.years < 10) return outcomeOf([86667n, 10000n]' },
  { ...lsl, name: 'LSL Queensland takes 8 2/3 weeks for 10 years', find: 'at(years, 86667n, 100000n)', replace: 'at(years, 13n, 15n)' },
  { ...lsl, name: 'LSL Tasmania lets leave taken pass with 15 years by 1 July 2012', find: 'anniversary(start, 15) <= TAS_2011_TRANSITION', replace: 'anniversary(start, 15) <= 0' },
  { ...lsl, name: 'LSL Tasmania refuses leave taken with any service before 1 July 2012', find: 'anniversary(start, 15) <= TAS_2011_TRANSITION', replace: 'start < TAS_2011_TRANSITION' },
  { ...lsl, name: 'LSL Tasmania subtracts undated excluded days from the transition screen', find: 'anniversary(start, 15) <= TAS_2011_TRANSITION', replace: 'anniversary(start, 15) + excluded <= TAS_2011_TRANSITION' },
  { ...lsl, name: 'LSL Queensland part years take days over 365.25', find: "(place === 'AU-QLD'\n", replace: "(place === 'none'\n" },
  { ...lsl, name: 'LSL drops the conditions on a reason that does not qualify', find: "+ `${CONDITIONS[place]?.[reason] ?? ''}`", replace: "+ ''" },
  { ...lsl, name: 'LSL weeks truncate',find: '(2n * n * 10000n + d) / (2n * d)', replace: '(n * 10000n) / d' },
  { ...lsl, name: 'LSL payment multiplies the rounded weeks', find: 'value: Number((2n * (n * 10000n - taken * d) * pay + d * 10000n) / (2n * d * 10000n)) / 100',
    replace: 'value: Number((2n * balance * pay + 10000n) / 20000n) / 100' },
  { ...lsl, name: 'LSL payment ignores leave taken', find: '(n * 10000n - taken * d)', replace: '(n * 10000n)' },
  { ...lsl, name: 'LSL more leave taken than the entitlement passes', find: 'if (taken * d > n * 10000n) {', replace: 'if (taken > tenThousandths(outcome.weeks) + 10000000n) {' },
  { ...lsl, name: 'LSL checks leave taken against rounded weeks', find: 'if (taken * d > n * 10000n) {', replace: 'if (taken > tenThousandths(outcome.weeks)) {' },
  { ...lsl, name: 'LSL next date ignores excluded days', find: 'anniversary(start, next) - 1 + excluded;', replace: 'anniversary(start, next) - 1;' },
  { ...lsl, name: 'LSL service before 23 June 1990 passes', find: 'value < LSL_EARLIEST_START', replace: "value < '1900-01-01'" },
  { ...salaryDividend, name: 'salary against dividends pays super guarantee above the base', find: 'Math.min(salary, y.cap) * y.tenths + 1000', replace: 'salary * y.tenths + 1000' },
  { ...salaryDividend, name: 'salary against dividends franks at 30% whatever the rate', find: 'BigInt(dividend) * y.rate / (10000n - y.rate)', replace: 'BigInt(dividend) * 3000n / 7000n' },
  { ...salaryDividend, name: 'salary against dividends gives the standard deduction from 2025-26', find: 'STANDARD_DEDUCTION_FROM = \'2026-27\'', replace: 'STANDARD_DEDUCTION_FROM = \'2025-26\'' },
  { ...salaryDividend, name: 'salary against dividends gives no standard deduction', find: 'const deduction = y.deduction ? Math.min(STANDARD_DEDUCTION, salary) : 0;', replace: 'const deduction = 0;' },
  { ...salaryDividend, name: 'salary against dividends taxes super at 30%', find: 'const SUPER_TAX = 1500n;', replace: 'const SUPER_TAX = 3000n;' },
  { ...salaryDividend, name: 'salary against dividends leaves out Division 293 tax', find: '+ division293Tax;', replace: ';' },
  { ...salaryDividend, name: 'salary against dividends ignores the tax on other income', find: '- credit - taxOn(Math.floor(other / 100), y.year);', replace: '- credit;' },
  { ...salaryDividend, name: 'salary against dividends rounds the franking credit up', find: 'const credit = Number(BigInt(dividend) * y.rate / (10000n - y.rate));', replace: 'const credit = Number((BigInt(dividend) * y.rate + 10000n - y.rate - 1n) / (10000n - y.rate));' },
  { ...salaryDividend, name: 'salary against dividends lets the salary use all the profit', find: 'if (salary > largest) {', replace: 'if (salary > profit) {' },
  { ...salaryDividend, name: 'salary against dividends misses the Medicare levy thresholds', find: '...MEDICARE_THRESHOLDS[y.year],', replace: '' },
  { ...salaryDividend, name: 'salary against dividends misses where the offsets stop clearing the tax', find: '    firstTaxed(y.year)].map', replace: '    ].map' },
  { ...salaryDividend, name: 'salary against dividends misses the standard deduction step', find: 'const salaries = [0, largest, y.cap, deduction,', replace: 'const salaries = [0, largest, y.cap,' },
  { ...salaryDividend, name: 'salary against dividends breaks a tie towards the higher salary', find: 'one[1] > top[1] + 1e-6', replace: 'one[1] >= top[1] - 1e-6' },
  { ...salaryDividend, name: 'salary against dividends takes the 2025-26 base rate as 30%', find: 'rate: baseRate ? 2500n : 3000n', replace: 'rate: baseRate && year !== \'2025-26\' ? 2500n : 3000n' },
  { ...soleTraderCompanyEngine, name: 'sole trader against company leaves out the top-up tax', find: 'const total = companyTaxed + salaryTax + topUp + superTax;', replace: 'const total = companyTaxed + salaryTax + superTax;' },
  { ...soleTraderCompanyEngine, name: 'sole trader against company forgets the franking credit offset', find: '- salaryTax - credit;', replace: '- salaryTax;' },
  { ...soleTraderCompanyEngine, name: 'sole trader against company gives the dividend the standard deduction', find: 'Math.min(100000, salary)', replace: 'Math.min(100000, salary + dividend)' },
  { ...soleTraderCompanyEngine, name: 'sole trader against company lets the dividend exceed the profit after tax', find: 'if (takenOut - salary > afterTax) {', replace: 'if (takenOut - salary > taxable) {' },
  { ...soleTraderCompanyEngine, name: 'sole trader against company always applies the small business offset', find: 'offset: s.offset, studyLoan', replace: 'offset: true, studyLoan' },
  { ...soleTraderCompanyEngine, name: 'sole trader against company leaves out the super tax', find: 'const total = companyTaxed + salaryTax + topUp + superTax;', replace: 'const total = companyTaxed + salaryTax + topUp;' },

  { ...surcharges, name: 'the FIRB lower fee applies at $75,000', find: 'value < 75000 ?', replace: 'value <= 75000 ?' },
  { ...surcharges, name: 'an exact million pays the next FIRB step', find: 'Math.floor((value - 1) / f.constant)', replace: 'Math.floor(value / f.constant)' },
  { ...surcharges, name: 'the FIRB fee is not capped above $40 million', find: 'value > f.tiers * f.constant ? f.maximum', replace: 'false ? f.maximum' },
  { ...surcharges, name: 'an established dwelling pays the single FIRB fee', find: "kind === 'established' ? fee * f.established : fee", replace: 'fee' },
  { ...surcharges, name: 'a tenant in common pays the full FIRB fee', find: 'const fee = Number(ratioCents(BigInt(whole) * 100n * numerator, denominator)) / 100;', replace: 'const fee = whole;' },
  { ...surcharges, name: 'FIRB fee tiers apply to a tenant in common’s share of the consideration',
    find: 'const fee = Number(ratioCents(BigInt(whole) * 100n * numerator, denominator)) / 100;',
    replace: 'const fee = firbFee(kind, String(Math.floor(number(consideration, { money: true }) * Number(numerator) / Number(denominator)))).fee;' },
  { ...surcharges, name: 'the comparison takes the chosen jurisdiction’s duty everywhere', find: 'const duty = /** @type {number} */ (generals[place]);', replace: 'const duty = /** @type {number} */ (generals[purchase.place]);' },
  { ...leaseEngine, name: 'the payment at commencement stays in the liability', find: 'BigInt(Math.round(pv.amount * 100)) - (advance ? payment : 0n)', replace: 'BigInt(Math.round(pv.amount * 100))' },
  { ...leaseEngine, name: 'incentives add to the right-of-use asset', find: '- incentives + direct + restoration', replace: '+ incentives + direct + restoration' },
  { ...leaseEngine, name: 'initial direct costs are left out of the asset', find: '+ direct + restoration;', replace: '+ restoration;' },
  { ...leaseEngine, name: 'the last period does not take the rounding', find: 'period === last ? paid - balance : ', replace: 'false ? paid - balance : ' },
  { ...leaseEngine, name: 'the residual is left out of the schedule', find: '(period === last ? residual : 0n)', replace: '0n' },
  { ...leaseEngine, name: 'a residual paid in advance falls with the last payment', find: 'const last = advance && residual ? count + 1 : count;', replace: 'const last = count;' },
  { ...leaseEngine, name: 'a shorter useful life is ignored', find: "periodsAfter(start, months, 'monthly') < end)", replace: 'false)' },
  { ...leaseEngine, name: 'ownership transferring keeps the lease term', find: "(terms.ownership === 'yes' || periodsAfter", replace: '(periodsAfter' },
  { ...leaseEngine, name: 'a 12-month lease is not short term', find: "end <= periodsAfter(start, 12, 'monthly')", replace: "end < periodsAfter(start, 12, 'monthly')" },
  { ...leaseEngine, name: 'a claimed GST credit is also deducted', find: '(claim ? value : gross(value))', replace: 'gross(value)' },
  { ...leaseEngine, name: 'the hire purchase credit is the price’s GST', find: 'ratioCents(hpTotal, 11n)', replace: 'gstOn(price)' },
  { ...leaseEngine, name: 'hire purchase interest is deducted with its GST', find: 'claim ? ratioCents(value * 10n, 11n) : value', replace: 'value' },
  { ...leaseEngine, name: 'the comparison stops before a payment on 1 July', find: 'const lastYear = yearStarting(dayOf(leased.end));', replace: 'const lastYear = yearStarting(dayOf(leased.end) - 1);' },
  { ...ftc, name: 'FTC credit truncates the cents', find: 'ratioCents(q * milli(rate), 10n ** 7n)', replace: '(q * milli(rate)) / 10n ** 7n' },
  { ...ftc, name: 'FTC label 7D rounds the cents', find: 'Number(cents / 100n)', replace: 'Number((cents + 50n) / 100n)' },
  { ...ftc, name: 'FTC a heavy vehicle on a public road takes the full rate', find: "line.use === 'heavy_vehicle_public_road' ? heavy", replace: "line.use === 'heavy_vehicle_public_road' ? other" },
  { ...ftc, name: 'FTC a light vehicle on a public road earns the full rate', find: "line.use === 'other_business' ? other : '0'", replace: "line.use === 'other_business' ? other : other" },
  { ...ftc, name: 'FTC fuel after 31 January 2027 passes', find: 'if (line.acquired > dayOf(FTC_LAST_DAY)) {', replace: 'if (line.acquired > dayOf(FTC_LAST_DAY) + 366) {' },
  { ...ftc, name: 'FTC fuel outside the income year passes', find: 'if (line.acquired < year[0] || line.acquired > year[1]) {', replace: 'if (false) {' },
  { ...ftc, name: 'FTC Method 2 spans any rate change', find: "changes.find((p) => p.starts !== 'indexation')", replace: 'changes.find(() => false)' },
  { ...ftc, name: 'FTC Method 2 period after the last rate passes', find: 'if (end > dayOf(FTC_LAST_DAY)) {', replace: 'if (false) {' },
  { ...ftc, name: 'FTC Method 1 loses a factor of 10', find: 'cost * milli(rate) * 10n, price', replace: 'cost * milli(rate), price' },
  { ...ftc, name: 'FTC derived kilometres take 100%', find: '* 984n, kmBasis', replace: '* 1000n, kmBasis' },
  { ...ftc, name: 'FTC a rigid truck class boundary takes the heavier rate', find: 'weight <= milli(top)', replace: 'weight < milli(top)' },
  { ...ftc, name: 'FTC a 4.5 tonne rigid truck is a heavy vehicle', find: 'if (weight <= 4500n) {', replace: 'if (weight < 4500n) {' },
  { ...ftc, name: 'FTC public road litres may exceed the diesel', find: 'if (publicLitres > all) {', replace: 'if (false) {' },
  { ...ftc, name: 'FTC simplified methods pass without the small claimant test', find: 'if (!input.small_claimant) {', replace: 'if (false) {' },
  { ...ftc, name: 'FTC Method 1 takes LPG', find: "const LIQUID = ['diesel',", replace: "const LIQUID = ['lpg', 'diesel'," },
  { ...ftc, name: 'FTC the time limit runs 5 years', find: 'Number(acquired.slice(0, 4)) + 4}', replace: 'Number(acquired.slice(0, 4)) + 5}' },
  { ...lct, name: 'LCT rate at 30%', find: 'ratioCents(over * 330n, 1100n)', replace: 'ratioCents(over * 300n, 1100n)' },
  { ...lct, name: 'LCT GST left in the value', find: 'ratioCents(over * 330n, 1100n)', replace: 'ratioCents(over * 33n, 100n)' },
  { ...lct, name: 'LCT truncates the cents', find: 'ratioCents(over * 330n, 1100n)', replace: '(over * 330n) / 1100n' },
  { ...lct, name: 'LCT a car at the threshold pays tax', find: 'const over = nil(c.value - t.cents);', replace: 'const over = nil(c.value - t.cents + 1n);' },
  { ...lct, name: 'LCT the 7 litre rating continues from 1 July 2025', find: '&& !c.usedBefore ? 350n : 700n', replace: '&& !c.usedBefore ? 700n : 700n' },
  { ...lct, name: 'LCT item 4(2) ignored', find: 'c.year >= \'2025-26\' && !c.usedBefore', replace: 'c.year >= \'2025-26\'' },
  { ...lct, name: 'LCT a car rated exactly at the limit is not fuel efficient', find: 'c.rating !== null && c.rating <= limit', replace: 'c.rating !== null && c.rating < limit' },
  { ...lct, name: 'LCT 2026-27 keeps the 2025-26 threshold', find: '[\'2026-27\', 91661, 80809]', replace: '[\'2026-27\', 91661, 80567]' },
  { ...lct, name: 'LCT earlier tax on the car ignored on a sale', find: 'const payable = nil(tax - l.previous);\n        Object.assign(out, { payable:', replace: 'const payable = nil(tax);\n        Object.assign(out, { payable:' },
  { ...lct, name: 'LCT importation tax reported at 1E', find: 'if (l.kind === \'importation\') sums.imports += tax;', replace: 'if (l.kind === \'importation\') sums.sales += tax;' },
  { ...lct, name: 'LCT price adjustment sign reversed', find: 'if (change < 0n) {', replace: 'if (change > 0n) {' },
  { ...lct, name: 'LCT label 1E rounds the cents', find: 'label1e: Number((sums.sales + sums.up) / 100n)', replace: 'label1e: Number((sums.sales + sums.up + 50n) / 100n)' },
  { ...lct, name: 'LCT label 1F takes increasing adjustments', find: 'label1f: Number(sums.down / 100n)', replace: 'label1f: Number((sums.down + sums.up) / 100n)' },
  { ...lct, name: 'LCT refund cap at $3,000', find: 'const REFUND_CAP = 1000000n;', replace: 'const REFUND_CAP = 300000n;' },
  { ...lct, name: 'LCT refund for a car that is not refund-eligible', find: '!l.eligible ? 0n :', replace: 'false ? 0n :' },
  { ...lct, name: 'LCT 2 primary producer refunds pass', find: 'if (primary.length > 1) {', replace: 'if (primary.length > 2) {' },
  { ...lct, name: 'LCT a refund before 1 July 2019 passes', find: 'if (supplyYear(fields, n, year) < \'2019-20\') {', replace: 'if (supplyYear(fields, n, year) < \'2012-13\') {' },
  { ...lct, name: 'LCT an adjustment without its supply year takes the period', find: '&& !Object.hasOwn(fields, \'supplied_in\')) {\n    refuse(\'input.missing_field\'', replace: '&& false) {\n    refuse(\'input.missing_field\'' },
  { ...fhog, name: 'FHOG NSW bought cap at $750,000', find: 'amount: 10000, bought: 600000, built: 750000 }', replace: 'amount: 10000, bought: 750000, built: 750000 }' },
  { ...fhog, name: 'FHOG Queensland pays $15,000', find: 'amount: 30000, bought: 749999', replace: 'amount: 15000, bought: 749999' },
  { ...fhog, name: 'FHOG Queensland pays at $750,000', find: 'bought: 749999, built: 749999', replace: 'bought: 750000, built: 750000' },
  { ...fhog, name: 'FHOG WA keeps the $750,000 cap after 6 May 2026', find: 'amount: 10000, bought: 800000, built: 800000', replace: 'amount: 10000, bought: 750000, built: 750000' },
  { ...fhog, name: 'FHOG WA old cap a day late', find: "to: '2026-05-06'", replace: "to: '2026-05-07'" },
  { ...fhog, name: 'FHOG Tasmania keeps $30,000 from 1 July 2026', find: "to: '2027-06-30', amount: 20000", replace: "to: '2027-06-30', amount: 30000" },
  { ...fhog, name: 'FHOG NT at $10,000', find: "to: '2027-09-30', amount: 50000", replace: "to: '2027-09-30', amount: 10000" },
  { ...fhog, name: 'FHOG north of the 26th parallel everywhere', find: "place === 'AU-WA' && north ? rule.north", replace: 'north ? rule.north' },
  { ...fhog, name: 'FHOG an established home gets the grant', find: "home === 'established' ? rule.established ?? 0 : rule.amount", replace: 'rule.amount' },
  { ...fhog, name: 'FHOG the Qld and WA cap value is ignored', find: 'if (limit !== undefined && tested > limit) {', replace: 'if (limit !== undefined && dollars > limit) {' },
  { ...fhog, name: 'FHOG a home bought takes a lower cap value', find: 'Math.max(dollars, capDollars)', replace: 'capDollars' },
  { ...fhog, name: 'FHOG a home built takes the greater of total and cap value', find: "home === 'built' ? capDollars :", replace: 'false ? capDollars :' },
  { ...fhog, name: 'FHOG the cap value feeds the grant', find: 'return { ...out, grant: consideration, cap,', replace: 'return { ...out, grant: Math.min(tested, amount), cap,' },
  { ...fhog, name: 'FHOG a cap value taken outside Qld and WA', find: "if (capDollars !== undefined && place !== 'AU-QLD' && place !== 'AU-WA') {", replace: 'if (false) {' },
  { ...fhog, name: 'FHOG NT established home window a day late', find: "to: '2025-09-30', amount: 50000, established: 10000", replace: "to: '2025-10-01', amount: 50000, established: 10000" },
  { ...fhog, name: 'FHOG NT established home at $50,000', find: 'established: 10000, lesser: true', replace: 'established: 50000, lesser: true' },
  { ...fhog, name: 'FHOG NT established home value taken as a cap', find: "home === 'bought' ? rule.bought : undefined;", replace: "home === 'bought' ? rule.bought : rule.established;" },
  { ...fhog, name: 'FHOG Victoria pays the amount on a smaller consideration', find: 'bought: 750000, built: 750000, lesser: true }', replace: 'bought: 750000, built: 750000 }' },
  { ...fhog, name: 'FHOG Western Australia pays the amount on a smaller consideration', find: 'north: 1000000, lesser: true }] }', replace: 'north: 1000000 }] }' },
  { ...fhog, name: 'FHOG NT pays the amount on a smaller consideration', find: "to: '2027-09-30', amount: 50000, lesser: true", replace: "to: '2027-09-30', amount: 50000" },
  { ...fhog, name: 'FHOG a Victorian home built tests land and building against the cap', find: "if (place === 'AU-VIC' && home === 'built' && price === undefined) {", replace: 'if (false) {' },
  { ...fhog, name: 'FHOG a value at the cap is refused the grant', find: 'tested > limit) {', replace: 'tested >= limit) {' },
  { ...fhog, name: 'FHOG a home built needs no contract fact', find: "(f === 'contract' ? home === 'built'", replace: "(f === 'contract' ? false" },
  { ...fhog, name: 'FHOG Western Australia assumes south', find: "if (place === 'AU-WA' && typeof north !== 'boolean') throw", replace: 'if (false) throw' },
  { ...fhog, name: 'FHOG Tasmania pays the amount on a smaller consideration', find: "amount: 20000, lesser: true", replace: 'amount: 20000' },
  { ...fhog, name: 'FHOG a home built takes the lesser of its total value', find: "if (home === 'built' && price === undefined) throw", replace: 'if (false) throw' },
  { ...fhog, name: 'FHOG the lesser of the consideration ignored', find: 'return { ...out, grant: consideration, cap,', replace: 'return { ...out, grant: rule.amount, cap,' },
  { ...fhog, name: 'FHOG a home built ignores its contract price', find: 'const consideration = price ?? dollars;', replace: 'const consideration = dollars;' },
  { ...fhog, name: 'FHOG a contract price at the grant takes the lesser', find: 'if (consideration < amount) {', replace: 'if (consideration <= amount) {' },
  { ...fhog, name: 'FHOG the Victorian cap ignores the contract price', find: "price !== undefined && place === 'AU-VIC' ? price", replace: 'false ? price' },
  { ...fhog, name: 'FHOG a contract price outside Victoria feeds the cap', find: "price !== undefined && place === 'AU-VIC' ? price", replace: 'price !== undefined ? price' },
  { ...fhog, name: 'FHOG a contract price taken for a home bought', find: "if (price !== undefined && home !== 'built') throw", replace: 'if (false) throw' },
  { ...fhog, name: 'FHOG a contract price above the total value', find: 'if (price !== undefined && price > dollars) throw', replace: 'if (false) throw' },
  { ...fhog, name: 'FHOG a contract price above the value the cap tests', find: 'if (price !== undefined && capDollars !== undefined && price > capDollars) {', replace: 'if (false) {' },
  { ...fhog, name: 'FHOG the contract fact disagrees with the contract price', find: 'facts?.contract === true && price < amount) {', replace: 'false) {' },
  { ...fhog, name: 'FHOG a priced home built still needs the contract fact', find: "home === 'built' && price === undefined : place", replace: "home === 'built' : place" },
  { ...fhog, name: 'FHOG a priced Victorian home built over the cap refused', find: "if (place === 'AU-VIC' && home === 'built' && price === undefined) {", replace: "if (place === 'AU-VIC' && home === 'built') {" },
  { ...fhog, name: 'FHOG a priced home built below the grant refused', find: "if (home === 'built' && price === undefined) throw", replace: "if (home === 'built') throw" },
  { ...fhog, name: 'FHOG the form drops the contract price', find: "...(contractPrice ? { contractPrice } : {}),", replace: '' },
  { ...fhog, name: 'FHOG an unstated fact passes', find: 'facts?.[f] !== true);\n  if (missing.length)', replace: 'facts?.[f] === undefined);\n  if (missing.length)' },
  { ...fhog, name: 'FHOG a contract before 1 July 2025 passes', find: "export const FHOG_FIRST = '2025-07-01';", replace: "export const FHOG_FIRST = '2025-01-01';" },
  { ...fhog, name: 'FHOG a contract date off the calendar passes', find: 'if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== date) throw', replace: 'if (!Number.isFinite(day)) throw' },
  { ...fhog, name: 'FHOG WA duty before the first home owner rate', find: "'AU-WA': '2026-05-07'", replace: "'AU-WA': '2025-07-01'" },
  { ...fhog, name: 'FHOG duty for a built home', find: "if (input.home === 'built') {", replace: 'if (false) {' },
  { ...fhog, name: 'FHOG an established home takes the new home duty', find: "input.home === 'bought' ? 'new' : 'established'", replace: "'new'" },
  { ...sbt, name: 'SBT the proportioning rule truncates', find: 'const taxFree = ratioCents(benefit * interestFree, interest);', replace: 'const taxFree = (benefit * interestFree) / interest;' },
  { ...sbt, name: 'SBT 2026-27 keeps the 2025-26 untaxed plan cap', find: "'2026-27': 1935000 };", replace: "'2026-27': 1865000 };" },
  { ...sbt, name: 'SBT 2021-22 low rate cap at 2020-21', find: "'2021-22': 225000,", replace: "'2021-22': 215000," },
  { ...sbt, name: 'SBT 60 is under 60', find: "age >= 60 ? 'aged_60_or_over'", replace: "age > 60 ? 'aged_60_or_over'" },
  { ...sbt, name: 'SBT preservation age a year late', find: '(month >= 7 ? year : year - 1) - 1960 + 56', replace: '(month >= 7 ? year : year - 1) - 1960 + 57' },
  { ...sbt, name: 'SBT the birthday counts the day before', find: '(day[1] === born[1] && day[2] < born[2])', replace: '(day[1] === born[1] && day[2] <= born[2])' },
  { ...sbt, name: 'SBT $200 closes the interest tax free', find: 'benefit < 20000n && benefit === interest', replace: 'benefit <= 20000n && benefit === interest' },
  { ...sbt, name: 'SBT under preservation age at 15%', find: "part('taxed_element_part', c.taxed, 20);", replace: "part('taxed_element_part', c.taxed, 15);" },
  { ...sbt, name: 'SBT non-dependant untaxed at 15%', find: "part('untaxed_element_part', c.untaxed, 30);", replace: "part('untaxed_element_part', c.untaxed, 15);" },
  { ...sbt, name: 'SBT above the plan cap at 30%', find: "part('untaxed_above_plan_cap', c.untaxed - within, 45);", replace: "part('untaxed_above_plan_cap', c.untaxed - within, 30);" },
  { ...sbt, name: 'SBT the untaxed element ignores the low rate cap the taxed element took', find: 'untaxedParts(plan, 30, lowLeft - low)', replace: 'untaxedParts(plan, 30, lowLeft)' },
  { ...sbt, name: 'SBT the taxed element above the low rate cap at 0%', find: "part('taxed_above_low_rate_cap', c.taxed - low, 15);", replace: "part('taxed_above_low_rate_cap', c.taxed - low, 0);" },
  { ...sbt, name: 'SBT other lump sums pass with cap left', find: 'if (others && lowLeft !== 0n) {', replace: 'if (false) {' },
  { ...sbt, name: 'SBT the plan cap used may exceed the cap', find: 'if (used > BigInt(cap) * 100n) conflict(', replace: 'if (used > BigInt(cap) * 200n) conflict(' },
  { ...sbt, name: 'SBT 60 or over taxes the taxable component', find: "t.name === 'aged_60_or_over' ? c.untaxed :", replace: "t.name === 'aged_60_or_over' ? c.taxable :" },
  { ...sbt, name: "SBT a dependant's death benefit is taxed", find: "if (name === 'non_dependant') {\n    l.part(", replace: "if (name === 'non_dependant' || name === 'death_benefits_dependant') {\n    l.part(" },
  { ...sbt, name: 'SBT pre-1983 service passes', find: "&& flag('service_before_july_1983', input.service_before_july_1983)) {", replace: '&& false) {' },
  { ...sbt, name: 'SBT a payment on 1 July of the next year passes', find: 'dayText(paid) > `${first + 1}-06-30`', replace: 'dayText(paid) > `${first + 1}-07-01`' },
  { ...sbt, name: 'SBT the untaxed element within the low rate cap at 0%', find: "if (lowLeft !== null) part('untaxed_within_low_rate_cap', counted, 15);", replace: "if (lowLeft !== null) part('untaxed_within_low_rate_cap', counted, 0);" },
  { ...sbt, name: 'SBT 60 or over takes the untaxed element at 30% within the plan cap', find: '} else if (plan !== null) l.untaxedParts(plan, 15, null);', replace: '} else if (plan !== null) l.untaxedParts(plan, 30, null);' },
  { ...sbt, name: 'SBT a terminal medical condition ignored', find: "const name = flag('terminal_medical_condition', input.terminal_medical_condition) ?", replace: 'const name = false ?' },
  { ...sbt, name: 'SBT under $200 is tax free without closing the interest', find: ': benefit < 20000n && benefit === interest ?', replace: ': benefit < 20000n ?' },
  { ...sbt, name: 'SBT 2023-24 keeps the 2022-23 low rate cap', find: "'2023-24': 235000 };", replace: "'2023-24': 230000 };" },
  { ...sbt, name: 'SBT the form sends the low rate cap at 60', find: 'if (age < 60 && age >= preservationAge(born)) {', replace: 'if (age <= 60 && age >= preservationAge(born)) {' },
  { ...swh, name: 'SWH Schedule 12 read from a day later', find: "export const SWH_FIRST_DAY = '2020-10-13';", replace: "export const SWH_FIRST_DAY = '2020-10-14';" },
  { ...swh, name: 'SWH Table A leaves out the Medicare levy', find: 'p.rate && p.rate + (foreign ? 0 : 2)', replace: 'p.rate && p.rate + (foreign ? 0 : 0)' },
  { ...swh, name: 'SWH a foreign resident keeps the Medicare levy', find: 'p.rate && p.rate + (foreign ? 0 : 2)', replace: 'p.rate && p.rate + (foreign ? 2 : 2)' },
  { ...swh, name: 'SWH the total rounds down', find: 'withholding: (sum + 5000n) / 10000n', replace: 'withholding: sum / 10000n' },
  { ...swh, name: 'SWH a roll-over at 45%', find: 'tfn ? (above * 47n + 5000n) / 10000n', replace: 'tfn ? (above * 45n + 5000n) / 10000n' },
  { ...swh, name: 'SWH a roll-over without a TFN keeps the cents', find: '((above / 100n) * 47n) / 100n', replace: '(above * 47n) / 10000n' },
  { ...swh, name: 'SWH no TFN at 47% for a foreign resident', find: 'const rate = foreign ? 45n : 47n;', replace: 'const rate = foreign ? 47n : 47n;' },
  { ...swh, name: 'SWH no TFN at 60 takes the taxable component', find: "(name === 'aged_60_or_over' ? c.untaxed : c.taxable) / 100n", replace: 'c.taxable / 100n' },
  { ...swh, name: "SWH no TFN refuses a dependant's death benefit", find: "if (name === 'terminal_medical_condition' || name === 'death_benefits_dependant') return nil();", replace: "if (name === 'terminal_medical_condition') return nil();" },
  { ...swh, name: 'SWH a member benefit under $200 is withheld from', find: 'under_200_closing_the_interest: 1, ', replace: '' },
  { ...swh, name: 'SWH the form keeps member facts for a roll-over', find: "...(recipient === 'rollover' ? [", replace: "...(false ? [" },
  { ...swh, name: 'SWH the form keeps the service answer for a deceased estate', find: "...(recipient === 'deceased_estate_trustee' ? ['service", replace: "...(false ? ['service" },
  { ...dasp, name: 'DASP the taxed element at 30%', find: '? [65n, 65n] : [35n, 45n]', replace: '? [65n, 65n] : [30n, 45n]' },
  { ...dasp, name: "DASP a working holiday maker's untaxed element at 45%", find: '? [65n, 65n] : [35n, 45n]', replace: '? [65n, 45n] : [35n, 45n]' },
  { ...dasp, name: 'DASP an unclaimed money roll-over with an untaxed element passes', find: '&& untaxed !== 0n) {', replace: '&& false) {' },
  { ...dasp, name: 'DASP 2027-28 left out', find: "'2026-27', '2027-28'];", replace: "'2026-27'];" },
  { ...swh, name: 'SWH the result rounds to the dollar without a TFN', find: "input.tfn_provided ? 'Amount to withhold, to the nearest dollar'", replace: "true ? 'Amount to withhold, to the nearest dollar'" },
  { ...swh, name: 'SWH a part row keeps the top marginal rate', find: "label.replace(', at the top marginal rate', '')", replace: 'label' },
  { ...wet, name: 'WET at 28%', find: 'ratioCents(cents * 29n, 100n)', replace: 'ratioCents(cents * 28n, 100n)' },
  { ...wet, name: 'WET half retail takes the whole retail price', find: 'ratioCents(v.price, 2n)', replace: 'v.price' },
  { ...wet, name: 'WET average wholesale price ignores the dealing quantity', find: 'ratioCents(v.price * /** @type {bigint} */ (v.quantity),', replace: 'ratioCents(v.price,' },
  { ...wet, name: 'WET charged on a sale under quote', find: "const tax = d.kind === 'quoted_sale' ? 0n : at29(value);", replace: "const tax = at29(value);" },
  { ...wet, name: 'WET GST on the price before WET', find: 'gst = ratioCents(value + tax, 10n);', replace: 'gst = ratioCents(value, 10n);' },
  { ...wet, name: 'WET GST in a retail price taken as a tenth', find: 'gst = ratioCents(d.retail, 11n);', replace: 'gst = ratioCents(d.retail, 10n);' },
  { ...wet, name: 'WET rebate on a quote stating a GST-free supply', find: "const liable = d.intention === null || d.intention === 'taxable_dealing';", replace: "const liable = true;" },
  { ...wet, name: 'WET rebate with one condition met', find: 'liable && d.conditions.every(Boolean)', replace: 'liable && d.conditions.some(Boolean)' },
  { ...wet, name: 'WET $400,000 cap starts a year late', find: "(year >= '2026-27' ? 400000 : 350000)", replace: "(year >= '2027-28' ? 400000 : 350000)" },
  { ...wet, name: 'WET cap before 1 July 2026 is $500,000', find: '? 400000 : 350000)', replace: '? 400000 : 500000)' },
  { ...wet, name: 'WET earlier claims do not reduce the cap', find: 'const left = earlier < cap ? cap - earlier : 0n;', replace: 'const left = cap;' },
  { ...wet, name: 'WET rebate not capped', find: 'const rebate = earned < left ? earned : left;', replace: 'const rebate = earned;' },
  { ...wet, name: 'WET label 1C rounds to the nearest dollar', find: 'label1c: Number(tax / 100n)', replace: 'label1c: Math.round(Number(tax) / 100)' },
  { ...wet, name: 'WET average method open to wine that is not grape wine', find: "if (!flag(value, item, 'grape_wine')) {", replace: "if (!flag(value, item, 'grape_wine') && false) {" },
  { ...wet, name: 'WET average method open without the 10% wholesale share', find: "if (!flag(value, item, 'wholesale_share_at_least_10_percent')) {", replace: "if (!flag(value, item, 'wholesale_share_at_least_10_percent') && false) {" },
  { ...wet, name: 'WET 2022-23 accepted', find: "export const WET_YEARS = ['2023-24',", replace: "export const WET_YEARS = ['2022-23', '2023-24'," },
  { ...wet, name: 'WET the form shares no wholesale sales', find: 'quantity: value(`quantity-${i}`), wholesale_sales: sales }', replace: 'quantity: value(`quantity-${i}`), wholesale_sales: sales.slice(0, 1) }' },
  { ...rental, name: 'rental property capital works at 3%', find: 'const RATE_2_5 = [25n, -3];', replace: 'const RATE_2_5 = [3n, -2];' },
  { ...rental, name: 'rental property 4% starts a day late', find: "if (before('1985-07-18')) {", replace: "if (before('1985-07-19')) {" },
  { ...rental, name: 'rental property a structural improvement before 1992 deducted', find: "return before('1992-02-27') ? { rate: null,", replace: "return before('1902-02-27') ? { rate: null," },
  { ...rental, name: 'rental property capital works past the undeducted expenditure', find: 'deduction: cents(cmp(full, undeducted) < 0 ? full : undeducted) };', replace: 'deduction: cents(full) };' },
  { ...rental, name: 'rental property rental-only expenses apportioned by days', find: 'int(h.days)), mul(r, share)))]);', replace: 'int(h.days)), div(mul(mul(r, share), int(h.available)), int(h.days))))]);' },
  { ...rental, name: 'rental property travel deducted', find: "out.push(['travel', 0n],", replace: "out.push(['travel', cents(mul(add(a, r), share))]," },
  { ...rental, name: 'rental property interest ignores the principal split', find: 'cents(div(mul(div(mul(ofCents(charged), ofCents(rental)), ofCents(whole)), int(h.available)), int(h.days)))', replace: 'cents(div(mul(ofCents(charged), int(h.available)), int(h.days)))' },
  { ...rental, name: 'rental property a redraw accepted', find: "if (itemFlag(fields, 'redrawn_in_year')) {", replace: "if (itemFlag(fields, 'redrawn_in_year') && false) {" },
  { ...rental, name: 'rental property s 40-27 from 10 May 2017', find: "const NINE_MAY_2017 = /** @type {number} */ (dayOf('2017-05-09'));", replace: "const NINE_MAY_2017 = /** @type {number} */ (dayOf('2017-05-10'));" },
  { ...rental, name: 'rental property private use not reduced', find: "if (needed(fields, 'residence_or_private_use', '')) return", replace: "if (needed(fields, 'residence_or_private_use', '') && false) return" },
  { ...rental, name: 'rental property the new premises exception ignored', find: "if (needed(fields, 'new_premises_exception', ' you did not hold when it was first used or installed ready for use')) return null;", replace: "needed(fields, 'new_premises_exception', ' you did not hold when it was first used or installed ready for use');" },
  { ...rental, name: 'rental property 2027-28 accepted', find: "'2024-25', '2025-26', '2026-27'];", replace: "'2024-25', '2025-26', '2026-27', '2027-28'];" },
  { ...rental, name: 'rental property the effect on tax from 2023-24', find: 'if (year.first < 2024) {', replace: 'if (year.first < 2023) {' },
  { ...rental, name: 'rental property the net rent with its cents', find: 'const dropped = (net / 100n) * 100n;', replace: 'const dropped = net;' },
  { ...rental, name: 'rental property the 2^46 dollar limit dropped', find: 'if (steps.some(([, v]) => big(v)))', replace: 'if (steps.some(() => false))' },
  { ...rentalResult, name: 'rental property the scope answer dropped', find: "if (value('scope') !== '') input.scope_confirmed = value('scope') === 'yes';", replace: '' },
  { ...rentalResult, name: 'rental property the form passes an unanswered question as no', find: "const answered = (key, name) => (value(name) === '' ? {} : { [key]: yes(name) });", replace: 'const answered = (key, name) => ({ [key]: yes(name) });' },
  { ...leave, name: 'unused leave capped parts withheld at 30%', find: 'const FLAT_PERCENT = 32;', replace: 'const FLAT_PERCENT = 30;' },
  { ...leave, name: 'unused leave small payment limit at $200', find: 'const SMALL_PAYMENT = 30000;', replace: 'const SMALL_PAYMENT = 20000;' },
  { ...leave, name: 'unused leave small payment limit ignored', find: 'under300 ? roundDollars(', replace: 'false ? roundDollars(' },
  { ...leave, name: 'unused leave without a TFN at 46%', find: "'no-tfn': 47", replace: "'no-tfn': 46" },
  { ...leave, name: 'unused leave foreign resident without a TFN at 47%', find: "'no-tfn-foreign': 45", replace: "'no-tfn-foreign': 47" },
  { ...leave, name: 'unused leave without a TFN rounds to the dollar', find: 'Math.floor(((annual + loading + longService) * noTfnRate) / 10000)', replace: 'Math.round(((annual + loading + longService) * noTfnRate) / 10000)' },
  { ...leave, name: 'unused leave 1993 split needed a day late', find: "start < '1993-08-18'", replace: "start <= '1993-08-18'" },
  { ...leave, name: 'unused leave 1978 split needed a day late', find: "start < '1978-08-16'", replace: "start <= '1978-08-16'" },
  { ...leave, name: 'unused leave redundancy caps pre-1978 long service leave too', find: 'concessional ? longService - pre1978 : lsl1993', replace: 'concessional ? longService : lsl1993' },
  { ...leave, name: 'unused leave 5% share left out of the marginal rate calculation', find: 'post1993 * 20 + pre1978', replace: 'post1993 * 20' },
  { ...leave, name: 'unused leave 32% amounts ignore cents', find: 'Math.floor((units + 5000) / 10000)', replace: 'Math.floor(units / 10000)' },
  { ...leave, name: 'unused leave pay share keeps rounding up', find: 'Math.floor(marginalTwentieths / (2000 * periods))', replace: 'Math.round(marginalTwentieths / (2000 * periods))' },
  { ...leave, name: 'unused leave TFN payee taxed on scale 3', find: '({ tfn: 2,', replace: '({ tfn: 3,' },
  { ...leave, name: 'unused leave part a cent over its total accepted', find: 'given !== null && given > total)', replace: 'given !== null && given > total + 1)' },
  { ...leave, name: 'unused leave pre-1978 share 90% not assessable', find: 'lslPre1978NotAssessable: toCents(pre1978 * 19)', replace: 'lslPre1978NotAssessable: toCents(pre1978 * 18)' },
  { ...franking, name: 'franking deficit tax offset reduced by 20%', find: 'reduction = mul(part, q(3n, 10n));', replace: 'reduction = mul(part, q(2n, 10n));' },
  { ...franking, name: 'franking offset reduced at exactly 10% of the credits', find: 'mul(credits, q(1n, 10n))) <= 0', replace: 'mul(credits, q(1n, 10n))) < 0' },
  { ...franking, name: 'franking offset private company exception needs more than 90%', find: 'cmp(tax.before, mul(fdt, q(9n, 10n))) >= 0', replace: 'cmp(tax.before, mul(fdt, q(9n, 10n))) > 0' },
  { ...franking, name: 'franking label K leaves out refunds without a trigger', find: "(l) => l.cls === 'other' || (!trigger && l.cls === 'refund')", replace: "(l) => l.cls === 'other'" },
  { ...franking, name: 'franking offset item 7 debits counted as attributable', find: "(l) => l.cls === 'trigger' || l.cls === 'refund')", replace: "(l) => l.cls !== 'credit')" },
  { ...franking, name: 'franking offset counts an opening deficit in the attributable part', find: 'opening.n > 0n ? opening : ZERO', replace: 'opening' },
  { ...franking, name: 'franking over-franking tax not divided by the gross-up rate', find: 'mul(q(100n), f.grossUp)', replace: 'q(100n)' },
  { ...franking, name: 'franking credit not capped at the maximum', find: 'const credit = min(dist.allocated, maximum);', replace: 'const credit = dist.allocated;' },
  { ...franking, name: 'franking refunds taken back up to 2 months after the year', find: 'const last = refund ? addMonths(f.end, 3) : f.end;', replace: 'const last = refund ? addMonths(f.end, 2) : f.end;' },
  { ...franking, name: 'franking refunds after the year never taken back', find: 'if (!debit.n || after.n >= 0n) {', replace: 'if (true) {' },
  { ...franking, name: 'franking significant variation threshold ignores the periods between', find: 'row.threshold = 20 * (k - previous.at);', replace: 'row.threshold = 20;' },
  { ...franking, name: 'franking public company has one franking period', find: 'const periods = f.private ?', replace: 'const periods = true ?' },
  { ...franking, name: 'franking R&D deferral not applied to tax paid', find: "if (['payg_instalment', 'income_tax_paid'].includes(e.type) && rdPool.n) {", replace: "if (['payg_instalment'].includes(e.type) && rdPool.n) {" },
  { ...franking, name: 'franking exempt entity still gets benchmark consequences', find: '} else if (!f.exempt) {', replace: '} else {' },
  { ...franking, name: 'franking amounts rounded down to the cent', find: '(2n * (a.n < 0n ? -a.n : a.n) * 100n + a.d) / (2n * a.d)', replace: '(2n * (a.n < 0n ? -a.n : a.n) * 100n) / (2n * a.d)' },
  { ...franking, name: 'franking return due a month late', find: 'const due = isoOf(dayOf(addMonths(isoOf(dayOf(f.end) + 1), 1)) - 1);', replace: 'const due = isoOf(dayOf(addMonths(isoOf(dayOf(f.end) + 1), 2)) - 1);' },
  { ...borrow, name: 'borrowing maximum truncates the cents', find: 'const maximum = ratioCents(remaining * BigInt(days), BigInt(left));', replace: 'const maximum = (remaining * BigInt(days)) / BigInt(left);' },
  { ...borrow, name: 'borrowing days leave out the first day', find: 'const [left, days] = [end - begin + 1, Math.min(end, last) - begin + 1];', replace: 'const [left, days] = [end - begin + 1, Math.min(end, last) - begin];' },
  { ...borrow, name: 'borrowing period runs 5 years and a day', find: 'return civil(same)[2] === civil(start)[2] ? same - 1 : same;', replace: 'return civil(same)[2] === civil(start)[2] ? same : same;' },
  { ...borrow, name: 'borrowing period ignores the contract', find: 'const planned = loan.termEnd === null ? five : Math.min(loan.termEnd, five);', replace: 'const planned = five;' },
  { ...borrow, name: 'borrowing period ignores a repayment', find: 'return loan.repaid !== null && loan.repaid <= last ? Math.min(planned, loan.repaid) : planned;', replace: 'return planned;' },
  { ...borrow, name: 'borrowing $100 test takes under $100 only', find: 't.num <= 10000n * t.den;', replace: 't.num < 10000n * t.den;' },
  { ...borrow, name: 'borrowing $100 test ignores nil use', find: 'return f.uses[0].num !== 0n && t.num', replace: 'return t.num' },
  { ...borrow, name: 'borrowing $100 test counts each loan alone', find: 'num: t.num * f.uses[0].den + f.expenditure * f.uses[0].num * t.den, den', replace: 'num: f.expenditure * f.uses[0].num, den: f.uses[0].den' },
  { ...borrow, name: 'borrowing deduction ignores the income use', find: 'deduction: ratioCents(y.maximum * f.uses[i].num, f.uses[i].den),', replace: 'deduction: y.maximum,' },
  { ...borrow, name: 'borrowing loans before 2017-18 pass', find: 'if (loan.firstYear < FIRST_YEAR) refuse(', replace: 'if (false) refuse(' },
  { ...borrow, name: 'borrowing refinancing on another day passes', find: '&& loans[k - 1].loan.repaid === facts.loan.start;', replace: ';' },
  { ...borrow, name: 'borrowing s 26-155 flag from 2028-29', find: 'section_26_155: first >= 2027, projected: first > LAST_YEAR }));', replace: 'section_26_155: first >= 2028, projected: first > LAST_YEAR }));' },
  { ...borrow, name: 'borrowing 10% test at 5%', find: 'if (change < 0.1) {', replace: 'if (change < 0.05) {' },
  { ...borrow, name: 'borrowing 10% test counts fees paid to others', find: '+ Number(paid - received) / 100;', replace: '+ Number(BigInt(t.borrowingExpenses) - received) / 100;' },
  { ...borrow, name: 'borrowing early repayment is not an extinguishment', find: 'return { cost, balances, writtenOff: stop };', replace: 'return { cost, balances, writtenOff: null };' },
  { ...wc, name: 'WC an NSW premium of exactly $30,000 is refused', find: 'if (wages * rate > NSW_SMALL_LIMIT * 1000000n) {', replace: 'if (wages * rate >= NSW_SMALL_LIMIT * 1000000n) {' },
  { ...wc, name: 'WC the NSW $30,000 test takes the APP rounded to the cent', find: 'if (wages * rate > NSW_SMALL_LIMIT * 1000000n) {', replace: 'if (app > NSW_SMALL_LIMIT) {' },
  { ...wc, name: 'WC an NSW premium of exactly $240 is refused', find: 'if (premium < NSW_MINIMUM) {', replace: 'if (premium <= NSW_MINIMUM) {' },
  { ...wc, name: 'WC the Safe Employer Reward applies to wages', find: 'const ser = at(app, reward);', replace: 'const ser = at(wages, reward);' },
  { ...wc, name: 'WC an NSW apprentice incentive passes', find: "if (x.place === 'AU-NSW' && apprentice > 0n) {", replace: 'if (false) {' },
  { ...wc, name: 'WC Queensland actual wages pass', find: "if (x.place === 'AU-QLD' && actualWages !== null) {", replace: 'if (false) {' },
  { ...wc, name: 'WC nil Victorian remuneration passes', find: 'if (remuneration === 0n) {', replace: 'if (false) {' },
  { ...wc, name: 'WC GST is charged on the dust diseases contribution', find: 'total: premium + gst + contribution', replace: 'total: premium + gstOn(premium + contribution) + contribution' },
  { ...wc, name: 'WC Victorian remuneration is truncated to the dollar', find: 'const remuneration = half(wages, 100n);', replace: 'const remuneration = wages / 100n;' },
  { ...wc, name: 'WC the Victorian deductible amount is $15,000', find: 'VIC_DEDUCTIBLE_DOLLARS = 15500n', replace: 'VIC_DEDUCTIBLE_DOLLARS = 15000n' },
  { ...wc, name: 'WC the Victorian deductible ignores the days registered', find: 'half(days * 1000000n, 365n)', replace: 'half(365n * 1000000n, 365n)' },
  { ...wc, name: 'WC the Victorian N ÷ 365 is not rounded to 6 places', find: 'half(rate * VIC_DEDUCTIBLE_DOLLARS * share, 10000n * 1000000n)', replace: 'half(rate * VIC_DEDUCTIBLE_DOLLARS * days, 365n * 10000n)' },
  { ...wc, name: 'WC the Victorian minimum premium is $300', find: 'VIC_MINIMUM = 40000n', replace: 'VIC_MINIMUM = 30000n' },
  { ...wc, name: 'WC the excess buy-out is 0.2', find: 'workcover / 10n', replace: 'workcover / 5n' },
  { ...wc, name: 'WC Queensland duty leaves out the GST', find: '(premium + gst) * QLD_DUTY_PERCENT', replace: 'premium * QLD_DUTY_PERCENT' },
  { ...wc, name: 'WC the Queensland minimum compares the premium alone', find: 'if (premium + gst + duty >= minimum) {', replace: 'if (premium >= minimum) {' },
  { ...wc, name: 'WC SA claims costs are capped at 2 × the discount', find: 'const cap = 3n * discount;', replace: 'const cap = 2n * discount;' },
  { ...wc, name: 'WC an SA band bound takes the lower discount', find: 'base < below * unit', replace: 'base <= below * unit' },
  { ...wc, name: 'WC the SA premium rounds half up', find: '(minimum ? SA_MINIMUM_DOLLARS * 100n * unit : sum) / (100n * unit) * 100n', replace: 'half(minimum ? SA_MINIMUM_DOLLARS * 100n * unit : sum, 100n * unit) * 100n' },
  { ...wc, name: 'WC an SA base premium between a bound less a cent and the bound passes', find: 'if (edge) {', replace: 'if (false) {' },
  { ...wc, name: 'WC the SA first full year keeps its discount', find: 'const band = first ? 0n :', replace: 'const band = false ? 0n :' },
  { ...wc, name: 'WC the SA apprentice incentive drops out', find: '+ applied - apprenticeBase;', replace: '+ applied;' },
  { ...wc, name: 'WC an SA group member passes', find: "['AU-NSW', 'AU-VIC', 'AU-QLD', 'AU-SA'].includes(x.place)", replace: "['AU-NSW', 'AU-VIC', 'AU-QLD'].includes(x.place)" },
  { ...wc, name: 'WC apprentice wages above the wages pass', find: 'if (apprentice > wages)', replace: 'if (apprentice > wages + 100n)' },
  { ...wc, name: 'WC private schemes leave out GST', find: 'premium, gst, duty: 0n, total: premium + gst, notes: [] };\n}\n\n/** The premium', replace: 'premium, gst, duty: 0n, total: premium, notes: [] };\n}\n\n/** The premium' },
  { ...pools, name: 'Pools low-cost assets at 37.5%', find: 'const newAssets = 3n * (lowCost + second);', replace: 'const newAssets = 6n * (lowCost + second);' },
  { ...pools, name: 'Pools low-value decline rounded in parts', find: 'const decline = ratioCents(newAssets + pool, 16n);', replace: 'const decline = ratioCents(newAssets, 16n) + ratioCents(pool, 16n);' },
  { ...pools, name: 'Pools low-value termination values ignored', find: 'closingPoolBalance: dollars(max(before - termination, 0n))', replace: 'closingPoolBalance: dollars(before)' },
  { ...pools, name: 'Pools low pool value threshold $30,000', find: '? null : 20000)', replace: '? null : 30000)' },
  { ...pools, name: 'Pools 2022-23 has a low pool value limit', find: "const FULL_EXPENSING_YEARS = ['2020-21', '2021-22', '2022-23'];", replace: "const FULL_EXPENSING_YEARS = ['2020-21', '2021-22'];" },
  { ...pools, name: 'Pools $20,000 is below the threshold', find: 'amount < BigInt(threshold) * 100n', replace: 'amount <= BigInt(threshold) * 100n' },
  { ...pools, name: 'Pools opening balance at 15%', find: 'ratioCents(3n * opening, 10n)', replace: 'ratioCents(3n * opening, 20n)' },
  { ...pools, name: 'Pools a balance below zero is not assessable', find: 'assessableIncome: dollars(-amount)', replace: 'assessableIncome: 0' },
  { ...pools, name: 'Pools backing business investment not refused', find: "if (year === '2020-21' && amount === 0n && added !== 0n) {", replace: 'if (false) {' },
  { ...pools, name: 'Capital works 4% manner at 2.5%', find: 'const rateDivisor = four ? 25n : 40n;', replace: 'const rateDivisor = four ? 40n : 40n;' },
  { ...pools, name: 'Capital works days not limited by the start', find: 'const most = Math.max(last - Math.max(begun, first) + 1, 0);', replace: 'const most = Math.max(last - first + 1, 0);' },
  { ...pools, name: 'Capital works not limited to the undeducted expenditure', find: 'const limited = undeducted * reducedBottom < reducedTop;', replace: 'const limited = false;' },
  { ...pools, name: 'Capital works from 17 September 1987', find: "if (begun < /** @type {number} */ (day('1987-09-16'))) {", replace: "if (begun < /** @type {number} */ (day('1987-09-17'))) {" },
  { ...pools, name: 'Capital works 4% from 26 February 1992', find: "const before1992 = begun < /** @type {number} */ (day('1992-02-27'));", replace: "const before1992 = begun < /** @type {number} */ (day('1992-02-26'));" },
  { ...pools, name: 'Pools cost additions at 30%', find: 'ratioCents(3n * improved, 20n)', replace: 'ratioCents(3n * improved, 10n)' },
  { ...pools, name: 'Pools closing balance below zero not assessable', find: 'assessableIncome: dollars(max(total - amount, 0n))', replace: 'assessableIncome: dollars(0n)' },
  { ...pools, name: 'Pools low-value excess not assessable', find: 'assessableExcess: dollars(max(termination - before, 0n))', replace: 'assessableExcess: dollars(0n)' },
  { ...pools, name: 'Capital works over 366 days', find: 'const reducedBottom = rateDivisor * 365n * scale;', replace: 'const reducedBottom = rateDivisor * 366n * scale;' },
  { ...pools, name: 'Capital works 4% allowed before 27 February 1992', find: 'if (four && before1992) {', replace: 'if (false) {' },
  { ...pools, name: 'Capital works taxable use ignored', find: 'const reducedTop = product * use;', replace: 'const reducedTop = product * scale;' },
  { ...casualOt, name: 'Casual loading left out of OTE', find: 'const ote = ordinaryPay + casualLoading + penaltyPay', replace: 'const ote = ordinaryPay + penaltyPay' },
  { ...casualOt, name: 'Overtime counted as OTE', find: 'const ote = ordinaryPay + casualLoading + penaltyPay + leavePay', replace: 'const ote = ordinaryPay + casualLoading + penaltyPay + overtimePay + leavePay' },
  { ...casualOt, name: 'Ordinary-hour penalties left out of OTE', find: 'const ote = ordinaryPay + casualLoading + penaltyPay + leavePay', replace: 'const ote = ordinaryPay + casualLoading + leavePay' },
  { ...casualOt, name: 'Leave loading for lost overtime counted as OTE', find: '(x.leave_loading_overtime ? 0n : leaveLoading)', replace: 'leaveLoading' },
  { ...casualOt, name: 'Super guarantee at 11.5%', find: 'superGuarantee: dollars(ratioCents(ote * 12n, 100n))', replace: 'superGuarantee: dollars(ratioCents(ote * 115n, 1000n))' },
  { ...casualOt, name: 'Super guarantee on gross pay', find: 'superGuarantee: dollars(ratioCents(ote * 12n, 100n))', replace: 'superGuarantee: dollars(ratioCents(grossPay * 12n, 100n))' },
  { ...casualOt, name: 'Casual loading on the penalty lines too', find: 'return { hours, percent, overtime: line.overtime, pay: ratioCents(rate * hours * percent, 1000000n) };', replace: 'return { hours, percent, overtime: line.overtime, pay: ratioCents(rate * hours * (percent + casual), 1000000n) };' },
  { ...casualOt, name: 'Payday Super from 1 July 2025', find: "const QUARTERLY_LAST = '2026-06-30';", replace: "const QUARTERLY_LAST = '2025-06-30';" },
  { ...casualOt, name: 'Quarterly base $60,000', find: 'const QUARTERLY_BASE = 6250000n;', replace: 'const QUARTERLY_BASE = 6000000n;' },
  { ...casualOt, name: 'Base exceeded only above a cent more', find: 'if (ote > base) {', replace: 'if (ote > base + 1n) {' },
  { ...casualOt, name: 'Casual on leave allowed', find: 'if (casual > 0n && leaveHours > 0n) {', replace: 'if (false) {' },
  { ...rdOffset, name: 'R&D refundable premium 18.5 points dropped', find: 'capped * (e.rate + 185n) * 1000n', replace: 'capped * e.rate * 1000n' },
  { ...rdOffset, name: 'R&D threshold $20,000 counted as under it', find: 'const base = total < THRESHOLD ? e.rspCrc : total;', replace: 'const base = total <= THRESHOLD ? e.rspCrc : total;' },
  { ...rdOffset, name: 'R&D cap at $100 million', find: 'const CAP = 15000000000n;', replace: 'const CAP = 10000000000n;' },
  { ...rdOffset, name: 'R&D tier 1 at 16.5%', find: 'min(capped * 1000n, twoPercent) * 85n', replace: 'min(capped * 1000n, twoPercent) * 165n' },
  { ...rdOffset, name: 'R&D tier split at 3% of total expenses', find: 'const twoPercent = e.totalExpenses * 20n;', replace: 'const twoPercent = e.totalExpenses * 30n;' },
  { ...rdOffset, name: 'R&D excess over the cap given no offset', find: 'const excess = max(base - CAP, 0n) * e.rate * 1000n;', replace: 'const excess = 0n;' },
  { ...rdOffset, name: 'R&D turnover of $20 million refundable', find: 'turnover < 2000000000n && !exempt', replace: 'turnover <= 2000000000n && !exempt' },
  { ...rdOffset, name: 'R&D exempt entity control ignored', find: 'turnover < 2000000000n && !exempt', replace: 'turnover < 2000000000n' },
  { ...rdOffset, name: 'R&D base rate entity at 30%', find: 'const corporateRate = (bre) => (bre ? 250n : 300n);', replace: 'const corporateRate = (bre) => (bre ? 300n : 300n);' },
  { ...rdOffset, name: 'R&D feedstock clawback the greater amount', find: 'const clawback = recoupment + min(revenue, expenditure);', replace: 'const clawback = recoupment + max(revenue, expenditure);' },
  { ...rdOffset, name: 'R&D deduction amount not subtracted', find: 'const income = offset - adjusted[6] - deduction;', replace: 'const income = offset - adjusted[6];' },
  { ...rdOffset, name: 'R&D clawback income over the offset year rate', find: 'ratioCents((income < 0n ? -income : income), presentRate * 1000n)', replace: 'ratioCents((income < 0n ? -income : income), e.rate * 1000n)' },
  { ...rdOffset, name: 'R&D clawback below the threshold allowed', find: 'if (clawback !== 0n && e.notional - clawback < THRESHOLD) {', replace: 'if (false) {' },
  { ...blackhole, name: 'Blackhole spread over 4 years', find: 'const FIVE = d(\'5\');', replace: 'const FIVE = d(\'4\');' },
  { ...blackhole, name: 'Blackhole taxable purpose ignored', find: 'const deductible = excluded ? ZERO : mul(it.amount, it.share);', replace: 'const deductible = excluded ? ZERO : it.amount;' },
  { ...blackhole, name: 'Blackhole fifth year dropped', find: 'if (later >= 0) deduction = fifth;', replace: 'if (later > 0) deduction = fifth;' },
  { ...blackhole, name: 'Blackhole start-up cost deducted in later years too', find: 'deduction = it.incurred === year ? deductible : ZERO;', replace: 'deduction = deductible;' },
  { ...blackhole, name: 'Blackhole s 40-880(4)(b) ignored', find: 'item.excludedBy.push(NOT_CONNECTED);', replace: 'void NOT_CONNECTED;' },
  { ...blackhole, name: 'Blackhole s 40-880(7) ignored', find: 'if (!f.flag(\'within_reasonable_time\', \'s 40-880(7) limits expenditure on a proposed business\')) item.excludedBy.push(NOT_REASONABLE_TIME);', replace: 'f.flag(\'within_reasonable_time\', \'s 40-880(7) limits expenditure on a proposed business\');' },
  { ...blackhole, name: 'Blackhole goodwill lifts no exclusion', find: 'if (labels.includes(label) && !(goodwill && (label === \'5(d)\' || label === \'5(f)\'))) item.excludedBy.push(citation);', replace: 'if (labels.includes(label)) item.excludedBy.push(citation);' },
  { ...blackhole, name: 'Blackhole 2019-20 expenditure allowed', find: 'const FIRST_INCURRED = 2020;', replace: 'const FIRST_INCURRED = 2019;' },
  { ...statement, name: 'Statement losses not limited by the excess', find: 'const cap = least(floor(available - fromNei), floor(excess));', replace: 'const cap = floor(available - fromNei);' },
  { ...statement, name: 'Statement net exempt income absorbs no losses', find: 'const neiLeft = excess === 0n ? 0n : floor(nei - floor(-excess));', replace: 'const neiLeft = 0n;' },
  { ...statement, name: 'Statement failed loss test deducted', find: 'else if (test === \'failed\') found = [false, \'s 165-10 ITAA 1997: not deductible\'];', replace: 'else if (test === \'failed\') found = [true, \'s 165-10 ITAA 1997: not deductible\'];' },
  { ...statement, name: 'Statement losses deducted newest first', find: '.sort((a, b) => a.year - b.year);', replace: '.sort((a, b) => b.year - a.year);' },
  { ...statement, name: 'Statement excess refundable offsets not refunded', find: 'const i = floor(e - t3);', replace: 'const i = 0n;' },
  { ...statement, name: 'Statement PAYG instalments not credited', find: 'const s = t5 + g - h - i - k;', replace: 'const s = t5 + g - h - i;' },
  { ...statement, name: 'Statement carry back not capped at the franking balance', find: 'const offset = least(total, balance);', replace: 'const offset = total;' },
  { ...statement, name: 'Statement carry back not capped at the unused liability', find: 'const component = least(sum, cap);', replace: 'const component = sum;' },
  { ...statement, name: 'Statement carry back for 2025-26', find: 'else if (fy === 2027) permanent = true;', replace: 'else if (fy >= 2026) permanent = true;' },
  { ...statement, name: 'Statement carry back ignores net exempt income', find: 'const reduced = floor(p.amount - nei);', replace: 'const reduced = p.amount;' },
  { ...statement, name: 'Statement 2020-21 at 25%', find: 'const rateText = bre ? (fy <= 2020 ? \'0.275\' : fy === 2021 ? \'0.260\' : \'0.250\') : \'0.300\';', replace: 'const rateText = bre ? (fy <= 2020 ? \'0.275\' : \'0.250\') : \'0.300\';' },
  { ...contractor, name: 'Contractor labour of exactly half counted as principally', find: 'const principally = 2 * labour > fee;', replace: 'const principally = 2 * labour >= fee;' },
  { ...contractor, name: 'Contractor right to delegate ignored', find: 'personal: !e.delegate,', replace: 'personal: true,' },
  { ...contractor, name: 'Contractor result contract ignored', find: 'notResult: !e.result,', replace: 'notResult: true,' },
  { ...contractor, name: 'Contractor company contract treated as individual', find: 'const elements = { individual: e.individual,', replace: 'const elements = { individual: true,' },
  { ...contractor, name: 'Super guarantee base cap ignored', find: 'Math.min(earnings, sg.cap * 100)', replace: 'earnings' },
  { ...contractor, name: 'Leave loading always ordinary time earnings', find: 'superGuarantee(salary + (e.loadingQualifying ? loading : 0), sg)', replace: 'superGuarantee(salary + loading, sg)' },
  { ...contractor, name: 'Unclaimable GST left out of the cost', find: 'const gstCost = e.credits ? 0 : gst;', replace: 'const gstCost = 0;' },
  { ...contractor, name: 'Other paid leave not taken off the hours', find: 'WEEKS * 100 - annual - other', replace: 'WEEKS * 100 - annual' },
  { ...contractor, name: 'Payroll tax always without super', find: 'atRate(wages + (e.payrollSuper ? employeeSg : 0), payrollRate)', replace: 'atRate(wages, payrollRate)' },
  { ...invoice, name: 'Tax invoice recipient needed from $1,001', find: 'const RECIPIENT_THRESHOLD = 100000n;', replace: 'const RECIPIENT_THRESHOLD = 100100n;' },
  { ...invoice, name: 'Tax invoice $1,000 itself not enough for the recipient rule', find: 'totalPrice >= RECIPIENT_THRESHOLD', replace: 'totalPrice > RECIPIENT_THRESHOLD' },
  { ...invoice, name: 'Tax invoice recipient needed with no taxable supply', find: '(hasTaxable && totalPrice', replace: '(true && totalPrice' },
  { ...invoice, name: 'Tax invoice GST-inclusive prices taken as 10%', find: 'const divisor = inclusive ? 11n : 10n;', replace: 'const divisor = inclusive ? 10n : 10n;' },
  { ...invoice, name: 'Tax invoice taxable supply rule ignored', find: "x.rounding === 'invoice' || taxable.length < 2", replace: 'true' },
  { ...invoice, name: 'Tax invoice GST-exclusive total leaves out the GST', find: 'const totalPrice = inclusive ? amount : amount + gst;', replace: 'const totalPrice = amount;' },
  { ...invoice, name: 'Tax invoice line amount truncated', find: 'ratioCents(BigInt(Math.round(quantity * 1000)) * BigInt(unit), 1000n)', replace: 'BigInt(Math.floor(quantity * unit))' },
  { ...invoice, name: 'ABN first digit not reduced by 1', find: '(i === 0 ? digit - 1 : digit)', replace: 'digit' },
  { ...invoice, name: 'ABN leading zero accepted', find: 'digits[0] !== 0 && total % 89 === 0', replace: 'total % 89 === 0' },
  { ...invoice, name: 'ABN last 2 weights swapped', find: 'const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];', replace: 'const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 19, 17];' },
  { ...invoice, name: 'RCTI issued without the Determination confirmed', find: 'if (x.rcti_conditions_met !== true)', replace: 'if (false)' },
  { ...invoice, name: 'RCTI omits that the supplier pays the GST', find: 'if (rcti && gst > 0n) statements.push', replace: 'if (false) statements.push' },
  { ...invoice, name: 'Tax invoice download leaves angle brackets unescaped', find: 'text.replace(/[&<>"\']/g,', replace: 'text.replace(/[&"\']/g,' },
  { ...trustStream, name: 'Trust s 99A at 47%', find: 'const tax = mul(trusteeAmount, [45n, 100n]);', replace: 'const tax = mul(trusteeAmount, [47n, 100n]);' },
  { ...trustStream, name: 'Trust discounted gain not grossed up', find: 'const GROSS_UP = { none: 1n, discount: 2n, small_business: 2n, both: 4n };', replace: 'const GROSS_UP = { none: 1n, discount: 1n, small_business: 2n, both: 4n };' },
  { ...trustStream, name: 'Trust both concessions grossed up twice', find: 'const GROSS_UP = { none: 1n, discount: 2n, small_business: 2n, both: 4n };', replace: 'const GROSS_UP = { none: 1n, discount: 2n, small_business: 2n, both: 2n };' },
  { ...trustStream, name: 'Trust no rateable reduction', find: 'const scale = withoutCredits < streamed ? div(whole(withoutCredits), whole(streamed)) : ONE;', replace: 'const scale = ONE;' },
  { ...trustStream, name: 'Trust specific entitlement at the net benefit, not the gain', find: 'specificGain: gainIncome ? div(mul(G, whole(gainBenefit)), whole(gainIncome)) : ZERO,', replace: 'specificGain: gainIncome ? whole(gainBenefit) : ZERO,' },
  { ...trustStream, name: 'Trust adjusted percentage over all trust income', find: 'const base = people.reduce((t, p) => sub(sub(t, p.specificGain), p.specificFranked), whole(trustIncome));', replace: 'const base = whole(trustIncome);' },
  { ...trustStream, name: 'Trust franking credit not shared with the distribution', find: 'credit: franked ? div(mul(whole(credits), frankedShare), F) : ZERO,', replace: 'credit: ZERO,' },
  { ...trustStream, name: 'Trust Division 6E keeps the streamed amounts in present entitlement', find: 'const entitled6E = sub(whole(p.entitlement), s.inIncome);', replace: 'const entitled6E = whole(p.entitlement);' },
  { ...trustStream, name: 'Trust company beneficiary discounts its gain', find: 'const KIND_DISCOUNT = { individual: true, trust: true, company: false };', replace: 'const KIND_DISCOUNT = { individual: true, trust: true, company: true };' },
  { ...trustStream, name: 'Trust trustee gets no franking credit offset', find: 'const afterOffset = sub(tax, trusteeShares.credit);', replace: 'const afterOffset = tax;' },
  { ...gstAdjustments, name: 'GST creditable purpose threshold counted as over it', find: 'cmp(value, d(finance ? \'10000\' : \'1000\')) <= 0', replace: 'cmp(value, d(finance ? \'10000\' : \'1000\')) < 0' },
  { ...gstAdjustments, name: 'GST 5 adjustment periods at $5,000 or less', find: 'const [low, lowCount] = finance ? [\'50000\', 1] : [\'5000\', 2];', replace: 'const [low, lowCount] = finance ? [\'50000\', 1] : [\'5000\', 5];' },
  { ...gstAdjustments, name: 'GST $500,000 given 5 adjustment periods', find: 'cmp(value, d(\'500000\')) < 0 ? 5 : 10', replace: 'cmp(value, d(\'500000\')) <= 0 ? 5 : 10' },
  { ...gstAdjustments, name: 'GST adjustment period without the 12 months', find: 'const earliest = addMonths(attributed + 1, 12);', replace: 'const earliest = addMonths(attributed + 1, 0);' },
  { ...gstAdjustments, name: 'GST increasing adjustment reversed', find: 'mul(full, sub(former, actual))', replace: 'mul(full, sub(actual, former))' },
  { ...gstAdjustments, name: 'GST $2 million turnover threshold exclusive', find: 'd(AA_TURNOVER_THRESHOLD)) <= 0', replace: 'd(AA_TURNOVER_THRESHOLD)) < 0' },
  { ...gstAdjustments, name: 'GST s 11-30 credit without the consideration extent', find: 'const without = product(gst, [purpose, consideration]);', replace: 'const without = product(gst, [purpose]);' },
  { ...gstAdjustments, name: 'GST s 131-55 adjustment reversed', find: '[\'increasing_adjustment\', sub(withIt, without)]', replace: '[\'increasing_adjustment\', sub(without, withIt)]' },
  { ...gstAdjustments, name: 'GST financial acquisitions at 20%', find: 'const tenth = mul(total, d(\'0.10\'));', replace: 'const tenth = mul(total, d(\'0.20\'));' },
  { ...gstAdjustments, name: 'GST $150,000 limit exclusive', find: 'cmp(financial, d(FAT_AMOUNT_LIMIT)) <= 0', replace: 'cmp(financial, d(FAT_AMOUNT_LIMIT)) < 0' },
  { ...gstAdjustments, name: 'GST going concern late agreement accepted', find: 'agreement === \'on_or_before_supply_day\'', replace: 'agreement !== \'none\'' },
  { ...gstAdjustments, name: 'GST second-hand $300 cap from $300', find: 'cmp(consideration, d(SHG_LIMIT)) > 0', replace: 'cmp(consideration, d(SHG_LIMIT)) >= 0' },
  { ...gstAdjustments, name: 'GST second-hand credit the greater', find: 'cmp(gst, eleventh) < 0 ? gst : eleventh', replace: 'cmp(gst, eleventh) > 0 ? gst : eleventh' },
  { ...gstAdjustments, name: 'GST bad debt overdue 11 months', find: 'due = tested >= addMonths(start, 12);', replace: 'due = tested >= addMonths(start, 11);' },
  { ...gstAdjustments, name: 'GST bad debt direction reversed', find: 'const increasing = supplier === recovered;', replace: 'const increasing = supplier !== recovered;' },
  { ...gstAdjustments, name: 'GST bad debt consideration extent ignored', find: 'product(full, [purpose, extent])', replace: 'product(full, [purpose])' },
  { ...gstAdjustments, name: 'GST bad debt at 1/10', find: 'const full = div(amount, d(\'11\'));', replace: 'const full = div(amount, d(\'10\'));' },
  { ...deferredTaxEngine, name: 'Deferred tax liability differences signed as assets', find: 'const closing = liability ? base - carrying : carrying - base;', replace: 'const closing = carrying - base;' },
  { ...deferredTaxEngine, name: 'Deferred tax asset not reduced by unrecognised amounts', find: 'const asset = at(deductible + losses - unrecognised, closingRate);', replace: 'const asset = at(deductible + losses, closingRate);' },
  { ...deferredTaxEngine, name: 'Deferred tax opening liability at the closing rate', find: 'const openingLiability = at(openingTaxable, openingRate);', replace: 'const openingLiability = at(openingTaxable, closingRate);' },
  { ...deferredTaxEngine, name: 'Deferred tax 2020-21 base rate entity at 25%', find: '(!bre ? 30n : year === \'2020-21\' ? 26n : 25n)', replace: '(!bre ? 30n : 25n)' },
  { ...deferredTaxEngine, name: 'Deferred tax rate change without opening unrecognised', find: '(openingNet + openingUnrecognised) * (closingRate - openingRate)', replace: 'openingNet * (closingRate - openingRate)' },
  { ...deferredTaxEngine, name: 'Deferred tax recognition change without amounts used', find: 'at(unrecognised - openingUnrecognised + used, closingRate)', replace: 'at(unrecognised - openingUnrecognised, closingRate)' },
  { ...deferredTaxEngine, name: 'Deferred tax offsets not deducted', find: 'const current = before - offsets;', replace: 'const current = before;' },
  { ...deferredTaxEngine, name: 'Deferred tax reconciliation without the rate gap', find: 'halfUp(change * (closingRate - applicable), 100n)', replace: '0n' },
  { ...deferredTaxEngine, name: 'Deferred tax effective rate truncated', find: 'const ratio = halfUp(expense * 10000n, profit);', replace: 'const ratio = expense * 10000n / profit;' },
  { ...deferredTaxEngine, name: 'Deferred tax unscheduled rate change accepted', find: 'if (openingRate !== closingRate && applicable !== closingRate && (openingLiability !== 0n || openingAsset !== 0n)) {', replace: 'if (false) {' },
  { ...deferredTaxEngine, name: 'Deferred tax half up taken as half down', find: 'const q = (2n * a + b) / (2n * b);', replace: 'const q = (2n * a + b - 1n) / (2n * b);' },
  { ...deferredTaxEngine, name: 'Deferred tax unrecognised above deductible allowed', find: 'if (unrec > ded + loss) {', replace: 'if (unrec > ded + loss + 1000000n) {' },
  { ...asic, name: 'ASIC month counted from the due date itself', find: 'const start = new Date((due + 1) * DAY);', replace: 'const start = new Date(due * DAY);' },
  { ...asic, name: 'ASIC month ends on the same day number next month', find: 'if (corresponding <= length) return Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), corresponding) / DAY - 1;', replace: 'if (corresponding <= length) return Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), Math.min(new Date(due * DAY).getUTCDate(), length)) / DAY;' },
  { ...asic, name: 'ASIC month with no corresponding day ends a day early', find: 'return Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), length) / DAY;', replace: 'return Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), length) / DAY - 1;' },
  { ...asic, name: 'ASIC payment on the due date is late', find: 'if (receivedDay <= dueDay) return', replace: 'if (receivedDay < dueDay) return' },
  { ...asic, name: 'ASIC payment on the last day of the month is in the higher tier', find: 'if (receivedDay <= ends) return result;', replace: 'if (receivedDay < ends) return result;' },
  { ...asic, name: 'ASIC late fee within one month is $428', find: 'within: 102, beyond: 428', replace: 'within: 428, beyond: 428' },
  { ...asic, name: 'ASIC late fee beyond one month is $102', find: 'within: 102, beyond: 428', replace: 'within: 102, beyond: 102' },
  { ...asic, name: 'ASIC proprietary review fee is 2025-26’s $329', find: "Schedule 1 Part 1 item 2' },", replace: "Schedule 1 Part 1 item 2', amount: 329 }," },
  { ...asic, name: 'ASIC share capital registration at $611', find: 'with share capital\', amount: 636,', replace: 'with share capital\', amount: 611,' },
  { ...asic, name: 'ASIC 2026-27 starts on 30 June', find: "from: '2026-07-01'", replace: "from: '2026-06-30'" },
  { ...asic, name: 'ASIC 2026-27 runs into July 2027', find: "to: '2027-06-30'", replace: "to: '2027-07-01'" },
  { ...asic, name: 'ASIC weekend due date not refused', find: 'if (receivedDay <= dueMoves) {', replace: 'if (false) {' },
  { ...asic, name: 'ASIC weekend month end not refused', find: 'if (receivedDay <= latest) {', replace: 'if (false) {' },
  { ...asic, name: 'ASIC a moved due date does not move the month', find: 'for (let day = dueDay; day <= dueMoves; day += 1)', replace: 'for (let day = dueDay; day <= dueDay; day += 1)' },
  { ...asic, name: 'ASIC a month end on a weekend does not move', find: 'latest = Math.max(latest, latestMove(firstMonthEnds(day)));', replace: 'latest = Math.max(latest, firstMonthEnds(day));' },
  { ...asic, name: 'ASIC a due date in 2025-26 is accepted', find: 'if (Math.min(dueDay, receivedDay) < from', replace: 'if (receivedDay < from' },
  { ...asic, name: 'ASIC weekend refusal stops on the Monday', find: 'weekday === 6 ? day + 4 : weekday === 0 ? day + 3 : null', replace: 'weekday === 6 ? day + 2 : weekday === 0 ? day + 1 : null' },
  { ...asic, name: 'ASIC weekend refusal runs to the Thursday', find: 'weekday === 6 ? day + 4 : weekday === 0 ? day + 3 : null', replace: 'weekday === 6 ? day + 5 : weekday === 0 ? day + 4 : null' },
  { ...asic, name: 'ASIC impossible dates roll over', find: '&& date.getUTCMonth() === month - 1 && date.getUTCDate() === day)', replace: ')' },
  { ...asic, name: 'ASIC inherited keys pass as fees', find: 'const entry = Object.hasOwn(ASIC_FEES, fee) ? ASIC_FEES[fee] : null;', replace: '// @ts-ignore\n  const entry = ASIC_FEES[fee] ?? null;' },
  { ...ato, name: 'ATO GIC days always over 365', find: 'const base = BigInt(10000 * yearDays(day));', replace: 'const base = BigInt(10000 * 365);' },
  { ...ato, name: 'ATO GIC payments ignored', find: 'numerator -= paid * denominator;\n    }\n    const [rate, assumed] = rateOf(day);', replace: 'numerator -= 0n;\n    }\n    const [rate, assumed] = rateOf(day);' },
  { ...ato, name: 'ATO GIC rounds the balance down', find: 'const halfUp = (numerator, denominator) => (2n * numerator + denominator) / (2n * denominator);', replace: 'const halfUp = (numerator, denominator) => numerator / denominator;' },
  { ...ato, name: 'ATO SIC at the GIC rate less 3 points', find: 'rate === null ? null : rate - 400;', replace: 'rate === null ? null : rate - 300;' },
  { ...ato, name: 'ATO SIC runs to the notice day', find: 'compound(rateOf, owed, due, notice - 1, [])', replace: 'compound(rateOf, owed, due, notice, [])' },
  { ...ato, name: 'ATO base interest at the GIC rate less 6 points', find: 'rate === null ? null : rate - 700;', replace: 'rate === null ? null : rate - 600;' },
  { ...ato, name: 'ATO failure to lodge counts whole 28-day periods only', find: 'Math.min(Math.ceil(late / 28), 5)', replace: 'Math.min(Math.floor(late / 28), 5)' },
  { ...ato, name: 'ATO failure to lodge caps at 6 units', find: 'Math.min(Math.ceil(late / 28), 5)', replace: 'Math.min(Math.ceil(late / 28), 6)' },
  { ...ato, name: 'ATO failure to lodge values every unit on the due date', find: 'const start = due + 28 * k;', replace: 'const start = due;' },
  { ...ato, name: 'ATO medium entity multiplier 3', find: 'medium: 2n,', replace: 'medium: 3n,' },
  { ...ato, name: 'ATO recklessness at 75%', find: 'recklessness: [50n, 40n]', replace: 'recklessness: [75n, 40n]' },
  { ...ato, name: 'ATO reasonably arguable threshold $1,000', find: '(tax > 100000000n ? tax : 100000000n)', replace: '(tax > 10000000n ? tax : 10000000n)' },
  { ...ato, name: 'ATO item 4 at the threshold itself', find: 'p.shortfall * 100n > thresholdHundredths(c.tax)', replace: 'p.shortfall * 100n >= thresholdHundredths(c.tax)' },
  { ...ato, name: 'ATO statement penalty ignores the accepted-way part', find: '(p.shortfall - p.accepted) * applied * 100n', replace: 'p.shortfall * applied * 100n' },
  { ...ato, name: 'ATO significant global entity not doubled', find: 'scaled * (sge ? 2n : 1n)', replace: 'scaled * 1n' },
  { ...ato, name: 'ATO disclosure before examination cut 80% from $100', find: 'disclosedBefore >= 100000n ? 80n : null', replace: 'disclosedBefore >= 10000n ? 80n : null' },
  { ...ato, name: 'ATO disclosure after notice of examination cut 80%', find: 'p.disclosure === \'during_examination\' ? 20n : 0n', replace: 'p.disclosure === \'during_examination\' ? 80n : 0n' },
  { ...ato, name: 'ATO increase of 10%', find: 'p.increase ? 20n : 0n', replace: 'p.increase ? 10n : 0n' },
  { ...ato, name: 'ATO early payment interest at 14 days early', find: 'const earns = early > 14 && start <= due;', replace: 'const earns = early >= 14 && start <= due;' },
  { ...ato, name: 'ATO early payment interest from the payment despite a later notice', find: 'fsa ? paid : Math.max(paid, f.date(\'notice_issued\'))', replace: 'fsa ? paid : paid' },
  { ...ato, name: 'ATO credit interest under 50 cents paid', find: 'interest >= 50n ? interest : 0n', replace: 'interest' },
  { ...ato, name: 'ATO overpayment refund taken from the earliest payment first', find: '[...paid].sort((a, b) => a[0] - b[0]).reverse()', replace: '[...paid].sort((a, b) => a[0] - b[0])' },
  { ...ato, name: 'ATO overpayment interest from the payment despite a later notice', find: 'const from = Math.max(notice, day);', replace: 'const from = day;' },
  { ...ato, name: 'ATO penalty unit $330 from 1 July 2026 kept', find: '[\'2026-07-01\', 364]', replace: '[\'2026-07-01\', 330]' },
  { ...ato, name: 'ATO form year from the due date', find: 'const last = Object.hasOwn(LAST_DATE, question)', replace: 'const last = question === \'gic\' ? value(\'gic-due\') : Object.hasOwn(LAST_DATE, question)' },
  { ...workExpenses, name: 'work expenses fixed rate 70c from 2024-25 is 67c', find: '\'2024-25\': { fixed: 70 }', replace: '\'2024-25\': { fixed: 67 }' },
  { ...workExpenses, name: 'work expenses 2022-23 keeps the 80c shortcut', find: '\'2022-23\': { fixed: 67 }', replace: '\'2022-23\': { fixed: 67, shortcut: 80 }' },
  { ...workExpenses, name: 'work expenses 52c rate is 67c', find: '\'2021-22\': { fixed: 52, shortcut: 80 }', replace: '\'2021-22\': { fixed: 67, shortcut: 80 }' },
  { ...workExpenses, name: 'work expenses 2026-27 cents per kilometre is 88c', find: '\'2026-27\': 91', replace: '\'2026-27\': 88' },
  { ...workExpenses, name: 'work expenses 2022-23 cents per kilometre is 72c', find: '\'2022-23\': 78', replace: '\'2022-23\': 72' },
  { ...workExpenses, name: 'work expenses kilometre cap is 5,085', find: 'export const KILOMETRE_CAP = 5000;', replace: 'export const KILOMETRE_CAP = 5085;' },
  { ...workExpenses, name: 'work expenses kilometres past the cap count', find: 'const counted = kilometres < cap ? kilometres : cap;', replace: 'const counted = kilometres;' },
  { ...workExpenses, name: 'work expenses reduction is $200', find: 'export const SELF_EDUCATION_REDUCTION = 250;', replace: 'export const SELF_EDUCATION_REDUCTION = 200;' },
  { ...workExpenses, name: 'work expenses reduction runs into 2022-23', find: 'function selfEducation(facts, year, first) {\n  const early = first < 2022;', replace: 'function selfEducation(facts, year, first) {\n  const early = first < 2023;' },
  { ...workExpenses, name: 'work expenses category E does not offset the $250', find: 'const offset = c + d + e;', replace: 'const offset = c + d;' },
  { ...workExpenses, name: 'work expenses reduced category A goes negative', find: 'const reduced = a > reduction ? a - reduction : 0n;', replace: 'const reduced = a - reduction;' },
  { ...workExpenses, name: 'work expenses general study is deductible', find: '[\'maintains_or_improves_skills\', \'increases_income\'].includes', replace: '[\'maintains_or_improves_skills\', \'increases_income\', \'general_only\'].includes' },
  { ...workExpenses, name: 'work expenses not employed is deductible', find: 'const connected = employed && ', replace: 'const connected = ' },
  { ...workExpenses, name: 'work expenses cleaning beside the 52c rate', find: '(early ? [\'phone\', \'internet\', \'stationery\', \'asset_decline\', \'repairs\']', replace: '(early ? [\'phone\', \'internet\', \'stationery\', \'cleaning\', \'asset_decline\', \'repairs\']' },
  { ...workExpenses, name: 'work expenses energy beside the 70c rate', find: ': [\'cleaning\', \'furniture_decline\', \'asset_decline\', \'repairs\']).reduce', replace: ': [\'energy\', \'cleaning\', \'furniture_decline\', \'asset_decline\', \'repairs\']).reduce' },
  { ...workExpenses, name: 'work expenses actual cost leaves out repairs', find: 'const HOME_AMOUNTS = [\'energy\', \'phone\', \'internet\', \'stationery\', \'cleaning\', \'furniture_decline\', \'asset_decline\', \'repairs\'];', replace: 'const HOME_AMOUNTS = [\'energy\', \'phone\', \'internet\', \'stationery\', \'cleaning\', \'furniture_decline\', \'asset_decline\'];' },
  { ...workExpenses, name: 'work expenses hourly rate without running expenses', find: '  if (incurred && dedicated) {', replace: '  if (dedicated) {' },
  { ...workExpenses, name: 'work expenses 52c without a dedicated home office', find: 'const dedicated = !early || flag(facts, \'dedicated_home_office\');', replace: 'const dedicated = true;' },
  { ...workExpenses, name: 'work expenses running expense conflict not refused', find: 'if (!incurred && running.some((name) => x[name] !== 0n)) {', replace: 'if (false) {' },
  { ...workExpenses, name: 'work expenses cleaning not a running expense before 2022-23', find: '...(early ? [\'cleaning\'] : [])', replace: '...([])' },
  { ...workExpenses, name: 'work expenses a tie names the actual cost', find: '(m[1] > best[1] ? m : best)', replace: '(m[1] >= best[1] ? m : best)' },
  { ...workExpenses, name: 'work expenses leap year has 365 days', find: 'const days = (first + 1) % 4 === 0 ? 366 : 365;', replace: 'const days = 365;' },
  { ...workExpenses, name: 'work expenses log book serves 6 years', find: 'if (first - kept > 4) {', replace: 'if (first - kept > 5) {' },
  { ...workExpenses, name: 'work expenses log book serves 4 years', find: 'if (first - kept > 4) {', replace: 'if (first - kept > 3) {' },
  { ...workExpenses, name: 'work expenses 11 week log book', find: 'if (Number(weeks) < 12) {', replace: 'if (Number(weeks) < 11) {' },
  { ...workExpenses, name: 'work expenses unrepresentative log book serves', find: 'if (!flag(facts, \'log_book_representative\')) {', replace: 'if (false) {' },
  { ...workExpenses, name: 'work expenses later log book accepted', find: 'if (kept > first) refuseWorkExpenses', replace: 'if (kept > first + 1) refuseWorkExpenses' },
  { ...workExpenses, name: 'work expenses car not held accepted', find: 'if (!flag(facts, \'owned_or_leased\')) {', replace: 'if (false) {' },
  { ...workExpenses, name: 'work expenses business above total kilometres', find: 'if (total === 0n || business > total) {', replace: 'if (total === 0n) {' },
  { ...workExpenses, name: 'work expenses return amount rounds', find: 'const wholeText = ({ num, den }) => `${num / den}.00`;', replace: 'const wholeText = ({ num, den }) => `${(2n * num + den) / (2n * den)}.00`;' },
  { ...workExpenses, name: 'work expenses cents round down', find: 'const cents = (2n * num * 100n + den) / (2n * den);', replace: 'const cents = (num * 100n) / den;' },
  { ...workExpenses, name: 'work expenses product keeps every digit', find: 'const product = significant({ c: expenses * percentage.c, e: percentage.e - 2 });', replace: 'const product = { c: expenses * percentage.c, e: percentage.e - 2 };' },
  { ...workExpenses, name: 'work expenses reimbursed accepted', find: 'if (flag(facts, \'reimbursed\')) {', replace: 'if (false) {' },
  { ...workExpenses, name: 'work expenses allowance accepted', find: 'if (flag(facts, \'allowance_received\')) {', replace: 'if (false) {' },
  { ...workExpenses, name: 'work expenses amount cap raised', find: 'number(facts[name], { max: 1e12, money: true })', replace: 'number(facts[name], { max: 1e13, money: true })' },
  { ...workExpenses, name: 'work expenses category D beside log book car accepted', find: 'if (d !== 0n && logBookCar) {', replace: 'if (false) {' },
  { ...workExpenses, name: 'work expenses input for another method accepted', find: "if (extra) refuseWorkExpenses('input.field_unknown'", replace: "if (false) refuseWorkExpenses('input.field_unknown'" },
  { ...workExpenses, name: 'work expenses dedicated office taken from 2022-23', find: "...(early ? ['dedicated_home_office'] : [])", replace: "'dedicated_home_office'" },
  { ...workExpenses, name: 'work expenses category E taken without a prescribed course', find: "...(early && facts.prescribed_course === true ? ['category_e'] : [])", replace: "...(early ? ['category_e'] : [])" },
  { ...workExpenses, name: 'work expenses 2027-28 accepted', find: '\'2025-26\', \'2026-27\'];\nexport const WORK_EXPENSES_METHODS', replace: '\'2025-26\', \'2026-27\', \'2027-28\'];\nexport const WORK_EXPENSES_METHODS' },
  { ...governmentSuper, name: 'government super 2025-26 lower threshold typed a dollar low', find: '\'2025-26\': [47488, 62488]', replace: '\'2025-26\': [47487, 62488]' },
  { ...governmentSuper, name: 'government super 2027-28 accepted', find: '\'2026-27\': [49293, 64293],', replace: '\'2026-27\': [49293, 64293], \'2027-28\': [49293, 64293],' },
  { ...governmentSuper, name: 'government super taper of 3.33 cents', find: 'const TAPER = 3333n;', replace: 'const TAPER = 3330n;' },
  { ...governmentSuper, name: 'government super maximum of $501', find: 'const MAXIMUM = 500n * DOLLAR;', replace: 'const MAXIMUM = 501n * DOLLAR;' },
  { ...governmentSuper, name: 'government super no $20 minimum', find: 'const MINIMUM = 20n * DOLLAR;', replace: 'const MINIMUM = 0n * DOLLAR;' },
  { ...governmentSuper, name: 'government super matches the whole contribution', find: 'const matched = p.personal / 2n;', replace: 'const matched = p.personal;' },
  { ...governmentSuper, name: 'government super pays at the higher threshold', find: 'total < BigInt(higher) * DOLLAR', replace: 'total <= BigInt(higher) * DOLLAR' },
  { ...governmentSuper, name: 'government super taper starts a dollar late', find: 'most(0n, total - BigInt(lower) * DOLLAR)', replace: 'most(0n, total - BigInt(lower + 1) * DOLLAR)' },
  { ...governmentSuper, name: 'government super payment always adds 5 cents', find: '(u + 5n * CENT - 1n) / (5n * CENT)', replace: '(u + 5n * CENT) / (5n * CENT)' },
  { ...governmentSuper, name: 'government super amounts shown cut to the cent', find: 'const cents = (size + CENT / 2n) / CENT;', replace: 'const cents = size / CENT;' },
  { ...governmentSuper, name: 'government super 10% test needs more than 10%', find: 'eligible * 10n >= testTotal', replace: 'eligible * 10n > testTotal' },
  { ...governmentSuper, name: 'government super 10% test after business deductions', find: 'const testTotal = total + business;', replace: 'const testTotal = total;' },
  { ...governmentSuper, name: 'government super nil total income measured', find: 'const tenPercent = testTotal === 0n ? null : eligible * 10n >= testTotal;', replace: 'const tenPercent = eligible * 10n >= testTotal;' },
  { ...governmentSuper, name: 'government super eligible income above total accepted', find: 'if (eligible > testTotal) {', replace: 'if (false) {' },
  { ...governmentSuper, name: 'government super lodged return not required', find: '[\'return_lodged\', p.lodged]', replace: '[\'return_lodged\', true]' },
  { ...governmentSuper, name: 'government super age not tested', find: '[\'under_71\', p.under71]', replace: '[\'under_71\', true]' },
  { ...governmentSuper, name: 'government super non-concessional cap not tested', find: '[\'non_concessional_within_cap\', p.nonConcessional]', replace: '[\'non_concessional_within_cap\', true]' },
  { ...governmentSuper, name: 'government super balance not tested', find: '[\'total_super_balance_below_cap\', p.balance]', replace: '[\'total_super_balance_below_cap\', true]' },
  { ...governmentSuper, name: 'government super a condition not met does not decide', find: '  if (met.some(([, value]) => value === false)) return false;\n', replace: '' },
  { ...governmentSuper, name: 'government super nil income refused as a missing fact', find: 'if (missing?.[0] === TEN_PERCENT) {', replace: 'if (false) {' },
  { ...governmentSuper, name: 'government super a fact not given passes', find: '  if (missing) {\n', replace: '  if (false) {\n' },
  { ...governmentSuper, name: 'government super null read as a flag', find: 'return facts[name] === null ? null : flag(facts, name);', replace: 'return flag(facts, name);' },
  { ...governmentSuper, name: 'government super temporary visa accepted', find: 'if (flag(facts, \'temporary_visa_held\')) {', replace: 'if (facts.temporary_visa_held === \'held\') {' },
  { ...governmentSuper, name: 'government super foreign resident accepted', find: '\'working_holiday_maker\', \'foreign_resident\'];', replace: '\'working_holiday_maker\'];' },
  { ...governmentSuper, name: 'government super part of the spouse inputs accepted', find: 'if (given.length && given.length < SPOUSE_INPUTS.length) {', replace: 'if (false) {' },
  { ...governmentSuper, name: 'government super scope not confirmed accepted', find: 'if (facts.scope_confirmed !== true)', replace: 'if (facts.scope_confirmed === false && false)' },
  { ...governmentSuper, name: 'government super amount cap raised', find: 'number(facts[name], { max: 1e12, money: true })', replace: 'number(facts[name], { max: 1e13, money: true })' },
  { ...governmentSuper, name: 'government super LISTO at $37,000 refused', find: 'ati <= LISTO_LIMIT', replace: 'ati < LISTO_LIMIT' },
  { ...governmentSuper, name: 'government super LISTO at 16%', find: 'const fifteen = (p.concessional * 15n) / 100n;', replace: 'const fifteen = (p.concessional * 16n) / 100n;' },
  { ...governmentSuper, name: 'government super LISTO paid from the unrounded 15%', find: 'const nearestCent = ((fifteen + CENT / 2n) / CENT) * CENT;', replace: 'const nearestCent = fifteen;' },
  { ...governmentSuper, name: 'government super LISTO minimum of $1', find: 'const LISTO_MINIMUM = 10n * DOLLAR;', replace: 'const LISTO_MINIMUM = 1n * DOLLAR;' },
  { ...governmentSuper, name: 'government super LISTO maximum of $510', find: 'const LISTO_MAXIMUM = 500n * DOLLAR;', replace: 'const LISTO_MAXIMUM = 510n * DOLLAR;' },
  { ...governmentSuper, name: 'government super LISTO without concessional contributions', find: '[\'concessional_contributions_made\', p.concessional !== 0n]', replace: '[\'concessional_contributions_made\', true]' },
  { ...governmentSuper, name: 'government super LISTO skips the 10% test', find: '[\'adjusted_taxable_income_37000\', ati <= LISTO_LIMIT], [TEN_PERCENT, p.tenPercent]', replace: '[\'adjusted_taxable_income_37000\', ati <= LISTO_LIMIT], [TEN_PERCENT, true]' },
  { ...governmentSuper, name: 'government super spouse offset at 17%', find: '(least(limit, made) * 18n) / 100n', replace: '(least(limit, made) * 17n) / 100n' },
  { ...governmentSuper, name: 'government super spouse base of $3,001', find: 'const SPOUSE_BASE = 3000n * DOLLAR;', replace: 'const SPOUSE_BASE = 3001n * DOLLAR;' },
  { ...governmentSuper, name: 'government super spouse taper from $37,001', find: 'const SPOUSE_TAPER_START = 37000n * DOLLAR;', replace: 'const SPOUSE_TAPER_START = 37001n * DOLLAR;' },
  { ...governmentSuper, name: 'government super spouse at $40,000 accepted', find: 'income < SPOUSE_LIMIT', replace: 'income <= SPOUSE_LIMIT' },
  { ...governmentSuper, name: 'government super spouse FHSS amount kept', find: 'const income = assessable - fhss + fringe', replace: 'const income = assessable + fringe' },
  { ...governmentSuper, name: 'government super spouse excess not taken off', find: 'most(0n, employer - excess)', replace: 'employer' },
  { ...governmentSuper, name: 'government super spouse FHSS conflict accepted', find: 'if (fhss > assessable) {', replace: 'if (false) {' },
  { ...governmentSuper, name: 'government super spouse excess conflict accepted', find: 'if (excess > assessable) {', replace: 'if (false) {' },
  { ...governmentSuper, name: 'government super spouse balance not tested', find: 'stated(facts, \'spouse_total_super_balance_below_cap\')]', replace: 'true]' },
  { ...governmentSuper, name: 'government super spouse cap not tested', find: 'stated(facts, \'spouse_non_concessional_within_cap\')],', replace: 'true],' },
  { ...governmentSuperResult, name: 'government super not known read as no', find: '(answer === \'unknown\' ? null : answer === \'yes\')', replace: '(answer === \'yes\')' },
  { ...governmentSuperResult, name: 'government super a non-resident passed as resident', find: 'yes(\'resident\') ? \'full_year_resident\' : \'part_year_resident\'', replace: '\'full_year_resident\'' },
  { ...governmentSuperResult, name: 'government super thresholds shown the wrong way', find: '`${whole(r.rates.lower_income_threshold)} and ${whole(r.rates.higher_income_threshold)}`', replace: '`${whole(r.rates.higher_income_threshold)} and ${whole(r.rates.lower_income_threshold)}`' },
  { ...tba, name: 'TBA cap not indexed', find: 'raised = Math.trunc((increase * unused) / 100);', replace: 'raised = 0;' },
  { ...tba, name: 'TBA unused cap percentage a point lower', find: '100 - Number((highest.cents * 100n)', replace: '99 - Number((highest.cents * 100n)' },
  { ...tba, name: 'TBA indexed after an excess', find: "if (increase > 0 && exceeded) row.why = 'exceeded';", replace: "if (false) row.why = 'exceeded';" },
  { ...tba, name: 'TBA earnings never credited', find: 'num += pending;', replace: 'num += 0n;' },
  { ...tba, name: 'TBA earnings at the GIC rate less a point', find: 'const earned = over * BigInt(gic);', replace: 'const earned = over * BigInt(gic - 100);' },
  { ...tba, name: 'TBA a later period taxed at 15%', find: 'const rate = second ? 30 : 15;', replace: 'const rate = 15;' },
  { ...tba, name: 'TBA liable from a period before 1 July 2018', find: 'liable ||= p.from >= SECOND_RATE_FROM;', replace: 'liable = true;' },
  { ...tba, name: 'TBA IT(TP)A s 294-30 ignored', find: 'if (over > 0n && !(disregard && day <= TRANSITION_END))', replace: 'if (over > 0n)' },
  { ...tba, name: 'TBA IT(TP)A s 294-30 to $1.8 million', find: 'sum > 170000000n', replace: 'sum > 180000000n' },
  { ...tba, name: 'TBA cents rounded half down', find: '(2n * magnitude + den) / (2n * den)', replace: '(2n * magnitude + den - 1n) / (2n * den)' },
  { ...tba, name: 'TBA a reversionary income stream taken', find: "if (why !== undefined) refuse('transfer_balance.event_refused'", replace: "if (false) refuse('transfer_balance.event_refused'" },
  { ...excess, name: 'excess charge at the SIC rate plus a point', find: 'rate - 400', replace: 'rate - 300' },
  { ...excess, name: 'excess charge to the due day', find: 'day < due; day += 1', replace: 'day <= due; day += 1' },
  { ...excess, name: 'excess charge after 2020-21', find: 'if (start >= 2021)', replace: 'if (start >= 2022)' },
  { ...excess, name: 'excess proxy rate without 7 points', find: 'const n = BigInt(sum + 700 * days);', replace: 'const n = BigInt(sum + 600 * days);' },
  { ...excess, name: 'excess release of 90% of the earnings', find: 'excess + earned * 85n', replace: 'excess + earned * 90n' },
  { ...excess, name: 'excess earnings from 2 July', find: 'determination - firstDay(start) + 1', replace: 'determination - firstDay(start)' },
  { ...tbaPage, name: 'TBA page principal is the balance', find: 'rows, principal: 5, note', replace: 'rows, principal: 0, note' },
  { ...tbaPage, name: 'TBA form year of the day before', find: "year: last === null ? '' : label(yearOf(last))", replace: "year: last === null ? '' : label(yearOf(last - 1))" },
  { ...pm, name: 'pension 65 at 4%', find: '[65, 5n]', replace: '[66, 5n]' },
  { ...pm, name: 'pension nil for the last 31 days', find: 'days <= 30 ?', replace: 'days <= 31 ?' },
  { ...pm, name: 'pension $5 rounded down', find: '(2n * num + 1000n * den) / (2000n * den)', replace: '(2n * num + 999n * den) / (2000n * den)' },
  { ...pm, name: 'pension no 366-day year', find: "whole(input.get('days'), daysInYear)", replace: "whole(input.get('days'), 365)" },
  { ...pm, name: 'pension first year over 365 days', find: 'BigInt(days), 100n * BigInt(daysInYear)', replace: 'BigInt(days), 36500n' },
  { ...pm, name: 'pension negative balance taken', find: '(parts.negative && cents !== 0n) || ', replace: '' },
  { ...pm, name: 'pension scope not needed', find: "if (input.get('scope_confirmed') !== true) refuse", replace: 'if (false) refuse' },
  { ...pm, name: 'pension age to 149', find: "whole(input.get('age'), 150)", replace: "whole(input.get('age'), 149)" },
  { ...pm, name: 'pension form counts to 29 June', find: 'Date.UTC(second, 5, 30)', replace: 'Date.UTC(second, 5, 29)' },
  { ...pm, name: 'pension page principal is the balance', find: 'rows, principal: 4, note', replace: 'rows, principal: 0, note' },
  { ...rd, name: 'residency one-half enough', find: 'Math.floor(yearDays / 2) + 1', replace: 'Math.floor(yearDays / 2)' },
  { ...rd, name: 'residency exception on the abode alone', find: 'usualOutside && !intends', replace: 'usualOutside' },
  { ...rd, name: 'residency departure day not counted', find: 'Math.min(to, last) - first + 1', replace: 'Math.min(to, last) - first' },
  { ...rd, name: 'residency days before 1 July counted', find: 'Math.max(from, first) - first', replace: '0' },
  { ...rd, name: 'residency 30 June dropped', find: 'Date.UTC(start + 1, 5, 30) / DAY]', replace: 'Date.UTC(start + 1, 5, 29) / DAY]' },
  { ...rd, name: 'residency treaty refusal dropped', find: 'metBy.length > 0 && elsewhere', replace: 'false' },
  { ...rd, name: 'residency scope not needed', find: "if (input.get('scope_confirmed') !== true) refuse", replace: 'if (false) refuse' },
  { ...rd, name: 'residency form blank departure is 29 June', find: '`${start + 1}-06-30`', replace: '`${start + 1}-06-29`' },
  { ...rd, name: 'residency page principal is the count', find: 'rows: table, principal: 3, note', replace: 'rows: table, principal: 0, note' },
];

// Runs that must read as invalid, not as caught.
const CONTROLS = [
  { ...business, name: 'a broken import', find: '// Planning arithmetic.',
    replace: "import './no-such-module.mjs';\n// Planning arithmetic." },
];

const SHARED = [
  'rates/register/series', '_data/calculator_cases.json', 'tools/business-calculators',
  '_includes/calculators', 'rates/div7a-benchmark-rate', 'rates/transfer-duty', 'rates/fbt-rate',
  'rates/general-interest-charge', '_data/individual_tax_cases.json', 'tools/individual-tax',
  'rates/individual-income-tax', 'rates/study-loan-repayment', 'rates/super-guarantee',
  'rates/maximum-contribution-base', 'rates/car-limit', 'tools/payday-super', 'llms.txt',
  '.well-known/llms.txt', '_layouts/calculator.html', 'scripts/fbt-engine-differential.json',
  'scripts/fbt-property-expense-engine-differential.json',
  'scripts/lump-sum-arrears-engine-differential.json',
  'scripts/income-tests-engine-differential.json',
  'scripts/income-tax-offsets-engine-differential.json',
  'scripts/net-medical-expenses-engine-differential.json',
  'scripts/foreign-income-engine-differential.json',
  'scripts/minors-income-engine-differential.json',
  'scripts/non-commercial-losses-engine-differential.json',
  'scripts/government-super-engine-differential.json',
  'scripts/transfer-balance-engine-differential.json',
  'scripts/pension-minimum-engine-differential.json',
  'scripts/residency-days-engine-differential.json',
  'scripts/concessional-catch-up-engine-differential.json',
  'scripts/unused-leave-engine-differential.json',
  'scripts/franking-account-engine-differential.json',
  'scripts/fuel-tax-credits-engine-differential.json',
  'scripts/luxury-car-tax-engine-differential.json',
  'scripts/depreciation-pools-engine-differential.json',
  'scripts/rd-tax-offset-engine-differential.json',
  'scripts/blackhole-expenditure-engine-differential.json',
  'scripts/company-tax-statement-engine-differential.json',
  'scripts/gst-adjustments-engine-differential.json',
  'scripts/deferred-tax-engine-differential.json',
  'scripts/ato-penalties-interest-engine-differential.json',
  'scripts/borrowing-expenses-engine-differential.json',
  'scripts/wine-equalisation-tax-engine-differential.json',
  'scripts/rental-property-engine-differential.json',
  '_includes/duty-jurisdictions.html', '_includes/finance-fields.html',
  '_data/payday_super_business_days.json', 'scripts/payg-withholding-sample.json',
  'scripts/payg-withholding-sample-2020.json', 'scripts/payg-withholding-sample-2024.json',
  'scripts/super-benefit-tax-engine-differential.json',
  'scripts/super-lump-sum-options-engine-differential.json',
];

const TEST_FILES = [
  levy.test, business.test, individualTest,
  'scripts/fhss.test.mjs', 'scripts/work-expenses.test.mjs', 'scripts/government-super-amounts.test.mjs', swh.test, tba.test, pm.test, rd.test,
  'scripts/net-medical-expenses.test.mjs',
  'scripts/foreign-income.test.mjs',
  'scripts/minors-income.test.mjs',
  'scripts/non-commercial-losses.test.mjs',
];

const MAX_PATTERN_LENGTH = 12000;
const MAX_CANDIDATE_TESTS = 60;
const MIN_CANDIDATE_SCORE = 10;
const MIN_SUITE_FOR_TARGETING = 40;
const FORCE_KILL_DELAY_MS = 2000;

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'from', 'with', 'that', 'this', 'not', 'are', 'its', 'has', 'have', 'was',
  'can', 'per', 'off', 'out', 'all', 'one', 'two', 'uses', 'used', 'does', 'when', 'than', 'into',
  'over', 'only', 'each', 'more', 'less', 'also', 'without', 'instead', 'before', 'after', 'under',
  'above', 'below', 'between', 'returns', 'gives', 'takes', 'keeps', 'leaves', 'adds', 'drops',
  'skips', 'accepted', 'refused', 'page', 'result', 'amount', 'amounts', 'rate', 'rates',
]);

export const resolveWorkerCount = (envValue, parallelism, taskCount) => {
  const raw = envValue === undefined ? '' : String(envValue).trim();
  let requested = Math.max(1, parallelism);
  if (raw !== '') {
    if (!/^[1-9]\d*$/.test(raw)) {
      throw new RangeError(`MUTATION_WORKERS must be a positive integer, got ${JSON.stringify(envValue)}`);
    }
    requested = Number.parseInt(raw, 10);
    if (!Number.isSafeInteger(requested)) {
      throw new RangeError(`MUTATION_WORKERS must be a safe positive integer, got ${JSON.stringify(envValue)}`);
    }
  }
  return Math.min(requested, Math.max(1, taskCount));
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const buildNamePattern = (names, maxLength = MAX_PATTERN_LENGTH) => {
  const parts = [];
  let length = 6; // ^(?:)$
  for (const name of names) {
    const escaped = escapeRegex(name);
    const added = escaped.length + (parts.length > 0 ? 1 : 0);
    if (length + added > maxLength) break;
    parts.push(escaped);
    length += added;
  }
  return parts.length > 0 ? `^(?:${parts.join('|')})$` : null;
};

const tokenize = (text) => {
  const words = text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return [...new Set(words.filter((token) => token.length >= 2 && !STOP_WORDS.has(token)))];
};

export const indexSuiteTests = (names) => names.map((name) => ({
  name,
  lower: name.toLowerCase(),
  tokens: new Set(tokenize(name)),
}));

const scoreTokens = (entry, tokens, exactWeight, partialWeight) => {
  let score = 0;
  for (const token of tokens) {
    if (entry.tokens.has(token)) score += exactWeight;
    else if (partialWeight > 0 && token.length >= 4 && entry.lower.includes(token)) score += partialWeight;
  }
  return score;
};

const scoreEntry = (entry, killers, criteria) => {
  let score = killers?.has(entry.name) ? 200 : 0;
  if (criteria.fileSlug && (entry.lower.includes(criteria.fileSlug) || entry.lower.includes(criteria.filePhrase))) {
    score += 15;
  }
  score += scoreTokens(entry, criteria.nameTokens, 12, 5);
  score += scoreTokens(entry, criteria.fileTokens, 6, 3);
  score += scoreTokens(entry, criteria.findTokens, 4, 0);
  return score;
};

export const rankCandidateTests = (entries, mutation, killers = null, limit = MAX_CANDIDATE_TESTS) => {
  if (!entries || entries.length === 0) return [];
  const rawStem = basename(mutation.file, '.mjs').replace(/-result$/, '').toLowerCase();
  const specific = rawStem !== 'business-calculators';
  const criteria = {
    fileSlug: specific ? rawStem : '',
    filePhrase: specific ? rawStem.replace(/-/g, ' ') : '',
    fileTokens: specific ? tokenize(rawStem) : [],
    nameTokens: tokenize(mutation.name ?? ''),
    findTokens: tokenize(mutation.find ?? '').filter((token) => token.length >= 4),
  };
  const scored = [];
  for (const entry of entries) {
    const score = scoreEntry(entry, killers, criteria);
    if (score >= MIN_CANDIDATE_SCORE) scored.push({ name: entry.name, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((item) => item.name);
};

const unescapeTapName = (raw) => raw.replace(/\\([\\#])/g, '$1');

export const createTapTracker = ({ collectPassed = false } = {}) => {
  let buffer = '';
  let block = null;
  let caught = false;
  let killer = null;
  const passed = [];

  const handleYamlLine = (line) => {
    if (line === `${block.keyIndent}...`) {
      if (block.hasTestCodeFailure && block.hasAssertion && block.hasAssertionName && block.hasOperator) {
        caught = true;
        if (block.topLevel) killer = block.name;
      }
      block = null;
    } else if (line === `${block.keyIndent}failureType: 'testCodeFailure'`) {
      block.hasTestCodeFailure = true;
    } else if (line === `${block.keyIndent}code: 'ERR_ASSERTION'`) {
      block.hasAssertion = true;
    } else if (line === `${block.keyIndent}name: 'AssertionError'`) {
      block.hasAssertionName = true;
    } else if (line.startsWith(`${block.keyIndent}operator: `)) {
      block.hasOperator = true;
    }
  };

  const processLine = (line) => {
    if (caught) return;
    if (block?.inYaml) {
      handleYamlLine(line);
      return;
    }
    const ok = collectPassed ? /^ok \d+ - (.+)$/.exec(line) : null;
    if (ok) {
      passed.push(unescapeTapName(ok[1]));
      block = null;
      return;
    }
    const notOk = /^(\s*)not ok \d+ - (.+)$/.exec(line);
    if (notOk) {
      const indent = notOk[1];
      block = {
        name: unescapeTapName(notOk[2]),
        topLevel: indent.length === 0,
        keyIndent: `${indent}  `,
        inYaml: false,
        hasTestCodeFailure: false,
        hasAssertion: false,
        hasAssertionName: false,
        hasOperator: false,
      };
      return;
    }
    if (block) {
      block.inYaml = line === `${block.keyIndent}---`;
      if (!block.inYaml) block = null;
    }
  };

  const feed = (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      processLine(line);
      newline = buffer.indexOf('\n');
    }
    return caught;
  };

  const flush = () => {
    if (buffer.length > 0) {
      const line = buffer.replace(/\r$/, '');
      buffer = '';
      processLine(line);
    }
    return { caught, killer, passed };
  };

  return { feed, flush };
};

export const interleaveQueue = (indices, mutations) => {
  const groups = new Map();
  for (const index of indices) {
    const { file, test } = mutations[index];
    const key = `${file}\0${test}`;
    const bucket = groups.get(key) ?? [];
    if (bucket.length === 0) groups.set(key, bucket);
    bucket.push(index);
  }
  const ordered = [];
  let round = 0;
  let added = true;
  while (added) {
    added = false;
    for (const bucket of groups.values()) {
      if (round < bucket.length) {
        ordered.push(bucket[round]);
        added = true;
      }
    }
    round += 1;
  }
  return ordered;
};

const childEnvFor = (compileCache) => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT'));
  if (compileCache) env.NODE_COMPILE_CACHE = compileCache;
  return env;
};

export const verdict = (
  cwd,
  test,
  { namePattern = null, failFast = true, collectPassed = false, compileCache = null } = {},
) => new Promise((resolve, reject) => {
  const args = ['--test', '--test-isolation=none', '--test-reporter=tap'];
  if (namePattern) args.push(`--test-name-pattern=${namePattern}`);
  args.push(test);

  const child = spawn(process.execPath, args, {
    cwd,
    env: childEnvFor(compileCache),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tracker = createTapTracker({ collectPassed });
  let earlyStop = false;
  let forceKillTimer = null;

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    if (tracker.feed(chunk) && failFast && !earlyStop) {
      earlyStop = true;
      child.kill();
      forceKillTimer = setTimeout(() => child.kill('SIGKILL'), FORCE_KILL_DELAY_MS);
      forceKillTimer.unref();
    }
  });
  child.stderr.resume();
  child.on('error', (error) => {
    clearTimeout(forceKillTimer);
    reject(error);
  });
  child.on('close', (status) => {
    clearTimeout(forceKillTimer);
    const { caught, killer, passed } = tracker.flush();
    if (earlyStop) resolve({ status: 'caught', killer, passed });
    else if (status === 0) resolve({ status: 'survived', killer: null, passed });
    else if (status === 1 && caught) resolve({ status: 'caught', killer, passed });
    else resolve({ status: 'invalid', killer: null, passed });
  });
});

const allSettledOrThrow = async (promises) => {
  const settled = await Promise.allSettled(promises);
  const failed = settled.find((item) => item.status === 'rejected');
  if (failed) throw failed.reason;
  return settled.map((item) => item.value);
};

const selectTargetPattern = (mutation, killers, suiteIndex) => {
  const key = `${mutation.file}\0${mutation.test}`;
  const known = killers?.get(key);
  const entries = suiteIndex?.get(mutation.test);
  if (entries && entries.length > MIN_SUITE_FOR_TARGETING) {
    const ranked = rankCandidateTests(entries, mutation, known);
    if (ranked.length > 0 && ranked.length < entries.length) {
      return buildNamePattern(ranked);
    }
  }
  return known && known.size > 0 ? buildNamePattern(known) : null;
};

const recordKiller = (killers, key, killer) => {
  if (!killers || !killer) return;
  let set = killers.get(key);
  if (!set) {
    set = new Set();
    killers.set(key, set);
  }
  set.add(killer);
};

export const checkMutation = async (cwd, template, source, mutation, killers = null, suiteIndex = null, compileCache = null) => {
  const { file, test, find, replace } = mutation;
  const target = join(cwd, file);
  writeFileSync(target, source.replace(find, replace));
  return (async () => {
    const key = `${file}\0${test}`;
    const namePattern = killers || suiteIndex ? selectTargetPattern(mutation, killers, suiteIndex) : null;
    if (namePattern) {
      const fast = await verdict(cwd, test, { namePattern, compileCache });
      if (fast.status === 'caught') return 'caught';
    }
    const full = await verdict(cwd, test, { compileCache });
    if (full.status === 'caught') recordKiller(killers, key, full.killer);
    return full.status;
  })().finally(() => copyFileSync(join(template, file), target));
};

const prepareTemplate = (work) => {
  const template = join(work, 'template');
  mkdirSync(join(template, 'assets'), { recursive: true });
  mkdirSync(join(template, 'scripts'), { recursive: true });
  for (const name of readdirSync(join(root, 'assets')).filter((entry) => entry.endsWith('.mjs'))) {
    copyFileSync(join(root, 'assets', name), join(template, 'assets', name));
  }
  for (const test of TEST_FILES) copyFileSync(join(root, test), join(template, test));
  for (const shared of SHARED) {
    cpSync(join(root, shared), join(template, shared), { recursive: true });
  }
  return template;
};

const runBaselines = async (template) => {
  const baselines = [...new Set([levy.test, business.test, individualTest, ...MUTATIONS.map((entry) => entry.test)])];
  const results = await allSettledOrThrow(
    baselines.map((test) => verdict(template, test, { failFast: false, collectPassed: true })),
  );
  const suiteIndex = new Map();
  for (let i = 0; i < baselines.length; i += 1) {
    if (results[i].status !== 'survived') throw new Error(`${baselines[i]} fails before any mutation`);
    suiteIndex.set(baselines[i], indexSuiteTests(results[i].passed));
  }
  return suiteIndex;
};

const collectQueue = (sourceOf) => {
  const results = new Array(MUTATIONS.length);
  const rawQueue = [];
  for (let i = 0; i < MUTATIONS.length; i += 1) {
    const { file, find } = MUTATIONS[i];
    if (sourceOf(file).split(find).length !== 2) {
      results[i] = 'stale';
    } else {
      rawQueue.push(i);
    }
  }
  return { results, queue: interleaveQueue(rawQueue, MUTATIONS) };
};

const reportResults = (results) => {
  let failures = 0;
  for (let i = 0; i < MUTATIONS.length; i += 1) {
    const { file, name } = MUTATIONS[i];
    const result = results[i];
    if (result === 'stale') {
      console.log(`STALE     ${name}: the text to change is not in ${file} exactly once`);
      failures += 1;
    } else {
      console.log(`${result === 'caught' ? 'caught   ' : result.toUpperCase()} ${name}`);
      if (result !== 'caught') failures += 1;
    }
  }
  return failures;
};

const main = async () => {
  const configuredWorkers = resolveWorkerCount(process.env.MUTATION_WORKERS, availableParallelism(), MUTATIONS.length);
  const work = mkdtempSync(join(tmpdir(), 'mutation-check-'));
  let failures = 0;

  // A promise's finally, not a try block: Codacy's ESLint rule security-node/detect-unhandled-async-errors
  // crashes on a try without a catch, and that stops its analysis of other files.
  await (async () => {
    const template = prepareTemplate(work);
    const suiteIndex = await runBaselines(template);
    const sources = new Map();
    const sourceOf = (file) => {
      let text = sources.get(file);
      if (text === undefined) {
        text = readFileSync(join(root, file), 'utf8');
        sources.set(file, text);
      }
      return text;
    };

    const { results, queue } = collectQueue(sourceOf);
    const workerCount = Math.min(configuredWorkers, Math.max(1, queue.length));
    const workers = Array.from({ length: workerCount }, (_, index) => {
      const cwd = join(work, `worker-${index}`);
      cpSync(template, cwd, { recursive: true });
      return { cwd, compileCache: join(work, `cache-${index}`) };
    });

    for (const control of CONTROLS) {
      const result = await checkMutation(workers[0].cwd, template, sourceOf(control.file), control);
      console.log(`control   ${control.name}: ${result}`);
      if (result !== 'invalid') failures += 1;
    }

    const killers = new Map();
    let next = 0;
    await allSettledOrThrow(workers.map(async ({ cwd, compileCache }) => {
      while (next < queue.length) {
        const index = queue[next];
        next += 1;
        const mutation = MUTATIONS[index];
        results[index] = await checkMutation(
          cwd,
          template,
          sourceOf(mutation.file),
          mutation,
          killers,
          suiteIndex,
          compileCache,
        );
      }
    }));

    failures += reportResults(results);
  })().finally(() => {
    rmSync(work, { recursive: true, force: true, maxRetries: 3 });
  });
  console.log(failures ? `mutation check: ${failures} of ${MUTATIONS.length} need attention` : `mutation check: ${MUTATIONS.length} mutations accounted for`);
  process.exitCode = failures ? 1 : 0;
};

const isMain = Boolean(process.argv[1]) && existsSync(process.argv[1])
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  await main();
}
