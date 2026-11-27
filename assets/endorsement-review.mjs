// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The ATO's 3 endorsement review worksheets for a deductible gift recipient (DGR) or an income tax exempt
// charity, answered on the page: NAT 74110-02.2021 (income tax exempt charities), NAT 11685-02.2021
// (Worksheet 1, a DGR endorsed as a whole) and NAT 11686-02.2021 (Worksheet 2, a DGR endorsed for a fund,
// authority or institution it owns or includes), each read 27 November 2026 on ato.gov.au. A port of the
// `endorsement-review` command of ryanduguid/australian-accounting (main 7f3c3eb), checked by parity on
// every case of its tests. Each answer is tied to the provision it tests: ITAA 1997 ss 30-15 item 1,
// 30-125 (Compilation No. 268, 1 October 2026, read 27 November 2026), 30-130, 30-228, 50-5, 50-47, 50-50
// and 50-110, and TAA 1953 Sch 1 ss 426-45 and 426-55, as the command read them on 24 November 2026.
// The answers are the entity's; nothing is checked against a register.

/** @typedef {'income_tax_exempt_charity' | 'dgr_whole' | 'dgr_fund'} Worksheet */
/** @typedef {{ key: string, provision: string, outcome: string, action: string }} Question */
/** @typedef {{ question: string, provision: string, answer: boolean, outcome?: string, action?: string }} Finding */

/** What a 'No' means, most serious first. */
const NOT_ENTITLED = 'not_entitled';
const ACTION_NEEDED = 'action_needed';

const NOTICE = 'Tell the ATO in writing, before or as soon as practicable after the entity stops being entitled, and give the date it stopped (TAA 1953 Sch 1 s 426-45(1)).';
const ABN_GONE = 'Entitlement ended with the ABN; the ATO will have given notice of revocation, and no notice from the entity is needed for this (TAA 1953 Sch 1 s 426-45(3)).';
const CATEGORY = 'Tell the ATO in writing and give the date it stopped falling within the category (TAA 1953 Sch 1 s 426-45(1)); if it falls within another DGR category, write to the ATO about that.';
const AUSTRALIA = 'Not entitled for the period it was not in Australia: tell the ATO in writing so it can review the endorsement (TAA 1953 Sch 1 s 426-45(1)).';
const RECEIPTS = 'Correct how receipts are issued straight away: the Commissioner may revoke the endorsement for a contravention (TAA 1953 Sch 1 s 426-55(1)(c)).';
const IN_AUSTRALIA = 'ITAA 1997 s 30-15 item 1, special condition (a): the fund, authority or institution must be in Australia';

/** @param {string} key @param {string} provision @param {string} outcome @param {string} action @returns {Question} */
const ask = (key, provision, outcome, action) => ({ key, provision, outcome, action });

const CHARITY = [
  ask('abn_current', 'ITAA 1997 s 50-110(3): the entity must have an ABN', NOT_ENTITLED, ABN_GONE),
  ask('registered_charity', 'ITAA 1997 s 50-5 item 1.1 and s 50-47: a registered charity, registered with the ACNC', NOT_ENTITLED, NOTICE),
  ask('meets_a_test', 'ITAA 1997 s 50-50(1): the in Australia test, the DGR test or the prescribed by law test', NOT_ENTITLED, NOTICE),
  ask('meets_both_conditions', 'ITAA 1997 s 50-50(2): complies with the substantive requirements of its governing rules and applies '
    + 'its income and assets solely for its purpose', NOT_ENTITLED, NOTICE),
];

const DGR_WHOLE = [
  ask('abn_current', 'ITAA 1997 s 30-125(1)(a): the entity must have an ABN', NOT_ENTITLED, ABN_GONE),
  ask('within_category', 'ITAA 1997 s 30-125(1)(b): the fund, authority or institution falls within the DGR category on the ATO notice',
    NOT_ENTITLED, CATEGORY),
  ask('winding_up_clause', 'ITAA 1997 s 30-125(1)(c), (6) and (7): a law, the constituent documents or the rules must require surplus '
    + 'gifts and deductible contributions, and money received from them, to go to another DGR on winding up or revocation, unless the '
    + 'entity is established by an Act that does not provide for its winding up', NOT_ENTITLED,
  'Section 30-125(1)(c) makes the clause a condition of entitlement: tell the ATO in writing and give the date entitlement stopped '
    + '(TAA 1953 Sch 1 s 426-45(1)), and amend the governing documents to include a winding up and revocation clause, as the '
    + 'worksheet says (the ATO helps on 1300 130 248).'),
  ask('in_australia', IN_AUSTRALIA, NOT_ENTITLED, AUSTRALIA),
  ask('receipts_correct', 'ITAA 1997 s 30-228: a receipt for a gift or deductible contribution states the name, the ABN and what it is '
    + 'a receipt for', ACTION_NEEDED, RECEIPTS),
];

const DGR_FUND = [
  ask('abn_current', 'ITAA 1997 s 30-125(2)(a): the entity must have an ABN', NOT_ENTITLED, ABN_GONE),
  ask('within_category', 'ITAA 1997 s 30-125(2) and (2)(c): the fund, authority or institution falls within the DGR category on the '
    + 'ATO notice', NOT_ENTITLED, CATEGORY),
  ask('gift_fund_maintained', 'ITAA 1997 s 30-125(2)(e) and s 30-130: a gift fund for the principal purpose that receives only gifts, '
    + 'deductible contributions and money from them, and is used only for that purpose', NOT_ENTITLED,
  'Not entitled for the period the gift fund was not maintained: tell the ATO in writing so the endorsement can be revoked for that '
    + 'period (TAA 1953 Sch 1 s 426-45(1)).'),
  ask('in_australia', IN_AUSTRALIA, NOT_ENTITLED, AUSTRALIA),
  ask('receipts_correct', 'ITAA 1997 s 30-228: a receipt states the name of the fund, authority or institution, the DGR\'s ABN and what '
    + 'it is a receipt for', ACTION_NEEDED, RECEIPTS),
];

/** Conditions of entitlement the worksheets do not ask about. */
const NOT_ASKED_DGR = [
  'ITAA 1997 s 30-125(1)(b)(iii) and (2)(c): the special conditions of the s 30-15 table item and the Subdivision 30-B item',
  'ITAA 1997 s 30-125(1)(d) and (e): a giving or community charity trust fund, or a community charity corporation, and its trustees or '
    + 'directors, comply with the guidelines',
  'ITAA 1997 s 30-125(2)(d) and (6): for an entity endorsed for a fund, authority or institution, the winding up and revocation clause',
];
const NOT_ASKED_CHARITY = [
  'ITAA 1997 s 50-110(5)(b): an entity that has not yet carried on activities as a charity is tested on reasonable grounds for '
    + 'believing it will meet the conditions',
];

/** Each worksheet: its form, title, questions and the conditions it does not ask about. */
const SHEETS = new Map([
  ['income_tax_exempt_charity', { form: 'NAT 74110-02.2021', title: 'Income tax exempt charity (NAT 74110)', questions: CHARITY,
    notAsked: NOT_ASKED_CHARITY }],
  ['dgr_whole', { form: 'NAT 11685-02.2021 (Worksheet 1)', title: 'Worksheet 1, a DGR endorsed as a whole (NAT 11685)',
    questions: DGR_WHOLE, notAsked: NOT_ASKED_DGR }],
  ['dgr_fund', { form: 'NAT 11686-02.2021 (Worksheet 2)', title: 'Worksheet 2, a DGR endorsed for a fund, authority or institution '
    + '(NAT 11686)', questions: DGR_FUND, notAsked: NOT_ASKED_DGR }],
]);

/** The worksheets, in the order the page offers them. */
export const ENDORSEMENT_WORKSHEETS = [...SHEETS.keys()];

/** Each question as the page asks it, and its short name in the inputs line. */
export const ENDORSEMENT_QUESTIONS = new Map([
  ['abn_current', ['Is the entity’s ABN still current?', 'ABN current']],
  ['registered_charity', ['Is the entity a registered charity, registered with the ACNC?', 'registered charity']],
  ['meets_a_test', ['Does it meet at least one of the in Australia test, the DGR test or the prescribed by law test?', 'one of the 3 tests']],
  ['meets_both_conditions', ['Does it comply with the substantive requirements of its governing rules and apply its income and assets '
    + 'solely for the purpose for which it was established?', 'both conditions']],
  ['within_category', ['Does the fund, authority or institution still fall within the DGR category on the ATO notice?', 'within the category']],
  ['winding_up_clause', ['Do the governing documents require surplus gifts and deductible contributions to go to another DGR on winding '
    + 'up or revocation (or is the entity set up by an Act that does not provide for its winding up)?', 'winding up clause']],
  ['gift_fund_maintained', ['Does it maintain a gift fund for the principal purpose that receives only gifts, deductible contributions '
    + 'and money from them, used only for that purpose?', 'gift fund maintained']],
  ['in_australia', ['Is the fund, authority or institution in Australia?', 'in Australia']],
  ['receipts_correct', ['Do its receipts for gifts and deductible contributions state the name, the ABN and what each is a receipt for?',
    'receipts correct']],
]);

/** @param {string} code @param {string} message */
function refuse(code, message) {
  return Object.assign(new Error(message), { code });
}

/** @param {unknown} worksheet */
function sheetOf(worksheet) {
  const sheet = typeof worksheet === 'string' ? SHEETS.get(worksheet) : undefined;
  if (!sheet) throw refuse('endorsement_review.worksheet_invalid', 'Choose one of the 3 worksheets.');
  return sheet;
}

/**
 * The worksheet's answers, each a boolean, and no other key.
 * @param {unknown} answers @param {Question[]} questions @returns {boolean[]}
 */
function answersOf(answers, questions) {
  const bad = refuse('endorsement_review.answers_invalid', 'Answer each question on the worksheet yes or no.');
  if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) throw bad;
  const given = new Map(Object.entries(answers));
  if (given.size !== questions.length) throw bad;
  return questions.map(({ key }) => {
    const yes = given.get(key);
    if (typeof yes !== 'boolean') throw bad;
    return yes;
  });
}

/**
 * The review of one worksheet's answers: whether the entity continues to be entitled, needs to act or is
 * no longer entitled, with each answer's provision and, for a 'No', what it means and what to do.
 * @param {Worksheet} worksheet @param {Record<string, boolean>} answers
 */
export function endorsementReview(worksheet, answers) {
  const sheet = sheetOf(worksheet);
  const given = answersOf(answers, sheet.questions);
  const failed = sheet.questions.filter((_, i) => !given.at(i));
  let status = 'continues';
  if (failed.some((q) => q.outcome === NOT_ENTITLED)) status = NOT_ENTITLED;
  else if (failed.length) status = ACTION_NEEDED;
  /** @type {Finding[]} */
  const findings = sheet.questions.map((q, i) => (given.at(i) ? { question: q.key, provision: q.provision, answer: true }
    : { question: q.key, provision: q.provision, answer: false, outcome: q.outcome, action: q.action }));
  return { worksheet: sheet.form, status, findings, notAsked: [...sheet.notAsked],
    record: 'Have the Board, Committee or Trustee approve the completed worksheet and keep it with the entity’s records; do not send it to the ATO.' };
}

/** A question's form field name: abn_current is abn-current. @param {string} key */
export const endorsementField = (key) => key.replaceAll('_', '-');

/** The page's call from its fields. @param {(name: string) => string} value @returns {[Worksheet, Record<string, boolean>]} */
export function endorsementFormInput(value) {
  const worksheet = /** @type {Worksheet} */ (value('worksheet'));
  const sheet = sheetOf(worksheet);
  return [worksheet, Object.fromEntries(sheet.questions.map(({ key }) => [key, value(endorsementField(key)) === 'yes']))];
}

/** How the page writes the input. @param {Worksheet} worksheet @param {Record<string, boolean>} answers */
export function endorsementInputsText(worksheet, answers) {
  const sheet = sheetOf(worksheet);
  const given = new Map(Object.entries(answers));
  const no = sheet.questions.filter(({ key }) => given.get(key) === false)
    .map(({ key }) => ENDORSEMENT_QUESTIONS.get(key)?.[1]);
  return `${sheet.title}; ${sheet.questions.length} questions, no to ${no.length ? no.join(', ') : 'none'}`;
}

const STATUS_TEXT = new Map([
  ['continues', 'Still entitled on these answers: no need to contact the ATO, and review again each year and after a change'],
  [ACTION_NEEDED, 'Still entitled, but action is needed now'],
  [NOT_ENTITLED, 'Not entitled to the endorsement on these answers'],
]);

/** A question's row heading: ‘Winding up clause’. @param {string} key */
const heading = (key) => {
  const name = ENDORSEMENT_QUESTIONS.get(key)?.[1] ?? key;
  return name[0].toUpperCase() + name.slice(1);
};

/** A provision's citation without its statement of the rule: ‘ITAA 1997 s 30-228’. @param {string} provision */
const cited = (provision) => provision.split(': ')[0];

/** The page's result. @param {(name: string) => string} value */
export function endorsementReviewResult(value) {
  const [worksheet, answers] = endorsementFormInput(value);
  const r = endorsementReview(worksheet, answers);
  const rows = [['Outcome', `${STATUS_TEXT.get(r.status)}`], ['Worksheet', r.worksheet],
    ...r.findings.map((f) => [heading(f.question),
      f.answer ? `Yes. ${cited(f.provision)}.` : `No. ${f.action} ${f.provision}.`])];
  return { inputs: endorsementInputsText(worksheet, answers), rows, principal: 0,
    note: `Not asked by the worksheet, so not tested here: ${r.notAsked.map(cited).join('; ')}. ${r.record.slice(0, -1)}` };
}
