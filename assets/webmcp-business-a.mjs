// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for Business Calculators Cohort A (14 calculators):
// ASIC fees, ATO penalties and interest, business use share, fixed fee pricing,
// franking account, GIC payment plan, GST margin scheme, hourly rate, luxury car tax,
// margin and markup, objection deadline, budget variance, vehicle classifier and
// wine equalisation tax. Imported by assets/webmcp-tools.mjs.

import { atoPenaltiesInterestTool } from './webmcp-ato-penalties.mjs';
import { frankingAccountTool, luxuryCarTaxTool, wineEqualisationTaxTool } from './webmcp-business-a-tax.mjs';

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {import('./webmcp-tools.mjs').Schema} Schema */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

const VEHICLE_YEARS = new Map([
  ['2026-27', { carLimit: '69883', fuelEfficientThreshold: '91661', otherThreshold: '80809' }],
  ['2025-26', { carLimit: '69674', fuelEfficientThreshold: '91387', otherThreshold: '80567' }],
]);

const LATE_ASIC_FEES = new Set(['late-review-payment', 'late-lodgement']);
const INCOME_OBJECTIONS = new Set(['assessment', 'amended']);
const AMENDED_OBJECTIONS = new Set(['amended', 'amended-fbt']);
const MARGIN_VALUATION_FIELDS = [
  'valuationDay', 'registrationAtTransition', 'valuationProperty',
  'registrationEffectiveDay', 'registrationApplicationDay',
];

/** @param {ToolKit} kit @param {BusinessCalculators['businessUse']} businessUse */
export function businessUseTool(kit, businessUse) {
  const { text, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_business_use_share',
    title: 'Business use share calculator',
    description: 'Apportion an eligible cost in AUD by a supported business use percentage from 0 to 100, rounded half up to '
      + 'the cent. It does not decide deductibility, depreciation, GST credits or record sufficiency.',
    inputSchema: record({
      cost: text('amount', 'Eligible cost in AUD with at most 2 decimal places, for example "20.15".'),
      businessUsePercent: text('percent', 'Supported business use percentage from 0 to 100 with at most 2 decimal places, for example "50".'),
    }, ['cost', 'businessUsePercent']),
    run({ cost, businessUsePercent }) {
      const r = businessUse(cost, businessUsePercent);
      return { businessUseShare: dollars(r.share), currency: 'AUD', source: `${CALCULATORS}business-use/` };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['margin']} margin */
export function marginTool(kit, margin) {
  const { text, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_margin_and_markup',
    title: 'Margin and markup calculator',
    description: 'Gross profit in AUD, gross margin percentage (profit over sales) and markup percentage (profit over direct '
      + 'cost) on a consistent GST basis and matching period. Returns null for margin when sales are zero and for markup '
      + 'when direct cost is zero.',
    inputSchema: record({
      sales: text('amount', 'Sales in AUD with at most 2 decimal places, for example "100".'),
      directCost: text('amount', 'Direct cost in AUD with at most 2 decimal places, for example "80".'),
    }, ['sales', 'directCost']),
    run({ sales, directCost }) {
      const r = margin(sales, directCost);
      return {
        grossProfit: dollars(r.profit),
        marginPercent: r.margin === null ? null : r.margin.toFixed(2),
        markupPercent: r.markup === null ? null : r.markup.toFixed(2),
        currency: 'AUD', source: `${CALCULATORS}margin/`,
      };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['hourlyRate']} hourlyRate */
export function hourlyTool(kit, hourlyRate) {
  const { text, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_hourly_rate',
    title: 'Hourly pricing calculator',
    description: 'Required hourly rate in AUD before GST from annual costs, target profit and billable hours (0.01 to 8,784), '
      + 'rounded up to the cent so the rate times billable hours covers costs plus target profit.',
    inputSchema: record({
      annualCosts: text('amount', 'Annual costs in AUD with at most 2 decimal places.'),
      targetProfit: text('amount', 'Target profit in AUD with at most 2 decimal places.'),
      billableHours: text('amount', 'Billable hours from 0.01 to 8784 with at most 2 decimal places.'),
    }, ['annualCosts', 'targetProfit', 'billableHours']),
    run({ annualCosts, targetProfit, billableHours }) {
      const r = hourlyRate(annualCosts, targetProfit, billableHours);
      return { requiredHourlyRate: dollars(r.rate), currency: 'AUD', source: `${CALCULATORS}hourly/` };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['fixedFee']} fixedFee */
export function fixedFeeTool(kit, fixedFee) {
  const { text, choice, whole, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_fixed_fee',
    title: 'Fixed fee pricing calculator',
    description: 'Fixed fee in AUD from estimated hours at an hourly rate (or cost per hour with a target margin percentage '
      + 'under 100%), rounded up to the chosen dollar step ($0.01, $10, $50 or $100), with optional 10% GST, monthly '
      + 'instalments (1 to 24) that sum to the total to the cent and the effective hourly rate before GST.',
    inputSchema: record({
      hours: text('amount', 'Estimated hours for the work, from 0.01 to 8784 with at most 2 decimal places.'),
      rate: text('amount', 'Hourly rate or cost per hour before GST, in AUD with at most 2 decimal places.'),
      marginPercent: text('percent', 'Target margin as a percentage of the fee, 0 to 99.99; "0" when omitted.'),
      roundTo: choice(['0.01', '10', '50', '100'], 'Dollar step the fee before GST rounds up to; "0.01" when omitted.'),
      addGst: { type: 'boolean', description: 'true to add 10% GST to the fee; false when omitted.' },
      instalments: whole(1, 24, 'Number of monthly instalments, from 1 to 24; 1 when omitted.'),
    }, ['hours', 'rate']),
    run({ hours, rate, marginPercent = '0', roundTo = '0.01', addGst = false, instalments = 1 }) {
      const r = fixedFee(hours, rate, marginPercent, roundTo, addGst, String(instalments));
      return {
        feeBeforeGst: dollars(r.fee), gst: dollars(r.gst), feeIncludingGst: dollars(r.total),
        firstInstalment: dollars(r.first), remainingInstalment: instalments === 1 ? null : dollars(r.instalment),
        instalments, effectiveHourlyRate: dollars(r.effectiveRate),
        currency: 'AUD', source: `${CALCULATORS}fixed-fee/`,
      };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['variance']} variance */
export function varianceTool(kit, variance) {
  const { text, choice, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_budget_variance',
    title: 'Budget variance calculator',
    description: 'Budget variance in AUD: actual minus budget, the difference as a percentage of absolute budget (null when '
      + 'budget is zero) and whether the variance is Favourable, Unfavourable or On budget for an income or cost figure.',
    inputSchema: record({
      actual: text('signedCost', 'Actual figure in AUD (may be negative), with at most 2 decimal places, up to 1,000,000,000.'),
      budget: text('signedCost', 'Budget figure in AUD (may be negative), with at most 2 decimal places, up to 1,000,000,000.'),
      kind: choice(['income', 'cost'], '"income" (positive difference is Favourable) or "cost" (negative difference is Favourable).'),
    }, ['actual', 'budget', 'kind']),
    run({ actual, budget, kind }) {
      const r = variance(actual, budget, kind);
      return {
        difference: dollars(r.difference),
        percentOfAbsoluteBudget: r.percent === null ? null : r.percent.toFixed(2),
        effect: r.effect, currency: 'AUD', source: `${CALCULATORS}variance/`,
      };
    },
  });
}

/** @param {Record<string, any>} input */
function checkObjectionInputs(input) {
  const income = INCOME_OBJECTIONS.has(input.decision);
  const amended = AMENDED_OBJECTIONS.has(input.decision);
  if (income && input.reviewPeriodYears === undefined) {
    throw new Error('reviewPeriodYears is required for an income tax assessment or amended income tax assessment.');
  }
  if (!income && input.reviewPeriodYears !== undefined) {
    throw new Error('reviewPeriodYears applies only to an income tax assessment or amended income tax assessment.');
  }
  if (amended && input.firstNoticeDate === undefined) {
    throw new Error('firstNoticeDate is required for an amended assessment.');
  }
  if (!amended && input.firstNoticeDate !== undefined) {
    throw new Error('firstNoticeDate applies only to an amended assessment.');
  }
}

/** @param {ToolKit} kit @param {BusinessCalculators['objectionDeadline']} objectionDeadline */
export function objectionDeadlineTool(kit, objectionDeadline) {
  const { text, choice, record, tool, CALCULATORS } = kit;
  return tool({
    name: 'calculate_objection_deadline',
    title: 'Objection deadline checker',
    description: 'Last day to lodge a taxation objection under section 14ZW of the Taxation Administration Act 1953, moving a '
      + 'Saturday or Sunday under subsection 36(2) of the Acts Interpretation Act 1901. Public holidays depend on the place '
      + 'of lodgement and are not applied. Returns dates only (no AUD amount).',
    inputSchema: record({
      decision: choice(['assessment', 'amended', 'fbt', 'amended-fbt', 'other'],
        'ATO decision objected to: "assessment" (income tax), "amended" (amended income tax), "fbt", "amended-fbt" or "other".'),
      reviewPeriodYears: choice(['2', '4'],
        'Income tax assessment or amended income tax assessment only: "2" when ITAA 1936 s 170(1) item 1, 2, 3 or 3A applies, otherwise "4".'),
      noticeDate: text('date', 'Date notice of the decision was given or served, as YYYY-MM-DD (1900-01-01 to 9989-12-31).'),
      firstNoticeDate: text('date', 'Amended assessment only: date notice of the first assessment for the year was given, as YYYY-MM-DD.'),
    }, ['decision', 'noticeDate']),
    run(input) {
      checkObjectionInputs(input);
      const r = objectionDeadline(input.decision, input.reviewPeriodYears ?? '4', input.noticeDate, input.firstNoticeDate ?? '');
      return {
        rule: r.rule, periodEnds: r.periodEnds, lastDay: r.lastDay,
        amendedEnds: r.amendedEnds, firstEnds: r.firstEnds,
        source: `${CALCULATORS}objection-deadline/`,
      };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['gicPaymentPlan']} gicPaymentPlan */
export function gicPaymentPlanTool(kit, gicPaymentPlan) {
  const { text, choice, whole, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_gic_payment_plan',
    title: 'GIC payment plan calculator',
    description: 'Cost in AUD of paying an ATO tax debt by equal weekly, fortnightly or monthly instalments against paying in '
      + 'full on the first instalment day, with general interest charge compounding daily under TAA 1953 ss 8AAC and 8AAD. '
      + 'Uses published ATO GIC rates from 1 July 1999 to 31 December 2026 and requires assumedAnnualRate for later days. '
      + 'Does not model missed instalments, remission, refund offsets or deductibility.',
    inputSchema: record({
      debt: text('amount', 'Tax debt on the plan\'s first day in AUD (above zero), with at most 2 decimal places.'),
      startDate: text('date', 'Date of the first instalment as YYYY-MM-DD, from 1999-07-01 to 2099-12-31.'),
      instalments: whole(1, 120, 'Number of equal instalments, from 1 to 120.'),
      frequency: choice(['weekly', 'fortnightly', 'monthly'], 'How often instalments fall.'),
      assumedAnnualRate: text('percent', 'Assumed annual GIC rate in per cent (0.01 to 100) for days after 2026-12-31; required if the plan extends past 2026-12-31.'),
    }, ['debt', 'startDate', 'instalments', 'frequency']),
    run({ debt, startDate, instalments, frequency, assumedAnnualRate }) {
      const r = gicPaymentPlan({
        debt, start: startDate, count: String(instalments), frequency,
        assumedRate: assumedAnnualRate ?? '11.51',
      });
      if (r.assumedDays > 0 && assumedAnnualRate === undefined) {
        throw new Error('assumedAnnualRate is required when the plan runs after 2026-12-31.');
      }
      return {
        instalment: instalments === 1 ? null : dollars(r.instalment),
        finalInstalment: dollars(r.final), lastDate: r.lastDate,
        totalPaid: dollars(r.totalPaid), gic: dollars(r.gic), assumedDays: r.assumedDays,
        currency: 'AUD', source: `${CALCULATORS}gic-payment-plan/`,
      };
    },
  });
}

/** @param {string} fee @param {string | undefined} dueDate @param {string | undefined} receivedDate */
function checkAsicFeeDates(fee, dueDate, receivedDate) {
  const late = LATE_ASIC_FEES.has(fee);
  if (!late && (dueDate !== undefined || receivedDate !== undefined)) {
    throw new Error('dueDate and receivedDate apply only to late-review-payment and late-lodgement.');
  }
  if (late && (dueDate === undefined || receivedDate === undefined)) {
    throw new Error('dueDate and receivedDate are required for late fees.');
  }
  return late;
}

/**
 * @param {ToolKit} kit
 * @param {BusinessCalculators['asicFee']} asicFee
 * @param {BusinessCalculators['ASIC_FEES']} asicFees
 */
export function asicFeesTool(kit, asicFee, asicFees) {
  const { text, choice, record, tool, dollars, CALCULATORS } = kit;
  const feeEntries = new Map(Object.entries(asicFees));
  return tool({
    name: 'calculate_asic_fee',
    title: 'ASIC fees calculator',
    description: 'ASIC standard fees in AUD for 2026-27 (1 July 2026 to 30 June 2027) for company registration, name '
      + 'reservation, annual review fees by company type and 1- or 3-year business name registration or renewal, and late '
      + 'payment or late lodgement fee tiers ($102 within 1 month, $428 after). GST does not apply to ASIC fees. Refuses '
      + 'weekend boundary dates where statutory extensions may move the due date or month end, and does not check public holidays.',
    inputSchema: record({
      fee: choice([...feeEntries.keys()], 'ASIC fee type.'),
      dueDate: text('date', 'Late fees only: due date as YYYY-MM-DD in 2026-27 (2026-07-01 to 2027-06-30).'),
      receivedDate: text('date', 'Late fees only: date ASIC received the payment or document as YYYY-MM-DD in 2026-27.'),
    }, ['fee']),
    run({ fee, dueDate, receivedDate }) {
      const late = checkAsicFeeDates(fee, dueDate, receivedDate);
      const r = asicFee(late ? { fee, due: dueDate, received: receivedDate } : { fee });
      const entry = feeEntries.get(r.fee);
      return {
        fee: r.fee, name: entry ? entry.name : r.fee, code: r.code || null, amount: dollars(r.amount),
        gstApplies: false, tier: r.tier, firstMonthEnds: r.firstMonthEnds,
        legislation: entry ? entry.item : '', currency: 'AUD', source: `${CALCULATORS}asic-fees/`,
      };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['vehicleClass']} vehicleClass */
export function vehicleClassTool(kit, vehicleClass) {
  const { text, choice, whole, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'classify_vehicle',
    title: 'Vehicle classifier',
    description: 'Classifies one motor vehicle bought in 2025-26 or 2026-27 from manufacturer specifications for ITAA 1997 '
      + 's 995-1 (car test), car limit (s 40-230), GST credit cap (GST Act s 69-10) in AUD, luxury car tax thresholds '
      + '(LCT Act s 25-1, LCTD 2023/1 compliance approach) and FBT exemption category (FBTAA ss 8(2) and 47(6)) on the '
      + 'private use stated. Refuses unplated modifications and "other" bodies under 1 tonne. Does not compute decline in '
      + 'value, LCT payable or FBT taxable value.',
    inputSchema: record({
      incomeYear: choice([...VEHICLE_YEARS.keys()], 'Income year first held and used: "2025-26" or "2026-27".'),
      body: choice(['passenger', 'single-cab', 'dual-cab', 'van', 'other', 'motorcycle'], 'Vehicle body type.'),
      seats: whole(1, 99, 'Seating capacity, driver included.'),
      grossVehicleMassKg: whole(1, 100000, 'Gross vehicle mass on the compliance plate, in whole kilograms.'),
      kerbWeightKg: whole(0, 100000, 'Basic kerb weight in whole kilograms; 0 when omitted (kerbWeightKg or payloadKg is required).'),
      payloadKg: whole(0, 100000, 'Manufacturer stated payload in whole kilograms; 0 when omitted.'),
      accessoriesKg: whole(0, 100000, 'Accessories fitted at supply not in kerb weight, in whole kilograms; 0 when omitted.'),
      modified: choice(['no', 'plated', 'unplated'], 'Modified after manufacture: "no" (when omitted), "plated" (manufacturer figures known) or "unplated" (refused).'),
      price: text('amount', 'Price including GST before luxury car tax, in AUD (above zero), with at most 2 decimal places.'),
      gstCredit: choice(['full', 'none'], '"full" when a full GST credit is claimed, or "none".'),
      fuelConsumption: choice(['efficient', 'other'], '"efficient" for combined rating of 3.5 L/100 km or less, or "other".'),
      privateUse: choice(['limited', 'other'], '"limited" for work-related travel and minor, infrequent and irregular private use only, or "other".'),
    }, ['incomeYear', 'body', 'seats', 'grossVehicleMassKg', 'price', 'gstCredit', 'fuelConsumption', 'privateUse']),
    run({ incomeYear, body, seats, grossVehicleMassKg, kerbWeightKg = 0, payloadKg = 0, accessoriesKg = 0,
      modified = 'no', price, gstCredit, fuelConsumption, privateUse }) {
      const limits = /** @type {{carLimit: string, fuelEfficientThreshold: string, otherThreshold: string}} */ (
        VEHICLE_YEARS.get(incomeYear)
      );
      const r = vehicleClass({
        body, seats: String(seats), gvm: String(grossVehicleMassKg), kerb: String(kerbWeightKg),
        payload: String(payloadKg), accessories: String(accessoriesKg), modified, cost: price,
        credit: gstCredit, fuel: fuelConsumption, use: privateUse,
      }, limits);
      return {
        incomeYear, designedLoadKg: r.load, isCar: r.car, designedForPassengers: r.passengers,
        carLimitApplies: r.carLimit, carLimit: dollars(Number(limits.carLimit)),
        gstCreditCapApplies: r.capApplies, gstCreditCap: r.cap === null ? null : dollars(r.cap),
        gstCredit: r.credit === null ? null : dollars(r.credit),
        firstElementOfCost: r.cost === null ? null : dollars(r.cost),
        luxuryCarTaxStatus: r.luxury, luxuryCarTaxThreshold: dollars(r.threshold),
        amountOverThreshold: r.over === null ? null : dollars(r.over),
        fbtTreatment: r.fbt, fbtExemptOnStatedUse: r.exempt, belowLctThreshold: r.belowThreshold,
        currency: 'AUD', source: `${CALCULATORS}vehicle-class/`,
      };
    },
  });
}

/** @param {Record<string, any>} input */
function checkMarginSchemeInputs(input) {
  if ((input.part === undefined) !== (input.whole === undefined)) {
    throw new Error('Supply both part and whole, or omit both for a whole-property sale.');
  }
  const supplied = new Map(Object.entries(input));
  if (input.method === 'consideration') {
    const wrong = MARGIN_VALUATION_FIELDS.find((key) => supplied.get(key) !== undefined);
    if (wrong) throw new Error(`${wrong} applies only when method is "valuation".`);
  } else if (input.registrationAtTransition === 'yes'
    && (input.registrationEffectiveDay !== undefined || input.registrationApplicationDay !== undefined)) {
    throw new Error('registrationEffectiveDay and registrationApplicationDay apply only when registered after 1 July 2000.');
  }
}

/** @param {Record<string, any>} input @returns {import('./gst-margin-scheme.mjs').MarginSchemeInput} */
function marginSchemeInput({
  interest, taxable, agreedInWriting, acquired, buyerIsAssociate = false, method, price, priceBasis, cost,
  part = '1', whole = '1', valuationDay = '', registrationAtTransition = '', valuationProperty = '',
  registrationEffectiveDay = '', registrationApplicationDay = '',
}) {
  return {
    interest, taxable, agreed: agreedInWriting, acquired, associate: buyerIsAssociate, method, price,
    basis: priceBasis, cost, part, whole, valuationDay, registrationAtTransition, valuationProperty,
    registrationEffectiveDay, registrationApplicationDay,
  };
}

/** @param {ToolKit} kit @param {BusinessCalculators['gstMarginScheme']} gstMarginScheme */
export function gstMarginSchemeTool(kit, gstMarginScheme) {
  const { text, choice, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_gst_margin_scheme',
    title: 'GST margin scheme calculator',
    description: 'Eligibility under GST Act s 75-5 and GST in AUD on one taxable sale of real property under the margin scheme '
      + '(1/11 of the margin under s 75-10, or 1/10 of GST-exclusive price less cost under GSTR 2006/8 para 145) against GST '
      + 'on the whole price, with subdivision apportionment (s 75-15) and approved valuation date checks for property held '
      + 'since before 1 July 2000 (s 75-10(3)). Refuses non-taxable sales, sales to associates (s 75-13), s 75-11/s 75-22 '
      + 'acquisitions and items 2 to 4 valuation cases needing separate review.',
    inputSchema: record({
      interest: choice(['freehold', 'stratum', 'lease', 'other'], 'Interest sold: "freehold", "stratum", "lease" (at least 50 years) or "other".'),
      taxable: { type: 'boolean', description: 'true when the sale is a taxable supply; false refuses.' },
      agreedInWriting: { type: 'boolean', description: 'true when seller and buyer agreed in writing to use the margin scheme.' },
      acquired: choice(['margin', 'untaxed', 'before-2000', 'full-gst', 'special'],
        'How the seller acquired the property; "special" (ss 75-11/75-22) refuses.'),
      buyerIsAssociate: { type: 'boolean', description: 'true when the buyer is an associate (refused under s 75-13); false when omitted.' },
      method: choice(['consideration', 'valuation'], '"consideration" (price paid) or "valuation" (approved valuation for pre-1 July 2000 property).'),
      price: text('cost', 'Sale price in AUD with at most 2 decimal places.'),
      priceBasis: choice(['inclusive', 'exclusive'], '"inclusive" for GST-inclusive sale price, or "exclusive" for GST-exclusive.'),
      cost: text('cost', 'Acquisition consideration or approved valuation for the whole property, in AUD.'),
      part: text('cost', 'Subdivided sale: this lot\'s share measure (area, lots or anticipated price); omit with whole for a whole sale.'),
      whole: text('cost', 'Subdivided sale: total measure of the whole property; omit with part for a whole sale.'),
      valuationDay: text('date', 'Valuation method only: date the approved valuation applies to, as YYYY-MM-DD.'),
      registrationAtTransition: choice(['yes', 'applied-later', 'no-application'],
        'Valuation method only: GST registration status on 1 July 2000.'),
      valuationProperty: choice(['improved', 'unimproved', 'unimproved-government'],
        'Valuation method only: property improvements and supplier on 1 July 2000.'),
      registrationEffectiveDay: text('date', 'Valuation method with later registration only: date GST registration took effect, YYYY-MM-DD.'),
      registrationApplicationDay: text('date', 'Valuation method with applied-later only: date of GST registration application, YYYY-MM-DD.'),
    }, ['interest', 'taxable', 'agreedInWriting', 'acquired', 'method', 'price', 'priceBasis', 'cost']),
    run(input) {
      checkMarginSchemeInputs(input);
      const r = gstMarginScheme(marginSchemeInput(input));
      return {
        applies: r.applies, conditions: r.conditions,
        consideration: dollars(r.applies ? r.consideration : r.basicConsideration),
        acquisitionShare: dollars(r.share), margin: dollars(r.margin),
        marginSchemeGst: dollars(r.schemeGst), gstWithoutScheme: dollars(r.basicGst),
        gstSaving: dollars(r.saving), gstPayable: dollars(r.gst),
        currency: 'AUD', source: `${CALCULATORS}gst-margin-scheme/`,
      };
    },
  });
}

/**
 * Business Calculators Cohort A (14 tools), keyed by each form's `data-calculator` slug.
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'asicFee' | 'ASIC_FEES' | 'atoPenaltiesInterest' | 'ATO_PENALTY_YEARS'
 *   | 'businessUse' | 'fixedFee' | 'frankingAccount' | 'FRANKING_EVENTS' | 'gicPaymentPlan'
 *   | 'gstMarginScheme' | 'hourlyRate' | 'luxuryCarTax' | 'LCT_YEARS' | 'LCT_THRESHOLDS'
 *   | 'margin' | 'objectionDeadline' | 'variance' | 'vehicleClass' | 'wineEqualisationTax' | 'WET_YEARS'>} calculate
 */
export function businessCohortATools(kit, calculate) {
  return {
    'asic-fees': asicFeesTool(kit, calculate.asicFee, calculate.ASIC_FEES),
    'ato-penalties-interest': atoPenaltiesInterestTool(kit, calculate.atoPenaltiesInterest, calculate.ATO_PENALTY_YEARS),
    'business-use': businessUseTool(kit, calculate.businessUse),
    'fixed-fee': fixedFeeTool(kit, calculate.fixedFee),
    'franking-account': frankingAccountTool(kit, calculate.frankingAccount, calculate.FRANKING_EVENTS),
    'gic-payment-plan': gicPaymentPlanTool(kit, calculate.gicPaymentPlan),
    'gst-margin-scheme': gstMarginSchemeTool(kit, calculate.gstMarginScheme),
    hourly: hourlyTool(kit, calculate.hourlyRate),
    'luxury-car-tax': luxuryCarTaxTool(kit, calculate.luxuryCarTax, calculate.LCT_YEARS, calculate.LCT_THRESHOLDS),
    margin: marginTool(kit, calculate.margin),
    'objection-deadline': objectionDeadlineTool(kit, calculate.objectionDeadline),
    variance: varianceTool(kit, calculate.variance),
    'vehicle-class': vehicleClassTool(kit, calculate.vehicleClass),
    'wine-equalisation-tax': wineEqualisationTaxTool(kit, calculate.wineEqualisationTax, calculate.WET_YEARS),
  };
}
