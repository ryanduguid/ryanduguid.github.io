const currencyFormat = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const aud = value => currencyFormat.format(value);
const dateFormat = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const calendarDate = value => dateFormat.format(new Date(`${value}T00:00:00Z`));
const percent = value => value === null ? 'undefined (zero base)' : `${value.toFixed(2)}%`;

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
  const topic = document.querySelector('#question-topic');
  const selected = () => questions.filter(q => q.querySelector('input').checked);
  const groups = [...document.querySelectorAll('.question-group')];
  const normalise = text => text.toLocaleLowerCase('en-AU').replace(/[^a-z0-9]+/g, ' ');
  const text = new Map(questions.map(q => [q, normalise(`${q.textContent} ${q.dataset.searchTerms || ''}`)]));
  document.querySelector('.question-controls fieldset').disabled = false;
  document.querySelectorAll('.question-select').forEach(node => { node.hidden = false; });

  function filter() {
    const words = normalise(search.value).split(/\s+/).filter(Boolean);
    for (const q of questions) {
      q.hidden = (topic.value && q.closest('.question-group').dataset.topic !== topic.value)
        || !words.every(word => text.get(q).includes(word));
      q.classList.toggle('is-selected', q.querySelector('input').checked);
    }
    for (const group of groups) group.hidden = !group.querySelector('details:not([hidden])');
    const count = selected().length;
    document.querySelector('#question-count').textContent = `${questions.filter(q => !q.hidden).length} questions. ${count} selected.`;
    for (const id of ['download-checklist', 'print-checklist', 'clear-selection']) {
      document.getElementById(id).disabled = count === 0;
    }
  }
  search.addEventListener('input', filter);
  topic.addEventListener('change', filter);
  for (const q of questions) q.querySelector('input').addEventListener('change', filter);
  document.querySelector('#clear-filters').addEventListener('click', () => {
    search.value = '';
    topic.value = '';
    filter();
    search.focus();
  });
  document.querySelector('#clear-selection').addEventListener('click', () => {
    for (const q of selected()) q.querySelector('input').checked = false;
    filter();
    search.focus();
  });

  function revealHash() {
    const target = document.getElementById(location.hash.slice(1));
    if (!target || (!target.matches('.question, .question-group'))) return;
    search.value = '';
    topic.value = '';
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
if (forms.length) import('./business-calculators.mjs').then(calculate => {
  for (const form of forms) {
    form.querySelector('fieldset').disabled = false;
    const output = form.querySelector('output');
    let csv = '';
    const cashDownload = form.querySelector('#download-cash');
    const value = name => form.elements.namedItem(name).value;

    const cashInputs = () => ({ version: 1, currency: 'AUD', startDate: value('start-date'),
      opening: value('opening'), buffer: value('buffer'), week: value('week'), amount: value('amount'), delay: value('delay'),
      weeks: Array.from({ length: 13 }, (_, i) => ({ receipts: value(`receipts-${i + 1}`), payments: value(`payments-${i + 1}`) })) });
    if (cashDownload) {
      const start = form.elements.namedItem('start-date');
      const today = new Date();
      start.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const fileStatus = form.querySelector('#cash-file-status');
      form.querySelector('#save-cash').addEventListener('click', () => {
        if (!form.reportValidity()) return;
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
        const fieldset = form.querySelector('fieldset');
        fieldset.disabled = true;
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
        finally { fieldset.disabled = false; event.target.value = ''; }
      });
    }

    function invalidate(event) {
      if (event?.target.type === 'file') return;
      if (form.dataset.calculated) output.textContent = 'Inputs changed. Calculate again.';
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
      try {
        let message;
        switch (form.dataset.calculator) {
          case 'gst': {
            const r = calculate.gst(value('amount'), form.elements.namedItem('inclusive').checked);
            message = `Excluding GST: ${aud(r.net)}. GST: ${aud(r.gst)}. Including GST: ${aud(r.gross)}.`;
            break;
          }
          case 'business-use':
            message = `Business-use share: ${aud(calculate.businessUse(value('cost'), value('percent')).share)}.`;
            break;
          case 'margin': {
            const r = calculate.margin(value('sales'), value('cost'));
            message = `Gross profit: ${aud(r.profit)}. Margin: ${percent(r.margin)}. Markup: ${percent(r.markup)}.`;
            break;
          }
          case 'break-even': {
            const r = calculate.breakEven(value('fixed'), value('price'), value('variable'));
            message = `Contribution per unit: ${aud(r.contribution)}. Break-even: ${r.units.toLocaleString('en-AU')} whole units, or ${aud(r.sales)} in sales.`;
            break;
          }
          case 'hourly':
            message = `Required hourly rate before GST: ${aud(calculate.hourlyRate(value('cost'), value('profit'), value('hours')).rate)}.`;
            break;
          case 'variance': {
            const r = calculate.variance(value('actual'), value('budget'), value('kind'));
            message = `Actual minus budget: ${aud(r.difference)}. Difference as a share of absolute budget: ${percent(r.percent)}. ${r.effect}.`;
            break;
          }
          case 'loan': {
            const r = calculate.loan(value('principal'), value('rate'), value('months'));
            message = `Monthly payment: ${aud(r.payment)}. First payment interest: ${aud(r.firstInterest)}. First payment principal: ${aud(r.firstPrincipal)}. Estimated total interest: ${aud(r.totalInterest)}.`;
            break;
          }
          case 'staff': {
            const r = calculate.staffCost(value('wages'), value('super'), value('other'));
            message = `Annual staff cost: ${aud(r.annual)}. Monthly average: ${aud(r.monthly)}.`;
            break;
          }
          case 'cash': {
            const weeks = Array.from({ length: 13 }, (_, i) => ({ receipts: value(`receipts-${i + 1}`), payments: value(`payments-${i + 1}`) }));
            const dates = calculate.cashWeekDates(value('start-date'));
            const r = calculate.cashForecast(value('opening'), weeks, value('buffer'), { week: value('week'), amount: value('amount'), delay: value('delay') });
            message = `Closing cash: ${aud(r.closing)}. Lowest opening or weekly closing balance: ${aud(r.minimum)}. Funding gap to the buffer: ${aud(r.funding)}. Receipts deferred beyond week 13: ${aud(r.deferred)}.`;
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
        output.textContent = message;
        form.dataset.calculated = 'true';
      } catch (error) {
        output.textContent = error.message;
      }
      output.tabIndex = -1;
      output.focus({ preventScroll: true });
      output.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    });
  }
});
