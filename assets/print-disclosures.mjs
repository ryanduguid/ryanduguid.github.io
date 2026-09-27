// The print styles expose closed disclosures through ::details-content, which
// WebKit reports as supported but does not apply, so a Safari print lost the
// fixed proof and the extra accounting tasks. For print media the disclosures
// open here and close again afterwards; Chromium prints the same either way.
// A print session can fire both beforeprint and a print media change, so the
// open and close steps run once per session, and print media already active
// when the module runs is honoured.
const selector = 'details.proof-capture, .work-chooser details';
const printMedia = matchMedia('print');
let opened = [];
let printing = false;

function open() {
  if (printing) return;
  printing = true;
  opened = [...document.querySelectorAll(selector)].filter((details) => !details.open);
  for (const details of opened) details.open = true;
}

function close() {
  if (!printing) return;
  printing = false;
  for (const details of opened) details.open = false;
  opened = [];
}

addEventListener('beforeprint', open);
addEventListener('afterprint', close);
printMedia.addEventListener('change', (event) => (event.matches ? open() : close()));
if (printMedia.matches) open();
