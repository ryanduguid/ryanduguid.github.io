// Does every figure a response carries match the fixed-scale pattern the
// OpenAPI schema declares for it? Absent optional values pass, because a
// branch reports only its own workings. A present value must have the
// declared type and shape: a pattern needs a matching string, an array schema
// needs an array, and an object schema needs an object that carries its
// required members. The walk follows the response's own keys, so a figure the
// schema does not declare fails: it has no declared scale to meet.
const TYPES = {
  string: (value) => typeof value === 'string',
  boolean: (value) => typeof value === 'boolean',
  array: Array.isArray,
  object: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
};

function carriesFigure(value) {
  if (typeof value === 'string') return /^-?[0-9]+(\.[0-9]+)?$/.test(value);
  if (typeof value === 'object' && value !== null) return Object.values(value).some(carriesFigure);
  return typeof value === 'number';
}

export function declaredScalesHold(schema, value) {
  if (value === undefined) return true;
  if (schema?.type && !TYPES[schema.type]?.(value)) return false;
  if (typeof schema?.pattern === 'string') return typeof value === 'string' && new RegExp(schema.pattern).test(value);
  if (schema?.items) return Array.isArray(value) && value.every((item) => declaredScalesHold(schema.items, item));
  if (!schema?.properties) return !carriesFigure(value);
  if (!TYPES.object(value)) return false;
  if ((schema.required ?? []).some((key) => value[key] === undefined)) return false;
  return Object.entries(value).every(([key, child]) => declaredScalesHold(schema.properties[key], child));
}
