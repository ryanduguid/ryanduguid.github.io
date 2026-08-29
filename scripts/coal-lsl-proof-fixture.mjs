export const COAL_LSL_PROOF = Object.freeze({
  viewport: Object.freeze({ width: 868, height: 1106 }),
  capture: Object.freeze({
    width: 868,
    height: 580,
    quality: 0.84,
    maxBytes: 80_000,
  }),
  branchName: 'A base rate of pay (section 3B(1))',
  inputs: Object.freeze({
    baseRate: '6000',
    overtimeAndPenalties: '3000',
    allowances: '500',
    salarySacrifice: '0',
  }),
  expected: Object.freeze({
    formulaA: '$6,000.00',
    formulaB: '$7,125.00',
    eligibleWages: '$7,125.00',
    levy: '$192.38',
    branch: 'section 3B(1)',
    explanation:
      'Formula B wins this month. Overtime, penalty rates and allowances reached the levy base only because 75 per cent of the aggregate ($7,125.00) exceeded base pay plus at-least-monthly bonuses ($6,000.00).',
  }),
});
