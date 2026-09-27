// Tests branch on what a project can do, not on its name, so the manual WebKit
// project runs the same mobile and desktop checks as the Chromium projects.
// Screenshot comparisons stay with Chromium: the committed baselines are its renders.
export function projectKind(testInfo) {
  return testInfo.project.use.isMobile ? 'mobile' : 'desktop';
}
