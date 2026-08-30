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
    let resetTimer = 0;
    button.addEventListener('click', async () => {
      const commands = [...pre.querySelectorAll('.cmd')];
      const text = (commands.length
        ? commands.map((command) => command.textContent).join('\n')
        : pre.textContent
      ).trim();
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Select and copy';
      }
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        button.textContent = 'Copy';
      }, 2000);
    });
    wrap.append(button);
  }
}
