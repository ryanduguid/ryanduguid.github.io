// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The scholarship exemption (ITAA 1997 s 51-10 item 2.1A and s 51-35, read 27 November 2026), and the `scholarship-exemption` command of ryanduguid/australian-accounting on every case of its differential fixture.

import { scholarshipExemption } from '../assets/scholarship-exemption.mjs';
import { parityTest } from './super-income-cases.mjs';

parityTest('scholarship-exemption', 141, scholarshipExemption, ['period', 'payment_type', 'exempt', 'conditions_not_met']);
