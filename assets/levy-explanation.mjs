export const money = (cents) =>
  (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });

export function explainLevyResult(result) {
  if (result.branch === 'pre-2024') {
    return `The pre-January-2024 casual method applied this month, before the
            separate casual loading component existed. There is no greater-of
            test and no 75 per cent factor.`;
  }
  if (result.branch !== 's 3B(1)') {
    return `Section ${result.branch} applies. There is no greater-of test and no
            75 per cent factor on this branch.`;
  }
  return result.winner === 'B'
    ? `Formula B wins this month. Overtime, penalty rates and allowances reached
       the levy base only because 75 per cent of the aggregate (${money(result.formulaB)})
       exceeded base pay plus at-least-monthly bonuses (${money(result.formulaA)}).`
    : `Formula A wins this month. Overtime, penalty rates and allowances did not
       affect the levy at all, because 75 per cent of the aggregate
       (${money(result.formulaB)}) did not exceed base pay plus at-least-monthly
       bonuses (${money(result.formulaA)}).`;
}
