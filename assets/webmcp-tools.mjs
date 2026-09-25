// WebMCP tool descriptors for the business calculators (pilot: GST only).
// Tools compute in the page, read nothing from the form and send nothing anywhere.
// https://webmachinelearning.github.io/webmcp/
const AMOUNT = '^\\d{1,9}(?:\\.\\d{1,2})?$';

export function calculatorTools(calculate) {
  return {
    gst: {
      name: 'calculate_gst',
      title: 'GST calculator',
      description: 'Split an Australian dollar amount for a wholly taxable supply into its GST-exclusive amount, '
        + 'GST at 10% and GST-inclusive amount, rounded once to cents. Planning estimate only: it does not decide '
        + 'whether a supply is taxable, GST-free or input taxed.',
      inputSchema: {
        type: 'object',
        properties: {
          amount: { type: 'string', pattern: AMOUNT, description: 'Amount in AUD with at most two decimal places, for example "1100.00".' },
          inclusive: { type: 'boolean', description: 'true when the amount already includes GST; false or omitted when it excludes GST.' },
        },
        required: ['amount'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      async execute({ amount, inclusive = false } = {}) {
        if (typeof inclusive !== 'boolean') throw new Error('inclusive must be true or false.');
        const r = calculate.gst(String(amount), inclusive);
        return {
          excludingGst: r.net.toFixed(2), gst: r.gst.toFixed(2), includingGst: r.gross.toFixed(2), currency: 'AUD',
          basis: '10% GST on a wholly taxable supply, rounded once to cents. Confirm tax treatment separately.',
          source: 'https://duguid.com.au/tools/business-calculators/gst/',
        };
      },
    },
  };
}
