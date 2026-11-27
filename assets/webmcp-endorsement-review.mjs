// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for the DGR and charity endorsement review. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

/** @param {ToolKit} kit @param {Pick<BusinessCalculators, 'endorsementReview' | 'ENDORSEMENT_WORKSHEETS'>} calculate */
export function endorsementReviewTool(kit, calculate) {
  const { tool, choice, record, CALCULATORS } = kit;
  /** @param {string} description */
  const answer = (description) => ({ type: /** @type {const} */ ('boolean'), description });
  return tool({
    name: 'review_dgr_charity_endorsement',
    title: 'DGR and charity endorsement review',
    description: 'The ATO\'s endorsement review worksheets, NAT 74110 (income tax exempt charity), NAT 11685 (Worksheet 1, a '
      + 'deductible gift recipient endorsed as a whole) and NAT 11686 (Worksheet 2, a DGR endorsed for a fund, authority or '
      + 'institution it owns or includes), from the entity\'s own yes or no answers: status continues, action_needed or '
      + 'not_entitled, each answer\'s provision (ITAA 1997 ss 30-15 item 1, 30-125, 30-130, 30-228, 50-5, 50-47, 50-50 and '
      + '50-110) and, for a no, what TAA 1953 Sch 1 s 426-45 or 426-55 requires. Give exactly the answers of the chosen '
      + 'worksheet. Checks nothing against a register and works no amounts in AUD; it does not decide whether a gift is deductible.',
    inputSchema: record({
      worksheet: choice([...calculate.ENDORSEMENT_WORKSHEETS], '"income_tax_exempt_charity" (NAT 74110), "dgr_whole" (Worksheet 1) or "dgr_fund" (Worksheet 2).'),
      answers: record({
        abn_current: answer('Every worksheet: the entity\'s ABN is still current.'),
        registered_charity: answer('income_tax_exempt_charity only: a registered charity, registered with the ACNC.'),
        meets_a_test: answer('income_tax_exempt_charity only: meets the in Australia, DGR or prescribed by law test.'),
        meets_both_conditions: answer('income_tax_exempt_charity only: complies with its governing rules and applies its income and assets solely for its purpose.'),
        within_category: answer('dgr_whole and dgr_fund: still within the DGR category on the ATO notice.'),
        winding_up_clause: answer('dgr_whole only: a winding up and revocation clause, or set up by an Act that does not provide for its winding up.'),
        gift_fund_maintained: answer('dgr_fund only: a gift fund maintained for the principal purpose.'),
        in_australia: answer('dgr_whole and dgr_fund: the fund, authority or institution is in Australia.'),
        receipts_correct: answer('dgr_whole and dgr_fund: receipts state the name, the ABN and what each is for.'),
      }, ['abn_current']),
    }, ['worksheet', 'answers']),
    run({ worksheet, answers }) {
      const r = calculate.endorsementReview(worksheet, answers);
      return { worksheet: r.worksheet, status: r.status, findings: r.findings, notAsked: r.notAsked, record: r.record,
        source: `${CALCULATORS}endorsement-review/` };
    },
  });
}
