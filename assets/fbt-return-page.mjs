// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The FBT return page's forms: how their fields become the engines' inputs, and how the results read.
// The engines are assets/fbt-return.mjs and assets/fbt-instalment.mjs.

import { fbtReturn, ITEM_23 } from './fbt-return.mjs';
import { fbtInstalment } from './fbt-instalment.mjs';

/** The benefit rows the form offers. */
export const FBT_RETURN_ROWS = 6;
const KIND_TEXT = { taxable: 'a taxable employer', rebatable: 'a rebatable employer', public_benevolent_institution: 'a public benevolent institution',
  health_promotion_charity: 'a health promotion charity', public_hospital: 'a public hospital', not_for_profit_hospital: 'a not-for-profit hospital',
  public_ambulance_service: 'a public ambulance service' };
const ITEM_TEXT = [['14A', 'Item 14A, type 1 aggregate grossed up, to the dollar'], ['14B', 'Item 14B, type 2 aggregate grossed up, to the dollar'],
  ['14C', 'Item 14C, aggregate non-exempt amount, to the dollar'], ['15', 'Item 15, fringe benefits taxable amount'], ['16', 'Item 16, tax on the taxable amount at 47%'],
  ['17', 'Item 17, aggregate non-rebatable amount'], ['18', 'Item 18, rebate'], ['19', 'Item 19, amount of tax payable'], ['20', 'Item 20, instalments reported'],
  ['21', 'Item 21, payment due'], ['22', 'Item 22, credit due to you']];

/** @param {(name: string) => string} value */
export function fbtFormInput(value) {
  /** @type {Record<string, unknown>} */
  const input = { year_ended: Number(value('year')) };
  const kind = value('kind');
  if (kind !== 'taxable') input.employer_kind = kind;
  if (kind === 'rebatable') {
    input.rebatable_days = Number(value('rebatable-days'));
    input.employer_days = Number(value('employer-days'));
  }
  if (value('instalments').trim()) input.instalments_reported = value('instalments').trim();
  const benefits = [];
  for (let n = 1; n <= FBT_RETURN_ROWS; n += 1) {
    const field = (/** @type {string} */ name) => value(`b${n}-${name}`).trim();
    if (!field('employee')) continue;
    /** @type {Record<string, unknown>} */
    const b = { employee: field('employee'), label: field('label'), gst_type: field('type'), excluded: field('excluded') === 'yes',
      gross_taxable_value: field('gross'), employee_contribution: field('contribution') || '0', taxable_value: field('taxable') };
    const extra = field('extra');
    if (extra === 'packaged') b.entertainment = 'salary_packaged';
    if (extra === 'not-packaged') b.entertainment = 'not_salary_packaged';
    if (extra === 'ev') Object.assign(b, { electric_car_exempt: true, reportable_taxable_value: field('reportable') });
    benefits.push(b);
  }
  input.benefits = benefits;
  return input;
}

/** How the page writes the return's input. @param {Record<string, any>} x @param {(value: number) => string} aud */
export function fbtInputsText(x, aud) {
  const kind = x.employer_kind ?? 'taxable';
  const head = `FBT year ended 31 March ${x.year_ended}, ${KIND_TEXT[/** @type {'taxable'} */ (kind)]}`
    + `${kind === 'rebatable' ? `, rebatable on ${x.rebatable_days} of ${x.employer_days} days` : ''}`
    + `${x.instalments_reported === undefined ? '' : `, instalments reported ${aud(Number(x.instalments_reported))}`}`;
  const benefits = (x.benefits ?? []).map((/** @type {Record<string, any>} */ b) => `${b.employee} ${b.label} type ${b.gst_type.slice(-1)}`
    + ` ${aud(Number(b.taxable_value))}${b.excluded ? ' excluded' : ''}${b.entertainment === 'salary_packaged' ? ' salary packaged entertainment' : ''}`
    + `${b.electric_car_exempt ? ` exempt electric car, ${aud(Number(b.reportable_taxable_value))} reportable` : ''}`);
  return `${head}; ${benefits.join('; ')}`;
}

/** The return page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function fbtReturnResult(value, aud) {
  const input = fbtFormInput(value);
  const r = fbtReturn(input);
  const a = (/** @type {string} */ text) => aud(Number(text));
  const rows = ITEM_TEXT.filter(([item]) => item in r.labels).map(([item, label]) => [label, a(r.labels[item])]); // eslint-disable-line security/detect-object-injection -- keys come from this module's own constant table
  const principal = rows.findIndex(([label]) => label.startsWith('Item 19'));
  for (const row of r.item23) {
    rows.push([`Item ${row.label}, ${ITEM_23.find(([l]) => l === row.label)?.[1].toLowerCase()}, taxable value`, a(row.taxable)]);
  }
  for (const e of r.employees.filter((x) => Number(x.reportable) > 0)) rows.push([`${e.employee}: reportable fringe benefits amount`, a(e.reportable)]);
  const caps = r.capping;
  for (const e of caps?.employees ?? []) rows.push([`${e.employee}: grossed-up amount over the ${a(caps?.cap ?? '0')} cap`, a(e.over)]);
  const note = r.warnings[0] ?? (r.capping ? 'Benefits each employee receives are capped as FBTAA s 5B(1E) or s 65J(2B) applies; excluded meal entertainment and car parking are disregarded'
    : 'Type 1 benefits are grossed up at 2.0802 and type 2 at 1.8868; a reportable amount appears only above $2,000 of an employee’s benefits that are not excluded');
  return { inputs: fbtInputsText(input, aud), rows, principal, note };
}

/** @param {(name: string) => string} value */
export function fbtInstalmentFormInput(value) {
  /** @type {Record<string, unknown>} */
  const input = { quarter: Number(value('quarter')), year_ended: Number(value('instalment-year')) };
  if (value('vary') === 'no') {
    input.ato_instalment = value('ato-instalment');
    return input;
  }
  Object.assign(input, { estimated_tax: value('estimate'), reason_code: Number(value('reason')) });
  if (input.quarter !== 1) Object.assign(input, { previous_instalments: value('previous') || '0', previous_credits: value('credits') || '0' });
  return input;
}

/** The instalment form's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function fbtInstalmentResult(value, aud) {
  const input = fbtInstalmentFormInput(value);
  const r = fbtInstalment(input);
  const a = (/** @type {unknown} */ text) => aud(Number(text));
  const inputs = `quarter ${r.quarter} of the FBT year ended 31 March ${r.year}, `
    + (r.varied ? `estimate ${a(input.estimated_tax)}, reason code ${input.reason_code}${input.previous_instalments === undefined ? ''
      : `, earlier instalments ${a(input.previous_instalments)} less credits ${a(input.previous_credits)}`}` : `ATO instalment ${a(input.ato_instalment)}`);
  const rows = r.varied
    ? [['Label F2, estimated FBT for the year', a(r.labels.F2)], ['Label F3, varied instalment', a(r.labels.F3)], ['Label 6A, FBT instalment', a(r.labels['6A'])],
      ['Label 6B, credit from varying', a(r.labels['6B'])]]
    : [['Label F1, ATO instalment amount', a(r.labels.F1)], ['Label 6A, FBT instalment', a(r.labels['6A'])]];
  const note = r.varied ? `Estimate times ${r.quarter} quarter${r.quarter === 1 ? '' : 's'} of the year, less earlier instalments net of credits (FBTAA s 111(1))`
    : 'Not varied: 6A is the F1 amount (FBTAA s 104)';
  return { inputs, rows, principal: r.varied ? 2 : 1, note };
}
