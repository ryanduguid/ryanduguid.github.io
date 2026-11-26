// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The defined benefit income cap (ITAA 1997 ss 303-2 to 303-4, read 27 November 2026), and the `defined-benefit-income-cap` command of ryanduguid/australian-accounting on every case of its differential fixture.

import { definedBenefitIncomeCap } from '../assets/defined-benefit-income-cap.mjs';
import { parityTest } from './super-income-cases.mjs';

parityTest('defined-benefit-income-cap', 192, definedBenefitIncomeCap, ['period', 'amounts', 'rates']);
