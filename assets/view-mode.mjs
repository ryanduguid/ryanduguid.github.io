(() => {
  const key = 'duguid-view-mode';
  const root = document.documentElement;
  let mode = 'human';
  try {
    if (localStorage.getItem(key) === 'machine') mode = 'machine';
  } catch { /* Use Human when storage is unavailable. */ }
  root.dataset.viewMode = mode;

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.querySelector('.view-mode');
    const view = document.querySelector('#machine-view');
    const text = view.querySelector('.machine-view__text');
    const error = view.querySelector('.machine-view__error');
    const human = document.querySelectorAll('.site-header, #main, .site-footer, .skip-link');
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    const source = canonical || new URL(location.pathname, 'https://duguid.com.au').href;
    const disclaimer = document.querySelector('.site-footer__inner > p').textContent;
    let loaded = false;

    async function loadText() {
      if (loaded) return;
      loaded = true;
      error.hidden = true;
      text.hidden = false;
      text.textContent = 'Loading page text...';
      try {
        let section;
        if (canonical) {
          const response = await fetch('/llms-full.txt');
          if (!response.ok) throw new Error('Text unavailable');
          const fullText = (await response.text()).replace(/\r\n/g, '\n');
          section = fullText.split('\n---\n').find(part => part.includes(`\nSource: ${source}\n`));
        }
        // The unindexed 404 page has no entry in llms-full.txt.
        const content = section || `# ${document.title}\n\nSource: ${source}\n\n${document.querySelector('#main').textContent.trim()}`;
        text.textContent = `${content.trim()}\n\n${disclaimer}`;
      } catch {
        loaded = false;
        text.hidden = true;
        error.hidden = false;
      }
    }

    function setMode(next) {
      mode = next === 'machine' ? 'machine' : 'human';
      root.dataset.viewMode = mode;
      view.hidden = mode !== 'machine';
      for (const element of human) element.inert = mode === 'machine';
      for (const radio of toggle.querySelectorAll('input')) radio.checked = radio.value === mode;
      if (mode === 'machine') loadText();
    }

    toggle.addEventListener('change', event => {
      setMode(event.target.value);
      try { localStorage.setItem(key, mode); } catch { /* Keep the current view usable. */ }
    });
    window.addEventListener('storage', event => {
      if (event.key === key || event.key === null) setMode(event.newValue);
    });
    setMode(mode);
    toggle.hidden = false;
  });
})();
