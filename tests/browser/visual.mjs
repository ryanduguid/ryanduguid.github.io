const visualFonts = [
  '400 16px "Public Sans"',
  '600 16px "Public Sans"',
  '400 16px "Spline Sans Mono"',
  '400 32px "Besley"',
  '600 32px "Besley"',
];

export async function waitForVisualFonts(page) {
  await page.evaluate(async (fonts) => {
    // A font request can fail once with NetworkError on a busy runner. Under
    // failOnFlakyTests that turned a run red even though the retry passed, so a
    // NetworkError gets one more load here; any other error still fails.
    const load = async (font) => {
      try {
        return await document.fonts.load(font);
      } catch (error) {
        if (error?.name !== 'NetworkError') throw error;
        return document.fonts.load(font);
      }
    };
    const loaded = await Promise.all(fonts.map(load));
    if (loaded.some((faces) => faces.length === 0)) {
      throw new Error('A visual-regression font did not load.');
    }
    await document.fonts.ready;
  }, visualFonts);
}

export async function gotoForVisualSnapshot(page, url) {
  await page.goto(url);
  await waitForVisualFonts(page);
  // font-display: optional uses the bundled faces reliably on a warm navigation.
  await page.reload();
  await waitForVisualFonts(page);
}
