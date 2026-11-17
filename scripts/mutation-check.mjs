// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// Do the calculator tests notice a wrong engine? Each named mutation below is one
// plausible money error. It is applied to a temporary copy of the engines, never to
// assets/, and the engine's own Node tests must then fail on an assertion. A mutation
// that survives fails this script, and so does a run that ends any other way, such as
// a module that will not load: that shows nothing about the tests. CONTROLS prove it.
// A `find` that no longer matches exactly once also fails, so the list cannot go stale.
//
// Run with: node scripts/mutation-check.mjs

import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const levy = { file: 'assets/levy.mjs', test: 'scripts/levy.test.mjs' };
const business = { file: 'assets/business-calculators.mjs', test: 'scripts/business-calculators.test.mjs' };
const individualTest = 'scripts/individual-tax.test.mjs';
const incomeTax = { file: 'assets/income-tax.mjs', test: individualTest };
const studyLoan = { file: 'assets/study-loan.mjs', test: individualTest };
const takeHome = { file: 'assets/take-home-pay.mjs', test: individualTest };
const money = { ...business, file: 'assets/money.mjs' };
const div7a = { ...business, file: 'assets/div7a.mjs' };
const fbt = { ...business, file: 'assets/fbt-benefits.mjs' };
const landTax = { ...business, file: 'assets/land-tax.mjs' };
const psi = { ...business, file: 'assets/psi-determination.mjs' };
const vehicle = { ...business, file: 'assets/vehicle-class.mjs' };
const payroll = { ...business, file: 'assets/payroll-tax.mjs' };

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
  { ...business, name: 'loan compounds on the wrong scale', find: 'const rateScale = 12000000n', replace: 'const rateScale = 12000001n' },
  { ...business, name: 'a loan balloon is not discounted to today', find: 'residual * scale', replace: 'residual * growth' },
  { ...business, name: 'loan payments in advance are worked as arrears', find: '(advance ? rateScale + rateUnits : rateScale)', replace: 'rateScale' },
  { ...business, name: 'a loan payment in advance pays a month of interest', find: 'advance ? 0 : ratioMoney', replace: 'false ? 0 : ratioMoney' },
  { ...business, name: 'a nil-interest balloon is spread over the payments', find: 'ratioMoney(balanceCents - residual, term)', replace: 'ratioMoney(balanceCents, term)' },
  { ...business, name: 'a balloon above the principal is accepted', find: 'residual > balanceCents', replace: 'residual > balanceCents + 1n' },
  { ...business, name: 'staff cost spreads over 13 months', find: 'BigInt(cents(wages) + cents(superAmount) + cents(other)), 12n', replace: 'BigInt(cents(wages) + cents(superAmount) + cents(other)), 13n' },
  { ...business, name: 'funding uses the closing balance', find: 'minimumBuffer - minimum', replace: 'minimumBuffer - balance' },
  { ...div7a, name: 'Division 7A compounds over one year too many', find: '(10000n + rate) ** term', replace: '(10000n + rate) ** (term + 1n)' },
  { ...div7a, name: 'Division 7A interest is taken on the repayment', find: 'ratioCents(balanceCents * rate, 10000n)', replace: 'ratioCents(repayment * rate, 10000n)' },
  { ...div7a, name: 'Division 7A accepts a 26-year term', find: 'max: 25, integer: true', replace: 'max: 26, integer: true' },
  { ...business, name: 'transfer duty ignores part of $100', find: '((excess + 99n) / 100n)', replace: '(excess / 100n)' },
  { ...business, name: 'transfer duty takes the next band at a band\'s top value', find: 'dollars <= Number(to)', replace: 'dollars < Number(to)' },
  { ...business, name: 'a whole-value band charges only the excess', find: 'ratioCents(hundredths * whole, 100n)', replace: 'ratioCents(hundredths * excess, 100n)' },
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
  { ...business, name: 'FBT is worked on the taxable value, not the grossed-up value', find: 'ratioCents(grossedUp * BigInt', replace: 'ratioCents(BigInt(taxable) * BigInt' },
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
  { ...fbt, name: 'FBT car parking contributions take the value below nil', find: 'least(contribution, gross)', replace: 'contribution' },
  { ...business, name: 'PCG 2021/4 puts exactly 50% returned in the band below', find: '[50, true]', replace: '[50, false]' },
  { ...business, name: 'PCG 2021/4 puts an exactly 30% tax rate in the band below', find: '[30, true]', replace: '[30, false]' },
  { ...business, name: 'PCG 2021/4 puts exactly 100% of the benchmark in the band above', find: '[100, false]', replace: '[100, true]' },
  { ...business, name: 'PCG 2021/4 counts an aggregate of 8 on 2 factors as green', find: '2: [7, 8]', replace: '2: [8, 8]' },
  { ...business, name: 'PCG 2021/4 counts an aggregate of 13 on 3 factors as amber', find: '3: [10, 12]', replace: '3: [10, 13]' },
  { ...business, name: 'PCG 2021/4 scores an arrangement that fails a gateway', find: 'if (failed !== -1)', replace: 'if (false)' },
  { ...business, name: 'PCG 2021/4 scores factor 2 when the whole entitlement is returned', find: 'if (returned === entitlement) {', replace: 'if (false) {' },
  { ...business, name: 'PCG 2021/4 divides the tax by the amount returned', find: 'pcgScore(tax, entitlement, 1)', replace: 'pcgScore(tax, returned || 1, 1)' },
  { ...business, name: 'PCG 2021/4 applies the 2-factor zones to all 3', find: 'PCG_ZONES[factor3 === null ? 2 : 3]', replace: 'PCG_ZONES[2]' },
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
  { ...psi, name: 'PSI counts an unrelated client not won by an offer', find: '!associate && offer).length', replace: '!associate).length' },
  { ...psi, name: 'PSI meets the unrelated clients test with one client', find: 'pass: unrelated >= 2,', replace: 'pass: unrelated >= 1,' },
  { ...psi, name: 'PSI needs more than 20% of principal work by others', find: 'const fifth = 5 * others >= total;', replace: 'const fifth = 5 * others > total;' },
  { ...psi, name: 'PSI ignores an apprentice', find: 'const employs = fifth || answers.apprentice;', replace: 'const employs = fifth;' },
  { ...psi, name: 'PSI accepts premises not held all year', find: 'premises.times && premises.mainly', replace: 'premises.mainly' },
  { ...psi, name: 'PSI accepts premises not separate from a payer’s', find: 'premises.private && premises.clients', replace: 'premises.private' },
  { ...psi, name: 'PSI applies the agent rules below 75% commission', find: '4 * commission >= 3 * principal', replace: '4 * commission > 3 * principal' },
  { ...psi, name: 'PSI ignores a determination in force', find: 'if (answers.determination) {', replace: 'if (false) {' },
  { ...psi, name: 'PSI treats employee income as PSI caught by the rules', find: 'if (earner === \'employee\') {', replace: 'if (false) {' },
  { ...psi, name: 'PSI treats income not mainly from personal effort as PSI', find: 'if (!answers.mainly) {', replace: 'if (false) {' },
  { ...psi, name: 'PSI rounds a share up to a threshold', find: '(BigInt(part) * 10000n) / BigInt(whole)', replace: '(BigInt(part) * 20000n + BigInt(whole)) / (2n * BigInt(whole))' },
  { ...psi, name: 'PSI cites subsection 87-18(1) for an entity', find: 'rule: `subsection 87-18(${entity ? 3 : 1})`', replace: 'rule: `subsection 87-18(1)`' },
  { ...psi, name: 'PSI applies Division 85 to an entity', find: 'entity ? \'Division 86 applies\' : \'Division 85 applies\'', replace: '\'Division 85 applies\'' },
  { ...psi, name: 'PSI accepts others’ work worth more than the PSI', find: 'if (others > total)', replace: 'if (false)' },
  { ...psi, name: 'PSI accepts more than $1,000,000,000', find: 'if (total > 100_000_000_000)', replace: 'if (false)' },
  { ...business, name: 'an activity statement figure rounds its cents', find: 'Math.floor(value / 100)', replace: 'Math.round(value / 100)' },
  { ...business, name: 'a varied amount takes a fifth of estimated tax a quarter', find: 'BigInt(instalment), 4n', replace: 'BigInt(instalment), 5n' },
  { ...business, name: 'credits claimed are not added back', find: 'return earlier - credits;', replace: 'return earlier;' },
  { ...business, name: 'a varied amount below nil gives no credit', find: 'credit: wholeDollars(Math.max(0, -amount))', replace: 'credit: 0' },
  { ...business, name: 'the first instalment takes earlier instalments', find: 'instalment === 1 && cents(inputs.earlier)', replace: 'false && cents(inputs.earlier)' },
  { ...business, name: 'a varied rate rounds to the nearest hundredth', find: 'tax * 10000n / yearIncome', replace: '(tax * 20000n + yearIncome) / (2n * yearIncome)' },
  { ...business, name: 'a higher varied rate gives a credit', find: 'if (rate < given)', replace: 'if (rate !== given)' },
  { ...business, name: 'the credit leaves out earlier instalment income', find: 'earlierLessCredits() - earlierAtRate', replace: 'earlierLessCredits()' },
  { ...business, name: 'a varied rate is not applied to T1', find: 'BigInt(cents(inputs.income)) * BigInt(rate)', replace: 'BigInt(cents(inputs.income)) * BigInt(given)' },
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

  { ...incomeTax, name: '2026-27 starts at 16%', find: "'2026-27': [[18200, 15]", replace: "'2026-27': [[18200, 16]" },
  { ...incomeTax, name: 'foreign residents reach 37% at $120,000', find: '[[0, 30], [135000, 37]', replace: '[[0, 30], [120000, 37]' },
  { ...incomeTax, name: 'working holiday makers reach 30% at $37,000', find: '[[0, 15], [45000, 30]', replace: '[[0, 15], [37000, 30]' },
  { ...incomeTax, name: 'the offset tapers at 4%', find: '(income - 37500) * 50', replace: '(income - 37500) * 40' },
  { ...incomeTax, name: 'the offset rounds half a cent down', find: 'Math.floor((tenths + 5) / 10)', replace: 'Math.floor(tenths / 10)' },
  { ...incomeTax, name: 'the offset can exceed the tax', find: 'Math.min(tax, lowIncomeOffset(income))', replace: 'lowIncomeOffset(income)' },
  { ...incomeTax, name: 'the Medicare shade-in takes the greater', find: 'Math.min(income * 2, (income - threshold) * 10)', replace: 'Math.max(income * 2, (income - threshold) * 10)' },
  { ...incomeTax, name: 'foreign residents pay the Medicare levy', find: 'const medicare = resident ?', replace: 'const medicare = true ?' },
  { ...incomeTax, name: '2024-25 takes the 2025-26 Medicare thresholds', find: "'2024-25': [27222, 34027]", replace: "'2024-25': [28011, 35013]" },
  { ...studyLoan, name: 'the upper marginal rate is 16%', find: 'Math.max(0, income - top) * 17', replace: 'Math.max(0, income - top) * 16' },
  { ...studyLoan, name: 'the repayment takes the greater amount', find: 'tenth < marginal ?', replace: 'tenth > marginal ?' },
  { ...studyLoan, name: '2024-25 takes the first band', find: 'table.bands.findLast(', replace: 'table.bands.find(' },
  { ...studyLoan, name: 'the minimum repayment income itself repays', find: 'if (income <= table.minimum)', replace: 'if (income < table.minimum)' },
  { ...studyLoan, name: 'repayment income leaves out super contributions', find: "const PARTS = ['taxable', 'fringe', 'losses', 'super', 'foreign'];", replace: "const PARTS = ['taxable', 'fringe', 'losses', 'foreign'];" },
  { ...takeHome, name: 'super guarantee ignores the base', find: 'Math.min(entered, capCents) * tenths', replace: 'entered * tenths' },
  { ...takeHome, name: 'a package’s super is the rate of the package', find: 'nearest(entered * tenths, 1000 + tenths)', replace: 'nearest(entered * tenths, 1000)' },
  { ...takeHome, name: 'the study loan is left out', find: 'const loan = pay.studyLoan', replace: 'const loan = false' },
  { ...takeHome, name: 'no standard deduction', find: 'Math.min(100000, salary) : 0', replace: '0 : 0' },
  { ...takeHome, name: 'the standard deduction drops the salary’s cents', find: 'Math.min(100000, salary) : 0', replace: 'Math.min(100000, salary - (salary % 100)) : 0' },
  { ...takeHome, name: 'the standard deduction for foreign residents too', find: "pay.year >= STANDARD_DEDUCTION_FROM && pay.residency === 'resident'", replace: 'pay.year >= STANDARD_DEDUCTION_FROM' },
  { ...takeHome, name: 'a fortnight is a 24th', find: 'nearest(net, 26)', replace: 'nearest(net, 24)' },
  { ...takeHome, name: '2024-25 super guarantee is 12%', find: "'2024-25': { rate: 11.5", replace: "'2024-25': { rate: 12" },
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
  { ...landTax, name: 'the trust surcharge threshold is ignored', find: '(trust && place.trustSurcharge) || ', replace: '' },
  { ...landTax, name: 'a separate surcharge applies to the land tax value', find: 'place.surchargeBase === \'separate\'', replace: 'false' },
  { ...landTax, name: 'MRIT is left out of the land tax total', find: 'land.amount + surcharge + mrit', replace: 'land.amount + surcharge' },
  { ...landTax, name: 'the surcharge is left out of the land tax total', find: 'land.amount + surcharge + mrit', replace: 'land.amount + mrit' },
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
];

// Runs that must read as invalid, not as caught.
const CONTROLS = [
  { ...business, name: 'a broken import', find: '// Planning arithmetic.',
    replace: "import './no-such-module.mjs';\n// Planning arithmetic." },
];

const work = mkdtempSync(join(tmpdir(), 'mutation-check-'));
let failures = 0;
try {
  mkdirSync(join(work, 'assets'));
  mkdirSync(join(work, 'scripts'));
  for (const name of readdirSync(join(root, 'assets')).filter((entry) => entry.endsWith('.mjs'))) {
    copyFileSync(join(root, 'assets', name), join(work, 'assets', name));
  }
  for (const test of [levy.test, business.test, individualTest]) copyFileSync(join(root, test), join(work, test));
  for (const shared of ['rates/register/series', '_data/calculator_cases.json', 'tools/business-calculators',
    '_includes/calculators', 'rates/div7a-benchmark-rate', 'rates/transfer-duty', 'rates/fbt-rate', 'rates/general-interest-charge', '_data/individual_tax_cases.json',
    'tools/individual-tax', 'rates/individual-income-tax', 'rates/study-loan-repayment', 'rates/super-guarantee',
    'rates/maximum-contribution-base', 'rates/car-limit', 'llms.txt', '.well-known/llms.txt',
    'scripts/fbt-engine-differential.json']) {
    cpSync(join(root, shared), join(work, shared), { recursive: true });
  }

  const verdict = (test) => {
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', test], { cwd: work, encoding: 'utf8' });
    if (run.status === 0) return 'survived';
    return run.status === 1 && run.stdout.includes("code: 'ERR_ASSERTION'") ? 'caught' : 'invalid';
  };
  for (const test of [levy.test, business.test, individualTest]) {
    if (verdict(test) !== 'survived') throw new Error(`${test} fails before any mutation`);
  }
  const mutated = ({ file, test, find, replace }) => {
    writeFileSync(join(work, file), readFileSync(join(root, file), 'utf8').replace(find, replace));
    const result = verdict(test);
    copyFileSync(join(root, file), join(work, file));
    return result;
  };
  for (const control of CONTROLS) {
    const result = mutated(control);
    console.log(`control   ${control.name}: ${result}`);
    if (result !== 'invalid') failures += 1;
  }
  for (const { file, name, find, ...mutation } of MUTATIONS) {
    const source = readFileSync(join(root, file), 'utf8');
    if (source.split(find).length !== 2) {
      console.log(`STALE     ${name}: the text to change is not in ${file} exactly once`);
      failures += 1;
      continue;
    }
    const result = mutated({ file, find, ...mutation });
    console.log(`${result === 'caught' ? 'caught   ' : result.toUpperCase()} ${name}`);
    if (result !== 'caught') failures += 1;
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(failures ? `mutation check: ${failures} of ${MUTATIONS.length} need attention` : `mutation check: ${MUTATIONS.length} mutations accounted for`);
process.exitCode = failures ? 1 : 0;
