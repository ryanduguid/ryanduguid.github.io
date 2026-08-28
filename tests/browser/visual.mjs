const visualFonts = [
  '400 16px "IBM Plex Sans"',
  '600 16px "IBM Plex Sans"',
  '400 16px "IBM Plex Mono"',
  '400 32px "IBM Plex Serif"',
  '600 32px "IBM Plex Serif"',
];

export async function waitForVisualFonts(page) {
  await page.evaluate(async (fonts) => {
    const loaded = await Promise.all(fonts.map((font) => document.fonts.load(font)));
    if (loaded.some((faces) => faces.length === 0)) {
      throw new Error('A visual-regression font did not load.');
    }
    await document.fonts.ready;
  }, visualFonts);
}
