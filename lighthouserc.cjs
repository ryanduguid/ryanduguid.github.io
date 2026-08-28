const { chromium } = require('@playwright/test');

const chromePath = process.env.CHROME_PATH || chromium.executablePath();

module.exports = {
  ci: {
    collect: {
      chromePath,
      puppeteerScript: 'scripts/lighthouse-browser.cjs',
      startServerCommand: 'python -u -m http.server 4173 --bind 127.0.0.1',
      startServerReadyPattern: 'Serving HTTP on',
      startServerReadyTimeout: 10_000,
      url: [
        'http://127.0.0.1:4173/',
        'http://127.0.0.1:4173/evidence/',
        'http://127.0.0.1:4173/tools/coal-lsl-levy/',
      ],
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
