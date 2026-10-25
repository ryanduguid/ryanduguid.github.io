// Filters the Tools register by keyword and delivery. Without JavaScript the
// form stays hidden and every tool shows.
const form = document.querySelector('#tool-filter');
if (form) {
  const search = form.querySelector('#tool-search');
  const count = form.querySelector('#tool-count');
  const groups = [...document.querySelectorAll('.collection-register .collection-group')];
  const entries = groups.flatMap(group => [...group.querySelectorAll('.collection-entry')]);
  const normalise = text => text.toLocaleLowerCase('en-AU').replace(/[^a-z0-9]+/g, ' ');
  // An entry also matches its group's label and heading, so 'control' finds the Control tools.
  const text = new Map(entries.map(entry => {
    const header = entry.closest('.collection-group').querySelector('header');
    return [entry, normalise(`${header.textContent} ${entry.textContent}`)];
  }));
  const delivery = new Map(entries.map(entry => {
    const term = [...entry.querySelectorAll('dt')].find(dt => dt.textContent === 'Delivery');
    return [entry, term ? term.nextElementSibling.textContent.trim() : ''];
  }));
  let countTimer;
  const describe = shown => shown === entries.length
    ? `Showing all ${shown} tools.`
    : shown
      ? `Showing ${shown} of ${entries.length} tools.`
      : `No tools match. Clear the search or choose All to show all ${entries.length}.`;

  // Seek, and ye shall find. Matthew 7:7 (KJV)
  function filter() {
    const words = normalise(search.value).split(' ').filter(Boolean);
    const kinds = form.elements.delivery.value.split('|').filter(Boolean);
    for (const entry of entries) {
      entry.hidden = !words.every(word => text.get(entry).includes(word))
        || (kinds.length > 0 && !kinds.includes(delivery.get(entry)));
    }
    for (const group of groups) group.hidden = !group.querySelector('.collection-entry:not([hidden])');
    const shown = entries.filter(entry => !entry.hidden).length;
    // Announce once typing pauses rather than on every keystroke.
    clearTimeout(countTimer);
    countTimer = setTimeout(() => { count.textContent = describe(shown); }, 400);
  }

  form.addEventListener('input', filter);
  form.addEventListener('submit', event => event.preventDefault());
  // Written whilst the form is still hidden, so it is not announced on load.
  count.textContent = describe(entries.length);
  form.hidden = false;
  // A restored back-navigation can bring earlier choices with it.
  if (search.value || form.elements.delivery.value) filter();
}
