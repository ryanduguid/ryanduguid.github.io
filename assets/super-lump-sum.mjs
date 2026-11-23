// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The super lump sum tax page works one of three things, as the form's first choice says: the most
// income tax, the amount the fund withholds, or the tax on a departing Australia superannuation payment.

import { daspTaxResult } from './dasp-tax.mjs';
import { sbtTaxResult } from './super-benefit-tax.mjs';
import { superWithholdingResult } from './super-withholding.mjs';

/** The page's result for the calculation chosen. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function superBenefitTaxResult(value, aud) {
  const calculation = value('calc');
  if (calculation === 'withholding') return superWithholdingResult(value, aud);
  if (calculation === 'dasp') return daspTaxResult(value, aud);
  return sbtTaxResult(value, aud);
}
