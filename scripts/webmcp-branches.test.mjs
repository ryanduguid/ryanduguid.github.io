// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP calculator tool inputs that scripts/webmcp-tools.test.mjs does not send: conditional
// fields given without their condition, duty cases the grant tool does not compute, plug-in hybrid
// cars, parking by spaces, business premises, home absences and statement penalties without a shortfall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as calculate from '../assets/business-calculators.mjs';
import { calculatorTools } from '../assets/webmcp-tools.mjs';

const tools = calculatorTools(calculate);

test('the Division 7A schedule tool refuses a repayment past the term or given twice for a year', async () => {
  const loan = { madeDate: '2022-10-01', amount: '100000', termYears: '7', assumedBenchmarkRate: '8.77' };
  await assert.rejects(tools['div7a-schedule'].execute({ ...loan, repayments: [{ yearNumber: 8, amount: '1000' }] }),
    { message: 'Repayment yearNumber 8 exceeds the 7-year loan term.' });
  await assert.rejects(tools['div7a-schedule'].execute({ ...loan, repayments: [{ yearNumber: 2, amount: '1000' }, { yearNumber: 2, amount: '5' }] }),
    { message: 'Duplicate repayment for yearNumber 2.' });
});

test('the first home owner grant tool says why it computes no duty for a building contract or an early contract', async () => {
  const facts = { person: true, citizen: true, first: true, residence: true };
  const built = await tools['first-home-owner-grant'].execute({ place: 'AU-NSW', contractDate: '2026-08-01', home: 'built', value: 600000,
    facts: { ...facts, contract: true } });
  assert.deepEqual(built.transferDuty, { computed: false,
    reason: 'Duty on a building contract falls on the land, and first home buyer concessions on vacant land are not computed.',
    firstHomeBuyerDuty: null, generalDuty: null, concessionApplies: null });
  const early = await tools['first-home-owner-grant'].execute({ place: 'AU-NSW', contractDate: '2026-01-15', home: 'bought', value: 600000, facts });
  assert.equal(early.transferDuty.computed, false);
  assert.match(early.transferDuty.reason, /^Transfer duty rates cover contracts from \d{4}-\d\d-\d\d\.$/);
});

test('the payday super tool ties next payday, determination and late receipt dates to the timing that uses them', async () => {
  const pay = { regime: 'payday', payday: '2026-07-30', qualifyingEarnings: '1000' };
  const sgc = tools['sgc-payday'];
  await assert.rejects(sgc.execute({ ...pay, timing: 'out-of-cycle' }), { message: 'nextPayday is required for out-of-cycle timing.' });
  await assert.rejects(sgc.execute({ ...pay, timing: 'exceptional' }), { message: 'determinationDate is required for exceptional circumstances timing.' });
  await assert.rejects(sgc.execute({ ...pay, determinationDate: '2026-08-01' }), { message: 'determinationDate applies only to exceptional circumstances timing.' });
  await assert.rejects(sgc.execute({ ...pay, lateReceiptDate: '2026-08-25' }), { message: 'lateReceiptDate applies only when receivedLate is above zero.' });
});

test('the FBT car tool passes a plug-in hybrid’s commitment answers to the exemption test', async () => {
  const car = { method: 'statutory', costPrice: '60000', daysAvailable: 182, employeeContribution: '0', gstCreditEntitled: true };
  const ev = { currentEmployee: true, firstHeldAndUsed: '2024-04-01', firstRetailSale: '2024-04-01', lctValue: '60000', lctOnOtherSupply: false };
  const kept = await tools['fbt-car'].execute({ ...car, vehicleKind: 'plug-in-hybrid', electricCar: { ...ev,
    hybridCommittedBefore1April2025: true, hybridNewCommitmentFrom1April2025: false, hybridExemptBefore1April2025: true } });
  const lost = await tools['fbt-car'].execute({ ...car, vehicleKind: 'plug-in-hybrid', electricCar: { ...ev,
    hybridCommittedBefore1April2025: false, hybridNewCommitmentFrom1April2025: false, hybridExemptBefore1April2025: false } });
  assert.equal(kept.taxableValue, '0.00');
  assert.notEqual(lost.taxableValue, '0.00');
  await assert.rejects(tools['fbt-car'].execute({ ...car, vehicleKind: 'plug-in-hybrid', electricCar: ev }), /hybridCommittedBefore1April2025/);
});

test('the car parking tool reports the statutory spaces benefit and its averages', async () => {
  const r = await tools['fbt-car-parking'].execute({ method: 'spaces', firstBusinessDayFee: '15.00', dailyRate: '10', spaces: 4, availabilityDays: 182,
    employeesStart: 3, employeesEnd: 3, spacesStart: 4, spacesEnd: 4 });
  assert.ok(Number(r.totalStatutoryBenefit) > 0);
  assert.equal(r.averageEmployees, 3);
  assert.equal(r.averageEligibleSpaces, 4);
});

test('the PSI tool applies the business premises test from the premises answers', async () => {
  const earner = { earner: 'sole-trader', mainlyPersonalEfforts: true, hasPsbDetermination: false,
    payers: [{ amount: '18000' }, { amount: '18000' }] };
  const premises = { allYear: true, mainlyForPsi: true, exclusiveUse: true, separateFromPrivate: true, separateFromClients: true };
  const met = await tools['psi-determination'].execute({ ...earner, businessPremises: premises });
  const unmet = await tools['psi-determination'].execute({ ...earner, businessPremises: { ...premises, exclusiveUse: false } });
  assert.equal(met.isPersonalServicesBusiness, true);
  assert.equal(unmet.isPersonalServicesBusiness, false);
});

test('the objection tool needs the first notice date for an amended assessment', async () => {
  await assert.rejects(tools['objection-deadline'].execute({ decision: 'amended', reviewPeriodYears: '2', noticeDate: '2026-11-18',
    amendedNoticeDate: '2025-11-18' }),
    { message: 'firstNoticeDate is required for an amended assessment.' });
});

test('the margin scheme tool refuses registration days for an entity registered at 1 July 2000', async () => {
  await assert.rejects(tools['gst-margin-scheme'].execute({ interest: 'freehold', taxable: true, agreedInWriting: true,
    acquired: 'before-2000', method: 'valuation', price: '500000', priceBasis: 'inclusive', cost: '100000', valuationDay: '2000-07-01',
    registrationAtTransition: 'yes', valuationProperty: 'improved', registrationEffectiveDay: '2000-07-01' }),
  { message: 'registrationEffectiveDay and registrationApplicationDay apply only when registered after 1 July 2000.' });
});

test('the CGT tool counts an absence chosen as the main residence', async () => {
  const sale = { entity: 'individual', assetKind: 'home', purchaseContractDate: '2018-01-10', saleContractDate: '2026-02-01',
    proceeds: '850000', purchasePrice: '600000' };
  const home = { purchaseSettlementDate: '2018-02-15', saleSettlementDate: '2026-03-15', movedInDate: '2018-02-15' };
  const away = { from: '2020-01-01', to: '2022-12-31', rented: false };
  const chosen = await tools.cgt.execute({ ...sale, home: { ...home, absences: [{ ...away, treatAsMainResidence: true }] } });
  const notChosen = await tools.cgt.execute({ ...sale, home: { ...home, absences: [{ ...away, treatAsMainResidence: false }] } });
  assert.equal(chosen.netCapitalGain, '0.00');
  assert.ok(Number(notChosen.netCapitalGain) > 0);
});

test('the CGT concessions tool takes a Commissioner extension only with the day the business ceased', async () => {
  const base = { entity: 'individual', assetKind: 'business', purchaseContractDate: '2014-03-03', saleContractDate: '2026-02-02',
    businessInSaleYear: 'yes', businessInPreviousYear: true, previousYearTurnover: '2150000', businessInEarlierYear: true,
    earlierYearTurnover: '1900000', likelyTurnover: '2100000', actualTurnover: '1950000', netAssetValue: '6200000', activeDays: 3000,
    dateOfBirth: '1975-08-14', retirementChoiceDate: '2026-10-31' };
  await assert.rejects(tools['cgt-concessions'].execute({ ...base, commissionerExtension: true }),
    { message: 'commissionerExtension applies only when businessCeasedDate is supplied.' });
});

test('the penalties tool works a statement part without a shortfall in penalty units, and refuses what that part cannot carry', async () => {
  const statement = { question: 'statement_penalty', incomeYear: '2026-27', statementDate: '2026-08-01', significantGlobalEntity: false };
  const tool = tools['ato-penalties-interest'];
  const r = await tool.execute({ ...statement, parts: [{ behaviour: 'recklessness' }] });
  assert.equal(typeof r.parts[0].penaltyUnits, 'number');
  assert.match(r.parts[0].penaltyUnit, /^\d+\.\d\d$/);
  await assert.rejects(tool.execute({ ...statement, parts: [{ behaviour: 'recklessness', notReasonablyArguable: true }] }),
    /not reasonably arguable and the accepted-way amount need a shortfall amount/);
  await assert.rejects(tool.execute({ question: 'overpayment_interest', incomeYear: '2025-26', payments: [], refunded: '2000',
    refundedOn: '2026-02-01', noticeIssued: '2025-10-15', relevantTax: true, decisionToWhichActApplies: true }), /payments must be a list of 1 to/);
});
