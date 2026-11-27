// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Shares or units held in parcels bought at different times: the `cgt-parcels` command of
// ryanduguid/australian-accounting (main 7f3c3eb) ported line for line (its inputs, matching, rounding
// and refusal codes). Each parcel is a separate CGT asset; a sale is matched to parcels first in,
// first out or as the taxpayer selects (TD 33 para 4; the ATO's 'Keeping records of shares and
// units'). ITAA 1997 compilation 264 (21 May 2026): s 104-10 (CGT event A1), ss 110-25 and 110-55
// (cost base and reduced cost base), ss 112-30 and 116-40 (the part attributable to units),
// s 115-25(1) (12 months, neither day counted), s 115-100 (the discount) and s 102-5(1) steps 1 to 3
// and 5. Read on the Federal Register of Legislation on 27 November 2026. Amounts are whole cents;
// a share of a parcel or a sale rounds half up to the cent, and only the discount of a complying
// superannuation entity leaves a fraction of a cent, which the result rounds half up once.

export const PARCEL_YEARS = ['2025-26', '2026-27'];
const FIELDS = ['entity', 'identification', 'parcels', 'disposals', 'other_discount_capital_gains', 'other_capital_gains',
  'other_capital_losses', 'prior_net_capital_losses', 'year', 'scope_confirmed'];
const OTHERS = FIELDS.slice(4, 8);
/** The discount as [numerator, denominator] (s 115-100); a company makes no discount capital gain (s 115-10). */
const ENTITIES = new Map([['individual', [1n, 2n]], ['trust', [1n, 2n]], ['complying_superannuation_entity', [1n, 3n]],
  ['company', [0n, 1n]]]);
const MOST = 1000;
const DAY = 86400000;
/** The last day a parcel's cost base can be indexed (ss 114-1 and 114-10). */
const INDEXATION_LAST_DAY = Date.UTC(1999, 8, 21) / DAY;
const UNIT = 1000000n;
const CAP = 10n ** 12n;

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}
/** @param {string} message @returns {never} */
const conflict = (message) => refuse('cgt_parcels.fact_conflict', message);

/** A decimal string as the command reads one (surrounding spaces, then digits with an optional minus sign
 * and decimal part, no exponent): its sign, coefficient and exponent; an infinity or NaN as not finite; else null.
 * @param {unknown} value @returns {{ sign: boolean, coefficient: bigint, exponent: number, finite: boolean } | null} */
export function decimalOf(value) {
  if (typeof value !== 'string' || value.length > 8192) return null;
  const text = value.trim();
  if (/^[+-]?(?:inf(?:inity)?|s?nan\d*)$/i.test(text)) return { sign: false, coefficient: 0n, exponent: 0, finite: false };
  const negative = text.startsWith('-');
  const [whole, fraction = '', ...extra] = (negative ? text.slice(1) : text).split('.');
  const digits = (/** @type {string} */ part) => part.length > 0 && [...part].every((c) => c >= '0' && c <= '9');
  if (extra.length > 0 || !digits(whole) || (text.includes('.') && !digits(fraction))) return null;
  return { sign: negative, coefficient: BigInt(whole + fraction), exponent: -fraction.length, finite: true };
}

/** A decimal scaled to whole 10^-places when its exponent is at least -places, or null.
 * @param {ReturnType<typeof decimalOf>} d @param {number} places */
function scaledTo(d, places) {
  if (!d || !d.finite || d.exponent < -places) return null;
  const value = d.coefficient * 10n ** BigInt(d.exponent + places);
  return d.sign && value !== 0n ? -value : value;
}

/** An amount in cents: finite, from 0 to 1e12, at most 2dp, or null. @param {unknown} value */
function moneyOf(value) {
  const cents = scaledTo(decimalOf(value), 2);
  return cents === null || cents < 0n || cents > CAP * 100n ? null : cents;
}

/** A day number from a YYYY-MM-DD date from 1900 to 2100, or null. @param {unknown} text */
export function dayOf(text) {
  const m = typeof text === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(text) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  return real && y >= 1900 && y <= 2100 ? date.getTime() / DAY : null;
}
/** @param {number} day */
const dateText = (day) => new Date(day * DAY).toISOString().slice(0, 10);
/** The day `months` later, on the month's last day where it is shorter. @param {number} day @param {number} months */
function addMonths(day, months) {
  const d = new Date(day * DAY);
  const target = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(d.getUTCFullYear(), target + 1, 0)).getUTCDate();
  return Date.UTC(d.getUTCFullYear(), target, Math.min(d.getUTCDate(), last)) / DAY;
}
/** The first event day 12 months after acquisition, neither day counted (s 115-25(1)). @param {number} acquired */
function discountFrom(acquired) {
  const start = acquired + 1;
  const end = addMonths(start, 12);
  return new Date(end * DAY).getUTCDate() === new Date(start * DAY).getUTCDate() ? end : end + 1;
}
/** @param {number} day */
function incomeYear(day) {
  const d = new Date(day * DAY);
  const y = d.getUTCMonth() < 6 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

/** Cents as the command prints them. @param {bigint} c */
const centsText = (c) => `${c < 0n ? '-' : ''}${(c < 0n ? -c : c) / 100n}.${String((c < 0n ? -c : c) % 100n).padStart(2, '0')}`;
/** Units (scaled 1e6) with the places the command keeps. @param {{ v: bigint, places: number }} u */
function unitsText(u) {
  const whole = u.v / UNIT;
  if (u.places === 0) return String(whole);
  return `${whole}.${String(u.v % UNIT).padStart(6, '0').slice(0, u.places)}`;
}
/** A share of `amount` for `part` of `whole` units, half up to the cent. @param {bigint} amount @param {bigint} part @param {bigint} whole */
const share = (amount, part, whole) => (2n * amount * part + whole) / (2n * whole);

/** One object's facts, each read once, then none left over. */
class Facts {
  /** @param {string} what @param {Record<string, unknown>} fields */
  constructor(what, fields) {
    this.what = what;
    this.fields = new Map(Object.entries(fields));
    /** @type {Set<string>} */
    this.taken = new Set();
  }

  /** @param {string} key @param {string} expected @returns {never} */
  invalid(key, expected) {
    return refuse('cgt_parcels.fact_invalid', `${this.what}: ${key} must be ${expected}.`);
  }

  /** @param {string} key */
  required(key) {
    if (!this.fields.has(key)) refuse('cgt_parcels.fact_missing', `${this.what}: ${key} is required.`);
    this.taken.add(key);
    return this.fields.get(key);
  }

  /** @param {string} key */
  text(key) {
    const value = this.required(key);
    return typeof value === 'string' && value.trim() !== '' ? value : this.invalid(key, 'a non-empty string');
  }

  /** @param {string} key */
  date(key) {
    return dayOf(this.required(key)) ?? this.invalid(key, 'a YYYY-MM-DD date from 1900 to 2100');
  }

  /** @param {string} key @param {boolean} optional */
  amount(key, optional) {
    this.taken.add(key);
    if (optional && !this.fields.has(key)) return 0n;
    return moneyOf(this.required(key)) ?? this.invalid(key, 'a finite non-negative decimal string, at most 2dp and 1e12');
  }

  /** @param {string} key */
  units(key) {
    const d = decimalOf(this.required(key));
    const v = scaledTo(d, 6);
    if (!d || v === null || v <= 0n || v > CAP * UNIT) this.invalid(key, 'a decimal string above 0, at most 6dp and 1e12');
    return { v: /** @type {bigint} */ (v), places: Math.max(0, -d.exponent) };
  }

  noneLeft() {
    const key = [...this.fields.keys()].find((k) => !this.taken.has(k));
    if (key !== undefined) refuse('input.field_unknown', `${this.what}: ${key} is not a fact it takes beside its other facts.`);
  }
}

/** @param {unknown} value @param {string} name @returns {Record<string, unknown>[]} */
function objects(value, name) {
  const bad = () => refuse('cgt_parcels.list_invalid', `${name} must be a list of 1 to ${MOST} objects.`);
  if (!Array.isArray(value) || value.length === 0 || value.length > MOST) bad();
  const list = /** @type {unknown[]} */ (value);
  if (!list.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v))) bad();
  return /** @type {Record<string, unknown>[]} */ (list);
}

/** @typedef {{ v: bigint, places: number }} Units */
/** @typedef {{ id: string, security: string, acquired: number, units: Units, base: bigint, owning: bigint }} Parcel */
/** @typedef {{ parcel: string, units: Units }} Pick */
/** @typedef {{ n: number, security: string, date: number, units: Units, proceeds: bigint, selling: bigint,
 *   picks: Pick[] | null }} Disposal */

/** The item at an index known to be in range. @template T @param {T[]} list @param {number} i @returns {T} */
const nth = (list, i) => /** @type {T} */ (list.at(i));

/** @param {number} n @param {Record<string, unknown>} fields @returns {Parcel} */
function readParcel(n, fields) {
  const f = new Facts(`parcel ${n}`, fields);
  const id = f.text('parcel');
  const security = f.text('security');
  const acquired = f.date('acquired');
  const units = f.units('units');
  let base = f.amount('acquisition_cost', false) + f.amount('incidental_costs', false);
  const owning = f.amount('ownership_costs', true);
  base += f.amount('capital_expenditure', true) + f.amount('title_costs', true);
  f.noneLeft();
  return { id, security, acquired, units, base, owning };
}

/** @param {Facts} f @returns {Pick[]} */
function readPicks(f) {
  const bad = () => refuse('cgt_parcels.fact_invalid', `${f.what}: parcels must be a non-empty list of objects, each with parcel and units.`);
  const list = f.required('parcels');
  if (!Array.isArray(list) || list.length === 0) bad();
  /** @type {Pick[]} */
  const picks = [];
  for (const [i, value] of /** @type {unknown[]} */ (list).entries()) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) bad();
    const pick = new Facts(`${f.what}, selected parcel ${i + 1}`, /** @type {Record<string, unknown>} */ (value));
    const parcel = pick.text('parcel');
    const units = pick.units('units');
    pick.noneLeft();
    if (picks.some((p) => p.parcel === parcel)) conflict(`${f.what}: parcel ${parcel} is selected twice.`);
    picks.push({ parcel, units });
  }
  return picks;
}

/** @param {number} n @param {Record<string, unknown>} fields @param {boolean} selected @returns {Disposal} */
function readDisposal(n, fields, selected) {
  const f = new Facts(`disposal ${n}`, fields);
  const security = f.text('security');
  const date = f.date('date');
  const units = f.units('units');
  const proceeds = f.amount('capital_proceeds', false);
  const selling = f.amount('incidental_costs', false);
  const picks = selected ? readPicks(f) : null;
  f.noneLeft();
  return { n, security, date, units, proceeds, selling, picks };
}

/** The command's own checks before its worksheet: unknown fields, then missing ones, then the amounts' text.
 * @param {Record<string, unknown>} input */
function checkedInput(input) {
  const extra = Object.keys(input).find((key) => !FIELDS.includes(key));
  if (extra !== undefined) refuse('input.field_unknown', `${extra} is not an input of cgt-parcels`);
  const missing = FIELDS.find((key) => !Object.hasOwn(input, key));
  if (missing !== undefined) refuse('input.missing_field', `${missing} is required`);
  const values = new Map(Object.entries(input));
  for (const key of OTHERS) {
    const value = values.get(key);
    if (typeof value === 'string' && decimalOf(value) === null) {
      refuse(value.length > 8192 ? 'input.decimal_too_long' : 'input.decimal_unreadable', `${key}: not a decimal`);
    }
  }
  return values;
}

/** The year, entity, identification and other amounts, as the command checks them.
 * @param {Map<string, unknown>} values */
function settings(values) {
  if (values.get('scope_confirmed') !== true) refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  const year = values.get('year');
  if (typeof year !== 'string' || !PARCEL_YEARS.includes(year)) {
    refuse('period.unsupported', `Unsupported period; supported: ${PARCEL_YEARS.join(', ')}.`);
  }
  const fraction = ENTITIES.get(/** @type {string} */ (values.get('entity')));
  if (!fraction) refuse('cgt_parcels.entity_invalid', 'entity must be individual, trust, complying_superannuation_entity or company.');
  const identification = values.get('identification');
  if (identification !== 'first_in_first_out' && identification !== 'selected') {
    refuse('cgt_parcels.identification_invalid', 'identification must be first_in_first_out or selected.');
  }
  const others = OTHERS.map((key) => moneyOf(values.get(key))
    ?? refuse('input.amount_invalid', 'Amounts must be finite non-negative Decimals, at most 2dp and 1e12.'));
  const company = values.get('entity') === 'company';
  if (company && others[0] !== 0n) {
    conflict('other_discount_capital_gains must be 0.00 for a company, which makes no discount capital gain (ITAA 1997 s 115-10).');
  }
  const first = Date.UTC(Number(year.slice(0, 4)), 6, 1) / DAY;
  return { year, fraction, company, selected: identification === 'selected', others, first, last: addMonths(first, 12) - 1 };
}

/** @param {Map<string, unknown>} values @param {ReturnType<typeof settings>} s */
function readLists(values, s) {
  const parcels = objects(values.get('parcels'), 'parcels').map((fields, i) => readParcel(i + 1, fields));
  parcels.forEach((parcel, i) => {
    if (parcels.slice(0, i).some((p) => p.id === parcel.id)) conflict(`parcel ${i + 1}: the name ${parcel.id} is used twice.`);
    if (parcel.acquired > s.last) conflict(`parcel ${i + 1}: it was acquired after the ${s.year} income year ended.`);
  });
  const disposals = objects(values.get('disposals'), 'disposals').map((fields, i) => readDisposal(i + 1, fields, s.selected));
  const late = disposals.find((d) => d.date > s.last);
  if (late) conflict(`disposal ${late.n}: its contract is after the ${s.year} income year ended (s 104-10(3)).`);
  return { parcels, disposals };
}

/** @param {Units} a @param {Units} b */
const unitsLess = (a, b) => ({ v: a.v - b.v, places: Math.max(a.places, b.places) });

/** The units of each parcel the taxpayer selected for a disposal.
 * @param {Parcel[]} parcels @param {Disposal} disposal @param {{ units: Units }[]} held @returns {[number, Units][]} */
function selectedTakes(parcels, disposal, held) {
  const what = `disposal ${disposal.n}`;
  /** @type {[number, Units][]} */
  const takes = [];
  let total = 0n;
  for (const pick of /** @type {Pick[]} */ (disposal.picks)) {
    const i = parcels.findIndex((p) => p.id === pick.parcel);
    if (i < 0) conflict(`${what}: no parcel is named ${pick.parcel}.`);
    const parcel = nth(parcels, i);
    if (parcel.security !== disposal.security) conflict(`${what}: parcel ${parcel.id} is of ${parcel.security}, not ${disposal.security}.`);
    if (parcel.acquired > disposal.date) conflict(`${what}: parcel ${parcel.id} was acquired after the disposal.`);
    if (pick.units.v > nth(held, i).units.v) {
      refuse('cgt_parcels.units_not_held', `${what}: parcel ${parcel.id} has ${unitsText(nth(held, i).units)} units left, fewer than the ${unitsText(pick.units)} selected.`);
    }
    total += pick.units.v;
    takes.push([i, pick.units]);
  }
  if (total !== disposal.units.v) conflict(`${what}: the selected parcels' units do not add up to the ${unitsText(disposal.units)} disposed of.`);
  return takes;
}

/** The units the earliest acquired parcels of the security still held give a disposal.
 * @param {Parcel[]} parcels @param {Disposal} disposal @param {number[]} order @param {{ units: Units }[]} held */
function firstInTakes(parcels, disposal, order, held) {
  let wanted = disposal.units;
  /** @type {[number, Units][]} */
  const takes = [];
  for (const i of order) {
    const parcel = nth(parcels, i);
    const left = nth(held, i).units;
    if (wanted.v === 0n || parcel.acquired > disposal.date) break;
    if (parcel.security === disposal.security && left.v !== 0n) {
      const units = left.v < wanted.v ? left : wanted;
      wanted = unitsLess(wanted, units);
      takes.push(/** @type {[number, Units]} */ ([i, units]));
    }
  }
  if (wanted.v !== 0n) {
    refuse('cgt_parcels.units_not_held', `disposal ${disposal.n}: ${unitsText(disposal.units)} units of ${disposal.security} are disposed of, `
      + `${unitsText(wanted)} more than the parcels acquired by then still hold.`);
  }
  return takes;
}

/** Take `units` of what is left, or all of it for the last units, so the shares add to the whole.
 * @param {{ units: Units, amounts: bigint[] }} left @param {Units} units */
function take(left, units) {
  const all = units.v === left.units.v;
  const taken = left.amounts.map((amount) => (all ? amount : share(amount, units.v, left.units.v)));
  left.amounts = left.amounts.map((amount, k) => amount - nth(taken, k));
  left.units = unitsLess(left.units, units);
  return taken;
}

/** @param {ReturnType<typeof settings>} s @param {Parcel} parcel @param {Disposal} disposal @param {Units} units
 * @param {bigint[]} cost @param {bigint[]} sale */
function piece(s, parcel, disposal, units, cost, sale) {
  const [base, owning] = cost;
  const [proceeds, selling] = sale;
  const reduced = base + selling;
  const costBase = reduced + owning;
  const counted = disposal.date >= s.first && disposal.date <= s.last;
  if (counted && parcel.acquired <= INDEXATION_LAST_DAY) {
    refuse('cgt_parcels.indexation_or_pre_cgt', `parcel ${parcel.id} was acquired on ${dateText(parcel.acquired)}, at or before 21 September 1999: `
      + 'its cost base can be indexed (ITAA 1997 ss 114-1 and 114-10), or it is a pre-CGT asset whose gain or loss is disregarded '
      + '(s 104-10(5)(a)), and this worksheet does not work either.');
  }
  const gain = proceeds - costBase;
  const loss = reduced - proceeds;
  return { disposal: disposal.n, parcel, date: disposal.date, units, proceeds, costBase, reduced, counted,
    gain: gain > 0n ? gain : 0n, loss: loss > 0n ? loss : 0n, discount: !s.company && disposal.date >= discountFrom(parcel.acquired) };
}

/** @typedef {ReturnType<typeof piece>} Piece */

/** Each disposal in date order takes its parcels' units. @param {ReturnType<typeof settings>} s
 * @param {Parcel[]} parcels @param {Disposal[]} disposals */
function matchDisposals(s, parcels, disposals) {
  const held = parcels.map((p) => ({ units: p.units, amounts: [p.base, p.owning] }));
  const order = parcels.map((_, i) => i).sort((a, b) => nth(parcels, a).acquired - nth(parcels, b).acquired || a - b);
  const sorted = [...disposals].sort((a, b) => a.date - b.date || a.n - b.n);
  /** @type {Piece[]} */
  const pieces = [];
  for (const disposal of sorted) {
    const takes = disposal.picks ? selectedTakes(parcels, disposal, held) : firstInTakes(parcels, disposal, order, held);
    const sale = { units: disposal.units, amounts: [disposal.proceeds, disposal.selling] };
    for (const [i, units] of takes) {
      const cost = take(nth(held, i), units);
      pieces.push(piece(s, nth(parcels, i), disposal, units, cost, take(sale, units)));
    }
  }
  return { pieces, held };
}

/** @param {bigint} a @param {bigint} b */
const min = (a, b) => (b < a ? b : a);
/** A rational (numerator over d) as cents, half up; negative values round away from zero at the half.
 * @param {bigint} n @param {bigint} d */
function rounded(n, d) {
  const q = (2n * (n < 0n ? -n : n) + d) / (2n * d);
  return n < 0n ? -q : q;
}

/** The steps' amounts (s 102-5(1) steps 1 to 3 and 5). @param {Piece[]} pieces @param {bigint[]} others
 * @param {bigint[]} fraction */
function amountsOf(pieces, others, fraction) {
  const counted = pieces.filter((p) => p.counted);
  const sum = (/** @type {bigint[]} */ values) => values.reduce((a, b) => a + b, 0n);
  const parcelDiscount = sum(counted.filter((p) => p.discount).map((p) => p.gain));
  const parcelOther = sum(counted.filter((p) => !p.discount).map((p) => p.gain));
  const parcelLosses = sum(counted.map((p) => p.loss));
  const [otherDiscount, otherGains, otherLosses, prior] = others;
  const dg = parcelDiscount + otherDiscount;
  const og = parcelOther + otherGains;
  const cl = parcelLosses + otherLosses;
  const lo = min(og, cl);
  const ld = min(dg, cl - lo);
  const po = min(og - lo, prior);
  const pd = min(dg - ld, prior - po);
  const [numerator, denominator] = fraction;
  const left = (dg - ld - pd) * numerator;
  const netLoss = cl - lo - ld;
  return { parcel_discount_gains: parcelDiscount, parcel_other_gains: parcelOther, parcel_losses: parcelLosses,
    discount_gains: dg, other_gains: og, total_capital_gains: dg + og, capital_losses: cl,
    losses_applied_to_other_gains: lo, losses_applied_to_discount_gains: ld, prior_losses_applied_to_other_gains: po,
    prior_losses_applied_to_discount_gains: pd, discount: rounded(left, denominator),
    net_capital_gain: rounded((og - lo - po + dg - ld - pd) * denominator - left, denominator), net_capital_loss: netLoss,
    net_capital_losses_carried_forward: netLoss + prior - po - pd };
}

const DISCOUNT = 'discount capital gain: acquired at least 12 months before the event, not counting either day (ITAA 1997 s 115-25(1))';
const NO_DISCOUNT = "not a discount capital gain: a company's (s 115-10), or acquired less than 12 months before the event (s 115-25(1))";

/** @param {Piece} p */
const matchRow = (p) => ({ disposal: p.disposal, parcel: p.parcel.id, security: p.parcel.security, acquired: dateText(p.parcel.acquired),
  date: dateText(p.date), income_year: incomeYear(p.date), counted: p.counted, units: unitsText(p.units),
  capital_proceeds: centsText(p.proceeds), cost_base: centsText(p.costBase), reduced_cost_base: centsText(p.reduced),
  capital_gain: centsText(p.gain), capital_loss: centsText(p.loss),
  discount: p.gain === 0n ? null : (p.discount ? DISCOUNT : NO_DISCOUNT)
});

/**
 * @typedef {{ period: string, amounts: Record<string, string>, rates: Record<string, string>,
 *   matches: ReturnType<typeof matchRow>[], holdings: Record<string, string>[] }} CgtParcelsResult
 */

/** The `cgt-parcels` command on its JSON input. @param {unknown} input @returns {CgtParcelsResult} */
export function cgtParcels(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) refuse('input.not_object', 'input must be a JSON object');
  const values = checkedInput(/** @type {Record<string, unknown>} */ (input));
  const s = settings(values);
  const { parcels, disposals } = readLists(values, s);
  const { pieces, held } = matchDisposals(s, parcels, disposals);
  const amounts = Object.fromEntries(Object.entries(amountsOf(pieces, s.others, s.fraction)).map(([k, v]) => [k, centsText(v)]));
  const holdings = parcels.flatMap((p, i) => {
    const left = nth(held, i);
    return left.units.v === 0n ? [] : [{ parcel: p.id, security: p.security, acquired: dateText(p.acquired),
      units: unitsText(left.units), cost_base: centsText(left.amounts[0] + left.amounts[1]), reduced_cost_base: centsText(left.amounts[0]) }];
  });
  return { period: s.year, amounts, rates: { discount_numerator: String(s.fraction[0]), discount_denominator: String(s.fraction[1]) },
    matches: pieces.map(matchRow), holdings };
}
