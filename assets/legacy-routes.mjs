if (window.location.hash.toLowerCase() === '#engage') {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}
