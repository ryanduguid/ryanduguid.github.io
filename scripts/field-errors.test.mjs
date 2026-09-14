import assert from 'node:assert/strict';
import test from 'node:test';
import { fieldErrorMessage } from '../assets/field-errors.mjs';

// A minimal stand-in for an <input>: the message logic reads only type, the
// inputmode attribute, min, max, step and the validity flags.
function control({ type = 'number', inputmode, min, max, step, ...validity }) {
  return {
    type,
    min,
    max,
    step,
    getAttribute: name => (name === 'inputmode' ? inputmode ?? null : null),
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

test('money and plain number limits keep their formats', () => {
  const money = control({ inputmode: 'decimal', min: '0', max: '1000000000', rangeUnderflow: true });
  assert.equal(fieldErrorMessage(money), 'Enter $0.00 or more.');
  const tooMuch = control({ inputmode: 'decimal', min: '0', max: '1000000000', rangeOverflow: true });
  assert.equal(fieldErrorMessage(tooMuch), 'Enter $1,000,000,000.00 or less.');
  const weeks = control({ min: '0', max: '12', rangeOverflow: true });
  assert.equal(fieldErrorMessage(weeks), 'Enter 12 or less.');
});

test('step and fallback messages are unchanged', () => {
  assert.equal(fieldErrorMessage(control({ step: '0.01', stepMismatch: true })), 'Use no more than two decimal places.');
  assert.equal(fieldErrorMessage(control({ step: '5', stepMismatch: true })), 'Use a multiple of 5.');
  assert.equal(fieldErrorMessage(control({ badInput: true })), 'Enter a number using digits only.');
  assert.equal(fieldErrorMessage(control({})), 'browser text');
});
