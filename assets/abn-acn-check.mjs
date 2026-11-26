// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// ABN and ACN check digits: arithmetic only. Nothing is looked up, and a pass says nothing about
// registration. A port of `check_abn` and `check_acn` in ryanduguid/australian-accounting
// (apps/aus-accounting-mcp/src/identifiers.rs, main 7f3c3eb), checked by parity. Sources, read
// 27 November 2026:
// - ABN Lookup, Format of the ABN (version 9.9.7), https://abr.business.gov.au/Help/AbnFormat: subtract 1
//   from the first digit, weight the 11 digits 10, 1, 3, 5, 7, 9, 11, 13, 15, 17 and 19, and the ABN is
//   valid when the sum divides by 89. A first digit of 0 cannot have 1 taken from it, so it fails.
// - ASIC EDGE Document Messages Specification version 5.10 (1 December 2024), Appendix D, Australian Company
//   Number (ACN) Check Digit: weight digits 1 to 8 by 8 down to 1, and the check digit is 10 less the sum's
//   remainder on division by 10, or 0 when that is 10.

/** @typedef {'abn' | 'acn'} IdentifierKind */
/**
 * @typedef {{ identifier: 'ABN' | 'ACN', result: 'MALFORMED' | 'CHECK_DIGIT_VALID' | 'CHECK_DIGIT_INVALID',
 *   checkDigitValid: boolean, formatted: string | null, reason: string, abrRegistrationEstablished: false,
 *   gstRegistrationEstablished: false, notEstablished: string, sourceUrl: string, sourceProvision: string }} IdentifierCheck
 */

const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
const ACN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 1];

const REGISTERS = new Map([
  ['abn', {
    identifier: /** @type {const} */ ('ABN'), groups: [2, 3, 3, 3],
    passes: (/** @type {number[]} */ d) => d[0] !== 0
      && d.reduce((sum, digit, i) => sum + (i ? digit : digit - 1) * ABN_WEIGHTS[i], 0) % 89 === 0, // eslint-disable-line security/detect-object-injection -- i is an index of the 11 digits
    notEstablished: 'A valid check digit shows only that the digits pass the arithmetic ABN Lookup publishes. It proves neither '
      + 'that the number was issued to anyone or is active, nor that an entity is registered in the Australian Business Register '
      + 'or registered for GST. ABN Lookup (https://abr.business.gov.au) shows an ABN’s status and if and when an entity is '
      + 'registered for GST.',
    sourceUrl: 'https://abr.business.gov.au/Help/AbnFormat',
    sourceProvision: 'ABN Lookup, Format of the ABN: ‘To verify an ABN’ (version 9.9.7)',
  }],
  ['acn', {
    identifier: /** @type {const} */ ('ACN'), groups: [3, 3, 3],
    passes: (/** @type {number[]} */ d) => (10 - (ACN_WEIGHTS.reduce((sum, weight, i) => sum + d[i] * weight, 0) % 10)) % 10 === d[8], // eslint-disable-line security/detect-object-injection -- i is an index of the first 8 digits
    notEstablished: 'A valid check digit shows only that the digits pass the arithmetic ASIC publishes. It proves neither that '
      + 'ASIC issued the number or that a company holding it exists, nor that an entity is registered in the Australian Business '
      + 'Register or registered for GST. Search ASIC’s registers for the company and ABN Lookup (https://abr.business.gov.au) '
      + 'for ABN and GST status.',
    sourceUrl: 'https://download.asic.gov.au/media/vy0ensam/els-document-messages-specification-v5-10.pdf',
    sourceProvision: 'ASIC EDGE Document Messages Specification version 5.10 (1 December 2024), Appendix D, Australian Company '
      + 'Number (ACN) Check Digit',
  }],
]);

/** The identifiers checked, in the order the page offers them. */
export const IDENTIFIER_KINDS = [...REGISTERS.keys()];

/**
 * The digits, or null. Only ASCII spaces are removed: stripping anything else could turn a malformed
 * identifier into a different, valid one.
 * @param {string} value @param {number} length
 */
function digitsOf(value, length) {
  for (const c of value) if (c !== ' ' && (c < '0' || c > '9')) return null;
  const digits = [...value].filter((c) => c !== ' ').map(Number);
  return digits.length === length ? digits : null;
}

/** @param {number[]} digits @param {number[]} groups */
function grouped(digits, groups) {
  let start = 0;
  return groups.map((size) => {
    const part = digits.slice(start, start + size).join('');
    start += size;
    return part;
  }).join(' ');
}

/**
 * Whether an ABN or ACN passes its published check digit test.
 * @param {IdentifierKind} kind @param {string} value @returns {IdentifierCheck}
 */
export function identifierCheck(kind, value) {
  const register = REGISTERS.get(kind);
  if (!register) throw Object.assign(new Error('Choose ABN or ACN.'), { code: 'identifier.kind_invalid' });
  if (typeof value !== 'string') throw Object.assign(new Error('Enter the number to check.'), { code: 'identifier.value_invalid' });
  const { identifier, groups } = register;
  const length = groups.reduce((sum, size) => sum + size, 0);
  const digits = digitsOf(value, length);
  const passes = digits !== null && register.passes(digits);
  let result = /** @type {IdentifierCheck['result']} */ ('MALFORMED');
  let reason = `An ${identifier} is ${length} ASCII digits, optionally separated by spaces.`;
  if (digits && passes) {
    result = 'CHECK_DIGIT_VALID';
    reason = `The digits pass the published ${identifier} check digit test.`;
  } else if (digits) {
    result = 'CHECK_DIGIT_INVALID';
    reason = `The digits fail the published ${identifier} check digit test, so this is not a valid ${identifier} as written. Check it against its source.`;
  }
  return { identifier, result, checkDigitValid: passes, formatted: digits && grouped(digits, groups), reason,
    abrRegistrationEstablished: false, gstRegistrationEstablished: false, notEstablished: register.notEstablished,
    sourceUrl: register.sourceUrl, sourceProvision: register.sourceProvision };
}

const RESULT_TEXT = new Map([['MALFORMED', 'Not in the format'], ['CHECK_DIGIT_VALID', 'Check digit valid'],
  ['CHECK_DIGIT_INVALID', 'Check digit invalid']]);

/** The page's call from its fields. @param {(name: string) => string} value @returns {[IdentifierKind, string]} */
export const identifierFormInput = (value) => [/** @type {IdentifierKind} */ (value('kind')), value('number')];

/** How the page writes the input. @param {IdentifierKind} kind @param {string} value */
export const identifierInputsText = (kind, value) => `${kind.toUpperCase()} ‘${value}’`;

/** The page's result. @param {(name: string) => string} value */
export function identifierCheckResult(value) {
  const [kind, number] = identifierFormInput(value);
  const r = identifierCheck(kind, number);
  const rows = [['Result', `${RESULT_TEXT.get(r.result)}. ${r.reason}`]];
  if (r.formatted) rows.push([`In the register’s format`, r.formatted]);
  rows.push(['What this does not establish', r.notEstablished], ['Source', r.sourceProvision]);
  return { inputs: identifierInputsText(kind, number), rows, principal: 0 };
}
