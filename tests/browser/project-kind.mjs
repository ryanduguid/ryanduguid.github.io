// Tests branch on what a project can do, not on its name, so the manual WebKit
// project runs the same mobile and desktop checks as the Chromium projects.
// Screenshot comparisons stay with Chromium: the committed baselines are its renders.
export function projectKind(testInfo) {
  return testInfo.project.use.isMobile ? 'mobile' : 'desktop';
}

// The phone first-screen budget: an iPhone 13 in Safari shows 664 CSS pixels
// below its toolbar, so on a phone-width viewport a control that must be
// reached without scrolling fits that, whatever the project's viewport height.
// Wider viewports keep their own height as the budget.
export const FIRST_SCREEN_HEIGHT = 664;

export function firstScreen(page) {
  const { width, height } = page.viewportSize();
  return width < 768 ? Math.min(height, FIRST_SCREEN_HEIGHT) : height;
}
