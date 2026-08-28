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
  page.on('requestfailed', (request) => {
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
