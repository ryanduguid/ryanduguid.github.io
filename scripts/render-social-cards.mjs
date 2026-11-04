// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { randomUUID } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const TEMPLATE_PATH = path.join(ASSETS, 'social-card-template.svg');
const DATA_PATH = path.join(ASSETS, 'social-cards.json');
const CARD_IDS = Object.freeze(['site', 'tools', 'evaluations', 'rates', 'evidence']);
const CARD_FIELDS = Object.freeze(['alt', 'heading', 'host', 'label', 'output']);
const WIDTH = 1200;
const HEIGHT = 630;
const MAX_BYTES = 50_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function validateCards(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Social-card data must be an object');
  }
  const ids = Object.keys(value);
  if (JSON.stringify(ids) !== JSON.stringify(CARD_IDS)) {
    throw new Error(`Social-card IDs must be ${CARD_IDS.join(', ')}`);
  }

  return CARD_IDS.map((id) => {
    const card = value[id];
    if (!card || typeof card !== 'object' || Array.isArray(card)) {
      throw new TypeError(`Social-card ${id} must be an object`);
    }
    const fields = Object.keys(card).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (JSON.stringify(fields) !== JSON.stringify(CARD_FIELDS)) {
      throw new Error(`Social-card ${id} fields changed`);
    }
    for (const field of ['alt', 'host', 'label', 'output']) {
      if (typeof card[field] !== 'string' || card[field].trim() !== card[field] || !card[field]) {
        throw new TypeError(`Social-card ${id} ${field} must be a non-empty trimmed string`);
      }
    }
    if (
      !Array.isArray(card.heading)
      || card.heading.length < 2
      || card.heading.length > 3
      || card.heading.some((line) => (
        typeof line !== 'string' || line.trim() !== line || !line || line.length > 28
      ))
    ) {
      throw new TypeError(`Social-card ${id} heading must contain two or three fitted lines`);
    }
    const expectedOutput = `social-card-${id}-20261104b.png`;
    if (card.output !== expectedOutput) {
      throw new Error(`Social-card ${id} output must be ${expectedOutput}`);
    }
    if (!card.host.startsWith('duguid.com.au')) {
      throw new Error(`Social-card ${id} host must stay on duguid.com.au`);
    }
    const heading = card.heading.join(' ');
    if (card.alt !== `OLED register card: ${heading}`) {
      throw new Error(`Social-card ${id} alt text must repeat its heading`);
    }
    if (/\b(?:person|portrait|headshot)\b/iu.test(card.alt)) {
      throw new Error(`Social-card ${id} alt text must stay tool-led`);
    }
    return Object.freeze({ id, ...card });
  });
}

function replacePlaceholder(source, placeholder, replacement) {
  const first = source.indexOf(placeholder);
  if (first < 0 || source.indexOf(placeholder, first + placeholder.length) >= 0) {
    throw new Error(`Template must contain exactly one ${placeholder}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + placeholder.length);
}

// Text column geometry, relative to the label's baseline; the page layout centres the column.
const HEADING_X = 442;
const HEADING_RIGHT = 1104;
const HEADING_TOP = 96;
const HEADING_LEAD = 58;

function headingMarkup(lines) {
  return lines
    .map((line, index) => (
      `<tspan x="${HEADING_X}" y="${HEADING_TOP + index * HEADING_LEAD}">${xmlEscape(line)}</tspan>`
    ))
    .join('');
}

// Runs in the page once the fonts load: sizes the frame tabs to their text, places the cursor
// after the last heading line and centres the text column on the frame.
function layoutCard({ headingTop, headingRight, lead }) {
  const pad = 16;
  const bracket = 4;
  const clear = 8;
  for (const tab of document.querySelectorAll('g.tab')) {
    const text = tab.querySelector('text');
    const [gap, left, right] = tab.querySelectorAll('rect');
    const width = Math.ceil(text.getComputedTextLength());
    const span = 2 * bracket + 2 * pad + width;
    const anchor = Number(tab.dataset.x);
    const middle = Number(tab.dataset.y);
    const start = tab.dataset.anchor === 'end' ? anchor - span : anchor;
    gap.setAttribute('x', String(start - clear));
    gap.setAttribute('y', String(middle - 10));
    gap.setAttribute('width', String(span + 2 * clear));
    left.setAttribute('x', String(start));
    right.setAttribute('x', String(start + span - bracket));
    for (const edge of [left, right]) edge.setAttribute('y', String(middle - 18));
    text.setAttribute('x', String(start + bracket + pad));
    text.setAttribute('y', String(middle + 10));
  }

  // Every line must leave room for the cursor before the right margin.
  const cursor = document.getElementById('cursor');
  const room = headingRight - 12 - Number(cursor.getAttribute('width'));
  const lines = [...document.querySelectorAll('#heading tspan')];
  for (const line of lines) {
    if (Number(line.getAttribute('x')) + line.getComputedTextLength() > room) {
      throw new Error(`Heading line is too wide: ${line.textContent}`);
    }
  }
  const last = lines.at(-1);
  const lastBaseline = headingTop + (lines.length - 1) * lead;
  cursor.setAttribute(
    'x',
    String(Math.round(Number(last.getAttribute('x')) + last.getComputedTextLength() + 12)),
  );
  cursor.setAttribute('y', String(lastBaseline - 34));
  document.getElementById('prompt').setAttribute('y', String(headingTop));

  // The column runs from the label's capitals (about 22px above its baseline) to the last baseline.
  const offset = Math.round(315 - (lastBaseline - 22) / 2);
  document.getElementById('column').setAttribute('transform', `translate(0,${offset})`);
}

function renderSvg(template, fonts, card) {
  const heading = card.heading.join(' ');
  const replacements = new Map([
    ['{{FONT_SERIF}}', fonts.serif],
    ['{{FONT_SANS}}', fonts.sans],
    ['{{FONT_MONO}}', fonts.mono],
    ['{{TITLE}}', xmlEscape(heading)],
    ['{{DESCRIPTION}}', xmlEscape(card.alt)],
    ['{{LABEL}}', xmlEscape(card.label)],
    ['{{HEADING_LINES}}', headingMarkup(card.heading)],
    ['{{HOST}}', xmlEscape(card.host)],
  ]);
  let rendered = template;
  for (const [placeholder, replacement] of replacements) {
    rendered = replacePlaceholder(rendered, placeholder, replacement);
  }
  return rendered;
}

function validatePng(image, output) {
  if (image.byteLength < 24 || !image.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${output} is not a PNG`);
  }
  const dimensions = [image.readUInt32BE(16), image.readUInt32BE(20)];
  if (dimensions[0] !== WIDTH || dimensions[1] !== HEIGHT) {
    throw new Error(`${output} dimensions are ${dimensions.join('x')}`);
  }
  if (image.byteLength >= MAX_BYTES) {
    throw new Error(`${output} is ${image.byteLength} bytes; maximum is ${MAX_BYTES - 1}`);
  }
}

async function loadSources() {
  const [template, data, serif, sans, mono] = await Promise.all([
    readFile(TEMPLATE_PATH, 'utf8'),
    readFile(DATA_PATH, 'utf8'),
    readFile(path.join(ASSETS, 'fonts', 'Besley-SemiBold.woff2')),
    readFile(path.join(ASSETS, 'fonts', 'PublicSans-Regular.woff2')),
    readFile(path.join(ASSETS, 'fonts', 'SplineSansMono-Regular.woff2')),
  ]);
  return {
    template,
    cards: validateCards(JSON.parse(data)),
    fonts: {
      serif: serif.toString('base64'),
      sans: sans.toString('base64'),
      mono: mono.toString('base64'),
    },
  };
}

async function publishCandidates(candidateDirectory, outputDirectory, outputs) {
  await mkdir(outputDirectory, { recursive: true });
  const pending = outputs.map((output) => ({
    candidate: path.join(candidateDirectory, output),
    final: path.join(outputDirectory, output),
    temporary: path.join(
      outputDirectory,
      `.${output}.${process.pid}.${randomUUID()}.tmp`,
    ),
  }));
  try {
    for (const item of pending) await copyFile(item.candidate, item.temporary);
    for (const item of pending) await rename(item.temporary, item.final);
  } finally {
    await Promise.all(pending.map((item) => rm(item.temporary, { force: true })));
  }
}

export async function renderSocialCards(browser, outputDirectory) {
  if (!browser || typeof browser.newContext !== 'function') {
    throw new TypeError('renderSocialCards requires a Playwright browser');
  }
  if (typeof outputDirectory !== 'string' || !outputDirectory) {
    throw new TypeError('renderSocialCards requires an output directory');
  }

  const sources = await loadSources();
  const candidateDirectory = await mkdtemp(path.join(os.tmpdir(), 'duguid-social-render-'));
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    for (const card of sources.cards) {
      const svg = renderSvg(sources.template, sources.fonts, card);
      await page.setContent(
        '<!doctype html><html><head><meta charset="utf-8">'
          + '<style>html,body{width:1200px;height:630px;margin:0;overflow:hidden;background:#000}</style>'
          + `</head><body>${svg}</body></html>`,
        { waitUntil: 'load' },
      );
      await page.evaluate(() => document.fonts.ready);
      const fontsReady = await page.evaluate(() => (
        document.fonts.check('60px "Besley"')
        && document.fonts.check('28px "Public Sans"')
        && document.fonts.check('24px "Spline Sans Mono"')
      ));
      if (!fontsReady) throw new Error(`${card.id} fonts did not load`);
      await page.evaluate(layoutCard, {
        headingTop: HEADING_TOP,
        headingRight: HEADING_RIGHT,
        lead: HEADING_LEAD,
      });
      const bounds = await page.locator('svg').boundingBox();
      if (!bounds || Math.round(bounds.width) !== WIDTH || Math.round(bounds.height) !== HEIGHT) {
        throw new Error(`${card.id} SVG bounds changed: ${JSON.stringify(bounds)}`);
      }
      await page.screenshot({
        path: path.join(candidateDirectory, card.output),
        type: 'png',
        animations: 'disabled',
        caret: 'hide',
      });
    }

    const outputs = sources.cards.map((card) => card.output);
    for (const output of outputs) {
      validatePng(await readFile(path.join(candidateDirectory, output)), output);
    }
    await publishCandidates(candidateDirectory, path.resolve(outputDirectory), outputs);
    return outputs;
  } finally {
    await context.close();
    await rm(candidateDirectory, { recursive: true, force: true });
  }
}

async function runCli() {
  const outputDirectory = path.resolve(process.argv[2] || ASSETS);
  const browser = await chromium.launch();
  try {
    const outputs = await renderSocialCards(browser, outputDirectory);
    console.log(
      `Rendered ${outputs.length} cards with Chromium ${browser.version()} at device scale 1.`,
    );
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
