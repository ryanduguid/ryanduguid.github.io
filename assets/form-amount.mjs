// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// A form's dollar amount as the decimal text a command reads, and a command's amount text in dollars.

import { number } from './money.mjs';

const currency = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

/**
 * A form amount ('$85,000.50' or '85000.5') as plain decimal text, refused in the page's words.
 * @param {string} text @param {string} label what the field holds, as in 'Enter …'
 */
export function formAmount(text, label) {
  const trimmed = text.trim();
  if (trimmed === '') throw Object.assign(new Error(`Enter ${label}, or 0.`), { code: 'input.missing_field' });
  try {
    number(trimmed, { max: 1e12, money: true });
  } catch (error) {
    throw Object.assign(new Error(`For ${label}: ${/** @type {Error} */ (error).message}`), { code: 'input.amount_invalid' });
  }
  return trimmed.replaceAll('$', '').replaceAll(',', '');
}

/** A command's amount text, such as '125000.00', in dollars ('$125,000.00'). @param {string} text */
export const formMoney = (text) => currency.format(Number(text)).replace(/^-/u, '−');
