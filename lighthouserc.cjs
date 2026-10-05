const { chromium } = require('@playwright/test');

const chromePath = process.env.CHROME_PATH || chromium.executablePath();

const urls = [
  'http://127.0.0.1:4173/',
  'http://127.0.0.1:4173/tools/',
  'http://127.0.0.1:4173/evidence/',
  'http://127.0.0.1:4173/examples/profit-vs-cash-flow/',
  'http://127.0.0.1:4173/tools/coal-lsl-levy/',
  'http://127.0.0.1:4173/tools/accounting-questions/',
  'http://127.0.0.1:4173/tools/business-calculators/',
];

// CI runs the pages in parallel jobs. LHCI_SHARD selects one share as
// "index/total", like Playwright's --shard; unset, every page runs.
const shardMatch = /^([1-9]\d*)\/([1-9]\d*)$/.exec(process.env.LHCI_SHARD ?? '1/1');
const [shard, shards] = shardMatch ? [Number(shardMatch[1]), Number(shardMatch[2])] : [0, 0];
if (shard < 1 || shard > shards || shards > urls.length) {
  throw new Error(`LHCI_SHARD must be "index/total" with 1 <= index <= total <= ${urls.length}`);
}

module.exports = {
  ci: {
    collect: {
      chromePath,
      puppeteerScript: 'scripts/lighthouse-browser.cjs',
      puppeteerLaunchOptions: {
        args:
          process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_OS === 'Linux'
            ? ['--no-sandbox']
            : [],
      },
      startServerCommand: 'python -u scripts/serve_site.py',
      startServerReadyPattern: 'Serving HTTP on',
      startServerReadyTimeout: 10_000,
      url: urls.filter((_, index) => index % shards === shard - 1),
      numberOfRuns: 3,
    },
    assert: {
      aggregationMethod: 'median',
      assertions: {
        'categories:performance': ['error', { minScore: 0.95 }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 1 }],
        'categories:seo': ['error', { minScore: 1 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.01 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2_500 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: 'work/lighthouse',
    },
  },
};
