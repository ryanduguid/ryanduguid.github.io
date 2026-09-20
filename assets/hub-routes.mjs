// The questions and calculators indexes once held every answer and form under
// a fragment id. Each old id is still on the index entry that links to the new
// page, so a bookmark lands on a link without JavaScript; with it, follow that
// link straight away so the answer or form opens as it used to.
// An empty hash is a string, not null, so it must not reach the optional chain.
const entry = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
const link = entry?.querySelector('a[href]');
if (link) window.location.replace(link.href);
