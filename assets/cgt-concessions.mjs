// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { cents, number } from './money.mjs';

// Which small business CGT concessions in Division 152 of the Income Tax Assessment Act 1997 are
// open for a capital gain from CGT event A1 (a disposal) of an asset used in a business, on a sale
// contract from 1 July 2020 to 30 June 2027. Read 19 November 2026: Division 152 and section 328-110
// as they stood in Compilation No. 264 (21 May 2026), the last before the Treasury Laws Amendment
// (Tax Reform No. 1) Act 2026 (Act No. 49 of 2026), whose Division 152 changes apply to assessments
// for the income year that includes 1 July 2027 and later years (Schedule 1 item 82); section
// 104-190 for the replacement asset period; and the ATO's small business CGT concessions pages.
// Whether a business was carried on, each turnover, the net value of the CGT assets, the days the
// asset was active, retirement, incapacity and the significant individual are the user's answers:
// the engine applies the tests to them.

/**
 * @typedef {'individual' | 'company' | 'trust'} ConcessionEntity
 * @typedef {{entity: ConcessionEntity, partnership: string, asset: string, acquired: string, event: string,
 *   business: string, previousBusiness: string, previous: string, earlierBusiness: string, earlier: string,
 *   likely: string, actual: string, netAssets: string, passive: string, ceased: string, extension: string,
 *   active: string, born: string, retiring: string, incapacitated: string, significant: string,
 *   fifteen: string, choice: string, used: string}} ConcessionAnswers
 */

export const CONCESSION_EVENTS = { from: '2020-07-01', until: '2027-06-30' };
/** Subsection 152-10(1AA): section 328-110 with $2 million for each $10 million, in cents. */
const TURNOVER = 200_000_000;
/** Section 152-15, in cents. */
const NET_ASSETS = 600_000_000;
/** Subsection 152-320(1), in cents. */
const RETIREMENT_LIMIT = 50_000_000;
/** The shortest and longest 7½ years in days: 7 years with 1 leap day and the shortest 6 months
 * (2,556 + 181), and 7 years with 2 leap days and the longest 6 months (2,557 + 184). */
const SEVEN_AND_A_HALF = { shortest: 2737, longest: 2741 };

const DAY = 86400000;
/** @param {string} iso */
const dayOf = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DAY;
/** @param {number} day */
const isoOf = (day) => new Date(day * DAY).toISOString().slice(0, 10);
/** The same day `years` later or earlier; 29 February becomes 1 March. @param {string} iso @param {number} years */
const yearsLater = (iso, years) => {
  const moved = `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`;
  return isoOf(dayOf(moved)) === moved ? moved : `${moved.slice(0, 4)}-03-01`;
};
/** A calendar date as YYYY-MM-DD from 1 January 1900. @param {string} value @param {string} label */
function dateOf(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '') || isoOf(dayOf(value)) !== value || value < '1900-01-01') {
    throw new Error(`Enter the ${label} as a date.`);
  }
  return value;
}
/** @param {string} iso */
export const longDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
/** @param {string} value @param {string[]} options @param {string} message */
const chosen = (value, options, message) => {
  if (!options.includes(value)) throw new Error(message);
  return value;
};
const YES_NO = ['yes', 'no'];

/** The scope checks that refuse what this page does not work out. @param {ConcessionAnswers} x */
function checkScope(x) {
  chosen(x.entity, ['individual', 'company', 'trust'], 'Choose who made the capital gain.');
  if (chosen(x.asset, ['business', 'share'], 'Choose what kind of asset it is.') === 'share') {
    throw new Error('A share in a company or an interest in a trust must also meet the additional basic conditions in '
      + 'subsection 152-10(2), which look through to the company or trust: this page does not work them out.');
  }
  chosen(x.partnership, YES_NO, 'Choose whether the asset is your interest in a partnership asset.');
  chosen(x.passive, ['none', 'affiliate', 'partnership'], 'Choose whether the asset is passively held.');
  if (x.partnership === 'yes' && x.passive !== 'none') {
    throw new Error('Subsections 152-10(1A) and (1B) are for an asset that is not your interest in an asset of a partnership '
      + 'you are a partner in: choose one or the other.');
  }
  const acquired = dateOf(x.acquired, 'date of the purchase contract');
  const event = dateOf(x.event, 'date of the sale contract');
  if (event < CONCESSION_EVENTS.from || event > CONCESSION_EVENTS.until) {
    throw new Error(event > CONCESSION_EVENTS.until
      ? 'From the 2027-28 income year Schedule 1 to the Treasury Laws Amendment (Tax Reform No. 1) Act 2026 changes '
        + 'Division 152: this page covers sale contracts to 30 June 2027.'
      : 'Enter a sale contract from 1 July 2020 to 30 June 2027.');
  }
  if (acquired < '1985-09-20') {
    throw new Error('An asset acquired before 20 September 1985 is a pre-CGT asset: the capital gain is disregarded '
      + '(subsection 104-10(5)), so no concession is needed.');
  }
  if (acquired >= event) throw new Error('The sale contract must come after the purchase contract.');
  if (yearsLater(acquired, 15) === event) {
    throw new Error('Whether an asset bought on the same date 15 years before the sale was owned for 15 years '
      + '(sections 152-35 and 152-105) turns on the time of day of each contract: this page cannot tell.');
  }
  return { acquired, event };
}

/** Subsection 152-10(1AA) and section 328-110 at $2 million: whether you, or the partnership for a
 * partnership asset, are a CGT small business entity for the income year, and by which rule.
 * @param {ConcessionAnswers} x */
function smallBusiness(x) {
  chosen(x.business, ['yes', 'winding-up', 'no'], 'Choose whether a business was carried on in the income year.');
  chosen(x.previousBusiness, YES_NO, 'Choose whether a business was carried on in the previous income year.');
  chosen(x.earlierBusiness, YES_NO, 'Choose whether a business was carried on in the income year before that.');
  const [previous, earlier, likely, actual] = [x.previous, x.earlier, x.likely, x.actual].map((value) => cents(value));
  // Subsection 328-110(3): after 2 years of a business at $2 million or more, the likely turnover does not count.
  const barred = x.previousBusiness === 'yes' && x.earlierBusiness === 'yes' && previous >= TURNOVER && earlier >= TURNOVER;
  /** @type {string | null} */
  let rule = null;
  if (x.business !== 'no') {
    if (x.previousBusiness === 'yes' && previous < TURNOVER) rule = 'subparagraph 328-110(1)(b)(i)';
    else if (likely < TURNOVER && !barred) rule = 'subparagraph 328-110(1)(b)(ii)';
    else if (actual < TURNOVER) rule = 'subsection 328-110(4)';
  }
  return { smallBusiness: rule !== null, turnoverRule: rule, barred, previous, likely, actual };
}

/** Section 152-35: the test period, from acquisition to the CGT event or to an earlier end of the
 * business, and whether the asset was active for long enough in it. Both ends are counted.
 * @param {ConcessionAnswers} x @param {string} acquired @param {string} event */
function activeAsset(x, acquired, event) {
  let to = event;
  if (x.ceased) {
    const ceased = dateOf(x.ceased, 'day the business ceased');
    if (ceased < acquired || ceased > event) throw new Error('Enter the day the business ceased from the purchase to the sale contract.');
    chosen(x.extension, YES_NO, 'Choose whether the Commissioner allowed longer than 12 months.');
    // Subparagraph 152-35(2)(b)(ii): a business that ceased in the 12 months before the event, or a longer period allowed.
    if (yearsLater(ceased, 1) >= event || x.extension === 'yes') to = ceased;
  }
  const testDays = dayOf(to) - dayOf(acquired) + 1;
  const activeDays = number(x.active, { integer: true, max: 100_000 });
  if (activeDays > testDays) throw new Error(`The days active cannot exceed the ${testDays.toLocaleString('en-AU')} days of the test period.`);
  const over15 = yearsLater(acquired, 15) < event;
  if (over15 && activeDays >= SEVEN_AND_A_HALF.shortest && activeDays < SEVEN_AND_A_HALF.longest) {
    throw new Error('A total of 7½ years is 2,737 to 2,741 days, depending on the leap days and months it spans: count '
      + 'the active periods in years and months to see whether they reach 7½ years (paragraph 152-35(1)(b)).');
  }
  const met = over15 ? activeDays >= SEVEN_AND_A_HALF.longest : 2 * activeDays >= testDays;
  return { activeAsset: met, over15, testFrom: acquired, testTo: to, testDays, activeDays };
}

/** The age test of paragraphs 152-105(d) and 152-110(1)(d), and whether the individual is under
 * 55 just before the choice (paragraph 152-305(1)(b), subsection 152-325(7)).
 * @param {ConcessionAnswers} x @param {string} event */
function individualOf(x, event) {
  const born = dateOf(x.born, 'date of birth');
  if (born >= event) throw new Error('The date of birth must come before the sale contract.');
  const choice = dateOf(x.choice, 'day of the choice');
  if (choice < event) throw new Error('The choice is made on or after the sale contract.');
  chosen(x.retiring, YES_NO, 'Choose whether the sale is in connection with retirement.');
  chosen(x.incapacitated, YES_NO, 'Choose whether the individual is permanently incapacitated.');
  const fiftyFifth = yearsLater(born, 55);
  return { retires: (fiftyFifth <= event && x.retiring === 'yes') || x.incapacitated === 'yes', under55: choice < fiftyFifth };
}

/** Subdivision 152-B: the paragraphs of section 152-105 or subsection 152-110(1) not met.
 * @param {ConcessionAnswers} x @param {boolean} basic @param {boolean} owned15 @param {boolean} retires */
function fifteenYearUnmet(x, basic, owned15, retires) {
  const at = x.entity === 'individual' ? 'paragraph 152-105' : 'paragraph 152-110(1)';
  const unmet = [];
  if (!basic) unmet.push(`the basic conditions (${at}(a))`);
  if (!owned15) unmet.push(`continuous ownership for the 15 years before the CGT event (${at}(b))`);
  if (x.entity !== 'individual') {
    if (chosen(x.fifteen, YES_NO, 'Choose whether there was a significant individual for 15 years.') === 'no') {
      unmet.push(`a significant individual for a total of 15 years of ownership (${at}(c))`);
    }
    if (x.significant !== 'yes') unmet.push(`a significant individual just before the CGT event (${at}(d))`);
  }
  if (!retires) unmet.push(`aged 55 or over and retiring, or permanently incapacitated (${at}(d))`);
  return unmet;
}

/** The concessions in Division 152 open for the gain, with the tests each turns on. @param {ConcessionAnswers} x */
export function cgtConcessions(x) {
  const { acquired, event } = checkScope(x);
  const business = smallBusiness(x);
  const netValue = cents(x.netAssets);
  const netAssets = netValue <= NET_ASSETS;
  const passive = x.passive !== 'none';
  const active = activeAsset(x, acquired, event);
  const basic = (business.smallBusiness || netAssets || passive) && active.activeAsset;
  if (x.entity !== 'individual') chosen(x.significant, YES_NO, 'Choose whether there was a significant individual just before the CGT event.');
  const { retires, under55 } = individualOf(x, event);
  const unmet = fifteenYearUnmet(x, basic, yearsLater(acquired, 15) < event, retires);
  const fifteenYear = unmet.length === 0;
  const used = cents(x.used);
  if (used > RETIREMENT_LIMIT) throw new Error('The CGT exempt amounts already chosen cannot exceed the $500,000 limit (section 152-320).');
  const significant = x.entity === 'individual' || x.significant === 'yes';
  const retirement = !fifteenYear && basic && significant && used < RETIREMENT_LIMIT;
  return { basic, ...business, netValue, netAssets, passive, ...active, fifteenYear, fifteenYearUnmet: unmet,
    reduction: !fifteenYear && basic, retirement, significant, retirementLimit: (RETIREMENT_LIMIT - used) / 100,
    superContribution: retirement && under55, rollover: !fifteenYear && basic,
    replacementFrom: yearsLater(event, -1), replacementTo: yearsLater(event, 2) };
}

/** The engine's input from the form's fields. @param {(name: string) => string} value @returns {ConcessionAnswers} */
export const cgtConcessionsAnswersOf = (value) => ({ entity: /** @type {ConcessionEntity} */ (value('entity')),
  partnership: value('partnership'), asset: value('asset'), acquired: value('acquired'), event: value('event'),
  business: value('business'), previousBusiness: value('previous-business'), previous: value('previous'),
  earlierBusiness: value('earlier-business'), earlier: value('earlier'), likely: value('likely'), actual: value('actual'),
  netAssets: value('net-assets'), passive: value('passive'), ceased: value('ceased'), extension: value('extension'),
  active: value('active'), born: value('born'), retiring: value('retiring'), incapacitated: value('incapacitated'),
  significant: value('significant'), fifteen: value('fifteen'), choice: value('choice'), used: value('used') });

const ENTITIES = { individual: 'An individual', company: 'A company', trust: 'A trust' };
/** @type {Record<string, string>} */
const BUSINESS = { yes: 'a business carried on', 'winding-up': 'a business being wound up', no: 'no business carried on' };
/** @type {Record<string, string>} */
const PASSIVE = { none: 'not passively held', affiliate: 'passively held, used in the business of an affiliate or connected entity',
  partnership: 'passively held, used in the business of a partnership you are a partner in' };
/** @param {string[]} items */
const listed = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
/** @param {boolean} met */
const verdict = (met) => (met ? 'met' : 'not met');

/** What the form was given, as the result restates it. @param {ConcessionAnswers} x @param {(cents: number) => string} money */
function inputsOf(x, money) {
  const turnover = (/** @type {string} */ business, /** @type {string} */ amount) => (business === 'yes' ? money(cents(amount)) : 'no business');
  const parts = [`${ENTITIES[x.entity]}${x.partnership === 'yes' ? ', a partnership asset' : ''}, bought ${longDate(x.acquired)}, `
    + `sold ${longDate(x.event)}`, `${BUSINESS[x.business]}; turnover ${turnover(x.previousBusiness, x.previous)} the previous year, `
    + `${turnover(x.earlierBusiness, x.earlier)} the year before, ${money(cents(x.likely))} likely and ${money(cents(x.actual))} actual this year`,
  `net value of CGT assets ${money(cents(x.netAssets))}, ${PASSIVE[x.passive]}`,
  `active for ${Number(x.active).toLocaleString('en-AU')} days${x.ceased ? `, business ceased ${longDate(x.ceased)}`
    + `${x.extension === 'yes' ? ' with a longer period allowed' : ''}` : ''}`,
  `born ${longDate(x.born)}${x.retiring === 'yes' ? ', retiring' : ''}${x.incapacitated === 'yes' ? ', permanently incapacitated' : ''}`];
  if (x.entity !== 'individual') {
    parts.push(`${x.significant === 'yes' ? 'a' : 'no'} significant individual just before the sale, `
      + `${x.fifteen === 'yes' ? 'one' : 'none'} for 15 years of ownership`);
  }
  parts.push(`choice on ${longDate(x.choice)}, ${money(cents(x.used))} of the retirement limit used`);
  return parts.join('; ');
}

/** The CGT small business entity row. @param {ReturnType<typeof cgtConcessions>} r @param {ConcessionAnswers} x
 * @param {(cents: number) => string} money */
function businessRow(r, x, money) {
  const label = x.partnership === 'yes' ? 'Partnership a CGT small business entity (subparagraph 152-10(1)(c)(iii))'
    : 'CGT small business entity (subsection 152-10(1AA) and section 328-110 at $2 million)';
  if (x.business === 'no') return [label, 'No business carried on in the income year (paragraph 328-110(1)(a)): not met'];
  /** @type {Record<string, string>} */
  const found = {
    'subparagraph 328-110(1)(b)(i)': `Previous year’s aggregated turnover ${money(r.previous)}`,
    'subparagraph 328-110(1)(b)(ii)': `Likely aggregated turnover for the year ${money(r.likely)}`,
    'subsection 328-110(4)': `Aggregated turnover for the year, at its end, ${money(r.actual)}`,
  };
  if (r.turnoverRule) return [label, `${found[r.turnoverRule]}, under $2,000,000 (${r.turnoverRule}): met`];
  return [label, `No aggregated turnover under $2,000,000${r.barred && r.likely < TURNOVER
    ? ' that counts: the likely turnover does not after 2 years at $2,000,000 or more (subsection 328-110(3))' : ''}: not met`];
}

/** The retirement exemption row's finding. @param {ReturnType<typeof cgtConcessions>} r @param {boolean} company */
function retirementOf(r, company) {
  if (r.fifteenYear) return 'Not needed: the 15-year exemption disregards the whole gain (section 152-330)';
  if (!r.basic) return 'Not available: the basic conditions are not met';
  if (!r.significant) return 'Not available: no significant individual just before the CGT event (paragraph 152-305(2)(b))';
  if (!r.retirement) return 'Not available: the $500,000 limit is used up (section 152-320)';
  const limit = `$${r.retirementLimit.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
  const parts = [`Available: up to ${limit} of the gain left after the 50% reduction${company ? ' for this stakeholder' : ''} (section 152-320)`];
  if (company) {
    parts.push('paid to its CGT concession stakeholders within 7 days of the later of the choice and receiving the proceeds '
      + '(subsection 152-325(4))');
  }
  if (r.superContribution) {
    parts.push(`with the exempt amount paid into a complying super fund or RSA, as the individual is under 55 just before the `
      + `${company ? 'payment' : 'choice'} (${company ? 'subsection 152-325(7)' : 'paragraph 152-305(1)(b)'})`);
  }
  return parts.join(', ');
}

/** The concession rows. @param {ReturnType<typeof cgtConcessions>} r @param {ConcessionAnswers} x */
function concessionRows(r, x) {
  const notNeeded = 'Not needed: the 15-year exemption disregards the whole gain';
  const failed = 'Not available: the basic conditions are not met';
  let reduction = failed;
  if (r.fifteenYear) reduction = `${notNeeded} (section 152-215)`;
  else if (r.reduction) {
    reduction = 'Applies: the gain left after losses and any CGT discount is halved, unless you choose otherwise (sections 152-205 and 152-220)';
  }
  let rollover = failed;
  if (r.fifteenYear) rollover = notNeeded;
  else if (r.rollover) {
    rollover = `Available: a replacement active asset or capital improvement from ${longDate(r.replacementFrom)} to `
      + `${longDate(r.replacementTo)} (subsection 104-190(1A))`;
  }
  return [
    ['15-year exemption (Subdivision 152-B)', r.fifteenYear ? 'Available: the whole capital gain is disregarded'
      : `Not available, as these are not met: ${listed(r.fifteenYearUnmet)}`],
    ['50% active asset reduction (Subdivision 152-C)', reduction],
    ['Retirement exemption (Subdivision 152-D)', retirementOf(r, x.entity !== 'individual')],
    ['Roll-over (Subdivision 152-E)', rollover],
  ];
}

/** The form's answers, the tests and the concessions as the page shows them.
 * @param {(name: string) => string} value a field's value @param {(amount: number) => string} aud */
export function cgtConcessionsResult(value, aud) {
  const x = cgtConcessionsAnswersOf(value);
  const r = cgtConcessions(x);
  const money = (/** @type {number} */ amount) => aud(amount / 100);
  const open = [[r.fifteenYear, '15-year exemption'], [r.reduction, '50% active asset reduction'], [r.retirement, 'retirement exemption'],
    [r.rollover, 'roll-over']].filter(([on]) => on).map(([, name]) => /** @type {string} */ (name));
  const days = (/** @type {number} */ n) => n.toLocaleString('en-AU');
  const rows = [
    ['Concessions open', open.length ? `${listed(open)} (Division 152)` : 'None: the basic conditions in subsection 152-10(1) are not met'],
    ['Basic conditions (subsection 152-10(1))', r.basic ? 'Met' : `Not met: ${listed([
      ...(r.smallBusiness || r.netAssets || r.passive ? [] : ['none of the 4 tests in paragraph 152-10(1)(c)']),
      ...(r.activeAsset ? [] : ['the active asset test (paragraph 152-10(1)(d))'])])}`],
    businessRow(r, x, money),
    ['Maximum net asset value test (section 152-15)', `${money(r.netValue)}, ${r.netAssets ? 'not more than' : 'more than'} `
      + `$6,000,000: ${verdict(r.netAssets)}`],
    ['Passively held asset (subsection 152-10(1A) or (1B))', `${r.passive ? 'Yes' : 'No'}, as you answered`],
    ['Active asset test (section 152-35)', `Active for ${days(r.activeDays)} of the ${days(r.testDays)} days from `
      + `${longDate(r.testFrom)} to ${longDate(r.testTo)}, ${r.over15 ? 'against the 7½ years needed for an asset owned more than 15 years'
        : 'against the half needed for an asset owned 15 years or less'}: ${verdict(r.activeAsset)}`],
    ...concessionRows(r, x),
  ];
  return { inputs: inputsOf(x, money), rows, principal: 0,
    note: 'The concessions apply in the order the method statement in subsection 102-5(1) sets: the 15-year exemption, '
      + 'then losses, the CGT discount and the 50% reduction, then the retirement exemption and roll-over in either order '
      + '(section 152-210)' };
}
