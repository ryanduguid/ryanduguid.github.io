// Lists every flaky test in the GitHub job summary. failOnFlakyTests turns a
// run red when a test passes only on retry, and until now finding which test
// meant downloading the browser evidence. Outside Actions it writes nothing.

import { appendFileSync } from 'node:fs';

export default class FlakySummaryReporter {
  constructor() {
    this.tests = new Set();
  }

  onTestEnd(test) {
    this.tests.add(test);
  }

  onEnd() {
    const summary = process.env.GITHUB_STEP_SUMMARY;
    const flaky = [...this.tests].filter((test) => test.outcome() === 'flaky');
    if (!summary || flaky.length === 0) return;
    const lines = flaky.map((test) => `- ${test.titlePath().filter(Boolean).join(' › ')}`);
    appendFileSync(summary, `### Flaky browser tests\n\n${lines.join('\n')}\n`);
  }
}
