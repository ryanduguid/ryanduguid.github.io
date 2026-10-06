const currencyFormat = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
// Page copy writes negatives with the minus sign, U+2212; the CSV keeps ASCII.
const minus = text => text.replace(/^-/, '−');
const aud = value => minus(currencyFormat.format(value));
const dateFormat = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const calendarDate = value => dateFormat.format(new Date(`${value}T00:00:00Z`));
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

function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const questions = [...document.querySelectorAll('details.question')];
if (questions.length) {
  const search = document.querySelector('#question-search');
  const params = new URLSearchParams(location.search);
  search.value = params.get('q') || '';
  const checkbox = new Map(questions.map(q => [q, q.querySelector('input')]));
  const selected = () => questions.filter(q => checkbox.get(q).checked);
  const countNode = document.querySelector('#question-count');
  let countTimer;
  const groups = [...document.querySelectorAll('.question-group')];
  const normalise = text => text.toLocaleLowerCase('en-AU').replace(/[^a-z0-9]+/g, ' ');
  const text = new Map(questions.map(q => [q, normalise(`${q.textContent} ${q.dataset.searchTerms || ''}`)]));
  const tools = document.querySelector('.question-tools');
  const clearFilters = document.querySelector('#clear-filters');
  document.querySelector('.question-controls fieldset').disabled = false;
  // The script owns this state, so a cached older copy of it still leaves the button usable.
  clearFilters.disabled = !search.value;
  // A saved search opens the tools so the filter that hid questions is in view.
  if (search.value) tools.open = true;
  document.querySelectorAll('.question-select').forEach(node => { node.hidden = false; });

  function filter() {
    const words = normalise(search.value).split(/\s+/).filter(Boolean);
    for (const q of questions) {
      q.hidden = !words.every(word => text.get(q).includes(word));
      q.classList.toggle('is-selected', checkbox.get(q).checked);
    }
    for (const group of groups) group.hidden = !group.querySelector('details:not([hidden])');
    const count = selected().length;
    clearTimeout(countTimer);
    countTimer = setTimeout(() => {
      const shown = questions.filter(q => !q.hidden).length;
      countNode.textContent = shown
        ? `${shown} questions. ${count} selected.`
        : `No questions match. Choose Clear filters to show all ${questions.length}. ${count} selected.`;
    }, 300);
    for (const id of ['download-checklist', 'print-checklist', 'clear-selection']) {
      document.getElementById(id).disabled = count === 0;
    }
    clearFilters.disabled = !search.value;
    // The first selection opens the tools, so the download and print actions are in reach.
    if (count && !tools.open) tools.open = true;
    // The filters live in the URL so a filtered view can be shared or reloaded.
    const query = new URLSearchParams();
    if (search.value) query.set('q', search.value);
    const queryText = query.toString();
    history.replaceState(null, '', `${location.pathname}${queryText ? `?${queryText}` : ''}${location.hash}`);
  }
  search.addEventListener('input', filter);
  for (const q of questions) checkbox.get(q).addEventListener('change', filter);
  if (search.value || params.has('topic')) filter();
  clearFilters.addEventListener('click', () => {
    search.value = '';
    filter();
    search.focus();
  });
  document.querySelector('#clear-selection').addEventListener('click', () => {
    for (const q of selected()) checkbox.get(q).checked = false;
    filter();
    search.focus();
  });

  function revealHash() {
    const target = document.getElementById(location.hash.slice(1));
    if (!target || (!target.matches('.question, .question-group'))) return;
    search.value = '';
    filter();
    if (target.matches('.question')) target.open = true;
    target.scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  window.addEventListener('hashchange', revealHash);
  revealHash();

  document.querySelector('#download-checklist').addEventListener('click', () => {
    const lines = ['# Australian accounting checklist', '',
      'Confirm the income year, facts and source guidance before relying on a conclusion.', '',
      'Reviewer: ____________________', 'Period: ____________________', 'Review date: ____________________', ''];
    for (const q of selected()) {
      lines.push(`## ${q.querySelector('summary').textContent.trim()}`, '', q.querySelector('.question-answer p').textContent.trim(), '');
      lines.push(q.closest('.question-group').querySelector('.topic-review').textContent.trim(), '');
      for (const step of q.querySelectorAll('ol li')) lines.push(`- [ ] ${step.textContent.trim()}`);
      const example = q.querySelector('.question-example');
      if (example) lines.push('', ...[...example.querySelectorAll('p')].map(p => p.textContent.trim()), '');
      lines.push('', q.querySelector('.question-boundary').textContent.trim(), '');
      for (const link of q.querySelectorAll('.question-links a')) {
        // Downloads retain canonical links even when made from a local preview.
        lines.push(`[${link.textContent.trim()}](${new URL(link.getAttribute('href'), 'https://duguid.com.au').href})`);
      }
      lines.push('', 'Evidence and unresolved items: ____________________', '');
    }
    download(lines.join('\n'), 'accounting-checklist.md', 'text/markdown;charset=utf-8');
  });

  let beforePrint;
  function restorePrint() {
    if (!beforePrint) return;
    for (const [q, open] of beforePrint) q.open = open;
    beforePrint = null;
    document.body.classList.remove('print-selected');
    filter();
  }
  window.addEventListener('afterprint', restorePrint);
  document.querySelector('#print-checklist').addEventListener('click', () => {
    beforePrint = questions.map(q => [q, q.open]);
    document.body.classList.add('print-selected');
    for (const group of groups) group.hidden = false;
    for (const q of questions) { q.hidden = false; q.open = q.classList.contains('is-selected'); }
    window.print();
  });
}

const forms = [...document.querySelectorAll('form[data-calculator]')];
function initialiseCalculators([calculate, fieldErrors]) {
  for (const form of forms) {
    const output = form.querySelector('output');
    if (output.textContent.startsWith('Calculators could not load')) output.textContent = 'Enter the inputs and calculate.';
  }
  // WebMCP: offer this page's calculator to the browser's agent. The draft spec puts
  // modelContext on document; early Chrome builds used navigator. Other browsers skip the import.
  const modelContext = document.modelContext ?? navigator.modelContext;
  // A failed import or registration leaves the form itself untouched; the warning keeps the cause.
  if (modelContext?.registerTool) import('./webmcp-tools.mjs').then(async ({ calculatorTools }) => {
    const tools = calculatorTools(calculate);
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
    const value = name => form.elements.namedItem(name).value;
    const money = name => aud(Number(value(name)));

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
      if (applied) applied.hidden = true;
      csv = '';
      if (cashDownload) cashDownload.disabled = true;
      const table = form.querySelector('#cash-results');
      if (table) table.parentElement.hidden = true;
    }
    form.addEventListener('input', invalidate);
    form.addEventListener('change', invalidate);
    if (cashDownload) cashDownload.addEventListener('click', () => {
      if (csv) download(csv, 'cash-forecast.csv', 'text/csv;charset=utf-8');
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
          case 'variance': {
            const r = calculate.variance(value('actual'), value('budget'), value('kind'));
            result = { inputs: `actual ${money('actual')}, budget ${money('budget')}, figure type ${value('kind')}`, principal: 0,
              rows: [['Actual minus budget', aud(r.difference)], ['Difference as a share of absolute budget', percent(r.percent)]], note: r.effect };
            break;
          }
          case 'loan': {
            const r = calculate.loan(value('principal'), value('rate'), value('months'));
            result = { inputs: `principal ${money('principal')}, ${value('rate')}% annual nominal rate, ${count(value('months'), 'monthly payment')}`, principal: 0,
              rows: [['Monthly payment', aud(r.payment)], ['First payment interest', aud(r.firstInterest)], ['First payment principal', aud(r.firstPrincipal)], ['Estimated total interest', aud(r.totalInterest)]] };
            break;
          }
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
          default: throw new Error('Unknown calculator.');
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
  Promise.all([import(`./business-calculators.mjs${suffix}`), import(`./field-errors.mjs${suffix}`)])
    .then(initialiseCalculators)
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
