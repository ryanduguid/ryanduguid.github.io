// Home page worked proof, made live. The section already showed one captured
// result; this lets a visitor change the figures and watch which formula wins.
//
// Every number here comes from levy.mjs, the same module the full calculator
// and scripts/levy.test.mjs use. This file reads the form and writes the
// result, and does no arithmetic of its own beyond formatting.
//
// The static markup ships this same worked example already computed, so the
// section states a complete, correct calculation with scripting off. The
// figures in the markup are held to the module by scripts/home-levy.test.mjs.

import {
  toCents,
  baseRateWages,
  levyCents,
  LEVY_RATE_NUMERATOR,
  LEVY_RATE_DENOMINATOR,
} from './levy.mjs';

const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

// The levy before rounding is the one figure that has to show its fractional
// cents, because the point of the section is that rounding happens once.
export function exactLevyCents(eligibleWagesCents) {
  return (eligibleWagesCents * LEVY_RATE_NUMERATOR) / LEVY_RATE_DENOMINATOR;
}

export function results(dollars) {
  const wages = baseRateWages({
    baseRateCents: toCents(dollars.base),
    overtimeAndPenaltyCents: toCents(dollars.overtime),
    allowancesCents: toCents(dollars.allowances),
  });
  return {
    winner: wages.winner,
    formulaA: money.format(wages.formulaA / 100),
    formulaB: money.format(wages.formulaB / 100),
    eligible: money.format(wages.eligibleWagesCents / 100),
    exact: '$' + (exactLevyCents(wages.eligibleWagesCents) / 100).toFixed(4),
    levy: money.format(levyCents(wages.eligibleWagesCents) / 100),
  };
}

// A blank or negative field reads as zero rather than throwing, so a
// half-finished entry still shows a calculation instead of an error.
function amount(field) {
  const value = Number(field.value);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// Guarded so the pure functions above can be imported by the node test, which
// is what keeps the figures in index.html honest.
const form = typeof document === 'undefined' ? null : document.getElementById('home-levy');

if (form) {
  const output = new Map(
    [...form.querySelectorAll('[data-out]')].map((el) => [el.dataset.out, el]),
  );
  const rows = new Map(
    [...form.querySelectorAll('[data-row]')].map((el) => [el.dataset.row, el]),
  );

  const render = () => {
    const shown = results({
      base: amount(form.elements.base),
      overtime: amount(form.elements.overtime),
      allowances: amount(form.elements.allowances),
    });
    for (const [key, element] of output) {
      element.textContent = shown[key];
    }
    for (const [key, element] of rows) {
      element.classList.toggle('is-applied', key === shown.winner);
    }
  };

  form.addEventListener('input', render);
  // The form never submits: there is nothing to send and nothing to store.
  form.addEventListener('submit', (event) => event.preventDefault());
  render();
}
