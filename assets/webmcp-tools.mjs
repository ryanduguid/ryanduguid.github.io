// WebMCP tool descriptors for the business calculators (pilot: GST only).
// Tools compute in the page, read nothing from the form and send nothing anywhere.
// https://webmachinelearning.github.io/webmcp/
const AMOUNT = '^\\d{1,9}(?:\\.\\d{1,2})?$';

/** @param {Pick<typeof import('./business-calculators.mjs'), 'gst'>} calculate */
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
      /** @param {{amount?: unknown, inclusive?: unknown}} [input] */
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

// Lambda is written as \u03bb in this file: the site's font checks treat a
// literal character in a page script as text that page can show.
/** A function name as people type it: no `oz.` prefix, no lambda, no case.
 * @param {unknown} name */
const functionKey = name => String(name).trim().replace(/^oz\./i, '').replace(/\u03bb/g, '').toLowerCase();

/**
 * WebMCP descriptor that looks up one Ozzit formula in the published function reference.
 * @param {() => Promise<{modules: Array<{module: string, functions: Array<Record<string, any>>}>}>} loadReference
 * @param {string} pageBase the module pages' path, ending in a slash
 */
export function ozzitTools(loadReference, pageBase = '/tools/ozzit/functions/') {
  return {
    lookup: {
      name: 'ozzit_function',
      title: 'Ozzit function reference',
      description: 'Look up one Ozzit Excel LAMBDA function by name and return its signature, parameters, notes '
        + 'and worked examples from the released workbook help. Reference only: it calculates nothing and does '
        + 'not decide an accounting treatment.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 80, description: 'Function name, for example "oz.Amortise\u03bb", "Amortise" or "GSTExtract".' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      /** @param {{name?: unknown}} [input] */
      async execute({ name } = {}) {
        if (typeof name !== 'string' || !name.trim()) throw new Error('name must be a function name.');
        const key = functionKey(name);
        const reference = await loadReference();
        for (const { module, functions } of reference.modules) {
          const found = functions.find(f => functionKey(f.name) === key);
          if (!found) continue;
          const anchor = 'oz-' + key.replace(/[^a-z0-9]/g, '');
          return {
            name: found.name, module, signature: 'oz.' + found.signature, summary: found.summary,
            description: found.description, parameters: found.parameters, notes: found.notes,
            examples: found.examples, source: `https://duguid.com.au${pageBase}${module.toLowerCase()}/#${anchor}`,
          };
        }
        throw new Error(`No Ozzit function is named ${name.trim()}.`);
      },
    },
  };
}
