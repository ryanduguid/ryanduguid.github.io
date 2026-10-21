import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const tools = JSON.parse(readFileSync(new URL('../../_data/tools.json', import.meta.url), 'utf8'));
const releases = JSON.parse(readFileSync(new URL('../../_data/tool_releases.json', import.meta.url), 'utf8'));
for (const [slug, tool] of Object.entries(tools)) {
  test('GEO identity and release: ' + slug, async ({ page }) => {
    await page.goto('/tools/' + slug + '/');
    await expect(page.locator('h1')).toHaveText(tool.name);
    const schema = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes =>
      nodes.flatMap(n => { const j = JSON.parse(n.textContent); return j['@graph'] ?? [j]; }));
    const apps = schema.filter(n => [n['@type']].flat().includes('SoftwareApplication'));
    expect(apps).toHaveLength(1);
    expect(apps[0]['@type']).toEqual(['SoftwareApplication', 'SoftwareSourceCode']);
    expect(apps[0].name).toBe(tool.name);
    expect(apps[0].softwareVersion).toBe(releases[slug].version);
    expect(apps[0].dateModified).toBe(releases[slug].date);
    expect(apps[0].codeRepository).toBe(tool.codeRepository);
    expect(apps[0].isAccessibleForFree).toBe(true);
    expect(JSON.stringify(schema)).not.toContain('"@type":"Offer"');
    const canonical = (await page.locator('main').innerText()).split(/\s+/).slice(0, 60).join(' ');
    expect(canonical).toContain(slug === 'coal-lsl-levy' ? releases[slug].version.slice(0, 7) : 'v' + releases[slug].version);
  });
}
test('GEO register names and five homepage routes', async ({ page }) => {
  await page.goto('/tools/');
  const list = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes =>
    nodes.flatMap(n => { const j = JSON.parse(n.textContent); return j['@graph'] ?? [j]; }).find(n => n['@type'] === 'ItemList'));
  for (const [slug, tool] of Object.entries(tools)) {
    expect(list.itemListElement.find(i => i.url.endsWith('/tools/' + slug + '/')).name).toBe(tool.name);
  }
  await page.goto('/');
  const home = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes =>
    nodes.flatMap(n => { const j = JSON.parse(n.textContent); return j['@graph'] ?? [j]; }).find(n => n['@id'] === 'https://duguid.com.au/#home-preview'));
  expect(home.numberOfItems).toBe(5);
  expect(home.itemListElement.map(i => i.position)).toEqual([1, 2, 3, 4, 5]);
  expect(home.itemListElement[0].url).toBe('https://duguid.com.au/examples/profit-vs-cash-flow/');
});
