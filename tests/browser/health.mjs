export function observePageHealth(page, allowedResponse = () => false) {
  const issues = [];

  page.on('pageerror', (error) => {
    issues.push(`page error: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      issues.push(`console error: ${message.text()}`);
    }
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? 'unknown failure';
    issues.push(`request failed: ${request.method()} ${request.url()} (${reason})`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !allowedResponse(response)) {
      issues.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });

  return {
    assertHealthy() {
      if (issues.length) {
        throw new Error(`Browser health check failed:\n${issues.join('\n')}`);
      }
    },
  };
}
