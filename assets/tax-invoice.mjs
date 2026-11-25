// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// A tax invoice, or a recipient created tax invoice, from stated supplier, recipient and line details,
// checked against section 29-70(1) of the GST Act. Nothing is stored or sent. Read 26 November 2026:
// - A New Tax System (Goods and Services Tax) Act 1999, Compilation No. 96 (1 January 2026), ss 9-70,
//   9-75 (GST is 10% of the value, the price less one-eleventh) and 29-70(1) (the requirements).
// - The ATO's 'Tax invoices' (last updated 18 September 2026): the 7 details, the $1,000 rule, taxable
//   and non-taxable sales, the rounding rules and recipient created tax invoices (RCTIs).
// - GSTR 2013/1, paragraphs 17 to 38: headings, identity, price per line, the extent each supply is taxable.
// - Recipient Created Tax Invoice Determination 2023 (F2023L00785), sections 6 to 8.
// The ABN check digit is ABN Lookup's published test ('Format of the ABN'), as `validate_abn` in
// ryanduguid/australian-accounting (apps/aus-accounting-mcp/src/identifiers.rs) applies it.

import { number, ratioCents } from './money.mjs';

const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
/** The total price (cents) from which the recipient's identity or ABN is required: s 29-70(1)(c)(ii). */
const RECIPIENT_THRESHOLD = 100000n;
export const MAX_LINES = 20;
export const TREATMENTS = /** @type {const} */ (['taxable', 'gst-free', 'input-taxed']);
const TREATMENT_WORDS = { taxable: 'Taxable', 'gst-free': 'GST-free', 'input-taxed': 'Input taxed' };
const RULE_WORDS = { invoice: 'total invoice rule', supply: 'taxable supply rule' };

/**
 * @typedef {{ description: string, quantity: string, unit_price: string, treatment: string }} TaxInvoiceLineInput
 * @typedef {{ issuer: string, supplier_name: string, supplier_abn: string, supplier_address?: string,
 *   recipient_name?: string, recipient_abn?: string, recipient_address?: string, invoice_number?: string, issued: string,
 *   prices: string, rounding: string, rcti_conditions_met?: boolean, lines: TaxInvoiceLineInput[] }} TaxInvoiceInput
 * @typedef {{ description: string, quantity: string, unitPrice: number, amount: number, treatment: string,
 *   gst: number | null, marked: boolean }} TaxInvoiceLine
 */

/**
 * ABN Lookup's check digit test: subtract 1 from the first digit, weight the 11 digits 10, 1, 3, 5, ..., 19,
 * and the ABN is valid if the sum divides by 89. Only ASCII spaces are removed: removing anything else could
 * turn a malformed number into a different, valid one. A leading zero fails, as 1 cannot be subtracted from it.
 * @param {string} value
 * @returns {{ result: 'MALFORMED' | 'CHECK_DIGIT_VALID' | 'CHECK_DIGIT_INVALID', formatted: string | null }}
 */
export function abnCheck(value) {
  if (!/^[0-9 ]*$/.test(value)) return { result: 'MALFORMED', formatted: null };
  const digits = [...value.replaceAll(' ', '')].map(Number);
  if (digits.length !== 11) return { result: 'MALFORMED', formatted: null };
  const formatted = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 8), digits.slice(8)].map((part) => part.join('')).join(' ');
  const total = digits.reduce((sum, digit, i) => sum + (i === 0 ? digit - 1 : digit) * ABN_WEIGHTS[i], 0); // eslint-disable-line security/detect-object-injection -- i indexes the 11 weights
  return { result: digits[0] !== 0 && total % 89 === 0 ? 'CHECK_DIGIT_VALID' : 'CHECK_DIGIT_INVALID', formatted };
}

/** Text a person typed, with surrounding space removed, up to `max` characters. @param {unknown} value @param {string} what @param {number} max */
function words(value, what, max) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > max) throw new Error(`Keep ${what} to ${max} characters.`);
  return text;
}

const dateFormat = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
/** @param {string} iso */
export const invoiceDate = (iso) => dateFormat.format(new Date(`${iso}T00:00:00Z`));
const money = (/** @type {bigint} */ value) => Number(value) / 100;

/**
 * The invoice's figures, wording and checks. A detail section 29-70(1) needs and the input lacks is refused,
 * every such detail named at once.
 * @param {TaxInvoiceInput} x
 */
export function taxInvoice(x) {
  if (!['supplier', 'recipient'].includes(x.issuer)) throw new Error('Choose who issues the invoice.');
  if (!['inclusive', 'exclusive'].includes(x.prices)) throw new Error('Choose whether prices include GST.');
  if (!['invoice', 'supply'].includes(x.rounding)) throw new Error('Choose a rounding rule.');
  const rcti = x.issuer === 'recipient';
  const inclusive = x.prices === 'inclusive';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.issued ?? '') || Number.isNaN(Date.parse(`${x.issued}T00:00:00Z`))
    || new Date(`${x.issued}T00:00:00Z`).toISOString().slice(0, 10) !== x.issued) throw new Error('Enter the date the invoice is issued.');
  if (x.issued < '2000-07-01') throw new Error('GST started on 1 July 2000: enter an issue date from then.');
  // The 2023 determination commenced the day after its registration on 14 June 2023 and replaced the earlier ones.
  if (rcti && x.issued < '2023-06-15') throw new Error('This calculator applies the Recipient Created Tax Invoice Determination 2023, in force from 15 June 2023: enter an issue date from then.');
  const supplier = { name: words(x.supplier_name, 'the supplier’s name', 200), address: words(x.supplier_address, 'the supplier’s address', 300) };
  const recipient = { name: words(x.recipient_name, 'the recipient’s name', 200), address: words(x.recipient_address, 'the recipient’s address', 300) };
  const invoiceNumber = words(x.invoice_number, 'the invoice number', 60);
  if (!Array.isArray(x.lines) || !x.lines.length) throw new Error('Enter at least one line: what is supplied, its quantity and price.');
  if (x.lines.length > MAX_LINES) throw new Error(`Enter no more than ${MAX_LINES} lines.`);

  const lines = x.lines.map((line, i) => {
    const description = words(line.description, `line ${i + 1}’s description`, 200);
    if (!description) throw new Error(`Describe what line ${i + 1} supplies.`);
    if (!TREATMENTS.includes(/** @type {any} */ (line.treatment))) throw new Error(`Choose whether line ${i + 1} is taxable, GST-free or input taxed.`);
    let quantity, unit;
    try {
      quantity = number(line.quantity, { min: 0.001, max: 100000, places: 3 });
      unit = Math.round(number(line.unit_price, { max: 10000000, money: true }) * 100);
    } catch (error) {
      throw new Error(`Line ${i + 1}: ${/** @type {Error} */ (error).message}`);
    }
    // The amount is the quantity times the unit price, rounded half up to the cent.
    const amount = ratioCents(BigInt(Math.round(quantity * 1000)) * BigInt(unit), 1000n);
    return { description, quantity: String(quantity), unit: BigInt(unit), amount, treatment: line.treatment };
  });

  // GST on a taxable line is one-eleventh of a GST-inclusive price (s 9-75: 10% of the price less GST)
  // or 10% of a GST-exclusive one. The total invoice rule rounds the total once; the taxable supply rule
  // rounds each line to the cent, half up, and adds them (the ATO's 'Rounding of GST').
  const divisor = inclusive ? 11n : 10n;
  const taxable = lines.filter((line) => line.treatment === 'taxable');
  const lineGst = (/** @type {bigint} */ amount) => ratioCents(amount, divisor);
  const gst = x.rounding === 'invoice' || taxable.length < 2
    ? ratioCents(taxable.reduce((sum, line) => sum + line.amount, 0n), divisor)
    : taxable.reduce((sum, line) => sum + lineGst(line.amount), 0n);
  const amount = lines.reduce((sum, line) => sum + line.amount, 0n);
  const totalPrice = inclusive ? amount : amount + gst;
  const taxableAmount = taxable.reduce((sum, line) => sum + line.amount, 0n);
  const mixed = taxable.length > 0 && taxable.length < lines.length;
  const showLineGst = x.rounding === 'supply' || taxable.length < 2;

  const problems = [];
  const supplierAbn = abnCheck(x.supplier_abn ?? '');
  if (!supplier.name) problems.push('the supplier’s name');
  if (supplierAbn.result === 'MALFORMED') problems.push('the supplier’s ABN as 11 digits');
  else if (supplierAbn.result === 'CHECK_DIGIT_INVALID') problems.push(`a supplier ABN that passes the check digit test (${supplierAbn.formatted} fails it)`);
  const recipientAbnText = (x.recipient_abn ?? '').trim();
  const recipientAbn = recipientAbnText ? abnCheck(recipientAbnText) : null;
  if (recipientAbn?.result === 'MALFORMED') problems.push('the recipient’s ABN as 11 digits, or leave it blank');
  else if (recipientAbn?.result === 'CHECK_DIGIT_INVALID') problems.push(`a recipient ABN that passes the check digit test (${recipientAbn.formatted} fails it)`);
  // Only a tax invoice needs the recipient: one with a taxable supply, whose supplies total $1,000 or more.
  const recipientRequired = rcti || (taxable.length > 0 && totalPrice >= RECIPIENT_THRESHOLD);
  if (rcti) {
    // s 29-70(1)(c)(ii) asks for the recipient's identity or ABN; the ATO's page asks an RCTI for both parties' ABNs.
    if (!recipient.name) problems.push('the recipient’s name, as the recipient issues an RCTI');
    if (!recipientAbn) problems.push('the recipient’s ABN, which the ATO requires on an RCTI');
    if (!taxable.length) problems.push('at least one taxable line, as an RCTI is for a taxable supply');
    if (x.rcti_conditions_met !== true) problems.push('confirmation that the Recipient Created Tax Invoice Determination 2023 allows this RCTI');
  } else if (recipientRequired && !recipient.name && !recipientAbn) {
    problems.push('the recipient’s name or ABN, as the total price is $1,000 or more');
  }
  if (problems.length) throw new Error(`To be a ${rcti ? 'recipient created tax invoice' : 'tax invoice'}, enter ${problems.join('; ')}.`);

  const heading = rcti ? 'Recipient created tax invoice' : taxable.length ? 'Tax invoice' : 'Invoice';
  const statements = [];
  if (!taxable.length) statements.push('No GST: each supply is GST-free or input taxed, and the total price includes no GST.');
  else if (!mixed && inclusive) statements.push('Each supply is taxable. Total price includes GST.');
  else if (!mixed) statements.push('Each supply is taxable. Prices exclude GST; the GST is added.');
  else {
    statements.push(inclusive ? '* Taxable supply: the price includes GST.' : '* Taxable supply: the price excludes GST; the GST is added.');
    statements.push('Other supplies are GST-free or input taxed, as marked, and include no GST.');
  }
  if (rcti && gst > 0n) statements.push('The GST shown is payable by the supplier.');

  /** @type {TaxInvoiceLine[]} */
  const shown = lines.map((line) => ({
    description: line.description, quantity: line.quantity, unitPrice: money(line.unit), amount: money(line.amount),
    treatment: line.treatment, marked: mixed && line.treatment === 'taxable',
    gst: line.treatment !== 'taxable' ? 0 : showLineGst ? money(lineGst(line.amount)) : null,
  }));

  const recipientLine = [recipient.name, recipientAbn && `ABN ${recipientAbn.formatted}`].filter(Boolean).join(', ');
  const checks = [
    [`Shows it is intended to be a ${rcti ? 'recipient created tax invoice' : 'tax invoice'} (s 29-70(1)(d))`,
      taxable.length ? `Headed ‘${heading}’` : 'Not needed: no supply is taxable, so the document is headed ‘Invoice’'],
    ['Supplier’s identity and ABN (s 29-70(1)(c)(i))', `${supplier.name}, ABN ${supplierAbn.formatted}, which passes the check digit test`],
    ['Recipient’s identity or ABN (s 29-70(1)(c)(ii))', recipientRequired ? recipientLine
      : `Not required: the total price is under $1,000${recipientLine ? `; shown: ${recipientLine}` : ''}`],
    ['What is supplied, with quantity and price (s 29-70(1)(c)(iii))', `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}, each with its description, quantity, unit price and amount`],
    ['Extent each supply is taxable (s 29-70(1)(c)(iv))', mixed ? 'Each taxable supply is marked * and each other supply is labelled GST-free or input taxed' : statements[0]],
    ['Date issued (s 29-70(1)(c)(v))', invoiceDate(x.issued)],
    ['GST payable (s 29-70(1)(c)(vi))', `${taxable.length ? `${dollarsText(gst)} in total, by the ${RULE_WORDS[/** @type {'invoice' | 'supply'} */ (x.rounding)]}` : 'None'}`
      + `${showLineGst && taxable.length > 1 ? ', with each taxable line’s GST shown' : ''}`],
  ];
  if (rcti) checks.push(['GST payable by the supplier (s 29-70(1)(c)(vii))', gst > 0n ? 'Stated' : 'No GST is payable']);

  return {
    heading, issued: x.issued, invoiceNumber, rcti, prices: x.prices, rounding: x.rounding, supplier: { ...supplier, abn: supplierAbn.formatted },
    recipient: { ...recipient, abn: recipientAbn?.formatted ?? '' }, recipientRequired, lines: shown,
    amount: money(amount), gst: money(gst), totalPrice: money(totalPrice), taxableAmount: money(taxableAmount), statements, checks,
  };
}

const plainDollars = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
/** @param {bigint} value */
const dollarsText = (value) => plainDollars.format(money(value));

/** The form's fields as the engine's input. @param {(name: string) => string} value @param {number} [rows] */
export function taxInvoiceFormInput(value, rows = 5) {
  const lines = [];
  for (let i = 1; i <= rows; i += 1) {
    const line = { description: value(`line-${i}-description`), quantity: value(`line-${i}-quantity`), unit_price: value(`line-${i}-price`),
      treatment: value(`line-${i}-treatment`) };
    // A row with nothing typed in it is not a line.
    if ([line.description, line.quantity, line.unit_price].some((text) => (text ?? '').trim())) lines.push(line);
  }
  return { issuer: value('issuer'), supplier_name: value('supplier-name'), supplier_abn: value('supplier-abn'),
    supplier_address: value('supplier-address'), recipient_name: value('recipient-name'), recipient_abn: value('recipient-abn'),
    recipient_address: value('recipient-address'), invoice_number: value('number'), issued: value('issued'), prices: value('prices'),
    rounding: value('rounding'), rcti_conditions_met: value('rcti') === 'yes', lines };
}

/** How the page writes the input. @param {TaxInvoiceInput} x */
export function taxInvoiceInputsText(x) {
  const n = x.lines.length;
  return `${x.issuer === 'recipient' ? 'Issued by the recipient' : 'Issued by the supplier'} on ${x.issued}; ${n} ${n === 1 ? 'line' : 'lines'}, `
    + `prices ${x.prices === 'inclusive' ? 'including' : 'excluding'} GST, the ${RULE_WORDS[/** @type {'invoice' | 'supply'} */ (x.rounding)] ?? x.rounding}`;
}

/** Text safe inside HTML. @param {string} text */
const escape = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The invoice as a standalone HTML file to print or save as PDF: no script, and a policy that loads nothing.
 * @param {ReturnType<typeof taxInvoice>} r @param {(value: number) => string} aud
 */
export function invoiceHtml(r, aud) {
  const party = (/** @type {string} */ title, /** @type {{name: string, abn: string, address: string}} */ p) => (p.name || p.abn
    ? `<section><h2>${title}</h2><p>${[p.name, p.abn && `ABN ${p.abn}`, p.address].filter(Boolean).map(escape).join('<br>')}</p></section>` : '');
  const priceWord = r.prices === 'inclusive' ? 'including GST' : 'excluding GST';
  const rows = r.lines.map((l) => `<tr><td>${escape(`${l.marked ? '* ' : ''}${l.description}`)}</td><td class="n">${escape(l.quantity)}</td>`
    + `<td class="n">${escape(aud(l.unitPrice))}</td><td class="n">${escape(aud(l.amount))}</td><td>${TREATMENT_WORDS[/** @type {'taxable'} */ (l.treatment)]}</td>`
    + `<td class="n">${l.gst === null ? 'In total' : escape(aud(l.gst))}</td></tr>`).join('');
  const totals = [r.prices === 'exclusive' && ['Total excluding GST', r.amount], ['GST', r.gst], ['Total price', r.totalPrice]]
    .filter((row) => Array.isArray(row)).map((row) => `<tr><th colspan="5">${row[0]}</th><td class="n">${escape(aud(/** @type {number} */ (row[1])))}</td></tr>`).join('');
  return `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escape(`${r.heading}${r.invoiceNumber ? ` ${r.invoiceNumber}` : ''}`)}</title>
<style>body{font:11pt/1.45 system-ui,sans-serif;max-width:180mm;margin:12mm auto;padding:0 6mm}h1{margin:0 0 4mm}h2{font-size:11pt;margin:6mm 0 1mm}
table{width:100%;border-collapse:collapse;margin-top:6mm}th,td{border-bottom:1px solid;padding:1.5mm;text-align:left;vertical-align:top}.n{text-align:right}
tfoot th{text-align:right}@page{margin:12mm}</style></head>
<body><h1>${r.heading}</h1>
<p>${r.invoiceNumber ? `Invoice number: ${escape(r.invoiceNumber)}<br>` : ''}Date issued: ${invoiceDate(r.issued)}</p>
${party('Supplier', r.supplier)}${party('Recipient', r.recipient)}
<table><thead><tr><th>Description</th><th class="n">Quantity</th><th class="n">Unit price (${priceWord})</th><th class="n">Amount (${priceWord})</th><th>Supply</th><th class="n">GST</th></tr></thead>
<tbody>${rows}</tbody><tfoot>${totals}</tfoot></table>
${r.statements.map((s) => `<p>${escape(s)}</p>`).join('')}
</body></html>
`;
}

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function taxInvoiceResult(value, aud) {
  const input = taxInvoiceFormInput(value);
  const r = taxInvoice(input);
  const rows = [['Total price', aud(r.totalPrice)], ['GST', aud(r.gst)], ['Document', r.heading], ['Wording', r.statements.join(' ')]];
  const tables = {
    lines: r.lines.map((l) => [`${l.marked ? '* ' : ''}${l.description}`, l.quantity, aud(l.unitPrice), aud(l.amount),
      TREATMENT_WORDS[/** @type {'taxable'} */ (l.treatment)], l.gst === null ? 'In total' : aud(l.gst)]),
    checks: r.checks,
  };
  return { inputs: taxInvoiceInputsText(input), rows, principal: 1, tables, html: invoiceHtml(r, aud),
    note: 'Each detail section 29-70(1) requires is shown; download the invoice to print it or save it as PDF. A valid check digit does not show an ABN is active or registered for GST' };
}
