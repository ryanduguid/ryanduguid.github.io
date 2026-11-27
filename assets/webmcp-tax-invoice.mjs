// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for the tax invoice generator (added 26 November 2026).
// Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

/** @param {ToolKit} kit @param {readonly string[]} treatments @param {number} maxLines */
function taxInvoiceSchema(kit, treatments, maxLines) {
  const { text, choice, record } = kit;
  const words = (/** @type {string} */ description) => ({ type: /** @type {const} */ ('string'), description });
  const line = record({
    description: words('What is supplied (1 to 200 characters).'),
    quantity: text('quantity', 'Quantity, more than 0 and at most 100,000, to at most 3 decimal places, for example "20".'),
    unitPrice: text('cost', 'Unit price in AUD, including or excluding GST as pricesIncludeGst says, at most 10,000,000, for example "1.10".'),
    treatment: choice([...treatments], '"taxable", "gst-free" or "input-taxed".'),
  }, ['description', 'quantity', 'unitPrice', 'treatment']);
  return record({
    issuedBy: choice(['supplier', 'recipient'], '"supplier" for a tax invoice; "recipient" for a recipient created tax invoice (RCTI). "supplier" when omitted.'),
    supplierName: words('Supplier’s legal or registered business name (at most 200 characters).'),
    supplierAbn: words('Supplier’s ABN: 11 digits, optionally separated by spaces.'),
    supplierAddress: words('Supplier’s address; optional.'),
    recipientName: words('Recipient’s name; needed when the total price is $1,000 or more and no recipient ABN is given, and for an RCTI.'),
    recipientAbn: words('Recipient’s ABN: 11 digits, optionally separated by spaces; needed for an RCTI.'),
    recipientAddress: words('Recipient’s address; optional.'),
    invoiceNumber: words('Invoice number; optional, at most 60 characters.'),
    issued: text('date', 'Date the invoice is issued, YYYY-MM-DD, from 2000-07-01 (from 2023-06-15 for an RCTI).'),
    pricesIncludeGst: { type: 'boolean', description: 'true when unit prices include GST (true when omitted); false when they exclude it.' },
    rounding: choice(['invoice', 'supply'], '"invoice" (total invoice rule: round the total GST once; the default) or "supply" (taxable supply rule: round each line, then add).'),
    rctiConditionsMet: { type: 'boolean', description: 'For an RCTI: true when the Recipient Created Tax Invoice Determination 2023 allows it; false refuses.' },
    lines: { type: 'array', maxItems: maxLines, items: line, description: `From 1 to ${maxLines} invoice lines.` },
  }, ['supplierName', 'supplierAbn', 'issued', 'lines']);
}

/** @param {ToolKit} kit @param {Pick<BusinessCalculators, 'taxInvoice' | 'TREATMENTS' | 'MAX_LINES'>} calculate */
export function taxInvoiceTools(kit, { taxInvoice, TREATMENTS, MAX_LINES }) {
  const { tool, CALCULATORS } = kit;
  return {
    'tax-invoice': tool({
      name: 'check_tax_invoice',
      title: 'Tax invoice generator and checker',
      description: 'Builds the figures (AUD) and wording of an Australian tax invoice or recipient created tax invoice and checks them '
        + 'against GST Act s 29-70(1): GST at one-eleventh of a GST-inclusive taxable price or 10% of a GST-exclusive one, '
        + 'the total invoice or taxable supply rounding rule, the recipient\'s identity or ABN from $1,000, the wording for '
        + 'taxable, GST-free and mixed invoices, and ABN check digits (no register lookup). Refuses an invoice that lacks a '
        + 'required detail, naming each one.',
      inputSchema: taxInvoiceSchema(kit, TREATMENTS, MAX_LINES),
      run(input) {
        const r = taxInvoice({
          issuer: input.issuedBy ?? 'supplier', supplier_name: input.supplierName, supplier_business_number: input.supplierAbn,
          supplier_address: input.supplierAddress ?? '', recipient_name: input.recipientName ?? '', recipient_business_number: input.recipientAbn ?? '',
          recipient_address: input.recipientAddress ?? '', invoice_number: input.invoiceNumber ?? '', issued: input.issued,
          prices: input.pricesIncludeGst === false ? 'exclusive' : 'inclusive', rounding: input.rounding ?? 'invoice',
          rcti_conditions_met: input.rctiConditionsMet ?? false,
          lines: input.lines.map((/** @type {Record<string, string>} */ l) => ({ description: l.description, quantity: l.quantity,
            unit_price: l.unitPrice, treatment: l.treatment })),
        });
        const dollars = (/** @type {number} */ value) => value.toFixed(2);
        return {
          heading: r.heading, issued: r.issued, invoiceNumber: r.invoiceNumber, supplier: r.supplier, recipient: r.recipient,
          recipientRequired: r.recipientRequired, pricesIncludeGst: r.prices === 'inclusive', rounding: r.rounding,
          lines: r.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: dollars(l.unitPrice),
            amount: dollars(l.amount), treatment: l.treatment, gst: l.gst === null ? null : dollars(l.gst), markedTaxable: l.marked })),
          amount: dollars(r.amount), gst: dollars(r.gst), totalPrice: dollars(r.totalPrice), statements: r.statements,
          checks: r.checks.map(([requirement, met]) => ({ requirement, met })),
          abnNote: 'ABNs are checked by check digit only; ABN Lookup shows whether an ABN is active and registered for GST.',
          currency: 'AUD', source: `${CALCULATORS}tax-invoice/`,
        };
      },
    }),
  };
}
