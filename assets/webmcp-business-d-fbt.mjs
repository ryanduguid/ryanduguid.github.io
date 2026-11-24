// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for Business Calculators Cohort D FBT calculators:
// FBT car (with s 8A EV exemption), FBT car parking, FBT loan and FBT meal
// entertainment. Statutory 2026-27 FBT year parameters match the form data-*
// attributes in _includes/calculators/fbt-*.html (verified by parity tests).
// Imported by assets/webmcp-business-d.mjs.

import { checkModeFields, requireWhen } from './webmcp-business-c-workforce.mjs';

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

/** Form `data-*` parameters from `_includes/calculators/fbt-car.html`. */
export const FBT_CAR_YEAR = {
  days: '365', fbtRate: '47', ended: '2027', type1GrossUp: '2.0802', type2GrossUp: '1.8868',
};
/** Form `data-*` parameters from `_includes/calculators/fbt-car-parking.html`. */
export const FBT_PARKING_YEAR = { threshold: '11.48', days: '365', ended: '2027' };
/** Form `data-*` parameters from `_includes/calculators/fbt-loan.html`. */
export const FBT_LOAN_YEAR = { days: '365', rate: '8.27' };
/** Form `data-*` parameters from `_includes/calculators/fbt-meal-entertainment.html`. */
export const FBT_MEAL_YEAR = { ended: '2027' };

const PARKING_COMMON = new Set(['method', 'firstBusinessDayFee']);
const PARKING_ALLOWED = new Map([
  ['station', new Set(['benefits', 'feePerBenefit', 'employeeContribution'])],
  ['market', new Set(['benefits', 'feePerBenefit', 'employeeContribution'])],
  ['average', new Set(['benefits', 'firstDayFee', 'lastDayFee', 'employeeContribution'])],
  ['register', new Set(['registerValue', 'availabilityDays', 'registerFirstValidYear'])],
  ['spaces', new Set([
    'dailyRate', 'availabilityDays', 'spaces', 'employeesStart', 'employeesEnd',
    'spacesStart', 'spacesEnd', 'employeeContribution',
  ])],
]);
const PARKING_REQUIRED = new Map([
  ['station', ['benefits', 'feePerBenefit']],
  ['market', ['benefits', 'feePerBenefit']],
  ['average', ['benefits', 'firstDayFee', 'lastDayFee']],
  ['register', ['registerValue', 'availabilityDays', 'registerFirstValidYear']],
  ['spaces', ['dailyRate', 'availabilityDays', 'spaces', 'employeesStart', 'employeesEnd', 'spacesStart', 'spacesEnd']],
]);

const MEAL_COMMON = new Set(['method', 'expenses']);
const MEAL_ALLOWED = new Map([
  ['split', new Set()],
  ['register', new Set(['registerBenefits', 'registerTotal', 'registerFirstValidYear', 'earlierYearExpenses'])],
]);
const MEAL_REQUIRED = new Map([
  ['split', []],
  ['register', ['registerBenefits', 'registerTotal', 'registerFirstValidYear']],
]);

/**
 * Validates and builds the electric car exemption payload when `vehicleKind` is an EV or PHEV.
 * @param {'battery' | 'fuel-cell' | 'plug-in-hybrid'} vehicleKind
 * @param {Record<string, any>} ev
 * @returns {import('./fbt-ev-exemption.mjs').EvFacts}
 */
function buildEvFacts(vehicleKind, ev) {
  const isHybrid = vehicleKind === 'plug-in-hybrid';
  requireWhen(isHybrid, ev.hybridCommittedBefore1April2025, 'hybridCommittedBefore1April2025', 'when vehicleKind is "plug-in-hybrid"');
  requireWhen(isHybrid, ev.hybridNewCommitmentFrom1April2025, 'hybridNewCommitmentFrom1April2025', 'when vehicleKind is "plug-in-hybrid"');
  requireWhen(isHybrid, ev.hybridExemptBefore1April2025, 'hybridExemptBefore1April2025', 'when vehicleKind is "plug-in-hybrid"');
  return {
    vehicle: vehicleKind,
    currentEmployee: ev.currentEmployee,
    firstUsed: ev.firstHeldAndUsed,
    firstSale: ev.firstRetailSale,
    lctValue: ev.lctValue,
    otherSupply: ev.lctOnOtherSupply,
    ...(isHybrid ? {
      hybrid: {
        committed: ev.hybridCommittedBefore1April2025,
        newCommitment: ev.hybridNewCommitmentFrom1April2025,
        exemptBefore: ev.hybridExemptBefore1April2025,
      },
    } : {}),
  };
}

/**
 * Formats an fbtCar result (with optional s 8A EV exemption verdict) cleanly.
 * @param {ReturnType<BusinessCalculators['fbtCar']>} r
 * @param {import('./fbt-ev-exemption.mjs').EvExemption | null} ev
 * @param {{method: string, operating: boolean, gstCreditEntitled: boolean, grossUp: string}} meta
 * @param {(value: number) => string} dollars
 * @param {string} source
 */
function formatCarResult(r, ev, meta, dollars, source) {
  const exempt = ev !== null && ev.exempt === true;
  const evBlock = ev === null ? null : {
    exempt: ev.exempt,
    saleYear: ev.saleYear,
    fuelEfficientThreshold: ev.threshold === null ? null : dollars(ev.threshold),
    conditions: ev.conditions,
  };
  return {
    fbtYearEnding: '2027-03-31',
    method: meta.method,
    grossUpType: meta.gstCreditEntitled ? 1 : 2,
    grossUpRate: meta.grossUp,
    fbtRatePercent: FBT_CAR_YEAR.fbtRate,
    baseValue: dollars(r.baseValue),
    statutoryTaxableValue: dollars(r.statutory),
    operatingTaxableValue: r.operating === null ? null : dollars(r.operating),
    statutoryLowerApplied: meta.operating && r.operating !== null && r.statutory < r.operating,
    taxableValueBeforeExemption: exempt ? dollars(r.taxableValue) : null,
    taxableValue: dollars(exempt ? 0 : r.taxableValue),
    grossedUpTaxableValue: dollars(exempt ? 0 : r.grossedUp),
    fbt: dollars(exempt ? 0 : r.fbt),
    evExemption: evBlock,
    currency: 'AUD',
    source,
  };
}

/**
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'fbtCar' | 'fbtEvExemption'>} calculate
 */
export function fbtCarTool(kit, calculate) {
  const { text, choice, whole, record, tool, dollars, CALCULATORS } = kit;
  const evSchema = record({
    currentEmployee: { type: 'boolean', description: 'true when provided to a current employee or their associate (s 8A(1)(a)).' },
    firstHeldAndUsed: text('date', 'First day the car was both held and used (or available for use) by anyone, YYYY-MM-DD (on or before 2027-03-31).'),
    firstRetailSale: text('date', 'Date of the car\'s first retail sale, YYYY-MM-DD (from 2012-07-01).'),
    lctValue: text('cost', 'Luxury car tax value at the first retail sale including GST, in AUD.'),
    lctOnOtherSupply: { type: 'boolean', description: 'true if luxury car tax became payable on another supply or importation before the benefit.' },
    hybridCommittedBefore1April2025: { type: 'boolean', description: 'Plug-in hybrid only: true if committed before 1 April 2025 for a period beginning before then and including this year.' },
    hybridNewCommitmentFrom1April2025: { type: 'boolean', description: 'Plug-in hybrid only: true if a new commitment was made from 1 April 2025 for a period including this year.' },
    hybridExemptBefore1April2025: { type: 'boolean', description: 'Plug-in hybrid only: true if an exempt car benefit arose with the car before 1 April 2025.' },
  }, ['currentEmployee', 'firstHeldAndUsed', 'firstRetailSale', 'lctValue', 'lctOnOtherSupply']);
  return tool({
    name: 'calculate_fbt_car',
    title: 'FBT car calculator',
    description: 'Taxable value, grossed-up taxable value and 47% FBT in AUD for one car in the FBT year ending '
      + '31 March 2027 (365 days), by the statutory formula (s 9 FBTAA 1986, 20% flat rate with one-third base '
      + 'value reduction when first held before 1 April 2022) or operating cost method (s 10, falling back to '
      + 'statutory formula when lower under s 10(5)), using Type 1 (2.0802) or Type 2 (1.8868) gross-up. Checks '
      + 'the s 8A electric cars exemption condition by condition for battery electric, fuel-cell and transitional '
      + 'plug-in hybrid cars (returning nil taxable value and FBT whilst reporting pre-exemption taxable value '
      + 'under s 135P(3) when exempt). Refuses mismatched operating-cost or electric-car fields.',
    inputSchema: record({
      method: choice(['statutory', 'operating'], '"statutory" (statutory formula, s 9) or "operating" (operating cost method, s 10).'),
      costPrice: text('cost', 'Cost price including GST, dealer delivery and accessories fitted at purchase, in AUD.'),
      laterAccessories: text('cost', 'Non-business accessories fitted later in AUD; "0" when omitted.'),
      heldBefore1April2022: { type: 'boolean', description: 'true when first held by the employer or an associate before 1 April 2022 (reduces cost price to two-thirds under s 9(2)(a)); false when omitted.' },
      daysAvailable: whole(0, 365, 'Days in the FBT year ending 31 March 2027 (0 to 365) used or available for private use.'),
      operatingCosts: text('cost', 'Operating cost method only: total operating costs for the year in AUD (above zero).'),
      businessUsePercent: text('percent', 'Operating cost method only: log-book business use percentage (0 to 100).'),
      employeeContribution: text('cost', 'Employee contributions for the year in AUD; "0" when omitted.'),
      gstCreditEntitled: { type: 'boolean', description: 'true for Type 1 gross-up (2.0802, GST credit available); false for Type 2 gross-up (1.8868).' },
      vehicleKind: choice(['other', 'battery', 'fuel-cell', 'plug-in-hybrid'], 'Kind of car; "other" when omitted.'),
      electricCar: evSchema,
    }, ['method', 'costPrice', 'daysAvailable', 'gstCreditEntitled']),
    run(input) {
      const {
        method, costPrice, laterAccessories = '0', heldBefore1April2022 = false, daysAvailable,
        operatingCosts, businessUsePercent, employeeContribution = '0', gstCreditEntitled,
        vehicleKind = 'other', electricCar,
      } = input;
      const operating = method === 'operating';
      requireWhen(operating, operatingCosts, 'operatingCosts', 'when method is "operating"');
      requireWhen(operating, businessUsePercent, 'businessUsePercent', 'when method is "operating"');
      const isEv = vehicleKind !== 'other';
      requireWhen(isEv, electricCar, 'electricCar', 'when vehicleKind is an electric or plug-in hybrid car');
      const grossUp = gstCreditEntitled ? FBT_CAR_YEAR.type1GrossUp : FBT_CAR_YEAR.type2GrossUp;
      const r = calculate.fbtCar(
        {
          method, cost: costPrice, accessories: laterAccessories, reduced: heldBefore1April2022,
          days: String(daysAvailable), costs: operatingCosts ?? '0', businessUse: businessUsePercent ?? '0',
          contribution: employeeContribution,
        },
        { days: FBT_CAR_YEAR.days, grossUp, fbtRate: FBT_CAR_YEAR.fbtRate },
      );
      const ev = isEv ? calculate.fbtEvExemption(buildEvFacts(vehicleKind, electricCar), { ended: FBT_CAR_YEAR.ended }) : null;
      return formatCarResult(r, ev, { method, operating, gstCreditEntitled, grossUp }, dollars, `${CALCULATORS}fbt-car/`);
    },
  });
}

/**
 * Formats an fbtCarParking result cleanly without optional-branch complexity bloat.
 * @param {import('./fbt-benefits.mjs').ParkingValue & {benefit: boolean}} r
 * @param {string} method
 * @param {(value: number) => string} dollars
 * @param {string} source
 */
function formatParkingResult(r, method, dollars, source) {
  return {
    fbtYearEnding: '2027-03-31',
    method,
    threshold: FBT_PARKING_YEAR.threshold,
    benefitArises: r.benefit,
    grossTaxableValue: dollars(r.gross),
    ...(r.average === undefined ? {} : { averageCostPerBenefit: dollars(r.average) }),
    ...(r.annual === undefined ? {} : { annualisedRegisterValue: dollars(r.annual) }),
    ...(r.statutoryBenefit === undefined ? {} : {
      totalStatutoryBenefit: dollars(r.statutoryBenefit),
      averageEmployees: r.averageEmployees,
      averageEligibleSpaces: r.averageSpaces,
    }),
    ...(r.contributionApplied === undefined ? {} : {
      contributionApplied: dollars(r.contributionApplied),
      excessContribution: dollars(r.excess ?? 0),
    }),
    taxableValue: dollars(r.taxableValue),
    currency: 'AUD',
    source,
  };
}

/** @param {ToolKit} kit @param {BusinessCalculators['fbtCarParking']} fbtCarParking */
export function fbtCarParkingTool(kit, fbtCarParking) {
  const { text, choice, whole, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_fbt_car_parking',
    title: 'FBT car parking calculator',
    description: 'Car parking fringe benefits threshold test ($11.48 on 1 April 2026, s 39A(1)(a)(iii)) and taxable '
      + 'value in AUD for one work car park in the FBT year ending 31 March 2027 (365 days), by any of the 5 '
      + 'Division 10A methods: commercial parking station (s 39C), market value (s 39D), average cost (s 39DA), '
      + '12-week register (s 39GB, valid up to 5 years from 2023 to 2027) or spaces (ss 39FA-39FB). Refuses fields '
      + 'belonging to another method and spaces calculations when the first business day fee does not exceed the '
      + 'threshold. Stops at taxable value without gross-up, FBT or exemptions such as s 58GA.',
    inputSchema: record({
      method: choice(['station', 'market', 'average', 'register', 'spaces'], 'Car parking valuation method under Division 10A.'),
      firstBusinessDayFee: text('cost', 'Highest of the lowest all-day fees of commercial parking stations within 1 km on 1 April 2026, in AUD.'),
      benefits: whole(0, 1000000, 'Station, market or average method: number of car parking benefits.'),
      feePerBenefit: text('cost', 'Station or market method: lowest all-day fee on the day or qualified valuer arm\'s length amount per benefit, in AUD.'),
      firstDayFee: text('cost', 'Average cost method: lowest all-day fee on the year\'s first day with a benefit, in AUD.'),
      lastDayFee: text('cost', 'Average cost method: lowest all-day fee on the year\'s last day with a benefit, in AUD.'),
      registerValue: text('cost', '12-week register method: total value of benefits in the register as if kept this year, net of employee contributions, in AUD.'),
      availabilityDays: whole(0, 365, 'Register (0 to 365) or spaces (1 to 365): days in the car parking availability period.'),
      registerFirstValidYear: whole(2023, 2027, '12-week register method: FBT year ending 31 March the register was first valid for (2023 to 2027).'),
      dailyRate: text('cost', 'Spaces method: daily rate amount of each space before contributions, in AUD.'),
      spaces: whole(1, 1000000, 'Spaces method: number of eligible spaces sharing this rate and availability period.'),
      employeesStart: whole(0, 1000000, 'Spaces method: employees covered by the election at the start of the parking period.'),
      employeesEnd: whole(0, 1000000, 'Spaces method: employees covered by the election at the end of the parking period.'),
      spacesStart: whole(0, 1000000, 'Spaces method: eligible spaces at the start of the parking period.'),
      spacesEnd: whole(0, 1000000, 'Spaces method: eligible spaces at the end of the parking period.'),
      employeeContribution: text('cost', 'Every method except register: total employee contributions in AUD; "0" when omitted.'),
    }, ['method', 'firstBusinessDayFee']),
    run(input) {
      checkModeFields(input, input.method, PARKING_ALLOWED, PARKING_REQUIRED, PARKING_COMMON);
      const {
        method, firstBusinessDayFee, benefits = 0, feePerBenefit = '0', firstDayFee = '0', lastDayFee = '0',
        registerValue = '0', availabilityDays = 0, registerFirstValidYear = 2027, dailyRate = '0', spaces = 1,
        employeesStart = 0, employeesEnd = 0, spacesStart = 0, spacesEnd = 0, employeeContribution = '0',
      } = input;
      const r = fbtCarParking({
        method, fee: firstBusinessDayFee, benefits: String(benefits), each: feePerBenefit,
        firstFee: firstDayFee, lastFee: lastDayFee, registerValue, days: String(availabilityDays),
        firstYear: String(registerFirstValidYear), rate: dailyRate, spaceDays: String(availabilityDays),
        spaces: String(spaces), employeesStart: String(employeesStart), employeesEnd: String(employeesEnd),
        spacesStart: String(spacesStart), spacesEnd: String(spacesEnd), contribution: employeeContribution,
      }, FBT_PARKING_YEAR);
      return formatParkingResult(r, method, dollars, `${CALCULATORS}fbt-car-parking/`);
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['fbtLoan']} fbtLoan */
export function fbtLoanTool(kit, fbtLoan) {
  const { text, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_fbt_loan',
    title: 'FBT loan calculator',
    description: 'Taxable value in AUD of one loan fringe benefit for the FBT year ending 31 March 2027 (365 days) '
      + 'at the ATO statutory interest rate of 8.27% under Division 4 of the Fringe Benefits Tax Assessment Act '
      + '1986: notional interest on the sum of daily loan balances (s 18) less interest accrued, reduced by the '
      + 'otherwise deductible rule (s 19, never below nil). Refuses deductions exceeding accrued interest. Stops '
      + 'at taxable value without Type 2 gross-up or FBT, and does not cover s 17 exemptions, pre-1986 loans or '
      + 'car substantiation rules.',
    inputSchema: record({
      totalDailyBalances: text('trillionCost', 'Sum of daily loan balances for the days owed in the FBT year ending 31 March 2027, in AUD (up to 1,000,000,000,000).'),
      interestAccrued: text('cost', 'Interest that accrued on the loan for the FBT year in AUD; "0" when omitted.'),
      incomeUsePercent: text('percent', 'Share of the loan used to produce the employee\'s assessable income (0 to 100%); "0" when omitted.'),
      deductionForAccruedInterest: text('cost', 'Deduction the employee could claim for the interest that accrued in AUD (no more than interestAccrued); "0" when omitted.'),
    }, ['totalDailyBalances']),
    run({ totalDailyBalances, interestAccrued = '0', incomeUsePercent = '0', deductionForAccruedInterest = '0' }) {
      const r = fbtLoan({
        balances: totalDailyBalances, accrued: interestAccrued,
        incomeUse: incomeUsePercent, deduction: deductionForAccruedInterest,
      }, FBT_LOAN_YEAR);
      return {
        fbtYearEnding: '2027-03-31',
        statutoryInterestRatePercent: FBT_LOAN_YEAR.rate,
        notionalInterest: dollars(r.notional),
        grossTaxableValue: dollars(r.gross),
        grossDeduction: dollars(r.grossDeduction),
        notionalDeduction: dollars(r.notionalDeduction),
        reductionApplied: dollars(r.reduction),
        taxableValue: dollars(r.taxableValue),
        currency: 'AUD',
        source: `${CALCULATORS}fbt-loan/`,
      };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['fbtMealEntertainment']} fbtMealEntertainment */
export function fbtMealEntertainmentTool(kit, fbtMealEntertainment) {
  const { text, choice, whole, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_fbt_meal_entertainment',
    title: 'FBT meal entertainment calculator',
    description: 'Total taxable value in AUD of Division 9A meal entertainment fringe benefits for the FBT year '
      + 'ending 31 March 2027 under the 50/50 split method (s 37BA) or the 12-week register method (s 37CB, '
      + 'checking 5-year validity under s 37CD(1) and the 20% expense-increase invalidation rule under s 37CD(3) '
      + 'against earlier years\' expenses, and returning the 50/50 split figure alongside). Refuses mismatched '
      + 'method fields, expired or invalidated registers and registers whose first valid year had nil expenses. '
      + 'Stops at taxable value without gross-up or FBT, and excludes salary-packaged meal entertainment.',
    inputSchema: record({
      method: choice(['split', 'register'], '"split" (50/50 split method, s 37BA) or "register" (12-week register method, s 37CB).'),
      expenses: text('cost', 'Total meal entertainment expenses for the year for all recipients, less unreimbursed employee/associate contributions, in AUD.'),
      registerBenefits: text('cost', '12-week register method: value of meal entertainment fringe benefits recorded in the register, in AUD.'),
      registerTotal: text('cost', '12-week register method: value of all meal entertainment recorded in the register, in AUD (above zero and >= registerBenefits).'),
      registerFirstValidYear: whole(2023, 2027, '12-week register method: FBT year ending 31 March the register was first valid for (2023 to 2027).'),
      earlierYearExpenses: {
        type: 'array',
        maxItems: 4,
        items: text('cost', 'Meal entertainment expenses in AUD for an earlier FBT year.'),
        description: '12-week register method: expenses for each FBT year from registerFirstValidYear to 2026 inclusive, oldest first (empty or omitted when registerFirstValidYear is 2027).',
      },
    }, ['method', 'expenses']),
    run(input) {
      checkModeFields(input, input.method, MEAL_ALLOWED, MEAL_REQUIRED, MEAL_COMMON);
      const {
        method, expenses, registerBenefits = '0', registerTotal = '0',
        registerFirstValidYear = 2027, earlierYearExpenses = [],
      } = input;
      const r = fbtMealEntertainment({
        method, expenses, registerBenefits, registerTotal,
        firstYear: String(registerFirstValidYear), earlier: earlierYearExpenses,
      }, FBT_MEAL_YEAR);
      const splitComparison = method === 'register'
        ? dollars(fbtMealEntertainment({
          method: 'split', expenses, registerBenefits: '0', registerTotal: '0', firstYear: '2027', earlier: [],
        }, FBT_MEAL_YEAR).taxableValue)
        : null;
      return {
        fbtYearEnding: '2027-03-31',
        method,
        ...(r.registerPercent === undefined ? {} : { registerPercent: r.registerPercent.toFixed(2) }),
        taxableValue: dollars(r.taxableValue),
        ...(splitComparison === null ? {} : { fiftyFiftySplitComparison: splitComparison }),
        currency: 'AUD',
        source: `${CALCULATORS}fbt-meal-entertainment/`,
      };
    },
  });
}
