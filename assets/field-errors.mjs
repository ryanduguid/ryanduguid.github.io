// Inline field errors shared by the Coal LSL calculator and the business
// calculators: one message in the site's own words beside the field that
// failed, announced through role="alert" and linked with aria-describedby.
// Served as an external module so every page can run under a script-src
// 'self' Content Security Policy with no inline script.

let generatedFieldId = 0;

export function ensureControlId(control) {
  if (!control.id) {
    generatedFieldId += 1;
    control.id = `calculator-field-${generatedFieldId}`;
  }
  return control.id;
}

export function describedByTokens(control) {
  return new Set((control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
}

// Date fields carry ISO limits; money fields carry inputmode="decimal"; other
// numbers (percentages, months, hours) read as plain figures.
// A browser without date inputs reports type 'text' for <input type="date">, so
// the attribute decides, and the ISO value is then range-checked below.
function isDateField(control) {
  return control.type === 'date' || control.getAttribute('type') === 'date';
}

function formatBound(control, bound) {
  if (isDateField(control)) {
    const [year, month, day] = bound.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  }
  const value = Number(bound);
  if (control.getAttribute('inputmode') === 'decimal') {
    return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
  }
  return value.toLocaleString('en-AU');
}

// Dates read "or later" and "or earlier"; amounts read "or more" and "or less".
function rangeMessage(control, bound, direction) {
  const dateWords = { min: 'later', max: 'earlier' };
  const numberWords = { min: 'more', max: 'less' };
  const word = (isDateField(control) ? dateWords : numberWords)[direction];
  return `Enter ${formatBound(control, bound)} or ${word}.`;
}

// A browser without date inputs enforces neither min nor max, so an ISO value
// is compared with the attributes here as well. Returns 'min', 'max' or null.
export function dateOutOfRange(control) {
  if (!isDateField(control) || !/^\d{4}-\d{2}-\d{2}$/.test(control.value)) return null;
  if (control.min && control.value < control.min) return 'min';
  if (control.max && control.value > control.max) return 'max';
  return null;
}

// The browser's own text is locale-dependent and says "select" for a typed
// field, so each validity state maps to the page's wording instead.
export function fieldErrorMessage(control) {
  const validity = control.validity;
  if (validity.valueMissing) {
    if (isDateField(control)) return 'Enter a date.';
    if (control.type === 'month') return 'Enter a month.';
    return control.type === 'number' ? 'Enter an amount.' : 'Enter a value.';
  }
  if (validity.badInput) return 'Enter a number using digits only.';
  const dateRange = dateOutOfRange(control);
  if (validity.rangeUnderflow || dateRange === 'min') return rangeMessage(control, control.min, 'min');
  if (validity.rangeOverflow || dateRange === 'max') return rangeMessage(control, control.max, 'max');
  if (validity.stepMismatch) {
    if (Number(control.step) === 1) return 'Enter a whole number.';
    // A step of 0.01 or .0001 limits decimal places; say how many in words.
    const places = /^0?\.(0*1)$/.exec(control.step)?.[1].length;
    const words = ['', 'one', 'two', 'three', 'four'];
    if (places === 1) return 'Use no more than one decimal place.';
    if (places) return `Use no more than ${words[places] ?? places} decimal places.`;
    return `Use a multiple of ${control.step}.`;
  }
  return control.validationMessage;
}

export function clearFieldError(control) {
  const id = `${ensureControlId(control)}-error`;
  document.getElementById(id)?.remove();
  control.removeAttribute('aria-invalid');
  const tokens = describedByTokens(control);
  tokens.delete(id);
  if (tokens.size) control.setAttribute('aria-describedby', [...tokens].join(' '));
  else control.removeAttribute('aria-describedby');
}

export function showFieldError(control) {
  clearFieldError(control);
  const id = `${ensureControlId(control)}-error`;
  const message = document.createElement('p');
  message.id = id;
  message.className = 'field-error';
  message.setAttribute('role', 'alert');
  message.textContent = fieldErrorMessage(control);
  const anchor = control.closest('label') || control;
  anchor.insertAdjacentElement('afterend', message);
  control.setAttribute('aria-invalid', 'true');
  const tokens = describedByTokens(control);
  tokens.add(id);
  control.setAttribute('aria-describedby', [...tokens].join(' '));
}

// Shows the first invalid control's error and focuses it. Returns true when
// every control is valid.
export function reportFirstInvalid(form) {
  const invalid = [...form.elements].find(
    (control) => control.willValidate && (!control.validity.valid || dateOutOfRange(control) !== null)
  );
  if (!invalid) return true;
  showFieldError(invalid);
  invalid.focus();
  return false;
}
