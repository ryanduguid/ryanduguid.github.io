// Adds a Copy control to each install command block. Pages work unchanged
// without JavaScript or without the asynchronous clipboard API.
const blocks = document.querySelectorAll('.install-band pre, .install-panel pre');

if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
  for (const pre of blocks) {
    const wrap = document.createElement('div');
    wrap.className = 'copy-wrap';
    pre.parentNode.insertBefore(wrap, pre);
    wrap.append(pre);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-button';
    button.textContent = 'Copy';
    const blockLabel = pre.getAttribute('aria-label');
    if (blockLabel) {
      button.setAttribute('aria-label', 'Copy: ' + blockLabel.toLowerCase());
    }
    const status = document.createElement('p');
    status.className = 'copy-status';
    status.setAttribute('role', 'status');
    button.addEventListener('click', async () => {
      status.textContent = '';
      const commands = [...pre.querySelectorAll('.cmd')];
      const text = (commands.length
        ? commands.map((command) => command.textContent).join('\n')
        : pre.textContent
      ).trim();
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = 'Copied to clipboard.';
      } catch {
        status.textContent = 'Copy unavailable. Select the command and copy it manually.';
      }
    });
    wrap.append(button, status);
  }
}
