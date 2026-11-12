// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

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
    // The licence is the release's own LICENSE file, which can differ from main's.
    const blob = `https://github.com/${tool.repository}/blob/${releases[slug].tag ?? releases[slug].version}/`;
    expect([blob + 'LICENSE', blob + tool.path + '/LICENSE']).toContain(apps[0].license);
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

// Every indexable page: the structured data an answer engine reads matches the
// visible page and names the same author, licence files and release dates.
const site = 'https://duguid.com.au';
const person = { '@id': `${site}/about/#person` };
const date = /^\d{4}-\d{2}-\d{2}$/;
const licenceFile = /^https:\/\/github\.com\/ryanduguid\/[^/]+\/blob\/.+\/LICENSE$/;
const documentTypes = ['WebPage', 'ContactPage', 'ProfilePage', 'TechArticle'];
const softwareTypes = ['SoftwareApplication', 'SoftwareSourceCode', 'WebApplication'];
const typesOf = node => [node['@type']].flat();
function* typed(value) {
  if (Array.isArray(value)) for (const item of value) yield* typed(item);
  else if (value && typeof value === 'object') {
    if (value['@type']) yield value;
    for (const [key, item] of Object.entries(value)) if (key !== '@type') yield* typed(item);
  }
}
// Tags are removed until none is left, so text that only forms a tag once another
// is removed (such as '<<a>b>') cannot survive one pass.
const withoutTags = html => {
  let previous;
  do {
    previous = html;
    html = html.replace(/<[^>]+>/g, '');
  } while (html !== previous);
  return html;
};
const text = html => withoutTags(html).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const routes = [...readFileSync(new URL('../../sitemap.xml', import.meta.url), 'utf8')
  .matchAll(/<loc>https:\/\/duguid\.com\.au(\/[^<]*)<\/loc>/g)].map(m => m[1]);
for (const route of routes) {
  test('GEO structured data: ' + route, async ({ request }) => {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    const html = await response.text();
    const nodes = [...typed([...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map(m => JSON.parse(m[1])))];
    const url = site + route;

    const documents = nodes.filter(n => n.url === url && typesOf(n).some(t => documentTypes.includes(t)));
    expect(documents.length, 'page document node').toBeGreaterThan(0);
    for (const node of documents) {
      expect(node.author, 'document author').toEqual(person);
      expect(node.publisher, 'document publisher').toEqual(person);
      expect(node.datePublished, 'document datePublished').toMatch(date);
      expect(node.dateModified, 'document dateModified').toMatch(date);
      if (typesOf(node).includes('TechArticle')) expect(node.headline, 'TechArticle headline').toBeTruthy();
    }

    const crumb = /<nav class="article-crumb" aria-label="Breadcrumb">([\s\S]*?)<\/nav>/.exec(html);
    const lists = nodes.filter(n => typesOf(n).includes('BreadcrumbList'));
    if (crumb) {
      expect(lists, 'one BreadcrumbList for the visible breadcrumb').toHaveLength(1);
      const visible = [...crumb[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(m => text(m[1]));
      const items = lists[0].itemListElement;
      expect(items.map(i => i.name)).toEqual(visible);
      expect(items.map(i => i.position)).toEqual(visible.map((_, i) => i + 1));
      expect(items.at(-1).item).toBe(url);
    }

    for (const node of nodes.filter(n => 'license' in n)) {
      expect(node.license, `${typesOf(node)} licence is a LICENSE file`).toMatch(licenceFile);
    }
    for (const node of nodes.filter(n => typesOf(n).some(t => softwareTypes.includes(t)))) {
      expect(node.codeRepository, `${node.name} codeRepository`).toMatch(/^https:\/\/github\.com\/ryanduguid\//);
      expect(node.license, `${node.name} licence`).toMatch(licenceFile);
      expect(node.author, `${node.name} author`).toEqual(person);
      if ('softwareVersion' in node) expect(node.dateModified, `${node.name} dateModified`).toMatch(date);
    }
    if (/^\/tools\/business-calculators\/[^/]+\/$/.test(route)) {
      const apps = nodes.filter(n => typesOf(n).includes('WebApplication'));
      expect(apps, 'calculator WebApplication').toHaveLength(1);
      expect(apps[0].url).toBe(url);
      expect(apps[0].isAccessibleForFree).toBe(true);
    }

    const datasets = nodes.filter(n => typesOf(n).includes('Dataset'));
    for (const dataset of datasets) {
      for (const key of ['name', 'description', 'temporalCoverage', 'spatialCoverage']) {
        expect(dataset[key], `Dataset ${key}`).toBeTruthy();
      }
      expect(dataset.creator).toEqual({
        ...person,
        '@type': 'Person',
        name: 'Ryan Duguid',
        url: `${site}/about/`,
      });
      expect(dataset.license).toMatch(licenceFile);
      expect(dataset.dateModified).toMatch(date);
      expect(dataset.isAccessibleForFree).toBe(true);
      expect(dataset.distribution.encodingFormat).toBe('text/csv');
      expect(dataset.distribution.contentUrl.startsWith(url)).toBe(true);
      expect(dataset.distribution.contentUrl).toMatch(/\.csv$/);
      expect(dataset.includedInDataCatalog).toMatchObject({ '@type': 'DataCatalog', url: `${site}/rates/` });
    }
  });
}
