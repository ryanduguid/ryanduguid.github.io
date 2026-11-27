// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The DOM halves of assets/field-errors.mjs and assets/rate-tables.mjs, run against a small stand-in
// document: field errors are shown, linked and cleared, and rate tables mark today's row and copy
// for Excel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearFieldError, ensureControlId, reportFirstInvalid, showFieldError } from '../assets/field-errors.mjs';
import { toTabSeparated } from '../assets/rate-tables.mjs';

/** A stand-in element: attributes, children and the few methods the scripts call. */
class Element {
  constructor(tag, document) {
    Object.assign(this, { tag, document, attributes: new Map(), children: [], parent: null, id: '', className: '',
      textContent: '', listeners: {} });
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...nodes) {
    for (const node of nodes) {
      if (typeof node === 'string') this.textContent += node;
      else { node.parent?.children.splice(node.parent.children.indexOf(node), 1); node.parent = this; this.children.push(node); }
    }
  }
  before(node) { this.parent.children.splice(this.parent.children.indexOf(this), 0, node); node.parent = this.parent; }
  insertAdjacentElement(where, node) {
    assert.equal(where, 'afterend');
    this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, node);
    node.parent = this.parent;
  }
  remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  closest(selector) {
    for (let node = this.parent; node; node = node.parent) if (node.matches(selector)) return node;
    return null;
  }
  matches(selector) { return selector === this.tag || selector === `.${this.className}`; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  get all() { return this.children.flatMap((child) => [child, ...child.all]); }
}

class Document extends Element {
  constructor() { super('#document', null); }
  createElement(tag) { return new Element(tag, this); }
  getElementById(id) { return this.all.find((node) => node.id === id) ?? null; }
}

/** A required number field inside a label, as the calculator forms write it. */
const numberField = (document, validity = { valid: false, valueMissing: true }) => {
  const label = document.createElement('label');
  document.append(label);
  const control = Object.assign(document.createElement('input'), { type: 'number', value: '', min: '', max: '', step: '1',
    willValidate: true, validity, validationMessage: '', focused: false, focus() { this.focused = true; } });
  label.append(control);
  return { label, control };
};

test('a shown field error follows the field’s label, is announced and is linked from the field', () => {
  globalThis.document = new Document();
  const { label, control } = numberField(document);
  control.setAttribute('aria-describedby', 'hint');
  showFieldError(control);
  const id = `${control.id}-error`;
  assert.match(control.id, /^calculator-field-\d+$/);
  const message = document.getElementById(id);
  assert.equal(message.textContent, 'Enter an amount.');
  assert.equal(message.getAttribute('role'), 'alert');
  assert.equal(message.className, 'field-error');
  assert.equal(document.children.indexOf(message), document.children.indexOf(label) + 1);
  assert.equal(control.getAttribute('aria-invalid'), 'true');
  assert.equal(control.getAttribute('aria-describedby'), `hint ${id}`);
  showFieldError(control);
  assert.equal(document.all.filter((node) => node.id === id).length, 1, 'showing again replaces the message');
  clearFieldError(control);
  assert.equal(document.getElementById(id), null);
  assert.equal(control.getAttribute('aria-invalid'), null);
  assert.equal(control.getAttribute('aria-describedby'), 'hint');
  delete globalThis.document;
});

test('clearing the only error removes the describedby link entirely and keeps an existing id', () => {
  globalThis.document = new Document();
  const control = Object.assign(document.createElement('input'), { id: 'income', type: 'number', validity: { valueMissing: true } });
  document.append(control);
  assert.equal(ensureControlId(control), 'income');
  showFieldError(control);
  assert.equal(document.children[1].id, 'income-error', 'a field outside a label gets its message straight after it');
  clearFieldError(control);
  assert.equal(control.getAttribute('aria-describedby'), null);
  delete globalThis.document;
});

test('the first invalid control gets the error and the focus; a valid form passes', () => {
  globalThis.document = new Document();
  const valid = numberField(document, { valid: true }).control;
  const empty = numberField(document).control;
  const later = numberField(document).control;
  const date = Object.assign(document.createElement('input'), { type: 'date', value: '2017-01-01', min: '2018-07-01', max: '',
    willValidate: true, validity: { valid: true }, focus() { this.focused = true; } });
  document.append(date);
  assert.equal(reportFirstInvalid({ elements: [valid, empty, later] }), false);
  assert.equal(empty.focused, true);
  assert.equal(later.focused, false);
  assert.equal(later.getAttribute('aria-invalid'), null);
  assert.equal(reportFirstInvalid({ elements: [valid, date] }), false, 'a date before its min is invalid even if the browser passes it');
  assert.equal(document.getElementById(`${date.id}-error`).textContent, 'Enter 1 July 2018 or later.');
  assert.equal(reportFirstInvalid({ elements: [valid, { willValidate: false, validity: { valid: false } }] }), true);
  delete globalThis.document;
});

/** A rate table in its scrolling region, with row headers, and the page's clipboard. */
const ratePage = async (headers, { region = true, clipboard } = {}) => {
  const document = new Document();
  const table = document.createElement('table');
  table.className = 'rate-figures';
  const ths = headers.map((text) => Object.assign(document.createElement('th'), { textContent: text }));
  const cell = (node) => ({ ...node, cloneNode() {
    const copy = { textContent: node.textContent, querySelector: (s) => (s === '.rate-current' && node.children?.length
      ? { remove() { copy.textContent = copy.textContent.replace(' In force today', '').replace('In force today', ''); } } : null) };
    copy.textContent = node.textContent + (node.children?.length ? node.children.map((c) => c.textContent).join('') : '');
    return copy;
  } });
  table.querySelectorAll = (selector) => (selector === 'tbody th[scope="row"]' ? ths : []);
  Object.defineProperty(table, 'rows', { get: () => [{ cells: [cell({ textContent: 'Income year' }), cell({ textContent: 'Rate' })] },
    ...ths.map((th) => ({ cells: [cell(th), cell({ textContent: ' 11.5% ' })] }))] });
  if (region) {
    const scroll = document.createElement('div');
    scroll.className = 'table-scroll';
    scroll.setAttribute('aria-label', 'Super guarantee RATES');
    document.append(scroll);
    scroll.append(table);
  } else document.append(table);
  document.querySelectorAll = (selector) => (selector === 'table.rate-figures' ? [table] : []);
  globalThis.document = document;
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard }, configurable: true, writable: true });
  await import(`../assets/rate-tables.mjs?page=${Math.random()}`);
  delete globalThis.document;
  const wrap = document.all.find((node) => node.className === 'copy-wrap');
  return { document, ths, wrap, button: wrap?.children.find((node) => node.tag === 'button'),
    status: wrap?.children.find((node) => node.tag === 'p') };
};

test('only the first row in force today is marked', async () => {
  const { ths } = await ratePage(['2000-01', '1 July 2000 onwards', '1 July 2001 onwards'], { clipboard: { writeText: async () => {} } });
  assert.deepEqual(ths.map((th) => th.children.map((child) => [child.className, child.textContent])),
    [[], [['rate-current', 'In force today']], []]);
  assert.equal(ths[1].textContent, '1 July 2000 onwards ');
});

test('Copy for Excel copies the table without the in-force label and says so', async () => {
  const copied = [];
  const { wrap, button, status } = await ratePage(['2000-01', '1 July 2000 onwards'], { clipboard: { writeText: async (text) => { copied.push(text); } } });
  assert.equal(wrap.children[0].className, 'table-scroll', 'the region moves inside the wrapper');
  assert.equal(button.textContent, 'Copy for Excel');
  assert.equal(button.getAttribute('aria-label'), 'Copy for Excel: super guarantee rates');
  assert.equal(status.getAttribute('role'), 'status');
  const click = button.listeners.click();
  assert.equal(status.textContent, 'Copying table...');
  assert.equal(button.getAttribute('aria-disabled'), 'true');
  await button.listeners.click();
  await click;
  assert.deepEqual(copied, [toTabSeparated([['Income year', 'Rate'], ['2000-01', '11.5%'], ['1 July 2000 onwards', '11.5%']])],
    'a second click whilst copying is ignored');
  assert.equal(status.textContent, 'Copied. Paste into Excel to fill one cell per value.');
  assert.equal(button.getAttribute('aria-disabled'), null);
});

test('a refused clipboard write points to the CSV download', async () => {
  const { button, status } = await ratePage(['2000-01'], { clipboard: { writeText: async () => { throw new Error('denied'); } } });
  await button.listeners.click();
  assert.equal(status.textContent, 'Copy unavailable. Download the CSV below instead.');
  assert.equal(button.getAttribute('aria-disabled'), null);
});

test('no copy control without a scrolling region or a clipboard', async () => {
  assert.equal((await ratePage(['2000-01'], { region: false, clipboard: { writeText: async () => {} } })).wrap, undefined);
  assert.equal((await ratePage(['2000-01'], { clipboard: undefined })).wrap, undefined);
  assert.equal((await ratePage(['2000-01'], { clipboard: { writeText: 'no' } })).wrap, undefined);
});
