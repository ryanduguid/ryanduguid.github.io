// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for luxury car tax, wine equalisation tax and franking account.
// Imported by assets/webmcp-business-a.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {import('./webmcp-tools.mjs').Schema} Schema */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

const LCT_CAR_KINDS = new Set(['sale', 'importation', 'price_adjustment', 'change_of_use_increasing']);

const LCT_LINE_FIELDS = /** @type {const} */ ([
  ['suppliedIn', 'supplied_in'],
  ['luxuryCarTaxValue', 'luxury_car_tax_value'],
  ['correctedLuxuryCarTaxValue', 'corrected_luxury_car_tax_value'],
  ['fuelConsumptionLitresPer100km', 'fuel_consumption_litres_per_100km'],
  ['usedBefore1July2025', 'used_before_1_july_2025'],
  ['lctPreviouslyPayable', 'lct_previously_payable'],
  ['previouslyAttributedLct', 'previously_attributed_lct'],
  ['lctPayableOnSupply', 'lct_payable_on_supply'],
  ['claimant', 'claimant'],
  ['refundEligibleCar', 'refund_eligible_car'],
  ['lctBorne', 'lct_borne'],
]);

const LCT_MONEY_FIELDS = /** @type {const} */ ([
  'value', 'threshold', 'over', 'tax', 'payable', 'priceWithLct',
  'previous', 'attributed', 'corrected', 'increasing', 'decreasing', 'borne', 'refund',
]);

const WET_DEALING_FIELDS = /** @type {const} */ ([
  ['priceExcludingWetAndGst', 'price_excluding_wet_and_gst'],
  ['retailPriceIncludingWetAndGst', 'retail_price_including_wet_and_gst'],
  ['purchasePriceExcludingGst', 'purchase_price_excluding_gst'],
  ['purchaserIntention', 'purchaser_intention'],
]);

/** @param {Record<string, any>} line */
function lctLineInput(line) {
  const supplied = new Map(Object.entries(line));
  /** @type {Map<string, unknown>} */
  const out = new Map([['kind', line.kind]]);
  for (const [prop, key] of LCT_LINE_FIELDS) {
    const val = supplied.get(prop);
    if (val !== undefined) out.set(key, val);
  }
  if (LCT_CAR_KINDS.has(line.kind) && !out.has('fuel_consumption_litres_per_100km')) {
    out.set('fuel_consumption_litres_per_100km', null);
  }
  return Object.fromEntries(out);
}

/** @param {import('./luxury-car-tax.mjs').LctWorked} line @param {(value: number) => string} dollars */
function formatLctLine(line, dollars) {
  const moneySet = new Set(/** @type {readonly string[]} */ (LCT_MONEY_FIELDS));
  /** @type {Map<string, unknown>} */
  const out = new Map();
  for (const [key, val] of Object.entries(line)) {
    out.set(key, moneySet.has(key) && typeof val === 'number' ? dollars(val) : val);
  }
  return Object.fromEntries(out);
}

/**
 * @param {ToolKit} kit
 * @param {BusinessCalculators['luxuryCarTax']} luxuryCarTax
 * @param {string[]} lctYears
 * @param {BusinessCalculators['LCT_THRESHOLDS']} lctThresholds
 */
export function luxuryCarTaxTool(kit, luxuryCarTax, lctYears, lctThresholds) {
  const { text, choice, record, tool, dollars, CALCULATORS } = kit;
  const supplyYears = lctThresholds.map(([year]) => year);
  const lineSchema = record({
    kind: choice(['sale', 'importation', 'price_adjustment', 'change_of_use_increasing', 'change_of_use_decreasing', 'refund'],
      'Line type: "sale", "importation", "price_adjustment", "change_of_use_increasing", "change_of_use_decreasing" or "refund".'),
    suppliedIn: choice(supplyYears, 'Supply financial year (2012-13 to incomeYear): required for price_adjustment, change_of_use_increasing and refund.'),
    luxuryCarTaxValue: text('cost', 'Luxury car tax value in AUD (sale, importation, change_of_use_increasing).'),
    correctedLuxuryCarTaxValue: text('cost', 'Corrected luxury car tax value in AUD (price_adjustment).'),
    fuelConsumptionLitresPer100km: text('percent', 'Combined fuel consumption rating in L/100 km (0 to 100, up to 2 decimals); omit for no rating on car lines.'),
    usedBefore1July2025: { type: 'boolean', description: 'Only for 2025-26 or later cars rated > 3.5 and <= 7 L/100 km: true if supplied/imported and used in Australia before 1 July 2025 other than for a quotable purpose.' },
    lctPreviouslyPayable: text('cost', 'Optional LCT previously payable on the car in AUD (sale, price_adjustment, change_of_use_increasing).'),
    previouslyAttributedLct: text('cost', 'LCT previously attributed in AUD (price_adjustment).'),
    lctPayableOnSupply: text('cost', 'LCT payable on the supply in AUD (change_of_use_decreasing).'),
    claimant: choice(['primary_producer', 'tourism_operator'], 'Refund claimant (refund only).'),
    refundEligibleCar: { type: 'boolean', description: 'Whether the car is a refund-eligible car (refund only).' },
    lctBorne: text('cost', 'LCT borne in AUD (refund only).'),
  }, ['kind']);
  return tool({
    name: 'calculate_luxury_car_tax',
    title: 'Luxury car tax calculator',
    description: 'Luxury car tax in AUD for a tax period\'s lines from 2019-20 to 2026-27 under the LCT Act 1999 (33% of '
      + '10/11 of value over the threshold, rounded half up to the cent), with fuel-efficient car limits (3.5 L/100 km from '
      + '1 July 2025, or 7 L/100 km before and under Act No. 29 of 2025 item 4(2)), adjustments, primary producer or tourism '
      + 'operator refunds (capped at $10,000) and BAS labels 1E and 1F in whole dollars. Does not decide whether a vehicle is '
      + 'a luxury car or whether a supply is taxable.',
    inputSchema: record({
      incomeYear: choice(lctYears, `Financial year of the tax period, ${lctYears[0]} to ${lctYears.at(-1)}.`),
      lines: { type: 'array', maxItems: 1000, items: lineSchema, description: 'From 1 to 1,000 LCT lines for the tax period.' },
    }, ['incomeYear', 'lines']),
    run({ incomeYear, lines }) {
      const r = luxuryCarTax({ year: incomeYear, lines: lines.map(lctLineInput) });
      return {
        incomeYear: r.year, lines: r.lines.map((line) => formatLctLine(line, dollars)),
        onSales: dollars(r.onSales), increasingAdjustments: dollars(r.increasing),
        decreasingAdjustments: dollars(r.decreasing), label1e: String(r.label1e), label1f: String(r.label1f),
        onImportations: dollars(r.onImportations), refunds: dollars(r.refunds),
        threshold: dollars(r.threshold), fuelEfficientLimit: dollars(r.fuelEfficientLimit),
        warnings: r.warnings, currency: 'AUD', source: `${CALCULATORS}luxury-car-tax/`,
      };
    },
  });
}

/** @param {Record<string, any>} dealing */
function wetDealingInput(dealing) {
  const supplied = new Map(Object.entries(dealing));
  /** @type {Map<string, unknown>} */
  const out = new Map([['kind', dealing.kind]]);
  for (const [prop, key] of WET_DEALING_FIELDS) {
    const val = supplied.get(prop);
    if (val !== undefined) out.set(key, val);
  }
  if (dealing.averageWholesale !== undefined) {
    const aw = dealing.averageWholesale;
    out.set('average_wholesale', {
      grape_wine: aw.grapeWine,
      wholesale_share_at_least_10_percent: aw.wholesaleShareAtLeast10Percent,
      quantity: aw.quantity,
      wholesale_sales: aw.wholesaleSales.map((/** @type {{quantity: string, priceExcludingWetAndGst: string}} */ s) => ({
        quantity: s.quantity, price_excluding_wet_and_gst: s.priceExcludingWetAndGst,
      })),
    });
  }
  if (dealing.rebateConditions !== undefined) {
    const rc = dealing.rebateConditions;
    out.set('rebate_conditions', {
      producer: rc.producer,
      source_product_owned_85_percent: rc.sourceProductOwned85Percent,
      container_and_trade_mark: rc.containerAndTradeMark,
    });
  }
  return Object.fromEntries(out);
}

/** @param {import('./wine-equalisation-tax.mjs').WetDealing} d @param {(value: number) => string} dollars */
function formatWetDealing(d, dollars) {
  return {
    dealing: d.dealing, kind: d.kind, method: d.method,
    taxableValue: dollars(d.taxableValue), wineTax: dollars(d.wineTax),
    gst: d.gst === null ? null : dollars(d.gst),
    priceIncludingWetAndGst: d.priceIncludingWetAndGst === null ? null : dollars(d.priceIncludingWetAndGst),
    intention: d.intention,
    rebate: d.rebate ? {
      conditions: d.rebate.conditions, liable: d.rebate.liable,
      allMet: d.rebate.allMet, amount: dollars(d.rebate.amount),
    } : null,
  };
}

/** @param {ToolKit} kit @returns {Schema} */
function wetDealingSchema(kit) {
  const { text, choice, record } = kit;
  const averageSchema = record({
    grapeWine: { type: 'boolean', description: 'true for grape wine; false refuses (use half retail price method under s 9-30).' },
    wholesaleShareAtLeast10Percent: { type: 'boolean', description: 'true when at least 10% by value of period sales of that vintage and variety are wholesale (s 9-25(3)).' },
    quantity: text('quantity', 'Quantity of wine in this dealing (above 0, up to 4 decimal places).'),
    wholesaleSales: {
      type: 'array', maxItems: 1000, description: 'Period wholesale sales of the same vintage and variety (1 to 1,000 entries).',
      items: record({
        quantity: text('quantity', 'Quantity sold (above 0, up to 4 decimal places).'),
        priceExcludingWetAndGst: text('cost', 'Wholesale price excluding WET and GST in AUD.'),
      }, ['quantity', 'priceExcludingWetAndGst']),
    },
  }, ['grapeWine', 'wholesaleShareAtLeast10Percent', 'quantity', 'wholesaleSales']);
  const rebateSchema = record({
    producer: { type: 'boolean', description: 'true when the claimant is the producer of the wine (s 19-5).' },
    sourceProductOwned85Percent: { type: 'boolean', description: 'true when at least 85% of source product was owned throughout winemaking.' },
    containerAndTradeMark: { type: 'boolean', description: 'true when packaged in a container <= 5 litres branded with the producer\'s trade mark.' },
  }, ['producer', 'sourceProductOwned85Percent', 'containerAndTradeMark']);
  return record({
    kind: choice(['wholesale_sale', 'retail_sale', 'own_use', 'quoted_sale', 'own_use_purchased_under_quote'], 'Assessable dealing kind.'),
    priceExcludingWetAndGst: text('cost', 'Price excluding WET and GST in AUD (wholesale_sale, quoted_sale).'),
    retailPriceIncludingWetAndGst: text('cost', 'Retail price including WET and GST in AUD (retail_sale, and own_use under half retail method).'),
    purchasePriceExcludingGst: text('cost', 'Purchase price excluding GST in AUD (own_use_purchased_under_quote).'),
    purchaserIntention: choice(['taxable_dealing', 'manufacture', 'gst_free_supply', 'sale_under_quote'],
      'What the purchaser\'s quote states (quoted_sale only).'),
    averageWholesale: averageSchema,
    rebateConditions: rebateSchema,
  }, ['kind']);
}

/**
 * @param {ToolKit} kit
 * @param {BusinessCalculators['wineEqualisationTax']} wineEqualisationTax
 * @param {string[]} wetYears
 */
export function wineEqualisationTaxTool(kit, wineEqualisationTax, wetYears) {
  const { text, choice, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_wine_equalisation_tax',
    title: 'Wine equalisation tax calculator',
    description: 'Wine equalisation tax (29%) in AUD on a tax period\'s assessable dealings from 2023-24 to 2027-28 under '
      + 'the WET Act 1999: wholesale sales, retail sales and own use (half retail or average wholesale price), sales under '
      + 'quote, producer rebate within the yearly cap ($350,000 to 2025-26, $400,000 from 2026-27) and BAS labels 1C and 1D '
      + 'in whole dollars. Report 1C and 1D separately without netting. Does not cover 2017 or earlier vintage transitional rules.',
    inputSchema: record({
      incomeYear: choice(wetYears, `Financial year of the tax period, ${wetYears[0]} to ${wetYears.at(-1)}.`),
      dealings: { type: 'array', maxItems: 1000, items: wetDealingSchema(kit), description: 'From 1 to 1,000 assessable dealings.' },
      rebateClaimedEarlierInYear: text('cost', 'Producer rebates already claimed earlier in the financial year in AUD (required only when a dealing claims the rebate).'),
      associatedProducer: { type: 'boolean', description: 'true when in an associated producer group sharing the cap (required only when a dealing claims the rebate).' },
      scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation; false refuses.' },
    }, ['incomeYear', 'dealings']),
    run({ incomeYear, dealings, rebateClaimedEarlierInYear, associatedProducer, scopeConfirmed }) {
      const r = wineEqualisationTax({
        year: incomeYear, dealings: dealings.map(wetDealingInput),
        ...(rebateClaimedEarlierInYear === undefined ? {} : { rebate_claimed_earlier_in_year: rebateClaimedEarlierInYear }),
        ...(associatedProducer === undefined ? {} : { associated_producer: associatedProducer }),
        ...(scopeConfirmed === undefined ? {} : { scope_confirmed: scopeConfirmed }),
      });
      return {
        incomeYear: r.year, wineTax: dollars(r.wineTax), label1c: String(r.label1c),
        rebateBeforeCap: dollars(r.rebateBeforeCap), rebate: dollars(r.rebate),
        rebateOverCap: dollars(r.rebateOverCap), label1d: String(r.label1d),
        cap: dollars(r.cap), capLeft: dollars(r.capLeft),
        dealings: r.dealings.map((d) => formatWetDealing(d, dollars)),
        warnings: r.warnings, currency: 'AUD', source: `${CALCULATORS}wine-equalisation-tax/`,
      };
    },
  });
}

/**
 * @param {import('./franking-account.mjs').FrankingResult<number>} r
 * @param {(value: number) => string} dollars
 * @param {string} source
 */
function formatFrankingResult(r, dollars, source) {
  const opt = (/** @type {number | null} */ v) => (v === null ? null : dollars(v));
  return {
    credits: dollars(r.credits), debits: dollars(r.debits),
    yearEndBalance: dollars(r.yearEndBalance), closingBalance: dollars(r.closing), balanceCode: r.balanceCode,
    frankingDeficitTax: dollars(r.fdt), fdtFromRefunds: dollars(r.fdtFromRefunds),
    offsetReduction: dollars(r.reduction), frankingDeficitTaxOffset: dollars(r.offset), offsetCode: r.offsetCode,
    labelK: dollars(r.labelK), overFrankingTax: dollars(r.oft), frankingTaxPayable: dollars(r.payable),
    yearEndRdDeferral: dollars(r.yearEndRdDeferral), rdCarried: dollars(r.rdCarried),
    offsetTotal: opt(r.offsetTotal), offsetUsed: opt(r.offsetUsed), offsetCarried: opt(r.offsetCarried),
    grossUp: r.grossUp, authority: r.authority, significantVariation: r.variation,
    returnRequired: r.required, dueDate: r.due,
    ledger: r.ledger.map((l) => ({
      date: l.date, item: l.item, credit: opt(l.credit), debit: opt(l.debit), balance: dollars(l.balance),
    })),
    distributions: r.distributions.map((x) => ({
      date: x.date, amount: dollars(x.amount), allocated: dollars(x.allocated), maximum: dollars(x.maximum),
      credit: dollars(x.credit), percentage: x.percentage, period: x.period, comparedWith: x.comparedWith,
      overFrankingTax: dollars(x.overFrankingTax), underFrankingDebit: dollars(x.underFrankingDebit),
    })),
    periods: r.periods,
    refunds: r.refunds.map((x) => (x.taken ? { ...x, fdtAdded: dollars(x.fdtAdded) } : x)),
    currency: 'AUD', source,
  };
}

/** @param {Record<string, any>} input @returns {import('./franking-account.mjs').FrankingInput} */
function frankingAccountInput({
  incomeYear, entity, imputationRatePercent, openingBalance, rdDeferralBroughtForward = '0',
  lastBenchmarkPercent = '', periodsSinceLastBenchmark, commissionerDetermination = false,
  incomeTaxBeforeOffset = '', offsetBroughtForward = '', earlierIncomeTaxLiability = '',
  events = [], distributions = [],
}) {
  return {
    year: incomeYear, entity, rate: imputationRatePercent, opening: openingBalance,
    rdForward: rdDeferralBroughtForward, lastBenchmark: lastBenchmarkPercent,
    periodsSince: periodsSinceLastBenchmark === undefined ? '' : String(periodsSinceLastBenchmark),
    determination: commissionerDetermination, taxBefore: incomeTaxBeforeOffset,
    offsetForward: offsetBroughtForward, earlierLiability: earlierIncomeTaxLiability,
    events: events.map((/** @type {{date: string, type: string, amount: string, rdPart?: string}} */ { date, type, amount, rdPart = '' }) => ({
      date, type, amount, rdPart,
    })),
    distributions: distributions.map((/** @type {{date: string, amount: string, frankingCredit: string, permittedPercent?: string}} */ {
      date, amount, frankingCredit, permittedPercent = '',
    }) => ({ date, amount, credit: frankingCredit, permitted: permittedPercent })),
  };
}

/** @param {ToolKit} kit @param {string[]} eventTypes */
function frankingSchemas(kit, eventTypes) {
  const { text, choice, record } = kit;
  return {
    eventSchema: record({
      date: text('date', 'Event date as YYYY-MM-DD (income_tax_refund may fall within 3 months after 30 June).'),
      type: choice(eventTypes, 'Franking credit or debit event type under ITAA 1997 s 205-15 or s 205-30.'),
      amount: text('cost', 'Event amount above zero in AUD with at most 2 decimal places.'),
      rdPart: text('cost', 'Income tax refund only: part attributable to a refundable R&D tax offset in AUD.'),
    }, ['date', 'type', 'amount']),
    distributionSchema: record({
      date: text('date', 'Distribution date as YYYY-MM-DD within the income year, in date order.'),
      amount: text('cost', 'Frankable distribution amount above zero in AUD with at most 2 decimal places.'),
      frankingCredit: text('cost', 'Franking credit allocated to the distribution in AUD with at most 2 decimal places.'),
      permittedPercent: text('percent', 'Optional Commissioner-permitted franking percentage (s 203-55) after the period\'s first distribution.'),
    }, ['date', 'amount', 'frankingCredit']),
  };
}

/**
 * @param {ToolKit} kit
 * @param {BusinessCalculators['frankingAccount']} frankingAccount
 * @param {BusinessCalculators['FRANKING_EVENTS']} frankingEvents
 */
export function frankingAccountTool(kit, frankingAccount, frankingEvents) {
  const { text, choice, whole, record, tool, dollars, CALCULATORS } = kit;
  const { eventSchema, distributionSchema } = frankingSchemas(kit, Object.keys(frankingEvents));
  return tool({
    name: 'calculate_franking_account',
    title: 'Franking account calculator',
    description: 'Corporate tax entity\'s franking account in AUD for 2025-26 or 2026-27 (1 July to 30 June) under ITAA 1997 '
      + 'Part 3-6: running ledger, franking deficit tax (s 205-45) including refunds within 3 months after year end '
      + '(s 205-50(2)), franking deficit tax offset and 30% reduction (s 205-70), benchmark rule over-franking tax and '
      + 'under-franking debits (ss 203-20 to 203-55), significant variation test (s 204-70), R&D deferral (s 205-15(4)) and '
      + 'franking return labels and due dates. Does not cover consolidated groups, substituted accounting periods or whole-dollar return rounding.',
    inputSchema: record({
      incomeYear: choice(['2025-26', '2026-27'], 'Income year ending 30 June: "2025-26" or "2026-27".'),
      entity: choice(['private', 'public', 'exempt'], '"private" (1 franking period), "public" (2 half-year periods) or "exempt" (s 203-20).'),
      imputationRatePercent: choice(['25', '30'], 'Corporate tax rate for imputation purposes: "25" or "30".'),
      openingBalance: text('signedCost', 'Opening franking account balance in AUD (negative for a deficit).'),
      rdDeferralBroughtForward: text('cost', 'R&D deferral brought forward under s 205-15(4) in AUD; "0" when omitted.'),
      lastBenchmarkPercent: text('percent', 'Optional previous benchmark franking percentage (0 to 100); pair with periodsSinceLastBenchmark.'),
      periodsSinceLastBenchmark: whole(1, 1000, 'Franking periods since the last benchmark up to and including this year\'s first.'),
      commissionerDetermination: { type: 'boolean', description: 'true when a s 205-70(6) Commissioner determination disapplies the 30% offset reduction; false when omitted.' },
      incomeTaxBeforeOffset: text('cost', 'Optional income tax before this offset in AUD; pair with offsetBroughtForward.'),
      offsetBroughtForward: text('cost', 'Optional franking deficit tax offset brought forward in AUD; pair with incomeTaxBeforeOffset.'),
      earlierIncomeTaxLiability: choice(['yes', 'no'], 'Private company with incomeTaxBeforeOffset: whether it had an income tax liability in an earlier year (s 205-70(5)(c)).'),
      events: { type: 'array', maxItems: 200, items: eventSchema, description: 'Franking credit and debit events for the year; empty when omitted.' },
      distributions: { type: 'array', maxItems: 200, items: distributionSchema, description: 'Frankable distributions in date order; empty when omitted.' },
    }, ['incomeYear', 'entity', 'imputationRatePercent', 'openingBalance']),
    run(input) {
      return formatFrankingResult(frankingAccount(frankingAccountInput(input)), dollars, `${CALCULATORS}franking-account/`);
    },
  });
}
