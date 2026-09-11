if (window.location.hash.toLowerCase() === '#engage') {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

const routes = [...document.querySelectorAll('.adopt-input')];

function selectAdoptionRoute() {
  const hash = window.location.hash;
  const route = routes.find((input) => `#${input.id}` === hash);
  if (route) {
    route.checked = true;
    document.getElementById('adopt').scrollIntoView({ block: 'start' });
  } else if (routes.length && (!hash || hash === '#adopt')) {
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
