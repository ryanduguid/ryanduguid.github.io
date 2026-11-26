// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// One employer's FBT return for one FBT year from the taxable values of its fringe benefits: the
// composition, gross-up, reportable fringe benefits amounts, rebate, capping and items 20 to 22 of the
// `fbt-return` command of ryanduguid/australian-accounting (main at 4df634b), ported step for step.
// The command values each benefit with its own worksheet; here each benefit's gross taxable value,
// employee contribution and taxable value are entered as established, such as from this site's FBT
// benefit calculators. Read 16 and 22 November 2026:
// - FBTAA 1986 ss 5B(1A) to (1M), 5C, 5E, 57A, 65J, 66, 105 and 135P, compilation 97 (1 July 2026,
//   C2026C00332), at legislation.gov.au.
// - The ATO's FBT return 2026 instructions (calculation details for taxable employers, item 23,
//   completing the return for all employers and for not-for-profit employers, and the NFP worked examples),
//   'Reportable fringe benefits' and 'FBT rates and thresholds'.
// Amounts are BigInt cents and every gross-up is an exact ratio, so each rounding happens once.

export const FBT_RETURN_YEARS = [2026, 2027];
const LABELS_YEAR = 2026;

/**
 * Item 23 labels: [label, category, Number counts employees, contribution column, reductions column].
 * @type {[string, string, boolean, boolean, boolean][]}
 */
export const ITEM_23 = [
  ['23A', 'Car fringe benefits, statutory formula', false, true, false],
  ['23B', 'Car fringe benefits, operating cost method', false, true, false],
  ['23C', 'Loan fringe benefits', false, false, true],
  ['23D', 'Debt waiver fringe benefits', false, false, false],
  ['23E', 'Expense payment fringe benefits', false, true, true],
  ['23F', 'Housing fringe benefits', false, true, false],
  ['23G', 'Living-away-from-home allowance fringe benefits', true, false, true],
  ['23J', 'Board fringe benefits', false, true, true],
  ['23K', 'Property fringe benefits', false, true, true],
  ['23L', 'Income tax exempt body entertainment fringe benefits', false, false, false],
  ['23M', 'Residual fringe benefits', false, true, true],
  ['23N', 'Car parking fringe benefits', false, true, false],
  ['23P', 'Meal entertainment fringe benefits', false, false, false],
];

/**
 * Employer kinds: [name, cap per employee in dollars or null, provision].
 * @type {[string, number | null, string][]}
 */
export const FBT_EMPLOYER_KINDS = [
  ['taxable', null, 'FBTAA s 5B(1A)'],
  ['rebatable', 30000, 'FBTAA s 65J(1)'],
  ['public_benevolent_institution', 30000, 'FBTAA s 57A(1); $30,000 cap, s 5B(1E) step 3'],
  ['health_promotion_charity', 30000, 'FBTAA s 57A(5); $30,000 cap, s 5B(1E) step 3'],
  ['public_hospital', 17000, 'FBTAA s 57A(3)(a); $17,000 cap, s 5B(1E) step 2(c)'],
  ['not_for_profit_hospital', 17000, 'FBTAA s 57A(4); $17,000 cap, s 5B(1E) step 2(d)'],
  ['public_ambulance_service', 17000, 'FBTAA s 57A(3)(b); $17,000 cap, s 5B(1E) step 2(ca)'],
];

const INPUTS = ['year_ended', 'employer_kind', 'rebatable_days', 'employer_days', 'instalments_reported', 'benefits'];
const BENEFIT_INPUTS = ['employee', 'label', 'gst_type', 'excluded', 'entertainment', 'electric_car_exempt',
  'gross_taxable_value', 'employee_contribution', 'taxable_value', 'reportable_taxable_value'];
const ALWAYS_EXCLUDED = { '23N': 'a car parking fringe benefit is an excluded fringe benefit (FBTAA s 5E(3)(b))',
  '23P': 'meal entertainment not provided under a salary packaging arrangement is an excluded fringe benefit (FBTAA s 5E(3)(a))' };
const ENTERTAINMENT_CAP = 500000n; // cents: s 5B(1E) step 4, s 65J(2B) step 2A
const THRESHOLD = 200000n; // cents: s 135P(1)
// FBT rate 47% and GST 10%: type 1 gross-up (0.47 + 0.10) / ((1 - 0.47) x 1.10 x 0.47) = 57000 / 27401, type 2 1 / 0.53.
const ONE = [57000n, 27401n];
const TWO = [100n, 53n];

/** @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** Half up for any sign. @param {bigint} n @param {bigint} d */
const round = (n, d) => (n < 0n ? -((2n * -n + d) / (2n * d)) : (2n * n + d) / (2n * d));
/** @param {bigint} c */
export const fbtMoney = (c) => `${c < 0n ? '-' : ''}${(c < 0n ? -c : c) / 100n}.${String((c < 0n ? -c : c) % 100n).padStart(2, '0')}`;
const sum = (/** @type {bigint[]} */ list) => list.reduce((a, b) => a + b, 0n);
const max0 = (/** @type {bigint} */ c) => (c < 0n ? 0n : c);

/** A non-negative amount with at most 2 decimal places, as cents. @param {unknown} text @param {string} name */
function amount(text, name) {
  const match = typeof text === 'string' ? /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(text.trim()) : null; // eslint-disable-line security/detect-unsafe-regex -- anchored, with no repetition over overlapping characters: linear
  if (!match) refuse('input.amount_invalid', `${name} must be a non-negative amount in dollars with at most 2 decimal places.`);
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

/** Cents grossed up by a ratio, to the cent. @param {bigint} c @param {bigint[]} ratio */
const grossCents = (c, [n, d]) => round(c * n, d);
/** Cents grossed up by a ratio, to the dollar, as cents. @param {bigint} c @param {bigint[]} ratio */
const grossDollars = (c, [n, d]) => round(c * n, d * 100n) * 100n;

/** @param {Record<string, unknown>} b @param {string} at @param {string} kind */
function checkBenefit(b, at, kind) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) refuse('input.not_object', `${at} must be an object.`);
  const extra = Object.keys(b).find((k) => !BENEFIT_INPUTS.includes(k));
  if (extra) refuse('input.field_unknown', `${extra} is not an input of a benefit.`);
  const employee = typeof b.employee === 'string' ? b.employee.trim() : '';
  if (!employee) refuse('input.missing_field', `${at}.employee is required: a label for the employee the benefit is provided in respect of.`);
  const row = ITEM_23.find(([label]) => label === b.label);
  if (!row) refuse('fbt_return.benefit_label_unsupported', `${at}.label must be an item 23 label: ${ITEM_23.map(([l]) => l).join(', ')}.`);
  const label = row[0];
  if (b.gst_type !== 'type_1' && b.gst_type !== 'type_2') {
    refuse('fbt_return.gst_type_missing', `${at}.gst_type must be type_1 for a GST-creditable benefit (FBTAA s 5C(3)) or type_2 for any other (s 5C(4)).`);
  }
  if (typeof b.excluded !== 'boolean') refuse('input.flag_invalid', `${at}.excluded must be true or false: whether it is an excluded fringe benefit (FBTAA s 5E(3)).`);
  const always = ALWAYS_EXCLUDED[/** @type {'23N'} */ (label)]; // eslint-disable-line security/detect-object-injection -- keys come from this module's own constant tables or a checked choice
  if (always && !b.excluded) refuse('fbt_return.exclusion_conflict', `${at}.excluded must be true: ${always}.`);
  const exempt = b.electric_car_exempt === true;
  if (b.electric_car_exempt !== undefined && typeof b.electric_car_exempt !== 'boolean') refuse('input.flag_invalid', `${at}.electric_car_exempt must be true or false.`);
  if (exempt && label !== '23A' && label !== '23B') refuse('fbt_return.exempt_car_label', `${at}: only a car fringe benefit (23A or 23B) can be an exempt electric car.`);
  if (exempt && kind !== 'taxable' && kind !== 'rebatable') {
    refuse('fbt_return.nfp_exempt_car_unsupported', `${at}: an exempt electric car is not composed for an s 57A employer: s 135Q(1)(c) counts a car exempt under s 8A as if it were a fringe benefit, and no ATO example shows how it meets the cap.`);
  }
  const gross = amount(b.gross_taxable_value, `${at}.gross_taxable_value`);
  const contribution = amount(b.employee_contribution ?? '0', `${at}.employee_contribution`);
  const taxable = amount(b.taxable_value, `${at}.taxable_value`);
  if (exempt && taxable !== 0n) refuse('fbt_return.exempt_car_taxable', `${at}: an exempt electric car’s taxable value is nil (FBTAA s 8A); give its notional value as reportable_taxable_value.`);
  if (contribution + taxable > gross) refuse('fbt_return.amounts_inconsistent', `${at}: the employee contribution and taxable value together exceed the gross taxable value.`);
  const reportable = exempt ? amount(b.reportable_taxable_value, `${at}.reportable_taxable_value`) : taxable;
  if (!exempt && b.reportable_taxable_value !== undefined) refuse('input.field_unknown', `${at}.reportable_taxable_value is an input only of an exempt electric car.`);
  return { employee, label, typeOne: b.gst_type === 'type_1', excluded: b.excluded, exempt, gross, contribution, taxable, reportable,
    entertainment: checkEntertainment(b, at, label, kind) };
}

/** @param {Record<string, unknown>} b @param {string} at @param {string} label @param {string} kind */
function checkEntertainment(b, at, label, kind) {
  if (b.entertainment === undefined) return 'unstated';
  if (kind === 'taxable') refuse('input.field_unknown', `${at}.entertainment is an input only with a rebatable or s 57A employer kind.`);
  if (b.entertainment === 'salary_packaged') {
    if (label === '23N' || label === '23P') refuse('fbt_return.entertainment_invalid', `${at}.entertainment cannot be salary_packaged for ${label}, which holds only benefits outside a salary packaging arrangement or car parking.`);
    if (b.excluded) refuse('fbt_return.entertainment_invalid', `${at}.entertainment salary_packaged needs excluded false: salary packaged meal entertainment and entertainment facility leasing are not excluded fringe benefits (FBTAA s 5E(3)).`);
    return 'salary_packaged';
  }
  if (b.entertainment === 'not_salary_packaged') {
    if (!b.excluded) refuse('fbt_return.entertainment_invalid', `${at}.entertainment not_salary_packaged needs excluded true: meal entertainment and entertainment facility leasing outside a salary packaging arrangement are excluded fringe benefits (FBTAA s 5E(3)).`);
    return 'not_salary_packaged';
  }
  return refuse('fbt_return.entertainment_invalid', `${at}.entertainment must be salary_packaged or not_salary_packaged.`);
}

/** @param {Record<string, unknown>} v @param {string} kind @param {number} year */
function checkDays(v, kind, year) {
  const given = v.rebatable_days !== undefined || v.employer_days !== undefined;
  if (!given && kind !== 'rebatable') return null;
  if (kind !== 'rebatable') refuse('input.field_unknown', 'rebatable_days and employer_days are inputs only with employer_kind rebatable.');
  const days = year % 4 === 0 ? 366 : 365;
  const [rebatable, employer] = [v.rebatable_days, v.employer_days];
  if (!Number.isInteger(employer) || !Number.isInteger(rebatable) || Number(employer) < 1 || Number(employer) > days
    || Number(rebatable) < 0 || Number(rebatable) > Number(employer)) {
    refuse('fbt_return.rebatable_days_invalid', `A rebatable employer gives employer_days from 1 to ${days}, the days of the FBT year ended 31 March ${year} on which it was an employer, and rebatable_days from 0 to employer_days, the whole days on which it was a rebatable employer (FBTAA s 65J(2A)).`);
  }
  return [BigInt(Number(rebatable)), BigInt(Number(employer))];
}

/** Benefits the caps disregard (s 5B(1L) step 1, s 65J(2H) step 1). @param {ReturnType<typeof checkBenefit>} b */
const disregarded = (b) => b.excluded && (b.label === '23N' || b.label === '23P' || b.entertainment === 'not_salary_packaged');
/** The grossed-up amount of a type 1 and a type 2 base, each to the cent. @param {bigint} one @param {bigint} two */
const grossed = (one, two) => grossCents(one, ONE) + grossCents(two, TWO);

/** Each employee's amount over the caps (s 5B(1E) steps 1 to 4; s 65J(2B) steps 1 to 2A). */
function capping(/** @type {ReturnType<typeof checkBenefit>[]} */ benefits, /** @type {bigint} */ cap) {
  /** @type {Map<string, bigint[]>} */
  const bases = new Map();
  for (const b of benefits.filter((x) => !disregarded(x)).sort((x, y) => (x.employee < y.employee ? -1 : 1))) {
    const [one, two, p1, p2] = bases.get(b.employee) ?? [0n, 0n, 0n, 0n];
    const packaged = b.entertainment === 'salary_packaged' ? b.taxable : 0n;
    bases.set(b.employee, b.typeOne ? [one + b.taxable, two, p1 + packaged, p2] : [one, two + b.taxable, p1, p2 + packaged]);
  }
  const employees = [...bases].map(([employee, [one, two, p1, p2]]) => {
    const individual = grossed(one, two);
    const packaged = grossed(p1, p2);
    let over = max0(individual - cap);
    if (over > 0n) over = max0(over - (packaged < ENTERTAINMENT_CAP ? packaged : ENTERTAINMENT_CAP));
    return { employee, individual, packaged, over };
  });
  return { cap, employees, total: sum(employees.map((e) => e.over)) };
}

/** Item 23 by label: exempt electric cars, and for an s 57A employer the benefits the caps disregard, have no place. */
function item23(/** @type {ReturnType<typeof checkBenefit>[]} */ benefits, /** @type {boolean} */ capped) {
  return ITEM_23.flatMap(([label, category, counts, contributionColumn, reductionsColumn]) => {
    const rows = benefits.filter((b) => b.label === label && !b.exempt && !(capped && disregarded(b)));
    if (!rows.length) return [];
    const gross = sum(rows.map((b) => b.gross));
    const contribution = sum(rows.map((b) => b.contribution));
    const taxable = sum(rows.map((b) => b.taxable));
    return [{ label, category, number: counts ? new Set(rows.map((b) => b.employee)).size : null, gross,
      contribution: contributionColumn ? contribution : null, reductions: reductionsColumn ? gross - contribution - taxable : null, taxable }];
  });
}

/** Each employee's individual and reportable fringe benefits amounts (s 5E(2), s 135P). */
function employees(/** @type {ReturnType<typeof checkBenefit>[]} */ benefits) {
  const names = [...new Set(benefits.map((b) => b.employee))].sort((x, y) => (x < y ? -1 : 1));
  return names.map((employee) => {
    const own = benefits.filter((b) => b.employee === employee);
    const individual = sum(own.filter((b) => !b.excluded).map((b) => b.reportable));
    // s 135P(2): individual x 1 / (1 - 0.47), in whole dollars with the cents dropped, as the ATO's examples do.
    const reportable = individual > THRESHOLD ? (individual / 53n) * 100n : 0n;
    return { employee, individual, reportable, contributions: sum(own.map((b) => b.contribution)) };
  });
}

/**
 * Items 14 to 19 and the caps for the employer kind (s 5B, s 57A, s 65J).
 * @param {ReturnType<typeof checkBenefit>[]} benefits @param {string} kind @param {number | null} capDollars @param {bigint[] | null} days
 */
function compose(benefits, kind, capDollars, days) {
  const typeOneValue = sum(benefits.filter((b) => b.typeOne).map((b) => b.taxable));
  const typeTwoValue = sum(benefits.filter((b) => !b.typeOne).map((b) => b.taxable));
  const item14a = grossDollars(typeOneValue, ONE);
  const item14b = grossDollars(typeTwoValue, TWO);
  const item16 = round((item14a + item14b) * 47n, 100n);
  const exempt = capDollars !== null && kind !== 'rebatable';
  /** @type {Record<string, string>} */
  const labels = {};
  /** @type {Record<string, string>} */
  const amounts = { type_one_value: fbtMoney(typeOneValue), type_two_value: fbtMoney(typeTwoValue) };
  let item19 = item16;
  let caps = null;
  if (capDollars === null || kind === 'rebatable') {
    Object.assign(labels, { '14A': fbtMoney(item14a), '14B': fbtMoney(item14b), 15: fbtMoney(item14a + item14b), 16: fbtMoney(item16) });
    Object.assign(amounts, { type_one_grossed_up: fbtMoney(grossCents(typeOneValue, ONE)), type_two_grossed_up: fbtMoney(grossCents(typeTwoValue, TWO)),
      fringe_benefits_taxable_amount: fbtMoney(item14a + item14b), fbt_payable: fbtMoney(item16) });
  }
  if (capDollars !== null) {
    caps = capping(benefits, BigInt(capDollars) * 100n);
    if (exempt) {
      const item14c = round(caps.total, 100n) * 100n;
      item19 = round(item14c * 47n, 100n);
      Object.assign(labels, { '14C': fbtMoney(item14c), 15: fbtMoney(item14c), 16: fbtMoney(item19) });
      Object.assign(amounts, { aggregate_non_exempt_amount: fbtMoney(caps.total), fringe_benefits_taxable_amount: fbtMoney(item14c), fbt_payable: fbtMoney(item19) });
    } else {
      const [rebatable, employer] = /** @type {bigint[]} */ (days);
      const item17 = round(caps.total * 47n, 100n);
      const item18 = max0(round((item16 - item17) * 47n * rebatable, 100n * employer));
      item19 = item16 - item18;
      Object.assign(labels, { 17: fbtMoney(item17), 18: fbtMoney(item18) });
      Object.assign(amounts, { aggregate_non_rebatable_amount: fbtMoney(item17), rebate: fbtMoney(item18), fbt_payable_after_rebate: fbtMoney(item19) });
    }
  }
  return { labels, amounts, item19, caps, exempt };
}

/**
 * One employer's FBT return. Amounts are strings in dollars and cents.
 * @param {Record<string, unknown>} v
 */
export function fbtReturn(v) {
  const extra = Object.keys(v).find((k) => !INPUTS.includes(k));
  if (extra) refuse('input.field_unknown', `${extra} is not an input of the FBT return calculator.`);
  const year = Number(v.year_ended);
  if (!FBT_RETURN_YEARS.includes(year) || !Number.isInteger(v.year_ended)) {
    refuse('period.unsupported', `year_ended must be ${FBT_RETURN_YEARS.join(' or ')}, an FBT year ended 31 March whose rates are loaded.`);
  }
  const kindRow = FBT_EMPLOYER_KINDS.find(([name]) => name === (v.employer_kind ?? 'taxable'));
  if (!kindRow) refuse('fbt_return.employer_kind_unsupported', `employer_kind must be one of ${FBT_EMPLOYER_KINDS.map(([n]) => n).join(', ')}.`);
  const [kind, capDollars] = kindRow;
  const days = checkDays(v, kind, year);
  const instalments = v.instalments_reported === undefined ? null : amount(v.instalments_reported, 'instalments_reported');
  if (!Array.isArray(v.benefits) || !v.benefits.length) refuse('input.missing_field', 'benefits is required: a list of at least one benefit.');
  const benefits = v.benefits.map((b, i) => checkBenefit(b, `benefits[${i}]`, kind));
  const { labels, amounts, item19, caps, exempt } = compose(benefits, kind, capDollars, days);
  labels[19] = fbtMoney(item19);
  if (instalments !== null) {
    labels[20] = fbtMoney(instalments);
    if (item19 > instalments) labels[21] = fbtMoney(item19 - instalments);
    if (item19 < instalments) labels[22] = fbtMoney(instalments - item19);
  }
  amounts.employee_contributions = fbtMoney(sum(benefits.map((b) => b.contribution)));
  return {
    year, kind, labels, amounts,
    item23: item23(benefits, exempt).map((r) => ({ ...r, gross: fbtMoney(r.gross), taxable: fbtMoney(r.taxable),
      contribution: r.contribution === null ? null : fbtMoney(r.contribution), reductions: r.reductions === null ? null : fbtMoney(r.reductions) })),
    employees: employees(benefits).map((e) => ({ employee: e.employee, individual: fbtMoney(e.individual), reportable: fbtMoney(e.reportable),
      contributions: fbtMoney(e.contributions) })),
    capping: caps && { cap: fbtMoney(caps.cap), entertainmentCap: fbtMoney(ENTERTAINMENT_CAP),
      employees: caps.employees.map((e) => ({ employee: e.employee, individual: fbtMoney(e.individual), packaged: fbtMoney(e.packaged), over: fbtMoney(e.over) })) },
    warnings: year > LABELS_YEAR ? [`The labels follow the FBT return ${LABELS_YEAR} instructions; the ATO had not published the ${year} instructions when read on 16 November 2026`] : [],
  };
}

/**
 * The return's totals as numbers in dollars, for the page's boundary cases: the fringe benefits taxable amount,
 * the tax payable at item 19 and, where instalments are given, the payment or credit at item 21 or 22.
 * @param {Record<string, unknown>} v
 */
export function fbtReturnTotals(v) {
  const r = fbtReturn(v);
  /** @type {Record<string, number>} */
  const out = { taxableAmount: Number(r.labels[15]), payable: Number(r.labels[19]) };
  if (r.labels[21] !== undefined) out.due = Number(r.labels[21]);
  if (r.labels[22] !== undefined) out.credit = Number(r.labels[22]);
  return out;
}
