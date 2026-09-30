import assert from 'node:assert/strict';
import test from 'node:test';
import { fieldErrorMessage } from '../assets/field-errors.mjs';

// A minimal stand-in for an <input>: the message logic reads only type, the
// inputmode attribute, min, max, step and the validity flags.
function control({ type = 'number', inputmode, min, max, step, value = '', ...validity }) {
  return {
    type,
    value,
    min,
    max,
    step,
    getAttribute: name => (name === 'inputmode' ? inputmode ?? null : name === 'type' ? type : null),
    validity: {
      valueMissing: false,
      badInput: false,
      rangeUnderflow: false,
      rangeOverflow: false,
      stepMismatch: false,
      ...validity,
    },
    validationMessage: 'browser text',
  };
}

test('date limits read as dates, not numbers', () => {
  const early = control({ type: 'date', min: '1900-01-01', max: '9999-10-02', rangeUnderflow: true });
  assert.equal(fieldErrorMessage(early), 'Enter 1 January 1900 or later.');
  const late = control({ type: 'date', min: '1900-01-01', max: '9999-10-02', rangeOverflow: true });
  assert.equal(fieldErrorMessage(late), 'Enter 2 October 9999 or earlier.');
  assert.equal(fieldErrorMessage(control({ type: 'date', valueMissing: true })), 'Enter a date.');
});

test('a date outside its limits is a range error even when the browser calls it valid', () => {
  // A browser without date inputs leaves rangeUnderflow and rangeOverflow false.
  const early = control({ type: 'date', min: '1900-01-01', max: '9999-10-02', value: '1899-12-31' });
  assert.equal(fieldErrorMessage(early), 'Enter 1 January 1900 or later.');
  const late = control({ type: 'date', min: '1900-01-01', max: '9999-10-02', value: '9999-10-03' });
  assert.equal(fieldErrorMessage(late), 'Enter 2 October 9999 or earlier.');
  const inside = control({ type: 'date', min: '1900-01-01', max: '9999-10-02', value: '2026-09-27' });
  assert.equal(fieldErrorMessage(inside), 'browser text');
  // The same input degraded to a text field keeps the date wording and limits.
  const degraded = control({ type: 'text', min: '1900-01-01', max: '9999-10-02', value: '1899-12-31' });
  degraded.getAttribute = name => (name === 'type' ? 'date' : null);
  assert.equal(fieldErrorMessage(degraded), 'Enter 1 January 1900 or later.');
});

test('month limits read as a month and year', () => {
  const month = (fields) => control({ type: 'month', min: '2023-07', max: '2026-12', ...fields });
  assert.equal(fieldErrorMessage(month({ value: '2023-06', rangeUnderflow: true })), 'Enter July 2023 or later.');
  assert.equal(fieldErrorMessage(month({ value: '2027-01', rangeOverflow: true })), 'Enter December 2026 or earlier.');
  assert.equal(fieldErrorMessage(month({ value: '2023-07' })), 'browser text');
  assert.equal(fieldErrorMessage(month({ value: '2026-09' })), 'browser text');
  assert.equal(fieldErrorMessage(month({ valueMissing: true })), 'Enter a month.');
  // A browser without month inputs reports type 'text' and enforces no limit.
  const degraded = control({ type: 'text', min: '2023-07', value: '2023-06' });
  degraded.getAttribute = name => (name === 'type' ? 'month' : null);
  assert.equal(fieldErrorMessage(degraded), 'Enter July 2023 or later.');
  degraded.value = '2023-07';
  assert.equal(fieldErrorMessage(degraded), 'browser text');
});

test('money and plain number limits keep their formats', () => {
  const money = control({ inputmode: 'decimal', min: '0', max: '1000000000', rangeUnderflow: true });
  assert.equal(fieldErrorMessage(money), 'Enter $0.00 or more.');
  const tooMuch = control({ inputmode: 'decimal', min: '0', max: '1000000000', rangeOverflow: true });
  assert.equal(fieldErrorMessage(tooMuch), 'Enter $1,000,000,000.00 or less.');
  const weeks = control({ min: '0', max: '12', rangeOverflow: true });
  assert.equal(fieldErrorMessage(weeks), 'Enter 12 or less.');
});

test('step messages name decimal places or whole numbers', () => {
  assert.equal(fieldErrorMessage(control({ step: '.01', stepMismatch: true })), 'Use no more than two decimal places.');
  assert.equal(fieldErrorMessage(control({ step: '.0001', stepMismatch: true })), 'Use no more than four decimal places.');
  assert.equal(fieldErrorMessage(control({ step: '0.1', stepMismatch: true })), 'Use no more than one decimal place.');
  assert.equal(fieldErrorMessage(control({ step: '1', stepMismatch: true })), 'Enter a whole number.');
});

test('step and fallback messages are unchanged', () => {
  assert.equal(fieldErrorMessage(control({ step: '0.01', stepMismatch: true })), 'Use no more than two decimal places.');
  assert.equal(fieldErrorMessage(control({ step: '5', stepMismatch: true })), 'Use a multiple of 5.');
  assert.equal(fieldErrorMessage(control({ badInput: true })), 'Enter a number using digits only.');
  assert.equal(fieldErrorMessage(control({})), 'browser text');
});
