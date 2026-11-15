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
  { ...business, name: 'money ratios truncate', find: '(2n * numerator + denominator) / (2n * denominator)', replace: '(2n * numerator) / (2n * denominator)' },
  { ...business, name: 'percentages truncate', find: '(2n * top + bottom) / (2n * bottom)', replace: '(2n * top) / (2n * bottom)' },
  { ...business, name: 'a rounded zero keeps its minus sign', find: 'numerator < 0 && hundredths ? -hundredths', replace: 'numerator < 0 ? -hundredths' },
  { ...business, name: 'margin divides by cost', find: 'ratioPercent(profit, revenue)', replace: 'ratioPercent(profit, expense || 1)' },
  { ...business, name: 'break-even rounds units down', find: 'Math.ceil(cost / contribution)', replace: 'Math.floor(cost / contribution)' },
  { ...business, name: 'break-even allows a zero contribution', find: 'contribution <= 0', replace: 'contribution < 0' },
  { ...business, name: 'hourly rate rounds down', find: '(numerator + time - 1n) / time', replace: 'numerator / time' },
  { ...business, name: 'cost variance reads as income', find: "kind === 'income' ? 1 : -1", replace: "kind === 'income' ? 1 : 1" },
  { ...business, name: 'loan compounds on the wrong scale', find: 'const rateScale = 12000000n', replace: 'const rateScale = 12000001n' },
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
    '_includes/calculators', 'rates/div7a-benchmark-rate', 'rates/transfer-duty']) {
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
