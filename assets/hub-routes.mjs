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
