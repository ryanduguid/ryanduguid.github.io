// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { BODY_NAMES, kg, vehicleRows } from './vehicle-rows.mjs';

/** Saves text as a file. @param {string} text @param {string} name @param {string} type */
export function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Only question pages load their script, so its failure cannot stop a calculator page's. If it
// fails, the question controls stay disabled and the page reads as plain text.
if (document.querySelector('details.question')) void import('./accounting-questions.mjs');

const currencyFormat = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
// Page copy writes negatives with the minus sign, U+2212; the CSV keeps ASCII.
const minus = text => text.replace(/^-/, '−');
const aud = value => minus(currencyFormat.format(value));
const dateFormat = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const calendarDate = value => dateFormat.format(new Date(`${value}T00:00:00Z`));
const longDateFormat = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const weekdayFormat = new Intl.DateTimeFormat('en-AU', { weekday: 'long', timeZone: 'UTC' });
const longDate = value => longDateFormat.format(new Date(`${value}T00:00:00Z`));
const dayAndDate = value => `${weekdayFormat.format(new Date(`${value}T00:00:00Z`))} ${longDate(value)}`;
const percent = value => value === null ? 'undefined (zero base)' : minus(`${value.toFixed(2)}%`);
const count = (text, noun) => `${Number(text).toLocaleString('en-AU', { maximumFractionDigits: 2 })} ${noun}${Number(text) === 1 ? '' : 's'}`;

// A result shows its figures as labelled rows, and its text still reads as one
// sentence ("Inputs: ... Label: value. ...") for the live region and the page's
// text tests. The colon and stop that only the sentence needs stay in the
// accessibility tree, hidden visually.
function renderResult(output, result) {
  const span = (className, text) => {
    const element = document.createElement('span');
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const rows = span('result-rows');
  result.rows.forEach(([label, value], index) => {
    const row = span(index === result.principal ? 'result-row result-row--principal' : 'result-row');
    // A figure that reads as a phrase sits under its label.
    if (/\s/.test(value)) row.classList.add('result-row--stacked');
    const figure = document.createElement('strong');
    figure.textContent = value;
    row.append(span('result-label', label), span('visually-hidden', ':'), ' ', figure, span('visually-hidden', '.'));
    rows.append(' ', row);
  });
  const parts = [span('result-inputs', `Inputs: ${result.inputs}.`), rows];
  if (result.note) parts.push(' ', span('result-note', `${result.note}.`));
  output.replaceChildren(...parts);
}

const forms = [...document.querySelectorAll('form[data-calculator]')];
function initialiseCalculators([calculate, fieldErrors, fbtForms, { individualResult, engines }]) {
  for (const form of forms) {
    const output = form.querySelector('output');
    if (output.textContent.startsWith('Calculators could not load')) output.textContent = 'Enter the inputs and calculate.';
  }
  // WebMCP: offer this page's calculator to the browser's agent. The draft spec puts
  // modelContext on document; early Chrome builds used navigator. Other browsers skip the import.
  const modelContext = document.modelContext ?? navigator.modelContext;
  // A failed import or registration leaves the form itself untouched; the warning keeps the cause.
  if (modelContext?.registerTool) import('./webmcp-tools.mjs').then(async ({ calculatorTools, individualTaxTools }) => {
    const tools = { ...calculatorTools(calculate), ...(engines ? individualTaxTools(engines) : {}) };
    for (const form of forms) {
      const tool = tools[form.dataset.calculator];
      if (tool) await modelContext.registerTool(tool);
    }
  }).catch(error => console.warn('WebMCP tool registration failed:', error));
  for (const form of forms) {
    for (const fieldset of form.querySelectorAll('fieldset')) fieldset.disabled = false;
    // Submit and Save inputs validate the same way: the first invalid field
    // gets an inline message in the page's words and takes focus, instead of
    // the browser bubble that closes on the next tap.
    form.setAttribute('novalidate', '');
    form.addEventListener('input', event => {
      if (event.target.matches('input, select')) fieldErrors.clearFieldError(event.target);
    });
    const output = form.querySelector('output');
    // Announce a new result as a whole, in the order the sentence reads.
    output.setAttribute('aria-atomic', 'true');
    const applied = form.querySelector('.sources-applied');
    if (applied) {
      // The button shows and hides with the sources, so an edit that clears the
      // result also removes the way to print it.
      const print = document.createElement('button');
      print.type = 'button';
      print.textContent = 'Print working';
      print.addEventListener('click', () => window.print());
      applied.append(print);
    }
    let csv = '';
    const cashDownload = form.querySelector('#download-cash');
    const csvDownload = form.querySelector('button[data-csv]');
    const value = name => form.elements.namedItem(name).value;
    const money = name => aud(Number(value(name)));
    // A finance schedule leaves out the field it works out, so that field cannot block a calculation.
    const solveFields = [...form.querySelectorAll('[data-solve]')];
    const markSolved = () => {
      for (const field of solveFields) field.disabled = field.dataset.solve === value('solve');
    };
    if (solveFields.length) {
      markSolved();
      form.addEventListener('change', event => { if (event.target.name === 'solve') markSolved(); });
    }

    const cashInputs = () => ({ version: 1, currency: 'AUD', startDate: value('start-date'),
      opening: value('opening'), buffer: value('buffer'), week: value('week'), amount: value('amount'), delay: value('delay'),
      weeks: Array.from({ length: 13 }, (_, i) => ({ receipts: value(`receipts-${i + 1}`), payments: value(`payments-${i + 1}`) })) });
    if (cashDownload) {
      const start = form.elements.namedItem('start-date');
      const today = new Date();
      start.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const fileStatus = form.querySelector('#cash-file-status');
      form.querySelector('#save-cash').addEventListener('click', () => {
        if (!fieldErrors.reportFirstInvalid(form)) return;
        try {
          const data = calculate.parseCashScenario(JSON.stringify(cashInputs()));
          download(JSON.stringify(data, null, 2), 'cash-forecast-inputs.json', 'application/json');
          fileStatus.textContent = 'Inputs saved. Load this file to continue the forecast later.';
        } catch (error) { fileStatus.textContent = error.message; }
      });
      form.querySelector('#load-cash').addEventListener('change', async event => {
        const file = event.target.files[0];
        if (!file) return;
        // Prevent edits while the file is read; apply only a fully validated scenario.
        // Both fieldsets lock, so a second load or a save cannot run while this file is read.
        const fieldsets = [...form.querySelectorAll('fieldset')];
        for (const fieldset of fieldsets) fieldset.disabled = true;
        fileStatus.textContent = 'Loading saved inputs…';
        try {
          if (file.size > 65536) throw new Error('Choose a scenario file under 64 KB.');
          const data = calculate.parseCashScenario(await file.text());
          for (const name of ['opening', 'buffer', 'week', 'amount', 'delay']) form.elements.namedItem(name).value = data[name];
          start.value = data.startDate;
          data.weeks.forEach((row, i) => {
            form.elements.namedItem(`receipts-${i + 1}`).value = row.receipts;
            form.elements.namedItem(`payments-${i + 1}`).value = row.payments;
          });
          invalidate();
          fileStatus.textContent = 'Inputs loaded. Calculate to refresh the results.';
        } catch (error) { fileStatus.textContent = error.message; }
        finally { for (const fieldset of fieldsets) fieldset.disabled = false; event.target.value = ''; }
      });
    }

    function invalidate(event) {
      if (event?.target.type === 'file') return;
      if (form.dataset.calculated) output.textContent = 'Inputs changed. Calculate again.';
      // The first edit replaces the fictional example the page opens with.
      else if (output.hasAttribute('data-example')) output.textContent = 'Enter the inputs and calculate.';
      output.removeAttribute('data-example');
      if (applied) applied.hidden = true;
      csv = '';
      if (cashDownload) cashDownload.disabled = true;
      if (csvDownload) csvDownload.disabled = true;
      for (const table of form.querySelectorAll('#cash-results, #div7a-schedule-results, table[data-results]')) table.parentElement.hidden = true;
    }
    form.addEventListener('input', invalidate);
    form.addEventListener('change', invalidate);
    if (cashDownload) cashDownload.addEventListener('click', () => {
      if (csv) download(csv, 'cash-forecast.csv', 'text/csv;charset=utf-8');
    });
    if (csvDownload) csvDownload.addEventListener('click', () => {
      if (csv) download(csv, csvDownload.dataset.csv, 'text/csv;charset=utf-8');
    });

    form.addEventListener('submit', event => {
      event.preventDefault();
      invalidate();
      if (!fieldErrors.reportFirstInvalid(form)) return;
      try {
        let result;
        switch (form.dataset.calculator) {
          case 'gst': {
            const inclusive = form.elements.namedItem('inclusive').checked;
            const r = calculate.gst(value('amount'), inclusive);
            result = { inputs: `amount ${money('amount')}, ${inclusive ? 'includes' : 'excludes'} GST`, principal: 1,
              rows: [['Excluding GST', aud(r.net)], ['GST', aud(r.gst)], ['Including GST', aud(r.gross)]] };
            break;
          }
          case 'business-use':
            result = { inputs: `eligible cost ${money('cost')}, business use ${value('percent')}%`, principal: 0,
              rows: [['Business-use share', aud(calculate.businessUse(value('cost'), value('percent')).share)]] };
            break;
          case 'margin': {
            const r = calculate.margin(value('sales'), value('cost'));
            result = { inputs: `sales ${money('sales')}, direct cost ${money('cost')}`,
              rows: [['Gross profit', aud(r.profit)], ['Margin', percent(r.margin)], ['Markup', percent(r.markup)]] };
            break;
          }
          case 'break-even': {
            const r = calculate.breakEven(value('fixed'), value('price'), value('variable'));
            result = { inputs: `fixed costs ${money('fixed')}, selling price ${money('price')} per unit, variable cost ${money('variable')} per unit`, principal: 1,
              rows: [['Contribution per unit', aud(r.contribution)], ['Break-even', `${r.units.toLocaleString('en-AU')} whole units, or ${aud(r.sales)} in sales`]] };
            break;
          }
          case 'hourly':
            result = { inputs: `annual costs ${money('cost')}, target profit ${money('profit')}, ${count(value('hours'), 'billable hour')}`, principal: 0,
              rows: [['Required hourly rate before GST', aud(calculate.hourlyRate(value('cost'), value('profit'), value('hours')).rate)]] };
            break;
          case 'fixed-fee': {
            const addGst = form.elements.namedItem('gst').checked;
            const step = value('round');
            const months = Number(value('instalments'));
            const r = calculate.fixedFee(value('hours'), value('rate'), value('margin'), step, addGst, value('instalments'));
            result = { inputs: `${count(value('hours'), 'hour')} at ${money('rate')} an hour, ${value('margin')}% margin, fee rounded up to ${step === '0.01' ? 'the cent' : `the next $${step}`}, ${addGst ? 'GST added' : 'no GST'}, ${count(value('instalments'), 'monthly instalment')}`, principal: 2,
              rows: [['Fee before GST', aud(r.fee)], ['GST', aud(r.gst)], ['Fee including GST', aud(r.total)],
                [months === 1 ? 'Paid at once' : 'First instalment', aud(r.first)],
                ...(months === 1 ? [] : [[`Instalments 2 to ${months}, each`, aud(r.instalment)]]),
                ['Effective hourly rate before GST', aud(r.effectiveRate)]] };
            break;
          }
          case 'variance': {
            const r = calculate.variance(value('actual'), value('budget'), value('kind'));
            result = { inputs: `actual ${money('actual')}, budget ${money('budget')}, figure type ${value('kind')}`, principal: 0,
              rows: [['Actual minus budget', aud(r.difference)], ['Difference as a share of absolute budget', percent(r.percent)]], note: r.effect };
            break;
          }
          case 'loan':
          case 'hire-purchase': {
            result = calculate.financeResult({ solve: value('solve'), amount: value('amount'), rate: value('rate'), payments: value('payments'),
              payment: value('payment'), balloon: value('balloon'), balloonKind: value('balloon-kind'), frequency: value('frequency'),
              timing: value('timing'), start: value('start') }, aud, form.dataset.calculator === 'loan' ? null : value('agreement'));
            // Each table's rows: a label cell, then figures.
            for (const table of form.querySelectorAll('table[data-results]')) {
              table.tBodies[0].replaceChildren(...result.tables[table.dataset.results].map(cells => {
                const tr = document.createElement('tr');
                tr.append(...cells.map((text, i) => Object.assign(document.createElement(i ? 'td' : 'th'), { textContent: text }, i ? {} : { scope: 'row' })));
                return tr;
              }));
              table.parentElement.hidden = false;
            }
            csv = result.csv;
            csvDownload.disabled = false;
            break;
          }
          case 'div7a': {
            // The year's benchmark rate comes from the option, which lists only years the site's rate table holds.
            const year = form.elements.namedItem('year').selectedOptions[0];
            const r = calculate.div7aMinimumRepayment(value('balance'), year.dataset.rate, value('term'));
            result = { inputs: `${year.value} income year at the ${year.dataset.rate}% benchmark rate, ${money('balance')} not repaid at 30 June ${year.value.slice(0, 4)}, ${count(value('term'), 'year')} remaining`, principal: 0,
              rows: [['Minimum yearly repayment', aud(r.repayment)], ['Interest for the year, if repaid on 30 June', aud(r.interest)], ['Principal, if repaid on 30 June', aud(r.principal)]] };
            break;
          }
          case 'div7a-schedule': {
            const yes = name => value(name) === 'yes';
            result = calculate.div7aScheduleResult({ made: value('made'), amount: value('amount'), term: value('term'),
              assumedRate: value('assumed-rate'), repayments: value('repayments'), marginalRate: value('marginal-rate'),
              franking: value('franking'), lodgment: yes('lodgment'), refinanced: yes('refinanced'), interposed: yes('interposed') }, aud);
            const table = form.querySelector('#div7a-schedule-results');
            table.tBodies[0].replaceChildren(...result.table.map(cells => {
              const tr = document.createElement('tr');
              tr.append(...cells.map((text, i) => Object.assign(document.createElement(i ? 'td' : 'th'), { textContent: text }, i ? {} : { scope: 'row' })));
              return tr;
            }));
            table.parentElement.hidden = false;
            break;
          }
          case 'transfer-duty': {
            // The chosen jurisdiction's radio carries its rows of the site's rate table:
            // over,to,base,rate,rule for each bracket, separated by semicolons.
            const place = form.querySelector('input[name="jurisdiction"]:checked');
            const scale = place.dataset.scale.split(';').map(row => row.split(','));
            const r = calculate.transferDuty(value('value'), scale);
            const [over, , base, rate, rule] = scale[r.bracket];
            const whole = text => `$${Number(text).toLocaleString('en-AU')}`;
            const plus = Number(base) ? `${whole(base)} plus ` : '';
            let ruleText = {
              'excess-rounded-up-to-100': `${plus}$${Number(rate).toFixed(2)} for every $100, or part of $100, over ${whole(over)}`,
              excess: `${plus}${rate}% of the value over ${whole(over)}`,
              'whole-value': `${rate}% of the whole value`,
              'nt-formula': '(0.06571441 × V × V) + 15V, where V is the value ÷ 1,000',
            }[rule];
            if (rule !== 'nt-formula' && Number(rate) === 0) ruleText = Number(base) ? `a fixed ${whole(base)}` : 'nil';
            result = { inputs: `${place.dataset.name}, dutiable value ${money('value')}`, principal: 0,
              rows: [['General transfer duty', aud(r.duty)], ['Rate applied', ruleText]] };
            // NSW premium duty, the scale's last bracket, applies to residential land only.
            if (place.value === 'AU-NSW' && r.bracket === scale.length - 1) {
              result.note = 'Premium duty applies to residential land only; other land continues at $5.50 for every $100 over $1,290,000';
            }
            const home = form.querySelector('input[name="buyer"]:checked').value;
            if (home !== 'general') {
              const f = calculate.firstHomeDuty(value('value'), scale, place.value, home);
              result.inputs += `, eligible first home buyer, ${home} home`;
              result.rows.unshift(['Duty for an eligible first home buyer',
                f.concession ? aud(f.duty) : 'none for this home, so general duty applies']);
            }
            break;
          }
          case 'fbt-car': {
            // The gross-up comes from the checked option and the year's days and FBT rate from the
            // form; the Node tests bind all three to the site's FBT rate table.
            const type = form.querySelector('input[name="type"]:checked');
            const operating = value('method') === 'operating';
            const reduced = value('reduced') === 'yes';
            const r = calculate.fbtCar({ method: value('method'), cost: value('cost'), accessories: value('accessories'), reduced,
              days: value('days'), costs: value('costs'), businessUse: value('business-use'), contribution: value('contribution') },
            { days: form.dataset.yearDays, grossUp: type.dataset.grossUp, fbtRate: form.dataset.fbtRate });
            result = { inputs: `${operating ? 'operating cost method' : 'statutory formula'}, cost price ${money('cost')}, later non-business accessories ${money('accessories')}, `
              + `first held ${reduced ? 'before' : 'on or after'} 1 April 2022, ${count(value('days'), 'day')} of ${form.dataset.yearDays} available for private use, `
              + `${operating ? `operating costs ${money('costs')} at ${value('business-use')}% business use, ` : ''}employee contributions ${money('contribution')}, Type ${type.value} gross-up ${type.dataset.grossUp}`,
            rows: [['Base value', aud(r.baseValue)], ['Statutory formula taxable value', aud(r.statutory)],
              ...(operating ? [['Operating cost taxable value', aud(r.operating)]] : []), ['Taxable value', aud(r.taxableValue)],
              ['Grossed-up taxable value', aud(r.grossedUp)], [`FBT at ${form.dataset.fbtRate}%`, aud(r.fbt)]],
            note: operating && r.statutory < r.operating ? 'The statutory formula value is lower, so it applies under subsection 10(5)' : undefined };
            result.principal = result.rows.length - 1;
            break;
          }
          case 'pcg-2021-4': {
            const all = value('factor3') === 'yes';
            const r = calculate.pcgRisk({ gateway1: value('gateway1') === 'yes', gateway2: value('gateway2') === 'yes',
              entitlement: value('entitlement'), returned: value('returned'), tax: value('tax'), factor3: all,
              remuneration: value('remuneration'), benchmark: value('benchmark') });
            const zone = { green: 'Green: low risk', amber: 'Amber: moderate risk', red: 'Red: high risk' }[r.zone];
            const scored = (share, score) => `${percent(share)}, score ${score}`;
            result = { inputs: `gateways 1 and 2 passed, profit entitlement ${money('entitlement')}, returned by the IPP ${money('returned')}, `
              + `${r.total === null ? 'the whole entitlement' : `tax on that firm income ${money('tax')}, ${all
                ? `remuneration ${money('remuneration')} against a commercial benchmark of ${money('benchmark')}, all 3 factors` : 'factors 1 and 2'}`}`,
            rows: r.total === null ? [['Factor 1: profit entitlement returned by the IPP', scored(r.returned, r.factor1)], ['Risk zone', zone]] : [
              ['Factor 1: profit entitlement returned by the IPP', scored(r.returned, r.factor1)],
              ['Factor 2: total effective tax rate', scored(r.taxRate, r.factor2)],
              ...(all ? [['Factor 3: remuneration as a share of the benchmark', scored(r.benchmarkShare, r.factor3)]] : []),
              ['Aggregate score', String(r.total)], ['Risk zone', zone]],
            note: r.total === null ? 'The IPP returns the whole entitlement, so paragraph 81 makes the arrangement low risk with no other factor scored' : undefined };
            result.principal = result.rows.length - 1;
            break;
          }
          case 'pcg-2021-4-allocation': {
            const year = form.querySelector('input[name="year"]:checked');
            result = calculate.pcgAllocationResult(value, { name: year.value, ...year.dataset }, aud, percent);
            break;
          }
          case 'vehicle-class': {
            // The year's car limit and LCT thresholds come from the checked option; the Node
            // tests bind them to the car limit table and the ATO's LCT thresholds.
            const year = form.querySelector('input[name="year"]:checked').dataset;
            const f = Object.fromEntries(['body', 'seats', 'gvm', 'kerb', 'payload', 'accessories', 'modified', 'cost', 'credit', 'fuel', 'use']
              .map(name => [name, value(name)]));
            const r = calculate.vehicleClass(f, { carLimit: year.carLimit, fuelEfficientThreshold: year.fuelEfficient,
              otherThreshold: year.other });
            const notes = [
              ...(f.modified === 'plated' ? ['A modification after manufacture does not change the designed load, but a permanent one can change '
                + 'the design purpose (MT 2033), which this page does not judge'] : []),
              ...(r.luxury === 'commercial' && f.body !== 'van' ? ['LCTD 2023/1’s simplified method assumes the ute is a goods vehicle '
                + 'under the Australian Design Rules (paragraph 57)'] : []),
              ...(r.exempt && r.belowThreshold ? ['PCG 2018/3 can also apply, as the price is below the luxury car tax threshold '
                + '(paragraph 6(c)); its other conditions are yours to check'] : [])];
            result = { inputs: `${BODY_NAMES[f.body]}, ${count(f.seats, 'seat')}, gross vehicle mass ${kg(f.gvm)}, `
              + `${Number(f.kerb) ? `kerb weight ${kg(f.kerb)}, ` : ''}${Number(f.payload) ? `payload ${kg(f.payload)}, ` : ''}`
              + `${Number(f.accessories) ? `accessories at supply ${kg(f.accessories)}, ` : ''}`
              + `${f.modified === 'no' ? 'not modified' : 'modified, manufacturer’s figures'}, ${value('year')}, price ${money('cost')}, `
              + `${f.credit === 'full' ? 'full GST credit' : 'no GST credit'}, `
              + `${f.fuel === 'efficient' ? '3.5 litres per 100 km or less' : 'more than 3.5 litres per 100 km'}, `
              + `private use ${f.use === 'limited' ? 'limited as you state' : 'more than limited'}`,
            principal: 1, rows: vehicleRows(r, f, year, aud), note: notes.length ? notes.join('. ') : undefined };
            break;
          }
          case 'gic-payment-plan': {
            const plan = { debt: value('debt'), start: value('start'), count: value('count'), frequency: value('frequency'),
              assumedRate: value('assumedRate') };
            const r = calculate.gicPaymentPlan(plan);
            result = { inputs: `debt ${money('debt')}, first instalment ${calendarDate(plan.start)}, ${count(plan.count, `${plan.frequency} instalment`)}, `
              + `${plan.assumedRate}% a year assumed after December 2026`,
            rows: [['Paid in full now', money('debt')],
              ...(Number(plan.count) === 1 ? [] : [['Each instalment but the last', aud(r.instalment)]]),
              [`Final instalment, ${calendarDate(r.lastDate)}`, aud(r.final)], ['Total paid on the plan', aud(r.totalPaid)],
              ['GIC on the plan, over paying now', aud(r.gic)]],
            note: r.assumedDays ? `${count(String(r.assumedDays), 'day')} after December 2026 use the assumed rate` : undefined };
            result.principal = result.rows.length - 1;
            break;
          }
          case 'land-tax': {
            // The chosen jurisdiction's radio carries its scales, from,base,rate,over,rule for each
            // band separated by semicolons, and the ACT's radio its fixed charge.
            const place = form.querySelector('input[name="jurisdiction"]:checked');
            const trust = form.querySelector('input[name="owner"]:checked').value === 'trust';
            const foreign = form.querySelector('input[name="foreign"]:checked').value === 'yes';
            const metro = form.elements.namedItem('metro').checked;
            const fixed = place.dataset.fixed ?? '0';
            const r = calculate.landTaxYear(value('value'), place.dataset,
              { trust, foreign, surchargeValue: value('surcharge-value'), metro });
            const [, base, rate, over, rule] = r.band;
            const dollars = text => `$${Number(text).toLocaleString('en-AU', { minimumFractionDigits: Number(text) % 1 ? 2 : 0 })}`;
            const plus = Number(base) ? `${dollars(base)} plus ` : '';
            let ruleText = rule === 'excess' ? `${plus}${rate}% of the value${Number(over) ? ` over ${dollars(over)}` : ''}`
              : `${plus}$${Number(rate).toFixed(2)} for every $100, or part of $100, over ${dollars(over)}`;
            if (Number(rate) === 0) ruleText = Number(base) ? `a fixed ${dollars(base)}` : 'nil';
            if (Number(fixed)) ruleText = `the ${dollars(fixed)} fixed charge plus ${ruleText}`;
            const rows = [['Land tax for the year', aud(r.tax)], ['Rate applied', ruleText]];
            if (foreign) rows.push(['Foreign or absentee owner surcharge', aud(r.surcharge)]);
            if (metro) rows.push(['Metropolitan region improvement tax', aud(r.mrit)]);
            if (foreign || metro) rows.push(['Total for the year', aud(r.total)]);
            const separate = foreign && place.dataset.surchargeBase === 'separate';
            result = { inputs: `${place.dataset.name}${trust ? ', trust rates' : ''}${foreign ? ', foreign or absentee owner' : ''}, `
              + `total taxable land value ${money('value')}${separate ? `, surcharge value ${money('surcharge-value')}` : ''}`
              + `${metro ? ', all in the Perth metropolitan region' : ''}`, principal: rows.length > 2 ? rows.length - 1 : 0, rows };
            if (place.value === 'AU-SA' && r.tax > 0 && r.tax < 20) {
              result.note = 'RevenueSA issues no land tax assessment where the calculated land tax is under $20';
            }
            break;
          }
          case 'psi-determination':
            result = calculate.psiDeterminationResult(value, (name) => form.elements.namedItem(name).checked, aud);
            break;
          case 'staff': {
            const r = calculate.staffCost(value('wages'), value('super'), value('other'));
            result = { inputs: `wages ${money('wages')}, super ${money('super')}, other costs ${money('other')}`, principal: 0,
              rows: [['Annual staff cost', aud(r.annual)], ['Monthly average', aud(r.monthly)]] };
            break;
          }
          case 'cash': {
            const weeks = Array.from({ length: 13 }, (_, i) => ({ receipts: value(`receipts-${i + 1}`), payments: value(`payments-${i + 1}`) }));
            const dates = calculate.cashWeekDates(value('start-date'));
            const r = calculate.cashForecast(value('opening'), weeks, value('buffer'), { week: value('week'), amount: value('amount'), delay: value('delay') });
            result = { inputs: `week 1 from ${calendarDate(value('start-date'))}, opening cash ${money('opening')}, buffer ${money('buffer')}, receipt of ${money('amount')} in week ${value('week')} delayed ${count(value('delay'), 'week')}`,
              rows: [['Closing cash', aud(r.closing)], ['Lowest opening or weekly closing balance', aud(r.minimum)], ['Funding gap to the buffer', aud(r.funding)], ['Receipts deferred beyond week 13', aud(r.deferred)]] };
            const body = form.querySelector('#cash-results tbody');
            body.replaceChildren();
            for (const row of r.rows) {
              const tr = document.createElement('tr');
              for (const key of ['week', 'dates', 'opening', 'receipts', 'payments', 'closing']) {
                const cell = document.createElement(key === 'week' ? 'th' : 'td');
                if (key === 'week') cell.scope = 'row';
                cell.textContent = key === 'week' ? row[key] : key === 'dates'
                  ? `${calendarDate(dates[row.week - 1].start)} to ${calendarDate(dates[row.week - 1].end)}` : aud(row[key]);
                tr.append(cell);
              }
              body.append(tr);
            }
            form.querySelector('#cash-results').parentElement.hidden = false;
            csv = ['Currency,AUD', 'Planning estimate; weekly totals may hide daily shortages',
              `First day of week 1,${value('start-date')}`,
              `Opening cash,${value('opening')}`, `Minimum cash buffer,${value('buffer')}`,
              `Original receipt week,${value('week')}`, `Receipt delayed,${value('amount')}`,
              `Delay in weeks,${value('delay')}`, `Deferred beyond week 13,${r.deferred.toFixed(2)}`,
              `Funding gap,${r.funding.toFixed(2)}`, '', 'Week,Start date,End date,Opening,Receipts,Payments,Closing',
              ...r.rows.map(row => [row.week, dates[row.week - 1].start, dates[row.week - 1].end, row.opening.toFixed(2), row.receipts.toFixed(2), row.payments.toFixed(2), row.closing.toFixed(2)].join(','))].join('\r\n');
            cashDownload.disabled = false;
            break;
          }
          case 'objection-deadline': {
            const decision = value('decision');
            const income = decision === 'assessment' || decision === 'amended';
            const amended = decision === 'amended' || decision === 'amended-fbt';
            const years = income && value('group') === '2' ? 2 : 4;
            const r = calculate.objectionDeadline(decision, value('group'), value('notice'), value('first'));
            const kind = { assessment: 'income tax assessment', amended: 'amended income tax assessment', fbt: 'FBT assessment',
              'amended-fbt': 'amended FBT assessment', other: 'other decision' }[decision];
            result = { inputs: `${kind}, ${income ? `${years === 2 ? 'item 1, 2, 3 or 3A applies (2 years)' : 'no item 1, 2, 3 or 3A (4 years)'}, ` : ''}`
              + `notice given ${longDate(value('notice'))}${amended ? `, first assessment’s notice given ${longDate(value('first'))}` : ''}`,
            rows: [...(amended ? [['60 days after the amended notice', dayAndDate(r.amendedEnds)], [`${years} years after the first notice`, dayAndDate(r.firstEnds)]] : []),
              [`Period ends, ${r.rule}`, dayAndDate(r.periodEnds)],
              ['Last day to lodge, under subsection 36(2) of the Acts Interpretation Act 1901', dayAndDate(r.lastDay)]],
            note: 'If that day is a public holiday where the objection is lodged, or the office is closed all day, it may be lodged on the next day that is not a Saturday, Sunday or holiday. '
              + 'After the last day, an objection needs a written request under subsection 14ZW(2), which the Commissioner decides under section 14ZX' };
            result.principal = result.rows.length - 1;
            break;
          }
          case 'payg-instalments': {
            const method = value('method');
            const r = calculate.paygInstalment({ method, notified: value('notified'), instalment: value('instalment'),
              estimatedTax: value('estimated-tax'), earlier: value('earlier'), credits: value('credits'), income: value('income'),
              rate: value('rate'), estimatedIncome: value('estimated-income'), earlierIncome: value('earlier-income') });
            const earlier = `earlier instalments ${money('earlier')} less credits claimed ${money('credits')}`;
            const credit = ['Credit to claim at 5B, whole dollars', aud(r.credit)];
            if (method === 'amount') {
              result = { inputs: `instalment amount (option 1), ${money('notified')} at T7`, principal: 0,
                rows: [['Instalment at 5A, whole dollars', aud(r.instalment)]],
                note: 'For 2026-27 the amount the ATO notifies includes its GDP adjustment of 5%' };
            } else if (method === 'varied-amount') {
              result = { inputs: `varied instalment amount (option 1), instalment ${value('instalment')} of the income year, `
                + `estimated tax ${money('estimated-tax')} at T8, ${earlier}`, principal: 2,
              rows: [[`${Number(value('instalment')) * 25}% of estimated tax`, aud(r.due)], ['Varied amount', aud(r.amount)],
                ['Varied amount at T9 and 5A, whole dollars', aud(r.instalment)], credit] };
            } else if (method === 'rate') {
              result = { inputs: `instalment rate (option 2), instalment income ${money('income')} at T1, instalment rate ${value('rate')}% at T2`,
                principal: 1, rows: [['T1 × T2', aud(r.amount)], ['Instalment at T11 and 5A, whole dollars', aud(r.instalment)]] };
            } else {
              result = { inputs: `varied instalment rate (option 2), estimated tax ${money('estimated-tax')} on estimated instalment income `
                + `${money('estimated-income')} for the year, instalment income ${money('income')} at T1, instalment rate ${value('rate')}% at T2, `
                + `${earlier}, on earlier instalment income ${money('earlier-income')}`, principal: 2,
              rows: [['Varied rate at T3', `${r.instalmentRate.toFixed(2)}%`], ['T1 × T3', aud(r.amount)],
                ['Instalment at T11 and 5A, whole dollars', aud(r.instalment)], credit],
              note: 'A credit applies only when the varied rate is lower than the rate at T2' };
            }
            break;
          }
          case 'termination-payment': {
            // The year's last day, caps, amounts and Table A rates come from the form; the Node
            // tests bind them to Schedule 11.
            const year = form.dataset;
            const r = calculate.terminationPayment({ redundancy: value('redundancy'), years: value('years'), excluded: value('excluded'),
              nonExcluded: value('non-excluded'), other: value('other'), born: value('born') }, year);
            result = { inputs: `genuine redundancy or early retirement scheme payment ${money('redundancy')} after ${count(value('years'), 'completed year')} of service, `
              + `other code R taxable component ${money('excluded')}, code O taxable component ${money('non-excluded')}, `
              + `other taxable payments in 2026-27 ${money('other')}, born ${calendarDate(value('born'))}`, principal: 7,
            rows: [['Tax-free limit', aud(r.taxFreeLimit)], ['Tax-free part of the redundancy payment', aud(r.taxFree)],
              ['Code R taxable component', aud(r.excluded)], ['Withhold from the code R part', aud(r.excludedWithholding)],
              ['Whole-of-income cap left', aud(r.wholeOfIncomeCap)], ['Cap for the code O part', aud(r.cap)],
              ['Withhold from the code O part', aud(r.nonExcludedWithholding)], ['Total to withhold', aud(r.withholding)]],
            note: `${r.reached ? 'Preservation age or older' : 'Under preservation age'} on 30 June 2027: ${r.rate}% within each cap and ${year.rateAbove}% above it` };
            break;
          }
          case 'division-296': {
            // The thresholds and rates come from the form; the Node tests bind them to the Acts.
            const yes = name => value(name) === 'yes';
            result = calculate.division296Result({ balance: value('balance'), earnings: value('earnings'), child: yes('child'),
              settlement: yes('settlement'), died: yes('died') }, form.dataset, aud);
            break;
          }
          case 'sgc-payday':
            result = calculate.sgcPaydayResult(value, aud);
            break;
          case 'long-service-leave':
            result = calculate.longServiceLeaveResult(value, aud);
            break;
          case 'payroll-tax':
            result = calculate.payrollTaxResult(value('wages'), value('australian'), value('jurisdiction'), aud);
            break;
          case 'company-tax': {
            const year = (prefix) => ({ turnover: value(`${prefix}turnover`), assessable: value(`${prefix}assessable`), passive: value(`${prefix}passive`) });
            result = calculate.companyTaxResult({ ...year(''), taxable: value('taxable'), existed: value('existed') === 'yes', prior: year('prior-'),
              dividend: value('dividend'), franking: value('franking'), marginal: value('marginal') }, aud);
            break;
          }
          case 'foreign-surcharge': {
            // The chosen jurisdiction's radio carries its general transfer duty scale, as the transfer duty page's does.
            const place = form.querySelector('input[name="jurisdiction"]:checked');
            const use = value('use');
            const general = use === 'residential' ? calculate.transferDuty(value('value'), place.dataset.scale.split(';').map(row => row.split(','))).duty : null;
            const yes = name => value(name) === 'yes';
            result = calculate.foreignSurchargeResult({ type: value('buyer'), status: value('status'), daysBefore: value('days-before'),
              daysDecember: value('days-december'), nzResident: yes('nz-resident'), resides: yes('resides'), absent: yes('absent'), home: yes('home'),
              overseas: yes('overseas'), largest: value('largest'), combined: value('combined'), absentee: value('absentee'), capital: value('capital'), amendable: yes('amendable'),
              control: yes('control'), named: yes('named'), defaults: value('defaults'), exemption: yes('exemption') },
            { place: place.value, use, value: value('value'), share: value('share'), land: value('land') }, general, aud);
            break;
          }
          case 'business-days':
            result = calculate.businessDaysResult({ mode: value('mode'), place: value('place'), start: value('start'), end: value('end'),
              count: value('count') }, calculate.parseHolidays(form.dataset.holidays));
            break;
          default: result = individualResult(form.dataset.calculator, value, aud) ?? fbtForms.fbtBenefitResult(form, calculate, { aud, value, money });
        }
        renderResult(output, result);
        form.dataset.calculated = 'true';
        if (applied) {
          // The panel names the rule and the figures behind this result; a
          // branch-specific line shows only for the branch that ran.
          const branch = form.elements.namedItem('inclusive')?.checked ? 'inclusive' : 'exclusive';
          for (const line of applied.querySelectorAll('[data-when]')) line.hidden = line.dataset.when !== branch;
          applied.hidden = false;
        }
      } catch (error) {
        output.textContent = error.message;
      }
      output.tabIndex = -1;
      output.focus({ preventScroll: true });
      output.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    });
  }
}

function loadCalculators(retryForm) {
  // A failed module import can remain cached, so a manual retry uses fresh URLs.
  const suffix = retryForm ? `?retry=${Date.now()}` : '';
  Promise.all([import(`./business-calculators.mjs${suffix}`), import(`./field-errors.mjs${suffix}`), import(`./fbt-benefit-forms.mjs${suffix}`),
    forms.some((f) => ['income-tax', 'take-home-pay', 'study-loan', 'lump-sum-arrears', 'income-tests'].includes(f.dataset.calculator ?? '')) ? import(`./individual-tax-results.mjs${suffix}`) : { individualResult: () => undefined }]).then(initialiseCalculators)
    .then(() => { if (retryForm) retryForm.querySelector('input, select').focus(); })
    .catch(() => {
      for (const form of forms) {
        form.querySelector('fieldset').disabled = true;
        const output = form.querySelector('output');
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = 'Retry loading calculators';
        retry.addEventListener('click', () => {
          retry.disabled = true;
          loadCalculators(form);
        });
        output.replaceChildren('Calculators could not load. ', retry);
      }
      if (retryForm) retryForm.querySelector('output button').focus();
    });
}
if (forms.length) loadCalculators();
