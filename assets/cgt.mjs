// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { cents, number, ratioCents } from './money.mjs';
import { incomeTax, wholeDollars } from './income-tax.mjs';

// The capital gain or capital loss from one CGT event A1 (a disposal) for an Australian resident,
// with a contract from 1 July 2020 to 30 June 2027. Read 19 November 2026: Income Tax Assessment
// Act 1997 Parts 3-1 and 3-3 as they stood in Compilation No. 264 (21 May 2026), the last before the
// Treasury Laws Amendment (Tax Reform No. 1) Act 2026 (Act No. 49 of 2026), whose Schedule 1 applies
// to CGT events from 1 July 2027 and income years from the one that includes it; and the ATO's
// Guide to capital gains tax 2026 (last updated 30 May 2026) with its Appendix 2 (published 30 May
// 2026). The provisions used were last amended in 2019 or earlier, so one text covers every event
// from 1 July 2020. Whether a dwelling was the main residence, an absence choice, the floor area
// used to produce income and each market value are the user's answers: the engine counts them.

export const CGT_EVENTS = { from: '2020-07-01', until: '2027-06-30' };
export const AWAY_ROWS = 4;

/** The ATO's Appendix 2 CPI (all groups, weighted average of 8 capital cities), in tenths, for the
 * quarters ending March, June, September and December; 0 where the table has none. */
/** @type {Record<number, number[]>} */
export const CPI = {
  1985: [0, 0, 397, 405], 1986: [414, 421, 432, 444], 1987: [453, 460, 468, 476], 1988: [484, 493, 502, 512],
  1989: [517, 530, 542, 552], 1990: [562, 571, 575, 590], 1991: [589, 590, 593, 599], 1992: [599, 597, 598, 601],
  1993: [606, 608, 611, 612], 1994: [615, 619, 623, 628], 1995: [638, 647, 655, 660], 1996: [662, 667, 669, 670],
  1997: [671, 669, 666, 668], 1998: [670, 674, 675, 678], 1999: [678, 681, 687, 0],
};
const SEPTEMBER_1999 = 687n;

/**
 * @typedef {'individual' | 'trust' | 'super' | 'company'} CgtEntity
 * @typedef {{amount: string, date: string}} CgtCost
 * @typedef {{from: string, to: string, rented: boolean, choose: boolean}} CgtAbsence
 * @typedef {{purchased: string, sold: string, movedIn: string, practicable: string, exclusions: string,
 *   away: CgtAbsence[], partPercent: string, partFrom: string, partTo: string, market: string}} CgtHome
 * @typedef {{entity: CgtEntity, resident: string, kind: string, acquired: string, event: string, proceeds: string,
 *   price: string, buying: CgtCost, improvements: readonly CgtCost[], selling: string, owning: string, works: string,
 *   currentLosses: string, priorLosses: string, income: string, home: CgtHome}} CgtEvent
 */

const DAY = 86400000;
/** @param {string} iso */
const dayOf = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DAY;
/** @param {number} day */
const isoOf = (day) => new Date(day * DAY).toISOString().slice(0, 10);
/** The same day `years` later; 29 February becomes 1 March. @param {string} iso @param {number} years */
const yearsLater = (iso, years) => {
  const moved = `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`;
  return isoOf(dayOf(moved)) === moved ? moved : `${moved.slice(0, 4)}-03-01`;
};
/** A calendar date as YYYY-MM-DD from 1 January 1985. @param {string} value @param {string} label */
function dateOf(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '') || isoOf(dayOf(value)) !== value || value < '1985-01-01') {
    throw new Error(`Enter the ${label} as a date.`);
  }
  return value;
}
/** @param {string} iso */
export const longDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Section 960-275(5): the September 1999 quarter's index number over the index number for the
 * quarter the expenditure was incurred, to 3 decimal places with a 4th of 5 or more rounding up, in
 * thousandths; 1.000 from 1 July 1999, as the index numbers stop at September 1999 (s 960-275(1)).
 * @param {string} iso */
export function indexationFactor(iso) {
  if (iso >= '1999-07-01') return 1000n;
  const index = CPI[Number(iso.slice(0, 4))]?.[Math.floor((Number(iso.slice(5, 7)) - 1) / 3)];
  if (!index) throw new Error('The CPI index numbers start at the September 1985 quarter: enter a later date of expenditure.');
  return (2n * SEPTEMBER_1999 * 1000n + BigInt(index)) / (2n * BigInt(index));
}

/** Section 115-100: the discount percentage as [numerator, denominator]; none for a company. */
/** @type {Record<CgtEntity, [bigint, bigint] | null>} */
const DISCOUNT = { individual: [1n, 2n], trust: [1n, 2n], super: [1n, 3n], company: null };
const ENTITIES = { individual: 'An individual', trust: 'A trust', super: 'A complying superannuation fund',
  company: 'A company (not a life insurance company or listed investment company)' };

/** The scope checks that refuse what this page does not work out. @param {CgtEvent} x */
function checkScope(x) {
  if (!Object.hasOwn(ENTITIES, x.entity)) throw new Error('Choose who made the capital gain or loss.');
  if (x.resident !== 'yes') {
    throw new Error('This page works out residents only: a foreign or temporary resident’s CGT discount is reduced or nil '
      + '(sections 115-105 to 115-120), and a foreign resident at the CGT event generally has no main residence exemption '
      + '(subsection 118-110(3)).');
  }
  if (x.kind === 'personal') {
    throw new Error('Collectables and personal use assets have their own rules (sections 108-10 to 108-30, 118-10): '
      + 'this page does not work them out.');
  }
  if (!['investment', 'equity', 'home'].includes(x.kind)) throw new Error('Choose what kind of asset it is.');
  if (x.kind === 'equity' && x.entity !== 'company') {
    throw new Error('The gain on shares, or units or other fixed or voting interests in a trust, that you and your associates '
      + 'own at least 10% of is not a discount capital gain when most of the company’s or trust’s assets, by cost base and by '
      + 'net capital gain, were acquired in the 12 months before the sale (section 115-45): this page does not test that.');
  }
  const acquired = dateOf(x.acquired, 'date of the purchase contract');
  const event = dateOf(x.event, 'date of the sale contract');
  if (event < CGT_EVENTS.from || event > CGT_EVENTS.until) {
    throw new Error(event > CGT_EVENTS.until
      ? 'From 1 July 2027 Schedule 1 to the Treasury Laws Amendment (Tax Reform No. 1) Act 2026 changes the CGT rules, '
        + 'and the CPI it indexes by is not yet published: this page covers sale contracts to 30 June 2027.'
      : 'Enter a sale contract from 1 July 2020 to 30 June 2027.');
  }
  if (acquired < '1985-09-20') {
    throw new Error('An asset acquired before 20 September 1985 is a pre-CGT asset: a capital gain or loss from it is '
      + 'disregarded (subsection 104-10(5)), though a later improvement can be a separate asset (section 108-70).');
  }
  if (acquired >= event) throw new Error('The sale contract must come after the purchase contract.');
  if (x.kind === 'home' && x.entity !== 'individual') {
    throw new Error('The main residence exemption is for individuals (section 118-110): choose an individual or another asset.');
  }
  return { acquired, event };
}

/** A dated amount, or null when it is nil. @param {CgtCost} cost @param {string} label @param {string} from @param {string} to */
function datedCost(cost, label, from, to) {
  const amount = cents(cost.amount);
  if (!amount) return null;
  const date = dateOf(cost.date, `date of the ${label}`);
  if (date < from || date > to) throw new Error(`Enter the date of the ${label} from ${longDate(from)} to ${longDate(to)}.`);
  return { amount, date };
}

/** The five elements as dated amounts (s 110-25): the first and second at acquisition, the fourth
 * and fifth as entered, the selling costs (second element) and the third element undated, as they
 * are never indexed. Under s 118-192 the market value replaces what was spent before the income time.
 * @param {CgtEvent} x @param {string} acquired @param {string} event @param {string | null} incomeTime */
function elementsOf(x, acquired, event, incomeTime) {
  const dated = [];
  let improvedAfterJune1999 = false;
  if (incomeTime) {
    const market = cents(x.home.market);
    if (!market) throw new Error('Enter the market value when the home was first used to produce income (section 118-192).');
    dated.push({ amount: market, date: incomeTime });
  } else {
    dated.push({ amount: cents(x.price), date: acquired });
    const buying = datedCost(x.buying, 'buying costs', '1985-01-01', event);
    if (buying) dated.push(buying);
  }
  x.improvements.forEach((cost, i) => {
    const improvement = datedCost(cost, `improvement or title cost ${i + 1}`, x.acquired, event);
    if (improvement && !(incomeTime && improvement.date < incomeTime)) {
      dated.push(improvement);
      improvedAfterJune1999 ||= improvement.date > '1999-06-30';
    }
  });
  const owning = cents(x.owning);
  if (owning && incomeTime) {
    throw new Error(`Section 118-192 treats the home as acquired on ${longDate(incomeTime)} for its market value, so only costs `
      + 'of owning from then count, and this page cannot date them: it works this sale only with costs of owning of $0.');
  }
  if (owning && acquired <= '1991-08-20') {
    throw new Error('Costs of owning form part of the cost base only for an asset acquired after 20 August 1991 (subsection 110-25(4)).');
  }
  return { dated, selling: cents(x.selling), owning, improvedAfterJune1999 };
}

/** Cost base, indexed cost base and reduced cost base in cents. Capital works deductions come out of
 * the reduced cost base (s 110-55(4)) and, for an asset acquired after 7.30 pm on 13 May 1997, out of
 * the cost base (s 110-45(2)); they come out at their face amount. For an earlier asset, those on an
 * improvement after 30 June 1999 also come out of the cost base (s 110-45(1A)), and the others do not.
 * @param {ReturnType<typeof elementsOf>} elements @param {string} acquired @param {string} works */
function costBases({ dated, selling, owning, improvedAfterJune1999 }, acquired, works) {
  const deducted = BigInt(cents(works));
  if (deducted && acquired === '1997-05-13') {
    throw new Error('For an asset acquired on 13 May 1997, whether capital works deductions reduce the cost base turns on '
      + 'whether it was acquired after 7.30 pm (subsection 110-45(1)): this page cannot tell.');
  }
  if (deducted && acquired < '1997-05-13' && improvedAfterJune1999) {
    throw new Error('For an asset acquired before 13 May 1997, capital works deductions on an improvement made after 30 June '
      + '1999 reduce the cost base and others do not (subsection 110-45(1A)): this page cannot split them.');
  }
  const spent = dated.reduce((sum, { amount }) => sum + BigInt(amount), 0n) + BigInt(selling);
  if (deducted > spent) throw new Error('Capital works deductions cannot exceed the amounts spent on the asset.');
  const fromCostBase = acquired > '1997-05-13' ? deducted : 0n;
  const indexed = dated.reduce((sum, { amount, date }) => sum + ratioCents(BigInt(amount) * indexationFactor(date), 1000n), 0n);
  return { costBase: spent + BigInt(owning) - fromCostBase, indexedCostBase: indexed + BigInt(selling + owning) - fromCostBase,
    reducedCostBase: spent - deducted };
}

/** One absence row, or null when both dates are blank. @param {CgtAbsence} row @param {number} n */
function absenceOf(row, n) {
  if (!row.from && !row.to) return null;
  const from = dayOf(dateOf(row.from, `first day of absence ${n}`));
  const to = dayOf(dateOf(row.to, `last day of absence ${n}`));
  if (to < from) throw new Error(`Absence ${n} must end on or after the day it starts.`);
  return { from, to, rented: row.rented === true, choose: row.choose === true, n };
}

/** Marks the absences in `main` (1 for a main residence day): an absence not chosen under s 118-145
 * is not main residence; a chosen one is, and while the home produces income only for 6 years from
 * the first day it does in that absence (s 118-145(2)), to the sixth anniversary inclusive as the
 * ATO's example 72 counts them (from 29 February, to 28 February). Rows that follow on day after day
 * are one absence, so the 6 years run across them. The ATO's example 80 counts a day fewer, so an
 * absence whose rented days end on the day the 2 counts differ on is refused (from 29 February, on
 * 28 February or 1 March); one past it is worked and noted. Returns whether one was past it.
 * @param {Uint8Array} main @param {Uint8Array} income
 * @param {NonNullable<ReturnType<typeof absenceOf>>[]} rows @param {number} start @param {number} movedIn @param {number} end */
function markAbsences(main, income, rows, start, movedIn, end) {
  let previous = null;
  /** @type {number | null} */
  let left = null;
  let capped = false;
  let allowance = 0;
  let leap = false;
  let rented = 0;
  const settle = () => {
    if (left === null) return;
    if (rented >= allowance && rented <= allowance + (leap ? 1 : 0)) {
      throw new Error('The ATO’s examples 72 and 80 count the 6 years a rented home can stay the main residence a day apart '
        + '(subsection 118-145(2)), and the rented days of this absence end on that day: this page cannot tell which count is right.');
    }
    capped ||= rented > allowance;
  };
  for (const row of rows) {
    if (row.from <= movedIn || row.to > end) {
      throw new Error(`Absence ${row.n} must start after the home became the main residence and end by settlement of the sale.`);
    }
    if (previous && row.from <= previous.to) throw new Error('Enter the absences in date order, without overlaps.');
    if (!previous || row.from !== previous.to + 1) {
      settle();
      left = null;
    }
    if (row.rented) income.fill(1, row.from - start, row.to - start + 1);
    if (!row.choose) main.fill(0, row.from - start, row.to - start + 1);
    else if (row.rented) {
      if (left === null) {
        const first = isoOf(row.from);
        leap = first.endsWith('-02-29');
        allowance = dayOf(yearsLater(first, 6)) - row.from + (leap ? 0 : 1);
        left = allowance;
        rented = 0;
      }
      const covered = Math.min(left, row.to - row.from + 1);
      rented += row.to - row.from + 1;
      main.fill(0, row.from - start + covered, row.to - start + 1);
      left -= covered;
    }
    previous = row;
  }
  settle();
  return capped;
}

/** Part used to produce income: hundredths of 1% of the floor area, and its first and last days.
 * @param {CgtHome} home @param {number} start @param {number} end */
function partUse(home, start, end) {
  const percent = Math.round(number(home.partPercent, { max: 100 }) * 100);
  if (!percent) return { percent, from: end + 1, to: end };
  const from = dayOf(dateOf(home.partFrom, 'first day of the part used to produce income'));
  const to = dayOf(dateOf(home.partTo, 'last day of the part used to produce income'));
  if (from < start || to > end || to < from) {
    throw new Error('Enter the part used to produce income within the ownership period, from settlement to settlement.');
  }
  return { percent, from, to };
}

/** Days from `start` in `main` that are not main residence, and in the part-use period that are.
 * @param {Uint8Array} main @param {number} offset @param {{from: number, to: number}} part @param {number} start */
function count(main, offset, part, start) {
  let nonMain = 0;
  let partDays = 0;
  for (let i = offset; i < main.length; i += 1) {
    if (!main[i]) nonMain += 1;
    else if (start + i >= part.from && start + i <= part.to) partDays += 1;
  }
  return { ownership: main.length - offset, nonMain, partDays };
}

/** The ownership period from settlement to settlement (ATO guide, 'When do you acquire an
 * ownership interest?'), counted in whole days with both ends included; the main residence days in
 * it (ss 118-135, 118-145, 118-185); the part used to produce income (s 118-190); and whether
 * s 118-192 moves the start to the first use to produce income. @param {CgtHome} home @param {string} acquired @param {string} event */
function residence(home, acquired, event) {
  if (home.exclusions !== 'none') {
    throw new Error('This page does not work out a home on more than 2 hectares (section 118-120), a spouse with a different '
      + 'main residence (section 118-170), a home from a deceased estate (section 118-195), building on land you owned '
      + '(section 118-150) or 2 homes when changing main residences (section 118-140).');
  }
  const start = dayOf(dateOf(home.purchased, 'settlement of the purchase'));
  const end = dayOf(dateOf(home.sold, 'settlement of the sale'));
  const movedIn = dayOf(dateOf(home.movedIn, 'day you moved in'));
  if (start < dayOf(acquired) || end < dayOf(event)) throw new Error('Each settlement must be on or after its contract.');
  if (movedIn < start || movedIn > end) throw new Error('Enter the day you moved in from settlement of the purchase to settlement of the sale.');
  if (!['yes', 'no'].includes(home.practicable)) throw new Error('Choose whether you moved in as soon as practicable.');
  const main = new Uint8Array(end - start + 1).fill(1);
  const income = new Uint8Array(end - start + 1);
  if (home.practicable === 'no') main.fill(0, 0, movedIn - start);
  const rows = home.away.map((row, i) => absenceOf(row, i + 1)).filter((row) => row !== null);
  const capped = markAbsences(main, income, rows, start, movedIn, end);
  const part = partUse(home, start, end);
  if (part.percent && main[part.from - start] && rows.some((row) => row.choose && part.from >= row.from && part.from <= row.to)) {
    throw new Error('Use of part of the home to produce income that began whilst you were away, with the home treated as your '
      + 'main residence, is ignored for that period (subsection 118-190(3)): this page does not work it out.');
  }
  if (part.percent) income.fill(1, part.from - start, part.to - start + 1);
  const days = count(main, 0, part, start);
  const first = income.indexOf(1);
  const incomeNotExempt = days.partDays > 0 || income.some((used, i) => used && !main[i]);
  const mainBefore = first > 0 && main.subarray(0, first).every(Boolean);
  if (first < 0 || !incomeNotExempt || !mainBefore || start + first < dayOf('1996-08-20')) return { ...days, part, capped, incomeTime: null };
  if (isoOf(start + first) === '1996-08-20') {
    throw new Error('Whether section 118-192 applies to first use to produce income on 20 August 1996 turns on whether it '
      + 'began after 7.30 pm: this page cannot tell.');
  }
  return { ...count(main, first, part, start), part, capped, incomeTime: isoOf(start + first) };
}

/** A signed amount in cents times numerator over denominator, its size rounded half up.
 * @param {bigint} value @param {bigint} numerator @param {bigint} denominator */
const share = (value, numerator, denominator) => (value < 0n ? -ratioCents(-value * numerator, denominator)
  : ratioCents(value * numerator, denominator));

/** One method's capital gain after the exemption share, the losses applied in the order of
 * s 102-5(1) steps 1 and 2, the discount (step 3) and the net capital gain, all in cents.
 * @param {bigint} gross @param {[bigint, bigint]} taxable @param {[bigint, bigint] | null} discount
 * @param {bigint} current @param {bigint} prior */
function netOf(gross, taxable, discount, current, prior) {
  const gain = gross > 0n ? share(gross, ...taxable) : 0n;
  // The exemption share applies to the gain before losses and the discount (ATO example 64).
  const currentApplied = gain < current ? gain : current;
  const priorApplied = gain - currentApplied < prior ? gain - currentApplied : prior;
  const remaining = gain - currentApplied - priorApplied;
  const discounted = discount ? share(remaining, discount[1] - discount[0], discount[1]) : remaining;
  return { gross, gain, currentApplied, priorApplied, discount: remaining - discounted, net: discounted,
    carried: current - currentApplied + prior - priorApplied };
}

/** The income year a date falls in. @param {string} iso */
const incomeYearOf = (iso) => {
  const first = Number(iso.slice(0, 4)) - (iso.slice(5, 7) < '07' ? 1 : 0);
  return `${first}-${String((first + 1) % 100).padStart(2, '0')}`;
};

/** The methods open to the entity: for a company indexation where it applies, else none (s 114-5,
 * ATO guide); for others the discount once held 12 months excluding both days (s 115-25, ATO
 * example 10) and indexation as a choice for an asset acquired by 11.45 am on 21 September 1999
 * (ss 114-1, 114-10); the 'other' method when neither applies.
 * @param {CgtEntity} entity @param {string} acquired @param {string} event */
function methodsOf(entity, acquired, event) {
  if (acquired === '1999-09-21') {
    throw new Error('For an asset acquired on 21 September 1999, whether the cost base can be indexed turns on whether it '
      + 'was acquired by 11.45 am (sections 114-1 and 114-10): this page cannot tell.');
  }
  const indexable = acquired <= '1999-09-21';
  if (entity === 'company') return [indexable ? 'indexation' : 'other'];
  const methods = event >= yearsLater(isoOf(dayOf(acquired) + 1), 1) ? ['discount'] : [];
  if (indexable) methods.push('indexation');
  return methods.length ? methods : ['other'];
}

/** The capital gain or capital loss from one CGT event A1, worked by each method open to the
 * entity, with the smallest net capital gain chosen (and, on a tie, the larger losses carried
 * forward), as the ATO guide's examples 11 to 13 compare them. @param {CgtEvent} x */
export function capitalGain(x) {
  const { acquired, event } = checkScope(x);
  const home = x.kind === 'home' ? residence(x.home, acquired, event) : null;
  const from = home?.incomeTime ?? acquired;
  const bases = costBases(elementsOf(x, acquired, event, home?.incomeTime ?? null), from, x.works);
  const proceeds = BigInt(cents(x.proceeds));
  /** @type {[bigint, bigint]} */
  const taxable = home ? [BigInt(home.nonMain * 10000 + home.part.percent * home.partDays), BigInt(home.ownership * 10000)]
    : [1n, 1n];
  const [current, prior] = [BigInt(cents(x.currentLosses)), BigInt(cents(x.priorLosses))];
  const methods = methodsOf(x.entity, from, event).map((method) => ({ method, ...netOf(proceeds
    - (method === 'indexation' ? bases.indexedCostBase : bases.costBase), taxable, method === 'discount' ? DISCOUNT[x.entity] : null,
  current, prior) }));
  methods.sort((a, b) => (a.net === b.net ? Number(b.carried - a.carried) : Number(a.net - b.net)));
  const loss = bases.reducedCostBase > proceeds ? share(bases.reducedCostBase - proceeds, ...taxable) : 0n;
  let chosen = methods[0];
  if (home && !taxable[0]) chosen = { ...chosen, method: 'exempt' };
  else if (loss) chosen = { ...netOf(0n, taxable, null, current, prior), gross: proceeds - bases.reducedCostBase, method: 'loss' };
  else if (!chosen.gain) chosen = { ...chosen, method: 'nil' };
  const carried = chosen.carried + loss;
  const year = incomeYearOf(event);
  const labelA = Number(chosen.net / 100n);
  const money = (/** @type {bigint} */ value) => Number(value) / 100;
  const tax = x.entity === 'individual' ? extraTax(x.income, labelA, year) : null;
  return { method: chosen.method, year, acquired: from, costBase: money(bases.costBase),
    indexedCostBase: methods.some(({ method }) => method === 'indexation') ? money(bases.indexedCostBase) : null,
    reducedCostBase: money(bases.reducedCostBase), gross: money(chosen.gross), ownershipDays: home?.ownership ?? null,
    nonMainDays: home?.nonMain ?? null, partDays: home?.partDays ?? null, partPercent: home ? home.part.percent / 100 : null,
    incomeTime: home?.incomeTime ?? null, gain: money(chosen.gain), loss: money(loss), currentApplied: money(chosen.currentApplied),
    priorApplied: money(chosen.priorApplied), discount: money(chosen.discount), net: money(chosen.net), labelA,
    carried: money(carried), labelV: Number(carried / 100n), tax, sixYears: home?.capped ?? false,
    alternative: !['discount', 'indexation'].includes(chosen.method) || methods.length === 1 ? null : { method: methods[1].method, net: money(methods[1].net) } };
}

/** The extra resident income tax and Medicare levy the net capital gain adds to other taxable
 * income, from the site's income tax engine for the event's income year.
 * @param {string} income whole dollars @param {number} gain whole dollars @param {string} year */
function extraTax(income, gain, year) {
  const base = incomeTax(income, year, 'resident').total;
  return Math.round((incomeTax(String(wholeDollars(income) + gain), year, 'resident').total - base) * 100) / 100;
}

/** The engine's input from the form's fields. @param {(name: string) => string} value a field's value
 * @param {(name: string) => boolean} checked a checkbox's state @returns {CgtEvent} */
export const cgtEventOf = (value, checked) => ({ entity: /** @type {CgtEntity} */ (value('entity')), resident: value('resident'),
  kind: value('kind'), acquired: value('acquired'), event: value('event'), proceeds: value('proceeds'), price: value('price'),
  buying: { amount: value('buying'), date: value('buying-date') },
  improvements: [1, 2].map((n) => ({ amount: value(`improvement-${n}`), date: value(`improvement-${n}-date`) })),
  selling: value('selling'), owning: value('owning'), works: value('works'), currentLosses: value('current-losses'),
  priorLosses: value('prior-losses'), income: value('income'),
  home: { purchased: value('purchased'), sold: value('sold'), movedIn: value('moved-in'), practicable: value('practicable'),
    exclusions: value('exclusions'), away: Array.from({ length: AWAY_ROWS }, (_, i) => ({ from: value(`away-${i + 1}-from`),
      to: value(`away-${i + 1}-to`), rented: checked(`away-${i + 1}-rented`), choose: checked(`away-${i + 1}-choose`) })),
    partPercent: value('part-percent'), partFrom: value('part-from'), partTo: value('part-to'), market: value('market') } });

/** @type {Record<string, string>} */
const METHODS = {
  discount: 'Discount method: held at least 12 months, so the discount applies (sections 115-25 and 115-100)',
  indexation: 'Indexation method: the cost base indexed to the September 1999 quarter (sections 114-1 and 960-275)',
  other: 'Other method: no discount and no indexation (sections 102-5 and 115-25)',
  loss: 'Capital loss: the capital proceeds are less than the reduced cost base (section 104-10)',
  exempt: 'Main residence exemption: the capital gain or loss is disregarded (section 118-110)',
  nil: 'No capital gain or loss (section 104-10)',
};
const KINDS = { investment: 'an investment or business asset', equity: 'shares or trust interests, at least 10% with associates',
  home: 'a home that was the individual’s main residence' };
/** @param {number} value whole dollars */
const wholeAud = (value) => `$${value.toLocaleString('en-AU')}`;

/** What the form was given, as the result restates it. @param {CgtEvent} x @param {(amount: number) => string} money */
function inputsOf(x, money) {
  const cost = (/** @type {string} */ amount) => money(cents(amount) / 100);
  const costs = x.improvements.filter(({ amount }) => cents(amount))
    .map(({ amount, date }) => `, improvement or title cost ${cost(amount)} on ${longDate(date)}`).join('');
  const parts = [`${ENTITIES[x.entity]}, an Australian resident; ${KINDS[/** @type {'investment' | 'equity' | 'home'} */ (x.kind)]} `
    + `bought under a contract of ${longDate(x.acquired)} and sold under a contract of ${longDate(x.event)} for ${cost(x.proceeds)}`,
  `purchase price ${cost(x.price)}${cents(x.buying.amount) ? `, buying costs ${cost(x.buying.amount)} on ${longDate(x.buying.date)}` : ''}`
    + `${costs}, selling costs ${cost(x.selling)}, costs of owning ${cost(x.owning)}, capital works deductions ${cost(x.works)}`,
  `capital losses this year ${cost(x.currentLosses)}, from earlier years ${cost(x.priorLosses)}`];
  if (x.entity === 'individual') parts.push(`other taxable income ${wholeAud(wholeDollars(x.income))}`);
  if (x.kind === 'home') parts.push(...homeInputs(x.home, cost));
  return parts.join('; ');
}

/** @param {CgtHome} h @param {(amount: string) => string} cost */
function homeInputs(h, cost) {
  const parts = [`settled ${longDate(h.purchased)} and ${longDate(h.sold)}, moved in ${longDate(h.movedIn)}`
    + `${h.practicable === 'yes' ? ' as soon as practicable' : ''}`];
  for (const { from, to, rented, choose } of h.away.filter((row) => row.from || row.to)) {
    parts.push(`away ${longDate(from)} to ${longDate(to)}, ${rented ? 'rented' : 'not rented'}, `
      + `${choose ? 'treated' : 'not treated'} as the main residence`);
  }
  if (number(h.partPercent, { max: 100 })) parts.push(`${h.partPercent}% used to produce income ${longDate(h.partFrom)} to ${longDate(h.partTo)}`);
  if (cents(h.market)) parts.push(`market value at first use to produce income ${cost(h.market)}`);
  return parts;
}

/** The main residence rows. @param {ReturnType<typeof capitalGain>} r @param {CgtEvent} x @param {(amount: number) => string} aud */
function homeRows(r, x, aud) {
  const days = (/** @type {number | null} */ n) => (n ?? 0).toLocaleString('en-AU');
  const rows = [['Ownership period, settlement to settlement', `${days(r.ownershipDays)} days, ${days(r.nonMainDays)} not the main residence`]];
  if (r.partPercent) {
    rows.push(['Part used to produce income (section 118-190)', `${r.partPercent.toFixed(2)}% of the floor area for ${days(r.partDays)} days`]);
  }
  rows.push(['Home first used to produce income (section 118-192)', r.incomeTime
    ? `Applies: taken to be acquired on ${longDate(r.incomeTime)} for ${aud(cents(x.home.market) / 100)}` : 'Does not apply'],
  [r.gross < 0 ? 'Capital loss before the main residence exemption' : 'Capital gain before the main residence exemption', aud(Math.abs(r.gross))]);
  return rows;
}

/** @param {ReturnType<typeof capitalGain>} r @param {CgtEvent} x */
function notesOf(r, x) {
  const notes = [`The CGT event happened in ${r.year}, the income year of the sale contract (subsection 104-10(3))`];
  if (r.sixYears) {
    notes.push('the 6 years a rented absence stays the main residence run to the sixth anniversary of its first day rented, '
      + 'inclusive, as the ATO’s example 72 counts them; its example 80 counts a day fewer');
  }
  if (x.entity === 'trust') notes.push('a beneficiary grosses up their share of a discounted gain and applies their own discount (Subdivision 115-C)');
  if (r.tax !== null) {
    notes.push('the estimate adds label A to the other taxable income at the resident rates, with the low income tax offset and '
      + 'the Medicare levy, and leaves out other offsets, the Medicare levy surcharge and study loan repayments');
  }
  return notes.join('; ');
}

/** The form's inputs, the working and the result as the page shows them.
 * @param {(name: string) => string} value a field's value @param {(name: string) => boolean} checked a checkbox's state
 * @param {(amount: number) => string} aud */
export function cgtResult(value, checked, aud) {
  const x = cgtEventOf(value, checked);
  const r = capitalGain(x);
  const rows = [['Method', METHODS[r.method]], ['Capital proceeds', aud(cents(x.proceeds) / 100)], ['Cost base', aud(r.costBase)]];
  if (r.indexedCostBase !== null) rows.push(['Indexed cost base', aud(r.indexedCostBase)]);
  if (r.reducedCostBase !== r.costBase || r.method === 'loss') rows.push(['Reduced cost base', aud(r.reducedCostBase)]);
  if (x.kind === 'home') rows.push(...homeRows(r, x, aud));
  rows.push(r.method === 'loss' ? ['Capital loss', aud(r.loss)] : ['Total current year capital gains (label H)', aud(r.gain)]);
  if (cents(x.currentLosses) || cents(x.priorLosses)) {
    rows.push(['Capital losses of this year applied', aud(r.currentApplied)], ['Net capital losses of earlier years applied', aud(r.priorApplied)]);
  }
  if (r.method === 'discount') rows.push([`CGT discount of ${x.entity === 'super' ? '33 1/3' : '50'}%`, aud(r.discount)]);
  const principal = rows.push(['Net capital gain', aud(r.net)]) - 1;
  rows.push(['Net capital gain (label A), whole dollars', wholeAud(r.labelA)]);
  if (r.carried) rows.push(['Net capital losses carried forward (label V), whole dollars', wholeAud(r.labelV)]);
  if (r.alternative) rows.push([`By the ${r.alternative.method} method instead`, `Net capital gain ${aud(r.alternative.net)}`]);
  if (r.tax !== null) rows.push([`Extra income tax and Medicare levy for ${r.year}, estimate`, aud(r.tax)]);
  return { inputs: inputsOf(x, aud), rows, principal, note: notesOf(r, x) };
}
