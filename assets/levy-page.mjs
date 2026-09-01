// Page wiring for the Coal LSL levy calculator: branch switching, bonus
// rows, result rendering, the per-employee table and CSV export. The levy
// arithmetic stays in levy.mjs, levy-form.mjs and levy-explanation.mjs.
// Served as an external module so every page can run under a
// script-src 'self' Content Security Policy with no inline script.
import {
  levyCents, LEVY_RATE_AS_AT, LEVY_RATE_NUMERATOR, LEVY_RATE_DENOMINATOR,
} from '/assets/levy.mjs';
import { explainLevyResult, money } from '/assets/levy-explanation.mjs';
import { compute } from '/assets/levy-form.mjs';

// Visible label of each casual pay component casualWages() can report as
// ignored, so a discarded figure is named rather than silently dropped.
const CASUAL_FIELD_LABELS = {
  baseRatePay: 'Base rate pay',
  casualLoading: 'Casual loading',
  ordinaryRatePay: 'All-in ordinary rate pay',
};

function render(result, into, allMonetaryAmountsBlank = false) {
  const cents = result.eligibleWagesCents;
  // Deviation from the brief's literal snippet: the brief hardcodes
  // (cents * 27) / 1000 here, which duplicates the rate levy.mjs already
  // exports. This page sources it from the engine's own constants
  // instead. The numbers are identical either way.
  const exact = (cents * LEVY_RATE_NUMERATOR) / LEVY_RATE_DENOMINATOR;
  const rounded = levyCents(cents);
  into.innerHTML = '';
  const branchLabel = result.branch.startsWith('s ')
    ? 'section ' + result.branch.slice(2)
    : result.branch;
  const rows = [
    { kind: 'eligible-wages', label: 'Eligible wages', value: money(cents) },
    {
      kind: 'levy',
      label: 'Levy at 2.7 per cent, as at ' + LEVY_RATE_AS_AT,
      value: money(rounded),
    },
    ...(exact !== rounded
      ? [{
          kind: 'before-rounding',
          label: 'Before rounding',
          value: (exact / 100).toFixed(4) + ' dollars',
        }]
      : []),
    { kind: 'branch', label: 'Branch applied', value: branchLabel },
    ...(result.branch === 's 3B(1)'
      ? [
          { kind: 'formula-a', label: 'Formula A', value: money(result.formulaA) },
          { kind: 'formula-b', label: 'Formula B', value: money(result.formulaB) },
        ]
      : []),
  ];
  for (const { kind, label, value } of rows) {
    const row = document.createElement('div');
    row.className = 'result-row';
    row.dataset.resultKind = kind;
    const labelElement = document.createElement('span');
    const valueElement = document.createElement('strong');
    labelElement.textContent = label;
    valueElement.textContent = value;
    row.append(labelElement, valueElement);
    into.append(row);
  }
  const why = document.createElement('p');
  why.className = 'result-why';
  why.textContent = explainLevyResult(result);
  into.append(why);
  if (cents === 0 && allMonetaryAmountsBlank) {
    const blankPolicy = document.createElement('p');
    blankPolicy.className = 'result-blank-policy';
    blankPolicy.textContent = 'All monetary amounts were blank, so the calculator treated each as $0.00.';
    into.append(blankPolicy);
  }
  if (result.ignored && result.ignored.length) {
    const ignoredPolicy = document.createElement('p');
    ignoredPolicy.className = 'result-blank-policy';
    ignoredPolicy.textContent = 'Not counted on the ' + branchLabel + ' branch: '
      + result.ignored.map((name) => CASUAL_FIELD_LABELS[name]).join(', ')
      + '. The reporting month and the two casual loading answers select which pay fields apply.';
    into.append(ignoredPolicy);
  }
}

// Wiring beyond the engine call: branch switching, bonus rows, the
// per-employee table and CSV export. None of this touches the formulas
// above; it only reads and displays what compute() and render() return.

const calcForm = document.getElementById('calc-form');
const branchFields = document.getElementById('branch-fields');
const bonusRows = document.getElementById('bonus-rows');
const resultEl = document.getElementById('result');
const employeeRows = document.getElementById('employee-rows');
const employeeTableWrap = document.getElementById('employee-table-wrap');
const resultActions = document.getElementById('result-actions');

let generatedFieldId = 0;

function ensureControlId(control) {
  if (!control.id) {
    generatedFieldId += 1;
    control.id = `calculator-field-${generatedFieldId}`;
  }
  return control.id;
}

function describedByTokens(control) {
  return new Set((control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
}

function clearFieldError(control) {
  const id = `${ensureControlId(control)}-error`;
  document.getElementById(id)?.remove();
  control.removeAttribute('aria-invalid');
  const tokens = describedByTokens(control);
  tokens.delete(id);
  if (tokens.size) control.setAttribute('aria-describedby', [...tokens].join(' '));
  else control.removeAttribute('aria-describedby');
}

function showFieldError(control) {
  clearFieldError(control);
  const id = `${ensureControlId(control)}-error`;
  const message = document.createElement('p');
  message.id = id;
  message.className = 'field-error';
  message.setAttribute('role', 'alert');
  message.textContent = control.validationMessage;
  const anchor = control.closest('label') || control;
  anchor.insertAdjacentElement('afterend', message);
  control.setAttribute('aria-invalid', 'true');
  const tokens = describedByTokens(control);
  tokens.add(id);
  control.setAttribute('aria-describedby', [...tokens].join(' '));
}

function validateForm() {
  const invalid = [...calcForm.elements].find(
    (control) => control.willValidate && !control.validity.valid
  );
  if (!invalid) return true;
  showFieldError(invalid);
  invalid.focus();
  return false;
}

calcForm.addEventListener('input', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
    clearFieldError(event.target);
  }
});

function showBranch(branch) {
  branchFields.innerHTML = '';
  branchFields.append(document.getElementById(`fields-${branch}`).content.cloneNode(true));
}
calcForm.querySelectorAll('input[name="branch"]').forEach((r) =>
  r.addEventListener('change', (e) => showBranch(e.target.value))
);
showBranch(calcForm.elements.branch.value);

// Fills the form with the same fabricated figures as the home-page
// worked proof, so a visitor sees a full result before typing anything.
document.getElementById('load-example').addEventListener('click', () => {
  calcForm.elements.branch.value = 'baseRate';
  showBranch('baseRate');
  bonusRows.innerHTML = '';
  document.getElementById('baseRate').value = '6000';
  document.getElementById('overtime').value = '3000';
  document.getElementById('allowances').value = '500';
  document.getElementById('sacrificed').value = '0';
  // Programmatic assignment fires no input event, so clear any stale
  // validation marks before recalculating.
  [...calcForm.querySelectorAll('input, select')].forEach(clearFieldError);
  calculate();
});

document.getElementById('add-bonus').addEventListener('click', () => {
  const bonusRow = document.getElementById('bonus-row-template').content.cloneNode(true);
  const amount = bonusRow.querySelector('[data-help-template="bonus-amount"]');
  const help = bonusRow.querySelector('[data-help-template="bonus-amount-note"]');
  const helpId = `${ensureControlId(amount)}-help`;
  help.id = helpId;
  const tokens = describedByTokens(amount);
  tokens.add(helpId);
  amount.setAttribute('aria-describedby', [...tokens].join(' '));
  bonusRows.append(bonusRow);
  relabelBonuses();
});
function relabelBonuses() {
  bonusRows.querySelectorAll('.bonus-remove').forEach((button, index) => {
    button.setAttribute('aria-label', `Remove bonus ${index + 1}`);
  });
}
bonusRows.addEventListener('click', (e) => {
  if (e.target.classList.contains('bonus-remove')) {
    e.target.closest('.bonus-row').remove();
    relabelBonuses();
  }
});

function calculate() {
  if (!validateForm()) return false;
  const allMonetaryAmountsBlank = [...calcForm.querySelectorAll('input[type="number"]')]
    .every((input) => input.value.trim() === '');
  render(compute(calcForm), resultEl, allMonetaryAmountsBlank);
  resultActions.hidden = false;
  return true;
}

calcForm.addEventListener('submit', (event) => {
  event.preventDefault();
  // Below 56rem the result stacks under the form, so hand the scroll
  // position to it; CSS scroll-behavior already respects reduced motion.
  if (calculate() && matchMedia('(max-width: 56rem)').matches) {
    document.getElementById('result-title').scrollIntoView({ block: 'start' });
  }
});

// Recalculate from the current inputs before printing, so the printed
// working can never pair edited figures with a stale result.
document.getElementById('print-working').addEventListener('click', () => {
  if (calculate()) window.print();
});

let employees = [];
const tableStatus = document.getElementById('table-status');

function rowCount() {
  return `${employees.length} ${employees.length === 1 ? 'row' : 'rows'}`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function renderEmployees() {
  employeeRows.innerHTML = '';
  let totalWages = 0;
  employees.forEach((emp, i) => {
    totalWages += emp.eligibleWagesCents;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(emp.label)}</td><td>${emp.branch}</td>` +
      `<td>${money(emp.eligibleWagesCents)}</td><td>${money(emp.levyCents)}</td>` +
      `<td><button type="button" class="link-button" data-remove="${i}" aria-label="Remove ${escapeHtml(emp.label)}">Remove</button></td>`;
    employeeRows.append(tr);
  });
  document.getElementById('employee-total-wages').textContent = money(totalWages);
  // Round once on the summed eligible wages, not the sum of already
  // rounded per-employee levies (the levy is imposed on the employer's
  // aggregate, and rounding happens once, at the final step only).
  document.getElementById('employee-total-levy').textContent = money(levyCents(totalWages));
  employeeTableWrap.hidden = employees.length === 0;
}

document.getElementById('add-employee').addEventListener('click', () => {
  // calculate() re-renders the result so the row added below always
  // matches the figures shown beside it.
  if (!calculate()) return;
  const result = compute(calcForm);
  const labelInput = document.getElementById('employeeLabel');
  const label = labelInput.value.trim() || `Reference ${employees.length + 1}`;
  employees.push({
    label,
    branch: result.branch,
    eligibleWagesCents: result.eligibleWagesCents,
    levyCents: levyCents(result.eligibleWagesCents),
  });
  labelInput.value = '';
  renderEmployees();
  tableStatus.textContent = `${label} added to the monthly table, ${rowCount()}.`;
});

employeeRows.addEventListener('click', (e) => {
  const idx = e.target.dataset.remove;
  if (idx !== undefined) {
    const [removed] = employees.splice(Number(idx), 1);
    renderEmployees();
    tableStatus.textContent = `${removed.label} removed from the monthly table, ${rowCount()}.`;
  }
});

function csvField(s) {
  // A field starting with =, +, - or @ is read as a formula by Excel.
  // A leading apostrophe forces it back to text, same as Excel's own
  // "format as text" convention, before the usual quoting for commas,
  // quotes and newlines.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

document.getElementById('export-csv').addEventListener('click', () => {
  const lines = ['Estimate only, not advice.', 'Label,Branch,Eligible wages,Levy'];
  let totalWages = 0;
  for (const emp of employees) {
    totalWages += emp.eligibleWagesCents;
    lines.push([csvField(emp.label), emp.branch, (emp.eligibleWagesCents / 100).toFixed(2),
      (emp.levyCents / 100).toFixed(2)].join(','));
  }
  // Same rounding rule as the on-page total: round once on the summed
  // eligible wages, not the sum of already rounded per-employee levies.
  lines.push(['Total', '', (totalWages / 100).toFixed(2), (levyCents(totalWages) / 100).toFixed(2)].join(','));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'coal-lsl-levy.csv';
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});
