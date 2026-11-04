// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// Do the calculator tests notice a wrong engine? Each named mutation below is one
// plausible money error. It is applied to a temporary copy of the engines, never to
// assets/, and the engine's own Node tests must then fail. A mutation that survives
// fails this script unless it carries a `survives` reason a reviewer has accepted.
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
  { ...business, name: 'a receipt landing in week 13 counts as deferred', find: 'week + delay >= rows.length ? delayed', replace: 'week + delay >= rows.length - 1 ? delayed' },
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
  for (const shared of ['rates/register/series', '_data/calculator_cases.json', 'tools/business-calculators']) {
    cpSync(join(root, shared), join(work, shared), { recursive: true });
  }

  const passes = (test) => spawnSync(process.execPath, ['--test', test], { cwd: work, encoding: 'utf8' }).status === 0;
  for (const { test } of [levy, business]) {
    if (!passes(test)) throw new Error(`${test} fails before any mutation`);
  }
  for (const { file, test, name, find, replace, survives } of MUTATIONS) {
    const source = readFileSync(join(root, file), 'utf8');
    if (source.split(find).length !== 2) {
      console.log(`STALE     ${name}: the text to change is not in ${file} exactly once`);
      failures += 1;
      continue;
    }
    writeFileSync(join(work, file), source.replace(find, replace));
    const survived = passes(test);
    copyFileSync(join(root, file), join(work, file));
    if (!survived) {
      console.log(`caught    ${name}`);
    } else if (survives) {
      console.log(`accepted  ${name}: ${survives}`);
    } else {
      console.log(`SURVIVED  ${name}`);
      failures += 1;
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(failures ? `mutation check: ${failures} of ${MUTATIONS.length} need attention` : `mutation check: ${MUTATIONS.length} mutations accounted for`);
process.exitCode = failures ? 1 : 0;
