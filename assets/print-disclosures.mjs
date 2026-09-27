// The print styles expose closed disclosures through ::details-content, which
// WebKit reports as supported but does not apply, so a Safari print lost the
// fixed proof and the extra accounting tasks. For print media the disclosures
// open here and close again afterwards; Chromium prints the same either way.
const selector = 'details.proof-capture, .work-chooser details';
let opened = [];

function open() {
  opened = [...document.querySelectorAll(selector)].filter((details) => !details.open);
  for (const details of opened) details.open = true;
}

function close() {
  for (const details of opened) details.open = false;
  opened = [];
}

addEventListener('beforeprint', open);
addEventListener('afterprint', close);
matchMedia('print').addEventListener('change', (event) => (event.matches ? open() : close()));
