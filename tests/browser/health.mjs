// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

export function observePageHealth(page, allowedResponse = () => false) {
  const issues = [];
  const consoleErrors = [];
  const allowedResponseStatusCounts = new Map();

  page.on('pageerror', (error) => {
    issues.push(`page error: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  // Leaving a page cancels the requests it still has in flight. That is the test's
  // doing, not a fault in the page, so a request that fails whilst a main-frame
  // navigation is under way is left out. A hash change starts no navigation request.
  // Chromium cancels when the new document commits. Firefox cancels before the
  // navigation request, so there a page left mid-load is still reported (Firefox
  // pass on Linux, 22 November 2026).
  let navigation = null;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      navigation = request;
    }
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigation = null;
  });
  page.on('requestfailed', (request) => {
    if (request === navigation) {
      navigation = null;
    } else if (navigation) {
      return;
    }
    const reason = request.failure()?.errorText ?? 'unknown failure';
    issues.push(`request failed: ${request.method()} ${request.url()} (${reason})`);
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    if (allowedResponse(response)) {
      const status = response.status();
      const count = allowedResponseStatusCounts.get(status) ?? 0;
      allowedResponseStatusCounts.set(status, count + 1);
    } else {
      issues.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });

  return {
    assertHealthy() {
      const remaining = [...issues];
      const allowedCounts = new Map(allowedResponseStatusCounts);
      for (const message of consoleErrors) {
        const status = Number(
          message.match(/server responded with a status of (\d{3})/i)?.[1],
        );
        const allowedCount = allowedCounts.get(status) ?? 0;
        if (allowedCount > 0) {
          allowedCounts.set(status, allowedCount - 1);
        } else {
          remaining.push(`console error: ${message}`);
        }
      }
      if (remaining.length) {
        throw new Error(`Browser health check failed:\n${remaining.join('\n')}`);
      }
    },
  };
}
