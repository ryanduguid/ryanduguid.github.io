// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for Business Calculators Cohort D property taxes:
// land tax and transfer duty. Reuses DUTY_SCALES from assets/webmcp-business-b.mjs.
// Imported by assets/webmcp-business-d.mjs.

import { DUTY_SCALES } from './webmcp-business-b.mjs';
import { requireWhen } from './webmcp-business-c-workforce.mjs';

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

/**
 * Land tax scales and options by jurisdiction, mirrored 1:1 from
 * `_includes/calculators/land-tax.html` (verified by parity tests).
 * @type {ReadonlyMap<string, Readonly<Record<string, string | undefined>>>}
 */
export const LAND_TAX_PLACES = new Map([
  ['AU-NSW', {
    name: 'New South Wales',
    scale: '0,0,0,0,excess;1075001,100,1.6,1075000,excess;6571001,88036,2,6571000,excess',
    trustScale: '0,0,1.6,0,excess;6571001,105136,2,6571000,excess',
    surcharge: '0,0,5,0,excess',
    surchargeBase: 'separate',
  }],
  ['AU-VIC', {
    name: 'Victoria',
    scale: '0,0,0,0,excess;50000,500,0,50000,excess;100000,975,0,100000,excess;300000,1350,0.3,300000,excess;600000,2250,0.6,600000,excess;1000000,4650,0.9,1000000,excess;1800000,11850,1.65,1800000,excess;3000000,31650,2.65,3000000,excess',
    trustScale: '0,0,0,0,excess;25000,82,0.375,25000,excess;50000,676,0.375,50000,excess;100000,1338,0.375,100000,excess;250000,1901,0.675,250000,excess;600000,4263,0.975,600000,excess;1000000,8163,1.275,1000000,excess;1800000,18363,1.1072,1800000,excess;3000000,31650,2.65,3000000,excess',
    surcharge: '0,0,0,0,excess;50000,0,4,0,excess',
    absenteeTrust: 'unsupported',
  }],
  ['AU-QLD', {
    name: 'Queensland',
    scale: '0,0,0,0,excess;600000,500,1,600000,excess;1000000,4500,1.65,1000000,excess;3000000,37500,1.25,3000000,excess;5000000,62500,1.75,5000000,excess;10000000,150000,2.25,10000000,excess',
    trustScale: '0,0,0,0,excess;350000,1450,1.7,350000,excess;2250000,33750,1.5,2250000,excess;5000000,75000,2.25,5000000,excess;10000000,187500,2.75,10000000,excess',
    absenteeScale: '0,0,0,0,excess;350000,1450,1.7,350000,excess;2250000,33750,1.5,2250000,excess;5000000,75000,2,5000000,excess;10000000,175000,2.5,10000000,excess',
    surcharge: '0,0,0,0,excess;350000,0,3,349999,excess',
  }],
  ['AU-WA', {
    name: 'Western Australia',
    scale: '0,0,0,0,excess;300001,300,0,300000,excess;420001,300,0.25,420000,excess;1000001,1750,0.9,1000000,excess;1800001,8950,1.8,1800000,excess;5000001,66550,2,5000000,excess;11000001,186550,2.67,11000000,excess',
    mrit: '0,0,0,0,excess;300001,0,0.14,300000,excess',
  }],
  ['AU-SA', {
    name: 'South Australia',
    scale: '0,0,0,0,excess;936001,0,0.5,936000,excess-rounded-up-to-100;1504001,2840,1,1504000,excess-rounded-up-to-100;2188001,9680,2,2188000,excess-rounded-up-to-100;3504001,36000,2.4,3504000,excess-rounded-up-to-100',
    trustScale: '0,0,0,0,excess;25001,125,0.5,25000,excess-rounded-up-to-100;936001,4680,1,936000,excess-rounded-up-to-100;1504001,10360,1.5,1504000,excess-rounded-up-to-100;2188001,20620,2.4,2188000,excess-rounded-up-to-100;3504001,52204,2.4,3504000,excess-rounded-up-to-100',
    payable: 'nil-below-20',
  }],
  ['AU-TAS', {
    name: 'Tasmania',
    scale: '0,0,0,0,excess;125000,50,0.45,125000,excess;500000,1737.50,1.5,500000,excess',
    surcharge: '0,0,2,0,excess',
    surchargeBase: 'separate',
    payable: 'ten-cents',
  }],
  ['AU-ACT', {
    name: 'Australian Capital Territory',
    fixed: '1778',
    scale: '0,0,0.54,0,excess;150001,810,0.64,150000,excess;275001,1610,1.24,275000,excess;1000001,10600,1.25,1000000,excess;2000001,23100,1.26,2000000,excess',
    surcharge: '0,0,0.75,0,excess',
  }],
]);

const LAND_TAX_CODES = Array.from(LAND_TAX_PLACES.keys());
const DUTY_PLACE_CODES = Array.from(DUTY_SCALES.keys());

/** @param {ToolKit} kit @param {BusinessCalculators['landTaxYear']} landTaxYear */
export function landTaxTool(kit, landTaxYear) {
  const { choice, whole, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_land_tax',
    title: 'Land tax calculator',
    description: 'Full-year land tax in AUD across the 7 Australian states and territories that levy land tax '
      + '(2026 calendar year in NSW and Victoria; 2026-27 financial year in Queensland, WA, SA, Tasmania and ACT; '
      + 'Northern Territory has no land tax), at general or trust rates, with foreign or absentee owner surcharge '
      + 'and WA metropolitan region improvement tax (MRIT) where applicable. Refuses unsupported trust, foreign or '
      + 'MRIT options for a jurisdiction and mismatched separate surcharge values. Does not decide exemptions, '
      + 'grouping, joint ownership or foreign status.',
    inputSchema: record({
      place: choice(LAND_TAX_CODES, 'State or territory levying land tax, for example "AU-NSW".'),
      taxableLandValue: whole(0, 1000000000, 'Total taxable land value in whole AUD, from 0 to 1,000,000,000.'),
      rates: choice(['general', 'trust'], '"general" (or omitted) or "trust" (NSW special trust, Victoria trust surcharge, Queensland companies/trustees, SA trust).'),
      foreignOrAbsentee: { type: 'boolean', description: 'true for a foreign person or absentee owner; false when omitted.' },
      surchargeLandValue: whole(0, 1000000000, 'AU-NSW and AU-TAS only (when foreignOrAbsentee is true): land value the foreign surcharge applies to in whole AUD.'),
      perthMetropolitanRegion: { type: 'boolean', description: 'AU-WA only: true when all the land is in the Perth metropolitan region (adds 0.14% MRIT over $300,000); false when omitted.' },
    }, ['place', 'taxableLandValue']),
    run(input) {
      const {
        place, taxableLandValue, rates = 'general', foreignOrAbsentee = false,
        surchargeLandValue, perthMetropolitanRegion = false,
      } = input;
      const placeData = LAND_TAX_PLACES.get(place);
      if (!placeData) throw new Error('Choose a state or territory.');
      const separate = foreignOrAbsentee && placeData.surchargeBase === 'separate';
      requireWhen(separate, surchargeLandValue, 'surchargeLandValue', 'when foreignOrAbsentee is true in AU-NSW or AU-TAS');
      const r = landTaxYear(String(taxableLandValue), placeData, {
        trust: rates === 'trust',
        foreign: foreignOrAbsentee,
        surchargeValue: surchargeLandValue === undefined ? '' : String(surchargeLandValue),
        metro: perthMetropolitanRegion,
      });
      const [from = '', base = '', rate = '', over = '', rule = ''] = r.band;
      return {
        place,
        jurisdictionName: placeData.name,
        rates,
        foreignOrAbsentee,
        perthMetropolitanRegion,
        landTax: dollars(r.tax),
        foreignSurcharge: dollars(r.surcharge),
        metropolitanRegionImprovementTax: dollars(r.mrit),
        total: dollars(r.total),
        band: { from, base, rate, over, rule },
        currency: 'AUD',
        source: `${CALCULATORS}land-tax/`,
      };
    },
  });
}

/**
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'transferDuty' | 'firstHomeDuty'>} calculate
 */
export function transferDutyTool(kit, calculate) {
  const { choice, whole, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_transfer_duty',
    title: 'Transfer duty calculator',
    description: 'General transfer (stamp) duty in AUD across all 8 Australian states and territories on a dutiable '
      + 'value in whole dollars (scales in force on 15 November 2026), and eligible first home buyer transfer duty '
      + 'for a new or established home bought as a principal place of residence where a scheme applies (concession '
      + 'rules as read 16 November 2026). Notes when NSW residential premium duty applies above $3,870,000. Does '
      + 'not test first home buyer eligibility or compute vacant land, off-the-plan, pensioner, owner-occupier '
      + 'concessions or foreign purchaser surcharges.',
    inputSchema: record({
      place: choice(DUTY_PLACE_CODES, 'State or territory, for example "AU-NSW".'),
      dutiableValue: whole(1, 1000000000, 'Dutiable value in whole AUD, from 1 to 1,000,000,000.'),
      buyer: choice(['general', 'established', 'new'], '"general" (or omitted), "established" (eligible first home buyer, established home) or "new" (eligible first home buyer, new home).'),
    }, ['place', 'dutiableValue']),
    run({ place, dutiableValue, buyer = 'general' }) {
      const scale = DUTY_SCALES.get(place);
      if (!scale) throw new Error('Choose a state or territory.');
      const general = calculate.transferDuty(String(dutiableValue), scale);
      const [over = '', to = '', base = '', rate = '', rule = ''] = scale.at(general.bracket) ?? [];
      const firstHome = buyer === 'general'
        ? null
        : calculate.firstHomeDuty(String(dutiableValue), scale, place, buyer);
      return {
        place,
        buyer,
        dutiableValue: dollars(dutiableValue),
        generalDuty: dollars(general.duty),
        firstHomeBuyerDuty: firstHome ? dollars(firstHome.duty) : null,
        firstHomeConcessionApplies: firstHome ? firstHome.concession : null,
        nswResidentialPremiumBracket: place === 'AU-NSW' && general.bracket === scale.length - 1,
        bracket: { over, to: to || null, base, rate, rule },
        currency: 'AUD',
        source: `${CALCULATORS}transfer-duty/`,
      };
    },
  });
}
