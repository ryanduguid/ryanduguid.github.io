// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// One quarter's FBT instalment on the activity statement, as the ATO gives it at F1 or as varied on the
// employer's estimate of the year's FBT (F2 to F4), with labels 6A and 6B: the `fbt-instalment` command
// of ryanduguid/australian-accounting (main at 4df634b), ported step for step. Read 22 November 2026:
// FBTAA 1986 Part VII Division 2 (ss 101 to 112B), compilation 97 (1 July 2026, C2026C00332), and the
// ATO's 'Fringe benefits tax (FBT) instalment' page (last updated 1 May 2025).

export const FBT_INSTALMENT_YEARS = [2026, 2027];
/** FBTAA s 109, 'relevant fraction', in quarters (30 June, 30 September, 31 December, 31 March). */
const FRACTIONS = [1n, 2n, 3n, 4n];
/** The ATO's reason codes for a variation (label F4). */
/** @type {[number, string][]} */
export const FBT_REASONS = [
  [22, 'current business structure not continuing'],
  [30, 'change in fringe benefits for employees'],
  [31, 'change in employees with fringe benefits'],
  [32, 'fringe benefits rebate now claimed'],
];
const INPUTS = ['quarter', 'year_ended', 'ato_instalment', 'estimated_tax', 'previous_instalments', 'previous_credits', 'reason_code'];

/** @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}
const money = (/** @type {bigint} */ c) => `${c < 0n ? '-' : ''}${(c < 0n ? -c : c) / 100n}.${String((c < 0n ? -c : c) % 100n).padStart(2, '0')}`;
/** @param {unknown} text @param {string} name */
function amount(text, name) {
  const match = typeof text === 'string' ? /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(text.trim()) : null;
  if (!match) refuse('input.amount_invalid', `${name} must be a non-negative amount in dollars with at most 2 decimal places.`);
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}
/** @param {string} why @returns {never} */
const variationInvalid = (why) => refuse('fbt_instalment.variation_invalid', `${why} (FBTAA ss 111(1) and 112(1); the ATO's labels F2 to F4).`);

/**
 * One quarter's FBT instalment. Amounts are strings in dollars and cents.
 * @param {Record<string, unknown>} v
 */
export function fbtInstalment(v) {
  const extra = Object.keys(v).find((k) => !INPUTS.includes(k));
  if (extra) refuse('input.field_unknown', `${extra} is not an input of the FBT instalment calculator.`);
  if (!Number.isInteger(v.year_ended) || !FBT_INSTALMENT_YEARS.includes(Number(v.year_ended))) {
    refuse('period.unsupported', `year_ended must be ${FBT_INSTALMENT_YEARS.join(' or ')}, an FBT year ended 31 March.`);
  }
  const quarter = Number(v.quarter);
  if (!Number.isInteger(v.quarter) || quarter < 1 || quarter > 4) {
    refuse('fbt_instalment.quarter_invalid', 'quarter must be 1 to 4: the instalment for the quarter ending 30 June (1), 30 September (2), 31 December (3) or 31 March (4) of the FBT year (FBTAA ss 103 and 109).');
  }
  if (v.estimated_tax === undefined) {
    if (v.ato_instalment === undefined) refuse('fbt_instalment.ato_instalment_missing', 'Give ato_instalment, the amount at label F1, or estimated_tax (label F2) to vary it.');
    if (v.previous_instalments !== undefined || v.previous_credits !== undefined || v.reason_code !== undefined) {
      variationInvalid('previous_instalments, previous_credits and reason_code are given only with estimated_tax, to vary the instalment');
    }
    const f1 = money(amount(v.ato_instalment, 'ato_instalment'));
    return { year: Number(v.year_ended), quarter, varied: false, labels: { F1: f1, '6A': f1 } };
  }
  const code = Number(v.reason_code);
  if (!Number.isInteger(v.reason_code) || !FBT_REASONS.some(([c]) => c === code)) {
    variationInvalid(`A variation needs reason_code, the label F4 code: one of ${FBT_REASONS.map(([c, why]) => `${c} (${why})`).join(', ')}`);
  }
  let paid = 0n;
  if (v.previous_instalments !== undefined) paid = amount(v.previous_instalments, 'previous_instalments');
  else if (quarter > 1) variationInvalid('previous_instalments is required to vary the second, third or fourth instalment: the instalments for the year that fell due before this one');
  const credits = v.previous_credits === undefined ? 0n : amount(v.previous_credits, 'previous_credits');
  if (quarter === 1 && (paid !== 0n || credits !== 0n)) {
    variationInvalid('the first instalment has no earlier instalments or credits in the year: previous_instalments and previous_credits must be nil for quarter 1');
  }
  if (credits > paid) variationInvalid('previous_credits exceed previous_instalments: an s 112A credit is at most the instalments paid before it, less earlier credits');
  const estimate = amount(v.estimated_tax, 'estimated_tax');
  // s 110(5) and s 111(1): the estimate times the relevant fraction, in cents 0.5 up, less (previous instalments - credits).
  const share = (2n * estimate * FRACTIONS[quarter - 1] + 4n) / 8n;
  const formula = share - (paid - credits);
  const f3 = formula > 0n ? formula : 0n;
  const credit = formula < 0n ? -formula : 0n;
  return { year: Number(v.year_ended), quarter, varied: true, share: money(share), formula: money(formula),
    labels: { F2: money(estimate), F3: money(f3), F4: code, '6A': money(f3), '6B': money(credit) } };
}
