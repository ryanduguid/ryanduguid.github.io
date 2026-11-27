// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for the ABN and ACN check digit checker. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

/** @param {ToolKit} kit @param {Pick<BusinessCalculators, 'identifierCheck' | 'IDENTIFIER_KINDS'>} calculate */
export function identifierCheckTool(kit, calculate) {
  const { tool, text, choice, record, CALCULATORS } = kit;
  return tool({
    name: 'check_abn_acn_check_digit',
    title: 'ABN and ACN check digit checker',
    description: 'Whether one Australian Business Number (11 digits, ABN Lookup\'s modulus 89 test) or Australian Company Number '
      + '(9 digits, ASIC\'s modified modulus 10 test) passes its published check digit test: CHECK_DIGIT_VALID, '
      + 'CHECK_DIGIT_INVALID or MALFORMED, with the number grouped as its register writes it. Arithmetic only, run on the '
      + 'page: it calls no register, and a valid check digit does not establish that the number was issued, is active or '
      + 'is registered for GST (abrRegistrationEstablished and gstRegistrationEstablished are always false). No amounts in AUD.',
    inputSchema: record({
      identifier: choice([...calculate.IDENTIFIER_KINDS], '"abn" or "acn".'),
      number: text('identifier', 'The number, ASCII digits optionally separated by spaces, at most 40 characters.'),
    }, ['identifier', 'number']),
    run({ identifier, number }) {
      return { ...calculate.identifierCheck(identifier, number), source: `${CALCULATORS}abn-acn-check/` };
    },
  });
}
