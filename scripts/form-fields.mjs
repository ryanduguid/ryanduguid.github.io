// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Test helper: the fields a calculator form opens with, as the browser reads them.
import { readFileSync } from 'node:fs';

/** Each input's value (a radio only when checked), each textarea's text and each select's selected
 * or first option, from `_includes/calculators/<page>.html`. @param {string} page */
export const openingFields = (page) => {
  const html = readFileSync(new URL(`../_includes/calculators/${page}.html`, import.meta.url), 'utf8');
  /** @type {Record<string, string>} */
  const fields = {};
  for (const [tag] of html.matchAll(/<input\b[^>]*>/g)) {
    const name = tag.match(/\bname="([^"]+)"/)?.[1];
    if (name && /\btype="radio"/.test(tag) && !/\bchecked\b/.test(tag)) continue;
    if (name) fields[name] = tag.match(/\bvalue="([^"]*)"/)?.[1] ?? '';
  }
  for (const [, name, text] of html.matchAll(/<textarea\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) fields[name] = text;
  for (const [, name, body] of html.matchAll(/<select\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const options = [...body.matchAll(/<option\b([^>]*)>/g)].map(([, attributes]) => attributes);
    fields[name] ??= (options.find((a) => /\bselected\b/.test(a)) ?? options[0])?.match(/\bvalue="([^"]*)"/)?.[1] ?? '';
  }
  return fields;
};

/** A form value reader over the opening fields with `changes`, refusing a name the form lacks.
 * @param {string} page @param {Record<string, string>} [changes] */
export const formReader = (page, changes = {}) => {
  const fields = { ...openingFields(page), ...changes };
  return (/** @type {string} */ name) => {
    if (!Object.hasOwn(fields, name)) throw new Error(`${page} reads ${name}, which its form does not have`);
    return fields[name];
  };
};

/** Money as the pages write it. @param {number} value */
export const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
