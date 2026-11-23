// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { fhss, FHSS_ESTIMATE_NOTE, FHSS_TRANSITION_NOTE } from './fhss.mjs';
export { fhss };

const WITHHOLDING = {
  marginal: 'marginal rate plus the ordinary Medicare levy, less the 30% offset',
  unable: '17% because the Commissioner cannot estimate the rate',
  supplied_estimate: 'withholding estimate entered',
  actual: 'actual PAYG withholding entered',
  unknown: 'PAYG withholding unknown',
};

/** @param {string} text @param {string[]} columns @param {string} label */
function parseRows(text, columns, label) {
  if (text.length > 600000) throw new Error(`${label} is too long.`);
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    const cells = line.split(',').map(cell => cell.trim());
    if (cells.length !== columns.length || cells.some(cell => !cell)) {
      throw new Error(`${label}, line ${index + 1}: enter ${columns.join(', ')}.`);
    }
    return [Object.fromEntries(columns.map((column, i) => [column, cells[i]]))];
  });
}

/** @param {(name: string) => string} value */
export function fhssFormFacts(value) {
  const mode = value('mode');
  const basis = value('withholding-basis');
  const stated = mode === 'stated';
  return {
    mode, scopeConfirmed: value('scope') === 'yes', determinationDate: value('determination-date'),
    ...(stated ? {
      concessional: value('concessional'), nonConcessional: value('non-concessional'),
      associatedEarnings: value('associated-earnings'), actualRelease: value('actual-release'),
    } : {
      determinationRequested: value('determination-requested'),
      contributions: parseRows(value('contributions'), ['date', 'amount', 'kind'], 'Contributions'),
      deductions: parseRows(value('deductions'), ['financial_year', 'amount'], 'Personal deductions'),
    }),
    requestedAmount: value('requested-amount'), releaseRequestDate: value('release-request-date'),
    withholdingBasis: basis, marginalPercent: value('marginal-percent'),
    withholdingAmount: value('withholding-amount'), debtOffset: value('debt-offset'),
    transition: value('transition'),
  };
}

/** @param {(name: string) => string} value @param {(amount: number) => string} aud */
export function fhssResult(value, aud) {
  const facts = fhssFormFacts(value);
  const r = fhss(facts);
  const a = r.amounts;
  const estimate = r.earningsBasis === 'estimate';
  const actual = r.releaseBasis === 'actual';
  const cash = amount => amount === null ? 'Unknown' : aud(Number(amount));
  const basis = estimate ? 'Contribution ledger estimate' : 'Amounts from the ATO determination';
  const release = actual ? 'Actual gross release' : 'Assumed gross release';
  const rows = [
    ['Concessional component (85%)', cash(a.concessional_component)],
    ['Non-concessional component (100%)', cash(a.non_concessional_component)],
    [estimate ? 'Estimated associated earnings' : 'Associated earnings on the determination', cash(a.associated_earnings)],
    [estimate ? 'Estimated maximum release amount' : 'Maximum release amount', cash(a.maximum_release_amount)],
    [facts.requestedAmount ? 'Amount requested' : 'Amount assumed requested', cash(a.amount_requested)],
    [release, cash(a.gross_release)],
    ['Assessable FHSS released amount', cash(a.assessable_fhss_released_amount)],
    ['Income year of the release request', r.assessableYear ?? 'Release request date needed'],
    [r.withholdingBasis === 'actual' || r.withholdingBasis === 'unknown' ? 'PAYG withheld' : 'Estimated PAYG withholding', cash(a.tax_withheld)],
    ['Release after withholding', cash(a.after_withholding)],
    ['Commonwealth debt offset', cash(a.debt_offset)],
    [actual && r.withholdingBasis === 'actual' ? 'Amount paid to you' : 'Estimated amount paid to you', cash(a.paid_to_you)],
    ['Non-refundable FHSS tax offset (30%)', cash(a.fhss_tax_offset)],
  ];
  if (r.lifetimeLimit !== null) rows.push(
    ['Eligible contribution limit per year', cash(r.annualLimit)],
    ['Total eligible contribution limit', cash(r.lifetimeLimit)],
  );
  if (a.fhss_tax_if_not_used !== null) rows.push(
    ['FHSS tax if no qualifying contract or recontribution', cash(a.fhss_tax_if_not_used)],
    ['Minimum recontribution if that option is used', cash(a.recontribution_required)],
  );
  const shownEarnings = new Set();
  const contributions = r.rows.map(row => {
    const earnings = shownEarnings.has(row.row) ? '' : aud(Number(row.earnings));
    shownEarnings.add(row.row);
    const kind = row.type === 'employer_voluntary' ? 'Salary sacrifice' : 'Personal';
    return [`${row.date} · ${kind}`, row.concessional ? 'Concessional' : 'Non-concessional', aud(Number(row.amount) / 100),
      aud(Number(row.counted) / 100), row.counted === 0n ? '' : row.earningsFrom, earnings];
  });
  const notes = [
    estimate ? FHSS_ESTIMATE_NOTE : '',
    actual ? '' : 'The assessable amount uses the assumed gross release. Recalculate when the actual gross release is available.',
    r.withholdingBasis === 'unknown' ? 'The net release and minimum recontribution need the withholding amount.' : '',
    ['marginal', 'unable', 'supplied_estimate'].includes(r.withholdingBasis) ? 'PAYG withholding is an estimate.' : '',
    r.transition === 'unconfirmed' ? `Confirm which rules apply before using the conditional tax and recontribution figures. ${FHSS_TRANSITION_NOTE}` : '',
    r.transition === 'item30' ? 'Item 30 release: the purchase, recontribution and FHSS tax rules do not apply to this release.' : '',
  ].filter(Boolean).join(' ');
  return {
    inputs: `${basis}, determination ${facts.determinationDate} (${r.determinationYear}), `
      + `${facts.releaseRequestDate ? `release request ${facts.releaseRequestDate}, ` : ''}${WITHHOLDING[r.withholdingBasis]}`
      + (r.withholdingBasis === 'marginal' ? ` (marginal rate ${facts.marginalPercent}%)` : ''),
    rows, principal: 3, note: notes.replace(/\.$/, ''),
    tables: contributions.length ? { 'fhss-contributions': contributions } : {},
  };
}
