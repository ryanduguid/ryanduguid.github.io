// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

/**
 * Interactive 5-scenario daily closing cash step chart for the homepage
 * Lumbridge Services worked example. Daily closing balances match
 * lumbridge-services/daily-cash.csv and data/invoices.csv inside
 * assets/examples/lumbridge/lumbridge-sample-pack.zip (and lumbridge.xlsx);
 * scenario summary figures come verbatim from assets/examples/lumbridge/sensitivity.json.
 */

/** @typedef {'0' | '15' | '30' | '45' | '60'} DelayKey */

/**
 * @typedef {Object} Scenario
 * @property {DelayKey} delay
 * @property {string} buttonLabel
 * @property {number} receiptDay
 * @property {string} receiptDateShort
 * @property {number} lowDay
 * @property {number} lowValue
 * @property {string} lowDisplay
 * @property {string} lowNote
 * @property {number} lowLabelX
 * @property {number} lowLabelY
 * @property {'start' | 'middle' | 'end'} lowLabelAnchor
 * @property {boolean} isAlert
 * @property {ReadonlyArray<readonly [number, number]>} states
 */

export const PLOT_LEFT = 12;
export const PLOT_RIGHT = 382;
export const PLOT_TOP = 31;
export const PLOT_DAYS = 91;
export const ZERO_Y = 182;
export const Y_SCALE = 0.0015;

/** @type {Readonly<Record<DelayKey, Scenario>>} */
export const SCENARIOS = {
  '0': {
    delay: '0',
    buttonLabel: '0 days',
    receiptDay: 13,
    receiptDateShort: '14 Oct',
    lowDay: 6,
    lowValue: 16800,
    lowDisplay: '$16,800',
    lowNote: '7 Oct \u00b7 0 days below $0',
    lowLabelX: 44,
    lowLabelY: 176,
    lowLabelAnchor: 'start',
    isAlert: false,
    states: [
      [0, 30000], [6, 16800], [13, 60800], [14, 59600], [19, 52520],
      [20, 69520], [27, 32040], [36, 18840], [43, 61640], [50, 71560],
      [57, 49680], [67, 36480], [74, 80480], [75, 79280], [78, 72200],
      [81, 89200], [84, 67320],
    ],
  },
  '15': {
    delay: '15',
    buttonLabel: '15 days',
    receiptDay: 28,
    receiptDateShort: '29 Oct',
    lowDay: 27,
    lowValue: -11960,
    lowDisplay: '($11,960)',
    lowNote: '28 Oct \u00b7 1 day below $0',
    lowLabelX: 121.8,
    lowLabelY: 217,
    lowLabelAnchor: 'middle',
    isAlert: true,
    states: [
      [0, 30000], [6, 16800], [14, 15600], [19, 8520], [20, 25520],
      [27, -11960], [28, 32040], [36, 18840], [43, 61640], [50, 71560],
      [57, 49680], [67, 36480], [74, 80480], [75, 79280], [78, 72200],
      [81, 89200], [84, 67320],
    ],
  },
  '30': {
    delay: '30',
    buttonLabel: '30 days',
    receiptDay: 43,
    receiptDateShort: '13 Nov',
    lowDay: 36,
    lowValue: -25160,
    lowDisplay: '($25,160)',
    lowNote: '6 Nov \u00b7 16 days below $0',
    lowLabelX: 172.6,
    lowLabelY: 236,
    lowLabelAnchor: 'middle',
    isAlert: true,
    states: [
      [0, 30000], [6, 16800], [14, 15600], [19, 8520], [20, 25520],
      [27, -11960], [36, -25160], [43, 61640], [50, 71560], [57, 49680],
      [67, 36480], [74, 80480], [75, 79280], [78, 72200], [81, 89200],
      [84, 67320],
    ],
  },
  '45': {
    delay: '45',
    buttonLabel: '45 days',
    receiptDay: 58,
    receiptDateShort: '28 Nov',
    lowDay: 36,
    lowValue: -25160,
    lowDisplay: '($25,160)',
    lowNote: '6 Nov \u00b7 16 days below $0',
    lowLabelX: 172.6,
    lowLabelY: 236,
    lowLabelAnchor: 'middle',
    isAlert: true,
    states: [
      [0, 30000], [6, 16800], [14, 15600], [19, 8520], [20, 25520],
      [27, -11960], [36, -25160], [43, 17640], [50, 27560], [57, 5680],
      [58, 49680], [67, 36480], [74, 80480], [75, 79280], [78, 72200],
      [81, 89200], [84, 67320],
    ],
  },
  '60': {
    delay: '60',
    buttonLabel: '60 days',
    receiptDay: 73,
    receiptDateShort: '13 Dec',
    lowDay: 36,
    lowValue: -25160,
    lowDisplay: '($25,160)',
    lowNote: '6 Nov \u00b7 22 days below $0 (2 periods)',
    lowLabelX: 172.6,
    lowLabelY: 236,
    lowLabelAnchor: 'middle',
    isAlert: true,
    states: [
      [0, 30000], [6, 16800], [14, 15600], [19, 8520], [20, 25520],
      [27, -11960], [36, -25160], [43, 17640], [50, 27560], [57, 5680],
      [67, -7520], [73, 36480], [74, 80480], [75, 79280], [78, 72200],
      [81, 89200], [84, 67320],
    ],
  },
};

/** @param {number} day @returns {number} */
export function xPos(day) {
  return Number((PLOT_LEFT + (day / PLOT_DAYS) * (PLOT_RIGHT - PLOT_LEFT)).toFixed(1));
}

/** @param {number} value @returns {number} */
export function yPos(value) {
  return Number((ZERO_Y - value * Y_SCALE).toFixed(1));
}

/** @param {ReadonlyArray<readonly [number, number]>} states @returns {string} */
export function buildStepPath(states) {
  const parts = [`M ${xPos(states[0][0])} ${yPos(states[0][1])}`];
  for (let i = 1; i < states.length; i += 1) {
    parts.push(`H ${xPos(states[i][0])} V ${yPos(states[i][1])}`);
  }
  parts.push(`H ${PLOT_RIGHT}`);
  return parts.join(' ');
}

/**
 * Extract contiguous negative segments as `[segmentStates, exitX]`.
 * @param {ReadonlyArray<readonly [number, number]>} states
 * @returns {Array<{ seg: ReadonlyArray<readonly [number, number]>, endX: number }>}
 */
export function negativeRuns(states) {
  /** @type {Array<{ seg: ReadonlyArray<readonly [number, number]>, endX: number }>} */
  const runs = [];
  let i = 0;
  while (i < states.length) {
    if (states[i][1] < 0) {
      const start = i;
      while (i < states.length && states[i][1] < 0) i += 1;
      const endX = i < states.length ? xPos(states[i][0]) : PLOT_RIGHT;
      runs.push({ seg: states.slice(start, i), endX });
    } else {
      i += 1;
    }
  }
  return runs;
}

/**
 * @param {ReadonlyArray<readonly [number, number]>} states
 * @param {boolean} closed
 * @returns {string}
 */
function buildNegativePath(states, closed) {
  return negativeRuns(states)
    .map(({ seg, endX }) => {
      const pts = closed
        ? [`M ${xPos(seg[0][0])} ${ZERO_Y}`, `V ${yPos(seg[0][1])}`]
        : [`M ${xPos(seg[0][0])} ${yPos(seg[0][1])}`];
      for (let i = 1; i < seg.length; i += 1) {
        pts.push(`H ${xPos(seg[i][0])} V ${yPos(seg[i][1])}`);
      }
      pts.push(closed ? `H ${endX} V ${ZERO_Y} Z` : `H ${endX}`);
      return pts.join(' ');
    })
    .join(' ');
}

/** @param {ReadonlyArray<readonly [number, number]>} states @returns {string} */
export function buildDeficitPath(states) {
  return buildNegativePath(states, true);
}

/** @param {ReadonlyArray<readonly [number, number]>} states @returns {string} */
export function buildNegativeStrokePath(states) {
  return buildNegativePath(states, false);
}

/** @param {Element} root */
function initCashChart(root) {
  const controls = root.querySelector('[data-cash-controls]');
  const staticDelay = root.querySelector('[data-cash-static-delay]');
  const line = root.querySelector('[data-cash-line]');
  const deficit = root.querySelector('[data-cash-deficit]');
  const negLine = root.querySelector('[data-cash-neg-line]');
  const receiptLine = root.querySelector('[data-cash-receipt-line]');
  const receiptDot = root.querySelector('[data-cash-receipt-dot]');
  const receiptLabel = root.querySelector('[data-cash-receipt-label]');
  const lowDot = root.querySelector('[data-cash-low-dot]');
  const lowLabel = root.querySelector('[data-cash-low-label]');
  const minValue = root.querySelector('[data-cash-min-value]');
  const minNote = root.querySelector('[data-cash-min-note]');
  const receiptSr = root.querySelector('[data-cash-receipt-sr]');
  const status = root.querySelector('[data-cash-status]');

  if (
    !(controls instanceof HTMLElement)
    || !(line instanceof SVGPathElement)
    || !(deficit instanceof SVGPathElement)
    || !(negLine instanceof SVGPathElement)
    || !(receiptLine instanceof SVGLineElement)
    || !(receiptDot instanceof SVGCircleElement)
    || !(receiptLabel instanceof SVGTextElement)
    || !(lowDot instanceof SVGCircleElement)
    || !(lowLabel instanceof SVGTextElement)
    || !(minValue instanceof HTMLElement)
    || !(minNote instanceof HTMLElement)
  ) {
    return;
  }

  if (staticDelay instanceof HTMLElement) staticDelay.hidden = true;
  if (receiptSr instanceof HTMLElement) receiptSr.hidden = false;
  controls.hidden = false;
  const controlsEl = controls;
  const lineEl = line;
  const deficitEl = deficit;
  const negLineEl = negLine;
  const receiptLineEl = receiptLine;
  const receiptDotEl = receiptDot;
  const receiptLabelEl = receiptLabel;
  const lowDotEl = lowDot;
  const lowLabelEl = lowLabel;
  const minValueEl = minValue;
  const minNoteEl = minNote;
  const staticDelayEl = staticDelay instanceof HTMLElement ? staticDelay : null;
  const receiptSrEl = receiptSr instanceof HTMLElement ? receiptSr : null;
  const statusEl = status instanceof HTMLElement ? status : null;

  /**
   * @param {DelayKey} key
   * @param {boolean} announce
   */
  function applyScenario(key, announce) {
    const scenario = SCENARIOS[key];
    if (!scenario) return;
    root.setAttribute('data-state', scenario.isAlert ? 'alert' : 'ok');

    lineEl.setAttribute('d', buildStepPath(scenario.states));
    deficitEl.setAttribute('d', buildDeficitPath(scenario.states));
    negLineEl.setAttribute('d', buildNegativeStrokePath(scenario.states));

    const rx = xPos(scenario.receiptDay);
    const receiptState = scenario.states.find(([day]) => day === scenario.receiptDay);
    const ry = yPos(receiptState ? receiptState[1] : 67320);
    const rxStr = String(rx);
    const anchor = rx < 130 ? 'start' : rx > 295 ? 'end' : 'middle';
    receiptLineEl.setAttribute('x1', rxStr);
    receiptLineEl.setAttribute('x2', rxStr);
    receiptLineEl.setAttribute('y2', String(ry));
    receiptDotEl.setAttribute('cx', rxStr);
    receiptDotEl.setAttribute('cy', String(ry));
    receiptLabelEl.setAttribute('x', rxStr);
    receiptLabelEl.setAttribute('text-anchor', anchor);
    receiptLabelEl.textContent = `OPEN-V receipt \u00b7 ${scenario.receiptDateShort}`;

    const lx = xPos(scenario.lowDay);
    const ly = yPos(scenario.lowValue);
    lowDotEl.setAttribute('cx', String(lx));
    lowDotEl.setAttribute('cy', String(ly));
    lowLabelEl.setAttribute('x', String(scenario.lowLabelX));
    lowLabelEl.setAttribute('y', String(scenario.lowLabelY));
    lowLabelEl.setAttribute('text-anchor', scenario.lowLabelAnchor);
    lowLabelEl.textContent = scenario.lowValue >= 0 ? `Low ${scenario.lowDisplay}` : scenario.lowDisplay;

    minValueEl.textContent = scenario.lowDisplay;
    minNoteEl.textContent = scenario.lowNote;
    if (staticDelayEl) {
      staticDelayEl.textContent = `${scenario.buttonLabel} (${scenario.receiptDateShort} receipt)`;
    }
    if (receiptSrEl) {
      receiptSrEl.textContent = `OPEN-V receipt: ${scenario.receiptDateShort}.`;
    }
    if (announce && statusEl) {
      const negPeriods = negativeRuns(scenario.states).length;
      let note = scenario.lowNote.replace(' \u00b7 ', ', ');
      if (negPeriods > 1) {
        note = note.replace(/ \(\d+ periods\)$/, ` across ${negPeriods} separate periods`);
      }
      statusEl.textContent =
        `${scenario.buttonLabel} (${scenario.receiptDateShort} receipt): lowest daily cash ${scenario.lowDisplay}, ${note}. Quarterly profit before tax remains $35,957.55.`;
    }
  }

  const initialChecked = controlsEl.querySelector('input:checked');
  if (
    initialChecked instanceof HTMLInputElement
    && initialChecked.value in SCENARIOS
    && initialChecked.value !== '45'
  ) {
    applyScenario(/** @type {DelayKey} */ (initialChecked.value), false);
  }

  controlsEl.addEventListener('change', event => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.value in SCENARIOS) {
      applyScenario(/** @type {DelayKey} */ (target.value), true);
    }
  });
}

if (typeof document !== 'undefined') {
  for (const chart of document.querySelectorAll('[data-cash-chart]')) {
    initCashChart(chart);
  }
}
