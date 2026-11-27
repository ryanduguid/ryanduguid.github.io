// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLOT_LEFT, PLOT_RIGHT, SCENARIOS, buildDeficitPath, buildNegativeStrokePath, buildStepPath,
  negativeRuns, xPos, yPos,
} from '../assets/cash-chart.mjs';

test('geometry helpers compute step paths, negative runs and edge exits', () => {
  assert.equal(xPos(0), PLOT_LEFT);
  assert.equal(xPos(91), PLOT_RIGHT);
  assert.equal(yPos(0), 182);
  assert.equal(buildStepPath(SCENARIOS['0'].states).endsWith(`H ${PLOT_RIGHT}`), true);
  assert.equal(buildDeficitPath(SCENARIOS['0'].states), '');
  assert.equal(buildNegativeStrokePath(SCENARIOS['0'].states), '');
  assert.ok(buildDeficitPath(SCENARIOS['45'].states).includes('H 158.4 V 219.7'));
  assert.ok(buildNegativeStrokePath(SCENARIOS['45'].states).startsWith('M 121.8 199.9'));
  const split = negativeRuns([[0, 100], [10, -50], [20, 25], [30, -10]]);
  assert.equal(split.length, 2);
  assert.equal(split[1].endX, PLOT_RIGHT);
  assert.ok(buildDeficitPath([[10, -50]]).includes(`H ${PLOT_RIGHT} V 182 Z`));
});

class MockNode {
  constructor() {
    this.attributes = new Map();
    this.hidden = false;
    this.textContent = '';
    this.listeners = new Map();
    this.checkedInput = null;
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  querySelector(selector) { return selector === 'input:checked' ? this.checkedInput : null; }
}
class MockHtml extends MockNode {}
class MockInput extends MockHtml { constructor(value = '') { super(); this.value = value; } }
class MockPath extends MockNode {}
class MockLine extends MockNode {}
class MockCircle extends MockNode {}
class MockText extends MockNode {}

async function withDom(run) {
  const keys = ['document', 'HTMLElement', 'HTMLInputElement', 'SVGPathElement', 'SVGLineElement', 'SVGCircleElement', 'SVGTextElement'];
  const saved = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  try {
    return await run();
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete globalThis[key];
      else globalThis[key] = saved[key];
    }
  }
}

function buildChartRoot(initialDelay, { includeOptional = true } = {}) {
  const nodes = {
    '[data-cash-controls]': Object.assign(new MockHtml(), { hidden: true, checkedInput: new MockInput(initialDelay) }),
    '[data-cash-line]': new MockPath(),
    '[data-cash-deficit]': new MockPath(),
    '[data-cash-neg-line]': new MockPath(),
    '[data-cash-receipt-line]': new MockLine(),
    '[data-cash-receipt-dot]': new MockCircle(),
    '[data-cash-receipt-label]': new MockText(),
    '[data-cash-low-dot]': new MockCircle(),
    '[data-cash-low-label]': new MockText(),
    '[data-cash-min-value]': new MockHtml(),
    '[data-cash-min-note]': new MockHtml(),
  };
  if (includeOptional) {
    nodes['[data-cash-static-delay]'] = new MockHtml();
    nodes['[data-cash-receipt-sr]'] = Object.assign(new MockHtml(), { hidden: true });
    nodes['[data-cash-status]'] = new MockHtml();
  }
  return {
    nodes,
    root: {
      attrs: new Map(),
      setAttribute(name, value) { this.attrs.set(name, value); },
      querySelector(selector) { return nodes[selector] ?? null; },
    },
  };
}

test('initCashChart handles missing nodes, initial delay restore, scenario changes and ignores unknown values', async () => {
  await withDom(async () => {
    globalThis.HTMLElement = MockHtml;
    globalThis.HTMLInputElement = MockInput;
    globalThis.SVGPathElement = MockPath;
    globalThis.SVGLineElement = MockLine;
    globalThis.SVGCircleElement = MockCircle;
    globalThis.SVGTextElement = MockText;

    const broken = buildChartRoot('45');
    delete broken.nodes['[data-cash-controls]'];
    const first = buildChartRoot('60');
    const second = buildChartRoot('0', { includeOptional: false });

    globalThis.document = { querySelectorAll: () => [broken.root, first.root, second.root] };
    await import('../assets/cash-chart.mjs?init=1');

    assert.equal(first.nodes['[data-cash-controls]'].hidden, false);
    assert.equal(first.nodes['[data-cash-static-delay]'].hidden, true);
    assert.equal(first.nodes['[data-cash-receipt-sr]'].hidden, false);
    assert.equal(first.nodes['[data-cash-receipt-sr]'].textContent, 'OPEN-V receipt: 13 Dec.');
    assert.equal(first.nodes['[data-cash-status]'].textContent, '');
    assert.equal(first.nodes['[data-cash-receipt-label]'].getAttribute('text-anchor'), 'end');
    assert.equal(second.nodes['[data-cash-receipt-label]'].getAttribute('text-anchor'), 'start');
    assert.equal(second.nodes['[data-cash-low-label]'].textContent, 'Low $16,800');

    const change = first.nodes['[data-cash-controls]'].listeners.get('change');
    change({ target: new MockInput('60') });
    assert.match(first.nodes['[data-cash-status]'].textContent, /across 2 separate periods/);
    change({ target: new MockInput('15') });
    assert.match(first.nodes['[data-cash-status]'].textContent, /15 days \(29 Oct receipt\): lowest daily cash \(\$11,960\)/);
    change({ target: new MockInput('invalid') });
    change({ target: {} });
    assert.match(first.nodes['[data-cash-receipt-sr]'].textContent, /29 Oct/);

    const secondChange = second.nodes['[data-cash-controls]'].listeners.get('change');
    secondChange({ target: new MockInput('45') });
    assert.equal(second.nodes['[data-cash-receipt-label]'].getAttribute('text-anchor'), 'middle');
  });
});
