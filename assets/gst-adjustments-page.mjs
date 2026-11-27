// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The GST adjustments calculator page: the form's fields read as one of the 6 commands' input, and the result shown.
import { gstAnnualApportionment, gstBadDebt, gstCreditablePurposeChange, gstFinancialAcquisitionsThreshold, gstGoingConcern,
  gstSecondHandGoods, parseDay, refuse } from './gst-adjustments.mjs';
/** @typedef {import('./gst-adjustments.mjs').Condition} Condition */

// The page: one worksheet a calculation, its fields read as the command's input.
const ENGINES = /** @type {const} */ ({ 'creditable-purpose': gstCreditablePurposeChange, 'annual-apportionment': gstAnnualApportionment,
  'financial-acquisitions': gstFinancialAcquisitionsThreshold, 'going-concern': gstGoingConcern, 'second-hand-goods': gstSecondHandGoods,
  'bad-debt': gstBadDebt });
/** @typedef {keyof typeof ENGINES} GstWorksheet */
export const GST_WORKSHEETS = Object.keys(ENGINES);

/** A percentage as the command's fraction, exact: 12.5 is 0.125. An entry that is not one passes on blank, which the command
 * refuses. @param {string} percent */
export function percentFraction(percent) {
  const parts = /^(\d+)(?:\.(\d+))?$/.exec(percent.trim()); // eslint-disable-line security/detect-unsafe-regex -- anchored, with no repetition over overlapping characters: linear
  if (!parts) return '';
  const places = (parts[2] ?? '').length + 2;
  const text = String(BigInt(parts[1] + (parts[2] ?? ''))).padStart(places + 1, '0');
  return `${text.slice(0, -places)}.${text.slice(-places)}`;
}
/** The command's fraction as the percentage the page shows: 0.125 is 12.5%. @param {unknown} text */
function fractionPercent(text) {
  if (typeof text !== 'string') return String(text);
  const [whole, part = '', ...rest] = text.split('.');
  if (rest.length || !/^\d+$/.test(whole) || (text.includes('.') && !/^\d+$/.test(part))) return text;
  const places = part.padEnd(2, '0');
  let shown = `${BigInt(whole + places.slice(0, 2))}.${places.slice(2)}`;
  while (shown.endsWith('0')) shown = shown.slice(0, -1);
  if (shown.endsWith('.')) shown = shown.slice(0, -1);
  return `${shown}%`;
}
/** @param {unknown} text */
const longDate = (text) => (parseDay(text) !== null
  ? new Date(`${text}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : String(text));

/** The worksheet the form names and the command's input from its fields. @param {(name: string) => string} value
 * @returns {{worksheet: GstWorksheet, input: Record<string, unknown>}} */
export function gstFormInput(value) {
  const chosen = value('worksheet');
  const worksheet = /** @type {GstWorksheet} */ (chosen in ENGINES ? chosen : 'creditable-purpose');
  const yes = (/** @type {string} */ name) => value(name) === 'yes';
  const given = (/** @type {string} */ name) => value(name).trim() !== '';
  const common = { year: value('year'), scope_confirmed: true };
  if (worksheet === 'creditable-purpose') {
    const months = value('cp-months');
    return { worksheet, input: { gst_exclusive_value: value('cp-value'), relates_to_business_finance: yes('cp-finance'),
      full_input_tax_credit: value('cp-credit'), intended_or_former_application: percentFraction(value('cp-former')),
      actual_application: percentFraction(value('cp-actual')), application_basis: value('cp-basis'), attributed_period_end: value('cp-attributed'),
      tax_period_months: /^\d{1,2}$/.test(months) ? Number(months) : months,
      ...(given('cp-ended') ? { ended_on: value('cp-ended'), division_132_disposal: yes('cp-disposal') } : {}), ...common } };
  }
  if (worksheet === 'annual-apportionment') {
    return { worksheet, input: { small_business_entity: yes('aa-small'), carries_on_business: yes('aa-business'),
      instalment_election: yes('aa-instalments'), annual_tax_period_election: yes('aa-annual'), election_made: yes('aa-elected'),
      gst_on_acquisition: value('aa-gst'), creditable_purpose: percentFraction(value('aa-purpose')), car: yes('aa-car'),
      reduced_credit_acquisition: yes('aa-reduced'),
      ...(!yes('aa-small') && !yes('aa-business') ? { gst_turnover: value('aa-turnover') } : {}),
      ...(given('aa-input-taxed') ? { non_input_taxed_extent: percentFraction(value('aa-input-taxed')) } : {}),
      ...(given('aa-consideration') ? { consideration_extent: percentFraction(value('aa-consideration')) } : {}), ...common } };
  }
  if (worksheet === 'financial-acquisitions') {
    return { worksheet, input: { current_financial_credits: value('fat-current-financial'), current_total_credits: value('fat-current-total'),
      future_financial_credits: value('fat-future-financial'), future_total_credits: value('fat-future-total'), gst_group: yes('fat-group'), ...common } };
  }
  if (worksheet === 'going-concern') {
    return { worksheet, input: { for_consideration: yes('gc-consideration'), recipient_registration: value('gc-registration'),
      written_agreement: value('gc-agreement'), all_things_necessary: yes('gc-all-things'), carried_on_until_supply: yes('gc-carried-on'),
      farm_land: yes('gc-farm-land'), part_outside_arrangement: yes('gc-part-outside'), ...common } };
  }
  if (worksheet === 'second-hand-goods') {
    const over = /^\d+(\.\d+)?$/.test(value('shg-consideration').trim()) && Number(value('shg-consideration')) > 300; // eslint-disable-line security/detect-unsafe-regex -- anchored, with no repetition over overlapping characters: linear
    return { worksheet, input: { consideration: value('shg-consideration'), acquired_for_sale_or_exchange: yes('shg-for-sale'),
      animals_or_plants: yes('shg-animals'), supply_to_you: value('shg-supply'), imported: yes('shg-imported'), by_way_of_hire: yes('shg-hire'),
      resupply_taxable: yes('shg-resupply-taxable'), divided_for_resupply: yes('shg-divided'), valuable_metal: yes('shg-metal'),
      leased_before_sale: yes('shg-leased'), ...(over ? { resupply_gst: value('shg-resupply-gst') } : {}), ...common } };
  }
  const supplier = value('bd-party') === 'supplier';
  const event = value('bd-event');
  return { worksheet, input: { party: value('bd-party'), event, amount: value('bd-amount'), taxable_or_creditable: yes('bd-qualifies'),
    cash_basis: yes('bd-cash'), special_rule: value('bd-special'),
    ...(event === 'recovered' ? { prior_adjustment: yes('bd-prior') } : { attributed: yes('bd-attributed') }),
    ...(event === 'overdue_12_months' ? { overdue_from: value('bd-from'), as_at: value('bd-as-at') } : {}),
    ...(supplier && given('bd-proportion') ? { taxable_proportion: percentFraction(value('bd-proportion')) } : {}),
    ...(!supplier && given('bd-purpose') ? { creditable_purpose: percentFraction(value('bd-purpose')) } : {}),
    ...(!supplier && given('bd-extent') ? { consideration_extent: percentFraction(value('bd-extent')) } : {}),
    ...(!supplier ? { reduced_credit_acquisition: yes('bd-reduced'), annual_apportionment: yes('bd-annual') } : {}), ...common } };
}

const WORDS = /** @type {Record<string, string>} */ ({ registered: 'registered', required_to_be_registered: 'required to be registered',
  on_or_before_supply_day: 'on or before the day of supply', after_supply_day: 'after the day of supply', none: 'none',
  taxable: 'taxable', gst_free: 'GST-free', written_off: 'written off', overdue_12_months: 'overdue 12 months', recovered: 'recovered',
  supplier: 'supplier', recipient: 'recipient' });
/** @param {unknown} v */
const word = (v) => (typeof v === 'string' ? WORDS[v] ?? v.replaceAll('_', ' ') : String(v)); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice

/** How the page writes each worksheet's input.
 * @param {string} worksheet @param {Record<string, any>} x @param {(value: number) => string} aud */
export function gstInputsText(worksheet, x, aud) {
  const money = (/** @type {unknown} */ text) => aud(Number(text));
  const yn = (/** @type {unknown} */ v, /** @type {string} */ what) => `${v ? '' : 'not '}${what}`;
  if (worksheet === 'creditable-purpose') {
    return `${x.year} creditable purpose change; GST exclusive value ${money(x.gst_exclusive_value)}, ${yn(x.relates_to_business_finance,
      'business finance')}, full input tax credit ${money(x.full_input_tax_credit)}, intended or former ${fractionPercent(
      x.intended_or_former_application)}, actual ${fractionPercent(x.actual_application)}, basis ‘${x.application_basis}’, attributed to the `
      + `period ending ${longDate(x.attributed_period_end)}, ${x.tax_period_months} month tax periods${'ended_on' in x ? `, application ended `
      + `${longDate(x.ended_on)}${x.division_132_disposal ? ' by a Division 132 supply' : ''}` : ''}`;
  }
  if (worksheet === 'annual-apportionment') {
    return `${x.year} annual apportionment; ${yn(x.small_business_entity, 'a small business entity')}, ${yn(x.carries_on_business,
      'carrying on a business')}${'gst_turnover' in x ? `, GST turnover ${money(x.gst_turnover)}` : ''}, ${yn(x.instalment_election,
      'paying by instalments')}, ${yn(x.annual_tax_period_election, 'with annual tax periods')}, election ${x.election_made ? 'made' : 'not made'}, `
      + `GST ${money(x.gst_on_acquisition)}, creditable purpose ${fractionPercent(x.creditable_purpose)}${'non_input_taxed_extent' in x
        ? `, not for input taxed supplies ${fractionPercent(x.non_input_taxed_extent)}` : ''}${'consideration_extent' in x ? `, consideration provided `
        + `${fractionPercent(x.consideration_extent)}` : ''}, ${yn(x.car, 'a car')}, ${yn(x.reduced_credit_acquisition, 'reduced credit')}`;
  }
  if (worksheet === 'financial-acquisitions') {
    return `${x.year} financial acquisitions threshold; ${yn(x.gst_group, 'a GST group')}, past 12 months ${money(x.current_financial_credits)} `
      + `of ${money(x.current_total_credits)}, next 12 months ${money(x.future_financial_credits)} of ${money(x.future_total_credits)}`;
  }
  if (worksheet === 'going-concern') {
    return `${x.year} going concern; ${yn(x.for_consideration, 'for consideration')}, recipient ${x.recipient_registration === 'neither' ? 'neither registered nor required to be' : word(x.recipient_registration)}, written `
      + `agreement ${word(x.written_agreement)}, ${yn(x.all_things_necessary, 'all things necessary')}, ${yn(x.carried_on_until_supply,
        'carried on until the supply')}, ${yn(x.farm_land, 'farm land')}, ${yn(x.part_outside_arrangement, 'part outside the arrangement')}`;
  }
  if (worksheet === 'second-hand-goods') {
    return `${x.year} second-hand goods; consideration ${money(x.consideration)}, ${yn(x.acquired_for_sale_or_exchange, 'for sale or exchange')}, `
      + `${yn(x.animals_or_plants, 'animals or plants')}, supply to you ${x.supply_to_you === 'neither' ? 'neither taxable nor GST-free' : word(x.supply_to_you)}, ${yn(x.imported, 'imported')}, ${yn(
        x.by_way_of_hire, 'by hire')}, ${yn(x.resupply_taxable, 'resupply taxable')}, ${yn(x.divided_for_resupply, 'divided')}, ${yn(
        x.valuable_metal, 'valuable metal')}, ${yn(x.leased_before_sale, 'leased first')}${'resupply_gst' in x ? `, GST on the resupply `
        + `${money(x.resupply_gst)}` : ''}`;
  }
  const extent = [['taxable_proportion', 'taxable proportion'], ['creditable_purpose', 'creditable purpose'],
    ['consideration_extent', 'consideration provided']].filter(([k]) => k in x).map(([k, label]) => `, ${label} ${fractionPercent(x[k])}`).join(''); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  return `${x.year} bad debt; ${word(x.party)}, ${word(x.event)}, ${money(x.amount)}, ${yn(x.taxable_or_creditable, x.party === 'supplier'
    ? 'a taxable supply' : 'a creditable acquisition')}, ${yn(x.cash_basis, 'cash basis')}, special rule ${word(x.special_rule)}${'attributed' in x
    ? `, ${yn(x.attributed, 'attributed')}` : ''}${'prior_adjustment' in x ? `, ${yn(x.prior_adjustment, 'earlier adjustment made')}` : ''}${
    'overdue_from' in x ? `, overdue from ${longDate(x.overdue_from)} to ${longDate(x.as_at)}` : ''}${extent}${'reduced_credit_acquisition' in x
    ? `, ${yn(x.reduced_credit_acquisition, 'reduced credit')}, ${yn(x.annual_apportionment, 'annually apportioned')}` : ''}`;
}

/** The command's result with the page's outcome and principal amount (null when the answer is not an amount).
 * @param {string} worksheet @param {Record<string, unknown>} input */
export function gstAdjustment(worksheet, input) {
  if (!Object.hasOwn(ENGINES, worksheet)) refuse('input.field_unknown', `${worksheet} is not a worksheet of this calculator.`);
  // nosemgrep: javascript.lang.security.audit.unsafe-dynamic-method.unsafe-dynamic-method -- the worksheet is checked against ENGINES' own keys above
  // nosemgrep: javascript.lang.security.audit.unsafe-dynamic-method.unsafe-dynamic-method -- the worksheet is checked against ENGINES' own keys above
  const r = /** @type {Record<string, any>} */ (ENGINES[/** @type {GstWorksheet} */ (worksheet)](input)); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  const amount = (/** @type {string} */ id) => (id in r.amounts ? Number(r.amounts[id]) : null); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  if (worksheet === 'creditable-purpose') {
    // The command always gives both amounts, one of them nil.
    const [inc, dec] = [Number(r.amounts.increasing_adjustment), Number(r.amounts.decreasing_adjustment)];
    return { ...r, outcome: inc ? 'increasing adjustment' : dec ? 'decreasing adjustment' : 'no adjustment', amount: inc || dec };
  }
  if (worksheet === 'annual-apportionment') {
    return { ...r, outcome: r.applies ? 'increasing adjustment' : r.eligible ? 'eligible, no election' : 'not eligible',
      amount: amount('increasing_adjustment') };
  }
  if (worksheet === 'financial-acquisitions') return { ...r, outcome: r.exceeds_threshold ? 'threshold exceeded' : 'threshold not exceeded', amount: null };
  if (worksheet === 'going-concern') return { ...r, outcome: r.gst_free ? 'GST-free' : 'not GST-free', amount: null };
  if (worksheet === 'second-hand-goods') {
    return { ...r, outcome: r.applies ? 'input tax credit' : 'no credit under Subdivision 66-A', amount: amount('input_tax_credit') };
  }
  return { ...r, outcome: r.applies ? `${r.direction} adjustment` : 'no adjustment', amount: amount(`${r.direction}_adjustment`) };
}

/** The page's result for the chosen worksheet. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function gstAdjustmentsResult(value, aud) {
  const { worksheet, input } = gstFormInput(value);
  const r = /** @type {Record<string, any>} */ (gstAdjustment(worksheet, input));
  const a = (/** @type {string} */ id) => aud(Number(r.amounts[id])); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  /** @type {[string, string][]} */
  const rows = [];
  let principal = 0;
  let notes = /** @type {string[]} */ (r.consequences ?? []);
  if (worksheet === 'creditable-purpose') {
    const p = r.adjustment_period;
    rows.push(['Adjustment period', p.is_adjustment_period ? `${p.number} of ${p.of}` : `none of ${p.of}`],
      ['Increasing adjustment', a('increasing_adjustment')], ['Decreasing adjustment', a('decreasing_adjustment')]);
    principal = r.outcome === 'decreasing adjustment' ? 2 : 1;
    notes = [r.no_adjustment_reason ?? `The first adjustment period is ${p.first}`];
  } else if (worksheet === 'annual-apportionment') {
    rows.push(['Credit without annual apportionment (s 11-30)', a('credit_without_annual_apportionment')],
      ['Credit with annual apportionment (s 131-40)', a('annual_apportionment_credit')], ['Increasing adjustment (s 131-55)', a('increasing_adjustment')]);
    principal = 2;
  } else if (worksheet === 'financial-acquisitions') {
    principal = rows.push(['10% of the past 12 months’ total credits', a('current_ten_percent')],
      ['10% of the next 12 months’ total credits', a('future_ten_percent')],
      ['Financial acquisitions threshold', r.exceeds_threshold ? 'Exceeded' : 'Not exceeded']) - 1;
  } else if (worksheet === 'going-concern') {
    rows.push(['Supply of a going concern', r.gst_free ? 'GST-free' : 'Not GST-free under s 38-325']);
  } else if (worksheet === 'second-hand-goods') {
    if ('one_eleventh_of_consideration' in r.amounts) rows.push(['One eleventh of the consideration', a('one_eleventh_of_consideration')]);
    principal = rows.push(['Input tax credit (s 66-10)', r.applies ? a('input_tax_credit') : 'None under Subdivision 66-A']) - 1;
  } else {
    if ('full_adjustment' in r.amounts) rows.push(['Full adjustment, 1/11 of the amount', a('full_adjustment')]);
    const id = `${r.direction}_adjustment`;
    principal = rows.push([r.direction === 'increasing' ? 'Increasing adjustment' : 'Decreasing adjustment', r.applies ? a(id) : 'None under Division 21']) - 1;
  }
  /** @type {Record<string, string[][]>} */
  const tables = {};
  if (r.conditions) tables.conditions = r.conditions.map((/** @type {Condition} */ c) => [c.authority, c.met ? 'Met' : 'Not met']);
  return { inputs: gstInputsText(worksheet, input, aud), rows, principal, note: notes.map((n) => n.replace(/\.$/, '').replaceAll('this command', 'this calculator')).join('. '), tables };
}
