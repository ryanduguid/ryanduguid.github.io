// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for Business Calculators Cohort D (the final 11 calculators):
// business days, Division 296 tax and redundancy/ETP withholding here, plus the 6 FBT
// tools from webmcp-business-d-fbt.mjs and webmcp-business-d-fbt2.mjs and land tax and
// transfer duty from webmcp-business-d-property.mjs. Imported by assets/webmcp-tools.mjs.

import { checkModeFields } from './webmcp-business-c-workforce.mjs';
import {
  fbtCarParkingTool, fbtCarTool, fbtLoanTool, fbtMealEntertainmentTool,
} from './webmcp-business-d-fbt.mjs';
import { fbtExpensePaymentTool, fbtPropertyTool } from './webmcp-business-d-fbt2.mjs';
import { landTaxTool, transferDutyTool } from './webmcp-business-d-property.mjs';

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

const ALL_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];
const EASTER_SAT_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'VIC'];
const EASTER_SUN_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'VIC', 'WA'];
const BOXING_DAY_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'VIC', 'WA'];
const JUNE_KING_STATES = ['ACT', 'NSW', 'NT', 'SA', 'TAS', 'VIC'];
const MARCH_HOLIDAY_STATES = ['ACT', 'SA', 'TAS', 'VIC'];
const OCT_HOLIDAY_STATES = ['ACT', 'NSW', 'QLD', 'SA'];

/**
 * Confirmed 2026-2027 full-day public holidays, mirrored 1:1 from
 * `_data/payday_super_business_days.json` (verified by parity test).
 * @type {import('./business-days.mjs').Holiday[]}
 */
export const CONFIRMED_HOLIDAYS = /** @type {[string, string, string[]][]} */ ([
  ['2026-01-01', "New Year's Day", ALL_STATES],
  ['2026-01-26', 'Australia Day', ALL_STATES],
  ['2026-03-02', 'Labour Day', ['WA']],
  ['2026-03-09', 'Adelaide Cup Day; Canberra Day; Eight Hours Day; Labour Day', MARCH_HOLIDAY_STATES],
  ['2026-04-03', 'Good Friday', ALL_STATES],
  ['2026-04-04', 'Easter Saturday', EASTER_SAT_STATES],
  ['2026-04-05', 'Easter Sunday', EASTER_SUN_STATES],
  ['2026-04-06', 'Easter Monday', ALL_STATES],
  ['2026-04-25', 'ANZAC Day', ALL_STATES],
  ['2026-04-27', 'ANZAC Day (observed)', ['ACT', 'NSW', 'WA']],
  ['2026-05-04', 'Labour Day; May Day', ['NT', 'QLD']],
  ['2026-06-01', 'Reconciliation Day; Western Australia Day', ['ACT', 'WA']],
  ['2026-06-08', "King's Birthday", JUNE_KING_STATES],
  ['2026-08-03', 'Picnic Day', ['NT']],
  ['2026-09-25', 'Friday before the AFL Grand Final', ['VIC']],
  ['2026-10-05', "King's Birthday; Labour Day", OCT_HOLIDAY_STATES],
  ['2026-12-25', 'Christmas Day', ALL_STATES],
  ['2026-12-26', 'Boxing Day; Proclamation Day', BOXING_DAY_STATES],
  ['2026-12-28', 'Boxing Day; Boxing Day (observed); Proclamation Day (observed)', ALL_STATES],
  ['2027-01-01', "New Year's Day", ALL_STATES],
  ['2027-01-26', 'Australia Day', ALL_STATES],
  ['2027-03-01', 'Labour Day', ['WA']],
  ['2027-03-08', 'Adelaide Cup Day; Canberra Day; Eight Hours Day; Labour Day', MARCH_HOLIDAY_STATES],
  ['2027-03-26', 'Good Friday', ALL_STATES],
  ['2027-03-27', 'Easter Saturday', EASTER_SAT_STATES],
  ['2027-03-28', 'Easter Sunday', ALL_STATES],
  ['2027-03-29', 'Easter Monday', ALL_STATES],
  ['2027-04-25', 'ANZAC Day', ['NSW', 'SA', 'TAS', 'VIC', 'WA']],
  ['2027-04-26', 'ANZAC Day; ANZAC Day (observed)', ['ACT', 'NSW', 'NT', 'QLD', 'WA']],
  ['2027-05-03', 'Labour Day; May Day', ['NT', 'QLD']],
  ['2027-05-31', 'Reconciliation Day', ['ACT']],
  ['2027-06-07', 'Western Australia Day', ['WA']],
  ['2027-06-14', "King's Birthday", JUNE_KING_STATES],
  ['2027-08-02', 'Picnic Day', ['NT']],
  ['2027-10-01', 'Friday before the AFL Grand Final', ['VIC']],
  ['2027-10-04', "King's Birthday; Labour Day", OCT_HOLIDAY_STATES],
  ['2027-12-25', 'Christmas Day', ALL_STATES],
  ['2027-12-26', 'Boxing Day; Proclamation Day', BOXING_DAY_STATES],
  ['2027-12-27', 'Christmas Day (observed)', ALL_STATES],
  ['2027-12-28', 'Boxing Day; Boxing Day (observed); Proclamation Day (observed)', ALL_STATES],
]).map(([date, name, jurisdictions]) => ({ date, name, jurisdictions }));

/** Form `data-*` parameters from `_includes/calculators/division-296.html`. */
export const DIVISION_296_YEAR = {
  largeThreshold: '3000000', veryLargeThreshold: '10000000', rate: '15', veryLargeRate: '10',
};

/** Form `data-*` parameters from `_includes/calculators/termination-payment.html`. */
export const ETP_YEAR = {
  yearEnd: '2027-06-30', etpCap: '270000', wholeOfIncomeCap: '180000',
  baseAmount: '13598', serviceAmount: '6801', rateUnder: '32', rateReached: '17', rateAbove: '47',
};

const BD_COMMON = new Set(['mode', 'place', 'startDate']);
const BD_ALLOWED = new Map([
  ['count', new Set(['endDate'])],
  ['add', new Set(['businessDays'])],
  ['subtract', new Set(['businessDays'])],
]);
const BD_REQUIRED = new Map([
  ['count', ['endDate']],
  ['add', ['businessDays']],
  ['subtract', ['businessDays']],
]);

/** @param {ToolKit} kit @param {BusinessCalculators['businessDays']} businessDays */
export function businessDaysTool(kit, businessDays) {
  const { text, choice, whole, record, tool, CALCULATORS } = kit;
  return tool({
    name: 'calculate_business_days',
    title: 'Australian business days calculator',
    description: 'Count business days after a start date up to and including an end date, or find the date a whole '
      + 'number of business days after or before a start date (no AUD amount), skipping weekends and confirmed '
      + 'full-day public holidays in 2026 and 2027 for one Australian state or territory (including Melbourne Cup '
      + 'Day for Victoria and WA King\'s Birthday for WA) or "any" state or territory (matching the Payday Super '
      + 'business days table). Refuses dates outside 2026-01-01 to 2027-12-31, invalid calendar dates and '
      + 'mismatched mode fields. Part-day and regional holidays count as business days.',
    inputSchema: record({
      mode: choice(['count', 'add', 'subtract'], '"count" (business days between 2 dates), "add" (date N business days after startDate) or "subtract" (date N business days before startDate).'),
      place: choice([...ALL_STATES, 'any'], 'Australian state or territory code ("ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA") or "any".'),
      startDate: text('date', 'Start date as YYYY-MM-DD, from 2026-01-01 to 2027-12-31.'),
      endDate: text('date', 'Count mode only: end date as YYYY-MM-DD, from 2026-01-01 to 2027-12-31 (not before startDate).'),
      businessDays: whole(1, 500, 'Add or subtract mode only: whole number of business days to move (1 to 500).'),
    }, ['mode', 'place', 'startDate']),
    run(input) {
      checkModeFields(input, input.mode, BD_ALLOWED, BD_REQUIRED, BD_COMMON);
      const { mode, place, startDate, endDate = '', businessDays: count } = input;
      const r = businessDays(
        { mode, place, start: startDate, end: endDate, count: count === undefined ? '' : String(count) },
        CONFIRMED_HOLIDAYS,
      );
      return {
        mode,
        place,
        startDate,
        ...(mode === 'count' ? { endDate } : {}),
        businessDays: r.days,
        resultDate: r.date,
        skippedHolidays: r.skipped,
        coverage: { from: '2026-01-01', until: '2027-12-31' },
        source: `${CALCULATORS}business-days/`,
      };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['division296']} division296 */
export function division296Tool(kit, division296) {
  const { text, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_division_296_tax',
    title: 'Division 296 tax calculator',
    description: 'One individual\'s Division 296 tax in AUD for 2026-27 under ITAA 1997 ss 296-15 to 296-50, '
      + 'IT(TP)A 1997 s 296-1 and the Superannuation (Building a Stronger and Fairer Super System) Imposition Act '
      + '2026 s 5: 15% on taxable superannuation earnings (share of 30 June 2027 total superannuation balance above '
      + '$3,000,000) plus 10% on the very large superannuation balance earnings component (share above $10,000,000), '
      + 'checking the child income stream recipient (s 296-20), structured settlement (s 296-25) and death by '
      + '30 June 2027 (ITTPA s 296-1(3)) exceptions. Covers 2026-27 only and does not compute balances, fund '
      + 'earnings attribution or defined benefit debt accounts.',
    inputSchema: record({
      totalSuperBalance: text('cost', 'Total superannuation balance at 30 June 2027 excluding any LRBA amount, in AUD (0 to 1,000,000,000).'),
      totalSuperEarnings: text('signedCost', 'Total superannuation earnings for 2026-27 (may be negative), in AUD (-1,000,000,000 to 1,000,000,000).'),
      childIncomeStreamRecipient: { type: 'boolean', description: 'true if a child recipient of a superannuation income stream at any time in 2026-27 (s 296-20); false when omitted.' },
      structuredSettlementContribution: { type: 'boolean', description: 'true if a structured settlement contribution was made in 2026-27 or earlier (s 296-25); false when omitted.' },
      diedBy30June2027: { type: 'boolean', description: 'true if the person died on or before 30 June 2027 (ITTPA s 296-1(3)); false when omitted.' },
    }, ['totalSuperBalance', 'totalSuperEarnings']),
    run({
      totalSuperBalance, totalSuperEarnings,
      childIncomeStreamRecipient = false, structuredSettlementContribution = false, diedBy30June2027 = false,
    }) {
      const r = division296({
        balance: totalSuperBalance,
        earnings: totalSuperEarnings,
        child: childIncomeStreamRecipient,
        settlement: structuredSettlementContribution,
        died: diedBy30June2027,
      }, DIVISION_296_YEAR);
      return {
        incomeYear: '2026-27',
        liability: r.liability,
        liable: r.liability === 'liable' || r.liability === 'rounds-to-nil',
        shareAboveLargeThresholdPercent: r.percentage.toFixed(2),
        shareAboveVeryLargeThresholdPercent: r.veryLargePercentage.toFixed(2),
        taxableSuperEarnings: dollars(r.taxable),
        veryLargeEarningsComponent: dollars(r.component),
        taxAt15Percent: dollars(r.tax),
        taxAt10Percent: dollars(r.veryLargeTax),
        division296Tax: dollars(r.total),
        thresholds: { large: '3000000.00', veryLarge: '10000000.00' },
        currency: 'AUD',
        source: `${CALCULATORS}division-296/`,
      };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['terminationPayment']} terminationPayment */
export function terminationPaymentTool(kit, terminationPayment) {
  const { text, whole, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_termination_payment',
    title: 'Redundancy and ETP withholding calculator',
    description: 'Tax-free genuine redundancy or early retirement scheme limit ($13,598 + $6,801 per completed year '
      + 'of service, ITAA 1997 s 83-170) and PAYG withholding in AUD under ATO Schedule 11 (2026-27) for one life '
      + 'benefit employment termination payment (ETP) to an employee who supplied their TFN: code R (excluded) part '
      + 'against the $270,000 ETP cap first, then code O (non-excluded) part against the smaller of the remaining '
      + 'ETP cap and the $180,000 whole-of-income cap less other taxable payments, at 17% (preservation age on '
      + '30 June 2027) or 32% within each cap and 47% above. Refuses invalid dates of birth outside 1900 to '
      + '2027-06-30. Does not cover death benefit ETPs, no-TFN payees, foreign residents or unused leave (Schedule 7).',
    inputSchema: record({
      genuineRedundancyPayment: text('cost', 'Genuine redundancy or early retirement scheme payment before its tax-free part, in AUD; "0" when omitted.'),
      completedYearsOfService: whole(0, 150, 'Completed years of service (0 to 150); 0 when omitted.'),
      otherCodeRTaxableComponent: text('cost', 'Other code R (excluded) ETP taxable component in AUD; "0" when omitted.'),
      codeOTaxableComponent: text('cost', 'Code O (non-excluded) ETP taxable component in AUD; "0" when omitted.'),
      otherTaxablePayments: text('cost', 'Other taxable payments made to the employee in 2026-27 excluding the ETP, in AUD; "0" when omitted.'),
      dateOfBirth: text('date', 'Employee date of birth as YYYY-MM-DD, from 1900-01-01 to 2027-06-30.'),
    }, ['dateOfBirth']),
    run({
      genuineRedundancyPayment = '0', completedYearsOfService = 0, otherCodeRTaxableComponent = '0',
      codeOTaxableComponent = '0', otherTaxablePayments = '0', dateOfBirth,
    }) {
      const r = terminationPayment({
        redundancy: genuineRedundancyPayment,
        years: String(completedYearsOfService),
        excluded: otherCodeRTaxableComponent,
        nonExcluded: codeOTaxableComponent,
        other: otherTaxablePayments,
        born: dateOfBirth,
      }, ETP_YEAR);
      return {
        incomeYear: '2026-27',
        reachedPreservationAge: r.reached,
        rateWithinCapPercent: r.rate,
        rateAboveCapPercent: Number(ETP_YEAR.rateAbove),
        taxFreeLimit: dollars(r.taxFreeLimit),
        taxFreeRedundancyPart: dollars(r.taxFree),
        codeRTaxableComponent: dollars(r.excluded),
        codeRWithholding: dollars(r.excludedWithholding),
        wholeOfIncomeCapRemaining: dollars(r.wholeOfIncomeCap),
        codeOCap: dollars(r.cap),
        codeOWithholding: dollars(r.nonExcludedWithholding),
        totalWithholding: dollars(r.withholding),
        currency: 'AUD',
        source: `${CALCULATORS}termination-payment/`,
      };
    },
  });
}

/**
 * Business Calculators Cohort D (the final 11 tools), keyed by each form's `data-calculator` slug.
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'businessDays' | 'division296' | 'fbtCar' | 'fbtEvExemption'
 *   | 'fbtCarParking' | 'fbtExpensePayment' | 'fbtLoan' | 'fbtMealEntertainment' | 'fbtProperty'
 *   | 'landTaxYear' | 'terminationPayment' | 'transferDuty' | 'firstHomeDuty'>} calculate
 */
export function businessCohortDTools(kit, calculate) {
  return {
    'business-days': businessDaysTool(kit, calculate.businessDays),
    'division-296': division296Tool(kit, calculate.division296),
    'fbt-car': fbtCarTool(kit, calculate),
    'fbt-car-parking': fbtCarParkingTool(kit, calculate.fbtCarParking),
    'fbt-expense-payment': fbtExpensePaymentTool(kit, calculate.fbtExpensePayment),
    'fbt-loan': fbtLoanTool(kit, calculate.fbtLoan),
    'fbt-meal-entertainment': fbtMealEntertainmentTool(kit, calculate.fbtMealEntertainment),
    'fbt-property': fbtPropertyTool(kit, calculate.fbtProperty),
    'land-tax': landTaxTool(kit, calculate.landTaxYear),
    'termination-payment': terminationPaymentTool(kit, calculate.terminationPayment),
    'transfer-duty': transferDutyTool(kit, calculate),
  };
}
