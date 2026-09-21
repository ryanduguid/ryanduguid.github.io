if (window.location.hash.toLowerCase() === '#engage') {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

const routes = [...document.querySelectorAll('.adopt-input')];
const installPath = '/tools/australian-tax-ai-agents/';

function selectAdoptionRoute() {
  const hash = window.location.hash;
  if ((window.location.pathname === '/' || window.location.pathname === '/index.html') && /^#adopt-(none|claude|codex|skills|github)$/.test(hash)) {
    window.location.replace(`${installPath}${window.location.search}${hash}`);
    return;
  }
  const route = routes.find((input) => `#${input.id}` === hash);
  if (route) {
    route.checked = true;
    document.getElementById('install').scrollIntoView({ block: 'start' });
  } else if (routes.length && (!hash || hash === '#install')) {
    routes[0].checked = true;
  }
}

for (const route of routes) {
  route.addEventListener('change', () => {
    window.history.pushState(null, '', `#${route.id}`);
  });
}
window.addEventListener('hashchange', selectAdoptionRoute);
selectAdoptionRoute();
