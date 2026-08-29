'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const CONFIG_PATH = path.resolve(__dirname, '..', 'lighthouserc.cjs');
const RUNNER_VARIABLES = ['GITHUB_ACTIONS', 'RUNNER_OS'];

function loadConfig(environment) {
  const previous = Object.fromEntries(
    RUNNER_VARIABLES.map((name) => [name, process.env[name]]),
  );
  for (const name of RUNNER_VARIABLES) {
    if (environment[name] === undefined) delete process.env[name];
    else process.env[name] = environment[name];
  }
  delete require.cache[CONFIG_PATH];
  try {
    return require(CONFIG_PATH);
  } finally {
    delete require.cache[CONFIG_PATH];
    for (const name of RUNNER_VARIABLES) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test('GitHub Linux launches loopback Lighthouse Chromium without its unavailable sandbox', () => {
  const config = loadConfig({ GITHUB_ACTIONS: 'true', RUNNER_OS: 'Linux' });
  assert.deepEqual(
    config.ci.collect.puppeteerLaunchOptions?.args,
    ['--no-sandbox'],
  );
});

test('ordinary Lighthouse runs keep Chromium sandboxing enabled', () => {
  const config = loadConfig({});
  assert.deepEqual(config.ci.collect.puppeteerLaunchOptions?.args, []);
});

test('Lighthouse audits the exact adoption surfaces over three median runs', () => {
  const config = loadConfig({});
  assert.deepEqual(config.ci.collect.url, [
    'http://127.0.0.1:4173/',
    'http://127.0.0.1:4173/tools/',
    'http://127.0.0.1:4173/evidence/',
    'http://127.0.0.1:4173/tools/coal-lsl-levy/',
  ]);
  assert.equal(config.ci.collect.numberOfRuns, 3);
  assert.equal(config.ci.assert.aggregationMethod, 'median');
});

for (const [label, environment] of [
  ['GitHub Actions on a non-Linux runner', { GITHUB_ACTIONS: 'true' }],
  ['Linux outside GitHub Actions', { RUNNER_OS: 'Linux' }],
]) {
  test(`${label} keeps Chromium sandboxing enabled`, () => {
    const config = loadConfig(environment);
    assert.deepEqual(config.ci.collect.puppeteerLaunchOptions?.args, []);
  });
}
