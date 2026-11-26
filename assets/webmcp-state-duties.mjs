// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for the 3 state tax calculators added on 27 November 2026: motor vehicle duty,
// insurance duty and Victorian property taxes. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

const PLACES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt'];
const flag = (/** @type {string} */ what) => ({ type: /** @type {const} */ ('boolean'), description: what });
const scope = { type: /** @type {const} */ ('boolean'), description: 'Optional scope confirmation; false refuses.' };

/** @param {ToolKit} kit @param {BusinessCalculators['motorVehicleDuty']} motorVehicleDuty */
export function motorVehicleDutyTool(kit, motorVehicleDuty) {
  const { tool, text, choice, record, CALCULATORS } = kit;
  return tool({
    name: 'calculate_motor_vehicle_duty',
    title: 'Motor vehicle duty calculator',
    description: 'Duty on registering, or transferring the registration of, one passenger vehicle in any Australian state or territory for a duty '
      + 'date in 2026-27, on a stated dutiable value in whole dollars, from each Act\'s scale: Victoria\'s green and primary producer cars, '
      + 'Queensland\'s engine rows, Tasmania\'s fleet discount, the ACT\'s emissions categories and the Northern Territory\'s electric vehicle '
      + 'exemption. Each place\'s own inputs are required there and refused elsewhere. Refuses other vehicle classes. Amounts in AUD.',
    inputSchema: record({
      jurisdiction: choice(PLACES, 'State or territory of registration.'),
      dutiableValue: text('trillionCost', 'Dutiable value in whole AUD.'),
      dutyDate: text('date', 'Duty date, YYYY-MM-DD, in 2026-27.'),
      engine: choice(['hybrid_or_electric', 'up_to_4_cylinders', '5_or_6_cylinders', '7_or_more_cylinders'], 'Queensland only: the Schedule 4C row.'),
      greenCar: flag('Victoria only: true for a green car.'), primaryProducer: flag('Victoria only: true for a primary producer passenger car.'),
      emissionsCategory: choice(['aaa', 'aa', 'a', 'b', 'c', 'd', 'non_rated'], 'ACT only: the emissions category.'),
      newVehicle: flag('ACT only: true for a new vehicle.'), fleetDiscount: flag('Tasmania only: true for a manufacturer\'s fleet discount.'),
      electric: flag('Northern Territory only: true for an electric vehicle.'), scopeConfirmed: scope,
    }, ['jurisdiction', 'dutiableValue', 'dutyDate']),
    run(input) {
      /** @type {Record<string, unknown>} */
      const call = { jurisdiction: input.jurisdiction, vehicle_class: 'passenger', dutiable_value: input.dutiableValue, duty_date: input.dutyDate,
        year: '2026-27', scope_confirmed: input.scopeConfirmed ?? true };
      for (const [from, to] of [['engine', 'engine'], ['greenCar', 'green_car'], ['primaryProducer', 'primary_producer'],
        ['emissionsCategory', 'emissions_category'], ['newVehicle', 'new_vehicle'], ['fleetDiscount', 'fleet_discount'], ['electric', 'electric']]) {
        if (input[from] !== undefined) call[to] = input[from]; // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
      }
      const r = motorVehicleDuty(call);
      return { financialYear: r.year, duty: r.amounts.duty, authority: r.authority, rates: r.rates, currency: 'AUD',
        source: `${CALCULATORS}motor-vehicle-duty/` };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['insuranceDuty']} insuranceDuty @param {BusinessCalculators['INSURANCE_CLASSES']} classes */
export function insuranceDutyTool(kit, insuranceDuty, classes) {
  const { tool, text, choice, record, CALCULATORS } = kit;
  return tool({
    name: 'calculate_insurance_duty',
    title: 'Insurance duty calculator',
    description: 'Duty on one general insurance premium for a contract effected or renewed in 2026-27 in any Australian state or territory, at '
      + 'the rate its Act sets for the class: ' + classes.map((c) => `${c.place} ${c.code}`).join(', ') + '. NSW Type C needs policyTakenOut '
      + '(exempt from 1 January 2018); a Northern Territory policy needs termOverOneYear and is refused when true. Refuses life insurance. Amounts in AUD.',
    inputSchema: record({
      jurisdiction: choice(PLACES, 'State or territory.'),
      class: choice([...new Set(classes.map((c) => c.code))], 'The class of insurance in that place.'),
      premium: text('trillionCost', 'The premium in AUD.'),
      effectedDate: text('date', 'Day the contract was effected or renewed, YYYY-MM-DD, in 2026-27.'),
      termOverOneYear: flag('Northern Territory only: true for a policy issued or renewed for more than one year.'),
      policyTakenOut: text('date', 'NSW Type C only: day the policy was taken out, YYYY-MM-DD.'), scopeConfirmed: scope,
    }, ['jurisdiction', 'class', 'premium', 'effectedDate']),
    run(input) {
      /** @type {Record<string, unknown>} */
      const call = { jurisdiction: input.jurisdiction, class: input.class, premium: input.premium, effected_date: input.effectedDate, year: '2026-27',
        scope_confirmed: input.scopeConfirmed ?? true };
      if (input.termOverOneYear !== undefined) call.term_over_one_year = input.termOverOneYear;
      if (input.policyTakenOut !== undefined) call.policy_taken_out = input.policyTakenOut;
      const r = insuranceDuty(call);
      return { financialYear: r.year, duty: r.amounts.duty, authority: r.authority, rates: r.rates, currency: 'AUD',
        source: `${CALCULATORS}insurance-duty/` };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['vicPropertyTaxes']} vicPropertyTaxes */
export function vicPropertyTaxesTool(kit, vicPropertyTaxes) {
  const { tool, text, choice, record, CALCULATORS } = kit;
  const parcel = record({ civBefore: text('trillionCost', 'Capital improved value before the rezoning, whole AUD.'),
    civAfter: text('trillionCost', 'Capital improved value after the rezoning, whole AUD.') }, ['civBefore', 'civAfter']);
  return tool({
    name: 'calculate_vic_property_taxes',
    title: 'Victorian property taxes calculator',
    description: 'One Victorian tax on land for the 2025 or 2026 tax year: vacant residential land tax at 1%, 2% or 3% of the capital improved '
      + 'value (Land Tax Act 2005 (Vic) s 35(3)), 1% for undeveloped land from 2026 or under s 88EB; the commercial and industrial property tax, '
      + 'nil in both years, with the transition period\'s end and the earliest tax year the land can be liable; or windfall gains tax on a '
      + 'rezoning (Windfall Gains Tax Act 2021 (Vic) s 9). Each tax\'s inputs are refused for the others. Amounts in AUD.',
    inputSchema: record({
      tax: choice(['vacant_residential_land', 'commercial_industrial', 'windfall_gains'], 'The tax.'),
      taxYear: choice(['2025', '2026'], 'The tax year, a calendar year.'),
      capitalImprovedValue: text('trillionCost', 'Vacant residential land tax: the capital improved value, whole AUD.'),
      residentialLand: choice(['vacant_home', 'construction', 'uninhabitable', 'undeveloped'], 'Vacant residential land tax: the land.'),
      newResidentialConcession: flag('Vacant residential land tax, other than undeveloped land: true when s 88EB applies.'),
      liablePreviousTaxYear: flag('Vacant residential land tax at the s 35(3) rates: liable in the preceding tax year.'),
      liableTaxYearBefore: flag('Vacant residential land tax at the s 35(3) rates: liable in the tax year before that.'),
      entryDate: text('date', 'Commercial and industrial property tax: the land\'s entry date, YYYY-MM-DD.'),
      parcels: { type: /** @type {const} */ ('array'), items: parcel, maxItems: 100,
        description: 'Windfall gains tax: each title the rezoning rezoned.' },
      scopeConfirmed: scope,
    }, ['tax', 'taxYear']),
    run(input) {
      /** @type {Record<string, unknown>} */
      const call = { tax: input.tax, year: input.taxYear, scope_confirmed: input.scopeConfirmed ?? true };
      for (const [from, to] of [['capitalImprovedValue', 'capital_improved_value'], ['residentialLand', 'residential_land'],
        ['newResidentialConcession', 'new_residential_concession'], ['liablePreviousTaxYear', 'liable_previous_tax_year'],
        ['liableTaxYearBefore', 'liable_tax_year_before'], ['entryDate', 'entry_date']]) {
        if (input[from] !== undefined) call[to] = input[from];
      }
      if (input.parcels !== undefined) {
        call.parcels = /** @type {{civBefore: string, civAfter: string}[]} */ (input.parcels).map((p) => ({ civ_before: p.civBefore, civ_after: p.civAfter }));
      }
      const r = vicPropertyTaxes(call);
      return { taxYear: r.year, tax: r.tax, total: r.amounts.total, amounts: r.amounts, rates: r.rates, authority: r.authority, currency: 'AUD',
        source: `${CALCULATORS}vic-property-taxes/` };
    },
  });
}

/**
 * The 3 state tax tools, keyed by each form's `data-calculator` slug.
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'motorVehicleDuty' | 'insuranceDuty' | 'INSURANCE_CLASSES' | 'vicPropertyTaxes'>} calculate
 */
export function stateDutyTools(kit, calculate) {
  return {
    'motor-vehicle-duty': motorVehicleDutyTool(kit, calculate.motorVehicleDuty),
    'insurance-duty': insuranceDutyTool(kit, calculate.insuranceDuty, calculate.INSURANCE_CLASSES),
    'vic-property-taxes': vicPropertyTaxesTool(kit, calculate.vicPropertyTaxes),
  };
}
