import assert from 'node:assert/strict';
import test from 'node:test';
import * as calculate from '../assets/business-calculators.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { calculatorTools, ozzitTools } from '../assets/webmcp-tools.mjs';

const tool = calculatorTools(calculate).gst;

test('GST tool is read-only and requires only an amount', () => {
  assert.equal(tool.name, 'calculate_gst');
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.deepEqual(tool.inputSchema.required, ['amount']);
  assert.equal(tool.inputSchema.additionalProperties, false);
});

test('GST tool returns the same cents as the calculator', async () => {
  const inclusive = await tool.execute({ amount: '1100', inclusive: true });
  assert.deepEqual([inclusive.excludingGst, inclusive.gst, inclusive.includingGst], ['1000.00', '100.00', '1100.00']);
  // 0.5 cents of GST rounds up, as on the page.
  const exclusive = await tool.execute({ amount: '0.05' });
  assert.deepEqual([exclusive.excludingGst, exclusive.gst, exclusive.includingGst], ['0.05', '0.01', '0.06']);
});

test('GST tool schema pattern agrees with the calculator on amounts', async () => {
  const pattern = new RegExp(tool.inputSchema.properties.amount.pattern);
  for (const amount of ['0', '12.5', '999999999.99']) {
    assert.ok(pattern.test(amount), amount);
    await tool.execute({ amount });
  }
  for (const amount of ['-1', '1.234', '1e3', '']) {
    assert.equal(pattern.test(amount), false, amount);
    await assert.rejects(tool.execute({ amount }));
  }
  // The schema stops at nine integer digits, one short of the calculator's 1,000,000,000 ceiling.
  assert.equal(pattern.test('1000000000'), false);
});

test('GST tool refuses a non-boolean inclusive flag', async () => {
  await assert.rejects(tool.execute({ amount: '100', inclusive: 'yes' }), /true or false/);
});


const referenceFile = readdirSync(new URL('../assets/', import.meta.url))
  .filter(name => /^ozzit-function-reference-v[\d.]+\.json$/.test(name))
  .sort()
  .at(-1);
const reference = JSON.parse(readFileSync(new URL(`../assets/${referenceFile}`, import.meta.url), 'utf8'));
const lookup = ozzitTools(async () => reference).lookup;

test('Ozzit tool is read-only and requires only a name', () => {
  assert.equal(lookup.name, 'ozzit_function');
  assert.equal(lookup.annotations.readOnlyHint, true);
  assert.deepEqual(lookup.inputSchema.required, ['name']);
  assert.equal(lookup.inputSchema.additionalProperties, false);
});

test('Ozzit tool finds a function however its name is typed', async () => {
  for (const name of ['oz.Amortiseλ', 'Amortise', 'amortiseλ', ' OZ.AMORTISE ']) {
    const found = await lookup.execute({ name });
    assert.equal(found.name, 'oz.Amortiseλ', name);
    assert.equal(found.module, 'Financial');
    assert.ok(found.signature.startsWith('oz.Amortiseλ('));
    assert.equal(found.source, 'https://duguid.com.au/tools/ozzit/functions/financial/#oz-amortise');
    assert.ok(found.parameters.some(p => p.name === 'Principals'));
  }
});

test('Ozzit tool refuses an unknown or empty name', async () => {
  await assert.rejects(lookup.execute({ name: 'NotAFunction' }), /No Ozzit function is named NotAFunction/);
  await assert.rejects(lookup.execute({ name: '  ' }), /function name/);
  await assert.rejects(lookup.execute({}), /function name/);
});
