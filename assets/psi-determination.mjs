// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { cents } from './money.mjs';

// Whether the personal services income (PSI) rules apply to one individual's PSI for one income
// year. Read 17 November 2026: Part 2-42 (Divisions 84 to 87) of the Income Tax Assessment Act
// 1997, Compilation No. 268 of 1 October 2026, https://www.legislation.gov.au/C2004A05138/latest/text,
// and Taxation Ruling TR 2022/3, https://www.ato.gov.au/law/view/document?docid=TXR/TR20223/NAT/ATO/00001,
// which replaced TR 2001/7 and TR 2001/8 (paragraph 30).
// Whether income is mainly a reward for personal efforts or skills (s 84-5), is for producing a
// result (s 87-18), or came as a direct result of offers to the public (s 87-20), whether a payer
// is an associate, and each market value are the user's answers: the engine counts them.

/** Who receives the income: the individual as an employee (or office holder or religious
 * practitioner), the individual as a contractor, or a company, partnership or trust.
 * @typedef {'employee' | 'sole-trader' | 'entity'} PsiEarner
 * @typedef {{amount: string, associate: boolean, offer: boolean, result: boolean, tools: boolean,
 *   defects: boolean}} PsiPayer one payer with its associates
 * @typedef {{times: boolean, mainly: boolean, exclusive: boolean, private: boolean, clients: boolean}} PsiPremises
 * @typedef {{earner: PsiEarner, mainly: boolean, determination: boolean, payers: PsiPayer[], agent: boolean,
 *   commission: string, principal: string, others: string, apprentice: boolean, premises: PsiPremises}} PsiAnswers
 * @typedef {{rule: string, effect: string, psb: boolean | null, results: number | null, source: number | null,
 *   unrelated: number | null, employment: number | null, steps: Array<[string, string]>}} PsiDetermination */

export const PSI_PAYERS = 5;
const PSB = 'a personal services business, so Divisions 85 and 86 do not apply';

/** A share in per cent to 2 places, rounded down, so a share under a threshold never shows as
 * reaching it. @param {number} part cents @param {number} whole cents, positive */
const share = (part, whole) => Number((BigInt(part) * 10000n) / BigInt(whole)) / 100;
/** @param {number} value */
const shown = (value) => `${value.toFixed(2)}%`;
/** @param {boolean} answer */
const said = (answer) => (answer ? 'Yes, as you answered' : 'No, as you answered');

/** Steps through Part 2-42 for one individual's PSI in one income year: s 84-5, then s 85-35, a
 * PSB determination (s 87-15(1)), the results test (s 87-18), the 80% rule (s 87-15(3), with
 * s 87-40 for agents) and the other 3 tests (ss 87-20, 87-25, 87-30).
 * @param {PsiAnswers} answers @returns {PsiDetermination} */
export function psiDetermination(answers) {
  const { earner, payers, premises } = answers;
  if (!['employee', 'sole-trader', 'entity'].includes(earner)) throw new Error('Choose who receives the income.');
  if (!Array.isArray(payers) || payers.length < 1 || payers.length > PSI_PAYERS) {
    throw new Error(`Enter up to ${PSI_PAYERS} payers.`);
  }
  const amounts = payers.map(({ amount }) => cents(amount));
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  const others = cents(answers.others);
  /** @type {Array<[string, string]>} */
  const steps = [['Subsection 84-5(1): income mainly a reward for the individual’s personal efforts or skills',
    said(answers.mainly)]];
  const none = { psb: null, results: null, source: null, unrelated: null, employment: null };
  if (!answers.mainly) {
    return { rule: 'subsection 84-5(1)', effect: 'not personal services income, so Part 2-42 does not apply', ...none, steps };
  }
  if (earner === 'employee') {
    steps.push(['Subsection 85-35(1): received as an employee, office holder or religious practitioner', said(true)]);
    return { rule: 'subsection 85-35(1)', effect: 'income as an employee, so the PSI rules do not apply', ...none, steps };
  }
  const entity = earner === 'entity';
  steps.push([`Paragraph 87-15(1)(${entity ? 'b' : 'a'}): a personal services business determination in force`,
    said(answers.determination)]);
  if (answers.determination) {
    return { rule: `paragraph 87-15(1)(${entity ? 'b' : 'a'})`, effect: PSB, ...none, psb: true, steps };
  }
  if (!total) throw new Error('Enter the PSI from at least one payer.');
  if (total > 100_000_000_000) throw new Error('The PSI from all payers together cannot exceed $1,000,000,000.');
  if (others > total) throw new Error('The market value of principal work by others cannot exceed the PSI entered.');

  // Section 87-18: at least 75% of the PSI meets all 3 conditions.
  const met = payers.reduce((sum, { result, tools, defects }, i) => sum + (result && tools && defects ? amounts[i] : 0), 0);
  const results = share(met, total);
  const passed = 4 * met >= 3 * total;
  steps.push([`Subsection 87-18(${entity ? 3 : 1}): PSI paid for a result, with the tools supplied and liability for defects`,
    `${shown(results)}, ${passed ? 'at least 75%: met' : 'under 75%: not met'}`]);
  if (passed) return { rule: `subsection 87-18(${entity ? 3 : 1})`, effect: PSB, ...none, psb: true, results, steps };

  if (answers.agent) {
    const [commission, principal] = [cents(answers.commission), cents(answers.principal)];
    if (!principal || commission > principal) {
      throw new Error('Enter the principal’s payments and the part of them that is commission or performance fees.');
    }
    if (4 * commission >= 3 * principal) {
      throw new Error('At least 75% of the principal’s payments are commission or performance fees, so section 87-40 '
        + 'may treat the principal’s customers as the sources of the PSI; this page does not apply section 87-40.');
    }
    steps.push(['Paragraph 87-40(2)(c): commission or performance fees in the principal’s payments',
      `${shown(share(commission, principal))}, under 75%: the agent rules do not apply`]);
  }

  // Subsection 87-15(3): each payer row is one entity with its associates.
  const largest = Math.max(...amounts);
  const source = share(largest, total);
  const oneSource = 5 * largest >= 4 * total;
  steps.push(['Subsection 87-15(3): largest share of the PSI from one payer and its associates',
    `${shown(source)}, ${oneSource ? '80% or more' : 'under 80%'}`]);

  // The other 3 tests count for self-assessment only under 80% from one source, but they are
  // still worked out: the Commissioner weighs them for a determination (s 87-15(1), note 2).
  const unrelated = payers.filter(({ associate, offer }, i) => amounts[i] && !associate && offer).length;
  const employment = share(others, total);
  const fifth = 5 * others >= total;
  const employs = fifth || answers.apprentice;
  const premisesMet = premises.times && premises.mainly && premises.exclusive && premises.private && premises.clients;
  const tests = [
    { section: '87-20', pass: unrelated >= 2,
      label: 'Section 87-20: unrelated payers that engaged the individual or entity as a direct result of offers to the public',
      finding: `${unrelated}, ${unrelated >= 2 ? 'at least 2: met' : 'under 2: not met'}` },
    { section: '87-25', pass: employs,
      label: `Section 87-25: principal work by others engaged, by market value, or an apprentice`,
      finding: `${shown(employment)}, ${fifth ? 'at least 20%' : 'under 20%'}, ${answers.apprentice
        ? 'an apprentice for at least half the year' : 'no apprentice for half the year'}: ${employs ? 'met' : 'not met'}` },
    { section: '87-30', pass: premisesMet, label: 'Section 87-30: business premises meeting all 4 conditions at all times in the year',
      finding: premisesMet ? 'Yes: met' : 'No: not met' },
  ];
  for (const { label, finding } of tests) steps.push([label, finding]);
  const passes = tests.filter(({ pass }) => pass).map(({ section }) => section);
  const figures = { results, source, unrelated, employment };
  const division = entity ? 'Division 86 applies' : 'Division 85 applies';
  if (oneSource) {
    return { rule: 'subsection 87-15(3)', effect: `not a personal services business unless a determination is in force, so ${division}`,
      psb: false, ...figures, steps };
  }
  if (passes.length) {
    const sections = passes.length === 1 ? `section ${passes[0]}`
      : `sections ${passes.slice(0, -1).join(', ')} and ${passes.at(-1)}`;
    return { rule: sections, effect: PSB, psb: true, ...figures, steps };
  }
  return { rule: 'subsection 87-15(1)', effect: `not a personal services business, so ${division}`, psb: false, ...figures, steps };
}

const EARNERS = { employee: 'Received by the individual as an employee', 'sole-trader': 'Received by the individual as a contractor',
  entity: 'Received by a company, partnership or trust' };
const CONSEQUENCES = {
  'sole-trader': 'Division 85 stops a deduction an employee could not claim (section 85-10), except those subsection '
    + '85-10(2) keeps, such as for gaining work and insurance; it also stops rent, mortgage interest, rates or land tax '
    + 'on a residence (section 85-15), and payments to an associate or for its super except for principal work '
    + '(sections 85-20 and 85-25)',
  entity: 'Section 86-15 puts the entity’s PSI, less the deductions section 86-20 allows, in the individual’s assessable '
    + 'income unless the entity pays it to them as salary by the 14th day after the PAYG payment period (subsection '
    + '86-15(4)); section 86-30 takes it out of the entity’s assessable income, and section 86-60 limits the entity’s '
    + 'deductions to those the individual could claim, with the exceptions in sections 86-65 to 86-80',
};

/** The form's answers, the steps and the outcome as the page shows them.
 * @param {(name: string) => string} value a field's value @param {(name: string) => boolean} checked a checkbox's state
 * @param {(amount: number) => string} aud */
export function psiDeterminationResult(value, checked, aud) {
  const earner = /** @type {PsiEarner} */ (value('earner'));
  const payers = Array.from({ length: PSI_PAYERS }, (_, i) => ({ amount: value(`amount-${i + 1}`),
    associate: checked(`associate-${i + 1}`), offer: checked(`offer-${i + 1}`), result: checked(`result-${i + 1}`),
    tools: checked(`tools-${i + 1}`), defects: checked(`defects-${i + 1}`) }));
  const premises = { times: checked('premises-times'), mainly: checked('premises-mainly'),
    exclusive: checked('premises-exclusive'), private: checked('premises-private'), clients: checked('premises-clients') };
  const answers = { earner, mainly: value('mainly') === 'yes', determination: value('determination') === 'yes', payers,
    agent: value('agent') === 'yes', commission: value('commission'), principal: value('principal'), others: value('others'),
    apprentice: value('apprentice') === 'yes', premises };
  const r = psiDetermination(answers);
  const money = (/** @type {string} */ text) => aud(cents(text) / 100);
  const listed = (/** @type {Array<[boolean, string]>} */ items) => items.filter(([on]) => on).map(([, text]) => text).join(', ')
    || 'none';
  const inputs = [`${EARNERS[earner]}, ${answers.mainly ? '' : 'not '}mainly a reward for personal efforts or skills`];
  if (answers.mainly && earner !== 'employee') {
    inputs[0] += `, ${answers.determination ? 'a' : 'no'} PSB determination`;
    if (!answers.determination) {
      payers.forEach((payer, i) => {
        if (cents(payer.amount)) {
          inputs.push(`payer ${i + 1} ${money(payer.amount)}, ticked: ${listed([[payer.associate, 'an associate'],
            [payer.offer, 'won by a public offer'], [payer.result, 'paid for a result'], [payer.tools, 'tools supplied'],
            [payer.defects, 'liable for defects']])}`);
        }
      });
      inputs.push(`principal work by others ${money(answers.others)}, ${answers.apprentice ? 'an' : 'no'} apprentice`,
        `business premises conditions: ${listed([[premises.times, 'at all times'], [premises.mainly, 'mainly for PSI work'],
          [premises.exclusive, 'exclusive use'], [premises.private, 'separate from private premises'],
          [premises.clients, 'separate from payers’ premises']])}`,
        answers.agent ? `an agent paid ${money(answers.commission)} in commission or performance fees of `
          + `${money(answers.principal)} from the principal` : 'not an agent');
    }
  }
  const rows = [['Outcome', `${r.rule[0].toUpperCase()}${r.rule.slice(1)}: ${r.effect}`], ...r.steps];
  const notes = [];
  if (r.psb === false) notes.push(CONSEQUENCES[/** @type {'sole-trader' | 'entity'} */ (earner)]);
  if (r.rule === 'subsection 87-15(3)') {
    notes.push('a determination can be sought from the Commissioner under section 87-60 or 87-65, in the approved form (section 87-70)');
  }
  if (r.psb) notes.push('the PSI is still reported in the tax return, and Part IVA can still apply to splitting it (TR 2022/3 paragraphs 25 and 160)');
  const note = notes.join('; ');
  return { inputs: inputs.join('; '), rows, principal: 0,
    note: note ? `${note[0].toUpperCase()}${note.slice(1)}` : undefined };
}
