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
const money = { ...business, file: 'assets/money.mjs' };
const fbt = { ...business, file: 'assets/fbt-benefits.mjs' };

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
  { ...business, name: 'Division 7A compounds over one year too many', find: '(10000n + rate) ** term', replace: '(10000n + rate) ** (term + 1n)' },
  { ...business, name: 'Division 7A interest is taken on the repayment', find: 'ratioCents(balanceCents * rate, 10000n)', replace: 'ratioCents(repayment * rate, 10000n)' },
  { ...business, name: 'Division 7A accepts a 26-year term', find: 'max: 25, integer: true', replace: 'max: 26, integer: true' },
  { ...business, name: 'transfer duty ignores part of $100', find: '((excess + 99n) / 100n)', replace: '(excess / 100n)' },
  { ...business, name: 'transfer duty takes the next band at a band\'s top value', find: 'dollars <= Number(to)', replace: 'dollars < Number(to)' },
  { ...business, name: 'a whole-value band charges only the excess', find: 'ratioCents(hundredths * whole, 100n)', replace: 'ratioCents(hundredths * excess, 100n)' },
  { ...business, name: 'the NT formula drops its 15V term', find: '+ 1500000000000n * whole', replace: '+ 0n * whole' },
  { ...business, name: 'a broken transfer duty table is used', find: 'if (!contiguous) throw', replace: 'if (false) throw' },
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
  for (const { test } of [levy, business]) copyFileSync(join(root, test), join(work, test));
  for (const shared of ['rates/register/series', '_data/calculator_cases.json', 'tools/business-calculators',
    '_includes/calculators', 'rates/div7a-benchmark-rate', 'rates/transfer-duty', 'rates/fbt-rate', 'rates/general-interest-charge',
    'scripts/fbt-engine-differential.json']) {
    cpSync(join(root, shared), join(work, shared), { recursive: true });
  }

  const verdict = (test) => {
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', test], { cwd: work, encoding: 'utf8' });
    if (run.status === 0) return 'survived';
    return run.status === 1 && run.stdout.includes("code: 'ERR_ASSERTION'") ? 'caught' : 'invalid';
  };
  for (const { test } of [levy, business]) {
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
