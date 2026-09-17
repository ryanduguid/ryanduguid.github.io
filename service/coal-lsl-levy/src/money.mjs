// Exact money handling at the HTTP boundary.
//
// Requests carry money as decimal strings ("6000.00"). They are parsed
// digit by digit into integer cents, never through a binary float, so
// "0.29" arrives as 29 cents and not as 28.999999999999996. Responses
// render integer cents, quarter cents and levy fractions back to decimal
// strings by exact integer division.

import { MAX_WAGES_CENTS } from '../../../assets/levy.mjs';

export class MoneyError extends Error {
  constructor(field, code, message) {
    super(message);
    this.field = field;
    this.code = code;
  }
}

// Up to 13 whole-dollar digits, at most 2 decimal places, no sign, no
// exponent, no thousands separators. MAX_WAGES_CENTS is about 8.3e13 cents,
// so 13 digits of dollars can exceed it and the bound below still matters.
const MONEY = /^(0|[1-9][0-9]{0,12})(?:\.([0-9]{1,2}))?$/;

export function parseMoney(text, field) {
  if (typeof text !== 'string') {
    throw new MoneyError(field, 'not_a_decimal_string',
      `${field} must be a decimal string such as "1234.56", not ${text === null ? 'null' : typeof text}.`);
  }
  const match = MONEY.exec(text);
  if (!match) {
    if (/^-/.test(text)) {
      throw new MoneyError(field, 'negative_amount', `${field} must not be negative.`);
    }
    if (/^[0-9]+\.[0-9]{3,}$/.test(text)) {
      throw new MoneyError(field, 'unsupported_precision',
        `${field} carries more than 2 decimal places; amounts are whole cents.`);
    }
    throw new MoneyError(field, 'not_a_decimal_string',
      `${field} must be a decimal string such as "1234.56".`);
  }
  const whole = Number(match[1]);
  const fraction = match[2] === undefined ? 0 : Number(match[2].padEnd(2, '0'));
  const cents = whole * 100 + fraction;
  if (!Number.isSafeInteger(cents) || cents > MAX_WAGES_CENTS) {
    throw new MoneyError(field, 'amount_out_of_range',
      `${field} exceeds the largest amount this calculator handles exactly.`);
  }
  return cents;
}

// Integer cents to "1234.56".
export function centsToString(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError('centsToString needs a non-negative safe integer');
  }
  const text = String(cents).padStart(3, '0');
  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

// Exact terminating decimal for numerator / denominator, both BigInt, with
// at most `maxScale` fractional digits and trailing zeros removed beyond
// `minScale`. Throws if the fraction does not terminate within maxScale,
// which cannot happen for the denominators this service uses (powers of 2
// and 5 only).
export function exactDecimal(numerator, denominator, { minScale = 2, maxScale = 12 } = {}) {
  if (typeof numerator !== 'bigint' || typeof denominator !== 'bigint' || denominator <= 0n || numerator < 0n) {
    throw new RangeError('exactDecimal needs non-negative BigInt numerator and positive BigInt denominator');
  }
  let whole = numerator / denominator;
  let remainder = numerator % denominator;
  let digits = '';
  while (remainder !== 0n && digits.length < maxScale) {
    remainder *= 10n;
    digits += String(remainder / denominator);
    remainder %= denominator;
  }
  if (remainder !== 0n) {
    throw new RangeError('exactDecimal: fraction does not terminate within the allowed scale');
  }
  while (digits.length > minScale && digits.endsWith('0')) digits = digits.slice(0, -1);
  digits = digits.padEnd(minScale, '0');
  return digits ? `${whole}.${digits}` : String(whole);
}

// Eligible wages arrive from the engine as a Number of cents that may carry
// quarter cents (Formula B is three quarters of an aggregate). Convert to an
// exact BigInt count of quarter cents. The engine guarantees the value is a
// multiple of 0.25 within the safe range, and this asserts it.
export function toQuarterCents(cents) {
  const quarters = cents * 4;
  if (!Number.isSafeInteger(quarters)) {
    throw new RangeError('eligible wages are not an exact multiple of a quarter cent');
  }
  return BigInt(quarters);
}

// Quarter cents to a dollar string with as many decimals as needed (2 to 4).
export function quarterCentsToString(quarters) {
  return exactDecimal(quarters, 400n, { minScale: 2, maxScale: 4 });
}
