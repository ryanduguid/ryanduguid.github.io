import { once } from 'node:events';
import { lstat, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';

import { COAL_LSL_PROOF } from './coal-lsl-proof-fixture.mjs';
import { waitForVisualFonts } from '../tests/browser/visual.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROOF_OUTPUT = path.join(ROOT, 'assets', 'coal-lsl-calculator.webp');
const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.woff2', 'font/woff2'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
]);

class HttpStatusError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

async function resolveRequestPath(rootReal, rawUrl) {
  const rawPath = (rawUrl || '/').split(/[?#]/u, 1)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    throw new HttpStatusError(400);
  }
  if (decoded.includes('\0')) throw new HttpStatusError(400);
  const slashPath = decoded.replaceAll('\\', '/');
  if (slashPath.split('/').some((part) => part === '.' || part === '..')) {
    throw new HttpStatusError(403);
  }
  const relative = slashPath.replace(/^\/+/, '') || 'index.html';
  let candidate = path.resolve(ROOT, ...relative.split('/'));
  if (!isWithin(ROOT, candidate)) throw new HttpStatusError(403);

  let metadata;
  try {
    metadata = await stat(candidate);
    if (metadata.isDirectory()) {
      candidate = path.join(candidate, 'index.html');
      metadata = await stat(candidate);
    }
  } catch (error) {
    if (error.code === 'ENOENT') throw new HttpStatusError(404);
    throw error;
  }
  if (!metadata.isFile()) throw new HttpStatusError(404);
  const targetReal = await realpath(candidate);
  if (!isWithin(rootReal, targetReal)) throw new HttpStatusError(403);
  return targetReal;
}

function createProofServer(rootReal) {
  return createServer((request, response) => {
    void (async () => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        throw new HttpStatusError(405);
      }
      const target = await resolveRequestPath(rootReal, request.url);
      const type = MIME_TYPES.get(path.extname(target).toLowerCase());
      if (!type) throw new HttpStatusError(415);
      const body = await readFile(target);
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': body.byteLength,
        'content-type': type,
        'x-content-type-options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    })().catch((error) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const status = error instanceof HttpStatusError ? error.status : 500;
      response.writeHead(status, {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
      });
      response.end(`${status}\n`);
    });
  });
}

function observeBrowserHealth(page, label, failures) {
  page.on('pageerror', (error) => failures.push(`${label} pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      failures.push(`${label} console: ${message.text()}`);
    }
  });
  page.on('requestfailed', (request) => {
    failures.push(
      `${label} requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`,
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failures.push(`${label} HTTP ${response.status()}: ${response.url()}`);
    }
  });
}

function assertHealthy(failures) {
  if (failures.length) {
    throw new Error(`Proof capture browser health failed:\n${failures.join('\n')}`);
  }
}

function normalisedText(value) {
  return String(value || '').replace(/\s+/gu, ' ').trim();
}

async function assertContains(locator, expected, label) {
  await locator.waitFor({ state: 'visible' });
  const actual = normalisedText(await locator.textContent());
  const wanted = normalisedText(expected);
  if (!actual.includes(wanted)) {
    throw new Error(`${label} mismatch: expected ${wanted}; received ${actual}`);
  }
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export async function renderCoalLslProof() {
  const rootReal = await realpath(ROOT);
  const server = createProofServer(rootReal);
  let browser;
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Proof server did not expose a TCP port');
    }
    const origin = `http://127.0.0.1:${address.port}`;

    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: COAL_LSL_PROOF.viewport,
      deviceScaleFactor: 1,
    });
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (
        url === 'about:blank'
        || url.startsWith('data:')
        || url.startsWith(`${origin}/`)
      ) {
        await route.continue();
        return;
      }
      await route.abort('blockedbyclient');
    });

    const failures = [];
    const page = await context.newPage();
    observeBrowserHealth(page, 'calculator', failures);
    await page.goto(`${origin}/tools/coal-lsl-levy/`, { waitUntil: 'networkidle' });
    await waitForVisualFonts(page);
    await page.getByRole('radio', {
      name: COAL_LSL_PROOF.branchName,
      exact: true,
    }).check();
    await page.getByRole('spinbutton', {
      name: 'Base rate of pay',
      exact: true,
    }).fill(COAL_LSL_PROOF.inputs.baseRate);
    await page.getByLabel('Overtime and penalty rates')
      .fill(COAL_LSL_PROOF.inputs.overtimeAndPenalties);
    await page.getByLabel('Allowances, excluding expense reimbursements')
      .fill(COAL_LSL_PROOF.inputs.allowances);
    await page.getByLabel('Salary sacrificed amount')
      .fill(COAL_LSL_PROOF.inputs.salarySacrifice);
    await page.getByRole('button', { name: 'Calculate', exact: true }).click();

    const result = page.getByRole('status');
    for (const [kind, expected] of [
      ['formula-a', COAL_LSL_PROOF.expected.formulaA],
      ['formula-b', COAL_LSL_PROOF.expected.formulaB],
      ['eligible-wages', COAL_LSL_PROOF.expected.eligibleWages],
      ['levy', COAL_LSL_PROOF.expected.levy],
      ['branch', COAL_LSL_PROOF.expected.branch],
    ]) {
      await assertContains(
        result.locator(`[data-result-kind="${kind}"]`),
        expected,
        kind,
      );
    }
    await assertContains(
      result.locator('.result-why'),
      COAL_LSL_PROOF.expected.explanation,
      'explanation',
    );

    const panel = page.locator('.calculator-result');
    await panel.evaluate((element, capture) => {
      const background = getComputedStyle(document.body).backgroundColor;
      document.body.replaceChildren(element);
      Object.assign(document.documentElement.style, {
        width: `${capture.width}px`,
        height: `${capture.height}px`,
        margin: '0',
        overflow: 'hidden',
      });
      Object.assign(document.body.style, {
        width: `${capture.width}px`,
        height: `${capture.height}px`,
        minHeight: '0',
        margin: '0',
        overflow: 'hidden',
        background,
      });
      Object.assign(element.style, {
        boxSizing: 'border-box',
        width: `${capture.width}px`,
        height: `${capture.height}px`,
        maxWidth: 'none',
        minWidth: '0',
        margin: '0',
        position: 'static',
        overflow: 'hidden',
        background,
      });
    }, COAL_LSL_PROOF.capture);
    const bounds = await panel.boundingBox();
    if (
      !bounds
      || Math.round(bounds.width) !== COAL_LSL_PROOF.capture.width
      || Math.round(bounds.height) !== COAL_LSL_PROOF.capture.height
    ) {
      throw new Error(`Unexpected proof bounds: ${JSON.stringify(bounds)}`);
    }
    const scrollHeight = await panel.evaluate((element) => element.scrollHeight);
    if (scrollHeight > COAL_LSL_PROOF.capture.height) {
      throw new Error(`Proof content exceeds capture height: ${scrollHeight}`);
    }
    const png = await panel.screenshot({
      type: 'png',
      animations: 'disabled',
      caret: 'hide',
    });

    const encoder = await context.newPage();
    observeBrowserHealth(encoder, 'encoder', failures);
    const webpUrl = await encoder.evaluate(async ({ pngBase64, capture }) => {
      const source = new Image();
      source.src = `data:image/png;base64,${pngBase64}`;
      await source.decode();
      const canvas = document.createElement('canvas');
      canvas.width = capture.width;
      canvas.height = capture.height;
      const drawing = canvas.getContext('2d');
      if (!drawing) throw new Error('Canvas 2D context unavailable');
      drawing.drawImage(source, 0, 0, capture.width, capture.height);
      return canvas.toDataURL('image/webp', capture.quality);
    }, {
      pngBase64: png.toString('base64'),
      capture: COAL_LSL_PROOF.capture,
    });
    const prefix = 'data:image/webp;base64,';
    if (!webpUrl.startsWith(prefix)) {
      throw new Error('Browser did not encode WebP');
    }
    const image = Buffer.from(webpUrl.slice(prefix.length), 'base64');
    if (
      image.byteLength < 12
      || image.subarray(0, 4).toString('ascii') !== 'RIFF'
      || image.subarray(8, 12).toString('ascii') !== 'WEBP'
    ) {
      throw new Error('Encoded proof is not a WebP container');
    }
    if (image.byteLength > COAL_LSL_PROOF.capture.maxBytes) {
      throw new Error(`Encoded proof exceeds ${COAL_LSL_PROOF.capture.maxBytes} bytes`);
    }
    assertHealthy(failures);
    return {
      image,
      width: COAL_LSL_PROOF.capture.width,
      height: COAL_LSL_PROOF.capture.height,
      bytes: image.byteLength,
    };
  } finally {
    try {
      await browser?.close();
    } finally {
      await closeServer(server);
    }
  }
}

export async function captureCoalLslProof(options) {
  if (options !== undefined) {
    throw new TypeError('captureCoalLslProof does not accept options');
  }
  const rootReal = await realpath(ROOT);
  const outputParent = await realpath(path.dirname(PROOF_OUTPUT));
  if (path.relative(path.join(rootReal, 'assets'), outputParent) !== '') {
    throw new Error('Refusing unexpected proof output directory');
  }
  const existing = await lstat(PROOF_OUTPUT).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing?.isSymbolicLink()) {
    throw new Error('Refusing symbolic-link proof output');
  }
  const { image, width, height, bytes } = await renderCoalLslProof();
  await writeFile(PROOF_OUTPUT, image);
  return { width, height, bytes };
}

if (process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const result = await captureCoalLslProof();
  console.log(`${result.width}x${result.height} WebP, ${result.bytes} bytes`);
}
