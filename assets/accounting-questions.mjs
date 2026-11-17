// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// The question pages' search, selection and checklist download.

import { download } from './accounting-pages.mjs';

const questions = [...document.querySelectorAll('details.question')];
if (questions.length) {
  const search = document.querySelector('#question-search');
  const params = new URLSearchParams(location.search);
  search.value = params.get('q') || '';
  const checkbox = new Map(questions.map(q => [q, q.querySelector('input')]));
  const selected = () => questions.filter(q => checkbox.get(q).checked);
  const countNode = document.querySelector('#question-count');
  let countTimer;
  const groups = [...document.querySelectorAll('.question-group')];
  const normalise = text => text.toLocaleLowerCase('en-AU').replace(/[^a-z0-9]+/g, ' ');
  const text = new Map(questions.map(q => [q, normalise(`${q.textContent} ${q.dataset.searchTerms || ''}`)]));
  const tools = document.querySelector('.question-tools');
  const clearFilters = document.querySelector('#clear-filters');
  document.querySelector('.question-controls fieldset').disabled = false;
  // The script owns this state, so a cached older copy of it still leaves the button usable.
  clearFilters.disabled = !search.value;
  // A saved search opens the tools so the filter that hid questions is in view.
  if (search.value) tools.open = true;
  document.querySelectorAll('.question-select').forEach(node => { node.hidden = false; });

  function filter() {
    const words = normalise(search.value).split(/\s+/).filter(Boolean);
    for (const q of questions) {
      q.hidden = !words.every(word => text.get(q).includes(word));
      q.classList.toggle('is-selected', checkbox.get(q).checked);
    }
    for (const group of groups) group.hidden = !group.querySelector('details:not([hidden])');
    const count = selected().length;
    clearTimeout(countTimer);
    countTimer = setTimeout(() => {
      const shown = questions.filter(q => !q.hidden).length;
      countNode.textContent = shown
        ? `${shown} questions. ${count} selected.`
        : `No questions match. Choose Clear filters to show all ${questions.length}. ${count} selected.`;
    }, 300);
    for (const id of ['download-checklist', 'print-checklist', 'clear-selection']) {
      document.getElementById(id).disabled = count === 0;
    }
    clearFilters.disabled = !search.value;
    // The first selection opens the tools, so the download and print actions are in reach.
    if (count && !tools.open) tools.open = true;
    // The filters live in the URL so a filtered view can be shared or reloaded.
    const query = new URLSearchParams();
    if (search.value) query.set('q', search.value);
    const queryText = query.toString();
    history.replaceState(null, '', `${location.pathname}${queryText ? `?${queryText}` : ''}${location.hash}`);
  }
  search.addEventListener('input', filter);
  for (const q of questions) checkbox.get(q).addEventListener('change', filter);
  if (search.value || params.has('topic')) filter();
  clearFilters.addEventListener('click', () => {
    search.value = '';
    filter();
    search.focus();
  });
  document.querySelector('#clear-selection').addEventListener('click', () => {
    for (const q of selected()) checkbox.get(q).checked = false;
    filter();
    search.focus();
  });

  function revealHash() {
    const target = document.getElementById(location.hash.slice(1));
    if (!target || (!target.matches('.question, .question-group'))) return;
    search.value = '';
    filter();
    if (target.matches('.question')) target.open = true;
    target.scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  window.addEventListener('hashchange', revealHash);
  revealHash();

  document.querySelector('#download-checklist').addEventListener('click', () => {
    const lines = ['# Australian accounting checklist', '',
      'Confirm the income year, facts and source guidance before relying on a conclusion.', '',
      'Reviewer: ____________________', 'Period: ____________________', 'Review date: ____________________', ''];
    for (const q of selected()) {
      lines.push(`## ${q.querySelector('summary').textContent.trim()}`, '', q.querySelector('.question-answer p').textContent.trim(), '');
      lines.push(q.closest('.question-group').querySelector('.topic-review').textContent.trim(), '');
      for (const step of q.querySelectorAll('ol li')) lines.push(`- [ ] ${step.textContent.trim()}`);
      const example = q.querySelector('.question-example');
      if (example) lines.push('', ...[...example.querySelectorAll('p')].map(p => p.textContent.trim()), '');
      lines.push('', q.querySelector('.question-boundary').textContent.trim(), '');
      for (const link of q.querySelectorAll('.question-links a')) {
        // Downloads retain canonical links even when made from a local preview.
        lines.push(`[${link.textContent.trim()}](${new URL(link.getAttribute('href'), 'https://duguid.com.au').href})`);
      }
      lines.push('', 'Evidence and unresolved items: ____________________', '');
    }
    download(lines.join('\n'), 'accounting-checklist.md', 'text/markdown;charset=utf-8');
  });

  let beforePrint;
  function restorePrint() {
    if (!beforePrint) return;
    for (const [q, open] of beforePrint) q.open = open;
    beforePrint = null;
    document.body.classList.remove('print-selected');
    filter();
  }
  window.addEventListener('afterprint', restorePrint);
  document.querySelector('#print-checklist').addEventListener('click', () => {
    beforePrint = questions.map(q => [q, q.open]);
    document.body.classList.add('print-selected');
    for (const group of groups) group.hidden = false;
    for (const q of questions) { q.hidden = false; q.open = q.classList.contains('is-selected'); }
    window.print();
  });
}
