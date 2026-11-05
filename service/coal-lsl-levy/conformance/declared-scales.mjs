import { decimalPattern } from '../src/openapi.mjs';

function holdsType(type, value) {
  switch (type) {
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'array': return Array.isArray(value);
    case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
    default: return false;
  }
}

// The schema publishes every response figure through decimalPattern, so a value
// holds if the pattern at its own scale is the one declared. Any other pattern
// fails: this checker cannot read it.
function holdsDecimalPattern(pattern, value) {
  if (typeof value !== 'string') return false;
  const places = /^(?:0|[1-9][0-9]*)\.([0-9]+)$/.exec(value)?.[1].length;
  return places !== undefined && pattern === decimalPattern(places);
}

function carriesFigure(value) {
  if (typeof value === 'string') return value.trim() !== '' && Number.isFinite(Number(value));
  if (typeof value === 'object' && value !== null) return Object.values(value).some(carriesFigure);
  return typeof value === 'number';
}

// Does every figure a response carries match the fixed-scale pattern the
// OpenAPI schema declares for it? Absent optional values pass, because a
// branch reports only its own workings. A present value must have the
// declared type and shape: a pattern needs a matching string, an array schema
// needs an array, and an object schema needs an object that carries its
// required members. The walk follows the response's own keys, so a figure the
// schema does not declare fails: it has no declared scale to meet.
export function declaredScalesHold(schema, value) {
  if (value === undefined) return true;
  if (schema?.type && !holdsType(schema.type, value)) return false;
  if (typeof schema?.pattern === 'string') return holdsDecimalPattern(schema.pattern, value);
  if (schema?.items) return Array.isArray(value) && value.every((item) => declaredScalesHold(schema.items, item));
  if (!schema?.properties) return !carriesFigure(value);
  if (!holdsType('object', value)) return false;
  if ((schema.required ?? []).some((key) => value[key] === undefined)) return false;
  return Object.entries(value).every(([key, child]) => declaredScalesHold(schema.properties[key], child));
}
