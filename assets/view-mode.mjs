// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

(() => {
  const key = 'duguid-view-mode';
  const themeKey = 'duguid-theme';
  const root = document.documentElement;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const schemeMeta = document.querySelector('meta[name="color-scheme"]');
  let mode = 'human';
  let theme = 'dark';
  try {
    if (localStorage.getItem(key) === 'machine') mode = 'machine';
    if (localStorage.getItem(themeKey) === 'light') theme = 'light';
  } catch { /* Use defaults when storage is unavailable. */ }
  root.dataset.viewMode = mode;

  function applyTheme(next) {
    theme = next === 'light' ? 'light' : 'dark';
    root.dataset.theme = theme;
    if (themeMeta) themeMeta.setAttribute('content', theme === 'light' ? '#ffffff' : '#000000');
    if (schemeMeta) schemeMeta.setAttribute('content', theme);
  }
  applyTheme(theme);

  document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.site-header');
    const hasResizeObserver = typeof ResizeObserver === 'function';
    // Anchor destinations must clear the header after text or viewport resizing.
    const measureHeader = () => {
      root.style.setProperty('--measured-header-height', `${header.getBoundingClientRect().height}px`);
    };
    if (hasResizeObserver) new ResizeObserver(measureHeader).observe(header);
    else window.addEventListener('resize', measureHeader);
    const toggle = document.querySelector('.view-mode');
    const themeToggle = document.querySelector('.theme-mode');
    const view = document.querySelector('#machine-view');
    const text = view.querySelector('.machine-view__text');
    const error = view.querySelector('.machine-view__error');
    const human = document.querySelectorAll('.site-header, #main, .site-footer, .skip-link');
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    const source = canonical || new URL(location.pathname, 'https://duguid.com.au').href;
    // The footer notes travel with the text: the advice boundary and the ABN line, not the motto.
    const footerNotes = [...document.querySelectorAll('.site-footer__inner > p:not(.site-footer__motto)')]
      .map((paragraph) => paragraph.textContent.trim())
      .join('\n\n');
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
          // Each indexable page ships its own llms-full.txt entry as index.txt.
          const response = await fetch(new URL('index.txt', location.href));
          if (!response.ok) throw new Error('Text unavailable');
          section = (await response.text()).replace(/\r\n/g, '\n');
        }
        // The unindexed 404 page has no entry in llms-full.txt.
        const content = section || `# ${document.title}\n\nSource: ${source}\n\n${document.querySelector('#main').textContent.trim()}`;
        text.textContent = `${content.trim()}\n\n${footerNotes}`;
      } catch {
        loaded = false;
        text.hidden = true;
        error.hidden = false;
      }
    }

    function setTheme(next) {
      applyTheme(next);
      if (!themeToggle) return;
      for (const radio of themeToggle.querySelectorAll('input')) radio.checked = radio.value === theme;
    }

    function setMode(next, syncHeader = !hasResizeObserver) {
      mode = next === 'machine' ? 'machine' : 'human';
      root.dataset.viewMode = mode;
      view.hidden = mode !== 'machine';
      for (const element of human) element.inert = mode === 'machine';
      if (mode === 'machine') view.setAttribute('role', 'main');
      else view.removeAttribute('role');
      for (const radio of toggle.querySelectorAll('input')) radio.checked = radio.value === mode;
      // loadText reports its own failures in the error element.
      if (mode === 'machine') void loadText();
      if (syncHeader) measureHeader();
    }

    toggle.addEventListener('change', event => {
      setMode(event.target.value, true);
      // Only a user switch moves focus; the load and storage paths must not steal it.
      if (mode === 'machine') view.focus();
      try { localStorage.setItem(key, mode); } catch { /* Keep the current view usable. */ }
    });
    if (themeToggle) {
      themeToggle.addEventListener('change', event => {
        setTheme(event.target.value);
        try { localStorage.setItem(themeKey, theme); } catch { /* Keep the current theme usable. */ }
      });
    }
    window.addEventListener('storage', event => {
      if (event.key === key || event.key === null) setMode(event.newValue);
      if (event.key === themeKey || event.key === null) setTheme(event.newValue);
    });
    setTheme(theme);
    if (themeToggle) themeToggle.hidden = false;
    setMode(mode);
    toggle.parentElement.hidden = false;

    // Collapse long in-page contents lists on phones whilst keeping them open on desktop.
    const toc = document.querySelector('.article-toc');
    if (toc && !toc.querySelector('details')) {
      const heading = toc.querySelector(':scope > p, :scope > h2');
      const items = [...toc.children].filter(child => child !== heading);
      if (items.length) {
        const details = document.createElement('details');
        details.className = 'toc-disclosure';
        const summary = document.createElement('summary');
        summary.textContent = heading ? heading.textContent.trim() : 'On this page';
        const desktop = window.matchMedia('(min-width: 56.0625rem)');
        details.open = desktop.matches;
        desktop.addEventListener('change', event => { details.open = event.matches; });
        const list = document.createElement('div');
        list.className = 'toc-disclosure__list';
        list.append(...items);
        if (heading) heading.remove();
        details.append(summary, list);
        toc.append(details);
      }
    }
  });
})();
