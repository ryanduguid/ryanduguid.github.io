// Opens a linked chart in a modal dialog. Without JavaScript, or with a
// modifier key, the link still opens the image itself.
for (const link of document.querySelectorAll('.case-preview > a[href$=".png"]')) {
  const dialog = document.createElement('dialog');
  dialog.className = 'chart-dialog';
  dialog.setAttribute('aria-label', 'Full-size chart');
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  // The same responsive sources as the page, so narrow screens get the narrow chart.
  const picture = link.querySelector('picture').cloneNode(true);
  picture.querySelector('img').removeAttribute('fetchpriority');
  dialog.append(close, picture);
  link.after(dialog);

  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  link.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    dialog.showModal();
  });
}
