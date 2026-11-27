// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The deferred taxing point of an employee share scheme interest Subdivision 83A-C applies to (ITAA 1997 ss 83A-115
// and 83A-120) and the amount s 83A-110 includes then, as the `ess-discount` command of
// ryanduguid/australian-accounting works them (its engine/ess_discount/deferral.rs).

import { addMonths, cmp, dateText, int, on, refuse, shown, sub } from './ess-core.mjs';
import { rightValue } from './ess-valuation.mjs';

/** @typedef {import('./ess-core.mjs').Dec} Dec */
/** @typedef {import('./ess-input.mjs').Held} Held */
/** @typedef {import('./ess-input.mjs').Reader} Reader */
/** @typedef {{lifted: number | null, exercised: number | null, shareLifted: number | null, employmentEnded: number | null,
 *   disposed: number | null}} Facts */
/** @typedef {[number, string]} Point */

/** Act No. 8, 2022 Sch 10 item 9: cessation of employment is a taxing point only where it occurs before this day. */
const CESSATION_ENDS = '2022-07-01';

/** The dates in order: none before acquisition, a share's restrictions lifting only after an exercise, an exercise by
 * the last exercise day and no disposal of a right before it is exercised. @param {Reader} r @param {Facts} f
 * @param {number} acquired @param {number | null} last */
function consistent(r, f, acquired, last) {
  const { lifted, exercised, shareLifted, employmentEnded, disposed } = f;
  const early = [lifted, exercised, shareLifted, employmentEnded, disposed].some((d) => d !== null && d < acquired);
  const unexercised = shareLifted !== null && exercised === null;
  const beforeExercise = exercised !== null && shareLifted !== null && shareLifted < exercised;
  const expired = exercised !== null && last !== null && exercised > last;
  const disposedFirst = disposed !== null && exercised !== null && disposed < exercised;
  if (early || unexercised || beforeExercise || expired || disposedFirst) {
    refuse('ess_discount.dates_inconsistent', `${r.name}: every date must be on or after acquired, share_restrictions_lifted `
      + 'needs an exercise on or before it, and a right is exercised by its last_exercise_day and before any disposal.');
  }
}

/** The dated facts behind the taxing point. @param {Reader} r @param {boolean} share @param {number} acquired
 * @param {number | null} last @returns {Facts} */
function facts(r, share, acquired, last) {
  const lifted = r.day('restrictions_lifted', true);
  const exercised = share ? null : r.day('exercised', true);
  const shareLifted = share ? null : r.day('share_restrictions_lifted', true);
  let employmentEnded = null;
  if (acquired < on(CESSATION_ENDS)) {
    if (!r.has('employment_ended')) {
      refuse('ess_discount.employment_end_not_stated', `${r.name}: employment_ended (a date, or null while still employed) is `
        + `required for an interest acquired before ${CESSATION_ENDS}: ending employment before then was a taxing point `
        + '(former ss 83A-115(5) and 83A-120(5)).');
    }
    employmentEnded = r.day('employment_ended', true);
  }
  const out = { lifted, exercised, shareLifted, employmentEnded, disposed: r.day('disposed', true) };
  consistent(r, out, acquired, last);
  return out;
}

/** The earliest time s 83A-115(2) or s 83A-120(2) gives, and its rule, with or without the former cessation of
 * employment point. @param {boolean} share @param {number} acquired @param {Facts} f @param {boolean} cessation
 * @returns {Point} */
function earliest(share, acquired, f, cessation) {
  const section = share ? 's 83A-115' : 's 83A-120';
  /** @type {Point[]} */
  const points = [[addMonths(acquired, 180) - 1, `${section}(6)`]];
  if (f.lifted !== null && (share || f.exercised === null || f.lifted < f.exercised)) points.push([f.lifted, `${section}(4)`]);
  if (f.exercised !== null && f.shareLifted !== null) points.push([Math.max(f.exercised, f.shareLifted), 's 83A-120(7)']);
  if (cessation && f.employmentEnded !== null && f.employmentEnded < on(CESSATION_ENDS)) {
    points.push([f.employmentEnded, `former ${section}(5)`]);
  }
  return points.reduce((best, p) => (p[0] < best[0] ? p : best));
}

/** A point moved to a disposal within 30 days after it (ss 83A-115(3), 83A-120(3)). @param {Reader} r
 * @param {boolean} share @param {Facts} f @param {Point} point @returns {Point} */
function moved(r, share, f, [base, rule]) {
  if (f.disposed === null) return [base, rule];
  if (f.disposed < base) {
    refuse('ess_discount.dates_inconsistent', `${r.name}: disposed is before the taxing point ${dateText(base)} (${rule}); `
      + 'the worksheet does not take a disposal before it.');
  }
  return f.disposed - base <= 30 ? [f.disposed, share ? 's 83A-115(3)' : 's 83A-120(3)'] : [base, rule];
}

/** The taxing point after the 30-day rule. Act No. 8, 2022 Sch 10 item 9 applies the repeal of the cessation point
 * where the taxing point, after that rule, is on or after 1 July 2022, so such a point is worked out again without it.
 * @param {Reader} r @param {boolean} share @param {number} acquired @param {Facts} f */
function taxingPoint(r, share, acquired, f) {
  const point = moved(r, share, f, earliest(share, acquired, f, true));
  return point[0] < on(CESSATION_ENDS) ? point : moved(r, share, f, earliest(share, acquired, f, false));
}

/** `taxing_point_value`: null, or the value on the taxing point as `market_value`, or for a right the regulations
 * allow, `share_market_value`. @param {Held} held @param {number} acquired @param {number} point @param {boolean} tables
 * @returns {[Dec | null, Record<string, unknown> | null]} */
function valueAt(held, acquired, point, tables) {
  const v = held.reader.object('taxing_point_value');
  if (v === null) return [null, null];
  const stated = v.date('date');
  if (stated !== point) {
    refuse('ess_discount.taxing_point_value', `${held.reader.name}: the value is stated on ${dateText(stated)}, but the `
      + `deferred taxing point is ${dateText(point)}.`);
  }
  /** @type {[Dec | null, Record<string, unknown> | null]} */
  let out;
  if (v.has('share_market_value')) {
    if (held.right === null || !tables) {
      refuse('ess_discount.valuation_unavailable', `${held.reader.name}: the regulations value only a right not yet exercised, `
        + 'and not on a disposal (s 83A-315.01(2)): give market_value.');
    }
    out = rightValue(v.amount('share_market_value'), held.right.exercisePrice, point, held.right.last, acquired);
  } else {
    out = [v.amount('market_value'), null];
  }
  v.finish('taxing_point_value');
  return out;
}

/**
 * The deferred interest's taxing point, the amount s 83A-110(1) includes then (nil where the cost base is more; null
 * without the value) and its detail for the interest's row.
 * @param {Held} held @param {boolean} share @param {number} acquired
 * @returns {[number, Dec | null, Record<string, unknown>]}
 */
export function deferred(held, share, acquired) {
  const f = facts(held.reader, share, acquired, held.right?.last ?? null);
  const [point, rule] = taxingPoint(held.reader, share, acquired, f);
  const costBase = held.reader.amount('cost_base');
  // The regulations value a right not yet exercised, not one disposed of under the 30-day rule (s 83A-315.01(2)).
  const tables = !share && !rule.endsWith('(3)') && (f.exercised === null || f.exercised > point);
  const [value, valuation] = valueAt(held, acquired, point, tables);
  let amount = null;
  if (value !== null) {
    const gain = sub(value, costBase);
    amount = cmp(int(0), gain) > 0 ? int(0) : gain;
  }
  return [point, amount, {
    deferred_taxing_point: dateText(point), taxing_point_rule: rule, cost_base: shown(costBase),
    value_at_taxing_point: value === null ? null : shown(value), valuation_at_taxing_point: valuation,
  }];
}
