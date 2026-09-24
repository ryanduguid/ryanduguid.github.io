import assert from 'node:assert/strict';
import test from 'node:test';
import * as calculate from '../assets/business-calculators.mjs';
import { calculatorTools } from '../assets/webmcp-tools.mjs';

const tool = calculatorTools(calculate).gst;

test('GST tool is read-only and requires only an amount', () => {
  assert.equal(tool.name, 'calculate_gst');
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.deepEqual(tool.inputSchema.required, ['amount']);
  assert.equal(tool.inputSchema.additionalProperties, false);
});

test('GST tool returns the same cents as the calculator', async () => {
  assert.deepEqual(
    (({ excludingGst, gst, includingGst }) => ({ excludingGst, gst, includingGst }))(await tool.execute({ amount: '1100', inclusive: true })),
    { excludingGst: '1000.00', gst: '100.00', includingGst: '1100.00' });
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
