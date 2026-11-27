// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for Business Calculators Cohort C:
// PSI rules checker and rental property calculator.
// Imported by assets/webmcp-business-c.mjs.

import { requireWhen } from './webmcp-business-c-workforce.mjs';

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {import('./webmcp-tools.mjs').Schema} Schema */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

const RENTAL_EXPENSE_FIELDS = [
  ['advertisingForTenants', 'advertising_for_tenants', 'Advertising for tenants in AUD.'],
  ['bodyCorporateFees', 'body_corporate_fees', 'Body corporate fees and charges in AUD.'],
  ['cleaning', 'cleaning', 'Cleaning in AUD.'],
  ['councilRates', 'council_rates', 'Council rates in AUD.'],
  ['gardening', 'gardening', 'Gardening and lawn mowing in AUD.'],
  ['insurance', 'insurance', 'Insurance in AUD.'],
  ['landTax', 'land_tax', 'Land tax in AUD.'],
  ['legalExpenses', 'legal_expenses', 'Legal expenses in AUD.'],
  ['pestControl', 'pest_control', 'Pest control in AUD.'],
  ['propertyAgentFees', 'property_agent_fees', 'Property agent fees and commission in AUD.'],
  ['repairsAndMaintenance', 'repairs_and_maintenance', 'Repairs and maintenance in AUD.'],
  ['stationeryTelephonePostage', 'stationery_telephone_postage', 'Stationery, telephone and postage in AUD.'],
  ['travel', 'travel', 'Travel in AUD (shown and denied under ITAA 1997 s 26-31).'],
  ['waterCharges', 'water_charges', 'Water charges in AUD.'],
  ['sundry', 'sundry', 'Sundry rental expenses in AUD.'],
];

/** @param {Array<Record<string, any>> | undefined} payers */
function mapPsiPayers(payers) {
  if (payers === undefined) {
    return [{ amount: '0', associate: false, offer: false, result: false, tools: false, defects: false }];
  }
  return payers.map(({
    amount, isAssociate = false, wonByPublicOffer = false, paidForResult = false,
    suppliesTools = false, liableForDefects = false, samePayerAs, clientLabel,
  }) => ({
    amount,
    associate: isAssociate,
    offer: wonByPublicOffer,
    result: paidForResult,
    tools: suppliesTools,
    defects: liableForDefects,
    ...(samePayerAs === undefined ? {} : { same: samePayerAs }),
    ...(clientLabel === undefined ? {} : { client: clientLabel }),
  }));
}

/** @param {Record<string, boolean> | undefined} premises */
function mapPsiPremises(premises) {
  if (!premises) return { times: false, mainly: false, exclusive: false, private: false, clients: false };
  return {
    times: premises.allYear,
    mainly: premises.mainlyForPsi,
    exclusive: premises.exclusiveUse,
    private: premises.separateFromPrivate,
    clients: premises.separateFromClients,
  };
}

/** @param {ToolKit} kit @param {BusinessCalculators['psiDetermination']} psiDetermination */
export function psiDeterminationTool(kit, psiDetermination) {
  const { text, choice, whole, record, tool, CALCULATORS } = kit;
  const payerSchema = record({
    amount: text('cost', 'PSI received from this payer row in AUD.'),
    samePayerAs: whole(1, 4, 'Optional 1-based row number of an earlier row for the same payer and its associates.'),
    clientLabel: { type: 'string', minLength: 1, maxLength: 100, description: 'Optional client for the unrelated clients test '
      + '(s 87-20(1)(a)), on every row with PSI or none: rows with one label are one entity or associates of each other, rows '
      + 'with different labels are not, and one label stays within one payer’s rows. Without labels a payer’s rows count '
      + 'once, and where 2 or more such rows won by public offers decide the outcome the tool refuses and asks for labels.' },
    isAssociate: { type: 'boolean', description: 'true if this payer is an associate of the individual or entity; false when omitted.' },
    wonByPublicOffer: { type: 'boolean', description: 'true if engaged as a direct result of offers to the public (s 87-20); false when omitted.' },
    paidForResult: { type: 'boolean', description: 'true if paid to produce a result (s 87-18); false when omitted.' },
    suppliesTools: { type: 'boolean', description: 'true if required to supply plant, equipment or tools (s 87-18); false when omitted.' },
    liableForDefects: { type: 'boolean', description: 'true if liable for the cost of rectifying defects (s 87-18); false when omitted.' },
  }, ['amount']);
  const premisesSchema = record({
    allYear: { type: 'boolean', description: 'Maintained and used at all times during the year.' },
    mainlyForPsi: { type: 'boolean', description: 'Mainly used to produce the PSI.' },
    exclusiveUse: { type: 'boolean', description: 'Exclusive use by ownership or lease.' },
    separateFromPrivate: { type: 'boolean', description: 'Physically separate from private premises of the individual, entity or associate.' },
    separateFromClients: { type: 'boolean', description: 'Physically separate from each payer\'s and its associates\' premises.' },
  }, ['allYear', 'mainlyForPsi', 'exclusiveUse', 'separateFromPrivate', 'separateFromClients']);
  return tool({
    name: 'check_psi_rules',
    title: 'PSI rules checker',
    description: 'Step-by-step determination under ITAA 1997 Part 2-42 (Divisions 84 to 87) and TR 2022/3 of whether the '
      + 'personal services income (PSI) rules apply to one individual\'s PSI for one income year from AUD payer amounts: '
      + 's 84-5 threshold, s 85-35 employee/religious practitioner exclusions, PSB determination (s 87-15(1)), results test '
      + '(s 87-18, 75%), 80% single-source rule (s 87-15(3)), unrelated clients (s 87-20), employment (s 87-25) and business '
      + 'premises (s 87-30). Refuses s 87-40 agent cases at 75% or more commission. Returns statutory findings and shares only (no AUD amount).',
    inputSchema: record({
      earner: choice(['sole-trader', 'entity', 'employee', 'religious'], 'Who receives the income: "sole-trader", "entity" (company/partnership/trust), "employee" or "religious".'),
      mainlyPersonalEfforts: { type: 'boolean', description: 'true when over half the income is a reward for the individual\'s personal efforts or skills (s 84-5(1)).' },
      hasPsbDetermination: { type: 'boolean', description: 'true when a personal services business determination is in force (s 87-15(1)); false when omitted.' },
      payers: { type: 'array', maxItems: 5, items: payerSchema, description: 'Up to 5 payer rows (required when the steps reach the PSB tests).' },
      principalWorkByOthers: text('cost', 'Market value of principal work performed by others engaged in the year (s 87-25) in AUD; "0" when omitted.'),
      hadApprentice: { type: 'boolean', description: 'true when an apprentice was engaged for at least half the year (s 87-25); false when omitted.' },
      businessPremises: premisesSchema,
      paidAsAgent: { type: 'boolean', description: 'true when paid as an agent by a principal for services to its customers (s 87-40); false when omitted.' },
      agentPrincipalPayments: text('cost', 'Agent only: total payments from the principal in the year in AUD; required when paidAsAgent is true.'),
      agentCommission: text('cost', 'Agent only: commission or performance fees in those principal payments in AUD; required when paidAsAgent is true.'),
    }, ['earner', 'mainlyPersonalEfforts']),
    run({
      earner, mainlyPersonalEfforts, hasPsbDetermination = false, payers, principalWorkByOthers = '0',
      hadApprentice = false, businessPremises, paidAsAgent = false, agentPrincipalPayments, agentCommission,
    }) {
      requireWhen(paidAsAgent, agentPrincipalPayments, 'agentPrincipalPayments', 'when paidAsAgent is true');
      requireWhen(paidAsAgent, agentCommission, 'agentCommission', 'when paidAsAgent is true');
      const r = psiDetermination({
        earner,
        mainly: mainlyPersonalEfforts,
        determination: hasPsbDetermination,
        payers: mapPsiPayers(payers),
        agent: paidAsAgent,
        commission: agentCommission ?? '0',
        principal: agentPrincipalPayments ?? '0',
        others: principalWorkByOthers,
        apprentice: hadApprentice,
        premises: mapPsiPremises(businessPremises),
      });
      return {
        rule: r.rule,
        effect: r.effect,
        isPersonalServicesBusiness: r.psb,
        resultsTestPercent: r.results === null ? null : r.results.toFixed(2),
        largestSingleSourcePercent: r.source === null ? null : r.source.toFixed(2),
        unrelatedClientsCount: r.unrelated,
        employmentTestPercent: r.employment === null ? null : r.employment.toFixed(2),
        steps: r.steps.map(([step, finding]) => ({ step, finding })),
        source: `${CALCULATORS}psi-determination/`,
      };
    },
  });
}

/** @param {Record<string, string> | undefined} obj */
function mapRentalExpenseLines(obj) {
  if (!obj) return {};
  const supplied = new Map(Object.entries(obj));
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const [camel, snake] of RENTAL_EXPENSE_FIELDS) {
    const val = supplied.get(camel);
    if (val !== undefined) out.set(snake, val);
  }
  return Object.fromEntries(out);
}

/** @param {Array<Record<string, any>>} loans */
function mapRentalLoans(loans) {
  return loans.map(({ interest, principalForRental, principalTotal, redrawnInYear = false }) => ({
    interest,
    principal_for_rental: principalForRental,
    principal_total: principalTotal,
    redrawn_in_year: redrawnInYear,
  }));
}

/** @param {Array<Record<string, any>>} loans */
function mapRentalBorrowingLoans(loans) {
  return loans.map(({
    borrowingExpenses, firstBorrowed, contractEnd = null, repaidOn = null, incomeUse, refinances,
  }) => ({
    borrowing_expenses: borrowingExpenses,
    loan_start: firstBorrowed,
    loan_term_end: contractEnd,
    repaid_on: repaidOn,
    income_use: incomeUse,
    section_26_50_applies: false,
    ...(refinances === undefined ? {} : { refinances }),
  }));
}

/** @param {Record<string, any>} w */
function mapRentalCapitalWork(w) {
  return {
    construction_expenditure: w.constructionExpenditure,
    kind: w.kind,
    began: w.beganDate,
    first_used: w.firstUsedDate,
    ...(w.takenToBeginBefore16September1987 === undefined
      ? {}
      : { taken_to_begin_before_16_september_1987: w.takenToBeginBefore16September1987 }),
  };
}

/** @param {Record<string, any>} a */
function mapRentalAsset(a) {
  return {
    decline_in_value: a.declineInValue,
    acquired: a.acquiredDate,
    first_used: a.firstUsedDate,
    held_when_first_used: a.heldWhenFirstUsed,
    residence_or_private_use: a.residenceOrPrivateUse,
    low_value_pool: a.lowValuePool,
    ...(a.newPremisesException === undefined ? {} : { new_premises_exception: a.newPremisesException }),
    ...(a.deductibleIn2016_17 === undefined ? {} : { deductible_in_2016_17: a.deductibleIn2016_17 }),
  };
}

/** @param {Record<string, any>} input */
function buildRentalInput(input) {
  const {
    disposedDate = null, section26_50Applies = false, income = {}, loans = [],
    capitalWorks = [], depreciatingAssets = [],
  } = input;
  /** @type {Record<string, unknown>} */
  const out = {
    year: input.incomeYear,
    ownership_share: input.ownershipShare,
    acquired: input.acquiredDate,
    disposed: disposedDate,
    days_available: input.daysAvailable,
    section_26_50_applies: section26_50Applies,
    income: {
      ...(income.rentalIncome === undefined ? {} : { rental_income: income.rentalIncome }),
      ...(income.otherRentalIncome === undefined ? {} : { other_rental_income: income.otherRentalIncome }),
    },
    expenses: mapRentalExpenseLines(input.expenses),
    rental_only_expenses: mapRentalExpenseLines(input.rentalOnlyExpenses),
    loans: mapRentalLoans(loans),
    capital_works: capitalWorks.map(mapRentalCapitalWork),
    depreciating_assets: depreciatingAssets.map(mapRentalAsset),
  };
  if (input.borrowingExpenses !== undefined) out.borrowing_expenses = input.borrowingExpenses;
  if (input.borrowingLoans !== undefined) out.borrowing_loans = mapRentalBorrowingLoans(input.borrowingLoans);
  if (input.borrowingExpenses === undefined && input.borrowingLoans === undefined) out.borrowing_expenses = '0';
  if (input.otherTaxableIncome !== undefined) out.other_taxable_income = String(input.otherTaxableIncome);
  if (input.scopeConfirmed !== undefined) out.scope_confirmed = input.scopeConfirmed;
  return out;
}

/** @param {ToolKit} kit @returns {Record<string, Schema>} */
function rentalSubSchemas(kit) {
  const { text, choice, whole, record } = kit;
  const expenseSchema = record(
    Object.fromEntries(RENTAL_EXPENSE_FIELDS.map(([camel, , desc]) => [camel, text('cost', desc)])),
    [],
  );
  const loanSchema = record({
    interest: text('cost', 'Interest charged on owner\'s share in the year in AUD.'),
    principalForRental: text('cost', 'Outstanding principal used for the rental in AUD.'),
    principalTotal: text('cost', 'Total outstanding principal of the loan in AUD.'),
    redrawnInYear: { type: 'boolean', description: 'true if redrawn or drawn further in the year (refused); false when omitted.' },
  }, ['interest', 'principalForRental', 'principalTotal']);
  const borrowingLoanSchema = record({
    borrowingExpenses: text('cost', 'Borrowing expenses in AUD.'),
    firstBorrowed: text('date', 'First day borrowed, YYYY-MM-DD, from 2017-07-01.'),
    contractEnd: text('date', 'Original loan contract end date, YYYY-MM-DD; omit when none.'),
    repaidOn: text('date', 'Date repaid, YYYY-MM-DD; omit when not repaid.'),
    incomeUse: text('share', 'Income-producing fraction from "0" to "1".'),
    refinances: whole(1, 19, 'Earlier loan number refinanced, from 1; omit when none.'),
  }, ['borrowingExpenses', 'firstBorrowed', 'incomeUse']);
  const worksSchema = record({
    constructionExpenditure: text('cost', 'Whole property construction expenditure in AUD.'),
    kind: choice(['building', 'structural_improvement'], '"building" or "structural_improvement".'),
    beganDate: text('date', 'Date construction began, YYYY-MM-DD.'),
    firstUsedDate: text('date', 'Date first used by anyone after construction, YYYY-MM-DD.'),
    takenToBeginBefore16September1987: { type: 'boolean', description: 'Required for a building begun after 15 September 1987: true if taken under s 43-220 to have begun before 16 September 1987.' },
  }, ['constructionExpenditure', 'kind', 'beganDate', 'firstUsedDate']);
  const assetSchema = record({
    declineInValue: text('cost', 'Whole property decline in value for the year in AUD.'),
    acquiredDate: text('date', 'Date acquired or contracted, YYYY-MM-DD.'),
    firstUsedDate: text('date', 'Date first used or installed ready for use, YYYY-MM-DD.'),
    heldWhenFirstUsed: { type: 'boolean', description: 'true when you held the asset when first used or installed.' },
    residenceOrPrivateUse: { type: 'boolean', description: 'true when used in your residence or privately more than occasionally.' },
    lowValuePool: { type: 'boolean', description: 'true when in a low-value pool.' },
    newPremisesException: { type: 'boolean', description: 'Required when heldWhenFirstUsed is false: true if supplied with new residential premises (s 40-27(4)/(5)).' },
    deductibleIn2016_17: { type: 'boolean', description: 'Required when acquiredDate is before 2017-05-09: true if anything was deductible for 2016-17.' },
  }, ['declineInValue', 'acquiredDate', 'firstUsedDate', 'heldWhenFirstUsed', 'residenceOrPrivateUse', 'lowValuePool']);
  return { expenseSchema, loanSchema, borrowingLoanSchema, worksSchema, assetSchema };
}

/**
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'rentalProperty' | 'RENTAL_YEARS'>} calculate
 */
export function rentalPropertyTool(kit, calculate) {
  const { text, choice, whole, record, tool, dollars, centsText, CALCULATORS } = kit;
  const { expenseSchema, loanSchema, borrowingLoanSchema, worksSchema, assetSchema } = rentalSubSchemas(kit);
  return tool({
    name: 'calculate_rental_property',
    title: 'Rental property calculator',
    description: 'One owner\'s residential rental property income, apportioned and rental-only deductions, mixed-use loan '
      + 'interest (TR 2000/2), borrowing expenses (s 25-25), Division 43 capital works (2.5% or 4%), depreciating asset '
      + 'decline in value (with s 40-27 second-hand denial), net rent in AUD and, for 2024-25 to 2026-27, estimated resident '
      + 'tax scale effect for 2020-21 to 2026-27. Travel is shown and denied (s 26-31). Refuses holiday homes denied by '
      + 's 26-50, loans redrawn in the year, assets acquired on 9 May 2017, 2027-28 and unclear part-year availability.',
    inputSchema: record({
      incomeYear: choice(calculate.RENTAL_YEARS, `Income year from ${calculate.RENTAL_YEARS[0]} to ${calculate.RENTAL_YEARS.at(-1)}.`),
      ownershipShare: text('share', 'Owner\'s legal interest as a decimal above 0 and at most 1, for example "1" or "0.5".'),
      acquiredDate: text('date', 'Date the property was acquired, YYYY-MM-DD (1900 to 2100).'),
      disposedDate: text('date', 'Optional date the owner stopped holding the property in the income year, YYYY-MM-DD.'),
      daysAvailable: whole(0, 366, 'Whole days held in the year that the property was let or available for rent on commercial terms.'),
      section26_50Applies: { type: 'boolean', description: 'true if a holiday home whose costs ITAA 1997 s 26-50 denies (refused); false when omitted.' },
      scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation; false refuses.' },
      income: record({
        rentalIncome: text('cost', 'Whole property rent in AUD.'),
        otherRentalIncome: text('cost', 'Whole property other rental income in AUD.'),
      }, []),
      expenses: expenseSchema,
      rentalOnlyExpenses: expenseSchema,
      loans: { type: 'array', maxItems: 20, items: loanSchema, description: 'Owner\'s rental loans (not divided by ownershipShare); omit or [] for none.' },
      borrowingExpenses: text('cost', 'This year\'s section 25-25 borrowing expenses deduction in AUD; cannot be combined with borrowingLoans.'),
      borrowingLoans: { type: 'array', maxItems: 20, items: borrowingLoanSchema, description: 'Optional loans to run through the s 25-25 schedule; cannot be combined with borrowingExpenses.' },
      capitalWorks: { type: 'array', maxItems: 20, items: worksSchema, description: 'Optional Division 43 capital works items.' },
      depreciatingAssets: { type: 'array', maxItems: 50, items: assetSchema, description: 'Optional depreciating assets.' },
      otherTaxableIncome: whole(0, 1000000000, 'Optional whole-dollar other taxable income in AUD (2024-25 to 2026-27 only) for resident tax scale effect.'),
    }, ['incomeYear', 'ownershipShare', 'acquiredDate', 'daysAvailable']),
    run(input) {
      const r = calculate.rentalProperty(buildRentalInput(input));
      return {
        incomeYear: r.year,
        ownershipShare: r.ownershipShare,
        daysHeld: r.daysHeld,
        daysAvailable: r.daysAvailable,
        heldFrom: r.from,
        heldTo: r.to,
        grossRent: dollars(r.grossRent),
        totalDeductions: dollars(r.totalDeductions),
        netRent: dollars(r.netRent),
        amounts: Object.fromEntries(Object.entries(r.amounts).map(([k, v]) => [k, dollars(v)])),
        loans: r.loans.map((l) => ({
          loan: l.loan, interest: dollars(l.interest), principalForRental: dollars(l.principalForRental),
          principalTotal: dollars(l.principalTotal), deduction: dollars(l.deduction),
        })),
        capitalWorks: r.capitalWorks.map((w) => ({
          kind: w.kind, began: w.began, rate: w.rate, reasonNil: w.why,
          usePeriodDays: w.usePeriodDays, undeducted: w.undeducted === null ? null : dollars(w.undeducted),
          daysUsed: w.daysUsed, deduction: dollars(w.deduction),
        })),
        depreciatingAssets: r.assets.map((a) => ({
          declineInValue: dollars(a.decline), acquired: a.acquired, reasonNil: a.why, deduction: dollars(a.deduction),
        })),
        borrowingLoans: r.borrowingLoans.map((l) => ({
          loan: l.loan, periodTo: l.to, periodBasis: l.basis, spread: l.spread, totalDeduction: centsText(l.total),
          years: l.rows.map((row) => ({
            incomeYear: row.income_year, remaining: centsText(row.remaining), daysInYear: row.days, daysLeft: row.left,
            maximum: centsText(row.maximum), deduction: centsText(row.deduction), section26_155: row.section_26_155,
            projected: row.projected,
          })),
        })),
        currency: 'AUD',
        source: `${CALCULATORS}rental-property/`,
      };
    },
  });
}
