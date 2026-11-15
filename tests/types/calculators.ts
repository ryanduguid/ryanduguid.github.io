// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// Compile only. Runtime validation and rounding have separate Node tests.
import * as calculate from '../../assets/business-calculators.mjs';
import { calculatorTools } from '../../assets/webmcp-tools.mjs';

const result = calculate.gst('110.00', true);
const tax: number = result.gst;
// @ts-expect-error Money inputs are decimal strings, not numeric dollars or cents.
calculate.gst(110);
// @ts-expect-error GST inclusion is a boolean flag.
calculate.gst('110.00', 'inclusive');
// @ts-expect-error Variance needs the declared income or cost interpretation.
calculate.variance('100', '90', 'expense');
// @ts-expect-error A calculated amount is numeric, not formatted text.
const formatted: string = result.gst;
const weeks = [{ receipts: '100', payments: '20' }];
calculate.cashForecast('0', weeks, '50', { week: '1', amount: '10', delay: 2 });
// @ts-expect-error Each week needs both receipts and payments.
calculate.cashForecast('0', [{ receipts: '100' }], '50');
// @ts-expect-error A cash deferral amount uses the same decimal string contract.
calculate.cashForecast('0', weeks, '50', { week: 1, amount: 10, delay: 2 });

const tool = calculatorTools(calculate).gst;
void tool.execute({ amount: '110.00', inclusive: true });
// @ts-expect-error The WebMCP descriptor needs the calculator's numeric result contract.
calculatorTools({ gst: () => ({ net: '100', gst: '10', gross: '110' }) });
// @ts-expect-error A Division 7A benchmark rate is a decimal string, as the rate table writes it.
calculate.div7aMinimumRepayment('100000', 8.77, '5');
const arrangement = { gateway1: true, gateway2: true, entitlement: '600000', returned: '330000', tax: '189367',
  factor3: false, remuneration: '0', benchmark: '0' };
const zone: string = calculate.pcgRisk(arrangement).zone;
// @ts-expect-error A gateway answer is a boolean, as the form passes it.
calculate.pcgRisk({ ...arrangement, gateway1: 'yes' });
// @ts-expect-error Factor 3's score is null when only factors 1 and 2 are used.
const factor3: number = calculate.pcgRisk(arrangement).factor3;
const plan = { debt: '1000', start: '2026-10-01', count: '3', frequency: 'monthly', assumedRate: '11.51' } as const;
const gic: number = calculate.gicPaymentPlan(plan).gic;
// @ts-expect-error A plan's frequency is weekly, fortnightly or monthly.
calculate.gicPaymentPlan({ ...plan, frequency: 'quarterly' });
// @ts-expect-error The last instalment date is an ISO date string.
const lastDay: Date = calculate.gicPaymentPlan(plan).lastDate;
void gic;
void lastDay;
void zone;
void factor3;
void tax;
void formatted;
