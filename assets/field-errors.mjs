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

// Money fields carry inputmode="decimal"; other numbers (percentages,
// months, hours) read as plain figures.
function formatBound(control, bound) {
  const value = Number(bound);
  if (control.getAttribute('inputmode') === 'decimal') {
    return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
  }
  return value.toLocaleString('en-AU');
}

// The browser's own text is locale-dependent and says "select" for a typed
// field, so each validity state maps to the page's wording instead.
export function fieldErrorMessage(control) {
  const validity = control.validity;
  if (validity.valueMissing) {
    if (control.type === 'date') return 'Enter a date.';
    return control.type === 'number' ? 'Enter an amount.' : 'Enter a value.';
  }
  if (validity.badInput) return 'Enter a number using digits only.';
  if (validity.rangeUnderflow) return `Enter ${formatBound(control, control.min)} or more.`;
  if (validity.rangeOverflow) return `Enter ${formatBound(control, control.max)} or less.`;
  if (validity.stepMismatch) {
    return Number(control.step) === 0.01
      ? 'Use no more than two decimal places.'
      : `Use a multiple of ${control.step}.`;
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
    (control) => control.willValidate && !control.validity.valid
  );
  if (!invalid) return true;
  showFieldError(invalid);
  invalid.focus();
  return false;
}
