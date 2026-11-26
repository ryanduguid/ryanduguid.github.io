// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Finite decimals as the australian-accounting commands work them, after Python's decimal module: a sign, an integer
// coefficient and an exponent, so '33.30' keeps its trailing zero and prints as the command prints it. Sums,
// products and quotients round half even to the context's precision (28 digits unless a command sets 40), and a
// quotient takes the exponent nearest the ideal one when it is exact. Infinities and NaNs are read only so a
// command's 'must be finite' refusal can be given; no arithmetic is done on them.

/** @typedef {{ neg: boolean, coef: bigint, exp: number, special?: 'inf' | 'nan' }} Dec */

const TEN = 10n;
/** @param {number} n */
const pow10 = (n) => TEN ** BigInt(n);
/** @param {bigint} c */
const digits = (c) => (c === 0n ? 1 : c.toString().length);

const DIGITS = /^\d+$/;
const EXPONENT = /^[+-]?\d+$/;

/** True for digits only, or digits, a point and digits: the plain decimals the commands accept. @param {unknown} text */
export function isPlainDecimal(text) {
  const parts = String(text).split('.');
  return parts.length <= 2 && parts.every((p) => DIGITS.test(p));
}

/** A finite decimal's sign, whole and fraction digits and exponent: `[+-]` then `digits[.digits*]` or `.digits`, then an optional `e[+-]digits`.
 * @param {string} t @returns {{ neg: boolean, whole: string, frac: string, exp: number } | null} */
function finiteParts(t) {
  const signed = t[0] === '+' || t[0] === '-';
  const body = signed ? t.slice(1) : t;
  const cut = body.search(/[eE]/);
  const mantissa = cut < 0 ? body : body.slice(0, cut);
  const expText = cut < 0 ? '0' : body.slice(cut + 1);
  if (!EXPONENT.test(expText)) return null;
  const dot = mantissa.indexOf('.');
  const whole = dot < 0 ? mantissa : mantissa.slice(0, dot);
  const frac = dot < 0 ? '' : mantissa.slice(dot + 1);
  const okWhole = DIGITS.test(whole) && (frac === '' || DIGITS.test(frac));
  if (!okWhole && !(whole === '' && dot >= 0 && DIGITS.test(frac))) return null;
  return { neg: t[0] === '-', whole, frac, exp: Number(expText) };
}

/** Python's Decimal(text) for a string, or null where it raises InvalidOperation. @param {string} text @returns {Dec | null} */
export function parse(text) {
  const t = text.trim();
  const m = finiteParts(t);
  if (m) {
    return { neg: m.neg, coef: BigInt(`${m.whole}${m.frac}` || '0'), exp: m.exp - m.frac.length };
  }
  const s = /^([+-]?)(inf|infinity|nan\d*|snan\d*)$/i.exec(t);
  if (s) return { neg: s[1] === '-', coef: 0n, exp: 0, special: /inf/i.test(s[2]) ? 'inf' : 'nan' };
  return null;
}

/** A literal. @param {string} text */
export const d = (text) => /** @type {Dec} */ (parse(text));

/** @param {Dec} x */
export const isFiniteDec = (x) => !x.special;
/** @param {Dec} x */
export const isZero = (x) => !x.special && x.coef === 0n;
/** The exponent of the most significant digit. @param {Dec} x */
export const adjusted = (x) => x.exp + digits(x.coef) - 1;

/** Rounds `coef` by dropping `drop` digits, half even, half up or down. @param {bigint} coef @param {number} drop
 * @param {'half_even' | 'half_up' | 'down'} mode */
function shed(coef, drop, mode) {
  if (drop <= 0) return coef * pow10(-drop);
  const unit = pow10(drop);
  const q = coef / unit;
  const r = coef % unit;
  if (mode === 'down' || r === 0n) return q;
  const twice = 2n * r;
  if (twice > unit || (twice === unit && (mode === 'half_up' || q % 2n === 1n))) return q + 1n;
  return q;
}

/** Rounds to `prec` significant digits, half even. @param {Dec} x @param {number} prec @returns {Dec} */
function fit(x, prec) {
  const n = digits(x.coef);
  if (n <= prec) return x;
  let coef = shed(x.coef, n - prec, 'half_even');
  let exp = x.exp + n - prec;
  if (digits(coef) > prec) {
    coef /= TEN;
    exp += 1;
  }
  return { neg: x.neg, coef, exp };
}

/** The signed coefficient of `x` scaled to exponent `exp`. @param {Dec} x @param {number} exp */
const signedAt = (x, exp) => (x.neg ? -1n : 1n) * x.coef * pow10(x.exp - exp);

/** @param {Dec} a @param {Dec} b @param {number} [prec] @returns {Dec} */
export function add(a, b, prec = 28) {
  const exp = Math.min(a.exp, b.exp);
  const sum = signedAt(a, exp) + signedAt(b, exp);
  const neg = sum === 0n ? a.neg && b.neg : sum < 0n;
  return fit({ neg, coef: sum < 0n ? -sum : sum, exp }, prec);
}

/** @param {Dec} x */
export const negate = (x) => ({ ...x, neg: !x.neg });
/** @param {Dec} a @param {Dec} b @param {number} [prec] */
export const sub = (a, b, prec = 28) => add(a, negate(b), prec);

/** @param {Dec} a @param {Dec} b @param {number} [prec] @returns {Dec} */
export const mul = (a, b, prec = 28) => fit({ neg: a.neg !== b.neg, coef: a.coef * b.coef, exp: a.exp + b.exp }, prec);

/** Python's division: exact results take the exponent nearest the ideal one, others `prec` digits half even.
 * @param {Dec} a @param {Dec} b @param {number} [prec] @returns {Dec} */
export function div(a, b, prec = 28) {
  if (b.coef === 0n) throw new RangeError('division by zero');
  const neg = a.neg !== b.neg;
  const ideal = a.exp - b.exp;
  if (a.coef === 0n) return { neg, coef: 0n, exp: ideal };
  const shift = digits(b.coef) - digits(a.coef) + prec + 1;
  let [num, den] = shift >= 0 ? [a.coef * pow10(shift), b.coef] : [a.coef, b.coef * pow10(-shift)];
  let coef = num / den;
  let exp = ideal - shift;
  if (num % den !== 0n) {
    if (coef % 5n === 0n) coef += 1n;
  } else {
    while (exp < ideal && coef % TEN === 0n) {
      coef /= TEN;
      exp += 1;
    }
  }
  return fit({ neg, coef, exp }, prec);
}

/** To exponent `exp`, rounding as `mode` says. @param {Dec} x @param {number} exp
 * @param {'half_even' | 'half_up' | 'down'} [mode] @returns {Dec} */
export const quantize = (x, exp, mode = 'half_up') => ({ neg: x.neg, coef: shed(x.coef, exp - x.exp, mode), exp });

/** Cents, half up. @param {Dec} x */
export const cents = (x) => quantize(x, -2, 'half_up');

/** -1, 0 or 1. @param {Dec} a @param {Dec} b */
export function cmp(a, b) {
  const diff = sub(a, b, 1000);
  if (diff.coef === 0n) return 0;
  return diff.neg ? -1 : 1;
}

/** Python's str(Decimal). @param {Dec} x */
export function str(x) {
  const sign = x.neg ? '-' : '';
  if (x.special) return `${sign}${x.special === 'inf' ? 'Infinity' : 'NaN'}`;
  const ds = x.coef.toString();
  const adj = x.exp + ds.length - 1;
  if (x.exp <= 0 && adj >= -6) {
    if (x.exp === 0) return sign + ds;
    const point = ds.length + x.exp;
    return point > 0 ? `${sign}${ds.slice(0, point)}.${ds.slice(point)}` : `${sign}0.${'0'.repeat(-point)}${ds}`;
  }
  const lead = ds.length > 1 ? `${ds[0]}.${ds.slice(1)}` : ds;
  return `${sign}${lead}E${adj >= 0 ? '+' : ''}${adj}`;
}

/** Python's format(x, '.2f'): half even to the cent, never exponent notation. @param {Dec} x */
export function fixed2(x) {
  const q = quantize(x, -2, 'half_even');
  const ds = q.coef.toString().padStart(3, '0');
  return `${q.neg ? '-' : ''}${ds.slice(0, -2)}.${ds.slice(-2)}`;
}
