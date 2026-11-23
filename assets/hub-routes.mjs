// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The questions and calculators indexes once held every answer and form under
// a fragment id. Each old id is still on the index entry that links to the new
// page, so a bookmark lands on a link without JavaScript; with it, follow that
// link straight away so the answer or form opens as it used to.
// An empty hash is a string, not null, so it must not reach the optional chain.
const entry = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
const link = entry?.querySelector('a[href]');
if (link) {
  window.location.replace(link.href);
} else {
  const notice = document.getElementById('question-search-context');
  if (notice) {
    const params = new URLSearchParams(window.location.search);
    const search = params.get('q') || '';
    const topic = params.get('topic') || '';
    const groups = [...document.querySelectorAll('.question-group')];
    const selected = groups.find(group => group.id === topic);
    if (selected) {
      const destination = new URL(selected.querySelector('h2 a').href);
      if (search) destination.searchParams.set('q', search);
      window.location.replace(destination.href);
    } else if (search || topic) {
      // Treat saved search text as text, never markup or a destination URL.
      notice.textContent = search
        ? `Saved search: ${search}. Choose a topic below to search its ten questions.`
        : 'This saved topic is no longer available. Choose a topic below.';
      if (search && topic) notice.append(' The saved topic was not recognised.');
      notice.hidden = false;
      for (const topicLink of document.querySelectorAll('.question-group h2 a')) {
        const destination = new URL(topicLink.href);
        if (search) destination.searchParams.set('q', search);
        topicLink.href = destination.href;
      }
    }
  }
}

const calcForm = document.getElementById('calc-filter');
const calcInput = calcForm?.querySelector('#calc-search');
const calcCount = calcForm?.querySelector('#calc-count');
if (calcForm && calcInput && calcCount) {
  const input = calcInput;
  const count = calcCount;
  const lists = [...document.querySelectorAll('.calculator-list')];
  const items = lists.flatMap(list => [...list.querySelectorAll(':scope > li')]);
  const normalise = text => text.toLocaleLowerCase('en-AU').replace(/[^a-z0-9]+/g, ' ');
  const haystack = new Map(items.map(item => {
    const list = item.closest('.calculator-list');
    const heading = list?.previousElementSibling?.tagName === 'H2' ? list.previousElementSibling.textContent : '';
    return [item, normalise(`${heading} ${item.textContent} ${item.dataset.keywords || ''}`)];
  }));
  const describe = shown => shown === items.length
    ? `Showing all ${shown} calculators.`
    : shown
      ? `Showing ${shown} of ${items.length} calculators.`
      : `No calculators match. Clear the search to show all ${items.length}.`;
  let timer;
  const filter = () => {
    const words = normalise(input.value).split(' ').filter(Boolean);
    for (const item of items) item.hidden = !words.every(word => haystack.get(item).includes(word));
    for (const list of lists) {
      const empty = !list.querySelector(':scope > li:not([hidden])');
      list.hidden = empty;
      if (list.previousElementSibling?.tagName === 'H2') list.previousElementSibling.hidden = empty;
    }
    const shown = items.filter(item => !item.hidden).length;
    clearTimeout(timer);
    timer = setTimeout(() => { count.textContent = describe(shown); }, 180);
  };
  input.addEventListener('input', filter);
  calcForm.addEventListener('submit', event => event.preventDefault());
  count.textContent = describe(items.length);
  if (input.value) filter();
  calcForm.hidden = false;
}
