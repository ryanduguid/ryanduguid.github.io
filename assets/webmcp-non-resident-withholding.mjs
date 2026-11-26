// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for the non-resident withholding calculator. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

/** @param {ToolKit} kit @param {Pick<BusinessCalculators, 'nonResidentWithholding' | 'NRW_YEARS'>} calculate */
export function nonResidentWithholdingTool(kit, calculate) {
  const { text, choice, record, tool, CALCULATORS } = kit;
  const years = calculate.NRW_YEARS;
  return tool({
    name: 'calculate_non_resident_withholding',
    title: 'Non-resident withholding calculator',
    description: 'The amount a payer withholds in AUD from a dividend, interest or royalty paid to a foreign resident in '
      + `${years.at(-1)} to ${years[0]} under TAA 1953 Sch 1 Subdivision 12-F: the payment less a dividend's franked part and `
      + 'conduit foreign income, cents dropped, at 30% (dividends, royalties) or a stated treaty rate, or 10% for interest, '
      + 'cents dropped again (TAR 2017 ss 26, 40 to 42), capped by s 12-300 at the tax payable less any amount already withheld. '
      + 'It does not decide residency, treaty rates or exemptions, and does not cover managed investment trust, gaming junket, '
      + 'entertainment, sports or construction payments.',
    inputSchema: record({
      incomeYear: choice([...years], `Income year, ${years.at(-1)} to ${years[0]}.`),
      paymentType: choice(['dividend', 'interest', 'royalty'], 'The Subdivision 12-F payment.'),
      payment: text('trillionCost', 'The payment in AUD, at most 2 decimal places.'),
      frankedAmount: text('trillionCost', 'A dividend\'s franked part in AUD; 0 when omitted. Dividends only.'),
      conduitForeignIncome: text('trillionCost', 'Conduit foreign income in a dividend in AUD; 0 when omitted. Dividends only.'),
      treatyRate: { type: 'string', description: 'A treaty rate as a decimal (0.15 for 15%), no more than the domestic rate; none when omitted.' },
      exempt: { type: 'boolean', description: 'true when no withholding tax is payable on the payment; false when omitted.' },
      alreadyWithheld: text('trillionCost', 'An amount already withheld from this payment in AUD; 0 when omitted.'),
    }, ['incomeYear', 'paymentType', 'payment']),
    run(input) {
      /** @type {Record<string, unknown>} */
      const call = { payment_type: input.paymentType, payment: input.payment, year: input.incomeYear, scope_confirmed: true,
        treaty_rate: input.treatyRate ?? null, exempt: input.exempt ?? false, already_withheld: input.alreadyWithheld ?? '0' };
      if (input.paymentType === 'dividend') {
        Object.assign(call, { franked_amount: input.frankedAmount ?? '0', conduit_foreign_income: input.conduitForeignIncome ?? '0' });
      }
      const r = calculate.nonResidentWithholding(call);
      return { incomeYear: r.period, paymentType: r.payment_type, withholding: r.amounts.withholding,
        withholdingBase: r.amounts.withholding_base, paymentUsed: r.amounts.payment_used,
        regulationWithholding: r.amounts.regulation_withholding, netPayment: r.amounts.net_payment, rates: r.rates,
        steps: r.steps, currency: 'AUD', source: `${CALCULATORS}non-resident-withholding/` };
    },
  });
}
