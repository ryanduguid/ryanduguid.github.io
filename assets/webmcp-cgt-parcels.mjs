// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for the CGT page's share parcels form. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

/** @param {ToolKit} kit */
function schema(kit) {
  const { text, choice, record } = kit;
  const units = text('quantity', 'Number of shares or units, above 0, at most 4 decimal places.');
  const name = { type: /** @type {const} */ ('string'), description: 'A name for the parcel, used once.' };
  const security = { type: /** @type {const} */ ('string'), description: 'The share or unit code, such as ABC.' };
  const parcel = record({
    parcel: name, security, acquired: text('date', 'Purchase contract date, YYYY-MM-DD, after 21 September 1999.'), units,
    acquisition_cost: text('cost', 'Purchase price of the parcel in AUD.'),
    incidental_costs: text('cost', 'Brokerage and other buying costs in AUD.'),
    ownership_costs: text('cost', 'Non-deductible costs of owning in AUD; 0 when omitted.'),
    capital_expenditure: text('cost', 'Capital expenditure to increase or preserve the value in AUD; 0 when omitted.'),
    title_costs: text('cost', 'Costs of establishing or defending title in AUD; 0 when omitted.'),
  }, ['parcel', 'security', 'acquired', 'units', 'acquisition_cost', 'incidental_costs']);
  const pick = record({ parcel: name, units }, ['parcel', 'units']);
  const disposal = record({
    security, date: text('date', 'Sale contract date, YYYY-MM-DD, by the end of the income year.'), units,
    capital_proceeds: text('cost', 'Sale proceeds in AUD.'), incidental_costs: text('cost', 'Brokerage and other selling costs in AUD.'),
    parcels: { type: 'array', maxItems: 1000, items: pick, description: 'With selected identification only: the parcels and units sold.' },
  }, ['security', 'date', 'units', 'capital_proceeds', 'incidental_costs']);
  return record({
    entity: choice(['individual', 'trust', 'complying_superannuation_entity', 'company'], 'Who made the sales.'),
    identification: choice(['first_in_first_out', 'selected'], 'Earliest parcels first, or the parcels the taxpayer selects.'),
    parcels: { type: 'array', maxItems: 1000, items: parcel, description: 'Each parcel acquired, 1 to 1000.' },
    disposals: { type: 'array', maxItems: 1000, items: disposal, description: 'Each sale, 1 to 1000.' },
    other_discount_capital_gains: text('cost', 'Other discount capital gains this year in AUD; 0 for a company.'),
    other_capital_gains: text('cost', 'Other capital gains this year that are not discount capital gains in AUD.'),
    other_capital_losses: text('cost', 'Other capital losses this year in AUD.'),
    prior_net_capital_losses: text('cost', 'Net capital losses from earlier years in AUD.'),
    year: choice(['2025-26', '2026-27'], 'Income year of the sales.'),
  }, ['entity', 'identification', 'parcels', 'disposals', 'other_discount_capital_gains', 'other_capital_gains',
    'other_capital_losses', 'prior_net_capital_losses', 'year']);
}

/** @param {ToolKit} kit @param {BusinessCalculators['cgtParcels']} cgtParcels */
export function cgtParcelsTool(kit, cgtParcels) {
  return kit.tool({
    name: 'calculate_cgt_share_parcels',
    title: 'CGT on share and unit parcels',
    description: 'Capital gains and losses in AUD from selling shares or units held in parcels bought at different times '
      + '(CGT event A1, ITAA 1997 s 104-10), matched first in, first out or as selected (TD 33), with each parcel\'s cost base '
      + 'and reduced cost base, the 12-month discount test, the year\'s net capital gain (label A) and net capital losses carried '
      + 'forward under s 102-5, and the parcels still held, for 2025-26 and 2026-27. Refuses parcels bought at or before 21 '
      + 'September 1999 (indexation or pre-CGT), and does not apply Division 152 concessions, roll-overs or cost base adjustments.',
    inputSchema: schema(kit),
    run: (input) => ({ ...cgtParcels({ ...input, scope_confirmed: true }), currency: 'AUD',
      source: `${kit.CALCULATORS}cgt/#cgt-parcels` }),
  });
}
