// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Test helper: the fields a calculator form opens with, as the browser reads them.

/** Each input's value (a radio only when checked), each textarea's text and each select's selected
 * or first option, from the text of an `_includes/calculators/` form. @param {string} form */
export const openingFields = (form) => {
  /** @type {Map<string, string>} */
  const fields = new Map();
  for (const [tag] of form.matchAll(/<input\b[^>]*>/g)) {
    const name = tag.match(/\bname="([^"]+)"/)?.[1];
    if (name && /\btype="radio"/.test(tag) && !/\bchecked\b/.test(tag)) continue;
    if (name) fields.set(name, tag.match(/\bvalue="([^"]*)"/)?.[1] ?? '');
  }
  for (const [, name, text] of form.matchAll(/<textarea\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) fields.set(name, text);
  for (const [, name, body] of form.matchAll(/<select\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    if (fields.has(name)) continue;
    const options = [...body.matchAll(/<option\b([^>]*)>/g)].map(([, attributes]) => attributes);
    fields.set(name, (options.find((a) => /\bselected\b/.test(a)) ?? options[0])?.match(/\bvalue="([^"]*)"/)?.[1] ?? '');
  }
  return fields;
};

/** A form value reader over the opening fields with `changes`, refusing a name the form lacks.
 * @param {string} form @param {Record<string, string>} [changes] */
export const formReader = (form, changes = {}) => {
  const fields = new Map([...openingFields(form), ...Object.entries(changes)]);
  return (/** @type {string} */ name) => {
    if (!fields.has(name)) throw new Error(`The form has no field named ${name}`);
    return /** @type {string} */ (fields.get(name));
  };
};

/** Money as the pages write it. @param {number} value */
export const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
