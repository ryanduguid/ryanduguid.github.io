// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { number } from './money.mjs';

// One corporate tax entity's franking account for an income year from 1 July to 30 June, 2025-26
// or 2026-27, as the franking-account command of australian-tax-calculators keeps it. Read on the
// ATO Legal Database on 19 November 2026: Income Tax Assessment Act 1997 ss 202-60, 202-65,
// 203-20 to 203-55 (the benchmark rule), 204-70 (significant variations), 205-15 and 205-30 (the
// credit and debit tables), 205-40 to 205-50 (franking deficit tax and refunds after the year's
// end), 205-70 (the offset) and 214-150 (the franking return's due date); the Franking Deficit Tax
// and Over-franking Tax Acts 2002, s 5 of each; and the ATO's Franking account tax return 2026
// instructions (published 30 May 2026), whose examples are the tests' vectors.
// Every amount is worked exactly as a fraction and shown half up to the cent.

/** @typedef {'private' | 'public' | 'exempt'} FrankingEntity */
/** @typedef {{date: string, type: string, amount: string, rdPart: string}} FrankingEvent */
/** @typedef {{date: string, amount: string, credit: string, permitted: string}} FrankingDistribution */
/** @typedef {{year: string, entity: FrankingEntity, rate: string, opening: string, rdForward: string,
 *   lastBenchmark: string, periodsSince: string, determination: boolean, taxBefore: string, offsetForward: string,
 *   earlierLiability: string, events: readonly FrankingEvent[], distributions: readonly FrankingDistribution[]}} FrankingInput */
/** @typedef {{date: string, item: string, credit: number | null, debit: number | null, balance: number}} FrankingLine */
/** @typedef {{date: string, amount: number, allocated: number, maximum: number, credit: number, percentage: string,
 *   period: string, comparedWith: string | null, overFrankingTax: number, underFrankingDebit: number}} FrankingWorked */
/** @typedef {{start: string, end: string, benchmark: string | null, comparedWith: string | null,
 *   threshold: number | null, varies: boolean}} FrankingPeriod */
/** @typedef {{date: string, taken: boolean, fdtAdded: number | null, dueWithReturn: string | null,
 *   dueOtherwise: string | null}} FrankingRefund */
/** @typedef {{credits: number, debits: number, closing: number, fdt: number, fdtFromRefunds: number,
 *   reduction: number, offset: number, labelK: number, oft: number, payable: number, rdCarried: number,
 *   offsetTotal: number | null, offsetUsed: number | null, offsetCarried: number | null, grossUp: string,
 *   balanceCode: 'S' | 'D', offsetCode: 'F' | 'P' | null, authority: string, variation: boolean,
 *   required: boolean, due: string | null, ledger: FrankingLine[], distributions: FrankingWorked[],
 *   periods: FrankingPeriod[], refunds: FrankingRefund[]}} FrankingResult */

/** The event types the account takes: whether each credits it, its table item and how the page names it.
 * @type {Record<string, {credit: boolean, item: string, label: string}>} */
export const FRANKING_EVENTS = {
  payg_instalment: { credit: true, item: 's 205-15(1) item 1', label: 'PAYG instalment paid' },
  income_tax_paid: { credit: true, item: 's 205-15(1) item 2', label: 'Income tax paid' },
  franked_distribution_received: { credit: true, item: 's 205-15(1) item 3', label: 'Franking credit on a franked distribution received' },
  franked_distribution_flowed_indirectly: { credit: true, item: 's 205-15(1) item 4', label: 'Share of a franking credit through a partnership or trust' },
  tax_offset_refund_excess_paid: { credit: true, item: 's 205-15(1) item 4A', label: 'Excess of a reduced tax offset refund paid' },
  exploration_credit: { credit: true, item: 's 205-15(1) item 7', label: 'Franking credit for an exploration credit' },
  dmt_paid: { credit: true, item: 's 205-15(1) item 9', label: 'Australian DMT tax paid' },
  income_tax_refund: { credit: false, item: 's 205-30(1) item 2', label: 'Income tax refund received' },
  linked_distribution: { credit: false, item: 's 205-30(1) item 5', label: 'Linked distribution debit (s 204-15)' },
  tax_exempt_bonus_shares: { credit: false, item: 's 205-30(1) item 6', label: 'Tax-exempt bonus shares debit (s 204-25)' },
  streaming_determination: { credit: false, item: 's 205-30(1) item 7', label: 'Commissioner’s streaming determination' },
  share_capital_tainting: { credit: false, item: 's 205-30(1) item 7A', label: 'Transfer to share capital (s 197-45)' },
  untainting_choice: { credit: false, item: 's 205-30(1) item 7B', label: 'Choice to untaint share capital (s 197-65)' },
  on_market_buy_back: { credit: false, item: 's 205-30(1) item 9', label: 'On-market buy-back' },
  off_market_buy_back: { credit: false, item: 's 205-30(1) item 9A', label: 'Off-market buy-back' },
  selective_capital_reduction: { credit: false, item: 's 205-30(1) item 9B', label: 'Selective reduction of capital' },
  dmt_refund: { credit: false, item: 's 205-30(1) item 14', label: 'Australian DMT tax refund received' },
};

// Rationals of BigInts, so 3/7 of a distribution stays exact.
/** @typedef {{n: bigint, d: bigint}} Q */
const gcd = (/** @type {bigint} */ a, /** @type {bigint} */ b) => { while (b) [a, b] = [b, a % b]; return a; };
/** @param {bigint} n @param {bigint} [d] @returns {Q} */
const q = (n, d = 1n) => {
  if (d < 0n) [n, d] = [-n, -d];
  const g = gcd(n < 0n ? -n : n, d) || 1n;
  return { n: n / g, d: d / g };
};
const ZERO = q(0n);
const add = (/** @type {Q} */ a, /** @type {Q} */ b) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (/** @type {Q} */ a, /** @type {Q} */ b) => q(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (/** @type {Q} */ a, /** @type {Q} */ b) => q(a.n * b.n, a.d * b.d);
const div = (/** @type {Q} */ a, /** @type {Q} */ b) => q(a.n * b.d, a.d * b.n);
const cmp = (/** @type {Q} */ a, /** @type {Q} */ b) => { const x = a.n * b.d - b.n * a.d; return x > 0n ? 1 : x < 0n ? -1 : 0; };
const min = (/** @type {Q} */ a, /** @type {Q} */ b) => (cmp(a, b) < 0 ? a : b);
const neg = (/** @type {Q} */ a) => q(-a.n, a.d);
const deficit = (/** @type {Q} */ balance) => (balance.n < 0n ? neg(balance) : ZERO);
/** Hundredths, half away from zero. @param {Q} a */
const hundredths = (a) => {
  const magnitude = (2n * (a.n < 0n ? -a.n : a.n) * 100n + a.d) / (2n * a.d);
  return a.n < 0n ? -magnitude : magnitude;
};
/** AUD to the cent, half up. @param {Q} a */
const aud = (a) => Number(hundredths(a)) / 100;
/** A percentage to 2 places, 5 up, as the ATO's section C shows a benchmark. @param {Q} a */
const twoPlaces = (a) => {
  const h = hundredths(a);
  const magnitude = h < 0n ? -h : h;
  return `${h < 0n ? '-' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`;
};
/** A decimal string as a rational. @param {string} text */
const exact = (text) => {
  const [whole, fraction = ''] = text.replace(/[$,]/g, '').replace('-', '').split('.');
  const value = q(BigInt(whole + fraction), 10n ** BigInt(fraction.length));
  return text.trim().startsWith('-') ? neg(value) : value;
};

/** An amount of AUD, the field named in any refusal. @param {string} label @param {string} text @param {number} [floor] */
function money(label, text, floor = 0) {
  try {
    number(text, { min: floor, max: 1e12, money: true });
  } catch (error) {
    throw new Error(`${label}: ${/** @type {Error} */ (error).message[0].toLowerCase()}${/** @type {Error} */ (error).message.slice(1)}`);
  }
  return exact(text.trim());
}

const DAY = 86400000;
/** @param {string} iso */
const dayOf = (iso) => Date.parse(`${iso}T00:00:00Z`) / DAY;
/** @param {number} n */
const isoOf = (n) => new Date(n * DAY).toISOString().slice(0, 10);
/** `iso` moved by `months`, on the same day or the month's last. @param {string} iso @param {number} months */
function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
/** A real YYYY-MM-DD date from `first` to `last`, or null. @param {string} text @param {string} first @param {string} last */
function dateIn(text, first, last) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const n = dayOf(text);
  return Number.isFinite(n) && isoOf(n) === text && text >= first && text <= last ? text : null;
}
/** A day as '1 July 2025'. @param {string} iso */
export const plainDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** A percentage from 0 to 100, to 2 places. @param {string} label @param {string} text */
function percentage(label, text) {
  try {
    number(text, { min: 0, max: 100 });
  } catch (error) {
    throw new Error(`${label}: ${/** @type {Error} */ (error).message[0].toLowerCase()}${/** @type {Error} */ (error).message.slice(1)}`);
  }
  return exact(text.trim());
}

const DIST_DEBIT = 's 205-30(1) item 1: franking credit on a distribution';
const UNDER_FRANKING = 's 205-30(1) item 3: franked below the benchmark (s 203-50(1)(b))';
const FDT_CREDIT = 's 205-15(1) item 5: last year’s franking deficit tax';

/** The checked facts that do not vary by event. @param {FrankingInput} input */
function facts(input) {
  if (!['2025-26', '2026-27'].includes(input.year)) throw new Error('Choose the income year: 2025-26 or 2026-27.');
  if (!['private', 'public', 'exempt'].includes(input.entity)) throw new Error('Choose the kind of entity.');
  if (!['25', '30'].includes(input.rate)) throw new Error('Choose the corporate tax rate for imputation purposes: 25% or 30%.');
  const end = Number(input.year.slice(0, 4)) + 1;
  const rate = q(BigInt(input.rate), 100n);
  return { start: `${end - 1}-07-01`, end: `${end}-06-30`, private: input.entity === 'private',
    exempt: input.entity === 'exempt', rate, grossUp: div(sub(q(1n), rate), rate) };
}

/** @param {FrankingEvent} e @param {number} n @param {ReturnType<typeof facts>} f */
function event(e, n, f) {
  const kind = FRANKING_EVENTS[e.type];
  if (!kind || !Object.hasOwn(FRANKING_EVENTS, e.type)) throw new Error(`Event ${n}: choose what it is.`);
  const refund = e.type === 'income_tax_refund';
  // s 205-50(2): a refund received within 3 months after the year's end can be taken back into the year.
  const last = refund ? addMonths(f.end, 3) : f.end;
  const date = dateIn(e.date, f.start, last);
  if (!date) {
    throw new Error(`Event ${n}: enter a date from ${plainDay(f.start)} to ${plainDay(last)}${refund ? ', the 3 months after the year’s end included for a refund' : ''}.`);
  }
  const amount = money(`Event ${n}`, e.amount);
  if (!amount.n) throw new Error(`Event ${n}: enter an amount above nil.`);
  const given = typeof e.rdPart === 'string' && e.rdPart.trim() !== '';
  if (given && !refund) throw new Error(`Event ${n}: an R&D part is for an income tax refund only.`);
  const rdPart = given ? money(`Event ${n}’s R&D part`, e.rdPart) : ZERO;
  if (cmp(rdPart, amount) > 0) throw new Error(`Event ${n}: the R&D part is more than the refund.`);
  return { date, type: e.type, kind, amount, rdPart };
}

/** @param {FrankingDistribution} x @param {number} n @param {ReturnType<typeof facts>} f */
function distribution(x, n, f) {
  const date = dateIn(x.date, f.start, f.end);
  if (!date) throw new Error(`Distribution ${n}: enter a date from ${plainDay(f.start)} to ${plainDay(f.end)}.`);
  const amount = money(`Distribution ${n}`, x.amount);
  if (!amount.n) throw new Error(`Distribution ${n}: enter the frankable distribution, above nil.`);
  const allocated = money(`Distribution ${n}’s franking credit`, x.credit);
  const permitted = typeof x.permitted === 'string' && x.permitted.trim() !== ''
    ? percentage(`Distribution ${n}’s permitted percentage`, x.permitted) : null;
  return { date, amount, allocated, permitted };
}

/** @typedef {ReturnType<typeof facts>} Facts */
/** @typedef {{start: string, end: string, benchmark: Q | null}} Period */
/** @typedef {{maximum: Q, credit: Q, pct: Q, period: number, reference: Q | null, over: Q, under: Q}} Worked */
/** @typedef {{date: string, item: string, credit: boolean, cls: 'credit' | 'trigger' | 'refund' | 'other', amount: Q}} Line */
/** @typedef {{before: Q, forward: Q, earlier: boolean | null}} IncomeTax */

/** ss 202-60, 202-65 and 203-50: one distribution's credit and percentage, and what the benchmark of its
 * franking period, set by the first (s 203-30), makes of it.
 * @param {ReturnType<typeof distribution>} dist @param {number} i @param {Period[]} periods @param {Facts} f
 * @returns {Worked} */
function workDistribution(dist, i, periods, f) {
  const maximum = div(dist.amount, f.grossUp);
  const credit = min(dist.allocated, maximum);
  const pct = min(mul(div(dist.allocated, maximum), q(100n)), q(100n));
  const period = periods.findIndex((p) => dist.date >= p.start && dist.date <= p.end);
  let reference = /** @type {Q | null} */ (null);
  let differential = ZERO;
  const set = periods[period].benchmark;
  if (!set) {
    if (dist.permitted) {
      throw new Error(`Distribution ${i + 1}: a permitted percentage is for a distribution after the first in its franking period, whose franking percentage sets the benchmark (s 203-30).`);
    }
    periods[period].benchmark = pct;
  } else if (!f.exempt) {
    reference = dist.permitted ?? set;
    differential = sub(pct, reference);
  }
  const consequence = div(mul(dist.amount, differential.n < 0n ? neg(differential) : differential), mul(q(100n), f.grossUp));
  const over = differential.n > 0n ? consequence : ZERO;
  const under = differential.n < 0n ? consequence : ZERO;
  return { maximum, credit, pct, period, reference, over, under };
}

/** Each distribution under the benchmark rule, in its franking period.
 * @param {ReturnType<typeof distribution>[]} dists @param {Facts} f */
function benchmarkRule(dists, f) {
  const second = addMonths(f.start, 6);
  // s 203-45: a private company's franking period is its income year; otherwise each half (s 203-40(2)).
  /** @type {Period[]} */
  const periods = f.private ? [{ start: f.start, end: f.end, benchmark: null }]
    : [{ start: f.start, end: isoOf(dayOf(second) - 1), benchmark: null }, { start: second, end: f.end, benchmark: null }];
  const worked = dists.map((dist, i) => workDistribution(dist, i, periods, f));
  return { periods, worked };
}

/** The sum of the credits less the debits, from `opening`. @param {Q} opening @param {{credit: boolean, amount: Q}[]} lines */
const balanceOf = (opening, lines) => lines.reduce((sum, l) => (l.credit ? add(sum, l.amount) : sub(sum, l.amount)), opening);

/** The earlier benchmark, if one was given. @param {FrankingInput} input */
function lastBenchmark(input) {
  if (input.lastBenchmark.trim() === '') return null;
  const since = Number(input.periodsSince);
  if (!/^\d+$/.test(input.periodsSince.trim()) || since < 1 || since > 1000) {
    throw new Error('Enter the franking periods from the one after the last benchmark’s to this year’s first, counted: a whole number from 1.');
  }
  return { pct: percentage('Last benchmark', input.lastBenchmark), since };
}

/** The income tax facts s 205-70 applies the offset to, if any were given.
 * @param {FrankingInput} input @param {Facts} f @returns {IncomeTax | null} */
function incomeTax(input, f) {
  if (![input.taxBefore, input.offsetForward].some((t) => t.trim() !== '')) return null;
  const before = money('Income tax before this offset', input.taxBefore);
  const forward = money('Offset brought forward', input.offsetForward);
  if (f.private && !['yes', 'no'].includes(input.earlierLiability)) {
    throw new Error('Say whether the private company had an income tax liability for an earlier income year (s 205-70(5)(c)).');
  }
  return { before, forward, earlier: f.private ? input.earlierLiability === 'yes' : null };
}

/** One event's line, with the R&D deferral applied: s 205-15(4) reduces a PAYG instalment or income tax
 * paid by the deferral left, and under s 205-30(2)(b) a refund's R&D part debits nothing and joins it.
 * @param {ReturnType<typeof event>} e @param {Q} rdPool @returns {{line: Line, rdPool: Q}} */
function eventLine(e, rdPool) {
  let { amount } = e;
  let item = `${e.kind.item}: ${e.kind.label}`;
  if (['payg_instalment', 'income_tax_paid'].includes(e.type) && rdPool.n) {
    const reduction = min(rdPool, amount);
    amount = sub(amount, reduction);
    rdPool = sub(rdPool, reduction);
    item += `, less ${aud(reduction).toFixed(2)} under s 205-15(4)`;
  }
  if (e.type === 'income_tax_refund') {
    amount = sub(amount, e.rdPart);
    rdPool = add(rdPool, e.rdPart);
    if (e.rdPart.n) item += `, less its R&D part ${aud(e.rdPart).toFixed(2)} under s 205-30(2)(b)`;
  }
  const cls = e.kind.credit ? 'credit' : e.type === 'income_tax_refund' ? 'refund'
    : ['linked_distribution', 'tax_exempt_bonus_shares'].includes(e.type) ? 'trigger' : 'other';
  return { line: { date: e.date, item, credit: e.kind.credit, cls, amount }, rdPool };
}

/** The year's lines in date order (on one day, events as given, then distributions), opening with the
 * credit for last year's franking deficit tax when the year opens in deficit.
 * @param {Q} opening @param {ReturnType<typeof event>[]} events @param {ReturnType<typeof distribution>[]} dists
 * @param {Worked[]} worked @param {Facts} f @param {Q} rdPool */
function yearLines(opening, events, dists, worked, f, rdPool) {
  /** @type {Line[]} */
  const lines = [];
  if (opening.n < 0n) lines.push({ date: f.start, item: FDT_CREDIT, credit: true, cls: 'credit', amount: neg(opening) });
  const order = [...events.map((e, i) => ({ date: e.date, group: 0, i })).filter((o) => o.date <= f.end),
    ...dists.map((x, i) => ({ date: x.date, group: 1, i }))]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.group - b.group || a.i - b.i));
  for (const { date, group, i } of order) {
    if (group === 0) {
      const next = eventLine(events[i], rdPool);
      rdPool = next.rdPool;
      lines.push(next.line);
      continue;
    }
    const w = worked[i];
    if (w.credit.n) lines.push({ date, item: DIST_DEBIT, credit: false, cls: 'trigger', amount: w.credit });
    if (w.under.n) lines.push({ date, item: UNDER_FRANKING, credit: false, cls: 'trigger', amount: w.under });
  }
  return { lines, rdPool };
}

/** s 205-50(2): each refund received in the 3 months after the year's end, in date order, is taken to be
 * received just before it when it would put the account into deficit or further into it. Adds those to `lines`.
 * @param {Q} opening @param {Line[]} lines @param {ReturnType<typeof event>[]} events @param {Facts} f @param {Q} rdPool */
function lateRefunds(opening, lines, events, f, rdPool) {
  /** @type {FrankingRefund[]} */
  const refunds = [];
  /** @type {{date: string, added: Q}[]} */
  const taken = [];
  for (const e of events.filter((x) => x.date > f.end).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    const before = balanceOf(opening, lines);
    const debit = sub(e.amount, e.rdPart);
    const after = sub(before, debit);
    if (!debit.n || after.n >= 0n) {
      refunds.push({ date: e.date, taken: false, fdtAdded: null, dueWithReturn: null, dueOtherwise: null });
      continue;
    }
    rdPool = add(rdPool, e.rdPart);
    lines.push({ date: f.end, item: `s 205-30(1) item 2: income tax refund received ${plainDay(e.date)}, taken to be received just before the year’s end (s 205-50(2))`,
      credit: false, cls: 'refund', amount: debit });
    taken.push({ date: e.date, added: sub(deficit(after), deficit(before)) });
  }
  return { refunds, taken, rdPool };
}

/** s 205-70(2) step 1 by the ATO's method: the tax less 30% of the part attributable to item 1, 2, 3, 5 and
 * 6 debits when that part exceeds 10% of the year's credits; whole without an item 1, 3, 5 or 6 debit
 * (code F), for a private company meeting s 205-70(5) (code P) or under a Commissioner's determination.
 * @param {{fdt: Q, trigger: boolean, opening: Q, credits: Q, attributable: Q, determination: boolean, f: Facts, tax: IncomeTax | null}} a */
function currentOffset({ fdt, trigger, opening, credits, attributable, determination, f, tax }) {
  let reduction = ZERO;
  let code = /** @type {'F' | 'P' | null} */ (null);
  let authority;
  if (!fdt.n) {
    authority = 'No franking deficit tax, so no offset for the year (s 205-70(1)(a))';
  } else if (!trigger) {
    code = 'F';
    authority = 'No item 1, 3, 5 or 6 debit, so the offset is the whole franking deficit tax (s 205-70(2) step 1 and (8))';
  } else {
    const part = deficit(sub(add(opening.n > 0n ? opening : ZERO, credits), attributable));
    if (cmp(part, mul(credits, q(1n, 10n))) <= 0) {
      authority = 'The part of the deficit attributable to item 1, 2, 3, 5 and 6 debits is not more than 10% of the year’s credits, so the offset is not reduced (s 205-70(2) step 1)';
    } else if (determination) {
      authority = 'The Commissioner determined the excess was due to events outside the entity’s control, so the offset is not reduced (s 205-70(6))';
    } else if (f.private && !tax) {
      throw new Error('The offset reduction applies unless section 205-70(5) does, which turns on the private company’s income tax: enter its income tax before this offset, the offset brought forward and whether it had an earlier liability.');
    } else if (f.private && tax && tax.earlier === false && tax.before.n > 0n && cmp(tax.before, mul(fdt, q(9n, 10n))) >= 0) {
      code = 'P';
      authority = 'A private company’s first year of income tax liability, at least 90% of the deficit, so the offset is not reduced (s 205-70(5))';
    } else {
      reduction = mul(part, q(3n, 10n));
      authority = 'The part of the deficit attributable to item 1, 2, 3, 5 and 6 debits exceeds 10% of the year’s credits, so 30% of it comes off the offset (s 205-70(2) step 1)';
    }
  }
  return { reduction, code, authority };
}

/** s 204-70(1): each benchmark against the last, by more than 20 points for each franking period after
 * that one up to and including this one; s 204-70(2) leaves out an entity the rule does not apply to.
 * @param {Period[]} periods @param {{pct: Q, since: number} | null} last @param {Facts} f */
function variations(periods, last, f) {
  let variation = false;
  let previous = last ? { pct: last.pct, at: -last.since } : null;
  /** @type {FrankingPeriod[]} */
  const rows = [];
  for (const [k, p] of periods.entries()) {
    /** @type {FrankingPeriod} */
    const row = { start: p.start, end: p.end, benchmark: p.benchmark ? twoPlaces(p.benchmark) : null, comparedWith: null, threshold: null, varies: false };
    if (p.benchmark) {
      if (previous) {
        const gap = sub(p.benchmark, previous.pct);
        row.comparedWith = twoPlaces(previous.pct);
        row.threshold = 20 * (k - previous.at);
        row.varies = !f.exempt && cmp(gap.n < 0n ? neg(gap) : gap, q(BigInt(row.threshold))) > 0;
        variation ||= row.varies;
      }
      previous = { pct: p.benchmark, at: k };
    }
    rows.push(row);
  }
  return { variation, rows };
}

/** The account line by line with its running balance. @param {Q} opening @param {Line[]} lines @returns {FrankingLine[]} */
function ledgerRows(opening, lines) {
  let running = opening;
  return lines.map((l) => {
    running = l.credit ? add(running, l.amount) : sub(running, l.amount);
    return { date: l.date, item: l.item, credit: l.credit ? aud(l.amount) : null, debit: l.credit ? null : aud(l.amount), balance: aud(running) };
  });
}

/** Each distribution's working, in AUD.
 * @param {ReturnType<typeof distribution>[]} dists @param {Worked[]} worked @param {Period[]} periods @returns {FrankingWorked[]} */
function distributionRows(dists, worked, periods) {
  return dists.map((x, i) => ({ date: x.date, amount: aud(x.amount), allocated: aud(x.allocated), maximum: aud(worked[i].maximum),
    credit: aud(worked[i].credit), percentage: twoPlaces(worked[i].pct), period: periods[worked[i].period].start,
    comparedWith: worked[i].reference ? twoPlaces(/** @type {Q} */ (worked[i].reference)) : null,
    overFrankingTax: aud(worked[i].over), underFrankingDebit: aud(worked[i].under) }));
}

/**
 * The franking account for one income year: its lines and balance, franking deficit tax and its offset, the
 * benchmark rule's over-franking tax and debits, the significant variation test and the franking return's
 * amounts and due date.
 * @param {FrankingInput} input money and percentages as decimal strings, dates as YYYY-MM-DD
 * @returns {FrankingResult} money in AUD
 */
export function frankingAccount(input) {
  const f = facts(input);
  const opening = money('Opening balance', input.opening, -1e12);
  const last = lastBenchmark(input);
  const events = input.events.map((e, i) => event(e, i + 1, f));
  const dists = input.distributions.map((x, i) => distribution(x, i + 1, f));
  for (let i = 1; i < dists.length; i += 1) {
    if (dists[i].date < dists[i - 1].date) {
      throw new Error(`Distribution ${i + 1}: enter the distributions in date order; the first in a franking period sets its benchmark (s 203-30).`);
    }
  }
  const tax = incomeTax(input, f);
  const { periods, worked } = benchmarkRule(dists, f);
  const year = yearLines(opening, events, dists, worked, f, money('R&D deferral brought forward', input.rdForward));
  const { lines } = year;
  const beforeRefunds = deficit(balanceOf(opening, lines));
  const { refunds, taken, rdPool } = lateRefunds(opening, lines, events, f, year.rdPool);

  const trigger = lines.some((l) => l.cls === 'trigger' && l.amount.n);
  const sum = (/** @type {(l: Line) => boolean} */ keep) => lines.filter(keep).reduce((t, l) => add(t, l.amount), ZERO);
  const credits = sum((l) => l.credit);
  const attributable = sum((l) => l.cls === 'trigger' || l.cls === 'refund');
  const labelK = sum((l) => l.cls === 'other' || (!trigger && l.cls === 'refund'));
  const closing = balanceOf(opening, lines);
  const fdt = deficit(closing);
  const { reduction, code, authority } = currentOffset({ fdt, trigger, opening, credits, attributable, determination: input.determination, f, tax });
  const offset = sub(fdt, reduction);
  const oft = worked.reduce((t, w) => add(t, w.over), ZERO);
  const { variation, rows } = variations(periods, last, f);

  const required = Boolean(fdt.n || oft.n || variation);
  // s 214-150(1): the last day of the month after the year's end.
  const due = isoOf(dayOf(addMonths(isoOf(dayOf(f.end) + 1), 1)) - 1);
  const outstanding = Boolean(beforeRefunds.n || oft.n || variation);
  for (const t of taken) {
    // s 214-150(4): with a return outstanding, its due date if the refund is in it; otherwise 14 days after.
    refunds.push({ date: t.date, taken: true, fdtAdded: aud(t.added), dueWithReturn: outstanding && t.date <= due ? due : null,
      dueOtherwise: isoOf(dayOf(t.date) + 14) });
  }
  refunds.sort((a, b) => Number(b.taken) - Number(a.taken));
  const total = tax ? add(offset, tax.forward) : null;
  const used = tax && total ? min(total, tax.before) : null;
  const balanceCode = closing.n < 0n ? 'D' : 'S';
  return {
    credits: aud(credits), debits: aud(sum((l) => !l.credit)), closing: aud(closing), fdt: aud(fdt), fdtFromRefunds: aud(sub(fdt, beforeRefunds)),
    reduction: aud(reduction), offset: aud(offset), labelK: aud(labelK), oft: aud(oft), payable: aud(add(fdt, oft)), rdCarried: aud(rdPool),
    offsetTotal: total ? aud(total) : null, offsetUsed: used ? aud(used) : null, offsetCarried: total && used ? aud(sub(total, used)) : null,
    grossUp: (Number((f.grossUp.n * 10000n * 2n + f.grossUp.d) / (2n * f.grossUp.d)) / 10000).toFixed(4),
    balanceCode, offsetCode: code, authority, variation, required, due: required ? due : null,
    ledger: ledgerRows(opening, lines), distributions: distributionRows(dists, worked, periods), periods: rows, refunds,
  };
}

const ENTITY_TEXT = { private: 'a private company', public: 'a company that is not a private company',
  exempt: 'a listed public company or its 100% subsidiary (s 203-20)' };
export const FRANKING_EVENT_ROWS = 8;
export const FRANKING_DISTRIBUTION_ROWS = 4;

/** The engine's input from the form's fields: the rows with anything entered, in order.
 * @param {(name: string) => string | undefined} field the form's value for a field
 * @returns {FrankingInput} */
export function frankingInput(field) {
  const value = (/** @type {string} */ name) => field(name) ?? '';
  const filled = (/** @type {string[]} */ names) => names.some((name) => value(name).trim() !== '');
  /** @type {FrankingEvent[]} */
  const events = [];
  for (let i = 1; i <= FRANKING_EVENT_ROWS; i += 1) {
    if (filled([`event-${i}-date`, `event-${i}-amount`, `event-${i}-rd`])) {
      events.push({ date: value(`event-${i}-date`), type: value(`event-${i}-type`), amount: value(`event-${i}-amount`), rdPart: value(`event-${i}-rd`) });
    }
  }
  /** @type {FrankingDistribution[]} */
  const distributions = [];
  for (let i = 1; i <= FRANKING_DISTRIBUTION_ROWS; i += 1) {
    if (filled([`distribution-${i}-date`, `distribution-${i}-amount`, `distribution-${i}-credit`, `distribution-${i}-permitted`])) {
      distributions.push({ date: value(`distribution-${i}-date`), amount: value(`distribution-${i}-amount`),
        credit: value(`distribution-${i}-credit`), permitted: value(`distribution-${i}-permitted`) });
    }
  }
  return /** @type {FrankingInput} */ ({ year: value('year'), entity: value('entity'), rate: value('rate'), opening: value('opening'),
    rdForward: value('rd-forward'), lastBenchmark: value('last-benchmark'), periodsSince: value('periods-since'),
    determination: value('determination') === 'yes', taxBefore: value('tax-before'), offsetForward: value('offset-forward'),
    earlierLiability: value('earlier-liability'), events, distributions });
}

/** The page's inputs, rows, note and tables.
 * @param {(name: string) => string | undefined} value the form's value for a field
 * @param {(amount: number) => string} audText money as the page writes it */
export function frankingAccountResult(value, audText) {
  const input = frankingInput(value);
  const { events, distributions } = input;
  const r = frankingAccount(input);
  const count = (/** @type {number} */ n, /** @type {string} */ noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;
  const inputs = `${input.year}, ${ENTITY_TEXT[input.entity]}, ${input.rate}% corporate tax rate for imputation purposes, opening balance `
    + `${audText(aud(exact(input.opening)))}, ${count(events.length, 'event')}, ${count(distributions.length, 'distribution')}`;
  const rows = [['Franking credits for the year (label A)', audText(r.credits)], ['Franking debits for the year', audText(r.debits)],
    [`Closing balance, code ${r.balanceCode}`, audText(r.closing)], ['Franking deficit tax (label B)', audText(r.fdt)]];
  if (r.fdtFromRefunds) rows.push(['Of it, from refunds after the year’s end (label F)', audText(r.fdtFromRefunds)]);
  rows.push([`Franking deficit tax offset (label C)${r.offsetCode ? `, code ${r.offsetCode}` : ''}`, audText(r.offset)]);
  if (r.reduction) rows.push(['Offset reduction, 30% of the attributable part', audText(r.reduction)]);
  if (r.labelK) rows.push(['Debits not subject to the reduction (label K)', audText(r.labelK)]);
  rows.push(['Over-franking tax (label D)', audText(r.oft)]);
  const principal = rows.length;
  rows.push([r.required ? `Franking tax payable (label E), due ${plainDay(/** @type {string} */ (r.due))}` : 'Franking tax payable (label E)', audText(r.payable)]);
  if (r.offsetUsed !== null) {
    rows.push(['Offset used against this year’s income tax', audText(r.offsetUsed)],
      ['Offset carried forward', audText(/** @type {number} */ (r.offsetCarried))]);
  }
  if (r.rdCarried) rows.push(['R&D deferral carried forward (s 205-15(4))', audText(r.rdCarried)]);
  rows.push(['Significant variation in the benchmark (s 204-70)', r.variation ? 'Yes: disclose it' : 'No']);
  const note = `${r.authority}. ${r.required ? 'A franking return is needed for the year' : 'No franking return is needed: no franking deficit tax, over-franking tax or significant variation'}`;
  const ledger = r.ledger.map((l) => [plainDay(l.date), l.item, l.credit === null ? '' : audText(l.credit), l.debit === null ? '' : audText(l.debit), audText(l.balance)]);
  const worked = r.distributions.map((x) => [plainDay(x.date), audText(x.amount), audText(x.credit), `${x.percentage}%`,
    x.comparedWith === null ? 'Sets it' : `${x.comparedWith}%`, audText(x.overFrankingTax), audText(x.underFrankingDebit)]);
  return { inputs, rows, principal, note, tables: { ledger, distributions: worked } };
}
